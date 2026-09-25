// Rótulos de las fuentes de ingreso, compartidos por las pantallas que las
// muestran. La clasificación la calcula fuentes-ingreso.ts al generar cada
// perfil; el conteo sobre la cartera lo hace la base
// (resumen_fuentes_ingreso, migración 081) -- antes se contaba acá, sobre
// las 1.000 filas que PostgREST dejaba pasar.

import { esIngresoMinimoSbu, INGRESO_MINIMO_SBU } from "./ingresosCampos.js";

export const ETIQUETA_SEGMENTO = {
  dependiente_privado: "Dependiente privado",
  publico: "Sector público",
  diplomatico: "Misión diplomática u organismo internacional",
  independiente: "Independiente",
  empleo_domestico: "Empleo doméstico",
  agricola: "Agrícola",
  trabajo_hogar: "Trabajo no remunerado del hogar",
  jubilado: "Jubilado",
  jubilado_con_ingreso_adicional: "Jubilado con ingreso adicional",
  ingresos_mixtos: "Ingresos mixtos",
  informal_o_sin_actividad: "Informal o sin actividad",
  sin_datos: "Sin datos: la fuente no respondió",
  no_clasificado: "Tipo de aporte no reconocido",
};

// Por qué existe cada segmento: no es de dónde viene la plata, es cómo
// puede fallar. Se muestra en la pantalla para que la separación se
// entienda sin tener que leer el código.
export const RIESGO_SEGMENTO = {
  dependiente_privado: "Quiebra del empleador, despido, crisis del sector",
  publico: "Decisión política: una ley, un ministerio que cierra",
  diplomatico: "Ajeno a la política local; de los más estables",
  independiente: "No se conoce el ingreso real",
  empleo_domestico: "Vínculo precario, sin respaldo institucional",
  agricola: "Estacional; clima y precios",
  trabajo_hogar: "Sin ingreso propio",
  jubilado: "Casi no falla: el pago es del Estado y es vitalicio",
  jubilado_con_ingreso_adicional: "Pensión estable más una actividad a verificar",
  ingresos_mixtos: "Diversificado: dos fuentes de naturaleza distinta",
  informal_o_sin_actividad: "No se puede determinar si hay ingreso",
  // No es un riesgo del cliente: es una consulta que hay que repetir.
  // Mezclarlo con "informal" convertía una caída de la fuente en un
  // juicio sobre la persona -- le pasó a 373 el 2026-09-15.
  sin_datos: "No dice nada de la persona: hay que volver a consultarla",
  no_clasificado: "Código de empleador fuera del catálogo: requiere revisión manual",
};

export const ETIQUETA_EVIDENCIA = {
  reportada_por_tercero: "Reportada por un tercero",
  autodeclarada_sobre_minimo: "Autodeclarada, sobre el SBU",
  autodeclarada_en_minimo: "Autodeclarada, en el SBU",
  indirecta: "Indirecta (hay actividad, no hay monto)",
};

export const ETIQUETA_ESTADO = {
  confirmada: "Confirmada",
  provisional: "Provisional",
  indeterminada: "Indeterminada",
};

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
