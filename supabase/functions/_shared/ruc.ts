// Si un RUC está activo: UNA regla para todo el sistema.
//
// Hasta el 2026-09-25 había dos. process.ts miraba el cese y el reinicio;
// fuentes-ingreso.ts sólo si nunca hubo cese. Quien cerró el RUC y lo
// reabrió figuraba activo en el perfil e inactivo en la clasificación de
// ingresos: 77 personas quedaron como "informal o sin actividad" teniendo
// actividad. Dos implementaciones de lo mismo terminan diciendo cosas
// distintas; por eso vive acá y las dos la importan.
//
// LA REGLA
//
// El SRI guarda, por registro de RUC, el inicio de actividades, el cese
// más reciente y el reinicio más reciente -- no el historial completo.
//   - Cese: el más reciente entre la cancelación, la suspensión definitiva
//     y la solicitud de suspensión (el cese temporal). Pedido del negocio:
//     el cese temporal también cuenta. Medido en research/novadata-raw: la
//     solicitud viene en 1 registro de 352 (y con cancelación); cancelación
//     y suspensión definitiva vienen siempre juntas (153).
//   - Activo por fechas: sin cese, o con un reinicio posterior al cese.
//   - Además, si el SRI informa establecimientos, al menos uno ABIERTO. Un
//     RUC sin cese pero con todo cerrado es un cese de hecho. Medido: 0 de
//     261 RUC activos en la muestra; la regla existe para cuando aparezca.
//     De los establecimientos se usa el estado, no sus fechas: vienen en
//     dd/mm/yyyy y `new Date` las lee al revés (ver process.ts).

type AnyRecord = Record<string, unknown>;

// "yyyy/mm/dd" (así manda el SRI las fechas del RUC) o "dd/mm/yyyy" ->
// "yyyy-mm-dd". Se compara al día: un cese y un reinicio del mismo mes
// tienen que ordenarse bien.
export function diaDeFecha(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const iso = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}

export interface FechasDelRuc {
  inicio: string | null;
  cese: string | null; // el más reciente, incluido el temporal
  reinicio: string | null;
  activoPorFechas: boolean;
}

export function fechasDelRuc(c: AnyRecord): FechasDelRuc {
  const cese =
    [diaDeFecha(c.fecha_cancelacion), diaDeFecha(c.fecha_suspension_definitiva), diaDeFecha(c.fecha_solicitud_suspension)]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;
  const reinicio = diaDeFecha(c.fecha_reinicio_actividades);
  return {
    inicio: diaDeFecha(c.fecha_inicio_actividades),
    cese,
    reinicio,
    activoPorFechas: !cese || Boolean(reinicio && reinicio > cese),
  };
}

// Un registro "cascarón" (sin ruc o sin fecha de inscripción) es que nunca
// tuvo RUC: Novadata a veces lo manda con todo en null.
export function esRegistroDeRuc(c: AnyRecord): boolean {
  return Boolean(c.ruc && c.fecha_inscripcion_ruc);
}

export function establecimientoAbierto(e: AnyRecord): boolean {
  return String(e.estado_establecimiento ?? "").toUpperCase() === "ABIERTO";
}

export function rucActivo(c: AnyRecord, establecimientos: AnyRecord[] = []): boolean {
  if (!esRegistroDeRuc(c) || !fechasDelRuc(c).activoPorFechas) return false;
  return establecimientos.length === 0 || establecimientos.some(establecimientoAbierto);
}
