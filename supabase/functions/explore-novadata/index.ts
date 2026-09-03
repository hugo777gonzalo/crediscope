// Explorador de Novadata: consulta TODOS los recursos mapeados para una
// cédula usando credenciales que el usuario ingresa en el momento (no
// las secrets de servicio) y devuelve tanto el resumen curado por eje
// como los datos crudos — para inspeccionar la ingesta sin necesitar un
// proyecto Supabase real todavía (no persiste nada, no usa la base de
// datos). Pensado para correr con `supabase functions serve` en local.
//
// Body esperado: { "username": "...", "password": "...", "cedula": "..." }
//
// IMPORTANTE: esta función recibe la contraseña de Novadata del usuario
// en cada request. Nunca se loguea ni se persiste — se usa una sola vez
// para pedir el token y se descarta. Debe desplegarse con verify_jwt
// desactivado para este endpoint específico (ver supabase/config.toml)
// ya que el explorador no pasa por Supabase Auth.

import { corsHeaders } from "../_shared/cors.ts";
import { fetchAllBlocks } from "../_shared/novadata-client.ts";
import { buildClientContext } from "../_shared/normalize.ts";
import { runGuardrails } from "../_shared/guardrails.ts";

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
    const raw = await fetchAllBlocks(cedula, { username, password });
    const { context, blockStatus } = buildClientContext(raw, cedula);
    const guardrail = runGuardrails(raw, cedula);

    return new Response(JSON.stringify({ raw, context, blockStatus, guardrail }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
