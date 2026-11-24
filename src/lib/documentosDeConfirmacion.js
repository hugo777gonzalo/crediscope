// Qué documentos se le piden a una persona para confirmar su ingreso, según el
// régimen tributario de su RUC: a quien no presenta una declaración no se le
// pide (F15 de la reestructuración del núcleo).
//
// Qué presenta cada régimen, según la página del SRI sobre el RIMPE (consultada
// el 2026-11-17):
//   - RIMPE Negocio Popular: no presenta declaraciones de IVA (la cuota ya lo
//     incluye), salvo por actividades excluidas del régimen; declara renta cada año.
//   - RIMPE Emprendedor: IVA semestral y acumulado (mensual si lo pide); renta anual.
//   - Régimen general: IVA mensual o semestral, según la tarifa de sus actividades.
//
// Lo que no se sabe todavía: de dónde sale el régimen. Proveedor_Info_1 no lo
// trae, y la clase del contribuyente de Equifax (`claseDeContribuyente`) dice
// «RIMPE» sin separar Negocio Popular de Emprendedor, así que ninguna fuente
// alcanza hoy para distinguirlos. Mientras `regimen` no llegue, la lista es la
// de siempre.

export const REGIMEN = Object.freeze({
  NEGOCIO_POPULAR: "negocio_popular",
  EMPRENDEDOR: "emprendedor",
  GENERAL: "general",
});

// La línea que genera fuentes-ingreso.ts para quien tiene actividad en el SRI
// pero aporta por cuenta propia: «Declaraciones de IVA de los últimos 6 meses o
// facturación emitida...».
const ES_DECLARACION_DE_IVA = /^Declaraciones? de IVA/i;

// Quita de la lista lo que el régimen no presenta, sin tocar el resto. La
// facturación emitida sí sigue: la factura la emite también quien no declara IVA.
export function documentosSegunRegimen(documentos, regimen) {
  const lista = Array.isArray(documentos) ? documentos : [];
  if (regimen !== REGIMEN.NEGOCIO_POPULAR) return lista;
  return lista.map((d) =>
    ES_DECLARACION_DE_IVA.test(d)
      ? "Facturación emitida, para dimensionar la actividad registrada en el SRI."
      : d
  );
}
