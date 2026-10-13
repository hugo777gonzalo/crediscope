// Vigencia de una consulta de Aval.
//
// Aval actualiza su información el 18 de cada mes; una consulta vale hasta el
// 17 y el 18 caduca todo por igual (decisión del negocio 2026-09-21). La regla
// vive en vigencia-mensual.ts, que comparte con Equifax; acá quedan los
// nombres con los que la importan la función y la pantalla de Aval.

import { estaVigenteHastaElCorte, finDeLaVigencia } from "./vigencia-mensual.ts";

export function estaVigenteAval(fechaConsultaISO: string, ahora: Date = new Date()): boolean {
  return estaVigenteHastaElCorte(fechaConsultaISO, ahora);
}

export function finVigenciaAval(ahora: Date = new Date()): Date {
  return finDeLaVigencia(ahora);
}
