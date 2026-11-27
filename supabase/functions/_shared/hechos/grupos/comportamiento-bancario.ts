// Grupo 1 de la capa de hechos: bancos y Diners, casas comerciales, el registro
// de deudores y los préstamos del IESS/BIESS (docs/capa-de-hechos.md, 4.1).
//
// ETAPA B (estructura-v25). process.ts arma `comportamientoBancario` desde estos
// hechos (perfilDesdeHechos): las reglas de bancos, retail, el registro de
// deudores y la unión del BIESS viven sólo acá. La etapa A dio paridad sobre las
// 3.766 personas (PR 178) y la v25 la mide otra vez contra la v24.
//
// Lo único que cambia el perfil es el «sin dato»: con una fuente que no
// contestó, el hecho queda sin valor y su `parcial` dice lo que trajeron las
// demás. Hasta la v24 el perfil escribía ese parcial, o 0, como si fuera el
// total; desde la v25 el campo es null y el grupo lo lista en `camposSinDato`.

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { CALIFICACIONES_EN_ATRASO, ESCALA_CALIFICACION } from "../calificacion.ts";
import {
  aportesDe,
  type AnyRecord,
  citar,
  corteMasAntiguo,
  deudaDe,
  enAtraso,
  esGarantia,
  fechaIsoDe,
  type Fila,
  filasDe,
  num,
  redondear,
  refDeFila,
  refDeRespuesta,
  respuestaDe,
  textoDe,
  vencido,
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
  // No llega al modelo (CAMPOS_DE_LA_CAPACIDAD_QUE_NO_LLEGAN en perfil-del-modelo.ts),
  // aunque tenga campo del perfil: por eso no pasa por codigo().
  {
    codigo: "biess.operaciones.detalle",
    unidad: "lista",
    descripcion: "Cada préstamo del IESS/BIESS con su tipo, saldo, fecha de fin, monto, concesión, tasa, cuota estimada y la fuente y el corte de su saldo, para la capacidad de pago",
    campoDelPerfil: P + "operacionesIessBiess",
    llegaAlModelo: false,
    esIdentificador: false,
    enElPerfilSinValor: null,
  },
  codigo("ret.deudas.cantidad", "cantidad", "Deudas con casas comerciales", "numeroDeudasRetail", 0, "conteo"),
  codigo("ret.mora.dias_max", "dias", "Días de mora máximos con casas comerciales, a su corte", "diasMoraMaximaRetail", null, "maximo"),
  codigo("ret.deuda.total", "usd", "Deuda total con casas comerciales, a su corte", "totalDeudaRetail", 0, "suma"),
  codigo("ret.deuda.vencida", "usd", "Deuda vencida con casas comerciales, a su corte", "valorVencidoRetail", 0, "suma"),
  codigo("ret.corte", "fecha", "Corte más antiguo de las casas comerciales", "fechaCorteRetail", null),
  codigo("ret.corte.mas_reciente", "fecha", "Corte más reciente de las casas comerciales", null, null),
  codigo("ban.operaciones.unidas.cantidad", "cantidad", "Operaciones de Diners que son la misma de Super y se cuentan una vez", null, null, "conteo"),
  codigo("dif.ban.posible_repetida", "usd", "Deuda de una operación que vino en Super y en Diners, según cada lista", null, null),
  codigo("dif.biess.saldo", "usd", "Saldo de un préstamo del IESS/BIESS según cada fuente", null, null),
  codigo("dif.biess.fecha_de_concesion", "fecha", "Concesión de un préstamo del IESS/BIESS según cada fuente", null, null),
  // E9: la prometía la sección 6 desde el diseño y no estaba.
  codigo("dif.biess.cantidad", "cantidad", "Préstamos del IESS/BIESS de un tipo según la fuente de préstamos y según la base interna", null, null),
];

// Las que unen, eligen o descartan registros: cada una con un crudo inventado
// en que aplica y uno en que no (scripts/crudos-sinteticos/, campo `reglas`).
export const REGLAS_QUE_MEZCLAN: string[] = [
  "ban.union@1", // una fila de Diners que es la misma operación que una de Super se cuenta una vez
  "ban.propias@1", // descarta las filas de garante o codeudor
  "ban.calificacion@1", // elige UNA operación; «AL» no cuenta salvo que sea la única
  "ban.vencido@1", // elige `saldomora` o `mora` por fila
  "biess.union@2", // une las dos fuentes y descarta los terminados de la base interna
  "biess.mora@1", // en una unida, elige la vista con más días
  "ret.corte@1", // elige la fila del corte más antiguo
];

// Contra estructura-v24, la única diferencia es el «sin dato» (E4): con una
// fuente que no contestó, el campo pasa del parcial o de 0 a null, marcado en
// camposSinDato. comparar-hechos.mjs --contra la cuenta y corta con cualquier otra.
export const DIFERENCIAS_ESPERADAS: DiferenciaEsperada[] = [
  {
    campo: "comportamientoBancario.*",
    detector: "dato-de-fuente-sin-respuesta-escrito-como-total",
    aprobadaEl: "pendiente: la aprueba el negocio con el PR de estructura-v25",
    motivo: "una fuente que no contestó deja el campo sin dato en vez del parcial o 0",
    cuando: "sin_dato",
  },
  // estructura-v26 (D6 del negocio, 2026-11-18): una operación que viene en
  // Super y en Diners se cuenta una vez. Sólo vale en quien tiene una entidad
  // unida por ban.union@1; en las 3.766 personas del 2026-11-20, nadie.
  {
    campo: "comportamientoBancario.*",
    detector: "operacion-en-super-y-diners",
    aprobadaEl: "2026-11-18 (D6 del negocio: unir)",
    motivo: "la operación que viene en Super y en Diners deja de contarse dos veces",
    cuando: "union",
    regla: "ban.union@1",
  },
];

// Campos del perfil que todavía no salen de un hecho, cada uno con su porqué.
// Es la única excepción a «cero campos sin procedencia», y se informa en cada
// comparación: no se esconde. Desde la etapa B, ninguno.
export const CAMPOS_PENDIENTES: Array<{ campo: string; motivo: string }> = [];

// ---- Las reglas del grupo (vivían en buildStandardProfile hasta estructura-v24) ----

// La escala de calificaciones del buró, de mejor a peor: vive en `calificacion.ts`
// desde E11, porque la leen también las lecturas.

// La peor o la mejor calificación, con la fila que la trae: la que se cita es
// la primera con esa calificación. «AL» está fuera de la escala: nunca es la
// peor, y si es la única se nombra (estructura-v8).
function extremo(filas: Fila[], cual: "peor" | "mejor"): { valor: string; fila: Fila } | null {
  const conCalificacion = filas.filter((f) => String(f.r.calificacion ?? "").trim());
  const todas = conCalificacion.map((f) => String(f.r.calificacion ?? "").trim());
  const enEscala = todas.filter((c) => ESCALA_CALIFICACION.includes(c)).sort((a, b) => ESCALA_CALIFICACION.indexOf(a) - ESCALA_CALIFICACION.indexOf(b));
  const valor = enEscala.length ? (cual === "peor" ? enEscala.at(-1)! : enEscala[0]) : todas[0];
  if (valor === undefined) return null;
  return { valor, fila: conCalificacion.find((f) => String(f.r.calificacion ?? "").trim() === valor)! };
}

// vencido, enAtraso, deudaDe y esGarantia viven en lectura-del-crudo.ts desde E9: el
// historial con la institución lee la misma deuda de bancos para su diferencia.
const campoVencido = (r: AnyRecord) => ((num(r.saldomora) ?? 0) > 0 ? "saldomora" : "mora");

// ---- Super y Diners (ban.union@1, estructura-v26) ----
//
// D6 del negocio (2026-11-18): una operación que viene en la lista de la
// Superintendencia y en la de Diners se cuenta una vez. Se recomendaba medir
// primero, y la medición del 2026-11-20 (las 3.766 personas reales) dio que hoy
// no pasa: Diners trae sólo a BP Diners (código 4624), que Super no trae nunca,
// y entre entidades distintas la misma deuda sale tanto como con el Super de
// otra persona (23 contra 26 pares a 1%). La unión queda puesta por si la
// fuente cambia, y su detector (operacion-en-super-y-diners) la vigila.
//
// Por qué un criterio tan estricto: con el mismo corte, la misma operación tiene
// la misma deuda en las dos listas, y una tarjeta de otra entidad con la deuda
// parecida es otra operación (el par de USD 660,90 contra 661,88 del
// 2026-11-20 era eso). Una deuda en cero no prueba nada: no se une.
const TOLERANCIA_DE_LA_UNION_USD = 1;
const entidadDe = (r: AnyRecord) => {
  const codigo = sinCeros(r.codEntidad);
  return codigo !== "" ? `cod:${codigo}` : textoDe(r.entnombre) ? `nom:${String(r.entnombre).trim().toUpperCase().replace(/\s+/g, " ")}` : "";
};
const esLaMismaOperacion = (s: AnyRecord, d: AnyRecord) =>
  entidadDe(s) !== "" && entidadDe(s) === entidadDe(d) &&
  String(s.riesgo ?? "") === String(d.riesgo ?? "") &&
  String(s.calificacion ?? "").trim() === String(d.calificacion ?? "").trim() &&
  String(s.fecha ?? "").trim() !== "" && String(s.fecha ?? "").trim() === String(d.fecha ?? "").trim() &&
  deudaDe(d) > 0 && Math.abs(deudaDe(s) - deudaDe(d)) <= TOLERANCIA_DE_LA_UNION_USD;

// Cada fila de Diners que es la misma operación que una de Super, con esa fila.
// Manda Super: es la lista de la Superintendencia y trae a todas las entidades.
// Una fila de Super se une con una sola de Diners.
function unirSuperYDiners(deSuper: Fila[], deDiners: Fila[]): Map<Fila, Fila> {
  const unidas = new Map<Fila, Fila>();
  const tomadas = new Set<Fila>();
  for (const d of deDiners) {
    const s = deSuper.find((x) => !tomadas.has(x) && esLaMismaOperacion(x.r, d.r));
    if (!s) continue;
    tomadas.add(s);
    unidas.set(d, s);
  }
  return unidas;
}

// «31/07/2025» a días desde 1970. No valida la fecha (el 31/02 pasa al 3 de
// marzo): es la lectura con que se midió la unión del BIESS (estructura-v21).
function diaDeFechaDDMMYYYY(v: unknown): number | null {
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? Math.floor(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) / 86_400_000) : null;
}

// El corte del retail se lee sólo como día/mes/año (con el año de dos o cuatro
// cifras): fechaIsoDe acepta además año/mes/día, que en el retail no se vio nunca.
const corteRetail = (v: unknown) => (/^\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})$/.test(String(v ?? "").trim()) ? fechaIsoDe(v) : null);

const DIAS_DE_TOLERANCIA_EN_LA_CONCESION = 31;
const sinCeros = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");
// Qué campo leyó un `a ?? b` sobre la fila: el de la base interna quirografaria
// o el `sr...` de la hipotecaria.
const leido = (r: AnyRecord, a: string, b: string) => (r[a] !== null && r[a] !== undefined ? a : b);

// Concesión («dd/mm/yyyy») más el plazo en meses, a días desde 1970 (F12,
// estructura-v22): la fecha de fin de un préstamo de la fuente de préstamos,
// que no la trae.
function finDeLaConcesion(concesion: unknown, plazoMeses: unknown): number | null {
  const m = String(concesion ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const plazo = num(plazoMeses);
  if (!m || plazo === null || plazo <= 0) return null;
  return Math.floor(Date.UTC(Number(m[3]), Number(m[2]) - 1 + Math.round(plazo), Number(m[1])) / 86_400_000);
}

// «yyyy-mm-dd» desde los días desde 1970; null sin fecha.
function fechaDeDia(dia: number | null): string | null {
  return dia === null ? null : new Date(dia * 86_400_000).toISOString().slice(0, 10);
}

// El tipo sale de la lista: ninguna de las dos fuentes lo dice en la fila.
const tipoDeLaLista = (f: Fila): "quirografario" | "hipotecario" =>
  f.fuente === "creditoHipotecario" || f.lista === "tcredHipotecarios" ? "hipotecario" : "quirografario";

interface OperacionIess {
  numero: string;
  dia: number | null;
  monto: number | null;
  saldo: number;
  diasMora: number;
  tipo: "quirografario" | "hipotecario";
  fin: number | null;
  // Desde estructura-v33: lo que la capacidad de pago necesita para estimar la cuota de un hipotecario como la
  // informa Equifax. La tasa (% anual) y la cuota estimada son de la base interna (srTasaactual, cuotaEstimada);
  // el corte es la `fechaCorte` de la fuente de préstamos, y no existe en una operación sólo de la base interna.
  tasa: number | null;
  cuotaEstimada: number | null;
  corte: number | null;
  manda: Fila;
  camposDeSaldo: string[];
  moraDe: { fila: Fila; campo: string };
  base: Array<{ fila: Fila; saldo: number; campoDeSaldo: string; dia: number | null; criterio: "numero" | "monto_y_fecha" }>;
}

// Los préstamos del IESS/BIESS vienen por dos caminos con identificadores
// distintos: los de la base interna (tcredQuirografarios/tcredHipotecarios) y
// los de creditoQuirografario/creditoHipotecario (data.prestamos). Cada uno
// trae operaciones que el otro no ve: medido sobre 560 personas con las dos
// fuentes, 1.428 operaciones de la base contra 1.396 de los préstamos y ninguna
// con el mismo número de operación ni la misma fecha y monto. Hasta
// estructura-v15 sólo se leía la base interna y en c-82cc2afc, con 9 préstamos
// vigentes, el perfil decía que no tenía crédito del IESS/BIESS (308 de 918
// personas con créditos formales quedaban así).
//
// Una operación que esté en las dos se cuenta una vez: por su número, o por el
// mismo monto (a un dólar) con la concesión a 31 días o menos. Desde
// estructura-v21 (p6 de la revisión del análisis, aprobada por el negocio el
// 2026-11-08); hasta v20 se pedían la fecha y el monto exactos, y la base
// interna y la fuente de préstamos anotan el mismo hipotecario con otro número
// y la fecha corrida: en c-b9fc9a82 a 2 días. Medido el 2026-11-09 sobre las
// 3.766 personas reales: 177 hipotecarios contados dos veces en 174 personas
// (145 a 3 días o menos, 173 a 7, 176 a 15), USD 6,6 millones de saldo de más.
//
// Manda la de la fuente de préstamos, con los días de mora más altos de las
// dos: trae `fechaCorte` y su saldo es el de hoy, y la base interna es una foto
// vieja (en c-3cec8b5f, 18.831 contra 14.816 del mismo hipotecario).
//
// Y de la base interna no se cuentan los préstamos terminados: los que siguen
// «VIGENTE» con el plazo ya cumplido y sin mora, que la fuente de préstamos ya
// no trae. Eran 1.600 operaciones en 651 personas, terminadas hace 3 años y
// medio en la mediana, con USD 3,6 millones de saldo que ya no se debe
// (c-40d771e1). Los que la base marca «VENCIDO» o «MORA» se cuentan: deben.
// La fuente de préstamos trae sólo lo vigente (PV), vencido (VC) o en
// novación (ND): en el respaldo del 03/10, ningún cancelado.
//
// Desde estructura-v22 (F12, 2026-11-17) cada operación lleva también su tipo y
// el día en que termina, porque la capacidad de pago estima la cuota con la
// anualidad del plazo que queda (capacidad-de-pago.ts): el buró de bancos de
// Proveedor_Info_1 no trae al BIESS (0 de 1.025 personas con préstamo), así que
// su cuota no está en ningún otro lado. La base interna dice cuándo termina
// (fechaFinCredito / srFecfincredito); la fuente de préstamos no, y ahí el fin
// es la concesión más el plazo original en meses.
//
// La unión de los préstamos del IESS/BIESS de las dos fuentes (estructura-v21,
// con el tipo y la fecha de fin de la v22). Desde la etapa B es la única: hasta
// ahí process.ts tenía la suya, operacionesIessBiess(). El reloj es la fecha
// de la consulta; process.ts la pasa con la hora del armado, como antes.
function unirIessBiess(deLaBase: Fila[], deLosPrestamos: Fila[], hoy: number) {
  const prestamos: OperacionIess[] = deLosPrestamos.map((f) => ({
    numero: sinCeros(f.r.nroOperacion),
    dia: diaDeFechaDDMMYYYY(f.r.fechaConcesion),
    monto: num(f.r.valorPrestamo),
    saldo: (num(f.r.valorPorVencer) ?? 0) + (num(f.r.valorVencido) ?? 0),
    diasMora: num(f.r.diasMora) ?? 0,
    tipo: tipoDeLaLista(f),
    fin: finDeLaConcesion(f.r.fechaConcesion, f.r.plazoOriginal),
    tasa: null,
    cuotaEstimada: null,
    corte: diaDeFechaDDMMYYYY(f.r.fechaCorte),
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
      tipo: tipoDeLaLista(f),
      fin: diaDeFechaDDMMYYYY(r.fechaFinCredito ?? r.srFecfincredito),
      // Sólo la base interna de hipotecarios las trae (65% de los hipotecarios del BIESS; ninguno concedido de 2022 en adelante).
      tasa: num(r.srTasaactual),
      cuotaEstimada: num(r.cuotaEstimada),
      corte: null,
    };
    const repetida = prestamos.find((p) => esLaMisma(p, o));
    if (repetida) {
      if (o.diasMora > repetida.diasMora) repetida.moraDe = { fila: f, campo: campoDeMora };
      repetida.diasMora = Math.max(repetida.diasMora, o.diasMora);
      // La fecha de fin de la base interna es la pactada: vale más que la derivada.
      repetida.fin = o.fin ?? repetida.fin;
      // La tasa y la cuota estimada sólo las trae la base interna: se suman a la operación de la fuente de préstamos.
      repetida.tasa = o.tasa ?? repetida.tasa;
      repetida.cuotaEstimada = o.cuotaEstimada ?? repetida.cuotaEstimada;
      const porNumero = repetida.numero !== "" && repetida.numero === o.numero;
      repetida.base.push({ fila: f, saldo: o.saldo, campoDeSaldo, dia: o.dia, criterio: porNumero ? "numero" : "monto_y_fecha" });
      continue;
    }
    const estado = String(r.estadoOperacion ?? r.srEstadocredito ?? "").trim().toUpperCase();
    const fin = o.fin;
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
    saldoNoDevenga: null, saldoEnDemanda: null, saldoCastigado: null, diasDeMora: null, calificacion: null, cuotaMensual: null, saldoTotal: null,
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
  const deSuper = filasDe(crudo, "buroCreditoSuper", "datosSuper");
  const deDiners = filasDe(crudo, "buroCreditoDiners", "datosSuper");
  // La fila de Diners unida a una de Super no se cuenta: la operación ya está.
  const unidas = unirSuperYDiners(deSuper, deDiners);
  const filasBanco = [...deSuper, ...deDiners.filter((f) => !unidas.has(f))];
  const propias = filasBanco.filter((f) => !esGarantia(f.r));
  const garantias = filasBanco.filter((f) => esGarantia(f.r));
  const respuestasBanco = BANCOS.map((f) => respuesta(f, "datosSuper"));
  const descartadasPorRol: Descarte[] = garantias.map((f) => ({ registro: refDeFila(consulta, f, "riesgo"), motivo: "rol_garante_o_codeudor" }));
  const descartadasPorUnion = (garantia: boolean): Descarte[] =>
    [...unidas.keys()].filter((f) => esGarantia(f.r) === garantia).map((f) => ({ registro: refDeFila(consulta, f), motivo: "misma_operacion_que_super" }));
  const unidasPropias = descartadasPorUnion(false);
  const unidasGarantias = descartadasPorUnion(true);
  const sinBancos = faltaUna(BANCOS);
  // La vista de Diners de cada fila de Super unida.
  const dinersDe = new Map([...unidas].map(([d, s]) => [s, d]));

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
    // Unida, la posición es la de Super, que manda.
    const clave = emisor.clave("op", `${f.fuente}#${f.indice}`);
    const d = dinersDe.get(f);
    const vistas = [vista(consulta, crudo, f, atributos)];
    if (d) {
      vistas.push(vista(consulta, crudo, d, { sistema: "tarjeta_diners", saldoPorVencer: num(d.r.saldoVigente), saldoVencido: vencido(d.r), calificacion: textoDe(d.r.calificacion) }));
      // La diferencia se guarda aunque sea de centavos: lo que no se guarda no se mide.
      const absoluta = redondear(Math.abs(deudaDe(f.r) - deudaDe(d.r)));
      emisor.diferencia({
        codigo: "dif.ban.posible_repetida",
        regla: "ban.union@1",
        sobre: `${clave}.deuda`,
        manda: { fuente: "buroCreditoSuper", valor: redondear(deudaDe(f.r)), registro: refDeFila(consulta, f) },
        cede: [{ fuente: "buroCreditoDiners", valor: redondear(deudaDe(d.r)), registro: refDeFila(consulta, d) }],
        magnitud: { absoluta, relativa: deudaDe(f.r) ? Math.round((absoluta / deudaDe(f.r)) * 10_000) / 10_000 : null },
        lectura: "esperada",
      });
    }
    emisor.entidad({
      clave,
      tipo: "operacion",
      atributos,
      vistas,
      union: d ? { regla: "ban.union@1", criterio: "monto_y_fecha" } : null,
      atribucion: ATRIBUCION_POR_IDENTIFICACION,
    });
  }

  // Con Super o Diners sin contestar, cada hecho de bancos queda sin dato y
  // lleva como `parcial` lo que dice la otra (estructura-v25). Hasta la v24 el
  // perfil escribía ese parcial, o 0, como si fuera el total.
  {
    const emitirBanco = (cod: string, regla: string, valor: number | boolean | string, registros: RefDeRegistro[], descartados?: Descarte[]) => {
      if (sinBancos) h.sinValor(cod, regla, BANCOS, sinBancos, valor);
      else h.confirmado(cod, regla, BANCOS, valor, registros, corteMasAntiguo(crudo, registros), { descartados });
    };
    const conteo = (cod: string, regla: string, filas: Fila[], campo?: string, descartados?: Descarte[]) => {
      emitirBanco(cod, regla, filas.length, filas.length ? filasRef(filas, campo) : respuestasBanco, descartados);
    };
    const suma = (cod: string, regla: string, filas: Fila[], valor: number, campos: Array<(f: Fila) => string>, descartados?: Descarte[]) => {
      const aportaron = campos.flatMap((campoDe) => aportesDe(consulta, filas, campoDe));
      emitirBanco(cod, regla, valor, citar(aportaron, filasRef(filas), respuestasBanco), descartados);
    };
    const alguna = (cod: string, regla: string, campo: string) => {
      const con = propias.filter((f) => (num(f.r[campo]) ?? 0) > 0);
      emitirBanco(cod, regla, con.length > 0, citar(filasRef(con, campo), filasRef(propias), respuestasBanco));
    };
    const calificacion = (cod: string, filas: Fila[], cual: "peor" | "mejor", descartados?: Descarte[]) => {
      const e = extremo(filas, cual);
      if (!e) return h.sinValor(cod, "ban.calificacion@1", BANCOS, sinBancos ?? (filas.length ? "la_fuente_no_lo_informa" : "no_aplica"), sinBancos ? null : undefined);
      emitirBanco(cod, "ban.calificacion@1", e.valor, [refDeFila(consulta, e.fila, "calificacion")], descartados);
    };

    conteo("ban.operaciones.cantidad", "ban.propias@1", propias, undefined, [...descartadasPorRol, ...unidasPropias]);
    conteo("ban.operaciones.unidas.cantidad", "ban.union@1", [...unidas.keys()]);
    conteo("ban.operaciones.sin_rol.cantidad", "ban.propias@1", propias.filter((f) => f.r.riesgo !== "T"), "riesgo");
    calificacion("ban.calificacion.peor", propias, "peor", descartadasPorRol);
    calificacion("ban.calificacion.mejor", propias, "mejor");
    alguna("ban.operaciones.con_demanda", "ban.con_demanda@1", "judicial");
    alguna("ban.operaciones.castigadas", "ban.castigadas@1", "castigo");
    const sumaDe = (filas: Fila[], campo: string) => redondear(filas.reduce((s, f) => s + (num(f.r[campo]) ?? 0), 0));
    suma("ban.saldo.en_demanda", "ban.suma@1", propias, sumaDe(propias, "judicial"), [() => "judicial"], unidasPropias);
    suma("ban.saldo.castigado", "ban.suma@1", propias, sumaDe(propias, "castigo"), [() => "castigo"], unidasPropias);
    suma("ban.saldo.por_vencer", "ban.suma@1", propias, sumaDe(propias, "saldoVigente"), [() => "saldoVigente"], unidasPropias);
    suma("ban.saldo.vencido", "ban.vencido@1", propias, redondear(propias.reduce((s, f) => s + vencido(f.r), 0)), [(f) => campoVencido(f.r)], unidasPropias);
    suma("ban.saldo.no_devenga", "ban.suma@1", propias, sumaDe(propias, "noDevengaInteres"), [() => "noDevengaInteres"], unidasPropias);
    const camposDeAtraso = [(f: Fila) => campoVencido(f.r), () => "noDevengaInteres", () => "judicial", () => "castigo"];
    suma("ban.saldo.en_atraso", "ban.en_atraso@1", propias, redondear(propias.reduce((s, f) => s + enAtraso(f.r), 0)), camposDeAtraso, [...descartadasPorRol, ...unidasPropias]);
    const sinMonto = propias.filter((f) => CALIFICACIONES_EN_ATRASO.has(String(f.r.calificacion)) && deudaDe(f.r) === 0);
    conteo("ban.operaciones.en_atraso_sin_monto", "ban.sin_monto@1", sinMonto, "calificacion");
    conteo("ban.garante.operaciones.cantidad", "ban.garantias@1", garantias, "riesgo", unidasGarantias);
    suma("ban.garante.deuda", "ban.suma@1", garantias, redondear(garantias.reduce((s, f) => s + deudaDe(f.r), 0)), [() => "saldoVigente", ...camposDeAtraso], unidasGarantias);
    calificacion("ban.garante.calificacion.peor", garantias, "peor");
  }

  // ---- Registro de deudores ----
  const sinDeudores = faltaUna(["deudores"]);
  const filasDeudores = filasDe(crudo, "deudores", "deudores");
  if (sinDeudores) h.sinValor("ban.registro_deudores.figura", "deu.figura@1", ["deudores"], sinDeudores, filasDeudores.length > 0);
  else {
    const filas = filasDeudores;
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
  {
    // Sin respuesta del retail, cada hecho queda sin dato con su parcial (lo que
    // trajeran las filas igual), como en bancos.
    const emitirRetail = (cod: string, regla: string, valor: number | string, registros: RefDeRegistro[], fechaDelDato: string | null) => {
      if (sinRetail) h.sinValor(cod, regla, RET, sinRetail, valor);
      else h.confirmado(cod, regla, RET, valor, registros, fechaDelDato);
    };
    const vacio = (cod: string, regla: string, motivo: MotivoDeNoDisponible) => h.sinValor(cod, regla, RET, sinRetail ?? motivo, sinRetail ? null : undefined);
    const registrosConteo = retails.length ? filasRef(retails) : respuestaRetail;
    emitirRetail("ret.deudas.cantidad", "ret.conteo@1", retails.length, registrosConteo, corteMasAntiguo(crudo, registrosConteo));
    if (!retails.length) vacio("ret.mora.dias_max", "ret.max@1", "no_aplica");
    else {
      const valor = Math.max(...retails.map((f) => num(f.r.diasMora) ?? 0));
      const fila = retails.find((f) => (num(f.r.diasMora) ?? 0) === valor)!;
      const registros = [refDeFila(consulta, fila, "diasMora")];
      emitirRetail("ret.mora.dias_max", "ret.max@1", valor, registros, corteMasAntiguo(crudo, registros));
    }
    for (const [cod, campo] of [["ret.deuda.total", "totalDeuda"], ["ret.deuda.vencida", "valorVencido"]]) {
      const valor = redondear(retails.reduce((s, f) => s + (num(f.r[campo]) ?? 0), 0));
      const registros = citar(aportesDe(consulta, retails, () => campo), filasRef(retails), respuestaRetail);
      emitirRetail(cod, "ret.suma@1", valor, registros, corteMasAntiguo(crudo, registros));
    }
    const conCorte = retails.map((f) => ({ f, corte: corteRetail(f.r.fecha) })).filter((x): x is { f: Fila; corte: string } => x.corte !== null);
    const motivoSinCorte: MotivoDeNoDisponible = retails.length ? "la_fuente_no_lo_informa" : "no_aplica";
    const ordenados = [...conCorte].sort((a, b) => (a.corte < b.corte ? -1 : a.corte > b.corte ? 1 : 0));
    for (const [cod, x] of [["ret.corte", ordenados[0]], ["ret.corte.mas_reciente", ordenados.at(-1)]] as const) {
      if (!x) vacio(cod, "ret.corte@1", motivoSinCorte);
      else emitirRetail(cod, "ret.corte@1", x.corte, [refDeFila(consulta, x.f, "fecha")], x.corte);
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
  if (sinPrestamos) h.sinValor("biess.prestamos.en_la_fuente.cantidad", "biess.en_la_fuente@1", PRESTAMOS, sinPrestamos, deLosPrestamos.length);
  else {
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

  // Cuántos préstamos ve cada camino, por tipo (E9, punto 2 de la sección 6): la base interna
  // es una foto vieja y trae los terminados, así que la diferencia es esperada. No cambia
  // ningún valor: la unión de arriba es la que cuenta.
  if (!sinIess) {
    for (const [tipo, lista, deLaBaseLista] of [["quirografario", "creditoQuirografario", "tcredQuirografarios"], ["hipotecario", "creditoHipotecario", "tcredHipotecarios"]] as const) {
      const enLaFuente = deLosPrestamos.filter((f) => f.fuente === lista).length;
      const enLaBase = deLaBase.filter((f) => f.lista === deLaBaseLista).length;
      if (enLaFuente === enLaBase) continue;
      const absoluta = Math.abs(enLaFuente - enLaBase);
      emisor.diferencia({
        codigo: "dif.biess.cantidad",
        regla: "biess.union@2",
        sobre: `biess.operaciones.cantidad.${tipo}`,
        manda: { fuente: lista, valor: enLaFuente, registro: respuesta(lista, "prestamos") },
        cede: [{ fuente: "basesInternas", valor: enLaBase, registro: respuesta("basesInternas", deLaBaseLista) }],
        magnitud: { absoluta, relativa: enLaFuente ? Math.round((absoluta / enLaFuente) * 10_000) / 10_000 : null },
        lectura: "esperada",
      });
    }
  }

  // Cada préstamo con su tipo, saldo y fecha de fin, para la cuota estimada de
  // la capacidad de pago (estructura-v22). No llega al modelo.
  //
  // Desde estructura-v33 lleva también lo que hace falta para estimar un hipotecario como la informa Equifax (la
  // cuota mensual de `reporteCrediticio` es una anualidad del saldo al 9,0% con los meses que quedan; medido el
  // 2026-11-27 sobre 2.394 cuotas de AWS: tasa implícita mediana 9,02%): el saldo de la fuente de préstamos es de UN
  // corte (`fechaCorte`; en toda la cartera, el cierre de febrero de 2026, siete meses antes de los perfiles de octubre)
  // y hay que llevarlo a hoy con el plan del contrato, que pide el monto, la concesión y la tasa. La cuota estimada es
  // la de la base interna, tal cual. `fuenteDelSaldo` dice de dónde es el saldo: el de la base interna es una foto
  // vieja y sin fecha (1,22 veces el de préstamos en la mediana).
  const detalle = operaciones.map((o) => ({
    tipo: o.tipo,
    saldo: redondear(o.saldo),
    fechaFin: fechaDeDia(o.fin),
    monto: o.monto === null ? null : redondear(o.monto),
    fechaConcesion: fechaDeDia(o.dia),
    // Fracción anual (0,0869), no el 8,69 de la fuente.
    tasaAnual: o.tasa === null ? null : Math.round(o.tasa * 10_000) / 1_000_000,
    cuotaEstimada: o.cuotaEstimada === null ? null : redondear(o.cuotaEstimada),
    fuenteDelSaldo: o.manda.lista === "prestamos" ? "prestamos" : "base_interna",
    fechaCorte: fechaDeDia(o.corte),
  }));
  if (sinIess) {
    // Sin una de las tres fuentes, la unión con las otras dos es el parcial.
    const parcial: Record<string, number | boolean | null | typeof detalle> = {
      "biess.operaciones.cantidad": operaciones.length,
      "biess.tiene": operaciones.length > 0,
      "biess.mora.dias_max": operaciones.length ? Math.max(...operaciones.map((o) => o.diasMora)) : null,
      "biess.saldo": operaciones.length ? redondear(operaciones.reduce((s, o) => s + o.saldo, 0)) : null,
      "biess.operaciones.detalle": detalle,
    };
    for (const [cod, valor] of Object.entries(parcial)) h.sinValor(cod, "biess.union@2", IESS, sinIess, valor);
    return;
  }
  const terminadosDescartados: Descarte[] = terminados.map((f) => ({ registro: refDeFila(consulta, f, "fechaFinCredito" in f.r ? "fechaFinCredito" : "srFecfincredito"), motivo: "terminado_en_la_base_interna" }));
  const unidasDescartadas: Descarte[] = operaciones.flatMap((o) => o.base.map((b) => ({ registro: refDeFila(consulta, b.fila, b.campoDeSaldo), motivo: "misma_operacion_que_la_fuente_de_prestamos" })));
  const porOperacion = operaciones.map((o) => refDeFila(consulta, o.manda));
  const deCadaOperacion = porOperacion.length ? porOperacion : respuestasIess;
  const descartadosIess = [...terminadosDescartados, ...unidasDescartadas];
  h.confirmado("biess.operaciones.cantidad", "biess.union@2", IESS, operaciones.length, deCadaOperacion, corteMasAntiguo(crudo, deCadaOperacion), { descartados: descartadosIess, entidades: claves });
  h.confirmado("biess.tiene", "biess.union@2", IESS, operaciones.length > 0, deCadaOperacion, corteMasAntiguo(crudo, deCadaOperacion), { descartados: descartadosIess, entidades: claves });
  h.confirmado("biess.operaciones.detalle", "biess.union@2", IESS, detalle, deCadaOperacion, corteMasAntiguo(crudo, deCadaOperacion), { entidades: claves });
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
