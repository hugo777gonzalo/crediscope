import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Brain, Database, AlertTriangle } from "lucide-react";
import { getConsumoLlm } from "../lib/api.js";
import { agrupar, totales, promedioMedido, soloExitosas, num, centavos, money2 } from "../lib/consumoLlm.js";

// Lo que cuesta UNA consulta y por qué cuesta eso.
//
// Es la pantalla que sostiene la decisión de precio, así que no alcanza
// con el promedio: hace falta ver hacia dónde se mueve y qué lo mueve.
// El hallazgo que motivó esta vista es que el costo no creció por
// volumen ni porque el marco interpretativo se hiciera más largo, sino
// porque cada criterio nuevo le da al modelo una cosa más que
// deliberar. El razonamiento se factura como salida, que vale cinco
// veces la entrada.

function Kpi({ Icono, etiqueta, valor, detalle, color }) {
  return (
    <div className="crediscope-card crediscope-kpi">
      <p className="crediscope-kpi-label">
        <Icono size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
        {etiqueta}
      </p>
      <p className="crediscope-kpi-valor" style={color ? { color } : undefined}>{valor}</p>
      {detalle ? <p className="crediscope-kpi-detalle">{detalle}</p> : null}
    </div>
  );
}

export default function CostosConsultas() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [porMes, setPorMes] = useState(1000);

  useEffect(() => {
    getConsumoLlm()
      // Solo las que produjeron un análisis: acá se responde cuánto
      // cuesta analizar a alguien, y una llamada que falló antes de
      // generar nada baja el promedio sin haber analizado a nadie.
      .then((f) => setFilas(soloExitosas(f).filter((r) => r.funcion === "analyze-client")))
      .catch((err) => setError(err.message));
  }, []);

  const d = useMemo(() => {
    if (!filas) return null;
    const medidas = filas.filter((r) => r.costo_usd !== null && r.costo_usd !== undefined);
    const t = totales(filas);
    // Por versión del criterio: es el corte que explica el aumento.
    const porMarco = agrupar(filas, (r) => r.contexto?.marco ?? null)
      .map((g) => ({ ...g, medidas: g.llamadas - g.sinMedir }))
      .filter((g) => g.medidas > 0)
      .sort((a, b) => {
        const n = (v) => Number(String(v.clave).replace(/\D/g, "")) || 0;
        return n(a) - n(b);
      });
    const actual = porMarco.at(-1) ?? null;
    const primero = porMarco[0] ?? null;
    return {
      t,
      medidas: medidas.length,
      promedio: promedioMedido(t),
      porMarco,
      actual,
      primero,
      escalamientos: filas.filter((r) => r.contexto?.escalamiento).length,
    };
  }, [filas]);

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );

  const prom = (g, campo) => (g.medidas ? Math.round(g[campo] / g.medidas) : 0);

  return (
    <div>
      <p>
        <Link to="/costos" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Costo por consulta</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Cuánto cuesta analizar a una persona, en qué se va ese dinero y hacia dónde se está moviendo.
        </p>
      </div>

      {!d ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : d.medidas === 0 ? (
        <div className="crediscope-card">
          <p style={{ margin: 0 }}>Todavía no hay análisis con consumo medido.</p>
        </div>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi
              Icono={Database}
              etiqueta="Promedio histórico"
              valor={centavos(d.promedio)}
              detalle={`Sobre ${d.medidas} análisis medidos`}
            />
            <Kpi
              Icono={Database}
              etiqueta="Con el criterio actual"
              valor={d.actual ? centavos(promedioMedido(d.actual)) : "—"}
              detalle={d.actual ? `${d.actual.clave} · ${d.actual.medidas} análisis` : null}
            />
            <Kpi
              Icono={Brain}
              etiqueta="Razonamiento"
              valor={d.actual && d.actual.salida ? `${Math.round((d.actual.razonamiento / d.actual.salida) * 100)}%` : "—"}
              detalle="De la salida del criterio actual"
              color="var(--warn)"
            />
            <Kpi
              Icono={Database}
              etiqueta="Escalamientos a Sonnet"
              valor={num(d.escalamientos)}
              detalle="Análisis que cayeron en la zona gris"
            />
          </div>

          <div className="crediscope-card">
            <h3>Cómo evolucionó con cada versión del criterio</h3>
            <p className="crediscope-muted" style={{ marginTop: 0 }}>
              Un promedio por análisis, versión por versión. La columna que importa es <strong>Razonamiento</strong>: son los
              tokens que el modelo gasta pensando antes de responder, y se facturan como salida.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Criterio</th>
                    <th style={{ textAlign: "right" }}>Análisis</th>
                    <th style={{ textAlign: "right" }}>Entrada</th>
                    <th style={{ textAlign: "right" }}>Respuesta</th>
                    <th style={{ textAlign: "right" }}>Razonamiento</th>
                    <th style={{ textAlign: "right" }}>% razon.</th>
                    <th style={{ textAlign: "right" }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porMarco.map((g) => {
                    const razon = prom(g, "razonamiento");
                    const respuesta = prom(g, "salida") - razon;
                    const pct = g.salida ? Math.round((g.razonamiento / g.salida) * 100) : 0;
                    return (
                      <tr key={g.clave}>
                        <td style={{ fontWeight: 600 }}>{g.clave}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.medidas}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(prom(g, "entrada"))}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(respuesta)}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{num(razon)}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{razon ? `${pct}%` : "—"}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{centavos(promedioMedido(g))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {d.primero && d.actual && d.primero.clave !== d.actual.clave ? (
              <p style={{ marginBottom: 0 }}>
                Entre <strong>{d.primero.clave}</strong> y <strong>{d.actual.clave}</strong> la respuesta útil pasó de{" "}
                {num(prom(d.primero, "salida") - prom(d.primero, "razonamiento"))} a{" "}
                {num(prom(d.actual, "salida") - prom(d.actual, "razonamiento"))} tokens, y el razonamiento de{" "}
                {num(prom(d.primero, "razonamiento"))} a {num(prom(d.actual, "razonamiento"))}. El aumento no está en lo que el
                modelo escribe, está en lo que delibera.
              </p>
            ) : null}
          </div>

          <div className="crediscope-card">
            <h3>El caché del marco</h3>
            <p className="crediscope-muted" style={{ marginTop: 0 }}>
              El marco interpretativo viaja en un bloque cacheado. Escribirlo cuesta un recargo; leerlo, una décima parte.
            </p>
            <table className="crediscope-table">
              <tbody>
                <tr>
                  <td>Tokens escritos al caché</td>
                  <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{num(d.t.cacheEscritura)}</td>
                </tr>
                <tr>
                  <td>Tokens leídos del caché</td>
                  <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: d.t.cacheLectura ? "var(--good)" : "var(--warn)" }}>
                    {num(d.t.cacheLectura)}
                  </td>
                </tr>
              </tbody>
            </table>
            {d.t.cacheEscritura > 0 && d.t.cacheLectura === 0 ? (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
                <AlertTriangle size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0 }}>
                  <strong>El caché se escribe y nunca se lee.</strong> Se paga el recargo en cada análisis y no se cobra el
                  descuento ni una vez. Dura cinco minutos: si entre dos consultas pasa más que eso, o si se despliega un marco
                  nuevo, se pierde. Con volumen esto se da vuelta solo; con el uso de hoy, es costo puro.
                </p>
              </div>
            ) : null}
          </div>

          <div className="crediscope-card">
            <h3>Cuánto costaría operar</h3>
            <p className="crediscope-muted" style={{ marginTop: 0 }}>
              Al costo del criterio actual. Sirve para poner piso a la tarifa, no para prometerla: el costo se mueve con cada
              versión del criterio.
            </p>
            <div className="crediscope-descarga-row" style={{ marginTop: 0 }}>
              <div className="crediscope-descarga-campo">
                <label htmlFor="c-vol">Consultas por mes</label>
                <input
                  id="c-vol"
                  type="number"
                  min="1"
                  className="crediscope-input"
                  value={porMes}
                  onChange={(e) => setPorMes(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
            {d.actual ? (
              <table className="crediscope-table">
                <tbody>
                  <tr>
                    <td>Costo del modelo al mes</td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {money2(promedioMedido(d.actual) * porMes)}
                    </td>
                  </tr>
                  <tr>
                    <td>Costo por consulta</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{centavos(promedioMedido(d.actual))}</td>
                  </tr>
                </tbody>
              </table>
            ) : null}
            <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
              Solo el modelo. No incluye la consulta a la fuente de datos, ni infraestructura, ni el consumo de calibración —
              que hoy es el más grande y se ve en <Link to="/costos/corridas">Corridas masivas</Link>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
