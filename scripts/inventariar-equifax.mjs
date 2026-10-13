// Inventario de las respuestas de Equifax guardadas en disco: qué campos
// trae, cuáles siempre y cuáles a veces, con qué tipos y cuáles parecen datos
// personales. Es la evidencia para diseñar la estructura estandarizada de
// Equifax: se diseña sobre lo que la fuente realmente contesta, no sobre lo
// que se supone que contesta (el diccionario del PDF de Aval mentía en dos
// campos y se supo recién con 240 respuestas).
//
// SOLO LEE archivos de research/equifax/crudo/. No llama a Equifax, no cobra
// y no toca la base. Toma la consulta más reciente de cada persona.
//
// Escribe un Excel en research/equifax/ (fuera de git: tiene valores de
// buró) y por pantalla imprime SÓLO conteos y nombres de campos, nunca
// valores.
//
// Uso:
//   node scripts/inventariar-equifax.mjs [--salida=<ruta.xlsx>]
//
// Hojas: "Campos" (un renglón por campo), "Listas" (las listas de objetos y
// cuántas filas traen), "Muestras" (una fila por persona).
//
// AVISO: este archivo no pasa por lint ni build.

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { carpetaDeResearch, raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const valor = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

// Campos que identifican o ubican a la persona: no deben llegar a un modelo
// de lenguaje (E27) y se señalan para que el diseño los deje fuera.
const PERSONAL = /nombre|direcci|telefon|celular|coordenada|numero_documento|documento|fecha_nacimiento|correo|email|provincia|canton|parroquia|barrio|calle|latitud|longitud/i;
// Nunca se listan valores de estos, aunque tengan pocos distintos.
const NO_LISTAR = PERSONAL;
const MAX_DISTINTOS = 40;
const MAX_ENUM = 15;

const carpeta = carpetaDeResearch(RAIZ, "equifax", "crudo");
const ultimoPorPersona = new Map();
for (const archivo of fs.readdirSync(carpeta).filter((f) => f.endsWith(".json")).sort()) {
  const crudo = JSON.parse(fs.readFileSync(path.join(carpeta, archivo), "utf8"));
  if (!crudo.cuerpo) continue; // una consulta que no contestó
  ultimoPorPersona.set(crudo.etiqueta, { etiqueta: crudo.etiqueta, cuerpo: crudo.cuerpo, bytes: fs.statSync(path.join(carpeta, archivo)).size });
}
const muestras = [...ultimoPorPersona.values()];
if (muestras.length === 0) {
  console.error("No hay respuestas guardadas en research/equifax/crudo/.");
  process.exit(1);
}

const campos = new Map();  // ruta -> estadísticas
const listas = new Map();  // ruta -> { filasPorMuestra: Map }
const tipoDe = (v) => (v === null ? "null" : Array.isArray(v) ? "lista" : typeof v);

function campo(ruta) {
  if (!campos.has(ruta)) campos.set(ruta, { muestras: new Set(), tipos: new Set(), conValor: new Set(), distintos: new Set(), min: null, max: null });
  return campos.get(ruta);
}

function recorrer(v, ruta, etiqueta) {
  if (Array.isArray(v)) {
    const l = listas.get(ruta) ?? { filas: new Map() };
    l.filas.set(etiqueta, (l.filas.get(etiqueta) ?? 0) + v.length);
    listas.set(ruta, l);
    campo(ruta).muestras.add(etiqueta);
    campo(ruta).tipos.add("lista");
    for (const x of v) recorrer(x, `${ruta}[]`, etiqueta);
  } else if (v && typeof v === "object") {
    campo(ruta || "(raíz)").muestras.add(etiqueta);
    campo(ruta || "(raíz)").tipos.add("objeto");
    for (const [k, x] of Object.entries(v)) recorrer(x, ruta ? `${ruta}.${k}` : k, etiqueta);
  } else {
    const c = campo(ruta);
    c.muestras.add(etiqueta);
    c.tipos.add(tipoDe(v));
    if (v !== null && v !== "") {
      c.conValor.add(etiqueta);
      if (c.distintos.size <= MAX_DISTINTOS) c.distintos.add(typeof v === "string" ? v.slice(0, 80) : v);
      if (typeof v === "number") { c.min = c.min === null ? v : Math.min(c.min, v); c.max = c.max === null ? v : Math.max(c.max, v); }
    }
  }
}
for (const m of muestras) recorrer(m.cuerpo, "", m.etiqueta);

const total = muestras.length;
const pct = (n) => Math.round((n / total) * 100);

const filasCampos = [...campos].map(([ruta, c]) => {
  const personal = PERSONAL.test(ruta);
  const enum_ = c.distintos.size > 0 && c.distintos.size <= MAX_ENUM && !NO_LISTAR.test(ruta) && !c.tipos.has("lista") && !c.tipos.has("objeto");
  return {
    Campo: ruta,
    Tipos: [...c.tipos].join(" / "),
    "Aparece en (%)": pct(c.muestras.size),
    "Con valor (%)": pct(c.conValor.size),
    "Valores distintos": c.distintos.size > MAX_DISTINTOS ? `más de ${MAX_DISTINTOS}` : c.distintos.size,
    "Valores (si son pocos)": enum_ ? [...c.distintos].join(" | ") : "",
    Mínimo: c.min ?? "",
    Máximo: c.max ?? "",
    "¿Dato personal?": personal ? "sí" : "",
  };
}).sort((a, b) => a.Campo.localeCompare(b.Campo));

const filasListas = [...listas].map(([ruta, l]) => {
  const n = [...l.filas.values()];
  return {
    Lista: ruta,
    "Aparece en (%)": pct(l.filas.size),
    "Filas mínimo": Math.min(...n),
    "Filas promedio": Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10,
    "Filas máximo": Math.max(...n),
    "Personas con la lista vacía": [...l.filas.values()].filter((x) => x === 0).length,
  };
}).sort((a, b) => a.Lista.localeCompare(b.Lista));

const filasMuestras = muestras.map((m) => ({
  Persona: m.etiqueta,
  "Tamaño (KB)": Math.round(m.bytes / 102.4) / 10,
  "Listas con filas": filasListas.filter((l) => (listas.get(l.Lista).filas.get(m.etiqueta) ?? 0) > 0).length,
  "Listas vacías": filasListas.filter((l) => (listas.get(l.Lista).filas.get(m.etiqueta) ?? 0) === 0).length,
}));

const libro = XLSX.utils.book_new();
for (const [nombre, filas] of [["Campos", filasCampos], ["Listas", filasListas], ["Muestras", filasMuestras]]) {
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), nombre);
}
const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guayaquil" });
const salida = valor("salida") ? path.resolve(valor("salida")) : path.join(carpetaDeResearch(RAIZ, "equifax"), `inventario-${hoy}.xlsx`);
fs.writeFileSync(salida, XLSX.write(libro, { type: "buffer", bookType: "xlsx" }));

// Por pantalla, sólo conteos y nombres.
const siempre = filasCampos.filter((c) => c["Aparece en (%)"] === 100).length;
const aVeces = filasCampos.filter((c) => c["Aparece en (%)"] < 100);
const personales = filasCampos.filter((c) => c["¿Dato personal?"] === "sí");
console.log(`Inventario de ${total} persona(s): ${filasCampos.length} campos, ${filasListas.length} listas.`);
console.log(`  siempre presentes: ${siempre} | a veces ausentes: ${aVeces.length}`);
console.log(`  listas vacías en alguna persona: ${filasListas.filter((l) => l["Personas con la lista vacía"] > 0).length}`);
console.log(`  campos que parecen datos personales (a dejar fuera del modelo): ${personales.length}`);
for (const p of personales.slice(0, 40)) console.log(`    ${p.Campo}`);
console.log(`Excel: ${path.relative(raizPrincipal(RAIZ), salida)}`);
