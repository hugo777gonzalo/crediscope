// Los hallazgos del control de bloqueo, armados desde los hechos (docs/capa-de-hechos.md,
// secciones 3.1 y 6, punto 14). Hasta estructura-v26 `evaluarControlesBloqueo()`
// (controles-bloqueo.ts) leía el crudo otra vez: dos lecturas de lo mismo que coincidían por
// disciplina.
//
// ETAPA B del grupo 3 (estructura-v27): `evaluarControlesBloqueo()` toma de acá el hallazgo de
// seguridad ciudadana (`delito_seguridad_ciudadana` y `posible_homonimo_en_demanda_penal`) y ya
// no lee demandas, denuncias ni antecedentes. Medido en seco el 2026-11-20 (etapa A, #189):
// las 3.766 personas dan los mismos hallazgos de las dos maneras (24 bloquean, 16 llevan el
// aviso de homónimo). Los demás hallazgos (fallecido, listas, homónimos, PEP) siguen leyendo el
// crudo: esperan al grupo de cumplimiento.
//
// Los textos los arma delitos-seguridad.ts: lo que se compara es qué hallazgos salen y con qué
// categorías, no dos copias de la frase.
//
// UNA FUENTE CAÍDA NO DESBLOQUEA NI BLOQUEA A NADIE. Un hecho sin valor porque una fuente no
// contestó se lee por su `parcial`: lo que dicen las fuentes que sí contestaron, que es lo que el
// control hizo siempre con las filas que llegaron.
//   - Con un delito en una fuente que contestó (una demanda propia, una denuncia en que es la
//     acusada, un antecedente), bloquea aunque otra fuente esté caída: la caída no lo borra.
//   - Con la fuente de denuncias o la de demandas caída y ningún delito en las otras, no sale
//     hallazgo: no se bloquea por lo que no se pudo mirar. Esa persona no queda «limpia»: la
//     consulta queda incompleta (`demandas`, `denuncias` y `antecedentesPenales` son obligatorias,
//     calidad-de-la-consulta.ts), el modelo no corre, y si luego un hallazgo bloquea se niega por
//     control sin modelo. Reconsultar la fuente es lo que lo resuelve.
//   - El hallazgo sale idéntico al de siempre (sin la lista `derivaDe`): el análisis guarda y el
//     modelo lee estos hallazgos, y cambiarlos es cambiar el mensaje al modelo.

import type { HallazgoControlBloqueo } from "../types.ts";
import { type DemandaPenalSinCotejo, mensajeDelDelitoDeSeguridad, mensajeDelPosibleHomonimo } from "../delitos-seguridad.ts";
import type { HechosDeLaPersona } from "./tipos.ts";
import { CATALOGO as CATALOGO_JUDICIAL, emitir as emitirJudicial, type RegistroJudicial } from "./grupos/riesgo-judicial.ts";
import { crearEmisor } from "./emisor.ts";
import { HECHOS_VERSION } from "./indice.ts";

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

// Los hechos del grupo judicial solos, para el control de bloqueo: derivar los dieciséis grupos
// para leer dos hallazgos costaría lo que no hace falta. Es el mismo `emitir()` que arma el
// perfil (process.ts), con el nombre que lee de `general` y la cédula consultada.
export function hechosJudicialesDelCrudo(crudo: unknown, cedula: string, fechaDeLaConsulta: string): HechosDeLaPersona {
  const contexto = {
    cedula,
    consulta: "control",
    // El grupo no lee el reloj: la marca la pone quien llama (hechos/ no usa el reloj).
    fechaDeLaConsulta,
    corteIess: "",
    persona: { nombre: null, fechaDeNacimiento: null },
  };
  const emisor = crearEmisor(contexto, CATALOGO_JUDICIAL);
  emitirJudicial(crudo, contexto, emisor);
  return { version: HECHOS_VERSION, contexto, ...emisor.resultado() };
}

// El hallazgo de seguridad ciudadana tal como lo entrega el control: sin `derivaDe`.
export function hallazgosDeSeguridadCiudadana(crudo: unknown, cedula: string, fechaDeLaConsulta: string): HallazgoControlBloqueo[] {
  return controlesDesdeHechos(hechosJudicialesDelCrudo(crudo, cedula, fechaDeLaConsulta)).map(({ derivaDe: _derivaDe, ...hallazgo }) => hallazgo);
}
