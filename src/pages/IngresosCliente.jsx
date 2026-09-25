import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { getLatestProfile, structureClient } from "../lib/api.js";
import { supabase } from "../lib/supabaseClient.js";
import { loadCorteIess } from "../../supabase/functions/_shared/runtime-config.ts";
import { CORTE_IESS_CONOCIDO } from "../../supabase/functions/_shared/fuentes-ingreso.ts";
import { formatearFecha } from "../lib/fechas.js";
import { setUltimaCedula } from "../lib/ultimaCedula.js";
import PestanasCliente from "../components/PestanasCliente.jsx";
import EncabezadoIngresos from "../components/ingresos/EncabezadoIngresos.jsx";
import ClasificacionIngresos from "../components/ingresos/ClasificacionIngresos.jsx";
import FuentesVigentes from "../components/ingresos/FuentesVigentes.jsx";
import Estabilidad from "../components/ingresos/Estabilidad.jsx";
import DetalleIngresos from "../components/ingresos/DetalleIngresos.jsx";

// "Fuentes de ingreso" — cuarta pestaña del cliente, con la misma gramática
// que el reporte de Aval: arriba lo que decide (de qué vive, qué tan firme
// es, el piso, qué tan sostenido y qué pedir), y el resto detrás de "Ver
// detalle completo".
//
// Lee el perfil guardado: el crudo de Novadata no se guarda, así que no hay
// nada que recalcular acá. Un perfil anterior a fuentes-v4 no tiene el
// detalle (historial mes a mes, actividad, renta por año) y la pantalla lo
// dice en vez de mostrar esas secciones vacías. Reconsultar es gratis y lo
// trae.
export default function IngresosCliente() {
  const { cedula } = useParams();
  const [fila, setFila] = useState(null);
  const [corteVigente, setCorteVigente] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // El corte vigente sale de la misma función que usan las Edge
      // Functions para clasificar (runtime-config.ts), no de una copia.
      const [perfil, corte] = await Promise.all([getLatestProfile(cedula), loadCorteIess(supabase, CORTE_IESS_CONOCIDO)]);
      setFila(perfil);
      setCorteVigente(corte);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [cedula]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setUltimaCedula(cedula);
  }, [cedula]);

  async function reconsultar() {
    setConsultando(true);
    setError(null);
    try {
      setFila(await structureClient(cedula));
    } catch (err) {
      setError(err.message);
    } finally {
      setConsultando(false);
    }
  }

  const perfil = fila?.standard_profile ?? null;
  const f = perfil?.fuentesIngreso ?? null;

  const acciones = !cargando ? (
    <button className="crediscope-btn" onClick={reconsultar} disabled={consultando}>
      <RefreshCw size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
      {consultando ? "Consultando..." : fila ? "Reconsultar" : "Consultar"}
    </button>
  ) : null;

  return (
    <div>
      <p>
        <Link to="/" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Buscar otro cliente
        </Link>
      </p>

      <PestanasCliente cedula={cedula} activa="ingresos" />

      {cargando ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : (
        <EncabezadoIngresos
          cedula={cedula}
          perfil={perfil}
          corteVigente={corteVigente}
          consultadoEl={fila ? formatearFecha(fila.created_at) : null}
          acciones={acciones}
        />
      )}

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      {!cargando && fila && !f ? (
        <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
          <p style={{ margin: 0 }}>
            Este perfil es anterior al módulo de fuentes de ingreso y no trae la clasificación. Reconsultá para generarla.
          </p>
        </div>
      ) : null}

      {f ? (
        <>
          <div className="crediscope-aval-fila">
            <ClasificacionIngresos f={f} corteVigente={corteVigente} />
            <FuentesVigentes f={f} />
          </div>

          <Estabilidad f={f} laboral={perfil.laboral} />

          <button
            type="button"
            className="crediscope-aval-boton-reporte"
            onClick={() => setDetalleAbierto((v) => !v)}
            aria-expanded={detalleAbierto}
          >
            {detalleAbierto ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            {detalleAbierto ? "Ocultar detalle completo" : "Ver detalle completo"}
            {!detalleAbierto ? <small>· empleos, actividad económica, renta, seguridad social</small> : null}
          </button>

          {detalleAbierto ? <DetalleIngresos perfil={perfil} /> : null}
        </>
      ) : null}
    </div>
  );
}
