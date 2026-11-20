// ¿Son el mismo nombre? Se compara por conjunto de palabras, no por igualdad textual:
// el nombre completo llega en dos órdenes distintos según la fuente
// (pn_inf_basica: "Apellido1 Apellido2 Nombre1 Nombre2"; pn_supa:
// "Nombre1 Nombre2 Apellido1 Apellido2").
//
// Una sola implementación. Estaba escrita en process.ts (pensiones alimenticias) y en
// fuentes-ingreso.ts (el aporte como propio patrono): la capa de hechos, grupo 3,
// la usa desde acá, y fuentes-ingreso.ts la importa. La copia de process.ts sale en la
// etapa B del grupo (docs/capa-de-hechos.md, 4.3), cuando ese bloque pase a armarse
// desde los hechos.
export function mismoNombre(a: unknown, b: unknown): boolean {
  const normalizar = (s: unknown) => String(s ?? "").toUpperCase().trim().split(/\s+/).filter(Boolean).sort().join(" ");
  const na = normalizar(a);
  return na !== "" && na === normalizar(b);
}
