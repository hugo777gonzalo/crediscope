// La versión de esquema que el código de las funciones necesita, y la
// guarda que lo verifica (116, docs/plan-segundo-cliente.md).
//
// Con una base por cliente, una base atrasada no da un error claro: da
// "column does not exist" a la mitad de una consulta, después de haber
// gastado la consulta a la fuente. Es mejor negarse de entrada y decir
// qué falta.
//
// ESQUEMA_MINIMO es la migración más nueva de la que DEPENDE el código,
// no la última que existe: una migración que sólo agrega algo que el
// código todavía no usa no obliga a subirlo. Así se puede desplegar el
// código antes de migrar (regla 8 de CLAUDE.md) sin cortar el servicio.
// La deriva entre bases la muestra el corredor
// (`node scripts/migrar-clientes.mjs`), que compara cada base contra la
// última migración del repositorio.
//
// SUBIRLO cuando una función empiece a usar una tabla, columna o función
// de una migración nueva: primero se migra, después se despliega.
// 134: evaluar-solicitud anota la decisión (decidir_solicitud) y evaluada_el.
// 135: evaluar-solicitud guarda autorización, referencia, operador, prioridad y reemplazaA.
// 138: la consulta de Equifax guarda equifax_analisis_credito (equifax-tablas-v2). Sin ella el código marcaría
//      la consulta como derivada con la v2 y la tabla quedaría vacía sin que nada lo avisara.
// 139: api-v1 y procesar-evaluaciones usan la cola de las evaluaciones de la API
//      (origen, clave de idempotencia, plazo, reclamo, reclamar_evaluaciones) y el
//      origen 'api' de las consultas de Equifax. Se escribió como 137 y pasó a 139
//      porque la 138 se aplicó antes.
// 140: la agenda de las evaluaciones lee la clave de Vault. Ninguna función depende de ella.
// 141: estimar-ingreso lee modelos_de_ingreso y guarda estimaciones_de_ingreso. Se escribió
//      como 140 y pasó a 141 porque la agenda se aplicó antes.
// 142: las filas de marco-v32 y marco-v33. Sin ellas, todo análisis falla al guardarse
//      por la clave foránea de analysis_results.rules_version.
export const ESQUEMA_MINIMO = 142;

let verificada: number | null = null;

// deno-lint-ignore no-explicit-any
export async function exigirEsquema(serviceClient: any, cabeceras: Record<string, string>): Promise<Response | null> {
  // Una vez que la base alcanzó, no se vuelve a preguntar mientras viva la
  // instancia: las migraciones sólo suben la versión.
  if (verificada !== null && verificada >= ESQUEMA_MINIMO) return null;

  const { data, error } = await serviceClient.rpc("version_del_esquema");
  const version = typeof data === "number" ? data : null;
  if (error || version === null) {
    return new Response(
      JSON.stringify({
        error: "La base no informa su versión de esquema: falta la migración 116. Aplicarla con scripts/migrar-clientes.mjs.",
      }),
      { status: 503, headers: { ...cabeceras, "Content-Type": "application/json" } },
    );
  }
  verificada = version;
  if (version < ESQUEMA_MINIMO) {
    return new Response(
      JSON.stringify({
        error: `La base está en la versión ${version} y esta función necesita la ${ESQUEMA_MINIMO}: faltan migraciones. Aplicarlas con scripts/migrar-clientes.mjs.`,
      }),
      { status: 503, headers: { ...cabeceras, "Content-Type": "application/json" } },
    );
  }
  return null;
}
