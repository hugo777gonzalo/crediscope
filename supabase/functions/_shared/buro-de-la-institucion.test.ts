// Qué consulta del buró lee un análisis (marco-v33). Si esto falla, el modelo
// lee una consulta del ambiente de prueba (que contesta por otra persona),
// una vencida, o el buró de una base que eligió otro.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { buroDeLaBase, buroVigenteDeLaPersona, consultaVigenteDeEquifax } from "./buro-de-la-institucion.ts";

type Respuesta = { data: unknown; error: { message: string } | null };

// Una base falsa con la forma encadenada de supabase-js: anota cada filtro y
// contesta lo que se le dio para cada tabla.
function baseFalsa(respuestas: Record<string, Respuesta>) {
  const llamadas: Array<{ tabla: string; metodo: string; args: unknown[] }> = [];
  return {
    llamadas,
    from(tabla: string) {
      // deno-lint-ignore no-explicit-any
      const q: any = {};
      for (const metodo of ["select", "eq", "not", "lte", "order", "limit"]) {
        q[metodo] = (...args: unknown[]) => {
          llamadas.push({ tabla, metodo, args });
          return q;
        };
      }
      q.maybeSingle = () => Promise.resolve(respuestas[tabla] ?? { data: null, error: null });
      return q;
    },
  };
}

// 2026-10-16 a mediodía de Ecuador: el ciclo vigente empezó el 18/09 a las
// 00:00 de Ecuador (05:00 UTC).
const AHORA = new Date("2026-10-16T17:00:00Z");
const ESTRUCTURA = { consulta: { identidadVerificada: true }, deudaActualTitular: {} };
const consulta = (created_at: string, estructura: unknown = ESTRUCTURA): Respuesta => ({ data: { id: "c-1", created_at, estructura }, error: null });
const equifax: Respuesta = { data: { clave: "equifax" }, error: null };

Deno.test("el buró de la base es el que dice proveedores.es_buro", async () => {
  assertEquals(await buroDeLaBase(baseFalsa({ proveedores: equifax })), "equifax");
  assertEquals(await buroDeLaBase(baseFalsa({ proveedores: { data: { clave: "aval" }, error: null } })), "aval");
  assertEquals(await buroDeLaBase(baseFalsa({ proveedores: { data: null, error: null } })), null);
  const db = baseFalsa({ proveedores: equifax });
  await buroDeLaBase(db);
  assertEquals(db.llamadas.find((l) => l.metodo === "eq")?.args, ["es_buro", true]);
});

Deno.test("sin saber cuál es el buró no se sigue: un error no se lee como 'no hay buró'", async () => {
  await assertRejects(() => buroDeLaBase(baseFalsa({ proveedores: { data: null, error: { message: "column es_buro does not exist" } } })));
});

Deno.test("la consulta vigente es de la persona, de producción, con estructura y anterior al análisis", async () => {
  const db = baseFalsa({ consultas_equifax: consulta("2026-10-12T21:54:00Z") });
  const c = await consultaVigenteDeEquifax(db, "persona-1", AHORA);
  assertEquals(c, { proveedor: "equifax", consultaId: "c-1", consultadoEl: "2026-10-12T21:54:00Z", estructura: ESTRUCTURA });
  const filtros = db.llamadas.filter((l) => l.metodo !== "select").map((l) => [l.metodo, ...l.args]);
  assertEquals(filtros, [
    ["eq", "client_id", "persona-1"],
    ["eq", "ambiente", "produccion"],
    ["eq", "http_equifax", 200],
    ["not", "estructura", "is", null],
    ["lte", "created_at", AHORA.toISOString()],
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
    ["limit", 1],
  ]);
});

Deno.test("una consulta del ciclo anterior ya no vale: el 18 a las 00:00 de Ecuador caduca todo", async () => {
  // 17/09 a las 23:30 de Ecuador: un ciclo atrás.
  assertEquals(await consultaVigenteDeEquifax(baseFalsa({ consultas_equifax: consulta("2026-09-18T04:30:00Z") }), "p", AHORA), null);
  // 18/09 a las 00:30 de Ecuador: este ciclo.
  assertEquals((await consultaVigenteDeEquifax(baseFalsa({ consultas_equifax: consulta("2026-09-18T05:30:00Z") }), "p", AHORA))?.consultaId, "c-1");
});

Deno.test("sin consulta, o con la de otra persona, no hay buró", async () => {
  assertEquals(await consultaVigenteDeEquifax(baseFalsa({}), "p", AHORA), null);
  const ajena = consulta("2026-10-12T21:54:00Z", { consulta: { identidadVerificada: false } });
  assertEquals(await consultaVigenteDeEquifax(baseFalsa({ consultas_equifax: ajena }), "p", AHORA), null);
});

Deno.test("si el buró de la base es Aval, o no hay, no se busca ninguna consulta de Equifax", async () => {
  for (const proveedores of [{ data: { clave: "aval" }, error: null }, { data: null, error: null }]) {
    const db = baseFalsa({ proveedores, consultas_equifax: consulta("2026-10-12T21:54:00Z") });
    assertEquals(await buroVigenteDeLaPersona(db, "p", AHORA), null);
    assertEquals(db.llamadas.some((l) => l.tabla === "consultas_equifax"), false);
  }
  assertEquals((await buroVigenteDeLaPersona(baseFalsa({ proveedores: equifax, consultas_equifax: consulta("2026-10-12T21:54:00Z") }), "p", AHORA))?.proveedor, "equifax");
});

Deno.test("un error al leer la consulta no se disimula como 'no tiene buró'", async () => {
  await assertRejects(() => consultaVigenteDeEquifax(baseFalsa({ consultas_equifax: { data: null, error: { message: "timeout" } } }), "p", AHORA));
});
