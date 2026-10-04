import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCentroDeDatos, getCalidadDeLaCarga, getOperacionesDeCarga, getResultados, getCoberturaDeLaEstructura } from "../../lib/laboratorio.js";
import { getCatalogoUnaVez } from "../../lib/datosDelCorte.js";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { segmentar, DIMENSIONES } from "../../lib/analisisRetrospectivo.js";
import { formatearFechaHora, formatearDia } from "../../lib/fechas.js";
import { ETIQUETA_VINCULO, ETIQUETA_RECOMENDACION, MensajeError, Cargando, Kpi, Etiqueta, num, pct } from "./Comunes.jsx";
import { GraficoBarras, GraficoLineas } from "./Graficos.jsx";

// Las pestañas de Datos y cartera (módulo 3 del negocio) que no son las
// listas de cargas y cortes.

const cayo = (f) => f.contesto_mes_anterior !== null && f.contesto_ultima_semana !== null && f.consultas_ultima_semana >= 20 && f.contesto_mes_anterior - f.contesto_ultima_semana > 0.1;

// ----------------------------------------------------------- centro de datos
// Qué contesta cada una de las 52 fuentes de Novadata, por semana. Alerta:
// en la última semana contesta 10 puntos menos que en el mes anterior (con
// 20 consultas o más). El 2026-10-03 un cambio de formato de Novadata ("ABI")
// no se vio hasta comparar dos consultas: esto lo hace visible antes.
export function CentroDeDatos() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [abierta, setAbierta] = useState(null);
  useEffect(() => {
    getCentroDeDatos(120).then(setDatos).catch((e) => setError(e.message));
  }, []);
  if (error) return <MensajeError mensaje={error} />;
  if (!datos) return <Cargando que="el centro de datos" />;
  const fuentes = [...datos.fuentes].sort((a, b) => Number(cayo(b)) - Number(cayo(a)) || a.fuente.localeCompare(b.fuente));
  const caidas = fuentes.filter(cayo);
  return (
    <div>
      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Consultas en 120 días" valor={num(datos.perfiles)} detalle={`${num(datos.fuentes.length)} fuentes`} />
        <Kpi etiqueta="Corte del IESS vigente" valor={datos.corte_iess ?? "—"} detalle="El mes más reciente con 20 clientes o más en 90 días" />
        <Kpi etiqueta="Fuentes que cayeron" valor={num(caidas.length)} detalle={caidas.map((f) => f.fuente).join(", ") || "Ninguna en la última semana"} color={caidas.length ? "var(--bad)" : undefined} />
      </div>
      <div className="crediscope-card" style={{ overflowX: "auto" }}>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Fuente</th>
              <th style={{ textAlign: "right" }}>Contestó (última semana)</th>
              <th style={{ textAlign: "right" }}>Contestó (mes anterior)</th>
              <th style={{ textAlign: "right" }}>Con datos</th>
              <th style={{ textAlign: "right" }}>Errores</th>
              <th>Última consulta</th>
            </tr>
          </thead>
          <tbody>
            {fuentes.map((f) => (
              <FilaFuente key={f.fuente} f={f} abierta={abierta === f.fuente} alternar={() => setAbierta(abierta === f.fuente ? null : f.fuente)} />
            ))}
          </tbody>
        </table>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          "Contestó" es ok u ok vacío (la fuente respondió, tenga o no datos de la persona); "con datos", que además trajo algo. Una fila abre su evolución semanal.
        </p>
      </div>
    </div>
  );
}

function FilaFuente({ f, abierta, alternar }) {
  const alerta = cayo(f);
  return (
    <>
      <tr onClick={alternar} style={{ cursor: "pointer", background: alerta ? "var(--panel-muted)" : undefined }}>
        <td><strong>{f.fuente}</strong> {alerta ? <Etiqueta texto="cayó" color="var(--bad)" /> : null}</td>
        <td style={{ textAlign: "right", fontWeight: 700, color: alerta ? "var(--bad)" : undefined }}>{pct(f.contesto_ultima_semana, 0)} <span className="crediscope-muted" style={{ fontWeight: 400 }}>({num(f.consultas_ultima_semana)})</span></td>
        <td style={{ textAlign: "right" }}>{pct(f.contesto_mes_anterior, 0)}</td>
        <td style={{ textAlign: "right" }}>{pct(f.consultas ? f.con_datos / f.consultas : null, 0)}</td>
        <td style={{ textAlign: "right" }}>{num(f.errores)}</td>
        <td>{formatearFechaHora(f.ultima)}</td>
      </tr>
      {abierta ? (
        <tr>
          <td colSpan={6} style={{ background: "var(--panel-muted)" }}>
            <GraficoLineas
              series={[
                { nombre: "Contestó", puntos: (f.semanas ?? []).map((s, i) => ({ x: i, y: s.n ? s.contestaron / s.n : 0, titulo: `semana del ${formatearDia(s.semana)}: ${num(s.contestaron)} de ${num(s.n)}` })) },
                { nombre: "Con datos", color: "var(--good)", puntos: (f.semanas ?? []).map((s, i) => ({ x: i, y: s.n ? s.con_datos / s.n : 0, titulo: `semana del ${formatearDia(s.semana)}: ${num(s.con_datos)} con datos` })) },
              ]}
              x={{ titulo: "Semana", formato: (v) => formatearDia(f.semanas?.[Math.round(v)]?.semana) }}
              y={{ min: 0, max: 1, formato: (v) => pct(v, 0) }}
              alto={200}
              etiqueta={`Evolución de ${f.fuente}`}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

// --------------------------------------------------------- calidad de carga
const PROBLEMAS = [
  ["repetidas_en_otras_cargas", "Operaciones repetidas en otra carga (misma persona, fecha y monto)", "var(--bad)"],
  ["impago_antes_del_desembolso", "Impago con fecha anterior al desembolso", "var(--bad)"],
  ["cayo_sin_fecha", "Cayó y no tiene fecha del primer impago (sin cosechas)", "var(--warn)"],
  ["mora_24_menor_que_12", "Mora a 24 meses menor que a 12", "var(--bad)"],
  ["sin_mora_registrada", "Sin días de mora en ninguna ventana (todavía no maduró)", "var(--text-muted)"],
  ["analisis_fallidos", "Con un análisis fallido en la ventana", "var(--warn)"],
  ["sin_cuota", "Sin cuota mensual (no se mide si cabía)", "var(--text-muted)"],
  ["sin_canal", "Sin canal", "var(--text-muted)"],
];

function SelectorDeCarga({ cargas, valor, alCambiar }) {
  return (
    <select className="crediscope-input" style={{ width: "auto" }} value={valor ?? ""} onChange={(e) => alCambiar(e.target.value)}>
      {cargas.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}{c.es_sintetica ? " (sintética)" : ""}</option>)}
    </select>
  );
}

export function CalidadDeCarga({ cargas }) {
  const vivas = cargas.filter((c) => c.estado !== "anulada");
  const [cargaId, setCargaId] = useState(vivas[0]?.id ?? null);
  const [calidad, setCalidad] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!cargaId) return undefined;
    let vigente = true;
    setCalidad(null);
    getCalidadDeLaCarga(cargaId).then((d) => vigente && setCalidad(d)).catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [cargaId]);
  if (!vivas.length) return <p className="crediscope-muted">No hay cargas.</p>;
  return (
    <div>
      <div className="crediscope-card"><SelectorDeCarga cargas={vivas} valor={cargaId} alCambiar={setCargaId} /></div>
      <MensajeError mensaje={error} />
      {!calidad ? <Cargando que="la calidad de la carga" /> : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi etiqueta="Operaciones" valor={num(calidad.operaciones)} detalle={`${num(calidad.personas)} personas · ${num(calidad.personas_con_varias)} con más de una`} />
            <Kpi etiqueta="Desembolsos" valor={`${formatearDia(calidad.desembolsos?.desde)} a ${formatearDia(calidad.desembolsos?.hasta)}`} detalle={Object.entries(calidad.por_producto).map(([p, n]) => `${p}: ${num(n)}`).join(" · ")} />
            <Kpi etiqueta="En otras cargas" valor={num(calidad.personas_en_otras_cargas)} detalle="personas que ya estaban en otra carga viva" />
          </div>
          <div className="crediscope-card">
            <h3 style={{ marginTop: 0 }}>Lo que hay que mirar</h3>
            <table className="crediscope-table">
              <tbody>
                {PROBLEMAS.map(([clave, texto, color]) => (
                  <tr key={clave}>
                    <td>{texto}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: calidad[clave] ? color : "var(--good)" }}>{num(calidad[clave])}</td>
                    <td style={{ textAlign: "right" }} className="crediscope-muted">{pct(calidad.operaciones ? calidad[clave] / calidad.operaciones : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h4 style={{ margin: "12px 0 4px" }}>Vínculo con lo que analizamos</h4>
            <p style={{ margin: 0, fontSize: 13.5 }}>{Object.entries(calidad.por_vinculo).map(([v, n]) => `${ETIQUETA_VINCULO[v] ?? v}: ${num(n)}`).join(" · ")}</p>
            <h4 style={{ margin: "12px 0 4px" }}>Estado al corte</h4>
            <p style={{ margin: 0, fontSize: 13.5 }}>{Object.entries(calidad.por_estado).map(([e, n]) => `${e}: ${num(n)}`).join(" · ")}</p>
          </div>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------- explorador de conciliación
// Las operaciones de una carga según cómo se vincularon con lo analizado
// (lab_cerrar_carga): con análisis anterior al desembolso, sólo con perfil,
// consultadas después (fuga), fuera de la ventana o nunca consultadas; y las
// personas con más de una operación.
export function Conciliacion({ cargas }) {
  const vivas = cargas.filter((c) => c.estado !== "anulada");
  const [cargaId, setCargaId] = useState(vivas[0]?.id ?? null);
  const [ops, setOps] = useState(null);
  const [vinculo, setVinculo] = useState("todos");
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!cargaId) return undefined;
    let vigente = true;
    setOps(null);
    getOperacionesDeCarga(cargaId).then((d) => vigente && setOps(d)).catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [cargaId]);
  const resumen = useMemo(() => {
    if (!ops) return null;
    const porVinculo = new Map();
    for (const o of ops) porVinculo.set(o.vinculo ?? "sin vincular", (porVinculo.get(o.vinculo ?? "sin vincular") ?? 0) + 1);
    const porPersona = new Map();
    for (const o of ops) porPersona.set(o.cedula, [...(porPersona.get(o.cedula) ?? []), o]);
    return { porVinculo: [...porVinculo.entries()].sort((a, b) => b[1] - a[1]), varias: [...porPersona.values()].filter((l) => l.length > 1) };
  }, [ops]);
  if (!vivas.length) return <p className="crediscope-muted">No hay cargas.</p>;
  const visibles = ops ? ops.filter((o) => vinculo === "todos" || (o.vinculo ?? "sin vincular") === vinculo) : [];
  return (
    <div>
      <div className="crediscope-card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <SelectorDeCarga cargas={vivas} valor={cargaId} alCambiar={setCargaId} />
        {resumen ? (
          <select className="crediscope-input" style={{ width: "auto" }} value={vinculo} onChange={(e) => setVinculo(e.target.value)}>
            <option value="todos">Todas ({num(ops.length)})</option>
            {resumen.porVinculo.map(([v, n]) => <option key={v} value={v}>{ETIQUETA_VINCULO[v] ?? v} ({num(n)})</option>)}
          </select>
        ) : null}
        <Link className="crediscope-btn crediscope-btn-ghost" to={`/laboratorio/cargas/${cargaId}`}>Ver la carga</Link>
      </div>
      <MensajeError mensaje={error} />
      {!resumen ? <Cargando que="las operaciones" /> : (
        <>
          <div className="crediscope-card" style={{ overflowX: "auto" }}>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Operación</th><th>Cédula</th><th>Producto</th><th>Desembolso</th><th>Estado</th><th>Vínculo</th>
                  <th style={{ textAlign: "right" }}>Días entre consulta y desembolso</th>
                </tr>
              </thead>
              <tbody>
                {visibles.slice(0, 300).map((o) => (
                  <tr key={o.numero_operacion}>
                    <td>{o.numero_operacion}</td>
                    <td><Link to={`/perfil/${o.cedula}`}>{o.cedula}</Link></td>
                    <td>{o.producto}</td>
                    <td>{formatearDia(o.fecha_desembolso)}</td>
                    <td>{o.estado_operacion}</td>
                    <td>{ETIQUETA_VINCULO[o.vinculo] ?? o.vinculo ?? "sin vincular"}{o.analisis_fallido ? <Etiqueta texto="análisis fallido" color="var(--warn)" /> : null}</td>
                    <td style={{ textAlign: "right" }}>{o.dias_consulta_desembolso ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibles.length > 300 ? <p className="crediscope-muted" style={{ fontSize: 12.5 }}>Se muestran 300 de {num(visibles.length)}.</p> : null}
          </div>
          <div className="crediscope-card">
            <h3 style={{ marginTop: 0 }}>Personas con más de una operación ({num(resumen.varias.length)})</h3>
            {resumen.varias.length ? (
              <ul style={{ margin: 0, fontSize: 13.5 }}>
                {resumen.varias.slice(0, 50).map((l) => <li key={l[0].cedula}>{l[0].cedula}: {l.map((o) => `${o.numero_operacion} (${formatearDia(o.fecha_desembolso)})`).join(", ")}</li>)}
              </ul>
            ) : <p className="crediscope-muted" style={{ margin: 0 }}>Ninguna: una operación por persona.</p>}
          </div>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------- explorador de cartera
const DIMENSIONES_CARTERA = ["mes", "producto", "canal", "recomendacion", "segmento_ingreso", "estado_ingreso", "peor_calificacion", "decision"];

export function ExploradorDeCartera({ cortes }) {
  const [corteId, setCorteId] = useState(cortes[0]?.id ?? null);
  const corte = cortes.find((c) => c.id === corteId);
  const [poblacion, setPoblacion] = useState("operaciones");
  const [dimension, setDimension] = useState("mes");
  const pob = corte?.resumen?.solicitudes ? poblacion : "operaciones";
  const { filas, error } = useFilasDelCorte(corteId, pob);
  const r = useMemo(() => (filas ? segmentar(filas, dimension) : null), [filas, dimension]);
  if (!cortes.length) return <p className="crediscope-muted">No hay cortes.</p>;
  const nombre = (n) => ETIQUETA_RECOMENDACION[n] ?? n;
  return (
    <div>
      <div className="crediscope-card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select className="crediscope-input" style={{ width: "auto" }} value={corteId ?? ""} onChange={(e) => setCorteId(e.target.value)}>
          {cortes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {corte?.resumen?.solicitudes ? (
          <select className="crediscope-input" style={{ width: "auto" }} value={poblacion} onChange={(e) => setPoblacion(e.target.value)}>
            <option value="operaciones">Con el crédito de la institución</option>
            <option value="solicitudes">Todas las solicitudes observadas</option>
          </select>
        ) : null}
        <span className="crediscope-muted" style={{ fontSize: 13 }}>por</span>
        <select className="crediscope-input" style={{ width: "auto" }} value={dimension} onChange={(e) => setDimension(e.target.value)}>
          {DIMENSIONES_CARTERA.filter((d) => !DIMENSIONES[d].soloSolicitudes || pob === "solicitudes").map((d) => <option key={d} value={d}>{DIMENSIONES[d].texto}</option>)}
        </select>
      </div>
      <MensajeError mensaje={error} />
      {!r ? <Cargando /> : (
        <div className="crediscope-card">
          <GraficoBarras
            categorias={r.segmentos.map((s) => nombre(s.nombre))}
            series={[{ nombre: "Buenos", color: "var(--good)", valores: r.segmentos.map((s) => s.n - s.malos), formato: (v) => num(v) }, { nombre: "Malos", color: "var(--bad)", valores: r.segmentos.map((s) => s.malos), formato: (v) => num(v) }]}
            apiladas
            y={{ titulo: "Personas", formato: (v) => num(v) }}
            linea={{ nombre: "Tasa de malos", color: "var(--brand)", valores: r.segmentos.map((s) => s.tasa) }}
            ejeDerecho={{ titulo: "Tasa de malos", formato: (v) => pct(v, 0) }}
            etiqueta="Cartera por dimensión"
          />
          <table className="crediscope-table">
            <thead>
              <tr><th>{DIMENSIONES[dimension].texto}</th><th style={{ textAlign: "right" }}>Personas</th><th style={{ textAlign: "right" }}>Buenos</th><th style={{ textAlign: "right" }}>Malos</th><th style={{ textAlign: "right" }}>Tasa</th><th style={{ textAlign: "right" }}>Puntaje medio</th></tr>
            </thead>
            <tbody>
              {r.segmentos.map((s) => (
                <tr key={s.nombre}>
                  <td>{nombre(s.nombre)}</td>
                  <td style={{ textAlign: "right" }}>{num(s.n)}</td>
                  <td style={{ textAlign: "right" }}>{num(s.n - s.malos)}</td>
                  <td style={{ textAlign: "right" }}>{num(s.malos)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(s.tasa)}</td>
                  <td style={{ textAlign: "right" }}>{s.puntajeMedio === null ? "—" : num(s.puntajeMedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------- diccionario de datos
// Los tres niveles en un lugar: el campo del crudo de Novadata (del último
// explorador del crudo), el campo de la estructura (con su cobertura en el
// último corte) y la variable del catálogo (lo que miden las pestañas).
export function Diccionario({ cortes }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [texto, setTexto] = useState("");
  const [nivel, setNivel] = useState("todos");
  useEffect(() => {
    (async () => {
      const resultados = (await Promise.all(cortes.map((c) => getResultados(c.id)))).flat();
      const crudo = resultados.filter((r) => r.tipo === "crudo").sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.resultado ?? null;
      const [catalogo, cobertura] = await Promise.all([getCatalogoUnaVez(), cortes[0] ? getCoberturaDeLaEstructura(cortes[0].id) : null]);
      const filas = [
        ...(crudo?.diccionario ?? []).filter((d) => d.tipo !== "metadato").map((d) => ({ nivel: "crudo", nombre: d.ruta, donde: d.fuente, tipo: d.tipo, cobertura: d.cobertura, detalle: d.nombrado ? "la estructura lo nombra" : "la estructura no lo lee", extra: d.valores ? d.valores.map(([v, n]) => `${v} (${n})`).join(" · ") : d.resumen ? `${d.resumen.p10} · ${d.resumen.mediana} · ${d.resumen.p90}` : "" })),
        ...(cobertura?.campos ?? []).map((c) => ({ nivel: "estructura", nombre: `${c.grupo}.${c.campo}`, donde: c.grupo, tipo: "", cobertura: cobertura.perfiles ? c.con_valor / cobertura.perfiles : null, detalle: c.habilitado ? "llega al modelo" : "apagado", extra: "" })),
        ...catalogo.map((v) => ({ nivel: "variable", nombre: `${v.nombre} (${v.id})`, donde: v.grupo, tipo: v.tipo, cobertura: null, detalle: v.uso === "protegida" ? "protegida" : v.en_perfil_del_modelo ? "el modelo la recibe" : "el modelo NO la recibe", extra: `perfil: ${(v.ruta ?? []).join(".")}` })),
      ];
      setDatos({ filas, crudoDe: crudo ? true : false });
    })().catch((e) => setError(e.message));
  }, [cortes]);
  if (error) return <MensajeError mensaje={error} />;
  if (!datos) return <Cargando que="el diccionario" />;
  const t = texto.trim().toLowerCase();
  const visibles = datos.filas.filter((f) => (nivel === "todos" || f.nivel === nivel) && (!t || `${f.nombre} ${f.donde} ${f.detalle}`.toLowerCase().includes(t)));
  return (
    <div>
      <div className="crediscope-card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input className="crediscope-input" style={{ maxWidth: 320 }} placeholder="Buscar (licencia, ingreso, buró...)" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <select className="crediscope-input" style={{ width: "auto" }} value={nivel} onChange={(e) => setNivel(e.target.value)}>
          <option value="todos">Los tres niveles</option>
          <option value="crudo">Crudo de Novadata ({num(datos.filas.filter((f) => f.nivel === "crudo").length)})</option>
          <option value="estructura">Estructura ({num(datos.filas.filter((f) => f.nivel === "estructura").length)})</option>
          <option value="variable">Variables del catálogo ({num(datos.filas.filter((f) => f.nivel === "variable").length)})</option>
        </select>
        <span className="crediscope-muted" style={{ fontSize: 13 }}>{num(visibles.length)} campos</span>
      </div>
      {!datos.crudoDe ? <p className="crediscope-muted" style={{ fontSize: 13 }}>El nivel del crudo aparece cuando se corre el explorador del crudo en algún corte.</p> : null}
      <div className="crediscope-card" style={{ overflowX: "auto" }}>
        <table className="crediscope-table">
          <thead>
            <tr><th>Nivel</th><th>Campo</th><th>Fuente o grupo</th><th>Tipo</th><th style={{ textAlign: "right" }}>Lo traen</th><th>Uso</th><th>Valores frecuentes o rango</th></tr>
          </thead>
          <tbody>
            {visibles.slice(0, 300).map((f) => (
              <tr key={`${f.nivel}|${f.nombre}`}>
                <td>{f.nivel}</td>
                <td style={{ fontSize: 12.5 }}><code>{f.nombre}</code></td>
                <td>{f.donde}</td>
                <td>{f.tipo}</td>
                <td style={{ textAlign: "right" }}>{f.cobertura === null || f.cobertura === undefined ? "—" : pct(f.cobertura, 0)}</td>
                <td>{f.detalle}</td>
                <td style={{ fontSize: 12 }} className="crediscope-muted">{f.extra}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length > 300 ? <p className="crediscope-muted" style={{ fontSize: 12.5 }}>Se muestran 300 de {num(visibles.length)}: afinar la búsqueda.</p> : null}
      </div>
    </div>
  );
}
