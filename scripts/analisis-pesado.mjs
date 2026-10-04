// Lo pesado del Laboratorio (fase F, decisión 2 de
// docs/laboratorio-pantallas.md): bosque aleatorio con importancia por
// permutación y SHAP, segmentos por K-medias y componentes principales,
// sobre las variables congeladas de un corte. Corre en la máquina del
// negocio y guarda en lab_resultados (tipos importancia, segmentos_kmedias y
// pca); las pantallas sólo lo muestran. La decisión decía Python; en esta
// máquina no hay, y el bosque, SHAP, K-medias y PCA están en
// src/lib/bosque.js y src/lib/segmentacion.js, probados en
// scripts/probar-estadistica.mjs.
//
// Las variables protegidas (edad, género) no entran: el negocio decidió que
// no pesen. Una persona una vez. Un faltante se rellena con la mediana y, si
// falta en el 5% o más, se agrega una columna "falta" (que falte puede
// anticipar).
//
// Lo que no pasa por lint ni build se rompe en silencio: correr primero con
// --seco (calcula e imprime, no guarda).
//
// Uso: node scripts/analisis-pesado.mjs --corte=<uuid> [--poblacion=solicitudes|operaciones]
//        [--que=importancia,segmentos,pca] [--arboles=100] [--seco]

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const CORTE = arg("corte", null);
const SECO = process.argv.includes("--seco");
const QUE = new Set(arg("que", "importancia,segmentos,pca").split(","));
const ARBOLES = Number(arg("arboles", "100"));
const SEMILLA = 1;
if (!/^[0-9a-f-]{36}$/i.test(CORTE ?? "")) throw new Error("Falta --corte=<uuid>");

const importar = (archivo) => import(pathToFileURL(path.join(RAIZ, "src/lib", archivo)).href);
const F = await importar("filasDelCorte.js");
const E = await importar("estadistica.js");
const B = await importar("bosque.js");
const S = await importar("segmentacion.js");

const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const auth = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };
// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function rest(ruta, opciones = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, { ...opciones, headers: { ...auth, ...(opciones.headers ?? {}) } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${ruta.split("?")[0]}: HTTP ${r.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

const [corte] = await rest(`lab_cortes?select=id,nombre,es_sintetico,resumen&id=eq.${CORTE}`);
if (!corte) throw new Error("No existe el corte");
const POBLACION = arg("poblacion", corte.resumen?.solicitudes ? "solicitudes" : "operaciones");
const solicitudes = POBLACION === "solicitudes";
const select = encodeURIComponent((solicitudes ? F.SELECT_SOLICITUDES : F.SELECT_OPERACIONES).replace(/\s+/g, ""));
const crudas = [];
// PostgREST corta en 1.000 filas sin avisar: se pagina hasta una página corta con orden total.
for (let desde = 0; ; desde += 1000) {
  const pagina = await rest(`${solicitudes ? "lab_corte_solicitudes" : "lab_corte_operaciones"}?select=${select}&corte_id=eq.${CORTE}&order=${solicitudes ? "solicitud_id" : "operacion_id"}.asc&offset=${desde}&limit=1000`);
  crudas.push(...pagina);
  if (pagina.length < 1000) break;
}
const filas = F.filasObservadas(crudas.map(solicitudes ? F.normalizarSolicitud : F.normalizarOperacion), { unaPorPersona: true });
const catalogo = (await rest("lab_catalogo_variables?select=id,nombre,grupo,tipo,uso,en_perfil_del_modelo&activa=is.true&order=grupo.asc,nombre.asc"))
  .filter((v) => v.uso !== "protegida");
const y = filas.map((f) => (f.malo ? 1 : 0));
console.log(`${corte.nombre} · ${POBLACION}: ${filas.length} personas, ${y.reduce((s, v) => s + v, 0)} malos; ${catalogo.length} variables (sin las protegidas)`);

// ---------------------------------------------------------------- matriz
const ORDEN_CALIFICACION = { A1: 1, A2: 2, A3: 3, B1: 4, B2: 5, C1: 6, C2: 7, D: 8, E: 9 };
const faltante = (v) => v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
const columnas = [];
for (const v of catalogo) {
  const crudo = filas.map((f) => f.variables[v.id]);
  const parteFalta = crudo.filter(faltante).length / crudo.length;
  if (parteFalta === 1) continue;
  if (v.tipo === "categoria" && !["peor_calificacion", "mejor_calificacion"].includes(v.id)) {
    const conteo = new Map();
    for (const x of crudo) if (!faltante(x)) conteo.set(String(x), (conteo.get(String(x)) ?? 0) + 1);
    const frecuentes = [...conteo].filter(([, n]) => n >= 0.02 * crudo.length).sort((a, b) => b[1] - a[1]).slice(0, 6);
    for (const [cat] of frecuentes) columnas.push({ nombre: `${v.nombre} = ${cat}`, origen: v.id, enModelo: v.en_perfil_del_modelo, valores: crudo.map((x) => (String(x) === cat ? 1 : 0)) });
    continue;
  }
  const numero = (x) => (faltante(x) ? null : v.tipo === "categoria" ? ORDEN_CALIFICACION[x] ?? null : typeof x === "boolean" ? (x ? 1 : 0) : x);
  const valores = crudo.map(numero);
  const presentes = E.ordenar(valores.filter((x) => x !== null));
  const mediana = presentes.length ? E.cuantil(presentes, 0.5) : 0;
  columnas.push({ nombre: v.nombre, origen: v.id, enModelo: v.en_perfil_del_modelo, valores: valores.map((x) => (x === null ? mediana : x)) });
  if (parteFalta >= 0.05) columnas.push({ nombre: `${v.nombre} (falta)`, origen: v.id, enModelo: v.en_perfil_del_modelo, valores: valores.map((x) => (x === null ? 1 : 0)) });
}
const usables = columnas.filter((c) => new Set(c.valores).size > 1);
const X = filas.map((_, i) => usables.map((c) => c.valores[i]));
const origenes = [...new Set(usables.map((c) => c.origen))];
const nombreDe = new Map(catalogo.map((v) => [v.id, v]));
console.log(`matriz: ${X.length} × ${usables.length} columnas de ${origenes.length} variables`);

async function guardar(tipo, metodologia, resultado) {
  if (SECO) return;
  await rest("lab_resultados", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ corte_id: CORTE, tipo, metodologia, resultado, n: filas.length, n_malos: y.reduce((s, v) => s + v, 0) }) });
  console.log(`guardado: ${tipo}`);
}
const r4 = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const advertencias = [
  y.reduce((s, v) => s + v, 0) < 100 ? "Menos de 100 malos: orienta, no prueba." : null,
  corte.es_sintetico ? "Corte sintético: tiene que encontrar las variables de la regla plantada." : null,
  "Describe asociaciones del corte, no causas. Las variables protegidas (edad, género) no entran.",
].filter(Boolean);

// ------------------------------------------------------------ importancia
if (QUE.has("importancia")) {
  // Aprender en la primera mitad por fecha y medir en la segunda: medido
  // sobre lo mismo que aprendió, cualquier bosque sale perfecto.
  const orden = filas.map((f, i) => [f.fecha?.getTime() ?? 0, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  const mitad = Math.floor(orden.length / 2);
  const entrena = orden.slice(0, mitad), prueba = orden.slice(mitad);
  const t0 = Date.now();
  const bosque = B.entrenarBosque(entrena.map((i) => X[i]), entrena.map((i) => y[i]), { arboles: ARBOLES, profundidadMaxima: 6, minHoja: 20, semilla: SEMILLA });
  const Xp = prueba.map((i) => X[i]), yp = prueba.map((i) => y[i]);
  const aucBosque = E.aucPuntaje(Xp.map((x, k) => ({ puntaje: -B.predecirBosque(bosque, x), malo: yp[k] === 1 }))).auc;
  const aucMotor = E.aucPuntaje(prueba.map((i) => filas[i]).filter((f) => !f.bloqueado && Number.isFinite(f.puntaje))).auc;
  const grupos = origenes.map((o) => ({ nombre: o, columnas: usables.map((c, j) => (c.origen === o ? j : -1)).filter((j) => j >= 0) }));
  const perm = B.importanciaPorPermutacion(bosque, Xp, yp, grupos, { repeticiones: 3, semilla: SEMILLA });
  // SHAP sobre una muestra de la mitad de prueba (todo es lento y no cambia el promedio).
  const muestra = prueba.filter((_, k) => k % Math.max(1, Math.ceil(prueba.length / 600)) === 0);
  const base = B.valorBase(bosque);
  const shapPorOrigen = new Map(origenes.map((o) => [o, []]));
  const valorPorOrigen = new Map(origenes.map((o) => [o, []]));
  let peorPrecision = 0;
  for (const i of muestra) {
    const phi = B.shapBosque(bosque, X[i]);
    peorPrecision = Math.max(peorPrecision, Math.abs(base + phi.reduce((s, v) => s + v, 0) - B.predecirBosque(bosque, X[i])));
    for (const o of origenes) {
      shapPorOrigen.get(o).push({ i, v: usables.reduce((s, c, j) => s + (c.origen === o ? phi[j] : 0), 0) });
      const primera = usables.findIndex((c) => c.origen === o);
      valorPorOrigen.get(o).push(X[i][primera]);
    }
  }
  const recomendaciones = ["aprobar", "revisar", "negar", "bloqueado"];
  const variables = origenes.map((o) => {
    const s = shapPorOrigen.get(o);
    const medio = s.reduce((t, x) => t + Math.abs(x.v), 0) / (s.length || 1);
    // Dirección: si más valor empuja hacia caer (correlación del valor con su SHAP).
    const r = E.spearman(valorPorOrigen.get(o), s.map((x) => x.v)).r;
    const porRecomendacion = Object.fromEntries(recomendaciones.map((rec) => {
      const deRec = s.filter((x) => filas[x.i].recomendacion === rec);
      return [rec, deRec.length >= 10 ? r4(deRec.reduce((t, x) => t + Math.abs(x.v), 0) / deRec.length) : null];
    }));
    return {
      id: o, nombre: nombreDe.get(o)?.nombre ?? o, grupo: nombreDe.get(o)?.grupo, en_modelo: nombreDe.get(o)?.en_perfil_del_modelo ?? null,
      shap_medio: r4(medio), permutacion: r4(perm.grupos.find((g) => g.nombre === o)?.caida ?? null), direccion: r === null ? null : r > 0.2 ? "más, más riesgo" : r < -0.2 ? "más, menos riesgo" : "mixta",
      por_recomendacion: porRecomendacion,
    };
  }).sort((a, b) => b.shap_medio - a.shap_medio);
  console.log(`bosque de ${ARBOLES} árboles en ${((Date.now() - t0) / 1000).toFixed(1)} s; AUC en la mitad de prueba ${aucBosque?.toFixed(3)} (motor ${aucMotor?.toFixed(3)}); SHAP base + suma = predicción, mayor error ${peorPrecision.toExponential(1)}`);
  for (const v of variables.slice(0, 10)) console.log(`  ${v.shap_medio.toFixed(4)}  perm ${v.permutacion?.toFixed(4)}  ${v.en_modelo ? "         " : "NO LLEGA "} ${v.id} (${v.direccion})`);
  await guardar("importancia",
    { version: 1, poblacion: POBLACION, arboles: ARBOLES, profundidad_maxima: 6, min_hoja: 20, semilla: SEMILLA, validacion: "aprende en la primera mitad por fecha y mide en la segunda", shap: "TreeSHAP exacto sobre una muestra de la mitad de prueba", faltantes: "mediana, más una columna 'falta' si falta en el 5% o más", protegidas: "no entran" },
    { poblacion: POBLACION, personas: filas.length, malos: y.reduce((s, v) => s + v, 0), entrenamiento: { n: entrena.length, malos: entrena.reduce((s, i) => s + y[i], 0) }, prueba: { n: prueba.length, malos: yp.reduce((s, v) => s + v, 0), shap_sobre: muestra.length }, auc_bosque: r4(aucBosque), auc_motor: r4(aucMotor), valor_base: r4(base), precision_local: peorPrecision, variables, advertencias });
}

// ------------------------------------------------------------- segmentos
if (QUE.has("segmentos") || QUE.has("pca")) {
  const { Z } = S.estandarizarColumnas(X);
  const nombres = usables.map((c) => c.nombre);
  if (QUE.has("segmentos")) {
    const t0 = Date.now();
    const muestraSil = Z.filter((_, i) => i % Math.max(1, Math.ceil(Z.length / 800)) === 0);
    const indicesSil = Z.map((_, i) => i).filter((i) => i % Math.max(1, Math.ceil(Z.length / 800)) === 0);
    const corridas = [2, 3, 4, 5, 6].map((k) => {
      const km = S.kMedias(Z, k, { semilla: SEMILLA, reinicios: 5 });
      return { k, km, silueta: S.silueta(muestraSil, indicesSil.map((i) => km.grupos[i])) };
    });
    const elegida = corridas.reduce((a, b) => (b.silueta > a.silueta ? b : a));
    const medias = usables.map((c) => E.media(c.valores));
    const grupos = Array.from({ length: elegida.k }, (_, g) => {
      const idx = filas.map((_, i) => i).filter((i) => elegida.km.grupos[i] === g);
      const malos = idx.filter((i) => y[i]).length;
      const rasgos = usables.map((c, j) => ({ nombre: c.nombre, z: E.media(idx.map((i) => Z[i][j])), media_grupo: E.media(idx.map((i) => X[i][j])), media_total: medias[j] }))
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 6).map((x) => ({ ...x, z: r4(x.z), media_grupo: r4(x.media_grupo), media_total: r4(x.media_total) }));
      const recs = Object.fromEntries(["aprobar", "revisar", "negar", "bloqueado"].map((rec) => [rec, idx.filter((i) => filas[i].recomendacion === rec).length]));
      return { grupo: g + 1, n: idx.length, malos, tasa: r4(malos / idx.length), ic: E.wilson(malos, idx.length).map(r4), recomendaciones: recs, rasgos };
    }).sort((a, b) => b.tasa - a.tasa);
    console.log(`K-medias en ${((Date.now() - t0) / 1000).toFixed(1)} s; siluetas ${corridas.map((c) => `${c.k}: ${c.silueta?.toFixed(3)}`).join(" · ")}; elegido k = ${elegida.k}`);
    for (const g of grupos) console.log(`  grupo de ${g.n}: ${(g.tasa * 100).toFixed(1)}% de malos · ${g.rasgos.slice(0, 3).map((r) => `${r.nombre} z ${r.z}`).join(", ")}`);
    await guardar("segmentos_kmedias",
      { version: 1, poblacion: POBLACION, semilla: SEMILLA, reinicios: 5, k_probados: [2, 3, 4, 5, 6], eleccion: "la silueta más alta (sobre una muestra de 800)", columnas: "estandarizadas; faltantes con la mediana y columna 'falta'", protegidas: "no entran" },
      { poblacion: POBLACION, personas: filas.length, k: elegida.k, siluetas: Object.fromEntries(corridas.map((c) => [c.k, r4(c.silueta)])), grupos, advertencias: [...advertencias, elegida.silueta < 0.25 ? "Silueta menor a 0,25: la cartera no se parte en grupos de verdad; los grupos son cortes de una nube continua." : null].filter(Boolean) });
  }
  if (QUE.has("pca")) {
    const pca = S.componentesPrincipales(Z);
    const componentes = pca.vectores.slice(0, 6).map((v, c) => {
      const puntajes = Z.map((z) => pca.puntajes(z, c));
      const auc = E.aucPuntaje(puntajes.map((p, i) => ({ puntaje: -p, malo: y[i] === 1 }))).auc;
      return {
        componente: c + 1, explicada: r4(pca.explicada[c]), auc: r4(auc),
        cargas: v.map((w, j) => ({ nombre: nombres[j], carga: r4(w) })).sort((a, b) => Math.abs(b.carga) - Math.abs(a.carga)).slice(0, 8),
      };
    });
    // Una muestra de puntos para el gráfico, sin identificar a nadie.
    const puntos = Z.filter((_, i) => i % Math.max(1, Math.ceil(Z.length / 800)) === 0).map((z, k) => ({ x: r4(pca.puntajes(z, 0)), y: r4(pca.puntajes(z, 1)), malo: y[k * Math.max(1, Math.ceil(Z.length / 800))] === 1 }));
    console.log(`PCA: ${componentes.map((c) => `${c.componente}.ª ${(c.explicada * 100).toFixed(1)}%`).join(" · ")}`);
    await guardar("pca",
      { version: 1, poblacion: POBLACION, columnas: "estandarizadas (matriz de correlación); faltantes con la mediana y columna 'falta'", protegidas: "no entran" },
      { poblacion: POBLACION, personas: filas.length, columnas: usables.length, explicada: pca.explicada.slice(0, 15).map(r4), componentes, puntos, advertencias });
  }
}
