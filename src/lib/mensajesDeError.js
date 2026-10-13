// Del error técnico a lo que se le dice a la persona.
//
// POR QUÉ EXISTE
//
// Treinta y nueve pantallas mostraban `error.message` tal cual. Durante la
// revisión del 2026-10-10 un analista habría leído "column
// bandeja_solicitudes.es_sintetico does not exist" en la bandeja, "invalid
// input syntax for type uuid: "null"" en el Laboratorio y un JSON entero de la
// API del modelo (con identificador de pedido y todo) en Costos › Avisos. Un
// mensaje así no dice qué hacer, y la mayoría de las veces la causa es del
// sistema, no de quien lo lee.
//
// El texto técnico no se pierde: queda en "Detalle técnico", plegado, para
// quien tenga que avisar o corregir. Un error de PostgREST es un objeto plano:
// se leen message/details/hint/code (ver CLAUDE.md), no String(err).

const REGLAS = [
  {
    patron: /column .* does not exist|relation .* does not exist|could not find the .* column|schema cache|PGRST20\d|42703|42P01/i,
    mensaje: "Esta pantalla pidió un dato que la base todavía no tiene. Es un desfase entre la aplicación y la base: avisá a quien administra el sistema.",
  },
  {
    patron: /invalid input syntax for type uuid/i,
    mensaje: "A este enlace le falta qué abrir. Volvé a la lista y elegí un registro.",
  },
  {
    patron: /failed to fetch|networkerror|load failed|network request failed|err_internet|err_network/i,
    mensaje: "No hubo conexión con el servidor. Revisá tu conexión e intentá de nuevo.",
    reintentable: true,
  },
  {
    patron: /jwt expired|invalid refresh token|not authenticated|auth session missing|refresh_token_not_found/i,
    mensaje: "La sesión caducó. Volvé a ingresar.",
  },
  {
    patron: /permission denied|row-level security|violates row-level|42501|not authorized|insufficient_privilege/i,
    mensaje: "Tu usuario no tiene permiso para ver o cambiar esto. Si lo necesitás, pedíselo a quien administra el sistema.",
  },
  {
    patron: /statement timeout|timed out|timeout|57014|gateway time-?out|\b504\b/i,
    mensaje: "El servidor tardó demasiado en contestar. Esperá un momento y volvé a intentar.",
    reintentable: true,
  },
  {
    patron: /duplicate key|23505|already exists/i,
    mensaje: "Eso ya está registrado.",
  },
  {
    patron: /\b5\d\d\b.*(server|error)|internal server error|service unavailable/i,
    mensaje: "El servicio tuvo un problema y no pudo contestar. Intentá de nuevo en un momento; si sigue, avisá a quien administra el sistema.",
    reintentable: true,
  },
];

// Los mensajes de nuestras propias funciones ya vienen en castellano y dicen
// qué pasó: se muestran tal cual. Lo que viene en inglés o con jerga de base
// de datos no.
const JERGA_TECNICA = /\b(the|does not|invalid|failed|violates|syntax|unexpected|undefined|null|exception|constraint|column|relation|expected|cannot|could not|not found|bad request|unauthorized|forbidden)\b/i;

function textoDe(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  const partes = [error.message, error.details, error.hint, error.code && `código ${error.code}`].filter((p) => typeof p === "string" && p);
  if (partes.length) return partes.join(" — ");
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** → { mensaje, detalle, reintentable }. `detalle` es el texto técnico completo
 *  (o null si el mensaje ya era claro y no hay nada más que decir). */
export function describirError(error) {
  const crudo = textoDe(error).trim();
  if (!crudo) return { mensaje: "No se pudo completar la operación.", detalle: null, reintentable: false };
  for (const { patron, mensaje, reintentable } of REGLAS) {
    if (patron.test(crudo)) return { mensaje, detalle: crudo, reintentable: Boolean(reintentable) };
  }
  if (!JERGA_TECNICA.test(crudo)) return { mensaje: crudo, detalle: null, reintentable: false };
  return { mensaje: "No se pudo completar la operación. Intentá de nuevo; si sigue, avisá a quien administra el sistema.", detalle: crudo, reintentable: true };
}
