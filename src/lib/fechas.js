// Todas las fechas de la aplicación, en hora de Ecuador continental.
//
// POR QUÉ ESTO EXISTE
//
// La base guarda cada instante en UTC, que es lo correcto: un instante
// es absoluto y no depende de dónde se lo mire. El problema aparece al
// mostrarlo y, sobre todo, al AGRUPARLO.
//
// Había dos errores distintos conviviendo:
//
//   1. Mostrar el texto crudo de la fecha guardada. Una consulta de las
//      17:26 del lunes aparecía como "22:26" -- la hora UTC.
//
//   2. Cortar ese texto para sacar el día. Una consulta de las 20:00 de
//      un lunes cae en martes según UTC, así que aparecía contada en el
//      día equivocado. Eso no es un problema de presentación: los
//      informes por día quedaban corridos para todo lo que pasara
//      después de las 19:00.
//
// Y un tercer error más silencioso: usar la hora del navegador. Eso
// acierta mientras quien mira esté en Ecuador, y deja de acertar cuando
// alguien abre el sistema desde otro país. En una institución
// financiera el día operativo es uno solo para todos: el de la
// institución, no el de quien mira la pantalla.
//
// De ahí la regla: ninguna pantalla formatea fechas por su cuenta.
// Todas pasan por acá, y acá la zona es explícita.

// Ecuador continental. Se usa el nombre de la zona y no el desfase
// suelto porque el nombre sobrevive a cualquier cambio de huso: si
// algún día el país adoptara horario de verano, esto sigue siendo
// correcto sin tocar una línea.
//
// (Galápagos es UTC-6. Si alguna vez hay operación allá, esto deja de
// ser una constante y pasa a ser un parámetro de la institución.)
export const ZONA_ECUADOR = "America/Guayaquil";

// El desfase literal hace falta para ARMAR instantes, no para
// mostrarlos: cuando alguien elige "del 1 al 15" en un selector, hay
// que convertir esas fechas a los instantes exactos en que empieza y
// termina ese día en Ecuador. Ecuador continental está en -05:00 todo
// el año, sin horario de verano.
export const DESFASE_ECUADOR = "-05:00";

const aFecha = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const FMT_DIA = new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA_ECUADOR });
const FMT_FECHA = new Intl.DateTimeFormat("es-EC", {
  timeZone: ZONA_ECUADOR,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const FMT_FECHA_HORA = new Intl.DateTimeFormat("es-EC", {
  timeZone: ZONA_ECUADOR,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  // 24 horas: en un registro de operación, "7:15" sin más es ambiguo y
  // la ambigüedad se paga al reconstruir qué pasó.
  hour12: false,
});
const FMT_HORA = new Intl.DateTimeFormat("es-EC", {
  timeZone: ZONA_ECUADOR,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "2026-09-15" en hora de Ecuador. Es la clave con la que se agrupa
 *  por día: nunca cortar el texto de la fecha guardada. */
export function diaEcuador(v) {
  const d = aFecha(v);
  return d ? FMT_DIA.format(d) : "";
}

/** "15/09/2026" */
export function formatearFecha(v) {
  const d = aFecha(v);
  return d ? FMT_FECHA.format(d) : "—";
}

/** "15/09/2026 17:26" */
export function formatearFechaHora(v) {
  const d = aFecha(v);
  return d ? FMT_FECHA_HORA.format(d).replace(",", "") : "—";
}

/** "17:26" */
export function formatearHora(v) {
  const d = aFecha(v);
  return d ? FMT_HORA.format(d) : "—";
}

/** "2026-09-15 17:26" — ordenable y legible, para tablas densas. */
export function fechaHoraOrdenable(v) {
  const d = aFecha(v);
  return d ? `${FMT_DIA.format(d)} ${FMT_HORA.format(d)}` : "—";
}

/** Clave de agrupación al minuto, en hora de Ecuador. */
export function minutoEcuador(v) {
  return fechaHoraOrdenable(v);
}

/** El día de hoy en Ecuador, "2026-09-15". Para nombres de archivo y
 *  valores por defecto de los selectores: a las 20:00 de Ecuador, la
 *  fecha UTC ya es la de mañana. */
export function hoyEcuador() {
  return FMT_DIA.format(new Date());
}

/** Convierte "2026-09-15" en el instante en que empieza ese día en
 *  Ecuador, listo para comparar contra lo guardado. */
export function inicioDelDia(fecha) {
  return fecha ? `${fecha}T00:00:00.000${DESFASE_ECUADOR}` : null;
}

/** Y el instante en que termina. */
export function finDelDia(fecha) {
  return fecha ? `${fecha}T23:59:59.999${DESFASE_ECUADOR}` : null;
}

/** Hace cuánto, en palabras. Para estados en vivo, donde el número
 *  exacto importa menos que la magnitud. */
export function haceCuanto(v) {
  const d = aFecha(v);
  if (!d) return "—";
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}
