// Reescribe por lotes el historial guardado que nombra al proveedor con su
// nombre anterior (continúa la migración 142).
//
// Las claves de los perfiles guardados (proveedorInfo1DiasMoraVigente...) las
// lee el código nuevo, y los textos de los análisis y los registros
// operativos tienen que dejar de nombrarlo (contrato, 2026-10-31). Cien MB
// en una sola sentencia pasaron el tope de la conexión (524 a los 2
// minutos), por eso va por lotes, de a `--lote=` filas. Idempotente: sólo
// toca las filas que todavía lo contienen.
//
// El nombre anterior se arma partido para que el término no vuelva al
// repositorio.
//
// Uso:
//   node scripts/reescribir-historial-proveedor-info-1.mjs --seco       (cuenta, no toca)
//   node scripts/reescribir-historial-proveedor-info-1.mjs [--lote=200] [--cliente=<clave>]
//
// AVISO: este guion no pasa por lint ni build.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";
import { raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const opcion = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const seco = process.argv.includes("--seco");
const lote = Number(opcion("lote") ?? 200);
const V = "nova" + "data";

const OBJETIVO = [
  ["client_profiles", "standard_profile"], ["client_profiles", "estado_por_fuente"],
  ["client_profiles", "control_bloqueo"], ["client_profiles", "duracion_por_fuente_ms"],
  ["client_profiles", "crudo_ruta"],
  ["lab_reconsultas", "perfil_t0"], ["lab_reconsultas", "perfil_t1"],
  ["lab_reconsultas", "resultado"], ["lab_reconsultas", "crudo_ruta"],
  ["lab_variables_candidatas", "ruta_crudo"],
  ["lab_corte_solicitudes", "variables"], ["lab_corte_operaciones", "variables"],
  ["lab_simulacion_verdad", "fuentes_caidas"], ["lab_resultados", "resultado"],
  ["analysis_results", "mensaje_al_modelo"], ["analysis_results", "positives"],
  ["analysis_results", "negatives"], ["analysis_results", "narrative_summary"],
  ["analysis_results", "acciones_sugeridas"], ["analysis_results", "missing_info"],
  ["analysis_results", "inconsistencies"],
  ["solicitudes", "resultado"], ["solicitudes", "pasos"],
  ["consultas_por_dia_y_fuente", "fuente"],
  ["despliegues", "funciones"], ["ejecuciones_operativas", "argumentos"],
];

// Misma regla que la 142 y que el reemplazo del repositorio.
const FUNCION = `
create or replace function pg_temp.renombrar(t text) returns text language sql immutable as $f$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(t,
    '-' || 'nova' || 'data', '-proveedor-info-1', 'g'),
    'nova' || 'data' || '-', 'proveedor-info-1-', 'g'),
    'nova' || 'data' || '(?=[A-Z0-9])', 'proveedorInfo1', 'g'),
    '([A-Za-z0-9])Nova' || 'data', '\\1ProveedorInfo1', 'g'),
    'Nova' || 'data|NOVA' || 'DATA', 'Proveedor_Info_1', 'g'),
    'nova' || 'data', 'proveedor_info_1', 'g')
$f$;
`;

const directorio = JSON.parse(fs.readFileSync(path.join(RAIZ, "clientes", "directorio.json"), "utf8"));
const clientes = directorio.clientes.filter((c) => !opcion("cliente") || c.clave === opcion("cliente"));

function leerEnv(archivo) {
  return Object.fromEntries(
    fs.readFileSync(path.join(raizPrincipal(RAIZ), archivo), "utf8").split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

function correr(proyecto, sql) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "historial-"));
  const archivo = path.join(carpeta, "consulta.sql");
  fs.writeFileSync(archivo, sql);
  try {
    const salida = execSync(`npx --yes supabase@latest db query --linked --project-ref ${proyecto} --file "${archivo}" -o json`, {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(salida.slice(salida.indexOf("{"))).rows ?? [];
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
}

let total = 0;
for (const cliente of clientes) {
  const env = leerEnv(cliente.secretos);
  const ejecucion = await abrirEjecucion({ url: cliente.url, clave: env.SUPABASE_SERVICE_ROLE_KEY, guion: "reescribir-historial-proveedor-info-1", seco });
  for (const [tabla, columna] of OBJETIVO) {
    const tipo = correr(cliente.proyecto,
      `select format_type(atttypid, atttypmod) as tipo from pg_attribute where attrelid = to_regclass('public.${tabla}') and attname = '${columna}' and not attisdropped;`)[0]?.tipo;
    if (!tipo) { console.log(`${tabla}.${columna}: no existe, se salta`); continue; }
    const condicion = `${columna}::text ilike '%${V}%'`;
    if (seco) {
      const n = correr(cliente.proyecto, `select count(*)::int as n from public.${tabla} where ${condicion};`)[0].n;
      console.log(`${tabla}.${columna}: ${n} filas`);
      total += n;
      continue;
    }
    let hechas = 0;
    for (;;) {
      const n = correr(cliente.proyecto, `${FUNCION}
with u as (
  update public.${tabla} set ${columna} = pg_temp.renombrar(${columna}::text)::${tipo}
   where ctid in (select ctid from public.${tabla} where ${condicion} limit ${lote})
  returning 1)
select count(*)::int as n from u;`)[0].n;
      hechas += n;
      if (n < lote) break;
    }
    console.log(`${tabla}.${columna}: ${hechas} filas reescritas`);
    total += hechas;
  }
  ejecucion.sumarFilas?.(total);
}
console.log(`${seco ? "Por reescribir" : "Reescritas"}: ${total} filas.`);
