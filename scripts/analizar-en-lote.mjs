// Analiza muchos clientes con la API de lotes de Anthropic (Message Batches).
//
// Nació el 2026-10-03 para el Laboratorio de Inteligencia de Negocio
// (docs/laboratorio-de-riesgo.md), que necesita cientos de puntajes y no
// tenía más de 62. Por qué un lote y no 300 llamadas a analyze-client:
//   - la API de lotes cobra la mitad;
//   - el marco se cachea (cachearMarco): los pedidos salen juntos y el marco
//     se lee a una décima parte del precio. En análisis sueltos no conviene;
//   - no corre dentro de Supabase, así que no lo corta a los 150 s: el tope
//     de salida sube a 16.000 tokens (con 10.000 ya se cortaron análisis).
//
// El pedido lo arma armarPedidoScoring() y la fila de analysis_results
// filaDelAnalisis(): los mismos que usa analyze-client. Un análisis en lote
// queda igual que uno de la pantalla, atado a su perfil y con lo que leyó el
// modelo. Reutiliza perfiles guardados: no reconsulta Novadata.
//
// Las repeticiones (--ruido) miden cuánto cambia el modelo con el mismo
// perfil. Sólo la primera de cada perfil se guarda como análisis; las demás
// quedan en la carpeta y en llm_llamadas como prueba.
//
// Uso, en tres pasos (cada uno se puede repetir sin duplicar nada):
//   node scripts/analizar-en-lote.mjs preparar --cantidad=200 --ruido=20x5 [--semilla=1] [--carpeta=research/lote-analisis-AAAA-MM-DD]
//   node scripts/analizar-en-lote.mjs enviar --carpeta=... --responsable=<uuid>
//   node scripts/analizar-en-lote.mjs recoger --carpeta=...

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const arg = (nombre, porDefecto) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? porDefecto;
const PASO = process.argv[2];
const HOY = new Date().toISOString().slice(0, 10);
const CARPETA = path.resolve(RAIZ, arg("carpeta", `research/lote-analisis-${HOY}`));
const archivo = (nombre) => path.join(CARPETA, nombre);
const leer = (nombre) => JSON.parse(fs.readFileSync(archivo(nombre), "utf8"));
const escribir = (nombre, datos) => fs.writeFileSync(archivo(nombre), JSON.stringify(datos, null, 1));

// Los secretos se leen del archivo y no se imprimen.
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
globalThis.Deno = { env: { get: (k) => env[k] } };

const compartido = (a) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", a)).href);
const { armarPedidoScoring, interpretar, CONFIG_LLM, MARCO_VERSION, MODELO } = await compartido("llm-scoring.ts");
const { loadCriterioVigente, loadDisabledFields } = await compartido("runtime-config.ts");
const { registrarLlamadaLlm } = await compartido("llm-log.ts");
const { elPerfilSirve } = await compartido("calidad-de-la-consulta.ts");
const { filaDelAnalisis } = await compartido("fila-del-analisis.ts");

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ANTHROPIC = {
  "content-type": "application/json",
  "x-api-key": env.ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  ...(env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID } : {}),
};
const CONFIG_LOTE = { ...CONFIG_LLM, maxTokens: 16_000, cachearMarco: true };

// Un error de PostgREST es un objeto plano: String(err) lo aplasta.
const motivo = (e) => [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e);

// Sorteo reproducible: con la misma semilla sale la misma muestra.
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const barajar = (xs, r) => {
  const c = [...xs];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
};

// De a páginas y hasta el conteo de la primera, con orden total: PostgREST
// corta en 1.000 sin avisar (ver src/lib/paginar.js).
async function traerTodas(construir) {
  const filas = [];
  let total = null;
  for (let desde = 0; total === null || desde < total; desde += 1000) {
    const { data, error, count } = await construir().range(desde, desde + 999);
    if (error) throw new Error(motivo(error));
    if (total === null) total = count ?? 0;
    filas.push(...data);
    if (!data.length) break;
  }
  if (filas.length < total) throw new Error(`Se leyeron ${filas.length} de ${total} filas`);
  return filas;
}

// ------------------------------------------------------------- preparar
async function preparar() {
  const cantidad = Number(arg("cantidad", "200"));
  const [nRuido, nVeces] = arg("ruido", "20x5").split("x").map(Number);
  const r = azar(Number(arg("semilla", "1")));

  const perfiles = await traerTodas(() => supabase.from("client_profiles")
    .select("id, client_id, created_at, fuente_segmento, fuentes_ok, ejes_ok", { count: "exact" })
    .order("created_at", { ascending: true }).order("id", { ascending: true }));
  const ultimo = new Map();
  for (const p of perfiles) ultimo.set(p.client_id, p); // ordenados: queda el más reciente
  // Las 240 cédulas sintéticas de prueba de Aval están en la cartera y
  // Novadata no las conoce (docs/pendientes.md): no son clientes.
  const sinteticas = new Set(fs.readFileSync(path.resolve(RAIZ, arg("excluir", "research/aval-pool-240.txt")), "utf8").match(/\d{10}/g) ?? []);
  const { data: idsSinteticos, error: eSint } = await supabase.from("clients").select("id").in("cedula", [...sinteticas].slice(0, 300));
  if (eSint) throw new Error(motivo(eSint));
  const excluidos = new Set(idsSinteticos.map((c) => c.id));
  const candidatos = [...ultimo.values()].filter((p) => elPerfilSirve(p) && !excluidos.has(p.client_id));
  console.log(`Excluidas ${excluidos.size} personas sintéticas de ${sinteticas.size} en la lista`);

  // Por segmento, proporcional y con un mínimo de 5 donde alcance: los
  // segmentos chicos (militares, jubilados) son justo donde el marco cambió.
  const porSegmento = new Map();
  for (const p of candidatos) {
    const s = p.fuente_segmento ?? "(sin segmento)";
    if (!porSegmento.has(s)) porSegmento.set(s, []);
    porSegmento.get(s).push(p);
  }
  const cupo = new Map([...porSegmento].map(([s, ps]) => [s, Math.min(ps.length, Math.max(5, Math.round((ps.length / candidatos.length) * cantidad)))]));
  let elegidos = [...porSegmento].flatMap(([s, ps]) => barajar(ps, r).slice(0, cupo.get(s)));
  elegidos = barajar(elegidos, r).slice(0, cantidad);

  const cedulaDe = new Map();
  for (let i = 0; i < elegidos.length; i += 100) {
    const { data: clientes, error } = await supabase.from("clients").select("id, cedula").in("id", elegidos.slice(i, i + 100).map((p) => p.client_id));
    if (error) throw new Error(motivo(error));
    for (const c of clientes) cedulaDe.set(c.id, c.cedula);
  }

  // Las repeticiones, repartidas entre segmentos.
  const conRuido = new Set(barajar(elegidos, r).slice(0, nRuido).map((p) => p.id));
  const seleccion = elegidos.map((p) => ({
    perfilId: p.id, clientId: p.client_id, cedula: cedulaDe.get(p.client_id), segmento: p.fuente_segmento,
    repeticiones: conRuido.has(p.id) ? nVeces : 1,
  }));

  fs.mkdirSync(CARPETA, { recursive: true });
  escribir("seleccion.json", seleccion);
  const pedidos = seleccion.reduce((a, s) => a + s.repeticiones, 0);
  const resumen = Object.fromEntries([...new Set(seleccion.map((s) => s.segmento))].map((s) => [s, seleccion.filter((x) => x.segmento === s).length]));
  console.log(`${candidatos.length} clientes con un perfil que sirve; elegidos ${seleccion.length}, ${pedidos} pedidos (${nRuido} perfiles x ${nVeces})`);
  console.table(resumen);
  console.log(`Carpeta: ${path.relative(RAIZ, CARPETA)}`);
}

// --------------------------------------------------------------- enviar
async function enviar() {
  if (fs.existsSync(archivo("estado.json"))) {
    console.log(`Este lote ya se envió: ${leer("estado.json").batchId}. Usá "recoger".`);
    return;
  }
  const responsable = arg("responsable", null);
  if (!/^[0-9a-f-]{36}$/.test(responsable ?? "")) throw new Error("Falta --responsable=<uuid>: quién ordena el lote (auditoría)");
  const seleccion = leer("seleccion.json");
  const [camposDeshabilitados, criterio] = await Promise.all([loadDisabledFields(supabase), loadCriterioVigente(supabase)]);

  const datos = new Map();
  for (let i = 0; i < seleccion.length; i += 100) {
    const ids = seleccion.slice(i, i + 100).map((s) => s.perfilId);
    const { data, error } = await supabase.from("client_profiles").select("id, standard_profile, control_bloqueo").in("id", ids);
    if (error) throw new Error(motivo(error));
    for (const d of data) datos.set(d.id, d);
  }

  const requests = [];
  const meta = {};
  for (const s of seleccion) {
    const d = datos.get(s.perfilId);
    if (!d) { console.log(`${s.cedula}: el perfil ya no existe, se salta`); continue; }
    const control = d.control_bloqueo ?? { bloqueado: false, hallazgos: [] };
    const params = armarPedidoScoring(d.standard_profile, control, criterio.ajustes, camposDeshabilitados, CONFIG_LOTE);
    for (let rep = 1; rep <= s.repeticiones; rep++) {
      const customId = `${s.perfilId}_${rep}`;
      requests.push({ custom_id: customId, params });
      meta[customId] = { ...s, repeticion: rep };
    }
    // Lo que leyó el modelo y el control de bloqueo, una vez por perfil:
    // los necesita filaDelAnalisis al recoger.
    meta[s.perfilId] = { mensajeAlModelo: JSON.parse(params.messages[0].content), controlBloqueo: control };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST", headers: ANTHROPIC, body: JSON.stringify({ requests }),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`No se pudo crear el lote: HTTP ${res.status} ${texto.slice(0, 600)}`);
  const lote = JSON.parse(texto);
  escribir("meta.json", meta);
  escribir("estado.json", {
    batchId: lote.id, enviadoEl: new Date().toISOString(), pedidos: requests.length,
    marco: MARCO_VERSION, modelo: CONFIG_LOTE.modelo ?? MODELO, config: CONFIG_LOTE,
    criterioVersionId: criterio.versionId, responsable,
  });
  console.log(`Lote ${lote.id} enviado: ${requests.length} pedidos (${MARCO_VERSION}, ${CONFIG_LOTE.modelo ?? MODELO}). Estado: ${lote.processing_status}`);
}

// -------------------------------------------------------------- recoger
async function recoger() {
  const estado = leer("estado.json");
  if (estado.marco !== MARCO_VERSION) throw new Error(`El lote se armó con ${estado.marco} y el código dice ${MARCO_VERSION}`);
  const meta = leer("meta.json");

  const r = await fetch(`https://api.anthropic.com/v1/messages/batches/${estado.batchId}`, { headers: ANTHROPIC });
  const lote = await r.json();
  if (!r.ok) throw new Error(`No se pudo leer el lote: HTTP ${r.status} ${JSON.stringify(lote).slice(0, 400)}`);
  if (lote.processing_status !== "ended") {
    console.log(`Lote ${estado.batchId}: ${lote.processing_status}`, lote.request_counts);
    return;
  }

  const res = await fetch(lote.results_url, { headers: ANTHROPIC });
  if (!res.ok) throw new Error(`No se pudieron bajar los resultados: HTTP ${res.status}`);
  const lineas = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));

  const hechos = new Set(fs.existsSync(archivo("procesados.json")) ? leer("procesados.json") : []);
  fs.mkdirSync(archivo("respuestas"), { recursive: true });
  const cuenta = { guardados: 0, repeticiones: 0, fallidos: 0, yaHechos: 0 };

  for (const linea of lineas) {
    const customId = linea.custom_id;
    if (hechos.has(customId)) { cuenta.yaHechos++; continue; }
    const m = meta[customId];
    const { mensajeAlModelo, controlBloqueo } = meta[m.perfilId];
    const data = linea.result?.type === "succeeded" ? linea.result.message : null;
    const modelo = data?.model ?? estado.modelo;
    const resultado = data ? { ...interpretar(data, modelo), mensajeAlModelo } : null;
    const fallo = data ? resultado.fallo ?? null : `lote: ${linea.result?.type} ${JSON.stringify(linea.result?.error ?? {}).slice(0, 300)}`;
    fs.writeFileSync(archivo(`respuestas/${customId}.json`), JSON.stringify({ ...m, respuesta: data, resultado, fallo }, null, 1));

    let analysisId = null;
    // Sólo la primera repetición es el análisis del cliente. Una que no
    // trajo respuesta no se guarda: queda para volver a correrla.
    if (m.repeticion === 1 && data) {
      const { data: existente } = await supabase.from("analysis_results").select("id")
        .eq("client_profile_id", m.perfilId).eq("llm_request_id", data.id).maybeSingle();
      if (existente) {
        analysisId = existente.id;
      } else {
        const { data: run, error: e1 } = await supabase.from("ingestion_runs")
          .insert({ client_id: m.clientId, status: "en_progreso", requested_by: estado.responsable }).select("id").single();
        if (e1) throw new Error(motivo(e1));
        const fila = filaDelAnalisis({
          runId: run.id, clientId: m.clientId, clientProfileId: m.perfilId, marcoVersion: estado.marco,
          criterioVersionId: estado.criterioVersionId, llmResult: resultado, controlBloqueo,
          duracionIngestaMs: null, duracionLlmMs: null,
        });
        const { data: guardado, error: e2 } = await supabase.from("analysis_results").insert(fila).select("id").single();
        if (e2) throw new Error(`${m.cedula}: ${motivo(e2)}`);
        analysisId = guardado.id;
        await supabase.from("ingestion_runs").update({ status: "completado", completed_at: new Date().toISOString() }).eq("id", run.id);
        await supabase.from("audit_log").insert({
          actor: estado.responsable, action: "client.analyze", client_id: m.clientId,
          meta: { ingestion_run_id: run.id, crediscope_score: fila.crediscope_score, recomendacion: fila.recomendacion,
            control_bloqueado: controlBloqueo.bloqueado === true, lote_anthropic: estado.batchId },
        });
        cuenta.guardados++;
      }
    } else if (data) {
      cuenta.repeticiones++;
    }
    if (!data) cuenta.fallidos++;

    await registrarLlamadaLlm(supabase, {
      funcion: "analisis-en-lote",
      modelo,
      exito: !fallo,
      error: fallo,
      stopReason: data?.stop_reason ?? null,
      uso: data?.usage ?? null,
      requestId: data?.id ?? null,
      clientId: m.clientId,
      analysisResultId: analysisId,
      contexto: { cedula: m.cedula, marco: estado.marco, lote: estado.batchId, repeticion: m.repeticion },
      esPrueba: m.repeticion > 1,
      actor: estado.responsable,
      razonamiento: estado.config.razonamiento,
      maxTokens: estado.config.maxTokens,
      tarifa: "lote",
    });
    hechos.add(customId);
    escribir("procesados.json", [...hechos]);
  }
  console.log(`Lote ${estado.batchId}:`, cuenta);
  resumir();
}

// --------------------------------------------------------------- resumen
// Lo que importa leer antes de usar los puntajes: cuántos salieron, cuánto
// costó, si la caché se leyó, y cuánto cambia el mismo perfil entre corridas.
function resumir() {
  const rs = fs.readdirSync(archivo("respuestas")).map((f) => JSON.parse(fs.readFileSync(archivo(`respuestas/${f}`), "utf8")));
  const ok = rs.filter((x) => !x.fallo);
  const suma = (k) => rs.reduce((a, x) => a + (x.respuesta?.usage?.[k] ?? 0), 0);
  console.log(`Respuestas: ${rs.length}, completas ${ok.length}, con fallo ${rs.length - ok.length}`);
  console.log(`Tokens: entrada ${suma("input_tokens")}, caché leída ${suma("cache_read_input_tokens")}, caché escrita ${suma("cache_creation_input_tokens")}, salida ${suma("output_tokens")}`);
  const recs = {};
  for (const x of ok.filter((x) => x.repeticion === 1)) recs[x.resultado.recomendacion] = (recs[x.resultado.recomendacion] ?? 0) + 1;
  console.log("Recomendaciones (primera corrida):", recs);
  const porPerfil = new Map();
  for (const x of ok) {
    if (!porPerfil.has(x.perfilId)) porPerfil.set(x.perfilId, []);
    porPerfil.get(x.perfilId).push(x.resultado);
  }
  const repetidos = [...porPerfil.values()].filter((v) => v.length > 1);
  if (repetidos.length) {
    const rangos = repetidos.map((v) => Math.max(...v.map((y) => y.score)) - Math.min(...v.map((y) => y.score)));
    const cambian = repetidos.filter((v) => new Set(v.map((y) => y.recomendacion)).size > 1).length;
    rangos.sort((a, b) => a - b);
    console.log(`Ruido en ${repetidos.length} perfiles repetidos: rango de score mediana ${rangos[Math.floor(rangos.length / 2)]}, máximo ${rangos.at(-1)}; cambian de recomendación ${cambian}`);
  }
}

if (PASO === "preparar") await preparar();
else if (PASO === "enviar") await enviar();
else if (PASO === "recoger") await recoger();
else console.log("Paso: preparar | enviar | recoger (ver la cabecera del archivo)");
