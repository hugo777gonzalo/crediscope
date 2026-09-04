// Orquestador del flujo SIN LLM:
//   Ingesta Novadata -> Estructura Estandarizada -> Clasificación (4
//   segmentos) -> Persistencia -> Web.
// Usa las credenciales de servicio de Novadata (secrets de la función,
// no las escribe el usuario) y requiere un usuario autenticado de
// Supabase (igual que analyze-client) porque persiste en client_profiles.
//
// Body esperado: { "cedula": "0102030405" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchAllBlocks } from "../_shared/novadata-client.ts";
import { buildStandardProfile } from "../_shared/process.ts";
import { classifyProfile, CLASSIFICATION_VERSION } from "../_shared/classify.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PROCESS_VERSION = "estructura-v2"; // ver docs/estructura-estandarizada.md

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let cedula: string | undefined;
  try {
    const body = await req.json();
    cedula = body?.cedula;
  } catch {
    // body inválido, se maneja abajo
  }
  if (!cedula || typeof cedula !== "string") {
    return new Response(JSON.stringify({ error: "Falta 'cedula' en el body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  let actorId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    actorId = data.user?.id ?? null;
  }

  try {
    // 1. Cliente: obtener o crear
    let { data: client } = await serviceClient.from("clients").select("id").eq("cedula", cedula).maybeSingle();
    if (!client) {
      const { data: created, error: createError } = await serviceClient
        .from("clients")
        .insert({ cedula })
        .select("id")
        .single();
      if (createError) throw createError;
      client = created;
    }

    // 2. Ingesta (con credenciales de servicio — sin pedirle nada al usuario)
    const raw = await fetchAllBlocks(cedula);

    // 3. Estructura estandarizada
    const { profile, blockStatus } = buildStandardProfile(raw, cedula);

    // 4. Clasificación en 4 segmentos (positivo/negativo/complementario/sin_información)
    const classification = classifyProfile(profile);

    // 5. Persistir
    const { data: saved, error: saveError } = await serviceClient
      .from("client_profiles")
      .insert({
        client_id: client.id,
        standard_profile: profile,
        classification,
        block_status: blockStatus,
        structure_version: PROCESS_VERSION,
        classification_version: CLASSIFICATION_VERSION,
        requested_by: actorId,
      })
      .select("*")
      .single();
    if (saveError) throw saveError;

    // 6. Auditoría (mismo patrón que analyze-client)
    await serviceClient.from("audit_log").insert({
      actor: actorId,
      action: "client.structure",
      client_id: client.id,
      meta: { client_profile_id: saved.id },
    });

    return new Response(JSON.stringify(saved), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
