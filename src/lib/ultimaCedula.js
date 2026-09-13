// Última cédula vista (Perfil del Cliente o Análisis con IA) — conveniencia
// de navegación pura en el navegador (localStorage), no es dato de negocio:
// permite que el submenú "Evaluación Crediticia" enlace directo a
// Perfil/Análisis del último cliente en vez de forzar siempre a Buscar
// Cliente. Nunca falla la app si localStorage no está disponible.
const CLAVE = "crediscope_ultima_cedula";

export function getUltimaCedula() {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function setUltimaCedula(cedula) {
  try {
    if (cedula) localStorage.setItem(CLAVE, cedula);
  } catch {
    // ignorar -- solo afecta un atajo de navegación
  }
}
