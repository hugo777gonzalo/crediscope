// El buró de la institución en el perfil del modelo (marco-v31, apagado):
// un tema, una fuente. Dos promesas, y si cualquiera falla el modelo lee
// otra cosa que la decidida:
// - una persona SIN buró da el perfil de marco-v30 byte a byte, y con el
//   interruptor apagado el pedido es el de v30 aunque llegue un buró;
// - con buró, la deuda de bancos y cooperativas sale de Equifax y la de
//   Novadata no llega, ni en null.
// Datos inventados (perfil-de-prueba.ts y equifax-respuesta-de-prueba.ts): el
// repositorio es público.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  armarPerfilDelModelo,
  type BuroDeLaInstitucion,
  CAMPOS_DEL_BURO_DE_NOVADATA,
  mensajeParaElModelo,
  QUEDAN_DE_NOVADATA_CON_BURO,
} from "./perfil-del-modelo.ts";
import { perfilDePrueba } from "./perfil-de-prueba.ts";
import { derivarTablas } from "./equifax-tablas.ts";
import { calcularEstructura } from "./equifax-estructura.ts";
import { CEDULA_DE_PRUEBA, PERSONALES_DE_PRUEBA, respuestaDePrueba } from "./equifax-respuesta-de-prueba.ts";
import { armarPedidoScoring, CONFIG_LLM, huellaDelPedido, versionDelMarco } from "./llm-scoring.ts";
import { MARCO_INTERPRETATIVO, marcoConElBuro } from "./marco-interpretativo.ts";
import { buildStandardProfile } from "./process.ts";

// 21:54 de Ecuador del 12 de octubre (02:54 UTC del 13).
const buro = (): BuroDeLaInstitucion => ({
  proveedor: "equifax",
  estructura: calcularEstructura(derivarTablas(respuestaDePrueba()), {
    consultadoEl: "2026-10-13T02:54:14.996Z",
    ambiente: "produccion",
    identidadVerificada: true,
  }) as unknown as Record<string, unknown>,
});
// deno-lint-ignore no-explicit-any
const conBuro = (p = perfilDePrueba()) => armarPerfilDelModelo(p, new Set(), buro()) as any;
const sinBloqueo = { bloqueado: false, hallazgos: [] };
const ENCENDIDO = { ...CONFIG_LLM, buroDeLaInstitucion: true };
const sistema = (pedido: Record<string, unknown>) => (pedido.system as Array<{ text: string }>)[0].text;

// ---- sin buró: lo de hoy, byte a byte ----

Deno.test("sin buró, el perfil del modelo es el de marco-v30, byte a byte", async () => {
  const esperado = await Deno.readTextFile(new URL("./perfil-del-modelo-sin-buro.esperado.json", import.meta.url));
  const comoSeGuardo = (pm: unknown) => JSON.stringify(pm, null, 2) + "\n";
  assertEquals(comoSeGuardo(armarPerfilDelModelo(perfilDePrueba())), esperado.replace(/\r\n/g, "\n"));
  assertEquals(comoSeGuardo(armarPerfilDelModelo(perfilDePrueba(), new Set(), null)), esperado.replace(/\r\n/g, "\n"));
  assertEquals(comoSeGuardo(mensajeParaElModelo(perfilDePrueba(), [], new Set(), null).perfilDelModelo), esperado.replace(/\r\n/g, "\n"));
});

Deno.test("con el interruptor apagado, el pedido es el de v30 aunque llegue un buró", async () => {
  assertEquals(CONFIG_LLM.buroDeLaInstitucion, false);
  assertEquals(versionDelMarco(CONFIG_LLM), "marco-v30");
  const hoy = armarPedidoScoring(perfilDePrueba(), sinBloqueo, new Set());
  const conUnBuro = armarPedidoScoring(perfilDePrueba(), sinBloqueo, new Set(), CONFIG_LLM, buro());
  assertEquals(conUnBuro, hoy);
  assertEquals(await huellaDelPedido(conUnBuro), await huellaDelPedido(hoy));
  assertEquals(sistema(hoy), MARCO_INTERPRETATIVO);
});

// ---- con buró: Equifax en lugar de bancos y cooperativas ----

Deno.test("con buró no llegan el buró de bancos ni las cooperativas de Novadata, ni en null", () => {
  const pm = conBuro();
  assertEquals("comportamientoCooperativas" in pm, false);
  assertEquals(Object.keys(pm.comportamientoBancario), [
    "figuraEnRegistroDeudores", "numeroDeudasRetail", "diasMoraMaximaRetail", "totalDeudaRetail", "valorVencidoRetail",
    "tieneCreditoIessBiess", "diasMoraCreditoIessBiess", "numeroPrestamosIessBiess",
  ]);
  const texto = JSON.stringify(pm);
  // endeudamiento.deudaComoGaranteOCodeudor sigue llamándose así, con la
  // cifra de Equifax (ver la prueba de endeudamiento).
  for (const campo of CAMPOS_DEL_BURO_DE_NOVADATA.filter((c) => c !== "deudaComoGaranteOCodeudor")) {
    assertEquals(texto.includes(`"${campo}"`), false, campo);
  }
  // La calificación A1 a E no llega por ningún lado: la reemplazan los días.
  assertEquals(/"(A1|A2|B1)"/.test(texto), false);
});

Deno.test("buroEquifax va donde estaba el buró de bancos, y el resto en su orden", () => {
  const claves = Object.keys(conBuro());
  const hoy = Object.keys(armarPerfilDelModelo(perfilDePrueba())).filter((k) => k !== "comportamientoCooperativas");
  assertEquals(claves.filter((k) => k !== "buroEquifax"), hoy);
  assertEquals(claves.indexOf("buroEquifax"), claves.indexOf("comportamientoBancario") - 1);
  assertEquals(claves[0], "disponibilidad");
});

Deno.test("todo campo de comportamientoBancario está decidido: queda o se va con el buró", () => {
  const campos = Object.keys(buildStandardProfile({} as never, "0000000000", "2026-08").profile.comportamientoBancario)
    .map((c) => (c === "numeroCreditosFormales" ? "numeroPrestamosIessBiess" : c));
  const decididos = new Set<string>([...QUEDAN_DE_NOVADATA_CON_BURO, ...CAMPOS_DEL_BURO_DE_NOVADATA]);
  for (const c of campos) assert(decididos.has(c), `${c}: sumarlo a QUEDAN_DE_NOVADATA_CON_BURO o a CAMPOS_DEL_BURO_DE_NOVADATA`);
});

Deno.test("bancos, Diners y cooperativas cuentan como consultados con buró aunque Novadata no contestara", () => {
  const p = perfilDePrueba();
  const meta = p.metaConsulta as Record<string, string[]>;
  meta.fuentesConDatos = meta.fuentesConDatos.filter((f) => !["buroCreditoSuper", "buroCreditoDiners", "buroCreditoCoop"].includes(f));
  meta.fuentesNoMedidas = [...meta.fuentesNoMedidas, "buroCreditoSuper", "buroCreditoDiners", "buroCreditoCoop"];
  // deno-lint-ignore no-explicit-any
  const sin = armarPerfilDelModelo(p).disponibilidad as any;
  const con = conBuro(p).disponibilidad;
  const temas = ["buró de crédito de bancos", "tarjetas Diners", "cooperativas"];
  for (const t of temas) {
    assert(sin.temasNoConsultados.includes(t), t);
    assert(con.temasConsultados.includes(t), t);
    assertEquals(con.temasNoConsultados.includes(t), false, t);
  }
  // Lo demás no cambia, y sigue en el orden de siempre.
  assertEquals(con.temasNoConsultados, ["inversiones"]);
  assertEquals([...con.temasConsultados].sort(), [...sin.temasConsultados, ...temas].sort());
});

Deno.test("endeudamiento suma el buró y las casas comerciales de Novadata, y lo ajeno va aparte", () => {
  // Equifax (equifax-respuesta-de-prueba.ts): bancos 4.000 como titular con 300
  // vencidos y cuota 200; cooperativas 0; comercial 200 con cuota 20; como
  // codeudor 500 en bancos y como garante 100 en el comercial. Novadata
  // (perfil-de-prueba.ts): casas comerciales 640,5 con 80,2 vencidos.
  assertEquals(conBuro().endeudamiento, {
    deudaPropiaTotal: 4841,
    deudaPropiaBancos: 4000,
    deudaPropiaCooperativas: 0,
    deudaPropiaSectorComercial: 200,
    deudaPropiaRetail: 641,
    deudaEnAtrasoTotal: 380,
    deudaComoGaranteOCodeudor: 600,
    cuotaMensualConocida: 220,
    cuotaMensualConocidaIncluye: "bancos, cooperativas y sector comercial según Equifax; las casas comerciales no informan la cuota",
  });
});

Deno.test("un sistema que Equifax no trajo deja la deuda total en null, no en un número menor", () => {
  const b = buro();
  (b.estructura.deudaActualTitular as Record<string, unknown>).cooperativas = null;
  const e = armarPerfilDelModelo(perfilDePrueba(), new Set(), b).endeudamiento as Record<string, unknown>;
  assertEquals([e.deudaPropiaCooperativas, e.deudaPropiaTotal, e.deudaEnAtrasoTotal], [null, null, null]);
  assertEquals(e.deudaPropiaBancos, 4000);
});

Deno.test("el bloque del buró trae lo decidido y nada de lo que se queda afuera", () => {
  const be = conBuro().buroEquifax;
  assertEquals(Object.keys(be), [
    "fechaDelReporte", "scores", "estadoGeneral", "deudaActualTitular", "deudaCodeudorGarante", "moraActual",
    "conductaDePago", "evolucionTodosLosRoles", "tarjetas", "creditosOtorgados", "consultasRecibidas",
  ]);
  // La fecha de Ecuador, no la de UTC.
  assertEquals(be.fechaDelReporte, "2026-10-12");
  assertEquals(be.deudaActualTitular.bancos.saldoDeudaUsd, 4000);
  assertEquals(be.deudaActualTitular.comercial.conciliaConElResumen, "no");
  assertEquals(be.deudaCodeudorGarante.total.saldoDeudaUsd, 600);
  // Sólo el tramo con saldo: 300 vencidos a 45 días.
  assertEquals(be.moraActual.vencidoPorTramo, { vencidoDe1a2MesesUsd: 300 });
  assertEquals(Object.keys(be.estadoGeneral), ["estadoDeCartera", "antiguedadCrediticiaMeses", "tieneInhabilitacionBancaria", "ultimaInhabilitacion"]);
  if (be.estadoGeneral.estadoDeCartera) assertEquals(be.estadoGeneral.estadoDeCartera.calculadoPor, "Equifax");
  const texto = JSON.stringify(be);
  for (const afuera of [
    "tasaDeMalosAcumuladaPorcentaje", "probabilidadDeSobreendeudamientoPorcentaje", "bandaDelScoreEquifax", "estimacionesDeEquifax",
    "ingresoEstimadoUsd", "actividadEconomica", "impagosSegunEquifaxTodosLosRoles", "numeroDeMorosidades", "numeroDeProtestos",
    "listaAparteDeEquifax", "resumenDeEquifaxUsd", "saldoTodosLosRolesUsd", "calidad", "listasQueNoVinieron", "consultasPorMes",
    "montoOriginal", "ambiente", "identidadVerificada",
  ]) {
    assertEquals(texto.includes(afuera), false, afuera);
  }
});

Deno.test("con buró no llega ningún dato personal, y todo número llega entero", () => {
  const texto = JSON.stringify(mensajeParaElModelo(perfilDePrueba(), [], new Set(), buro()));
  for (const valor of [...PERSONALES_DE_PRUEBA, CEDULA_DE_PRUEBA]) assertEquals(texto.includes(valor), false, valor);
  assertEquals(/\d{10}/.test(texto), false);
  assertEquals(/\d\.\d/.test(texto.replace(/"[^"]*"/g, "")), false);
});

// ---- el marco de v31 ----

Deno.test("con buró, el marco lleva la sección del buró en lugar de los grupos 3 y 4", () => {
  const texto = marcoConElBuro(true);
  assert(texto.includes("3. buroEquifax: el buró de crédito de la institución"));
  assert(texto.includes("4. comportamientoBancario, cuando llega buroEquifax"));
  assertEquals(texto.includes("3. comportamientoBancario: la fuente más directa"), false);
  assertEquals(texto.includes("4. comportamientoCooperativas"), false);
  assertEquals(texto.includes("peorCalificacionRiesgo"), false);
  assertEquals(texto.includes("Garantías:"), false);
  assert(texto.includes("Deuda como codeudor o garante"));
  // Los grupos siguen siendo 15 y en orden: el marco cita por número.
  const posiciones = Array.from({ length: 15 }, (_, i) => texto.indexOf(`\n${i + 1}. `));
  assert(posiciones.every((p, i) => p >= 0 && (i === 0 || p > posiciones[i - 1])), JSON.stringify(posiciones));
  // comportamientoCooperativas se nombra sólo para decir que no llega.
  assertEquals(texto.split("comportamientoCooperativas").length - 1, 1);
  assert(texto.includes('"cooperativas" están entre los consultados porque los trajo Equifax'));
  assert(texto.includes("juzgado sólo con buroEquifax"));
});

Deno.test("sin buró, el marco de v31 es el de v30 con el rótulo nuevo y nada más", () => {
  const v31 = marcoConElBuro(false);
  const antes = MARCO_INTERPRETATIVO.indexOf("   - Garantías:");
  const despues = MARCO_INTERPRETATIVO.indexOf("   - numeroPrestamosIessBiess");
  assertEquals(v31.slice(0, antes), MARCO_INTERPRETATIVO.slice(0, antes));
  assertEquals(v31.slice(v31.indexOf("   - numeroPrestamosIessBiess")), MARCO_INTERPRETATIVO.slice(despues));
  assert(v31.slice(antes).startsWith("   - Deuda como codeudor o garante: numeroOperacionesComoGaranteOCodeudor,"));
  assertEquals(v31.includes("Garantías:"), false);
});

Deno.test("encendido: v31, con la sección del buró sólo para quien lo tiene", () => {
  assertEquals(versionDelMarco(ENCENDIDO), "marco-v31");
  const con = armarPedidoScoring(perfilDePrueba(), sinBloqueo, new Set(), ENCENDIDO, buro());
  const sin = armarPedidoScoring(perfilDePrueba(), sinBloqueo, new Set(), ENCENDIDO, null);
  assertEquals(sistema(con), marcoConElBuro(true));
  assertEquals(sistema(sin), marcoConElBuro(false));
  const leido = (pedido: Record<string, unknown>) => JSON.parse((pedido.messages as Array<{ content: string }>)[0].content).perfilDelModelo;
  assert("buroEquifax" in leido(con));
  // Sin buró, encendido o no, el perfil es el mismo: cambia sólo el marco.
  assertEquals(leido(sin), leido(armarPedidoScoring(perfilDePrueba(), sinBloqueo, new Set())));
});

Deno.test("el buró y el marco por cliente todavía no se combinan", () => {
  assertThrows(() => armarPedidoScoring(perfilDePrueba(), sinBloqueo, new Set(), { ...ENCENDIDO, marcoPorCliente: true }, buro()));
});
