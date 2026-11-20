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
// La capa de hechos (docs/capa-de-hechos.md, 5.3), en todos los casos:
//   - deriva los hechos y comprueba que todo registro citado existe en el crudo;
//   - paridad de los grupos de GRUPOS_EN_PARIDAD contra el perfil armado con el
//     reloj en `capturadoEl`. Desde la etapa B (estructura-v25) process.ts arma
//     esos grupos desde los hechos: la paridad prueba que copia cada campo, y
//     una fuente que no contestó ya no explica ninguna diferencia;
//   - `hechos` (opcional): por código, el `valor`, el `motivo` y el `parcial`
//     si no tiene valor, los `registros` que tiene que citar («fuente.lista#indice», o
//     «fuente.lista» para la respuesta entera), los `descartados`
//     («fuente.lista#indice:motivo») y las `diferencias` que tienen que salir;
//   - `reglas` (opcional): { "id@version": "aplica" | "no-aplica" }. Cada regla de
//     REGLAS_QUE_MEZCLAN necesita un caso de cada uno, y un caso que declara una
//     regla trae `hechos` que lo demuestran;
//   - los hechos entran al contexto de los detectores (`hechos`).
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
const { derivarHechos, GRUPOS, GRUPOS_EN_PARIDAD } = await importar("supabase/functions/_shared/hechos/indice.ts");
const { perfilDesdeHechos, gruposDelPerfil } = await importar("supabase/functions/_shared/hechos/perfil-desde-hechos.ts");

// El perfil con el reloj en la captura del caso, como lo arma comparar-hechos.mjs.
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
const canonico = (v) =>
  JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));
const resuelve = (raw, r) => {
  const lista = raw?.[r.fuente]?.data?.[r.lista];
  if (!raw?.[r.fuente]) return false;
  if (r.lista === undefined) return true;
  if (!Array.isArray(lista)) return false;
  if (r.indice === undefined) return true;
  return !!lista[r.indice] && (r.campo === undefined || r.campo in lista[r.indice]);
};
const textoDeRef = (r) => `${r.fuente}.${r.lista}${r.indice === undefined ? "" : `#${r.indice}`}`;
const reglasQueMezclan = new Set(Object.values(GRUPOS).flatMap((g) => g.REGLAS_QUE_MEZCLAN));
const cubiertasLasReglas = new Map([...reglasQueMezclan].map((r) => [r, { aplica: 0, "no-aplica": 0 }]));
const enParidad = GRUPOS_EN_PARIDAD.flatMap((g) => gruposDelPerfil(GRUPOS[g].CATALOGO));
// Los campos que un grupo declara pendientes, con su porqué, no entran en la paridad.
const pendientes = new Set(Object.values(GRUPOS).flatMap((g) => (g.CAMPOS_PENDIENTES ?? []).map((p) => p.campo)));

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

  // ---- Hechos ----
  let hechos = null;
  try {
    hechos = derivarHechos(caso.raw, {
      cedula: caso.cedula,
      consulta: nombre,
      fechaDeLaConsulta: caso.capturadoEl,
      corteIess: caso.capturadoEl.slice(0, 7),
      persona: { nombre: null, fechaDeNacimiento: null },
    });
  } catch (e) {
    control(`${nombre}: se derivan los hechos`, false, e.message);
  }
  if (hechos) {
    const citas = [
      ...hechos.hechos.flatMap((h) => [...h.registros, ...(h.descartados ?? []).map((d) => d.registro)]),
      ...hechos.diferencias.flatMap((d) => [d.manda.registro, ...d.cede.map((x) => x.registro)]),
      ...hechos.entidades.flatMap((e) => e.vistas.map((v) => v.registro)),
    ];
    const sinResolver = citas.filter((r) => !resuelve(caso.raw, r));
    if (sinResolver.length) control(`${nombre}: todo registro citado existe en el crudo`, false, sinResolver.slice(0, 3).map(textoDeRef).join(", "));

    const porCodigo = new Map(hechos.hechos.map((h) => [h.codigo, h]));
    const conReloj = enParidad.length ? armarEnFecha(caso.capturadoEl, () => buildStandardProfile(caso.raw, caso.cedula, corte).profile) : null;
    for (const gp of enParidad) {
      const desdeHechos = perfilDesdeHechos(hechos, gp);
      for (const campo of new Set([...Object.keys(desdeHechos), ...(conReloj[gp] ? Object.keys(conReloj[gp]) : [])])) {
        if (pendientes.has(`${gp}.${campo}`) || canonico(desdeHechos[campo]) === canonico(conReloj[gp]?.[campo])) continue;
        const codigo = Object.values(GRUPOS).flatMap((g) => g.CATALOGO).find((c) => c.campoDelPerfil === `${gp}.${campo}`)?.codigo;
        control(`${nombre}: paridad de ${gp}.${campo}`, false, `perfil ${canonico(conReloj[gp]?.[campo])}, hechos ${canonico(desdeHechos[campo])}`);
      }
    }

    for (const [codigo, esperado] of Object.entries(caso.hechos ?? {})) {
      const h = porCodigo.get(codigo);
      if (!h) { control(`${nombre} · ${codigo}: se emitió`, false); continue; }
      const problemas = [];
      if ("valor" in esperado && canonico(h.valor) !== canonico(esperado.valor)) problemas.push(`valor ${canonico(h.valor)}, se esperaba ${canonico(esperado.valor)}`);
      if (esperado.motivo && h.motivo !== esperado.motivo) problemas.push(`motivo ${h.motivo}`);
      if ("parcial" in esperado && canonico(h.parcial ?? null) !== canonico(esperado.parcial)) problemas.push(`parcial ${canonico(h.parcial ?? null)}, se esperaba ${canonico(esperado.parcial)}`);
      const distintas = (a, b) => canonico([...new Set(a)].sort()) !== canonico([...new Set(b)].sort());
      if (esperado.registros && distintas(h.registros.map(textoDeRef), esperado.registros)) problemas.push(`cita ${[...new Set(h.registros.map(textoDeRef))].join(", ")}`);
      if (esperado.descartados && distintas((h.descartados ?? []).map((d) => `${textoDeRef(d.registro)}:${d.motivo}`), esperado.descartados)) {
        problemas.push(`descarta ${(h.descartados ?? []).map((d) => `${textoDeRef(d.registro)}:${d.motivo}`).join(", ") || "nada"}`);
      }
      for (const dif of esperado.diferencias ?? []) if (!hechos.diferencias.some((d) => d.codigo === dif)) problemas.push(`falta la diferencia ${dif}`);
      control(`${nombre} · ${codigo}`, problemas.length === 0, problemas.join("; "));
    }
  }
  for (const [regla, como] of Object.entries(caso.reglas ?? {})) {
    if (!cubiertasLasReglas.has(regla)) { control(`${nombre}: la regla «${regla}» está en REGLAS_QUE_MEZCLAN`, false); continue; }
    if (!caso.hechos) { control(`${nombre}: declara «${regla}» y trae los hechos que lo muestran`, false); continue; }
    cubiertasLasReglas.get(regla)[como]++;
  }

  const contexto = { raw: caso.raw, cedula: caso.cedula, capturadoEl: caso.capturadoEl, perfil, bloqueo, hechos };

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

for (const [regla, c] of cubiertasLasReglas) {
  control(`${regla}: tiene un caso en que aplica y uno en que no`, c.aplica > 0 && c["no-aplica"] > 0, `${c.aplica} y ${c["no-aplica"]}`);
}

console.log(`\n${archivos.length} casos, ${DETECTORES_DEL_CRUDO.length} detectores del crudo, ${cubiertasLasReglas.size} reglas que mezclan; grupos en paridad: ${GRUPOS_EN_PARIDAD.join(", ") || "ninguno"}.`);
if (fallas) {
  console.log(`${fallas} ${fallas === 1 ? "falla" : "fallas"}.`);
  process.exit(1);
}
