import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign, Activity, Brain } from "lucide-react";
import { getConsumoLlm } from "../lib/api.js";
import { entero, plural } from "../lib/formatos.js";
import { formatearDia } from "../lib/fechas.js";
import Kpi from "../components/ui/Kpi.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import Barra from "../components/ui/Barra.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import {
  agrupar,
  totales,
  promedioMedido,
  soloExitosas,
  ETIQUETA_FUNCION,
  ETIQUETA_NATURALEZA,
  DESCRIPCION_NATURALEZA,
  ETIQUETA_ORIGEN,
  DESCRIPCION_ORIGEN,
  money,
  money2,
  num,
  centavos,
  dia,
} from "../lib/consumoLlm.js";
import Aviso from "../components/ui/Aviso.jsx";

// Panorama del consumo del LLM: cuánto se gastó, en qué y con qué
// confianza está medido.
//
// La pantalla insiste en una distinción que el resto del producto no
// necesita: gasto MEDIDO contra llamadas SIN MEDIR. Las corridas
// anteriores al registro de consumo existieron y se pagaron, pero sus
// tokens se perdieron. Mostrar solo el total medido haría creer que el
// gasto fue menor de lo que fue -- y ese error es justamente el que
// llevó a atribuirle al producto un consumo que no era suyo.

export default function Costos() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    getConsumoLlm({ desde: desde || null, hasta: hasta || null })
      .then(setFilas)
      .catch((err) => setError(err.message));
  }, [desde, hasta]);

  const d = useMemo(() => {
    if (!filas) return null;
    const t = totales(filas);
    // El costo por análisis se promedia solo sobre las que terminaron
    // en un análisis: una llamada que falló no analizó a nadie.
    const analisis = soloExitosas(filas).filter((r) => r.funcion === "analyze-client");
    const ta = totales(analisis);
    return {
      t,
      analisis: ta,
      porAnalisis: promedioMedido(ta),
      porDia: agrupar(filas, (r) => dia(r.created_at)).sort((a, b) => (a.clave < b.clave ? 1 : -1)),
      porNaturaleza: agrupar(filas, (r) => r.naturaleza).sort((a, b) => b.llamadas - a.llamadas),
      porFuncion: agrupar(filas, (r) => r.funcion).sort((a, b) => b.llamadas - a.llamadas),
      porModelo: agrupar(filas, (r) => (r.modelo === "desconocido" ? null : r.modelo)).sort((a, b) => b.costo - a.costo),
      porOrigen: agrupar(filas, (r) => r.origen_medicion).sort((a, b) => b.llamadas - a.llamadas),
      sinPrecio: filas.filter((r) => r.precio_faltante).length,
    };
  }, [filas]);

  if (error) return <AvisoDeError error={error} />;

  const maxLlamadasDia = d ? Math.max(1, ...d.porDia.map((x) => x.llamadas)) : 1;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Costos del análisis</h2>
      </div>

      <div className="crediscope-card">
        <div className="crediscope-descarga-row" style={{ marginTop: 0 }}>
          <div className="crediscope-descarga-campo">
            <label htmlFor="c-desde">Desde</label>
            <input id="c-desde" type="date" className="crediscope-input" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="crediscope-descarga-campo">
            <label htmlFor="c-hasta">Hasta</label>
            <input id="c-hasta" type="date" className="crediscope-input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="crediscope-descarga-campo" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="crediscope-btn crediscope-btn-ghost" onClick={() => { setDesde(""); setHasta(""); }}>
              Todo el histórico
            </button>
          </div>
        </div>
      </div>

      {!d ? (
        <Cargando />
      ) : d.t.llamadas === 0 ? (
        <div className="crediscope-card">
          <p style={{ margin: 0 }}>No hay llamadas registradas en ese rango.</p>
        </div>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi
              Icono={DollarSign}
              etiqueta="Gasto medido"
              valor={money2(d.t.costo)}
              detalle={d.t.sinMedir ? `No incluye ${plural(d.t.sinMedir, "llamada")} sin medición` : "Todas las llamadas del rango están medidas"}
            />
            <Kpi
              Icono={Activity}
              etiqueta="Llamadas al modelo"
              valor={num(d.t.llamadas)}
              detalle={d.t.fallidas ? `${entero(d.t.fallidas)} fallaron` : "Ninguna falló"}
            />
            <Kpi
              Icono={DollarSign}
              etiqueta="Costo por análisis"
              valor={d.porAnalisis === null ? "—" : centavos(d.porAnalisis)}
              detalle={`Promedio sobre ${d.analisis.llamadas - d.analisis.sinMedir} análisis medidos`}
            />
            <Kpi
              Icono={Brain}
              etiqueta="Razonamiento"
              valor={d.t.salida ? `${Math.round((d.t.razonamiento / d.t.salida) * 100)}%` : "—"}
              detalle="De los tokens de salida, que es lo más caro"
            />
          </div>

          {d.t.sinMedir > 0 ? (
            <Aviso tipo="advertencia" titulo={`${entero(d.t.sinMedir)} de ${plural(d.t.llamadas, "llamada")} no se pueden valuar.`}>
              <p className="crediscope-muted">
                Ocurrieron antes de que existiera este registro, o su fila se borró al limpiar datos de prueba. Sabemos que
                pasaron porque quedaron en la bitácora, pero sus tokens ya no están. <strong>Su costo es desconocido, no
                cero</strong>: el gasto real del período es mayor que el total de arriba.
              </p>
            </Aviso>
          ) : null}

          {d.sinPrecio > 0 ? (
            <Aviso tipo="peligro">
              <p>
                <strong>{plural(d.sinPrecio, "llamada")} {d.sinPrecio === 1 ? "usa" : "usan"} un modelo sin tarifa cargada.</strong> Se están contando en cero. Cargá el
                modelo en <Link to="/costos/tarifas">Tarifas</Link> para que el total sea real.
              </p>
            </Aviso>
          ) : null}

          <div className="crediscope-reportes-grid">
            <div className="crediscope-card">
              <h3>
                En qué se gastó
                <InfoTooltip etiqueta="Qué se le cobró a una institución">
                  Hoy nada de esto se le cobró a nadie.
                </InfoTooltip>
              </h3>
              {d.porNaturaleza.map((n) => (
                <Barra
                  key={n.clave}
                  etiqueta={ETIQUETA_NATURALEZA[n.clave] ?? n.clave}
                  texto={`${money2(n.costo)} · ${plural(n.llamadas, "llamada")}`}
                  pct={d.t.costo > 0 ? (n.costo / d.t.costo) * 100 : 0}
                  color={n.clave === "consulta" ? "var(--good)" : n.clave === "calibracion" ? "var(--warn)" : "var(--brand)"}
                  ayuda={DESCRIPCION_NATURALEZA[n.clave]}
                />
              ))}

              <h3 style={{ marginTop: 22 }}>Qué proceso lo pidió</h3>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Proceso</th>
                    <th className="crediscope-cifra">Llamadas</th>
                    <th className="crediscope-cifra">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porFuncion.map((f) => (
                    <tr key={f.clave}>
                      <td>
                        {ETIQUETA_FUNCION[f.clave] ?? f.clave}
                        {f.sinMedir ? <div className="crediscope-muted" style={{ fontSize: 12 }}>{entero(f.sinMedir)} sin medir</div> : null}
                      </td>
                      <td className="crediscope-cifra">{entero(f.llamadas)}</td>
                      <td className="crediscope-cifra">{money(f.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
                Una prueba retrospectiva no es una llamada: es una por cada caso del corte.{" "}
                <Link to="/costos/corridas">Ver las corridas masivas</Link>.
              </p>
            </div>

            <div className="crediscope-card">
              <h3>
                Qué tan confiable es el número
                <InfoTooltip etiqueta="Qué mide esta tarjeta">
                  Muestra de dónde salieron los tokens de cada llamada.
                </InfoTooltip>
              </h3>
              {d.porOrigen.map((o) => (
                <Barra
                  key={o.clave}
                  etiqueta={ETIQUETA_ORIGEN[o.clave] ?? o.clave}
                  texto={entero(o.llamadas)}
                  pct={Math.round((o.llamadas / d.t.llamadas) * 100)}
                  color={o.clave === "medida" ? "var(--good)" : o.clave === "reconstruida" ? "var(--brand)" : "var(--text-muted)"}
                  ayuda={DESCRIPCION_ORIGEN[o.clave]}
                />
              ))}

              <h3 style={{ marginTop: 22 }}>Por modelo</h3>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th className="crediscope-cifra">Llamadas</th>
                    <th className="crediscope-cifra">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porModelo.map((m) => (
                    <tr key={m.clave}>
                      <td style={{ fontSize: 13 }}>{m.clave}</td>
                      <td className="crediscope-cifra">{entero(m.llamadas)}</td>
                      <td className="crediscope-cifra">{money(m.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
                Las llamadas sin medición no aparecen acá: no quedó registro de qué modelo las atendió.
              </p>
            </div>
          </div>

          <div className="crediscope-card">
            <h3>Día a día</h3>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Volumen</th>
                  <th className="crediscope-cifra">Llamadas</th>
                  <th className="crediscope-cifra">Sin medir</th>
                  <th className="crediscope-cifra">Costo medido</th>
                  <th className="crediscope-cifra">Por llamada</th>
                </tr>
              </thead>
              <tbody>
                {d.porDia.map((x) => {
                  const prom = promedioMedido(x);
                  return (
                    <tr key={x.clave}>
                      <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{formatearDia(x.clave)}</td>
                      <td style={{ width: "34%" }}>
                        <div className="crediscope-barrapct-track">
                          <div
                            className="crediscope-barrapct-fill"
                            style={{ width: `${Math.round((x.llamadas / maxLlamadasDia) * 100)}%`, background: "var(--brand)" }}
                          />
                        </div>
                      </td>
                      <td className="crediscope-cifra">{entero(x.llamadas)}</td>
                      <td className="crediscope-cifra" style={{ color: x.sinMedir ? "var(--warn)" : undefined }}>
                        {x.sinMedir ? entero(x.sinMedir) : "—"}
                      </td>
                      <td className="crediscope-cifra">{money(x.costo)}</td>
                      <td className="crediscope-cifra">{prom === null ? "—" : centavos(prom)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
