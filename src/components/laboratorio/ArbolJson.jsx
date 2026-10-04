// Un objeto JSON (el perfil, la entrada al modelo, el crudo) plegado por
// niveles: se abre lo que se quiere mirar. Los arreglos largos muestran los
// primeros elementos y cuántos más hay.

const MAX_ELEMENTOS = 30;

function Valor({ v }) {
  if (v === null) return <span className="crediscope-muted">null</span>;
  if (typeof v === "string") return <span style={{ color: "#0f766e" }}>«{v.length > 160 ? `${v.slice(0, 159)}…` : v}»</span>;
  if (typeof v === "boolean") return <span style={{ color: "var(--warn)" }}>{v ? "sí" : "no"}</span>;
  return <span style={{ color: "var(--brand)" }}>{String(v)}</span>;
}

function Nodo({ nombre, v, nivel, abrirHasta }) {
  const compuesto = v !== null && typeof v === "object";
  if (!compuesto) {
    return (
      <div style={{ paddingLeft: 14, fontSize: 12.5, lineHeight: 1.6 }}>
        <span style={{ color: "var(--text-muted)" }}>{nombre}:</span> <Valor v={v} />
      </div>
    );
  }
  const entradas = Array.isArray(v) ? v.map((x, i) => [String(i), x]) : Object.entries(v);
  const resumen = Array.isArray(v) ? `[${v.length}]` : `{${entradas.length}}`;
  return (
    <details open={nivel < abrirHasta} style={{ paddingLeft: nivel ? 14 : 0, fontSize: 12.5 }}>
      <summary style={{ cursor: "pointer", lineHeight: 1.6 }}>
        <span style={{ color: "var(--text)", fontWeight: nivel ? 400 : 700 }}>{nombre}</span> <span className="crediscope-muted">{resumen}</span>
      </summary>
      {entradas.slice(0, MAX_ELEMENTOS).map(([k, x]) => <Nodo key={k} nombre={k} v={x} nivel={nivel + 1} abrirHasta={abrirHasta} />)}
      {entradas.length > MAX_ELEMENTOS ? <div className="crediscope-muted" style={{ paddingLeft: 14 }}>y {entradas.length - MAX_ELEMENTOS} más</div> : null}
    </details>
  );
}

export default function ArbolJson({ nombre = "todo", valor, abrirHasta = 1 }) {
  return (
    <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", overflowX: "auto" }}>
      <Nodo nombre={nombre} v={valor} nivel={0} abrirHasta={abrirHasta} />
    </div>
  );
}
