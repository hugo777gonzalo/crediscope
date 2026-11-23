// El veredicto de riesgo (E10; docs/estandar-de-la-institucion.md, sección 2): el nivel de la persona, la banda de su score,
// lo que lo causa y, si hay mal comportamiento, los atenuantes y agravantes y hasta dónde puede subir la IA.
//
// Lo calcula el código desde las señales duras; la IA no lo cambia: lo recibe, con las señales que lo causaron, y trabaja dentro
// de su banda. Manda la peor señal. Función pura sobre `EntradaDeRiesgo` (armada desde la capa de hechos por
// `entradaDeRiesgoDesdeHechos()`) y el estándar de la institución.
//
// NO ESTÁ CONECTADO: ni el análisis, ni el perfil del modelo, ni la pantalla lo leen. Se conecta con la versión mayor del marco.

import type { EstandarDeLaInstitucion, NivelDeRiesgo, Salida } from "../estandar/estandar.ts";
import { exigirEstandarValido } from "../estandar/validar-estandar.ts";
import { evaluarAgravantes, evaluarAtenuantes, type FactorEvaluado, type PermisoParaSubir, puedeSubirLaIA, techoDeLaIA } from "./atenuantes.ts";
import type { EntradaDeRiesgo } from "./entrada.ts";
import { demandaDeCobro, historialDeLaPersona, type HistorialDeLaPersona, type ResultadoDeLaDemanda } from "./historial.ts";
import { moraVigente, type MoraVigenteDeLaPersona, salidaPorLaMora, type SalidaPorLaMora, type Tramo } from "./mora-vigente.ts";
import { type SenalDeRiesgo, senalesDeRiesgo } from "./senales.ts";
import type { Agravante, Atenuante } from "../estandar/estandar.ts";

export const RIESGO_VERSION = "riesgo-v1";

const GRAVEDAD: Record<NivelDeRiesgo, number> = { bajo: 0, con_observaciones: 1, deteriorado: 2, mal_comportamiento: 3 };
const NIVEL_DEL_TRAMO: Record<Tramo, NivelDeRiesgo> = { no_cuenta: "bajo", aceptar: "con_observaciones", revisar: "deteriorado", negar: "mal_comportamiento" };

export interface MotivoDelNivel {
  /** Qué lo causa: un código estable. */
  codigo:
    | "mora_vigente" | "atraso_corto" | "historial" | "demanda_de_cobro" | "castigo_o_cobro_judicial" | "lista_de_mal_pagador" | "pension_alimenticia_sobre_la_tolerancia"
    | "impedimento_para_cargos_publicos" | "ruc_suspendido_no_depurado" | "multas_de_transito";
  nivel: NivelDeRiesgo;
  /** El mal comportamiento es de hoy (vigente) o de antes (histórico). Sólo con nivel mal_comportamiento. */
  vigente: boolean;
  detalle: string | null;
  derivaDe: string[];
}

export interface VeredictoDeRiesgo {
  version: typeof RIESGO_VERSION;
  nivel: NivelDeRiesgo;
  /** La banda del score del nivel (2.2). */
  banda: [number, number];
  /** Sin historial de crédito no hay señales en contra: el nivel es Bajo, pero el score no pasa de este tope. */
  scoreMaximo: number | null;
  sinHistorialDeCredito: boolean;
  motivos: MotivoDelNivel[];
  mora: MoraVigenteDeLaPersona;
  /** Lo que la mora vigente deja llegar (R3). */
  salidaPorLaMora: SalidaPorLaMora;
  historial: HistorialDeLaPersona;
  demandaDeCobro: ResultadoDeLaDemanda;
  senales: SenalDeRiesgo[];
  /** Mal comportamiento de hoy: la base es Negar y la IA sube como mucho hasta el tope (decisión 9). */
  malComportamientoVigente: boolean;
  malComportamientoHistorico: boolean;
  /** Sólo con mal comportamiento. */
  atenuantes: Array<FactorEvaluado<Atenuante>> | null;
  agravantes: Array<FactorEvaluado<Agravante>> | null;
  ia: { permiso: PermisoParaSubir; techo: Salida | null } | null;
  /** Lo que no se pudo medir: la fuente no contestó. Nunca se cuenta como «no hay». */
  sinMedir: string[];
}

export interface OpcionesDelVeredicto {
  /** El veredicto «alcanza» de la capacidad, para el tramo Revisar (R3): null si no se midió. */
  capacidadAlcanza?: boolean | null;
}

export function calcularVeredictoDeRiesgo(entrada: EntradaDeRiesgo, estandar: EstandarDeLaInstitucion, opciones: OpcionesDelVeredicto = {}): VeredictoDeRiesgo {
  const e = exigirEstandarValido(estandar);
  const s = e.riesgo.senales;
  const motivos: MotivoDelNivel[] = [];
  const sinMedir: string[] = [];
  const agregar = (m: MotivoDelNivel) => {
    if (m.nivel !== "bajo") motivos.push(m);
  };

  // ---- la mora vigente (R2 y R3) ----
  const mora = moraVigente(entrada, e);
  const porLaMora = salidaPorLaMora(mora.tramo, opciones.capacidadAlcanza ?? null, e);
  if (porLaMora.nivel) agregar({ codigo: "mora_vigente", nivel: porLaMora.nivel, vigente: true, detalle: mora.mandaElSector, derivaDe: mora.mandaElSector ? mora.sectores[mora.mandaElSector].operaciones : [] });
  else if (Object.values(mora.sectores).some((x) => x.atrasoCorto)) {
    agregar({ codigo: "atraso_corto", nivel: e.riesgo.moraVigente.atrasoCortoNivel, vigente: true, detalle: null, derivaDe: entrada.operaciones.filter((o) => (o.diasDeMora ?? 0) > 0).map((o) => o.clave) });
  }
  for (const sec of Object.values(mora.sectores)) sinMedir.push(...sec.sinMedir.map((x) => `${sec.sector}:${x}`));

  // ---- las señales duras de «mal comportamiento vigente» (2.3) ----
  if (mora.castigoOCobroJudicial) agregar({ codigo: "castigo_o_cobro_judicial", nivel: s.operacionCastigadaOEnCobroJudicial, vigente: true, detalle: null, derivaDe: entrada.operaciones.filter((o) => (o.saldoCastigado ?? 0) > 0 || (o.saldoEnDemanda ?? 0) > 0).map((o) => o.clave) });
  if (entrada.listaDeMalPagador === true) agregar({ codigo: "lista_de_mal_pagador", nivel: s.listaDeMalPagador, vigente: true, detalle: null, derivaDe: ["cum.lista_negra.existe"] });
  else if (entrada.listaDeMalPagador === null) sinMedir.push("lista_de_mal_pagador");

  // ---- el historial (R4) y la demanda de cobro (R1) ----
  const historial = historialDeLaPersona(entrada, e, mora);
  if (historial.tramo !== "no_cuenta") agregar({ codigo: "historial", nivel: NIVEL_DEL_TRAMO[historial.tramo], vigente: false, detalle: historial.efecto, derivaDe: historial.mandaElEvento?.operaciones ?? [] });
  sinMedir.push(...historial.superado.sinMedir);
  const demanda = demandaDeCobro(entrada, e, historial.superado.superado);
  if (demanda.nivel) agregar({ codigo: "demanda_de_cobro", nivel: demanda.nivel, vigente: false, detalle: demanda.reincidente ? "reincidente" : null, derivaDe: ["jud.cobro.detalle"] });
  sinMedir.push(...demanda.sinMedir);

  // ---- las demás señales ----
  const p = entrada.pensionAlimenticia;
  if (p.enMora === true && p.deudaUsd !== null && p.deudaUsd > s.pensionAlimenticiaEnMora.toleranciaUsd) {
    // R6: por encima de la tolerancia, Revisar (deteriorado); hasta ella, un agravante menor.
    agregar({ codigo: "pension_alimenticia_sobre_la_tolerancia", nivel: s.pensionAlimenticiaEnMora.porEncima === "negar" ? "mal_comportamiento" : "deteriorado", vigente: s.pensionAlimenticiaEnMora.porEncima === "negar", detalle: null, derivaDe: ["jud.pension.deuda"] });
  } else if (p.enMora === true && p.deudaUsd === null) sinMedir.push("pension_alimenticia_sin_monto");
  if (entrada.impedimentoParaCargosPublicos === true) agregar({ codigo: "impedimento_para_cargos_publicos", nivel: s.impedimentoParaCargosPublicos, vigente: false, detalle: null, derivaDe: ["cum.impedimento.existe"] });
  if (entrada.rucSuspendidoNoDepurado === true) agregar({ codigo: "ruc_suspendido_no_depurado", nivel: s.rucSuspendidoNoDepurado, vigente: false, detalle: null, derivaDe: ["ruc.actividad.estado"] });
  if (entrada.multasDeTransitoEnSalariosBasicos === null) sinMedir.push("multas_de_transito");
  else if (entrada.multasDeTransitoEnSalariosBasicos > s.multasDeTransito.conObservacionesDesdeSalariosBasicos) agregar({ codigo: "multas_de_transito", nivel: "con_observaciones", vigente: false, detalle: null, derivaDe: [] });

  // ---- el nivel: manda la peor señal ----
  let nivel: NivelDeRiesgo = "bajo";
  for (const m of motivos) if (GRAVEDAD[m.nivel] > GRAVEDAD[nivel]) nivel = m.nivel;

  // Sin historial de crédito (ninguna operación y las fuentes contestaron) no hay señales en contra, pero tampoco prueba de pago.
  const fuentesCaidas = entrada.fuentesSinRespuesta.length > 0;
  const sinHistorialDeCredito = entrada.operaciones.length === 0 && !fuentesCaidas;
  const scoreMaximo = sinHistorialDeCredito && nivel === "bajo" ? e.riesgo.scoreMaximoSinHistorial : null;

  const malComportamientoVigente = motivos.some((m) => m.nivel === "mal_comportamiento" && m.vigente);
  const malComportamientoHistorico = nivel === "mal_comportamiento" && !malComportamientoVigente;
  const conMal = nivel === "mal_comportamiento";
  const contexto = { mora, historial };
  const atenuantes = conMal ? evaluarAtenuantes(entrada, e, contexto) : null;
  const agravantes = conMal ? evaluarAgravantes(entrada, e, contexto) : null;
  const permiso = atenuantes ? puedeSubirLaIA(atenuantes, e) : null;
  const ia = permiso ? { permiso, techo: permiso.puede ? techoDeLaIA(e, malComportamientoVigente) : null } : null;

  return {
    version: RIESGO_VERSION,
    nivel,
    banda: e.riesgo.bandasDelScore[nivel],
    scoreMaximo,
    sinHistorialDeCredito,
    motivos,
    mora,
    salidaPorLaMora: porLaMora,
    historial,
    demandaDeCobro: demanda,
    senales: senalesDeRiesgo(entrada, e, contexto),
    malComportamientoVigente,
    malComportamientoHistorico,
    atenuantes,
    agravantes,
    ia,
    sinMedir,
  };
}
