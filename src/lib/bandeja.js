// Cómo se ve cada cosa en la bandeja y en el expediente.
//
// Vive acá y no adentro de las pantallas porque las dos muestran los
// mismos estados: si el color de "negar" se define dos veces, un día
// van a dejar de coincidir y la misma persona se va a ver de un color
// en la lista y de otro al abrirla.

import { ETIQUETAS_RECOMENDACION } from "../components/RecomendacionBadge.jsx";

export const MAX_SCORE = 999;

// Los mismos cortes que ScoreGauge. No se importan de allá: es una
// función de tres líneas y exportarla desde un componente para usarla
// en una tabla haría que la tabla dependa del gráfico.
export function colorScore(score) {
  if (score === null || score === undefined) return "var(--text-muted)";
  if (score >= 700) return "var(--good)";
  if (score >= 400) return "var(--warn)";
  return "var(--bad)";
}

export function colorRecomendacion(recomendacion) {
  return ETIQUETAS_RECOMENDACION[recomendacion]?.color ?? "var(--border)";
}

export function textoRecomendacion(recomendacion) {
  return ETIQUETAS_RECOMENDACION[recomendacion]?.texto ?? null;
}

// El estado de la fila cuando no hay recomendación. No son sinónimos:
// "sin analizar" es trabajo pendiente, "no se completó" es una falla
// nuestra o del proveedor, y confundirlos hace que una falla se vea
// como una tarea.
export const ETIQUETA_ESTADO_BANDEJA = {
  analizado: "Analizado",
  sin_analisis: "Sin analizar",
  no_completado: "No se completó",
  sin_consulta: "Sin consultar",
};

export const COLOR_ESTADO_BANDEJA = {
  analizado: "var(--brand)",
  sin_analisis: "var(--text-muted)",
  no_completado: "var(--bad)",
  sin_consulta: "var(--text-muted)",
};

// El color de la franja al borde de la fila. La recomendación manda
// cuando existe; si no, el estado.
export function colorFranja(fila) {
  if (fila.recomendacion) return colorRecomendacion(fila.recomendacion);
  if (fila.estado === "no_completado") return "var(--bad)";
  return "transparent";
}

export const ETIQUETA_ORIGEN = {
  consulta: "Consulta individual",
  lote: "Corrida por lote",
};

// Cuánto de la barra se pinta. Se acota al rango real para que un dato
// corrupto no dibuje una barra que se sale de su riel.
export function proporcionScore(score) {
  if (!score) return 0;
  return Math.max(0, Math.min(1, score / MAX_SCORE));
}
