// La ruta dentro de la API: lo que sigue a `/api-v1` en la dirección de la
// función de Supabase (`/functions/v1/api-v1/evaluaciones`), sin el prefijo `/v1`
// de la especificación si el pedido llegó por una dirección propia que lo trae.
// Sin barra final, y `/` si no hay ruta.

export function rutaDeLaApi(pathname: string): string {
  const i = pathname.indexOf("/api-v1");
  let ruta = i >= 0 ? pathname.slice(i + "/api-v1".length) : pathname;
  if (ruta === "/v1" || ruta.startsWith("/v1/")) ruta = ruta.slice(3);
  if (ruta.length > 1 && ruta.endsWith("/")) ruta = ruta.slice(0, -1);
  return ruta || "/";
}
