// Motor de scoring real: le pasa el StandardClientProfile (ya calculado
// / procesado, ver process.ts — NO el ClientContext casi crudo de antes)
// y el marco interpretativo (ver marco-interpretativo.ts) a Claude, y
// este devuelve un score APROXIMADO (1-999) + pros/contras + razonamiento.
// A propósito no es determinístico — ver la nota de diseño en types.ts
// sobre por qué el scoring vive acá y no en un motor de reglas, y
// controles-bloqueo.ts para lo poco que SÍ se resuelve determinísticamente.
//
// CASCADA DE MODELOS — RETIRADA en marco-v24 (2026-09-27): desde entonces
// todo lo resuelve Sonnet (ver MODELO). Queda la historia de por qué
// existió. Se valuó
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
// Lo que esa validación no midió fue el TEXTO: en los casos claros el
// análisis que leía el analista lo escribía Haiku, y con marco-v23 salió
// en parte en inglés y con nombres de campos. Por eso se retiró.
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
import { clasificarFallo } from "./fallos-llm.ts";
import { mensajeParaElModelo } from "./perfil-del-modelo.ts";

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

// Un solo modelo desde marco-v24 (2026-09-27, decisión del negocio). La
// cascada con Haiku se había validado sólo por coincidencia de SCORES, y
// en los casos claros el texto final lo escribía Haiku: en los primeros
// análisis con v23 respondió un punto en inglés, citó nombres de campos
// ("enListaNegra=true con bloqueante=true") y escribió positivos que el
// marco prohíbe. Sonnet cuesta el doble (~$0,04 contra ~$0,02 por
// análisis, con el marco cacheado).
const MODELO = "claude-sonnet-5";

// Configuración que define el grueso del costo, exportada para que el
// registro de consumo pueda explicarlo (ver llm-log.ts / 041).
// razonamiento "activo" = el modelo razona por defecto y no se le envía
// nada; ese razonamiento interno es ~70% de los tokens de salida.
//
// maxTokens 10.000 desde el 2026-09-27. Los 6.000 se habían medido con
// la cascada, donde casi todo lo respondía Haiku (mediana 1.256). Sonnet
// usa mucho más: sus respuestas completas en 60 días tuvieron mediana
// 5.075 y máximo 5.903, al borde. Con Sonnet único, el primer análisis
// de 1715532469 gastó los 6.000 razonando y no llegó a escribir ni una
// línea de la respuesta. El techo lo pone el tiempo, no el costo (se paga
// lo que se usa): Sonnet escribe ~85 tokens por segundo, 10.000 son ~2
// minutos, y Supabase corta la respuesta de la función a los 150 s.
// Con 10.000 también se cortó: 9.362 de razonamiento (ver
// scripts/comparar-razonamiento.mjs, que mide las alternativas).
export type ConfigRazonamiento = {
  razonamiento: "activo" | "desactivado" | "adaptativo";
  // Sólo con razonamiento adaptativo: cuánto delibera el modelo.
  esfuerzo?: "low" | "medium" | "high";
  maxTokens: number;
};
export const CONFIG_LLM: ConfigRazonamiento = { razonamiento: "activo", maxTokens: 10_000 };

// Lo que cada configuración le agrega al pedido. "activo" no manda nada:
// es lo que el modelo hace por defecto.
function opcionesDeRazonamiento(config: ConfigRazonamiento): Record<string, unknown> {
  if (config.razonamiento === "desactivado") return { thinking: { type: "disabled" } };
  if (config.razonamiento === "adaptativo") {
    return { thinking: { type: "adaptive" }, output_config: { effort: config.esfuerzo ?? "medium" } };
  }
  return {};
}

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
    // Lo que ve el analista, en su idioma. El texto crudo del error
    // viaja en `fallo` y se muestra aparte, como detalle técnico.
    missingInfo: [clasificarFallo(mensaje, data?.stop_reason as string | undefined).mensajeUsuario],
    reasoning: mensaje,
    fallo: mensaje,
    llmModel: modelo,
    llmStopReason: data?.stop_reason as string | undefined,
    llmUsage: data?.usage as Record<string, unknown> | undefined,
    llmRequestId: data?.id as string | undefined,
    llamadas: [],
  };
}

export function interpretar(data: Record<string, unknown>, modelo: string): LlmScoringResult {
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
  cuerpo: Record<string, unknown>
): Promise<{ resultado: LlmScoringResult; llamada: LlamadaRealizada }> {
  const modelo = cuerpo.model as string;
  const inicio = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      ...(ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify(cuerpo),
  });

  const duracionMs = Date.now() - inicio;

  if (!res.ok) {
    const errText = await res.text();
    const requestId = res.headers.get("request-id") ?? res.headers.get("x-request-id") ?? "sin request-id";
    const largo = JSON.stringify(cuerpo.messages).length;
    const mensaje = `error del LLM (HTTP ${res.status} ${res.statusText}, request-id=${requestId}, payload=${largo} chars): ${errText}`;
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

// Reintentos ante fallas pasajeras.
//
// Un 429 o un error 5xx del proveedor no son un problema del cliente ni
// del criterio: son un mal momento. Que lleguen al analista como "no se
// pudo analizar" convierte un bache de segundos en una consulta perdida.
// La noche del 2026-09-10 el proveedor devolvió 500, 500, 520 y 500
// en seis minutos y cada uno terminó en un análisis fallido.
//
// El presupuesto total es lo que impide que el remedio sea peor: del
// otro lado hay alguien esperando frente a una pantalla, así que se
// reintenta mientras eso no se note demasiado y se abandona después.
// Para una caída larga de verdad esto no alcanza -- ahí hace falta
// encolar el pedido y resolverlo fuera de la espera del usuario.
const REINTENTOS = {
  intentosMaximos: 3,
  esperaBaseMs: 1_200,
  esperaMaximaMs: 8_000,
  presupuestoMs: 30_000,
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Espera creciente con una parte al azar: si varias consultas fallan a
// la vez, reintentar todas en el mismo instante vuelve a tumbar lo que
// se está recuperando.
function esperaDelIntento(intento: number): number {
  const crece = REINTENTOS.esperaBaseMs * Math.pow(2, intento - 1);
  return Math.min(crece, REINTENTOS.esperaMaximaMs) * (0.7 + Math.random() * 0.6);
}

async function pedirScoringConReintentos(
  cuerpo: Record<string, unknown>
): Promise<{ resultado: LlmScoringResult; llamadas: LlamadaRealizada[] }> {
  const arranque = Date.now();
  const llamadas: LlamadaRealizada[] = [];
  let ultimo: { resultado: LlmScoringResult; llamada: LlamadaRealizada } | null = null;

  for (let intento = 1; intento <= REINTENTOS.intentosMaximos; intento++) {
    ultimo = await pedirScoring(cuerpo);
    llamadas.push({ ...ultimo.llamada, intento });

    if (!ultimo.resultado.fallo) return { resultado: ultimo.resultado, llamadas };

    const fallo = clasificarFallo(ultimo.resultado.fallo, ultimo.llamada.stopReason);
    if (!fallo.reintentable) break;
    if (intento === REINTENTOS.intentosMaximos) break;

    const espera = esperaDelIntento(intento);
    if (Date.now() - arranque + espera > REINTENTOS.presupuestoMs) break;
    await dormir(espera);
  }

  return { resultado: ultimo!.resultado, llamadas };
}

// El pedido entero al modelo, en un solo lugar: el análisis y el backtest
// (correr-backtest, con los ajustes del criterio candidato) lo mandan con
// CONFIG_LLM, y scripts/comparar-razonamiento.mjs con otras
// configuraciones, sobre el mismo marco y el mismo perfil del modelo. Si
// la comparación o el backtest armaran su propio pedido, medirían otra cosa.
//
// profile: el StandardClientProfile guardado, tal cual. Lo que el modelo
// lee de él lo arma perfil-del-modelo.ts (desde marco-v23): esta función
// no recibe un perfil ya recortado, para que ningún camino pueda saltarse
// esa puerta.
export function armarPedidoScoring(
  profile: Record<string, unknown>,
  controlBloqueo: ResultadoControlBloqueo,
  ajustesVigentes: string[],
  camposDeshabilitados: Set<string>,
  config: ConfigRazonamiento = CONFIG_LLM
): Record<string, unknown> {
  // El marco va SIN caché desde el 2026-09-27. La caché dura 5 minutos y
  // la mediana entre dos análisis es de 26: en 12 escrituras desde el
  // 2026-09-15 no hubo UNA lectura. Escribirla cuesta 25% más que
  // mandarlo normal (~$0,008 por análisis tirados). Vuelve a convenir si
  // algún día se analiza en lote, varios clientes dentro de 5 minutos.
  //
  // Los ajustes van en un bloque aparte: cambian cuando el área los pone
  // en vigencia, y se leen como un agregado al marco, no como parte de él.
  const bloquesSistema: Array<Record<string, unknown>> = [{ type: "text", text: MARCO_INTERPRETATIVO }];
  if (ajustesVigentes.length) {
    bloquesSistema.push({
      type: "text",
      text: `AJUSTES APROBADOS POR EL ÁREA DE CRÉDITO/RIESGOS
Los siguientes criterios se incorporaron a partir del análisis de
resultados reales. Tienen el mismo peso que el resto del marco:
${ajustesVigentes.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    });
  }

  const userPayload = mensajeParaElModelo(profile, controlBloqueo.hallazgos, camposDeshabilitados);

  return {
    model: MODELO,
    // El modelo razona antes de responder y ese razonamiento sale del
    // mismo presupuesto que el JSON (ver CONFIG_LLM).
    max_tokens: config.maxTokens,
    ...opcionesDeRazonamiento(config),
    system: bloquesSistema,
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
  };
}

export async function scoreWithLlm(
  profile: Record<string, unknown>,
  controlBloqueo: ResultadoControlBloqueo,
  // Ajustes al criterio aprobados y puestos en vigencia por el área de
  // Crédito/Riesgos (ver runtime-config.ts loadAjustesVigentes). Se
  // suman al marco base en vez de reescribirlo: el criterio original
  // sigue versionado en código y cada ajuste es reversible por
  // separado.
  ajustesVigentes: string[] = [],
  // "grupo.campo" deshabilitados en standard_profile_field_config.
  camposDeshabilitados: Set<string> = new Set()
): Promise<LlmScoringResult> {
  if (!ANTHROPIC_API_KEY) {
    return resultadoPorDefecto("falta ANTHROPIC_API_KEY en las secrets de la Edge Function", MODELO);
  }

  const cuerpo = armarPedidoScoring(profile, controlBloqueo, ajustesVigentes, camposDeshabilitados);

  // Los reintentos de una falla pasajera ya los hace
  // pedirScoringConReintentos; con un solo modelo no hay a quién escalar.
  const { resultado, llamadas } = await pedirScoringConReintentos(cuerpo);
  return { ...resultado, llamadas };
}

export { MARCO_VERSION, MODELO };
