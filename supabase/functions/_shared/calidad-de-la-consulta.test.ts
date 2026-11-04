import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  completitudDeLaConsulta,
  decisionDeLaConsulta,
  elPerfilSePuedeAnalizar,
  FUENTES,
  obligatoriasQueNoSeVan,
  obligatoriasSinRespuesta,
  porQueEsParcial,
  porQueNoSePuedeAnalizar,
  recomendacionDeLaEntrega,
  requiereRevisionManual,
  secundariasDePesoConError,
  temasSinRespuesta,
} from "./calidad-de-la-consulta.ts";
import { RUTAS_POR_FUENTE } from "./proveedor-info-1-client.ts";

const delNivel = (nivel: string) => Object.keys(FUENTES).filter((f) => FUENTES[f].nivel === nivel);
const OBLIGATORIAS = delNivel("obligatoria");
const completa = (): Record<string, string> => Object.fromEntries(Object.keys(FUENTES).map((f) => [f, "ok"]));

Deno.test("la tabla clasifica todas las fuentes que se consultan, y son 21, 8 y el resto", () => {
  assertEquals(Object.keys(FUENTES).sort(), Object.keys(RUTAS_POR_FUENTE).sort());
  assertEquals([OBLIGATORIAS.length, delNivel("secundaria_de_peso").length, delNivel("secundaria").length], [21, 8, 23]);
});

Deno.test("una obligatoria y una secundaria de peso se pueden nombrar ante el analista", () => {
  for (const f of [...OBLIGATORIAS, ...delNivel("secundaria_de_peso")]) assert(FUENTES[f].tema, f);
});

Deno.test("entre las obligatorias, sólo renta y antecedentes dicen «no hay» con faltante", () => {
  assertEquals(OBLIGATORIAS.filter((f) => FUENTES[f].noHay === "faltante").sort(), ["antecedentesPenales", "sriImpuestoRenta"]);
});

Deno.test("con las obligatorias contestadas se analiza, también si contestaron vacío", () => {
  assert(elPerfilSePuedeAnalizar(completa()));
  const vacias = Object.fromEntries(OBLIGATORIAS.map((f) => [f, "ok_vacio"]));
  assert(elPerfilSePuedeAnalizar({ ...completa(), ...vacias, titulos: "error", vehiculos: "faltante" }));
});

Deno.test("una obligatoria con error frena, sea la que sea", () => {
  for (const fuente of OBLIGATORIAS) assertEquals(obligatoriasSinRespuesta({ ...completa(), [fuente]: "error" }), [fuente]);
});

Deno.test("faltante frena en las obligatorias, salvo renta y antecedentes", () => {
  for (const fuente of OBLIGATORIAS) {
    const esperado = fuente === "sriImpuestoRenta" || fuente === "antecedentesPenales" ? [] : [fuente];
    assertEquals(obligatoriasSinRespuesta({ ...completa(), [fuente]: "faltante" }), esperado);
  }
});

Deno.test("una secundaria no frena con nada", () => {
  for (const fuente of delNivel("secundaria")) {
    assert(elPerfilSePuedeAnalizar({ ...completa(), [fuente]: "error" }), fuente);
    assertEquals(completitudDeLaConsulta({ ...completa(), [fuente]: "error" }), "completa");
  }
});

Deno.test("una obligatoria que no figura en un estado con detalle también frena", () => {
  const { general: _general, ...sinGeneral } = completa();
  assertEquals(obligatoriasSinRespuesta(sinGeneral), ["general"]);
});

Deno.test("una fuente apagada por configuración no frena", () => {
  assert(elPerfilSePuedeAnalizar({ ...completa(), creditoQuirografario: "deshabilitado" }));
});

Deno.test("sin detalle por fuente no hay nada que juzgar", () => {
  assert(elPerfilSePuedeAnalizar(null));
  assert(elPerfilSePuedeAnalizar(undefined));
  assert(elPerfilSePuedeAnalizar({}));
  assertEquals(completitudDeLaConsulta(null), "completa");
});

Deno.test("una secundaria de peso con error no frena: la entrega es parcial y nunca aprobar", () => {
  for (const fuente of delNivel("secundaria_de_peso")) {
    const estado = { ...completa(), [fuente]: "error" };
    assert(elPerfilSePuedeAnalizar(estado), fuente);
    assertEquals(secundariasDePesoConError(estado), [fuente]);
    assertEquals(completitudDeLaConsulta(estado), "parcial");
  }
  assertEquals(recomendacionDeLaEntrega("aprobar", "parcial"), "revisar");
  assertEquals(recomendacionDeLaEntrega("aprobar", "completa"), "aprobar");
  assertEquals(recomendacionDeLaEntrega("negar", "parcial"), "negar");
  assertEquals(recomendacionDeLaEntrega(null, "parcial"), null);
});

Deno.test("una secundaria de peso con faltante contó como respuesta: es el «no hay» de varias", () => {
  assertEquals(completitudDeLaConsulta({ ...completa(), vehiculos: "faltante", inversiones: "faltante" }), "completa");
});

Deno.test("una obligatoria sin respuesta tampoco se entrega como completa", () => {
  assertEquals(completitudDeLaConsulta({ ...completa(), listaNegra: "error" }), "parcial");
});

Deno.test("un bloqueo en una consulta incompleta niega; sin bloqueo frena; completa se analiza", () => {
  const incompleta = { ...completa(), denuncias: "faltante" };
  assertEquals(decisionDeLaConsulta(incompleta, { bloqueado: true }), "negar_por_control");
  assertEquals(decisionDeLaConsulta(incompleta, { bloqueado: false }), "frenar");
  assertEquals(decisionDeLaConsulta(incompleta, null), "frenar");
  // Con la consulta completa el bloqueo fuerza el resultado después del modelo, como siempre.
  assertEquals(decisionDeLaConsulta(completa(), { bloqueado: true }), "analizar");
});

const consulta = (dia: string, cambios: Record<string, string>) => ({ created_at: `2026-${dia}T12:00:00.000Z`, estado_por_fuente: { ...completa(), ...cambios } });

Deno.test("la falla no se va: el mismo faltante un día antes, sin haber contestado en el medio", () => {
  const consultas = [consulta("10-03", { listaNegra: "faltante" }), consulta("10-02", { listaNegra: "error" }), consulta("09-25", { listaNegra: "faltante" })];
  assertEquals(obligatoriasQueNoSeVan(consultas), ["listaNegra"]);
});

Deno.test("la falla se fue: contestó en el medio, o todavía no pasó un día", () => {
  assertEquals(obligatoriasQueNoSeVan([consulta("10-03", { denuncias: "faltante" }), consulta("10-01", {}), consulta("09-25", { denuncias: "faltante" })]), []);
  const unaHoraAntes = { created_at: "2026-10-03T11:00:00.000Z", estado_por_fuente: { ...completa(), denuncias: "faltante" } };
  assertEquals(obligatoriasQueNoSeVan([consulta("10-03", { denuncias: "faltante" }), unaHoraAntes]), []);
});

Deno.test("un error repetido es una caída del proveedor, no una falla de la persona", () => {
  assertEquals(obligatoriasQueNoSeVan([consulta("10-31", { general: "error" }), consulta("10-28", { general: "error" })]), []);
  // La excepción de renta y antecedentes tampoco cuenta: su faltante no frena.
  assertEquals(obligatoriasQueNoSeVan([consulta("10-03", { sriImpuestoRenta: "faltante" }), consulta("09-25", { sriImpuestoRenta: "faltante" })]), []);
});

Deno.test("sin consultas, o con una sola, no se puede afirmar que no se va", () => {
  assertEquals(obligatoriasQueNoSeVan([]), []);
  assertEquals(obligatoriasQueNoSeVan([consulta("10-03", { listaNegra: "faltante" })]), []);
});

function baseConConsultas(data: unknown, error: unknown = null) {
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data, error }) };
  return { from: () => q };
}

Deno.test("la revisión manual se lee de las consultas de la persona", async () => {
  const consultas = [consulta("10-03", { listaNegra: "faltante" }), consulta("09-25", { listaNegra: "faltante" })];
  assertEquals(await requiereRevisionManual(baseConConsultas(consultas), "persona"), true);
  assertEquals(await requiereRevisionManual(baseConConsultas([consulta("10-03", {})]), "persona"), false);
  // Sin poder leer la historia no se afirma: queda el mensaje de reconsultar.
  assertEquals(await requiereRevisionManual(baseConConsultas(null, { message: "falló" }), "persona"), false);
});

Deno.test("el mensaje nombra cada tema una vez, sin los nombres de las fuentes", () => {
  const estado = { ...completa(), general: "error", creditoHipotecario: "error", creditoQuirografario: "faltante" };
  const mensaje = porQueNoSePuedeAnalizar(estado);
  assertStringIncludes(mensaje, "no se pudo obtener la identidad y los préstamos del BIESS.");
  assertEquals(mensaje.match(/BIESS/g)?.length, 1);
  assert(!/creditoHipotecario|general|Proveedor_Info_1/.test(mensaje));
});

Deno.test("en una caída el mensaje nombra seis temas y cuenta los demás", () => {
  const estado = Object.fromEntries(Object.keys(FUENTES).map((f) => [f, "error"]));
  const mensaje = porQueNoSePuedeAnalizar(estado);
  // Los dos préstamos del BIESS son un solo tema: 20 temas, 14 sin nombrar.
  assertEquals(temasSinRespuesta(estado).length, 20);
  assertStringIncludes(mensaje, "y 14 temas más.");
  assert(mensaje.length < 240, mensaje);
});

Deno.test("con la revisión manual el mensaje no pide reconsultar", () => {
  const mensaje = porQueNoSePuedeAnalizar({ ...completa(), listaNegra: "faltante" }, true);
  assertStringIncludes(mensaje, "la lista negra");
  assertStringIncludes(mensaje, "sin score y pasa a revisión manual");
  assert(!/en unos minutos/.test(mensaje));
});

Deno.test("el aviso de una consulta parcial nombra lo que faltó", () => {
  assertStringIncludes(porQueEsParcial({ ...completa(), vehiculos: "error" }), "los vehículos");
  // Un análisis anterior a esta lista puede tener una obligatoria sin respuesta y ninguna de peso.
  assertStringIncludes(porQueEsParcial({ ...completa(), denuncias: "error" }), "las denuncias");
});
