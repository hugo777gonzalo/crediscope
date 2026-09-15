import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign, Activity, AlertTriangle, Brain } from "lucide-react";
import { getConsumoLlm } from "../lib/api.js";
import {
  agrupar,
  totales,
  promedioMedido,
  soloExitosas,
  ETIQUETA_FUNCION,
  ETIQUETA_NATURALEZA,
  DESCRIPCION_NATURALEZA,
  ETIQUETA_ORIGEN,
  DESCRIPCION_ORIGEN,
  money,
  money2,
  num,
  centavos,
  dia,
} from "../lib/consumoLlm.js";

// Panorama del consumo del LLM: cuánto se gastó, en qué y con qué
// confianza está medido.
//
// La pantalla insiste en una distinción que el resto del producto no
// necesita: gasto MEDIDO contra llamadas SIN MEDIR. Las corridas
// anteriores al registro de consumo existieron y se pagaron, pero sus
// tokens se perdieron. Mostrar solo el total medido haría creer que el
// gasto fue menor de lo que fue -- y ese error es justamente el que
// llevó a atribuirle al producto un consumo que no era suyo.

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

function Barra({ etiqueta, valor, pct, color, ayuda, enlace }) {
  return (
    <div className="crediscope-barrapct-row" title={ayuda}>
      <span className="crediscope-barrapct-label">{enlace ? <Link to={enlace}>{etiqueta}</Link> : etiqueta}</span>
      <div className="crediscope-barrapct-track">
        <div className="crediscope-barrapct-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="crediscope-barrapct-valor">{valor}</span>
    </div>
  );
}

export default function Costos() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    getConsumoLlm({ desde: desde || null, hasta: hasta || null })
      .then(setFilas)
      .catch((err) => setError(err.message));
  }, [desde, hasta]);

  const d = useMemo(() => {
    if (!filas) return null;
    const t = totales(filas);
    // El costo por análisis se promedia solo sobre las que terminaron
    // en un análisis: una llamada que falló no analizó a nadie.
    const analisis = soloExitosas(filas).filter((r) => r.funcion === "analyze-client");
    const ta = totales(analisis);
    return {
      t,
      analisis: ta,
      porAnalisis: promedioMedido(ta),
      porDia: agrupar(filas, (r) => dia(r.created_at)).sort((a, b) => (a.clave < b.clave ? 1 : -1)),
      porNaturaleza: agrupar(filas, (r) => r.naturaleza).sort((a, b) => b.llamadas - a.llamadas),
      porFuncion: agrupar(filas, (r) => r.funcion).sort((a, b) => b.llamadas - a.llamadas),
      porModelo: agrupar(filas, (r) => (r.modelo === "desconocido" ? null : r.modelo)).sort((a, b) => b.costo - a.costo),
      porOrigen: agrupar(filas, (r) => r.origen_medicion).sort((a, b) => b.llamadas - a.llamadas),
      sinPrecio: filas.filter((r) => r.precio_faltante).length,
    };
  }, [filas]);

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );

  const maxLlamadasDia = d ? Math.max(1, ...d.porDia.map((x) => x.llamadas)) : 1;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Costos del análisis</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Cada llamada al modelo, con su costo. Es la base para decidir a cuánto se vende una consulta.
        </p>
      </div>

      <div className="crediscope-card">
        <div className="crediscope-descarga-row" style={{ marginTop: 0 }}>
          <div className="crediscope-descarga-campo">
            <label htmlFor="c-desde">Desde</label>
            <input id="c-desde" type="date" className="crediscope-input" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="crediscope-descarga-campo">
            <label htmlFor="c-hasta">Hasta</label>
            <input id="c-hasta" type="date" className="crediscope-input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="crediscope-descarga-campo" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="crediscope-btn crediscope-btn-ghost" onClick={() => { setDesde(""); setHasta(""); }}>
              Todo el histórico
            </button>
          </div>
        </div>
      </div>

      {!d ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : d.t.llamadas === 0 ? (
        <div className="crediscope-card">
          <p style={{ margin: 0 }}>No hay llamadas registradas en ese rango.</p>
        </div>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi
              Icono={DollarSign}
              etiqueta="Gasto medido"
              valor={money2(d.t.costo)}
              detalle={d.t.sinMedir ? `No incluye ${d.t.sinMedir} llamada(s) sin medición` : "Todas las llamadas del rango están medidas"}
            />
            <Kpi
              Icono={Activity}
              etiqueta="Llamadas al modelo"
              valor={num(d.t.llamadas)}
              detalle={d.t.fallidas ? `${d.t.fallidas} fallaron` : "Ninguna falló"}
            />
            <Kpi
              Icono={DollarSign}
              etiqueta="Costo por análisis"
              valor={d.porAnalisis === null ? "—" : centavos(d.porAnalisis)}
              detalle={`Promedio sobre ${d.analisis.llamadas - d.analisis.sinMedir} análisis medidos`}
            />
            <Kpi
              Icono={Brain}
              etiqueta="Razonamiento"
              valor={d.t.salida ? `${Math.round((d.t.razonamiento / d.t.salida) * 100)}%` : "—"}
              detalle="De los tokens de salida, que es lo más caro"
            />
          </div>

          {d.t.sinMedir > 0 ? (
            <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <AlertTriangle size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
                    {d.t.sinMedir} de {d.t.llamadas} llamadas no se pueden valuar.
                  </p>
                  <p className="crediscope-muted" style={{ margin: 0 }}>
                    Ocurrieron antes de que existiera este registro, o su fila se borró al limpiar datos de prueba. Sabemos que
                    pasaron porque quedaron en la bitácora, pero sus tokens ya no están. <strong>Su costo es desconocido, no
                    cero</strong>: el gasto real del período es mayor que el total de arriba.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {d.sinPrecio > 0 ? (
            <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
              <p style={{ margin: 0 }}>
                <strong>{d.sinPrecio} llamada(s) usan un modelo sin tarifa cargada.</strong> Se están contando en cero. Cargá el
                modelo en <Link to="/costos/tarifas">Tarifas</Link> para que el total sea real.
              </p>
            </div>
          ) : null}

          <div className="crediscope-reportes-grid">
            <div className="crediscope-card">
              <h3>En qué se gastó</h3>
              <p className="crediscope-muted" style={{ marginTop: 0 }}>
                Lo que se factura y lo que no. Hoy nada de esto se le cobró a nadie.
              </p>
              {d.porNaturaleza.map((n) => (
                <Barra
                  key={n.clave}
                  etiqueta={ETIQUETA_NATURALEZA[n.clave] ?? n.clave}
                  valor={`${money(n.costo)} · ${n.llamadas}`}
                  pct={Math.round((n.llamadas / d.t.llamadas) * 100)}
                  color={n.clave === "consulta" ? "var(--good)" : n.clave === "calibracion" ? "var(--warn)" : "var(--brand)"}
                  ayuda={DESCRIPCION_NATURALEZA[n.clave]}
                />
              ))}

              <h3 style={{ marginTop: 22 }}>Qué proceso lo pidió</h3>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Proceso</th>
                    <th style={{ textAlign: "right" }}>Llamadas</th>
                    <th style={{ textAlign: "right" }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porFuncion.map((f) => (
                    <tr key={f.clave}>
                      <td>
                        {ETIQUETA_FUNCION[f.clave] ?? f.clave}
                        {f.sinMedir ? <div className="crediscope-muted" style={{ fontSize: 12 }}>{f.sinMedir} sin medir</div> : null}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{f.llamadas}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(f.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
                Un backtest no es una llamada: es una por caso del paquete.{" "}
                <Link to="/costos/corridas">Ver las corridas masivas</Link>.
              </p>
            </div>

            <div className="crediscope-card">
              <h3>Qué tan confiable es el número</h3>
              <p className="crediscope-muted" style={{ marginTop: 0 }}>
                De dónde salieron los tokens de cada llamada.
              </p>
              {d.porOrigen.map((o) => (
                <Barra
                  key={o.clave}
                  etiqueta={ETIQUETA_ORIGEN[o.clave] ?? o.clave}
                  valor={`${o.llamadas}`}
                  pct={Math.round((o.llamadas / d.t.llamadas) * 100)}
                  color={o.clave === "medida" ? "var(--good)" : o.clave === "reconstruida" ? "var(--brand)" : "var(--text-muted)"}
                  ayuda={DESCRIPCION_ORIGEN[o.clave]}
                />
              ))}

              <h3 style={{ marginTop: 22 }}>Por modelo</h3>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th style={{ textAlign: "right" }}>Llamadas</th>
                    <th style={{ textAlign: "right" }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porModelo.map((m) => (
                    <tr key={m.clave}>
                      <td style={{ fontSize: 13 }}>{m.clave}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.llamadas}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(m.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
                Las llamadas sin medición no aparecen acá: no quedó registro de qué modelo las atendió.
              </p>
            </div>
          </div>

          <div className="crediscope-card">
            <h3>Día a día</h3>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Volumen</th>
                  <th style={{ textAlign: "right" }}>Llamadas</th>
                  <th style={{ textAlign: "right" }}>Sin medir</th>
                  <th style={{ textAlign: "right" }}>Costo medido</th>
                  <th style={{ textAlign: "right" }}>Por llamada</th>
                </tr>
              </thead>
              <tbody>
                {d.porDia.map((x) => {
                  const prom = promedioMedido(x);
                  return (
                    <tr key={x.clave}>
                      <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{x.clave}</td>
                      <td style={{ width: "34%" }}>
                        <div className="crediscope-barrapct-track">
                          <div
                            className="crediscope-barrapct-fill"
                            style={{ width: `${Math.round((x.llamadas / maxLlamadasDia) * 100)}%`, background: "var(--brand)" }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{x.llamadas}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: x.sinMedir ? "var(--warn)" : undefined }}>
                        {x.sinMedir || "—"}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(x.costo)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{prom === null ? "—" : centavos(prom)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
