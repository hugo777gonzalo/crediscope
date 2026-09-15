import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getPerfilesConFuentesIngreso, getResumenFuentesIngreso } from "../lib/api.js";
import { ultimoPorCliente } from "../lib/reporteGerencial.js";
import {
  ETIQUETA_SEGMENTO,
  ETIQUETA_ESTADO,
  ETIQUETA_EVIDENCIA,
  RIESGO_SEGMENTO,
  formatMoneda,
} from "../lib/fuentesIngresoConsolidado.js";

// El listado detrás de los números del panorama. Sin esto el módulo
// informa pero no sirve para trabajar: una jefatura que ve "135
// independientes" lo primero que quiere es saber quiénes son.
//
// El filtro viaja en la URL para que un panorama pueda enlazar directo a
// su propio segmento, y para que la vista sea compartible.

const COLOR_ESTADO = { confirmada: "var(--good)", provisional: "var(--warn)", indeterminada: "var(--text-muted)" };

export default function FuentesClientes() {
  const [params, setParams] = useSearchParams();
  const [perfiles, setPerfiles] = useState(null);
  // Las opciones del filtro salen del resumen de TODA la cartera: si se
  // derivaran del resultado filtrado, al elegir un segmento el desplegable
  // se quedaría con esa única opción y no habría forma de volver.
  const [segmentosPresentes, setSegmentosPresentes] = useState([]);
  const [error, setError] = useState(null);

  const segmentoFiltro = params.get("segmento") ?? "";
  const estadoFiltro = params.get("estado") ?? "";

  useEffect(() => {
    // El filtro va al servidor: traer la cartera entera para descartarla
    // en el navegador no escala.
    getPerfilesConFuentesIngreso({ segmento: segmentoFiltro || null, estado: estadoFiltro || null })
      .then(setPerfiles)
      .catch((err) => setError(err.message));
  }, [segmentoFiltro, estadoFiltro]);

  const filas = useMemo(() => {
    if (!perfiles) return [];
    return ultimoPorCliente(perfiles)
      .map((p) => ({ fila: p, f: p.standard_profile?.fuentesIngreso }))
      .filter((x) => x.f?.segmento)
      ;
  }, [perfiles, segmentoFiltro, estadoFiltro]);

  useEffect(() => {
    getResumenFuentesIngreso()
      .then((todos) => setSegmentosPresentes([...new Set(ultimoPorCliente(todos).map((p) => p.fuente_segmento).filter(Boolean))]))
      .catch(() => setSegmentosPresentes([]));
  }, []);

  function cambiar(clave, valor) {
    const siguiente = new URLSearchParams(params);
    if (valor) siguiente.set(clave, valor);
    else siguiente.delete(clave);
    setParams(siguiente, { replace: true });
  }

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );

  return (
    <div>
      <p>
        <Link to="/fuentes" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 4 }}>Clientes por segmento</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          {perfiles ? `${filas.length} cliente(s)` : "Cargando..."}
          {segmentoFiltro ? ` · ${ETIQUETA_SEGMENTO[segmentoFiltro] ?? segmentoFiltro}` : ""}
          {segmentoFiltro && RIESGO_SEGMENTO[segmentoFiltro] ? ` — ${RIESGO_SEGMENTO[segmentoFiltro]}` : ""}
        </p>
      </div>

      <div className="crediscope-card">
        <div className="crediscope-descarga-row" style={{ marginTop: 0 }}>
          <div className="crediscope-descarga-campo" style={{ minWidth: 260 }}>
            <label htmlFor="f-segmento">Segmento</label>
            <select id="f-segmento" className="crediscope-input" value={segmentoFiltro} onChange={(e) => cambiar("segmento", e.target.value)}>
              <option value="">Todos</option>
              {segmentosPresentes.map((s) => (
                <option key={s} value={s}>
                  {ETIQUETA_SEGMENTO[s] ?? s}
                </option>
              ))}
            </select>
          </div>
          <div className="crediscope-descarga-campo" style={{ minWidth: 200 }}>
            <label htmlFor="f-estado">Estado</label>
            <select id="f-estado" className="crediscope-input" value={estadoFiltro} onChange={(e) => cambiar("estado", e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ETIQUETA_ESTADO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {perfiles && filas.length === 0 ? (
        <div className="crediscope-card">
          <p className="crediscope-muted" style={{ margin: 0 }}>Ningún cliente con ese filtro.</p>
        </div>
      ) : null}

      {filas.map(({ fila, f }) => (
        <div className="crediscope-card" key={fila.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <strong style={{ fontSize: 16 }}>
                {fila.clients?.cedula ? <Link to={`/perfil/${fila.clients.cedula}`}>{fila.clients.cedula}</Link> : "—"}
              </strong>
              <span style={{ marginLeft: 10 }}>{ETIQUETA_SEGMENTO[f.segmento] ?? f.segmento}</span>
              <span
                className="crediscope-tag"
                style={{ marginLeft: 8, background: "var(--panel-muted)", color: COLOR_ESTADO[f.estadoSegmento] }}
              >
                {ETIQUETA_ESTADO[f.estadoSegmento]}
              </span>
            </div>
            {f.pisoIngresoMensualReportado ? (
              <span className="crediscope-muted">
                Piso reportado: <strong style={{ color: "var(--text)" }}>{formatMoneda(f.pisoIngresoMensualReportado)}</strong>
              </span>
            ) : (
              <span className="crediscope-muted">Sin monto reportado</span>
            )}
          </div>

          <p className="crediscope-muted" style={{ marginTop: 8, marginBottom: 10, fontSize: 13.5 }}>{f.motivoSegmento}</p>

          {(f.fuentes ?? []).length > 0 ? (
            <ul className="crediscope-items">
              {f.fuentes.map((fu, i) => (
                <li key={i} className="crediscope-item">
                  <span>
                    <span className="crediscope-item-titulo">
                      {fu.tipo}
                      {fu.montoMensualReportado ? ` — ${formatMoneda(fu.montoMensualReportado)}` : ""}
                      <span className="crediscope-tag crediscope-tag-neutral" style={{ marginLeft: 8 }}>
                        {ETIQUETA_EVIDENCIA[fu.evidencia] ?? fu.evidencia}
                      </span>
                    </span>
                    <span className="crediscope-item-detalle">{fu.detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {(f.senalesDeEscala ?? []).length > 0 ? (
            <p className="crediscope-muted" style={{ fontSize: 13, marginBottom: 6 }}>
              {f.senalesDeEscala.map((s) => s.detalle).join(" ")}
            </p>
          ) : null}

          {(f.paraConfirmar ?? []).length > 0 ? (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 4 }}>
              <p style={{ fontWeight: 600, fontSize: 13, margin: "0 0 6px" }}>Para confirmar</p>
              <ul className="crediscope-list" style={{ fontSize: 13.5, margin: 0 }}>
                {f.paraConfirmar.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
