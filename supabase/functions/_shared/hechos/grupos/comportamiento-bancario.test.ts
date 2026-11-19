// La prueba del grupo 1 (docs/capa-de-hechos.md, 5.2, puntos 1 y 5): cada campo
// de los dos grupos del perfil tiene su código, y las reglas que el crudo real
// no ejercita (el reloj, una fuente caída, D4) se prueban con crudos inventados.
// La paridad sobre los crudos inventados de scripts/crudos-sinteticos/ la corre
// probar-crudos-sinteticos.mjs; la del crudo real, comparar-hechos.mjs.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import type { Contexto, OperacionDeCredito } from "../tipos.ts";
import { CAMPOS_PENDIENTES, CATALOGO as BANCARIO } from "./comportamiento-bancario.ts";
import { CATALOGO as COOPERATIVAS } from "./cooperativas.ts";

const contexto = (fechaDeLaConsulta: string): Contexto => ({
  cedula: "0000000000",
  consulta: "perfil-de-prueba",
  fechaDeLaConsulta,
  corteIess: fechaDeLaConsulta.slice(0, 7),
  persona: { nombre: null, fechaDeNacimiento: null },
});

// Los campos del grupo en types.ts, leídos del archivo: un campo nuevo en el
// perfil sin su código en el catálogo corta acá, sin datos.
function camposDeTypes(grupo: string): string[] {
  const texto = Deno.readTextFileSync(new URL("../../types.ts", import.meta.url));
  const desde = texto.indexOf(`  ${grupo}: {`);
  const hasta = texto.indexOf("\n  };", desde);
  return [...texto.slice(desde, hasta).matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]);
}

Deno.test("cero campos sin procedencia: todo campo de los dos grupos tiene su código", () => {
  for (const [grupo, catalogo] of [["comportamientoBancario", BANCARIO], ["comportamientoCooperativas", COOPERATIVAS]] as const) {
    const campos = camposDeTypes(grupo);
    assertEquals(campos.length > 5, true, `no se leyeron los campos de ${grupo}`);
    const conCodigo = new Set(catalogo.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil] : [])));
    const pendientes = new Set(CAMPOS_PENDIENTES.map((p) => p.campo));
    assertEquals(campos.filter((c) => !conCodigo.has(`${grupo}.${c}`) && !pendientes.has(`${grupo}.${c}`)), [], grupo);
  }
});

const vacio = (fuente: string, lista: string) => ({ [fuente]: { status: "ok", data: { [lista]: [] } } });
const conBiessTerminadoEn = (fin: string) => ({
  basesInternas: {
    status: "ok",
    data: {
      tcredQuirografarios: [
        { numeroOperacion: "0000500", fechaConsesion: "10/03/2021", fechaFinCredito: fin, montoTransferido: 3000, saldoTotalCredito: 900, diasMoraAfi: 0, estadoOperacion: "VIGENTE" },
      ],
      tcredHipotecarios: [],
    },
  },
  ...vacio("creditoQuirografario", "prestamos"),
  ...vacio("creditoHipotecario", "prestamos"),
});
const valor = (doc: ReturnType<typeof derivarHechos>, codigo: string) => doc.hechos.find((h) => h.codigo === codigo)?.valor;

Deno.test("el reloj es la fecha de la consulta: un préstamo terminado lo es según cuándo se preguntó", () => {
  const crudo = conBiessTerminadoEn("15/09/2026");
  // Antes del fin, se debe; después, está terminado y se descarta.
  assertEquals(valor(derivarHechos(crudo, contexto("2026-09-01T12:00:00-05:00")), "biess.tiene"), true);
  const despues = derivarHechos(crudo, contexto("2026-10-01T12:00:00-05:00"));
  assertEquals(valor(despues, "biess.tiene"), false);
  assertEquals(despues.hechos.find((h) => h.codigo === "biess.tiene")?.descartados?.[0].motivo, "terminado_en_la_base_interna");
});

Deno.test("el mismo crudo da el mismo documento", () => {
  const crudo = conBiessTerminadoEn("15/09/2030");
  const a = JSON.stringify(derivarHechos(crudo, contexto("2026-10-01T12:00:00-05:00")));
  assertEquals(JSON.stringify(derivarHechos(structuredClone(crudo), contexto("2026-10-01T12:00:00-05:00"))), a);
});

const fila = (calificacion: string, extra: Record<string, string> = {}) => ({
  fecha: "2026/08/31", entnombre: "BANCO FICTICIO", riesgo: "T", calificacion, saldoVigente: "0", noDevengaInteres: "0",
  judicial: "0", castigo: "0", mora: "0", saldomora: "0", ...extra,
});

Deno.test("D4: una operación de bancos en atraso no tiene días; la calificación no se traduce", () => {
  const crudo = {
    buroCreditoSuper: { status: "ok", data: { datosSuper: [fila("D", { mora: "120.00" })] } },
    ...vacio("buroCreditoDiners", "datosSuper"),
  };
  const doc = derivarHechos(crudo, contexto("2026-10-01T12:00:00-05:00"));
  const op = doc.entidades.find((e) => (e.atributos as OperacionDeCredito).sistema === "bancos")!.atributos as OperacionDeCredito;
  assertEquals([op.calificacion, op.diasDeMora, op.saldoVencido], ["D", null, 120]);
  assertEquals(doc.hechos.some((h) => h.codigo.startsWith("ban.") && h.unidad === "dias"), false);
  // El corte de bancos es el `fecha` de la fila.
  assertEquals(doc.hechos.find((h) => h.codigo === "ban.saldo.vencido")?.fechaDelDato, "2026-08-31");
});

Deno.test("una fuente que no contestó: el hecho no tiene valor y el perfil escribe lo de hoy", () => {
  const crudo = {
    buroCreditoSuper: { status: "ok", data: { datosSuper: [fila("A1", { saldoVigente: "900.00" })] } },
    buroCreditoDiners: { status: "error", data: null },
    buroCreditoCoop: { status: "faltante" },
  };
  const doc = derivarHechos(crudo, contexto("2026-10-01T12:00:00-05:00"));
  const h = doc.hechos.find((x) => x.codigo === "ban.saldo.por_vencer")!;
  assertEquals([h.valor, h.calidad, h.motivo], [null, "no_disponible", "fuente_sin_respuesta"]);
  assertEquals(perfilDesdeHechos(doc, "comportamientoCooperativas").numeroOperaciones, 0);
  assertEquals(perfilDesdeHechos(doc, "comportamientoBancario").tieneCreditoIessBiess, false);
});

Deno.test("«la fuente dice que no hay» es un valor con la respuesta como registro", () => {
  const crudo = { ...vacio("buroCreditoCoop", "datosSuper"), ...vacio("retails", "retails"), ...vacio("deudores", "deudores") };
  const doc = derivarHechos(crudo, contexto("2026-10-01T12:00:00-05:00"));
  for (const [codigo, esperado] of [["coop.saldo.total", 0], ["ret.deudas.cantidad", 0], ["ban.registro_deudores.figura", false]] as const) {
    const h = doc.hechos.find((x) => x.codigo === codigo)!;
    assertEquals([h.valor, h.calidad], [esperado, "confirmado_por_tercero"], codigo);
    assertEquals(h.registros.every((r) => r.indice === undefined && r.lista !== undefined), true, codigo);
  }
  // Sin filas no hay máximo: no aplica, y el perfil sigue en null.
  assertEquals(doc.hechos.find((x) => x.codigo === "coop.mora.dias_max")?.motivo, "no_aplica");
  assertEquals(perfilDesdeHechos(doc, "comportamientoCooperativas").diasMoraMaxima, null);
});
