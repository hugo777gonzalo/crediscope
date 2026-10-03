import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCasos } from "../../lib/laboratorio.js";
import { formatearDia } from "../../lib/fechas.js";
import { MensajeError, Etiqueta, num } from "./Comunes.jsx";

// Los casos, para leerlos con todo a la vista (diseño, 7.4): desde cada
// operación se llega al perfil del cliente y al análisis que se le hizo,
// con lo que leyó el modelo y lo que respondió. Es la lectura cualitativa
// que antes hacía el modelo de lenguaje, ahora hecha por una persona.

const FILTROS = {
  aprobados_que_cayeron: { texto: "Aprobados que cayeron", f: (c) => c.incluida && c.malo && ["aprobar", "revisar"].includes(c.recomendacion) },
  negados_que_pagaron: { texto: "Negados que pagaron", f: (c) => c.incluida && c.malo === false && c.recomendacion === "negar" && c.veredicto_origen !== "control_bloqueo" },
  malos: { texto: "Todos los malos", f: (c) => c.incluida && c.malo },
  excluidas: { texto: "Excluidas, con su motivo", f: (c) => !c.incluida },
};

export default function PestanaCasos({ corteId, esSintetico }) {
  const [casos, setCasos] = useState(null);
  const [filtro, setFiltro] = useState("aprobados_que_cayeron");
  const [error, setError] = useState(null);

  useEffect(() => {
    getCasos(corteId).then(setCasos).catch((e) => setError(e.message));
  }, [corteId]);

  const visibles = useMemo(() => (casos ?? []).filter(FILTROS[filtro].f), [casos, filtro]);

  if (error) return <MensajeError mensaje={error} />;
  if (!casos) return <p className="crediscope-muted">Cargando casos...</p>;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.entries(FILTROS).map(([clave, { texto, f }]) => (
          <button key={clave} className={`crediscope-btn ${filtro === clave ? "" : "crediscope-btn-ghost"}`} onClick={() => setFiltro(clave)}>
            {texto} ({num(casos.filter(f).length)})
          </button>
        ))}
      </div>
      {esSintetico ? (
        <p className="crediscope-muted" style={{ fontSize: 13 }}>
          En un corte sintético el puntaje y el resultado son inventados: el análisis enlazado (si existe) no es el que produjo este puntaje.
        </p>
      ) : null}
      <div className="crediscope-card">
        {visibles.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>No hay casos con este filtro.</p>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 520 }}>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Cédula</th>
                  <th>Desembolso</th>
                  <th style={{ textAlign: "right" }}>Puntaje</th>
                  <th>Recomendación</th>
                  <th>Resultado</th>
                  <th>{filtro === "excluidas" ? "Motivo" : "Versión"}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibles.slice(0, 500).map((c) => (
                  <tr key={c.operacion_id}>
                    <td><Link to={`/perfil/${c.cedula}`}>{c.cedula}</Link></td>
                    <td>{formatearDia(c.fecha_desembolso)}</td>
                    <td style={{ textAlign: "right" }}>{c.puntaje ?? "—"}</td>
                    <td>{c.veredicto_origen === "control_bloqueo" ? "Negado por bloqueo" : c.recomendacion ?? "—"}</td>
                    <td>{c.malo === null ? "—" : c.malo ? <Etiqueta texto="Cayó" color="var(--bad)" /> : <Etiqueta texto="Pagó" color="var(--good)" />}</td>
                    <td className="crediscope-muted" style={{ fontSize: 12.5 }}>
                      {filtro === "excluidas" ? c.motivo_exclusion : c.fuente_puntaje === "sintetico" ? "sintético" : c.marco_version ?? "—"}
                    </td>
                    <td>{c.analysis_result_id ? <Link to={`/historial/analisis/${c.analysis_result_id}`}>Ver análisis</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibles.length > 500 ? <p className="crediscope-muted" style={{ fontSize: 12.5 }}>Se muestran 500 de {num(visibles.length)}.</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
