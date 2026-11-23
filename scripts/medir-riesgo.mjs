// El seco del veredicto de riesgo (E10, docs/estandar-de-la-institucion.md, sección 7.1, etapa 1; y las 14 decisiones de R2 a R4).
//
// Por persona real (sin las sintéticas), con el último perfil guardado y su crudo, con el reloj fijado en la fecha de su consulta y SIN
// buró (el escenario que se diseña primero):
//   1. deriva la capa de hechos (`derivarHechos`) y arma la entrada de riesgo (`entradaDeRiesgoDesdeHechos`);
//   2. calcula el veredicto de riesgo con cada una de las tres plantillas (por defecto, conservadora y expansiva);
//   3. cuenta cuántas personas quedan en cada nivel, por qué (los motivos que deciden el nivel), el tramo de mora por sector, el historial
//      (eventos, superado, fila del decaimiento), los atenuantes y agravantes, y hasta dónde puede subir la IA;
//   4. cruza el nivel con lo que recomendó el modelo (aprobar, revisar, negar o sin análisis) y cuenta lo que cambia de lectura;
//   5. los casos de oro reales del banco (`scripts/banco-de-casos-de-oro/casos/c-*.json`): su nivel con las tres plantillas contra la
//      recomendación de hoy y la salida de la versión mayor que fijó el negocio.
//
// Condiciones que corta con 1 (7.3): ninguna persona con un bloqueo vigente sale de Negar (no es de este cálculo: se cuenta cuántas
// tienen bloqueo), ninguna con mal comportamiento vigente puede subir a Aprobar con la plantilla por defecto, y todo estado de un factor
// no medido sale «no_medido».
//
// SOLO LEE. No llama a Proveedor_Info_1, a Equifax ni al modelo, y no escribe en la base. Por consola, sólo conteos y referencias c-xxxxxxxx.
//
// Uso: node scripts/medir-riesgo.mjs [--carpeta=research/...] [--limite=N] [--sin-base]
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo con --limite=20 antes de confiar en los números.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { candidatosDelUltimoPerfil, leerCrudo } from "./_comun/crudo-del-ultimo-perfil.mjs";
import { cargarEntorno, raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.length ? v.join("=") : true];
}));
const PRINCIPAL = raizPrincipal(RAIZ);
const CARPETA = path.resolve(PRINCIPAL, typeof args.carpeta === "string" ? args.carpeta : "research/proveedor-info-1-raw-2026-10-03");
if (!fs.existsSync(CARPETA)) {
  console.error("No existe la carpeta del respaldo del crudo.");
  process.exit(1);
}
const LIMITE = args.limite ? Number(args.limite) : Infinity;
const importar = (ruta) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", ruta)).href);

const { derivarHechos } = await importar("hechos/indice.ts");
const { entradaDeRiesgoDesdeHechos } = await importar("riesgo/entrada.ts");
const { calcularVeredictoDeRiesgo } = await importar("riesgo/veredicto-de-riesgo.ts");
const { plantillaCompleta } = await importar("estandar/configurar-estandar.ts");
const { CORTE_IESS_CONOCIDO } = await importar("fuentes-ingreso.ts");
const { evaluarControlesBloqueo } = await importar("controles-bloqueo.ts");

const PLANTILLAS = ["por_defecto", "conservadora", "expansiva"];
const ESTANDARES = Object.fromEntries(PLANTILLAS.map((p) => [p, plantillaCompleta(p)]));
const NIVELES = ["bajo", "con_observaciones", "deteriorado", "mal_comportamiento"];

const suma = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const pct = (a, b) => (b === 0 ? "0%" : `${Math.round((a / b) * 1000) / 10}%`.replace(".", ","));
const ordenado = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);

// ---- las personas, su crudo y lo que recomendó el modelo ----
let candidatos;
const recomendacionDe = new Map(); // cita -> recomendacion
const citaDeCandidato = (c) => c.cita ?? null;
if (!args["sin-base"]) {
  cargarEntorno(RAIZ);
  const cabeceras = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  const pedir = async (ruta) => {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, { headers: cabeceras });
    const texto = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
    return JSON.parse(texto);
  };
  // PostgREST corta en 1.000: se pagina por id (o por client_id).
  const paginar = async (tabla, select, orden, filtro = "") => {
    const filas = [];
    for (let despues = null; ; ) {
      const p = await pedir(`${tabla}?select=${select}${filtro}&order=${orden}&limit=1000${despues ? `&${orden}=gt.${despues}` : ""}`);
      filas.push(...p);
      if (p.length < 1000) return filas;
      despues = p.at(-1)[orden];
    }
  };
  const sinteticas = new Set((await paginar("clients", "id", "id", "&es_sintetico=eq.true")).map((c) => c.id));
  const ultimoPorCliente = new Map();
  for (let despues = null; ; ) {
    const filas = await pedir(`client_profiles?select=id,client_id,created_at,crudo_ruta&order=id&limit=1000${despues ? `&id=gt.${despues}` : ""}`);
    for (const p of filas) {
      if (sinteticas.has(p.client_id)) continue;
      const a = ultimoPorCliente.get(p.client_id);
      if (!a || p.created_at > a.created_at) ultimoPorCliente.set(p.client_id, p);
    }
    if (filas.length === 0) break;
    despues = filas.at(-1).id;
  }
  const resumen = await paginar("resumen_por_persona", "client_id,recomendacion,es_sintetico", "client_id", "&es_sintetico=eq.false");
  for (const r of resumen) recomendacionDe.set(`c-${r.client_id.slice(0, 8)}`, r.recomendacion ?? null);
  const r = candidatosDelUltimoPerfil(CARPETA, ultimoPorCliente);
  console.log(`Personas reales: ${ultimoPorCliente.size}; crudo en la carpeta ${r.cuenta.enLaCarpeta}, en el depósito ${r.cuenta.delDeposito}, sin crudo ${r.cuenta.sinCrudo}.`);
  const clientePorPerfil = new Map([...ultimoPorCliente.values()].map((p) => [p.id, p.client_id]));
  candidatos = r.candidatos.map((c) => ({ ...c, cita: `c-${clientePorPerfil.get(c.perfilId).slice(0, 8)}`, leer: () => leerCrudo(c, process.env.SUPABASE_URL, cabeceras) }));
} else {
  candidatos = fs.readdirSync(CARPETA).filter((a) => a.endsWith(".json")).map((a) => ({ archivo: path.join(CARPETA, a), leer: () => leerCrudo({ archivo: path.join(CARPETA, a) }) }));
}
candidatos = candidatos.slice(0, LIMITE);

// ---- los casos de oro reales ----
const casosDeOro = new Map();
for (const a of fs.readdirSync(path.join(RAIZ, "scripts/banco-de-casos-de-oro/casos")).filter((x) => /^c-[0-9a-f]{8}\.json$/.test(x))) {
  const c = JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts/banco-de-casos-de-oro/casos", a), "utf8"));
  casosDeOro.set(c.id, { hoy: c.recomendacion_hoy, version_mayor: c.salida_version_mayor, tema: c.tema });
}

// ---- el cálculo ----
const T = Object.fromEntries(PLANTILLAS.map((p) => [p, {
  niveles: {}, motivos: {}, vigente: 0, historico: 0, sinHistorial: 0, tramoPorSector: { sbs: {}, seps: {}, comercial: {} }, tramo: {},
  eventos: 0, conEventos: 0, superado: {}, efecto: {}, demanda: {}, ia: {}, atenuantes: {}, agravantes: {}, sinMedir: {}, cruce: {}, bloqueos: {},
}]));
const gold = [];
const fallos = [];
let sinCrudo = 0;
let calculadas = 0;
let ms = 0;

for (const c of candidatos) {
  const crudo = await c.leer();
  if (!crudo.raw || !crudo.capturadoEl) { sinCrudo++; continue; }
  const { raw, cedula, capturadoEl } = crudo;
  const hechos = derivarHechos(raw, { cedula, consulta: crudo.perfilId ?? "sin-perfil", fechaDeLaConsulta: capturadoEl, corteIess: CORTE_IESS_CONOCIDO, persona: { nombre: null, fechaDeNacimiento: null } }, { estricto: true });
  const entrada = entradaDeRiesgoDesdeHechos(hechos, { conBuro: false });
  const bloqueada = (() => { try { return evaluarControlesBloqueo(raw, cedula).bloqueado; } catch { return null; } })();
  const hoy = recomendacionDe.get(c.cita) ?? (args["sin-base"] ? "sin_base" : "sin_analisis");
  const porPlantilla = {};
  for (const p of PLANTILLAS) {
    const t0 = performance.now();
    const v = calcularVeredictoDeRiesgo(entrada, ESTANDARES[p]);
    ms += performance.now() - t0;
    porPlantilla[p] = v;
    const r = T[p];
    suma(r.niveles, v.nivel);
    for (const m of v.motivos.filter((x) => x.nivel === v.nivel)) suma(r.motivos, m.codigo + (m.detalle && m.codigo === "mora_vigente" ? `:${m.detalle}` : ""));
    if (v.nivel === "mal_comportamiento") suma(r, v.malComportamientoVigente ? "vigente" : "historico");
    if (v.sinHistorialDeCredito) r.sinHistorial++;
    for (const [s, x] of Object.entries(v.mora.sectores)) suma(r.tramoPorSector[s], x.tramo);
    suma(r.tramo, v.mora.tramo);
    r.eventos += v.historial.eventos.length;
    if (v.historial.eventos.length) {
      r.conEventos++;
      suma(r.superado, String(v.historial.superado.superado));
      suma(r.efecto, v.historial.efecto);
    }
    if (v.demandaDeCobro.nivel || v.demandaDeCobro.seMenciona) suma(r.demanda, `${v.demandaDeCobro.nivel ?? "antecedente"}${v.demandaDeCobro.bajoPorSuperado ? "+baja" : ""}${v.demandaDeCobro.reincidente ? "+reincide" : ""}`);
    if (v.ia) {
      suma(r.ia, `${v.ia.permiso.puede ? "puede subir" : "no puede subir"} (${v.ia.permiso.porque})`);
      if (v.ia.permiso.puede) suma(r.ia, `techo ${v.ia.techo} ${v.malComportamientoVigente ? "(mora de hoy)" : "(histórico)"}`);
      for (const a of v.atenuantes) suma(r.atenuantes, `${a.id}:${a.estado}`);
      for (const a of v.agravantes) if (a.estado === "se_cumple") suma(r.agravantes, a.id);
    }
    for (const x of v.sinMedir) suma(r.sinMedir, x.replace(/^(sbs|seps|comercial):/, "$1:"));
    if (!r.cruce[v.nivel]) r.cruce[v.nivel] = {};
    suma(r.cruce[v.nivel], hoy);
    if (bloqueada) suma(r.bloqueos, v.nivel);
    // La condición de 7.3: con mal comportamiento de hoy la IA no sube a Aprobar (por defecto).
    if (p === "por_defecto" && v.malComportamientoVigente && v.ia?.techo === "aprobar") fallos.push(`${c.cita ?? "persona"}: mal comportamiento vigente con techo Aprobar`);
    if (v.atenuantes && v.atenuantes.some((a) => a.estado === "se_cumple" && a.valor === null && a.porque === "sin_buro")) fallos.push(`${c.cita ?? "persona"}: un atenuante sin buró sale «se cumple»`);
  }
  calculadas++;
  if (c.cita && casosDeOro.has(c.cita)) gold.push({ cita: c.cita, ...casosDeOro.get(c.cita), niveles: Object.fromEntries(PLANTILLAS.map((p) => [p, porPlantilla[p].nivel])), motivos: porPlantilla.por_defecto.motivos.filter((m) => m.nivel === porPlantilla.por_defecto.nivel).map((m) => m.codigo), vigente: porPlantilla.por_defecto.malComportamientoVigente });
}

console.log(`\nSeco del veredicto de riesgo: ${calculadas} personas (sin crudo: ${sinCrudo}), sin buró, con el reloj en la fecha de cada consulta. Tiempo medio: ${(ms / Math.max(1, calculadas * PLANTILLAS.length)).toFixed(3)} ms por veredicto.`);
for (const p of PLANTILLAS) {
  const r = T[p];
  console.log(`\n=== Plantilla ${p} ===`);
  console.log("Niveles:", NIVELES.map((n) => `${n} ${r.niveles[n] ?? 0} (${pct(r.niveles[n] ?? 0, calculadas)})`).join(" · "));
  console.log("Mal comportamiento: vigente", r.vigente ?? 0, "· histórico", r.historico ?? 0, "· sin historial de crédito (nivel bajo, tope 799):", r.sinHistorial);
  console.log("Por qué (motivos que deciden el nivel, una persona puede tener varios):", ordenado(r.motivos).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("Tramo de mora de la persona:", ordenado(r.tramo).map(([k, n]) => `${k} ${n}`).join(" · "));
  for (const [s, t] of Object.entries(r.tramoPorSector)) console.log(`  sector ${s}:`, ordenado(t).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log(`Historial: ${r.conEventos} personas con ${r.eventos} eventos; superado:`, ordenado(r.superado).map(([k, n]) => `${k} ${n}`).join(" · "), "· efecto:", ordenado(r.efecto).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("Demanda de cobro:", ordenado(r.demanda).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("IA:", ordenado(r.ia).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("Agravantes que se cumplen:", ordenado(r.agravantes).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("Atenuantes (id:estado):", ordenado(r.atenuantes).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("Sin medir:", ordenado(r.sinMedir).map(([k, n]) => `${k} ${n}`).join(" · "));
  console.log("Con un bloqueo vigente, por nivel:", ordenado(r.bloqueos).map(([k, n]) => `${k} ${n}`).join(" · ") || "ninguna");
  console.log("Nivel × lo que recomendó el modelo:");
  for (const n of NIVELES) if (r.cruce[n]) console.log(`  ${n}:`, ordenado(r.cruce[n]).map(([k, x]) => `${k} ${x}`).join(" · "));
}

console.log("\n=== Casos de oro reales (nivel con las tres plantillas; hoy = lo que se entrega hoy; v. mayor = lo que fijó el negocio) ===");
for (const g of gold.sort((a, b) => a.cita.localeCompare(b.cita))) {
  console.log(`${g.cita}: ${PLANTILLAS.map((p) => g.niveles[p]).join(" / ")} · hoy ${g.hoy} · v. mayor ${g.version_mayor} · motivos ${g.motivos.join("+") || "ninguno"}${g.vigente ? " (vigente)" : ""}`);
}
console.log(`Casos de oro reales con crudo: ${gold.length} de ${casosDeOro.size}.`);

if (fallos.length) {
  console.error(`\nCONDICIONES QUE NO SE CUMPLEN (${fallos.length}):`);
  for (const f of fallos.slice(0, 20)) console.error(" -", f);
  process.exit(1);
}
console.log("\nCondiciones de 7.3 que se cuentan acá: cumplidas.");
