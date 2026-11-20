// Grupo 1 de la capa de hechos, la parte de cooperativas (docs/capa-de-hechos.md,
// 4.1): una sola fuente (`buroCreditoCoop`), sumas y máximos, sin unión.
//
// ETAPA B (estructura-v25): process.ts arma `comportamientoCooperativas` desde
// estos hechos. Sin respuesta de la fuente, cada hecho queda sin dato con su
// `parcial` (lo que trajeran las filas igual), como en bancos.

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { aportesDe, type AnyRecord, citar, corteMasAntiguo, type Fila, filasDe, num, redondear, refDeFila, refDeRespuesta, respuestaDe, textoDe } from "../lectura-del-crudo.ts";
import type { CodigoDelCatalogo, Contexto, DiferenciaEsperada, OperacionDeCredito } from "../tipos.ts";

const P = "comportamientoCooperativas.";

function codigo(
  codigo: string,
  unidad: CodigoDelCatalogo["unidad"],
  descripcion: string,
  campo: string,
  enElPerfilSinValor: CodigoDelCatalogo["enElPerfilSinValor"],
  recuento?: CodigoDelCatalogo["recuento"],
): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo, unidad, descripcion, campoDelPerfil: P + campo, llegaAlModelo: true, esIdentificador: false, enElPerfilSinValor };
  if (recuento) c.recuento = recuento;
  return c;
}

export const CATALOGO: CodigoDelCatalogo[] = [
  codigo("coop.operaciones.cantidad", "cantidad", "Operaciones con cooperativas", "numeroOperaciones", 0, "conteo"),
  codigo("coop.mora.dias_max", "dias", "Días de mora máximos con cooperativas, al corte", "diasMoraMaxima", null, "maximo"),
  codigo("coop.saldo.total", "usd", "Saldo total con cooperativas", "saldoTotal", 0, "suma"),
  codigo("coop.saldo.en_mora", "usd", "Saldo vencido con cooperativas", "saldoEnMora", 0, "suma"),
  codigo("coop.operaciones.con_demanda", "si_no", "Tiene una operación con cooperativas en demanda judicial", "tieneOperacionConDemanda", false),
  codigo("coop.operaciones.castigadas", "si_no", "Tiene una operación con cooperativas castigada", "tieneOperacionCastigada", false),
  codigo("coop.cuota.mensual", "usd", "Cuota mensual informada por las cooperativas", "cuotaMensualTotal", 0, "suma"),
];

// Ninguna regla de cooperativas une, elige ni descarta registros.
export const REGLAS_QUE_MEZCLAN: string[] = [];

// Contra estructura-v24, la única diferencia es el «sin dato» (E4): con una
// fuente que no contestó, el campo pasa del parcial o de 0 a null, marcado en
// camposSinDato. comparar-hechos.mjs --contra la cuenta y corta con cualquier otra.
export const DIFERENCIAS_ESPERADAS: DiferenciaEsperada[] = [
  {
    campo: "comportamientoCooperativas.*",
    detector: "dato-de-fuente-sin-respuesta-escrito-como-total",
    aprobadaEl: "pendiente: la aprueba el negocio con el PR de estructura-v25",
    motivo: "una fuente que no contestó deja el campo sin dato en vez del parcial o 0",
    cuando: "sin_dato",
  },
];

// val_venc_1..11: lo vencido por tramo de antigüedad (no el saldo total), visto
// en un caso real con dos cooperativas (estructura-v8).
const CAMPOS_VENCIDO_COOP = Array.from({ length: 11 }, (_, i) => `val_venc_${i + 1}`);
const FUENTES = ["buroCreditoCoop"];

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const h = ayudanteDelGrupo(emisor, CATALOGO);
  const coop = filasDe(crudo, "buroCreditoCoop", "datosSuper");

  for (const f of coop) {
    const atributos: OperacionDeCredito = {
      sistema: "cooperativas",
      acreedor: textoDe(f.r.razon_social),
      rol: "titular",
      estado: null,
      fechaDeConcesion: null,
      montoOriginal: null,
      // El saldo por vencer y lo que no devenga vienen por tramos que nadie
      // midió todavía: no se interpretan acá.
      saldoPorVencer: null,
      saldoVencido: redondear(CAMPOS_VENCIDO_COOP.reduce((s, campo) => s + (num(f.r[campo]) ?? 0), 0)),
      saldoNoDevenga: null,
      saldoEnDemanda: num(f.r.val_dem_judicial),
      saldoCastigado: num(f.r.val_cart_castigada),
      diasDeMora: num(f.r.num_dias_morosidad),
      calificacion: null,
      cuotaMensual: num(f.r.val_cuota_credito),
    };
    const numero = String(f.r.num_operacion ?? "").trim().replace(/^0+/, "");
    const registro = refDeFila(consulta, f);
    emisor.entidad({
      clave: emisor.clave("op", numero ? `coop#${String(f.r.codRuc ?? "").trim()}#${numero}` : `buroCreditoCoop#${f.indice}`),
      tipo: "operacion",
      atributos,
      vistas: [{ registro, fechaDelDato: corteMasAntiguo(crudo, [registro]), atributos }],
      union: null,
      atribucion: { deLaPersona: "si", metodo: "la_fuente_busca_por_identificacion" },
    });
  }

  const respuesta = respuestaDe(crudo, "buroCreditoCoop");
  const sinCoop = respuesta === "contesto" ? null : respuesta;
  const respuestas = [refDeRespuesta(crudo, consulta, "buroCreditoCoop", "datosSuper")];
  const filasRef = (filas: Fila[], campo?: string) => filas.map((f) => refDeFila(consulta, f, campo));
  const confirmado = (cod: string, regla: string, valor: number | boolean, registros: ReturnType<typeof filasRef>) => {
    if (sinCoop) h.sinValor(cod, regla, FUENTES, sinCoop, valor);
    else h.confirmado(cod, regla, FUENTES, valor, registros, corteMasAntiguo(crudo, registros));
  };

  confirmado("coop.operaciones.cantidad", "coop.conteo@1", coop.length, coop.length ? filasRef(coop) : respuestas);

  if (!coop.length) h.sinValor("coop.mora.dias_max", "coop.max@1", FUENTES, sinCoop ?? "no_aplica", sinCoop ? null : undefined);
  else {
    const valor = Math.max(...coop.map((c) => num(c.r.num_dias_morosidad) ?? 0));
    confirmado("coop.mora.dias_max", "coop.max@1", valor, [refDeFila(consulta, coop.find((c) => (num(c.r.num_dias_morosidad) ?? 0) === valor)!, "num_dias_morosidad")]);
  }

  const suma = (cod: string, campos: string[], valor: number) =>
    confirmado(cod, "coop.suma@1", valor, citar(campos.flatMap((campo) => aportesDe(consulta, coop, () => campo)), filasRef(coop), respuestas));
  suma("coop.saldo.total", ["val_saldo_total"], redondear(coop.reduce((s, c) => s + (num(c.r.val_saldo_total) ?? 0), 0)));
  suma("coop.saldo.en_mora", CAMPOS_VENCIDO_COOP, redondear(coop.reduce((s, c) => s + CAMPOS_VENCIDO_COOP.reduce((s2, campo) => s2 + (num(c.r[campo]) ?? 0), 0), 0)));
  suma("coop.cuota.mensual", ["val_cuota_credito"], redondear(coop.reduce((s, c) => s + (num(c.r.val_cuota_credito) ?? 0), 0)));

  for (const [cod, campo] of [["coop.operaciones.con_demanda", "val_dem_judicial"], ["coop.operaciones.castigadas", "val_cart_castigada"]]) {
    const con = coop.filter((c) => (num(c.r[campo]) ?? 0) > 0);
    confirmado(cod, "coop.alguna@1", con.length > 0, citar(filasRef(con, campo), filasRef(coop), respuestas));
  }
}
