import { useMemo } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { decisionesDeLaInstitucion, DECISIONES } from "../../lib/analisisRetrospectivo.js";
import { MensajeError, Cargando, SinGuardar, ETIQUETA_RECOMENDACION, num, pct } from "./Comunes.jsx";
import { useGuardarResultado } from "../../lib/useGuardarResultado.js";

// Lo que decidió la institución con cada recomendación del motor (101: la
// hoja "Solicitudes no desembolsadas" del archivo). Responde a "¿qué pasa
// con lo que mandamos a revisar?": cuánto terminó desembolsado, negado o
// desistido, y cómo le fue a cada grupo según la reconsulta del buró. Los
// que no recibieron el crédito de la institución sólo se juzgan con la
// evidencia externa (un crédito de otro), nunca se les atribuye una tasa
// sin ella.

export default function PestanaDecisionInstitucion({ corteId }) {
  const { filas, error } = useFilasDelCorte(corteId, "solicitudes");
  const tabla = useMemo(() => (filas ? decisionesDeLaInstitucion(filas) : null), [filas]);
  const paraGuardar = useMemo(() => (tabla ? { tabla } : null), [tabla]);
  const sinGuardar = useGuardarResultado({ corteId, tipo: "decisiones_institucion", poblacion: "solicitudes", resultado: paraGuardar });

  if (error) return <MensajeError mensaje={error} />;
  if (!tabla) return <Cargando />;
  const usadas = DECISIONES.filter((_, j) => tabla.some((x) => x.celdas[j].n));

  return (
    <div>
      <SinGuardar error={sinGuardar} />
      <div className="crediscope-card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Recomendación del motor × decisión de la institución</h3>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Recomendación</th>
              {usadas.map(([d, texto]) => <th key={String(d)} style={{ textAlign: "right" }}>{texto}</th>)}
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {tabla.map((x) => (
              <tr key={x.r}>
                <td>{ETIQUETA_RECOMENDACION[x.r]}</td>
                {usadas.map(([d]) => {
                  const c = x.celdas[DECISIONES.findIndex(([dd]) => dd === d)];
                  return (
                    <td key={String(d)} style={{ textAlign: "right" }}>
                      {num(c.n)} <span className="crediscope-muted" style={{ fontSize: 12 }}>({pct(x.n ? c.n / x.n : null, 0)})</span>
                    </td>
                  );
                })}
                <td style={{ textAlign: "right" }}>{num(x.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="crediscope-card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>¿Cómo le fue a cada grupo?</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Tasa de malos según la reconsulta del buró, entre quienes se pudieron observar (los que tuvieron crédito con alguien). Para quien la
          institución no desembolsó, el resultado sale del crédito de otra institución o de lo que ya tenía.
        </p>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Recomendación</th>
              {usadas.map(([d, texto]) => <th key={String(d)} style={{ textAlign: "right" }}>{texto}</th>)}
            </tr>
          </thead>
          <tbody>
            {tabla.map((x) => (
              <tr key={x.r}>
                <td>{ETIQUETA_RECOMENDACION[x.r]}</td>
                {usadas.map(([d]) => {
                  const c = x.celdas[DECISIONES.findIndex(([dd]) => dd === d)];
                  return (
                    <td key={String(d)} style={{ textAlign: "right" }} title={c.ic ? `entre ${pct(c.ic[0])} y ${pct(c.ic[1])}` : undefined}>
                      {c.observadas ? <><strong>{pct(c.tasa)}</strong> <span className="crediscope-muted" style={{ fontSize: 12 }}>de {num(c.observadas)}</span></> : <span className="crediscope-muted">sin observar</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
