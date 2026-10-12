import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import { getConsumoLlm } from "../lib/api.js";
import { corridas, totales, promedioMedido, ETIQUETA_FUNCION, ETIQUETA_NATURALEZA, money, num, centavos, fechaHora } from "../lib/consumoLlm.js";
import { entero, plural, segundos } from "../lib/formatos.js";
import Kpi from "../components/ui/Kpi.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import Aviso from "../components/ui/Aviso.jsx";

// Corridas masivas: las acciones que disparan muchas llamadas de una.
//
// Existe porque el costo del producto no se entiende llamada por
// llamada. Una corrida de análisis en lote sobre 200 clientes son 200
// pedidos al modelo. Son las acciones más caras del sistema y las más
// fáciles de repetir sin darse cuenta -- y hasta que existió esta vista,
// no dejaban rastro visible en ningún lado. (Hasta el 2026-10-03 eran
// también el backtest y el informe de retroalimentación, que el Laboratorio
// reemplazó: su historial sigue acá.)

export default function CostosCorridas() {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [soloMultiples, setSoloMultiples] = useState(false);

  useEffect(() => {
    getConsumoLlm()
      .then(setFilas)
      .catch((err) => setError(err.message));
  }, []);

  const d = useMemo(() => {
    if (!filas) return null;
    const todas = corridas(filas);
    const calibracion = filas.filter((r) => r.naturaleza === "calibracion");
    const tc = totales(calibracion);
    const multiples = todas.filter((c) => c.llamadas > 1);
    return {
      lista: (soloMultiples ? multiples : todas).slice(0, 200),
      totalCorridas: todas.length,
      multiples: multiples.length,
      mayor: todas.reduce((max, c) => (c.llamadas > (max?.llamadas ?? 0) ? c : max), null),
      calibracion: tc,
    };
  }, [filas, soloMultiples]);

  if (error)
    return (
      <AvisoDeError error={error} />
    );

  return (
    <div>
      <p>
        <Link to="/costos" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Corridas masivas</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Acciones que disparan varias llamadas al modelo de una sola vez. Agrupadas por acción, no por llamada.
        </p>
      </div>

      {!d ? (
        <Cargando />
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi Icono={Layers} etiqueta="Corridas" valor={num(d.totalCorridas)} detalle={`${entero(d.multiples)} ${d.multiples === 1 ? "disparó" : "dispararon"} más de una llamada`} />
            <Kpi
              Icono={Layers}
              etiqueta="La más grande"
              valor={d.mayor ? plural(d.mayor.llamadas, "llamada") : "—"}
              detalle={d.mayor ? `${ETIQUETA_FUNCION[d.mayor.funcion] ?? d.mayor.funcion} · ${fechaHora(d.mayor.inicio)}` : null}
            />
            <Kpi
              Icono={Layers}
              etiqueta={`Llamadas: ${ETIQUETA_NATURALEZA.calibracion.toLowerCase()}`}
              valor={num(d.calibracion.llamadas)}
              detalle={`${money(d.calibracion.costo)} medidos · ${entero(d.calibracion.sinMedir)} sin medir`}
            />
            <Kpi
              Icono={Layers}
              etiqueta="Costo por llamada"
              valor={promedioMedido(d.calibracion) === null ? "—" : centavos(promedioMedido(d.calibracion))}
              detalle="Laboratorio y vigía, sólo lo medido"
            />
          </div>

          <Aviso tipo="advertencia" titulo="Antes de correr un análisis en lote, mirá cuántos casos lleva.">
            <p className="crediscope-muted">
              El análisis en lote evalúa <strong>un caso por llamada</strong>: un lote de 200 clientes son 200 llamadas al
              modelo, equivalentes a 200 consultas de cliente (a mitad de precio, porque va por la API de lotes). Repetir una
              corrida sobre los mismos clientes la vuelve a pagar entera, y el razonamiento del modelo es lo más caro. Se
              corren sólo con autorización del negocio y con el costo estimado.
            </p>
          </Aviso>

          <div className="crediscope-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Cada corrida</h3>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={soloMultiples} onChange={(e) => setSoloMultiples(e.target.checked)} />
                Sólo las que dispararon más de una llamada
              </label>
            </div>
            <p className="crediscope-muted" style={{ marginTop: 6 }}>
              Se agrupa por proceso, minuto y paquete: así una corrida aparece como una fila, con las llamadas que costó.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Cuándo</th>
                    <th>Proceso</th>
                    <th className="crediscope-cifra">Llamadas</th>
                    <th className="crediscope-cifra">Costo</th>
                    <th className="crediscope-cifra">Duración media</th>
                    <th>Modelo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lista.map((c, i) => (
                    <tr key={`${c.funcion}-${c.inicio}-${i}`}>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(c.inicio)}</td>
                      <td>
                        {ETIQUETA_FUNCION[c.funcion] ?? c.funcion}
                        {c.paquete ? (
                          <div className="crediscope-muted" style={{ fontSize: 12 }}>paquete {String(c.paquete).slice(0, 8)}</div>
                        ) : null}
                      </td>
                      <td className="crediscope-cifra" style={{ fontWeight: c.llamadas > 1 ? 700 : 400 }}>
                        {entero(c.llamadas)}
                      </td>
                      <td className="crediscope-cifra">
                        {c.sinMedir === c.llamadas ? (
                          <span className="crediscope-muted">sin medir</span>
                        ) : (
                          money(c.costo)
                        )}
                      </td>
                      <td className="crediscope-cifra">{c.msPromedio ? segundos(c.msPromedio) : "—"}</td>
                      <td style={{ fontSize: 13 }} className="crediscope-muted">
                        {c.modelos.length ? c.modelos.join(", ") : "sin registro"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.lista.length === 0 ? <p className="crediscope-muted" style={{ marginBottom: 0 }}>Ninguna corrida con ese filtro.</p> : null}
          </div>

          <div className="crediscope-card">
            <h3>Lo que falta para que esto sea completo</h3>
            <p style={{ marginBottom: 0 }}>
              Las corridas anteriores al {fechaHora("2026-09-15T00:40")} figuran <strong>sin medir</strong>: se sabe que
              ocurrieron porque quedaron en la bitácora, pero sus tokens no se guardaron en ningún lado. Desde esa fecha cada
              llamada se registra al momento, así que toda corrida nueva tiene su costo exacto. El total real del histórico es mayor que el que muestra el{" "}
              <Link to="/costos">panorama</Link>, y no hay forma de recuperarlo.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
