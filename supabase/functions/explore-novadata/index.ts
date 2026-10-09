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
// para pedir el token y se descarta. Exige sesión de admin (ver abajo y
// supabase/config.toml).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { consultarTodasLasFuentes } from "../_shared/novadata-client.ts";
import { estadoPorFuente } from "../_shared/calidad-de-la-consulta.ts";
import { evaluarControlesBloqueo } from "../_shared/controles-bloqueo.ts";

Deno.serve(async (req) => {
  const corsHeaders = cabecerasCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Sólo admin, con sesión. Hasta el 2026-10-09 corría sin JWT: cualquiera
  // en internet podía usarla para probar usuarios y contraseñas de Novadata
  // por fuerza bruta, y quien tuviera unas válidas consultaba personas sin
  // dejar rastro en audit_log (auditoría de seguridad de ese día). La
  // pantalla ya era sólo de admin; ahora también lo es la función.
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const actor = await identificarActor(
    req.headers.get("Authorization"),
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    serviceClient,
    createClient,
  );
  const rechazo = exigirRol(actor, ["admin"], corsHeaders);
  if (rechazo) return rechazo;

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
