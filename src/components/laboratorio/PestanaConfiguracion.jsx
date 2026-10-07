import { useCallback, useEffect, useState } from "react";
import { getTablasCalificacion, guardarTablaCalificacion, getDefiniciones, crearDefinicion, describirDefinicion } from "../../lib/laboratorio.js";
import { formatearFechaHora } from "../../lib/fechas.js";
import { MensajeError, Cargando, Etiqueta, num } from "./Comunes.jsx";

// La configuración del Laboratorio (decisión del negocio del 2026-10-06): la
// tabla de calificación (categoría → días de mora) y las definiciones de
// impago son parámetros, no código. Las dos se versionan: una tabla nueva es
// una versión nueva y una definición nueva es una fila nueva, así un corte
// congelado sigue diciendo con qué se hizo. Las categorías de los bancos que
// cuentan como impago y como observación las saca la base de la tabla
// (lab_crear_definicion, 110): un banco no informa días, sólo la categoría.

const ESCALA = ["A1", "A2", "A3", "B1", "B2", "C1", "C2", "D", "E"];
const SISTEMAS = [["bancos", "Bancos"], ["cooperativas", "Cooperativas y mutualistas"]];

function TablaDeCalificacion({ filas, alGuardar }) {
  const versiones = [...new Set(filas.map((f) => f.version))].sort((a, b) => a - b);
  const ultima = versiones.at(-1);
  const [version, setVersion] = useState(ultima);
  const [borrador, setBorrador] = useState(null);
  const [fuente, setFuente] = useState("");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const deLaVersion = filas.filter((f) => f.version === version);
  const celda = (sistema, categoria) => deLaVersion.find((f) => f.sistema === sistema && f.categoria === categoria);
  const editar = () => {
    setBorrador(Object.fromEntries(filas.filter((f) => f.version === ultima).map((f) => [`${f.sistema}|${f.categoria}`, { desde: String(f.dias_desde), hasta: f.dias_hasta === null ? "" : String(f.dias_hasta) }])));
    setVersion(ultima);
    setError(null);
  };
  const cambiar = (clave, campo, valor) => setBorrador((b) => ({ ...b, [clave]: { ...b[clave], [campo]: valor } }));

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const nuevas = Object.entries(borrador).map(([clave, v]) => {
        const [sistema, categoria] = clave.split("|");
        return { sistema, categoria, dias_desde: v.desde === "" ? null : Number(v.desde), dias_hasta: v.hasta === "" ? null : Number(v.hasta) };
      });
      const nueva = await guardarTablaCalificacion(nuevas, fuente.trim());
      setBorrador(null);
      setFuente("");
      await alGuardar();
      setVersion(nueva);
    } catch (e) {
      setError(e.message);
    }
    setGuardando(false);
  }

  return (
    <div className="crediscope-card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Tabla de calificación: días de mora de cada categoría</h3>
        {!borrador ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="crediscope-input" style={{ width: "auto" }} value={version} onChange={(e) => setVersion(Number(e.target.value))}>
              {versiones.map((v) => <option key={v} value={v}>Versión {v}{v === ultima ? " (la última)" : ""}</option>)}
            </select>
            <button className="crediscope-btn crediscope-btn-ghost" onClick={editar}>Cargar una versión nueva</button>
          </div>
        ) : null}
      </div>
      <p className="crediscope-muted" style={{ fontSize: 13 }}>
        {borrador
          ? "Se parte de la última versión. Cada categoría empieza el día siguiente al último de la anterior; A1 empieza en 0 y E va sin tope."
          : `${deLaVersion[0]?.fuente ?? ""}${deLaVersion[0] ? ` · cargada el ${formatearFechaHora(deLaVersion[0].created_at)}` : ""}`}
      </p>
      <table className="crediscope-table">
        <thead>
          <tr>
            <th>Categoría</th>
            {SISTEMAS.map(([s, texto]) => <th key={s} style={{ textAlign: "right" }}>{texto}</th>)}
          </tr>
        </thead>
        <tbody>
          {ESCALA.map((c) => (
            <tr key={c}>
              <td><strong>{c}</strong></td>
              {SISTEMAS.map(([s]) => {
                const clave = `${s}|${c}`;
                if (borrador) {
                  return (
                    <td key={s} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <input className="crediscope-input" style={{ width: 70, display: "inline-block" }} inputMode="numeric" value={borrador[clave]?.desde ?? ""} onChange={(e) => cambiar(clave, "desde", e.target.value)} />
                      {" a "}
                      <input className="crediscope-input" style={{ width: 70, display: "inline-block" }} inputMode="numeric" placeholder="sin tope" value={borrador[clave]?.hasta ?? ""} onChange={(e) => cambiar(clave, "hasta", e.target.value)} />
                    </td>
                  );
                }
                const f = celda(s, c);
                return <td key={s} style={{ textAlign: "right" }}>{f ? (f.dias_hasta === null ? `más de ${num(f.dias_desde - 1)}` : f.dias_desde === f.dias_hasta ? num(f.dias_desde) : `${num(f.dias_desde)} a ${num(f.dias_hasta)}`) : "—"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {borrador ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10, maxWidth: 640 }}>
          <input className="crediscope-input" placeholder="De dónde sale (la resolución o el documento)" value={fuente} onChange={(e) => setFuente(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="crediscope-btn" disabled={!fuente.trim() || guardando} onClick={guardar}>{guardando ? "Guardando..." : `Guardar como versión ${ultima + 1}`}</button>
            <button className="crediscope-btn crediscope-btn-ghost" onClick={() => setBorrador(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}
      <MensajeError mensaje={error} />
      <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
        Una tabla nueva no cambia las definiciones que ya existen: hay que crear una definición con la versión nueva.
      </p>
    </div>
  );
}

const VACIA = { nombre: "", diasMasDe: "90", retailMasDe: "500", diasObservacion: "15", cuentaCastigo: true, cuentaReestructuracion: true, cuentaJudicial: true };

function Definiciones({ definiciones, versiones, alCrear }) {
  const [form, setForm] = useState({ ...VACIA, tablaVersion: versiones.at(-1) ?? "" });
  const [error, setError] = useState(null);
  const [creando, setCreando] = useState(false);
  const poner = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const masNueva = definiciones.at(-1)?.id;

  async function crear() {
    setError(null);
    setCreando(true);
    try {
      await crearDefinicion({
        nombre: form.nombre.trim(), diasMasDe: Number(form.diasMasDe), retailMasDe: Number(form.retailMasDe),
        diasObservacion: form.diasObservacion === "" ? null : Number(form.diasObservacion), tablaVersion: Number(form.tablaVersion),
        cuentaCastigo: form.cuentaCastigo, cuentaReestructuracion: form.cuentaReestructuracion, cuentaJudicial: form.cuentaJudicial,
      });
      setForm({ ...VACIA, tablaVersion: versiones.at(-1) ?? "" });
      await alCrear();
    } catch (e) {
      setError(e.message);
    }
    setCreando(false);
  }

  return (
    <div className="crediscope-card">
      <h3 style={{ marginTop: 0 }}>Definiciones de impago</h3>
      <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
        Un corte elige una al congelarse. Una definición no se edita: se crea otra, y los cortes que ya se congelaron siguen con la suya. Nuevo
        corte propone la más reciente.
      </p>
      {[...definiciones].reverse().map((d) => (
        <div key={d.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
          <strong>{d.nombre}</strong> {d.id === masNueva ? <Etiqueta texto="la más reciente" color="var(--good)" /> : null}
          <div style={{ fontSize: 13 }}>{describirDefinicion(d)}</div>
          <div className="crediscope-muted" style={{ fontSize: 12 }}>Creada el {formatearFechaHora(d.created_at)}</div>
        </div>
      ))}
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Crear una definición</summary>
        <div style={{ display: "grid", gap: 10, maxWidth: 560, marginTop: 10 }}>
          <label>
            <div className="crediscope-muted" style={{ fontSize: 13 }}>Nombre</div>
            <input className="crediscope-input" value={form.nombre} onChange={(e) => poner("nombre", e.target.value)} placeholder="Negocio 2027-01: ..." />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label>
              <div className="crediscope-muted" style={{ fontSize: 13 }}>Impago: más de (días)</div>
              <input className="crediscope-input" inputMode="numeric" style={{ width: 110 }} value={form.diasMasDe} onChange={(e) => poner("diasMasDe", e.target.value)} />
            </label>
            <label>
              <div className="crediscope-muted" style={{ fontSize: 13 }}>Retail: deuda de más de (USD)</div>
              <input className="crediscope-input" inputMode="decimal" style={{ width: 130 }} value={form.retailMasDe} onChange={(e) => poner("retailMasDe", e.target.value)} />
            </label>
            <label>
              <div className="crediscope-muted" style={{ fontSize: 13 }}>Observación: desde (días; vacío, sin lista)</div>
              <input className="crediscope-input" inputMode="numeric" style={{ width: 110 }} value={form.diasObservacion} onChange={(e) => poner("diasObservacion", e.target.value)} />
            </label>
            <label>
              <div className="crediscope-muted" style={{ fontSize: 13 }}>Tabla de calificación</div>
              <select className="crediscope-input" style={{ width: "auto" }} value={form.tablaVersion} onChange={(e) => poner("tablaVersion", e.target.value)}>
                {versiones.map((v) => <option key={v} value={v}>Versión {v}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13.5 }}>
            <span className="crediscope-muted">También cuentan como impago, aunque no lleguen a los días:</span>
            {[["cuentaCastigo", "castigo"], ["cuentaReestructuracion", "reestructuración"], ["cuentaJudicial", "demanda judicial"]].map(([campo, texto]) => (
              <label key={campo} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={form[campo]} onChange={(e) => poner(campo, e.target.checked)} /> {texto}
              </label>
            ))}
          </div>
          <button className="crediscope-btn" disabled={!form.nombre.trim() || form.diasMasDe === "" || form.retailMasDe === "" || creando} onClick={crear}>
            {creando ? "Creando..." : "Crear la definición"}
          </button>
          <MensajeError mensaje={error} />
        </div>
      </details>
    </div>
  );
}

export default function PestanaConfiguracion() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const cargar = useCallback(() => Promise.all([getTablasCalificacion(), getDefiniciones()])
    .then(([tabla, definiciones]) => setDatos({ tabla, definiciones }))
    .catch((e) => setError(e.message)), []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error) return <MensajeError mensaje={error} />;
  if (!datos) return <Cargando que="la configuración" />;
  const versiones = [...new Set(datos.tabla.map((f) => f.version))].sort((a, b) => a - b);
  return (
    <div>
      <Definiciones definiciones={datos.definiciones} versiones={versiones} alCrear={cargar} />
      <TablaDeCalificacion filas={datos.tabla} alGuardar={cargar} />
    </div>
  );
}
