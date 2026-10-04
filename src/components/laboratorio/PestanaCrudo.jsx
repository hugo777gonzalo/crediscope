import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatearFechaHora } from "../../lib/fechas.js";
import { Advertencias, Etiqueta, Kpi, ETIQUETA_RECOMENDACION, num, pct, dec } from "./Comunes.jsx";

// El explorador del crudo (fase E, docs/laboratorio-pantallas.md): qué trae
// el crudo de Novadata del día del análisis, qué de eso se asocia al impago y
// qué no vio el modelo. Lo calcula scripts/explorar-crudo.mjs (recorrer 2.500
// crudos desde el navegador es pesado); acá sólo se muestra. Ningún valor de
// una persona: los valores frecuentes los comparten 10 personas o más.
//
// Lo primero es la respuesta a "¿qué no vio el modelo?": asociado al impago
// después de la corrección por comparaciones múltiples, que sigue separando a
// buenos de malos dentro de cada recomendación del modelo, y que la
// estructura no lee.

const DERIVACION = {
  tiene: "Tiene el dato",
  cuantos: "Cuántos registros",
  valor: "Valor (el mayor)",
  fecha_anterior: "La fecha es anterior al día del análisis",
  alguna_fecha_anterior: "Alguna fecha anterior al día del análisis",
  dias: "Días entre la fecha y el análisis",
};
const condicion = (h) => (h.derivacion === "categoria" ? `Es «${h.categoria}»` : DERIVACION[h.derivacion] ?? h.derivacion);

const EL_MODELO = {
  no_lo_tenia: ["No lo tenía", "var(--bad)"],
  lo_tenia: ["Ya lo tenía", "var(--good)"],
  no_concluyente: ["No concluyente", "var(--warn)"],
};


// "licenciaConducir.data.licencia[].validezHasta" → "licencia › validezHasta":
// la fuente va aparte, "data" y los corchetes no le dicen nada a nadie.
function rutaLegible(ruta, fuente) {
  return ruta.slice(fuente.length).replace(/^\.data\./, "").replace(/^\./, "").replace(/\[\]/g, "").split(".").join(" › ");
}

function Campo({ h }) {
  return (
    <>
      <strong>{rutaLegible(h.ruta, h.fuente) || h.fuente}</strong>
      <div className="crediscope-muted" style={{ fontSize: 12 }}>{h.fuente}</div>
    </>
  );
}

function Tasas({ h }) {
  if (h.tasa_con === undefined) return <span className="crediscope-muted">{h.auc !== null && h.auc !== undefined ? `AUC ${dec(h.auc, 3)}` : "—"}</span>;
  return (
    <span>
      <strong>{pct(h.tasa_con)}</strong> con · {pct(h.tasa_sin)} sin
    </span>
  );
}

function Detalle({ h }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {h.tasa_con !== undefined ? (
        <p style={{ margin: 0, fontSize: 13 }}>
          Con la condición: {num(h.con)} personas, {num(h.malos_con)} malas ({pct(h.tasa_con)}, entre {pct(h.ic_con?.[0])} y {pct(h.ic_con?.[1])}). Sin ella:{" "}
          {num(h.sin)} personas, {num(h.malos_sin)} malas ({pct(h.tasa_sin)}, entre {pct(h.ic_sin?.[0])} y {pct(h.ic_sin?.[1])}). Razón de momios{" "}
          {dec(h.razon_de_momios, 2)}; dentro de cada recomendación del modelo, {dec(h.razon_de_momios_ajustada, 2)}
          {h.parte_no_explicada !== null && h.parte_no_explicada !== undefined ? ` (queda el ${pct(h.parte_no_explicada, 0)} del efecto)` : ""}.
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 13 }}>
          {num(h.con)} personas con el dato{h.sin ? `, ${num(h.sin)} sin él` : ""}. Un valor numérico no se ajusta por la recomendación del modelo: mirar
          los tramos.
        </p>
      )}
      {h.por_recomendacion?.length ? (
        <table className="crediscope-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Recomendación del modelo</th>
              <th style={{ textAlign: "right" }}>Con la condición</th>
              <th style={{ textAlign: "right" }}>Tasa</th>
              <th style={{ textAlign: "right" }}>Sin la condición</th>
              <th style={{ textAlign: "right" }}>Tasa</th>
            </tr>
          </thead>
          <tbody>
            {h.por_recomendacion.map((r) => (
              <tr key={r.recomendacion}>
                <td>{ETIQUETA_RECOMENDACION[r.recomendacion] ?? r.recomendacion}</td>
                <td style={{ textAlign: "right" }}>{num(r.con)}</td>
                <td style={{ textAlign: "right" }}>{r.con ? pct(r.malos_con / r.con) : "—"}</td>
                <td style={{ textAlign: "right" }}>{num(r.sin)}</td>
                <td style={{ textAlign: "right" }}>{r.sin ? pct(r.malos_sin / r.sin) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {h.tramos?.length && h.tasa_con === undefined ? (
        <table className="crediscope-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Tramo</th>
              <th style={{ textAlign: "right" }}>Personas</th>
              <th style={{ textAlign: "right" }}>Malos</th>
              <th style={{ textAlign: "right" }}>Tasa</th>
            </tr>
          </thead>
          <tbody>
            {h.tramos.map((t) => (
              <tr key={t.tramo}>
                <td>{t.tramo}</td>
                <td style={{ textAlign: "right" }}>{num(t.n)}</td>
                <td style={{ textAlign: "right" }}>{num(t.malos)}</td>
                <td style={{ textAlign: "right" }}>{pct(t.tasa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {h.equivalentes?.length ? (
        <p className="crediscope-muted" style={{ margin: 0, fontSize: 12.5 }}>
          Separa exactamente a las mismas personas: {h.equivalentes.map((e) => e.replace(/\.data\./, " › ").replace(/\[\]/g, "")).join(" · ")}
          {h.mas_equivalentes ? ` y ${num(h.mas_equivalentes)} más` : ""}.
        </p>
      ) : null}
    </div>
  );
}

function FilaHallazgo({ h, columnas }) {
  const [abierta, setAbierta] = useState(false);
  const [texto, color] = EL_MODELO[h.el_modelo] ?? [null, null];
  return (
    <>
      <tr onClick={() => setAbierta(!abierta)} style={{ cursor: "pointer" }}>
        <td>
          <div style={{ display: "flex", gap: 6 }}>
            {abierta ? <ChevronDown size={14} style={{ flexShrink: 0, marginTop: 3 }} /> : <ChevronRight size={14} style={{ flexShrink: 0, marginTop: 3 }} />}
            <div><Campo h={h} /></div>
          </div>
        </td>
        <td>{condicion(h)}</td>
        <td style={{ textAlign: "right" }}>{num(h.con)}</td>
        <td><Tasas h={h} /></td>
        {columnas === "todo" ? (
          <>
            <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{dec(h.iv, 3)}</td>
            <td>{h.nombrado ? "Sí" : <span style={{ color: "var(--bad)", fontWeight: 700 }}>No</span>}</td>
          </>
        ) : null}
        <td>{texto ? <Etiqueta texto={texto} color={color} /> : <span className="crediscope-muted">—</span>}</td>
      </tr>
      {abierta ? (
        <tr>
          <td colSpan={columnas === "todo" ? 7 : 5} style={{ background: "var(--panel-muted)" }}>
            <Detalle h={h} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TablaHallazgos({ lista, columnas }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="crediscope-table">
        <thead>
          <tr>
            <th>Campo del crudo</th>
            <th>Condición</th>
            <th style={{ textAlign: "right" }}>Personas</th>
            <th>Tasa de malos</th>
            {columnas === "todo" ? (
              <>
                <th style={{ textAlign: "right" }}>Valor de información</th>
                <th>¿Lo lee la estructura?</th>
              </>
            ) : null}
            <th>¿El modelo lo tenía?</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((h) => <FilaHallazgo key={`${h.ruta}|${h.derivacion}|${h.categoria ?? ""}`} h={h} columnas={columnas} />)}
        </tbody>
      </table>
    </div>
  );
}

const FILTROS = {
  significativas: ["Todo lo asociado al impago", (h) => h.significativa],
  no_lee: ["Lo que la estructura no lee", (h) => h.significativa && !h.nombrado],
  lo_tenia: ["Lo que el modelo ya tenía", (h) => h.significativa && h.el_modelo === "lo_tenia"],
  todas: ["También lo no significativo", () => true],
};

function Plegable({ titulo, resumen, children, abiertoAlInicio = false }) {
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  return (
    <div className="crediscope-card">
      <button onClick={() => setAbierto(!abierto)} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, alignItems: "baseline", width: "100%" }}>
        {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        {resumen ? <span className="crediscope-muted" style={{ fontSize: 13 }}>{resumen}</span> : null}
      </button>
      {abierto ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

function valoresDelCampo(d) {
  if (d.valores?.length) return d.valores.map(([v, n]) => `${v} (${num(n)})`).join(" · ");
  if (d.resumen) return `${d.resumen.p10} · mediana ${d.resumen.mediana} · ${d.resumen.p90}`;
  if (d.tipo === "identificador") return "No se muestra: identifica a alguien";
  return d.distintos === null ? "Más de 50 distintos" : "—";
}

function FilaFuente({ f, diccionario }) {
  const [abierta, setAbierta] = useState(false);
  const campos = abierta ? diccionario.filter((d) => d.fuente === f.fuente && d.tipo !== "metadato") : [];
  const estados = Object.entries(f.estados ?? {}).map(([e, n]) => `${e}: ${num(n)}`).join(" · ");
  return (
    <>
      <tr onClick={() => setAbierta(!abierta)} style={{ cursor: "pointer" }}>
        <td>
          {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <strong>{f.fuente}</strong>
          <div className="crediscope-muted" style={{ fontSize: 12 }}>{estados}</div>
        </td>
        <td style={{ textAlign: "right" }}>{num(f.contestaron)}</td>
        <td style={{ textAlign: "right" }}>{num(f.con_datos)}</td>
        <td style={{ textAlign: "right" }}>{num(f.campos)}</td>
        <td style={{ textAlign: "right" }}>{num(f.campos_no_nombrados)}</td>
        <td>{f.mejor_hallazgo ? `${rutaLegible(f.mejor_hallazgo.ruta, f.fuente)} · ${condicion(f.mejor_hallazgo)} (${dec(f.mejor_hallazgo.iv, 3)})` : "—"}</td>
      </tr>
      {abierta ? (
        <tr>
          <td colSpan={6} style={{ background: "var(--panel-muted)" }}>
            <table className="crediscope-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: "right" }}>Lo traen</th>
                  <th style={{ textAlign: "right" }}>Vacíos</th>
                  <th>Valores frecuentes o rango</th>
                  <th>¿Lo lee la estructura?</th>
                </tr>
              </thead>
              <tbody>
                {campos.map((d) => (
                  <tr key={d.ruta}>
                    <td style={{ fontSize: 13 }}>{rutaLegible(d.ruta, d.fuente)}</td>
                    <td>{d.tipo}{d.tipos_mezclados ? <span style={{ color: "var(--warn)" }}> (mezcla {d.tipos_mezclados.join(" y ")})</span> : null}</td>
                    <td style={{ textAlign: "right" }}>{pct(d.cobertura, 0)}</td>
                    <td style={{ textAlign: "right" }}>{pct(d.vacias, 0)}</td>
                    <td style={{ fontSize: 12.5 }}>{valoresDelCampo(d)}</td>
                    <td>{d.nombrado ? "Sí" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function PestanaCrudo({ resultado, corteId }) {
  const [filtro, setFiltro] = useState("significativas");
  const comando = `node scripts/explorar-crudo.mjs --corte=${corteId}`;
  if (!resultado) {
    return (
      <div className="crediscope-card">
        <p style={{ marginTop: 0 }}>Todavía no se calculó.</p>
        <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
          Lo calcula un guion en la computadora del negocio, porque recorre el crudo de cada persona: <code>{comando}</code>
        </p>
      </div>
    );
  }
  const r = resultado.resultado;
  const hallazgos = r.hallazgos ?? [];
  const noVistos = hallazgos.filter((h) => h.significativa && h.el_modelo === "no_lo_tenia" && !h.nombrado);
  const [, filtrar] = FILTROS[filtro];
  const filtrados = hallazgos.filter(filtrar);
  const camposLeibles = (r.diccionario ?? []).filter((d) => ["número", "fecha", "texto", "sí/no"].includes(d.tipo));

  return (
    <div>
      <p className="crediscope-muted" style={{ fontSize: 13, marginTop: 0 }}>
        Calculado el {formatearFechaHora(resultado.created_at)} sobre el crudo del día del análisis. Se recalcula con <code>{comando}</code>
      </p>
      <Advertencias lista={r.advertencias} />

      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Personas con crudo" valor={num(r.personas)} detalle={`${num(r.malos)} malas${r.sin_crudo ? ` · ${num(r.sin_crudo)} sin crudo` : ""}`} />
        <Kpi
          etiqueta="Campos del crudo"
          valor={num(camposLeibles.length)}
          detalle={`${num(camposLeibles.filter((d) => !d.nombrado).length)} que la estructura no lee`}
        />
        <Kpi etiqueta="Asociados al impago" valor={num(r.significativas)} detalle={`de ${num(r.condiciones_unicas)} condiciones probadas, ya corregido`} />
        <Kpi etiqueta="Lo que el modelo no vio" valor={num(noVistos.length)} detalle="Asociado, el modelo no lo tenía y la estructura no lo lee" color={noVistos.length ? "var(--bad)" : undefined} />
      </div>

      <div className="crediscope-card" style={{ borderColor: noVistos.length ? "var(--bad)" : undefined }}>
        <h3 style={{ marginTop: 0 }}>Lo que el modelo no vio</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Campos del crudo que se asocian al impago, que siguen separando a buenos de malos dentro de cada recomendación del modelo (la mitad del efecto o
          más) y que la estructura no lee. Son candidatos a dato nuevo: se validan en un corte posterior antes de proponerlos.
        </p>
        {noVistos.length ? <TablaHallazgos lista={noVistos} columnas="corto" /> : <p className="crediscope-muted" style={{ marginBottom: 0 }}>Ninguno en este corte.</p>}
      </div>

      <Plegable titulo="Todo lo asociado al impago" resumen={`${num(r.significativas)} condiciones`}>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="crediscope-input" style={{ width: "auto", marginBottom: 10 }}>
          {Object.entries(FILTROS).map(([clave, [texto]]) => (
            <option key={clave} value={clave}>{texto}</option>
          ))}
        </select>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Valor de información: menos de 0,02 nada · hasta 0,1 débil · hasta 0,3 media · más, fuerte. "¿El modelo lo tenía?" sólo se mide en condiciones sí o
          no.
        </p>
        <TablaHallazgos lista={filtrados} columnas="todo" />
      </Plegable>

      <Plegable titulo="Fuentes y diccionario" resumen={`${num(r.fuentes?.length)} fuentes`}>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Fuente</th>
                <th style={{ textAlign: "right" }}>Contestaron</th>
                <th style={{ textAlign: "right" }}>Con datos</th>
                <th style={{ textAlign: "right" }}>Campos</th>
                <th style={{ textAlign: "right" }}>La estructura no lee</th>
                <th>Lo más asociado al impago</th>
              </tr>
            </thead>
            <tbody>
              {(r.fuentes ?? []).map((f) => <FilaFuente key={f.fuente} f={f} diccionario={r.diccionario ?? []} />)}
            </tbody>
          </table>
        </div>
      </Plegable>

      <Plegable
        titulo="Calidad del crudo"
        resumen={`${num(r.calidad?.tipos_mezclados?.length)} campos con tipos mezclados · ${num(r.calidad?.variantes?.length)} con el mismo valor escrito distinto · ${num(r.calidad?.siempre_vacios)} siempre vacíos`}
      >
        {r.calidad?.variantes?.length ? (
          <>
            <h4 style={{ margin: "0 0 6px" }}>El mismo valor escrito distinto</h4>
            <ul style={{ marginTop: 0, fontSize: 13 }}>
              {r.calidad.variantes.map((v) => (
                <li key={v.ruta}>{v.ruta}: {v.variantes.map((g) => g.join(" / ")).join(" · ")}</li>
              ))}
            </ul>
          </>
        ) : null}
        {r.calidad?.tipos_mezclados?.length ? (
          <>
            <h4 style={{ margin: "0 0 6px" }}>Tipos mezclados</h4>
            <ul style={{ marginTop: 0, fontSize: 13 }}>
              {r.calidad.tipos_mezclados.map((t) => (
                <li key={t.ruta}>{t.ruta}: {t.tipos.join(" y ")}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Plegable>
    </div>
  );
}
