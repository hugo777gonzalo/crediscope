// Atender un pedido de un titular (LOPDP): qué se guarda de una persona,
// entregárselo, o suprimirlo. Lo ordena la IFI, que es la responsable del
// tratamiento; CrediScope es su encargado y ejecuta. El procedimiento
// completo (quién pide, plazos, qué se contesta) está en
// docs/cumplimiento/lopdp.md.
//
//   node scripts/derechos-del-titular.mjs --cedula=<cédula>
//       Inventario: cuántas filas hay en cada tabla y cuántos crudos en
//       Storage. No imprime datos de la persona. Empezar siempre por acá.
//
//   node scripts/derechos-del-titular.mjs --cedula=<cédula> --exportar
//       Acceso y portabilidad: todo lo que se guarda, en un JSON dentro de
//       research/derechos/ (fuera del repositorio: son datos personales),
//       con el crudo de cada consulta descomprimido.
//
//   node scripts/derechos-del-titular.mjs --cedula=<cédula> --suprimir
//       --motivo="Pedido de la IFI <nombre>, oficio <n.º>, del <fecha>"
//       --responsable=<uuid de profiles> --confirmar
//       Supresión: borra el contenido y deja la constancia de las
//       consultas (ver la migración 115, que explica qué queda y por
//       qué). Sin --confirmar sólo muestra el inventario. Después lista
//       las copias locales en research/ que hay que borrar a mano.
//
// Usa la clave de servicio de .env.functions. Los secretos no se imprimen.
//
// AVISO: este guion no pasa por lint ni build. Si se agrega una tabla con
// datos de la persona, sumarla acá (TABLAS) y en suprimir_titular() (115),
// o el inventario y la supresión la dejan afuera sin avisar.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.functions");
const cabeceras = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };

const opcion = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3).trim();
const bandera = (nombre) => process.argv.includes(`--${nombre}`);

const CEDULA = opcion("cedula") ?? "";
if (!/^\d{10}$/.test(CEDULA)) {
  console.error("Falta --cedula=<10 dígitos>.");
  process.exit(1);
}
// En pantalla, nunca la cédula entera.
const ENMASCARADA = `${CEDULA.slice(0, 2)}******${CEDULA.slice(-2)}`;

// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function pedir(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, headers: { ...cabeceras, ...opciones.headers } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
  return texto ? JSON.parse(texto) : null;
}
const leer = (tabla, filtro) => pedir(`${env.SUPABASE_URL}/rest/v1/${tabla}?select=*&${filtro}`);

const cliente = (await leer("clients", `cedula=eq.${CEDULA}`))[0];
if (!cliente) {
  console.log(`No hay ningún registro de ${ENMASCARADA}.`);
  process.exit(0);
}
const id = cliente.id;

// Dónde aparece una persona: medido sobre el catálogo el 2026-10-09.
const TABLAS = [
  ["client_profiles", `client_id=eq.${id}`],
  ["analysis_results", `client_id=eq.${id}`],
  ["consultas_aval", `or=(client_id.eq.${id},identificacion.eq.${CEDULA})`],
  ["ingestion_runs", `client_id=eq.${id}`],
  ["llm_llamadas", `client_id=eq.${id}`],
  ["lote_items", `cedula=eq.${CEDULA}`],
  ["lab_solicitudes", `or=(client_id.eq.${id},cedula.eq.${CEDULA})`],
  ["lab_operaciones", `or=(client_id.eq.${id},cedula.eq.${CEDULA})`],
  ["lab_corte_solicitudes", `cedula=eq.${CEDULA}`],
  ["lab_corte_operaciones", `cedula=eq.${CEDULA}`],
  ["lab_decisiones_institucion", `cedula=eq.${CEDULA}`],
  ["audit_log", `client_id=eq.${id}`],
];

const datos = { clients: [cliente] };
for (const [tabla, filtro] of TABLAS) datos[tabla] = await leer(tabla, filtro);
const crudos = datos.client_profiles.map((p) => p.crudo_ruta).filter(Boolean);

console.log(`\nInventario de ${ENMASCARADA}`);
for (const [tabla] of [["clients"], ...TABLAS]) console.log(`  ${tabla.padEnd(28)} ${datos[tabla].length}`);
console.log(`  ${"crudo en Storage".padEnd(28)} ${crudos.length}`);

// Si la persona es un caso de desarrollo, el código la cita como
// c-xxxxxxxx y el registro local guarda su cédula y el texto de la cita
// (research/casos-reales/). La cita no la identifica sin la base, pero
// decidir si se mantiene es de la IFI.
const registroCasos = path.join(RAIZ, "research", "casos-reales", "registro-de-casos.json");
if (fs.existsSync(registroCasos)) {
  const caso = JSON.parse(fs.readFileSync(registroCasos, "utf8")).casos.find((c) => c.cliente?.cedula === CEDULA);
  if (caso) {
    console.log(
      `\nEs un caso de desarrollo: el repositorio lo cita como ${caso.ref} en ${caso.citas.length} lugares` +
        ` (${caso.archivos.join(", ")}). Decidir con la IFI si las citas se mantienen; después rearmar el registro` +
        " con node scripts/registrar-casos-reales.mjs y anotarlo en research/casos-reales/notas.md."
    );
  }
}

const localesEnResearch = () => {
  const encontrados = [];
  const recorrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.includes(CEDULA)) encontrados.push(path.relative(RAIZ, p));
    }
  };
  recorrer(path.join(RAIZ, "research"));
  return encontrados;
};

if (bandera("exportar")) {
  const exportacion = { generado: new Date().toISOString(), titular: CEDULA, datos, crudo: [] };
  for (const ruta of crudos) {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/crudo-novadata/${ruta}`, { headers: cabeceras });
    if (!r.ok) {
      exportacion.crudo.push({ ruta, error: `HTTP ${r.status}` });
      continue;
    }
    const bytes = Buffer.from(await r.arrayBuffer());
    exportacion.crudo.push({ ruta, contenido: JSON.parse(zlib.gunzipSync(bytes).toString("utf8")) });
  }
  const carpeta = path.join(RAIZ, "research", "derechos");
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `${new Date().toISOString().slice(0, 10)}-${ENMASCARADA.replaceAll("*", "x")}.json`);
  fs.writeFileSync(archivo, JSON.stringify(exportacion, null, 2));
  console.log(`\nExportado en ${path.relative(RAIZ, archivo)} (datos personales: no sale de research/ salvo hacia el titular o la IFI).`);
}

if (bandera("suprimir")) {
  const motivo = opcion("motivo") ?? "";
  const responsable = opcion("responsable") ?? "";
  if (motivo.length < 10 || !/^[0-9a-f-]{36}$/i.test(responsable)) {
    console.error('\nPara suprimir: --motivo="<quién lo pidió, oficio, fecha>" y --responsable=<uuid de profiles>.');
    process.exit(1);
  }
  if (!bandera("confirmar")) {
    console.log("\nSin --confirmar no se borra nada. Revisar el inventario de arriba y volver a correr con --confirmar.");
    process.exit(0);
  }
  const resultado = await pedir(`${env.SUPABASE_URL}/rest/v1/rpc/suprimir_titular`, {
    method: "POST",
    body: JSON.stringify({ p_cedula: CEDULA, p_motivo: motivo, p_responsable: responsable }),
  });
  console.log("\nBase:", JSON.stringify(resultado.conteos));

  let borrados = 0;
  for (const ruta of resultado.crudos ?? []) {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/crudo-novadata`, {
      method: "DELETE",
      headers: cabeceras,
      body: JSON.stringify({ prefixes: [ruta] }),
    });
    if (r.ok) borrados++;
    else console.error(`  No se pudo borrar un crudo (HTTP ${r.status}): reintentar con el mismo comando.`);
  }
  console.log(`Storage: ${borrados} de ${(resultado.crudos ?? []).length} crudos borrados.`);

  const locales = localesEnResearch();
  console.log(
    locales.length
      ? `\nCopias locales para borrar a mano (y en los respaldos de esta máquina):\n${locales.map((l) => `  ${l}`).join("\n")}`
      : "\nNo hay archivos locales con esa cédula en el nombre en research/."
  );
  console.log("Los .jsonl de lotes en research/ pueden tener líneas de esta persona: buscarlas y quitarlas.");
}
