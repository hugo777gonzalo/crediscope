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

import type {
  ResultadoControlBloqueo,
  LlmScoringResult,
  RecomendacionAccion,
  NivelHistorial,
  NivelRiesgo,
} from "./types.ts";
import { MARCO_VERSION, MARCO_INTERPRETATIVO } from "./marco-interpretativo.ts";

const RECOMENDACIONES_VALIDAS: RecomendacionAccion[] = ["aprobar", "revisar", "observar", "negar"];
const NIVELES_RIESGO: NivelRiesgo[] = ["muy bajo", "bajo", "moderado", "alto", "muy alto"];
const NIVELES_HISTORIAL: NivelHistorial[] = ["excelente", "bueno", "regular", "malo", "sin historial"];

// Los indicadores son etiquetas cerradas (marco-v15). Si el modelo
// devuelve cualquier otra cosa se guarda null y la pantalla no muestra
// el indicador: mejor un hueco que una etiqueta inventada, que el
// analista leería como un juicio del sistema.
function normalizarNivel<T extends string>(valor: unknown, validos: T[]): T | null {
  const limpio = String(valor ?? "").trim().toLowerCase();
  return (validos as string[]).includes(limpio) ? (limpio as T) : null;
}

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

// Configuración que define el grueso del costo, exportada para que el
// registro de consumo pueda explicarlo (ver llm-log.ts / 041).
// razonamiento "activo" = el modelo razona por defecto y no se le envía
// nada; ese razonamiento interno es ~70% de los tokens de salida.
export const CONFIG_LLM = { razonamiento: "activo" as const, maxTokens: 6000 };

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
    accionesSugeridas: [],
    indicadorRiesgo: null,
    indicadorHistorial: null,
    positives: [],
    negatives: [],
    missingInfo: [`No se pudo obtener el scoring del LLM: ${mensaje}`],
    reasoning: mensaje,
    fallo: mensaje,
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

  // El marco va en un bloque aparte y CACHEADO, los ajustes en otro sin
  // cachear. Son ~5.600 tokens idénticos en cada análisis: sin caché se
  // pagan completos todas las veces, y son la mayor parte del costo
  // (medido: 9.400 tokens de entrada promedio, contra 4.000 en las
  // primeras versiones — el marco creció ronda tras ronda de auditoría).
  // Una lectura de caché cuesta ~10% de lo que cuesta procesarlo de
  // nuevo, así que un analista que revisa varios clientes seguidos paga
  // el marco una sola vez.
  //
  // Los ajustes quedan FUERA del bloque cacheado a propósito: cambian
  // cuando el área los pone en vigencia, y si estuvieran adentro cada
  // cambio invalidaría el caché del marco entero.
  const bloquesSistema: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: MARCO_INTERPRETATIVO,
      cache_control: { type: "ephemeral" },
    },
  ];
  if (ajustesVigentes.length) {
    bloquesSistema.push({
      type: "text",
      text: `AJUSTES APROBADOS POR EL ÁREA DE CRÉDITO/RIESGOS
Los siguientes criterios se incorporaron a partir del análisis de
resultados reales. Tienen el mismo peso que el resto del marco:
${ajustesVigentes.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    });
  }

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
      // Con 4000 seguía cortándose en clientes con historial rico
      // (positivos/negativos largos): el análisis devolvía el fallback
      // de score 500 en vez de un resultado real.
      max_tokens: CONFIG_LLM.maxTokens,
      system: bloquesSistema,
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
      // Tope de 5: el marco pide entre 2 y 4. Si el modelo se entusiasma
      // y devuelve una lista larga, se corta — una "recomendación" de 9
      // pasos deja de ser accionable y nadie la sigue.
      accionesSugeridas: Array.isArray(parsed.accionesSugeridas)
        ? parsed.accionesSugeridas.map(String).map((a) => a.trim()).filter(Boolean).slice(0, 5)
        : [],
      indicadorRiesgo: normalizarNivel(parsed.indicadorRiesgo, NIVELES_RIESGO),
      indicadorHistorial: normalizarNivel(parsed.indicadorHistorial, NIVELES_HISTORIAL),
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
