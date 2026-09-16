import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Upload, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { getLotes } from "../lib/api.js";
import { formatearFechaHora } from "../lib/fechas.js";

// Todos los lotes corridos, el más reciente primero.
//
// La columna que más importa no es cuántas cédulas traía el archivo
// sino cuántas terminaron con perfil. Entre una y otra están las
// repetidas, las que no eran consultables y las que la fuente no
// encontró -- y cada una de esas tres es un problema distinto, con un
// responsable distinto.

const ETIQUETA_ESTADO = {
  preparado: "Listo para arrancar",
  en_proceso: "En proceso",
  terminado: "Terminado",
  cancelado: "Cancelado",
};

const COLOR_ESTADO = {
  preparado: "var(--warn)",
  en_proceso: "var(--brand)",
  terminado: "var(--good)",
  cancelado: "var(--text-muted)",
};

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

export default function Lotes() {
  const [lotes, setLotes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getLotes()
      .then(setLotes)
      .catch((e) => setError(e.message));
  }, []);

  const total = (campo) => (lotes ?? []).reduce((s, l) => s + Number(l[campo] ?? 0), 0);
  const enProceso = (lotes ?? []).filter((l) => l.estado === "en_proceso").length;

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Consultas por lote</h2>
          <p className="crediscope-muted" style={{ margin: 0, maxWidth: "62ch" }}>
            Cargar muchas cédulas de una vez y traer su Perfil del Cliente. Los perfiles quedan disponibles para el flujo
            normal: si un analista busca después a una de estas personas, no se vuelve a consultar la fuente.
          </p>
        </div>
        <Link className="crediscope-btn" to="/lotes/nuevo">
          <Upload size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
          Cargar archivo
        </Link>
      </div>

      {!lotes ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : lotes.length === 0 ? (
        <div className="crediscope-card">
          <p style={{ margin: 0 }}>Todavía no se corrió ningún lote.</p>
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>
            Cargá una planilla con una columna de cédulas. Se revisa antes de consultar nada y te dice cuántas son válidas,
            cuántas están repetidas y cuáles no se pueden consultar.
          </p>
        </div>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi Icono={Layers} etiqueta="Lotes corridos" valor={lotes.length} detalle={enProceso ? `${enProceso} en proceso ahora` : null} />
            <Kpi Icono={CheckCircle2} etiqueta="Perfiles disponibles" valor={total("correctas") + total("reutilizadas")} detalle={`${total("reutilizadas")} se reutilizaron sin consultar la fuente`} />
            <Kpi Icono={AlertTriangle} etiqueta="Con error" valor={total("con_error")} detalle="La fuente no las encontró o falló" />
            <Kpi Icono={Clock} etiqueta="Pendientes" valor={total("pendientes")} detalle="En cola de los lotes en proceso" />
          </div>

          <div className="crediscope-card">
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Estado</th>
                    <th style={{ textAlign: "right" }}>Válidas</th>
                    <th style={{ textAlign: "right" }}>Con perfil</th>
                    <th style={{ textAlign: "right" }}>Error</th>
                    <th style={{ textAlign: "right" }}>Pendientes</th>
                    <th style={{ textAlign: "right" }}>Minutos</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.nombre}</strong>
                        <div className="crediscope-muted" style={{ fontSize: 12 }}>{formatearFechaHora(l.created_at)}</div>
                      </td>
                      <td>
                        <span className="crediscope-tag" style={{ background: "var(--panel-muted)", color: COLOR_ESTADO[l.estado], fontWeight: 700 }}>
                          {ETIQUETA_ESTADO[l.estado] ?? l.estado}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.total_validas}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--good)", fontWeight: 600 }}>{l.correctas}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: l.con_error ? "var(--bad)" : undefined }}>
                        {l.con_error || "—"}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.pendientes || "—"}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.iniciado_at ? l.minutos : "—"}</td>
                      <td>
                        <Link className="crediscope-btn crediscope-btn-ghost" to={`/lotes/${l.id}`}>
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
