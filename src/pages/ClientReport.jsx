import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { analyzeClient, getLatestAnalysis, structureClient, getLatestProfile } from "../lib/api.js";
import InsigniaScore from "../components/InsigniaScore.jsx";
import BlockStatus from "../components/BlockStatus.jsx";
import ClassifiedProfile from "../components/ClassifiedProfile.jsx";

export default function ClientReport() {
  const { cedula } = useParams();

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [structuring, setStructuring] = useState(false);
  const [profileError, setProfileError] = useState(null);

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

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const latest = await getLatestProfile(cedula);
      setProfile(latest);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileLoading(false);
    }
  }, [cedula]);

  useEffect(() => {
    load();
    loadProfile();
  }, [load, loadProfile]);

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

  async function handleStructure() {
    setStructuring(true);
    setProfileError(null);
    try {
      const fresh = await structureClient(cedula);
      setProfile(fresh);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setStructuring(false);
    }
  }

  return (
    <div>
      <p>
        <Link to="/">&larr; Buscar otro cliente</Link>
      </p>

      {/* ---------- Estructura Estandarizada (sin LLM) ---------- */}
      <div className="crediscope-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Cliente {cedula} — Estructura Estandarizada</h2>
          <p className="crediscope-muted">
            {profile
              ? `Última consulta: ${new Date(profile.created_at).toLocaleString()} (sin LLM)`
              : "Sin consulta previa."}
          </p>
        </div>
        <button className="crediscope-btn" onClick={handleStructure} disabled={structuring}>
          {structuring ? "Consultando..." : "Consultar y clasificar (sin LLM)"}
        </button>
      </div>

      {profileError ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)" }}>{profileError}</p>
        </div>
      ) : null}

      {profileLoading ? <p className="crediscope-muted">Cargando...</p> : null}

      {profile ? (
        <>
          <div className="crediscope-card">
            <h3>Estado por bloque</h3>
            <BlockStatus blockStatus={profile.block_status} />
            <p className="crediscope-muted" style={{ marginTop: 8 }}>
              Estructura {profile.structure_version} · Clasificación {profile.classification_version}
            </p>
          </div>
          <ClassifiedProfile classification={profile.classification} />
        </>
      ) : null}

      {/* ---------- Score por LLM (aproximado) ---------- */}
      <div className="crediscope-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        <div>
          <h2 style={{ margin: 0 }}>Score por LLM</h2>
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
            <h3>Estado por bloque</h3>
            <BlockStatus blockStatus={result.block_status} />
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
