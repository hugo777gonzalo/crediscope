// Reutilizar un análisis (auditoría externa del 2026-10-09, E1): el
// resultado rearmado desde la fila guardada tiene que dar la misma decisión
// que dio el original, con y sin bloqueo.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { filaDelAnalisis, resultadoReutilizado } from "./fila-del-analisis.ts";
import type { LlmScoringResult, ResultadoControlBloqueo } from "./types.ts";

const respuesta: LlmScoringResult = {
  score: 712,
  recomendacion: "aprobar",
  accionesSugeridas: ["Pedir el rol de pagos"],
  indicadorRiesgo: "bajo",
  indicadorHistorial: "bueno",
  positives: ["Aporta al IESS hace 6 años"],
  negatives: [],
  missingInfo: [],
  reasoning: "Ingreso estable.",
  llmModel: "claude-sonnet-5-5",
  llmStopReason: "end_turn",
  llmUsage: { output_tokens: 900 },
  llmRequestId: "req_1",
  llamadas: [],
  mensajeAlModelo: { perfilDelModelo: {}, hallazgosControlBloqueo: [] },
  huellaPedido: "a".repeat(64),
};

const datos = (llmResult: LlmScoringResult, controlBloqueo: ResultadoControlBloqueo, reutilizaAnalisisId: string | null = null) => ({
  runId: "run",
  clientId: "cliente",
  clientProfileId: "perfil",
  marcoVersion: "marco-v28",
  llmResult,
  controlBloqueo,
  duracionIngestaMs: null,
  duracionLlmMs: reutilizaAnalisisId ? null : 20_000,
  reutilizaAnalisisId,
});

const DECISION = ["crediscope_score", "recomendacion", "indicador_riesgo", "indicador_historial", "acciones_sugeridas", "positives", "negatives", "narrative_summary", "veredicto_origen", "huella_pedido", "mensaje_al_modelo"] as const;

const controles: Array<[string, ResultadoControlBloqueo]> = [
  ["sin bloqueo", { bloqueado: false, hallazgos: [] }],
  ["con bloqueo", { bloqueado: true, hallazgos: [{ code: "fallecido", message: "Consta como fallecido", bloqueante: true }] } as ResultadoControlBloqueo],
];

for (const [nombre, control] of controles) {
  Deno.test(`el análisis reutilizado decide igual que el original (${nombre})`, () => {
    const original = { id: "original", ...filaDelAnalisis(datos(respuesta, control)) };
    const copia = filaDelAnalisis(datos(resultadoReutilizado(original), control, "original"));
    for (const columna of DECISION) assertEquals(copia[columna], original[columna], columna);
    assertEquals(copia.reutiliza_analisis_id, "original");
    // Sin llamada no hay uso ni id de pedido que registrar.
    assertEquals(copia.llm_usage, undefined);
    assertEquals(copia.llm_request_id, undefined);
    assertEquals(copia.duracion_llm_ms, null);
  });
}
