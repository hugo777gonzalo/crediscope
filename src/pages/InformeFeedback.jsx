import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AlertTriangle, CloudRain, HelpCircle, Scale, Lightbulb } from "lucide-react";
import { getInformeFeedback, getPropuestas, generarPropuestas, correrBacktest, getBacktests } from "../lib/api.js";
import PropuestasAjuste from "../components/PropuestasAjuste.jsx";
import ResultadoBacktest from "../components/ResultadoBacktest.jsx";
import { formatearFecha } from "../lib/fechas.js";

// Informe "Esto encontramos": el diagnóstico de una cosecha de créditos
// contra lo que el modelo había recomendado. Pensado para que lo lea una
// jefatura de Crédito/Riesgos — números arriba, explicación en español
// llano abajo, cero vocabulario técnico.

const CATEGORIAS = {
  previsible: {
    etiqueta: "Se podía anticipar",
    color: "var(--bad)",
    Icono: AlertTriangle,
    ayuda: "Había señales en la información disponible ese día. Es el grupo sobre el que sí conviene ajustar criterios.",
  },
  externo: {
    etiqueta: "Factor externo",
    color: "var(--text-muted)",
    Icono: CloudRain,
    ayuda: "Respondió a un hecho posterior e imprevisible. No hay nada que corregir en el análisis.",
  },
  parcial: {
    etiqueta: "Señal parcial",
    color: "var(--warn)",
    Icono: Scale,
    ayuda: "Había una señal débil, insuficiente por sí sola. Suele ser tema de política de crédito más que de criterios de scoring.",
  },
};

const CATEGORIA_DESCONOCIDA = {
  etiqueta: "No se puede determinar",
  color: "var(--text-muted)",
  Icono: HelpCircle,
  ayuda: "La información disponible no alcanza para clasificar el caso.",
};

function categoriaDe(valor) {
  return CATEGORIAS[String(valor || "").toLowerCase()] ?? CATEGORIA_DESCONOCIDA;
}

function TarjetaKpi({ etiqueta, valor, detalle, color }) {
  return (
    <div className="crediscope-card crediscope-kpi">
      <p className="crediscope-kpi-label">{etiqueta}</p>
      <p className="crediscope-kpi-valor" style={color ? { color } : undefined}>
        {valor}
      </p>
      {detalle ? <p className="crediscope-kpi-detalle">{detalle}</p> : null}
    </div>
  );
}

export default function InformeFeedback() {
  const { id } = useParams();
  const [informe, setInforme] = useState(null);
  const [propuestas, setPropuestas] = useState([]);
  const [backtest, setBacktest] = useState(null);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [generando, setGenerando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [sinPropuestas, setSinPropuestas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    const inf = await getInformeFeedback(id);
    setInforme(inf);
    const props = await getPropuestas(id);
    setPropuestas(props);
    // Por defecto quedan marcadas para probar las aprobadas que aún no
    // están en vigencia: son justo las que falta validar.
    setSeleccionadas(props.filter((p) => p.tipo === "criterio_modelo" && p.estado === "aprobada").map((p) => p.id));
    if (inf?.paquete_id) {
      const bts = await getBacktests(inf.paquete_id);
      setBacktest(bts[0] ?? null);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    cargar()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [cargar]);

  async function handleGenerarPropuestas() {
    setGenerando(true);
    setError(null);
    setSinPropuestas(null);
    try {
      const res = await generarPropuestas(id);
      if (!res.propuestas || res.propuestas.length === 0) {
        setSinPropuestas(res.sinPropuestas ?? "No hay ajustes que proponer con fundamento a partir de este informe.");
      }
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerando(false);
    }
  }

  async function handleProbar() {
    setProbando(true);
    setError(null);
    try {
      const res = await correrBacktest(informe.paquete_id, seleccionadas);
      setBacktest(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setProbando(false);
    }
  }

  function alternarSeleccion(propuestaId) {
    setSeleccionadas((prev) => (prev.includes(propuestaId) ? prev.filter((x) => x !== propuestaId) : [...prev, propuestaId]));
  }

  if (loading) return <p className="crediscope-muted">Cargando informe...</p>;
  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );
  if (!informe) return <p className="crediscope-muted">No se encontró el informe.</p>;

  const est = informe.estadisticas ?? {};
  const res = informe.resultado ?? {};
  const tipos = Object.entries(est.porTipoIncumplimiento ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <p>
        <Link to="/retroalimentacion" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver a Retroalimentación
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Esto encontramos</h2>
        <p className="crediscope-muted">
          {informe.feedback_paquetes?.etiqueta} · informe generado el {formatearFecha(informe.created_at)} ·{" "}
          {informe.casos_enviados} caso(s) analizado(s)
        </p>
      </div>

      <div className="crediscope-kpi-grid">
        <TarjetaKpi
          etiqueta="Créditos desembolsados"
          valor={est.desembolsados ?? 0}
          detalle={`${est.noDesembolsados ?? 0} analizados que no se desembolsaron`}
        />
        <TarjetaKpi
          etiqueta="Incumplimientos"
          valor={est.incumplimientos ?? 0}
          detalle={est.tasaIncumplimiento !== null && est.tasaIncumplimiento !== undefined ? `${est.tasaIncumplimiento}% de los desembolsados` : null}
          color="var(--bad)"
        />
        <TarjetaKpi
          etiqueta="Aprobados que incumplieron"
          valor={est.aprobadosQueIncumplieron ?? 0}
          detalle="Los que el modelo recomendó aprobar y fallaron"
          color={est.aprobadosQueIncumplieron ? "var(--bad)" : undefined}
        />
        <TarjetaKpi
          etiqueta="Excepciones que salieron bien"
          valor={est.overridesQueSalieronBien ?? 0}
          detalle="Recomendamos negar, se aprobó igual y pagó — señal de que el modelo puede ser muy duro"
          color={est.overridesQueSalieronBien ? "var(--warn)" : undefined}
        />
      </div>

      {res.resumenEjecutivo ? (
        <div className="crediscope-card">
          <h3>Resumen</h3>
          <p style={{ lineHeight: 1.65, margin: 0 }}>{res.resumenEjecutivo}</p>
        </div>
      ) : null}

      {Array.isArray(res.hallazgos) && res.hallazgos.length > 0 ? (
        <div className="crediscope-card">
          <h3>Hallazgos principales</h3>
          <div style={{ display: "grid", gap: 14, marginTop: 10 }}>
            {res.hallazgos.map((h, i) => (
              <div key={i}>
                <p style={{ fontWeight: 600, margin: "0 0 4px" }}>{h.titulo}</p>
                <p className="crediscope-muted" style={{ margin: 0, lineHeight: 1.6 }}>
                  {h.detalle}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="crediscope-reportes-grid">
        {Array.isArray(res.clasificacionIncumplimientos) && res.clasificacionIncumplimientos.length > 0 ? (
          <div className="crediscope-card">
            <h3>Por qué falló cada uno</h3>
            <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
              La distinción que importa: cuáles se podían anticipar con la información de ese día y cuáles no.
            </p>
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              {res.clasificacionIncumplimientos.map((c, i) => {
                const cat = categoriaDe(c.categoria);
                const { Icono } = cat;
                return (
                  <div key={i} style={{ display: "flex", gap: 10 }}>
                    <Icono size={17} color={cat.color} style={{ flexShrink: 0, marginTop: 2 }} title={cat.ayuda} />
                    <div>
                      <p style={{ margin: "0 0 2px", fontSize: 13.5 }}>
                        <strong>{c.cedula}</strong>{" "}
                        <span style={{ color: cat.color, fontWeight: 600 }}>· {cat.etiqueta}</span>
                      </p>
                      <p className="crediscope-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
                        {c.explicacion}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="crediscope-card">
          <h3>Tipos de incumplimiento</h3>
          {tipos.length === 0 ? (
            <p className="crediscope-muted">Sin incumplimientos clasificados en este paquete.</p>
          ) : (
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Casos</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map(([tipo, n]) => (
                  <tr key={tipo}>
                    <td style={{ textTransform: "capitalize" }}>{tipo}</td>
                    <td>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {Array.isArray(res.sobreCastigados) && res.sobreCastigados.length > 0 ? (
        <div className="crediscope-card">
          <h3>Clientes que el modelo castigó de más</h3>
          <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
            Se recomendó negar o revisar, se aprobaron igual, y pagaron bien.
          </p>
          <ul className="crediscope-list">
            {res.sobreCastigados.map((s, i) => (
              <li key={i}>
                <strong>{s.cedula}</strong> — {s.detalle}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {Array.isArray(res.informacionQueFaltaba) && res.informacionQueFaltaba.length > 0 ? (
        <div className="crediscope-card">
          <h3>Información que habría cambiado el análisis</h3>
          <ul className="crediscope-list">
            {res.informacionQueFaltaba.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {Array.isArray(res.limitaciones) && res.limitaciones.length > 0 ? (
        <div className="crediscope-card" style={{ background: "var(--panel-muted)" }}>
          <h3>Qué no se puede concluir todavía</h3>
          <ul className="crediscope-list">
            {res.limitaciones.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {propuestas.length === 0 ? (
        <div className="crediscope-card">
          <h3>¿Qué ajustamos?</h3>
          <p className="crediscope-muted" style={{ marginTop: 0 }}>
            A partir de este diagnóstico, el sistema puede proponer ajustes concretos al criterio del modelo y recomendaciones
            para el proceso de crédito. Vos decidís cuáles se aprueban: nada se aplica solo.
          </p>
          {sinPropuestas ? (
            <p style={{ color: "var(--warn)", fontSize: 13.5 }}>{sinPropuestas}</p>
          ) : null}
          <button className="crediscope-btn" onClick={handleGenerarPropuestas} disabled={generando}>
            <Lightbulb size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
            {generando ? "Analizando..." : "Proponer ajustes"}
          </button>
        </div>
      ) : (
        <PropuestasAjuste
          propuestas={propuestas}
          onCambio={cargar}
          onProbar={handleProbar}
          probando={probando}
          seleccionadas={seleccionadas}
          onSeleccionar={alternarSeleccion}
        />
      )}

      <ResultadoBacktest backtest={backtest} />
    </div>
  );
}
