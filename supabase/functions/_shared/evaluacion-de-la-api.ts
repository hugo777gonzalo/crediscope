// De una solicitud (y su análisis y su perfil) a la `Evaluacion` de la
// especificación de la API (api/openapi.yaml): lo que lee `GET /evaluaciones/{id}`.
//
// Función pura. Lo que decide acá, y por qué:
//
// - El resultado se arma sólo con lo que la especificación nombra. Un campo que
//   no está en `Resultado` no sale, aunque la fila lo tenga: la fila guarda el
//   mensaje que leyó el modelo (que puede traer datos de la persona) y no se
//   entrega.
// - Con la consulta parcial (`completitud: parcial`: faltó una secundaria de peso,
//   `calidad-de-la-consulta.ts`), la recomendación nunca es «aprobar», como mucho
//   «revisar» (decisión D6 de la propuesta de la API). El análisis guardado no se
//   toca: la regla es de la entrega.
// - `sin_veredicto` (el modelo no estuvo disponible) devuelve score y
//   recomendación `null`; nunca un valor por defecto (CLAUDE.md: los huecos se
//   dicen, no se disimulan).
// - El texto del modelo se recorta a lo que la especificación promete (1.000
//   caracteres por frase, 20.000 el razonamiento), para que una respuesta larga
//   no rompa a quien valida contra el contrato.

import { completitudDeLaConsulta, recomendacionDeLaEntrega } from "./calidad-de-la-consulta.ts";
import { disponibilidadPorTema, TEMAS_QUE_CUBRE_EL_BURO } from "./perfil-del-modelo.ts";
import { estadoDeLaApi, etapaDeLaApi, type FilaDeLaCola, idDeLaEvaluacion, segundosParaVolver } from "./cola-de-evaluaciones.ts";
import { type CodigoDeFallo, MODALIDADES_VERSION } from "./modalidades.ts";

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

export const VERSION_DE_LA_API = "1.0.0";

const VARIABILIDAD_DECLARADA = "El mismo perfil analizado dos veces puede variar unos 40 puntos.";

const RECOMENDACIONES = ["aprobar", "revisar", "negar"];
const RIESGOS = ["muy bajo", "bajo", "moderado", "alto", "muy alto"];
const HISTORIALES = ["excelente", "bueno", "regular", "malo", "sin historial"];

const recortar = (v: unknown, max: number): string | null => (typeof v === "string" ? (v.length > max ? v.slice(0, max) : v) : null);
const frases = (v: unknown, max: number, tope = 200): string[] => (Array.isArray(v) ? v.map((x) => recortar(x, max)).filter((x): x is string => x !== null).slice(0, tope) : []);
const enLista = (v: unknown, lista: string[]): string | null => (typeof v === "string" && lista.includes(v) ? v : null);

export interface DatosDeLaEvaluacion {
  solicitud: Fila;
  analisis: Fila | null;
  /** client_profiles: created_at, structure_version, standard_profile, control_bloqueo, estado_por_fuente. */
  perfil: Fila | null;
  /** Si la evaluación usó el buró de la institución: sus temas cuentan como consultados. */
  conBuro: boolean;
  ahora?: Date;
}

export function disponibilidadDeLaEvaluacion(perfil: Fila | null, conBuro: boolean) {
  const d = disponibilidadPorTema(perfil?.standard_profile ?? null, conBuro ? TEMAS_QUE_CUBRE_EL_BURO : []) as { temasNoConsultados: string[] } | null;
  if (!d) return null;
  // De la tabla de fuentes y no de los temas: el modelo no lee Equifax con el
  // interruptor apagado, y un tema que el buró cubre decía «completa» sin serlo.
  return { completitud: completitudDeLaConsulta(perfil?.estado_por_fuente), temasNoConsultados: d.temasNoConsultados };
}

function resultadoDelAnalisis(d: DatosDeLaEvaluacion, completitud: string | null) {
  const { solicitud: s, analisis: a, perfil } = d;
  const sinVeredicto = !a || a.veredicto_origen === "sin_veredicto";
  const recomendacion = recomendacionDeLaEntrega(sinVeredicto ? null : enLista(a.recomendacion, RECOMENDACIONES), completitud);
  const control = perfil?.control_bloqueo ?? null;
  return {
    score: sinVeredicto || !Number.isInteger(a.crediscope_score) ? null : a.crediscope_score,
    recomendacion,
    veredictoOrigen: a ? (["modelo", "control_bloqueo", "sin_veredicto"].includes(a.veredicto_origen) ? a.veredicto_origen : "sin_veredicto") : "sin_veredicto",
    indicadorRiesgo: sinVeredicto ? null : enLista(a.indicador_riesgo, RIESGOS),
    indicadorHistorial: sinVeredicto ? null : enLista(a.indicador_historial, HISTORIALES),
    positivos: frases(a?.positives, 1000),
    negativos: frases(a?.negatives, 1000),
    informacionFaltante: frases(a?.missing_info, 1000),
    accionesSugeridas: frases(a?.acciones_sugeridas, 1000, 5),
    razonamiento: sinVeredicto ? null : recortar(a.narrative_summary, 20000),
    controlesDeBloqueo: {
      bloqueado: control?.bloqueado === true,
      hallazgos: (Array.isArray(control?.hallazgos) ? control.hallazgos : []).map((h: Fila) => ({ codigo: h.code, mensaje: String(h.message ?? ""), bloqueante: h.bloqueante === true })),
    },
    capacidadDePago: s.resultado?.capacidad ?? null,
    requiereRevisionHumana: true,
  };
}

export function armarEvaluacion(d: DatosDeLaEvaluacion): Fila {
  const { solicitud: s, analisis: a, perfil } = d;
  const ahora = d.ahora ?? new Date();
  const fila = s as unknown as FilaDeLaCola;
  const estado = estadoDeLaApi(fila);
  const disponibilidad = disponibilidadDeLaEvaluacion(perfil, d.conBuro);
  const fallido = (s.pasos ?? []).find((p: Fila) => p.estado === "fallido");

  const salida: Fila = {
    id: idDeLaEvaluacion(s.id),
    estado,
    modalidad: s.modalidad,
    ...(estado === "en_proceso" ? { etapa: etapaDeLaApi(fila, ahora) } : {}),
    referencia: s.referencia,
    recibidaEl: new Date(s.creada_el).toISOString(),
    ...(s.terminada_el ? { terminadaEl: new Date(s.terminada_el).toISOString() } : {}),
    plazoHasta: new Date(s.plazo_hasta ?? s.creada_el).toISOString(),
    ...(s.reemplaza_a ? { reemplazaA: idDeLaEvaluacion(s.reemplaza_a) } : {}),
  };

  if (estado === "completada") {
    salida.resultado = resultadoDelAnalisis(d, disponibilidad?.completitud ?? null);
    if (disponibilidad) salida.disponibilidad = disponibilidad;
  }
  if (estado === "fallida") {
    salida.fallo = { codigo: (s.fallo_codigo ?? fallido?.codigo ?? "error_interno") as CodigoDeFallo, ...(fallido?.detalle ? { detalle: String(fallido.detalle) } : {}) };
  }
  // Las versiones y la trazabilidad dicen con qué se analizó: sólo hay algo que decir
  // cuando hubo un análisis. En una evaluación fallida no hay marco ni modelo, y
  // la especificación no pide inventarlos.
  if (estado === "completada") {
    salida.versiones = {
      api: VERSION_DE_LA_API,
      marco: a?.rules_version ?? null,
      estructura: perfil?.structure_version ?? null,
      fuentesIngreso: perfil?.standard_profile?.fuentesIngreso?.version ?? null,
      modelo: a?.llm_model ?? null,
    };
    const huella = typeof a?.huella_pedido === "string" && /^[0-9a-f]{64}$/.test(a.huella_pedido) ? `sha256:${a.huella_pedido}` : null;
    salida.trazabilidad = {
      consultadaEl: perfil?.created_at ? new Date(perfil.created_at).toISOString() : null,
      analizadaEl: a?.created_at ? new Date(a.created_at).toISOString() : null,
      perfilReutilizado: s.resultado?.perfil?.reutilizado === true,
      analisisReutilizado: Boolean(a?.reutiliza_analisis_id),
      huellaDelPedidoAlModelo: huella,
    };
    salida.variabilidadDeclarada = VARIABILIDAD_DECLARADA;
  }
  return salida;
}

// Los encabezados que acompañan a una evaluación en proceso.
export function esperaDeLaEvaluacion(s: Fila, ahora: Date = new Date()): number {
  return segundosParaVolver(etapaDeLaApi(s as unknown as FilaDeLaCola, ahora));
}

export { MODALIDADES_VERSION };
