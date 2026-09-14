import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, Undo2, ShieldAlert } from "lucide-react";
import { getVersionesCriterio, getUsoPorVersion, revertirCriterio, desactivarTodosLosAjustes } from "../lib/api.js";

// Historial del criterio con el que el modelo evalúa. Cada vez que se
// pone o quita un ajuste de vigencia queda congelada una versión con el
// texto exacto de lo que regía, y cada análisis guarda cuál se le
// aplicó. Eso permite dos cosas que antes no se podían: auditar por qué
// un análisis salió como salió, y volver atrás sin tener que
// reconstruir a mano qué estaba activo.

export default function VersionesCriterio() {
  const [versiones, setVersiones] = useState([]);
  const [uso, setUso] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    const [vs, u] = await Promise.all([getVersionesCriterio(), getUsoPorVersion()]);
    setVersiones(vs);
    setUso(u);
  }, []);

  useEffect(() => {
    setLoading(true);
    cargar()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [cargar]);

  async function handleRevertir(version) {
    const cuantos = (version.ajustes ?? []).length;
    const texto =
      cuantos === 0
        ? `¿Volver a la versión ${version.numero}? Quedaría el criterio base, sin ningún ajuste aplicado.`
        : `¿Volver a la versión ${version.numero}? Quedarían vigentes los ${cuantos} ajuste(s) que regían entonces.`;
    if (!window.confirm(texto)) return;
    setTrabajando(true);
    setError(null);
    try {
      await revertirCriterio(version.id);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function handleDesactivarTodo() {
    if (!window.confirm("¿Desactivar todos los ajustes y volver al criterio base? Los análisis nuevos dejarán de aplicarlos de inmediato.")) return;
    setTrabajando(true);
    setError(null);
    try {
      await desactivarTodosLosAjustes();
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  }

  const activa = versiones[0] ?? null;
  const hayAjustesActivos = (activa?.ajustes ?? []).length > 0;

  if (loading) return <p className="crediscope-muted">Cargando historial...</p>;

  return (
    <div>
      <p>
        <Link to="/retroalimentacion" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver a Retroalimentación
        </Link>
      </p>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Historial del criterio</h2>
          <p className="crediscope-muted" style={{ margin: 0 }}>
            Cada cambio en los ajustes vigentes queda congelado como una versión. Los análisis guardan con cuál se hicieron.
          </p>
        </div>
        {hayAjustesActivos ? (
          <button className="crediscope-btn crediscope-btn-ghost" onClick={handleDesactivarTodo} disabled={trabajando} style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
            <ShieldAlert size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
            Desactivar todos los ajustes
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      {activa ? (
        <div className="crediscope-card" style={{ borderLeft: "3px solid var(--good)" }}>
          <h3 style={{ marginBottom: 4 }}>
            Versión {activa.numero} · <span style={{ color: "var(--good)" }}>vigente ahora</span>
          </h3>
          <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
            {hayAjustesActivos
              ? `${activa.ajustes.length} ajuste(s) aplicados sobre el criterio base.`
              : "Criterio base, sin ajustes aplicados."}
          </p>
          {hayAjustesActivos ? (
            <ul className="crediscope-list" style={{ fontSize: 13.5 }}>
              {activa.ajustes.map((a, i) => (
                <li key={i}>
                  <strong>{a.titulo}</strong>
                  <div className="crediscope-muted" style={{ marginTop: 2 }}>{a.texto}</div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="crediscope-card">
        <h3>
          <History size={17} style={{ marginRight: 7, verticalAlign: "-3px" }} />
          Versiones anteriores
        </h3>
        {versiones.length <= 1 ? (
          <p className="crediscope-muted">Todavía no hay cambios registrados en el criterio.</p>
        ) : (
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Versión</th>
                <th>Fecha</th>
                <th>Qué cambió</th>
                <th>Ajustes</th>
                <th>Análisis con esta versión</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {versiones.slice(1).map((v) => (
                <tr key={v.id}>
                  <td>{v.numero}</td>
                  <td>{new Date(v.created_at).toLocaleString("es-EC")}</td>
                  <td>{v.motivo ?? "—"}</td>
                  <td>{(v.ajustes ?? []).length}</td>
                  <td>{uso[v.id] ?? 0}</td>
                  <td>
                    <button className="crediscope-btn crediscope-btn-ghost" onClick={() => handleRevertir(v)} disabled={trabajando}>
                      <Undo2 size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                      Volver a esta
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
