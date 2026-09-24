// Consulta un lote de identificaciones al buró Aval DESDE ESTA MÁQUINA y las
// persiste igual que lo haría la función desplegada.
//
// POR QUÉ EXISTE ESTE GUION
//
// El WAF de Aval (Akamai) responde 403 "Access Denied" a la IP de salida de
// las Edge Functions, que egresan global. Con el User-Agent ya corregido
// (commit 0214f26) la misma petición pasa desde una IP ecuatoriana y falla
// desde Supabase — referencia Akamai del rechazo: 18.4d0f3417.1790051995.aaf11bc.
// Mientras Aval no habilite el egreso de Supabase, la única forma de consultar
// es salir desde acá. Este guion es ese puente, no el camino definitivo: cuando
// Aval habilite la IP, `consultar-aval` hace lo mismo sin intermediarios y este
// archivo se borra.
//
// UNA SOLA IMPLEMENTACIÓN, NUNCA UNA COPIA
//
// No reimplementa nada: importa los mismos `_shared/*.ts` que corre la función
// desplegada (aval-client, aval-perfil, aval-estructura, aval-vigencia,
// identificacion). Node 24 ejecuta TypeScript borrando los tipos; lo único que
// falta es `Deno.env`, que se puentea a `process.env` ANTES de importar —
// aval-client.ts lee sus variables en el tope del módulo, así que el puente
// tiene que estar puesto antes, y por eso los imports son dinámicos y no
// estáticos (los estáticos se evalúan primero y el puente llegaría tarde).
// Copiar la lógica acá es como aparecen las diferencias silenciosas entre lo
// que valida la función y lo que valida el guion.
//
// QUÉ ESCRIBE, Y QUÉ NO DISIMULA
//
// La fila de `consultas_aval` queda idéntica a la de una consulta normal, para
// que la aplicación no tenga que saber nada de esto. Pero el registro de
// auditoría SÍ dice la verdad: `meta.transporte = 'local'` con el motivo. Que
// la aplicación no distinga no significa que la auditoría no pueda: quien
// mañana pregunte de dónde salieron estas consultas tiene que poder saberlo.
//
// Uso:
//   node scripts/consultar-aval-local.mjs <archivo> <uuid-responsable> [opciones]
//
//   --concurrencia=N   pedidos en paralelo (default 4)
//   --origen=consulta|lote   qué se graba en consultas_aval.origen (default consulta)
//   --forzar           ignora la consulta vigente y vuelve a consultar (cuesta)
//   --seco             consulta y muestra, pero NO persiste nada
//
// El uuid sale de la tabla profiles: es quien se hace cargo de la corrida. Sin
// responsable no arranca, por la misma razón que consultar-lote.mjs — la
// auditoría del 2026-09-16 encontró 2.637 consultas a datos sensibles sin poder
// decir quién las ordenó.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const RAIZ = path.resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const posicionales = args.filter((a) => !a.startsWith("--"));
const bandera = (nombre) => args.find((a) => a === `--${nombre}`) !== undefined;
const valor = (nombre, def) => {
  const hit = args.find((a) => a.startsWith(`--${nombre}=`));
  return hit ? hit.slice(nombre.length + 3) : def;
};

const ARCHIVO = posicionales[0];
const RESPONSABLE = posicionales[1];
const CONCURRENCIA = Number(valor("concurrencia", "4"));
const ORIGEN = valor("origen", "consulta");
const FORZAR = bandera("forzar");
const SECO = bandera("seco");

function morir(...lineas) {
  console.error(lineas.join("\n"));
  process.exit(1);
}

if (!ARCHIVO || !fs.existsSync(path.resolve(ARCHIVO))) {
  morir(
    "Falta el archivo de identificaciones (una por línea).",
    "",
    "  node scripts/consultar-aval-local.mjs <archivo> <uuid-responsable> [opciones]",
  );
}
// Sin responsable no arranca: es lo que separa una consulta auditable de
// doscientas consultas anónimas a datos de personas reales.
if (!/^[0-9a-f-]{36}$/i.test(RESPONSABLE ?? "")) {
  morir(
    "Falta el responsable de esta corrida (uuid de profiles).",
    "",
    "  node scripts/consultar-aval-local.mjs <archivo> <uuid-responsable> [opciones]",
    "",
    "Queda grabado en consultas_aval.requested_by y en el registro de auditoría",
    "de cada persona consultada.",
  );
}
if (ORIGEN !== "consulta" && ORIGEN !== "lote") {
  morir(`--origen tiene que ser 'consulta' o 'lote' (vino '${ORIGEN}'): es un check de la tabla.`);
}

// ---------- entorno ----------
// Mismo patrón que consultar-lote.mjs: los secretos se leen del archivo y no
// se imprimen nunca.
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

for (const clave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "AVAL_USUARIO", "AVAL_CLAVE"]) {
  if (!process.env[clave]) morir(`Falta ${clave} en .env.functions.`);
}

// El ambiente no se declara a mano: sale del host al que se está apuntando, así
// que no se puede etiquetar mal por descuido. api-test devuelve el archivo
// financiero vacío y, para algunas cédulas, los datos de OTRA persona -- ver la
// migración 079. Una fila marcada 'prueba' no sirve para calificar a nadie.
const HOST_AVAL = new URL(process.env.AVAL_BASE_URL ?? "https://api-test.avalburo.com").host;
const AMBIENTE = HOST_AVAL.includes("api-test") ? "prueba" : "produccion";

// El puente para que los módulos de la función corran en Node. Tiene que
// existir ANTES de importarlos.
globalThis.Deno = { env: { get: (k) => process.env[k] } };

const compartido = new URL("../supabase/functions/_shared/", import.meta.url).href;
const { consultarAval, laConsultaAvalSirve, porQueNoSirveAval } = await import(compartido + "aval-client.ts");
const { construirPerfilAval, PERFIL_AVAL_VERSION } = await import(compartido + "aval-perfil.ts");
const { construirEstructuraAval, AVAL_ESTRUCTURA_VERSION } = await import(compartido + "aval-estructura.ts");
const { estaVigenteAval } = await import(compartido + "aval-vigencia.ts");
const { clasificarIdentificacion } = await import(compartido + "identificacion.ts");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Un error de PostgREST no es un Error: es un objeto plano, y String(err) lo
// aplasta a "[object Object]" dejando el motivo guardado inservible.
function explicar(err) {
  if (!err) return null;
  if (err instanceof Error) return err.message;
  const partes = [err.message, err.details, err.hint, err.code].filter(Boolean);
  return partes.length ? partes.join(" | ") : JSON.stringify(err);
}

const SALIDA = path.join(RAIZ, "research", `aval-local-${path.basename(ARCHIVO).replace(/\.[^.]+$/, "")}.jsonl`);

function leerIdentificaciones() {
  const crudas = fs.readFileSync(path.resolve(ARCHIVO), "utf8")
    .split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\d{10}$/.test(l));
  return [...new Set(crudas)];
}

// Lo ya hecho. Solo cuentan los éxitos: una que falló se reintenta, porque la
// causa pudo ser pasajera.
function leerHechas() {
  if (!fs.existsSync(SALIDA)) return new Set();
  const hechas = new Set();
  for (const linea of fs.readFileSync(SALIDA, "utf8").split(/\r?\n/)) {
    if (!linea.trim()) continue;
    try { const r = JSON.parse(linea); if (r.ok) hechas.add(r.identificacion); }
    catch { /* línea a medio escribir de una corrida cortada */ }
  }
  return hechas;
}

/**
 * Mismo recorrido que consultar-aval/index.ts: validar -> reutilizar ->
 * consultar -> gate -> perfil + estructura -> cliente -> persistir -> auditar.
 */
async function unaIdentificacion(ingresado) {
  const t0 = Date.now();

  // Misma validación que Novadata: un RUC de persona natural se reduce a su
  // cédula, y lo que no es persona natural se rechaza antes de gastar una
  // consulta (en producción, factura).
  const ident = clasificarIdentificacion(ingresado);
  if (!ident.consultable) {
    return { identificacion: ingresado, ok: false, motivo: "identificacion", error: ident.mensaje };
  }
  const cedula = ident.cedula;

  // Reutilización: Aval publica el 18 y el 18 caduca todo. Si hay una consulta
  // vigente no se vuelve a pagar.
  if (!FORZAR) {
    const { data: previa, error: errPrevia } = await db.from("consultas_aval")
      .select("id, created_at").eq("identificacion", cedula).eq("tipo_identificacion", "C")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (errPrevia) return { identificacion: cedula, ok: false, motivo: "base", error: explicar(errPrevia) };
    if (previa && estaVigenteAval(previa.created_at)) {
      return { identificacion: cedula, ok: true, reutilizada: true, consultaId: previa.id, segundos: 0 };
    }
  }

  const r = await consultarAval(cedula, "C");

  // Solo un A200 deja fila. Todo lo demás se anota pero no se guarda: sería el
  // perfil-en-blanco que el 2026-09-15 convirtió una caída de red en un juicio
  // sobre 373 personas.
  if (!laConsultaAvalSirve(r)) {
    if (!SECO) {
      await db.from("audit_log").insert({
        actor: RESPONSABLE,
        action: "aval.consulta.fallo",
        meta: {
          identificacion: cedula, familia: r.familia, codigo: r.codigo ?? null,
          intentos: r.intentos, agotoReintentos: r.agotoReintentos ?? false,
          duracion_ms: r.duracionMs, mensaje: porQueNoSirveAval(r),
          http_aval: r.httpAval ?? null, detalle_tecnico: r.errorMessage ?? null,
          transporte: "local",
        },
      });
    }
    return {
      identificacion: cedula, ok: false, motivo: r.familia, codigo: r.codigo ?? null,
      httpAval: r.httpAval ?? null, intentos: r.intentos,
      error: r.errorMessage ?? porQueNoSirveAval(r),
      segundos: Math.round((Date.now() - t0) / 1000),
    };
  }

  const sobre = { responseCode: r.codigo, transactionNumber: r.transactionNumber, result: r.result };
  const perfil = construirPerfilAval(r.result ?? {}, cedula);
  const estructura = construirEstructuraAval(sobre);

  const comun = {
    identificacion: cedula, ok: true, reutilizada: false, intentos: r.intentos,
    nombre: perfil.resumen.nombre ?? null, score: perfil.resumen.score ?? null,
    totalDeuda: perfil.resumen.totalDeuda ?? null,
    segmentos: Object.keys(r.result ?? {}).length,
    segundos: Math.round((Date.now() - t0) / 1000),
  };
  if (SECO) return { ...comun, seco: true };

  // Enlace blando a la persona del registro común, igual que la función.
  let clientId = null;
  const { data: existente, error: errBuscar } = await db.from("clients").select("id").eq("cedula", cedula).maybeSingle();
  if (errBuscar) return { ...comun, ok: false, motivo: "base", error: explicar(errBuscar) };
  if (existente) {
    clientId = existente.id;
  } else {
    const { data: creado, error: errCrear } = await db.from("clients").insert({ cedula }).select("id").single();
    if (errCrear) return { ...comun, ok: false, motivo: "base", error: explicar(errCrear) };
    clientId = creado.id;
  }

  const { data: guardado, error: errGuardar } = await db.from("consultas_aval").insert({
    identificacion: cedula, tipo_identificacion: "C", client_id: clientId,
    respuesta_cruda: { responseCode: r.codigo, message: r.mensaje, transactionNumber: r.transactionNumber, result: r.result },
    perfil, perfil_version: PERFIL_AVAL_VERSION,
    estructura, estructura_version: AVAL_ESTRUCTURA_VERSION,
    response_code: r.codigo, transaction_number: r.transactionNumber,
    score: perfil.resumen.score, total_deuda: perfil.resumen.totalDeuda,
    num_tarjetas_vigentes: perfil.resumen.numTarjetasVigentes,
    consultas_12m: perfil.resumen.consultas12Meses, tasa_malos: perfil.resumen.tasaMalos,
    nombre_sujeto: perfil.resumen.nombre, duracion_ms: r.duracionMs,
    requested_by: RESPONSABLE, origen: ORIGEN, ambiente: AMBIENTE,
  }).select("id").single();
  if (errGuardar) return { ...comun, ok: false, motivo: "base", error: explicar(errGuardar) };

  await db.from("audit_log").insert({
    actor: RESPONSABLE, action: "aval.consulta", client_id: clientId,
    meta: {
      consulta_aval_id: guardado.id, identificacion: cedula,
      intentos: r.intentos, duracion_ms: r.duracionMs, ambiente: AMBIENTE,
      // La fila de consultas_aval es igual a la de una consulta normal para que
      // la aplicación no tenga que saber de esto; la auditoría sí lo dice.
      transporte: "local",
      motivo_transporte: "el WAF de Aval rechaza con 403 la IP de salida de las Edge Functions; se consulta desde una IP ecuatoriana",
      guion: "scripts/consultar-aval-local.mjs",
    },
  });

  return { ...comun, consultaId: guardado.id };
}

async function main() {
  const todas = leerIdentificaciones();
  const hechas = leerHechas();
  const pendientes = todas.filter((c) => !hechas.has(c));

  console.log(`archivo        : ${ARCHIVO}`);
  console.log(`ambiente Aval  : ${HOST_AVAL} -> ${AMBIENTE} (producto ${process.env.AVAL_CODIGO_PRODUCTO ?? "D1360"})`);
  if (AMBIENTE === "prueba") {
    console.log("                 OJO: datos ficticios. Sirve para medir poblamiento y tiempos, no para calificar.");
  }
  console.log(`identificaciones: ${todas.length} únicas | ya hechas: ${hechas.size} | por consultar: ${pendientes.length}`);
  console.log(`concurrencia   : ${CONCURRENCIA} | origen: ${ORIGEN}${FORZAR ? " | FORZAR" : ""}${SECO ? " | SECO (no persiste)" : ""}`);
  console.log(`salida         : ${SALIDA}`);
  if (pendientes.length === 0) return console.log("No queda nada por consultar.");

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  const salida = SECO ? null : fs.createWriteStream(SALIDA, { flags: "a" });
  const arranque = Date.now();
  let siguiente = 0, listas = 0, fallidas = 0, reutilizadas = 0;
  const intentosTotales = [];
  const porMotivo = new Map();

  async function trabajador() {
    while (true) {
      const i = siguiente++;
      if (i >= pendientes.length) return;
      let r;
      try {
        r = await unaIdentificacion(pendientes[i]);
      } catch (err) {
        // Una identificación que explota no puede abortar las otras 199.
        r = { identificacion: pendientes[i], ok: false, motivo: "excepcion", error: explicar(err) };
      }
      r.fin = new Date().toISOString();
      salida?.write(JSON.stringify(r) + "\n");
      listas++;
      if (!r.ok) { fallidas++; porMotivo.set(r.motivo, (porMotivo.get(r.motivo) ?? 0) + 1); }
      if (r.reutilizada) reutilizadas++;
      if (r.intentos) intentosTotales.push(r.intentos);

      if (listas % 10 === 0 || listas === pendientes.length) {
        const min = (Date.now() - arranque) / 60000;
        const ritmo = listas / min;
        const restan = (pendientes.length - listas) / Math.max(ritmo, 0.01);
        console.log(`${listas}/${pendientes.length} | ${fallidas} fallidas | ${ritmo.toFixed(1)}/min | faltan ~${Math.round(restan)} min`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, trabajador));
  salida?.end();

  const min = ((Date.now() - arranque) / 60000).toFixed(1);
  console.log(`\nTERMINADO en ${min} min: ${listas - fallidas} guardadas (${reutilizadas} reutilizadas), ${fallidas} fallidas.`);
  if (porMotivo.size) {
    console.log("fallos por motivo:", [...porMotivo].map(([m, n]) => `${m}=${n}`).join(", "));
  }
  // Cuántos intentos necesitó cada consulta exitosa. En la prueba de humo del
  // 2026-09-23 una consulta que terminó en A200 necesitó 3 intentos: los dos
  // primeros fallaron como transitorios. Si eso es la norma y no la excepción,
  // el conector está pagando tres viajes por consulta y hay que decirlo.
  if (intentosTotales.length) {
    const uno = intentosTotales.filter((n) => n === 1).length;
    const prom = (intentosTotales.reduce((a, b) => a + b, 0) / intentosTotales.length).toFixed(2);
    console.log(`intentos: promedio ${prom} | al primer intento ${uno}/${intentosTotales.length}`);
  }
}

main().catch((err) => {
  console.error("La corrida se detuvo:", explicar(err));
  process.exit(1);
});
