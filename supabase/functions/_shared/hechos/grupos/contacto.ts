// Grupo vacío del paso 0 (docs/capa-de-hechos.md, sección 3.2): el archivo existe
// para que nadie vuelva a tocar `indice.ts` al sumar su grupo. Quien lo llena
// completa las tres exportaciones y no cambia su forma.

import type { Emisor } from "../emisor.ts";
import type { CodigoDelCatalogo, Contexto } from "../tipos.ts";

export const CATALOGO: CodigoDelCatalogo[] = [];

// Las reglas que unen, eligen o descartan registros: el control exige un caso
// que aplica y uno que no por cada una.
export const REGLAS_QUE_MEZCLAN: string[] = [];

export function emitir(_crudo: unknown, _contexto: Contexto, _emisor: Emisor): void {}
