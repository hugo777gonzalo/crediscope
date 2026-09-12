import { nombreCorto } from "../lib/perfilClienteCampos.js";

function scoreClass(score) {
  if (score >= 700) return "crediscope-score-good";
  if (score >= 400) return "crediscope-score-mid";
  return "crediscope-score-bad";
}

// Header condensado y compartido entre Perfil del Cliente y Análisis
// con IA: Nombre | Cédula | Score (si hay). El nombre/pestaña de la
// sección NO se repite acá — ya la dice la barra de pestañas arriba.
export default function ClienteHeader({ nombreCompleto, cedula, score, acciones, infoTooltip }) {
  const nombre = nombreCorto(nombreCompleto);

  return (
    <div className="crediscope-card">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        {nombre ? <span style={{ fontSize: 20, fontWeight: 600 }}>{nombre}</span> : null}
        <span className="crediscope-muted">{cedula}</span>
        {score !== undefined && score !== null ? (
          <span className={`crediscope-score ${scoreClass(score)}`} style={{ fontSize: 32 }}>
            {score}
          </span>
        ) : null}
      </div>
      {acciones || infoTooltip ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          {acciones}
          {infoTooltip}
        </div>
      ) : null}
    </div>
  );
}
