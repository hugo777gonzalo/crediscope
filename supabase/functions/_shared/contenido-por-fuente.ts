// Aviso (nunca freno) cuando una fuente deja de traer contenido sin dar error.
//
// POR QUÉ: el 28/10 `licenciaConducir` pasó de 84% a 1% de consultas con contenido, sin un solo
// error marcado, y cada consulta por separado se veía normal. Ningún freno por consulta lo ve
// (docs/propuesta-fuentes-obligatorias.md, 3.3; decisión 12b del negocio: sólo aviso).
//
// QUÉ SE COMPARA: la tasa de contenido de las últimas consultas contra la mediana de los días con
// volumen de esa misma fuente (`consultas_por_dia_y_fuente`). Un estado `error` sale del
// denominador: ese ya lo ve la propia consulta, y contarlo avisaría de una caída de Proveedor_Info_1
// como si fuera una fuente muda.
//
// POR QUÉ ESTOS NÚMEROS (medidos con los 4 días de volumen que existen: 25/09, 26/09, 03/10 y
// 28/10; el tráfico normal es de 1 a 8 consultas por día, así que no hay más historia):
//   - El nivel de una fuente depende de la población: entre el 25 y el 26/09 `titulos` fue 46% y
//     22%, `denuncias` 28% y 13%, `sercop` 22% y 97%. Con la mitad del nivel avisaba en falso por
//     `titulos` y `denuncias` el 26/09 (y `sercop` el 25/09). Con 0,4 hubo 0 avisos en falso en los
//     3 días sanos, con 15 puntos de margen sobre el peor caso (0,46), y el 28/10 avisó por 11
//     fuentes, entre ellas `licenciaConducir`, `deudasEmov`, `denuncias` y la renta.
//   - Mínimo de 30 consultas y de 15 contenidos esperados: una fuente rara (1% de contenido) no se
//     puede juzgar con pocas consultas; con 15 esperados, ver menos del 40% (6) tiene ~0,7% de
//     probabilidad por azar. Por eso `bienesInmueble` (1,6%) sólo se mira con muchas consultas.
//   - Mínimo de 2 días de referencia con 200 o más consultas.
// Es poca evidencia (una población por día): este control nace para avisar y se ajusta con lo que
// alarme, no se vuelve freno sin repetir la medida (decisión 12).

export const UMBRAL_RELATIVO = 0.4;
export const MIN_CONSULTAS = 30;
export const MIN_CONTENIDOS_ESPERADOS = 15;
export const MIN_DIAS_DE_REFERENCIA = 2;
export const MIN_CONSULTAS_POR_DIA_DE_REFERENCIA = 200;

export type DiaDeFuente = { fuente: string; consultas: number; conDatos: number; errores: number };

export type FuenteMuda = { fuente: string; tasaActual: number; tasaDeReferencia: number; consultas: number };

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** `estados`: el `estado_por_fuente` de cada consulta reciente. Sólo `ok` cuenta como contenido. */
export function contarRecientes(estados: Array<Record<string, unknown> | null>): Map<string, { consultas: number; conDatos: number }> {
  const r = new Map<string, { consultas: number; conDatos: number }>();
  for (const e of estados) {
    if (!e) continue;
    for (const [fuente, estado] of Object.entries(e)) {
      if (estado === "error") continue;
      const c = r.get(fuente) ?? { consultas: 0, conDatos: 0 };
      c.consultas++;
      if (estado === "ok") c.conDatos++;
      r.set(fuente, c);
    }
  }
  return r;
}

/** `referencia`: filas diarias por fuente (cualquier número de días); se usan los de volumen. */
export function fuentesMudas(
  recientes: Map<string, { consultas: number; conDatos: number }>,
  referencia: DiaDeFuente[],
): FuenteMuda[] {
  const tasas = new Map<string, number[]>();
  for (const d of referencia) {
    const n = d.consultas - d.errores;
    if (d.consultas < MIN_CONSULTAS_POR_DIA_DE_REFERENCIA || n <= 0) continue;
    const t = tasas.get(d.fuente) ?? [];
    t.push(d.conDatos / n);
    tasas.set(d.fuente, t);
  }
  const mudas: FuenteMuda[] = [];
  for (const [fuente, { consultas, conDatos }] of recientes) {
    const t = tasas.get(fuente);
    if (consultas < MIN_CONSULTAS || !t || t.length < MIN_DIAS_DE_REFERENCIA) continue;
    const ref = mediana(t);
    if (ref * consultas < MIN_CONTENIDOS_ESPERADOS) continue;
    const actual = conDatos / consultas;
    if (actual < UMBRAL_RELATIVO * ref) mudas.push({ fuente, tasaActual: actual, tasaDeReferencia: ref, consultas });
  }
  return mudas.sort((a, b) => a.fuente.localeCompare(b.fuente));
}
