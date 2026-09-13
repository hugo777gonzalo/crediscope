import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

// Base de las Edge Functions. Si Supabase está configurado, se calcula
// de VITE_SUPABASE_URL; si no, se puede fijar VITE_FUNCTIONS_URL a mano
// (por defecto, el puerto local de `supabase functions serve`) — así el
// explorador funciona sin tener un proyecto Supabase real todavía.
const FUNCTIONS_URL =
  import.meta.env.VITE_FUNCTIONS_URL ||
  (isSupabaseConfigured ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : "http://localhost:54321/functions/v1");

// Llama a la Edge Function `analyze-client`, que corre los controles de
// bloqueo + el scoring por LLM, y persiste el resultado. El mismo
// endpoint sirve como API para sistemas externos (ver
// supabase/functions/analyze-client/index.ts). `profileId` (opcional):
// id de un client_profiles ya generado por structureClient — si viene,
// se reutiliza ese Perfil del Cliente en vez de volver a consultar
// Novadata (ver "Análisis con IA").
export async function analyzeClient(cedula, { profileId } = {}) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado.");
  }
  const { data, error } = await supabase.functions.invoke("analyze-client", {
    body: { cedula, profileId },
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

// ---------- Historial ----------
// A diferencia de getLatestProfile/getLatestAnalysis (que solo traen lo
// más reciente para Perfil del Cliente/Análisis con IA), esto trae TODA
// la línea de tiempo de un cliente para el visor histórico de solo
// lectura — ver src/pages/Historial.jsx.

export async function getHistorialCliente(cedula) {
  const { data: client, error: clientError } = await supabase.from("clients").select("id, cedula").eq("cedula", cedula).maybeSingle();
  if (clientError) throw clientError;
  if (!client) return { client: null, eventos: [] };

  const [{ data: perfiles, error: perfilesError }, { data: analisis, error: analisisError }] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("id, created_at, structure_version")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("analysis_results")
      .select("id, created_at, crediscope_score, rules_version")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
  ]);
  if (perfilesError) throw perfilesError;
  if (analisisError) throw analisisError;

  const eventos = [
    ...(perfiles || []).map((p) => ({ tipo: "perfil", id: p.id, created_at: p.created_at, version: p.structure_version })),
    ...(analisis || []).map((a) => ({
      tipo: "analisis",
      id: a.id,
      created_at: a.created_at,
      version: a.rules_version,
      score: a.crediscope_score,
    })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return { client, eventos };
}

// Perfil del Cliente por id (snapshot puntual, no "el más reciente") —
// incluye la cédula del cliente vía join para el header del visor.
export async function getPerfilPorId(id) {
  const { data, error } = await supabase.from("client_profiles").select("*, clients(cedula)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// Análisis con IA por id (snapshot puntual). No trae el Perfil del
// Cliente asociado (analysis_results no guarda referencia a un
// client_profiles.id específico, solo a ingestion_run_id) — el visor de
// Historial para análisis muestra solo el resultado, sin segmentos.
export async function getAnalisisPorId(id) {
  const { data, error } = await supabase.from("analysis_results").select("*, clients(cedula)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Configuración operativa (parametrización) ----------
// Tablas planas con RLS (cualquier autenticado lee/actualiza), sin pasar
// por una Edge Function — ver supabase/migrations/006_runtime_config.sql
// y supabase/functions/_shared/runtime-config.ts (quien las consume en
// tiempo de consulta).

export async function getResourceConfig() {
  const { data, error } = await supabase.from("novadata_resource_config").select("*").order("bloque").order("recurso");
  if (error) throw error;
  return data;
}

export async function updateResourceConfig(recurso, { enabled, motivo }) {
  const { error } = await supabase
    .from("novadata_resource_config")
    .update({ enabled, motivo: motivo || null, updated_at: new Date().toISOString() })
    .eq("recurso", recurso);
  if (error) throw error;
}

export async function getFieldConfig() {
  const { data, error } = await supabase.from("standard_profile_field_config").select("*").order("grupo").order("campo");
  if (error) throw error;
  return data;
}

export async function updateFieldConfig(grupo, campo, { enabled, motivo }) {
  const { error } = await supabase
    .from("standard_profile_field_config")
    .update({ enabled, motivo: motivo || null, updated_at: new Date().toISOString() })
    .eq("grupo", grupo)
    .eq("campo", campo);
  if (error) throw error;
}

// Visibilidad de segmentos en "Perfil del Cliente" (nombre comercial de
// la Estructura Estandarizada) — separado de standard_profile_field_config:
// esto no afecta qué se calcula, solo qué se muestra en la UI del
// analista. modo: "con_datos" | "siempre" | "nunca".
export async function getSegmentConfig() {
  const { data, error } = await supabase.from("standard_profile_segment_config").select("*").order("grupo");
  if (error) throw error;
  return data;
}

export async function updateSegmentConfig(grupo, { modo, motivo }) {
  const { error } = await supabase
    .from("standard_profile_segment_config")
    .update({ modo, motivo: motivo || null, updated_at: new Date().toISOString() })
    .eq("grupo", grupo);
  if (error) throw error;
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
