// Los tramos de carga máxima por perfil (negocio, 2026-11-10; desde marco-v36,
// BORRADOR). El negocio fija los tramos, el modelo dice en cuál cae la persona y
// por qué (tramoDeCarga en la respuesta) y el código aplica el tope: el mismo
// perfil analizado dos veces cambia 1 de cada 13 recomendaciones, y un
// porcentaje elegido por el modelo cambiaría igual entre corridas y no se
// podría auditar.
//
// La carga es la suma de las cuotas que la persona ya paga y la del crédito que
// pide, contra su ingreso neto del mes. Los topes se calibraron con la cartera
// de la institución en la base de originación de AWS:
// - 37.828 créditos OK FACTURAR, con la consulta de Equifax del pedido; 2.379
//   con resultado (la conducta interna cuando la persona volvió a pedir, a 24
//   meses de mediana).
// - La carga no anticipó la mora de lo aprobado: con más de 30 días, 14,9% hasta
//   el 40% y 13,8% sobre el 100%. La conducta al pedir sí: 14% sin mora, 27% con
//   1 a 30 días.
// - El tramo 1 cayó en mora en 2 de 61, y en 1 de 36 con carga sobre el 60%: el
//   80% no es un riesgo que se haya visto. El 60% del tramo 2 es la práctica de
//   la institución (aprobó con una carga mediana de 58%), no algo que el
//   resultado exija. El tramo 3 es el único donde la carga separa: 19% de mora
//   hasta el 40% y 28% sobre él.
// - Con 80/60/40 entra el 53% de lo que aprobó la institución; con 60/40, el 28%.
// La medición y sus cuidados (sólo se ve lo aprobado; el resultado lo tiene sólo
// quien volvió a pedir) están en la descripción del PR #151.
//
// Quien aplica el tope es la capacidad de pago con el crédito que se pide
// (capacidad-de-pago.ts usa hoy un 40% fijo): eso es trabajo aparte.

export const TRAMOS_DE_CARGA = ["1", "2", "3", "fuera"] as const;
export type TramoDeCargaCodigo = (typeof TRAMOS_DE_CARGA)[number];

export interface TramoDeCarga {
  tramo: TramoDeCargaCodigo;
  // La condición que decide el tramo, en una oración del modelo.
  motivo: string;
}

// Fuera de tramo no hay tope: no hay aprobación directa.
export const TOPE_DE_CARGA_POR_TRAMO: Readonly<Record<TramoDeCargaCodigo, number | null>> = Object.freeze({
  "1": 0.8,
  "2": 0.6,
  "3": 0.4,
  fuera: null,
});

// La respuesta la garantiza el esquema, pero un pedido viejo o un modelo
// simulado puede no traerla: sin un tramo de la lista, null, nunca un tramo
// supuesto.
export function normalizarTramoDeCarga(valor: unknown): TramoDeCarga | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  const tramo = typeof v.tramo === "string" ? v.tramo.trim().toLowerCase() : "";
  if (!(TRAMOS_DE_CARGA as readonly string[]).includes(tramo)) return null;
  return { tramo: tramo as TramoDeCargaCodigo, motivo: typeof v.motivo === "string" ? v.motivo.trim() : "" };
}
