import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getLatestProfile, structureClient, getSegmentConfig } from "../lib/api.js";
import { GRUPOS_CONFIG, filasVisibles } from "../lib/perfilClienteCampos.js";

// "Perfil del Cliente" — nombre comercial de la Estructura Estandarizada
// (internamente sigue siendo ese término). A propósito NO clasifica en
// positivo/negativo (eso es trabajo del Análisis con IA, ver
// AnalisisIA.jsx) — es puramente informativa, y solo muestra segmentos/
// campos con dato real según standard_profile_segment_config (ver
// 016_segment_display_config.sql).

// Duplica el orden/etiquetas de grupo del backend a propósito (mismo
// patrón que ClassifiedProfile.jsx/AdminConfig.jsx) — son solo strings
// de presentación. metaConsulta queda afuera del recorrido: es
// metadata de auditoría de la ingesta, no información del cliente.
const ORDEN_GRUPOS = [
  "cumplimiento",
  "riesgoSeguridadCiudadana",
  "comportamientoBancario",
  "comportamientoCooperativas",
  "riesgoJudicialCrediticio",
  "riesgoJudicialCivil",
  "riesgoPenal",
  "laboral",
  "tributario",
  "seguridadSocial",
  "patrimonio",
  "familia",
  "identidad",
  "contacto",
  "transitoVehicular",
  "comportamientoInterno",
];

const ETIQUETAS_GRUPO = {
  cumplimiento: "Cumplimiento y Listas de Control",
  riesgoSeguridadCiudadana: "Riesgo de Seguridad Ciudadana",
  comportamientoBancario: "Comportamiento Bancos / BIESS / Diners",
  comportamientoCooperativas: "Comportamiento Cooperativas",
  riesgoJudicialCrediticio: "Riesgo Judicial Crediticio",
  riesgoJudicialCivil: "Riesgo Judicial / Civil (otros)",
  riesgoPenal: "Riesgo Penal / Fiscalía",
  laboral: "Situación Laboral e Ingresos",
  tributario: "Situación Tributaria (SRI)",
  seguridadSocial: "Seguridad Social",
  patrimonio: "Patrimonio",
  familia: "Núcleo Familiar",
  identidad: "SocioDemográficas",
  contacto: "Contacto y Domicilio",
  transitoVehicular: "Tránsito Vehicular",
  comportamientoInterno: "Comportamiento Interno (Novadata)",
};

function SegmentoCard({ grupo, filas, mensajeVacio }) {
  return (
    <div className="crediscope-card" style={{ padding: "14px 20px" }}>
      <p style={{ fontWeight: 600, margin: "0 0 6px" }}>{ETIQUETAS_GRUPO[grupo]}</p>
      {filas.length > 0 ? (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          {filas.map((f, i) => (
            <span key={f.etiqueta}>
              {i > 0 ? " · " : ""}
              <span className="crediscope-muted">{f.etiqueta}:</span> {f.texto}
            </span>
          ))}
        </p>
      ) : (
        <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>
          {mensajeVacio}
        </p>
      )}
    </div>
  );
}

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

  const modoPorGrupo = {};
  for (const s of segmentConfig || []) modoPorGrupo[s.grupo] = s.modo;

  const standardProfile = profile?.standard_profile;
  const controlBloqueo = profile?.control_bloqueo;
  const hallazgosBloqueantes = (controlBloqueo?.hallazgos || []).filter((h) => h.bloqueante);

  return (
    <div>
      <p>
        <Link to="/">&larr; Buscar otro cliente</Link>
      </p>

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
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="crediscope-btn crediscope-btn-ghost" to={`/clientes/${cedula}`} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Ver Análisis con IA →
          </Link>
          <button className="crediscope-btn" onClick={handleStructure} disabled={structuring}>
            {structuring ? "Consultando..." : profile ? "Reconsultar" : "Consultar"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)" }}>{error}</p>
        </div>
      ) : null}

      {loading ? <p className="crediscope-muted">Cargando...</p> : null}

      {!loading && !profile ? <p className="crediscope-muted">Sin consulta previa — usá el botón de arriba.</p> : null}

      {hallazgosBloqueantes.length > 0 ? (
        <div className="crediscope-card" style={{ borderColor: "var(--warn)", background: "#fffbeb" }}>
          <p style={{ fontWeight: 600, color: "var(--warn)", margin: "0 0 6px" }}>
            {hallazgosBloqueantes.length} control{hallazgosBloqueantes.length > 1 ? "es" : ""} de bloqueo activo
            {hallazgosBloqueantes.length > 1 ? "s" : ""}
          </p>
          <ul className="crediscope-list" style={{ margin: 0 }}>
            {hallazgosBloqueantes.map((h) => (
              <li key={h.code}>{h.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {standardProfile
        ? ORDEN_GRUPOS.map((grupo) => {
            const modo = modoPorGrupo[grupo] ?? "con_datos";
            if (modo === "nunca") return null;
            const config = GRUPOS_CONFIG[grupo];
            const tienePresencia = config?.presencia(standardProfile);
            if (modo === "con_datos" && !tienePresencia) return null;
            return <SegmentoCard key={grupo} grupo={grupo} filas={filasVisibles(standardProfile, grupo)} mensajeVacio={config?.mensajeVacio} />;
          })
        : null}
    </div>
  );
}
