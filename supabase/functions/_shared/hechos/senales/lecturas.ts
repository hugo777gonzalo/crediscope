// Las lecturas de la capa de hechos (docs/capa-de-hechos.md, 1.4 y 11; E11).
//
// Una lectura es una regla de cómo se lee un campo que hasta marco-v36 vivía en el
// marco, en lenguaje natural: que A2 ya es atraso, que los días de mora de una
// cooperativa son de hoy y no históricos, que una demanda archivada no es una
// demanda, que la deuda con casas comerciales es de su corte. Son deterministas: acá
// se calculan desde los hechos, con un código estable, y cada una cita los hechos que
// lee (`derivaDe`). El criterio (cuánto pesa cada cosa, qué recomendar) se queda en el
// marco o pasa al estándar de la institución.
//
// Nada de esto llega todavía al modelo (`llegaAlModelo: false`): el mensaje de
// marco-v36 queda igual byte a byte. Las leen el verificador y, en la versión mayor
// del marco (v37), el perfil del modelo, que reemplazaría con ellas los párrafos de
// PARRAFOS_QUE_SACA_LA_V37.
//
// Reglas de la forma, las mismas de toda señal (1.2 y 3.2):
//   - una lectura lee sólo hechos y diferencias, por código, y nunca el crudo ni un
//     grupo; las reglas que ya existen como funciones (`esIngresoMinimoSbu`,
//     `indiciosDeIngresoMayor`, `dejoDeAparecerEnElIess`, la escala del buró) se
//     importan, no se copian;
//   - un hecho que leyó y que no tiene dato porque su fuente no contestó la deja en
//     `no_se_puede_medir`, nunca en `no_se_cumple` (1.4);
//   - un hecho que no se emitió (su grupo falló en etapa A) también;
//   - el reloj es la fecha de la consulta: ni `new Date()` ni `Date.now()`;
//   - el texto no lleva cifras: la cifra va en `valor` y se escribe con los formatos de
//     siempre al armar el mensaje (1.5), no acá.
//
// Se emiten todas, siempre, en el orden del catálogo: el verificador sabe qué buscar.

import { esFuenteQueNoContesto, FORMA_DE_UN_CODIGO } from "../emisor.ts";
import { catalogoCompleto } from "../indice.ts";
import { CALIFICACIONES_DE_ATRASO_CORTO, CALIFICACIONES_EN_ATRASO, CALIFICACIONES_SIN_ATRASO } from "../calificacion.ts";
import { ahoraDe, mesesEntreFechas } from "../reloj.ts";
import type { Diferencia, ElementoDeLista, Hecho, HechosDeLaPersona, Senal } from "../tipos.ts";
import { CATEGORIA_INVESTIGACION_CERRADA, CATEGORIA_TRAMITE } from "../../demandas.ts";
import { dejoDeAparecerEnElIess, esIngresoMinimoSbu, indiciosDeIngresoMayor, TIPOS_DE_PENSION, TIPOS_DE_SERVICIO_ACTIVO } from "../../fuentes-ingreso.ts";

// lecturas-v1 (E11, 2026-11-20): las 27 primeras, sacadas de marco-v36.
export const LECTURAS_VERSION = "lecturas-v1";

type Valor = Senal["valor"];

export interface Resultado {
  estado: Senal["estado"];
  valor: Valor;
  texto: string;
}

export interface LecturaDelCatalogo {
  codigo: string;
  version: number; // la de la regla: «lec.ban.calificacion.tramo@1»
  descripcion: string;
  unidad: "texto" | "cantidad" | "usd" | "dias" | "meses" | "anios" | "porcentaje" | "si_no" | "lista";
  // Los códigos de hechos y diferencias que la regla puede leer: son su `derivaDe`. Leer
  // uno que no está acá es un error de programación y corta (lo prueba lecturas.test.ts).
  lee: string[];
  // Los párrafos del inventario de marco-v36 que la lectura reemplaza (capa-de-hechos.md, 11.2).
  parrafos: string[];
  llegaAlModelo: boolean;
  calcular: (l: Lector) => Resultado;
}

// ---- La lectura de los hechos ----

class SinDato extends Error {}

// Lo que el perfil escribe cuando el hecho no tiene valor y no es porque la fuente
// no contestó (no aplica, o la fuente no lo informa): `enElPerfilSinValor`.
const SIN_VALOR_EN_EL_PERFIL = new Map(catalogoCompleto().map((c) => [c.codigo, c.enElPerfilSinValor ?? null]));

export class Lector {
  readonly leidos = new Set<string>();
  readonly doc: HechosDeLaPersona;
  private readonly porCodigo: Map<string, Hecho>;
  // Sin propiedades en los parámetros: Node, que corre los guiones, sólo quita los tipos.
  constructor(doc: HechosDeLaPersona) {
    this.doc = doc;
    this.porCodigo = new Map(doc.hechos.map((h) => [h.codigo, h]));
  }

  // El valor como lo lee el perfil. Corta con SinDato si la fuente no contestó o el
  // hecho no se emitió: la lectura queda en «no se puede medir».
  valor(codigo: string): Hecho["valor"] {
    this.leidos.add(codigo);
    const h = this.porCodigo.get(codigo);
    if (!h) throw new SinDato(`no se emitió ${codigo}`);
    if (h.valor !== null) return h.valor;
    if (esFuenteQueNoContesto(h.motivo)) throw new SinDato(`${codigo}: ${h.motivo}`);
    return SIN_VALOR_EN_EL_PERFIL.get(codigo) ?? null;
  }

  numero(codigo: string): number | null {
    const v = this.valor(codigo);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }

  // 0 cuando el hecho no tiene número (no aplica): para sumas y comparaciones con cero.
  cero(codigo: string): number {
    return this.numero(codigo) ?? 0;
  }

  lista(codigo: string): ElementoDeLista[] {
    const v = this.valor(codigo);
    return Array.isArray(v) ? (v as ElementoDeLista[]) : [];
  }

  diferencias(codigo: string): Diferencia[] {
    this.leidos.add(codigo);
    return this.doc.diferencias.filter((d) => d.codigo === codigo);
  }

  // El año de Ecuador (UTC-5, sin horario de verano) del día de la consulta.
  anioDeLaConsulta(): number {
    return new Date(ahoraDe(this.doc.contexto).getTime() - 5 * 3600 * 1000).getUTCFullYear();
  }
}

const no = (texto: string, valor: Valor = null): Resultado => ({ estado: "no_se_cumple", valor, texto });
const si = (texto: string, valor: Valor): Resultado => ({ estado: "se_cumple", valor, texto });
const sinMedir = (texto: string, valor: Valor = null): Resultado => ({ estado: "no_se_puede_medir", valor, texto });

// «aaaa-mm-dd» como fecha local, sin la zona: `new Date(texto)` la leería en UTC.
function fechaIso(v: unknown): Date | null {
  const m = typeof v === "string" ? v.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const sinTildes = (v: unknown): string => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// ---- Las lecturas ----

// La peor calificación de bancos, por tramo. Nunca en días: en el crédito comercial la
// calificación no sale sólo de ellos, y el buró de Proveedor_Info_1 no dice el tipo de crédito.
function tramoDeCalificacion(l: Lector): Resultado {
  const peor = l.valor("ban.calificacion.peor");
  const operaciones = l.cero("ban.operaciones.cantidad");
  if (peor === null) {
    return operaciones === 0
      ? no("No tiene operaciones propias en bancos ni en Diners.", "sin_operaciones")
      : sinMedir("Tiene operaciones propias sin calificación informada.", "sin_calificacion");
  }
  const c = String(peor);
  if (CALIFICACIONES_SIN_ATRASO.has(c)) return si("Sin atraso: A1 es la única calificación de la escala sin atraso, y AL tampoco lo tiene.", "sin_atraso");
  if (CALIFICACIONES_DE_ATRASO_CORTO.has(c)) {
    return si("Atraso corto: A2 y A3 son el primer escalón de atraso. No está al día. La calificación no se traduce a días.", "atraso_corto");
  }
  if (CALIFICACIONES_EN_ATRASO.has(c)) return si("En atraso, según la calificación. La calificación no se traduce a días.", "en_atraso");
  return sinMedir("La calificación no es de la escala conocida.", "no_reconocida");
}

function atrasoSinMonto(l: Lector): Resultado {
  const n = l.cero("ban.operaciones.en_atraso_sin_monto");
  return n > 0
    ? si("Hay operaciones calificadas en atraso sin monto informado: el atraso está y su monto no se conoce. Que la deuda en atraso sea cero no dice que no haya atraso.", n)
    : no("Ninguna operación calificada en atraso está sin monto.", 0);
}

function deudaTodaEnAtraso(l: Lector): Resultado {
  const porVencer = l.cero("ban.saldo.por_vencer");
  const enAtraso = l.cero("ban.saldo.en_atraso");
  return porVencer === 0 && enAtraso > 0
    ? si("Toda su deuda propia con bancos está en atraso: no tiene saldo por vencer. No es una contradicción, es una deuda vencida.", enAtraso)
    : no("No es una deuda de bancos toda en atraso.", null);
}

function garanteContingente(l: Lector): Resultado {
  const n = l.cero("ban.garante.operaciones.cantidad");
  if (n === 0) return no("No respalda deudas de otras personas en bancos.", 0);
  const peor = l.valor("ban.garante.calificacion.peor");
  const conAtraso = peor !== null && CALIFICACIONES_EN_ATRASO.has(String(peor));
  return si(
    `Respalda como codeudora o garante deudas de otra persona: es un riesgo contingente, no su comportamiento de pago, y no se suma a lo propio.${conAtraso ? " Un atraso ahí es de quien debe: se dice como riesgo contingente, nunca como que la persona no pagó." : ""}`,
    l.cero("ban.garante.deuda"),
  );
}

function retailASuCorte(l: Lector): Resultado {
  const n = l.cero("ret.deudas.cantidad");
  if (n === 0) {
    return no("No registra deudas con casas comerciales en el último corte disponible. No prueba que hoy no le deba a una casa comercial.", null);
  }
  const corte = fechaIso(l.valor("ret.corte"));
  if (!corte) return sinMedir("Las deudas con casas comerciales no traen su fecha de corte.", null);
  return si(
    "Las deudas con casas comerciales son a su fecha de corte, no de hoy: esa fuente se actualiza con mucho retraso. Se dicen a esa fecha y no prueban que no haya una deuda posterior.",
    mesesEntreFechas(corte, ahoraDe(l.doc.contexto)),
  );
}

function retailTodaVencida(l: Lector): Resultado {
  const total = l.cero("ret.deuda.total");
  const vencida = l.cero("ret.deuda.vencida");
  return total > 0 && vencida >= total
    ? si("Toda su deuda con casas comerciales está vencida, no vigente (a la fecha de su corte).", vencida)
    : no("No es una deuda con casas comerciales toda vencida.", null);
}

function atrasoDeHoyEnCooperativas(l: Lector): Resultado {
  if (l.cero("coop.operaciones.cantidad") === 0) return no("No tiene operaciones con cooperativas.", null);
  const dias = l.cero("coop.mora.dias_max");
  return dias > 0
    ? si("Los días de mora con cooperativas son de hoy, de la operación más atrasada, no un atraso histórico: hoy debe una cuota con ese atraso.", dias)
    : no("Hoy está al día con cooperativas.", 0);
}

function cuotaIncompleta(l: Lector): Resultado {
  l.valor("coop.cuota.mensual");
  const sinCuota: string[] = [];
  if (l.cero("ban.saldo.por_vencer") + l.cero("ban.saldo.en_atraso") > 0) sinCuota.push("bancos");
  if (l.cero("ret.deuda.total") > 0) sinCuota.push("casas_comerciales");
  return sinCuota.length
    ? si("La cuota conocida es sólo la de cooperativas: tiene deuda con quien no informa su cuota, y la cuota real es mayor.", sinCuota)
    : no("La cuota conocida cubre toda su deuda propia informada.", []);
}

// Sólo bancos, cooperativas y el IESS/BIESS: hoy. Las casas comerciales no entran: su
// corte tiene meses (julio de 2025 en las 490 personas que lo traen el 2026-11-20), y
// cuántos meses de corte cuentan como hoy es una decisión pendiente del atenuante
// `sen.atenuante.hoy_al_dia` (1.4). Sin ninguna operación no es un punto a favor.
function sinMoraVigente(l: Lector): Resultado {
  const tiene = l.cero("ban.operaciones.cantidad") > 0 || l.cero("coop.operaciones.cantidad") > 0 || l.valor("biess.tiene") === true;
  if (!tiene) return no("No tiene operaciones de crédito en bancos, cooperativas ni el IESS/BIESS: no hay mora que decir.", false);
  const peor = l.valor("ban.calificacion.peor");
  const alDia =
    (peor === null || CALIFICACIONES_SIN_ATRASO.has(String(peor))) &&
    l.cero("ban.saldo.en_atraso") === 0 &&
    l.cero("ban.operaciones.en_atraso_sin_monto") === 0 &&
    l.cero("coop.mora.dias_max") <= 0 &&
    l.cero("coop.saldo.en_mora") === 0 &&
    l.cero("biess.mora.dias_max") <= 0;
  return alDia
    ? si("Sin mora vigente en bancos, cooperativas ni el IESS/BIESS: es una ausencia que distingue y va a favor.", true)
    : no("Tiene mora vigente en bancos, cooperativas o el IESS/BIESS.", false);
}

function sinHistorial(l: Lector): Resultado {
  const ninguna =
    l.cero("ban.operaciones.cantidad") === 0 &&
    l.cero("coop.operaciones.cantidad") === 0 &&
    l.cero("ret.deudas.cantidad") === 0 &&
    l.valor("biess.tiene") !== true;
  return ninguna
    ? si("Sin historial: no registra operaciones de crédito propias. No es lo mismo que un mal historial.", true)
    : no("Registra operaciones de crédito propias.", false);
}

function cuotaSobreIngreso(l: Lector): Resultado {
  const ingreso = l.numero("ing.reportado.mensual");
  const cuota = l.cero("coop.cuota.mensual");
  if (!(ingreso && ingreso > 0)) return sinMedir("No hay ingreso reportado al IESS con que comparar la cuota.", null);
  return cuota > 0
    ? si("Cuota conocida (sólo cooperativas) sobre el ingreso reportado al IESS del mes, en porcentaje.", Math.round((cuota / ingreso) * 100))
    : no("No hay una cuota conocida que comparar con el ingreso.", 0);
}

// La deuda propia como la suma el perfil del modelo (endeudamientoDelPerfilDelModelo):
// cada parte redondeada antes de sumar.
function deudaSobreIngresoAnual(l: Lector): Resultado {
  const ingreso = l.numero("ing.reportado.mensual");
  const deuda =
    Math.round(l.cero("ban.saldo.por_vencer") + l.cero("ban.saldo.en_atraso")) + Math.round(l.cero("coop.saldo.total")) + Math.round(l.cero("ret.deuda.total"));
  if (!(ingreso && ingreso > 0)) return sinMedir("No hay ingreso reportado al IESS con que comparar la deuda.", null);
  return deuda > 0
    ? si("Deuda propia total sobre el ingreso reportado al IESS de un año (12 veces el mensual), en porcentaje: un saldo que se paga en años no se compara con un solo mes.", Math.round((deuda / (12 * ingreso)) * 100))
    : no("No tiene deuda propia que comparar con el ingreso.", 0);
}

// Los años se cuentan con el año de Ecuador del día de la CONSULTA. El perfil del modelo
// de marco-v36 los cuenta con el día del análisis (`aniosAtras`): con una consulta de
// diciembre analizada en enero, difieren en uno. Cuál manda se decide en la v37.
function cobroMasReciente(l: Lector): Resultado {
  if (l.cero("jud.cobro.cantidad") === 0) return no("No tiene demandas de cobro en su contra.", null);
  const anios = l.lista("jud.cobro.detalle").map((d) => d.anio).filter((a): a is number => typeof a === "number");
  if (!anios.length) return sinMedir("Las demandas de cobro no traen su año: no se sabe si son recientes o viejas.", null);
  const atras = l.anioDeLaConsulta() - Math.max(...anios);
  if (atras > 2) return si("La demanda de cobro más reciente tiene más de 2 años: es historia, y pesa menos cuanto más vieja.", atras);
  return si(atras <= 1 ? "La demanda de cobro más reciente es del último año: es situación actual." : "La demanda de cobro más reciente tiene 2 años.", atras);
}

function cobroDeInstitucionFinanciera(l: Lector): Resultado {
  if (l.cero("jud.cobro.cantidad") === 0) return no("No tiene demandas de cobro en su contra.", 0);
  const n = l.lista("jud.cobro.detalle").filter((d) => d.quienDemanda === "institucion_financiera").length;
  return n > 0
    ? si("La demanda una institución financiera: dice más de su comportamiento de pago que el cobro de una letra entre personas.", n)
    : no("Ninguna demanda de cobro es de una institución financiera.", 0);
}

const NO_SON_DEMANDAS = new Set([CATEGORIA_INVESTIGACION_CERRADA, CATEGORIA_TRAMITE]);

function civilesQueCuentan(l: Lector): Resultado {
  const total = l.cero("jud.civil.cantidad");
  const noSon = l
    .lista("jud.civil.por_categoria")
    .filter((c) => NO_SON_DEMANDAS.has(String(c.categoria)))
    .reduce((s, c) => s + (typeof c.cantidad === "number" ? c.cantidad : 0), 0);
  return noSon > 0
    ? si("Entre los procesos civiles hay investigaciones penales cerradas sin cargos o trámites: no penalizan y no se cuentan como demandas. El valor es lo que queda.", total - noSon)
    : no("Todos sus procesos civiles son demandas.", total);
}

function pensionEstado(l: Lector): Resultado {
  if (l.valor("jud.pension.existe") !== true) return no("No tiene pensión alimenticia a su cargo: no se menciona, y los demás datos de pensión no significan nada.", "sin_pension");
  return l.valor("jud.pension.con_mora") === true
    ? si("Tiene una pensión alimenticia en mora: incumple una obligación económica exigible.", "en_mora")
    : si("Tiene pensión alimenticia y está al día.", "al_dia");
}

function pensionGastoMensual(l: Lector): Resultado {
  if (l.valor("jud.pension.existe") !== true) return no("No tiene pensión alimenticia a su cargo.", null);
  const vigentes = l.cero("jud.pension.vigentes");
  const mensual = l.cero("jud.pension.valor_mensual");
  return vigentes > 0 && mensual > 0
    ? si("Sus pensiones vigentes son un gasto fijo que ya sale de su ingreso, como una cuota: no todo el ingreso reportado está libre para deuda nueva.", mensual)
    : no("Sus pensiones no tienen un pago mensual: ya no son un gasto, a lo sumo historial.", 0);
}

// Las dos causales que nombra el marco: «DEUDORES A ENTIDADES DEL SECTOR PUBLICO» y
// «MORA CON EL SECTOR PUBLICO».
function causaDelImpedimento(l: Lector): Resultado {
  if (l.valor("cum.impedimento.existe") !== true) return no("No tiene impedimento para cargos públicos.", null);
  const causal = l.valor("cum.impedimento.causal");
  if (causal === null || String(causal).trim() === "") return sinMedir("Tiene impedimento para cargos públicos sin la causal.", null);
  const c = sinTildes(causal);
  return /SECTOR PUBLICO/.test(c) && /DEUDOR|MORA/.test(c)
    ? si("Está impedida por una deuda o mora con el Estado: le debe algo a una entidad pública y no se sabe cuánto.", "deuda_con_el_estado")
    : si("Está impedida por una causa que no dice nada de cómo paga (como estar jubilada o haber cobrado una indemnización del Estado).", "otra_causa");
}

function ingresoMinimoSbu(l: Lector): Resultado {
  const monto = l.numero("ing.reportado.mensual");
  const corte = l.valor("ing.corte.usado");
  return esIngresoMinimoSbu(monto, corte === null ? null : String(corte))
    ? si("Ingreso Mínimo SBU: lo reportado al IESS es el Salario Básico Unificado del año, o está a 5% de él.", monto)
    : no("Lo reportado al IESS no es el Ingreso Mínimo SBU.", monto);
}

// Con los mismos campos de fuentesIngreso que lee indiciosDeIngresoMayor(): la versión,
// las señales de escala, lo reportado, el corte y el impuesto a la renta por año.
function indiciosDeIngreso(l: Lector): Resultado {
  const indicios = indiciosDeIngresoMayor({
    version: l.valor("ing.version"),
    senalesDeEscala: l.valor("ing.senales_de_escala"),
    pisoIngresoMensualReportado: l.valor("ing.reportado.mensual"),
    corteIessUsado: l.valor("ing.corte.usado"),
    detalle: { impuestoRentaPorAnio: l.valor("ing.impuesto_renta.por_anio") },
  });
  return indicios.length
    ? si("Hay indicios de un ingreso mayor que lo reportado al IESS. Ninguno es un monto: no se convierten en una cifra ni se suman.", indicios.map((i) => i.clave))
    : no("Sin indicios de un ingreso mayor: lo reportado al IESS es la mejor evidencia de capacidad que existe, y no se supone un ingreso mayor.", []);
}

function dejoDeAportar(l: Lector): Resultado {
  const dejo = dejoDeAparecerEnElIess({ apareceEnUltimoCorte: l.valor("ing.aparece_en_ultimo_corte"), fuentes: l.valor("ing.fuentes") });
  return dejo
    ? si("Aportaba al IESS y dejó de aparecer: es una pérdida reciente de ingreso formal. Pesa en la capacidad, no en el comportamiento de pago.", l.numero("ing.cortes_desde_la_desvinculacion"))
    : no("No dejó de aparecer en el IESS (o lo explica una jubilación).", null);
}

function regimenEspecial(l: Lector): Resultado {
  const tipos = l.lista("ing.fuentes").map((f) => String(f.tipo));
  const servicio = tipos.filter((t) => TIPOS_DE_SERVICIO_ACTIVO.has(t));
  const pension = tipos.filter((t) => TIPOS_DE_PENSION.has(t) && t !== "jubilación");
  if (!servicio.length && !pension.length) return no("No es militar ni policía, ni cobra su pensión.", []);
  const partes = [
    servicio.length ? "en servicio activo es un empleo del Estado sin monto conocido" : null,
    pension.length ? "un retiro o un montepío es una pensión de monto desconocido" : null,
  ].filter(Boolean);
  return si(`Militar o policía: no aporta al IESS, tiene su propio seguro social; ${partes.join(", y ")}. Nunca es alguien sin ingreso.`, [...servicio, ...pension]);
}

function continuidad(l: Lector): Resultado {
  const co = l.valor("ing.continuidad") as ElementoDeLista | null;
  if (co === null) return no("Según el IESS nunca trabajó con un empleador ni por cuenta propia con RUC activo.", 0);
  const meses = typeof co.meses === "number" ? co.meses : 0;
  return co.vigente === true
    ? si("Trabaja sin cortes de más de 2 meses, aunque haya cambiado de empleo (con un empleador, o por cuenta propia con RUC activo). El valor son los meses.", meses)
    : no("Hoy no trabaja con un empleador ni por cuenta propia con RUC activo.", meses);
}

function huecosDe12Meses(l: Lector): Resultado {
  const tipos = l.lista("ing.fuentes").map((f) => String(f.tipo));
  if (tipos.some((t) => TIPOS_DE_PENSION.has(t))) {
    return no("Cobra una pensión: que no aporte al IESS es lo esperable, no una pérdida de ingreso ni un hueco de estabilidad.", null);
  }
  const meses12 = l.numero("ing.aportes.meses_12");
  if (meses12 === null) return sinMedir("No se pudo contar los meses con aporte.", null);
  if (l.cero("ing.aportes.meses_24") === 0) return no("No aportó al IESS en los últimos 24 meses: no hay huecos que leer.", null);
  return meses12 < 12
    ? si("Tiene meses sin aporte en los últimos 12: son huecos reales. El valor son los meses sin aporte.", 12 - meses12)
    : no("Aportó los 12 meses.", 0);
}

// La misma cuenta que variacionContraHaceUnAnioPct del perfil del modelo.
function variacionAnual(l: Lector): Resultado {
  const ahora = l.numero("ing.reportado.mensual");
  const antes = l.numero("ing.total.hace_12_meses");
  if (!ahora || !antes) return sinMedir("No hay lo reportado de hoy y de hace un año para comparar.", null);
  const pct = Math.round(((ahora - antes) / antes) * 100);
  return pct < 0
    ? si("Lo reportado al IESS cayó contra hace un año. El valor es la variación en porcentaje.", pct)
    : no("Lo reportado al IESS no cayó contra hace un año.", pct);
}

function sinEmpleoRegistrado(l: Lector): Resultado {
  const empleos = l.lista("lab.empleos_actuales");
  return empleos.length === 0
    ? si("Sin un registro del IESS confiable de los últimos 3 meses: es incertidumbre, no desempleo confirmado.", 0)
    : no("Tiene empleos vigentes registrados.", empleos.length);
}

// Decisión 1 de la sección 10.5, pendiente: si el modelo lo lee así.
// La diferencia sólo existe con una operación vigente con saldo (`inst.en_bancos@1`).
function institucionYaEnBancos(l: Lector): Resultado {
  const d = l.diferencias("dif.inst.posible_en_bancos");
  if (!d.length) return no("No hay una operación con la institución que figure en la deuda de bancos.", null);
  return si(
    "La operación vigente con la institución ya figura en la deuda de bancos (la institución reporta por medio de un banco): no son dos deudas.",
    d.some((x) => x.lectura === "revisar") ? "revisar" : "esperada",
  );
}

// ---- El catálogo ----

const lectura = (
  codigo: string,
  unidad: LecturaDelCatalogo["unidad"],
  descripcion: string,
  lee: string[],
  parrafos: string[],
  calcular: LecturaDelCatalogo["calcular"],
): LecturaDelCatalogo => ({ codigo, version: 1, descripcion, unidad, lee, parrafos, llegaAlModelo: false, calcular });

export const CATALOGO_DE_LECTURAS: LecturaDelCatalogo[] = [
  // Bancos, casas comerciales y cooperativas (grupos 3 y 4 del marco)
  lectura("lec.ban.calificacion.tramo", "texto", "Tramo de la peor calificación de bancos: sin atraso, atraso corto o en atraso", ["ban.calificacion.peor", "ban.operaciones.cantidad"], ["P10", "P11"], tramoDeCalificacion),
  lectura("lec.ban.atraso_sin_monto", "cantidad", "Operaciones calificadas en atraso sin monto informado", ["ban.operaciones.en_atraso_sin_monto"], ["P10", "P14"], atrasoSinMonto),
  lectura("lec.ban.deuda.toda_en_atraso", "usd", "Toda la deuda propia de bancos está en atraso", ["ban.saldo.por_vencer", "ban.saldo.en_atraso"], ["P13"], deudaTodaEnAtraso),
  lectura("lec.ban.garante.contingente", "usd", "Deuda de otra persona que respalda: riesgo contingente", ["ban.garante.operaciones.cantidad", "ban.garante.deuda", "ban.garante.calificacion.peor"], ["P15"], garanteContingente),
  lectura("lec.ret.a_su_corte", "meses", "Las deudas con casas comerciales son de su corte: meses del corte a la consulta", ["ret.deudas.cantidad", "ret.corte"], ["P18"], retailASuCorte),
  lectura("lec.ret.deuda.toda_vencida", "usd", "Toda la deuda con casas comerciales está vencida", ["ret.deuda.total", "ret.deuda.vencida"], ["P17"], retailTodaVencida),
  lectura("lec.coop.atraso_de_hoy", "dias", "Días de atraso de hoy con cooperativas", ["coop.operaciones.cantidad", "coop.mora.dias_max"], ["P20"], atrasoDeHoyEnCooperativas),
  // Endeudamiento (grupo 4, ausencias, cómo escribir e indicadores)
  lectura("lec.end.cuota_incompleta", "lista", "Sistemas con deuda que no informan su cuota", ["coop.cuota.mensual", "ban.saldo.por_vencer", "ban.saldo.en_atraso", "ret.deuda.total"], ["P23"], cuotaIncompleta),
  lectura("lec.end.sin_mora_vigente", "si_no", "Sin mora vigente en bancos, cooperativas ni el IESS/BIESS", [
    "ban.operaciones.cantidad", "coop.operaciones.cantidad", "biess.tiene", "ban.calificacion.peor", "ban.saldo.en_atraso",
    "ban.operaciones.en_atraso_sin_monto", "coop.mora.dias_max", "coop.saldo.en_mora", "biess.mora.dias_max",
  ], ["P77"], sinMoraVigente),
  lectura("lec.end.sin_historial", "si_no", "No registra operaciones de crédito propias", ["ban.operaciones.cantidad", "coop.operaciones.cantidad", "ret.deudas.cantidad", "biess.tiene"], ["P82"], sinHistorial),
  lectura("lec.end.cuota_sobre_ingreso", "porcentaje", "Cuota conocida sobre el ingreso reportado al IESS del mes", ["coop.cuota.mensual", "ing.reportado.mensual"], ["P23", "P78"], cuotaSobreIngreso),
  lectura("lec.end.deuda_sobre_ingreso_anual", "porcentaje", "Deuda propia total sobre el ingreso reportado de un año", ["ban.saldo.por_vencer", "ban.saldo.en_atraso", "coop.saldo.total", "ret.deuda.total", "ing.reportado.mensual"], ["P78"], deudaSobreIngresoAnual),
  // Riesgo judicial y cumplimiento (grupos 1, 5 y 6)
  lectura("lec.jud.cobro.mas_reciente", "anios", "Años desde la demanda de cobro más reciente", ["jud.cobro.cantidad", "jud.cobro.detalle"], ["P25"], cobroMasReciente),
  lectura("lec.jud.cobro.de_institucion_financiera", "cantidad", "Demandas de cobro de una institución financiera", ["jud.cobro.cantidad", "jud.cobro.detalle"], ["P25"], cobroDeInstitucionFinanciera),
  lectura("lec.jud.civil.cuentan", "cantidad", "Procesos civiles que son demandas (sin archivadas ni trámites)", ["jud.civil.cantidad", "jud.civil.por_categoria"], ["P27"], civilesQueCuentan),
  lectura("lec.jud.pension.estado", "texto", "Pensión alimenticia: sin pensión, al día o en mora", ["jud.pension.existe", "jud.pension.con_mora"], ["P31"], pensionEstado),
  lectura("lec.jud.pension.gasto_mensual", "usd", "Pensiones vigentes como gasto fijo mensual", ["jud.pension.existe", "jud.pension.vigentes", "jud.pension.valor_mensual"], ["P32"], pensionGastoMensual),
  lectura("lec.cum.impedimento.causa", "texto", "Causa del impedimento para cargos públicos: deuda con el Estado u otra", ["cum.impedimento.existe", "cum.impedimento.causal"], ["P07"], causaDelImpedimento),
  // Fuentes de ingreso y laboral (grupo 8)
  lectura("lec.ing.minimo_sbu", "usd", "Lo reportado al IESS es el Ingreso Mínimo SBU", ["ing.reportado.mensual", "ing.corte.usado"], ["P35"], ingresoMinimoSbu),
  lectura("lec.ing.indicios_de_ingreso_mayor", "lista", "Indicios de un ingreso mayor que lo reportado", ["ing.version", "ing.senales_de_escala", "ing.reportado.mensual", "ing.corte.usado", "ing.impuesto_renta.por_anio"], ["P36"], indiciosDeIngreso),
  lectura("lec.ing.dejo_de_aportar", "meses", "Dejó de aparecer en el IESS sin una jubilación que lo explique", ["ing.aparece_en_ultimo_corte", "ing.fuentes", "ing.cortes_desde_la_desvinculacion"], ["P38", "P47"], dejoDeAportar),
  lectura("lec.ing.regimen_especial", "lista", "Militar o policía: empleo o pensión sin monto conocido", ["ing.fuentes"], ["P39"], regimenEspecial),
  lectura("lec.ing.continuidad", "meses", "Continuidad laboral vigente, en meses", ["ing.continuidad"], ["P46"], continuidad),
  lectura("lec.ing.huecos_12_meses", "meses", "Meses sin aporte en los últimos 12, salvo una pensión", ["ing.fuentes", "ing.aportes.meses_12", "ing.aportes.meses_24"], ["P38", "P46"], huecosDe12Meses),
  lectura("lec.ing.variacion_anual", "porcentaje", "Caída de lo reportado al IESS contra hace un año", ["ing.reportado.mensual", "ing.total.hace_12_meses"], ["P46"], variacionAnual),
  lectura("lec.lab.sin_empleo_registrado", "cantidad", "Sin un empleo vigente registrado en los últimos 3 meses", ["lab.empleos_actuales"], ["P50"], sinEmpleoRegistrado),
  // Comportamiento Interno (grupo 15)
  lectura("lec.inst.ya_en_bancos", "texto", "La operación con la institución ya figura en la deuda de bancos", ["dif.inst.posible_en_bancos"], ["P66"], institucionYaEnBancos),
];

// ---- La derivación ----

// Función pura: los mismos hechos dan las mismas lecturas.
export function aplicarLectura(c: LecturaDelCatalogo, doc: HechosDeLaPersona): Senal {
  const l = new Lector(doc);
  let r: Resultado;
  try {
    r = c.calcular(l);
  } catch (e) {
    if (!(e instanceof SinDato)) throw e;
    r = sinMedir("Falta un dato que esta lectura necesita: una fuente no contestó.");
  }
  const fuera = [...l.leidos].filter((codigo) => !c.lee.includes(codigo));
  if (fuera.length) throw new Error(`La lectura ${c.codigo} leyó códigos que no declara: ${fuera.join(", ")}`);
  return {
    clase: "senal",
    codigo: c.codigo,
    regla: `${c.codigo}@${c.version}`,
    fechaDeLaConsulta: doc.contexto.fechaDeLaConsulta,
    tipo: "lectura",
    valor: r.valor,
    estado: r.estado,
    derivaDe: [...c.lee],
    texto: r.texto,
  };
}

export function derivarLecturas(doc: HechosDeLaPersona): Senal[] {
  return CATALOGO_DE_LECTURAS.map((c) => aplicarLectura(c, doc));
}

// Lo que el diseño exige de un código de lectura (1.1): la forma, el dominio `lec`, que no
// se repita, y que lea sólo códigos del catálogo de hechos. Lo corre la prueba.
export function erroresDelCatalogoDeLecturas(): string[] {
  const errores: string[] = [];
  const deHechos = new Set(catalogoCompleto().map((c) => c.codigo));
  const vistos = new Set<string>();
  for (const c of CATALOGO_DE_LECTURAS) {
    if (!FORMA_DE_UN_CODIGO.test(c.codigo) || !c.codigo.startsWith("lec.")) errores.push(`forma: ${c.codigo}`);
    if (vistos.has(c.codigo)) errores.push(`repetido: ${c.codigo}`);
    vistos.add(c.codigo);
    if (deHechos.has(c.codigo)) errores.push(`ya es un hecho: ${c.codigo}`);
    if (!c.lee.length) errores.push(`no lee nada: ${c.codigo}`);
    for (const h of c.lee) if (!deHechos.has(h)) errores.push(`${c.codigo} lee un código que no existe: ${h}`);
    if (!c.parrafos.length) errores.push(`sin párrafo del marco: ${c.codigo}`);
  }
  return errores;
}
