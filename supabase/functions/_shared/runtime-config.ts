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

// Ajustes al criterio del modelo que el área de Crédito/Riesgos aprobó
// Y puso en vigencia, a partir del análisis de resultados reales (ver
// migración 029). Se suman al marco interpretativo en cada análisis
// nuevo, así el ciclo de calibración cierra sin necesidad de un
// despliegue: el marco base sigue versionado en código y cada ajuste
// vigente queda registrado en la base con quién lo aprobó y cuándo.
// Devuelve el criterio efectivo vigente: los textos de los ajustes y la
// versión a la que corresponden. El análisis guarda ese id (ver
// analysis_results.criterio_version_id) para que después se pueda
// reconstruir con qué criterio exacto se produjo -- sin eso, un
// análisis que salga raro es imposible de auditar.
export async function loadCriterioVigente(
  client: SupabaseClient
): Promise<{ ajustes: string[]; versionId: string | null; numeroVersion: number | null }> {
  const { data, error } = await client
    .from("criterio_versiones")
    .select("id, numero, ajustes")
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ajustes: [], versionId: null, numeroVersion: null };
  const ajustes = Array.isArray(data.ajustes)
    ? (data.ajustes as Array<{ texto?: string }>).map((a) => a?.texto ?? "").filter(Boolean)
    : [];
  return { ajustes, versionId: data.id as string, numeroVersion: data.numero as number };
}

// Set de campos DESHABILITADOS, como "grupo.campo" (ej. "cumplimiento.enListaControl").
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
