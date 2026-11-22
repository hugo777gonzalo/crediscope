// F11: la renta como cota (3b) y el predictor de ingresos dentro de la escalera (peldaños 4 y 6). Perfiles inventados.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals } from "jsr:@std/assert@1";
import { baseImponibleDesdeRenta, impuestoDeLaBase } from "./base-imponible-desde-renta.ts";
import { datosDeCapacidad, evaluarEscalera } from "./capacidad-de-pago.ts";
import { armarIngresoDelPerfil, type OpcionesDelIngreso } from "./escalera-del-ingreso.ts";
import { armarEstimacion, decidirEstimacion, type ModeloVigente, type RespuestaDeEstimacion } from "./estimacion-de-ingreso.ts";
import { FORMATO_DE_ARBOLES, type ModeloExportado, prepararModelo } from "./predictor-ingresos.ts";
import { VARIABLES_DEL_NIVEL_1 } from "./variables-de-ingreso.ts";

type Perfil = Record<string, any>; // deno-lint-ignore-line no-explicit-any

const NIVELES = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95];
const CONSULTA = "2026-10-15T17:00:00Z";
const AHORA = new Date("2026-10-30T12:00:00Z");
const CONDICIONES = { monto: 3500, plazoMeses: 36, tasaNominalAnualPorcentaje: 15 };

// Un modelo de una hoja por cuantil: el mínimo certificado (cuantil 0,10) es `base`.
function modelo(base: number): ModeloVigente {
  const archivo: ModeloExportado = {
    formato: FORMATO_DE_ARBOLES, version: "ingreso-prueba", nivel: 1, entrenado_el: "2026-10-29", cuantiles: NIVELES, arboles_por_cuantil: 1,
    variables: VARIABLES_DEL_NIVEL_1.map((nombre) =>
      nombre === "genero" ? { nombre, tipo: "categorica" as const, categorias: ["FEMENINO", "MASCULINO"] }
      : nombre === "sri_estado" ? { nombre, tipo: "categorica" as const, categorias: ["ACTIVO", "SUSPENDIDO"] }
      : { nombre, tipo: "numerica" as const }
    ),
    arboles: NIVELES.map((_, k) => -1 - k),
    nodos: { variable: [], umbral: [], categorica: [], falta: [], falta_izquierda: [], izquierda: [], derecha: [] },
    conjuntos: [],
    hojas: NIVELES.map((_, k) => base * (1 + 0.1 * (k - 1))).map(Math.log),
  };
  return { id: "22222222-2222-4222-8222-222222222222", poblacion: "solicitantes de crédito", calibracion: null, modelo: prepararModelo(archivo) };
}

const sueldo = (monto: number) => ({ evidencia: "reportada_por_tercero", naturaleza: "privado", montoMensualReportado: monto, vigenteAlCorte: true });
const aportePropio = (monto: number) => ({ evidencia: "autodeclarada_sobre_minimo", naturaleza: "cuenta_propia", montoMensualReportado: monto, vigenteAlCorte: true });

function perfil(segmento: string, fuentes: Array<Record<string, unknown>> = [], extra: { renta?: unknown[]; ruc?: boolean } = {}): Perfil {
  return {
    cedula: "0000000001",
    identidad: { nombreCompleto: "PERSONA INVENTADA", edad: 41, genero: "FEMENINO" },
    laboral: { tieneRucActivo: extra.ruc ?? false, obligadoALlevarContabilidadRuc: false, estadoActividadEconomica: "activa_sin_interrupciones", fechaInicioActividadesRuc: "2015-03-10" },
    comportamientoBancario: {
      saldoTotalVigente: 0, saldoEnMoraBuroCredito: 0, saldoNoDevengaIntereses: 0, deudaEnAtraso: 0, operacionesEnAtrasoSinMonto: 0, tieneOperacionCastigada: false,
      tieneOperacionConDemanda: false, totalDeudaRetail: 0, diasMoraMaximaRetail: 0, valorVencidoRetail: 0, tieneCreditoIessBiess: false, diasMoraCreditoIessBiess: 0,
    },
    comportamientoCooperativas: { numeroOperaciones: 0, diasMoraMaxima: 0, saldoEnMora: 0, tieneOperacionConDemanda: false, tieneOperacionCastigada: false, cuotaMensualTotal: 0 },
    riesgoJudicialCivil: {},
    fuentesIngreso: { segmento, corteIessUsado: "2026-08", fuentes, detalle: { impuestoRentaPorAnio: extra.renta ?? [] } },
    metaConsulta: { fuentesConDatos: ["contribuyente"], fuentesSinDatos: [], fuentesNoMedidas: [] },
  };
}

const estimar = (p: Perfil, base = 1200, estado?: Record<string, string>): RespuestaDeEstimacion =>
  armarEstimacion({ id: "11111111-1111-4111-8111-111111111111", perfil: p, decision: decidirEstimacion(p, estado), consultadoEl: CONSULTA, ahora: AHORA, vigente: modelo(base) }).respuesta;

function evaluar(p: Perfil, opciones: OpcionesDelIngreso = {}, extra: Parameters<typeof evaluarEscalera>[0] extends infer E ? Partial<E> : never = {}) {
  const datos = datosDeCapacidad(p, null);
  const ingreso = armarIngresoDelPerfil(p, datos, opciones);
  return { datos, ingreso, resultado: evaluarEscalera({ datos, ingreso, condiciones: CONDICIONES, ...extra }) };
}

// ---------------------------------------------------------------- el predictor: peldaños 4 y 6

Deno.test("el peldaño 4 según los motivos de decidirEstimacion()", () => {
  const completo = { general: "ok", basesInternas: "ok", contribuyente: "ok_vacio" };
  const casos: Array<[string, Perfil, Record<string, string> | undefined, string, string | null]> = [
    ["un dependiente con sueldo no se estima", perfil("dependiente_privado", [sueldo(1000)]), undefined, "no_aplica", "ingreso_verificado"],
    ["un dependiente sin sueldo", perfil("dependiente_privado"), undefined, "no_aplica", "dependiente_sin_monto"],
    ["un jubilado: sin la tabla de pensiones", perfil("jubilado"), undefined, "no_aplica", "jubilado"],
    ["sin datos: la fuente de los aportes no contestó", perfil("sin_datos"), undefined, "no_medido", "sin_datos"],
    ["consulta incompleta: falta la identidad", perfil("independiente"), { ...completo, general: "error" }, "no_medido", "consulta_incompleta"],
    ["consulta incompleta: faltan los aportes", perfil("informal_o_sin_actividad"), { ...completo, basesInternas: "faltante" }, "no_medido", "consulta_incompleta"],
    ["un independiente se estima: el mínimo pasa de 1.000", perfil("independiente", [], { ruc: true }), completo, "con_monto", null],
  ];
  for (const [nombre, p, estado, estadoEsperado, motivo] of casos) {
    const { ingreso } = evaluar(p, { estimacion: estimar(p, 1200, estado) });
    const p4 = ingreso.peldanos[3];
    assertEquals([nombre, p4.estado, p4.motivo], [nombre, estadoEsperado, motivo]);
  }
});

Deno.test("sin pedir el predictor el 4 queda sin medir; sin estimación guardada, también", () => {
  const p = perfil("independiente", [], { ruc: true });
  assertEquals(evaluar(p).ingreso.peldanos[3].motivo, "predictor_sin_conectar");
  assertEquals(evaluar(p, { estimacion: null }).ingreso.peldanos[3].motivo, "sin_estimacion");
});

Deno.test("con USD 1.000 o menos el mínimo baja al peldaño 6 y no entra a nada", () => {
  const p = perfil("independiente", [aportePropio(700)], { ruc: true });
  const sinPredictor = evaluar(p, { ingresoDeclarado: 1400 });
  const alto = evaluar(p, { estimacion: estimar(p, 1000), ingresoDeclarado: 1400 });
  const [p4, , , , , p6] = [alto.ingreso.peldanos[3], 0, 0, 0, 0, alto.ingreso.peldanos[5]];
  assertEquals([p4.estado, p4.motivo], ["sin_monto", "minimo_no_pasa_de_1000"]);
  assertEquals([p6.estado, p6.montoMensual], ["con_monto", 1000]);
  assertEquals(p6.componentes[0].avisos, ["referencia_de_solicitantes"]);
  // El 6 nunca cuenta para la coherencia ni para la capacidad: todo igual que sin predictor.
  assertEquals(alto.ingreso.peldanos[4].coherencia, "sin_respaldo");
  assertEquals(alto.ingreso.peldanos[4].coherencia, sinPredictor.ingreso.peldanos[4].coherencia);
  assert(!alto.resultado.ingreso.escalera.some((c) => (c.numero as number) === 6));
  assertEquals(alto.resultado.ingreso.capacidadMaxima?.ingreso, sinPredictor.resultado.ingreso.capacidadMaxima?.ingreso);
  assertEquals(alto.resultado.ingreso.sostieneElCalculo, sinPredictor.resultado.ingreso.sostieneElCalculo);
});

Deno.test("el 4 con 0% no sostiene ni cambia lo que sostienen los peldaños 1 a 3", () => {
  const casos: Perfil[] = [
    perfil("independiente", [aportePropio(900)], { ruc: true }),
    perfil("independiente", [], { ruc: true }),
    perfil("ingresos_mixtos", [sueldo(900), aportePropio(500)], { ruc: true }),
  ];
  for (const p of casos) {
    const sin = evaluar(p);
    const con = evaluar(p, { estimacion: estimar(p, 1500) });
    assertEquals(con.ingreso.peldanos[3].estado, "con_monto");
    const fila4 = con.resultado.ingreso.escalera.find((c) => c.numero === 4)!;
    assertEquals([fila4.fraccionAceptada, fila4.veredicto, fila4.ingresoAceptado], [0, "no_sostiene", 0]);
    // Sin declarado, nada cambia: ni el veredicto, ni quién sostiene, ni la oferta, ni la sensibilidad.
    assertEquals(con.resultado.veredicto, sin.resultado.veredicto);
    assertEquals(con.resultado.ingreso.sostieneElCalculo, sin.resultado.ingreso.sostieneElCalculo);
    assertEquals(con.resultado.ingreso.oferta, sin.resultado.ingreso.oferta);
    assertEquals(con.resultado.ingreso.sensibilidad, sin.resultado.ingreso.sensibilidad);
    assertEquals(con.resultado.ingreso.escalera.filter((c) => c.numero !== 4 && !c.hipotetico), sin.resultado.ingreso.escalera.filter((c) => !c.hipotetico));
  }
});

Deno.test("el 4 sostiene sólo si el estándar le acepta una fracción mayor que cero", () => {
  const p = perfil("independiente", [], { ruc: true });
  const sin = evaluar(p, { estimacion: estimar(p, 3000) });
  assertEquals(sin.resultado.ingreso.sostieneElCalculo, null);
  const con = evaluar(p, { estimacion: estimar(p, 3000) }, { fracciones: { minimo_certificado: 1 } });
  assertEquals(con.resultado.ingreso.sostieneElCalculo?.numero, 4);
  assertEquals(con.resultado.ingreso.sostieneElCalculo?.ingresoAceptado, 3000);
  assert(con.resultado.ingreso.explicacion.startsWith("Alcanza con el mínimo certificado (USD 3.000, estimado)."));
});

Deno.test("el mínimo certificado, aunque no sostenga, cuenta para la coherencia de lo declarado", () => {
  const p = perfil("independiente", [aportePropio(700)], { ruc: true });
  // 1.700 pasa de 1,5 × 700 pero no de 1,5 × 1.200 = 1.800.
  assertEquals(evaluar(p, { ingresoDeclarado: 1700 }).ingreso.peldanos[4].coherencia, "sin_respaldo");
  const con = evaluar(p, { estimacion: estimar(p, 1200), ingresoDeclarado: 1700 });
  assertEquals(con.ingreso.peldanos[4].coherencia, "coherente");
  assertEquals(con.resultado.ingreso.escalera.find((c) => c.numero === 5)?.ingresoAceptado, 1190);
});

Deno.test("la capacidad máxima suma la estimación del predictor (el mínimo certificado) y no cambia el veredicto", () => {
  const p = perfil("independiente", [aportePropio(500)], { ruc: true });
  const sin = evaluar(p);
  const con = evaluar(p, { estimacion: estimar(p, 2000) });
  assertEquals(con.resultado.veredicto, sin.resultado.veredicto);
  const cm = con.resultado.ingreso.capacidadMaxima!;
  assertEquals([cm.peldano, cm.componente, cm.ingreso], ["minimo_certificado", "predictor", 2000]);
  assert(cm.avisos.includes("El mayor ingreso no está verificado."));
  assert((cm.montoMaximoAlPlazo ?? 0) > (sin.resultado.ingreso.capacidadMaxima?.montoMaximoAlPlazo ?? 0));
  assert((cm.mejoraDelMontoMaximo ?? 0) > 0);
  // El peldaño 2 hipotético con el mínimo certificado como si se documentara.
  assertEquals(con.resultado.ingreso.mejora?.evidencia, "declaracion_de_iva");
});

// ---------------------------------------------------------------- la renta: 3b

const renta = (anio: number, causado: number, enRelacionDeDependencia: number | null = null) => ({ anio, formulario: "102", causado, enRelacionDeDependencia });

Deno.test("la renta es una cota: la base del impuesto causado del último año, dividida en 12", () => {
  const p = perfil("independiente", [], { ruc: true, renta: [renta(2025, 1200), renta(2024, 400)] });
  const { ingreso, resultado } = evaluar(p);
  const b = baseImponibleDesdeRenta(1200, 2025);
  assert(b.estado === "ok");
  const comp = ingreso.peldanos[2].componentes.find((c) => c.clave === "impuesto_a_la_renta")!;
  assertEquals([comp.montoMensual, comp.creaEspacio, comp.aFecha, comp.avisos], [b.mensualDesde, true, "2025", ["regimen_sin_verificar"]]);
  // Crea espacio: el 3 sostiene con ella.
  assertEquals(ingreso.peldanos[2].montoQueCreaEspacio, b.mensualDesde);
  assertEquals(resultado.ingreso.escalera.find((c) => c.numero === 3)?.ingresoAceptado, b.mensualDesde);
});

Deno.test("no entra con la cuota fija, con un año viejo ni sin año fiscal con tabla", () => {
  assertEquals(evaluar(perfil("independiente", [], { ruc: true, renta: [renta(2025, 60)] })).ingreso.peldanos[2].estado, "sin_monto");
  assertEquals(evaluar(perfil("independiente", [], { ruc: true, renta: [renta(2025, 100)] })).ingreso.peldanos[2].estado, "sin_monto");
  assertEquals(evaluar(perfil("independiente", [], { ruc: true, renta: [renta(2022, 5000)] })).ingreso.peldanos[2].estado, "sin_monto");
  // Una renta con impuesto de cero sólo dice que no pasó de la fracción exenta: no es cota.
  assertEquals(evaluar(perfil("independiente", [], { ruc: true, renta: [renta(2025, 0)] })).ingreso.peldanos[2].estado, "sin_monto");
});

Deno.test("un RIMPE emprendedor: la base despejada queda por debajo de su ingreso, así que sigue siendo cota", () => {
  // Emprendedor con USD 50.000 de ingresos brutos: USD 60 más 1% del exceso sobre 20.000 (SRI, www.sri.gob.ec/en/rimpe, consultada el 2026-11-12).
  const impuestoRimpe = 60 + 0.01 * (50_000 - 20_000);
  const b = baseImponibleDesdeRenta(impuestoRimpe, 2025);
  assert(b.estado === "ok");
  assert(b.hasta < 50_000, "la base despejada con la tabla general queda por debajo del ingreso bruto");
  // Y de punta a punta, con buró que dice RIMPE: entra con su aviso.
  const p = perfil("independiente", [], { ruc: true, renta: [renta(2025, impuestoRimpe)] });
  const estructura = { deudaActualTitular: { bancos: { cuotaMensualUsd: 0, saldoDeudaUsd: 0 }, cooperativas: null, comercial: null }, moraActual: { saldoVencidoUsd: 0 }, actividadEconomica: { claseDeContribuyente: "RIMPE" } };
  const datos = datosDeCapacidad(p, estructura);
  const ingreso = armarIngresoDelPerfil(p, datos, { estructuraEquifax: estructura });
  const comp = ingreso.peldanos[2].componentes.find((c) => c.clave === "impuesto_a_la_renta")!;
  assertEquals(comp.avisos, ["regimen_rimpe_base_por_debajo_del_ingreso"]);
  assert(comp.montoMensual * 12 < 50_000);
  // Con el parámetro apagado el RIMPE no da cota, como dice baseImponibleDesdeRenta().
  const sin = armarIngresoDelPerfil(p, datos, { estructuraEquifax: estructura, parametros: { rentaDelRimpeEsCota: false } });
  assertEquals(sin.peldanos[2].estado, "sin_monto");
  assertEquals(sin.peldanos[2].motivo, "renta_del_rimpe_no_es_cota");
});

Deno.test("la cuota fija del negocio popular (USD 60) queda debajo del umbral aunque la persona sea RIMPE", () => {
  for (const cuotaFija of [0, 30, 60]) {
    const p = perfil("independiente", [], { ruc: true, renta: [renta(2025, cuotaFija)] });
    assertEquals(evaluar(p).ingreso.peldanos[2].estado, "sin_monto");
  }
});

Deno.test("la renta con buró de régimen general se marca como verificada", () => {
  const p = perfil("independiente", [], { ruc: true, renta: [renta(2025, 2000)] });
  const estructura = { deudaActualTitular: { bancos: { cuotaMensualUsd: 0, saldoDeudaUsd: 0 }, cooperativas: null, comercial: null }, moraActual: { saldoVencidoUsd: 0 }, actividadEconomica: { claseDeContribuyente: "PERSONA NATURAL" } };
  const datos = datosDeCapacidad(p, estructura);
  const comp = armarIngresoDelPerfil(p, datos, { estructuraEquifax: estructura }).peldanos[2].componentes.find((c) => c.clave === "impuesto_a_la_renta")!;
  assertEquals(comp.avisos, []);
});

Deno.test("para un dependiente, la base de la renta no se suma al sueldo: si lo supera, es la prueba de un ingreso extra", () => {
  const p = perfil("dependiente_privado", [sueldo(900)], { renta: [renta(2025, 3000)] });
  const { ingreso, resultado } = evaluar(p);
  const b = baseImponibleDesdeRenta(3000, 2025);
  assert(b.estado === "ok");
  assertEquals(ingreso.peldanos[0].ingresoNeto, 814.95);
  assertEquals(ingreso.peldanos[2].montoMensual, b.mensualDesde);
  assert(ingreso.diferencias.some((d) => d.clave === "cota_supera_lo_verificado"));
  // Sostiene el 1 si alcanza; el 3 se mide por separado, nunca como sueldo más renta.
  assert(resultado.ingreso.escalera.filter((c) => !c.hipotetico).every((c) => (c.ingresoAceptado ?? 0) <= Math.max(814.95, b.mensualDesde) + 0.005));
});

Deno.test("renta y aporte propio se combinan por máximo en el 3", () => {
  const p = perfil("independiente", [aportePropio(700)], { ruc: true, renta: [renta(2025, 1200)] });
  const b = baseImponibleDesdeRenta(1200, 2025);
  assert(b.estado === "ok");
  const p3 = armarIngresoDelPerfil(p, datosDeCapacidad(p, null)).peldanos[2];
  assertEquals(p3.montoMensual, Math.max(700, b.mensualDesde));
  assertEquals(p3.montoQueCreaEspacio, Math.max(700, b.mensualDesde));
  // El círculo cierra: el impuesto de esa base es el causado.
  assertEquals(impuestoDeLaBase(b.desde, 2025), 1200);
});
