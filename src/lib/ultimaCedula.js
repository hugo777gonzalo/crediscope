// Última cédula vista (Perfil del Cliente o Análisis con IA) — conveniencia
// de navegación pura en el navegador (localStorage), no es dato de negocio:
// permite que el submenú "Evaluación Crediticia" enlace directo a
// Perfil/Análisis del último cliente en vez de forzar siempre a Buscar
// Cliente. Nunca falla la app si localStorage no está disponible.
import { clasificarIdentificacion } from "../../supabase/functions/_shared/identificacion.ts";

const CLAVE = "crediscope_ultima_cedula";

export function getUltimaCedula() {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

// Sólo una identificación que se puede consultar: abrir /perfil/abc guardaba
// «abc» y desde ahí todas las pestañas de la persona del menú llevaban a «abc»
// (QA del 2026-11-05).
export function setUltimaCedula(cedula) {
  try {
    if (cedula && clasificarIdentificacion(cedula).consultable) localStorage.setItem(CLAVE, cedula);
  } catch {
    // ignorar -- solo afecta un atajo de navegación
  }
}
