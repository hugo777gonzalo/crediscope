// Extrae los textos que lee una persona en pantalla, leyendo el código con
// el mismo analizador que usa Vite (rolldown/utils). Lo comparten
// `scripts/revisar-textos.mjs` (el control de términos) y la habilidad
// `revision-ux` (inventario por pantalla).
//
// Por qué un analizador y no un grep: un grep mezcla comentarios, clases de
// CSS y rutas con los textos de pantalla, y no distingue el título de un
// botón de una constante interna. El 2026-10-10 el primer grep de términos
// devolvió 569 coincidencias de las cuales casi ninguna era un texto visible.

import fs from "node:fs";
import path from "node:path";
// rolldown no está en package.json: llega con vite 8 (el mismo analizador que
// compila la aplicación, ya hoisteado en el lock con su binding de Linux). Si
// una actualización de vite lo mueve o cambia parseSync, declararlo como
// devDependency en lugar de buscar otro analizador.
import { parseSync, Visitor } from "rolldown/utils";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");

// Atributos de JSX que nunca son texto de pantalla.
const ATRIBUTOS_TECNICOS = new Set([
  "className", "id", "type", "to", "href", "key", "name", "htmlFor", "inputMode",
  "autoComplete", "style", "target", "rel", "role", "color", "variant", "size",
  "fill", "stroke", "viewBox", "d", "width", "height", "cx", "cy", "r", "x", "y",
  "x1", "x2", "y1", "y2", "points", "transform", "xmlns", "pattern", "accept",
  "min", "max", "step", "lang", "dir", "tabIndex", "loading", "decoding",
  "preserveAspectRatio", "textAnchor", "dominantBaseline", "strokeWidth",
  "strokeLinecap", "strokeLinejoin", "strokeDasharray", "opacity", "offset",
  "stopColor", "gradientUnits", "clipPath", "mask", "filter", "markerEnd",
  "data-testid", "src", "srcSet", "method", "action", "encType", "icono", "Icono",
]);

// Atributos que sí se leen (aunque lleguen por un componente propio).
function esAtributoVisible(nombre) {
  if (ATRIBUTOS_TECNICOS.has(nombre)) return false;
  if (nombre.startsWith("on")) return false;
  return true;
}

// ¿Esta cadena parece una frase o un rótulo, y no un identificador?
export function pareceTexto(s) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < 2) return false;
  if (!/\p{L}/u.test(t)) return false;
  if (/^(https?:|\/|\.\/|\.\.\/|#|--|var\(|rgb|hsl|[0-9.]+(px|rem|em|%|fr|vh|vw|ms|s)$)/i.test(t)) return false;
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(t)) return false; // camelCase
  if (/^[a-z0-9]+([-_][a-z0-9]+)+$/i.test(t) && !t.includes(" ")) return false; // kebab o snake
  if (/^[a-z0-9_.]+$/.test(t)) return false; // identificador en minúsculas
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 3 && !t.includes(" ")) return false; // CONSTANTE
  if (/^[a-z]+\/[a-z0-9.+-]+$/i.test(t)) return false; // tipo MIME
  return true;
}

function lineaDe(fuente, posicion) {
  let linea = 1;
  for (let i = 0; i < posicion && i < fuente.length; i++) if (fuente.charCodeAt(i) === 10) linea++;
  return linea;
}

// Cada texto: { archivo, linea, tipo, texto, rangos }. `rangos` son los
// [inicio, fin) del texto en el archivo, sin las comillas ni los ${}: lo que se
// puede reescribir sin tocar código (ver scripts/renombrar-textos.mjs).
//   tipo "jsx"     — texto entre etiquetas
//   tipo "atributo:<nombre>" — propiedad con cadena fija (title, label, etc.)
//   tipo "cadena"  — cadena suelta dentro de {} o de tablas de rótulos
export function textosDeArchivo(rutaRelativa) {
  const ruta = path.join(RAIZ, rutaRelativa);
  const fuente = fs.readFileSync(ruta, "utf8");
  const lang = rutaRelativa.endsWith(".jsx") ? "jsx" : "js";
  const { program, errors } = parseSync(rutaRelativa, fuente, { lang });
  if (errors?.length) {
    return { archivo: rutaRelativa, textos: [], errores: errors.map((e) => e.message) };
  }
  const ast = typeof program === "string" ? JSON.parse(program) : program;
  const textos = [];
  const vistos = new Set();
  const agregar = (tipo, texto, inicio, rangos = []) => {
    const limpio = texto.replace(/\s+/g, " ").trim();
    if (!pareceTexto(limpio)) return;
    const clave = `${inicio}:${limpio}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    textos.push({ archivo: rutaRelativa, linea: lineaDe(fuente, inicio), tipo, texto: limpio, rangos });
  };

  // Cadenas que NO son de pantalla aunque estén en el código.
  const ignorar = new WeakSet();
  const marcarHijos = (nodo) => {
    // import/export from, clases, claves de objeto, rutas de navegación
    if (!nodo || typeof nodo !== "object") return;
    ignorar.add(nodo);
  };

  const visitante = new Visitor({
    ImportDeclaration(n) { marcarHijos(n.source); },
    ExportAllDeclaration(n) { marcarHijos(n.source); },
    ExportNamedDeclaration(n) { if (n.source) marcarHijos(n.source); },
    ImportExpression(n) { marcarHijos(n.source); },
    JSXText(n) { agregar("jsx", n.value, n.start, [[n.start, n.end]]); },
    JSXAttribute(n) {
      const nombre = n.name?.name ?? "";
      if (!esAtributoVisible(nombre)) { marcarHijos(n.value); return; }
      if (n.value?.type === "Literal" && typeof n.value.value === "string") {
        agregar(`atributo:${nombre}`, n.value.value, n.value.start, [[n.value.start + 1, n.value.end - 1]]);
        marcarHijos(n.value);
      }
    },
    // Cualquier otra cadena fija: tablas de rótulos, condicionales dentro de {}
    // y plantillas. Se filtra con pareceTexto().
    Literal(n) {
      if (ignorar.has(n)) return;
      if (typeof n.value === "string") agregar("cadena", n.value, n.start, [[n.start + 1, n.end - 1]]);
    },
    TemplateLiteral(n) {
      if (ignorar.has(n)) return;
      // Cada ${…} se marca con {} para no confundirlo con los puntos
      // suspensivos del texto real.
      const partes = n.quasis.map((q) => q.value.cooked ?? q.value.raw);
      const texto = partes.join("{}");
      agregar("cadena", texto, n.start, n.quasis.map((q) => [q.start, q.end]));
    },
    // Las claves de un objeto ({ "Por confirmar": 1 }) y los argumentos de
    // navigate()/Link no son texto de pantalla, pero sí lo son los valores.
    Property(n) { if (!n.computed) marcarHijos(n.key); },
    CallExpression(n) {
      const c = n.callee;
      const nombre = c?.type === "Identifier" ? c.name : c?.property?.name;
      if (["navigate", "getItem", "setItem", "removeItem", "querySelector", "querySelectorAll",
        "getElementById", "addEventListener", "removeEventListener", "from", "rpc", "select",
        "eq", "neq", "in", "is", "order", "ilike", "like", "gte", "lte", "gt", "lt", "or",
        "not", "contains", "overlaps", "match", "filter", "storage", "log", "warn", "error",
        "info", "debug", "invoke", "channel", "on", "off", "emit", "padStart", "padEnd",
        "split", "join", "replace", "replaceAll", "startsWith", "endsWith", "includes", "test",
        "RegExp", "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "NumberFormat",
        "DateTimeFormat", "Intl", "createElement", "appendChild", "setAttribute", "getAttribute",
        "classList", "toggle", "add", "remove", "contains", "focus", "scrollTo", "scrollIntoView",
        "open", "close", "fetch", "json", "text", "blob", "stringify", "parse", "get", "set",
        "has", "delete", "push", "map", "filter", "reduce", "sort", "find", "findIndex",
        "some", "every", "slice", "splice", "concat", "keys", "values", "entries", "assign",
        "freeze", "fromEntries", "groupBy"].includes(nombre)) {
        // Los argumentos de estas llamadas casi nunca son texto de pantalla.
        // Sólo se marcan los que son cadenas directas: los demás (por ejemplo
        // un texto dentro de un .map()) se visitan igual.
        for (const a of n.arguments ?? []) if (a?.type === "Literal" || a?.type === "TemplateLiteral") marcarHijos(a);
      }
    },
  });
  visitante.visit(ast);
  return { archivo: rutaRelativa, textos, errores: [] };
}

// Lista los archivos de src (jsx siempre; js sólo los que arman rótulos).
export function archivosDePantalla({ incluirLib = true } = {}) {
  const salida = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) recorrer(rel);
      else if (e.name.endsWith(".jsx")) salida.push(rel);
      else if (incluirLib && e.name.endsWith(".js") && dir.startsWith("src/lib")) salida.push(rel);
    }
  };
  recorrer("src");
  return salida.sort();
}

export function todosLosTextos(opciones) {
  const resultado = [];
  const fallos = [];
  for (const a of archivosDePantalla(opciones)) {
    const r = textosDeArchivo(a);
    resultado.push(...r.textos);
    if (r.errores.length) fallos.push({ archivo: a, errores: r.errores });
  }
  return { textos: resultado, fallos };
}

// ---- Texto explicativo bajo un título --------------------------------------
// El negocio decidió el 2026-10-20 que las pantallas son para personal de
// crédito capacitado: bajo un título no va una frase que diga qué hace la
// pantalla ni qué es un concepto de crédito. Lo propio de CrediScope (de dónde
// sale una cifra, qué se cobra, una regla nuestra) va en una etiqueta junto al
// dato o en un InfoTooltip. Esto encuentra los párrafos que siguen a un
// <h2>/<h3> para que el control y la revisión por pantalla los miren.

const esEspacio = (n) => n.type === "JSXText" && n.value.trim() === "";
const esComentario = (n) => n.type === "JSXExpressionContainer" && n.expression?.type === "JSXEmptyExpression";

function nombreDe(el) {
  const n = el?.openingElement?.name;
  return n?.type === "JSXIdentifier" ? n.name : null;
}

function claseDe(el) {
  const a = el?.openingElement?.attributes?.find((x) => x.name?.name === "className");
  return a?.value?.type === "Literal" ? a.value.value : "";
}

// El tramo de texto fijo más largo del elemento, en palabras. Los datos
// («Ventana de 12 meses · congelado el …») se cortan en cada expresión y en
// cada «·», así que quedan debajo de la frase que explica.
function palabrasDelTramoMasLargo(el) {
  let mejor = 0;
  const tramo = (texto) => {
    for (const parte of texto.split("·")) {
      const n = parte.trim().split(/\s+/).filter(Boolean).length;
      if (n > mejor) mejor = n;
    }
  };
  const recorrer = (nodo) => {
    for (const h of nodo.children ?? []) {
      if (h.type === "JSXText") tramo(h.value);
      // La ayuda ⓘ es donde va lo que sí corresponde explicar: no cuenta.
      else if (h.type === "JSXElement" && nombreDe(h) !== "InfoTooltip") recorrer(h);
      else if (h.type === "JSXExpressionContainer" && h.expression?.type === "Literal" && typeof h.expression.value === "string") tramo(h.expression.value);
    }
  };
  recorrer(el);
  return mejor;
}

function textoDe(fuente, el) {
  return fuente
    .slice(el.start, el.end)
    .replace(/<InfoTooltip\b[\s\S]*?<\/InfoTooltip>/g, " ⓘ ")
    .replace(/\s+/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\{[^}]*\}/g, "{}")
    .trim();
}

// [{ archivo, linea, titulo: "h2"|"h3", palabras, texto }]: cada párrafo (o
// elemento «crediscope-muted») que sigue de inmediato a un título.
export function parrafosBajoTitulos(rutaRelativa) {
  const ruta = path.join(RAIZ, rutaRelativa);
  const fuente = fs.readFileSync(ruta, "utf8");
  const { program, errors } = parseSync(rutaRelativa, fuente, { lang: "jsx" });
  if (errors?.length) return { hallazgos: [], errores: errors.map((e) => e.message) };
  const ast = typeof program === "string" ? JSON.parse(program) : program;
  const hallazgos = [];

  const visitar = (nodo) => {
    if (!nodo || typeof nodo !== "object") return;
    if (Array.isArray(nodo)) { nodo.forEach(visitar); return; }
    if ((nodo.type === "JSXElement" || nodo.type === "JSXFragment") && nodo.children) {
      const hijos = nodo.children;
      for (let i = 0; i < hijos.length; i++) {
        const nivel = hijos[i].type === "JSXElement" ? nombreDe(hijos[i]) : null;
        if (nivel !== "h2" && nivel !== "h3") continue;
        let j = i + 1;
        while (j < hijos.length && (esEspacio(hijos[j]) || esComentario(hijos[j]))) j++;
        const sig = hijos[j];
        if (sig?.type !== "JSXElement") continue;
        if (nombreDe(sig) !== "p" && !claseDe(sig).includes("crediscope-muted")) continue;
        hallazgos.push({
          archivo: rutaRelativa,
          linea: lineaDe(fuente, sig.start),
          titulo: nivel,
          palabras: palabrasDelTramoMasLargo(sig),
          texto: textoDe(fuente, sig),
        });
      }
    }
    for (const k of Object.keys(nodo)) if (k !== "type" && k !== "start" && k !== "end") visitar(nodo[k]);
  };
  visitar(ast);
  return { hallazgos, errores: [] };
}
