// ¿Sirve de algo lo que devolvió la fuente?
//
// POR QUÉ EXISTE ESTE ARCHIVO
//
// El 2026-09-15, entre las 17:00 y las 18:00, la fuente falló. De 914
// consultas de esa hora, 373 devolvieron error en todas las fuentes:
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
// una pregunta como esta. `consultarTodasLasFuentes` no lanza excepción:
// devuelve `status: "error"` adentro de cada fuente, y todo lo de abajo
// lo trata igual que una fuente vacía. La única defensa que existía
// --`personaNoExiste`-- busca el texto "no existe" y un error técnico
// pasa de largo.
//
// Vive acá y no adentro de cada función porque las dos puertas de
// entrada (la consulta individual y el trabajador de lotes) tienen que
// aplicar el mismo criterio. Dos copias de esta regla es exactamente
// cómo volvería a pasar por una sola de las dos puertas.

import type { RespuestaNovadata } from "./types.ts";

/**
 * El estado de cada FUENTE, una por una.
 *
 * Hasta la migración 078 esto se agregaba a nueve bloques y el detalle
 * se tiraba. Un bloque figuraba "ok" si contestaba AL MENOS UNA de sus
 * fuentes, y `bancos` tenía catorce: podía estar en verde con trece
 * caídas. Medido sobre los perfiles del 2026-09-17, "9 de 9 ejes" quería
 * decir entre 14 y 25 de 52 fuentes.
 */
export function estadoPorFuente(raw: RespuestaNovadata): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const [fuente, resultado] of Object.entries(raw)) {
    if (!resultado || typeof resultado !== "object" || !("status" in resultado)) continue;
    salida[fuente] = resultado.status === "ok" && !traeContenido(resultado) ? "ok_vacio" : String(resultado.status);
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
 * Las fuentes que contestaron algo, con contenido o sin él.
 *
 * "faltante" NO entra: ahí la fuente no llegó a contestar. Sí entra
 * `ok_vacio` --la fuente contestó "no hay nada para esta persona"--,
 * porque eso es una respuesta y no un hueco: "no tiene deudas" es un
 * hecho. Descartarla sería el mismo error del 2026-09-15 al revés,
 * tratar una respuesta como si nadie hubiera contestado.
 */
export function fuentesQueContestaron(estado: Record<string, string>): string[] {
  return Object.entries(estado)
    .filter(([, e]) => e === "ok" || e === "ok_vacio")
    .map(([fuente]) => fuente);
}

export function fuentesConError(estado: Record<string, string>): string[] {
  return Object.entries(estado)
    .filter(([, e]) => e === "error")
    .map(([fuente]) => fuente);
}

/**
 * ¿Hay algo que guardar?
 *
 * Con cero fuentes contestadas no hay perfil: hay una consulta que no se
 * pudo hacer. Guardarla produce una ficha en blanco indistinguible de
 * la de alguien sin historial, y el sistema termina afirmando cosas
 * sobre una persona de la que no leyó un solo campo.
 */
export function laConsultaSirve(estado: Record<string, string>): boolean {
  return fuentesQueContestaron(estado).length > 0;
}

/**
 * El mensaje para quien pidió la consulta. Nombra las fuentes que
 * fallaron porque "falló la fuente" no le sirve a nadie para decidir si
 * reintentar ahora o en una hora.
 *
 * Se nombran hasta seis: con 52 fuentes, una caída total producía un
 * mensaje de varias líneas que nadie termina de leer.
 */
export function porQueNoSirve(estado: Record<string, string>): string {
  const conError = fuentesConError(estado);
  if (conError.length === 0) {
    return "La fuente de datos no devolvió ningún dato para esta persona. No se guardó nada.";
  }
  const muestra = conError.slice(0, 6).join(", ");
  const resto = conError.length > 6 ? ` y ${conError.length - 6} más` : "";
  return `La fuente de datos no respondió: fallaron ${conError.length} de ${Object.keys(estado).length} fuentes (${muestra}${resto}). No se guardó nada — volvé a intentar en unos minutos.`;
}

/**
 * ¿Se puede afirmar que esta persona NO aporta al IESS?
 *
 * Los aportes llegan en basesInternas (nova_bases_internas -> tiess). Si
 * esa fuente no contestó, la ausencia de aportes no dice nada de la
 * persona: dice que no preguntamos bien. La diferencia entre "no aporta"
 * y "no sé si aporta" es la diferencia entre un segmento y otro.
 *
 * Hasta la 078 esto preguntaba por el bloque `bancos` entero, y ahí
 * había un agujero: el bloque figuraba "ok" porque contestaba cualquiera
 * de sus otras trece fuentes --retails, inversiones, listaNegra-- aunque
 * basesInternas hubiera fallado. O sea que se afirmaba "no aporta"
 * justo en el caso en que no se sabía. Ahora se pregunta por la fuente
 * que trae el dato.
 */
export function sePuedeAfirmarQueNoAporta(raw: RespuestaNovadata): boolean {
  return raw.basesInternas?.status === "ok";
}

/**
 * ¿El perfil YA GUARDADO sirve? Contesta sobre las dos épocas.
 *
 * Los perfiles anteriores al 2026-09-17 no tienen `fuentes_ok`: se
 * guardó sólo el agregado por bloque y el detalle por fuente no se puede
 * reconstruir, porque se perdió al agregarlo (ver la 068). Son 2.681
 * perfiles buenos cuya única prueba de calidad es `ejes_ok`.
 *
 * Leer una sola de las dos formas no da error: da un conteo silencioso
 * de menos. Mirando sólo `fuentes_ok`, esos 2.681 parecerían consultas
 * fallidas y el lote los volvería a consultar a todos.
 */
export function elPerfilSirve(perfil: { fuentes_ok?: number | null; ejes_ok?: number | null }): boolean {
  if (perfil.fuentes_ok !== null && perfil.fuentes_ok !== undefined) return perfil.fuentes_ok > 0;
  return (perfil.ejes_ok ?? 0) > 0;
}

/**
 * Qué se pudo medir, leído del perfil guardado. Como `elPerfilSirve`,
 * entiende las dos épocas: antes de estructura-v3 las claves eran
 * ejesOk/ejesFaltantes/ejesConError y contaban bloques, no fuentes.
 *
 * La traducción de la época vieja no es exacta y no puede serlo: un eje
 * "ok" podía tener trece de sus catorce fuentes caídas. Por eso viene
 * `porBloques`, para que quien lo muestre pueda decir con qué regla se
 * midió en vez de dar a entender que las dos cifras son comparables.
 */
export function metaDeLaConsulta(meta: Record<string, unknown> | null | undefined): {
  conDatos: string[];
  sinDatos: string[];
  noMedidas: string[];
  porBloques: boolean;
} {
  const lista = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const esViejo = Array.isArray(meta?.ejesOk);
  return {
    conDatos: lista(esViejo ? meta?.ejesOk : meta?.fuentesConDatos),
    sinDatos: lista(esViejo ? meta?.ejesFaltantes : meta?.fuentesSinDatos),
    noMedidas: lista(esViejo ? meta?.ejesConError : meta?.fuentesNoMedidas),
    porBloques: esViejo,
  };
}
