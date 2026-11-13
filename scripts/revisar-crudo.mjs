// La revisión de datos que necesita el crudo de Proveedor_Info_1: corre
// DETECTORES_DEL_CRUDO de scripts/revision-de-datos/detectores.mjs sobre el
// último perfil de cada persona real (habilidad `revision-de-datos`).
//
// Nació con la revisión del análisis del 2026-11-06: el bloqueo por la demanda
// penal de otra persona (p1) y el hipotecario del BIESS contado dos veces (p6)
// no dejan rastro en el perfil guardado, que ya trae el dato mezclado. Medirlos
// con SQL era imposible; a mano, persona por persona, salieron del piloto.
//
// SOLO LEE: client_profiles por PostgREST y el crudo de la carpeta local o del
// depósito. No llama al modelo, a Proveedor_Info_1 ni a Equifax. No cuesta.
//
// Escribe en research/revision-de-datos/ (fuera de git, lleva montos de
// personas) `crudo-AAAA-MM-DD-HHMMSS.json`, con cada caso de cada detector; por
// consola, conteos y referencias c-xxxxxxxx, nunca una cédula.
//
// Sale con 1 si un detector de tipo "regresion" encuentra algún caso.
//
// Uso:
//   node scripts/revisar-crudo.mjs [--solo=id,id] [--carpeta=research/proveedor-info-1-raw-2026-10-03]
//   node scripts/revisar-crudo.mjs --listar
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo
// con --solo=<un id> y abrir el JSON antes de confiar en los conteos.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { candidatosDelUltimoPerfil, leerCrudo } from "./_comun/crudo-del-ultimo-perfil.mjs";
import { cargarEntorno, carpetaDeResearch, raizPrincipal } from "./_comun/entorno.mjs";
import { CAPAS, DETECTORES_DEL_CRUDO } from "./revision-de-datos/detectores.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const solo = typeof args.solo === "string" ? new Set(args.solo.split(",")) : null;
const elegidos = DETECTORES_DEL_CRUDO.filter((d) => !solo || solo.has(d.id));
if (solo) for (const id of solo) if (!DETECTORES_DEL_CRUDO.some((d) => d.id === id)) console.error(`No existe el detector «${id}».`);
if (!elegidos.length) {
  console.error("Ningún detector elegido.");
  process.exit(1);
}
if (args.listar) {
  for (const d of elegidos) console.log(`${d.id} [${d.capa}, ${d.tipo}]: ${d.titulo}`);
  process.exit(0);
}

const PRINCIPAL = raizPrincipal(RAIZ);
const CARPETA = path.resolve(PRINCIPAL, typeof args.carpeta === "string" ? args.carpeta : "research/proveedor-info-1-raw-2026-10-03");
// Los secretos se leen del archivo y no se imprimen.
cargarEntorno(RAIZ);
const URL_BASE = process.env.SUPABASE_URL;
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cabeceras = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` };
// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function pedir(ruta) {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: cabeceras });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
  return JSON.parse(texto);
}

// Sólo personas reales: las 240 sintéticas de Aval no cuentan (118).
const sinteticas = new Set();
for (let despues = null; ; ) {
  const filas = await pedir(`clients?select=id&es_sintetico=eq.true&order=id&limit=1000${despues ? `&id=gt.${despues}` : ""}`);
  for (const f of filas) sinteticas.add(f.id);
  if (filas.length < 1000) break;
  despues = filas.at(-1).id;
}
// El último perfil de cada persona, por clave y hasta una página vacía (con
// `offset` la consulta pasó el límite de la base, recalcular-grupos.mjs).
const ultimoPorCliente = new Map();
for (let despues = null; ; ) {
  const filas = await pedir(`client_profiles?select=id,client_id,created_at,crudo_ruta&order=id&limit=1000${despues ? `&id=gt.${despues}` : ""}`);
  for (const p of filas) {
    if (sinteticas.has(p.client_id)) continue;
    const a = ultimoPorCliente.get(p.client_id);
    if (!a || p.created_at > a.created_at) ultimoPorCliente.set(p.client_id, p);
  }
  if (filas.length === 0) break;
  despues = filas.at(-1).id;
}
const { candidatos, cuenta } = candidatosDelUltimoPerfil(CARPETA, ultimoPorCliente);
const clientePorPerfil = new Map([...ultimoPorCliente.values()].map((p) => [p.id, p.client_id]));

const resultado = Object.fromEntries(elegidos.map((d) => [d.id, { capa: d.capa, tipo: d.tipo, titulo: d.titulo, poblacion: 0, casos: [], errores: 0 }]));
let leidas = 0;
const noReproducen = [];
for (let i = 0; i < candidatos.length; i += 50) {
  const lote = candidatos.slice(i, i + 50);
  const filas = await pedir(`client_profiles?id=in.(${lote.map((c) => c.perfilId).join(",")})&select=id,standard_profile,control_bloqueo`);
  const porId = new Map(filas.map((f) => [f.id, f]));
  // El depósito, de a varios a la vez; la carpeta es local.
  const crudos = await Promise.all(lote.map((c) => leerCrudo(c, URL_BASE, cabeceras).catch((e) => ({ error: e.message }))));
  lote.forEach((candidato, j) => {
    const crudo = crudos[j];
    const fila = porId.get(candidato.perfilId);
    if (crudo.error || !fila) return void noReproducen.push(`p-${candidato.perfilId.slice(0, 8)}: ${crudo.error ?? "sin fila"}`);
    // Un crudo de otra consulta no es el de este perfil.
    if (crudo.perfilId !== candidato.perfilId) return void noReproducen.push(`p-${candidato.perfilId.slice(0, 8)}: el crudo es de otro perfil`);
    leidas++;
    const contexto = { raw: crudo.raw, cedula: crudo.cedula, capturadoEl: crudo.capturadoEl, perfil: fila.standard_profile, bloqueo: fila.control_bloqueo };
    const cliente = clientePorPerfil.get(candidato.perfilId);
    for (const d of elegidos) {
      const r = resultado[d.id];
      try {
        if (!d.aplica(contexto)) continue;
        r.poblacion++;
        const detalle = d.detectar(contexto);
        if (detalle) r.casos.push({ cliente, detalle });
      } catch (e) {
        r.errores++;
        if (r.errores <= 3) console.error(`${d.id} falló en c-${cliente.slice(0, 8)}: ${e.message}`);
      }
    }
  });
}

const carpeta = carpetaDeResearch(RAIZ, "revision-de-datos");
// Hora de Ecuador (UTC-5, sin horario de verano) en el nombre del archivo.
const ahora = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
const nombre = `crudo-${ahora.slice(0, 10)}-${ahora.slice(11, 13)}${ahora.slice(14, 16)}${ahora.slice(17, 19)}.json`;
fs.writeFileSync(path.join(carpeta, nombre), JSON.stringify({ corrida: new Date().toISOString(), carpeta: path.relative(PRINCIPAL, CARPETA), cuenta, leidas, resultado }, null, 1));

const miles = (n) => n.toLocaleString("es-EC");
console.log(`Personas reales con último perfil: ${miles(ultimoPorCliente.size)}. Crudos leídos: ${miles(leidas)} (carpeta ${miles(cuenta.enLaCarpeta)}, depósito ${miles(cuenta.delDeposito)}, sin crudo ${miles(cuenta.sinCrudo)}, no se pudieron leer ${miles(noReproducen.length)}).`);
let regresiones = 0;
for (const [capa, nombreCapa] of Object.entries(CAPAS)) {
  const deLaCapa = elegidos.filter((d) => d.capa === capa);
  if (!deLaCapa.length) continue;
  console.log(`\n${nombreCapa}`);
  for (const d of deLaCapa) {
    const r = resultado[d.id];
    const n = r.casos.length;
    const estado = r.poblacion === 0 ? "no medido (población vacía)" : `${miles(n)} de ${miles(r.poblacion)}`;
    const marca = d.tipo === "regresion" && n > 0 ? "VOLVIÓ " : "";
    if (marca) regresiones++;
    const ejemplos = r.casos.slice(0, 3).map((c) => `c-${c.cliente.slice(0, 8)}`).join(", ");
    console.log(`  ${marca}${d.id} [${d.tipo}]: ${estado}${ejemplos ? `. Ej.: ${ejemplos}` : ""}${r.errores ? ` (${miles(r.errores)} con error)` : ""}`);
    if (n && d.conocido) console.log(`      conocido: ${d.conocido}`);
  }
}
console.log(`\nDetalle: ${path.join(carpeta, nombre)}`);
if (regresiones) {
  console.log(`${regresiones} ${regresiones === 1 ? "regresión volvió" : "regresiones volvieron"}: un error corregido apareció otra vez.`);
  process.exit(1);
}
