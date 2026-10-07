import { useEffect, useMemo, useState } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { getCatalogoUnaVez } from "../../lib/datosDelCorte.js";
import { losQueCayeron } from "../../lib/analisisProfundo.js";
import { useGuardarResultado } from "../../lib/useGuardarResultado.js";
import { MensajeError, Cargando, SinGuardar, Etiqueta, num, pct, dec } from "./Comunes.jsx";

// Variables de los que cayeron (módulo 6 del negocio): dentro de una misma
// recomendación, en qué se diferencian los que cayeron de los que pagaron.
// Entre los que el modelo dio por buenos (aprobar o revisar: "no impago",
// decisión del negocio del 2026-10-06) es la pregunta de fondo: ¿qué tenían
// distinto los que no pagaron? Más las combinaciones de dos condiciones que
// juntas pesan más que cada una y las variables cuyo riesgo da la vuelta
// (sube y después baja).

const pTexto = (p) => (p === null || p === undefined ? "—" : p < 0.0001 ? "< 0,0001" : dec(p, 4));
const valor = (x) => (x === null || x === undefined ? "—" : Math.abs(x) >= 1000 ? num(x) : dec(x, 2));

export default function PestanaLosQueCayeron({ corteId, poblacion }) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const [catalogo, setCatalogo] = useState(null);
  const [recomendacion, setRecomendacion] = useState("no_impago");
  useEffect(() => {
    getCatalogoUnaVez().then(setCatalogo).catch(() => setCatalogo([]));
  }, []);
  const r = useMemo(() => (filas && catalogo ? losQueCayeron(filas, catalogo, recomendacion) : null), [filas, catalogo, recomendacion]);
  // Es la evidencia sobre los que el modelo dio por buenos y cayeron (decisión
  // del negocio del 2026-10-06): va al informe.
  const sinGuardar = useGuardarResultado({ corteId, tipo: "los_que_cayeron", poblacion, parametros: { recomendacion }, resultado: r && !r.insuficiente ? r : null });

  if (error) return <MensajeError mensaje={error} />;
  if (!r) return <Cargando />;

  return (
    <div>
      <SinGuardar error={sinGuardar} />
      <div className="crediscope-card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="crediscope-muted" style={{ fontSize: 13 }}>Entre los que el motor dijo</span>
        <select value={recomendacion} onChange={(e) => setRecomendacion(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
          <option value="no_impago">aprobar o revisar (no impago)</option>
          <option value="aprobar">aprobar</option>
          <option value="revisar">revisar</option>
          <option value="todos">cualquier cosa</option>
        </select>
        <span>{num(r.malos)} cayeron · {num(r.buenos)} pagaron</span>
      </div>
      {r.insuficiente ? (
        <p className="crediscope-muted">Hacen falta 5 que cayeron y 5 que pagaron para comparar.</p>
      ) : (
        <>
          {r.malos < 30 ? (
            <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
              <p style={{ margin: 0, fontSize: 13.5 }}>Con {r.malos} que cayeron, las diferencias orientan pero no prueban: mirar las que sobreviven a la corrección (q).</p>
            </div>
          ) : null}
          <div className="crediscope-card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>En qué se diferencian</h3>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Los que cayeron</th>
                  <th>Los que pagaron</th>
                  <th style={{ textAlign: "right" }}>Efecto</th>
                  <th style={{ textAlign: "right" }}>q</th>
                  <th style={{ textAlign: "right" }}>Sin dato (cayeron / pagaron)</th>
                  <th>El modelo</th>
                </tr>
              </thead>
              <tbody>
                {r.diferencias.slice(0, 25).map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.nombre}</strong><div className="crediscope-muted" style={{ fontSize: 12 }}>{d.grupo}</div></td>
                    {d.tipo === "numero" ? (
                      <>
                        <td>media {valor(d.mediaMalos)}</td>
                        <td>media {valor(d.mediaBuenos)}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontSize: 12.5 }}>{d.categorias?.slice(0, 3).map((c) => `${c.valor} ${pct(c.malos, 0)}`).join(" · ")}</td>
                        <td style={{ fontSize: 12.5 }}>{d.categorias?.slice(0, 3).map((c) => `${c.valor} ${pct(c.buenos, 0)}`).join(" · ")}</td>
                      </>
                    )}
                    <td style={{ textAlign: "right" }} title={d.tipo === "numero" ? "delta de Cliff" : "V de Cramér"}>{dec(d.efecto, 3)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: d.q !== null && d.q < 0.05 ? "var(--bad)" : undefined }}>{pTexto(d.q)}</td>
                    <td style={{ textAlign: "right" }}>{pct(d.faltaMalos, 0)} / {pct(d.faltaBuenos, 0)}</td>
                    <td>{d.uso === "protegida" ? <Etiqueta texto="protegida" color="var(--warn)" /> : d.enModelo ? "La recibe" : <Etiqueta texto="No la recibe" color="var(--bad)" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
              Efecto: delta de Cliff para las numéricas (positivo: los que cayeron tienen más), V de Cramér para el resto. q corrige por las {num(r.diferencias.length)} comparaciones.
            </p>
          </div>

          <div className="crediscope-card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Combinaciones que pesan más juntas</h3>
            {r.combinaciones.length ? (
              <table className="crediscope-table">
                <thead>
                  <tr><th>Las dos condiciones</th><th style={{ textAlign: "right" }}>Personas</th><th style={{ textAlign: "right" }}>Tasa con las dos</th><th style={{ textAlign: "right" }}>Cada una sola</th><th style={{ textAlign: "right" }}>Refuerzo</th></tr>
                </thead>
                <tbody>
                  {r.combinaciones.slice(0, 10).map((c) => (
                    <tr key={`${c.a}${c.b}`}>
                      <td>{c.a} <span className="crediscope-muted">y</span> {c.b}</td>
                      <td style={{ textAlign: "right" }}>{num(c.n)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(c.tasa)} <span className="crediscope-muted">({pct(c.ic[0])} a {pct(c.ic[1])})</span></td>
                      <td style={{ textAlign: "right" }}>{pct(c.tasaA)} · {pct(c.tasaB)}</td>
                      <td style={{ textAlign: "right", color: c.refuerzo > 1.5 ? "var(--bad)" : undefined }}>{c.refuerzo === null ? "—" : `× ${dec(c.refuerzo, 2)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="crediscope-muted" style={{ margin: 0 }}>Ninguna: hacen falta variables con diferencia (q menor a 0,2) y 20 personas o más con las dos condiciones.</p>
            )}
            <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Refuerzo: la tasa con las dos condiciones dividida por la mayor de las dos solas. Más de 1,5: juntas dicen algo que ninguna dice sola.</p>
          </div>

          <div className="crediscope-card">
            <h3 style={{ marginTop: 0 }}>Variables cuyo riesgo da la vuelta</h3>
            {r.noLineales.length ? r.noLineales.map((v) => (
              <p key={v.id} style={{ fontSize: 13.5 }}>
                <strong>{v.nombre}</strong> {v.forma} (p {pTexto(v.p)}): {v.tramos.map((t) => `${t.tramo} ${pct(t.tasa)}`).join(" · ")}
              </p>
            )) : (
              <p className="crediscope-muted" style={{ margin: 0 }}>
                Ninguna: en todas el riesgo va en una sola dirección (o la vuelta no es significativa en las dos puntas). Una regla "más es peor" las lee bien.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
