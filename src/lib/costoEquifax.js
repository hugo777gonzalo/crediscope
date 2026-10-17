import { diaEcuador } from "./fechas.js";

// Lo que cobra Equifax por consulta: USD 0,40 (negocio, 2026-10-17). Sin
// historia de tarifas, como sí la tienen las del modelo (Costos › Tarifas):
// si cambia, se cambia acá con su fecha y valúa también lo de antes.
export const TARIFA_EQUIFAX_USD = 0.4;
export const TARIFA_EQUIFAX_DESDE = "2026-10-17";

// El gasto por mes (de Ecuador), del más reciente al más viejo.
//
//   consultas: [{ created_at, ambiente }] de consultas_equifax. Cada fila es una
//     respuesta que Equifax contestó y se guardó: se cobró. Una consulta
//     reutilizada (vigente hasta el 17) no deja fila nueva, así que no se cuenta.
//     Las de ambiente de prueba van aparte: no se sabe si se cobran.
//   dudosas: [{ created_at }] de audit_log, «equifax.consulta.fallo» con
//     puede_haber_cobrado: el pedido salió y no se guardó (un tiempo agotado,
//     una respuesta de otra persona). Pudieron cobrarse: van aparte, nunca
//     sumadas al gasto seguro, como hace el tope diario con el consumo.
export function gastoEquifaxPorMes(consultas, dudosas, tarifa = TARIFA_EQUIFAX_USD) {
  const meses = new Map();
  const delMes = (iso) => {
    const mes = diaEcuador(iso).slice(0, 7);
    if (!meses.has(mes)) meses.set(mes, { mes, pagadas: 0, dudosas: 0, dePrueba: 0 });
    return meses.get(mes);
  };
  for (const c of consultas) {
    if (c.ambiente === "produccion") delMes(c.created_at).pagadas++;
    else delMes(c.created_at).dePrueba++;
  }
  for (const f of dudosas) delMes(f.created_at).dudosas++;
  return [...meses.values()]
    .sort((a, b) => b.mes.localeCompare(a.mes))
    .map((m) => ({ ...m, gastoUsd: m.pagadas * tarifa, gastoMaximoUsd: (m.pagadas + m.dudosas) * tarifa }));
}
