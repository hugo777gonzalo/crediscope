// Arma, para cada caso del piloto de la revisión experta, la carpeta con todo lo
// que un jefe de crédito necesita para dictaminar el análisis (docs: piloto
// del 2026-11-06). Es mecánico: no opina sobre los casos.
//
// Por qué existe: el revisor tiene que juzgar el análisis SIN ver lo que dijo el
// modelo ni lo que decidió la institución (a ciegas), y para eso necesita lo que
// leyó el modelo (marco-v30), lo que leería hoy (marco-v35, con el buró), el
// predictor, la capacidad, las demandas y el crudo. Sólo después se le abre la
// respuesta del modelo y, al final, la decisión real.
//
// SÓLO LECTURA. No escribe en la base, no abre ejecución operativa y no llama a
// Anthropic, Equifax ni Proveedor_Info_1: el pedido de marco-v35 se ARMA con
// armarPedidoScoring() pero no se envía, y el crudo se lee del depósito propio.
//
// Los datos de las carpetas son completos (cédulas, nombres): salen a
// research/, fuera de git. Por consola sólo se escribe c-xxxxxxxx.
//
// Uso:
//   node scripts/revision-del-analisis/armar-carpetas.mjs [--carpeta=<ruta del piloto>]
//
// AVISO: este archivo no pasa por lint ni build.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { cargarEntorno, raizPrincipal } from "../_comun/entorno.mjs";
import { leerCrudo } from "../_comun/crudo-del-ultimo-perfil.mjs";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..", "..");
const PRINCIPAL = raizPrincipal(RAIZ);
const arg = (nombre, porDefecto) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? porDefecto;
const PILOTO = path.resolve(arg("carpeta", path.join(PRINCIPAL, "research", "revision-del-analisis", "piloto-2026-11-06")));
const BASE_PRUEBA = path.join(PRINCIPAL, "research", "base-prueba-2026-11");
const ESTIMACIONES = path.join(PRINCIPAL, "research", "estimaciones-en-lote", "2026-11-05.jsonl");

// Los secretos se leen del archivo y no se imprimen.
cargarEntorno(RAIZ);
globalThis.Deno = { env: { get: (k) => process.env[k] } };
const compartido = (a) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", a)).href);
const { armarPedidoScoring, CONFIG_LLM } = await compartido("llm-scoring.ts");
const { buroDeLaBase, consultaVigenteDeEquifax } = await compartido("buro-de-la-institucion.ts");
const { loadDisabledFields } = await compartido("runtime-config.ts");
const { marcoConElBuro } = await compartido("marco-interpretativo.ts");

const URL_BASE = process.env.SUPABASE_URL;
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(URL_BASE, CLAVE, { auth: { persistSession: false } });
const cabeceras = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` };

const motivo = (e) => [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e);
const escribirJson = (ruta, datos) => fs.writeFileSync(ruta, JSON.stringify(datos, null, 2), "utf8");
const corto = (id) => `c-${String(id).slice(0, 8)}`;

// ----------------------------------------------------------------- los marcos
// El texto que lee el modelo, de tres versiones. v28 y v30 ya no están en el
// árbol: se sacan de git (lectura) a un archivo temporal que Node importa como
// módulo. Ese texto no lleva interpolaciones, así que el módulo se evalúa solo.
function marcoDeGit(commit) {
  const fuente = execFileSync("git", ["show", `${commit}:supabase/functions/_shared/marco-interpretativo.ts`], {
    cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const temporal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "marco-")), "marco.ts");
  fs.writeFileSync(temporal, fuente, "utf8");
  return import(pathToFileURL(temporal).href).then((m) => ({ texto: m.MARCO_INTERPRETATIVO, version: m.MARCO_VERSION }));
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
// completo está en leido-v30.json y leeria-v35.json.
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
function tablaDeDiferencias(filas) {
  if (!filas.length) return "_Sin diferencias: el modelo leería hoy exactamente lo mismo que leyó con marco-v30._\n";
  const cuenta = (e) => filas.filter((f) => f.estado === e).length;
  const lineas = [
    `${filas.length} diferencias: ${cuenta("aparece")} claves que aparecen (no estaban en v30), ${cuenta("desaparece")} que desaparecen y ${cuenta("cambia")} que cambian de valor.`,
    "Una rama que aparece o desaparece entera va en una sola fila (con la cantidad de hojas); el detalle está en `leido-v30.json` y `leeria-v35.json`.",
    "",
    "| Ruta | Estado | Antes (v30) | Después (v35) |",
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
function mdDeDemandas(caso, crudo, dem) {
  const l = [`# Demandas y procesos judiciales de ${corto(caso.clientId)}`, ""];
  if (!crudo) return l.concat("No se encontró el crudo de Proveedor_Info_1 de este perfil: no hay demandas que listar.", "").join("\n");
  const conFecha = dem.filas.filter((f) => f.fecha).length;
  l.push(`Fuente: crudo de Proveedor_Info_1 del perfil ${caso.perfil} (capturado el ${crudo.capturadoEl ?? "(sin fecha)"}).`);
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

// ----------------------------------------------------------------- crudo
// El del perfil EXACTO del análisis (no el último de la persona): crudo_ruta del
// perfil en el depósito. Si el perfil no lo tiene, se busca por perfilId en los
// respaldos locales de research/.
async function crudoDelPerfil(perfilId, crudoRuta) {
  if (crudoRuta) {
    try { return { crudo: await leerCrudo({ ruta: crudoRuta }, URL_BASE, cabeceras), origen: `depósito crudo-proveedor-info-1 (${crudoRuta})` }; }
    catch { /* cae a la búsqueda local */ }
  }
  const archivo = indiceLocal.get(perfilId);
  if (archivo) return { crudo: await leerCrudo({ archivo }, URL_BASE, cabeceras), origen: `respaldo local ${path.relative(PRINCIPAL, archivo)}` };
  return { crudo: null, origen: null };
}
const CARPETAS_DE_CRUDO = fs.readdirSync(path.join(PRINCIPAL, "research")).filter((d) => d.startsWith("proveedor-info-1-raw")).map((d) => path.join(PRINCIPAL, "research", d));
// perfilId -> archivo, leyendo sólo la cabecera de cada JSON (los crudos pesan).
const indiceLocal = new Map();
for (const carpeta of CARPETAS_DE_CRUDO) {
  for (const a of fs.readdirSync(carpeta).filter((x) => x.endsWith(".json"))) {
    const archivo = path.join(carpeta, a);
    const fd = fs.openSync(archivo, "r");
    const buf = Buffer.alloc(400);
    fs.readSync(fd, buf, 0, 400, 0);
    fs.closeSync(fd);
    const id = /"perfilId"\s*:\s*"([^"]+)"/.exec(buf.toString("utf8"))?.[1];
    if (id) indiceLocal.set(id, archivo);
  }
}

// ----------------------------------------------------------------- principal
const seleccion = JSON.parse(fs.readFileSync(path.join(PILOTO, "seleccion.json"), "utf8"));
const creditoReal = JSON.parse(fs.readFileSync(path.join(BASE_PRUEBA, "credito-real.json"), "utf8"));
// Equifax de la base de prueba (AWS), por cédula. NO es la consulta vigente que lee el
// guion de producción; sirve de referencia cuando consultas_equifax no tiene a la persona.
const equifaxDePrueba = JSON.parse(fs.readFileSync(path.join(BASE_PRUEBA, "equifax.json"), "utf8"));
const capacidad = new Map(leerCsv(path.join(BASE_PRUEBA, "capacidad-pro-plus.csv")).map((f) => [f.perfil, f]));
const cruce = new Map(leerCsv(path.join(BASE_PRUEBA, "cruce-flujos.csv")).map((f) => [f.perfil, f]));
const estimaciones = fs.readFileSync(ESTIMACIONES, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

// Los tres marcos, a la carpeta del piloto.
const marcoV28 = await marcoDeGit("684b243^");
const marcoV30 = await marcoDeGit("59f5ef0^");
fs.writeFileSync(path.join(PILOTO, "marco-v28.txt"), marcoV28.texto, "utf8");
fs.writeFileSync(path.join(PILOTO, "marco-v30.txt"), marcoV30.texto, "utf8");
fs.writeFileSync(path.join(PILOTO, "marco-v35.txt"), marcoConElBuro(true), "utf8");
// El texto vigente es doble: con la sección de Equifax sólo para quien tiene una consulta vigente;
// los demás reciben el de v34. En el piloto un revisor comparó contra el texto con Equifax y
// marcó como regresión algo que el texto sin Equifax sí dice.
fs.writeFileSync(path.join(PILOTO, "marco-v34-sin-equifax.txt"), marcoConElBuro(false), "utf8");
console.log(`Marcos: ${marcoV28.version}, ${marcoV30.version} y v35 (con el buró) escritos.`);

const camposDeshabilitados = await loadDisabledFields(supabase);
const hayBuro = (await buroDeLaBase(supabase)) === "equifax";
console.log(`Buró de la base: ${hayBuro ? "equifax" : "ninguno de Equifax"}; campos deshabilitados: ${camposDeshabilitados.size}`);
const ahora = new Date();

const CAMPOS_RESPUESTA = "id, rules_version, created_at, client_profile_id, crediscope_score, recomendacion, narrative_summary, positives, negatives, missing_info, inconsistencies, acciones_sugeridas, indicador_riesgo, indicador_historial, veredicto_origen, fallo, llm_usage";
const respuestaDe = (a) => ({
  analisis_id: a.id, marco: a.rules_version, fecha: a.created_at, client_profile_id: a.client_profile_id,
  score: a.crediscope_score, recomendacion: a.recomendacion, narrative_summary: a.narrative_summary,
  positives: a.positives, negatives: a.negatives, missing_info: a.missing_info, inconsistencies: a.inconsistencies,
  acciones_sugeridas: a.acciones_sugeridas, indicador_riesgo: a.indicador_riesgo, indicador_historial: a.indicador_historial,
  veredicto_origen: a.veredicto_origen, fallo: a.fallo, llm_usage: a.llm_usage,
});

const resumen = [];
for (const caso of seleccion) {
  const id = corto(caso.clientId);
  const dir = path.join(PILOTO, id);
  fs.mkdirSync(dir, { recursive: true });
  const faltas = []; // lo que faltó y por qué, para el índice
  const notas = []; // lo que no falta pero el revisor debe saber
  const f = (n) => path.join(dir, n);

  // --- el análisis marco-v30 de este perfil
  const { data: analisis, error: eA } = await supabase.from("analysis_results").select(`${CAMPOS_RESPUESTA}, mensaje_al_modelo`)
    .eq("client_id", caso.clientId).eq("rules_version", "marco-v30").order("created_at", { ascending: false });
  if (eA) throw new Error(`${id}: ${motivo(eA)}`);
  // El de v30 es el de 2026-10-31 (UTC) y del perfil de la selección.
  const a30 = analisis.find((x) => x.client_profile_id === caso.perfil && x.created_at.startsWith("2026-10-31")) ?? analisis.find((x) => x.client_profile_id === caso.perfil) ?? analisis[0];
  if (!a30) { faltas.push("No hay análisis marco-v30 de esta persona."); }
  else if (a30.client_profile_id !== caso.perfil) notas.push(`El análisis v30 es de otro perfil (${a30.client_profile_id}) que el de la selección (${caso.perfil}).`);
  const perfilId = a30?.client_profile_id ?? caso.perfil;

  // --- el perfil
  const { data: perfil, error: eP } = await supabase.from("client_profiles")
    .select("id, created_at, standard_profile, control_bloqueo, estado_por_fuente, crudo_ruta").eq("id", perfilId).maybeSingle();
  if (eP) throw new Error(`${id}: ${motivo(eP)}`);
  if (!perfil) throw new Error(`${id}: el perfil ${perfilId} no existe`);

  // 1. lo que leyó v30
  const leidoV30 = a30?.mensaje_al_modelo ?? null;
  if (leidoV30) escribirJson(f("leido-v30.json"), leidoV30); else faltas.push("leido-v30.json: el análisis v30 no guardó `mensaje_al_modelo`.");

  // 2. lo que leería hoy v35 (sin enviar nada)
  const control = perfil.control_bloqueo ?? { bloqueado: false, hallazgos: [] };
  const buro = hayBuro ? await consultaVigenteDeEquifax(supabase, caso.clientId, ahora) : null;
  const params = armarPedidoScoring(perfil.standard_profile, control, camposDeshabilitados, CONFIG_LLM, buro);
  const leeriaV35 = JSON.parse(params.messages[0].content);
  escribirJson(f("leeria-v35.json"), leeriaV35);
  const conBuro = Object.hasOwn(leeriaV35, "buroEquifax");
  if (!buro) notas.push("Sin consulta vigente de Equifax a hoy (vigencia hasta el 17 del mes): `leeria-v35.json` no trae `buroEquifax`.");
  else if (!conBuro) notas.push("Hay consulta vigente de Equifax pero `leeria-v35.json` no trae `buroEquifax`: revisar.");
  else notas.push(`Equifax vigente: consulta del ${buro.consultadoEl}.`);

  // 3. diferencias v30 contra v35
  const difs = leidoV30 ? diferencias(leidoV30, leeriaV35) : [];
  fs.writeFileSync(f("diferencias-v30-v35.md"), [
    `# Qué cambia entre lo que leyó marco-v30 y lo que leería hoy marco-v35 (${id})`, "",
    "Mismo perfil guardado en los dos lados; lo que cambia es el código que arma el perfil del modelo y el buró de Equifax.",
    buro ? `Buró: consulta de Equifax del ${buro.consultadoEl}.` : "Buró: la persona no tiene consulta vigente de Equifax, así que v35 no agrega `buroEquifax`.", "",
    leidoV30 ? tablaDeDiferencias(difs) : "No se pudo comparar: falta `leido-v30.json`.\n",
  ].join("\n"), "utf8");

  // 4. predictor (la línea más reciente de la persona)
  const lineas = estimaciones.filter((e) => e.client_id === caso.clientId);
  if (lineas.length) {
    const e = lineas.sort((x, y) => String(y.consultado).localeCompare(String(x.consultado)))[0];
    escribirJson(f("predictor.json"), lineas.length > 1 ? { aviso: `${lineas.length} líneas de la persona; se muestra la más reciente`, ...e } : e);
    if (e.perfil_id !== perfilId) notas.push(`El predictor se corrió sobre otro perfil (${e.perfil_id}) que el del análisis v30 (${perfilId}).`);
    if (e.valorCentral == null) notas.push(`Predictor sin valor central: ${e.motivo ?? "sin motivo"}.`);
  } else {
    escribirJson(f("predictor.json"), { sin_estimacion: "La persona no está en el lote de estimaciones del 2026-11-05 (el predictor se corrió sólo sobre el último perfil de cada persona real)." });
    faltas.push("predictor: la persona no está en `estimaciones-en-lote/2026-11-05.jsonl`.");
  }

  // 5. capacidad
  // Va en la fase a ciegas: se le sacan el score y la recomendación del modelo y la decisión de
  // la institución, que los CSV traen al lado. En el piloto del 2026-11-06 se colaron y el primer
  // revisor lo marcó: con ellos a la vista el dictamen deja de ser ciego.
  const sinAncla = (fila) => fila && Object.fromEntries(Object.entries(fila).filter(([k]) => !/^(score|recomendacion|decision_aws)$/i.test(k)));
  const filaCap = capacidad.get(caso.perfil) ?? capacidad.get(perfilId), filaCruce = cruce.get(caso.perfil) ?? cruce.get(perfilId);
  escribirJson(f("capacidad.json"), {
    nota: "Capacidad calculada para un crédito genérico de USD 5.000 a 36 meses, no para la solicitud real.",
    capacidad_pro_plus: sinAncla(filaCap) ?? null, cruce_flujos: sinAncla(filaCruce) ?? null,
  });
  if (!filaCap) faltas.push("capacidad: el perfil no está en `capacidad-pro-plus.csv`.");
  if (!filaCruce) faltas.push("cruce-flujos: el perfil no está en `cruce-flujos.csv`.");

  // 6. crudo y 7. demandas
  const { crudo, origen } = await crudoDelPerfil(perfilId, perfil.crudo_ruta);
  let dem = { filas: [], estadoDemandas: "", estadoOfendido: "" };
  if (crudo) {
    escribirJson(f("crudo-proveedor-info-1.json"), crudo);
    dem = extraerDemandas(crudo.raw);
    if (crudo.perfilId && crudo.perfilId !== perfilId) notas.push(`El crudo es del perfil ${crudo.perfilId}, no del ${perfilId}.`);
  } else faltas.push("crudo-proveedor-info-1.json: no se encontró el crudo del perfil (ni en el depósito ni en los respaldos de research/).");
  fs.writeFileSync(f("demandas.md"), mdDeDemandas(caso, crudo, dem), "utf8");
  const conFecha = dem.filas.filter((x) => x.fecha).length;
  if (crudo && dem.filas.length && conFecha < dem.filas.length) notas.push(`Demandas: ${dem.filas.length - conFecha} de ${dem.filas.length} sin fecha en el crudo.`);

  // 8. la respuesta v30
  if (a30) escribirJson(f("respuesta-v30.json"), respuestaDe(a30));

  // 9. v28, sólo donde hay
  if (caso.analisis28) {
    const { data: a28, error: e28 } = await supabase.from("analysis_results").select(`${CAMPOS_RESPUESTA}, mensaje_al_modelo`).eq("id", caso.analisis28).maybeSingle();
    if (e28) throw new Error(`${id}: ${motivo(e28)}`);
    if (!a28) faltas.push(`respuesta-v28/leido-v28: el análisis ${caso.analisis28} no existe.`);
    else {
      escribirJson(f("respuesta-v28.json"), respuestaDe(a28));
      if (a28.mensaje_al_modelo) escribirJson(f("leido-v28.json"), a28.mensaje_al_modelo);
      else faltas.push("leido-v28.json: el análisis v28 no guardó `mensaje_al_modelo`.");
      if (a28.client_profile_id !== perfilId) notas.push(`El análisis v28 es de otro perfil (${a28.client_profile_id}).`);
    }
  }

  // 10. la institución (lo último que se le abre al revisor)
  const real = creditoReal[caso.cedula];
  escribirJson(f("institucion.json"), { decision_aws: caso.aws, perfil_final: caso.perfilFinal, credito_real: real ?? null });
  if (!real) faltas.push("institucion: la cédula no está en `credito-real.json` (se guardaron sólo `aws` y `perfilFinal`).");

  // 11. control
  escribirJson(f("control.json"), { control_bloqueo: perfil.control_bloqueo, estado_por_fuente: perfil.estado_por_fuente });

  // 11b. Equifax de la base de prueba, como referencia (no lo lee v35)
  const eqPrueba = equifaxDePrueba[caso.cedula];
  if (eqPrueba) {
    escribirJson(f("equifax-referencia.json"), { nota: "Consulta de Equifax de la base de prueba (AWS): NO la lee marco-v35 en producción y no está en leeria-v35.json. Es referencia para el revisor.", fecha: eqPrueba.fecha, estructura: eqPrueba.estructura });
    if (!buro) notas.push(`Hay una consulta de Equifax de la base de prueba del ${eqPrueba.fecha} (equifax-referencia.json), pero no está en consultas_equifax ni vigente: v35 no la lee.`);
  }

  // 12. índice
  const existe = (n) => fs.existsSync(f(n)) && fs.statSync(f(n)).size > 0;
  const fila = (n, que) => `- ${existe(n) ? "" : "(FALTA) "}\`${n}\`: ${que}`;
  fs.writeFileSync(f("INDICE.md"), [
    `# Carpeta del caso ${id}`, "",
    `Segmento: ${caso.segmento}. Perfil ${perfilId} (creado el ${perfil.created_at}). Crudo: ${origen ?? "no se encontró"}.`, "",
    "## Orden de apertura", "",
    "### FASE 1, a ciegas (no abras nada de las fases 2 y 3 hasta dictaminar)", "",
    fila("leido-v30.json", "lo que leyó el modelo con marco-v30."),
    fila("leeria-v35.json", "lo que leería hoy marco-v35 con el mismo perfil (incluye el buró de Equifax si hay consulta vigente)."),
    fila("diferencias-v30-v35.md", "qué claves aparecen, desaparecen o cambian entre las dos; lo que le faltó a v30."),
    fila("predictor.json", "el predictor de ingresos (estimación sin guardar, 2026-11-05)."),
    fila("capacidad.json", "capacidad de pago Pro y Plus y el cruce de flujos, para un crédito genérico de USD 5.000 a 36 meses (no la solicitud real)."),
    fila("demandas.md", "demandas y procesos judiciales del crudo, por fecha."),
    ...(existe("equifax-referencia.json") ? [fila("equifax-referencia.json", "Equifax de la base de prueba (no vigente y NO incluido en leeria-v35.json): referencia.")] : []),
    fila("control.json", "control de bloqueo y estado por fuente del perfil."),
    fila("crudo-proveedor-info-1.json", "el crudo de Proveedor_Info_1 del perfil, si hace falta ir al dato."),
    "", "### FASE 2, después de dictaminar", "",
    fila("respuesta-v30.json", "la respuesta del modelo con marco-v30 (score, recomendación, razones)."),
    ...(caso.analisis28 ? [fila("respuesta-v28.json", "la respuesta del análisis anterior, con marco-v28."), fila("leido-v28.json", "lo que leyó ese análisis anterior.")] : []),
    "", "### FASE 3, al final", "",
    fila("institucion.json", "la decisión real de la institución, el perfil final y la solicitud real de crédito."),
    "", "## Los marcos", "",
    "En la carpeta del piloto (un nivel arriba): `marco-v28.txt`, `marco-v30.txt`, `marco-v35.txt` (con la sección de Equifax) y `marco-v34-sin-equifax.txt` (el que recibe hoy quien no tiene una consulta vigente), con el texto completo que lee el modelo.", "",
    "## Qué faltó y por qué", "",
    ...(faltas.length ? faltas.map((x) => `- ${x}`) : ["- Nada: están todos los archivos."]),
    "", "## Lo que hay que saber", "",
    ...(notas.length ? notas.map((x) => `- ${x}`) : ["- Nada especial."]),
    "",
  ].join("\n"), "utf8");

  resumen.push({
    caso: id, equifax: conBuro ? "sí" : "no", predictor: lineas.length && lineas[0].valorCentral != null ? "sí" : lineas.length ? "sin valor" : "no",
    crudo: crudo ? "sí" : "no", demandas: crudo ? `${dem.filas.length} (${conFecha} con fecha)` : "—", faltas: faltas.length,
  });
  console.log(`${id}: listo (${faltas.length} faltas)`);
}
console.table(resumen);
