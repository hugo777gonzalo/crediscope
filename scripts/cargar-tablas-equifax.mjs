// Rehace las tablas equifax_* y la estructura de las consultas a Equifax que
// ya están guardadas, DESDE SU CRUDO (consultas_equifax.respuesta_cruda). No
// llama a Equifax y no cobra: el crudo es lo que ya se pagó.
//
// Para qué sirve (docs/propuesta-estructura-equifax.md, sección 1):
//   - cargar las consultas hechas ANTES de que existieran las tablas (126);
//   - rehacerlas cuando cambia una regla de _shared/equifax-tablas.ts o de
//     _shared/equifax-estructura.ts (se sube su versión y este guion rehace las
//     que quedaron con la anterior);
//   - reparar una consulta cuyas tablas fallaron al guardarse (la función deja
//     constancia en audit_log: equifax.tablas.fallo).
//
// Una sola implementación: usa la misma función que la consulta nueva
// (guardarTablasDeLaConsulta, de _shared/equifax-persistencia.ts), que reemplaza
// de una vez las tablas y la estructura de una consulta (equifax_reemplazar_tablas).
//
// QUÉ SE IMPRIME: nunca una cédula, un nombre ni un monto. Cada consulta se
// identifica por el código c-xxxxxxxx de su persona (los 8 primeros caracteres
// de clients.id) y de lo escrito sólo se muestran conteos de filas.
//
// Uso:
//   node scripts/cargar-tablas-equifax.mjs --seco
//       Deriva en memoria y cuenta; no escribe nada. Hacerlo primero.
//   node scripts/cargar-tablas-equifax.mjs
//       Rehace las que no tienen tablas o las tienen con otra versión.
//   node scripts/cargar-tablas-equifax.mjs --todas
//       Rehace todas, aunque estén al día.
//   --consulta=<uuid>   sólo esa consulta
//   --sin-commit        permite correr con cambios sin guardar en git (queda anotado)
//
// Antes de escribir comprueba que la base tenga las columnas que el código
// espera (la migración 126 aplicada y al día): si falta una, no escribe nada.
//
// AVISO: este archivo no pasa por lint ni build.

import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";
import { cargarEntorno } from "./_comun/entorno.mjs";
import { explicar } from "./_comun/casos.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const bandera = (n) => args.includes(`--${n}`);
const valor = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const SECO = bandera("seco");
const TODAS = bandera("todas");
const UNA = valor("consulta");

function morir(...lineas) {
  console.error(lineas.join("\n"));
  process.exit(1);
}

cargarEntorno(RAIZ);
// El puente para que los módulos de la función corran en Node (antes de importarlos).
globalThis.Deno = { env: { get: (k) => process.env[k] } };
const compartido = new URL("../supabase/functions/_shared/", import.meta.url).href;
const persistencia = await import(compartido + "equifax-persistencia.ts");
const tablasMod = await import(compartido + "equifax-tablas.ts");
const estructuraMod = await import(compartido + "equifax-estructura.ts");

for (const clave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[clave]) morir(`Falta ${clave} en .env.functions.`);
}
if (UNA && !/^[0-9a-f-]{36}$/i.test(UNA)) morir("--consulta tiene que ser el uuid de una consulta de consultas_equifax.");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const VERSION_TABLAS = tablasMod.EQUIFAX_TABLAS_VERSION;
const VERSION_ESTRUCTURA = estructuraMod.EQUIFAX_ESTRUCTURA_VERSION;

// ---------- ¿la base tiene lo que el código espera? ----------
// Una columna de más en el código es lo que NO perdona: jsonb_populate_recordset
// ignora en silencio las claves que no son columnas, y esas filas quedarían con
// el dato perdido. Se pide cada tabla con sus columnas explícitas: si una no
// existe, PostgREST contesta 400.
const faltan = [];
for (const tabla of Object.keys(tablasMod.ESPECIFICACION_DE_TABLAS)) {
  const columnas = ["consulta_equifax_id", ...tablasMod.columnasDeLaTabla(tabla)];
  const { error } = await db.from(tabla).select(columnas.join(","), { head: true }).limit(1);
  if (error) faltan.push(`${tabla}: ${explicar(error)}`);
}
{
  const { error } = await db.from("consultas_equifax").select("id, tablas_version, estructura, estructura_version", { head: true }).limit(1);
  if (error) faltan.push(`consultas_equifax: ${explicar(error)}`);
}
if (faltan.length > 0) {
  morir("La base no tiene lo que este código espera (¿falta aplicar la migración 126 con scripts/migrar-clientes.mjs?):", ...faltan.map((f) => `  - ${f}`));
}

// ---------- qué consultas ----------
let consulta = db.from("consultas_equifax").select("id, client_id, created_at, tablas_version, estructura_version").order("created_at", { ascending: true });
if (UNA) consulta = consulta.eq("id", UNA);
const { data: todas, error: errLista } = await consulta;
if (errLista) morir(`No se pudo listar las consultas: ${explicar(errLista)}`);
const pendientes = todas.filter((c) => UNA || TODAS || c.tablas_version !== VERSION_TABLAS || c.estructura_version !== VERSION_ESTRUCTURA);

console.log(`consultas guardadas : ${todas.length}`);
console.log(`a rehacer           : ${pendientes.length}${TODAS ? " (todas)" : UNA ? " (la pedida)" : ` (sin tablas o con otra versión que ${VERSION_TABLAS} / ${VERSION_ESTRUCTURA})`}`);
console.log(`modo                : ${SECO ? "en seco: se deriva en memoria y no se escribe nada" : "ESCRIBE en la base"}`);
if (pendientes.length === 0) {
  console.log("Nada que rehacer.");
  process.exit(0);
}

const ejecucion = SECO ? null : await abrirEjecucion({ url: process.env.SUPABASE_URL, clave: process.env.SUPABASE_SERVICE_ROLE_KEY, guion: "cargar-tablas-equifax" });

let hechas = 0, fallidas = 0, filas = 0;
for (const c of pendientes) {
  const etiqueta = c.client_id ? `c-${String(c.client_id).slice(0, 8)}` : `consulta-${c.id.slice(0, 8)}`;
  // El crudo se trae de a una consulta: pesa cientos de KB.
  const { data: fila, error } = await db.from("consultas_equifax").select("id, identificacion, created_at, ambiente, respuesta_cruda").eq("id", c.id).single();
  if (error) {
    fallidas++;
    console.log(`[${etiqueta}] ERROR al leer el crudo: ${explicar(error)}`);
    continue;
  }
  if (SECO) {
    const derivadas = tablasMod.derivarTablas(fila.respuesta_cruda);
    const estructura = estructuraMod.calcularEstructura(derivadas, {
      consultadoEl: fila.created_at, ambiente: fila.ambiente, identidadVerificada: persistencia.identidadDeLaConsulta(fila.respuesta_cruda, fila.identificacion),
    });
    const n = Object.values(derivadas.tablas).reduce((a, t) => a + t.length, 0);
    filas += n;
    hechas++;
    console.log(`[${etiqueta}] EN SECO | ${n} filas en ${Object.keys(derivadas.tablas).length} tablas | estructura ${Math.round(JSON.stringify(estructura).length / 1024)} KB | ${derivadas.avisos.length} aviso(s)${derivadas.avisos.length ? `: ${derivadas.avisos.join(" | ")}` : ""}`);
    continue;
  }
  const r = await persistencia.guardarTablasDeLaConsulta(db, fila);
  if (r.ok) {
    const n = Object.values(r.conteos ?? {}).reduce((a, b) => a + b, 0);
    filas += n;
    hechas++;
    console.log(`[${etiqueta}] ok | ${n} filas en ${Object.keys(r.conteos ?? {}).length} tablas | ${r.avisos.length} aviso(s)${r.avisos.length ? `: ${r.avisos.join(" | ")}` : ""}`);
  } else {
    fallidas++;
    console.log(`[${etiqueta}] FALLÓ (${r.codigo ?? "sin código"}): ${r.mensaje ?? "sin detalle"}`);
  }
}

ejecucion?.sumarFilas(filas);
ejecucion?.anotar({ consultas: pendientes.length, hechas, fallidas, version_tablas: VERSION_TABLAS, version_estructura: VERSION_ESTRUCTURA });
console.log(`\n${SECO ? "EN SECO" : "TERMINADO"}: ${hechas} consultas ${SECO ? "se rehacerían" : "rehechas"}, ${fallidas} con error, ${filas} filas.`);
if (SECO) console.log("No se escribió nada. Para escribir: repetir sin --seco.");
process.exit(fallidas > 0 ? 1 : 0);
