// Los hallazgos del control de bloqueo, armados desde los hechos (docs/capa-de-hechos.md,
// secciones 3.1 y 6, punto 14). Hoy `evaluarControlesBloqueo()` (controles-bloqueo.ts) lee
// el crudo otra vez: son dos lecturas de lo mismo que coinciden por disciplina.
//
// ETAPA A del grupo 3: acá sólo el hallazgo de seguridad ciudadana (`delito_seguridad_ciudadana`
// y `posible_homonimo_en_demanda_penal`), y nada lo llama todavía. `comparar-hechos.mjs`
// compara en seco, sobre las 3.766 personas, que den lo mismo que `evaluarControlesBloqueo`;
// cuando da cero, `evaluarControlesBloqueo` pasa a llamar esto y deja de leer el crudo para
// esos dos hallazgos. Los demás (fallecido, listas, homónimos, PEP) esperan al grupo de
// cumplimiento.
//
// Los textos los arma delitos-seguridad.ts, los mismos que usa el control de hoy: lo que se
// compara es qué hallazgos salen y con qué categorías, no dos copias de la frase.
//
// Un hecho sin valor porque una fuente no contestó se lee por su `parcial`: es lo que el
// control hace hoy con las filas que llegaron. Una fuente caída no puede desbloquear a
// quien tiene un delito en otra.

import type { HallazgoControlBloqueo } from "../types.ts";
import { type DemandaPenalSinCotejo, mensajeDelDelitoDeSeguridad, mensajeDelPosibleHomonimo } from "../delitos-seguridad.ts";
import type { HechosDeLaPersona } from "./tipos.ts";
import type { RegistroJudicial } from "./grupos/riesgo-judicial.ts";

// El hallazgo y los códigos de los que sale: lo que el control de hoy no dice.
export interface HallazgoDesdeHechos extends HallazgoControlBloqueo {
  derivaDe: string[];
}

export const CODIGOS_DE_SEGURIDAD = ["delito_seguridad_ciudadana", "posible_homonimo_en_demanda_penal"];

export function controlesDesdeHechos(doc: HechosDeLaPersona): HallazgoDesdeHechos[] {
  const hallazgos: HallazgoDesdeHechos[] = [];
  const hecho = (codigo: string) => doc.hechos.find((x) => x.codigo === codigo);

  const categorias = (() => {
    const h = hecho("seg.delito.categorias");
    return ((h?.valor ?? h?.parcial ?? []) as string[]);
  })();
  if (categorias.length > 0) {
    hallazgos.push({ code: "delito_seguridad_ciudadana", message: mensajeDelDelitoDeSeguridad(categorias), bloqueante: true, derivaDe: ["seg.delito.categorias"] });
  }

  // Las demandas por un delito grave que no son de ella, en el orden de la fuente: salen de
  // las entidades y su atribución, que se calculó una sola vez.
  const sinCotejo: DemandaPenalSinCotejo[] = doc.entidades.flatMap((e) => {
    const a = e.atributos as RegistroJudicial;
    if (a.clase !== "demanda_contra_la_persona" || a.categoriasDeSeguridad.length === 0 || e.atribucion.deLaPersona === "si") return [];
    return [{ categorias: a.categoriasDeSeguridad, cotejo: e.atribucion.detalle as DemandaPenalSinCotejo["cotejo"], anio: a.anio }];
  });
  if (sinCotejo.length > 0) {
    hallazgos.push({ code: "posible_homonimo_en_demanda_penal", message: mensajeDelPosibleHomonimo(sinCotejo), bloqueante: false, derivaDe: ["seg.demandas.posible_homonimo.cantidad"] });
  }
  return hallazgos;
}
