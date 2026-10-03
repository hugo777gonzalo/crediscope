import { Kpi, Advertencias, Barra, num, pct, dec } from "./Comunes.jsx";

// Desempeño del modelo sobre un corte (diseño, 7.1). Los números los
// calcula lab_calcular_desempeno() en la base; acá sólo se muestran, cada
// uno con su tamaño de muestra.

const ETIQUETA_REC = {
  aprobar: "Aprobar",
  revisar: "Revisar",
  negar: "Negar",
  bloqueado: "Negado por bloqueo",
  "sin recomendación": "Sin recomendación (marcos viejos)",
};

// El ruido medido del modelo (2026-10-03): el mismo perfil dos veces mueve
// el score ~40 puntos y cambia 1 de 13 recomendaciones.
const NOTA_RUIDO = "El mismo perfil analizado dos veces mueve el puntaje ~40 puntos: una diferencia menor que eso no se atribuye a nada.";

export default function PestanaDesempeno({ resultado }) {
  if (!resultado) return <p className="crediscope-muted">Todavía no se calculó.</p>;
  const r = resultado.resultado;
  const maxTasa = Math.max(0.0001, ...(r.por_tramo ?? []).map((t) => Number(t.tasa)));
  const lecturaAuc = r.auc == null ? null : r.auc >= 0.75 ? "ordena bien" : r.auc >= 0.65 ? "ordena" : r.auc > 0.55 ? "ordena poco" : "no ordena";

  return (
    <div>
      <Advertencias lista={r.advertencias} />
      <div className="crediscope-kpi-grid">
        <Kpi
          etiqueta="AUC del puntaje"
          valor={dec(r.auc, 3)}
          detalle={r.auc_intervalo ? `95%: ${dec(r.auc_intervalo[0], 3)} a ${dec(r.auc_intervalo[1], 3)} · ${lecturaAuc}` : "Hacen falta buenos y malos"}
        />
        <Kpi etiqueta="Gini" valor={dec(r.gini, 3)} detalle="2 × AUC − 1" />
        <Kpi etiqueta="KS" valor={dec(r.ks, 3)} detalle="Mayor separación entre buenos y malos" />
        <Kpi etiqueta="Operaciones con puntaje" valor={num(r.n)} detalle={`${num(r.n_malos)} malos (${pct(r.n ? r.n_malos / r.n : null)})`} />
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Tasa de impago por recomendación</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Aprobar y revisar cuentan como aprobados por el motor. Lo que cuesta cada error: un <strong>aprobado que cayó</strong> es
          capital perdido; un <strong>negado que habría pagado</strong> es negocio perdido.
        </p>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Recomendación</th>
              <th style={{ textAlign: "right" }}>Operaciones</th>
              <th style={{ textAlign: "right" }}>Malos</th>
              <th style={{ textAlign: "right" }}>Tasa</th>
              <th style={{ textAlign: "right" }}>Intervalo 95%</th>
            </tr>
          </thead>
          <tbody>
            {(r.por_recomendacion ?? []).map((x) => (
              <tr key={x.recomendacion}>
                <td>{ETIQUETA_REC[x.recomendacion] ?? x.recomendacion}</td>
                <td style={{ textAlign: "right" }}>{num(x.n)}</td>
                <td style={{ textAlign: "right" }}>{num(x.malos)}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(x.tasa)}</td>
                <td style={{ textAlign: "right" }} className="crediscope-muted">{pct(x.intervalo?.[0])} a {pct(x.intervalo?.[1])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Tasa de impago por tramo de puntaje</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Tiene que bajar a medida que sube el puntaje. Si no baja, el puntaje no ordena, diga lo que diga el AUC. Sin los negados
          por bloqueo (su puntaje lo fuerza la política).
        </p>
        {(r.por_tramo ?? []).map((t) => (
          <Barra
            key={t.desde}
            etiqueta={`${t.desde} a ${t.hasta}`}
            valor={Number(t.tasa)}
            maximo={maxTasa}
            texto={`${pct(t.tasa)} · ${num(t.malos)} de ${num(t.n)}`}
            color={Number(t.tasa) > 0.15 ? "var(--bad)" : Number(t.tasa) > 0.07 ? "var(--warn)" : "var(--good)"}
          />
        ))}
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{NOTA_RUIDO}</p>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Por versión del marco</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>Nunca se mezclan versiones en un número.</p>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Versión</th>
              <th style={{ textAlign: "right" }}>Operaciones</th>
              <th style={{ textAlign: "right" }}>Malos</th>
              <th style={{ textAlign: "right" }}>Tasa</th>
              <th style={{ textAlign: "right" }}>AUC</th>
            </tr>
          </thead>
          <tbody>
            {(r.por_version ?? []).map((v) => (
              <tr key={v.version}>
                <td>{v.version === "sintetico" ? "Puntaje sintético" : v.version}</td>
                <td style={{ textAlign: "right" }}>{num(v.n)}</td>
                <td style={{ textAlign: "right" }}>{num(v.malos)}</td>
                <td style={{ textAlign: "right" }}>{pct(v.tasa)}</td>
                <td style={{ textAlign: "right" }}>{dec(v.auc, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
