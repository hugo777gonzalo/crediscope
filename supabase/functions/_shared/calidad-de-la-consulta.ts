// ¿Sirve de algo lo que devolvió la fuente?
//
// POR QUÉ EXISTE ESTE ARCHIVO
//
// El 2026-09-15, entre las 17:00 y las 18:00, la fuente falló. De 914
// consultas de esa hora, 373 devolvieron error en los nueve bloques:
// cero información sobre esas personas. El sistema guardó un Perfil del
// Cliente igual, y la clasificación de ingresos --al no encontrar
// aportes ni RUC-- cayó en su rama por defecto y las etiquetó como
// "informal o sin actividad".
//
// Eso no es un dato faltante: es una SEÑAL DE RIESGO FABRICADA a partir
// de una falla de infraestructura. El 74% del segmento informal pasó a
// ser basura, y 370 personas quedaron descritas por una caída de red.
//
// La falla fue invisible en las cuatro capas porque en ninguna había
// una pregunta como esta. `fetchAllBlocks` no lanza excepción: devuelve
// `status: "error"` adentro de cada bloque, y todo lo de abajo lo trata
// igual que un bloque vacío. La única defensa que existía
// --`personaNoExiste`-- busca el texto "no existe" y un error técnico
// pasa de largo.
//
// Vive acá y no adentro de cada función porque las dos puertas de
// entrada (la consulta individual y el trabajador de lotes) tienen que
// aplicar el mismo criterio. Dos copias de esta regla es exactamente
// cómo volvería a pasar por una sola de las dos puertas.

import type { BlockStatusMap, RawNovadataResponse } from "./types.ts";

/**
 * El estado de cada bloque, leído de la respuesta cruda.
 *
 * `buildStandardProfile` arma el mismo mapa, pero lo devuelve al final
 * de construir las 125 propiedades del perfil. Acá hace falta antes:
 * la pregunta "¿vale la pena seguir?" se contesta apenas vuelve la
 * fuente, no después de estructurar el vacío.
 */
export function estadoDeLosBloques(raw: RawNovadataResponse): BlockStatusMap {
  return {
    general: raw.general.status,
    sociodemografica: raw.sociodemografica.status,
    trabajo: raw.trabajo.status,
    iess: raw.iess.status,
    vehiculos: raw.vehiculos.status,
    funcion_judicial: raw.funcion_judicial.status,
    fiscalia: raw.fiscalia.status,
    bancos: raw.bancos.status,
    cooperativas: raw.cooperativas.status,
  };
}

/**
 * El estado de cada FUENTE, una por una.
 *
 * Los nueve bloques esconden la mitad de la verdad. `aggregateStatus`
 * marca un bloque como "ok" si contestó AL MENOS UNA de sus fuentes, y
 * el bloque `bancos` tiene catorce: puede figurar en verde con trece
 * caídas. Con eso, "9 de 9 ejes" puede querer decir "9 de 52 fuentes".
 *
 * Esto guarda el detalle que ya viene en la respuesta cruda y que hasta
 * ahora se tiraba al agregarlo. Convive con block_status mientras dure
 * la transición -- ver la migración 068.
 */
export function estadoPorFuente(raw: RawNovadataResponse): Record<string, string> {
  // `general` es el único bloque de una sola fuente: su `data` es la
  // respuesta en sí, no un mapa de fuentes.
  const salida: Record<string, string> = { general: raw.general.status };

  for (const [bloque, resultado] of Object.entries(raw)) {
    if (bloque === "general") continue;
    const porRecurso = (resultado as { data?: unknown })?.data as Record<string, { status?: string }> | null | undefined;
    if (!porRecurso || typeof porRecurso !== "object") continue;
    for (const [fuente, r] of Object.entries(porRecurso)) {
      if (r && typeof r === "object" && "status" in r) {
        salida[fuente] = r.status === "ok" && !traeContenido(r) ? "ok_vacio" : String(r.status);
      }
    }
  }
  return salida;
}

export function cuantasFuentesContestaron(estado: Record<string, string>): number {
  return Object.values(estado).filter((s) => s === "ok").length;
}

/**
 * ¿La fuente contestó con algo adentro, o contestó vacío?
 *
 * Tres de las 52 fuentes se descartaron el 2026-09-16 porque nunca
 * traen nada: dos dan 404 sistemático y una responde OK con el sobre
 * vacío. "Nunca" quiere decir "no en las 16 personas con las que se
 * miró", y eso no es una garantía: el proveedor puede arreglar una ruta
 * o empezar a poblar un padrón sin avisarle a nadie.
 *
 * Por eso se distingue `ok` de `ok_vacio`: si alguna de las tres
 * empieza a traer contenido, queda registrado en cada perfil y la vista
 * fuentes_que_despertaron lo muestra. Es la diferencia entre descartar
 * algo y perderlo de vista.
 */
function traeContenido(resultado: unknown): boolean {
  const payload = (resultado as { data?: unknown })?.data;
  const interior = ((payload as { data?: unknown })?.data ?? payload) as Record<string, unknown> | null;
  if (!interior || typeof interior !== "object") return false;
  for (const [clave, valor] of Object.entries(interior)) {
    // `estado` es el sobre de la respuesta, no su contenido: viene
    // siempre, incluso cuando no hay nada.
    if (clave === "estado") continue;
    if (Array.isArray(valor) && valor.length > 0) return true;
    if (valor && typeof valor === "object" && Object.keys(valor).length > 0) return true;
    if (typeof valor === "string" && valor !== "") return true;
    if (typeof valor === "number") return true;
  }
  return false;
}

/**
 * Los ejes que la fuente contestó de verdad.
 *
 * "faltante" NO cuenta como error: significa que la fuente respondió y
 * dijo que no hay nada para esa persona en ese bloque, que es un dato
 * legítimo. Solo "error" (y "deshabilitado", que es decisión nuestra)
 * quedan afuera.
 */
export function ejesConRespuesta(blockStatus: BlockStatusMap): string[] {
  return Object.entries(blockStatus)
    .filter(([, estado]) => estado === "ok")
    .map(([eje]) => eje);
}

export function ejesConError(blockStatus: BlockStatusMap): string[] {
  return Object.entries(blockStatus)
    .filter(([, estado]) => estado === "error")
    .map(([eje]) => eje);
}

/**
 * ¿Hay algo que guardar?
 *
 * Con cero ejes contestados no hay perfil: hay una consulta que no se
 * pudo hacer. Guardarla produce una ficha en blanco indistinguible de
 * la de alguien sin historial, y el sistema termina afirmando cosas
 * sobre una persona de la que no leyó un solo campo.
 */
export function laConsultaSirve(blockStatus: BlockStatusMap): boolean {
  return ejesConRespuesta(blockStatus).length > 0;
}

/**
 * El mensaje para quien pidió la consulta. Nombra los ejes que fallaron
 * porque "falló la fuente" no le sirve a nadie para decidir si
 * reintentar ahora o en una hora.
 */
export function porQueNoSirve(blockStatus: BlockStatusMap): string {
  const conError = ejesConError(blockStatus);
  return conError.length > 0
    ? `La fuente de datos no respondió: fallaron ${conError.length} de ${Object.keys(blockStatus).length} ejes (${conError.join(", ")}). No se guardó nada — volvé a intentar en unos minutos.`
    : "La fuente de datos no devolvió ningún dato para esta persona. No se guardó nada.";
}

/**
 * ¿Se puede afirmar que esta persona NO aporta al IESS?
 *
 * Los aportes llegan adentro del bloque `bancos` (basesInternas.tiess).
 * Si ese bloque no contestó, la ausencia de aportes no dice nada de la
 * persona: dice que no preguntamos bien. La diferencia entre "no aporta"
 * y "no sé si aporta" es la diferencia entre un segmento y otro.
 */
export function sePuedeAfirmarQueNoAporta(raw: RawNovadataResponse): boolean {
  return raw.bancos?.status === "ok";
}
