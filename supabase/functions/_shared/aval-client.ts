// Cliente del buró de crédito Aval (Aval Buró), servicio "AB176 Financial
// Aval Plus". Confirmado contra el ambiente de PRUEBA el 2026-09-20 con
// dos consultas reales (una bancarizada, una no).
//
// A DIFERENCIA de Novadata, que son ~52 recursos en 9 bloques, Aval es
// UNA sola llamada: POST con Basic Auth que devuelve un sobre JSON con
// `result` adentro (34 segmentos para persona natural). Por eso no calza
// en el modelo de bloques de novadata-client.ts y vive como módulo aparte
// -- el usuario lo pidió como proceso separado, análogo a Novadata.
//
// LO QUE EL DICCIONARIO DEL PDF DICE MAL (y la respuesta real corrige):
//   - El código de resultado viaja en `responseCode` (ej. "A200"), NO en
//     un campo `status` -- ese campo no existe en la respuesta real.
//   - El puntaje viene en `scoreFinanciero[0].score`, NO en `score425`.
//   - Los A-códigos de negocio (A401, A402, A404, A406..A412) llegan con
//     HTTP 200: hay que mirar `responseCode`, no el status HTTP.
//
// DOS BLOQUEOS PARA PRODUCCIÓN (por eso esto hoy se prueba en local desde
// una IP ecuatoriana, no desde una Edge Function):
//   1. api-test.avalburo.com usa un certificado no válido (el manual manda
//      desactivar la validación SSL). En Deno hay que armar el fetch con
//      `Deno.createHttpClient` o correr con --unsafely-ignore-certificate-errors.
//   2. Aval solo admite IPs de Ecuador. Las Edge Functions de Supabase
//      egresan desde Deno Deploy (global) -> el fetch se bloquea. Falta
//      resolver un egreso ecuatoriano (proxy/VM). Decisión pendiente.

const AVAL_BASE_URL = Deno.env.get("AVAL_BASE_URL") ?? "https://api-test.avalburo.com/services/V8/getWebService";
const AVAL_USUARIO = Deno.env.get("AVAL_USUARIO") ?? "";
const AVAL_CLAVE = Deno.env.get("AVAL_CLAVE") ?? "";
const AVAL_CODIGO_PRODUCTO = Deno.env.get("AVAL_CODIGO_PRODUCTO") ?? "D1360";

// C=cédula, R=RUC, E=extranjero, P=pasaporte, F=refugiado.
export type TipoIdentificacionAval = "C" | "R" | "E" | "P" | "F";

export interface CredencialesAval {
  usuario: string;
  clave: string;
}

export interface RespuestaAval {
  // "ok" = consulta usable (responseCode A200). "error" = no usable (falla
  // de red/cert, HTTP != 200, o un A-código distinto de A200). "sin_config"
  // = faltan credenciales, ni siquiera se intentó salir a la red.
  status: "ok" | "error" | "sin_config";
  codigo?: string; // responseCode: "A200", "A402", ...
  mensaje?: string; // el `message` que devuelve Aval
  transactionNumber?: string;
  result?: Record<string, unknown>;
  httpStatus?: number;
  duracionMs: number;
  errorMessage?: string;
}

function cabeceraAuth(cred: CredencialesAval): string {
  // Basic Auth: Base64(usuario:clave). Las credenciales son ASCII, así que
  // btoa alcanza (no hace falta encodear UTF-8).
  return "Basic " + btoa(`${cred.usuario}:${cred.clave}`);
}

/**
 * Consulta una identificación a Aval. `credenciales` explícitas ganan a las
 * env vars (útil para un explorador, como en Novadata); sin ninguna, no se
 * sale a la red.
 *
 * OJO facturación: en producción, mandar un tag obligatorio vacío puede
 * facturar. Por eso `consultarAval` NO se dispara con identificación vacía.
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
    return { status: "sin_config", duracionMs: 0, errorMessage: "Aval no configurado (faltan AVAL_USUARIO / AVAL_CLAVE)" };
  }
  if (!identificacion || !identificacion.trim()) {
    return { status: "error", duracionMs: 0, errorMessage: "Identificación vacía: no se consulta (mandar vacío puede facturar)" };
  }

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

  try {
    const res = await fetch(AVAL_BASE_URL, {
      method: "POST",
      headers: { Authorization: cabeceraAuth({ usuario, clave }), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const duracionMs = Date.now() - inicio;
    const texto = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(texto);
    } catch {
      // no era JSON
    }

    if (!res.ok || !json) {
      return {
        status: "error",
        httpStatus: res.status,
        duracionMs,
        errorMessage: `Aval respondió HTTP ${res.status}${json ? "" : " (cuerpo no-JSON)"}`,
      };
    }

    const codigo = typeof json.responseCode === "string" ? json.responseCode : undefined;
    const mensaje = typeof json.message === "string" ? json.message : undefined;
    const transactionNumber = typeof json.transactionNumber === "string" ? json.transactionNumber : undefined;

    if (codigo !== "A200") {
      // A-código de negocio/auth con HTTP 200: no es una consulta usable.
      return { status: "error", codigo, mensaje, transactionNumber, httpStatus: res.status, duracionMs, errorMessage: mensaje ?? codigo };
    }

    return {
      status: "ok",
      codigo,
      mensaje,
      transactionNumber,
      result: (json.result ?? {}) as Record<string, unknown>,
      httpStatus: res.status,
      duracionMs,
    };
  } catch (err) {
    return { status: "error", duracionMs: Date.now() - inicio, errorMessage: String(err) };
  }
}

/**
 * ¿Vale la pena guardar esta consulta de Aval?
 *
 * Es el análogo a `laConsultaSirve` de Novadata, pero para el sobre único
 * de Aval. La lección del 2026-09-15 (perfiles en blanco por una caída)
 * aplica igual: solo un A200 es una consulta hecha. Aval SIEMPRE devuelve
 * los 34 segmentos y calcula score incluso para archivos delgados, así que
 * "A200 con segmentos vacíos" es una persona real con poco historial
 * (guardable) -- NO una falla. Lo que no se guarda es el fetch caído, el
 * HTTP != 200 o un A-código distinto de A200.
 */
export function laConsultaAvalSirve(r: RespuestaAval): boolean {
  return r.status === "ok" && r.codigo === "A200";
}

export function porQueNoSirveAval(r: RespuestaAval): string {
  if (r.status === "sin_config") return "Aval no está configurado. No se consultó.";
  if (r.codigo && r.codigo !== "A200") {
    return `Aval respondió ${r.codigo}${r.mensaje ? `: ${r.mensaje}` : ""}. No se guardó nada.`;
  }
  return `No se pudo consultar a Aval${r.errorMessage ? `: ${r.errorMessage}` : ""}. No se guardó nada — volvé a intentar en unos minutos.`;
}
