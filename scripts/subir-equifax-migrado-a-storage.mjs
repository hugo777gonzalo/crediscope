// Lleva a Storage el crudo de las consultas a Equifax que Novacredit hizo y pagó (la base de originación
// en AWS), bajadas en JSON a research/ingresos-aws/crudo-equifax/ (148; docs/equifax.md). Medida
// TEMPORAL del 2026-11-05: la base del plan Free (500 MB) no aguanta ese crudo. Las consultas que pagamos
// nosotros no se tocan.
//
// QUÉ SUBE (depósito privado `crudo-equifax-migrado`, gzip; ver _shared/crudo-equifax-migrado.ts):
//   aws/<id_consulta_equifax>.json.gz     el response_json de cada consulta, tal cual (las 20.560 bajadas)
//   aws/respaldo/lote-NNNNNN.jsonl.gz     el resto de cada fila de AWS (todo menos response_json), de respaldo
//   aws/indice/por-cedula.json.gz         cédula -> consultas de AWS que están en el depósito (fase --indice)
// El nombre lleva el id de AWS y no una cédula: un JSON que todavía no tiene fila en la base ya tiene su lugar.
//
// FASES, de a una y en este orden (cada una se puede repetir: son idempotentes):
//   --seco         cuenta qué subiría y no escribe nada (ni en Storage ni en la base)
//   (sin bandera)  sube lo que falta, no pisa lo que ya está, y verifica al final
//   --verificar    sólo lee: compara el depósito contra los lotes locales (existencia y tamaño) y contra las
//                  consultas migradas de la base
//   --enlazar      pone crudo_ruta en cada fila migrada cuyo objeto está verificado. NO vacía el crudo de la fila
//   --vaciar --confirmo
//                  deja en null respuesta_cruda de las filas con crudo_ruta, DESPUÉS de bajar cada objeto y
//                  comprobar que es igual a lo que tiene la fila. Sin --confirmo no hace nada. Hacerlo recién
//                  con la lectura desde Storage desplegada
//   --indice       arma el índice por cédula con las consultas de los lotes cuyo crudo ya está en el depósito
//                  y lo sube (lo reemplaza si estaba). Con --seco sólo cuenta y mide. Lo lee el análisis
//                  (buro-de-la-institucion.ts) para encontrar la última consulta de una persona sin fila.
//                  Repetirlo después de subir lotes nuevos: lo que no está en el índice no se encuentra.
//   --max=N        sólo las primeras N consultas (muestra) en --enlazar y --vaciar
//   --carpeta=<ruta>  otra carpeta de lotes
//   --sin-commit   permite correr con cambios sin guardar en git (queda anotado)
//
// QUÉ SE IMPRIME: nunca una cédula ni un dato del crudo; cada consulta, por su id de AWS.
//
// AVISO: este archivo no pasa por lint ni build.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";
import { cargarEntorno, carpetaDeResearch } from "./_comun/entorno.mjs";
import { explicar } from "./_comun/casos.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const bandera = (n) => args.includes(`--${n}`);
const valor = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const SECO = bandera("seco");
const VERIFICAR = bandera("verificar");
const ENLAZAR = bandera("enlazar");
const VACIAR = bandera("vaciar");
const INDICE = bandera("indice");
const MAX = valor("max") ? Number(valor("max")) : Infinity;
const PARALELO = 8;

const morir = (...lineas) => { console.error(lineas.join("\n")); process.exit(1); };

cargarEntorno(RAIZ);
for (const clave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[clave]) morir(`Falta ${clave} en .env.functions.`);
// --indice se puede probar en seco; las demás fases van solas.
if ([VERIFICAR, ENLAZAR, VACIAR, INDICE].filter(Boolean).length > 1 || (SECO && (VERIFICAR || ENLAZAR || VACIAR))) {
  morir("Una fase por corrida: --seco, --verificar, --enlazar, --vaciar o --indice (ésta, también con --seco).");
}
if (VACIAR && !bandera("confirmo")) morir("--vaciar deja en null el crudo de las filas migradas: confirmarlo con --confirmo (después de verificar y de desplegar la lectura desde Storage).");

const {
  BUCKET_CRUDO_EQUIFAX_MIGRADO: BUCKET, rutaDelCrudoMigrado, rutaDelRespaldoDeLote, descomprimirTexto,
  entradaDelIndice, armarIndiceDelCrudoMigrado, RUTA_DEL_INDICE_POR_CEDULA,
} = await import(new URL("../supabase/functions/_shared/crudo-equifax-migrado.ts", import.meta.url).href);

const carpeta = valor("carpeta") ?? carpetaDeResearch(RAIZ, "ingresos-aws", "crudo-equifax");
const manifiesto = path.join(carpeta, "manifiesto.jsonl");
if (!fs.existsSync(manifiesto)) morir(`No hay manifiesto en ${carpeta}.`);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ---------- los lotes locales ----------
function* lotes() {
  const filas = fs.readFileSync(manifiesto, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const lote of filas) {
    const ruta = path.join(carpeta, lote.archivo);
    if (!fs.existsSync(ruta)) morir(`Falta el lote ${lote.lote} (${lote.archivo}): sin él no se puede subir todo.`);
    const lineas = zlib.gunzipSync(fs.readFileSync(ruta)).toString("utf8").split("\n").filter((l) => l.trim());
    yield { lote: lote.lote, filas: lineas.map((l) => JSON.parse(l)) };
  }
}

// Lo que tiene que haber en el depósito, calculado igual en todas las fases: ruta -> tamaño.
// Sólo se guarda el tamaño, no el cuerpo: los lotes pesan 1,7 GB sin comprimir y no caben todos en
// memoria. Subir vuelve a leer los lotes de a uno.
const comprimirCuerpo = (cuerpo) => zlib.gzipSync(JSON.stringify(cuerpo), { level: 9 });
function esperado() {
  const mapa = new Map();
  let sinCuerpo = 0;
  for (const { lote, filas } of lotes()) {
    const respaldo = [];
    for (const f of filas) {
      const { response_json: cuerpo, ...resto } = f;
      respaldo.push(JSON.stringify(resto));
      if (cuerpo == null || typeof cuerpo !== "object") { sinCuerpo++; continue; }
      mapa.set(rutaDelCrudoMigrado(f.id_consulta_equifax), { lote, tam: comprimirCuerpo(cuerpo).length, id: String(f.id_consulta_equifax) });
    }
    const gz = zlib.gzipSync(respaldo.join("\n") + "\n", { level: 9 });
    mapa.set(rutaDelRespaldoDeLote(lote), { lote, tam: gz.length, id: null });
  }
  return { mapa, sinCuerpo };
}

async function enParalelo(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

async function listarDeposito() {
  const existentes = new Map();
  for (const prefijo of ["aws", "aws/respaldo"]) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.storage.from(BUCKET).list(prefijo, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) morir(`No se pudo listar ${prefijo}: ${error.message}`);
      for (const o of data) if (o.id) existentes.set(`${prefijo}/${o.name}`, Number(o.metadata?.size ?? -1));
      if (data.length < 1000) break;
    }
  }
  return existentes;
}

async function migradasDeLaBase() {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from("consultas_equifax").select("id, parametros, crudo_ruta").not("parametros->migrada_de", "is", null).order("id").range(desde, desde + 999);
    if (error) morir(`No se pudo leer lo migrado: ${explicar(error)}`);
    for (const f of data) filas.push({ id: f.id, idAws: String(f.parametros.migrada_de.id_consulta_equifax), crudo_ruta: f.crudo_ruta });
    if (data.length < 1000) break;
  }
  return filas;
}

// ---------- índice por cédula ----------
// Antes de esperado(): no necesita comprimir cada cuerpo para medirlo. Nunca imprime una cédula.
if (INDICE) {
  const motivos = { sin_respuesta_util: 0, sin_documento: 0, documento_invalido: 0, sin_fecha: 0, sin_objeto_en_el_deposito: 0 };
  const existentes = await listarDeposito();
  const entradas = [];
  let leidas = 0;
  for (const { filas } of lotes()) {
    for (const f of filas) {
      leidas++;
      const r = entradaDelIndice(f);
      if (!r.ok) { motivos[r.motivo]++; continue; }
      // Sólo lo que se puede leer: una entrada sin su objeto haría fallar el análisis de esa persona.
      if (!existentes.has(rutaDelCrudoMigrado(r.entrada.idAws))) { motivos.sin_objeto_en_el_deposito++; continue; }
      entradas.push(r.entrada);
    }
  }
  const indice = armarIndiceDelCrudoMigrado(entradas, new Date().toISOString());
  const bytes = zlib.gzipSync(JSON.stringify(indice), { level: 9 });
  console.log(`filas leídas de los lotes        : ${leidas}`);
  for (const [motivo, n] of Object.entries(motivos)) console.log(`  fuera, ${motivo.replaceAll("_", " ").padEnd(28)}: ${n}`);
  console.log(`consultas en el índice           : ${indice.consultas}`);
  console.log(`personas en el índice            : ${Object.keys(indice.personas).length}`);
  console.log(`peso del índice (gzip)           : ${(bytes.length / 1024).toFixed(0)} KB`);
  if (SECO) {
    console.log("\nEN SECO: no se escribió nada. Para subirlo: repetir sin --seco.");
    process.exit(0);
  }
  const ejecucionIndice = await abrirEjecucion({ url: process.env.SUPABASE_URL, clave: process.env.SUPABASE_SERVICE_ROLE_KEY, guion: "subir-equifax-migrado-a-storage" });
  // upsert:true sólo acá: el índice se rehace entero con cada bajada; los crudos, en cambio, nunca se pisan.
  const { error } = await db.storage.from(BUCKET).upload(RUTA_DEL_INDICE_POR_CEDULA, bytes, { contentType: "application/gzip", upsert: true });
  if (error) morir(`No se pudo subir el índice: ${error.message}`);
  const { data: blob, error: errBajar } = await db.storage.from(BUCKET).download(RUTA_DEL_INDICE_POR_CEDULA);
  if (errBajar || !blob) morir(`El índice se subió pero no se pudo bajar para compararlo: ${errBajar?.message ?? "sin datos"}`);
  const vuelta = JSON.parse(await descomprimirTexto(new Uint8Array(await blob.arrayBuffer())));
  const igual = JSON.stringify(vuelta) === JSON.stringify(indice);
  ejecucionIndice.anotar({ fase: "indice", consultas: indice.consultas, personas: Object.keys(indice.personas).length, bytes: bytes.length, ...motivos, verificado: igual });
  console.log(igual ? "\nÍndice subido y verificado (bajado y comparado)." : "\nNO VERIFICADO: el índice bajado no es igual al subido.");
  process.exit(igual ? 0 : 1);
}

// Compara el depósito con lo esperado. Devuelve lo que falta y lo que no coincide.
function compararConElDeposito(mapa, existentes) {
  const faltan = [], distinto = [];
  for (const [ruta, e] of mapa) {
    if (!existentes.has(ruta)) { faltan.push(ruta); continue; }
    if (e.tam !== null && existentes.get(ruta) !== e.tam) distinto.push(ruta);
  }
  return { faltan, distinto };
}

const { mapa, sinCuerpo } = esperado();
const objetosDeConsulta = [...mapa.entries()].filter(([, e]) => e.id !== null);
console.log(`consultas con cuerpo en los lotes : ${objetosDeConsulta.length} (sin cuerpo: ${sinCuerpo})`);
console.log(`respaldos de lote                : ${mapa.size - objetosDeConsulta.length}`);

// ---------- seco ----------
if (SECO) {
  const total = [...mapa.values()].reduce((a, e) => a + e.tam, 0);
  console.log(`peso en Storage (gzip)           : ${(total / 1e6).toFixed(1)} MB`);
  console.log("\nEN SECO: no se escribió nada. Para subir: repetir sin --seco.");
  process.exit(0);
}

// ---------- verificar ----------
async function verificar() {
  const existentes = await listarDeposito();
  const { faltan, distinto } = compararConElDeposito(mapa, existentes);
  const migradas = await migradasDeLaBase();
  const sinObjeto = migradas.filter((m) => !existentes.has(rutaDelCrudoMigrado(m.idAws)));
  const objetoDistinto = migradas.filter((m) => distinto.includes(rutaDelCrudoMigrado(m.idAws)));
  console.log(`depósito                         : ${existentes.size} objetos`);
  console.log(`faltan en el depósito            : ${faltan.length}`);
  console.log(`con otro tamaño que el esperado  : ${distinto.length}`);
  console.log(`migradas en la base              : ${migradas.length}`);
  console.log(`  sin su objeto en el depósito   : ${sinObjeto.length}`);
  console.log(`  con objeto de otro tamaño      : ${objetoDistinto.length}`);
  console.log(`  con crudo_ruta puesta          : ${migradas.filter((m) => m.crudo_ruta).length}`);
  for (const r of [...faltan, ...distinto].slice(0, 10)) console.log(`  ! ${r}`);
  const ok = faltan.length === 0 && distinto.length === 0 && sinObjeto.length === 0;
  console.log(ok ? "\nVERIFICADO: cada consulta bajada y cada migrada tiene su crudo en Storage." : "\nNO VERIFICADO: hay diferencias (arriba).");
  return { ok, migradas, existentes };
}

if (VERIFICAR) {
  const { ok } = await verificar();
  process.exit(ok ? 0 : 1);
}

const ejecucion = await abrirEjecucion({ url: process.env.SUPABASE_URL, clave: process.env.SUPABASE_SERVICE_ROLE_KEY, guion: "subir-equifax-migrado-a-storage" });

// ---------- subir ----------
if (!ENLAZAR && !VACIAR) {
  const existentes = await listarDeposito();
  const faltan = [...mapa.entries()].filter(([ruta]) => !existentes.has(ruta));
  console.log(`ya estaban en el depósito        : ${mapa.size - faltan.length}`);
  console.log(`a subir                          : ${faltan.length}`);
  const aSubir = new Set(faltan.map(([ruta]) => ruta));
  let subidos = 0, fallidos = 0, yaEstaban = 0, hechos = 0;
  const subirUno = async (ruta, bytes) => {
    // upsert:false: una corrida repetida o paralela no pisa un objeto. Bytes y no un Blob (ver crudo-proveedor-info-1.ts).
    const { error } = await db.storage.from(BUCKET).upload(ruta, bytes, { contentType: "application/gzip", upsert: false });
    if (!error) subidos++;
    else if (/already exists|Duplicate/i.test(error.message ?? "") || String(error.statusCode) === "409") yaEstaban++;
    else { fallidos++; console.log(`  ERROR en ${ruta}: ${error.message}`); }
    if (++hechos % 1000 === 0) console.log(`  ${hechos}/${faltan.length} | subidos ${subidos} | fallidos ${fallidos}`);
  };
  for (const { lote, filas } of lotes()) {
    const tareas = [];
    const respaldo = [];
    for (const f of filas) {
      const { response_json: cuerpo, ...resto } = f;
      respaldo.push(JSON.stringify(resto));
      const ruta = rutaDelCrudoMigrado(f.id_consulta_equifax);
      if (cuerpo != null && typeof cuerpo === "object" && aSubir.has(ruta)) tareas.push([ruta, () => comprimirCuerpo(cuerpo)]);
    }
    const rutaRespaldo = rutaDelRespaldoDeLote(lote);
    if (aSubir.has(rutaRespaldo)) tareas.push([rutaRespaldo, () => zlib.gzipSync(respaldo.join("\n") + "\n", { level: 9 })]);
    await enParalelo(tareas, PARALELO, ([ruta, bytes]) => subirUno(ruta, bytes()));
  }
  ejecucion.sumarFilas(subidos);
  ejecucion.anotar({ fase: "subir", esperados: mapa.size, subidos, ya_estaban: yaEstaban, fallidos });
  console.log(`\nsubidos ${subidos}, ya estaban ${yaEstaban}, fallidos ${fallidos}. Verificando...`);
  const { ok } = await verificar();
  process.exit(fallidos > 0 || !ok ? 1 : 0);
}

// ---------- enlazar ----------
if (ENLAZAR) {
  const { ok, migradas, existentes } = await verificar();
  if (!ok) morir("\nNo se enlaza nada: primero tiene que verificar sin diferencias.");
  const pendientes = migradas.filter((m) => !m.crudo_ruta).slice(0, MAX);
  console.log(`\na enlazar                        : ${pendientes.length}`);
  let enlazadas = 0, fallidas = 0;
  await enParalelo(pendientes, PARALELO, async (m) => {
    const ruta = rutaDelCrudoMigrado(m.idAws);
    if (!existentes.has(ruta)) { fallidas++; return; }
    // .is("crudo_ruta", null) + .select(): una actualización bloqueada o sin efecto devuelve 0 filas, no error.
    const { data, error } = await db.from("consultas_equifax").update({ crudo_ruta: ruta }).eq("id", m.id).is("crudo_ruta", null).select("id");
    if (error || data?.length !== 1) { fallidas++; console.log(`  ERROR al enlazar aws ${m.idAws}: ${error ? explicar(error) : "0 filas"}`); } else enlazadas++;
  });
  ejecucion.sumarFilas(enlazadas);
  ejecucion.anotar({ fase: "enlazar", enlazadas, fallidas });
  console.log(`\nenlazadas ${enlazadas}, con error ${fallidas}. El crudo sigue también en la fila.`);
  process.exit(fallidas > 0 ? 1 : 0);
}

// ---------- vaciar ----------
const canonico = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
  : x));

const { migradas } = { migradas: await migradasDeLaBase() };
const candidatas = migradas.filter((m) => m.crudo_ruta).slice(0, MAX);
console.log(`migradas con crudo_ruta           : ${candidatas.length} (de ${migradas.length})`);
let vaciadas = 0, yaVacias = 0, distintas = 0, fallidas = 0;
await enParalelo(candidatas, 4, async (m) => {
  const { data: fila, error } = await db.from("consultas_equifax").select("respuesta_cruda, crudo_ruta").eq("id", m.id).single();
  if (error) { fallidas++; console.log(`  ERROR al leer aws ${m.idAws}: ${explicar(error)}`); return; }
  if (fila.respuesta_cruda == null) { yaVacias++; return; }
  const { data: blob, error: errBajar } = await db.storage.from(BUCKET).download(fila.crudo_ruta);
  if (errBajar || !blob) { fallidas++; console.log(`  ERROR al bajar aws ${m.idAws}: ${errBajar?.message ?? "sin datos"}`); return; }
  let enStorage;
  try { enStorage = JSON.parse(await descomprimirTexto(new Uint8Array(await blob.arrayBuffer()))); } catch { fallidas++; console.log(`  ERROR: el objeto de aws ${m.idAws} no se pudo leer`); return; }
  if (canonico(enStorage) !== canonico(fila.respuesta_cruda)) { distintas++; console.log(`  DISTINTO: aws ${m.idAws} no coincide con la fila; no se vacía`); return; }
  const { data, error: errVaciar } = await db.from("consultas_equifax").update({ respuesta_cruda: null }).eq("id", m.id).not("respuesta_cruda", "is", null).select("id");
  if (errVaciar || data?.length !== 1) { fallidas++; console.log(`  ERROR al vaciar aws ${m.idAws}: ${errVaciar ? explicar(errVaciar) : "0 filas"}`); } else vaciadas++;
  if ((vaciadas + yaVacias) % 500 === 0) console.log(`  vaciadas ${vaciadas}`);
});
ejecucion.sumarFilas(vaciadas);
ejecucion.anotar({ fase: "vaciar", vaciadas, ya_vacias: yaVacias, distintas, fallidas });
console.log(`\nvaciadas ${vaciadas}, ya vacías ${yaVacias}, distintas ${distintas}, con error ${fallidas}.`);
console.log("El espacio no baja hasta que Postgres lo reutilice o se haga un VACUUM FULL: medir pg_database_size después.");
process.exit(distintas > 0 || fallidas > 0 ? 1 : 0);
