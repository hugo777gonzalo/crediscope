import { useState } from "react";
import { Link } from "react-router-dom";
import { getHistorialCliente } from "../lib/api.js";

// Buscador histórico de consultas de un cliente — a diferencia de
// Perfil del Cliente/Análisis con IA (que solo muestran lo más
// reciente y permiten reconsultar), esto lista TODA la línea de tiempo
// y abre un visor de SOLO LECTURA por evento (ver
// HistorialPerfilDetalle.jsx/HistorialAnalisisDetalle.jsx) — sin botón
// de reconsultar ni analizar en ningún punto de este flujo.

const ETIQUETAS_TIPO = { perfil: "Perfil del Cliente", analisis: "Análisis con IA" };

export default function Historial() {
  const [cedula, setCedula] = useState("");
  const [buscado, setBuscado] = useState(null);
  const [client, setClient] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const value = cedula.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const { client: c, eventos: ev } = await getHistorialCliente(value);
      setClient(c);
      setEventos(ev);
      setBuscado(value);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="crediscope-card" style={{ maxWidth: 420 }}>
        <h2>Historial</h2>
        <p className="crediscope-muted">Consulta todas las veces que se generó un Perfil del Cliente o un Análisis con IA para una cédula.</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            className="crediscope-input"
            placeholder="Cédula"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            required
          />
          <button className="crediscope-btn" type="submit" disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)" }}>{error}</p>
        </div>
      ) : null}

      {buscado && !loading && !client ? (
        <p className="crediscope-muted">Sin registros para la cédula {buscado}.</p>
      ) : null}

      {client ? (
        <div className="crediscope-card">
          <h3>Línea de tiempo — {client.cedula}</h3>
          {eventos.length === 0 ? (
            <p className="crediscope-muted">Sin consultas registradas todavía.</p>
          ) : (
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Detalle</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((ev) => (
                  <tr key={`${ev.tipo}-${ev.id}`}>
                    <td>{new Date(ev.created_at).toLocaleString()}</td>
                    <td>{ETIQUETAS_TIPO[ev.tipo]}</td>
                    <td>{ev.tipo === "analisis" ? `Score ${ev.score} (${ev.version})` : ev.version}</td>
                    <td>
                      <Link className="crediscope-btn crediscope-btn-ghost" to={`/historial/${ev.tipo}/${ev.id}`}>
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
