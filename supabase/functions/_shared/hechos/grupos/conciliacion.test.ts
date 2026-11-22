// La prueba de las diferencias de E9 cuyo grupo todavía no existe (docs/capa-de-hechos.md,
// sección 6, punto 12): sale cuando las dos fuentes dicen lo mismo de lo mismo, no sale cuando no,
// y no cambia un valor del perfil. La del punto 13 (la educación) se mudó con su grupo:
// identidad.test.ts.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { buildStandardProfile } from "../../process.ts";
import { catalogoCompleto, derivarHechos } from "../indice.ts";
import type { Contexto } from "../tipos.ts";
import { CATALOGO, diaDeEmision } from "./conciliacion.ts";

const contexto: Contexto = {
  cedula: "0000000000",
  consulta: "perfil-de-prueba",
  fechaDeLaConsulta: "2026-10-01T12:00:00-05:00",
  corteIess: "2026-10",
  persona: { nombre: null, fechaDeNacimiento: null },
};
const ok = (data: unknown) => ({ status: "ok", data });
const de = (doc: ReturnType<typeof derivarHechos>, codigo: string) => doc.diferencias.filter((d) => d.codigo === codigo);

Deno.test("el grupo sólo tiene diferencias: ningún campo del perfil, nada llega al modelo, y cada código está una vez en el catálogo", () => {
  assertEquals(CATALOGO.every((c) => c.codigo.startsWith("dif.") && !c.campoDelPerfil && !c.llegaAlModelo), true);
  const todos = catalogoCompleto().map((c) => c.codigo);
  assertEquals(todos.length, new Set(todos).size);
});

// ---- Punto 12 ----

const conMultas = (ant: unknown[], amt: unknown[]) => ({ deudasAnt: ok({ deudaAnts: ant }), deudasAmt: ok({ deudaAmt: amt }) });

Deno.test("dif.tra.posible_repetida: la misma placa y día de emisión en la ANT y la AMT, aunque el monto difiera", () => {
  const doc = derivarHechos(conMultas(
    [{ placa: "abc-1234", fechaEmision: "2025-07-11 10:00:00.0", total: "100" }, { placa: "ABC1234", fechaEmision: "2025-07-12 10:00:00.0", total: "50" }],
    [{ placa: "ABC1234", fechaEmision: "11/07/2025", total: 101.5 }],
  ), contexto);
  const difs = de(doc, "dif.tra.posible_repetida");
  assertEquals(difs.map((d) => [d.manda.registro.indice, d.cede[0].registro.indice, d.manda.valor, d.cede[0].valor, d.magnitud.absoluta, d.lectura]), [[0, 0, 100, 101.5, 1.5, "revisar"]]);
  // Otra placa u otro día: no.
  assertEquals(de(derivarHechos(conMultas([{ placa: "XYZ9876", fechaEmision: "2025-07-11 10:00:00.0", total: "100" }], [{ placa: "ABC1234", fechaEmision: "11/07/2025", total: 100 }]), contexto), "dif.tra.posible_repetida"), []);
  // El perfil las sigue contando a las dos.
  const perfil = buildStandardProfile(conMultas([{ placa: "ABC1234", fechaEmision: "2025-07-11 10:00:00.0", total: "100" }], [{ placa: "ABC1234", fechaEmision: "11/07/2025", total: 100 }]) as never, "0000000000", "2026-10").profile;
  assertEquals(perfil.transitoVehicular.numeroMultas, 2);
});

Deno.test("diaDeEmision lee las dos formas, y nada más", () => {
  assertEquals([diaDeEmision("2024-12-29 12:47:47.0"), diaDeEmision("1/7/2025"), diaDeEmision("2025"), diaDeEmision(null)], ["2024-12-29", "2025-07-01", null, null]);
});
