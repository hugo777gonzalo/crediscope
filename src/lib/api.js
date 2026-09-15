import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { inicioDelDia, finDelDia, diaEcuador, formatearFecha } from "./fechas.js";

// Base de las Edge Functions. Si Supabase está configurado, se calcula
// de VITE_SUPABASE_URL; si no, se puede fijar VITE_FUNCTIONS_URL a mano
// (por defecto, el puerto local de `supabase functions serve`) — así el
// explorador se puede probar contra funciones corriendo en local sin
// tocar las desplegadas.
const FUNCTIONS_URL =
  import.meta.env.VITE_FUNCTIONS_URL ||
  (isSupabaseConfigured ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : "http://localhost:54321/functions/v1");

// Llama a la Edge Function `analyze-client`, que corre los controles de
// bloqueo + el scoring por LLM, y persiste el resultado. El mismo
// endpoint sirve como API para sistemas externos (ver
// supabase/functions/analyze-client/index.ts). `profileId` (opcional):
// id de un client_profiles ya generado por structureClient — si viene,
// se reutiliza ese Perfil del Cliente en vez de volver a consultar
// Novadata (ver "Análisis con IA").
export async function analyzeClient(cedula, { profileId } = {}) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado.");
  }
  const { data, error } = await supabase.functions.invoke("analyze-client", {
    body: { cedula, profileId },
  });
  if (error) throw error;
  return data;
}

// Llama a la Edge Function `structure-client`: ingesta -> estructura
// estandarizada -> persiste en client_profiles. NO pasa por el LLM.
// Usa las credenciales de Novadata de las secrets de la función (el
// usuario no las escribe acá) — a diferencia de explore-novadata, esto
// sí requiere sesión y sí persiste.
export async function structureClient(cedula) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase no está configurado.");
  }
  const { data, error } = await supabase.functions.invoke("structure-client", {
    body: { cedula },
  });
  if (error) throw error;
  return data;
}

export async function getLatestProfile(cedula) {
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, cedula")
    .eq("cedula", cedula)
    .maybeSingle();
  if (clientError) throw clientError;
  if (!client) return null;

  const { data: result, error: resultError } = await supabase
    .from("client_profiles")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (resultError) throw resultError;
  return result;
}

export async function getLatestAnalysis(cedula) {
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, cedula")
    .eq("cedula", cedula)
    .maybeSingle();
  if (clientError) throw clientError;
  if (!client) return null;

  const { data: result, error: resultError } = await supabase
    .from("analysis_results")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (resultError) throw resultError;
  return result;
}

// ---------- Historial ----------
// A diferencia de getLatestProfile/getLatestAnalysis (que solo traen lo
// más reciente para Perfil del Cliente/Análisis con IA), esto trae TODA
// la línea de tiempo de un cliente para el visor histórico de solo
// lectura — ver src/pages/Historial.jsx.

export async function getHistorialCliente(cedula) {
  const { data: client, error: clientError } = await supabase.from("clients").select("id, cedula").eq("cedula", cedula).maybeSingle();
  if (clientError) throw clientError;
  if (!client) return { client: null, eventos: [] };

  const [{ data: perfiles, error: perfilesError }, { data: analisis, error: analisisError }] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("id, created_at, structure_version")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("analysis_results")
      .select("id, created_at, crediscope_score, recomendacion, rules_version, fallo_tipo")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
  ]);
  if (perfilesError) throw perfilesError;
  if (analisisError) throw analisisError;

  const eventos = [
    ...(perfiles || []).map((p) => ({ tipo: "perfil", id: p.id, created_at: p.created_at, version: p.structure_version })),
    ...(analisis || []).map((a) => ({
      tipo: "analisis",
      id: a.id,
      created_at: a.created_at,
      version: a.rules_version,
      score: a.crediscope_score,
      recomendacion: a.recomendacion,
      falloTipo: a.fallo_tipo,
    })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return { client, eventos };
}

// Perfil del Cliente por id (snapshot puntual, no "el más reciente") —
// incluye la cédula del cliente vía join para el header del visor.
export async function getPerfilPorId(id) {
  const { data, error } = await supabase.from("client_profiles").select("*, clients(cedula)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// Análisis con IA por id (snapshot puntual). Desde la 032 el análisis
// referencia el perfil con el que se hizo (client_profile_id); el visor
// de Historial todavía muestra solo el resultado, sin los segmentos.
export async function getAnalisisPorId(id) {
  const { data, error } = await supabase.from("analysis_results").select("*, clients(cedula)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Retroalimentación (resultado real de los créditos) ----------

// Clientes analizados, para pre-llenar la plantilla. Se toma el ÚLTIMO
// análisis de cada cliente: es el que el área de crédito tuvo a la
// vista al decidir.
export async function getClientesParaPlantilla() {
  const { data, error } = await supabase
    .from("analysis_results")
    .select("id, client_id, crediscope_score, recomendacion, created_at, clients(cedula)")
    .order("client_id")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const vistos = new Set();
  const filas = [];
  for (const a of data || []) {
    if (vistos.has(a.client_id)) continue;
    vistos.add(a.client_id);
    filas.push({
      cedula: a.clients?.cedula ?? "",
      clientId: a.client_id,
      analysisResultId: a.id,
      fechaAnalisis: formatearFecha(a.created_at),
      score: a.crediscope_score,
      recomendacion: a.recomendacion ?? "",
    });
  }
  return filas;
}

// Resuelve, para cada cédula del Excel, a qué análisis y a qué perfil
// congelado corresponde. Se elige el más reciente ANTERIOR a la fecha
// de desembolso (el que el analista tuvo a la vista); si no hay fecha
// de desembolso, el más reciente disponible.
//
// El perfil se guarda junto al crédito porque el backtesting necesita
// el perfil tal como estaba ese día -- nunca reconsultar la fuente, o
// el modelo "acertaría" siempre al ver la mora que todavía no había
// ocurrido. Desde la 032 cada análisis dice con qué perfil se hizo
// (client_profile_id): se usa ese, que es exacto. El cruce por fecha
// queda solo para los análisis viejos que no alcanzaron a registrarlo.
export async function vincularFilasConAnalisis(filas) {
  const cedulas = [...new Set(filas.map((f) => f.cedula))];
  const { data: clientes, error: errClientes } = await supabase.from("clients").select("id, cedula").in("cedula", cedulas);
  if (errClientes) throw errClientes;
  const clientePorCedula = Object.fromEntries((clientes || []).map((c) => [c.cedula, c.id]));
  const clientIds = Object.values(clientePorCedula);

  let analisis = [];
  let perfiles = [];
  if (clientIds.length) {
    const [{ data: a, error: errA }, { data: p, error: errP }] = await Promise.all([
      supabase.from("analysis_results").select("id, client_id, created_at, client_profile_id").in("client_id", clientIds),
      supabase.from("client_profiles").select("id, client_id, created_at").in("client_id", clientIds),
    ]);
    if (errA) throw errA;
    if (errP) throw errP;
    analisis = a || [];
    perfiles = p || [];
  }

  const masCercanoAntes = (candidatos, clientId, fechaCorte) => {
    const propios = candidatos
      .filter((c) => c.client_id === clientId)
      // El corte es el fin de ese día EN ECUADOR: acá se decide con qué
      // perfil se evaluó un crédito desembolsado, y correr el límite
      // cinco horas puede elegir un perfil que el analista no vio.
      .filter((c) => !fechaCorte || new Date(c.created_at) <= new Date(finDelDia(fechaCorte)))
      .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    return propios[0] ?? null;
  };

  return filas.map((f) => {
    const clientId = clientePorCedula[f.cedula] ?? null;
    if (!clientId) return { ...f, clientId: null, analysisResultId: null, clientProfileId: null };
    const analisisElegido = masCercanoAntes(analisis, clientId, f.fechaDesembolso);
    return {
      ...f,
      clientId,
      analysisResultId: analisisElegido?.id ?? null,
      clientProfileId:
        analisisElegido?.client_profile_id ?? masCercanoAntes(perfiles, clientId, f.fechaDesembolso)?.id ?? null,
    };
  });
}

export async function guardarPaqueteFeedback({ etiqueta, notas, archivoNombre, filas }) {
  const { data: sesion } = await supabase.auth.getUser();
  const fechas = filas.map((f) => f.fechaDesembolso).filter(Boolean).sort();

  const { data: paquete, error: errPaquete } = await supabase
    .from("feedback_paquetes")
    .insert({
      etiqueta,
      notas: notas || null,
      archivo_nombre: archivoNombre || null,
      periodo_desde: fechas[0] ?? null,
      periodo_hasta: fechas.at(-1) ?? null,
      total_filas: filas.length,
      total_default: filas.filter((f) => f.huboDefault === true).length,
      total_vinculados: filas.filter((f) => f.analysisResultId).length,
      cargado_por: sesion?.user?.id ?? null,
    })
    .select("*")
    .single();
  if (errPaquete) throw errPaquete;

  const { error: errCreditos } = await supabase.from("feedback_creditos").insert(
    filas.map((f) => ({
      paquete_id: paquete.id,
      cedula: f.cedula,
      client_id: f.clientId,
      analysis_result_id: f.analysisResultId,
      client_profile_id: f.clientProfileId,
      desembolsado: f.desembolsado,
      monto: f.monto,
      producto: f.producto,
      plazo_meses: f.plazoMeses,
      fecha_desembolso: f.fechaDesembolso,
      hubo_default: f.huboDefault,
      fecha_default: f.fechaDefault,
      tipo_default: f.tipoDefault,
      dias_mora_max: f.diasMoraMax,
      observaciones: f.observaciones,
    }))
  );
  if (errCreditos) throw errCreditos;
  return paquete;
}

// Genera el informe "Esto encontramos" de un paquete. Las estadísticas
// las calcula la Edge Function en código (no el LLM) y el LLM aporta la
// lectura cualitativa -- ver analizar-feedback/index.ts.
export async function generarInformeFeedback(paqueteId) {
  const { data, error } = await supabase.functions.invoke("analizar-feedback", { body: { paqueteId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getInformesFeedback(paqueteId) {
  const query = supabase.from("feedback_informes").select("*").order("created_at", { ascending: false });
  const { data, error } = paqueteId ? await query.eq("paquete_id", paqueteId) : await query;
  if (error) throw error;
  return data || [];
}

export async function getInformeFeedback(id) {
  const { data, error } = await supabase
    .from("feedback_informes")
    .select("*, feedback_paquetes(etiqueta, periodo_desde, periodo_hasta)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Propuestas de ajuste y backtesting ----------

export async function generarPropuestas(informeId) {
  const { data, error } = await supabase.functions.invoke("proponer-ajustes", { body: { informeId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getPropuestas(informeId) {
  const { data, error } = await supabase
    .from("feedback_propuestas")
    .select("*")
    .eq("informe_id", informeId)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

// Aprobar / rechazar / pedir cambios. Aprobar NO pone el ajuste en
// vigencia: son dos pasos distintos a propósito, para poder aprobar
// algo y activarlo recién después de verlo en backtesting.
export async function revisarPropuesta(id, { estado, comentario }) {
  const { data: sesion } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("feedback_propuestas")
    .update({
      estado,
      comentario_revisor: comentario || null,
      revisada_por: sesion?.user?.id ?? null,
      revisada_en: new Date().toISOString(),
      // Si se desaprueba algo que estaba vigente, deja de regir.
      ...(estado === "aprobada" ? {} : { vigente_desde: null }),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function ponerEnVigencia(id, vigente) {
  const { error } = await supabase
    .from("feedback_propuestas")
    .update({ vigente_desde: vigente ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

// ---------- Versiones del criterio ----------
// Cada vez que cambia el conjunto de ajustes vigentes se congela una
// versión numerada (lo hace un trigger en la base, así queda registrado
// venga el cambio de donde venga). Cada análisis guarda con qué versión
// se produjo.

export async function getVersionesCriterio() {
  const { data, error } = await supabase
    .from("criterio_versiones")
    .select("*")
    .order("numero", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getUsoPorVersion() {
  const { data, error } = await supabase.from("analysis_results").select("criterio_version_id");
  if (error) throw error;
  const conteo = {};
  for (const r of data || []) {
    if (r.criterio_version_id) conteo[r.criterio_version_id] = (conteo[r.criterio_version_id] ?? 0) + 1;
  }
  return conteo;
}

// Repone los ajustes que regían en esa versión. No borra historia:
// queda una versión nueva con ese contenido.
export async function revertirCriterio(versionId) {
  const { data: sesion } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("revertir_criterio", {
    p_version_id: versionId,
    p_actor: sesion?.user?.id ?? null,
  });
  if (error) throw error;
}

// Vuelve al criterio base sin ajustes. Es la salida más segura ante un
// problema cuyo origen todavía no se identificó.
export async function desactivarTodosLosAjustes() {
  const { data: sesion } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("desactivar_todos_los_ajustes", { p_actor: sesion?.user?.id ?? null });
  if (error) throw error;
}

export async function correrBacktest(paqueteId, propuestaIds) {
  const { data, error } = await supabase.functions.invoke("correr-backtest", { body: { paqueteId, propuestaIds } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getBacktests(paqueteId) {
  const { data, error } = await supabase
    .from("feedback_backtests")
    .select("*")
    .eq("paquete_id", paqueteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getPaquetesFeedback() {
  const { data, error } = await supabase.from("feedback_paquetes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function eliminarPaqueteFeedback(id) {
  const { error } = await supabase.from("feedback_paquetes").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Reporte Gerencial de Gestión ----------
// Trae TODOS los client_profiles/analysis_results (no uno por cliente)
// -- la deduplicación "último por cliente" y el resto de la agregación
// vive en reporteGerencial.js, para poder calcular tanto métricas
// "estado actual de la cartera" (deduplicadas) como "volumen de
// trabajo" (todas las consultas) desde los mismos datos.
export async function getDatosReporteGerencial() {
  const [{ data: perfilesRaw, error: e1 }, { data: analisisRaw, error: e2 }, { data: perfilesUsuarios, error: e3 }] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("id, client_id, standard_profile, control_bloqueo, created_at, requested_by, duracion_ms")
      .order("client_id")
      .order("created_at", { ascending: false }),
    supabase
      .from("analysis_results")
      .select("id, client_id, crediscope_score, recomendacion, created_at, duracion_ingesta_ms, duracion_llm_ms")
      .order("client_id")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, nombre_corto"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  const nombrePorId = Object.fromEntries((perfilesUsuarios || []).map((p) => [p.id, p.nombre_corto]));
  return { perfilesRaw: perfilesRaw || [], analisisRaw: analisisRaw || [], nombrePorId };
}

// ---------- Configuración operativa (parametrización) ----------
// Tablas planas con RLS (cualquier autenticado lee/actualiza), sin pasar
// por una Edge Function — ver supabase/migrations/006_runtime_config.sql
// y supabase/functions/_shared/runtime-config.ts (quien las consume en
// tiempo de consulta).

export async function getResourceConfig() {
  const { data, error } = await supabase.from("novadata_resource_config").select("*").order("bloque").order("recurso");
  if (error) throw error;
  return data;
}

export async function updateResourceConfig(recurso, { enabled, motivo }) {
  const { error } = await supabase
    .from("novadata_resource_config")
    .update({ enabled, motivo: motivo || null, updated_at: new Date().toISOString() })
    .eq("recurso", recurso);
  if (error) throw error;
}

export async function getFieldConfig() {
  const { data, error } = await supabase.from("standard_profile_field_config").select("*").order("grupo").order("campo");
  if (error) throw error;
  return data;
}

export async function updateFieldConfig(grupo, campo, { enabled, motivo }) {
  const { error } = await supabase
    .from("standard_profile_field_config")
    .update({ enabled, motivo: motivo || null, updated_at: new Date().toISOString() })
    .eq("grupo", grupo)
    .eq("campo", campo);
  if (error) throw error;
}

// Visibilidad de segmentos en "Perfil del Cliente" (nombre comercial de
// la Estructura Estandarizada) — separado de standard_profile_field_config:
// esto no afecta qué se calcula, solo qué se muestra en la UI del
// analista. modo: "con_datos" | "siempre" | "nunca".
export async function getSegmentConfig() {
  const { data, error } = await supabase.from("standard_profile_segment_config").select("*").order("grupo");
  if (error) throw error;
  return data;
}

export async function updateSegmentConfig(grupo, { modo, motivo }) {
  const { error } = await supabase
    .from("standard_profile_segment_config")
    .update({ modo, motivo: motivo || null, updated_at: new Date().toISOString() })
    .eq("grupo", grupo);
  if (error) throw error;
}

// Llama a la Edge Function `explore-novadata` con credenciales de
// Novadata que el usuario ingresa en el momento (no las secrets de
// servicio). No pasa por Supabase Auth ni persiste nada — solo para
// inspeccionar la ingesta. Ver supabase/functions/explore-novadata/index.ts.
export async function exploreNovadata({ username, password, cedula }) {
  const res = await fetch(`${FUNCTIONS_URL}/explore-novadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, cedula }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Error consultando Novadata (HTTP ${res.status})`);
  }
  return data;
}

// ---------- Información de solicitudes (datos para análisis) ----------

// Las fechas llegan como "AAAA-MM-DD" desde los selectores y se
// convierten al instante exacto en que empieza y termina ese día EN
// ECUADOR. Sin esto, una solicitud de las 19:00 del día "hasta" queda
// fuera por caer al día siguiente en UTC.
//
// Antes se armaban con `new Date("...T00:00:00")`, que interpreta la
// hora del NAVEGADOR: acertaba mientras quien filtraba estuviera en
// Ecuador y dejaba de acertar desde cualquier otro país. Ahora el
// desfase es explícito (ver fechas.js).
function rangoAInstantes(desde, hasta) {
  return { inicio: inicioDelDia(desde), fin: finDelDia(hasta) };
}

function aplicarRango(query, desde, hasta) {
  const { inicio, fin } = rangoAInstantes(desde, hasta);
  let q = query;
  if (inicio) q = q.gte("created_at", inicio);
  if (fin) q = q.lte("created_at", fin);
  return q;
}

// Primera y última solicitud registradas, para que el selector de
// fechas arranque cubriendo todo en vez de un rango arbitrario.
export async function getRangoFechasSolicitudes() {
  const [{ data: primera, error: e1 }, { data: ultima, error: e2 }] = await Promise.all([
    supabase.from("analysis_results").select("created_at").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("analysis_results").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  // En hora de Ecuador: si la primera solicitud fue a las 20:00, su
  // día en UTC es el siguiente y el selector arrancaría un día tarde,
  // dejando esa misma solicitud fuera del rango que dice cubrirla.
  return { desde: diaEcuador(primera?.created_at) || null, hasta: diaEcuador(ultima?.created_at) || null };
}

// Cuántas solicitudes caen en el rango. Se cuenta en el servidor
// (head: true no trae filas) para poder mostrar el total sin descargar
// los perfiles completos, que son ~10 KB cada uno.
export async function getConteoSolicitudes({ desde, hasta } = {}) {
  const { count, error } = await aplicarRango(
    supabase.from("analysis_results").select("id", { count: "exact", head: true }),
    desde,
    hasta
  );
  if (error) throw error;
  return count ?? 0;
}

// Una fila por solicitud con el perfil completo que la produjo, para
// exportar y trabajar afuera (ver src/lib/exportAnalitico.js). El
// resultado real del crédito viene de feedback_creditos cuando ya se
// cargó la cosecha correspondiente.
//
// El límite existe porque cada perfil son ~10 KB: sin tope, esta
// consulta crece sin control a medida que se acumulan solicitudes.
export async function getDatosAnaliticos({ desde, hasta, limite = 5000 } = {}) {
  const { data, error } = await aplicarRango(
    supabase
      .from("analysis_results")
      .select(
        "id, created_at, crediscope_score, recomendacion, rules_version, client_profile_vinculo, " +
          "clients(cedula), " +
          "client_profiles(standard_profile, structure_version), " +
          "criterio_versiones(numero), " +
          "feedback_creditos(desembolsado, monto, producto, plazo_meses, fecha_desembolso, hubo_default, tipo_default, dias_mora_max)"
      ),
    desde,
    hasta
  )
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

// ---------- Fuentes de ingreso ----------

// Perfiles con su clasificación de fuentes de ingreso (la calcula
// fuentes-ingreso.ts al generar cada perfil). Se traen todos y se
// deduplica por cliente en el front (ver fuentesIngresoConsolidado.js):
// el standard_profile completo es pesado, pero es la única forma de
// llegar al grupo sin duplicar la clasificación en columnas.
// Panorama: solo las columnas denormalizadas (ver 043). Antes bajaba el
// standard_profile completo de cada cliente para leerle tres campos --
// ~10 KB por persona, 30 MB con 3.000 clientes en cada carga.
export async function getResumenFuentesIngreso({ limite = 5000 } = {}) {
  const { data, error } = await supabase
    .from("client_profiles")
    .select("id, client_id, created_at, fuente_segmento, fuente_estado, fuente_version, fuente_corte, fuente_piso_ingreso, duracion_fuentes_ms, clients(cedula)")
    .order("client_id")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

// Detalle: acá sí hace falta el perfil completo (fuentes, señales, qué
// pedir), pero filtrado por segmento en el servidor para no traer la
// cartera entera.
export async function getPerfilesConFuentesIngreso({ segmento = null, estado = null, limite = 300 } = {}) {
  let q = supabase
    .from("client_profiles")
    .select("id, client_id, created_at, standard_profile, fuente_segmento, fuente_estado, clients(cedula)")
    .not("fuente_segmento", "is", null);
  if (segmento) q = q.eq("fuente_segmento", segmento);
  if (estado) q = q.eq("fuente_estado", estado);
  const { data, error } = await q.order("client_id").order("created_at", { ascending: false }).limit(limite);
  if (error) throw error;
  return data || [];
}

// ---------- Consumo del LLM ----------
// El registro de llamadas es la única fuente del costo. Se lee entero
// (son decenas, no millones) y se agrupa en el navegador: cada pantalla
// de Costos necesita un corte distinto y traer uno por consulta sería
// una ida al servidor por pestaña.
export async function getConsumoLlm({ desde = null, hasta = null, limite = 5000 } = {}) {
  let q = supabase.from("llm_costos").select("*");
  // Con desfase explícito: un texto sin zona lo interpreta el servidor
  // en la suya (UTC), y el rango quedaba corrido cinco horas.
  if (desde) q = q.gte("created_at", inicioDelDia(desde));
  if (hasta) q = q.lte("created_at", finDelDia(hasta));
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limite);
  if (error) throw error;
  return data || [];
}

export async function getTarifasLlm() {
  const { data, error } = await supabase
    .from("llm_precios")
    .select("*")
    .order("modelo")
    .order("vigente_desde", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ---------- Vigía: estado del servicio e incidentes ----------
// Son dos lecturas chicas y siempre van juntas: el estado responde
// "¿funciona ahora?" y los incidentes, "¿cuánto estuvo sin funcionar?".
export async function getEstadoServicio() {
  const { data, error } = await supabase.from("servicio_estado").select("*").order("componente");
  if (error) throw error;
  return data || [];
}

export async function getIncidentes({ limite = 200 } = {}) {
  const { data, error } = await supabase
    .from("incidentes_con_duracion")
    .select("*")
    .order("inicio", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

export async function getAvisos({ limite = 100 } = {}) {
  const { data, error } = await supabase
    .from("alertas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

export async function getConfigOperativa() {
  const { data, error } = await supabase.from("config_operativa").select("*").order("clave");
  if (error) throw error;
  return data || [];
}

// La única escritura directa desde el navegador a un parámetro de
// operación. Se justifica porque no hay nada que derivar ni validar
// contra otra fuente: es un número que alguien decide. La clave no se
// puede inventar -- la política de la base solo permite actualizar
// filas que ya existen.
export async function guardarConfigOperativa(clave, valor) {
  // El .select() no es adorno: una actualización que la política de la
  // base rechaza NO devuelve error, devuelve cero filas. Sin esto la
  // pantalla diría "Guardado" y no habría guardado nada -- el peor de
  // los dos resultados posibles, porque nadie vuelve a mirar.
  const { data, error } = await supabase
    .from("config_operativa")
    .update({ valor, actualizado_at: new Date().toISOString() })
    .eq("clave", clave)
    .select("clave");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("No se guardó: la cuenta no tiene permiso para cambiar parámetros de operación.");
  }
}

export async function getGastoDelMes() {
  const { data, error } = await supabase.from("gasto_del_mes").select("*").maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Consultas por lote ----------

export async function getLotes({ limite = 50 } = {}) {
  const { data, error } = await supabase
    .from("lotes_resumen")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

export async function getLote(id) {
  const { data, error } = await supabase.from("lotes_resumen").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// Crea el lote y sus ítems. Se insertan en tandas porque una sola
// sentencia con miles de filas la rechaza el servidor por tamaño.
export async function crearLote({ nombre, archivo, items, totales }) {
  const { data: { user } = {} } = await supabase.auth.getUser();
  const { data: lote, error } = await supabase
    .from("lotes")
    .insert({
      nombre,
      archivo,
      estado: "preparado",
      total_lineas: totales.lineas,
      total_validas: totales.validas,
      total_duplicadas: totales.duplicadas,
      total_descartadas: totales.descartadas,
      creado_por: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const TANDA = 500;
  for (let i = 0; i < items.length; i += TANDA) {
    const { error: e } = await supabase.from("lote_items").insert(
      items.slice(i, i + TANDA).map((it) => ({
        lote_id: lote.id,
        ingresado: it.ingresado,
        fila_archivo: it.fila,
        cedula: it.cedula,
        tipo_identificacion: it.tipo,
        estado: it.estado,
        motivo: it.motivo ?? null,
      }))
    );
    if (e) throw e;
  }
  return lote.id;
}

// Arrancar es un cambio de estado: el trabajador del servidor toma de
// acá. La pantalla no consulta nada, así que cerrarla no detiene el
// lote.
export async function arrancarLote(id) {
  const { data, error } = await supabase
    .from("lotes")
    .update({ estado: "en_proceso", iniciado_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "preparado")
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("No se pudo arrancar: el lote ya no estaba en estado preparado.");
}

export async function cancelarLote(id) {
  const { error } = await supabase.from("lotes").update({ estado: "cancelado" }).eq("id", id);
  if (error) throw error;
}

export async function getItemsLote(id, { estado = null, limite = 5000 } = {}) {
  let q = supabase
    .from("lote_items")
    .select("id, ingresado, fila_archivo, cedula, tipo_identificacion, estado, motivo, duracion_ms, procesado_at")
    .eq("lote_id", id);
  if (estado) q = q.eq("estado", estado);
  const { data, error } = await q.order("fila_archivo").limit(limite);
  if (error) throw error;
  return data || [];
}

// Los perfiles generados por este lote, con todo lo que hace falta para
// las hojas del Excel.
export async function getPerfilesDeLote(id, { limite = 5000 } = {}) {
  const { data, error } = await supabase
    .from("client_profiles")
    .select("id, created_at, standard_profile, structure_version, clients(cedula)")
    .eq("lote_id", id)
    .limit(limite);
  if (error) throw error;
  return data || [];
}
