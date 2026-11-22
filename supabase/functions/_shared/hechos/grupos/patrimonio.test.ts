// La prueba del grupo de patrimonio (docs/capa-de-hechos.md, 4.5 y 5.2): cada campo de `patrimonio`
// tiene su código, el colateral de cada vehículo cita el precio que lo sostiene y descarta el avalúo
// cuando hay un precio de mercado (P61), y una fuente caída no se confunde con «no hay». La paridad
// sobre los crudos inventados la corre probar-crudos-sinteticos.mjs.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import { buildStandardProfile } from "../../process.ts";
import type { Contexto, Hecho } from "../tipos.ts";
import { CATALOGO, precioDeColateral } from "./patrimonio.ts";

const CEDULA = "0000000000";
const contexto: Contexto = { cedula: CEDULA, consulta: "perfil-de-prueba", fechaDeLaConsulta: "2026-10-01T12:00:00-05:00", corteIess: "2026-10", persona: { nombre: null, fechaDeNacimiento: null } };
const ok = (data: unknown) => ({ status: "ok", data });
let ultimoCrudo: unknown = null;
function derivar(partes: Record<string, unknown>) {
  ultimoCrudo = { general: ok({ personaNatural: { nombre: "PRUEBA FICTICIO" } }), ...partes };
  return derivarHechos(ultimoCrudo, contexto, { estricto: true });
}
const hecho = (doc: ReturnType<typeof derivarHechos>, codigo: string): Hecho => doc.hechos.find((h) => h.codigo === codigo)!;
const perfilDelCrudo = () => buildStandardProfile(ultimoCrudo as never, CEDULA).profile.patrimonio;
const indices = (h: Hecho) => h.registros.map((r) => `${r.indice ?? "-"}${r.campo ? `.${r.campo}` : ""}`);

Deno.test("cero campos sin procedencia: todo campo de patrimonio tiene su código, en el orden de types.ts", () => {
  const texto = Deno.readTextFileSync(new URL("../../types.ts", import.meta.url));
  const desde = texto.indexOf("  patrimonio: {");
  const hasta = texto.indexOf("\n  };", desde);
  const campos = [...texto.slice(desde, hasta).matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]).filter((c) => c !== "camposSinDato");
  assertEquals(campos.length, 12);
  assertEquals(CATALOGO.map((c) => c.campoDelPerfil), campos.map((c) => `patrimonio.${c}`));
});

Deno.test("el colateral: el primer precio de mercado, el avalúo sólo sin ninguno y nunca negativo", () => {
  assertEquals(precioDeColateral({ valorAvaluo: 39594, precioPromedio: 17484, precioMaximo: 20000 }), { campo: "precioPromedio", valor: 17484 });
  assertEquals(precioDeColateral({ valorAvaluo: 8000, precioPromedio: 0, precioComercial: 9000, precioVentaPublico: 9500 }), { campo: "precioComercial", valor: 9000 });
  assertEquals(precioDeColateral({ valorAvaluo: 82, precioVenta: 3000 }), { campo: "valorAvaluo", valor: 82 });
  assertEquals(precioDeColateral({ valorAvaluo: -5 }), { campo: null, valor: 0 });
});

Deno.test("vehículos: cada uno cita el precio de su colateral, el avalúo descartado queda a la vista y los tipos se reparten", () => {
  const doc = derivar({
    vehiculos: ok({
      personaVehiculo: [
        { tipoComercial: "autos", valorAvaluo: 12000, precioPromedio: 10000, precioComercial: 11000 },
        { tipoComercial: "motos", valorAvaluo: 82 },
        { tipoComercial: "pesados", valorAvaluo: 39594, precioVentaPromedio: 17484, precioVentaPublico: 18000 },
        { tipoComercial: "otros", valorAvaluo: -3 },
      ],
    }),
    bienesInmueble: ok({ bienesInmueble: [{}, {}] }),
    inversiones: ok({ inversiones: [] }),
  });
  const col = hecho(doc, "pat.vehiculos.colateral.total");
  assertEquals(col.valor, 10000 + 82 + 17484);
  assertEquals(indices(col), ["0.precioPromedio", "1.valorAvaluo", "2.precioVentaPromedio"]);
  assertEquals((col.descartados ?? []).map((d) => `${d.registro.indice}:${d.motivo}`), ["0:trae_precio_de_mercado_y_el_avaluo_no_se_usa", "2:trae_precio_de_mercado_y_el_avaluo_no_se_usa"]);
  assertEquals(hecho(doc, "pat.vehiculos.avaluo.total").valor, 12000 + 82 + 39594 - 3);
  assertEquals([hecho(doc, "pat.vehiculos.autos.cantidad").valor, hecho(doc, "pat.vehiculos.motos.cantidad").valor, hecho(doc, "pat.vehiculos.pesados.cantidad").valor], [1, 1, 1]);
  assertEquals((hecho(doc, "pat.vehiculos.autos.cantidad").descartados ?? []).map((d) => d.registro.indice), [1, 2, 3]);
  assertEquals([hecho(doc, "pat.vehiculos.cantidad").valor, hecho(doc, "pat.inmuebles.cantidad").valor, hecho(doc, "pat.inversiones.cantidad").valor], [4, 2, 0]);
  assertEquals(perfilDesdeHechos(doc, "patrimonio"), perfilDelCrudo());
});

Deno.test("vehículos con `faltante` es su «no hay»: sin vehículos y confirmado, citando la respuesta", () => {
  const doc = derivar({ vehiculos: { status: "faltante", data: null }, bienesInmueble: ok({ bienesInmueble: [] }), inversiones: ok({ inversiones: [] }) });
  const h = hecho(doc, "pat.vehiculos.cantidad");
  assertEquals([h.valor, h.calidad, indices(h)], [0, "confirmado_por_tercero", ["-"]]);
  assertEquals(hecho(doc, "pat.vehiculos.existe").valor, false);
  assertEquals(perfilDesdeHechos(doc, "patrimonio"), perfilDelCrudo());
});

Deno.test("una fuente caída (vehículos en error, inmuebles en faltante) queda sin valor con su parcial, y en la etapa A el perfil escribe el parcial", () => {
  const doc = derivar({ vehiculos: { status: "error", data: null }, bienesInmueble: { status: "faltante", data: null }, inversiones: ok({ inversiones: [{}] }) });
  for (const c of ["pat.vehiculos.cantidad", "pat.vehiculos.colateral.total", "pat.inmuebles.cantidad"]) {
    const h = hecho(doc, c);
    assertEquals([h.valor, h.calidad, h.motivo, h.parcial], [null, "no_disponible", "fuente_sin_respuesta", 0]);
  }
  assertEquals(hecho(doc, "pat.vehiculos.existe").parcial, false);
  assertEquals(hecho(doc, "pat.inversiones.cantidad").valor, 1);
  assertEquals(perfilDesdeHechos(doc, "patrimonio"), perfilDelCrudo());
});
