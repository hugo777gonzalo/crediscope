// Cómo se escriben los números en pantalla: un solo lugar.
//
// POR QUÉ EXISTE
//
// En la revisión del 2026-10-10 la misma cifra aparecía de tres maneras según
// la pantalla: "2.812" en la bandeja, "2812" en el Panorama de Fuentes de
// Ingreso y "2812" en Reportes; "37.0 s" con punto en el expediente y
// "37,0 s" en Laboratorio; "4.3¢" junto a "$15,36". Cada módulo había
// armado su propio Intl.NumberFormat (había ocho copias) y varios
// interpolaban el número crudo en el texto.
//
// La regla de la casa es la de Ecuador: punto para los miles, coma para los
// decimales, y los miles se separan también en los de cuatro cifras
// ("2.812", no "2812"). Las fechas siguen en fechas.js.
//
// Todo lo que acá no es un número devuelve "—": un dato que falta se dice, no
// se rellena con cero (ver CLAUDE.md, "Los huecos se dicen").

import { mesLegible } from "./ingresosCampos.js";

const LOCAL = "es-EC";
const esNumero = (n) => n !== null && n !== undefined && n !== "" && Number.isFinite(Number(n));

const enteros = new Intl.NumberFormat(LOCAL, { maximumFractionDigits: 0, useGrouping: "always" });
const porDecimales = new Map();
function formatoDecimal(dec) {
  if (!porDecimales.has(dec)) {
    porDecimales.set(dec, new Intl.NumberFormat(LOCAL, { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: "always" }));
  }
  return porDecimales.get(dec);
}
const porMoneda = new Map();
function formatoMoneda(dec) {
  if (!porMoneda.has(dec)) {
    porMoneda.set(dec, new Intl.NumberFormat(LOCAL, { style: "currency", currency: "USD", minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: "always" }));
  }
  return porMoneda.get(dec);
}

/** 2812 → "2.812" */
export const entero = (n) => (esNumero(n) ? enteros.format(Number(n)) : "—");

/** 37.04 → "37,0" (con los decimales que se pidan) */
export const decimal = (n, dec = 1) => (esNumero(n) ? formatoDecimal(dec).format(Number(n)) : "—");

/** 1784 → "$1.784"; con dec = 2: "$12,14" */
export const moneda = (n, dec = 0) => (esNumero(n) ? formatoMoneda(dec).format(Number(n)) : "—");

/** Una fracción (0,37) → "37%". Con dec = 1: "37,4%". */
export const porcentaje = (fraccion, dec = 0) => (esNumero(fraccion) ? `${formatoDecimal(dec).format(Number(fraccion) * 100)}%` : "—");

/** parte y total → "37%". Un porcentaje que no es cero nunca se muestra como
 *  "0%": 12 de 2.812 es "<1%". (El Panorama decía "0% (12)".) */
export function porcentajeDe(parte, total, dec = 0) {
  if (!esNumero(parte) || !esNumero(total) || Number(total) <= 0) return "—";
  const p = (Number(parte) / Number(total)) * 100;
  const piso = 10 ** -dec;
  if (p > 0 && p < piso) return `<${formatoDecimal(dec).format(piso)}%`;
  return `${formatoDecimal(dec).format(p)}%`;
}

/** Milisegundos → "37,0 s". Debajo de un segundo, en milisegundos. */
export function segundos(ms, dec = 1) {
  if (!esNumero(ms)) return "—";
  const n = Number(ms);
  if (n < 1000 && n > 0) return `${enteros.format(n)} ms`;
  return `${formatoDecimal(dec).format(n / 1000)} s`;
}

/** Minutos → "6 d 6 h", "2 h 15 min", "45 min". Una caída de 9.049 minutos
 *  no se lee sin hacer la cuenta. */
export function duracionLarga(minutos) {
  if (!esNumero(minutos)) return "—";
  const m = Math.round(Number(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** Dólares → "4,3¢" (centavos). Para costos por llamada, que son fracciones
 *  de dólar. */
export const centavos = (usd, dec = 1) => (esNumero(usd) ? `${formatoDecimal(dec).format(Number(usd) * 100)}¢` : "—");

/** plural(1, "llamada") → "1 llamada"; plural(2812, "persona", "personas")
 *  → "2.812 personas". Reemplaza al "llamada(s)": el "(s)" no es español, es
 *  una forma de no decidir. */
export function plural(n, uno, varios = `${uno}s`) {
  if (!esNumero(n)) return `— ${varios}`;
  return `${enteros.format(Number(n))} ${Number(n) === 1 ? uno : varios}`;
}

/** "2026-08" → "Ago 2026" (nombre de pantalla acordado con el negocio). */
export const mesAnio = mesLegible;

// Textos que la clasificación de ingresos GUARDÓ ya armados dentro de cada
// perfil (fuentes-ingreso.ts, "por qué" y "qué pedir"). Los armó con el
// formato de JavaScript, no con el de la casa: meses en ISO ("el corte
// 2026-08"), dólares sin separador ("$1084") y con punto decimal ("$491.22").
// Reescribirlos en cada perfil guardado es una migración de miles de filas
// por un problema de presentación; se arreglan al mostrarlos. Cuando
// fuentes-ingreso.ts los arme bien (próxima versión), esto deja de hacer
// algo y se puede retirar: es idempotente.
export function humanizarTexto(texto) {
  if (typeof texto !== "string" || !texto) return texto;
  return texto
    // "en el corte 2026-08" → "en la información IESS de Ago 2026". El
    // negocio no dice "corte" en pantalla: dice "Información IESS".
    .replace(/\b(del|el|este) corte (\d{4}-(?:0[1-9]|1[0-2]))\b/gi, (_, art, mes) => {
      const a = art.toLowerCase();
      const frase = a === "del" ? "de la" : a === "este" ? "esta" : "la";
      return `${frase} información IESS de ${mesLegible(mes)}`;
    })
    .replace(/\bcorte (\d{4}-(?:0[1-9]|1[0-2]))\b/gi, (_, mes) => `información IESS de ${mesLegible(mes)}`)
    .replace(/(?<![\d-])((?:19|20)\d{2}-(?:0[1-9]|1[0-2]))(?![\d-])/g, (_, mes) => mesLegible(mes))
    // "Tiene 1 establecimiento(s) registrado(s)" → "Tiene 1 establecimiento registrado"
    .replace(/\b(\d+) (\p{L}+)\(s\)(?: (\p{L}+)\(s\))?/gu, (_, n, sust, adj) => {
      const uno = Number(n) === 1;
      return `${n} ${sust}${uno ? "" : "s"}${adj ? ` ${adj}${uno ? "" : "s"}` : ""}`;
    })
    // "error del LLM" → "error del modelo": la sigla es jerga de proveedor.
    .replace(/\bLLM\b/g, "modelo")
    // "Estuvo sin funcionar 9049 minutos" → "6 d 6 h"
    .replace(/\b(\d{3,}) minutos\b/g, (_, n) => duracionLarga(Number(n)))
    .replace(/\$(\d{4,})(?![\d.,])/g, (_, n) => `$${enteros.format(Number(n))}`)
    .replace(/\$(\d{1,3}(?:\.\d{3})*)\.(\d{1,2})(?!\d)/g, (_, ent, cent) => `$${ent}${","}${cent.padEnd(2, "0")}`);
}
