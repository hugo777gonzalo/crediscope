// Clasificación de por qué falló una llamada al modelo.
//
// Existe por dos razones que empujan en la misma dirección:
//
//   1. Al analista hay que decirle qué pasó en su idioma. Hasta ahora
//      el texto crudo del error de la API terminaba mostrándose como el
//      "Resumen" del análisis -- un párrafo con HTTP 400, request-id y
//      JSON donde debería ir el criterio sobre una persona.
//
//   2. Sin causa no hay SLA. "12 llamadas fallaron" no se puede
//      accionar; "12 llamadas fallaron por tope de gasto" se corrige en
//      dos minutos desde la consola, y "12 fallaron porque el proveedor
//      está caído" no se corrige, se comunica. Son incidentes distintos,
//      con responsables y tiempos distintos.
//
// La clasificación se guarda junto a la llamada, así que se puede
// agrupar, medir cuánto duró cada incidente y avisar por separado.

export type TipoFallo =
  | "tope_de_gasto"
  | "credencial"
  | "limite_velocidad"
  | "proveedor_caido"
  | "respuesta_cortada"
  | "respuesta_ilegible"
  | "sin_conexion"
  | "desconocido";

export interface Fallo {
  tipo: TipoFallo;
  // Qué se le dice a quien está usando la aplicación.
  mensajeUsuario: string;
  // Qué hay que hacer para que deje de pasar, y de quién depende.
  queHacer: string;
  // Si la misma consulta, repetida tal cual, podría funcionar.
  reintentable: boolean;
  // Si depende de nosotros o del proveedor. Es la línea que separa lo
  // que cuenta contra nuestro SLA de lo que se informa como
  // indisponibilidad de un tercero.
  responsable: "nosotros" | "proveedor";
}

const CATALOGO: Record<TipoFallo, Omit<Fallo, "tipo">> = {
  tope_de_gasto: {
    mensajeUsuario: "El servicio de análisis alcanzó su límite de consumo contratado. No es un problema de este cliente ni de sus datos.",
    queHacer: "Subir el tope mensual en la consola del proveedor. Hasta entonces ningún análisis va a completarse.",
    reintentable: false,
    responsable: "nosotros",
  },
  credencial: {
    mensajeUsuario: "El servicio de análisis rechazó nuestras credenciales.",
    queHacer: "Revisar que la clave de la API siga vigente y cargada en las variables de la función.",
    reintentable: false,
    responsable: "nosotros",
  },
  limite_velocidad: {
    mensajeUsuario: "Se hicieron demasiadas consultas seguidas. Esperá un momento y volvé a intentar.",
    queHacer: "Espaciar las consultas o pedir una cuota mayor. Si pasa con volumen normal, hace falta una cola.",
    reintentable: true,
    responsable: "nosotros",
  },
  proveedor_caido: {
    mensajeUsuario: "El servicio de análisis no está respondiendo. Es una falla del proveedor, no de CrediScope.",
    queHacer: "Esperar a que se restablezca. Verificar la página de estado del proveedor y avisar a los usuarios.",
    reintentable: true,
    responsable: "proveedor",
  },
  respuesta_cortada: {
    mensajeUsuario: "El análisis quedó a medias: la respuesta superó el largo permitido.",
    queHacer: "Subir el techo de tokens de salida o recortar lo que se le manda. Es un caso más grande que el promedio.",
    reintentable: true,
    responsable: "nosotros",
  },
  respuesta_ilegible: {
    mensajeUsuario: "El análisis devolvió una respuesta que no se pudo interpretar.",
    queHacer: "Revisar el formato que pide el marco interpretativo. Si se repite en varios clientes, es del criterio.",
    reintentable: true,
    responsable: "nosotros",
  },
  sin_conexion: {
    mensajeUsuario: "No se pudo contactar al servicio de análisis.",
    queHacer: "Revisar la salida a internet de la función y el estado de la red del proveedor.",
    reintentable: true,
    responsable: "proveedor",
  },
  desconocido: {
    mensajeUsuario: "El análisis no se pudo completar por un error inesperado.",
    queHacer: "Revisar el detalle técnico en el registro de llamadas y clasificarlo acá para la próxima vez.",
    reintentable: true,
    responsable: "nosotros",
  },
};

// El orden importa: se evalúa de lo más específico a lo más general.
// "usage limits" llega como HTTP 400, igual que un payload mal armado,
// así que el mensaje manda sobre el código.
export function clasificarFallo(mensaje: string | null | undefined, stopReason?: string | null): Fallo {
  const t = (mensaje ?? "").toLowerCase();
  let tipo: TipoFallo = "desconocido";

  if (stopReason === "max_tokens" || t.includes("cortada por límite de tokens")) tipo = "respuesta_cortada";
  else if (t.includes("usage limit") || t.includes("credit balance") || t.includes("quota")) tipo = "tope_de_gasto";
  else if (t.includes("http 401") || t.includes("http 403") || t.includes("authentication") || t.includes("api key")) tipo = "credencial";
  else if (t.includes("http 429") || t.includes("rate limit") || t.includes("overloaded")) tipo = "limite_velocidad";
  else if (/http 5\d\d/.test(t) || t.includes("internal server error")) tipo = "proveedor_caido";
  else if (t.includes("no se pudo interpretar") || t.includes("sin bloque de texto")) tipo = "respuesta_ilegible";
  else if (t.includes("fetch failed") || t.includes("network") || t.includes("timeout") || t.includes("etimedout")) tipo = "sin_conexion";

  return { tipo, ...CATALOGO[tipo] };
}
