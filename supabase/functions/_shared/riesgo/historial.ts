// El historial de mal comportamiento y cómo pierde peso (R4; docs/estandar-de-la-institucion.md, 2.3; decisiones del
// negocio del 2026-11-22). Función pura sobre `EntradaDeRiesgo` y el estándar.
//
// Un evento de mal comportamiento histórico es: un mes con más de 30 días de mora y lo vencido por encima de la tolerancia
// de Aceptar de su sector (sólo con buró), el retail con más de 30 días a su corte (julio de 2025: es historial, decisión 6) y
// una demanda de cobro (sus tramos los fija R1). «Superado» es hoy al día en todo y con una deuda formal al día de USD 500 o
// más (decisión 10); con buró, además, 6 meses seguidos sin mora de más de 30 días desde el evento.
//
// El decaimiento (decisión 11, 6, 12 y 24 meses; la conservadora, 12, 24 y 48) según los meses desde el último mes malo:
//
//   meses desde el último mes con mora | superado                    | no superado
//   0 a 6                              | Revisar                     | el tramo de R2 con lo vencido de entonces (puede ser Negar)
//   7 a 12                             | Aceptar                     | Revisar
//   13 a 24                            | antecedente: se menciona    | Aceptar
//   más de 24                          | no se menciona              | antecedente
//
// Un atraso de más de 90 días empieza una fila más arriba (pesa como uno más reciente).

import type { EstandarDeLaInstitucion, NivelDeRiesgo } from "../estandar/estandar.ts";
import { exigirEstandarValido } from "../estandar/validar-estandar.ts";
import type { EntradaDeRiesgo, Sector } from "./entrada.ts";
import type { MoraVigenteDeLaPersona, Tramo } from "./mora-vigente.ts";

export type EfectoDelHistorial = "revisar" | "tramo_de_r2" | "aceptar" | "antecedente" | "no_se_menciona";

export interface EventoHistorico {
  tipo: "retail_al_corte" | "mora_con_buro";
  sector: Sector;
  /** La fecha del último mes con mora (ISO; en el retail, el corte). */
  fecha: string;
  mesesDesde: number;
  diasMaximos: number | null;
  vencidoUsd: number | null;
  /** Más de `atrasoLargoDesdeDias` días: empieza una fila más arriba. */
  esLargo: boolean;
  operaciones: string[];
}

export interface Superado {
  /** null: no se puede decir (una fuente de crédito no contestó). */
  superado: boolean | null;
  hoyAlDia: boolean | null;
  deudaFormalAlDia: boolean | null;
  /** Sólo con buró: meses seguidos sin mora de más de 30 días desde el evento. null sin buró. */
  mesesSinMora: number | null;
  sinMedir: string[];
}

export interface HistorialDeLaPersona {
  eventos: EventoHistorico[];
  /** El evento que manda (el de la fila más reciente del decaimiento); null sin eventos. */
  mandaElEvento: EventoHistorico | null;
  superado: Superado;
  /** La fila de la tabla de decaimiento: 0 (hasta el primer corte) a 3 (más allá del tercero). null sin eventos. */
  fila: 0 | 1 | 2 | 3 | null;
  efecto: EfectoDelHistorial | null;
  /** Lo que el historial aporta a la mora: el tramo de R2 con lo vencido de entonces, Revisar o Aceptar; «no_cuenta» si sólo es antecedente o no se menciona. */
  tramo: Tramo;
  /** Se menciona (antecedente) aunque no limite. */
  seMenciona: boolean;
}

/** Meses enteros entre dos fechas ISO, en UTC (la fecha de la consulta es el reloj). */
export function mesesEntre(desde: string, hasta: string): number {
  const a = new Date(desde);
  const b = new Date(hasta);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m--;
  return m;
}

const AL_DIA = (calificacion: string | null) => calificacion === null || calificacion === "A1" || calificacion === "AL";

export function eventosHistoricos(entrada: EntradaDeRiesgo, estandar: EstandarDeLaInstitucion): EventoHistorico[] {
  const e = exigirEstandarValido(estandar);
  const mv = e.riesgo.moraVigente;
  const eventos: EventoHistorico[] = [];

  // El retail del proveedor, con más de 30 días a su corte (decisión 6): historial, no mora de hoy. Con un valor vencido
  // por debajo del mínimo no es atraso (2.2); sin el monto cuenta.
  if (mv.retailDelProveedor === "historial") {
    for (const o of entrada.operaciones) {
      if (o.sector !== "comercial" || (o.diasDeMora ?? 0) <= mv.masDeDias || !o.fechaDelDato) continue;
      if (o.saldoVencido !== null && o.saldoVencido < e.riesgo.senales.retailAlCorte.valorVencidoMinimoUsd) continue;
      eventos.push({
        tipo: "retail_al_corte", sector: "comercial", fecha: o.fechaDelDato, mesesDesde: mesesEntre(o.fechaDelDato, entrada.fechaDeLaConsulta),
        diasMaximos: o.diasDeMora, vencidoUsd: o.saldoVencido, esLargo: (o.diasDeMora ?? 0) > e.riesgo.historial.atrasoLargoDesdeDias, operaciones: [o.clave],
      });
    }
  }

  // Con buró: un mes con más de 30 días de mora y lo vencido por encima de la tolerancia de Aceptar de su sector.
  for (const m of entrada.historialMensual ?? []) {
    if (m.diasDeMoraMaxima <= mv.masDeDias || m.vencido <= mv.sectores[m.sector].aceptarHastaUsd) continue;
    const fecha = `${m.mes}-01T00:00:00Z`;
    eventos.push({
      tipo: "mora_con_buro", sector: m.sector, fecha, mesesDesde: mesesEntre(fecha, entrada.fechaDeLaConsulta), diasMaximos: m.diasDeMoraMaxima,
      vencidoUsd: m.vencido, esLargo: m.diasDeMoraMaxima > e.riesgo.historial.atrasoLargoDesdeDias, operaciones: [],
    });
  }
  return eventos;
}

/** Decisión 10: hoy al día en todo y con una deuda formal (SBS o SEPS) al día de USD 500 o más; con buró, además, 6 meses sin mora desde el evento. */
export function estaSuperado(entrada: EntradaDeRiesgo, estandar: EstandarDeLaInstitucion, mora: MoraVigenteDeLaPersona, eventos: EventoHistorico[]): Superado {
  const e = exigirEstandarValido(estandar);
  const desde = e.riesgo.historial.superado.deudaFormalAlDiaDesdeUsd;
  const sinMedir: string[] = [];
  const hoyAlDia = mora.hoyAlDia;
  if (hoyAlDia === null) sinMedir.push("una_fuente_de_credito_sin_respuesta");

  const sbs = entrada.operaciones.some((o) =>
    (o.sistema === "bancos" || o.sistema === "tarjeta_diners" || o.sistema === "iess_biess") && o.rol === "titular" && AL_DIA(o.calificacion) && (o.diasDeMora ?? 0) === 0 && (o.saldoVigente ?? 0) >= desde
  );
  const seps = entrada.operaciones.some((o) => o.sistema === "cooperativas" && o.rol === "titular" && (o.diasDeMora ?? 0) === 0) && (entrada.saldoTotalCooperativas ?? 0) >= desde;
  const deudaFormalAlDia = sbs || seps ? true : (["bancos", "cooperativas", "biess"] as const).some((f) => entrada.fuentesSinRespuesta.includes(f)) ? null : false;

  let mesesSinMora: number | null = null;
  let buroOk = true;
  if (entrada.conBuro) {
    const ultimo = eventos.length ? Math.min(...eventos.map((x) => x.mesesDesde)) : null;
    mesesSinMora = ultimo;
    buroOk = ultimo === null || ultimo >= e.riesgo.historial.superado.mesesSinMoraConBuro;
  }

  const superado = hoyAlDia === false || deudaFormalAlDia === false || !buroOk ? false : hoyAlDia === null || deudaFormalAlDia === null ? null : true;
  return { superado, hoyAlDia, deudaFormalAlDia, mesesSinMora, sinMedir };
}

/** La fila de la tabla de decaimiento de un evento (0 a 3); un atraso largo empieza una fila más arriba. */
export function filaDelDecaimiento(mesesDesde: number, esLargo: boolean, estandar: EstandarDeLaInstitucion): 0 | 1 | 2 | 3 {
  const [c1, c2, c3] = exigirEstandarValido(estandar).riesgo.historial.decaimientoEnMeses;
  const fila = mesesDesde <= c1 ? 0 : mesesDesde <= c2 ? 1 : mesesDesde <= c3 ? 2 : 3;
  return (esLargo ? Math.max(0, fila - 1) : fila) as 0 | 1 | 2 | 3;
}

const TABLA_SUPERADO: EfectoDelHistorial[] = ["revisar", "aceptar", "antecedente", "no_se_menciona"];
const TABLA_NO_SUPERADO: EfectoDelHistorial[] = ["tramo_de_r2", "revisar", "aceptar", "antecedente"];

export function historialDeLaPersona(entrada: EntradaDeRiesgo, estandar: EstandarDeLaInstitucion, mora: MoraVigenteDeLaPersona): HistorialDeLaPersona {
  const e = exigirEstandarValido(estandar);
  const eventos = eventosHistoricos(entrada, e);
  const superado = estaSuperado(entrada, e, mora, eventos);
  if (eventos.length === 0) return { eventos, mandaElEvento: null, superado, fila: null, efecto: null, tramo: "no_cuenta", seMenciona: false };

  let manda = eventos[0];
  let fila = filaDelDecaimiento(manda.mesesDesde, manda.esLargo, e);
  for (const ev of eventos.slice(1)) {
    const f = filaDelDecaimiento(ev.mesesDesde, ev.esLargo, e);
    if (f < fila) {
      manda = ev;
      fila = f;
    }
  }
  // «No superado» incluye lo que no se pudo decir: no se afirma un perdón con una fuente caída.
  const efecto = (superado.superado === true ? TABLA_SUPERADO : TABLA_NO_SUPERADO)[fila];

  let tramo: Tramo = "no_cuenta";
  if (efecto === "revisar") tramo = "revisar";
  else if (efecto === "aceptar") tramo = "aceptar";
  else if (efecto === "tramo_de_r2") {
    // El tramo de R2 con lo vencido de entonces (puede ser Negar): sin el monto, Revisar.
    const u = e.riesgo.moraVigente.sectores[manda.sector];
    tramo = manda.vencidoUsd === null ? "revisar" : manda.vencidoUsd <= u.aceptarHastaUsd ? "aceptar" : manda.vencidoUsd <= u.revisarHastaUsd ? "revisar" : "negar";
    // Más de 90 días con un monto tolerable nunca queda en Aceptar (decisión 5).
    if (tramo === "aceptar" && manda.esLargo) tramo = e.riesgo.moraVigente.masDeNoventaDiasConMontoTolerable === "negar" ? "negar" : "revisar";
  }
  return { eventos, mandaElEvento: manda, superado, fila, efecto, tramo, seMenciona: efecto === "antecedente" || tramo !== "no_cuenta" };
}

// ---------------------------------------------------------------- la demanda de cobro (R1 y decisión 12)

export interface ResultadoDeLaDemanda {
  /** El nivel que aporta, ya con la baja por «superado»; null si es sólo un antecedente o no hay. */
  nivel: NivelDeRiesgo | null;
  /** Antes de bajar por «superado». */
  nivelAntesDeSuperado: NivelDeRiesgo | null;
  cantidad: number;
  anioMasReciente: number | null;
  /** Tres o más en 5 años: el patrón pesa aunque cada una sea vieja, y no baja por superado. */
  reincidente: boolean;
  bajoPorSuperado: boolean;
  /** Hay demandas más viejas que sólo se mencionan. */
  seMenciona: boolean;
  sinMedir: string[];
}

const NIVEL_DE_MENOS: Record<NivelDeRiesgo, NivelDeRiesgo | null> = { mal_comportamiento: "deteriorado", deteriorado: null, con_observaciones: null, bajo: null };
const GRAVEDAD: Record<NivelDeRiesgo, number> = { bajo: 0, con_observaciones: 1, deteriorado: 2, mal_comportamiento: 3 };

/**
 * Las demandas de cobro como demandado, por antigüedad (R1): hasta 2 años, mal comportamiento; de 2 a 5, pesa menos (deteriorado); más de 5, un
 * antecedente. Una puesta por una persona natural cuenta como deteriorado. Tres o más en 5 años es mal comportamiento. Decisión 12: superado, la
 * demanda baja un tramo, salvo reincidencia. El perfil trae sólo el AÑO de la demanda: con el año, «2 años» puede ser casi 3 (se cuenta dentro de
 * la ventana si el año es el del análisis menos 2 o posterior).
 */
export function demandaDeCobro(entrada: EntradaDeRiesgo, estandar: EstandarDeLaInstitucion, superado: boolean | null): ResultadoDeLaDemanda {
  const e = exigirEstandarValido(estandar);
  const c = e.malComportamiento.demandaDeCobro;
  const vacio: ResultadoDeLaDemanda = { nivel: null, nivelAntesDeSuperado: null, cantidad: 0, anioMasReciente: null, reincidente: false, bajoPorSuperado: false, seMenciona: false, sinMedir: [] };
  if (entrada.demandasDeCobro === null) return { ...vacio, sinMedir: ["fuente_de_demandas_sin_respuesta"] };
  const anioDelAnalisis = new Date(entrada.fechaDeLaConsulta).getUTCFullYear();
  const sinMedir: string[] = [];
  let peor: NivelDeRiesgo | null = null;
  let seMenciona = false;
  let enLosAniosDeLaReiteracion = 0;
  let masReciente: number | null = null;
  for (const d of entrada.demandasDeCobro) {
    // Sin año no se puede medir la antigüedad: se cuenta como reciente (lo prudente) y se dice.
    if (d.anio === null) sinMedir.push("demanda_sin_anio");
    const edad = d.anio === null ? 0 : anioDelAnalisis - d.anio;
    if (d.anio !== null) masReciente = masReciente === null ? d.anio : Math.max(masReciente, d.anio);
    if (edad <= c.reiteradas.enAnios) enLosAniosDeLaReiteracion++;
    let nivel: NivelDeRiesgo | null = null;
    if (d.quienDemanda === "persona") nivel = edad <= c.pesaMenosHastaAnios ? c.deUnaPersonaNatural : null;
    else nivel = edad <= c.ventanaAnios ? "mal_comportamiento" : edad <= c.pesaMenosHastaAnios ? c.nivelMientrasPesaMenos : null;
    if (nivel === null) seMenciona = true;
    else if (peor === null || GRAVEDAD[nivel] > GRAVEDAD[peor]) peor = nivel;
  }
  const reincidente = enLosAniosDeLaReiteracion >= c.reiteradas.cantidad;
  if (reincidente && (peor === null || GRAVEDAD[peor] < GRAVEDAD.mal_comportamiento)) peor = "mal_comportamiento";
  let nivel = peor;
  let bajo = false;
  if (nivel !== null && superado === true && e.riesgo.historial.demandaDeCobroSuperadoBajaUnTramo && !reincidente) {
    nivel = NIVEL_DE_MENOS[nivel];
    bajo = true;
    if (nivel === null) seMenciona = true;
  }
  return { nivel, nivelAntesDeSuperado: peor, cantidad: entrada.demandasDeCobro.length, anioMasReciente: masReciente, reincidente, bajoPorSuperado: bajo, seMenciona, sinMedir };
}

