// Cambia una palabra en los textos de pantalla de toda la aplicación, sin tocar
// el código: nombres de variables, de columnas y de campos no se mueven.
//
//   node scripts/renombrar-textos.mjs --de="\bPuntaje(s?)\b" --a="Score$1"            (en seco)
//   node scripts/renombrar-textos.mjs --de="\bpuntaje(s?)\b" --a="score$1" --aplicar
//
//   --de        expresión regular (sin barras), con mayúsculas y minúsculas distintas
//   --a         reemplazo ($1 es el primer grupo)
//   --i         no distinguir mayúsculas
//   --excluir   archivos que no se tocan, separados por coma (los que tienen la
//               palabra como nombre de columna de un archivo que cargan otros)
//   --archivo   sólo ese archivo
//   --aplicar   escribe; sin esto sólo muestra qué cambiaría
//
// POR QUÉ EXISTE. El 2026-10-12 el negocio unificó "Puntaje" y "score" en
// "Score": 73 textos en 31 archivos. Un reemplazo de texto sobre el código
// habría tocado `puntaje` como columna de la plantilla que llenan las
// instituciones (un contrato de datos) y como variable. El extractor
// (lib/textos-de-pantalla.mjs) sabe dónde empieza y termina cada texto de
// pantalla, y sólo ahí se reemplaza.
//
// QUÉ NO HACE. No concuerda género ni número: "el cliente" -> "la persona"
// necesita una persona leyendo. Se corre en seco, se leen las líneas y recién
// entonces se aplica, o se edita a mano lo que no sea un cambio de palabra.

import fs from "node:fs";
import path from "node:path";
import { todosLosTextos } from "./lib/textos-de-pantalla.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const argumento = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? null;

const de = argumento("de");
const a = argumento("a");
if (!de || a === null) {
  console.log('Uso: node scripts/renombrar-textos.mjs --de="<regex>" --a="<reemplazo>" [--i] [--excluir=a,b] [--archivo=src/x.jsx] [--aplicar]');
  process.exit(2);
}
const regex = new RegExp(de, `g${process.argv.includes("--i") ? "i" : ""}`);
const excluir = new Set((argumento("excluir") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const soloArchivo = argumento("archivo");
const aplicar = process.argv.includes("--aplicar");

const { textos } = todosLosTextos();
const porArchivo = new Map();
for (const t of textos) {
  if (excluir.has(t.archivo) || (soloArchivo && t.archivo !== soloArchivo)) continue;
  if (!porArchivo.has(t.archivo)) porArchivo.set(t.archivo, []);
  porArchivo.get(t.archivo).push(t);
}

let cambios = 0;
let archivosTocados = 0;
for (const [archivo, lista] of porArchivo) {
  const ruta = path.join(RAIZ, archivo);
  let fuente = fs.readFileSync(ruta, "utf8");
  const rangos = lista.flatMap((t) => t.rangos.map((r) => ({ r, linea: t.linea })));
  // De atrás para adelante: un cambio de largo no corre los rangos que faltan.
  rangos.sort((x, y) => y.r[0] - x.r[0]);
  let toco = false;
  const visto = [];
  for (const { r: [inicio, fin], linea } of rangos) {
    const trozo = fuente.slice(inicio, fin);
    const nuevo = trozo.replace(regex, a);
    if (nuevo === trozo) continue;
    visto.push({ linea, antes: trozo.replace(/\s+/g, " ").trim(), despues: nuevo.replace(/\s+/g, " ").trim() });
    fuente = fuente.slice(0, inicio) + nuevo + fuente.slice(fin);
    toco = true;
    cambios++;
  }
  if (!toco) continue;
  archivosTocados++;
  for (const v of visto.reverse()) console.log(`${archivo.replace(/^src\//, "")}:${v.linea}: ${v.antes.slice(0, 90)}  →  ${v.despues.slice(0, 90)}`);
  if (aplicar) fs.writeFileSync(ruta, fuente);
}
console.log(`\n${cambios} textos en ${archivosTocados} archivos ${aplicar ? "reescritos" : "(en seco: no se escribió nada; --aplicar para escribir)"}`);
