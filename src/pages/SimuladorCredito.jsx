import { useMemo } from "react";
import Aviso from "../components/ui/Aviso.jsx";
import CondicionesDelCredito from "../components/credito/CondicionesDelCredito.jsx";
import CuotaDestacada from "../components/credito/CuotaDestacada.jsx";
import ResumenFijo from "../components/credito/ResumenFijo.jsx";
import TablaDeAmortizacion from "../components/credito/TablaDeAmortizacion.jsx";
import { useCondicionesDelCredito } from "../lib/credito.js";
import { porcentaje } from "../lib/formatos.js";
import { simularCredito } from "../../supabase/functions/_shared/simulador-credito.ts";

// El simulador de crédito de consumo (docs/plan-demo-ifi.md, paso 2). La
// pantalla sólo junta lo que escribe la persona y muestra lo que calcula
// simularCredito(): la fórmula vive en _shared para que la capacidad de pago,
// la función `simular-credito` y la API den la misma cuota que se ve acá.
//
// Diseño (pedido del negocio del 2026-10-17: calidad de app bancaria, para
// alguien que no es experto): a la izquierda lo que se elige, a la derecha la
// cuota como protagonista y se recalcula al escribir, sin botón.

export default function SimuladorCredito() {
  const { valores, cambiar, pedido } = useCondicionesDelCredito();
  const resultado = useMemo(() => simularCredito(pedido), [pedido]);
  const s = resultado.ok ? resultado.simulacion : null;

  return (
    <div>
      <div className="crediscope-pagina-cabecera" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Simulador de crédito</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Cuánto pagaría por mes un crédito de consumo, con el seguro de desgravamen incluido.
        </p>
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
                  <p>Tasa efectiva anual</p>
                  <strong>{porcentaje(s.tasaEfectivaAnual, 2)}</strong>
                </div>
                <p className="crediscope-credito-ayuda" style={{ gridColumn: "1 / -1", margin: 0 }}>
                  La efectiva es lo que cuesta el interés en un año, contando que se paga cada mes. No incluye el seguro.
                </p>
              </div>
            </>
          ) : (
            <Aviso tipo="advertencia" titulo="Revisá las condiciones">
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {resultado.errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Aviso>
          )}
        </div>
        {s ? <ResumenFijo cuota={s.cuotaPrimerMes} /> : null}
      </div>

      {s ? <TablaDeAmortizacion simulacion={s} /> : null}

      <Aviso tipo="informacion" titulo="Cómo se calcula">
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          <li>La tasa mensual es la anual dividida para 12.</li>
          <li>Cada valor se redondea al centavo en su mes; la última cuota ajusta la diferencia para que el capital sume el monto.</li>
          <li>El seguro se cobra cada mes, sobre lo que falta pagar o sobre el monto original, según se elija.</li>
          <li>No incluye comisiones ni otros cargos.</li>
        </ul>
      </Aviso>
    </div>
  );
}
