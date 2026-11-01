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
//     el cese temporal también cuenta. Medido en research/proveedor-info-1-raw: la
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

// Un registro "cascarón" (sin ruc) es que nunca tuvo RUC: Proveedor_Info_1 a veces lo
// manda con todo en null. Hasta estructura-v14 también lo era un registro sin
// fecha de inscripción, y en el crudo del 2026-10-03 hay 5 con el número, el
// inicio (2019 a 2024) y un establecimiento, sin la inscripción ni ninguna
// fecha de cese: el perfil los daba con la actividad «activa» y sin RUC activo
// a la vez. Decisión del negocio del 2026-10-29: inactivo sólo si una fecha
// (cese, reapertura) lo respalda, así que la inscripción no hace falta.
export function esRegistroDeRuc(c: AnyRecord): boolean {
  return Boolean(c.ruc);
}

// Proveedor_Info_1 empezó a mandar el estado abreviado en algunos registros: en la
// reconsulta de la cartera del 2026-10-03 conviven "ABIERTO" y "CERRADO" con
// "ABI" y "CER" (27 y 22 de ~700 registros en las primeras 500 personas; en
// la del 2026-09-25, ninguno). Leyendo sólo "ABIERTO", quien tenía su
// establecimiento en "ABI" quedaba sin RUC activo y con 0 establecimientos
// activos (estructura-v13). La comparación vivía copiada en process.ts y dos
// veces en fuentes-ingreso.ts: ahora todas llaman a ésta.
//
// Desde estructura-v15 (decisiones del negocio del 2026-10-29: cerrado sólo
// si una fecha lo respalda, y una reapertura posterior al cierre es que
// reinició actividades), abierto es:
//   - reabrió después del último cierre, diga lo que diga el estado: en el
//     crudo del 2026-10-03, 285 «CERRADO» o «CER» traen el reinicio posterior
//     al cierre. Cambia los establecimientos activos de 134 personas y deja con
//     RUC activo a 6 que tenían el RUC reactivado;
//   - o el estado lo dice, aunque no traiga la reapertura: de los 624 abiertos
//     con fecha de cierre, 614 reabrieron después y 10 no traen esa fecha;
//   - o no trae estado ni fecha de cierre (8 de 3.587 del 2026-10-03; 49 de
//     1.718 en el lote de paridad, casi todos de las respuestas que el HTTP
//     502 dejó incompletas): nada dice que cerró.
// Un «CERRADO» sin ninguna fecha (282 en el 2026-10-03) sigue cerrado: lo
// dice el estado y ninguna fecha lo contradice.
const ESTADOS_ABIERTO = new Set(["ABIERTO", "ABI"]);

export function establecimientoAbierto(e: AnyRecord): boolean {
  const cierre = diaDeFecha(e.fech_cierre);
  const reinicio = diaDeFecha(e.fech_reinicio_actividades);
  if (cierre && reinicio && reinicio > cierre) return true;
  const estado = String(e.estado_establecimiento ?? "").trim().toUpperCase();
  if (estado !== "") return ESTADOS_ABIERTO.has(estado);
  return !cierre;
}

export function rucActivo(c: AnyRecord, establecimientos: AnyRecord[] = []): boolean {
  if (!esRegistroDeRuc(c) || !fechasDelRuc(c).activoPorFechas) return false;
  return establecimientos.length === 0 || establecimientos.some(establecimientoAbierto);
}

// ¿El SRI dio de baja este RUC en una depuración de su registro, y la actividad
// era el trabajo en relación de dependencia? (estructura-v17, decisión del
// negocio del 2026-10-31: no es una señal negativa.) El modelo leía a esa gente
// como una actividad económica suspendida (c-79e1ac23), y el motivo sólo
// viene en observ_solicitud_suspension. Medido en el último perfil de las 3.765
// personas reales: de 1.276 con fecha de cese, 169 son «DEPURACION» (las demás,
// «CESE DE ACTIVIDADES» 387, «FALLECIMIENTO» 7 y vacío 713), y de ellas 17 con
// esta actividad; 77 de las 169 traen «SIN ACTIVIDAD ECONOMICA - CIIU», que
// quedan afuera hasta que el negocio decida. El RUC del establecimiento se
// compara si viene: una persona puede tener más de un registro. Sin RUC, null.
const ACTIVIDAD_EN_RELACION_DE_DEPENDENCIA = /RELACION DE DEPENDENCIA/;
const sinTildes = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

export function rucDepuradoEnRelacionDeDependencia(c: AnyRecord | null | undefined, establecimientos: AnyRecord[] = []): boolean | null {
  if (!c || !esRegistroDeRuc(c)) return null;
  if (sinTildes(c.observ_solicitud_suspension) !== "DEPURACION") return false;
  return establecimientos.some((e) => (!e.ruc || e.ruc === c.ruc) && ACTIVIDAD_EN_RELACION_DE_DEPENDENCIA.test(sinTildes(e.act_economica)));
}

// «Obligado a llevar contabilidad», del registro del RUC (estructura-v15, para
// el nivel 1 del predictor de ingresos). Proveedor_Info_1 lo abrevia igual que el estado
// de los establecimientos: en los crudos del 2026-10-03 (2.553 registros con
// RUC) vienen «NO» 2.063, «SI» 128, «N» 106 y «S» 4, y en los 1.176 de la
// paridad de la persona (12.29), «S» 15 y «SI» 39. Contra Equifax coincide en
// las 83 personas con RUC de las dos fuentes (las «N» incluidas; ninguna «S»).
// Sin RUC no hay dato: null, no false (los 252 cascarones lo traen vacío). Un
// valor que no es ninguno de los cuatro también es null: no se adivina.
//
// OJO: fuentes-ingreso.ts compara sólo «SI» para el indicio de ingreso mayor y
// el tamaño del negocio, y no ve la «S». Pasarlo a esta función cambia lo que
// lee el modelo (fuentes-v nueva y marco nuevo): queda pendiente.
const OBLIGADO_SI = new Set(["SI", "S"]);
const OBLIGADO_NO = new Set(["NO", "N"]);

export function obligadoALlevarContabilidad(c: AnyRecord | null | undefined): boolean | null {
  if (!c || !esRegistroDeRuc(c)) return null;
  const v = String(c.obligado ?? "").trim().toUpperCase();
  return OBLIGADO_SI.has(v) ? true : OBLIGADO_NO.has(v) ? false : null;
}
