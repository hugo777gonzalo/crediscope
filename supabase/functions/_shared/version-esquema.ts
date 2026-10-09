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
export const ESQUEMA_MINIMO = 119;

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
