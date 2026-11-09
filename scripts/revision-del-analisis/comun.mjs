// Lo que comparten los guiones de la revisión del análisis: la consulta de sólo
// lectura a la base, las ids de caso y la lectura del crudo de Proveedor_Info_1
// de un perfil. Estaba copiado en cada guion; con cuatro guiones que lo usan, un
// arreglo en una copia dejaba a las otras con el defecto.
//
// SÓLO LECTURA: ninguna función de acá escribe en la base ni llama a una fuente.
// El crudo se lee del depósito propio (Storage, `crudo-proveedor-info-1`) o de los
// respaldos locales de research/.
//
// AVISO: este archivo no pasa por lint ni build.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cargarEntorno, raizPrincipal } from "../_comun/entorno.mjs";
import { comandoDeConsulta } from "../_comun/consulta-sql.mjs";
import { leerCrudo } from "../_comun/crudo-del-ultimo-perfil.mjs";

export const RAIZ = path.resolve(import.meta.dirname, "..", "..");
export const PRINCIPAL = raizPrincipal(RAIZ);

/** Una persona o un análisis se cita como c-xxxxxxxx: los 8 primeros caracteres de clients.id. */
export const corto = (id) => `c-${String(id).slice(0, 8)}`;

/** El motivo de un error de PostgREST o de la CLI, que es un objeto plano y no un Error. */
export const motivo = (e) => [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Un arreglo de uuid para un SQL. Lo que va al SQL se valida antes: no se arma una consulta con texto libre. */
export function listaDeUuid(ids) {
  const malos = ids.filter((i) => !UUID.test(i));
  if (malos.length) throw new Error(`${malos.length} identificadores que no son uuid.`);
  return `array[${ids.map((i) => `'${i}'`).join(",")}]::uuid[]`;
}

/**
 * Corre un SQL de sólo lectura contra la base enlazada (`supabase db query --read-only`) y
 * devuelve las filas. Una escritura la rechaza la base: el comando va siempre con --read-only.
 */
export function consultar(sql) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "revision-del-analisis-"));
  const archivo = path.join(carpeta, "consulta.sql");
  fs.writeFileSync(archivo, sql, "utf8");
  try {
    const salida = execSync(comandoDeConsulta(archivo, { workdir: PRINCIPAL }), {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(salida.slice(salida.indexOf("{"))).rows;
  } catch (e) {
    // Sin el SQL en el mensaje: lleva las ids de las personas y la salida de error puede traer datos.
    throw new Error(`La consulta a la base falló: ${String(e.stderr ?? e.message).trim().split(/\r?\n/).slice(-3).join(" ")}`);
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
}

/**
 * La URL y la clave de servicio, leídas de .env.functions (nunca se imprimen). Para leer Storage
 * y para el cliente de Supabase de los guiones que lo usan.
 */
export function accesoASupabase() {
  cargarEntorno(RAIZ);
  const url = process.env.SUPABASE_URL, clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.functions.");
  return { url, clave, cabeceras: { apikey: clave, Authorization: `Bearer ${clave}` } };
}

/**
 * Lee el crudo EXACTO de un perfil (no el último de la persona): `crudo_ruta` en el depósito y,
 * si el perfil no lo tiene, el respaldo local de research/ cuya cabecera dice ese `perfilId`.
 * El índice del respaldo se arma la primera vez que hace falta (lee 400 bytes de cada JSON:
 * los crudos pesan).
 */
export function lectorDeCrudos({ url, cabeceras }) {
  let indiceLocal = null;
  const indice = () => {
    if (indiceLocal) return indiceLocal;
    indiceLocal = new Map();
    const research = path.join(PRINCIPAL, "research");
    const carpetas = fs.existsSync(research)
      ? fs.readdirSync(research).filter((d) => d.startsWith("proveedor-info-1-raw")).map((d) => path.join(research, d))
      : [];
    for (const carpeta of carpetas) {
      for (const a of fs.readdirSync(carpeta).filter((x) => x.endsWith(".json"))) {
        const archivo = path.join(carpeta, a);
        const fd = fs.openSync(archivo, "r");
        const buf = Buffer.alloc(400);
        fs.readSync(fd, buf, 0, 400, 0);
        fs.closeSync(fd);
        const id = /"perfilId"\s*:\s*"([^"]+)"/.exec(buf.toString("utf8"))?.[1];
        if (id) indiceLocal.set(id, archivo);
      }
    }
    return indiceLocal;
  };
  return async function crudoDelPerfil(perfilId, crudoRuta) {
    if (crudoRuta) {
      try { return { crudo: await leerCrudo({ ruta: crudoRuta }, url, cabeceras), origen: `depósito crudo-proveedor-info-1 (${crudoRuta})` }; }
      catch { /* cae a la búsqueda local */ }
    }
    const archivo = indice().get(perfilId);
    if (archivo) return { crudo: await leerCrudo({ archivo }, url, cabeceras), origen: `respaldo local ${path.relative(PRINCIPAL, archivo)}` };
    return { crudo: null, origen: null };
  };
}
