// Revisión de los datos de la cartera: corre los detectores de
// scripts/revision-de-datos/detectores.mjs y compara con la corrida anterior.
// Es el guion de la habilidad `revision-de-datos` (.claude/skills/).
//
// SOLO LEE: una sola consulta `--read-only` con todos los detectores juntos
// (union all), sin llamar al modelo, a Proveedor_Info_1 ni a Equifax. No cuesta.
//
// Escribe en research/revision-de-datos/ (fuera de git, lleva montos y fechas
// de personas):
//   AAAA-MM-DD-HHMMSS.json   cada caso de cada detector, con su detalle
// y por consola imprime conteos y referencias c-xxxxxxxx, nunca una cédula.
//
// Sale con 1 si un detector de tipo "regresion" encuentra algún caso: un error
// que ya se corrigió volvió a aparecer.
//
// Uso:
//   node scripts/revisar-datos.mjs                 todos
//   node scripts/revisar-datos.mjs --solo=id,id    algunos
//   node scripts/revisar-datos.mjs --capa=cruce    los de una capa
//   node scripts/revisar-datos.mjs --listar        el catálogo, sin consultar
//   node scripts/revisar-datos.mjs --sql           imprime la consulta, sin correrla
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo
// con --solo=<un id> y abrir el JSON antes de confiar en los conteos.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comandoDeConsulta } from "./_comun/consulta-sql.mjs";
import { carpetaDeResearch, raizPrincipal } from "./_comun/entorno.mjs";
import { BASE, CAPAS, CONTROLES_EXISTENTES, DETECTORES } from "./revision-de-datos/detectores.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  })
);

// La versión vigente de la estructura sale del código, no se copia acá: si
// se copiara, el detector de perfiles atrasados mediría contra una versión vieja.
function versionDeEstructura() {
  const fuente = fs.readFileSync(path.join(RAIZ, "supabase/functions/_shared/process.ts"), "utf8");
  const m = fuente.match(/^export const PROCESS_VERSION = "([^"]+)"/m);
  if (!m) throw new Error("No encontré PROCESS_VERSION en process.ts: ¿cambió la línea?");
  return m[1];
}

const solo = typeof args.solo === "string" ? new Set(args.solo.split(",")) : null;
const elegidos = DETECTORES.filter((d) => (!solo || solo.has(d.id)) && (!args.capa || d.capa === args.capa));
if (solo) for (const id of solo) if (!DETECTORES.some((d) => d.id === id)) console.error(`No existe el detector «${id}».`);
if (!elegidos.length) {
  console.error("Ningún detector elegido.");
  process.exit(1);
}

if (args.listar) {
  for (const [capa, nombre] of Object.entries(CAPAS)) {
    const deLaCapa = DETECTORES.filter((d) => d.capa === capa);
    console.log(`\n${nombre}`);
    for (const d of deLaCapa) console.log(`  ${d.id.padEnd(40)} ${d.tipo.padEnd(10)} ${d.titulo}`);
    if (!deLaCapa.length) console.log("  (sin detectores todavía)");
  }
  console.log("\nControles que ya existen y esta revisión no repite:");
  for (const c of CONTROLES_EXISTENTES) console.log(`  ${c.guion}: ${c.mide}`);
  process.exit(0);
}

// Una sola consulta: cada detector aporta una fila con su población y una
// fila por caso. Quince consultas sueltas tardaban quince veces más.
const version = versionDeEstructura();
const partes = elegidos.flatMap((d) => {
  const casos = d.casos.replaceAll("{{PROCESS_VERSION}}", version);
  const poblacion = d.poblacion.replaceAll("{{PROCESS_VERSION}}", version);
  return [
    `select '${d.id}'::text as detector, null::text as cliente, jsonb_build_object('n', (${poblacion})) as detalle`,
    `select '${d.id}'::text, x.client_id::text, x.detalle from (${casos}) x`,
  ];
});
const sql = `with ${BASE}\n${partes.join("\nunion all\n")};\n`;

if (args.sql) {
  console.log(sql);
  process.exit(0);
}

const temporal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "revisar-datos-")), "consulta.sql");
fs.writeFileSync(temporal, sql);
let filas;
try {
  const salida = execSync(comandoDeConsulta(temporal, { workdir: raizPrincipal(RAIZ) }), {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  filas = JSON.parse(salida.slice(salida.indexOf("{"))).rows;
} catch (e) {
  // El error de la CLI trae el SQL que falló, no datos de personas.
  console.error("La consulta falló:", String(e.stderr || e.message).slice(0, 2000));
  process.exit(1);
} finally {
  fs.rmSync(path.dirname(temporal), { recursive: true, force: true });
}

const resultado = {};
for (const d of elegidos) resultado[d.id] = { capa: d.capa, tipo: d.tipo, titulo: d.titulo, poblacion: 0, casos: [] };
for (const f of filas) {
  const r = resultado[f.detector];
  if (f.cliente === null) r.poblacion = Number(f.detalle?.n ?? 0);
  else r.casos.push({ cliente: f.cliente, detalle: f.detalle });
}

// La corrida anterior de CADA detector, para decir qué es nuevo y qué se
// resolvió: una corrida con --capa o --solo no tiene a los demás, y comparar
// contra ella los daría a todos por nuevos.
const carpeta = carpetaDeResearch(RAIZ, "revision-de-datos");
const anteriores = fs.readdirSync(carpeta).filter((a) => /^\d{4}-\d{2}-\d{2}-\d{4}(\d{2})?\.json$/.test(a)).sort().reverse();
const previoDe = {};
for (const archivo of anteriores) {
  if (elegidos.every((d) => previoDe[d.id])) break;
  const { resultado: r } = JSON.parse(fs.readFileSync(path.join(carpeta, archivo), "utf8"));
  for (const d of elegidos) if (!previoDe[d.id] && r?.[d.id]) previoDe[d.id] = { ...r[d.id], archivo };
}

// Hora de Ecuador (UTC-5, sin horario de verano) en el nombre del archivo.
const ahora = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
// Con segundos: dos corridas en el mismo minuto se pisaban.
const nombre = `${ahora.slice(0, 10)}-${ahora.slice(11, 13)}${ahora.slice(14, 16)}${ahora.slice(17, 19)}.json`;
fs.writeFileSync(
  path.join(carpeta, nombre),
  JSON.stringify({ corrida: new Date().toISOString(), estructura: version, resultado }, null, 1)
);

const codigo = (id) => `c-${id.slice(0, 8)}`;
const miles = (n) => n.toLocaleString("es-EC");
let regresiones = 0;
console.log(`Estructura vigente: ${version}. Corridas anteriores: ${miles(anteriores.length)}.`);
for (const [capa, nombreCapa] of Object.entries(CAPAS)) {
  const deLaCapa = elegidos.filter((d) => d.capa === capa);
  if (!deLaCapa.length) continue;
  console.log(`\n${nombreCapa}`);
  for (const d of deLaCapa) {
    const r = resultado[d.id];
    const n = r.casos.length;
    let estado;
    if (r.poblacion === 0) estado = "no medido (población vacía)";
    else estado = `${miles(n)} de ${miles(r.poblacion)}`;
    let cambio = "";
    const previo = previoDe[d.id];
    if (previo) {
      const antes = new Set(previo.casos.map((c) => c.cliente));
      const ahoraSet = new Set(r.casos.map((c) => c.cliente));
      const nuevos = [...ahoraSet].filter((c) => !antes.has(c)).length;
      const resueltos = [...antes].filter((c) => !ahoraSet.has(c)).length;
      if (nuevos || resueltos) cambio = ` (+${miles(nuevos)} nuevos, −${miles(resueltos)} resueltos)`;
    }
    const marca = d.tipo === "regresion" && n > 0 ? "VOLVIÓ " : "";
    if (marca) regresiones++;
    const ejemplos = r.casos.slice(0, 3).map((c) => codigo(c.cliente)).join(", ");
    console.log(`  ${marca}${d.id} [${d.tipo}]: ${estado}${cambio}${ejemplos ? `. Ej.: ${ejemplos}` : ""}`);
    // Un hallazgo sobre análisis se lee por marco: casi siempre son de un
    // marco anterior a la corrección (85 de 85 el 2026-11-05).
    if (n && r.casos[0].detalle?.marco) {
      const porMarco = {};
      for (const c of r.casos) porMarco[c.detalle.marco] = (porMarco[c.detalle.marco] ?? 0) + 1;
      const orden = Object.entries(porMarco).sort((a, b) => b[1] - a[1]);
      console.log(`      por marco: ${orden.map(([m, k]) => `${m} ${miles(k)}`).join(", ")}`);
    }
    if (n && d.conocido) console.log(`      conocido: ${d.conocido}`);
  }
}
console.log(`\nDetalle: ${path.join(carpeta, nombre)}`);
if (regresiones) {
  console.log(`${regresiones} ${regresiones === 1 ? "regresión volvió" : "regresiones volvieron"}: un error corregido apareció otra vez.`);
  process.exit(1);
}
