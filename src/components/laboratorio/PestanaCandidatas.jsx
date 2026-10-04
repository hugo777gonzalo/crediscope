import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCandidatas, actualizarCandidata, guardarPropuesta } from "../../lib/laboratorio.js";
import { formatearFechaHora, formatearDia } from "../../lib/fechas.js";
import { MensajeError, Cargando, Etiqueta, dec, pct } from "./Comunes.jsx";

// Registro de variables candidatas (módulo 6 del negocio): lo que el
// Laboratorio encontró y todavía no entra al motor. Descubierta → en
// revisión → experimental → aceptada o rechazada; nunca se borra (lo
// rechazado queda, con su motivo, para no volver a probarlo igual). Una
// aceptada se convierte en una propuesta de tipo "dato nuevo", que sigue su
// propio camino de revisión y aprobación.

const ESTADOS = [
  ["descubierta", "Descubierta", "var(--text-muted)"],
  ["en_revision", "En revisión", "var(--brand)"],
  ["experimental", "Experimental", "var(--warn)"],
  ["aceptada", "Aceptada", "var(--good)"],
  ["rechazada", "Rechazada", "var(--bad)"],
];
const ORIGEN = { crudo: "Del crudo", taller: "Del taller", catalogo: "Del perfil" };

function Candidata({ c, alCambiar }) {
  const [notas, setNotas] = useState(c.notas ?? "");
  const [error, setError] = useState(null);
  const e = c.evidencia ?? {};

  async function cambiar(cambios) {
    setError(null);
    try {
      await actualizarCandidata(c.id, cambios);
      await alCambiar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function proponer() {
    setError(null);
    try {
      const id = await guardarPropuesta({
        titulo: `Dato nuevo: ${c.nombre}`,
        hallazgo: `${c.definicion}. ${e.iv !== undefined ? `IV ${dec(e.iv, 3)} en «${e.corte ?? "el corte"}»` : ""}${e.iv_primera_mitad !== undefined ? ` (mitades ${dec(e.iv_primera_mitad, 3)} y ${dec(e.iv_segunda_mitad, 3)})` : ""}.`,
        tipo: "dato_nuevo", corte_id: c.corte_id, es_sintetica: Boolean(c.lab_cortes?.es_sintetico),
        evidencia: [{ tipo: "candidata", id: c.id, ...e }],
        cambio_propuesto: c.formula ? `Agregar la variable «${c.nombre}» = ${c.formula}` : c.ruta_crudo ? `Leer ${c.ruta_crudo} (${c.derivacion ?? "tal cual"}) en la estructura y pasarlo al modelo` : `Pasar ${c.variable_catalogo} al perfil del modelo`,
        limitaciones: c.disponible_desde ? `El dato existe desde el ${formatearDia(c.disponible_desde)}.` : "Falta establecer desde cuándo existe el dato.",
        validacion_posterior: "Repetir la medición en un corte posterior antes de aplicarla.",
      });
      await cambiar({ propuesta_id: id });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="crediscope-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <strong>{c.nombre}</strong> <Etiqueta texto={ORIGEN[c.origen] ?? c.origen} />{" "}
          {c.lab_cortes?.es_sintetico ? <Etiqueta texto="de un corte sintético" color="var(--warn)" /> : null}
          <div className="crediscope-muted" style={{ fontSize: 12.5 }}>
            {c.definicion}
            {c.ruta_crudo ? <> · <code>{c.ruta_crudo}</code> ({c.derivacion})</> : null}
            {c.fuente ? ` · fuente: ${c.fuente}` : ""} · {c.disponible_desde ? `disponible desde el ${formatearDia(c.disponible_desde)}` : "sin fecha de disponibilidad"}
          </div>
        </div>
        <select value={c.estado} onChange={(ev) => cambiar({ estado: ev.target.value })} className="crediscope-input" style={{ width: "auto", height: "fit-content" }}>
          {ESTADOS.map(([clave, texto]) => <option key={clave} value={clave}>{texto}</option>)}
        </select>
      </div>
      <p style={{ fontSize: 13, margin: "8px 0" }}>
        {e.iv !== undefined ? `IV ${dec(e.iv, 3)}` : ""}
        {e.iv_primera_mitad !== undefined ? ` · mitades ${dec(e.iv_primera_mitad, 3)} y ${dec(e.iv_segunda_mitad, 3)}` : ""}
        {e.tasa_con !== undefined ? ` · ${pct(e.tasa_con)} de malos con la condición contra ${pct(e.tasa_sin)} sin ella` : ""}
        {e.q !== undefined ? ` · q ${dec(e.q, 4)}` : ""}
        {e.corte ? ` · en «${e.corte}»` : c.lab_cortes?.nombre ? ` · en «${c.lab_cortes.nombre}»` : ""}
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input className="crediscope-input" placeholder="Notas (por qué cambia de estado, qué falta probar)" value={notas} onChange={(ev) => setNotas(ev.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <button className="crediscope-btn crediscope-btn-ghost" onClick={() => cambiar({ notas })} disabled={notas === (c.notas ?? "")}>Guardar notas</button>
        {c.propuesta_id ? (
          <Link className="crediscope-btn crediscope-btn-ghost" to="/laboratorio/propuestas">Ver la propuesta</Link>
        ) : c.estado === "aceptada" ? (
          <button className="crediscope-btn" onClick={proponer}>Crear la propuesta de dato nuevo</button>
        ) : null}
      </div>
      {c.historial?.length ? (
        <p className="crediscope-muted" style={{ fontSize: 12, marginBottom: 0 }}>
          {c.historial.map((h) => `${formatearFechaHora(h.cuando)}: ${h.de} → ${h.a}`).join(" · ")}
        </p>
      ) : null}
      <MensajeError mensaje={error} />
    </div>
  );
}

export default function PestanaCandidatas({ corteId }) {
  const [candidatas, setCandidatas] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("abiertas");
  const recargar = useCallback(() => getCandidatas().then(setCandidatas).catch((e) => setError(e.message)), []);
  useEffect(() => {
    recargar();
  }, [recargar]);
  if (error) return <MensajeError mensaje={error} />;
  if (!candidatas) return <Cargando que="las candidatas" />;
  const visibles = candidatas.filter((c) => (filtro === "todas" ? true : filtro === "este_corte" ? c.corte_id === corteId : !["aceptada", "rechazada"].includes(c.estado)));

  return (
    <div>
      <div className="crediscope-card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
          <option value="abiertas">Abiertas (sin aceptar ni rechazar)</option>
          <option value="este_corte">Las de este corte</option>
          <option value="todas">Todas</option>
        </select>
        <span className="crediscope-muted" style={{ fontSize: 13 }}>
          {ESTADOS.map(([clave, texto]) => `${texto}: ${candidatas.filter((c) => c.estado === clave).length}`).join(" · ")}
        </span>
      </div>
      {visibles.length ? visibles.map((c) => <Candidata key={c.id} c={c} alCambiar={recargar} />) : (
        <p className="crediscope-muted">
          Ninguna. Se registran desde el Explorador del crudo (lo que el modelo no vio), el Explorador de significancia (las candidatas) y el Taller.
        </p>
      )}
    </div>
  );
}
