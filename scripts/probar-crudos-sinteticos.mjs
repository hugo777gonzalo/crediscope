// Prueba los detectores del crudo (DETECTORES_DEL_CRUDO, la misma lista que
// corre `scripts/revisar-crudo.mjs`) sobre un juego de crudos INVENTADOS, sin
// base, sin red y sin datos de personas: es lo que el control `guiones` corre
// en cada PR.
//
// Por qué existe: tres errores de mezcla del crudo (la demanda de otro
// demandado, el hipotecario del BIESS contado dos veces, el comportamiento
// interno de otra operación) llegaron a producción porque ningún control del PR
// mira el crudo, y cada uno costó una versión de la estructura y un recálculo de
// miles de perfiles. `revisar-crudo.mjs` sólo corre a mano contra crudos reales
// que viven fuera de git. Acá cada detector tiene al menos un caso que lo
// dispara y uno que no, con la forma real de las fuentes que lee.
//
// Cómo se arma un caso (`scripts/crudos-sinteticos/*.json`):
//   - `raw`: sólo las fuentes que el detector y `process.ts` necesitan.
//   - `guardado` (opcional): lo que habría guardado una versión VIEJA de la
//     estructura. Sin él, el perfil y el bloqueo se arman con el código vigente
//     (`buildStandardProfile`, `evaluarControlesBloqueo`), que es lo que un
//     recálculo dejaría. Con él, `perfil` se mezcla grupo por grupo sobre el
//     vigente y `bloqueo` lo reemplaza. Así el caso que dispara reproduce el
//     error corregido sin que haya que mantener un perfil entero a mano.
//   - `esperado`: { idDelDetector: "dispara" | "no-dispara" }. Un detector que
//     el caso no nombra tiene que quedar sin casos.
// Todo valor es inventado: identificación sin dígito verificador válido, nombres
// ficticios, montos redondos. El repositorio es público.
//
// Además exige que cada detector del catálogo tenga un caso que dispara y uno
// que no: un detector nuevo sin su juego de prueba corta el control.
//
// Sale con 1 si algo no da lo esperado.
//
// Uso: node scripts/probar-crudos-sinteticos.mjs [--carpeta=scripts/crudos-sinteticos]
//
// AVISO: este archivo no pasa por lint ni build; el control `guiones` lo corre.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.length ? v.join("=") : true];
}));
const CARPETA = path.resolve(RAIZ, typeof args.carpeta === "string" ? args.carpeta : "scripts/crudos-sinteticos");
const importar = (ruta) => import(pathToFileURL(path.join(RAIZ, ruta)).href);
const { DETECTORES_DEL_CRUDO } = await importar("scripts/revision-de-datos/detectores.mjs");
const { buildStandardProfile } = await importar("supabase/functions/_shared/process.ts");
const { evaluarControlesBloqueo } = await importar("supabase/functions/_shared/controles-bloqueo.ts");

let fallas = 0;
function control(nombre, ok, detalle = "") {
  if (!ok) fallas++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre}${detalle ? ` (${detalle})` : ""}`);
}

const archivos = fs.readdirSync(CARPETA).filter((a) => a.endsWith(".json")).sort();
control("hay casos sintéticos", archivos.length > 0, CARPETA);
const cubiertos = new Map(DETECTORES_DEL_CRUDO.map((d) => [d.id, { dispara: 0, "no-dispara": 0 }]));

for (const archivo of archivos) {
  const caso = JSON.parse(fs.readFileSync(path.join(CARPETA, archivo), "utf8"));
  const nombre = archivo.replace(/\.json$/, "");
  // El mismo `buildStandardProfile` de producción, con el corte de la consulta.
  const corte = caso.capturadoEl.slice(0, 10);
  const vigente = buildStandardProfile(caso.raw, caso.cedula, corte).profile;
  const perfil = { ...vigente };
  for (const [grupo, valores] of Object.entries(caso.guardado?.perfil ?? {})) perfil[grupo] = { ...(vigente[grupo] ?? {}), ...valores };
  const bloqueo = caso.guardado?.bloqueo ?? evaluarControlesBloqueo(caso.raw, caso.cedula);
  const contexto = { raw: caso.raw, cedula: caso.cedula, capturadoEl: caso.capturadoEl, perfil, bloqueo };

  for (const id of Object.keys(caso.esperado ?? {})) {
    if (!cubiertos.has(id)) control(`${nombre}: el detector «${id}» existe`, false);
  }
  for (const d of DETECTORES_DEL_CRUDO) {
    const esperado = caso.esperado?.[d.id] ?? "no-dispara";
    let hallado;
    try {
      hallado = d.aplica(contexto) && d.detectar(contexto) ? "dispara" : "no-dispara";
    } catch (e) {
      control(`${nombre} · ${d.id}`, false, `falló: ${e.message}`);
      continue;
    }
    // Sólo cuenta como cobertura lo que el caso nombra: lo demás es la prueba
    // de que un detector no marca lo que no es suyo.
    if (caso.esperado?.[d.id] && hallado === esperado) cubiertos.get(d.id)[esperado]++;
    if (hallado !== esperado || caso.esperado?.[d.id]) control(`${nombre} · ${d.id}`, hallado === esperado, `esperado ${esperado}, dio ${hallado}`);
  }
}

for (const d of DETECTORES_DEL_CRUDO) {
  const c = cubiertos.get(d.id);
  control(`${d.id}: tiene un caso que dispara y uno que no`, c.dispara > 0 && c["no-dispara"] > 0, `${c.dispara} y ${c["no-dispara"]}`);
}

console.log(`\n${archivos.length} casos, ${DETECTORES_DEL_CRUDO.length} detectores del crudo.`);
if (fallas) {
  console.log(`${fallas} ${fallas === 1 ? "falla" : "fallas"}.`);
  process.exit(1);
}
