import { Advertencias, Kpi, ETIQUETA_RECOMENDACION, num, pct } from "./Comunes.jsx";

// Las cuatro poblaciones del ciclo de un año (docs/laboratorio-de-riesgo.md,
// sección 14): recomendación × si la institución desembolsó. Con crédito, el
// resultado lo dice el archivo; sin crédito, la reconsulta del buró, y sólo
// de quien tuvo crédito con alguien. Lo cuenta lab_contar_cuadrantes().

const ORDEN = ["aprobar", "revisar", "negar", "bloqueado", "sin recomendación"];

export default function PestanaCuadrantes({ resultado }) {
  if (!resultado) return <p className="crediscope-muted">Todavía no se calculó.</p>;
  const r = resultado.resultado;
  const celda = new Map((r.cuadrantes ?? []).map((c) => [`${c.recomendacion}|${c.desembolsada}`, c]));
  const filas = ORDEN.filter((rec) => celda.has(`${rec}|true`) || celda.has(`${rec}|false`));
  const observadosNegados = Number(r.negados_que_cayeron_con_otro ?? 0) + Number(r.negados_que_pagaron_con_otro ?? 0);

  return (
    <div>
      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Aprobados que cayeron" valor={num(r.aprobados_que_cayeron)} detalle="Capital perdido (aprobar o revisar, con el crédito de la institución)" color="var(--bad)" />
        <Kpi
          etiqueta="Negados que cayeron con otro"
          valor={num(r.negados_que_cayeron_con_otro)}
          detalle={`de ${num(r.negados_sin_credito)} negados sin crédito; el modelo acertó`}
        />
        <Kpi
          etiqueta="Negados que pagaron con otro"
          valor={num(r.negados_que_pagaron_con_otro)}
          detalle={`de ${num(r.negados_con_credito_de_otro)} a los que otro les prestó; negocio perdido`}
          color="var(--warn)"
        />
        <Kpi etiqueta="Negados sin observar" valor={num(r.negados_sin_observar)} detalle="Nadie les prestó: no se sabe si habrían pagado" />
      </div>

      {observadosNegados > 0 ? (
        <p style={{ fontSize: 13.5 }}>
          De los negados que se pudieron observar, cayó el <strong>{pct(Number(r.negados_que_cayeron_con_otro) / observadosNegados)}</strong>. Los
          negados que la institución financió igual: {num(r.negados_desembolsados)}, de los que cayeron {num(r.negados_desembolsados_que_cayeron)}.
        </p>
      ) : null}

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Recomendación × crédito</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th rowSpan={2}>Recomendación</th>
                <th colSpan={3} style={{ textAlign: "center" }}>Con el crédito de la institución</th>
                <th colSpan={5} style={{ textAlign: "center" }}>Sin crédito (lo dice el buró)</th>
              </tr>
              <tr>
                <th style={{ textAlign: "right" }}>Créditos</th>
                <th style={{ textAlign: "right" }}>Malos</th>
                <th style={{ textAlign: "right" }}>Tasa</th>
                <th style={{ textAlign: "right" }}>Solicitudes</th>
                <th style={{ textAlign: "right" }}>Observadas</th>
                <th style={{ textAlign: "right" }}>Cayeron</th>
                <th style={{ textAlign: "right" }}>Tasa</th>
                <th style={{ textAlign: "right" }}>En un crédito nuevo / en uno que tenía</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((rec) => {
                const con = celda.get(`${rec}|true`);
                const sin = celda.get(`${rec}|false`);
                return (
                  <tr key={rec}>
                    <td>{ETIQUETA_RECOMENDACION[rec] ?? rec}</td>
                    <td style={{ textAlign: "right" }}>{num(con?.observadas ?? 0)}</td>
                    <td style={{ textAlign: "right" }}>{num(con?.malos ?? 0)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{con ? pct(con.tasa) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{num(sin?.solicitudes ?? 0)}</td>
                    <td style={{ textAlign: "right" }}>{num(sin?.observadas ?? 0)}</td>
                    <td style={{ textAlign: "right" }}>{num(sin?.malos ?? 0)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{sin?.observadas ? pct(sin.tasa) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{sin ? `${num(sin.malos_en_credito_nuevo)} / ${num(sin.malos_en_credito_previo)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          "Observadas": tuvieron crédito con alguien en el año, nuevo o de antes. Las tasas de las dos mitades no se comparan una a una: una sale de nuestro
          crédito y la otra, del de otra institución.
        </p>
      </div>

      <Advertencias lista={r.advertencias} />
    </div>
  );
}
