import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

// Base de las Edge Functions. Si Supabase está configurado, se calcula
// de VITE_SUPABASE_URL; si no, se puede fijar VITE_FUNCTIONS_URL a mano
// (por defecto, el puerto local de `supabase functions serve`) — así el
// explorador funciona sin tener un proyecto Supabase real todavía.
const FUNCTIONS_URL =
  import.meta.env.VITE_FUNCTIONS_URL ||
  (isSupabaseConfigured ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : "http://localhost:54321/functions/v1");

// Llama a la Edge Function `analyze-client`, que orquesta la ingesta de
// Novadata, corre los guardrails + el scoring por LLM, y persiste el
// resultado. El mismo endpoint sirve como API para sistemas externos
// (ver supabase/functions/analyze-client/index.ts).
export async function analyzeClient(cedula) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado.");
  }
  const { data, error } = await supabase.functions.invoke("analyze-client", {
    body: { cedula },
  });
  if (error) throw error;
  return data;
}

// Llama a la Edge Function `structure-client`: ingesta -> estructura
// estandarizada -> clasificación en 4 segmentos -> persiste en
// client_profiles. NO pasa por el LLM. Usa las credenciales de Novadata
// de las secrets de la función (el usuario no las escribe acá) — a
// diferencia de explore-novadata, esto sí requiere sesión y sí persiste.
export async function structureClient(cedula) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado.");
  }
  const { data, error } = await supabase.functions.invoke("structure-client", {
    body: { cedula },
  });
  if (error) throw error;
  return data;
}

export async function getLatestProfile(cedula) {
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, cedula")
    .eq("cedula", cedula)
    .maybeSingle();
  if (clientError) throw clientError;
  if (!client) return null;

  const { data: result, error: resultError } = await supabase
    .from("client_profiles")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (resultError) throw resultError;
  return result;
}

export async function getLatestAnalysis(cedula) {
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, cedula")
    .eq("cedula", cedula)
    .maybeSingle();
  if (clientError) throw clientError;
  if (!client) return null;

  const { data: result, error: resultError } = await supabase
    .from("analysis_results")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (resultError) throw resultError;
  return result;
}

// Llama a la Edge Function `explore-novadata` con credenciales de
// Novadata que el usuario ingresa en el momento (no las secrets de
// servicio). No pasa por Supabase Auth ni persiste nada — solo para
// inspeccionar la ingesta. Ver supabase/functions/explore-novadata/index.ts.
export async function exploreNovadata({ username, password, cedula }) {
  const res = await fetch(`${FUNCTIONS_URL}/explore-novadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, cedula }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Error consultando Novadata (HTTP ${res.status})`);
  }
  return data;
}
