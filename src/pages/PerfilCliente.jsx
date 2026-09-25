import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { getLatestProfile, structureClient, getSegmentConfig } from "../lib/api.js";
import { setUltimaCedula } from "../lib/ultimaCedula.js";
import { Info } from "lucide-react";
import SegmentosPerfil from "../components/SegmentosPerfil.jsx";
import ClienteHeader from "../components/ClienteHeader.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import PestanasCliente from "../components/PestanasCliente.jsx";
import { formatearFechaHora } from "../lib/fechas.js";

// "Perfil del Cliente" — nombre comercial de la Estructura Estandarizada
// (internamente sigue siendo ese término). A propósito NO clasifica en
// positivo/negativo (eso es trabajo del Análisis con IA, ver
// AnalisisIA.jsx) — es puramente informativa, y solo muestra segmentos/
// campos con dato real según standard_profile_segment_config (ver
// 016_segment_display_config.sql). El render de segmentos vive en
// SegmentosPerfil.jsx, compartido con AnalisisIA.jsx.

export default function PerfilCliente() {
  const { cedula } = useParams();
  const [params] = useSearchParams();
  const desdeRuc = params.get("desdeRuc");

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

  useEffect(() => {
    setUltimaCedula(cedula);
  }, [cedula]);

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
        <Link to="/" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Buscar otro cliente
        </Link>
      </p>

      <PestanasCliente cedula={cedula} activa="perfil" />

      <ClienteHeader
        nombreCompleto={standardProfile?.identidad?.nombreCompleto}
        cedula={cedula}
        acciones={
          <button className="crediscope-btn" onClick={handleStructure} disabled={structuring}>
            {structuring ? "Consultando..." : profile ? "Reconsultar" : "Consultar"}
          </button>
        }
        infoTooltip={
          profile ? <InfoTooltip texto={`Última consulta: ${formatearFechaHora(profile.created_at)}`} /> : null
        }
      />

      {/* Se llegó escribiendo un RUC. Decirlo no es un detalle: quien
          buscó por RUC podría creer que está viendo la actividad del
          establecimiento, y está viendo a la persona. */}
      {desdeRuc ? (
        <div className="crediscope-card" style={{ borderColor: "var(--brand)" }}>
          <p style={{ margin: 0, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Info size={18} color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Buscaste el RUC <strong>{desdeRuc}</strong>. Lo que ves es la <strong>persona natural</strong> detrás de ese RUC,
              cédula {cedula} — no la actividad del establecimiento.
            </span>
          </p>
        </div>
      ) : null}

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
