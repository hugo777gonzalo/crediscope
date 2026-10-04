import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getInstituciones, guardarInstitucion, guardarProyecto, getCargas, getCortes, getResultados } from "../lib/laboratorio.js";
import { formatearDia } from "../lib/fechas.js";
import { MensajeError, Cargando, Etiqueta, num, pct, dec } from "../components/laboratorio/Comunes.jsx";

// Módulo 2 del negocio: Instituciones y proyectos (decisión 3 del
// 2026-10-03: entidades del Laboratorio, sólo de admin, sin esperar la
// fábrica de crédito). Una institución tiene proyectos; una carga se sube a
// una institución y un proyecto, y de ahí sale el desempeño del motor por
// institución. Nada se borra: se inactiva o se cierra.

const TIPOS = { cooperativa: "Cooperativa", banco: "Banco", mutualista: "Mutualista", financiera: "Financiera", casa_comercial: "Casa comercial", otra: "Otra" };
const ESTADOS_PROYECTO = { en_curso: "En curso", pausado: "Pausado", cerrado: "Cerrado" };

function FormularioInstitucion({ inicial, alGuardar, alCancelar }) {
  const [f, setF] = useState(inicial ?? { nombre: "", ruc: "", tipo: "cooperativa", segmento: "", estado: "activa", contacto: "", notas: "" });
  const [error, setError] = useState(null);
  const campo = (clave) => ({ value: f[clave] ?? "", onChange: (e) => setF({ ...f, [clave]: e.target.value }) });
  async function guardar() {
    setError(null);
    try {
      await guardarInstitucion({ id: f.id, nombre: f.nombre.trim(), ruc: f.ruc?.trim() || null, tipo: f.tipo, segmento: f.segmento?.trim() || null, estado: f.estado, contacto: f.contacto?.trim() || null, notas: f.notas?.trim() || null });
      await alGuardar();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="crediscope-card" style={{ display: "grid", gap: 8, maxWidth: 620 }}>
      <label style={{ fontSize: 13 }}>Nombre<input className="crediscope-input" {...campo("nombre")} /></label>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
        <label style={{ fontSize: 13 }}>RUC<input className="crediscope-input" {...campo("ruc")} placeholder="13 dígitos" /></label>
        <label style={{ fontSize: 13 }}>Tipo
          <select className="crediscope-input" {...campo("tipo")}>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        </label>
        <label style={{ fontSize: 13 }}>Segmento<input className="crediscope-input" {...campo("segmento")} placeholder="cooperativas: 1 a 5" /></label>
      </div>
      <label style={{ fontSize: 13 }}>Contacto<input className="crediscope-input" {...campo("contacto")} /></label>
      <label style={{ fontSize: 13 }}>Notas<input className="crediscope-input" {...campo("notas")} /></label>
      {f.id ? (
        <label style={{ fontSize: 13 }}>Estado
          <select className="crediscope-input" {...campo("estado")}><option value="activa">Activa</option><option value="inactiva">Inactiva</option></select>
        </label>
      ) : null}
      <MensajeError mensaje={error} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="crediscope-btn" onClick={guardar} disabled={!f.nombre?.trim()}>Guardar</button>
        <button className="crediscope-btn crediscope-btn-ghost" onClick={alCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function FormularioProyecto({ institucionId, inicial, alGuardar, alCancelar }) {
  const [f, setF] = useState(inicial ?? { nombre: "", objetivo: "", estado: "en_curso", fecha_inicio: "", fecha_fin: "", notas: "" });
  const [error, setError] = useState(null);
  const campo = (clave) => ({ value: f[clave] ?? "", onChange: (e) => setF({ ...f, [clave]: e.target.value }) });
  async function guardar() {
    setError(null);
    try {
      await guardarProyecto({ id: f.id, institucion_id: institucionId, nombre: f.nombre.trim(), objetivo: f.objetivo?.trim() || null, estado: f.estado, fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null, notas: f.notas?.trim() || null });
      await alGuardar();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 620, background: "var(--panel-muted)", padding: 10, borderRadius: 8, marginTop: 8 }}>
      <label style={{ fontSize: 13 }}>Nombre del proyecto<input className="crediscope-input" {...campo("nombre")} placeholder="Prueba retrospectiva 2025" /></label>
      <label style={{ fontSize: 13 }}>Objetivo<input className="crediscope-input" {...campo("objetivo")} /></label>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
        <label style={{ fontSize: 13 }}>Estado
          <select className="crediscope-input" {...campo("estado")}>{Object.entries(ESTADOS_PROYECTO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        </label>
        <label style={{ fontSize: 13 }}>Desde<input type="date" className="crediscope-input" {...campo("fecha_inicio")} /></label>
        <label style={{ fontSize: 13 }}>Hasta<input type="date" className="crediscope-input" {...campo("fecha_fin")} /></label>
      </div>
      <MensajeError mensaje={error} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="crediscope-btn" onClick={guardar} disabled={!f.nombre?.trim()}>Guardar el proyecto</button>
        <button className="crediscope-btn crediscope-btn-ghost" onClick={alCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

export default function LaboratorioInstituciones() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null);
  const [proyectoNuevo, setProyectoNuevo] = useState(null);

  const recargar = useCallback(async () => {
    try {
      const [instituciones, cargas, cortes] = await Promise.all([getInstituciones(), getCargas(), getCortes()]);
      // El desempeño de cada corte (el último calculado) para el resumen por institución.
      const desempenos = Object.fromEntries(await Promise.all(cortes.map(async (c) => [c.id, (await getResultados(c.id)).find((r) => r.tipo === "desempeno") ?? null])));
      setDatos({ instituciones, cargas, cortes, desempenos });
      setEditando(null);
      setProyectoNuevo(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    recargar();
  }, [recargar]);

  if (error) return <MensajeError mensaje={error} />;
  if (!datos) return <Cargando que="las instituciones" />;
  const { instituciones, cargas, cortes, desempenos } = datos;
  const sinInstitucion = cargas.filter((c) => !c.institucion_id && c.estado !== "anulada");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Instituciones y proyectos</h2>
          <p className="crediscope-muted" style={{ margin: 0, maxWidth: "75ch" }}>
            Las instituciones con las que trabaja el Laboratorio y sus proyectos. Cada carga se sube a una institución y un proyecto; de ahí sale el
            desempeño del motor por institución. Sigue abierta la pregunta de fondo: una instalación para varias instituciones o una por institución.
          </p>
        </div>
        <button className="crediscope-btn" onClick={() => setEditando("nueva")}>Registrar una institución</button>
      </div>

      {editando === "nueva" ? <FormularioInstitucion alGuardar={recargar} alCancelar={() => setEditando(null)} /> : null}

      {!instituciones.length && editando !== "nueva" ? (
        <div className="crediscope-card"><p className="crediscope-muted" style={{ margin: 0 }}>Todavía no hay instituciones registradas.</p></div>
      ) : null}

      {instituciones.map((i) => {
        const suyas = cargas.filter((c) => c.institucion_id === i.id && c.estado !== "anulada");
        const susCortes = cortes.filter((c) => c.carga_ids.some((id) => suyas.some((s) => s.id === id)));
        const ultimo = susCortes.map((c) => ({ c, d: desempenos[c.id] })).find((x) => x.d);
        return (
          <div key={i.id} className="crediscope-card">
            {editando === i.id ? (
              <FormularioInstitucion inicial={i} alGuardar={recargar} alCancelar={() => setEditando(null)} />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{i.nombre} {i.estado === "inactiva" ? <Etiqueta texto="inactiva" /> : null}</h3>
                    <p className="crediscope-muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                      {TIPOS[i.tipo]}{i.segmento ? ` · segmento ${i.segmento}` : ""}{i.ruc ? ` · RUC ${i.ruc}` : ""}{i.contacto ? ` · ${i.contacto}` : ""}
                    </p>
                  </div>
                  <button className="crediscope-btn crediscope-btn-ghost" onClick={() => setEditando(i.id)}>Editar</button>
                </div>
                <p style={{ fontSize: 13.5 }}>
                  {num(suyas.length)} cargas · {num(suyas.reduce((s, c) => s + Number(c.conciliacion?.operaciones ?? 0), 0))} operaciones · {num(susCortes.length)} cortes
                  {ultimo ? ` · último desempeño: AUC ${dec(ultimo.d.resultado.auc, 3)}, ${pct(ultimo.d.n_malos / ultimo.d.n)} de malos («${ultimo.c.nombre}»)` : ""}
                </p>
                <h4 style={{ margin: "8px 0 4px" }}>Proyectos</h4>
                {i.lab_proyectos?.length ? (
                  <table className="crediscope-table">
                    <tbody>
                      {i.lab_proyectos.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.nombre}</strong>{p.objetivo ? <div className="crediscope-muted" style={{ fontSize: 12 }}>{p.objetivo}</div> : null}</td>
                          <td>{ESTADOS_PROYECTO[p.estado]}</td>
                          <td className="crediscope-muted">{p.fecha_inicio ? formatearDia(p.fecha_inicio) : "—"} a {p.fecha_fin ? formatearDia(p.fecha_fin) : "—"}</td>
                          <td>{num(cargas.filter((c) => c.proyecto_id === p.id).length)} cargas</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>Sin proyectos.</p>}
                {proyectoNuevo === i.id ? (
                  <FormularioProyecto institucionId={i.id} alGuardar={recargar} alCancelar={() => setProyectoNuevo(null)} />
                ) : (
                  <button className="crediscope-btn crediscope-btn-ghost" style={{ marginTop: 8 }} onClick={() => setProyectoNuevo(i.id)}>Agregar un proyecto</button>
                )}
              </>
            )}
          </div>
        );
      })}

      {sinInstitucion.length ? (
        <div className="crediscope-card">
          <h3 style={{ marginTop: 0 }}>Cargas sin institución ({num(sinInstitucion.length)})</h3>
          <ul style={{ margin: 0, fontSize: 13.5 }}>
            {sinInstitucion.map((c) => (
              <li key={c.id}>
                <Link to={`/laboratorio/cargas/${c.id}`}>{c.etiqueta}</Link>
                {c.es_sintetica ? <span className="crediscope-muted"> · sintética</span> : c.institucion ? <span className="crediscope-muted"> · decía «{c.institucion}»</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
