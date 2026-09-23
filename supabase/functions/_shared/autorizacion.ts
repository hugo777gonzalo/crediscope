// Quién puede pedirle qué a las Edge Functions.
//
// Hasta ahora las funciones solo identificaban al actor "para fines de
// auditoría" y seguían adelante pasara lo que pasara. El portón de
// Supabase (verify_jwt = true en config.toml) garantiza que quien llama
// tiene una sesión válida, pero NO mira el rol: con eso, cualquier
// analista podía invocar proponer-ajustes y mover el criterio de
// crédito, o disparar consultas pagas a un buró sobre cualquier cédula.
//
// La tabla profiles tiene rol desde 022 y sus políticas de RLS lo
// respetan, pero las funciones se conectan con la service_role, que
// saltea la RLS por completo. Es decir: el rol existía y no lo miraba
// nadie en esta ruta. Este módulo es ese control que faltaba.

export type Rol = "analista" | "admin";

export interface Actor {
  id: string;
  rol: Rol;
}

// Resuelve quién llama. Devuelve null si no hay sesión utilizable; la
// decisión de qué hacer con eso es de quien llama, vía exigirRol.
export async function identificarActor(
  authHeader: string | null,
  supabaseUrl: string,
  anonKey: string,
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  // deno-lint-ignore no-explicit-any
  createClient: any,
): Promise<Actor | null> {
  if (!authHeader) return null;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data } = await userClient.auth.getUser();
  const id = data?.user?.id ?? null;
  if (!id) return null;

  // El rol se lee con la service_role a propósito: el usuario puede
  // leer su propia fila, pero no queremos que la respuesta dependa de
  // que su política de lectura esté bien puesta.
  const { data: perfil } = await serviceClient
    .from("profiles")
    .select("rol")
    .eq("id", id)
    .maybeSingle();

  // Sin fila en profiles no se asume un rol por defecto: un alta a
  // medias no puede convertirse en permiso. Al 2026-09-23 los 5
  // usuarios tienen su fila, así que esto no deja a nadie afuera hoy.
  if (!perfil?.rol) return null;

  return { id, rol: perfil.rol as Rol };
}

// Devuelve una respuesta de rechazo si el actor no alcanza, o null si
// puede seguir. Se usa como guarda al principio de cada función.
export function exigirRol(
  actor: Actor | null,
  permitidos: Rol[],
  cabeceras: Record<string, string>,
): Response | null {
  if (!actor) {
    return new Response(
      JSON.stringify({ error: "Sesión no válida o usuario sin perfil asignado." }),
      { status: 401, headers: { ...cabeceras, "Content-Type": "application/json" } },
    );
  }
  if (!permitidos.includes(actor.rol)) {
    return new Response(
      JSON.stringify({
        error: `Esta acción requiere rol ${permitidos.join(" o ")}. Tu rol es ${actor.rol}.`,
      }),
      { status: 403, headers: { ...cabeceras, "Content-Type": "application/json" } },
    );
  }
  return null;
}
