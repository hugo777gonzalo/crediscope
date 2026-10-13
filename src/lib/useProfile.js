import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "./useSession.js";
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

// Perfil de acceso (rol/nombre corto/entidad) del usuario logueado — ver
// supabase/migrations/022_profiles_roles.sql. profile es null mientras
// carga O si el usuario no tiene fila en profiles todavía (nunca debería
// pasar en producción: el admin crea el perfil al dar de alta al
// usuario, ver seed de la migración).
//
// El perfil vive en un solo lugar para toda la aplicación. Antes cada
// componente que lo usaba (el menú, la barra, cada guardia de ruta) lo
// pedía por su cuenta: una pantalla de administración abierta con un enlace
// directo pedía el perfil tres veces y la guardia dejaba el contenido en
// blanco hasta que llegaba la suya (de 4 a 10 segundos en la revisión del
// 2026-10-10, sin siquiera un "Cargando"). Con el perfil compartido se pide
// una vez por sesión y el resto de las pantallas lo encuentran listo.

const estado = { usuarioId: null, profile: null, listo: false };
const suscriptores = new Set();
let pedido = null;

const emitir = () => suscriptores.forEach((f) => f());
const suscribirse = (f) => {
  suscriptores.add(f);
  return () => suscriptores.delete(f);
};

function cargar(usuarioId) {
  if (pedido?.usuarioId === usuarioId) return;
  pedido = { usuarioId };
  supabase
    .from("profiles")
    .select("nombre_corto, entidad, rol")
    .eq("id", usuarioId)
    .maybeSingle()
    .then(({ data }) => {
      // Si mientras tanto entró otra persona, esta respuesta ya no vale.
      if (pedido?.usuarioId !== usuarioId) return;
      estado.usuarioId = usuarioId;
      estado.profile = data ?? null;
      estado.listo = true;
      emitir();
    })
    .catch(() => {
      // Sin red: sin perfil, pero ya no "cargando". Colgar la pantalla en
      // blanco para siempre es peor que mandar a la persona al inicio.
      if (pedido?.usuarioId !== usuarioId) return;
      estado.usuarioId = usuarioId;
      estado.profile = null;
      estado.listo = true;
      emitir();
    });
}

function olvidar() {
  if (!estado.usuarioId && !pedido) return;
  estado.usuarioId = null;
  estado.profile = null;
  estado.listo = false;
  pedido = null;
  emitir();
}

// Un solo objeto por cambio: useSyncExternalStore compara por identidad.
let instantanea = { profile: null, listo: false, usuarioId: null };
function leer() {
  if (instantanea.profile !== estado.profile || instantanea.listo !== estado.listo || instantanea.usuarioId !== estado.usuarioId) {
    instantanea = { profile: estado.profile, listo: estado.listo, usuarioId: estado.usuarioId };
  }
  return instantanea;
}

export function useProfile() {
  const { session, loading: sessionLoading } = useSession();
  const usuarioId = session?.user?.id ?? null;
  const guardado = useSyncExternalStore(suscribirse, leer, leer);

  useEffect(() => {
    if (sessionLoading) return;
    if (!isSupabaseConfigured || !usuarioId) {
      olvidar();
      return;
    }
    cargar(usuarioId);
  }, [sessionLoading, usuarioId]);

  // Lo guardado sirve sólo si es de la persona que tiene la sesión.
  const vigente = guardado.listo && guardado.usuarioId === usuarioId;
  const sinSesion = !sessionLoading && (!isSupabaseConfigured || !usuarioId);
  return {
    profile: vigente ? guardado.profile : null,
    loading: sessionLoading || (!sinSesion && !vigente),
  };
}

export function esAdmin(profile) {
  return profile?.rol === "admin";
}
