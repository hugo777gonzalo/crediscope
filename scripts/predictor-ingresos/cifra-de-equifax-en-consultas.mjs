// Fase 4 del predictor de ingresos (destilación, D2): ¿las consultas de Equifax guardadas en `consultas_equifax` traen la cifra del
// predictor de Equifax (`interconnectResponse.ResultadoSegmentacion.IncomePredictor`)? Si las que paga CrediScope la traen, una alerta
// que compare nuestra estimación con la de Equifax usa la cifra misma y no necesita un alumno que la imite.
//
// Sólo lectura: lee `consultas_equifax` con el crudo por `leerCrudoDeLaConsulta()` (de la fila o del depósito de las migradas) y
// `equifax_resumen.ingreso_estimado_usd`, que `equifax-tablas.ts` deriva de ese mismo campo. No consulta a Equifax ni escribe nada.
// Imprime conteos por origen y por mes, nunca un monto, una identificación ni un id.
//
//   node scripts/predictor-ingresos/cifra-de-equifax-en-consultas.mjs [--migradas=200]
//
// `--migradas=N` lee el crudo de N migradas de AWS al azar (las demás quedan sin leer: bajarlas todas son 3.542 descargas, y la
// extracción de AWS ya dice que todas traen la cifra). Las que pagó CrediScope se leen todas.
//
// AVISO: este archivo no pasa por lint ni build. El control `guiones` no revisa esta carpeta: `node --check` a mano.

import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { cargarEntorno } from "../_comun/entorno.mjs";
import { explicar } from "../_comun/casos.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
cargarEntorno(RAIZ);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { leerCrudoDeLaConsulta } = await import(new URL("../../supabase/functions/_shared/crudo-equifax-migrado.ts", import.meta.url).href);
const fallar = (e) => { console.error(explicar(e)); process.exit(1); };
const MIGRADAS = Number((process.argv.find((a) => a.startsWith("--migradas=")) ?? "--migradas=200").split("=")[1]);

// Lo liviano de todas las filas, de a 1.000 (PostgREST corta ahí sin avisar).
const filas = [];
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await db.from("consultas_equifax")
    .select("id, created_at, ambiente, origen, http_equifax, crudo_ruta, migrada:parametros->>migrada_de")
    .order("id", { ascending: true }).range(desde, desde + 999);
  if (error) fallar(error);
  filas.push(...data);
  if (data.length < 1000) break;
}

const mes = (f) => String(f.created_at).slice(0, 7);
const tipo = (f) => (f.migrada ? "migrada de AWS" : `pagada por CrediScope (${f.origen}, ${f.ambiente})`);

// La cifra: presente y numérica mayor que cero, presente pero vacía o cero, o el bloque de la segmentación ausente.
function cifra(crudo) {
  const ir = crudo && typeof crudo === "object" ? crudo.interconnectResponse : null;
  const seg = ir && typeof ir === "object" ? ir.ResultadoSegmentacion : null;
  if (!seg || typeof seg !== "object") return "sin ResultadoSegmentacion";
  if (!("IncomePredictor" in seg)) return "con ResultadoSegmentacion, sin IncomePredictor";
  const v = Number(seg.IncomePredictor);
  return Number.isFinite(v) && v > 0 ? "con IncomePredictor mayor que cero" : "IncomePredictor vacío o cero";
}

const conteo = new Map();
const sumar = (clave) => conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
let fallidas = 0;

// Las pagadas por CrediScope, todas; las migradas, una muestra al azar con semilla fija (mismo resultado en cada corrida).
const propias = filas.filter((f) => !f.migrada);
const migradas = filas.filter((f) => f.migrada);
let semilla = 7;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
const muestra = [...migradas].sort(() => azar() - 0.5).slice(0, MIGRADAS);

for (const f of [...propias, ...muestra]) {
  const { data: fila, error } = await db.from("consultas_equifax").select("respuesta_cruda, crudo_ruta").eq("id", f.id).single();
  if (error) fallar(error);
  let crudo;
  try { crudo = await leerCrudoDeLaConsulta(db, fila); } catch { fallidas++; continue; }
  sumar(`${tipo(f)} | ${f.migrada ? "(muestra)" : mes(f)} | http ${f.http_equifax} | ${cifra(crudo)}`);
}

// Lo que ya derivó equifax-tablas.ts, para todas las filas con tablas.
const resumen = new Map();
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await db.from("equifax_resumen").select("consulta_equifax_id, ingreso_estimado_usd").order("consulta_equifax_id").range(desde, desde + 999);
  if (error) fallar(error);
  for (const r of data) resumen.set(r.consulta_equifax_id, r.ingreso_estimado_usd);
  if (data.length < 1000) break;
}
const porTipo = new Map();
for (const f of filas) {
  const k = tipo(f);
  const v = resumen.has(f.id) ? (Number(resumen.get(f.id)) > 0 ? "con ingreso_estimado_usd" : "con tablas, sin ingreso_estimado_usd") : "sin tablas";
  porTipo.set(`${k} | ${v}`, (porTipo.get(`${k} | ${v}`) ?? 0) + 1);
}

console.log(`consultas_equifax: ${filas.length} filas; pagadas por CrediScope ${propias.length}, migradas de AWS ${migradas.length}.`);
console.log(`\nCrudo leído con leerCrudoDeLaConsulta(): ${propias.length} pagadas y ${muestra.length} migradas al azar; sin poder leer: ${fallidas}.`);
for (const [k, n] of [...conteo.entries()].sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log("\nequifax_resumen.ingreso_estimado_usd (lo derivado por equifax-tablas.ts):");
for (const [k, n] of [...porTipo.entries()].sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);
