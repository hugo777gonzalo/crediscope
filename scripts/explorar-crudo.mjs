// El explorador del crudo del Laboratorio (fase E, docs/laboratorio-pantallas.md).
//
// El modelo lee el perfil del modelo, y el perfil sale del crudo de Novadata:
// lo que el crudo trae y la estructura no lee no lo ve nadie. Esto lo busca.
// Recorre el crudo del DÍA DEL ANÁLISIS (t0) de cada persona del corte --
// nunca una reconsulta, que ya trae la mora y hace "acertar" a cualquier
// campo -- y guarda en lab_resultados (tipo 'crudo'):
//  - el diccionario por fuente: cada campo, su tipo, cobertura, vacíos y
//    valores frecuentes. Un valor se muestra sólo si el campo tiene pocos
//    distintos y lo comparten 10 personas o más: nunca el de una persona;
//  - los hallazgos: cada campo y sus derivados (lo tiene, cuántos, su valor,
//    una fecha anterior al análisis, cada categoría) contra el impago, con
//    valor de información, tasas con intervalo y la corrección por
//    comparaciones múltiples: son miles de pruebas, y al 5% saldrían decenas
//    de asociaciones por azar;
//  - si el código de la estructura nombra el campo. Es aproximado (busca el
//    nombre de la hoja en _shared/), pero lo que NO nombra seguro no lo lee.
//
// Quien no fue medido no cuenta como "no tiene": el universo de cada campo
// son las personas cuya fuente contestó (estadoPorFuente: ok u ok_vacio).
//
// Es un guion porque bajar 2.500 crudos desde el navegador es pesado. Lee
// primero los respaldos de research/ (si el archivo es de ese perfil) y si
// no, el depósito crudo-novadata.
//
// No lee la verdad plantada de una simulación: lab_calificar_simulacion()
// compara después lo que encontró.
//
// Lo que no pasa por lint ni build se rompe en silencio: correr primero con
// --seco (calcula e imprime, no guarda).
//
// Uso: node scripts/explorar-crudo.mjs --corte=<uuid> [--seco] [--limite=N] [--buscar=texto]
//   --buscar imprime el puesto de los hallazgos cuya ruta contiene ese texto.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const CORTE = arg("corte", null);
const SECO = process.argv.includes("--seco");
const LIMITE = Number(arg("limite", "0")) || Infinity;
if (!/^[0-9a-f-]{36}$/i.test(CORTE ?? "")) throw new Error("Falta --corte=<uuid>");

// Un grupo de menos de 20 personas da tasas que no dicen nada.
const MIN_GRUPO = 20;
// Un valor se muestra si lo comparten por lo menos tantas personas.
const MIN_PERSONAS_VALOR = 10;
// Más distintos que esto: texto libre o identificador, no una categoría.
const MAX_CATEGORIAS = 30;
const MAX_HALLAZGOS = 200;
const DIA = 86_400_000;

const { estadoPorFuente } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/calidad-de-la-consulta.ts")).href);
const E = await import(pathToFileURL(path.join(RAIZ, "src/lib/estadistica.js")).href);

const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
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
const enTrozos = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));
async function enParalelo(items, n, fn) {
  let siguiente = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (siguiente < items.length) { const i = siguiente++; await fn(items[i], i); } }));
}
async function bajarObjeto(bucket, ruta) {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${ruta}`, { headers: auth });
  if (!r.ok) throw new Error(`Storage ${bucket}/${ruta}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  try { return JSON.parse(zlib.gunzipSync(buf).toString("utf8")); } catch { return JSON.parse(buf.toString("utf8")); }
}

// ------------------------------------------------------------- población
const { datos: [corte] } = await rest(`lab_cortes?select=id,nombre,es_sintetico&id=eq.${CORTE}`);
if (!corte) throw new Error("No existe el corte");

// Con solicitudes (ciclo de un año) se mira a todas las observadas: con sólo
// los desembolsados hay ~20 malos y cualquier asociación es ruido. Desde la
// 110 con el resultado del buró para todos (malo_buro), como las pantallas:
// mezclar el archivo para lo desembolsado con el buró para el resto hacía que
// "recibió nuestro crédito" pareciera anticipar el impago. En un corte
// anterior a la 110 (observable_buro nulo) vale `malo`, como entonces.
let poblacion = "solicitudes";
let filas = (await traerTodas(`lab_corte_solicitudes?select=solicitud_id,cedula,malo,incluida,observable_buro,malo_buro,recomendacion&corte_id=eq.${CORTE}&order=solicitud_id.asc`))
  .filter((f) => (f.observable_buro === null ? f.incluida && f.malo !== null : f.observable_buro && f.malo_buro !== null))
  .map((f) => ({ ...f, malo: f.observable_buro === null ? f.malo : f.malo_buro }));
if (filas.length) {
  const perfilDe = new Map();
  for (const trozo of enTrozos(filas.map((f) => f.solicitud_id), 100)) {
    const { datos } = await rest(`lab_solicitudes?select=id,client_profile_id&id=in.(${trozo.join(",")})`);
    for (const d of datos) perfilDe.set(d.id, d.client_profile_id);
  }
  filas = filas.map((f) => ({ cedula: f.cedula, malo: f.malo, recomendacion: f.recomendacion, perfilId: perfilDe.get(f.solicitud_id) ?? null }));
} else {
  poblacion = "operaciones";
  filas = (await traerTodas(`lab_corte_operaciones?select=operacion_id,cedula,malo,recomendacion,client_profile_id&corte_id=eq.${CORTE}&incluida=is.true&primera_de_la_persona=is.true&malo=not.is.null&order=operacion_id.asc`))
    .map((o) => ({ cedula: o.cedula, malo: o.malo, recomendacion: o.recomendacion, perfilId: o.client_profile_id }));
}
filas = filas.slice(0, LIMITE);
const N = filas.length;
if (!N) throw new Error("El corte no tiene personas observadas");

const perfiles = new Map();
for (const trozo of enTrozos([...new Set(filas.map((f) => f.perfilId).filter(Boolean))], 100)) {
  const { datos } = await rest(`client_profiles?select=id,created_at,crudo_ruta&id=in.(${trozo.join(",")})`);
  for (const d of datos) perfiles.set(d.id, d);
}

// ---------------------------------------------------------- acumuladores
const CARPETAS = fs.readdirSync(path.join(RAIZ, "research"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith("novadata-raw")).map((d) => path.join(RAIZ, "research", d.name));
// El perfilId está al principio del archivo: se lee eso antes de parsear 150 KB.
function crudoLocal(cedula, perfilId) {
  for (const carpeta of CARPETAS) {
    const archivo = path.join(carpeta, `${cedula}.json`);
    if (!fs.existsSync(archivo)) continue;
    const fd = fs.openSync(archivo, "r");
    const cabeza = Buffer.alloc(400);
    fs.readSync(fd, cabeza, 0, 400, 0);
    fs.closeSync(fd);
    if (cabeza.toString("utf8").includes(`"perfilId":"${perfilId}"`)) return JSON.parse(fs.readFileSync(archivo, "utf8")).raw;
  }
  return null;
}

const malo = new Uint8Array(N);
// La recomendación del modelo de cada persona: dentro de cada una se mira si
// el campo sigue separando a buenos de malos (Mantel-Haenszel, en binaria).
const ESTRATOS = ["aprobar", "revisar", "negar", "bloqueado"];
const estrato = new Uint8Array(N);
const t0 = new Float64Array(N).fill(NaN);
const contesto = new Map(); // fuente -> Uint8Array: la fuente contestó (ok u ok_vacio)
const estadosDeFuente = new Map(); // fuente -> { estado: personas }
const campos = new Map();
const origen = { local: 0, deposito: 0, sinCrudo: 0, sinPerfil: 0 };

const esVacio = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const NUMERO_EN_TEXTO = /^-?\d+([.,]\d+)?$/;
// Diez dígitos o más sin decimales es una cédula, un RUC o un teléfono.
const IDENTIFICADOR_EN_TEXTO = /^\d{9,}$/;
function fechaDeTexto(s) {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}

function campo(ruta) {
  let c = campos.get(ruta);
  if (!c) {
    c = { ruta, fuente: ruta.split(/[.[]/)[0], ocurrencias: 0, vacias: 0, personas: new Uint8Array(N), cuenta: null, min: null, max: null,
      nNumero: 0, nGrande: 0, nFechaTexto: 0, nIdentificador: 0, nTexto: 0, nBooleano: 0, valores: new Map(), altaCardinalidad: false };
    campos.set(ruta, c);
  }
  return c;
}

function anotar(c, v, i) {
  c.ocurrencias++;
  if (esVacio(v)) { c.vacias++; return; }
  c.personas[i] = 1;
  if (c.ruta.includes("[]")) { c.cuenta ??= new Uint16Array(N); c.cuenta[i]++; }
  let numero = null;
  if (typeof v === "number") { numero = v; c.nNumero++; if (Math.abs(v) >= 1e11 && Math.abs(v) <= 4.2e12) c.nGrande++; }
  else if (typeof v === "boolean") c.nBooleano++;
  else {
    const s = String(v).trim();
    const fecha = fechaDeTexto(s);
    if (fecha !== null) { numero = fecha; c.nNumero++; c.nFechaTexto++; }
    else if (IDENTIFICADOR_EN_TEXTO.test(s)) c.nIdentificador++;
    else if (NUMERO_EN_TEXTO.test(s)) { numero = Number(s.replace(",", ".")); c.nNumero++; }
    else c.nTexto++;
  }
  if (numero !== null && Number.isFinite(numero)) {
    if (!c.min) { c.min = new Float64Array(N).fill(NaN); c.max = new Float64Array(N).fill(NaN); }
    if (!(c.min[i] <= numero)) c.min[i] = numero;
    if (!(c.max[i] >= numero)) c.max[i] = numero;
  }
  if (!c.altaCardinalidad) {
    const clave = String(v).trim().slice(0, 80);
    const lista = c.valores.get(clave);
    if (lista) { if (lista[lista.length - 1] !== i) lista.push(i); }
    else if (c.valores.size >= 50) { c.altaCardinalidad = true; c.valores = null; }
    else c.valores.set(clave, [i]);
  }
}

function recorrer(v, ruta, i) {
  if (Array.isArray(v)) { for (const x of v) recorrer(x, `${ruta}[]`, i); return; }
  if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) recorrer(x, ruta ? `${ruta}.${k}` : k, i); return; }
  if (ruta) anotar(campo(ruta), v, i);
}

function procesar(raw, i) {
  for (const [fuente, estado] of Object.entries(estadoPorFuente(raw))) {
    if (!contesto.has(fuente)) { contesto.set(fuente, new Uint8Array(N)); estadosDeFuente.set(fuente, {}); }
    if (estado === "ok" || estado === "ok_vacio") contesto.get(fuente)[i] = 1;
    const e = estadosDeFuente.get(fuente);
    e[estado] = (e[estado] ?? 0) + 1;
  }
  recorrer(raw, "", i);
}

let hechos = 0;
await enParalelo(filas, 16, async (f, i) => {
  malo[i] = f.malo ? 1 : 0;
  estrato[i] = ESTRATOS.includes(f.recomendacion) ? ESTRATOS.indexOf(f.recomendacion) : ESTRATOS.length;
  const perfil = f.perfilId ? perfiles.get(f.perfilId) : null;
  if (!perfil) { origen.sinPerfil++; return; }
  let raw = crudoLocal(f.cedula, perfil.id);
  if (raw) origen.local++;
  else if (perfil.crudo_ruta) { raw = (await bajarObjeto("crudo-novadata", perfil.crudo_ruta)).raw; origen.deposito++; }
  if (!raw) { origen.sinCrudo++; return; }
  t0[i] = Date.parse(perfil.created_at);
  procesar(raw, i);
  if (++hechos % 500 === 0) console.log(`${hechos}...`);
});
console.log(`personas: ${N}; crudo local ${origen.local}, del depósito ${origen.deposito}, sin crudo ${origen.sinCrudo}, sin perfil ${origen.sinPerfil}; campos: ${campos.size}; fuentes: ${contesto.size}`);

// ------------------------------------------------------------ estadística
// La de src/lib/estadistica.js, la misma de las pantallas (fase 2 de la
// revisión, 2026-10-06). Hasta entonces este guion tenía su propia copia del
// intervalo de Wilson, la chi cuadrado, el IV y el AUC: dos copias que
// coinciden prueban que coinciden, no que estén bien.
const r4 = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const wilson = (m, n) => {
  const ic = E.wilson(m, n);
  return ic ? [r4(ic[0]), r4(ic[1])] : null;
};
// IV y WoE (suavizado 0,5 por tramo, como Variables) y la chi cuadrado de
// los tramos contra el resultado.
function ivYChi(tramos) {
  const { iv } = E.ivDeConteos(tramos);
  for (const t of tramos) {
    t.woe = r4(t.woe);
    t.tasa = r4(t.tasa);
    delete t.aporte;
    delete t.ic;
  }
  const chi = E.chiCuadrado(tramos.map((t) => [t.malos, t.n - t.malos]));
  return { iv, p: chi?.p ?? 1 };
}
const fuerza = (iv) => (iv < 0.02 ? "nada" : iv < 0.1 ? "débil" : iv < 0.3 ? "media" : "fuerte");

// Una condición sí/no dentro del universo (las personas cuya fuente contestó).
//
// Además de la asociación cruda, la misma comparación DENTRO de cada
// recomendación del modelo (Mantel-Haenszel): un campo del buró separa a
// buenos de malos, pero si dentro de "aprobar" ya no separa, el modelo lo
// tenía. Lo que sigue separando dentro de cada recomendación es lo que el
// modelo no vio.
function binaria(universo, condicion) {
  let n1 = 0, m1 = 0, n0 = 0, m0 = 0;
  let firma = 2166136261;
  const tabla = Array.from({ length: ESTRATOS.length + 1 }, () => [0, 0, 0, 0]); // con y malo, con y bueno, sin y malo, sin y bueno
  for (let i = 0; i < N; i++) {
    if (!universo[i]) continue;
    const t = tabla[estrato[i]];
    if (condicion(i)) { n1++; m1 += malo[i]; firma = Math.imul(firma ^ i, 16777619); t[malo[i] ? 0 : 1]++; }
    else { n0++; m0 += malo[i]; t[malo[i] ? 2 : 3]++; }
  }
  if (n1 < MIN_GRUPO || n0 < MIN_GRUPO) return null;
  const tramos = [{ tramo: "sí", n: n1, malos: m1 }, { tramo: "no", n: n0, malos: m0 }];
  const { iv, p } = ivYChi(tramos);
  let suma = 0, varianza = 0, numOr = 0, denOr = 0;
  for (const [a, b, c, d] of tabla) {
    const n = a + b + c + d;
    if (n < 2) continue;
    suma += a - ((a + b) * (a + c)) / n;
    varianza += ((a + b) * (c + d) * (a + c) * (b + d)) / (n * n * (n - 1));
    numOr += (a * d) / n;
    denOr += (b * c) / n;
  }
  // Mantel-Haenszel con la corrección de continuidad: una chi cuadrado de 1 grado.
  const pAjustada = varianza > 0 ? E.pChiCuadrado(Math.max(0, Math.abs(suma) - 0.5) ** 2 / varianza, 1) : null;
  return {
    universo: n1 + n0, con: n1, malos_con: m1, tasa_con: r4(m1 / n1), ic_con: wilson(m1, n1), sin: n0, malos_sin: m0, tasa_sin: r4(m0 / n0), ic_sin: wilson(m0, n0),
    iv: r4(iv), p, firma: `${n1}:${m1}:${firma >>> 0}`,
    razon_de_momios: r4(((m1 + 0.5) / (n1 - m1 + 0.5)) / ((m0 + 0.5) / (n0 - m0 + 0.5))),
    razon_de_momios_ajustada: denOr > 0 ? r4(numOr / denOr) : null, p_ajustada: pAjustada,
    por_recomendacion: tabla.map(([a, b, c, d], k) => ({ recomendacion: ESTRATOS[k] ?? "sin recomendación", con: a + b, malos_con: a, sin: c + d, malos_sin: c }))
      .filter((x) => x.con + x.sin > 0),
  };
}

// Un valor numérico (NaN = la fuente contestó pero no lo trae): tramos por
// quintiles con un tramo propio para "sin dato", y el AUC entre quienes lo traen.
// Un tramo de menos de MIN_GRUPO se junta con el vecino más chico: en la
// prueba con 400 personas, tramos de 3 o 5 daban los IV más altos de todos y
// ninguno sobrevivía a la corrección.
function numerica(universo, valor, etiqueta) {
  const con = [], sin = { n: 0, malos: 0 };
  for (let i = 0; i < N; i++) {
    if (!universo[i]) continue;
    const v = valor(i);
    if (Number.isNaN(v)) { sin.n++; sin.malos += malo[i]; } else con.push([v, malo[i]]);
  }
  if (con.length < 2 * MIN_GRUPO) return null;
  con.sort((a, b) => a[0] - b[0]);
  const distintos = new Set(con.map((x) => x[0])).size;
  if (distintos < 2) return null;
  let cortes;
  if (distintos <= 6) cortes = [...new Set(con.map((x) => x[0]))].slice(0, -1);
  else cortes = [...new Set([0.2, 0.4, 0.6, 0.8].map((q) => con[Math.floor(q * con.length)][0]))];
  let tramos = Array.from({ length: cortes.length + 1 }, () => ({ n: 0, malos: 0, desde: Infinity, hasta: -Infinity }));
  for (const [v, m] of con) {
    let b = 0;
    while (b < cortes.length && v > cortes[b]) b++;
    const t = tramos[b];
    t.n++; t.malos += m; t.desde = Math.min(t.desde, v); t.hasta = Math.max(t.hasta, v);
  }
  tramos = tramos.filter((t) => t.n > 0);
  for (let chico = tramos.findIndex((t) => t.n < MIN_GRUPO); chico !== -1 && tramos.length > 1; chico = tramos.findIndex((t) => t.n < MIN_GRUPO)) {
    const vecino = chico === 0 ? 1 : chico === tramos.length - 1 ? chico - 1 : tramos[chico - 1].n <= tramos[chico + 1].n ? chico - 1 : chico + 1;
    const [a, b] = [Math.min(chico, vecino), Math.max(chico, vecino)];
    tramos.splice(a, 2, { n: tramos[a].n + tramos[b].n, malos: tramos[a].malos + tramos[b].malos, desde: tramos[a].desde, hasta: tramos[b].hasta });
  }
  const llenos = tramos.map((t) => ({ tramo: t.desde === t.hasta ? etiqueta(t.desde) : `${etiqueta(t.desde)} a ${etiqueta(t.hasta)}`, n: t.n, malos: t.malos }));
  // "Sin dato" con menos de MIN_GRUPO personas no es un tramo: quedan fuera.
  if (sin.n >= MIN_GRUPO) llenos.push({ tramo: "sin dato", n: sin.n, malos: sin.malos });
  if (llenos.length < 2) return null;
  const total = llenos.reduce((s, t) => s + t.n, 0);
  const { iv, p } = ivYChi(llenos);
  // AUC = P(el valor de un malo > el de un bueno), empates a la mitad.
  const deMalos = con.filter((x) => x[1]).map((x) => x[0]), deBuenos = con.filter((x) => !x[1]).map((x) => x[0]);
  const auc = deMalos.length >= 10 && deBuenos.length >= 10 ? E.mannWhitney(deMalos, deBuenos).auc : null;
  // "Cuántos" de cada campo del mismo registro da tramos idénticos: la firma
  // los junta como equivalentes.
  return { universo: total, con: con.length, sin: sin.n, iv: r4(iv), p, auc: r4(auc), tramos: llenos, firma: `num:${JSON.stringify(llenos)}` };
}

// ------------------------------------------------- qué nombra la estructura
const EXCLUIDOS_DEL_CODIGO = new Set(["marco-interpretativo.ts", "llm-scoring.ts", "marco-por-cliente.ts"]);
const carpetaShared = path.join(RAIZ, "supabase/functions/_shared");
const codigo = fs.readdirSync(carpetaShared).filter((a) => a.endsWith(".ts") && !EXCLUIDOS_DEL_CODIGO.has(a))
  .map((a) => fs.readFileSync(path.join(carpetaShared, a), "utf8")).join("\n");
const nombraCache = new Map();
function nombra(fuente, hoja) {
  const clave = `${fuente}|${hoja}`;
  if (!nombraCache.has(clave)) {
    const escapada = hoja.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    nombraCache.set(clave, codigo.includes(`"${fuente}"`) && new RegExp(`\\b${escapada}\\b`).test(codigo));
  }
  return nombraCache.get(clave);
}
const esMetadato = (ruta) => /^[^.[]+\.(status$|data\.estado\.)/.test(ruta);
// Campos cuyo valor identifica a alguien: nunca se muestran ni se cortan en categorías.
const HOJA_IDENTIFICADORA = /cedula|identificaci|^ruc|nombre|apellido|direcci|calle|telefono|celular|correo|email|placa|razonSocial|empleador|patrono|beneficiari|titular|demandante|demandado|actor|ofendido|procesado|juez|abogado|denunciante|sospechoso/i;

// ---------------------------------------------------- tipos y diccionario
const fmtNumero = (x) => String(Math.round(x * 100) / 100);
const fmtFecha = (ms) => new Date(ms).toISOString().slice(0, 10);
function cuantil(valores, q) { return valores[Math.min(valores.length - 1, Math.floor(q * valores.length))]; }


const procesadas = new Uint8Array(N);
for (let i = 0; i < N; i++) procesadas[i] = Number.isNaN(t0[i]) ? 0 : 1;

const diccionario = [];
const pruebas = [];
for (const c of campos.values()) {
  const hoja = c.ruta.split(".").pop().replace(/\[\]/g, "");
  const metadato = esMetadato(c.ruta);
  const universo = contesto.get(c.fuente) ?? procesadas;
  let nUniverso = 0, nCon = 0;
  for (let i = 0; i < N; i++) if (universo[i]) { nUniverso++; nCon += c.personas[i]; }
  const noVacias = c.ocurrencias - c.vacias;
  const identificador = HOJA_IDENTIFICADORA.test(hoja) || c.nIdentificador > 0.5 * noVacias;
  const esFecha = c.nNumero > 0 && (c.nGrande + c.nFechaTexto) >= 0.9 * c.nNumero && c.nNumero >= 0.5 * noVacias;
  const esNumero = !esFecha && !identificador && c.nNumero >= 0.9 * noVacias && noVacias > 0;
  const tipo = metadato ? "metadato" : identificador ? "identificador" : esFecha ? "fecha" : esNumero ? "número"
    : c.nBooleano >= 0.9 * noVacias && noVacias > 0 ? "sí/no" : noVacias === 0 ? "siempre vacío" : "texto";
  const kinds = [["número", c.nNumero], ["texto", c.nTexto], ["sí/no", c.nBooleano], ["identificador", c.nIdentificador]].filter(([, n]) => n >= Math.max(1, 0.1 * noVacias));
  const nombrado = !metadato && nombra(c.fuente, hoja);

  const entrada = {
    ruta: c.ruta, fuente: c.fuente, tipo, nombrado, personas: nCon, universo: nUniverso,
    cobertura: nUniverso ? r4(nCon / nUniverso) : null, vacias: c.ocurrencias ? r4(c.vacias / c.ocurrencias) : null,
    distintos: c.altaCardinalidad ? null : c.valores.size,
  };
  if (kinds.length > 1) entrada.tipos_mezclados = kinds.map(([k]) => k);
  if (!c.altaCardinalidad && !identificador && c.valores.size <= MAX_CATEGORIAS) {
    const frecuentes = [...c.valores].map(([v, l]) => [v, l.length]).filter(([v, n]) => n >= MIN_PERSONAS_VALOR && !IDENTIFICADOR_EN_TEXTO.test(v))
      .sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (frecuentes.length) entrada.valores = frecuentes;
    // "Abierto" y "ABIERTO" son el mismo valor escrito distinto: calidad.
    const porNormal = new Map();
    for (const v of c.valores.keys()) {
      const normal = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ");
      porNormal.set(normal, [...(porNormal.get(normal) ?? []), v]);
    }
    const variantes = [...porNormal.values()].filter((l) => l.length > 1 && l.every((v) => (c.valores.get(v)?.length ?? 0) >= MIN_PERSONAS_VALOR));
    if (variantes.length) entrada.variantes = variantes;
  }
  if ((esFecha || esNumero) && c.max) {
    const vals = [];
    for (let i = 0; i < N; i++) if (!Number.isNaN(c.max[i])) vals.push(c.max[i]);
    vals.sort((a, b) => a - b);
    if (vals.length >= MIN_PERSONAS_VALOR) {
      const f = esFecha ? fmtFecha : (x) => r4(x);
      entrada.resumen = { p10: f(cuantil(vals, 0.1)), mediana: f(cuantil(vals, 0.5)), p90: f(cuantil(vals, 0.9)) };
    }
  }
  diccionario.push(entrada);
  if (metadato || identificador || nCon < MIN_GRUPO) continue;

  const base = { ruta: c.ruta, fuente: c.fuente, tipo, nombrado };
  const tiene = (i) => c.personas[i] === 1;
  if (nCon <= nUniverso - MIN_GRUPO) pruebas.push({ ...base, derivacion: "tiene", ...binaria(universo, tiene) });
  if (c.cuenta) {
    let maximo = 0;
    for (let i = 0; i < N; i++) if (c.cuenta[i] > maximo) maximo = c.cuenta[i];
    if (maximo >= 2) pruebas.push({ ...base, derivacion: "cuantos", ...numerica(universo, (i) => c.cuenta[i], fmtNumero) });
  }
  if (esNumero && c.max) pruebas.push({ ...base, derivacion: "valor", ...numerica(universo, (i) => c.max[i], fmtNumero) });
  if (esFecha && c.max) {
    const todas = binaria(universo, (i) => c.max[i] < t0[i]);
    const alguna = binaria(universo, (i) => c.min[i] < t0[i]);
    if (todas && todas.con !== nCon) pruebas.push({ ...base, derivacion: "fecha_anterior", ...todas });
    if (alguna && alguna.con !== nCon && alguna.con !== todas?.con) pruebas.push({ ...base, derivacion: "alguna_fecha_anterior", ...alguna });
    pruebas.push({ ...base, derivacion: "dias", ...numerica(universo, (i) => (Number.isNaN(c.max[i]) ? NaN : Math.round((t0[i] - c.max[i]) / DIA)), (x) => String(x)) });
  }
  if ((tipo === "texto" || tipo === "sí/no") && !c.altaCardinalidad && c.valores.size <= MAX_CATEGORIAS) {
    for (const [valor, personas] of c.valores) {
      if (personas.length < MIN_GRUPO || IDENTIFICADOR_EN_TEXTO.test(valor)) continue;
      const marca = new Uint8Array(N);
      for (const i of personas) marca[i] = 1;
      pruebas.push({ ...base, derivacion: "categoria", categoria: valor, ...binaria(universo, (i) => marca[i] === 1) });
    }
  }
}

// Sólo las que se pudieron medir (binaria/numerica devuelven null con grupos chicos).
const medidas = pruebas.filter((p) => p.iv !== undefined && p.iv !== null && Number.isFinite(p.p));
// Las condiciones idénticas (por ejemplo, "tiene" en cada campo del mismo
// registro) se cuentan una vez: se queda la de ruta más corta. Antes de
// corregir, para no contar dos veces la misma prueba.
const porFirma = new Map();
for (const p of medidas.sort((a, b) => a.ruta.length - b.ruta.length)) {
  const igual = porFirma.get(p.firma);
  if (igual) { igual.equivalentes = [...(igual.equivalentes ?? []), `${p.ruta}${p.categoria ? ` = ${p.categoria}` : ""}`]; p.repetida = true; }
  else porFirma.set(p.firma, p);
}
const unicas = medidas.filter((p) => !p.repetida);
// Benjamini-Hochberg: controla la proporción de falsos hallazgos entre los
// que se declaran significativos.
E.benjaminiHochberg(unicas.map((p) => p.p)).forEach((q, i) => { unicas[i].q = q; });
const significativas = unicas.filter((p) => p.q < 0.05);

// ¿El modelo ya lo tenía? Cuánto del efecto sobrevive dentro de cada
// recomendación: la parte del logaritmo de la razón de momios que queda.
// Se mide el efecto y no la significancia del ajuste: el ajuste confirma lo
// ya descubierto, y con una segunda corrección sobre 850 pruebas la licencia
// vencida plantada (razón 1,80 cruda, 1,68 ajustada: casi intacta) salía
// como "el modelo la tenía" sólo por falta de casos.
function ajuste(p) {
  if (p.razon_de_momios_ajustada === undefined || p.razon_de_momios_ajustada === null || !p.razon_de_momios) return { parte_no_explicada: null, el_modelo: null };
  const cruda = Math.log(p.razon_de_momios), ajustada = Math.log(p.razon_de_momios_ajustada);
  if (Math.abs(cruda) < 1e-9) return { parte_no_explicada: null, el_modelo: null };
  const parte = Math.max(0, Math.min(1, ajustada / cruda));
  const el_modelo = parte < 0.5 ? "lo_tenia" : p.p_ajustada < 0.05 ? "no_lo_tenia" : "no_concluyente";
  return { parte_no_explicada: r4(parte), el_modelo };
}
const noLoTenia = significativas.filter((p) => ajuste(p).el_modelo === "no_lo_tenia");
// Primero lo que sobrevive a la corrección, después el resto; dentro, por IV.
const hallazgos = unicas.sort((a, b) => (b.q < 0.05) - (a.q < 0.05) || b.iv - a.iv).slice(0, MAX_HALLAZGOS).map((p) => {
  const { firma: _firma, repetida: _repetida, ...resto } = p;
  return {
    ...resto, p: r4(p.p), q: r4(p.q), significativa: p.q < 0.05, fuerza: fuerza(p.iv), sospecha_de_fuga: p.iv > 0.5,
    p_ajustada: r4(p.p_ajustada ?? null), ...ajuste(p),
    equivalentes: p.equivalentes?.slice(0, 10), mas_equivalentes: Math.max(0, (p.equivalentes?.length ?? 0) - 10) || undefined,
  };
});

// --------------------------------------------------------------- fuentes
const fuentes = [...new Set([...contesto.keys(), ...diccionario.map((d) => d.fuente)])].map((fuente) => {
  const delaFuente = diccionario.filter((d) => d.fuente === fuente && d.tipo !== "metadato");
  const mejor = hallazgos.find((h) => h.fuente === fuente);
  const u = contesto.get(fuente);
  let contestaron = 0;
  if (u) for (let i = 0; i < N; i++) contestaron += u[i];
  return {
    fuente, estados: estadosDeFuente.get(fuente) ?? {}, contestaron, campos: delaFuente.length,
    campos_no_nombrados: delaFuente.filter((d) => !d.nombrado && d.tipo !== "identificador" && d.tipo !== "siempre vacío").length,
    con_datos: delaFuente.length ? Math.max(...delaFuente.map((d) => d.personas)) : 0,
    mejor_hallazgo: mejor ? { ruta: mejor.ruta, derivacion: mejor.derivacion, categoria: mejor.categoria, iv: mejor.iv } : null,
  };
}).sort((a, b) => a.fuente.localeCompare(b.fuente));

let conCrudo = 0, malosConCrudo = 0;
for (let i = 0; i < N; i++) if (!Number.isNaN(t0[i])) { conCrudo++; malosConCrudo += malo[i]; }
const resultado = {
  es_sintetico: corte.es_sintetico, poblacion, personas: conCrudo, malos: malosConCrudo, sin_crudo: N - conCrudo,
  pruebas: medidas.length, condiciones_unicas: unicas.length, significativas: significativas.length, el_modelo_no_lo_tenia: noLoTenia.length,
  fuentes, hallazgos, diccionario,
  calidad: {
    tipos_mezclados: diccionario.filter((d) => d.tipos_mezclados).map((d) => ({ ruta: d.ruta, tipos: d.tipos_mezclados })),
    variantes: diccionario.filter((d) => d.variantes).map((d) => ({ ruta: d.ruta, variantes: d.variantes })),
    siempre_vacios: diccionario.filter((d) => d.tipo === "siempre vacío").length,
  },
  advertencias: [
    malosConCrudo < 100 ? "Menos de 100 malos: los hallazgos orientan, no prueban." : null,
    `Se probaron ${unicas.length} condiciones distintas: al 5% saldrían unas ${Math.round(unicas.length * 0.05)} por azar. "Significativa" es después de la corrección por comparaciones múltiples (Benjamini-Hochberg).`,
    "Una asociación no prueba causa: un campo fuerte se valida en un corte posterior antes de proponerlo como dato nuevo.",
    "\"La estructura lo nombra\" es aproximado (el nombre aparece en el código); \"no lo nombra\" es seguro: nadie lo lee.",
    corte.es_sintetico ? "Corte sintético: tiene que encontrar el campo plantado que sólo está en el crudo." : null,
  ].filter(Boolean),
};
const metodologia = {
  version: 1, poblacion, crudo: "el del día del análisis (t0): el perfil de la solicitud o de la operación",
  universo: "por campo, las personas cuya fuente contestó (ok u ok_vacio)", min_grupo: MIN_GRUPO, min_personas_valor: MIN_PERSONAS_VALOR,
  iv: "WoE con suavizado 0,5; quintiles y un tramo para sin dato", prueba: "chi cuadrado por tramos; corrección de Benjamini-Hochberg",
  ajuste: "Mantel-Haenszel dentro de cada recomendación del modelo (sólo condiciones sí/no): parte del log de la razón de momios que sobrevive; el modelo no lo tenía si es la mitad o más y p < 0,05",
  nombrado: "la hoja aparece en supabase/functions/_shared/*.ts (sin el marco ni el pedido al modelo)",
};

const texto = JSON.stringify(resultado);
console.log(`con crudo: ${conCrudo} (${malosConCrudo} malos); condiciones probadas: ${medidas.length}, distintas ${unicas.length}, significativas ${significativas.length}, el modelo no lo tenía ${noLoTenia.length}; campos no nombrados: ${diccionario.filter((d) => !d.nombrado && ["número", "fecha", "texto", "sí/no"].includes(d.tipo)).length}; tamaño ${(texto.length / 1e6).toFixed(2)} MB`);
const linea = (h) => `iv ${h.iv.toFixed(3)} q ${h.q?.toExponential(1)}${h.p_ajustada !== null ? ` p_aj ${h.p_ajustada} OR_aj ${h.razon_de_momios_ajustada}` : ""} ${h.el_modelo ? `${h.el_modelo.toUpperCase()} (${h.parte_no_explicada}) ` : ""}${h.nombrado ? "nombrado" : "NO NOMBRADO"}  ${h.ruta} · ${h.derivacion}${h.categoria ? ` = ${h.categoria}` : ""}${h.tasa_con !== undefined ? `  (con ${h.con}: ${(h.tasa_con * 100).toFixed(1)}% / sin ${(h.tasa_sin * 100).toFixed(1)}%)` : h.auc !== null ? `  (auc ${h.auc})` : ""}`;
for (const [k, h] of hallazgos.slice(0, 10).entries()) console.log(`${String(k + 1).padStart(2)}. ${linea(h)}`);
// Lo que más importa: significativo, el modelo no lo tenía y la estructura no lo lee.
const noVistos = hallazgos.filter((h) => h.significativa && h.el_modelo === "no_lo_tenia" && !h.nombrado);
console.log(`significativos que el modelo no tenía y la estructura no lee: ${noVistos.length}`);
for (const [k, h] of noVistos.slice(0, 10).entries()) console.log(`  ${String(k + 1).padStart(2)}. ${linea(h)}`);
const BUSCAR = arg("buscar", null);
if (BUSCAR) {
  for (const [k, h] of hallazgos.entries()) {
    if (!h.ruta.toLowerCase().includes(BUSCAR.toLowerCase())) continue;
    const entreNoVistos = noVistos.indexOf(h);
    console.log(`puesto ${k + 1}${entreNoVistos >= 0 ? ` (${entreNoVistos + 1}.º de lo no visto)` : ""}: ${linea(h)}`);
  }
}
if (SECO) process.exit(0);

await rest("lab_resultados", {
  method: "POST", headers: { Prefer: "return=minimal" },
  body: JSON.stringify({ corte_id: CORTE, tipo: "crudo", metodologia, resultado, n: conCrudo, n_malos: malosConCrudo }),
});
console.log("guardado en lab_resultados (tipo crudo)");
