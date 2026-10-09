// La comparación de claves del vigía, del lote y de los guiones (E4 de la
// auditoría externa del 2026-10-09).
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { clavesIguales } from "./autorizacion.ts";

Deno.test("claves iguales", () => {
  assertEquals(clavesIguales("una-clave-larga", "una-clave-larga"), true);
});

Deno.test("claves distintas del mismo largo", () => {
  assertEquals(clavesIguales("una-clave-larga", "una-clave-largo"), false);
});

Deno.test("un prefijo de la clave no alcanza", () => {
  assertEquals(clavesIguales("una-clave", "una-clave-larga"), false);
  assertEquals(clavesIguales("una-clave-larga", "una-clave"), false);
});

Deno.test("vacía contra algo", () => {
  assertEquals(clavesIguales("", "una-clave-larga"), false);
});

Deno.test("con acentos se comparan los bytes", () => {
  assertEquals(clavesIguales("año", "año"), true);
  assertEquals(clavesIguales("año", "ano"), false);
});
