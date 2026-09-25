// Lecturas del perfil para la pestaña Fuentes de ingreso.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-07" -> "jul 2026". Es un mes de corte del IESS, no un instante:
// se reformatea el texto, sin pasar por Date (ver fechas.js).
export function mesLegible(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes ?? ""));
  return m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : "—";
}

// "yyyy-mm-dd" -> "dd/mm/yyyy", igual de literal.
export function fechaLegible(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

// 50 -> "4 años 2 meses". Una antigüedad en meses sueltos ("50 meses") se
// lee peor que dicha en años.
export function duracionLegible(meses) {
  if (meses === null || meses === undefined || !Number.isFinite(meses)) return "—";
  const anios = Math.floor(meses / 12);
  const resto = Math.round(meses % 12);
  const a = anios ? `${anios} ${anios === 1 ? "año" : "años"}` : "";
  const m = resto ? `${resto} ${resto === 1 ? "mes" : "meses"}` : "";
  return [a, m].filter(Boolean).join(" ") || "menos de un mes";
}

// Los meses del corte hacia atrás, del más viejo al más nuevo: el eje del
// historial tiene que mostrar los huecos, así que se arma completo y no
// sólo con los meses que trajeron aporte.
export function mesesHasta(corte, cantidad) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(corte ?? ""));
  if (!m) return [];
  const total = Number(m[1]) * 12 + Number(m[2]) - 1;
  return Array.from({ length: cantidad }, (_, i) => {
    const t = total - (cantidad - 1 - i);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}

// Dos formas del mismo dato conviven (ver CLAUDE.md): antes de marco-v20
// `laboral.empleoActual` era un objeto; después, `empleosActuales` es un
// arreglo. Leer una sola cuenta de menos sin avisar.
export function empleosActuales(laboral) {
  if (!laboral) return [];
  if (Array.isArray(laboral.empleosActuales)) return laboral.empleosActuales;
  if (laboral.empleoActual && typeof laboral.empleoActual === "object") return [laboral.empleoActual];
  return [];
}

// De dónde sale cada fuente. El perfil no lo guarda como campo (hasta v4
// no hacía falta), pero se deduce sin ambigüedad: las del IESS son las
// únicas con evidencia distinta de "indirecta", y las indirectas tienen
// cada una su tipo fijo en fuentes-ingreso.ts.
export function origenDeFuente(fuente) {
  if (fuente.evidencia !== "indirecta") return "iess";
  if (fuente.tipo === "jubilación") return "jubilacion";
  if (fuente.tipo === "pensión alimenticia percibida") return "pension";
  if (fuente.tipo === "actividad económica propia") return "ruc";
  if (fuente.tipo === "actividad empresarial propia") return "nomina";
  return "otra";
}

export const ETIQUETA_ORIGEN = {
  iess: "Aporte al IESS",
  jubilacion: "Jubilación",
  pension: "Pensión alimenticia",
  ruc: "RUC activo",
  nomina: "Nómina que paga",
  otra: "Otra",
};
