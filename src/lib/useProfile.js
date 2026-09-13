import { useEffect, useState } from "react";
import { useSession } from "./useSession.js";
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

// Perfil de acceso (rol/nombre corto/entidad) del usuario logueado — ver
// supabase/migrations/022_profiles_roles.sql. profile es null mientras
// carga O si el usuario no tiene fila en profiles todavía (nunca debería
// pasar en producción: el admin crea el perfil al dar de alta al
// usuario, ver seed de la migración).
export function useProfile() {
  const { session, loading: sessionLoading } = useSession();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading) return;
    if (!isSupabaseConfigured || !session) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelado = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("nombre_corto, entidad, rol")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelado) {
          setProfile(data);
          setLoading(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [session, sessionLoading]);

  return { profile, loading: sessionLoading || loading };
}

export function esAdmin(profile) {
  return profile?.rol === "admin";
}
