import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getAnalisisPorId } from "../lib/api.js";
import ClienteHeader from "../components/ClienteHeader.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import AnalisisResultado from "../components/AnalisisResultado.jsx";

// Visor de SOLO LECTURA de un Análisis con IA puntual del Historial.
// No muestra el Perfil del Cliente asociado: analysis_results no guarda
// una referencia al client_profiles.id exacto usado en ese momento
// (solo a ingestion_run_id), así que no hay forma confiable de
// reconstruir ESE snapshot puntual de la Estructura Estandarizada —
// mostrar el perfil "más reciente" sería engañoso en un visor histórico.
export default function HistorialAnalisisDetalle() {
  const { id } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAnalisisPorId(id)
      .then(setResult)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div>
      <p>
        <Link to="/historial" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al Historial
        </Link>
      </p>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)" }}>{error}</p>
        </div>
      ) : null}

      {loading ? <p className="crediscope-muted">Cargando...</p> : null}

      {!loading && !result ? <p className="crediscope-muted">No se encontró este registro.</p> : null}

      {result ? (
        <>
          <ClienteHeader
            cedula={result.clients?.cedula}
            score={result.crediscope_score}
            infoTooltip={<InfoTooltip texto={`Análisis con IA generado el ${new Date(result.created_at).toLocaleString()} (${result.rules_version}) — vista de solo lectura del Historial.`} />}
          />
          <AnalisisResultado result={result} />
        </>
      ) : null}
    </div>
  );
}
