import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Sparkles, RefreshCw } from "lucide-react";
import { analyzeClient, getLatestAnalysis, getLatestProfile, revisionManualDeLaPersona, structureClient, getSegmentConfig } from "../lib/api.js";
import { setUltimaCedula } from "../lib/ultimaCedula.js";
import { nombreCorto } from "../lib/perfilClienteCampos.js";
import SegmentosPerfil from "../components/SegmentosPerfil.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import AnalisisResultado from "../components/AnalisisResultado.jsx";
import RecomendacionBadge from "../components/RecomendacionBadge.jsx";
import ScoreGauge from "../components/ScoreGauge.jsx";
import IndicadoresAnalisis from "../components/IndicadoresAnalisis.jsx";
import ListaControlPanel from "../components/ListaControlPanel.jsx";
import Aviso from "../components/ui/Aviso.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import { plural } from "../lib/formatos.js";
import { useBuro, NOMBRE_DEL_BURO } from "../lib/useBuro.js";
import {
  completitudDeLaConsulta,
  decisionDeLaConsulta,
  porQueEsParcial,
  porQueNoSePuedeAnalizar,
  recomendacionDeLaEntrega,
} from "../../supabase/functions/_shared/calidad-de-la-consulta.ts";

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

const quedaFrenada = (perfil) => decisionDeLaConsulta(perfil.estado_por_fuente, perfil.control_bloqueo) === "frenar";

export default function AnalisisIA() {
  const { cedula } = useParams();
  const { buro } = useBuro();

  const [result, setResult] = useState(null);
  const [profile, setProfile] = useState(null);
  const [segmentConfig, setSegmentConfig] = useState(null);
  const [revisionManual, setRevisionManual] = useState(false);
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
      setRevisionManual(latestProfile && quedaFrenada(latestProfile) ? await revisionManualDeLaPersona(latestProfile.client_id) : false);
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
      // La función también lo frena: acá se evita pedirle algo que va a rechazar.
      if (quedaFrenada(freshProfile)) {
        const manual = await revisionManualDeLaPersona(freshProfile.client_id);
        setRevisionManual(manual);
        setError(porQueNoSePuedeAnalizar(freshProfile.estado_por_fuente, manual));
        return;
      }
      setRevisionManual(false);
      const fresh = await analyzeClient(cedula, { profileId: freshProfile.id });
      setResult(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  const profileReciente = profile && diasDesde(profile.created_at) <= VENTANA_REUTILIZACION_DIAS;
  const decision = profile ? decisionDeLaConsulta(profile.estado_por_fuente, profile.control_bloqueo) : null;
  const consultaIncompleta = decision === "frenar";
  const sePuedeReutilizar = profileReciente && !consultaIncompleta;
  const nombre = nombreCorto(profile?.standard_profile?.identidad?.nombreCompleto);

  const avisoReutilizacion = !profile
    ? "Sin Perfil de la Persona todavía — hace falta consultar la fuente de datos antes de analizar."
    : consultaIncompleta
      ? porQueNoSePuedeAnalizar(profile.estado_por_fuente, revisionManual)
      : decision === "negar_por_control"
        ? "La consulta quedó incompleta, pero un control de bloqueo ya niega a la persona: se registra sin llamar al modelo."
        : profileReciente
          ? `Perfil de la Persona consultado ${Math.floor(diasDesde(profile.created_at)) === 0 ? "hoy" : `hace ${plural(Math.floor(diasDesde(profile.created_at)), "día")}`} — se reutiliza sin volver a consultar la fuente de datos.`
          : `Perfil de la Persona tiene más de ${VENTANA_REUTILIZACION_DIAS} días — hace falta reconsultar la fuente de datos antes de analizar.`;

  const etiquetaDeLaConsulta = !profile
    ? "Sin consulta previa"
    : consultaIncompleta
      ? revisionManual ? "Revisión manual: reconsultar no lo resolvió" : "La última consulta quedó incompleta"
      : decision === "negar_por_control"
        ? "Consulta incompleta con un bloqueo"
        : profileReciente ? "Usa la última consulta guardada" : "Requiere reconsultar la fuente";

  // Lo que se entrega, igual que en la API y en la solicitud. El análisis puede ser
  // de un perfil anterior al último, y uno recién hecho viene sin el suyo.
  const estadoDelAnalisis = result?.client_profiles?.estado_por_fuente ?? (result?.client_profile_id === profile?.id ? profile?.estado_por_fuente : null);
  const consultaParcial = result?.veredicto_origen === "modelo" && completitudDeLaConsulta(estadoDelAnalisis) === "parcial";
  const entregado = consultaParcial ? { ...result, recomendacion: recomendacionDeLaEntrega(result.recomendacion, "parcial") } : result;

  return (
    <div>
      <div className="crediscope-pagina-cabecera">
        <Link to="/" className="crediscope-volver" title="Buscar otra persona">
          <ArrowLeft size={19} />
        </Link>
        <h2>Análisis con IA</h2>
        <Link className="crediscope-tab" to={`/perfil/${cedula}`}>
          Ver Perfil de la Persona
        </Link>
        <Link className="crediscope-tab" to={`/ingresos/${cedula}`}>
          Ver Fuentes de Ingreso
        </Link>
        {/* El buró de la institución (129): decía «Ver Aval» fijo y en una base con
            Equifax llevaba a la pestaña que no corresponde. */}
        {buro ? (
          <Link className="crediscope-tab" to={`/${buro}/${cedula}`}>
            Ver {NOMBRE_DEL_BURO[buro]}
          </Link>
        ) : null}
      </div>

      {error ? (
        <AvisoDeError error={error} />
      ) : null}

      <div className="crediscope-analisis-grid">
        <div>
          <div className="crediscope-card crediscope-cliente-card">
            <div className="crediscope-cliente-cabecera">
              <div>
                {nombre ? <p className="crediscope-cliente-nombre">{nombre}</p> : null}
                <p className="crediscope-cliente-cedula">{cedula}</p>
              </div>
              {entregado?.recomendacion && !entregado?.fallo ? (
                <RecomendacionBadge recomendacion={entregado.recomendacion} size="small" />
              ) : null}
            </div>

            {/* Si el análisis falló, el marcador queda sin valor: el
                500 guardado es el valor neutro por defecto, no un
                puntaje, y dibujarlo lo hacía pasar por resultado. */}
            <ScoreGauge score={result?.fallo ? null : result?.crediscope_score} />

            <div className="crediscope-cliente-acciones">
              {!loading && sePuedeReutilizar ? (
                <button className="crediscope-btn" onClick={handleAnalyzeReuse} disabled={analyzing}>
                  <Sparkles size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
                  {analyzing ? "Analizando..." : "Analizar"}
                </button>
              ) : null}
              {!loading ? (
                <button className="crediscope-btn crediscope-btn-ghost" onClick={handleReconsultAndAnalyze} disabled={analyzing}>
                  <RefreshCw size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
                  {analyzing ? "Analizando..." : profile ? "Reconsultar y analizar" : "Consultar y analizar"}
                </button>
              ) : null}
              {!loading ? (
                <p className="crediscope-cliente-aviso">
                  <InfoTooltip texto={avisoReutilizacion} />
                  <span className="crediscope-muted">{etiquetaDeLaConsulta}</span>
                </p>
              ) : null}
            </div>

            <IndicadoresAnalisis riesgo={result?.indicador_riesgo} historial={result?.indicador_historial} />
          </div>

          <ListaControlPanel controlBloqueo={profile?.control_bloqueo} />
        </div>

        <div>
          {loading ? <Cargando /> : null}
          {!loading && !result ? (
            <div className="crediscope-card">
              <p className="crediscope-muted" style={{ margin: 0 }}>
                Esta persona todavía no tiene un Análisis con IA. Generalo con los botones de la izquierda.
              </p>
            </div>
          ) : null}
          {consultaParcial ? <Aviso>{porQueEsParcial(estadoDelAnalisis)}</Aviso> : null}
          <AnalisisResultado result={entregado} ocultarListaControl perfil={profile} cedula={cedula} />
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
