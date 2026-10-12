import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getTarifasLlm, getConsumoLlm } from "../lib/api.js";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import { moneda } from "../lib/formatos.js";
import { formatearDia } from "../lib/fechas.js";
import Aviso from "../components/ui/Aviso.jsx";

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
        <h2 style={{ marginBottom: 4 }}>Tarifas</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Precio por millón de tokens, con vigencia por fecha. Todo el costo que muestra esta sección sale de acá.
        </p>
      </div>

      {!tarifas ? (
        <Cargando />
      ) : (
        <>
          {modelosSinTarifa.length > 0 ? (
            <Aviso tipo="peligro" titulo="Hay consumo de modelos sin tarifa cargada.">
              <p>
                {modelosSinTarifa.map((m) => <code key={m} style={{ marginRight: 8 }}>{m}</code>)}
                <br />
                Esas llamadas se están contando en <strong>cero</strong>. El costo informado es menor que el real hasta que
                se carguen.
              </p>
            </Aviso>
          ) : (
            <Aviso tipo="exito">
              <p className="crediscope-muted">Todos los modelos que consumieron tienen tarifa cargada.</p>
            </Aviso>
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
                      <th key={k} className="crediscope-cifra" title={ayuda}>{etiqueta}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tarifas.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontSize: 13 }}>{t.modelo}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{formatearDia(t.vigente_desde)}</td>
                      {CAMPOS.map(([k]) => (
                        <td key={k} className="crediscope-cifra">
                          {moneda(t[k], 2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
              Los valores son por millón de tokens. Pasá el cursor por cada columna para ver qué se paga en ella.
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
