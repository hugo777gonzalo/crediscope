import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Save } from "lucide-react";
import { getPropuestas, guardarPropuesta, cambiarEstadoPropuesta, ponerEnVigencia, getCorte, getResultados } from "../lib/laboratorio.js";
import { formatearFechaHora } from "../lib/fechas.js";
import {
  Volver, MensajeError, Etiqueta, FranjaSintetica, ETIQUETA_TIPO_PROPUESTA, ETIQUETA_ESTADO_PROPUESTA, dec, pct,
} from "../components/laboratorio/Comunes.jsx";

// Propuestas de ajuste (diseño, 6.7). Ninguna entra sola al motor:
// aprobar y aplicar son pasos distintos, y cada tipo entra por su camino.
// Sólo un ajuste del criterio se pone en vigencia desde acá (lo versiona
// criterio_versiones y se puede revertir); un cambio de marco, de dato o
// de política se aplica con una versión nueva, y acá se anota cuál.

const VACIA = { titulo: "", tipo: "ajuste_criterio", hallazgo: "", cambio_propuesto: "", limitaciones: "", validacion_posterior: "", impacto: "" };

const AYUDA_TIPO = {
  ajuste_criterio: "Un texto que se suma al marco como ajuste aprobado. Entra al criterio vigente y se puede revertir.",
  cambio_marco: "Cambia cómo el modelo lee algo. Se aplica con una versión nueva del marco (código).",
  regla_politica: "Qué hace la IFI con el riesgo (negar si...). Hoy es una recomendación a la IFI; mañana, la capa de política.",
  dato_nuevo: "Una variable que el modelo no recibe y anticipa el impago. Se aplica con una versión nueva de la estructura.",
};

// La evidencia: lo último calculado sobre el corte, con su tamaño.
function evidenciaDe(resultados) {
  return resultados.slice(0, 6).map((r) => ({
    resultado_id: r.id,
    tipo: r.tipo,
    calculado: r.created_at,
    n: r.n,
    n_malos: r.n_malos,
    resumen:
      r.tipo === "desempeno" ? `AUC ${dec(r.resultado.auc, 3)}, KS ${dec(r.resultado.ks, 3)}`
      : r.tipo === "simulacion_politica" ? `${r.resultado.regla?.nombre}: evita ${r.resultado.malos_evitados} malos, pierde ${r.resultado.buenos_perdidos} buenos`
      : r.tipo === "variables" ? `Más fuerte: ${r.resultado.variables?.[0]?.nombre} (IV ${dec(r.resultado.variables?.[0]?.iv, 3)})`
      : r.tipo,
  }));
}

function Formulario({ inicial, corte, alGuardar, alCancelar }) {
  const [p, setP] = useState(inicial);
  const [error, setError] = useState(null);
  const campo = (k) => ({ value: p[k] ?? "", onChange: (e) => setP({ ...p, [k]: e.target.value }) });

  async function guardar() {
    setError(null);
    try {
      const fila = {
        id: p.id, titulo: p.titulo.trim(), tipo: p.tipo, hallazgo: p.hallazgo.trim(),
        cambio_propuesto: p.cambio_propuesto?.trim() || null, limitaciones: p.limitaciones?.trim() || null,
        validacion_posterior: p.validacion_posterior?.trim() || null,
        impacto_estimado: p.impacto?.trim() ? { texto: p.impacto.trim() } : p.impacto_estimado ?? null,
        corte_id: p.corte_id ?? corte?.id ?? null, evidencia: p.evidencia ?? [], es_sintetica: p.es_sintetica ?? Boolean(corte?.es_sintetico),
      };
      if (!fila.id) delete fila.id;
      await alGuardar(fila);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="crediscope-card" style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>{p.id ? "Editar propuesta" : "Nueva propuesta"}</h3>
      {corte ? (
        <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>
          Sobre el corte <strong>{corte.nombre}</strong>; se adjunta como evidencia lo último calculado en él ({(p.evidencia ?? []).length} resultados).
        </p>
      ) : null}
      {p.es_sintetica ? <FranjaSintetica que="Los datos de esta propuesta" /> : null}
      <input className="crediscope-input" placeholder="Título" {...campo("titulo")} />
      <label>
        <select className="crediscope-input" {...campo("tipo")}>
          {Object.entries(ETIQUETA_TIPO_PROPUESTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <div className="crediscope-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{AYUDA_TIPO[p.tipo]}</div>
      </label>
      <textarea className="crediscope-input" rows={3} placeholder="Hallazgo: qué se vio, en palabras del negocio y con sus números" {...campo("hallazgo")} />
      <textarea className="crediscope-input" rows={3} placeholder="Cambio propuesto (el texto del ajuste, el cambio de marco o la regla)" {...campo("cambio_propuesto")} />
      <textarea className="crediscope-input" rows={2} placeholder="Impacto estimado: malos evitados, buenos perdidos, aprobados que cambian" {...campo("impacto")} />
      <textarea className="crediscope-input" rows={2} placeholder="Limitaciones: qué no prueba (muestra, ventana, asociación no es causa)" {...campo("limitaciones")} />
      <textarea className="crediscope-input" rows={2} placeholder="Cómo se va a validar después de aplicarlo" {...campo("validacion_posterior")} />
      <MensajeError mensaje={error} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="crediscope-btn" onClick={guardar} disabled={!p.titulo.trim() || !p.hallazgo.trim()}>
          <Save size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          Guardar
        </button>
        <button className="crediscope-btn crediscope-btn-ghost" onClick={alCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function Acciones({ p, alCambiar, alEditar }) {
  const [comentario, setComentario] = useState("");
  const [aplicadaEn, setAplicadaEn] = useState("");
  const btn = (texto, accion, peligro) => (
    <button className="crediscope-btn crediscope-btn-ghost" onClick={accion} style={peligro ? { color: "var(--bad)", borderColor: "var(--bad)" } : undefined}>
      {texto}
    </button>
  );
  const estado = (e) => () => alCambiar(() => cambiarEstadoPropuesta(p.id, e, comentario));
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
      {["borrador", "revisada"].includes(p.estado) ? btn("Editar", alEditar) : null}
      {p.estado === "borrador" ? btn("Marcar revisada", estado("revisada")) : null}
      {p.estado === "revisada" && !p.es_sintetica ? btn("Presentar a la IFI", estado("presentada")) : null}
      {p.estado === "presentada" ? (
        <>
          <input className="crediscope-input" style={{ maxWidth: 260 }} placeholder="Comentario de quien decide" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          {btn("Aprobar", estado("aprobada"))}
          {btn("Rechazar", estado("rechazada"), true)}
        </>
      ) : null}
      {p.estado === "aprobada" && p.tipo === "ajuste_criterio" ? btn("Poner en vigencia", () => alCambiar(() => ponerEnVigencia(p.id, true))) : null}
      {p.estado === "aplicada" && p.tipo === "ajuste_criterio" ? btn("Quitar de vigencia", () => alCambiar(() => ponerEnVigencia(p.id, false)), true) : null}
      {p.estado === "aprobada" && p.tipo !== "ajuste_criterio" ? (
        <>
          <input className="crediscope-input" style={{ maxWidth: 220 }} placeholder="Versión que lo aplicó (marco-v29...)" value={aplicadaEn} onChange={(e) => setAplicadaEn(e.target.value)} />
          <button
            className="crediscope-btn crediscope-btn-ghost"
            disabled={!aplicadaEn.trim()}
            onClick={() => alCambiar(() => guardarPropuesta({ id: p.id, estado: "aplicada", aplicada_en: aplicadaEn.trim() }))}
          >
            Marcar aplicada
          </button>
        </>
      ) : null}
      {!["aplicada", "rechazada", "retirada"].includes(p.estado) ? btn("Retirar", estado("retirada"), true) : null}
    </div>
  );
}

export default function LaboratorioPropuestas() {
  const [params, setParams] = useSearchParams();
  const [propuestas, setPropuestas] = useState(null);
  const [editando, setEditando] = useState(null);
  const [corte, setCorte] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => setPropuestas(await getPropuestas()), []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  // Desde un corte: el formulario arranca con su evidencia adjunta.
  useEffect(() => {
    const corteId = params.get("corte");
    if (!corteId) return;
    Promise.all([getCorte(corteId), getResultados(corteId)])
      .then(([c, rs]) => {
        setCorte(c);
        setEditando({ ...VACIA, corte_id: c.id, es_sintetica: c.es_sintetico, evidencia: evidenciaDe(rs) });
      })
      .catch((e) => setError(e.message));
  }, [params]);

  async function cambiar(accion) {
    setError(null);
    try {
      await accion();
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function alGuardar(fila) {
    await guardarPropuesta(fila);
    setEditando(null);
    setCorte(null);
    setParams({});
    await cargar();
  }

  if (!propuestas) return error ? <MensajeError mensaje={error} /> : <p className="crediscope-muted">Cargando...</p>;

  return (
    <div>
      <Volver a="/laboratorio" texto="Volver al Laboratorio" />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Propuestas de ajuste</h2>
          <p className="crediscope-muted" style={{ marginTop: 0, maxWidth: "70ch" }}>
            Cada propuesta dice qué se vio, con qué evidencia, qué cambia, qué no prueba y cómo se validará después. Una propuesta
            sobre datos sintéticos no se presenta ni se aplica.
          </p>
        </div>
        {!editando ? (
          <button className="crediscope-btn" onClick={() => setEditando({ ...VACIA })}>
            <Plus size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
            Nueva propuesta
          </button>
        ) : null}
      </div>

      <MensajeError mensaje={error} />

      {editando ? (
        <Formulario
          inicial={{ ...VACIA, ...editando, impacto: editando.impacto ?? editando.impacto_estimado?.texto ?? "" }}
          corte={corte}
          alGuardar={alGuardar}
          alCancelar={() => {
            setEditando(null);
            setCorte(null);
            setParams({});
          }}
        />
      ) : null}

      {propuestas.length === 0 && !editando ? (
        <div className="crediscope-card"><p className="crediscope-muted" style={{ margin: 0 }}>Todavía no hay propuestas. Se crean desde un corte, con su evidencia.</p></div>
      ) : null}

      {propuestas.map((p) => (
        <div key={p.id} className="crediscope-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>{p.titulo}</h3>
              <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Etiqueta texto={ETIQUETA_TIPO_PROPUESTA[p.tipo]} />
                <Etiqueta texto={ETIQUETA_ESTADO_PROPUESTA[p.estado]} color={p.estado === "aplicada" ? "var(--good)" : p.estado === "rechazada" ? "var(--bad)" : "var(--brand)"} />
                {p.es_sintetica ? <Etiqueta texto="Sintética" color="var(--warn)" /> : null}
                {p.vigente_desde ? <Etiqueta texto={`Vigente desde ${formatearFechaHora(p.vigente_desde)}`} color="var(--good)" /> : null}
              </div>
            </div>
            <div className="crediscope-muted" style={{ fontSize: 12.5, textAlign: "right" }}>
              {formatearFechaHora(p.created_at)}
              {p.corte_id ? (
                <div><Link to={`/laboratorio/cortes/${p.corte_id}`}>{p.lab_cortes?.nombre ?? "Ver corte"}</Link></div>
              ) : null}
            </div>
          </div>
          <p style={{ marginBottom: 6 }}><strong>Hallazgo:</strong> {p.hallazgo}</p>
          {p.cambio_propuesto ? <p style={{ margin: "6px 0" }}><strong>Cambio:</strong> {p.cambio_propuesto}</p> : null}
          {p.impacto_estimado?.texto ? <p style={{ margin: "6px 0" }}><strong>Impacto estimado:</strong> {p.impacto_estimado.texto}</p> : null}
          {p.limitaciones ? <p style={{ margin: "6px 0" }}><strong>Limitaciones:</strong> {p.limitaciones}</p> : null}
          {p.validacion_posterior ? <p style={{ margin: "6px 0" }}><strong>Validación posterior:</strong> {p.validacion_posterior}</p> : null}
          {(p.evidencia ?? []).length ? (
            <details style={{ marginTop: 6 }}>
              <summary className="crediscope-muted" style={{ cursor: "pointer", fontSize: 13 }}>Evidencia ({p.evidencia.length})</summary>
              <ul style={{ fontSize: 13 }}>
                {p.evidencia.map((e) => (
                  <li key={e.resultado_id}>
                    {e.resumen} · n {e.n ?? "—"}, malos {e.n_malos ?? "—"}{e.n && e.n_malos != null ? ` (${pct(e.n_malos / e.n)})` : ""} · {formatearFechaHora(e.calculado)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {p.comentario_revisor ? <p className="crediscope-muted" style={{ fontSize: 13 }}>Comentario: {p.comentario_revisor}</p> : null}
          {p.aplicada_en ? <p className="crediscope-muted" style={{ fontSize: 13 }}>Aplicada en: {p.aplicada_en}</p> : null}
          <Acciones p={p} alCambiar={cambiar} alEditar={() => setEditando({ ...p })} />
        </div>
      ))}
    </div>
  );
}
