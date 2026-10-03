// La planilla que entrega la IFI para el Laboratorio (sección 6.3 del
// diseño) y su lectura.
//
// Pide fechas y días de mora por ventana, no una marca de default: con una
// marca no hay ventanas ni madurez, y un crédito de 3 meses sin mora contaba
// como "pagó" (error 1 de Retroalimentación). Con los días de mora, la
// definición de default la ponemos nosotros y se puede cambiar sin pedir
// otro archivo.
//
// La lectura no adivina: una fila con un dato que no se entiende se
// rechaza con su motivo, y la pantalla las muestra antes de aceptar nada.

import * as XLSX from "xlsx";
import { clasificarIdentificacion } from "../../supabase/functions/_shared/identificacion.ts";

const ESTADOS = {
  vigente: "vigente",
  cancelada: "cancelada",
  castigada: "castigada",
  reestructurada: "reestructurada",
  vencida: "vencida",
  "en demanda judicial": "judicial",
  judicial: "judicial",
};

export const COLUMNAS = [
  { clave: "cedula", titulo: "Cédula", ancho: 14, obligatoria: true },
  { clave: "numero_operacion", titulo: "Número de operación", ancho: 20, obligatoria: true },
  { clave: "producto", titulo: "Producto", ancho: 16, obligatoria: true },
  { clave: "monto", titulo: "Monto desembolsado", ancho: 18, obligatoria: true },
  { clave: "plazo_meses", titulo: "Plazo en meses", ancho: 14, obligatoria: true },
  { clave: "fecha_desembolso", titulo: "Fecha de desembolso", ancho: 18, obligatoria: true },
  { clave: "estado_operacion", titulo: "Estado al corte", ancho: 22, obligatoria: true },
  { clave: "dias_mora_max_12m", titulo: "Máximo de días de mora en los primeros 12 meses", ancho: 20 },
  { clave: "dias_mora_max_24m", titulo: "Máximo de días de mora en los primeros 24 meses", ancho: 20 },
  { clave: "fecha_primer_default", titulo: "Fecha del primer impago", ancho: 18 },
  { clave: "observaciones", titulo: "Observaciones", ancho: 40 },
];

const INSTRUCCIONES = [
  ["Planilla de resultados de crédito para el Laboratorio de Riesgo"],
  [],
  ["Una fila por operación (crédito). Una persona con dos créditos va en dos filas."],
  ["Columnas obligatorias: Cédula, Número de operación, Producto, Monto desembolsado, Plazo en meses, Fecha de desembolso y Estado al corte."],
  [],
  ["Fechas: AAAA-MM-DD (2025-03-14) o DD/MM/AAAA (14/03/2025)."],
  ['Estado al corte: Vigente, Cancelada, Castigada, Reestructurada, Vencida o "En demanda judicial".'],
  [],
  ["Días de mora: el máximo atraso que tuvo la operación dentro de esa ventana, contada desde el desembolso."],
  ["Si la operación todavía no cumplió 12 (o 24) meses a la fecha de corte del archivo, dejen esa celda VACÍA: no es un cero."],
  ["Un cero dice que se observó la ventana completa y nunca se atrasó."],
  [],
  ["Fecha del primer impago: opcional; si la tienen, permite medir cuánto tardó en caer."],
  ["Observaciones: opcional; lo que el área de crédito sepa del caso."],
];

export function descargarPlantilla() {
  const libro = XLSX.utils.book_new();
  const instrucciones = XLSX.utils.aoa_to_sheet(INSTRUCCIONES);
  instrucciones["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(libro, instrucciones, "Instrucciones");
  const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS.map((c) => c.titulo)]);
  hoja["!cols"] = COLUMNAS.map((c) => ({ wch: c.ancho }));
  XLSX.utils.book_append_sheet(libro, hoja, "Operaciones");
  XLSX.writeFile(libro, "plantilla-laboratorio-riesgo.xlsx");
}

const texto = (v) => String(v ?? "").trim();

function aNumero(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const t = texto(v).replace(/[^\d.,-]/g, "");
  // "1.234,56" y "1,234.56": el último separador es el decimal.
  const normal = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

function aFechaISO(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const t = texto(v);
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "invalida";
}

const sumarMeses = (iso, meses) => {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1 + meses, d));
  return f.toISOString().slice(0, 10);
};

// fechaCorte: la del archivo (AAAA-MM-DD). Hace falta para saber qué
// ventanas tiene que traer cada operación.
export async function leerPlanilla(archivo, fechaCorte) {
  const libro = XLSX.read(await archivo.arrayBuffer(), { cellDates: true });
  const nombre = libro.SheetNames.includes("Operaciones") ? "Operaciones" : libro.SheetNames.find((n) => n !== "Instrucciones") ?? libro.SheetNames[0];
  const crudas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { defval: "" });
  const porTitulo = Object.fromEntries(COLUMNAS.map((c) => [c.titulo.toLowerCase(), c.clave]));

  const titulos = Object.keys(crudas[0] ?? {}).map((t) => t.trim().toLowerCase());
  const faltan = COLUMNAS.filter((c) => c.obligatoria && !titulos.includes(c.titulo.toLowerCase())).map((c) => c.titulo);
  if (faltan.length) return { operaciones: [], errores: [{ fila: 1, operacion: "", motivo: `Faltan columnas: ${faltan.join(", ")}` }], leidas: crudas.length };

  const operaciones = [];
  const errores = [];
  const vistas = new Set();
  crudas.forEach((cruda, i) => {
    const fila = {};
    for (const [t, v] of Object.entries(cruda)) {
      const clave = porTitulo[t.trim().toLowerCase()];
      if (clave) fila[clave] = v;
    }
    if (COLUMNAS.every((c) => texto(fila[c.clave]) === "")) return; // fila vacía
    const n = i + 2; // la fila 1 son los títulos
    const op = texto(fila.numero_operacion);
    const mal = (motivo) => errores.push({ fila: n, operacion: op, motivo });

    const ident = clasificarIdentificacion(texto(fila.cedula));
    if (!ident.consultable || !ident.cedula) return mal(`Cédula inválida (${ident.mensaje ?? texto(fila.cedula)})`);
    if (!op) return mal("Falta el número de operación");
    if (vistas.has(op)) return mal("Número de operación repetido en el archivo");
    if (!texto(fila.producto)) return mal("Falta el producto");
    const monto = aNumero(fila.monto);
    if (!(monto > 0)) return mal("El monto tiene que ser un número mayor que cero");
    const plazo = aNumero(fila.plazo_meses);
    if (!(Number.isInteger(plazo) && plazo > 0)) return mal("El plazo tiene que ser un número entero de meses");
    const desembolso = aFechaISO(fila.fecha_desembolso);
    if (!desembolso || desembolso === "invalida") return mal("Fecha de desembolso ausente o ilegible");
    if (fechaCorte && desembolso > fechaCorte) return mal("El desembolso es posterior a la fecha de corte");
    const estado = ESTADOS[texto(fila.estado_operacion).toLowerCase()];
    if (!estado) return mal(`Estado no reconocido: "${texto(fila.estado_operacion)}"`);

    const d12 = aNumero(fila.dias_mora_max_12m);
    const d24 = aNumero(fila.dias_mora_max_24m);
    if (Number.isNaN(d12) || Number.isNaN(d24) || (d12 !== null && d12 < 0) || (d24 !== null && d24 < 0)) return mal("Los días de mora tienen que ser números de 0 en adelante");
    const madura12 = fechaCorte ? sumarMeses(desembolso, 12) <= fechaCorte : true;
    const madura24 = fechaCorte ? sumarMeses(desembolso, 24) <= fechaCorte : true;
    if (d12 !== null && !madura12) return mal("Trae días de mora a 12 meses pero no cumplió 12 meses al corte (dejar vacío)");
    if (d24 !== null && !madura24) return mal("Trae días de mora a 24 meses pero no cumplió 24 meses al corte (dejar vacío)");
    if (d12 !== null && d24 !== null && d24 < d12) return mal("El máximo a 24 meses no puede ser menor que el de 12 meses");
    const primerImpago = aFechaISO(fila.fecha_primer_default);
    if (primerImpago === "invalida") return mal("Fecha del primer impago ilegible");

    vistas.add(op);
    operaciones.push({
      cedula: ident.cedula,
      numero_operacion: op,
      producto: texto(fila.producto).toLowerCase(),
      monto,
      plazo_meses: plazo,
      fecha_desembolso: desembolso,
      estado_operacion: estado,
      dias_mora_max_12m: d12,
      dias_mora_max_24m: d24,
      fecha_primer_default: primerImpago,
      observaciones: texto(fila.observaciones) || null,
    });
  });
  return { operaciones, errores, leidas: crudas.length };
}
