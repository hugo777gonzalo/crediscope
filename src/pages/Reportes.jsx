import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMetricasGerenciales, agregarPorCampo } from "../lib/api.js";
import { camposDeEje } from "../lib/reporteGerencial.js";
import { ORDEN_GRUPOS, ETIQUETAS_GRUPO, formatValor } from "../lib/perfilClienteCampos.js";
import { entero, moneda, porcentajeDe, segundos, plural } from "../lib/formatos.js";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import Kpi from "../components/ui/Kpi.jsx";
import Barra from "../components/ui/Barra.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";

// Inteligencia de Negocios -- a pedido del usuario, un tablero EN
// VIVO (no un PDF exportable) para mostrar a un Jefe/Coordinador/
// Sub-gerente: panorama agregado de TODA la cartera consultada, no un
// cliente a la vez (eso ya lo cubren Perfil del Cliente/Historial). Ver
// reporteGerencial.js para la agregación y la nota de escala.

// El cuarto valor marca una recomendación que ya no se produce
// ("observar", retirada en marco-v27): su barra aparece sólo mientras
// quede algún análisis guardado con ella, para que no sume un renglón
// en cero para siempre ni desaparezca un caso que existe.
const RECOMENDACIONES_ORDEN = [
  ["aprobar", "Aprobar", "var(--good)"],
  ["revisar", "Revisar", "var(--warn)"],
  ["observar", "Observar", "var(--brand)", true],
  ["negar", "Negar", "var(--bad)"],
];

function FilaTiempo({ etiqueta, stats }) {
  return (
    <div className="crediscope-tiempo-row">
      <span className="crediscope-tiempo-etiqueta">{etiqueta}</span>
      {stats.n === 0 ? (
        <span className="crediscope-muted">Sin datos todavía</span>
      ) : (
        <span className="crediscope-tiempo-valores">
          <span>
            promedio <strong>{segundos(stats.promedioMs)}</strong>
          </span>
          <span className="crediscope-muted">mínimo {segundos(stats.minMs)}</span>
          <span className="crediscope-muted">máximo {segundos(stats.maxMs)}</span>
          <span className="crediscope-muted">({plural(stats.n, "consulta")})</span>
        </span>
      )}
    </div>
  );
}

function DistribucionPuntaje({ distribucion, total }) {
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
          return pct > 0 ? <div key={s.clave} style={{ width: `${pct}%`, background: s.color }} title={`${s.etiqueta}: ${entero(n)}`} /> : null;
        })}
      </div>
      <div className="crediscope-stackedbar-legend">
        {segmentos.map((s) => (
          <span key={s.clave} className="crediscope-legend-item">
            <span className="crediscope-legend-dot" style={{ background: s.color }} />
            {s.etiqueta} — {porcentajeDe(distribucion[s.clave], total)} ({entero(distribucion[s.clave])})
          </span>
        ))}
      </div>
    </div>
  );
}

// El dibujo mide 420 de ancho y no 560: dentro de una tarjeta de ~330 px se
// reducía a 0,6 y las etiquetas de 10 unidades quedaban en 6 píxeles.
function GraficoTendencia({ datos }) {
  const max = Math.max(1, ...datos.map((d) => d.total));
  const ancho = 420;
  const alto = 170;
  const paddingIzq = 34;
  const paddingAbajo = 26;
  const anchoBarra = (ancho - paddingIzq) / datos.length - 12;
  const mayuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" style={{ maxWidth: ancho, display: "block" }} role="img" aria-label="Consultas por mes, últimos seis meses">
      <line x1={paddingIzq} y1={alto - paddingAbajo} x2={ancho} y2={alto - paddingAbajo} stroke="var(--border)" strokeWidth="1" />
      {[0.5, 1].map((f) => (
        <line key={f} x1={paddingIzq} y1={(alto - paddingAbajo) * (1 - f)} x2={ancho} y2={(alto - paddingAbajo) * (1 - f)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3" />
      ))}
      <text x="2" y={alto - paddingAbajo + 4} fontSize="12" fill="var(--text-muted)">
        0
      </text>
      <text x="2" y={(alto - paddingAbajo) * 0.5 + 4} fontSize="12" fill="var(--text-muted)">
        {entero(Math.round(max / 2))}
      </text>
      {datos.map((d, i) => {
        const h = ((alto - paddingAbajo) * d.total) / max;
        const x = paddingIzq + i * ((ancho - paddingIzq) / datos.length) + 6;
        return (
          <g key={d.clave}>
            <rect x={x} y={alto - paddingAbajo - h} width={anchoBarra} height={h} rx="3" fill="var(--brand)" />
            <text x={x + anchoBarra / 2} y={alto - paddingAbajo - h - 5} fontSize="13" fill="var(--text)" textAnchor="middle" fontWeight="600">
              {entero(d.total)}
            </text>
            <text x={x + anchoBarra / 2} y={alto - 8} fontSize="12" fill="var(--text-muted)" textAnchor="middle">
              {mayuscula(d.etiqueta)}
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
function ExploradorPorGrupo() {
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
        <h3 style={{ margin: 0 }}>Explorador por grupo del Perfil de la Persona</h3>
        <select className="crediscope-input" style={{ maxWidth: 280 }} value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo del Perfil de la Persona">
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
                {resultado.tipo === "vacio" && <span className="crediscope-muted">Sin datos</span>}
                {resultado.tipo === "porcentaje" && (
                  <>
                    <strong>{resultado.pct}%</strong> <span className="crediscope-muted">de {entero(resultado.conDato)} con dato</span>
                  </>
                )}
                {resultado.tipo === "promedio" && (
                  <strong>{formatValor(tipo === "meses" ? Math.round(resultado.promedio) : Math.round(resultado.promedio * 100) / 100, tipo)}</strong>
                )}
                {resultado.tipo === "distribucion" && (
                  <span className="crediscope-muted">
                    {resultado.top.map(([v, n]) => `${formatValor(v, tipo === "lista" ? "texto" : tipo)} (${entero(n)})`).join(" · ")}
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

  if (loading) return <Cargando texto="Cargando el monitoreo..." />;
  if (error) return <AvisoDeError error={error} />;
  if (!metricas.totalClientes)
    return (
      <div className="crediscope-card">
        <h2>Monitoreo</h2>
        {/* revisar-textos: permitir subtitulo-de-pagina -- estado vacío */}
        <p className="crediscope-muted">Todavía no hay personas consultadas para armar el monitoreo.</p>
      </div>
    );

  const tendenciaConsultas = metricas.consultasPorMes;
  const mesActual = tendenciaConsultas.at(-1)?.total ?? 0;
  const mesAnterior = tendenciaConsultas.at(-2)?.total ?? 0;
  const variacion = mesAnterior ? Math.round(((mesActual - mesAnterior) / mesAnterior) * 100) : null;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Monitoreo</h2>
      </div>

      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Personas en cartera" valor={metricas.totalClientes} detalle={`${entero(metricas.totalAnalizados)} ya tienen Análisis con IA`} />
        <Kpi etiqueta="Score promedio" valor={metricas.scorePromedio ?? "—"} detalle="Sobre 999, con el último análisis de cada persona" />
        {/* El mes en curso no terminó: compararlo con el anterior completo
            daba "-57%" el día 9 y se leía como una caída del negocio. */}
        <Kpi
          etiqueta="Consultas este mes"
          valor={mesActual}
          detalle={
            variacion === null
              ? "Sin mes anterior para comparar"
              : `En lo que va del mes: ${Math.abs(variacion)}% ${variacion >= 0 ? "más" : "menos"} que todo el mes anterior`
          }
        />
        <Kpi etiqueta="Con respaldo patrimonial" valor={`${metricas.patrimonio.pct}%`} detalle={`Colateral estimado: ${moneda(metricas.patrimonio.valorColateralTotal)}`} />
      </div>

      <div className="crediscope-reportes-grid">
        <div className="crediscope-card">
          <h3>Distribución del score</h3>
          <DistribucionPuntaje distribucion={metricas.distribucionScore} total={metricas.totalAnalizados} />
        </div>

        <div className="crediscope-card">
          <h3>Consultas por mes (últimos 6 meses)</h3>
          <GraficoTendencia datos={tendenciaConsultas} />
        </div>

        <div className="crediscope-card">
          <h3>Recomendación</h3>
          {metricas.totalAnalizados === metricas.distribucionRecomendacion.sinDato ? (
            <p className="crediscope-muted">Todavía no hay análisis con recomendación.</p>
          ) : (
            <>
              {RECOMENDACIONES_ORDEN.filter(
                ([clave, , , retirada]) => !retirada || metricas.distribucionRecomendacion[clave] > 0
              ).map(([clave, etiqueta, color]) => (
                <Barra
                  key={clave}
                  etiqueta={etiqueta}
                  n={metricas.distribucionRecomendacion[clave]}
                  pct={
                    metricas.totalAnalizados
                      ? Math.round((metricas.distribucionRecomendacion[clave] / metricas.totalAnalizados) * 100)
                      : 0
                  }
                  color={color}
                />
              ))}
              {metricas.distribucionRecomendacion.sinDato > 0 ? (
                <p className="crediscope-muted" style={{ fontSize: 13, marginTop: 10 }}>
                  {plural(metricas.distribucionRecomendacion.sinDato, "análisis antiguo no tiene", "análisis antiguos no tienen")} recomendación registrada.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="crediscope-card">
          <h3>Riesgo y cumplimiento</h3>
          {metricas.riesgo.map((r) => (
            <Barra key={r.etiqueta} etiqueta={r.etiqueta} n={r.valor} pct={r.pct} color="var(--bad)" />
          ))}
        </div>

        {/* El perfil laboral de acá usaba la clasificación de antes del módulo
            de Fuentes de Ingreso (independientes, dependientes, jubilados,
            pensionistas) y daba cifras distintas a las del Panorama bajo el
            mismo nombre. Se mira en un solo lugar. */}
        <div className="crediscope-card">
          <h3>
            Perfil laboral y de qué vive la cartera
            <InfoTooltip etiqueta="De dónde salen estas cifras">
              Las cifras salen de Fuentes de Ingreso, con la clasificación vigente, para que no cambien de una pantalla a otra.
            </InfoTooltip>
          </h3>
          <Link className="crediscope-btn crediscope-btn-ghost" to="/fuentes">
            Ver el Panorama de Fuentes de Ingreso
          </Link>
        </div>

        <div className="crediscope-card">
          <h3>Actividad por analista</h3>
          {metricas.actividadPorAnalista.length === 0 ? (
            <p className="crediscope-muted">Sin datos de actividad todavía.</p>
          ) : (
            metricas.actividadPorAnalista.map(([nombre, n]) => (
              <Barra
                key={nombre}
                etiqueta={nombre}
                texto={entero(n)}
                pct={Math.round((n / metricas.actividadPorAnalista[0][1]) * 100)}
                color="var(--gold)"
              />
            ))
          )}
        </div>

        <div className="crediscope-card">
          <h3>Tiempos de respuesta</h3>
          <FilaTiempo etiqueta="Consulta a la fuente de datos (consulta nueva)" stats={metricas.tiempos.ingesta} />
          <FilaTiempo etiqueta="Análisis con IA" stats={metricas.tiempos.llm} />
        </div>
      </div>

      <ExploradorPorGrupo />
    </div>
  );
}
