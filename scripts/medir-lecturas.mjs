// La medición en seco de las lecturas (E11, docs/capa-de-hechos.md, sección 11).
//
// Por persona, con el reloj fijado en la fecha de su consulta (`capturadoEl`):
//   1. el MENSAJE AL MODELO (`mensajeParaElModelo`, sin buró: con buró es el mismo código y la
//      sección del marco no se tocó) con el código de ahora contra el de --contra (por omisión
//      origin/main): tiene que ser igual byte a byte, y el texto del marco también;
//   2. las lecturas (`derivarLecturas`) sobre los hechos: por código, cuántas personas en cada
//      estado (se cumple, no se cumple, no se puede medir) y, en las de tramo, por valor;
//   3. la paridad de las lecturas que repiten algo que el modelo ya recibe en marco-v36 (el
//      Ingreso Mínimo SBU, dejar de aparecer en el IESS, los indicios, la continuidad, la caída
//      anual, las operaciones en atraso sin monto, la cuota y la deuda sobre el ingreso): la
//      lectura tiene que decir lo mismo que el perfil del modelo de hoy, salvo donde una fuente
//      no contestó (ahí el modelo lee el parcial y la lectura no se puede medir);
//   4. el tiempo de derivar las lecturas y lo que pesarían en el mensaje de la v37 (las que se
//      cumplen y las que no se pueden medir, con código, valor y texto), en caracteres y en tokens
//      estimados con la calibración de medir-bloque-equifax.mjs.
//
// SOLO LEE. Sin --deposito, sólo el respaldo local del crudo; con --deposito, el último perfil
// de cada persona real (PostgREST, sólo lectura) y su crudo de la carpeta o del depósito. No
// llama a Proveedor_Info_1, a Equifax ni al modelo, y no escribe en la base. Por consola, sólo
// conteos y referencias c-xxxxxxxx. Sale con 1 si un mensaje o el marco cambian, o si una
// paridad no da.
//
// Uso: node scripts/medir-lecturas.mjs [--deposito] [--carpeta=research/...] [--limite=N] [--contra=origin/main]
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo con --limite=5
// antes de confiar en los números.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
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
const CONTRA = typeof args.contra === "string" ? args.contra : "origin/main";

// Calibrados el 2026-10-16 con el contador de tokens de la API sobre texto inventado
// (scripts/medir-bloque-equifax.mjs): el marco rinde 2,37 caracteres por token y el JSON del perfil 1,63.
const CARACTERES_POR_TOKEN_MARCO = 2.37;
const CARACTERES_POR_TOKEN_JSON = 1.63;

const importar = (base, ruta) => import(pathToFileURL(path.join(base, ruta)).href);
const ahora = {
  process: await importar(RAIZ, "supabase/functions/_shared/process.ts"),
  controles: await importar(RAIZ, "supabase/functions/_shared/controles-bloqueo.ts"),
  perfilDelModelo: await importar(RAIZ, "supabase/functions/_shared/perfil-del-modelo.ts"),
  marco: await importar(RAIZ, "supabase/functions/_shared/marco-interpretativo.ts"),
};
const { derivarHechos } = await importar(RAIZ, "supabase/functions/_shared/hechos/indice.ts");
const { derivarLecturas, CATALOGO_DE_LECTURAS } = await importar(RAIZ, "supabase/functions/_shared/hechos/senales/lecturas.ts");
const { TRAMOS_QUE_SACA_LA_V37, ubicarTramos } = await importar(RAIZ, "supabase/functions/_shared/hechos/senales/marco-v37.ts");
const { CORTE_IESS_CONOCIDO } = await importar(RAIZ, "supabase/functions/_shared/fuentes-ingreso.ts");

// El código de la otra versión, sacado de git a una carpeta temporal (sin las pruebas).
const git = (...a) => execFileSync("git", ["-C", RAIZ, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sello = git("rev-parse", "--short=12", CONTRA).trim();
const destino = path.join(os.tmpdir(), `medir-lecturas-${sello}`);
for (const archivo of git("ls-tree", "-r", "--name-only", CONTRA, "supabase/functions/_shared").split("\n").filter((a) => a && !a.endsWith(".test.ts"))) {
  const salida = path.join(destino, archivo);
  if (fs.existsSync(salida)) continue;
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, execFileSync("git", ["-C", RAIZ, "show", `${CONTRA}:${archivo}`], { maxBuffer: 64 * 1024 * 1024 }));
}
const antes = {
  process: await importar(destino, "supabase/functions/_shared/process.ts"),
  controles: await importar(destino, "supabase/functions/_shared/controles-bloqueo.ts"),
  perfilDelModelo: await importar(destino, "supabase/functions/_shared/perfil-del-modelo.ts"),
  marco: await importar(destino, "supabase/functions/_shared/marco-interpretativo.ts"),
};
console.log(`Contra ${CONTRA} (${sello}, ${antes.process.PROCESS_VERSION}, ${antes.marco.MARCO_VERSION}).`);

let fallo = false;
const marcoIgual = ahora.marco.MARCO_INTERPRETATIVO === antes.marco.MARCO_INTERPRETATIVO && ahora.marco.marcoConElBuro(true) === antes.marco.marcoConElBuro(true);
console.log(`El texto del marco (sin y con buró), igual: ${marcoIgual ? "sí" : "NO"}.`);
if (!marcoIgual) fallo = true;

// ---- Los candidatos: igual que comparar-hechos.mjs ----

let candidatos;
if (args.deposito) {
  cargarEntorno(RAIZ);
  const cabeceras = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  const pedir = async (ruta) => {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, { headers: cabeceras });
    const texto = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
    return JSON.parse(texto);
  };
  const sinteticas = new Set();
  for (let despues = null; ; ) {
    const filas = await pedir(`clients?select=id&es_sintetico=eq.true&order=id&limit=1000${despues ? `&id=gt.${despues}` : ""}`);
    for (const f of filas) sinteticas.add(f.id);
    if (filas.length < 1000) break;
    despues = filas.at(-1).id;
  }
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
  const r = candidatosDelUltimoPerfil(CARPETA, ultimoPorCliente);
  console.log(`Personas reales: ${ultimoPorCliente.size}; crudo en la carpeta ${r.cuenta.enLaCarpeta}, en el depósito ${r.cuenta.delDeposito}, sin crudo ${r.cuenta.sinCrudo}.`);
  const clientePorPerfil = new Map([...ultimoPorCliente.values()].map((p) => [p.id, p.client_id]));
  candidatos = r.candidatos.map((c) => ({ ...c, cita: `c-${clientePorPerfil.get(c.perfilId).slice(0, 8)}`, leer: () => leerCrudo(c, process.env.SUPABASE_URL, cabeceras) }));
} else {
  candidatos = fs.readdirSync(CARPETA).filter((a) => a.endsWith(".json")).map((a) => ({ archivo: path.join(CARPETA, a), leer: () => leerCrudo({ archivo: path.join(CARPETA, a) }) }));
}
candidatos = candidatos.slice(0, LIMITE);

function armarEnFecha(instante, fn) {
  const DateReal = globalThis.Date;
  const fijo = new DateReal(instante).getTime();
  class DateFijo extends DateReal {
    constructor(...a) { super(...(a.length ? a : [fijo])); }
    static now() { return fijo; }
  }
  globalThis.Date = DateFijo;
  try { return fn(); } finally { globalThis.Date = DateReal; }
}
function estadistica(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return null;
  const en = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const r = (x) => Math.round(x * 100) / 100;
  return { media: r(v.reduce((a, b) => a + b, 0) / v.length), mediana: r(en(0.5)), p90: r(en(0.9)), p99: r(en(0.99)), max: r(v[v.length - 1]) };
}
const mensaje = (lado, perfil, raw, cedula, capturadoEl) =>
  armarEnFecha(capturadoEl, () => {
    const control = lado.controles.evaluarControlesBloqueo(raw, cedula);
    return JSON.stringify(lado.perfilDelModelo.mensajeParaElModelo(perfil, control.hallazgos, new Set(), null, new Date(capturadoEl)));
  });

// ---- La paridad con lo que el modelo ya recibe (3) ----

const pct = (a, b) => Math.round((a / b) * 100);
// El mensaje lleva todo número entero (v29) y la lectura usa el ingreso exacto: medio dólar de
// redondeo en el ingreso mueve en dos puntos el porcentaje de una deuda de 40 veces el ingreso anual.
// La cuota también llega redondeada, y cerca de un ,5% cambia el entero; la deuda total no, porque los dos lados la suman de partes ya redondeadas. Vale si la lectura cae entre los
// porcentajes de los extremos del redondeo, y nada más.
const dentroDelRedondeo = (valor, monto, ingreso, meses, montoRedondeado) => {
  const m = montoRedondeado ? 0.5 : 0;
  return valor >= pct(monto - m, meses * (ingreso + 0.5)) && valor <= pct(monto + m, meses * Math.max(ingreso - 0.5, 0.01));
};
const PARIDADES = {
  "lec.ing.minimo_sbu": (s, m) => (s.estado === "se_cumple") === (m.fuentesIngreso?.esIngresoMinimoSbu === true),
  "lec.ing.dejo_de_aportar": (s, m) => (s.estado === "se_cumple") === (m.fuentesIngreso?.sinInformacionActualEnElIess === true),
  "lec.ing.indicios_de_ingreso_mayor": (s, m) => (s.valor?.length ?? 0) === (m.fuentesIngreso?.indiciosIngresoMayor?.length ?? 0),
  "lec.ing.continuidad": (s, m) => s.valor === (m.fuentesIngreso?.estabilidad?.continuidadLaboral?.meses ?? null),
  "lec.ing.variacion_anual": (s, m) => s.valor === (m.fuentesIngreso?.estabilidad?.variacionContraHaceUnAnioPct ?? null),
  "lec.ban.atraso_sin_monto": (s, m) => s.valor === (m.comportamientoBancario?.operacionesEnAtrasoSinMonto ?? 0),
  "lec.end.cuota_sobre_ingreso": (s, m) => {
    const ing = m.fuentesIngreso?.ingresoReportadoIess;
    const cuota = m.endeudamiento?.cuotaMensualConocida ?? 0;
    return ing > 0 ? (cuota > 0 ? dentroDelRedondeo(s.valor, cuota, ing, 1, true) : s.valor === 0) : s.valor === null;
  },
  "lec.end.deuda_sobre_ingreso_anual": (s, m) => {
    const ing = m.fuentesIngreso?.ingresoReportadoIess;
    const deuda = m.endeudamiento?.deudaPropiaTotal ?? 0;
    return ing > 0 ? (deuda > 0 ? dentroDelRedondeo(s.valor, deuda, ing, 12, false) : s.valor === 0) : s.valor === null;
  },
  // El modelo y la lectura cuentan los años con el día del análisis (lecturas-v2); en seco, el de la consulta.
  "lec.jud.cobro.mas_reciente": (s, m) => {
    const anios = (m.riesgoJudicialCrediticio?.demandasDeCobro ?? []).map((d) => d.aniosAtras).filter((a) => typeof a === "number");
    return s.estado === "no_se_cumple" ? anios.length === 0 : s.valor === (anios.length ? Math.min(...anios) : null);
  },
};

// ---- La corrida ----

const cuenta = { personas: 0, sinCrudo: 0, noLeidas: 0, mensajesIguales: 0, mensajesDistintos: 0 };
const distintos = [];
const porLectura = Object.fromEntries(CATALOGO_DE_LECTURAS.map((c) => [c.codigo, { se_cumple: 0, no_se_cumple: 0, no_se_puede_medir: 0, porValor: {} }]));
const paridad = Object.fromEntries(Object.keys(PARIDADES).map((k) => [k, { comparadas: 0, iguales: 0, refs: [] }]));
const medidas = { ms: [], caracteres: [], tokens: [], activas: [] };
const TRAMO = new Set(["lec.ban.calificacion.tramo", "lec.jud.pension.estado", "lec.cum.impedimento.causa", "lec.inst.ya_en_bancos"]);

for (let i = 0; i < candidatos.length; i += 50) {
  const lote = candidatos.slice(i, i + 50);
  const crudos = await Promise.all(lote.map((c) => c.leer().catch((e) => ({ error: e.message }))));
  lote.forEach((c, j) => {
    const crudo = crudos[j];
    if (crudo.error) return void cuenta.noLeidas++;
    if (!crudo.raw || !crudo.capturadoEl) return void cuenta.sinCrudo++;
    if (c.perfilId && crudo.perfilId !== c.perfilId) return void cuenta.noLeidas++;
    cuenta.personas++;
    const ref = c.cita ?? `p-${String(crudo.perfilId ?? path.basename(c.archivo ?? "x")).slice(0, 8)}`;
    const { raw, cedula, capturadoEl } = crudo;

    // 1. El mensaje al modelo, igual byte a byte.
    const perfilAhora = armarEnFecha(capturadoEl, () => ahora.process.buildStandardProfile(raw, cedula, undefined).profile);
    const perfilAntes = armarEnFecha(capturadoEl, () => antes.process.buildStandardProfile(raw, cedula, undefined).profile);
    const m1 = mensaje(ahora, perfilAhora, raw, cedula, capturadoEl);
    const m0 = mensaje(antes, perfilAntes, raw, cedula, capturadoEl);
    if (m1 === m0) cuenta.mensajesIguales++;
    else {
      cuenta.mensajesDistintos++;
      if (distintos.length < 10) distintos.push(ref);
    }

    // 2. Las lecturas, con su tiempo.
    const doc = derivarHechos(raw, {
      cedula,
      consulta: crudo.perfilId ?? "sin-perfil",
      fechaDeLaConsulta: capturadoEl,
      corteIess: CORTE_IESS_CONOCIDO,
      persona: { nombre: null, fechaDeNacimiento: null },
    }, { estricto: true });
    const t0 = performance.now();
    // En seco el análisis es el día de la consulta: el mismo `ahora` con que se armó el mensaje.
    const lecturas = derivarLecturas(doc, { fechaDelAnalisis: capturadoEl });
    medidas.ms.push(performance.now() - t0);

    const perfilDelModelo = JSON.parse(m1).perfilDelModelo;
    let caracteres = 0;
    let tokens = 0;
    let activas = 0;
    for (const s of lecturas) {
      const p = porLectura[s.codigo];
      p[s.estado]++;
      if (TRAMO.has(s.codigo)) p.porValor[String(s.valor)] = (p.porValor[String(s.valor)] ?? 0) + 1;
      // 4. Lo que llegaría al modelo en la v37: las que se cumplen y las que no se pueden medir.
      if (s.estado !== "no_se_cumple") {
        activas++;
        const json = JSON.stringify({ codigo: s.codigo, valor: s.valor, estado: s.estado === "se_cumple" ? undefined : s.estado });
        caracteres += json.length + (s.texto?.length ?? 0) + 10;
        tokens += json.length / CARACTERES_POR_TOKEN_JSON + (s.texto?.length ?? 0) / CARACTERES_POR_TOKEN_MARCO;
      }
      // 3. La paridad, salvo donde una fuente no contestó (el modelo lee el parcial).
      const regla = PARIDADES[s.codigo];
      if (regla && s.estado !== "no_se_puede_medir") {
        const q = paridad[s.codigo];
        q.comparadas++;
        if (regla(s, perfilDelModelo)) q.iguales++;
        else if (q.refs.length < 5) q.refs.push(ref);
      }
    }
    medidas.caracteres.push(caracteres);
    medidas.tokens.push(tokens);
    medidas.activas.push(activas);
  });
  if ((i / 50) % 10 === 0) process.stdout.write(`  ${Math.min(i + 50, candidatos.length)} de ${candidatos.length}\r`);
}

console.log(`\nPersonas: ${cuenta.personas} (sin crudo ${cuenta.sinCrudo}, no leídas ${cuenta.noLeidas}).`);
console.log(`1. Mensaje al modelo igual al de ${CONTRA}: ${cuenta.mensajesIguales} de ${cuenta.personas}${cuenta.mensajesDistintos ? `; DISTINTOS ${cuenta.mensajesDistintos}: ${distintos.join(", ")}` : ""}.`);
if (cuenta.mensajesDistintos) fallo = true;

console.log("\n2. Lecturas, personas por estado (se cumple / no se cumple / no se puede medir):");
for (const [codigo, p] of Object.entries(porLectura)) {
  const valores = Object.keys(p.porValor).length ? `  ${Object.entries(p.porValor).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(", ")}` : "";
  console.log(`  ${codigo.padEnd(40)} ${String(p.se_cumple).padStart(5)} ${String(p.no_se_cumple).padStart(5)} ${String(p.no_se_puede_medir).padStart(5)}${valores}`);
}

console.log("\n3. Paridad con lo que el modelo recibe hoy (sin las que no se pueden medir):");
for (const [codigo, q] of Object.entries(paridad)) {
  console.log(`  ${codigo.padEnd(40)} ${q.iguales} de ${q.comparadas}${q.refs.length ? `  distintas: ${q.refs.join(", ")}` : ""}`);
  if (q.iguales !== q.comparadas) fallo = true;
}

const marco = ahora.marco.MARCO_INTERPRETATIVO;
const tramos = ubicarTramos(marco);
const sacado = tramos.reduce((s, t) => s + (t.fin - t.inicio), 0);
const queda = TRAMOS_QUE_SACA_LA_V37.reduce((s, t) => s + (t.queda ? t.queda.length + 6 : 0), 0);
console.log("\n4. Peso y tiempo:");
console.log(`  derivar las lecturas, ms por persona: ${JSON.stringify(estadistica(medidas.ms))}`);
console.log(`  lecturas que llegarían al modelo por persona: ${JSON.stringify(estadistica(medidas.activas))}`);
console.log(`  su peso, caracteres: ${JSON.stringify(estadistica(medidas.caracteres))}; tokens: ${JSON.stringify(estadistica(medidas.tokens))}`);
console.log(`  marco-v36 sin buró: ${marco.length} caracteres (~${Math.round(marco.length / CARACTERES_POR_TOKEN_MARCO)} tokens); la v37 sacaría ${sacado} (~${Math.round(sacado / CARACTERES_POR_TOKEN_MARCO)} tokens) en ${tramos.length} tramos y devolvería ${queda} de criterio (~${Math.round(queda / CARACTERES_POR_TOKEN_MARCO)} tokens).`);

process.exit(fallo ? 1 : 0);
