import { useEffect, useMemo, useState } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { filasConPuntaje, getFilasDelCorte } from "../../lib/datosDelCorte.js";
import { calibrar, dividirPorFecha } from "../../lib/analisisRetrospectivo.js";
import { guardarResultado } from "../../lib/laboratorio.js";
import { formatearFechaHora } from "../../lib/fechas.js";
import { GraficoLineas } from "./Graficos.jsx";
import { Kpi, MensajeError, Cargando, num, pct, dec } from "./Comunes.jsx";

// Calibración (decisión 4 del negocio, 2026-10-03): el motor da un puntaje,
// no una probabilidad. La función puntaje → probabilidad se estima en una
// cohorte (regresión logística sobre el puntaje) y se prueba en OTRA: medida
// contra la misma cohorte siempre sale bien. Si la probabilidad predicha
// coincide con la caída observada por tramo, el puntaje se puede leer como
// probabilidad de impago.

const MITAD = "mitad";

export default function PestanaCalibracion({ corte, corteId, cortes, poblacion, resultados, recargar }) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const [estimarEn, setEstimarEn] = useState(MITAD);
  const [otras, setOtras] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  // La cohorte de estimación, si es otro corte.
  useEffect(() => {
    if (estimarEn === MITAD) return undefined;
    let vigente = true;
    const otro = cortes.find((c) => c.id === estimarEn);
    getFilasDelCorte(estimarEn, poblacion === "solicitudes" && otro?.resumen?.solicitudes ? "solicitudes" : "operaciones")
      .then((f) => vigente && setOtras({ id: estimarEn, filas: f }))
      .catch((e) => vigente && setMensaje(e.message));
    return () => {
      vigente = false;
    };
  }, [estimarEn, cortes, poblacion]);

  const c = useMemo(() => {
    if (!filas) return null;
    const propias = filasConPuntaje(filas);
    let estimacion, prueba, descripcion;
    if (estimarEn === MITAD) {
      [estimacion, prueba] = dividirPorFecha(propias);
      descripcion = { estimacion: `${corte.nombre}: la primera mitad por fecha`, prueba: `${corte.nombre}: la segunda mitad` };
    } else {
      if (otras?.id !== estimarEn) return { cargando: true };
      estimacion = filasConPuntaje(otras.filas);
      prueba = propias;
      descripcion = { estimacion: cortes.find((x) => x.id === estimarEn)?.nombre ?? "otro corte", prueba: corte.nombre };
    }
    return { descripcion, estimacion, prueba, ...calibrar(estimacion, prueba) };
  }, [filas, estimarEn, otras, corte, cortes]);

  if (error) return <MensajeError mensaje={error} />;
  if (!c || c.cargando) return mensaje ? <MensajeError mensaje={mensaje} /> : <Cargando />;
  const guardadas = resultados.filter((r) => r.tipo === "calibracion");

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const [a, b] = c.modelo.coeficientes;
      await guardarResultado(
        corteId, "calibracion",
        { version: 1, modelo: "logística: probabilidad de impago = 1 / (1 + e^-(a + b × puntaje))", poblacion, estimacion: { cohorte: c.descripcion.estimacion, corte_id: estimarEn === MITAD ? corteId : estimarEn, n: c.estimacion.length, malos: c.malosE }, prueba: { cohorte: c.descripcion.prueba, n: c.prueba.length, malos: c.malosP } },
        { intercepto: a, pendiente: b, error_pendiente: c.modelo.errores?.[1] ?? null, convergio: c.modelo.convergio, brier: c.cal.brier, brier_referencia: c.brierReferencia, habilidad: c.habilidad, ece: c.cal.ece, hosmer_lemeshow: c.cal.hosmerLemeshow, tabla: c.cal.tabla },
        c.prueba.length, c.malosP,
      );
      await recargar();
      setMensaje("Calibración guardada.");
    } catch (e) {
      setMensaje(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="crediscope-card">
        <label className="crediscope-muted" style={{ fontSize: 13 }}>
          Estimar la función en{" "}
          <select value={estimarEn} onChange={(e) => setEstimarEn(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
            <option value={MITAD}>la primera mitad de este corte (por fecha) y probar en la segunda</option>
            {cortes.filter((x) => x.id !== corteId).map((x) => (
              <option key={x.id} value={x.id}>el corte «{x.nombre}» y probar en este</option>
            ))}
          </select>
        </label>
        <p className="crediscope-muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Estimación: {c.descripcion.estimacion} ({num(c.estimacion.length)} con puntaje, {num(c.malosE)} malos). Prueba: {c.descripcion.prueba} ({num(c.prueba.length)}, {num(c.malosP)} malos).
        </p>
      </div>

      {c.insuficiente ? (
        <p className="crediscope-muted">Hacen falta 10 malos y 10 buenos para estimar, y malos en la cohorte de prueba.</p>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi etiqueta="Función" valor={`a ${dec(c.modelo.coeficientes[0], 3)} · b ${dec(c.modelo.coeficientes[1], 4)}`} detalle="probabilidad = 1 / (1 + e^-(a + b × puntaje))" />
            <Kpi etiqueta="Brier" valor={dec(c.cal.brier, 4)} detalle={`contra ${dec(c.brierReferencia, 4)} prediciendo la tasa promedio · habilidad ${pct(c.habilidad)}`} />
            <Kpi etiqueta="Error de calibración (ECE)" valor={pct(c.cal.ece, 2)} detalle="distancia media entre predicho y observado" />
            <Kpi
              etiqueta="Hosmer-Lemeshow"
              valor={`p = ${dec(c.cal.hosmerLemeshow.p, 3)}`}
              detalle={c.cal.hosmerLemeshow.p < 0.05 ? "lo observado se aparta de lo predicho" : "no se aparta más que por azar"}
              color={c.cal.hosmerLemeshow.p < 0.05 ? "var(--bad)" : undefined}
            />
          </div>

          <div className="crediscope-card">
            <h3 style={{ marginTop: 0 }}>Predicho contra observado, por decil</h3>
            <GraficoLineas
              series={[{
                nombre: "Cohorte de prueba",
                puntos: c.cal.tabla.map((t) => ({ x: t.predicho, y: t.observado, titulo: `${num(t.n)} personas: predicho ${pct(t.predicho)}, observado ${pct(t.observado)}` })),
                banda: c.cal.tabla.map((t) => ({ x: t.predicho, y0: t.ic[0], y1: t.ic[1] })),
              }]}
              x={{ titulo: "Probabilidad predicha", min: 0, max: Math.max(...c.cal.tabla.map((t) => Math.max(t.predicho, t.ic[1]))), formato: (v) => pct(v, 0) }}
              y={{ titulo: "Caída observada", min: 0, max: Math.max(...c.cal.tabla.map((t) => Math.max(t.predicho, t.ic[1]))), formato: (v) => pct(v, 0) }}
              diagonal
              etiqueta="Calibración por decil"
            />
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Decil</th>
                    <th style={{ textAlign: "right" }}>Personas</th>
                    <th style={{ textAlign: "right" }}>Predicho</th>
                    <th style={{ textAlign: "right" }}>Observado</th>
                    <th style={{ textAlign: "right" }}>Intervalo observado</th>
                  </tr>
                </thead>
                <tbody>
                  {c.cal.tabla.map((t, i) => (
                    <tr key={i}>
                      <td>{i + 1}.º</td>
                      <td style={{ textAlign: "right" }}>{num(t.n)}</td>
                      <td style={{ textAlign: "right" }}>{pct(t.predicho)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: t.predicho < t.ic[0] || t.predicho > t.ic[1] ? "var(--bad)" : undefined }}>{pct(t.observado)}</td>
                      <td style={{ textAlign: "right" }} className="crediscope-muted">{pct(t.ic[0])} a {pct(t.ic[1])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="crediscope-btn" onClick={guardar} disabled={guardando}>{guardando ? "Guardando..." : "Guardar esta calibración"}</button>
              {mensaje ? <span className="crediscope-muted" style={{ fontSize: 13 }}>{mensaje}</span> : null}
            </div>
          </div>
        </>
      )}

      {guardadas.length ? (
        <div className="crediscope-card">
          <h3 style={{ marginTop: 0 }}>Calibraciones guardadas en este corte</h3>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Estimada en</th>
                <th>Función</th>
                <th style={{ textAlign: "right" }}>Brier</th>
                <th style={{ textAlign: "right" }}>ECE</th>
              </tr>
            </thead>
            <tbody>
              {guardadas.map((g) => (
                <tr key={g.id}>
                  <td>{formatearFechaHora(g.created_at)}</td>
                  <td>{g.metodologia?.estimacion?.cohorte}</td>
                  <td>a {dec(g.resultado.intercepto, 3)} · b {dec(g.resultado.pendiente, 4)}</td>
                  <td style={{ textAlign: "right" }}>{dec(g.resultado.brier, 4)}</td>
                  <td style={{ textAlign: "right" }}>{pct(g.resultado.ece, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
