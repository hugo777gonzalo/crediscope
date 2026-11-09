// Paso 2 de cada corrida de la revisión del análisis: elige, sin modelo, los casos
// que dictamina el jefe de crédito, a partir de la medición de `medir-lote.mjs`.
// Escribe `seleccion.json`, que lee el paso 3 (`armar-carpetas.mjs`).
//
// El negocio decidió (2026-11-06) que se dictaminan hasta 15 casos por corrida. En el
// piloto los 12 casos se eligieron a mano mirando la decisión de la institución; acá
// no se la mira (no hay una para cada persona), y se elige por dónde la medición
// encontró algo:
//   1. los marcados por la medición, en este orden: aprobó sin razonar, aprobación
//      sin cuota ni capacidad evidenciada (a confirmar) y bloqueo por control;
//   2. después, personas con análisis de dos marcos (primero donde la recomendación
//      cambió), para ver qué cambió de verdad entre uno y otro;
//   3. y 3 o 4 al azar, con semilla, para no revisar sólo donde ya se buscó.
// Cada grupo tiene una cuota (con 15 casos: 4, 3, 2, 2 y 4 al azar) y, dentro de
// cada grupo, se toma primero uno por segmento (por hallazgo, en los bloqueos) y
// después el resto. Lo que un grupo no llena pasa al siguiente.
//
// Por qué al azar: sin ellos, el jefe de crédito sólo vería casos que un detector de
// texto ya señaló y nunca sabríamos qué se le escapa al detector.
//
// SÓLO LECTURA. No escribe en la base, no abre ejecución operativa y no llama a
// Anthropic, Equifax ni Proveedor_Info_1.
//
// `seleccion.json` lleva cédulas (las necesita `armar-carpetas.mjs`) y sale a
// research/, fuera de git. Por consola sólo salen referencias c-xxxxxxxx y el grupo
// por el que se eligió cada caso, nunca una cédula, un nombre ni un monto.
//
// ATENCIÓN: `seleccion.json` dice qué recomendó el modelo (`rec`, `score`, `motivo`),
// igual que el del piloto. Quien dictamine a ciegas no recibe ese archivo: recibe la
// carpeta que arma el paso 3, por fases.
//
// Uso:
//   node scripts/revision-del-analisis/elegir-casos.mjs --medicion=<json> [--cantidad=15] [--semilla=N] [--carpeta=<nombre>] [--sobrescribir]
//
//   Sin --semilla: la fecha de la medición (AAAAMMDD), así repetir la elección da lo mismo.
//   Sin --carpeta: `corrida-<sello de la medición>` dentro de research/revision-del-analisis/.
//
// AVISO: este archivo no pasa por lint ni build. Si cambia la forma de la medición
// (`formato`) o lo que lee `armar-carpetas.mjs` de cada caso, ajustar acá.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { carpetaDeResearch, raizPrincipal } from "../_comun/entorno.mjs";
import { comandoDeConsulta } from "../_comun/consulta-sql.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const PRINCIPAL = raizPrincipal(RAIZ);
const MAXIMO_DE_CASOS = 15; // decisión del negocio, 2026-11-06

// ------------------------------------------------------------------ argumentos
const CONOCIDOS = new Set(["medicion", "cantidad", "semilla", "carpeta", "sobrescribir"]);
const USO = "Uso: node scripts/revision-del-analisis/elegir-casos.mjs --medicion=<json> [--cantidad=15] [--semilla=N] [--carpeta=<nombre>] [--sobrescribir]";
const salirCon = (mensaje) => { console.error(`${mensaje}\n${USO}`); process.exit(1); };
for (const a of process.argv.slice(2)) {
  const nombre = /^--([a-z]+)(=|$)/.exec(a)?.[1];
  if (!nombre || !CONOCIDOS.has(nombre)) salirCon(`Argumento desconocido: ${a}`);
}
const arg = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
if (!arg("medicion")) salirCon("Falta --medicion=<json> (lo que escribió medir-lote.mjs).");
const CANTIDAD = Number(arg("cantidad") ?? MAXIMO_DE_CASOS);
if (!Number.isInteger(CANTIDAD) || CANTIDAD < 1 || CANTIDAD > MAXIMO_DE_CASOS) salirCon(`--cantidad va de 1 a ${MAXIMO_DE_CASOS} (el negocio dictamina hasta ${MAXIMO_DE_CASOS} casos por corrida).`);
if (arg("semilla") !== undefined && !/^\d+$/.test(arg("semilla"))) salirCon("--semilla tiene que ser un entero.");

// La medición se busca donde se pasa y, si no está, en la carpeta principal (un worktree no tiene research/).
const rutaMedicion = [path.resolve(arg("medicion")), path.resolve(PRINCIPAL, arg("medicion"))].find((r) => fs.existsSync(r));
if (!rutaMedicion) salirCon(`No encontré la medición: ${arg("medicion")}`);
const medicion = JSON.parse(fs.readFileSync(rutaMedicion, "utf8"));
if (medicion.formato !== 1 || !Array.isArray(medicion.casos)) salirCon("La medición no tiene el formato 1 que lee este guion: volver a correr medir-lote.mjs.");
if (!medicion.casos.length) salirCon("La medición no tiene casos.");

const sello = /^(\d{4}-\d{2}-\d{2}-\d{6})\.json$/.exec(path.basename(rutaMedicion))?.[1];
const SEMILLA = Number(arg("semilla") ?? (sello ? sello.slice(0, 10).replace(/-/g, "") : String(medicion.generado_el ?? "").slice(0, 10).replace(/-/g, "") || 1));
const NOMBRE_CARPETA = arg("carpeta") ?? `corrida-${sello ?? new Date().toISOString().slice(0, 10)}`;
const CARPETA = path.resolve(carpetaDeResearch(RAIZ, "revision-del-analisis"), NOMBRE_CARPETA);
const SELECCION = path.join(CARPETA, "seleccion.json");
if (fs.existsSync(SELECCION) && !process.argv.includes("--sobrescribir")) {
  salirCon(`Ya existe ${path.relative(PRINCIPAL, SELECCION)}: otra corrida pudo haber armado carpetas con esa selección. Usá otra --carpeta o --sobrescribir.`);
}

// ------------------------------------------------------------------- la base
function consultar(sql) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "elegir-casos-"));
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
    // Sin el SQL en el mensaje: lleva las ids de las personas.
    throw new Error(`La consulta a la base falló: ${String(e.stderr ?? e.message).trim().split(/\r?\n/).slice(-3).join(" ")}`);
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
}
// Lo que va al SQL son ids y un marco que se validan antes: no se arma una consulta con texto libre.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const listaDeUuid = (ids) => {
  const malos = ids.filter((i) => !UUID.test(i));
  if (malos.length) throw new Error(`${malos.length} identificadores que no son uuid en la medición.`);
  return `array[${ids.map((i) => `'${i}'`).join(",")}]::uuid[]`;
};
if (!/^marco-v\d+$/.test(medicion.marco)) salirCon("La medición no trae un marco válido.");

// ------------------------------------------------------------ azar con semilla
// mulberry32: una semilla entera da siempre la misma secuencia.
function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = generador(SEMILLA);
const barajar = (xs) => {
  const s = [...xs];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
};

// ----------------------------------------------------- personas de dos marcos
// El análisis más reciente de OTRO marco, por persona (el piloto comparó marco-v28 con
// marco-v30). Sólo los que tienen score: uno con `fallo` no dice qué opinaba el modelo.
const casos = medicion.casos;
const idsDelLote = [...new Set(casos.map((c) => c.client_id))];
const filasDePares = consultar(`
  select p.client_id, b.id as otro_id, b.rules_version as otro_marco, b.crediscope_score as otro_score,
         b.recomendacion as otro_rec, b.client_profile_id as otro_perfil, b.created_at as otro_fecha
  from unnest(${listaDeUuid(idsDelLote)}) as p(client_id)
  join lateral (select * from analysis_results b
                where b.client_id = p.client_id and b.rules_version <> '${medicion.marco}' and b.crediscope_score is not null
                order by b.created_at desc limit 1) b on true;`);
const parDe = new Map(filasDePares.map((f) => [f.client_id, f]));

// -------------------------------------------------------------------- la elección
const ETIQUETAS = {
  aprobo_sin_razonar: "aprobó sin razonar",
  aprobacion_sin_capacidad: "aprobación sin cuota ni capacidad evidenciada (a confirmar)",
  bloqueo_por_control: "bloqueo por control",
  dos_marcos: "persona con análisis de dos marcos",
  azar: "al azar",
};
const sinSegmento = "sin segmento";
const GRUPOS = [
  { id: "aprobo_sin_razonar", peso: 4, candidatos: () => casos.filter((c) => c.marcas.includes("aprobo_sin_razonar")), estrato: (c) => c.segmento ?? sinSegmento },
  { id: "aprobacion_sin_capacidad", peso: 3, candidatos: () => casos.filter((c) => c.marcas.includes("aprobacion_sin_capacidad")), estrato: (c) => c.segmento ?? sinSegmento },
  // Los bloqueos se reparten por el hallazgo que bloquea, no por segmento: dos bloqueos por
  // el mismo delito enseñan lo mismo, y uno por otra causa enseña otra cosa.
  { id: "bloqueo_por_control", peso: 2, candidatos: () => casos.filter((c) => c.marcas.includes("bloqueo_por_control")), estrato: (c) => c.bloqueos.join("+") || "sin hallazgo bloqueante" },
  // Donde la recomendación cambió entre marcos va primero: es donde un marco nuevo mueve la decisión.
  { id: "dos_marcos", peso: 2, candidatos: () => {
      const conPar = casos.filter((c) => parDe.has(c.client_id));
      const cambio = (c) => parDe.get(c.client_id).otro_rec !== c.recomendacion;
      const mezclados = barajar(conPar);
      return [...mezclados.filter(cambio), ...mezclados.filter((c) => !cambio(c))];
    }, estrato: (c) => c.segmento ?? sinSegmento, yaOrdenados: true },
];

const tomados = new Set(); // client_id: una persona entra una sola vez
const elegidos = [];
function tomar(candidatos, cuanto, estrato, grupo) {
  const out = [];
  const estratos = new Set();
  for (const c of candidatos) {
    if (out.length >= cuanto) break;
    if (tomados.has(c.client_id) || estratos.has(estrato(c))) continue;
    out.push(c); estratos.add(estrato(c)); tomados.add(c.client_id);
  }
  for (const c of candidatos) {
    if (out.length >= cuanto) break;
    if (tomados.has(c.client_id)) continue;
    out.push(c); tomados.add(c.client_id);
  }
  for (const c of out) elegidos.push({ caso: c, grupo });
  return out.length;
}

// Al azar, de 3 a 4 (con 15 casos, 4); el resto, entre los grupos según su peso, con el
// método del mayor resto para que las cuotas sumen justo.
const CUPO_AZAR = Math.min(4, Math.max(1, Math.round(CANTIDAD / 4)));
const paraGrupos = CANTIDAD - CUPO_AZAR;
const pesoTotal = GRUPOS.reduce((s, g) => s + g.peso, 0);
const cuotas = GRUPOS.map((g) => Math.floor((paraGrupos * g.peso) / pesoTotal));
const porRepartir = paraGrupos - cuotas.reduce((s, n) => s + n, 0);
GRUPOS.map((g, i) => ({ i, resto: (paraGrupos * g.peso) / pesoTotal - cuotas[i] }))
  .sort((a, b) => b.resto - a.resto || a.i - b.i).slice(0, porRepartir).forEach(({ i }) => cuotas[i]++);

const disponibles = GRUPOS.map((g) => {
  const c = g.candidatos();
  return { ...g, lista: g.yaOrdenados ? c : barajar(c) };
});
const delGrupo = new Map(GRUPOS.map((g) => [g.id, 0]));
disponibles.forEach((g, i) => delGrupo.set(g.id, tomar(g.lista, cuotas[i], g.estrato, g.id)));
// Lo que un grupo no llenó pasa a los siguientes, en el mismo orden de prioridad.
for (const g of disponibles) {
  const faltan = paraGrupos - elegidos.length;
  if (faltan <= 0) break;
  delGrupo.set(g.id, delGrupo.get(g.id) + tomar(g.lista, faltan, g.estrato, g.id));
}
const alAzar = tomar(barajar(casos), CANTIDAD - elegidos.length, () => "azar", "azar");

// -------------------------------------------------------- seleccion.json
const cedulas = new Map(consultar(`select id as client_id, cedula from clients where id = any(${listaDeUuid(elegidos.map((e) => e.caso.client_id))});`).map((f) => [f.client_id, f.cedula]));
const corto = (c) => `c-${String(c.client_id).slice(0, 8)}`;
const abreviar = (marco) => String(marco).replace(/^marco-/, "");
const seleccion = elegidos.map(({ caso, grupo }) => {
  const par = parDe.get(caso.client_id);
  const otras = caso.marcas.filter((m) => m !== grupo && ETIQUETAS[m]).map((m) => ETIQUETAS[m]);
  const motivo = [
    ETIQUETAS[grupo],
    otras.length ? `también: ${otras.join(", ")}` : null,
    par ? `dos marcos: ${abreviar(par.otro_marco)} ${par.otro_rec} ${par.otro_score} -> ${abreviar(medicion.marco)} ${caso.recomendacion} ${caso.score}` : null,
  ].filter(Boolean).join(" · ");
  return {
    // Los que lee armar-carpetas.mjs.
    perfil: caso.perfil_id, clientId: caso.client_id, cedula: cedulas.get(caso.client_id) ?? null, segmento: caso.segmento ?? sinSegmento,
    // Sólo es el de marco-v28 si el otro marco lo es: armar-carpetas lo guarda como respuesta-v28.json.
    ...(par?.otro_marco === "marco-v28" ? { analisis28: par.otro_id } : {}),
    // No hay decisión de la institución para estas personas: son los análisis de producción, no la base de prueba.
    aws: null, perfilFinal: null,
    // Para quien mira la selección.
    analisisId: caso.analisis_id, score: caso.score, rec: caso.recomendacion, marcas: caso.marcas,
    ...(par ? { otroMarco: { marco: par.otro_marco, analisisId: par.otro_id, perfil: par.otro_perfil, score: par.otro_score, rec: par.otro_rec, fecha: par.otro_fecha } } : {}),
    motivo,
  };
});
if (seleccion.some((s) => !s.cedula)) throw new Error("A un caso elegido no se le encontró la cédula; no se escribe una selección que armar-carpetas no puede leer.");

fs.mkdirSync(CARPETA, { recursive: true });
fs.writeFileSync(SELECCION, JSON.stringify(seleccion, null, 1), "utf8");
fs.writeFileSync(path.join(CARPETA, "eleccion.json"), JSON.stringify({
  formato: 1,
  elegido_el: new Date().toISOString(),
  medicion: path.relative(PRINCIPAL, rutaMedicion).replace(/\\/g, "/"),
  marco: medicion.marco,
  periodo: medicion.periodo,
  cantidad: seleccion.length,
  cantidad_pedida: CANTIDAD,
  semilla: SEMILLA,
  cuotas: Object.fromEntries(GRUPOS.map((g, i) => [g.id, cuotas[i]])),
  cuota_al_azar: CUPO_AZAR,
  candidatos: Object.fromEntries([...disponibles.map((g) => [g.id, g.lista.length]), ["azar", casos.length]]),
  elegidos_por_grupo: Object.fromEntries([...delGrupo, ["azar", alAzar]]),
  casos: elegidos.map(({ caso, grupo }) => ({ caso: corto(caso), grupo })),
}, null, 2), "utf8");

// ------------------------------------------------------------------- consola
console.log(`Elección sobre ${medicion.marco}: ${seleccion.length} de ${casos.length} análisis (semilla ${SEMILLA}).`);
for (const g of disponibles) console.log(`  ${ETIQUETAS[g.id]}: ${delGrupo.get(g.id)} de ${g.lista.length} candidatos (cuota ${cuotas[GRUPOS.findIndex((x) => x.id === g.id)]})`);
console.log(`  al azar: ${alAzar} de ${casos.length} (cuota ${CUPO_AZAR})`);
if (seleccion.length < CANTIDAD) console.log(`  OJO: sólo hubo ${seleccion.length} de los ${CANTIDAD} casos pedidos.`);
for (const { caso, grupo } of elegidos) console.log(`  ${corto(caso)}  ${ETIQUETAS[grupo]}`);
console.log(`Escrito: ${path.relative(PRINCIPAL, SELECCION).replace(/\\/g, "/")}`);
// Ruta completa: armar-carpetas la resuelve desde donde se corra, y desde un worktree research/ no existe.
console.log(`Siguiente paso: node scripts/revision-del-analisis/armar-carpetas.mjs --carpeta="${CARPETA}"`);
