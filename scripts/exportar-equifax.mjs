// Exporta lo que Equifax contestó a un Excel con una hoja por cada tabla que
// trae la respuesta, más "Consulta" (datos de la consulta), "Resumen" (los
// campos sueltos) y "Estructura" (el inventario de la respuesta).
//
// SOLO LEE. No llama a Equifax, no cobra y no escribe en la base: parte de la
// consulta ya guardada (la más reciente de la persona) o de un archivo crudo
// del disco.
//
// El Excel tiene datos personales y de buró: se escribe en research/, que está
// fuera de git (en la carpeta principal, también si se corre desde un
// worktree), y nunca se imprime su contenido.
//
// Uso:
//   node scripts/exportar-equifax.mjs --caso=c-xxxxxxxx
//   node scripts/exportar-equifax.mjs --archivo=research/equifax/crudo/<archivo>.json
//   --salida=<ruta.xlsx>   (por defecto research/equifax/excel/equifax-<caso>-<fecha>.xlsx)

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { cargarEntorno, carpetaDeResearch, raizPrincipal } from "./_comun/entorno.mjs";
import { explicar, personaDelCaso } from "./_comun/casos.mjs";
import { jsonAHojas, nombreDeHoja } from "./_comun/hojas-de-json.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const valor = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const morir = (...l) => { console.error(l.join("\n")); process.exit(1); };

const hora = (iso) => (iso ? new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil", hour12: false }) : "");

let etiqueta, cuerpo, meta = [];

if (valor("archivo")) {
  const archivo = path.resolve(raizPrincipal(RAIZ), valor("archivo"));
  if (!fs.existsSync(archivo)) morir(`No existe ${valor("archivo")}.`);
  const crudo = JSON.parse(fs.readFileSync(archivo, "utf8"));
  if (!crudo.cuerpo) morir("Ese archivo no trae una respuesta (cuerpo vacío): fue una consulta que no contestó.");
  etiqueta = crudo.etiqueta ?? path.basename(archivo, ".json");
  cuerpo = crudo.cuerpo;
  meta = [
    ["Origen", "archivo crudo en disco"],
    ["Persona (código)", etiqueta],
    ["Capturado el", hora(crudo.capturadoEl)],
    ["HTTP de Equifax", crudo.httpEquifax ?? ""],
    ["Parámetros de la decisión", JSON.stringify(crudo.parametros ?? {})],
    ["Cabeceras de la transacción", JSON.stringify(crudo.cabeceras ?? {})],
  ];
} else if (valor("caso")) {
  cargarEntorno(RAIZ);
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[k]) morir(`Falta ${k} en .env.functions.`);
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const persona = await personaDelCaso(db, valor("caso"));
    const { data, error } = await db.from("consultas_equifax").select("*")
      .eq("identificacion", persona.cedula).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(explicar(error));
    if (!data) morir(`${valor("caso")} no tiene ninguna consulta guardada de Equifax.`);
    etiqueta = valor("caso");
    cuerpo = data.respuesta_cruda;
    meta = [
      ["Origen", "consulta guardada en la base"],
      ["Persona (código)", etiqueta],
      ["Consultada el", hora(data.created_at)],
      ["Ambiente", data.ambiente],
      ["HTTP de Equifax", data.http_equifax],
      ["Duración (ms)", data.duracion_ms ?? ""],
      ["Intentos", data.intentos],
      ["Base legal", data.base_legal],
      ["Parámetros de la decisión", JSON.stringify(data.parametros ?? {})],
      ["Cabeceras de la transacción", JSON.stringify(data.cabeceras_respuesta ?? {})],
    ];
  } catch (e) {
    morir(`No se pudo leer la consulta: ${e.message}`);
  }
} else {
  morir("Falta de dónde leer: --caso=c-xxxxxxxx o --archivo=<ruta>.");
}

const { resumen, tablas, estructura } = jsonAHojas(cuerpo);

const libro = XLSX.utils.book_new();
const usados = new Set();
const indice = []; // hoja -> de qué parte de la respuesta sale
const agregar = (nombre, filas, vacio, ruta = null) => {
  const hoja = XLSX.utils.json_to_sheet(filas.length ? filas : [vacio]);
  // Un ancho legible por columna, sin pasarse.
  const encabezados = Object.keys(filas[0] ?? vacio);
  hoja["!cols"] = encabezados.map((h) => ({
    wch: Math.min(60, Math.max(h.length + 2, ...filas.slice(0, 200).map((f) => String(f[h] ?? "").length + 2))),
  }));
  const nombreFinal = nombreDeHoja(nombre, usados);
  XLSX.utils.book_append_sheet(libro, hoja, nombreFinal);
  if (ruta !== null) indice.push({ Hoja: nombreFinal, "Ruta en la respuesta": ruta, Filas: filas.length });
};

agregar("Consulta", meta.map(([Dato, Valor]) => ({ Dato, Valor })), { Dato: "", Valor: "" });
// El índice va segundo y se llena al final; se reserva el nombre ahora para
// que ninguna tabla de la respuesta se lo quite.
usados.add("índice");
agregar("Resumen", resumen, { Campo: "(la respuesta no trae campos sueltos)", Valor: "" });
for (const [ruta, filas] of tablas) agregar(ruta, filas, { "(sin filas)": "" }, ruta);
agregar("Estructura", estructura, { Ruta: "", Tipo: "", Cantidad: "" });

const hojaIndice = XLSX.utils.json_to_sheet(indice.length ? indice : [{ Hoja: "(la respuesta no trae tablas)" }]);
hojaIndice["!cols"] = [{ wch: 34 }, { wch: 62 }, { wch: 8 }];
XLSX.utils.book_append_sheet(libro, hojaIndice, "Índice");
// Queda en segundo lugar, después de "Consulta".
libro.SheetNames.splice(1, 0, libro.SheetNames.pop());

const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guayaquil" });
const salida = valor("salida")
  ? path.resolve(valor("salida"))
  : path.join(carpetaDeResearch(RAIZ, "equifax", "excel"), `equifax-${etiqueta}-${hoy}.xlsx`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, XLSX.write(libro, { type: "buffer", bookType: "xlsx" }));

console.log(`Excel escrito: ${path.relative(raizPrincipal(RAIZ), salida)}`);
console.log(`hojas (${libro.SheetNames.length}): ${libro.SheetNames.join(" | ")}`);
console.log(`filas: resumen ${resumen.length}; tablas ${[...tablas].map(([r, f]) => `${r}=${f.length}`).join(", ") || "ninguna"}`);
