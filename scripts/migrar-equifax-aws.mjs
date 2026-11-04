// Migra a nuestra base las consultas a Equifax que Novacredit hizo y pagó (la base de originación
// en AWS), bajadas en JSON a research/ingresos-aws/crudo-equifax/. Quedan en consultas_equifax como si
// la consulta la hubiéramos hecho nosotros: persona en clients, crudo inmutable, tablas equifax_* y
// estructura derivadas, y constancia en audit_log. No llama a Equifax ni a Proveedor_Info_1 y no cobra.
//
// POR QUÉ SE PUEDE: Equifax autorizó reutilizar sus consultas (negocio, 2026-10-30), las de Novacredit
// y las nuestras, ya pagadas. La autorización consta en docs/equifax.md.
//
// La procedencia queda en consultas_equifax.parametros.migrada_de (id de AWS, fecha y tipo de la
// consulta original) y el origen es 'lote'. created_at es la fecha original de la consulta, así que la
// vigencia (hasta el 17 de cada mes) es la real: las viejas no se reutilizan como vigentes. Es
// idempotente: una consulta de AWS ya migrada se salta.
//
// QUÉ SE IMPRIME: nunca una cédula, un nombre ni un monto; cada consulta, por el código c-xxxxxxxx.
//
// Uso:
//   node scripts/migrar-equifax-aws.mjs --seco
//       Lee los lotes, filtra, deriva tablas y estructura en memoria y cuenta. No escribe.
//   node scripts/migrar-equifax-aws.mjs --responsable=<uuid de profiles>
//       Escribe. Requiere el responsable (queda en requested_by y en la auditoría).
//   --max=N          sólo las primeras N que corresponda migrar (para una muestra)
//   --desde=AAAA-MM-DD  sólo las consultas de esa fecha (Ecuador) en adelante (las vigentes del mes: desde el 18)
//   --una-por-persona   de cada persona, sólo su consulta más reciente
//   --sin-tablas     no deriva tablas ni estructura (después: cargar-tablas-equifax.mjs)
//   --carpeta=<ruta> otra carpeta de lotes (por defecto la de research/ingresos-aws/crudo-equifax)
//   --sin-commit     permite correr con cambios sin guardar en git (queda anotado)
//
// AVISO: este archivo no pasa por lint ni build.

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
const SECO = bandera("seco");
const SIN_TABLAS = bandera("sin-tablas");
const UNA_POR_PERSONA = bandera("una-por-persona");
const DESDE = valor("desde");
const MAX = valor("max") ? Number(valor("max")) : Infinity;
const RESPONSABLE = valor("responsable");
// De a 10: con 25 crudos de ~85 KB el insert pasaba el statement_timeout (57014) cuando la tabla ya pesaba.
const LOTE_DE_ESCRITURA = 10;

const BASE_LEGAL =
  "Reutilización de consultas a Equifax ya pagadas por Novacredit, autorizada por Equifax (negocio, 2026-10-30); " +
  "la IFI responde por la autorización del titular.";

function morir(...lineas) {
  console.error(lineas.join("\n"));
  process.exit(1);
}

cargarEntorno(RAIZ);
globalThis.Deno = { env: { get: (k) => process.env[k] } };
const compartido = new URL("../supabase/functions/_shared/", import.meta.url).href;
const persistencia = await import(compartido + "equifax-persistencia.ts");
const tablasMod = await import(compartido + "equifax-tablas.ts");
const estructuraMod = await import(compartido + "equifax-estructura.ts");
const cliente = await import(compartido + "equifax-client.ts");

for (const clave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[clave]) morir(`Falta ${clave} en .env.functions.`);
}
if (!SECO && !/^[0-9a-f-]{36}$/i.test(RESPONSABLE ?? "")) {
  morir("Falta el responsable de la corrida (--responsable=<uuid de profiles>): queda en requested_by y en la auditoría.");
}

const carpeta = valor("carpeta") ?? carpetaDeResearch(RAIZ, "ingresos-aws", "crudo-equifax");
const manifiesto = path.join(carpeta, "manifiesto.jsonl");
if (!fs.existsSync(manifiesto)) morir(`No hay manifiesto en ${carpeta}.`);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Las fechas de AWS vienen sin zona: son hora de Ecuador (UTC-5, sin horario de verano).
function fechaDeEcuador(texto) {
  const t = String(texto ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) return null;
  const d = new Date(t.replace(/(\.\d{3})\d*$/, "$1") + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? "" : "-05:00"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function* filasDeLosLotes() {
  const lotes = fs.readFileSync(manifiesto, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const lote of lotes) {
    const ruta = path.join(carpeta, lote.archivo);
    if (!fs.existsSync(ruta)) continue;
    const texto = zlib.gunzipSync(fs.readFileSync(ruta)).toString("utf8");
    for (const linea of texto.split("\n")) {
      if (linea.trim()) yield { lote: lote.lote, fila: JSON.parse(linea) };
    }
  }
}

// ---------- lo ya migrado ----------
async function yaMigradas() {
  const ids = new Set();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from("consultas_equifax").select("parametros").not("parametros->migrada_de", "is", null)
      .order("created_at").range(desde, desde + 999);
    if (error) morir(`No se pudo leer lo ya migrado: ${explicar(error)}`);
    for (const f of data) ids.add(String(f.parametros.migrada_de.id_consulta_equifax));
    if (data.length < 1000) break;
  }
  return ids;
}

const migradas = await yaMigradas();

// ---------- qué se migra ----------
const motivos = { ya_migrada: 0, sin_respuesta_util: 0, sin_documento: 0, documento_invalido: 0, sin_fecha: 0 };
const pendientes = [];
let leidas = 0;
for (const { lote, fila } of filasDeLosLotes()) {
  leidas++;
  const id = String(fila.id_consulta_equifax);
  // Las ya migradas entran a la lista y se sacan DESPUÉS de elegir la más reciente de cada persona:
  // si se sacaran antes, la corrida siguiente migraría una consulta más vieja de una persona que
  // ya tiene la nueva (2026-10-31: 102 de más).
  const yaMigrada = migradas.has(id);
  const cuerpo = fila.response_json;
  // Sólo una respuesta que Equifax contestó con un reporte: el mismo criterio que laConsultaEquifaxSirve.
  if (fila.estado !== 1 || !cuerpo || typeof cuerpo !== "object" || !cuerpo.reporteCrediticio) { motivos.sin_respuesta_util++; continue; }
  const documento = persistencia.documentoDeLaRespuesta ? persistencia.documentoDeLaRespuesta(cuerpo) : cliente.documentoDeLaRespuesta(cuerpo);
  if (documento === null) { motivos.sin_documento++; continue; }
  if (!/^\d{10}$/.test(documento)) { motivos.documento_invalido++; continue; }
  const creada = fechaDeEcuador(fila.fecha_consulta) ?? fechaDeEcuador(fila.fecha_creacion);
  if (!creada) { motivos.sin_fecha++; continue; }
  pendientes.push({ lote, id, cedula: documento, creada, cuerpo: yaMigrada ? null : cuerpo, yaMigrada, tipo: fila.id_tipo_consulta ?? null, masivo: fila.masivo ?? null });
}

// Con el espacio medido (Free: 500 MB; el 2026-10-30 las 15.700 consultas con sus tablas llenaron el
// disco), se migra sólo lo que sirve: lo vigente y una por persona, la más reciente.
if (DESDE) {
  const corte = new Date(DESDE + "T00:00:00-05:00").toISOString();
  motivos.anterior_al_corte = pendientes.filter((p) => p.creada < corte).length;
  for (let i = pendientes.length - 1; i >= 0; i--) if (pendientes[i].creada < corte) pendientes.splice(i, 1);
}
if (UNA_POR_PERSONA) {
  const masNueva = new Map();
  for (const p of pendientes) {
    const previa = masNueva.get(p.cedula);
    if (!previa || p.creada > previa.creada) masNueva.set(p.cedula, p);
  }
  motivos.repetida_de_la_persona = pendientes.length - masNueva.size;
  pendientes.splice(0, pendientes.length, ...[...masNueva.values()].sort((a, b) => (a.creada < b.creada ? 1 : -1)));
}
for (let i = pendientes.length - 1; i >= 0; i--) {
  if (pendientes[i].yaMigrada) { motivos.ya_migrada++; pendientes.splice(i, 1); }
}
if (pendientes.length > MAX) pendientes.length = MAX;

console.log(`leídas de los lotes : ${leidas}`);
console.log(`a migrar            : ${pendientes.length}`);
console.log(`descartadas         : ${Object.entries(motivos).map(([k, v]) => `${k} ${v}`).join(" | ")}`);
console.log(`personas distintas  : ${new Set(pendientes.map((p) => p.cedula)).size}`);
console.log(`modo                : ${SECO ? "en seco: no se escribe nada" : "ESCRIBE en la base"}${SIN_TABLAS ? " (sin tablas)" : ""}`);

const VERSION_ESTRUCTURA = estructuraMod.EQUIFAX_ESTRUCTURA_VERSION;

// ---------- seco ----------
if (SECO) {
  let conTablas = 0, conAvisos = 0, filas = 0, falla = 0;
  const desdeHasta = pendientes.map((p) => p.creada).sort();
  for (const p of pendientes) {
    if (SIN_TABLAS) break;
    try {
      const d = tablasMod.derivarTablas(p.cuerpo);
      estructuraMod.calcularEstructura(d, { consultadoEl: p.creada, ambiente: "produccion", identidadVerificada: true });
      conTablas++;
      if (d.avisos.length) conAvisos++;
      filas += Object.values(d.tablas).reduce((a, t) => a + t.length, 0);
    } catch {
      falla++;
    }
  }
  console.log(`fechas              : ${desdeHasta[0] ?? "-"} a ${desdeHasta.at(-1) ?? "-"}`);
  if (!SIN_TABLAS) console.log(`tablas derivables   : ${conTablas} (${filas} filas, ${conAvisos} con avisos, ${falla} fallarían)`);
  console.log("\nEN SECO: no se escribió nada. Para escribir: repetir con --responsable=<uuid>.");
  process.exit(falla > 0 ? 1 : 0);
}

// ---------- escritura ----------
const ejecucion = await abrirEjecucion({ url: process.env.SUPABASE_URL, clave: process.env.SUPABASE_SERVICE_ROLE_KEY, guion: "migrar-equifax-aws" });

async function personasPorCedula(cedulas) {
  const mapa = new Map();
  const { data, error } = await db.from("clients").select("id, cedula").in("cedula", cedulas);
  if (error) throw new Error(`no se pudo buscar a las personas: ${explicar(error)}`);
  for (const f of data) mapa.set(f.cedula, f.id);
  const faltan = cedulas.filter((c) => !mapa.has(c));
  if (faltan.length > 0) {
    const { data: creadas, error: errCrear } = await db.from("clients").insert(faltan.map((cedula) => ({ cedula }))).select("id, cedula");
    if (errCrear) throw new Error(`no se pudo crear a las personas: ${explicar(errCrear)}`);
    for (const f of creadas) mapa.set(f.cedula, f.id);
  }
  return mapa;
}

let migradasAhora = 0, fallidas = 0, tablasOk = 0, tablasFallo = 0, filasDeTablas = 0;
for (let i = 0; i < pendientes.length; i += LOTE_DE_ESCRITURA) {
  const grupo = pendientes.slice(i, i + LOTE_DE_ESCRITURA);
  let personas;
  try {
    personas = await personasPorCedula([...new Set(grupo.map((p) => p.cedula))]);
  } catch (err) {
    fallidas += grupo.length;
    console.log(`[grupo ${i}] ERROR: ${err.message}`);
    continue;
  }
  const filas = grupo.map((p) => ({
    identificacion: p.cedula,
    tipo_identificacion: "C",
    client_id: personas.get(p.cedula),
    respuesta_cruda: p.cuerpo,
    http_equifax: 200,
    parametros: { migrada_de: { fuente: "aws", id_consulta_equifax: p.id, id_tipo_consulta: p.tipo, masivo: p.masivo, autorizacion: "Equifax, 2026-10-30" } },
    intentos: 1,
    requested_by: RESPONSABLE,
    origen: "lote",
    base_legal: BASE_LEGAL,
    ambiente: "produccion",
    created_at: p.creada,
  }));
  const { data: guardadas, error } = await db.from("consultas_equifax").insert(filas).select("id, client_id, identificacion, created_at, ambiente, respuesta_cruda, parametros");
  if (error) {
    fallidas += grupo.length;
    console.log(`[grupo ${i}] ERROR al guardar el crudo: ${explicar(error)}`);
    continue;
  }
  migradasAhora += guardadas.length;

  if (!SIN_TABLAS) {
    for (const g of guardadas) {
      const r = await persistencia.guardarTablasDeLaConsulta(db, g);
      if (r.ok) {
        tablasOk++;
        filasDeTablas += Object.values(r.conteos ?? {}).reduce((a, b) => a + b, 0);
      } else {
        tablasFallo++;
        console.log(`[c-${String(g.client_id).slice(0, 8)}] tablas FALLARON (${r.codigo ?? "sin código"}): ${r.mensaje ?? "sin detalle"}`);
        await db.from("audit_log").insert({
          actor: RESPONSABLE, action: "equifax.tablas.fallo", client_id: g.client_id,
          meta: { consulta_equifax_id: g.id, codigo: r.codigo ?? null, mensaje: r.mensaje ?? null, avisos: r.avisos },
        });
      }
    }
  }

  const { error: errAuditoria } = await db.from("audit_log").insert(guardadas.map((g) => ({
    actor: RESPONSABLE,
    action: "equifax.consulta",
    client_id: g.client_id,
    meta: {
      consulta_equifax_id: g.id, ambiente: "produccion", origen: "lote", transporte: "migracion_aws",
      id_consulta_aws: g.parametros.migrada_de.id_consulta_equifax, base_legal: BASE_LEGAL, identidad_verificada: true,
    },
  })));
  if (errAuditoria) console.log(`[grupo ${i}] no se pudo auditar: ${explicar(errAuditoria)}`);

  if ((i / LOTE_DE_ESCRITURA) % 20 === 19 || i + LOTE_DE_ESCRITURA >= pendientes.length) {
    console.log(`  ${Math.min(i + LOTE_DE_ESCRITURA, pendientes.length)}/${pendientes.length} | migradas ${migradasAhora} | fallidas ${fallidas}`);
  }
}

ejecucion.sumarFilas(migradasAhora + filasDeTablas);
ejecucion.anotar({ leidas, a_migrar: pendientes.length, migradas: migradasAhora, fallidas, tablas_ok: tablasOk, tablas_fallo: tablasFallo, descartadas: motivos, version_estructura: VERSION_ESTRUCTURA });
console.log(`\nTERMINADO: ${migradasAhora} migradas, ${fallidas} con error, tablas ${tablasOk} ok / ${tablasFallo} con fallo, ${filasDeTablas} filas de tablas.`);
process.exit(fallidas > 0 || tablasFallo > 0 ? 1 : 0);
