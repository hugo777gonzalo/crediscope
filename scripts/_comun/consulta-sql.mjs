// El comando de `supabase db query` contra una base alojada, para todos los guiones.
//
// La CLI 3.0.0 (2026-11-04) no corre nada contra una base alojada sin confirmar: en modo
// agente contesta «Confirmation required… Nothing was changed» y sale con error. El corredor
// lo tomó como una base caída y el control de seguridad marcó tres fallas que no existían.
// - Una lectura va con --read-only: corre en una transacción de sólo lectura y no pide nada.
//   Si por error escribe, la base la rechaza.
// - Una escritura necesita SUPABASE_YES exportada en el shell de esa corrida. No se pasa
//   --yes desde acá, a propósito: la variable es la constancia de que alguien decidió escribir
//   en producción. La CLI no la acepta desde un .env.
//
// AVISO: este archivo no pasa por lint ni build.

/**
 * @param {string} archivo  el SQL, en un temporal (puede llevar secretos)
 * @param {{ proyecto?: string, workdir?: string, escribe?: boolean }} [opciones]
 *   `proyecto`: la referencia de la base; sin ella, la enlazada en supabase/.temp.
 */
export function comandoDeConsulta(archivo, { proyecto, workdir, escribe = false } = {}) {
  const destino = proyecto ? `--remote=${proyecto}` : "--remote";
  const modo = escribe ? "" : " --read-only";
  const carpeta = workdir ? ` --workdir "${workdir}"` : "";
  return `npx --yes supabase@latest db query ${destino}${modo}${carpeta} --file "${archivo}" -o json`;
}

/** Corta antes de empezar si el guion va a escribir y nadie exportó SUPABASE_YES. */
export function exigirConfirmacionParaEscribir(que) {
  if (process.env.SUPABASE_YES) return;
  console.error(
    `${que} escribe en la base y la CLI de Supabase pide confirmarlo.\n` +
      "Exportá SUPABASE_YES=1 sólo en el shell de esta corrida (nunca en un .env) y volvé a correrlo."
  );
  process.exit(1);
}
