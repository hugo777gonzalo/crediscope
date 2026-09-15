import * as XLSX from "xlsx";
import { clasificarIdentificacion } from "../../supabase/functions/_shared/identificacion.ts";

// Lee un archivo cargado y decide qué es cada línea, ANTES de consultar
// nada.
//
// Por qué antes: una consulta que no va a encontrar nada igual ocupa un
// lugar en la cola, tarda cuarenta segundos y ensucia el resultado con
// un error que no era de la consulta sino del archivo. Revisar primero
// convierte "1.200 cédulas, 340 fallaron" en "1.150 para consultar y 50
// que hay que corregir en la planilla" -- que es lo mismo, pero se
// puede accionar.
//
// QUÉ ACEPTA
//
// Cualquier planilla. No se pide un formato ni una plantilla: se busca
// la columna que tenga cédulas. Pedir una plantilla es trasladarle al
// usuario el trabajo de adaptarse al programa, cuando el programa puede
// adaptarse solo.

const EXTENSIONES = [".xlsx", ".xls", ".csv", ".txt"];

export function extensionAceptada(nombre) {
  return EXTENSIONES.some((e) => nombre.toLowerCase().endsWith(e));
}

// Elige la columna que más parece de identificaciones. Se prueba por
// contenido y no por el nombre del encabezado: los archivos reales
// dicen "CEDULA", "Cédula", "IDENTIFICACION", "doc", o no dicen nada.
function elegirColumna(filas) {
  if (filas.length === 0) return null;
  const columnas = new Set();
  for (const f of filas.slice(0, 50)) for (const k of Object.keys(f)) columnas.add(k);

  let mejor = null;
  let mejorPuntaje = 0;
  for (const col of columnas) {
    let válidas = 0;
    let conDatos = 0;
    for (const f of filas) {
      const v = String(f[col] ?? "").trim();
      if (!v) continue;
      conDatos++;
      const t = clasificarIdentificacion(v).tipo;
      if (t === "cedula" || t === "ruc_persona_natural") válidas++;
    }
    // Se exige que la mayoría de lo que hay en la columna parezca una
    // identificación: una columna de montos puede tener números de 10
    // dígitos por casualidad, pero no en proporción.
    const puntaje = conDatos > 0 ? válidas / conDatos : 0;
    if (puntaje > mejorPuntaje && puntaje >= 0.5) {
      mejorPuntaje = puntaje;
      mejor = col;
    }
  }
  return mejor;
}

/**
 * Devuelve los ítems listos para guardar y el recuento que se le muestra
 * a la persona antes de arrancar.
 *
 * Las repetidas se marcan pero NO se borran: quien cargó el archivo
 * tiene que poder ver cuáles eran y en qué fila estaban.
 */
export async function leerArchivoDeLote(archivo) {
  const buffer = await archivo.arrayBuffer();
  const libro = XLSX.read(buffer, { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja con datos.");

  // defval mantiene las celdas vacías, para que el número de fila que se
  // informa sea el mismo que la persona ve en su planilla.
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: "", raw: false });
  if (filas.length === 0) throw new Error("La hoja está vacía.");

  const columna = elegirColumna(filas);
  if (!columna) {
    throw new Error(
      "No se encontró ninguna columna con cédulas. Revisá que el archivo tenga una columna de identificaciones."
    );
  }

  const vistas = new Map();
  const items = [];

  filas.forEach((f, i) => {
    const crudo = String(f[columna] ?? "").trim();
    if (!crudo) return;
    // +2: la fila 1 es el encabezado y las planillas cuentan desde 1.
    const fila = i + 2;
    const ident = clasificarIdentificacion(crudo);

    if (!ident.consultable) {
      items.push({
        ingresado: crudo,
        fila,
        cedula: null,
        tipo: ident.tipo,
        estado: "descartado",
        motivo: ident.mensaje,
      });
      return;
    }

    const yaEstaba = vistas.get(ident.cedula);
    if (yaEstaba) {
      items.push({
        ingresado: crudo,
        fila,
        cedula: ident.cedula,
        tipo: ident.tipo,
        estado: "duplicado",
        motivo: `Ya venía en la fila ${yaEstaba}. Se consulta una sola vez.`,
      });
      return;
    }

    vistas.set(ident.cedula, fila);
    items.push({
      ingresado: crudo,
      fila,
      cedula: ident.cedula,
      tipo: ident.tipo,
      estado: "pendiente",
      motivo: ident.tipo === "ruc_persona_natural" ? `Es un RUC de persona natural: se consulta la cédula ${ident.cedula}.` : null,
    });
  });

  const porTipo = {};
  for (const it of items) porTipo[it.tipo] = (porTipo[it.tipo] ?? 0) + 1;

  return {
    columna,
    items,
    totales: {
      lineas: items.length,
      validas: items.filter((i) => i.estado === "pendiente").length,
      duplicadas: items.filter((i) => i.estado === "duplicado").length,
      descartadas: items.filter((i) => i.estado === "descartado").length,
      rucPersonaNatural: items.filter((i) => i.tipo === "ruc_persona_natural" && i.estado === "pendiente").length,
      porTipo,
    },
  };
}
