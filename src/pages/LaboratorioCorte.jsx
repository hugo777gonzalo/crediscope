import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FilePlus, FileDown, LineChart, Sigma, Microscope } from "lucide-react";
import { getCorte, getResultados, getPropuestas } from "../lib/laboratorio.js";
import { exportarInforme } from "../lib/informeLaboratorio.js";
import { registrarEvento } from "../lib/api.js";
import { formatearFechaHora } from "../lib/fechas.js";
import { Volver, MensajeError, FranjaSintetica, Kpi, num, pct } from "../components/laboratorio/Comunes.jsx";

// La ficha de un corte congelado: qué población es, qué se calculó y la
// puerta a los tres módulos que trabajan sobre él (fase B de
// docs/laboratorio-pantallas.md: las pestañas que vivían acá se repartieron
// en esos módulos). El informe y las propuestas salen de acá.

const ETIQUETA_TIPO = {
  desempeno: "Desempeño", matriz: "Matriz de confusión", cuadrantes: "Con y sin crédito", motivos: "Motivos del impago",
  variables: "Variables (IV y WoE)", calificacion_simulacion: "Calificación de la simulación", crudo: "Explorador del crudo",
  simulacion_politica: "Simulación de política", estabilidad: "Estabilidad (PSI)", calibracion: "Calibración",
  importancia: "Importancia (bosque aleatorio)", segmentos: "Segmentos (K-medias)", pca: "Componentes principales",
};

const MODULOS = [
  ["/laboratorio/desempeno", LineChart, "Prueba retrospectiva y desempeño", "Discriminación, matriz de confusión, umbrales, cosechas, segmentos, calibración y estabilidad."],
  ["/laboratorio/estadistica", Sigma, "Descubrimiento estadístico", "Descriptivas, distribuciones, faltantes, correlaciones, pruebas, IV y WoE."],
  ["/laboratorio/profundo", Microscope, "Descubrimiento profundo", "Crudo, estructura, entrada al modelo, los que cayeron, motivos e importancia."],
];

export default function LaboratorioCorte() {
  const { id } = useParams();
  const [corte, setCorte] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getCorte(id), getResultados(id)])
      .then(([c, r]) => {
        setCorte(c);
        setResultados(r);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const ultimo = (tipo) => resultados.find((r) => r.tipo === tipo) ?? null;

  async function informe() {
    setError(null);
    try {
      const propuestas = (await getPropuestas()).filter((p) => p.corte_id === id);
      const variables = resultados.find((r) => r.tipo === "variables" && (r.metodologia?.poblacion ?? "operaciones") === "operaciones") ?? null;
      exportarInforme({ corte, desempeno: ultimo("desempeno"), variables, propuestas });
      registrarEvento("exportacion.informe_laboratorio", null, { corte_id: id });
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !corte) return <MensajeError mensaje={error} />;
  if (!corte) return <p className="crediscope-muted">Cargando...</p>;
  const r = corte.resumen ?? {};
  const s = r.solicitudes ?? null;
  const tipos = [...new Set(resultados.map((x) => x.tipo))];

  return (
    <div>
      <Volver a="/laboratorio/datos?pestana=cortes" texto="Volver a los cortes" />
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
      <MensajeError mensaje={error} />

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

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: 16 }}>
        {MODULOS.map(([ruta, Icono, titulo, texto]) => (
          <Link key={ruta} to={`${ruta}?corte=${id}`} className="crediscope-card" style={{ textDecoration: "none", color: "inherit", margin: 0 }}>
            <Icono size={20} style={{ color: "var(--brand)" }} />
            <h3 style={{ margin: "6px 0 4px" }}>{titulo}</h3>
            <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>{texto}</p>
          </Link>
        ))}
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Lo que ya se calculó</h3>
        {tipos.length ? (
          <table className="crediscope-table">
            <tbody>
              {tipos.map((t) => (
                <tr key={t}>
                  <td>{ETIQUETA_TIPO[t] ?? t}</td>
                  <td className="crediscope-muted">{resultados.filter((x) => x.tipo === t).length} cálculo(s)</td>
                  <td className="crediscope-muted">el último, {formatearFechaHora(ultimo(t).created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="crediscope-muted" style={{ margin: 0 }}>Nada todavía: cada módulo calcula lo suyo.</p>
        )}
      </div>
    </div>
  );
}
