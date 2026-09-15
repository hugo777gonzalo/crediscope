import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, Upload, Trash2, Sparkles, FileText, History } from "lucide-react";
import {
  getClientesParaPlantilla,
  vincularFilasConAnalisis,
  guardarPaqueteFeedback,
  getPaquetesFeedback,
  eliminarPaqueteFeedback,
  generarInformeFeedback,
  getInformesFeedback,
} from "../lib/api.js";
import { generarPlantilla, leerArchivo } from "../lib/feedbackExcel.js";
import { formatearFecha, hoyEcuador } from "../lib/fechas.js";

// Retroalimentación: el área de Crédito/Riesgos carga el resultado real
// de los créditos (se desembolsó, cayó en default, por qué) para que el
// sistema pueda después contrastar sus recomendaciones contra lo que
// efectivamente pasó.
//
// La pantalla es deliberadamente simple -- descargar, completar, subir.
// Nada de vocabulario técnico: quien la usa es una jefatura de crédito,
// no un perfil técnico.

// Las columnas `date` de Postgres llegan como "AAAA-MM-DD" sin hora, y
// pasarlas por new Date() las interpreta como medianoche UTC: en
// Ecuador (UTC-5) eso las corre un día para atrás. Se formatean a mano.
function fechaCorta(valor) {
  if (!valor) return "—";
  const soloFecha = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloFecha) return `${Number(soloFecha[3])}/${Number(soloFecha[2])}/${soloFecha[1]}`;
  return formatearFecha(valor);
}

export default function Retroalimentacion() {
  const [paquetes, setPaquetes] = useState([]);
  const [informesPorPaquete, setInformesPorPaquete] = useState({});
  const [analizando, setAnalizando] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [descargando, setDescargando] = useState(false);
  const navigate = useNavigate();

  const [archivo, setArchivo] = useState(null);
  const [previsualizacion, setPrevisualizacion] = useState(null);
  const [etiqueta, setEtiqueta] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargarPaquetes() {
    setLoading(true);
    setError(null);
    try {
      const [lista, informes] = await Promise.all([getPaquetesFeedback(), getInformesFeedback()]);
      setPaquetes(lista);
      // Solo interesa el informe más reciente de cada paquete: vienen
      // ordenados por fecha descendente, así que el primero gana.
      const porPaquete = {};
      for (const inf of informes) {
        if (!porPaquete[inf.paquete_id]) porPaquete[inf.paquete_id] = inf;
      }
      setInformesPorPaquete(porPaquete);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalizar(paqueteId) {
    setAnalizando(paqueteId);
    setError(null);
    try {
      const informe = await generarInformeFeedback(paqueteId);
      navigate(`/retroalimentacion/informe/${informe.id}`);
    } catch (err) {
      setError(err.message);
      setAnalizando(null);
    }
  }

  useEffect(() => {
    cargarPaquetes();
  }, []);

  async function handleDescargarPlantilla() {
    setDescargando(true);
    setError(null);
    try {
      const filas = await getClientesParaPlantilla();
      if (filas.length === 0) {
        setError("Todavía no hay clientes analizados para incluir en la plantilla.");
        return;
      }
      generarPlantilla(filas, `retroalimentacion-crediscope-${hoyEcuador()}.xlsx`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(false);
    }
  }

  async function handleArchivo(e) {
    const file = e.target.files?.[0];
    setArchivo(file ?? null);
    setPrevisualizacion(null);
    setError(null);
    if (!file) return;
    try {
      const { filas, errores } = leerArchivo(await file.arrayBuffer());
      if (filas.length === 0) {
        setError(errores.join(" ") || "No se pudo leer ninguna fila del archivo.");
        return;
      }
      const vinculadas = await vincularFilasConAnalisis(filas);
      setPrevisualizacion({
        filas: vinculadas,
        errores,
        desembolsados: vinculadas.filter((f) => f.desembolsado).length,
        defaults: vinculadas.filter((f) => f.huboDefault === true).length,
        vinculados: vinculadas.filter((f) => f.analysisResultId).length,
        conObservaciones: vinculadas.filter((f) => f.observaciones).length,
      });
      if (!etiqueta) setEtiqueta(file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setError(`No se pudo leer el archivo: ${err.message}`);
    }
  }

  async function handleGuardar() {
    if (!previsualizacion || !etiqueta.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarPaqueteFeedback({
        etiqueta: etiqueta.trim(),
        notas,
        archivoNombre: archivo?.name,
        filas: previsualizacion.filas,
      });
      setArchivo(null);
      setPrevisualizacion(null);
      setEtiqueta("");
      setNotas("");
      await cargarPaquetes();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function handleEliminar(id, etiquetaPaquete) {
    if (!window.confirm(`¿Eliminar el paquete "${etiquetaPaquete}" y todos sus registros? Esta acción no se puede deshacer.`)) return;
    setError(null);
    try {
      await eliminarPaqueteFeedback(id);
      await cargarPaquetes();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Retroalimentación</h2>
          <p className="crediscope-muted" style={{ margin: 0 }}>
            Cargá el resultado real de los créditos para que el sistema pueda contrastar sus recomendaciones con lo que efectivamente pasó.
          </p>
        </div>
        <Link className="crediscope-btn crediscope-btn-ghost" to="/retroalimentacion/versiones">
          <History size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
          Historial del criterio
        </Link>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="crediscope-reportes-grid">
        <div className="crediscope-card">
          <h3>1. Descargá la plantilla</h3>
          <p className="crediscope-muted">
            Viene con los clientes que ya analizamos y sus resultados. Solo hay que completar las columnas de su sistema: si se
            desembolsó, si hubo incumplimiento y — si lo conocen — por qué.
          </p>
          <button className="crediscope-btn" onClick={handleDescargarPlantilla} disabled={descargando}>
            <Download size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
            {descargando ? "Preparando..." : "Descargar plantilla"}
          </button>
        </div>

        <div className="crediscope-card">
          <h3>2. Subí el archivo completado</h3>
          <p className="crediscope-muted">Revisá el resumen antes de confirmar. Nada se guarda hasta que le des a Guardar.</p>
          <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} className="crediscope-input" />
        </div>
      </div>

      {previsualizacion ? (
        <div className="crediscope-card">
          <h3>Resumen de lo que se va a guardar</h3>
          <div className="crediscope-kpi-grid" style={{ marginTop: 12 }}>
            <div className="crediscope-card crediscope-kpi">
              <p className="crediscope-kpi-label">Créditos reportados</p>
              <p className="crediscope-kpi-valor">{previsualizacion.filas.length}</p>
              <p className="crediscope-kpi-detalle">{previsualizacion.desembolsados} desembolsados</p>
            </div>
            <div className="crediscope-card crediscope-kpi">
              <p className="crediscope-kpi-label">Incumplimientos</p>
              <p className="crediscope-kpi-valor">{previsualizacion.defaults}</p>
              <p className="crediscope-kpi-detalle">Es la señal más valiosa del paquete</p>
            </div>
            <div className="crediscope-card crediscope-kpi">
              <p className="crediscope-kpi-label">Vinculados a un análisis</p>
              <p className="crediscope-kpi-valor">{previsualizacion.vinculados}</p>
              <p className="crediscope-kpi-detalle">
                {previsualizacion.filas.length - previsualizacion.vinculados} sin análisis previo que vincular
              </p>
            </div>
            <div className="crediscope-card crediscope-kpi">
              <p className="crediscope-kpi-label">Con observaciones</p>
              <p className="crediscope-kpi-valor">{previsualizacion.conObservaciones}</p>
              <p className="crediscope-kpi-detalle">Texto de cobranza para el análisis cualitativo</p>
            </div>
          </div>

          {previsualizacion.errores.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: "var(--warn)", fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>
                {previsualizacion.errores.length} fila(s) se van a omitir:
              </p>
              <ul className="crediscope-list" style={{ fontSize: 13 }}>
                {previsualizacion.errores.slice(0, 8).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {previsualizacion.errores.length > 8 ? <li>…y {previsualizacion.errores.length - 8} más.</li> : null}
              </ul>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10, marginTop: 18, maxWidth: 520 }}>
            <input
              className="crediscope-input"
              placeholder="Nombre del paquete (ej. Cosecha 2026-Q1)"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
            />
            <input
              className="crediscope-input"
              placeholder="Notas (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
            <button className="crediscope-btn" onClick={handleGuardar} disabled={guardando || !etiqueta.trim()}>
              <Upload size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
              {guardando ? "Guardando..." : "Guardar paquete"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="crediscope-card">
        <h3>Paquetes cargados</h3>
        {loading ? (
          <p className="crediscope-muted">Cargando...</p>
        ) : paquetes.length === 0 ? (
          <p className="crediscope-muted">Todavía no se cargó ningún paquete de retroalimentación.</p>
        ) : (
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Paquete</th>
                <th>Cargado</th>
                <th>Período</th>
                <th>Créditos</th>
                <th>Incumplimientos</th>
                <th>Vinculados</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paquetes.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.etiqueta}
                    {p.notas ? <div className="crediscope-muted">{p.notas}</div> : null}
                  </td>
                  <td>{fechaCorta(p.created_at)}</td>
                  <td>
                    {p.periodo_desde ? `${fechaCorta(p.periodo_desde)} — ${fechaCorta(p.periodo_hasta)}` : "—"}
                  </td>
                  <td>{p.total_filas}</td>
                  <td>{p.total_default}</td>
                  <td>{p.total_vinculados}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {informesPorPaquete[p.id] ? (
                        <Link
                          className="crediscope-btn crediscope-btn-ghost"
                          to={`/retroalimentacion/informe/${informesPorPaquete[p.id].id}`}
                          title="Ver el informe generado"
                        >
                          <FileText size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                          Ver informe
                        </Link>
                      ) : null}
                      <button
                        className="crediscope-btn"
                        onClick={() => handleAnalizar(p.id)}
                        disabled={analizando === p.id}
                        title="Analizar este paquete y generar el informe"
                      >
                        <Sparkles size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                        {analizando === p.id ? "Analizando..." : informesPorPaquete[p.id] ? "Regenerar" : "Analizar"}
                      </button>
                      <button
                        className="crediscope-btn crediscope-btn-ghost"
                        onClick={() => handleEliminar(p.id, p.etiqueta)}
                        title="Eliminar paquete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
