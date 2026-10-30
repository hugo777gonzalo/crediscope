import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bot, Calculator, CheckCircle2, Circle, Loader2, RotateCcw, XCircle } from "lucide-react";
import { evaluarSolicitud, getSolicitud, getSolicitudesDeLaPersona } from "../lib/api.js";
import { moneda, plural, porcentaje } from "../lib/formatos.js";
import { formatearFechaHora } from "../lib/fechas.js";
import { ETIQUETA_SEGMENTO } from "../lib/fuentesIngresoConsolidado.js";
import RecomendacionBadge from "../components/RecomendacionBadge.jsx";
import CuotaDestacada from "../components/credito/CuotaDestacada.jsx";
import VeredictoDeCapacidad from "../components/credito/VeredictoDeCapacidad.jsx";
import Aviso from "../components/ui/Aviso.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import DecisionDeLaSolicitud from "../components/credito/DecisionDeLaSolicitud.jsx";
import EstadoDeLaPersona from "../components/persona/EstadoDeLaPersona.jsx";
import { MODALIDADES, NOMBRE_DEL_PASO } from "../../supabase/functions/_shared/modalidades.ts";
import { estadoDeLaPersona, hechosDeLaFila } from "../../supabase/functions/_shared/estado-de-la-persona.ts";
import { simularCredito } from "../../supabase/functions/_shared/simulador-credito.ts";

// Una solicitud y su evaluación (133). Mientras está «en evaluación», la
// pantalla le pide al servidor el paso siguiente hasta que no quede ninguno:
// cada llamada corre uno (evaluar-solicitud). Si se cierra la pestaña, la
// evaluación sigue donde quedó la próxima vez que alguien la abra.
//
// Lo que dice el modelo y lo que dicen los números van en dos tarjetas, sin
// combinarse en una decisión (negocio, 2026-10-17).

const ICONO_DEL_PASO = {
  pendiente: { Icono: Circle, clase: "crediscope-paso-pendiente", texto: "Pendiente" },
  en_curso: { Icono: Loader2, clase: "crediscope-paso-en_curso", texto: "En curso" },
  hecho: { Icono: CheckCircle2, clase: "crediscope-paso-hecho", texto: "Hecho" },
  fallido: { Icono: XCircle, clase: "crediscope-paso-fallido", texto: "No se completó" },
};


export default function Solicitud() {
  const { id } = useParams();
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [noExiste, setNoExiste] = useState(false);
  const [avanzando, setAvanzando] = useState(false);
  // Las otras solicitudes de la persona: su estado lo decide la última (estado-de-la-persona.ts).
  const [otras, setOtras] = useState(null);
  const vigente = useRef(true);

  // Avanza de a un paso mientras quede alguno pendiente y la pantalla siga abierta.
  const avanzar = useCallback(async (inicial) => {
    let actual = inicial;
    setAvanzando(true);
    try {
      for (let vuelta = 0; vuelta < 8 && vigente.current && actual?.estado === "en_evaluacion"; vuelta++) {
        // Marca el próximo paso como en curso en la pantalla mientras corre.
        const proximo = actual.pasos.find((p) => p.estado === "pendiente");
        if (proximo) setS({ ...actual, pasos: actual.pasos.map((p) => (p === proximo ? { ...p, estado: "en_curso" } : p)) });
        const nuevo = await evaluarSolicitud({ accion: "avanzar", id: actual.id });
        if (!vigente.current) return;
        const sinCambios = JSON.stringify(nuevo.pasos) === JSON.stringify(actual.pasos);
        actual = nuevo;
        setS(nuevo);
        // Otro lo está corriendo (otra pestaña): esperar y volver a mirar.
        if (sinCambios) await new Promise((r) => setTimeout(r, 4000));
      }
    } catch (err) {
      if (vigente.current) setError(err);
    } finally {
      if (vigente.current) setAvanzando(false);
    }
  }, []);

  useEffect(() => {
    vigente.current = true;
    getSolicitud(id)
      .then((fila) => {
        if (!vigente.current) return;
        // Sin fila no es un error de red: la dirección está mal o la RLS no la deja ver.
        if (!fila) return setNoExiste(true);
        setS(fila);
        // Una evaluación de la API la hace avanzar el trabajador (137): si la pantalla
        // también tomara pasos, un analista que no es admin fallaría el del buró.
        if (fila.estado === "en_evaluacion" && fila.origen !== "api") avanzar(fila);
        // Sin las otras, el estado de la persona no se muestra: mejor nada que uno equivocado.
        getSolicitudesDeLaPersona(fila.identificacion)
          .then((filas) => vigente.current && setOtras(filas))
          .catch(() => {});
      })
      .catch(setError);
    return () => {
      vigente.current = false;
    };
  }, [id, avanzar]);

  async function reintentar() {
    setError(null);
    try {
      const fila = await evaluarSolicitud({ accion: "reintentar", id });
      setS(fila);
      avanzar(fila);
    } catch (err) {
      setError(err);
    }
  }

  // La tabla mes a mes no se guarda: se rehace con las mismas condiciones y el mismo simulador.
  const simulacion = useMemo(() => {
    if (!s?.monto) return null;
    const r = simularCredito({ monto: Number(s.monto), plazoMeses: s.plazo_meses, tasaNominalAnualPorcentaje: Number(s.tasa_nominal_anual), sistema: s.sistema, desgravamen: s.desgravamen });
    return r.ok ? r.simulacion : null;
  }, [s?.monto, s?.plazo_meses, s?.tasa_nominal_anual, s?.sistema, s?.desgravamen]);

  // Esta solicitud con lo último que se sabe de ella (avanza y se decide en la pantalla), y las demás como se leyeron.
  const estadoPersona = useMemo(() => {
    if (!s || !otras) return null;
    return estadoDeLaPersona([...otras.filter((o) => o.id !== s.id).map(hechosDeLaFila), hechosDeLaFila(s)]).estado;
  }, [s, otras]);

  if (error && !s) return <AvisoDeError error={error} />;
  if (noExiste) {
    return (
      <Aviso tipo="informacion" titulo="No encontramos esta solicitud">
        <p style={{ margin: 0 }}>
          Puede que la dirección esté mal o que no tengas permiso para verla. <Link to="/solicitud/nueva">Volvé a Nueva solicitud</Link> para ver las
          recientes.
        </p>
      </Aviso>
    );
  }
  if (!s) return <Cargando />;

  const def = MODALIDADES[s.modalidad];
  const r = s.resultado ?? {};
  const fallido = s.pasos.find((p) => p.estado === "fallido");

  const listaDePasos = (
    <ol className="crediscope-pasos">
      {s.pasos.map((p) => {
        const { Icono, clase, texto } = ICONO_DEL_PASO[p.estado] ?? ICONO_DEL_PASO.pendiente;
        return (
          <li key={p.paso} className={`crediscope-paso ${clase}`}>
            <Icono size={20} aria-hidden="true" className="crediscope-paso-icono" />
            <div>
              <p className="crediscope-paso-nombre">
                {NOMBRE_DEL_PASO[p.paso]} <span className="crediscope-solo-lectores">({texto})</span>
              </p>
              {p.detalle ? <p className="crediscope-paso-detalle">{p.detalle}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div>
      <p>
        <Link to="/solicitud/nueva" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Nueva solicitud
        </Link>
      </p>

      <div className="crediscope-card crediscope-solicitud-cabecera">
        <div>
          <p className="crediscope-capacidad-maximo-etiqueta">Solicitud · {def.nombre}</p>
          <p className="crediscope-solicitud-titulo">
            {s.monto ? `${moneda(Number(s.monto))} a ${plural(s.plazo_meses, "mes", "meses")} al ${porcentaje(Number(s.tasa_nominal_anual) / 100, 1)}` : "Sin condiciones de crédito"}
          </p>
          <p className="crediscope-muted" style={{ margin: 0 }}>
            Cédula {s.identificacion} · creada el {formatearFechaHora(s.creada_el)}
            {s.ingreso_declarado ? ` · Ingreso declarado ${moneda(Number(s.ingreso_declarado))}` : ""}
          </p>
          {estadoPersona ? (
            <p style={{ margin: "10px 0 0" }}>
              <EstadoDeLaPersona estado={estadoPersona} />
            </p>
          ) : null}
        </div>
        {s.client_id ? (
          <Link className="crediscope-btn crediscope-btn-ghost" to={`/solicitudes/${s.identificacion}`}>
            Ver el Expediente
          </Link>
        ) : null}
      </div>

      {/* Terminada, lo que importa es el resultado: los pasos se pliegan. En curso o con un fallo, a la vista. */}
      {s.estado === "evaluada" && !fallido ? (
        <details className="crediscope-card crediscope-plegable">
          <summary>Cómo se evaluó · {plural(s.pasos.length, "paso")}</summary>
          <div style={{ marginTop: 12 }}>
            {listaDePasos}
          </div>
        </details>
      ) : (
        <section className="crediscope-card">
          <h3 style={{ marginTop: 0 }}>Evaluación</h3>
          {listaDePasos}
          {avanzando ? <p className="crediscope-credito-ayuda">Consultar a la persona y al modelo puede tardar uno o dos minutos por paso.</p> : null}
        </section>
      )}

      {fallido ? (
        <Aviso tipo="peligro" titulo={`No se completó: ${NOMBRE_DEL_PASO[fallido.paso]}`}>
          <p style={{ margin: "0 0 10px" }}>{fallido.detalle}</p>
          {s.origen !== "api" ? (
            <button type="button" className="crediscope-btn" onClick={reintentar}>
              <RotateCcw size={15} aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }} />
              Reintentar
            </button>
          ) : null}
        </Aviso>
      ) : null}
      {error && s ? <AvisoDeError error={error} /> : null}

      <div className="crediscope-solicitud-resultados">
        {r.analisis ? (
          <section className="crediscope-card">
            <h3 className="crediscope-capacidad-subtitulo">
              <Bot size={17} aria-hidden="true" />
              Lo que dice el modelo
            </h3>
            {r.analisis.score !== null && r.analisis.score !== undefined ? (
              <div className="crediscope-solicitud-modelo">
                <span className="crediscope-solicitud-score">{r.analisis.score}</span>
                <div>
                  <p className="crediscope-muted" style={{ margin: "0 0 6px" }}>
                    Score de 1 a 999
                  </p>
                  <RecomendacionBadge recomendacion={r.analisis.recomendacion} />
                </div>
              </div>
            ) : (
              <p style={{ margin: 0 }}>El modelo no dio una recomendación esta vez.</p>
            )}
            {r.analisis.veredictoOrigen === "control_bloqueo" ? (
              <p className="crediscope-credito-ayuda">Lo negó un control fijo (por ejemplo, una lista de control), no el modelo.</p>
            ) : null}
            <p className="crediscope-capacidad-origen">
              Es una recomendación: la decisión la toma una persona de la institución.{" "}
              <Link to={`/analisis/${s.identificacion}`}>Ver el análisis completo</Link>
            </p>
          </section>
        ) : null}

        {r.perfil ? (
          <section className="crediscope-card">
            <h3 className="crediscope-capacidad-subtitulo">Perfil y fuentes de ingreso</h3>
            <div className="crediscope-capacidad-lista">
              <div className="crediscope-capacidad-fila">
                <span>Segmento</span>
                <span>{r.perfil.segmento ? (ETIQUETA_SEGMENTO[r.perfil.segmento] ?? r.perfil.segmento) : "—"}</span>
              </div>
              <div className="crediscope-capacidad-fila">
                <span>Ingreso reportado al IESS</span>
                <span>{r.perfil.ingresoReportadoIess ? moneda(r.perfil.ingresoReportadoIess, 2) : "Sin ingreso reportado"}</span>
              </div>
            </div>
            <p className="crediscope-capacidad-origen">
              Perfil del {formatearFechaHora(r.perfil.perfilDel)}
              {r.perfil.reutilizado ? " (se reutilizó)" : ""}. <Link to={`/ingresos/${s.identificacion}`}>Ver Fuentes de Ingreso</Link>
            </p>
          </section>
        ) : null}
      </div>

      {r.capacidad ? (
        <>
          <h3 className="crediscope-capacidad-subtitulo" style={{ margin: "8px 0 12px" }}>
            <Calculator size={17} aria-hidden="true" />
            Lo que dicen los números
          </h3>
          <div className="crediscope-credito-grid">
            {simulacion ? <CuotaDestacada simulacion={simulacion} titulo="Cuota del crédito pedido" /> : <div />}
            <VeredictoDeCapacidad capacidad={r.capacidad.capacidad} soloIess={r.capacidad.capacidadSoloIess} />
          </div>
          {r.capacidad.capacidad.veredicto !== "sin_ingreso" && r.capacidad.montoMaximo ? (
            <p className="crediscope-credito-ayuda">
              Con el mismo plazo y la misma tasa, le alcanzaría hasta {moneda(Math.floor(r.capacidad.montoMaximo))}.{" "}
              <Link to={`/capacidad/${s.identificacion}`}>Ver el detalle de la capacidad de pago</Link>
            </p>
          ) : null}
          {r.buro ? (
            <p className="crediscope-capacidad-origen">
              Cuotas del buró Equifax, consulta del {formatearFechaHora(r.buro.consultadoEl)}
              {r.buro.reutilizada ? " (se reutilizó)" : ""}.
            </p>
          ) : null}
        </>
      ) : null}

      <DecisionDeLaSolicitud solicitud={s} alDecidir={setS} />
    </div>
  );
}
