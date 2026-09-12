import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { analyzeClient, getLatestAnalysis } from "../lib/api.js";
import InsigniaScore from "../components/InsigniaScore.jsx";

export default function ClientReport() {
  const { cedula } = useParams();

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const latest = await getLatestAnalysis(cedula);
      setResult(latest);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cedula]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const fresh = await analyzeClient(cedula);
      setResult(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div>
      <p>
        <Link to={`/perfil/${cedula}`}>&larr; Ver Perfil del Cliente</Link>
      </p>

      {/* ---------- Score por LLM (aproximado) ---------- */}
      <div className="crediscope-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Análisis con IA — Cliente {cedula}</h2>
          {result ? (
            <p className="crediscope-muted">
              Último análisis: {new Date(result.created_at).toLocaleString()}
            </p>
          ) : (
            <p className="crediscope-muted">Sin análisis previo.</p>
          )}
        </div>
        <button className="crediscope-btn" onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? "Analizando..." : "Analizar ahora"}
        </button>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)" }}>{error}</p>
        </div>
      ) : null}

      {loading ? <p className="crediscope-muted">Cargando...</p> : null}

      {result ? (
        <>
          <div className="crediscope-card">
            <InsigniaScore score={result.crediscope_score} rulesVersion={result.rules_version} />
          </div>

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
      ) : null}
    </div>
  );
}
