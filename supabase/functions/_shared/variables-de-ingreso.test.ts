// El vector de entrada del predictor de ingresos, con una respuesta de Equifax
// INVENTADA (equifax-respuesta-de-prueba.ts): el repositorio es público. Con las
// 5.001 respuestas reales se compara contra el extracto de AWS en
// scripts/probar-paridad-variables-de-ingreso.mjs, que lee research/ (fuera de git).
//
// deno test --allow-env supabase/functions/

import { assert, assertAlmostEquals, assertEquals, assertFalse, assertRejects } from "jsr:@std/assert@1";
import { comprimirTexto } from "./crudo-equifax-migrado.ts";
import { respuestaDePrueba } from "./equifax-respuesta-de-prueba.ts";
import {
  CREDITOS_POSTERIORES_QUE_SE_ANULAN,
  MAPEO_DE_PROVEEDOR_INFO_1,
  operacionesParaIngreso,
  sexoParaIngreso,
  tipoDeCreditoParaIngreso,
  VARIABLES_CATEGORICAS,
  VARIABLES_DEL_NIVEL_1,
  VARIABLES_DEL_NIVEL_2,
  variablesDelIess,
  vectorDeNivel1,
  vectorDeNivel2,
  vectorDeNivel2DeLaConsulta,
  type MapeoDeCategorias,
  type PerfilParaIngreso,
} from "./variables-de-ingreso.ts";

const AHORA = new Date("2026-09-10T15:00:00Z"); // 10:00 en Ecuador
const CONSULTA = "2026-08-31T15:00:00Z";

// Las listas de interconnectResponse de las que sale el nivel 2, con la misma deuda que reporteCrediticio en la respuesta de prueba:
//   bancos (SFR)   titular consumo 4.000 (cuota 200, 45 días), titular microcrédito 0, codeudor comercial 500 (cuota 50)
//   comercio       titular consumo 200 (cuota 20), garante consumo 100
type Fila = Record<string, unknown>;
const fila = (c: Fila): Fila => ({
  Sistema: "SFR", Institucion: "BANCO DE PRUEBA UNO", Tipo_Riesgo: "TITULAR", Tipo_Credito: "Consumo", Fecha_Corte: "2026 Ago",
  Saldo_Deuda: 0, Cuota_Mensual: 0, Dias_Venc: 0, Total_Vencido: 0, ...c,
});
const LISTAS_DE_PRUEBA = {
  DetalleDeudaActualReportadaRFRSBS: [],
  DetalleDeudaActualReportadaSICOMSBS: [
    fila({ Sistema: "SICOM", Institucion: "COMERCIO DE PRUEBA", Saldo_Deuda: 200, Cuota_Mensual: 20 }),
    fila({ Sistema: "SICOM", Institucion: "COMERCIO DE PRUEBA DOS", Tipo_Riesgo: "GARANTE", Saldo_Deuda: 100 }),
  ],
  DetalleDeudaActualReportadaSBSSBS_Educativo: [
    fila({ Saldo_Deuda: 4000, Cuota_Mensual: 200, Dias_Venc: 45, Total_Vencido: 300 }),
    fila({ Institucion: "BANCO DE PRUEBA DOS", Tipo_Riesgo: "Titular", Tipo_Credito: "Microcredito" }),
    fila({ Institucion: "BANCO DE PRUEBA TRES", Tipo_Riesgo: "CODEUDOR", Tipo_Credito: "Comercial", Saldo_Deuda: 500, Cuota_Mensual: 50 }),
  ],
};
const respuesta = (cambios: Parameters<typeof respuestaDePrueba>[0] = {}) =>
  respuestaDePrueba({ ...cambios, interconnectResponse: { ...LISTAS_DE_PRUEBA, ...cambios.interconnectResponse } });

// Un mapeo de prueba: NO es el de producción (esa equivalencia no se midió), sólo prueba que la interfaz se usa.
const MAPEO_DE_PRUEBA: MapeoDeCategorias = {
  pendiente: false,
  genero: (v) => (v === "FEMENINO" ? "F" : v === "MASCULINO" ? "M" : null),
  estadoCivil: (v) => v,
  provincia: (v) => v,
  canton: (v) => v,
};

const perfil = (cambios: Partial<PerfilParaIngreso> = {}): PerfilParaIngreso => ({
  identidad: { edad: 41, genero: "FEMENINO", estadoCivil: "CASADO" },
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
  assertEquals([...VARIABLES_DEL_NIVEL_1], ["edad", "genero", "anio_mes", "sri_ruc", "sri_estado", "sri_obligado", "sri_antig", "sri_susp"]);
  for (const c of VARIABLES_DEL_NIVEL_1) assert((VARIABLES_DEL_NIVEL_2 as readonly string[]).includes(c), c);
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

Deno.test("el nivel 1: la edad, el sexo de Proveedor_Info_1 y la fecha; sin estado civil, zona ni IESS, aunque lleguen", () => {
  const v = vectorDeNivel1(perfil(), {
    ahora: AHORA, historialIess: iess,
    ubicaciones: { provinciaDomicilio: "PROV A", cantonDomicilio: "CANTON A", provinciaTrabajo: "PROV B", cantonTrabajo: "CANTON B" },
  });
  assertEquals(Object.keys(v.variables), [...VARIABLES_DEL_NIVEL_1]);
  assertEquals(v.variables.edad, 41);
  assertEquals(v.variables.genero, "FEMENINO");
  assertAlmostEquals(v.variables.anio_mes as number, 2026 + 8 / 12, 1e-9);
  for (const c of ["estado_civil", "prov_dom", "aporte", "meses_aporte", "n_empleos"]) assertFalse(c in v.variables, c);
  assertFalse(v.pendientes.some((p) => p.startsWith("categorias") || p.startsWith("ubicaciones") || p.startsWith("iess")));
  assertFalse(v.avisos.some((a) => a.includes("IESS")));
});

Deno.test("el sexo: sólo las dos categorías del entrenamiento, que son las de Proveedor_Info_1; otra queda sin dato", () => {
  assertEquals(sexoParaIngreso(" masculino "), "MASCULINO");
  assertEquals(sexoParaIngreso("FEMENINO"), "FEMENINO");
  for (const otro of ["MUJER", "M", "", null]) assertEquals(sexoParaIngreso(otro), null, String(otro));
  const v = vectorDeNivel1(perfil({ identidad: { edad: 41, genero: "MUJER", estadoCivil: null } }), { ahora: AHORA });
  assertEquals(v.variables.genero, null);
  assert(v.sinDato.includes("genero"));
  assertEquals(MAPEO_DE_PROVEEDOR_INFO_1.pendiente, true, "el estado civil, la provincia y el cantón siguen sin mapeo");
});

Deno.test("el nivel 2 sin mapeo de estado civil y zona: salen sin dato y se dice pendiente; con mapeo y ubicaciones, pasan", () => {
  const sin = vectorDeNivel2(perfil(), respuesta(), { ahora: AHORA, consultadoEl: CONSULTA, historialIess: iess });
  assertEquals(sin.variables.genero, "FEMENINO");
  for (const c of ["estado_civil", "prov_trab", "cant_trab", "prov_dom", "cant_dom"]) assertEquals(sin.variables[c], null, c);
  assert(sin.pendientes.some((p) => p.startsWith("categorias")));
  assert(sin.pendientes.some((p) => p.startsWith("ubicaciones")));
  const con = vectorDeNivel2(perfil(), respuesta(), {
    ahora: AHORA, consultadoEl: CONSULTA, historialIess: iess, mapeo: MAPEO_DE_PRUEBA,
    ubicaciones: { provinciaDomicilio: "PROV A", cantonDomicilio: "CANTON A", provinciaTrabajo: null, cantonTrabajo: "CANTON B" },
  });
  assertEquals(con.variables.genero, "F");
  assertEquals(con.variables.estado_civil, "CASADO");
  assertEquals(con.variables.prov_dom, "PROV A");
  assertEquals(con.variables.prov_trab, null);
  assertEquals(con.variables.cant_trab, "CANTON B");
  assertEquals(con.variables.aporte, 1020);
  assertFalse(con.pendientes.some((p) => p.startsWith("categorias")));
  assertFalse(con.pendientes.some((p) => p.startsWith("ubicaciones")));
});

Deno.test("el año con fracción usa la fecha de Ecuador: a las 20:00 de Ecuador la fecha UTC ya es la de mañana", () => {
  const finDeMes = vectorDeNivel1(perfil(), { ahora: new Date("2026-10-01T02:00:00Z") }); // 21:00 del 30 de septiembre
  assertAlmostEquals(finDeMes.variables.anio_mes as number, 2026 + 8 / 12, 1e-9);
});

Deno.test("el SRI de Proveedor_Info_1: con RUC activo salen el estado, la antigüedad en años y el obligado del perfil", () => {
  const conRuc = (obligado: boolean | null) =>
    perfil({ laboral: { estadoActividadEconomica: "activa_sin_interrupciones", fechaInicioActividadesRuc: "2020-09-10", fechaCeseActividadesRuc: null, tipoUltimoCeseRuc: null, obligadoALlevarContabilidadRuc: obligado } });
  const v = vectorDeNivel1(conRuc(true), { ahora: AHORA });
  assertEquals(v.variables.sri_ruc, 1);
  assertEquals(v.variables.sri_estado, "ACTIVO");
  assertAlmostEquals(v.variables.sri_antig as number, 2191 / 365.25, 1e-9, "del 2020-09-10 al 2026-09-10: 2.191 días");
  assertEquals(v.variables.sri_susp, null);
  assertEquals(v.variables.sri_obligado, 1);
  assertEquals(vectorDeNivel1(conRuc(false), { ahora: AHORA }).variables.sri_obligado, 0);
  // Un valor que ruc.ts no reconoció llega null: sin dato, sin aviso de perfil viejo.
  const sinReconocer = vectorDeNivel1(conRuc(null), { ahora: AHORA });
  assertEquals(sinReconocer.variables.sri_obligado, null);
  assertFalse(sinReconocer.avisos.some((a) => a.includes("estructura-v15")));
  // La opción reemplaza al perfil: la prueba en sombra mide con y sin el dato sobre el mismo perfil.
  assertEquals(vectorDeNivel1(conRuc(true), { ahora: AHORA, obligadoAContabilidad: false }).variables.sri_obligado, 0);
  assertEquals(vectorDeNivel1(conRuc(true), { ahora: AHORA, obligadoAContabilidad: null }).variables.sri_obligado, null);
});

Deno.test("el SRI de Proveedor_Info_1: un RUC inactivo es SUSPENDIDO y, si el cese fue una suspensión definitiva, trae sri_susp", () => {
  const v = vectorDeNivel1(
    perfil({ laboral: { estadoActividadEconomica: "inactiva_nunca_reactivada", fechaInicioActividadesRuc: "2010-01-01", fechaCeseActividadesRuc: "2024-09-10", tipoUltimoCeseRuc: "suspension_definitiva" } }),
    { ahora: AHORA },
  );
  assertEquals(v.variables.sri_estado, "SUSPENDIDO");
  assertAlmostEquals(v.variables.sri_susp as number, 730 / 365.25, 1e-9, "del 2024-09-10 al 2026-09-10");
  assertEquals(v.variables.sri_obligado, null, "un perfil anterior a estructura-v15 no trae el obligado");
  assert(v.avisos.some((a) => a.includes("estructura-v15")));
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
  const v = vectorDeNivel2(perfil(), respuesta(), { ahora: AHORA, consultadoEl: CONSULTA });
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
  const posterior = respuesta({ interconnectResponse: { AnalisisCreditoSectorFinanciero: { MCAMontoOriginal: 9000, MCAFecConcesion: "10/09/2026", CMRMontoOriginal: 5000.456, CMRFecConcesion: "10/02/2026", CMAMontoOriginal: 8000, CMAFecConcesion: "05/09/2026" } } });
  const v = vectorDeNivel2(perfil(), posterior, { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.cred_mayor, null, "concedido después de la consulta: puede ser el que se pide");
  assertEquals(v.variables.cred_24m, null, "el crédito actual concedido el 5 de septiembre tampoco se usa");
  assertEquals(v.variables.cred_12m, 5000.46, "el reciente es de febrero: se usa");
  const mismoDia = respuesta({ interconnectResponse: { AnalisisCreditoSectorFinanciero: { MCAMontoOriginal: 9000, MCAFecConcesion: "31/08/2026" } } });
  assertEquals(vectorDeNivel2(perfil(), mismoDia, { ahora: AHORA, consultadoEl: CONSULTA }).variables.cred_mayor, 9000, "el mismo día no es posterior");
  const sinFecha = respuesta({ interconnectResponse: { AnalisisCreditoSectorFinanciero: { MCAMontoOriginal: 9000 } } });
  assertEquals(vectorDeNivel2(perfil(), sinFecha, { ahora: AHORA, consultadoEl: CONSULTA }).variables.cred_mayor, 9000, "sin fecha no hay con qué anular");
});

Deno.test("la fecha de la consulta es la de Ecuador: una consulta de las 20:00 del 31 ya es del 1 en UTC", () => {
  const t = respuesta({ interconnectResponse: { AnalisisCreditoSectorFinanciero: { MCAMontoOriginal: 9000, MCAFecConcesion: "01/09/2026" } } });
  const v = vectorDeNivel2(perfil(), t, { ahora: AHORA, consultadoEl: "2026-09-01T01:00:00Z" }); // 20:00 del 31 de agosto en Ecuador
  assertEquals(v.variables.cred_mayor, null, "concedido el 1 de septiembre, después de una consulta del 31 de agosto");
});

Deno.test("la cuota y su historial: cuota financiera, -12, -6 y actual, y los cocientes acotados", () => {
  const v = vectorDeNivel2(perfil(), respuesta(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.cuota_fin, 250);
  assertEquals(v.variables.h12, 180);
  assertEquals(v.variables.h6, 190);
  assertEquals(v.variables.hact, 200);
  assertAlmostEquals(v.variables.g6 as number, 200 / 190, 1e-9);
  assertAlmostEquals(v.variables.g12 as number, 200 / 180, 1e-9);
});

Deno.test("los cocientes: denominador cero o nulo es sin dato, y se acotan a 20", () => {
  const t = respuesta({ reporteCrediticio: { historico_cuota_estimada: [{ retroactivo: "-12 Meses", cuota_mensual: 0 }, { retroactivo: "-6 Meses", cuota_mensual: 5 }, { retroactivo: "Actual", cuota_mensual: 500 }] } });
  const v = vectorDeNivel2(perfil(), t, { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.g12, null, "con una cuota de hace 12 meses de 0 no hay cociente");
  assertEquals(v.variables.g6, 20, "500 / 5 = 100, acotado a 20");
  const sinHistorial = respuesta({ reporteCrediticio: { historico_cuota_estimada: [] } });
  const w = vectorDeNivel2(perfil(), sinHistorial, { ahora: AHORA, consultadoEl: CONSULTA });
  for (const c of ["h12", "h6", "hact", "g6", "g12"]) assertEquals(w.variables[c], null, c);
});

Deno.test("las operaciones por tipo: sólo el titular, y un grupo sin filas es sin dato, no cero", () => {
  const v = vectorDeNivel2(perfil(), respuesta(), { ahora: AHORA, consultadoEl: CONSULTA });
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
  const v = vectorDeNivel2(perfil(), respuesta(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.saldo, 4800);
  assertEquals(v.variables.n_oper, 5);
  assertEquals(v.variables.max_mora, 45);
  assertFalse(v.pendientes.some((p) => p.startsWith("operaciones")), "desde v2 la paridad de las operaciones es completa (12.35)");
});

Deno.test("sin operaciones: el saldo, el conteo y la mora quedan sin dato", () => {
  const t = respuesta({ interconnectResponse: { DetalleDeudaActualReportadaRFRSBS: [], DetalleDeudaActualReportadaSICOMSBS: [], DetalleDeudaActualReportadaSBSSBS_Educativo: [] } });
  const v = vectorDeNivel2(perfil(), t, { ahora: AHORA, consultadoEl: CONSULTA });
  for (const c of ["saldo", "n_oper", "max_mora", "max_dias_t", "c_codeudor", "c_consumo"]) assertEquals(v.variables[c], null, c);
  assertFalse(v.avisos.some((a) => a.includes("interconnectResponse")), "las listas vinieron vacías: no tiene operaciones");
});

Deno.test("las operaciones salen de interconnectResponse, no de reporteCrediticio (de donde salió el extracto de AWS)", () => {
  // La respuesta de prueba sin las listas de arriba: reporteCrediticio trae consumo por 220 y la única fila de las listas es de 777.777, sin tipo.
  const v = vectorDeNivel2(perfil(), respuestaDePrueba(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.saldo, 777777);
  assertEquals(v.variables.n_oper, 1);
  assertEquals(v.variables.c_consumo, null, "el consumo de reporteCrediticio no entra");
  // Y al revés: una tarjeta que sólo está en las listas sí entra.
  const conTarjeta = respuesta({ interconnectResponse: { DetalleDeudaActualReportadaRFRSBS: [fila({ Sistema: "SFNR", Tipo_Credito: "Tarjeta de Crédito", Saldo_Deuda: 900, Cuota_Mensual: 75 })] } });
  const w = vectorDeNivel2(perfil(), conTarjeta, { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals([w.variables.c_tarjeta, w.variables.s_tarjeta, w.variables.n_tarjeta], [75, 900, 1]);
  assertEquals(w.variables.c_consumo, 220, "las tres listas se juntan");
});

Deno.test("la mora máxima es la del extracto de AWS: comparada como texto, y la del titular por sistema y tipo de crédito", () => {
  const t = respuesta({
    interconnectResponse: {
      DetalleDeudaActualReportadaSICOMSBS: [],
      DetalleDeudaActualReportadaSBSSBS_Educativo: [
        fila({ Dias_Venc: 130 }), fila({ Dias_Venc: 65 }), fila({ Tipo_Credito: "Microcredito", Dias_Venc: 259 }), fila({ Tipo_Riesgo: "GARANTE", Dias_Venc: 0 }),
      ],
    },
  });
  const v = vectorDeNivel2(perfil(), t, { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.max_mora, 65, "«65» le gana a «259» y a «130» como texto: así lo calculó AWS");
  assertEquals(v.variables.max_dias_t, 259, "consumo da 65 (texto) y microcrédito 259; entre los dos, el mayor como número");
});

Deno.test("sin interconnectResponse las operaciones quedan sin dato y se avisa; no es lo mismo que no tener operaciones", () => {
  assertEquals(operacionesParaIngreso({ reporteCrediticio: {} }), null);
  assertEquals(operacionesParaIngreso(null), null);
  assertEquals(operacionesParaIngreso({ interconnectResponse: {} }), []);
  const v = vectorDeNivel2(perfil(), { ...respuesta(), interconnectResponse: undefined }, { ahora: AHORA, consultadoEl: CONSULTA });
  for (const c of ["c_consumo", "s_consumo", "n_consumo", "c_codeudor", "max_dias_t", "saldo", "n_oper", "max_mora"]) assertEquals(v.variables[c], null, c);
  assert(v.avisos.some((a) => a.includes("interconnectResponse")));
  assertEquals(v.variables.cuota_fin, 250, "lo que sale de reporteCrediticio sigue");
});

// Una base con Storage de mentira: sólo lo que usa leerCrudoDeLaConsulta().
function baseConCrudo(objetos: Record<string, Uint8Array>) {
  return {
    storage: {
      from: (_deposito: string) => ({
        download: (ruta: string) => Promise.resolve(ruta in objetos ? { data: new Blob([objetos[ruta] as BlobPart]), error: null } : { data: null, error: { message: "no existe" } }),
      }),
    },
  };
}

Deno.test("en producción el nivel 2 lee el crudo de la consulta: de la fila o, si es una migrada, de Storage", async () => {
  const crudo = respuesta();
  const esperado = vectorDeNivel2(perfil(), crudo, { ahora: AHORA, consultadoEl: CONSULTA });
  const base = baseConCrudo({ "aws/123.json.gz": await comprimirTexto(JSON.stringify(crudo)) });
  const deLaFila = await vectorDeNivel2DeLaConsulta(base, { created_at: CONSULTA, respuesta_cruda: crudo }, perfil(), { ahora: AHORA });
  const deStorage = await vectorDeNivel2DeLaConsulta(base, { created_at: CONSULTA, respuesta_cruda: null, crudo_ruta: "aws/123.json.gz" }, perfil(), { ahora: AHORA });
  assertEquals(JSON.stringify(deLaFila), JSON.stringify(esperado));
  assertEquals(JSON.stringify(deStorage), JSON.stringify(esperado), "el reloj de la concesión es la fecha de la consulta");
  await assertRejects(() => vectorDeNivel2DeLaConsulta(base, { created_at: CONSULTA, respuesta_cruda: null, crudo_ruta: null }, perfil(), { ahora: AHORA }));
  await assertRejects(() => vectorDeNivel2DeLaConsulta(base, { created_at: CONSULTA, crudo_ruta: "aws/no-esta.json.gz" }, perfil(), { ahora: AHORA }));
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
  const v = vectorDeNivel2(perfil(), respuesta(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.sri_ruc, 1);
  assertEquals(v.variables.sri_estado, "ACTIVO");
  assertEquals(v.variables.sri_clase, "RIMPE");
  assertEquals(v.variables.sri_obligado, 0);
  assertEquals(v.variables.sri_ciiu_secc, "G");
  assertEquals(v.variables.sri_ciiu_div, "G47");
  assertAlmostEquals(v.variables.sri_antig as number, (Date.UTC(2026, 8, 10) - Date.UTC(2015, 2, 2)) / 86_400_000 / 365.25, 1e-9, "del 2015-03-02 al 2026-09-10");
  assertEquals(v.variables.sri_susp, null);
});

Deno.test("el SRI en el nivel 2 sale de Equifax aunque Proveedor_Info_1 diga otra cosa", () => {
  const v = vectorDeNivel2(perfil({ laboral: { estadoActividadEconomica: "sin_ruc" } }), respuesta(), { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(v.variables.sri_ruc, 1);
});

Deno.test("sin el bloque del SRI en la respuesta, todo el SRI queda sin dato; con el bloque vacío, no tiene RUC", () => {
  const sinBloque = respuesta({ reporteCrediticio: { informacion_sri: undefined } });
  const a = vectorDeNivel2(perfil(), sinBloque, { ahora: AHORA, consultadoEl: CONSULTA });
  for (const c of ["sri_ruc", "sri_estado", "sri_clase", "sri_obligado", "sri_antig", "sri_susp", "sri_ciiu_secc", "sri_ciiu_div"]) assertEquals(a.variables[c], null, c);
  assert(a.avisos.some((x) => x.includes("SRI")));
  const vacio = respuesta({ reporteCrediticio: { informacion_sri: [] } });
  const b = vectorDeNivel2(perfil(), vacio, { ahora: AHORA, consultadoEl: CONSULTA });
  assertEquals(b.variables.sri_ruc, 0);
  assertEquals(b.variables.sri_estado, null);
});

Deno.test("sin el análisis de crédito en la respuesta, las diez variables de crédito quedan sin dato y se avisa", () => {
  const t = respuesta({ interconnectResponse: { AnalisisCreditoSectorFinanciero: undefined } });
  const v = vectorDeNivel2(perfil(), t, { ahora: AHORA, consultadoEl: CONSULTA });
  for (const c of ["cred_mayor", "cred_12m", "cred_24m", "deuda_total", "n_inst", "n_creditos", "valor_creditos", "saldos_vig", "deuda_actual", "deuda_3m"]) assertEquals(v.variables[c], null, c);
  assert(v.avisos.some((a) => a.includes("AnalisisCreditoSectorFinanciero")));
  assertEquals(v.variables.cuota_fin, 250, "lo demás sigue");
});

Deno.test("el vector no lleva identificadores: ni la cédula, ni el nombre, ni el RUC", () => {
  const v = vectorDeNivel2(
    { ...perfil(), identidad: { edad: 41, genero: "MUJER", estadoCivil: "CASADO", nombreCompleto: "PERSONA DE PRUEBA UNO", cedula: "0102030405" } as never },
    respuesta(),
    { ahora: AHORA, consultadoEl: CONSULTA, mapeo: MAPEO_DE_PRUEBA, historialIess: iess },
  );
  const texto = JSON.stringify(v);
  for (const personal of ["PERSONA DE PRUEBA UNO", "0102030405", "0102030405001", "NEGOCIO INVENTADO", "EMPRESA UNO"]) assertFalse(texto.includes(personal), personal);
});

Deno.test("el mismo perfil y la misma respuesta dan siempre el mismo vector", () => {
  const a = vectorDeNivel2(perfil(), respuesta(), { ahora: AHORA, consultadoEl: CONSULTA, historialIess: iess });
  const b = vectorDeNivel2(perfil(), respuesta(), { ahora: AHORA, consultadoEl: CONSULTA, historialIess: iess });
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});
