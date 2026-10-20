import { useMemo, useState } from "react";
import { decimal, moneda } from "./formatos.js";
import { PRODUCTO_CONSUMO } from "../../supabase/functions/_shared/simulador-credito.ts";

// Lo que comparten las pantallas del simulador y de la capacidad de pago: las
// condiciones del crédito que escribe el analista y cómo se leen. El cálculo
// no vive acá: es simularCredito() de _shared, el mismo de las funciones.

// En Ecuador se escribe "5.000" y "14,5"; el campo numérico del navegador no
// acepta la coma en todos los equipos. Con coma, los puntos son de miles; sin
// coma, "5.000" es cinco mil y "14.5" es catorce y medio.
export function aNumero(texto) {
  const t = String(texto ?? "").trim().replace(/[\s$%]/g, "");
  if (t === "") return Number.NaN;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
}

export const SISTEMAS = { frances: "Cuota fija", aleman: "Capital fijo" };
export const SISTEMAS_DETALLE = {
  frances: "Paga lo mismo de capital e interés todos los meses (sistema francés).",
  aleman: "Paga lo mismo de capital cada mes; la cuota empieza más alta y baja (sistema alemán).",
};

export const PLAZOS_FRECUENTES = [12, 24, 36, 48, 60];

export function textoDelSeguro({ tasaPorcentaje, periodicidad, base }) {
  return `${decimal(tasaPorcentaje, 2)}% ${periodicidad} sobre el ${base === "saldo" ? "saldo" : "monto"}`;
}

// Las condiciones del formulario y el pedido listo para simularCredito().
export function useCondicionesDelCredito(inicial = {}) {
  const [monto, setMonto] = useState(inicial.monto ?? "5.000");
  const [plazo, setPlazo] = useState(inicial.plazo ?? "36");
  const [tasa, setTasa] = useState(inicial.tasa ?? decimal(PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje, 1));
  const [sistema, setSistema] = useState(PRODUCTO_CONSUMO.sistema);
  const [tasaSeguro, setTasaSeguro] = useState(decimal(PRODUCTO_CONSUMO.desgravamen.tasaPorcentaje, 1));
  const [periodicidad, setPeriodicidad] = useState(PRODUCTO_CONSUMO.desgravamen.periodicidad);
  const [base, setBase] = useState(PRODUCTO_CONSUMO.desgravamen.base);

  const pedido = useMemo(
    () => ({
      monto: aNumero(monto),
      plazoMeses: aNumero(plazo),
      // Vacía no es un error: se evalúa con la Tasa máxima (negocio, 2026-10-19).
      tasaNominalAnualPorcentaje: String(tasa ?? "").trim() === "" ? null : aNumero(tasa),
      sistema,
      desgravamen: { tasaPorcentaje: aNumero(tasaSeguro), periodicidad, base },
    }),
    [monto, plazo, tasa, sistema, tasaSeguro, periodicidad, base],
  );

  return {
    valores: { monto, plazo, tasa, sistema, tasaSeguro, periodicidad, base },
    cambiar: { setMonto, setPlazo, setTasa, setSistema, setTasaSeguro, setPeriodicidad, setBase },
    pedido,
  };
}

// Por qué la última cuota no es igual a la primera, dicho en simple.
export function comoCambiaLaCuota(s) {
  if (s.cuotaUltimoMes === s.cuotaPrimerMes) return "La misma todos los meses.";
  const porque = s.sistema === "aleman" ? "el interés baja con lo que falta pagar" : "el seguro se cobra sobre lo que falta pagar";
  return `Baja hasta ${moneda(s.cuotaUltimoMes, 2)} en la última: ${porque}.`;
}
