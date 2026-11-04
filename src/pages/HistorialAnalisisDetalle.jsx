import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getAnalisisPorId } from "../lib/api.js";
import ClienteHeader from "../components/ClienteHeader.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import AnalisisResultado from "../components/AnalisisResultado.jsx";
import { formatearFechaHora } from "../lib/fechas.js";
import Aviso from "../components/ui/Aviso.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import {
  completitudDeLaConsulta,
  porQueElAnalisisSeMarca,
  porQueEsParcial,
  recomendacionDeLaEntrega,
} from "../../supabase/functions/_shared/calidad-de-la-consulta.ts";
import Cargando from "../components/ui/Cargando.jsx";

// Visor de SOLO LECTURA de un Análisis con IA puntual del Historial.
// Todavía no muestra el Perfil del Cliente asociado, aunque desde la
// 032 el análisis sí referencia el perfil exacto con el que se hizo
// (client_profile_id) y ya se podría reconstruir ese momento: queda
// como mejora pendiente, no como imposibilidad.
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

  const cedula = result?.clients?.cedula;
  // La regla de la entrega sobre lo guardado (145): una consulta parcial no pasa de
  // «Revisar», y un análisis sobre una consulta incompleta lo dice. Lo guardado no se toca.
  const estadoDeLaConsulta = result?.client_profiles?.estado_por_fuente ?? null;
  const parcial = completitudDeLaConsulta(estadoDeLaConsulta) === "parcial";
  const entregado = result && parcial ? { ...result, recomendacion: recomendacionDeLaEntrega(result.recomendacion, "parcial") } : result;
  const aviso = result && !result.fallo ? porQueElAnalisisSeMarca(estadoDeLaConsulta) || (parcial ? porQueEsParcial(estadoDeLaConsulta) : "") : "";

  return (
    <div>
      <p>
        <Link to={cedula ? `/solicitudes/${cedula}` : "/solicitudes"} className="crediscope-muted" style={{ textDecoration: "none" }}>
          {cedula ? "Volver al expediente" : "Volver a la bandeja"}
        </Link>
      </p>

      {error ? (
        <AvisoDeError error={error} />
      ) : null}

      {loading ? <Cargando /> : null}

      {!loading && !result ? <p className="crediscope-muted">No se encontró este registro.</p> : null}

      {result ? (
        <>
          {/* Un análisis que falló no muestra puntaje ni recomendación:
              los valores guardados son el neutro por defecto, no un
              juicio sobre esta persona. */}
          <ClienteHeader
            cedula={cedula}
            score={result.fallo ? null : result.crediscope_score}
            recomendacion={result.fallo ? null : entregado.recomendacion}
            infoTooltip={<InfoTooltip texto={`Análisis con IA generado el ${formatearFechaHora(result.created_at)} (${result.rules_version}) — vista de solo lectura del expediente.`} />}
          />
          {aviso ? <Aviso>{aviso}</Aviso> : null}
          <AnalisisResultado result={entregado} />
        </>
      ) : null}
    </div>
  );
}
