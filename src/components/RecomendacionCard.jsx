import { CheckCircle2, AlertTriangle, Eye, XCircle } from "lucide-react";
import { ETIQUETAS_RECOMENDACION } from "./RecomendacionBadge.jsx";

// La recomendación en grande, como sección propia: es lo que el
// analista busca primero. El score dice cuánto riesgo hay; esto dice
// qué hacer con el caso, y son cosas distintas (un score medio con
// información incompleta no es lo mismo que uno bien sustentado).
//
// El sustantivo ("Aprobación") y no el verbo ("Aprobar") a propósito:
// es el dictamen del análisis, no una orden al analista. La decisión
// sigue siendo suya.

const PRESENTACION = {
  aprobar: { titulo: "Aprobación", Icono: CheckCircle2, fondo: "#f0fdf4" },
  revisar: { titulo: "Revisión", Icono: AlertTriangle, fondo: "#fffbeb" },
  observar: { titulo: "Observación", Icono: Eye, fondo: "#f5f4fb" },
  negar: { titulo: "Negación", Icono: XCircle, fondo: "#fef2f2" },
};

export default function RecomendacionCard({ recomendacion }) {
  const base = ETIQUETAS_RECOMENDACION[recomendacion];
  const extra = PRESENTACION[recomendacion];
  if (!base || !extra) return null;
  const { Icono } = extra;

  return (
    <div className="crediscope-recomendacion-card" style={{ borderColor: base.color, background: extra.fondo }}>
      <span style={{ color: base.color, flexShrink: 0 }}>
        <Icono size={34} strokeWidth={2.2} />
      </span>
      <div>
        <p className="crediscope-recomendacion-card-label">Recomendación</p>
        <p className="crediscope-recomendacion-card-titulo" style={{ color: base.color }}>
          {extra.titulo}
        </p>
        <p className="crediscope-recomendacion-card-detalle">{base.detalle}</p>
      </div>
    </div>
  );
}
