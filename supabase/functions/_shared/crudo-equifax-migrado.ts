// El crudo de las consultas a Equifax migradas de AWS, guardado en Storage (148).
//
// POR QUÉ: el 2026-11-06 la base pasó los 500 MB del plan Free y 50 MB eran el crudo de las 3.542
// migradas (14 KB cada una). Comprimido en Storage pesa unos 8 KB y hay 1 GB. Es una medida TEMPORAL
// y sólo de las migradas (negocio, 2026-11-05): las consultas que pagamos nosotros siguen con su
// crudo en `consultas_equifax.respuesta_cruda`.
//
// El nombre del objeto lleva el id de la consulta en AWS y no una cédula ni un client_id: aparece en
// listados y registros, y así un JSON bajado que todavía no tiene fila ya tiene su lugar.
//   aws/<id_consulta_equifax>.json.gz       el `response_json` tal cual, que es lo que va a respuesta_cruda
//   aws/respaldo/lote-NNNNNN.jsonl.gz       el resto de cada fila de AWS (sin response_json), de respaldo
//
// El único que escribe es scripts/subir-equifax-migrado-a-storage.mjs. Lee todo el que necesita el
// crudo: equifax-persistencia.ts (guardarTablasDeLaConsulta y ordenarConsultaGuardada) y, desde la
// p4 de la revisión del análisis, buro-de-la-institucion.ts, que busca por cédula en el índice.

import { documentoDeLaRespuesta } from "./equifax-client.ts";

// deno-lint-ignore no-explicit-any
type Base = any;

export const BUCKET_CRUDO_EQUIFAX_MIGRADO = "crudo-equifax-migrado";

export function rutaDelCrudoMigrado(idConsultaAws: string | number): string {
  return `aws/${idConsultaAws}.json.gz`;
}

export function rutaDelRespaldoDeLote(lote: number): string {
  return `aws/respaldo/lote-${String(lote).padStart(6, "0")}.jsonl.gz`;
}

export async function comprimirTexto(texto: string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}

export async function descomprimirTexto(bytes: Uint8Array): Promise<string> {
  return await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

// El crudo de una consulta guardada: el de la fila si lo tiene y, si no, el de Storage. Lanza si la
// fila no lo tiene en ningún lado o si el objeto no se puede leer: quien llama decide cómo decirlo
// (guardarTablasDeLaConsulta lo devuelve como ok:false). Nunca devuelve null en silencio, porque
// derivar tablas de «nada» deja una consulta pagada que nadie puede leer.
export async function leerCrudoDeLaConsulta(
  db: Base,
  consulta: { respuesta_cruda?: unknown; crudo_ruta?: string | null },
): Promise<unknown> {
  if (consulta.respuesta_cruda != null) return consulta.respuesta_cruda;
  if (!consulta.crudo_ruta) throw new Error("la consulta no tiene crudo ni ruta en Storage");
  return await bajarJson(db, consulta.crudo_ruta);
}

async function bajarJson(db: Base, ruta: string): Promise<unknown> {
  const { data, error } = await db.storage.from(BUCKET_CRUDO_EQUIFAX_MIGRADO).download(ruta);
  if (error || !data) throw new Error("no se pudo bajar el crudo de Storage");
  return JSON.parse(await descomprimirTexto(new Uint8Array(await data.arrayBuffer())));
}

// ---------- El índice por cédula ----------
//
// POR QUÉ: de las 20.560 consultas de AWS en el depósito, sólo 3.542 tienen fila en consultas_equifax;
// las demás no se encontraban por cédula, porque el objeto se llama por el id de AWS. El 2026-11-09 el
// negocio decidió que el análisis lea la última consulta de la persona aunque no esté vigente (p4 de
// la revisión del análisis: 214 de 247 análisis pedían una cuota que Equifax ya tenía). Darles fila a
// las otras 17.000 sumaba unos 15 MB a una base de 396 de 500 MB, más una persona en `clients` por cada
// una que no estaba; un solo objeto en este depósito pesa 288 KB comprimido y nada en la base.
//
// El índice va en el mismo depósito privado que los crudos, que ya traen la cédula adentro. El nombre
// del objeto no la lleva. Sólo entra una respuesta con reporte, de una cédula y con fecha (lo mismo
// que migra scripts/migrar-equifax-aws.mjs) y cuyo crudo está en el depósito. Lo arma la fase
// `--indice` de subir-equifax-migrado-a-storage.mjs; con otra bajada de AWS se vuelve a armar.

export const RUTA_DEL_INDICE_POR_CEDULA = "aws/indice/por-cedula.json.gz";
export const FORMATO_DEL_INDICE = "crediscope-indice-equifax-aws-1";

export interface IndiceDelCrudoMigrado {
  formato: typeof FORMATO_DEL_INDICE;
  generadoEl: string;
  consultas: number;
  // cédula -> [id de AWS, consultada el (ISO, UTC)], la más reciente primero.
  personas: Record<string, Array<[string, string]>>;
}

export interface EntradaDelIndice {
  idAws: string;
  cedula: string;
  consultadaEl: string;
}

// Una fecha de AWS sin zona es hora de Ecuador: leída con la zona de la máquina, una consulta de las
// 20:00 caía en otro día (scripts/CLAUDE.md, predictor de ingresos). La misma conversión que
// migrar-equifax-aws.mjs usa para created_at: si difieren, una consulta migrada y su entrada en el
// índice dejan de ser la misma.
export function fechaDeAws(texto: unknown): string | null {
  const t = String(texto ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) return null;
  const d = new Date(t.replace(/(\.\d{3})\d*$/, "$1") + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? "" : "-05:00"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Qué fila de AWS entra al índice, y si no, por qué. El mismo criterio que la migración: Equifax
// contestó con un reporte, el documento es una cédula y la consulta tiene fecha.
export function entradaDelIndice(
  fila: Record<string, unknown>,
): { ok: true; entrada: EntradaDelIndice } | { ok: false; motivo: "sin_respuesta_util" | "sin_documento" | "documento_invalido" | "sin_fecha" } {
  const cuerpo = fila.response_json as Record<string, unknown> | null | undefined;
  if (fila.estado !== 1 || !cuerpo || typeof cuerpo !== "object" || !cuerpo.reporteCrediticio) return { ok: false, motivo: "sin_respuesta_util" };
  const cedula = documentoDeLaRespuesta(cuerpo);
  if (cedula === null) return { ok: false, motivo: "sin_documento" };
  if (!/^\d{10}$/.test(cedula)) return { ok: false, motivo: "documento_invalido" };
  const consultadaEl = fechaDeAws(fila.fecha_consulta) ?? fechaDeAws(fila.fecha_creacion);
  if (!consultadaEl) return { ok: false, motivo: "sin_fecha" };
  return { ok: true, entrada: { idAws: String(fila.id_consulta_equifax), cedula, consultadaEl } };
}

export function armarIndiceDelCrudoMigrado(entradas: EntradaDelIndice[], generadoEl: string): IndiceDelCrudoMigrado {
  const personas: Record<string, Array<[string, string]>> = {};
  const vistas = new Set<string>();
  for (const e of entradas) {
    // Un id repetido entre lotes es la misma consulta: contarla dos veces la mostraba como dos.
    if (vistas.has(e.idAws)) continue;
    vistas.add(e.idAws);
    (personas[e.cedula] ??= []).push([e.idAws, e.consultadaEl]);
  }
  for (const lista of Object.values(personas)) lista.sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : Number(b[0]) - Number(a[0])));
  return { formato: FORMATO_DEL_INDICE, generadoEl, consultas: vistas.size, personas };
}

// Las consultas de AWS de una persona hechas hasta `hasta`, la más reciente primero. Nunca una
// posterior: en un análisis con fecha pasada, un buró de después ya trae la mora que se quiere predecir.
export function consultasDelIndice(
  indice: IndiceDelCrudoMigrado | null,
  cedula: string,
  hasta: Date,
): Array<{ idAws: string; consultadaEl: string; ruta: string }> {
  return (indice?.personas[cedula] ?? [])
    .filter(([, f]) => new Date(f).getTime() <= hasta.getTime())
    .map(([idAws, consultadaEl]) => ({ idAws, consultadaEl, ruta: rutaDelCrudoMigrado(idAws) }));
}

// El índice se lee una vez por instancia y se guarda unos minutos: son 288 KB y cada análisis lo
// necesitaría. Cambia sólo cuando se vuelve a armar, y no hay apuro en que se note al instante.
const VIDA_DEL_INDICE_MS = 10 * 60 * 1000;
let indiceEnMemoria: { indice: IndiceDelCrudoMigrado | null; leidoEl: number } | null = null;

export function olvidarElIndice(): void {
  indiceEnMemoria = null;
}

// null sólo si el índice todavía no existe en el depósito: entonces el análisis lee las consultas que
// tienen fila, como antes de armarlo. Cualquier otra falla lanza: un error disimulado como «sin índice»
// es un análisis sin buró que nadie ve.
export async function leerIndiceDelCrudoMigrado(db: Base, ahoraMs: number = Date.now()): Promise<IndiceDelCrudoMigrado | null> {
  if (indiceEnMemoria && ahoraMs - indiceEnMemoria.leidoEl < VIDA_DEL_INDICE_MS) return indiceEnMemoria.indice;
  const { data, error } = await db.storage.from(BUCKET_CRUDO_EQUIFAX_MIGRADO).download(RUTA_DEL_INDICE_POR_CEDULA);
  let indice: IndiceDelCrudoMigrado | null = null;
  if (error || !data) {
    const noExiste = /not.?found/i.test(String(error?.message ?? "")) || String(error?.statusCode ?? error?.status ?? "") === "404";
    if (!noExiste) throw new Error("no se pudo leer el índice de las consultas de AWS");
  } else {
    const leido = JSON.parse(await descomprimirTexto(new Uint8Array(await data.arrayBuffer())));
    if (leido?.formato !== FORMATO_DEL_INDICE || typeof leido.personas !== "object") throw new Error("el índice de las consultas de AWS tiene otro formato");
    indice = leido as IndiceDelCrudoMigrado;
  }
  indiceEnMemoria = { indice, leidoEl: ahoraMs };
  return indice;
}

// El crudo de una consulta de AWS que no tiene fila, por su ruta en el depósito.
export async function leerCrudoMigrado(db: Base, ruta: string): Promise<unknown> {
  return await bajarJson(db, ruta);
}
