// Explorador de Novadata: consulta las 52 fuentes para una cédula
// usando credenciales que el usuario ingresa en el momento (no las
// secrets de servicio) y devuelve los datos crudos de cada una — para
// inspeccionar la ingesta sin persistir nada ni tocar la base de datos.
// Es la sección "Explorador de Fuentes" de la app (solo admin, ver
// App.jsx) y sirve igual corriendo con `supabase functions serve` en
// local.
//
// Hasta la migración 078 devolvía además un "resumen curado por eje"
// que armaba normalize.ts: una segunda forma de leer a Novadata, con
// sus propias reglas, que había que mantener en sync con process.ts.
// Para un inspector, el crudo de cada fuente dice más que un recorte, y
// una sola implementación de cómo se lee la fuente es justamente lo que
// evita las diferencias silenciosas.
//
// Body esperado: { "username": "...", "password": "...", "cedula": "..." }
//
// IMPORTANTE: esta función recibe la contraseña de Novadata del usuario
// en cada request. Nunca se loguea ni se persiste — se usa una sola vez
// para pedir el token y se descarta. Debe desplegarse con verify_jwt
// desactivado para este endpoint específico (ver supabase/config.toml)
// ya que el explorador no pasa por Supabase Auth.

import { corsHeaders } from "../_shared/cors.ts";
import { consultarTodasLasFuentes } from "../_shared/novadata-client.ts";
import { estadoPorFuente } from "../_shared/calidad-de-la-consulta.ts";
import { evaluarControlesBloqueo } from "../_shared/controles-bloqueo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: { username?: string; password?: string; cedula?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body inválido, se maneja abajo
  }

  const { username, password, cedula } = body;
  if (!username || !password || !cedula) {
    return new Response(JSON.stringify({ error: "Faltan 'username', 'password' o 'cedula' en el body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  try {
    const raw = await consultarTodasLasFuentes(cedula, { username, password });
    const estado = estadoPorFuente(raw);
    const controlBloqueo = evaluarControlesBloqueo(raw, cedula);

    return new Response(JSON.stringify({ raw, estado, controlBloqueo }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
