// Calcular y guardar los resultados de un corte (fase 2 de la revisión,
// docs/propuesta-revision-del-laboratorio.md 10.5 y 10.6).
//
// Hasta la 111 la base calculaba el desempeño, las variables y la
// estabilidad, y el navegador calculaba lo demás sin guardarlo. Ahora la
// estadística es una sola (estadistica.js, a través de resultadosDelCorte.js)
// y todo lo que se calcula queda en lab_resultados con su huella: la base sólo
// cuenta (lab_contar_*) y guarda.

import { supabase } from "./supabaseClient.js";
import { guardarResultado, getCamposDeshabilitados } from "./laboratorio.js";
import { getFilasDelCorte, getCatalogoUnaVez } from "./datosDelCorte.js";
import {
  VERSION_DEL_CALCULO, huellaDe, desempenoDelCorte, variablesDelCorte, estabilidadDelPuntaje, CON_ESTADISTICA, resumir, tamanoDe,
} from "./resultadosDelCorte.js";

function fallar(error) {
  throw new Error([error?.message, error?.details, error?.hint].filter(Boolean).join(" · ") || "Error desconocido");
}

// Lo que ya se guardó en esta sesión: una pestaña que se vuelve a mirar no
// vuelve a pedir el guardado (igual la base no lo repetiría: la huella).
const yaGuardadas = new Set();

// Guarda un resultado con su huella. Si ya estaba (mismo corte, tipo,
// población, parámetros y versión del cálculo), no hace nada: el corte está
// congelado y el número es el mismo.
export async function guardarCalculo({ corteId, tipo, poblacion = null, parametros = {}, resultado, metodologia = {}, n, nMalos, origen = "navegador" }) {
  const huella = await huellaDe({ corteId, tipo, poblacion, parametros });
  if (yaGuardadas.has(huella)) return huella;
  const resumen = resumir(tipo, resultado);
  const tamano = tamanoDe(resumen);
  await guardarResultado({
    corteId, tipo, huella, origen, resultado: resumen,
    metodologia: { version: VERSION_DEL_CALCULO[tipo] ?? 1, calculado_en: origen, poblacion, parametros, ...metodologia },
    n: n ?? tamano.n, nMalos: nMalos ?? tamano.nMalos,
  });
  yaGuardadas.add(huella);
  return huella;
}

const CONTAR = {
  matriz: "lab_contar_matriz",
  cuadrantes: "lab_contar_cuadrantes",
  motivos: "lab_contar_motivos",
  calificacion_simulacion: "lab_contar_calificacion",
};

const METODOLOGIA = {
  desempeno: { auc: "rangos (Mann-Whitney), empates a la mitad, sin bloqueados", intervalo_auc: "Hanley-McNeil 95%", intervalo_tasa: "Wilson 95%", tramos: "de a 100 puntos" },
  variables: { iv: "WoE con suavizado 0,5; cuartiles sobre valores distintos (un empate nunca se parte); tramo propio para el cero si es 10% o más; una persona una vez", umbrales: { nada: 0.02, debil: 0.1, media: 0.3, sospecha_de_fuga: 0.5 } },
  estabilidad: { tramos: "de a 100 puntos", suavizado: 0.5 },
  matriz: { lecturas: "una: negar y bloqueado = impago; aprobar y revisar = no impago (decisión del negocio del 2026-10-06)", intervalo_tasa: "Wilson 95%" },
  cuadrantes: { aprobado: "aprobar o revisar", intervalo_tasa: "Wilson 95%" },
  motivos: { el_modelo_lo_vio: "dijo negar (o el bloqueo); revisar = no impago", intervalo_tasa: "Wilson 95%" },
  calificacion_simulacion: { auc: "contra el impago plantado, sin bloqueados" },
};

// El botón "Calcular" de una pestaña de un corte.
export async function calcular(corte, tipo, { poblacion = "operaciones" } = {}) {
  const esSintetico = Boolean(corte.es_sintetico);
  let resultado;
  let pob = null;
  if (tipo === "desempeno") {
    resultado = desempenoDelCorte(await getFilasDelCorte(corte.id, "operaciones"), { esSintetico });
  } else if (tipo === "variables") {
    pob = poblacion;
    const [filas, catalogo, apagados] = await Promise.all([getFilasDelCorte(corte.id, poblacion), getCatalogoUnaVez(), getCamposDeshabilitados()]);
    resultado = variablesDelCorte(filas, catalogo, apagados, { poblacion, esSintetico });
  } else if (CONTAR[tipo]) {
    const { data, error } = await supabase.rpc(CONTAR[tipo], { p_corte: corte.id });
    if (error) fallar(error);
    resultado = CON_ESTADISTICA[tipo](data);
  } else {
    throw new Error(`No hay cálculo para "${tipo}"`);
  }
  const extra = tipo === "calificacion_simulacion" ? { n: resultado.n, nMalos: resultado.n_malos_plantados } : {};
  await guardarCalculo({ corteId: corte.id, tipo, poblacion: pob, resultado, metodologia: METODOLOGIA[tipo], origen: "navegador", ...extra });
  return resultado;
}

// PSI del puntaje de este corte contra otro (se guarda en este, con el otro
// como parámetro).
export async function calcularEstabilidad(baseId, nuevoId) {
  const [base, nuevo] = await Promise.all([getFilasDelCorte(baseId, "operaciones"), getFilasDelCorte(nuevoId, "operaciones")]);
  const resultado = estabilidadDelPuntaje(base, nuevo);
  await guardarCalculo({ corteId: nuevoId, tipo: "estabilidad", parametros: { base: baseId }, resultado, metodologia: { ...METODOLOGIA.estabilidad, base: baseId } });
  return resultado;
}
