// Capas de parametrización operativa (ver supabase/migrations/006_runtime_config.sql):
//   A. novadata_resource_config — qué recursos de ingesta consultar.
//   B. standard_profile_field_config — qué campos de la Estructura
//      Estandarizada usar en clasificación/LLM.
//
// Ambas tablas las administra cualquier analista autenticado desde
// /admin/configuracion (src/pages/AdminConfig.jsx) — no hay rol admin
// separado todavía en este proyecto.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { StandardClientProfile } from "./types.ts";

// Set de recursos DESHABILITADOS (recurso -> ignorar en fetchAllBlocks).
export async function loadDisabledResources(client: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await client.from("novadata_resource_config").select("recurso").eq("enabled", false);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.recurso as string));
}

// Set de campos DESHABILITADOS, como "grupo.campo" (ej. "compliance.enListaControl").
export async function loadDisabledFields(client: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await client.from("standard_profile_field_config").select("grupo, campo").eq("enabled", false);
  if (error) throw error;
  return new Set((data ?? []).map((r) => `${r.grupo}.${r.campo}`));
}

// Copia el profile quitando (poniendo en null) los campos deshabilitados
// — usado SOLO para lo que ve el LLM. El StandardClientProfile que se
// persiste y se clasifica queda completo (classify.ts filtra aparte);
// acá se puede usar `null` libremente porque el resultado ya no es el
// StandardClientProfile tipado, es un payload JSON suelto para el LLM.
export function redactDisabledFields(profile: StandardClientProfile, disabledFields: Set<string>): Record<string, unknown> {
  if (disabledFields.size === 0) return profile as unknown as Record<string, unknown>;
  const copia = JSON.parse(JSON.stringify(profile)) as Record<string, Record<string, unknown>>;
  for (const key of disabledFields) {
    const [grupo, campo] = key.split(".");
    if (copia[grupo] && campo in copia[grupo]) {
      copia[grupo][campo] = null;
    }
  }
  return copia;
}
