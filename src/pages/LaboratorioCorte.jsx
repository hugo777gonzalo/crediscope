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
import PestanaMatriz from "../components/laboratorio/PestanaMatriz.jsx";
import PestanaCuadrantes from "../components/laboratorio/PestanaCuadrantes.jsx";
import PestanaMotivos from "../components/laboratorio/PestanaMotivos.jsx";
import PestanaCalificacion from "../components/laboratorio/PestanaCalificacion.jsx";
import PestanaCrudo from "../components/laboratorio/PestanaCrudo.jsx";

// Un corte congelado y lo que se calcula sobre él. Cada cálculo agrega un
// resultado nuevo (nunca pisa el anterior); se muestra el último.
//
// Un corte con solicitudes (el ciclo de un año, sección 14 del diseño) suma
// las pestañas de quienes no recibieron el crédito y de los motivos del
// impago; si además es sintético, la calificación contra la verdad plantada.
// El explorador del crudo no se calcula desde acá: lo guarda un guion.

function pestanasDe(corte) {
  const conSolicitudes = Boolean(corte.resumen?.solicitudes);
  return [
    ["desempeno", "Desempeño"],
    ["matriz", "Matriz de confusión"],
    ...(conSolicitudes ? [["cuadrantes", "Con y sin crédito"], ["motivos", "Motivos del impago"]] : []),
    ["variables", "Variables"],
    ["crudo", "Explorador del crudo"],
    ["simulacion", "Simulación de política"],
    ["casos", "Casos"],
    ...(conSolicitudes && corte.es_sintetico ? [["calificacion_simulacion", "Calificación de la simulación"]] : []),
  ];
}
const CALCULABLES = ["desempeno", "matriz", "cuadrantes", "motivos", "variables", "calificacion_simulacion"];
const ETIQUETA_POBLACION = {
  operaciones: "Con el crédito de la institución",
  solicitudes: "Todas las solicitudes observadas",
};

export default function LaboratorioCorte() {
  const { id } = useParams();
  const [corte, setCorte] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [pestana, setPestana] = useState("desempeno");
  const [poblacion, setPoblacion] = useState("operaciones");
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

  // Variables se calcula por población; antes de la 099 no la guardaba y era
  // siempre la de las operaciones.
  const ultimo = (tipo) =>
    resultados.find((r) => r.tipo === tipo && (tipo !== "variables" || (r.metodologia?.poblacion ?? "operaciones") === poblacion)) ?? null;

  async function correr(tipo) {
    setError(null);
    setCalculando(tipo);
    try {
      await calcular(id, tipo, tipo === "variables" ? { p_poblacion: poblacion } : {});
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
  const s = r.solicitudes ?? null;
  const pestanas = pestanasDe(corte);
  const actual = CALCULABLES.includes(pestana) ? ultimo(pestana) : null;

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
            title={corte.es_sintetico ? "Sale con la franja SIMULACIÓN — no presentar en cada hoja" : undefined}
          >
            <FileDown size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
            {corte.es_sintetico ? "Exportar Informe (simulación)" : "Exportar Informe de Desempeño"}
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
        {s ? (
          <Kpi
            etiqueta="Solicitudes del período"
            valor={num(s.solicitudes)}
            detalle={`${num(s.desembolsadas)} con crédito · ${num(s.incluidas)} observadas · ${num(s.malos)} malos`}
          />
        ) : null}
      </div>

      <div className="crediscope-tabs">
        {pestanas.map(([clave, texto]) => (
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

      {CALCULABLES.includes(pestana) ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0", flexWrap: "wrap" }}>
          {pestana === "variables" && s ? (
            <select value={poblacion} onChange={(e) => setPoblacion(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
              {Object.entries(ETIQUETA_POBLACION).map(([clave, texto]) => (
                <option key={clave} value={clave}>{texto}</option>
              ))}
            </select>
          ) : null}
          <button className="crediscope-btn" onClick={() => correr(pestana)} disabled={calculando !== null}>
            <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            {calculando === pestana ? "Calculando..." : actual ? "Recalcular" : "Calcular"}
          </button>
          {actual ? <span className="crediscope-muted" style={{ fontSize: 13 }}>Calculado el {formatearFechaHora(actual.created_at)}</span> : null}
        </div>
      ) : null}

      {pestana === "desempeno" ? <PestanaDesempeno resultado={actual} /> : null}
      {pestana === "matriz" ? <PestanaMatriz resultado={actual} /> : null}
      {pestana === "cuadrantes" ? <PestanaCuadrantes resultado={actual} /> : null}
      {pestana === "motivos" ? <PestanaMotivos resultado={actual} /> : null}
      {pestana === "calificacion_simulacion" ? <PestanaCalificacion resultado={actual} /> : null}
      {pestana === "variables" ? <PestanaVariables resultado={actual} /> : null}
      {pestana === "crudo" ? <PestanaCrudo resultado={ultimo("crudo")} corteId={id} /> : null}
      {pestana === "simulacion" ? (
        <PestanaSimulacion corteId={id} catalogo={catalogo} simulaciones={resultados.filter((x) => x.tipo === "simulacion_politica")} alSimular={recargar} />
      ) : null}
      {pestana === "casos" ? <PestanaCasos corteId={id} esSintetico={corte.es_sintetico} /> : null}
    </div>
  );
}
