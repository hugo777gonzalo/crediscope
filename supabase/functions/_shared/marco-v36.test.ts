// marco-v36, la versión mínima (negocio, 2026-11-11): lo justo para
// estructura-v21 y la redacción aprobada el 2026-11-08. Estas pruebas fijan
// las dos promesas que más fácil se pierden al editar el texto:
// - el Comportamiento Interno es una referencia cualitativa, no pesa como el
//   buró, en el texto sin buró y en el que arma la sección de Equifax;
// - lo que quedó para la versión mayor (el predictor, los tramos de carga, la
//   antigüedad del buró) no está en el texto.
// Y que cada demanda de cobro llega con sus años, porque el modelo no sabe en
// qué año está.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { MARCO_INTERPRETATIVO, MARCO_VERSION, MARCO_VERSION_CON_BURO, marcoConElBuro } from "./marco-interpretativo.ts";
import { armarPerfilDelModelo } from "./perfil-del-modelo.ts";
import { armarPedidoScoring, CONFIG_LLM } from "./llm-scoring.ts";

const TEXTOS = [
  ["sin buró", MARCO_INTERPRETATIVO],
  ["con buró", marcoConElBuro(true)],
] as const;

Deno.test("v36 es la versión con y sin buró", () => {
  assertEquals(MARCO_VERSION, "marco-v36");
  assertEquals(MARCO_VERSION_CON_BURO, "marco-v36");
});

Deno.test("el Comportamiento Interno no pesa como el buró", () => {
  for (const [nombre, texto] of TEXTOS) {
    const grupo = texto.slice(texto.indexOf("15. comportamientoInterno:"), texto.indexOf("QUÉ INFORMACIÓN SE PUDO OBTENER"));
    assert(grupo.length > 0, nombre);
    // Lo que decía hasta v35, y lo que el corte del buró ponía en su lugar.
    assert(!/pesa como/.test(grupo), `${nombre}: el grupo 15 todavía dice cuánto pesa`);
    assertMatch(grupo, /referencia cualitativa/);
    assertMatch(grupo, /Resaltalo/);
    assertMatch(grupo, /contrasta/);
    assertMatch(grupo, /no se suma a lo que debe ni\s+a la carga de cuotas/);
    // El indicador de historial se juzga con el buró, no con la institución.
    const historial = texto.slice(texto.indexOf("- indicadorHistorial:"), texto.indexOf("QUÉ VA EN CADA CAMPO"));
    assertMatch(historial, /Comportamiento Interno no lo mueve/);
    assert(!/comportamientoInterno/.test(historial), `${nombre}: el indicador de historial todavía lo cuenta`);
  }
});

Deno.test("lo de la versión mayor no está en v36", () => {
  for (const [nombre, texto] of TEXTOS) {
    for (const ausente of ["tramoDeCarga", "TRAMO DE CARGA", "ingresoEstimado", "Referencia de solicitantes", "diasDesdeElReporte"]) {
      assert(!texto.includes(ausente), `${nombre}: ${ausente}`);
    }
    assertMatch(texto, /campos: score,\s+recomendacion, accionesSugeridas/);
  }
});

Deno.test("la redacción aprobada el 2026-11-08 está (p9 y p1)", () => {
  assertMatch(MARCO_INTERPRETATIVO, /llamala "la persona", nunca "el cliente"/);
  assertMatch(MARCO_INTERPRETATIVO, /La primera frase dice la recomendación/);
  assertMatch(MARCO_INTERPRETATIVO, /Nunca escribas "debe N veces su ingreso mensual"/);
  assertMatch(MARCO_INTERPRETATIVO, /Posible homónimo en una demanda penal/);
});

// ---- las demandas de cobro con sus años (p5) ----

const conDemandas = () => ({
  riesgoJudicialCrediticio: {
    numeroDemandasComoDemandado: 3,
    tiposDemandasComoDemandado: [],
    demandasDeCobro: [
      { anio: 2024, quienDemanda: "institucion_financiera" },
      { anio: 2009, quienDemanda: "persona" },
      { anio: null, quienDemanda: "empresa" },
    ],
  },
});

const demandasDe = (pm: Record<string, unknown>) =>
  (pm.riesgoJudicialCrediticio as { demandasDeCobro: Array<Record<string, unknown>> }).demandasDeCobro;

Deno.test("cada demanda de cobro llega con sus años al día del análisis", () => {
  const demandas = demandasDe(armarPerfilDelModelo(conDemandas(), new Set(), null, new Date("2026-11-10T15:00:00Z")));
  assertEquals(demandas.map((d) => d.aniosAtras), [2, 17, null]);
  assertEquals(Object.keys(demandas[0]), ["anio", "aniosAtras", "quienDemanda"]);
});

Deno.test("el año del análisis es el de Ecuador", () => {
  // 03:00 UTC del 1 de enero son las 22:00 del 31 de diciembre en Ecuador.
  assertEquals(demandasDe(armarPerfilDelModelo(conDemandas(), new Set(), null, new Date("2027-01-01T03:00:00Z")))[0].aniosAtras, 2);
});

Deno.test("sin la fecha del análisis no se agregan los años", () => {
  assertEquals("aniosAtras" in demandasDe(armarPerfilDelModelo(conDemandas()))[0], false);
});

Deno.test("el pedido lleva los años con la fecha que recibe", () => {
  const sinBloqueo = { bloqueado: false, hallazgos: [] };
  const pedido = armarPedidoScoring(conDemandas(), sinBloqueo, new Set(), CONFIG_LLM, null, new Date("2026-06-01T15:00:00Z"));
  const mensaje = JSON.parse((pedido.messages as Array<{ content: string }>)[0].content);
  assertEquals(mensaje.perfilDelModelo.riesgoJudicialCrediticio.demandasDeCobro[1].aniosAtras, 17);
});
