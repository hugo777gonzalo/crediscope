// Acción sugerida al analista, junto al score (ver marco-v14). El score
// dice cuánto riesgo hay; esto dice qué hacer con el caso -- y no
// siempre se deducen uno del otro: un score medio con información
// incompleta ("observar") es operativamente distinto de un score medio
// bien sustentado ("revisar").
const ETIQUETAS = {
  aprobar: { texto: "Aprobar", color: "var(--good)", detalle: "Sin señales negativas relevantes; capacidad y comportamiento evidenciados." },
  revisar: { texto: "Revisar", color: "var(--warn)", detalle: "Caso limítrofe: hay señales negativas no concluyentes que ameritan criterio del analista." },
  observar: { texto: "Observar", color: "var(--brand)", detalle: "Falta información clave para decidir — ver qué recabar en \"Información faltante\"." },
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
