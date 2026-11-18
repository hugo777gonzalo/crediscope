// Cotejo EN SECO de las coincidencias con listas de control contra la lista oficial de OFAC
// (SDN) descargada en bloque. Sólo mide: no escribe en la base, no consulta al proveedor ni a
// Equifax, no llama al modelo y no cambia ningún bloqueo (controles-bloqueo.ts queda como está).
//
// Por qué: hoy una persona queda bloqueada por una coincidencia de OFAC sólo por nombre, sin
// cédula, y otras traen un homónimo. La lista oficial trae, cuando existe, documento,
// nacionalidad y fecha de nacimiento: con eso una coincidencia por nombre se confirma, se
// descarta o queda sin decidir (decisión O-2 del negocio: sin cédula pasa a «verificación de
// identidad», no a bloqueo).
//
// ONU NO SE USA: las condiciones generales del sitio de la ONU (un.org/en/about-us/terms-of-use)
// sólo permiten uso personal y no comercial, sin compilar ni crear obras derivadas. Mientras el
// negocio no consiga el permiso por escrito o confirme que la lista consolidada del Consejo de
// Seguridad tiene otra licencia, este guion no la descarga ni la lee.
//
// La base se lee SÓLO con `supabase db query --read-only`. Del perfil guardado salen el nombre, la
// cédula y la edad de la persona, y no el registro de la lista que dio la coincidencia (ese vive
// en el crudo de Storage): por eso el cotejo busca a la persona en la lista oficial, no al revés.
// Con la edad sólo se conoce el año de nacimiento aproximado (±1), así que la fecha de nacimiento
// descarta sólo cuando el año es claramente otro.
//
// Salida: en consola sólo conteos. El detalle (cédulas y nombres) va a
// research/listas-oficiales/<fecha>/detalle.json, fuera de git. Un caso se cita como c-xxxxxxxx.
//
// AVISO: este archivo no pasa por lint ni build; correrlo con --limite=20 antes de confiar.
//
// Uso: node scripts/cotejar-listas-oficiales.mjs [--sdn=ruta/SDN.XML] [--salida=carpeta]
//        [--workdir=carpeta-con-supabase/.temp] [--limite=N]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { comandoDeConsulta } from "./_comun/consulta-sql.mjs";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10); // Ecuador, UTC-5
const CARPETA = path.resolve(RAIZ, arg("salida", `research/listas-oficiales/${HOY}`));
const LIMITE = Number(arg("limite", "0")) || Infinity;
const URL_SDN = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML";
fs.mkdirSync(CARPETA, { recursive: true });

// ---------- Normalización ----------
const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const fichas = (s) => sinTildes(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 1);
const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const etiqueta = (bloque, nombre) => [...bloque.matchAll(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`, "g"))].map((m) => m[1]);
const texto = (bloque, nombre) => etiqueta(bloque, nombre)[0]?.replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').trim() ?? "";

// ---------- La lista de OFAC ----------
async function leerSdn() {
  const local = arg("sdn", null);
  let contenido;
  let origen;
  if (local) {
    contenido = fs.readFileSync(local);
    origen = path.resolve(local);
  } else {
    const r = await fetch(URL_SDN);
    if (!r.ok) throw new Error(`OFAC SDN: HTTP ${r.status}`);
    contenido = Buffer.from(await r.arrayBuffer());
    origen = URL_SDN;
    fs.writeFileSync(path.join(CARPETA, "SDN.XML"), contenido);
  }
  const huella = crypto.createHash("sha256").update(contenido).digest("hex");
  const xml = contenido.toString("utf8");
  const publicada = texto(xml, "Publish_Date");
  fs.writeFileSync(path.join(CARPETA, "manifiesto.json"), JSON.stringify({ lista: "OFAC SDN", origen, descargada: HOY, publicada, sha256: huella, bytes: contenido.length }, null, 2));

  const entradas = [];
  for (const e of etiqueta(xml, "sdnEntry")) {
    if (texto(e, "sdnType") !== "Individual") continue;
    const nombres = [{ ape: texto(e, "lastName"), nom: texto(e, "firstName") }];
    for (const a of etiqueta(e, "aka")) nombres.push({ ape: texto(a, "lastName"), nom: texto(a, "firstName") });
    const nombresFichas = nombres.map((n) => new Set(fichas(`${n.nom} ${n.ape}`))).filter((s) => s.size >= 2);
    if (!nombresFichas.length) continue;
    const documentos = etiqueta(etiqueta(e, "idList")[0] ?? "", "id").map((i) => ({
      tipo: texto(i, "idType"), numero: soloDigitos(texto(i, "idNumber")), pais: texto(i, "idCountry"),
    })).filter((d) => d.numero);
    const nacionalidades = etiqueta(e, "nationality").map((n) => sinTildes(texto(n, "country")).toUpperCase()).filter(Boolean)
      .concat(etiqueta(e, "citizen").map((n) => sinTildes(texto(n, "country")).toUpperCase()).filter(Boolean));
    // «12 Jan 1971», «1971», «circa 1971»: sólo se toma el año.
    const anios = etiqueta(e, "dateOfBirth").map((d) => Number(d.match(/\b(1[89]\d\d|20\d\d)\b/)?.[1])).filter(Boolean);
    entradas.push({ nombresFichas, documentos, nacionalidades, anios });
  }
  return { entradas, publicada, huella };
}

// ---------- Las personas ----------
function personasDeLaBase() {
  const sql = `
with u as (select distinct on (client_id) * from client_profiles order by client_id, created_at desc)
select left(c.id::text, 8) as id8, c.cedula,
  u.standard_profile->'identidad'->>'nombreCompleto' as nombre,
  nullif(u.standard_profile->'identidad'->>'edad','')::int as edad,
  u.standard_profile->'identidad'->>'paisOrigenIso3' as iso3,
  extract(year from u.created_at)::int as anio_consulta,
  (u.control_bloqueo::text like '%"lista_control"%' or u.control_bloqueo::text like '%listas_control_interno%') as bloqueada_por_lista,
  (u.control_bloqueo::text like '%homonimo_en_lista_control%') as con_homonimo
from u join clients c on c.id = u.client_id
where not c.es_sintetico
  and (u.control_bloqueo::text like '%"lista_control"%' or u.control_bloqueo::text like '%listas_control_interno%'
       or u.control_bloqueo::text like '%homonimo_en_lista_control%')
order by c.id`;
  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cotejo-listas-")), "consulta.sql");
  fs.writeFileSync(archivo, sql);
  const workdir = arg("workdir", null) ?? undefined;
  const salida = execSync(comandoDeConsulta(archivo, { workdir }), { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(path.dirname(archivo), { recursive: true, force: true });
  const filas = JSON.parse(salida.slice(salida.indexOf("{"))).rows;
  return filas.slice(0, LIMITE);
}

// ---------- El cotejo ----------
const ES_ECUADOR = (s) => /ECUADOR/.test(s);

function cotejarEntrada(p, fichasPersona, e) {
  // ¿Algún nombre de la entrada está contenido en el de la persona (o al revés)? Mínimo dos fichas
  // en común: «mismo nombre» como lo entiende el proveedor, con segundos nombres omitidos.
  const coincide = e.nombresFichas.some((n) => {
    const comunes = [...n].filter((t) => fichasPersona.has(t)).length;
    return comunes >= 2 && comunes === Math.min(n.size, fichasPersona.size);
  });
  if (!coincide) return null;
  const cedula = soloDigitos(p.cedula);
  if (e.documentos.some((d) => d.numero === cedula)) return "confirma";
  const anioPersona = p.edad != null && p.anio_consulta ? p.anio_consulta - p.edad : null;
  const nacionalidadDistinta = p.iso3 === "ECU" && e.nacionalidades.length > 0 && !e.nacionalidades.some(ES_ECUADOR);
  const nacimientoDistinto = anioPersona != null && e.anios.length > 0 && !e.anios.some((a) => Math.abs(a - anioPersona) <= 1);
  // Un documento de Ecuador distinto al de la persona también la descarta.
  const documentoEcuatorianoDistinto = e.documentos.some((d) => ES_ECUADOR(sinTildes(d.pais).toUpperCase()) && /CEDULA|IDENTIFICATION/i.test(d.tipo) && d.numero !== cedula);
  if (nacionalidadDistinta || nacimientoDistinto || documentoEcuatorianoDistinto) return "descarta";
  return "sin_decidir";
}

function cotejarPersona(p, lista) {
  const fichasPersona = new Set(fichas(p.nombre));
  const resultados = lista.entradas.map((e) => cotejarEntrada(p, fichasPersona, e)).filter(Boolean);
  if (resultados.length === 0) return "no_aparece";
  if (resultados.includes("confirma")) return "confirmada";
  if (resultados.includes("sin_decidir")) return "sin_decidir";
  return "descartada";
}

const lista = await leerSdn();
const personas = personasDeLaBase();
const detalle = personas.map((p) => ({ ...p, ofac: cotejarPersona(p, lista) }));
fs.writeFileSync(path.join(CARPETA, "detalle.json"), JSON.stringify(detalle, null, 1));

const grupos = {
  "Bloqueadas por una lista de control": (p) => p.bloqueada_por_lista,
  "Con homónimo y sin bloqueo por lista": (p) => p.con_homonimo && !p.bloqueada_por_lista,
};
console.log(`OFAC SDN publicada ${lista.publicada} (sha256 ${lista.huella.slice(0, 12)}…), ${lista.entradas.length} personas en la lista`);
console.log("ONU: no se usa (condiciones de uso)");
for (const [nombre, f] of Object.entries(grupos)) {
  const g = detalle.filter(f);
  const cuenta = (k) => g.filter((p) => p.ofac === k).length;
  console.log(`${nombre}: ${g.length} personas | confirmadas ${cuenta("confirmada")} | descartadas ${cuenta("descartada")} | sin decidir ${cuenta("sin_decidir")} | no aparecen en OFAC ${cuenta("no_aparece")}`);
}
console.log(`Detalle (con cédulas) en ${path.relative(RAIZ, path.join(CARPETA, "detalle.json"))}, fuera de git.`);
