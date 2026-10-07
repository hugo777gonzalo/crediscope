import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Scissors } from "lucide-react";
import { getCargas, getDefiniciones, congelarCorte, describirDefinicion } from "../lib/laboratorio.js";
import { formatearDia } from "../lib/fechas.js";
import { Volver, MensajeError, Etiqueta, num } from "../components/laboratorio/Comunes.jsx";

// Congelar un corte: la población que se va a analizar. Queda como foto
// (puntaje, versiones y valores de las variables copiados), así el mismo
// corte da el mismo número dentro de un año. No se mezclan cargas reales
// con sintéticas: lo impide la base.

export default function LaboratorioCorteNuevo() {
  const navigate = useNavigate();
  const [cargas, setCargas] = useState([]);
  const [definiciones, setDefiniciones] = useState([]);
  const [elegidas, setElegidas] = useState([]);
  const [nombre, setNombre] = useState("");
  const [definicion, setDefinicion] = useState("");
  const [ventana, setVentana] = useState(24);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [productos, setProductos] = useState("");
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    Promise.all([getCargas(), getDefiniciones()])
      .then(([cs, ds]) => {
        setCargas(cs.filter((c) => c.estado === "lista"));
        setDefiniciones(ds);
        // La más reciente: es la vigente del negocio (vienen por fecha).
        setDefinicion(ds.at(-1)?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  const tipos = new Set(cargas.filter((c) => elegidas.includes(c.id)).map((c) => c.es_sintetica));
  const mezcla = tipos.size > 1;

  function alternar(id) {
    setElegidas((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  }

  async function congelar() {
    setError(null);
    setTrabajando(true);
    const filtros = {};
    if (desde) filtros.desde = desde;
    if (hasta) filtros.hasta = hasta;
    const lista = productos.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (lista.length) filtros.productos = lista;
    try {
      const id = await congelarCorte({ nombre: nombre.trim(), cargas: elegidas, definicion, ventana, filtros });
      navigate(`/laboratorio/cortes/${id}`);
    } catch (e) {
      setError(e.message);
      setTrabajando(false);
    }
  }

  const def = definiciones.find((d) => d.id === definicion);

  return (
    <div>
      <Volver a="/laboratorio" texto="Volver al Laboratorio" />
      <h2 style={{ marginBottom: 4 }}>Nuevo corte</h2>
      <p className="crediscope-muted" style={{ marginTop: 0, maxWidth: "70ch" }}>
        Las operaciones inmaduras (que no cumplieron la ventana al corte del archivo) y las consultadas después del desembolso
        quedan fuera, con su motivo a la vista.
      </p>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Cargas</h3>
        {cargas.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>No hay cargas listas.</p>
        ) : (
          cargas.map((c) => (
            <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
              <input type="checkbox" checked={elegidas.includes(c.id)} onChange={() => alternar(c.id)} />
              <span>
                <strong>{c.etiqueta}</strong> {c.es_sintetica ? <Etiqueta texto="Sintética" color="var(--warn)" /> : null}{" "}
                <span className="crediscope-muted" style={{ fontSize: 13 }}>
                  {num(c.conciliacion?.operaciones)} operaciones · corte {formatearDia(c.fecha_corte)}
                </span>
              </span>
            </label>
          ))
        )}
        {mezcla ? <p style={{ color: "var(--bad)", marginBottom: 0 }}>No se mezclan cargas reales con sintéticas.</p> : null}
      </div>

      <div className="crediscope-card" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <label>
          <div className="crediscope-muted" style={{ fontSize: 13 }}>Nombre del corte</div>
          <input className="crediscope-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Desembolsos 2025, a 24 meses" />
        </label>
        <label>
          <div className="crediscope-muted" style={{ fontSize: 13 }}>Definición de impago</div>
          <select className="crediscope-input" value={definicion} onChange={(e) => setDefinicion(e.target.value)}>
            {definiciones.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
          {def ? <div className="crediscope-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{describirDefinicion(def)}</div> : null}
        </label>
        <label>
          <div className="crediscope-muted" style={{ fontSize: 13 }}>Ventana</div>
          <select className="crediscope-input" value={ventana} onChange={(e) => setVentana(Number(e.target.value))}>
            <option value={12}>12 meses</option>
            <option value={24}>24 meses (la prueba más exigente)</option>
          </select>
        </label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label>
            <div className="crediscope-muted" style={{ fontSize: 13 }}>Desembolsos desde (opcional)</div>
            <input className="crediscope-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            <div className="crediscope-muted" style={{ fontSize: 13 }}>hasta (opcional)</div>
            <input className="crediscope-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
        <label>
          <div className="crediscope-muted" style={{ fontSize: 13 }}>Productos (opcional, separados por coma)</div>
          <input className="crediscope-input" value={productos} onChange={(e) => setProductos(e.target.value)} placeholder="consumo, microcredito" />
        </label>
      </div>

      <MensajeError mensaje={error} />

      <button className="crediscope-btn" disabled={!nombre.trim() || !elegidas.length || !definicion || mezcla || trabajando} onClick={congelar}>
        <Scissors size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
        {trabajando ? "Congelando..." : "Congelar corte"}
      </button>
    </div>
  );
}
