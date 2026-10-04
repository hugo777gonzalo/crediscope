// Bosque aleatorio, importancia por permutación y SHAP para la fase F del
// Laboratorio (decisión 2 de docs/laboratorio-pantallas.md: lo pesado fuera
// del navegador). Los corre scripts/analisis-pesado.mjs en Node; en la
// máquina del negocio no hay Python, así que se escribió acá, y lo controla
// scripts/probar-estadistica.mjs:
//  - el SHAP de cada persona suma exactamente la predicción del bosque menos
//    el valor base (precisión local: la propiedad que define a SHAP);
//  - el bosque separa datos con una regla conocida.
//
// SHAP es el algoritmo exacto para árboles (TreeSHAP, Lundberg y otros,
// 2018: "Consistent individualized feature attribution for tree
// ensembles"), en la misma forma que la implementación de la librería shap.

import { aucPuntaje } from "./estadistica.js";

// Números al azar reproducibles: la misma semilla, el mismo bosque.
export function azar(semilla = 1) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------------- árbol
// CART para un resultado sí/no con Gini. Cada nodo guarda cuántas filas de
// entrenamiento le llegaron (n: lo necesita SHAP) y la proporción de malos.
function gini(malos, n) {
  if (!n) return 0;
  const p = malos / n;
  return 2 * p * (1 - p);
}

export function entrenarArbol(X, y, filas, { profundidadMaxima = 6, minHoja = 20, columnasPorNodo = null, aleatorio = Math.random } = {}) {
  const k = X[0].length;
  function crecer(indices, profundidad) {
    const n = indices.length;
    let malos = 0;
    for (const i of indices) malos += y[i];
    const nodo = { n, valor: malos / n };
    if (profundidad >= profundidadMaxima || n < 2 * minHoja || malos === 0 || malos === n) return { ...nodo, hoja: true };
    // Las columnas que puede usar este nodo (todas, o un subconjunto al azar en un bosque).
    let columnas = Array.from({ length: k }, (_, j) => j);
    if (columnasPorNodo && columnasPorNodo < k) {
      for (let a = k - 1; a > 0; a--) { const b = Math.floor(aleatorio() * (a + 1)); [columnas[a], columnas[b]] = [columnas[b], columnas[a]]; }
      columnas = columnas.slice(0, columnasPorNodo);
    }
    const base = gini(malos, n);
    let mejor = null;
    for (const j of columnas) {
      const orden = [...indices].sort((a, b) => X[a][j] - X[b][j]);
      let malosIzq = 0;
      for (let pos = 0; pos < n - 1; pos++) {
        malosIzq += y[orden[pos]];
        const izq = pos + 1;
        if (X[orden[pos]][j] === X[orden[pos + 1]][j]) continue;
        if (izq < minHoja || n - izq < minHoja) continue;
        const ganancia = base - (izq / n) * gini(malosIzq, izq) - ((n - izq) / n) * gini(malos - malosIzq, n - izq);
        if (!mejor || ganancia > mejor.ganancia) mejor = { ganancia, var: j, umbral: (X[orden[pos]][j] + X[orden[pos + 1]][j]) / 2, pos, orden };
      }
    }
    if (!mejor || mejor.ganancia <= 1e-12) return { ...nodo, hoja: true };
    return {
      ...nodo, var: mejor.var, umbral: mejor.umbral,
      izq: crecer(mejor.orden.slice(0, mejor.pos + 1), profundidad + 1),
      der: crecer(mejor.orden.slice(mejor.pos + 1), profundidad + 1),
    };
  }
  return crecer(filas, 0);
}

export function predecirArbol(nodo, x) {
  while (!nodo.hoja) nodo = x[nodo.var] <= nodo.umbral ? nodo.izq : nodo.der;
  return nodo.valor;
}

// --------------------------------------------------------------- bosque
export function entrenarBosque(X, y, { arboles = 100, profundidadMaxima = 6, minHoja = 20, semilla = 1 } = {}) {
  const aleatorio = azar(semilla);
  const n = X.length, k = X[0].length;
  const columnasPorNodo = Math.max(1, Math.round(Math.sqrt(k)));
  const bosque = [];
  for (let t = 0; t < arboles; t++) {
    const muestra = Array.from({ length: n }, () => Math.floor(aleatorio() * n));
    bosque.push(entrenarArbol(X, y, muestra, { profundidadMaxima, minHoja, columnasPorNodo, aleatorio }));
  }
  return bosque;
}

export const predecirBosque = (bosque, x) => bosque.reduce((s, a) => s + predecirArbol(a, x), 0) / bosque.length;

// El valor base: lo que predice el bosque sin saber nada de la persona (el
// promedio de malos en lo que vio cada árbol).
export const valorBase = (bosque) => bosque.reduce((s, a) => s + a.valor, 0) / bosque.length;

// -------------------------------------------------------------------- SHAP
function extender(p, ud, z, o, d) {
  p[ud] = { d, z, o, w: ud === 0 ? 1 : 0 };
  for (let i = ud - 1; i >= 0; i--) {
    p[i + 1].w += (o * p[i].w * (i + 1)) / (ud + 1);
    p[i].w = (z * p[i].w * (ud - i)) / (ud + 1);
  }
}

function deshacer(p, ud, indice) {
  const o = p[indice].o, z = p[indice].z;
  let siguiente = p[ud].w;
  for (let i = ud - 1; i >= 0; i--) {
    if (o !== 0) {
      const tmp = p[i].w;
      p[i].w = (siguiente * (ud + 1)) / ((i + 1) * o);
      siguiente = tmp - (p[i].w * z * (ud - i)) / (ud + 1);
    } else {
      p[i].w = (p[i].w * (ud + 1)) / (z * (ud - i));
    }
  }
  for (let i = indice; i < ud; i++) { p[i].d = p[i + 1].d; p[i].z = p[i + 1].z; p[i].o = p[i + 1].o; }
}

function sumaDeshecha(p, ud, indice) {
  const o = p[indice].o, z = p[indice].z;
  let siguiente = p[ud].w, total = 0;
  for (let i = ud - 1; i >= 0; i--) {
    if (o !== 0) {
      const tmp = (siguiente * (ud + 1)) / ((i + 1) * o);
      total += tmp;
      siguiente = p[i].w - tmp * z * ((ud - i) / (ud + 1));
    } else {
      total += p[i].w / z / ((ud - i) / (ud + 1));
    }
  }
  return total;
}

function recorrer(nodo, ud, padre, pz, po, pd, x, phi) {
  const p = padre.slice(0, ud + 1).map((e) => (e ? { ...e } : e));
  extender(p, ud, pz, po, pd);
  if (nodo.hoja) {
    for (let i = 1; i <= ud; i++) phi[p[i].d] += sumaDeshecha(p, ud, i) * (p[i].o - p[i].z) * nodo.valor;
    return;
  }
  const caliente = x[nodo.var] <= nodo.umbral ? nodo.izq : nodo.der;
  const frio = caliente === nodo.izq ? nodo.der : nodo.izq;
  let entraZ = 1, entraO = 1, profundidad = ud;
  const k = p.findIndex((e, i) => i <= ud && e.d === nodo.var);
  if (k !== -1) {
    entraZ = p[k].z;
    entraO = p[k].o;
    deshacer(p, profundidad, k);
    profundidad -= 1;
  }
  recorrer(caliente, profundidad + 1, p, (caliente.n / nodo.n) * entraZ, entraO, nodo.var, x, phi);
  recorrer(frio, profundidad + 1, p, (frio.n / nodo.n) * entraZ, 0, nodo.var, x, phi);
}

// SHAP de una persona en un árbol: cuánto movió cada columna la predicción
// desde el valor base del árbol.
export function shapArbol(arbol, x, k) {
  const phi = new Float64Array(k);
  recorrer(arbol, 0, [], 1, 1, -1, x, phi);
  return phi;
}

export function shapBosque(bosque, x) {
  const k = x.length;
  const total = new Float64Array(k);
  for (const a of bosque) {
    const phi = shapArbol(a, x, k);
    for (let j = 0; j < k; j++) total[j] += phi[j] / bosque.length;
  }
  return total;
}

// ------------------------------------------------------------ permutación
// Importancia por permutación: cuánto baja el AUC en las filas de prueba si
// se desordena un grupo de columnas (las de una misma variable juntas: su
// valor y su indicador de faltante). Un grupo que no baja nada no aporta.
export function importanciaPorPermutacion(bosque, X, y, grupos, { repeticiones = 3, semilla = 7 } = {}) {
  const aleatorio = azar(semilla);
  const aucDe = (filas) => aucPuntaje(filas.map((x, i) => ({ puntaje: -predecirBosque(bosque, x), malo: y[i] === 1 }))).auc;
  const base = aucDe(X);
  return {
    base,
    grupos: grupos.map(({ nombre, columnas }) => {
      let caida = 0;
      for (let r = 0; r < repeticiones; r++) {
        const orden = X.map((_, i) => i);
        for (let a = orden.length - 1; a > 0; a--) { const b = Math.floor(aleatorio() * (a + 1)); [orden[a], orden[b]] = [orden[b], orden[a]]; }
        const permutada = X.map((x, i) => {
          const copia = [...x];
          for (const j of columnas) copia[j] = X[orden[i]][j];
          return copia;
        });
        caida += base - aucDe(permutada);
      }
      return { nombre, caida: caida / repeticiones };
    }),
  };
}
