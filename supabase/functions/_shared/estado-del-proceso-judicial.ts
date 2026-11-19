// Estado de un proceso judicial (regla R1 de la ola 3): ¿terminó, sigue
// pendiente, quedó sin moverse o ni siquiera es una demanda?
//
// Función pura, sin red ni base. La entrada no depende de la fuente: el
// adaptador del JSON de la consulta pública de causas de la Función Judicial
// (e-SATJE) la arma aparte. Todavía no se conecta a process.ts ni al perfil.
//
// Por qué existe: se leyeron 11 procesos reales (2026-11-18, 10 de cobro y 2
// de otra índole) y la palabra "archivo" o "pago" no dice nada por sí sola:
// «ENVIO DEL PROCESO AL ARCHIVO GENERAL (RAZON)» aparece varias veces con el
// proceso vivo, y una «SENTENCIA» en un ejecutivo no termina nada porque sigue
// la ejecución (mandamiento, embargo...). Sólo cierra un AUTO INTERLOCUTORIO
// cuyo tipo diga que se pagó, se archivó, se abandonó o se transó.
//
// Por qué hace falta «sin_avance»: el abandono del art. 245 del COGEP no
// procede en la etapa de ejecución (art. 247), así que un ejecutivo con
// sentencia puede quedar abierto para siempre sin moverse. Un proceso sin
// cierre cuya última actuación es vieja no está «pendiente» en el sentido útil.
//
// Fechas: Ecuador es UTC-5 sin horario de verano y a las 20:00 la fecha UTC ya
// es la de mañana, así que todo se hace con fechas de calendario en texto
// «AAAA-MM-DD», nunca con Date con hora.

/** Años sin actuaciones a partir de los cuales un proceso sin cierre es «sin_avance».
 *  Lo fija el negocio: este valor es PROVISIONAL y el llamador lo pasa explícito
 *  en `opciones.aniosSinAvance`; la función no lo asume por su cuenta. */
export const ANIOS_SIN_AVANCE_PROVISIONAL = 3;

export type EstadoDelProceso =
  | "terminado"
  | "pendiente"
  | "sin_avance"
  | "no_es_demanda";

export type MotivoDeCierre =
  | "pago"
  | "archivo"
  | "abandono"
  | "acuerdo_transaccional"
  | "desistimiento"
  | "deprecatorio";

export interface ActuacionJudicial {
  fecha: string; // AAAA-MM-DD
  tipo: string;
  texto?: string;
}

export interface DependenciaJudicial {
  nombre: string;
  instancia?: string;
  actuaciones: ActuacionJudicial[];
}

export interface ProcesoJudicial {
  numeroProceso: string;
  materia?: string;
  tipoAccion?: string;
  dependencias: DependenciaJudicial[];
}

export interface OpcionesDelProceso {
  hoy: string; // AAAA-MM-DD, fecha de calendario de Ecuador
  aniosSinAvance: number;
}

export interface CierreDelProceso {
  motivo: Exclude<MotivoDeCierre, "deprecatorio">;
  fecha: string;
  actuacion: string;
}

export interface EstadoDelProcesoJudicial {
  estado: EstadoDelProceso;
  motivo: MotivoDeCierre | null;
  fechaDeCierre: string | null;
  actuacionDeCierre: string | null;
  ultimaActuacion: string | null;
  aniosDesdeUltimaActuacion: number | null;
  dependenciaPrincipal: string | null;
  /** Todos los cierres de la dependencia principal, del más viejo al más
   *  reciente. Si hay un acuerdo y después el archivo, `motivo` es el del
   *  último (el que dejó el proceso quieto) y acá se ven los dos. */
  cierres: CierreDelProceso[];
}

/** Tildes, mayúsculas y espacios: el e-SATJE no es consistente con ninguno. */
export function normalizarTexto(s: string | undefined | null): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Prefijos del TIPO (no del texto de la providencia) que, siendo auto
// interlocutorio, cierran. Se compara con el inicio para que «archivo» suelto
// en «ENVIO DEL PROCESO AL ARCHIVO GENERAL» no cuente.
const CIERRES: { prefijo: RegExp; motivo: CierreDelProceso["motivo"] }[] = [
  { prefijo: /^SOLUCION O PAGO\b/, motivo: "pago" },
  { prefijo: /^(PAGO|EXTINCION DE LA OBLIGACION)\b/, motivo: "pago" },
  { prefijo: /^ARCHIVO DEL PROCESO\b/, motivo: "archivo" },
  { prefijo: /^ABANDONO\b/, motivo: "abandono" },
  { prefijo: /^ACUERDO TRANSACCIONAL\b/, motivo: "acuerdo_transaccional" },
  // Variante razonable agregada: el desistimiento aceptado por auto termina el
  // proceso igual que un archivo. Sin la marca de auto interlocutorio no cuenta.
  { prefijo: /^DESISTIMIENTO\b/, motivo: "desistimiento" },
];

export function motivoDeCierreDeLaActuacion(
  tipo: string,
): CierreDelProceso["motivo"] | null {
  const t = normalizarTexto(tipo);
  // Sin la marca de auto interlocutorio no cierra: una «SENTENCIA» o una
  // «RAZON» no lo son aunque nombren un pago o un archivo.
  if (!t.includes("AUTO INTERLOCUTORIO")) return null;
  for (const c of CIERRES) if (c.prefijo.test(t)) return c.motivo;
  return null;
}

function esDeprecatorio(
  p: ProcesoJudicial,
  principal: DependenciaJudicial | null,
): boolean {
  if (
    normalizarTexto(p.tipoAccion).includes("DEPRECATORIO") ||
    normalizarTexto(p.materia).includes("DEPRECATORIO")
  ) return true;
  // Un deprecatorio termina con «DEVOLUCION DEPRECATORIO»: sirve de respaldo
  // si la fuente no trae el tipo de acción, pero sólo en la dependencia
  // principal. Un juicio de cobro trae sus encargos de citación en otra ciudad
  // como dependencias propias (visto en los procesos leídos el 2026-11-18):
  // mirarlas todas hacía pasar la demanda entera por un deprecatorio.
  return (principal?.actuaciones ?? []).some((a) =>
    normalizarTexto(a.tipo).startsWith("DEVOLUCION DEPRECATORIO")
  );
}

/** Dependencia donde vale el cierre: la de primera instancia; si la fuente no
 *  lo dice (o hay varias), la que más actuaciones tiene, y a igual cantidad la
 *  primera de la lista. Los deprecatorios en otra ciudad y la sala de
 *  apelación no deciden si el proceso terminó: una apelación resuelta que
 *  vuelve al inferior no cierra nada por sí sola. */
function dependenciaPrincipalDe(
  deps: DependenciaJudicial[],
): DependenciaJudicial | null {
  if (deps.length === 0) return null;
  const primeras = deps.filter((d) => {
    const i = normalizarTexto(d.instancia);
    return /\b(PRIMERA|PRIMER|1RA|1)\b/.test(i) && !/SEGUNDA|APELACION/.test(i);
  });
  const candidatas = primeras.length > 0 ? primeras : deps;
  return candidatas.reduce((mejor, d) =>
    d.actuaciones.length > mejor.actuaciones.length ? d : mejor
  );
}

function partes(f: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  if (!m) throw new Error(`Fecha inválida, se esperaba AAAA-MM-DD: ${f}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function dias(f: string): number {
  const [a, m, d] = partes(f);
  return Math.floor(Date.UTC(a, m - 1, d) / 86_400_000);
}

/** La fecha de calendario de `f` menos N años; el 29 de febrero cae el 28. */
function restarAnios(f: string, n: number): string {
  const [a, m, d] = partes(f);
  const año = a - n;
  const bisiesto = (año % 4 === 0 && año % 100 !== 0) || año % 400 === 0;
  const dia = m === 2 && d === 29 && !bisiesto ? 28 : d;
  return `${String(año).padStart(4, "0")}-${String(m).padStart(2, "0")}-${
    String(dia).padStart(2, "0")
  }`;
}

export function estadoDelProcesoJudicial(
  proceso: ProcesoJudicial,
  opciones: OpcionesDelProceso,
): EstadoDelProcesoJudicial {
  const principal = dependenciaPrincipalDe(proceso.dependencias);
  const todas = proceso.dependencias.flatMap((d) => d.actuaciones);
  const ultima = todas.reduce<string | null>(
    (u, a) => (u === null || a.fecha > u ? a.fecha : u),
    null,
  );
  const anios = ultima === null
    ? null
    : Math.round(((dias(opciones.hoy) - dias(ultima)) / 365.25) * 100) / 100;

  const base = {
    ultimaActuacion: ultima,
    aniosDesdeUltimaActuacion: anios,
    dependenciaPrincipal: principal?.nombre ?? null,
  };

  if (esDeprecatorio(proceso, principal)) {
    return {
      ...base,
      estado: "no_es_demanda",
      motivo: "deprecatorio",
      fechaDeCierre: null,
      actuacionDeCierre: null,
      cierres: [],
    };
  }

  const cierres: CierreDelProceso[] = [];
  for (const a of principal?.actuaciones ?? []) {
    const motivo = motivoDeCierreDeLaActuacion(a.tipo);
    if (motivo) cierres.push({ motivo, fecha: a.fecha, actuacion: a.tipo });
  }
  cierres.sort((x, y) => x.fecha.localeCompare(y.fecha));

  if (cierres.length > 0) {
    const ultimo = cierres[cierres.length - 1];
    return {
      ...base,
      estado: "terminado",
      motivo: ultimo.motivo,
      fechaDeCierre: ultimo.fecha,
      actuacionDeCierre: ultimo.actuacion,
      cierres,
    };
  }

  // Sin cierre. Con más de N años desde la última actuación de cualquier
  // dependencia es «sin_avance»; justo N años todavía es «pendiente».
  // Sin actuaciones no se puede afirmar que no avanza: queda «pendiente» y el
  // llamador ve `ultimaActuacion` en null.
  const sinAvance = ultima !== null &&
    ultima < restarAnios(opciones.hoy, opciones.aniosSinAvance);
  return {
    ...base,
    estado: sinAvance ? "sin_avance" : "pendiente",
    motivo: null,
    fechaDeCierre: null,
    actuacionDeCierre: null,
    cierres: [],
  };
}
