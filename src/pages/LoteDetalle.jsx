import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Play, Download, Ban, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { getLote, getItemsLote, perfilesDeLotePorTanda, contarPerfilesDeLote, arrancarLote, cancelarLote } from "../lib/api.js";
import { descargarExcelLote } from "../lib/exportLote.js";
import { formatearFechaHora } from "../lib/fechas.js";

// Un lote: cómo va y qué salió.
//
// Mientras corre, la pantalla se refresca sola cada diez segundos. No
// es que la pantalla haga el trabajo -- lo hace el servidor -- pero
// alguien que acaba de apretar "arrancar" quiere ver que arrancó, y
// pedirle que recargue a mano es pedirle que desconfíe.
//
// El refresco se apaga cuando el lote termina: seguir preguntando por
// algo que ya no cambia es gasto sin motivo.

const ETIQUETA_ESTADO = {
  preparado: "Listo para arrancar",
  en_proceso: "En proceso",
  terminado: "Terminado",
  cancelado: "Cancelado",
};

const ETIQUETA_ITEM = {
  pendiente: "Pendiente",
  en_curso: "Consultando",
  ok: "Con perfil nuevo",
  reutilizado: "Ya tenía perfil",
  error: "Error",
  descartado: "No consultable",
  duplicado: "Repetida",
};

const COLOR_ITEM = {
  ok: "var(--good)",
  reutilizado: "var(--brand)",
  error: "var(--bad)",
  descartado: "var(--warn)",
  duplicado: "var(--text-muted)",
  pendiente: "var(--text-muted)",
  en_curso: "var(--brand)",
};

export default function LoteDetalle() {
  const { id } = useParams();
  const [lote, setLote] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [descargando, setDescargando] = useState(false);
  const [avance, setAvance] = useState(null);
  const [filtro, setFiltro] = useState("");

  const cargar = useCallback(async () => {
    try {
      const [l, i] = await Promise.all([getLote(id), getItemsLote(id)]);
      setLote(l);
      setItems(i);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (lote?.estado !== "en_proceso") return undefined;
    const t = setInterval(cargar, 10_000);
    return () => clearInterval(t);
  }, [lote?.estado, cargar]);

  async function descargar() {
    setDescargando(true);
    setAvance(null);
    setError(null);
    try {
      // Cuántas personas van a entrar, antes de traer ninguna. Un lote
      // grande tarda, y saber el número desde el principio es la
      // diferencia entre esperar y creer que se colgó.
      const total = await contarPerfilesDeLote(id);
      setAvance({ hechos: 0, total });
      await descargarExcelLote({
        lote,
        items,
        tandasDePerfiles: perfilesDeLotePorTanda(id),
        avisarAvance: setAvance,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setDescargando(false);
      setAvance(null);
    }
  }

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );
  if (!lote) return <p className="crediscope-muted">Cargando...</p>;

  const total = Number(lote.total_validas) || 0;
  const hechas = Number(lote.correctas) + Number(lote.reutilizadas ?? 0) + Number(lote.con_error);
  const pct = total ? Math.round((hechas / total) * 100) : 0;
  const visibles = filtro ? items.filter((i) => i.estado === filtro) : items;

  return (
    <div>
      <p>
        <Link to="/lotes" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver a los lotes
        </Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>{lote.nombre}</h2>
          <p className="crediscope-muted" style={{ margin: 0 }}>
            {ETIQUETA_ESTADO[lote.estado]} · cargado el {formatearFechaHora(lote.created_at)}
            {lote.archivo ? ` · ${lote.archivo}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {lote.estado === "preparado" ? (
            <button className="crediscope-btn" onClick={() => arrancarLote(id).then(cargar).catch((e) => setError(e.message))}>
              <Play size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
              Arrancar
            </button>
          ) : null}
          {lote.estado === "en_proceso" ? (
            <button
              className="crediscope-btn crediscope-btn-ghost"
              onClick={() => cancelarLote(id).then(cargar).catch((e) => setError(e.message))}
            >
              <Ban size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
              Cancelar
            </button>
          ) : null}
          <button className="crediscope-btn" onClick={descargar} disabled={descargando || Number(lote.correctas) + Number(lote.reutilizadas ?? 0) === 0}>
            <Download size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            {/* Con miles de personas esto tarda. Un botón que solo dice
                "armando" durante dos minutos se lee como colgado; el
                número de a cuántas va, no. */}
            {descargando
              ? avance?.total
                ? `Armando el archivo... ${avance.hechos} de ${avance.total}`
                : "Armando el archivo..."
              : "Descargar resultados"}
          </button>
        </div>
      </div>

      {lote.estado === "en_proceso" ? (
        <div className="crediscope-card">
          <div className="crediscope-barrapct-track" style={{ height: 10 }}>
            <div className="crediscope-barrapct-fill" style={{ width: `${pct}%`, background: "var(--brand)" }} />
          </div>
          <p style={{ marginTop: 10, marginBottom: 0 }}>
            <strong>{hechas}</strong> de {total} — {pct}%. Quedan {lote.pendientes}.
          </p>
          <p className="crediscope-muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>
            Corre en el servidor: podés cerrar esta pantalla. Se actualiza sola cada diez segundos.
          </p>
        </div>
      ) : null}

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Resumen del proceso</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <tbody>
              <tr>
                <td>Líneas con dato en el archivo</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lote.total_lineas}</td>
                <td className="crediscope-muted" style={{ fontSize: 13 }}>Todo lo que traía la columna de cédulas</td>
              </tr>
              <tr>
                <td>Repetidas dentro del archivo</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lote.total_duplicadas}</td>
                <td className="crediscope-muted" style={{ fontSize: 13 }}>Se consultan una sola vez</td>
              </tr>
              <tr>
                <td>No consultables</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lote.total_descartadas}</td>
                <td className="crediscope-muted" style={{ fontSize: 13 }}>RUC de empresa, pasaportes, números inválidos</td>
              </tr>
              <tr style={{ fontWeight: 700 }}>
                <td>Cédulas válidas a consultar</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lote.total_validas}</td>
                <td></td>
              </tr>
              <tr>
                <td style={{ color: "var(--good)" }}>
                  <CheckCircle2 size={15} style={{ marginRight: 6, verticalAlign: "-3px" }} />
                  Con perfil generado
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{lote.correctas}</td>
                <td className="crediscope-muted" style={{ fontSize: 13 }}>Disponibles también para el flujo normal</td>
              </tr>
              {Number(lote.reutilizadas ?? 0) > 0 ? (
                <tr>
                  <td style={{ color: "var(--brand)" }}>
                    <CheckCircle2 size={15} style={{ marginRight: 6, verticalAlign: "-3px" }} />
                    Ya tenían perfil vigente
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{lote.reutilizadas}</td>
                  <td className="crediscope-muted" style={{ fontSize: 13 }}>
                    No se consultó la fuente. El dato está igual en el archivo descargado.
                  </td>
                </tr>
              ) : null}
              <tr>
                <td style={{ color: "var(--bad)" }}>
                  <AlertTriangle size={15} style={{ marginRight: 6, verticalAlign: "-3px" }} />
                  Con error
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lote.con_error}</td>
                <td className="crediscope-muted" style={{ fontSize: 13 }}>La fuente no las encontró, o falló la consulta</td>
              </tr>
              {Number(lote.pendientes) > 0 ? (
                <tr>
                  <td>
                    <Clock size={15} style={{ marginRight: 6, verticalAlign: "-3px" }} />
                    Pendientes
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lote.pendientes}</td>
                  <td></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crediscope-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Cédula por cédula</h3>
          <select className="crediscope-input" style={{ maxWidth: 220 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas ({items.length})</option>
            {Object.entries(ETIQUETA_ITEM).map(([k, v]) => {
              const n = items.filter((i) => i.estado === k).length;
              return n ? (
                <option key={k} value={k}>
                  {v} ({n})
                </option>
              ) : null;
            })}
          </select>
        </div>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th style={{ textAlign: "right" }}>Fila</th>
                <th>Lo que venía</th>
                <th>Cédula</th>
                <th>Estado</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, 500).map((i) => (
                <tr key={i.id}>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }} className="crediscope-muted">
                    {i.fila_archivo ?? "—"}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{i.ingresado}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {i.cedula && i.estado === "ok" ? <Link to={`/perfil/${i.cedula}`}>{i.cedula}</Link> : i.cedula || "—"}
                  </td>
                  <td style={{ color: COLOR_ITEM[i.estado], fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap" }}>
                    {ETIQUETA_ITEM[i.estado] ?? i.estado}
                  </td>
                  <td className="crediscope-muted" style={{ fontSize: 13 }}>{i.motivo ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibles.length > 500 ? (
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>
            Se muestran las primeras 500 de {visibles.length}. El archivo descargado las incluye todas.
          </p>
        ) : null}
      </div>
    </div>
  );
}
