// Publica un modelo del predictor de ingresos en una base: sube el archivo al
// depósito privado `modelos-de-ingreso` y crea su fila en `modelos_de_ingreso`
// (140). Cada base tiene su copia: hay una base por institución y una base nueva
// no trae ningún modelo. El archivo no va en git porque el repositorio es público
// y el modelo sale de datos de personas reales.
//
//   node scripts/publicar-modelo-de-ingreso.mjs --modelo=<archivo.json.gz> --seco
//   node scripts/publicar-modelo-de-ingreso.mjs --modelo=<archivo.json.gz> [--cliente=<clave>] [--vigente]
//
// Antes de tocar la base comprueba el archivo: su huella contra `<archivo>.sha256`,
// el formato, y que reproduce sus casos de oro. Las métricas salen de
// scripts/predictor-ingresos/metricas/<version>-nivel<n>.json: sin ellas no se publica.
//
// --vigente lo pasa a vigente con activar_modelo_de_ingreso(): el anterior queda
// retirado en la misma transacción. Un modelo nuevo no pasa a vigente sin compararlo
// con el vigente sobre los mismos casos (especificación, 7). Sin la bandera queda como
// candidato y la función sigue sirviendo el vigente.
//
// Repetirlo con un modelo ya publicado no sube nada: con --vigente, sólo lo activa.
//
// AVISO: este archivo no pasa por lint ni build. No imprime secretos.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { abrirEjecucion } from "./_comun/ejecucion.mjs";
import { raizPrincipal } from "./_comun/entorno.mjs";
import { evaluarCuantilesLog, prepararModelo } from "../supabase/functions/_shared/predictor-ingresos.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const opcion = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const bandera = (n) => process.argv.includes(`--${n}`);
const SECO = bandera("seco");
const DEPOSITO = "modelos-de-ingreso";

function morir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

// ---------------------------------------------------------------- el archivo

const rutaModelo = opcion("modelo");
if (!rutaModelo) morir("Falta --modelo=<archivo.json.gz>.");
const bytes = fs.readFileSync(rutaModelo);
const huella = createHash("sha256").update(bytes).digest("hex");

if (fs.existsSync(`${rutaModelo}.sha256`)) {
  const declarada = fs.readFileSync(`${rutaModelo}.sha256`, "utf8").trim().split(/\s+/)[0];
  if (declarada !== huella) morir(`El archivo no coincide con ${path.basename(rutaModelo)}.sha256: no se publica.`);
}

const crudo = JSON.parse(zlib.gunzipSync(bytes).toString("utf8"));
const modelo = prepararModelo(crudo);

// Los mismos casos de oro de exportar.py: un archivo que no los reproduce daría montos equivocados sin ningún error.
const oro = JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "predictor-ingresos", "casos-de-oro", `nivel${modelo.nivel}.json`), "utf8"));
if (oro.huella_entrenamiento_sha256 !== crudo.origen?.huella_entrenamiento_sha256) {
  morir(`Los casos de oro del nivel ${modelo.nivel} son de otro entrenamiento: regenerarlos con exportar.py.`);
}
const conDiferencia = oro.casos.filter((c) => evaluarCuantilesLog(modelo, c.entradas).some((q, i) => Math.abs(q - c.cuantiles_log[i]) >= oro.tolerancia));
if (conDiferencia.length > 0) morir(`${conDiferencia.length} de ${oro.casos.length} casos de oro no coinciden: no se publica.`);

const rutaMetricas = path.join(RAIZ, "scripts", "predictor-ingresos", "metricas", `${modelo.version}-nivel${modelo.nivel}.json`);
if (!fs.existsSync(rutaMetricas)) morir(`Faltan las métricas: ${path.relative(RAIZ, rutaMetricas)}.`);
const { poblacion, ...metricas } = JSON.parse(fs.readFileSync(rutaMetricas, "utf8"));
if (!poblacion) morir("Las métricas no dicen la población con que se entrenó (`poblacion`).");

const rutaArchivo = `${modelo.version}-nivel${modelo.nivel}.json.gz`;
console.log(`${modelo.version}, nivel ${modelo.nivel}, entrenado el ${modelo.entrenadoEl}: ${bytes.length} bytes, huella ${huella.slice(0, 12)}, ${oro.casos.length} casos de oro iguales.`);

// ---------------------------------------------------------------- la base

const directorio = JSON.parse(fs.readFileSync(path.join(RAIZ, "clientes", "directorio.json"), "utf8"));
const soloCliente = opcion("cliente");
const clientes = directorio.clientes.filter((c) => !soloCliente || c.clave === soloCliente);
// De a una base: cada corrida deja su constancia, y un error a la mitad no deja el modelo en unas sí y otras no.
if (clientes.length !== 1) morir(soloCliente ? `No hay ningún cliente "${soloCliente}" en clientes/directorio.json.` : "Hay más de una base: elegir una con --cliente=<clave>.");
const cliente = clientes[0];

// Los secretos viven fuera de git, en la carpeta principal aunque esto corra desde un worktree.
const archivoDeSecretos = path.join(raizPrincipal(RAIZ), cliente.secretos ?? "");
if (!cliente.secretos || !fs.existsSync(archivoDeSecretos)) morir(`No está el archivo de secretos de ${cliente.clave}.`);
const clave = fs.readFileSync(archivoDeSecretos, "utf8").split(/\r?\n/).find((l) => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="))?.slice("SUPABASE_SERVICE_ROLE_KEY=".length).trim();
if (!clave) morir(`El archivo de secretos de ${cliente.clave} no trae la clave de servicio.`);
const url = cliente.url;
const cabeceras = { apikey: clave, Authorization: `Bearer ${clave}` };

// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${url}${ruta}`, { ...opciones, headers: { ...cabeceras, ...opciones.headers } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta.split("?")[0]}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

let filas;
try {
  filas = await pedir(`/rest/v1/modelos_de_ingreso?version=eq.${encodeURIComponent(modelo.version)}&nivel=eq.${modelo.nivel}&select=id,estado,huella_sha256`);
} catch (e) {
  morir(`No se pudo leer modelos_de_ingreso en ${cliente.clave} (¿falta aplicar la 140?): ${e.message}`);
}
const existente = filas[0] ?? null;
// Dos archivos con la misma versión: las estimaciones guardadas no dirían cuál las calculó.
if (existente && existente.huella_sha256 !== huella) morir(`${cliente.clave} ya tiene ${modelo.version} del nivel ${modelo.nivel} con otra huella: un modelo nuevo lleva una versión nueva.`);

const vigente = bandera("vigente");
if (existente?.estado === "vigente" && vigente) {
  console.log(`${cliente.clave}: ya está publicado y vigente. No hay nada que hacer.`);
  process.exit(0);
}
if (SECO) {
  const pasos = [existente ? `ya está publicado (${existente.estado})` : `subiría ${rutaArchivo} y crearía su fila`];
  if (vigente) pasos.push("lo pasaría a vigente");
  console.log(`${cliente.clave}, en seco: ${pasos.join(" y ")}.`);
  process.exit(0);
}

const ejecucion = await abrirEjecucion({ url, clave, guion: "publicar-modelo-de-ingreso" });

let id = existente?.id ?? null;
if (!id) {
  // Sin fila nadie lee este archivo: pisarlo sólo repara una corrida que se cortó entre los dos pasos.
  await pedir(`/storage/v1/object/${DEPOSITO}/${rutaArchivo}`, { method: "POST", headers: { "content-type": "application/gzip", "x-upsert": "true" }, body: bytes });
  const [fila] = await pedir("/rest/v1/modelos_de_ingreso", {
    method: "POST",
    headers: { "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      version: modelo.version, nivel: modelo.nivel, huella_sha256: huella, entrenado_el: modelo.entrenadoEl,
      poblacion, metricas, origen: crudo.origen, ruta_archivo: rutaArchivo,
    }),
  });
  id = fila.id;
  ejecucion.sumarFilas(1);
  console.log(`${cliente.clave}: publicado como candidato.`);
}

if (vigente) {
  await pedir("/rest/v1/rpc/activar_modelo_de_ingreso", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p_modelo: id }) });
  console.log(`${cliente.clave}: vigente.`);
}
ejecucion.anotar({ version: modelo.version, nivel: modelo.nivel, huella: huella.slice(0, 12), vigente });
