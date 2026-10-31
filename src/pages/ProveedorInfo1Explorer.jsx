import { useState } from "react";
import { exploreProveedorInfo1 } from "../lib/api.js";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";

function tagClass(status) {
  if (status === "ok") return "crediscope-tag-ok";
  if (status === "faltante" || status === "ok_vacio") return "crediscope-tag-warn";
  return "crediscope-tag-bad";
}

// Las fuentes se muestran cerradas: son 52 y abrirlas todas de entrada
// convierte la pantalla en kilómetros de JSON.
function FuenteCard({ fuente, status, raw }) {
  const [verRaw, setVerRaw] = useState(false);
  return (
    <div className="crediscope-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>{fuente}</h3>
        <span className={`crediscope-tag ${tagClass(status)}`}>{status}</span>
      </div>
      <button className="crediscope-btn crediscope-btn-ghost" onClick={() => setVerRaw((v) => !v)} style={{ marginTop: 8 }}>
        {verRaw ? "Ocultar datos raw" : "Ver datos raw"}
      </button>
      {verRaw ? <pre className="crediscope-pre">{JSON.stringify(raw, null, 2)}</pre> : null}
    </div>
  );
}

export default function ProveedorInfo1Explorer() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cedula, setCedula] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await exploreProveedorInfo1({ username, password, cedula });
      setResult(data);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="crediscope-card">
        <h2>Explorador de la fuente de datos</h2>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, maxWidth: 360, marginTop: 12 }}>
          <input
            className="crediscope-input"
            placeholder="Usuario de la fuente"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              className="crediscope-input"
              style={{ flex: 1, minWidth: 0 }}
              type="password"
              placeholder="Contraseña de la fuente"
              aria-label="Contraseña de la fuente"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <InfoTooltip etiqueta="Qué pasa con la contraseña" lado="derecha">
              No se guarda en ningún lado: se usa una sola vez para pedir el token. La consulta tampoco guarda nada.
            </InfoTooltip>
          </div>
          <input
            className="crediscope-input"
            placeholder="Cédula a consultar"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            required
          />
          <button className="crediscope-btn" type="submit" disabled={loading}>
            {loading ? "Consultando..." : "Consultar"}
          </button>
        </form>
      </div>

      {error ? (
        <AvisoDeError error={error} />
      ) : null}

      {result?.controlBloqueo?.hallazgos?.length > 0 ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <h3 style={{ color: "var(--bad)" }}>Controles de bloqueo activados</h3>
          <ul className="crediscope-list">
            {result.controlBloqueo.hallazgos.map((h, i) => (
              <li key={i}>
                <strong>{h.code}</strong>: {h.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result
        ? Object.keys(result.estado ?? {})
            .sort()
            .map((fuente) => (
              <FuenteCard key={fuente} fuente={fuente} status={result.estado[fuente]} raw={result.raw[fuente]?.data} />
            ))
        : null}
    </div>
  );
}
