// Los valores personales de una respuesta de Equifax: nombre, documento, RUC,
// dirección, teléfonos, coordenadas, números de operación y de tarjeta, y los
// de las personas de las que es codeudora o garante. Sirven de centinelas:
// ninguno puede aparecer en las tablas, en la estructura ni en lo que lee el
// modelo. Una sola lista para scripts/probar-equifax-tablas.mjs y
// scripts/medir-bloque-equifax.mjs.
//
// Se filtra por el CONTENIDO, no sólo por el campo: el teléfono de la persona
// viene dentro de sujeto_al_dia.institucion (lección del inventario,
// 2026-10-12).
//
// AVISO: este archivo no pasa por lint ni build.

export function centinelas(cuerpo) {
  const rc = cuerpo?.reporteCrediticio ?? {};
  const v = [];
  const poner = (x) => { if (typeof x === "string" && x.trim().length >= 6) v.push(x.trim()); };
  for (const f of rc.identificacion_consultada ?? []) { poner(f.nombre); poner(f.numero_documento); }
  for (const f of rc.informacion_sri ?? []) { poner(f.nombre); poner(f.ruc); poner(f.direccion); poner(f.nombre_fantasia_comercial); }
  for (const f of rc.informacion_demografica ?? []) { poner(f.fecha_nacimiento); poner(f.direcciones); poner(f.coordenada_x); poner(f.coordenada_y); poner(f.numero_telefonico_convencional); poner(f.numero_telefonico_celular); }
  for (const nombre of ["garantias_personales_codeudores_operaciones_vigentes", "garantias_personales_codeudores_operaciones_no_vigentes"]) {
    for (const f of rc[nombre] ?? []) { poner(f.nombre_titular); poner(f.identificacion_titular); poner(f.numero_operacion); }
  }
  for (const f of rc.operaciones_canceladas ?? []) poner(f.numero_operacion);
  for (const f of rc.tarjetas_canceladas ?? []) poner(f.numero_tarjeta);
  for (const f of rc.sujeto_al_dia ?? []) for (const d of String(f.institucion ?? "").match(/\d{6,}/g) ?? []) poner(d);
  poner(cuerpo?.transactionId); poner(cuerpo?.originalTransactionId);
  return v;
}
