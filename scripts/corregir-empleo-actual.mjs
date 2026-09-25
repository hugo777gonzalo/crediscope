// Corrige el empleo actual de los perfiles guardados que tienen un aporte
// vigente al IESS y, sin embargo, figuran sin empleo actual.
//
// POR QUÉ
//
// Hasta estructura-v3 el empleo actual salía sólo del mecanizado del IESS,
// con una regla de "últimos 3 meses contra hoy", mientras la clasificación
// de ingresos lee los aportes (tiess) contra el corte. Medido el
// 2026-09-24: 374 perfiles (359 de ellos el último de su cliente) veían un
// aporte vigente en la clasificación y decían "sin empleo actual" en el
// perfil. 372 son de la forma vieja (`laboral.empleoActual`, anterior a
// marco-v20) y 2 de la nueva (`laboral.empleosActuales`).
//
// estructura-v4 lo arregla para las consultas nuevas. Para las guardadas no
// hay crudo, pero no hace falta: el perfil ya guarda los aportes vigentes
// en fuentesIngreso.fuentes (empleador y sueldo declarado), y donde las dos
// fuentes del IESS traen dato el sueldo coincide en 272 de 272. El cargo no
// se guarda ahí y queda en null.
//
// Las señales de vínculo con el empleador (comparte apellido, es su propio
// empleador) se calculan con relacionConEmpleador de process.ts: el mismo
// criterio que una consulta nueva, no una copia. Sólo se escriben si el
// perfil ya tenía ese campo -- a un perfil de una época que no los tenía no
// se le agregan.
//
// Cada perfil corregido queda marcado en laboral.correccionEmpleoActual.
// Correrlo dos veces no cambia nada: sólo toma perfiles sin empleo actual.
//
// Uso:  node scripts/corregir-empleo-actual.mjs [--seco]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const SECO = process.argv.includes("--seco");
const { relacionConEmpleador } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/process.ts")).href);

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
  return texto ? JSON.parse(texto) : null;
}

// PostgREST corta en 1.000 filas: se pagina (ver CLAUDE.md).
const filas = [];
for (let desde = 0; ; desde += 500) {
  const pagina = await pedir(
    `${env.SUPABASE_URL}/rest/v1/client_profiles?select=id,standard_profile&standard_profile->fuentesIngreso=not.is.null&order=id&limit=500&offset=${desde}`,
  );
  filas.push(...pagina);
  if (pagina.length < 500) break;
}

const delIess = (sp) => (sp.fuentesIngreso?.fuentes ?? []).filter((f) => f.evidencia !== "indirecta");
const correcciones = [];
for (const { id, standard_profile: sp } of filas) {
  const laboral = sp.laboral ?? {};
  const aportes = delIess(sp);
  if (aportes.length === 0) continue;

  const formaNueva = Array.isArray(laboral.empleosActuales);
  const tieneEmpleo = formaNueva ? laboral.empleosActuales.length > 0 : laboral.empleoActual && typeof laboral.empleoActual === "object";
  if (tieneEmpleo) continue;

  const empleos = aportes.map((f) => ({ empleador: f.empleador ?? null, cargo: null, salarioAprox: f.montoMensualReportado ?? null }));
  const nombre = sp.identidad?.nombreCompleto ?? null;
  const relaciones = empleos.map((e) => relacionConEmpleador(e.empleador, nombre));
  const tri = (clave) =>
    relaciones.some((x) => x?.[clave] === true) ? true : relaciones.some((x) => x?.[clave] === false) ? false : null;

  const nuevoLaboral = { ...laboral };
  if (formaNueva) {
    nuevoLaboral.empleosActuales = empleos;
  } else {
    // La forma vieja nombra un solo empleo: el de mayor sueldo declarado.
    nuevoLaboral.empleoActual = [...empleos].sort((a, b) => (b.salarioAprox ?? 0) - (a.salarioAprox ?? 0))[0];
  }
  if ("empleadorConApellidoDelCliente" in laboral) nuevoLaboral.empleadorConApellidoDelCliente = tri("comparteApellido");
  if ("clienteEsSuPropioEmpleador" in laboral) nuevoLaboral.clienteEsSuPropioEmpleador = tri("esElMismoCliente");
  nuevoLaboral.correccionEmpleoActual = {
    fecha: "2026-09-25",
    origen: "fuentesIngreso.fuentes (aportes vigentes al corte)",
    porque: "La clasificación veía un aporte vigente al IESS y el perfil decía que no había empleo actual (estructura-v3). Ver docs/estructura-estandarizada.md, estructura-v4.",
  };
  correcciones.push({ id, laboral: nuevoLaboral, sp, formaNueva, apellido: tri("comparteApellido"), mismo: tri("esElMismoCliente") });
}

console.log(`perfiles leídos: ${filas.length}`);
console.log(`a corregir: ${correcciones.length} (forma nueva ${correcciones.filter((c) => c.formaNueva).length}, forma vieja ${correcciones.filter((c) => !c.formaNueva).length})`);
console.log(`señales: comparte apellido ${correcciones.filter((c) => c.apellido === true).length}, es su propio empleador ${correcciones.filter((c) => c.mismo === true).length}`);
if (SECO) process.exit(0);

let ok = 0;
const fallas = [];
for (const c of correcciones) {
  try {
    const devueltas = await pedir(`${env.SUPABASE_URL}/rest/v1/client_profiles?id=eq.${c.id}&select=id`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ standard_profile: { ...c.sp, laboral: c.laboral } }),
    });
    // 0 filas no es un error para PostgREST: se cuenta.
    if (devueltas.length === 1) ok++;
    else fallas.push(`${c.id}: tocó ${devueltas.length} filas`);
  } catch (e) {
    fallas.push(`${c.id}: ${e.message}`);
  }
}
console.log(`corregidos: ${ok} de ${correcciones.length}; fallas: ${fallas.length}`);
for (const f of fallas.slice(0, 10)) console.log("  ", f);
