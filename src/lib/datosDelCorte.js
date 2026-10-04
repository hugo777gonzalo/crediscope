// Las filas de un corte, listas para la estadística del navegador (decisión
// 2 de docs/laboratorio-pantallas.md). Un corte congelado no cambia, así que
// se baja una vez por sesión y población y lo comparten todas las pestañas.
// La forma de cada fila está en filasDelCorte.js.

import { supabase } from "./supabaseClient.js";
import { traerTodas } from "./paginar.js";
import { getCatalogo } from "./laboratorio.js";
import { SELECT_OPERACIONES, SELECT_SOLICITUDES, normalizarOperacion, normalizarSolicitud } from "./filasDelCorte.js";

export { filasObservadas, filasConPuntaje, mesesEntre, mesDe } from "./filasDelCorte.js";

const cache = new Map();

// El catálogo de variables también se pide una vez por sesión.
let catalogo = null;
export function getCatalogoUnaVez() {
  if (!catalogo) catalogo = getCatalogo().catch((e) => { catalogo = null; throw e; });
  return catalogo;
}

export function getFilasDelCorte(corteId, poblacion = "operaciones") {
  const clave = `${corteId}|${poblacion}`;
  if (!cache.has(clave)) {
    // Si falla, se olvida: el próximo intento vuelve a pedir.
    cache.set(clave, cargar(corteId, poblacion).catch((e) => { cache.delete(clave); throw e; }));
  }
  return cache.get(clave);
}

async function cargar(corteId, poblacion) {
  const solicitudes = poblacion === "solicitudes";
  const { filas } = await traerTodas((o) =>
    supabase
      .from(solicitudes ? "lab_corte_solicitudes" : "lab_corte_operaciones")
      .select(solicitudes ? SELECT_SOLICITUDES : SELECT_OPERACIONES, o)
      .eq("corte_id", corteId)
      .order(solicitudes ? "solicitud_id" : "operacion_id"),
  );
  return filas.map(solicitudes ? normalizarSolicitud : normalizarOperacion);
}
