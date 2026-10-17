// La capacidad de pago con cuentas hechas a mano, y de dónde salen el ingreso
// y las cuotas de una persona. Los perfiles son inventados: el repositorio es
// público.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assert, assertAlmostEquals } from "jsr:@std/assert@1";
import { datosDeCapacidad, evaluarCapacidad } from "./capacidad-de-pago.ts";
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
