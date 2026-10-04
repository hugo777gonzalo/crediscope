// Procesa las reconsultas de una carga del Laboratorio (fase 6,
// docs/laboratorio-de-riesgo.md sección 14.5).
//
// Para cada solicitud:
//  1. rearma t0 desde su crudo guardado con el código vigente: es la
//     información del día del análisis en la versión de hoy, y de ahí salen
//     las variables (nunca de t1, que ya trae la mora);
//  2. arma t1 con el mismo código;
//  3. detecta lo que pasó entre las dos (eventos-entre-consultas.ts) y
//     guarda los hechos del buró, para que el corte decida quién cayó con la
//     definición de default que elija.
// Es el mismo paso para la simulación y para la corrida real: sólo cambia
// dónde vive el crudo de t1.
//
// Mirando la carga entera marca las entidades que empezaron a reportar al
// buró: en t0 no tenían a nadie de la carga y en t1 a varios. Pasó de
// verdad entre el 2026-09-25 y el 2026-10-03 (una cooperativa apareció de
// golpe para muchas personas): sus operaciones no son créditos sacados en el
// año, y contarlas así inventaría sobreendeudamiento.
//
// En una carga simulada corre además el detector sobre la reconsulta REAL
// sin lo plantado, y lo guarda del lado de la verdad: son los cambios reales
// de esa semana, que el detector tiene que encontrar sin que cuenten como
// inventados al calificarlo.
//
// Reanudable: toma sólo las reconsultas sin procesar. Lo que no pasa por
// lint ni build se rompe en silencio: correr primero con --seco.
//
// Uso: node scripts/procesar-reconsultas.mjs --carga=<uuid> [--seco] [--limite=N]
//        [--t0=research/novadata-raw-2026-09-25] [--base-real=research/novadata-raw-2026-10-03]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const CARGA = arg("carga", null);
const SECO = process.argv.includes("--seco");
const LIMITE = Number(arg("limite", "0")) || Infinity;
const CARPETA_T0 = path.join(RAIZ, arg("t0", "research/novadata-raw-2026-09-25"));
const CARPETA_BASE = path.join(RAIZ, arg("base-real", "research/novadata-raw-2026-10-03"));
// Una entidad "empezó a reportar" si en t0 no tenía a nadie de la carga y en
// t1 tiene por lo menos a tantos.
const MINIMO_RECIEN_REPORTADA = 5;
if (!/^[0-9a-f-]{36}$/i.test(CARGA ?? "")) throw new Error("Falta --carga=<uuid>");

const importar = (archivo) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", archivo)).href);
const { buildStandardProfile, PROCESS_VERSION } = await importar("process.ts");
const { FUENTES_INGRESO_VERSION } = await importar("fuentes-ingreso.ts");
const { eventosEntreConsultas, entidadesDelBuro } = await importar("eventos-entre-consultas.ts");

const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const auth = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function rest(ruta, opciones = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, { ...opciones, headers: { ...auth, "content-type": "application/json", ...(opciones.headers ?? {}) } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${ruta.split("?")[0]}: HTTP ${r.status} ${texto.slice(0, 400)}`);
  return { datos: texto ? JSON.parse(texto) : null, cabeceras: r.headers };
}
// PostgREST corta en 1.000 filas sin avisar: se pagina hasta el conteo.
async function traerTodas(ruta) {
  const filas = [];
  let total = null;
  for (let desde = 0; total === null || desde < total; desde += 1000) {
    const { datos, cabeceras } = await rest(`${ruta}&offset=${desde}&limit=1000`, { headers: { Prefer: "count=exact" } });
    if (total === null) total = Number(cabeceras.get("content-range")?.split("/")[1] ?? datos.length);
    filas.push(...datos);
    if (datos.length === 0) break;
  }
  return filas;
}
async function bajarObjeto(bucket, ruta) {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${ruta}`, { headers: auth });
  if (!r.ok) throw new Error(`Storage ${bucket}/${ruta}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  try { return JSON.parse(zlib.gunzipSync(buf).toString("utf8")); } catch { return JSON.parse(buf.toString("utf8")); }
}
async function enParalelo(items, n, fn) {
  let siguiente = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (siguiente < items.length) { const i = siguiente++; await fn(items[i], i); } }));
}
// process.ts mide contra "hoy": se arma con el reloj en la fecha de la
// consulta. La función es sincrónica, así que el reloj cambiado no se cruza
// con las otras tareas en paralelo.
function armarEnFecha(instante, fn) {
  const DateReal = globalThis.Date;
  const fijo = new DateReal(instante).getTime();
  class DateFijo extends DateReal {
    constructor(...args) { super(...(args.length ? args : [fijo])); }
    static now() { return fijo; }
  }
  globalThis.Date = DateFijo;
  try { return fn(); } finally { globalThis.Date = DateReal; }
}
// El corte con que se armó el perfil guardado: si el cliente traía un mes
// posterior al corte conocido, se usó el suyo (ver recalcular-grupos.mjs).
const mesMenos = (m) => { const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 2; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const leerJson = (archivo) => JSON.parse(fs.readFileSync(archivo, "utf8"));

// ------------------------------------------------------------------ datos
const { datos: [carga] } = await rest(`lab_cargas?select=id,etiqueta,es_sintetica,estado,institucion_en_buro&id=eq.${CARGA}`);
if (!carga) throw new Error("No existe esa carga");
if (carga.estado === "anulada") throw new Error("La carga está anulada");
const enBuro = carga.institucion_en_buro ?? {};
const esDeLaInstitucion = enBuro.cooperativa_ruc
  ? (fila, canal) => canal === "cooperativas" && String(fila.codRuc ?? "") === enBuro.cooperativa_ruc
  : enBuro.banco_codigo
    ? (fila, canal) => canal === "bancos" && String(fila.codEntidad ?? "") === enBuro.banco_codigo
    : undefined;
if (!esDeLaInstitucion) console.log("AVISO: la carga no dice cómo aparece la institución en el buró; su crédito se contará como de otra institución.");

const pendientes = (await traerTodas(
  `lab_reconsultas?select=id,solicitud_id,origen,fecha,corte_iess,crudo_ruta,lab_solicitudes(cedula,client_profile_id,fecha_solicitud)&carga_id=eq.${CARGA}&procesada_en=is.null&order=id`,
)).slice(0, LIMITE);
console.log(`${carga.etiqueta}: ${pendientes.length} reconsultas por procesar`);
if (!pendientes.length) process.exit(0);

const perfilT0 = new Map();
const ids = [...new Set(pendientes.map((r) => r.lab_solicitudes.client_profile_id))];
for (let i = 0; i < ids.length; i += 100) {
  const { datos } = await rest(`client_profiles?select=id,crudo_ruta,corte:standard_profile->fuentesIngreso->>corteIessUsado,desactualizado:standard_profile->fuentesIngreso->>corteDesactualizado&id=in.(${ids.slice(i, i + 100).join(",")})`);
  for (const p of datos) perfilT0.set(p.id, p);
}

// --------------------------------------------------------- procesamiento
const resultados = [];
const fallas = [];
await enParalelo(pendientes, 6, async (rec) => {
  const { cedula, client_profile_id, fecha_solicitud } = rec.lab_solicitudes;
  try {
    const meta = perfilT0.get(client_profile_id);
    if (!meta?.crudo_ruta) throw new Error("el perfil de t0 no tiene crudo");
    const local = path.join(CARPETA_T0, `${cedula}.json`);
    const deLocal = fs.existsSync(local) ? leerJson(local) : null;
    const crudoT0 = deLocal?.perfilId === client_profile_id ? deLocal : await bajarObjeto("crudo-novadata", meta.crudo_ruta);
    const corteT0 = meta.corte ? (meta.desactualizado === "true" ? mesMenos(meta.corte) : meta.corte) : undefined;
    const t0 = { raw: crudoT0.raw, fecha: fecha_solicitud, perfil: armarEnFecha(crudoT0.capturadoEl, () => buildStandardProfile(crudoT0.raw, cedula, corteT0).profile) };

    const crudoT1 = await bajarObjeto(rec.origen === "simulada" ? "lab-archivos" : "crudo-novadata", rec.crudo_ruta);
    const t1 = { raw: crudoT1.raw, fecha: rec.fecha, perfil: armarEnFecha(crudoT1.capturadoEl, () => buildStandardProfile(crudoT1.raw, cedula, rec.corte_iess ?? undefined).profile) };
    const { eventos, buro } = eventosEntreConsultas(t0, t1, { cedula, esDeLaInstitucion });

    let eventosBase = null;
    const archivoBase = path.join(CARPETA_BASE, `${cedula}.json`);
    if (rec.origen === "simulada" && fs.existsSync(archivoBase)) {
      const base = leerJson(archivoBase);
      const perfilBase = armarEnFecha(base.capturadoEl, () => buildStandardProfile(base.raw, cedula, corteT0).profile);
      eventosBase = eventosEntreConsultas(t0, { raw: base.raw, fecha: base.capturadoEl.slice(0, 10), perfil: perfilBase }, { cedula, esDeLaInstitucion }).eventos;
    }
    resultados.push({
      rec, eventos, buro, eventosBase, perfilT0: t0.perfil, perfilT1: t1.perfil,
      entidadesT0: [...entidadesDelBuro(t0.raw, esDeLaInstitucion)], entidadesT1: [...entidadesDelBuro(t1.raw, esDeLaInstitucion)],
    });
  } catch (err) {
    fallas.push(`${rec.id}: ${err.message}`);
  }
});

// Las entidades que empezaron a reportar, mirando la carga entera.
const personasPorEntidad = { t0: new Map(), t1: new Map() };
for (const r of resultados) {
  for (const e of r.entidadesT0) personasPorEntidad.t0.set(e, (personasPorEntidad.t0.get(e) ?? 0) + 1);
  for (const e of r.entidadesT1) personasPorEntidad.t1.set(e, (personasPorEntidad.t1.get(e) ?? 0) + 1);
}
const recienReportadas = new Set([...personasPorEntidad.t1].filter(([e, n]) => n >= MINIMO_RECIEN_REPORTADA && !personasPorEntidad.t0.has(e)).map(([e]) => e));
const marcar = (canal, entidad) => recienReportadas.has(`${canal}|${entidad}`);
for (const r of resultados) {
  for (const e of r.eventos) if (e.tipo === "credito_otra_institucion" && marcar(e.detalle.canal, e.detalle.entidad)) e.detalle.entidad_recien_reportada = true;
  for (const c of r.buro.creditosNuevos) if (marcar(c.canal, c.entidad)) c.entidadRecienReportada = true;
  for (const e of r.eventosBase ?? []) if (e.tipo === "credito_otra_institucion" && marcar(e.detalle.canal, e.detalle.entidad)) e.detalle.entidad_recien_reportada = true;
}

const contar = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
console.log(JSON.stringify({
  procesadas: resultados.length,
  fallas: fallas.length,
  entidades_recien_reportadas: [...recienReportadas].map((e) => `${e} (${personasPorEntidad.t1.get(e)} personas)`),
  eventos: contar(resultados.flatMap((r) => r.eventos), (e) => e.tipo + (e.detalle.entidad_recien_reportada ? " (entidad recién reportada)" : "")),
  eventos_de_la_reconsulta_real: contar(resultados.flatMap((r) => r.eventosBase ?? []), (e) => e.tipo + (e.detalle.entidad_recien_reportada ? " (entidad recién reportada)" : "")),
}, null, 1));
if (fallas.length) console.log("fallas:", fallas.slice(0, 10));
if (SECO) process.exit(0);

// --------------------------------------------------------------- escritura
// Por tandas de 100: primero se borran los eventos que una corrida cortada
// haya dejado de esas reconsultas, se insertan los nuevos, y recién después
// se marca la reconsulta como procesada. Cortada en cualquier punto, la
// próxima corrida la vuelve a tomar sin duplicar nada.
// Una actualización sin fila devuelve 0 filas, no un error: se cuentan las
// que volvieron.
let escritas = 0, insertados = 0;
const fallasEscritura = [];
for (let i = 0; i < resultados.length; i += 100) {
  const tanda = resultados.slice(i, i + 100);
  try {
    await rest(`lab_eventos?reconsulta_id=in.(${tanda.map((r) => r.rec.id).join(",")})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    const filas = tanda.flatMap((r) => r.eventos.map((e) => ({ reconsulta_id: r.rec.id, carga_id: CARGA, tipo: e.tipo, clase: e.clase, fecha: e.fecha, detalle: e.detalle })));
    if (filas.length) await rest("lab_eventos", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(filas) });
    insertados += filas.length;
  } catch (err) {
    fallasEscritura.push(`tanda ${i}: ${err.message}`);
    continue;
  }
  await enParalelo(tanda, 6, async (r) => {
    try {
      const { datos } = await rest(`lab_reconsultas?id=eq.${r.rec.id}&select=id`, {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          perfil_t0: r.perfilT0, perfil_t1: r.perfilT1, structure_version: PROCESS_VERSION, fuentes_version: FUENTES_INGRESO_VERSION,
          resultado: {
            buro: r.buro,
            recibio_credito_de_otro: r.buro.creditosNuevos.some((c) => !c.entidadRecienReportada),
            entidades_t0: r.entidadesT0, entidades_t1: r.entidadesT1,
          },
          procesada_en: new Date().toISOString(),
        }),
      });
      escritas += datos.length;
      if (r.eventosBase) {
        await rest(`lab_simulacion_verdad?solicitud_id=eq.${r.rec.solicitud_id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ eventos_reconsulta_real: r.eventosBase }) });
      }
    } catch (err) {
      fallasEscritura.push(`${r.rec.id}: ${err.message}`);
    }
  });
}
const { cabeceras } = await rest(`lab_eventos?select=id&carga_id=eq.${CARGA}&limit=1`, { headers: { Prefer: "count=exact" } });
console.log(`reconsultas escritas: ${escritas} de ${resultados.length}${escritas === resultados.length ? "" : "  <-- NO COINCIDE"}; eventos insertados ${insertados}; en la carga ${cabeceras.get("content-range")?.split("/")[1]}`);
if (fallasEscritura.length) console.log("fallas al escribir:", fallasEscritura.slice(0, 10));
