import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { getLatestAvalConsulta, consultarAval } from "../lib/api.js";
import { estaVigenteAval, finVigenciaAval } from "../../supabase/functions/_shared/aval-vigencia.ts";
import { formatearFecha } from "../lib/fechas.js";
import ClienteHeader from "../components/ClienteHeader.jsx";
import ScoreGauge from "../components/ScoreGauge.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import FactoresAval from "../components/aval/FactoresAval.jsx";
import SegmentosAval from "../components/aval/SegmentosAval.jsx";
import { formatearValorAval } from "../lib/avalCampos.js";
import { setUltimaCedula } from "../lib/ultimaCedula.js";

// "Aval" — tercera pestaña junto a Perfil del Cliente / Análisis con IA.
// Puramente informativa como Perfil del Cliente (sin recomendación: eso
// es trabajo del futuro marco interpretativo, que todavía no existe para
// Aval). Se parece a Análisis con IA en la forma -- score + un panel de
// factores +/- -- porque Aval YA calcula su propio score con sus propios
// factores; no hay nada que un LLM tenga que decidir acá todavía.
//
// BOTÓN DE CONSULTA: Aval cuesta, y ya existe una ventana de vigencia
// (hasta el 17 de cada mes -- ver aval-vigencia.ts). Por eso el botón NO
// se ofrece mientras haya una consulta vigente: se muestra la info de
// vigencia en un tooltip, sin acción manual para forzar una nueva. Se
// habilita "Reconsultar" solo cuando la última consulta VENCIÓ, y
// "Reintentar" cuando un intento de esta misma sesión falló -- los dos
// casos en que efectivamente hace falta volver a pagar.

export default function PerfilAval() {
  const { cedula } = useParams();

  const [consulta, setConsulta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConsulta(await getLatestAvalConsulta(cedula));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cedula]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setUltimaCedula(cedula);
  }, [cedula]);

  async function handleConsultar() {
    setConsultando(true);
    setError(null);
    try {
      const fresh = await consultarAval(cedula);
      setConsulta(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setConsultando(false);
    }
  }

  const vigente = consulta ? estaVigenteAval(consulta.created_at) : false;
  const fallo = !consultando && error;
  const estructura = consulta?.estructura;

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
        <Link className="crediscope-tab" to={`/analisis/${cedula}`}>
          Análisis con IA
        </Link>
        <span className="crediscope-tab crediscope-tab-active">Aval</span>
      </div>

      <ClienteHeader
        nombreCompleto={estructura?.nombre}
        cedula={cedula}
        score={estructura?.score ?? undefined}
        acciones={
          !loading && (!consulta || !vigente || fallo) ? (
            <button className="crediscope-btn" onClick={handleConsultar} disabled={consultando}>
              <RefreshCw size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
              {consultando ? "Consultando..." : fallo ? "Reintentar" : consulta ? "Reconsultar a Aval" : "Consultar a Aval"}
            </button>
          ) : null
        }
        infoTooltip={
          consulta && vigente
            ? <InfoTooltip texto={`Consultada el ${formatearFecha(consulta.created_at)} — vigente hasta el ${formatearFecha(finVigenciaAval())} (Aval actualiza su información el 18 de cada mes).`} />
            : consulta && !vigente
              ? <InfoTooltip texto={`La consulta del ${formatearFecha(consulta.created_at)} venció. Aval actualiza su información el 18 de cada mes -- hace falta reconsultar.`} />
              : null
        }
      />

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      {loading ? <p className="crediscope-muted">Cargando...</p> : null}

      {!loading && !consulta && !error ? (
        <p className="crediscope-muted">Sin consulta previa a Aval — usá el botón de arriba.</p>
      ) : null}

      {estructura ? (
        <>
          <div className="crediscope-analisis-grid">
            <div className="crediscope-card">
              <ScoreGauge score={estructura.score} />
              {estructura.tipoScore || estructura.tasaMalos != null ? (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                  {estructura.tipoScore ? (
                    <p style={{ margin: "0 0 4px", fontSize: 13 }}>
                      <span className="crediscope-muted">Tipo: </span>
                      {estructura.tipoScore}
                    </p>
                  ) : null}
                  {estructura.tasaMalos != null ? (
                    <p style={{ margin: 0, fontSize: 13 }}>
                      <span className="crediscope-muted">Prob. de caer en vencido (12m): </span>
                      {formatearValorAval(estructura.tasaMalos, "decimal")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <FactoresAval factores={estructura.factoresScore} />
          </div>

          <SegmentosAval estructura={estructura} />
        </>
      ) : null}
    </div>
  );
}
