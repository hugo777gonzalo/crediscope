// El simulador se prueba contra cuotas calculadas a mano con la fórmula del
// sistema francés, cuota = monto · i / (1 − (1 + i)^−n), y contra lo que
// tiene que cumplir cualquier tabla: el capital suma el monto y el saldo
// termina en cero.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assert, assertAlmostEquals } from "jsr:@std/assert@1";
import { MONTO_MAXIMO, montoMaximoParaCuota, simularCredito, validarPedido, type PedidoDeSimulacion, type Simulacion } from "./simulador-credito.ts";

const SIN_SEGURO = { tasaPorcentaje: 0, periodicidad: "anual", base: "saldo" } as const;

function simular(p: PedidoDeSimulacion): Simulacion {
  const r = simularCredito(p);
  if (!r.ok) throw new Error(r.errores.join(" "));
  return r.simulacion;
}

const centavos = (n: number) => Math.round(n * 100);

Deno.test("francés: 1.000 al 12% en 12 meses da 88,85 sin seguro", () => {
  const s = simular({ monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: 12, desgravamen: SIN_SEGURO });
  assertEquals(s.cuotaPrimerMes, 88.85);
  assertEquals(s.tabla[0].interes, 10);
  assertEquals(s.tabla[0].capital, 78.85);
  assertEquals(s.seguroPrimerMes, 0);
});

Deno.test("el desgravamen de 0,6% anual sobre el saldo suma 0,50 en el primer mes de 1.000", () => {
  const s = simular({ monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 });
  assertEquals(s.seguroPrimerMes, 0.5);
  assertEquals(s.capitalEInteresPrimerMes, 88.85);
  assertEquals(s.cuotaPrimerMes, 89.35);
});

Deno.test("10.000 al 15% en 36 meses: 346,65 más 5,00 de seguro", () => {
  const s = simular({ monto: 10000, plazoMeses: 36, tasaNominalAnualPorcentaje: 15 });
  assertEquals(s.capitalEInteresPrimerMes, 346.65);
  assertEquals(s.seguroPrimerMes, 5);
  assertEquals(s.cuotaPrimerMes, 351.65);
  assertAlmostEquals(s.tasaMensual, 0.0125, 1e-12);
  assertAlmostEquals(s.tasaEfectivaAnual, 0.160755, 1e-6);
});

Deno.test("con seguro sobre el saldo, la cuota total del francés no sube nunca", () => {
  const s = simular({ monto: 10000, plazoMeses: 36, tasaNominalAnualPorcentaje: 15 });
  // La última puede bajar más por el ajuste del redondeo, nunca subir más de un centavo.
  for (let k = 1; k < s.tabla.length; k++) assert(centavos(s.tabla[k].cuota) <= centavos(s.tabla[k - 1].cuota) + 1, `mes ${k + 1}`);
  assert(s.cuotaUltimoMes < s.cuotaPrimerMes);
});

Deno.test("alemán: 1.200 al 12% en 12 meses, capital fijo de 100", () => {
  const s = simular({ monto: 1200, plazoMeses: 12, tasaNominalAnualPorcentaje: 12, sistema: "aleman" });
  assertEquals(s.tabla[0].capital, 100);
  assertEquals(s.tabla[0].interes, 12);
  assertEquals(s.tabla[0].seguro, 0.6);
  assertEquals(s.cuotaPrimerMes, 112.6);
  assertEquals(s.tabla[11].interes, 1);
  assertEquals(s.cuotaUltimoMes, 101.05);
});

Deno.test("sin interés, la última cuota absorbe el centavo que sobra", () => {
  const s = simular({ monto: 1000, plazoMeses: 3, tasaNominalAnualPorcentaje: 0, desgravamen: SIN_SEGURO });
  assertEquals(s.tabla.map((f) => f.cuota), [333.33, 333.33, 333.34]);
});

Deno.test("seguro sobre el monto: el mismo valor todos los meses", () => {
  const s = simular({
    monto: 1000,
    plazoMeses: 12,
    tasaNominalAnualPorcentaje: 12,
    desgravamen: { tasaPorcentaje: 0.6, periodicidad: "anual", base: "monto" },
  });
  assert(s.tabla.every((f) => f.seguro === 0.5));
  assertEquals(s.totalSeguro, 6);
});

Deno.test("0,05% mensual es lo mismo que 0,6% anual", () => {
  const base = { monto: 7350, plazoMeses: 48, tasaNominalAnualPorcentaje: 14.5 };
  const anual = simular({ ...base, desgravamen: { tasaPorcentaje: 0.6, periodicidad: "anual", base: "saldo" } });
  const mensual = simular({ ...base, desgravamen: { tasaPorcentaje: 0.05, periodicidad: "mensual", base: "saldo" } });
  assertEquals(mensual.tabla, anual.tabla);
});

Deno.test("en cualquier caso el capital suma el monto, el saldo termina en cero y los totales cuadran", () => {
  for (const sistema of ["frances", "aleman"] as const) {
    for (const [monto, plazoMeses, tasa] of [[500, 6, 15], [1234.56, 7, 12.9], [20000, 84, 14.5], [3000, 1, 15], [999.99, 60, 0]]) {
      const s = simular({ monto, plazoMeses, tasaNominalAnualPorcentaje: tasa, sistema });
      const caso = `${sistema} ${monto} ${plazoMeses} ${tasa}`;
      assertEquals(s.tabla.length, plazoMeses, caso);
      assertEquals(s.tabla.reduce((a, f) => a + centavos(f.capital), 0), centavos(monto), caso);
      assertEquals(s.tabla[s.tabla.length - 1].saldoFinal, 0, caso);
      assert(s.tabla.every((f) => f.capital >= 0 && f.saldoFinal >= 0), caso);
      const pagado = s.tabla.reduce((a, f) => a + centavos(f.cuota), 0);
      assertEquals(centavos(s.totalPagado), pagado, caso);
      assertEquals(pagado, centavos(monto) + centavos(s.totalInteres) + centavos(s.totalSeguro), caso);
    }
  }
});

Deno.test("la tasa no puede pasar la máxima del producto, que la institución puede cambiar", () => {
  const r = simularCredito({ monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: 15.5 });
  assertEquals(r.ok, false);
  assert(!r.ok && r.errores.includes("La tasa supera la máxima del producto."));
  assertEquals(simularCredito({ monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: 15 }).ok, true);
  assertEquals(simularCredito({ monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: 13, tasaNominalMaximaPorcentaje: 12.9 }).ok, false);
});

Deno.test("rechaza montos, plazos y seguros que no tienen sentido", () => {
  const malos: PedidoDeSimulacion[] = [
    { monto: 0, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 },
    { monto: -5, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 },
    { monto: 100.005, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 },
    { monto: Number.NaN, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 },
    { monto: 1000, plazoMeses: 12.5, tasaNominalAnualPorcentaje: 12 },
    { monto: 1000, plazoMeses: 0, tasaNominalAnualPorcentaje: 12 },
    { monto: 1000, plazoMeses: 481, tasaNominalAnualPorcentaje: 12 },
    { monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: -1 },
    { monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: 12, desgravamen: { tasaPorcentaje: -0.1, periodicidad: "anual", base: "saldo" } },
  ];
  for (const p of malos) assertEquals(simularCredito(p).ok, false, JSON.stringify(p));
  assertEquals(simularCredito({ monto: 100.05, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 }).ok, true);
});

// --- Revisión del 2026-10-18 -------------------------------------------------

const SEGURO_SOBRE_EL_MONTO = { tasaPorcentaje: 0.6, periodicidad: "anual", base: "monto" } as const;

Deno.test("a 480 meses el crédito dura los 480 meses: sin filas vacías y con la última cuota igual a la primera", () => {
  // Con la cuota fija redondeada una sola vez, estos terminaban de pagarse antes
  // de tiempo (1 o 2 filas con saldo cero) y, a 480, la última cuota salía hasta
  // USD 153 distinta de la primera.
  for (const [monto, tasa] of [[2500, 11.2], [3000, 15], [4000, 14.5], [5000, 14.5], [100000, 15]]) {
    const s = simular({ monto, plazoMeses: 480, tasaNominalAnualPorcentaje: tasa, desgravamen: SEGURO_SOBRE_EL_MONTO });
    const caso = `${monto} ${tasa}`;
    assertEquals(s.tabla.filter((f) => f.saldoInicial === 0).length, 0, caso);
    assert(Math.abs(centavos(s.cuotaUltimoMes) - centavos(s.cuotaPrimerMes)) <= 1, caso);
    assertEquals(s.tabla[479].saldoFinal, 0, caso);
  }
});

Deno.test("alemán de 1.001 a 480 meses: el capital redondeado hacia arriba pagaba todo en el mes 479", () => {
  const s = simular({ monto: 1001, plazoMeses: 480, tasaNominalAnualPorcentaje: 15, sistema: "aleman", desgravamen: SEGURO_SOBRE_EL_MONTO });
  assertEquals(s.tabla.filter((f) => f.saldoInicial === 0).length, 0);
  assertEquals(s.tabla.reduce((a, f) => a + centavos(f.capital), 0), centavos(1001));
  assertEquals(s.tabla[479].saldoFinal, 0);
});

Deno.test("la cuota francesa varía a lo sumo un centavo entre meses, de 1 a 480 meses y de 0% al tope", () => {
  for (const plazoMeses of [1, 2, 3, 12, 59, 84, 240, 480]) {
    for (const tasa of [0, 0.5, 9.33, 15]) {
      const s = simular({ monto: 12345.67, plazoMeses, tasaNominalAnualPorcentaje: tasa, desgravamen: SIN_SEGURO });
      const cuotas = s.tabla.map((f) => centavos(f.cuota));
      // Sólo el redondeo, nunca una deriva acumulada.
      assert(Math.max(...cuotas) - Math.min(...cuotas) <= 1, `${plazoMeses} ${tasa}`);
      assertEquals(s.tabla[plazoMeses - 1].saldoFinal, 0);
    }
  }
});

Deno.test("plazo de un mes: se paga todo con el interés de un mes y su seguro", () => {
  const s = simular({ monto: 1000, plazoMeses: 1, tasaNominalAnualPorcentaje: 12 });
  assertEquals(s.tabla.length, 1);
  assertEquals(s.cuotaPrimerMes, 1010.5);
  assertEquals(s.totalInteres, 10);
  assertEquals(s.cuotaUltimoMes, s.cuotaPrimerMes);
  assertEquals(simular({ monto: 1000, plazoMeses: 1, tasaNominalAnualPorcentaje: 0, desgravamen: SIN_SEGURO }).cuotaPrimerMes, 1000);
});

Deno.test("sin interés a 480 meses: tasa efectiva cero, el capital suma el monto y no hay filas vacías", () => {
  const s = simular({ monto: 1000.01, plazoMeses: 480, tasaNominalAnualPorcentaje: 0, desgravamen: SIN_SEGURO });
  assertEquals(s.tasaEfectivaAnual, 0);
  assertEquals(s.totalInteres, 0);
  assertEquals(s.tabla.reduce((a, f) => a + centavos(f.capital), 0), 100001);
  assertEquals(s.tabla.filter((f) => f.saldoInicial === 0).length, 0);
});

Deno.test("con la tasa en el tope, la efectiva anual es la compuesta de la mensual", () => {
  const s = simular({ monto: 8000, plazoMeses: 60, tasaNominalAnualPorcentaje: 15 });
  assertAlmostEquals(s.tasaEfectivaAnual, Math.pow(1 + 0.15 / 12, 12) - 1, 1e-12);
  assertEquals(s.sistema, "frances");
});

Deno.test("montos grandes con dos decimales son válidos; pasar de mil millones no", () => {
  // Desde unos 100 millones, monto × 100 de estos ya no era un entero exacto y
  // se rechazaban como «con más de dos decimales» (8% de los montos válidos).
  for (const monto of [169557065.23, 614290342.92, 329088448.9, 999999999.99, 1000000000]) {
    assertEquals(validarPedido({ monto, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 }), [], String(monto));
  }
  assert(validarPedido({ monto: 1000000000.01, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 }).length > 0);
  assert(validarPedido({ monto: 614290342.925, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 }).includes("El monto va en dólares con hasta dos decimales."));
  assert(validarPedido({ monto: Number.POSITIVE_INFINITY, plazoMeses: 12, tasaNominalAnualPorcentaje: 12 }).length > 0);
  const grande = simular({ monto: 999999999.99, plazoMeses: 480, tasaNominalAnualPorcentaje: 15 });
  assertEquals(grande.tabla.reduce((a, f) => a + centavos(f.capital), 0), centavos(999999999.99));
  assertEquals(grande.tabla[479].saldoFinal, 0);
});

Deno.test("una tasa que no es número lo dice, y un seguro o un pedido mal armados se rechazan", () => {
  assertEquals(validarPedido({ monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: Number.NaN }), ["La tasa tiene que ser un número."]);
  const sinTasa = { monto: 1000, plazoMeses: 12 } as unknown as PedidoDeSimulacion;
  assertEquals(validarPedido(sinTasa), ["La tasa tiene que ser un número."]);
  const seguroRaro = { monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: 12, desgravamen: 5 } as unknown as PedidoDeSimulacion;
  assertEquals(simularCredito(seguroRaro).ok, false);
  assertEquals(simularCredito(null as unknown as PedidoDeSimulacion).ok, false);
  // null quiere decir «el del producto», igual que ausente.
  const conNulos = { monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: 12, sistema: null, desgravamen: null } as unknown as PedidoDeSimulacion;
  assertEquals(simularCredito(conNulos).ok, true);
});

// El monto máximo se comprueba contra el simulador: la cuota del monto devuelto
// no pasa el tope y la de un centavo más sí (o ya es el techo).
function comprobarMaximo(tope: number, condiciones: Omit<PedidoDeSimulacion, "monto">, caso: string) {
  const monto = montoMaximoParaCuota(tope, condiciones) as number;
  const cuota = (m: number) => simular({ ...condiciones, monto: m }).cuotaPrimerMes;
  const topeC = Math.floor(tope * 100 + 1e-6);
  if (monto > 0) assert(centavos(cuota(monto)) <= topeC, `${caso}: ${monto} pasa el tope`);
  if (monto < MONTO_MAXIMO) assert(centavos(cuota(Math.round((monto + 0.01) * 100) / 100)) > topeC, `${caso}: ${monto} no es el máximo`);
}

Deno.test("montoMaximoParaCuota: el más alto que cabe, en los dos sistemas, con las dos bases de seguro, de 1 a 480 meses, con tasa 0 y en el tope", () => {
  for (const sistema of ["frances", "aleman"] as const) {
    for (const base of ["saldo", "monto"] as const) {
      for (const plazoMeses of [1, 2, 7, 36, 480]) {
        for (const tasa of [0, 9.5, 15]) {
          for (const tope of [0.01, 1, 87.5, 351.65, 1999.99, 25000]) {
            const condiciones = { plazoMeses, tasaNominalAnualPorcentaje: tasa, sistema, desgravamen: { tasaPorcentaje: 0.6, periodicidad: "anual" as const, base } };
            comprobarMaximo(tope, condiciones, `${sistema} ${base} ${plazoMeses} ${tasa} ${tope}`);
          }
        }
      }
    }
  }
});

Deno.test("montoMaximoParaCuota: el ruido de coma flotante del tope no cambia la respuesta", () => {
  const condiciones = { plazoMeses: 36, tasaNominalAnualPorcentaje: 15 };
  const exacto = montoMaximoParaCuota(351.65, condiciones);
  // 351,65 calculado como lo calcula la capacidad: ingreso neto por la carga.
  assertEquals(montoMaximoParaCuota(879.125 * 0.4, condiciones), exacto);
  assertEquals(montoMaximoParaCuota(351.65 - 1e-12, condiciones), exacto);
  assertEquals(montoMaximoParaCuota(351.65 + 1e-12, condiciones), exacto);
  // Un tope con fracción de centavo vale lo que el centavo de abajo.
  assertEquals(montoMaximoParaCuota(351.649, condiciones), montoMaximoParaCuota(351.64, condiciones));
});

Deno.test("montoMaximoParaCuota: con un tope enorme devuelve el techo del simulador y termina", () => {
  const condiciones = { plazoMeses: 480, tasaNominalAnualPorcentaje: 15 };
  assertEquals(montoMaximoParaCuota(1e12, condiciones), MONTO_MAXIMO);
  assertEquals(montoMaximoParaCuota(Number.POSITIVE_INFINITY, condiciones), MONTO_MAXIMO);
  assertEquals(montoMaximoParaCuota(Number.NaN, condiciones), 0);
  assertEquals(montoMaximoParaCuota(-5, condiciones), 0);
  // Un tope que sí corta antes del techo.
  comprobarMaximo(5_000_000, condiciones, "tope de 5 millones");
  assertEquals(montoMaximoParaCuota(100, { plazoMeses: 12, tasaNominalAnualPorcentaje: 16 }), null);
});
