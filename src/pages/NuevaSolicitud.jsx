import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Layers, ShieldAlert } from "lucide-react";
import { evaluarSolicitud, getSolicitudesRecientes } from "../lib/api.js";
import { useBuro } from "../lib/useBuro.js";
import { useProfile, esAdmin } from "../lib/useProfile.js";
import { getUltimaCedula } from "../lib/ultimaCedula.js";
import { aNumero, useCondicionesDelCredito } from "../lib/credito.js";
import { moneda, plural } from "../lib/formatos.js";
import { TARIFA_EQUIFAX_USD } from "../lib/costoEquifax.js";
import { formatearFechaHora } from "../lib/fechas.js";
import CondicionesDelCredito from "../components/credito/CondicionesDelCredito.jsx";
import IngresoDeclarado from "../components/credito/IngresoDeclarado.jsx";
import Aviso from "../components/ui/Aviso.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import { MODALIDADES, NOMBRE_DEL_PASO } from "../../supabase/functions/_shared/modalidades.ts";
import { NOMBRE_DE_LA_DECISION } from "../../supabase/functions/_shared/estado-de-la-persona.ts";
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
  const [errorRecientes, setErrorRecientes] = useState(null);
  // A qué (modalidad y persona) se le pidió confirmar: si cambia cualquiera de las dos, hay que confirmar de nuevo.
  const [confirmadaPara, setConfirmadaPara] = useState(null);
  const botonesDeModalidad = useRef({});

  function cargarRecientes() {
    setErrorRecientes(null);
    getSolicitudesRecientes().then(setRecientes).catch((err) => {
      // Una lista que no cargó no es una lista vacía: se dice qué pasó.
      setRecientes([]);
      setErrorRecientes(err);
    });
  }

  useEffect(cargarRecientes, []);

  const ident = useMemo(() => clasificarIdentificacion(cedula), [cedula]);
  const cedulaConError = Boolean(cedula.trim()) && !ident.consultable;
  const def = MODALIDADES[modalidad];
  const plusDisponible = buro === "equifax";
  const erroresCondiciones = def.exigeCondiciones ? validarPedido(pedido) : [];
  const listo = ident.consultable && erroresCondiciones.length === 0 && !(modalidad === "plus" && !plusDisponible);

  // Plus puede consultar Equifax, que se cobra: nunca sale de un solo clic (negocio, 2026-10-17).
  const llaveDeConfirmacion = `${modalidad}|${ident.cedula}`;
  const pideConfirmar = modalidad === "plus" && admin;
  const confirmando = pideConfirmar && confirmadaPara === llaveDeConfirmacion;

  function enviar(e) {
    e.preventDefault();
    if (!listo || enviando) return;
    if (pideConfirmar && !confirmando) {
      setConfirmadaPara(llaveDeConfirmacion);
      return;
    }
    crear();
  }

  // Las modalidades son un grupo de opciones: una sola parada con el tabulador y las flechas para cambiar.
  function moverModalidad(e, clave) {
    const habilitadas = Object.keys(MODALIDADES).filter((k) => !(k === "plus" && !plusDisponible));
    const i = habilitadas.indexOf(clave);
    const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!paso) return;
    e.preventDefault();
    const siguiente = habilitadas[(i + paso + habilitadas.length) % habilitadas.length];
    setModalidad(siguiente);
    botonesDeModalidad.current[siguiente]?.focus();
  }

  async function crear() {
    setConfirmadaPara(null);
    setEnviando(true);
    setError(null);
    try {
      const declaradoNumero = aNumero(declarado);
      const ingresoDeclarado = Number.isFinite(declaradoNumero) && declaradoNumero > 0 ? { ingresoDeclarado: declaradoNumero } : {};
      const creada = await evaluarSolicitud({
        accion: "crear",
        cedula: ident.cedula,
        modalidad,
        // Como en la especificación de la API: las condiciones y el Ingreso
        // declarado juntos, dentro de `solicitudDeCredito`.
        ...(def.exigeCondiciones ? { solicitudDeCredito: { ...pedido, ...ingresoDeclarado } } : {}),
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
          <div className={`crediscope-credito-entrada${cedulaConError ? " crediscope-credito-entrada-invalida" : ""}`}>
            <input
              id="solicitud-cedula"
              inputMode="numeric"
              autoComplete="off"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              aria-invalid={cedulaConError || undefined}
              aria-describedby={cedulaConError ? "solicitud-cedula-error" : undefined}
            />
          </div>
          {cedulaConError ? (
            <p id="solicitud-cedula-error" className="crediscope-credito-ayuda" style={{ color: "var(--bad)" }}>
              {ident.mensaje}
            </p>
          ) : null}
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
              tabIndex={elegida ? 0 : -1}
              ref={(el) => {
                botonesDeModalidad.current[clave] = el;
              }}
              onKeyDown={(e) => moverModalidad(e, clave)}
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
              {clave === "plus" && plusDisponible ? (
                <span className="crediscope-modalidad-nota">
                  {admin
                    ? "Si la persona no tiene una consulta de Equifax vigente, se hace y se cobra."
                    : "Si la persona no tiene una consulta de Equifax vigente, la hace un administrador (se cobra)."}
                </span>
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

      {confirmando ? (
        <div className="crediscope-equifax-confirmar" role="group" aria-labelledby="solicitud-confirmar-titulo" style={{ marginTop: 18 }}>
          <p id="solicitud-confirmar-titulo" className="crediscope-equifax-confirmar-titulo">
            <ShieldAlert size={18} aria-hidden="true" />
            Plus puede cobrar una consulta a Equifax
          </p>
          <p className="crediscope-muted">
            Si la persona ya tiene una consulta vigente, se usa sin volver a pagar. Si no, se consulta ahora y se cobra ({moneda(TARIFA_EQUIFAX_USD, 2)} por consulta).
            Queda registrado quién la pidió.
          </p>
          <div className="crediscope-equifax-confirmar-botones">
            <button type="button" className="crediscope-btn" onClick={crear} disabled={enviando}>
              {enviando ? "Creando la solicitud..." : "Sí, evaluar en Plus"}
            </button>
            <button type="button" className="crediscope-btn crediscope-btn-ghost" onClick={() => setConfirmadaPara(null)} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="crediscope-solicitud-acciones">
          <button type="submit" className="crediscope-btn crediscope-solicitud-evaluar" disabled={!listo || enviando}>
            {enviando ? "Creando la solicitud..." : `Evaluar en ${def.nombre}`}
          </button>
          <span className="crediscope-muted">
            {modalidad === "basico" ? "Consulta a la persona si no tiene un perfil de los últimos 7 días y le pide su recomendación al modelo." : "Consulta a la persona si hace falta, le pide su recomendación al modelo y calcula la cuota y la capacidad."}
          </span>
        </div>
      )}

      <section className="crediscope-card" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Solicitudes recientes</h3>
        {recientes === null ? (
          <Cargando />
        ) : errorRecientes ? (
          <AvisoDeError error={errorRecientes} alReintentar={() => {
              setRecientes(null);
              cargarRecientes();
            }} />
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
                {/* Decidida, lo que importa es lo que decidió la institución. */}
                <span>{r.decision ? NOMBRE_DE_LA_DECISION[r.decision] : (ESTADO_DE_LA_SOLICITUD[r.estado] ?? r.estado)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </form>
  );
}
