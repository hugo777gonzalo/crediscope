import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { contarRecientes, fuentesMudas, type DiaDeFuente } from "./contenido-por-fuente.ts";

const dia = (fuente: string, conDatos: number, consultas = 1000, errores = 0): DiaDeFuente => ({ fuente, consultas, conDatos, errores });
const ref = [
  dia("licenciaConducir", 880), dia("licenciaConducir", 870), dia("licenciaConducir", 5),
  dia("titulos", 460), dia("titulos", 215), dia("titulos", 470),
  dia("bienesInmueble", 16), dia("bienesInmueble", 20),
  dia("sercop", 100, 100), // un día con pocas consultas no es referencia
];
Deno.test("avisa cuando una fuente pasa de 88% a 1% sin error", () => {
  const r = contarRecientes(Array.from({ length: 100 }, (_, i) => ({ licenciaConducir: i < 1 ? "ok" : "faltante", titulos: i < 47 ? "ok" : "ok_vacio" })));
  assertEquals(fuentesMudas(r, ref).map((x) => x.fuente), ["licenciaConducir"]);
});
Deno.test("el nivel bajo pero dentro de lo normal de otra población no avisa (titulos 22% contra 46%)", () => {
  const r = contarRecientes(Array.from({ length: 100 }, (_, i) => ({ titulos: i < 22 ? "ok" : "ok_vacio" })));
  assertEquals(fuentesMudas(r, ref), []);
});
Deno.test("los errores no cuentan: es una caída que ya ve la consulta", () => {
  const r = contarRecientes(Array.from({ length: 100 }, (_, i) => ({ licenciaConducir: i < 90 ? "error" : "ok" })));
  assertEquals(fuentesMudas(r, ref), []);
});
Deno.test("pocas consultas, fuente rara o sin días de referencia no avisan", () => {
  const pocas = contarRecientes(Array.from({ length: 10 }, () => ({ licenciaConducir: "faltante" })));
  const rara = contarRecientes(Array.from({ length: 100 }, () => ({ bienesInmueble: "faltante" })));
  const sinHistoria = contarRecientes(Array.from({ length: 100 }, () => ({ sercop: "faltante" })));
  assertEquals(fuentesMudas(pocas, ref), []);
  assertEquals(fuentesMudas(rara, ref), []); // 1,8% x 100 = 1,8 contenidos esperados
  assertEquals(fuentesMudas(sinHistoria, ref), []);
});
