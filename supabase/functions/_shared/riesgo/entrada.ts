// La entrada del veredicto de riesgo (E10; docs/estandar-de-la-institucion.md, sección 2): lo que el código
// necesita saber de la persona para calcular su nivel de riesgo, ya normalizado, y el adaptador que lo arma
// desde la capa de hechos.
//
// Todo lo del veredicto de riesgo son funciones puras sobre esta forma: ni reloj, ni base, ni fuentes. El reloj es
// la fecha de la consulta (`fechaDeLaConsulta`). Quien tiene el buró de la institución (Equifax) llena además
// `historialMensual` y `endeudamientoALaBaja`; la capa de hechos de hoy no los trae (sin buró se diseña primero),
// así que el adaptador los deja en null y quien lo mide los dice «no medido».
//
// NO ESTÁ CONECTADO a nada: ni el análisis, ni el perfil del modelo, ni la pantalla (versión mayor del marco).

import type { Hecho, HechosDeLaPersona, OperacionDeCredito } from "../hechos/tipos.ts";

export type Sector = "sbs" | "seps" | "comercial";
export const SECTORES: readonly Sector[] = ["sbs", "seps", "comercial"];

/** El sector que reporta cada sistema (R2): bancos y Diners y el IESS y el BIESS son SBS (decisión 7); cooperativas, SEPS; las casas comerciales, comercial. */
export function sectorDe(sistema: OperacionDeCredito["sistema"]): Sector | null {
  if (sistema === "bancos" || sistema === "tarjeta_diners" || sistema === "iess_biess") return "sbs";
  if (sistema === "cooperativas") return "seps";
  if (sistema === "comercial") return "comercial";
  // La operación con la propia institución ya está en la deuda de bancos (E9): no cuenta dos veces.
  return null;
}

export interface OperacionDeRiesgo {
  /** La clave de la entidad en la capa de hechos (`op-xxxxxx`): de ahí se cita. */
  clave: string;
  sistema: OperacionDeCredito["sistema"];
  sector: Sector;
  rol: OperacionDeCredito["rol"];
  calificacion: string | null;
  diasDeMora: number | null;
  saldoVencido: number | null;
  saldoNoDevenga: number | null;
  saldoEnDemanda: number | null;
  saldoCastigado: number | null;
  /** Lo que se debe y está al día (por vencer): null donde la fuente no lo interpreta (cooperativas). */
  saldoVigente: number | null;
  cuotaMensual: number | null;
  /** Lo que se debe en total con la operación: sólo cooperativas (`val_saldo_total`); null en las demás. */
  saldoTotal: number | null;
  /** El corte del dato (el de la fuente): en el retail del proveedor es julio de 2025. */
  fechaDelDato: string | null;
}

export type QuienDemanda = "institucion_financiera" | "empresa" | "persona";

export interface DemandaDeCobro {
  anio: number | null;
  quienDemanda: QuienDemanda | null;
}

/** Un mes de la historia del buró de la institución (con buró; sin él no existe). */
export interface MesDeHistoria {
  /** aaaa-mm */
  mes: string;
  sector: Sector;
  diasDeMoraMaxima: number;
  vencido: number;
}

export interface EntradaDeRiesgo {
  /** El reloj: el instante de la consulta (ISO). */
  fechaDeLaConsulta: string;
  /** La institución tiene buró (Equifax): con él los bancos traen días y vencido, y se mide la historia. */
  conBuro: boolean;
  operaciones: OperacionDeRiesgo[];
  /** Fuentes de crédito que no contestaron (bancos, cooperativas, comercial, biess): lo que de ahí dependa es «no medido», nunca «no hay». */
  fuentesSinRespuesta: Array<"bancos" | "cooperativas" | "comercial" | "biess">;
  /** null: la fuente de demandas no contestó. */
  demandasDeCobro: DemandaDeCobro[] | null;
  listaDeMalPagador: boolean | null;
  pensionAlimenticia: { enMora: boolean | null; deudaUsd: number | null };
  impedimentoParaCargosPublicos: boolean | null;
  rucSuspendidoNoDepurado: boolean | null;
  multasDeTransitoEnSalariosBasicos: number | null;
  /** Saldo total con cooperativas (las operaciones no lo interpretan por tramos): con él se dice si hay una deuda formal al día de cierto monto. */
  saldoTotalCooperativas: number | null;
  /** Meses seguidos con trabajo o con RUC activo. */
  estabilidadMeses: number | null;
  /** Ingreso reportado al IESS: promedio mensual de los últimos 6 y de los últimos 12 meses (los 6 anteriores salen de los dos). */
  ingresoReportado: { promedioUltimos6: number | null; promedioUltimos12: number | null; ingresoMensual: number | null };
  /** El año del corte del IESS: contra él se mide la variación del Salario Básico Unificado. */
  anioDelCorteDelIess: number | null;
  // ---- sólo con buró ----
  historialMensual: MesDeHistoria[] | null;
  /** Cuánto bajó la deuda total en los últimos 12 meses, sin operaciones nuevas (fracción: 0,10 es 10%); null sin buró. */
  bajaDelEndeudamiento12Meses: number | null;
  /** La deuda total de la consulta anterior de la persona (para la tendencia); null sin una consulta anterior. */
  deudaDeLaConsultaAnterior: number | null;
}

// ---------------------------------------------------------------- el adaptador

type Valor = Hecho["valor"];

const hechoDe = (h: HechosDeLaPersona, codigo: string): Hecho | undefined => h.hechos.find((x) => x.codigo === codigo);
const valorDe = (h: HechosDeLaPersona, codigo: string): Valor | undefined => {
  const x = hechoDe(h, codigo);
  return x && x.calidad !== "no_disponible" ? x.valor : undefined;
};
const sinRespuesta = (h: HechosDeLaPersona, codigo: string) => {
  const x = hechoDe(h, codigo);
  return x?.calidad === "no_disponible" && (x.motivo === "fuente_sin_respuesta" || x.motivo === "fuente_deshabilitada");
};
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Arma la entrada desde la capa de hechos de la persona. Lo que la capa no trae (la historia del buró, la baja del
 * endeudamiento, las multas de tránsito) queda en null: el veredicto lo dice «no medido».
 */
export function entradaDeRiesgoDesdeHechos(h: HechosDeLaPersona, opciones: { conBuro?: boolean } = {}): EntradaDeRiesgo {
  const operaciones: OperacionDeRiesgo[] = [];
  for (const e of h.entidades) {
    if (e.tipo !== "operacion") continue;
    const a = e.atributos as OperacionDeCredito;
    const sector = sectorDe(a.sistema);
    if (!sector) continue;
    operaciones.push({
      clave: e.clave,
      sistema: a.sistema,
      sector,
      rol: a.rol,
      calificacion: a.calificacion,
      diasDeMora: a.diasDeMora,
      saldoVencido: a.saldoVencido,
      saldoNoDevenga: a.saldoNoDevenga,
      saldoEnDemanda: a.saldoEnDemanda,
      saldoCastigado: a.saldoCastigado,
      saldoVigente: a.saldoPorVencer,
      cuotaMensual: a.cuotaMensual,
      saldoTotal: a.saldoTotal ?? null,
      fechaDelDato: e.vistas[0]?.fechaDelDato ?? null,
    });
  }

  const fuentesSinRespuesta: EntradaDeRiesgo["fuentesSinRespuesta"] = [];
  for (const [fuente, codigo] of [["bancos", "ban.operaciones.cantidad"], ["cooperativas", "coop.operaciones.cantidad"], ["comercial", "ret.deudas.cantidad"], ["biess", "biess.operaciones.cantidad"]] as const) {
    if (sinRespuesta(h, codigo)) fuentesSinRespuesta.push(fuente);
  }

  // null: la fuente de demandas no contestó. Sin demandas de cobro (o sin el hecho: la fuente dice «no hay») es una lista vacía.
  const detalle = hechoDe(h, "jud.cobro.detalle");
  const lista = detalle && detalle.calidad !== "no_disponible" && Array.isArray(detalle.valor) ? (detalle.valor as Array<Record<string, unknown>>) : [];
  const demandasDeCobro: DemandaDeCobro[] | null = sinRespuesta(h, "jud.cobro.detalle") || sinRespuesta(h, "jud.cobro.cantidad")
    ? null
    : lista.map((d) => ({
      anio: numero(d.anio),
      quienDemanda: d.quienDemanda === "institucion_financiera" || d.quienDemanda === "empresa" || d.quienDemanda === "persona" ? d.quienDemanda : null,
    }));

  const continuidad = valorDe(h, "ing.continuidad");
  const mesesDeEmpleo = continuidad && typeof continuidad === "object" && !Array.isArray(continuidad) ? numero((continuidad as Record<string, unknown>).meses) : null;
  // Por cuenta propia: con el RUC activo, los meses de la última etapa de la actividad (2.4, estabilidad). Vale el mayor de los dos.
  const mesesDeRuc = valorDe(h, "ruc.activo") === true ? numero(valorDe(h, "ruc.actividad.antiguedad_ultima_etapa_meses")) : null;
  const estabilidadMeses = mesesDeEmpleo === null && mesesDeRuc === null ? null : Math.max(mesesDeEmpleo ?? 0, mesesDeRuc ?? 0);
  const rucEstado = valorDe(h, "ruc.actividad.estado");
  const depurado = valorDe(h, "ruc.depurado_por_el_sri");
  const corte = String(valorDe(h, "ing.corte.usado") ?? "");

  return {
    fechaDeLaConsulta: h.contexto.fechaDeLaConsulta,
    conBuro: opciones.conBuro === true,
    operaciones,
    fuentesSinRespuesta,
    demandasDeCobro,
    // Propuesta a confirmar con el negocio: «la lista de mal pagador» del estándar es la lista negra interna del proveedor (`cum.lista_negra.existe`).
    listaDeMalPagador: typeof valorDe(h, "cum.lista_negra.existe") === "boolean" ? (valorDe(h, "cum.lista_negra.existe") as boolean) : null,
    pensionAlimenticia: {
      enMora: typeof valorDe(h, "jud.pension.con_mora") === "boolean" ? (valorDe(h, "jud.pension.con_mora") as boolean) : null,
      deudaUsd: numero(valorDe(h, "jud.pension.deuda")),
    },
    impedimentoParaCargosPublicos: typeof valorDe(h, "cum.impedimento.existe") === "boolean" ? (valorDe(h, "cum.impedimento.existe") as boolean) : null,
    rucSuspendidoNoDepurado: typeof rucEstado === "string" ? /suspend/i.test(rucEstado) && depurado !== true : null,
    multasDeTransitoEnSalariosBasicos: null,
    saldoTotalCooperativas: numero(valorDe(h, "coop.saldo.total")),
    estabilidadMeses,
    ingresoReportado: {
      promedioUltimos6: numero(valorDe(h, "ing.promedio.ultimos_6")),
      promedioUltimos12: numero(valorDe(h, "ing.promedio.ultimos_12")),
      ingresoMensual: numero(valorDe(h, "ing.reportado.mensual")),
    },
    anioDelCorteDelIess: /^\d{4}/.test(corte) ? Number(corte.slice(0, 4)) : null,
    historialMensual: null,
    bajaDelEndeudamiento12Meses: null,
    deudaDeLaConsultaAnterior: null,
  };
}
