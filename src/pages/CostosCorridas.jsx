import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, AlertTriangle } from "lucide-react";
import { getConsumoLlm } from "../lib/api.js";
import { corridas, totales, promedioMedido, ETIQUETA_FUNCION, money, num, centavos, fechaHora } from "../lib/consumoLlm.js";

// Corridas masivas: las acciones que disparan muchas llamadas de una.
//
// Existe porque el costo del producto no se entiende llamada por
// llamada. Un clic en "correr backtest" sobre un paquete de 7 casos son
// 7 pedidos al modelo; un informe de retroalimentación manda el paquete
// entero en un solo pedido con un techo de 16.000 tokens de salida. Son
// las acciones más caras del sistema y las más fáciles de repetir sin
// darse cuenta -- y hasta que existió esta vista, no dejaban rastro
// visible en ningún lado.

function Kpi({ Icono, etiqueta, valor, detalle }) {
  return (
    <div className="crediscope-card crediscope-kpi">
      <p className="crediscope-kpi-label">
        <Icono size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
        {etiqueta}
      </p>
      <p className="crediscope-kpi-valor">{valor}</p>
      {detalle ? <p className="crediscope-kpi-detalle">{detalle}</p> : null}
    </div>
  );
}

export default function CostosCorridas() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [soloMultiples, setSoloMultiples] = useState(false);

  useEffect(() => {
    getConsumoLlm()
      .then(setFilas)
      .catch((err) => setError(err.message));
  }, []);

  const d = useMemo(() => {
    if (!filas) return null;
    const todas = corridas(filas);
    const calibracion = filas.filter((r) => r.naturaleza === "calibracion");
    const tc = totales(calibracion);
    const multiples = todas.filter((c) => c.llamadas > 1);
    return {
      lista: (soloMultiples ? multiples : todas).slice(0, 200),
      totalCorridas: todas.length,
      multiples: multiples.length,
      mayor: todas.reduce((max, c) => (c.llamadas > (max?.llamadas ?? 0) ? c : max), null),
      calibracion: tc,
    };
  }, [filas, soloMultiples]);

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );

  return (
    <div>
      <p>
        <Link to="/costos" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Corridas masivas</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Acciones que disparan varias llamadas al modelo de una sola vez. Agrupadas por acción, no por llamada.
        </p>
      </div>

      {!d ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi Icono={Layers} etiqueta="Corridas" valor={num(d.totalCorridas)} detalle={`${d.multiples} dispararon más de una llamada`} />
            <Kpi
              Icono={Layers}
              etiqueta="La más grande"
              valor={d.mayor ? `${d.mayor.llamadas} llamadas` : "—"}
              detalle={d.mayor ? `${ETIQUETA_FUNCION[d.mayor.funcion] ?? d.mayor.funcion} · ${fechaHora(d.mayor.inicio)}` : null}
            />
            <Kpi
              Icono={Layers}
              etiqueta="Llamadas de calibración"
              valor={num(d.calibracion.llamadas)}
              detalle={`${money(d.calibracion.costo)} medidos · ${d.calibracion.sinMedir} sin medir`}
            />
            <Kpi
              Icono={Layers}
              etiqueta="Costo por llamada"
              valor={promedioMedido(d.calibracion) === null ? "—" : centavos(promedioMedido(d.calibracion))}
              detalle="Calibración, solo lo medido"
            />
          </div>

          <div className="crediscope-card">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertTriangle size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Antes de correr un backtest, mirá el tamaño del paquete.</p>
                <p className="crediscope-muted" style={{ margin: 0 }}>
                  El backtest evalúa <strong>un caso por llamada</strong>: un paquete de 40 créditos son 40 llamadas al modelo,
                  equivalentes a 40 consultas de cliente. El informe de retroalimentación es una sola llamada, pero manda todos
                  los casos juntos con un techo de 16.000 tokens de salida, así que es la llamada individual más cara del
                  sistema. Repetir un informe sobre el mismo paquete lo vuelve a pagar entero.
                </p>
              </div>
            </div>
          </div>

          <div className="crediscope-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Cada corrida</h3>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
                <input type="checkbox" checked={soloMultiples} onChange={(e) => setSoloMultiples(e.target.checked)} />
                Solo las que dispararon más de una llamada
              </label>
            </div>
            <p className="crediscope-muted" style={{ marginTop: 6 }}>
              Se agrupa por proceso, minuto y paquete: así una corrida aparece como una fila, con las llamadas que costó.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Cuándo</th>
                    <th>Proceso</th>
                    <th style={{ textAlign: "right" }}>Llamadas</th>
                    <th style={{ textAlign: "right" }}>Costo</th>
                    <th style={{ textAlign: "right" }}>Duración media</th>
                    <th>Modelo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lista.map((c, i) => (
                    <tr key={`${c.funcion}-${c.inicio}-${i}`}>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(c.inicio)}</td>
                      <td>
                        {ETIQUETA_FUNCION[c.funcion] ?? c.funcion}
                        {c.paquete ? (
                          <div className="crediscope-muted" style={{ fontSize: 12 }}>paquete {String(c.paquete).slice(0, 8)}</div>
                        ) : null}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: c.llamadas > 1 ? 700 : 400 }}>
                        {c.llamadas}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {c.sinMedir === c.llamadas ? (
                          <span className="crediscope-muted">sin medir</span>
                        ) : (
                          money(c.costo)
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {c.msPromedio ? `${(c.msPromedio / 1000).toFixed(1)} s` : "—"}
                      </td>
                      <td style={{ fontSize: 12.5 }} className="crediscope-muted">
                        {c.modelos.length ? c.modelos.join(", ") : "sin registro"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.lista.length === 0 ? <p className="crediscope-muted" style={{ marginBottom: 0 }}>Ninguna corrida con ese filtro.</p> : null}
          </div>

          <div className="crediscope-card">
            <h3>Lo que falta para que esto sea completo</h3>
            <p style={{ marginBottom: 0 }}>
              Las corridas de calibración anteriores al {fechaHora("2026-09-15T00:40")} figuran <strong>sin medir</strong>: se
              sabe que ocurrieron porque quedaron en la bitácora, pero sus tokens no se guardaron en ningún lado. Desde esa
              fecha cada llamada se registra al momento, así que la próxima corrida de backtesting sí va a tener su costo
              exacto. El total real del histórico es mayor que el que muestra el{" "}
              <Link to="/costos">panorama</Link>, y no hay forma de recuperarlo.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
