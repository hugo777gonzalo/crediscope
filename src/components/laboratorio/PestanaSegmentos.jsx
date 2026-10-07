import { useMemo, useState } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { segmentar, DIMENSIONES, MIN_PERSONAS_SEGMENTO, MIN_MALOS_SEGMENTO } from "../../lib/analisisRetrospectivo.js";
import { GraficoBarras } from "./Graficos.jsx";
import { MensajeError, Cargando, SinGuardar, ETIQUETA_RECOMENDACION, num, pct, dec } from "./Comunes.jsx";
import { useGuardarResultado } from "../../lib/useGuardarResultado.js";

// Desempeño por segmento: ¿el motor funciona igual para todos? Un segmento
// con menos de 50 personas o menos de 10 malos se muestra, pero su tasa y su
// AUC no alcanzan para concluir (se marcan). La edad y el género son
// variables protegidas: se miran para vigilar un trato distinto, nunca para
// proponer usarlas.

const MIN_PERSONAS = MIN_PERSONAS_SEGMENTO, MIN_MALOS = MIN_MALOS_SEGMENTO;

export default function PestanaSegmentos({ corteId, poblacion }) {
  // La recomendación y la decisión se guardan como clave; en pantalla, en palabras.
  const nombreDe = (n) => ETIQUETA_RECOMENDACION[n] ?? n;
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const [dimension, setDimension] = useState("producto");
  const d = DIMENSIONES[dimension];

  const c = useMemo(() => (filas ? segmentar(filas, dimension) : null), [filas, dimension]);
  const sinGuardar = useGuardarResultado({ corteId, tipo: "segmentos", poblacion, parametros: { dimension }, resultado: c });

  if (error) return <MensajeError mensaje={error} />;
  if (!c) return <Cargando />;
  const opciones = Object.entries(DIMENSIONES).filter(([, x]) => !x.soloSolicitudes || poblacion === "solicitudes");

  return (
    <div>
      <SinGuardar error={sinGuardar} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <span className="crediscope-muted" style={{ fontSize: 13 }}>Segmentar por</span>
        <select value={dimension} onChange={(e) => setDimension(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
          {opciones.map(([clave, x]) => <option key={clave} value={clave}>{x.texto}</option>)}
        </select>
      </div>
      {d.protegida ? (
        <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
          <p style={{ margin: 0, fontSize: 13.5 }}>Variable protegida: el negocio decidió que no pese en la decisión. Se mira sólo para vigilar que el motor no trate distinto a un grupo.</p>
        </div>
      ) : null}

      <div className="crediscope-card">
        <GraficoBarras
          categorias={c.segmentos.map((s) => nombreDe(s.nombre))}
          series={[{ nombre: "Tasa de malos", color: "var(--brand)", valores: c.segmentos.map((s) => s.tasa), formato: (v) => pct(v) }]}
          y={{ titulo: "Tasa de malos", formato: (v) => pct(v, 0) }}
          alto={260}
          etiqueta="Tasa de malos por segmento"
        />
        {c.prueba ? (
          <p className="crediscope-muted" style={{ fontSize: 13 }}>
            ¿La tasa cambia entre segmentos más de lo que da el azar? Chi² {dec(c.prueba.chi2, 2)} con {c.prueba.gl} grados de libertad, p = {dec(c.prueba.p, 4)}, V de Cramér {dec(c.prueba.v, 3)}
            {c.prueba.celdasChicas ? ` (${c.prueba.celdasChicas} celdas esperan menos de 5: tomarlo con cuidado)` : ""}.
          </p>
        ) : null}
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Segmento</th>
                <th style={{ textAlign: "right" }}>Personas</th>
                <th style={{ textAlign: "right" }}>Malos</th>
                <th style={{ textAlign: "right" }}>Tasa</th>
                <th style={{ textAlign: "right" }}>Intervalo</th>
                <th style={{ textAlign: "right" }}>AUC del motor</th>
              </tr>
            </thead>
            <tbody>
              {c.segmentos.map((s) => (
                <tr key={s.nombre} style={{ color: s.chico ? "var(--text-muted)" : undefined }}>
                  <td>{nombreDe(s.nombre)}{s.chico ? <span className="crediscope-muted" style={{ fontSize: 12 }}> · pocos casos</span> : null}</td>
                  <td style={{ textAlign: "right" }}>{num(s.n)}</td>
                  <td style={{ textAlign: "right" }}>{num(s.malos)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(s.tasa)}</td>
                  <td style={{ textAlign: "right" }} className="crediscope-muted">{s.ic ? `${pct(s.ic[0])} a ${pct(s.ic[1])}` : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {s.auc.auc !== null && s.auc.malos >= MIN_MALOS && s.auc.buenos >= MIN_MALOS ? `${dec(s.auc.auc, 3)} (${dec(s.auc.ic[0], 2)} a ${dec(s.auc.ic[1], 2)})` : <span className="crediscope-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Tasa de malos de todo el corte: {pct(c.tasaTotal)}. "Pocos casos": menos de {MIN_PERSONAS} personas o de {MIN_MALOS} malos. El AUC de un segmento
          sólo se muestra con {MIN_MALOS} malos y {MIN_MALOS} buenos o más.
        </p>
      </div>
    </div>
  );
}
