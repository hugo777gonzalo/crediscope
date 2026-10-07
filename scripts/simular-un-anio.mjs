// El ciclo simulado de un año del Laboratorio (fase 6,
// docs/laboratorio-de-riesgo.md, sección 14).
//
// La primera prueba retrospectiva real llega un año después de empezar con
// una institución, y el negocio decidió no esperar (2026-10-03): el ciclo
// entero se arma y se prueba hoy, con el mismo código que la corrida real.
// Este guion es la única parte que en la corrida real no existe: inventa lo
// que pasó en el año.
//
//  1. Las personas reales de la cartera son las solicitudes del año. Su
//     consulta guardada antes de la reconsulta (septiembre de 2026) es t0,
//     el día del análisis.
//  2. Un "modelo" sintético que sólo ve lo que el modelo real lee
//     recomienda, y la institución simulada desembolsa según eso.
//  3. Se planta la verdad: el riesgo de t0 en tres capas (lo que el modelo
//     lee, un dato del perfil que no recibe y un campo que sólo está en el
//     crudo), los eventos del año, el impago y su motivo. Va a
//     lab_simulacion_verdad, que ningún cálculo lee: sólo califica.
//  4. La foto "un año después" de cada persona es su reconsulta REAL del
//     2026-10-03 con doce meses de eventos escritos en el crudo, en el
//     formato en que los manda Novadata. Va a Storage (lab-archivos,
//     simulacion/); nunca es un client_profiles ni toca la ficha de nadie.
//  5. Se escriben la carga (el archivo de la institución), las solicitudes,
//     las reconsultas por procesar y la verdad.
//
// Lo inventado se ve inventado: números de proceso SIM-, la "COOPERATIVA
// SIMULADA DEL LABORATORIO", la "EMPRESA SIMULADA DEL LABORATORIO", partes y
// jueces simulados. De los registros reales de otras personas sólo se toman
// tipos (de demanda, de delito, de operación) y nombres de instituciones.
//
// Todas las recomendaciones son sintéticas, también las de quien tiene un
// análisis real: un puntaje real medido contra un impago inventado no mide
// nada (sección 6.5). Los análisis reales igual quedan vinculados, para ver
// su recorrido en Casos.
//
// Reproducible: la misma semilla con los mismos crudos da la misma
// simulación. Lo que no pasa por lint ni build se rompe en silencio: correr
// primero con --seco, que no escribe nada y muestra los conteos.
//
// Uso: node scripts/simular-un-anio.mjs [--semilla=1] [--otorgados=300] [--tasa=0.12] [--seco] [--parcial]
//   --parcial: corre con las personas cuya reconsulta ya está en la carpeta
//              de t1 (para desarrollar mientras la reconsulta avanza).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const SEMILLA = Number(arg("semilla", "1"));
const OTORGADOS = Number(arg("otorgados", "300"));
const TASA = Number(arg("tasa", "0.12"));
const SECO = process.argv.includes("--seco");
const PARCIAL = process.argv.includes("--parcial");
const CARPETA_T0 = path.join(RAIZ, arg("t0", "research/novadata-raw-2026-09-25"));
const CARPETA_T1 = path.join(RAIZ, arg("t1", "research/novadata-raw-2026-10-03"));
const ARCHIVO_CEDULAS = path.join(RAIZ, "research/cedulas_ciclo_simulado_2026-10-03.txt");

// La reconsulta real empezó el 2026-10-03: todo perfil anterior a la
// medianoche de ese día en Ecuador es t0.
const INICIO_RECONSULTA = "2026-10-03T05:00:00Z";
// El desembolso va antes de la reconsulta: si no, el vínculo tomaría la
// reconsulta como el perfil del análisis.
const ULTIMO_DESEMBOLSO = "2026-10-02";
const T1 = "2027-10-02"; // el último desembolso + 12 meses: todos maduros a 12
const T1_BURO = "2027-08-31"; // el buró de t0 traía un corte de dos meses antes
const T0_IESS = "2026-08";
const T1_IESS = "2027-08";
// No existen y no pueden coincidir con nadie: patrono.ts compara el RUC con
// la cédula + 001.
const COOP_SIMULADA = { codRuc: "1799999999001", razon_social: "COOPERATIVA SIMULADA DEL LABORATORIO" };
const EMPRESA_SIMULADA = { ruc: "1799999998001", nombre: "EMPRESA SIMULADA DEL LABORATORIO", tipo: "2-EMPRESA PRIVADA -SOCIEDADES / COMPANIAS" };

const importar = (archivo) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", archivo)).href);
const { categoriaDeDemanda, CATEGORIA_COBRO } = await importar("demandas.ts");
const { categoriasDelitoGraveSeguridad } = await importar("delitos-seguridad.ts");
const { sbuDelAnio } = await importar("fuentes-ingreso.ts");

// ------------------------------------------------------------ base y Storage
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.functions");
const auth = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function rest(ruta, opciones = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, { ...opciones, headers: { ...auth, "content-type": "application/json", ...(opciones.headers ?? {}) } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${ruta.split("?")[0]}: HTTP ${r.status} ${texto.slice(0, 400)}`);
  return { datos: texto ? JSON.parse(texto) : null, cabeceras: r.headers };
}
// PostgREST corta en 1.000 filas sin avisar: se pagina hasta el conteo.
async function traerTodas(ruta) {
  const filas = [];
  let total = null;
  for (let desde = 0; total === null || desde < total; desde += 1000) {
    const { datos, cabeceras } = await rest(`${ruta}&offset=${desde}&limit=1000`, { headers: { Prefer: "count=exact" } });
    if (total === null) total = Number(cabeceras.get("content-range")?.split("/")[1] ?? datos.length);
    filas.push(...datos);
    if (datos.length === 0) break;
  }
  return filas;
}
async function bajarObjeto(bucket, ruta) {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${ruta}`, { headers: auth });
  if (!r.ok) throw new Error(`Storage ${bucket}/${ruta}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  try { return JSON.parse(zlib.gunzipSync(buf).toString("utf8")); } catch { return JSON.parse(buf.toString("utf8")); }
}
async function subirObjeto(bucket, ruta, objeto) {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${ruta}`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/gzip", "x-upsert": "true" },
    body: zlib.gzipSync(JSON.stringify(objeto)),
  });
  if (!r.ok) throw new Error(`Storage ${bucket}/${ruta}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

// -------------------------------------------------------------------- azar
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
const uniforme = (a, b) => a + azar() * (b - a);
const elegir = (pesos) => { let u = azar() * Object.values(pesos).reduce((s, x) => s + x, 0); for (const [k, w] of Object.entries(pesos)) { if ((u -= w) <= 0) return k; } return Object.keys(pesos).at(-1); };
const unoDe = (lista) => lista[Math.floor(azar() * lista.length)];
const sigmoide = (x) => 1 / (1 + Math.exp(-x));
// La constante que deja el promedio de sigmoide(c + z) en la tasa pedida.
function calibrar(zs, tasa) {
  let bajo = -20, alto = 20;
  for (let k = 0; k < 70; k++) {
    const medio = (bajo + alto) / 2;
    if (zs.reduce((s, z) => s + sigmoide(medio + z), 0) / zs.length > tasa) alto = medio; else bajo = medio;
  }
  return (bajo + alto) / 2;
}
const r4 = (x) => Math.round(x * 1e4) / 1e4;

// ------------------------------------------------------------------ fechas
const sumarDias = (iso, d) => { const f = new Date(`${iso}T12:00:00Z`); f.setUTCDate(f.getUTCDate() + d); return f.toISOString().slice(0, 10); };
const sumarMeses = (iso, m) => { const f = new Date(`${iso}T12:00:00Z`); f.setUTCMonth(f.getUTCMonth() + m); return f.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const fechaAlAzar = (desde, hasta) => sumarDias(desde, entre(0, Math.max(0, diasEntre(desde, hasta))));
const menor = (a, b) => (a < b ? a : b);
// Ecuador es UTC-5 sin horario de verano.
const fechaEc = (ts) => new Date(new Date(ts).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const mesDe = (iso) => iso.slice(0, 7);
const mesClave = (anio, mes) => `${anio}-${String(mes).padStart(2, "0")}`;
const mesSiguiente = (m) => { let [y, mm] = m.split("-").map(Number); mm++; if (mm > 12) { mm = 1; y++; } return mesClave(y, mm); };
const conBarras = (iso) => iso.replaceAll("-", "/"); // así manda el SRI y el buró
const diaMesAnio = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const diaMesAnioCorto = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const instante = (iso) => Date.parse(`${iso}T12:00:00Z`);
const dinero = (n) => (Math.round(n * 100) / 100).toFixed(2);
const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ---------------------------------------------------------------- personas
const cedulas = fs.readFileSync(ARCHIVO_CEDULAS, "utf8").split(/\r?\n/).map((c) => c.trim()).filter((c) => /^\d{10}$/.test(c));
const conT1 = new Set(fs.readdirSync(CARPETA_T1).filter((a) => a.endsWith(".json")).map((a) => a.slice(0, 10)));
const faltan = cedulas.filter((c) => !conT1.has(c)).length;
if (faltan && !PARCIAL) throw new Error(`${faltan} de ${cedulas.length} personas todavía no tienen su reconsulta en ${path.relative(RAIZ, CARPETA_T1)}. Esperar a que termine o correr con --parcial.`);

const clientes = await traerTodas("clients?select=id,cedula&order=id");
const idDe = new Map(clientes.map((c) => [c.cedula, c.id]));
const CAMPOS_T0 = [
  "id", "client_id", "created_at", "crudo_ruta", "fuente_segmento",
  "bloqueado:control_bloqueo->>bloqueado",
  "nombre:standard_profile->identidad->>nombreCompleto",
  "cal:standard_profile->comportamientoBancario->>peorCalificacionRiesgo",
  "atraso:standard_profile->comportamientoBancario->>deudaEnAtraso",
  "mora:standard_profile->comportamientoBancario->>saldoEnMoraBuroCredito",
  "opsBancos:standard_profile->comportamientoBancario->>numeroOperacionesBuroCredito",
  "opsCoop:standard_profile->comportamientoCooperativas->>numeroOperaciones",
  "demandas:standard_profile->riesgoJudicialCrediticio->>numeroDemandasComoDemandado",
  "continuidad:standard_profile->fuentesIngreso->detalle->continuidadLaboral->>meses",
  "vigente:standard_profile->fuentesIngreso->detalle->continuidadLaboral->>vigente",
  "m12:standard_profile->fuentesIngreso->detalle->>mesesConAporteUltimos12",
  "m24:standard_profile->fuentesIngreso->detalle->>mesesConAporteUltimos24",
  "estadoIngreso:standard_profile->fuentesIngreso->>estadoSegmento",
  "ingreso:standard_profile->fuentesIngreso->>pisoIngresoMensualReportado",
  "ruc:standard_profile->laboral->>tieneRucActivo",
  "hijos:standard_profile->familia->>numeroHijos",
].join(",");
// Primero, liviano, cuál es el perfil de t0 de cada cliente; después los
// campos del perfil sólo de esos. Leer los campos de los ~8.500 perfiles
// guardados de una vez pasó el tiempo máximo de la base (2026-10-03).
const livianos = await traerTodas(`client_profiles?select=id,client_id,created_at&created_at=lt.${INICIO_RECONSULTA}&order=id`);
const idT0 = new Map();
for (const p of livianos) { const a = idT0.get(p.client_id); if (!a || p.created_at > a.created_at) idT0.set(p.client_id, p); }
const t0De = new Map();
const idsT0 = [...idT0.values()].map((p) => p.id);
for (let i = 0; i < idsT0.length; i += 100) {
  const { datos } = await rest(`client_profiles?select=${CAMPOS_T0}&id=in.(${idsT0.slice(i, i + 100).join(",")})`);
  for (const p of datos) t0De.set(p.client_id, p);
}
const analisis = await traerTodas(`analysis_results?select=id,client_id,created_at&fallo=is.null&created_at=lt.${INICIO_RECONSULTA}&order=id`);
const analisisDe = new Map();
for (const a of analisis) { const b = analisisDe.get(a.client_id); if (!b || a.created_at > b.created_at) analisisDe.set(a.client_id, a); }

const leerJson = (archivo) => JSON.parse(fs.readFileSync(archivo, "utf8"));
const personas = [];
const sinT0 = [];
for (const cedula of cedulas.filter((c) => conT1.has(c))) {
  const clientId = idDe.get(cedula);
  const t0 = clientId && t0De.get(clientId);
  if (!t0?.crudo_ruta) { sinT0.push(cedula); continue; }
  personas.push({ cedula, clientId, t0, t0Fecha: fechaEc(t0.created_at), analisis: analisisDe.get(clientId) ?? null });
}
console.log(`${personas.length} personas con t0 y reconsulta${sinT0.length ? `; ${sinT0.length} sin perfil o sin crudo en t0 (quedan afuera)` : ""}`);

const disponible = (raw, fuente) => raw?.[fuente]?.status === "ok" && raw[fuente].data && typeof raw[fuente].data === "object";
// Fuentes que se caen en t1, con lo que se midió en la consulta de septiembre
// de la misma cartera (research/novadata-raw-2026-09-25: error o faltante en
// el 5 a 6% del IESS, las demandas, las denuncias, el retail y las pensiones).
// El buró y el SRI no fallaron ese día; se tiran al 1% para que el camino
// "buró sin contestar" también se pruebe.
const CAIDA_EN_T1 = {
  basesInternas: 0.053, demandas: 0.06, denuncias: 0.063, retails: 0.057, pensionAlimenticia: 0.055, pensionAlimenticiaNovadata: 0.055,
  contribuyente: 0.01, buroCreditoSuper: 0.01, buroCreditoCoop: 0.01,
};
const datosDe = (raw, fuente) => (fuente === "basesInternas" ? raw.basesInternas?.data?.data ?? raw.basesInternas?.data : raw[fuente]?.data) ?? {};
const lista = (raw, fuente, campo) => { const d = datosDe(raw, fuente); if (!Array.isArray(d[campo])) d[campo] = []; return d[campo]; };

// ------------------------------------------------------- lectura de crudos
// Una pasada que sólo extrae lo que hace falta: guardar los tres crudos de
// 2.567 personas (~150 KB cada uno) pasa del giga de memoria.
// Tipos e instituciones de los registros reales; nada personal de nadie.
const pool = { cobro: [], civil: [], fiscalia: new Set() };
const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const ES_INSTITUCION = /BANCO|COOPERATIVA|MUTUALISTA|FINANCIER|CREDITO|DINERS|COMERCIAL|ALMACEN/;
// Las entidades de los créditos nuevos salen de las que ya tenían personas de
// la cartera en t0, con un peso según cuántas, y sólo de las que tenían por lo
// menos MINIMO_PERSONAS_ENTIDAD. La primera corrida (2026-10-03) las elegía al
// azar entre todas: metió créditos inventados en el Banco Nacional de Fomento,
// que está en liquidación, y en cooperativas que en t0 no tenía nadie, y el
// procesamiento, con razón, las tomó por entidades que empezaban a reportar y
// descontó 288 créditos plantados.
const MINIMO_PERSONAS_ENTIDAD = 10;
const entidades = { bancos: new Map(), cooperativas: new Map(), retail: new Map() };
function contarEntidades(raw) {
  const vistas = new Set();
  const sumar = (canal, clave, datos) => {
    if (vistas.has(`${canal}|${clave}`)) return;
    vistas.add(`${canal}|${clave}`);
    const e = entidades[canal].get(clave) ?? { ...datos, peso: 0 };
    e.peso++;
    entidades[canal].set(clave, e);
  };
  for (const r of datosDe(raw, "buroCreditoSuper").datosSuper ?? []) {
    if (r.codEntidad && r.entnombre && r.riesgo !== "G" && r.riesgo !== "C") sumar("bancos", r.codEntidad, { tipo: r.tipo, codEntidad: r.codEntidad, entnombre: r.entnombre, enttipo: r.enttipo });
  }
  for (const r of datosDe(raw, "buroCreditoCoop").datosSuper ?? []) {
    if (r.codRuc && r.razon_social) sumar("cooperativas", r.codRuc, { codRuc: r.codRuc, razon_social: r.razon_social, cod_tipo_operacion: r.cod_tipo_operacion });
  }
  for (const r of datosDe(raw, "retails").retails ?? []) if (r.institucion) sumar("retail", r.institucion, { institucion: r.institucion });
}
const ponderado = (lista) => { let u = azar() * lista.reduce((s, o) => s + o.peso, 0); for (const o of lista) { if ((u -= o.peso) <= 0) return o; } return lista.at(-1); };

function agregarAlPool(raw) {
  for (const d of datosDe(raw, "demandas").demandas ?? []) {
    const delito = d.demanda?.delito, ofendido = d.demanda?.ofendido;
    if (!delito) continue;
    const categoria = categoriaDeDemanda(delito, ofendido);
    if (categoria === CATEGORIA_COBRO && ES_INSTITUCION.test(sinTildes(ofendido))) pool.cobro.push({ delito, ofendido, idTipoDemanda: d.tipoDemanda?.idTipoDemanda ?? null });
    else if (["Daños y perjuicios", "Propiedad e inmuebles"].includes(categoria) || (categoria === "Familia" && /DIVORCIO/.test(sinTildes(delito)))) pool.civil.push({ delito, idTipoDemanda: d.tipoDemanda?.idTipoDemanda ?? null });
  }
  // Ningún delito de la lista de seguridad: bloquearía a la persona y su
  // puntaje sería 1 por política, no por riesgo.
  for (const d of datosDe(raw, "denuncias").denuncias ?? []) {
    if (d.delito && categoriasDelitoGraveSeguridad(d.delito).length === 0 && /ESTAFA|VIOLENCIA|LESIONES|INCUMPLIMIENTO|ABUSO DE CONFIANZA|INTIMIDACION/.test(sinTildes(d.delito))) pool.fiscalia.add(d.delito);
  }
}
const leerT1 = (p) => leerJson(path.join(CARPETA_T1, `${p.cedula}.json`)).raw;
for (const p of personas) {
  // El crudo de t0: el respaldo local si es de ese perfil; si no, Storage.
  const local = path.join(CARPETA_T0, `${p.cedula}.json`);
  const deLocal = fs.existsSync(local) ? leerJson(local) : null;
  const rawT0 = deLocal?.perfilId === p.t0.id ? deLocal.raw : (await bajarObjeto("crudo-novadata", p.t0.crudo_ruta)).raw;
  const licencia = (() => { const l = rawT0?.licenciaConducir?.data?.licencia; return Array.isArray(l) ? l[0] : l ?? null; })();
  p.licenciaVencida = Boolean(licencia && Number.isFinite(Number(licencia.validezHasta)) && Number(licencia.validezHasta) < instante(p.t0Fecha));
  contarEntidades(rawT0);
  const raw = leerT1(p);
  // Las fuentes que se caen en t1 (CAIDA_EN_T1). Se planta sólo donde la
  // fuente contestó en las dos consultas: un evento en una fuente caída no se
  // puede ver, y el detector no tiene que inventar ninguno ahí.
  p.caidas = Object.keys(CAIDA_EN_T1).filter((f) => azar() < CAIDA_EN_T1[f]);
  const enLasDos = (...fuentes) => fuentes.every((f) => disponible(rawT0, f) && disponible(raw, f) && !p.caidas.includes(f));
  p.puede = {
    iess: enLasDos("basesInternas"), sri: enLasDos("contribuyente", "establecimientoActEconomica"),
    supa: enLasDos("pensionAlimenticia", "pensionAlimenticiaNovadata"), demandas: enLasDos("demandas"), fiscalia: enLasDos("denuncias"),
    buro: enLasDos("buroCreditoSuper", "buroCreditoCoop"), retail: enLasDos("retails"),
  };
  agregarAlPool(raw);
}
const comunes = (m) => [...m.values()].filter((e) => e.peso >= MINIMO_PERSONAS_ENTIDAD);
const POOL = { bancos: comunes(entidades.bancos), cooperativas: comunes(entidades.cooperativas), retail: comunes(entidades.retail), cobro: pool.cobro, civil: pool.civil, fiscalia: [...pool.fiscalia] };
for (const [k, v] of Object.entries(POOL)) if (!v.length) throw new Error(`No hay registros reales de ${k} para tomar el formato`);

// ------------------------------------------------------ la regla plantada

// Primera capa: lo que el modelo lee. La misma regla de la cartera
// sintética de la sección 8.
const PESO_CALIFICACION = { A1: 0, A2: 0, A3: 0, AL: 0, B1: 1, B2: 1.5, C1: 2.5, C2: 3, D: 3.5, E: 4 };
const COEF_VISIBLE = { calificacion: 0.9, atraso: 1.4, demandaDeCobro: 1.2, continuidadMeses: -0.012 };
// Segunda capa: el perfil la tiene y el modelo no la recibe. Al modelo le
// llegan los meses con aporte de los últimos 12, no de los 24: quien aporta
// hoy pero tuvo huecos el año anterior es más frágil de lo que el modelo ve.
const COEF_OCULTA = 2.0;
// Tercera capa: sólo está en el crudo. El perfil dice tieneLicenciaVigente
// con sólo que exista el registro, sin mirar validezHasta: una licencia
// vencida al día del análisis no llega a ninguna parte.
const COEF_CRUDO = 1.3;
const EFECTO = {
  perdida_trabajo: 1.8, cierre_negocio: 1.4, pension_alimenticia: 1.0, demanda_civil: 0.7,
  proceso_fiscalia: 1.2, credito_otra_institucion: 0.6, trabajo_nuevo: -0.8,
};
const EFECTO_SOBREENDEUDAMIENTO = 0.6; // el crédito de otro supera seis ingresos
const EFECTO_CUOTA_NO_CABIA = 1.0;      // cuota de nuestro crédito > 35% del ingreso
const EFECTO_CAPACIDAD_NO_MEDIBLE = 0.5; // ingreso por confirmar o sin determinar
const PROBABILIDAD = {
  perdida_trabajo: "0,07 + 0,08 si la continuidad es menor a 12 meses + 0,10 × fracción de huecos del año anterior; sólo si aporta hoy",
  trabajo_nuevo: "0,10 si no aporta hoy; 0,04 si aporta; 0,30 después de perder el trabajo",
  cierre_negocio: "0,08 si tiene RUC activo",
  pension_alimenticia: "0,025 + 0,02 si tiene hijos",
  demanda_civil: "0,035",
  proceso_fiscalia: "0,012",
  credito_otra_institucion: "0,15 si recibió nuestro crédito, 0,35 si no; × 1,4 con tres operaciones o más",
};
const CAUSAS = new Set(["perdida_trabajo", "cierre_negocio", "pension_alimenticia", "demanda_civil", "proceso_fiscalia", "credito_otra_institucion"]);

for (const p of personas) {
  const t = p.t0;
  const m12 = numero(t.m12), m24 = numero(t.m24);
  p.x = {
    calificacion: PESO_CALIFICACION[t.cal] ?? 0,
    atraso: numero(t.atraso ?? t.mora) > 0 ? 1 : 0,
    demandaDeCobro: numero(t.demandas) > 0 ? 1 : 0,
    continuidadMeses: Math.min(numero(t.continuidad), 120),
  };
  p.zVisible = Object.entries(COEF_VISIBLE).reduce((s, [k, b]) => s + b * p.x[k], 0);
  p.aportaHoy = m12 > 0 && t.vigente === "true";
  p.fraccionHuecos = p.aportaHoy ? (12 - Math.min(12, Math.max(0, m24 - m12))) / 12 : 0;
  p.zOculta = COEF_OCULTA * p.fraccionHuecos;
  p.zCrudo = p.licenciaVencida ? COEF_CRUDO : 0;
  p.ingreso = numero(t.ingreso) || null;
  p.capacidadNoMedible = t.estadoIngreso !== "confirmada" || !p.ingreso;
  p.operaciones = numero(t.opsBancos) + numero(t.opsCoop);
}

// ---------------------------------------------- el "modelo" y la institución
// El modelo sintético sólo ve la primera capa, con el ruido medido del
// modelo real (±40 puntos).
const BM = calibrar(personas.map((p) => p.zVisible), TASA);
for (const p of personas) {
  p.pModelo = sigmoide(BM + p.zVisible);
  p.puntaje = Math.max(1, Math.min(999, Math.round(950 - 900 * p.pModelo + 40 * normal())));
}
// Los cortes de la recomendación van por cuantil. Con los umbrales fijos de
// la cartera sintética (700 y 500) el 90% salía "aprobar" (medido sobre 335
// el 2026-10-03) y casi no quedaban negados, que son la mitad de la pregunta.
// Los análisis reales son pocos para calibrar (de 19 con recomendación: 2
// aprobar, 11 revisar, 5 negar, 1 observar); 45/35/20 es un supuesto.
const PROPORCION_RECOMENDACION = { aprobar: 0.45, revisar: 0.35, negar: 0.2 };
const puntajesLibres = personas.filter((p) => p.t0.bloqueado !== "true").map((p) => p.puntaje).sort((a, b) => b - a);
const CORTE_APROBAR = puntajesLibres[Math.floor(puntajesLibres.length * PROPORCION_RECOMENDACION.aprobar)];
const CORTE_REVISAR = puntajesLibres[Math.floor(puntajesLibres.length * (PROPORCION_RECOMENDACION.aprobar + PROPORCION_RECOMENDACION.revisar))];
for (const p of personas) {
  p.recomendacion = p.t0.bloqueado === "true" ? "bloqueado" : p.puntaje > CORTE_APROBAR ? "aprobar" : p.puntaje > CORTE_REVISAR ? "revisar" : "negar";
}
// La institución desembolsa según la recomendación: aprobar mucho más que
// revisar, negar casi nunca (los "la institución prestó igual").
const PESO_DESEMBOLSO = { aprobar: 1, revisar: 0.35, negar: 0.03, bloqueado: 0 };
let kBajo = 0, kAlto = 1;
const esperados = (k) => personas.reduce((s, p) => s + Math.min(1, k * PESO_DESEMBOLSO[p.recomendacion]), 0);
while (esperados(kAlto) < OTORGADOS && kAlto < 1e6) kAlto *= 2;
for (let i = 0; i < 60; i++) { const m = (kBajo + kAlto) / 2; if (esperados(m) > OTORGADOS) kAlto = m; else kBajo = m; }
const K_DESEMBOLSO = (kBajo + kAlto) / 2;
for (const p of personas) {
  p.otorgado = azar() < Math.min(1, K_DESEMBOLSO * PESO_DESEMBOLSO[p.recomendacion]);
  if (!p.otorgado) continue;
  p.producto = p.t0.fuente_segmento === "independiente" ? "microcredito" : "consumo";
  const tasaAnual = p.producto === "microcredito" ? 0.22 : 0.16;
  p.monto = Math.round(Math.min(20000, Math.max(500, Math.exp(8 + 0.6 * normal()))));
  p.plazo = [12, 18, 24, 36, 48][entre(0, 4)];
  const i = tasaAnual / 12;
  p.cuota = Math.round((p.monto * i) / (1 - (1 + i) ** -p.plazo) * 100) / 100;
  p.desembolso = menor(sumarDias(p.t0Fecha, entre(1, 5)), ULTIMO_DESEMBOLSO);
  if (p.desembolso < p.t0Fecha) p.desembolso = p.t0Fecha;
  p.cuotaNoCabia = p.ingreso ? p.cuota / p.ingreso > 0.35 : false;
}

// ------------------------------------------------------- eventos del año
const fechaEvento = (p) => fechaAlAzar(sumarDias(p.t0Fecha, 15), sumarDias(T1, -45));
for (const p of personas) {
  const ev = [];
  const puede = p.puede;
  if (puede.iess && p.aportaHoy && azar() < 0.07 + (numero(p.t0.continuidad) < 12 ? 0.08 : 0) + 0.10 * p.fraccionHuecos) {
    const perdida = { tipo: "perdida_trabajo", fecha: fechaEvento(p) };
    ev.push(perdida);
    if (azar() < 0.3 && diasEntre(perdida.fecha, sumarDias(T1, -60)) > 60) ev.push({ tipo: "trabajo_nuevo", fecha: fechaAlAzar(sumarDias(perdida.fecha, 45), sumarDias(T1, -60)) });
  } else if (puede.iess && azar() < (p.aportaHoy ? 0.04 : 0.10)) ev.push({ tipo: "trabajo_nuevo", fecha: fechaEvento(p) });
  if (puede.sri && p.t0.ruc === "true" && azar() < 0.08) ev.push({ tipo: "cierre_negocio", fecha: fechaEvento(p) });
  if (puede.supa && azar() < 0.025 + (numero(p.t0.hijos) > 0 ? 0.02 : 0)) ev.push({ tipo: "pension_alimenticia", fecha: fechaEvento(p) });
  if (puede.demandas && azar() < 0.035) ev.push({ tipo: "demanda_civil", fecha: fechaEvento(p) });
  if (puede.fiscalia && azar() < 0.012) ev.push({ tipo: "proceso_fiscalia", fecha: fechaEvento(p) });
  if (puede.buro && azar() < (p.otorgado ? 0.15 : 0.35) * (p.operaciones >= 3 ? 1.4 : 1)) {
    const montoOtro = Math.round(Math.min(40000, Math.max(300, Math.exp(7.8 + 0.8 * normal()))));
    ev.push({ tipo: "credito_otra_institucion", fecha: fechaEvento(p), canal: elegir(puede.retail ? { bancos: 0.5, cooperativas: 0.3, retail: 0.2 } : { bancos: 0.5, cooperativas: 0.3 }), monto: montoOtro,
      sobreendeudamiento: Boolean(p.ingreso && montoOtro > 6 * p.ingreso) });
  }
  p.eventos = ev.sort((a, b) => a.fecha.localeCompare(b.fecha));
  p.zEventos = ev.reduce((s, e) => s + EFECTO[e.tipo] + (e.sobreendeudamiento ? EFECTO_SOBREENDEUDAMIENTO : 0), 0);
  p.zCuota = p.otorgado ? (p.cuotaNoCabia ? EFECTO_CUOTA_NO_CABIA : 0) + (p.capacidadNoMedible ? EFECTO_CAPACIDAD_NO_MEDIBLE : 0) : 0;
}

// ------------------------------------------------------------- el impago
const zTotal = (p) => p.zVisible + p.zOculta + p.zCrudo + p.zEventos + p.zCuota;
const B0 = calibrar(personas.map(zTotal), TASA);
const ordenadas = (xs) => [...xs].sort((a, b) => a - b);
const zVisibles = ordenadas(personas.map((p) => p.zVisible));
const MEDIANA_VISIBLE = zVisibles[zVisibles.length >> 1];
const fragilidades = ordenadas(personas.map((p) => p.zVisible + p.zOculta + p.zCrudo));
const P60_FRAGILIDAD = fragilidades[Math.floor(fragilidades.length * 0.6)];
const ANTICIPABLES = new Set(["riesgo_visible", "dato_no_recibido", "dato_solo_crudo", "cuota_no_cabia", "capacidad_no_medible"]);

for (const p of personas) {
  p.probabilidad = sigmoide(B0 + zTotal(p));
  p.malo = azar() < p.probabilidad;
  p.sePusoAlDia = p.malo && azar() < 0.15;
  if (!p.malo) {
    if (p.puede.demandas && azar() < 0.008) p.eventos.push({ tipo: "demanda_cobro", fecha: fechaEvento(p), deuda_vieja: true });
    continue;
  }
  const causas = p.eventos.filter((e) => CAUSAS.has(e.tipo));
  const desde = p.otorgado ? sumarDias(p.desembolso, 45) : sumarDias(p.t0Fecha, 60);
  p.fechaDefault = causas.length
    ? menor(sumarDias(causas[0].fecha, entre(30, 120)), sumarDias(T1_BURO, -20))
    : p.otorgado ? menor(sumarMeses(p.desembolso, entre(2, 11)), sumarDias(T1_BURO, -20)) : fechaAlAzar(desde, sumarDias(T1_BURO, -20));
  if (p.fechaDefault < desde) p.fechaDefault = desde;
  // El motivo: cada término que empujó, el principal primero.
  const terminos = [
    ["riesgo_visible", p.zVisible - MEDIANA_VISIBLE],
    ["dato_no_recibido", p.zOculta],
    ["dato_solo_crudo", p.zCrudo],
    ["cuota_no_cabia", p.otorgado && p.cuotaNoCabia ? EFECTO_CUOTA_NO_CABIA : 0],
    ["capacidad_no_medible", p.otorgado && p.capacidadNoMedible ? EFECTO_CAPACIDAD_NO_MEDIBLE : 0],
    ...causas.filter((e) => e.fecha < p.fechaDefault).map((e) => [e.tipo, EFECTO[e.tipo] + (e.sobreendeudamiento ? EFECTO_SOBREENDEUDAMIENTO : 0)]),
  ].filter(([, v]) => v >= 0.4).sort((a, b) => b[1] - a[1]);
  p.motivos = terminos.map(([motivo, peso]) => ({ motivo, peso: r4(peso) }));
  const principal = p.motivos[0]?.motivo ?? null;
  p.anticipable = !principal ? "no_anticipable"
    : ANTICIPABLES.has(principal) ? "anticipable"
      : p.zVisible + p.zOculta + p.zCrudo >= P60_FRAGILIDAD ? "vulnerabilidad_visible" : "no_anticipable";
  // Consecuencias: la mora se contagia a lo que ya tenía y llegan las
  // demandas de cobro. En un tercio la mora de afuera empieza ANTES que la
  // nuestra: el problema empezó en otra parte.
  if (p.operaciones > 0 && p.puede.buro && azar() < 0.55) {
    const antes = azar() < 0.33;
    const fecha = antes ? sumarDias(p.fechaDefault, -entre(20, 90)) : sumarDias(p.fechaDefault, entre(0, 60));
    if (fecha > p.t0Fecha && fecha < T1_BURO) p.eventos.push({ tipo: "mora_credito_previo", fecha, antes_que_la_nuestra: antes });
  }
  if (p.puede.demandas && azar() < 0.3) {
    const fecha = sumarDias(p.fechaDefault, entre(90, 240));
    if (fecha < sumarDias(T1, -30)) p.eventos.push({ tipo: "demanda_cobro", fecha });
  }
  p.eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ---------------------------------------------- el archivo de la institución
let n = 0;
const leve = () => (azar() < 0.75 ? 0 : entre(1, 60));
for (const p of personas.filter((x) => x.otorgado).sort((a, b) => a.cedula.localeCompare(b.cedula))) {
  p.numeroOperacion = `SIM-${String(++n).padStart(5, "0")}`;
  // Impago es MÁS de 90 días (Basilea, decisión del negocio del 2026-10-06).
  p.diasMora12 = p.malo ? entre(91, 330) : leve();
  p.estadoOperacion = p.malo
    ? p.sePusoAlDia ? elegir({ vigente: 0.7, cancelada: 0.3 }) : elegir({ vencida: 0.45, castigada: 0.25, judicial: 0.15, reestructurada: 0.15 })
    : elegir({ vigente: 0.7, cancelada: 0.3 });
}

// ----------------------------------------------- la foto "un año después"
let secuencia = 0;
const sim = (prefijo) => `SIM-${prefijo}-${String(++secuencia).padStart(6, "0")}`;
const esPropia = (r) => r.riesgo !== "G" && r.riesgo !== "C";
// La calificación de un banco por sus días de mora: la tabla de la
// Superintendencia para consumo (versión 1 de lab_tablas_calificacion). Más
// de 90 días es D o E; hasta el 2026-10-06 se plantaba C1 a E al azar, y con
// la definición nueva la mitad de esos malos no lo eran.
const calificacionBanco = (dias) =>
  dias <= 0 ? "A1" : dias <= 8 ? "A2" : dias <= 15 ? "A3" : dias <= 30 ? "B1" : dias <= 45 ? "B2" : dias <= 70 ? "C1" : dias <= 90 ? "C2" : dias <= 120 ? "D" : "E";

function filaBanco(p, entidad, saldo, dias) {
  const enMora = dias > 0 ? saldo * uniforme(0.3, 0.7) : 0;
  return {
    tipo: entidad.tipo, cedulaRuc: p.cedula, fecha: conBarras(T1_BURO), nombre: p.t0.nombre, codEntidad: entidad.codEntidad,
    entnombre: entidad.entnombre, enttipo: entidad.enttipo, riesgo: "T", calificacion: calificacionBanco(dias),
    saldoVigente: dinero(saldo - enMora), noDevengaInteres: "0.0", saldo0_1: "0.0", saldo1_2: "0.0", saldo2_3: "0.0", saldo3_6: "0.0",
    saldo6_9: "0.0", saldo9_12: "0.0", saldo24_3: "0.0", mas_36: "0.0", judicial: "0.0", castigo: "0.0", mora: dinero(enMora), saldomora: dinero(enMora),
  };
}
function filaCooperativa(p, coop, numeroOperacion, saldo, dias, cuota, castigada = false) {
  const vencido = dias > 0 ? saldo * Math.min(0.9, 0.2 + dias / 600) : 0;
  return {
    codRuc: coop.codRuc, razon_social: coop.razon_social, fec_corte_saldo: conBarras(T1_BURO), cod_tipo_id: "C", cod_id_sujeto: p.cedula,
    nombres: p.t0.nombre, num_operacion: numeroOperacion, num_dias_morosidad: String(dias),
    val_xvencer_1_30: dinero((saldo - vencido) * 0.05), val_xvencer_31_90: dinero((saldo - vencido) * 0.1), val_ndi_91_180: "0.00", val_ndi_181_360: "0.00", val_ndi_360: "0.00",
    val_venc_1: dinero(vencido), val_venc_2: "0.00", val_venc_3: "0.00", val_venc_4: "0.00", val_venc_5: "0.00", val_venc_6: "0.00", val_venc_7: "0.00",
    val_venc_8: "0.00", val_venc_9: "0.00", val_venc_10: "0.00", val_venc_11: "0.00", val_saldo_total: dinero(saldo), val_dem_judicial: "0.00",
    val_int_ordinario: "0.00", val_int_mora: "0.00", val_cart_castigada: castigada ? dinero(saldo) : "0.00",
    cod_tipo_operacion: coop.cod_tipo_operacion ?? "CON", val_cuota_credito: dinero(cuota), mes: String(Number(T1_BURO.slice(5, 7))), anio: T1_BURO.slice(0, 4),
  };
}
function filaAporte(p, empleador, mes, salario, desde) {
  return {
    ci: p.cedula, parroquias: null, rucEmp: empleador.ruc, codSuc: "0001", tipEmp: empleador.tipo, nomEmp: empleador.nombre, telEmp: "", dirEmp: "",
    faxEmp: "", nomAfi: p.t0.nombre, dirAfi: "", telAfi: "", celAfi: "", email: "", salario: String(salario), fecIng: diaMesAnio(desde), fecSal: "",
    ocupacion: "CARGO SIMULADO", anio: Number(mes.slice(0, 4)), mes: Number(mes.slice(5, 7)), idIess: null,
  };
}
function filaMecanizado(empleador, mes, salario, desde) {
  return {
    fechaActualizacion: diaMesAnio(`${mes}-28`), fechaIngreso: instante(desde), fechaAfiliacionHasta: null,
    personaPatrono: { identificacion: empleador.ruc, nombre: empleador.nombre, nombreComercial: empleador.nombre },
    personaEmpleado: null, personaIngreso: { valor: salario, tipoIngreso: { idTipoIngreso: 1, nombre: "SALARIO" }, frecuenciaIngreso: null, valorRango: null },
    cargo: { idCargo: null, nombre: "CARGO SIMULADO" }, tipoAfiliado: null, telefonoOfi: "", telefonoAfi: null, direccionOfi: "", direccionAfi: "",
    celular: null, baseDate: mes, rucEmpresa: empleador.ruc, nombreEmpresa: empleador.nombre, tipoEmpresa: empleador.tipo,
  };
}

function armarT1(p, raw) {
  const ev = (tipo) => p.eventos.filter((e) => e.tipo === tipo);
  const moraVisible = p.malo && !p.sePusoAlDia;
  // Las fotos del buró avanzan un año: lo que estaba al día se amortiza o se
  // termina de pagar.
  if (p.puede.buro) {
    for (const fuente of ["buroCreditoSuper", "buroCreditoDiners"]) {
      if (!disponible(raw, fuente)) continue;
      const filas = lista(raw, fuente, "datosSuper");
      const quedan = filas.filter((r) => !(String(r.calificacion).startsWith("A") && numero(r.saldomora) === 0 && azar() < 0.15));
      for (const r of quedan) { r.fecha = conBarras(T1_BURO); r.saldoVigente = dinero(numero(r.saldoVigente) * uniforme(0.45, 0.9)); }
      datosDe(raw, fuente).datosSuper = quedan;
    }
    const coops = lista(raw, "buroCreditoCoop", "datosSuper");
    const quedanCoop = coops.filter((r) => !(numero(r.num_dias_morosidad) === 0 && azar() < 0.15));
    for (const r of quedanCoop) {
      r.fec_corte_saldo = conBarras(T1_BURO); r.mes = String(Number(T1_BURO.slice(5, 7))); r.anio = T1_BURO.slice(0, 4);
      const f = uniforme(0.45, 0.9);
      for (const c of ["val_saldo_total", "val_xvencer_1_30", "val_xvencer_31_90"]) r[c] = dinero(numero(r[c]) * f);
    }
    datosDe(raw, "buroCreditoCoop").datosSuper = quedanCoop;
    for (const r of lista(raw, "retails", "retails")) { r.fecha = diaMesAnioCorto(T1_BURO); r.fechaActualizacion = sumarDias(T1_BURO, 15); }

    // Un crédito que ya tenía cae en mora.
    for (const e of ev("mora_credito_previo")) {
      if (!moraVisible) break;
      const dias = Math.max(30, diasEntre(e.fecha, T1_BURO));
      const bancos = lista(raw, "buroCreditoSuper", "datosSuper").filter(esPropia);
      const cooperativas = lista(raw, "buroCreditoCoop", "datosSuper");
      const enCoop = cooperativas.length && (!bancos.length || azar() < 0.5);
      if (enCoop) {
        const r = unoDe(cooperativas);
        r.num_dias_morosidad = String(dias);
        r.val_venc_1 = dinero(numero(r.val_saldo_total) * Math.min(0.9, 0.2 + dias / 600));
        e.donde = "cooperativas";
      } else if (bancos.length) {
        const r = unoDe(bancos);
        const enMora = numero(r.saldoVigente) * uniforme(0.3, 0.7);
        r.calificacion = calificacionBanco(dias);
        r.saldoVigente = dinero(numero(r.saldoVigente) - enMora);
        r.mora = dinero(enMora); r.saldomora = dinero(enMora);
        e.donde = "bancos";
      } else e.sin_donde = true;
    }

    // Crédito nuevo en otra institución: si la persona cayó, cae también ahí
    // (siempre, si no recibió el nuestro; la mitad de las veces si lo recibió).
    for (const e of ev("credito_otra_institucion")) {
      const saldo = e.monto * uniforme(0.6, 0.95);
      e.cae_aca = moraVisible && e.fecha < p.fechaDefault && (!p.otorgado || azar() < 0.5);
      const dias = e.cae_aca ? Math.max(91, diasEntre(p.fechaDefault, T1_BURO)) : 0;
      // En una entidad donde no tenía nada: el buró de bancos y el de retail
      // vienen agrupados por entidad, y un crédito nuevo donde ya tenía otro
      // no se distingue (limitación anotada en la sección 14).
      const yaTiene = new Set([...lista(raw, "buroCreditoSuper", "datosSuper").map((r) => r.codEntidad), ...lista(raw, "retails", "retails").map((r) => r.institucion)]);
      const nuevaEntidad = (opciones, clave) => { const libres = opciones.filter((o) => !yaTiene.has(clave(o))); return ponderado(libres.length ? libres : opciones); };
      if (e.canal === "bancos") lista(raw, "buroCreditoSuper", "datosSuper").push(filaBanco(p, nuevaEntidad(POOL.bancos, (o) => o.codEntidad), saldo, dias));
      else if (e.canal === "cooperativas") lista(raw, "buroCreditoCoop", "datosSuper").push(filaCooperativa(p, ponderado(POOL.cooperativas), sim("OP"), saldo, dias, e.monto / 24));
      else {
        const vencido = e.cae_aca ? saldo * uniforme(0.3, 0.8) : 0;
        lista(raw, "retails", "retails").push({
          institucion: nuevaEntidad(POOL.retail, (o) => o.institucion).institucion, tipoIdentificacion: "C", identificacion: p.cedula, nombre: p.t0.nombre, valorVencido: Math.round(vencido * 100) / 100,
          valorProcesoJudicial: null, valorProcesoCastigado: 0, totalDeuda: Math.round(saldo * 100) / 100, diasMora: dias,
          fecha: diaMesAnioCorto(T1_BURO), fechaActualizacion: sumarDias(T1_BURO, 15),
        });
      }
    }

    // Nuestro crédito, con lo que dice el archivo de la institución.
    if (p.otorgado && p.estadoOperacion !== "cancelada") {
      const saldo = p.monto * Math.max(0.05, 1 - 11 / p.plazo);
      const dias = moraVisible ? Math.max(91, Math.min(p.diasMora12, diasEntre(p.fechaDefault, T1_BURO))) : 0;
      lista(raw, "buroCreditoCoop", "datosSuper").push(filaCooperativa(p, { ...COOP_SIMULADA, cod_tipo_operacion: p.producto === "microcredito" ? "MIC" : "CON" },
        p.numeroOperacion, saldo, dias, p.cuota, moraVisible && p.estadoOperacion === "castigada"));
    }
  }

  // El IESS avanza doce meses: quien aporta sigue aportando, salvo que pierda
  // el trabajo; quien consigue uno nuevo empieza a aportar.
  if (p.puede.iess) {
    const tiess = lista(raw, "basesInternas", "tiess");
    const ultimo = tiess.reduce((m, a) => { const k = mesClave(a.anio, a.mes); return k > m ? k : m; }, "");
    const vigentes = ultimo === T0_IESS ? tiess.filter((a) => mesClave(a.anio, a.mes) === T0_IESS) : [];
    const perdida = ev("perdida_trabajo")[0];
    const mecanizado = disponible(raw, "trabajoHistoricosMecanizado") ? lista(raw, "trabajoHistoricosMecanizado", "mecanizadoEmpleados") : null;
    const ultimoMecanizadoDe = new Map();
    for (const r of mecanizado ?? []) {
      const a = ultimoMecanizadoDe.get(r.rucEmpresa);
      if (!a || String(r.baseDate).localeCompare(String(a.baseDate), undefined, { numeric: true }) > 0) ultimoMecanizadoDe.set(r.rucEmpresa, r);
    }
    for (let mes = mesSiguiente(T0_IESS); mes <= T1_IESS; mes = mesSiguiente(mes)) {
      if (perdida && mes >= mesDe(perdida.fecha)) break;
      for (const a of vigentes) {
        tiess.push({ ...a, anio: Number(mes.slice(0, 4)), mes: Number(mes.slice(5, 7)) });
        const m = ultimoMecanizadoDe.get(a.rucEmp);
        if (m && mecanizado) mecanizado.push({ ...structuredClone(m), baseDate: mes, fechaActualizacion: diaMesAnio(`${mes}-28`) });
      }
    }
    for (const nuevo of ev("trabajo_nuevo")) {
      const salario = Math.max(sbuDelAnio(Number(nuevo.fecha.slice(0, 4))), Math.round((p.ingreso ?? 0) * uniforme(1, 1.3)));
      nuevo.salario = salario;
      for (let mes = mesDe(nuevo.fecha); mes <= T1_IESS; mes = mesSiguiente(mes)) {
        tiess.push(filaAporte(p, EMPRESA_SIMULADA, mes, salario, nuevo.fecha));
        if (mecanizado) mecanizado.push(filaMecanizado(EMPRESA_SIMULADA, mes, salario, nuevo.fecha));
      }
    }
  }

  // El negocio cierra: cese en el RUC y establecimientos cerrados.
  for (const e of ev("cierre_negocio")) {
    const propios = lista(raw, "contribuyente", "datosContribuyente").filter((c) => String(c.ruc ?? "").startsWith(p.cedula));
    for (const c of propios) c.fecha_suspension_definitiva = conBarras(e.fecha);
    if (disponible(raw, "establecimientoActEconomica")) {
      for (const s of lista(raw, "establecimientoActEconomica", "datosEstablecimientoActEco")) {
        if (propios.some((c) => c.ruc === s.ruc)) { s.estado_establecimiento = "CERRADO"; s.fech_cierre = diaMesAnio(e.fecha); }
      }
    }
    e.sin_donde = propios.length === 0 || undefined;
  }

  for (const e of ev("pension_alimenticia")) {
    const valor = entre(120, 380);
    const enMora = moraVisible && azar() < 0.5;
    lista(raw, "pensionAlimenticiaNovadata", "supas").push({
      numeroProceso: sim("SUPA"), dependenciaJurisdiccional: "UNIDAD JUDICIAL SIMULADA", codigoTarjeta: `${e.fecha.slice(0, 4)}-${String(entre(10000, 99999))}`,
      tipoPension: "ALIMENTOS", representanteLegal: "REPRESENTANTE SIMULADO", obligadoPrincipal: p.t0.nombre, valorMensual: valor,
      totalPagado: valor * Math.max(1, Math.floor(diasEntre(e.fecha, T1) / 30) - (enMora ? 3 : 0)), totalDeuda: enMora ? valor * 3 : 0, valorDeuda: null, estado: "ACTIVO",
    });
  }

  for (const e of [...ev("demanda_civil"), ...ev("demanda_cobro")]) {
    const molde = e.tipo === "demanda_cobro" ? unoDe(POOL.cobro) : unoDe(POOL.civil);
    lista(raw, "demandas", "demandas").push({
      fechaActualizacion: instante(T1),
      tipoDemanda: { idTipoDemanda: molde.idTipoDemanda, descripcion: "DEMANDADO" },
      demanda: { numeroProceso: sim("PROC"), judicatura: "UNIDAD JUDICIAL SIMULADA", numeroIngreso: 1, delito: molde.delito, juez: "JUEZ SIMULADO",
        ofendido: e.tipo === "demanda_cobro" ? molde.ofendido : "PARTE SIMULADA", demandado: p.t0.nombre, fecha: instante(e.fecha) },
    });
    e.delito = molde.delito;
  }

  for (const e of ev("proceso_fiscalia")) {
    e.delito = unoDe(POOL.fiscalia);
    lista(raw, "denuncias", "denuncias").push({
      nroNoticia: sim("NDD"), lugar: "SIMULADO", fecha: e.fecha, hora: "10:00", digitador: "", nroOficio: "", delito: e.delito, unidad: "FISCALÍA SIMULADA",
      detalleDenuncia: [{ cedula: p.cedula, nombres: p.t0.nombre, estado: "PROCESADO" }, { cedula: "", nombres: "PARTE SIMULADA", estado: "DENUNCIANTE" }],
    });
  }
  // Las fuentes caídas en t1 llegan como llega una caída de verdad.
  for (const f of p.caidas) raw[f] = { status: "error", data: null, errorMessage: "caída simulada por el Laboratorio" };
  return raw;
}

// Se arma en orden fijo (el azar es uno solo: en paralelo no sería
// reproducible) y se sube en tandas. La carpeta lleva un identificador propio
// porque la carga se crea después: si algo falla antes de escribir en la
// base, los crudos quedan huérfanos bajo un nombre que no pisa nada.
const SIMULACION_ID = crypto.randomUUID();
const rutaT1 = (p) => `simulacion/${SIMULACION_ID}/${p.clientId}.json.gz`;
let subidos = 0, pendientes = [];
for (const p of personas) {
  const raw = armarT1(p, leerT1(p));
  if (SECO) continue;
  pendientes.push(subirObjeto("lab-archivos", rutaT1(p), { cedula: p.cedula, capturadoEl: `${T1}T15:00:00.000Z`, perfilId: null, simulado: true, raw }).then(() => subidos++));
  if (pendientes.length >= 8) { await Promise.all(pendientes); pendientes = []; }
}
await Promise.all(pendientes);
if (!SECO) console.log(`crudos de t1 subidos: ${subidos} de ${personas.length} (simulacion/${SIMULACION_ID}/)`);

// ------------------------------------------------------------------ conteos
const contar = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const otorgados = personas.filter((p) => p.otorgado);
const resumen = {
  personas: personas.length,
  recomendaciones: contar(personas, (p) => p.recomendacion),
  otorgados: otorgados.length,
  otorgados_por_recomendacion: contar(otorgados, (p) => p.recomendacion),
  malos: personas.filter((p) => p.malo).length,
  malos_otorgados: otorgados.filter((p) => p.malo).length,
  malos_no_otorgados: personas.filter((p) => !p.otorgado && p.malo).length,
  malos_no_otorgados_con_credito_de_otro: personas.filter((p) => !p.otorgado && p.malo && p.eventos.some((e) => e.tipo === "credito_otra_institucion")).length,
  se_pusieron_al_dia: personas.filter((p) => p.sePusoAlDia).length,
  licencia_vencida: personas.filter((p) => p.licenciaVencida).length,
  aporta_hoy_con_huecos: personas.filter((p) => p.fraccionHuecos > 0.25).length,
  eventos: contar(personas.flatMap((p) => p.eventos), (e) => e.tipo),
  motivo_principal: contar(personas.filter((p) => p.malo), (p) => p.motivos[0]?.motivo ?? "ninguno"),
  anticipable: contar(personas.filter((p) => p.malo), (p) => p.anticipable),
  cuota_no_cabia: otorgados.filter((p) => p.cuotaNoCabia).length,
  capacidad_no_medible_otorgados: otorgados.filter((p) => p.capacidadNoMedible).length,
  fuentes_caidas_en_t1: contar(personas.flatMap((p) => p.caidas), (f) => f),
  en_observacion_otorgados: otorgados.filter((p) => !p.malo && p.diasMora12 >= 15).length,
};
console.log(JSON.stringify(resumen, null, 1));
if (SECO) process.exit(0);

// --------------------------------------------------------------- escritura
const regla = {
  semilla: SEMILLA, tasa_objetivo: TASA, otorgados_objetivo: OTORGADOS, personas: personas.length,
  fechas: { inicio_reconsulta: INICIO_RECONSULTA, ultimo_desembolso: ULTIMO_DESEMBOLSO, t1: T1, corte_buro_t1: T1_BURO, corte_iess_t0: T0_IESS, corte_iess_t1: T1_IESS },
  base_de_t1: `la reconsulta real del 2026-10-03 (${path.relative(RAIZ, CARPETA_T1)}) con eventos escritos encima`,
  modelo_sintetico: { constante: r4(BM), ve: "sólo la primera capa", puntaje: "950 - 900 x probabilidad + ruido normal de 40", recomendacion: `por cuantil ${JSON.stringify(PROPORCION_RECOMENDACION)}: aprobar sobre ${CORTE_APROBAR}, revisar sobre ${CORTE_REVISAR}; bloqueado si lo estaba en t0` },
  desembolso: { pesos: PESO_DESEMBOLSO, factor: r4(K_DESEMBOLSO), cuota: "francesa al 16% (consumo) o 22% (microcrédito) anual" },
  capas: {
    visible: { coeficientes: COEF_VISIBLE, peso_calificacion: PESO_CALIFICACION },
    dato_no_recibido: { variable: "fuentesIngreso.detalle.mesesConAporteUltimos24 (catálogo: meses_con_aporte_24)", coeficiente: COEF_OCULTA, termino: "fracción de meses sin aporte entre hace 13 y 24 meses, sólo si aporta hoy" },
    // ruta y derivaciones como las escribe explorar-crudo.mjs: la calificación las busca ahí.
    dato_solo_crudo: {
      campo: "licenciaConducir.licencia.validezHasta anterior al día del análisis", coeficiente: COEF_CRUDO,
      ruta: "licenciaConducir.data.licencia[].validezHasta", derivaciones: ["fecha_anterior", "alguna_fecha_anterior"],
    },
  },
  eventos: { efectos: EFECTO, sobreendeudamiento: EFECTO_SOBREENDEUDAMIENTO, probabilidades: PROBABILIDAD },
  capacidad: { cuota_no_cabia: EFECTO_CUOTA_NO_CABIA, capacidad_no_medible: EFECTO_CAPACIDAD_NO_MEDIBLE },
  impago: { constante: r4(B0), se_pone_al_dia: 0.15, dias: "más de 90; en bancos, la calificación por días de la tabla de la Superintendencia (D o E)" },
  fuentes_caidas_en_t1: CAIDA_EN_T1,
  crudos_t1: `lab-archivos/simulacion/${SIMULACION_ID}/`,
  referencia: resumen,
  que_no_prueba: "nada sobre el motor real ni sobre la frecuencia real de los eventos",
};
const { datos: [carga] } = await rest("lab_cargas", {
  method: "POST", headers: { Prefer: "return=representation" },
  body: JSON.stringify({ etiqueta: `Ciclo simulado de un año (semilla ${SEMILLA}, ${fechaEc(Date.now())})`, origen: "sintetica", es_sintetica: true, regla_plantada: regla, fecha_corte: T1, institucion: COOP_SIMULADA.razon_social,
    institucion_en_buro: { cooperativa_ruc: COOP_SIMULADA.codRuc } }),
});
console.log(`carga ${carga.id}`);

const filasOperaciones = otorgados.map((p) => ({
  carga_id: carga.id, cedula: p.cedula, numero_operacion: p.numeroOperacion, producto: p.producto, monto: p.monto, plazo_meses: p.plazo,
  cuota_mensual: p.cuota, canal: elegir({ agencia: 0.6, digital: 0.25, corresponsal: 0.15 }),
  fecha_desembolso: p.desembolso, estado_operacion: p.estadoOperacion, dias_mora_max_12m: p.diasMora12, dias_mora_max_24m: null,
  fecha_primer_default: p.malo ? p.fechaDefault : null,
  sintetico: { puntaje: p.puntaje, recomendacion: p.recomendacion === "bloqueado" ? "negar" : p.recomendacion, probabilidad: r4(p.probabilidad), malo: p.malo },
}));
const idOperacion = new Map();
for (let i = 0; i < filasOperaciones.length; i += 500) {
  const { datos } = await rest("lab_operaciones?select=id,numero_operacion", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(filasOperaciones.slice(i, i + 500)) });
  for (const o of datos) idOperacion.set(o.numero_operacion, o.id);
}
const { datos: conciliacion } = await rest("rpc/lab_cerrar_carga", { method: "POST", body: JSON.stringify({ p_carga: carga.id }) });
console.log("conciliación:", JSON.stringify(conciliacion));

const idSolicitud = new Map();
// Lo que la institución simulada informa de lo que no desembolsó: un aprobado
// sin crédito casi siempre desistió; un revisado, casi siempre lo negó.
const decisionSinCredito = (rec) =>
  rec === "aprobar" ? elegir({ desistio: 0.6, negada: 0.4 }) : rec === "revisar" ? elegir({ negada: 0.7, desistio: 0.3 }) : "negada";
const filasSolicitudes = personas.map((p) => ({
  carga_id: carga.id, cedula: p.cedula, client_id: p.clientId, client_profile_id: p.t0.id, analysis_result_id: p.analisis?.id ?? null,
  fecha_solicitud: p.t0Fecha, recomendacion: p.recomendacion, puntaje: p.puntaje, fuente_puntaje: "sintetico",
  desembolsada: p.otorgado, operacion_id: p.otorgado ? idOperacion.get(p.numeroOperacion) : null,
  decision_institucion: p.otorgado ? "desembolsada" : decisionSinCredito(p.recomendacion),
}));
for (let i = 0; i < filasSolicitudes.length; i += 500) {
  const { datos } = await rest("lab_solicitudes?select=id,cedula", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(filasSolicitudes.slice(i, i + 500)) });
  for (const s of datos) idSolicitud.set(s.cedula, s.id);
}

const lotes = (filas, f) => filas.reduce((acc, x, i) => { if (i % 500 === 0) acc.push([]); acc.at(-1).push(f(x)); return acc; }, []);
for (const lote of lotes(personas, (p) => ({
  solicitud_id: idSolicitud.get(p.cedula), carga_id: carga.id, origen: "simulada", fecha: T1, corte_iess: T1_IESS, crudo_ruta: rutaT1(p),
}))) await rest("lab_reconsultas", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(lote) });
for (const lote of lotes(personas, (p) => ({
  solicitud_id: idSolicitud.get(p.cedula), carga_id: carga.id, probabilidad: r4(p.probabilidad), malo: p.malo, fecha_default: p.malo ? p.fechaDefault : null,
  eventos: p.eventos, motivos: p.motivos ?? [], anticipable: p.malo ? p.anticipable : null, se_puso_al_dia: p.sePusoAlDia, fuentes_caidas: p.caidas,
}))) await rest("lab_simulacion_verdad", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(lote) });

// Se cuenta en la base: una lectura de filas se cortaría en 1.000.
const cuantas = async (tabla, filtro = "") => {
  const { cabeceras } = await rest(`${tabla}?select=carga_id&carga_id=eq.${carga.id}${filtro}&limit=1`, { headers: { Prefer: "count=exact" } });
  return Number(cabeceras.get("content-range")?.split("/")[1]);
};
const escritas = {
  solicitudes: await cuantas("lab_solicitudes"), desembolsadas: await cuantas("lab_solicitudes", "&desembolsada=is.true"),
  reconsultas: await cuantas("lab_reconsultas"), verdad: await cuantas("lab_simulacion_verdad"),
};
console.log(`escritas: ${JSON.stringify(escritas)} (personas ${personas.length}, otorgados ${otorgados.length})`);
