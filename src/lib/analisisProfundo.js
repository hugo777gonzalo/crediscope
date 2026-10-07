// Los cálculos del Descubrimiento profundo (fase E de
// docs/laboratorio-pantallas.md), sin React: las pestañas los llaman y
// scripts/probar-pantallas-laboratorio.mjs los corre contra los cortes
// reales.

import { mannWhitney, chiCuadrado, benjaminiHochberg, wilson, media, desvio, esNumero, tramosPorDefecto, ivWoe, etiquetaDeTramo } from "./estadistica.js";
import { filasObservadas } from "./filasDelCorte.js";
import { comoNumero, ivDeLaVariable, tramosIniciales } from "./analisisEstadistico.js";

const faltante = (v) => v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));

// ---------------------------------------------------- los que cayeron
// Dentro de una recomendación, en qué se diferencian los que cayeron de los
// que pagaron: el efecto de cada variable, los faltantes, las combinaciones de
// dos condiciones que juntas pesan más que cada una, y las variables que no se
// leen en una sola dirección (el riesgo sube y después baja). Por defecto,
// "no impago": aprobar y revisar juntos (decisión del negocio del 2026-10-06),
// que es donde están los errores del modelo.
export const NO_IMPAGO = ["aprobar", "revisar"];
export function losQueCayeron(filas, catalogo, recomendacion = "no_impago") {
  const dentro = (f) => recomendacion === "todos" || (recomendacion === "no_impago" ? NO_IMPAGO.includes(f.recomendacion) : f.recomendacion === recomendacion);
  const base = filasObservadas(filas, { unaPorPersona: true }).filter(dentro);
  const malos = base.filter((f) => f.malo), buenos = base.filter((f) => !f.malo);
  if (malos.length < 5 || buenos.length < 5) return { base, malos: malos.length, buenos: buenos.length, insuficiente: true };
  const variables = catalogo.filter((v) => base.some((f) => !faltante(f.variables[v.id])));
  const diferencias = variables.map((v) => {
    const vm = malos.map((f) => f.variables[v.id] ?? null), vb = buenos.map((f) => f.variables[v.id] ?? null);
    const faltaM = vm.filter(faltante).length / vm.length, faltaB = vb.filter(faltante).length / vb.length;
    let p = null, efecto = null, detalle = null;
    if (v.tipo === "numero") {
      const mw = mannWhitney(vm.filter(esNumero), vb.filter(esNumero));
      p = mw?.p ?? null;
      efecto = mw?.deltaCliff ?? null;
      detalle = { mediaMalos: media(vm.filter(esNumero)), mediaBuenos: media(vb.filter(esNumero)) };
    } else {
      const cats = [...new Set([...vm, ...vb].filter((x) => !faltante(x)).map(String))];
      const tabla = cats.map((k) => [vm.filter((x) => String(x) === k).length, vb.filter((x) => String(x) === k).length]);
      const r = chiCuadrado(tabla);
      p = r?.p ?? null;
      efecto = r?.v ?? null;
      detalle = { categorias: cats.map((k, i) => ({ valor: k === "true" ? "sí" : k === "false" ? "no" : k, malos: tabla[i][0] / malos.length, buenos: tabla[i][1] / buenos.length })) };
    }
    return { id: v.id, nombre: v.nombre, grupo: v.grupo, tipo: v.tipo, enModelo: v.en_perfil_del_modelo, uso: v.uso, p, efecto, faltaMalos: faltaM, faltaBuenos: faltaB, ...detalle };
  });
  const qs = benjaminiHochberg(diferencias.map((d) => d.p));
  diferencias.forEach((d, i) => { d.q = qs[i]; });
  diferencias.sort((a, b) => Math.abs(b.efecto ?? 0) - Math.abs(a.efecto ?? 0));
  return { base, malos: malos.length, buenos: buenos.length, diferencias, combinaciones: combinaciones(base, diferencias), noLineales: noLineales(base, variables) };
}

// Cada variable como una condición sí/no: un sí/no, tal cual; una numérica,
// "más que la mediana" (o "más que cero" si la mayoría tiene cero).
function condicion(base, d) {
  if (d.tipo === "booleano") return { texto: d.nombre, cumple: (f) => f.variables[d.id] === true };
  if (d.tipo !== "numero") return null;
  const xs = base.map((f) => f.variables[d.id]).filter(esNumero).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mediana = xs[Math.floor(xs.length / 2)];
  const umbral = mediana === 0 ? 0 : mediana;
  const sube = (d.efecto ?? 0) >= 0;
  return sube
    ? { texto: `${d.nombre} mayor que ${umbral.toLocaleString("es-EC")}`, cumple: (f) => esNumero(f.variables[d.id]) && f.variables[d.id] > umbral }
    : { texto: `${d.nombre} de ${umbral.toLocaleString("es-EC")} o menos`, cumple: (f) => esNumero(f.variables[d.id]) && f.variables[d.id] <= umbral };
}

const tasaDe = (fs) => (fs.length ? fs.filter((f) => f.malo).length / fs.length : null);

// Pares de las 8 variables con más efecto: la tasa con las dos condiciones
// contra la mejor de las dos por separado. "Refuerzo" mayor que 1,5 con 20
// personas o más: juntas dicen algo que ninguna dice sola.
function combinaciones(base, diferencias) {
  const fuertes = diferencias.filter((d) => d.q !== null && d.q < 0.2 && (d.tipo === "numero" || d.tipo === "booleano")).slice(0, 8)
    .map((d) => ({ d, c: condicion(base, d) })).filter((x) => x.c);
  const salida = [];
  for (let i = 0; i < fuertes.length; i++) {
    for (let j = i + 1; j < fuertes.length; j++) {
      const a = fuertes[i].c, b = fuertes[j].c;
      const ambas = base.filter((f) => a.cumple(f) && b.cumple(f));
      if (ambas.length < 20) continue;
      const soloA = base.filter((f) => a.cumple(f)), soloB = base.filter((f) => b.cumple(f));
      const mejor = Math.max(tasaDe(soloA) ?? 0, tasaDe(soloB) ?? 0);
      const tasa = tasaDe(ambas);
      const malosAmbas = ambas.filter((f) => f.malo).length;
      salida.push({ a: a.texto, b: b.texto, n: ambas.length, malos: malosAmbas, tasa, ic: wilson(malosAmbas, ambas.length), tasaA: tasaDe(soloA), tasaB: tasaDe(soloB), refuerzo: mejor > 0 ? tasa / mejor : null });
    }
  }
  return salida.sort((x, y) => (y.refuerzo ?? 0) - (x.refuerzo ?? 0));
}

// Numéricas cuya tasa de malos por quintil no va en una sola dirección: el
// extremo está en un tramo del medio y se aparta de las dos puntas más que
// por azar. Una regla "más es peor" las leería mal.
function noLineales(base, variables) {
  const malos = base.map((f) => f.malo);
  return variables.filter((v) => v.tipo === "numero").map((v) => {
    const valores = base.map((f) => (faltante(f.variables[v.id]) ? null : f.variables[v.id]));
    const tramos = tramosPorDefecto(valores, 5).filter((t) => t.tipo !== "sin_dato");
    if (tramos.length < 3) return null;
    const r = ivWoe(valores, malos, tramos);
    const tasas = r.tramos.map((t) => t.tasa);
    if (tasas.length < 3) return null;
    const max = Math.max(...tasas), min = Math.min(...tasas);
    const iMax = tasas.indexOf(max), iMin = tasas.indexOf(min);
    const interior = (i) => i > 0 && i < tasas.length - 1;
    const forma = interior(iMax) ? "sube y baja" : interior(iMin) ? "baja y sube" : null;
    if (!forma) return null;
    // Que las tasas difieran no prueba que el riesgo dé la vuelta: una
    // variable monótona con ruido en el último tramo pasaba. Tienen que ser
    // significativas la subida desde una punta hasta el extremo del medio Y
    // la bajada hasta la otra punta.
    const centro = r.tramos[interior(iMax) ? iMax : iMin];
    const contra = (t) => chiCuadrado([[centro.malos, centro.n - centro.malos], [t.malos, t.n - t.malos]])?.p ?? 1;
    const p = Math.max(contra(r.tramos[0]), contra(r.tramos[r.tramos.length - 1]));
    if (p >= 0.05) return null;
    return { id: v.id, nombre: v.nombre, forma, p, tramos: r.tramos.map((t) => ({ tramo: etiquetaDeTramo(t, (x) => Math.round(x).toLocaleString("es-EC")), n: t.n, tasa: t.tasa })) };
  }).filter(Boolean);
}

// ------------------------------------------------------ casos de error
// Aprobados que cayeron (aprobar o revisar: "no impago", decisión del
// negocio del 2026-10-06) y negados que habrían pagado. A un negado sólo se
// lo juzga con evidencia: la institución le prestó igual (operaciones) o tuvo
// crédito con otra y pagó (solicitudes observadas). Sin evidencia no hay
// caso (lo pidió el negocio: ninguna tasa para los negados sin ella).
// La lista de observación: llegaron a 15 días de atraso o más en el primer año
// sin caer en impago, aunque después se pusieran al día. Para el negocio ya
// es grave (2026-10-06).
export function casosDeError(filas) {
  const obs = filasObservadas(filas);
  return {
    aprobadosQueCayeron: obs.filter((f) => NO_IMPAGO.includes(f.recomendacion) && f.malo),
    negadosQuePagaron: obs.filter((f) => (f.recomendacion === "negar" || f.recomendacion === "bloqueado") && !f.malo),
    enObservacion: obs.filter((f) => !f.malo && f.observacion === true),
  };
}

// Los k más parecidos del otro resultado con la misma recomendación (para
// un aprobado que cayó, aprobados que pagaron), por distancia en las
// variables numéricas y sí/no estandarizadas. Las diferencias más grandes
// contra ellos son las hipótesis de qué no vio el modelo.
export function parecidos(caso, filas, catalogo, k = 5) {
  const obs = filasObservadas(filas, { unaPorPersona: true });
  const variables = catalogo.filter((v) => v.tipo !== "categoria" && v.uso !== "protegida");
  const escala = new Map(variables.map((v) => {
    const xs = obs.map((f) => comoNumero(f.variables[v.id])).filter((x) => x !== null);
    return [v.id, { m: media(xs) ?? 0, s: desvio(xs) || 1 }];
  }));
  const z = (f, v) => {
    const x = comoNumero(f.variables[v.id]);
    return x === null ? null : (x - escala.get(v.id).m) / escala.get(v.id).s;
  };
  const candidatos = obs.filter((f) => f.id !== caso.id && f.recomendacion === caso.recomendacion && f.malo !== caso.malo);
  const conDistancia = candidatos.map((f) => {
    let suma = 0, n = 0;
    for (const v of variables) {
      const a = z(caso, v), b = z(f, v);
      if (a === null || b === null) continue;
      suma += (a - b) ** 2;
      n++;
    }
    return { fila: f, distancia: n ? Math.sqrt(suma / n) : Infinity };
  }).sort((a, b) => a.distancia - b.distancia).slice(0, k);
  const hipotesis = variables.map((v) => {
    const propio = comoNumero(caso.variables[v.id]);
    const otros = conDistancia.map((c) => comoNumero(c.fila.variables[v.id])).filter((x) => x !== null);
    if (propio === null || !otros.length) return null;
    const promedio = media(otros);
    return { id: v.id, nombre: v.nombre, tipo: v.tipo, enModelo: v.en_perfil_del_modelo, propio, promedio, distancia: Math.abs(propio - promedio) / escala.get(v.id).s };
  }).filter((h) => h && h.distancia > 0.5).sort((a, b) => b.distancia - a.distancia).slice(0, 8);
  return { vecinos: conDistancia, hipotesis };
}

// ------------------------------------------- entrada al modelo: diferencias
// Las rutas donde dos objetos difieren: lo que está sólo en uno, lo que
// cambió de valor. Un arreglo se compara entero (no elemento por elemento):
// lo que importa es si el modelo leyó la misma lista.
export function diferenciasJson(a, b, prefijo = "") {
  const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  if (!esObjeto(a) || !esObjeto(b)) {
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ ruta: prefijo || "(todo)", tipo: a === undefined ? "solo_b" : b === undefined ? "solo_a" : "distinto", a, b }];
  }
  const salida = [];
  for (const clave of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave;
    if (!(clave in b)) salida.push({ ruta, tipo: "solo_a", a: a[clave] });
    else if (!(clave in a)) salida.push({ ruta, tipo: "solo_b", b: b[clave] });
    else salida.push(...diferenciasJson(a[clave], b[clave], ruta));
  }
  return salida;
}

// Del perfil a lo que lee el modelo: qué se sacó, qué se puso en null
// (campos apagados), qué se transformó y qué se agregó.
export function delPerfilAlModelo(perfil, perfilDelModelo) {
  const d = diferenciasJson(perfil ?? {}, perfilDelModelo ?? {});
  return {
    quitado: d.filter((x) => x.tipo === "solo_a"),
    agregado: d.filter((x) => x.tipo === "solo_b"),
    enNull: d.filter((x) => x.tipo === "distinto" && x.b === null && x.a !== null),
    transformado: d.filter((x) => x.tipo === "distinto" && !(x.b === null && x.a !== null)),
  };
}

// ------------------------------------------------------ taller: fórmulas
// Una fórmula sobre las variables del catálogo, interpretada (nunca se
// ejecuta como código). Admite números, variables por su id, + - * /,
// comparaciones (> < >= <= = <>), "y", "o", "no", paréntesis y las
// funciones min, max, abs, log, raiz, si(condición, a, b) y falta(x).
// Un faltante contagia: cualquier cuenta con un faltante da faltante,
// salvo si() y falta().
const FUNCIONES = new Set(["min", "max", "abs", "log", "raiz", "si", "falta"]);

// Los decimales van con punto: la coma separa los argumentos de max(a, b).
function tokenizar(texto) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_áéíóúñ][\wáéíóúñ]*)|(>=|<=|<>|[-+*/()<>=,]))/y;
  let pos = 0;
  while (pos < texto.length && !/^\s*$/.test(texto.slice(pos))) {
    re.lastIndex = pos;
    const m = re.exec(texto);
    if (!m) throw new Error(`No se entiende la fórmula cerca de «${texto.slice(pos, pos + 12).trim()}»`);
    if (m[1] !== undefined) tokens.push({ tipo: "numero", valor: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push(["y", "o", "no"].includes(m[2]) ? { tipo: "op", valor: m[2] } : { tipo: "nombre", valor: m[2] });
    else tokens.push({ tipo: "op", valor: m[3] });
    pos = re.lastIndex;
  }
  return tokens;
}

// Devuelve una función (variables) => número | booleano | null y la lista de
// variables que usa. Lanza un error legible si la fórmula está mal.
export function compilarFormula(texto, idsValidos) {
  const tokens = tokenizar(texto);
  let i = 0;
  const usadas = new Set();
  const ver = () => tokens[i];
  const tomar = (valor) => {
    const t = tokens[i];
    if (!t || (valor !== undefined && t.valor !== valor)) throw new Error(`Se esperaba «${valor}» ${t ? `y vino «${t.valor}»` : "al final"}`);
    i++;
    return t;
  };
  const num = (x) => (typeof x === "boolean" ? (x ? 1 : 0) : x);
  const nulo = (...xs) => xs.some((x) => x === null || x === undefined || (typeof x === "number" && !Number.isFinite(x)));

  function primario() {
    const t = ver();
    if (!t) throw new Error("La fórmula termina antes de tiempo");
    if (t.tipo === "numero") { i++; return () => t.valor; }
    if (t.valor === "(") { tomar("("); const e = expresion(); tomar(")"); return e; }
    if (t.valor === "-") { tomar("-"); const e = primario(); return (v) => { const x = e(v); return nulo(x) ? null : -num(x); }; }
    if (t.valor === "no") { tomar("no"); const e = primario(); return (v) => { const x = e(v); return nulo(x) ? null : !num(x); }; }
    if (t.tipo === "nombre") {
      i++;
      if (FUNCIONES.has(t.valor) && ver()?.valor === "(") {
        tomar("(");
        const args = [expresion()];
        while (ver()?.valor === ",") { tomar(","); args.push(expresion()); }
        tomar(")");
        const f = t.valor;
        return (v) => {
          if (f === "falta") return nulo(args[0](v));
          if (f === "si") { const c = args[0](v); return nulo(c) ? null : num(c) ? args[1](v) : args[2]?.(v) ?? null; }
          const xs = args.map((a) => a(v));
          if (nulo(...xs)) return null;
          const ns = xs.map(num);
          if (f === "min") return Math.min(...ns);
          if (f === "max") return Math.max(...ns);
          if (f === "abs") return Math.abs(ns[0]);
          if (f === "log") return ns[0] > 0 ? Math.log(ns[0]) : null;
          return ns[0] >= 0 ? Math.sqrt(ns[0]) : null;
        };
      }
      if (!idsValidos.has(t.valor)) throw new Error(`No existe la variable «${t.valor}»`);
      usadas.add(t.valor);
      return (v) => (v[t.valor] === undefined ? null : v[t.valor]);
    }
    throw new Error(`No se esperaba «${t.valor}»`);
  }
  function binaria(siguiente, operadores, aplicar) {
    return () => {
      let izq = siguiente();
      while (ver() && operadores.includes(ver().valor)) {
        const op = tomar().valor;
        const der = siguiente(), a = izq;
        izq = (v) => { const x = a(v), y = der(v); return nulo(x, y) ? null : aplicar(op, num(x), num(y)); };
      }
      return izq;
    };
  }
  const producto = binaria(primario, ["*", "/"], (op, x, y) => (op === "*" ? x * y : y === 0 ? null : x / y));
  const suma = binaria(producto, ["+", "-"], (op, x, y) => (op === "+" ? x + y : x - y));
  const comparacion = binaria(suma, [">", "<", ">=", "<=", "=", "<>"], (op, x, y) => ({ ">": x > y, "<": x < y, ">=": x >= y, "<=": x <= y, "=": x === y, "<>": x !== y })[op]);
  const conjuncion = binaria(comparacion, ["y"], (op, x, y) => Boolean(x) && Boolean(y));
  const expresion = binaria(conjuncion, ["o"], (op, x, y) => Boolean(x) || Boolean(y));
  const raiz = expresion();
  if (i < tokens.length) throw new Error(`Sobra «${tokens[i].valor}» al final`);
  return { evaluar: raiz, usadas: [...usadas] };
}

// La variable derivada sobre el corte: sus valores, su tipo (sí/no si la
// fórmula es una comparación) y el mismo análisis de IV que una del catálogo.
export function probarFormula(filas, catalogo, texto) {
  const { evaluar, usadas } = compilarFormula(texto, new Set(catalogo.map((v) => v.id)));
  const obs = filasObservadas(filas, { unaPorPersona: true });
  const valores = obs.map((f) => {
    const x = evaluar(f.variables);
    return x === null || x === undefined || (typeof x === "number" && !Number.isFinite(x)) ? null : x;
  });
  const presentes = valores.filter((x) => x !== null);
  const tipo = presentes.length && presentes.every((x) => typeof x === "boolean") ? "booleano" : "numero";
  const columna = { id: "derivada", nombre: "Variable derivada", tipo, valores };
  const malos = obs.map((f) => f.malo);
  const iv = ivDeLaVariable(columna, malos, obs, tramosIniciales(columna));
  return { usadas, tipo, cobertura: presentes.length / (valores.length || 1), iv, n: valores.length };
}
