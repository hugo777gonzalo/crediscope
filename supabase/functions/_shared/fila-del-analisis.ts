// La fila de analysis_results de un análisis, en un solo lugar.
//
// La arman analyze-client (un cliente desde la pantalla) y
// scripts/analizar-en-lote.mjs (la API de lotes de Anthropic, 2026-10-03).
// Dos copias de esto es como un análisis en lote termina guardado distinto
// que uno de la pantalla: un bloqueo que no fuerza el score, o un fallo que
// se lee como criterio.

import type { LlmScoringResult, ResultadoControlBloqueo } from "./types.ts";
import { clasificarFallo } from "./fallos-llm.ts";

export interface DatosDelAnalisis {
  runId: string;
  clientId: string;
  clientProfileId: string;
  // La versión del marco va en rules_version: sin ella, un resultado raro no
  // se puede auditar después. criterio_version_id quedó de cuando había
  // ajustes del criterio (retirados el 2026-10-06): los análisis nuevos lo
  // dejan vacío.
  marcoVersion: string;
  llmResult: LlmScoringResult;
  controlBloqueo: ResultadoControlBloqueo;
  // null si se reutilizó un perfil guardado (no hubo ingesta).
  duracionIngestaMs: number | null;
  // null si se reutilizó un análisis (no hubo llamada al modelo).
  duracionLlmMs: number | null;
  // El análisis cuyo resultado se copió porque el pedido al modelo era
  // idéntico (E1 de la auditoría externa, 119). Siempre el original: un
  // análisis reutilizado nunca es el origen de otro.
  reutilizaAnalisisId?: string | null;
}

export function filaDelAnalisis(d: DatosDelAnalisis) {
  const { llmResult, controlBloqueo } = d;
  // Un control de bloqueo bloqueante no se delega al criterio del LLM
  // (marco-interpretativo.ts v14): fuerza el score y la recomendación.
  const score = controlBloqueo.bloqueado ? 1 : llmResult.score;
  const recomendacion = controlBloqueo.bloqueado ? "negar" : llmResult.recomendacion;
  return {
    ingestion_run_id: d.runId,
    client_id: d.clientId,
    crediscope_score: score,
    recomendacion,
    // Etiquetas de lectura rápida (marco-v15). Se guardan tal cual las dio
    // el modelo: un control de bloqueo fuerza el score y la recomendación,
    // pero no el diagnóstico -- si el historial de pago era excelente, sigue
    // siéndolo aunque el caso se niegue por una lista de control.
    indicador_riesgo: llmResult.indicadorRiesgo,
    indicador_historial: llmResult.indicadorHistorial,
    // Las acciones se guardan aunque haya bloqueo: saber qué habría que
    // verificar sigue sirviendo (un homónimo en listas, por ejemplo, se
    // despeja verificando identidad).
    acciones_sugeridas: llmResult.accionesSugeridas,
    rules_version: d.marcoVersion,
    // Con qué data estructurada exactamente se evaluó. Antes se cruzaba por
    // cercanía de fecha, que es ambiguo con dos consultas el mismo día (032).
    client_profile_id: d.clientProfileId,
    positives: llmResult.positives,
    negatives: llmResult.negatives,
    missing_info: llmResult.missingInfo,
    inconsistencies: controlBloqueo.hallazgos.map((h) => h.message),
    // Si el análisis falló, el resumen queda vacío: lo que había ahí era el
    // texto crudo del error de la API, y en pantalla se leía como si fuera
    // el criterio sobre el cliente.
    narrative_summary: llmResult.fallo ? null : llmResult.reasoning,
    fallo: llmResult.fallo ?? null,
    fallo_tipo: llmResult.fallo ? clasificarFallo(llmResult.fallo, llmResult.llmStopReason).tipo : null,
    // Quién decidió. Un control de bloqueo niega por una regla nuestra y
    // eso vale aunque el proveedor del modelo esté caído: ahí hay
    // veredicto, y esconderlo detrás de "no se pudo analizar" sería perder
    // una respuesta correcta.
    veredicto_origen: controlBloqueo.bloqueado ? "control_bloqueo" : llmResult.fallo ? "sin_veredicto" : "modelo",
    llm_model: llmResult.llmModel,
    llm_stop_reason: llmResult.llmStopReason,
    llm_usage: llmResult.llmUsage,
    llm_request_id: llmResult.llmRequestId,
    mensaje_al_modelo: llmResult.mensajeAlModelo ?? null,
    duracion_ingesta_ms: d.duracionIngestaMs,
    duracion_llm_ms: d.duracionLlmMs,
    huella_pedido: llmResult.huellaPedido ?? null,
    reutiliza_analisis_id: d.reutilizaAnalisisId ?? null,
  };
}

// Lo que se lee de un análisis guardado para reutilizarlo.
export const COLUMNAS_PARA_REUTILIZAR =
  "id, reutiliza_analisis_id, crediscope_score, recomendacion, acciones_sugeridas, indicador_riesgo, indicador_historial, positives, negatives, missing_info, narrative_summary, llm_model, llm_stop_reason, mensaje_al_modelo, huella_pedido, veredicto_origen";

// El resultado del modelo, rearmado desde un análisis guardado con la misma
// huella, para pasarlo por filaDelAnalisis igual que uno nuevo. El score y
// la recomendación guardados son los del modelo salvo con un bloqueo, que
// los fuerza; como el bloqueo sale de los hallazgos y los hallazgos van en
// el pedido, la misma huella trae el mismo bloqueo y el forzado da igual.
// Sin uso ni id de pedido: no hubo llamada que registrar.
// deno-lint-ignore no-explicit-any
export function resultadoReutilizado(previo: any): LlmScoringResult {
  return {
    score: previo.crediscope_score,
    recomendacion: previo.recomendacion,
    accionesSugeridas: previo.acciones_sugeridas ?? [],
    indicadorRiesgo: previo.indicador_riesgo,
    indicadorHistorial: previo.indicador_historial,
    positives: previo.positives ?? [],
    negatives: previo.negatives ?? [],
    missingInfo: previo.missing_info ?? [],
    reasoning: previo.narrative_summary ?? "",
    llmModel: previo.llm_model,
    llmStopReason: previo.llm_stop_reason ?? undefined,
    llamadas: [],
    mensajeAlModelo: previo.mensaje_al_modelo ?? undefined,
    huellaPedido: previo.huella_pedido,
  };
}
