// Capas de parametrización operativa (ver supabase/migrations/006_runtime_config.sql):
//   A. novadata_resource_config — qué recursos de ingesta consultar.
//   B. standard_profile_field_config — qué campos de la Estructura
//      Estandarizada se le mandan al LLM.
//
// Ambas tablas las administra un admin desde /admin/configuracion
// (src/pages/AdminConfig.jsx, ruta y policies restringidas por rol —
// ver 022_profiles_roles.sql).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Set de fuentes DESHABILITADAS (fuente -> ignorar en consultarTodasLasFuentes).
export async function loadDisabledResources(client: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await client.from("novadata_resource_config").select("recurso").eq("enabled", false);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.recurso as string));
}

// Hasta el 2026-10-06 acá se leían los "ajustes del criterio": textos que
// se sumaban al marco en cada análisis sin versión nueva del marco, sin
// comparación y sin quedar en mensaje_al_modelo (que guarda el perfil, no las
// instrucciones). El negocio los retiró: todo cambio a lo que lee el modelo
// es una versión nueva del marco.

// Set de campos DESHABILITADOS, como "grupo.campo" (ej. "cumplimiento.enListaControl").
export async function loadDisabledFields(client: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await client.from("standard_profile_field_config").select("grupo, campo").eq("enabled", false);
  if (error) throw error;
  return new Set((data ?? []).map((r) => `${r.grupo}.${r.campo}`));
}

// Los campos deshabilitados los oculta armarPerfilDelModelo()
// (perfil-del-modelo.ts), la única puerta al LLM: el perfil que se
// persiste queda completo, el campo se oculta al modelo, no se borra.

// El corte del registro del IESS, deducido de los propios datos.
//
// Antes era una constante en el código y había que actualizarla a mano
// cada dos o tres meses. El problema no era editarla: era saber CUÁNDO.
// El proveedor no avisa que publicó un corte nuevo, así que el valor se
// quedaba viejo hasta que alguien lo notaba.
//
// Los datos sí lo saben: cuando Novadata publica un corte nuevo, todos
// los asalariados aparecen en el mes nuevo a la vez. La regla vive en la
// base (corte_iess_vigente, migración 083): el mes más reciente en el que
// aparecen al menos 20 clientes distintos consultados en los últimos 90
// días.
//
// Hasta la 083 bastaba UN perfil: el mes más alto visto movía el corte
// para todos. El 2026-09-23 dos aportes adelantados de agosto lo pasaron a
// 2026-08 cuando el corte real de Novadata era 2026-07, y desde ahí todo
// asalariado con su último aporte en julio habría quedado "fuera del
// último corte". Se corrigió antes de que pasara.
export async function loadCorteIess(client: SupabaseClient, porDefecto: string): Promise<string> {
  const { data, error } = await client.rpc("corte_iess_vigente");
  if (error || !data) return porDefecto;

  const visto = String(data);
  if (!/^\d{4}-\d{2}$/.test(visto)) return porDefecto;

  // Un mes futuro no puede ser un corte: sería un dato corrupto de un
  // solo cliente moviendo el corte de toda la cartera. Se admite el mes
  // en curso y ni uno más.
  const ahora = new Date();
  const tope = `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, "0")}`;
  if (visto > tope) return porDefecto;

  return visto > porDefecto ? visto : porDefecto;
}
