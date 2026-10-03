import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { RefreshCw, FilePlus, FileDown } from "lucide-react";
import { getCorte, getResultados, calcular, getCatalogo, getPropuestas } from "../lib/laboratorio.js";
import { exportarInforme } from "../lib/informeLaboratorio.js";
import { formatearFechaHora } from "../lib/fechas.js";
import { Volver, MensajeError, FranjaSintetica, Kpi, num, pct } from "../components/laboratorio/Comunes.jsx";
import PestanaDesempeno from "../components/laboratorio/PestanaDesempeno.jsx";
import PestanaVariables from "../components/laboratorio/PestanaVariables.jsx";
import PestanaSimulacion from "../components/laboratorio/PestanaSimulacion.jsx";
import PestanaCasos from "../components/laboratorio/PestanaCasos.jsx";

// Un corte congelado y lo que se calcula sobre él. Cada cálculo agrega un
// resultado nuevo (nunca pisa el anterior); se muestra el último.

const PESTANAS = [
  ["desempeno", "Desempeño"],
  ["variables", "Variables"],
  ["simulacion", "Simulación de política"],
  ["casos", "Casos"],
];

export default function LaboratorioCorte() {
  const { id } = useParams();
  const [corte, setCorte] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [pestana, setPestana] = useState("desempeno");
  const [error, setError] = useState(null);
  const [calculando, setCalculando] = useState(null);

  const recargar = useCallback(async () => {
    setResultados(await getResultados(id));
  }, [id]);

  useEffect(() => {
    Promise.all([getCorte(id), getResultados(id), getCatalogo()])
      .then(([c, r, cat]) => {
        setCorte(c);
        setResultados(r);
        setCatalogo(cat);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const ultimo = (tipo) => resultados.find((r) => r.tipo === tipo) ?? null;

  async function correr(tipo) {
    setError(null);
    setCalculando(tipo);
    try {
      await calcular(id, tipo);
      await recargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setCalculando(null);
    }
  }

  async function informe() {
    setError(null);
    try {
      const propuestas = (await getPropuestas()).filter((p) => p.corte_id === id);
      exportarInforme({ corte, desempeno: ultimo("desempeno"), variables: ultimo("variables"), propuestas });
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !corte) return <MensajeError mensaje={error} />;
  if (!corte) return <p className="crediscope-muted">Cargando...</p>;
  const r = corte.resumen ?? {};
  const actual = ["desempeno", "variables"].includes(pestana) ? ultimo(pestana) : null;

  return (
    <div>
      <Volver a="/laboratorio" texto="Volver al Laboratorio" />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>{corte.nombre}</h2>
          <p className="crediscope-muted" style={{ marginTop: 0 }}>
            Ventana de {corte.ventana_meses} meses · {corte.lab_definiciones_default?.nombre} · congelado el {formatearFechaHora(corte.congelado_en)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="crediscope-btn crediscope-btn-ghost" to={`/laboratorio/propuestas?corte=${id}`}>
            <FilePlus size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
            Proponer un ajuste
          </Link>
          <button
            className="crediscope-btn crediscope-btn-ghost"
            onClick={informe}
            disabled={corte.es_sintetico}
            title={corte.es_sintetico ? "Un corte sintético no genera informe para una institución" : undefined}
          >
            <FileDown size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
            Exportar Informe de Desempeño
          </button>
        </div>
      </div>

      {corte.es_sintetico ? <FranjaSintetica que="El resultado de los créditos y el puntaje de este corte" /> : null}

      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Operaciones incluidas" valor={num(r.incluidas)} detalle={`de ${num(r.operaciones)} en las cargas`} />
        <Kpi etiqueta="Malos" valor={num(r.malos)} detalle={r.incluidas ? `${pct(r.malos / r.incluidas)} de las incluidas` : null} />
        <Kpi etiqueta="Con puntaje" valor={num(r.con_puntaje)} detalle="Sirven para medir el motor" />
        <Kpi
          etiqueta="Excluidas"
          valor={num((r.operaciones ?? 0) - (r.incluidas ?? 0))}
          detalle={Object.entries(r.excluidas ?? {}).map(([m, n]) => `${m}: ${n}`).join(" · ") || "Ninguna"}
        />
      </div>

      <div className="crediscope-tabs">
        {PESTANAS.map(([clave, texto]) => (
          <button
            key={clave}
            className={`crediscope-tab ${pestana === clave ? "crediscope-tab-active" : ""}`}
            onClick={() => setPestana(clave)}
            style={{ border: "none", background: "none", cursor: "pointer" }}
          >
            {texto}
          </button>
        ))}
      </div>

      <MensajeError mensaje={error} />

      {["desempeno", "variables"].includes(pestana) ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}>
          <button className="crediscope-btn" onClick={() => correr(pestana)} disabled={calculando !== null}>
            <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            {calculando === pestana ? "Calculando..." : actual ? "Recalcular" : "Calcular"}
          </button>
          {actual ? <span className="crediscope-muted" style={{ fontSize: 13 }}>Calculado el {formatearFechaHora(actual.created_at)}</span> : null}
        </div>
      ) : null}

      {pestana === "desempeno" ? <PestanaDesempeno resultado={actual} /> : null}
      {pestana === "variables" ? <PestanaVariables resultado={actual} /> : null}
      {pestana === "simulacion" ? (
        <PestanaSimulacion corteId={id} catalogo={catalogo} simulaciones={resultados.filter((x) => x.tipo === "simulacion_politica")} alSimular={recargar} />
      ) : null}
      {pestana === "casos" ? <PestanaCasos corteId={id} esSintetico={corte.es_sintetico} /> : null}
    </div>
  );
}
