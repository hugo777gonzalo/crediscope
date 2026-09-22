// Estructura estandarizada de Aval — el análogo de buildStandardProfile de
// Novadata, pero para el buró Aval. Toma el sobre de una consulta A200 y
// deriva campos planos de valor + listas de deudas por entidad.
//
// v1 (2026-09-20) diseñada y validada contra ~510 consultas del ambiente de
// prueba. v2 (2026-09-21) corrige dos hallazgos de una revisión de negocio
// sobre datos reales de las 240 cédulas cacheadas en pruebas/aval/:
//
//  1. FILA RESUMEN FANTASMA (bug real, no de diseño). Los segmentos
//     operacionesVigentes{Banco,Cooperativa,Empresa,Servicio,Cobranza,Tarjeta}
//     traen UNA fila extra mezclada con las operaciones reales: todos sus
//     campos descriptivos son "-" (o `fechaCorte`/`fechaCorteReporte` dice
//     literalmente "TOTAL"), pero sus campos numéricos SON el subtotal del
//     sector. Presente en el 100% de las cédulas con datos en esos 6
//     segmentos (confirmado sobre las 240 respuestas cacheadas). Tratarla
//     como una operación más DUPLICABA cada monto en `deudasPorEntidad`.
//     Se filtra con `esFilaResumen`.
//
//  2. TITULAR VS. CODEUDOR/GARANTE. `tipoDeudorDescripcion` (Titular/
//     Codeudor/Garante) existe en operacionesVigentes{Banco,Cooperativa,
//     Empresa} (NO en Servicio/Cobranza/Tarjeta — Aval no modela codeudor
//     ahí). El 43.8% de las 240 personas de prueba (105/240) tiene al menos
//     una operación como Codeudor. Se verificó que los agregados que Aval
//     entrega (`resumenSaldosTipoDeuda`, `deudaVigenteTotal`,
//     `gastoFinanciero.cuotaEstimadaTitular`) NO separan por rol: en 16/20
//     casos con codeudor real, el agregado de Aval = suma de TODAS las
//     operaciones sin importar el rol (los otros 4 casos son valores
//     placeholder del entorno de prueba, ej. saldos de "$1", que no
//     reconcilian con nada — ruido del generador sintético, no una regla).
//     Decisión de negocio: `deudaBancos`/`deudaCooperativas`/`deudaComercial`
//     y `cuotaBancos`/`cuotaCooperativas`/`cuotaEmpresas` YA NO usan el
//     agregado de Aval — se recalculan sumando SOLO las operaciones con rol
//     Titular. El agregado original de Aval (mezclado) sigue disponible sin
//     tocar en `respuesta_cruda`, que es la fuente para el futuro reporte
//     visual de buró. La deuda/cuota como Codeudor/Garante se separa a
//     `deudasComoCodeudorGarante` (lista aparte) + un resumen escalar
//     ("Deuda contingente"), en vez de mezclarla o descartarla: es
//     exposición real pero de menor riesgo (el deudor directo es otro), y
//     hace falta para no duplicar deuda al calcular el núcleo familiar
//     (ej. cónyuges codeudores entre sí) — ese cruce entre personas queda
//     pendiente para la capa de síntesis multi-fuente, no se resuelve acá.
//     Deuda{Servicios,Cobranza,Tarjetas} y `deudaTarjetas` NO tenían este
//     problema (sin campo de rol) y se dejan como las entrega Aval.
//
// Además, `CAMPOS_NO_PARA_LLM` marca campos que se guardan (sirven para UI,
// auditoría o el futuro reporte de buró) pero NO se mandan al prompt del
// marco interpretativo: identidad (no aporta al análisis y no corresponde
// mandarla), `clientesPeorScore` (decil, muy genérico para 1 sola persona),
// y metadatos de la consulta (`responseCode`, `transactionNumber`) que son
// control nuestro, no señal de riesgo.
//
// El diccionario (ESPEC) y la derivación viven juntos a propósito: cada campo
// es su fila de documentación Y su función de cálculo, así no se desincronizan.
// Huecos en null; no se rellena con cero salvo que Aval mismo diga 0.

import { montoANumero } from "./aval-perfil.ts";

export const AVAL_ESTRUCTURA_VERSION = "aval-estructura-v3";

const arr = (r: any, n: string): any[] => (Array.isArray(r?.[n]) ? r[n] : []);
const s0 = (r: any, n: string): any => arr(r, n)[0] ?? {};
const textoONull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const decimal = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : typeof v === "number" ? v : Number(v));
const round2 = (n: number | null): number | null => (n === null ? null : Math.round(n * 100) / 100);
const mn = (v: unknown): number => montoANumero(v) ?? 0;
const dm = (v: unknown): number | null => { // días de mora: hueco o basura -> null, nunca NaN
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v: unknown): number | null => (typeof v === "number" ? v : montoANumero(v));
const sumBy = (a: any[], k: string): number | null => round2(a.reduce((x, y) => x + mn(y[k]), 0));
const avg = (a: number[]): number | null => (a.length ? round2(a.reduce((x, y) => x + y, 0) / a.length) : null);
const saldoDe = (r: any, c: string): number => { const x = arr(r, "resumenSaldosTipoDeuda").find((z) => z.clasificacion === c); return x ? mn(x.totalDeuda) : 0; };
const nOpDe = (r: any, c: string): number => { const x = arr(r, "resumenNumeroOperacionesPorSegmento").find((z) => z.clasificacion === c); return x ? x.numeroOperaciones ?? 0 : 0; };
const fac = (r: any, i: number): unknown => { const f = arr(r, "factoresScore")[i]; return f ? f.valor : null; };
const SEG_HIST = ["operacionesHistoricasTarjeta","operacionesHistoricasBanco","operacionesHistoricasCooperativa","operacionesHistoricasEmpresa","operacionesHistoricasServicio","operacionesHistoricasCobranza"];
const nOpHistoricas = (r: any): number => SEG_HIST.reduce((a, n) => a + arr(r, n).length, 0);
const CLASES = ["Deuda Bancos","Deuda Cooperativas y Cajas","Deuda Tarjetas de Crédito","Deuda Comercial","Deuda Servicios","Deuda Cobranza"];

// La fila-resumen fantasma: sin identidad propia (razonSocial/nombreCasaCobranza
// = "-") o con la fecha marcada literalmente "TOTAL". Confirmado en el 100% de
// las cédulas con datos en los 6 segmentos operacionesVigentes* — ver nota de
// cabecera. `operacionesHistoricas*` y `detalleTarjetaCredito` NO la traen
// (verificado: 0 casos en las 240 respuestas cacheadas).
function esFilaResumen(o: any): boolean {
  return o.razonSocial === "-" || o.nombreCasaCobranza === "-" || o.fechaCorte === "TOTAL" || o.fechaCorteReporte === "TOTAL";
}
const filasReales = (r: any, seg: string): any[] => arr(r, seg).filter((o) => !esFilaResumen(o));

export interface FactorScore {
  factor: string;
  valor: unknown;
  efecto: "+" | "-" | string;
}

/**
 * Los 10 factores de factoresScore, en su forma natural (factor/valor/
 * efecto) -- para graficar (v3, pantalla "Perfil Aval" del analista). Los
 * campos fac_* de ESPEC son la misma información aplanada con nombre
 * estable, para el admin y el marco interpretativo; esta lista es la que
 * necesita una tabla o un gráfico de barras +/-, y no tiene sentido
 * reconstruirla desde los fac_* cuando Aval ya la entrega así.
 */
export function construirFactoresScore(r: any): FactorScore[] {
  return arr(r, "factoresScore").map((f) => ({ factor: String(f.factor ?? ""), valor: f.valor, efecto: f.efecto === "+" || f.efecto === "-" ? f.efecto : String(f.efecto ?? "") }));
}

export interface DeudaPorEntidad {
  sector: string;
  rol: string | null; // "Titular" | "Codeudor" | "Garante" | null (Servicio/Cobranza/Tarjeta no tienen rol)
  entidad: string | null;
  tipoCredito: string | null;
  diasMora: number | null;
  cuota: number;
  valorVigente: number;
  valorVencido: number;
  valorDemandado: number;
  valorCastigado: number;
  saldo: number;
}

// Una fila por operación, con el mismo esquema para todos los sectores. Banco/
// Cooperativa/Empresa traen tipoDeudorDescripcion (rol); Servicio/Cobranza/
// Tarjeta no lo tienen en el esquema de Aval -> rol null, se cuentan como
// propias (no hay concepto de codeudor ahí).
const SECTORES: [string, string, (x: any) => Omit<DeudaPorEntidad, "sector">][] = [
  ["operacionesVigentesBanco","Banco",(x)=>({rol:textoONull(x.tipoDeudorDescripcion),entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.tipoCreditoDescripcion),diasMora:dm(x.diasMorosidad),cuota:mn(x.cuotaEstimadaOperacion),valorVigente:mn(x.valorxVencerTotal),valorVencido:mn(x.valorVencidoTotal),valorDemandado:mn(x.valorDemandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoTotalCalculado)})],
  ["operacionesVigentesCooperativa","Cooperativa/Mutualista",(x)=>({rol:textoONull(x.tipoDeudorDescripcion),entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.tipoCreditoDescripcion),diasMora:dm(x.diasMorosidad),cuota:mn(x.cuotaEstimadaOperacion),valorVigente:mn(x.valorxVencerTotal),valorVencido:mn(x.valorVencidoTotal),valorDemandado:mn(x.valorDemandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoTotalCalculado)})],
  ["operacionesVigentesEmpresa","Retail/Comercial",(x)=>({rol:textoONull(x.tipoDeudorDescripcion),entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.tipoEntidad),diasMora:dm(x.diasVencido),cuota:mn(x.cuotaEstimadaOperacion),valorVigente:mn(x.valorxVencerTotal),valorVencido:mn(x.valorVencidoTotal),valorDemandado:mn(x.valorDemandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoTotalCalculado)})],
  ["operacionesVigentesServicio","Servicio",(x)=>({rol:null,entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.tipoServicioDescripcion),diasMora:dm(x.numeroDiasVencido),cuota:mn(x.cuotaEstimadaOperacion),valorVigente:mn(x.valorPorVencer),valorVencido:mn(x.valorVencido),valorDemandado:0,valorCastigado:0,saldo:mn(x.totalDeuda)})],
  ["operacionesVigentesCobranza","Cobranza",(x)=>({rol:null,entidad:textoONull(x.nombreCasaCobranza),tipoCredito:null,diasMora:dm(x.numeroDiasVencido),cuota:mn(x.cuotaEstimadaOperacion),valorVigente:mn(x.valorPorVencer),valorVencido:mn(x.valorVencido),valorDemandado:mn(x.demandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoDeuda)})],
  ["operacionesVigentesTarjeta","Tarjeta",(x)=>({rol:null,entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.marcaTarjetaDescripcion),diasMora:dm(x.diasMorosidad),cuota:mn(x.cuotaEstimadaTarjetas),valorVigente:mn(x.capitalxVencerTotal),valorVencido:mn(x.saldoVencido),valorDemandado:mn(x.valorDemandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoTotal)})],
];

function todasLasDeudas(r: any): DeudaPorEntidad[] {
  const filas: DeudaPorEntidad[] = [];
  for (const [seg, sector, map] of SECTORES) for (const x of filasReales(r, seg)) filas.push({ sector, ...map(x) });
  return filas;
}

/** Deuda PROPIA: rol Titular, o sin concepto de rol (Servicio/Cobranza/Tarjeta). */
export function construirDeudasPorEntidad(r: any): DeudaPorEntidad[] {
  return todasLasDeudas(r).filter((d) => d.rol === null || d.rol === "Titular");
}

/**
 * Deuda CONTINGENTE: operaciones donde la persona figura como Codeudor o
 * Garante de una deuda ajena. Es exposición real (si el deudor directo
 * incumple, puede recaer en esta persona) pero de menor riesgo inmediato que
 * la deuda propia -- por eso va separada, no sumada ni descartada.
 */
export function construirDeudasComoCodeudorGarante(r: any): DeudaPorEntidad[] {
  return todasLasDeudas(r).filter((d) => d.rol === "Codeudor" || d.rol === "Garante");
}

const sumaCampo = (lista: DeudaPorEntidad[], campo: "saldo" | "cuota", sector?: string): number =>
  round2(lista.filter((d) => !sector || d.sector === sector).reduce((a, d) => a + d[campo], 0)) ?? 0;

// Métricas de valor desde tendenciaDeuda (36m, cronológica). Cache por si el
// mismo result se recorre varias veces al armar la estructura.
const cacheTend = new WeakMap<object, any>();
function tend(r: any) {
  const serie = arr(r, "tendenciaDeuda");
  if (cacheTend.has(serie)) return cacheTend.get(serie);
  const t = [...serie].sort((a, b) => String(a.fechaCorte).localeCompare(String(b.fechaCorte)));
  const deudas = t.map((p) => mn(p.totalDeuda));
  const vencidos = t.map((p) => mn(p.valorVencidoTotal));
  const previas = deudas.slice(0, -3);
  const o: any = {
    meses: t.length,
    promedio: avg(deudas),
    promedioPrevio: previas.length ? avg(previas) : null,
    reciente3m: deudas.length ? avg(deudas.slice(-3)) : null,
    hace12m: t.length >= 13 ? mn(t[t.length - 13].totalDeuda) : null,
    hace24m: t.length >= 25 ? mn(t[t.length - 25].totalDeuda) : null,
    maxDeuda: deudas.length ? Math.max(...deudas) : null,
    mesesConVencido: vencidos.filter((v) => v > 0).length,
    maxVencido: vencidos.length ? Math.max(...vencidos) : null,
  };
  o.variacionReciente = o.reciente3m != null && o.promedioPrevio != null ? round2(o.reciente3m - o.promedioPrevio) : null;
  cacheTend.set(serie, o);
  return o;
}

type Getter = (r: any, s?: any) => unknown;
export type EntradaEspec = [grupo: string, campo: string, tipo: string, origen: string, temporalidad: string, desc: string, get: Getter];

// Campos que se GUARDAN (sirven para UI, auditoría, o el futuro reporte de
// buró) pero que no se le mandan al LLM en el marco interpretativo: son
// identidad (no debe influir el análisis y no aporta), un decil demasiado
// genérico para el análisis de 1 persona, o metadatos de control de la
// consulta misma (no son señal de riesgo de la persona).
export const CAMPOS_NO_PARA_LLM = new Set<string>([
  "identificacion", "tipoIdentificacion", "nombre", // Identidad
  "clientesPeorScore", // decil (0.1 en 0.1), muy genérico para 1 cliente
  "responseCode", "transactionNumber", // control de la consulta, no señal de riesgo
]);

/** Proyecta la estructura ya armada, quitando los campos de CAMPOS_NO_PARA_LLM. */
export function construirCamposParaLLM(estructura: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(estructura)) if (!CAMPOS_NO_PARA_LLM.has(k)) salida[k] = v;
  return salida;
}

// grupo | campo | tipo | origen | temporalidad | descripción | cálculo
export const ESPEC: EntradaEspec[] = [
  ["Identidad","identificacion","texto","scoreFinanciero","-","Identificación consultada (NO se manda al LLM)",(r)=>textoONull(s0(r,"scoreFinanciero").identificacionSujeto)],
  ["Identidad","tipoIdentificacion","texto","scoreFinanciero","-","Tipo de identificación (NO se manda al LLM)",(r)=>textoONull(s0(r,"scoreFinanciero").tipoIdentificacionSujeto)],
  ["Identidad","nombre","texto","scoreFinanciero","-","Nombre del sujeto (NO se manda al LLM)",(r)=>textoONull(s0(r,"scoreFinanciero").nombreSujeto)],

  ["Score","score","entero","scoreFinanciero","deuda actual","Puntaje de Aval (0–999)",(r)=>typeof s0(r,"scoreFinanciero").score==="number"?s0(r,"scoreFinanciero").score:null],
  ["Score","tipoScore","texto","scoreFinanciero","deuda actual","Tipo de score (vacío = sin historial)",(r)=>textoONull(s0(r,"scoreFinanciero").tipoScore)],
  ["Score","clientesPeorScore","decimal","scoreFinanciero","deuda actual","% de clientes con peor score, en deciles (NO se manda al LLM: muy genérico)",(r)=>decimal(s0(r,"scoreFinanciero").clientesPeorScore)],
  ["Score","tasaMalos","decimal","scoreFinanciero","deuda actual","Prob. de caer en vencido 60d en 12m",(r)=>decimal(s0(r,"scoreFinanciero").tasaMalos)],

  ["Factores del score","fac_nOperacionesActuales","entero","factoresScore","deuda actual","Nº operaciones actuales",(r)=>fac(r,0)],
  ["Factores del score","fac_nOperacionesHistoricas","entero","factoresScore","histórico","Nº operaciones históricas",(r)=>fac(r,1)],
  ["Factores del score","fac_mesesSinVencidos","entero","factoresScore","histórico","Meses sin registro de vencidos",(r)=>fac(r,2)],
  ["Factores del score","fac_nOpConVencidos","entero","factoresScore","histórico","Nº operaciones que registran vencidos",(r)=>fac(r,3)],
  ["Factores del score","fac_nOpVencidos6m","entero","factoresScore","6 meses","Nº op. con vencidos últimos 6m",(r)=>fac(r,4)],
  ["Factores del score","fac_nOpVencidos12m","entero","factoresScore","12 meses","Nº op. con vencidos últimos 12m",(r)=>fac(r,5)],
  ["Factores del score","fac_nOpVencidos24m","entero","factoresScore","24 meses","Nº op. con vencidos últimos 24m",(r)=>fac(r,6)],
  ["Factores del score","fac_nOpAperturadas3m","entero","factoresScore","3 meses","Nº op. aperturadas últimos 3m",(r)=>fac(r,7)],
  ["Factores del score","fac_valorDemandaJudicialHist","dinero","factoresScore","histórico","Valor demanda judicial histórica",(r)=>fac(r,8)],
  ["Factores del score","fac_valorCarteraCastigadaHist","dinero","factoresScore","histórico","Valor cartera castigada histórica",(r)=>fac(r,9)],

  // --- Deuda actual: Bancos/Cooperativas/Comercial recalculados SOLO TITULAR
  // (v2) -- el agregado de Aval mezcla codeudor/garante, ver nota de cabecera.
  // Tarjetas/Servicios/Cobranza siguen del agregado de Aval (sin problema de rol).
  ["Deuda actual","totalDeuda","dinero","(derivado, ver nota v2)","deuda actual","Deuda total propia (bancos/coop/comercial solo Titular + tarjetas/servicios/cobranza de Aval)",(r)=>round2(sumaCampo(construirDeudasPorEntidad(r),"saldo","Banco")+sumaCampo(construirDeudasPorEntidad(r),"saldo","Cooperativa/Mutualista")+sumaCampo(construirDeudasPorEntidad(r),"saldo","Retail/Comercial")+saldoDe(r,"Deuda Tarjetas de Crédito")+saldoDe(r,"Deuda Servicios")+saldoDe(r,"Deuda Cobranza"))],
  ["Deuda actual","deudaBancos","dinero","operacionesVigentesBanco (solo Titular)","deuda actual","Deuda PROPIA en bancos (excluye codeudor/garante)",(r)=>sumaCampo(construirDeudasPorEntidad(r),"saldo","Banco")],
  ["Deuda actual","deudaCooperativas","dinero","operacionesVigentesCooperativa (solo Titular)","deuda actual","Deuda PROPIA en cooperativas/mutualistas (excluye codeudor/garante)",(r)=>sumaCampo(construirDeudasPorEntidad(r),"saldo","Cooperativa/Mutualista")],
  ["Deuda actual","deudaTarjetas","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda en tarjetas de crédito (Aval no modela codeudor acá)",(r)=>saldoDe(r,"Deuda Tarjetas de Crédito")],
  ["Deuda actual","deudaComercial","dinero","operacionesVigentesEmpresa (solo Titular)","deuda actual","Deuda PROPIA comercial/retail (excluye codeudor/garante)",(r)=>sumaCampo(construirDeudasPorEntidad(r),"saldo","Retail/Comercial")],
  ["Deuda actual","deudaServicios","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda en servicios (Aval no modela codeudor acá)",(r)=>saldoDe(r,"Deuda Servicios")],
  ["Deuda actual","deudaCobranza","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda en cobranza (Aval no modela codeudor acá)",(r)=>saldoDe(r,"Deuda Cobranza")],
  ["Deuda actual","valorPorVencerTotal","dinero","deudaVigenteTotal","deuda actual","Saldo por vencer total (agregado de Aval, incluye codeudor/garante)",(r)=>sumBy(arr(r,"deudaVigenteTotal"),"valorPorVencer")],
  ["Deuda actual","valorVencidoTotal","dinero","deudaVigenteTotal","deuda actual","Saldo vencido total (agregado de Aval, incluye codeudor/garante)",(r)=>sumBy(arr(r,"deudaVigenteTotal"),"valorVencido")],
  ["Deuda actual","carteraCastigadaTotal","dinero","deudaVigenteTotal","deuda actual","Cartera castigada total (agregado de Aval, incluye codeudor/garante)",(r)=>sumBy(arr(r,"deudaVigenteTotal"),"carteraCastigada")],
  ["Deuda actual","valorDemandaJudicialTotal","dinero","deudaVigenteTotal","deuda actual","Valor en demanda judicial total (agregado de Aval, incluye codeudor/garante)",(r)=>sumBy(arr(r,"deudaVigenteTotal"),"valorDemandaJudicial")],

  // --- Carga financiera: mismo criterio que Deuda actual (v2) ---
  ["Carga financiera","cuotaMensualEstimada","dinero","(derivado, ver nota v2)","deuda actual","Cuota mensual PROPIA (bancos/coop/comercial solo Titular + cobranza de Aval)",(r)=>round2(sumaCampo(construirDeudasPorEntidad(r),"cuota","Banco")+sumaCampo(construirDeudasPorEntidad(r),"cuota","Cooperativa/Mutualista")+sumaCampo(construirDeudasPorEntidad(r),"cuota","Retail/Comercial")+mn(s0(r,"gastoFinanciero").cuotaCobranza))],
  ["Carga financiera","cuotaBancos","dinero","operacionesVigentesBanco (solo Titular)","deuda actual","Cuota estimada PROPIA en bancos",(r)=>sumaCampo(construirDeudasPorEntidad(r),"cuota","Banco")],
  ["Carga financiera","cuotaCooperativas","dinero","operacionesVigentesCooperativa (solo Titular)","deuda actual","Cuota estimada PROPIA en cooperativas",(r)=>sumaCampo(construirDeudasPorEntidad(r),"cuota","Cooperativa/Mutualista")],
  ["Carga financiera","cuotaEmpresas","dinero","operacionesVigentesEmpresa (solo Titular)","deuda actual","Cuota estimada PROPIA en empresas/retail",(r)=>sumaCampo(construirDeudasPorEntidad(r),"cuota","Retail/Comercial")],
  ["Carga financiera","cuotaCobranza","dinero","gastoFinanciero","deuda actual","Cuota estimada en cobranza (Aval no modela codeudor acá)",(r)=>mn(s0(r,"gastoFinanciero").cuotaCobranza)],

  ["Operaciones","nOpBancos","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones en bancos (todas, sin distinguir rol)",(r)=>nOpDe(r,"Deuda Bancos")],
  ["Operaciones","nOpCooperativas","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones en cooperativas (todas, sin distinguir rol)",(r)=>nOpDe(r,"Deuda Cooperativas y Cajas")],
  ["Operaciones","nTarjetasActivas","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº tarjetas activas",(r)=>nOpDe(r,"Deuda Tarjetas de Crédito")],
  ["Operaciones","nOpComercial","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones comerciales (todas, sin distinguir rol)",(r)=>nOpDe(r,"Deuda Comercial")],
  ["Operaciones","nOpServicios","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones de servicios",(r)=>nOpDe(r,"Deuda Servicios")],
  ["Operaciones","nOpCobranza","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones en cobranza",(r)=>nOpDe(r,"Deuda Cobranza")],
  ["Operaciones","numTarjetasVigentes","entero","indicadoresTarjeta","deuda actual","Nº tarjetas vigentes (indicador)",(r)=>{const v=s0(r,"indicadoresTarjeta").numTarjetasVigentes;return typeof v==="number"?v:null;}],
  ["Operaciones","nOpHistoricas","entero","operacionesHistoricas*","36 meses","Nº operaciones históricas, todos los sistemas (sin distinguir rol todavía — pendiente evaluar si hace falta)",(r)=>nOpHistoricas(r)],
  ["Operaciones","nDeudasVigentes","entero","operacionesVigentes* (solo Titular)","deuda actual","Nº operaciones vigentes PROPIAS (ver deudasPorEntidad)",(r)=>construirDeudasPorEntidad(r).length],
  ["Operaciones","maxDiasMoraVigente","entero","operacionesVigentes* (solo Titular)","deuda actual","Máximo de días de mora entre operaciones PROPIAS vigentes",(r)=>{const d=construirDeudasPorEntidad(r).map((x)=>x.diasMora).filter((x): x is number=>typeof x==="number");return d.length?Math.max(...d):null;}],

  ["Comportamiento de pago","saldoPromedio36M","dinero","indicadoresDeuda","36 meses","Saldo promedio últimos 36m",(r)=>num(s0(r,"indicadoresDeuda").saldoPromedio36M)],
  ["Comportamiento de pago","saldoPromedioTarjetas36M","dinero","indicadoresDeuda","36 meses","Saldo promedio en tarjetas 36m",(r)=>num(s0(r,"indicadoresDeuda").saldoPromedioTarjetas36M)],
  ["Comportamiento de pago","maxMontoDeuda36M","dinero","indicadoresDeuda","36 meses","Máximo monto de deuda 36m",(r)=>num(s0(r,"indicadoresDeuda").maxMontoDeuda)],
  ["Comportamiento de pago","maySaldoVencidoDirecta36M","dinero","indicadoresDeuda","36 meses","Mayor saldo vencido directo 36m",(r)=>num(s0(r,"indicadoresDeuda").maySaldoVencDirecta36M)],
  ["Comportamiento de pago","peorEdadVencidoDirecta36M","texto","indicadoresDeuda","36 meses","Peor edad de vencido (código; puede venir vacío)",(r)=>textoONull(s0(r,"indicadoresDeuda").peorEdadVencidoDirecta36M)],
  ["Comportamiento de pago","fechaUltimoVencido","fecha","indicadoresDeuda","-","Fecha del último vencido (null = ninguno)",(r)=>textoONull(s0(r,"indicadoresDeuda").fechaUltimoVencido)],

  ["Tendencia de deuda","mesesConHistoriaDeuda","entero","tendenciaDeuda","36 meses","Meses con dato de deuda (largo de la serie)",(r)=>tend(r).meses],
  ["Tendencia de deuda","deudaPromedioHistorica","dinero","tendenciaDeuda","36 meses","Promedio de deuda en toda la serie",(r)=>tend(r).promedio],
  ["Tendencia de deuda","endeudamientoPromedioPrevio","dinero","tendenciaDeuda","36 meses","Deuda promedio ANTES de los últimos 3 meses",(r)=>tend(r).promedioPrevio],
  ["Tendencia de deuda","endeudamientoReciente3m","dinero","tendenciaDeuda","3 meses","Deuda promedio en los últimos 3 meses",(r)=>tend(r).reciente3m],
  ["Tendencia de deuda","variacionEndeudamientoReciente","dinero","tendenciaDeuda","3 meses","Reciente − promedio previo (nuevo endeudamiento)",(r)=>tend(r).variacionReciente],
  ["Tendencia de deuda","deudaHace12m","dinero","tendenciaDeuda","-","Deuda 12 meses atrás",(r)=>tend(r).hace12m],
  ["Tendencia de deuda","deudaHace24m","dinero","tendenciaDeuda","-","Deuda 24 meses atrás",(r)=>tend(r).hace24m],
  ["Tendencia de deuda","maxDeudaHistorica","dinero","tendenciaDeuda","36 meses","Máxima deuda en la serie",(r)=>tend(r).maxDeuda],
  ["Tendencia de deuda","mesesConVencido","entero","tendenciaDeuda","36 meses","Nº de meses con saldo vencido > 0",(r)=>tend(r).mesesConVencido],
  ["Tendencia de deuda","maxVencidoHistorico","dinero","tendenciaDeuda","36 meses","Máximo saldo vencido en la serie",(r)=>tend(r).maxVencido],

  ["Acreedores","nAcreedores","entero","rankingAcreedoresDeudaTotal","deuda actual","Nº de acreedores en el ranking",(r)=>arr(r,"rankingAcreedoresDeudaTotal").length],
  ["Acreedores","acreedorPrincipal","texto","rankingAcreedoresDeudaTotal","deuda actual","Acreedor con mayor saldo",(r)=>{const a=arr(r,"rankingAcreedoresDeudaTotal");if(!a.length)return null;return a.reduce((m,x)=>mn(x.valor)>mn(m.valor)?x:m).entidad??null;}],
  ["Acreedores","participacionAcreedorPrincipal","decimal","rankingAcreedoresDeudaTotal","deuda actual","% que concentra el mayor acreedor",(r)=>{const a=arr(r,"rankingAcreedoresDeudaTotal");if(!a.length)return null;const p=a.reduce((m,x)=>mn(x.valor)>mn(m.valor)?x:m).participacionPorcentual;return typeof p==="number"?p:decimal(p);}],

  ["Tarjetas de crédito","cupoTotalTarjetas","dinero","operacionesVigentesTarjeta","deuda actual","Cupo total en tarjetas vigentes",(r)=>sumBy(filasReales(r,"operacionesVigentesTarjeta"),"cupoTarjeta")],
  ["Tarjetas de crédito","consumoTotalTarjetas","dinero","operacionesVigentesTarjeta","deuda actual","Consumo total en tarjetas",(r)=>sumBy(filasReales(r,"operacionesVigentesTarjeta"),"capitalConsumo")],
  ["Tarjetas de crédito","saldoTotalTarjetas","dinero","operacionesVigentesTarjeta","deuda actual","Saldo total en tarjetas",(r)=>sumBy(filasReales(r,"operacionesVigentesTarjeta"),"saldoTotal")],

  // --- Deuda contingente: la persona respalda una deuda AJENA (Codeudor/
  // Garante) dentro de sus propias operaciones vigentes. Distinto de
  // "Garantías otorgadas" abajo (ese es el segmento operacionesCodeudorGarante
  // de Aval, que apunta a la identificación del titular real sin montos).
  ["Deuda contingente (codeudor/garante)","nOperacionesComoCodeudorGarante","entero","operacionesVigentes* (Codeudor/Garante)","deuda actual","Nº de operaciones donde respalda deuda ajena",(r)=>construirDeudasComoCodeudorGarante(r).length],
  ["Deuda contingente (codeudor/garante)","deudaComoCodeudorGaranteTotal","dinero","operacionesVigentes* (Codeudor/Garante)","deuda actual","Saldo total que respalda como codeudor/garante (no es deuda propia)",(r)=>sumaCampo(construirDeudasComoCodeudorGarante(r),"saldo")],
  ["Deuda contingente (codeudor/garante)","cuotaComoCodeudorGaranteTotal","dinero","operacionesVigentes* (Codeudor/Garante)","deuda actual","Cuota total que respalda como codeudor/garante (no afecta directamente su flujo salvo impago del titular)",(r)=>sumaCampo(construirDeudasComoCodeudorGarante(r),"cuota")],
  ["Deuda contingente (codeudor/garante)","maxDiasMoraComoCodeudorGarante","entero","operacionesVigentes* (Codeudor/Garante)","deuda actual","Máximo de días de mora entre esas operaciones (mora del titular real, no de esta persona)",(r)=>{const d=construirDeudasComoCodeudorGarante(r).map((x)=>x.diasMora).filter((x): x is number=>typeof x==="number");return d.length?Math.max(...d):null;}],

  ["Garantías otorgadas a terceros","nOpComoGaranteCodeudor","entero","operacionesCodeudorGarante","deuda actual","Nº de identificaciones AJENAS a las que respalda (sin monto; ver Deuda contingente para el valor)",(r)=>arr(r,"operacionesCodeudorGarante").length],

  ["Relaciones","nEmpresasRelacionadas","entero","relacionEmpresas","-","Nº empresas donde es accionista/administrador",(r)=>arr(r,"relacionEmpresas").length],
  ["Relaciones","esRUC","booleano","informacionComoRUC","-","Tiene RUC personal registrado",(r)=>arr(r,"informacionComoRUC").length>0],

  // inhabilitadoCtaCte: señal de riesgo FUERTE (persona con sanción activa de
  // manejo de cuentas corrientes) -- negado fuerte para el marco interpretativo.
  ["Cuentas corrientes","inhabilitadoCtaCte","booleano","manejoCuentasCorrientes","-","Inhabilitado para cuentas corrientes -- señal de riesgo fuerte, candidato a negado directo",(r)=>arr(r,"manejoCuentasCorrientes").length>0],
  ["Cuentas corrientes","ctaCte_tiempoInhabilitado","texto","manejoCuentasCorrientes","-","Tiempo de inhabilitación",(r)=>textoONull(s0(r,"manejoCuentasCorrientes").tiempoInhabilitadoDescripcion)],
  ["Cuentas corrientes","ctaCte_fechaInhabilitado","fecha","manejoCuentasCorrientes","-","Desde cuándo está inhabilitado",(r)=>textoONull(s0(r,"manejoCuentasCorrientes").fechaInhabilitado)],
  ["Cuentas corrientes","ctaCte_fechaCumplimientoSancion","fecha","manejoCuentasCorrientes","-","Cuándo deja de estar inhabilitado",(r)=>textoONull(s0(r,"manejoCuentasCorrientes").fechaCumplimientoSancion)],
  ["Cuentas corrientes","ctaCte_accion","texto","manejoCuentasCorrientes","-","Acción a tomar",(r)=>textoONull(s0(r,"manejoCuentasCorrientes").accionDescripcion)],
  ["Cuentas corrientes","ctaCte_motivo","texto","manejoCuentasCorrientes","-","Motivo de la inhabilitación",(r)=>textoONull(s0(r,"manejoCuentasCorrientes").motivoInhabilitadoDescripcion)],

  ["Contacto","telefono","texto","datosContacto","-","Teléfono celular",(r)=>textoONull(s0(r,"datosContacto").telefonoCelular)],
  ["Contacto","ciudad","texto","datosContacto","-","Ciudad",(r)=>textoONull(s0(r,"datosContacto").ciudadDescripcion)],
  ["Contacto","sectorContacto","texto","datosContacto","-","Sector",(r)=>textoONull(s0(r,"datosContacto").sector)],
  ["Contacto","direccion","texto","datosContacto","-","Dirección completa",(r)=>textoONull(s0(r,"datosContacto").direccionCompleta)],
  ["Contacto","numeracion","texto","datosContacto","-","Numeración",(r)=>textoONull(s0(r,"datosContacto").numeracion)],

  ["Consultas al buró","consultas12m","entero","titularConsultado12Meses","12 meses","Nº de veces que consultaron a la persona",(r)=>arr(r,"titularConsultado12Meses").length],
  ["Consultas al buró","entidadesDistintas12m","entero","titularConsultado12Meses","12 meses","Nº de entidades distintas que consultaron",(r)=>new Set(arr(r,"titularConsultado12Meses").map((x)=>x.nombreComercial).filter(Boolean)).size],
  ["Consultas al buró","ultimaConsulta","fecha","titularConsultado12Meses","12 meses","Fecha de la consulta más reciente",(r)=>{const f=arr(r,"titularConsultado12Meses").map((x)=>x.fechaConsulta).filter(Boolean).sort();return f[f.length-1]??null;}],

  ["Meta","responseCode","texto","(sobre)","-","Código de respuesta de Aval (A200 = ok). Se guarda para control nuestro; NO se manda al LLM",(_r,s)=>textoONull(s?.responseCode)],
  ["Meta","tieneHistorialCrediticio","booleano","(derivado)","-","Score>0 o alguna deuda/operación",(r)=>{const sc=s0(r,"scoreFinanciero").score;const deuda=CLASES.reduce((a,c)=>a+saldoDe(r,c),0);return (typeof sc==="number"&&sc>0)||deuda>0||nOpHistoricas(r)>0;}],
  ["Meta","nSegmentosConDatos","entero","(derivado)","-","Cuántos de los 34 segmentos vinieron con filas",(r)=>Object.values(r).filter((v)=>Array.isArray(v)&&v.length>0).length],
  ["Meta","transactionNumber","texto","(sobre)","-","Nº de transacción de Aval. Se guarda para trazabilidad; NO se manda al LLM",(_r,s)=>textoONull(s?.transactionNumber)],
];

/**
 * Arma la estructura estandarizada desde el sobre de Aval (responseCode +
 * result). Devuelve los campos planos de ESPEC más las listas de deuda
 * propia (`deudasPorEntidad`) y contingente (`deudasComoCodeudorGarante`).
 */
export function construirEstructuraAval(sobre: any): Record<string, unknown> {
  const r = sobre?.result ?? {};
  const o: Record<string, unknown> = { version: AVAL_ESTRUCTURA_VERSION };
  for (const [, campo, , , , , get] of ESPEC) o[campo] = get(r, sobre);
  o.deudasPorEntidad = construirDeudasPorEntidad(r);
  o.deudasComoCodeudorGarante = construirDeudasComoCodeudorGarante(r);
  o.factoresScore = construirFactoresScore(r);
  return o;
}
