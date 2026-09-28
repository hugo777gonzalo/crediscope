// Rótulos de las fuentes de ingreso, compartidos por las pantallas que las
// muestran. La clasificación la calcula fuentes-ingreso.ts al generar cada
// perfil; el conteo sobre la cartera lo hace la base
// (resumen_fuentes_ingreso, migración 081) -- antes se contaba acá, sobre
// las 1.000 filas que PostgREST dejaba pasar.

import { esIngresoMinimoSbu, INGRESO_MINIMO_SBU } from "./ingresosCampos.js";

// Los nombres del negocio viven en _shared/nombres-ingresos.ts: los usa
// también el perfil del modelo, y la pantalla y el análisis con IA tienen
// que hablar el mismo idioma. Se reexportan para no tocar cada import.
export {
  ETIQUETA_SEGMENTO,
  ETIQUETA_ESTADO,
  ETIQUETA_EVIDENCIA,
  ETIQUETA_SENAL,
  ETIQUETA_INDICIO,
  DOCUMENTOS_DE_CONFIRMACION,
  quienDeclara,
} from "../../supabase/functions/_shared/nombres-ingresos.ts";

const MONEDA = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const formatMoneda = (n) => (n === null || n === undefined ? "—" : MONEDA.format(n));

// El ingreso reportado al IESS, dicho como se dice en Ecuador: el monto, y
// "Ingreso Mínimo SBU" cuando es el salario básico del año del corte. Nunca
// "piso" (pedido del negocio, 2026-09-25). Una sola función para todas las
// pantallas que lo muestran.
export function textoIngresoReportado(monto, corte) {
  if (monto === null || monto === undefined || monto === "" || !(Number(monto) > 0)) return "—";
  const texto = formatMoneda(Number(monto));
  return esIngresoMinimoSbu(Number(monto), corte) ? `${texto} · ${INGRESO_MINIMO_SBU}` : texto;
}
