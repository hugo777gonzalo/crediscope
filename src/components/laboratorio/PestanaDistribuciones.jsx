import { useMemo, useState } from "react";
import { useColumnasDelCorte } from "../../lib/useFilasDelCorte.js";
import { distribucion, comoNumero } from "../../lib/analisisEstadistico.js";
import { descriptivas } from "../../lib/estadistica.js";
import { GraficoBarras, GraficoCajas } from "./Graficos.jsx";
import SelectorDeVariable from "./SelectorDeVariable.jsx";
import { MensajeError, Cargando, ETIQUETA_RECOMENDACION, num, pct, dec } from "./Comunes.jsx";

// La distribución de una variable: el histograma con la parte de malos y de
// buenos en cada tramo (formas comparables aunque haya diez buenos por malo)
// y la tasa de malos del tramo; cajas por clase, por recomendación del
// motor y entre las dos mitades del corte (por fecha). "Recortar las
// colas" deja afuera el 1% de cada punta: un saldo enorme aplasta todo lo
// demás contra el cero.

const formato = (v) => (Math.abs(v) >= 1000 ? num(v) : dec(v, 1));

export default function PestanaDistribuciones({ corteId, poblacion }) {
  const { datos, error } = useColumnasDelCorte(corteId, poblacion);
  const [id, setId] = useState(null);
  const [recortar, setRecortar] = useState(false);
  const columna = datos?.columnas.find((c) => c.id === id) ?? datos?.columnas.find((c) => c.tipo === "numero") ?? null;

  const c = useMemo(() => {
    if (!datos || !columna) return null;
    if (columna.tipo === "categoria") {
      // Una categoría no tiene histograma: su frecuencia en cada clase.
      const cats = [...new Set(columna.valores.filter((v) => v !== null).map(String))];
      const totalM = datos.malos.filter((m, i) => m && columna.valores[i] !== null).length;
      const totalB = columna.valores.filter((v) => v !== null).length - totalM;
      const tramos = cats.map((k) => {
        const idx = columna.valores.map((v, i) => [v, i]).filter(([v]) => String(v) === k).map(([, i]) => i);
        const m = idx.filter((i) => datos.malos[i]).length;
        return { desde: k, hasta: k, n: idx.length, malos: m, tasa: m / idx.length, parteMalos: totalM ? m / totalM : 0, parteBuenos: totalB ? (idx.length - m) / totalB : 0 };
      }).sort((a, b) => b.n - a.n);
      return { dist: { tramos, fuera: 0, discreto: true, categorica: true, malos: {}, buenos: {} }, porRecomendacion: [], porMitad: [] };
    }
    const dist = distribucion(columna, datos.malos, { recorte: recortar ? 0.01 : 0 });
    const valores = columna.valores.map(comoNumero);
    const porRecomendacion = ["aprobar", "revisar", "negar", "bloqueado"]
      .map((r) => ({ nombre: ETIQUETA_RECOMENDACION[r], d: descriptivas(valores.filter((_, i) => datos.filas[i].recomendacion === r)) }))
      .filter((g) => g.d.n);
    const orden = datos.filas.map((f, i) => [f.fecha?.getTime() ?? 0, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    const mitad = Math.floor(orden.length / 2);
    const porMitad = [
      { nombre: "Primera mitad", d: descriptivas(orden.slice(0, mitad).map((i) => valores[i])) },
      { nombre: "Segunda mitad", d: descriptivas(orden.slice(mitad).map((i) => valores[i])) },
    ];
    return { dist, porRecomendacion, porMitad };
  }, [datos, columna, recortar]);

  if (error) return <MensajeError mensaje={error} />;
  if (!datos) return <Cargando que="las variables del corte" />;
  if (!columna || !c) return <p className="crediscope-muted">El corte no tiene variables con datos.</p>;
  const { dist } = c;

  return (
    <div>
      <div className="crediscope-card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <SelectorDeVariable columnas={datos.columnas} valor={columna.id} alCambiar={setId} />
        {columna.tipo === "numero" ? (
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={recortar} onChange={(e) => setRecortar(e.target.checked)} /> Recortar las colas (1% de cada punta)
          </label>
        ) : null}
        {dist.fuera ? <span className="crediscope-muted" style={{ fontSize: 13 }}>{num(dist.fuera)} quedan afuera del gráfico</span> : null}
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>{columna.nombre}</h3>
        <GraficoBarras
          categorias={dist.tramos.map((t) => (dist.categorica ? t.desde : columna.tipo === "booleano" ? (t.desde ? "sí" : "no") : dist.discreto || t.desde === t.hasta ? formato(t.desde) : `${formato(t.desde)}–${formato(t.hasta)}`))}
          series={[
            { nombre: "Malos", color: "var(--bad)", valores: dist.tramos.map((t) => t.parteMalos), formato: (v) => pct(v) },
            { nombre: "Buenos", color: "var(--good)", valores: dist.tramos.map((t) => t.parteBuenos), formato: (v) => pct(v) },
          ]}
          y={{ titulo: "Parte de cada clase", formato: (v) => pct(v, 0) }}
          linea={{ nombre: "Tasa de malos del tramo", color: "var(--brand)", valores: dist.tramos.map((t) => (t.n >= 10 ? t.tasa : NaN)) }}
          ejeDerecho={{ titulo: "Tasa de malos", formato: (v) => pct(v, 0) }}
          etiqueta={`Distribución de ${columna.nombre}`}
        />
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          La línea es la tasa de malos de cada tramo (sólo en tramos de 10 personas o más).
          {columna.tipo === "numero" ? ` Mediana de los malos ${formato(dist.malos.mediana ?? 0)}, de los buenos ${formato(dist.buenos.mediana ?? 0)}.` : ""}
        </p>
      </div>

      {columna.tipo === "numero" ? (
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Por clase</h3>
          <GraficoCajas grupos={[{ nombre: "Malos", color: "var(--bad)", d: dist.malos }, { nombre: "Buenos", color: "var(--good)", d: dist.buenos }]} y={{ formato }} />
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Por recomendación del motor</h3>
          <GraficoCajas grupos={c.porRecomendacion} y={{ formato }} />
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Entre las dos mitades del corte</h3>
          <GraficoCajas grupos={c.porMitad} y={{ formato }} />
        </div>
      </div>
      ) : null}
    </div>
  );
}
