// La regla de capacidad (p2 de la revisión del análisis, aprobada por el negocio
// el 2026-11-08): un análisis no sale «aprobar» si la capacidad de pago no está
// evidenciada en lo que leyó el modelo. Baja a «revisar», y la primera acción
// sugerida dice qué falta.
//
// POR QUÉ EN EL CÓDIGO Y NO EN EL MARCO
// El marco ya lo pide («aprobar: ... la capacidad y el comportamiento de pago
// están suficientemente evidenciados») y el modelo no lo cumple. En el lote del
// 2026-10-31 (marco-v30, 247 análisis) aprobó 53, y 48 de ellas dicen en su
// propio texto que no se conoce la cuota o la capacidad. 45 de las 53 salieron
// sin razonamiento: con CONFIG_LLM.razonamiento «activo» no se manda nada y
// Sonnet 5.5 decide solo si razona (no lo hizo en 118 de los 244 pedidos del
// lote). Sin razonar aprobó el 38%; razonando, el 6%. Una regla del marco
// depende de que el modelo la lea con cuidado; ésta no.
//
// POR QUÉ SOBRE LOS DATOS Y NO SOBRE EL TEXTO DEL MODELO
// - Juzga lo mismo que leyó el modelo (`mensajeAlModelo.perfilDelModelo`).
// - Un detector de texto (el del piloto) se escapa cuando el modelo no nombra la
//   cuota: 5 de las 53 aprobaciones no la nombran y tampoco la tenían.
// - La razón sale concreta (cuánto debe y a quién) y dice qué conseguir.
// No cambia lo que lee ni lo que escribe el modelo: no es una versión del marco.
//
// QUÉ ES «EVIDENCIADA»: las dos cosas que hacen falta para comparar.
// 1. Un ingreso confirmado por un tercero (fuentesIngreso.estado «Confirmado por
//    un tercero», con monto). «Por confirmar» y «Sin determinar» no lo son: el
//    marco ya dice que ahí la capacidad no está evidenciada. Un jubilado o un
//    militar sin monto tampoco: se sabe que cobra, no cuánto.
// 2. La cuota de toda su deuda propia vigente:
//    - bancos: sin el buró de la institución, Proveedor_Info_1 no informa la
//      cuota de bancos; con Equifax, la trae (cuotaMensualConocida);
//    - cooperativas: la cuota viene con la deuda; sin ella, no se conoce;
//    - préstamos del IESS/BIESS: ninguna fuente trae la cuota (el rol de pagos
//      muestra el descuento). Cuenta con saldo (desde marco-v32): antes llegaba
//      sólo cuántos préstamos tuvo, sin decir si siguen vigentes;
//    - un tema de deuda sin respuesta: no se sabe si debe.
//    No cuentan las casas comerciales (son de su corte, julio de 2025: el marco
//    dice que no son deuda de hoy), lo que respalda como codeudor o garante (no
//    es propio) ni el Comportamiento Interno: la operación con la institución es
//    historia de pago y no entra en ningún cálculo, ni de saldo ni de cuota
//    (negocio, 2026-11-09).
// No juzga si la capacidad alcanza: eso es del modelo y de la capacidad de pago
// de la solicitud (capacidad-de-pago.ts). Sólo si hay con qué juzgarla.
//
// MEDIDO SIN MODELO (2026-11-09), sobre las 53 aprobaciones del lote del 31/10:
// - con lo que leyó el modelo (sin Equifax), baja las 53: sin la cuota de bancos
//   nadie tiene la capacidad evidenciada;
// - con la última consulta de Equifax (p4, PR #152: 246 de 247 la tienen, 17 días
//   de mediana), quedan 11: lo que falta es la cuota del IESS/BIESS (34) y el
//   ingreso (10). Contra el pago (PR #148), de las 41 aprobadas cuyo crédito
//   figura en la cartera, las 2 que hoy están en mora bajan por el
//   IESS/BIESS, y de las 8 que quedan ninguna está en mora.
// Pero Equifax trae el préstamo del BIESS, con su cuota, en 28 de esas 34: la
// cuota está en cuotaMensualConocida, sólo que el perfil del modelo no dice que
// la incluye. Si se la diera por conocida, quedarían 37 y las 2 en mora seguirían
// aprobadas: las dos tienen una cuota conocida mayor que su ingreso reportado al
// IESS, y eso ya no es falta de evidencia sino de capacidad.

import type { LlmScoringResult } from "./types.ts";

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

export type MotivoSinCapacidad =
  | "ingreso_sin_confirmar"
  | "deuda_sin_respuesta"
  | "cuota_bancos"
  | "cuota_cooperativas"
  | "cuota_buro"
  | "cuota_iess_biess";

export interface Faltante {
  motivo: MotivoSinCapacidad;
  // Para las cuotas: con quién es la deuda, como sigue a «su deuda con», y cuánto
  // debe (null si no se sabe).
  acreedor?: string;
  saldo?: number | null;
  // El estado del ingreso o los temas sin respuesta, para la acción.
  detalle?: string;
}

export interface CapacidadEvidenciada {
  evidenciada: boolean;
  faltantes: Faltante[];
}

// La acción que deja la regla empieza siempre así: es como se reconoce, en un
// análisis guardado, que el modelo había recomendado aprobar (la regla sólo
// baja «aprobar»). La usan las mediciones; no cambiarla sin cambiarlas.
export const ACCION_DE_LA_REGLA_DE_CAPACIDAD = "Confirmar la capacidad de pago antes de aprobar:";

const CONFIRMADO = "Confirmado por un tercero";

const moneda = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: "always",
});
const positivo = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const comoObjeto = (v: unknown): AnyRecord | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null);

// Los temas de deuda que, sin respuesta, dejan sin saber si la persona debe. Con
// el buró de la institución, bancos, Diners y cooperativas los trae Equifax y ya
// cuentan como consultados (perfil-del-modelo.ts, disponibilidadPorTema).
const TEMAS_DE_DEUDA = ["buró de crédito de bancos", "tarjetas Diners", "cooperativas", "préstamos del IESS/BIESS"];

export function capacidadEvidenciada(perfilDelModelo: AnyRecord | null | undefined): CapacidadEvidenciada {
  const p = comoObjeto(perfilDelModelo) ?? {};
  const faltantes: Faltante[] = [];

  // 1. El ingreso.
  const fi = comoObjeto(p.fuentesIngreso);
  if (fi?.estado !== CONFIRMADO || positivo(fi?.ingresoReportadoIess) === 0) {
    faltantes.push({ motivo: "ingreso_sin_confirmar", ...(typeof fi?.estado === "string" && fi.estado !== CONFIRMADO ? { detalle: fi.estado } : {}) });
  }

  // 2. La cuota de la deuda propia.
  const sinRespuesta = new Set<string>(Array.isArray(p.disponibilidad?.temasSinRespuesta) ? p.disponibilidad.temasSinRespuesta : []);
  const temasSinRespuesta = TEMAS_DE_DEUDA.filter((t) => sinRespuesta.has(t));
  if (temasSinRespuesta.length) faltantes.push({ motivo: "deuda_sin_respuesta", detalle: unir(temasSinRespuesta, "y") });

  const en = comoObjeto(p.endeudamiento);
  const cuotaConocida = typeof en?.cuotaMensualConocida === "number" ? en.cuotaMensualConocida : null;
  if (comoObjeto(p.buroEquifax)) {
    // Con Equifax la cuota cubre bancos, cooperativas y el sector comercial. Si no
    // la trae, o falta la deuda de un sistema (deudaPropiaTotal null), no se sabe.
    const deuda = positivo(en?.deudaPropiaBancos) + positivo(en?.deudaPropiaCooperativas) + positivo(en?.deudaPropiaSectorComercial);
    if (en?.deudaPropiaTotal === null || (deuda > 0 && cuotaConocida === null)) {
      faltantes.push({ motivo: "cuota_buro", acreedor: "bancos, cooperativas y el sector comercial según Equifax", saldo: deuda || null });
    }
  } else {
    const bancos = positivo(en?.deudaPropiaBancos);
    if (bancos > 0) faltantes.push({ motivo: "cuota_bancos", acreedor: "bancos", saldo: bancos });
    const cooperativas = positivo(en?.deudaPropiaCooperativas);
    if (cooperativas > 0 && !(cuotaConocida !== null && cuotaConocida > 0)) {
      faltantes.push({ motivo: "cuota_cooperativas", acreedor: "cooperativas", saldo: cooperativas });
    }
  }

  const biess = positivo(comoObjeto(p.comportamientoBancario)?.saldoPrestamosIessBiess);
  if (biess > 0) faltantes.push({ motivo: "cuota_iess_biess", acreedor: "el IESS/BIESS", saldo: biess });


  return { evidenciada: faltantes.length === 0, faltantes };
}

function unir(partes: string[], conjuncion: "y" | "ni"): string {
  return partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} ${conjuncion} ${partes.at(-1)}`;
}

// La acción, en una oración: «el ingreso no está confirmado por un tercero (Por
// confirmar) y no se conoce la cuota de su deuda con bancos ($8.374) ni con el
// IESS/BIESS ($3.200)».
export function accionDeLaRegla(faltantes: Faltante[]): string {
  const partes: string[] = [];
  const ingreso = faltantes.find((f) => f.motivo === "ingreso_sin_confirmar");
  if (ingreso) partes.push(`el ingreso no está confirmado por un tercero${ingreso.detalle ? ` (${ingreso.detalle})` : ""}`);
  const sinRespuesta = faltantes.find((f) => f.motivo === "deuda_sin_respuesta");
  if (sinRespuesta) partes.push(`no se pudo obtener ${sinRespuesta.detalle}, así que no se sabe si debe más`);
  const cuotas = faltantes
    .filter((f) => f.acreedor)
    .map((f, i) => `${i === 0 ? "" : "con "}${f.acreedor}${f.saldo ? ` (${moneda.format(f.saldo)})` : ""}`);
  if (cuotas.length) partes.push(`no se conoce la cuota de su deuda con ${unir(cuotas, "ni")}`);
  return `${ACCION_DE_LA_REGLA_DE_CAPACIDAD} ${unir(partes, "y")}. El resto del análisis apunta a aprobar.`;
}

// Aplica la regla a un resultado del modelo. Sólo baja «aprobar»: no toca un
// fallo, un «revisar» ni un «negar», y aplicada dos veces da lo mismo (un
// análisis reutilizado vuelve a pasar por filaDelAnalisis).
//
// Sin mensajeAlModelo no hay con qué juzgar y no se toca. En producción siempre
// está (puntuarPedido, el lote y el reutilizado lo traen); falta sólo en el
// modelo simulado del sandbox.
export function aplicarReglaDeCapacidad(resultado: LlmScoringResult): LlmScoringResult {
  if (resultado.recomendacion !== "aprobar" || resultado.fallo || !resultado.mensajeAlModelo) return resultado;
  const { evidenciada, faltantes } = capacidadEvidenciada(comoObjeto(resultado.mensajeAlModelo.perfilDelModelo));
  if (evidenciada) return resultado;
  return {
    ...resultado,
    recomendacion: "revisar",
    // Primera, porque es lo que decide el caso; el tope de 5 es el de interpretar().
    accionesSugeridas: [accionDeLaRegla(faltantes), ...resultado.accionesSugeridas].slice(0, 5),
  };
}
