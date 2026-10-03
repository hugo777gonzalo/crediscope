// Acción sugerida al analista, junto al score (ver marco-v14). El score
// dice cuánto riesgo hay; esto dice qué hacer con el caso -- y no
// siempre se deducen uno del otro.
//
// "observar" ya no se produce desde marco-v27: el negocio decidió que
// toda la zona gris es "revisar", y si falta información lo dice la
// sección Observaciones del análisis. Queda acá porque hay análisis
// guardados con ella (uno al retirarla) y tienen que seguir viéndose.
const ETIQUETAS = {
  aprobar: { texto: "Aprobar", color: "var(--good)", detalle: "Sin señales negativas relevantes; capacidad y comportamiento evidenciados." },
  revisar: { texto: "Revisar", color: "var(--warn)", detalle: "Caso limítrofe o con información faltante: amerita criterio del analista." },
  observar: { texto: "Observar", color: "var(--brand)", detalle: "Falta información clave para decidir — ver qué recabar en \"Observaciones\"." },
  negar: { texto: "Negar", color: "var(--bad)", detalle: "Señales graves y confirmadas de riesgo de incumplimiento." },
};

export default function RecomendacionBadge({ recomendacion, size = "normal" }) {
  const config = ETIQUETAS[recomendacion];
  if (!config) return null;
  return (
    <span
      className={`crediscope-recomendacion ${size === "small" ? "crediscope-recomendacion-small" : ""}`}
      style={{ color: config.color, borderColor: config.color }}
      title={config.detalle}
    >
      {config.texto}
    </span>
  );
}

export { ETIQUETAS as ETIQUETAS_RECOMENDACION };
