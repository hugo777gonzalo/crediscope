// Completa client_profiles.indicios_ingreso en los perfiles guardados.
//
// La columna nació en la migración 089 (2026-09-28); las Edge Functions la
// escriben al guardar un perfil nuevo. Para los existentes, este guion la
// calcula con la MISMA función (indiciosDeIngresoMayor de
// _shared/fuentes-ingreso.ts) desde el standard_profile guardado: no hace
// falta el crudo. Es el mismo camino que calcular-perfil-laboral.mjs.
//
// Sólo escribe la columna; el perfil no se toca. Correrlo de nuevo sólo
// actualiza los que cambiaron (por ejemplo, tras un indicio nuevo, o cuando
// cambie la tabla de la fracción básica del impuesto a la renta).
//
// Uso:  node scripts/calcular-indicios-ingreso.mjs [--seco]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const SECO = process.argv.includes("--seco");
const { indiciosDeIngresoMayor } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/fuentes-ingreso.ts")).href);

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

// PostgREST corta en 1.000 filas: se pagina (ver CLAUDE.md). Sólo se trae
// fuentesIngreso, que es lo único que la función lee.
const filas = [];
for (let desde = 0; ; desde += 500) {
  const pagina = await pedir(
    `${env.SUPABASE_URL}/rest/v1/client_profiles?select=id,indicios_ingreso,fi:standard_profile->fuentesIngreso&order=id&limit=500&offset=${desde}`,
  );
  filas.push(...pagina);
  if (pagina.length < 500) break;
}

// Se agrupan por el arreglo resultante para escribir cada grupo de una vez.
const porValor = new Map();
let sinCambio = 0;
for (const f of filas) {
  const claves = indiciosDeIngresoMayor(f.fi).map((i) => i.clave).sort();
  const actual = Array.isArray(f.indicios_ingreso) ? [...f.indicios_ingreso].sort() : null;
  if (actual && actual.join(",") === claves.join(",")) { sinCambio++; continue; }
  const k = claves.join(",");
  if (!porValor.has(k)) porValor.set(k, { claves, ids: [] });
  porValor.get(k).ids.push(f.id);
}
console.log(`perfiles leídos: ${filas.length}; sin cambio: ${sinCambio}`);
for (const [k, g] of porValor) console.log(`  ${k || "(sin indicios)"}: ${g.ids.length}`);
if (SECO) process.exit(0);

// De a 100 ids por pedido: un `in` con cientos de uuid pasa el largo de URL
// que acepta el servidor (ver CLAUDE.md, traerTodas).
let escritas = 0;
for (const { claves, ids } of porValor.values()) {
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const devueltas = await pedir(`${env.SUPABASE_URL}/rest/v1/client_profiles?id=in.(${lote.join(",")})&select=id`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ indicios_ingreso: claves }),
    });
    // 0 filas no es un error para PostgREST: se cuenta.
    escritas += devueltas.length;
  }
}
const esperadas = [...porValor.values()].reduce((a, g) => a + g.ids.length, 0);
console.log(`escritas: ${escritas} de ${esperadas}${escritas === esperadas ? "" : "  <-- NO COINCIDE"}`);
