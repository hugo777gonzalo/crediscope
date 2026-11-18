// Providencias de la fuente: cuál bloquea y cuál sólo avisa (E12, decisión R5 del
// negocio, 2026-11-18).
//
// Una providencia de CERTIFICACIÓN es un pedido de información de un fiscal o un
// juez ("certifique si esta persona tiene cuentas..."): no embarga nada ni prueba
// que la persona haya hecho algo. La de RETENCIÓN o embargo sí toca los fondos, y
// sigue bloqueando. Hasta estructura-v23 todas bloqueaban y en el crudo de
// 2026-10-03 la mayoría eran de certificación.
//
// El tipo lo da el campo `notificacion`. Llega con la ñ mal codificada
// ("CERTIFICACI�N"), así que se compara sin acentos y sólo por la raíz.

type Registro = Record<string, unknown>;

export function esProvidenciaDeCertificacion(providencia: Registro | null | undefined): boolean {
  const tipo = String(providencia?.notificacion ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  return tipo.includes("CERTIFIC");
}

/** Separa las providencias en las que bloquean y las que sólo avisan. */
export function separarProvidencias<T extends Registro>(providencias: T[] | null | undefined): { bloquean: T[]; certificacion: T[] } {
  const bloquean: T[] = [];
  const certificacion: T[] = [];
  for (const p of providencias ?? []) (esProvidenciaDeCertificacion(p) ? certificacion : bloquean).push(p);
  return { bloquean, certificacion };
}
