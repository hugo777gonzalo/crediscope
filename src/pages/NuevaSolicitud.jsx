import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Layers } from "lucide-react";
import { evaluarSolicitud, getSolicitudesRecientes } from "../lib/api.js";
import { useBuro } from "../lib/useBuro.js";
import { useProfile, esAdmin } from "../lib/useProfile.js";
import { getUltimaCedula } from "../lib/ultimaCedula.js";
import { aNumero, useCondicionesDelCredito } from "../lib/credito.js";
import { moneda, plural } from "../lib/formatos.js";
import { formatearFechaHora } from "../lib/fechas.js";
import CondicionesDelCredito from "../components/credito/CondicionesDelCredito.jsx";
import IngresoDeclarado from "../components/credito/IngresoDeclarado.jsx";
import Aviso from "../components/ui/Aviso.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import { MODALIDADES, NOMBRE_DEL_PASO } from "../../supabase/functions/_shared/modalidades.ts";
import { clasificarIdentificacion } from "../../supabase/functions/_shared/identificacion.ts";
import { validarPedido } from "../../supabase/functions/_shared/simulador-credito.ts";

// Nueva solicitud de crédito (133; docs/plan-demo-ifi.md, pasos 3 y 4): quién
// pide, en qué modalidad y con qué condiciones. La evaluación la arma el
// servidor (`evaluar-solicitud`); esta pantalla sólo junta el pedido y lleva
// a la solicitud, que muestra el avance.
//
// Las modalidades son tarjetas que dicen qué hace cada una, para que alguien
// que no estuvo en el diseño entienda la diferencia sin preguntar.

const ESTADO_DE_LA_SOLICITUD = { en_evaluacion: "En evaluación", evaluada: "Evaluada", fallida: "No se completó" };

export default function NuevaSolicitud() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { buro } = useBuro();
  const { profile } = useProfile();
  const admin = esAdmin(profile);
  const [cedula, setCedula] = useState(params.get("cedula") ?? getUltimaCedula() ?? "");
  const [modalidad, setModalidad] = useState("pro");
  const [declarado, setDeclarado] = useState("");
  const { valores, cambiar, pedido } = useCondicionesDelCredito();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [recientes, setRecientes] = useState(null);

  useEffect(() => {
    getSolicitudesRecientes().then(setRecientes).catch(() => setRecientes([]));
  }, []);

  const ident = useMemo(() => clasificarIdentificacion(cedula), [cedula]);
  const def = MODALIDADES[modalidad];
  const plusDisponible = buro === "equifax";
  const erroresCondiciones = def.exigeCondiciones ? validarPedido(pedido) : [];
  const listo = ident.consultable && erroresCondiciones.length === 0 && !(modalidad === "plus" && !plusDisponible);

  async function enviar(e) {
    e.preventDefault();
    if (!listo || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const declaradoNumero = aNumero(declarado);
      const creada = await evaluarSolicitud({
        accion: "crear",
        cedula: ident.cedula,
        modalidad,
        ...(def.exigeCondiciones ? { solicitud: pedido } : {}),
        ...(def.exigeCondiciones && Number.isFinite(declaradoNumero) && declaradoNumero > 0 ? { ingresoDeclarado: declaradoNumero } : {}),
      });
      navigate(`/solicitud/${creada.id}`);
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <div className="crediscope-pagina-cabecera" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Nueva solicitud</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Quién pide el crédito, cuánto evaluar y con qué condiciones.
        </p>
      </div>

      <div className="crediscope-card crediscope-credito-formulario">
        <div className="crediscope-credito-campo" style={{ marginBottom: 0, maxWidth: 360 }}>
          <label htmlFor="solicitud-cedula">Cédula de quien pide</label>
          <div className="crediscope-credito-entrada">
            <input id="solicitud-cedula" inputMode="numeric" autoComplete="off" value={cedula} onChange={(e) => setCedula(e.target.value)} />
          </div>
          {cedula.trim() && !ident.consultable ? <p className="crediscope-credito-ayuda" style={{ color: "var(--bad)" }}>{ident.mensaje}</p> : null}
        </div>
      </div>

      <h3 className="crediscope-capacidad-subtitulo" style={{ margin: "8px 0 12px" }}>
        <Layers size={17} aria-hidden="true" />
        Modalidad
      </h3>
      <div className="crediscope-modalidades" role="radiogroup" aria-label="Modalidad de la evaluación">
        {Object.entries(MODALIDADES).map(([clave, m]) => {
          const deshabilitada = clave === "plus" && !plusDisponible;
          const elegida = modalidad === clave;
          return (
            <button
              key={clave}
              type="button"
              role="radio"
              aria-checked={elegida}
              disabled={deshabilitada}
              className={`crediscope-modalidad${elegida ? " crediscope-modalidad-elegida" : ""}`}
              onClick={() => setModalidad(clave)}
            >
              <span className="crediscope-modalidad-nombre">
                {m.nombre}
                {elegida ? <CheckCircle2 size={18} aria-hidden="true" /> : null}
              </span>
              <span className="crediscope-modalidad-descripcion">{m.descripcion}</span>
              <ol className="crediscope-modalidad-pasos">
                {m.pasos.map((p) => (
                  <li key={p}>{NOMBRE_DEL_PASO[p]}</li>
                ))}
              </ol>
              {deshabilitada ? <span className="crediscope-modalidad-nota">El buró de esta institución no es Equifax.</span> : null}
              {clave === "plus" && plusDisponible && !admin ? (
                <span className="crediscope-modalidad-nota">Si la persona no tiene una consulta de Equifax vigente, la hace un administrador (se cobra).</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {def.exigeCondiciones ? (
        <div className="crediscope-credito-grid" style={{ marginTop: 16 }}>
          <CondicionesDelCredito valores={valores} cambiar={cambiar} />
          <IngresoDeclarado valor={declarado} alCambiar={setDeclarado} />
        </div>
      ) : null}

      {def.exigeCondiciones && erroresCondiciones.length > 0 ? (
        <Aviso tipo="advertencia" titulo="Revisá las condiciones del crédito">
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {erroresCondiciones.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Aviso>
      ) : null}

      {error ? <AvisoDeError error={error} /> : null}

      <div className="crediscope-solicitud-acciones">
        <button type="submit" className="crediscope-btn crediscope-solicitud-evaluar" disabled={!listo || enviando}>
          {enviando ? "Creando la solicitud..." : `Evaluar en ${def.nombre}`}
        </button>
        <span className="crediscope-muted">
          {modalidad === "basico" ? "Consulta a la persona si no tiene un perfil de los últimos 7 días y le pide su recomendación al modelo." : "Consulta a la persona si hace falta, le pide su recomendación al modelo y calcula la cuota y la capacidad."}
        </span>
      </div>

      <section className="crediscope-card" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Solicitudes recientes</h3>
        {recientes === null ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>
            Cargando...
          </p>
        ) : recientes.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>
            Todavía no hay solicitudes.
          </p>
        ) : (
          <div className="crediscope-capacidad-lista">
            {recientes.map((r) => (
              <Link key={r.id} to={`/solicitud/${r.id}`} className="crediscope-capacidad-fila crediscope-solicitud-reciente">
                <span>
                  <strong>{MODALIDADES[r.modalidad]?.nombre}</strong> · {r.identificacion}
                  {r.monto ? ` · ${moneda(Number(r.monto))} a ${plural(r.plazo_meses, "mes", "meses")}` : ""}
                  <span className="crediscope-celda-sub">{formatearFechaHora(r.creada_el)}</span>
                </span>
                <span>{ESTADO_DE_LA_SOLICITUD[r.estado] ?? r.estado}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </form>
  );
}
