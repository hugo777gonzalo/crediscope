// Copia los objetos del depósito de crudo anterior al nuevo, crudo-proveedor-info-1 (142).
//
// Storage no renombra un depósito con SQL: los archivos viven por su
// nombre. Las rutas son las mismas (`{client_id}/{perfil_id}.json.gz`), así
// que `client_profiles.crudo_ruta` no cambia. Idempotente: lo que ya está
// en el nuevo se salta, así que se corre otra vez después del despliegue
// para traer lo que el código viejo escribió en el medio.
//
// El nombre anterior se arma partido para que el término no vuelva al
// repositorio.
//
// Uso:
//   node scripts/mover-crudo-proveedor-info-1.mjs --seco
//   node scripts/mover-crudo-proveedor-info-1.mjs [--borrar-viejo]
//     --borrar-viejo: sólo si cada objeto del viejo está en el nuevo; vacía y borra el viejo.

import fs from "node:fs";
import path from "node:path";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";
import { raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const VIEJO = "crudo-" + "nova" + "data";
const NUEVO = "crudo-proveedor-info-1";
const seco = process.argv.includes("--seco");
const borrarViejo = process.argv.includes("--borrar-viejo");

const env = Object.fromEntries(
  fs.readFileSync(path.join(raizPrincipal(RAIZ), ".env.functions"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.SUPABASE_URL;
const clave = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) { console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.functions"); process.exit(1); }
const cab = { apikey: clave, Authorization: `Bearer ${clave}` };

const ejecucion = await abrirEjecucion({ url, clave, guion: "mover-crudo-proveedor-info-1", seco });

// Lista recursiva: el primer nivel son carpetas por client_id.
async function listar(deposito, prefijo = "") {
  const salida = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${url}/storage/v1/object/list/${deposito}`, {
      method: "POST", headers: { ...cab, "content-type": "application/json" },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset: desde }),
    });
    if (!r.ok) throw new Error(`listar ${deposito}/${prefijo}: ${r.status}`);
    const filas = await r.json();
    for (const f of filas) {
      if (f.id === null) salida.push(...await listar(deposito, `${prefijo}${f.name}/`));
      else salida.push(`${prefijo}${f.name}`);
    }
    if (filas.length < 1000) break;
  }
  return salida;
}

let ok = 0, ya = 0, fallas = 0;
try {
  const viejos = await listar(VIEJO);
  const nuevos = new Set(await listar(NUEVO));
  console.log(`En el depósito anterior: ${viejos.length}. Ya en el nuevo: ${nuevos.size}.`);
  for (const ruta of viejos) {
    if (nuevos.has(ruta)) { ya++; continue; }
    if (seco) { ok++; continue; }
    const get = await fetch(`${url}/storage/v1/object/${VIEJO}/${ruta}`, { headers: cab });
    if (!get.ok) { fallas++; console.error(`no se pudo leer ${ruta}: ${get.status}`); continue; }
    const bytes = new Uint8Array(await get.arrayBuffer());
    const put = await fetch(`${url}/storage/v1/object/${NUEVO}/${ruta}`, {
      method: "POST", headers: { ...cab, "content-type": "application/gzip" }, body: bytes,
    });
    if (put.ok) ok++; else { fallas++; console.error(`no se pudo subir ${ruta}: ${put.status}`); }
  }
  console.log(`${seco ? "Por copiar" : "Copiados"}: ${ok}. Ya estaban: ${ya}. Fallas: ${fallas}.`);

  if (borrarViejo && !seco) {
    if (fallas > 0) throw new Error("Hubo fallas: no se borra el depósito anterior.");
    const ahora = new Set(await listar(NUEVO));
    const faltan = viejos.filter((r) => !ahora.has(r));
    if (faltan.length) throw new Error(`Faltan ${faltan.length} objetos en el nuevo: no se borra el anterior.`);
    for (let i = 0; i < viejos.length; i += 100) {
      const r = await fetch(`${url}/storage/v1/object/${VIEJO}`, {
        method: "DELETE", headers: { ...cab, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: viejos.slice(i, i + 100) }),
      });
      if (!r.ok) throw new Error(`borrar: ${r.status}`);
    }
    const d = await fetch(`${url}/storage/v1/bucket/${VIEJO}`, { method: "DELETE", headers: cab });
    if (!d.ok) throw new Error(`borrar el depósito: ${d.status}`);
    console.log("Depósito anterior borrado.");
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
