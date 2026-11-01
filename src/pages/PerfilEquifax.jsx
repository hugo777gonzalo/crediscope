import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getUltimaConsultaEquifax, getOperacionesEquifax, getHistoriaDePagosEquifax, getCortesDelReporteEquifax, registrarEvento } from "../lib/api.js";
import { estaVigenteHastaElCorte, finDeLaVigencia } from "../../supabase/functions/_shared/vigencia-mensual.ts";
import { formatearFecha, formatearFechaHora } from "../lib/fechas.js";
import { franjaDePagos } from "../lib/equifaxPantalla.js";
import { setUltimaCedula } from "../lib/ultimaCedula.js";
import { useProfile, esAdmin } from "../lib/useProfile.js";
import PestanasCliente from "../components/PestanasCliente.jsx";
import CabeceraEquifax from "../components/equifax/CabeceraEquifax.jsx";
import ConsultarEquifax from "../components/equifax/ConsultarEquifax.jsx";
import IndicadoresEquifax from "../components/equifax/IndicadoresEquifax.jsx";
import DeudaPorSistema from "../components/equifax/DeudaPorSistema.jsx";
import FranjaDePagos from "../components/equifax/FranjaDePagos.jsx";
import OperacionesEquifax from "../components/equifax/OperacionesEquifax.jsx";
import ReporteCompletoEquifax from "../components/equifax/ReporteCompletoEquifax.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import Aviso from "../components/ui/Aviso.jsx";

// La pestaña Equifax de una persona: el buró de la institución cuando la IFI
// trabaja con Equifax (cuestionario, A2 y F1, 2026-10-13). Diseño aprobado
// por el negocio el 2026-10-16 (docs/propuesta-buro-de-la-institucion.md,
// sección 5), con un pedido: moderna, precisa, informativa y fácil de leer,
// con las explicaciones largas en ayudas emergentes.
//
// Arriba lo que decide (de cuándo es, lo grave, cuatro números, la deuda por
// sistema y cómo pagó mes a mes); después las operaciones; el resto, plegado.
//
// Lee lo guardado. El botón para consultar (pedido del negocio, 2026-10-17)
// es sólo para administración y sólo cuando la persona no tiene una consulta
// vigente, como decía el diseño aprobado el 2026-10-16 (A5: consulta a mano,
// por persona). Pide confirmar porque cada consulta se cobra y su proveedor no
// pone tope (negocio, 2026-10-12). La función exige lo mismo (admin), así que
// un analista tampoco puede consultar llamándola directamente.

export default function PerfilEquifax() {
  const { cedula } = useParams();
  const { profile } = useProfile();
  const admin = esAdmin(profile);
  const [consulta, setConsulta] = useState(null);
  const [operaciones, setOperaciones] = useState([]);
  const [historia, setHistoria] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [reporteAbierto, setReporteAbierto] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [recienConsultada, setRecienConsultada] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const c = await getUltimaConsultaEquifax(cedula);
      setConsulta(c);
      if (c) {
        const [ops, hist, cortesDelReporte] = await Promise.all([
          getOperacionesEquifax(c.id),
          getHistoriaDePagosEquifax(c.id),
          getCortesDelReporteEquifax(c.id),
        ]);
        setOperaciones(ops);
        setHistoria(hist);
        setCortes(cortesDelReporte);
      } else {
        setOperaciones([]);
        setHistoria([]);
        setCortes([]);
      }
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }, [cedula]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setUltimaCedula(cedula);
    setRecienConsultada(null);
  }, [cedula]);

  // La función devuelve un resumen; lo que se muestra se vuelve a leer de lo
  // guardado, igual que al entrar a la pestaña.
  function alConsultar(resumen) {
    setRecienConsultada(resumen);
    cargar();
  }

  // El PDF es la pantalla impresa con todo abierto: las operaciones completas
  // y el reporte entero. Se imprime cuando ya está dibujado así.
  useEffect(() => {
    if (!imprimiendo) return undefined;
    const alTerminar = () => setImprimiendo(false);
    window.addEventListener("afterprint", alTerminar);
    const id = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("afterprint", alTerminar);
    };
  }, [imprimiendo]);

  function descargarReporte() {
    // Es una exportación de los datos de una persona: queda en la auditoría
    // (migración 129), sin la cédula en el detalle.
    registrarEvento("exportacion.reporte_equifax", consulta?.client_id ?? null, { consulta_equifax_id: consulta?.id ?? null });
    setImprimiendo(true);
  }

  const estructura = consulta?.estructura ?? null;
  const franja = useMemo(() => franjaDePagos(historia, cortes), [historia, cortes]);
  const vigente = consulta ? estaVigenteHastaElCorte(consulta.created_at) : false;
  // Vencida, dice cuándo venció: «volver a consultar se cobra» repetía lo que
  // ya dicen la ayuda de al lado y el cuadro del botón (revisión del 2026-10-18).
  const vigencia = consulta
    ? vigente
      ? { vigente: true, texto: `Vale hasta el ${formatearFecha(finDeLaVigencia())}` }
      : { vigente: false, texto: `Venció el ${formatearFecha(finDeLaVigencia(new Date(consulta.created_at)))}` }
    : null;
  const todoAbierto = reporteAbierto || imprimiendo;

  return (
    <div className="crediscope-equifax">
      <p className="crediscope-no-imprimir">
        <Link to="/" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Buscar otra persona
        </Link>
      </p>

      <PestanasCliente cedula={cedula} activa="equifax" />

      {consulta ? (
        <div className="crediscope-solo-impresion crediscope-equifax-impresion">
          <strong>CrediScope · Reporte de Equifax</strong>
          <span>
            Generado el {formatearFechaHora(new Date())}
            {profile?.nombre_corto ? ` por ${profile.nombre_corto}` : ""}. Datos de Equifax consultados el{" "}
            {formatearFecha(consulta.created_at)}.
          </span>
        </div>
      ) : null}

      {error ? <AvisoDeError error={error} alReintentar={cargar} /> : null}

      {recienConsultada && !cargando ? (
        <div className="crediscope-no-imprimir">
          <Aviso tipo={recienConsultada.reutilizada ? "informacion" : "exito"}>
            <p>
              {recienConsultada.reutilizada
                ? "Esta persona ya tenía una consulta vigente: se usa esa, sin volver a pagar."
                : `Consulta a Equifax hecha y guardada. Vale hasta el ${formatearFecha(recienConsultada.vigente_hasta)}.`}
            </p>
          </Aviso>
        </div>
      ) : null}

      {cargando ? (
        <Cargando />
      ) : !consulta ? (
        error ? null : (
          <Aviso tipo="informacion" titulo="Esta persona no tiene consulta a Equifax.">
            <p className="crediscope-muted">
              Cada consulta a Equifax se cobra, así que no se hace sola: se pide cuando la solicitud la necesita
              {admin ? "." : ", a administración."}
            </p>
            {admin ? (
              <div className="crediscope-equifax-sin-consulta">
                <ConsultarEquifax cedula={cedula} hayConsulta={false} alTerminar={alConsultar} />
              </div>
            ) : null}
          </Aviso>
        )
      ) : (
        <>
          <CabeceraEquifax
            cedula={cedula}
            estructura={estructura}
            ambiente={consulta.ambiente}
            consultadoEl={formatearFecha(consulta.created_at)}
            vigencia={vigencia}
            onReporte={descargarReporte}
            imprimiendo={imprimiendo}
            consultar={admin && !vigente ? <ConsultarEquifax cedula={cedula} hayConsulta alTerminar={alConsultar} /> : null}
          />

          {estructura ? (
            <>
              <IndicadoresEquifax estructura={estructura} />
              {/* Una debajo de la otra: lado a lado, a 1280 la tabla de deuda
                  quedaba apretada y su última columna se cortaba. */}
              <DeudaPorSistema estructura={estructura} />
              <FranjaDePagos conducta={estructura.conductaDePago} franja={franja} />
              <OperacionesEquifax operaciones={operaciones} todas={imprimiendo} />

              <button
                type="button"
                className="crediscope-aval-boton-reporte crediscope-no-imprimir"
                onClick={() => setReporteAbierto((v) => !v)}
                aria-expanded={reporteAbierto}
              >
                {reporteAbierto ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                {reporteAbierto ? "Ocultar el reporte completo" : "Ver el reporte completo"}
                {!reporteAbierto ? <small>· tarjetas, evolución, scores, créditos, consultas y 3 secciones más</small> : null}
              </button>
              {todoAbierto ? <ReporteCompletoEquifax estructura={estructura} /> : null}
            </>
          ) : (
            <Aviso tipo="advertencia" titulo="La consulta está guardada pero todavía no se ordenó.">
              <p className="crediscope-muted">
                Lo que contestó Equifax está guardado entero; falta pasarlo a sus tablas. Avisá a administración: se hace
                sin volver a pagar.
              </p>
            </Aviso>
          )}
        </>
      )}
    </div>
  );
}
