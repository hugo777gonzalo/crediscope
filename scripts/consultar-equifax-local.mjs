// Consulta personas a Equifax DESDE ESTA MÁQUINA y las persiste igual que lo
// hace la función desplegada (consultar-equifax).
//
// CADA CONSULTA SE COBRA y Equifax no pone tope (negocio, 2026-10-12). Por eso
// este guion se comporta distinto de los de Novadata y Aval:
//
//   - POR DEFECTO SOLO SIMULA: valida, mira si hay una consulta vigente que se
//     reutilizaría, mide el consumo del día contra el tope... y no llama a
//     Equifax. Para cobrar hay que pasar --ejecutar.
//   - Un máximo de 2 identificaciones por corrida. Más exige --autorizo=<n>,
//     con el n que el negocio autorizó (la prueba de 20 del paso 10).
//   - Una a la vez, sin concurrencia: no hay ninguna razón para apurar un
//     gasto.
//   - El crudo se escribe en un archivo ANTES de interpretarlo: una respuesta
//     cobrada no se pierde por un error nuestro después.
//
// UNA SOLA IMPLEMENTACIÓN: el recorrido (reutilizar, topar, consultar, guardar,
// auditar) es _shared/equifax-persistencia.ts, el mismo que usa la función.
// Node 24 ejecuta TypeScript borrando los tipos; lo único que falta es
// `Deno.env`, que se puentea a `process.env` ANTES de importar.
//
// QUÉ SE IMPRIME: nunca una cédula, un nombre ni un valor de la respuesta. Se
// identifica a cada persona por su código c-xxxxxxxx (los 8 primeros
// caracteres de clients.id) y de la respuesta se muestra sólo la FORMA:
// nombres de campos y tamaños.
//
// Uso:
//   node scripts/consultar-equifax-local.mjs --probar-conexion
//       Pide un token y nada más. No consulta a nadie y no cuesta.
//   node scripts/consultar-equifax-local.mjs --caso=c-xxxxxxxx --responsable=<uuid> --base-legal="..."
//       Simula. Muestra qué haría.
//   node scripts/consultar-equifax-local.mjs --caso=c-xxxxxxxx --responsable=<uuid> --base-legal="..." --ejecutar
//       Consulta de verdad (y cobra).
//
//   --caso=a,b         personas de la cartera por su código (se resuelven en la base)
//   --archivo=<ruta>   cédulas, una por línea (para lotes autorizados)
//   --responsable=<uuid de profiles>   quién se hace cargo de la corrida
//   --base-legal="..." contrato o base legal (10 caracteres o más)
//   --forzar           ignora la consulta vigente y vuelve a pagar
//   --autorizo=<n>     autoriza hasta n identificaciones en esta corrida
//   --sin-commit       permite correr con cambios sin guardar en git (queda anotado)

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";
import { cargarEntorno, carpetaDeResearch } from "./_comun/entorno.mjs";
import { explicar, personaDelCaso } from "./_comun/casos.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const TOPE_SIN_AUTORIZACION = 2;

const args = process.argv.slice(2);
const bandera = (n) => args.includes(`--${n}`);
const valor = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

function morir(...lineas) {
  console.error(lineas.join("\n"));
  process.exit(1);
}

cargarEntorno(RAIZ);
// El puente para que los módulos de la función corran en Node. Tiene que
// existir ANTES de importarlos.
globalThis.Deno = { env: { get: (k) => process.env[k] } };
const compartido = new URL("../supabase/functions/_shared/", import.meta.url).href;
const cliente = await import(compartido + "equifax-client.ts");
const persistencia = await import(compartido + "equifax-persistencia.ts");
const { clasificarIdentificacion } = await import(compartido + "identificacion.ts");

// ---------- prueba de conexión ----------
if (bandera("probar-conexion")) {
  console.log(`ambiente Equifax : ${cliente.ambienteEquifax()} (${new URL(process.env.EQUIFAX_BASE_URL ?? "https://api.latam.equifax.com").host})`);
  const r = await cliente.probarConexion();
  console.log(r.ok ? `conexión OK en ${r.duracionMs} ms (se pidió un token; no se consultó a nadie).` : `conexión FALLÓ (${r.familia ?? "?"}${r.httpEquifax ? `, HTTP ${r.httpEquifax}` : ""}): ${r.mensaje}`);
  process.exit(r.ok ? 0 : 1);
}

// ---------- parámetros de la corrida ----------
const EJECUTAR = bandera("ejecutar");
const FORZAR = bandera("forzar");
const RESPONSABLE = valor("responsable");
const BASE_LEGAL = (valor("base-legal") ?? "").trim();
const AUTORIZO = Number(valor("autorizo") ?? 0);

for (const clave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[clave]) morir(`Falta ${clave} en .env.functions.`);
}
const faltan = cliente.faltantesDeConfiguracion();
if (faltan.length) morir(`Equifax no está configurado: faltan ${faltan.join(", ")} en .env.functions.`);

if (!/^[0-9a-f-]{36}$/i.test(RESPONSABLE ?? "")) {
  morir(
    "Falta el responsable de esta corrida (--responsable=<uuid de profiles>).",
    "Queda grabado en cada consulta y en el registro de auditoría: sin responsable no hay consulta auditable.",
  );
}
if (BASE_LEGAL.length < 10) morir('Falta la base legal (--base-legal="...", al menos 10 caracteres): queda en la auditoría de cada persona.');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function resolverPersonas() {
  const personas = [];
  for (const codigo of (valor("caso") ?? "").split(",").map((c) => c.trim()).filter(Boolean)) {
    personas.push({ etiqueta: codigo, cedula: (await personaDelCaso(db, codigo)).cedula });
  }
  const archivo = valor("archivo");
  if (archivo) {
    const cedulas = fs.readFileSync(path.resolve(archivo), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\d{10}$/.test(l));
    for (const c of new Set(cedulas)) personas.push({ etiqueta: `persona-${personas.length + 1}`, cedula: c });
  }
  return personas;
}

const personas = await resolverPersonas().catch((e) => morir(`No se pudo resolver a quién consultar: ${e.message}`));
if (personas.length === 0) morir("No hay a quién consultar: pasar --caso=c-xxxxxxxx o --archivo=<ruta>.");
if (new Set(personas.map((p) => p.cedula)).size !== personas.length) morir("Hay una persona repetida en la lista.");

const permitidas = Math.max(TOPE_SIN_AUTORIZACION, AUTORIZO);
if (personas.length > permitidas) {
  morir(
    `Son ${personas.length} personas y sin autorización el máximo por corrida es ${TOPE_SIN_AUTORIZACION}.`,
    "Cada consulta se cobra. Si el negocio autorizó más, pasar --autorizo=<n> con ese número.",
  );
}

const carpetaCrudo = carpetaDeResearch(RAIZ, "equifax", "crudo");

// La FORMA de una respuesta: nombres de campos, tipos y tamaños. Nunca valores.
function forma(valorJson, ruta = "", profundidad = 0, salida = []) {
  if (salida.length >= 120) return salida;
  if (Array.isArray(valorJson)) {
    salida.push(`${ruta || "(raíz)"}[] n=${valorJson.length}`);
    const primero = valorJson.find((x) => x && typeof x === "object");
    if (primero && profundidad < 4) forma(primero, `${ruta}[]`, profundidad + 1, salida);
  } else if (valorJson && typeof valorJson === "object") {
    for (const [k, v] of Object.entries(valorJson)) {
      const r = ruta ? `${ruta}.${k}` : k;
      if (v && typeof v === "object") {
        if (Array.isArray(v)) forma(v, r, profundidad + 1, salida);
        else { salida.push(`${r}{} ${Object.keys(v).length} campos`); if (profundidad < 4) forma(v, r, profundidad + 1, salida); }
      } else {
        salida.push(`${r}: ${v === null ? "null" : typeof v}`);
      }
    }
  }
  return salida;
}

// ---------- resumen previo ----------
const ambiente = cliente.ambienteEquifax();
console.log(`ambiente Equifax : ${ambiente}`);
console.log(`personas         : ${personas.length} (${personas.map((p) => p.etiqueta).join(", ")})`);
console.log(`modo             : ${EJECUTAR ? "EJECUTAR — CADA CONSULTA SE COBRA" : "simulación: no se llama a Equifax"}${FORZAR ? " | FORZAR (ignora la vigente)" : ""}`);
console.log(`parámetros       : de relleno (tipoProducto ${cliente.PARAMETROS_DE_RELLENO.tipoProducto}, monto ${cliente.PARAMETROS_DE_RELLENO.monto}, plazo ${cliente.PARAMETROS_DE_RELLENO.plazo}); sin datos del cónyuge`);
console.log(`responsable      : ${RESPONSABLE.slice(0, 8)}…  | tope diario: ${persistencia.topeDiario()}`);

const ejecucion = EJECUTAR
  ? await abrirEjecucion({ url: process.env.SUPABASE_URL, clave: process.env.SUPABASE_SERVICE_ROLE_KEY, guion: "consultar-equifax-local" })
  : null;

let pagadas = 0, reutilizadas = 0, rechazadas = 0;
for (const persona of personas) {
  const t0 = Date.now();
  let archivoCrudo = null;
  try {
    const r = await persistencia.procesarConsultaEquifax({
      db,
      cedula: (() => {
        const ident = clasificarIdentificacion(persona.cedula);
        if (!ident.consultable) throw new Error(ident.mensaje);
        return ident.cedula;
      })(),
      actorId: RESPONSABLE,
      baseLegal: BASE_LEGAL,
      origen: personas.length > 1 ? "lote" : "consulta",
      forzar: FORZAR,
      simular: !EJECUTAR,
      transporte: {
        tipo: "local",
        motivo: "se consulta desde una IP de Ecuador mientras no se compruebe que Equifax deja pasar a las Edge Functions",
        guion: "scripts/consultar-equifax-local.mjs",
      },
      // El crudo a disco ANTES de interpretar nada.
      alRecibir: (resp) => {
        const nombre = `${persona.etiqueta}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        archivoCrudo = path.join(carpetaCrudo, nombre);
        fs.writeFileSync(archivoCrudo, JSON.stringify({
          capturadoEl: new Date().toISOString(), etiqueta: persona.etiqueta, status: resp.status, familia: resp.familia,
          httpEquifax: resp.httpEquifax ?? null, cabeceras: resp.cabeceras ?? null, parametros: resp.parametros ?? null,
          cuerpo: resp.cuerpo ?? null, detalleTecnico: resp.detalleTecnico ?? null,
        }, null, 2));
      },
    });

    const seg = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.resultado === "simulada") {
      console.log(`[${persona.etiqueta}] SIMULADA | ${r.reutilizaria ? "se reutilizaría la consulta vigente (no se pagaría)" : "se pagaría una consulta nueva"} | consumo de hoy ${r.consultasHoy}/${r.tope}`);
    } else if (r.resultado === "reutilizada") {
      reutilizadas++;
      console.log(`[${persona.etiqueta}] REUTILIZADA | vigente hasta ${r.vigenteHasta} | no se pagó`);
    } else if (r.resultado === "consultada") {
      pagadas++;
      const tam = (JSON.stringify(r.fila.respuesta_cruda).length / 1024).toFixed(1);
      console.log(`[${persona.etiqueta}] CONSULTADA | HTTP ${r.fila.http_equifax} | ${seg} s | ${tam} KB | fila ${r.fila.id.slice(0, 8)} | vigente hasta ${r.vigenteHasta}`);
      console.log(`  crudo en disco: ${path.relative(path.dirname(carpetaCrudo), archivoCrudo)}`);
      // Las tablas se derivan del crudo ya guardado: si fallan, la consulta no se pierde (se rehacen sin pagar).
      console.log(r.tablas.ok
        ? `  tablas: hechas (${Object.values(r.tablas.conteos ?? {}).reduce((a, b) => a + b, 0)} filas en ${Object.keys(r.tablas.conteos ?? {}).length} tablas)${r.tablas.avisos.length ? ` | ${r.tablas.avisos.length} aviso(s) al descomponer` : ""}`
        : `  tablas: NO SE PUDIERON HACER (${r.tablas.codigo ?? "sin código"}: ${r.tablas.mensaje ?? "sin detalle"}). El crudo está guardado: rehacerlas con scripts/cargar-tablas-equifax.mjs.`);
      console.log("  forma de la respuesta (sólo nombres y tamaños):");
      for (const linea of forma(r.fila.respuesta_cruda)) console.log("    " + linea);
    } else {
      rechazadas++;
      console.log(`[${persona.etiqueta}] RECHAZADA (${r.motivo}) | HTTP ${r.http} | ${r.error}${r.respuesta?.puedeHaberCobrado ? " | PUDO HABERSE COBRADO" : ""}`);
      if (archivoCrudo) console.log(`  lo recibido quedó en disco: ${path.relative(path.dirname(carpetaCrudo), archivoCrudo)}`);
      // Una falla que pudo cobrarse corta la corrida: seguir con la siguiente persona sólo suma gasto sin entender.
      if (r.respuesta?.puedeHaberCobrado || r.motivo === "tope_diario" || r.motivo === "proveedor_apagado" || r.motivo === "equifax_no_responde") {
        console.log("Se corta la corrida: no se sigue consultando hasta entender qué pasó.");
        break;
      }
    }
  } catch (err) {
    rechazadas++;
    console.log(`[${persona.etiqueta}] ERROR | ${explicar(err)}`);
    break;
  }
}

ejecucion?.sumarFilas(pagadas);
ejecucion?.anotar({ pagadas, reutilizadas, rechazadas, personas: personas.length });
console.log(`\n${EJECUTAR ? "TERMINADO" : "SIMULACIÓN TERMINADA"}: ${pagadas} pagadas, ${reutilizadas} reutilizadas, ${rechazadas} rechazadas.`);
if (!EJECUTAR) console.log("No se llamó a Equifax. Para consultar de verdad: repetir con --ejecutar.");
process.exit(rechazadas > 0 ? 1 : 0);
