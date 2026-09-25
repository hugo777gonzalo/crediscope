import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, ShieldQuestion, Building2, FileWarning } from "lucide-react";
import { getResumenCarteraIngresos } from "../lib/api.js";
import { ETIQUETA_PERFIL_LABORAL } from "../../supabase/functions/_shared/perfil-laboral.ts";
import {
  ETIQUETA_SEGMENTO,
  ETIQUETA_ESTADO,
  ETIQUETA_EVIDENCIA,
  RIESGO_SEGMENTO,
  formatMoneda,
} from "../lib/fuentesIngresoConsolidado.js";

// Panorama de fuentes de ingreso sobre toda la cartera consultada.
//
// La clasificación NO se calcula acá: la produce fuentes-ingreso.ts al
// generar cada Perfil del Cliente y viaja dentro del perfil. Esta
// pantalla solo muestra lo que cuenta la base (resumen_fuentes_ingreso,
// migración 081) — así lo que ve la jefatura es exactamente lo que se
// guardó de cada cliente, no un recálculo que podría diferir. Hasta la
// 081 contaba en el navegador sobre 1.000 perfiles de 3.303.

const COLOR_ESTADO = { confirmada: "var(--good)", provisional: "var(--warn)", indeterminada: "var(--text-muted)" };

function Kpi({ Icono, etiqueta, valor, detalle }) {
  return (
    <div className="crediscope-card crediscope-kpi">
      <p className="crediscope-kpi-label">
        <Icono size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
        {etiqueta}
      </p>
      <p className="crediscope-kpi-valor">{valor}</p>
      {detalle ? <p className="crediscope-kpi-detalle">{detalle}</p> : null}
    </div>
  );
}

// La barra enlaza al listado filtrado: el primer reflejo de quien ve
// "135 independientes" es querer saber quiénes son.
function Barra({ etiqueta, n, pct, color, ayuda, enlace }) {
  const contenido = (
    <>
      <span className="crediscope-barrapct-label">{enlace ? <Link to={enlace}>{etiqueta}</Link> : etiqueta}</span>
      <div className="crediscope-barrapct-track">
        <div className="crediscope-barrapct-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="crediscope-barrapct-valor">
        {pct}% <span className="crediscope-muted">({n})</span>
      </span>
    </>
  );
  return (
    <div className="crediscope-barrapct-row" title={ayuda}>
      {contenido}
    </div>
  );
}

export default function FuentesIngreso() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getResumenCarteraIngresos()
      .then(setD)
      .catch((err) => setError(err.message));
  }, []);

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );
  if (!d) return <p className="crediscope-muted">Cargando...</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Fuentes de Ingreso</h2>
          <p className="crediscope-muted" style={{ margin: 0 }}>
            De qué vive cada cliente consultado y qué tan evidenciado está. Los segmentos no describen de dónde viene la plata,
            sino cómo puede fallar esa fuente.
          </p>
        </div>
        <Link className="crediscope-btn crediscope-btn-ghost" to="/fuentes/reglas">
          Ver reglas de clasificación
        </Link>
      </div>

      {d.total === 0 ? (
        <div className="crediscope-card">
          <p style={{ margin: 0 }}>Todavía no hay clientes clasificados.</p>
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>
            La clasificación se calcula al generar el Perfil del Cliente. Los {d.sinClasificar} perfiles ya guardados son
            anteriores al módulo y no se pueden reclasificar sin volver a consultar la fuente: el dato crudo de origen no se
            almacena. Se irán clasificando a medida que se consulten clientes.
          </p>
        </div>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi Icono={Users} etiqueta="Clientes clasificados" valor={d.total} detalle={d.sinClasificar ? `${d.sinClasificar} perfiles previos al módulo, sin clasificar` : null} />
            <Kpi
              Icono={ShieldQuestion}
              etiqueta="Con ingreso reportado al IESS"
              valor={d.conPiso}
              detalle={d.pisoPromedio ? `Promedio reportado: ${formatMoneda(d.pisoPromedio)}` : null}
            />
            <Kpi
              Icono={Building2}
              etiqueta="Pagan nómina"
              valor={d.conNomina}
              detalle={d.nominaTotal ? `${formatMoneda(d.nominaTotal)} mensuales en total` : null}
            />
            <Kpi
              Icono={FileWarning}
              etiqueta="Fuera del último corte"
              valor={d.desvinculados}
              detalle="No aparecen en el corte más reciente del IESS"
            />
          </div>

          <div className="crediscope-reportes-grid">
            <div className="crediscope-card">
              <h3>Cómo está agrupada la cartera</h3>
              <p className="crediscope-muted" style={{ marginTop: 0 }}>Pasá el mouse sobre cada fila para ver cómo falla esa fuente.</p>
              {d.segmentos.map((s) => (
                <Barra
                  key={s.clave}
                  etiqueta={ETIQUETA_SEGMENTO[s.clave] ?? s.clave}
                  n={s.n}
                  pct={s.pct}
                  color="var(--brand)"
                  ayuda={RIESGO_SEGMENTO[s.clave]}
                  enlace={`/fuentes/clientes?segmento=${s.clave}`}
                />
              ))}
            </div>

            <div className="crediscope-card">
              <h3>Qué tan firme es cada clasificación</h3>
              <p className="crediscope-muted" style={{ marginTop: 0 }}>
                Confirmada es cuando un tercero declara y paga sobre esa base. Provisional, cuando el monto lo puso la propia
                persona o no existe.
              </p>
              {d.estados.map((e) => (
                <Barra key={e.clave} etiqueta={ETIQUETA_ESTADO[e.clave] ?? e.clave} n={e.n} pct={e.pct} color={COLOR_ESTADO[e.clave]} enlace={`/fuentes/clientes?estado=${e.clave}`} />
              ))}

              <h3 style={{ marginTop: 20 }}>Calidad de la evidencia</h3>
              <table className="crediscope-table">
                <tbody>
                  {d.evidencias.map((ev) => (
                    <tr key={ev.clave}>
                      <td>{ETIQUETA_EVIDENCIA[ev.clave] ?? ev.clave}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{ev.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
                Cuenta fuentes, no personas: alguien con dos empleos aporta dos.
              </p>
            </div>
          </div>

          {/* El perfil laboral (migración 085) mira dos preguntas por
              separado: ¿trabaja para un tercero? ¿tiene actividad propia?
              Un cuarto de la cartera responde que sí a las dos, y el
              segmento -- que sigue a la fuente con monto -- no lo muestra. */}
          <div className="crediscope-reportes-grid">
            <div className="crediscope-card">
              <h3>Perfil laboral de la cartera</h3>
              <p className="crediscope-muted" style={{ marginTop: 0 }}>
                Dependiente: trabaja para un tercero. Actividad propia: RUC activo o paga nómina. Una persona puede ser las dos cosas.
              </p>
              {(d.perfilesLaborales ?? []).map((p) => (
                <Barra
                  key={p.clave}
                  etiqueta={ETIQUETA_PERFIL_LABORAL[p.clave] ?? (p.clave === "sin_calcular" ? "Sin calcular" : p.clave)}
                  n={p.n}
                  pct={p.pct}
                  color="var(--brand)"
                />
              ))}
            </div>

            <div className="crediscope-card">
              <h3>Dependientes con actividad propia, por segmento</h3>
              <p className="crediscope-muted" style={{ marginTop: 0 }}>
                El segmento los muestra por su empleo, que es lo que trae monto. Acá se ve cuántos de cada segmento tienen además un
                negocio o ejercen por su cuenta.
              </p>
              <table className="crediscope-table">
                <tbody>
                  {(d.dependientesConActividadPorSegmento ?? []).map((s) => (
                    <tr key={s.clave}>
                      <td>{ETIQUETA_SEGMENTO[s.clave] ?? s.clave}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{s.n.toLocaleString("es-EC")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="crediscope-card">
            <h3>Clientes que necesitan respaldo ({d.requierenRespaldoTotal.toLocaleString("es-EC")})</h3>
            <p className="crediscope-muted" style={{ marginTop: 0 }}>
              Su segmento no está confirmado. Acá está qué pedirles para confirmarlo.
              {/* Antes el título decía el total y la tabla cortaba en 40
                  sin avisar. Ahora se dice cuántos se ven y dónde están
                  los demás. */}
              {d.requierenRespaldoTotal > d.requierenRespaldo.length ? (
                <>
                  {" "}
                  Se muestran los {d.requierenRespaldo.length} más recientes; el resto está en{" "}
                  <Link to="/fuentes/clientes?estado=provisional">provisionales</Link> e{" "}
                  <Link to="/fuentes/clientes?estado=indeterminada">indeterminados</Link>.
                </>
              ) : null}
            </p>
            {d.requierenRespaldo.length === 0 ? (
              <p className="crediscope-muted" style={{ marginBottom: 0 }}>Ningún cliente pendiente de respaldo.</p>
            ) : (
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Segmento</th>
                    <th>Por qué</th>
                    <th>Qué pedir</th>
                  </tr>
                </thead>
                <tbody>
                  {d.requierenRespaldo.map((r) => (
                    <tr key={r.perfilId}>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>
                        {r.cedula ? <Link to={`/ingresos/${r.cedula}`}>{r.cedula}</Link> : "—"}
                      </td>
                      <td>
                        {ETIQUETA_SEGMENTO[r.segmento] ?? r.segmento}
                        <div className="crediscope-muted" style={{ fontSize: 12 }}>{ETIQUETA_ESTADO[r.estado]}</div>
                      </td>
                      <td style={{ fontSize: 13 }}>{r.motivo}</td>
                      <td style={{ fontSize: 13 }}>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {r.pedir.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
