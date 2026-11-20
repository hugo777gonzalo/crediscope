// Lo que dos grupos de la capa de hechos leen igual de los aportes al IESS (grupo 4: el
// empleo y los ingresos). Un grupo no importa a otro (docs/capa-de-hechos.md, 3.2): lo que
// comparten vive acá. Son copias de ayudantes de fuentes-ingreso.ts (que no los exporta)
// mientras dure la etapa A; una prueba compara los códigos con su clasificación.

// Valida el rango a propósito (mesClave de fuentes-ingreso.ts): un mes 99 construía «2026-99».
export function mesClave(anio: unknown, mes: unknown): string | null {
  const a = Number(anio);
  const m = Number(mes);
  if (!Number.isInteger(a) || a < 1950 || a > 2100) return null;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  return `${a}-${String(m).padStart(2, "0")}`;
}

// El mes n meses antes (o después, con n negativo) de uno «aaaa-mm».
export function mesMenos(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + (Number(mes.slice(5)) - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// Los códigos de tipo de empleador con que fuentes-ingreso.ts lee un aporte como propio
// (cuenta propia: 3, 8, 24, 30, 31, 32 y 34) o del hogar (35).
export const CODIGOS_DE_AFILIACION_PROPIA = new Set(["3", "8", "24", "30", "31", "32", "34", "35"]);
export const codigoDeTipoDeEmpleador = (tipEmp: unknown): string | null => (String(tipEmp ?? "").match(/^\s*(\d+)\s*-/) ?? [])[1] ?? null;
