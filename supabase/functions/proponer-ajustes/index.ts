// Etapa 4 del ciclo de calibración: a partir de un informe ya generado,
// propone ajustes concretos al criterio del modelo (y recomendaciones
// de política de crédito, que son otra cosa y van marcadas aparte).
//
// Body esperado: { "informeId": "uuid" }
//
// Ninguna propuesta entra en vigencia sola: nacen en estado "pendiente"
// y una persona del área las aprueba, rechaza o pide cambios desde la
// app. Aprobar y poner en vigencia son además dos pasos distintos, para
// poder aprobar algo y recién activarlo después de verlo en backtesting.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { MARCO_PROPUESTAS } from "../_shared/marco-retroalimentacion.ts";
import { MARCO_INTERPRETATIVO, MARCO_VERSION } from "../_shared/marco-interpretativo.ts";
import { registrarLlamadaLlm } from "../_shared/llm-log.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_WORKSPACE_ID = Deno.env.get("ANTHROPIC_WORKSPACE_ID") ?? "";
const MODEL = "claude-sonnet-5";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type AnyRecord = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let informeId: string | undefined;
  try {
    informeId = (await req.json())?.informeId;
  } catch {
    // body inválido, se maneja abajo
  }
  if (!informeId || typeof informeId !== "string") {
    return new Response(JSON.stringify({ error: "Falta 'informeId' en el body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Falta ANTHROPIC_API_KEY en las secrets de la función" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  let actorId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    actorId = data.user?.id ?? null;
  }

  try {
    const { data: informe, error: errInforme } = await serviceClient
      .from("feedback_informes")
      .select("*")
      .eq("id", informeId)
      .maybeSingle();
    if (errInforme) throw errInforme;
    if (!informe) throw new Error("No se encontró el informe");

    // Propuestas ya rechazadas para este paquete: se le pasan al modelo
    // para que no vuelva a proponer lo mismo que el área ya descartó.
    const { data: rechazadas } = await serviceClient
      .from("feedback_propuestas")
      .select("titulo, justificacion, comentario_revisor")
      .eq("paquete_id", informe.paquete_id)
      .eq("estado", "rechazada");

    const userPayload = {
      diagnostico: informe.resultado,
      estadisticas: informe.estadisticas,
      criteriosActualesDelModelo: MARCO_INTERPRETATIVO,
      propuestasYaRechazadasPorElArea: (rechazadas ?? []).map((r: AnyRecord) => ({
        titulo: r.titulo,
        motivoDelRechazo: r.comentario_revisor ?? "sin comentario",
      })),
    };

    const inicioLlm = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        ...(ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": ANTHROPIC_WORKSPACE_ID } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        // 16000 hacía que la función se pasara del tiempo máximo de
        // Supabase (Gateway Timeout): la latencia la domina la
        // generación, y 3 propuestas concisas entran cómodas en 8000.
        max_tokens: 8000,
        system: MARCO_PROPUESTAS,
        messages: [{ role: "user", content: JSON.stringify(userPayload) }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      await registrarLlamadaLlm(serviceClient, {
        razonamiento: "activo" as const,
        maxTokens: 8000,
        funcion: "proponer-ajustes",
        modelo: MODEL,
        exito: false,
        error: `HTTP ${res.status}: ${errText.slice(0, 300)}`,
        duracionMs: Date.now() - inicioLlm,
        contexto: { informe_id: informeId },
      });
      throw new Error(`Error del LLM (HTTP ${res.status}): ${errText.slice(0, 400)}`);
    }

    const data = await res.json();
    await registrarLlamadaLlm(serviceClient, {
      razonamiento: "activo" as const,
      maxTokens: 8000,
      funcion: "proponer-ajustes",
      modelo: (data?.model as string) ?? MODEL,
      exito: data?.stop_reason !== "max_tokens",
      error: data?.stop_reason === "max_tokens" ? "respuesta cortada por límite de tokens" : null,
      stopReason: data?.stop_reason,
      uso: data?.usage,
      duracionMs: Date.now() - inicioLlm,
      requestId: data?.id,
      contexto: { informe_id: informeId },
    });
    const bloqueTexto = (data?.content as Array<{ type: string; text?: string }> | undefined)?.find((b) => b.type === "text");
    if (!bloqueTexto?.text) throw new Error(`Respuesta inesperada del LLM (stop_reason: ${data?.stop_reason})`);
    const limpio = bloqueTexto.text.trim().replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/, "").trim();

    let parsed: AnyRecord;
    try {
      parsed = JSON.parse(limpio);
    } catch (err) {
      if (data?.stop_reason === "max_tokens") throw new Error("La respuesta se cortó por límite de tokens.");
      throw new Error(`No se pudo interpretar la respuesta del LLM como JSON: ${String(err)}`);
    }

    const propuestas = Array.isArray(parsed.propuestas) ? parsed.propuestas : [];
    if (propuestas.length === 0) {
      return new Response(
        JSON.stringify({ propuestas: [], sinPropuestas: parsed.sinPropuestas ?? "El diagnóstico no da para proponer ajustes con fundamento." }),
        { headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const filas = propuestas.map((p: AnyRecord) => ({
      informe_id: informeId,
      paquete_id: informe.paquete_id,
      tipo: p.tipo === "politica_credito" ? "politica_credito" : "criterio_modelo",
      titulo: String(p.titulo ?? "Sin título"),
      justificacion: String(p.justificacion ?? ""),
      // Una propuesta de política de crédito no se aplica al modelo:
      // aunque el LLM mande texto, no se guarda como cambio aplicable.
      cambio_sugerido: p.tipo === "politica_credito" ? null : (p.cambioSugerido ? String(p.cambioSugerido) : null),
      evidencia: Array.isArray(p.evidencia) ? p.evidencia : [],
      impacto_esperado: p.impactoEsperado ? String(p.impactoEsperado) : null,
    }));

    const { data: guardadas, error: errGuardar } = await serviceClient.from("feedback_propuestas").insert(filas).select("*");
    if (errGuardar) throw errGuardar;

    await serviceClient.from("audit_log").insert({
      actor: actorId,
      action: "feedback.propuestas",
      meta: { informe_id: informeId, generadas: guardadas.length, marco: MARCO_VERSION },
    });

    return new Response(JSON.stringify({ propuestas: guardadas }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err);
    return new Response(JSON.stringify({ error: mensaje }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
