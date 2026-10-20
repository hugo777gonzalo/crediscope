import { ShieldCheck } from "lucide-react";
import { decimal, entero, moneda } from "../../lib/formatos.js";
import { aNumero, PLAZOS_FRECUENTES, SISTEMAS, SISTEMAS_DETALLE, textoDelSeguro } from "../../lib/credito.js";
import EntradaDeMonto from "./EntradaDeMonto.jsx";
import { PRODUCTO_CONSUMO } from "../../../supabase/functions/_shared/simulador-credito.ts";

// El formulario del crédito: lo comparten el simulador y la capacidad de pago,
// para que las dos pantallas pidan lo mismo de la misma manera.
//
// Pensado para alguien que no es experto: lo que más se cambia (monto y plazo)
// va arriba, con un deslizador y plazos de un toque; la tasa al lado de la
// Tasa mínima y la máxima (vacía es la máxima); el seguro, que casi nunca se
// toca, plegado con su resumen a la vista.

export default function CondicionesDelCredito({ valores, cambiar }) {
  const montoNumero = aNumero(valores.monto);
  const plazoNumero = aNumero(valores.plazo);
  const tasaVacia = String(valores.tasa ?? "").trim() === "";
  const tasaNumero = aNumero(valores.tasa);
  const maxima = PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje;
  const minima = PRODUCTO_CONSUMO.tasaNominalMinimaPorcentaje;
  const { montoMinimo, montoMaximo, plazoMinimoMeses, plazoMaximoMeses } = PRODUCTO_CONSUMO.limites;
  const montoEnRango = Math.min(Math.max(montoNumero, montoMinimo), montoMaximo);
  const seguro = { tasaPorcentaje: aNumero(valores.tasaSeguro), periodicidad: valores.periodicidad, base: valores.base };

  return (
    <div className="crediscope-card crediscope-credito-formulario">
      <div className="crediscope-credito-campo">
        <div className="crediscope-credito-campo-cabecera">
          <label htmlFor="credito-monto">¿Cuánto necesita?</label>
          <span className="crediscope-muted">en dólares</span>
        </div>
        <EntradaDeMonto id="credito-monto" prefijo="$" valor={valores.monto} alCambiar={cambiar.setMonto} invalido={!(montoNumero >= montoMinimo && montoNumero <= montoMaximo)} />
        <input
          type="range"
          className="crediscope-credito-rango"
          min={montoMinimo}
          max={montoMaximo}
          step="500"
          value={Number.isFinite(montoNumero) ? montoEnRango : montoMinimo}
          onChange={(e) => cambiar.setMonto(entero(Number(e.target.value)))}
          aria-label={`Monto del crédito, de ${moneda(montoMinimo)} a ${moneda(montoMaximo)}`}
          aria-valuetext={Number.isFinite(montoNumero) ? moneda(montoEnRango) : undefined}
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
            <EntradaDeMonto id="credito-plazo" sufijo="meses" modo="numeric" valor={valores.plazo} alCambiar={cambiar.setPlazo} invalido={!(Number.isInteger(plazoNumero) && plazoNumero >= plazoMinimoMeses && plazoNumero <= plazoMaximoMeses)} />
          </div>
        </div>
      </div>

      <div className="crediscope-credito-dos">
        <div className="crediscope-credito-campo">
          <div className="crediscope-credito-campo-cabecera">
            <label htmlFor="credito-tasa">Tasa de interés</label>
            <span className="crediscope-muted">de {decimal(minima, 0)}% a {decimal(maxima, 1)}%</span>
          </div>
          <EntradaDeMonto
            id="credito-tasa"
            sufijo="% anual"
            marcador={decimal(maxima, 1)}
            valor={valores.tasa}
            alCambiar={cambiar.setTasa}
            invalido={!tasaVacia && !(tasaNumero >= minima && tasaNumero <= maxima)}
          />
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
            <EntradaDeMonto id="credito-seguro" sufijo="%" valor={valores.tasaSeguro} alCambiar={cambiar.setTasaSeguro} invalido={!(seguro.tasaPorcentaje >= 0)} />
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
