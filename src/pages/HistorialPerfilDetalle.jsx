import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getPerfilPorId, getSegmentConfig } from "../lib/api.js";
import SegmentosPerfil from "../components/SegmentosPerfil.jsx";
import ClienteHeader from "../components/ClienteHeader.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import { formatearFechaHora } from "../lib/fechas.js";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";

// Visor de SOLO LECTURA de un Perfil del Cliente puntual del Historial —
// mismo snapshot que se vio ese día, sin botón de reconsultar (a
// diferencia de PerfilCliente.jsx, que siempre trabaja sobre "el más
// reciente" y sí permite reconsultar).
export default function HistorialPerfilDetalle() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [segmentConfig, setSegmentConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getPerfilPorId(id), getSegmentConfig()])
      .then(([p, segments]) => {
        setProfile(p);
        setSegmentConfig(segments);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const standardProfile = profile?.standard_profile;

  return (
    <div>
      <p>
        <Link to="/historial" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al Historial
        </Link>
      </p>

      {error ? (
        <AvisoDeError error={error} />
      ) : null}

      {loading ? <Cargando /> : null}

      {!loading && !profile ? <p className="crediscope-muted">No se encontró este registro.</p> : null}

      {profile ? (
        <>
          <ClienteHeader
            nombreCompleto={standardProfile?.identidad?.nombreCompleto}
            cedula={profile.clients?.cedula}
            infoTooltip={<InfoTooltip texto={`Perfil del Cliente consultado el ${formatearFechaHora(profile.created_at)} — vista de solo lectura del Historial.`} />}
          />
          <SegmentosPerfil standardProfile={standardProfile} segmentConfig={segmentConfig} controlBloqueo={profile.control_bloqueo} />
        </>
      ) : null}
    </div>
  );
}
