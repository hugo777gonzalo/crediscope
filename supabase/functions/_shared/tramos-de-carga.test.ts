import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { normalizarTramoDeCarga, TOPE_DE_CARGA_POR_TRAMO, TRAMOS_DE_CARGA } from "./tramos-de-carga.ts";
import { MARCO_INTERPRETATIVO } from "./marco-interpretativo.ts";
import { interpretar } from "./llm-scoring.ts";
import { armarPerfilDelModelo } from "./perfil-del-modelo.ts";

Deno.test("un tramo de la lista queda con su motivo", () => {
  assertEquals(normalizarTramoDeCarga({ tramo: "2", motivo: " Paga al día, sin demandas. " }), { tramo: "2", motivo: "Paga al día, sin demandas." });
  assertEquals(normalizarTramoDeCarga({ tramo: "FUERA", motivo: "Atraso de 45 días hoy." })?.tramo, "fuera");
});

Deno.test("sin un tramo de la lista no se supone ninguno", () => {
  assertEquals(normalizarTramoDeCarga({ tramo: "4", motivo: "x" }), null);
  assertEquals(normalizarTramoDeCarga({ motivo: "x" }), null);
  assertEquals(normalizarTramoDeCarga("1"), null);
  assertEquals(normalizarTramoDeCarga(null), null);
});

Deno.test("los topes bajan con el tramo y fuera de tramo no hay tope", () => {
  assertEquals(TOPE_DE_CARGA_POR_TRAMO["1"], 0.8);
  assertEquals(TOPE_DE_CARGA_POR_TRAMO["2"], 0.6);
  assertEquals(TOPE_DE_CARGA_POR_TRAMO["3"], 0.4);
  assertEquals(TOPE_DE_CARGA_POR_TRAMO.fuera, null);
});

// El texto que lee el modelo y el tope que aplica el código no pueden decir
// cosas distintas.
Deno.test("el marco nombra cada tramo con el tope del código", () => {
  for (const t of TRAMOS_DE_CARGA) {
    const tope = TOPE_DE_CARGA_POR_TRAMO[t];
    if (tope === null) assertMatch(MARCO_INTERPRETATIVO, new RegExp(`- "${t}", sin aprobación directa`));
    else assertMatch(MARCO_INTERPRETATIVO, new RegExp(`- "${t}", [a-záéíóúñ ]+ \\(hasta ${Math.round(tope * 100)}%\\)`));
  }
  assertMatch(MARCO_INTERPRETATIVO, /Con "fuera" la recomendación no es\s+"aprobar"/);
  assertMatch(MARCO_INTERPRETATIVO, /Una demanda de cobro es reciente si tiene 2 años o menos/);
  assertMatch(MARCO_INTERPRETATIVO, /score,\s+tramoDeCarga, recomendacion/);
});

// Sólo una demanda de cobro de los últimos 2 años saca del tramo (negocio,
// 2026-11-10), y el modelo no sabe en qué año está.
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

Deno.test("interpretar() lee el tramo de la respuesta del modelo", () => {
  const respuesta = {
    score: 640, tramoDeCarga: { tramo: "3", motivo: "Tiene un atraso de 12 días hoy en bancos." }, recomendacion: "revisar",
    accionesSugeridas: ["Verificar el atraso."], indicadorRiesgo: "moderado", indicadorHistorial: "regular",
    positives: [], negatives: [], missingInfo: [], reasoning: "Revisar: un atraso leve hoy.",
  };
  const r = interpretar({ content: [{ type: "text", text: JSON.stringify(respuesta) }], stop_reason: "end_turn" }, "claude-sonnet-5-5");
  assertEquals(r.tramoDeCarga, { tramo: "3", motivo: "Tiene un atraso de 12 días hoy en bancos." });
  const sinTramo = interpretar({ content: [{ type: "text", text: JSON.stringify({ ...respuesta, tramoDeCarga: undefined }) }], stop_reason: "end_turn" }, "claude-sonnet-5-5");
  assertEquals(sinTramo.tramoDeCarga, null);
});
