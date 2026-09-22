import { formatearValorAval } from "../../lib/avalCampos.js";

// Una fila por operación (deudasPorEntidad o deudasComoCodeudorGarante).
// Mismo componente para las dos listas -- lo que cambia es cuál se le
// pasa y, en la deuda contingente, el color de acento (var(--warn)): es
// exposición real pero no es deuda propia, y el color lo dice sin
// necesidad de otra columna.
export default function TablaDeudas({ filas, colorAcento = "var(--text)" }) {
  if (!filas || filas.length === 0) {
    return <p className="crediscope-muted" style={{ margin: 0 }}>Sin operaciones.</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>
            <th style={{ padding: "4px 8px 8px 0" }}>Sector</th>
            <th style={{ padding: "4px 8px 8px" }}>Entidad</th>
            <th style={{ padding: "4px 8px 8px" }}>Tipo</th>
            <th style={{ padding: "4px 8px 8px", textAlign: "right" }}>Días mora</th>
            <th style={{ padding: "4px 8px 8px", textAlign: "right" }}>Vigente</th>
            <th style={{ padding: "4px 8px 8px", textAlign: "right" }}>Vencido</th>
            <th style={{ padding: "4px 0 8px 8px", textAlign: "right" }}>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "6px 8px 6px 0" }}>{f.sector}</td>
              <td style={{ padding: "6px 8px" }}>{f.entidad ?? "—"}</td>
              <td style={{ padding: "6px 8px" }}>{f.tipoCredito ?? "—"}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", color: f.diasMora > 0 ? "var(--bad)" : undefined }}>
                {f.diasMora ?? "—"}
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{formatearValorAval(f.valorVigente, "dinero")}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{formatearValorAval(f.valorVencido, "dinero")}</td>
              <td style={{ padding: "6px 0 6px 8px", textAlign: "right", fontWeight: 600, color: colorAcento }}>
                {formatearValorAval(f.saldo, "dinero")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
