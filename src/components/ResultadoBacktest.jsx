import { TrendingUp, TrendingDown, AlertOctagon } from "lucide-react";

// Resultado de probar un ajuste contra los créditos reales. La lectura
// que importa es de dos lados: cuántos incumplimientos habríamos
// frenado, y a cuántos clientes buenos habríamos rechazado de más. Un
// ajuste que mejora lo primero empeorando mucho lo segundo no es una
// mejora, y la pantalla tiene que mostrar las dos cosas con el mismo
// peso visual.

const ETIQUETA_RECOMENDACION = {
  aprobar: "Aprobar",
  revisar: "Revisar",
  observar: "Observar",
  negar: "Negar",
};

function textoRecomendacion(valor) {
  return ETIQUETA_RECOMENDACION[valor] ?? "—";
}

export default function ResultadoBacktest({ backtest }) {
  if (!backtest) return null;
  const c = backtest.comparativa ?? {};
  const resultados = Array.isArray(backtest.resultados) ? backtest.resultados : [];
  const mejora = c.mejoraEnDeteccion ?? 0;
  const costo = c.costoEnClientesBuenos ?? 0;

  return (
    <div className="crediscope-card">
      <h3>Resultado de la prueba</h3>
      <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
        Se volvieron a evaluar {backtest.casos_evaluados} créditos reales con el criterio ajustado, usando la información tal como
        estaba el día del análisis original. Probado el {new Date(backtest.created_at).toLocaleDateString("es-EC")}.
        {c.casosSinComparacion ? (
          <>
            {" "}
            <strong>{c.casosSinComparacion}</strong> de esos casos no entran en la comparación de abajo: son análisis anteriores a
            que existiera la recomendación de acción, así que no hay con qué contrastarlos.
          </>
        ) : null}
      </p>

      {c.posibleSobreajuste ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            background: "var(--panel-muted)",
            border: "1px solid var(--warn)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 14,
          }}
        >
          <AlertOctagon size={18} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            <strong>Atención:</strong> con este ajuste el modelo frena a todos los clientes de la muestra, incluidos los que
            pagaron bien. Eso no es mejor criterio: es un modelo que dejó de distinguir. Conviene revisar el texto del ajuste
            antes de ponerlo en vigencia.
          </p>
        </div>
      ) : null}

      <div className="crediscope-kpi-grid">
        <div className="crediscope-card crediscope-kpi">
          <p className="crediscope-kpi-label">Incumplimientos que se habrían frenado</p>
          <p className="crediscope-kpi-valor" style={{ color: mejora > 0 ? "var(--good)" : undefined }}>
            {c.incumplimientosDetectadosDespues ?? 0}
            <span style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 400 }}> / {c.incumplimientosEvaluados ?? 0}</span>
          </p>
          <p className="crediscope-kpi-detalle">
            {mejora > 0 ? (
              <span style={{ color: "var(--good)" }}>
                <TrendingUp size={13} style={{ verticalAlign: "-2px" }} /> {mejora} más que antes
              </span>
            ) : mejora < 0 ? (
              <span style={{ color: "var(--bad)" }}>
                <TrendingDown size={13} style={{ verticalAlign: "-2px" }} /> {Math.abs(mejora)} menos que antes
              </span>
            ) : (
              "Sin cambios respecto al criterio actual"
            )}
          </p>
        </div>

        <div className="crediscope-card crediscope-kpi">
          <p className="crediscope-kpi-label">Clientes buenos que se habrían frenado</p>
          <p className="crediscope-kpi-valor" style={{ color: costo > 0 ? "var(--bad)" : undefined }}>
            {c.buenosFrenadosDespues ?? 0}
            <span style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 400 }}> / {c.buenosEvaluados ?? 0}</span>
          </p>
          <p className="crediscope-kpi-detalle">
            {costo > 0 ? (
              <span style={{ color: "var(--bad)" }}>{costo} más que antes — este es el costo del ajuste</span>
            ) : costo < 0 ? (
              <span style={{ color: "var(--good)" }}>{Math.abs(costo)} menos que antes</span>
            ) : (
              "Sin cambios respecto al criterio actual"
            )}
          </p>
        </div>

        <div className="crediscope-card crediscope-kpi">
          <p className="crediscope-kpi-label">Cambio promedio de score</p>
          <p className="crediscope-kpi-valor">
            {(c.promedioCambioScore ?? 0) > 0 ? "+" : ""}
            {c.promedioCambioScore ?? 0}
          </p>
          <p className="crediscope-kpi-detalle">Sobre los {backtest.casos_evaluados} casos evaluados</p>
        </div>
      </div>

      <table className="crediscope-table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>Cédula</th>
            <th>Resultado real</th>
            <th>Antes</th>
            <th>Con el ajuste</th>
          </tr>
        </thead>
        <tbody>
          {resultados.map((r, i) => {
            const cambio = r.despues && r.antes?.recomendacion && r.despues.recomendacion !== r.antes.recomendacion;
            return (
              <tr key={i}>
                <td>{r.cedula}</td>
                <td style={{ color: r.huboDefault ? "var(--bad)" : "var(--good)", fontWeight: 600 }}>
                  {r.huboDefault ? `Incumplió${r.tipoDefault ? ` (${r.tipoDefault})` : ""}` : "Pagó bien"}
                </td>
                <td>
                  {r.antes?.score ?? "—"} · {textoRecomendacion(r.antes?.recomendacion)}
                </td>
                <td style={cambio ? { fontWeight: 600 } : undefined}>
                  {r.despues ? `${r.despues.score} · ${textoRecomendacion(r.despues.recomendacion)}` : "error al evaluar"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
