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

import type { RespuestaProveedorInfo1 } from "./types.ts";

/**
 * El estado de cada FUENTE, una por una.
 *
 * Hasta la migración 078 esto se agregaba a nueve bloques y el detalle
 * se tiraba. Un bloque figuraba "ok" si contestaba AL MENOS UNA de sus
 * fuentes, y `bancos` tenía catorce: podía estar en verde con trece
 * caídas. Medido sobre los perfiles del 2026-09-17, "9 de 9 ejes" quería
 * decir entre 14 y 25 de 52 fuentes.
 */
export function estadoPorFuente(raw: RespuestaProveedorInfo1): Record<string, string> {
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

// Con qué lista se juzgó una consulta: va en la constancia de cada freno.
export const LISTA_DE_FUENTES_VERSION = "fuentes-obligatorias-v1";

export type NivelDeFuente = "obligatoria" | "secundaria_de_peso" | "secundaria";

/**
 * Cómo dice una fuente que no tiene nada de la persona. `vacio`: contesta OK con
 * el sobre vacío, y un `faltante` es una falla. `faltante`: nunca contesta vacío
 * (medido el 2026-10-03: 0 de 2.567), su «no hay» es ese.
 */
export type FormaDeNoHay = "vacio" | "faltante";

interface FichaDeFuente {
  nivel: NivelDeFuente;
  noHay: FormaDeNoHay;
  /** Cómo se la nombra ante el analista. Las secundarias no se nombran. */
  tema?: string;
}

const SECUNDARIA: FichaDeFuente = { nivel: "secundaria", noHay: "vacio" };

/**
 * Cada fuente, con lo que pasa si no contesta (negocio, 2026-10-31). Es la única
 * lista: la leen la pantalla, la solicitud, la API y el lote, y hasta acá había
 * dos que se contradecían (`FUENTES_QUE_DECIDEN` frenaba y `TEMAS_CRITICOS` sólo
 * impedía «aprobar»).
 *
 * - Obligatoria: sin ella el modelo no corre. Al faltar puede esconder un bloqueo,
 *   cambiar el segmento o el ingreso, o esconder una deuda que se tomaría por
 *   cero. Con estas 21 contestando y todas las demás caídas no cambió ningún
 *   bloqueo, segmento, ingreso ni cuota en 2.566 personas. Las 5 que frenaban
 *   desde el 2026-10-31 perdían 68 de 73 bloqueos, 38 de ellos de `listaNegra`.
 * - Secundaria de peso: se analiza, pero con `error` la entrega es «parcial» y
 *   nunca «aprobar».
 * - Secundaria: se dice en lo que no se consultó y nada más.
 *
 * `afiliacionIess` no puede ser obligatoria aunque parezca: contesta «información
 * inconsistente» para el 94,7% de las personas en un día sano.
 */
export const FUENTES: Readonly<Record<string, FichaDeFuente>> = {
  // Identidad y bloqueos
  general: { nivel: "obligatoria", noHay: "vacio", tema: "la identidad" },
  listaNegra: { nivel: "obligatoria", noHay: "vacio", tema: "la lista negra" },
  demandas: { nivel: "obligatoria", noHay: "vacio", tema: "las demandas" },
  listasControl: { nivel: "obligatoria", noHay: "vacio", tema: "las listas de control" },
  denuncias: { nivel: "obligatoria", noHay: "vacio", tema: "las denuncias" },
  antecedentesPenales: { nivel: "obligatoria", noHay: "faltante", tema: "los antecedentes penales" },
  // Ingreso y segmento
  basesInternas: { nivel: "obligatoria", noHay: "vacio", tema: "los aportes al IESS" },
  contribuyente: { nivel: "obligatoria", noHay: "vacio", tema: "el RUC" },
  jubilados: { nivel: "obligatoria", noHay: "vacio", tema: "la jubilación" },
  afiliacionIssfacCertMedico: { nivel: "obligatoria", noHay: "vacio", tema: "el seguro social militar" },
  afiliacionSiisspol: { nivel: "obligatoria", noHay: "vacio", tema: "el seguro social policial" },
  sriImpuestoRenta: { nivel: "obligatoria", noHay: "faltante", tema: "el impuesto a la renta" },
  establecimientoActEconomica: { nivel: "obligatoria", noHay: "vacio", tema: "los establecimientos del RUC" },
  empleados: { nivel: "obligatoria", noHay: "vacio", tema: "los empleados a su cargo" },
  // Deuda
  buroCreditoSuper: { nivel: "obligatoria", noHay: "vacio", tema: "el buró de bancos" },
  creditoQuirografario: { nivel: "obligatoria", noHay: "vacio", tema: "los préstamos del BIESS" },
  creditoHipotecario: { nivel: "obligatoria", noHay: "vacio", tema: "los préstamos del BIESS" },
  buroCreditoCoop: { nivel: "obligatoria", noHay: "vacio", tema: "las cooperativas" },
  buroCreditoDiners: { nivel: "obligatoria", noHay: "vacio", tema: "las tarjetas Diners" },
  retails: { nivel: "obligatoria", noHay: "vacio", tema: "las casas comerciales" },
  pensionAlimenticiaProveedorInfo1: { nivel: "obligatoria", noHay: "vacio", tema: "las pensiones alimenticias" },

  trabajoHistoricosMecanizado: { nivel: "secundaria_de_peso", noHay: "vacio", tema: "el historial mensual de aportes" },
  trabajoHistoricos: { nivel: "secundaria_de_peso", noHay: "vacio", tema: "los empleos registrados en el IESS" },
  vehiculos: { nivel: "secundaria_de_peso", noHay: "faltante", tema: "los vehículos" },
  demandasOfendido: { nivel: "secundaria_de_peso", noHay: "vacio", tema: "las demandas que presentó" },
  inversiones: { nivel: "secundaria_de_peso", noHay: "vacio", tema: "las inversiones" },
  cumplimientoPatronal: { nivel: "secundaria_de_peso", noHay: "vacio", tema: "el cumplimiento patronal" },
  impedimentoCargosPublicos: { nivel: "secundaria_de_peso", noHay: "faltante", tema: "el impedimento para cargos públicos" },
  bienesInmueble: { nivel: "secundaria_de_peso", noHay: "vacio", tema: "los inmuebles" },

  direcciones: SECUNDARIA,
  telefonos: SECUNDARIA,
  correo: SECUNDARIA,
  padres: SECUNDARIA,
  hijos: SECUNDARIA,
  titulos: SECUNDARIA,
  licenciaConducir: SECUNDARIA,
  deudasAnt: SECUNDARIA,
  deudasAmt: SECUNDARIA,
  deudasEmov: SECUNDARIA,
  polizas: SECUNDARIA,
  siniestros: SECUNDARIA,
  afiliacionIess: { ...SECUNDARIA, noHay: "faltante" },
  afiliacionIsspol: SECUNDARIA,
  afiliacionSalud: SECUNDARIA,
  pensionista: SECUNDARIA,
  administraciones: SECUNDARIA,
  sercop: { ...SECUNDARIA, noHay: "faltante" },
  deudores: SECUNDARIA,
  pensionAlimenticia: SECUNDARIA,
  // Apagadas: dos dan 404 siempre y la otra un sobre vacío (2026-09-16).
  deudasFirmes: { ...SECUNDARIA, noHay: "faltante" },
  afiliacionIssfacFuerzaArmada: { ...SECUNDARIA, noHay: "faltante" },
  vacunados: SECUNDARIA,
};

const delNivel = (nivel: NivelDeFuente) => Object.keys(FUENTES).filter((f) => FUENTES[f].nivel === nivel);
const OBLIGATORIAS = delNivel("obligatoria");
const SECUNDARIAS_DE_PESO = delNivel("secundaria_de_peso");

type EstadoDeLaConsulta = Record<string, string> | null | undefined;

// `faltante` no cuenta como respuesta: ahí caen también errores de la fuente (el
// 2026-10-03, sin un error marcado, 62 personas figuraban sin denuncias por una
// falla, y 15 las tenían). Salvo donde es su «no hay»: renta y antecedentes fallan
// siempre en las mismas personas, y frenarlas sería dejarlas afuera para siempre.
//
// "deshabilitado" la apagó quien administra la configuración: frenar por eso
// dejaría sin análisis a toda la base por un ajuste, y no es que no contestó.
function laObligatoriaContesto(fuente: string, e: string | undefined): boolean {
  if (e === "ok" || e === "ok_vacio" || e === "deshabilitado") return true;
  return e === "faltante" && FUENTES[fuente].noHay === "faltante";
}

/**
 * Las obligatorias que no contestaron. Se lee `client_profiles.estado_por_fuente`
 * o lo que devuelve `estadoPorFuente`. Sin ese detalle no hay nada que juzgar:
 * el 2026-10-31 lo tienen los 3.765 últimos perfiles de personas reales.
 */
export function obligatoriasSinRespuesta(estado: EstadoDeLaConsulta): string[] {
  if (!estado || Object.keys(estado).length === 0) return [];
  return OBLIGATORIAS.filter((fuente) => !laObligatoriaContesto(fuente, estado[fuente]));
}

export function elPerfilSePuedeAnalizar(estado: EstadoDeLaConsulta): boolean {
  return obligatoriasSinRespuesta(estado).length === 0;
}

/** Las secundarias de peso con error: en este nivel `faltante` cuenta como respuesta. */
export function secundariasDePesoConError(estado: EstadoDeLaConsulta): string[] {
  return SECUNDARIAS_DE_PESO.filter((fuente) => estado?.[fuente] === "error");
}

/**
 * Lo que se entrega de un análisis. «parcial» es faltó una secundaria de peso, o
 * una obligatoria en una negativa por control: decir «completa» ahí sería afirmar
 * lo que no se consultó. La regla es de la entrega: el análisis guardado no se toca.
 */
export function completitudDeLaConsulta(estado: EstadoDeLaConsulta): "completa" | "parcial" {
  return obligatoriasSinRespuesta(estado).length > 0 || secundariasDePesoConError(estado).length > 0 ? "parcial" : "completa";
}

export function recomendacionDeLaEntrega<T>(recomendacion: T, completitud: string | null | undefined): T | "revisar" {
  return recomendacion === "aprobar" && completitud === "parcial" ? "revisar" : recomendacion;
}

/**
 * Qué se hace con una consulta antes del modelo. Un bloqueo encontrado es un hecho
 * aunque falte otra fuente, así que niega sin modelo: frenarlo pediría reconsultar
 * a alguien que ya se sabe que no pasa (decisión del negocio, 2026-10-31).
 */
export function decisionDeLaConsulta(estado: EstadoDeLaConsulta, control: { bloqueado?: boolean } | null | undefined): "analizar" | "negar_por_control" | "frenar" {
  if (elPerfilSePuedeAnalizar(estado)) return "analizar";
  return control?.bloqueado === true ? "negar_por_control" : "frenar";
}

const UN_DIA_MS = 24 * 3_600_000;

/**
 * Las obligatorias cuya falla no se va: siguen en `faltante` y ya estaban así un
 * día antes, sin haber contestado en el medio. `consultas`, de la más nueva a la
 * más vieja. Son personas y no caídas: 5 con `listaNegra` y 1 con `general` el
 * 2026-09-25 y el 2026-10-03, y reconsultar no les cambia nada. Un `error` no
 * cuenta: es del proveedor, y una caída de varios días lo repetiría en todos.
 */
export function obligatoriasQueNoSeVan(consultas: Array<{ created_at: string; estado_por_fuente: EstadoDeLaConsulta }>): string[] {
  const [ultima, ...anteriores] = consultas;
  if (!ultima) return [];
  return obligatoriasSinRespuesta(ultima.estado_por_fuente).filter((fuente) => {
    if (ultima.estado_por_fuente?.[fuente] !== "faltante") return false;
    for (const c of anteriores) {
      const e = c.estado_por_fuente?.[fuente];
      if (e === "ok" || e === "ok_vacio") return false;
      if (e === "faltante" && Date.parse(ultima.created_at) - Date.parse(c.created_at) >= UN_DIA_MS) return true;
    }
    return false;
  });
}

// Alcanza: reconsultar a la misma persona más de diez veces en un día no pasa.
const CONSULTAS_QUE_SE_MIRAN = 10;

/**
 * ¿Esta persona queda sin score y a revisión manual? (negocio, 2026-10-31: sin un
 * administrador que autorice.) Recibe el cliente de la base de quien pregunta: lo
 * llaman las funciones y la pantalla.
 */
// deno-lint-ignore no-explicit-any
export async function requiereRevisionManual(db: any, clientId: string): Promise<boolean> {
  const { data, error } = await db
    .from("client_profiles")
    .select("created_at, estado_por_fuente")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(CONSULTAS_QUE_SE_MIRAN);
  // Sin la historia no se puede afirmar: queda el mensaje de reconsultar.
  return !error && obligatoriasQueNoSeVan(data ?? []).length > 0;
}

// Se nombran hasta seis, como en `porQueNoSirve`: con una caída faltan las 21.
function listaDeTemas(fuentes: string[]): string {
  const temas = [...new Set(fuentes.map((f) => FUENTES[f].tema as string))];
  const nombrados = temas.slice(0, 6);
  const resto = temas.length - nombrados.length;
  if (resto > 0) return `${nombrados.join(", ")} y ${resto} ${resto === 1 ? "tema" : "temas"} más`;
  return nombrados.length > 1 ? `${nombrados.slice(0, -1).join(", ")} y ${nombrados[nombrados.length - 1]}` : nombrados[0];
}

/** Los temas que faltan, en palabras del analista y sin repetir. */
export function temasSinRespuesta(estado: EstadoDeLaConsulta): string[] {
  return [...new Set(obligatoriasSinRespuesta(estado).map((f) => FUENTES[f].tema as string))];
}

/**
 * El mensaje para quien pidió el análisis: nombra los temas y no las fuentes,
 * y dice qué hacer. No lleva nada de lo que contestó la fuente.
 */
export function porQueNoSePuedeAnalizar(estado: EstadoDeLaConsulta, revisionManual = false): string {
  const lista = listaDeTemas(obligatoriasSinRespuesta(estado));
  if (revisionManual) {
    return `La consulta sigue incompleta después de reconsultarla: no se pudo obtener ${lista}. La persona queda sin score y pasa a revisión manual.`;
  }
  return `La consulta quedó incompleta: no se pudo obtener ${lista}. El modelo no analizó a la persona. Reconsultala en unos minutos.`;
}

/** Por qué la recomendación no pasa de «Revisar». */
export function porQueEsParcial(estado: EstadoDeLaConsulta): string {
  // También las obligatorias: un análisis hecho antes de esta lista puede tenerlas sin respuesta.
  const lista = listaDeTemas([...obligatoriasSinRespuesta(estado), ...secundariasDePesoConError(estado)]);
  return `Consulta parcial: no se pudo obtener ${lista}. La recomendación no pasa de Revisar.`;
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
export function sePuedeAfirmarQueNoAporta(raw: RespuestaProveedorInfo1): boolean {
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
