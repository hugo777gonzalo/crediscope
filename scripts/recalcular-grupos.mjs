// Recalcula GRUPOS ENTEROS del perfil guardado desde el crudo local, sin
// volver a consultar Novadata. Nació con estructura-v8 (2026-09-27), que
// corrigió cómo se leen el buró, las cooperativas, las demandas y las
// pensiones: esos cuatro grupos se derivan enteros del crudo.
//
// Mismas protecciones que recalcular-fuentes-ingreso.mjs:
//   - sólo el ÚLTIMO perfil de cada cliente, y sólo si el crudo es de ese
//     perfil (perfilId);
//   - se arma con el reloj en la fecha de captura (process.ts mide contra
//     hoy) y se compara con las claves ordenadas (jsonb las reordena);
//   - si el perfil rearmado difiere en algo fuera de los grupos pedidos
//     (salvo las edades, por la zona horaria, y las marcas de recálculos
//     anteriores), el crudo no reproduce ese perfil y la fila NO se toca.
// Del perfil guardado sólo se reemplazan los grupos pedidos; el resto
// queda byte a byte. structure_version pasa a la versión actual.
//
// --ignorar=grupo: sus diferencias se toleran pero no se escriben, porque
// lo recalcula otro script. Nació con estructura-v9 y fuentes-v9, que
// cambiaron juntas: cada script exige que el resto del perfil coincida, y
// sin esto se bloqueaban entre sí. Se corre éste primero (con
// --ignorar=fuentesIngreso) y después recalcular-fuentes-ingreso.mjs.
//
// --bloqueo: recalcula también client_profiles.control_bloqueo (estructura-v9
// cambió quién queda bloqueado por delitos de seguridad ciudadana). Todo
// hallazgo que no sea ese tiene que salir idéntico al guardado; si no, la
// fila entera no se toca.
//
// Uso:  node scripts/recalcular-grupos.mjs --grupos=a,b,c [--ignorar=d] [--bloqueo] [--forzar] [--seco] [--carpeta=research/novadata-raw-2026-09-25]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const SECO = process.argv.includes("--seco");
const BLOQUEO = process.argv.includes("--bloqueo");
// --forzar: rearma también los que ya están en la versión actual. Para una
// corrección dentro de la misma versión (estructura-v11: la limpieza de los
// tipos de demanda no veía un artículo entre paréntesis).
const FORZAR = process.argv.includes("--forzar");
const GRUPOS = (process.argv.find((a) => a.startsWith("--grupos="))?.slice(9) ?? "").split(",").filter(Boolean);
const IGNORAR = (process.argv.find((a) => a.startsWith("--ignorar="))?.slice(10) ?? "").split(",").filter(Boolean);
const CARPETA = path.join(RAIZ, process.argv.find((a) => a.startsWith("--carpeta="))?.slice(10) ?? "research/novadata-raw-2026-09-25");
if (GRUPOS.length === 0) throw new Error("Falta --grupos=grupo1,grupo2");

const { buildStandardProfile, PROCESS_VERSION } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/process.ts")).href);
const { evaluarControlesBloqueo } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/controles-bloqueo.ts")).href);
// El hallazgo que estructura-v9 puede cambiar. Cualquier otro tiene que
// reproducirse igual.
const HALLAZGO_QUE_CAMBIA = "delito_seguridad_ciudadana";

// Los secretos se leen del archivo y no se imprimen.
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const cabeceras = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };
// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function pedir(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, headers: { ...cabeceras, ...opciones.headers } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
  return { cuerpo: texto ? JSON.parse(texto) : null, rango: r.headers.get("content-range") };
}

// El último perfil de cada cliente, paginando hasta el conteo.
const ultimoPorCliente = new Map();
{
  let total = null;
  for (let desde = 0; total === null || desde < total; desde += 1000) {
    const { cuerpo, rango } = await pedir(
      `${env.SUPABASE_URL}/rest/v1/client_profiles?select=id,client_id,created_at&order=id&limit=1000&offset=${desde}`,
      { headers: { Prefer: "count=exact" } },
    );
    if (total === null) total = Number(rango?.split("/")[1] ?? cuerpo.length);
    for (const p of cuerpo) {
      const a = ultimoPorCliente.get(p.client_id);
      if (!a || p.created_at > a.created_at) ultimoPorCliente.set(p.client_id, p);
    }
    if (cuerpo.length === 0) break;
  }
}
const ultimosIds = new Set([...ultimoPorCliente.values()].map((p) => p.id));
const candidatos = [];
for (const a of fs.readdirSync(CARPETA).filter((x) => x.endsWith(".json"))) {
  const archivo = path.join(CARPETA, a);
  const perfilId = /"perfilId"\s*:\s*"([^"]+)"/.exec(fs.readFileSync(archivo, "utf8").slice(0, 400))?.[1];
  if (perfilId && ultimosIds.has(perfilId)) candidatos.push({ archivo, perfilId });
}

function armarEnFecha(instante, fn) {
  const DateReal = globalThis.Date;
  const fijo = new DateReal(instante).getTime();
  class DateFijo extends DateReal {
    constructor(...args) { super(...(args.length ? args : [fijo])); }
    static now() { return fijo; }
  }
  globalThis.Date = DateFijo;
  try { return fn(); } finally { globalThis.Date = DateReal; }
}
const canonico = (v) =>
  JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));
function rutasDistintas(a, b, ruta = "", salida = []) {
  if (canonico(a) === canonico(b)) return salida;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) rutasDistintas(a[k], b[k], `${ruta}.${k}`, salida);
  } else salida.push(ruta);
  return salida;
}
// Lo que puede diferir sin que el crudo deje de ser de ese perfil: los
// grupos que se reemplazan, la fecha de consulta, las edades (el servidor
// las calcula en UTC) y las marcas de recálculos y correcciones anteriores.
const ESPERADAS = [
  ...GRUPOS.map((g) => `.${g}`),
  ...IGNORAR.map((g) => `.${g}`),
  ".consultadoEn", ".identidad.edad", ".identidad.edadConyuge", ".identidad.añosCasado",
  ".fuentesIngreso.detalle.recalculo", ".fuentesIngreso.correccion", ".laboral.correccionEmpleoActual",
];
const sinElQueCambia = (b) => canonico((b?.hallazgos ?? []).filter((h) => h.code !== HALLAZGO_QUE_CAMBIA));
const cambiosDeBloqueo = { desbloqueados: [], bloqueados: [], otroMotivo: 0, sinBloqueoGuardado: 0 };
const mesMenos = (m) => { const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 2; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };

const escrituras = [];
const noReproducen = [];
let yaEnVersion = 0;
for (let i = 0; i < candidatos.length; i += 50) {
  const lote = candidatos.slice(i, i + 50);
  const { cuerpo: filas } = await pedir(
    `${env.SUPABASE_URL}/rest/v1/client_profiles?id=in.(${lote.map((c) => c.perfilId).join(",")})&select=id,structure_version,standard_profile,control_bloqueo`,
  );
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const { archivo, perfilId } of lote) {
    const fila = porId.get(perfilId);
    const guardado = fila?.standard_profile;
    if (!guardado) continue;
    if (fila.structure_version === PROCESS_VERSION && !FORZAR) { yaEnVersion++; continue; }
    const { cedula, capturadoEl, raw } = JSON.parse(fs.readFileSync(archivo, "utf8"));
    const f = guardado.fuentesIngreso;
    const corte = f?.corteIessUsado ? (f.corteDesactualizado ? mesMenos(f.corteIessUsado) : f.corteIessUsado) : undefined;
    const nuevo = armarEnFecha(capturadoEl, () => buildStandardProfile(raw, cedula, corte).profile);
    const otras = rutasDistintas(guardado, nuevo).filter((r) => !ESPERADAS.some((e) => r === e || r.startsWith(`${e}.`)));
    if (otras.length) { noReproducen.push(`${cedula}: ${otras.slice(0, 3).join(", ")}`); continue; }
    const perfil = { ...guardado };
    for (const g of GRUPOS) perfil[g] = nuevo[g];
    const escritura = { id: perfilId, standard_profile: perfil };
    if (BLOQUEO) {
      const anterior = fila.control_bloqueo;
      const bloqueo = evaluarControlesBloqueo(raw, cedula);
      if (!anterior) cambiosDeBloqueo.sinBloqueoGuardado++;
      else if (sinElQueCambia(anterior) !== sinElQueCambia(bloqueo)) {
        cambiosDeBloqueo.otroMotivo++;
        noReproducen.push(`${cedula}: control_bloqueo difiere en otro hallazgo`);
        continue;
      }
      if (anterior?.bloqueado && !bloqueo.bloqueado) cambiosDeBloqueo.desbloqueados.push(cedula);
      if (anterior && !anterior.bloqueado && bloqueo.bloqueado) cambiosDeBloqueo.bloqueados.push(cedula);
      escritura.control_bloqueo = bloqueo;
    }
    escrituras.push(escritura);
  }
}
console.log(`candidatos: ${candidatos.length} | a escribir: ${escrituras.length} | ya en ${PROCESS_VERSION}: ${yaEnVersion} | el crudo no reproduce el perfil: ${noReproducen.length}`);
if (noReproducen.length) console.log("no reproducen (no se tocan):", noReproducen.slice(0, 10));
if (BLOQUEO) {
  console.log(`bloqueo: se desbloquean ${cambiosDeBloqueo.desbloqueados.length} · se bloquean ${cambiosDeBloqueo.bloqueados.length} · difieren en otro hallazgo ${cambiosDeBloqueo.otroMotivo} · sin bloqueo guardado ${cambiosDeBloqueo.sinBloqueoGuardado}`);
  // Las cédulas quedan en un archivo local (research/ está fuera del
  // repositorio): son las personas cuyos análisis guardados salieron con
  // un bloqueo que ya no aplica.
  const salida = path.join(RAIZ, "research", `cambios-de-bloqueo-${PROCESS_VERSION}.json`);
  fs.writeFileSync(salida, JSON.stringify(cambiosDeBloqueo, null, 1));
  console.log(`detalle en ${path.relative(RAIZ, salida)}`);
}
if (SECO) process.exit(0);

// 0 filas devueltas no es un error para PostgREST: se cuenta.
let escritas = 0, siguiente = 0;
const fallas = [];
async function trabajador() {
  while (siguiente < escrituras.length) {
    const e = escrituras[siguiente++];
    try {
      const { cuerpo } = await pedir(`${env.SUPABASE_URL}/rest/v1/client_profiles?id=eq.${e.id}&select=id`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          standard_profile: e.standard_profile,
          structure_version: PROCESS_VERSION,
          ...(e.control_bloqueo ? { control_bloqueo: e.control_bloqueo } : {}),
        }),
      });
      escritas += cuerpo.length;
    } catch (err) {
      fallas.push(`${e.id}: ${err.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, trabajador));
console.log(`escritas: ${escritas} de ${escrituras.length}${escritas === escrituras.length ? "" : "  <-- NO COINCIDE"}`);
if (fallas.length) console.log("fallas:", fallas.slice(0, 10));
