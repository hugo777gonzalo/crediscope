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
