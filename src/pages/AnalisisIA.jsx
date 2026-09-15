import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Sparkles, RefreshCw } from "lucide-react";
import { analyzeClient, getLatestAnalysis, getLatestProfile, structureClient, getSegmentConfig } from "../lib/api.js";
import { setUltimaCedula } from "../lib/ultimaCedula.js";
import { nombreCorto } from "../lib/perfilClienteCampos.js";
import SegmentosPerfil from "../components/SegmentosPerfil.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import AnalisisResultado from "../components/AnalisisResultado.jsx";
import RecomendacionBadge from "../components/RecomendacionBadge.jsx";
import ScoreGauge from "../components/ScoreGauge.jsx";
import IndicadoresAnalisis from "../components/IndicadoresAnalisis.jsx";
import ListaControlPanel from "../components/ListaControlPanel.jsx";

// "Análisis con IA" — nombre comercial del scoring por LLM. Antes de
// correrlo, decide si reutiliza el Perfil del Cliente ya consultado
// (si tiene ≤7 días) o si hace falta reconsultar la fuente primero —
// decisión de la UI, ver profileId en analyze-client/index.ts.
//
// Dos columnas: a la izquierda el cliente (quién es, su score, qué se
// puede hacer y sus listas de control); a la derecha el dictamen
// (resumen, recomendación y la evidencia desplegable). La separación es
// deliberada: la izquierda cambia solo al reanalizar, la derecha es lo
// que el analista lee.

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
  const nombre = nombreCorto(profile?.standard_profile?.identidad?.nombreCompleto);

  const avisoReutilizacion = profile
    ? profileReciente
      ? `Perfil del Cliente consultado hace ${Math.floor(diasDesde(profile.created_at))} día(s) — se reutiliza sin volver a consultar la fuente de datos.`
      : `Perfil del Cliente tiene más de ${VENTANA_REUTILIZACION_DIAS} días — hace falta reconsultar la fuente de datos antes de analizar.`
    : "Sin Perfil del Cliente todavía — hace falta consultar la fuente de datos antes de analizar.";

  return (
    <div>
      <div className="crediscope-pagina-cabecera">
        <Link to="/" className="crediscope-volver" title="Buscar otro cliente">
          <ArrowLeft size={19} />
        </Link>
        <h2>Análisis con IA</h2>
        <Link className="crediscope-tab" to={`/perfil/${cedula}`}>
          Ver Perfil del Cliente
        </Link>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="crediscope-analisis-grid">
        <div>
          <div className="crediscope-card crediscope-cliente-card">
            <div className="crediscope-cliente-cabecera">
              <div>
                {nombre ? <p className="crediscope-cliente-nombre">{nombre}</p> : null}
                <p className="crediscope-cliente-cedula">{cedula}</p>
              </div>
              {result?.recomendacion && !result?.fallo ? (
                <RecomendacionBadge recomendacion={result.recomendacion} size="small" />
              ) : null}
            </div>

            {/* Si el análisis falló, el marcador queda sin valor: el
                500 guardado es el valor neutro por defecto, no un
                puntaje, y dibujarlo lo hacía pasar por resultado. */}
            <ScoreGauge score={result?.fallo ? null : result?.crediscope_score} />

            <div className="crediscope-cliente-acciones">
              {!loading && profileReciente ? (
                <button className="crediscope-btn" onClick={handleAnalyzeReuse} disabled={analyzing}>
                  <Sparkles size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
                  {analyzing ? "Analizando..." : "Analizar"}
                </button>
              ) : null}
              {!loading ? (
                <button className="crediscope-btn crediscope-btn-ghost" onClick={handleReconsultAndAnalyze} disabled={analyzing}>
                  <RefreshCw size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
                  {analyzing ? "Analizando..." : profileReciente ? "Reconsultar y analizar" : "Consultar y analizar"}
                </button>
              ) : null}
              {!loading ? (
                <p className="crediscope-cliente-aviso">
                  <InfoTooltip texto={avisoReutilizacion} />
                  <span className="crediscope-muted">
                    {profile ? (profileReciente ? "Usa la última consulta guardada" : "Requiere reconsultar la fuente") : "Sin consulta previa"}
                  </span>
                </p>
              ) : null}
            </div>

            <IndicadoresAnalisis riesgo={result?.indicador_riesgo} historial={result?.indicador_historial} />
          </div>

          <ListaControlPanel controlBloqueo={profile?.control_bloqueo} />
        </div>

        <div>
          {loading ? <p className="crediscope-muted">Cargando...</p> : null}
          {!loading && !result ? (
            <div className="crediscope-card">
              <p className="crediscope-muted" style={{ margin: 0 }}>
                Este cliente todavía no tiene un Análisis con IA. Generalo con los botones de la izquierda.
              </p>
            </div>
          ) : null}
          <AnalisisResultado result={result} ocultarListaControl perfil={profile} cedula={cedula} />
        </div>
      </div>

      <SegmentosPerfil
        standardProfile={profile?.standard_profile}
        segmentConfig={segmentConfig}
        controlBloqueo={profile?.control_bloqueo}
        collapsible
        mostrarAviso={false}
      />
    </div>
  );
}
