import { useMemo } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { discriminacion } from "../../lib/analisisRetrospectivo.js";
import { GraficoLineas, GraficoBarras } from "./Graficos.jsx";
import { Kpi, MensajeError, Cargando, num, pct, dec } from "./Comunes.jsx";

// ¿El puntaje separa a buenos de malos? Las curvas de la decisión 2 (ROC,
// KS, precisión y sensibilidad), la distribución del puntaje en cada clase
// y la tasa de malos por decil, que tiene que bajar a medida que sube el
// puntaje. Se calcula en el navegador sobre el corte; el AUC y el KS son
// los mismos de la pestaña Resumen (lo controla scripts/probar-estadistica.mjs).

// Para dibujar, una curva de miles de puntos se adelgaza: la forma no cambia.
const adelgazar = (puntos, maximo = 400) => (puntos.length <= maximo ? puntos : puntos.filter((_, i) => i % Math.ceil(puntos.length / maximo) === 0 || i === puntos.length - 1));

export default function PestanaDiscriminacion({ corteId, poblacion }) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const c = useMemo(() => (filas ? discriminacion(filas) : null), [filas]);

  if (error) return <MensajeError mensaje={error} />;
  if (!c) return <Cargando />;
  if (c.auc.auc === null) return <p className="crediscope-muted">Hace falta tener buenos y malos con puntaje para medir la discriminación.</p>;
  const { auc, roc, k, pr, tramos, deciles, rompen } = c;

  return (
    <div>
      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="AUC" valor={dec(auc.auc, 3)} detalle={`entre ${dec(auc.ic[0], 3)} y ${dec(auc.ic[1], 3)} · ${num(auc.malos)} malos, ${num(auc.buenos)} buenos`} />
        <Kpi etiqueta="Gini" valor={dec(auc.gini, 3)} detalle="2 × AUC − 1" />
        <Kpi etiqueta="KS" valor={dec(k.ks, 3)} detalle={`mayor separación en el puntaje ${num(k.puntaje)}`} />
        <Kpi etiqueta="Precisión media" valor={dec(pr.precisionMedia, 3)} detalle={`contra ${pct(pr.base)} de malos al azar`} />
      </div>
      {c.bloqueados ? (
        <p className="crediscope-muted" style={{ fontSize: 13 }}>{num(c.bloqueados)} bloqueados quedan afuera: el control de bloqueo los niega sin puntaje del motor.</p>
      ) : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Curva ROC</h3>
          <GraficoLineas
            series={[{ nombre: "Motor", puntos: adelgazar(roc.puntos).map((p) => ({ x: p.x, y: p.y, titulo: p.puntaje === null ? "inicio" : `rechazando hasta ${p.puntaje}: ${pct(p.y)} de los malos y ${pct(p.x)} de los buenos` })) }]}
            x={{ titulo: "Buenos rechazados (1 − especificidad)", min: 0, max: 1, formato: (v) => pct(v, 0) }}
            y={{ titulo: "Malos detectados (sensibilidad)", min: 0, max: 1, formato: (v) => pct(v, 0) }}
            diagonal
            etiqueta="Curva ROC"
          />
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>KS: acumulado de malos y de buenos</h3>
          <GraficoLineas
            series={[
              { nombre: "Malos", color: "var(--bad)", puntos: adelgazar(k.malos), escalon: true },
              { nombre: "Buenos", color: "var(--good)", puntos: adelgazar(k.buenos), escalon: true },
            ]}
            x={{ titulo: "Puntaje" }}
            y={{ titulo: "Acumulado con ese puntaje o menos", min: 0, max: 1, formato: (v) => pct(v, 0) }}
            referencias={[{ x: k.puntaje, texto: `KS ${dec(k.ks, 2)}` }]}
            etiqueta="Curvas de KS"
          />
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Precisión y sensibilidad</h3>
          <GraficoLineas
            series={[
              { nombre: "Motor", puntos: adelgazar(pr.puntos) },
              { nombre: "Al azar", color: "var(--text-muted)", punteada: true, puntos: [{ x: 0, y: pr.base }, { x: 1, y: pr.base }] },
            ]}
            x={{ titulo: "Malos detectados (sensibilidad)", min: 0, max: 1, formato: (v) => pct(v, 0) }}
            y={{ titulo: "Malos entre los rechazados (precisión)", min: 0, max: 1, formato: (v) => pct(v, 0) }}
            etiqueta="Curva de precisión y sensibilidad"
          />
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Distribución del puntaje por clase</h3>
          <GraficoBarras
            categorias={tramos.map((t) => Math.round(t.desde))}
            series={[
              { nombre: "Malos", color: "var(--bad)", valores: c.malos, formato: (v) => pct(v) },
              { nombre: "Buenos", color: "var(--good)", valores: c.buenos, formato: (v) => pct(v) },
            ]}
            y={{ titulo: "Parte de cada clase", formato: (v) => pct(v, 0) }}
            etiqueta="Distribución del puntaje por clase"
          />
        </div>
      </div>

      <div className="crediscope-card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Tasa de malos por decil de puntaje</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Diez grupos del mismo tamaño, del puntaje más bajo al más alto. Si el motor ordena bien, la tasa baja decil a decil.{" "}
          {rompen ? <strong style={{ color: "var(--warn)" }}>{rompen} decil(es) suben en vez de bajar.</strong> : <strong style={{ color: "var(--good)" }}>Baja en todos.</strong>}
        </p>
        <GraficoBarras
          categorias={deciles.map((d) => `${d.decil}.º`)}
          series={[{ nombre: "Tasa de malos", color: "var(--brand)", valores: deciles.map((d) => d.tasa ?? 0), formato: (v) => pct(v) }]}
          y={{ titulo: "Tasa de malos", formato: (v) => pct(v, 0) }}
          alto={240}
          etiqueta="Tasa de malos por decil"
        />
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Decil</th>
                <th>Puntaje</th>
                <th style={{ textAlign: "right" }}>Personas</th>
                <th style={{ textAlign: "right" }}>Malos</th>
                <th style={{ textAlign: "right" }}>Tasa</th>
                <th style={{ textAlign: "right" }}>Intervalo</th>
              </tr>
            </thead>
            <tbody>
              {deciles.map((d, i) => (
                <tr key={d.decil}>
                  <td>{d.decil}.º</td>
                  <td>{num(d.desde)} a {num(d.hasta)}</td>
                  <td style={{ textAlign: "right" }}>{num(d.n)}</td>
                  <td style={{ textAlign: "right" }}>{num(d.malos)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: i > 0 && d.tasa > deciles[i - 1].tasa ? "var(--warn)" : undefined }}>{pct(d.tasa)}</td>
                  <td style={{ textAlign: "right" }} className="crediscope-muted">{d.ic ? `${pct(d.ic[0])} a ${pct(d.ic[1])}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
