// Mide el buró de la institución en lo que leería el modelo (marco-v31,
// apagado) con las consultas de Equifax ya guardadas. NO gasta nada: lee
// consultas_equifax y el último perfil de Novadata de cada persona, y no llama
// al modelo ni a Equifax.
//
// El bloque y el perfil se arman con las MISMAS funciones que el análisis
// (buroEquifaxDelPerfilDelModelo y armarPerfilDelModelo de
// perfil-del-modelo.ts), y el marco con marcoConElBuro: lo que se mide es lo
// que el modelo leería si se enciende CONFIG_LLM.buroDeLaInstitucion.
//
// Qué mide, por persona:
//   1. El tamaño del bloque buroEquifax y cuánto cambia el perfil del modelo
//      entero con y sin buró (lo que sale de Novadata y lo que entra).
//   2. Que no lleve datos personales: los centinelas de la respuesta cruda
//      (_comun/equifax-personales.mjs) no aparecen ni en el bloque ni en el
//      perfil entero; ningún número de 10 dígitos o más, ninguno con decimales.
//   3. Que no quede nada del buró de Novadata (bancos y cooperativas).
//   4. Qué cambia en la disponibilidad y en la deuda total, en tramos.
//   5. Cuánto pesa el marco de v31 contra el de v30.
//
// Imprime sólo conteos y tamaños: nunca un monto, un valor de la estructura ni
// un código de persona.
//
//   node scripts/medir-bloque-equifax.mjs
//
// AVISO: este archivo no pasa por lint ni build.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { cargarEntorno } from "./_comun/entorno.mjs";
import { explicar } from "./_comun/casos.mjs";
import { centinelas } from "./_comun/equifax-personales.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
cargarEntorno(RAIZ);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const compartido = (f) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", f)).href);
const { armarPerfilDelModelo, buroEquifaxDelPerfilDelModelo, CAMPOS_DEL_BURO_DE_NOVADATA } = await compartido("perfil-del-modelo.ts");
const { MARCO_INTERPRETATIVO, marcoConElBuro } = await compartido("marco-interpretativo.ts");
const { estaVigenteHastaElCorte } = await compartido("vigencia-mensual.ts");
const { loadDisabledFields } = await compartido("runtime-config.ts");

const fallar = (e) => { console.error(explicar(e)); process.exit(1); };

const { data: consultas, error } = await db.from("consultas_equifax")
  .select("id, client_id, created_at, estructura, respuesta_cruda")
  .eq("ambiente", "produccion").eq("http_equifax", 200).not("estructura", "is", null)
  .order("created_at", { ascending: true }).order("id", { ascending: true });
if (error) fallar(error);
if (consultas.length === 0) fallar(new Error("No hay estructuras guardadas en producción."));
// La más reciente de cada persona: es la que leería el análisis.
const porPersona = new Map();
for (const c of consultas) if (c.client_id) porPersona.set(c.client_id, c);

const camposDeshabilitados = await loadDisabledFields(db);
const ahora = new Date();

// Caracteres por token, calibrados el 2026-10-16 con el contador de tokens de
// la API (gratis, no corre el modelo) sobre el perfil INVENTADO de las pruebas
// y el texto del marco: nada de una persona real salió para medir. Hasta ese
// día este guion usaba 3,2 a ojo, y el bloque pesaba el doble de lo que decía:
// el JSON del buró es casi todo números y nombres de campo largos.
const CARACTERES_POR_TOKEN_JSON = 1.63; // lo que el buró agrega al perfil inventado: +2.677 caracteres, +1.647 tokens
const CARACTERES_POR_TOKEN_MARCO = 2.37; // la sección del marco: +3.798 caracteres, +1.602 tokens
const tokens = (caracteres, porToken = CARACTERES_POR_TOKEN_JSON) => Math.round(caracteres / porToken);
const media = (v) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0);
const contar = (m, clave) => m.set(clave, (m.get(clave) ?? 0) + 1);
const ver = (m) => Object.fromEntries([...m.entries()].sort());
const NUMERO_LARGO = /\d{10,}/;
const conDecimales = (n) => (typeof n === "number" ? !Number.isInteger(n) : n && typeof n === "object" ? Object.values(n).some(conDecimales) : false);

const r = {
  bloque: [], sinBuro: [], conBuro: [], sinPerfil: 0, vigentes: 0, centinelas: 0,
  personalEnElBloque: 0, personalEnElPerfil: 0, numeroLargo: 0, decimales: 0, quedaNovadata: 0, quedanCooperativas: 0,
  temasQueCambian: new Map(), deudaTotal: new Map(), noConcilia: new Map(), estadoDeCartera: new Map(),
};

for (const [clientId, c] of porPersona) {
  if (estaVigenteHastaElCorte(c.created_at, ahora)) r.vigentes++;
  const bloque = buroEquifaxDelPerfilDelModelo(c.estructura);
  const textoBloque = JSON.stringify(bloque);
  r.bloque.push(textoBloque.length);

  const { data: perfil, error: e2 } = await db.from("client_profiles").select("standard_profile")
    .eq("client_id", clientId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (e2) fallar(e2);
  if (!perfil) { r.sinPerfil++; continue; }
  const sin = armarPerfilDelModelo(perfil.standard_profile, camposDeshabilitados);
  const con = armarPerfilDelModelo(perfil.standard_profile, camposDeshabilitados, { proveedor: "equifax", estructura: c.estructura });
  const textoCon = JSON.stringify(con);
  r.sinBuro.push(JSON.stringify(sin).length);
  r.conBuro.push(textoCon.length);

  const valores = centinelas(c.respuesta_cruda);
  r.centinelas += valores.length;
  if (valores.some((v) => textoBloque.includes(v))) r.personalEnElBloque++;
  if (valores.some((v) => textoCon.includes(v))) r.personalEnElPerfil++;
  if (NUMERO_LARGO.test(JSON.stringify(con.buroEquifax))) r.numeroLargo++;
  if (conDecimales(con)) r.decimales++;
  const bancario = con.comportamientoBancario ?? {};
  if (CAMPOS_DEL_BURO_DE_NOVADATA.some((k) => k in bancario)) r.quedaNovadata++;
  if ("comportamientoCooperativas" in con) r.quedanCooperativas++;

  const antes = new Set(sin.disponibilidad?.temasNoConsultados ?? []);
  for (const t of con.disponibilidad?.temasConsultados ?? []) if (antes.has(t)) contar(r.temasQueCambian, t);

  const a = sin.endeudamiento?.deudaPropiaTotal;
  const b = con.endeudamiento?.deudaPropiaTotal;
  const tramo = typeof a !== "number" || typeof b !== "number" ? "sin total"
    : a === 0 && b === 0 ? "las dos en cero"
    : Math.abs(b - a) / Math.max(a, b) <= 0.01 ? "igual (hasta 1%)"
    : Math.abs(b - a) / Math.max(a, b) <= 0.1 ? "cerca (hasta 10%)"
    : Math.abs(b - a) / Math.max(a, b) <= 0.3 ? "distinta (hasta 30%)"
    : `muy distinta, mayor con ${b > a ? "buró" : "Novadata"}`;
  contar(r.deudaTotal, tramo);

  for (const s of ["bancos", "cooperativas", "comercial"]) {
    if (bloque.deudaActualTitular?.[s]?.conciliaConElResumen === "no") contar(r.noConcilia, s);
  }
  // Una categoría de Equifax, no un dato de la persona; aun así, los dígitos
  // salen como # (un rango de días se lee igual, un número no).
  const d = bloque.estadoGeneral?.estadoDeCartera?.descripcion;
  contar(r.estadoDeCartera, d == null ? "(sin estado)" : String(d).replace(/\d/g, "#"));
}

const personas = porPersona.size;
const conPerfil = personas - r.sinPerfil;
console.log(`Consultas de producción con estructura: ${consultas.length}, de ${personas} personas (${r.vigentes} vigentes hoy). Con perfil de Novadata: ${conPerfil}.`);
console.log("\n1. Tamaño");
console.log(`   bloque buroEquifax         : ${media(r.bloque)} caracteres en promedio (mín ${Math.min(...r.bloque)}, máx ${Math.max(...r.bloque)}), ~${tokens(media(r.bloque))} tokens (máx ~${tokens(Math.max(...r.bloque))})`);
console.log(`   perfil del modelo sin buró : ${media(r.sinBuro)} caracteres en promedio`);
console.log(`   perfil del modelo con buró : ${media(r.conBuro)} caracteres en promedio (${media(r.conBuro) - media(r.sinBuro) >= 0 ? "+" : ""}${media(r.conBuro) - media(r.sinBuro)}, ~${tokens(media(r.conBuro) - media(r.sinBuro))} tokens)`);
console.log(`   (tokens: ${CARACTERES_POR_TOKEN_JSON} caracteres por token, calibrado sobre el perfil inventado)`);
console.log("\n2. Datos personales");
console.log(`   se buscaron ${r.centinelas} valores personales de las respuestas crudas`);
console.log(`   personas con alguno en el bloque          : ${r.personalEnElBloque}`);
console.log(`   personas con alguno en el perfil con buró : ${r.personalEnElPerfil}`);
console.log(`   bloques con un número de 10 dígitos o más : ${r.numeroLargo}`);
console.log(`   perfiles con un número con decimales      : ${r.decimales}`);
console.log("\n3. Lo que el buró reemplaza");
console.log(`   perfiles con algún campo de buró de Novadata en comportamientoBancario: ${r.quedaNovadata}`);
console.log(`   perfiles con comportamientoCooperativas: ${r.quedanCooperativas}`);
console.log("\n4. Qué cambia");
console.log("   temas que Novadata no había contestado y pasan a consultados:", ver(r.temasQueCambian));
console.log("   deuda propia total con buró contra sin buró:", ver(r.deudaTotal));
console.log("   el detalle no concilia con el resumen de Equifax en:", ver(r.noConcilia));
console.log("   estado de cartera según Equifax:", ver(r.estadoDeCartera));
console.log("\n5. Marco");
const v30 = MARCO_INTERPRETATIVO.length;
const conB = marcoConElBuro(true).length;
const sinB = marcoConElBuro(false).length;
console.log(`   marco-v30                 : ${v30} caracteres`);
console.log(`   marco-v31 con buroEquifax : ${conB} caracteres (${conB - v30 >= 0 ? "+" : ""}${conB - v30}, ~${tokens(conB - v30, CARACTERES_POR_TOKEN_MARCO)} tokens)`);
console.log(`   marco-v31 sin buró        : ${sinB} caracteres (${sinB - v30 >= 0 ? "+" : ""}${sinB - v30})`);
