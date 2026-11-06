// El predictor de ingresos sobre toda la cartera, SIN guardar: lo mismo que contestaría
// la función estimar-ingreso para el último perfil de cada persona real (decidirEstimacion
// y armarEstimacion de _shared/estimacion-de-ingreso.ts, con el modelo vigente publicado),
// para tener con qué medir el predictor antes de la primera estimación de verdad.
//
// Nació el 2026-11-05: la revisión de datos (habilidad revision-de-datos) tenía el
// predictor «no medido» porque estimaciones_de_ingreso está vacía, y guardar 3.766
// filas sólo para medir ocuparía la base (cerca del techo de 500 MB del plan Free) y
// mezclaría pruebas con lo que vigila el modelo.
//
// SOLO LEE: el último perfil (client_profiles), el modelo vigente (modelos_de_ingreso y
// su depósito) y, para comparar, el ingreso que estima Equifax en su última consulta
// (equifax_resumen). No consulta a ninguna fuente ni al modelo de lenguaje: no cuesta.
// El reloj de cada estimación es la fecha de su consulta, como en la función.
//
// Salida (fuera de git, personas reales): research/estimaciones-en-lote/AAAA-MM-DD.jsonl,
// una línea por persona. Por consola, sólo conteos y medianas.
//
//   node scripts/estimar-ingresos-en-lote.mjs [--limite=N]
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo con
// --limite=50 y abrir el archivo antes de confiar en los conteos.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carpetaDeResearch, cargarEntorno } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMITE = Number(process.argv.find((a) => a.startsWith("--limite="))?.slice(9) ?? Infinity);
const modulo = (archivo) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", archivo)).href);
const { armarEstimacion, crearCargadorDeModelo, decidirEstimacion, MINIMO_PARA_ROTULAR_COMO_ESTIMADO } = await modulo("estimacion-de-ingreso.ts");

// Los secretos se leen del archivo y no se imprimen.
cargarEntorno(RAIZ);
const U = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}` };
async function pedir(ruta) {
  const r = await fetch(`${U}/rest/v1/${ruta}`, { headers: H });
  const texto = await r.text();
  // Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
  return JSON.parse(texto);
}
// PostgREST corta en 1.000: se pagina por id.
async function todas(tabla, select, filtro = "") {
  const filas = [];
  let despues = null;
  for (;;) {
    const p = await pedir(`${tabla}?select=${select}${filtro}&order=id&limit=1000${despues ? `&id=gt.${despues}` : ""}`);
    filas.push(...p);
    if (p.length < 1000) return filas;
    despues = p.at(-1).id;
  }
}

const [fila] = await pedir("modelos_de_ingreso?select=id,version,nivel,huella_sha256,ruta_archivo,poblacion,calibracion&nivel=eq.1&estado=eq.vigente");
if (!fila) throw new Error("No hay un modelo vigente del nivel 1 (scripts/publicar-modelo-de-ingreso.mjs).");
const cargar = crearCargadorDeModelo(async (ruta) => {
  const r = await fetch(`${U}/storage/v1/object/modelos-de-ingreso/${ruta}`, { headers: H });
  if (!r.ok) throw new Error(`El depósito contestó ${r.status} al bajar el modelo`);
  return new Uint8Array(await r.arrayBuffer());
});
const vigente = await cargar(fila);

// Sólo personas reales: las sintéticas de Aval no cuentan (118).
const sinteticas = new Set((await todas("clients", "id", "&es_sintetico=eq.true")).map((c) => c.id));
const ultimo = new Map();
for (const p of await todas("client_profiles", "id,client_id,created_at")) {
  if (sinteticas.has(p.client_id)) continue;
  const a = ultimo.get(p.client_id);
  if (!a || p.created_at > a.created_at) ultimo.set(p.client_id, p);
}

// El ingreso que estima Equifax en la última consulta con resumen de cada persona.
const equifax = new Map();
{
  const consultas = await todas("consultas_equifax", "id,client_id,created_at", "&http_equifax=eq.200&client_id=not.is.null");
  const ultimaConsulta = new Map();
  for (const q of consultas) {
    const a = ultimaConsulta.get(q.client_id);
    if (!a || q.created_at > a.created_at) ultimaConsulta.set(q.client_id, q);
  }
  const ids = [...ultimaConsulta.values()].map((q) => q.id);
  for (let i = 0; i < ids.length; i += 100) {
    const resumenes = await pedir(`equifax_resumen?select=consulta_equifax_id,ingreso_estimado_usd,impacto_economico_ingreso_usd&consulta_equifax_id=in.(${ids.slice(i, i + 100).join(",")})`);
    const porConsulta = new Map(resumenes.map((r) => [r.consulta_equifax_id, r]));
    for (const q of ultimaConsulta.values()) {
      const r = porConsulta.get(q.id);
      if (r) equifax.set(q.client_id, { ingresoEstimado: r.ingreso_estimado_usd === null ? null : Number(r.ingreso_estimado_usd), impactoEconomico: r.impacto_economico_ingreso_usd === null ? null : Number(r.impacto_economico_ingreso_usd) });
    }
  }
}

const elegidos = [...ultimo.values()].slice(0, LIMITE);
const salida = path.join(carpetaDeResearch(RAIZ, "estimaciones-en-lote"), `${new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)}.jsonl`);
const escritor = fs.createWriteStream(salida);
const porMotivo = {};
const estimados = [];
let fallaron = 0;
for (let i = 0; i < elegidos.length; i += 50) {
  const lote = elegidos.slice(i, i + 50);
  const perfiles = await pedir(`client_profiles?select=id,client_id,created_at,standard_profile,estado_por_fuente&id=in.(${lote.map((p) => p.id).join(",")})`);
  for (const p of perfiles) {
    const decision = decidirEstimacion(p.standard_profile, p.estado_por_fuente);
    const clave = decision.nivel === 1 ? "estimado" : decision.motivo ?? `nivel ${decision.nivel}`;
    porMotivo[clave] = (porMotivo[clave] ?? 0) + 1;
    const linea = { client_id: p.client_id, perfil_id: p.id, consultado: p.created_at, nivel: decision.nivel, motivo: decision.motivo, equifax: equifax.get(p.client_id) ?? null };
    if (decision.nivel === 1) {
      try {
        const { fila: f } = armarEstimacion({ id: crypto.randomUUID(), perfil: p.standard_profile, decision, consultadoEl: p.created_at, ahora: new Date(p.created_at), vigente });
        Object.assign(linea, { valorCentral: f.valor_central, minimo90: f.minimo_90, minimo85: f.minimo_85, sinDato: f.sin_dato, rotulo: f.respuesta.estimado.aplica ? f.respuesta.estimado.rotulo : null });
        estimados.push(linea);
      } catch (e) {
        fallaron++;
        linea.error = e instanceof Error ? e.message : String(e);
      }
    }
    escritor.write(`${JSON.stringify(linea)}\n`);
  }
}
escritor.end();

const miles = (n) => Math.round(n).toLocaleString("es-EC");
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
console.log(`modelo ${fila.version} (nivel 1, ${fila.calibracion ? "calibrado" : "sin calibrar"}) · personas reales: ${miles(elegidos.length)}`);
console.log("decisión del selector:", Object.entries(porMotivo).map(([k, n]) => `${k} ${miles(n)}`).join(", "));
if (fallaron) console.log(`no se pudieron estimar: ${fallaron} (el motivo está en el archivo)`);
if (estimados.length) {
  console.log(`estimados: ${miles(estimados.length)} · mediana del valor central $${miles(mediana(estimados.map((e) => e.valorCentral)))} · mediana del mínimo al 90% $${miles(mediana(estimados.map((e) => e.minimo90)))}`);
  console.log(`con mínimo al 90% de $${miles(MINIMO_PARA_ROTULAR_COMO_ESTIMADO)} o más: ${miles(estimados.filter((e) => e.minimo90 >= MINIMO_PARA_ROTULAR_COMO_ESTIMADO).length)}`);
  const sinDato = {};
  for (const e of estimados) for (const v of e.sinDato) sinDato[v] = (sinDato[v] ?? 0) + 1;
  console.log("variables sin dato:", Object.entries(sinDato).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => `${v} ${miles(n)}`).join(", ") || "ninguna");
  const conEquifax = estimados.filter((e) => e.equifax?.ingresoEstimado > 0);
  if (conEquifax.length) {
    const razones = conEquifax.map((e) => e.valorCentral / e.equifax.ingresoEstimado);
    console.log(`contra el ingreso que estima Equifax (${miles(conEquifax.length)} con los dos): razón mediana ${mediana(razones).toFixed(2).replace(".", ",")} · más del doble ${miles(razones.filter((r) => r > 2).length)} · menos de la mitad ${miles(razones.filter((r) => r < 0.5).length)}`);
  } else console.log("contra Equifax: no medido (nadie estimado tiene un ingreso estimado de Equifax)");
}
console.log(`detalle: ${salida}`);
