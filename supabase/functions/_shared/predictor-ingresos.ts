// El evaluador del predictor de ingresos: lee el modelo exportado en el formato
// compacto `crediscope-arboles-1` y entrega los doce cuantiles, en logaritmo, de
// un vector de entrada; de ahí sale la respuesta (mínimo certificado, valor central
// y probabilidad de cada tramo).
//
// La definición del formato es scripts/predictor-ingresos/FORMATO.md y su definición
// ejecutable, scripts/predictor-ingresos/evaluador_referencia.py: ante una duda manda
// el Python, que coincide con LightGBM a 3e-14. De los cuantiles a la respuesta, las
// mismas cuentas de comun.py (`cdf` y `probabilidades`). Especificación, secciones 2 y 5.
//
// Sin dependencias de Deno ni del navegador: `_shared` lo comparten los dos mundos y
// una sola implementación es la que evita las diferencias silenciosas. El modelo
// entrenado con datos reales vive fuera de git; la prueba de oro lo usa sólo si existe.

import { sbuDelAnio } from "./fuentes-ingreso.ts";

export const FORMATO_DE_ARBOLES = "crediscope-arboles-1";

// kZeroThreshold de LightGBM: un valor con módulo menor o igual a esto cuenta como cero.
const CERO = 1e-35;

// Los niveles de seguridad de la respuesta (especificación, 2.2 y 5). La seguridad del
// 90% es el cuantil 0,10: un mínimo que el ingreso real supera nueve de cada diez veces.
const CUANTIL_MINIMO_CERTIFICADO = 0.10;
const CUANTIL_MINIMO_ALTERNATIVO = 0.15;
const CUANTIL_CENTRAL = 0.50;

// Los cortes fijos de los tramos (los dos primeros siguen al salario básico del año).
const CORTES_FIJOS = [2000, 3000, 5000];

// Calibrar con menos casos da una cobertura que depende de cuáles toquen (medido: con 500
// la cobertura va de 87% a 91%): la especificación (5) exige al menos esto.
export const CASOS_MINIMOS_DE_CALIBRACION = 500;

// ---------------------------------------------------------------- el modelo

export interface VariableDelModelo {
  nombre: string;
  tipo: "numerica" | "categorica";
  categorias?: string[];
}

// Cómo se corre el mínimo con la calibración conforme de cuantiles (Romano, Patterson y
// Candès, 2019), en logaritmo: el mínimo es exp(cuantil − corrimiento). Se mide un
// corrimiento por nivel de seguridad porque cada uno se calibra con su propio α.
export interface Calibracion {
  para: string; // institución o producto con cuyos casos se calibró
  casos: number;
  corrimientoLog90: number;
  corrimientoLog85: number;
}

// El JSON tal como lo escribe exportar.py. Sólo se listan los campos que se usan para evaluar.
export interface ModeloExportado {
  formato: string;
  version: string;
  nivel: number;
  entrenado_el: string;
  cuantiles: number[];
  arboles_por_cuantil: number;
  variables: VariableDelModelo[];
  arboles: number[];
  nodos: {
    variable: number[];
    umbral: number[];
    categorica: number[];
    falta: number[];
    falta_izquierda: number[];
    izquierda: number[];
    derecha: number[];
  };
  conjuntos: number[][];
  hojas: number[];
  // No lo escribe exportar.py (el modelo exportado no está calibrado): si algún día un
  // modelo lo trae, la respuesta lo aplica y lo dice.
  calibracion?: Calibracion;
}

// El modelo ya armado para evaluar: arreglos tipados y los conjuntos de categorías como
// `Set`, para recorrer 2.040 árboles sin armar objetos.
export interface ModeloDeIngreso {
  version: string;
  nivel: number;
  entrenadoEl: string;
  cuantiles: number[];
  arbolesPorCuantil: number;
  variables: VariableDelModelo[];
  arboles: Int32Array;
  variable: Int32Array;
  umbral: Float64Array;
  categorica: Uint8Array;
  falta: Uint8Array;
  faltaIzquierda: Uint8Array;
  izquierda: Int32Array;
  derecha: Int32Array;
  conjuntos: Set<number>[];
  hojas: Float64Array;
  calibracion: Calibracion | null;
  indiceDeVariable: Map<string, number>;
  codigosDeCategoria: Map<number, Map<string, number>>;
}

function exigir(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`Modelo de ingresos inválido: ${mensaje}`);
}

/** Valida el JSON de un modelo y lo deja listo para evaluar. Se niega si el formato no es el que conoce. */
export function prepararModelo(crudo: unknown): ModeloDeIngreso {
  const m = crudo as ModeloExportado;
  // Un formato que este evaluador no conoce se leería "bien" y daría números sin sentido.
  if (!m || m.formato !== FORMATO_DE_ARBOLES) {
    throw new Error(`Formato de modelo desconocido: ${String(m?.formato)}; este evaluador lee ${FORMATO_DE_ARBOLES}`);
  }
  const n = m.nodos;
  const divisiones = n.variable.length;
  exigir(
    [n.umbral, n.categorica, n.falta, n.falta_izquierda, n.izquierda, n.derecha].every((a) => a.length === divisiones),
    "los arreglos de nodos no tienen el mismo largo",
  );
  exigir(m.arboles.length === m.cuantiles.length * m.arboles_por_cuantil, "los árboles no son cuantiles × árboles por cuantil");
  exigir(m.cuantiles.every((q, i) => i === 0 || q > m.cuantiles[i - 1]), "los cuantiles no están ordenados");
  for (const q of [CUANTIL_MINIMO_CERTIFICADO, CUANTIL_MINIMO_ALTERNATIVO, CUANTIL_CENTRAL]) {
    exigir(m.cuantiles.some((c) => Math.abs(c - q) < 1e-9), `falta el cuantil ${q}`);
  }
  exigir(n.variable.every((v) => v >= 0 && v < m.variables.length), "una división apunta a una variable que no existe");
  const referencias = [...n.izquierda, ...n.derecha, ...m.arboles];
  exigir(referencias.every((r) => (r >= 0 ? r < divisiones : -1 - r < m.hojas.length)), "una referencia apunta fuera de las divisiones y las hojas");
  for (let i = 0; i < divisiones; i++) {
    if (n.categorica[i]) exigir(Number.isInteger(n.umbral[i]) && n.umbral[i] >= 0 && n.umbral[i] < m.conjuntos.length, "una división categórica apunta a un conjunto que no existe");
  }
  if (m.calibracion) validarCalibracion(m.calibracion);

  const codigos = new Map<number, Map<string, number>>();
  m.variables.forEach((v, i) => {
    if (v.tipo === "categorica") codigos.set(i, new Map((v.categorias ?? []).map((c, k) => [c, k])));
  });
  return {
    version: m.version,
    nivel: m.nivel,
    entrenadoEl: m.entrenado_el,
    cuantiles: m.cuantiles,
    arbolesPorCuantil: m.arboles_por_cuantil,
    variables: m.variables,
    arboles: Int32Array.from(m.arboles),
    variable: Int32Array.from(n.variable),
    umbral: Float64Array.from(n.umbral),
    categorica: Uint8Array.from(n.categorica),
    falta: Uint8Array.from(n.falta),
    faltaIzquierda: Uint8Array.from(n.falta_izquierda),
    izquierda: Int32Array.from(n.izquierda),
    derecha: Int32Array.from(n.derecha),
    conjuntos: m.conjuntos.map((c) => new Set(c)),
    hojas: Float64Array.from(m.hojas),
    calibracion: m.calibracion ?? null,
    indiceDeVariable: new Map(m.variables.map((v, i) => [v.nombre, i])),
    codigosDeCategoria: codigos,
  };
}

/** Lee un modelo `.json.gz` (en Deno y en el navegador, con `DecompressionStream`) y lo deja listo para evaluar. */
export async function leerModeloComprimido(blob: Blob): Promise<ModeloDeIngreso> {
  const crudo = await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).json();
  return prepararModelo(crudo);
}

// ---------------------------------------------------------------- la evaluación

// Cada variable llega por nombre; null o undefined es dato faltante. Una categoría que el
// modelo no conoció también lo es.
export type EntradaDeIngreso = Record<string, number | string | null | undefined>;

/** De las entradas por nombre al vector que ven los árboles: un número, o NaN si falta. */
function vectorDeEntrada(m: ModeloDeIngreso, entradas: EntradaDeIngreso): Float64Array {
  const x = new Float64Array(m.variables.length).fill(NaN);
  for (const [nombre, valor] of Object.entries(entradas)) {
    const i = m.indiceDeVariable.get(nombre);
    // Una variable que el modelo no tiene es un error de quien armó la entrada (un nombre
    // mal escrito dejaría la variable real como faltante sin que nadie lo note).
    if (i === undefined) throw new Error(`El modelo ${m.version} no tiene la variable «${nombre}»`);
    if (valor === null || valor === undefined) continue;
    if (m.variables[i].tipo === "categorica") {
      x[i] = m.codigosDeCategoria.get(i)?.get(String(valor)) ?? NaN;
    } else {
      if (typeof valor !== "number") throw new Error(`La variable numérica «${nombre}» llegó como ${typeof valor}`);
      x[i] = valor; // sin redondear ni recortar: los números llegan como están
    }
  }
  return x;
}

function valorDeLaHoja(m: ModeloDeIngreso, raiz: number, x: Float64Array): number {
  let ref = raiz;
  while (ref >= 0) {
    let v = x[m.variable[ref]];
    let izquierda: boolean;
    if (m.categorica[ref]) {
      // Una categoría que falta, una que el modelo no conoció o una fuera del conjunto va a la derecha.
      izquierda = !Number.isNaN(v) && v >= 0 && m.conjuntos[m.umbral[ref]].has(Math.trunc(v));
    } else {
      const falta = m.falta[ref]; // 0 ninguno, 1 cero, 2 dato faltante
      // LightGBM trata el dato faltante como cero salvo que el nodo lo haya visto como faltante al entrenar.
      if (Number.isNaN(v) && falta !== 2) v = 0;
      if ((falta === 1 && Math.abs(v) <= CERO) || (falta === 2 && Number.isNaN(v))) {
        izquierda = m.faltaIzquierda[ref] === 1;
      } else {
        izquierda = v <= m.umbral[ref]; // la igualdad va a la izquierda
      }
    }
    ref = izquierda ? m.izquierda[ref] : m.derecha[ref];
  }
  return m.hojas[-1 - ref];
}

/** Los doce cuantiles en logaritmo natural del ingreso mensual no verificado, ordenados de menor a mayor. */
export function evaluarCuantilesLog(m: ModeloDeIngreso, entradas: EntradaDeIngreso): number[] {
  const x = vectorDeEntrada(m, entradas);
  const por = m.arbolesPorCuantil;
  const q = m.cuantiles.map((_, k) => {
    // Se suma en el orden de los árboles, como el Python: otro orden cambiaría el último decimal.
    let suma = 0;
    for (let a = k * por; a < (k + 1) * por; a++) suma += valorDeLaHoja(m, m.arboles[a], x);
    return suma;
  });
  // Los modelos de cada cuantil son independientes y pueden cruzarse un poco.
  return q.sort((a, b) => a - b);
}

// ---------------------------------------------------------------- de los cuantiles a la respuesta

function indiceDeCuantil(niveles: number[], q: number): number {
  const i = niveles.findIndex((c) => Math.abs(c - q) < 1e-9);
  if (i < 0) throw new Error(`El modelo no tiene el cuantil ${q}`);
  return i;
}

/**
 * Función de distribución interpolada entre los cuantiles, en `dolares` (la `cdf` de comun.py).
 * Por debajo del primer cuantil vale la mitad de su nivel; por encima del último, la mitad
 * de lo que le falta a uno.
 */
export function distribucionEn(cuantilesLog: number[], niveles: number[], dolares: number): number {
  const K = cuantilesLog.length;
  const lt = Math.log(dolares);
  let idx = 0;
  for (const q of cuantilesLog) if (q <= lt) idx++;
  if (idx === 0) return niveles[0] / 2;
  if (idx === K) return (1 + niveles[K - 1]) / 2;
  const lo = idx - 1;
  const hi = idx;
  const ql = cuantilesLog[lo];
  const qh = cuantilesLog[hi];
  const fraccion = qh > ql ? (lt - ql) / (qh - ql) : 0;
  return niveles[lo] + fraccion * (niveles[hi] - niveles[lo]);
}

/** La probabilidad de cada tramo entre los cortes (`probabilidades` de comun.py): ninguna es cero y suman uno. */
export function probabilidadesDeTramos(cuantilesLog: number[], niveles: number[], cortes: number[]): number[] {
  const acumuladas = [0, ...cortes.map((c) => distribucionEn(cuantilesLog, niveles, c)), 1];
  // Un piso de 1e-4 evita mostrar un tramo con probabilidad cero: el modelo no puede afirmar que es imposible.
  const p = acumuladas.slice(1).map((c, i) => Math.max(c - acumuladas[i], 1e-4));
  const total = p.reduce((a, b) => a + b, 0);
  return p.map((v) => v / total);
}

export interface Tramo {
  desde: number;
  hasta: number | null;
  probabilidad: number;
}

export interface MinimoDeIngreso {
  seguridad: number;
  monto: number;
  limiteDeMedioSbuAplicado: boolean;
}

export interface RespuestaDeIngreso {
  minimoCertificado: MinimoDeIngreso;
  minimoAlternativo: MinimoDeIngreso;
  valorCentral: number;
  tramos: Tramo[];
  // Los umbrales (2 salarios básicos, 2.000, 3.000 y 5.000) que el mínimo del 90% alcanza.
  certificaAlMenos: number[];
  // null si el mínimo no se calibró con casos de ninguna institución: la respuesta lo dice.
  calibradoPara: string | null;
  salarioBasico: number;
}

export interface OpcionesDeRespuesta {
  /** El año de los tramos y del límite de medio salario básico (los cortes se aplican al responder, no al entrenar). */
  anio: number;
  calibracion?: Calibracion | null;
}

function validarCalibracion(c: Calibracion): void {
  exigir(c.para.trim() !== "", "la calibración no dice para qué institución es");
  exigir(Number.isFinite(c.corrimientoLog90) && Number.isFinite(c.corrimientoLog85), "el corrimiento de la calibración no es un número");
  exigir(c.casos >= CASOS_MINIMOS_DE_CALIBRACION, `calibrar pide al menos ${CASOS_MINIMOS_DE_CALIBRACION} casos y llegaron ${c.casos}`);
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;
// Un mínimo se redondea hacia abajo: la respuesta no puede afirmar más de lo que dijo el modelo.
// El 1e-6 absorbe el error de ida y vuelta por el logaritmo: exp(log(500)) da 499,99999999999994 y sin él un
// mínimo de 500 saldría como 499,99.
const centavosHaciaAbajo = (valor: number) => Math.floor(valor * 100 + 1e-6) / 100;

/** De los cuantiles (en logaritmo, ya ordenados) a lo que se responde. */
export function respuestaDeCuantiles(cuantilesLog: number[], niveles: number[], opciones: OpcionesDeRespuesta): RespuestaDeIngreso {
  const sbu = sbuDelAnio(opciones.anio);
  const calibracion = opciones.calibracion ?? null;
  if (calibracion) validarCalibracion(calibracion);
  const limite = sbu / 2;

  const minimo = (nivel: number, seguridad: number, corrimiento: number): MinimoDeIngreso => {
    const bruto = Math.exp(cuantilesLog[indiceDeCuantil(niveles, nivel)] - corrimiento);
    return { seguridad, monto: centavosHaciaAbajo(Math.max(bruto, limite)), limiteDeMedioSbuAplicado: bruto < limite };
  };
  const certificado = minimo(CUANTIL_MINIMO_CERTIFICADO, 0.90, calibracion?.corrimientoLog90 ?? 0);
  const alternativo = minimo(CUANTIL_MINIMO_ALTERNATIVO, 0.85, calibracion?.corrimientoLog85 ?? 0);

  const cortes = [sbu, 2 * sbu, ...CORTES_FIJOS];
  const probabilidades = probabilidadesDeTramos(cuantilesLog, niveles, cortes);
  const limites = [0, ...cortes];
  return {
    minimoCertificado: certificado,
    minimoAlternativo: alternativo,
    valorCentral: centavos(Math.exp(cuantilesLog[indiceDeCuantil(niveles, CUANTIL_CENTRAL)])),
    tramos: probabilidades.map((probabilidad, i) => ({ desde: limites[i], hasta: i < cortes.length ? cortes[i] : null, probabilidad })),
    certificaAlMenos: [2 * sbu, ...CORTES_FIJOS].filter((u) => certificado.monto >= u),
    calibradoPara: calibracion?.para ?? null,
    salarioBasico: sbu,
  };
}

export interface EstimacionDeIngreso extends RespuestaDeIngreso {
  cuantilesLog: number[];
  modelo: { version: string; nivel: number; entrenadoEl: string };
}

/** Evalúa el modelo sobre una entrada y arma la respuesta. La calibración de `opciones` manda sobre la que traiga el modelo. */
export function estimarIngreso(
  m: ModeloDeIngreso,
  entradas: EntradaDeIngreso,
  opciones: { anio: number; calibracion?: Calibracion | null },
): EstimacionDeIngreso {
  const cuantilesLog = evaluarCuantilesLog(m, entradas);
  const calibracion = opciones.calibracion !== undefined ? opciones.calibracion : m.calibracion;
  return {
    ...respuestaDeCuantiles(cuantilesLog, m.cuantiles, { anio: opciones.anio, calibracion }),
    cuantilesLog,
    modelo: { version: m.version, nivel: m.nivel, entrenadoEl: m.entrenadoEl },
  };
}
