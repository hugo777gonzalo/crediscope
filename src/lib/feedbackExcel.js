import * as XLSX from "xlsx";

// Plantilla de retroalimentación: se descarga con los datos de
// CrediScope ya pre-llenados (cédula, fecha, score, recomendación) y el
// área de Crédito/Riesgos solo completa lo que ya tiene en su core.
// Nada de juicio analítico manual -- evaluar si el modelo acertó lo
// hace después el LLM, no una persona comparando a mano.
//
// Se usa .xlsx (no CSV) a propósito: el CSV en Excel con configuración
// regional en español rompe columnas por el separador y se ve
// desordenado justo para el público que tiene que sentirse cómodo con
// esto (jefaturas de crédito, no perfiles técnicos).

export const TIPOS_INCUMPLIMIENTO = [
  "externo",
  "sobreendeudamiento",
  "enfermedad",
  "fallecimiento",
  "problema laboral",
  "problema legal",
  "macroeconómico",
  "desastre natural",
  "seguridad / extorsión",
  "mala fe / fraude",
  "otro",
];

const COLUMNAS = [
  { clave: "cedula", titulo: "Cédula", ancho: 13, prellenada: true },
  { clave: "cliente", titulo: "Cliente", ancho: 26, prellenada: true },
  { clave: "fechaAnalisis", titulo: "Fecha del análisis", ancho: 17, prellenada: true },
  { clave: "score", titulo: "Score CrediScope", ancho: 16, prellenada: true },
  { clave: "recomendacion", titulo: "Recomendación CrediScope", ancho: 24, prellenada: true },
  { clave: "desembolsado", titulo: "¿Se desembolsó? (Sí/No)", ancho: 22 },
  { clave: "monto", titulo: "Monto otorgado", ancho: 15 },
  { clave: "producto", titulo: "Producto", ancho: 18 },
  { clave: "plazoMeses", titulo: "Plazo (meses)", ancho: 14 },
  { clave: "fechaDesembolso", titulo: "Fecha de desembolso (AAAA-MM-DD)", ancho: 30 },
  { clave: "huboDefault", titulo: "¿Hubo incumplimiento? (Sí/No)", ancho: 28 },
  { clave: "fechaDefault", titulo: "Fecha del incumplimiento (AAAA-MM-DD)", ancho: 34 },
  { clave: "tipoDefault", titulo: "Tipo de incumplimiento", ancho: 24 },
  { clave: "diasMoraMax", titulo: "Días de mora máx.", ancho: 17 },
  { clave: "observaciones", titulo: "Observaciones de cobranza", ancho: 50 },
];

const INSTRUCCIONES = [
  ["Retroalimentación de resultados — CrediScope"],
  [],
  ["Qué hacer:"],
  ["1. En la hoja \"Créditos\" ya vienen los clientes que CrediScope analizó, con su score y recomendación."],
  ["2. Completá únicamente las columnas desde \"¿Se desembolsó?\" en adelante, con datos de su sistema."],
  ["3. Si un cliente analizado NO terminó en un crédito desembolsado, poné \"No\" y dejá el resto vacío."],
  ["4. Guardá el archivo y subilo en la sección Retroalimentación de CrediScope."],
  [],
  ["Importante: no hace falta que evalúen si el modelo acertó o no. Eso lo analiza el sistema."],
  [],
  ["La columna \"Observaciones de cobranza\" es la más valiosa: si saben por qué un cliente dejó de pagar"],
  ["(perdió el trabajo, enfermedad, extorsión, sobreendeudamiento con otras entidades), escríbanlo en"],
  ["lenguaje normal. Ese dato no está en ninguna base y es lo que más ayuda a mejorar el análisis."],
  [],
  ["Valores válidos para \"Tipo de incumplimiento\":"],
  ...TIPOS_INCUMPLIMIENTO.map((t) => [`  • ${t}`]),
  [],
  ["Si no conocen el tipo, dejen la celda vacía — es preferible a adivinar."],
];

export function generarPlantilla(filas, nombreArchivo) {
  const libro = XLSX.utils.book_new();

  const hojaInstrucciones = XLSX.utils.aoa_to_sheet(INSTRUCCIONES);
  hojaInstrucciones["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(libro, hojaInstrucciones, "Instrucciones");

  const encabezados = COLUMNAS.map((c) => c.titulo);
  const datos = filas.map((f) => COLUMNAS.map((c) => (c.prellenada ? (f[c.clave] ?? "") : "")));
  const hojaCreditos = XLSX.utils.aoa_to_sheet([encabezados, ...datos]);
  hojaCreditos["!cols"] = COLUMNAS.map((c) => ({ wch: c.ancho }));
  hojaCreditos["!freeze"] = { xSplit: "0", ySplit: "1" };
  XLSX.utils.book_append_sheet(libro, hojaCreditos, "Créditos");

  XLSX.writeFile(libro, nombreArchivo);
}

// ---------- Lectura del archivo completado ----------

function normalizarTexto(v) {
  return String(v ?? "").trim();
}

// Tolerante a propósito: la gente escribe "SI", "sí", "x", "1".
function aBooleano(v) {
  const t = normalizarTexto(v).toLowerCase();
  if (!t) return null;
  if (["si", "sí", "s", "x", "1", "true", "verdadero"].includes(t)) return true;
  if (["no", "n", "0", "false", "falso"].includes(t)) return false;
  return null;
}

function aNumero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Excel puede entregar una fecha como objeto Date (si la celda está
// formateada como fecha) o como texto. Se normaliza a AAAA-MM-DD.
function aFechaISO(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const t = normalizarTexto(v);
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

export function leerArchivo(arrayBuffer) {
  const libro = XLSX.read(arrayBuffer, { cellDates: true });
  const nombreHoja = libro.SheetNames.includes("Créditos") ? "Créditos" : libro.SheetNames[0];
  const hoja = libro.Sheets[nombreHoja];
  if (!hoja) return { filas: [], errores: ["El archivo no tiene ninguna hoja legible."] };

  const crudas = XLSX.utils.sheet_to_json(hoja, { defval: "" });
  const porTitulo = Object.fromEntries(COLUMNAS.map((c) => [c.titulo, c.clave]));
  const errores = [];

  const filas = crudas
    .map((cruda, i) => {
      const fila = {};
      for (const [titulo, valor] of Object.entries(cruda)) {
        const clave = porTitulo[normalizarTexto(titulo)];
        if (clave) fila[clave] = valor;
      }
      const cedula = normalizarTexto(fila.cedula);
      if (!cedula) return null; // fila vacía al final del Excel, se ignora en silencio

      const desembolsado = aBooleano(fila.desembolsado);
      if (desembolsado === null) {
        errores.push(`Fila ${i + 2} (${cedula}): falta indicar si se desembolsó (Sí/No).`);
        return null;
      }
      const huboDefault = desembolsado ? aBooleano(fila.huboDefault) : null;
      if (desembolsado && huboDefault === null) {
        errores.push(`Fila ${i + 2} (${cedula}): se desembolsó pero falta indicar si hubo incumplimiento (Sí/No).`);
        return null;
      }

      return {
        cedula,
        desembolsado,
        monto: aNumero(fila.monto),
        producto: normalizarTexto(fila.producto) || null,
        plazoMeses: aNumero(fila.plazoMeses),
        fechaDesembolso: aFechaISO(fila.fechaDesembolso),
        huboDefault,
        fechaDefault: aFechaISO(fila.fechaDefault),
        tipoDefault: normalizarTexto(fila.tipoDefault).toLowerCase() || null,
        diasMoraMax: aNumero(fila.diasMoraMax),
        observaciones: normalizarTexto(fila.observaciones) || null,
      };
    })
    .filter(Boolean);

  if (filas.length === 0 && errores.length === 0) {
    errores.push("No se encontró ninguna fila con cédula en la hoja de créditos.");
  }
  return { filas, errores };
}
