import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Upload, Scissors, FileText, History } from "lucide-react";
import { getCargas, getCortes, getPropuestas } from "../lib/laboratorio.js";
import { formatearFechaHora, formatearDia } from "../lib/fechas.js";
import { Kpi, MensajeError, Etiqueta, ETIQUETA_ESTADO_CARGA, num, pct } from "../components/laboratorio/Comunes.jsx";

// Laboratorio de Inteligencia de Negocio › Riesgo de Crédito: reemplaza a
// Retroalimentación. Lo opera nuestro equipo (sólo admin); la IFI recibe un
// informe exportado. Diseño: docs/laboratorio-de-riesgo.md.

const COLOR_ESTADO = { cargando: "var(--warn)", lista: "var(--good)", con_errores: "var(--bad)", anulada: "var(--text-muted)" };

export default function Laboratorio() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getCargas(), getCortes(), getPropuestas()])
      .then(([cargas, cortes, propuestas]) => setDatos({ cargas, cortes, propuestas }))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <MensajeError mensaje={error} />;
  if (!datos) return <p className="crediscope-muted">Cargando...</p>;
  const { cargas, cortes, propuestas } = datos;
  const reales = cargas.filter((c) => !c.es_sintetica && c.estado === "lista");
  const enCurso = propuestas.filter((p) => !["rechazada", "retirada", "aplicada"].includes(p.estado)).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Laboratorio · Riesgo de Crédito</h2>
          <p className="crediscope-muted" style={{ margin: 0, maxWidth: "70ch" }}>
            Medir si el motor acertó contra lo que realmente pasó con los créditos, buscar qué datos anticipaban el impago y
            convertirlo en una propuesta de ajuste con evidencia. Nada de esto cambia el motor por su cuenta.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="crediscope-btn" to="/laboratorio/cargas/nueva">
            <Upload size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            Cargar archivo
          </Link>
          <Link className="crediscope-btn crediscope-btn-ghost" to="/laboratorio/cortes/nuevo">
            <Scissors size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            Nuevo corte
          </Link>
          <Link className="crediscope-btn crediscope-btn-ghost" to="/laboratorio/propuestas">
            <FileText size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            Propuestas
          </Link>
          <Link className="crediscope-btn crediscope-btn-ghost" to="/laboratorio/criterio">
            <History size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            Criterio vigente
          </Link>
        </div>
      </div>

      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Cargas reales listas" valor={reales.length} detalle={reales.length ? null : "Todavía no hay datos de una institución"} />
        <Kpi etiqueta="Operaciones reales" valor={num(reales.reduce((s, c) => s + Number(c.conciliacion?.operaciones ?? 0), 0))} />
        <Kpi etiqueta="Cortes" valor={cortes.length} detalle={`${cortes.filter((c) => c.es_sintetico).length} sintéticos`} />
        <Kpi etiqueta="Propuestas en curso" valor={enCurso} />
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Cargas</h3>
        {cargas.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>Todavía no se cargó ningún archivo.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Carga</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Operaciones</th>
                  <th style={{ textAlign: "right" }}>Con análisis</th>
                  <th style={{ textAlign: "right" }}>Fuga</th>
                  <th>Corte</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cargas.map((c) => {
                  const k = c.conciliacion ?? {};
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.etiqueta}</strong> {c.es_sintetica ? <Etiqueta texto="Sintética" color="var(--warn)" /> : null}
                        <div className="crediscope-muted" style={{ fontSize: 12 }}>{formatearFechaHora(c.created_at)}</div>
                      </td>
                      <td><Etiqueta texto={ETIQUETA_ESTADO_CARGA[c.estado] ?? c.estado} color={COLOR_ESTADO[c.estado]} /></td>
                      <td style={{ textAlign: "right" }}>{num(k.operaciones)}</td>
                      <td style={{ textAlign: "right" }}>{k.operaciones ? pct(((k.exacto ?? 0) + (k.perfil_inferido ?? 0)) / k.operaciones) : "—"}</td>
                      <td style={{ textAlign: "right", color: k.consulta_posterior ? "var(--bad)" : undefined }}>{k.consulta_posterior ?? "—"}</td>
                      <td>{formatearDia(c.fecha_corte)}</td>
                      <td><Link className="crediscope-btn crediscope-btn-ghost" to={`/laboratorio/cargas/${c.id}`}>Ver</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Cortes</h3>
        {cortes.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>Un corte congela una población (cargas, definición de default, ventana) para analizarla.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Corte</th>
                  <th>Ventana</th>
                  <th style={{ textAlign: "right" }}>Incluidas</th>
                  <th style={{ textAlign: "right" }}>Malos</th>
                  <th style={{ textAlign: "right" }}>Tasa</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cortes.map((c) => {
                  const r = c.resumen ?? {};
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.nombre}</strong> {c.es_sintetico ? <Etiqueta texto="Sintético" color="var(--warn)" /> : null}
                        <div className="crediscope-muted" style={{ fontSize: 12 }}>Congelado el {formatearFechaHora(c.congelado_en)}</div>
                      </td>
                      <td>{c.ventana_meses} meses</td>
                      <td style={{ textAlign: "right" }}>{num(r.incluidas)}</td>
                      <td style={{ textAlign: "right" }}>{num(r.malos)}</td>
                      <td style={{ textAlign: "right" }}>{r.incluidas ? pct(r.malos / r.incluidas) : "—"}</td>
                      <td><Link className="crediscope-btn crediscope-btn-ghost" to={`/laboratorio/cortes/${c.id}`}>Abrir</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
