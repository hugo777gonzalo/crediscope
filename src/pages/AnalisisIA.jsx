import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { analyzeClient, getLatestAnalysis, getLatestProfile, structureClient, getSegmentConfig } from "../lib/api.js";
import InsigniaScore from "../components/InsigniaScore.jsx";
import SegmentosPerfil from "../components/SegmentosPerfil.jsx";

// "Análisis con IA" — nombre comercial del scoring por LLM. Antes de
// correrlo, decide si reutiliza el Perfil del Cliente ya consultado
// (si tiene ≤7 días) o si hace falta reconsultar Novadata primero —
// decisión de la UI, ver profileId en analyze-client/index.ts. Al
// final muestra el Perfil del Cliente colapsado (SegmentosPerfil.jsx)
// para no repetir la ingesta si el analista quiere revisar el detalle.

const VENTANA_REUTILIZACION_DIAS = 7;

function diasDesde(fechaIso) {
  return (Date.now() - new Date(fechaIso).getTime()) / (1000 * 60 * 60 * 24);
}

export default function AnalisisIA() {
  const { cedula } = useParams();

  const [result, setResult] = useState(null);
  const [profile, setProfile] = useState(null);
  const [segmentConfig, setSegmentConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [latestAnalysis, latestProfile, segments] = await Promise.all([
        getLatestAnalysis(cedula),
        getLatestProfile(cedula),
        getSegmentConfig(),
      ]);
      setResult(latestAnalysis);
      setProfile(latestProfile);
      setSegmentConfig(segments);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cedula]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAnalyzeReuse() {
    setAnalyzing(true);
    setError(null);
    try {
      const fresh = await analyzeClient(cedula, { profileId: profile.id });
      setResult(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleReconsultAndAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const freshProfile = await structureClient(cedula);
      setProfile(freshProfile);
      const fresh = await analyzeClient(cedula, { profileId: freshProfile.id });
      setResult(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  const profileReciente = profile && diasDesde(profile.created_at) <= VENTANA_REUTILIZACION_DIAS;

  return (
    <div>
      <p>
        <Link to={`/perfil/${cedula}`}>&larr; Ver Perfil del Cliente</Link>
      </p>

      <div className="crediscope-tabs">
        <Link className="crediscope-tab" to={`/perfil/${cedula}`}>
          Perfil del Cliente
        </Link>
        <span className="crediscope-tab crediscope-tab-active">Análisis con IA</span>
      </div>

      <div className="crediscope-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Análisis con IA — Cliente {cedula}</h2>
          {result ? (
            <p className="crediscope-muted">Último análisis: {new Date(result.created_at).toLocaleString()}</p>
          ) : (
            <p className="crediscope-muted">Sin análisis previo.</p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!loading && profileReciente ? (
            <button className="crediscope-btn" onClick={handleAnalyzeReuse} disabled={analyzing}>
              {analyzing ? "Analizando..." : "Analizar"}
            </button>
          ) : null}
          {!loading ? (
            <button className="crediscope-btn crediscope-btn-ghost" onClick={handleReconsultAndAnalyze} disabled={analyzing}>
              {analyzing ? "Analizando..." : profileReciente ? "Reconsultar y analizar" : "Consultar y analizar"}
            </button>
          ) : null}
        </div>
      </div>

      {!loading && profile ? (
        <p className="crediscope-muted" style={{ marginTop: -8 }}>
          {profileReciente
            ? `Perfil del Cliente consultado hace ${Math.floor(diasDesde(profile.created_at))} día(s) — se reutiliza sin volver a consultar Novadata.`
            : `Perfil del Cliente tiene más de ${VENTANA_REUTILIZACION_DIAS} días — hace falta reconsultar Novadata antes de analizar.`}
        </p>
      ) : null}
      {!loading && !profile ? (
        <p className="crediscope-muted" style={{ marginTop: -8 }}>
          Sin Perfil del Cliente todavía — hace falta consultar Novadata antes de analizar.
        </p>
      ) : null}

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

      <SegmentosPerfil
        standardProfile={profile?.standard_profile}
        segmentConfig={segmentConfig}
        controlBloqueo={profile?.control_bloqueo}
        collapsible
      />
    </div>
  );
}
