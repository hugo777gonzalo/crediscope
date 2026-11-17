// Arma, para cada caso de una corrida de la revisión del análisis, la carpeta con todo lo
// que un jefe de crédito necesita para dictaminar el análisis (habilidad
// `revision-del-analisis`, paso 3). Es mecánico: no opina sobre los casos.
//
// Por qué existe: el revisor tiene que juzgar el análisis SIN ver lo que dijo el modelo ni lo
// que decidió la institución (a ciegas), y para eso necesita lo que leyó el modelo (el marco
// del análisis, el que sea), lo que leería hoy (el marco vigente, con el buró si hay una
// consulta vigente de Equifax), el predictor, la capacidad, las demandas y el crudo. Sólo
// después se le abre la respuesta del modelo y, al final, la decisión real y cómo se pagó.
//
// Qué lee de cada caso (`seleccion.json`, que escribe `elegir-casos.mjs`):
//   - el análisis (`analisisId`) y su marco (`rules_version`): el texto de ese marco sale de
//     git, de la última versión del archivo que lo llevaba (v28 y v30 ya no están en el árbol);
//   - la base de prueba de AWS (`research/base-prueba-2026-11/`), SI la persona está: la
//     capacidad de pago, el cruce de flujos, la decisión de la institución y la solicitud real.
//     Para una persona de la cartera de producción esos archivos no existen, y lo dicen: no es
//     una falta, es que el dato sólo existe para la base de prueba;
//   - el resultado de pago (`resultado-de-pago.mjs`), también sólo de la base de prueba;
//   - la última estimación del predictor de `research/estimaciones-en-lote/`.
//
// SÓLO LECTURA. No escribe en la base, no abre ejecución operativa y no llama a Anthropic,
// Equifax ni Proveedor_Info_1: el pedido del marco vigente se ARMA con armarPedidoScoring()
// pero no se envía, y el crudo se lee del depósito propio.
//
// Los datos de las carpetas son completos (cédulas, nombres): salen a research/, fuera de
// git. Por consola sólo se escribe c-xxxxxxxx.
//
// Fases de cada carpeta (INDICE.md):
//   1. A ciegas: lo que leyó el modelo y lo que se sabe de la persona, sin la respuesta;
//   2. Contra el modelo: la respuesta del análisis (y la del otro marco, si hay);
//   3. Contra la institución: su decisión y el resultado de pago, al final. El resultado de
//      pago dice cómo terminó el crédito: en la fase 1 sería un ancla tan fuerte como el score.
// Al terminar cada caso, el guion abre los JSON de la fase 1 y corta si alguno trae una clave
// de las fases 2 o 3: en el piloto `capacidad.json` traía el score del modelo y contaminó 3 de
// 12 dictámenes, y esa comprobación se hacía a mano.
//
// Uso:
//   node scripts/revision-del-analisis/armar-carpetas.mjs --carpeta=<ruta completa de la corrida>
//
// AVISO: este archivo no pasa por lint ni build.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PRINCIPAL, RAIZ, accesoASupabase, corto, lectorDeCrudos, motivo } from "./comun.mjs";

const arg = (nombre, porDefecto) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? porDefecto;
if (!arg("carpeta")) {
  console.error("Falta --carpeta=<ruta completa de la corrida> (la que escribió elegir-casos.mjs, con su seleccion.json).");
  process.exit(1);
}
const CORRIDA = path.resolve(arg("carpeta"));
const BASE_PRUEBA = path.join(PRINCIPAL, "research", "base-prueba-2026-11");
const CARPETA_DEL_PREDICTOR = path.join(PRINCIPAL, "research", "estimaciones-en-lote");
const RESULTADO_DE_PAGO = path.join(PRINCIPAL, "research", "revision-del-analisis", "resultado-de-pago-base-prueba.json");

// Los secretos se leen del archivo y no se imprimen.
const acceso = accesoASupabase();
globalThis.Deno = { env: { get: (k) => process.env[k] } };
const compartido = (a) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", a)).href);
const { armarPedidoScoring, CONFIG_LLM } = await compartido("llm-scoring.ts");
const { buroDeLaBase, consultaVigenteDeEquifax } = await compartido("buro-de-la-institucion.ts");
const { loadDisabledFields } = await compartido("runtime-config.ts");
const marcoVigente = await compartido("marco-interpretativo.ts");
const { MARCO_VERSION: MARCO_SIN_BURO, MARCO_VERSION_CON_BURO: MARCO_CON_BURO } = marcoVigente;

const supabase = createClient(acceso.url, acceso.clave, { auth: { persistSession: false } });
const crudoDelPerfil = lectorDeCrudos(acceso);

const escribirJson = (ruta, datos) => fs.writeFileSync(ruta, JSON.stringify(datos, null, 2), "utf8");
// «marco-v30» -> «v30», para los nombres de archivo.
const abreviar = (marco) => String(marco).replace(/^marco-/, "");

// ----------------------------------------------------------------- los marcos
// El texto que lee el modelo, de la versión que sea. Un marco viejo ya no está en el árbol: se
// saca de git (lectura) del último commit que lo llevaba, a un archivo temporal que Node
// importa como módulo (ese texto no lleva interpolaciones, así que el módulo se evalúa solo).
//
// Por qué «el último commit que lo llevaba»: `git log -S'MARCO_VERSION = "marco-v30"'` devuelve
// los commits en que esa línea apareció y desapareció; el más nuevo es el que la cambió por
// la versión siguiente, y su padre tiene el texto final de marco-v30. Así se eligieron a mano
// los dos del piloto (684b243^ para v28 y 59f5ef0^ para v30), y da los mismos.
//
// Qué texto leyó un análisis lo decide cómo arma el pedido llm-scoring.ts (config.buroDeLaInstitucion):
//   - con el interruptor apagado, rules_version es MARCO_VERSION y el texto es MARCO_INTERPRETATIVO,
//     uno solo;
//   - con el interruptor encendido, rules_version es MARCO_VERSION_CON_BURO para TODAS las personas
//     y el texto es marcoConElBuro(x), donde x es si el perfil del modelo trae `buroEquifax`: son
//     dos textos de una misma versión. Cuál leyó cada análisis lo dice su mensaje_al_modelo.
// La primera versión de este guion tomaba marcoConElBuro(false) para marco-v30: era otro texto
// (cambia el rótulo «Garantías») y no el que leyó ese lote.
const ARCHIVO_DEL_MARCO = "supabase/functions/_shared/marco-interpretativo.ts";
const git = (...args) => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

async function moduloDelCommit(commit) {
  const fuente = git("show", `${commit}:${ARCHIVO_DEL_MARCO}`);
  const temporal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "marco-")), "marco.ts");
  fs.writeFileSync(temporal, fuente, "utf8");
  return import(pathToFileURL(temporal).href);
}

/** Los textos de una versión que expone un módulo del marco: { unico } o { conEquifax, sinEquifax }. */
function textosDeLaVersion(modulo, version, origen) {
  let textos = null;
  if (modulo.MARCO_VERSION_CON_BURO === version && typeof modulo.marcoConElBuro === "function") {
    textos = { conEquifax: modulo.marcoConElBuro(true), sinEquifax: modulo.marcoConElBuro(false) };
  } else if (modulo.MARCO_VERSION === version) {
    textos = { unico: modulo.MARCO_INTERPRETATIVO };
  }
  // Un texto corto o vacío es un módulo que no se evaluó bien, no un marco.
  if (!textos || Object.values(textos).some((x) => typeof x !== "string" || x.length < 1000)) return null;
  return { ...textos, origen };
}

/** Los textos del marco de esa versión; null si no se encuentra. */
async function buscarTextosDelMarco(version) {
  const delArbol = textosDeLaVersion(marcoVigente, version, "el árbol (vigente)");
  if (delArbol) return delArbol;
  for (const constante of ["MARCO_VERSION_CON_BURO", "MARCO_VERSION"]) {
    const commits = git("log", "--format=%H", `-S${constante} = "${version}"`, "--", ARCHIVO_DEL_MARCO).split(/\r?\n/).filter(Boolean);
    // Con un solo commit la línea sigue en el árbol y no es de una versión que ya pasó.
    if (commits.length < 2) continue;
    const commit = `${commits[0]}^`;
    let modulo;
    try { modulo = await moduloDelCommit(commit); } catch { continue; }
    const encontrado = textosDeLaVersion(modulo, version, `git ${commit.slice(0, 7)}`);
    if (encontrado) return encontrado;
  }
  return null;
}

// Los marcos de la corrida, escritos una sola vez cada uno: `marco-vNN.txt` y, si la versión tiene
// dos textos, `marco-vNN.txt` es el que lleva la sección de Equifax y `marco-vNN-sin-equifax.txt` el otro.
const marcosEscritos = new Map(); // version -> { unico?, conEquifax?, sinEquifax? (nombres de archivo), origen } | null
async function escribirMarco(version) {
  if (marcosEscritos.has(version)) return marcosEscritos.get(version);
  const textos = await buscarTextosDelMarco(version);
  let resultado = null;
  if (textos) {
    resultado = { origen: textos.origen };
    const poner = (clave, archivo, contenido) => { fs.writeFileSync(path.join(CORRIDA, archivo), contenido, "utf8"); resultado[clave] = archivo; };
    if (textos.unico) poner("unico", `${version}.txt`, textos.unico);
    else { poner("conEquifax", `${version}.txt`, textos.conEquifax); poner("sinEquifax", `${version}-sin-equifax.txt`, textos.sinEquifax); }
  }
  marcosEscritos.set(version, resultado);
  return resultado;
}

/** El archivo del marco que leyó un mensaje: el único, o el que dice su `perfilDelModelo` (con o sin buroEquifax). */
function archivoDelMarcoQueLeyo(escrito, mensaje) {
  if (!escrito) return null;
  if (escrito.unico) return escrito.unico;
  return mensaje && "buroEquifax" in (mensaje.perfilDelModelo ?? {}) ? escrito.conEquifax : escrito.sinEquifax;
}

// ---------------------------------------------------------------------- CSV
// Con comillas, por si un valor lleva coma.
function leerCsv(ruta) {
  const filas = [];
  let campo = "", fila = [], entreComillas = false;
  const texto = fs.readFileSync(ruta, "utf8").replace(/^﻿/, "");
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x !== "")) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  const [cabecera, ...resto] = filas;
  return resto.map((f) => Object.fromEntries(cabecera.map((h, i) => [h, f[i] ?? ""])));
}

// ------------------------------------------------------------- diferencias
// Aplana un objeto a rutas hoja. Los arreglos de escalares son una hoja (se
// comparan enteros); los de objetos se indexan por posición.
function esEscalarOLista(v) {
  return v === null || typeof v !== "object" || (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object"));
}
function aplanar(v, ruta = "", salida = new Map()) {
  if (esEscalarOLista(v)) { salida.set(ruta, v); return salida; }
  if (Array.isArray(v)) {
    if (v.length === 0) salida.set(ruta, v);
    v.forEach((x, i) => aplanar(x, `${ruta}[${i}]`, salida));
  } else {
    const claves = Object.keys(v);
    if (claves.length === 0) salida.set(ruta, v);
    for (const k of claves) aplanar(v[k], ruta ? `${ruta}.${k}` : k, salida);
  }
  return salida;
}
const texto = (v, tope = 300) => {
  const s = v === undefined ? "(no está)" : JSON.stringify(v);
  const limpio = s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return limpio.length > tope ? `${limpio.slice(0, tope)}… (${limpio.length} caracteres)` : limpio;
};
// Si una rama entera aparece o desaparece, una sola fila con la rama (no una
// por hoja): el revisor ve "falta buroEquifax" y no 400 renglones. El detalle
// completo está en los dos JSON.
function diferencias(antes, despues) {
  const a = aplanar(antes), d = aplanar(despues);
  const rutas = [...new Set([...a.keys(), ...d.keys()])];
  const filas = [];
  for (const r of rutas) {
    const enA = a.has(r), enD = d.has(r);
    if (enA && enD && JSON.stringify(a.get(r)) === JSON.stringify(d.get(r))) continue;
    filas.push({ ruta: r, antes: enA ? a.get(r) : undefined, despues: enD ? d.get(r) : undefined, estado: !enA ? "aparece" : !enD ? "desaparece" : "cambia" });
  }
  // Colapsa las hojas de una misma rama que aparece/desaparece por completo.
  const nivel1 = (r) => r.split(/[.[]/)[0];
  const colapsadas = [];
  const ramas = new Map();
  for (const f of filas) {
    if (f.estado === "cambia") { colapsadas.push(f); continue; }
    const rama = nivel1(f.ruta);
    const esRamaEntera = !f.ruta.includes(".") && !f.ruta.includes("[");
    if (!ramas.has(rama)) ramas.set(rama, []);
    ramas.get(rama).push({ f, esRamaEntera });
  }
  for (const [rama, items] of ramas) {
    const enteraEnA = antes && Object.hasOwn(antes, rama), enteraEnD = despues && Object.hasOwn(despues, rama);
    const soloUnLado = items.every((x) => x.f.estado === items[0].f.estado);
    if (soloUnLado && items.length > 1 && (items[0].f.estado === "aparece" ? !enteraEnA : !enteraEnD)) {
      const valor = items[0].f.estado === "aparece" ? despues[rama] : antes[rama];
      colapsadas.push({ ruta: rama, antes: items[0].f.estado === "aparece" ? undefined : valor, despues: items[0].f.estado === "aparece" ? valor : undefined, estado: items[0].f.estado, hojas: items.length });
    } else for (const x of items) colapsadas.push(x.f);
  }
  return colapsadas.sort((x, y) => x.ruta.localeCompare(y.ruta));
}
function tablaDeDiferencias(filas, antes, despues) {
  if (!filas.length) return `_Sin diferencias: el modelo leería hoy exactamente lo mismo que leyó con ${antes}._\n`;
  const cuenta = (e) => filas.filter((f) => f.estado === e).length;
  const lineas = [
    `${filas.length} diferencias: ${cuenta("aparece")} claves que aparecen (no estaban en ${antes}), ${cuenta("desaparece")} que desaparecen y ${cuenta("cambia")} que cambian de valor.`,
    `Una rama que aparece o desaparece entera va en una sola fila (con la cantidad de hojas); el detalle está en \`leido-${antes}.json\` y \`leeria-${despues}.json\`.`,
    "",
    `| Ruta | Estado | Antes (${antes}) | Después (${despues}) |`,
    "|---|---|---|---|",
  ];
  for (const f of filas) lineas.push(`| \`${f.ruta}\`${f.hojas ? ` (${f.hojas} hojas)` : ""} | ${f.estado} | ${texto(f.antes)} | ${texto(f.despues, 600)} |`);
  return lineas.join("\n") + "\n";
}

// ----------------------------------------------------------------- demandas
// En el crudo, `demandas` son las que presentaron CONTRA la persona (rol
// demandado) y `demandasOfendido` las que la persona presentó (ofendido/actor);
// ver process.ts. tipoDemanda.descripcion es el rol, no el tema: el tema vive en
// demanda.delito. Las fechas vienen en milisegundos desde 1970; Ecuador es UTC-5.
const fechaEc = (ms) => (typeof ms === "number" && ms > 0 ? new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10) : null);
function itemsDe(fuente, campo) {
  const paginas = Array.isArray(fuente) ? fuente : fuente ? [fuente] : [];
  return paginas.flatMap((p) => (Array.isArray(p?.data?.[campo]) ? p.data[campo] : []));
}
function extraerDemandas(raw) {
  const filas = [];
  const vistas = new Set();
  const sumar = (fuente, campo, rol) => {
    for (const it of itemsDe(raw?.[fuente], campo)) {
      const d = it.demanda ?? {};
      const estado = d.estado ?? d.estadoProceso ?? it.estado ?? it.estadoProceso ?? null;
      const fila = {
        fuente, rol,
        fecha: fechaEc(d.fecha),
        proceso: d.numeroProceso ?? null,
        judicatura: d.judicatura ?? null,
        tema: d.delito ?? null,
        tipo: it.tipoDemanda?.descripcion ?? null,
        ofendido: d.ofendido ?? null,
        demandado: d.demandado ?? null,
        estado: estado ?? null,
        actualizadoLaFuente: fechaEc(it.fechaActualizacion),
      };
      // La fuente repite registros del mismo proceso: uno solo por proceso/tema/fecha.
      const clave = JSON.stringify([rol, fila.proceso, fila.tema, fila.fecha, fila.judicatura]);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      filas.push(fila);
    }
  };
  sumar("demandas", "demandas", "demandado (la demanda es contra la persona)");
  sumar("demandasOfendido", "demandas", "ofendido / actor (la persona presentó o es la afectada)");
  // Orden por fecha; las que no la traen, al final.
  filas.sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"));
  const estadoDeLaFuente = (f) => raw?.[f]?.status ?? (Array.isArray(raw?.[f]) ? "varias páginas" : raw?.[f] === undefined ? "no está en el crudo" : "sin estado");
  return { filas, estadoDemandas: estadoDeLaFuente("demandas"), estadoOfendido: estadoDeLaFuente("demandasOfendido") };
}
function mdDeDemandas(caso, crudo, dem, perfilId) {
  const l = [`# Demandas y procesos judiciales de ${corto(caso.clientId)}`, ""];
  if (!crudo) return l.concat("No se encontró el crudo de Proveedor_Info_1 de este perfil: no hay demandas que listar.", "").join("\n");
  const conFecha = dem.filas.filter((f) => f.fecha).length;
  l.push(`Fuente: crudo de Proveedor_Info_1 del perfil ${perfilId} (capturado el ${crudo.capturadoEl ?? "(sin fecha)"}).`);
  l.push(`Fuente \`demandas\` (contra la persona): estado ${dem.estadoDemandas}. Fuente \`demandasOfendido\` (la persona como ofendida): estado ${dem.estadoOfendido}.`, "");
  if (!dem.filas.length) { l.push("El crudo no trae ninguna demanda ni proceso judicial para esta persona.", ""); return l.join("\n"); }
  l.push(`${dem.filas.length} registros únicos, ${conFecha} con fecha${conFecha < dem.filas.length ? `; ${dem.filas.length - conFecha} NO traen fecha en el crudo` : ""}.`);
  l.push("El crudo no trae un estado del proceso (vigente, archivado, resuelto)" + (dem.filas.some((f) => f.estado) ? ", salvo donde se indica." : ": la columna Estado queda vacía."), "");
  l.push("| Fecha | Rol de la persona | Tipo / materia | Proceso | Judicatura | Contraparte | Estado |");
  l.push("|---|---|---|---|---|---|---|");
  const cel = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ") || "—";
  for (const f of dem.filas) {
    const contraparte = f.rol.startsWith("demandado") ? `demandante: ${cel(f.ofendido)}` : `demandado: ${cel(f.demandado)}`;
    l.push(`| ${f.fecha ?? "sin fecha"} | ${f.rol} | ${cel(f.tema)} | ${cel(f.proceso)} | ${cel(f.judicatura)} | ${contraparte} | ${cel(f.estado)} |`);
  }
  l.push("");
  return l.join("\n");
}

// ---------------------------------------------------------------- lo que se carga
const opcional = (ruta, lector) => (fs.existsSync(ruta) ? lector(ruta) : null);
const leerJson = (ruta) => JSON.parse(fs.readFileSync(ruta, "utf8"));
const seleccion = leerJson(path.join(CORRIDA, "seleccion.json"));
// De la base de prueba de AWS: sólo existe para sus 244 personas. NO es la consulta vigente que lee el
// guion de producción; es la referencia de lo que la institución decidió y pidió.
const creditoReal = opcional(path.join(BASE_PRUEBA, "credito-real.json"), leerJson);
const equifaxDePrueba = opcional(path.join(BASE_PRUEBA, "equifax.json"), leerJson);
const capacidad = new Map((opcional(path.join(BASE_PRUEBA, "capacidad-pro-plus.csv"), leerCsv) ?? []).map((f) => [f.perfil, f]));
const cruce = new Map((opcional(path.join(BASE_PRUEBA, "cruce-flujos.csv"), leerCsv) ?? []).map((f) => [f.perfil, f]));
const resultadoDePago = opcional(RESULTADO_DE_PAGO, leerJson);

// La estimación más reciente del predictor: el último archivo de la carpeta, no uno fijo.
const archivoDelPredictor = fs.existsSync(CARPETA_DEL_PREDICTOR)
  ? fs.readdirSync(CARPETA_DEL_PREDICTOR).filter((f) => f.endsWith(".jsonl")).sort().at(-1) ?? null
  : null;
const estimaciones = archivoDelPredictor
  ? fs.readFileSync(path.join(CARPETA_DEL_PREDICTOR, archivoDelPredictor), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  : [];

const camposDeshabilitados = await loadDisabledFields(supabase);
const hayBuro = (await buroDeLaBase(supabase)) === "equifax";
console.log(`Buró de la base: ${hayBuro ? "equifax" : "ninguno de Equifax"}; campos deshabilitados: ${camposDeshabilitados.size}; marco vigente: ${hayBuro ? MARCO_CON_BURO : MARCO_SIN_BURO} (interruptor del buró ${hayBuro ? "encendido" : "apagado"})`);
console.log(`Predictor: ${archivoDelPredictor ?? "sin archivo en research/estimaciones-en-lote/"}; resultado de pago: ${resultadoDePago ? "sí" : "sin archivo (resultado-de-pago.mjs)"}`);
const ahora = new Date();

// ------------------------------------------------------------------- las fases
// Las claves que sólo pueden estar en las fases 2 y 3, y los archivos de la fase 1 que se revisan.
const CLAVES_DE_LAS_FASES_2_Y_3 = ["crediscope_score", "recomendacion", "decision_aws", "decision_final", "perfil_final", "perfilFinal", "resultado_de_pago", "figura_en_la_cartera", "veredicto_origen"];
const ES_DE_LA_FASE_1 = (n) => n.endsWith(".json") && /^(leido-.*|leeria-.*|predictor|capacidad|control)\.json$/.test(n);

const CAMPOS_RESPUESTA = "id, rules_version, created_at, client_profile_id, crediscope_score, recomendacion, narrative_summary, positives, negatives, missing_info, inconsistencies, acciones_sugeridas, indicador_riesgo, indicador_historial, veredicto_origen, fallo, llm_usage";
const respuestaDe = (a) => ({
  analisis_id: a.id, marco: a.rules_version, fecha: a.created_at, client_profile_id: a.client_profile_id,
  score: a.crediscope_score, recomendacion: a.recomendacion, narrative_summary: a.narrative_summary,
  positives: a.positives, negatives: a.negatives, missing_info: a.missing_info, inconsistencies: a.inconsistencies,
  acciones_sugeridas: a.acciones_sugeridas, indicador_riesgo: a.indicador_riesgo, indicador_historial: a.indicador_historial,
  veredicto_origen: a.veredicto_origen, fallo: a.fallo, llm_usage: a.llm_usage,
});

// El análisis de un caso: el que dice `analisisId` y, en una selección del piloto (que no lo trae),
// el de marco-v30 de ese perfil.
async function analisisDelCaso(caso) {
  const consulta = supabase.from("analysis_results").select(`${CAMPOS_RESPUESTA}, mensaje_al_modelo`);
  if (caso.analisisId) {
    const { data, error } = await consulta.eq("id", caso.analisisId).maybeSingle();
    if (error) throw new Error(`${corto(caso.clientId)}: ${motivo(error)}`);
    return data;
  }
  const { data, error } = await consulta.eq("client_id", caso.clientId).eq("rules_version", caso.marco ?? "marco-v30").order("created_at", { ascending: false });
  if (error) throw new Error(`${corto(caso.clientId)}: ${motivo(error)}`);
  return data.find((x) => x.client_profile_id === caso.perfil) ?? data[0] ?? null;
}

// Busca, a cualquier profundidad, las claves que no pueden estar en la fase 1.
function clavesProhibidas(valor, ruta, hallazgos) {
  if (Array.isArray(valor)) valor.forEach((x, i) => clavesProhibidas(x, `${ruta}[${i}]`, hallazgos));
  else if (valor && typeof valor === "object") {
    for (const [k, x] of Object.entries(valor)) {
      if (CLAVES_DE_LAS_FASES_2_Y_3.includes(k)) hallazgos.push(`${ruta ? `${ruta}.` : ""}${k}`);
      clavesProhibidas(x, ruta ? `${ruta}.${k}` : k, hallazgos);
    }
  }
}

const resumen = [];
for (const caso of seleccion) {
  const id = corto(caso.clientId);
  const dir = path.join(CORRIDA, id);
  fs.mkdirSync(dir, { recursive: true });
  const faltas = []; // lo que faltó y por qué, para el índice
  const notas = []; // lo que no falta pero el revisor debe saber
  const f = (n) => path.join(dir, n);

  // --- el análisis y su marco
  const analisis = await analisisDelCaso(caso);
  if (!analisis) faltas.push("No se encontró el análisis del caso.");
  else if (analisis.client_profile_id !== caso.perfil) notas.push(`El análisis es de otro perfil (${analisis.client_profile_id}) que el de la selección (${caso.perfil}).`);
  const marco = analisis?.rules_version ?? caso.marco ?? "marco-v30";
  const v = abreviar(marco);
  const perfilId = analisis?.client_profile_id ?? caso.perfil;

  // --- el perfil
  const { data: perfil, error: eP } = await supabase.from("client_profiles")
    .select("id, created_at, standard_profile, control_bloqueo, estado_por_fuente, crudo_ruta").eq("id", perfilId).maybeSingle();
  if (eP) throw new Error(`${id}: ${motivo(eP)}`);
  if (!perfil) throw new Error(`${id}: el perfil ${perfilId} no existe`);

  // 1. lo que leyó el modelo con su marco
  const leido = analisis?.mensaje_al_modelo ?? null;
  if (leido) escribirJson(f(`leido-${v}.json`), leido); else faltas.push(`leido-${v}.json: el análisis no guardó \`mensaje_al_modelo\`.`);

  // 2. lo que leería hoy el marco vigente (sin enviar nada)
  const control = perfil.control_bloqueo ?? { bloqueado: false, hallazgos: [] };
  const buro = hayBuro ? await consultaVigenteDeEquifax(supabase, caso.clientId, ahora) : null;
  // Con el interruptor del buró encendido todas las personas quedan con la versión del buró, tengan o no una consulta vigente.
  const vigente = abreviar(hayBuro ? MARCO_CON_BURO : MARCO_SIN_BURO);
  // La misma fecha que la consulta del buró: es lo que leería hoy (las demandas de cobro con sus años, marco-v36).
  const params = armarPedidoScoring(perfil.standard_profile, control, camposDeshabilitados, CONFIG_LLM, buro, ahora);
  const leeria = JSON.parse(params.messages[0].content);
  escribirJson(f(`leeria-${vigente}.json`), leeria);
  const conBuro = Object.hasOwn(leeria, "buroEquifax");
  if (!buro) notas.push(`Sin consulta vigente de Equifax a hoy (vigencia hasta el 17 del mes): \`leeria-${vigente}.json\` no trae \`buroEquifax\` y le llega el texto de ${vigente} sin la sección de Equifax.`);
  else if (!conBuro) notas.push(`Hay consulta vigente de Equifax pero \`leeria-${vigente}.json\` no trae \`buroEquifax\`: revisar.`);
  else notas.push(`Equifax vigente: consulta del ${buro.consultadoEl}.`);

  // 3. diferencias entre lo que leyó y lo que leería hoy
  const difs = leido ? diferencias(leido, leeria) : [];
  fs.writeFileSync(f(`diferencias-${v}-${vigente}.md`), [
    `# Qué cambia entre lo que leyó ${marco} y lo que leería hoy marco-${vigente} (${id})`, "",
    "Mismo perfil guardado en los dos lados; lo que cambia es el código que arma el perfil del modelo y el buró de Equifax.",
    buro ? `Buró: consulta de Equifax del ${buro.consultadoEl}.` : `Buró: la persona no tiene consulta vigente de Equifax, así que ${vigente} no agrega \`buroEquifax\`.`, "",
    leido ? tablaDeDiferencias(difs, v, vigente) : `No se pudo comparar: falta \`leido-${v}.json\`.\n`,
  ].join("\n"), "utf8");

  // 4. predictor (la línea más reciente de la persona)
  const lineas = estimaciones.filter((e) => e.client_id === caso.clientId);
  if (lineas.length) {
    const e = lineas.sort((x, y) => String(y.consultado).localeCompare(String(x.consultado)))[0];
    escribirJson(f("predictor.json"), lineas.length > 1 ? { aviso: `${lineas.length} líneas de la persona; se muestra la más reciente`, archivo: archivoDelPredictor, ...e } : { archivo: archivoDelPredictor, ...e });
    if (e.perfil_id !== perfilId) notas.push(`El predictor se corrió sobre otro perfil (${e.perfil_id}) que el del análisis (${perfilId}).`);
    if (e.valorCentral == null) notas.push(`Predictor sin valor central: ${e.motivo ?? "sin motivo"}.`);
  } else {
    escribirJson(f("predictor.json"), { sin_estimacion: `La persona no está en ${archivoDelPredictor ?? "ninguna estimación de research/estimaciones-en-lote/"} (el predictor se corre sólo sobre el último perfil de cada persona real).` });
    faltas.push(`predictor: la persona no está en \`${archivoDelPredictor ?? "estimaciones-en-lote"}\`.`);
  }

  // 5. capacidad (sólo la base de prueba la calcula)
  // Va en la fase a ciegas: se le sacan el score y la recomendación del modelo y la decisión de la
  // institución, que los CSV traen al lado. En el piloto del 2026-11-06 se colaron y el primer
  // revisor lo marcó: con ellos a la vista el dictamen deja de ser ciego.
  const sinAncla = (fila) => fila && Object.fromEntries(Object.entries(fila).filter(([k]) => !/^(score|recomendacion|decision_aws)$/i.test(k)));
  const filaCap = capacidad.get(caso.perfil) ?? capacidad.get(perfilId), filaCruce = cruce.get(caso.perfil) ?? cruce.get(perfilId);
  const enLaBaseDePrueba = Boolean(filaCap || filaCruce || creditoReal?.[caso.cedula]);
  if (filaCap || filaCruce) {
    escribirJson(f("capacidad.json"), {
      nota: "Capacidad calculada para un crédito genérico de USD 5.000 a 36 meses, no para la solicitud real.",
      capacidad_pro_plus: sinAncla(filaCap) ?? null, cruce_flujos: sinAncla(filaCruce) ?? null,
    });
    if (!filaCap) faltas.push("capacidad: el perfil no está en `capacidad-pro-plus.csv`.");
    if (!filaCruce) faltas.push("cruce-flujos: el perfil no está en `cruce-flujos.csv`.");
  } else {
    escribirJson(f("capacidad.json"), { sin_capacidad: "La capacidad de pago Pro/Plus y el cruce de flujos sólo se calcularon para las 244 personas de la base de prueba de AWS, y esta persona no está. La capacidad se juzga con lo que trae el perfil." });
    notas.push("No hay capacidad de pago calculada ni cruce de flujos: sólo existen para la base de prueba de AWS (no es una falta).");
  }

  // 6. crudo y 7. demandas
  const { crudo, origen } = await crudoDelPerfil(perfilId, perfil.crudo_ruta);
  let dem = { filas: [], estadoDemandas: "", estadoOfendido: "" };
  if (crudo) {
    escribirJson(f("crudo-proveedor-info-1.json"), crudo);
    dem = extraerDemandas(crudo.raw);
    if (crudo.perfilId && crudo.perfilId !== perfilId) notas.push(`El crudo es del perfil ${crudo.perfilId}, no del ${perfilId}.`);
  } else faltas.push("crudo-proveedor-info-1.json: no se encontró el crudo del perfil (ni en el depósito ni en los respaldos de research/).");
  fs.writeFileSync(f("demandas.md"), mdDeDemandas(caso, crudo, dem, perfilId), "utf8");
  const conFecha = dem.filas.filter((x) => x.fecha).length;
  if (crudo && dem.filas.length && conFecha < dem.filas.length) notas.push(`Demandas: ${dem.filas.length - conFecha} de ${dem.filas.length} sin fecha en el crudo.`);

  // 8. la respuesta del análisis
  if (analisis) escribirJson(f(`respuesta-${v}.json`), respuestaDe(analisis));

  // 9. el otro marco, sólo donde hay: la selección trae `otroMarco` (o `analisis28`, la del piloto)
  const otro = caso.otroMarco ?? (caso.analisis28 ? { analisisId: caso.analisis28, marco: "marco-v28" } : null);
  let vOtro = null, leidoDelOtro = null;
  if (otro) {
    const { data: aOtro, error: eO } = await supabase.from("analysis_results").select(`${CAMPOS_RESPUESTA}, mensaje_al_modelo`).eq("id", otro.analisisId).maybeSingle();
    if (eO) throw new Error(`${id}: ${motivo(eO)}`);
    if (!aOtro) faltas.push(`respuesta del otro marco: el análisis ${otro.analisisId} no existe.`);
    else {
      vOtro = abreviar(aOtro.rules_version);
      escribirJson(f(`respuesta-${vOtro}.json`), respuestaDe(aOtro));
      leidoDelOtro = aOtro.mensaje_al_modelo ?? null;
      if (aOtro.mensaje_al_modelo) escribirJson(f(`leido-${vOtro}.json`), aOtro.mensaje_al_modelo);
      else faltas.push(`leido-${vOtro}.json: el análisis de ${aOtro.rules_version} no guardó \`mensaje_al_modelo\`.`);
      if (aOtro.client_profile_id !== perfilId) notas.push(`El análisis de ${aOtro.rules_version} es de otro perfil (${aOtro.client_profile_id}).`);
      await escribirMarco(aOtro.rules_version);
    }
  }

  // 10. la institución (lo último que se le abre al revisor)
  const real = creditoReal?.[caso.cedula];
  escribirJson(f("institucion.json"), enLaBaseDePrueba
    ? { decision_aws: caso.aws ?? null, perfil_final: caso.perfilFinal ?? null, credito_real: real ?? null }
    : { sin_decision_de_la_institucion: "La persona no está en la base de prueba de AWS, la única con la decisión real de la institución y su solicitud de crédito." });
  if (enLaBaseDePrueba && !real) faltas.push("institucion: la cédula no está en `credito-real.json` (se guardaron sólo `aws` y `perfilFinal`).");
  if (!enLaBaseDePrueba) notas.push("No hay decisión de la institución ni solicitud real: la persona no está en la base de prueba de AWS (no es una falta).");

  // 10b. cómo se pagó: el resultado de pago (propuesta p8). Va en la fase 3, nunca antes.
  const pago = resultadoDePago?.personas?.[caso.clientId];
  if (pago) {
    escribirJson(f("resultado-de-pago.json"), pago);
    notas.push(pago.figura_en_la_cartera ? "El crédito pedido figura en la cartera de la institución: `resultado-de-pago.json` dice cómo se pagó (fase 3)." : `Resultado de pago: ${pago.motivo ?? "el crédito pedido no figura en la cartera"} (fase 3).`);
  } else {
    escribirJson(f("resultado-de-pago.json"), { sin_resultado_de_pago: enLaBaseDePrueba ? "La persona no está en el archivo del resultado de pago: correr resultado-de-pago.mjs." : "El resultado de pago se arma cotejando la solicitud de crédito con la cartera de la institución, y sólo la base de prueba de AWS trae la solicitud." });
    if (enLaBaseDePrueba) faltas.push("resultado-de-pago.json: la persona no está en `resultado-de-pago-base-prueba.json`.");
  }

  // 11. control
  escribirJson(f("control.json"), { control_bloqueo: perfil.control_bloqueo, estado_por_fuente: perfil.estado_por_fuente });

  // 11b. Equifax de la base de prueba, como referencia (no lo lee el marco vigente)
  const eqPrueba = equifaxDePrueba?.[caso.cedula];
  if (eqPrueba) {
    escribirJson(f("equifax-referencia.json"), { nota: `Consulta de Equifax de la base de prueba (AWS): NO la lee el marco vigente en producción y no está en leeria-${vigente}.json. Es referencia para el revisor.`, fecha: eqPrueba.fecha, estructura: eqPrueba.estructura });
    if (!buro) notas.push(`Hay una consulta de Equifax de la base de prueba del ${eqPrueba.fecha} (equifax-referencia.json), pero no está en consultas_equifax ni vigente: ${vigente} no la lee.`);
  }

  // 12. los marcos de este caso, a la carpeta de la corrida (el vigente, los dos textos, siempre)
  const marcoLeido = await escribirMarco(marco);
  const marcoDeHoy = await escribirMarco(hayBuro ? MARCO_CON_BURO : MARCO_SIN_BURO);
  const marcoDelOtro = vOtro ? await escribirMarco(`marco-${vOtro}`) : null;
  const archivoLeido = archivoDelMarcoQueLeyo(marcoLeido, leido);
  const archivoDeHoy = archivoDelMarcoQueLeyo(marcoDeHoy, leeria);
  if (!marcoLeido) faltas.push(`El texto de ${marco}: no se encontró en git (ni en el árbol).`);

  // 13. índice
  const existe = (n) => fs.existsSync(f(n)) && fs.statSync(f(n)).size > 0;
  const fila = (n, que) => `- ${existe(n) ? "" : "(FALTA) "}\`${n}\`: ${que}`;
  fs.writeFileSync(f("INDICE.md"), [
    `# Carpeta del caso ${id}`, "",
    `Segmento: ${caso.segmento}. Perfil ${perfilId} (creado el ${perfil.created_at}). Crudo: ${origen ?? "no se encontró"}. Marco del análisis: ${marco}.`, "",
    "## Orden de apertura", "",
    "### FASE 1, a ciegas (no abras nada de las fases 2 y 3 hasta dictaminar)", "",
    fila(`leido-${v}.json`, `lo que leyó el modelo con ${marco}.`),
    fila(`leeria-${vigente}.json`, `lo que leería hoy marco-${vigente} con el mismo perfil (incluye el buró de Equifax si hay consulta vigente).`),
    fila(`diferencias-${v}-${vigente}.md`, "qué claves aparecen, desaparecen o cambian entre las dos; lo que le faltó al marco del análisis."),
    fila("predictor.json", `el predictor de ingresos (estimación sin guardar, ${archivoDelPredictor ?? "sin archivo"}).`),
    fila("capacidad.json", "capacidad de pago Pro y Plus y el cruce de flujos, para un crédito genérico de USD 5.000 a 36 meses (no la solicitud real); sólo existe para la base de prueba."),
    fila("demandas.md", "demandas y procesos judiciales del crudo, por fecha."),
    ...(existe("equifax-referencia.json") ? [fila("equifax-referencia.json", `Equifax de la base de prueba (no vigente y NO incluido en leeria-${vigente}.json): referencia.`)] : []),
    fila("control.json", "control de bloqueo y estado por fuente del perfil."),
    fila("crudo-proveedor-info-1.json", "el crudo de Proveedor_Info_1 del perfil, si hace falta ir al dato."),
    "", "### FASE 2, después de dictaminar", "",
    fila(`respuesta-${v}.json`, `la respuesta del modelo con ${marco} (score, recomendación, razones).`),
    ...(vOtro ? [fila(`respuesta-${vOtro}.json`, `la respuesta del análisis del otro marco, ${vOtro}.`), fila(`leido-${vOtro}.json`, "lo que leyó ese análisis.")] : []),
    "", "### FASE 3, al final", "",
    fila("institucion.json", "la decisión real de la institución, el perfil final y la solicitud real de crédito (sólo la base de prueba)."),
    fila("resultado-de-pago.json", "cómo se pagó: si el crédito pedido ya figura en la cartera de la institución y, si figura, su estado, las cuotas pagadas y la mora máxima. Es el dato más fuerte del caso y por eso va último."),
    "", "## Los marcos", "",
    "En la carpeta de la corrida (un nivel arriba), con el texto completo que lee el modelo:",
    `- el que leyó este análisis (${marco}): ${archivoLeido ? `\`${archivoLeido}\`` : "no se encontró"};`,
    `- el que le llegaría hoy (${vigente}): ${archivoDeHoy ? `\`${archivoDeHoy}\`` : "no se encontró"}${marcoDeHoy?.conEquifax ? (archivoDeHoy === marcoDeHoy.conEquifax ? " (con la sección de Equifax)" : " (sin la sección de Equifax: no tiene una consulta vigente)") : ""}${marcoDelOtro ? `; el del otro marco (${vOtro}): \`${archivoDelMarcoQueLeyo(marcoDelOtro, leidoDelOtro)}\`` : ""}.`,
    "## Qué faltó y por qué", "",
    ...(faltas.length ? faltas.map((x) => `- ${x}`) : ["- Nada: están todos los archivos."]),
    "", "## Lo que hay que saber", "",
    ...(notas.length ? notas.map((x) => `- ${x}`) : ["- Nada especial."]),
    "",
  ].join("\n"), "utf8");

  // 14. la guarda del ciego: ningún JSON de la fase 1 que arma este guion trae una clave de las fases 2 o 3.
  // El crudo y la consulta de Equifax son datos de la fuente (traen sus propios `score` y calificaciones) y no se revisan.
  const contaminados = [];
  for (const archivo of fs.readdirSync(dir).filter(ES_DE_LA_FASE_1)) {
    const hallazgos = [];
    clavesProhibidas(leerJson(f(archivo)), "", hallazgos);
    if (hallazgos.length) contaminados.push(`${archivo}: ${[...new Set(hallazgos)].slice(0, 4).join(", ")}`);
  }
  if (contaminados.length) {
    throw new Error(`${id}: la fase 1 no es ciega, trae claves de las fases 2 o 3 (${contaminados.join("; ")}). Arreglar el guion antes de dar las carpetas.`);
  }

  resumen.push({
    caso: id, marco, equifax: conBuro ? "sí" : "no", predictor: lineas.length && lineas[0].valorCentral != null ? "sí" : lineas.length ? "sin valor" : "no",
    crudo: crudo ? "sí" : "no", demandas: crudo ? `${dem.filas.length} (${conFecha} con fecha)` : "—",
    pago: pago?.figura_en_la_cartera ? pago.resultado.clase : pago ? "no figura" : "—", faltas: faltas.length,
  });
  console.log(`${id}: listo (${faltas.length} faltas)`);
}
const noEncontrados = [...marcosEscritos].filter(([, valor]) => !valor).map(([k]) => k);
console.log(`Marcos escritos en la corrida: ${[...marcosEscritos].filter(([, valor]) => valor).map(([k]) => k).join(", ")}${noEncontrados.length ? `; NO se encontraron: ${noEncontrados.join(", ")}` : ""}`);
console.table(resumen);
