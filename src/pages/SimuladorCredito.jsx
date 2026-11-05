import { useMemo } from "react";
import Aviso from "../components/ui/Aviso.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import CondicionesDelCredito from "../components/credito/CondicionesDelCredito.jsx";
import CuotaDestacada from "../components/credito/CuotaDestacada.jsx";
import ResumenFijo from "../components/credito/ResumenFijo.jsx";
import TablaDeAmortizacion from "../components/credito/TablaDeAmortizacion.jsx";
import { useCondicionesDelCredito } from "../lib/credito.js";
import { entero, porcentaje } from "../lib/formatos.js";
import { erroresDelPedido, PRODUCTO_CONSUMO, simularCredito } from "../../supabase/functions/_shared/simulador-credito.ts";

// El simulador de crédito de consumo (docs/plan-demo-ifi.md, paso 2). La
// pantalla sólo junta lo que escribe la persona y muestra lo que calcula
// simularCredito(): la fórmula vive en _shared para que la capacidad de pago,
// la función `simular-credito` y la API den la misma cuota que se ve acá.
//
// Diseño (pedido del negocio del 2026-10-17: calidad de app bancaria): a la
// izquierda lo que se elige, a la derecha la cuota como protagonista y se
// recalcula al escribir, sin botón. No explica conceptos de crédito (la usa
// personal capacitado, 2026-10-20): lo propio del cálculo va en ayudas ⓘ.

// El mensaje de la función sirve para la API, que recibe números. En pantalla
// el monto llega escrito: un negativo decía «mayor que cero» con el mínimo en
// 1.000, y «1,000.50» no decía que el decimal va con coma (QA del 2026-11-05).
function mensajesEnPantalla(pedido) {
  const { montoMinimo, montoMaximo } = PRODUCTO_CONSUMO.limites;
  return erroresDelPedido(pedido).map((e) => {
    if (e.codigo !== "monto-invalido" && e.codigo !== "monto-con-mas-de-dos-decimales") return e.motivo;
    return `El monto va de ${entero(montoMinimo)} a ${entero(montoMaximo)} dólares, con coma para los decimales (1.000,50).`;
  });
}

export default function SimuladorCredito() {
  const { valores, cambiar, pedido } = useCondicionesDelCredito();
  const resultado = useMemo(() => simularCredito(pedido), [pedido]);
  const s = resultado.ok ? resultado.simulacion : null;
  const errores = useMemo(() => (resultado.ok ? [] : mensajesEnPantalla(pedido)), [resultado, pedido]);

  return (
    <div>
      <div className="crediscope-pagina-cabecera" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Simulador de crédito</h2>
      </div>

      <div className="crediscope-credito-grid">
        <CondicionesDelCredito valores={valores} cambiar={cambiar} />

        <div className="crediscope-credito-columna">
          {s ? (
            <>
              <CuotaDestacada simulacion={s} />
              <div className="crediscope-card crediscope-credito-tasas">
                <div>
                  <p>Tasa mensual</p>
                  <strong>{porcentaje(s.tasaMensual, 3)}</strong>
                </div>
                <div>
                  <p>
                    Tasa efectiva anual <InfoTooltip etiqueta="Qué incluye la tasa efectiva">Sin el seguro de desgravamen.</InfoTooltip>
                  </p>
                  <strong>{porcentaje(s.tasaEfectivaAnual, 2)}</strong>
                </div>
              </div>
            </>
          ) : (
            <Aviso tipo="advertencia" titulo="Revisá las condiciones">
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Aviso>
          )}
        </div>
        {s ? <ResumenFijo cuota={s.cuotaPrimerMes} /> : null}
      </div>

      {s ? <TablaDeAmortizacion simulacion={s} /> : null}
    </div>
  );
}
