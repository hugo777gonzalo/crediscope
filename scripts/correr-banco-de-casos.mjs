// El corredor del banco de casos de oro (scripts/banco-de-casos-de-oro/README.md).
//
// Por omisión corre EN SECO: valida los casos, carga el perfil de cada uno (de la base,
// sólo lectura, o del simulador del sandbox), comprueba por dónde termina la evaluación
// con el código real (controles, freno de fuentes obligatorias, regla de la entrega),
// arma el pedido al modelo con armarPedidoScoring() y evalúa las afirmaciones
// automáticas contra el ÚLTIMO análisis guardado de la persona, como línea base. No
// llama al modelo ni escribe en la base: por eso no abre registro (regla 11).
//
// Con --con-modelo llama al modelo una vez por caso (o --repeticiones=N: el ruido es de
// unos 40 puntos y 1 de cada 13 recomendaciones). Es una prueba masiva con costo: pide
// la confirmación del negocio y no corre sin --confirmo-costo, que repite el costo
// estimado. Las respuestas van a research/banco-de-casos/<fecha>/ (fuera de git: llevan
// lo que el modelo escribió sobre personas reales). Nada se guarda en analysis_results.
//
// La consola no lleva datos de personas: los casos se citan como c-xxxxxxxx.
//
// Uso: node scripts/correr-banco-de-casos.mjs [--seco] [--caso=<id>[,<id>]]
//      node scripts/correr-banco-de-casos.mjs --con-modelo [--repeticiones=N] [--confirmo-costo]
// Sale con 1 si un caso falla o da error.
//
// AVISO: este guion no pasa por lint ni build.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PRINCIPAL, RAIZ, accesoASupabase, consultar, motivo } from "./revision-del-analisis/comun.mjs";
import { leerCasos, validarCaso } from "./banco-de-casos-de-oro/formato.mjs";
import { entregaAceptable, evaluarCaso } from "./banco-de-casos-de-oro/evaluar.mjs";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const bandera = (n) => process.argv.includes(`--${n}`);
const CON_MODELO = bandera("con-modelo");
const REPETICIONES = Math.max(1, Number(arg("repeticiones") ?? 1));
const SOLO = arg("caso")?.split(",");

const acceso = accesoASupabase();
globalThis.Deno = { env: { get: (k) => process.env[k] } };
const compartido = (a) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", a)).href);
const { armarPedidoScoring, CONFIG_LLM, puntuarPedido, MARCO_VERSION } = await compartido("llm-scoring.ts");
const { MARCO_VERSION_CON_BURO } = await compartido("marco-interpretativo.ts");
const { ultimaConsultaDeEquifax } = await compartido("buro-de-la-institucion.ts");
const { loadDisabledFields } = await compartido("runtime-config.ts");
const { evaluarControlesBloqueo } = await compartido("controles-bloqueo.ts");
const { buildStandardProfile } = await compartido("process.ts");
const { CORTE_IESS_CONOCIDO } = await compartido("fuentes-ingreso.ts");
const { leerLaConsulta } = await compartido("consulta-de-perfil.ts");
const { decisionDeLaConsulta, estadoPorFuente, completitudDeLaConsulta, recomendacionDeLaEntrega } = await compartido("calidad-de-la-consulta.ts");
const { proveedorInfo1Simulado } = await compartido("sandbox-simuladores.ts");
const { IDENTIFICACIONES_DEL_SANDBOX } = await compartido("sandbox-casos.ts");

const supabase = createClient(acceso.url, acceso.clave, { auth: { persistSession: false } });
const ahora = new Date();
const marcoVigente = CONFIG_LLM.buroDeLaInstitucion ? MARCO_VERSION_CON_BURO : MARCO_VERSION;

// ------------------------------------------------------------------ los casos
const casos = [];
let invalidos = 0;
for (const { archivo, caso, error } of leerCasos()) {
  const errores = error ? [error] : validarCaso(caso, archivo, { identificacionesDelSandbox: IDENTIFICACIONES_DEL_SANDBOX });
  if (errores.length) {
    invalidos++;
    console.log(`INVÁLIDO ${archivo}: ${errores.join(" ")}`);
  } else if (!SOLO || SOLO.includes(caso.id)) casos.push(caso);
}
if (invalidos) { console.log(`${invalidos} caso(s) inválidos: el corredor no corre lo que la prueba del formato rechaza.`); process.exit(1); }

// La cédula de cada caso real, en una sola consulta de sólo lectura.
const reales = casos.filter((c) => c.perfil.origen === "base");
const personas = new Map();
if (reales.length) {
  const filas = consultar(`select id, cedula from clients where ${reales.map((c) => `id::text like '${c.id.slice(2)}%'`).join(" or ")};`);
  for (const c of reales) {
    const f = filas.filter((x) => String(x.id).startsWith(c.id.slice(2)));
    if (f.length === 1) personas.set(c.id, f[0]);
  }
}

const camposDeshabilitados = await loadDisabledFields(supabase);

// ------------------------------------------------------------ cargar un perfil
const CAMPOS_ANALISIS = "id, client_profile_id, rules_version, created_at, crediscope_score, recomendacion, narrative_summary, positives, negatives, missing_info, acciones_sugeridas, indicador_riesgo, indicador_historial, llm_usage, fallo";

// Sólo lectura. Devuelve { perfil, control, estado, buro, ultimoAnalisis } o { noAplica }.
async function cargarReal(caso) {
  const persona = personas.get(caso.id);
  if (!persona) throw new Error("la referencia no resuelve a una sola persona en clients");
  let perfilId;
  if (caso.perfil.cual === "del_analisis_revisado") {
    const desde = new Date(Date.parse(`${caso.perfil.fecha_del_analisis}T00:00:00Z`) - 86400000).toISOString();
    const hasta = new Date(Date.parse(`${caso.perfil.fecha_del_analisis}T00:00:00Z`) + 2 * 86400000).toISOString();
    const { data, error } = await supabase.from("analysis_results").select("client_profile_id, created_at")
      .eq("client_id", persona.id).eq("rules_version", caso.perfil.marco_del_analisis)
      .gte("created_at", desde).lt("created_at", hasta).order("created_at", { ascending: false }).limit(1);
    if (error) throw new Error(motivo(error));
    if (!data?.length) throw new Error(`no hay análisis de ${caso.perfil.marco_del_analisis} del ${caso.perfil.fecha_del_analisis}`);
    perfilId = data[0].client_profile_id;
  }
  const consulta = supabase.from("client_profiles").select("id, created_at, standard_profile, control_bloqueo, estado_por_fuente");
  const { data: perfiles, error: eP } = perfilId
    ? await consulta.eq("id", perfilId).limit(1)
    : await consulta.eq("client_id", persona.id).order("created_at", { ascending: false }).limit(1);
  if (eP) throw new Error(motivo(eP));
  const perfil = perfiles?.[0];
  if (!perfil) throw new Error("la persona no tiene perfil");

  // El buró a la fecha del perfil (README: «ultimaConsultaDeEquifax() a la fecha del perfil»).
  const buro = caso.buro_equifax === "no" ? null : await ultimaConsultaDeEquifax(supabase, { id: persona.id, cedula: persona.cedula }, new Date(perfil.created_at));
  if (caso.buro_equifax === "necesario" && !buro) return { noAplica: "buro_equifax «necesario» y la persona no tiene consulta de Equifax a la fecha del perfil" };

  const { data: ultimos, error: eA } = await supabase.from("analysis_results").select(CAMPOS_ANALISIS)
    .eq("client_id", persona.id).is("fallo", null).order("created_at", { ascending: false }).limit(1);
  if (eA) throw new Error(motivo(eA));
  return {
    perfil: perfil.standard_profile, control: perfil.control_bloqueo ?? { bloqueado: false, hallazgos: [] },
    estado: perfil.estado_por_fuente ?? {}, buro, ultimoAnalisis: ultimos?.[0] ?? null, fechaDelPerfil: perfil.created_at, lectura: null,
  };
}

// Igual que perfilSimulado() de sandbox-pasos.ts: del simulador, sin tocar la base.
function cargarSandbox(caso) {
  const id = caso.perfil.identificacion;
  const raw = proveedorInfo1Simulado(id);
  const lectura = leerLaConsulta(raw, { cedula: id, ingresado: id, tipoIdentificacion: "cedula" });
  const estado = estadoPorFuente(raw);
  if (!lectura.ok) return { perfil: null, control: null, estado, buro: null, ultimoAnalisis: null, lectura };
  return {
    perfil: buildStandardProfile(raw, id, CORTE_IESS_CONOCIDO).profile, control: evaluarControlesBloqueo(raw, id),
    estado, buro: null, ultimoAnalisis: null, lectura,
  };
}

// Por dónde termina la evaluación, con el código real y antes del modelo.
function flujoObtenido(c) {
  if (c.lectura && !c.lectura.ok) return c.lectura.status === 404 ? "persona_no_encontrada" : "fuentes_no_disponibles";
  const decision = decisionDeLaConsulta(c.estado, c.control);
  if (decision === "frenar") return "consulta_incompleta";
  if (decision === "negar_por_control" || c.control?.bloqueado) return "negado_por_control";
  return "analisis_del_modelo";
}

const comoRespuesta = (a) => ({
  score: a.crediscope_score, recomendacion: a.recomendacion, accionesSugeridas: a.acciones_sugeridas ?? [],
  indicadorRiesgo: a.indicador_riesgo, indicadorHistorial: a.indicador_historial,
  positives: a.positives ?? [], negatives: a.negatives ?? [], missingInfo: a.missing_info ?? [], reasoning: a.narrative_summary ?? "",
});

// ------------------------------------------------------------------ el recorrido
const informe = [];
for (const caso of casos) {
  const fila = { id: caso.id, estado: "pasa", motivos: [], juicio: caso.afirmaciones.de_juicio, tokensEntrada: 0, pedido: null, baseline: null, ultimoOutput: null };
  informe.push(fila);
  try {
    const c = caso.perfil.origen === "sandbox" ? cargarSandbox(caso) : await cargarReal(caso);
    if (c.noAplica) { fila.estado = "no_aplica"; fila.motivos.push(c.noAplica); continue; }

    const obtenido = flujoObtenido(c);
    // sin_veredicto depende de que el modelo no conteste: en seco no se puede comprobar.
    const flujoOk = obtenido === caso.flujo_esperado || (caso.flujo_esperado === "sin_veredicto" && obtenido === "analisis_del_modelo");
    if (!flujoOk) { fila.estado = "falla"; fila.motivos.push(`flujo: se esperaba ${caso.flujo_esperado} y el código da ${obtenido}`); }
    fila.flujo = obtenido;
    if (caso.flujo_esperado !== "analisis_del_modelo") {
      if (caso.flujo_esperado === "sin_veredicto") { fila.estado = fila.estado === "falla" ? "falla" : "no_evaluable"; fila.motivos.push("sin_veredicto depende de que el modelo no conteste: no se comprueba en seco"); }
      continue; // en los demás flujos el modelo no corre: lo que se prueba es el flujo
    }
    if (obtenido !== "analisis_del_modelo") continue;

    // El pedido, con el marco vigente y la misma fecha del perfil (demandas con sus años).
    const pedido = armarPedidoScoring(c.perfil, c.control, camposDeshabilitados, CONFIG_LLM, c.buro, c.fechaDelPerfil ? new Date(c.fechaDelPerfil) : ahora);
    fila.pedido = pedido;
    fila.tokensEntrada = Math.ceil((JSON.stringify(pedido.system).length + (pedido.messages[0].content.length)) / 3.2); // ~3,2 caracteres por token en castellano y JSON
    const salidaPrevia = c.ultimoAnalisis?.llm_usage?.output_tokens ?? c.ultimoAnalisis?.llm_usage?.uso?.output_tokens ?? null;
    fila.ultimoOutput = Number.isFinite(salidaPrevia) ? salidaPrevia : null;
    fila.entrega = (rec) => recomendacionDeLaEntrega(rec, completitudDeLaConsulta(c.estado));

    // Línea base: el último análisis guardado de la persona (en seco).
    if (!CON_MODELO) {
      if (!c.ultimoAnalisis) { fila.estado = fila.estado === "falla" ? "falla" : "no_evaluable"; fila.motivos.push("la persona no tiene análisis guardado: no hay línea base"); continue; }
      const r = comoRespuesta(c.ultimoAnalisis);
      fila.baseline = { marco: c.ultimoAnalisis.rules_version, recomendacion: r.recomendacion };
      const ev = evaluarCaso(caso, r);
      const ent = entregaAceptable(caso, fila.entrega(r.recomendacion));
      for (const f of ev.fallas) fila.motivos.push(`afirmación ${f.numero} (${f.tipo}): ${f.detalle}`);
      if (!ent.ok) fila.motivos.push(`entrega «${fila.entrega(r.recomendacion)}» fuera de lo aceptable (${ent.aceptadas.join(", ")})`);
      if (ev.fallas.length || !ent.ok) fila.estado = "falla";
    }
  } catch (e) {
    fila.estado = "error";
    fila.motivos.push(e.message);
  }
}

// ------------------------------------------------------------------ el costo
const modelo = CONFIG_LLM.modelo ?? "claude-sonnet-5-5";
const { data: precio, error: ePrecio } = await supabase.from("llm_precios").select("*").eq("modelo", modelo).order("vigente_desde", { ascending: false }).limit(1).maybeSingle();
const delModelo = informe.filter((f) => f.pedido);
const salidas = delModelo.map((f) => f.ultimoOutput).filter(Boolean);
// La salida no se conoce hasta correr: se usa el promedio de los últimos análisis guardados y, sin ellos, el tope de CONFIG_LLM (cota alta).
const salidaPorCaso = salidas.length ? Math.round(salidas.reduce((a, b) => a + b, 0) / salidas.length) : CONFIG_LLM.maxTokens;
const tokensEntrada = delModelo.reduce((a, f) => a + f.tokensEntrada, 0) * REPETICIONES;
const tokensSalida = salidaPorCaso * delModelo.length * REPETICIONES;
const usd = precio ? (tokensEntrada * precio.usd_entrada + tokensSalida * precio.usd_salida) / 1e6 : null;
const nUsd = (n) => n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const costoTexto = usd === null
  ? `sin precio de ${modelo} en llm_precios (${ePrecio ? motivo(ePrecio) : "sin fila"})`
  : `aprox. USD ${nUsd(usd)} (entrada ${tokensEntrada.toLocaleString("es-EC")} tokens a ${precio.usd_entrada} y salida estimada ${tokensSalida.toLocaleString("es-EC")} tokens a ${precio.usd_salida}, por millón; ${delModelo.length} casos × ${REPETICIONES})`;

// ------------------------------------------------------------ modo con modelo
const fecha = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format(ahora);
if (CON_MODELO) {
  console.log(`Marco ${marcoVigente}, modelo ${modelo}. Costo estimado de la corrida: ${costoTexto}.`);
  if (!bandera("confirmo-costo")) {
    console.log("Correr con el modelo es una prueba masiva: necesita la autorización explícita del negocio con este costo. Para correr, repetir con --confirmo-costo.");
    process.exit(2);
  }
  const carpeta = path.join(PRINCIPAL, "research", "banco-de-casos", fecha);
  fs.mkdirSync(carpeta, { recursive: true });
  for (const f of delModelo) {
    const caso = casos.find((x) => x.id === f.id);
    f.corridas = [];
    for (let i = 0; i < REPETICIONES; i++) {
      const r = await puntuarPedido(f.pedido);
      const ev = r.fallo ? { total: 0, fallas: [] } : evaluarCaso(caso, r);
      const entregada = f.entrega(r.recomendacion);
      const ent = entregaAceptable(caso, entregada);
      f.corridas.push({ fallo: r.fallo ?? null, ok: !r.fallo && !ev.fallas.length && ent.ok, fallas: ev.fallas, entregada });
      fs.writeFileSync(path.join(carpeta, `${f.id}-${i + 1}.json`), JSON.stringify({ caso: f.id, marco: marcoVigente, modelo, respuesta: r, evaluacion: ev, entregada, juicio: f.juicio }, null, 2), "utf8");
    }
    const malas = f.corridas.filter((x) => !x.ok);
    f.estado = malas.length === 0 ? "pasa" : "falla";
    for (const [i, m] of f.corridas.entries()) if (!m.ok) f.motivos.push(`corrida ${i + 1}: ${m.fallo ? `error del modelo (${m.fallo})` : [...m.fallas.map((x) => `afirmación ${x.numero} (${x.tipo})`), ...(entregaAceptable(casos.find((x) => x.id === f.id), m.entregada).ok ? [] : [`entrega «${m.entregada}»`])].join("; ")}`);
  }
  console.log(`Respuestas guardadas en research/banco-de-casos/${fecha}/ (fuera de git).`);
}

// --------------------------------------------------------------------- informe
console.log(`\nBanco de casos de oro — ${CON_MODELO ? "con modelo" : "en seco"} — marco ${marcoVigente} — ${casos.length} casos\n`);
const ETIQUETA = { pasa: "pasa      ", falla: "FALLA     ", no_evaluable: "no evaluab.", no_aplica: "no aplica ", error: "ERROR     " };
for (const f of informe) {
  console.log(`${ETIQUETA[f.estado]} ${f.id}  flujo ${f.flujo ?? "?"}${f.baseline ? `  base ${f.baseline.marco}: ${f.baseline.recomendacion}` : ""}`);
  for (const m of f.motivos) console.log(`             - ${m}`);
}
const cuenta = (e) => informe.filter((f) => f.estado === e).length;
console.log(`\nResumen: ${cuenta("pasa")} pasan, ${cuenta("falla")} fallan, ${cuenta("no_evaluable")} no evaluables, ${cuenta("no_aplica")} no aplican, ${cuenta("error")} con error.`);
console.log(`Llegarían al modelo: ${delModelo.length} de ${casos.length}. Costo de una corrida real: ${costoTexto}.`);
if (!CON_MODELO) console.log("Las pasadas y fallas de arriba son contra el ÚLTIMO análisis guardado de cada persona (línea base), no contra el marco vigente: el modelo no corrió.");
const juicio = informe.reduce((a, f) => a + (f.juicio?.debe?.length ?? 0) + (f.juicio?.no_debe?.length ?? 0), 0);
console.log(`Afirmaciones de juicio para el verificador (no se evalúan): ${juicio}.`);
if (bandera("juicio")) for (const f of informe) {
  if (!f.juicio) continue;
  console.log(`\n${f.id}`);
  for (const d of f.juicio.debe ?? []) console.log(`  debe: ${d}`);
  for (const d of f.juicio.no_debe ?? []) console.log(`  no debe: ${d}`);
}
process.exit(cuenta("falla") + cuenta("error") ? 1 : 0);
