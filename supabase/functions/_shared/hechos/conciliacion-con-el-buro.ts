// E9 de la capa de hechos, punto 16 (docs/capa-de-hechos.md, sección 6): la deuda de bancos según
// Proveedor_Info_1 contra la del buró de la institución.
//
// Con buró, manda el buró para bancos, Diners y cooperativas: perfil-del-modelo.ts
// (`endeudamientoConBuroEquifax()`) toma su deuda y saca la de Proveedor_Info_1. Hasta acá la de
// Proveedor_Info_1 se tiraba sin dejar dicho cuánto decía: lo que no se guarda no se puede medir.
// Esta función no cambia ningún valor ni lo que lee el modelo.
//
// No va dentro de derivarHechos(): los hechos se derivan del crudo de Proveedor_Info_1 y el
// buró es otra consulta, con otra fecha (la sección 7 lo lleva al contrato neutro, y ahí esta
// diferencia pasa a salir de `buro.deuda.bancos.saldo`). Quien tiene los dos la llama: hoy sólo
// scripts/medir-conciliacion.mjs.
//
// Las dos miden la deuda propia (como titular) en bancos, Diners incluido: en Proveedor_Info_1,
// por vencer más en atraso (`ban.saldo.por_vencer` + `ban.saldo.en_atraso`); en Equifax,
// `deudaActualTitular.bancos.saldoDeudaUsd`. Los cortes no son los mismos (la lista de la
// Superintendencia de Proveedor_Info_1 contra el reporte de Equifax del día que se pidió), así
// que la diferencia es esperada. Se lee «revisar» sólo si una de las dos dice cero y la otra no:
// una ve deuda que la otra no ve.

import type { BuroDeLaInstitucion } from "../perfil-del-modelo.ts";
import type { Diferencia, HechosDeLaPersona, RefDeRegistro } from "./tipos.ts";
import { redondear } from "./lectura-del-crudo.ts";

export const CODIGO_DEUDA_DE_BANCOS = "dif.end.bancos";

const comoObjeto = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function diferenciaDeBancosConElBuro(doc: HechosDeLaPersona, buro: BuroDeLaInstitucion, consultaDelBuro: string): Diferencia | null {
  const porVencer = doc.hechos.find((h) => h.codigo === "ban.saldo.por_vencer");
  const enAtraso = doc.hechos.find((h) => h.codigo === "ban.saldo.en_atraso");
  // Con bancos sin respuesta no hay qué comparar: un parcial no es lo que dice la fuente.
  if (typeof porVencer?.valor !== "number" || typeof enAtraso?.valor !== "number") return null;
  const deBancos = comoObjeto(comoObjeto(buro.estructura?.deudaActualTitular)?.bancos);
  const delBuro = deBancos?.saldoDeudaUsd;
  if (typeof delBuro !== "number" || !Number.isFinite(delBuro)) return null;

  const delProveedor = redondear(porVencer.valor + enAtraso.valor);
  const absoluta = redondear(Math.abs(delBuro - delProveedor));
  const registroDelBuro: RefDeRegistro = { consulta: `${buro.proveedor}/${consultaDelBuro}`, fuente: buro.proveedor, campo: "deudaActualTitular.bancos.saldoDeudaUsd" };
  // La deuda de Proveedor_Info_1 cita lo que citan sus dos hechos: el primero de cada uno basta para
  // abrirla (la lista entera de registros está en el hecho).
  const registroDelProveedor = porVencer.registros[0] ?? enAtraso.registros[0];
  const unaEnCero = (delBuro === 0) !== (delProveedor === 0);
  return {
    clase: "diferencia",
    codigo: CODIGO_DEUDA_DE_BANCOS,
    regla: "end.bancos@1",
    fechaDeLaConsulta: doc.contexto.fechaDeLaConsulta,
    // El código que emitirá la señal de endeudamiento (sección 7.3) con la deuda de bancos.
    sobre: "end.deuda.bancos",
    manda: { fuente: buro.proveedor, valor: redondear(delBuro), registro: registroDelBuro },
    cede: [{ fuente: "buroCreditoSuper+buroCreditoDiners", valor: delProveedor, registro: registroDelProveedor }],
    magnitud: { absoluta, relativa: delBuro ? Math.round((absoluta / delBuro) * 10_000) / 10_000 : null },
    lectura: unaEnCero ? "revisar" : "esperada",
  };
}
