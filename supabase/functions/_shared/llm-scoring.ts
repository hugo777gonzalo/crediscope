// Motor de scoring real: le pasa el StandardClientProfile (ya calculado
// / procesado, ver process.ts — NO el ClientContext casi crudo de antes)
// y el marco interpretativo (ver marco-interpretativo.ts) a Claude, y
// este devuelve un score APROXIMADO (1-999) + pros/contras + razonamiento.
// A propósito no es determinístico — ver la nota de diseño en types.ts
// sobre por qué el scoring vive acá y no en un motor de reglas, y
// controles-bloqueo.ts para lo poco que SÍ se resuelve determinísticamente.
//
// Cambiar la entrada de ClientContext a StandardClientProfile redujo el
// payload de entrada considerablemente (booleanos/números en vez de
// arrays completos) — esto era necesario, no solo una optimización: con
// ClientContext + max_tokens:4000, algunos clientes con mucho historial
// seguían generando JSON cortado a medias (SyntaxError al parsear).

import type { ResultadoControlBloqueo, LlmScoringResult, RecomendacionAccion } from "./types.ts";
import { MARCO_VERSION, MARCO_INTERPRETATIVO } from "./marco-interpretativo.ts";

const RECOMENDACIONES_VALIDAS: RecomendacionAccion[] = ["aprobar", "revisar", "observar", "negar"];

// Si el LLM devuelve algo fuera de la lista (o nada), se cae a
// "revisar" — el valor más conservador: no aprueba ni rechaza solo,
// deja el caso en manos del analista.
function normalizarRecomendacion(valor: unknown): RecomendacionAccion {
  const limpio = String(valor ?? "").trim().toLowerCase();
  return (RECOMENDACIONES_VALIDAS as string[]).includes(limpio) ? (limpio as RecomendacionAccion) : "revisar";
}

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
// Solo hace falta si la API key es de las "vinculadas a identidad"
// (pertenece a varios workspaces de la organización) — Anthropic exige
// indicar en cuál actuar. Con una key de un solo workspace, dejar vacío.
const ANTHROPIC_WORKSPACE_ID = Deno.env.get("ANTHROPIC_WORKSPACE_ID") ?? "";
const MODEL = "claude-sonnet-5";

function extraerJson(texto: string): unknown {
  const limpio = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(limpio);
}

function resultadoPorDefecto(mensaje: string, data?: Record<string, unknown>): LlmScoringResult {
  return {
    score: 500,
    // Sin respuesta del LLM no hay juicio posible: queda en manos del
    // analista, nunca en "aprobar" por defecto.
    recomendacion: "revisar",
    positives: [],
    negatives: [],
    missingInfo: [`No se pudo obtener el scoring del LLM: ${mensaje}`],
    reasoning: mensaje,
    llmModel: MODEL,
    llmStopReason: data?.stop_reason as string | undefined,
    llmUsage: data?.usage as Record<string, unknown> | undefined,
    llmRequestId: data?.id as string | undefined,
  };
}

// profile: normalmente un StandardClientProfile, pero puede llegar con
// campos deshabilitados redactados a null (ver runtime-config.ts
// redactDisabledFields) — por eso el tipo es laxo acá, ya no es el
// StandardClientProfile completo garantizado.
export async function scoreWithLlm(
  profile: Record<string, unknown>,
  controlBloqueo: ResultadoControlBloqueo,
  // Ajustes al criterio aprobados y puestos en vigencia por el área de
  // Crédito/Riesgos (ver runtime-config.ts loadAjustesVigentes). Se
  // suman al marco base en vez de reescribirlo: el criterio original
  // sigue versionado en código y cada ajuste es reversible por
  // separado.
  ajustesVigentes: string[] = []
): Promise<LlmScoringResult> {
  if (!ANTHROPIC_API_KEY) {
    return resultadoPorDefecto("falta ANTHROPIC_API_KEY en las secrets de la Edge Function");
  }

  const marco = ajustesVigentes.length
    ? `${MARCO_INTERPRETATIVO}

AJUSTES APROBADOS POR EL ÁREA DE CRÉDITO/RIESGOS
Los siguientes criterios se incorporaron a partir del análisis de
resultados reales. Tienen el mismo peso que el resto del marco:
${ajustesVigentes.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
    : MARCO_INTERPRETATIVO;

  const userPayload = {
    standardClientProfile: profile,
    hallazgosControlBloqueo: controlBloqueo.hallazgos, // ya resueltos de forma determinística — no recalcular
  };

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
      // El modelo usa "thinking" extendido automáticamente antes de
      // responder (confirmado: ~800 tokens de thinking con un contexto
      // real de tamaño normal) — el presupuesto tiene que cubrir eso Y
      // el JSON completo de salida, si no la respuesta se corta a medias.
      max_tokens: 4000,
      system: marco,
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const requestId = res.headers.get("request-id") ?? res.headers.get("x-request-id") ?? "sin request-id";
    return resultadoPorDefecto(
      `error del LLM (HTTP ${res.status} ${res.statusText}, request-id=${requestId}, payload=${JSON.stringify(userPayload).length} chars): ${errText}`
    );
  }

  const data = await res.json();
  // Con thinking extendido, el bloque de texto NO es necesariamente
  // content[0] (ese suele ser el bloque "thinking") — hay que buscarlo.
  const bloqueTexto = (data?.content as Array<{ type: string; text?: string }> | undefined)?.find(
    (b) => b.type === "text"
  );
  const texto = bloqueTexto?.text;
  if (typeof texto !== "string") {
    return resultadoPorDefecto(
      `respuesta inesperada del LLM (sin bloque de texto, stop_reason: ${data?.stop_reason})`,
      data
    );
  }

  try {
    const parsed = extraerJson(texto) as Partial<LlmScoringResult>;
    const score = Math.max(1, Math.min(999, Math.round(Number(parsed.score) || 500)));
    return {
      score,
      recomendacion: normalizarRecomendacion(parsed.recomendacion),
      positives: Array.isArray(parsed.positives) ? parsed.positives.map(String) : [],
      negatives: Array.isArray(parsed.negatives) ? parsed.negatives.map(String) : [],
      missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo.map(String) : [],
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      llmModel: (data?.model as string | undefined) ?? MODEL,
      llmStopReason: data?.stop_reason,
      llmUsage: data?.usage,
      llmRequestId: data?.id,
    };
  } catch (err) {
    return resultadoPorDefecto(`no se pudo interpretar la respuesta del LLM como JSON: ${String(err)}`, data);
  }
}

export { MARCO_VERSION };
