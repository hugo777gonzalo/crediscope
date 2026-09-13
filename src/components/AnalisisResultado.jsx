// Tarjetas de resultado de "Análisis con IA" (resumen, positivos,
// negativos, información faltante, inconsistencias) — extraído de
// AnalisisIA.jsx para reutilizarlo en el visor de solo lectura de
// Historial (mismo resultado, sin botones de reconsultar/analizar).
export default function AnalisisResultado({ result }) {
  if (!result) return null;
  return (
    <>
      <div className="crediscope-card">
        <h3>Resumen</h3>
        <p>{result.narrative_summary}</p>
      </div>

      <div className="crediscope-card">
        <h3>Puntos positivos</h3>
        <ul className="crediscope-list">
          {(result.positives || []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="crediscope-card">
        <h3>Puntos negativos</h3>
        <ul className="crediscope-list">
          {(result.negatives || []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="crediscope-card">
        <h3>Información faltante</h3>
        <ul className="crediscope-list">
          {(result.missing_info || []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>

      {result.inconsistencies && result.inconsistencies.length > 0 ? (
        <div className="crediscope-card">
          <h3>Inconsistencias detectadas</h3>
          <ul className="crediscope-list">
            {result.inconsistencies.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
