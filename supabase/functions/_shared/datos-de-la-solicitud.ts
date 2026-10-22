// Los datos que la especificación de la API (api/openapi.yaml,
// PedidoDeEvaluacion) pide con cada evaluación y que la solicitud guarda:
// la autorización del titular, la referencia de la institución, el operador,
// la prioridad y a qué evaluación reemplaza (133, 135; decididos por el negocio
// el 2026-10-19).
//
// Son opcionales acá: la pantalla del analista no los manda. Los exige la
// puerta de la API de la Fase 1, que todavía no existe; esta función sólo
// valida lo que llega y deja pasar lo que falta.
//
// De la autorización se guardan los datos y la huella del documento, NUNCA el
// documento: se eligen los campos uno por uno, así que un campo de más en el
// cuerpo (un `documento`, un PDF en base64) no llega a la base.
//
// Función pura: la usan evaluar-solicitud y las pruebas.

export const CANALES_DE_AUTORIZACION = ["firma_electronica", "documento_fisico_digitalizado", "aceptacion_electronica"] as const;
export const FINALIDADES_DE_AUTORIZACION = ["evaluacion_de_credito"] as const;
export const PRIORIDADES = ["interactiva", "diferida"] as const;

export type CanalDeAutorizacion = (typeof CANALES_DE_AUTORIZACION)[number];
export type FinalidadDeAutorizacion = (typeof FINALIDADES_DE_AUTORIZACION)[number];
export type Prioridad = (typeof PRIORIDADES)[number];

export interface AutorizacionDelTitular {
  id: string;
  /** ISO. */
  otorgadaEl: string;
  /** AAAA-MM-DD, o null si no vence. */
  vigenteHasta: string | null;
  canal: CanalDeAutorizacion;
  finalidad: FinalidadDeAutorizacion;
  /** "sha256:" y 64 caracteres hexadecimales. */
  huellaDelDocumento: string;
}

export interface OperadorDeLaInstitucion {
  id: string;
  agencia: string | null;
}

export interface DatosDeLaSolicitud {
  autorizacion: AutorizacionDelTitular | null;
  referencia: string | null;
  operador: OperadorDeLaInstitucion | null;
  prioridad: Prioridad | null;
  /** El id (uuid) de otra solicitud. Que exista y sea de la misma persona lo comprueba la función. */
  reemplazaA: string | null;
}

const REFERENCIA = /^[A-Za-z0-9._/-]+$/;
const HUELLA = /^sha256:[0-9a-f]{64}$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FECHA_Y_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un error con el campo al que se refiere, como puntero JSON (RFC 6901), para que
// la API le diga a la institución cuál corregir. La pantalla sólo muestra el motivo.
export interface ErrorDeCampo {
  campo: string;
  motivo: string;
  codigo?: string;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const faltante = (v: unknown) => v === undefined || v === null;

// Un texto de 1 a `max` caracteres (sin contar los espacios de los bordes).
function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
}

// «Hoy» en Ecuador: UTC-5 todo el año. A las 20:00 de Ecuador la fecha UTC ya
// es la de mañana, y una autorización que vence hoy no estaría vencida.
export function hoyEnEcuador(ahora: Date): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

function fechaValida(v: string): boolean {
  const m = FECHA.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function validarAutorizacion(a: unknown, ahora: Date, errores: ErrorDeCampo[]): AutorizacionDelTitular | null {
  if (faltante(a)) return null;
  if (!esObjeto(a)) {
    errores.push({ campo: "/autorizacion", motivo: "La autorización del titular va como objeto: id, otorgadaEl, canal, finalidad y huellaDelDocumento." });
    return null;
  }
  const n = errores.length;
  const id = texto(a.id, 64);
  if (!id) errores.push({ campo: "/autorizacion/id", motivo: "La autorización lleva su id (de 1 a 64 caracteres)." });
  const otorgadaEl = typeof a.otorgadaEl === "string" && FECHA_Y_HORA.test(a.otorgadaEl) && !Number.isNaN(Date.parse(a.otorgadaEl)) ? new Date(a.otorgadaEl).toISOString() : null;
  if (!otorgadaEl) errores.push({ campo: "/autorizacion/otorgadaEl", motivo: "La autorización lleva la fecha y hora en que se otorgó (otorgadaEl), por ejemplo 2026-10-19T14:30:00-05:00." });
  let vigenteHasta: string | null = null;
  if (!faltante(a.vigenteHasta)) {
    if (typeof a.vigenteHasta !== "string" || !fechaValida(a.vigenteHasta)) errores.push({ campo: "/autorizacion/vigenteHasta", motivo: "vigenteHasta es una fecha, AAAA-MM-DD." });
    else if (a.vigenteHasta < hoyEnEcuador(ahora)) errores.push({ campo: "/autorizacion/vigenteHasta", motivo: "La autorización del titular está vencida.", codigo: "autorizacion-vencida" });
    else vigenteHasta = a.vigenteHasta;
  }
  const canal = CANALES_DE_AUTORIZACION.find((c) => c === a.canal) ?? null;
  if (!canal) errores.push({ campo: "/autorizacion/canal", motivo: `El canal de la autorización es ${CANALES_DE_AUTORIZACION.map((c) => `«${c}»`).join(", ")}.` });
  const finalidad = FINALIDADES_DE_AUTORIZACION.find((f) => f === a.finalidad) ?? null;
  if (!finalidad) errores.push({ campo: "/autorizacion/finalidad", motivo: "La finalidad de la autorización es «evaluacion_de_credito»." });
  const huella = typeof a.huellaDelDocumento === "string" && HUELLA.test(a.huellaDelDocumento) ? a.huellaDelDocumento : null;
  if (!huella) errores.push({ campo: "/autorizacion/huellaDelDocumento", motivo: "La huella del documento es «sha256:» y 64 caracteres hexadecimales en minúscula. Se guarda la huella, nunca el documento." });

  if (errores.length > n || !id || !otorgadaEl || !canal || !finalidad || !huella) return null;
  return { id, otorgadaEl, vigenteHasta, canal, finalidad, huellaDelDocumento: huella };
}

function validarOperador(o: unknown, errores: ErrorDeCampo[]): OperadorDeLaInstitucion | null {
  if (faltante(o)) return null;
  if (!esObjeto(o)) {
    errores.push({ campo: "/operador", motivo: "El operador va como objeto: id y, si hay, agencia." });
    return null;
  }
  const n = errores.length;
  const id = texto(o.id, 64);
  if (!id) errores.push({ campo: "/operador/id", motivo: "El operador lleva su id (de 1 a 64 caracteres)." });
  let agencia: string | null = null;
  if (!faltante(o.agencia)) {
    agencia = texto(o.agencia, 100);
    if (!agencia) errores.push({ campo: "/operador/agencia", motivo: "La agencia del operador tiene hasta 100 caracteres." });
  }
  return errores.length > n || !id ? null : { id, agencia };
}

// `cuerpo` es el de evaluar-solicitud o, más adelante, el de la puerta de la
// API: los nombres son los de PedidoDeEvaluacion.
export function validarDatosDeLaSolicitud(
  cuerpo: Record<string, unknown>,
  ahora: Date = new Date(),
): { ok: true; datos: DatosDeLaSolicitud } | { ok: false; errores: string[]; detalle: ErrorDeCampo[] } {
  const errores: ErrorDeCampo[] = [];

  const autorizacion = validarAutorizacion(cuerpo.autorizacion, ahora, errores);
  const operador = validarOperador(cuerpo.operador, errores);

  let referencia: string | null = null;
  if (!faltante(cuerpo.referencia)) {
    const r = texto(cuerpo.referencia, 64);
    if (r === null || !REFERENCIA.test(r)) errores.push({ campo: "/referencia", motivo: "La referencia tiene de 1 a 64 caracteres: letras, números y . _ / -" });
    else referencia = r;
  }

  let prioridad: Prioridad | null = null;
  if (!faltante(cuerpo.prioridad)) {
    prioridad = PRIORIDADES.find((p) => p === cuerpo.prioridad) ?? null;
    if (!prioridad) errores.push({ campo: "/prioridad", motivo: "La prioridad es «interactiva» o «diferida»." });
  }

  let reemplazaA: string | null = null;
  if (!faltante(cuerpo.reemplazaA)) {
    if (typeof cuerpo.reemplazaA !== "string" || !UUID.test(cuerpo.reemplazaA)) errores.push({ campo: "/reemplazaA", motivo: "reemplazaA es el id de otra solicitud." });
    else reemplazaA = cuerpo.reemplazaA.toLowerCase();
  }

  return errores.length ? { ok: false, errores: errores.map((e) => e.motivo), detalle: errores } : { ok: true, datos: { autorizacion, referencia, operador, prioridad, reemplazaA } };
}
