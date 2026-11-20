// El reloj de la capa de hechos (docs/capa-de-hechos.md, 3.1): toda regla que
// dependa de «hoy» lo toma de la fecha de la consulta, nunca de la hora en que
// corre. Así el mismo crudo da los mismos hechos el día que sea; el perfil de
// hoy decide «terminado» con la hora del armado (punto 15 del mapa).

import type { Contexto } from "./tipos.ts";

const MS_POR_DIA = 86_400_000;

// Días desde 1970 (UTC) del instante de la consulta: la misma cuenta que
// process.ts hace con la hora del armado, para que con el reloj fijado en la
// captura las dos den el mismo día.
export function diaDeLaConsulta(contexto: Contexto): number {
  const ms = Date.parse(contexto.fechaDeLaConsulta);
  if (Number.isNaN(ms)) throw new Error("La fecha de la consulta del contexto no es una fecha");
  return Math.floor(ms / MS_POR_DIA);
}

// ---- Lo que el grupo 4 (laboral e ingresos) mide contra «hoy» ----
//
// Copias de los ayudantes de process.ts mientras dure la etapa A del grupo: process.ts
// los usa con `new Date()` y acá el «hoy» es la fecha de la consulta. Leen las partes de
// la fecha en hora local, igual que process.ts: con el mismo reloj dan el mismo número.

// El «hoy» de toda regla: el instante de la consulta, nunca el de la corrida.
export function ahoraDe(contexto: Contexto): Date {
  const ms = Date.parse(contexto.fechaDeLaConsulta);
  if (Number.isNaN(ms)) throw new Error("La fecha de la consulta del contexto no es una fecha");
  return new Date(ms);
}

// Meses ENTEROS entre dos fechas (mesesEntreFechas de process.ts): resta uno si el día
// del mes de la segunda no alcanza al de la primera.
export function mesesEntreFechas(d1: Date, d2: Date): number {
  let meses = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (d2.getDate() < d1.getDate()) meses--;
  return meses;
}

// «dd/mm/aaaa», como la manda el IESS. `new Date(texto)` las leería al revés.
export function parseFechaDDMMYYYY(v: unknown): Date | null {
  const m = typeof v === "string" ? v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Años enteros desde un instante en milisegundos (aniosDesdeMs de process.ts).
const ANTES_DE_1950 = Date.UTC(1950, 0, 1);
export function aniosDesdeMs(v: unknown, ahora: Date): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < ANTES_DE_1950) return null;
  const anios = (ahora.getTime() - n) / (365.25 * 24 * 3600 * 1000);
  return anios >= 0 && anios < 200 ? Math.floor(anios) : null;
}
