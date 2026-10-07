import { useMemo, useState } from "react";
import { useColumnasDelCorte } from "../../lib/useFilasDelCorte.js";
import { inferencia, pruebasDeTodas } from "../../lib/analisisEstadistico.js";
import SelectorDeVariable from "./SelectorDeVariable.jsx";
import { MensajeError, Cargando, SinGuardar, GuardarEsteResultado, Etiqueta, num, pct, dec } from "./Comunes.jsx";
import { useGuardarResultado } from "../../lib/useGuardarResultado.js";

// Inferencia: para una variable, las pruebas que corresponden a su tipo
// contra el resultado (y, las numéricas, entre las recomendaciones del
// motor), siempre con n, efecto e intervalo además del valor p: con miles
// de casos todo sale "significativo", y lo que importa es cuánto. Abajo,
// una prueba por variable con la corrección por comparaciones múltiples.

const pTexto = (p) => (p === null || p === undefined ? "—" : p < 0.0001 ? "< 0,0001" : dec(p, 4));
const n2 = (x) => (x === null || x === undefined ? "—" : Math.abs(x) >= 1000 ? num(x) : dec(x, 2));

function Prueba({ nombre, estadistico, p, efecto, nota }) {
  return (
    <tr>
      <td>{nombre}</td>
      <td style={{ textAlign: "right" }}>{estadistico}</td>
      <td style={{ textAlign: "right", fontWeight: 700, color: p !== null && p < 0.05 ? "var(--bad)" : undefined }}>{pTexto(p)}</td>
      <td>{efecto}</td>
      <td className="crediscope-muted" style={{ fontSize: 12.5 }}>{nota}</td>
    </tr>
  );
}

function Numerica({ r }) {
  const w = r.welch, mw = r.mannWhitney;
  const normal = (x) => (x.p === null ? "pocos casos" : x.p < 0.05 ? "no es normal" : "compatible con normal");
  return (
    <>
      <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
        Malos: {num(r.malos.n)}, media {n2(r.malos.media)}, mediana {n2(r.malos.mediana)} · Buenos: {num(r.buenos.n)}, media {n2(r.buenos.media)}, mediana {n2(r.buenos.mediana)}.
        Normalidad (D'Agostino-Pearson): malos {normal(r.normalidadMalos)}, buenos {normal(r.normalidadBuenos)}
        {r.normalidadMalos.p !== null && (r.normalidadMalos.p < 0.05 || r.normalidadBuenos.p < 0.05) ? ": mejor leer Mann-Whitney que la t." : "."}
      </p>
      <table className="crediscope-table">
        <thead>
          <tr><th>Prueba</th><th style={{ textAlign: "right" }}>Estadístico</th><th style={{ textAlign: "right" }}>p</th><th>Efecto</th><th>Qué dice</th></tr>
        </thead>
        <tbody>
          <Prueba
            nombre="t de Welch (malos contra buenos)"
            estadistico={w?.t === null || !w ? "—" : `t ${dec(w.t, 2)} · gl ${dec(w.gl, 0)}`}
            p={w?.p ?? null}
            efecto={w?.d === null || !w ? "—" : `diferencia ${n2(w.diferencia)} (${n2(w.ic[0])} a ${n2(w.ic[1])}) · g de Hedges ${dec(w.g, 2)}`}
            nota="Compara medias; no supone varianzas iguales"
          />
          <Prueba
            nombre="Mann-Whitney"
            estadistico={mw ? `z ${dec(mw.z, 2)}` : "—"}
            p={mw?.p ?? null}
            efecto={mw ? `delta de Cliff ${dec(mw.deltaCliff, 3)} · AUC ${dec(mw.auc, 3)}` : "—"}
            nota="Compara rangos; no supone normalidad"
          />
          {r.anova ? (
            <Prueba nombre="ANOVA entre recomendaciones" estadistico={`F ${dec(r.anova.f, 2)} · gl ${r.anova.gl1} y ${r.anova.gl2}`} p={r.anova.p} efecto={`eta² ${dec(r.anova.eta2, 3)}`} nota="¿El motor separa la variable entre aprobar, revisar y negar?" />
          ) : null}
          {r.kruskal ? (
            <Prueba nombre="Kruskal-Wallis entre recomendaciones" estadistico={`H ${dec(r.kruskal.h, 2)} · gl ${r.kruskal.gl}`} p={r.kruskal.p} efecto={`épsilon² ${dec(r.kruskal.epsilon2, 3)}`} nota="Lo mismo por rangos" />
          ) : null}
        </tbody>
      </table>
    </>
  );
}

function Categorica({ r }) {
  return (
    <>
      <table className="crediscope-table">
        <thead>
          <tr><th>Prueba</th><th style={{ textAlign: "right" }}>Estadístico</th><th style={{ textAlign: "right" }}>p</th><th>Efecto</th><th>Qué dice</th></tr>
        </thead>
        <tbody>
          {r.chi2 ? (
            <Prueba
              nombre="Chi cuadrado de independencia"
              estadistico={`chi² ${dec(r.chi2.chi2, 2)} · gl ${r.chi2.gl}`}
              p={r.chi2.p}
              efecto={`V de Cramér ${dec(r.chi2.v, 3)}`}
              nota={r.chi2.celdasChicas ? `${r.chi2.celdasChicas} de ${r.chi2.celdas} celdas esperan menos de 5: mejor Fisher o juntar categorías` : "¿La tasa de malos cambia entre categorías?"}
            />
          ) : null}
          {r.fisher ? <Prueba nombre="Exacta de Fisher" estadistico="—" p={r.fisher.p} efecto={`razón de momios ${dec(r.fisher.razonDeMomios.valor, 2)}`} nota="Exacta, sirve con pocos casos" /> : null}
        </tbody>
      </table>
      <table className="crediscope-table" style={{ marginTop: 10 }}>
        <thead>
          <tr><th>Categoría</th><th style={{ textAlign: "right" }}>Personas</th><th style={{ textAlign: "right" }}>Tasa de malos</th><th style={{ textAlign: "right" }}>Razón de momios contra el resto</th></tr>
        </thead>
        <tbody>
          {r.categorias.map((c) => (
            <tr key={c.valor}>
              <td>{c.valor}</td>
              <td style={{ textAlign: "right" }}>{num(c.n)}</td>
              <td style={{ textAlign: "right" }}>{pct(c.tasa)} <span className="crediscope-muted">({pct(c.ic[0])} a {pct(c.ic[1])})</span></td>
              <td style={{ textAlign: "right" }}>{dec(c.razon.valor, 2)} <span className="crediscope-muted">({dec(c.razon.ic[0], 2)} a {dec(c.razon.ic[1], 2)})</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function PestanaInferencia({ corteId, poblacion }) {
  const { datos, error } = useColumnasDelCorte(corteId, poblacion);
  const [id, setId] = useState(null);
  const columna = datos?.columnas.find((c) => c.id === id) ?? datos?.columnas[0] ?? null;
  const r = useMemo(() => (datos && columna ? inferencia(columna, datos.malos, datos.filas) : null), [datos, columna]);
  const todas = useMemo(() => (datos ? pruebasDeTodas(datos) : null), [datos]);
  // La prueba de todas las variables mira el corte entero: se guarda sola.
  const paraGuardar = useMemo(() => (datos && todas ? { todas, n: datos.filas.length, n_malos: datos.malos.filter(Boolean).length } : null), [datos, todas]);
  const sinGuardar = useGuardarResultado({ corteId, tipo: "inferencia", poblacion, parametros: { variable: "todas" }, resultado: paraGuardar });
  if (error) return <MensajeError mensaje={error} />;
  if (!datos || !r) return <Cargando que="las variables del corte" />;

  return (
    <div>
      <SinGuardar error={sinGuardar} />
      <div className="crediscope-card">
        <div style={{ marginBottom: 10 }}><SelectorDeVariable columnas={datos.columnas} valor={columna.id} alCambiar={setId} /></div>
        {r.tipo === "numero" ? <Numerica r={r} /> : <Categorica r={r} />}
        <GuardarEsteResultado corteId={corteId} tipo="inferencia" poblacion={poblacion} parametros={{ variable: columna.id }} resultado={{ variable: columna.id, nombre: columna.nombre, ...r }} />
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Todas las variables contra el resultado</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Mann-Whitney para las numéricas, chi cuadrado para el resto. q corrige por las {num(todas.length)} pruebas (Benjamini-Hochberg): al 5% saldrían ~
          {Math.round(todas.length * 0.05)} por azar sin corregir.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr><th>Variable</th><th>Prueba</th><th style={{ textAlign: "right" }}>p</th><th style={{ textAlign: "right" }}>q</th><th>Efecto</th><th>El modelo</th></tr>
            </thead>
            <tbody>
              {todas.map((t) => (
                <tr key={t.id} onClick={() => setId(t.id)} style={{ cursor: "pointer" }}>
                  <td><strong>{t.nombre}</strong><div className="crediscope-muted" style={{ fontSize: 12 }}>{t.grupo}</div></td>
                  <td>{t.prueba}</td>
                  <td style={{ textAlign: "right" }}>{pTexto(t.p)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: t.q !== null && t.q < 0.05 ? "var(--bad)" : undefined }}>{pTexto(t.q)}</td>
                  <td>{t.efecto === null ? "—" : `${t.medidaEfecto} ${dec(t.efecto, 3)}`}</td>
                  <td>{t.uso === "protegida" ? <Etiqueta texto="protegida" color="var(--warn)" /> : t.enModelo ? "La recibe" : <Etiqueta texto="No la recibe" color="var(--bad)" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
