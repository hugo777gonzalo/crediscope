// Cliente del buró Equifax: orquestación de decisión de Interconnect
// ("decision-orchestrations"), modelo de la cuenta de NovaCredit. Entró a
// producción el 2026-10-12.
//
// DOS LLAMADAS
//   1. Token: POST {BASE}/v2/oauth/token con Basic (usuario:clave de la
//      cuenta) y grant_type=client_credentials. Devuelve un token que dura
//      24 h (medido el 2026-10-12: expires_in 86396). Se guarda en memoria
//      del proceso y se comparte entre llamadas simultáneas; nunca se
//      escribe en la base, en un archivo ni en un registro.
//   2. Consulta: POST {BASE}/business/interconnect/v1/decision-orchestrations/execute
//      con Bearer. El pedido lleva la identificación, los parámetros de la
//      decisión y los identificadores de la cuenta (productData).
//
// CADA CONSULTA SE COBRA y Equifax no pone tope (decisión del negocio,
// 2026-10-12). Todo lo de acá está pensado desde ahí:
//   - Sólo la consulta (execute) cobra: pedir el token no.
//   - Un timeout NO se reintenta. Si el pedido salió y la respuesta no
//     volvió, Equifax pudo haberlo procesado y cobrado; repetirlo paga dos
//     veces. Queda como `sin_respuesta` y la decisión es de una persona.
//   - Se reintenta sólo lo que no llegó a procesarse: un 401 (se renueva el
//     token y se repite una vez) y los 429/502/503/504 del portón, con tope.
//   - Una identificación vacía o mal formada no sale a la red.
//   - Los datos del cónyuge NO se envían (decisión del negocio): el pedido
//     ni siquiera tiene dónde ponerlos.
//
// SECRETOS: la clave y el token no aparecen en ningún mensaje de error ni en
// lo que devuelve este módulo. Los errores pasan por `sanitizar()`.
//
// El User-Agent es propio y simple: el WAF de Aval rechazó el de Deno con 403
// y la lección se aplica acá antes de que cueste una tarde.

const BASE_POR_DEFECTO = "https://api.latam.equifax.com";
const ALCANCE_POR_DEFECTO = "https://api.latam.equifax.com/business/interconnect/v1/decision-orchestrations";
const RUTA_TOKEN = "/v2/oauth/token";
const RUTA_CONSULTA = "/business/interconnect/v1/decision-orchestrations/execute";
const USER_AGENT = "CrediScope/1.0";

// El único host de producción que se conoce. Cualquier otro se marca como
// "prueba" (mismo criterio que Aval, migración 079): equivocarse hacia la
// desconfianza se nota; hacia la confianza se descubre con un crédito ya
// aprobado.
export const HOST_PRODUCCION_EQUIFAX = "api.latam.equifax.com";

export type TipoIdentificacionEquifax = "C";

// Parámetros de la decisión. Son de relleno por ahora (decisión del negocio,
// 2026-10-12: sólo interesa lo que el buró trae de la persona). El
// tipoProducto existe en tres valores y se usa el 1. Quedan guardados con
// cada consulta para saber con qué se hizo.
export interface ParametrosDeDecision {
  tipoProducto: string;
  monto: number;
  plazo: number;
  restaGastoFinanciero: number;
}

export const PARAMETROS_DE_RELLENO: Readonly<ParametrosDeDecision> = Object.freeze({
  tipoProducto: "1",
  monto: 5000,
  plazo: 12,
  restaGastoFinanciero: 0,
});

export interface CuentaEquifax {
  billTo: string;
  shipTo: string;
  configuration: string;
  customer: string;
  model: string;
}

// mismo patrón que Aval, más una familia propia para lo que cuesta:
//   sin_respuesta = el pedido salió y no volvió nada: pudo cobrarse.
export type FamiliaEquifax =
  | "exito"
  | "transitorio"
  | "sin_respuesta"
  | "configuracion"
  | "solicitud"
  | "identificacion"
  | "desconocido"
  | "sin_config";

export interface RespuestaEquifax {
  status: "ok" | "error" | "sin_config";
  familia: FamiliaEquifax;
  httpEquifax?: number;        // el HTTP crudo, para diagnóstico
  httpStatus: number;          // el que NUESTRA API debería devolver
  cuerpo?: Record<string, unknown>; // el JSON entero, sin tocar: es el crudo
  cabeceras?: Record<string, string>; // sólo las que identifican la transacción
  parametros?: ParametrosDeDecision;
  duracionMs: number;
  intentos: number;
  puedeHaberCobrado: boolean;
  mensaje?: string;            // para la persona, ya en castellano
  detalleTecnico?: string;     // para el registro, sin secretos
}

interface Configuracion {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  alcance: string;
  cuenta: CuentaEquifax;
  plazoConsultaMs: number;
  plazoTokenMs: number;
  maxIntentos: number;
  esperaMs: number;
}

// Se lee en cada llamada y no al cargar el módulo: así las pruebas pueden
// poner variables distintas, y una secret rotada en Supabase se toma en la
// instancia siguiente sin tocar el código.
function configuracion(): Configuracion {
  const env = (k: string) => Deno.env.get(k) ?? "";
  return {
    baseUrl: (env("EQUIFAX_BASE_URL") || BASE_POR_DEFECTO).replace(/\/+$/, ""),
    clientId: env("EQUIFAX_CLIENT_ID"),
    clientSecret: env("EQUIFAX_CLIENT_SECRET"),
    alcance: env("EQUIFAX_SCOPE") || ALCANCE_POR_DEFECTO,
    cuenta: {
      billTo: env("EQUIFAX_BILL_TO"),
      shipTo: env("EQUIFAX_SHIP_TO"),
      configuration: env("EQUIFAX_CONFIGURATION"),
      customer: env("EQUIFAX_CUSTOMER"),
      model: env("EQUIFAX_MODEL"),
    },
    // 60 s: la orquestación arma una decisión y no se midió todavía cuánto
    // tarda. Se ajusta con el número real de la primera consulta, no a ojo.
    plazoConsultaMs: Number(env("EQUIFAX_PLAZO_MS") || "60000"),
    plazoTokenMs: 20_000,
    // 3 en total (decisión del negocio, 2026-10-19): los reintentos son sólo de
    // lo que no llegó a procesarse (429, 502, 503, 504), que responde en
    // segundos y no se cobra; un timeout no se reintenta nunca.
    maxIntentos: Math.max(1, Number(env("EQUIFAX_MAX_INTENTOS") || "3")),
    esperaMs: Number(env("EQUIFAX_ESPERA_MS") || "1500"),
  };
}

export function ambienteEquifax(): "prueba" | "produccion" {
  try {
    return new URL(configuracion().baseUrl).host === HOST_PRODUCCION_EQUIFAX ? "produccion" : "prueba";
  } catch {
    return "prueba";
  }
}

// ¿Está todo lo necesario para consultar? Devuelve lo que falta, por nombre.
export function faltantesDeConfiguracion(): string[] {
  const c = configuracion();
  const faltan: string[] = [];
  if (!c.clientId) faltan.push("EQUIFAX_CLIENT_ID");
  if (!c.clientSecret) faltan.push("EQUIFAX_CLIENT_SECRET");
  for (const [k, v] of Object.entries({
    EQUIFAX_BILL_TO: c.cuenta.billTo,
    EQUIFAX_SHIP_TO: c.cuenta.shipTo,
    EQUIFAX_CONFIGURATION: c.cuenta.configuration,
    EQUIFAX_CUSTOMER: c.cuenta.customer,
    EQUIFAX_MODEL: c.cuenta.model,
  })) {
    if (!v) faltan.push(k);
  }
  return faltan;
}

/**
 * El cuerpo del pedido. NO tiene lugar para el cónyuge: lo que no existe no
 * se puede mandar por un descuido de quien llama.
 */
export function armarPedido(
  identificacion: string,
  tipo: TipoIdentificacionEquifax,
  parametros: ParametrosDeDecision,
  cuenta: CuentaEquifax,
) {
  return {
    applicants: {
      primaryConsumer: {
        personalInformation: {
          tipoDocumento: tipo,
          numeroDocumento: identificacion,
          restaGastoFinanciero: parametros.restaGastoFinanciero,
          tipoProducto: parametros.tipoProducto,
          monto: parametros.monto,
          plazo: parametros.plazo,
        },
      },
    },
    productData: {
      billTo: cuenta.billTo,
      shipTo: cuenta.shipTo,
      configuration: cuenta.configuration,
      customer: cuenta.customer,
      model: cuenta.model,
    },
  };
}

// Saca de un texto cualquier cosa que parezca una credencial: un encabezado
// Authorization, un JWT o un base64 largo. Es una segunda defensa: ningún
// camino de este módulo mete la clave en un mensaje, pero una respuesta de
// error de un tercero puede repetir lo que se le mandó.
export function sanitizar(texto: string): string {
  return texto
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 <oculto>")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "<jwt oculto>")
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}/g, "<texto largo oculto>");
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- token ----------

// El token y el pedido en curso viven en el módulo. Con el pedido
// compartido, varias consultas simultáneas con el token vencido hacen UN
// inicio de sesión y no uno cada una (la lección de Novadata, E5: eran 52).
let tokenGuardado: { valor: string; venceEn: number } | null = null;
let tokenEnCurso: Promise<string> | null = null;

// Margen antes del vencimiento real: un token a punto de vencer puede
// caducar entre que se toma y que llega a Equifax.
const MARGEN_TOKEN_MS = 5 * 60 * 1000;

export function olvidarToken(): void {
  tokenGuardado = null;
  tokenEnCurso = null;
}

// Sin "parámetros-propiedad" (`public readonly x` en el constructor): el
// guion local corre estos módulos bajo Node, que sólo borra tipos y no sabe
// ejecutar esa sintaxis.
export class ErrorDeToken extends Error {
  familia: FamiliaEquifax;
  httpEquifax?: number;
  constructor(mensaje: string, familia: FamiliaEquifax, httpEquifax?: number) {
    super(mensaje);
    this.name = "ErrorDeToken";
    this.familia = familia;
    this.httpEquifax = httpEquifax;
  }
}

async function pedirToken(c: Configuracion): Promise<{ valor: string; venceEn: number }> {
  let res: Response;
  try {
    res = await fetch(c.baseUrl + RUTA_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(`${c.clientId}:${c.clientSecret}`),
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: c.alcance }),
      signal: AbortSignal.timeout(c.plazoTokenMs),
    });
  } catch (err) {
    // El token no cobra: si no llegó, no se procesó nada. Es transitorio.
    const timeout = (err as { name?: string })?.name === "TimeoutError" || (err as { name?: string })?.name === "AbortError";
    throw new ErrorDeToken(
      timeout ? `Equifax no contestó el pedido de token en ${c.plazoTokenMs / 1000} s` : `no se pudo conectar con Equifax para pedir el token: ${sanitizar(String(err))}`,
      "transitorio",
    );
  }
  const texto = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(texto); } catch { /* no era JSON */ }
  if (!res.ok || typeof json?.access_token !== "string") {
    const familia: FamiliaEquifax = res.status >= 500 || res.status === 429 ? "transitorio" : "configuracion";
    throw new ErrorDeToken(
      `Equifax rechazó el pedido de token (HTTP ${res.status}): ${sanitizar(texto.slice(0, 300))}`,
      familia,
      res.status,
    );
  }
  const duracionS = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return { valor: json.access_token as string, venceEn: Date.now() + duracionS * 1000 };
}

/** Un token vigente; pide uno nuevo sólo si no hay o está por vencer. */
export async function obtenerToken(): Promise<string> {
  if (tokenGuardado && tokenGuardado.venceEn - MARGEN_TOKEN_MS > Date.now()) return tokenGuardado.valor;
  if (!tokenEnCurso) {
    const c = configuracion();
    tokenEnCurso = pedirToken(c)
      .then((t) => { tokenGuardado = t; return t.valor; })
      .finally(() => { tokenEnCurso = null; });
  }
  return await tokenEnCurso;
}

/**
 * Prueba de conexión: pide un token NUEVO y nada más. No consulta a nadie y no
 * cuesta. Sirve para saber, desde cada lugar donde corre el código (esta
 * máquina, una Edge Function), si Equifax deja pasar y acepta las credenciales
 * (con Aval el 403 del WAF a la IP de Supabase se descubrió consultando
 * personas, y se perdió una tarde diagnosticando el motivo equivocado).
 */
export async function probarConexion(): Promise<{
  ok: boolean;
  duracionMs: number;
  familia?: FamiliaEquifax;
  httpEquifax?: number;
  mensaje?: string;
}> {
  const inicio = Date.now();
  const faltan = faltantesDeConfiguracion();
  if (faltan.length > 0) {
    return { ok: false, duracionMs: 0, familia: "sin_config", mensaje: `Faltan: ${faltan.join(", ")}` };
  }
  olvidarToken();
  try {
    await obtenerToken();
    return { ok: true, duracionMs: Date.now() - inicio };
  } catch (err) {
    const e = err as ErrorDeToken;
    return {
      ok: false, duracionMs: Date.now() - inicio, familia: e.familia ?? "transitorio",
      httpEquifax: e.httpEquifax, mensaje: sanitizar(e.message ?? String(err)),
    };
  }
}

// ---------- clasificación ----------

/**
 * Familia según lo que contestó Equifax. `motivoRed` != undefined cuando el
 * pedido salió y no hubo respuesta.
 */
export function clasificarRespuestaEquifax(
  http: number | undefined,
  motivoRed: string | undefined,
  cuerpoEsJson: boolean,
): { familia: FamiliaEquifax; http: number } {
  if (motivoRed) return { familia: "sin_respuesta", http: 504 };
  if (http === undefined) return { familia: "desconocido", http: 502 };
  if (http >= 200 && http < 300) {
    // Un 200 sin JSON no es una consulta: nada que guardar ni cobrar de más.
    return cuerpoEsJson ? { familia: "exito", http: 200 } : { familia: "desconocido", http: 502 };
  }
  if (http === 429 || http === 502 || http === 503 || http === 504) return { familia: "transitorio", http: 503 };
  if (http === 401 || http === 403) return { familia: "configuracion", http: 502 };
  if (http === 400 || http === 422) return { familia: "solicitud", http: 400 };
  if (http === 404) return { familia: "identificacion", http: 422 };
  return { familia: "desconocido", http: 502 };
}

// Las cabeceras que sirven para reclamarle algo a Equifax ("¿qué pasó con la
// transacción tal?"): sólo las que identifican el pedido, nunca las demás.
function cabecerasDeTransaccion(h: Headers): Record<string, string> {
  const salida: Record<string, string> = {};
  h.forEach((valor, nombre) => {
    if (/(request|correlation|transaction|trace)[-_]?id$/i.test(nombre)) salida[nombre.toLowerCase()] = valor.slice(0, 200);
  });
  return salida;
}

interface Intento {
  http?: number;
  cuerpo?: Record<string, unknown>;
  cuerpoTexto?: string;
  cabeceras?: Record<string, string>;
  motivoRed?: string;
}

async function unIntento(c: Configuracion, token: string, pedido: unknown): Promise<Intento> {
  try {
    const res = await fetch(c.baseUrl + RUTA_CONSULTA, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
      body: JSON.stringify(pedido),
      signal: AbortSignal.timeout(c.plazoConsultaMs),
    });
    const texto = await res.text();
    let json: Record<string, unknown> | undefined;
    try {
      const j = JSON.parse(texto);
      if (j && typeof j === "object" && !Array.isArray(j)) json = j;
    } catch { /* no era JSON */ }
    return { http: res.status, cuerpo: json, cuerpoTexto: texto, cabeceras: cabecerasDeTransaccion(res.headers) };
  } catch (err) {
    const n = (err as { name?: string })?.name;
    const timeout = n === "TimeoutError" || n === "AbortError";
    return { motivoRed: timeout ? `sin respuesta tras ${c.plazoConsultaMs / 1000} s` : sanitizar(String(err)) };
  }
}

/**
 * Consulta una identificación a Equifax. CUESTA: ver el encabezado.
 * El que llama es responsable de reutilizar una consulta vigente, de respetar
 * el tope diario y de dejar la constancia (quién, por qué base legal).
 */
export async function consultarEquifax(
  identificacion: string,
  opciones: { tipo?: TipoIdentificacionEquifax; parametros?: Partial<ParametrosDeDecision> } = {},
): Promise<RespuestaEquifax> {
  const inicio = Date.now();
  const tipo = opciones.tipo ?? "C";
  const parametros: ParametrosDeDecision = { ...PARAMETROS_DE_RELLENO, ...opciones.parametros };

  const faltan = faltantesDeConfiguracion();
  if (faltan.length > 0) {
    return {
      status: "sin_config", familia: "sin_config", httpStatus: 500, duracionMs: 0, intentos: 0, puedeHaberCobrado: false,
      mensaje: "Equifax no está configurado. No se consultó.",
      detalleTecnico: `faltan: ${faltan.join(", ")}`,
    };
  }
  const id = (identificacion ?? "").trim();
  if (!/^\d{10}$/.test(id)) {
    return {
      status: "error", familia: "solicitud", httpStatus: 400, duracionMs: 0, intentos: 0, puedeHaberCobrado: false,
      mensaje: "La identificación no es una cédula de 10 dígitos: no se consulta (cada consulta a Equifax se cobra).",
    };
  }

  const c = configuracion();
  const pedido = armarPedido(id, tipo, parametros, c.cuenta);

  let intentos = 0;
  let renovoToken = false;
  let ultimo: Intento = {};

  while (intentos < c.maxIntentos) {
    let token: string;
    try {
      token = await obtenerToken();
    } catch (err) {
      const e = err as ErrorDeToken;
      const familia = e.familia ?? "transitorio";
      // El token no cobra, así que su falla transitoria sí se reintenta.
      if (familia === "transitorio" && intentos + 1 < c.maxIntentos) {
        intentos++;
        await esperar(c.esperaMs * intentos);
        continue;
      }
      return {
        status: "error", familia, httpStatus: familia === "transitorio" ? 503 : 502, httpEquifax: e.httpEquifax,
        duracionMs: Date.now() - inicio, intentos: intentos + 1, puedeHaberCobrado: false, parametros,
        mensaje: familia === "transitorio"
          ? "No se pudo obtener el acceso a Equifax. No se consultó ni se cobró; reintentar más tarde."
          : "Equifax rechazó las credenciales de la cuenta. No se consultó. Revisar con quien administra la cuenta; reintentar no ayuda.",
        detalleTecnico: sanitizar(e.message ?? String(err)),
      };
    }

    intentos++;
    ultimo = await unIntento(c, token, pedido);
    const { familia } = clasificarRespuestaEquifax(ultimo.http, ultimo.motivoRed, ultimo.cuerpo !== undefined);

    // 401: el token se venció o se revocó. No se procesó nada, así que se
    // renueva y se repite UNA vez sin gastar el tope de intentos de cobro.
    if (ultimo.http === 401 && !renovoToken) {
      renovoToken = true;
      olvidarToken();
      intentos--;
      continue;
    }
    if (familia === "exito") {
      return {
        status: "ok", familia, httpStatus: 200, httpEquifax: ultimo.http, cuerpo: ultimo.cuerpo, cabeceras: ultimo.cabeceras,
        parametros, duracionMs: Date.now() - inicio, intentos, puedeHaberCobrado: true,
      };
    }
    if (familia !== "transitorio") break;
    if (intentos < c.maxIntentos) await esperar(c.esperaMs * intentos);
  }

  const { familia, http } = clasificarRespuestaEquifax(ultimo.http, ultimo.motivoRed, ultimo.cuerpo !== undefined);
  return {
    status: "error", familia, httpStatus: http, httpEquifax: ultimo.http, cabeceras: ultimo.cabeceras, parametros,
    duracionMs: Date.now() - inicio, intentos,
    // Una respuesta de error de validación (400/422) o de acceso (401/403) no
    // procesó nada; un 5xx del portón tampoco. Sólo "no hubo respuesta" o un
    // cuerpo raro dejan la duda.
    puedeHaberCobrado: familia === "sin_respuesta" || familia === "desconocido",
    mensaje: mensajeParaLaPersona(familia, ultimo.http, intentos),
    detalleTecnico: sanitizar(ultimo.motivoRed ?? (ultimo.cuerpoTexto ?? "").slice(0, 500)),
  };
}

function mensajeParaLaPersona(familia: FamiliaEquifax, http: number | undefined, intentos: number): string {
  const veces = `${intentos} intento${intentos === 1 ? "" : "s"}`;
  switch (familia) {
    case "sin_respuesta":
      return `Equifax no contestó a tiempo. La consulta pudo haberse procesado y cobrado: no se repite sola. Revisar con Equifax antes de volver a consultar. No se guardó nada.`;
    case "transitorio":
      return `Equifax respondió con un error temporal (HTTP ${http}) tras ${veces}. No se procesó la consulta. No se guardó nada; reintentar más tarde.`;
    case "configuracion":
      return `Equifax rechazó el acceso (HTTP ${http}). Revisar las credenciales o los permisos de la cuenta; reintentar no ayuda. No se guardó nada.`;
    case "solicitud":
      return `Equifax no aceptó el pedido (HTTP ${http}). No se guardó nada.`;
    case "identificacion":
      return `Equifax no encontró o no permite consultar esta identificación (HTTP ${http}). No se guardó nada.`;
    default:
      return `Equifax respondió algo no previsto (HTTP ${http ?? "sin código"}). La consulta pudo haberse procesado: revisar antes de repetir. No se guardó nada.`;
  }
}

/**
 * El documento por el que Equifax dice haber contestado
 * (reporteCrediticio.identificacion_consultada[0].numero_documento, forma
 * medida con la primera consulta real, 2026-10-12), o null si la respuesta no
 * lo trae. Con Aval, el ambiente de prueba contestó por OTRA persona en el 37%
 * de las consultas y el filtro de calidad sólo miraba si Aval había contestado,
 * no de quién: acá se compara el documento de la respuesta con el pedido antes
 * de guardar nada.
 */
export function documentoDeLaRespuesta(cuerpo: Record<string, unknown> | undefined): string | null {
  const reporte = cuerpo?.reporteCrediticio as { identificacion_consultada?: Array<{ numero_documento?: unknown }> } | undefined;
  const documento = reporte?.identificacion_consultada?.[0]?.numero_documento;
  return typeof documento === "string" && documento.trim() !== "" ? documento.trim() : null;
}

/** ¿Vale la pena guardar esta consulta? Sólo si Equifax contestó con un JSON. */
export function laConsultaEquifaxSirve(r: RespuestaEquifax): boolean {
  return r.status === "ok" && r.familia === "exito" && r.cuerpo !== undefined;
}
