// Capas de parametrización operativa (ver supabase/migrations/006_runtime_config.sql):
//   A. novadata_resource_config — qué recursos de ingesta consultar.
//   B. standard_profile_field_config — qué campos de la Estructura
//      Estandarizada se le mandan al LLM.
//
// Ambas tablas las administra un admin desde /admin/configuracion
// (src/pages/AdminConfig.jsx, ruta y policies restringidas por rol —
// ver 022_profiles_roles.sql).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { StandardClientProfile } from "./types.ts";

// Set de fuentes DESHABILITADAS (fuente -> ignorar en consultarTodasLasFuentes).
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
// persiste queda completo — el campo se oculta al LLM, no se borra;
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

// El corte del registro del IESS, deducido de los propios datos.
//
// Antes era una constante en el código y había que actualizarla a mano
// cada dos o tres meses. El problema no era editarla: era saber CUÁNDO.
// El proveedor no avisa que publicó un corte nuevo, así que el valor se
// quedaba viejo hasta que alguien lo notaba.
//
// Los datos sí lo saben. Cada perfil guarda el corte con el que se
// clasificó, y cuando un cliente trae un mes más nuevo que el conocido,
// el módulo usa el del cliente. Así que el mes más alto visto en los
// perfiles recientes ES el corte vigente: el primero que llega con datos
// nuevos lo mueve para todos.
//
// Los 90 días acotan la ventana a propósito: un perfil viejo no puede
// arrastrar el corte hacia atrás, y uno muy viejo no debería opinar.
export async function loadCorteIess(client: SupabaseClient, porDefecto: string): Promise<string> {
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await client
    .from("client_profiles")
    .select("fuente_corte")
    .not("fuente_corte", "is", null)
    .gte("created_at", desde)
    .order("fuente_corte", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.fuente_corte) return porDefecto;

  const visto = String(data.fuente_corte);
  if (!/^\d{4}-\d{2}$/.test(visto)) return porDefecto;

  // Un mes futuro no puede ser un corte: sería un dato corrupto de un
  // solo cliente moviendo el corte de toda la cartera. Se admite el mes
  // en curso y ni uno más.
  const ahora = new Date();
  const tope = `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, "0")}`;
  if (visto > tope) return porDefecto;

  return visto > porDefecto ? visto : porDefecto;
}
