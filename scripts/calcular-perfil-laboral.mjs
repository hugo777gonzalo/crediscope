// Completa client_profiles.perfil_laboral en los perfiles guardados.
//
// La columna nació en la migración 085; las Edge Functions la escriben al
// guardar un perfil nuevo. Para los existentes, este guion la calcula con
// la MISMA función (clasificarPerfilLaboral de _shared/perfil-laboral.ts)
// desde el standard_profile guardado: no hace falta el crudo.
//
// Sólo escribe la columna perfil_laboral; el perfil no se toca. Correrlo de
// nuevo sólo actualiza los que cambiaron (por ejemplo, tras una versión
// nueva de la función).
//
// Uso:  node scripts/calcular-perfil-laboral.mjs [--seco]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const SECO = process.argv.includes("--seco");
const { clasificarPerfilLaboral } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/perfil-laboral.ts")).href);

// Los secretos se leen del archivo y no se imprimen.
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.functions");
const cabeceras = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };

// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function pedir(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, headers: { ...cabeceras, ...opciones.headers } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
  return texto ? JSON.parse(texto) : null;
}

// PostgREST corta en 1.000 filas: se pagina (ver CLAUDE.md).
const filas = [];
for (let desde = 0; ; desde += 500) {
  const pagina = await pedir(`${env.SUPABASE_URL}/rest/v1/client_profiles?select=id,perfil_laboral,standard_profile&order=id&limit=500&offset=${desde}`);
  filas.push(...pagina);
  if (pagina.length < 500) break;
}

const porClave = new Map();
let sinCambio = 0;
for (const f of filas) {
  const clave = clasificarPerfilLaboral(f.standard_profile)?.clave ?? null;
  if (clave === f.perfil_laboral) { sinCambio++; continue; }
  if (!porClave.has(clave)) porClave.set(clave, []);
  porClave.get(clave).push(f.id);
}
console.log(`perfiles leídos: ${filas.length}; sin cambio: ${sinCambio}`);
for (const [clave, ids] of porClave) console.log(`  ${clave ?? "(sin clasificación de ingresos)"}: ${ids.length}`);
if (SECO) process.exit(0);

// De a 100 ids por pedido: un `in` con cientos de uuid pasa el largo de URL
// que acepta el servidor (ver CLAUDE.md, traerTodas).
let escritas = 0;
for (const [clave, ids] of porClave) {
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const devueltas = await pedir(`${env.SUPABASE_URL}/rest/v1/client_profiles?id=in.(${lote.join(",")})&select=id`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ perfil_laboral: clave }),
    });
    // 0 filas no es un error para PostgREST: se cuenta.
    escritas += devueltas.length;
  }
}
const esperadas = [...porClave.values()].reduce((a, l) => a + l.length, 0);
console.log(`escritas: ${escritas} de ${esperadas}${escritas === esperadas ? "" : "  <-- NO COINCIDE"}`);
