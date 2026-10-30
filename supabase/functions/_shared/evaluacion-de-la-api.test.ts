// De la fila de una evaluación a la `Evaluacion` de la especificación, y la ruta
// de la API. Las filas son inventadas.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { armarEvaluacion, disponibilidadDeLaEvaluacion, TEMAS_CRITICOS } from "./evaluacion-de-la-api.ts";
import { idDeLaEvaluacion } from "./cola-de-evaluaciones.ts";
import { pasosIniciales, type RegistroDePaso } from "./modalidades.ts";
import { rutaDeLaApi } from "./ruta-de-la-api.ts";

const AHORA = new Date("2026-10-21T15:00:00.000Z");
const UUID = "0192f0e3-8a1b-7c4d-9e5f-0123456789ab";

const TODAS = [
  "general", "buroCreditoSuper", "buroCreditoCoop", "basesInternas", "demandas", "denuncias", "listasControl", "listaNegra",
  "buroCreditoDiners", "retails", "creditoHipotecario", "creditoQuirografario", "deudores", "deudasFirmes", "demandasOfendido",
];
const perfil = (sinContestar: string[] = []) => ({
  created_at: "2026-10-21T14:50:00.000Z",
  structure_version: "estructura-v14",
  control_bloqueo: { bloqueado: false, hallazgos: [{ code: "pep", message: "Persona expuesta políticamente.", bloqueante: false }] },
  standard_profile: { metaConsulta: { fuentesConDatos: TODAS.filter((f) => !sinContestar.includes(f)), fuentesSinDatos: [] }, fuentesIngreso: { version: "fuentes-v10" } },
});

const hechos = (modalidad: "basico" | "pro" | "plus"): RegistroDePaso[] => pasosIniciales(modalidad).map((p) => ({ ...p, estado: "hecho" }));

const solicitud = (cambios: Record<string, unknown> = {}) => ({
  id: UUID,
  estado: "evaluada",
  modalidad: "plus",
  referencia: "SOL-2026-55555",
  creada_el: "2026-10-21T14:49:00.000Z",
  plazo_hasta: "2026-10-21T15:04:00.000Z",
  terminada_el: "2026-10-21T14:52:00.000Z",
  pasos: hechos("plus"),
  intentos: 0,
  fallo_codigo: null,
  reemplaza_a: null,
  consulta_equifax_id: "c1",
  resultado: { perfil: { reutilizado: true }, capacidad: { capacidad: { cumple: true, veredicto: "alcanza" }, simulacion: {}, montoMaximo: 9000, capacidadSoloIess: null, datos: {} } },
  ...cambios,
});

const analisis = (cambios: Record<string, unknown> = {}) => ({
  crediscope_score: 640,
  recomendacion: "aprobar",
  veredicto_origen: "modelo",
  indicador_riesgo: "bajo",
  indicador_historial: "bueno",
  positives: ["Aporta al IESS hace 6 años."],
  negatives: ["Una cooperativa con atraso."],
  missing_info: ["Ingresos fuera del IESS."],
  acciones_sugeridas: ["Pedir el rol de pagos."],
  narrative_summary: "Texto del modelo.",
  rules_version: "marco-v30",
  llm_model: "claude-sonnet-5-5",
  created_at: "2026-10-21T14:51:00.000Z",
  reutiliza_analisis_id: null,
  huella_pedido: "ab".repeat(32),
  mensaje_al_modelo: { no: "sale" },
  ...cambios,
});

Deno.test("una evaluación completada trae el resultado con los nombres de la especificación", () => {
  const e = armarEvaluacion({ solicitud: solicitud(), analisis: analisis(), perfil: perfil(), conBuro: true, ahora: AHORA });
  assertEquals(e.id, idDeLaEvaluacion(UUID));
  assertEquals(e.estado, "completada");
  assertEquals(e.modalidad, "plus");
  assertEquals(e.terminadaEl, "2026-10-21T14:52:00.000Z");
  const r = e.resultado;
  assertEquals([r.score, r.recomendacion, r.veredictoOrigen, r.indicadorRiesgo, r.indicadorHistorial], [640, "aprobar", "modelo", "bajo", "bueno"]);
  assertEquals(r.positivos, ["Aporta al IESS hace 6 años."]);
  assertEquals(r.informacionFaltante, ["Ingresos fuera del IESS."]);
  assertEquals(r.accionesSugeridas, ["Pedir el rol de pagos."]);
  assertEquals(r.razonamiento, "Texto del modelo.");
  assertEquals(r.requiereRevisionHumana, true);
  assertEquals(r.controlesDeBloqueo, { bloqueado: false, hallazgos: [{ codigo: "pep", mensaje: "Persona expuesta políticamente.", bloqueante: false }] });
  // La capacidad va aparte de la recomendación, con el sí o no.
  assertEquals(r.capacidadDePago.capacidad.cumple, true);
  assertEquals(r.capacidadDePago.montoMaximo, 9000);
});

Deno.test("lo que leyó el modelo no sale en la respuesta", () => {
  const e = armarEvaluacion({ solicitud: solicitud(), analisis: analisis(), perfil: perfil(), conBuro: true, ahora: AHORA });
  assertFalse(JSON.stringify(e).includes("mensaje_al_modelo"));
  assertFalse(JSON.stringify(e).includes('"no":"sale"'));
});

Deno.test("las versiones y la trazabilidad dicen con qué se evaluó, y la huella lleva su prefijo", () => {
  const e = armarEvaluacion({ solicitud: solicitud(), analisis: analisis(), perfil: perfil(), conBuro: true, ahora: AHORA });
  assertEquals(e.versiones, { api: "1.0.0", marco: "marco-v30", estructura: "estructura-v14", fuentesIngreso: "fuentes-v10", modelo: "claude-sonnet-5-5" });
  assertEquals(e.trazabilidad, {
    consultadaEl: "2026-10-21T14:50:00.000Z",
    analizadaEl: "2026-10-21T14:51:00.000Z",
    perfilReutilizado: true,
    analisisReutilizado: false,
    huellaDelPedidoAlModelo: "sha256:" + "ab".repeat(32),
  });
  assert(e.variabilidadDeclarada.includes("40 puntos"));
});

Deno.test("sin veredicto el score y la recomendación son nulos, nunca un valor por defecto", () => {
  const e = armarEvaluacion({ solicitud: solicitud(), analisis: analisis({ veredicto_origen: "sin_veredicto", crediscope_score: 1, recomendacion: "negar", narrative_summary: null }), perfil: perfil(), conBuro: true, ahora: AHORA });
  const r = e.resultado;
  assertEquals([r.score, r.recomendacion, r.veredictoOrigen, r.razonamiento, r.indicadorRiesgo], [null, null, "sin_veredicto", null, null]);
});

Deno.test("un control de bloqueo conserva su score y su recomendación y dice de dónde salen", () => {
  const e = armarEvaluacion({ solicitud: solicitud(), analisis: analisis({ veredicto_origen: "control_bloqueo", crediscope_score: 1, recomendacion: "negar" }), perfil: { ...perfil(), control_bloqueo: { bloqueado: true, hallazgos: [{ code: "lista_negra", message: "En la lista negra.", bloqueante: true }] } }, conBuro: true, ahora: AHORA });
  const r = e.resultado;
  assertEquals([r.score, r.recomendacion, r.veredictoOrigen, r.controlesDeBloqueo.bloqueado], [1, "negar", "control_bloqueo", true]);
});

Deno.test("con la consulta incompleta (falta un tema crítico) nunca se entrega «aprobar»", () => {
  const e = armarEvaluacion({ solicitud: solicitud({ consulta_equifax_id: null }), analisis: analisis(), perfil: perfil(["demandas"]), conBuro: false, ahora: AHORA });
  assertEquals(e.disponibilidad.completitud, "parcial");
  assert(e.disponibilidad.temasNoConsultados.includes("demandas en su contra"));
  assertEquals(e.resultado.recomendacion, "revisar");
  // «negar» y «revisar» no se tocan.
  const n = armarEvaluacion({ solicitud: solicitud({ consulta_equifax_id: null }), analisis: analisis({ recomendacion: "negar" }), perfil: perfil(["demandas"]), conBuro: false, ahora: AHORA });
  assertEquals(n.resultado.recomendacion, "negar");
});

Deno.test("un tema que no es crítico sin consultar no vuelve parcial la consulta", () => {
  const d = disponibilidadDeLaEvaluacion(perfil(["retails"]), false);
  assertEquals(d?.completitud, "completa");
  assert(d?.temasNoConsultados.includes("casas comerciales"));
});

Deno.test("con el buró de la institución, sus temas cuentan como consultados aunque Novadata no los trajera", () => {
  assertEquals(disponibilidadDeLaEvaluacion(perfil(["buroCreditoSuper", "buroCreditoCoop"]), false)?.completitud, "parcial");
  assertEquals(disponibilidadDeLaEvaluacion(perfil(["buroCreditoSuper", "buroCreditoCoop"]), true)?.completitud, "completa");
});

Deno.test("la lista de temas críticos son nombres que existen en el perfil del modelo", () => {
  // Si un nombre se escribe distinto, el tema nunca se vería faltar y la regla de «parcial» no se aplicaría.
  // Contesta una sola fuente que no es crítica: todas las críticas faltan.
  const d = disponibilidadDeLaEvaluacion(perfil(TODAS.filter((f) => f !== "retails")), false);
  for (const t of TEMAS_CRITICOS) assert(d?.temasNoConsultados.includes(t), t);
});

Deno.test("una evaluación en proceso no trae resultado y dice en qué etapa va", () => {
  const pasos = pasosIniciales("plus");
  pasos[0] = { paso: "perfil", estado: "hecho" };
  pasos[1] = { paso: "buro", estado: "en_curso", el: AHORA.toISOString() };
  const e = armarEvaluacion({ solicitud: solicitud({ estado: "en_evaluacion", pasos, terminada_el: null }), analisis: null, perfil: null, conBuro: false, ahora: AHORA });
  assertEquals([e.estado, e.etapa], ["en_proceso", "buro"]);
  assertEquals(e.resultado, undefined);
  assertEquals(e.terminadaEl, undefined);
  assertEquals(e.versiones, undefined);
});

Deno.test("una evaluación fallida trae el código y el detalle del paso, y nada del resultado", () => {
  const pasos = pasosIniciales("plus");
  pasos[0] = { paso: "perfil", estado: "fallido", detalle: "Las fuentes no respondieron.", codigo: "fuentes_no_disponibles" };
  const e = armarEvaluacion({ solicitud: solicitud({ estado: "fallida", pasos, fallo_codigo: "plazo_vencido" }), analisis: null, perfil: null, conBuro: false, ahora: AHORA });
  assertEquals(e.estado, "fallida");
  assertEquals(e.fallo, { codigo: "plazo_vencido", detalle: "Las fuentes no respondieron." });
  assertEquals(e.resultado, undefined);
  // Sin análisis no hay marco ni modelo que declarar.
  assertEquals([e.versiones, e.trazabilidad], [undefined, undefined]);
});

Deno.test("la persona que no existe en la fuente es un estado propio y no lleva fallo", () => {
  const pasos = pasosIniciales("plus");
  pasos[0] = { paso: "perfil", estado: "fallido", detalle: "La fuente no encuentra a nadie.", codigo: "identificacion_no_encontrada" };
  const e = armarEvaluacion({ solicitud: solicitud({ estado: "fallida", pasos, fallo_codigo: "identificacion_no_encontrada" }), analisis: null, perfil: null, conBuro: false, ahora: AHORA });
  assertEquals(e.estado, "persona_no_encontrada");
  assertEquals(e.fallo, undefined);
});

Deno.test("las frases del modelo se recortan a lo que promete la especificación", () => {
  const largo = "x".repeat(25000);
  const e = armarEvaluacion({ solicitud: solicitud(), analisis: analisis({ positives: [largo], narrative_summary: largo, acciones_sugeridas: Array.from({ length: 8 }, (_, i) => `a${i}`) }), perfil: perfil(), conBuro: true, ahora: AHORA });
  assertEquals(e.resultado.positivos[0].length, 1000);
  assertEquals(e.resultado.razonamiento.length, 20000);
  assertEquals(e.resultado.accionesSugeridas.length, 5);
});

Deno.test("un valor del análisis fuera de los enumerados no se entrega", () => {
  const e = armarEvaluacion({ solicitud: solicitud(), analisis: analisis({ recomendacion: "talvez", indicador_riesgo: "altísimo" }), perfil: perfil(), conBuro: true, ahora: AHORA });
  assertEquals([e.resultado.recomendacion, e.resultado.indicadorRiesgo], [null, null]);
});

Deno.test("reemplazaA sale con el formato ev_", () => {
  const e = armarEvaluacion({ solicitud: solicitud({ reemplaza_a: "0192f0e3-8a1b-7c4d-9e5f-0123456789ac" }), analisis: analisis(), perfil: perfil(), conBuro: true, ahora: AHORA });
  assertEquals(e.reemplazaA, idDeLaEvaluacion("0192f0e3-8a1b-7c4d-9e5f-0123456789ac"));
});

Deno.test("la ruta es lo que sigue a api-v1, con o sin el prefijo v1 de la especificación", () => {
  assertEquals(rutaDeLaApi("/functions/v1/api-v1/evaluaciones"), "/evaluaciones");
  assertEquals(rutaDeLaApi("/api-v1/evaluaciones/ev_X"), "/evaluaciones/ev_X");
  assertEquals(rutaDeLaApi("/api-v1/v1/evaluaciones"), "/evaluaciones");
  assertEquals(rutaDeLaApi("/api-v1/evaluaciones/"), "/evaluaciones");
  assertEquals(rutaDeLaApi("/api-v1/salud"), "/salud");
  assertEquals(rutaDeLaApi("/api-v1"), "/");
  assertEquals(rutaDeLaApi("/functions/v1/api-v1/v1x"), "/v1x");
});
