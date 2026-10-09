// Compara configuraciones de razonamiento del modelo sobre los mismos
// clientes y deja todo guardado para analizar: la respuesta cruda de cada
// llamada (con su razonamiento interno) y un Excel para leerlo a mano.
//
// Nació el 2026-09-27: el primer análisis de c-2a50c228 con marco-v24
// costó $0,147 y se cortó dos veces (6.000 y 10.000 tokens, 9.362 de
// ellos de razonamiento). La respuesta visible se mantuvo en 950-1.700
// tokens en todas las versiones del marco; lo que creció fue la
// deliberación, que no se ve y se factura como salida.
//
// El pedido lo arma armarPedidoScoring() de llm-scoring.ts, el MISMO que
// usa el análisis: mismo marco, mismos ajustes vigentes, mismo perfil del
// modelo y mismos campos ocultos. Sólo cambia la configuración de
// razonamiento. Cada llamada queda en llm_llamadas como prueba
// (es_prueba = true, funcion = "comparacion-razonamiento").
//
// Se puede cortar y retomar: una llamada ya guardada no se repite (ni se
// paga dos veces).
//
// Uso:
//   node scripts/comparar-razonamiento.mjs [--cedulas=research/cedulas_validacion_marco_v23.txt]
//        [--configs=hoy,sin,medio] [--solo=N] [--concurrencia=3]
//        [--salida=research/comparacion-razonamiento-AAAA-MM-DD] [--solo-excel]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";

XLSX.set_fs(fs);

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const arg = (nombre, porDefecto) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? porDefecto;
const HOY = new Date().toISOString().slice(0, 10);
const SALIDA = path.resolve(RAIZ, arg("salida", `research/comparacion-razonamiento-${HOY}`));
const CARPETA_CRUDO = path.join(SALIDA, "crudo");
const SOLO_EXCEL = process.argv.includes("--solo-excel");
const CONCURRENCIA = Number(arg("concurrencia", "3"));

// Los secretos se leen del archivo y no se imprimen.
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
// llm-scoring.ts lee la clave con Deno.env al cargarse.
globalThis.Deno = { env: { get: (k) => env[k] } };

const compartido = (archivo) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", archivo)).href);
const { armarPedidoScoring, interpretar, CONFIG_LLM, MARCO_VERSION, MODELO } = await compartido("llm-scoring.ts");
const { loadDisabledFields } = await compartido("runtime-config.ts");
const { registrarLlamadaLlm } = await compartido("llm-log.ts");

// "hoy" es exactamente la configuración de producción (CONFIG_LLM), para
// que la comparación sea contra lo que el analista recibe.
const CONFIGURACIONES = {
  hoy: { etiqueta: "Hoy (razonamiento activo)", config: CONFIG_LLM },
  sin: { etiqueta: "Sin razonamiento", config: { razonamiento: "desactivado", maxTokens: CONFIG_LLM.maxTokens } },
  medio: { etiqueta: "Razonamiento con esfuerzo medio", config: { razonamiento: "adaptativo", esfuerzo: "medium", maxTokens: CONFIG_LLM.maxTokens } },
  // Lo mismo que "hoy", otra vez: sin esto no se sabe cuánto cambia el
  // modelo de una corrida a otra, y una diferencia contra "hoy" no se
  // puede atribuir a nada (marco v28, 2026-10-03).
  hoy2: { etiqueta: "Hoy, segunda corrida (ruido)", config: CONFIG_LLM },
  // "nuevo" y "s55" se corren con el marco nuevo en el código: el marco de
  // cada llamada queda guardado en su archivo.
  nuevo: { etiqueta: "Marco nuevo, mismo modelo", config: CONFIG_LLM },
  s55: { etiqueta: "Marco nuevo, Sonnet 5.5", config: { ...CONFIG_LLM, modelo: "claude-sonnet-5-5" } },
  // El marco armado según el cliente (marco-por-cliente.ts), contra "hoy"
  // con el marco entero: si coincide dentro del ruido, se puede adoptar.
  porCliente: { etiqueta: "Marco por cliente", config: { ...CONFIG_LLM, marcoPorCliente: true } },
};
const CLAVES = arg("configs", "hoy,sin,medio").split(",").filter((c) => CONFIGURACIONES[c]);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Constancia de la corrida (ejecuciones_operativas, 117): sin ella no se toca la base.
await abrirEjecucion({ url: env.SUPABASE_URL, clave: env.SUPABASE_SERVICE_ROLE_KEY, guion: "comparar-razonamiento", seco: false });

const modeloDe = (clave) => CONFIGURACIONES[clave].config.modelo ?? MODELO;
const precios = new Map();
for (const modelo of new Set(CLAVES.map(modeloDe))) {
  const { data: precio, error: errPrecio } = await supabase
    .from("llm_precios").select("*").eq("modelo", modelo).order("vigente_desde", { ascending: false }).limit(1).maybeSingle();
  if (errPrecio || !precio) throw new Error(`Sin precio para ${modelo}: ${errPrecio?.message ?? "no hay fila en llm_precios"}`);
  precios.set(modelo, precio);
}
const costoDe = (u = {}, modelo) => {
  const precio = precios.get(modelo);
  return ((u.input_tokens ?? 0) * precio.usd_entrada + (u.output_tokens ?? 0) * precio.usd_salida
    + (u.cache_creation_input_tokens ?? 0) * precio.usd_cache_escritura + (u.cache_read_input_tokens ?? 0) * precio.usd_cache_lectura) / 1e6;
};

const archivoDe = (cedula, clave) => path.join(CARPETA_CRUDO, `${cedula}__${clave}.json`);

// ---------------------------------------------------------------- corrida
if (!SOLO_EXCEL) {
  fs.mkdirSync(CARPETA_CRUDO, { recursive: true });
  const cedulas = fs.readFileSync(path.resolve(RAIZ, arg("cedulas", "research/cedulas_validacion_marco_v23.txt")), "utf8")
    .split(/\s+/).filter((c) => /^\d{10}$/.test(c)).slice(0, Number(arg("solo", "1000")));

  const camposDeshabilitados = await loadDisabledFields(supabase);

  // El último perfil de cada cédula: el que usa "Analizar" en la pantalla.
  const perfiles = new Map();
  for (const cedula of cedulas) {
    const { data: cliente, error: e1 } = await supabase.from("clients").select("id").eq("cedula", cedula).maybeSingle();
    if (e1 || !cliente) { console.log(`${cedula}: no está en la cartera, se salta`); continue; }
    const { data: perfil, error: e2 } = await supabase.from("client_profiles")
      .select("id, created_at, standard_profile, control_bloqueo").eq("client_id", cliente.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (e2 || !perfil) { console.log(`${cedula}: sin perfil guardado, se salta`); continue; }
    perfiles.set(cedula, { clientId: cliente.id, ...perfil });
  }

  // Primero "hoy" y "sin" en todos, después "medio": si hay que cortar,
  // lo más importante ya está.
  const tareas = CLAVES.flatMap((clave) => [...perfiles.keys()].map((cedula) => ({ cedula, clave })))
    .filter(({ cedula, clave }) => !fs.existsSync(archivoDe(cedula, clave)));
  console.log(`${perfiles.size} clientes, ${tareas.length} llamadas por hacer (${MARCO_VERSION}, ${MODELO})`);

  let costoTotal = 0;
  const trabajar = async () => {
    for (let t = tareas.shift(); t; t = tareas.shift()) {
      const { cedula, clave } = t;
      const p = perfiles.get(cedula);
      const { config } = CONFIGURACIONES[clave];
      const cuerpo = armarPedidoScoring(p.standard_profile, p.control_bloqueo ?? { hallazgos: [] }, camposDeshabilitados, config);
      const inicio = Date.now();
      let data = null, httpStatus = null, errorHttp = null;
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            ...(env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID } : {}),
          },
          body: JSON.stringify(cuerpo),
        });
        httpStatus = res.status;
        const texto = await res.text();
        if (res.ok) data = JSON.parse(texto); else errorHttp = texto.slice(0, 600);
      } catch (err) {
        errorHttp = String(err);
      }
      const duracionMs = Date.now() - inicio;
      const modelo = modeloDe(clave);
      const resultado = data ? interpretar(data, modelo) : null;
      const fallo = errorHttp ? `HTTP ${httpStatus}: ${errorHttp}` : resultado?.fallo ?? null;
      const costo = costoDe(data?.usage, modelo);
      costoTotal += costo;

      // Un error de la API (pedido mal formado, límite) no se guarda: así
      // la próxima corrida lo reintenta. Una respuesta cortada SÍ: es un
      // resultado de esa configuración.
      if (data) {
        fs.writeFileSync(archivoDe(cedula, clave), JSON.stringify({
          cedula, clave, config, marco: MARCO_VERSION, perfilId: p.id, perfilDel: p.created_at,
          fecha: new Date().toISOString(), duracionMs, costoUsd: costo, respuesta: data, resultado, fallo,
        }, null, 1));
      }
      await registrarLlamadaLlm(supabase, {
        funcion: "comparacion-razonamiento",
        modelo: data?.model ?? modelo,
        exito: !fallo,
        error: fallo,
        stopReason: data?.stop_reason ?? null,
        uso: data?.usage ?? null,
        duracionMs,
        requestId: data?.id ?? null,
        clientId: p.clientId,
        contexto: { cedula, marco: MARCO_VERSION, configuracion: clave, esfuerzo: config.esfuerzo ?? null },
        esPrueba: true,
        razonamiento: config.razonamiento,
        maxTokens: config.maxTokens,
      });
      const u = data?.usage ?? {};
      console.log(
        `${cedula} ${clave.padEnd(5)} ${fallo ? "FALLÓ  " : "ok     "} score=${resultado?.score ?? "-"} ` +
        `${resultado?.recomendacion ?? "-"} salida=${u.output_tokens ?? "-"} razonamiento=${u.output_tokens_details?.thinking_tokens ?? "-"} ` +
        `${(duracionMs / 1000).toFixed(0)}s $${costo.toFixed(4)}${fallo ? ` · ${fallo.slice(0, 160)}` : ""}`,
      );
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajar));
  console.log(`Costo de esta corrida: $${costoTotal.toFixed(4)}`);
}

// ------------------------------------------------------------------ Excel
// Se arma siempre desde los archivos guardados, así se puede regenerar
// sin volver a llamar al modelo.
const filas = fs.existsSync(CARPETA_CRUDO)
  ? fs.readdirSync(CARPETA_CRUDO).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(CARPETA_CRUDO, f), "utf8")))
  : [];
if (filas.length === 0) { console.log("No hay resultados guardados para armar el Excel."); process.exit(0); }

const EXCEL_MAX = 32_000; // una celda de Excel admite 32.767 caracteres
const cortar = (s) => (s && s.length > EXCEL_MAX ? `${s.slice(0, EXCEL_MAX)} [...recortado]` : s ?? "");
const numerada = (lista) => (lista ?? []).map((x, i) => `${i + 1}. ${x}`).join("\n");
const red = (n, d = 4) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
const orden = Object.keys(CONFIGURACIONES);

const detalle = filas.map((f) => {
  const u = f.respuesta?.usage ?? {};
  const razonamiento = u.output_tokens_details?.thinking_tokens ?? null;
  const r = f.resultado ?? {};
  return {
    f, u, r,
    cedula: f.cedula,
    nombre: null, // se completa abajo desde el perfil
    clave: f.clave,
    configuracion: CONFIGURACIONES[f.clave]?.etiqueta ?? f.clave,
    estado: f.fallo ? (f.respuesta?.stop_reason === "max_tokens" ? "Cortado por largo" : "Falló") : "Completo",
    razonamiento,
    visible: razonamiento == null ? null : (u.output_tokens ?? 0) - razonamiento,
  };
});

// El nombre sale del perfil guardado (clients no lo tiene). El bloqueo
// también: en producción un caso bloqueado sale con score 1 y "negar"
// diga lo que diga el modelo, así que ahí la comparación no cambia nada.
{
  const cedulas = [...new Set(detalle.map((d) => d.cedula))];
  const datos = new Map();
  for (const d of detalle) {
    if (datos.has(d.cedula)) continue;
    const { data } = await supabase.from("client_profiles")
      .select("nombre:standard_profile->identidad->>nombreCompleto, bloqueado:control_bloqueo->bloqueado").eq("id", d.f.perfilId).maybeSingle();
    datos.set(d.cedula, { nombre: data?.nombre ?? "", bloqueado: data?.bloqueado === true });
  }
  for (const d of detalle) Object.assign(d, datos.get(d.cedula));
  detalle.sort((a, b) => cedulas.indexOf(a.cedula) - cedulas.indexOf(b.cedula) || orden.indexOf(a.clave) - orden.indexOf(b.clave));
}

const porCedula = new Map();
for (const d of detalle) {
  if (!porCedula.has(d.cedula)) porCedula.set(d.cedula, {});
  porCedula.get(d.cedula)[d.clave] = d;
}

const prom = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// Resumen: una fila por configuración.
const resumen = orden.filter((c) => detalle.some((d) => d.clave === c)).map((clave) => {
  const ds = detalle.filter((d) => d.clave === clave);
  const ok = ds.filter((d) => d.estado === "Completo");
  // La coincidencia con Hoy se mide sin los bloqueados: ahí el resultado
  // lo fija la política, no el modelo.
  const comparables = ok.filter((d) => !d.bloqueado && porCedula.get(d.cedula).hoy?.estado === "Completo");
  const iguales = comparables.filter((d) => porCedula.get(d.cedula).hoy.r.recomendacion === d.r.recomendacion).length;
  const difScore = comparables.map((d) => Math.abs(d.r.score - porCedula.get(d.cedula).hoy.r.score));
  return {
    "Configuración": CONFIGURACIONES[clave].etiqueta,
    "Casos": ds.length,
    "Completos": ok.length,
    "Cortados o con error": ds.length - ok.length,
    "Costo promedio por análisis (USD)": red(prom(ds.map((d) => d.f.costoUsd))),
    "Costo total (USD)": red(ds.reduce((a, d) => a + (d.f.costoUsd ?? 0), 0)),
    "Segundos promedio": red(prom(ds.map((d) => d.f.duracionMs / 1000)), 1),
    "Segundos máximo": red(Math.max(...ds.map((d) => d.f.duracionMs / 1000)), 1),
    "Tokens de entrada (prom.)": Math.round(prom(ds.map((d) => d.u.input_tokens)) ?? 0),
    "Tokens de salida (prom.)": Math.round(prom(ds.map((d) => d.u.output_tokens)) ?? 0),
    "  de ellos razonamiento (prom.)": Math.round(prom(ds.map((d) => d.razonamiento)) ?? 0),
    "  de ellos respuesta visible (prom.)": Math.round(prom(ds.map((d) => d.visible)) ?? 0),
    // A ~90 tokens por segundo, más de 8.000 es rozar el límite de 10.000
    // y los 150 s de Supabase.
    "Análisis de más de 8.000 tokens": ds.filter((d) => (d.u.output_tokens ?? 0) > 8000).length,
    "Score promedio (sin bloqueados)": red(prom(ok.filter((d) => !d.bloqueado).map((d) => d.r.score)), 0),
    "Misma recomendación que Hoy (sin bloqueados)": clave === "hoy" ? null : `${iguales} de ${comparables.length}`,
    "Diferencia de score contra Hoy (prom., absoluta, sin bloqueados)": clave === "hoy" ? null : red(prom(difScore), 0),
  };
});

// Por caso: una fila por cliente, las configuraciones lado a lado.
const CORTO = { hoy: "Hoy", sin: "Sin razonamiento", medio: "Esfuerzo medio", hoy2: "Hoy (2ª)", nuevo: "Marco nuevo", s55: "Sonnet 5.5", porCliente: "Por cliente" };
const porCaso = [...porCedula.entries()].map(([cedula, cs]) => {
  const fila = { "Cédula": cedula, "Nombre": Object.values(cs)[0]?.nombre ?? "", "Bloqueado por política": Object.values(cs)[0]?.bloqueado ? "Sí" : "No" };
  for (const clave of orden) {
    const d = cs[clave];
    if (!d) continue;
    const n = CORTO[clave];
    fila[`${n} · Estado`] = d.estado;
    fila[`${n} · Score`] = d.estado === "Completo" ? d.r.score : null;
    fila[`${n} · Recomendación`] = d.estado === "Completo" ? d.r.recomendacion : null;
    fila[`${n} · Riesgo`] = d.r.indicadorRiesgo ?? null;
    fila[`${n} · Historial`] = d.r.indicadorHistorial ?? null;
    fila[`${n} · Costo USD`] = red(d.f.costoUsd);
    fila[`${n} · Segundos`] = red(d.f.duracionMs / 1000, 1);
    fila[`${n} · Tokens razonamiento`] = d.razonamiento;
  }
  for (const clave of ["sin", "medio", "hoy2", "nuevo", "s55", "porCliente"]) {
    const d = cs[clave], h = cs.hoy;
    if (!d || !h) continue;
    const ambos = d.estado === "Completo" && h.estado === "Completo";
    fila[`${CORTO[clave]} · Score menos Hoy`] = ambos ? d.r.score - h.r.score : null;
    fila[`${CORTO[clave]} · ¿Misma recomendación?`] = ambos ? (d.r.recomendacion === h.r.recomendacion ? "Sí" : "No") : null;
  }
  return fila;
});

// Textos: las respuestas completas, las configuraciones de un mismo
// cliente una debajo de la otra para leerlas juntas.
const textos = detalle.map((d) => ({
  "Cédula": d.cedula,
  "Nombre": d.nombre,
  "Bloqueado por política": d.bloqueado ? "Sí" : "No",
  "Configuración": d.configuracion,
  "Estado": d.estado,
  "Score": d.estado === "Completo" ? d.r.score : null,
  "Recomendación": d.estado === "Completo" ? d.r.recomendacion : null,
  "Razonamiento (por qué)": cortar(d.estado === "Completo" ? d.r.reasoning : d.f.fallo),
  "Acciones sugeridas": cortar(numerada(d.r.accionesSugeridas)),
  "Positivos": cortar(numerada(d.r.positives)),
  "Negativos": cortar(numerada(d.r.negatives)),
  "Información faltante": cortar(numerada(d.r.missingInfo)),
  "N° positivos": d.r.positives?.length ?? 0,
  "N° negativos": d.r.negatives?.length ?? 0,
}));

// El texto del razonamiento: Sonnet 5 lo devuelve vacío (sólo informa
// cuántos tokens usó), así que la hoja sale únicamente si alguna llamada
// lo trajo.
const textoDe = (d, tipo, campo) => (d.f.respuesta?.content ?? []).filter((b) => b.type === tipo).map((b) => b[campo] ?? "").join("\n\n");
const deliberacion = detalle
  .map((d) => ({ "Cédula": d.cedula, "Configuración": d.configuracion, "Tokens de razonamiento": d.razonamiento, "Razonamiento interno": cortar(textoDe(d, "thinking", "thinking")) }))
  .filter((x) => x["Razonamiento interno"]);

const tecnico = detalle.map((d) => ({
  "Cédula": d.cedula,
  "Configuración": d.configuracion,
  "Estado": d.estado,
  "Motivo de término": d.f.respuesta?.stop_reason ?? null,
  "Tokens de entrada": d.u.input_tokens ?? null,
  "Tokens de salida": d.u.output_tokens ?? null,
  "Tokens de razonamiento": d.razonamiento,
  "Tokens de respuesta visible": d.visible,
  "Límite de tokens": d.f.config?.maxTokens ?? null,
  "Segundos": red(d.f.duracionMs / 1000, 1),
  "Costo USD": red(d.f.costoUsd),
  "Marco": d.f.marco,
  "Perfil usado (fecha)": d.f.perfilDel?.slice(0, 10) ?? null,
  "Fecha de la llamada": d.f.fecha?.slice(0, 19).replace("T", " ") ?? null,
  "Id de la respuesta": d.f.respuesta?.id ?? null,
  "Error": d.f.fallo ?? null,
  // Si se cortó, acá se ve dónde.
  "Respuesta sin interpretar": cortar(textoDe(d, "text", "text")),
}));

const notas = [
  ["Comparación de razonamiento del modelo"],
  [""],
  ["Generado", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"],
  ["Modelos", [...new Set(filas.map((f) => f.config?.modelo ?? MODELO))].join(", ")],
  ["Marcos", [...new Set(filas.map((f) => f.marco))].join(", ")],
  ...[...precios].map(([m, p]) => [`Precios ${m} (USD por millón de tokens)`, `entrada ${p.usd_entrada} · salida ${p.usd_salida}`]),
  [""],
  ["Configuraciones"],
  [CONFIGURACIONES.hoy.etiqueta, "La de producción: el modelo decide cuánto razona, sin tope propio. Límite total 10.000 tokens."],
  [CONFIGURACIONES.sin.etiqueta, "El modelo responde directo, sin deliberar antes."],
  [CONFIGURACIONES.medio.etiqueta, "El modelo decide cuánto razona, pero con esfuerzo medio."],
  [""],
  ["Cómo leerlo"],
  ["Resumen", "Una fila por configuración: costo, tiempo, tokens y cuánto coinciden con Hoy."],
  ["Por caso", "Una fila por cliente con las configuraciones lado a lado."],
  ["Textos", "Las respuestas completas; las de un mismo cliente van juntas para leerlas en paralelo."],
  ...(deliberacion.length
    ? [["Razonamiento interno", "Lo que el modelo pensó antes de responder, como lo devolvió la API."]]
    : [["Razonamiento interno", "No hay hoja: la API informa cuántos tokens razonó el modelo, pero no el texto."]]),
  ["Técnico", "Tokens, tiempos, costo e identificador de cada llamada, y la respuesta tal como llegó."],
  [""],
  ["Todas las llamadas usan el mismo marco, los mismos ajustes vigentes y el mismo perfil del modelo que el análisis de la pantalla."],
  ["Un análisis \"Cortado por largo\" es el que en la pantalla aparece como \"El análisis quedó a medias\"."],
  ["Las respuestas crudas están en la carpeta crudo/, al lado de este archivo."],
];

const hoja = (filasHoja, anchos) => {
  const ws = XLSX.utils.json_to_sheet(filasHoja);
  if (anchos) ws["!cols"] = anchos.map((w) => ({ wch: w }));
  if (filasHoja.length) ws["!autofilter"] = { ref: ws["!ref"] };
  return ws;
};
const wb = XLSX.utils.book_new();
const wsNotas = XLSX.utils.aoa_to_sheet(notas);
wsNotas["!cols"] = [{ wch: 38 }, { wch: 110 }];
XLSX.utils.book_append_sheet(wb, wsNotas, "Notas");
XLSX.utils.book_append_sheet(wb, hoja(resumen, [34, 7, 10, 12, 14, 12, 10, 10, 12, 12, 14, 16, 14, 14, 18, 22]), "Resumen");
XLSX.utils.book_append_sheet(wb, hoja(porCaso, [12, 34, 10, ...Array(40).fill(14)]), "Por caso");
XLSX.utils.book_append_sheet(wb, hoja(textos, [12, 30, 10, 22, 14, 7, 12, 80, 70, 70, 70, 70, 8, 8]), "Textos");
if (deliberacion.length) XLSX.utils.book_append_sheet(wb, hoja(deliberacion, [12, 22, 10, 120]), "Razonamiento interno");
XLSX.utils.book_append_sheet(wb, hoja(tecnico, [12, 26, 16, 12, 10, 10, 10, 10, 10, 9, 10, 10, 12, 20, 32, 60, 80]), "Técnico");

const archivoExcel = path.join(SALIDA, `comparacion-razonamiento-${HOY}.xlsx`);
XLSX.writeFile(wb, archivoExcel);
console.log(`Excel: ${path.relative(RAIZ, archivoExcel)} (${filas.length} llamadas)`);
