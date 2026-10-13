// La estructura estandarizada de Equifax, calculada DESDE LAS TABLAS, con la
// respuesta INVENTADA de equifax-respuesta-de-prueba.ts (el repositorio es
// público). Cada afirmación es una cuenta que se puede hacer a mano con esa
// respuesta; el comentario de arriba del archivo de datos las explica.
//
// Con las respuestas reales: scripts/probar-equifax-tablas.mjs.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { derivarTablas } from "./equifax-tablas.ts";
import { calcularEstructura, EQUIFAX_ESTRUCTURA_VERSION, TRAMOS_DE_MORA } from "./equifax-estructura.ts";
import { PERSONALES_DE_PRUEBA, respuestaDePrueba } from "./equifax-respuesta-de-prueba.ts";

// 21:54 en Ecuador del 12 de octubre: la fecha de la consulta es la de Ecuador, no la de UTC.
const CONTEXTO = { consultadoEl: "2026-10-13T02:54:14.996Z", ambiente: "produccion", identidadVerificada: true as boolean | null };

function estructuraDe(respuesta = respuestaDePrueba(), contexto = CONTEXTO) {
  return calcularEstructura(derivarTablas(respuesta), contexto);
}

const registro = (respuesta: Record<string, unknown>) => respuesta.reporteCrediticio as Record<string, unknown[]>;

Deno.test("la estructura lleva su versión, la de las tablas y los datos de la consulta", () => {
  const e = estructuraDe();
  assertEquals(e.version, EQUIFAX_ESTRUCTURA_VERSION);
  assertEquals(e.tablasVersion, "equifax-tablas-v1");
  assertEquals(e.consulta, { consultadoEl: CONTEXTO.consultadoEl, ambiente: "produccion", identidadVerificada: true, version: EQUIFAX_ESTRUCTURA_VERSION });
});

Deno.test("una identidad que no se pudo comprobar se dice así: null, no true", () => {
  assertEquals(estructuraDe(respuestaDePrueba(), { ...CONTEXTO, identidadVerificada: null }).consulta.identidadVerificada, null);
});

Deno.test("la deuda del titular cuenta el rol Titular escrito de las dos maneras y no mezcla al codeudor", () => {
  const b = estructuraDe().deudaActualTitular.bancos!;
  assertEquals(b.numeroDeOperaciones, 2, "una TITULAR y una Titular");
  assertEquals(b.institucionesDistintas, 2);
  assertEquals(b.saldoDeudaUsd, 4000, "sin los 500 del codeudor");
  assertEquals(b.saldoPorVencerUsd, 3700);
  assertEquals(b.saldoVencidoUsd, 300);
  assertEquals(b.cuotaMensualUsd, 200);
  assertEquals(b.maximoDiasDeMora, 45);
});

Deno.test("lo que debe como codeudor o garante va aparte, nunca sumado al titular", () => {
  const o = estructuraDe().deudaCodeudorGarante;
  assertEquals(o.bancos!.saldoDeudaUsd, 500);
  assertEquals(o.bancos!.numeroDeOperaciones, 1);
  assertEquals(o.comercial!.saldoDeudaUsd, 100, "el garante del comercial");
  assertEquals(o.total.saldoDeudaUsd, 600);
  assertEquals(o.total.numeroDeOperaciones, 2);
});

Deno.test("conciliaConElResumen compara TODOS los roles contra el resumen de Equifax", () => {
  const t = estructuraDe().deudaActualTitular;
  assertEquals(t.bancos!.saldoTodosLosRolesUsd, 4500);
  assertEquals(t.bancos!.resumenDeEquifaxUsd, 4500);
  assertEquals(t.bancos!.diferenciaConElResumenUsd, 0);
  assertEquals(t.bancos!.conciliaConElResumen, "si", "4.000 del titular + 500 del codeudor = el resumen");
  assertEquals(t.cooperativas!.conciliaConElResumen, "si", "sin operaciones y con un resumen en cero también cuadra");
  assertEquals(t.comercial!.conciliaConElResumen, "no");
  assertEquals(t.comercial!.diferenciaConElResumenUsd, -699, "300 de detalle contra 999 del resumen");
  assertEquals(t.total.conciliaConElResumen, "no", "basta un sistema que no cuadre");
  assertEquals(t.total.resumenDeEquifaxUsd, 5499);
  assertEquals(t.total.saldoDeudaUsd, 4200);
  assertEquals(t.total.saldoTodosLosRolesUsd, 4800);
});

Deno.test("sin la fila del resumen de un sistema no se afirma nada: sin_resumen", () => {
  const rc = registro(respuestaDePrueba());
  const e = estructuraDe(respuestaDePrueba({ reporteCrediticio: { valor_deuda_3_sistemas: rc.valor_deuda_3_sistemas.slice(1) } }));
  assertEquals(e.deudaActualTitular.bancos!.conciliaConElResumen, "sin_resumen");
  assertEquals(e.deudaActualTitular.bancos!.resumenDeEquifaxUsd, null);
  assertEquals(e.deudaActualTitular.bancos!.diferenciaConElResumenUsd, null);
});

Deno.test("una lista de deuda que no vino no es una lista vacía: el sistema queda sin medir", () => {
  const rc = registro(respuestaDePrueba());
  const sinSeps = { ...rc } as Record<string, unknown>;
  delete sinSeps.detalle_deuda_actual_seps;
  const e = calcularEstructura(derivarTablas({ ...respuestaDePrueba(), reporteCrediticio: sinSeps }), CONTEXTO);
  assertEquals(e.deudaActualTitular.cooperativas, null);
  assertEquals(e.deudaCodeudorGarante.cooperativas, null);
  assertEquals(e.deudaActualTitular.total.conciliaConElResumen, "no", "el comercial sigue sin cuadrar: un «no» pesa más que un hueco");
  assert(e.calidad.listasQueNoVinieron.includes("detalle_deuda_actual_seps"));
  // y con una lista vacía, la que sí vino, el sistema se mide en cero
  assertEquals(estructuraDe().deudaActualTitular.cooperativas!.numeroDeOperaciones, 0);
  assertEquals(estructuraDe().deudaActualTitular.cooperativas!.maximoDiasDeMora, null, "sin operaciones no hay días de mora que reportar");
});

Deno.test("con el detalle ausente en todos los sistemas, el total no concilia ni inventa una conciliación", () => {
  const rc = registro(respuestaDePrueba());
  const sinDetalle = { ...rc } as Record<string, unknown>;
  for (const k of ["detalle_deuda_actual_sb", "detalle_deuda_actual_seps", "detalle_deuda_actual_sicom"]) delete sinDetalle[k];
  const e = calcularEstructura(derivarTablas({ ...respuestaDePrueba(), reporteCrediticio: sinDetalle }), CONTEXTO);
  assertEquals(e.deudaActualTitular.total.conciliaConElResumen, "sin_detalle");
});

Deno.test("la lista aparte de codeudor y garante de Equifax coincide con las operaciones de rol codeudor, y no se suma", () => {
  const l = estructuraDe().deudaCodeudorGarante.listaAparteDeEquifax!;
  assertEquals(l.numeroDeOperacionesVigentes, 1);
  assertEquals(l.deudaTotalUsd, 500);
  assertEquals(l.numeroDeOperacionesNoVigentes, 0);
  assertEquals(l.coincideConLasOperacionesDeRolCodeudor, true);
  const distinta = estructuraDe(respuestaDePrueba({
    reporteCrediticio: { garantias_personales_codeudores_operaciones_vigentes: [{ tipo_deudor: "CODEUDOR", institucion: "BANCO DE PRUEBA TRES", deuda_total: 900 }] },
  })).deudaCodeudorGarante.listaAparteDeEquifax!;
  assertEquals(distinta.coincideConLasOperacionesDeRolCodeudor, false, "si dejan de coincidir se ve");
});

Deno.test("la mora se reparte en tramos por los días de mora y suma el vencido del titular", () => {
  const dias = [10, 40, 80, 150, 200, 300, 500, 900, 1500];
  const ops = dias.map((d, i) => ({
    institucion: `BANCO DE PRUEBA ${i}`, fecha_corte: "31/08/2026", tipo_riesgo: "TITULAR", tipo_credito: "Consumo", cupo_monto_original: 1000, fecha_apertura: "15/01/2024",
    fecha_vencimiento: "15/01/2027", total_vencer: 0, ndi: 0, total_vencido: i + 1, dem_jud: 0, cart_cast: 0, saldo_deuda: i + 1, cuota_mensual: 0, dias_morosidad: d,
  }));
  const e = estructuraDe(respuestaDePrueba({ reporteCrediticio: { detalle_deuda_actual_sb: ops } }));
  assertEquals(TRAMOS_DE_MORA.map((t) => (e.moraActual as Record<string, unknown>)[t.campo]), [1, 2, 3, 4, 5, 6, 7, 8, 9], "cada operación cae en su tramo");
  assertEquals(e.moraActual.saldoVencidoUsd, 45);
  assertEquals(e.moraActual.numeroDeOperacionesVencidas, 9);
  assertEquals(e.moraActual.maximoDiasDeMora, 1500);
});

Deno.test("la mora actual del titular de la respuesta: 300 en el tramo de 1 a 2 meses, 7,14% de su deuda", () => {
  const m = estructuraDe().moraActual;
  assertEquals(m.vencidoDe1a2MesesUsd, 300);
  assertEquals(m.vencidoDe0a1MesUsd, 0);
  assertEquals(m.saldoVencidoUsd, 300);
  assertEquals(m.porcentajeDeLaDeudaVencida, 7.14, "300 de 4.200");
  assertEquals(m.numeroDeOperacionesVencidas, 1);
  assertEquals(m.vencidoSegunElResumenDeEquifaxTodosLosRolesUsd, 300);
});

Deno.test("la conducta de pago se cuenta por mes, sólo del titular, y el codeudor en mora no la ensucia", () => {
  const c = estructuraDe().conductaDePago!;
  assertEquals(c.mesesObservados, 3);
  assertEquals(c.mesesConMoraEnLosUltimos24, 2, "julio (20 días) y agosto (45)");
  assertEquals(c.mesesConDeudaVencida, 2);
  assertEquals(c.mesesConMoraDeMasDe90Dias, 0, "los 200 días son de una operación donde es codeudor");
  assertEquals(c.maximoDiasDeMoraEnLosUltimos24, 45);
  assertEquals(c.fechaDeLaUltimaMora, "2026-08-31");
  assertEquals(c.maximoDeOperacionesEnMoraEnUnMes, 1);
  assertEquals(c.maximoDeOperacionesConMoraDeMasDe90DiasEnUnMes, 0);
});

Deno.test("sin historia no hay conducta de pago que inventar", () => {
  const rc = registro(respuestaDePrueba());
  const sinHistoria = { ...rc } as Record<string, unknown>;
  for (const k of ["detalle_deuda_historica_sb", "detalle_deuda_historica_seps", "detalle_deuda_historica_sicom"]) delete sinHistoria[k];
  assertEquals(calcularEstructura(derivarTablas({ ...respuestaDePrueba(), reporteCrediticio: sinHistoria }), CONTEXTO).conductaDePago, null);
});

Deno.test("los scores de Equifax, con la banda en la que cae la persona y la variación de un año", () => {
  const s = estructuraDe().scores;
  assertEquals(s.scoreEquifax, 640);
  assertEquals([s.bandaDelScoreEquifaxDesde, s.bandaDelScoreEquifaxHasta], [500, 700]);
  assertEquals(s.tasaDeMalosAcumuladaPorcentaje, 12.5);
  assertEquals([s.scoreEquifaxHace6Meses, s.scoreEquifaxHace12Meses, s.variacionDelScore12Meses], [600, 580, 60]);
  assertEquals(s.scoreInclusionEquifax, 800);
  assertEquals(s.scoreSobreendeudamientoEquifax, 400);
  assertEquals(s.probabilidadDeSobreendeudamientoPorcentaje, 9.5);
  assertEquals(s.nivelDeSobreendeudamiento, "alto");
});

Deno.test("el estado general: el estado de cartera va rotulado como cálculo de Equifax y los protestos no se miden", () => {
  const g = estructuraDe().estadoGeneral;
  assertEquals(g.estadoDeCartera?.origen, "calculo_de_equifax");
  assertEquals(g.estadoDeCartera?.codigo, 17);
  assertEquals(g.fechaDelPrimerCredito, "2012-05-01");
  assertEquals(g.antiguedadCrediticiaMeses, 173, "hasta el 12 de octubre, la fecha de Ecuador de la consulta (no la de UTC)");
  assertEquals(g.tieneInhabilitacionBancaria, false);
  assertEquals(g.ultimaInhabilitacion, null);
  assertEquals(g.numeroDeMorosidades, 1);
  assertEquals(g.numeroDeProtestos, null, "no medido, no «0 protestos»");
  assertEquals(g.impagosSegunEquifaxTodosLosRoles.operacionesImpagas, { numero: 1, montoUsd: 300 });
});

Deno.test("una inhabilitación bancaria se ve con su fecha y su acción", () => {
  const e = estructuraDe(respuestaDePrueba({
    reporteCrediticio: { personas_inhabilitadas: [{ fecha_inhabilitacion: "2025-12-18 00:00:00.000", tiempo_inhabilitacion: 0, accion: "CANCELAR CUENTAS", motivo: "I1: motivo de prueba" }] },
  }));
  assertEquals(e.estadoGeneral.tieneInhabilitacionBancaria, true);
  assertEquals(e.estadoGeneral.ultimaInhabilitacion, { fecha: "2025-12-18", accion: "CANCELAR CUENTAS", motivo: "I1: motivo de prueba" });
});

Deno.test("la evolución: la deuda es financiera más comercial y la variación se calcula contra hace 12 meses", () => {
  const v = estructuraDe().evolucion;
  assertEquals([v.deudaActualUsd, v.deudaHace6MesesUsd, v.deudaHace12MesesUsd], [5500, 5000, 4000]);
  assertEquals(v.variacionDeLaDeuda12MesesPorcentaje, 37.5);
  assertEquals([v.acreedoresActuales, v.acreedoresHace6Meses, v.acreedoresHace12Meses], [5, 4, 3]);
  assertEquals([v.cuotaEstimadaActualUsd, v.cuotaEstimadaHace12MesesUsd], [200, 180]);
});

Deno.test("sin deuda hace 12 meses no hay variación porcentual que inventar", () => {
  const e = estructuraDe(respuestaDePrueba({
    reporteCrediticio: {
      historico_endeudamiento_comercial: [{ retroactivo: "Actual", saldo_total: 100 }, { retroactivo: "-12 Meses", saldo_total: 0 }],
      historico_endeudamiento_financiero: [{ retroactivo: "Actual", saldo_total: 100 }, { retroactivo: "-12 Meses", saldo_total: 0 }],
    },
  }));
  assertEquals(e.evolucion.deudaHace12MesesUsd, 0);
  assertEquals(e.evolucion.variacionDeLaDeuda12MesesPorcentaje, null);
});

Deno.test("las tarjetas: el uso de hoy, el promedio de 6 meses y el máximo por tarjeta son tres cosas distintas", () => {
  const t = estructuraDe().tarjetas!;
  assertEquals(t.numeroDeTarjetasVigentes, 2);
  assertEquals(t.cupoTotalUsd, 3000);
  assertEquals(t.saldoTotalUsd, 1700);
  assertEquals(t.usoActualPorcentaje, 56.67, "1.700 sobre 3.000: lo que mide la política de uso de Equifax");
  assertEquals(t.usoPromedioPorcentaje, 46.67, "el promedio de 6 meses (1.400) sobre el cupo");
  assertEquals(t.usoMaximoPorcentaje, 120, "la segunda tarjeta debe 1.200 con un cupo de 1.000");
  assertEquals(t.saldoPromedio6MesesUsd, 1400);
  assertEquals(t.antiguedadDeLaMasAntiguaMeses, 60);
  assertEquals(t.numeroDeTarjetasConSaldoMayorAlCupo, 1);
  assertEquals(t.numeroDeTarjetasCanceladas, 1);
});

Deno.test("una persona sin lista de tarjetas queda sin medir, no con cero tarjetas", () => {
  const rc = registro(respuestaDePrueba());
  const sinTarjetas = { ...rc } as Record<string, unknown>;
  delete sinTarjetas.detalle_tarjetas;
  assertEquals(calcularEstructura(derivarTablas({ ...respuestaDePrueba(), reporteCrediticio: sinTarjetas }), CONTEXTO).tarjetas, null);
  const vacia = estructuraDe(respuestaDePrueba({ reporteCrediticio: { detalle_tarjetas: [], tarjetas_canceladas: [] } })).tarjetas!;
  assertEquals(vacia.numeroDeTarjetasVigentes, 0, "la fuente contestó que no hay");
  assertEquals(vacia.usoActualPorcentaje, null, "sin cupo no hay porcentaje");
  assertEquals(vacia.usoMaximoPorcentaje, null);
});

Deno.test("los créditos otorgados se cuentan por estado y se suman por tipo", () => {
  const c = estructuraDe().creditosOtorgados!;
  assertEquals(c.numeroDeCreditosOtorgados, 3);
  assertEquals([c.numeroDeCreditosOriginales, c.numeroDeCreditosNovados, c.numeroDeCreditosRefinanciados, c.numeroDeCreditosReestructurados], [1, 1, 1, 0]);
  assertEquals(c.numeroDeCreditosCancelados, 1);
  assertEquals(c.montoOriginalTotalUsd, 88000);
  assertEquals([c.montoOriginalConsumoUsd, c.montoOriginalViviendaUsd, c.montoOriginalMicrocreditoUsd, c.montoOriginalComercialUsd], [5000, 80000, 0, 3000]);
  assertEquals(c.fechaDeLaUltimaConcesion, "2025-02-10");
});

Deno.test("las consultas recibidas no cuentan a NovaCredit y los doce meses salen aunque no haya consultas", () => {
  const c = estructuraDe().consultasRecibidas!;
  assertEquals(c.consultasPorMes.length, 12);
  assertEquals(c.consultasPorMes[0], { mes: "2026-10", consultas: 0 });
  assertEquals(c.consultasPorMes[1], { mes: "2026-09", consultas: 1 }, "NovaCredit también consultó en septiembre y no cuenta");
  assertEquals(c.consultasPorMes[11], { mes: "2025-11", consultas: 1 });
  assertEquals(c.entidadesQueLaConsultaronEnLosUltimos12Meses, 2);
  assertEquals(c.consultasEnLosUltimos12Meses, 3);
  assertEquals(c.entidadesEnLosUltimos3Meses, 1);
  assertEquals(c.consultasEnLosUltimos3Meses, 1);
  assertEquals(c.consultasDeNovaCreditEnLosUltimos12Meses, 2);
});

Deno.test("la actividad económica del SRI y las estimaciones de Equifax, rotuladas", () => {
  const e = estructuraDe();
  assertEquals(e.actividadEconomica, {
    tieneRuc: true, estadoDelRuc: "ACTIVO", claseDeContribuyente: "RIMPE", obligadoALlevarContabilidad: false,
    fechaDeInicioDeActividades: "2015-03-02", fechaDeSuspensionDefinitiva: null,
  });
  assertEquals(e.estimacionesDeEquifax.ingresoEstimadoUsd, 1500.5);
  assertEquals(e.estimacionesDeEquifax.indicadorDeImpactoEconomico, 3);
});

Deno.test("la calidad de la respuesta se dice: cortes del detalle, saldos que no cuadran, roles raros", () => {
  const limpia = estructuraDe().calidad;
  assertEquals(limpia.avisos, []);
  assertEquals(limpia.listasQueNoVinieron, []);
  assertEquals(limpia.operacionesConSaldoQueNoCuadra, 0);
  assertEquals(limpia.operacionesConRolDesconocido, 0);
  assertEquals(limpia.cortesDelDetalleActual, { bancos: ["2026-08-31"], cooperativas: [], comercial: ["2026-09-30", "2026-10-06"] });
  assertEquals(limpia.protestosMedidos, false);

  const rara = estructuraDe(respuestaDePrueba({
    reporteCrediticio: {
      detalle_deuda_actual_sb: [{
        institucion: "BANCO DE PRUEBA UNO", fecha_corte: "31/08/2026", tipo_riesgo: "AVALISTA", tipo_credito: "Consumo", cupo_monto_original: 100, fecha_apertura: "15/01/2024",
        fecha_vencimiento: "15/01/2027", total_vencer: 10, ndi: 0, total_vencido: 0, dem_jud: 0, cart_cast: 0, saldo_deuda: 99, cuota_mensual: 0, dias_morosidad: 0,
      }],
    },
  })).calidad;
  assertEquals(rara.operacionesConRolDesconocido, 1, "un rol que no se reconoce no se reparte en silencio");
  assertEquals(rara.operacionesConSaldoQueNoCuadra, 1, "10 por vencer contra 99 de saldo");
});

Deno.test("la estructura no lleva ningún dato personal y se escribe como JSON sin perder nada", () => {
  const e = estructuraDe();
  const json = JSON.stringify(e);
  for (const personal of PERSONALES_DE_PRUEBA) assertFalse(json.includes(personal), `se coló: ${personal.slice(0, 4)}…`);
  assertFalse(/NaN|undefined|Infinity/.test(json));
  assertEquals(JSON.stringify(JSON.parse(json)), json);
});

Deno.test("calcular dos veces la misma estructura da exactamente lo mismo", () => {
  assertEquals(JSON.stringify(estructuraDe()), JSON.stringify(estructuraDe()));
});

Deno.test("una respuesta vacía no rompe: casi todo queda sin medir", () => {
  const e = calcularEstructura(derivarTablas({}), CONTEXTO);
  assertEquals(e.scores.scoreEquifax, null);
  assertEquals(e.tarjetas, null);
  assertEquals(e.conductaDePago, null);
  assertEquals(e.consultasRecibidas, null);
  assertEquals(e.deudaActualTitular.bancos, null);
  assertEquals(e.deudaActualTitular.total.conciliaConElResumen, "sin_detalle");
  assert(e.calidad.avisos.length >= 1);
});
