// Recalcula la clasificación de ingresos de los perfiles guardados desde el
// crudo local, sin volver a consultar Novadata.
//
// Nació con fuentes-v8 / estructura-v7 (2026-09-26): el aporte bajo el propio
// RUC pasó a ser cuenta propia y la nómina dejó de contar a la propia
// persona. Sirve para cualquier versión nueva de fuentes-ingreso.ts que no
// necesite datos que el crudo no tenga.
//
// QUÉ TOCA Y QUÉ NO
//
// Sólo el ÚLTIMO perfil de cada cliente, y sólo si el crudo es de ESE
// perfil (research/novadata-raw-2026-09-25 guarda el perfilId): un crudo de
// otro día reescribiría el perfil con datos viejos. Del perfil reemplaza
// fuentesIngreso y los cuatro campos de laboral que cambiaron en
// estructura-v7; todo lo demás queda byte a byte como estaba. La columna
// perfil_laboral se recalcula con la misma función que las Edge Functions.
//
// Antes de escribir, arma el perfil entero con el código actual y lo compara
// contra el guardado: si difiere en algo más que lo esperado, el crudo no
// reproduce ese perfil y la fila NO se toca (se informa).
//
// Lo anterior queda en fuentesIngreso.detalle.recalculo (el detalle no va
// al modelo): la pantalla lo dice si cambió la clasificación.
//
// --forzar rehace también los que ya están en la versión actual (una regla
// que cambió sin subir la versión, antes de commitearla) y conserva la nota
// del recálculo anterior, que dice de dónde venían.
//
// Uso:  node scripts/recalcular-fuentes-ingreso.mjs [--seco] [--forzar] [--carpeta=research/novadata-raw-2026-09-25]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const SECO = process.argv.includes("--seco");
const FORZAR = process.argv.includes("--forzar");
const CARPETA = path.join(RAIZ, process.argv.find((a) => a.startsWith("--carpeta="))?.slice(10) ?? "research/novadata-raw-2026-09-25");
const HOY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());

const compartido = (f) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", f)).href);
const { buildStandardProfile } = await compartido("process.ts");
const { clasificarPerfilLaboral } = await compartido("perfil-laboral.ts");
const { FUENTES_INGRESO_VERSION } = await compartido("fuentes-ingreso.ts");

// Los campos de laboral que cambiaron en estructura-v7. Si una versión
// futura cambia otros, se agregan acá.
const CAMPOS_LABORAL = [
  "clienteEsSuPropioEmpleador",
  "empleadorConApellidoDelCliente",
  "numeroEmpleadosRegistrados",
  "esEmpleadorOAdministrador",
  "numeroEstablecimientosActivos",
  "numeroEstablecimientosInactivos",
];

// Los secretos se leen del archivo y no se imprimen.
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.functions");
const cabeceras = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };

// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function pedir(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, headers: { ...cabeceras, ...opciones.headers } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
  return { cuerpo: texto ? JSON.parse(texto) : null, rango: r.headers.get("content-range") };
}

// El último perfil de cada cliente. PostgREST corta en 1.000 filas: se
// pagina hasta el conteo que da la primera página, no hasta una página
// corta (CLAUDE.md).
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
      const actual = ultimoPorCliente.get(p.client_id);
      if (!actual || p.created_at > actual.created_at) ultimoPorCliente.set(p.client_id, p);
    }
    if (cuerpo.length === 0) break;
  }
}
const ultimosIds = new Set([...ultimoPorCliente.values()].map((p) => p.id));

const crudos = fs.readdirSync(CARPETA).filter((a) => a.endsWith(".json")).map((a) => path.join(CARPETA, a));
const candidatos = [];
let sinPerfilId = 0, noEsElUltimo = 0;
for (const archivo of crudos) {
  // Sólo la cabecera: el crudo entero se lee después, de a uno.
  const cabecera = fs.readFileSync(archivo, "utf8").slice(0, 400);
  const perfilId = /"perfilId"\s*:\s*"([^"]+)"/.exec(cabecera)?.[1];
  if (!perfilId) { sinPerfilId++; continue; }
  if (!ultimosIds.has(perfilId)) { noEsElUltimo++; continue; }
  candidatos.push({ archivo, perfilId });
}
console.log(`crudos: ${crudos.length} | del último perfil: ${candidatos.length} | ya no son el último: ${noEsElUltimo} | sin perfilId: ${sinPerfilId}`);

// Lo que se espera que cambie; cualquier otra diferencia es un crudo que no
// reproduce el perfil guardado. Se compara con las claves ordenadas: jsonb
// guarda los objetos con otro orden de claves, y comparando el texto tal
// cual 1.404 perfiles idénticos parecían distintos.
const canonico = (v) =>
  JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));
function rutasDistintas(a, b, ruta = "", salida = []) {
  if (canonico(a) === canonico(b)) return salida;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) rutasDistintas(a[k], b[k], `${ruta}.${k}`, salida);
  } else salida.push(ruta);
  return salida;
}
// Las edades también se toleran: el servidor las calcula en UTC y este
// guion en hora de Ecuador, y 11 cumpleaños caían en esas cinco horas. No
// se escriben: sólo no invalidan el crudo.
const ESPERADAS = [
  ".fuentesIngreso",
  ".consultadoEn",
  ".identidad.edad",
  ".identidad.edadConyuge",
  ".identidad.añosCasado",
  ...CAMPOS_LABORAL.map((c) => `.laboral.${c}`),
];

const mesMenos = (m) => { const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 2; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };

// process.ts mide contra hoy (empleo de los últimos 3 meses, antigüedades):
// armado un día después, el mismo crudo da otro perfil. En la primera
// corrida 1.429 de 2.185 "no se reproducían" sólo por eso. Se arma con el
// reloj en el momento en que se capturó el crudo.
function armarEnFecha(instante, fn) {
  const DateReal = globalThis.Date;
  const fijo = new DateReal(instante).getTime();
  class DateFijo extends DateReal {
    constructor(...args) {
      super(...(args.length ? args : [fijo]));
    }
    static now() {
      return fijo;
    }
  }
  globalThis.Date = DateFijo;
  try {
    return fn();
  } finally {
    globalThis.Date = DateReal;
  }
}

const cuenta = new Map();
const sumar = (k) => cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
const noReproducen = [];
const escrituras = [];

for (let i = 0; i < candidatos.length; i += 50) {
  const lote = candidatos.slice(i, i + 50);
  const { cuerpo: filas } = await pedir(
    `${env.SUPABASE_URL}/rest/v1/client_profiles?id=in.(${lote.map((c) => c.perfilId).join(",")})&select=id,perfil_laboral,standard_profile`,
  );
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const { archivo, perfilId } of lote) {
    const fila = porId.get(perfilId);
    const guardado = fila?.standard_profile;
    const fAnterior = guardado?.fuentesIngreso;
    if (!fAnterior) { sumar("sin fuentesIngreso guardado"); continue; }
    if (fAnterior.version === FUENTES_INGRESO_VERSION && !FORZAR) { sumar(`ya en ${FUENTES_INGRESO_VERSION}`); continue; }
    const { cedula, capturadoEl, raw } = JSON.parse(fs.readFileSync(archivo, "utf8"));
    // El corte con que se clasificó ese día: si el cliente traía un mes
    // posterior, el vigente era anterior a ese mes.
    const corte = fAnterior.corteDesactualizado ? mesMenos(fAnterior.corteIessUsado) : fAnterior.corteIessUsado;
    const nuevo = armarEnFecha(capturadoEl, () => buildStandardProfile(raw, cedula, corte).profile);

    const otras = rutasDistintas(guardado, nuevo).filter((r) => !ESPERADAS.some((e) => r === e || r.startsWith(`${e}.`)));
    if (otras.length) { noReproducen.push(`${cedula}: ${otras.slice(0, 3).join(", ")}`); continue; }

    const laboralAnterior = Object.fromEntries(
      CAMPOS_LABORAL.filter((c) => guardado.laboral?.[c] !== nuevo.laboral[c]).map((c) => [c, guardado.laboral?.[c] ?? null]),
    );
    // Un recálculo previo dice de qué versión venía: se conserva, y sólo se
    // suman los campos de laboral que cambian ahora por primera vez. Un
    // perfil que ya nació en la versión actual no lleva nota.
    const previo = fAnterior.detalle?.recalculo ?? null;
    const recalculo = previo
      ? { ...previo, laboralAnterior: { ...laboralAnterior, ...previo.laboralAnterior } }
      : fAnterior.version !== FUENTES_INGRESO_VERSION
        ? {
            el: HOY,
            desdeCrudo: true,
            versionAnterior: fAnterior.version,
            segmentoAnterior: fAnterior.segmento,
            estadoAnterior: fAnterior.estadoSegmento,
            ...(Object.keys(laboralAnterior).length ? { laboralAnterior } : {}),
          }
        : null;
    const fNuevo = {
      ...nuevo.fuentesIngreso,
      // La corrección de motivos de la 081 sigue diciendo algo cierto.
      ...(fAnterior.correccion ? { correccion: fAnterior.correccion } : {}),
      detalle: { ...nuevo.fuentesIngreso.detalle, ...(recalculo ? { recalculo } : {}) },
    };
    const perfil = { ...guardado, fuentesIngreso: fNuevo, laboral: { ...guardado.laboral } };
    for (const c of CAMPOS_LABORAL) perfil.laboral[c] = nuevo.laboral[c];
    const clave = clasificarPerfilLaboral(perfil)?.clave ?? null;

    if (fAnterior.segmento !== fNuevo.segmento) sumar(`segmento ${fAnterior.segmento} -> ${fNuevo.segmento}`);
    if (fAnterior.estadoSegmento !== fNuevo.estadoSegmento) sumar(`estado ${fAnterior.estadoSegmento} -> ${fNuevo.estadoSegmento}`);
    if (fila.perfil_laboral !== clave) sumar(`perfil laboral ${fila.perfil_laboral} -> ${clave}`);
    escrituras.push({ id: perfilId, standard_profile: perfil, perfil_laboral: clave });
  }
}

console.log(`a escribir: ${escrituras.length} | el crudo no reproduce el perfil: ${noReproducen.length}`);
for (const [k, v] of [...cuenta].sort((x, y) => y[1] - x[1])) console.log(String(v).padStart(6), k);
if (noReproducen.length) console.log("no reproducen (no se tocan):", noReproducen.slice(0, 10));
if (SECO) process.exit(0);

// De a una fila: cada perfil es distinto. 0 filas devueltas no es un error
// para PostgREST (RLS o id inexistente): se cuenta.
let escritas = 0;
const fallas = [];
let siguiente = 0;
async function trabajador() {
  while (siguiente < escrituras.length) {
    const e = escrituras[siguiente++];
    try {
      const { cuerpo } = await pedir(`${env.SUPABASE_URL}/rest/v1/client_profiles?id=eq.${e.id}&select=id`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ standard_profile: e.standard_profile, perfil_laboral: e.perfil_laboral }),
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
