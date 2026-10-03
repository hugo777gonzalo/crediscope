import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Upload } from "lucide-react";
import { descargarPlantilla, leerPlanilla } from "../lib/plantillaLaboratorio.js";
import { subirCarga } from "../lib/laboratorio.js";
import { hoyEcuador } from "../lib/fechas.js";
import { Volver, MensajeError, num } from "../components/laboratorio/Comunes.jsx";

// Subir el archivo de resultados de una IFI. Primero se lee y se valida
// todo en el navegador, y se muestran las filas rechazadas con su motivo;
// recién al aceptar se guarda. Lo que se guarda se vincula y se concilia
// en la base (lab_cerrar_carga), no acá.

export default function LaboratorioCargaNueva() {
  const navigate = useNavigate();
  const [etiqueta, setEtiqueta] = useState("");
  const [institucion, setInstitucion] = useState("");
  const [fechaCorte, setFechaCorte] = useState(hoyEcuador());
  const [archivo, setArchivo] = useState(null);
  const [lectura, setLectura] = useState(null);
  const [error, setError] = useState(null);
  const [avance, setAvance] = useState(null);

  async function leer(f, corte) {
    setError(null);
    setLectura(null);
    if (!f) return;
    try {
      setLectura(await leerPlanilla(f, corte));
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e.message}`);
    }
  }

  async function guardar() {
    setError(null);
    setAvance({ hechas: 0, total: lectura.operaciones.length });
    try {
      const id = await subirCarga(
        { etiqueta: etiqueta.trim(), institucion: institucion.trim(), fechaCorte, archivo, operaciones: lectura.operaciones },
        (hechas, total) => setAvance({ hechas, total }),
      );
      navigate(`/laboratorio/cargas/${id}`);
    } catch (e) {
      setError(`No se guardó la carga: ${e.message}. Si quedó a medias, figura como "Cargando (incompleta)" y no se usa.`);
      setAvance(null);
    }
  }

  const listo = etiqueta.trim() && fechaCorte && lectura && lectura.operaciones.length > 0 && !avance;
  const futura = fechaCorte > hoyEcuador();

  return (
    <div>
      <Volver a="/laboratorio" texto="Volver al Laboratorio" />
      <h2 style={{ marginBottom: 4 }}>Cargar resultados de crédito</h2>
      <p className="crediscope-muted" style={{ marginTop: 0, maxWidth: "70ch" }}>
        Una fila por operación, con su fecha de desembolso y el máximo de días de mora en los primeros 12 y 24 meses. Con los
        días de mora, la definición de impago la ponemos nosotros y se puede cambiar sin pedir otro archivo.
      </p>

      <div className="crediscope-card">
        <button className="crediscope-btn crediscope-btn-ghost" onClick={descargarPlantilla}>
          <Download size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
          Descargar la plantilla
        </button>
      </div>

      <div className="crediscope-card" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <label>
          <div className="crediscope-muted" style={{ fontSize: 13 }}>Nombre de la carga</div>
          <input className="crediscope-input" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Cooperativa X, desembolsos 2025-T1" />
        </label>
        <label>
          <div className="crediscope-muted" style={{ fontSize: 13 }}>Institución</div>
          <input className="crediscope-input" value={institucion} onChange={(e) => setInstitucion(e.target.value)} />
        </label>
        <label>
          <div className="crediscope-muted" style={{ fontSize: 13 }}>Fecha de corte del archivo (hasta cuándo se observó la mora)</div>
          <input
            className="crediscope-input"
            type="date"
            value={fechaCorte}
            onChange={(e) => {
              setFechaCorte(e.target.value);
              if (archivo) leer(archivo, e.target.value);
            }}
          />
          {futura ? <div style={{ color: "var(--bad)", fontSize: 13 }}>Una carga real no puede tener fecha de corte futura.</div> : null}
        </label>
        <label>
          <div className="crediscope-muted" style={{ fontSize: 13 }}>Archivo (.xlsx)</div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setArchivo(f);
              leer(f, fechaCorte);
            }}
          />
        </label>
      </div>

      <MensajeError mensaje={error} />

      {lectura ? (
        <div className="crediscope-card">
          <p style={{ marginTop: 0 }}>
            <strong>{num(lectura.operaciones.length)}</strong> operaciones válidas de {num(lectura.leidas)} filas leídas.
            {lectura.errores.length ? (
              <span style={{ color: "var(--bad)" }}> {num(lectura.errores.length)} filas rechazadas: no se cargan.</span>
            ) : null}
          </p>
          {lectura.errores.length ? (
            <div style={{ maxHeight: 280, overflow: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Operación</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {lectura.errores.map((e) => (
                    <tr key={`${e.fila}-${e.motivo}`}>
                      <td>{e.fila}</td>
                      <td>{e.operacion || "—"}</td>
                      <td>{e.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <button className="crediscope-btn" disabled={!listo || futura} onClick={guardar}>
              <Upload size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
              {avance ? `Guardando ${num(avance.hechas)} de ${num(avance.total)}...` : `Cargar ${num(lectura.operaciones.length)} operaciones`}
            </button>
            {!etiqueta.trim() ? <span className="crediscope-muted" style={{ marginLeft: 10, fontSize: 13 }}>Falta el nombre de la carga.</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
