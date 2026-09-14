// Etapa 5 del ciclo de calibración: re-corre casos reales con el marco
// CANDIDATO (criterio actual + propuestas seleccionadas) y compara
// contra lo que el modelo dijo entonces y contra lo que realmente pasó.
//
// Body esperado: { "paqueteId": "uuid", "propuestaIds": ["uuid", ...] }
//
// DOS REGLAS QUE SOSTIENEN LA VALIDEZ DE TODO ESTO:
//
// 1. Se usa el perfil CONGELADO de la fecha del análisis original
//    (client_profiles guardado en feedback_creditos). Jamás se
//    reconsulta la fuente: el perfil de hoy ya tiene registrada la mora
//    que entonces no existía, y el modelo "acertaría" siempre.
//
// 2. Se evalúan incumplimientos Y créditos que pagaron bien, en
//    proporciones parecidas. Backtestear solo los que fallaron haría
//    que endurecer el criterio siempre parezca una mejora, sin ver el
//    costo: cuántos clientes buenos se empezarían a rechazar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { MARCO_INTERPRETATIVO, MARCO_VERSION } from "../_shared/marco-interpretativo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_WORKSPACE_ID = Deno.env.get("ANTHROPIC_WORKSPACE_ID") ?? "";
const MODEL = "claude-sonnet-5";

// Cada caso es una llamada al LLM (~25s). Los topes están puestos para
// no pasarse del tiempo máximo de la función: 10 + 10 casos en lotes de
// 10 corren en ~2 tandas.
const MAX_INCUMPLIDOS = 10;
const MAX_BUENOS = 10;
const TAMANIO_LOTE = 10;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type AnyRecord = Record<string, unknown>;

function construirMarcoCandidato(cambios: string[]): string {
  if (cambios.length === 0) return MARCO_INTERPRETATIVO;
  // Los ajustes se SUMAN al marco base en vez de reescribirlo: el
  // criterio original sigue versionado en código, y cada ajuste es
  // trazable y reversible por separado.
  return `${MARCO_INTERPRETATIVO}

AJUSTES APROBADOS POR EL ÁREA DE CRÉDITO/RIESGOS
Los siguientes criterios se incorporaron a partir del análisis de
resultados reales. Tienen el mismo peso que el resto del marco:
${cambios.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
}

async function evaluarCaso(perfil: AnyRecord, controlBloqueo: AnyRecord | null, marco: string) {
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
      // Se deja el formato de salida completo (con positivos/negativos)
      // aunque acá solo se usen score y recomendación: el backtest
      // tiene que correr en las mismas condiciones que producción, o
      // deja de ser representativo. Por eso el presupuesto es holgado:
      // con 4000 algunos casos devolvían el JSON cortado.
      max_tokens: 6000,
      system: marco,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            standardClientProfile: perfil,
            hallazgosControlBloqueo: (controlBloqueo?.hallazgos as unknown[]) ?? [],
          }),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const bloque = (data?.content as Array<{ type: string; text?: string }> | undefined)?.find((b) => b.type === "text");
  if (!bloque?.text) throw new Error(`sin bloque de texto (stop_reason: ${data?.stop_reason})`);
  const limpio = bloque.text.trim().replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/, "").trim();
  const parsed = JSON.parse(limpio);
  const bloqueado = Boolean(controlBloqueo?.bloqueado);
  return {
    score: bloqueado ? 1 : Math.max(1, Math.min(999, Math.round(Number(parsed.score) || 500))),
    recomendacion: bloqueado ? "negar" : String(parsed.recomendacion ?? "revisar"),
  };
}

// Agregados calculados en código, no por el LLM: son los números sobre
// los que el área va a decidir si el ajuste sirve.
function compararResultados(todos: AnyRecord[]) {
  // Un caso solo sirve para comparar si TENÍA recomendación antes. Los
  // análisis anteriores a marco-v14 no la tienen, y contarlos inflaría
  // la mejora: el candidato "detectaría" casos que antes no se
  // frenaban simplemente porque ese campo no existía todavía, no
  // porque el ajuste sirva. Un número inflado acá llevaría a aprobar
  // ajustes inútiles.
  const resultados = todos.filter((r) => (r.antes as AnyRecord)?.recomendacion);
  const sinComparacion = todos.length - resultados.length;

  const incumplidos = resultados.filter((r) => r.huboDefault === true);
  const buenos = resultados.filter((r) => r.huboDefault === false);
  const frena = (rec: unknown) => rec === "negar" || rec === "revisar" || rec === "observar";

  const detectadosAntes = incumplidos.filter((r) => frena((r.antes as AnyRecord)?.recomendacion)).length;
  const detectadosDespues = incumplidos.filter((r) => frena((r.despues as AnyRecord)?.recomendacion)).length;
  const buenosFrenadosAntes = buenos.filter((r) => frena((r.antes as AnyRecord)?.recomendacion)).length;
  const buenosFrenadosDespues = buenos.filter((r) => frena((r.despues as AnyRecord)?.recomendacion)).length;

  const cambioScore = resultados
    .map((r) => Number((r.despues as AnyRecord)?.score ?? 0) - Number((r.antes as AnyRecord)?.score ?? 0))
    .filter((n) => Number.isFinite(n));
  const promedioCambioScore = cambioScore.length
    ? Math.round(cambioScore.reduce((a, b) => a + b, 0) / cambioScore.length)
    : 0;

  // Señal de sobreajuste: el candidato frena a casi todos, incluidos
  // los que pagaron bien. Eso no es mejor criterio, es un modelo que
  // dejó de discriminar.
  const frenaTodo = buenos.length > 0 && buenosFrenadosDespues === buenos.length && buenosFrenadosAntes < buenos.length;

  return {
    incumplimientosEvaluados: incumplidos.length,
    buenosEvaluados: buenos.length,
    // Casos que se re-evaluaron pero no entran en la comparación por no
    // tener recomendación previa con qué contrastar.
    casosSinComparacion: sinComparacion,
    incumplimientosDetectadosAntes: detectadosAntes,
    incumplimientosDetectadosDespues: detectadosDespues,
    mejoraEnDeteccion: detectadosDespues - detectadosAntes,
    buenosFrenadosAntes,
    buenosFrenadosDespues,
    costoEnClientesBuenos: buenosFrenadosDespues - buenosFrenadosAntes,
    promedioCambioScore,
    posibleSobreajuste: frenaTodo,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let paqueteId: string | undefined;
  let propuestaIds: string[] = [];
  try {
    const body = await req.json();
    paqueteId = body?.paqueteId;
    propuestaIds = Array.isArray(body?.propuestaIds) ? body.propuestaIds : [];
  } catch {
    // body inválido, se maneja abajo
  }
  if (!paqueteId) {
    return new Response(JSON.stringify({ error: "Falta 'paqueteId' en el body" }), {
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
    let propuestas: AnyRecord[] = [];
    if (propuestaIds.length) {
      const { data, error } = await serviceClient
        .from("feedback_propuestas")
        .select("id, titulo, cambio_sugerido, tipo")
        .in("id", propuestaIds);
      if (error) throw error;
      propuestas = (data ?? []).filter((p: AnyRecord) => p.tipo === "criterio_modelo" && p.cambio_sugerido);
    }
    const marcoCandidato = construirMarcoCandidato(propuestas.map((p) => String(p.cambio_sugerido)));

    const { data: creditos, error: errCreditos } = await serviceClient
      .from("feedback_creditos")
      .select("cedula, hubo_default, desembolsado, tipo_default, analysis_results(crediscope_score, recomendacion), client_profiles(standard_profile, control_bloqueo)")
      .eq("paquete_id", paqueteId)
      .eq("desembolsado", true);
    if (errCreditos) throw errCreditos;

    const conPerfil = (creditos ?? []).filter((c: AnyRecord) => (c.client_profiles as AnyRecord | null)?.standard_profile);
    const incumplidos = conPerfil.filter((c: AnyRecord) => c.hubo_default === true).slice(0, MAX_INCUMPLIDOS);
    const buenos = conPerfil.filter((c: AnyRecord) => c.hubo_default === false).slice(0, MAX_BUENOS);
    const seleccion = [...incumplidos, ...buenos];
    if (seleccion.length === 0) {
      throw new Error("No hay créditos desembolsados con perfil congelado para evaluar en este paquete");
    }

    const resultados: AnyRecord[] = [];
    for (let i = 0; i < seleccion.length; i += TAMANIO_LOTE) {
      const lote = seleccion.slice(i, i + TAMANIO_LOTE);
      const evaluados = await Promise.all(
        lote.map(async (c: AnyRecord) => {
          const perfilRow = c.client_profiles as AnyRecord;
          const analisis = c.analysis_results as AnyRecord | null;
          try {
            const despues = await evaluarCaso(
              perfilRow.standard_profile as AnyRecord,
              (perfilRow.control_bloqueo as AnyRecord | null) ?? null,
              marcoCandidato
            );
            return {
              cedula: c.cedula,
              huboDefault: c.hubo_default,
              tipoDefault: c.tipo_default,
              antes: { score: analisis?.crediscope_score ?? null, recomendacion: analisis?.recomendacion ?? null },
              despues,
            };
          } catch (err) {
            return {
              cedula: c.cedula,
              huboDefault: c.hubo_default,
              tipoDefault: c.tipo_default,
              antes: { score: analisis?.crediscope_score ?? null, recomendacion: analisis?.recomendacion ?? null },
              despues: null,
              error: String(err),
            };
          }
        })
      );
      resultados.push(...evaluados);
    }

    const evaluadosOk = resultados.filter((r) => r.despues);
    const comparativa = compararResultados(evaluadosOk);

    const { data: backtest, error: errBacktest } = await serviceClient
      .from("feedback_backtests")
      .insert({
        paquete_id: paqueteId,
        propuestas_aplicadas: propuestas.map((p) => ({ id: p.id, titulo: p.titulo })),
        resultados,
        comparativa: { ...comparativa, casosConError: resultados.length - evaluadosOk.length },
        casos_evaluados: evaluadosOk.length,
        marco_version: MARCO_VERSION,
        generado_por: actorId,
      })
      .select("*")
      .single();
    if (errBacktest) throw errBacktest;

    await serviceClient.from("audit_log").insert({
      actor: actorId,
      action: "feedback.backtest",
      meta: { paquete_id: paqueteId, backtest_id: backtest.id, propuestas: propuestas.length, casos: evaluadosOk.length },
    });

    return new Response(JSON.stringify(backtest), {
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
