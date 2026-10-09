// Cartera sintética con señal plantada para el Laboratorio (fase 1).
//
// No hay una IFI real ni créditos madurados (2026-10-03), y el negocio
// decidió no esperar. Para desarrollar Y PROBAR los cálculos hace falta una
// cartera cuya respuesta conozcamos: a cada perfil real se le inventa una
// operación, y el impago sale de una regla plantada sobre cuatro variables
// reales del perfil, no al azar. Si un cálculo no encuentra lo que pusimos
// nosotros, está mal. Ver docs/laboratorio-de-riesgo.md, sección 8.
//
// Lo que NO es: desempeño del motor. El puntaje de cada operación también
// es inventado (la misma regla, con el ruido medido del modelo, ±40), y va
// en lab_operaciones.sintetico, nunca en analysis_results.
//
// Reproducible: la misma semilla da la misma cartera. Calcula además el AUC
// del puntaje sintético con su propio código, para contrastarlo con el de la
// base (criterio de aceptación de la fase 2).
//
// Uso: node scripts/generar-cartera-sintetica.mjs [--semilla=1] [--tasa=0.10] [--seco]

import fs from "node:fs";
import path from "node:path";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const SEMILLA = Number(arg("semilla", "1"));
const TASA = Number(arg("tasa", "0.10"));
const SECO = process.argv.includes("--seco");

const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.functions");
const auth = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
// Constancia de la corrida (ejecuciones_operativas, 117): sin ella no se toca la base.
await abrirEjecucion({ url: env.SUPABASE_URL, clave: env.SUPABASE_SERVICE_ROLE_KEY, guion: "generar-cartera-sintetica", seco: SECO });
const rest = async (ruta, opciones = {}) => {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, { ...opciones, headers: { ...auth, "content-type": "application/json", ...(opciones.headers ?? {}) } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${ruta.split("?")[0]}: HTTP ${r.status} ${texto.slice(0, 400)}`);
  return { datos: texto ? JSON.parse(texto) : null, cabeceras: r.headers };
};

// --------------------------------------------------------------- azar
function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = generador(SEMILLA);
const normal = () => Math.sqrt(-2 * Math.log(1 - azar())) * Math.cos(2 * Math.PI * azar());
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const elegir = (pesos) => { let u = azar() * Object.values(pesos).reduce((s, x) => s + x, 0); for (const [k, w] of Object.entries(pesos)) { if ((u -= w) <= 0) return k; } return Object.keys(pesos).at(-1); };
const sigmoide = (x) => 1 / (1 + Math.exp(-x));

// ------------------------------------------------------- la regla plantada
// Cuatro variables reales del perfil estandarizado. Los pesos están puestos
// a mano: lo que importa es que se conocen.
const PESO_CALIFICACION = { A1: 0, A2: 0, A3: 0, AL: 0, B1: 1, B2: 1.5, C1: 2.5, C2: 3, D: 3.5, E: 4 };
const COEF = { calificacion: 0.9, atraso: 1.4, demandaDeCobro: 1.2, continuidadMeses: -0.012 };
const VARIABLES = {
  calificacion: "comportamientoBancario.peorCalificacionRiesgo",
  atraso: "comportamientoBancario.deudaEnAtraso (o saldoEnMoraBuroCredito) > 0",
  demandaDeCobro: "riesgoJudicialCrediticio.numeroDemandasComoDemandado > 0",
  continuidadMeses: "fuentesIngreso.detalle.continuidadLaboral.meses (tope 120)",
};

// --------------------------------------------------------------- perfiles
// El último perfil de cada cliente real: las 240 cédulas sintéticas de Aval
// son exactamente las que quedaron en estructura-v3 (docs/pendientes.md).
const CAMPOS = [
  "id", "client_id", "created_at", "structure_version", "fuente_segmento",
  "cal:standard_profile->comportamientoBancario->>peorCalificacionRiesgo",
  "atraso:standard_profile->comportamientoBancario->>deudaEnAtraso",
  "mora:standard_profile->comportamientoBancario->>saldoEnMoraBuroCredito",
  "demandas:standard_profile->riesgoJudicialCrediticio->>numeroDemandasComoDemandado",
  "continuidad:standard_profile->fuentesIngreso->detalle->continuidadLaboral->>meses",
].join(",");
const filas = [];
for (let desde = 0; ; desde += 1000) {
  const { datos } = await rest(`client_profiles?select=${CAMPOS}&structure_version=neq.estructura-v3&order=created_at.asc,id.asc&offset=${desde}&limit=1000`);
  filas.push(...datos);
  if (datos.length < 1000) break;
}
const ultimo = new Map();
for (const f of filas) ultimo.set(f.client_id, f);
const cedulaDe = new Map();
const ids = [...ultimo.keys()];
for (let i = 0; i < ids.length; i += 150) {
  const { datos } = await rest(`clients?select=id,cedula&id=in.(${ids.slice(i, i + 150).join(",")})`);
  for (const c of datos) cedulaDe.set(c.id, c.cedula);
}
const perfiles = [...ultimo.values()].filter((p) => cedulaDe.has(p.client_id));
console.log(`${filas.length} perfiles leídos; ${perfiles.length} clientes reales (último perfil de cada uno)`);

const casos = perfiles.map((p) => {
  const x = {
    calificacion: PESO_CALIFICACION[p.cal] ?? 0,
    atraso: Number(p.atraso ?? p.mora ?? 0) > 0 ? 1 : 0,
    demandaDeCobro: Number(p.demandas ?? 0) > 0 ? 1 : 0,
    continuidadMeses: Math.min(Number(p.continuidad ?? 0), 120),
  };
  const z = Object.entries(COEF).reduce((s, [k, b]) => s + b * x[k], 0);
  return { p, x, z };
});

// La constante que deja la tasa promedio en la pedida.
let bajo = -15, alto = 15;
for (let k = 0; k < 60; k++) {
  const medio = (bajo + alto) / 2;
  const tasa = casos.reduce((s, c) => s + sigmoide(medio + c.z), 0) / casos.length;
  if (tasa > TASA) alto = medio; else bajo = medio;
}
const B0 = (bajo + alto) / 2;

// ------------------------------------------------------------ operaciones
const sumarDias = (iso, d) => { const f = new Date(`${iso}T12:00:00Z`); f.setUTCDate(f.getUTCDate() + d); return f.toISOString().slice(0, 10); };
const sumarMeses = (iso, m) => { const f = new Date(`${iso}T12:00:00Z`); f.setUTCMonth(f.getUTCMonth() + m); return f.toISOString().slice(0, 10); };
const fechaEc = (ts) => new Date(new Date(ts).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10); // Ecuador, UTC-5 sin horario de verano

const operaciones = casos.map((c, i) => {
  const pr = sigmoide(B0 + c.z);
  const malo = azar() < pr;
  const temprano = malo && azar() < 0.65; // cae dentro de los 12 meses
  const leve = () => (azar() < 0.75 ? 0 : entre(1, 60));
  const d12 = temprano ? entre(90, 360) : leve();
  const d24 = malo ? Math.max(d12, entre(90, 720)) : Math.max(d12, leve());
  // Después del perfil, para que la consulta sea anterior por construcción.
  const desembolso = sumarDias(fechaEc(c.p.created_at), entre(1, 20));
  const puntaje = Math.max(1, Math.min(999, Math.round(950 - 900 * pr + 40 * normal())));
  return {
    cedula: cedulaDe.get(c.p.client_id),
    numero_operacion: `SINT-${String(i + 1).padStart(5, "0")}`,
    producto: c.p.fuente_segmento === "independiente" ? "microcredito" : "consumo",
    monto: Math.round(Math.min(20000, Math.max(500, Math.exp(8 + 0.6 * normal())))),
    plazo_meses: [12, 18, 24, 36, 48][entre(0, 4)],
    fecha_desembolso: desembolso,
    estado_operacion: malo ? elegir({ vencida: 0.4, reestructurada: 0.25, castigada: 0.2, judicial: 0.15 }) : elegir({ vigente: 0.65, cancelada: 0.35 }),
    dias_mora_max_12m: d12,
    dias_mora_max_24m: d24,
    fecha_primer_default: malo ? sumarMeses(desembolso, temprano ? entre(3, 12) : entre(13, 24)) : null,
    sintetico: { puntaje, recomendacion: puntaje >= 700 ? "aprobar" : puntaje >= 500 ? "revisar" : "negar", probabilidad: Math.round(pr * 1e4) / 1e4, malo },
  };
});
const fechaCorte = sumarMeses(operaciones.map((o) => o.fecha_desembolso).sort().at(-1), 25);

// AUC de referencia, por rangos (Mann-Whitney), con empates a la mitad.
function aucDe(ops) {
  const ordenados = [...ops].sort((a, b) => a.sintetico.puntaje - b.sintetico.puntaje);
  let rango = 1, sumaBuenos = 0;
  for (let i = 0; i < ordenados.length; ) {
    let j = i; while (j < ordenados.length && ordenados[j].sintetico.puntaje === ordenados[i].sintetico.puntaje) j++;
    const medio = (rango + rango + (j - i) - 1) / 2;
    for (let k = i; k < j; k++) if (!ordenados[k].sintetico.malo) sumaBuenos += medio;
    rango += j - i; i = j;
  }
  const nb = ops.filter((o) => !o.sintetico.malo).length, nm = ops.length - nb;
  return (sumaBuenos - (nb * (nb + 1)) / 2) / (nb * nm);
}
const malos24 = operaciones.filter((o) => o.dias_mora_max_24m >= 90).length;
const malos12 = operaciones.filter((o) => o.dias_mora_max_12m >= 90).length;
const auc = aucDe(operaciones);
const regla = {
  semilla: SEMILLA, tasa_objetivo: TASA, constante: Math.round(B0 * 1e4) / 1e4, coeficientes: COEF,
  peso_calificacion: PESO_CALIFICACION, variables: VARIABLES,
  puntaje: "950 - 900 x probabilidad + ruido normal de 40 (el ruido medido del modelo), entre 1 y 999",
  recomendacion: "aprobar desde 700, revisar desde 500, negar debajo",
  referencia: { operaciones: operaciones.length, malos_24m: malos24, malos_12m: malos12, auc_24m: Math.round(auc * 1e4) / 1e4 },
};
console.log(`Constante ${regla.constante}; malos a 24 meses ${malos24} (${(100 * malos24 / operaciones.length).toFixed(1)}%), a 12 meses ${malos12}; AUC de referencia ${regla.referencia.auc_24m}`);
if (SECO) process.exit(0);

// ------------------------------------------------------------------ carga
const { datos: [carga] } = await rest("lab_cargas", {
  method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify({ etiqueta: `Cartera sintética (semilla ${SEMILLA})`, origen: "sintetica", es_sintetica: true, regla_plantada: regla, fecha_corte: fechaCorte, institucion: "Sintética" }),
});
for (let i = 0; i < operaciones.length; i += 500) {
  await rest("lab_operaciones", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(operaciones.slice(i, i + 500).map((o) => ({ ...o, carga_id: carga.id }))) });
}
const { datos: conciliacion } = await rest("rpc/lab_cerrar_carga", { method: "POST", body: JSON.stringify({ p_carga: carga.id }) });
console.log(`Carga ${carga.id} (corte ficticio ${fechaCorte}):`, conciliacion);
