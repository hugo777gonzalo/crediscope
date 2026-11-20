// La prueba del grupo 2 (docs/capa-de-hechos.md, 4.2 y 5.2): cada campo de
// `comportamientoInterno` tiene su código, la regla de elección se prueba con dos
// vigentes, dos canceladas y empate, y lo nuevo (D5, 2026-11-18) no llega a ninguna
// parte. La paridad sobre los crudos inventados la corre probar-crudos-sinteticos.mjs.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { catalogoCompleto, derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import type { Contexto, OperacionDeCredito } from "../tipos.ts";
import { CATALOGO, elegirOperacion } from "./historial-con-la-institucion.ts";
import { filasDe } from "../lectura-del-crudo.ts";

const contexto: Contexto = {
  cedula: "0000000000",
  consulta: "perfil-de-prueba",
  fechaDeLaConsulta: "2026-10-01T12:00:00-05:00",
  corteIess: "2026-10",
  persona: { nombre: null, fechaDeNacimiento: null },
};

const op = (operacion: number, estadoOperacion: string, extra: Record<string, unknown> = {}) => ({
  identificacion: "0000000000", fechaCorte: "2026-09-30", operacion, estadoOperacion, cuotaNova: 100, plazoCuotas: 12,
  saldoCapital: 0, diasMoraVigentes: 0, diasMoraMax: 0, perfilInterno: "A", resultadoHabitoPago: "BUENO", ...extra,
});
const crudoCon = (operaciones: unknown[]) => ({ basesInternas: { status: "ok", data: { personasIncumplimientos: operaciones } } });
const hecho = (doc: ReturnType<typeof derivarHechos>, codigo: string) => doc.hechos.find((h) => h.codigo === codigo)!;
const indices = (doc: ReturnType<typeof derivarHechos>, codigo: string) => hecho(doc, codigo).registros.map((r) => r.indice);
const descartados = (doc: ReturnType<typeof derivarHechos>, codigo: string) => (hecho(doc, codigo).descartados ?? []).map((d) => `${d.registro.indice}:${d.motivo}`);

// Los campos de comportamientoInterno en types.ts, leídos del archivo: un campo
// nuevo del perfil sin su código en el catálogo corta acá, sin datos.
Deno.test("cero campos sin procedencia: todo campo de comportamientoInterno tiene su código", () => {
  const texto = Deno.readTextFileSync(new URL("../../types.ts", import.meta.url));
  const desde = texto.indexOf("  comportamientoInterno: {");
  const hasta = texto.indexOf("\n  };", desde);
  const campos = [...texto.slice(desde, hasta).matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]);
  assertEquals(campos.length, 7);
  const conCodigo = new Set(CATALOGO.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil] : [])));
  assertEquals(campos.filter((c) => !conCodigo.has(`comportamientoInterno.${c}`)), []);
});

Deno.test("D5: lo nuevo no tiene campo del perfil ni llega al modelo, y ninguna señal ni diferencia lo toma", () => {
  const nuevos = CATALOGO.filter((c) => !c.campoDelPerfil);
  assertEquals(nuevos.map((c) => c.codigo), ["inst.operaciones.cantidad", "inst.operaciones.vigentes", "inst.mora.dias_max_entre_todas"]);
  assertEquals(nuevos.every((c) => !c.llegaAlModelo && !c.esIdentificador), true);
  const doc = derivarHechos(crudoCon([op(1, "VIGENTE", { saldoCapital: 100 }), op(2, "VIGENTE", { saldoCapital: 200 })]), contexto);
  assertEquals(doc.senales.some((s) => s.derivaDe.some((d) => d.startsWith("inst."))), false);
  assertEquals(Object.keys(perfilDesdeHechos(doc, "comportamientoInterno")).length, 7);
  // El saldo del perfil es el de UNA operación: nada suma las dos.
  assertEquals(perfilDesdeHechos(doc, "comportamientoInterno").proveedorInfo1SaldoCapitalVigente, 200);
  assertEquals(catalogoCompleto().filter((c) => c.codigo.startsWith("inst.")).length, CATALOGO.length);
});

Deno.test("dos vigentes: gana la de mayor saldo y la otra queda descartada", () => {
  const doc = derivarHechos(crudoCon([op(1, "VIGENTE", { saldoCapital: 1000, perfilInterno: "B" }), op(2, "VIGENTE", { saldoCapital: 3000, perfilInterno: "A" })]), contexto);
  for (const c of ["inst.operacion.saldo", "inst.perfil_interno", "inst.habito_de_pago"]) {
    assertEquals(indices(doc, c), [1], c);
    assertEquals(descartados(doc, c), ["0:vigente_de_menor_saldo"], c);
  }
  assertEquals([hecho(doc, "inst.operacion.saldo").valor, hecho(doc, "inst.perfil_interno").valor], [3000, "A"]);
  assertEquals([hecho(doc, "inst.operaciones.cantidad").valor, hecho(doc, "inst.operaciones.vigentes").valor], [2, 2]);
});

Deno.test("dos canceladas: gana la de mayor cuota por plazo, no la de mayor saldo", () => {
  const doc = derivarHechos(
    crudoCon([op(1, "CANCELADA", { cuotaNova: 50, plazoCuotas: 12, saldoCapital: 900 }), op(2, "CANCELADA", { cuotaNova: 100, plazoCuotas: 24, saldoCapital: 0 })]),
    contexto,
  );
  assertEquals(indices(doc, "inst.operacion.estado"), [1]);
  assertEquals(descartados(doc, "inst.operacion.estado"), ["0:cancelada_de_menor_tamano"]);
  assertEquals(hecho(doc, "inst.operacion.saldo").valor, 0);
  assertEquals(hecho(doc, "inst.operaciones.vigentes").valor, 0);
});

Deno.test("empate: gana el número de operación más alto, y con todo igual, la primera", () => {
  const empate = derivarHechos(crudoCon([op(5, "VIGENTE", { saldoCapital: 2000 }), op(9, "VIGENTE", { saldoCapital: 2000 })]), contexto);
  assertEquals(indices(empate, "inst.operacion.saldo"), [1]);
  assertEquals(descartados(empate, "inst.operacion.saldo"), ["0:empate_gana_el_numero_de_operacion_mas_alto"]);
  // Como operacionDelComportamientoInterno: el orden es estable.
  const igual = derivarHechos(crudoCon([op(5, "VIGENTE", { saldoCapital: 2000 }), op(5, "VIGENTE", { saldoCapital: 2000 })]), contexto);
  assertEquals(indices(igual, "inst.operacion.saldo"), [0]);
  assertEquals(descartados(igual, "inst.operacion.saldo"), ["1:empate_total_gana_la_primera"]);
});

Deno.test("una vigente gana a una cancelada aunque la cancelada sea más grande y vaya primero", () => {
  const doc = derivarHechos(crudoCon([op(1, "CANCELADA", { cuotaNova: 900, plazoCuotas: 60 }), op(2, "VIGENTE", { saldoCapital: 10 })]), contexto);
  assertEquals(indices(doc, "inst.operacion.estado"), [1]);
  assertEquals(descartados(doc, "inst.operacion.estado"), ["0:cancelada_con_una_vigente"]);
  // Un estado que no es CANCELADA (hay «GENERADO MES») cuenta como vigente, igual que la regla del perfil.
  const generado = derivarHechos(crudoCon([op(1, "CANCELADA"), op(2, "GENERADO MES", { saldoCapital: 5 })]), contexto);
  assertEquals(hecho(generado, "inst.operacion.estado").valor, "GENERADO MES");
  assertEquals(hecho(generado, "inst.operaciones.vigentes").valor, 1);
});

Deno.test("elegirOperacion no cambia la lista que recibe", () => {
  const filas = filasDe(crudoCon([op(1, "CANCELADA"), op(2, "VIGENTE", { saldoCapital: 1 })]), "basesInternas", "personasIncumplimientos");
  const antes = filas.map((f) => f.indice);
  assertEquals(elegirOperacion(filas)?.indice, 1);
  assertEquals(filas.map((f) => f.indice), antes);
  assertEquals(elegirOperacion([]), null);
});

Deno.test("la mora máxima entre todas mira las demás; la de la elegida, sólo la suya", () => {
  const doc = derivarHechos(crudoCon([op(1, "CANCELADA", { diasMoraMax: 90 }), op(2, "VIGENTE", { saldoCapital: 10, diasMoraMax: 4 })]), contexto);
  assertEquals([hecho(doc, "inst.mora.dias_max").valor, hecho(doc, "inst.mora.dias_max_entre_todas").valor], [4, 90]);
  assertEquals(indices(doc, "inst.mora.dias_max_entre_todas"), [0]);
});

Deno.test("cada operación es una entidad de la institución, sin saldo interpretado", () => {
  const doc = derivarHechos(crudoCon([op(1, "CANCELADA"), op(2, "VIGENTE", { saldoCapital: 700, diasMoraVigentes: 3 })]), contexto);
  const entidades = doc.entidades.filter((e) => (e.atributos as OperacionDeCredito).sistema === "institucion");
  assertEquals(entidades.length, 2);
  const [cancelada, vigente] = entidades.map((e) => e.atributos as OperacionDeCredito);
  assertEquals([cancelada.estado, vigente.estado, vigente.diasDeMora], ["cancelada", "vigente", 3]);
  assertEquals([vigente.saldoPorVencer, vigente.saldoVencido], [null, null]);
  assertEquals(hecho(doc, "inst.operacion.saldo").entidades, [entidades[1].clave]);
});

Deno.test("una fuente que no contestó no es «no es cliente»", () => {
  const doc = derivarHechos({ basesInternas: { status: "error", data: null } }, contexto);
  const h = hecho(doc, "inst.es_cliente");
  assertEquals([h.valor, h.calidad, h.motivo], [null, "no_disponible", "fuente_sin_respuesta"]);
  // El perfil escribe lo de hoy: false y nulos.
  const perfil = perfilDesdeHechos(doc, "comportamientoInterno");
  assertEquals([perfil.esClienteInterno, perfil.proveedorInfo1SaldoCapitalVigente, perfil.proveedorInfo1EstadoOperacion], [false, null, null]);
});

Deno.test("sin operaciones: «no es cliente» es un valor con la respuesta como registro; el resto no aplica", () => {
  const doc = derivarHechos(crudoCon([]), contexto);
  const h = hecho(doc, "inst.es_cliente");
  assertEquals([h.valor, h.calidad], [false, "confirmado_por_tercero"]);
  assertEquals(h.registros.every((r) => r.indice === undefined && r.lista === "personasIncumplimientos"), true);
  assertEquals(hecho(doc, "inst.operacion.saldo").motivo, "no_aplica");
  assertEquals(hecho(doc, "inst.operaciones.cantidad").valor, 0);
});

Deno.test("un campo que la operación elegida no trae queda sin valor, citando la fila", () => {
  const doc = derivarHechos(crudoCon([op(1, "VIGENTE", { saldoCapital: 10, perfilInterno: null, resultadoHabitoPago: null, diasMoraMax: null, diasMoraVigentes: null })]), contexto);
  for (const c of ["inst.perfil_interno", "inst.habito_de_pago", "inst.mora.dias_max", "inst.mora.dias_vigente"]) {
    const h = hecho(doc, c);
    assertEquals([h.valor, h.motivo, h.registros.length], [null, "la_fuente_no_lo_informa", 1], c);
  }
  assertEquals(hecho(doc, "inst.mora.dias_max_entre_todas").motivo, "la_fuente_no_lo_informa");
});

Deno.test("el corte del dato es el `fechaCorte` de la operación citada", () => {
  const doc = derivarHechos(crudoCon([op(1, "VIGENTE", { saldoCapital: 10, fechaCorte: "2026-08-31" }), op(2, "VIGENTE", { saldoCapital: 5, fechaCorte: "2026-09-30" })]), contexto);
  assertEquals(hecho(doc, "inst.operacion.saldo").fechaDelDato, "2026-08-31");
  // Lo contado sobre las dos no es más reciente que la más antigua.
  assertEquals(hecho(doc, "inst.operaciones.cantidad").fechaDelDato, "2026-08-31");
});
