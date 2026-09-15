import { CheckCircle2, AlertTriangle, Eye, XCircle, ArrowRight } from "lucide-react";
import { ETIQUETAS_RECOMENDACION } from "./RecomendacionBadge.jsx";

// La recomendación en grande, como sección propia: es lo que el
// analista busca primero. El score dice cuánto riesgo hay; esto dice
// qué hacer con el caso, y son cosas distintas (un score medio con
// información incompleta no es lo mismo que uno bien sustentado).
//
// El sustantivo ("Aprobación") y no el verbo ("Aprobar") a propósito:
// es el dictamen del análisis, no una orden al analista. La decisión
// sigue siendo suya.
//
// Debajo van las acciones concretas del caso (marco-v16). Antes acá
// había una frase fija por etiqueta, la misma para todos los clientes:
// tenía forma de análisis sin serlo. Los análisis anteriores a v16 no
// tienen acciones y se dice, en vez de rellenar el espacio.

const PRESENTACION = {
  aprobar: { titulo: "Aprobación", Icono: CheckCircle2, fondo: "#f0fdf4" },
  revisar: { titulo: "Revisión", Icono: AlertTriangle, fondo: "#fffbeb" },
  observar: { titulo: "Observación", Icono: Eye, fondo: "#f5f4fb" },
  negar: { titulo: "Negación", Icono: XCircle, fondo: "#fef2f2" },
};

// `origen` se usa cuando el dictamen no lo puso el modelo. Decirlo no
// es un detalle técnico: un "Negación" que salió de una regla de
// control se sostiene sin el modelo, y quien lo lee tiene derecho a
// saber que nadie leyó el caso completo.
export default function RecomendacionCard({ recomendacion, acciones = [], origen = null }) {
  const base = ETIQUETAS_RECOMENDACION[recomendacion];
  const extra = PRESENTACION[recomendacion];
  if (!base && !acciones.length) return null;
  if (!base || !extra) return null;
  const { Icono } = extra;

  return (
    <div className="crediscope-recomendacion-card" style={{ borderColor: base.color, background: extra.fondo }}>
      <div className="crediscope-recomendacion-card-cabecera">
        <span style={{ color: base.color, flexShrink: 0 }}>
          <Icono size={34} strokeWidth={2.2} />
        </span>
        <div>
          <p className="crediscope-recomendacion-card-label">Recomendación</p>
          <p className="crediscope-recomendacion-card-titulo" style={{ color: base.color }}>
            {extra.titulo}
          </p>
          {origen ? (
            <p className="crediscope-muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>{origen}</p>
          ) : null}
        </div>
      </div>

      {acciones.length > 0 ? (
        <ul className="crediscope-acciones">
          {acciones.map((accion, i) => (
            <li key={i}>
              <span style={{ color: base.color }}>
                <ArrowRight size={15} />
              </span>
              <span>{accion}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="crediscope-recomendacion-card-detalle">
          Este análisis es anterior a la versión que sugiere los pasos a seguir. Volvé a analizarlo para obtenerlos.
        </p>
      )}
    </div>
  );
}
