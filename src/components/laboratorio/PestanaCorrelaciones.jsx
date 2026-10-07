import { useMemo, useState } from "react";
import { useColumnasDelCorte } from "../../lib/useFilasDelCorte.js";
import { correlaciones, parDeVariables } from "../../lib/analisisEstadistico.js";
import { MapaDeCalor } from "./Graficos.jsx";
import { MensajeError, Cargando, SinGuardar, Etiqueta, num, dec } from "./Comunes.jsx";
import { useGuardarResultado } from "../../lib/useGuardarResultado.js";

// Correlaciones entre las variables numéricas y sí/no del corte (Pearson o
// Spearman), su correlación con el resultado, los pares casi iguales y el
// VIF: una variable con VIF mayor que 10 se explica casi entera por las
// otras (redundante). Al tocar una celda, el par con los tres coeficientes
// (Kendall incluido, que se cuenta par por par). Las categóricas se asocian
// con el resultado por V de Cramér.

const pTexto = (p) => (p === null || p === undefined ? "—" : p < 0.0001 ? "< 0,0001" : dec(p, 4));

export default function PestanaCorrelaciones({ corteId, poblacion }) {
  const { datos, error } = useColumnasDelCorte(corteId, poblacion);
  const [metodo, setMetodo] = useState("spearman");
  const [par, setPar] = useState(null);
  const c = useMemo(() => (datos ? correlaciones(datos, metodo) : null), [datos, metodo]);
  const sinGuardar = useGuardarResultado({ corteId, tipo: "correlaciones", poblacion, parametros: { metodo }, resultado: c });
  const detalle = useMemo(() => {
    if (!par || !datos || !c) return null;
    const a = datos.columnas.find((x) => x.id === c.variables[par[0]].id), b = datos.columnas.find((x) => x.id === c.variables[par[1]].id);
    return { a, b, ...parDeVariables(a, b) };
  }, [par, datos, c]);

  if (error) return <MensajeError mensaje={error} />;
  if (!c) return <Cargando que="las variables del corte" />;

  return (
    <div>
      <SinGuardar error={sinGuardar} />
      <div className="crediscope-card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="crediscope-muted" style={{ fontSize: 13 }}>Coeficiente</span>
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
          <option value="spearman">Spearman (por rangos: no le importan los valores extremos)</option>
          <option value="pearson">Pearson (lineal)</option>
        </select>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Matriz ({c.variables.length} variables)</h3>
        <MapaDeCalor filas={c.variables.map((v) => v.nombre)} columnas={c.variables.map((v) => v.nombre)} valor={(i, j) => c.matriz[i][j]} alAbrir={(i, j) => setPar([i, j])} etiqueta="Matriz de correlación" />
        {detalle ? (
          <div className="crediscope-card" style={{ background: "var(--panel-muted)", marginBottom: 0 }}>
            <strong>{detalle.a.nombre} × {detalle.b.nombre}</strong>
            <table className="crediscope-table" style={{ margin: "6px 0 0" }}>
              <tbody>
                {[["Pearson", detalle.pearson], ["Spearman", detalle.spearman], ["Kendall (tau-b)", detalle.kendall]].map(([nombre, r]) => (
                  <tr key={nombre}>
                    <td>{nombre}</td>
                    <td style={{ textAlign: "right" }}>{dec(r.r, 3)}</td>
                    <td style={{ textAlign: "right" }} className="crediscope-muted">p {pTexto(r.p)} · {num(r.n)} pares</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Tocá una celda para ver el par con los tres coeficientes.</p>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Con el resultado</h3>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th style={{ textAlign: "right" }}>Correlación con "cayó"</th>
                <th style={{ textAlign: "right" }}>p</th>
              </tr>
            </thead>
            <tbody>
              {c.conResultado.slice(0, 15).map((v) => (
                <tr key={v.id}>
                  <td>{v.nombre} {!v.enModelo && v.uso !== "protegida" ? <Etiqueta texto="el modelo no la recibe" color="var(--bad)" /> : null}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{dec(v.r, 3)}</td>
                  <td style={{ textAlign: "right" }} className="crediscope-muted">{pTexto(v.p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.categoricas.length ? (
            <>
              <h4 style={{ margin: "12px 0 4px" }}>Categóricas (V de Cramér)</h4>
              <table className="crediscope-table">
                <tbody>
                  {c.categoricas.map((v) => (
                    <tr key={v.id}>
                      <td>{v.nombre}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{dec(v.v, 3)}</td>
                      <td style={{ textAlign: "right" }} className="crediscope-muted">p {pTexto(v.p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Redundancia</h3>
          <h4 style={{ margin: "0 0 4px" }}>Pares con correlación de 0,7 o más</h4>
          {c.pares.length ? (
            <ul style={{ marginTop: 0, fontSize: 13 }}>
              {c.pares.slice(0, 12).map((p) => <li key={`${p.a}${p.b}`}>{p.a} × {p.b}: <strong>{dec(p.r, 2)}</strong></li>)}
            </ul>
          ) : <p className="crediscope-muted">Ninguno.</p>}
          <h4 style={{ margin: "8px 0 4px" }}>VIF (sobre {num(c.filasCompletas)} filas completas)</h4>
          <table className="crediscope-table">
            <tbody>
              {c.vif.filter((v) => v.vif !== null).slice(0, 12).map((v) => (
                <tr key={v.id}>
                  <td>{v.nombre}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: v.vif > 10 ? "var(--bad)" : v.vif > 5 ? "var(--warn)" : undefined }}>
                    {Number.isFinite(v.vif) ? dec(v.vif, 1) : "∞"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Más de 5, mirar; más de 10, redundante; ∞, es combinación exacta de otras. Sin VIF (cobertura menor al 80% o constantes): {c.sinVif.join(", ") || "ninguna"}.
          </p>
        </div>
      </div>
    </div>
  );
}
