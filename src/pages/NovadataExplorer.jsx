import { useState } from "react";
import { exploreNovadata } from "../lib/api.js";

const EJE_LABELS = {
  general: "Información general",
  sociodemografica: "Sociodemográfica",
  trabajo: "Trabajo",
  iess: "Aportes IESS",
  vehiculos: "Vehículos",
  funcion_judicial: "Función Judicial",
  fiscalia: "Fiscalía",
  bancos: "Bancos",
  cooperativas: "Cooperativas",
};

function tagClass(status) {
  if (status === "ok") return "crediscope-tag-ok";
  if (status === "faltante") return "crediscope-tag-warn";
  return "crediscope-tag-bad";
}

function EjeCard({ ejeKey, status, resumen, raw }) {
  const [verRaw, setVerRaw] = useState(false);
  return (
    <div className="crediscope-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>{EJE_LABELS[ejeKey] || ejeKey}</h3>
        <span className={`crediscope-tag ${tagClass(status)}`}>{status}</span>
      </div>
      <p className="crediscope-muted" style={{ marginTop: 8 }}>
        Resumen
      </p>
      <pre className="crediscope-pre">{JSON.stringify(resumen, null, 2)}</pre>
      <button className="crediscope-btn crediscope-btn-ghost" onClick={() => setVerRaw((v) => !v)} style={{ marginTop: 8 }}>
        {verRaw ? "Ocultar datos raw" : "Ver datos raw"}
      </button>
      {verRaw ? <pre className="crediscope-pre">{JSON.stringify(raw, null, 2)}</pre> : null}
    </div>
  );
}

export default function NovadataExplorer() {
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
      const data = await exploreNovadata({ username, password, cedula });
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
        <h2>Explorador de Novadata</h2>
        <p className="crediscope-muted">
          Consulta en vivo los 9 ejes mapeados. No guarda nada — es solo para inspeccionar la ingesta. La
          contraseña no se persiste en ningún lado, se usa una sola vez para pedir el token.
        </p>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, maxWidth: 360, marginTop: 12 }}>
          <input
            className="crediscope-input"
            placeholder="Usuario Novadata"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            className="crediscope-input"
            type="password"
            placeholder="Contraseña Novadata"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
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
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)" }}>{error}</p>
        </div>
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
        ? Object.keys(EJE_LABELS).map((ejeKey) => (
            <EjeCard
              key={ejeKey}
              ejeKey={ejeKey}
              status={result.context.ejes[ejeKey]?.status}
              resumen={result.context.ejes[ejeKey]?.resumen}
              raw={result.raw[ejeKey]?.data}
            />
          ))
        : null}
    </div>
  );
}
