import { useEffect, useMemo, useState } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { getFilasDelCorte } from "../../lib/datosDelCorte.js";
import { compararCortes } from "../../lib/analisisRetrospectivo.js";
import { GraficoLineas } from "./Graficos.jsx";
import { MensajeError, Cargando, GuardarEsteResultado, ETIQUETA_RECOMENDACION, num, pct, dec } from "./Comunes.jsx";

// Dos cortes lado a lado: las mismas medidas, la diferencia y si es más que
// azar. La diferencia de tasas, con chi cuadrado; la de AUC, con una z sobre
// los errores de Hanley-McNeil, que supone cortes con personas distintas
// (si comparten personas, la prueba es conservadora).

const adelgazar = (puntos, maximo = 300) => (puntos.length <= maximo ? puntos : puntos.filter((_, i) => i % Math.ceil(puntos.length / maximo) === 0 || i === puntos.length - 1));
// Lo que se guarda de cada corte: las medidas, sin las curvas punto por punto.
const sinCurvas = ({ roc: _roc, ...medidas }) => medidas;

export default function PestanaComparar({ corte, corteId, cortes, poblacion }) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const otros = cortes.filter((c) => c.id !== corteId);
  const [otroId, setOtroId] = useState(otros[0]?.id ?? null);
  const [otras, setOtras] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    if (!otroId) return undefined;
    let vigente = true;
    const otro = cortes.find((c) => c.id === otroId);
    getFilasDelCorte(otroId, poblacion === "solicitudes" && otro?.resumen?.solicitudes ? "solicitudes" : "operaciones")
      .then((f) => vigente && setOtras({ id: otroId, filas: f }))
      .catch((e) => vigente && setMensaje(e.message));
    return () => {
      vigente = false;
    };
  }, [otroId, cortes, poblacion]);

  const c = useMemo(() => (filas && otras?.id === otroId ? compararCortes(filas, otras.filas) : null), [filas, otras, otroId]);

  if (error) return <MensajeError mensaje={error} />;
  if (!otros.length) return <p className="crediscope-muted">Hace falta otro corte para comparar.</p>;
  const otro = cortes.find((x) => x.id === otroId);

  return (
    <div>
      <div className="crediscope-card">
        <label className="crediscope-muted" style={{ fontSize: 13 }}>
          Comparar «{corte.nombre}» con{" "}
          <select value={otroId ?? ""} onChange={(e) => setOtroId(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
            {otros.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </label>
        {c ? (
          <GuardarEsteResultado
            corteId={corteId} tipo="comparacion" poblacion={poblacion} parametros={{ otro: otroId }}
            resultado={{ otro: otroId, a: sinCurvas(c.a), b: sinCurvas(c.b), pruebaTasa: c.pruebaTasa, pruebaAuc: c.pruebaAuc }}
            texto="Guardar esta comparación"
          />
        ) : null}
      </div>
      <MensajeError mensaje={mensaje} />
      {!c ? (
        <Cargando que="los dos cortes" />
      ) : (
        <>
          <div className="crediscope-card" style={{ overflowX: "auto" }}>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Medida</th>
                  <th style={{ textAlign: "right" }}>{corte.nombre}</th>
                  <th style={{ textAlign: "right" }}>{otro?.nombre}</th>
                  <th>¿Más que azar?</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Observadas</td><td style={{ textAlign: "right" }}>{num(c.a.n)}</td><td style={{ textAlign: "right" }}>{num(c.b.n)}</td><td /></tr>
                <tr>
                  <td>Tasa de malos</td>
                  <td style={{ textAlign: "right" }}>{pct(c.a.tasa)} <span className="crediscope-muted">({num(c.a.malos)})</span></td>
                  <td style={{ textAlign: "right" }}>{pct(c.b.tasa)} <span className="crediscope-muted">({num(c.b.malos)})</span></td>
                  <td>{c.pruebaTasa ? `p = ${dec(c.pruebaTasa.p, 4)}${c.pruebaTasa.p < 0.05 ? " · sí" : " · no"}` : "—"}</td>
                </tr>
                <tr>
                  <td>AUC</td>
                  <td style={{ textAlign: "right" }}>{c.a.auc.auc === null ? "—" : `${dec(c.a.auc.auc, 3)} (${dec(c.a.auc.ic[0], 2)} a ${dec(c.a.auc.ic[1], 2)})`}</td>
                  <td style={{ textAlign: "right" }}>{c.b.auc.auc === null ? "—" : `${dec(c.b.auc.auc, 3)} (${dec(c.b.auc.ic[0], 2)} a ${dec(c.b.auc.ic[1], 2)})`}</td>
                  <td>{c.pruebaAuc ? `p = ${dec(c.pruebaAuc.p, 4)}${c.pruebaAuc.p < 0.05 ? " · sí" : " · no"}` : "—"}</td>
                </tr>
                <tr><td>Gini</td><td style={{ textAlign: "right" }}>{dec(c.a.auc.gini, 3)}</td><td style={{ textAlign: "right" }}>{dec(c.b.auc.gini, 3)}</td><td /></tr>
                <tr><td>KS</td><td style={{ textAlign: "right" }}>{dec(c.a.ks, 3)}</td><td style={{ textAlign: "right" }}>{dec(c.b.ks, 3)}</td><td /></tr>
                <tr><td>Precisión media</td><td style={{ textAlign: "right" }}>{dec(c.a.pr, 3)}</td><td style={{ textAlign: "right" }}>{dec(c.b.pr, 3)}</td><td /></tr>
                {["aprobar", "revisar", "negar", "bloqueado"].filter((r) => c.a.porRecomendacion[r].n || c.b.porRecomendacion[r].n).map((r) => (
                  <tr key={r}>
                    <td>Tasa en «{ETIQUETA_RECOMENDACION[r]}»</td>
                    <td style={{ textAlign: "right" }}>{pct(c.a.porRecomendacion[r].tasa)} <span className="crediscope-muted">({num(c.a.porRecomendacion[r].n)})</span></td>
                    <td style={{ textAlign: "right" }}>{pct(c.b.porRecomendacion[r].tasa)} <span className="crediscope-muted">({num(c.b.porRecomendacion[r].n)})</span></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
              La prueba del AUC supone cortes con personas distintas; si comparten personas, es conservadora (le cuesta más declarar una diferencia).
            </p>
          </div>
          {c.a.roc && c.b.roc ? (
            <div className="crediscope-card">
              <h3 style={{ marginTop: 0 }}>Curvas ROC</h3>
              <GraficoLineas
                series={[
                  { nombre: corte.nombre, puntos: adelgazar(c.a.roc.puntos) },
                  { nombre: otro?.nombre ?? "otro", color: "var(--warn)", puntos: adelgazar(c.b.roc.puntos) },
                ]}
                x={{ titulo: "Buenos rechazados", min: 0, max: 1, formato: (v) => pct(v, 0) }}
                y={{ titulo: "Malos detectados", min: 0, max: 1, formato: (v) => pct(v, 0) }}
                diagonal
                etiqueta="Curvas ROC de los dos cortes"
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
