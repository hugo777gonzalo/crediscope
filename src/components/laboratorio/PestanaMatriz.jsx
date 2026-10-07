import { Advertencias, Kpi, ETIQUETA_RECOMENDACION, num, pct } from "./Comunes.jsx";
import { NO_IMPAGO } from "../../lib/analisisProfundo.js";

// Matriz de confusión y desempeño por decisión (docs/laboratorio-pantallas.md,
// 4.3 y 4.5). Lo cuenta lab_contar_matriz() y los intervalos los pone
// resultadosDelCorte.js.
//
// No es una matriz de 2 × 2: el motor recomienda aprobar, revisar o negar.
// Las medidas de clasificación se leen como decidió el negocio el 2026-10-06:
// negar (y el bloqueo) es "impago"; aprobar y revisar, "no impago". Hasta la
// 110 había una segunda lectura (negar o revisar) que contradecía esa
// decisión. La exactitud va al final de la lista: con pocos malos, decir que
// todos pagan acierta casi siempre.

const MEDIDAS = [
  ["sensibilidad", "Sensibilidad", "De los que cayeron, cuántos marcó"],
  ["precision", "Precisión", "De los que marcó, cuántos cayeron"],
  ["especificidad", "Especificidad", "De los que pagaron, cuántos dejó pasar"],
  ["f1", "F1", "Equilibrio entre precisión y sensibilidad"],
  ["tasa_aprobacion", "Aprobación", "Lo que el motor deja pasar"],
  ["tasa_default_aprobados", "Impago de lo aprobado", "Entre lo que deja pasar"],
  ["exactitud", "Exactitud", "Aciertos sobre el total (engaña con pocos malos)"],
];

export default function PestanaMatriz({ resultado }) {
  if (!resultado) return <p className="crediscope-muted">Todavía no se calculó.</p>;
  const r = resultado.resultado;
  const columnas = r.matriz ?? [];
  const total = (campo) => columnas.reduce((s, c) => s + Number(c[campo] ?? 0), 0);

  return (
    <div>
      <Advertencias lista={r.advertencias} />

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Lo que recomendó el motor contra lo que pasó</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Sólo los créditos que la institución desembolsó: de los demás, el archivo no dice nada. {num(r.n)} operaciones, {num(r.n_malos)} malos.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Resultado</th>
                {columnas.map((c) => (
                  <th key={c.recomendacion} style={{ textAlign: "right" }}>{ETIQUETA_RECOMENDACION[c.recomendacion] ?? c.recomendacion}</th>
                ))}
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Cayó</strong></td>
                {columnas.map((c) => (
                  <td key={c.recomendacion} style={{ textAlign: "right", color: NO_IMPAGO.includes(c.recomendacion) ? "var(--bad)" : undefined, fontWeight: NO_IMPAGO.includes(c.recomendacion) ? 700 : undefined }}>
                    {num(c.cayeron)}
                  </td>
                ))}
                <td style={{ textAlign: "right" }}>{num(total("cayeron"))}</td>
              </tr>
              <tr>
                <td><strong>Pagó</strong></td>
                {columnas.map((c) => (
                  <td key={c.recomendacion} style={{ textAlign: "right", color: c.recomendacion === "negar" ? "var(--warn)" : undefined, fontWeight: c.recomendacion === "negar" ? 700 : undefined }}>
                    {num(c.pagaron)}
                  </td>
                ))}
                <td style={{ textAlign: "right" }}>{num(total("pagaron"))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          En rojo, los aprobados que cayeron (capital perdido); revisar también es "no impago" y cuenta igual. En amarillo, los negados que la
          institución financió igual y pagaron (negocio que el motor habría perdido).
        </p>
      </div>

      {(r.medidas ?? []).map((m) => (
        <div className="crediscope-card" key={m.lectura}>
          <h3 style={{ marginTop: 0 }}>{m.texto}</h3>
          <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
            Cayó y lo marcó: {num(m.cayo_y_lo_marco)} · cayó y no lo marcó: {num(m.cayo_y_no_lo_marco)} · pagó y lo marcó: {num(m.pago_y_lo_marco)} ·
            pagó y no lo marcó: {num(m.pago_y_no_lo_marco)}
          </p>
          <div className="crediscope-kpi-grid">
            {MEDIDAS.map(([clave, etiqueta, detalle]) => (
              <Kpi key={clave} etiqueta={etiqueta} valor={pct(m[clave])} detalle={detalle} />
            ))}
          </div>
        </div>
      ))}

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Cada decisión por separado</h3>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Recomendación</th>
              <th style={{ textAlign: "right" }}>Operaciones</th>
              <th style={{ textAlign: "right" }}>Malos</th>
              <th style={{ textAlign: "right" }}>Tasa</th>
              <th style={{ textAlign: "right" }}>Intervalo 95%</th>
              <th style={{ textAlign: "right" }} title="Llegaron a 15 días de atraso o más en el primer año sin caer, aunque se pusieran al día">En observación</th>
              <th style={{ textAlign: "right" }}>Puntaje mediano malos / buenos</th>
              <th style={{ textAlign: "right" }}>Con ingreso sin confirmar (malos)</th>
            </tr>
          </thead>
          <tbody>
            {(r.por_decision ?? []).map((d) => (
              <tr key={d.recomendacion}>
                <td>{ETIQUETA_RECOMENDACION[d.recomendacion] ?? d.recomendacion}</td>
                <td style={{ textAlign: "right" }}>{num(d.n)}</td>
                <td style={{ textAlign: "right" }}>{num(d.malos)}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(d.tasa)}</td>
                <td style={{ textAlign: "right" }} className="crediscope-muted">{pct(d.intervalo?.[0])} a {pct(d.intervalo?.[1])}</td>
                <td style={{ textAlign: "right" }}>{d.en_observacion === undefined ? "—" : num(d.en_observacion)}</td>
                <td style={{ textAlign: "right" }}>{num(d.puntaje_mediano_malos)} / {num(d.puntaje_mediano_buenos)}</td>
                <td style={{ textAlign: "right" }}>{num(d.ingreso_sin_confirmar)} ({num(d.malos_ingreso_sin_confirmar)})</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.negados_sin_credito ? (
          <p style={{ fontSize: 13.5, marginBottom: 0 }}>
            <strong>Negados que no recibieron el crédito:</strong> {num(r.negados_sin_credito.n)}. Se pudo observar a {num(r.negados_sin_credito.observados)} en
            la reconsulta (tuvieron crédito con alguien) y {num(r.negados_sin_credito.cayeron_con_otro)} cayeron. Su detalle está en "Con y sin crédito".
          </p>
        ) : (
          <p className="crediscope-muted" style={{ fontSize: 13, marginBottom: 0 }}>
            De los negados que no recibieron el crédito el archivo no dice nada: hace falta reconsultarlos (corte con solicitudes).
          </p>
        )}
      </div>
    </div>
  );
}
