// Lecturas del perfil para la pestaña Fuentes de ingreso.

import { esIngresoMinimoSbu, sbuDelAnio } from "../../supabase/functions/_shared/fuentes-ingreso.ts";

// En Ecuador no se habla de "piso" (pedido del negocio, 2026-09-25): se
// dice lo reportado al IESS y, cuando es el salario básico, "Ingreso
// Mínimo SBU". La regla de qué cuenta como SBU vive en fuentes-ingreso.ts.
export const INGRESO_MINIMO_SBU = "Ingreso Mínimo SBU";
export { esIngresoMinimoSbu, sbuDelAnio };

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

// ---------- Perfil laboral (_shared/perfil-laboral.ts) ----------

const NATURALEZA_EMPLEO = {
  publico: "sector público",
  privado: "sector privado",
  domestico: "empleo doméstico",
  diplomatico: "misión diplomática",
  agricola: "agrícola",
  otro: "tipo de empleador no reconocido",
};

const MONEDA = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Las frases que explican el perfil laboral, en el orden en que se leen:
// de qué trabaja, qué más tiene, y qué significa la combinación.
export function describirPerfilLaboral(p) {
  if (!p) return [];
  if (p.clave === "sin_datos") return ["La fuente de los aportes al IESS no respondió: no se sabe si trabaja para un tercero."];
  const frases = [];
  if (p.dependencia) {
    const empleos = p.empleos
      .slice(0, 3)
      .map((e) => `${e.empleador ?? "empleador sin nombre"} (${NATURALEZA_EMPLEO[e.naturaleza] ?? e.naturaleza}${e.monto ? `, ${MONEDA.format(e.monto)}` : ""})`)
      .join("; ");
    frases.push(`Trabaja para un tercero: ${empleos}${p.empleos.length > 3 ? ` y ${p.empleos.length - 3} más` : ""}.`);
  }
  if (p.actividadPropia) {
    const desde = p.rucActivoDesde ? ` desde ${mesLegible(String(p.rucActivoDesde).slice(0, 7))}` : "";
    const actividad = p.actividades.length ? ` (${p.actividades[0].toLowerCase()})` : "";
    const empleador = p.empleador ? `; es empleador${p.nomina ? `, paga una nómina de ${MONEDA.format(p.nomina)} mensuales` : ""}` : "";
    frases.push(`Tiene actividad propia: RUC activo${desde}${actividad}${empleador}.`);
  }
  if (p.dependencia && p.actividadPropia) {
    frases.push(
      p.actividadPropiaPrincipal
        ? "Paga una nómina mayor que lo que le reportan como dependiente: su actividad propia es, probablemente, la principal."
        : "La actividad propia no trae monto en ninguna fuente pública: complementa al empleo, no se suma a su ingreso.",
    );
  }
  if (p.aporteVoluntarioSinRuc) {
    frases.push("Aporta al IESS por su cuenta sin RUC activo: puede ser sólo para no perder la seguridad social, y no prueba trabajo.");
  }
  if (p.vinculoConEmpleador === "empleador_con_su_apellido") frases.push("Su empleador comparte su apellido: puede ser un negocio familiar.");
  if (p.vinculoConEmpleador === "es_su_propio_empleador") frases.push("El empleador que reporta el aporte es la propia persona.");
  if (p.jubilacion) frases.push("Registra jubilación.");
  if (p.clave === "sin_actividad_registrada") {
    frases.push("El IESS no registra trabajo para un tercero ni el SRI una actividad propia activa.");
  }
  return frases;
}

export const ETIQUETA_ORIGEN = {
  iess: "Aporte al IESS",
  jubilacion: "Jubilación",
  pension: "Pensión alimenticia",
  ruc: "RUC activo",
  nomina: "Nómina que paga",
  otra: "Otra",
};
