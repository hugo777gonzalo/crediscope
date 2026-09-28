// Realinea las columnas de client_profiles que son copia de algo del perfil
// estandarizado: fuente_segmento, fuente_estado, fuente_version,
// fuente_corte, fuente_piso_ingreso, perfil_laboral e indicios_ingreso.
//
// Las calcula con columnasDelPerfil() (_shared/columnas-del-perfil.ts), la
// misma función que usan las Edge Functions al guardar un perfil, desde el
// standard_profile guardado: no hace falta el crudo. Reemplaza a
// calcular-perfil-laboral.mjs y calcular-indicios-ingreso.mjs, que llenaban
// una columna cada uno.
//
// Nació el 2026-09-28: recalcular-fuentes-ingreso.mjs reescribía el perfil
// sin tocar las columnas fuente_*, y después de fuentes-v8 y v9 el Panorama
// contaba a 65 personas en el segmento anterior mientras la ficha mostraba
// el nuevo. Hay que correrlo cuando cambie la regla de una columna sin que
// cambie el perfil: un indicio nuevo, la tabla de la fracción básica del
// impuesto a la renta, una versión del perfil laboral.
//
// Sólo escribe las columnas que difieren; el perfil no se toca.
//
// Uso:  node scripts/calcular-columnas-del-perfil.mjs [--seco]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const SECO = process.argv.includes("--seco");
const { columnasDelPerfil } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/columnas-del-perfil.ts")).href);

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

// fuente_piso_ingreso es numeric(14,2): se compara al centavo. Los indicios
// son un conjunto: el orden no cuenta.
function igual(columna, guardado, calculado) {
  if (columna === "fuente_piso_ingreso") {
    if (guardado == null || calculado == null) return guardado == null && calculado == null;
    return Math.abs(Number(guardado) - Number(calculado)) < 0.005;
  }
  if (columna === "indicios_ingreso") {
    if (!Array.isArray(guardado)) return false;
    return [...guardado].sort().join(",") === [...calculado].sort().join(",");
  }
  return (guardado ?? null) === (calculado ?? null);
}

const COLUMNAS = ["fuente_segmento", "fuente_estado", "fuente_version", "fuente_corte", "fuente_piso_ingreso", "perfil_laboral", "indicios_ingreso"];

// PostgREST corta en 1.000 filas: se pagina de a 500 con un orden total.
const escrituras = [];
const porColumna = Object.fromEntries(COLUMNAS.map((c) => [c, 0]));
const cambiosDeSegmento = new Map();
// El Panorama cuenta sólo el último perfil de cada cliente: se informa
// aparte cuántas correcciones caen ahí.
const ultimoPorCliente = new Map();
let leidos = 0;
for (let desde = 0; ; desde += 500) {
  const pagina = await pedir(
    `${env.SUPABASE_URL}/rest/v1/client_profiles?select=id,client_id,created_at,${COLUMNAS.join(",")},standard_profile&order=id&limit=500&offset=${desde}`,
  );
  for (const fila of pagina) {
    const ultimo = ultimoPorCliente.get(fila.client_id);
    if (!ultimo || fila.created_at > ultimo.created_at) ultimoPorCliente.set(fila.client_id, { id: fila.id, created_at: fila.created_at });
    const calculadas = columnasDelPerfil(fila.standard_profile ?? {});
    const distintas = {};
    for (const c of COLUMNAS) {
      if (igual(c, fila[c], calculadas[c])) continue;
      distintas[c] = calculadas[c];
      porColumna[c]++;
    }
    if (!Object.keys(distintas).length) continue;
    if ("fuente_segmento" in distintas) {
      const k = `${fila.fuente_segmento} -> ${distintas.fuente_segmento}`;
      cambiosDeSegmento.set(k, (cambiosDeSegmento.get(k) ?? 0) + 1);
    }
    escrituras.push({ id: fila.id, clienteId: fila.client_id, distintas });
  }
  leidos += pagina.length;
  if (pagina.length < 500) break;
}

const enElUltimo = (e) => ultimoPorCliente.get(e.clienteId)?.id === e.id;
console.log(`perfiles leídos: ${leidos}; a corregir: ${escrituras.length} (${escrituras.filter(enElUltimo).length} en el último perfil de su cliente)`);
for (const c of COLUMNAS) {
  if (!porColumna[c]) continue;
  const ultimos = escrituras.filter((e) => c in e.distintas && enElUltimo(e)).length;
  console.log(`  ${c}: ${porColumna[c]} (${ultimos} en el último perfil)`);
}
for (const [k, n] of [...cambiosDeSegmento].sort((a, b) => b[1] - a[1])) console.log(`    segmento ${k}: ${n}`);
if (SECO) process.exit(0);

// De a una fila: cada una corrige columnas distintas. 0 filas devueltas no
// es un error para PostgREST (RLS o id inexistente): se cuenta.
let escritas = 0, siguiente = 0;
const fallas = [];
async function trabajador() {
  while (siguiente < escrituras.length) {
    const e = escrituras[siguiente++];
    try {
      const devueltas = await pedir(`${env.SUPABASE_URL}/rest/v1/client_profiles?id=eq.${e.id}&select=id`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(e.distintas),
      });
      escritas += devueltas.length;
    } catch (err) {
      fallas.push(`${e.id}: ${err.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, trabajador));
console.log(`escritas: ${escritas} de ${escrituras.length}${escritas === escrituras.length ? "" : "  <-- NO COINCIDE"}`);
if (fallas.length) console.log("fallas:", fallas.slice(0, 10));
