import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getTarifasLlm, getConsumoLlm } from "../lib/api.js";

// Las tarifas con las que se valúa cada llamada.
//
// La pantalla existe por un defecto concreto: el precio se resuelve
// cruzando por nombre de modelo, así que un modelo que no esté en esta
// tabla se valúa en CERO y nadie se entera. Pasó con Haiku el día que
// entró la cascada. Acá se ve qué modelos están consumiendo y cuáles
// tienen tarifa.

const CAMPOS = [
  ["usd_entrada", "Entrada", "Lo que se manda: el perfil del cliente y el marco interpretativo."],
  ["usd_salida", "Salida", "Lo que responde, razonamiento incluido. Es lo más caro, cinco veces la entrada."],
  ["usd_cache_escritura", "Escribir caché", "Recargo por dejar el marco guardado para la próxima llamada."],
  ["usd_cache_lectura", "Leer caché", "Lo que cuesta reusarlo. Una décima parte de procesarlo de nuevo."],
];

export default function CostosTarifas() {
  const [tarifas, setTarifas] = useState(null);
  const [consumo, setConsumo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getTarifasLlm(), getConsumoLlm()])
      .then(([t, c]) => {
        setTarifas(t);
        setConsumo(c);
      })
      .catch((err) => setError(err.message));
  }, []);

  const modelosSinTarifa = useMemo(() => {
    if (!tarifas || !consumo) return [];
    const conTarifa = new Set(tarifas.map((t) => t.modelo));
    return [
      ...new Set(
        consumo
          .filter((r) => r.origen_medicion !== "sin_datos" && !conTarifa.has(r.modelo))
          .map((r) => r.modelo)
      ),
    ];
  }, [tarifas, consumo]);

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );

  return (
    <div>
      <p>
        <Link to="/costos" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Tarifas</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Precio por millón de tokens, con vigencia por fecha. Todo el costo que muestra esta sección sale de acá.
        </p>
      </div>

      {!tarifas ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : (
        <>
          {modelosSinTarifa.length > 0 ? (
            <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <AlertTriangle size={20} color="var(--bad)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Hay consumo de modelos sin tarifa cargada.</p>
                  <p style={{ margin: 0 }}>
                    {modelosSinTarifa.map((m) => <code key={m} style={{ marginRight: 8 }}>{m}</code>)}
                    <br />
                    Esas llamadas se están contando en <strong>cero</strong>. El costo informado es menor que el real hasta que
                    se carguen.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="crediscope-card">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <CheckCircle2 size={20} color="var(--good)" style={{ flexShrink: 0 }} />
                <p className="crediscope-muted" style={{ margin: 0 }}>
                  Todos los modelos que consumieron tienen tarifa cargada.
                </p>
              </div>
            </div>
          )}

          <div className="crediscope-card">
            <h3>Tarifas vigentes</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Desde</th>
                    {CAMPOS.map(([k, etiqueta, ayuda]) => (
                      <th key={k} style={{ textAlign: "right" }} title={ayuda}>{etiqueta}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tarifas.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontSize: 13 }}>{t.modelo}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{t.vigente_desde}</td>
                      {CAMPOS.map(([k]) => (
                        <td key={k} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          ${Number(t[k]).toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
              Los valores son por millón de tokens. Pasá el mouse por cada columna para ver qué se paga en ella.
            </p>
          </div>

          <div className="crediscope-card">
            <h3>Qué falta confirmar</h3>
            <p>
              Estas son <strong>tarifas de lista, no una factura</strong>. Antes de fijar el precio del servicio hay que
              contrastarlas contra el consumo real que informa la consola del proveedor: descuentos, impuestos y diferencias de
              redondeo no están acá.
            </p>
            <p style={{ marginBottom: 0 }}>
              Cambiar una tarifa hoy requiere una migración. Si el proveedor cambia precios, la forma correcta es{" "}
              <strong>agregar una fila con la nueva fecha de vigencia</strong>, nunca editar la anterior: el histórico tiene que
              quedar valuado a lo que costó ese día, no a lo que cuesta hoy.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
