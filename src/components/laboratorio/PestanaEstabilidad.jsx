import { useEffect, useMemo, useState } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { getFilasDelCorte, getCatalogoUnaVez } from "../../lib/datosDelCorte.js";
import { psiDeVariables } from "../../lib/analisisRetrospectivo.js";
import { getResultados } from "../../lib/laboratorio.js";
import { calcularEstabilidad } from "../../lib/calculosDelCorte.js";
import { formatearFechaHora } from "../../lib/fechas.js";
import { GraficoBarras, GraficoLineas } from "./Graficos.jsx";
import { MensajeError, Cargando, Etiqueta, GuardarEsteResultado, num, pct, dec } from "./Comunes.jsx";

// Estabilidad: ¿la población de este corte se parece a la de otro? PSI del
// puntaje (se calcula en el navegador y se guarda en este corte, desde la
// 111; antes lo hacía la base) y de cada variable (con los tramos del corte
// base; se guarda con un botón). Menos de 0,1,
// estable; hasta 0,25, mirar; más, la población cambió y los números del
// otro corte no se trasladan a este. Y la evolución de AUC, KS y tasa de
// malos entre todos los cortes.

const nivel = (v) => (v === null || v === undefined ? null : v < 0.1 ? ["estable", "var(--good)"] : v < 0.25 ? ["mirar", "var(--warn)"] : ["cambió", "var(--bad)"]);

export default function PestanaEstabilidad({ corte, corteId, cortes, poblacion, resultados, recargar }) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const otros = cortes.filter((c) => c.id !== corteId);
  const [baseId, setBaseId] = useState(otros[0]?.id ?? null);
  const [filasBase, setFilasBase] = useState(null);
  const [catalogo, setCatalogo] = useState([]);
  const [evolucion, setEvolucion] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    getCatalogoUnaVez().then(setCatalogo).catch(() => setCatalogo([]));
    // El último desempeño guardado de cada corte, en orden de congelado.
    Promise.all(cortes.map((c) => getResultados(c.id).then((rs) => ({ corte: c, desempeno: rs.find((r) => r.tipo === "desempeno") ?? null }))))
      .then(setEvolucion)
      .catch(() => setEvolucion([]));
  }, [cortes]);

  useEffect(() => {
    if (!baseId) return undefined;
    let vigente = true;
    const otro = cortes.find((c) => c.id === baseId);
    getFilasDelCorte(baseId, poblacion === "solicitudes" && otro?.resumen?.solicitudes ? "solicitudes" : "operaciones")
      .then((f) => vigente && setFilasBase({ id: baseId, filas: f }))
      .catch((e) => vigente && setMensaje(e.message));
    return () => {
      vigente = false;
    };
  }, [baseId, cortes, poblacion]);

  // PSI de cada variable con los tramos del corte base.
  const variables = useMemo(() => (filas && filasBase?.id === baseId && catalogo.length ? psiDeVariables(filasBase.filas, filas, catalogo) : null), [filas, filasBase, baseId, catalogo]);

  const [abierta, setAbierta] = useState(null);
  if (error) return <MensajeError mensaje={error} />;
  if (!filas) return <Cargando />;
  const guardados = resultados.filter((r) => r.tipo === "estabilidad");
  const ultimo = guardados.find((r) => r.metodologia?.base === baseId) ?? null;

  async function calcularPsiDelPuntaje() {
    setCalculando(true);
    setMensaje(null);
    try {
      await calcularEstabilidad(baseId, corteId);
      await recargar();
    } catch (e) {
      setMensaje(e.message);
    } finally {
      setCalculando(false);
    }
  }

  const evol = (evolucion ?? []).filter((e) => e.desempeno).sort((a, b) => new Date(a.corte.congelado_en) - new Date(b.corte.congelado_en));

  return (
    <div>
      {!otros.length ? (
        <p className="crediscope-muted">Hace falta otro corte para comparar poblaciones.</p>
      ) : (
        <>
          <div className="crediscope-card">
            <label className="crediscope-muted" style={{ fontSize: 13 }}>
              Comparar contra el corte{" "}
              <select value={baseId ?? ""} onChange={(e) => setBaseId(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
                {otros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <p className="crediscope-muted" style={{ fontSize: 13, marginBottom: 0 }}>
              El corte elegido es la base; «{corte.nombre}» es el nuevo. PSI: menos de 0,1 estable · hasta 0,25 mirar · más, la población cambió.
            </p>
          </div>
          <MensajeError mensaje={mensaje} />

          <div className="crediscope-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>PSI del puntaje</h3>
              <button className="crediscope-btn" onClick={calcularPsiDelPuntaje} disabled={calculando || !baseId}>{calculando ? "Calculando..." : ultimo ? "Recalcular" : "Calcular"}</button>
            </div>
            {ultimo ? (
              <>
                <p style={{ fontSize: 14 }}>
                  PSI <strong>{dec(ultimo.resultado.psi, 4)}</strong> <Etiqueta texto={nivel(ultimo.resultado.psi)[0]} color={nivel(ultimo.resultado.psi)[1]} />{" "}
                  <span className="crediscope-muted" style={{ fontSize: 12.5 }}>calculado el {formatearFechaHora(ultimo.created_at)}, tramos de a 100 puntos</span>
                </p>
                <GraficoBarras
                  categorias={ultimo.resultado.tramos.map((t) => `${t.desde}-${t.desde + 99}`)}
                  series={[
                    { nombre: "Base", color: "var(--text-muted)", valores: ultimo.resultado.tramos.map((t) => Number(t.base)), formato: (v) => pct(v) },
                    { nombre: "Este corte", color: "var(--brand)", valores: ultimo.resultado.tramos.map((t) => Number(t.nuevo)), formato: (v) => pct(v) },
                  ]}
                  y={{ titulo: "Parte de la población", formato: (v) => pct(v, 0) }}
                  alto={240}
                  etiqueta="Distribución del puntaje en los dos cortes"
                />
              </>
            ) : (
              <p className="crediscope-muted" style={{ marginBottom: 0 }}>Todavía no se calculó contra este corte.</p>
            )}
          </div>

          <div className="crediscope-card">
            <h3 style={{ marginTop: 0 }}>PSI de cada variable</h3>
            {!variables ? (
              <Cargando que="el corte base" />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <GuardarEsteResultado
                  corteId={corteId} tipo="estabilidad_variables" poblacion={poblacion} parametros={{ base: baseId }}
                  resultado={{ base: baseId, variables }} texto="Guardar el PSI de las variables"
                />
                <table className="crediscope-table">
                  <thead>
                    <tr>
                      <th>Variable</th>
                      <th style={{ textAlign: "right" }}>PSI</th>
                      <th>Lectura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variables.map((v) => (
                      <FilaVariable key={v.id} v={v} abierta={abierta === v.id} alternar={() => setAbierta(abierta === v.id ? null : v.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Evolución entre cortes</h3>
        {evolucion === null ? (
          <Cargando que="los resultados de cada corte" />
        ) : evol.length < 2 ? (
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>
            Con {evol.length} corte(s) con desempeño calculado no hay evolución que mostrar. Cada corte nuevo (cada cosecha que madura) suma un punto.
          </p>
        ) : (
          <GraficoLineas
            series={[
              { nombre: "AUC", puntos: evol.map((e, i) => ({ x: i + 1, y: Number(e.desempeno.resultado.auc), titulo: `${e.corte.nombre}: AUC ${dec(e.desempeno.resultado.auc, 3)}` })) },
              { nombre: "KS", color: "var(--warn)", puntos: evol.map((e, i) => ({ x: i + 1, y: Number(e.desempeno.resultado.ks), titulo: `${e.corte.nombre}: KS ${dec(e.desempeno.resultado.ks, 3)}` })) },
              { nombre: "Tasa de malos", color: "var(--bad)", puntos: evol.map((e, i) => ({ x: i + 1, y: Number(e.desempeno.resultado.n_malos) / Number(e.desempeno.resultado.n), titulo: `${e.corte.nombre}: ${pct(Number(e.desempeno.resultado.n_malos) / Number(e.desempeno.resultado.n))} de malos` })) },
            ]}
            x={{ titulo: "Cortes, del más viejo al más nuevo", formato: (v) => `${v}.º` }}
            y={{ min: 0, max: 1, formato: (v) => dec(v, 2) }}
            etiqueta="Evolución entre cortes"
          />
        )}
        {evol.length ? (
          <table className="crediscope-table">
            <tbody>
              {evol.map((e, i) => (
                <tr key={e.corte.id}>
                  <td>{i + 1}.º {e.corte.nombre}</td>
                  <td style={{ textAlign: "right" }}>AUC {dec(e.desempeno.resultado.auc, 3)}</td>
                  <td style={{ textAlign: "right" }}>KS {dec(e.desempeno.resultado.ks, 3)}</td>
                  <td style={{ textAlign: "right" }}>{num(e.desempeno.n)} operaciones · {num(e.desempeno.n_malos)} malos</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

function FilaVariable({ v, abierta, alternar }) {
  const [texto, color] = nivel(v.psi);
  return (
    <>
      <tr onClick={alternar} style={{ cursor: "pointer" }}>
        <td>
          <strong>{v.nombre}</strong>
          <div className="crediscope-muted" style={{ fontSize: 12 }}>{v.grupo}</div>
        </td>
        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{dec(v.psi, 4)}</td>
        <td><Etiqueta texto={texto} color={color} /></td>
      </tr>
      {abierta ? (
        <tr>
          <td colSpan={3} style={{ background: "var(--panel-muted)" }}>
            <table className="crediscope-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Tramo</th>
                  <th style={{ textAlign: "right" }}>Base</th>
                  <th style={{ textAlign: "right" }}>Este corte</th>
                </tr>
              </thead>
              <tbody>
                {v.tramos.map((t) => (
                  <tr key={t.tramo}>
                    <td>{t.tramo}</td>
                    <td style={{ textAlign: "right" }}>{pct(t.base)}</td>
                    <td style={{ textAlign: "right" }}>{pct(t.nuevo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}
