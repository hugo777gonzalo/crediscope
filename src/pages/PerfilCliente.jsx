import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getLatestProfile, structureClient, getSegmentConfig } from "../lib/api.js";
import SegmentosPerfil from "../components/SegmentosPerfil.jsx";

// "Perfil del Cliente" — nombre comercial de la Estructura Estandarizada
// (internamente sigue siendo ese término). A propósito NO clasifica en
// positivo/negativo (eso es trabajo del Análisis con IA, ver
// AnalisisIA.jsx) — es puramente informativa, y solo muestra segmentos/
// campos con dato real según standard_profile_segment_config (ver
// 016_segment_display_config.sql). El render de segmentos vive en
// SegmentosPerfil.jsx, compartido con AnalisisIA.jsx.

export default function PerfilCliente() {
  const { cedula } = useParams();

  const [profile, setProfile] = useState(null);
  const [segmentConfig, setSegmentConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [structuring, setStructuring] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [latest, segments] = await Promise.all([getLatestProfile(cedula), getSegmentConfig()]);
      setProfile(latest);
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

  async function handleStructure() {
    setStructuring(true);
    setError(null);
    try {
      const fresh = await structureClient(cedula);
      setProfile(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setStructuring(false);
    }
  }

  const standardProfile = profile?.standard_profile;

  return (
    <div>
      <p>
        <Link to="/">&larr; Buscar otro cliente</Link>
      </p>

      <div className="crediscope-tabs">
        <span className="crediscope-tab crediscope-tab-active">Perfil del Cliente</span>
        <Link className="crediscope-tab" to={`/analisis/${cedula}`}>
          Análisis con IA
        </Link>
      </div>

      <div className="crediscope-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {standardProfile?.identidad?.nombreCompleto ? `${standardProfile.identidad.nombreCompleto} — ` : ""}
            Perfil del Cliente
          </h2>
          <p className="crediscope-muted">
            Cédula {cedula}
            {profile ? ` · Última consulta: ${new Date(profile.created_at).toLocaleString()}` : ""}
          </p>
        </div>
        <button className="crediscope-btn" onClick={handleStructure} disabled={structuring}>
          {structuring ? "Consultando..." : profile ? "Reconsultar" : "Consultar"}
        </button>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)" }}>{error}</p>
        </div>
      ) : null}

      {loading ? <p className="crediscope-muted">Cargando...</p> : null}

      {!loading && !profile ? <p className="crediscope-muted">Sin consulta previa — usá el botón de arriba.</p> : null}

      <SegmentosPerfil standardProfile={standardProfile} segmentConfig={segmentConfig} controlBloqueo={profile?.control_bloqueo} />
    </div>
  );
}
