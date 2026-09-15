// El vigía: comprueba cada tanto que el servicio esté en pie, aunque
// nadie lo esté usando.
//
// POR QUÉ HACE FALTA
//
// Sin tráfico, "cero fallas" y "el servicio está caído" son el mismo
// dato. La madrugada del 2026-09-11 el proveedor de IA devolvió 500,
// 500, 520 y 500 en seis minutos; lo supimos dos días después, y solo
// porque alguien casualmente estaba consultando en ese momento. Si
// hubiera pasado a las 4 de la mañana de un domingo, no habría quedado
// ningún registro de que el servicio no funcionaba.
//
// QUÉ COMPRUEBA
//
// Las dos cosas de las que depende una consulta y que no controlamos:
//
//   llm            una llamada mínima al modelo. Con un tope de 1 token
//                  de respuesta cuesta centésimas de centavo, y aun así
//                  ejercita el circuito completo: red, credencial,
//                  espacio de trabajo y tope de consumo. No usa el marco
//                  interpretativo -- mandarlo costaría diez mil tokens
//                  por chequeo y no probaría nada más.
//
//   fuente_datos   un pedido de token a la fuente. No consulta a
//                  ninguna persona: verifica el acceso sin tocar datos
//                  de nadie ni ensuciar la auditoría de consultas.
//
// QUÉ DEJA
//
// El estado actual de cada componente y, cuando algo se cae, un
// incidente abierto que se cierra solo al volver. El incidente es la
// unidad correcta: cuatro fallas en seis minutos son UN corte de seis
// minutos, y eso es lo que se compromete en un acuerdo de servicio.
//
// Los chequeos del modelo se registran en llm_llamadas como cualquier
// otra llamada, marcados como prueba: su costo es real y tiene que
// aparecer en Costos junto al resto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { registrarLlamadaLlm } from "../_shared/llm-log.ts";
import { clasificarFallo } from "../_shared/fallos-llm.ts";
import { probarFuenteDeDatos } from "../_shared/novadata-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_WORKSPACE_ID = Deno.env.get("ANTHROPIC_WORKSPACE_ID") ?? "";
const VIGIA_CLAVE = Deno.env.get("VIGIA_CLAVE") ?? "";

// El mismo modelo que atiende la mayoría de las consultas reales: el
// chequeo tiene que ejercitar el camino que de verdad se usa.
const MODELO_VIGIA = "claude-haiku-4-5-20251001";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Chequeo = {
  componente: string;
  ok: boolean;
  falloTipo: string | null;
  error: string | null;
  duracionMs: number;
  responsable: string | null;
};

async function chequearLlm(): Promise<Chequeo> {
  const inicio = Date.now();
  let ok = false;
  let error: string | null = null;
  let uso: Record<string, unknown> | undefined;
  let stopReason: string | undefined;
  let requestId: string | undefined;
  let modelo = MODELO_VIGIA;

  if (!ANTHROPIC_API_KEY) {
    error = "falta ANTHROPIC_API_KEY en las secrets de la Edge Function";
  } else {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          ...(ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": ANTHROPIC_WORKSPACE_ID } : {}),
        },
        // Lo más chico que sigue siendo una llamada de verdad.
        body: JSON.stringify({
          model: MODELO_VIGIA,
          max_tokens: 1,
          messages: [{ role: "user", content: "ok" }],
        }),
      });
      if (!res.ok) {
        const texto = await res.text();
        const rid = res.headers.get("request-id") ?? "sin request-id";
        error = `error del LLM (HTTP ${res.status} ${res.statusText}, request-id=${rid}): ${texto}`;
      } else {
        const data = await res.json();
        uso = data?.usage;
        stopReason = data?.stop_reason;
        requestId = data?.id;
        modelo = data?.model ?? MODELO_VIGIA;
        ok = true;
      }
    } catch (err) {
      error = `no se pudo contactar al LLM: ${String(err)}`;
    }
  }

  const duracionMs = Date.now() - inicio;
  const fallo = ok ? null : clasificarFallo(error, stopReason);

  await registrarLlamadaLlm(serviceClient, {
    funcion: "vigia",
    modelo,
    exito: ok,
    error,
    stopReason: stopReason ?? null,
    uso,
    duracionMs,
    requestId: requestId ?? null,
    contexto: { chequeo: "llm" },
    // Es consumo nuestro de verificación, no una consulta facturable.
    esPrueba: true,
    maxTokens: 1,
  });

  return {
    componente: "llm",
    ok,
    falloTipo: fallo?.tipo ?? null,
    error,
    duracionMs,
    responsable: fallo?.responsable ?? null,
  };
}

async function chequearFuente(): Promise<Chequeo> {
  const r = await probarFuenteDeDatos();
  return {
    componente: "fuente_datos",
    ok: r.ok,
    // La fuente no pasa por el catálogo del LLM: sus fallas son de red
    // o de credencial, y se distinguen por el texto del error.
    falloTipo: r.ok ? null : /HTTP 40[13]/.test(r.error ?? "") ? "credencial" : "proveedor_caido",
    error: r.error ?? null,
    duracionMs: r.duracionMs,
    responsable: r.ok ? null : /HTTP 40[13]/.test(r.error ?? "") ? "nosotros" : "proveedor",
  };
}

// Abre, sostiene o cierra el incidente de un componente según lo que
// haya dado el chequeo. Un incidente abierto de OTRA causa se cierra y
// se abre uno nuevo: pasar de "tope de consumo" a "proveedor caído" son
// dos problemas distintos con dos responsables distintos.
async function conciliarIncidente(c: Chequeo): Promise<string | null> {
  const { data: abierto } = await serviceClient
    .from("incidentes")
    .select("id, causa, chequeos_fallidos")
    .eq("componente", c.componente)
    .is("fin", null)
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ahora = new Date().toISOString();

  if (c.ok) {
    if (abierto) {
      await serviceClient.from("incidentes").update({ fin: ahora }).eq("id", abierto.id);
    }
    return null;
  }

  if (abierto && abierto.causa === c.falloTipo) {
    await serviceClient
      .from("incidentes")
      .update({
        chequeos_fallidos: (abierto.chequeos_fallidos ?? 0) + 1,
        detalle: c.error?.slice(0, 500) ?? null,
      })
      .eq("id", abierto.id);
    return abierto.id as string;
  }

  if (abierto) {
    await serviceClient.from("incidentes").update({ fin: ahora }).eq("id", abierto.id);
  }

  const { data: nuevo } = await serviceClient
    .from("incidentes")
    .insert({
      componente: c.componente,
      causa: c.falloTipo ?? "desconocido",
      detalle: c.error?.slice(0, 500) ?? null,
      responsable: c.responsable,
    })
    .select("id")
    .single();

  return (nuevo?.id as string) ?? null;
}

async function registrarEstado(c: Chequeo, incidenteId: string | null) {
  const { data: previo } = await serviceClient
    .from("servicio_estado")
    .select("estado, desde")
    .eq("componente", c.componente)
    .maybeSingle();

  const estado = c.ok ? "operativo" : "caido";
  // `desde` solo se mueve cuando el estado CAMBIA: si no, cada chequeo
  // reiniciaría el reloj y nunca se podría decir hace cuánto que algo
  // está caído.
  const cambio = !previo || previo.estado !== estado;

  await serviceClient
    .from("servicio_estado")
    .update({
      estado,
      ...(cambio ? { desde: new Date().toISOString() } : {}),
      ultimo_chequeo: new Date().toISOString(),
      ultimo_fallo_tipo: c.falloTipo,
      ultimo_error: c.error?.slice(0, 500) ?? null,
      duracion_ms: c.duracionMs,
      incidente_id: incidenteId,
    })
    .eq("componente", c.componente);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Clave propia, no la llave de servicio. El vigía lo llama el
  // programador de tareas de la base cada pocos minutos; mandar por la
  // red la llave que abre toda la base, muchas veces por hora y para
  // algo que solo necesita permiso de escribir dos tablas, es regalar
  // superficie de ataque. Esta clave se rota sola sin tocar nada más.
  const clave = req.headers.get("x-vigia-clave") ?? "";
  if (!VIGIA_CLAVE || clave !== VIGIA_CLAVE) {
    return new Response(JSON.stringify({ error: "no autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // En paralelo: son dos proveedores distintos y uno caído no debe
    // demorar el diagnóstico del otro.
    const chequeos = await Promise.all([chequearLlm(), chequearFuente()]);

    for (const c of chequeos) {
      const incidenteId = await conciliarIncidente(c);
      await registrarEstado(c, incidenteId);
    }

    return new Response(
      JSON.stringify({
        momento: new Date().toISOString(),
        chequeos: chequeos.map((c) => ({
          componente: c.componente,
          estado: c.ok ? "operativo" : "caido",
          causa: c.falloTipo,
          duracionMs: c.duracionMs,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    // Que falle el vigía no puede parecer que falló el servicio.
    return new Response(JSON.stringify({ error: `el vigía falló: ${String(err)}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
