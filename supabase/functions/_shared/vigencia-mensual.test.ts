// La vigencia de una consulta que se cobra: vale hasta el 17 y el 18 (00:00 de
// Ecuador, 05:00 UTC) caduca todo por igual. Los bordes son lo que importa:
// una hora de diferencia es una consulta de más que se paga, o una vencida que
// se sirve.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { estaVigenteHastaElCorte, finDeLaVigencia } from "./vigencia-mensual.ts";
import { estaVigenteAval, finVigenciaAval } from "./aval-vigencia.ts";

const utc = (iso: string) => new Date(iso);

Deno.test("una consulta del 20 vale hasta el 17 del mes siguiente", () => {
  const hecha = "2026-10-20T15:00:00Z";
  assertEquals(estaVigenteHastaElCorte(hecha, utc("2026-11-17T23:59:59-05:00")), true);
});

Deno.test("el 18 a las 00:00 de Ecuador caduca todo", () => {
  const hecha = "2026-10-20T15:00:00Z";
  assertEquals(estaVigenteHastaElCorte(hecha, utc("2026-11-18T00:00:00-05:00")), false);
  // y un segundo antes todavía vale
  assertEquals(estaVigenteHastaElCorte(hecha, utc("2026-11-17T23:59:59-05:00")), true);
});

Deno.test("una consulta del 16 caduca el 18 aunque sea de dos días antes", () => {
  const hecha = "2026-10-16T12:00:00-05:00";
  assertEquals(estaVigenteHastaElCorte(hecha, utc("2026-10-17T23:59:59-05:00")), true);
  assertEquals(estaVigenteHastaElCorte(hecha, utc("2026-10-18T00:00:00-05:00")), false);
});

Deno.test("a las 20:00 de Ecuador del 17 la fecha UTC ya es la del 18 y sigue vigente", () => {
  // 2026-10-18T01:00Z es el 17 a las 20:00 en Ecuador.
  assertEquals(estaVigenteHastaElCorte("2026-10-10T12:00:00Z", utc("2026-10-18T01:00:00Z")), true);
});

Deno.test("el fin de la vigencia es el 17 a las 23:59:59 de Ecuador", () => {
  assertEquals(finDeLaVigencia(utc("2026-10-20T15:00:00Z")).toISOString(), "2026-11-18T04:59:59.000Z");
  assertEquals(finDeLaVigencia(utc("2026-10-05T15:00:00Z")).toISOString(), "2026-10-18T04:59:59.000Z");
});

Deno.test("cambio de año: una consulta de diciembre vale hasta el 17 de enero", () => {
  assertEquals(estaVigenteHastaElCorte("2026-12-20T12:00:00Z", utc("2027-01-17T23:59:59-05:00")), true);
  assertEquals(estaVigenteHastaElCorte("2026-12-20T12:00:00Z", utc("2027-01-18T00:00:00-05:00")), false);
  assertEquals(finDeLaVigencia(utc("2026-12-20T12:00:00Z")).toISOString(), "2027-01-18T04:59:59.000Z");
});

Deno.test("una fecha ilegible no es vigente", () => {
  assertEquals(estaVigenteHastaElCorte("no es una fecha", utc("2026-10-20T15:00:00Z")), false);
});

Deno.test("Aval sigue diciendo lo mismo con los nombres de siempre", () => {
  const ahora = utc("2026-10-20T15:00:00Z");
  assertEquals(estaVigenteAval("2026-10-19T12:00:00Z", ahora), estaVigenteHastaElCorte("2026-10-19T12:00:00Z", ahora));
  assertEquals(finVigenciaAval(ahora).toISOString(), finDeLaVigencia(ahora).toISOString());
});
