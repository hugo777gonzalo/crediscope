// El crudo de Novadata de cada consulta, guardado en Storage (090).
//
// Hasta el 2026-10-03 se descartaba: en la base quedaba sólo el perfil
// estandarizado y el crudo existía como respaldo local en research/. El
// Laboratorio de Inteligencia de Negocio necesita rastrear un dato desde la
// fuente hasta la respuesta del modelo, y una regla nueva necesita el crudo
// para aplicarse a los perfiles guardados sin reconsultar (el 2026-09-25 hubo
// que reconsultar la cartera entera por eso).
//
// Va a Storage y no a una columna: pesa ~150 KB por persona contra ~4 KB del
// perfil y del crudo de Aval. En la base habría duplicado su tamaño en una
// sola carga de cartera; comprimido con gzip queda en ~8 KB (2.567 crudos
// subidos el 2026-10-03: 20 MB).
//
// Misma forma que los archivos de research/ ({ cedula, capturadoEl,
// perfilId, raw }), así los scripts de recálculo leen cualquiera de los dos.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const BUCKET_CRUDO_NOVADATA = "crudo-novadata";

// Por client_id y no por cédula: el nombre de un objeto aparece en listados
// y registros donde la cédula no tiene por qué estar.
export function rutaDelCrudo(clientId: string, perfilId: string): string {
  return `${clientId}/${perfilId}.json.gz`;
}

// Devuelve la ruta guardada, o null si no se pudo. Nunca lanza: el perfil ya
// está guardado y la consulta salió bien, y perder la copia del crudo no
// justifica contestarle un error a quien consultó. El hueco queda visible
// como crudo_ruta null.
export async function guardarCrudoNovadata(
  client: SupabaseClient,
  clientId: string,
  perfilId: string,
  cedula: string,
  raw: unknown,
): Promise<string | null> {
  try {
    const ruta = rutaDelCrudo(clientId, perfilId);
    const json = JSON.stringify({ cedula, capturadoEl: new Date().toISOString(), perfilId, raw });
    const comprimido = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
    ).blob();

    const { error: errorSubida } = await client.storage
      .from(BUCKET_CRUDO_NOVADATA)
      .upload(ruta, comprimido, { contentType: "application/gzip", upsert: false });
    if (errorSubida) throw errorSubida;

    // Se pide la fila de vuelta: una actualización que no toca nada no da
    // error, y un crudo subido sin su ruta en el perfil es un crudo perdido.
    const { data, error: errorRuta } = await client
      .from("client_profiles")
      .update({ crudo_ruta: ruta })
      .eq("id", perfilId)
      .select("id");
    if (errorRuta) throw errorRuta;
    if (!data?.length) throw new Error(`el perfil ${perfilId} no se actualizó`);
    return ruta;
  } catch (err) {
    const e = err as { message?: string; details?: string; code?: string };
    console.error("No se pudo guardar el crudo de Novadata", perfilId, e?.message ?? String(err), e?.details ?? "", e?.code ?? "");
    return null;
  }
}
