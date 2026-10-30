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

// Novadata empezó a mandar el estado abreviado en algunos registros: en la
// reconsulta de la cartera del 2026-10-03 conviven "ABIERTO" y "CERRADO" con
// "ABI" y "CER" (27 y 22 de ~700 registros en las primeras 500 personas; en
// la del 2026-09-25, ninguno). Leyendo sólo "ABIERTO", quien tenía su
// establecimiento en "ABI" quedaba sin RUC activo y con 0 establecimientos
// activos (estructura-v13). La comparación vivía copiada en process.ts y dos
// veces en fuentes-ingreso.ts: ahora todas llaman a ésta.
const ESTADOS_ABIERTO = new Set(["ABIERTO", "ABI"]);

export function establecimientoAbierto(e: AnyRecord): boolean {
  return ESTADOS_ABIERTO.has(String(e.estado_establecimiento ?? "").trim().toUpperCase());
}

export function rucActivo(c: AnyRecord, establecimientos: AnyRecord[] = []): boolean {
  if (!esRegistroDeRuc(c) || !fechasDelRuc(c).activoPorFechas) return false;
  return establecimientos.length === 0 || establecimientos.some(establecimientoAbierto);
}

// «Obligado a llevar contabilidad», del registro del RUC (estructura-v15, para
// el nivel 1 del predictor de ingresos). Novadata lo abrevia igual que el estado
// de los establecimientos: en los crudos del 2026-10-03 (2.553 registros con
// RUC) vienen «NO» 2.063, «SI» 128, «N» 106 y «S» 4, y en los 1.176 de la
// paridad de la persona (12.29), «S» 15 y «SI» 39. Contra Equifax coincide en
// las 83 personas con RUC de las dos fuentes (las «N» incluidas; ninguna «S»).
// Sin RUC no hay dato: null, no false (los 252 cascarones lo traen vacío). Un
// valor que no es ninguno de los cuatro también es null: no se adivina.
//
// «Tiene RUC» es lo mismo que en estadoActividadEconomica (process.ts): que el
// registro traiga el número, no esRegistroDeRuc(). En el crudo del 2026-10-03
// 5 registros traen el RUC, el inicio y «N» sin fecha de inscripción; el perfil
// los da con RUC y el nivel 1 del predictor les pone sri_ruc = 1, así que el
// obligado tiene que venir también.
//
// OJO: fuentes-ingreso.ts compara sólo «SI» para el indicio de ingreso mayor y
// el tamaño del negocio, y no ve la «S». Pasarlo a esta función cambia lo que
// lee el modelo (fuentes-v nueva y marco nuevo): queda pendiente.
const OBLIGADO_SI = new Set(["SI", "S"]);
const OBLIGADO_NO = new Set(["NO", "N"]);

export function obligadoALlevarContabilidad(c: AnyRecord | null | undefined): boolean | null {
  if (!c?.ruc) return null;
  const v = String(c.obligado ?? "").trim().toUpperCase();
  return OBLIGADO_SI.has(v) ? true : OBLIGADO_NO.has(v) ? false : null;
}
