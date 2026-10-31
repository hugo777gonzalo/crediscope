// La capacidad de pago con cuentas hechas a mano, y de dónde salen el ingreso
// y las cuotas de una persona. Los perfiles son inventados: el repositorio es
// público.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assert, assertAlmostEquals, assertThrows } from "jsr:@std/assert@1";
import { conIngresoDeclarado, datosDeCapacidad, elBuroTraeDetalle, evaluarCapacidad } from "./capacidad-de-pago.ts";
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
    deudasSinCuota: [{ concepto: "Casas comerciales", saldo: 640.5, origen: "Novadata" }],
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
  assertEquals(d.fuenteDeLasCuotas, "novadata");
  assertEquals(d.ingresos, [{ concepto: "Sueldo reportado al IESS · Empleador privado", montoMensual: 1200, tipo: "sueldo", origen: "IESS" }]);
  assertEquals(d.obligaciones, [{ concepto: "Cooperativas", montoMensual: 145.35, origen: "Novadata" }]);
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
  // Los bancos ya tienen cuota; las casas comerciales siguen sin ella.
  assertEquals(d.deudasSinCuota.map((x) => x.concepto), ["Casas comerciales", "Préstamo del IESS o BIESS"]);
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
  // 40% de 2.500 = 1.000, menos los 145,35 de cooperativas.
  assertEquals(c.cuotaMaximaAdmisible, 854.65);
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
    deudasSinCuota: [{ concepto: "Préstamo del IESS o BIESS", saldo: null, origen: "Novadata" }],
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
    assertEquals(d.fuenteDeLasCuotas, "novadata");
  }
  // Fuentes indirectas, sin monto o en cero no son ingreso.
  const sinMonto = { fuentesIngreso: { fuentes: [{ evidencia: "indirecta", montoMensualReportado: null }, { evidencia: "reportada_por_tercero", montoMensualReportado: 0 }] } };
  assertEquals(datosDeCapacidad(sinMonto, null).ingresos, []);
});

Deno.test("una respuesta de Equifax sin reporte de crédito no es «no debe»: se sigue con Novadata", () => {
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
  assertEquals(datos.fuenteDeLasCuotas, "novadata");
});

Deno.test("datosDeCapacidad con Equifax: una estructura sin deuda del titular no es Equifax; con saldo y sin cuota, es una deuda sin cuota", () => {
  // {} o sin deudaActualTitular: no hay estructura que usar, se sigue con Novadata.
  assertEquals(datosDeCapacidad(perfilDePrueba(), {}).fuenteDeLasCuotas, "novadata");
  assertEquals(datosDeCapacidad(perfilDePrueba(), { deudaActualTitular: null }).fuenteDeLasCuotas, "novadata");

  const estructura = {
    deudaActualTitular: {
      bancos: { saldoDeudaUsd: 8200, cuotaMensualUsd: 0 },
      cooperativas: { saldoDeudaUsd: 0, cuotaMensualUsd: 0 },
      comercial: { saldoDeudaUsd: 300, cuotaMensualUsd: 25 },
    },
  };
  const d = datosDeCapacidad(perfilDePrueba(), estructura);
  assertEquals(d.fuenteDeLasCuotas, "equifax");
  assertEquals(d.obligaciones, [{ concepto: "Sector comercial", montoMensual: 25, origen: "Equifax" }]);
  // Los bancos de Equifax tienen saldo y cuota cero: no se cuentan como cero.
  assertEquals(d.deudasSinCuota[0], { concepto: "Bancos", saldo: 8200, origen: "Equifax" });
  // Con Equifax no se mezclan los bancos de Novadata.
  assert(!d.deudasSinCuota.some((x) => x.origen === "Novadata" && x.concepto === "Bancos"));
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
  // Con Equifax, los bancos salen de ahí y su fuente de Novadata no importa.
  const conBuro = datosDeCapacidad(perfil, { deudaActualTitular: { bancos: { cuotaMensualUsd: 100 } } });
  assertEquals(conBuro.fuentesSinConsultar, ["casas comerciales", "pensiones alimenticias"]);
  // Y con todo contestado no hay nada que avisar.
  assertEquals(datosDeCapacidad(perfilDePrueba(), null).fuentesSinConsultar, []);
  assertEquals(evaluarCapacidad({ ...datosDeCapacidad(perfilDePrueba(), null), cuotaNueva: 100 }).avisos.some((a) => a.includes("No se pudo consultar")), false);
});
