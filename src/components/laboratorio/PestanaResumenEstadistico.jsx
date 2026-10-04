import { useMemo } from "react";
import { useColumnasDelCorte } from "../../lib/useFilasDelCorte.js";
import { explorarSignificancia, resumenDeVariables, correlaciones } from "../../lib/analisisEstadistico.js";
import { Kpi, MensajeError, Cargando, Etiqueta, num, pct, dec } from "./Comunes.jsx";

// El resumen del Descubrimiento estadístico: cuántas variables hay, de qué
// tipo, con faltantes, cuáles anticipan el impago, cuáles sobran (están
// explicadas por otras) y cuáles son candidatas: asociadas, significativas
// después de la corrección, estables entre las dos mitades del corte y que
// el modelo NO recibe.

export default function PestanaResumenEstadistico({ corteId, poblacion }) {
  const { datos, error } = useColumnasDelCorte(corteId, poblacion);
  const c = useMemo(() => {
    if (!datos) return null;
    const sig = explorarSignificancia(datos);
    const cor = correlaciones(datos, "spearman");
    return { sig, resumen: resumenDeVariables(datos, sig), cor };
  }, [datos]);

  if (error) return <MensajeError mensaje={error} />;
  if (!c) return <Cargando que="las variables del corte" />;
  const { resumen, sig, cor } = c;
  const redundantes = cor.vif.filter((v) => v.vif !== null && v.vif > 10);

  return (
    <div>
      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Variables analizadas" valor={num(resumen.analizadas)} detalle={`${resumen.numericas} numéricas · ${resumen.categoricas} categóricas · ${resumen.siNo} sí/no`} />
        <Kpi etiqueta="Con faltantes" valor={num(resumen.conFaltantes)} detalle={resumen.sinDatos.length ? `${resumen.sinDatos.length} sin ningún dato en este corte` : "Todas tienen algún dato"} />
        <Kpi etiqueta="Con IV de 0,1 o más" valor={num(resumen.ivRelevante)} detalle={`${resumen.significativas} significativas después de la corrección`} />
        <Kpi etiqueta="Redundantes" valor={num(redundantes.length)} detalle={`VIF mayor que 10 · ${cor.pares.length} pares con correlación de 0,7 o más`} />
        <Kpi etiqueta="Candidatas" valor={num(resumen.candidatas.length)} detalle="Fuertes, estables y el modelo no las recibe" color={resumen.candidatas.length ? "var(--bad)" : undefined} />
      </div>

      {resumen.candidatas.length ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <strong>Candidatas a dato nuevo:</strong> {resumen.candidatas.map((s) => `${s.nombre} (IV ${dec(s.iv, 3)})`).join(", ")}. Se validan en un corte posterior
          antes de proponerlas.
        </div>
      ) : null}

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Las que más anticipan el impago</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th style={{ textAlign: "right" }}>IV</th>
                <th style={{ textAlign: "right" }}>Primera mitad</th>
                <th style={{ textAlign: "right" }}>Segunda mitad</th>
                <th style={{ textAlign: "right" }}>q</th>
                <th>El modelo</th>
              </tr>
            </thead>
            <tbody>
              {sig.slice(0, 12).map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.nombre}</strong><div className="crediscope-muted" style={{ fontSize: 12 }}>{s.grupo}</div></td>
                  <td style={{ textAlign: "right" }}>{dec(s.iv, 3)}</td>
                  <td style={{ textAlign: "right" }}>{dec(s.ivPrimera, 3)}</td>
                  <td style={{ textAlign: "right" }}>{dec(s.ivSegunda, 3)}{!s.estable ? <span style={{ color: "var(--warn)" }}> · inestable</span> : null}</td>
                  <td style={{ textAlign: "right" }}>{s.q === null ? "—" : s.q < 0.0001 ? "< 0,0001" : dec(s.q, 4)}</td>
                  <td>{s.uso === "protegida" ? <Etiqueta texto="protegida" color="var(--warn)" /> : s.enModelo ? "La recibe" : <Etiqueta texto="No la recibe" color="var(--bad)" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Las dos mitades son el corte partido por fecha: una variable que sólo anticipa en una mitad es ruido. q es el valor p corregido por
          comparaciones múltiples (Benjamini-Hochberg sobre {num(sig.length)} pruebas). Cobertura media: {pct(sig.reduce((s, x) => s + x.cobertura, 0) / (sig.length || 1), 0)}.
        </p>
      </div>
    </div>
  );
}
