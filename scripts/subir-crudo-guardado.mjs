// Sube a Storage el crudo de Novadata guardado en research/ (090).
//
// Hasta el 2026-10-03 el crudo se descartaba y sólo existía el respaldo
// local de la reconsulta de la cartera. Con esto, los perfiles que tienen
// respaldo quedan con su crudo en el mismo lugar que las consultas nuevas.
//
// Sólo sube un archivo si su perfilId existe en la base y todavía no tiene
// crudo_ruta: el crudo tiene que ser de ESE perfil, no de otra consulta de
// la misma persona. Sube el archivo tal cual (con su capturadoEl original).
//
// Uso:
//   node scripts/subir-crudo-guardado.mjs research/novadata-raw-2026-09-25 --seco
//   node scripts/subir-crudo-guardado.mjs research/novadata-raw-2026-09-25 [--limite=N]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const { BUCKET_CRUDO_NOVADATA, rutaDelCrudo } = await import(
  pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/crudo-novadata.ts")).href
);

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.functions");
const auth = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

const carpeta = process.argv[2];
if (!carpeta) throw new Error("Falta la carpeta del crudo (ej. research/novadata-raw-2026-09-25)");
const seco = process.argv.includes("--seco");
// Constancia de la corrida (ejecuciones_operativas, 117): sin ella no se toca la base.
await abrirEjecucion({ url: env.SUPABASE_URL, clave: env.SUPABASE_SERVICE_ROLE_KEY, guion: "subir-crudo-guardado", seco: seco });
const limite = Number(process.argv.find((a) => a.startsWith("--limite="))?.split("=")[1] ?? Infinity);

const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith(".json"));
const porPerfil = new Map();
for (const f of archivos) {
  const { perfilId } = JSON.parse(fs.readFileSync(path.join(carpeta, f), "utf8"));
  if (perfilId) porPerfil.set(perfilId, f);
}
console.log(`${archivos.length} archivos, ${porPerfil.size} con perfilId`);

// Qué perfiles existen y no tienen crudo. En tandas de 200: la lista entera
// en la URL se rompe pasadas ~350 uuid.
const pendientes = [];
const ids = [...porPerfil.keys()];
for (let i = 0; i < ids.length; i += 200) {
  const tanda = ids.slice(i, i + 200);
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/client_profiles?select=id,client_id,crudo_ruta&id=in.(${tanda.join(",")})`, { headers: auth });
  if (!r.ok) throw new Error(`Leer perfiles: ${r.status} ${await r.text()}`);
  for (const p of await r.json()) if (!p.crudo_ruta) pendientes.push(p);
}
const sinPerfil = ids.length - pendientes.length;
console.log(`${pendientes.length} perfiles sin crudo para subir; ${sinPerfil} ya lo tienen o el perfil no existe`);
if (seco) process.exit(0);

let subidos = 0, fallidos = 0;
const cola = pendientes.slice(0, limite);
async function trabajar() {
  while (cola.length) {
    const p = cola.shift();
    const ruta = rutaDelCrudo(p.client_id, p.id);
    try {
      const cuerpo = zlib.gzipSync(fs.readFileSync(path.join(carpeta, porPerfil.get(p.id))));
      const s = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET_CRUDO_NOVADATA}/${ruta}`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/gzip", "x-upsert": "false" },
        body: cuerpo,
      });
      if (!s.ok) throw new Error(`subida ${s.status} ${await s.text()}`);
      const u = await fetch(`${env.SUPABASE_URL}/rest/v1/client_profiles?id=eq.${p.id}`, {
        method: "PATCH",
        headers: { ...auth, "content-type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ crudo_ruta: ruta }),
      });
      if (!u.ok) throw new Error(`ruta ${u.status} ${await u.text()}`);
      if ((await u.json()).length !== 1) throw new Error("la ruta no se guardó en el perfil");
      subidos++;
    } catch (err) {
      fallidos++;
      console.error(p.id, err.message);
    }
    if ((subidos + fallidos) % 200 === 0) console.log(`${subidos + fallidos}...`);
  }
}
await Promise.all(Array.from({ length: 8 }, trabajar));
console.log(`Subidos ${subidos}, fallidos ${fallidos}`);
if (fallidos) process.exit(1);
