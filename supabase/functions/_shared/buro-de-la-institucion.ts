// El buró de la institución de una persona: cuál es el buró de la base y,
// si es Equifax, la consulta vigente de esa persona. Lo único que
// armarPerfilDelModelo() necesita para leer la deuda del buró en lugar de la
// de Proveedor_Info_1 (marco-v31, apagado: CONFIG_LLM.buroDeLaInstitucion).
//
// Una sola implementación para analyze-client y scripts/analizar-en-lote.mjs:
// dos copias de "cuál es la consulta vigente" es como un análisis en lote lee
// otro buró que el de la pantalla. La base tiene la suya porque no puede
// importar esto: buro_vigente_de_la_persona() (132), con la que
// resumen_por_persona lee las marcas de Monitoreo. Si cambia la regla, cambian
// las dos.
//
// No consulta a Equifax: lee lo que ya está guardado (A5 del cuestionario,
// 2026-10-13: se consulta a mano, por persona, y cada consulta se cobra).

import { estaVigenteHastaElCorte } from "./vigencia-mensual.ts";
import type { BuroDeLaInstitucion } from "./perfil-del-modelo.ts";

export interface ConsultaVigenteDelBuro extends BuroDeLaInstitucion {
  consultaId: string;
  consultadoEl: string;
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

// La consulta vigente de Equifax de una persona a la fecha del análisis
// (docs/propuesta-buro-de-la-institucion.md, sección 2):
// - de producción: el ambiente de prueba contesta por otra persona (la
//   lección de Aval, 079) y no sirve para calificar a nadie;
// - la más reciente anterior a `ahora`, nunca una posterior: si alguna vez
//   se analiza con una fecha pasada, un buró de después ya trae la mora que
//   se quiere predecir (la regla del t0 del Laboratorio);
// - vigente hasta el 17 del mes (vigencia-mensual.ts): la misma regla que
//   decide si se vuelve a pagar;
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

// Las dos cosas juntas, para quien analiza de a una persona. Aval como buró
// todavía no tiene esta lectura: su perfil del modelo sigue siendo el de
// Proveedor_Info_1 hasta que se construya (y su consulta de producción todavía no
// existe: las 240 de la base son del ambiente de prueba).
// deno-lint-ignore no-explicit-any
export async function buroVigenteDeLaPersona(db: any, clientId: string, ahora: Date = new Date()): Promise<ConsultaVigenteDelBuro | null> {
  return (await buroDeLaBase(db)) === "equifax" ? await consultaVigenteDeEquifax(db, clientId, ahora) : null;
}
