import { assertEquals } from "jsr:@std/assert@1";
import { corteDelReporte, mesDeLaFecha, mesesHastaElCorte } from "./equifax-ventana.ts";

Deno.test("el corte del reporte es el último mes de las fechas que se den, en cualquier formato ISO", () => {
  assertEquals(corteDelReporte(["2025-08-31", "2026-09-30 00:00:00.000", null, "", "2024-10-31"]), "2026-09");
  assertEquals(corteDelReporte([]), null);
  assertEquals(corteDelReporte([null, undefined, "sin fecha"]), null);
  assertEquals(mesDeLaFecha("2026-09-30 00:00:00.000000"), "2026-09");
  assertEquals(mesDeLaFecha(undefined), "");
});

Deno.test("la ventana son 24 meses que terminan en el corte, también al cruzar el año", () => {
  const v = mesesHastaElCorte("2026-09");
  assertEquals([v.length, v[0], v[23]], [24, "2024-10", "2026-09"]);
  const w = mesesHastaElCorte("2026-01");
  assertEquals([w[0], w[1], w[23]], ["2024-02", "2024-03", "2026-01"]);
});
