import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { getLatestAvalConsulta, consultarAval } from "../lib/api.js";
import { estaVigenteAval, finVigenciaAval } from "../../supabase/functions/_shared/aval-vigencia.ts";
import { construirEstructuraAval, AVAL_ESTRUCTURA_VERSION } from "../../supabase/functions/_shared/aval-estructura.ts";
import { formatearFecha } from "../lib/fechas.js";
import EncabezadoAval from "../components/aval/EncabezadoAval.jsx";
import ResumenScore from "../components/aval/ResumenScore.jsx";
import DeudaActual from "../components/aval/DeudaActual.jsx";
import DetalleOperaciones from "../components/aval/DetalleOperaciones.jsx";
import ReporteTotal, { seccionesConDatos } from "../components/aval/ReporteTotal.jsx";
import { setUltimaCedula } from "../lib/ultimaCedula.js";
import PestanasCliente from "../components/PestanasCliente.jsx";

// "Aval" — tercera pestaña junto a Perfil del Cliente / Análisis con IA.
// Puramente informativa (sin recomendación: eso es trabajo del futuro marco
// interpretativo, que todavía no existe para Aval).
//
// Arriba, siempre a la vista, lo que decide: quién es, score y riesgo, qué
// lo mueve, cuánto debe (como titular y como codeudor/garante) y cada
// operación. El resto va detrás de "Ver reporte total".
//
// BOTÓN DE CONSULTA: Aval cuesta, y ya existe una ventana de vigencia
// (hasta el 17 de cada mes -- ver aval-vigencia.ts). Por eso el botón NO
// se ofrece mientras haya una consulta vigente. Se habilita "Reconsultar"
// solo cuando la última consulta VENCIÓ, y "Reintentar" cuando un intento
// de esta misma sesión falló -- los dos casos en que efectivamente hace
// falta volver a pagar.

// La estructura guardada es la de la versión con que se consultó. Las
// anteriores a v4 traen duplicados los totales por vencer/vencido/demanda/
// castigada y no separan por rol, y la fila más vieja ni siquiera tiene
// estructura. respuesta_cruda es la fuente de verdad y el constructor es el
// mismo que usa la Edge Function (_shared/, una sola implementación), así
// que se rearma acá en vez de depender de que alguien haya recalculado las
// filas viejas.
function estructuraAlDia(consulta) {
  if (!consulta) return null;
  if (consulta.estructura && consulta.estructura_version === AVAL_ESTRUCTURA_VERSION) return consulta.estructura;
  if (consulta.respuesta_cruda?.result) return construirEstructuraAval(consulta.respuesta_cruda);
  return consulta.estructura ?? null;
}

export default function PerfilAval() {
  const { cedula } = useParams();

  const [consulta, setConsulta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState(null);
  const [reporteAbierto, setReporteAbierto] = useState(false);

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
  const estructura = useMemo(() => estructuraAlDia(consulta), [consulta]);
  const ocultas = estructura ? seccionesConDatos(estructura).length : 0;

  const acciones =
    !loading && (!consulta || !vigente || fallo) ? (
      <button className="crediscope-btn" onClick={handleConsultar} disabled={consultando}>
        <RefreshCw size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
        {consultando ? "Consultando..." : fallo ? "Reintentar" : consulta ? "Reconsultar a Aval" : "Consultar a Aval"}
      </button>
    ) : null;

  const vigencia = consulta
    ? vigente
      ? { vigente: true, texto: `hasta el ${formatearFecha(finVigenciaAval())}` }
      : { vigente: false, texto: "vencida (Aval actualiza el 18)" }
    : null;

  return (
    <div>
      <p>
        <Link to="/" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Buscar otro cliente
        </Link>
      </p>

      <PestanasCliente cedula={cedula} activa="aval" />

      {loading ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : (
        <EncabezadoAval
          cedula={cedula}
          estructura={estructura}
          ambiente={consulta?.ambiente}
          consultadaEl={consulta ? formatearFecha(consulta.created_at) : null}
          vigencia={vigencia}
          acciones={acciones}
        />
      )}

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      {/* La limitación se dice acá, no se descubre apretando el botón.
          El WAF de Aval rechaza la IP de salida de las Edge Functions de
          Supabase (medido el 2026-09-22: no es el certificado, que valida
          bien); desde una IP ecuatoriana la misma petición pasa. Lo que se
          ve son consultas ya guardadas, traídas con el corredor local. */}
      {!loading && !consulta ? (
        <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
          <p style={{ margin: 0 }}>
            <strong>Sin consulta previa a Aval para esta cédula.</strong>
          </p>
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>
            Consultar desde la app desplegada todavía no funciona: Aval solo admite conexiones desde IPs de Ecuador y el
            servidor sale a internet desde fuera del país. Queda pendiente resolver la salida (proxy o servidor en Ecuador).
            Mientras tanto, esta pantalla muestra las consultas que ya estén guardadas.
          </p>
        </div>
      ) : null}

      {estructura ? (
        <>
          <div className="crediscope-aval-fila">
            <ResumenScore factores={estructura.factoresScore} />
            <DeudaActual estructura={estructura} />
          </div>

          <DetalleOperaciones estructura={estructura} />

          <button
            type="button"
            className="crediscope-aval-boton-reporte"
            onClick={() => setReporteAbierto((v) => !v)}
            aria-expanded={reporteAbierto}
          >
            {reporteAbierto ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            {reporteAbierto ? "Ocultar reporte total" : "Ver reporte total"}
            {!reporteAbierto ? <small>· {ocultas} secciones más</small> : null}
          </button>

          {reporteAbierto ? <ReporteTotal estructura={estructura} /> : null}
        </>
      ) : null}
    </div>
  );
}
