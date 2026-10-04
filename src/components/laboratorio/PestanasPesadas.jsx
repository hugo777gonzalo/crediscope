import { formatearFechaHora } from "../../lib/fechas.js";
import { GraficoBarras, GraficoDispersion } from "./Graficos.jsx";
import { Advertencias, Kpi, Etiqueta, num, pct, dec } from "./Comunes.jsx";

// Lo que calcula scripts/analisis-pesado.mjs (fase F: bosque aleatorio con
// SHAP y permutación, K-medias, componentes principales). Recorrerlo desde el
// navegador es pesado (decisión 2): un guion local lo guarda y estas
// pestañas sólo lo muestran.

function SinCalcular({ corteId, que }) {
  return (
    <div className="crediscope-card">
      <p style={{ marginTop: 0 }}>Todavía no se calculó {que} en este corte.</p>
      <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
        Lo calcula un guion en la computadora del negocio: <code>node scripts/analisis-pesado.mjs --corte={corteId}</code>
      </p>
    </div>
  );
}

function Pie({ resultado }) {
  return (
    <p className="crediscope-muted" style={{ fontSize: 12.5 }}>
      Calculado el {formatearFechaHora(resultado.created_at)} sobre {num(resultado.resultado.personas)} personas ({resultado.resultado.poblacion}). Se recalcula con el guion.
    </p>
  );
}

// ------------------------------------------------------------ importancia
export function PestanaImportancia({ resultado, corteId }) {
  if (!resultado) return <SinCalcular corteId={corteId} que="la importancia de las variables" />;
  const r = resultado.resultado;
  const top = r.variables.slice(0, 20);
  const noLlegan = r.variables.slice(0, 15).filter((v) => v.en_modelo === false);
  return (
    <div>
      <Pie resultado={resultado} />
      <Advertencias lista={r.advertencias} />
      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="AUC del bosque" valor={dec(r.auc_bosque, 3)} detalle={`aprendió en ${num(r.entrenamiento.n)} y se midió en otras ${num(r.prueba.n)} (${num(r.prueba.malos)} malos)`} />
        <Kpi
          etiqueta="AUC del motor, mismas personas"
          valor={dec(r.auc_motor, 3)}
          detalle={r.auc_bosque > r.auc_motor ? "Los mismos datos ordenan mejor que el motor" : "El motor ordena igual o mejor que el bosque"}
          color={r.auc_bosque > r.auc_motor + 0.02 ? "var(--bad)" : undefined}
        />
        <Kpi etiqueta="Precisión de SHAP" valor={r.precision_local < 1e-9 ? "exacta" : dec(r.precision_local, 6)} detalle="valor base + SHAP = predicción, en cada persona" />
        <Kpi etiqueta="Fuertes que el modelo no recibe" valor={num(noLlegan.length)} detalle={noLlegan.map((v) => v.nombre).join(", ") || "Entre las 15 primeras, ninguna"} color={noLlegan.length ? "var(--bad)" : undefined} />
      </div>
      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Cuánto mueve cada variable la predicción (SHAP medio)</h3>
        <GraficoBarras
          categorias={top.map((v) => v.nombre)}
          series={[{ nombre: "SHAP medio", color: "var(--brand)", valores: top.map((v) => v.shap_medio), formato: (x) => dec(x, 4) }]}
          y={{ titulo: "Cambio medio de la probabilidad", formato: (x) => dec(x, 3) }}
          alto={300}
          etiqueta="Importancia SHAP"
        />
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th style={{ textAlign: "right" }}>SHAP medio</th>
                <th style={{ textAlign: "right" }}>Permutación (baja del AUC)</th>
                <th>Sentido</th>
                <th style={{ textAlign: "right" }}>En aprobar</th>
                <th style={{ textAlign: "right" }}>En revisar</th>
                <th style={{ textAlign: "right" }}>En negar</th>
                <th>El modelo</th>
              </tr>
            </thead>
            <tbody>
              {top.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.nombre}</strong><div className="crediscope-muted" style={{ fontSize: 12 }}>{v.grupo}</div></td>
                  <td style={{ textAlign: "right" }}>{dec(v.shap_medio, 4)}</td>
                  <td style={{ textAlign: "right", color: v.permutacion !== null && v.permutacion <= 0 ? "var(--text-muted)" : undefined }}>{dec(v.permutacion, 4)}</td>
                  <td>{v.direccion}</td>
                  <td style={{ textAlign: "right" }}>{dec(v.por_recomendacion?.aprobar, 4)}</td>
                  <td style={{ textAlign: "right" }}>{dec(v.por_recomendacion?.revisar, 4)}</td>
                  <td style={{ textAlign: "right" }}>{dec(v.por_recomendacion?.negar, 4)}</td>
                  <td>{v.en_modelo ? "La recibe" : <Etiqueta texto="No la recibe" color="var(--bad)" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          SHAP: cuánto cambia, en promedio, la probabilidad de caer que predice el bosque por esa variable (TreeSHAP exacto, sobre {num(r.prueba.shap_sobre)} personas de la
          mitad de prueba). Permutación: cuánto baja el AUC si se desordena la variable; cero o negativo, el bosque no la necesita. Una variable puede pesar en SHAP
          y no en permutación si otra dice lo mismo.
        </p>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- K-medias
export function PestanaKMedias({ resultado, corteId }) {
  if (!resultado) return <SinCalcular corteId={corteId} que="la segmentación por K-medias" />;
  const r = resultado.resultado;
  return (
    <div>
      <Pie resultado={resultado} />
      <Advertencias lista={r.advertencias} />
      <div className="crediscope-card">
        <p style={{ marginTop: 0 }}>
          {num(r.k)} grupos (la silueta más alta entre 2 y 6: {Object.entries(r.siluetas).map(([k, s]) => `${k}: ${dec(s, 3)}`).join(" · ")}). La silueta va de −1 a 1:
          más de 0,5, grupos bien separados; menos de 0,25, cortes de una nube continua. Describe la cartera; no predice.
        </p>
        <GraficoBarras
          categorias={r.grupos.map((g) => `Grupo ${g.grupo} (${num(g.n)})`)}
          series={[{ nombre: "Tasa de malos", color: "var(--brand)", valores: r.grupos.map((g) => g.tasa), formato: (x) => pct(x) }]}
          y={{ titulo: "Tasa de malos", formato: (x) => pct(x, 0) }}
          alto={240}
          etiqueta="Tasa de malos por grupo"
        />
      </div>
      {r.grupos.map((g) => (
        <div key={g.grupo} className="crediscope-card">
          <h3 style={{ marginTop: 0 }}>
            Grupo {g.grupo}: {num(g.n)} personas, {pct(g.tasa)} de malos <span className="crediscope-muted" style={{ fontSize: 13 }}>({pct(g.ic[0])} a {pct(g.ic[1])})</span>
          </h3>
          <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
            El motor: {Object.entries(g.recomendaciones).filter(([, n]) => n).map(([rec, n]) => `${rec} ${num(n)}`).join(" · ")}
          </p>
          <table className="crediscope-table">
            <thead>
              <tr><th>Lo que lo distingue</th><th style={{ textAlign: "right" }}>En el grupo</th><th style={{ textAlign: "right" }}>En todos</th><th style={{ textAlign: "right" }}>Desvíos</th></tr>
            </thead>
            <tbody>
              {g.rasgos.map((x) => (
                <tr key={x.nombre}>
                  <td>{x.nombre}</td>
                  <td style={{ textAlign: "right" }}>{dec(x.media_grupo, 2)}</td>
                  <td style={{ textAlign: "right" }}>{dec(x.media_total, 2)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{dec(x.z, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------- componentes principales
export function PestanaPca({ resultado, corteId }) {
  if (!resultado) return <SinCalcular corteId={corteId} que="el análisis de componentes principales" />;
  const r = resultado.resultado;
  return (
    <div>
      <Pie resultado={resultado} />
      <Advertencias lista={r.advertencias} />
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Varianza que explica cada componente</h3>
          <GraficoBarras
            categorias={r.explicada.map((_, i) => `${i + 1}.ª`)}
            series={[{ nombre: "Varianza explicada", color: "var(--brand)", valores: r.explicada, formato: (x) => pct(x) }]}
            y={{ formato: (x) => pct(x, 0) }}
            alto={220}
            etiqueta="Varianza explicada"
          />
          <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Sobre {num(r.columnas)} columnas estandarizadas. Si la primera explica poco, la información está repartida: no hay unos pocos ejes que resuman al cliente.
          </p>
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Las personas en las dos primeras</h3>
          <GraficoDispersion
            puntos={r.puntos.map((p) => ({ x: p.x, y: p.y, color: p.malo ? "var(--bad)" : "var(--good)", radio: p.malo ? 3 : 2, titulo: p.malo ? "cayó" : "pagó" }))}
            x={{ titulo: "1.ª componente", formato: (x) => dec(x, 1) }}
            y={{ titulo: "2.ª componente", formato: (x) => dec(x, 1) }}
            etiqueta="Las dos primeras componentes"
          />
          <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Rojo, cayó; verde, pagó. Una muestra, sin identificar a nadie.</p>
        </div>
      </div>
      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Qué forma cada componente</h3>
        {r.componentes.map((c) => (
          <p key={c.componente} style={{ fontSize: 13.5 }}>
            <strong>{c.componente}.ª</strong> ({pct(c.explicada)} de la varianza · AUC contra el resultado {dec(c.auc, 3)}):{" "}
            {c.cargas.map((x) => `${x.nombre} ${x.carga > 0 ? "+" : "−"}${dec(Math.abs(x.carga), 2)}`).join(" · ")}
          </p>
        ))}
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Herramienta de investigación, no una etapa del modelo (anexo del diseño).</p>
      </div>
    </div>
  );
}
