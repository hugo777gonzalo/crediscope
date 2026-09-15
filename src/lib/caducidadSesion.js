import { supabase } from "./supabaseClient.js";

// Caducidad de la sesión por inactividad.
//
// Supabase mantiene la sesión viva indefinidamente: renueva el token
// solo mientras el navegador siga abierto, así que quien entra una vez
// queda dentro para siempre. En una herramienta que muestra la Función
// Judicial, denuncias en Fiscalía, deudas bancarias y el domicilio de
// una persona, una pantalla desatendida en una oficina es el riesgo más
// probable de todos -- más que cualquier ataque.
//
// Dos relojes, porque miden cosas distintas:
//
//   INACTIVIDAD  tiempo sin tocar nada. Protege la pantalla abandonada.
//                Una hora es el equilibrio habitual en banca: no
//                interrumpe a quien está trabajando (cada clic lo
//                reinicia) y cierra la sesión de quien se fue a
//                almorzar.
//
//   MAXIMO       tiempo total desde que entró, se use o no. Evita que
//                una sesión viva semanas por mover el mouse de vez en
//                cuando. Doce horas cubre cualquier jornada.
//
// Los dos valores están acá arriba a propósito: cambiarlos es una
// decisión del negocio, no del código.

export const MINUTOS_INACTIVIDAD = 60;
export const HORAS_MAXIMO = 12;

const CLAVE_ACTIVIDAD = "crediscope.sesion.ultimaActividad";
const CLAVE_INICIO = "crediscope.sesion.inicio";

// localStorage y no memoria: si viviera en memoria, recargar la página
// reiniciaría el reloj y la caducidad no serviría de nada. También hace
// que varias pestañas compartan el mismo reloj.
function leer(clave) {
  try {
    const v = Number(localStorage.getItem(clave));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, String(valor));
  } catch {
    // Modo privado o almacenamiento bloqueado: sin reloj persistente la
    // sesión caduca al cerrar la pestaña, que es más estricto y no
    // menos. No hay nada que reparar.
  }
}

export function marcarActividad() {
  escribir(CLAVE_ACTIVIDAD, Date.now());
}

export function iniciarSesionVigilada() {
  const ahora = Date.now();
  escribir(CLAVE_INICIO, ahora);
  escribir(CLAVE_ACTIVIDAD, ahora);
}

export function limpiarVigilancia() {
  try {
    localStorage.removeItem(CLAVE_ACTIVIDAD);
    localStorage.removeItem(CLAVE_INICIO);
  } catch {
    // ver escribir()
  }
}

// Devuelve por qué caducó, o null si sigue vigente. Se devuelve el
// motivo y no un booleano porque la pantalla de ingreso lo explica: que
// a alguien lo saquen sin decirle por qué se siente como una falla.
export function motivoDeCaducidad() {
  const ahora = Date.now();

  const inicio = leer(CLAVE_INICIO);
  if (inicio === null) {
    // Sesión anterior a esta vigilancia: se adopta desde ahora en vez
    // de cerrarla de golpe.
    iniciarSesionVigilada();
    return null;
  }
  if (ahora - inicio > HORAS_MAXIMO * 3600_000) return "maximo";

  const actividad = leer(CLAVE_ACTIVIDAD) ?? inicio;
  if (ahora - actividad > MINUTOS_INACTIVIDAD * 60_000) return "inactividad";

  return null;
}

export async function cerrarPorCaducidad() {
  limpiarVigilancia();
  await supabase.auth.signOut();
}

export const MENSAJE_CADUCIDAD = {
  inactividad: `La sesión se cerró por ${MINUTOS_INACTIVIDAD} minutos sin actividad.`,
  maximo: `La sesión se cerró: superó las ${HORAS_MAXIMO} horas desde el ingreso.`,
};
