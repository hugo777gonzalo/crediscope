// El evaluador del predictor de ingresos.
//
// Dos pruebas distintas, porque el modelo entrenado con datos reales vive fuera de git
// (el repositorio es público):
//   - Siempre, con un modelo CHICO inventado en el mismo formato, armado acá: cada regla
//     del formato (FORMATO.md) con su caso, y la respuesta con cuentas hechas a mano.
//   - Sólo si existe, la prueba de oro: las 200 entradas inventadas de cada nivel contra
//     las salidas de LightGBM (casos-de-oro/). Se activa con la variable de entorno
//     PREDICTOR_INGRESOS_MODELOS, la carpeta con ingreso-v1-nivel1.json.gz y nivel2:
//
//   PREDICTOR_INGRESOS_MODELOS=C:/datos/ingresos/modelos/exportado \
//     deno test --no-lock --allow-env --allow-read=supabase/functions,C:/datos/ingresos/modelos/exportado supabase/functions/_shared/predictor-ingresos.test.ts

import { assert, assertAlmostEquals, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import oroNivel1 from "../../../scripts/predictor-ingresos/casos-de-oro/nivel1.json" with { type: "json" };
import oroNivel2 from "../../../scripts/predictor-ingresos/casos-de-oro/nivel2.json" with { type: "json" };
import {
  type Calibracion,
  distribucionEn,
  type EntradaDeIngreso,
  estimarIngreso,
  evaluarCuantilesLog,
  FORMATO_DE_ARBOLES,
  leerModeloComprimido,
  type ModeloExportado,
  prepararModelo,
  probabilidadesDeTramos,
  respuestaDeCuantiles,
} from "./predictor-ingresos.ts";

const NIVELES = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95];
const BASE = 10000;

// ---------------------------------------------------------------- un modelo chico inventado

// Ocho árboles por cuantil. Cada uno prueba una regla del formato y sus hojas valen 1, 2, 10,
// 20, 100, ... para que la suma diga por dónde pasó la entrada: la suma de las hojas elegidas
// más una constante que separa los doce cuantiles.
//   1  a       numérica, falta 0, umbral 10:                       izquierda 0,001   derecha 0,002
//   2  b       numérica, falta 2, el faltante va a la izquierda:    izquierda 0,01    derecha 0,02
//   3  b2      numérica, falta 2, el faltante va a la derecha:      izquierda 0,1     derecha 0,2
//   4  c       numérica, falta 1 (el cero es "faltante"), cero a la derecha, umbral 5:  izquierda 1  derecha 2
//   5  cat     categórica, conjunto {X, Z}:                         izquierda 10      derecha 20
//   6  d       numérica, falta 0, umbral −1 (el faltante vale 0 y va a la derecha):  izquierda 100  derecha 200
//   7  anidado: a <= 20 → (cat en {Y}: 1.000 / 2.000), si no una hoja de 3.000
//   8  una sola hoja (la raíz es una referencia negativa): base + paso·k, y en los cuantiles 3 y 4
//      va cruzada (k = 4 y k = 3) para probar que la salida se ordena.
function modeloChico(base = BASE, paso = 1): ModeloExportado {
  const nodos = { variable: [] as number[], umbral: [] as number[], categorica: [] as number[], falta: [] as number[], falta_izquierda: [] as number[], izquierda: [] as number[], derecha: [] as number[] };
  const hojas: number[] = [];
  const conjuntos: number[][] = [[0, 2], [1]];
  const arboles: number[] = [];
  const hoja = (valor: number) => {
    hojas.push(valor);
    return -hojas.length;
  };
  const nodo = (variable: number, umbral: number, categorica: 0 | 1, falta: 0 | 1 | 2, faltaIzquierda: 0 | 1, izquierda: number, derecha: number) => {
    nodos.variable.push(variable);
    nodos.umbral.push(umbral);
    nodos.categorica.push(categorica);
    nodos.falta.push(falta);
    nodos.falta_izquierda.push(faltaIzquierda);
    nodos.izquierda.push(izquierda);
    nodos.derecha.push(derecha);
    return nodos.variable.length - 1;
  };
  const A = 0, B = 1, B2 = 2, C = 3, CAT = 4, D = 5;
  NIVELES.forEach((_, k) => {
    arboles.push(nodo(A, 10, 0, 0, 1, hoja(0.001), hoja(0.002)));
    arboles.push(nodo(B, 5, 0, 2, 1, hoja(0.01), hoja(0.02)));
    arboles.push(nodo(B2, 5, 0, 2, 0, hoja(0.1), hoja(0.2)));
    arboles.push(nodo(C, 5, 0, 1, 0, hoja(1), hoja(2)));
    arboles.push(nodo(CAT, 0, 1, 0, 0, hoja(10), hoja(20)));
    arboles.push(nodo(D, -1, 0, 0, 0, hoja(100), hoja(200)));
    const interno = nodo(CAT, 1, 1, 0, 0, hoja(1000), hoja(2000));
    arboles.push(nodo(A, 20, 0, 0, 1, interno, hoja(3000)));
    arboles.push(hoja(base + paso * (k === 3 ? 4 : k === 4 ? 3 : k)));
  });
  return {
    formato: FORMATO_DE_ARBOLES, version: "ingreso-prueba", nivel: 1, entrenado_el: "2026-01-01",
    cuantiles: NIVELES, arboles_por_cuantil: 8,
    variables: [
      { nombre: "a", tipo: "numerica" }, { nombre: "b", tipo: "numerica" }, { nombre: "b2", tipo: "numerica" },
      { nombre: "c", tipo: "numerica" }, { nombre: "cat", tipo: "categorica", categorias: ["X", "Y", "Z"] }, { nombre: "d", tipo: "numerica" },
    ],
    arboles, nodos, conjuntos, hojas,
  };
}

const chico = prepararModelo(modeloChico());

// La suma de lo que valen los siete árboles con hojas distintas, sin la constante (BASE + k).
const sinConstante = (entradas: EntradaDeIngreso) => evaluarCuantilesLog(chico, entradas)[0] - BASE;

// Una entrada que pasa por las hojas de la izquierda en todos los árboles, y de la que cada prueba cambia una variable.
const BASAL = { a: 5, b: 3, b2: 3, c: 3, cat: "X", d: -5 };
// izquierda: 0,001 + 0,01 + 0,1 + 1 + 10 + 100 y el anidado (a <= 20, cat X no está en {Y}) → 2.000
const SUMA_BASAL = 0.001 + 0.01 + 0.1 + 1 + 10 + 100 + 2000;

Deno.test("el modelo chico: la entrada basal pasa por las hojas esperadas", () => {
  assertAlmostEquals(sinConstante(BASAL), SUMA_BASAL, 1e-9);
  const q = evaluarCuantilesLog(chico, BASAL);
  assertEquals(q.length, 12);
});

Deno.test("numérica: la igualdad con el umbral va a la izquierda", () => {
  assertAlmostEquals(sinConstante({ ...BASAL, a: 10 }), SUMA_BASAL, 1e-9);
  // El número siguiente al umbral va a la derecha: 0,002 en vez de 0,001.
  assertAlmostEquals(sinConstante({ ...BASAL, a: 10.000000000000002 }), SUMA_BASAL + 0.001, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, a: -1e9 }), SUMA_BASAL, 1e-9);
  // Mucho más allá del umbral del árbol anidado (a > 20): la hoja de 3.000 en lugar de la de 2.000.
  assertAlmostEquals(sinConstante({ ...BASAL, a: 1e9 }), SUMA_BASAL + 0.001 + 1000, 1e-9);
});

Deno.test("falta 0: el dato faltante vale cero, y no va a ningún lado por defecto", () => {
  // `a` (umbral 10): faltante vale 0, 0 <= 10 → izquierda.
  assertAlmostEquals(sinConstante({ ...BASAL, a: null }), SUMA_BASAL, 1e-9);
  // `d` (umbral −1): faltante vale 0, 0 <= −1 es falso → derecha (200 en vez de 100). Si el faltante fuera "izquierda" daría 100.
  assertAlmostEquals(sinConstante({ ...BASAL, d: null }), SUMA_BASAL + 100, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, d: undefined }), SUMA_BASAL + 100, 1e-9);
  // Una variable que ni se menciona también es faltante.
  const { d: _d, ...sinD } = BASAL;
  assertAlmostEquals(sinConstante(sinD), SUMA_BASAL + 100, 1e-9);
});

Deno.test("falta 2: el faltante sigue la dirección que el modelo aprendió", () => {
  // b: el faltante va a la izquierda (0,01); b2: a la derecha (0,2 en vez de 0,1).
  assertAlmostEquals(sinConstante({ ...BASAL, b: null }), SUMA_BASAL, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, b2: null }), SUMA_BASAL + 0.1, 1e-9);
  // Con valor, se compara con el umbral como cualquier número: 6 > 5 va a la derecha en los dos.
  assertAlmostEquals(sinConstante({ ...BASAL, b: 6 }), SUMA_BASAL + 0.01, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, b2: 5 }), SUMA_BASAL, 1e-9);
});

Deno.test("falta 1: el cero y el faltante siguen la dirección del cero, aunque el umbral los mande a otro lado", () => {
  // c (umbral 5, el cero va a la derecha): 3 <= 5 → izquierda; 0 es cero → derecha (2 en vez de 1).
  assertAlmostEquals(sinConstante({ ...BASAL, c: 0 }), SUMA_BASAL + 1, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, c: null }), SUMA_BASAL + 1, 1e-9);
  // 1e-35 todavía es cero; el doble ya no lo es y 2e-35 <= 5 va a la izquierda.
  assertAlmostEquals(sinConstante({ ...BASAL, c: 1e-35 }), SUMA_BASAL + 1, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, c: -1e-35 }), SUMA_BASAL + 1, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, c: 2e-35 }), SUMA_BASAL, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, c: 5 }), SUMA_BASAL, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, c: 5.5 }), SUMA_BASAL + 1, 1e-9);
});

Deno.test("categórica: dentro del conjunto a la izquierda; faltante, nunca vista o fuera del conjunto, a la derecha", () => {
  // cat en {X, Z} → izquierda (10); Y → derecha (20) y además entra al árbol anidado ({Y} → 1.000 en vez de 2.000).
  assertAlmostEquals(sinConstante({ ...BASAL, cat: "Z" }), SUMA_BASAL, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, cat: "Y" }), SUMA_BASAL + 10 - 1000, 1e-9);
  // Una categoría nueva, el texto vacío y el faltante son lo mismo: derecha en los dos árboles (20 y 2.000).
  const derecha = SUMA_BASAL + 10;
  assertAlmostEquals(sinConstante({ ...BASAL, cat: "NUNCA VISTA" }), derecha, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, cat: "" }), derecha, 1e-9);
  assertAlmostEquals(sinConstante({ ...BASAL, cat: null }), derecha, 1e-9);
  // Las categorías distinguen mayúsculas: "x" no es "X".
  assertAlmostEquals(sinConstante({ ...BASAL, cat: "x" }), derecha, 1e-9);
});

Deno.test("la salida viene ordenada aunque los modelos de cada cuantil se crucen", () => {
  const q = evaluarCuantilesLog(chico, BASAL);
  for (let i = 1; i < q.length; i++) assert(q[i] >= q[i - 1]);
  // En el modelo chico los cuantiles 3 y 4 salen de fábrica cruzados (BASE + 4 y BASE + 3): ordenados, van de uno en uno.
  q.forEach((v, i) => assertAlmostEquals(v, SUMA_BASAL + BASE + i, 1e-9));
});

Deno.test("la salida es exactamente la suma en logaritmo de las hojas, sin redondear", () => {
  const q = evaluarCuantilesLog(chico, BASAL);
  const esperado = NIVELES.map((_, k) => SUMA_BASAL + 10000 + (k === 3 ? 4 : k === 4 ? 3 : k)).sort((a, b) => a - b);
  q.forEach((v, i) => assertAlmostEquals(v, esperado[i], 1e-9));
});

Deno.test("una variable que el modelo no tiene, o un tipo equivocado, no se disimula", () => {
  assertThrows(() => evaluarCuantilesLog(chico, { ...BASAL, nombre_mal_escrito: 1 }), Error, "nombre_mal_escrito");
  assertThrows(() => evaluarCuantilesLog(chico, { ...BASAL, a: "5" }), Error, "numérica");
});

Deno.test("se niega a leer un formato que no conoce, o un modelo roto", () => {
  assertThrows(() => prepararModelo({ ...modeloChico(), formato: "crediscope-arboles-2" }), Error, "crediscope-arboles-2");
  assertThrows(() => prepararModelo({}), Error, "desconocido");
  assertThrows(() => prepararModelo(null), Error, "desconocido");
  const roto = modeloChico();
  roto.arboles = roto.arboles.slice(1);
  assertThrows(() => prepararModelo(roto), Error, "árboles");
  const huerfano = modeloChico();
  huerfano.nodos.izquierda[0] = 99999;
  assertThrows(() => prepararModelo(huerfano), Error, "referencia");
  const sinCuantil = modeloChico();
  sinCuantil.cuantiles = sinCuantil.cuantiles.map((q) => (q === 0.1 ? 0.11 : q));
  assertThrows(() => prepararModelo(sinCuantil), Error, "cuantil");
});

Deno.test("lee el modelo comprimido con gzip, como se guarda en Storage", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(modeloChico()));
  const flujo = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const blob = await new Response(flujo).blob();
  const leido = await leerModeloComprimido(blob);
  assertEquals(evaluarCuantilesLog(leido, BASAL), evaluarCuantilesLog(chico, BASAL));
  // Y un gzip de otro formato se rechaza.
  const otro = new Blob([new TextEncoder().encode(JSON.stringify({ ...modeloChico(), formato: "otro" }))]).stream().pipeThrough(new CompressionStream("gzip"));
  // Un archivo que no es gzip (el JSON a secas) se rechaza.
  await assertRejects(() => leerModeloComprimido(new Blob([bytes])));
  await assertRejects(async () => leerModeloComprimido(await new Response(otro).blob()), Error, "desconocido");
});

// ---------------------------------------------------------------- de los cuantiles a la respuesta

// Cuantiles de prueba: mediana de 1.000, mínimo del 90% de 500 y del 85% de 600.
const log = (dolares: number[]) => dolares.map(Math.log);
const DOLARES = [300, 500, 600, 700, 800, 900, 1000, 1200, 1500, 2000, 3000, 4500];

Deno.test("la distribución interpola entre los cuantiles y se corta a la mitad del primer y del último nivel", () => {
  const q = log(DOLARES);
  assertAlmostEquals(distribucionEn(q, NIVELES, 500), 0.10, 1e-12); // justo en un cuantil
  assertAlmostEquals(distribucionEn(q, NIVELES, 1000), 0.50, 1e-12);
  // A mitad de camino en el logaritmo entre 500 (0,10) y 600 (0,15): 0,125.
  assertAlmostEquals(distribucionEn(q, NIVELES, Math.sqrt(500 * 600)), 0.125, 1e-12);
  assertEquals(distribucionEn(q, NIVELES, 100), 0.025);
  assertEquals(distribucionEn(q, NIVELES, 9000), 0.975);
  assertEquals(distribucionEn(q, NIVELES, 300), 0.05);
  // En el último cuantil la cuenta de Python ya lo deja "por encima" de todos (q <= lt para los doce): vale 0,975, no 0,95.
  assertEquals(distribucionEn(q, NIVELES, 4500), 0.975);
  // Dos cuantiles iguales: no divide por cero.
  assertAlmostEquals(distribucionEn(log([300, 500, 500, 700, 800, 900, 1000, 1200, 1500, 2000, 3000, 4500]), NIVELES, 500), 0.15, 1e-12);
});

Deno.test("las probabilidades de los tramos suman uno, y ningún tramo es cero", () => {
  const p = probabilidadesDeTramos(log(DOLARES), NIVELES, [470, 940, 2000, 3000, 5000]);
  assertEquals(p.length, 6);
  assertAlmostEquals(p.reduce((a, b) => a + b, 0), 1, 1e-12);
  assert(p.every((v) => v > 0));
  // A mano, sin normalizar: el tramo hasta 470 es F(470) = 0,05 + (ln 470 − ln 300)/(ln 500 − ln 300)·0,05 ≈ 0,0937.
  const f470 = 0.05 + ((Math.log(470) - Math.log(300)) / (Math.log(500) - Math.log(300))) * 0.05;
  assertAlmostEquals(p[0], f470, 1e-9);
  // Todo el modelo por encima de los cortes: los tramos bajos quedan en el piso de 1e-4 y la suma sigue siendo uno.
  const alto = probabilidadesDeTramos(log([6000, 6100, 6200, 6300, 6400, 6500, 6600, 6700, 6800, 6900, 7000, 7100]), NIVELES, [470, 940, 2000, 3000, 5000]);
  assertAlmostEquals(alto.reduce((a, b) => a + b, 0), 1, 1e-12);
  assert(alto[1] < 1e-3 && alto[1] > 0);
});

// Las probabilidades que da comun.py (`probabilidades`, con los cortes 470 y 940 del salario básico de 2025) para seis de los
// casos de oro. Se obtuvieron con el Python del repositorio (numpy), no con este código.
const PROBABILIDADES_DE_PYTHON: { nivel: 1 | 2; caso: number; probabilidades: number[] }[] = [
  { nivel: 1, caso: 0, probabilidades: [0.050576329201, 0.260195482129, 0.48967082054, 0.112045308636, 0.062512059494, 0.025] },
  { nivel: 1, caso: 1, probabilidades: [0.088900435315, 0.220658491069, 0.340473044005, 0.166328262016, 0.115745216256, 0.067894551339] },
  { nivel: 1, caso: 2, probabilidades: [0.02499750025, 9.9990001e-05, 0.128498568321, 0.232412984647, 0.171279802454, 0.442711154328] },
  { nivel: 1, caso: 120, probabilidades: [0.02499750025, 9.9990001e-05, 0.078804758152, 0.082042327172, 0.314986780258, 0.499068644167] },
  { nivel: 2, caso: 2, probabilidades: [0.024992502249, 9.9970009e-05, 9.9970009e-05, 9.9970009e-05, 0.039511892069, 0.935195695655] },
  { nivel: 2, caso: 25, probabilidades: [0.025, 0.094536382286, 0.314270293746, 0.326934617303, 0.115290375579, 0.123968331086] },
];

Deno.test("las probabilidades de los tramos coinciden con comun.py sobre cuantiles de los casos de oro", () => {
  for (const { nivel, caso, probabilidades } of PROBABILIDADES_DE_PYTHON) {
    const oro = nivel === 1 ? oroNivel1 : oroNivel2;
    const q = oro.casos[caso].cuantiles_log;
    const obtenidas = probabilidadesDeTramos(q, NIVELES, [470, 940, 2000, 3000, 5000]);
    obtenidas.forEach((p, i) => assertAlmostEquals(p, probabilidades[i], 1e-9, `${oro.casos[caso].id}, tramo ${i}`));
  }
});

Deno.test("la respuesta: mínimo del 90% y del 85%, valor central, tramos con los cortes del año", () => {
  const r = respuestaDeCuantiles(log(DOLARES), NIVELES, { anio: 2025 });
  assertEquals(r.minimoCertificado, { seguridad: 0.9, monto: 500, limiteDeMedioSbuAplicado: false });
  assertEquals(r.minimoAlternativo, { seguridad: 0.85, monto: 600, limiteDeMedioSbuAplicado: false });
  assertEquals(r.valorCentral, 1000);
  assertEquals(r.calibradoPara, null);
  assertEquals(r.salarioBasico, 470);
  assertEquals(r.tramos.map((t) => [t.desde, t.hasta]), [[0, 470], [470, 940], [940, 2000], [2000, 3000], [3000, 5000], [5000, null]]);
  assertAlmostEquals(r.tramos.reduce((a, t) => a + t.probabilidad, 0), 1, 1e-12);
  // El mínimo del 90% (500) no alcanza 940: no certifica nada.
  assertEquals(r.certificaAlMenos, []);

  // Con el salario de 2026 los dos primeros cortes se mueven (482 y 964).
  const r26 = respuestaDeCuantiles(log(DOLARES), NIVELES, { anio: 2026 });
  assertEquals(r26.tramos.map((t) => t.hasta), [482, 964, 2000, 3000, 5000, null]);
  assertEquals(r26.salarioBasico, 482);
});

Deno.test("certificaAlMenos lista los umbrales que el mínimo del 90% alcanza", () => {
  const alto = [1500, 2100, 2200, 2300, 2400, 2500, 3100, 3200, 3300, 3400, 3500, 6000];
  const r = respuestaDeCuantiles(log(alto), NIVELES, { anio: 2025 });
  assertEquals(r.minimoCertificado.monto, 2100);
  assertEquals(r.certificaAlMenos, [940, 2000]);
});

Deno.test("el mínimo no baja de medio salario básico, y la respuesta dice cuándo se aplicó", () => {
  const bajo = [50, 100, 120, 140, 160, 180, 200, 250, 300, 400, 500, 700];
  const r = respuestaDeCuantiles(log(bajo), NIVELES, { anio: 2025 });
  assertEquals(r.minimoCertificado, { seguridad: 0.9, monto: 235, limiteDeMedioSbuAplicado: true });
  assertEquals(r.minimoAlternativo, { seguridad: 0.85, monto: 235, limiteDeMedioSbuAplicado: true });
  assertEquals(r.valorCentral, 200);
});

Deno.test("un mínimo se redondea hacia abajo y el valor central al centavo más cercano", () => {
  const q = log([300, 512.3479, 600, 700, 800, 900, 1234.5678, 1300, 1500, 2000, 3000, 4500]);
  const r = respuestaDeCuantiles(q, NIVELES, { anio: 2025 });
  assertEquals(r.minimoCertificado.monto, 512.34);
  assertEquals(r.valorCentral, 1234.57);
});

Deno.test("calibración: el corrimiento baja el mínimo en proporción, y la respuesta dice para quién", () => {
  const calibracion: Calibracion = { para: "institución de prueba", casos: 600, corrimientoLog90: Math.log(2), corrimientoLog85: Math.log(1.5) };
  const r = respuestaDeCuantiles(log(DOLARES), NIVELES, { anio: 2025, calibracion });
  assertEquals(r.minimoCertificado.monto, 250); // 500 / 2
  assertEquals(r.minimoAlternativo.monto, 400); // 600 / 1,5
  assertEquals(r.calibradoPara, "institución de prueba");
  assertEquals(r.valorCentral, 1000); // la calibración mueve sólo los mínimos
  // Un corrimiento negativo sube el mínimo.
  const sube = respuestaDeCuantiles(log(DOLARES), NIVELES, { anio: 2025, calibracion: { ...calibracion, corrimientoLog90: -Math.log(1.1) } });
  assertEquals(sube.minimoCertificado.monto, 550);
  // Con menos de 500 casos, no se calibra.
  assertThrows(() => respuestaDeCuantiles(log(DOLARES), NIVELES, { anio: 2025, calibracion: { ...calibracion, casos: 499 } }), Error, "500");
  assertThrows(() => respuestaDeCuantiles(log(DOLARES), NIVELES, { anio: 2025, calibracion: { ...calibracion, corrimientoLog90: NaN } }), Error, "corrimiento");
});

Deno.test("estimarIngreso: evalúa el modelo y responde; la calibración del modelo se aplica y la de la llamada manda", () => {
  // Un modelo cuya mediana, para la entrada basal, es log(300) + 6 · 0,2 ≈ 996: dólares que se pueden mirar.
  const razonable = prepararModelo(modeloChico(Math.log(300) - SUMA_BASAL, 0.2));
  const sin = estimarIngreso(razonable, BASAL, { anio: 2025 });
  assertEquals(sin.calibradoPara, null);
  assertEquals(sin.modelo, { version: "ingreso-prueba", nivel: 1, entrenadoEl: "2026-01-01" });
  assertEquals(sin.cuantilesLog, evaluarCuantilesLog(razonable, BASAL));
  assertEquals(sin.valorCentral, centavosRedondeados(300 * Math.exp(1.2)));
  assertEquals(sin.minimoCertificado.monto, Math.floor(300 * Math.exp(0.2) * 100) / 100);

  const calibracion: Calibracion = { para: "del modelo", casos: 1000, corrimientoLog90: 0.5, corrimientoLog85: 0.5 };
  const conCalibracion = prepararModelo({ ...modeloChico(Math.log(300) - SUMA_BASAL, 0.2), calibracion });
  assertEquals(estimarIngreso(conCalibracion, BASAL, { anio: 2025 }).calibradoPara, "del modelo");
  assertEquals(estimarIngreso(conCalibracion, BASAL, { anio: 2025, calibracion: null }).calibradoPara, null);
  assertEquals(estimarIngreso(conCalibracion, BASAL, { anio: 2025, calibracion: { ...calibracion, para: "otra" } }).calibradoPara, "otra");
});

const centavosRedondeados = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- la prueba de oro

const TOLERANCIA = 0.001; // en logaritmo (especificación, 6.2); el evaluador de referencia en Python da 1e-13

Deno.test("los casos de oro están completos y son coherentes (el repositorio los guarda sin el modelo)", () => {
  for (const [nivel, oro] of [[1, oroNivel1], [2, oroNivel2]] as const) {
    assertEquals(oro.casos.length, 200);
    assertEquals(oro.cuantiles, NIVELES);
    assertEquals(oro.tolerancia, TOLERANCIA);
    assertEquals(oro.modelo, `ingreso-v1-nivel${nivel}.json.gz`);
    const nombres = Object.keys(oro.casos[0].entradas).sort();
    for (const caso of oro.casos) {
      assertEquals(Object.keys(caso.entradas).sort(), nombres, caso.id);
      assertEquals(caso.cuantiles_log.length, 12, caso.id);
      for (let i = 1; i < 12; i++) assert(caso.cuantiles_log[i] >= caso.cuantiles_log[i - 1], `${caso.id}: cuantiles sin ordenar`);
    }
  }
});

const CARPETA_DE_MODELOS = Deno.env.get("PREDICTOR_INGRESOS_MODELOS");

for (const [nivel, oro] of [[1, oroNivel1], [2, oroNivel2]] as const) {
  // Sin el modelo real (fuera de git) la prueba se omite: el modelo chico de arriba es el que corre en la integración continua.
  Deno.test({
    name: `prueba de oro del nivel ${nivel}: las 200 entradas coinciden con LightGBM a menos de ${TOLERANCIA} en el logaritmo de cada cuantil`,
    ignore: !CARPETA_DE_MODELOS,
    fn: async () => {
      const bytes = await Deno.readFile(`${CARPETA_DE_MODELOS}/${oro.modelo}`);
      const modelo = await leerModeloComprimido(new Blob([bytes]));
      assertEquals(modelo.nivel, nivel);
      let peor = 0;
      for (const caso of oro.casos) {
        const obtenido = evaluarCuantilesLog(modelo, caso.entradas as Record<string, number | string | null>);
        caso.cuantiles_log.forEach((esperado, i) => {
          const diferencia = Math.abs(obtenido[i] - esperado);
          peor = Math.max(peor, diferencia);
          assert(diferencia < TOLERANCIA, `${caso.id}, cuantil ${NIVELES[i]}: ${obtenido[i]} contra ${esperado}`);
        });
      }
      console.log(`nivel ${nivel}: diferencia máxima contra LightGBM en 200 casos: ${peor.toExponential(2)}`);
    },
  });
}
