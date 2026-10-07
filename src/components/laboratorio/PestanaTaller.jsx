import { useEffect, useMemo, useState } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { getCatalogoUnaVez } from "../../lib/datosDelCorte.js";
import { probarFormula } from "../../lib/analisisProfundo.js";
import { crearCandidata } from "../../lib/laboratorio.js";
import { GraficoBarras } from "./Graficos.jsx";
import { MensajeError, Cargando, GuardarEsteResultado, Etiqueta, num, pct, dec } from "./Comunes.jsx";

// Taller de variables (módulo 6 del negocio): una variable nueva hecha con
// las del perfil (razones, conteos, indicadores, interacciones), probada en
// el corte con el mismo IV que las del catálogo, y registrada como candidata
// con su definición, su fórmula, su fuente y desde cuándo existe el dato.
// La fórmula se interpreta (nunca se ejecuta como código).

const EJEMPLOS = [
  ["Aportó en parte de los últimos 24 meses", "meses_con_aporte_24 > 0 y meses_con_aporte_24 < 24"],
  ["Deuda en atraso sobre el ingreso", "deuda_en_atraso / max(ingreso_reportado_iess, 1)"],
  ["Operaciones en bancos y cooperativas", "operaciones_bancos + operaciones_cooperativas"],
  ["Con demandas de cobro y deuda en atraso", "demandas_de_cobro > 0 y deuda_en_atraso > 0"],
];
const fuerza = (iv) => (iv < 0.02 ? ["nada", "var(--text-muted)"] : iv < 0.1 ? ["débil", "var(--brand)"] : iv < 0.3 ? ["media", "var(--warn)"] : ["fuerte", "var(--bad)"]);

export default function PestanaTaller({ corte, corteId, poblacion }) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const [catalogo, setCatalogo] = useState(null);
  const [formula, setFormula] = useState(EJEMPLOS[0][1]);
  const [nombre, setNombre] = useState(EJEMPLOS[0][0]);
  const [disponible, setDisponible] = useState("");
  const [mensaje, setMensaje] = useState(null);
  useEffect(() => {
    getCatalogoUnaVez().then(setCatalogo).catch(() => setCatalogo([]));
  }, []);

  const r = useMemo(() => {
    if (!filas || !catalogo || !formula.trim()) return null;
    try {
      return probarFormula(filas, catalogo, formula);
    } catch (e) {
      return { error: e.message };
    }
  }, [filas, catalogo, formula]);

  if (error) return <MensajeError mensaje={error} />;
  if (!filas || !catalogo) return <Cargando />;

  async function registrar() {
    setMensaje(null);
    try {
      await crearCandidata({
        nombre, definicion: `${nombre}: ${formula}`, origen: "taller", formula, fuente: `perfil (derivada de ${r.usadas.join(", ")})`,
        disponible_desde: disponible || null, corte_id: corteId,
        evidencia: { iv: r.iv.iv, iv_primera_mitad: r.iv.primera.iv, iv_segunda_mitad: r.iv.segunda.iv, cobertura: r.cobertura, n: r.n, poblacion, corte: corte.nombre, sintetico: corte.es_sintetico },
      });
      setMensaje("Registrada como candidata (pestaña Registro de candidatas).");
    } catch (e) {
      setMensaje(e.message);
    }
  }

  const [textoFuerza, color] = r && !r.error ? fuerza(r.iv.iv) : [null, null];
  return (
    <div>
      <div className="crediscope-card">
        <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}>
          Nombre
          <input className="crediscope-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label style={{ display: "block", fontSize: 13 }}>
          Fórmula
          <input className="crediscope-input" value={formula} onChange={(e) => setFormula(e.target.value)} style={{ fontFamily: "ui-monospace, Consolas, monospace" }} />
        </label>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
          Variables por su nombre interno; + − * /; comparaciones &gt; &lt; &gt;= &lt;= = &lt;&gt;; «y», «o», «no»; min, max, abs, log, raiz, si(condición, a, b), falta(x).
          Decimales con punto. Un faltante en la cuenta da faltante.
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {EJEMPLOS.map(([n, f]) => (
            <button key={n} className="crediscope-btn crediscope-btn-ghost" style={{ fontSize: 12.5 }} onClick={() => { setNombre(n); setFormula(f); }}>{n}</button>
          ))}
        </div>
        <details style={{ marginTop: 8 }}>
          <summary className="crediscope-muted" style={{ cursor: "pointer", fontSize: 13 }}>Las {catalogo.length} variables</summary>
          <p style={{ fontSize: 12.5 }}>{catalogo.map((v) => <code key={v.id} title={v.nombre} style={{ marginRight: 8, cursor: "pointer" }} onClick={() => setFormula((f) => `${f} ${v.id}`)}>{v.id}</code>)}</p>
        </details>
      </div>

      {!r ? null : r.error ? (
        <MensajeError mensaje={r.error} />
      ) : (
        <div className="crediscope-card">
          <p style={{ marginTop: 0 }}>
            {r.tipo === "booleano" ? "Sí/no" : "Numérica"} · cobertura {pct(r.cobertura, 0)} de {num(r.n)} · IV <strong>{dec(r.iv.iv, 3)}</strong> <Etiqueta texto={textoFuerza} color={color} /> ·
            mitades {dec(r.iv.primera.iv, 3)} y {dec(r.iv.segunda.iv, 3)}
            {(r.iv.primera.iv >= 0.02) !== (r.iv.segunda.iv >= 0.02) ? <strong style={{ color: "var(--warn)" }}> · inestable</strong> : null}
          </p>
          <GuardarEsteResultado
            corteId={corteId} tipo="taller" poblacion={poblacion} parametros={{ formula }}
            resultado={{
              nombre, formula, usadas: r.usadas, tipo: r.tipo, cobertura: r.cobertura, n: r.n, n_malos: r.iv.malos, iv: r.iv.iv, primera: r.iv.primera.iv, segunda: r.iv.segunda.iv,
              tramos: r.iv.tramos.map((t, i) => ({ tramo: r.iv.etiquetas[i], n: t.n, malos: t.malos, tasa: t.tasa, woe: t.woe })),
            }}
            texto="Guardar esta variable derivada"
          />
          <GraficoBarras
            categorias={r.iv.etiquetas}
            series={[{ nombre: "Tasa de malos", color: "var(--brand)", valores: r.iv.tramos.map((t) => t.tasa), formato: (v) => pct(v) }]}
            y={{ titulo: "Tasa de malos", formato: (v) => pct(v, 0) }}
            alto={220}
            etiqueta="Tasa de malos por tramo de la variable derivada"
          />
          <table className="crediscope-table">
            <tbody>
              {r.iv.tramos.map((t, i) => (
                <tr key={r.iv.etiquetas[i]}>
                  <td>{r.iv.etiquetas[i]}</td>
                  <td style={{ textAlign: "right" }}>{num(t.n)} personas</td>
                  <td style={{ textAlign: "right" }}>{num(t.malos)} malos</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(t.tasa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>
              Disponible desde (cuándo empezó a existir el dato)
              <input type="date" className="crediscope-input" value={disponible} onChange={(e) => setDisponible(e.target.value)} />
            </label>
            <button className="crediscope-btn" onClick={registrar}>Registrar como candidata</button>
            {mensaje ? <span className="crediscope-muted" style={{ fontSize: 13 }}>{mensaje}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
