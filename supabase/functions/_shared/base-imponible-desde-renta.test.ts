// Montos inventados: ninguna base ni impuesto es de una persona real.
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { ANIOS_CON_TABLA, baseImponibleDesdeRenta, impuestoDeLaBase } from "./base-imponible-desde-renta.ts";

const CENTAVO = 0.0101;

// Primer valor de cada tramo y su límite superior, por año: lo que la resolución publica.
const LIMITES: Record<number, number[]> = {
  2019: [11310, 14410, 18010, 21630, 43250, 64860, 86480, 115290],
  2020: [11315, 14416, 18018, 21639, 43268, 64887, 86516, 115338],
  2021: [11212, 14285, 17854, 21442, 42874, 64297, 85729, 114288],
  2022: [11310, 14410, 18010, 21630, 31630, 41630, 51630, 61630, 100000],
  2023: [11722, 14935, 18666, 22418, 32783, 43147, 53512, 63876, 103644],
  2024: [11902, 15159, 19682, 26031, 34255, 45407, 60450, 80605, 107199],
  2025: [12081, 15387, 19978, 26422, 34770, 46089, 61359, 81817, 108810],
};

Deno.test("los años con tabla son 2019 a 2025", () => {
  assertEquals(ANIOS_CON_TABLA, [2019, 2020, 2021, 2022, 2023, 2024, 2025]);
});

Deno.test("ida y vuelta: del impuesto de una base a esa misma base, en cada año", () => {
  // Bases inventadas en cada tramo (y una muy alta).
  const bases = [11500, 13000, 16000, 19500, 25000, 30000, 45000, 70000, 90000, 150000, 400000];
  for (const anio of ANIOS_CON_TABLA) {
    const techo = LIMITES[anio][0];
    for (const base of bases.filter((b) => b > techo)) {
      const impuesto = impuestoDeLaBase(base, anio)!;
      const r = baseImponibleDesdeRenta(impuesto, anio, "general");
      assertEquals(r.estado, "ok");
      if (r.estado !== "ok") continue;
      assertEquals(r.desde, r.hasta);
      // Las bases publicadas están redondeadas al dólar: el impuesto de un dólar de más o de menos mueve la
      // base a lo sumo 1 / 5% = 20 dólares en el tramo del 5% (en el resto, menos). En 2022, con centavos, es exacta.
      assert(Math.abs(r.desde - base) <= (anio === 2022 ? 0.11 : 20), `${anio}: ${base} -> ${r.desde}`);
      assertAlmostEquals(impuestoDeLaBase(r.desde, anio)!, impuesto, 1.01);
    }
  }
});

Deno.test("ida y vuelta exacta en 2022, que trae las bases con centavos", () => {
  for (const base of [11311, 12345.67, 15000, 20000, 25000, 35000, 45000, 55000, 80000, 120000]) {
    const impuesto = impuestoDeLaBase(base, 2022)!;
    const r = baseImponibleDesdeRenta(impuesto, 2022);
    assertEquals(r.estado, "ok");
    if (r.estado === "ok") assertAlmostEquals(r.desde, base, 0.11); // medio centavo de redondeo del impuesto, dividido por la tasa más baja (5%)
  }
});

Deno.test("la tabla es continua: la base publicada de cada tramo es la acumulada con menos de un dólar de diferencia", () => {
  for (const anio of ANIOS_CON_TABLA) {
    const lim = LIMITES[anio];
    for (let i = 1; i < lim.length; i++) {
      const finDelTramo = impuestoDeLaBase(lim[i], anio)!; // impuesto al final del tramo i (lim[i] es su límite)
      const inicioDelSiguiente = impuestoDeLaBase(lim[i] + 0.01, anio)!;
      assert(Math.abs(inicioDelSiguiente - finDelTramo) <= 1.01, `${anio} en ${lim[i]}: ${finDelTramo} vs ${inicioDelSiguiente}`);
    }
  }
});

Deno.test("los límites de cada tramo se recuperan sin salirse del tramo", () => {
  for (const anio of ANIOS_CON_TABLA) {
    for (const limite of LIMITES[anio].slice(1)) {
      const impuesto = impuestoDeLaBase(limite, anio)!;
      const r = baseImponibleDesdeRenta(impuesto, anio, "general");
      assertEquals(r.estado, "ok");
      if (r.estado === "ok") assert(Math.abs(r.desde - limite) <= 1.01, `${anio}: ${limite} -> ${r.desde}`);
    }
  }
});

Deno.test("valores conocidos de la resolución de 2025", () => {
  // 15.387 es el fin del tramo del 5%: (15.387 - 12.081) * 5% = 165,30, que la tabla publica como 165.
  const r = baseImponibleDesdeRenta(165, 2025, "general");
  assertEquals(r.estado, "ok");
  if (r.estado === "ok") assertAlmostEquals(r.desde, 15387, 1);
  // 500 de impuesto: tramo 19.978 (624) no llega; tramo 15.387 (165): 15.387 + (500 - 165) / 10% = 18.737.
  const q = baseImponibleDesdeRenta(500, 2025, "general");
  if (q.estado === "ok") {
    assertAlmostEquals(q.desde, 18737, CENTAVO);
    assertAlmostEquals(q.mensualDesde, 1561.42, CENTAVO);
    assertEquals(q.soloUnTecho, false);
    assertEquals(q.tramoAbierto, false);
    assertEquals(q.regimenVerificado, true);
  } else throw new Error("debía ser ok");
});

Deno.test("impuesto cero: sólo un techo, la fracción exenta de ese año", () => {
  for (const anio of ANIOS_CON_TABLA) {
    const r = baseImponibleDesdeRenta(0, anio, "general");
    assertEquals(r.estado, "ok");
    if (r.estado !== "ok") continue;
    assertEquals(r.desde, 0);
    assertEquals(r.hasta, LIMITES[anio][0]);
    assertEquals(r.soloUnTecho, true);
    assertAlmostEquals(r.mensualHasta, LIMITES[anio][0] / 12, 0.0051);
  }
});

Deno.test("impuesto positivo mínimo: ya está en el tramo del 5%", () => {
  const r = baseImponibleDesdeRenta(10, 2024);
  assertEquals(r.estado, "ok");
  if (r.estado === "ok") {
    assertAlmostEquals(r.desde, 11902 + 200, CENTAVO); // 10 / 5%
    assertEquals(r.regimenVerificado, false);
  }
});

Deno.test("el último tramo no tiene tope: un impuesto enorme da una base enorme, marcada como tramo abierto", () => {
  const r = baseImponibleDesdeRenta(1_000_000, 2025, "general");
  assertEquals(r.estado, "ok");
  if (r.estado === "ok") {
    assertEquals(r.tramoAbierto, true);
    // 108.810 + (1.000.000 - 24.316) / 37%
    assertAlmostEquals(r.desde, 108810 + (1_000_000 - 24316) / 0.37, 0.02);
  }
});

Deno.test("un impuesto en el hueco entre la acumulada y la base publicada se lleva al límite del tramo", () => {
  // 2019: el tramo 21.630-43.250 llega a 4.192,40 y el siguiente publica 4.193.
  const r = baseImponibleDesdeRenta(4192.8, 2019);
  assertEquals(r.estado, "ok");
  if (r.estado === "ok") assertEquals(r.desde, 43250);
});

Deno.test("casos de borde: negativo, no numérico, año sin tabla", () => {
  assertEquals(baseImponibleDesdeRenta(-1, 2024), { estado: "invalido", motivo: "impuesto_negativo" });
  for (const malo of [NaN, Infinity, null, undefined, "", "  ", "abc", {}, []]) {
    assertEquals(baseImponibleDesdeRenta(malo, 2024), { estado: "invalido", motivo: "impuesto_no_numerico" });
  }
  assertEquals(baseImponibleDesdeRenta(100, "dos mil"), { estado: "invalido", motivo: "anio_invalido" });
  assertEquals(baseImponibleDesdeRenta(100, 2024.5), { estado: "invalido", motivo: "anio_invalido" });
  // Años sin tabla confirmada en una fuente oficial.
  for (const anio of [2018, 2026, 2000]) assertEquals(baseImponibleDesdeRenta(100, anio), { estado: "sin_tabla", anio });
  // Un número en texto es válido: así llega de algunas fuentes.
  assertEquals(baseImponibleDesdeRenta("165", 2025, "general").estado, "ok");
});

Deno.test("RIMPE: no aplica la tabla del régimen general, tenga el año tabla o no", () => {
  assertEquals(baseImponibleDesdeRenta(60, 2024, "rimpe"), { estado: "no_aplica", motivo: "rimpe" });
  assertEquals(baseImponibleDesdeRenta(60, 2030, "rimpe"), { estado: "no_aplica", motivo: "rimpe" });
  // Sin saber el régimen se supone general y se dice.
  const r = baseImponibleDesdeRenta(60, 2024);
  assertEquals(r.estado === "ok" && r.regimenVerificado, false);
});

Deno.test("impuestoDeLaBase rechaza lo que no puede calcular", () => {
  assertEquals(impuestoDeLaBase(-5, 2024), null);
  assertEquals(impuestoDeLaBase(1000, 2018), null);
  assertEquals(impuestoDeLaBase(1000, 2024), 0);
});
