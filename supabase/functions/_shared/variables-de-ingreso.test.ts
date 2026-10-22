// El vector de entrada del predictor de ingresos, con una respuesta de Equifax
// INVENTADA (equifax-respuesta-de-prueba.ts): el repositorio es público. Con las
// 5.001 respuestas reales se compara contra el extracto de AWS en
// scripts/probar-paridad-variables-de-ingreso.mjs, que lee research/ (fuera de git).
//
// deno test --allow-env supabase/functions/

import { assert, assertAlmostEquals, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { derivarTablas } from "./equifax-tablas.ts";
import { respuestaDePrueba } from "./equifax-respuesta-de-prueba.ts";
import {
  CREDITOS_POSTERIORES_QUE_SE_ANULAN,
  MAPEO_PENDIENTE,
  tipoDeCreditoParaIngreso,
  VARIABLES_CATEGORICAS,
  VARIABLES_DEL_NIVEL_1,
  VARIABLES_DEL_NIVEL_2,
  variablesDelIess,
  vectorDeNivel1,
  vectorDeNivel2,
  type MapeoDeCategorias,
  type PerfilParaIngreso,
} from "./variables-de-ingreso.ts";

const AHORA = new Date("2026-09-10T15:00:00Z"); // 10:00 en Ecuador
const CONSULTA = "2026-08-31T15:00:00Z";

const tablas = (cambios: Parameters<typeof respuestaDePrueba>[0] = {}) => derivarTablas(respuestaDePrueba(cambios)).tablas;

// Un mapeo de prueba: NO es el de producción (esa equivalencia no se midió), sólo prueba que la interfaz se usa.
const MAPEO_DE_PRUEBA: MapeoDeCategorias = {
  pendiente: false,
  genero: (v) => (v === "MUJER" ? "F" : v === "HOMBRE" ? "M" : null),
  estadoCivil: (v) => v,
  provincia: (v) => v,
  canton: (v) => v,
};

const perfil = (cambios: Partial<PerfilParaIngreso> = {}): PerfilParaIngreso => ({
  identidad: { edad: 41, genero: "MUJER", estadoCivil: "CASADO" },
  laboral: {
    estadoActividadEconomica: "activa_sin_interrupciones", fechaInicioActividadesRuc: "2020-09-10", fechaCeseActividadesRuc: null, tipoUltimoCeseRuc: null,
  },
  metaConsulta: { fuentesConDatos: ["general", "contribuyente"], fuentesSinDatos: [], fuentesNoMedidas: [] },
  ...cambios,
});

const iess = [
  { mes: "2026-06", empleador: "EMPRESA UNO", valor: 700 },
  { mes: "2026-07", empleador: "EMPRESA UNO", valor: 720 },
  { mes: "2026-07", empleador: "EMPRESA DOS", valor: 300 },
  { mes: "2025-01", empleador: "EMPRESA TRES", valor: 500 },
];

Deno.test("los niveles tienen las variables del entrenamiento, sin repetir y con las categorías incluidas", () => {
  assertEquals(VARIABLES_DEL_NIVEL_1.length, 16);
  assertEquals(VARIABLES_DEL_NIVEL_2.length, 11 + 13 + 22 + 5 + 3);
  assertEquals(new Set(VARIABLES_DEL_NIVEL_2).size, VARIABLES_DEL_NIVEL_2.length);
  for (const c of VARIABLES_CATEGORICAS) assert((VARIABLES_DEL_NIVEL_2 as readonly string[]).includes(c), c);
});

Deno.test("el historial del IESS: el aporte es el total del último mes, los meses y los empleadores son distintos", () => {
  assertEquals(variablesDelIess(iess), { aporte: 1020, meses_aporte: 3, n_empleos: 3 });
  assertEquals(variablesDelIess([]), { aporte: null, meses_aporte: null, n_empleos: null });
  assertEquals(variablesDelIess(null), { aporte: null, meses_aporte: null, n_empleos: null });
  assertEquals(variablesDelIess([{ mes: "202607", empleador: "X", valor: 1 }]).aporte, null, "un mes mal escrito no cuenta");
});

Deno.test("el nivel 1 sin mapeo de categorías: sexo, estado civil, provincia y cantón salen sin dato y se dice pendiente", () => {
  const v = vectorDeNivel1(perfil(), { ahora: AHORA, historialIess: iess });
  assertEquals(Object.keys(v.variables), [...VARIABLES_DEL_NIVEL_1]);
  for (const c of ["genero", "estado_civil", "prov_trab", "cant_trab", "prov_dom", "cant_dom"]) assertEquals(v.variables[c], null, c);
  assert(v.sinDato.includes("genero"));
  assert(v.pendientes.some((p) => p.startsWith("categorias")));
  assert(v.pendientes.some((p) => p.startsWith("ubicaciones")));
  assertEquals(MAPEO_PENDIENTE.pendiente, true);
});

Deno.test("el nivel 1 con un mapeo y ubicaciones: las categorías pasan por el mapeo", () => {
  const v = vectorDeNivel1(perfil(), {
    ahora: AHORA, historialIess: iess, mapeo: MAPEO_DE_PRUEBA,
    ubicaciones: { provinciaDomicilio: "PROV A", cantonDomicilio: "CANTON A", provinciaTrabajo: null, cantonTrabajo: "CANTON B" },
  });
  assertEquals(v.variables.genero, "F");
  assertEquals(v.variables.estado_civil, "CASADO");
  assertEquals(v.variables.prov_dom, "PROV A");
  assertEquals(v.variables.prov_trab, null);
  assertEquals(v.variables.cant_trab, "CANTON B");
  assertEquals(v.variables.edad, 41);
  assertEquals(v.variables.aporte, 1020);
  assertAlmostEquals(v.variables.anio_mes as number, 2026 + 8 / 12, 1e-9);
  assertFalse(v.pendientes.some((p) => p.startsWith("categorias")));
  assertFalse(v.pendientes.some((p) => p.startsWith("ubicaciones")));
});

Deno.test("el año con fracción usa la fecha de Ecuador: a las 20:00 de Ecuador la fecha UTC ya es la de mañana", () => {
  const finDeMes = vectorDeNivel1(perfil(), { ahora: new Date("2026-10-01T02:00:00Z") }); // 21:00 del 30 de septiembre
  assertAlmostEquals(finDeMes.variables.anio_mes as number, 2026 + 8 / 12, 1e-9);
});

Deno.test("el SRI de Novadata: con RUC activo salen el estado, la antigüedad en años y el obligado que se pase", () => {
  const v = vectorDeNivel1(perfil(), { ahora: AHORA, obligadoAContabilidad: false });
  assertEquals(v.variables.sri_ruc, 1);
  assertEquals(v.variables.sri_estado, "ACTIVO");
  assertAlmostEquals(v.variables.sri_antig as number, 2191 / 365.25, 1e-9, "del 2020-09-10 al 2026-09-10: 2.191 días");
  assertEquals(v.variables.sri_susp, null);
  assertEquals(v.variables.sri_obligado, 0);
});

Deno.test("el SRI de Novadata: un RUC inactivo es SUSPENDIDO y, si el cese fue una suspensión definitiva, trae sri_susp", () => {
  const v = vectorDeNivel1(
    perfil({ laboral: { estadoActividadEconomica: "inactiva_nunca_reactivada", fechaInicioActividadesRuc: "2010-01-01", fechaCeseActividadesRuc: "2024-09-10", tipoUltimoCeseRuc: "suspension_definitiva" } }),
    { ahora: AHORA },
  );
  assertEquals(v.variables.sri_estado, "SUSPENDIDO");
  assertAlmostEquals(v.variables.sri_susp as number, 730 / 365.25, 1e-9, "del 2024-09-10 al 2026-09-10");
  assertEquals(v.variables.sri_obligado, null);
  assert(v.pendientes.some((p) => p.startsWith("sri_obligado")));
  const cancelado = vectorDeNivel1(
    perfil({ laboral: { estadoActividadEconomica: "inactiva_nunca_reactivada", fechaInicioActividadesRuc: "2010-01-01", fechaCeseActividadesRuc: "2024-09-10", tipoUltimoCeseRuc: "cancelacion" } }),
    { ahora: AHORA },
  );
  assertEquals(cancelado.variables.sri_susp, null, "una cancelación no es una suspensión definitiva");
});

Deno.test("sin RUC es un dato: sri_ruc vale 0 y el resto del SRI queda sin dato", () => {
  const v = vectorDeNivel1(
    perfil({ laboral: { estadoActividadEconomica: "sin_ruc" }, metaConsulta: { fuentesConDatos: ["general"], fuentesSinDatos: ["contribuyente"], fuentesNoMedidas: [] } }),
    { ahora: AHORA },
  );
  assertEquals(v.variables.sri_ruc, 0, "el contribuyente contestó y no había nada");
  for (const c of ["sri_estado", "sri_obligado", "sri_antig", "sri_susp"]) assertEquals(v.variables[c], null, c);
  assertFalse(v.avisos.some((a) => a.includes("no contestó")));
});

Deno.test("sin respuesta no es un dato: si el contribuyente no contestó, todo el SRI queda sin dato (también sri_ruc)", () => {
  for (const meta of [
    { fuentesConDatos: ["general"], fuentesSinDatos: [], fuentesNoMedidas: ["contribuyente"] },
    { fuentesConDatos: ["general"], fuentesSinDatos: [], fuentesNoMedidas: [] },
  ]) {
    const v = vectorDeNivel1(perfil({ laboral: { estadoActividadEconomica: "sin_ruc" }, metaConsulta: meta }), { ahora: AHORA });
    for (const c of ["sri_ruc", "sri_estado", "sri_obligado", "sri_antig", "sri_susp"]) assertEquals(v.variables[c], null, c);
    assert(v.avisos.some((a) => a.includes("no contestó")));
  }
  const sinMeta = vectorDeNivel1(perfil({ metaConsulta: null }), { ahora: AHORA });
  assertEquals(sinMeta.variables.sri_ruc, null);
});

Deno.test("el nivel 2: las diez variables del análisis de crédito pasan tal cual", () => {
  const v = vectorDeNivel2(perfil(), tablas(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(Object.keys(v.variables), [...VARIABLES_DEL_NIVEL_2]);
  assertEquals(v.variables.cred_mayor, 12000);
  assertEquals(v.variables.cred_12m, 5000.46);
  assertEquals(v.variables.deuda_total, 6500.5);
  assertEquals(v.variables.n_inst, 3);
  assertEquals(v.variables.n_creditos, 7);
  assertEquals(v.variables.valor_creditos, 43000);
  assertEquals(v.variables.saldos_vig, 6400.25);
  assertEquals(v.variables.deuda_actual, 6500.5);
  assertEquals(v.variables.deuda_3m, 7100);
});

Deno.test("un crédito concedido después de la consulta se anula: puede ser el que se está pidiendo", () => {
  assertEquals(CREDITOS_POSTERIORES_QUE_SE_ANULAN, ["cred_mayor", "cred_12m", "cred_24m"]);
  const posterior = tablas({ interconnectResponse: { AnalisisCreditoSectorFinanciero: { MCAMontoOriginal: 9000, MCAFecConcesion: "10/09/2026", CMRMontoOriginal: 5000.456, CMRFecConcesion: "10/02/2026", CMAMontoOriginal: 8000, CMAFecConcesion: "05/09/2026" } } });
  const v = vectorDeNivel2(perfil(), posterior, { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.cred_mayor, null, "concedido después de la consulta: puede ser el que se pide");
  assertEquals(v.variables.cred_24m, null, "el crédito actual concedido el 5 de septiembre tampoco se usa");
  assertEquals(v.variables.cred_12m, 5000.46, "el reciente es de febrero: se usa");
  const mismoDia = tablas({ interconnectResponse: { AnalisisCreditoSectorFinanciero: { MCAMontoOriginal: 9000, MCAFecConcesion: "31/08/2026" } } });
  assertEquals(vectorDeNivel2(perfil(), mismoDia, { ahora: AHORA, consultadoEl: CONSULTA }).variables.cred_mayor, 9000, "el mismo día no es posterior");
  const sinFecha = tablas({ interconnectResponse: { AnalisisCreditoSectorFinanciero: { MCAMontoOriginal: 9000 } } });
  assertEquals(vectorDeNivel2(perfil(), sinFecha, { ahora: AHORA, consultadoEl: CONSULTA }).variables.cred_mayor, 9000, "sin fecha no hay con qué anular");
});

Deno.test("la fecha de la consulta es la de Ecuador: una consulta de las 20:00 del 31 ya es del 1 en UTC", () => {
  const t = tablas({ interconnectResponse: { AnalisisCreditoSectorFinanciero: { MCAMontoOriginal: 9000, MCAFecConcesion: "01/09/2026" } } });
  const v = vectorDeNivel2(perfil(), t, { ahora: AHORA, consultadoEl: "2026-09-01T01:00:00Z" }); // 20:00 del 31 de agosto en Ecuador
  assertEquals(v.variables.cred_mayor, null, "concedido el 1 de septiembre, después de una consulta del 31 de agosto");
});

Deno.test("la cuota y su historial: cuota financiera, -12, -6 y actual, y los cocientes acotados", () => {
  const v = vectorDeNivel2(perfil(), tablas(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.cuota_fin, 250);
  assertEquals(v.variables.h12, 180);
  assertEquals(v.variables.h6, 190);
  assertEquals(v.variables.hact, 200);
  assertAlmostEquals(v.variables.g6 as number, 200 / 190, 1e-9);
  assertAlmostEquals(v.variables.g12 as number, 200 / 180, 1e-9);
});

Deno.test("los cocientes: denominador cero o nulo es sin dato, y se acotan a 20", () => {
  const t = tablas({ reporteCrediticio: { historico_cuota_estimada: [{ retroactivo: "-12 Meses", cuota_mensual: 0 }, { retroactivo: "-6 Meses", cuota_mensual: 5 }, { retroactivo: "Actual", cuota_mensual: 500 }] } });
  const v = vectorDeNivel2(perfil(), t, { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.g12, null, "con una cuota de hace 12 meses de 0 no hay cociente");
  assertEquals(v.variables.g6, 20, "500 / 5 = 100, acotado a 20");
  const sinHistorial = tablas({ reporteCrediticio: { historico_cuota_estimada: [] } });
  const w = vectorDeNivel2(perfil(), sinHistorial, { ahora: AHORA, consultadoEl: CONSULTA });
  for (const c of ["h12", "h6", "hact", "g6", "g12"]) assertEquals(w.variables[c], null, c);
});

Deno.test("las operaciones por tipo: sólo el titular, y un grupo sin filas es sin dato, no cero", () => {
  const v = vectorDeNivel2(perfil(), tablas(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.c_consumo, 220, "200 del banco y 20 del comercio; el garante no suma acá");
  assertEquals(v.variables.s_consumo, 4200);
  assertEquals(v.variables.n_consumo, 2);
  assertEquals(v.variables.c_micro, 0, "una operación con cuota 0 es una cuota de 0");
  assertEquals(v.variables.n_micro, 1);
  assertEquals(v.variables.c_tarjeta, null, "sin operaciones de tarjeta: sin dato");
  assertEquals(v.variables.n_tarjeta, null);
  assertEquals(v.variables.c_vivienda, null);
  assertEquals(v.variables.c_comercial, null, "la comercial de la prueba es del codeudor, no del titular");
  assertEquals(v.variables.c_codeudor, 50, "el codeudor y el garante");
  assertEquals(v.variables.max_dias_t, 45);
});

Deno.test("el saldo, el número de operaciones y la mora máxima cuentan todas las operaciones y todos los roles", () => {
  const v = vectorDeNivel2(perfil(), tablas(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.saldo, 4800);
  assertEquals(v.variables.n_oper, 5);
  assertEquals(v.variables.max_mora, 45);
  assert(v.pendientes.some((p) => p.startsWith("operaciones")), "la paridad de las operaciones es parcial y se dice");
});

Deno.test("sin operaciones: el saldo, el conteo y la mora quedan sin dato", () => {
  const t = tablas({ reporteCrediticio: { detalle_deuda_actual_sb: [], detalle_deuda_actual_seps: [], detalle_deuda_actual_sicom: [] } });
  const v = vectorDeNivel2(perfil(), t, { ahora: AHORA, consultadoEl: CONSULTA });
  for (const c of ["saldo", "n_oper", "max_mora", "max_dias_t", "c_codeudor", "c_consumo"]) assertEquals(v.variables[c], null, c);
});

Deno.test("el tipo de crédito se agrupa como en el entrenamiento", () => {
  assertEquals(tipoDeCreditoParaIngreso(" Tarjeta de Credito"), "TARJETA");
  assertEquals(tipoDeCreditoParaIngreso("Consumo Prioritario"), "CONSUMO");
  assertEquals(tipoDeCreditoParaIngreso("Microcredito"), "MICROCREDITO");
  assertEquals(tipoDeCreditoParaIngreso("Vivienda"), "VIVIENDA");
  assertEquals(tipoDeCreditoParaIngreso("Comercial"), "COMERCIAL");
  assertEquals(tipoDeCreditoParaIngreso("Educativo"), "EDUCATIVO");
  assertEquals(tipoDeCreditoParaIngreso("Inversion Publica"), "OTRO");
  assertEquals(tipoDeCreditoParaIngreso(null), "OTRO");
});

Deno.test("el SRI de Equifax en el nivel 2: estado, clase, sección y división del CIIU, obligado y años", () => {
  const v = vectorDeNivel2(perfil(), tablas(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.sri_ruc, 1);
  assertEquals(v.variables.sri_estado, "ACTIVO");
  assertEquals(v.variables.sri_clase, "RIMPE");
  assertEquals(v.variables.sri_obligado, 0);
  assertEquals(v.variables.sri_ciiu_secc, "G");
  assertEquals(v.variables.sri_ciiu_div, "G47");
  assertAlmostEquals(v.variables.sri_antig as number, (Date.UTC(2026, 8, 10) - Date.UTC(2015, 2, 2)) / 86_400_000 / 365.25, 1e-9, "del 2015-03-02 al 2026-09-10");
  assertEquals(v.variables.sri_susp, null);
});

Deno.test("el SRI en el nivel 2 sale de Equifax aunque Novadata diga otra cosa", () => {
  const v = vectorDeNivel2(perfil({ laboral: { estadoActividadEconomica: "sin_ruc" } }), tablas(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.sri_ruc, 1);
});

Deno.test("sin el bloque del SRI en la respuesta, todo el SRI queda sin dato; con el bloque vacío, no tiene RUC", () => {
  const sinBloque = derivarTablas(respuestaDePrueba({ reporteCrediticio: { informacion_sri: undefined } })).tablas;
  const a = vectorDeNivel2(perfil(), sinBloque, { ahora: AHORA, consultadoEl: CONSULTA });
  for (const c of ["sri_ruc", "sri_estado", "sri_clase", "sri_obligado", "sri_antig", "sri_susp", "sri_ciiu_secc", "sri_ciiu_div"]) assertEquals(a.variables[c], null, c);
  assert(a.avisos.some((x) => x.includes("SRI")));
  const vacio = derivarTablas(respuestaDePrueba({ reporteCrediticio: { informacion_sri: [] } })).tablas;
  const b = vectorDeNivel2(perfil(), vacio, { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(b.variables.sri_ruc, 0);
  assertEquals(b.variables.sri_estado, null);
});

Deno.test("sin el análisis de crédito en la respuesta, las diez variables de crédito quedan sin dato y se avisa", () => {
  const t = tablas({ interconnectResponse: { AnalisisCreditoSectorFinanciero: undefined } });
  const v = vectorDeNivel2(perfil(), t, { ahora: AHORA, consultadoEl: CONSULTA });
  for (const c of ["cred_mayor", "cred_12m", "cred_24m", "deuda_total", "n_inst", "n_creditos", "valor_creditos", "saldos_vig", "deuda_actual", "deuda_3m"]) assertEquals(v.variables[c], null, c);
  assert(v.avisos.some((a) => a.includes("AnalisisCreditoSectorFinanciero")));
  assertEquals(v.variables.cuota_fin, 250, "lo demás sigue");
});

Deno.test("el vector no lleva identificadores: ni la cédula, ni el nombre, ni el RUC", () => {
  const v = vectorDeNivel2(
    { ...perfil(), identidad: { edad: 41, genero: "MUJER", estadoCivil: "CASADO", nombreCompleto: "PERSONA DE PRUEBA UNO", cedula: "0102030405" } as never },
    tablas(),
    { ahora: AHORA, consultadoEl: CONSULTA, mapeo: MAPEO_DE_PRUEBA, historialIess: iess },
  );
  const texto = JSON.stringify(v);
  for (const personal of ["PERSONA DE PRUEBA UNO", "0102030405", "0102030405001", "NEGOCIO INVENTADO", "EMPRESA UNO"]) assertFalse(texto.includes(personal), personal);
});

Deno.test("el mismo perfil y la misma respuesta dan siempre el mismo vector", () => {
  const a = vectorDeNivel2(perfil(), tablas(), { ahora: AHORA, consultadoEl: CONSULTA, historialIess: iess });
  const b = vectorDeNivel2(perfil(), tablas(), { ahora: AHORA, consultadoEl: CONSULTA, historialIess: iess });
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});
