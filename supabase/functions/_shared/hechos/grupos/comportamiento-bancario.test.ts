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
  // camposSinDato es la marca del «sin dato» (estructura-v25), no un campo.
  return [...texto.slice(desde, hasta).matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]).filter((c) => c !== "camposSinDato");
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

// estructura-v25: con Diners caída, los 900 de Super no son el total. Hasta la
// v24 el perfil los escribía como si lo fueran, y 0 en cooperativas.
Deno.test("una fuente que no contestó: el hecho no tiene valor, el campo queda sin dato y el parcial es lo de antes", () => {
  const crudo = {
    buroCreditoSuper: { status: "ok", data: { datosSuper: [fila("A1", { saldoVigente: "900.00" })] } },
    buroCreditoDiners: { status: "error", data: null },
    buroCreditoCoop: { status: "faltante" },
  };
  const doc = derivarHechos(crudo, contexto("2026-10-01T12:00:00-05:00"));
  const h = doc.hechos.find((x) => x.codigo === "ban.saldo.por_vencer")!;
  assertEquals([h.valor, h.calidad, h.motivo, h.parcial, h.registros], [null, "no_disponible", "fuente_sin_respuesta", 900, []]);
  const coop = perfilDesdeHechos(doc, "comportamientoCooperativas");
  assertEquals([coop.numeroOperaciones, coop.diasMoraMaxima], [null, null]);
  assertEquals((coop.camposSinDato as Record<string, unknown>).numeroOperaciones, 0);
  const banco = perfilDesdeHechos(doc, "comportamientoBancario");
  assertEquals([banco.saldoTotalVigente, banco.peorCalificacionRiesgo, banco.tieneCreditoIessBiess], [null, null, null]);
  const antes = banco.camposSinDato as Record<string, unknown>;
  assertEquals([antes.saldoTotalVigente, antes.peorCalificacionRiesgo, antes.numeroOperacionesBuroCredito, antes.tieneCreditoIessBiess], [900, "A1", 1, false]);
});

Deno.test("sin fuentes caídas el grupo no lleva camposSinDato", () => {
  const crudo = {
    ...vacio("buroCreditoSuper", "datosSuper"), ...vacio("buroCreditoDiners", "datosSuper"), ...vacio("deudores", "deudores"),
    ...vacio("retails", "retails"), ...vacio("buroCreditoCoop", "datosSuper"), ...vacio("creditoQuirografario", "prestamos"),
    ...vacio("creditoHipotecario", "prestamos"), basesInternas: { status: "ok", data: {} },
  };
  const doc = derivarHechos(crudo, contexto("2026-10-01T12:00:00-05:00"));
  for (const g of ["comportamientoBancario", "comportamientoCooperativas"]) assertEquals("camposSinDato" in perfilDesdeHechos(doc, g), false, g);
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

// estructura-v26 (D6 del negocio): la operación que viene en Super y en Diners
// se cuenta una vez. Medido el 2026-11-20, hoy no le pasa a nadie: esto prueba
// que, si la fuente empieza a mandarla repetida, la deuda no se duplica en el
// perfil ni en la capacidad de pago.
Deno.test("ban.union@1: la misma operación en Super y en Diners cuenta una vez, en el perfil y en la capacidad", async () => {
  const { datosDeCapacidad } = await import("../../capacidad-de-pago.ts");
  const tarjeta = (saldoVigente: string, extra: Record<string, string> = {}) => fila("A1", { codEntidad: "2001", entnombre: "TARJETA FICTICIA", saldoVigente, ...extra });
  const crudoCon = (diners: Record<string, string>[]) => ({
    buroCreditoSuper: { status: "ok", data: { datosSuper: [tarjeta("1200.00")] } },
    buroCreditoDiners: { status: "ok", data: { datosSuper: diners } },
  });
  const unida = derivarHechos(crudoCon([tarjeta("1200.40")]), contexto("2026-10-01T12:00:00-05:00"));
  const banco = perfilDesdeHechos(unida, "comportamientoBancario");
  assertEquals([banco.numeroOperacionesBuroCredito, banco.saldoTotalVigente], [1, 1200]);
  const entidad = unida.entidades.find((e) => e.union?.regla === "ban.union@1")!;
  assertEquals([entidad.vistas.map((v) => v.registro.fuente), entidad.union?.criterio], [["buroCreditoSuper", "buroCreditoDiners"], "monto_y_fecha"]);
  const dif = unida.diferencias.find((d) => d.codigo === "dif.ban.posible_repetida")!;
  assertEquals([dif.manda.valor, dif.cede[0].valor, dif.magnitud.absoluta], [1200, 1200.4, 0.4]);
  const saldoBancos = (perfil: Record<string, unknown>) =>
    datosDeCapacidad({ comportamientoBancario: perfil }, null).deudasSinCuota.find((d) => d.concepto === "Bancos")?.saldo;
  assertEquals(saldoBancos(banco), 1200);

  // Otro corte, otra calificación o la deuda a más de un dólar: otra operación.
  for (const diners of [tarjeta("1200.00", { fecha: "2026/07/31" }), tarjeta("1200.00", { calificacion: "A2" }), tarjeta("1201.50")]) {
    const doc = derivarHechos(crudoCon([diners]), contexto("2026-10-01T12:00:00-05:00"));
    assertEquals(perfilDesdeHechos(doc, "comportamientoBancario").numeroOperacionesBuroCredito, 2, JSON.stringify(diners));
    assertEquals(doc.entidades.some((e) => e.union !== null && e.union.regla === "ban.union@1"), false);
  }
  // Una deuda en cero no prueba que sea la misma: no se une.
  const enCero = derivarHechos(
    { buroCreditoSuper: { status: "ok", data: { datosSuper: [tarjeta("0")] } }, buroCreditoDiners: { status: "ok", data: { datosSuper: [tarjeta("0")] } } },
    contexto("2026-10-01T12:00:00-05:00"),
  );
  assertEquals(perfilDesdeHechos(enCero, "comportamientoBancario").numeroOperacionesBuroCredito, 2);
});
