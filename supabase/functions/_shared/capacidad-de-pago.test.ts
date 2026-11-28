// La capacidad de pago con cuentas hechas a mano, y de dónde salen el ingreso
// y las cuotas de una persona. Los perfiles son inventados: el repositorio es
// público.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assert, assertAlmostEquals, assertThrows } from "jsr:@std/assert@1";
import {
  conIngresoDeclarado, cuotaHipotecariaComoEquifax, cuotaPorAnualidad, cuotaPorFactorDeSaldo, FACTOR_CUOTA_HIPOTECARIO, TRAMOS_FACTOR_CUOTA, CAPACIDAD_VERSION,
  datosDeCapacidad, saldoDespuesDePagos, TASA_ANUAL_BIESS, TASA_DE_LA_CUOTA_DE_EQUIFAX, tasaDelContratoHipotecario, elBuroTraeDetalle, evaluarCapacidad,
  cuotaQuirografariaComoEquifax, TASA_DE_LA_CUOTA_DE_EQUIFAX_QUIROGRAFARIO,
} from "./capacidad-de-pago.ts";
import { montoMaximoParaCuota, simularCredito } from "./simulador-credito.ts";
import { perfilDePrueba } from "./perfil-de-prueba.ts";

const sueldo = (montoMensual: number) => ({ concepto: "Sueldo", montoMensual, tipo: "sueldo" as const, origen: "IESS" });

Deno.test("sueldo de 1.000: neto 905,50, tope de 362,20 y lo que queda para la cuota nueva", () => {
  const c = evaluarCapacidad({
    ingresos: [sueldo(1000)],
    obligaciones: [{ concepto: "Cooperativas", montoMensual: 150, origen: "Equifax" }],
    deudasSinCuota: [],
    cuotaNueva: 100,
  });
  assertEquals(c.aportePersonal, 94.5);
  assertEquals(c.ingresoNeto, 905.5);
  // 40% de 905,50 = 362,20; menos 150 que ya paga.
  assertEquals(c.cuotaMaximaAdmisible, 212.2);
  assertEquals(c.holgura, 112.2);
  assertEquals(c.disponibleDespues, 655.5);
  assertAlmostEquals(c.cargaConElCredito as number, 250 / 905.5, 1e-12);
  assertEquals(c.veredicto, "alcanza");
});

Deno.test("el veredicto cambia en el tope y en el margen de cinco puntos", () => {
  const con = (cuotaNueva: number) => evaluarCapacidad({ ingresos: [sueldo(1000)], obligaciones: [], deudasSinCuota: [], cuotaNueva }).veredicto;
  // Tope: 362,20. Justo desde 35% de 905,50 = 316,93.
  assertEquals(con(300), "alcanza");
  assertEquals(con(330), "justo");
  assertEquals(con(362.2), "justo");
  assertEquals(con(362.21), "no_alcanza");
});

Deno.test("cumple es sí con alcanza y justo, no con no_alcanza, y nulo sin ingreso (no es un rechazo)", () => {
  const con = (cuotaNueva: number, ingresos = [sueldo(1000)]) => evaluarCapacidad({ ingresos, obligaciones: [], deudasSinCuota: [], cuotaNueva });
  // Tope de 362,20; «justo» desde 316,93 (ver la prueba de arriba).
  assertEquals([con(300).veredicto, con(300).cumple], ["alcanza", true]);
  assertEquals([con(362.2).veredicto, con(362.2).cumple], ["justo", true]);
  assertEquals([con(362.21).veredicto, con(362.21).cumple], ["no_alcanza", false]);
  assertEquals([con(100, []).veredicto, con(100, []).cumple], ["sin_ingreso", null]);
});

Deno.test("al aporte propio no se le descuenta el aporte personal", () => {
  const c = evaluarCapacidad({
    ingresos: [{ concepto: "Aporte propio", montoMensual: 800, tipo: "aporte_propio", origen: "IESS" }],
    obligaciones: [],
    deudasSinCuota: [],
    cuotaNueva: 50,
  });
  assertEquals(c.aportePersonal, 0);
  assertEquals(c.ingresoNeto, 800);
});

Deno.test("sin ingreso no hay carga que medir, y se dice", () => {
  const c = evaluarCapacidad({ ingresos: [], obligaciones: [{ concepto: "Bancos", montoMensual: 200, origen: "Equifax" }], deudasSinCuota: [], cuotaNueva: 100 });
  assertEquals(c.veredicto, "sin_ingreso");
  assertEquals(c.cargaConElCredito, null);
  assertEquals(c.cuotaMaximaAdmisible, 0);
  assert(c.avisos.some((a) => a.includes("No hay un ingreso")));
});

Deno.test("una deuda sin cuota no se cuenta como cero: queda marcada", () => {
  const c = evaluarCapacidad({
    ingresos: [sueldo(1000)],
    obligaciones: [],
    deudasSinCuota: [{ concepto: "Casas comerciales", saldo: 640.5, origen: "Proveedor_Info_1" }],
    cuotaNueva: 100,
  });
  assertEquals(c.obligacionesIncompletas, true);
  assertEquals(c.obligacionesActuales, 0);
  assert(c.avisos.some((a) => a.includes("sin cuota informada")));
});

Deno.test("la carga máxima es de la institución", () => {
  const c = evaluarCapacidad({ ingresos: [sueldo(1000)], obligaciones: [], deudasSinCuota: [], cuotaNueva: 300, parametros: { cargaMaxima: 0.3 } });
  assertEquals(c.cargaMaxima, 0.3);
  assertEquals(c.cuotaMaximaAdmisible, 271.65);
  assertEquals(c.veredicto, "no_alcanza");
});

Deno.test("sin buró: el sueldo del IESS, la cuota de cooperativas y los bancos y casas comerciales sin cuota", () => {
  const d = datosDeCapacidad(perfilDePrueba(), null);
  assertEquals(d.fuenteDeLasCuotas, "proveedor_info_1");
  assertEquals(d.ingresos, [{ concepto: "Sueldo reportado al IESS · Empleador privado", montoMensual: 1200, tipo: "sueldo", origen: "IESS" }]);
  assertEquals(d.obligaciones[0], { concepto: "Cooperativas", montoMensual: 145.35, origen: "Proveedor_Info_1" });
  // Los bancos sin cuota entran con el factor de su tramo (5.510,65 en 3 operaciones: 1.837 por operación, 6,5%); las casas comerciales siguen sin contar.
  assertEquals(d.obligaciones[1], { concepto: "Bancos (cuota estimada)", montoMensual: 358.19, origen: "Proveedor_Info_1", estimada: true, metodoDeEstimacion: "factor_saldo" });
  assert(!d.obligaciones.some((x) => x.concepto.includes("Casas comerciales")));
  assertEquals(d.deudasSinCuota.map((x) => x.concepto), ["Bancos", "Casas comerciales", "Préstamo del IESS o BIESS"]);
  assertEquals(d.deudasSinCuota[0].saldo, 5510.65);
});

Deno.test("con Equifax: las cuotas del titular por sistema, y lo de codeudor no entra", () => {
  const estructura = {
    deudaActualTitular: {
      bancos: { cuotaMensualUsd: 310.4 },
      cooperativas: { cuotaMensualUsd: 0 },
      comercial: { cuotaMensualUsd: 42 },
      total: { cuotaMensualUsd: 352.4 },
    },
    deudaCodeudorGarante: { total: { cuotaMensualUsd: 500 } },
  };
  const d = datosDeCapacidad(perfilDePrueba(), estructura);
  assertEquals(d.fuenteDeLasCuotas, "equifax");
  assertEquals(d.obligaciones, [
    { concepto: "Bancos", montoMensual: 310.4, origen: "Equifax" },
    { concepto: "Sector comercial", montoMensual: 42, origen: "Equifax" },
  ]);
  // Los bancos ya tienen cuota (con el BIESS adentro); las casas comerciales siguen sin ella.
  assertEquals(d.deudasSinCuota.map((x) => x.concepto), ["Casas comerciales"]);
});

Deno.test("la pensión alimenticia que paga es una cuota más; una fuente que ya no está vigente no es ingreso", () => {
  const perfil = perfilDePrueba() as Record<string, any>;
  perfil.riesgoJudicialCivil.valorMensualPensiones = 180;
  perfil.fuentesIngreso.fuentes.push({ evidencia: "reportada_por_tercero", naturaleza: "publico", montoMensualReportado: 900, vigenteAlCorte: false });
  const d = datosDeCapacidad(perfil, null);
  assert(d.obligaciones.some((o) => o.concepto === "Pensión alimenticia que paga" && o.montoMensual === 180));
  assertEquals(d.ingresos.length, 1);
});

Deno.test("un aporte propio sobre el SBU se marca: no muestra el ingreso", () => {
  const perfil = perfilDePrueba() as Record<string, any>;
  perfil.fuentesIngreso.fuentes = [{ evidencia: "autodeclarada_en_minimo", naturaleza: "cuenta_propia", montoMensualReportado: 482, vigenteAlCorte: true }];
  const d = datosDeCapacidad(perfil, null);
  assertEquals(d.ingresos[0].esIngresoMinimoSbu, true);
  const c = evaluarCapacidad({ ...d, cuotaNueva: 50 });
  assertEquals(c.ingresoSoloSbu, true);
});

Deno.test("el monto máximo es el más alto cuya cuota no pasa el tope", () => {
  const condiciones = { plazoMeses: 36, tasaNominalAnualPorcentaje: 15 };
  const monto = montoMaximoParaCuota(351.65, condiciones) as number;
  const cuota = (m: number) => {
    const r = simularCredito({ ...condiciones, monto: m });
    if (!r.ok) throw new Error(r.errores.join(" "));
    return r.simulacion.cuotaPrimerMes;
  };
  assert(cuota(monto) <= 351.65);
  assert(cuota(monto + 0.01) > 351.65);
  // 10.000 al 15% en 36 meses da 351,65 con el seguro. Con el redondeo al
  // centavo, 10.000,04 todavía da esa misma cuota: el máximo es ése.
  assertAlmostEquals(monto, 10000, 0.1);
  assertEquals(montoMaximoParaCuota(0, condiciones), 0);
  assertEquals(montoMaximoParaCuota(100, { plazoMeses: 0, tasaNominalAnualPorcentaje: 15 }), null);
});

Deno.test("el Ingreso declarado reemplaza al del IESS, sin descontarle el aporte, y se rotula sin verificar", () => {
  const iess = datosDeCapacidad(perfilDePrueba(), null);
  const d = conIngresoDeclarado(iess, 2500);
  assertEquals(d.ingresos, [{ concepto: "Ingreso declarado", montoMensual: 2500, tipo: "declarado", origen: "La persona" }]);
  // Las cuotas y las deudas sin cuota no cambian.
  assertEquals(d.obligaciones, iess.obligaciones);
  assertEquals(d.deudasSinCuota, iess.deudasSinCuota);
  const c = evaluarCapacidad({ ...d, cuotaNueva: 300 });
  assertEquals(c.aportePersonal, 0);
  assertEquals(c.ingresoNeto, 2500);
  assertEquals(c.ingresoDeclarado, true);
  // 40% de 2.500 = 1.000, menos todas las cuotas (las estimadas incluidas; la del BIESS depende de la fecha).
  const cuotas = d.obligaciones.reduce((a, x) => a + x.montoMensual, 0);
  assertAlmostEquals(c.cuotaMaximaAdmisible, 1000 - cuotas, 0.01);
  assert(d.obligaciones.some((x) => x.concepto === "Bancos (cuota estimada)"));
  assert(c.avisos.some((a) => a.includes("declara la persona")));
});

Deno.test("sin un Ingreso declarado válido, los datos quedan como estaban", () => {
  const iess = datosDeCapacidad(perfilDePrueba(), null);
  for (const monto of [null, undefined, 0, -100, Number.NaN]) assertEquals(conIngresoDeclarado(iess, monto), iess);
  assertEquals(evaluarCapacidad({ ...iess, cuotaNueva: 100 }).ingresoDeclarado, false);
});

// --- Revisión del 2026-10-18 -------------------------------------------------

const aporte = (montoMensual: number) => ({ concepto: "Aporte propio", montoMensual, tipo: "aporte_propio" as const, origen: "IESS" });
const oblig = (montoMensual: number) => ({ concepto: "Cuota", montoMensual, origen: "Equifax" });

Deno.test("el veredicto y la holgura nunca se contradicen: en el tope alcanza, un centavo más no", () => {
  // Con el veredicto calculado sobre fracciones de coma flotante, 451 de 400.000
  // casos al azar salían «justo» con una holgura de -0,01. Los tres primeros son
  // de esos casos (carga de 0,35).
  const casos: Array<[number, number, number]> = [[3922.69, 0.35, 112.58], [1825.73, 0.35, 141.34], [1977.69, 0.35, 268.94]];
  let semilla = 12345;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 3000; k++) {
    const sueldoMensual = Math.round(azar() * 500000) / 100;
    casos.push([sueldoMensual, [0.4, 0.35, 0.3, 0.45, 0.33][k % 5], Math.round(azar() * sueldoMensual * 20) / 100]);
  }
  for (const [sueldoMensual, cargaMaxima, obligacion] of casos) {
    const base = { ingresos: [sueldo(sueldoMensual)], obligaciones: [oblig(obligacion)], deudasSinCuota: [], parametros: { cargaMaxima } };
    const maxima = evaluarCapacidad({ ...base, cuotaNueva: 0 }).cuotaMaximaAdmisible;
    const caso = `${sueldoMensual} ${cargaMaxima} ${obligacion}`;
    const enElTope = evaluarCapacidad({ ...base, cuotaNueva: maxima });
    assertEquals(enElTope.holgura, 0, caso);
    assert(enElTope.veredicto !== "no_alcanza", caso);
    const encima = evaluarCapacidad({ ...base, cuotaNueva: Math.round((maxima + 0.01) * 100) / 100 });
    assertEquals(encima.veredicto, "no_alcanza", caso);
    assert(encima.holgura < 0, caso);
  }
});

Deno.test("el margen de «justo» corta en el centavo: 35% de 905,50 es 316,925", () => {
  const con = (cuotaNueva: number) => evaluarCapacidad({ ingresos: [sueldo(1000)], obligaciones: [], deudasSinCuota: [], cuotaNueva }).veredicto;
  assertEquals(con(316.92), "alcanza");
  assertEquals(con(316.93), "justo");
  // Un margen de cero: «justo» no existe y el tope es el único corte.
  const sinMargen = (cuotaNueva: number) => evaluarCapacidad({ ingresos: [sueldo(1000)], obligaciones: [], deudasSinCuota: [], cuotaNueva, parametros: { margenJusto: 0 } }).veredicto;
  assertEquals(sinMargen(362.2), "alcanza");
  assertEquals(sinMargen(362.21), "no_alcanza");
});

Deno.test("si las cuotas actuales ya pasan el tope, no alcanza aunque la cuota nueva sea cero, y la holgura lo dice", () => {
  const c = evaluarCapacidad({ ingresos: [sueldo(1000)], obligaciones: [oblig(400)], deudasSinCuota: [], cuotaNueva: 0 });
  assertEquals(c.veredicto, "no_alcanza");
  assertEquals(c.cuotaMaximaAdmisible, 0);
  // 40% de 905,50 = 362,20: ya paga 37,80 de más.
  assertEquals(c.holgura, -37.8);
});

Deno.test("una cuota nueva que no es número se rechaza: nunca «alcanza» por no saber", () => {
  const base = { ingresos: [sueldo(1000)], obligaciones: [], deudasSinCuota: [] };
  for (const cuotaNueva of [Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number, "100" as unknown as number]) {
    assertThrows(() => evaluarCapacidad({ ...base, cuotaNueva }), RangeError, "cuota nueva");
  }
  // Una cuota negativa no libera ingreso: cuenta como cero.
  assertEquals(evaluarCapacidad({ ...base, cuotaNueva: -50 }).cuotaNueva, 0);
});

Deno.test("los parámetros: ausentes valen lo del sistema; los que no son una fracción se rechazan", () => {
  const base = { ingresos: [sueldo(1000)], obligaciones: [], deudasSinCuota: [], cuotaNueva: 100 };
  assertEquals(evaluarCapacidad({ ...base, parametros: { cargaMaxima: undefined } }).cuotaMaximaAdmisible, 362.2);
  for (const parametros of [{ cargaMaxima: Number.NaN }, { cargaMaxima: 40 }, { cargaMaxima: -0.1 }, { margenJusto: 2 }, { aportePersonalIess: Number.POSITIVE_INFINITY }]) {
    assertThrows(() => evaluarCapacidad({ ...base, parametros }), RangeError, "fracción");
  }
  // Los extremos de la fracción son válidos: con cero no alcanza nada.
  assertEquals(evaluarCapacidad({ ...base, parametros: { cargaMaxima: 0 } }).veredicto, "no_alcanza");
  assertEquals(evaluarCapacidad({ ...base, parametros: { aportePersonalIess: 0 } }).ingresoNeto, 1000);
});

Deno.test("entradas raras: listas vacías o ausentes, elementos nulos o con montos que no son número", () => {
  const vacia = evaluarCapacidad({ ingresos: [], obligaciones: [], deudasSinCuota: [], cuotaNueva: 100 });
  assertEquals(vacia.veredicto, "sin_ingreso");
  assertEquals(vacia.obligacionesIncompletas, false);
  const sinListas = evaluarCapacidad({ cuotaNueva: 100 } as unknown as Parameters<typeof evaluarCapacidad>[0]);
  assertEquals(sinListas.veredicto, "sin_ingreso");

  // Un ingreso nulo, negativo o NaN no es ingreso (se descarta: es lo prudente).
  const ingresosRaros = [null, sueldo(-500), sueldo(Number.NaN), sueldo(0), sueldo(1000)] as unknown as ReturnType<typeof sueldo>[];
  assertEquals(evaluarCapacidad({ ingresos: ingresosRaros, obligaciones: [], deudasSinCuota: [], cuotaNueva: 100 }).ingresoReportado, 1000);

  // Una cuota sin un monto válido NO se cuenta como cero sin decirlo.
  const raras = [null, oblig(Number.NaN), oblig(-30), { concepto: "x", montoMensual: "150", origen: "y" }, oblig(120)] as unknown as ReturnType<typeof oblig>[];
  const c = evaluarCapacidad({ ingresos: [sueldo(1000)], obligaciones: raras, deudasSinCuota: [], cuotaNueva: 100 });
  assertEquals(c.obligacionesActuales, 120);
  assertEquals(c.obligacionesIncompletas, true);
  assert(c.avisos.some((a) => a.includes("sin un monto válido")));
  // Una cuota de cero sí es un monto válido.
  assertEquals(evaluarCapacidad({ ingresos: [sueldo(1000)], obligaciones: [oblig(0)], deudasSinCuota: [], cuotaNueva: 100 }).obligacionesIncompletas, false);
});

Deno.test("el aporte personal se descuenta sólo del sueldo, también cuando hay aporte propio al lado", () => {
  const c = evaluarCapacidad({ ingresos: [sueldo(1000), aporte(500)], obligaciones: [], deudasSinCuota: [], cuotaNueva: 100 });
  assertEquals(c.ingresoReportado, 1500);
  assertEquals(c.aportePersonal, 94.5);
  assertEquals(c.ingresoNeto, 1405.5);
  // Dos sueldos: cada uno con su aporte, y lo que se muestra suma.
  const dos = evaluarCapacidad({ ingresos: [sueldo(333.33), sueldo(666.67)], obligaciones: [], deudasSinCuota: [], cuotaNueva: 100 });
  assertEquals(dos.aportePersonal, 31.5 + 63);
});

Deno.test("una deuda sin cuota no cuenta como cero tampoco cuando no tiene saldo; la cuota máxima no la descuenta", () => {
  const c = evaluarCapacidad({
    ingresos: [sueldo(1000)],
    obligaciones: [],
    deudasSinCuota: [{ concepto: "Préstamo del IESS o BIESS", saldo: null, origen: "Proveedor_Info_1" }],
    cuotaNueva: 100,
  });
  assertEquals(c.obligacionesIncompletas, true);
  assertEquals(c.cuotaMaximaAdmisible, 362.2);
  assert(c.avisos.some((a) => a.includes("sin cuota informada")));
});

Deno.test("el Ingreso declarado: se ignora un monto con fracciones de centavo mal puestas y no se le descuenta nada", () => {
  const datos = conIngresoDeclarado(datosDeCapacidad(null, null), 1800.456);
  assertEquals(datos.ingresos, [{ concepto: "Ingreso declarado", montoMensual: 1800.46, tipo: "declarado", origen: "La persona" }]);
  const c = evaluarCapacidad({ ...datos, cuotaNueva: 100 });
  assertEquals(c.aportePersonal, 0);
  assertEquals(c.ingresoNeto, 1800.46);
  // Un declarado menor a medio centavo no es un ingreso: el del IESS se queda.
  const iess = datosDeCapacidad(perfilDePrueba(), null);
  assertEquals(conIngresoDeclarado(iess, 0.004), iess);
});

Deno.test("datosDeCapacidad: perfiles sin fuentesIngreso, con la forma vieja o con basura no rompen y no inventan ingreso", () => {
  for (const perfil of [null, {}, { fuentesIngreso: null }, { fuentesIngreso: { fuentes: "no" } }, { fuentesIngreso: { fuentes: [null, 5, "x", {}] } }, { fuentesIngreso: { detalle: [{ monto: 900 }] } }]) {
    const d = datosDeCapacidad(perfil as Record<string, unknown> | null, null);
    assertEquals(d.ingresos, [], JSON.stringify(perfil));
    assertEquals(d.obligaciones, [], JSON.stringify(perfil));
    assertEquals(d.deudasSinCuota, [], JSON.stringify(perfil));
    assertEquals(d.fuenteDeLasCuotas, "proveedor_info_1");
  }
  // Fuentes indirectas, sin monto o en cero no son ingreso.
  const sinMonto = { fuentesIngreso: { fuentes: [{ evidencia: "indirecta", montoMensualReportado: null }, { evidencia: "reportada_por_tercero", montoMensualReportado: 0 }] } };
  assertEquals(datosDeCapacidad(sinMonto, null).ingresos, []);
});

Deno.test("una respuesta de Equifax sin reporte de crédito no es «no debe»: se sigue con Proveedor_Info_1", () => {
  // La forma que deja una respuesta «completed» sin reporteCrediticio.
  const sinReporte = {
    deudaActualTitular: {
      bancos: null,
      cooperativas: null,
      comercial: null,
      total: { numeroDeOperaciones: 0, saldoDeudaUsd: 0, cuotaMensualUsd: 0 },
    },
  };
  assertEquals(elBuroTraeDetalle(sinReporte), false);
  assertEquals(elBuroTraeDetalle(null), false);
  assertEquals(elBuroTraeDetalle({ deudaActualTitular: { bancos: { cuotaMensualUsd: 0 } } }), true);

  const datos = datosDeCapacidad(perfilDePrueba(), sinReporte);
  assertEquals(datos.fuenteDeLasCuotas, "proveedor_info_1");
});

Deno.test("datosDeCapacidad con Equifax: una estructura sin deuda del titular no es Equifax; con saldo y sin cuota, es una deuda sin cuota", () => {
  // {} o sin deudaActualTitular: no hay estructura que usar, se sigue con Proveedor_Info_1.
  assertEquals(datosDeCapacidad(perfilDePrueba(), {}).fuenteDeLasCuotas, "proveedor_info_1");
  assertEquals(datosDeCapacidad(perfilDePrueba(), { deudaActualTitular: null }).fuenteDeLasCuotas, "proveedor_info_1");

  const estructura = {
    deudaActualTitular: {
      bancos: { saldoDeudaUsd: 8200, cuotaMensualUsd: 0 },
      cooperativas: { saldoDeudaUsd: 0, cuotaMensualUsd: 0 },
      comercial: { saldoDeudaUsd: 300, cuotaMensualUsd: 25 },
    },
  };
  const d = datosDeCapacidad(perfilDePrueba(), estructura);
  assertEquals(d.fuenteDeLasCuotas, "equifax");
  // Los bancos de Equifax tienen saldo y cuota cero: no se cuentan como cero, se estiman (C1).
  assertEquals(d.obligaciones, [
    { concepto: "Bancos (cuota estimada)", montoMensual: 508.4, origen: "Equifax", estimada: true, metodoDeEstimacion: "factor_saldo" },
    { concepto: "Sector comercial", montoMensual: 25, origen: "Equifax" },
  ]);
  assertEquals(d.deudasSinCuota[0], { concepto: "Bancos", saldo: 8200, origen: "Equifax", cuotaEstimada: 508.4 });
  // Con Equifax no se mezclan los bancos de Proveedor_Info_1.
  assert(!d.deudasSinCuota.some((x) => x.origen === "Proveedor_Info_1" && x.concepto === "Bancos"));
  const c = evaluarCapacidad({ ...d, cuotaNueva: 100 });
  assertEquals(c.obligacionesIncompletas, true);
});

Deno.test("una fuente que no contestó se dice: no es una persona sin deudas", () => {
  const perfil = perfilDePrueba() as Record<string, any>;
  perfil.metaConsulta.fuentesNoMedidas = ["buroCreditoSuper", "retails", "pensionAlimenticia", "inversiones"];
  const sinBuro = datosDeCapacidad(perfil, null);
  assertEquals(sinBuro.fuentesSinConsultar, ["buró de bancos", "casas comerciales", "pensiones alimenticias"]);
  const c = evaluarCapacidad({ ...sinBuro, cuotaNueva: 100 });
  assertEquals(c.obligacionesIncompletas, true);
  assert(c.avisos.some((a) => a.includes("No se pudo consultar: buró de bancos, casas comerciales, pensiones alimenticias")));
  // Con Equifax, los bancos salen de ahí y su fuente de Proveedor_Info_1 no importa.
  const conBuro = datosDeCapacidad(perfil, { deudaActualTitular: { bancos: { cuotaMensualUsd: 100 } } });
  assertEquals(conBuro.fuentesSinConsultar, ["casas comerciales", "pensiones alimenticias"]);
  // Diners: 61 de 2.566 personas perdían una deuda y la capacidad no lo decía.
  perfil.metaConsulta.fuentesNoMedidas = ["buroCreditoDiners"];
  assertEquals(datosDeCapacidad(perfil, null).fuentesSinConsultar, ["tarjetas Diners"]);
  assertEquals(datosDeCapacidad(perfil, { deudaActualTitular: { bancos: { cuotaMensualUsd: 100 } } }).fuentesSinConsultar, []);
  // Y con todo contestado no hay nada que avisar.
  assertEquals(datosDeCapacidad(perfilDePrueba(), null).fuentesSinConsultar, []);
  assertEquals(evaluarCapacidad({ ...datosDeCapacidad(perfilDePrueba(), null), cuotaNueva: 100 }).avisos.some((a) => a.includes("No se pudo consultar")), false);
});

// ---- El BIESS: el buró de Proveedor_Info_1 no lo trae y el de Equifax sí ----

const HOY = new Date(Date.UTC(2026, 10, 17));
const conBiess = (operaciones: unknown[] | undefined) => {
  const perfil = perfilDePrueba() as Record<string, any>;
  perfil.comportamientoBancario.saldoPrestamosIessBiess = 10000;
  if (operaciones) perfil.comportamientoBancario.operacionesIessBiess = operaciones;
  return perfil;
};

Deno.test("sin buró: el BIESS lleva su saldo y una cuota estimada por anualidad con el plazo que queda", () => {
  const perfil = conBiess([{ tipo: "quirografario", saldo: 10000, fechaFin: "2028-11-17" }]);
  const d = datosDeCapacidad(perfil, null, HOY);
  // Un perfil sin fuente ni corte del saldo: el saldo se toma como el del corte de Equifax (dos meses antes de HOY) y se calcula al 11,0% con los
  // meses de calendario que quedan hasta el fin: de septiembre de 2026 a noviembre de 2028, 26.
  const esperada = cuotaPorAnualidad(10000, TASA_DE_LA_CUOTA_DE_EQUIFAX_QUIROGRAFARIO, 26);
  const o = d.obligaciones.find((x) => x.concepto.startsWith("Préstamo del IESS o BIESS"));
  assert(o && o.estimada === true);
  assertAlmostEquals(o.montoMensual, esperada, 0.01);
  assertAlmostEquals(esperada, 434.02, 0.05);
  assertEquals(d.deudasSinCuota.some((x) => x.concepto === "Préstamo del IESS o BIESS"), false);
  const c = evaluarCapacidad({ ...d, cuotaNueva: 100 });
  assert(c.avisos.some((a) => a.includes("cuotas estimadas")));
  assertAlmostEquals(c.obligacionesActuales, 145.35 + 358.19 + esperada, 0.01);
});

Deno.test("sin buró: un BIESS sin fecha de fin queda como deuda sin cuota, con su saldo", () => {
  const d = datosDeCapacidad(conBiess([{ tipo: "quirografario", saldo: 10000, fechaFin: null }]), null, HOY);
  const linea = d.deudasSinCuota.find((x) => x.concepto.startsWith("Préstamo del IESS o BIESS"));
  assertEquals(linea?.saldo, 10000);
  // Un perfil anterior a estructura-v22 no trae las operaciones: el saldo total, sin cuota.
  const viejo = datosDeCapacidad(conBiess(undefined), null, HOY);
  assertEquals(viejo.deudasSinCuota.find((x) => x.concepto === "Préstamo del IESS o BIESS")?.saldo, 10000);
});

Deno.test("sin buró: el hipotecario usa la anualidad al 9,0% de Equifax y una operación sin fecha no esconde a la que sí la tiene", () => {
  // Un perfil anterior a estructura-v33 no trae la fuente ni el corte del saldo: se toma como el de hoy.
  const d = datosDeCapacidad(
    conBiess([
      { tipo: "hipotecario", saldo: 40000, fechaFin: "2046-11-17" },
      { tipo: "quirografario", saldo: 3000, fechaFin: null },
    ]),
    null,
    HOY,
  );
  const o = d.obligaciones.find((x) => x.metodoDeEstimacion === "anualidad");
  assertAlmostEquals(o!.montoMensual, cuotaPorAnualidad(40000, TASA_DE_LA_CUOTA_DE_EQUIFAX, 240), 0.01);
  assertEquals(d.deudasSinCuota.find((x) => x.concepto === "Préstamo del IESS o BIESS")?.saldo, 3000);
});

// ---- El hipotecario como lo informa Equifax (2026-11-27): el saldo llevado a hoy, al 9,0% ----
// Los valores esperados salieron de research/hipotecario-cuota/regla-equifax.mjs (la definición que se midió contra
// la cuota de Equifax) con las mismas entradas, y la fórmula del saldo se repite acá en forma cerrada.

const hipotecario = (extra: Record<string, unknown>) => ({ tipo: "hipotecario", saldo: 84000, fechaFin: "2048-07-24", monto: 90000, fechaConcesion: "2023-07-24", tasaAnual: null, cuotaEstimada: null, fuenteDelSaldo: "prestamos", fechaCorte: "2026-02-01", ...extra });

Deno.test("hipotecario: el saldo de la fuente de préstamos se lleva de su corte a hoy con el plan del contrato y se calcula al 9,0%", () => {
  const r = cuotaHipotecariaComoEquifax(hipotecario({}), HOY)!;
  assertEquals(r.camino, "saldo_llevado_a_hoy");
  assertAlmostEquals(r.cuota, 724.92, 0.02);
  // En forma cerrada: el saldo de febrero (fin de mes) amortizado en 269 cuotas a 6,99%, 9 pagos después, con 260 meses por delante.
  const i = 0.0699 / 12;
  const saldoDeHoy = (84000 * (Math.pow(1 + i, 269) - Math.pow(1 + i, 9))) / (Math.pow(1 + i, 269) - 1);
  assertAlmostEquals(saldoDespuesDePagos(84000, 0.0699, 269, 9), saldoDeHoy, 0.001);
  assertAlmostEquals(r.cuota, cuotaPorAnualidad(saldoDeHoy, 0.09, 260), 0.01);
  // Llevarlo a hoy baja la cuota contra tomar el saldo de febrero como si fuera de hoy.
  assert(r.cuota < cuotaPorAnualidad(84000, 0.09, 260));
  // La tasa declarada de la base interna manda sobre la de la tabla, pero pesa poco: 8,69% en vez de 6,99% suma centavos.
  assertAlmostEquals(cuotaHipotecariaComoEquifax(hipotecario({ tasaAnual: 0.0869 }), HOY)!.cuota, 727.12, 0.02);
  // Con el saldo del mismo mes del corte no hay nada que llevar.
  const alCorte = cuotaHipotecariaComoEquifax(hipotecario({}), new Date(Date.UTC(2026, 1, 28)))!;
  assertAlmostEquals(alCorte.cuota, cuotaPorAnualidad(84000, 0.09, Math.round((Date.UTC(2048, 6, 24) - Date.UTC(2026, 1, 28)) / 86_400_000 / 30.4375)), 0.01);
});

Deno.test("hipotecario: sólo en la base interna usa su cuota estimada tal cual, sin tocar su saldo viejo", () => {
  const base = hipotecario({ saldo: 30000, fechaFin: "2035-05-31", monto: 40000, fechaConcesion: "2015-06-01", tasaAnual: 0.1027, cuotaEstimada: 410.55, fuenteDelSaldo: "base_interna", fechaCorte: null });
  const r = cuotaHipotecariaComoEquifax(base, HOY)!;
  assertEquals(r.camino, "cuota_de_la_base_interna");
  assertEquals(r.cuota, 410.55);
  // Sin la cuota estimada, el plan del contrato desde el monto y la concesión; el saldo de la base (una foto vieja) no entra.
  const sinCuota = hipotecario({ saldo: 45000, fechaFin: "2037-03-10", monto: 50000, fechaConcesion: "2017-03-10", fuenteDelSaldo: "base_interna", fechaCorte: null });
  const p = cuotaHipotecariaComoEquifax(sinCuota, HOY)!;
  assertEquals(p.camino, "plan_del_contrato");
  assertAlmostEquals(p.cuota, 445.99, 0.02);
  assertEquals(cuotaHipotecariaComoEquifax({ ...sinCuota, saldo: 90000 }, HOY)!.cuota, p.cuota);
  // Sin monto ni concesión no hay con qué: el factor hipotecario.
  assertEquals(cuotaHipotecariaComoEquifax({ ...sinCuota, monto: null, fechaConcesion: null }, HOY), null);
});

Deno.test("hipotecario: con el fin pasado y saldo, la cuota del contrato; sin fin o sin contrato, el factor hipotecario", () => {
  const vencido = hipotecario({ saldo: 12000, fechaFin: "2026-05-31", monto: 20000, fechaConcesion: "2016-05-31" });
  const r = cuotaHipotecariaComoEquifax(vencido, HOY)!;
  assertEquals(r.camino, "cuota_del_contrato_vencido");
  assertAlmostEquals(r.cuota, cuotaPorAnualidad(20000, 0.0869, 120), 0.01);
  assertAlmostEquals(r.cuota, 250.01, 0.02);
  // Con un tope: un saldo de USD 40 no paga por mes la cuota de un contrato de 250.
  assertEquals(cuotaHipotecariaComoEquifax({ ...vencido, saldo: 40 }, HOY)!.cuota, 40);
  assertEquals(cuotaHipotecariaComoEquifax({ ...vencido, monto: null }, HOY), null);
  assertEquals(cuotaHipotecariaComoEquifax(hipotecario({ fechaFin: null }), HOY), null);
  assertEquals(cuotaHipotecariaComoEquifax(hipotecario({ saldo: 0 }), HOY), null);
  const d = datosDeCapacidad(conBiess([hipotecario({ saldo: 60000, fechaFin: null })]), null, HOY);
  assertEquals(d.obligaciones.find((x) => x.concepto.includes("BIESS"))?.montoMensual, 642);
});

// ---- El quirografario como lo informa Equifax (2026-11-28): el saldo del corte llevado al corte de Equifax, al 11,0% con meses de calendario ----

const quirografario = (extra: Record<string, unknown>) => ({
  tipo: "quirografario", saldo: 3000, fechaFin: "2028-03-10", monto: 5000, fechaConcesion: "2024-03-10", tasaAnual: null, cuotaEstimada: null,
  fuenteDelSaldo: "prestamos", fechaCorte: "2025-02-01", ...extra,
});

Deno.test("quirografario: el saldo de la fuente de préstamos se lleva al corte de Equifax (dos meses antes) y se calcula al 11,0% con meses de calendario", () => {
  const r = cuotaQuirografariaComoEquifax(quirografario({}), HOY)!;
  assertEquals(r.camino, "saldo_llevado_a_hoy");
  // La fecha de corte de la fuente dice 2025-02-01 y su saldo es del cierre de febrero de 2026 (se le suma un año): de ahí a septiembre de 2026
  // (el corte que Equifax informaría el 17 de noviembre) son 7 pagos de un plan de 25 cuotas al 6,5%, y quedan 18 meses al 11,0%.
  const i = 0.065 / 12;
  const saldoAlCorte = (3000 * (Math.pow(1 + i, 25) - Math.pow(1 + i, 7))) / (Math.pow(1 + i, 25) - 1);
  assertAlmostEquals(saldoDespuesDePagos(3000, 0.065, 25, 7), saldoAlCorte, 0.001);
  assertAlmostEquals(r.cuota, cuotaPorAnualidad(saldoAlCorte, 0.11, 18), 0.01);
  assertAlmostEquals(r.cuota, 133.17, 0.02);
  // Sin llevarlo al corte daría 181,56: el saldo de febrero con 18 meses por delante sobreestima.
  assert(r.cuota < cuotaPorAnualidad(3000, 0.11, 18));
  // La tasa del plan casi no pesa: con otra tasa (la de Equifax) sale lo mismo en centavos de dólar.
  assertAlmostEquals(r.cuota, 133.17, 1);
});

Deno.test("quirografario: si la fuente corrige su fecha de corte se usa la que trae, y sin fecha el saldo es el del corte de Equifax", () => {
  // Con la fecha ya correcta (2026-02-01) sumarle un año caería en el futuro: se usa la que trae, y da lo mismo.
  assertAlmostEquals(cuotaQuirografariaComoEquifax(quirografario({ fechaCorte: "2026-02-01" }), HOY)!.cuota, 133.17, 0.02);
  // Sin fecha de corte no hay con qué llevarlo: se toma como el del corte de Equifax.
  assertAlmostEquals(cuotaQuirografariaComoEquifax(quirografario({ fechaCorte: null }), HOY)!.cuota, 181.56, 0.02);
});

Deno.test("quirografario: con el fin pasado al corte de Equifax la cuota es 0 y no deja ninguna deuda sin cuota", () => {
  const vencido = quirografario({ fechaFin: "2026-06-10" });
  assertEquals(cuotaQuirografariaComoEquifax(vencido, HOY), { cuota: 0, camino: "ya_se_pago" });
  // Un fin cercano todavía cuenta: octubre de 2026 es el mes siguiente al corte (septiembre).
  assert(cuotaQuirografariaComoEquifax(quirografario({ fechaFin: "2026-10-10" }), HOY)!.cuota > 0);
  const d = datosDeCapacidad(conBiess([vencido]), null, HOY);
  assertEquals(d.obligaciones.some((x) => x.concepto.includes("BIESS")), false);
  assertEquals(d.deudasSinCuota.some((x) => x.concepto.includes("BIESS")), false);
});

Deno.test("quirografario: la base interna y el que no trae fecha de fin siguen como antes", () => {
  assertEquals(cuotaQuirografariaComoEquifax(quirografario({ fuenteDelSaldo: "base_interna", fechaCorte: null }), HOY), null);
  assertEquals(cuotaQuirografariaComoEquifax(quirografario({ fechaFin: null }), HOY), null);
  assertEquals(cuotaQuirografariaComoEquifax(quirografario({ saldo: 0 }), HOY), null);
  const d = datosDeCapacidad(conBiess([quirografario({ fuenteDelSaldo: "base_interna", fechaCorte: null, saldo: 10000, fechaFin: "2028-11-17" })]), null, HOY);
  assertAlmostEquals(d.obligaciones.find((x) => x.concepto.includes("BIESS"))!.montoMensual, cuotaPorAnualidad(10000, TASA_ANUAL_BIESS.quirografario, 24), 0.01);
  const sinFin = datosDeCapacidad(conBiess([quirografario({ fechaFin: null, saldo: 10000 })]), null, HOY);
  assertEquals(sinFin.obligaciones.find((x) => x.concepto.includes("BIESS"))?.montoMensual, 620);
});

Deno.test("hipotecario: la tabla de tasas cambia en 2020 y está por confirmar con el BIESS", () => {
  assertEquals(tasaDelContratoHipotecario(2019), 0.0869);
  assertEquals(tasaDelContratoHipotecario(2020), 0.0699);
  assertEquals(tasaDelContratoHipotecario(null), 0.0699);
  assertEquals(TASA_ANUAL_BIESS, { quirografario: 0.065 });
});

Deno.test("hipotecario: la línea del BIESS suma todas las operaciones, cada una con su regla, y sin buró es una sola obligación estimada", () => {
  const d = datosDeCapacidad(
    conBiess([
      hipotecario({}),
      hipotecario({ saldo: 30000, fechaFin: "2035-05-31", monto: 40000, fechaConcesion: "2015-06-01", tasaAnual: 0.1027, cuotaEstimada: 410.55, fuenteDelSaldo: "base_interna", fechaCorte: null }),
      { tipo: "quirografario", saldo: 10000, fechaFin: "2028-11-17" },
    ]),
    null,
    HOY,
  );
  const biess = d.obligaciones.filter((x) => x.concepto.includes("BIESS"));
  assertEquals(biess.length, 1);
  assertEquals(biess[0].metodoDeEstimacion, "anualidad");
  assertAlmostEquals(biess[0].montoMensual, 724.92 + 410.55 + cuotaPorAnualidad(10000, TASA_DE_LA_CUOTA_DE_EQUIFAX_QUIROGRAFARIO, 26), 0.05);
  // Con buró de Equifax el BIESS ya viene dentro de la cuota de bancos: no se agrega.
  assertEquals(datosDeCapacidad(conBiess([hipotecario({})]), { deudaActualTitular: { bancos: { cuotaMensualUsd: 700 } } }, HOY).obligaciones.some((x) => x.concepto.includes("BIESS")), false);
});

Deno.test("con Equifax: la línea del BIESS del proveedor no se agrega, ni sin cuota ni estimada", () => {
  const estructura = { deudaActualTitular: { bancos: { cuotaMensualUsd: 310.4 } } };
  const d = datosDeCapacidad(conBiess([{ tipo: "quirografario", saldo: 10000, fechaFin: "2028-11-17" }]), estructura, HOY);
  assertEquals(d.obligaciones.some((x) => x.concepto.includes("BIESS")), false);
  assertEquals(d.deudasSinCuota.some((x) => x.concepto.includes("BIESS")), false);
  assertEquals(d.fuentesSinConsultar, []);
  // Y si la fuente de préstamos no contestó, tampoco se avisa: el buró de Equifax lo cubre.
  const perfil = conBiess(undefined) as Record<string, any>;
  perfil.metaConsulta = { fuentesNoMedidas: ["creditoQuirografario"] };
  assertEquals(datosDeCapacidad(perfil, estructura, HOY).fuentesSinConsultar, []);
  assertEquals(datosDeCapacidad(perfil, null, HOY).fuentesSinConsultar, ["préstamos del IESS o BIESS"]);
});

Deno.test("C1: la cuota estimada sale del tramo de saldo por operación, y sin saldo no se inventa", () => {
  // Todos los factores caen en el rango de 2,5% a 6,5% que fijó el negocio.
  for (const t of TRAMOS_FACTOR_CUOTA) assert(t.factor >= 0.025 && t.factor <= 0.065);
  assertEquals(cuotaPorFactorDeSaldo(1500), 97.5);
  assertEquals(cuotaPorFactorDeSaldo(10000), 620);
  assertEquals(cuotaPorFactorDeSaldo(15000), 705);
  // El tramo es por operación: 30.000 en tres operaciones son 10.000 cada una.
  assertEquals(cuotaPorFactorDeSaldo(30000, { operaciones: 3 }), 1860);
  // Un saldo de 60.000 deja de costar 3.780 (el 6,3% parejo): 2,5%.
  assertEquals(cuotaPorFactorDeSaldo(60000), 1500);
  assertEquals(cuotaPorFactorDeSaldo(100000, { hipotecario: true }), 1070);
  assertEquals(FACTOR_CUOTA_HIPOTECARIO, 0.0107);
  assertEquals(cuotaPorFactorDeSaldo(null), null);
  assertEquals(cuotaPorFactorDeSaldo(0), null);
  assertEquals(CAPACIDAD_VERSION, "capacidad-v5");
});

Deno.test("C1: una deuda de bancos sin cuota entra al veredicto como cuota estimada, rotulada, y sigue en la lista", () => {
  const perfil = perfilDePrueba() as Record<string, any>;
  perfil.comportamientoCooperativas = { cuotaMensualTotal: 0 };
  perfil.comportamientoBancario = { saldoTotalVigente: 10000, deudaEnAtraso: 0 };
  const d = datosDeCapacidad(perfil, null);
  const o = d.obligaciones.find((x) => x.concepto === "Bancos (cuota estimada)");
  assert(o && o.estimada === true && o.montoMensual === 620);
  assertEquals(d.deudasSinCuota, [{ concepto: "Bancos", saldo: 10000, origen: "Proveedor_Info_1", cuotaEstimada: 620 }]);
  const c = evaluarCapacidad({ ...d, cuotaNueva: 100 });
  assertEquals(c.obligacionesActuales, 620);
  assertEquals(c.obligacionesIncompletas, true);
  assert(c.avisos.some((a) => a.includes("tramo de saldo")));
  // La deuda ya está contada: no es un hueco, y no se suma de nuevo.
  assert(!c.avisos.some((a) => a.includes("Hay deudas sin cuota informada: lo que paga")));
  // 1.200 de sueldo: neto 1.086,60, tope 434,64; 620 ya lo pasan.
  assertEquals(c.veredicto, "no_alcanza");
});

Deno.test("C1: sin saldo la deuda sigue sin contar y el aviso de hueco se mantiene", () => {
  const c = evaluarCapacidad({
    ingresos: [sueldo(1000)],
    obligaciones: [],
    deudasSinCuota: [{ concepto: "Bancos", saldo: null, origen: "Proveedor_Info_1" }],
    cuotaNueva: 100,
  });
  assertEquals(c.obligacionesActuales, 0);
  assert(c.avisos.some((a) => a.includes("Hay deudas sin cuota informada: lo que paga")));
  assert(!c.avisos.some((a) => a.includes("tramo de saldo")));
});

Deno.test("C1: el BIESS con anualidad no se cuenta dos veces, y sin fecha de fin usa el tramo, o el factor hipotecario", () => {
  const con = datosDeCapacidad(conBiess([{ tipo: "quirografario", saldo: 10000, fechaFin: "2028-11-17" }]), null, HOY);
  assertEquals(con.obligaciones.filter((x) => x.concepto.includes("BIESS")).length, 1);
  assertEquals(con.obligaciones.find((x) => x.concepto.includes("BIESS"))?.metodoDeEstimacion, "anualidad");
  const sin = datosDeCapacidad(conBiess([{ tipo: "quirografario", saldo: 10000, fechaFin: null }]), null, HOY);
  const o = sin.obligaciones.find((x) => x.concepto.includes("BIESS"));
  assertEquals(o?.montoMensual, 620);
  assertEquals(o?.metodoDeEstimacion, "factor_saldo");
  const mixto = datosDeCapacidad(
    conBiess([{ tipo: "hipotecario", saldo: 40000, fechaFin: "2046-11-17" }, { tipo: "quirografario", saldo: 3000, fechaFin: null }]),
    null,
    HOY,
  );
  const biess = mixto.obligaciones.filter((x) => x.concepto.includes("BIESS"));
  assertEquals(biess.map((x) => x.metodoDeEstimacion), ["anualidad", "factor_saldo"]);
  assertEquals(biess[1].montoMensual, 195);
});

Deno.test("C1: un BIESS hipotecario sin fecha de fin usa el factor hipotecario, no el del tramo", () => {
  const d = datosDeCapacidad(conBiess([{ tipo: "hipotecario", saldo: 60000, fechaFin: null }]), null, HOY);
  const o = d.obligaciones.find((x) => x.concepto.includes("BIESS"));
  assertEquals(o?.montoMensual, 642);
  assertEquals(o?.metodoDeEstimacion, "factor_saldo");
});
