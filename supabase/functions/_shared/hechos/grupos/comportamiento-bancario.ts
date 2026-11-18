// Grupo 1 de la capa de hechos: bancos y Diners, casas comerciales, el registro
// de deudores y los préstamos del IESS/BIESS (docs/capa-de-hechos.md, 4.1).
//
// ETAPA A. process.ts sigue armando `comportamientoBancario` como hasta acá, y
// este archivo deriva lo mismo en paralelo, con cada registro que usó y cada uno
// que dejó afuera. Las reglas escritas dentro de buildStandardProfile (las sumas
// de bancos, la peor calificación, el corte del retail) quedan escritas dos veces
// hasta la etapa B: por eso `comparar-hechos.mjs` compara campo por campo contra
// el perfil y `probar-crudos-sinteticos.mjs` repite la paridad en cada PR.
//
// La unión del BIESS (`operacionesIessBiess`) el diseño la MUEVE acá, y no se
// movió: el PR 173 (abierto) la cambia en process.ts para sumar la fecha de fin
// de cada préstamo. Moverla ahora pisaba ese cambio; la regla de abajo es la de
// estructura-v21 con sus registros, y la mudanza va con la etapa B.

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import {
  aportesDe,
  type AnyRecord,
  citar,
  corteMasAntiguo,
  fechaIsoDe,
  type Fila,
  filasDe,
  num,
  redondear,
  refDeFila,
  refDeRespuesta,
  respuestaDe,
  textoDe,
} from "../lectura-del-crudo.ts";
import { diaDeLaConsulta } from "../reloj.ts";
import type {
  CodigoDelCatalogo,
  Contexto,
  Descarte,
  DiferenciaEsperada,
  Entidad,
  MotivoDeNoDisponible,
  OperacionDeCredito,
  RefDeRegistro,
  VistaDeFuente,
} from "../tipos.ts";

const P = "comportamientoBancario.";

// Lo nuevo (sin campo del perfil) no llega al modelo sin una decisión del negocio.
function codigo(
  codigo: string,
  unidad: CodigoDelCatalogo["unidad"],
  descripcion: string,
  campo: string | null,
  enElPerfilSinValor: CodigoDelCatalogo["enElPerfilSinValor"],
  recuento?: CodigoDelCatalogo["recuento"],
): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo, unidad, descripcion, llegaAlModelo: campo !== null, esIdentificador: false };
  if (campo !== null) {
    c.campoDelPerfil = P + campo;
    c.enElPerfilSinValor = enElPerfilSinValor;
  }
  if (recuento) c.recuento = recuento;
  return c;
}

export const CATALOGO: CodigoDelCatalogo[] = [
  codigo("ban.registro_deudores.figura", "si_no", "Figura en el registro de deudores", "figuraEnRegistroDeudores", false),
  codigo("ban.operaciones.cantidad", "cantidad", "Operaciones propias en bancos y Diners", "numeroOperacionesBuroCredito", 0, "conteo"),
  codigo("ban.operaciones.sin_rol.cantidad", "cantidad", "Operaciones sin rol reconocido, leídas como propias", null, null, "conteo"),
  codigo("ban.calificacion.peor", "texto", "Peor calificación de las operaciones propias", "peorCalificacionRiesgo", null),
  codigo("ban.calificacion.mejor", "texto", "Mejor calificación de las operaciones propias", "mejorCalificacionRiesgo", null),
  codigo("ban.operaciones.con_demanda", "si_no", "Tiene una operación propia en demanda judicial", "tieneOperacionConDemanda", false),
  codigo("ban.saldo.en_demanda", "usd", "Saldo propio en demanda judicial", null, null, "suma"),
  codigo("ban.operaciones.castigadas", "si_no", "Tiene una operación propia castigada", "tieneOperacionCastigada", false),
  codigo("ban.saldo.castigado", "usd", "Saldo propio castigado", null, null, "suma"),
  codigo("ban.saldo.por_vencer", "usd", "Saldo propio por vencer en bancos y Diners", "saldoTotalVigente", 0, "suma"),
  codigo("ban.saldo.vencido", "usd", "Saldo propio vencido en bancos y Diners", "saldoEnMoraBuroCredito", 0, "suma"),
  codigo("ban.saldo.no_devenga", "usd", "Saldo propio que no devenga intereses", "saldoNoDevengaIntereses", 0, "suma"),
  codigo("ban.saldo.en_atraso", "usd", "Deuda propia en atraso: vencido, no devenga, en demanda y castigado", "deudaEnAtraso", 0, "suma"),
  codigo("ban.operaciones.en_atraso_sin_monto", "cantidad", "Operaciones propias calificadas en atraso sin monto informado", "operacionesEnAtrasoSinMonto", 0, "conteo"),
  codigo("ban.garante.operaciones.cantidad", "cantidad", "Operaciones como garante o codeudor", "numeroOperacionesComoGaranteOCodeudor", 0, "conteo"),
  codigo("ban.garante.deuda", "usd", "Deuda de las operaciones como garante o codeudor", "deudaComoGaranteOCodeudor", 0, "suma"),
  codigo("ban.garante.calificacion.peor", "texto", "Peor calificación como garante o codeudor", "peorCalificacionComoGaranteOCodeudor", null),
  codigo("biess.prestamos.en_la_fuente.cantidad", "cantidad", "Préstamos del IESS/BIESS en la fuente de préstamos (sin la base interna)", "numeroCreditosFormales", 0, "conteo"),
  codigo("biess.operaciones.cantidad", "cantidad", "Préstamos del IESS/BIESS de la persona, unidas las dos fuentes", null, null, "conteo"),
  codigo("biess.tiene", "si_no", "Tiene préstamos del IESS/BIESS", "tieneCreditoIessBiess", false),
  codigo("biess.mora.dias_max", "dias", "Días de mora máximos en préstamos del IESS/BIESS", "diasMoraCreditoIessBiess", null, "maximo"),
  codigo("biess.saldo", "usd", "Saldo de los préstamos del IESS/BIESS", "saldoPrestamosIessBiess", null, "suma"),
  codigo("ret.deudas.cantidad", "cantidad", "Deudas con casas comerciales", "numeroDeudasRetail", 0, "conteo"),
  codigo("ret.mora.dias_max", "dias", "Días de mora máximos con casas comerciales, a su corte", "diasMoraMaximaRetail", null, "maximo"),
  codigo("ret.deuda.total", "usd", "Deuda total con casas comerciales, a su corte", "totalDeudaRetail", 0, "suma"),
  codigo("ret.deuda.vencida", "usd", "Deuda vencida con casas comerciales, a su corte", "valorVencidoRetail", 0, "suma"),
  codigo("ret.corte", "fecha", "Corte más antiguo de las casas comerciales", "fechaCorteRetail", null),
  codigo("ret.corte.mas_reciente", "fecha", "Corte más reciente de las casas comerciales", null, null),
  codigo("dif.biess.saldo", "usd", "Saldo de un préstamo del IESS/BIESS según cada fuente", null, null),
  codigo("dif.biess.fecha_de_concesion", "fecha", "Concesión de un préstamo del IESS/BIESS según cada fuente", null, null),
];

// Las que unen, eligen o descartan registros: cada una con un crudo inventado
// en que aplica y uno en que no (scripts/crudos-sinteticos/, campo `reglas`).
export const REGLAS_QUE_MEZCLAN: string[] = [
  "ban.propias@1", // descarta las filas de garante o codeudor
  "ban.calificacion@1", // elige UNA operación; «AL» no cuenta salvo que sea la única
  "ban.vencido@1", // elige `saldomora` o `mora` por fila
  "biess.union@2", // une las dos fuentes y descarta los terminados de la base interna
  "biess.mora@1", // en una unida, elige la vista con más días
  "ret.corte@1", // elige la fila del corte más antiguo
];

export const DIFERENCIAS_ESPERADAS: DiferenciaEsperada[] = [];

// Campos del perfil que todavía no salen de un hecho, cada uno con su porqué.
// Es la única excepción a «cero campos sin procedencia», y se informa en cada
// comparación: no se esconde.
export const CAMPOS_PENDIENTES: Array<{ campo: string; motivo: string }> = [
  {
    // estructura-v22 (PR 173) suma el tipo y la fecha de fin de cada préstamo a
    // operacionesIessBiess de process.ts. Copiarlo acá dejaba la regla escrita
    // dos veces mientras ese PR se asentaba; entra cuando la unión del BIESS se
    // mude a hechos/ (etapa B), una sola vez y con su registro de la fecha.
    campo: "comportamientoBancario.operacionesIessBiess",
    motivo: "estructura-v22 (PR 173): el tipo y la fecha de fin entran con la mudanza de la unión del BIESS a hechos/, en la etapa B",
  },
];

// ---- Reglas copiadas de process.ts (etapa A) ----

// La escala de calificaciones del buró, de mejor a peor (process.ts).
const ESCALA_CALIFICACION = ["A1", "A2", "A3", "B1", "B2", "C1", "C2", "D", "E"];
const CALIFICACIONES_EN_ATRASO = new Set(["A2", "A3", "B1", "B2", "C1", "C2", "D", "E"]);

// extremoDeCalificacion() de process.ts, devolviendo además la fila: la que se
// cita es la primera con esa calificación.
function extremo(filas: Fila[], cual: "peor" | "mejor"): { valor: string; fila: Fila } | null {
  const conCalificacion = filas.filter((f) => String(f.r.calificacion ?? "").trim());
  const todas = conCalificacion.map((f) => String(f.r.calificacion ?? "").trim());
  const enEscala = todas.filter((c) => ESCALA_CALIFICACION.includes(c)).sort((a, b) => ESCALA_CALIFICACION.indexOf(a) - ESCALA_CALIFICACION.indexOf(b));
  const valor = enEscala.length ? (cual === "peor" ? enEscala.at(-1)! : enEscala[0]) : todas[0];
  if (valor === undefined) return null;
  return { valor, fila: conCalificacion.find((f) => String(f.r.calificacion ?? "").trim() === valor)! };
}

const campoVencido = (r: AnyRecord) => ((num(r.saldomora) ?? 0) > 0 ? "saldomora" : "mora");
const vencido = (r: AnyRecord) => {
  const saldomora = num(r.saldomora) ?? 0;
  return saldomora > 0 ? saldomora : num(r.mora) ?? 0;
};
const enAtraso = (r: AnyRecord) => vencido(r) + (num(r.noDevengaInteres) ?? 0) + (num(r.judicial) ?? 0) + (num(r.castigo) ?? 0);
const deudaDe = (r: AnyRecord) => (num(r.saldoVigente) ?? 0) + enAtraso(r);
const esGarantia = (r: AnyRecord) => r.riesgo === "G" || r.riesgo === "C";

// diaDeFechaDDMMYYYY() de process.ts: no valida la fecha (el 31/02 pasa al 3 de
// marzo), y así tiene que quedar mientras la regla viva en los dos lados.
function diaDeFechaDDMMYYYY(v: unknown): number | null {
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? Math.floor(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) / 86_400_000) : null;
}

// fechaDeCorte() de process.ts acepta sólo día/mes/año; fechaIsoDe acepta
// además año/mes/día, que en el retail no se vio nunca pero cambiaría el campo.
const corteRetail = (v: unknown) => (/^\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})$/.test(String(v ?? "").trim()) ? fechaIsoDe(v) : null);

const DIAS_DE_TOLERANCIA_EN_LA_CONCESION = 31;
const sinCeros = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");
// Qué campo leyó un `a ?? b` sobre la fila: el de la base interna quirografaria
// o el `sr...` de la hipotecaria.
const leido = (r: AnyRecord, a: string, b: string) => (r[a] !== null && r[a] !== undefined ? a : b);

interface OperacionIess {
  numero: string;
  dia: number | null;
  monto: number | null;
  saldo: number;
  diasMora: number;
  manda: Fila;
  camposDeSaldo: string[];
  moraDe: { fila: Fila; campo: string };
  base: Array<{ fila: Fila; saldo: number; campoDeSaldo: string; dia: number | null; criterio: "numero" | "monto_y_fecha" }>;
}

// operacionesIessBiess() de process.ts (estructura-v21) con sus registros. El
// reloj es la fecha de la consulta, no la hora en que corre.
function unirIessBiess(deLaBase: Fila[], deLosPrestamos: Fila[], hoy: number) {
  const prestamos: OperacionIess[] = deLosPrestamos.map((f) => ({
    numero: sinCeros(f.r.nroOperacion),
    dia: diaDeFechaDDMMYYYY(f.r.fechaConcesion),
    monto: num(f.r.valorPrestamo),
    saldo: (num(f.r.valorPorVencer) ?? 0) + (num(f.r.valorVencido) ?? 0),
    diasMora: num(f.r.diasMora) ?? 0,
    manda: f,
    camposDeSaldo: ["valorPorVencer", "valorVencido"],
    moraDe: { fila: f, campo: "diasMora" },
    base: [],
  }));
  type Clave = { numero: string; dia: number | null; monto: number | null };
  const esLaMisma = (a: Clave, b: Clave) =>
    (a.numero !== "" && a.numero === b.numero) ||
    (a.monto !== null && b.monto !== null && Math.abs(a.monto - b.monto) <= 1 &&
      a.dia !== null && b.dia !== null && Math.abs(a.dia - b.dia) <= DIAS_DE_TOLERANCIA_EN_LA_CONCESION);
  const salida = [...prestamos];
  const terminados: Fila[] = [];
  for (const f of deLaBase) {
    const r = f.r;
    const campoDeSaldo = leido(r, "saldoTotalCredito", "srSaldototalcredito");
    const campoDeMora = leido(r, "diasMoraAfi", "srDiasmoraafi");
    const o = {
      numero: sinCeros(r.numeroOperacion ?? r.srNrooperaciongaf),
      dia: diaDeFechaDDMMYYYY(r.fechaConsesion ?? r.srFecprimerdesembolso),
      monto: num(r.montoTransferido ?? r.srMontofinanciado),
      saldo: num(r.saldoTotalCredito ?? r.srSaldototalcredito) ?? 0,
      diasMora: num(r.diasMoraAfi ?? r.srDiasmoraafi) ?? 0,
    };
    const repetida = prestamos.find((p) => esLaMisma(p, o));
    if (repetida) {
      if (o.diasMora > repetida.diasMora) repetida.moraDe = { fila: f, campo: campoDeMora };
      repetida.diasMora = Math.max(repetida.diasMora, o.diasMora);
      const porNumero = repetida.numero !== "" && repetida.numero === o.numero;
      repetida.base.push({ fila: f, saldo: o.saldo, campoDeSaldo, dia: o.dia, criterio: porNumero ? "numero" : "monto_y_fecha" });
      continue;
    }
    const estado = String(r.estadoOperacion ?? r.srEstadocredito ?? "").trim().toUpperCase();
    const fin = diaDeFechaDDMMYYYY(r.fechaFinCredito ?? r.srFecfincredito);
    const terminado = estado === "VIGENTE" && fin !== null && fin < hoy && o.diasMora === 0;
    if (terminado) terminados.push(f);
    else salida.push({ ...o, manda: f, camposDeSaldo: [campoDeSaldo], moraDe: { fila: f, campo: campoDeMora }, base: [] });
  }
  return { operaciones: salida, terminados };
}

// ---- Las entidades ----

function vista(consulta: string, crudo: AnyRecord, f: Fila, atributos: Partial<OperacionDeCredito>): VistaDeFuente<OperacionDeCredito> {
  const registro = refDeFila(consulta, f);
  return { registro, fechaDelDato: corteMasAntiguo(crudo, [registro]), atributos };
}

function operacion(o: Partial<OperacionDeCredito> & Pick<OperacionDeCredito, "sistema" | "rol">): OperacionDeCredito {
  return {
    acreedor: null, estado: null, fechaDeConcesion: null, montoOriginal: null, saldoPorVencer: null, saldoVencido: null,
    saldoNoDevenga: null, saldoEnDemanda: null, saldoCastigado: null, diasDeMora: null, calificacion: null, cuotaMensual: null,
    ...o,
  };
}

const ATRIBUCION_POR_IDENTIFICACION: Entidad["atribucion"] = { deLaPersona: "si", metodo: "la_fuente_busca_por_identificacion" };

// ---- emitir ----

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const h = ayudanteDelGrupo(emisor, CATALOGO);
  const respuesta = (fuente: string, lista: string) => refDeRespuesta(crudo, consulta, fuente, lista);
  const filasRef = (filas: Fila[], campo?: string) => filas.map((f) => refDeFila(consulta, f, campo));
  // La primera fuente que no contestó, o null si contestaron todas.
  const faltaUna = (fuentes: string[]): MotivoDeNoDisponible | null => {
    for (const f of fuentes) {
      const r = respuestaDe(crudo, f);
      if (r !== "contesto") return r;
    }
    return null;
  };

  // ---- Bancos y Diners ----
  const BANCOS = ["buroCreditoSuper", "buroCreditoDiners"];
  const filasBanco = [...filasDe(crudo, "buroCreditoSuper", "datosSuper"), ...filasDe(crudo, "buroCreditoDiners", "datosSuper")];
  const propias = filasBanco.filter((f) => !esGarantia(f.r));
  const garantias = filasBanco.filter((f) => esGarantia(f.r));
  const respuestasBanco = BANCOS.map((f) => respuesta(f, "datosSuper"));
  const descartadasPorRol: Descarte[] = garantias.map((f) => ({ registro: refDeFila(consulta, f, "riesgo"), motivo: "rol_garante_o_codeudor" }));
  const sinBancos = faltaUna(BANCOS);

  for (const f of filasBanco) {
    const atributos = operacion({
      sistema: f.fuente === "buroCreditoDiners" ? "tarjeta_diners" : "bancos",
      acreedor: textoDe(f.r.entnombre),
      rol: f.r.riesgo === "G" ? "garante" : f.r.riesgo === "C" ? "codeudor" : "titular",
      saldoPorVencer: num(f.r.saldoVigente),
      saldoVencido: vencido(f.r),
      saldoNoDevenga: num(f.r.noDevengaInteres),
      saldoEnDemanda: num(f.r.judicial),
      saldoCastigado: num(f.r.castigo),
      // D4 (negocio, 2026-11-18): la fuente no informa días de atraso y la
      // calificación no se traduce a días.
      diasDeMora: null,
      calificacion: textoDe(f.r.calificacion),
    });
    // Sin número de operación ni fecha de concesión: la identifica su posición (1.3).
    emisor.entidad({
      clave: emisor.clave("op", `${f.fuente}#${f.indice}`),
      tipo: "operacion",
      atributos,
      vistas: [vista(consulta, crudo, f, atributos)],
      union: null,
      atribucion: ATRIBUCION_POR_IDENTIFICACION,
    });
  }

  if (sinBancos) {
    for (const c of CATALOGO) if (c.codigo.startsWith("ban.") && c.codigo !== "ban.registro_deudores.figura") h.sinValor(c.codigo, "ban.propias@1", BANCOS, sinBancos);
  } else {
    const conteo = (cod: string, regla: string, filas: Fila[], campo?: string, descartados?: Descarte[]) => {
      const registros = filas.length ? filasRef(filas, campo) : respuestasBanco;
      h.confirmado(cod, regla, BANCOS, filas.length, registros, corteMasAntiguo(crudo, registros), { descartados });
    };
    const suma = (cod: string, regla: string, filas: Fila[], valor: number, campos: Array<(f: Fila) => string>, descartados?: Descarte[]) => {
      const aportaron = campos.flatMap((campoDe) => aportesDe(consulta, filas, campoDe));
      const registros = citar(aportaron, filasRef(filas), respuestasBanco);
      h.confirmado(cod, regla, BANCOS, valor, registros, corteMasAntiguo(crudo, registros), { descartados });
    };
    const alguna = (cod: string, regla: string, campo: string) => {
      const con = propias.filter((f) => (num(f.r[campo]) ?? 0) > 0);
      const registros = citar(filasRef(con, campo), filasRef(propias), respuestasBanco);
      h.confirmado(cod, regla, BANCOS, con.length > 0, registros, corteMasAntiguo(crudo, registros));
    };
    const calificacion = (cod: string, filas: Fila[], cual: "peor" | "mejor", descartados?: Descarte[]) => {
      const e = extremo(filas, cual);
      if (!e) return h.sinValor(cod, "ban.calificacion@1", BANCOS, filas.length ? "la_fuente_no_lo_informa" : "no_aplica");
      const registros = [refDeFila(consulta, e.fila, "calificacion")];
      h.confirmado(cod, "ban.calificacion@1", BANCOS, e.valor, registros, corteMasAntiguo(crudo, registros), { descartados });
    };

    conteo("ban.operaciones.cantidad", "ban.propias@1", propias, undefined, descartadasPorRol);
    conteo("ban.operaciones.sin_rol.cantidad", "ban.propias@1", propias.filter((f) => f.r.riesgo !== "T"), "riesgo");
    calificacion("ban.calificacion.peor", propias, "peor", descartadasPorRol);
    calificacion("ban.calificacion.mejor", propias, "mejor");
    alguna("ban.operaciones.con_demanda", "ban.con_demanda@1", "judicial");
    alguna("ban.operaciones.castigadas", "ban.castigadas@1", "castigo");
    const sumaDe = (filas: Fila[], campo: string) => redondear(filas.reduce((s, f) => s + (num(f.r[campo]) ?? 0), 0));
    suma("ban.saldo.en_demanda", "ban.suma@1", propias, sumaDe(propias, "judicial"), [() => "judicial"]);
    suma("ban.saldo.castigado", "ban.suma@1", propias, sumaDe(propias, "castigo"), [() => "castigo"]);
    suma("ban.saldo.por_vencer", "ban.suma@1", propias, sumaDe(propias, "saldoVigente"), [() => "saldoVigente"]);
    suma("ban.saldo.vencido", "ban.vencido@1", propias, redondear(propias.reduce((s, f) => s + vencido(f.r), 0)), [(f) => campoVencido(f.r)]);
    suma("ban.saldo.no_devenga", "ban.suma@1", propias, sumaDe(propias, "noDevengaInteres"), [() => "noDevengaInteres"]);
    const camposDeAtraso = [(f: Fila) => campoVencido(f.r), () => "noDevengaInteres", () => "judicial", () => "castigo"];
    suma("ban.saldo.en_atraso", "ban.en_atraso@1", propias, redondear(propias.reduce((s, f) => s + enAtraso(f.r), 0)), camposDeAtraso, descartadasPorRol);
    const sinMonto = propias.filter((f) => CALIFICACIONES_EN_ATRASO.has(String(f.r.calificacion)) && deudaDe(f.r) === 0);
    conteo("ban.operaciones.en_atraso_sin_monto", "ban.sin_monto@1", sinMonto, "calificacion");
    conteo("ban.garante.operaciones.cantidad", "ban.garantias@1", garantias, "riesgo");
    suma("ban.garante.deuda", "ban.suma@1", garantias, redondear(garantias.reduce((s, f) => s + deudaDe(f.r), 0)), [() => "saldoVigente", ...camposDeAtraso]);
    calificacion("ban.garante.calificacion.peor", garantias, "peor");
  }

  // ---- Registro de deudores ----
  const sinDeudores = faltaUna(["deudores"]);
  if (sinDeudores) h.sinValor("ban.registro_deudores.figura", "deu.figura@1", ["deudores"], sinDeudores);
  else {
    const filas = filasDe(crudo, "deudores", "deudores");
    h.confirmado("ban.registro_deudores.figura", "deu.figura@1", ["deudores"], filas.length > 0, filas.length ? filasRef(filas) : [respuesta("deudores", "deudores")], null);
  }

  // ---- Casas comerciales ----
  const RET = ["retails"];
  const sinRetail = faltaUna(RET);
  const retails = filasDe(crudo, "retails", "retails");
  const respuestaRetail = [respuesta("retails", "retails")];
  for (const f of retails) {
    const atributos = operacion({
      sistema: "comercial",
      acreedor: textoDe(f.r.institucion),
      rol: "titular",
      saldoVencido: num(f.r.valorVencido),
      saldoEnDemanda: num(f.r.valorProcesoJudicial),
      saldoCastigado: num(f.r.valorProcesoCastigado),
      diasDeMora: num(f.r.diasMora),
    });
    emisor.entidad({ clave: emisor.clave("op", `retails#${f.indice}`), tipo: "operacion", atributos, vistas: [vista(consulta, crudo, f, atributos)], union: null, atribucion: ATRIBUCION_POR_IDENTIFICACION });
  }
  if (sinRetail) {
    for (const c of CATALOGO) if (c.codigo.startsWith("ret.")) h.sinValor(c.codigo, "ret.conteo@1", RET, sinRetail);
  } else {
    const registrosConteo = retails.length ? filasRef(retails) : respuestaRetail;
    h.confirmado("ret.deudas.cantidad", "ret.conteo@1", RET, retails.length, registrosConteo, corteMasAntiguo(crudo, registrosConteo));
    if (!retails.length) h.sinValor("ret.mora.dias_max", "ret.max@1", RET, "no_aplica");
    else {
      const valor = Math.max(...retails.map((f) => num(f.r.diasMora) ?? 0));
      const fila = retails.find((f) => (num(f.r.diasMora) ?? 0) === valor)!;
      const registros = [refDeFila(consulta, fila, "diasMora")];
      h.confirmado("ret.mora.dias_max", "ret.max@1", RET, valor, registros, corteMasAntiguo(crudo, registros));
    }
    for (const [cod, campo] of [["ret.deuda.total", "totalDeuda"], ["ret.deuda.vencida", "valorVencido"]]) {
      const valor = redondear(retails.reduce((s, f) => s + (num(f.r[campo]) ?? 0), 0));
      const registros = citar(aportesDe(consulta, retails, () => campo), filasRef(retails), respuestaRetail);
      h.confirmado(cod, "ret.suma@1", RET, valor, registros, corteMasAntiguo(crudo, registros));
    }
    const conCorte = retails.map((f) => ({ f, corte: corteRetail(f.r.fecha) })).filter((x): x is { f: Fila; corte: string } => x.corte !== null);
    const motivoSinCorte: MotivoDeNoDisponible = retails.length ? "la_fuente_no_lo_informa" : "no_aplica";
    const ordenados = [...conCorte].sort((a, b) => (a.corte < b.corte ? -1 : a.corte > b.corte ? 1 : 0));
    for (const [cod, x] of [["ret.corte", ordenados[0]], ["ret.corte.mas_reciente", ordenados.at(-1)]] as const) {
      if (!x) h.sinValor(cod, "ret.corte@1", RET, motivoSinCorte);
      else h.confirmado(cod, "ret.corte@1", RET, x.corte, [refDeFila(consulta, x.f, "fecha")], x.corte);
    }
  }

  // ---- Préstamos del IESS/BIESS ----
  const PRESTAMOS = ["creditoQuirografario", "creditoHipotecario"];
  const IESS = [...PRESTAMOS, "basesInternas"];
  const deLosPrestamos = [...filasDe(crudo, "creditoQuirografario", "prestamos"), ...filasDe(crudo, "creditoHipotecario", "prestamos")];
  const deLaBase = [...filasDe(crudo, "basesInternas", "tcredQuirografarios"), ...filasDe(crudo, "basesInternas", "tcredHipotecarios")];
  const respuestasPrestamos = PRESTAMOS.map((f) => respuesta(f, "prestamos"));
  const respuestasIess = [...respuestasPrestamos, respuesta("basesInternas", "tcredQuirografarios"), respuesta("basesInternas", "tcredHipotecarios")];

  const sinPrestamos = faltaUna(PRESTAMOS);
  if (sinPrestamos) h.sinValor("biess.prestamos.en_la_fuente.cantidad", "biess.en_la_fuente@1", PRESTAMOS, sinPrestamos);
  else {
    // process.ts cuenta hipotecarios más quirografarios: el mismo total.
    const registros = deLosPrestamos.length ? filasRef(deLosPrestamos) : respuestasPrestamos;
    h.confirmado("biess.prestamos.en_la_fuente.cantidad", "biess.en_la_fuente@1", PRESTAMOS, deLosPrestamos.length, registros, corteMasAntiguo(crudo, registros));
  }

  const sinIess = faltaUna(IESS);
  const { operaciones, terminados } = unirIessBiess(deLaBase, deLosPrestamos, diaDeLaConsulta(contexto));
  const claves: string[] = [];
  for (const o of operaciones) {
    const desdeLosPrestamos = o.manda.lista === "prestamos";
    const atributos = operacion({
      sistema: "iess_biess",
      rol: "titular",
      fechaDeConcesion: fechaIsoDe(desdeLosPrestamos ? o.manda.r.fechaConcesion : o.manda.r.fechaConsesion ?? o.manda.r.srFecprimerdesembolso),
      montoOriginal: o.monto,
      saldoPorVencer: desdeLosPrestamos ? num(o.manda.r.valorPorVencer) : null,
      saldoVencido: desdeLosPrestamos ? num(o.manda.r.valorVencido) : null,
      diasDeMora: o.diasMora,
    });
    // El número de operación sin ceros; sin número, monto y concesión; si
    // tampoco, la posición (1.3).
    const identidad = o.numero !== "" ? `biess#${o.numero}` : o.monto !== null && o.dia !== null ? `biess#${o.monto}#${o.dia}` : `${o.manda.fuente}.${o.manda.lista}#${o.manda.indice}`;
    const clave = emisor.clave("op", identidad);
    claves.push(clave);
    const vistas = [vista(consulta, crudo, o.manda, { saldoPorVencer: atributos.saldoPorVencer, saldoVencido: atributos.saldoVencido, diasDeMora: num(o.manda.r.diasMora ?? o.manda.r.diasMoraAfi ?? o.manda.r.srDiasmoraafi) ?? 0 })];
    for (const b of o.base) vistas.push(vista(consulta, crudo, b.fila, { diasDeMora: num(b.fila.r.diasMoraAfi ?? b.fila.r.srDiasmoraafi) ?? 0, fechaDeConcesion: fechaIsoDe(b.fila.r.fechaConsesion ?? b.fila.r.srFecprimerdesembolso) }));
    emisor.entidad({
      clave,
      tipo: "operacion",
      atributos,
      vistas,
      union: o.base.length ? { regla: "biess.union@2", criterio: o.base[0].criterio } : null,
      atribucion: ATRIBUCION_POR_IDENTIFICACION,
    });
    // Lo que la base interna dice distinto de la misma operación: se guarda
    // aunque se espere (la base interna es una foto vieja).
    if (sinIess) continue;
    for (const b of o.base) {
      if (redondear(b.saldo) !== redondear(o.saldo)) {
        const absoluta = redondear(Math.abs(o.saldo - b.saldo));
        emisor.diferencia({
          codigo: "dif.biess.saldo",
          regla: "biess.union@2",
          sobre: `${clave}.saldo`,
          manda: { fuente: o.manda.fuente, valor: redondear(o.saldo), registro: refDeFila(consulta, o.manda, "valorPorVencer") },
          cede: [{ fuente: "basesInternas", valor: redondear(b.saldo), registro: refDeFila(consulta, b.fila, b.campoDeSaldo) }],
          magnitud: { absoluta, relativa: o.saldo ? Math.round((absoluta / o.saldo) * 10_000) / 10_000 : null },
          lectura: "esperada",
        });
      }
      if (o.dia !== null && b.dia !== null && o.dia !== b.dia) {
        const campoBase = leido(b.fila.r, "fechaConsesion", "srFecprimerdesembolso");
        emisor.diferencia({
          codigo: "dif.biess.fecha_de_concesion",
          regla: "biess.union@2",
          sobre: `${clave}.fechaDeConcesion`,
          manda: { fuente: o.manda.fuente, valor: fechaIsoDe(o.manda.r.fechaConcesion), registro: refDeFila(consulta, o.manda, "fechaConcesion") },
          cede: [{ fuente: "basesInternas", valor: fechaIsoDe(b.fila.r[campoBase]), registro: refDeFila(consulta, b.fila, campoBase) }],
          magnitud: { absoluta: Math.abs(o.dia - b.dia), relativa: null },
          lectura: "esperada",
        });
      }
    }
  }

  if (sinIess) {
    for (const cod of ["biess.operaciones.cantidad", "biess.tiene", "biess.mora.dias_max", "biess.saldo"]) h.sinValor(cod, "biess.union@2", IESS, sinIess);
    return;
  }
  const terminadosDescartados: Descarte[] = terminados.map((f) => ({ registro: refDeFila(consulta, f, "fechaFinCredito" in f.r ? "fechaFinCredito" : "srFecfincredito"), motivo: "terminado_en_la_base_interna" }));
  const unidasDescartadas: Descarte[] = operaciones.flatMap((o) => o.base.map((b) => ({ registro: refDeFila(consulta, b.fila, b.campoDeSaldo), motivo: "misma_operacion_que_la_fuente_de_prestamos" })));
  const porOperacion = operaciones.map((o) => refDeFila(consulta, o.manda));
  const deCadaOperacion = porOperacion.length ? porOperacion : respuestasIess;
  const descartadosIess = [...terminadosDescartados, ...unidasDescartadas];
  h.confirmado("biess.operaciones.cantidad", "biess.union@2", IESS, operaciones.length, deCadaOperacion, corteMasAntiguo(crudo, deCadaOperacion), { descartados: descartadosIess, entidades: claves });
  h.confirmado("biess.tiene", "biess.union@2", IESS, operaciones.length > 0, deCadaOperacion, corteMasAntiguo(crudo, deCadaOperacion), { descartados: descartadosIess, entidades: claves });
  if (!operaciones.length) {
    h.sinValor("biess.mora.dias_max", "biess.mora@1", IESS, "no_aplica");
    h.sinValor("biess.saldo", "biess.saldo@1", IESS, "no_aplica");
    return;
  }
  const maxMora = Math.max(...operaciones.map((o) => o.diasMora));
  const conMax = operaciones.find((o) => o.diasMora === maxMora)!;
  const registrosMora = [refDeFila(consulta, conMax.moraDe.fila, conMax.moraDe.campo)];
  h.confirmado("biess.mora.dias_max", "biess.mora@1", IESS, maxMora, registrosMora, corteMasAntiguo(crudo, registrosMora));
  const aportaron: RefDeRegistro[] = operaciones.flatMap((o) => o.camposDeSaldo.flatMap((campo) => aportesDe(consulta, [o.manda], () => campo)));
  const registrosSaldo = citar(aportaron, porOperacion, respuestasIess);
  h.confirmado("biess.saldo", "biess.saldo@1", IESS, redondear(operaciones.reduce((s, o) => s + o.saldo, 0)), registrosSaldo, corteMasAntiguo(crudo, registrosSaldo), { descartados: descartadosIess });
}
