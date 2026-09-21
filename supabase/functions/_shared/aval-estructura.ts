// Estructura estandarizada de Aval — el análogo de buildStandardProfile de
// Novadata, pero para el buró Aval. Toma el sobre de una consulta A200 y
// deriva campos planos de valor + una lista de deudas por entidad.
//
// Diseñada y validada contra ~510 consultas reales del ambiente de prueba
// (2026-09). Decisiones del negocio (ver el Excel de propuesta):
//  - Se distinguen las deudas por entidad (banco/coop/retail/servicio/
//    cobranza/tarjeta) con días de mora y valor vigente/vencido/demandado/
//    castigado -> `deudasPorEntidad`.
//  - De las series NO se copia nada gráfico: de `tendenciaDeuda` se derivan
//    métricas de valor (endeudamiento reciente vs. promedio previo, meses
//    con vencido, etc.). `evolucionScoreFinanciero` y `semaforoMaximoDiasVencido`
//    son coordenadas de gráfico y quedan solo en la respuesta cruda.
//  - Contacto: se guardan TODOS los campos (sirve para poblar el contacto
//    del cliente desde cualquier fuente). Cuentas corrientes: inhabilitación.
//
// El diccionario (ESPEC) y la derivación viven juntos a propósito: cada campo
// es su fila de documentación Y su función de cálculo, así no se desincronizan.
// Huecos en null; no se rellena con cero salvo que Aval mismo diga 0.

import { montoANumero } from "./aval-perfil.ts";

export const AVAL_ESTRUCTURA_VERSION = "aval-estructura-v1";

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

export interface DeudaPorEntidad {
  sector: string;
  entidad: string | null;
  tipoCredito: string | null;
  diasMora: number | null;
  valorVigente: number;
  valorVencido: number;
  valorDemandado: number;
  valorCastigado: number;
  saldo: number;
}

// Una fila por operación vigente, con el mismo esquema para todos los sectores.
const SECTORES: [string, string, (x: any) => Omit<DeudaPorEntidad, "sector">][] = [
  ["operacionesVigentesBanco","Banco",(x)=>({entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.tipoCreditoDescripcion),diasMora:dm(x.diasMorosidad),valorVigente:mn(x.valorxVencerTotal),valorVencido:mn(x.valorVencidoTotal),valorDemandado:mn(x.valorDemandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoTotalCalculado)})],
  ["operacionesVigentesCooperativa","Cooperativa/Mutualista",(x)=>({entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.tipoCreditoDescripcion),diasMora:dm(x.diasMorosidad),valorVigente:mn(x.valorxVencerTotal),valorVencido:mn(x.valorVencidoTotal),valorDemandado:mn(x.valorDemandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoTotalCalculado)})],
  ["operacionesVigentesEmpresa","Retail/Comercial",(x)=>({entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.tipoEntidad),diasMora:dm(x.diasVencido),valorVigente:mn(x.valorxVencerTotal),valorVencido:mn(x.valorVencidoTotal),valorDemandado:mn(x.valorDemandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoTotalCalculado)})],
  ["operacionesVigentesServicio","Servicio",(x)=>({entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.tipoServicioDescripcion),diasMora:dm(x.numeroDiasVencido),valorVigente:mn(x.valorPorVencer),valorVencido:mn(x.valorVencido),valorDemandado:0,valorCastigado:0,saldo:mn(x.totalDeuda)})],
  ["operacionesVigentesCobranza","Cobranza",(x)=>({entidad:textoONull(x.nombreCasaCobranza),tipoCredito:null,diasMora:dm(x.numeroDiasVencido),valorVigente:mn(x.valorPorVencer),valorVencido:mn(x.valorVencido),valorDemandado:mn(x.demandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoDeuda)})],
  ["operacionesVigentesTarjeta","Tarjeta",(x)=>({entidad:textoONull(x.razonSocial),tipoCredito:textoONull(x.marcaTarjetaDescripcion),diasMora:dm(x.diasMorosidad),valorVigente:mn(x.capitalxVencerTotal),valorVencido:mn(x.saldoVencido),valorDemandado:mn(x.valorDemandaJudicial),valorCastigado:mn(x.carteraCastigada),saldo:mn(x.saldoTotal)})],
];

export function construirDeudasPorEntidad(r: any): DeudaPorEntidad[] {
  const filas: DeudaPorEntidad[] = [];
  for (const [seg, sector, map] of SECTORES) for (const x of arr(r, seg)) filas.push({ sector, ...map(x) });
  return filas;
}

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

// grupo | campo | tipo | origen | temporalidad | descripción | cálculo
export const ESPEC: EntradaEspec[] = [
  ["Identidad","identificacion","texto","scoreFinanciero","-","Identificación consultada",(r)=>textoONull(s0(r,"scoreFinanciero").identificacionSujeto)],
  ["Identidad","tipoIdentificacion","texto","scoreFinanciero","-","Tipo de identificación",(r)=>textoONull(s0(r,"scoreFinanciero").tipoIdentificacionSujeto)],
  ["Identidad","nombre","texto","scoreFinanciero","-","Nombre del sujeto",(r)=>textoONull(s0(r,"scoreFinanciero").nombreSujeto)],

  ["Score","score","entero","scoreFinanciero","deuda actual","Puntaje de Aval (0–999)",(r)=>typeof s0(r,"scoreFinanciero").score==="number"?s0(r,"scoreFinanciero").score:null],
  ["Score","tipoScore","texto","scoreFinanciero","deuda actual","Tipo de score (vacío = sin historial)",(r)=>textoONull(s0(r,"scoreFinanciero").tipoScore)],
  ["Score","clientesPeorScore","decimal","scoreFinanciero","deuda actual","% de clientes con peor score",(r)=>decimal(s0(r,"scoreFinanciero").clientesPeorScore)],
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

  ["Deuda actual","totalDeuda","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda total (suma de los 6 tipos)",(r)=>round2(CLASES.reduce((a,c)=>a+saldoDe(r,c),0))],
  ["Deuda actual","deudaBancos","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda en bancos",(r)=>saldoDe(r,"Deuda Bancos")],
  ["Deuda actual","deudaCooperativas","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda en cooperativas/mutualistas",(r)=>saldoDe(r,"Deuda Cooperativas y Cajas")],
  ["Deuda actual","deudaTarjetas","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda en tarjetas de crédito",(r)=>saldoDe(r,"Deuda Tarjetas de Crédito")],
  ["Deuda actual","deudaComercial","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda comercial (retail)",(r)=>saldoDe(r,"Deuda Comercial")],
  ["Deuda actual","deudaServicios","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda en servicios",(r)=>saldoDe(r,"Deuda Servicios")],
  ["Deuda actual","deudaCobranza","dinero","resumenSaldosTipoDeuda","deuda actual","Deuda en cobranza",(r)=>saldoDe(r,"Deuda Cobranza")],
  ["Deuda actual","valorPorVencerTotal","dinero","deudaVigenteTotal","deuda actual","Saldo por vencer total",(r)=>sumBy(arr(r,"deudaVigenteTotal"),"valorPorVencer")],
  ["Deuda actual","valorVencidoTotal","dinero","deudaVigenteTotal","deuda actual","Saldo vencido total",(r)=>sumBy(arr(r,"deudaVigenteTotal"),"valorVencido")],
  ["Deuda actual","carteraCastigadaTotal","dinero","deudaVigenteTotal","deuda actual","Cartera castigada total",(r)=>sumBy(arr(r,"deudaVigenteTotal"),"carteraCastigada")],
  ["Deuda actual","valorDemandaJudicialTotal","dinero","deudaVigenteTotal","deuda actual","Valor en demanda judicial total",(r)=>sumBy(arr(r,"deudaVigenteTotal"),"valorDemandaJudicial")],

  ["Carga financiera","cuotaMensualEstimada","dinero","gastoFinanciero","deuda actual","Cuota mensual total estimada",(r)=>mn(s0(r,"gastoFinanciero").cuotaEstimadaTitular)],
  ["Carga financiera","cuotaBancos","dinero","gastoFinanciero","deuda actual","Cuota estimada en bancos",(r)=>mn(s0(r,"gastoFinanciero").cuotaBancos)],
  ["Carga financiera","cuotaCooperativas","dinero","gastoFinanciero","deuda actual","Cuota estimada en cooperativas",(r)=>mn(s0(r,"gastoFinanciero").cuotaCoop)],
  ["Carga financiera","cuotaEmpresas","dinero","gastoFinanciero","deuda actual","Cuota estimada en empresas",(r)=>mn(s0(r,"gastoFinanciero").cuotaEmpresas)],
  ["Carga financiera","cuotaCobranza","dinero","gastoFinanciero","deuda actual","Cuota estimada en cobranza",(r)=>mn(s0(r,"gastoFinanciero").cuotaCobranza)],

  ["Operaciones","nOpBancos","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones en bancos",(r)=>nOpDe(r,"Deuda Bancos")],
  ["Operaciones","nOpCooperativas","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones en cooperativas",(r)=>nOpDe(r,"Deuda Cooperativas y Cajas")],
  ["Operaciones","nTarjetasActivas","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº tarjetas activas",(r)=>nOpDe(r,"Deuda Tarjetas de Crédito")],
  ["Operaciones","nOpComercial","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones comerciales",(r)=>nOpDe(r,"Deuda Comercial")],
  ["Operaciones","nOpServicios","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones de servicios",(r)=>nOpDe(r,"Deuda Servicios")],
  ["Operaciones","nOpCobranza","entero","resumenNumeroOperacionesPorSegmento","deuda actual","Nº operaciones en cobranza",(r)=>nOpDe(r,"Deuda Cobranza")],
  ["Operaciones","numTarjetasVigentes","entero","indicadoresTarjeta","deuda actual","Nº tarjetas vigentes (indicador)",(r)=>{const v=s0(r,"indicadoresTarjeta").numTarjetasVigentes;return typeof v==="number"?v:null;}],
  ["Operaciones","nOpHistoricas","entero","operacionesHistoricas*","36 meses","Nº operaciones históricas (todos los sistemas)",(r)=>nOpHistoricas(r)],
  ["Operaciones","nDeudasVigentes","entero","operacionesVigentes*","deuda actual","Nº operaciones vigentes (ver deudasPorEntidad)",(r)=>construirDeudasPorEntidad(r).length],
  ["Operaciones","maxDiasMoraVigente","entero","operacionesVigentes*","deuda actual","Máximo de días de mora entre operaciones vigentes",(r)=>{const d=construirDeudasPorEntidad(r).map((x)=>x.diasMora).filter((x): x is number=>typeof x==="number");return d.length?Math.max(...d):null;}],

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

  ["Tarjetas de crédito","cupoTotalTarjetas","dinero","operacionesVigentesTarjeta","deuda actual","Cupo total en tarjetas vigentes",(r)=>sumBy(arr(r,"operacionesVigentesTarjeta"),"cupoTarjeta")],
  ["Tarjetas de crédito","consumoTotalTarjetas","dinero","operacionesVigentesTarjeta","deuda actual","Consumo total en tarjetas",(r)=>sumBy(arr(r,"operacionesVigentesTarjeta"),"capitalConsumo")],
  ["Tarjetas de crédito","saldoTotalTarjetas","dinero","operacionesVigentesTarjeta","deuda actual","Saldo total en tarjetas",(r)=>sumBy(arr(r,"operacionesVigentesTarjeta"),"saldoTotal")],

  ["Garantías","nOpComoGaranteCodeudor","entero","operacionesCodeudorGarante","deuda actual","Nº operaciones como codeudor/garante",(r)=>arr(r,"operacionesCodeudorGarante").length],

  ["Relaciones","nEmpresasRelacionadas","entero","relacionEmpresas","-","Nº empresas donde es accionista/administrador",(r)=>arr(r,"relacionEmpresas").length],
  ["Relaciones","esRUC","booleano","informacionComoRUC","-","Tiene RUC personal registrado",(r)=>arr(r,"informacionComoRUC").length>0],

  ["Cuentas corrientes","inhabilitadoCtaCte","booleano","manejoCuentasCorrientes","-","Inhabilitado para cuentas corrientes",(r)=>arr(r,"manejoCuentasCorrientes").length>0],
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

  ["Meta","responseCode","texto","(sobre)","-","Código de respuesta de Aval (A200 = ok)",(_r,s)=>textoONull(s?.responseCode)],
  ["Meta","tieneHistorialCrediticio","booleano","(derivado)","-","Score>0 o alguna deuda/operación",(r)=>{const sc=s0(r,"scoreFinanciero").score;const deuda=CLASES.reduce((a,c)=>a+saldoDe(r,c),0);return (typeof sc==="number"&&sc>0)||deuda>0||nOpHistoricas(r)>0;}],
  ["Meta","nSegmentosConDatos","entero","(derivado)","-","Cuántos de los 34 segmentos vinieron con filas",(r)=>Object.values(r).filter((v)=>Array.isArray(v)&&v.length>0).length],
  ["Meta","transactionNumber","texto","(sobre)","-","Nº de transacción de Aval",(_r,s)=>textoONull(s?.transactionNumber)],
];

/**
 * Arma la estructura estandarizada desde el sobre de Aval (responseCode +
 * result). Devuelve los campos planos de ESPEC más la lista deudasPorEntidad.
 */
export function construirEstructuraAval(sobre: any): Record<string, unknown> {
  const r = sobre?.result ?? {};
  const o: Record<string, unknown> = { version: AVAL_ESTRUCTURA_VERSION };
  for (const [, campo, , , , , get] of ESPEC) o[campo] = get(r, sobre);
  o.deudasPorEntidad = construirDeudasPorEntidad(r);
  return o;
}
