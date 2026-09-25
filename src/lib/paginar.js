// PostgREST corta toda respuesta en 1.000 filas (max-rows del proyecto)
// y no avisa: `.limit(5000)` vuelve con 1.000 y status 200. Medido el
// 2026-09-24: client_profiles?limit=5000 trajo 1.000 de 3.303, Costos
// sumaba 1.000 de las 1.006 llamadas al modelo y el desplegable de
// segmentos de la Bandeja salía de 1.000 clientes de 2.807.
//
// Esto pide de a páginas hasta juntar lo que la base dice que hay. El
// final lo marca el conteo de la primera página, no una página corta: si
// algún día max-rows baja a 500, "pedí 1.000 y llegaron 500" parecería la
// última página y el corte volvería, igual de silencioso.
//
// `armar(opciones)` devuelve la consulta ya filtrada y ordenada, nueva en
// cada llamada, pasándole `opciones` a su `.select()`. Dos condiciones
// sobre el orden, porque las páginas se piden por posición:
//
//   · Tiene que ser total (desempatar por id). En llm_llamadas hay 10
//     pares de filas con el mismo instante: con un orden parcial, una de
//     ellas puede salir en dos páginas y la otra en ninguna.
//   · Lo que se inserte mientras se lee tiene que caer al final. Si cae
//     al principio corre todo un lugar y el borde de cada página se
//     repite.
//
// `tope` corta a propósito, y por eso vuelve también el total: quien lo
// use tiene que poder decir "N de M".
export async function traerTodas(armar, { tope = Infinity, porPagina = 1000 } = {}) {
  const filas = [];
  let total = Infinity;
  for (let primera = true; filas.length < Math.min(total, tope); primera = false) {
    const desde = filas.length;
    const cuantas = Math.min(Math.min(total, tope) - desde, porPagina);
    const { data, error, count } = await armar(primera ? { count: "exact" } : {}).range(desde, desde + cuantas - 1);
    if (error) throw error;
    if (primera && count != null) total = count;
    // Una página vacía antes de llegar al total: se borraron filas
    // mientras se leía. Se devuelve lo que hay y el total dice cuánto
    // falta.
    if (!data?.length) break;
    filas.push(...data);
  }
  return { filas, total: Number.isFinite(total) ? total : filas.length };
}
