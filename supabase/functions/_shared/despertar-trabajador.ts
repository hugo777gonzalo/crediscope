// Despierta al trabajador de las evaluaciones (procesar-evaluaciones) sin
// esperarlo: él contesta 202 enseguida y trabaja en segundo plano. Lo llaman la
// puerta de la API al recibir un pedido y el propio trabajador al dejar otro
// paso listo; la agenda de la base cada minuto es la red de seguridad si este
// aviso se pierde, por eso un fallo acá no se informa a nadie.

export function despertarAlTrabajador(): Promise<unknown> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const clave = Deno.env.get("VIGIA_CLAVE") ?? "";
  if (!url || !clave) return Promise.resolve(null);
  return fetch(`${url}/functions/v1/procesar-evaluaciones`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-vigia-clave": clave },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
}
