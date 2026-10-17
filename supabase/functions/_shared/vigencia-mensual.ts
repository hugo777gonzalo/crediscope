// Vigencia de una consulta a un buró que se cobra por consulta y publica su
// información un día fijo de cada mes. Una sola implementación para Aval y
// Equifax: copiarla es como aparecen las diferencias silenciosas. La única
// copia es la de SQL, porque la base no puede importar esto:
// corte_vigente_mensual() (132), que comprueba al crearse que da lo mismo en
// las fechas de vigencia-mensual.test.ts. Si cambia una, cambia la otra.
//
// La regla (decisión del negocio): una consulta vale hasta el día anterior al
// corte, y EL DÍA DE CORTE CADUCA TODO POR IGUAL, sin importar qué día se
// consultó. Aval, 2026-09-21: "publica el 18, vale hasta el 17". Equifax,
// 2026-10-12: "la vigencia de consulta es hasta el 17 de cada mes". Por eso el
// corte es el 18 a las 00:00 de Ecuador, y una consulta sigue vigente sólo si
// no pasó ningún corte desde que se hizo; es decir, si se hizo en el mismo
// ciclo [18 → 17 siguiente] en el que estamos ahora.
//
// Ecuador es UTC-5 sin horario de verano (ver src/lib/fechas.js). A las 00:00
// de Ecuador del día de corte son las 05:00 UTC. Se calcula en UTC para no
// depender de la zona horaria del servidor.

export const DIA_DE_CORTE = 18;

const OFFSET_ECUADOR_MS = 5 * 60 * 60 * 1000; // UTC-5

// Instante del corte vigente: el día de corte a las 00:00 de Ecuador (05:00
// UTC) del ciclo en curso. Si hoy es antes del día de corte, el corte fue el
// del mes pasado; si es ese día o después, es el de este mes.
function corteVigente(ahora: Date, dia: number): Date {
  const local = new Date(ahora.getTime() - OFFSET_ECUADOR_MS);
  let anio = local.getUTCFullYear();
  let mes = local.getUTCMonth();
  if (local.getUTCDate() < dia) { mes -= 1; if (mes < 0) { mes = 11; anio -= 1; } }
  return new Date(Date.UTC(anio, mes, dia, 5, 0, 0, 0));
}

// Próximo corte: el que hará caducar el ciclo actual.
function proximoCorte(ahora: Date, dia: number): Date {
  const c = corteVigente(ahora, dia);
  return new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, dia, 5, 0, 0, 0));
}

/**
 * ¿Sigue vigente una consulta hecha en `fechaConsultaISO`?
 * Vigente = se hizo en o después del corte del ciclo actual (no pasó ningún
 * día de corte desde entonces). Una fecha ilegible no es vigente: en un buró
 * que cobra, ante la duda se vuelve a consultar sólo si alguien lo pide, pero
 * nunca se sirve algo que no se sabe de cuándo es.
 */
export function estaVigenteHastaElCorte(
  fechaConsultaISO: string,
  ahora: Date = new Date(),
  dia: number = DIA_DE_CORTE,
): boolean {
  const f = new Date(fechaConsultaISO);
  if (isNaN(f.getTime())) return false;
  return f.getTime() >= corteVigente(ahora, dia).getTime();
}

/**
 * Hasta cuándo vale una consulta hecha ahora: el día anterior al corte a las
 * 23:59:59 de Ecuador (el instante justo antes del próximo corte). Sirve para
 * mostrarlo o guardarlo.
 */
export function finDeLaVigencia(ahora: Date = new Date(), dia: number = DIA_DE_CORTE): Date {
  return new Date(proximoCorte(ahora, dia).getTime() - 1000);
}
