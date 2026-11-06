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
// crudo: equifax-persistencia.ts (guardarTablasDeLaConsulta y ordenarConsultaGuardada).

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
  const { data, error } = await db.storage.from(BUCKET_CRUDO_EQUIFAX_MIGRADO).download(consulta.crudo_ruta);
  if (error || !data) throw new Error("no se pudo bajar el crudo de Storage");
  return JSON.parse(await descomprimirTexto(new Uint8Array(await data.arrayBuffer())));
}
