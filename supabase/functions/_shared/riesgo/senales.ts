// Las señales de riesgo: recencia, tendencia, razones y estabilidad (docs/capa-de-hechos.md, sección 3.2; E10). Función pura.
// Cada una dice su valor y su estado, y cita las operaciones o los hechos de los que sale. Lo que no se puede medir sale
// `no_se_puede_medir`, nunca `no_se_cumple` («no hay» no es «no se pudo ver»).
//
// Estado: `se_cumple` si la señal se midió y hay algo (un atraso, una deuda en mora, una tendencia al alza o a la baja);
// `no_se_cumple` si se midió y no hay nada; `no_se_puede_medir` si falta lo que hace falta. El texto no lleva cifras: la cifra va en `valor`.

import type { EstandarDeLaInstitucion } from "../estandar/estandar.ts";
import { exigirEstandarValido } from "../estandar/validar-estandar.ts";
import type { EntradaDeRiesgo } from "./entrada.ts";
import type { HistorialDeLaPersona } from "./historial.ts";
import type { MoraVigenteDeLaPersona } from "./mora-vigente.ts";

export interface SenalDeRiesgo {
  codigo: string;
  tipo: "recencia" | "tendencia" | "razon" | "estabilidad";
  estado: "se_cumple" | "no_se_cumple" | "no_se_puede_medir";
  /** Meses, años o una fracción, según la señal; null si no se pudo medir. */
  valor: number | null;
  derivaDe: string[];
}

const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function senalesDeRiesgo(entrada: EntradaDeRiesgo, estandar: EstandarDeLaInstitucion, contexto: { mora: MoraVigenteDeLaPersona; historial: HistorialDeLaPersona }): SenalDeRiesgo[] {
  exigirEstandarValido(estandar);
  const { mora, historial } = contexto;
  const medida = (codigo: string, tipo: SenalDeRiesgo["tipo"], valor: number | null, hay: boolean, derivaDe: string[]): SenalDeRiesgo => ({
    codigo, tipo, valor, estado: valor === null ? "no_se_puede_medir" : hay ? "se_cumple" : "no_se_cumple", derivaDe,
  });
  const noSePuede = (codigo: string, tipo: SenalDeRiesgo["tipo"]): SenalDeRiesgo => ({ codigo, tipo, valor: null, estado: "no_se_puede_medir", derivaDe: [] });
  const out: SenalDeRiesgo[] = [];

  // sen.recencia.atraso: meses desde el último atraso conocido. Hoy en atraso, 0; sin atraso conocido, no hay recencia que medir.
  const operacionesEnAtraso = entrada.operaciones.filter((o) => o.sector !== "comercial" && ((o.diasDeMora ?? 0) > 0 || (o.calificacion !== null && !["A1", "AL"].includes(o.calificacion))));
  if (mora.hoyAlDia === false || operacionesEnAtraso.length > 0) out.push(medida("sen.recencia.atraso", "recencia", 0, true, operacionesEnAtraso.map((o) => o.clave)));
  else if (historial.eventos.length > 0) {
    const m = Math.min(...historial.eventos.map((x) => x.mesesDesde));
    out.push(medida("sen.recencia.atraso", "recencia", m, true, historial.eventos.flatMap((x) => x.operaciones)));
  } else if (mora.hoyAlDia === true) out.push({ codigo: "sen.recencia.atraso", tipo: "recencia", valor: null, estado: "no_se_cumple", derivaDe: [] });
  else out.push(noSePuede("sen.recencia.atraso", "recencia"));

  // sen.recencia.demanda_de_cobro: años desde la demanda de cobro más reciente (por el año).
  if (entrada.demandasDeCobro === null) out.push(noSePuede("sen.recencia.demanda_de_cobro", "recencia"));
  else {
    const anios = entrada.demandasDeCobro.map((d) => d.anio).filter((a): a is number => a !== null);
    const anioDelAnalisis = new Date(entrada.fechaDeLaConsulta).getUTCFullYear();
    out.push(anios.length ? medida("sen.recencia.demanda_de_cobro", "recencia", anioDelAnalisis - Math.max(...anios), true, []) : { codigo: "sen.recencia.demanda_de_cobro", tipo: "recencia", valor: null, estado: entrada.demandasDeCobro.length ? "no_se_puede_medir" : "no_se_cumple", derivaDe: [] });
  }

  // sen.tendencia.endeudamiento: la deuda de hoy contra la de la consulta anterior. Sin consulta anterior, no se puede medir.
  const sbs = entrada.operaciones.filter((o) => o.sector === "sbs");
  const deudaSbs = sbs.reduce((a, o) => a + (o.saldoVigente ?? 0) + (o.saldoVencido ?? 0) + (o.saldoNoDevenga ?? 0) + (o.saldoEnDemanda ?? 0) + (o.saldoCastigado ?? 0), 0);
  const deudaDeHoy = entrada.saldoTotalCooperativas === null && entrada.operaciones.some((o) => o.sector === "seps") ? null : deudaSbs + (entrada.saldoTotalCooperativas ?? 0);
  if (entrada.deudaDeLaConsultaAnterior === null || deudaDeHoy === null || entrada.deudaDeLaConsultaAnterior <= 0) out.push(noSePuede("sen.tendencia.endeudamiento", "tendencia"));
  else {
    const cambio = deudaDeHoy / entrada.deudaDeLaConsultaAnterior - 1;
    out.push(medida("sen.tendencia.endeudamiento", "tendencia", redondear(cambio), cambio !== 0, sbs.map((o) => o.clave)));
  }

  // sen.razon.atraso_sobre_deuda: lo que está en atraso sobre la deuda total (bancos, BIESS y cooperativas).
  const seps = entrada.operaciones.filter((o) => o.sector === "seps");
  const atraso = [...sbs, ...seps].reduce((a, o) => a + (o.saldoVencido ?? 0) + (o.saldoNoDevenga ?? 0) + (o.saldoEnDemanda ?? 0) + (o.saldoCastigado ?? 0), 0);
  const fuentesCaidas = (["bancos", "cooperativas", "biess"] as const).some((f) => entrada.fuentesSinRespuesta.includes(f));
  if (fuentesCaidas || deudaDeHoy === null) out.push(noSePuede("sen.razon.atraso_sobre_deuda", "razon"));
  else if (deudaDeHoy <= 0) out.push({ codigo: "sen.razon.atraso_sobre_deuda", tipo: "razon", valor: null, estado: "no_se_cumple", derivaDe: [] });
  else out.push(medida("sen.razon.atraso_sobre_deuda", "razon", redondear(atraso / deudaDeHoy), atraso > 0, [...sbs, ...seps].filter((o) => (o.saldoVencido ?? 0) > 0).map((o) => o.clave)));

  // sen.razon.cuota_sobre_ingreso: la cuota conocida sobre el ingreso reportado (sin buró, la de cooperativas y el BIESS).
  const ingreso = entrada.ingresoReportado.ingresoMensual;
  const cuotas = entrada.operaciones.filter((o) => o.cuotaMensual !== null);
  if (ingreso === null || ingreso <= 0) out.push(noSePuede("sen.razon.cuota_sobre_ingreso", "razon"));
  else {
    const total = cuotas.reduce((a, o) => a + (o.cuotaMensual as number), 0);
    out.push(medida("sen.razon.cuota_sobre_ingreso", "razon", redondear(total / ingreso), total > 0, cuotas.map((o) => o.clave)));
  }

  // sen.estabilidad.meses: meses seguidos con trabajo o con RUC activo.
  out.push(entrada.estabilidadMeses === null ? noSePuede("sen.estabilidad.meses", "estabilidad") : medida("sen.estabilidad.meses", "estabilidad", entrada.estabilidadMeses, entrada.estabilidadMeses > 0, []));
  return out;
}
