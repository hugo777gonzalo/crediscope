// Resuelve el código de un caso real (c-xxxxxxxx: los 8 primeros caracteres de
// clients.id) a la persona, para que los guiones no reciban ni impriman una
// cédula. El repositorio es público y el registro de casos vive fuera de git
// (research/casos-reales/): ver "Cómo se trabaja" en CLAUDE.md.
//
// AVISO: este archivo no pasa por lint ni build.

// Un error de PostgREST no es un Error: es un objeto plano.
export const explicar = (e) =>
  e instanceof Error ? e.message : [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" | ") || JSON.stringify(e);

/**
 * Devuelve { id, cedula } de la persona del código. Una uuid se busca por
 * rango, que PostgREST sí entiende (no entiende `like` sobre una uuid). Tiene
 * que resolver a exactamente una persona, y no puede ser una sintética de Aval
 * (sus cédulas son datos de prueba de Aval, no números inexistentes).
 */
export async function personaDelCaso(db, codigo) {
  const prefijo = String(codigo).replace(/^c-/, "").toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(prefijo)) throw new Error(`"${codigo}" no es un código c-xxxxxxxx (8 caracteres hexadecimales).`);
  const { data, error } = await db.from("clients").select("id, cedula, es_sintetico")
    .gte("id", `${prefijo}-0000-0000-0000-000000000000`).lte("id", `${prefijo}-ffff-ffff-ffff-ffffffffffff`);
  if (error) throw new Error(explicar(error));
  if (data.length !== 1) throw new Error(`${codigo} resuelve a ${data.length} personas: tiene que ser exactamente una.`);
  if (data[0].es_sintetico) throw new Error(`${codigo} es una persona sintética de Aval: no se consulta en Equifax.`);
  return { id: data[0].id, cedula: data[0].cedula };
}
