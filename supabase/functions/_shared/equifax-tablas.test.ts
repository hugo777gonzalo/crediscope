// La descomposición del crudo de Equifax en tablas, con una respuesta
// INVENTADA (equifax-respuesta-de-prueba.ts): el repositorio es público y no
// puede llevar la respuesta de nadie. Con las 22 respuestas reales se prueba lo
// mismo en scripts/probar-equifax-tablas.mjs, que lee research/ (fuera de git).
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals, assertFalse, assertThrows } from "jsr:@std/assert@1";
import {
  columnasDeLaTabla,
  derivarTablas,
  entero,
  ESPECIFICACION_DE_TABLAS,
  esNovaCredit,
  EQUIFAX_TABLAS_VERSION,
  fechaISO,
  mesISO,
  retroactivoEnMeses,
  rolDeEquifax,
  sistemaDeLaSigla,
  texto,
} from "./equifax-tablas.ts";
import { PERSONALES_DE_PRUEBA, respuestaDePrueba } from "./equifax-respuesta-de-prueba.ts";

Deno.test("las fechas de Equifax salen ISO, de las cuatro formas que manda", () => {
  assertEquals(fechaISO("31/08/2026"), "2026-08-31");
  assertEquals(fechaISO("2026-08-31 00:00:00.000"), "2026-08-31");
  assertEquals(fechaISO("2026-08-31 00:00:00.000000"), "2026-08-31");
  assertEquals(fechaISO("2026-08-31"), "2026-08-31");
  assertEquals(mesISO("Oct 2026"), "2026-10-01");
  assertEquals(mesISO("2026 Ago"), "2026-08-01");
  assertEquals(mesISO("Ene 2026"), "2026-01-01");
  assertEquals(mesISO("Dic 2025"), "2025-12-01");
});

Deno.test("una fecha imposible o que no es fecha no se inventa: sale null", () => {
  assertEquals(fechaISO("31/02/2026"), null);
  assertEquals(fechaISO("2026-13-01"), null);
  assertEquals(fechaISO("X"), null);
  assertEquals(fechaISO(null), null);
  assertEquals(fechaISO(20260831), null);
  assertEquals(mesISO("X"), null);
  assertEquals(mesISO("Entidad que Consultó"), null);
});

Deno.test("el rol se normaliza: Equifax manda TITULAR y Titular", () => {
  assertEquals(rolDeEquifax("TITULAR"), { rol: "titular", original: "TITULAR" });
  assertEquals(rolDeEquifax("Titular"), { rol: "titular", original: "Titular" });
  assertEquals(rolDeEquifax(" codeudor "), { rol: "codeudor", original: "codeudor" });
  assertEquals(rolDeEquifax("GARANTE").rol, "garante");
  assertEquals(rolDeEquifax("Avalista").rol, "otro");
  assertEquals(rolDeEquifax(null), { rol: "otro", original: null });
});

Deno.test("«Actual», «-6 Meses» y «+12 Meses» pasan a meses", () => {
  assertEquals(retroactivoEnMeses("Actual"), 0);
  assertEquals(retroactivoEnMeses("-6 Meses"), -6);
  assertEquals(retroactivoEnMeses("-12 Meses"), -12);
  assertEquals(retroactivoEnMeses("+12 Meses"), 12);
  assertEquals(retroactivoEnMeses("pronto"), null);
});

Deno.test("NovaCredit se reconoce escrita de las dos maneras y no se confunde con otra empresa", () => {
  assert(esNovaCredit("NOVACREDIT S. A."));
  assert(esNovaCredit("NOVACREDIT S.A."));
  assert(esNovaCredit("Novacredit"));
  assertFalse(esNovaCredit("UNINOVA-COMPAÑIA DE SERVICIOS AUXILIARES S.A."));
  assertFalse(esNovaCredit("BANCO DE GUAYAQUIL S.A."));
  assertFalse(esNovaCredit(null));
});

Deno.test("las siglas de los sistemas: el resumen de Equifax las trae dentro de un nombre largo", () => {
  assertEquals(sistemaDeLaSigla("Sistema Financiero Regulado SB"), "bancos");
  assertEquals(sistemaDeLaSigla("Entidades Reguladas SEPS"), "cooperativas");
  assertEquals(sistemaDeLaSigla("Sector Comercial SICOM"), "comercial");
  assertEquals(sistemaDeLaSigla("SB"), "bancos");
  assertEquals(sistemaDeLaSigla("SFNR"), null);
});

Deno.test("texto y números: lo vacío es null y un texto con número se lee", () => {
  assertEquals(texto("  BANCO   DE  PRUEBA "), "BANCO DE PRUEBA");
  assertEquals(texto(""), null);
  assertEquals(texto(5), null);
  assertEquals(entero("12"), 12);
  assertEquals(entero(null), null);
  assertEquals(entero("abc"), null);
});

Deno.test("la respuesta inventada se descompone en las 12 tablas, con las filas esperadas", () => {
  const r = derivarTablas(respuestaDePrueba());
  assertEquals(r.version, EQUIFAX_TABLAS_VERSION);
  assertEquals(r.avisos, []);
  const n = (t: keyof typeof r.tablas) => r.tablas[t].length;
  assertEquals(n("equifax_operaciones"), 5, "3 de bancos + 0 de cooperativas + 2 del comercial");
  assertEquals(n("equifax_historia_mensual"), 5, "4 de bancos + 0 + 1 del comercial");
  assertEquals(n("equifax_deuda_por_sistema_y_mes"), 3 + 1 + 3, "resumen + deuda histórica + evolución");
  assertEquals(n("equifax_vencimientos"), 1 + 1 + 1);
  assertEquals(n("equifax_tarjetas"), 3, "2 vigentes y 1 cancelada");
  assertEquals(n("equifax_creditos"), 3 + 1, "3 otorgados y 1 cancelado");
  assertEquals(n("equifax_consultas_recibidas"), 5, "una por cada X, sin la fila del encabezado");
  assertEquals(n("equifax_scores"), 3 + 3);
  assertEquals(n("equifax_indicadores_por_periodo"), 3 + 5 + 3 + 3 + 3 + 3 + 3 + 3);
  assertEquals(n("equifax_codeudor_garante"), 1);
  assertEquals(n("equifax_resumen"), 1);
  assertEquals(n("equifax_analisis_credito"), 1);
});

Deno.test("toda fila lleva exactamente las columnas de su tabla, ni una más ni una menos", () => {
  const r = derivarTablas(respuestaDePrueba());
  for (const [tabla, filas] of Object.entries(r.tablas)) {
    const columnas = columnasDeLaTabla(tabla as keyof typeof ESPECIFICACION_DE_TABLAS).sort();
    for (const fila of filas) assertEquals(Object.keys(fila).sort(), columnas, tabla);
  }
});

Deno.test("las filas de cada tabla salen numeradas 1, 2, 3... (el orden es la clave junto a la consulta)", () => {
  const r = derivarTablas(respuestaDePrueba());
  for (const [tabla, filas] of Object.entries(r.tablas) as Array<[string, Array<{ orden: number | null }>]>) {
    if (tabla === "equifax_resumen" || tabla === "equifax_analisis_credito") continue; // sin `orden`: una sola fila
    assertEquals(filas.map((f) => f.orden), filas.map((_, i) => i + 1), tabla);
  }
});

Deno.test("derivar dos veces la misma respuesta da exactamente lo mismo", () => {
  assertEquals(JSON.stringify(derivarTablas(respuestaDePrueba())), JSON.stringify(derivarTablas(respuestaDePrueba())));
});

Deno.test("las operaciones: rol normalizado, fechas ISO y el original conservado", () => {
  const ops = derivarTablas(respuestaDePrueba()).tablas.equifax_operaciones;
  assertEquals(ops.map((o) => o.rol), ["titular", "titular", "codeudor", "titular", "garante"]);
  assertEquals(ops[1].rol_original, "Titular", "se guarda también lo que dijo Equifax");
  assertEquals(ops[0].sistema, "bancos");
  assertEquals(ops[3].sistema, "comercial");
  assertEquals(ops[0].fecha_corte, "2026-08-31");
  assertEquals(ops[0].fecha_apertura, "2024-01-15");
  assertEquals(ops[0].fecha_vencimiento, "2027-01-15");
  assertEquals(ops[0].saldo_deuda_usd, 4000);
  assertEquals(ops[0].dias_morosidad, 45);
  assertEquals(ops[4].fecha_vencimiento, null, "una fecha que no vino es null, no una fecha inventada");
  assertEquals(ops[3].fecha_corte, "2026-10-06", "el comercial trae cortes de otros meses y se respetan");
});

Deno.test("la historia mensual trae cada mes con su corte ISO, sin cuota", () => {
  const h = derivarTablas(respuestaDePrueba()).tablas.equifax_historia_mensual;
  assertEquals(h.filter((f) => f.sistema === "bancos").map((f) => f.fecha_corte), ["2026-06-30", "2026-07-31", "2026-08-31", "2026-08-31"]);
  assertFalse("cuota_mensual_usd" in h[0]);
});

Deno.test("el resumen de Equifax, la deuda histórica y la evolución comparten tabla y dicen de cuál vienen", () => {
  const filas = derivarTablas(respuestaDePrueba()).tablas.equifax_deuda_por_sistema_y_mes;
  const resumen = filas.filter((f) => f.origen === "resumen_actual");
  assertEquals(resumen.map((f) => [f.sistema, f.saldo_deuda_usd]), [["bancos", 4500], ["cooperativas", 0], ["comercial", 999]]);
  assertEquals(resumen[0].fecha_corte, null, "el resumen no trae fecha");
  const historica = filas.find((f) => f.origen === "deuda_historica");
  assertEquals(historica?.vencido_1_a_2_meses_usd, 300);
  assertEquals(historica?.vencido_24_a_36_meses_usd, 0, "el vencido_24 de Equifax");
  const evolucion = filas.filter((f) => f.origen === "evolucion");
  assertEquals(evolucion.map((f) => f.fecha_corte), ["2026-08-31", "2026-07-31", "2026-08-31"], "también la fecha con seis decimales");
  assertEquals(evolucion[0].vencido_usd, 300);
});

Deno.test("las consultas recibidas: el encabezado da los meses y las X, las entidades", () => {
  const r = derivarTablas(respuestaDePrueba());
  const c = r.tablas.equifax_consultas_recibidas;
  assertEquals(c.map((f) => [f.entidad, f.mes, f.es_novacredit]), [
    ["NOVACREDIT S. A.", "2026-10-01", true],
    ["NOVACREDIT S. A.", "2026-09-01", true],
    ["BANCO DE PRUEBA UNO S.A.", "2026-09-01", false],
    ["FINANCIERA DE PRUEBA", "2026-06-01", false],
    ["FINANCIERA DE PRUEBA", "2025-11-01", false],
  ]);
  const resumen = r.tablas.equifax_resumen[0];
  assertEquals([resumen.consultas_recibidas_mes_final, resumen.consultas_recibidas_mes_inicial], ["2026-10-01", "2025-11-01"]);
});

Deno.test("las tarjetas: vigentes con su cupo y la cancelada sin su número", () => {
  const t = derivarTablas(respuestaDePrueba()).tablas.equifax_tarjetas;
  assertEquals(t.map((f) => f.estado), ["vigente", "vigente", "cancelada"]);
  assertEquals(t[0].cupo_usd, 2000);
  assertEquals(t[0].saldo_promedio_6_meses_usd, 800);
  assertEquals(t[2].fecha_cancelacion, "2024-08-30");
});

Deno.test("los indicadores: «Actual», «-6 Meses» y las proyecciones pasan a meses, y el perfil de riesgo conserva su texto", () => {
  const i = derivarTablas(respuestaDePrueba()).tablas.equifax_indicadores_por_periodo;
  const cuota = i.filter((f) => f.origen === "historico_cuota_estimada");
  assertEquals(cuota.map((f) => [f.retroactivo_meses, f.valor_numero]), [[-12, 180], [-6, 190], [0, 200], [6, 210], [12, 220]]);
  const plazo = i.find((f) => f.origen === "identificador_perfil_riesgo_directo" && f.indicador === "mayor_plazo_vencido");
  assertEquals(plazo?.valor_texto, "De 1 a 2 meses");
  assertEquals(plazo?.valor_numero, null);
  const valor = i.find((f) => f.origen === "identificador_perfil_riesgo_directo" && f.indicador === "mayor_valor_vencido");
  assertEquals(valor?.valor_numero, 300.5);
  const vacio = i.find((f) => f.origen === "identificador_perfil_riesgo_directo_6_meses" && f.indicador === "mayor_plazo_vencido");
  assertEquals(vacio?.valor_texto, null, "un valor vacío es null");
});

Deno.test("el resumen: las cifras de una sola fila, y los protestos que no se midieron quedan null", () => {
  const r = derivarTablas(respuestaDePrueba()).tablas.equifax_resumen[0];
  assertEquals(r.impagos_numero, 1);
  assertEquals(r.morosidades_numero, 1);
  assertEquals(r.protestos_numero, null, "viene siempre vacío: no medido, no cero");
  assertEquals(r.cuota_estimada_mensual_usd, 270);
  assertEquals(r.inhabilitaciones_numero, 0);
  assertEquals(r.primer_credito_fecha, "2012-05-01");
  assertEquals(r.factores_meses_desde_el_primer_credito, 172);
  assertEquals(r.sri_tiene_ruc, true);
  assertEquals(r.sri_estado_contribuyente, "ACTIVO");
  assertEquals(r.sri_obligado_a_contabilidad, false);
  assertEquals(r.sujetos_al_dia_numero, 1, "sólo cuántos: la institución trae el teléfono de la persona");
  assertEquals(r.impacto_economico_indicador, 3);
  assertEquals(r.estado_de_cartera_codigo, 17);
  assertEquals(r.ingreso_estimado_usd, 1500.5);
});

Deno.test("NINGÚN dato personal llega a las tablas, ni el de terceros ni los números de operación y tarjeta", () => {
  const todo = JSON.stringify(derivarTablas(respuestaDePrueba()));
  for (const personal of PERSONALES_DE_PRUEBA) assertFalse(todo.includes(personal), `se coló: ${personal.slice(0, 4)}…`);
});

Deno.test("lo de interconnectResponse no se suma: su deuda no entra a las operaciones", () => {
  const ops = derivarTablas(respuestaDePrueba()).tablas.equifax_operaciones;
  assertFalse(ops.some((o) => o.saldo_deuda_usd === 777777));
  assertEquals(ops.length, 5);
});

Deno.test("una fila de totales o sin institución se omite y se avisa; nunca en silencio", () => {
  const base = respuestaDePrueba();
  const rc = base.reporteCrediticio as Record<string, unknown[]>;
  const r = derivarTablas(respuestaDePrueba({
    reporteCrediticio: {
      detalle_deuda_actual_sb: [
        ...rc.detalle_deuda_actual_sb,
        { institucion: "TOTAL", tipo_riesgo: "TOTAL", tipo_credito: "TOTAL", saldo_deuda: 99999, fecha_corte: "31/08/2026" },
        { institucion: "", tipo_riesgo: "TITULAR", tipo_credito: "Consumo", saldo_deuda: 5, fecha_corte: "31/08/2026" },
        { institucion: "-", tipo_riesgo: "TITULAR", tipo_credito: "Consumo", saldo_deuda: 5, fecha_corte: "31/08/2026" },
      ],
    },
  }));
  assertEquals(r.tablas.equifax_operaciones.length, 5);
  assertEquals(r.avisos.length, 1);
  assert(r.avisos[0].includes("detalle_deuda_actual_sb") && r.avisos[0].includes("3"));
});

Deno.test("una fila de la historia sin fecha de corte se omite y se avisa", () => {
  const rc = respuestaDePrueba().reporteCrediticio as Record<string, unknown[]>;
  const r = derivarTablas(respuestaDePrueba({
    reporteCrediticio: { detalle_deuda_historica_sb: [...rc.detalle_deuda_historica_sb, { institucion: "BANCO DE PRUEBA UNO", fecha_corte: "no es fecha", tipo_riesgo: "TITULAR" }] },
  }));
  assertEquals(r.tablas.equifax_historia_mensual.filter((f) => f.sistema === "bancos").length, 4);
  assert(r.avisos.some((a) => a.includes("detalle_deuda_historica_sb")));
});

Deno.test("una lista que no vino (null) no es una lista vacía (0)", () => {
  const rc = respuestaDePrueba().reporteCrediticio as Record<string, unknown>;
  const sinSeps = { ...rc } as Record<string, unknown>;
  delete sinSeps.detalle_deuda_actual_seps;
  const r = derivarTablas({ ...respuestaDePrueba(), reporteCrediticio: sinSeps });
  assertEquals(r.cobertura["detalle_deuda_actual_seps"], null);
  assertEquals(r.cobertura["detalle_deuda_actual_sb"], 3);
  assertEquals(derivarTablas(respuestaDePrueba()).cobertura["detalle_deuda_actual_seps"], 0, "vino, y vacía");
});

Deno.test("sin la fila de encabezado de las entidades no se inventan meses: no hay filas y se avisa", () => {
  const entidades = (respuestaDePrueba().reporteCrediticio as Record<string, Array<Record<string, unknown>>>).entidades_consultados;
  const r = derivarTablas(respuestaDePrueba({ reporteCrediticio: { entidades_consultados: entidades.slice(1) } }));
  assertEquals(r.tablas.equifax_consultas_recibidas.length, 0);
  assert(r.avisos.some((a) => a.includes("entidades_consultados")));
  assertEquals(r.tablas.equifax_resumen[0].consultas_recibidas_mes_final, null);
});

Deno.test("una respuesta sin reporteCrediticio o que no es un objeto no rompe: tablas vacías y un aviso", () => {
  for (const cuerpo of [null, undefined, "texto", 5, [], {}, { reporteCrediticio: "x" }]) {
    const r = derivarTablas(cuerpo);
    assertEquals(r.tablas.equifax_operaciones.length, 0);
    assertEquals(r.tablas.equifax_resumen.length, 1);
    assert(r.avisos.length >= 1);
  }
});

Deno.test("la especificación de las tablas no repite columnas y todas son nombres de columna válidos", () => {
  // Que las filas derivadas traigan exactamente estas columnas se prueba arriba; acá, que la lista misma
  // está bien armada (es la que scripts/cargar-tablas-equifax.mjs compara con la base).
  for (const [tabla, columnas] of Object.entries(ESPECIFICACION_DE_TABLAS)) {
    const nombres = Object.keys(columnas);
    assertEquals(new Set(nombres).size, nombres.length, tabla);
    assert(nombres.every((c) => /^[a-z][a-z0-9_]*$/.test(c)), tabla);
  }
  assertThrows(() => columnasDeLaTabla("no_existe" as never));
});

Deno.test("el análisis de crédito: las diez variables del predictor y las tres fechas de concesión, con montos a centavos", () => {
  const r = derivarTablas(respuestaDePrueba());
  assertEquals(r.version, "equifax-tablas-v3");
  assertEquals(r.cobertura["AnalisisCreditoSectorFinanciero"], 1);
  assertEquals(r.tablas.equifax_analisis_credito, [{
    mayor_credito_aprobado_monto_usd: 12000, mayor_credito_aprobado_fecha_concesion: "2024-03-15",
    mayor_credito_reciente_monto_usd: 5000.46, mayor_credito_reciente_fecha_concesion: "2026-02-10",
    mayor_credito_actual_monto_usd: 8000, mayor_credito_actual_fecha_concesion: "2026-09-05",
    deuda_total_adeudada_usd: 6500.5, instituciones_con_deuda_numero: 3,
    creditos_aprobados_numero: 7, creditos_aprobados_valor_usd: 43000, saldos_vigentes_usd: 6400.25,
    deuda_actual_usd: 6500.5, deuda_hace_3_meses_usd: 7100,
  }]);
});

Deno.test("el análisis de crédito no lleva la entidad ni los campos que no son de las diez variables", () => {
  const fila = derivarTablas(respuestaDePrueba()).tablas.equifax_analisis_credito[0];
  const texto = JSON.stringify(fila);
  assertFalse(texto.includes("BANCO DE PRUEBA UNO"));
  assertFalse(texto.includes("999999"), "la deuda de CMAADeudaTotal no es una de las diez variables");
});

Deno.test("sin el bloque no hay fila (y la cobertura dice null); con el bloque vacío, una fila de nulos", () => {
  const sin = derivarTablas(respuestaDePrueba({ interconnectResponse: { AnalisisCreditoSectorFinanciero: undefined } }));
  assertEquals(sin.tablas.equifax_analisis_credito, []);
  assertEquals(sin.cobertura["AnalisisCreditoSectorFinanciero"], null);
  const vacio = derivarTablas(respuestaDePrueba({ interconnectResponse: { AnalisisCreditoSectorFinanciero: {} } }));
  assertEquals(vacio.cobertura["AnalisisCreditoSectorFinanciero"], 1);
  assertEquals(vacio.tablas.equifax_analisis_credito.length, 1);
  assert(Object.values(vacio.tablas.equifax_analisis_credito[0]).every((v) => v === null));
});

Deno.test("un bloque que no es un objeto no se inventa: sin fila y con aviso", () => {
  const r = derivarTablas(respuestaDePrueba({ interconnectResponse: { AnalisisCreditoSectorFinanciero: "no" } }));
  assertEquals(r.tablas.equifax_analisis_credito, []);
  assert(r.avisos.some((a) => a.startsWith("AnalisisCreditoSectorFinanciero")));
});
