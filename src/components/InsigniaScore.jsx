// Rangos ilustrativos (draft) — el score es una ESTIMACIÓN APROXIMADA de
// un LLM guiado por el marco interpretativo, no una fórmula. Ver
// supabase/functions/_shared/marco-interpretativo.ts.
function scoreClass(score) {
  if (score >= 700) return "crediscope-score-good";
  if (score >= 400) return "crediscope-score-mid";
  return "crediscope-score-bad";
}

export default function InsigniaScore({ score, rulesVersion }) {
  return (
    <div>
      <div className={`crediscope-score ${scoreClass(score)}`}>{score}</div>
      <div className="crediscope-muted">Score CrediScope (1–999, aproximado) · marco {rulesVersion}</div>
    </div>
  );
}
