// El buró de la institución de una persona: cuál es el buró de la base y,
// si es Equifax, qué consulta de esa persona se lee. Dos reglas, cada una
// con su uso (negocio, 2026-11-09, p4 de la revisión del análisis):
//
// - Para el ANÁLISIS, la última consulta de la persona, vigente o no
//   (ultimaConsultaDeEquifax). Con la regla de la vigente, 214 de 247
//   análisis del lote del 31/10 pedían una cuota que Equifax ya tenía, y de
//   las 244 personas de la base de prueba ninguna tenía una consulta vigente
//   a la fecha de su análisis. Son consultas de septiembre y octubre de 2026,
//   y en dos o tres meses el buró de una persona cambia poco: la que se lee
//   lleva su fecha (fechaDelReporte) para que el modelo diga de cuándo es.
// - Para COBRAR y REUTILIZAR, y para lo que la pantalla muestra como
//   vigente, sólo la vigente hasta el 17 (consultaVigenteDeEquifax). Es la
//   regla que decide si se vuelve a pagar, y su copia en SQL es
//   buro_vigente_de_la_persona() (132), con la que resumen_por_persona lee las
//   marcas de Monitoreo. Si cambia una, cambia la otra.
//
// Una sola implementación de cada una para analyze-client y
// scripts/analizar-en-lote.mjs: dos copias es como un análisis en lote lee
// otro buró que el de la pantalla. La del análisis no tiene copia en SQL: lee
// el índice de las consultas de AWS, que vive en Storage (crudo-equifax-migrado.ts).
//
// No consulta a Equifax: lee lo que ya está guardado (A5 del cuestionario,
// 2026-10-13: se consulta a mano, por persona, y cada consulta se cobra).

import { estaVigenteHastaElCorte } from "./vigencia-mensual.ts";
import type { BuroDeLaInstitucion } from "./perfil-del-modelo.ts";
import { consultasDelIndice, leerCrudoDeLaConsulta, leerCrudoMigrado, leerIndiceDelCrudoMigrado } from "./crudo-equifax-migrado.ts";
import { derivarLaConsulta } from "./equifax-persistencia.ts";

export interface ConsultaVigenteDelBuro extends BuroDeLaInstitucion {
  consultaId: string;
  consultadoEl: string;
}

// La consulta que lee un análisis. Una de AWS sin fila no tiene id en
// consultas_equifax: se nombra por su objeto en el depósito (crudoAws).
export interface ConsultaDelBuroParaElAnalisis extends BuroDeLaInstitucion {
  consultaId: string | null;
  crudoAws: string | null;
  consultadoEl: string;
  // Si sigue vigente hasta el 17. Sólo informa: el análisis la lee igual.
  vigente: boolean;
}

// El buró de la base (proveedores.es_buro, 129: a lo sumo uno). null si no
// hay ninguno. Elegirlo no prende ni apaga consultas: eso es `activo`, y para
// leer lo ya guardado no hace falta.
// deno-lint-ignore no-explicit-any
export async function buroDeLaBase(db: any): Promise<"equifax" | "aval" | null> {
  const { data, error } = await db.from("proveedores").select("clave").eq("es_buro", true).maybeSingle();
  // Sin saber cuál es el buró no se analiza: seguir con Proveedor_Info_1 sería leer
  // otra fuente que la que la institución eligió, sin que nadie se entere.
  if (error) throw new Error(`no se pudo leer cuál es el buró de la institución: ${error.message}`);
  return data?.clave === "equifax" || data?.clave === "aval" ? data.clave : null;
}

// La consulta vigente de Equifax de una persona a la fecha `ahora`
// (docs/propuesta-buro-de-la-institucion.md, sección 2). Decide si se vuelve
// a pagar: la usan los pasos del buró de las evaluaciones, no el análisis.
// - de producción: el ambiente de prueba contesta por otra persona (la
//   lección de Aval, 079) y no sirve para calificar a nadie;
// - la más reciente anterior a `ahora`, nunca una posterior: si alguna vez
//   se analiza con una fecha pasada, un buró de después ya trae la mora que
//   se quiere predecir (la regla del t0 del Laboratorio);
// - vigente hasta el 17 del mes (vigencia-mensual.ts);
// - con su estructura calculada (126) y de la persona pedida. Una respuesta
//   por otra persona no se guarda (equifax-persistencia.ts); la marca se
//   vuelve a mirar por si alguna vez se guarda una.
// deno-lint-ignore no-explicit-any
export async function consultaVigenteDeEquifax(db: any, clientId: string, ahora: Date = new Date()): Promise<ConsultaVigenteDelBuro | null> {
  const { data, error } = await db
    .from("consultas_equifax")
    .select("id, created_at, estructura")
    .eq("client_id", clientId)
    .eq("ambiente", "produccion")
    .eq("http_equifax", 200)
    .not("estructura", "is", null)
    .lte("created_at", ahora.toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`no se pudo leer la consulta de Equifax de la persona: ${error.message}`);
  if (!data || !estaVigenteHastaElCorte(data.created_at, ahora)) return null;
  if (data.estructura?.consulta?.identidadVerificada === false) return null;
  return { proveedor: "equifax", consultaId: data.id, consultadoEl: data.created_at, estructura: data.estructura };
}

// Cuántas filas de la persona se miran: si la más reciente no sirve (vino por
// otra persona, cosa que no debería guardarse), se prueba la anterior.
const FILAS_A_MIRAR = 5;

interface FilaDeConsulta {
  id: string;
  created_at: string;
  ambiente: string;
  estructura: Record<string, unknown> | null;
  crudo_ruta: string | null;
  id_aws: string | null;
}

type Candidata = { tipo: "fila"; fecha: string; fila: FilaDeConsulta } | { tipo: "aws"; fecha: string; ruta: string };

// La última consulta de Equifax de una persona hasta `ahora`, vigente o no,
// para el análisis. Las busca en los dos lugares donde están:
// - consultas_equifax: las que pagamos nosotros (crudo en la fila, con su
//   estructura) y las migradas de AWS (crudo en Storage, casi todas sin
//   estructura: 12 de 3.542 el 2026-11-09);
// - el índice por cédula de las consultas de AWS que no tienen fila
//   (crudo-equifax-migrado.ts): 17.000 de las 20.560 del depósito.
// Con las mismas reglas que la vigente, salvo la vigencia: de producción,
// contestada, nunca posterior a `ahora` y de la persona pedida. Si la consulta
// no tiene estructura guardada, se deriva del crudo en memoria con
// derivarLaConsulta(), sin escribir nada: no hay lugar en la base para las
// tablas de 20.000 consultas. Una migrada y su entrada en el índice tienen la
// misma fecha; gana la fila, que puede traer la estructura hecha.
// deno-lint-ignore no-explicit-any
export async function ultimaConsultaDeEquifax(db: any, persona: { id: string; cedula: string }, ahora: Date = new Date()): Promise<ConsultaDelBuroParaElAnalisis | null> {
  const { data: filas, error } = await db
    .from("consultas_equifax")
    .select("id, created_at, ambiente, estructura, crudo_ruta, id_aws:parametros->migrada_de->>id_consulta_equifax")
    .eq("client_id", persona.id)
    .eq("ambiente", "produccion")
    .eq("http_equifax", 200)
    .lte("created_at", ahora.toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(FILAS_A_MIRAR);
  if (error) throw new Error(`no se pudo leer la consulta de Equifax de la persona: ${error.message}`);
  const lasFilas = (filas ?? []) as FilaDeConsulta[];
  const conFila = new Set(lasFilas.map((f) => f.id_aws).filter((id): id is string => Boolean(id)).map(String));
  const indice = await leerIndiceDelCrudoMigrado(db);
  const candidatas: Candidata[] = [
    ...lasFilas.map((fila) => ({ tipo: "fila" as const, fecha: fila.created_at, fila })),
    ...consultasDelIndice(indice, persona.cedula, ahora)
      .filter((c) => !conFila.has(c.idAws))
      .map((c) => ({ tipo: "aws" as const, fecha: c.consultadaEl, ruta: c.ruta })),
  ];
  const instante = (c: Candidata) => new Date(c.fecha).getTime();
  candidatas.sort((a, b) => instante(b) - instante(a) || (a.tipo === b.tipo ? 0 : a.tipo === "fila" ? -1 : 1));

  for (const c of candidatas.slice(0, FILAS_A_MIRAR)) {
    let estructura: Record<string, unknown> | null;
    if (c.tipo === "fila" && c.fila.estructura) {
      estructura = c.fila.estructura;
    } else {
      // Sin estructura, el crudo: el de la fila o el de Storage. Una falla al
      // leerlo lanza; no se disimula como «no tiene buró».
      const crudo = c.tipo === "fila" ? await leerCrudoDeLaConsulta(db, await crudoDeLaFila(db, c.fila)) : await leerCrudoMigrado(db, c.ruta);
      estructura = derivarLaConsulta(crudo, { identificacion: persona.cedula, created_at: c.fecha, ambiente: "produccion" }).estructura as unknown as Record<string, unknown>;
    }
    if ((estructura?.consulta as Record<string, unknown> | undefined)?.identidadVerificada === false) continue;
    return {
      proveedor: "equifax",
      consultaId: c.tipo === "fila" ? c.fila.id : null,
      crudoAws: c.tipo === "aws" ? c.ruta : null,
      consultadoEl: c.fecha,
      estructura: estructura as Record<string, unknown>,
      vigente: estaVigenteHastaElCorte(c.fecha, ahora),
    };
  }
  return null;
}

// La fila con su crudo: el de la fila sólo se pide si no está en Storage,
// porque pesa unos 27 KB y la consulta de arriba no lo trae.
// deno-lint-ignore no-explicit-any
async function crudoDeLaFila(db: any, fila: { id: string; crudo_ruta: string | null }): Promise<{ respuesta_cruda?: unknown; crudo_ruta: string | null }> {
  if (fila.crudo_ruta) return { crudo_ruta: fila.crudo_ruta };
  const { data, error } = await db.from("consultas_equifax").select("respuesta_cruda, crudo_ruta").eq("id", fila.id).maybeSingle();
  if (error || !data) throw new Error("no se pudo leer el crudo de la consulta de Equifax de la persona");
  return data;
}

// Las dos cosas juntas, para quien analiza de a una persona. Aval como buró
// todavía no tiene esta lectura: su perfil del modelo sigue siendo el de
// Proveedor_Info_1 hasta que se construya (y su consulta de producción todavía no
// existe: las 240 de la base son del ambiente de prueba).
// deno-lint-ignore no-explicit-any
export async function buroDeLaPersonaParaElAnalisis(db: any, persona: { id: string; cedula: string }, ahora: Date = new Date()): Promise<ConsultaDelBuroParaElAnalisis | null> {
  return (await buroDeLaBase(db)) === "equifax" ? await ultimaConsultaDeEquifax(db, persona, ahora) : null;
}
