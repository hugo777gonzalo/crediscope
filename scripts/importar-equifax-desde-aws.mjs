// Carga en `consultas_equifax` las respuestas crudas de Equifax que Novacredit ya
// pagó y que están respaldadas en research/ingresos-aws/crudo-equifax/, para que
// CrediScope las reutilice como si la consulta se hubiera hecho acá: queda la
// fila, se derivan las tablas equifax_* y la estructura, y `consultaVigente()`
// la sirve hasta el corte del mes en vez de volver a cobrar. No llama a Equifax.
//
// POR QUÉ ASÍ (decisiones, no obviedades):
//   - La cédula sale del documento que trae la respuesta, no de AWS: la fila de
//     AWS sólo trae `id_persona`, y la identidad de una respuesta ya se comprueba
//     contra su propio documento (`documentoDeLaRespuesta`).
//   - `fecha_consulta` de AWS no trae zona; contra la hora de bajada del respaldo
//     es hora de Ecuador (UTC-5), y se guarda así. De ella depende la vigencia.
//   - Por defecto sólo se importan las que siguen vigentes (`estaVigenteHastaElCorte`):
//     una vencida jamás se serviría y sólo ensuciaría la tabla. `--todas` las suma
//     (sirve para el historial y el predictor, no para evitar cobros).
//   - NO crea personas en `clients`: enlaza sólo a quien ya existe. Crear miles de
//     personas desde un respaldo no es parte de "reutilizar una consulta".
//   - Es idempotente: marca cada fila con `parametros.aws_id_consulta_equifax` y
//     no repite una ya cargada.
//   - Si ya hay una consulta de esa cédula igual o más nueva, no se pisa.
//   - `ambiente` es 'produccion' sólo con --produccion; sin la bandera queda
//     'prueba', que no sirve para calificar a nadie (docs/equifax.md).
//
// QUÉ SE IMPRIME: conteos y el código c-xxxxxxxx de quien ya existe; nunca una
// cédula, un nombre ni un monto.
//
// Uso:
//   node scripts/importar-equifax-desde-aws.mjs --base-legal="<contrato>"
//       En seco (por defecto): lee el respaldo, valida y cuenta. No escribe.
//   node scripts/importar-equifax-desde-aws.mjs --base-legal="<contrato>" --aplicar --produccion --max=50
//       Escribe. Pasando de 50 filas exige --autorizo=<n> con el mismo n.
//   --lote=<n>          sólo ese lote del respaldo (por defecto, todos)
//   --max=<n>           tope de filas a escribir (por defecto 50)
//   --todas             incluir las que ya no están vigentes
//   --sin-commit        permite correr con cambios sin guardar en git (queda anotado)
//
// AVISO: este archivo no pasa por lint ni build. Si cambia la forma del respaldo
// (`extraer_crudo_equifax.mjs`) o de `consultas_equifax`, ajustar acá.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";
import { cargarEntorno, carpetaDeResearch } from "./_comun/entorno.mjs";
import { explicar } from "./_comun/casos.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const bandera = (n) => args.includes(`--${n}`);
const valor = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const APLICAR = bandera("aplicar");
const SECO = !APLICAR;
const TODAS = bandera("todas");
const PRODUCCION = bandera("produccion");
const MAX = Number(valor("max") ?? 50);
const LOTE = valor("lote") ? Number(valor("lote")) : null;
const BASE_LEGAL = valor("base-legal") ?? "";

function morir(...lineas) {
  console.error(lineas.join("\n"));
  process.exit(1);
}

if (BASE_LEGAL.trim().length < 10) morir("Falta --base-legal=\"<contrato>\" (mínimo 10 caracteres): sin base legal no se carga una consulta.");
if (!Number.isInteger(MAX) || MAX < 1) morir("--max tiene que ser un entero positivo.");
if (APLICAR && MAX > 50 && Number(valor("autorizo")) !== MAX) {
  morir(`Escribir más de 50 consultas exige --autorizo=${MAX} (el mismo número que --max).`);
}

cargarEntorno(RAIZ);
// El puente para que los módulos de la función corran en Node (antes de importarlos).
globalThis.Deno = { env: { get: (k) => process.env[k] } };
const compartido = new URL("../supabase/functions/_shared/", import.meta.url).href;
const persistencia = await import(compartido + "equifax-persistencia.ts");
const cliente = await import(compartido + "equifax-client.ts");
const vigencia = await import(compartido + "vigencia-mensual.ts");
const tablasMod = await import(compartido + "equifax-tablas.ts");

for (const clave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[clave]) morir(`Falta ${clave} en .env.functions.`);
}

const carpeta = carpetaDeResearch(RAIZ, "ingresos-aws", "crudo-equifax", "json");
if (!fs.existsSync(carpeta)) morir(`No existe el respaldo en ${carpeta}.`);
const archivos = fs.readdirSync(carpeta).filter((f) => /^lote-\d+\.jsonl\.gz$/.test(f)).sort();
const elegidos = LOTE === null ? archivos : archivos.filter((f) => Number(f.match(/\d+/)[0]) === LOTE);
if (elegidos.length === 0) morir("No hay lotes que coincidan.");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Hora de Ecuador, sin zona en AWS -> ISO con -05:00.
const aIsoEcuador = (s) => {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?/);
  return m ? `${m[1]}T${m[2]}${(m[3] ?? "").slice(0, 4)}-05:00` : null;
};

const ahora = new Date();
const cuenta = { leidas: 0, sin_cuerpo: 0, sin_documento: 0, no_cedula: 0, sin_fecha: 0, vencidas: 0, ya_cargadas: 0, hay_mas_nueva: 0, a_cargar: 0, cargadas: 0, fallidas: 0 };
let filasDerivadas = 0;
let existentesEnClients = 0;

const ejecucion = SECO ? null : await abrirEjecucion({ url: process.env.SUPABASE_URL, clave: process.env.SUPABASE_SERVICE_ROLE_KEY, guion: "importar-equifax-desde-aws" });

// Las cédulas ya vistas en esta corrida: una persona consultada dos veces en el
// respaldo sólo importa en su consulta más nueva (se baja de la más nueva a la más vieja).
const vistas = new Set();

parar: for (const archivo of elegidos) {
  const lineas = zlib.gunzipSync(fs.readFileSync(path.join(carpeta, archivo))).toString("utf8").split("\n").filter(Boolean);
  for (const linea of lineas) {
    cuenta.leidas++;
    const f = JSON.parse(linea);
    const cuerpo = f.response_json && typeof f.response_json === "object" ? f.response_json : null;
    if (f.estado !== 1 || !cuerpo) { cuenta.sin_cuerpo++; continue; }
    const cedula = cliente.documentoDeLaRespuesta(cuerpo);
    if (cedula === null) { cuenta.sin_documento++; continue; }
    if (!/^\d{10}$/.test(cedula)) { cuenta.no_cedula++; continue; }
    const creadaEl = aIsoEcuador(f.fecha_consulta ?? f.fecha_creacion);
    if (!creadaEl) { cuenta.sin_fecha++; continue; }
    if (!TODAS && !vigencia.estaVigenteHastaElCorte(creadaEl, ahora)) { cuenta.vencidas++; continue; }
    if (vistas.has(cedula)) { cuenta.hay_mas_nueva++; continue; }
    vistas.add(cedula);

    // ¿Ya está cargada, o hay una igual o más nueva de esa cédula?
    const { data: previa, error: errPrevia } = await db.from("consultas_equifax").select("id, created_at, parametros")
      .eq("identificacion", cedula).eq("tipo_identificacion", "C").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (errPrevia) morir(`No se pudo buscar una consulta previa: ${explicar(errPrevia)}`);
    if (previa && String(previa.parametros?.aws_id_consulta_equifax) === String(f.id_consulta_equifax)) { cuenta.ya_cargadas++; continue; }
    if (previa && new Date(previa.created_at).getTime() >= new Date(creadaEl).getTime()) { cuenta.hay_mas_nueva++; continue; }

    const { data: persona } = await db.from("clients").select("id").eq("cedula", cedula).maybeSingle();
    if (persona) existentesEnClients++;
    cuenta.a_cargar++;

    // Las tablas se derivan en seco en las dos modalidades: si el crudo no se
    // deriva, mejor enterarse antes de escribir.
    const derivadas = tablasMod.derivarTablas(cuerpo);
    filasDerivadas += Object.values(derivadas.tablas).reduce((a, t) => a + t.length, 0);

    if (SECO) continue;
    if (cuenta.cargadas + cuenta.fallidas >= MAX) { cuenta.a_cargar--; break parar; }

    const { data: guardado, error } = await db.from("consultas_equifax").insert({
      identificacion: cedula,
      tipo_identificacion: "C",
      client_id: persona?.id ?? null,
      respuesta_cruda: cuerpo,
      http_equifax: 200,
      cabeceras_respuesta: {},
      parametros: { origen_respaldo: "aws-novacredit", aws_id_consulta_equifax: f.id_consulta_equifax },
      intentos: 1,
      origen: f.masivo ? "lote" : "consulta",
      base_legal: BASE_LEGAL,
      ambiente: PRODUCCION ? "produccion" : "prueba",
      created_at: creadaEl,
    }).select("*").single();
    if (error) {
      cuenta.fallidas++;
      console.log(`[consulta ${f.id_consulta_equifax}] ERROR al guardar: ${explicar(error)}`);
      continue;
    }
    const r = await persistencia.guardarTablasDeLaConsulta(db, guardado);
    if (r.ok) cuenta.cargadas++;
    else {
      cuenta.fallidas++;
      console.log(`[consulta ${f.id_consulta_equifax}] guardada, pero sus tablas FALLARON (${r.codigo ?? "sin código"}); rehacer con cargar-tablas-equifax.mjs`);
    }
  }
}

ejecucion?.sumarFilas(cuenta.cargadas);
ejecucion?.anotar({ ...cuenta, base_legal: BASE_LEGAL, ambiente: PRODUCCION ? "produccion" : "prueba" });

console.log(`respaldo leído          : ${elegidos.length} lote(s), ${cuenta.leidas} respuestas`);
console.log(`  sin cuerpo / error    : ${cuenta.sin_cuerpo}`);
console.log(`  sin documento         : ${cuenta.sin_documento}`);
console.log(`  documento no es cédula: ${cuenta.no_cedula}`);
console.log(`  sin fecha legible     : ${cuenta.sin_fecha}`);
console.log(`  vencidas (no se piden): ${cuenta.vencidas}${TODAS ? " (con --todas no se descartan)" : ""}`);
console.log(`  ya cargadas           : ${cuenta.ya_cargadas}`);
console.log(`  hay una más nueva     : ${cuenta.hay_mas_nueva}`);
console.log(`a cargar                : ${cuenta.a_cargar} (${existentesEnClients} ya son personas de CrediScope; ${filasDerivadas} filas de tablas se derivan)`);
if (SECO) {
  console.log("EN SECO: no se escribió nada. Para escribir: --aplicar --produccion --max=<n>.");
} else {
  console.log(`cargadas: ${cuenta.cargadas}, con error: ${cuenta.fallidas}, ambiente ${PRODUCCION ? "produccion" : "prueba"}`);
}
process.exit(cuenta.fallidas > 0 ? 1 : 0);
