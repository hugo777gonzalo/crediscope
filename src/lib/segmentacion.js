// K-medias, silueta y componentes principales para la fase F del
// Laboratorio. Los corre scripts/analisis-pesado.mjs (decisión 2: lo pesado
// fuera del navegador) y los controla scripts/probar-estadistica.mjs.
// Describen la cartera; no predicen (anexo de docs/laboratorio-de-riesgo.md).

import { autovalores, media, desvio } from "./estadistica.js";
import { azar } from "./bosque.js";

const distancia2 = (a, b) => {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) ** 2;
  return s;
};

// K-medias con arranque k-medias++ y varios reinicios: se queda con el de
// menor inercia (suma de distancias al centro).
export function kMedias(X, k, { reinicios = 10, iteraciones = 100, semilla = 1 } = {}) {
  const aleatorio = azar(semilla);
  const n = X.length, d = X[0].length;
  let mejor = null;
  for (let r = 0; r < reinicios; r++) {
    const centros = [X[Math.floor(aleatorio() * n)]];
    while (centros.length < k) {
      const pesos = X.map((x) => Math.min(...centros.map((c) => distancia2(x, c))));
      const total = pesos.reduce((s, w) => s + w, 0);
      let u = aleatorio() * total, i = 0;
      while (i < n - 1 && u > pesos[i]) { u -= pesos[i]; i++; }
      centros.push(X[i]);
    }
    let grupos = Array.from({ length: n }, () => 0);
    let c = centros.map((x) => [...x]);
    for (let it = 0; it < iteraciones; it++) {
      let cambios = 0;
      grupos = X.map((x, i) => {
        let g = 0, dmin = Infinity;
        c.forEach((cc, j) => { const dd = distancia2(x, cc); if (dd < dmin) { dmin = dd; g = j; } });
        if (g !== grupos[i]) cambios++;
        return g;
      });
      c = c.map((viejo, j) => {
        const miembros = X.filter((_, i) => grupos[i] === j);
        return miembros.length ? Array.from({ length: d }, (_, q) => miembros.reduce((s, x) => s + x[q], 0) / miembros.length) : viejo;
      });
      if (it > 0 && cambios === 0) break;
    }
    const inercia = X.reduce((s, x, i) => s + distancia2(x, c[grupos[i]]), 0);
    if (!mejor || inercia < mejor.inercia) mejor = { grupos, centros: c, inercia };
  }
  return mejor;
}

// Silueta media: para cada punto, qué tan cerca está de su grupo contra el
// grupo vecino (de -1 a 1; más de 0,5, grupos bien separados; menos de 0,25,
// no hay grupos de verdad). Cuadrática en n: se calcula sobre una muestra.
export function silueta(X, grupos) {
  const k = Math.max(...grupos) + 1;
  let suma = 0, contados = 0;
  for (let i = 0; i < X.length; i++) {
    const sumas = Array.from({ length: k }, () => 0), cuentas = Array.from({ length: k }, () => 0);
    for (let j = 0; j < X.length; j++) {
      if (i === j) continue;
      sumas[grupos[j]] += Math.sqrt(distancia2(X[i], X[j]));
      cuentas[grupos[j]]++;
    }
    if (!cuentas[grupos[i]]) continue;
    const a = sumas[grupos[i]] / cuentas[grupos[i]];
    const b = Math.min(...sumas.map((s, g) => (g === grupos[i] || !cuentas[g] ? Infinity : s / cuentas[g])));
    if (!Number.isFinite(b)) continue;
    suma += (b - a) / Math.max(a, b);
    contados++;
  }
  return contados ? suma / contados : null;
}

// Columnas estandarizadas (media 0, desvío 1); una constante queda en 0.
export function estandarizarColumnas(X) {
  const d = X[0].length;
  const ms = Array.from({ length: d }, (_, j) => media(X.map((x) => x[j])));
  const ss = Array.from({ length: d }, (_, j) => desvio(X.map((x) => x[j])) || 1);
  return { Z: X.map((x) => x.map((v, j) => (v - ms[j]) / ss[j])), medias: ms, desvios: ss };
}

// Componentes principales sobre columnas estandarizadas: los autovalores de
// la matriz de correlación dicen cuánta varianza explica cada componente; los
// autovectores, qué variables lo forman.
export function componentesPrincipales(Z) {
  const n = Z.length, d = Z[0].length;
  const C = Array.from({ length: d }, (_, a) => Array.from({ length: d }, (_, b) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Z[i][a] * Z[i][b];
    return s / (n - 1);
  }));
  const { valores, vectores } = autovalores(C);
  const total = valores.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const puntajes = (x, c) => vectores[c].reduce((s, w, j) => s + w * x[j], 0);
  return { valores, vectores, explicada: valores.map((v) => Math.max(0, v) / total), puntajes };
}
