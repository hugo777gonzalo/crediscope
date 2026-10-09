// Detectores de casos atípicos: la lista de análisis que el negocio tiene que
// mirar, para no revisar los 205 uno por uno (docs/observaciones-del-negocio.md).
//
// Cruza tres cosas que ya están guardadas: lo que escribió el modelo
// (positivos, negativos, faltantes, resumen), lo que leyó
// (analysis_results.mensaje_al_modelo) y el crudo de Novadata del día del
// análisis (la fecha de las demandas sólo está ahí). No llama al modelo: no
// cuesta. Cada observación del negocio que se repite se vuelve un detector.
//
// Población (decisión del negocio del 2026-10-07): el último análisis de cada
// persona si es de marco-v28, más los perfiles bloqueados que no lo tienen
// (sólo para los detectores de bloqueos). La de la Bandeja mezcla marcos.
//
// Los detectores de texto buscan frases y tienen falsos positivos: van
// marcados "a confirmar", aparte de los exactos. Un detector que necesita el
// crudo y no lo encuentra cuenta como "no medido", no como "no marca".
//
// La salida lleva cédulas y montos: va a research/ (fuera del repositorio).
// En la consola sólo se imprimen conteos.
//
// Lo que no pasa por lint ni build se rompe en silencio: después de tocarlo,
// correrlo con --limite=20 y abrir el Excel antes de confiar en los conteos.
//
// Uso: node scripts/detectar-atipicos.mjs [--anios=2] [--capacidad=5000]
//        [--salida=research/atipicos-AAAA-MM-DD.xlsx] [--limite=N]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";
import * as XLSX from "xlsx";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const MARCO = "marco-v28";
// Una demanda es vieja desde los 2 años: como el buró, que mira los últimos
// 2 o 3 (decisión del negocio del 2026-10-07).
const ANIOS_DEMANDA_VIEJA = Number(arg("anios", "2"));
// Deuda propia al día desde la que "otra entidad ya evaluó su capacidad"
// merece mirarse. Es un punto de partida, no una regla del negocio.
const DEUDA_CAPACIDAD = Number(arg("capacidad", "5000"));
const LIMITE = Number(arg("limite", "0")) || Infinity;
const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10); // Ecuador, UTC-5
const SALIDA = path.resolve(RAIZ, arg("salida", `research/atipicos-${HOY}.xlsx`));
const ANIO = 365.25 * 86_400_000;

const { categoriaDeDemanda, CATEGORIA_COBRO } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/demandas.ts")).href);
const { ETIQUETA_ESTADO } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/nombres-ingresos.ts")).href);

const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const auth = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function rest(ruta, opciones = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, { ...opciones, headers: { ...auth, "content-type": "application/json", ...opciones.headers } });
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
const enTrozos = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
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
const CARPETAS = fs.readdirSync(path.join(RAIZ, "research"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith("novadata-raw")).map((d) => path.join(RAIZ, "research", d.name));
// Un respaldo local sirve sólo si es el crudo de ESE perfil: el perfilId está
// al principio del archivo y se lee eso antes de parsear 150 KB.
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

// ------------------------------------------------------------- población
const bandeja = (await traerTodas(`bandeja_solicitudes?select=client_id,cedula,perfil_id,analisis_id,rules_version,tiene_bloqueante&or=(rules_version.eq.${MARCO},tiene_bloqueante.is.true)&order=client_id.asc`))
  .slice(0, LIMITE);

const analisisPorId = new Map();
const idsAnalisis = bandeja.filter((b) => b.rules_version === MARCO && b.analisis_id).map((b) => b.analisis_id);
for (const trozo of enTrozos(idsAnalisis, 50)) {
  const { datos } = await rest(`analysis_results?select=id,client_profile_id,created_at,crediscope_score,recomendacion,veredicto_origen,indicador_riesgo,indicador_historial,positives,negatives,missing_info,narrative_summary,mensaje_al_modelo&id=in.(${trozo.join(",")})`);
  for (const a of datos) analisisPorId.set(a.id, a);
}

const casos = bandeja.map((b) => {
  const a = b.rules_version === MARCO ? analisisPorId.get(b.analisis_id) : null;
  const m = a?.mensaje_al_modelo;
  const msg = typeof m === "string" ? JSON.parse(m) : m;
  const pm = typeof msg?.perfilDelModelo === "string" ? JSON.parse(msg.perfilDelModelo) : msg?.perfilDelModelo ?? null;
  return {
    cedula: b.cedula,
    analisisId: a?.id ?? null,
    // El análisis se hizo sobre un perfil que puede no ser el último.
    perfilId: a?.client_profile_id ?? b.perfil_id,
    rec: a ? a.recomendacion : null,
    origen: a ? a.veredicto_origen : "sin_analisis_v28",
    score: a?.crediscope_score ?? null,
    riesgo: a?.indicador_riesgo ?? null,
    historial: a?.indicador_historial ?? null,
    fecha: a?.created_at ?? null,
    bloqueado: Boolean(b.tiene_bloqueante),
    pm,
    textos: a ? {
      positivos: a.positives ?? [],
      negativos: a.negatives ?? [],
      faltantes: a.missing_info ?? [],
      resumen: a.narrative_summary ?? "",
    } : null,
    raw: null,
    perfil: null,
  };
});

const perfiles = new Map();
for (const trozo of enTrozos([...new Set(casos.map((c) => c.perfilId).filter(Boolean))], 100)) {
  const { datos } = await rest(`client_profiles?select=id,created_at,crudo_ruta,control_bloqueo&id=in.(${trozo.join(",")})`);
  for (const d of datos) perfiles.set(d.id, d);
}
let crudosBajados = 0, crudosLocales = 0;
await enParalelo(casos, 8, async (c) => {
  c.perfil = perfiles.get(c.perfilId) ?? null;
  c.fecha ??= c.perfil?.created_at ?? null;
  if (c.perfil?.crudo_ruta) {
    try { c.raw = (await bajarObjeto("crudo-novadata", c.perfil.crudo_ruta)).raw ?? null; crudosBajados++; } catch { /* cae al respaldo local */ }
  }
  if (!c.raw && c.perfilId) { c.raw = crudoLocal(c.cedula, c.perfilId); if (c.raw) crudosLocales++; }
});

// ---------------------------------------------------------- utilidades
const CAL_ATRASO = new Set(["B1", "B2", "C1", "C2", "D", "E"]);
const n = (x) => Number(x) || 0;
const plata = (x) => `$${Math.round(n(x)).toLocaleString("es-EC")}`;
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const NO_MEDIDO = Symbol("no medido");
const recorte = (s, largo = 140) => (String(s).length > largo ? `${String(s).slice(0, largo)}…` : String(s));

function demandasComoDemandado(raw) {
  return (raw?.demandas?.data?.demandas ?? [])
    .filter((d) => d.tipoDemanda?.descripcion === "DEMANDADO" && Number.isFinite(Number(d.demanda?.fecha)))
    .map((d) => ({ fecha: Number(d.demanda.fecha), cobro: categoriaDeDemanda(d.demanda?.delito, d.demanda?.ofendido) === CATEGORIA_COBRO }));
}
// ¿Tiene alguna demanda de los últimos N años? null si no se puede saber.
function demandaReciente(c) {
  if (!c.raw) return c.pm?.riesgoJudicialCrediticio?.numeroDemandasComoDemandado === 0 && c.pm?.riesgoJudicialCivil?.numeroDemandasComoDemandado === 0 ? false : null;
  const dia = Date.parse(c.fecha);
  return demandasComoDemandado(c.raw).some((d) => (dia - d.fecha) / ANIO < ANIOS_DEMANDA_VIEJA);
}
function operacionesBuro(raw) {
  return [...(raw?.buroCreditoSuper?.data?.datosSuper ?? []), ...(raw?.buroCreditoDiners?.data?.datosSuper ?? [])]
    .filter((o) => o.riesgo !== "G" && o.riesgo !== "C");
}
const atrasoBuro = (o) => (n(o.saldomora) || n(o.mora)) + n(o.noDevengaInteres) + n(o.judicial) + n(o.castigo);
const ingresoConfirmado = (pm) => pm?.fuentesIngreso?.estado === ETIQUETA_ESTADO.confirmada;

// Lo que hay en contra en el perfil del modelo, sin el ingreso. Vacío = nada.
function enContra(pm) {
  const cb = pm.comportamientoBancario ?? {}, co = pm.comportamientoCooperativas ?? {}, ci = pm.comportamientoInterno ?? {};
  const motivos = [];
  if (CAL_ATRASO.has(cb.peorCalificacionRiesgo)) motivos.push(`calificación ${cb.peorCalificacionRiesgo}`);
  if (n(cb.deudaEnAtraso) > 0 || n(cb.operacionesEnAtrasoSinMonto) > 0) motivos.push("atraso en bancos");
  if (cb.tieneOperacionCastigada || cb.tieneOperacionConDemanda || co.tieneOperacionCastigada || co.tieneOperacionConDemanda) motivos.push("castigo o demanda en una operación");
  if (cb.figuraEnRegistroDeudores) motivos.push("registro de deudores");
  if (n(cb.valorVencidoRetail) > 0 || n(cb.diasMoraMaximaRetail) > 0) motivos.push("mora en casas comerciales");
  if (n(co.diasMoraMaxima) > 0 || n(co.saldoEnMora) > 0) motivos.push("mora en cooperativas");
  if (n(ci.novadataDiasMoraVigente) > 0) motivos.push("mora con Novadata");
  if (pm.riesgoJudicialCivil?.pensionAlimenticiaEnMora) motivos.push("pensión alimenticia en mora");
  if (pm.riesgoPenal?.tieneAntecedentesPenales || pm.riesgoSeguridadCiudadana?.tieneDelitoSeguridadCiudadana) motivos.push("antecedentes o delitos");
  if (pm.cumplimiento?.enListaControl || pm.cumplimiento?.enListaNegra || pm.cumplimiento?.impedimentoCargosPublicos) motivos.push("listas o impedimento");
  return motivos;
}

// Montos del texto del modelo: "$1.234,56", "$285.305", "USD 2.222".
function montosDelTexto(texto) {
  const montos = [];
  const t = String(texto);
  for (const m of t.matchAll(/(?:\$|USD\s?)\s?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(\s?mil\b)?/gi)) {
    // "$116 mil" es 116.000: sin esto se leía $116 y marcaba de más.
    const valor = Number(m[1].replace(/\./g, "").replace(",", ".")) * (m[2] ? 1000 : 1);
    // "supera los $16.000", "ronda los $58.000": el modelo redondea a
    // propósito y el monto exacto no va a aparecer.
    const aproximado = Boolean(m[2]) || /(supera|superan|ronda|unos|unas|cerca de|cercan[oa] a|casi|m[aá]s de|aproximad\w*|alrededor de|del orden de)\s+(los\s+|las\s+|de\s+)?$/i.test(t.slice(Math.max(0, m.index - 30), m.index));
    if (valor >= 10) montos.push({ valor, aproximado, fragmento: t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20) });
  }
  return montos;
}
function numerosDelPerfil(pm) {
  const numeros = [];
  const recorrer = (v) => {
    if (typeof v === "number" && Math.abs(v) >= 1) numeros.push(v);
    // Los textos del perfil también traen montos ("aportó sobre $482").
    else if (typeof v === "string") {
      for (const m of v.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g)) numeros.push(Number(m[0].replace(/\./g, "").replace(",", ".")));
    }
    else if (Array.isArray(v)) v.forEach(recorrer);
    else if (v && typeof v === "object") Object.values(v).forEach(recorrer);
  };
  recorrer(pm);
  return [...new Set(numeros)];
}
// El modelo redondea y suma (deuda de bancos + cooperativas): un monto está
// en el perfil si coincide con un número o con la suma de dos.
function estaEnElPerfil({ valor, aproximado }, numeros) {
  const cerca = (v) => Math.abs(valor - v) <= Math.max(1, Math.abs(v) * (aproximado ? 0.1 : 0.005));
  if (numeros.some(cerca)) return true;
  for (let i = 0; i < numeros.length; i++) for (let j = i + 1; j < numeros.length; j++) if (cerca(numeros[i] + numeros[j])) return true;
  return false;
}

// ------------------------------------------------------------ detectores
// poblacion: "analizados" (con análisis v28 del modelo) o "bloqueados".
// Cada uno devuelve null (no marca), NO_MEDIDO o el detalle concreto.
const delModelo = (c) => c.analisisId && c.origen === "modelo" && c.pm;

const conScore = casos.filter((c) => c.origen === "modelo" && c.score != null);
const menorAprobar = Math.min(...conScore.filter((c) => c.rec === "aprobar").map((c) => c.score));
const mayorRevisar = Math.max(...conScore.filter((c) => c.rec === "revisar").map((c) => c.score));

const DETECTORES = [
  {
    clave: "revisar_sin_riesgo", familia: "A. Coherencia del análisis", tipo: "exacto", poblacion: "analizados",
    nombre: "Revisar sin riesgo",
    marca: "Revisar con riesgo bajo o muy bajo e historial bueno o excelente, según el propio modelo",
    detectar: (c) => delModelo(c) && c.rec === "revisar" && ["bajo", "muy bajo"].includes(c.riesgo) && ["bueno", "excelente"].includes(c.historial)
      ? `riesgo ${c.riesgo}, historial ${c.historial}, score ${c.score}` : null,
  },
  {
    clave: "score_fuera", familia: "A. Coherencia del análisis", tipo: "exacto", poblacion: "analizados",
    nombre: "Score fuera de su recomendación",
    marca: "Revisar con un score igual o mayor que el menor aprobar, o aprobar con uno igual o menor que el mayor revisar",
    detectar: (c) => {
      if (!delModelo(c)) return null;
      if (c.rec === "revisar" && c.score >= menorAprobar) return `revisar con ${c.score}; el menor aprobar es ${menorAprobar}`;
      if (c.rec === "aprobar" && c.score <= mayorRevisar) return `aprobar con ${c.score}; el mayor revisar es ${mayorRevisar}`;
      return null;
    },
  },
  {
    clave: "positivo_contradice", familia: "B. Texto contra dato", tipo: "a confirmar", poblacion: "analizados",
    nombre: "Positivo que contradice el dato",
    marca: "Un positivo dice 'sin atraso', 'al día' o 'sin mora' y el perfil trae calificación B1-E o mora en esa misma fuente",
    detectar: (c) => {
      if (!delModelo(c)) return null;
      const cb = c.pm.comportamientoBancario ?? {}, co = c.pm.comportamientoCooperativas ?? {}, ci = c.pm.comportamientoInterno ?? {};
      const fuentes = [
        { patron: /BANC|BURO|CALIFICACI/, malo: CAL_ATRASO.has(cb.peorCalificacionRiesgo) || n(cb.deudaEnAtraso) > 0 || n(cb.operacionesEnAtrasoSinMonto) > 0, dato: `peor calificación ${cb.peorCalificacionRiesgo}, deuda en atraso ${plata(cb.deudaEnAtraso)}` },
        { patron: /COOPERATIV/, malo: n(co.diasMoraMaxima) > 0 || n(co.saldoEnMora) > 0, dato: `cooperativas: ${n(co.diasMoraMaxima)} días de mora, ${plata(co.saldoEnMora)} en mora` },
        { patron: /CASAS? COMERCIAL|RETAIL/, malo: n(cb.valorVencidoRetail) > 0 || n(cb.diasMoraMaximaRetail) > 0, dato: `casas comerciales: ${plata(cb.valorVencidoRetail)} vencido, ${n(cb.diasMoraMaximaRetail)} días` },
        { patron: /NOVADATA|INTERNO/, malo: n(ci.novadataDiasMoraVigente) > 0, dato: `Novadata: ${n(ci.novadataDiasMoraVigente)} días de mora vigente` },
        // Sin esta fuente, "préstamos del BIESS sin días de mora" no nombraba
        // ninguna y se comparaba contra todas (contra la mora en casas
        // comerciales, en la primera prueba).
        { patron: /IESS|BIESS/, malo: n(cb.diasMoraCreditoIessBiess) > 0, dato: `IESS/BIESS: ${n(cb.diasMoraCreditoIessBiess)} días de mora` },
      ];
      const AFIRMA = /SIN (NINGUN |NINGUNA )?(ATRASO|MORA|SALDO VENCIDO|DEUDA EN ATRASO|VENCID|DIAS DE MORA)|AL DIA|NO REGISTRA (ATRASO|MORA)|NINGUNA VENCIDA/;
      const choques = [];
      for (const p of c.textos.positivos) {
        const t = norm(p);
        if (!AFIRMA.test(t)) continue;
        const nombradas = fuentes.filter((f) => f.patron.test(t));
        for (const f of (nombradas.length ? nombradas : fuentes)) if (f.malo) choques.push(`"${recorte(p, 110)}" · ${f.dato}`);
      }
      return choques.length ? choques.join(" | ") : null;
    },
  },
  {
    clave: "monto_fuera_del_perfil", familia: "B. Texto contra dato", tipo: "a confirmar", poblacion: "analizados",
    nombre: "Monto que no está en el perfil",
    marca: "Un monto escrito por el modelo que no coincide con ningún número de lo que leyó (ni con la suma de dos)",
    detectar: (c) => {
      if (!delModelo(c)) return null;
      const numeros = numerosDelPerfil(c.pm);
      const todos = [...c.textos.positivos, ...c.textos.negativos, ...c.textos.faltantes, c.textos.resumen].flatMap(montosDelTexto);
      const fuera = todos.filter((m) => !estaEnElPerfil(m, numeros));
      const unicos = [...new Map(fuera.map((m) => [m.valor, m])).values()];
      return unicos.length ? unicos.map((m) => `${plata(m.valor)} en "…${recorte(m.fragmento.trim(), 80)}"`).join(" | ") : null;
    },
  },
  {
    clave: "demanda_vieja_pesa", familia: "C. Reglas que el marco no tiene", tipo: "exacto", poblacion: "analizados",
    nombre: `Demanda de más de ${ANIOS_DEMANDA_VIEJA} años que pesa`,
    marca: `Revisar o negar, todas sus demandas tienen más de ${ANIOS_DEMANDA_VIEJA} años y el modelo las nombra`,
    detectar: (c) => {
      if (!delModelo(c) || !["revisar", "negar"].includes(c.rec)) return null;
      if (!c.raw) return n(c.pm.riesgoJudicialCrediticio?.numeroDemandasComoDemandado) + n(c.pm.riesgoJudicialCivil?.numeroDemandasComoDemandado) > 0 ? NO_MEDIDO : null;
      const demandas = demandasComoDemandado(c.raw);
      if (!demandas.length) return null;
      const dia = Date.parse(c.fecha);
      const masReciente = Math.max(...demandas.map((d) => d.fecha));
      const anios = (dia - masReciente) / ANIO;
      if (anios < ANIOS_DEMANDA_VIEJA) return null;
      const donde = [
        c.textos.negativos.some((t) => /demand|juicio|judicial/i.test(t)) && "negativos",
        /demand|juicio|judicial/i.test(c.textos.resumen) && "resumen",
        c.textos.faltantes.some((t) => /demand|juicio|judicial/i.test(t)) && "faltantes",
      ].filter(Boolean);
      if (!donde.length) return null;
      const cobro = demandas.filter((d) => d.cobro).length;
      return `${demandas.length} demanda(s) (${cobro} de cobro), la más reciente de ${new Date(masReciente).getFullYear()} (${anios.toFixed(1)} años); la nombra en ${donde.join(", ")}`;
    },
  },
  {
    clave: "solo_ingreso", familia: "C. Reglas que el marco no tiene", tipo: "exacto", poblacion: "analizados",
    nombre: "Revisar sólo por el ingreso",
    marca: `Revisar sin nada en contra (mora, calificación B1-E, demandas de los últimos ${ANIOS_DEMANDA_VIEJA} años, listas, pensiones) salvo un ingreso no confirmado`,
    detectar: (c) => {
      if (!delModelo(c) || c.rec !== "revisar" || ingresoConfirmado(c.pm)) return null;
      if (enContra(c.pm).length) return null;
      const reciente = demandaReciente(c);
      if (reciente === null) return NO_MEDIDO;
      if (reciente) return null;
      const f = c.pm.fuentesIngreso ?? {};
      return `ingreso ${f.estado ?? "sin dato"}, segmento ${f.segmento ?? "sin dato"}, perfil ${f.perfilLaboral?.tipo ?? "sin dato"}`;
    },
  },
  {
    clave: "capacidad_probada", familia: "C. Reglas que el marco no tiene", tipo: "exacto", poblacion: "analizados",
    nombre: "Capacidad ya probada por otra entidad",
    marca: `Revisar con ingreso no confirmado y deuda propia de ${plata(DEUDA_CAPACIDAD)} o más, toda al día`,
    detectar: (c) => {
      if (!delModelo(c) || c.rec !== "revisar" || ingresoConfirmado(c.pm)) return null;
      const e = c.pm.endeudamiento ?? {}, cb = c.pm.comportamientoBancario ?? {}, co = c.pm.comportamientoCooperativas ?? {};
      if (n(e.deudaPropiaTotal) < DEUDA_CAPACIDAD || n(e.deudaEnAtrasoTotal) > 0) return null;
      if (CAL_ATRASO.has(cb.peorCalificacionRiesgo) || n(co.diasMoraMaxima) > 0 || n(cb.valorVencidoRetail) > 0) return null;
      return `deuda propia ${plata(e.deudaPropiaTotal)} al día (bancos ${plata(e.deudaPropiaBancos)}, cooperativas ${plata(e.deudaPropiaCooperativas)}), cuota conocida ${plata(e.cuotaMensualConocida)}/mes; ingreso ${c.pm.fuentesIngreso?.estado ?? "sin dato"}`;
    },
  },
  {
    clave: "ofac_sin_cedula", familia: "D. Bloqueos dudosos", tipo: "exacto", poblacion: "bloqueados",
    nombre: "OFAC sin cédula",
    marca: "Registros OFAC que no traen su cédula: la coincidencia es por nombre, como un homónimo",
    detectar: (c) => {
      if (!c.bloqueado) return null;
      if (!c.raw) return NO_MEDIDO;
      const registros = [...(c.raw.listasControl?.data?.ofacsOpr ?? []), ...(c.raw.basesInternas?.data?.tofac ?? []), ...(c.raw.basesInternas?.data?.tofac2 ?? [])];
      if (!registros.length) return null;
      const conCedula = registros.filter((r) => JSON.stringify(r).includes(c.cedula)).length;
      return conCedula ? null : `${registros.length} registro(s) OFAC, ninguno con su cédula`;
    },
  },
  {
    clave: "lista_negra_comportamiento", familia: "D. Bloqueos dudosos", tipo: "exacto", poblacion: "bloqueados",
    nombre: "Lista negra por mal pagador",
    marca: "La lista negra de Novadata dice 'Mal Pagador': es mora con su financiera (Novacredit), no cumplimiento",
    detectar: (c) => {
      if (!c.bloqueado) return null;
      if (!c.raw) return NO_MEDIDO;
      const l = c.raw.listaNegra?.data?.listaNegra;
      if (!l) return null;
      const obs = norm(l.obsercaciones);
      if (!obs.startsWith("MAL PAGADOR")) return null;
      // Las observaciones traen teléfonos y nombres de gestores: sólo la etapa.
      const etapa = /PAGO - ABONO|ABONO/.test(obs) ? "con pagos o abonos" : /PRE-?JUDICIAL/.test(obs) ? "prejudicial" : /EXTRAJUDICIAL/.test(obs) ? "extrajudicial" : /JUDICIAL/.test(obs) ? "judicial" : "sin etapa";
      return `mal pagador, etapa ${etapa}, registrado el ${l.fechaAnalisis ?? "sin fecha"}`;
    },
  },
  {
    clave: "providencia_certificacion", familia: "D. Bloqueos dudosos", tipo: "a confirmar", poblacion: "bloqueados",
    nombre: "Providencia que es sólo certificación",
    marca: "Providencias de Fiscalía que piden información (certificación), no retienen; y si el implicado es la persona",
    detectar: (c) => {
      if (!c.bloqueado) return null;
      if (!c.raw) return NO_MEDIDO;
      // Las dos listas traen las mismas providencias y sólo la primera trae el
      // implicado: se usa la segunda cuando la primera no está.
      const opr = c.raw.listasControl?.data?.providenciasOpr ?? [];
      const provs = opr.length ? opr : c.raw.basesInternas?.data?.tprovidencias ?? [];
      if (!provs.length) return null;
      const p0 = c.raw.general?.data?.personaNatural ?? {};
      const apellido = norm(p0.apellidoUno), nombre = norm(p0.nombreUno);
      const certificaciones = provs.filter((p) => norm(p.notificacion).startsWith("CERTIFICACI"));
      if (certificaciones.length !== provs.length) return null;
      return certificaciones.map((p) => {
        const implicados = norm(p.implicados);
        const es = !implicados ? "sin implicado" : apellido && nombre && implicados.includes(apellido) && implicados.includes(nombre) ? "el implicado coincide con su nombre" : "el implicado es otra persona";
        return `${p.tipoJuicio ?? "sin tipo"} (${p.fecha ?? "sin fecha"}), ${es}`;
      }).join(" | ");
    },
  },
  {
    clave: "calificacion_sin_monto", familia: "E. Datos raros del perfil", tipo: "exacto", poblacion: "analizados",
    nombre: "Calificación B1-E sin monto en atraso",
    marca: "Peor calificación B1-E y nada en atraso: el perfil no le avisa al modelo que eso choca",
    detectar: (c) => {
      if (!c.pm) return null;
      const cb = c.pm.comportamientoBancario ?? {};
      if (!CAL_ATRASO.has(cb.peorCalificacionRiesgo) || n(cb.deudaEnAtraso) > 0) return null;
      const ops = c.raw ? operacionesBuro(c.raw).filter((o) => CAL_ATRASO.has(String(o.calificacion)) && atrasoBuro(o) === 0) : [];
      return `peor ${cb.peorCalificacionRiesgo}, deuda en atraso $0${c.raw ? `; ${ops.length} operación(es) B1-E con todo por vencer` : ""}`;
    },
  },
  {
    clave: "deuda_interna_duplicada", familia: "E. Datos raros del perfil", tipo: "a confirmar", poblacion: "analizados",
    nombre: "Saldo con Novadata igual a otra deuda",
    marca: "El saldo vigente con Novadata coincide (±2%) con una operación de banco o cooperativa: puede ser la misma deuda",
    detectar: (c) => {
      if (!c.pm) return null;
      const interno = n(c.pm.comportamientoInterno?.novadataSaldoCapitalVigente);
      if (interno <= 0) return null;
      if (!c.raw) return NO_MEDIDO;
      const cerca = (v) => v > 0 && Math.abs(v - interno) <= interno * 0.02;
      const iguales = [
        ...operacionesBuro(c.raw).filter((o) => cerca(n(o.saldoVigente) + atrasoBuro(o))).map((o) => `${o.entnombre ?? "banco"} ${plata(n(o.saldoVigente) + atrasoBuro(o))}`),
        ...(c.raw.buroCreditoCoop?.data?.datosSuper ?? []).filter((o) => cerca(n(o.val_saldo_total))).map((o) => `${o.razon_social ?? "cooperativa"} ${plata(o.val_saldo_total)}`),
      ];
      return iguales.length ? `Novadata ${plata(interno)} ≈ ${iguales.join(", ")}` : null;
    },
  },
  {
    clave: "empleo_y_afiliacion_voluntaria", familia: "E. Datos raros del perfil", tipo: "a confirmar", poblacion: "analizados",
    nombre: "Empleo actual y aporte sin RUC",
    marca: "Tiene un empleo actual registrado pero aporta sin RUC activo (como afiliado voluntario)",
    detectar: (c) => {
      if (!c.pm) return null;
      const pl = c.pm.fuentesIngreso?.perfilLaboral ?? {};
      const empleos = c.pm.laboral?.empleosActuales ?? [];
      return pl.aportaSinRucActivo && empleos.length && !pl.trabajaParaUnTercero
        ? `${empleos.length} empleo(s) actual(es) registrados; aporta sin RUC activo; segmento ${c.pm.fuentesIngreso?.segmento ?? "sin dato"}` : null;
    },
  },
];

// ---------------------------------------------------------------- correr
const marcas = new Map(DETECTORES.map((d) => [d.clave, []]));
const noMedidos = new Map(DETECTORES.map((d) => [d.clave, 0]));
for (const c of casos) {
  c.marcas = [];
  for (const d of DETECTORES) {
    if (d.poblacion === "analizados" && !c.analisisId) continue;
    const r = d.detectar(c);
    if (r === NO_MEDIDO) noMedidos.set(d.clave, noMedidos.get(d.clave) + 1);
    else if (r) { marcas.get(d.clave).push({ c, detalle: r }); c.marcas.push(d); }
  }
}

// Bloqueos cuyo único sostén es un motivo dudoso: OFAC sin cédula, lista
// negra por mal pagador o providencias que sólo certifican.
const CODIGOS_DUDOSOS = { lista_control: ["ofac_sin_cedula", "providencia_certificacion"], listas_control_interno: ["ofac_sin_cedula", "providencia_certificacion"], lista_negra: ["lista_negra_comportamiento"] };
const bloqueoDudoso = [];
for (const c of casos.filter((x) => x.bloqueado)) {
  const codigos = (c.perfil?.control_bloqueo?.hallazgos ?? []).filter((h) => h.bloqueante).map((h) => h.code);
  const claves = new Set(c.marcas.map((d) => d.clave));
  if (codigos.length && codigos.every((k) => CODIGOS_DUDOSOS[k]?.some((cl) => claves.has(cl)))) bloqueoDudoso.push({ c, detalle: `motivos: ${codigos.join(", ")}` });
}

// ---------------------------------------------------------------- Excel
const libro = XLSX.utils.book_new();
const hoja = (nombre, filas, anchos) => {
  const h = XLSX.utils.json_to_sheet(filas.length ? filas : [{ "(sin casos)": "" }]);
  if (anchos) h["!cols"] = anchos.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(libro, h, nombre.slice(0, 31));
};
const fecha = (f) => (f ? new Date(Date.parse(f) - 5 * 3600_000).toISOString().slice(0, 10) : "");
const origenLegible = { modelo: "modelo", control_bloqueo: "bloqueo", sin_veredicto: "sin veredicto", sin_analisis_v28: "bloqueado, sin análisis v28" };

hoja("Cómo leer", [
  { Qué: "Población", Detalle: `Último análisis de cada persona con ${MARCO} (${casos.filter((c) => c.analisisId).length}) + bloqueados sin análisis ${MARCO} (${casos.filter((c) => !c.analisisId).length}).` },
  { Qué: "Exacto", Detalle: "Regla sobre datos: si marca, el hecho es cierto. Falta juzgar si importa." },
  { Qué: "A confirmar", Detalle: "Busca frases o coincidencias aproximadas: puede marcar de más. Abrí el caso antes de contarlo." },
  { Qué: "No medido", Detalle: "El detector necesita el crudo de ese día y no se encontró: no es 'no marca'." },
  { Qué: "Demanda vieja", Detalle: `Más de ${ANIOS_DEMANDA_VIEJA} años a la fecha del análisis (--anios).` },
  { Qué: "Capacidad probada", Detalle: `Deuda propia al día desde ${plata(DEUDA_CAPACIDAD)} (--capacidad). Punto de partida, no regla.` },
  { Qué: "Crudo", Detalle: `${crudosBajados} desde Storage, ${crudosLocales} de respaldos locales, ${casos.filter((c) => !c.raw).length} sin crudo.` },
  { Qué: "Generado", Detalle: `${HOY} con scripts/detectar-atipicos.mjs` },
], [18, 110]);

hoja("Resumen", [
  ...DETECTORES.map((d) => ({ Familia: d.familia, Detector: d.nombre, "Qué marca": d.marca, Tipo: d.tipo, Población: d.poblacion, Casos: marcas.get(d.clave).length, "No medidos": noMedidos.get(d.clave) })),
  { Familia: "D. Bloqueos dudosos", Detector: "Bloqueo sólo por motivos dudosos", "Qué marca": "Todos sus motivos de bloqueo son de los detectores de arriba (OFAC sin cédula, mal pagador, certificación)", Tipo: "exacto", Población: "bloqueados", Casos: bloqueoDudoso.length, "No medidos": 0 },
], [28, 40, 80, 12, 12, 8, 11]);

const filaCaso = (c) => ({
  Cédula: c.cedula,
  Recomendación: c.rec ?? "",
  Origen: origenLegible[c.origen] ?? c.origen,
  Score: c.score ?? "",
  Riesgo: c.riesgo ?? "",
  Historial: c.historial ?? "",
  "Perfil laboral": c.pm?.fuentesIngreso?.perfilLaboral?.tipo ?? "",
  Ingreso: c.pm?.fuentesIngreso?.estado ?? "",
});
hoja("Casos", casos.filter((c) => c.marcas.length)
  .sort((a, b) => b.marcas.length - a.marcas.length || (a.score ?? 0) - (b.score ?? 0))
  .map((c) => ({ ...filaCaso(c), Detectores: c.marcas.length, Cuáles: c.marcas.map((d) => d.nombre).join(" · "), "Id del análisis": c.analisisId ?? "", Fecha: fecha(c.fecha) })),
[12, 13, 22, 7, 10, 10, 30, 18, 10, 90, 38, 11]);

for (const d of DETECTORES) {
  hoja(d.nombre, marcas.get(d.clave).map(({ c, detalle }) => ({ ...filaCaso(c), Detalle: detalle, "Id del análisis": c.analisisId ?? "" })),
    [12, 13, 22, 7, 10, 10, 30, 18, 120, 38]);
}
hoja("Bloqueo sólo dudoso", bloqueoDudoso.map(({ c, detalle }) => ({ ...filaCaso(c), Detalle: detalle, Marcas: c.marcas.map((d) => d.nombre).join(" · ") })),
  [12, 13, 22, 7, 10, 10, 30, 18, 60, 60]);

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, XLSX.write(libro, { type: "buffer", bookType: "xlsx" }));

// Consola: sólo conteos.
console.log(`Población: ${casos.filter((c) => c.analisisId).length} con análisis ${MARCO}, ${casos.filter((c) => !c.analisisId).length} bloqueados sin él. Crudo: ${crudosBajados} Storage, ${crudosLocales} local, ${casos.filter((c) => !c.raw).length} sin crudo.`);
for (const d of DETECTORES) console.log(`  ${d.nombre.padEnd(46)} ${String(marcas.get(d.clave).length).padStart(4)}  (no medidos ${noMedidos.get(d.clave)}, ${d.tipo})`);
console.log(`  ${"Bloqueo sólo por motivos dudosos".padEnd(46)} ${String(bloqueoDudoso.length).padStart(4)}`);
console.log(`Casos con al menos un detector: ${casos.filter((c) => c.marcas.length).length}. Excel: ${path.relative(RAIZ, SALIDA)}`);
