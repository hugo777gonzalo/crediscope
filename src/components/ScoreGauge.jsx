// Score como arco, no como número suelto: el analista necesita ver de
// un vistazo dónde cae dentro del rango, y 890 sobre un arco casi lleno
// se lee más rápido que "890" en texto.
//
// El máximo es 999, no 1.000: es el rango real del score (1-999), y
// redondearlo a mil en la pantalla haría que un 999 no se vea como el
// tope que es.

const MAX_SCORE = 999;

function colorScore(score) {
  if (score >= 700) return "var(--good)";
  if (score >= 400) return "var(--warn)";
  return "var(--bad)";
}

// leyendaSinScore: en Análisis con IA la falta de score es "todavía no se
// analizó"; en Aval es "no hay historial crediticio". Son dos huecos
// distintos y la leyenda tiene que decir cuál.
export default function ScoreGauge({ score, size = 190, leyendaSinScore = "sin analizar" }) {
  const tieneScore = score !== null && score !== undefined;
  const valor = tieneScore ? Math.max(1, Math.min(MAX_SCORE, score)) : 0;

  // Arco de 260°, abierto abajo (el hueco deja lugar al "/ 999" sin
  // encimarse con el trazo).
  const grados = 260;
  const radio = size / 2 - 14;
  const centro = size / 2;
  const circunferencia = 2 * Math.PI * radio;
  const largoArco = (grados / 360) * circunferencia;
  const proporcion = valor / MAX_SCORE;

  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ transform: `rotate(${90 + (360 - grados) / 2}deg)` }} aria-hidden="true">
        <circle
          cx={centro}
          cy={centro}
          r={radio}
          fill="none"
          stroke="var(--panel-muted)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${largoArco} ${circunferencia}`}
        />
        {tieneScore ? (
          <circle
            cx={centro}
            cy={centro}
            r={radio}
            fill="none"
            stroke={colorScore(valor)}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${largoArco * proporcion} ${circunferencia}`}
            style={{ transition: "stroke-dasharray 600ms ease" }}
          />
        ) : null}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <span style={{ fontSize: size * 0.27, fontWeight: 700, lineHeight: 1, color: tieneScore ? colorScore(valor) : "var(--text-muted)" }}>
          {tieneScore ? valor : "—"}
        </span>
        <span className="crediscope-muted" style={{ fontSize: size < 160 ? 12 : 14 }}>
          {tieneScore ? `/ ${MAX_SCORE}` : leyendaSinScore}
        </span>
      </div>
    </div>
  );
}
