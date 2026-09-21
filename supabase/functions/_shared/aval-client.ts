// Cliente del buró de crédito Aval (Aval Buró), servicio "AB176 Financial
// Aval Plus". Confirmado contra el ambiente de PRUEBA (2026-09) con ~510
// consultas reales.
//
// A DIFERENCIA de Novadata (52 recursos en 9 bloques), Aval es UNA sola
// llamada: POST con Basic Auth que devuelve un sobre JSON con `result`
// adentro (34 segmentos para persona natural). Vive como módulo aparte.
//
// LO QUE EL DICCIONARIO DEL PDF DICE MAL (y la respuesta real corrige):
//   - El código de resultado viaja en `responseCode` (ej. "A200"), NO en
//     un campo `status` (ese campo no existe).
//   - El puntaje viene en `scoreFinanciero[0].score`, NO en `score425`.
//   - Los A-códigos de negocio (A401, A402, A404, A406..A412) llegan con
//     HTTP 200: hay que mirar `responseCode`, no el HTTP.
//   - El "error interno" que el doc lista como HTTP 500 llegó en la práctica
//     como `responseCode: "A500"` con HTTP 200. Por eso clasificamos por
//     responseCode y tratamos HTTP != 200 como su propia señal.
//
// MANEJO DE CÓDIGOS (confirmado con el negocio 2026-09-21): cada respuesta
// cae en una FAMILIA con conducta distinta -- ver CLASE_POR_CODIGO y
// clasificarRespuestaAval. Solo la familia "transitorio" se reintenta; el
// resto (configuración, solicitud, identificación) no, porque reintentar da
// lo mismo. El reintento tiene TOPE y backoff para no saturar ningún server,
// y timeout por intento para no colgarse cuando Aval está en hora pico.
//
// DOS BLOQUEOS PARA PRODUCCIÓN (por eso hoy se prueba en local desde una IP
// ecuatoriana): api-test.avalburo.com usa cert no válido (en Deno hace falta
// Deno.createHttpClient) y solo admite IPs de Ecuador (las Edge Functions
// egresan global). Falta resolver el egreso ecuatoriano.

const AVAL_BASE_URL = Deno.env.get("AVAL_BASE_URL") ?? "https://api-test.avalburo.com/services/V8/getWebService";
const AVAL_USUARIO = Deno.env.get("AVAL_USUARIO") ?? "";
const AVAL_CLAVE = Deno.env.get("AVAL_CLAVE") ?? "";
const AVAL_CODIGO_PRODUCTO = Deno.env.get("AVAL_CODIGO_PRODUCTO") ?? "D1360";

// Tuning (overridable por env/secret). Defaults conservadores para no saturar.
const AVAL_TIMEOUT_MS = Number(Deno.env.get("AVAL_TIMEOUT_MS") ?? "20000");   // corta un intento colgado
const AVAL_MAX_INTENTOS = Number(Deno.env.get("AVAL_MAX_INTENTOS") ?? "3");   // total de intentos (1 + reintentos)
const AVAL_BACKOFF_MS = Number(Deno.env.get("AVAL_BACKOFF_MS") ?? "1000");    // espera = backoff * nº de intento

export type TipoIdentificacionAval = "C" | "R" | "E" | "P" | "F";

// exito = A200. transitorio = reintentable (A500, HTTP 5xx, red, timeout).
// configuracion = nuestro (credenciales/producto/contrato). solicitud = la
// petición está mal armada. identificacion = problema puntual de esa cédula.
// desconocido = A-código o HTTP no previsto. sin_config = ni se intentó.
export type FamiliaAval = "exito" | "transitorio" | "configuracion" | "solicitud" | "identificacion" | "desconocido" | "sin_config";

export interface CredencialesAval {
  usuario: string;
  clave: string;
}

export interface RespuestaAval {
  status: "ok" | "error" | "sin_config";
  familia: FamiliaAval;
  codigo?: string;        // responseCode: "A200", "A402", ...
  mensaje?: string;       // el `message` que devuelve Aval
  transactionNumber?: string;
  result?: Record<string, unknown>;
  httpStatus: number;     // el que NUESTRA API debería devolver (según la familia)
  httpAval?: number;      // el HTTP crudo que devolvió Aval (para diagnóstico)
  duracionMs: number;
  intentos: number;       // cuántas veces se llamó a Aval
  agotoReintentos?: boolean; // true = era transitorio y se agotó el tope
  errorMessage?: string;
}

// código -> familia + HTTP que devuelve nuestra API.
const CLASE_POR_CODIGO: Record<string, { familia: FamiliaAval; http: number }> = {
  A200: { familia: "exito", http: 200 },
  A500: { familia: "transitorio", http: 503 },
  A401: { familia: "configuracion", http: 500 },
  A402: { familia: "configuracion", http: 500 },
  A406: { familia: "configuracion", http: 502 },
  A407: { familia: "configuracion", http: 502 },
  A408: { familia: "configuracion", http: 502 },
  A410: { familia: "solicitud", http: 400 },
  A411: { familia: "solicitud", http: 400 },
  A412: { familia: "solicitud", http: 400 },
  A404: { familia: "identificacion", http: 422 },
  A409: { familia: "identificacion", http: 422 },
};

/**
 * Clasifica una respuesta de Aval en su familia. `motivoRed` != null cuando
 * ni siquiera hubo respuesta (timeout, red, cert): eso es transitorio.
 */
export function clasificarRespuestaAval(
  codigo: string | undefined,
  httpAval: number | undefined,
  motivoRed: string | undefined,
): { familia: FamiliaAval; http: number } {
  if (motivoRed) return { familia: "transitorio", http: 503 };
  if (codigo && CLASE_POR_CODIGO[codigo]) return CLASE_POR_CODIGO[codigo];
  if (codigo) return { familia: "desconocido", http: 502 }; // A-código fuera del catálogo
  if (httpAval !== undefined) {
    if (httpAval >= 500) return { familia: "transitorio", http: 503 };
    if (httpAval === 401 || httpAval === 403) return { familia: "configuracion", http: 500 };
    if (httpAval === 400) return { familia: "solicitud", http: 400 };
  }
  return { familia: "desconocido", http: 502 };
}

function cabeceraAuth(cred: CredencialesAval): string {
  return "Basic " + btoa(`${cred.usuario}:${cred.clave}`);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Intento {
  codigo?: string;
  mensaje?: string;
  transactionNumber?: string;
  result?: Record<string, unknown>;
  httpAval?: number;
  motivoRed?: string; // "timeout", o el error de red/cert
}

// Un solo intento, con timeout que corta un request colgado (hora pico).
async function unIntento(body: unknown, auth: string): Promise<Intento> {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), AVAL_TIMEOUT_MS);
  try {
    const res = await fetch(AVAL_BASE_URL, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const texto = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(texto); } catch { /* no era JSON */ }
    return {
      codigo: typeof json?.responseCode === "string" ? json.responseCode : undefined,
      mensaje: typeof json?.message === "string" ? json.message : undefined,
      transactionNumber: typeof json?.transactionNumber === "string" ? json.transactionNumber : undefined,
      result: (json?.result ?? undefined) as Record<string, unknown> | undefined,
      httpAval: res.status,
      motivoRed: !res.ok && !json ? `HTTP ${res.status} (cuerpo no-JSON)` : undefined,
    };
  } catch (err) {
    // AbortError = timeout; el resto = red/cert.
    const esTimeout = (err as { name?: string })?.name === "AbortError";
    return { motivoRed: esTimeout ? `timeout tras ${AVAL_TIMEOUT_MS} ms` : String(err) };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Consulta una identificación a Aval, con clasificación por familia,
 * timeout por intento y reintentos con tope (solo para la familia
 * transitorio). No sale a la red sin credenciales, ni con identificación
 * vacía (en producción, un tag obligatorio vacío puede facturar).
 */
export async function consultarAval(
  identificacion: string,
  tipoIdentificacion: TipoIdentificacionAval = "C",
  credenciales?: CredencialesAval,
): Promise<RespuestaAval> {
  const inicio = Date.now();
  const usuario = credenciales?.usuario || AVAL_USUARIO;
  const clave = credenciales?.clave || AVAL_CLAVE;

  if (!usuario || !clave) {
    return { status: "sin_config", familia: "sin_config", httpStatus: 500, duracionMs: 0, intentos: 0, errorMessage: "Aval no configurado (faltan AVAL_USUARIO / AVAL_CLAVE)" };
  }
  if (!identificacion || !identificacion.trim()) {
    return { status: "error", familia: "solicitud", httpStatus: 400, duracionMs: 0, intentos: 0, errorMessage: "Identificación vacía: no se consulta (mandar vacío puede facturar)" };
  }

  const auth = cabeceraAuth({ usuario, clave });
  const body = {
    origin: "webservice",
    request: {
      codigoProducto: AVAL_CODIGO_PRODUCTO,
      datosEntrada: [
        { clave: "tipoIdentificacionSujeto", valor: tipoIdentificacion },
        { clave: "identificacionSujeto", valor: identificacion.trim() },
      ],
    },
  };

  let intentos = 0;
  let ultimo: { it: Intento; familia: FamiliaAval; http: number } | null = null;

  while (intentos < AVAL_MAX_INTENTOS) {
    intentos++;
    const it = await unIntento(body, auth);
    const { familia, http } = clasificarRespuestaAval(it.codigo, it.httpAval, it.motivoRed);
    ultimo = { it, familia, http };

    if (familia === "exito") {
      return { status: "ok", familia, codigo: it.codigo, mensaje: it.mensaje, transactionNumber: it.transactionNumber, result: it.result ?? {}, httpStatus: 200, httpAval: it.httpAval, duracionMs: Date.now() - inicio, intentos };
    }
    if (familia !== "transitorio") break; // configuración/solicitud/identificación/desconocido: reintentar no cambia nada
    if (intentos < AVAL_MAX_INTENTOS) await esperar(AVAL_BACKOFF_MS * intentos); // backoff creciente
  }

  const { it, familia, http } = ultimo!;
  const agotoReintentos = familia === "transitorio";
  return {
    status: "error",
    familia,
    codigo: it.codigo,
    mensaje: it.mensaje,
    transactionNumber: it.transactionNumber,
    httpStatus: http,
    httpAval: it.httpAval,
    duracionMs: Date.now() - inicio,
    intentos,
    agotoReintentos,
    errorMessage: it.mensaje ?? it.motivoRed ?? it.codigo,
  };
}

/**
 * ¿Vale la pena guardar esta consulta? Solo un A200 (familia "exito") es una
 * consulta hecha. Aval SIEMPRE devuelve los 34 segmentos y calcula score
 * incluso para archivos delgados, así que "A200 con segmentos vacíos" es una
 * persona real con poco historial (guardable), NO una falla. Ver la lección
 * del 2026-09-15 (perfiles en blanco por una caída).
 */
export function laConsultaAvalSirve(r: RespuestaAval): boolean {
  return r.status === "ok" && r.familia === "exito";
}

/** Mensaje para quien pidió la consulta, según por qué no sirvió. */
export function porQueNoSirveAval(r: RespuestaAval): string {
  const cod = r.codigo ? ` (${r.codigo}${r.mensaje ? `: ${r.mensaje}` : ""})` : r.mensaje ? ` (${r.mensaje})` : "";
  switch (r.familia) {
    case "sin_config":
      return "Aval no está configurado. No se consultó.";
    case "transitorio":
      return r.agotoReintentos
        ? `Aval no respondió bien tras ${r.intentos} intento(s) — posible sobrecarga u hora pico. No se guardó; reintentar más tarde.`
        : `Aval tuvo un error transitorio${cod}. No se guardó; reintentar más tarde.`;
    case "configuracion":
      return `Aval rechazó por configuración${cod}. Revisar credenciales/producto/contrato con Aval — reintentar no ayuda. No se guardó.`;
    case "solicitud":
      return `La consulta enviada a Aval no es válida${cod}. No se guardó.`;
    case "identificacion":
      return `Aval no permite consultar esta identificación${cod}. No se guardó.`;
    default:
      return `Aval respondió algo no previsto${cod}. No se guardó.`;
  }
}
