// Estadística del Laboratorio (decisión 2 de docs/laboratorio-pantallas.md):
// lo interactivo corre en el navegador sobre el corte congelado (unas 2.500
// filas). Las distribuciones de los valores p salen de jStat, una librería
// probada; las fórmulas de cada prueba están acá, escritas como en los
// libros, y scripts/probar-estadistica.mjs las controla contra la base y
// contra valores conocidos. Lo pesado (bosque aleatorio, SHAP, K-means, PCA)
// lo corren guiones locales que importan este mismo archivo.
//
// Convenciones:
//  - Un valor que no es un número finito es un faltante y se descarta (las
//    funciones dicen cuántos usaron).
//  - El puntaje del motor va de 1 a 999 y más alto es MEJOR: el AUC es la
//    probabilidad de que un bueno tenga más puntaje que un malo, igual que
//    lab_auc() en la base.
//  - Los valores p son a dos colas.

import jStatPaquete from "jstat";

const jStat = jStatPaquete.jStat ?? jStatPaquete;

// ------------------------------------------------------------- básicos
export const esNumero = (x) => typeof x === "number" && Number.isFinite(x);
export const numeros = (lista) => lista.filter(esNumero);
export const ordenar = (xs) => [...xs].sort((a, b) => a - b);
const suma = (xs) => xs.reduce((s, x) => s + x, 0);

export function media(xs) {
  return xs.length ? suma(xs) / xs.length : null;
}

// Muestral (n - 1).
export function varianza(xs) {
  if (xs.length < 2) return null;
  const m = media(xs);
  return suma(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
}

export function desvio(xs) {
  const v = varianza(xs);
  return v === null ? null : Math.sqrt(v);
}

// Tipo 7 (el de R por defecto y el de numpy): interpola entre los dos
// valores vecinos. Recibe la lista ya ordenada.
export function cuantil(ordenados, p) {
  if (!ordenados.length) return null;
  const h = (ordenados.length - 1) * p;
  const abajo = Math.floor(h);
  const arriba = Math.min(abajo + 1, ordenados.length - 1);
  return ordenados[abajo] + (h - abajo) * (ordenados[arriba] - ordenados[abajo]);
}

// Rangos promedio (los empates comparten el promedio de sus posiciones),
// empezando en 1. También devuelve los tamaños de cada grupo empatado, que
// las pruebas de rangos necesitan para corregir la varianza.
export function rangos(xs) {
  const orden = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = Array.from({ length: xs.length });
  const empates = [];
  for (let a = 0; a < orden.length;) {
    let b = a;
    while (b + 1 < orden.length && orden[b + 1][0] === orden[a][0]) b++;
    const promedio = (a + b) / 2 + 1;
    for (let k = a; k <= b; k++) r[orden[k][1]] = promedio;
    if (b > a) empates.push(b - a + 1);
    a = b + 1;
  }
  return { rangos: r, empates };
}

// Momentos centrales poblacionales (divididos por n), para asimetría y curtosis.
function momentos(xs) {
  const n = xs.length, m = media(xs);
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of xs) {
    const d = x - m;
    m2 += d * d; m3 += d * d * d; m4 += d * d * d * d;
  }
  return { n, m2: m2 / n, m3: m3 / n, m4: m4 / n };
}

// Descriptivas de una variable numérica. Asimetría y curtosis (exceso) con
// la corrección de muestra (G1 y G2, las de Excel y SPSS). Atípicos por la
// regla de Tukey: fuera de 1,5 rangos intercuartiles.
export function descriptivas(lista) {
  const xs = numeros(lista);
  const n = xs.length;
  if (!n) return { n: 0, faltantes: lista.length };
  const o = ordenar(xs);
  const m = media(xs), s = desvio(xs);
  const q1 = cuantil(o, 0.25), q3 = cuantil(o, 0.75), iqr = q3 - q1;
  const bajo = q1 - 1.5 * iqr, alto = q3 + 1.5 * iqr;
  const { m2, m3, m4 } = momentos(xs);
  const g1 = m2 > 0 ? m3 / m2 ** 1.5 : null;
  const g2 = m2 > 0 ? m4 / m2 ** 2 - 3 : null;
  return {
    n, faltantes: lista.length - n, media: m, mediana: cuantil(o, 0.5), desvio: s,
    minimo: o[0], maximo: o[n - 1], p5: cuantil(o, 0.05), p25: q1, p75: q3, p95: cuantil(o, 0.95), iqr,
    asimetria: g1 !== null && n > 2 ? (g1 * Math.sqrt(n * (n - 1))) / (n - 2) : null,
    curtosis: g2 !== null && n > 3 ? (((n + 1) * g2 + 6) * (n - 1)) / ((n - 2) * (n - 3)) : null,
    cv: s !== null && m !== 0 ? s / Math.abs(m) : null,
    ceros: xs.filter((x) => x === 0).length,
    atipicos: xs.filter((x) => x < bajo || x > alto).length, limitesAtipicos: [bajo, alto],
    bigotes: [o.find((x) => x >= bajo), [...o].reverse().find((x) => x <= alto)],
  };
}

// Tramos de un histograma. Con pocos enteros distintos (hijos, operaciones),
// un tramo por valor; si no, el ancho de Freedman-Diaconis, entre 6 y 40
// tramos. `recorte` deja afuera las colas (saldos con un valor enorme
// aplastan todo lo demás) y dice cuántos quedaron afuera.
export function histograma(lista, { tramos = null, recorte = 0 } = {}) {
  const todos = ordenar(numeros(lista));
  if (!todos.length) return { tramos: [], fuera: 0 };
  const lo = recorte ? cuantil(todos, recorte) : todos[0];
  const hi = recorte ? cuantil(todos, 1 - recorte) : todos[todos.length - 1];
  const xs = todos.filter((x) => x >= lo && x <= hi);
  const fuera = todos.length - xs.length;
  const distintos = [...new Set(xs)];
  if (!tramos && distintos.length <= 20 && distintos.every(Number.isInteger)) {
    return { tramos: distintos.map((v) => ({ desde: v, hasta: v, n: xs.filter((x) => x === v).length })), fuera, discreto: true };
  }
  let k = tramos;
  if (!k) {
    const iqr = cuantil(xs, 0.75) - cuantil(xs, 0.25);
    const ancho = (2 * iqr) / Math.cbrt(xs.length);
    k = iqr > 0 && hi > lo ? Math.ceil((hi - lo) / ancho) : Math.ceil(Math.log2(xs.length) + 1);
    k = Math.max(6, Math.min(40, k));
  }
  if (hi === lo) return { tramos: [{ desde: lo, hasta: hi, n: xs.length }], fuera };
  const ancho = (hi - lo) / k;
  const salida = Array.from({ length: k }, (_, i) => ({ desde: lo + i * ancho, hasta: lo + (i + 1) * ancho, n: 0 }));
  for (const x of xs) salida[Math.min(k - 1, Math.floor((x - lo) / ancho))].n++;
  return { tramos: salida, fuera };
}

// ------------------------------------------------------- proporciones
export function wilson(malos, n, z = 1.96) {
  if (!n) return null;
  const p = malos / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// Benjamini-Hochberg: controla la proporción de falsos hallazgos entre los
// que se declaran significativos. Devuelve los q en el mismo orden.
export function benjaminiHochberg(ps) {
  const orden = ps.map((p, i) => [p, i]).filter(([p]) => esNumero(p)).sort((a, b) => a[0] - b[0]);
  const qs = ps.map(() => null);
  let minimo = 1;
  for (let j = orden.length - 1; j >= 0; j--) {
    minimo = Math.min(minimo, (orden[j][0] * orden.length) / (j + 1));
    qs[orden[j][1]] = minimo;
  }
  return qs;
}

export function bonferroni(ps) {
  const m = ps.filter(esNumero).length;
  return ps.map((p) => (esNumero(p) ? Math.min(1, p * m) : null));
}

// ---------------------------------------------------- distribuciones
export const pNormal = (z) => 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
export const pT = (t, gl) => 2 * (1 - jStat.studentt.cdf(Math.abs(t), gl));
export const pChiCuadrado = (x, gl) => 1 - jStat.chisquare.cdf(x, gl);
export const pF = (f, gl1, gl2) => 1 - jStat.centralF.cdf(f, gl1, gl2);
export const tCritico = (gl, nivel = 0.95) => jStat.studentt.inv(1 - (1 - nivel) / 2, gl);

// --------------------------------------------------------- correlaciones
// Sólo los pares donde los dos valores son números.
function pares(x, y) {
  const a = [], b = [];
  for (let i = 0; i < x.length; i++) if (esNumero(x[i]) && esNumero(y[i])) { a.push(x[i]); b.push(y[i]); }
  return [a, b];
}

function pearsonCrudo(a, b) {
  const n = a.length;
  if (n < 3) return null;
  const ma = media(a), mb = media(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}

function pDeCorrelacion(r, n) {
  if (r === null || n < 3) return null;
  if (Math.abs(r) >= 1) return 0;
  return pT(r * Math.sqrt((n - 2) / (1 - r * r)), n - 2);
}

export function pearson(x, y) {
  const [a, b] = pares(x, y);
  const r = pearsonCrudo(a, b);
  return { r, n: a.length, p: pDeCorrelacion(r, a.length) };
}

// Pearson sobre los rangos; el valor p con la aproximación t (como scipy).
export function spearman(x, y) {
  const [a, b] = pares(x, y);
  const r = pearsonCrudo(rangos(a).rangos, rangos(b).rangos);
  return { r, n: a.length, p: pDeCorrelacion(r, a.length) };
}

// Tau-b de Kendall, contando pares (n²: para un par de variables, no para
// una matriz de 59 × 59). Valor p con la aproximación normal que corrige
// por empates.
export function kendall(x, y) {
  const [a, b] = pares(x, y);
  const n = a.length;
  if (n < 3) return { r: null, n, p: null };
  let s = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = Math.sign(a[i] - a[j]), dy = Math.sign(b[i] - b[j]);
      if (dx === 0) n1++;
      if (dy === 0) n2++;
      s += dx * dy;
    }
  }
  const n0 = (n * (n - 1)) / 2;
  const tau = n0 - n1 > 0 && n0 - n2 > 0 ? s / Math.sqrt((n0 - n1) * (n0 - n2)) : null;
  const grupos = (xs) => rangos(xs).empates;
  const tx = grupos(a), ty = grupos(b);
  const sumar = (ts, f) => suma(ts.map(f));
  const v0 = n * (n - 1) * (2 * n + 5);
  const vt = sumar(tx, (t) => t * (t - 1) * (2 * t + 5)), vu = sumar(ty, (t) => t * (t - 1) * (2 * t + 5));
  const v1 = sumar(tx, (t) => t * (t - 1)) * sumar(ty, (t) => t * (t - 1));
  const v2 = sumar(tx, (t) => t * (t - 1) * (t - 2)) * sumar(ty, (t) => t * (t - 1) * (t - 2));
  const v = (v0 - vt - vu) / 18 + v1 / (2 * n * (n - 1)) + v2 / (9 * n * (n - 1) * (n - 2));
  return { r: tau, n, p: v > 0 ? pNormal(s / Math.sqrt(v)) : null };
}

// Matriz de correlación con los pares completos de cada par de columnas.
export function matrizDeCorrelacion(columnas, metodo = "pearson") {
  const f = metodo === "spearman" ? spearman : pearson;
  const k = columnas.length;
  const m = Array.from({ length: k }, () => Array.from({ length: k }, () => null));
  for (let i = 0; i < k; i++) {
    m[i][i] = 1;
    for (let j = i + 1; j < k; j++) m[i][j] = m[j][i] = f(columnas[i], columnas[j]).r;
  }
  return m;
}

// Gauss-Jordan con pivote parcial. Devuelve null si la matriz es singular
// (una variable es combinación exacta de otras).
export function invertir(matriz) {
  const n = matriz.length;
  const a = matriz.map((fila, i) => [...fila, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let f = c + 1; f < n; f++) if (Math.abs(a[f][c]) > Math.abs(a[piv][c])) piv = f;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let f = 0; f < n; f++) {
      if (f === c || a[f][c] === 0) continue;
      const factor = a[f][c];
      for (let j = 0; j < 2 * n; j++) a[f][j] -= factor * a[c][j];
    }
  }
  return a.map((fila) => fila.slice(n));
}

// VIF de cada columna: la diagonal de la inversa de la matriz de
// correlación, sobre las filas con todas las columnas presentes. Más de 5,
// la variable se explica casi entera por las otras; más de 10, redundante.
export function vif(columnas) {
  const completas = [];
  for (let i = 0; i < (columnas[0]?.length ?? 0); i++) if (columnas.every((c) => esNumero(c[i]))) completas.push(i);
  const sub = columnas.map((c) => completas.map((i) => c[i]));
  const r = matrizDeCorrelacion(sub);
  if (r.some((fila) => fila.some((v) => v === null))) return { vif: columnas.map(() => null), filas: completas.length };
  const inv = invertir(r);
  return { vif: inv ? inv.map((fila, i) => fila[i]) : columnas.map(() => Infinity), filas: completas.length };
}

// ------------------------------------------------------------- pruebas
// t de Welch (no supone varianzas iguales). d de Cohen con el desvío
// combinado, y g de Hedges, que lo corrige para muestras chicas.
export function tWelch(lista1, lista2) {
  const a = numeros(lista1), b = numeros(lista2);
  const na = a.length, nb = b.length;
  if (na < 2 || nb < 2) return null;
  const ma = media(a), mb = media(b), va = varianza(a), vb = varianza(b);
  const ee = Math.sqrt(va / na + vb / nb);
  const diferencia = ma - mb;
  if (ee === 0) return { t: null, gl: null, p: null, diferencia, ic: null, d: null, g: null, n1: na, n2: nb };
  const t = diferencia / ee;
  const gl = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
  const tc = tCritico(gl);
  const combinado = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));
  const d = combinado > 0 ? diferencia / combinado : null;
  return {
    t, gl, p: pT(t, gl), diferencia, ic: [diferencia - tc * ee, diferencia + tc * ee], d,
    g: d === null ? null : d * (1 - 3 / (4 * (na + nb) - 9)), n1: na, n2: nb, media1: ma, media2: mb,
  };
}

// t con varianza combinada (la que equivale al ANOVA de dos grupos).
export function tCombinado(lista1, lista2) {
  const a = numeros(lista1), b = numeros(lista2);
  const na = a.length, nb = b.length;
  if (na < 2 || nb < 2) return null;
  const sp2 = ((na - 1) * varianza(a) + (nb - 1) * varianza(b)) / (na + nb - 2);
  const t = (media(a) - media(b)) / Math.sqrt(sp2 * (1 / na + 1 / nb));
  return { t, gl: na + nb - 2, p: pT(t, na + nb - 2) };
}

// Mann-Whitney: aproximación normal con la corrección por empates, sin
// corrección de continuidad. El AUC es la probabilidad de que un valor del
// primer grupo supere a uno del segundo (empates a medias); delta de Cliff
// = 2 AUC - 1.
export function mannWhitney(lista1, lista2) {
  const a = numeros(lista1), b = numeros(lista2);
  const na = a.length, nb = b.length, n = na + nb;
  if (!na || !nb) return null;
  const { rangos: r, empates } = rangos([...a, ...b]);
  const ra = suma(r.slice(0, na));
  const u = ra - (na * (na + 1)) / 2;
  const auc = u / (na * nb);
  const correccion = n > 1 ? suma(empates.map((t) => t ** 3 - t)) / (n * (n - 1)) : 0;
  const sigma = Math.sqrt(((na * nb) / 12) * (n + 1 - correccion));
  const z = sigma > 0 ? (u - (na * nb) / 2) / sigma : 0;
  return { u, z, p: sigma > 0 ? pNormal(z) : 1, auc, deltaCliff: 2 * auc - 1, r: z / Math.sqrt(n), n1: na, n2: nb };
}

// Chi cuadrado de independencia sobre una tabla de conteos (filas ×
// columnas). Saca filas y columnas vacías; avisa cuántas celdas esperan
// menos de 5 (con muchas, mejor Fisher o juntar categorías). V de Cramér
// como tamaño del efecto.
export function chiCuadrado(tabla) {
  let t = tabla.filter((fila) => suma(fila) > 0);
  const cols = t[0]?.map((_, j) => j).filter((j) => suma(t.map((fila) => fila[j])) > 0) ?? [];
  t = t.map((fila) => cols.map((j) => fila[j]));
  const r = t.length, c = cols.length;
  if (r < 2 || c < 2) return null;
  const n = suma(t.map(suma));
  const totFila = t.map(suma), totCol = cols.map((_, j) => suma(t.map((fila) => fila[j])));
  let chi2 = 0, chicos = 0;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const e = (totFila[i] * totCol[j]) / n;
      if (e < 5) chicos++;
      chi2 += (t[i][j] - e) ** 2 / e;
    }
  }
  const gl = (r - 1) * (c - 1);
  return { chi2, gl, p: pChiCuadrado(chi2, gl), v: Math.sqrt(chi2 / (n * (Math.min(r, c) - 1))), celdasChicas: chicos, celdas: r * c, n };
}

const lnFactorial = (k) => jStat.gammaln(k + 1);

// Exacta de Fisher para una tabla de 2 × 2 [[a, b], [c, d]], a dos colas:
// suma las tablas con los mismos márgenes que son tan o menos probables.
export function fisherExacto(a, b, c, d) {
  const f1 = a + b, f2 = c + d, c1 = a + c, n = f1 + f2;
  const lnP = (x) => lnFactorial(f1) + lnFactorial(f2) + lnFactorial(c1) + lnFactorial(n - c1)
    - lnFactorial(n) - lnFactorial(x) - lnFactorial(f1 - x) - lnFactorial(c1 - x) - lnFactorial(f2 - c1 + x);
  const observada = lnP(a);
  let p = 0;
  for (let x = Math.max(0, c1 - f2); x <= Math.min(f1, c1); x++) {
    const lp = lnP(x);
    if (lp <= observada + 1e-7) p += Math.exp(lp);
  }
  return { p: Math.min(1, p), razonDeMomios: razonDeMomios(a, b, c, d) };
}

// Razón de momios con intervalo de Woolf; con una celda en cero se suma 0,5
// a todas (Haldane), si no la razón es 0 o infinita.
export function razonDeMomios(a, b, c, d) {
  const cero = [a, b, c, d].some((x) => x === 0);
  const [A, B, C, D] = cero ? [a + 0.5, b + 0.5, c + 0.5, d + 0.5] : [a, b, c, d];
  const or = (A * D) / (B * C);
  const ee = Math.sqrt(1 / A + 1 / B + 1 / C + 1 / D);
  return { valor: or, ic: [Math.exp(Math.log(or) - 1.96 * ee), Math.exp(Math.log(or) + 1.96 * ee)] };
}

// ANOVA de un factor. Eta cuadrado: la parte de la varianza que explican
// los grupos.
export function anova(listas) {
  const grupos = listas.map(numeros).filter((g) => g.length);
  const k = grupos.length, n = suma(grupos.map((g) => g.length));
  if (k < 2 || n <= k) return null;
  const m = media(grupos.flat());
  const ssb = suma(grupos.map((g) => g.length * (media(g) - m) ** 2));
  const ssw = suma(grupos.map((g) => { const mg = media(g); return suma(g.map((x) => (x - mg) ** 2)); }));
  const gl1 = k - 1, gl2 = n - k;
  const f = ssw > 0 ? ssb / gl1 / (ssw / gl2) : null;
  return { f, gl1, gl2, p: f === null ? null : pF(f, gl1, gl2), eta2: ssb + ssw > 0 ? ssb / (ssb + ssw) : null };
}

// Kruskal-Wallis con la corrección por empates. Épsilon cuadrado como
// tamaño del efecto.
export function kruskalWallis(listas) {
  const grupos = listas.map(numeros).filter((g) => g.length);
  const k = grupos.length, n = suma(grupos.map((g) => g.length));
  if (k < 2 || n < 3) return null;
  const { rangos: r, empates } = rangos(grupos.flat());
  let i = 0, s = 0;
  for (const g of grupos) {
    const rg = suma(r.slice(i, i + g.length));
    s += (rg * rg) / g.length;
    i += g.length;
  }
  const h0 = (12 / (n * (n + 1))) * s - 3 * (n + 1);
  const c = 1 - suma(empates.map((t) => t ** 3 - t)) / (n ** 3 - n);
  const h = c > 0 ? h0 / c : null;
  return { h, gl: k - 1, p: h === null ? null : pChiCuadrado(h, k - 1), epsilon2: h === null ? null : (h * (n + 1)) / (n * n - 1) };
}

// Normalidad: D'Agostino-Pearson (asimetría y curtosis, como scipy
// normaltest; pide 20 o más) y Jarque-Bera. Con miles de casos casi nada es
// normal: sirve para elegir la prueba (t o Mann-Whitney), no para concluir.
export function normalidad(lista) {
  const xs = numeros(lista);
  const n = xs.length;
  if (n < 20) return { n, k2: null, p: null, jb: null, pJb: null };
  const { m2, m3, m4 } = momentos(xs);
  if (m2 === 0) return { n, k2: null, p: null, jb: null, pJb: null };
  const g1 = m3 / m2 ** 1.5, b2 = m4 / m2 ** 2;
  // Prueba de asimetría.
  let y = g1 * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
  const beta2 = (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const w2 = -1 + Math.sqrt(2 * (beta2 - 1));
  const delta = 1 / Math.sqrt(0.5 * Math.log(w2));
  const alfa = Math.sqrt(2 / (w2 - 1));
  if (y === 0) y = 1;
  const zs = delta * Math.log(y / alfa + Math.sqrt((y / alfa) ** 2 + 1));
  // Prueba de curtosis.
  const e = (3 * (n - 1)) / (n + 1);
  const varb2 = (24 * n * (n - 2) * (n - 3)) / ((n + 1) ** 2 * (n + 3) * (n + 5));
  const x = (b2 - e) / Math.sqrt(varb2);
  const raizBeta1 = ((6 * (n * n - 5 * n + 2)) / ((n + 7) * (n + 9))) * Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)));
  const A = 6 + (8 / raizBeta1) * (2 / raizBeta1 + Math.sqrt(1 + 4 / raizBeta1 ** 2));
  const term1 = 1 - 2 / (9 * A);
  const denom = 1 + x * Math.sqrt(2 / (A - 4));
  const term2 = denom === 0 ? NaN : Math.sign(denom) * Math.cbrt((1 - 2 / A) / Math.abs(denom));
  const zk = (term1 - term2) / Math.sqrt(2 / (9 * A));
  const k2 = zs * zs + zk * zk;
  const jb = (n / 6) * (g1 * g1 + (b2 - 3) ** 2 / 4);
  return { n, k2, p: Number.isFinite(k2) ? pChiCuadrado(k2, 2) : null, jb, pJb: pChiCuadrado(jb, 2) };
}

// ------------------------------------------- discriminación del puntaje
// `filas`: [{ puntaje, malo }]. Los bloqueados no llevan puntaje del motor
// y se sacan antes (lab_auc hace lo mismo).
function conPuntaje(filas) {
  return filas.filter((f) => esNumero(f.puntaje) && typeof f.malo === "boolean");
}

// AUC con el intervalo de Hanley-McNeil (el mismo de lab_calcular_desempeno).
export function aucPuntaje(filas) {
  const base = conPuntaje(filas);
  const buenos = base.filter((f) => !f.malo).map((f) => f.puntaje), malos = base.filter((f) => f.malo).map((f) => f.puntaje);
  if (!buenos.length || !malos.length) return { auc: null, buenos: buenos.length, malos: malos.length };
  const auc = mannWhitney(buenos, malos).auc;
  const nb = buenos.length, nm = malos.length;
  const ee = Math.sqrt((auc * (1 - auc) + (nb - 1) * (auc / (2 - auc) - auc ** 2) + (nm - 1) * ((2 * auc ** 2) / (1 + auc) - auc ** 2)) / (nb * nm));
  return { auc, ic: [Math.max(0, auc - 1.96 * ee), Math.min(1, auc + 1.96 * ee)], gini: 2 * auc - 1, buenos: nb, malos: nm };
}

// Acumulados por puntaje, de menor a mayor: cuántos buenos y malos quedan en
// "puntaje <= u" para cada u distinto. Sobre esto salen ROC, KS, la curva de
// precisión y los umbrales sin volver a recorrer las filas.
export function acumuladosPorPuntaje(filas) {
  const base = conPuntaje(filas).sort((a, b) => a.puntaje - b.puntaje);
  const totalMalos = base.filter((f) => f.malo).length, totalBuenos = base.length - totalMalos;
  const pasos = [];
  let malos = 0, buenos = 0;
  for (let i = 0; i < base.length;) {
    const u = base[i].puntaje;
    while (i < base.length && base[i].puntaje === u) { if (base[i].malo) malos++; else buenos++; i++; }
    pasos.push({ puntaje: u, malos, buenos });
  }
  return { pasos, totalMalos, totalBuenos };
}

// Curva ROC rechazando de abajo hacia arriba: sensibilidad = malos con
// puntaje <= u sobre todos los malos; 1 - especificidad = lo mismo con los
// buenos. Su área es el AUC.
export function curvaRoc(filas) {
  const { pasos, totalMalos, totalBuenos } = acumuladosPorPuntaje(filas);
  if (!totalMalos || !totalBuenos) return null;
  const puntos = [{ x: 0, y: 0, puntaje: null }, ...pasos.map((p) => ({ x: p.buenos / totalBuenos, y: p.malos / totalMalos, puntaje: p.puntaje }))];
  let area = 0;
  for (let i = 1; i < puntos.length; i++) area += ((puntos[i].x - puntos[i - 1].x) * (puntos[i].y + puntos[i - 1].y)) / 2;
  return { puntos, auc: area };
}

// KS: la mayor distancia entre la proporción acumulada de malos y la de
// buenos, y el puntaje donde ocurre.
export function ks(filas) {
  const { pasos, totalMalos, totalBuenos } = acumuladosPorPuntaje(filas);
  if (!totalMalos || !totalBuenos) return null;
  let max = 0, puntaje = null;
  const malos = [{ x: pasos[0]?.puntaje ?? 0, y: 0 }], buenos = [{ x: pasos[0]?.puntaje ?? 0, y: 0 }];
  for (const p of pasos) {
    const fm = p.malos / totalMalos, fb = p.buenos / totalBuenos;
    malos.push({ x: p.puntaje, y: fm });
    buenos.push({ x: p.puntaje, y: fb });
    if (Math.abs(fm - fb) > max) { max = Math.abs(fm - fb); puntaje = p.puntaje; }
  }
  return { ks: max, puntaje, malos, buenos };
}

// Precisión y sensibilidad para detectar malos. La precisión media es la
// definición de scikit-learn (suma de la precisión por cada salto de
// sensibilidad); la línea de base es la tasa de malos.
export function curvaPrecision(filas) {
  const { pasos, totalMalos, totalBuenos } = acumuladosPorPuntaje(filas);
  if (!totalMalos || !totalBuenos) return null;
  const puntos = [];
  let ap = 0, anterior = 0;
  for (const p of pasos) {
    const sens = p.malos / totalMalos, prec = p.malos / (p.malos + p.buenos);
    puntos.push({ x: sens, y: prec, puntaje: p.puntaje });
    ap += (sens - anterior) * prec;
    anterior = sens;
  }
  return { puntos, precisionMedia: ap, base: totalMalos / (totalMalos + totalBuenos) };
}

// Política "aprobar desde el puntaje u": lo que pasaría con cada umbral.
// Simula una regla, no al motor (que no decide por un umbral de puntaje).
export function umbral(acumulados, u) {
  const { pasos, totalMalos, totalBuenos } = acumulados;
  let rechazados = { malos: 0, buenos: 0 };
  for (const p of pasos) { if (p.puntaje < u) rechazados = p; else break; }
  const total = totalMalos + totalBuenos;
  const aprobadosMalos = totalMalos - rechazados.malos, aprobadosBuenos = totalBuenos - rechazados.buenos;
  const aprobados = aprobadosMalos + aprobadosBuenos, nRechazados = rechazados.malos + rechazados.buenos;
  return {
    umbral: u, aprobados, rechazados: nRechazados,
    tasaAprobacion: aprobados / total,
    tasaMalosAprobados: aprobados ? aprobadosMalos / aprobados : null,
    tasaMalosRechazados: nRechazados ? rechazados.malos / nRechazados : null,
    sensibilidad: totalMalos ? rechazados.malos / totalMalos : null,
    especificidad: totalBuenos ? aprobadosBuenos / totalBuenos : null,
    precision: nRechazados ? rechazados.malos / nRechazados : null,
    malosAprobados: aprobadosMalos, buenosRechazados: rechazados.buenos,
  };
}

// --------------------------------------------------------- calibración
export const sigmoide = (z) => 1 / (1 + Math.exp(-z));

// Regresión logística por Newton-Raphson (mínimos cuadrados reponderados),
// con intercepto y un poco de cresta (lambda) para que una variable que
// separa perfecto no lleve los coeficientes al infinito. Estandariza las
// columnas por dentro y devuelve los coeficientes en la escala original.
export function regresionLogistica(X, y, { lambda = 1e-6, iteraciones = 100 } = {}) {
  const n = X.length, k = X[0]?.length ?? 0;
  const medias = Array.from({ length: k }, (_, j) => media(X.map((f) => f[j])));
  const desvios = Array.from({ length: k }, (_, j) => desvio(X.map((f) => f[j])) || 1);
  const Z = X.map((f) => [1, ...f.map((v, j) => (v - medias[j]) / desvios[j])]);
  let beta = Array.from({ length: k + 1 }, () => 0);
  let convergio = false, hessiano = null;
  for (let it = 0; it < iteraciones; it++) {
    const g = Array.from({ length: k + 1 }, () => 0);
    const H = Array.from({ length: k + 1 }, () => Array.from({ length: k + 1 }, () => 0));
    for (let i = 0; i < n; i++) {
      const p = sigmoide(Z[i].reduce((s, z, j) => s + z * beta[j], 0));
      const w = p * (1 - p);
      for (let a = 0; a <= k; a++) {
        g[a] += Z[i][a] * (y[i] - p);
        for (let b = a; b <= k; b++) H[a][b] += w * Z[i][a] * Z[i][b];
      }
    }
    for (let a = 0; a <= k; a++) {
      for (let b = 0; b < a; b++) H[a][b] = H[b][a];
      if (a > 0) { H[a][a] += lambda; g[a] -= lambda * beta[a]; }
    }
    const inv = invertir(H);
    if (!inv) break;
    hessiano = inv;
    const paso = inv.map((fila) => fila.reduce((s, v, j) => s + v * g[j], 0));
    beta = beta.map((b, j) => b + paso[j]);
    if (Math.max(...paso.map(Math.abs)) < 1e-9) { convergio = true; break; }
  }
  // De la escala estandarizada a la original.
  const coeficientes = [beta[0] - suma(beta.slice(1).map((b, j) => (b * medias[j]) / desvios[j])), ...beta.slice(1).map((b, j) => b / desvios[j])];
  const errores = hessiano ? [null, ...beta.slice(1).map((_, j) => Math.sqrt(hessiano[j + 1][j + 1]) / desvios[j])] : null;
  const predecir = (fila) => sigmoide(coeficientes[0] + fila.reduce((s, v, j) => s + v * coeficientes[j + 1], 0));
  return { coeficientes, errores, convergio, predecir };
}

// Calibración: por tramos de igual tamaño de la probabilidad predicha,
// predicho contra observado. Brier (error cuadrático medio de la
// probabilidad), ECE (distancia media ponderada entre predicho y observado)
// y Hosmer-Lemeshow (chi cuadrado con tramos - 2 grados de libertad).
export function calibracion(probabilidades, malos, tramos = 10) {
  const pares2 = probabilidades.map((p, i) => [p, malos[i] ? 1 : 0]).filter(([p]) => esNumero(p)).sort((a, b) => a[0] - b[0]);
  const n = pares2.length;
  if (!n) return null;
  const brier = suma(pares2.map(([p, y]) => (p - y) ** 2)) / n;
  const tabla = [];
  for (let t = 0; t < tramos; t++) {
    const parte = pares2.slice(Math.floor((t * n) / tramos), Math.floor(((t + 1) * n) / tramos));
    if (!parte.length) continue;
    const m = suma(parte.map(([, y]) => y));
    tabla.push({ desde: parte[0][0], hasta: parte[parte.length - 1][0], n: parte.length, malos: m, predicho: media(parte.map(([p]) => p)), observado: m / parte.length, ic: wilson(m, parte.length) });
  }
  const ece = suma(tabla.map((t) => (t.n / n) * Math.abs(t.observado - t.predicho)));
  let hl = 0;
  for (const t of tabla) {
    const e = t.n * t.predicho;
    if (e > 0 && e < t.n) hl += (t.malos - e) ** 2 / (e * (1 - t.predicho));
  }
  const gl = Math.max(1, tabla.length - 2);
  return { n, brier, ece, hosmerLemeshow: { chi2: hl, gl, p: pChiCuadrado(hl, gl) }, tabla };
}

// --------------------------------------------------------- supervivencia
// Kaplan-Meier: `sujetos` = [{ tiempo, evento }] (evento = cayó; si no, el
// seguimiento terminó en `tiempo` sin caer: censurado). Intervalo de
// Greenwood. Así se usa el crédito que todavía no maduró en vez de tirarlo.
export function kaplanMeier(sujetos) {
  const base = sujetos.filter((s) => esNumero(s.tiempo) && s.tiempo >= 0).sort((a, b) => a.tiempo - b.tiempo);
  let enRiesgo = base.length, s = 1, greenwood = 0;
  const pasos = [{ tiempo: 0, supervivencia: 1, enRiesgo, eventos: 0, censurados: 0, ic: [1, 1] }];
  for (let i = 0; i < base.length;) {
    const t = base[i].tiempo;
    let d = 0, c = 0;
    while (i < base.length && base[i].tiempo === t) { if (base[i].evento) d++; else c++; i++; }
    if (d > 0) {
      s *= 1 - d / enRiesgo;
      if (enRiesgo > d) greenwood += d / (enRiesgo * (enRiesgo - d));
      const ee = s * Math.sqrt(greenwood);
      pasos.push({ tiempo: t, supervivencia: s, enRiesgo, eventos: d, censurados: c, ic: [Math.max(0, s - 1.96 * ee), Math.min(1, s + 1.96 * ee)] });
    } else if (c > 0) {
      pasos[pasos.length - 1] = { ...pasos[pasos.length - 1], censurados: pasos[pasos.length - 1].censurados + c };
    }
    enRiesgo -= d + c;
  }
  return pasos;
}

// Log-rank para k grupos: ¿las curvas difieren más de lo que da el azar?
export function logRank(grupos) {
  const todos = grupos.flatMap((g, k) => g.filter((s) => esNumero(s.tiempo)).map((s) => ({ ...s, k })));
  const K = grupos.length;
  if (K < 2) return null;
  const tiempos = [...new Set(todos.filter((s) => s.evento).map((s) => s.tiempo))].sort((a, b) => a - b);
  const oMenosE = Array.from({ length: K }, () => 0);
  const V = Array.from({ length: K }, () => Array.from({ length: K }, () => 0));
  for (const t of tiempos) {
    const nk = Array.from({ length: K }, () => 0), dk = Array.from({ length: K }, () => 0);
    for (const s of todos) {
      if (s.tiempo >= t) nk[s.k]++;
      if (s.tiempo === t && s.evento) dk[s.k]++;
    }
    const n = suma(nk), d = suma(dk);
    if (n < 2) continue;
    for (let a = 0; a < K; a++) {
      oMenosE[a] += dk[a] - (d * nk[a]) / n;
      for (let b = 0; b < K; b++) V[a][b] += ((d * (n - d)) / (n - 1)) * (nk[a] / n) * ((a === b ? 1 : 0) - nk[b] / n);
    }
  }
  const inv = invertir(V.slice(0, K - 1).map((fila) => fila.slice(0, K - 1)));
  if (!inv) return null;
  const u = oMenosE.slice(0, K - 1);
  const chi2 = suma(u.map((ua, a) => ua * suma(u.map((ub, b) => inv[a][b] * ub))));
  return { chi2, gl: K - 1, p: pChiCuadrado(chi2, K - 1) };
}

// ------------------------------------------------------ IV, WoE y PSI
// Los tramos se describen como datos para poder mostrarlos, guardarlos y
// aplicarlos a otro corte: { tipo: 'intervalo', desde, hasta } (desde
// excluido, hasta incluido; null = sin límite), { tipo: 'valor', valor } o
// { tipo: 'sin_dato' }.
export function enTramo(tramo, x) {
  if (tramo.tipo === "sin_dato") return x === null || x === undefined || (typeof x === "number" && !Number.isFinite(x));
  if (x === null || x === undefined) return false;
  if (tramo.tipo === "valor") return String(x) === String(tramo.valor);
  return esNumero(x) && (tramo.desde === null || x > tramo.desde) && (tramo.hasta === null || x <= tramo.hasta);
}

// Intervalos a partir de cortes: (-inf, c1], (c1, c2], ..., (ck, inf).
export function tramosDeCortes(cortes) {
  const c = [...new Set(cortes.filter(esNumero))].sort((a, b) => a - b);
  return [...c.map((h, i) => ({ tipo: "intervalo", desde: i ? c[i - 1] : null, hasta: h })), { tipo: "intervalo", desde: c.length ? c[c.length - 1] : null, hasta: null }];
}

// Cortes en los cuantiles de los valores (los empates quedan juntos: un
// tramo puede tener más gente que otro).
export function cortesPorCuantiles(lista, k = 4) {
  const o = ordenar(numeros(lista));
  if (!o.length) return [];
  const cortes = [...new Set(Array.from({ length: k - 1 }, (_, i) => cuantil(o, (i + 1) / k)))];
  return cortes.filter((c) => c < o[o.length - 1]);
}

// Los tramos por defecto de una variable: categorías si es texto, sí/no o
// tiene 6 valores o menos; si no, cuantiles; siempre un tramo para "sin
// dato" si hay faltantes.
export function tramosPorDefecto(valores, k = 4) {
  const presentes = valores.filter((v) => v !== null && v !== undefined && !(typeof v === "number" && !Number.isFinite(v)));
  // El valor original (un sí/no sigue siendo booleano, para la etiqueta).
  const originales = new Map(presentes.map((v) => [String(v), v]));
  const distintos = [...originales.keys()];
  const numerica = presentes.length && presentes.every(esNumero);
  const tramos = !numerica || distintos.length <= 6
    ? distintos.sort((a, b) => (numerica ? Number(a) - Number(b) : a.localeCompare(b))).map((v) => ({ tipo: "valor", valor: originales.get(v) }))
    : tramosDeCortes(cortesPorCuantiles(presentes, k));
  if (presentes.length < valores.length) tramos.push({ tipo: "sin_dato" });
  return tramos;
}

export function etiquetaDeTramo(t, formato = (x) => String(x)) {
  if (t.tipo === "sin_dato") return "sin dato";
  if (t.tipo === "valor") return typeof t.valor === "boolean" ? (t.valor ? "sí" : "no") : String(t.valor);
  if (t.desde === null && t.hasta === null) return "todos";
  if (t.desde === null) return `hasta ${formato(t.hasta)}`;
  if (t.hasta === null) return `más de ${formato(t.desde)}`;
  return `más de ${formato(t.desde)} a ${formato(t.hasta)}`;
}

// WoE e IV con el mismo suavizado de lab_calcular_variables (0,5 por tramo),
// para que el número del navegador y el de la base digan lo mismo.
export function ivWoe(valores, malos, tramos) {
  const conteo = tramos.map((t) => ({ ...t, n: 0, malos: 0 }));
  let sinTramo = 0;
  for (let i = 0; i < valores.length; i++) {
    const t = conteo.find((c) => enTramo(c, valores[i]));
    if (!t) { sinTramo++; continue; }
    t.n++;
    if (malos[i]) t.malos++;
  }
  const llenos = conteo.filter((t) => t.n > 0);
  return { ...ivDeConteos(llenos), sinTramo };
}

// El IV a partir de los conteos de cada tramo ({ n, malos }); completa en
// cada tramo su WoE, su aporte, la tasa y el intervalo.
export function ivDeConteos(tramos) {
  const M = suma(tramos.map((t) => t.malos)), B = suma(tramos.map((t) => t.n - t.malos)), k = tramos.length;
  let iv = 0;
  for (const t of tramos) {
    const pb = (t.n - t.malos + 0.5) / (B + 0.5 * k), pm = (t.malos + 0.5) / (M + 0.5 * k);
    t.woe = Math.log(pb / pm);
    t.aporte = (pb - pm) * t.woe;
    t.tasa = t.malos / t.n;
    t.ic = wilson(t.malos, t.n);
    iv += t.aporte;
  }
  return { tramos, iv, n: B + M, malos: M };
}

// Junta tramos vecinos (sin tocar "sin dato") hasta que la tasa de malos
// suba o baje siempre en el mismo sentido: un tramo que rompe la tendencia
// casi siempre es ruido, y una regla de crédito necesita una variable que
// se lea en una sola dirección.
export function tramosMonotonos(valores, malos, tramos) {
  const numericos = tramos.filter((t) => t.tipo === "intervalo");
  const otros = tramos.filter((t) => t.tipo !== "intervalo");
  let actual = numericos;
  for (let vuelta = 0; vuelta < 50 && actual.length > 2; vuelta++) {
    const tasas = ivWoe(valores, malos, actual).tramos.map((t) => t.tasa);
    if (tasas.length !== actual.length) break;
    const sube = tasas[tasas.length - 1] >= tasas[0];
    const rompe = tasas.findIndex((t, i) => i > 0 && (sube ? t < tasas[i - 1] : t > tasas[i - 1]));
    if (rompe === -1) break;
    const a = rompe - 1;
    actual = [...actual.slice(0, a), { tipo: "intervalo", desde: actual[a].desde, hasta: actual[rompe].hasta }, ...actual.slice(rompe + 1)];
  }
  return [...actual, ...otros];
}

// PSI entre dos distribuciones de conteos por tramo, con el suavizado de
// lab_estabilidad (0,5 por tramo). Menos de 0,1 estable; hasta 0,25 mirar;
// más, cambió.
export function psi(conteosBase, conteosNuevo) {
  const k = conteosBase.length;
  const tb = suma(conteosBase), tn = suma(conteosNuevo);
  let total = 0;
  const tramos = conteosBase.map((b, i) => {
    const pb = (b + 0.5) / (tb + 0.5 * k), pn = (conteosNuevo[i] + 0.5) / (tn + 0.5 * k);
    total += (pn - pb) * Math.log(pn / pb);
    return { base: pb, nuevo: pn };
  });
  return { psi: total, tramos };
}

// ---------------------------------------------------------- multivariado
// Lo usan los guiones de la fase F (PCA y K-means) y alguna pantalla chica.
export function estandarizar(columnas) {
  return columnas.map((c) => {
    const m = media(c), s = desvio(c) || 1;
    return c.map((x) => (x - m) / s);
  });
}

// Autovalores y autovectores de una matriz simétrica (Jacobi). Para 59
// variables converge en milisegundos y no necesita una librería de álgebra.
export function autovalores(simetrica) {
  const n = simetrica.length;
  const a = simetrica.map((f) => [...f]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let barrido = 0; barrido < 100; barrido++) {
    let fuera = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) fuera += a[p][q] ** 2;
    if (fuera < 1e-20) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const orden = a.map((fila, i) => [fila[i], i]).sort((x, y) => y[0] - x[0]);
  return { valores: orden.map(([val]) => val), vectores: orden.map(([, i]) => v.map((fila) => fila[i])) };
}
