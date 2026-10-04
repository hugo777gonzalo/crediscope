import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Database, LineChart, Sigma, Microscope, FileText, History, Building2, AlertTriangle } from "lucide-react";
import {
  getCargas, getCortes, getPropuestas, getResultados, getCandidatas, getInstituciones, getVolumenDeAnalisis, getCentroDeDatos, contarReconsultasSinProcesar,
} from "../lib/laboratorio.js";
import { getFilasDelCorte } from "../lib/datosDelCorte.js";
import { segmentar } from "../lib/analisisRetrospectivo.js";
import { formatearFechaHora } from "../lib/fechas.js";
import { GraficoBarras } from "../components/laboratorio/Graficos.jsx";
import { Kpi, MensajeError, Cargando, Etiqueta, ETIQUETA_RECOMENDACION, num, pct, dec } from "../components/laboratorio/Comunes.jsx";

// Laboratorio de Inteligencia de Negocio › Riesgo de Crédito: el inicio
// (módulo 1 del negocio). Indicadores, hallazgos críticos, evolución, el
// motor por institución, el volumen de análisis, la actividad, los trabajos
// que quedaron a medias y las alertas. Lo opera nuestro equipo (sólo admin);
// la IFI recibe un informe exportado. Diseño: docs/laboratorio-de-riesgo.md
// y docs/laboratorio-pantallas.md.
//
// "Crítico" estaba sin definir (pantallas, módulo 1). Definición propuesta,
// a confirmar por el negocio: una fuente que dejó de contestar, un campo del
// crudo o una variable que anticipa el impago y el modelo no tiene, un corte
// donde el motor no ordena (AUC menor a 0,65) y una población que cambió
// (PSI mayor a 0,25).

const MODULOS = [
  ["/laboratorio/instituciones", Building2, "Instituciones y proyectos", "Con quién trabajamos y en qué."],
  ["/laboratorio/datos", Database, "Datos y cartera", "Cargas, calidad, conciliación, centro de datos y cortes."],
  ["/laboratorio/desempeno", LineChart, "Prueba retrospectiva", "¿El motor ordena bien a buenos y malos y se sostiene?"],
  ["/laboratorio/estadistica", Sigma, "Descubrimiento estadístico", "¿Qué anticipa el impago?"],
  ["/laboratorio/profundo", Microscope, "Descubrimiento profundo", "¿Qué no vio el modelo?"],
  ["/laboratorio/propuestas", FileText, "Propuestas", "Ajustes con evidencia, para revisar y presentar."],
  ["/laboratorio/criterio", History, "Criterio vigente", "Qué ajustes están en vigencia y su historia."],
];
const TIPO_RESULTADO = {
  desempeno: "Desempeño", matriz: "Matriz de confusión", variables: "Variables", crudo: "Explorador del crudo", motivos: "Motivos del impago",
  cuadrantes: "Con y sin crédito", calificacion_simulacion: "Calificación de la simulación", estabilidad: "Estabilidad", calibracion: "Calibración",
  importancia: "Importancia (bosque)", segmentos_kmedias: "Segmentos (K-medias)", pca: "Componentes principales", simulacion_politica: "Simulación de política",
};

async function cargarInicio() {
  const [cargas, cortes, propuestas, candidatas, instituciones, volumen, centro, sinProcesar] = await Promise.all([
    getCargas(), getCortes(), getPropuestas(), getCandidatas(), getInstituciones(), getVolumenDeAnalisis(), getCentroDeDatos(60), contarReconsultasSinProcesar(),
  ]);
  const resultados = Object.fromEntries(await Promise.all(cortes.map(async (c) => [c.id, await getResultados(c.id)])));
  // La evolución del default, sobre el corte más reciente.
  const evolucion = cortes[0] ? segmentar(await getFilasDelCorte(cortes[0].id, "operaciones"), "mes") : null;
  return { cargas, cortes, propuestas, candidatas, instituciones, volumen, centro, sinProcesar, resultados, evolucion };
}

function hallazgosCriticos(d) {
  const lista = [];
  for (const f of d.centro.fuentes) {
    if (f.contesto_mes_anterior !== null && f.contesto_ultima_semana !== null && f.consultas_ultima_semana >= 20 && f.contesto_mes_anterior - f.contesto_ultima_semana > 0.1) {
      lista.push({ tipo: "Fuente", texto: `${f.fuente} contesta ${pct(f.contesto_ultima_semana, 0)} en la última semana contra ${pct(f.contesto_mes_anterior, 0)} el mes anterior`, enlace: "/laboratorio/datos?pestana=centro" });
    }
  }
  for (const c of d.cortes) {
    const rs = d.resultados[c.id] ?? [];
    const crudo = rs.find((r) => r.tipo === "crudo")?.resultado;
    const noVistos = (crudo?.hallazgos ?? []).filter((h) => h.significativa && h.el_modelo === "no_lo_tenia" && !h.nombrado);
    if (noVistos.length) lista.push({ tipo: "No lo vio el modelo", texto: `${num(noVistos.length)} campos del crudo anticipan el impago y la estructura no los lee («${c.nombre}»)`, enlace: `/laboratorio/profundo?corte=${c.id}&pestana=crudo`, sintetico: c.es_sintetico });
    const imp = rs.find((r) => r.tipo === "importancia")?.resultado;
    const fuertesSinModelo = (imp?.variables ?? []).slice(0, 10).filter((v) => v.en_modelo === false);
    if (fuertesSinModelo.length) lista.push({ tipo: "No lo vio el modelo", texto: `${fuertesSinModelo.map((v) => v.nombre).join(", ")}: entre las 10 de más peso del bosque y el modelo no la recibe («${c.nombre}»)`, enlace: `/laboratorio/profundo?corte=${c.id}&pestana=importancia`, sintetico: c.es_sintetico });
    const des = rs.find((r) => r.tipo === "desempeno");
    if (des && Number(des.resultado.auc) < 0.65) lista.push({ tipo: "Desempeño", texto: `AUC ${dec(des.resultado.auc, 3)} en «${c.nombre}»: el motor casi no ordena`, enlace: `/laboratorio/desempeno?corte=${c.id}`, sintetico: c.es_sintetico });
    for (const e of rs.filter((r) => r.tipo === "estabilidad")) {
      if (Number(e.resultado.psi) > 0.25) lista.push({ tipo: "Estabilidad", texto: `PSI del puntaje ${dec(e.resultado.psi, 3)} en «${c.nombre}»: la población cambió`, enlace: `/laboratorio/desempeno?corte=${c.id}&pestana=estabilidad`, sintetico: c.es_sintetico });
    }
  }
  return lista;
}

function actividad(d) {
  const nombreCorte = new Map(d.cortes.map((c) => [c.id, c.nombre]));
  const eventos = [
    ...d.cargas.map((c) => ({ cuando: c.created_at, texto: `Carga «${c.etiqueta}»`, enlace: `/laboratorio/cargas/${c.id}` })),
    ...d.cortes.map((c) => ({ cuando: c.congelado_en, texto: `Corte congelado: «${c.nombre}»`, enlace: `/laboratorio/cortes/${c.id}` })),
    ...Object.entries(d.resultados).flatMap(([id, rs]) => rs.map((r) => ({ cuando: r.created_at, texto: `${TIPO_RESULTADO[r.tipo] ?? r.tipo} calculado en «${nombreCorte.get(id)}»`, enlace: `/laboratorio/cortes/${id}` }))),
    ...d.propuestas.map((p) => ({ cuando: p.revisada_en ?? p.created_at, texto: `Propuesta «${p.titulo}» (${p.estado})`, enlace: "/laboratorio/propuestas" })),
    ...d.candidatas.map((c) => ({ cuando: c.actualizada_en ?? c.created_at, texto: `Candidata «${c.nombre}» (${c.estado.replace("_", " ")})`, enlace: "/laboratorio/profundo?pestana=candidatas" })),
  ];
  return eventos.filter((e) => e.cuando).sort((a, b) => new Date(b.cuando) - new Date(a.cuando)).slice(0, 12);
}

export default function Laboratorio() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    cargarInicio().then(setD).catch((e) => setError(e.message));
  }, []);
  if (error) return <MensajeError mensaje={error} />;
  if (!d) return <Cargando que="el inicio del Laboratorio" />;

  const reales = d.cargas.filter((c) => !c.es_sintetica && c.estado === "lista");
  const operacionesReales = reales.reduce((s, c) => s + Number(c.conciliacion?.operaciones ?? 0), 0);
  const conciliadas = reales.reduce((s, c) => s + Number(c.conciliacion?.exacto ?? 0) + Number(c.conciliacion?.perfil_inferido ?? 0), 0);
  const pendientes = d.propuestas.filter((p) => ["borrador", "revisada", "presentada"].includes(p.estado)).length;
  const criticos = hallazgosCriticos(d);
  const meses = [...new Set(d.volumen.map((v) => v.mes))].sort();
  const recs = ["aprobar", "revisar", "negar", "sin recomendación"];
  const fallidas = d.cargas.filter((c) => ["cargando", "con_errores"].includes(c.estado));
  const fugas = d.cargas.filter((c) => c.estado === "lista" && Number(c.conciliacion?.consulta_posterior ?? 0) > 0);
  const analisisFallidos = d.volumen.reduce((s, v) => s + Number(v.fallidos ?? 0), 0);
  const ultimoDesempeno = (corteId) => (d.resultados[corteId] ?? []).find((r) => r.tipo === "desempeno") ?? null;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 4 }}>Laboratorio · Riesgo de Crédito</h2>
        <p className="crediscope-muted" style={{ margin: 0, maxWidth: "70ch" }}>
          Medir si el motor acertó contra lo que realmente pasó con los créditos, buscar qué datos anticipaban el impago y convertirlo en una
          propuesta de ajuste con evidencia. Nada de esto cambia el motor por su cuenta.
        </p>
      </div>

      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Créditos reales conciliados" valor={num(conciliadas)} detalle={operacionesReales ? `${pct(conciliadas / operacionesReales)} de ${num(operacionesReales)} con análisis anterior` : "Todavía no hay datos de una institución"} />
        <Kpi etiqueta="Cortes" valor={num(d.cortes.length)} detalle={`${num(d.cortes.filter((c) => c.ventana_meses === 12).length)} a 12 meses · ${num(d.cortes.filter((c) => c.ventana_meses === 24).length)} a 24 · ${num(d.cortes.filter((c) => c.es_sintetico).length)} sintéticos`} />
        <Kpi etiqueta="Análisis del motor" valor={num(d.volumen.reduce((s, v) => s + Number(v.n), 0))} detalle={`${num(analisisFallidos)} fallidos`} />
        <Kpi etiqueta="Propuestas pendientes" valor={num(pendientes)} detalle={`${num(d.candidatas.filter((c) => !["aceptada", "rechazada"].includes(c.estado)).length)} variables candidatas abiertas`} />
        <Kpi etiqueta="Instituciones activas" valor={num(d.instituciones.filter((i) => i.estado === "activa").length)} detalle={`${num(d.instituciones.flatMap((i) => i.lab_proyectos ?? []).filter((p) => p.estado === "en_curso").length)} proyectos en curso`} />
      </div>

      <div className="crediscope-card" style={{ borderColor: criticos.length ? "var(--bad)" : undefined }}>
        <h3 style={{ marginTop: 0 }}>Hallazgos críticos ({num(criticos.length)})</h3>
        {criticos.length ? (
          <ul style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>
            {criticos.map((h, i) => (
              <li key={i}>
                <Etiqueta texto={h.tipo} color="var(--bad)" /> <Link to={h.enlace}>{h.texto}</Link>
                {h.sintetico ? <span className="crediscope-muted"> · corte sintético</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="crediscope-muted" style={{ margin: 0 }}>Ninguno.</p>}
        <p className="crediscope-muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Definición propuesta, a confirmar por el negocio: una fuente que dejó de contestar, un dato que anticipa el impago y el modelo no tiene, un corte
          con AUC menor a 0,65 y una población que cambió (PSI mayor a 0,25).
        </p>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Default por mes {d.cortes[0] ? <span className="crediscope-muted" style={{ fontSize: 13, fontWeight: 400 }}>· «{d.cortes[0].nombre}»</span> : null}</h3>
          {d.evolucion?.segmentos.length ? (
            <GraficoBarras
              categorias={d.evolucion.segmentos.map((s) => s.nombre)}
              series={[{ nombre: "Tasa de malos", color: "var(--bad)", valores: d.evolucion.segmentos.map((s) => s.tasa), formato: (v) => pct(v) }]}
              y={{ formato: (v) => pct(v, 0) }}
              alto={200}
              etiqueta="Default por mes de desembolso"
            />
          ) : <p className="crediscope-muted">Sin cortes.</p>}
          <Link to="/laboratorio/datos?pestana=cartera" style={{ fontSize: 13 }}>Explorador de cartera</Link>
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Análisis del motor por mes</h3>
          {meses.length ? (
            <GraficoBarras
              categorias={meses}
              series={recs.map((r, i) => ({ nombre: ETIQUETA_RECOMENDACION[r] ?? r, color: ["var(--good)", "var(--warn)", "var(--bad)", "var(--text-muted)"][i], valores: meses.map((m) => Number(d.volumen.find((v) => v.mes === m && v.recomendacion === r)?.n ?? 0)), formato: (v) => num(v) }))}
              apiladas
              y={{ formato: (v) => num(v) }}
              alto={200}
              etiqueta="Volumen y mezcla de recomendaciones"
            />
          ) : <p className="crediscope-muted">Sin análisis.</p>}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginTop: 12 }}>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>El motor por institución</h3>
          {d.instituciones.length ? (
            <table className="crediscope-table">
              <tbody>
                {d.instituciones.map((i) => {
                  const cargas = d.cargas.filter((c) => c.institucion_id === i.id).map((c) => c.id);
                  const corte = d.cortes.find((c) => c.carga_ids.some((id) => cargas.includes(id)) && ultimoDesempeno(c.id));
                  const des = corte ? ultimoDesempeno(corte.id) : null;
                  return (
                    <tr key={i.id}>
                      <td>{i.nombre}</td>
                      <td>{des ? `AUC ${dec(des.resultado.auc, 3)} · ${pct(des.n_malos / des.n)} de malos` : <span className="crediscope-muted">sin corte con desempeño</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="crediscope-muted" style={{ margin: 0 }}>Sin instituciones registradas. <Link to="/laboratorio/instituciones">Registrar una</Link>.</p>}
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}><AlertTriangle size={16} style={{ verticalAlign: "-2px", color: "var(--warn)" }} /> Trabajos a medias y alertas</h3>
          <ul style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Cargas incompletas o con errores: <strong>{num(fallidas.length)}</strong>{fallidas.length ? ` (${fallidas.map((c) => c.etiqueta).join(", ")})` : ""}</li>
            <li>Reconsultas del ciclo sin procesar: <strong>{num(d.sinProcesar)}</strong>{d.sinProcesar ? " · scripts/procesar-reconsultas.mjs" : ""}</li>
            <li>Análisis del motor fallidos: <strong>{num(analisisFallidos)}</strong></li>
            <li>Cargas con consultas posteriores al desembolso (fuga): <strong>{num(fugas.length)}</strong></li>
            <li>Fuentes que dejaron de contestar: <strong>{num(criticos.filter((h) => h.tipo === "Fuente").length)}</strong> · <Link to="/laboratorio/datos?pestana=centro">centro de datos</Link></li>
          </ul>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginTop: 12 }}>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Actividad reciente</h3>
          <ul style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
            {actividad(d).map((e, i) => (
              <li key={i}><span className="crediscope-muted">{formatearFechaHora(e.cuando)}</span> · <Link to={e.enlace}>{e.texto}</Link></li>
            ))}
          </ul>
          <p className="crediscope-muted" style={{ fontSize: 12, marginBottom: 0 }}>Los informes exportados todavía no se registran.</p>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignContent: "start" }}>
          {MODULOS.map(([ruta, Icono, titulo, texto]) => (
            <Link key={ruta} to={ruta} className="crediscope-card" style={{ textDecoration: "none", color: "inherit", margin: 0, padding: 12 }}>
              <Icono size={18} style={{ color: "var(--brand)" }} />
              <div style={{ fontWeight: 700, fontSize: 14, margin: "4px 0 2px" }}>{titulo}</div>
              <div className="crediscope-muted" style={{ fontSize: 12 }}>{texto}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
