import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { analyzeClient, getLatestAnalysis, getLatestProfile, structureClient, getSegmentConfig } from "../lib/api.js";
import { setUltimaCedula } from "../lib/ultimaCedula.js";
import SegmentosPerfil from "../components/SegmentosPerfil.jsx";
import ClienteHeader from "../components/ClienteHeader.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import AnalisisResultado from "../components/AnalisisResultado.jsx";

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

  useEffect(() => {
    setUltimaCedula(cedula);
  }, [cedula]);

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
        <Link to="/" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Buscar otro cliente
        </Link>
      </p>

      <div className="crediscope-tabs">
        <Link className="crediscope-tab" to={`/perfil/${cedula}`}>
          Perfil del Cliente
        </Link>
        <span className="crediscope-tab crediscope-tab-active">Análisis con IA</span>
      </div>

      <ClienteHeader
        nombreCompleto={profile?.standard_profile?.identidad?.nombreCompleto}
        cedula={cedula}
        score={result?.crediscope_score}
        acciones={
          <>
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
          </>
        }
        infoTooltip={
          !loading ? (
            <InfoTooltip
              texto={
                profile
                  ? profileReciente
                    ? `Perfil del Cliente consultado hace ${Math.floor(diasDesde(profile.created_at))} día(s) — se reutiliza sin volver a consultar la fuente de datos.`
                    : `Perfil del Cliente tiene más de ${VENTANA_REUTILIZACION_DIAS} días — hace falta reconsultar la fuente de datos antes de analizar.`
                  : "Sin Perfil del Cliente todavía — hace falta consultar la fuente de datos antes de analizar."
              }
            />
          ) : null
        }
      />

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)" }}>{error}</p>
        </div>
      ) : null}

      {loading ? <p className="crediscope-muted">Cargando...</p> : null}

      <AnalisisResultado result={result} />

      <SegmentosPerfil
        standardProfile={profile?.standard_profile}
        segmentConfig={segmentConfig}
        controlBloqueo={profile?.control_bloqueo}
        collapsible
      />
    </div>
  );
}
