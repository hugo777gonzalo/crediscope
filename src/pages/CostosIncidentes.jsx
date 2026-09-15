import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Clock, Wallet, Radio } from "lucide-react";
import { getConsumoLlm } from "../lib/api.js";
import {
  incidentes,
  agrupar,
  ETIQUETA_FALLO,
  RESPONSABLE_FALLO,
  QUE_HACER_FALLO,
  money,
  num,
  fechaHora,
} from "../lib/consumoLlm.js";

// Fallas e incidentes: de qué se cayó el servicio, cuánto duró y de
// quién dependía resolverlo.
//
// Una llamada fallida no es un incidente. Cuatro errores del proveedor
// en seis minutos son UN corte de seis minutos, y esa es la cifra que
// sostiene un compromiso de tiempo de resolución. Contar llamadas daría
// cuatro incidentes de duración cero, que no dice nada.
//
// La columna que más importa es quién responde: una caída del proveedor
// no se corrige, se comunica; un tope de consumo alcanzado se corrige
// en dos minutos y no debería haber llegado a pasar.

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

export default function CostosIncidentes() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getConsumoLlm()
      .then(setFilas)
      .catch((err) => setError(err.message));
  }, []);

  const d = useMemo(() => {
    if (!filas) return null;
    const lista = incidentes(filas);
    const fallidas = filas.filter((r) => !r.exito);
    const quemado = fallidas.reduce((s, r) => s + Number(r.costo_usd ?? 0), 0);
    const ultimo = lista[0] ?? null;
    return {
      lista,
      fallidas: fallidas.length,
      total: filas.length,
      quemado,
      masLargo: lista.reduce((max, i) => (i.minutos > (max?.minutos ?? -1) ? i : max), null),
      porCausa: agrupar(fallidas, (r) => r.fallo_tipo ?? "desconocido").sort((a, b) => b.llamadas - a.llamadas),
      ultimo,
    };
  }, [filas]);

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
        <h2 style={{ marginBottom: 4 }}>Fallas e incidentes</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Cuándo el análisis dejó de funcionar, por qué, cuánto duró y de quién dependía resolverlo.
        </p>
      </div>

      {!d ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi
              Icono={ShieldAlert}
              etiqueta="Incidentes"
              valor={num(d.lista.length)}
              detalle={`${d.fallidas} de ${d.total} llamadas fallaron`}
            />
            <Kpi
              Icono={Clock}
              etiqueta="El más largo"
              valor={d.masLargo ? `${d.masLargo.minutos} min` : "—"}
              detalle={d.masLargo ? ETIQUETA_FALLO[d.masLargo.causa] : null}
            />
            <Kpi
              Icono={Wallet}
              etiqueta="Gastado en fallas"
              valor={money(d.quemado)}
              detalle="Tokens que se pagaron sin producir un análisis"
            />
            <Kpi
              Icono={Radio}
              etiqueta="Última falla"
              valor={d.ultimo ? fechaHora(d.ultimo.fin) : "—"}
              detalle={d.ultimo ? ETIQUETA_FALLO[d.ultimo.causa] : "Sin fallas registradas"}
              color={d.ultimo ? "var(--warn)" : undefined}
            />
          </div>

          <div className="crediscope-card">
            <h3>Por causa</h3>
            <p className="crediscope-muted" style={{ marginTop: 0 }}>
              Agrupar por causa es lo que vuelve accionable el dato: "doce llamadas fallaron" no se corrige, "doce fallaron
              por tope de consumo" se corrige en dos minutos.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Causa</th>
                    <th style={{ textAlign: "right" }}>Llamadas</th>
                    <th>Responde</th>
                    <th>Qué hacer</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porCausa.map((c) => (
                    <tr key={c.clave}>
                      <td style={{ fontWeight: 600 }}>{ETIQUETA_FALLO[c.clave] ?? c.clave}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.llamadas}</td>
                      <td>
                        <span
                          className="crediscope-tag"
                          style={{
                            background: "var(--panel-muted)",
                            color: RESPONSABLE_FALLO[c.clave] === "proveedor" ? "var(--text-muted)" : "var(--warn)",
                          }}
                        >
                          {RESPONSABLE_FALLO[c.clave] === "proveedor" ? "Proveedor" : "Nosotros"}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{QUE_HACER_FALLO[c.clave]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.porCausa.length === 0 ? (
              <p className="crediscope-muted" style={{ marginBottom: 0 }}>Ninguna llamada falló.</p>
            ) : null}
          </div>

          <div className="crediscope-card">
            <h3>Cronología</h3>
            <p className="crediscope-muted" style={{ marginTop: 0 }}>
              Fallas seguidas de la misma causa se cuentan como un solo incidente, con hasta una hora de silencio entre medio.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th style={{ textAlign: "right" }}>Duración</th>
                    <th>Causa</th>
                    <th style={{ textAlign: "right" }}>Llamadas</th>
                    <th style={{ textAlign: "right" }}>Gastado</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lista.map((i, k) => (
                    <tr key={`${i.causa}-${i.inicio}-${k}`}>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(i.inicio)}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(i.fin)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {i.minutos === 0 ? "< 1 min" : `${i.minutos} min`}
                      </td>
                      <td>{ETIQUETA_FALLO[i.causa] ?? i.causa}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i.llamadas}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(i.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="crediscope-card">
            <h3>Qué falta para enterarse a tiempo</h3>
            <p style={{ marginTop: 0 }}>
              Todo lo de arriba se reconstruyó <strong>después</strong>. La madrugada del 11 el proveedor estuvo caído seis
              minutos y nadie lo supo hasta hoy, porque el error se guardaba dentro del análisis y desde afuera esas consultas
              se veían normales. Con la causa ya clasificada y guardada, lo que falta es que alguien mire y avise:
            </p>
            <ul className="crediscope-list">
              <li>
                <strong>Un vigía que corra solo.</strong> Sin tráfico, cero fallas y servicio caído se ven idénticos: hace
                falta una consulta de prueba periódica que confirme que el circuito completo responde.
              </li>
              <li>
                <strong>Un aviso que llegue al teléfono.</strong> Un tablero que hay que abrir no sirve a las cuatro de la
                mañana.
              </li>
              <li>
                <strong>Avisar antes, no después.</strong> El tope de consumo es el único incidente que se puede anticipar:
                avisando al 70% del presupuesto deja de ser una caída y pasa a ser una tarea.
              </li>
              <li>
                <strong>Un aviso por incidente, no por llamada.</strong> Con reintentos, una caída de diez minutos puede
                generar decenas de errores; que manden decenas de mensajes garantiza que se dejen de leer.
              </li>
            </ul>
            <p className="crediscope-muted" style={{ marginBottom: 0 }}>
              Nada de esto está construido todavía. La parte que sí quedó lista es la que no se puede improvisar después: la
              causa de cada falla, guardada en el momento.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
