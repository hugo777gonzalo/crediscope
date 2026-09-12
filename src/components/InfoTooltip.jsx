import { Info } from "lucide-react";

// Ícono informativo con tooltip al pasar el mouse/foco — reemplaza
// texto explicativo permanente en pantalla (ej. "consultado hace X
// días") por algo que solo aparece cuando el analista lo pide.
export default function InfoTooltip({ texto }) {
  return (
    <span className="crediscope-tooltip-wrap" tabIndex={0}>
      <Info size={16} color="var(--text-muted)" />
      <span className="crediscope-tooltip-bubble">{texto}</span>
    </span>
  );
}
