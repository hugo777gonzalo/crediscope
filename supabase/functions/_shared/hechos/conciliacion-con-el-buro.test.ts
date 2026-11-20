// La prueba de dif.end.bancos (docs/capa-de-hechos.md, sección 6, punto 16): la deuda de bancos
// según el buró de la institución contra la de Proveedor_Info_1, sin cambiar ninguna.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { derivarHechos } from "./indice.ts";
import { diferenciaDeBancosConElBuro } from "./conciliacion-con-el-buro.ts";
import { catalogoCompleto } from "./indice.ts";
import type { Contexto } from "./tipos.ts";

const contexto: Contexto = {
  cedula: "0000000000",
  consulta: "perfil-de-prueba",
  fechaDeLaConsulta: "2026-10-01T12:00:00-05:00",
  corteIess: "2026-10",
  persona: { nombre: null, fechaDeNacimiento: null },
};
const fila = (saldoVigente: number, mora = 0) => ({ fecha: "2026/08/31", entnombre: "BANCO INVENTADO", riesgo: "T", calificacion: "A1", saldoVigente, mora, saldomora: 0, noDevengaInteres: 0, judicial: 0, castigo: 0 });
const bancos = (super_: unknown[], estado = "ok") => ({
  buroCreditoSuper: { status: estado, data: estado === "ok" ? { datosSuper: super_ } : null },
  buroCreditoDiners: { status: "ok", data: { datosSuper: [] } },
});
const buro = (saldoDeudaUsd: unknown) => ({ proveedor: "equifax" as const, estructura: { deudaActualTitular: { bancos: { saldoDeudaUsd } } } });

Deno.test("dif.end.bancos: manda el buró, la de Proveedor_Info_1 es por vencer más en atraso", () => {
  const doc = derivarHechos(bancos([fila(1000, 50), fila(400)]), contexto);
  const d = diferenciaDeBancosConElBuro(doc, buro(1300), "c-1")!;
  assertEquals([d.codigo, d.manda.valor, d.cede[0].valor, d.magnitud.absoluta, d.lectura], ["dif.end.bancos", 1300, 1450, 150, "esperada"]);
  assertEquals([d.manda.registro.consulta, d.manda.registro.fuente, d.cede[0].registro.fuente], ["equifax/c-1", "equifax", "buroCreditoSuper"]);
  assertEquals(catalogoCompleto().some((c) => c.codigo === d.codigo), true);
});

Deno.test("dif.end.bancos: una dice cero y la otra no, a revisar; iguales, igual se guarda", () => {
  assertEquals(diferenciaDeBancosConElBuro(derivarHechos(bancos([]), contexto), buro(800), "c-1")?.lectura, "revisar");
  const igual = diferenciaDeBancosConElBuro(derivarHechos(bancos([fila(800)]), contexto), buro(800), "c-1")!;
  assertEquals([igual.magnitud.absoluta, igual.lectura], [0, "esperada"]);
});

Deno.test("dif.end.bancos: sin respuesta de bancos o sin el dato en el buró, no hay qué comparar", () => {
  assertEquals(diferenciaDeBancosConElBuro(derivarHechos(bancos([], "error"), contexto), buro(800), "c-1"), null);
  assertEquals(diferenciaDeBancosConElBuro(derivarHechos(bancos([fila(800)]), contexto), buro(null), "c-1"), null);
  assertEquals(diferenciaDeBancosConElBuro(derivarHechos(bancos([fila(800)]), contexto), { proveedor: "equifax", estructura: {} }, "c-1"), null);
});
