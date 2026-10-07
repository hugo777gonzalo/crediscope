import { useMemo, useState } from "react";
import { useColumnasDelCorte } from "../../lib/useFilasDelCorte.js";
import { ivDeLaVariable, tramosIniciales, tramosDesdeTexto, tramosMonotonos } from "../../lib/analisisEstadistico.js";
import { GraficoBarras } from "./Graficos.jsx";
import SelectorDeVariable from "./SelectorDeVariable.jsx";
import { MensajeError, Cargando, GuardarEsteResultado, Etiqueta, num, pct, dec } from "./Comunes.jsx";

// Laboratorio de tramos (IV y WoE a mano): los cortes de una variable
// numérica se pueden escribir, pedir por cuantiles o volver monótonos (la
// tasa sube o baja siempre en el mismo sentido: una regla de crédito
// necesita leerse en una sola dirección). La estabilidad es el mismo IV en
// las dos mitades del corte, por fecha. Los cuartiles iniciales son los
// mismos de la pestaña IV y WoE (la base usa la misma regla desde la 106).

const fuerza = (iv) => (iv < 0.02 ? ["nada", "var(--text-muted)"] : iv < 0.1 ? ["débil", "var(--brand)"] : iv < 0.3 ? ["media", "var(--warn)"] : ["fuerte", "var(--bad)"]);

function cortesDe(tramos) {
  return tramos.filter((t) => t.tipo === "intervalo" && t.hasta !== null).map((t) => String(t.hasta).replace(".", ",")).join("; ");
}

export default function PestanaTramos({ corteId, poblacion }) {
  const { datos, error } = useColumnasDelCorte(corteId, poblacion);
  const [id, setId] = useState(null);
  const [texto, setTexto] = useState(null);
  const numericas = useMemo(() => datos?.columnas.filter((c) => c.tipo === "numero" && new Set(c.valores.filter((v) => v !== null)).size > 6) ?? [], [datos]);
  const columna = numericas.find((c) => c.id === id) ?? numericas[0] ?? null;

  const r = useMemo(() => {
    if (!datos || !columna) return null;
    const iniciales = tramosIniciales(columna);
    // Lo que no es un intervalo (el cero en su tramo, "sin dato") se conserva.
    const extras = iniciales.filter((t) => t.tipo !== "intervalo");
    const tramos = texto === null ? iniciales : [...extras.filter((t) => t.tipo === "valor"), ...tramosDesdeTexto(texto), ...extras.filter((t) => t.tipo === "sin_dato")];
    return { iniciales, extras, tramos, iv: ivDeLaVariable(columna, datos.malos, datos.filas, tramos) };
  }, [datos, columna, texto]);

  if (error) return <MensajeError mensaje={error} />;
  if (!datos) return <Cargando que="las variables del corte" />;
  if (!columna || !r) return <p className="crediscope-muted">El corte no tiene variables numéricas con más de 6 valores.</p>;
  const { iv } = r;
  const [nombreFuerza, color] = fuerza(iv.iv);
  const elegir = (nuevo) => { setId(nuevo); setTexto(null); };
  const porCuantiles = (k) => setTexto(cortesDe(tramosIniciales(columna, k)));
  const monotonos = () => setTexto(cortesDe(tramosMonotonos(columna.valores, datos.malos, r.tramos)));

  return (
    <div>
      <GuardarEsteResultado
        corteId={corteId} tipo="tramos" poblacion={poblacion} parametros={{ variable: columna.id, cortes: texto }}
        resultado={{ variable: columna.id, nombre: columna.nombre, cortes: texto, iv: iv.iv, primera: iv.primera.iv, segunda: iv.segunda.iv, tramos: iv.tramos.map((t, i) => ({ tramo: iv.etiquetas[i], n: t.n, malos: t.malos, tasa: t.tasa, woe: t.woe })), n: iv.n, n_malos: iv.malos }}
        texto="Guardar estos tramos"
      />
      <div className="crediscope-card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <SelectorDeVariable columnas={numericas} valor={columna.id} alCambiar={elegir} />
          <button className="crediscope-btn crediscope-btn-ghost" onClick={() => setTexto(null)}>Cuartiles</button>
          <button className="crediscope-btn crediscope-btn-ghost" onClick={() => porCuantiles(5)}>Quintiles</button>
          <button className="crediscope-btn crediscope-btn-ghost" onClick={() => porCuantiles(10)}>Deciles</button>
          <button className="crediscope-btn" onClick={monotonos}>Volver monótonos</button>
        </div>
        <label style={{ display: "block", fontSize: 13 }}>
          Cortes (el tramo llega hasta cada valor, inclusive; separados por punto y coma)
          <input className="crediscope-input" value={texto ?? cortesDe(r.iniciales)} onChange={(e) => setTexto(e.target.value)} />
        </label>
        {r.extras.length ? <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Además: {r.extras.map((t) => (t.tipo === "sin_dato" ? "sin dato" : `${t.valor} en su propio tramo`)).join(" · ")}.</p> : null}
      </div>

      <div className="crediscope-card">
        <p style={{ marginTop: 0 }}>
          IV <strong>{dec(iv.iv, 3)}</strong> <Etiqueta texto={nombreFuerza} color={color} /> · primera mitad {dec(iv.primera.iv, 3)} · segunda mitad {dec(iv.segunda.iv, 3)}
          {(iv.primera.iv >= 0.02) !== (iv.segunda.iv >= 0.02) ? <strong style={{ color: "var(--warn)" }}> · inestable: sólo anticipa en una mitad</strong> : null}
        </p>
        <GraficoBarras
          categorias={iv.etiquetas}
          series={[{ nombre: "Tasa de malos", color: "var(--brand)", valores: iv.tramos.map((t) => t.tasa), formato: (v) => pct(v) }]}
          y={{ titulo: "Tasa de malos", formato: (v) => pct(v, 0) }}
          alto={240}
          etiqueta="Tasa de malos por tramo"
        />
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Tramo</th>
                <th style={{ textAlign: "right" }}>Personas</th>
                <th style={{ textAlign: "right" }}>Malos</th>
                <th style={{ textAlign: "right" }}>Tasa</th>
                <th style={{ textAlign: "right" }}>WoE</th>
                <th style={{ textAlign: "right" }}>Aporte al IV</th>
                <th style={{ textAlign: "right" }}>Tasa 1.ª mitad</th>
                <th style={{ textAlign: "right" }}>Tasa 2.ª mitad</th>
              </tr>
            </thead>
            <tbody>
              {iv.tramos.map((t, i) => {
                const a = iv.primera.tramos.find((x) => JSON.stringify([x.tipo, x.desde, x.hasta, x.valor]) === JSON.stringify([t.tipo, t.desde, t.hasta, t.valor]));
                const b = iv.segunda.tramos.find((x) => JSON.stringify([x.tipo, x.desde, x.hasta, x.valor]) === JSON.stringify([t.tipo, t.desde, t.hasta, t.valor]));
                return (
                  <tr key={iv.etiquetas[i]}>
                    <td>{iv.etiquetas[i]}</td>
                    <td style={{ textAlign: "right" }}>{num(t.n)}</td>
                    <td style={{ textAlign: "right" }}>{num(t.malos)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(t.tasa)}</td>
                    <td style={{ textAlign: "right" }}>{dec(t.woe, 3)}</td>
                    <td style={{ textAlign: "right" }}>{dec(t.aporte, 4)}</td>
                    <td style={{ textAlign: "right" }} className="crediscope-muted">{a ? pct(a.tasa) : "—"}</td>
                    <td style={{ textAlign: "right" }} className="crediscope-muted">{b ? pct(b.tasa) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          IV: menos de 0,02 nada · hasta 0,1 débil · hasta 0,3 media · más, fuerte · más de 0,5, sospechar que la variable trae el resultado. WoE con
          el suavizado de la base (0,5 por tramo).
        </p>
      </div>
    </div>
  );
}
