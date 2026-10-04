// Datos del Laboratorio de Inteligencia de Negocio › Riesgo de Crédito.
// Diseño: docs/laboratorio-de-riesgo.md. Todo es sólo de admin (RLS) y
// los cálculos los hace la base (funciones lab_*): acá sólo se piden.

import { supabase } from "./supabaseClient.js";
import { traerTodas } from "./paginar.js";

// Un error de PostgREST es un objeto plano: String(err) lo aplasta.
function fallar(error) {
  const e = new Error([error?.message, error?.details, error?.hint].filter(Boolean).join(" · ") || "Error desconocido");
  e.code = error?.code;
  throw e;
}

// ------------------------------------------------------------- cargas
export async function getCargas() {
  const { data, error } = await supabase
    .from("lab_cargas")
    .select("id, etiqueta, institucion, origen, es_sintetica, fecha_corte, estado, conciliacion, errores, created_at, cerrada_en")
    .order("created_at", { ascending: false });
  if (error) fallar(error);
  return data ?? [];
}

export async function getCarga(id) {
  const { data, error } = await supabase.from("lab_cargas").select("*").eq("id", id).single();
  if (error) fallar(error);
  return data;
}

export async function getDefiniciones() {
  const { data, error } = await supabase.from("lab_definiciones_default").select("*").order("created_at");
  if (error) fallar(error);
  return data ?? [];
}

// La carga es atómica por estado, no por un insert gigante: nace en
// "cargando", las operaciones entran de a 500, y lab_cerrar_carga() la
// vincula, la concilia y la pasa a "lista". Si algo falla a mitad de
// camino queda en "cargando" y nada la usa (en Retroalimentación, un
// paquete podía quedar con totales y sin créditos).
export async function subirCarga({ etiqueta, institucion, fechaCorte, archivo, operaciones, decisiones = [] }, alAvanzar = () => {}) {
  const { data: sesion } = await supabase.auth.getUser();
  const { data: carga, error } = await supabase
    .from("lab_cargas")
    .insert({ etiqueta, institucion: institucion || null, origen: "ifi", es_sintetica: false, fecha_corte: fechaCorte, archivo_nombre: archivo?.name ?? null, cargada_por: sesion?.user?.id ?? null })
    .select("id")
    .single();
  if (error) fallar(error);

  if (archivo) {
    const ruta = `${carga.id}/${archivo.name}`;
    const { error: errArchivo } = await supabase.storage.from("lab-archivos").upload(ruta, archivo, { upsert: false });
    if (errArchivo) fallar(errArchivo);
    const { error: errRuta } = await supabase.from("lab_cargas").update({ archivo_ruta: ruta }).eq("id", carga.id);
    if (errRuta) fallar(errRuta);
  }

  for (let i = 0; i < operaciones.length; i += 500) {
    const tanda = operaciones.slice(i, i + 500).map((o) => ({ ...o, carga_id: carga.id }));
    const { error: errOps } = await supabase.from("lab_operaciones").insert(tanda);
    if (errOps) fallar(errOps);
    alAvanzar(Math.min(i + 500, operaciones.length), operaciones.length);
  }
  // Lo que decidió la institución con lo que no desembolsó (hoja opcional).
  for (let i = 0; i < decisiones.length; i += 500) {
    const { error: errDec } = await supabase.from("lab_decisiones_institucion").insert(decisiones.slice(i, i + 500).map((d) => ({ ...d, carga_id: carga.id })));
    if (errDec) fallar(errDec);
  }
  const { error: errCierre } = await supabase.rpc("lab_cerrar_carga", { p_carga: carga.id });
  if (errCierre) fallar(errCierre);
  return carga.id;
}

export async function anularCarga(id) {
  const { data, error } = await supabase.from("lab_cargas").update({ estado: "anulada" }).eq("id", id).select("id");
  if (error) fallar(error);
  // Una actualización bloqueada por RLS no da error: devuelve 0 filas.
  if (!data?.length) throw new Error("No se pudo anular la carga (¿sesión de admin?).");
}

// Las operaciones de una carga, de a páginas (una carga real pasa las 1.000).
export async function getOperacionesDeCarga(cargaId) {
  const { filas } = await traerTodas((o) =>
    supabase
      .from("lab_operaciones")
      .select("numero_operacion, cedula, producto, monto, fecha_desembolso, estado_operacion, vinculo, analisis_fallido, dias_consulta_desembolso", o)
      .eq("carga_id", cargaId)
      .order("numero_operacion")
      .order("id"),
  );
  return filas;
}

// -------------------------------------------------------------- cortes
export async function getCortes() {
  const { data, error } = await supabase
    .from("lab_cortes")
    .select("id, nombre, carga_ids, ventana_meses, filtros, es_sintetico, resumen, congelado_en, definicion_default_id")
    .order("congelado_en", { ascending: false });
  if (error) fallar(error);
  return data ?? [];
}

export async function getCorte(id) {
  const { data, error } = await supabase.from("lab_cortes").select("*, lab_definiciones_default(nombre)").eq("id", id).single();
  if (error) fallar(error);
  return data;
}

export async function congelarCorte({ nombre, cargas, definicion, ventana, filtros }) {
  const { data, error } = await supabase.rpc("lab_congelar_corte", {
    p_nombre: nombre, p_cargas: cargas, p_definicion: definicion, p_ventana: ventana, p_filtros: filtros ?? {},
  });
  if (error) fallar(error);
  return data;
}

// El último resultado de cada tipo; los anteriores quedan (nunca se pisan).
export async function getResultados(corteId) {
  const { data, error } = await supabase
    .from("lab_resultados")
    .select("id, tipo, metodologia, resultado, n, n_malos, created_at")
    .eq("corte_id", corteId)
    .order("created_at", { ascending: false });
  if (error) fallar(error);
  return data ?? [];
}

const FUNCION = {
  desempeno: "lab_calcular_desempeno",
  variables: "lab_calcular_variables",
  matriz: "lab_calcular_matriz",
  cuadrantes: "lab_calcular_cuadrantes",
  motivos: "lab_calcular_motivos",
  calificacion_simulacion: "lab_calificar_simulacion",
};
// `extra`: parámetros propios de un cálculo (la población de Variables).
export async function calcular(corteId, tipo, extra = {}) {
  const { data, error } = await supabase.rpc(FUNCION[tipo], { p_corte: corteId, ...extra });
  if (error) fallar(error);
  return data;
}

export async function simularPolitica(corteId, regla) {
  const { data, error } = await supabase.rpc("lab_simular_politica", { p_corte: corteId, p_regla: regla });
  if (error) fallar(error);
  return data;
}

export async function getCatalogo() {
  const { data, error } = await supabase.from("lab_catalogo_variables").select("*").eq("activa", true).order("grupo").order("nombre");
  if (error) fallar(error);
  return data ?? [];
}

// Las operaciones del corte para la pestaña Casos, con lo que hace falta
// para seguirlas hasta el análisis.
export async function getCasos(corteId) {
  const { filas } = await traerTodas((o) =>
    supabase
      .from("lab_corte_operaciones")
      .select("operacion_id, cedula, producto, monto, fecha_desembolso, incluida, motivo_exclusion, malo, fuente_puntaje, puntaje, recomendacion, marco_version, veredicto_origen, analysis_result_id, client_profile_id", o)
      .eq("corte_id", corteId)
      .order("cedula")
      .order("operacion_id"),
  );
  return filas;
}

// ---------------------------------------------------------- propuestas
export async function getPropuestas() {
  const { data, error } = await supabase.from("lab_propuestas").select("*, lab_cortes(nombre, es_sintetico)").order("created_at", { ascending: false });
  if (error) fallar(error);
  return data ?? [];
}

export async function guardarPropuesta(propuesta) {
  const { data: sesion } = await supabase.auth.getUser();
  const fila = { ...propuesta };
  delete fila.lab_cortes;
  const consulta = fila.id
    ? supabase.from("lab_propuestas").update(fila).eq("id", fila.id)
    : supabase.from("lab_propuestas").insert({ ...fila, creada_por: sesion?.user?.id ?? null });
  const { data, error } = await consulta.select("id");
  if (error) fallar(error);
  if (!data?.length) throw new Error("No se guardó la propuesta (¿sesión de admin?).");
  return data[0].id;
}

export async function cambiarEstadoPropuesta(id, estado, comentario) {
  const { data: sesion } = await supabase.auth.getUser();
  const cambios = { estado };
  if (["revisada", "aprobada", "rechazada"].includes(estado)) {
    cambios.revisada_por = sesion?.user?.id ?? null;
    cambios.revisada_en = new Date().toISOString();
    if (comentario !== undefined) cambios.comentario_revisor = comentario || null;
  }
  const { data, error } = await supabase.from("lab_propuestas").update(cambios).eq("id", id).select("id");
  if (error) fallar(error);
  if (!data?.length) throw new Error("No se cambió el estado (¿sesión de admin?).");
}

export async function ponerEnVigencia(id, vigente) {
  const { error } = await supabase.rpc("lab_poner_en_vigencia", { p_propuesta: id, p_vigente: vigente });
  if (error) fallar(error);
}

// ------------------------------------------------------------ criterio
export async function getVersionesCriterio() {
  const { data, error } = await supabase.from("criterio_versiones").select("*").order("numero", { ascending: false });
  if (error) fallar(error);
  return data ?? [];
}

// Cuántos análisis corrieron con cada versión, contado en la base (082):
// bajarlos todos para contarlos en el navegador se cortaba en 1.000.
export async function getUsoPorVersion() {
  const { data, error } = await supabase.rpc("analisis_por_version_del_criterio");
  if (error) fallar(error);
  return Object.fromEntries(Object.entries(data ?? {}).map(([id, n]) => [id, Number(n)]));
}

export async function revertirCriterio(versionId) {
  const { error } = await supabase.rpc("revertir_criterio", { p_version_id: versionId });
  if (error) fallar(error);
}

export async function desactivarTodosLosAjustes() {
  const { error } = await supabase.rpc("desactivar_todos_los_ajustes");
  if (error) fallar(error);
}
