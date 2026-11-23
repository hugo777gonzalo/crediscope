// Los atenuantes y los agravantes del mal comportamiento, en el orden decidido (R4; docs/estandar-de-la-institucion.md, 2.4;
// decisiones 9, 13 y 14 del negocio, 2026-11-22). Función pura.
//
// Se calculan sólo cuando hay mal comportamiento, y se entregan a la IA como evidencia con su valor y su estado: medido, o no
// medido. **Un atenuante no medido no es falso**: no cuenta ni a favor ni en contra (sin buró, el endeudamiento a la baja y los
// meses al día nunca se miden). No hay número mínimo de atenuantes (decidido). El ORDEN, de mayor a menor peso, es un dato del
// estándar (`atenuantesEnOrden`, `agravantesEnOrden`), no un texto: la IA los recibe así.
//
//   Atenuantes: deuda al día en un banco o el BIESS (USD 500 o más); deuda al día en una cooperativa; 12 meses al día desde el
//   último atraso (con buró); el atraso pasado fue chico; estabilidad; endeudamiento a la baja (con buró); ingreso al alza
//   (más que el SBU); al día con una casa comercial.
//   Agravantes: reincidencia; un atraso pasado de más de 90 días; lo vencido de entonces sobre la tolerancia de Negar; un atraso
//   en los últimos 6 meses aunque hoy esté al día; garante de una operación en atraso; mora en más de un sector; pensión
//   alimenticia en mora hasta USD 300 (R6); retail en mora a su corte.
//
// Decisión 14: para que la IA suba hace falta un atenuante de los tres primeros (no es un número mínimo sino de qué peso: sin
// él, estar al día en una casa comercial sostendría subir). Decisión 9: con mora de hoy (tramo Negar), la IA sube como mucho
// hasta Revisar, nunca a Aprobar.

import type { Agravante, Atenuante, EstandarDeLaInstitucion, Salida } from "../estandar/estandar.ts";
import { exigirEstandarValido } from "../estandar/validar-estandar.ts";
import { sbuDelAnio } from "../fuentes-ingreso.ts";
import type { EntradaDeRiesgo } from "./entrada.ts";
import type { HistorialDeLaPersona } from "./historial.ts";
import type { MoraVigenteDeLaPersona } from "./mora-vigente.ts";

export type EstadoDeUnFactor = "se_cumple" | "no_se_cumple" | "no_medido";

export interface FactorEvaluado<Id extends string> {
  id: Id;
  /** 1 es el de más peso. Sale del orden del estándar. */
  puesto: number;
  estado: EstadoDeUnFactor;
  /** La cifra o el dato que lo sostiene, sin texto. */
  valor: number | boolean | null;
  /** Por qué no se pudo medir, o qué lo causa. */
  porque: string | null;
  derivaDe: string[];
}

const AL_DIA = (calificacion: string | null) => calificacion === null || calificacion === "A1" || calificacion === "AL";

export interface ContextoDeLosFactores {
  mora: MoraVigenteDeLaPersona;
  historial: HistorialDeLaPersona;
}

function sinFuente(entrada: EntradaDeRiesgo, fuente: EntradaDeRiesgo["fuentesSinRespuesta"][number]) {
  return entrada.fuentesSinRespuesta.includes(fuente);
}

export function evaluarAtenuantes(entrada: EntradaDeRiesgo, estandar: EstandarDeLaInstitucion, contexto: ContextoDeLosFactores): Array<FactorEvaluado<Atenuante>> {
  const e = exigirEstandarValido(estandar);
  const a = e.malComportamiento.atenuantes;
  const { historial } = contexto;
  const ops = entrada.operaciones;

  const calcular = (id: Atenuante): Omit<FactorEvaluado<Atenuante>, "puesto"> => {
    const base = { id, derivaDe: [] as string[] };
    switch (id) {
      case "deuda_al_dia_en_banco_o_biess": {
        const si = ops.filter((o) => (o.sistema === "bancos" || o.sistema === "tarjeta_diners" || o.sistema === "iess_biess") && o.rol === "titular" && AL_DIA(o.calificacion) && (o.diasDeMora ?? 0) === 0 && (o.saldoVigente ?? 0) >= a.deudaVigenteAlDia.desdeUsd);
        if (si.length) return { ...base, estado: "se_cumple", valor: true, porque: null, derivaDe: si.map((o) => o.clave) };
        if (sinFuente(entrada, "bancos") || sinFuente(entrada, "biess")) return { ...base, estado: "no_medido", valor: null, porque: "fuente_sin_respuesta" };
        return { ...base, estado: "no_se_cumple", valor: false, porque: null };
      }
      case "deuda_al_dia_en_cooperativa": {
        const si = ops.filter((o) => o.sistema === "cooperativas" && o.rol === "titular" && (o.diasDeMora ?? 0) === 0);
        if (si.length) return { ...base, estado: "se_cumple", valor: true, porque: null, derivaDe: si.map((o) => o.clave) };
        if (sinFuente(entrada, "cooperativas")) return { ...base, estado: "no_medido", valor: null, porque: "fuente_sin_respuesta" };
        return { ...base, estado: "no_se_cumple", valor: false, porque: null };
      }
      case "doce_meses_al_dia_desde_el_ultimo_atraso": {
        // Con buró; sin él, no medido: el perfil es una foto y no dice cuánto tiempo lleva al día.
        if (!entrada.conBuro) return { ...base, estado: "no_medido", valor: null, porque: "sin_buro" };
        const m = historial.superado.mesesSinMora ?? null;
        if (m === null) return { ...base, estado: "se_cumple", valor: null, porque: "sin_mora_en_la_historia", derivaDe: [] };
        return { ...base, estado: m >= a.mesesAlDiaDesdeElUltimoAtraso.mesesMinimos ? "se_cumple" : "no_se_cumple", valor: m, porque: null };
      }
      case "atraso_pasado_chico": {
        // Lo vencido de entonces, dentro de la tolerancia de Revisar de su sector. Sin atraso pasado conocido no hay qué medir.
        const ev = historial.eventos.filter((x) => x.vencidoUsd !== null);
        if (historial.eventos.length === 0) return { ...base, estado: "no_medido", valor: null, porque: "sin_atraso_pasado_conocido" };
        if (ev.length === 0) return { ...base, estado: "no_medido", valor: null, porque: "atraso_pasado_sin_monto" };
        const chico = ev.every((x) => (x.vencidoUsd as number) <= e.riesgo.moraVigente.sectores[x.sector].revisarHastaUsd);
        return { ...base, estado: chico ? "se_cumple" : "no_se_cumple", valor: chico, porque: null, derivaDe: ev.flatMap((x) => x.operaciones) };
      }
      case "estabilidad":
        if (entrada.estabilidadMeses === null) return { ...base, estado: "no_medido", valor: null, porque: "sin_dato_de_continuidad" };
        return { ...base, estado: entrada.estabilidadMeses >= a.estabilidad.mesesMinimos ? "se_cumple" : "no_se_cumple", valor: entrada.estabilidadMeses, porque: null };
      case "endeudamiento_a_la_baja":
        if (!entrada.conBuro || entrada.bajaDelEndeudamiento12Meses === null) return { ...base, estado: "no_medido", valor: null, porque: entrada.conBuro ? "sin_consulta_de_hace_12_meses" : "sin_buro" };
        return { ...base, estado: entrada.bajaDelEndeudamiento12Meses >= a.endeudamientoALaBaja.bajaMinima ? "se_cumple" : "no_se_cumple", valor: entrada.bajaDelEndeudamiento12Meses, porque: null };
      case "ingreso_al_alza": {
        // El reportado al IESS de los últimos 6 meses contra los 6 anteriores, descontada la variación del SBU del año (R4).
        const { promedioUltimos6: p6, promedioUltimos12: p12 } = entrada.ingresoReportado;
        const anio = entrada.anioDelCorteDelIess;
        if (p6 === null || p12 === null || anio === null) return { ...base, estado: "no_medido", valor: null, porque: "sin_aportes_para_comparar" };
        const anteriores = 2 * p12 - p6;
        if (!(anteriores > 0)) return { ...base, estado: "no_medido", valor: null, porque: "sin_aportes_en_los_6_meses_anteriores" };
        const alza = p6 / anteriores - 1;
        const sbu = sbuDelAnio(anio) / sbuDelAnio(anio - 1) - 1;
        return { ...base, estado: alza > sbu ? "se_cumple" : "no_se_cumple", valor: Math.round(alza * 1000) / 1000, porque: null };
      }
      case "al_dia_con_una_casa_comercial": {
        const si = ops.filter((o) => o.sistema === "comercial" && (o.diasDeMora ?? 0) === 0);
        if (si.length) return { ...base, estado: "se_cumple", valor: true, porque: "a_su_corte", derivaDe: si.map((o) => o.clave) };
        if (sinFuente(entrada, "comercial")) return { ...base, estado: "no_medido", valor: null, porque: "fuente_sin_respuesta" };
        return { ...base, estado: "no_se_cumple", valor: false, porque: null };
      }
    }
  };
  return e.malComportamiento.atenuantesEnOrden.map((id, i) => ({ ...calcular(id), puesto: i + 1 }));
}

export function evaluarAgravantes(entrada: EntradaDeRiesgo, estandar: EstandarDeLaInstitucion, contexto: ContextoDeLosFactores): Array<FactorEvaluado<Agravante>> {
  const e = exigirEstandarValido(estandar);
  const mv = e.riesgo.moraVigente;
  const { mora, historial } = contexto;

  const calcular = (id: Agravante): Omit<FactorEvaluado<Agravante>, "puesto"> => {
    const base = { id, derivaDe: [] as string[] };
    const si = (cumple: boolean, valor: number | boolean | null = cumple, derivaDe: string[] = []) => ({ ...base, estado: (cumple ? "se_cumple" : "no_se_cumple") as EstadoDeUnFactor, valor, porque: null, derivaDe });
    switch (id) {
      case "reincidencia": {
        // Dos o más episodios de más de 30 días en 24 meses (sin buró, los que se ven), o tres o más demandas de cobro en 5 años.
        const episodios = historial.eventos.filter((x) => x.mesesDesde <= 24).length;
        const demandas = entrada.demandasDeCobro;
        const anio = new Date(entrada.fechaDeLaConsulta).getUTCFullYear();
        const demandasEnElPlazo = demandas === null ? null : demandas.filter((d) => d.anio === null || anio - d.anio <= e.malComportamiento.demandaDeCobro.reiteradas.enAnios).length;
        if (episodios >= 2 || (demandasEnElPlazo !== null && demandasEnElPlazo >= e.malComportamiento.demandaDeCobro.reiteradas.cantidad)) return si(true, episodios >= 2 ? episodios : demandasEnElPlazo);
        if (demandas === null && !entrada.conBuro) return { ...base, estado: "no_medido", valor: null, porque: "fuente_de_demandas_sin_respuesta" };
        return si(false, episodios);
      }
      case "atraso_pasado_de_mas_de_90_dias":
        if (historial.eventos.length === 0) return si(false);
        return si(historial.eventos.some((x) => x.esLargo), true, historial.eventos.flatMap((x) => x.operaciones));
      case "vencido_de_entonces_sobre_la_tolerancia_de_negar": {
        const ev = historial.eventos.filter((x) => x.vencidoUsd !== null);
        if (historial.eventos.length === 0) return si(false);
        if (ev.length === 0) return { ...base, estado: "no_medido", valor: null, porque: "atraso_pasado_sin_monto" };
        return si(ev.some((x) => (x.vencidoUsd as number) > mv.sectores[x.sector].revisarHastaUsd));
      }
      case "atraso_en_los_ultimos_6_meses":
        // Un atraso reciente aunque hoy esté al día: el primer corte de la tabla de decaimiento.
        return si(historial.eventos.some((x) => x.mesesDesde <= e.riesgo.historial.decaimientoEnMeses[0]) && mora.hoyAlDia === true);
      case "garante_de_una_operacion_en_atraso":
        return si(mora.garanteDeUnaOperacionEnAtraso, mora.garanteDeUnaOperacionEnAtraso, entrada.operaciones.filter((o) => o.rol === "garante" && ((o.diasDeMora ?? 0) > 0 || !AL_DIA(o.calificacion))).map((o) => o.clave));
      case "mora_en_mas_de_un_sector":
        return si(mora.sectoresConMora.length > 1, mora.sectoresConMora.length);
      case "pension_alimenticia_en_mora_dentro_de_la_tolerancia": {
        const p = entrada.pensionAlimenticia;
        if (p.enMora === null) return { ...base, estado: "no_medido", valor: null, porque: "fuente_sin_respuesta" };
        if (!p.enMora) return si(false);
        // Sin el monto no se puede decir que está dentro de la tolerancia.
        if (p.deudaUsd === null) return { ...base, estado: "no_medido", valor: null, porque: "pension_sin_monto" };
        return si(p.deudaUsd <= e.riesgo.senales.pensionAlimenticiaEnMora.toleranciaUsd, p.deudaUsd);
      }
      case "casa_comercial_en_mora_a_su_corte": {
        const ops = entrada.operaciones.filter((o) => o.sistema === "comercial" && (o.diasDeMora ?? 0) > 0);
        return si(ops.length > 0, ops.length > 0, ops.map((o) => o.clave));
      }
    }
  };
  return e.malComportamiento.agravantesEnOrden.map((id, i) => ({ ...calcular(id), puesto: i + 1 }));
}

export interface PermisoParaSubir {
  puede: boolean;
  /** Los atenuantes de los primeros N del orden que se cumplen (los que sostienen subir). */
  atenuantesQueSostienen: Atenuante[];
  /** Los que se cumplen pero no están entre los primeros N: no alcanzan solos. */
  atenuantesQueNoAlcanzan: Atenuante[];
  porque: "hay_un_atenuante_de_peso" | "ningun_atenuante_de_los_primeros" | "hay_un_atenuante" | "ningun_atenuante" | "el_estandar_no_deja_subir";
}

/**
 * Decisión 14: para que la IA suba hace falta un atenuante de los primeros N del orden (3). Con N = 0 (la opción b: cualquiera alcanza,
 * sin mínimo) basta uno cualquiera. Un atenuante no medido no cuenta. Si el estándar no deja subir (cero escalones hacia arriba), no puede.
 */
export function puedeSubirLaIA(atenuantes: Array<FactorEvaluado<Atenuante>>, estandar: EstandarDeLaInstitucion): PermisoParaSubir {
  const e = exigirEstandarValido(estandar);
  const primeros = e.malComportamiento.paraSubirHaceFaltaUnoDeLosPrimeros;
  const seCumplen = atenuantes.filter((x) => x.estado === "se_cumple");
  if (e.margenDeLaIA.escalonesHaciaArriba === 0) return { puede: false, atenuantesQueSostienen: [], atenuantesQueNoAlcanzan: seCumplen.map((x) => x.id), porque: "el_estandar_no_deja_subir" };
  if (primeros === 0) {
    return { puede: seCumplen.length > 0, atenuantesQueSostienen: seCumplen.map((x) => x.id), atenuantesQueNoAlcanzan: [], porque: seCumplen.length > 0 ? "hay_un_atenuante" : "ningun_atenuante" };
  }
  const deLosPrimeros = seCumplen.filter((x) => x.puesto <= primeros);
  return {
    puede: deLosPrimeros.length > 0,
    atenuantesQueSostienen: deLosPrimeros.map((x) => x.id),
    atenuantesQueNoAlcanzan: seCumplen.filter((x) => x.puesto > primeros).map((x) => x.id),
    porque: deLosPrimeros.length > 0 ? "hay_un_atenuante_de_peso" : "ningun_atenuante_de_los_primeros",
  };
}

/**
 * Hasta dónde puede subir la IA desde un mal comportamiento (decisión 9): con mora de hoy (tramo Negar), hasta Revisar; si lo que hay es un mal
 * comportamiento histórico y la persona hoy está al día, hasta lo más alto que el estándar le deja recomendar. null: no puede subir.
 */
export function techoDeLaIA(estandar: EstandarDeLaInstitucion, moraDeHoy: boolean): Salida | null {
  const e = exigirEstandarValido(estandar);
  if (e.margenDeLaIA.escalonesHaciaArriba === 0) return null;
  const salidas = e.malComportamiento.salidasQueLaIAPuedeRecomendar;
  const alto: Salida | null = salidas.includes("aprobar") ? "aprobar" : salidas.includes("revisar") ? "revisar" : null;
  if (alto === null) return null;
  if (moraDeHoy) return e.malComportamiento.conMoraDeHoyLaIAPuedeSubirHasta === "aprobar" && alto === "aprobar" ? "aprobar" : "revisar";
  return alto;
}

