// La comparación en seco de la capa de hechos (docs/capa-de-hechos.md, sección 5).
//
// Paso 0: sólo `--medir`. Por persona, los bytes en JSON y en gzip de hechos,
// entidades, diferencias y señales y el tiempo de derivar, con media, mediana,
// p90, p99 y máximo, contra el presupuesto del diseño (2.3): p99 del documento
// completo por debajo de 16 KB en gzip y menos de 50 ms por persona. La paridad
// contra el perfil (5.1, puntos 1 a 6) llega con el primer grupo (tarea E4).
//
// SOLO LEE el respaldo local del crudo. No llama a la base, a Proveedor_Info_1,
// a Equifax ni al modelo, y no escribe nada: por consola van conteos y medidas,
// nunca una cédula. El depósito (Storage) no se lee todavía: hace falta la lista
// del último perfil de cada persona, que sale de la base.
//
// Con los grupos vacíos la medida es la base: el documento vacío con su
// contexto. El presupuesto se mide de verdad cuando haya un grupo que emita.
//
// Uso:
//   node scripts/comparar-hechos.mjs --medir [--carpeta=research/proveedor-info-1-raw-2026-10-03] [--limite=N]
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo
// con --limite=5 antes de confiar en los números.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);

if (!args.medir) {
  console.error("Por ahora sólo existe --medir (la paridad llega con el primer grupo).");
  process.exit(1);
}

const CARPETA = path.resolve(raizPrincipal(RAIZ), typeof args.carpeta === "string" ? args.carpeta : "research/proveedor-info-1-raw-2026-10-03");
if (!fs.existsSync(CARPETA)) {
  console.error("No existe la carpeta del respaldo del crudo.");
  process.exit(1);
}
const LIMITE = args.limite ? Number(args.limite) : Infinity;

const { derivarHechos, GRUPOS } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/hechos/indice.ts")).href);

const PRESUPUESTO = { gzipP99: 16 * 1024, msP99: 50 };
const kb = (n) => (n / 1024).toFixed(1).replace(".", ",");
const gzip = (s) => zlib.gzipSync(Buffer.from(s, "utf8")).length;

function estadistica(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const en = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { media: v.reduce((a, b) => a + b, 0) / v.length, mediana: en(0.5), p90: en(0.9), p99: en(0.99), max: v[v.length - 1] };
}

const archivos = fs.readdirSync(CARPETA).filter((a) => a.endsWith(".json")).slice(0, LIMITE);
const partes = ["hechos", "entidades", "diferencias", "senales"];
const medidas = { documentoJson: [], documentoGzip: [], ms: [], conteos: [], ...Object.fromEntries(partes.flatMap((p) => [[`${p}Json`, []], [`${p}Gzip`, []]])) };
let sinCrudo = 0;

for (const a of archivos) {
  const crudo = JSON.parse(fs.readFileSync(path.join(CARPETA, a), "utf8"));
  if (!crudo.raw || !crudo.capturadoEl) { sinCrudo++; continue; }
  // El reloj es la fecha de captura del crudo, como en producción. El corte del
  // IESS no importa con los grupos vacíos; se toma el mes de la captura.
  const contexto = {
    cedula: crudo.cedula,
    consulta: crudo.perfilId ?? "sin-perfil",
    fechaDeLaConsulta: crudo.capturadoEl,
    corteIess: String(crudo.capturadoEl).slice(0, 7),
    persona: { nombre: null, fechaDeNacimiento: null },
  };
  const t0 = performance.now();
  const doc = derivarHechos(crudo.raw, contexto);
  const json = JSON.stringify(doc);
  medidas.ms.push(performance.now() - t0);
  medidas.documentoJson.push(Buffer.byteLength(json));
  medidas.documentoGzip.push(gzip(json));
  for (const p of partes) {
    const s = JSON.stringify(doc[p]);
    medidas[`${p}Json`].push(Buffer.byteLength(s));
    medidas[`${p}Gzip`].push(gzip(s));
  }
  medidas.conteos.push(doc.hechos.length);
}

const n = medidas.ms.length;
if (!n) {
  console.error("Ningún crudo medible.");
  process.exit(1);
}
const gruposConHechos = Object.entries(GRUPOS).filter(([, g]) => g.CATALOGO.length > 0).map(([k]) => k);
console.log(`Personas medidas: ${n} (sin crudo: ${sinCrudo}). Grupos con códigos: ${gruposConHechos.length ? gruposConHechos.join(", ") : "ninguno (la medida es la base)"}.`);

const tabla = (titulo, v, formato) => {
  const e = estadistica(v);
  console.log(`${titulo.padEnd(34)} media ${formato(e.media)}  mediana ${formato(e.mediana)}  p90 ${formato(e.p90)}  p99 ${formato(e.p99)}  máx ${formato(e.max)}`);
  return e;
};
const bytes = (x) => `${kb(x)} KB`.padStart(9);
const mili = (x) => `${x.toFixed(3).replace(".", ",")} ms`.padStart(10);

tabla("Documento completo, JSON", medidas.documentoJson, bytes);
const gz = tabla("Documento completo, gzip", medidas.documentoGzip, bytes);
for (const p of partes) {
  tabla(`${p}, JSON`, medidas[`${p}Json`], bytes);
  tabla(`${p}, gzip`, medidas[`${p}Gzip`], bytes);
}
const t = tabla("Derivar", medidas.ms, mili);
tabla("Hechos por persona", medidas.conteos, (x) => String(Math.round(x)).padStart(9));

const okTam = gz.p99 < PRESUPUESTO.gzipP99;
const okTiempo = t.p99 < PRESUPUESTO.msP99;
console.log(`Presupuesto (2.3): p99 gzip ${kb(gz.p99)} KB contra ${kb(PRESUPUESTO.gzipP99)} KB: ${okTam ? "dentro" : "FUERA"}; p99 derivar ${t.p99.toFixed(3).replace(".", ",")} ms contra ${PRESUPUESTO.msP99} ms: ${okTiempo ? "dentro" : "FUERA"}.`);
if (!gruposConHechos.length) console.log("Aviso: sin ningún grupo emitiendo, esto mide el esqueleto y no el costo real; vuelve a correrse con el grupo 1.");
process.exit(okTam && okTiempo ? 0 : 1);
