// La prueba en sombra del nivel 1 del predictor de ingresos (docs/investigacion-predictor-de-ingresos.md, 12.30):
// para las personas de AWS que se reconsultaron en Novadata (12.29), arma las variables desde el perfil que guardó
// CrediScope, con variables-de-ingreso.ts, y las evalúa con predictor-ingresos.ts: lo mismo que serviría la función,
// pero con las entradas de producción (Novadata) en vez del extracto de AWS con que se entrenó. La medida contra el
// ingreso validado la hace scripts/predictor-ingresos/medir_sombra.py.
//
// No consulta a ninguna fuente ni al modelo de lenguaje: lee el perfil guardado (client_profiles, sólo lectura; por eso
// no abre una ejecución, regla 11) y el crudo que dejó el lote.
//
// Datos (fuera de git, personas reales): research/medida-persona/ de la carpeta principal.
//   crudo/*.json   { cedula, capturadoEl, perfilId, raw }: la respuesta de Novadata de cada persona del lote
//   tmap.json      la fecha de la consulta de AWS de cada persona (de muestra.parquet)
// Salida: research/medida-persona/sombra-nivel1.jsonl, una línea por persona. Por pantalla, sólo conteos.
//
//   node scripts/sombra-predictor-ingresos.mjs [--modelo=C:/datos/ingresos/modelos/exportado/ingreso-v1-nivel1.json.gz]
//
// Tres maneras de servir a cada persona, porque su ingreso validado es de la fecha de su consulta de AWS (2023 a 2025)
// y Novadata contestó el 2026-10-28:
//   hoy                   el perfil tal como está guardado y el reloj en el día de la consulta a Novadata;
//   a_la_consulta         la edad y el reloj (fecha del modelo y antigüedad del RUC) en la fecha de la consulta de AWS;
//   con_obligado          lo anterior más el «obligado a llevar contabilidad» del RUC, que el perfil todavía no guarda
//                         (decisión del negocio del 2026-10-29: va al perfil). Se lee del crudo, como lo haría el perfil.
//
// AVISO: este archivo no pasa por lint ni build.

import fs from "node:fs";
import path from "node:path";
import { cargarEntorno, raizPrincipal } from "./_comun/entorno.mjs";
import { vectorDeNivel1 } from "../supabase/functions/_shared/variables-de-ingreso.ts";
import { estimarIngreso, leerModeloComprimido } from "../supabase/functions/_shared/predictor-ingresos.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DATOS = path.join(raizPrincipal(RAIZ), "research", "medida-persona");
const argumento = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const RUTA_MODELO = argumento("modelo")
  ?? path.join(process.env.PREDICTOR_INGRESOS_MODELOS ?? "C:/datos/ingresos/modelos/exportado", "ingreso-v1-nivel1.json.gz");

cargarEntorno(RAIZ);
const URL_BASE = process.env.SUPABASE_URL;
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CLAVE) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.functions.");

const modelo = await leerModeloComprimido(new Blob([fs.readFileSync(RUTA_MODELO)]));
if (modelo.nivel !== 1) throw new Error(`${RUTA_MODELO} es del nivel ${modelo.nivel}, no del 1.`);
const fechaDeConsulta = JSON.parse(fs.readFileSync(path.join(DATOS, "tmap.json"), "utf8"));

// Años cumplidos a una fecha, de AAAA-MM-DD a AAAA-MM-DD, sin pasar por Date: así salió edad_a_la_consulta en AWS, y
// `new Date("AAAA-MM-DD")` es medianoche UTC, que en Ecuador es todavía el día anterior.
function aniosCumplidos(nacimiento, fecha) {
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(nacimiento ?? "");
  const f = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!n || !f) return null;
  const cumplio = Number(f[2]) > Number(n[2]) || (Number(f[2]) === Number(n[2]) && Number(f[3]) >= Number(n[3]));
  return Number(f[1]) - Number(n[1]) - (cumplio ? 0 : 1);
}

// El obligado del RUC de Novadata viene como SI, NO o N (en las 542: 20, 466 y 26; vacío en las 30 sin RUC).
function obligadoDelCrudo(raw) {
  const datos = raw?.contribuyente?.data?.datosContribuyente;
  const ruc = Array.isArray(datos) ? datos[0] : datos;
  const v = String(ruc?.obligado ?? "").trim().toUpperCase();
  return v === "SI" || v === "S" ? true : v === "NO" || v === "N" ? false : null;
}

// Un error de PostgREST es un objeto plano: se lee el cuerpo entero.
async function pedir(ruta) {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
  return JSON.parse(texto);
}

const cuenta = { crudos: 0, sinRegistroCivil: 0, sinFechaDeAws: 0, sinPerfilGuardado: 0, sinNacimiento: 0, evaluadas: 0 };
const personas = [];
for (const archivo of fs.readdirSync(path.join(DATOS, "crudo")).filter((a) => a.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(DATOS, "crudo", archivo), "utf8"));
  cuenta.crudos++;
  // Las 634 que el 502 de Novadata dejó sin Registro Civil no tienen un perfil que sirva (12.29).
  if (j.raw?.general?.status !== "ok") { cuenta.sinRegistroCivil++; continue; }
  const cedula = String(j.cedula).padStart(10, "0");
  if (!fechaDeConsulta[cedula]) { cuenta.sinFechaDeAws++; continue; }
  personas.push({ cedula, perfilId: j.perfilId, capturadoEl: j.capturadoEl, consultaAws: fechaDeConsulta[cedula],
    nacimiento: j.raw.general.data?.personaNatural?.fechaNacimiento ?? null, obligado: obligadoDelCrudo(j.raw) });
}

const perfiles = new Map();
for (let i = 0; i < personas.length; i += 50) {
  const ids = personas.slice(i, i + 50).map((p) => p.perfilId).filter(Boolean);
  for (const f of await pedir(`client_profiles?id=in.(${ids.join(",")})&select=id,standard_profile`)) perfiles.set(f.id, f.standard_profile);
}

const salida = [];
for (const p of personas) {
  const guardado = perfiles.get(p.perfilId);
  if (!guardado) { cuenta.sinPerfilGuardado++; continue; }
  const edadALaConsulta = aniosCumplidos(p.nacimiento, p.consultaAws);
  if (edadALaConsulta === null) cuenta.sinNacimiento++;
  const base = { identidad: guardado.identidad, laboral: guardado.laboral, metaConsulta: guardado.metaConsulta };
  const alaConsulta = { ...base, identidad: { ...guardado.identidad, edad: edadALaConsulta } };
  // Mediodía de Ecuador: la fecha del modelo y la antigüedad del RUC son las de ese día, sin el corrimiento de la medianoche UTC.
  const relojAws = `${p.consultaAws}T12:00:00-05:00`;
  const maneras = {
    hoy: { perfil: base, opciones: { ahora: p.capturadoEl }, anio: Number(p.capturadoEl.slice(0, 4)) },
    a_la_consulta: { perfil: alaConsulta, opciones: { ahora: relojAws }, anio: Number(p.consultaAws.slice(0, 4)) },
    con_obligado: { perfil: alaConsulta, opciones: { ahora: relojAws, obligadoAContabilidad: p.obligado }, anio: Number(p.consultaAws.slice(0, 4)) },
  };
  const fila = { cedula: p.cedula, perfilId: p.perfilId, consultaAws: p.consultaAws, maneras: {} };
  for (const [nombre, m] of Object.entries(maneras)) {
    const v = vectorDeNivel1(m.perfil, m.opciones);
    const e = estimarIngreso(modelo, v.variables, { anio: m.anio });
    fila.maneras[nombre] = {
      variables: v.variables, sinDato: v.sinDato, cuantilesLog: e.cuantilesLog,
      minimo90: e.minimoCertificado.monto, minimo85: e.minimoAlternativo.monto, valorCentral: e.valorCentral,
      limiteDeMedioSbu: e.minimoCertificado.limiteDeMedioSbuAplicado,
    };
  }
  salida.push(fila);
  cuenta.evaluadas++;
}

const destino = path.join(DATOS, "sombra-nivel1.jsonl");
fs.writeFileSync(destino, salida.map((s) => JSON.stringify(s)).join("\n") + "\n");
console.log(`modelo: ${path.basename(RUTA_MODELO)} (${modelo.version}, nivel ${modelo.nivel}, entrenado el ${modelo.entrenadoEl})`);
console.log("conteos:", cuenta);
// Cuántas personas traen cada variable, por manera: un vacío que el entrenamiento no tenía es lo primero que hay que ver.
for (const nombre of ["hoy", "a_la_consulta", "con_obligado"]) {
  const vacios = {};
  for (const s of salida) for (const k of s.maneras[nombre].sinDato) vacios[k] = (vacios[k] ?? 0) + 1;
  console.log(`sin dato (${nombre}):`, vacios);
}
console.log("->", destino);
