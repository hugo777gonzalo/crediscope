// El simulador se prueba contra cuotas calculadas a mano con la fórmula del
// sistema francés, cuota = monto · i / (1 − (1 + i)^−n), y contra lo que
// tiene que cumplir cualquier tabla: el capital suma el monto y el saldo
// termina en cero.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assert, assertAlmostEquals } from "jsr:@std/assert@1";
import { simularCredito, type PedidoDeSimulacion, type Simulacion } from "./simulador-credito.ts";

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
