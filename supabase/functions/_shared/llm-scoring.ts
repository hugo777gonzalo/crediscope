// Motor de scoring real: le pasa el StandardClientProfile (ya calculado
// / procesado, ver process.ts — NO el ClientContext casi crudo de antes)
// y el marco interpretativo (ver marco-interpretativo.ts) a Claude, y
// este devuelve un score APROXIMADO (1-999) + pros/contras + razonamiento.
// A propósito no es determinístico — ver la nota de diseño en types.ts
// sobre por qué el scoring vive acá y no en un motor de reglas, y
// controles-bloqueo.ts para lo poco que SÍ se resuelve determinísticamente.
//
// CASCADA DE MODELOS (decidido con datos, no por intuición). Se valuó
// Haiku contra Sonnet sobre 36 clientes reales elegidos por contraste:
//   - negar:    11 de 11 iguales  (Haiku nunca ablandó una negación)
//   - aprobar:   5 de 5  iguales
//   - revisar:  10 de 18 iguales  (7 pasaron a "aprobar")
//   - observar:  0 de 2           (Haiku no usa esa etiqueta)
// Los 10 desacuerdos van TODOS hacia menos estricto, y TODOS caen con
// score de Haiku entre 520 y 745. De ahí la banda: si el caso queda en
// esa zona gris, se reanaliza con Sonnet y vale ese resultado. Los casos
// claros —que son la mitad— los resuelve Haiku igual de bien por una
// fracción del costo.
//
// Cambiar la entrada de ClientContext a StandardClientProfile redujo el
// payload de entrada considerablemente (booleanos/números en vez de
// arrays completos) — esto era necesario, no solo una optimización: con
// ClientContext + max_tokens:4000, algunos clientes con mucho historial
// seguían generando JSON cortado a medias (SyntaxError al parsear).

import type {
  ResultadoControlBloqueo,
  LlmScoringResult,
  LlamadaRealizada,
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

const MODELO_BASE = "claude-haiku-4-5-20251001";
const MODELO_ESCALAMIENTO = "claude-sonnet-5";

// Zona gris donde el modelo base y el de escalamiento discrepan (ver la
// nota de cabecera). Fuera de esta banda los dos coinciden, así que
// escalar sería pagar de más sin cambiar la decisión.
const BANDA_GRIS = { desde: 500, hasta: 760 };

// Configuración que define el grueso del costo, exportada para que el
// registro de consumo pueda explicarlo (ver llm-log.ts / 041).
// razonamiento "activo" = el modelo razona por defecto y no se le envía
// nada; ese razonamiento interno es ~70% de los tokens de salida.
export const CONFIG_LLM = { razonamiento: "activo" as const, maxTokens: 6000 };

function extraerJson(texto: string): unknown {
  const limpio = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(limpio);
}

function resultadoPorDefecto(mensaje: string, modelo: string, data?: Record<string, unknown>): LlmScoringResult {
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
    llmModel: modelo,
    llmStopReason: data?.stop_reason as string | undefined,
    llmUsage: data?.usage as Record<string, unknown> | undefined,
    llmRequestId: data?.id as string | undefined,
    llamadas: [],
  };
}

function interpretar(data: Record<string, unknown>, modelo: string): LlmScoringResult {
  // Con thinking extendido, el bloque de texto NO es necesariamente
  // content[0] (ese suele ser el bloque "thinking") — hay que buscarlo.
  const bloqueTexto = (data?.content as Array<{ type: string; text?: string }> | undefined)?.find(
    (b) => b.type === "text"
  );
  const texto = bloqueTexto?.text;
  if (typeof texto !== "string") {
    return resultadoPorDefecto(
      `respuesta inesperada del LLM (sin bloque de texto, stop_reason: ${data?.stop_reason})`,
      modelo,
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
      llmModel: (data?.model as string | undefined) ?? modelo,
      llmStopReason: data?.stop_reason as string | undefined,
      llmUsage: data?.usage as Record<string, unknown> | undefined,
      llmRequestId: data?.id as string | undefined,
      llamadas: [],
    };
  } catch (err) {
    return resultadoPorDefecto(`no se pudo interpretar la respuesta del LLM como JSON: ${String(err)}`, modelo, data);
  }
}

// Una llamada concreta al modelo. Devuelve el resultado ya interpretado
// más la metadata de consumo, que el llamador registra (ver llm-log.ts).
async function pedirScoring(
  modelo: string,
  bloquesSistema: Array<Record<string, unknown>>,
  userPayload: Record<string, unknown>
): Promise<{ resultado: LlmScoringResult; llamada: LlamadaRealizada }> {
  const inicio = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      ...(ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify({
      model: modelo,
      // El modelo razona antes de responder y ese razonamiento sale del
      // mismo presupuesto que el JSON. Con 4000 se cortaba a medias en
      // clientes con historial rico y el análisis devolvía el resultado
      // por defecto de score 500 en vez de uno real.
      max_tokens: CONFIG_LLM.maxTokens,
      system: bloquesSistema,
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    }),
  });

  const duracionMs = Date.now() - inicio;

  if (!res.ok) {
    const errText = await res.text();
    const requestId = res.headers.get("request-id") ?? res.headers.get("x-request-id") ?? "sin request-id";
    const mensaje = `error del LLM (HTTP ${res.status} ${res.statusText}, request-id=${requestId}, payload=${JSON.stringify(userPayload).length} chars): ${errText}`;
    return {
      resultado: resultadoPorDefecto(mensaje, modelo),
      llamada: { modelo, exito: false, error: mensaje.slice(0, 400), duracionMs },
    };
  }

  const data = await res.json();
  const resultado = interpretar(data, modelo);
  return {
    resultado,
    llamada: {
      modelo: (data?.model as string) ?? modelo,
      exito: !resultado.fallo,
      error: resultado.fallo ?? null,
      stopReason: data?.stop_reason,
      uso: data?.usage,
      requestId: data?.id,
      duracionMs,
    },
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
    return resultadoPorDefecto("falta ANTHROPIC_API_KEY en las secrets de la Edge Function", MODELO_BASE);
  }

  // El marco va en un bloque aparte y CACHEADO, los ajustes en otro sin
  // cachear. Son ~8.100 tokens idénticos en cada análisis: sin caché se
  // pagan completos todas las veces. Una lectura de caché cuesta ~10% de
  // procesarlo de nuevo, así que un analista que revisa varios clientes
  // seguidos paga el marco una sola vez.
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

  const base = await pedirScoring(MODELO_BASE, bloquesSistema, userPayload);
  const llamadas: LlamadaRealizada[] = [base.llamada];

  // Escala a Sonnet en 2 casos: el resultado cayó en la zona gris, o el
  // modelo base falló (ahí Sonnet actúa además de respaldo).
  const enZonaGris =
    !base.resultado.fallo && base.resultado.score >= BANDA_GRIS.desde && base.resultado.score <= BANDA_GRIS.hasta;

  if (!enZonaGris && !base.resultado.fallo) {
    return { ...base.resultado, llamadas };
  }

  const escalado = await pedirScoring(MODELO_ESCALAMIENTO, bloquesSistema, userPayload);
  llamadas.push({ ...escalado.llamada, escalamiento: true });

  // Si el escalamiento también falla, vale lo que haya dado el base
  // (aunque sea el resultado por defecto): nunca se pierde el análisis
  // por un problema del segundo modelo.
  if (escalado.resultado.fallo && !base.resultado.fallo) {
    return { ...base.resultado, llamadas };
  }
  return { ...escalado.resultado, llamadas };
}

export { MARCO_VERSION, MODELO_BASE, MODELO_ESCALAMIENTO, BANDA_GRIS };
