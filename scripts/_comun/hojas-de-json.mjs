// Convierte una respuesta JSON cualquiera en las hojas de un Excel: lo que
// devuelve el servicio decide las hojas, no un esquema escrito de antemano
// (sobre Equifax se escribió antes de ver una sola respuesta real).
//
//   Resumen     todos los campos sueltos (los que no están dentro de una lista
//               de objetos), uno por fila: Campo | Valor
//   <ruta>      una hoja por cada lista de objetos, en cualquier profundidad:
//               una fila por elemento, con sus campos aplanados con puntos.
//               Una lista dentro de otra tiene su propia hoja y una columna
//               "fila padre" que dice de qué fila viene.
//   Estructura  el inventario: ruta, tipo y cantidad de cada nodo. Es lo que
//               hace falta para diseñar la estructura estandarizada.
//
// Sin dependencias: devuelve filas, y quien llama las vuelca con xlsx.
//
// AVISO: este archivo no pasa por lint ni build.

const MAX_CELDA = 32000; // Excel corta en 32.767 caracteres por celda

const esObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const esEscalar = (v) => v === null || typeof v !== "object";

function celda(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.length > MAX_CELDA ? v.slice(0, MAX_CELDA) + "…" : v;
  return v;
}

export function jsonAHojas(cuerpo) {
  const resumen = {};                  // campo -> valor
  const tablas = new Map();            // ruta de la lista -> filas
  const estructura = new Map();        // ruta -> { tipo, cantidad }

  const nota = (ruta, tipo, cantidad = "") => {
    if (ruta && !estructura.has(ruta)) estructura.set(ruta, { tipo, cantidad });
  };

  // `completa` es la ruta desde la raíz (nombra la hoja); `local` es la ruta
  // dentro de la fila actual (nombra la columna); `plano` es la fila (o el
  // resumen) que se va llenando; `padre` es la referencia a la fila de afuera.
  function recorrer(valor, completa, local, plano, padre) {
    if (esObjeto(valor)) {
      nota(completa, "objeto", Object.keys(valor).length);
      for (const [k, v] of Object.entries(valor)) {
        recorrer(v, completa ? `${completa}.${k}` : k, local ? `${local}.${k}` : k, plano, padre);
      }
    } else if (Array.isArray(valor)) {
      if (valor.every(esEscalar)) {
        // Una lista de valores sueltos cabe en una celda.
        nota(completa, "lista de valores", valor.length);
        plano[local || "(valor)"] = celda(valor.map((x) => (x === null ? "" : String(x))).join("; "));
      } else {
        nota(completa, "lista de objetos", valor.length);
        const filas = tablas.get(completa) ?? [];
        tablas.set(completa, filas);
        valor.forEach((el, i) => {
          const fila = { "#": i + 1 };
          if (padre) fila["fila padre"] = padre;
          const ref = `${completa} #${i + 1}`;
          if (esEscalar(el)) fila.valor = celda(el);
          else recorrer(el, completa, "", fila, ref);
          filas.push(fila);
        });
      }
    } else {
      nota(completa, valor === null ? "vacío" : typeof valor);
      plano[local || "(valor)"] = celda(valor);
    }
  }

  recorrer(cuerpo, "", "", resumen, null);

  return {
    resumen: Object.entries(resumen).map(([campo, valor]) => ({ Campo: campo, Valor: valor })),
    tablas,
    estructura: [...estructura].map(([ruta, { tipo, cantidad }]) => ({ Ruta: ruta, Tipo: tipo, Cantidad: cantidad })),
  };
}

// Nombre de hoja válido en Excel: hasta 31 caracteres, sin []:*?/\ y sin repetir.
// Se usa el último tramo de la ruta ("deuda_historica", no
// "reporteCrediticio.deuda_historica"): es lo que dice qué es la hoja, y cortar
// una ruta larga por el principio dejaba nombres a medias ("porteCrediticio…").
// Si ese nombre ya existe se le suman tramos de adelante, y si aun así no
// alcanza se numera. La hoja "Índice" dice la ruta completa de cada una.
export function nombreDeHoja(ruta, usados) {
  const limpio = (s) => s.replace(/[[\]:*?/\\]/g, "-");
  const tramos = String(ruta || "(raíz)").split(".").map(limpio).filter(Boolean);
  const libre = (n) => !usados.has(n.toLowerCase());
  let nombre = null;
  for (let desde = tramos.length - 1; desde >= 0 && nombre === null; desde--) {
    const candidato = tramos.slice(desde).join(".").slice(0, 31);
    if (libre(candidato)) nombre = candidato;
  }
  if (nombre === null) {
    const base = tramos.join(".").slice(0, 28);
    for (let n = 2; nombre === null; n++) {
      const candidato = `${base.slice(0, 31 - String(n).length - 1)}~${n}`;
      if (libre(candidato)) nombre = candidato;
    }
  }
  usados.add(nombre.toLowerCase());
  return nombre;
}
