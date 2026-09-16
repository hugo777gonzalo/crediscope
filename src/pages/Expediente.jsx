import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  IdCard,
  Wallet,
  Sparkles,
  ClipboardList,
  History,
  Eye,
  FileSearch,
} from "lucide-react";
import { getExpediente, getSegmentConfig } from "../lib/api.js";
import { useSession } from "../lib/useSession.js";
import { useProfile } from "../lib/useProfile.js";
import { setUltimaCedula } from "../lib/ultimaCedula.js";
import { nombreCorto } from "../lib/perfilClienteCampos.js";
import { ETIQUETA_SEGMENTO, ETIQUETA_ESTADO, ETIQUETA_EVIDENCIA, RIESGO_SEGMENTO, formatMoneda } from "../lib/fuentesIngresoConsolidado.js";
import { formatearFechaHora, haceCuanto } from "../lib/fechas.js";
import { ETIQUETA_FALLO } from "../lib/consumoLlm.js";
import { colorScore, colorRecomendacion, textoRecomendacion } from "../lib/bandeja.js";
import { rutaDeRegreso } from "../lib/regresoBandeja.js";
import SegmentosPerfil from "../components/SegmentosPerfil.jsx";
import AnalisisResultado from "../components/AnalisisResultado.jsx";
import ListaControlPanel from "../components/ListaControlPanel.jsx";

// El expediente: todo lo que se sabe de una persona, en una pantalla.
//
// Tiene URL propia (/solicitudes/:cedula) y no es una ventana emergente:
// se puede pegar en un chat, abrir tres en pestañas y recargar sin
// perderlo. Recargar importa -- era justo el 404 que aparecía al volver
// al día siguiente.
//
// El orden de las secciones no es arbitrario: va de lo que decide a lo
// que respalda. Resumen (¿hay que preocuparse?), ingreso (¿con qué
// paga?), perfil (¿qué más se sabe?), dictamen (¿qué dijo el modelo?),
// línea de tiempo (¿qué pasó con este caso?) y auditoría (¿quién vio
// esto?). Un analista apurado lee las dos primeras y cierra; uno que
// tiene que sustentar una negación baja hasta el final.
//
// Crece por secciones: cuando exista la solicitud, capacidad de pago y
// decisión entran como dos secciones más y ninguna de las de acá cambia.

const SECCIONES = [
  { id: "resumen", texto: "Resumen", Icono: ClipboardList },
  { id: "ingresos", texto: "Fuentes de Ingreso", Icono: Wallet },
  { id: "perfil", texto: "Perfil del Cliente", Icono: IdCard },
  { id: "analisis", texto: "Análisis con IA", Icono: Sparkles },
  { id: "tiempo", texto: "Línea de tiempo", Icono: History },
  { id: "auditoria", texto: "Auditoría", Icono: Eye },
];

const ETIQUETA_ACCION = {
  "client.structure": "Consulta a la fuente de datos",
  "client.analyze": "Análisis con IA",
  "client.view": "Consulta del perfil",
  "lote.consulta": "Consulta dentro de una corrida por lote",
  "lote.reutiliza": "Perfil reutilizado por una corrida por lote",
};

export default function Expediente() {
  const { cedula } = useParams();
  const { session } = useSession();
  const { profile: miPerfil } = useProfile();

  const [datos, setDatos] = useState(null);
  const [segmentConfig, setSegmentConfig] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [seccionActiva, setSeccionActiva] = useState("resumen");

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    Promise.all([getExpediente(cedula), getSegmentConfig()])
      .then(([exp, segmentos]) => {
        if (!vigente) return;
        setDatos(exp);
        setSegmentConfig(segmentos);
      })
      .catch((err) => vigente && setError(err.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [cedula]);

  useEffect(() => {
    setUltimaCedula(cedula);
  }, [cedula]);

  // Cuál sección se está mirando, para marcarla en la navegación. Con
  // seis secciones y el perfil ocupando pantallas enteras, sin esto uno
  // pierde de vista dónde está parado.
  const observarSeccion = useCallback((nodo) => {
    if (!nodo) return undefined;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setSeccionActiva(e.target.id);
        }
      },
      // El margen inferior negativo hace que una sección cuente como
      // "activa" recién cuando llega al tercio superior: si no, la de
      // abajo se marca apenas asoma.
      { rootMargin: "0px 0px -66% 0px", threshold: 0 },
    );
    obs.observe(nodo);
    return () => obs.disconnect();
  }, []);

  const hitos = useMemo(() => construirLineaDeTiempo(datos), [datos]);

  if (cargando) return <p className="crediscope-muted">Cargando el expediente...</p>;

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );

  if (!datos)
    return (
      <div className="crediscope-card">
        <p style={{ margin: 0 }}>
          No hay registro de la cédula <strong>{cedula}</strong>. Nunca se la consultó, o se la escribió distinto.
        </p>
        <p style={{ margin: "12px 0 0" }}>
          <Link className="crediscope-btn crediscope-btn-ghost" to={rutaDeRegreso()}>
            Volver a la bandeja
          </Link>
        </p>
      </div>
    );

  const { cabecera, perfil, analisis, consultas, analisisPrevios, auditoria } = datos;
  const sp = perfil?.standard_profile ?? null;
  const f = sp?.fuentesIngreso ?? null;
  const hallazgos = perfil?.control_bloqueo?.hallazgos ?? [];
  const nombre = nombreCorto(sp?.identidad?.nombreCompleto) ?? "Sin nombre en la fuente";
  const meta = sp?.metaConsulta ?? null;

  return (
    <div>
      <div className="crediscope-exp-cabecera">
        <div className="crediscope-exp-migas">
          <Link className="crediscope-exp-volver" to={rutaDeRegreso()}>
            <ArrowLeft size={16} /> Volver a la bandeja
          </Link>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="crediscope-btn crediscope-btn-ghost" to={`/perfil/${cedula}`}>
              Perfil del Cliente
            </Link>
            <Link className="crediscope-btn" to={`/analisis/${cedula}`}>
              <Sparkles size={15} style={{ marginRight: 7, verticalAlign: "-3px" }} />
              Análisis con IA
            </Link>
          </div>
        </div>

        <div className="crediscope-exp-identidad">
          <h2>{nombre}</h2>
          <span className="crediscope-exp-cedula">{cedula}</span>
          {cabecera?.perfil_origen === "lote" ? <span className="crediscope-sello-lote">De lote</span> : null}
        </div>

        {/* Los sellos contestan en dos segundos si hay que preocuparse.
            El color aparece solo cuando el valor lo amerita: si todo se
            pinta, nada resalta. */}
        <div className="crediscope-sellos">
          <Sello etiqueta="Puntaje" valor={analisis && !analisis.fallo ? analisis.crediscope_score : "—"} color={analisis && !analisis.fallo ? colorScore(analisis.crediscope_score) : null} />
          <Sello
            etiqueta="Recomendación"
            valor={textoRecomendacion(analisis?.recomendacion) ?? "Sin dictamen"}
            color={analisis?.recomendacion ? colorRecomendacion(analisis.recomendacion) : null}
          />
          <Sello etiqueta="Fuente de ingreso" valor={f?.segmento ? (ETIQUETA_SEGMENTO[f.segmento] ?? f.segmento) : "Sin clasificar"} />
          <Sello etiqueta="Piso de ingreso" valor={f?.pisoIngresoMensualReportado ? formatMoneda(f.pisoIngresoMensualReportado) : "—"} />
          <Sello
            etiqueta="Listas de control"
            valor={hallazgos.length ? `${hallazgos.length} hallazgo${hallazgos.length > 1 ? "s" : ""}` : "Sin hallazgos"}
            color={hallazgos.some((h) => h.bloqueante) ? "var(--bad)" : hallazgos.length ? "var(--warn)" : "var(--good)"}
          />
          <Sello etiqueta="Última consulta" valor={haceCuanto(perfil?.created_at)} />
        </div>
      </div>

      <div className="crediscope-exp-grid">
        <nav className="crediscope-exp-nav">
          {SECCIONES.map(({ id, texto, Icono }) => (
            <a key={id} href={`#${id}`} className={seccionActiva === id ? "crediscope-exp-nav-activo" : ""}>
              <Icono size={15} />
              <span>{texto}</span>
              {id === "tiempo" ? <span className="crediscope-exp-nav-cuenta">{hitos.length}</span> : null}
              {id === "auditoria" ? <span className="crediscope-exp-nav-cuenta">{auditoria.length}</span> : null}
            </a>
          ))}
        </nav>

        <div>
          {/* ---------- RESUMEN ---------- */}
          <section id="resumen" className="crediscope-exp-seccion" ref={observarSeccion}>
            <h3 className="crediscope-exp-titulo">Lo que decide este caso</h3>

            <div className="crediscope-veredictos">
              <Veredicto
                rot="Nivel de riesgo"
                valor={analisis?.indicador_riesgo ? capitalizar(analisis.indicador_riesgo) : "Sin evaluar"}
                pie={analisis?.rules_version ?? "todavía no se corrió el análisis"}
                color={analisis?.indicador_riesgo ? colorRiesgo(analisis.indicador_riesgo) : null}
              />
              <Veredicto
                rot="Historial crediticio"
                valor={analisis?.indicador_historial ? capitalizar(analisis.indicador_historial) : "Sin evaluar"}
                pie="Según bancos, cooperativas y BIESS"
                color={analisis?.indicador_historial ? colorHistorial(analisis.indicador_historial) : null}
              />
              <Veredicto
                rot="Evidencia del ingreso"
                valor={f?.estadoSegmento ? (ETIQUETA_ESTADO[f.estadoSegmento] ?? f.estadoSegmento) : "—"}
                pie={f?.segmento ? RIESGO_SEGMENTO[f.segmento] : null}
                color={f?.estadoSegmento === "confirmada" ? "var(--good)" : f?.estadoSegmento === "provisional" ? "var(--warn)" : null}
              />
              <Veredicto
                rot="Empleos vigentes"
                valor={(sp?.laboral?.empleosActuales?.length ?? (sp?.laboral?.empleoActual ? 1 : 0)) || "Ninguno"}
                pie={sp?.laboral?.antiguedadEmpleoActualMeses ? `${sp.laboral.antiguedadEmpleoActualMeses} meses de antigüedad` : null}
              />
              <Veredicto rot="Veces consultada" valor={consultas.length} pie={`${analisisPrevios.length} análisis corridos`} />
            </div>

            {/* Qué respondió la fuente y qué no. No es información de la
                persona: es si el expediente está completo -- y decidir
                sobre un expediente con dos ejes en blanco sin saberlo es
                distinto de decidir sobre uno completo. */}
            {meta ? (
              <p className="crediscope-muted" style={{ marginTop: 0 }}>
                La fuente respondió <strong>{meta.ejesOk?.length ?? 0}</strong> ejes
                {meta.ejesFaltantes?.length ? `, devolvió ${meta.ejesFaltantes.length} vacíos` : ""}
                {meta.ejesConError?.length ? ` y falló en ${meta.ejesConError.length}` : ""}.
                {meta.ejesFaltantes?.length || meta.ejesConError?.length
                  ? ` Sin dato: ${[...(meta.ejesFaltantes ?? []), ...(meta.ejesConError ?? [])].join(", ")}.`
                  : ""}
              </p>
            ) : null}

            <ListaControlPanel controlBloqueo={perfil?.control_bloqueo} />

            {/* El hueco, dicho. Es lo primero que va a ocupar este lugar
                cuando exista la solicitud. */}
            <div className="crediscope-pendiente" style={{ marginTop: 12 }}>
              <p>
                <strong>Falta la capacidad de pago.</strong> Es la cuota contra el piso de ingreso, y es donde se decide un
                crédito. No se puede calcular todavía porque no hay monto ni plazo: eso llega con la solicitud como entidad.
              </p>
            </div>
          </section>

          {/* ---------- FUENTES DE INGRESO ---------- */}
          <section id="ingresos" className="crediscope-exp-seccion" ref={observarSeccion} style={{ marginTop: 28 }}>
            <h3 className="crediscope-exp-titulo">Con qué paga</h3>
            <SeccionIngresos f={f} laboral={sp?.laboral} />
          </section>

          {/* ---------- PERFIL ---------- */}
          <section id="perfil" className="crediscope-exp-seccion" ref={observarSeccion} style={{ marginTop: 28 }}>
            <h3 className="crediscope-exp-titulo">Todo lo recopilado</h3>
            {sp ? (
              // Plegado: ciento veinticinco campos planos esconden lo
              // importante adentro de lo irrelevante.
              <SegmentosPerfil standardProfile={sp} segmentConfig={segmentConfig} controlBloqueo={perfil?.control_bloqueo} collapsible mostrarAviso={false} />
            ) : (
              <p className="crediscope-muted">Todavía no se consultó la fuente de datos para esta persona.</p>
            )}
          </section>

          {/* ---------- ANÁLISIS ---------- */}
          <section id="analisis" className="crediscope-exp-seccion" ref={observarSeccion} style={{ marginTop: 28 }}>
            <h3 className="crediscope-exp-titulo">Qué dijo el modelo</h3>
            {analisis ? (
              <AnalisisResultado result={analisis} ocultarListaControl perfil={perfil} cedula={cedula} />
            ) : (
              <div className="crediscope-card">
                <p className="crediscope-muted" style={{ margin: 0 }}>
                  Esta persona todavía no tiene un Análisis con IA. Se corre desde{" "}
                  <Link to={`/analisis/${cedula}`}>Análisis con IA</Link>.
                </p>
              </div>
            )}
          </section>

          {/* ---------- LÍNEA DE TIEMPO ---------- */}
          <section id="tiempo" className="crediscope-exp-seccion" ref={observarSeccion} style={{ marginTop: 28 }}>
            <h3 className="crediscope-exp-titulo">Qué pasó con este caso</h3>
            <div className="crediscope-card">
              <div className="crediscope-tiempo">
                {/* El hito vacío del final no es un adorno: deja a la
                    vista que nadie registró nunca qué se decidió, que es
                    el dato que el módulo de retroalimentación está
                    esperando desde que se construyó. */}
                <div className="crediscope-hito crediscope-hito-pendiente">
                  <div className="crediscope-hito-cuando">Pendiente</div>
                  <p className="crediscope-hito-que" style={{ color: "var(--text-muted)" }}>
                    Decisión
                  </p>
                  <p className="crediscope-hito-quien">Nadie registró qué se resolvió con esta persona.</p>
                </div>

                {hitos.map((h) => (
                  <div key={h.clave} className="crediscope-hito">
                    <div className="crediscope-hito-cuando">{formatearFechaHora(h.cuando)}</div>
                    <p className="crediscope-hito-que" style={h.color ? { color: h.color } : undefined}>
                      {h.que}
                    </p>
                    {h.quien ? <p className="crediscope-hito-quien">{h.quien}</p> : null}
                    {h.enlace ? (
                      <div className="crediscope-hito-acciones">
                        <Link className="crediscope-btn crediscope-btn-ghost" style={{ padding: "3px 10px", fontSize: 12.5 }} to={h.enlace}>
                          <FileSearch size={13} style={{ marginRight: 5, verticalAlign: "-2px" }} />
                          Ver como quedó ese día
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ---------- AUDITORÍA ---------- */}
          <section id="auditoria" className="crediscope-exp-seccion" ref={observarSeccion} style={{ marginTop: 28 }}>
            <h3 className="crediscope-exp-titulo">Quién vio esta información</h3>
            <div className="crediscope-card">
              <p className="crediscope-muted" style={{ marginTop: 0 }}>
                Los datos de esta pantalla incluyen Fiscalía, Función Judicial y comportamiento bancario. Cada acceso queda
                registrado — es lo que permite responder quién vio qué, y cuándo.
              </p>
              {auditoria.length === 0 ? (
                <p className="crediscope-muted" style={{ margin: 0 }}>Sin registros.</p>
              ) : (
                <table className="crediscope-table">
                  <thead>
                    <tr>
                      <th>Cuándo</th>
                      <th>Qué</th>
                      <th>Quién</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditoria.map((a) => (
                      <tr key={a.id}>
                        <td className="crediscope-num">{formatearFechaHora(a.created_at)}</td>
                        <td>{ETIQUETA_ACCION[a.action] ?? a.action}</td>
                        <td>{quienEs(a.actor, session?.user?.id, miPerfil?.nombre_corto)}</td>
                        <td className="crediscope-muted">{detalleAuditoria(a.meta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Limitación real, dicha donde se nota. */}
              <div className="crediscope-pendiente" style={{ marginTop: 14 }}>
                <p>
                  <strong>Los demás usuarios salen como «otro usuario».</strong> La política de la base deja que cada quien lea
                  solo su propia ficha, así que el nombre de otro no se puede resolver desde el navegador. Para nombrarlos hace
                  falta exponer una vista con los nombres — decisión pendiente, porque toca permisos.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------- piezas ----------

function Sello({ etiqueta, valor, color }) {
  return (
    <div className="crediscope-sello">
      <span className="crediscope-sello-etiqueta">{etiqueta}</span>
      <span className="crediscope-sello-valor" style={color ? { color } : undefined}>
        {valor}
      </span>
    </div>
  );
}

function Veredicto({ rot, valor, pie, color }) {
  return (
    <div className="crediscope-veredicto" style={color ? { borderTopColor: color } : undefined}>
      <p className="crediscope-veredicto-rot">{rot}</p>
      <p className="crediscope-veredicto-valor" style={color ? { color } : undefined}>
        {valor}
      </p>
      {pie ? <p className="crediscope-veredicto-pie">{pie}</p> : null}
    </div>
  );
}

function SeccionIngresos({ f, laboral }) {
  if (!f?.segmento)
    return (
      <div className="crediscope-card">
        <p className="crediscope-muted" style={{ margin: 0 }}>Sin clasificación de fuentes de ingreso para esta persona.</p>
      </div>
    );

  const fuentes = f.fuentes ?? [];
  const empleos = laboral?.empleosActuales ?? (laboral?.empleoActual ? [laboral.empleoActual] : []);

  return (
    <div className="crediscope-card">
      <div className="crediscope-pares" style={{ marginBottom: 14 }}>
        <Par etiqueta="Segmento" valor={ETIQUETA_SEGMENTO[f.segmento] ?? f.segmento} />
        <Par etiqueta="Clasificación" valor={ETIQUETA_ESTADO[f.estadoSegmento] ?? f.estadoSegmento} />
        <Par etiqueta="Piso de ingreso reportado" valor={f.pisoIngresoMensualReportado ? formatMoneda(f.pisoIngresoMensualReportado) : "—"} />
        <Par etiqueta="Corte del IESS usado" valor={f.corteIessUsado ?? "—"} />
        <Par etiqueta="Aparece en el último corte" valor={f.apareceEnUltimoCorte === null ? "—" : f.apareceEnUltimoCorte ? "Sí" : "No"} />
        <Par etiqueta="Empleadores activos (24m)" valor={laboral?.numeroEmpleadoresUltimos24Meses ?? "—"} />
      </div>

      {/* Por qué quedó en ese segmento. Sin esto, discutir una
          clasificación con el área de crédito es discutir contra una
          caja negra. */}
      {f.motivoSegmento ? (
        <p style={{ margin: "0 0 14px", fontSize: 13.5 }}>
          <span className="crediscope-muted">Por qué: </span>
          {f.motivoSegmento}
        </p>
      ) : null}

      {f.corteDesactualizado ? (
        <p style={{ color: "var(--warn)", fontSize: 13.5, margin: "0 0 14px" }}>
          El corte del IESS que usó esta clasificación quedó atrás del más reciente de la cartera.
        </p>
      ) : null}

      {empleos.length > 0 ? (
        <>
          <h4 style={{ fontSize: 13.5, margin: "0 0 6px" }}>Empleos vigentes</h4>
          <table className="crediscope-table" style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th>Empleador</th>
                <th>Cargo</th>
                <th style={{ textAlign: "right" }}>Salario aproximado</th>
              </tr>
            </thead>
            <tbody>
              {empleos.map((e, i) => (
                <tr key={i}>
                  <td className="crediscope-celda-fuerte">{e.empleador ?? "—"}</td>
                  <td>{e.cargo ?? "—"}</td>
                  <td style={{ textAlign: "right" }} className="crediscope-num">
                    {e.salarioAprox ? formatMoneda(e.salarioAprox) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {fuentes.length > 0 ? (
        <>
          <h4 style={{ fontSize: 13.5, margin: "0 0 6px" }}>Fuentes detectadas</h4>
          <table className="crediscope-table" style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Origen</th>
                <th>Evidencia</th>
                <th style={{ textAlign: "right" }}>Monto reportado</th>
                <th>Vigente</th>
              </tr>
            </thead>
            <tbody>
              {fuentes.map((fu, i) => (
                <tr key={i}>
                  <td>
                    <span className="crediscope-celda-fuerte">{fu.tipo}</span>
                    {fu.detalle ? <span className="crediscope-celda-sub">{fu.detalle}</span> : null}
                  </td>
                  <td>{fu.empleador ?? "—"}</td>
                  <td>{ETIQUETA_EVIDENCIA[fu.evidencia] ?? fu.evidencia ?? "—"}</td>
                  <td style={{ textAlign: "right" }} className="crediscope-num">
                    {fu.montoMensualReportado ? formatMoneda(fu.montoMensualReportado) : "—"}
                  </td>
                  <td style={{ color: fu.vigenteAlCorte ? "var(--good)" : "var(--text-muted)" }}>{fu.vigenteAlCorte ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {(f.senalesDeEscala ?? []).length > 0 ? (
        <>
          <h4 style={{ fontSize: 13.5, margin: "0 0 6px" }}>Señales de escala</h4>
          <ul className="crediscope-list" style={{ fontSize: 13.5, marginBottom: 14 }}>
            {f.senalesDeEscala.map((s, i) => (
              <li key={i}>
                <strong>{s.senal}</strong>
                {s.valor !== null && s.valor !== undefined ? `: ${s.valor}` : ""} — {s.detalle}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {(f.paraConfirmar ?? []).length > 0 ? (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <h4 style={{ fontSize: 13.5, margin: "0 0 6px" }}>Qué pedirle al cliente</h4>
          <ul className="crediscope-list" style={{ fontSize: 13.5, margin: 0 }}>
            {f.paraConfirmar.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Par({ etiqueta, valor }) {
  return (
    <div className="crediscope-par">
      <span className="crediscope-par-etiqueta">{etiqueta}</span>
      <span className="crediscope-par-valor">{valor}</span>
    </div>
  );
}

// ---------- datos ----------

// La línea de tiempo se arma con las consultas y los análisis, no con
// el registro de auditoría. Los dos guardan lo mismo -- cada consulta
// deja también su fila de auditoría -- y mezclarlos duplicaba cada
// evento. La auditoría tiene su propia sección y contesta otra
// pregunta: quién accedió, no qué pasó.
function construirLineaDeTiempo(datos) {
  if (!datos) return [];

  const deConsultas = (datos.consultas ?? []).map((c) => ({
    clave: `perfil-${c.id}`,
    cuando: c.created_at,
    que: c.origen === "lote" ? "Consulta dentro de una corrida por lote" : "Consulta a la fuente de datos",
    quien: [
      c.structure_version,
      c.fuente_segmento ? `${ETIQUETA_SEGMENTO[c.fuente_segmento] ?? c.fuente_segmento}` : null,
      c.fuente_piso_ingreso ? `piso ${formatMoneda(Number(c.fuente_piso_ingreso))}` : null,
      c.duracion_ms ? `${(c.duracion_ms / 1000).toFixed(1)} s` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    enlace: `/historial/perfil/${c.id}`,
  }));

  const deAnalisis = (datos.analisisPrevios ?? []).map((a) => ({
    clave: `analisis-${a.id}`,
    cuando: a.created_at,
    que: a.fallo_tipo ? "Análisis con IA — no se completó" : "Análisis con IA",
    color: a.fallo_tipo ? "var(--bad)" : undefined,
    quien: a.fallo_tipo
      ? `${ETIQUETA_FALLO[a.fallo_tipo] ?? "falla sin clasificar"} · ${a.rules_version}`
      : [
          `puntaje ${a.crediscope_score}`,
          textoRecomendacion(a.recomendacion),
          a.rules_version,
          a.veredicto_origen === "control_bloqueo" ? "decidió un control de bloqueo, no el modelo" : null,
        ]
          .filter(Boolean)
          .join(" · "),
    enlace: `/historial/analisis/${a.id}`,
  }));

  // El alta cierra la línea por abajo: es cuándo esta persona entró al
  // sistema. Sin este hito, la línea empieza en la primera consulta y
  // no se distingue "entró y se la consultó el mismo día" de "estaba
  // cargada hace meses y recién ahora alguien la miró".
  const alta = datos.client ? [{ clave: "alta", cuando: datos.client.created_at, que: "Primera vez en el sistema" }] : [];

  return [...deConsultas, ...deAnalisis, ...alta].sort((a, b) => new Date(b.cuando) - new Date(a.cuando));
}

// Hasta que exista una vista con los nombres, solo se puede nombrar a
// quien está mirando. Decir "otro usuario" es peor que decir un nombre,
// pero mucho mejor que inventarlo.
function quienEs(actor, miId, miNombre) {
  if (!actor) return "Proceso automático";
  if (actor === miId) return miNombre ?? "Vos";
  return "Otro usuario";
}

function detalleAuditoria(meta) {
  if (!meta || typeof meta !== "object") return "—";
  const partes = [];
  if (meta.lote_id) partes.push("corrida por lote");
  if (meta.score) partes.push(`puntaje ${meta.score}`);
  if (meta.fallo_tipo) partes.push(ETIQUETA_FALLO[meta.fallo_tipo] ?? meta.fallo_tipo);
  if (meta.origen) partes.push(String(meta.origen));
  return partes.length ? partes.join(" · ") : "—";
}

function capitalizar(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function colorRiesgo(nivel) {
  if (nivel === "muy bajo" || nivel === "bajo") return "var(--good)";
  if (nivel === "moderado") return "var(--warn)";
  return "var(--bad)";
}

function colorHistorial(nivel) {
  if (nivel === "excelente" || nivel === "bueno") return "var(--good)";
  if (nivel === "regular") return "var(--warn)";
  if (nivel === "sin historial") return "var(--text-muted)";
  return "var(--bad)";
}
