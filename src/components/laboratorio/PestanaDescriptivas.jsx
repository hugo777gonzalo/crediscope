import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useColumnasDelCorte } from "../../lib/useFilasDelCorte.js";
import { descriptivasNumericas, descriptivasCategoricas } from "../../lib/analisisEstadistico.js";
import { MensajeError, Cargando, num, pct, dec } from "./Comunes.jsx";

// Descriptivas de cada variable del corte: las numéricas con su forma
// (asimetría, curtosis, atípicos) y la diferencia entre malos y buenos; las
// categóricas y los sí/no con sus frecuencias y la tasa de malos de cada
// categoría. Asimetría y curtosis son las de Excel (G1 y G2); atípicos, la
// regla de Tukey.

const n2 = (x) => (x === null || x === undefined ? "—" : Math.abs(x) >= 1000 ? num(x) : dec(x, 2));

function FilaCategorica({ d }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <tr onClick={() => setAbierta(!abierta)} style={{ cursor: "pointer" }}>
        <td>
          {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <strong>{d.nombre}</strong>
          <div className="crediscope-muted" style={{ fontSize: 12 }}>{d.grupo} · {d.tipo === "booleano" ? "sí/no" : "categoría"}</div>
        </td>
        <td style={{ textAlign: "right" }}>{num(d.n)}</td>
        <td style={{ textAlign: "right" }}>{num(d.faltantes)}</td>
        <td style={{ textAlign: "right" }}>{num(d.cardinalidad)}</td>
        <td>{d.dominante ? `${d.dominante.valor} (${pct(d.dominante.parte, 0)})` : "—"}</td>
      </tr>
      {abierta ? (
        <tr>
          <td colSpan={5} style={{ background: "var(--panel-muted)" }}>
            <table className="crediscope-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th style={{ textAlign: "right" }}>Personas</th>
                  <th style={{ textAlign: "right" }}>Malos</th>
                  <th style={{ textAlign: "right" }}>Tasa</th>
                  <th style={{ textAlign: "right" }}>Intervalo</th>
                </tr>
              </thead>
              <tbody>
                {d.categorias.map((c) => (
                  <tr key={c.valor}>
                    <td>{c.valor}</td>
                    <td style={{ textAlign: "right" }}>{num(c.n)}</td>
                    <td style={{ textAlign: "right" }}>{num(c.malos)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(c.tasa)}</td>
                    <td style={{ textAlign: "right" }} className="crediscope-muted">{c.ic ? `${pct(c.ic[0])} a ${pct(c.ic[1])}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function PestanaDescriptivas({ corteId, poblacion }) {
  const { datos, error } = useColumnasDelCorte(corteId, poblacion);
  const [porClase, setPorClase] = useState(false);
  const c = useMemo(() => (datos ? { numericas: descriptivasNumericas(datos), categoricas: descriptivasCategoricas(datos) } : null), [datos]);
  if (error) return <MensajeError mensaje={error} />;
  if (!c) return <Cargando que="las variables del corte" />;

  return (
    <div>
      <div className="crediscope-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Numéricas ({c.numericas.length})</h3>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={porClase} onChange={(e) => setPorClase(e.target.checked)} /> Mostrar malos contra buenos
          </label>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              {porClase ? (
                <tr>
                  <th>Variable</th>
                  <th style={{ textAlign: "right" }}>Media malos</th>
                  <th style={{ textAlign: "right" }}>Media buenos</th>
                  <th style={{ textAlign: "right" }}>Mediana malos</th>
                  <th style={{ textAlign: "right" }}>Mediana buenos</th>
                </tr>
              ) : (
                <tr>
                  <th>Variable</th>
                  <th style={{ textAlign: "right" }}>Con dato</th>
                  <th style={{ textAlign: "right" }}>Media</th>
                  <th style={{ textAlign: "right" }}>Mediana</th>
                  <th style={{ textAlign: "right" }}>Desvío</th>
                  <th style={{ textAlign: "right" }}>P5 – P95</th>
                  <th style={{ textAlign: "right" }}>Asimetría</th>
                  <th style={{ textAlign: "right" }}>Curtosis</th>
                  <th style={{ textAlign: "right" }}>Coef. de variación</th>
                  <th style={{ textAlign: "right" }}>Ceros</th>
                  <th style={{ textAlign: "right" }}>Atípicos</th>
                </tr>
              )}
            </thead>
            <tbody>
              {c.numericas.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.nombre}</strong><div className="crediscope-muted" style={{ fontSize: 12 }}>{d.grupo}{d.faltantes ? ` · ${num(d.faltantes)} sin dato` : ""}</div></td>
                  {porClase ? (
                    <>
                      <td style={{ textAlign: "right" }}>{n2(d.mediaMalos)}</td>
                      <td style={{ textAlign: "right" }}>{n2(d.mediaBuenos)}</td>
                      <td style={{ textAlign: "right" }}>{n2(d.medianaMalos)}</td>
                      <td style={{ textAlign: "right" }}>{n2(d.medianaBuenos)}</td>
                    </>
                  ) : (
                    <>
                      <td style={{ textAlign: "right" }}>{num(d.n)}</td>
                      <td style={{ textAlign: "right" }}>{n2(d.media)}</td>
                      <td style={{ textAlign: "right" }}>{n2(d.mediana)}</td>
                      <td style={{ textAlign: "right" }}>{n2(d.desvio)}</td>
                      <td style={{ textAlign: "right" }}>{n2(d.p5)} – {n2(d.p95)}</td>
                      <td style={{ textAlign: "right" }}>{n2(d.asimetria)}</td>
                      <td style={{ textAlign: "right" }}>{n2(d.curtosis)}</td>
                      <td style={{ textAlign: "right" }}>{d.cv === null ? "—" : pct(d.cv, 0)}</td>
                      <td style={{ textAlign: "right" }}>{d.n ? pct(d.ceros / d.n, 0) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{num(d.atipicos)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Categóricas y sí/no ({c.categoricas.length})</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th style={{ textAlign: "right" }}>Con dato</th>
                <th style={{ textAlign: "right" }}>Sin dato</th>
                <th style={{ textAlign: "right" }}>Categorías</th>
                <th>La más frecuente</th>
              </tr>
            </thead>
            <tbody>
              {c.categoricas.map((d) => <FilaCategorica key={d.id} d={d} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
