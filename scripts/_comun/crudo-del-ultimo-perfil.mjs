// De dónde sale el crudo del último perfil de cada persona para un recálculo:
// la carpeta local de research/ y, para lo que la carpeta no tiene, el
// depósito crudo-proveedor-info-1 (crudo_ruta, 090). Lo usan recalcular-grupos.mjs y
// recalcular-fuentes-ingreso.mjs.
//
// Hasta el 2026-10-20 los dos leían sólo la carpeta: estructura-v14 dejó en
// v13 a las 12 personas consultadas después del respaldo del 03/10, aunque su
// crudo estaba guardado en Storage.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// ultimoPorCliente: Map client_id -> { id, crudo_ruta }. Devuelve
// { candidatos: [{ perfilId, archivo } | { perfilId, ruta }], cuenta }.
export function candidatosDelUltimoPerfil(carpeta, ultimoPorCliente) {
  const ultimosIds = new Set([...ultimoPorCliente.values()].map((p) => p.id));
  const candidatos = [];
  const cuenta = { enLaCarpeta: 0, delDeposito: 0, sinPerfilId: 0, noEsElUltimo: 0, sinCrudo: 0 };
  for (const a of fs.readdirSync(carpeta).filter((x) => x.endsWith(".json"))) {
    const archivo = path.join(carpeta, a);
    // Sólo la cabecera: el crudo entero se lee después, de a uno.
    const perfilId = /"perfilId"\s*:\s*"([^"]+)"/.exec(fs.readFileSync(archivo, "utf8").slice(0, 400))?.[1];
    if (!perfilId) { cuenta.sinPerfilId++; continue; }
    if (!ultimosIds.has(perfilId)) { cuenta.noEsElUltimo++; continue; }
    candidatos.push({ archivo, perfilId });
    cuenta.enLaCarpeta++;
  }
  const enLaCarpeta = new Set(candidatos.map((c) => c.perfilId));
  for (const p of ultimoPorCliente.values()) {
    if (enLaCarpeta.has(p.id)) continue;
    if (!p.crudo_ruta) { cuenta.sinCrudo++; continue; }
    candidatos.push({ ruta: p.crudo_ruta, perfilId: p.id });
    cuenta.delDeposito++;
  }
  return { candidatos, cuenta };
}

// El cambio de nombre del proveedor (2026-10-31) reescribió los perfiles
// guardados, no el crudo: una fuente sigue con su clave anterior y el código
// nuevo no la ve. El seco de estructura-v17 frenó los 3.765 perfiles por eso, y
// forzarlo le habría borrado la pensión alimenticia a quien la tiene ahí. Se
// conserva la posición de la clave porque metaConsulta lista las fuentes en
// ese orden. El nombre anterior va partido para que no vuelva al repositorio.
const CLAVE_ANTERIOR = "pensionAlimenticia" + "Nova" + "data";
const CLAVE_ACTUAL = "pensionAlimenticiaProveedorInfo1";

function conLaClaveActual(crudo) {
  if (!crudo.raw || !(CLAVE_ANTERIOR in crudo.raw)) return crudo;
  const fuentes = Object.entries(crudo.raw).map(([k, v]) => [k === CLAVE_ANTERIOR ? CLAVE_ACTUAL : k, v]);
  return { ...crudo, raw: Object.fromEntries(fuentes) };
}

// { cedula, capturadoEl, perfilId, raw }, la misma forma en los dos lugares.
// cabeceras: las del guion, con la clave de servicio leída de .env.functions.
export async function leerCrudo({ archivo, ruta }, url, cabeceras) {
  if (archivo) return conLaClaveActual(JSON.parse(fs.readFileSync(archivo, "utf8")));
  const r = await fetch(`${url}/storage/v1/object/crudo-proveedor-info-1/${ruta}`, { headers: { apikey: cabeceras.apikey, Authorization: cabeceras.Authorization } });
  if (!r.ok) throw new Error(`Storage contestó ${r.status} al leer un crudo`);
  return conLaClaveActual(JSON.parse(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8")));
}
