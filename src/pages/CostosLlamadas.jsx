import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getConsumoLlm } from "../lib/api.js";
import {
  totales,
  ETIQUETA_FUNCION,
  ETIQUETA_NATURALEZA,
  ETIQUETA_ORIGEN,
  DESCRIPCION_ORIGEN,
  money,
  num,
  fechaHora,
} from "../lib/consumoLlm.js";

// El detalle llamada por llamada, con filtros. Es la pantalla a la que
// se baja cuando un número de arriba no cierra: acá está el registro
// crudo, incluido el texto del error de las que fallaron.
//
// Las fallidas se muestran igual que las exitosas a propósito. Una
// llamada que falla después de que el modelo generó tokens se paga; y
// aunque no haya generado nada, saber que falló explica por qué una
// consulta devolvió el resultado por defecto.

const COLOR_ORIGEN = { medida: "var(--good)", reconstruida: "var(--brand)", sin_datos: "var(--text-muted)" };

function descargarCsv(filas) {
  const cab = [
    "fecha", "proceso", "modelo", "naturaleza", "exito", "cedula", "marco",
    "entrada", "salida", "razonamiento", "cache_escritura", "cache_lectura",
    "duracion_ms", "costo_usd", "origen_medicion", "error",
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lineas = [cab.join(",")];
  for (const r of filas) {
    lineas.push([
      r.created_at, r.funcion, r.modelo, r.naturaleza, r.exito ? "si" : "no",
      r.contexto?.cedula ?? "", r.contexto?.marco ?? "",
      r.tokens_entrada, r.tokens_salida, r.tokens_razonamiento ?? "",
      r.tokens_cache_escritura, r.tokens_cache_lectura,
      r.duracion_ms ?? "", r.costo_usd ?? "", r.origen_medicion, r.error ?? "",
    ].map(esc).join(","));
  }
  const url = URL.createObjectURL(new Blob(["﻿" + lineas.join("\n")], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `crediscope-consumo-llm-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CostosLlamadas() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [f, setF] = useState({ funcion: "", modelo: "", naturaleza: "", origen: "", exito: "", texto: "" });

  useEffect(() => {
    getConsumoLlm()
      .then(setFilas)
      .catch((err) => setError(err.message));
  }, []);

  const opciones = useMemo(() => {
    if (!filas) return { funcion: [], modelo: [] };
    return {
      funcion: [...new Set(filas.map((r) => r.funcion))].sort(),
      modelo: [...new Set(filas.map((r) => r.modelo))].sort(),
    };
  }, [filas]);

  const visibles = useMemo(() => {
    if (!filas) return [];
    const txt = f.texto.trim().toLowerCase();
    return filas.filter((r) => {
      if (f.funcion && r.funcion !== f.funcion) return false;
      if (f.modelo && r.modelo !== f.modelo) return false;
      if (f.naturaleza && r.naturaleza !== f.naturaleza) return false;
      if (f.origen && r.origen_medicion !== f.origen) return false;
      if (f.exito === "si" && !r.exito) return false;
      if (f.exito === "no" && r.exito) return false;
      if (txt) {
        const heno = `${r.contexto?.cedula ?? ""} ${r.contexto?.marco ?? ""} ${r.error ?? ""} ${r.request_id ?? ""}`.toLowerCase();
        if (!heno.includes(txt)) return false;
      }
      return true;
    });
  }, [filas, f]);

  const t = useMemo(() => (visibles.length ? totales(visibles) : null), [visibles]);

  function cambiar(clave, valor) {
    setF((v) => ({ ...v, [clave]: valor }));
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
        <Link to="/costos" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 4 }}>Detalle de llamadas</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          {filas ? `${visibles.length} de ${filas.length} llamadas` : "Cargando..."}
          {t ? ` · ${money(t.costo)} medidos${t.sinMedir ? ` · ${t.sinMedir} sin medir` : ""}` : ""}
        </p>
      </div>

      <div className="crediscope-card">
        <div className="crediscope-descarga-row" style={{ marginTop: 0 }}>
          <div className="crediscope-descarga-campo">
            <label htmlFor="l-funcion">Proceso</label>
            <select id="l-funcion" className="crediscope-input" value={f.funcion} onChange={(e) => cambiar("funcion", e.target.value)}>
              <option value="">Todos</option>
              {opciones.funcion.map((x) => (
                <option key={x} value={x}>{ETIQUETA_FUNCION[x] ?? x}</option>
              ))}
            </select>
          </div>
          <div className="crediscope-descarga-campo">
            <label htmlFor="l-modelo">Modelo</label>
            <select id="l-modelo" className="crediscope-input" value={f.modelo} onChange={(e) => cambiar("modelo", e.target.value)}>
              <option value="">Todos</option>
              {opciones.modelo.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="crediscope-descarga-campo">
            <label htmlFor="l-naturaleza">Naturaleza</label>
            <select id="l-naturaleza" className="crediscope-input" value={f.naturaleza} onChange={(e) => cambiar("naturaleza", e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ETIQUETA_NATURALEZA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="crediscope-descarga-campo">
            <label htmlFor="l-origen">Medición</label>
            <select id="l-origen" className="crediscope-input" value={f.origen} onChange={(e) => cambiar("origen", e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ETIQUETA_ORIGEN).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="crediscope-descarga-campo">
            <label htmlFor="l-exito">Resultado</label>
            <select id="l-exito" className="crediscope-input" value={f.exito} onChange={(e) => cambiar("exito", e.target.value)}>
              <option value="">Todos</option>
              <option value="si">Exitosas</option>
              <option value="no">Fallidas</option>
            </select>
          </div>
          <div className="crediscope-descarga-campo" style={{ minWidth: 220 }}>
            <label htmlFor="l-texto">Cédula, criterio o error</label>
            <input id="l-texto" className="crediscope-input" value={f.texto} onChange={(e) => cambiar("texto", e.target.value)} placeholder="Buscar..." />
          </div>
          <div className="crediscope-descarga-campo" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="crediscope-btn" onClick={() => descargarCsv(visibles)} disabled={!visibles.length}>
              Descargar CSV
            </button>
          </div>
        </div>
      </div>

      <div className="crediscope-card">
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Proceso</th>
                <th>Modelo</th>
                <th>Referencia</th>
                <th style={{ textAlign: "right" }}>Entrada</th>
                <th style={{ textAlign: "right" }}>Salida</th>
                <th style={{ textAlign: "right" }}>Razon.</th>
                <th style={{ textAlign: "right" }}>Caché esc./lec.</th>
                <th style={{ textAlign: "right" }}>Seg.</th>
                <th style={{ textAlign: "right" }}>Costo</th>
                <th>Medición</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, 500).map((r) => (
                <tr key={r.id} style={!r.exito ? { background: "color-mix(in srgb, var(--bad) 7%, transparent)" } : undefined}>
                  <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(r.created_at)}</td>
                  <td>
                    {ETIQUETA_FUNCION[r.funcion] ?? r.funcion}
                    <div className="crediscope-muted" style={{ fontSize: 12 }}>{ETIQUETA_NATURALEZA[r.naturaleza]}</div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {r.modelo === "desconocido" ? <span className="crediscope-muted">sin registro</span> : r.modelo}
                    {r.contexto?.escalamiento ? <div className="crediscope-muted" style={{ fontSize: 12 }}>escalamiento</div> : null}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {r.contexto?.cedula ? (
                      <Link to={`/perfil/${r.contexto.cedula}`}>{r.contexto.cedula}</Link>
                    ) : r.contexto?.paquete_id ? (
                      <span className="crediscope-muted">paquete {String(r.contexto.paquete_id).slice(0, 8)}</span>
                    ) : (
                      "—"
                    )}
                    {r.contexto?.marco ? <div className="crediscope-muted" style={{ fontSize: 12 }}>{r.contexto.marco}</div> : null}
                    {!r.exito && r.error ? (
                      <div style={{ color: "var(--bad)", fontSize: 12, maxWidth: 320 }}>{r.error}</div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.origen_medicion === "sin_datos" ? "—" : num(r.tokens_entrada)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.origen_medicion === "sin_datos" ? "—" : num(r.tokens_salida)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.tokens_razonamiento === null ? "—" : num(r.tokens_razonamiento)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12.5 }}>
                    {r.origen_medicion === "sin_datos" ? "—" : `${num(r.tokens_cache_escritura)} / ${num(r.tokens_cache_lectura)}`}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.duracion_ms ? (r.duracion_ms / 1000).toFixed(1) : "—"}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {r.costo_usd === null ? <span className="crediscope-muted">?</span> : money(r.costo_usd)}
                  </td>
                  <td style={{ fontSize: 12 }} title={DESCRIPCION_ORIGEN[r.origen_medicion]}>
                    <span style={{ color: COLOR_ORIGEN[r.origen_medicion] }}>{ETIQUETA_ORIGEN[r.origen_medicion]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibles.length > 500 ? (
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>
            Se muestran las primeras 500. El CSV incluye las {visibles.length}.
          </p>
        ) : null}
        {visibles.length === 0 && filas ? (
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>Ninguna llamada con esos filtros.</p>
        ) : null}
      </div>
    </div>
  );
}
