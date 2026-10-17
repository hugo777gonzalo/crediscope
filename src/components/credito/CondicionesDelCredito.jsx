import { ShieldCheck } from "lucide-react";
import { decimal, entero } from "../../lib/formatos.js";
import { aNumero, MONTO_MAXIMO_DEL_DESLIZADOR, PLAZOS_FRECUENTES, SISTEMAS, SISTEMAS_DETALLE, textoDelSeguro } from "../../lib/credito.js";
import { PRODUCTO_CONSUMO } from "../../../supabase/functions/_shared/simulador-credito.ts";

// El formulario del crédito: lo comparten el simulador y la capacidad de pago,
// para que las dos pantallas pidan lo mismo de la misma manera.
//
// Pensado para alguien que no es experto: lo que más se cambia (monto y plazo)
// va arriba, con un deslizador y plazos de un toque; la tasa al lado de su
// tope; el seguro, que casi nunca se toca, plegado con su resumen a la vista.

function Entrada({ id, prefijo = null, sufijo = null, valor, alCambiar, modo = "decimal", etiquetaAccesible }) {
  return (
    <div className="crediscope-credito-entrada">
      {prefijo ? <span aria-hidden="true">{prefijo}</span> : null}
      <input id={id} inputMode={modo} value={valor} onChange={(e) => alCambiar(e.target.value)} aria-label={etiquetaAccesible} autoComplete="off" />
      {sufijo ? <span aria-hidden="true">{sufijo}</span> : null}
    </div>
  );
}

export default function CondicionesDelCredito({ valores, cambiar }) {
  const montoNumero = aNumero(valores.monto);
  const plazoNumero = aNumero(valores.plazo);
  const maxima = PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje;
  const seguro = { tasaPorcentaje: aNumero(valores.tasaSeguro), periodicidad: valores.periodicidad, base: valores.base };

  return (
    <div className="crediscope-card crediscope-credito-formulario">
      <div className="crediscope-credito-campo">
        <div className="crediscope-credito-campo-cabecera">
          <label htmlFor="credito-monto">¿Cuánto necesita?</label>
          <span className="crediscope-muted">en dólares</span>
        </div>
        <Entrada id="credito-monto" prefijo="$" valor={valores.monto} alCambiar={cambiar.setMonto} etiquetaAccesible="Monto del crédito, en dólares" />
        <input
          type="range"
          className="crediscope-credito-rango"
          min="500"
          max={MONTO_MAXIMO_DEL_DESLIZADOR}
          step="500"
          value={Number.isFinite(montoNumero) ? Math.min(montoNumero, MONTO_MAXIMO_DEL_DESLIZADOR) : 500}
          onChange={(e) => cambiar.setMonto(entero(Number(e.target.value)))}
          aria-label="Monto del crédito"
        />
      </div>

      <div className="crediscope-credito-campo">
        <div className="crediscope-credito-campo-cabecera">
          <label htmlFor="credito-plazo">¿En cuántos meses?</label>
        </div>
        <div className="crediscope-credito-plazos">
          <div className="crediscope-credito-chips" role="group" aria-label="Plazos frecuentes">
            {PLAZOS_FRECUENTES.map((meses) => (
              <button
                key={meses}
                type="button"
                className="crediscope-credito-chip"
                aria-pressed={plazoNumero === meses}
                onClick={() => cambiar.setPlazo(String(meses))}
              >
                {meses}
              </button>
            ))}
          </div>
          <div style={{ width: 120 }}>
            <Entrada id="credito-plazo" sufijo="meses" modo="numeric" valor={valores.plazo} alCambiar={cambiar.setPlazo} etiquetaAccesible="Plazo, en meses" />
          </div>
        </div>
      </div>

      <div className="crediscope-credito-dos">
        <div className="crediscope-credito-campo">
          <div className="crediscope-credito-campo-cabecera">
            <label htmlFor="credito-tasa">Tasa de interés</label>
            <span className="crediscope-muted">máximo {decimal(maxima, 1)}%</span>
          </div>
          <Entrada id="credito-tasa" sufijo="% anual" valor={valores.tasa} alCambiar={cambiar.setTasa} etiquetaAccesible="Tasa nominal anual, en porcentaje" />
        </div>
        <div className="crediscope-credito-campo">
          <div className="crediscope-credito-campo-cabecera">
            <label htmlFor="credito-sistema">Cómo se paga</label>
          </div>
          <select id="credito-sistema" className="crediscope-input crediscope-credito-selector" value={valores.sistema} onChange={(e) => cambiar.setSistema(e.target.value)}>
            {Object.entries(SISTEMAS).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
          <p className="crediscope-credito-ayuda">{SISTEMAS_DETALLE[valores.sistema]}</p>
        </div>
      </div>

      <details className="crediscope-credito-mas">
        <summary>
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Seguro de desgravamen</span>
          <span className="crediscope-muted">{Number.isFinite(seguro.tasaPorcentaje) ? textoDelSeguro(seguro) : "revisar"}</span>
        </summary>
        <p className="crediscope-credito-ayuda" style={{ marginTop: 10 }}>
          Cubre la deuda si la persona fallece o queda incapacitada. Se suma a la cuota de cada mes.
        </p>
        <div className="crediscope-credito-tres">
          <div className="crediscope-credito-campo">
            <label htmlFor="credito-seguro">Tasa del seguro</label>
            <Entrada id="credito-seguro" sufijo="%" valor={valores.tasaSeguro} alCambiar={cambiar.setTasaSeguro} etiquetaAccesible="Tasa del seguro, en porcentaje" />
          </div>
          <div className="crediscope-credito-campo">
            <label htmlFor="credito-periodicidad">La tasa es</label>
            <select id="credito-periodicidad" className="crediscope-input crediscope-credito-selector" value={valores.periodicidad} onChange={(e) => cambiar.setPeriodicidad(e.target.value)}>
              <option value="anual">Anual</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <div className="crediscope-credito-campo">
            <label htmlFor="credito-base">Se cobra sobre</label>
            <select id="credito-base" className="crediscope-input crediscope-credito-selector" value={valores.base} onChange={(e) => cambiar.setBase(e.target.value)}>
              <option value="saldo">Lo que falta pagar</option>
              <option value="monto">El monto original</option>
            </select>
          </div>
        </div>
      </details>
    </div>
  );
}
