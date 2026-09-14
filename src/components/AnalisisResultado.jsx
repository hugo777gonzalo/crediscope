import { Sparkles, CircleCheck, TriangleAlert, FileText, ShieldAlert } from "lucide-react";
import RecomendacionCard from "./RecomendacionCard.jsx";
import SeccionDesplegable from "./SeccionDesplegable.jsx";

// Resultado de "Análisis con IA": resumen, recomendación y el detalle
// en secciones que se despliegan (positivos, negativos, observaciones).
// Se usa igual en la pantalla de análisis y en el visor de solo lectura
// del Historial -- por eso no incluye botones ni la tarjeta del cliente.
//
// "Observaciones" es lo que el modelo devuelve como información
// faltante: lo que NO se pudo confirmar y por qué importa para decidir
// (un campo vacío, una contradicción entre fuentes). No son señales
// negativas -- esas ya están en su propia sección.

function ListaItems({ items, Icono, color }) {
  return (
    <ul className="crediscope-items">
      {items.map((item, i) => (
        <li key={i} className="crediscope-item">
          <span className="crediscope-item-icono" style={{ color }}>
            <Icono size={15} />
          </span>
          <span className="crediscope-item-detalle">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// `ocultarListaControl`: en "Análisis con IA" los hallazgos de listas de
// control se muestran junto al cliente, con su origen y si son
// bloqueantes (ListaControlPanel). Acá solo se muestran cuando no hay
// esa versión más completa -- el Historial, donde lo único guardado con
// el análisis son los mensajes.
export default function AnalisisResultado({ result, ocultarListaControl = false }) {
  if (!result) return null;

  const positivos = result.positives || [];
  const negativos = result.negatives || [];
  const observaciones = result.missing_info || [];
  const hallazgos = ocultarListaControl ? [] : result.inconsistencies || [];

  return (
    <div className="crediscope-resultado">
      {result.narrative_summary ? (
        <div className="crediscope-card">
          <div className="crediscope-resumen-cabecera">
            <h3 style={{ margin: 0 }}>Resumen</h3>
            <span className="crediscope-chip-ia" title="Redactado por el análisis con inteligencia artificial">
              <Sparkles size={13} />
              IA
            </span>
          </div>
          <p style={{ marginBottom: 0 }}>{result.narrative_summary}</p>
        </div>
      ) : null}

      <RecomendacionCard recomendacion={result.recomendacion} />

      <div className="crediscope-secciones">
        <SeccionDesplegable Icono={CircleCheck} titulo="Puntos positivos" cantidad={positivos.length} color="var(--good)">
          <ListaItems items={positivos} Icono={CircleCheck} color="var(--good)" />
        </SeccionDesplegable>

        <SeccionDesplegable Icono={TriangleAlert} titulo="Puntos negativos" cantidad={negativos.length} color="var(--warn)">
          <ListaItems items={negativos} Icono={TriangleAlert} color="var(--warn)" />
        </SeccionDesplegable>

        <SeccionDesplegable
          Icono={FileText}
          titulo="Observaciones"
          cantidad={observaciones.length}
          color="var(--brand)"
          vacio="No quedó información pendiente de confirmar."
        >
          <ListaItems items={observaciones} Icono={FileText} color="var(--brand)" />
        </SeccionDesplegable>

        {hallazgos.length > 0 ? (
          <SeccionDesplegable Icono={ShieldAlert} titulo="Lista de control" cantidad={hallazgos.length} color="var(--bad)">
            <ListaItems items={hallazgos} Icono={ShieldAlert} color="var(--bad)" />
          </SeccionDesplegable>
        ) : null}
      </div>
    </div>
  );
}
