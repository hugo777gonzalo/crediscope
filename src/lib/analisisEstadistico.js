// Los cálculos del Descubrimiento estadístico (fase D de
// docs/laboratorio-pantallas.md), sin React: las pestañas los llaman y
// scripts/probar-pantallas-laboratorio.mjs los corre contra los cortes
// reales. Trabajan sobre las variables congeladas del corte (las del
// catálogo, sacadas del perfil del día del análisis), una persona una vez.

import {
  esNumero, descriptivas, histograma, wilson, pearson, spearman, kendall, matrizDeCorrelacion, vif,
  tWelch, mannWhitney, chiCuadrado, fisherExacto, razonDeMomios, anova, kruskalWallis, normalidad,
  benjaminiHochberg, ivWoe, tramosPorDefecto, tramosMonotonos, tramosDeCortes, cortesPorCuantiles, etiquetaDeTramo,
} from "./estadistica.js";
import { filasObservadas, mesDe } from "./filasDelCorte.js";

const faltante = (v) => v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));

// Una columna por variable del catálogo, alineada con las filas observadas.
export function columnasDelCorte(filas, catalogo) {
  const obs = filasObservadas(filas, { unaPorPersona: true });
  const malos = obs.map((f) => f.malo);
  return {
    filas: obs, malos,
    columnas: catalogo.map((v) => ({
      id: v.id, nombre: v.nombre, grupo: v.grupo, tipo: v.tipo, uso: v.uso, enModelo: v.en_perfil_del_modelo,
      valores: obs.map((f) => (faltante(f.variables[v.id]) ? null : f.variables[v.id])),
    })).filter((c) => c.valores.some((x) => x !== null)),
    sinDatos: catalogo.filter((v) => obs.every((f) => faltante(f.variables[v.id]))).map((v) => v.id),
  };
}

// Un sí/no como 0 y 1, para las correlaciones; el resto, número o nada.
export const comoNumero = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : esNumero(v) ? v : null);
const partir = (valores, malos) => [valores.filter((_, i) => malos[i]), valores.filter((_, i) => !malos[i])];

// ---------------------------------------------------------- descriptivas
export function descriptivasNumericas({ columnas, malos }) {
  return columnas.filter((c) => c.tipo === "numero").map((c) => {
    const [vm, vb] = partir(c.valores, malos);
    const dm = descriptivas(vm), db = descriptivas(vb);
    return { id: c.id, nombre: c.nombre, grupo: c.grupo, enModelo: c.enModelo, uso: c.uso, ...descriptivas(c.valores), mediaMalos: dm.media ?? null, mediaBuenos: db.media ?? null, medianaMalos: dm.mediana ?? null, medianaBuenos: db.mediana ?? null };
  });
}

// Frecuencias y tasa de malos por categoría (los sí/no también).
export function descriptivasCategoricas({ columnas, malos }) {
  return columnas.filter((c) => c.tipo !== "numero").map((c) => {
    const conteo = new Map();
    c.valores.forEach((v, i) => {
      const clave = v === null ? null : String(v);
      const e = conteo.get(clave) ?? { valor: v === null ? "sin dato" : typeof v === "boolean" ? (v ? "sí" : "no") : String(v), n: 0, malos: 0, faltante: v === null };
      e.n++;
      if (malos[i]) e.malos++;
      conteo.set(clave, e);
    });
    const categorias = [...conteo.values()].map((e) => ({ ...e, tasa: e.malos / e.n, ic: wilson(e.malos, e.n) })).sort((a, b) => b.n - a.n);
    const presentes = categorias.filter((e) => !e.faltante);
    const n = presentes.reduce((s, e) => s + e.n, 0);
    return {
      id: c.id, nombre: c.nombre, grupo: c.grupo, tipo: c.tipo, enModelo: c.enModelo, uso: c.uso, n, faltantes: c.valores.length - n,
      cardinalidad: presentes.length, dominante: presentes[0] ? { valor: presentes[0].valor, parte: presentes[0].n / n } : null, categorias,
    };
  });
}

// --------------------------------------------------------- distribuciones
// Histograma con la tasa de malos de cada tramo, y la parte de cada clase
// por tramo (para comparar formas aunque haya diez buenos por malo).
export function distribucion(columna, malos, { recorte = 0 } = {}) {
  const pares = columna.valores.map((v, i) => [comoNumero(v), malos[i]]).filter(([v]) => v !== null);
  const { tramos, fuera, discreto } = histograma(pares.map(([v]) => v), { recorte });
  const ultimo = tramos.length - 1;
  const dentro = (t, i, x) => (discreto ? x === t.desde : x >= t.desde && (x < t.hasta || i === ultimo));
  const totalM = pares.filter(([, m]) => m).length, totalB = pares.length - totalM;
  const filas = tramos.map((t, i) => {
    const parte = pares.filter(([x]) => dentro(t, i, x));
    const m = parte.filter(([, mm]) => mm).length;
    return { ...t, n: parte.length, malos: m, tasa: parte.length ? m / parte.length : null, parteMalos: totalM ? m / totalM : 0, parteBuenos: totalB ? (parte.length - m) / totalB : 0 };
  });
  const [vm, vb] = partir(pares.map(([v]) => v), pares.map(([, m]) => m));
  return { tramos: filas, fuera, discreto, malos: descriptivas(vm), buenos: descriptivas(vb), todos: descriptivas(pares.map(([v]) => v)) };
}

// -------------------------------------------------------------- faltantes
// ¿La ausencia anticipa el impago, o es un problema de captura? Tasa de
// malos con y sin el dato, prueba exacta o chi cuadrado, y cuántos faltan
// por mes (una fuente que dejó de contestar se ve como un salto).
export function faltantes({ columnas, malos, filas }) {
  const porVariable = columnas.map((c) => {
    let a = 0, b = 0, cc = 0, d = 0; // sin dato y malo, sin dato y bueno, con dato y malo, con dato y bueno
    c.valores.forEach((v, i) => {
      if (v === null) { if (malos[i]) a++; else b++; } else if (malos[i]) cc++; else d++;
    });
    const sin = a + b, con = cc + d;
    let p = null;
    if (sin && con) p = sin < 1000 && con < 100000 && Math.min(a, b, cc, d) < 5 ? fisherExacto(a, b, cc, d).p : chiCuadrado([[a, b], [cc, d]])?.p ?? null;
    const porMes = new Map();
    c.valores.forEach((v, i) => {
      const mes = mesDe(filas[i].fecha);
      const e = porMes.get(mes) ?? { mes, n: 0, faltan: 0 };
      e.n++;
      if (v === null) e.faltan++;
      porMes.set(mes, e);
    });
    return {
      id: c.id, nombre: c.nombre, grupo: c.grupo, faltan: sin, parte: sin / c.valores.length,
      tasaSinDato: sin ? a / sin : null, tasaConDato: con ? cc / con : null, p, razon: sin && con ? razonDeMomios(a, b, cc, d).valor : null,
      porMes: [...porMes.values()].sort((x, y) => x.mes.localeCompare(y.mes)),
    };
  }).sort((x, y) => y.parte - x.parte);
  const qs = benjaminiHochberg(porVariable.map((v) => v.p));
  porVariable.forEach((v, i) => { v.q = qs[i]; });
  // Matriz: ¿faltan juntas? Correlación entre los indicadores de faltante
  // de las variables a las que les falta algo (1% o más).
  const conFaltas = porVariable.filter((v) => v.parte >= 0.01 && v.parte < 1);
  const indicador = (id) => columnas.find((c) => c.id === id).valores.map((v) => (v === null ? 1 : 0));
  const matriz = conFaltas.length > 1 ? matrizDeCorrelacion(conFaltas.map((v) => indicador(v.id))) : [];
  return { porVariable, matriz: { variables: conFaltas.map((v) => v.nombre), valores: matriz } };
}

// ---------------------------------------------------------- correlaciones
// Numéricas y sí/no (como 0 y 1). Con el resultado: la correlación de cada
// variable con "cayó" (punto-biserial para Pearson). VIF sobre las filas
// completas. Las categóricas se asocian con el resultado por V de Cramér.
export function correlaciones({ columnas, malos }, metodo = "pearson") {
  const usables = columnas.filter((c) => c.tipo !== "categoria" && new Set(c.valores.filter((v) => v !== null).map(String)).size > 1);
  const numericas = usables.map((c) => c.valores.map(comoNumero));
  const matriz = matrizDeCorrelacion(numericas, metodo);
  const y = malos.map((m) => (m ? 1 : 0));
  const f = metodo === "spearman" ? spearman : pearson;
  const conResultado = usables.map((c, i) => ({ id: c.id, nombre: c.nombre, enModelo: c.enModelo, uso: c.uso, ...f(numericas[i], y) })).sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0));
  const pares = [];
  for (let i = 0; i < usables.length; i++) {
    for (let j = i + 1; j < usables.length; j++) {
      if (matriz[i][j] !== null && Math.abs(matriz[i][j]) >= 0.7) pares.push({ a: usables[i].nombre, b: usables[j].nombre, r: matriz[i][j] });
    }
  }
  pares.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  // El VIF necesita filas con todas las variables: con las que faltan mucho
  // (afiliado al IESS activo falta en el 94%) quedaban 2 filas completas.
  // Se calcula con las de 80% de cobertura o más y se dice cuáles no.
  const cubiertas = usables.map((c, i) => [c, i]).filter(([c]) => c.valores.filter((v) => v !== null).length >= 0.8 * c.valores.length);
  const { vif: vifsCubiertas, filas: filasCompletas } = vif(cubiertas.map(([, i]) => numericas[i]));
  const vifs = usables.map((_, i) => {
    const k = cubiertas.findIndex(([, j]) => j === i);
    return k === -1 || filasCompletas < 50 ? null : vifsCubiertas[k];
  });
  const categoricas = columnas.filter((c) => c.tipo === "categoria").map((c) => {
    const cats = [...new Set(c.valores.filter((v) => v !== null).map(String))];
    const tabla = cats.map(() => [0, 0]);
    c.valores.forEach((v, i) => { if (v !== null) tabla[cats.indexOf(String(v))][malos[i] ? 0 : 1]++; });
    const r = chiCuadrado(tabla);
    return { id: c.id, nombre: c.nombre, v: r?.v ?? null, p: r?.p ?? null, categorias: cats.length };
  }).sort((a, b) => (b.v ?? 0) - (a.v ?? 0));
  return {
    variables: usables.map((c) => ({ id: c.id, nombre: c.nombre })), matriz, conResultado, pares,
    vif: usables.map((c, i) => ({ id: c.id, nombre: c.nombre, vif: vifs[i] })).sort((a, b) => (b.vif ?? -1) - (a.vif ?? -1)), filasCompletas, categoricas,
    sinVif: usables.filter((_, i) => vifs[i] === null).map((c) => c.nombre),
  };
}

// Un par de variables con los tres coeficientes.
export function parDeVariables(columnaA, columnaB) {
  const a = columnaA.valores.map(comoNumero), b = columnaB.valores.map(comoNumero);
  return { pearson: pearson(a, b), spearman: spearman(a, b), kendall: kendall(a, b) };
}

// -------------------------------------------------------------- inferencia
const RECOMENDACIONES = ["aprobar", "revisar", "negar", "bloqueado"];

// Las pruebas que corresponden al tipo de la variable, contra el resultado
// (y, las numéricas, también entre las recomendaciones del motor).
export function inferencia(columna, malos, filas) {
  if (columna.tipo === "numero") {
    const [vm, vb] = partir(columna.valores, malos);
    const porRecomendacion = RECOMENDACIONES.map((r) => columna.valores.filter((v, i) => v !== null && filas[i].recomendacion === r)).filter((g) => g.length >= 2);
    return {
      tipo: "numero", malos: descriptivas(vm), buenos: descriptivas(vb),
      normalidadMalos: normalidad(vm), normalidadBuenos: normalidad(vb),
      welch: tWelch(vm, vb), mannWhitney: mannWhitney(vm, vb),
      anova: porRecomendacion.length > 1 ? anova(porRecomendacion) : null, kruskal: porRecomendacion.length > 1 ? kruskalWallis(porRecomendacion) : null,
    };
  }
  const cats = [...new Set(columna.valores.filter((v) => v !== null).map(String))];
  const tabla = cats.map(() => [0, 0]);
  columna.valores.forEach((v, i) => { if (v !== null) tabla[cats.indexOf(String(v))][malos[i] ? 0 : 1]++; });
  const totalM = tabla.reduce((s, [m]) => s + m, 0), totalB = tabla.reduce((s, [, b]) => s + b, 0);
  const categorias = cats.map((k, i) => {
    const [m, b] = tabla[i];
    const etiqueta = k === "true" ? "sí" : k === "false" ? "no" : k;
    return { valor: etiqueta, n: m + b, malos: m, tasa: m / (m + b), ic: wilson(m, m + b), razon: razonDeMomios(m, b, totalM - m, totalB - b) };
  }).sort((a, b) => b.n - a.n);
  return {
    tipo: columna.tipo, categorias, chi2: chiCuadrado(tabla),
    fisher: tabla.length === 2 ? fisherExacto(tabla[0][0], tabla[0][1], tabla[1][0], tabla[1][1]) : null,
  };
}

// Una prueba por variable contra el resultado, con la corrección por
// comparaciones múltiples: Mann-Whitney para las numéricas (no supone
// normalidad, que con estos datos casi nunca hay) y chi cuadrado para el
// resto.
export function pruebasDeTodas({ columnas, malos }) {
  const filas = columnas.map((c) => {
    if (c.tipo === "numero") {
      const [vm, vb] = partir(c.valores, malos);
      const mw = vm.filter((v) => v !== null).length && vb.filter((v) => v !== null).length ? mannWhitney(vm, vb) : null;
      return { id: c.id, nombre: c.nombre, grupo: c.grupo, enModelo: c.enModelo, uso: c.uso, prueba: "Mann-Whitney", p: mw?.p ?? null, efecto: mw?.deltaCliff ?? null, medidaEfecto: "delta de Cliff" };
    }
    const r = inferencia(c, malos, []);
    return { id: c.id, nombre: c.nombre, grupo: c.grupo, enModelo: c.enModelo, uso: c.uso, prueba: "chi cuadrado", p: r.chi2?.p ?? null, efecto: r.chi2?.v ?? null, medidaEfecto: "V de Cramér" };
  });
  const qs = benjaminiHochberg(filas.map((f) => f.p));
  filas.forEach((f, i) => { f.q = qs[i]; });
  return filas.sort((a, b) => (a.p ?? 1) - (b.p ?? 1));
}

// ---------------------------------------------------------- IV y tramos
export function tramosIniciales(columna, k = 4) {
  return tramosPorDefecto(columna.valores, k);
}

// IV con los tramos dados, y su estabilidad: el mismo IV en la primera y en
// la segunda mitad por fecha (un IV que sólo existe en una mitad es ruido).
export function ivDeLaVariable(columna, malos, filas, tramos) {
  const total = ivWoe(columna.valores, malos, tramos);
  const orden = filas.map((f, i) => [f.fecha?.getTime() ?? 0, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  const mitad = Math.floor(orden.length / 2);
  const parte = (idx) => ivWoe(idx.map((i) => columna.valores[i]), idx.map((i) => malos[i]), tramos);
  return { ...total, primera: parte(orden.slice(0, mitad)), segunda: parte(orden.slice(mitad)), etiquetas: total.tramos.map((t) => etiquetaDeTramo(t, (x) => String(Math.round(x * 100) / 100))) };
}

export function tramosDesdeTexto(texto) {
  const cortes = texto.split(/[;\s]+/).map((x) => Number(x.replace(",", "."))).filter(esNumero);
  return tramosDeCortes(cortes);
}

export { tramosMonotonos, cortesPorCuantiles };

// --------------------------------------------------------- significancia
const fuerzaDelIv = (iv) => (iv < 0.02 ? "nada" : iv < 0.1 ? "débil" : iv < 0.3 ? "media" : "fuerte");

// Todo junto por variable: asociación (IV), valor p corregido, efecto,
// cobertura, estabilidad entre mitades y relevancia (si el modelo la recibe).
export function explorarSignificancia(datos) {
  const { columnas, malos, filas } = datos;
  const pruebas = new Map(pruebasDeTodas(datos).map((p) => [p.id, p]));
  return columnas.map((c) => {
    const iv = ivDeLaVariable(c, malos, filas, tramosIniciales(c));
    const p = pruebas.get(c.id);
    const cobertura = c.valores.filter((v) => v !== null).length / c.valores.length;
    // Estable: las dos mitades dicen lo mismo (las dos con IV de 0,02 o más,
    // o las dos por debajo).
    const estable = (iv.primera.iv >= 0.02) === (iv.segunda.iv >= 0.02);
    return {
      id: c.id, nombre: c.nombre, grupo: c.grupo, enModelo: c.enModelo, uso: c.uso, iv: iv.iv, fuerza: fuerzaDelIv(iv.iv),
      ivPrimera: iv.primera.iv, ivSegunda: iv.segunda.iv, estable, cobertura, p: p?.p ?? null, q: p?.q ?? null, efecto: p?.efecto ?? null, medidaEfecto: p?.medidaEfecto,
      candidata: c.uso === "decision" && !c.enModelo && iv.iv >= 0.1 && (p?.q ?? 1) < 0.05 && estable,
    };
  }).sort((a, b) => b.iv - a.iv);
}

export function resumenDeVariables(datos, significancia) {
  const { columnas, sinDatos } = datos;
  return {
    analizadas: columnas.length, numericas: columnas.filter((c) => c.tipo === "numero").length,
    categoricas: columnas.filter((c) => c.tipo === "categoria").length, siNo: columnas.filter((c) => c.tipo === "booleano").length,
    conFaltantes: columnas.filter((c) => c.valores.some((v) => v === null)).length, sinDatos,
    ivRelevante: significancia.filter((s) => s.iv >= 0.1).length, significativas: significancia.filter((s) => (s.q ?? 1) < 0.05).length,
    candidatas: significancia.filter((s) => s.candidata), inestables: significancia.filter((s) => !s.estable && s.iv >= 0.02).length,
  };
}


