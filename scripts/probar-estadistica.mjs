// Controla src/lib/estadistica.js: valores publicados, identidades entre
// pruebas que tienen que coincidir, y los números que ya calcula la base
// (AUC, KS e IV de un corte). Si algo no coincide, sale con error.
//
// Lo que no pasa por lint ni build se rompe en silencio: esto es lo que le
// da a la estadística del navegador una prueba antes de mostrarla.
//
// Uso: node scripts/probar-estadistica.mjs [--corte=<uuid>]

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import jStatPaquete from "jstat";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const E = await import(pathToFileURL(path.join(RAIZ, "src/lib/estadistica.js")).href);
const jStat = jStatPaquete.jStat ?? jStatPaquete;
const CORTE = process.argv.find((a) => a.startsWith("--corte="))?.slice(8) ?? "fdc07190-0000-0000-0000-000000000000";

let fallas = 0;
function igual(nombre, obtenido, esperado, tolerancia = 1e-6) {
  const ok = obtenido !== null && obtenido !== undefined && Math.abs(obtenido - esperado) <= tolerancia;
  if (!ok) fallas++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre}: ${obtenido} (esperado ${esperado}${tolerancia ? ` ± ${tolerancia}` : ""})`);
}

// Números al azar reproducibles (mulberry32) y normales por Box-Muller.
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = azar(7);
const normal = () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

// ---------------------------------------------------- valores publicados
// Descriptivas: lo que da Excel (PROMEDIO, DESVEST, CURTOSIS, COEFICIENTE.ASIMETRIA).
const d = E.descriptivas([2, 4, 4, 4, 5, 5, 7, 9]);
igual("media", d.media, 5);
igual("desvío muestral", d.desvio, Math.sqrt(32 / 7));
igual("mediana", d.mediana, 4.5);
igual("asimetría G1 (Excel 0,818487)", d.asimetria, 0.818487, 1e-6);
igual("curtosis G2 (Excel 0,940625)", d.curtosis, 0.940625, 1e-6);
igual("cuantil 0,25 tipo 7", d.p25, 4);

// Fisher, el ejemplo de la dama del té: [[3, 1], [1, 3]] da p = 0,4857.
igual("Fisher exacta (té)", E.fisherExacto(3, 1, 1, 3).p, 0.485714, 1e-6);

// Kendall, el ejemplo de la documentación de scipy (con empates).
const k = E.kendall([12, 2, 1, 12, 2], [1, 4, 7, 1, 0]);
igual("tau-b de Kendall (scipy -0,471405)", k.r, -0.47140452079103173, 1e-12);
igual("p de Kendall (scipy 0,282745)", k.p, 0.2827454599327748, 1e-9);

// Welch: t.test(c(1,2,3,4,5), c(2,4,6,8,10)) en R: t = -1,8974, gl = 5,8824, p = 0,1077.
const w = E.tWelch([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
igual("t de Welch", w.t, -1.897367, 1e-6);
igual("gl de Welch", w.gl, 5.882353, 1e-6);
// El p, contra la densidad t integrada a mano (Simpson): no depende de jStat.
function pIntegrado(t, gl) {
  const lnC = jStat.gammaln((gl + 1) / 2) - 0.5 * Math.log(gl * Math.PI) - jStat.gammaln(gl / 2);
  const f = (u) => Math.exp(lnC - ((gl + 1) / 2) * Math.log(1 + (u * u) / gl));
  const pasos = 20000, h = Math.abs(t) / pasos;
  let s = f(0) + f(Math.abs(t));
  for (let i = 1; i < pasos; i++) s += (i % 2 ? 4 : 2) * f(i * h);
  return 1 - 2 * ((s * h) / 3);
}
igual("p de Welch contra la densidad integrada", w.p, pIntegrado(w.t, w.gl), 1e-9);

// ------------------------------------------------------------ identidades
const grupoA = Array.from({ length: 300 }, () => Math.round(normal() * 3));
const grupoB = Array.from({ length: 200 }, () => Math.round(normal() * 3 + 0.8));

// El AUC de Mann-Whitney es contar pares.
let paresA = 0;
for (const a of grupoA) for (const b of grupoB) paresA += a > b ? 1 : a === b ? 0.5 : 0;
igual("AUC de Mann-Whitney = conteo de pares", E.mannWhitney(grupoA, grupoB).auc, paresA / (grupoA.length * grupoB.length), 1e-12);

// Kruskal-Wallis con dos grupos = z² de Mann-Whitney (los dos con empates).
igual("Kruskal-Wallis (2 grupos) = z² de Mann-Whitney", E.kruskalWallis([grupoA, grupoB]).h, E.mannWhitney(grupoA, grupoB).z ** 2, 1e-9);

// ANOVA con dos grupos = t combinada al cuadrado; y contra jStat.
const an = E.anova([grupoA, grupoB]);
igual("ANOVA (2 grupos) = t² combinada", an.f, E.tCombinado(grupoA, grupoB).t ** 2, 1e-9);
igual("p del ANOVA = p de la t combinada", an.p, E.tCombinado(grupoA, grupoB).p, 1e-9);
const grupoC = Array.from({ length: 150 }, () => normal() * 2 + 1);
igual("F del ANOVA contra jStat", E.anova([grupoA, grupoB, grupoC]).f, jStat.anovafscore(grupoA, grupoB, grupoC), 1e-9);

// Chi cuadrado de 2 × 2 = z² de la diferencia de proporciones.
const [a1, b1, c1, d1] = [40, 160, 25, 275];
const p1 = a1 / (a1 + b1), p2 = c1 / (c1 + d1), pp = (a1 + c1) / (a1 + b1 + c1 + d1);
const z = (p1 - p2) / Math.sqrt(pp * (1 - pp) * (1 / (a1 + b1) + 1 / (c1 + d1)));
igual("chi² de 2 × 2 = z² de proporciones", E.chiCuadrado([[a1, b1], [c1, d1]]).chi2, z * z, 1e-9);

// Pearson y Spearman contra jStat.
const x = Array.from({ length: 400 }, () => normal());
const y = x.map((v) => 0.6 * v + 0.8 * normal());
igual("Pearson contra jStat", E.pearson(x, y).r, jStat.corrcoeff(x, y), 1e-12);
igual("Spearman contra jStat", E.spearman(x, y).r, jStat.spearmancoeff(x, y), 1e-12);

// Inversa: A × A⁻¹ = I.
const A = [[4, 2, 0.6], [2, 5, 1], [0.6, 1, 3]];
const Ai = E.invertir(A);
const producto = A.map((fila) => Ai[0].map((_, j) => fila.reduce((s, v, k2) => s + v * Ai[k2][j], 0)));
igual("A × A⁻¹ = I (máximo error)", Math.max(...producto.flatMap((fila, i) => fila.map((v, j) => Math.abs(v - (i === j ? 1 : 0))))), 0, 1e-12);

// Autovalores: A v = λ v y la suma es la traza.
const { valores, vectores } = E.autovalores(A);
igual("suma de autovalores = traza", valores.reduce((s, v) => s + v, 0), 12, 1e-9);
const residuo = Math.max(...vectores.map((v, i) => Math.max(...A.map((fila, f) => Math.abs(fila.reduce((s, a, j) => s + a * v[j], 0) - valores[i] * v[f])))));
igual("A v = λ v (máximo error)", residuo, 0, 1e-9);

// Regresión logística: recupera los coeficientes con que se generaron los datos.
const xs = Array.from({ length: 20000 }, () => normal() * 2 + 1);
const ys = xs.map((v) => (r() < E.sigmoide(-3 + 0.8 * v) ? 1 : 0));
const lr = E.regresionLogistica(xs.map((v) => [v]), ys);
igual("logística: intercepto (-3)", lr.coeficientes[0], -3, 0.1);
igual("logística: pendiente (0,8)", lr.coeficientes[1], 0.8, 0.05);

// Kaplan-Meier sin censura: la supervivencia final es la fracción sin evento.
const km = E.kaplanMeier([1, 2, 2, 3, 5, 8].map((t, i) => ({ tiempo: t, evento: i !== 5 })));
igual("Kaplan-Meier sin censura antes del último", km[km.length - 1].supervivencia, 1 / 6, 1e-12);
igual("log-rank de un grupo contra sí mismo", E.logRank([[{ tiempo: 1, evento: true }, { tiempo: 3, evento: false }, { tiempo: 4, evento: true }], [{ tiempo: 1, evento: true }, { tiempo: 3, evento: false }, { tiempo: 4, evento: true }]]).chi2, 0, 1e-12);

// PSI a mano: [50, 50] contra [40, 60] con el suavizado de la base.
const pb = [(50 + 0.5) / 101, (50 + 0.5) / 101], pn = [(40 + 0.5) / 101, (60 + 0.5) / 101];
igual("PSI", E.psi([50, 50], [40, 60]).psi, (pn[0] - pb[0]) * Math.log(pn[0] / pb[0]) + (pn[1] - pb[1]) * Math.log(pn[1] / pb[1]), 1e-12);

// Normalidad: una exponencial no es normal; una normal casi siempre pasa.
igual("normalidad de una exponencial (p ~ 0)", E.normalidad(Array.from({ length: 2000 }, () => -Math.log(r() || 1e-12))).p, 0, 1e-6);
const pNormalDeNormal = E.normalidad(Array.from({ length: 2000 }, () => normal())).p;
igual("normalidad de una normal (p > 0,01)", pNormalDeNormal > 0.01 ? 1 : 0, 1, 0);

// ------------------------------------------------- fase F: bosque y SHAP
const B = await import(pathToFileURL(path.join(RAIZ, "src/lib/bosque.js")).href);
const S = await import(pathToFileURL(path.join(RAIZ, "src/lib/segmentacion.js")).href);
// Datos con una regla conocida: cae si x0 es alto y x1 bajo; x2 es ruido.
const Xb = Array.from({ length: 1500 }, () => [r() * 10, r() * 10, r() * 10, r() < 0.3 ? 1 : 0]);
const yb = Xb.map((x) => (r() < E.sigmoide(-4 + 0.6 * x[0] - 0.4 * x[1]) ? 1 : 0));
const bosque = B.entrenarBosque(Xb, yb, { arboles: 40, profundidadMaxima: 5, minHoja: 15, semilla: 3 });
const baseBosque = B.valorBase(bosque);
let peorPrecision = 0;
const absShap = [0, 0, 0, 0];
for (const x of Xb.slice(0, 200)) {
  const phi = B.shapBosque(bosque, x);
  peorPrecision = Math.max(peorPrecision, Math.abs(baseBosque + phi.reduce((s, v) => s + v, 0) - B.predecirBosque(bosque, x)));
  phi.forEach((v, j) => { absShap[j] += Math.abs(v); });
}
igual("SHAP: base + suma = predicción del bosque (mayor error en 200 personas)", peorPrecision, 0, 1e-9);
igual("SHAP: x0 pesa más que el ruido", absShap[0] > 3 * absShap[2] ? 1 : 0, 1, 0);
igual("SHAP: x1 pesa más que el ruido", absShap[1] > 2 * absShap[2] ? 1 : 0, 1, 0);
// SHAP de un árbol a mano: un solo corte en x0 con 40 y 60 filas.
const arbolChico = { n: 100, valor: 0.3, var: 0, umbral: 5, izq: { hoja: true, n: 40, valor: 0.6 }, der: { hoja: true, n: 60, valor: 0.1 } };
igual("SHAP de un corte: 0,6 − 0,3 = 0,3", B.shapArbol(arbolChico, [2, 0], 2)[0], 0.3, 1e-12);
const perm = B.importanciaPorPermutacion(bosque, Xb.slice(0, 600), yb.slice(0, 600), [{ nombre: "x0", columnas: [0] }, { nombre: "x2", columnas: [2] }]);
igual("permutación: desordenar x0 baja el AUC más que el ruido", perm.grupos[0].caida > perm.grupos[1].caida + 0.02 ? 1 : 0, 1, 0);

// K-medias: tres nubes separadas se recuperan, con silueta alta.
const nubes = [[0, 0], [8, 8], [0, 8]].flatMap(([cx, cy]) => Array.from({ length: 80 }, () => [cx + normal() * 0.7, cy + normal() * 0.7]));
const km3 = S.kMedias(nubes, 3, { semilla: 5 });
const puros = [0, 80, 160].every((ini) => new Set(km3.grupos.slice(ini, ini + 80)).size === 1);
igual("K-medias recupera tres nubes separadas", puros ? 1 : 0, 1, 0);
igual("silueta de nubes separadas (> 0,7)", S.silueta(nubes, km3.grupos) > 0.7 ? 1 : 0, 1, 0);
// Componentes principales: dos columnas casi iguales y una independiente.
const u = Array.from({ length: 1000 }, () => normal());
const Xp = u.map((v) => [v, v + 0.1 * normal(), normal()]);
const pca = S.componentesPrincipales(S.estandarizarColumnas(Xp).Z);
igual("PCA: la primera componente explica ~2/3", pca.explicada[0], 0.66, 0.03);
igual("PCA: la varianza explicada suma 1", pca.explicada.reduce((s, v) => s + v, 0), 1, 1e-9);

// ------------------------------------------------------- contra la base
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const auth = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };
async function rest(ruta, opciones = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, { ...opciones, headers: { ...auth, ...(opciones.headers ?? {}) } });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${ruta.split("?")[0]}: HTTP ${res.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

const cortes = await rest("lab_cortes?select=id,nombre&order=congelado_en.asc");
const corte = cortes.find((c) => c.id.startsWith(CORTE.slice(0, 8))) ?? cortes[0];
const filas = [];
for (let desde = 0; ; desde += 1000) {
  const pagina = await rest(`lab_corte_operaciones?select=operacion_id,malo,puntaje,incluida,veredicto_origen&corte_id=eq.${corte.id}&order=operacion_id.asc&offset=${desde}&limit=1000`);
  filas.push(...pagina);
  if (pagina.length < 1000) break;
}
const base = filas.filter((f) => f.incluida && f.veredicto_origen !== "control_bloqueo");
const [aucBase] = await rest("rpc/lab_auc", { method: "POST", body: JSON.stringify({ p_corte: corte.id }) });
const auc = E.aucPuntaje(base);
igual(`AUC contra lab_auc (${corte.nombre})`, Number(auc.auc.toFixed(4)), Number(aucBase.auc), 0);
igual("AUC de la curva ROC = AUC de Mann-Whitney", E.curvaRoc(base).auc, auc.auc, 1e-12);
const [desempeno] = await rest(`lab_resultados?select=resultado&corte_id=eq.${corte.id}&tipo=eq.desempeno&order=created_at.desc&limit=1`);
if (desempeno) igual("KS contra lab_calcular_desempeno", Number(E.ks(base).ks.toFixed(4)), Number(desempeno.resultado.ks), 0);

// IV: el mismo cálculo sobre los tramos que guardó la base.
const [variables] = await rest(`lab_resultados?select=resultado&corte_id=eq.${corte.id}&tipo=eq.variables&order=created_at.desc&limit=1`);
if (variables) {
  let peor = 0;
  for (const v of variables.resultado.variables) {
    const conteos = v.tramos.map((t) => ({ n: t.n, malos: t.malos }));
    peor = Math.max(peor, Math.abs(E.ivDeConteos(conteos).iv - v.iv));
  }
  igual(`IV de las ${variables.resultado.variables.length} variables contra la base (mayor diferencia)`, peor, 0, 1e-4);
}

console.log(fallas ? `\n${fallas} FALLAS` : "\nTodo coincide.");
process.exit(fallas ? 1 : 0);
