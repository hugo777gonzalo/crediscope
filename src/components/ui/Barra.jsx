import { Link } from "react-router-dom";
import { entero } from "../../lib/formatos.js";

// Barra horizontal con etiqueta y valor. Tres copias vivían en Costos,
// Fuentes de Ingreso y Reportes con la misma estructura.
//
//   <Barra etiqueta="Independiente" pct={37} n={1031} />   → "37% (1.031)"
//   <Barra etiqueta="Calibración" pct={80} texto="$12,14 · 2.646" />
//
// Un grupo que no está vacío nunca dice "0%": 12 de 2.812 es "<1%" y la barra
// conserva un mínimo visible (el Panorama decía "0% (12)").
// `enlace` lleva al listado filtrado: quien ve "135 independientes" quiere
// saber quiénes son.

export default function Barra({ etiqueta, pct = 0, n = null, texto = null, color = "var(--brand)", ayuda = undefined, enlace = null }) {
  const ancho = Math.max(0, Math.min(100, Number(pct) || 0));
  const hayAlgo = n !== null ? Number(n) > 0 : ancho > 0;
  const rotuloPct = hayAlgo && ancho < 1 ? "<1%" : `${Math.round(ancho)}%`;
  return (
    <div className="crediscope-barrapct-row" title={ayuda}>
      <span className="crediscope-barrapct-label">{enlace ? <Link to={enlace}>{etiqueta}</Link> : etiqueta}</span>
      <div className="crediscope-barrapct-track" aria-hidden="true">
        <div className="crediscope-barrapct-fill" style={{ width: hayAlgo ? `max(${ancho}%, 3px)` : "0%", background: color }} />
      </div>
      <span className="crediscope-barrapct-valor">
        {texto ?? (
          <>
            {rotuloPct}
            {n !== null ? <span className="crediscope-muted"> ({entero(n)})</span> : null}
          </>
        )}
      </span>
    </div>
  );
}
