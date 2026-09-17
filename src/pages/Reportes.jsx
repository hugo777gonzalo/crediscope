import { useEffect, useState } from "react";
import { getMetricasGerenciales, agregarPorCampo } from "../lib/api.js";
import { camposDeEje } from "../lib/reporteGerencial.js";
import { ORDEN_GRUPOS, ETIQUETAS_GRUPO, formatValor } from "../lib/perfilClienteCampos.js";

// Inteligencia de Negocios -- a pedido del usuario, un tablero EN
// VIVO (no un PDF exportable) para mostrar a un Jefe/Coordinador/
// Sub-gerente: panorama agregado de TODA la cartera consultada, no un
// cliente a la vez (eso ya lo cubren Perfil del Cliente/Historial). Ver
// reporteGerencial.js para la agregación y la nota de escala.

const MONEDA = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const RECOMENDACIONES_ORDEN = [
  ["aprobar", "Aprobar", "var(--good)"],
  ["revisar", "Revisar", "var(--warn)"],
  ["observar", "Observar", "var(--brand)"],
  ["negar", "Negar", "var(--bad)"],
];

function formatDuracion(ms) {
  if (ms === null || ms === undefined) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function FilaTiempo({ etiqueta, stats }) {
  return (
    <div className="crediscope-tiempo-row">
      <span className="crediscope-tiempo-etiqueta">{etiqueta}</span>
      {stats.n === 0 ? (
        <span className="crediscope-muted">Sin datos todavía</span>
      ) : (
        <span className="crediscope-tiempo-valores">
          <span>
            prom. <strong>{formatDuracion(stats.promedioMs)}</strong>
          </span>
          <span className="crediscope-muted">mín. {formatDuracion(stats.minMs)}</span>
          <span className="crediscope-muted">máx. {formatDuracion(stats.maxMs)}</span>
          <span className="crediscope-muted">({stats.n} consultas)</span>
        </span>
      )}
    </div>
  );
}

function TarjetaKpi({ etiqueta, valor, detalle }) {
  return (
    <div className="crediscope-card crediscope-kpi">
      <p className="crediscope-kpi-label">{etiqueta}</p>
      <p className="crediscope-kpi-valor">{valor}</p>
      {detalle ? <p className="crediscope-kpi-detalle">{detalle}</p> : null}
    </div>
  );
}

function BarraPorcentaje({ etiqueta, valor, pct, color }) {
  return (
    <div className="crediscope-barrapct-row">
      <span className="crediscope-barrapct-label">{etiqueta}</span>
      <div className="crediscope-barrapct-track">
        <div className="crediscope-barrapct-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="crediscope-barrapct-valor">
        {pct}% <span className="crediscope-muted">({valor})</span>
      </span>
    </div>
  );
}

function DistribucionScore({ distribucion, total }) {
  const segmentos = [
    { clave: "bueno", etiqueta: "Bueno (700-999)", color: "var(--good)" },
    { clave: "medio", etiqueta: "Medio (400-699)", color: "var(--warn)" },
    { clave: "malo", etiqueta: "Bajo (1-399)", color: "var(--bad)" },
  ];
  return (
    <div>
      <div className="crediscope-stackedbar">
        {segmentos.map((s) => {
          const n = distribucion[s.clave];
          const pct = total ? (n / total) * 100 : 0;
          return pct > 0 ? <div key={s.clave} style={{ width: `${pct}%`, background: s.color }} title={`${s.etiqueta}: ${n}`} /> : null;
        })}
      </div>
      <div className="crediscope-stackedbar-legend">
        {segmentos.map((s) => (
          <span key={s.clave} className="crediscope-legend-item">
            <span className="crediscope-legend-dot" style={{ background: s.color }} />
            {s.etiqueta} — {total ? Math.round((distribucion[s.clave] / total) * 100) : 0}% ({distribucion[s.clave]})
          </span>
        ))}
      </div>
    </div>
  );
}

function GraficoTendencia({ datos }) {
  const max = Math.max(1, ...datos.map((d) => d.total));
  const ancho = 560;
  const alto = 160;
  const paddingIzq = 28;
  const paddingAbajo = 22;
  const anchoBarra = (ancho - paddingIzq) / datos.length - 12;
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" style={{ maxWidth: ancho, display: "block" }}>
      <line x1={paddingIzq} y1={alto - paddingAbajo} x2={ancho} y2={alto - paddingAbajo} stroke="var(--border)" strokeWidth="1" />
      {[0.5, 1].map((f) => (
        <line key={f} x1={paddingIzq} y1={(alto - paddingAbajo) * (1 - f)} x2={ancho} y2={(alto - paddingAbajo) * (1 - f)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3" />
      ))}
      <text x="2" y={alto - paddingAbajo + 4} fontSize="10" fill="var(--text-muted)">
        0
      </text>
      <text x="2" y={(alto - paddingAbajo) * 0.5 + 4} fontSize="10" fill="var(--text-muted)">
        {Math.round(max / 2)}
      </text>
      {datos.map((d, i) => {
        const h = ((alto - paddingAbajo) * d.total) / max;
        const x = paddingIzq + i * ((ancho - paddingIzq) / datos.length) + 6;
        return (
          <g key={d.clave}>
            <rect x={x} y={alto - paddingAbajo - h} width={anchoBarra} height={h} rx="3" fill="var(--brand)" />
            <text x={x + anchoBarra / 2} y={alto - paddingAbajo - h - 5} fontSize="11" fill="var(--text)" textAnchor="middle" fontWeight="600">
              {d.total}
            </text>
            <text x={x + anchoBarra / 2} y={alto - 6} fontSize="10" fill="var(--text-muted)" textAnchor="middle">
              {d.etiqueta}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// El agregado de cada campo lo hace la base, uno por uno. Era la razón
// real por la que el tablero bajaba el perfil completo de las 2.565
// personas: para mirar un campo había que tener los 124.
//
// Se piden en paralelo al cambiar de grupo -- son diez o doce campos y
// cada uno es una cuenta sobre el último perfil de cada cliente.
function ExploradorPorEje() {
  const [grupo, setGrupo] = useState(ORDEN_GRUPOS[0]);
  const [resultados, setResultados] = useState({});
  const [cargando, setCargando] = useState(true);
  const campos = camposDeEje(grupo);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setResultados({});
    Promise.all(
      campos.map(([campoPath, , tipo]) =>
        agregarPorCampo(`${grupo}.${campoPath}`, tipo)
          .then((r) => [`${grupo}.${campoPath}`, r])
          // Un campo que falla no puede dejar el grupo entero en blanco.
          .catch(() => [`${grupo}.${campoPath}`, { tipo: "vacio", conDato: 0 }]),
      ),
    )
      .then((pares) => vigente && setResultados(Object.fromEntries(pares)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
    // `campos` se deriva de `grupo`: depender de los dos volvería a
    // pedir todo en cada render, porque camposDeEje devuelve un arreglo
    // nuevo cada vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo]);

  return (
    <div className="crediscope-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>Explorador por eje</h3>
        <select className="crediscope-input" style={{ maxWidth: 280 }} value={grupo} onChange={(e) => setGrupo(e.target.value)}>
          {ORDEN_GRUPOS.map((g) => (
            <option key={g} value={g}>
              {ETIQUETAS_GRUPO[g]}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {campos.map(([campoPath, etiqueta, tipo]) => {
          const ruta = `${grupo}.${campoPath}`;
          const resultado = resultados[ruta] ?? { tipo: cargando ? "cargando" : "vacio", conDato: 0 };
          return (
            <div key={ruta} className="crediscope-eje-row">
              <span className="crediscope-eje-etiqueta">{etiqueta}</span>
              <span className="crediscope-eje-valor">
                {resultado.tipo === "cargando" && <span className="crediscope-muted">...</span>}
                {resultado.tipo === "cargando" && <span className="crediscope-muted">…</span>}
                {resultado.tipo === "vacio" && <span className="crediscope-muted">Sin datos</span>}
                {resultado.tipo === "porcentaje" && (
                  <>
                    <strong>{resultado.pct}%</strong> <span className="crediscope-muted">de {resultado.conDato} con dato</span>
                  </>
                )}
                {resultado.tipo === "promedio" && (
                  <strong>{formatValor(tipo === "meses" ? Math.round(resultado.promedio) : Math.round(resultado.promedio * 100) / 100, tipo)}</strong>
                )}
                {resultado.tipo === "distribucion" && (
                  <span className="crediscope-muted">
                    {resultado.top.map(([v, n]) => `${formatValor(v, tipo === "lista" ? "texto" : tipo)} (${n})`).join(" · ")}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Reportes() {
  const [metricas, setMetricas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Los números llegan calculados. Antes acá se bajaban TODOS los
  // perfiles y análisis con el standard_profile completo adentro --unos
  // 30 MB-- para agregarlos en el navegador.
  useEffect(() => {
    getMetricasGerenciales()
      .then(setMetricas)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="crediscope-muted">Cargando reporte...</p>;
  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)" }}>{error}</p>
      </div>
    );
  if (!metricas.totalClientes)
    return (
      <div className="crediscope-card">
        <h2>Inteligencia de Negocios</h2>
        <p className="crediscope-muted">Todavía no hay clientes consultados para armar el reporte.</p>
      </div>
    );

  const tendenciaConsultas = metricas.consultasPorMes;
  const mesActual = tendenciaConsultas.at(-1)?.total ?? 0;
  const mesAnterior = tendenciaConsultas.at(-2)?.total ?? 0;
  const variacion = mesAnterior ? Math.round(((mesActual - mesAnterior) / mesAnterior) * 100) : null;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Inteligencia de Negocios</h2>
        <p className="crediscope-muted">Panorama agregado de la cartera de clientes consultados — para revisión con jefatura/coordinación.</p>
      </div>

      <div className="crediscope-kpi-grid">
        <TarjetaKpi etiqueta="Clientes en cartera" valor={metricas.totalClientes} detalle={`${metricas.totalAnalizados} con Análisis con IA generado`} />
        <TarjetaKpi etiqueta="Score promedio" valor={metricas.scorePromedio ?? "—"} detalle="Sobre 999, último análisis por cliente" />
        <TarjetaKpi
          etiqueta="Consultas este mes"
          valor={mesActual}
          detalle={variacion === null ? "Sin mes anterior para comparar" : `${variacion >= 0 ? "+" : ""}${variacion}% vs. mes anterior`}
        />
        <TarjetaKpi etiqueta="Con respaldo patrimonial" valor={`${metricas.patrimonio.pct}%`} detalle={`Colateral estimado: ${MONEDA.format(metricas.patrimonio.valorColateralTotal)}`} />
      </div>

      <div className="crediscope-reportes-grid">
        <div className="crediscope-card">
          <h3>Distribución de score</h3>
          <DistribucionScore distribucion={metricas.distribucionScore} total={metricas.totalAnalizados} />
        </div>

        <div className="crediscope-card">
          <h3>Consultas por mes (últimos 6 meses)</h3>
          <GraficoTendencia datos={tendenciaConsultas} />
        </div>

        <div className="crediscope-card">
          <h3>Acción recomendada</h3>
          {metricas.totalAnalizados === metricas.distribucionRecomendacion.sinDato ? (
            <p className="crediscope-muted">Todavía no hay análisis con recomendación de acción (se registra desde marco-v14).</p>
          ) : (
            <>
              {RECOMENDACIONES_ORDEN.map(([clave, etiqueta, color]) => (
                <BarraPorcentaje
                  key={clave}
                  etiqueta={etiqueta}
                  valor={metricas.distribucionRecomendacion[clave]}
                  pct={
                    metricas.totalAnalizados
                      ? Math.round((metricas.distribucionRecomendacion[clave] / metricas.totalAnalizados) * 100)
                      : 0
                  }
                  color={color}
                />
              ))}
              {metricas.distribucionRecomendacion.sinDato > 0 ? (
                <p className="crediscope-muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                  {metricas.distribucionRecomendacion.sinDato} análisis previos a marco-v14 no tienen recomendación registrada.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="crediscope-card">
          <h3>Riesgo y cumplimiento</h3>
          {metricas.riesgo.map((r) => (
            <BarraPorcentaje key={r.etiqueta} etiqueta={r.etiqueta} valor={r.valor} pct={r.pct} color="var(--bad)" />
          ))}
        </div>

        <div className="crediscope-card">
          <h3>Perfil laboral</h3>
          {metricas.laboral.map((r) => (
            <BarraPorcentaje key={r.etiqueta} etiqueta={r.etiqueta} valor={r.valor} pct={r.pct} color="var(--brand)" />
          ))}
        </div>

        <div className="crediscope-card">
          <h3>Actividad por analista</h3>
          {metricas.actividadPorAnalista.length === 0 ? (
            <p className="crediscope-muted">Sin datos de actividad todavía.</p>
          ) : (
            metricas.actividadPorAnalista.map(([nombre, n]) => (
              <BarraPorcentaje
                key={nombre}
                etiqueta={nombre}
                valor={n}
                pct={Math.round((n / metricas.actividadPorAnalista[0][1]) * 100)}
                color="var(--gold)"
              />
            ))
          )}
        </div>

        <div className="crediscope-card">
          <h3>Tiempos de respuesta</h3>
          <FilaTiempo etiqueta="Ingesta a la fuente (consulta nueva)" stats={metricas.tiempos.ingesta} />
          <FilaTiempo etiqueta="Análisis con IA (LLM)" stats={metricas.tiempos.llm} />
        </div>
      </div>

      <ExploradorPorEje />
    </div>
  );
}
