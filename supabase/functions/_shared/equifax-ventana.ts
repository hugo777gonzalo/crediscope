// La ventana de 24 meses de la conducta de pago de Equifax: UNA regla para la
// estructura (`conductaDePago`, equifax-estructura.ts) y para la franja de la
// pantalla (`franjaDePagos`, src/lib/equifaxPantalla.js). Sin dependencias, para
// que la importen Deno y el navegador.
//
// La ventana termina en el CORTE DEL REPORTE, no en la última fila del detalle
// histórico. El detalle sólo trae los meses en que la persona tuvo una operación:
// quien terminó de pagar hace un año tiene su último mes con filas hace un año, y
// la ventana quedaba corrida a esa fecha (en c-5ee429cc: de sep 2023 a ago 2025,
// con 13 meses «sin deuda» que Equifax nunca cubrió, sin mostrar los 13 meses
// reales hasta sep 2026). `evolucion_deuda_sb_seps_sicom` trae siempre los 24
// meses del reporte, con total 0 donde no hay deuda, y es lo que fija el corte.
// Esa lista NO se suma a la deuda: sólo dice hasta dónde llega el reporte.

export const MESES_DE_LA_VENTANA = 24;

const MES = /^(\d{4})-(\d{2})/;

/** "AAAA-MM" de una fecha ISO, o "" si no es una fecha. */
export function mesDeLaFecha(fecha: unknown): string {
  const m = MES.exec(String(fecha ?? ""));
  return m ? `${m[1]}-${m[2]}` : "";
}

/** El último mes entre los que se den: el corte del reporte. Sin ninguno, null. */
export function corteDelReporte(fechas: Iterable<unknown>): string | null {
  let ultimo = "";
  for (const f of fechas) {
    const m = mesDeLaFecha(f);
    if (m > ultimo) ultimo = m;
  }
  return ultimo === "" ? null : ultimo;
}

/** Los 24 meses que terminan en `corte`, del más viejo al último. */
export function mesesHastaElCorte(corte: string): string[] {
  const [anio, mes] = corte.split("-").map(Number);
  const meses: string[] = [];
  for (let i = MESES_DE_LA_VENTANA - 1; i >= 0; i--) {
    meses.push(new Date(Date.UTC(anio, mes - 1 - i, 1)).toISOString().slice(0, 7));
  }
  return meses;
}
