// Vigencia de una consulta de Aval.
//
// Aval actualiza su información el 18 de cada mes; una consulta vale hasta el
// 17 y EL 18 CADUCA TODO POR IGUAL (decisión del negocio 2026-09-21, sin
// importar qué día se consultó). O sea, el 18 (00:00 hora Ecuador) es un
// corte: una consulta sigue vigente solo si no pasó ningún corte desde que se
// hizo — es decir, se hizo en el mismo ciclo [18 → 17 siguiente] en el que
// estamos ahora.
//
// Ecuador es UTC-5 sin horario de verano (ver src/lib/fechas.js). A las 00:00
// de Ecuador del día 18 son las 05:00 UTC. Se calcula en UTC para no
// depender de la zona horaria del servidor.

const OFFSET_ECUADOR_MS = 5 * 60 * 60 * 1000; // UTC-5

// Instante del corte vigente: el día 18 a las 00:00 de Ecuador (05:00 UTC)
// del ciclo en curso. Si hoy es antes del 18, el corte fue el 18 del mes
// pasado; si es 18 o después, es el 18 de este mes.
function corteVigente(ahora: Date): Date {
  const local = new Date(ahora.getTime() - OFFSET_ECUADOR_MS);
  let anio = local.getUTCFullYear();
  let mes = local.getUTCMonth();
  if (local.getUTCDate() < 18) { mes -= 1; if (mes < 0) { mes = 11; anio -= 1; } }
  return new Date(Date.UTC(anio, mes, 18, 5, 0, 0, 0)); // 18 00:00 Ecuador
}

// Próximo corte: el 18 (00:00 Ecuador) que hará caducar el ciclo actual.
function proximoCorte(ahora: Date): Date {
  const c = corteVigente(ahora);
  return new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 18, 5, 0, 0, 0));
}

/**
 * ¿Sigue vigente una consulta hecha en `fechaConsultaISO`?
 * Vigente = se hizo en o después del corte del ciclo actual (no pasó ningún
 * día 18 desde entonces).
 */
export function estaVigenteAval(fechaConsultaISO: string, ahora: Date = new Date()): boolean {
  const f = new Date(fechaConsultaISO);
  if (isNaN(f.getTime())) return false;
  return f.getTime() >= corteVigente(ahora).getTime();
}

/**
 * Hasta cuándo vale una consulta hecha ahora: el 17 a las 23:59:59 de Ecuador
 * del ciclo en curso (el instante justo antes del próximo corte). Sirve para
 * mostrarlo o guardarlo.
 */
export function finVigenciaAval(ahora: Date = new Date()): Date {
  return new Date(proximoCorte(ahora).getTime() - 1000);
}
