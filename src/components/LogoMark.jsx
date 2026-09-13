// Ícono "Nexo": 3 nodos ascendentes conectados -- red neuronal (IA) +
// tendencia ascendente (crédito) en un solo trazo. Elegido sobre otros
// conceptos porque es el más reconocible como IA a simple vista (ver
// research/branding-mockup.html, ronda 2) -- CrediScope se posiciona
// como analítica avanzada con IA real, no como "un score".
export default function LogoMark({ size = 24 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: "var(--brand)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
        <line x1="5.5" y1="17" x2="12" y2="12" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="12" y1="12" x2="18.5" y2="6.5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="5.5" cy="17" r="1.7" fill="rgba(255,255,255,0.75)" />
        <circle cx="12" cy="12" r="1.9" fill="#ffffff" />
        <circle cx="18.5" cy="6.5" r="2.3" fill="#f0c96b" />
      </svg>
    </span>
  );
}
