// La matriz de entrenamiento del nivel 2 del predictor de ingresos, armada desde el crudo de Equifax con el mismo código que sirve el modelo
// (docs/especificacion-predictor-de-ingresos.md, sección 9, punto 1: «entrenar con las variables que arma este módulo sobre las respuestas JSON
// crudas»). Cada respuesta pasa por `derivarTablas` y por `vectorDeNivel2`, con la fecha de la consulta como reloj; ninguna regla se copia acá.
//
// Por qué existe: el nivel 2 se entrenó con el extracto de AWS, y 19 variables de cuotas, saldos y conteos salieron de las listas de
// `interconnectResponse`, no de `equifax_operaciones`. En producción se arman de `equifax_operaciones` (coinciden entre 48,7% y 100%), así
// que el modelo recibiría otra cosa que lo que aprendió. Entrenar sobre lo que arma el módulo cierra esa brecha, y este guion mide con
// cuántos casos etiquetados se puede hacer.
//
// Entradas (fuera de git, datos de personas): los lotes de `research/ingresos-aws/crudo-equifax/` de la carpeta principal (manifiesto.jsonl +
// json/lote-NNNNNN.jsonl.gz, una fila de AWS por línea) y la tabla de entrenamiento `personas.parquet` (preparar.py).
// Salidas (fuera de git): `C:/datos/ingresos/resultados/matriz-crudo/` — matriz-nivel2.csv (una fila por consulta, con la id de consulta de
// AWS), fallas.jsonl (ids y motivo) y resumen.json (sólo conteos y porcentajes). A git sólo va el guion y, con --resumen-git, el resumen.
//
// No consulta AWS, Proveedor_Info_1, Equifax ni el modelo de lenguaje, y no escribe en la base. No entrena. La edad, el sexo, el estado civil,
// la zona y el IESS no salen del crudo de Equifax: la matriz no los lleva y se cruzan por la id de consulta con la tabla (preparar.py).
//
//   node scripts/predictor-ingresos/matriz-desde-crudo.mjs
//   node scripts/predictor-ingresos/matriz-desde-crudo.mjs --limite=500 --sin-cruce      (prueba rápida)
//   node scripts/predictor-ingresos/matriz-desde-crudo.mjs --resumen-git=scripts/predictor-ingresos/metricas/matriz-desde-crudo-2026-11.json
//
// Opciones: --carpeta= (el crudo), --salida=, --tabla=, --python=, --limite=N, --sin-cruce, --resumen-git=<ruta>.
//
// AVISO: este archivo no pasa por lint ni build ni por el control `guiones`. Antes de commitear: `node --check` y una corrida con --limite.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { raizPrincipal } from "../_comun/entorno.mjs";
import { derivarTablas, EQUIFAX_TABLAS_VERSION, rolDeEquifax } from "../../supabase/functions/_shared/equifax-tablas.ts";
import {
  VARIABLES_DE_INGRESO_VERSION, VARIABLES_DE_LA_PERSONA, VARIABLES_DEL_NIVEL_2, vectorDeNivel2,
} from "../../supabase/functions/_shared/variables-de-ingreso.ts";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const PRINCIPAL = raizPrincipal(RAIZ);

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------
const argumentos = process.argv.slice(2);
const valor = (nombre) => argumentos.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const hay = (nombre) => argumentos.includes(`--${nombre}`);
const morir = (texto) => { console.error(texto); process.exit(1); };

// Las mismas variables de entorno y rutas que comun.py.
const RAIZ_DATOS = process.env.PREDICTOR_DATOS ?? "C:/datos/ingresos";
const CARPETA = valor("carpeta") ?? path.join(PRINCIPAL, "research", "ingresos-aws", "crudo-equifax");
const SALIDA = valor("salida") ?? path.join(RAIZ_DATOS, "resultados", "matriz-crudo");
const TABLA = valor("tabla") ?? path.join(process.env.PREDICTOR_RESULTADOS ?? path.join(RAIZ_DATOS, "resultados", "predictor-ingresos"), "personas.parquet");
const PYTHON = valor("python") ?? path.join(RAIZ_DATOS, "entorno", "Scripts", "python.exe");
const LIMITE = valor("limite") ? Number(valor("limite")) : Infinity;
const SIN_CRUCE = hay("sin-cruce");
const RESUMEN_GIT = valor("resumen-git");
if (!Number.isFinite(LIMITE) && LIMITE !== Infinity) morir("--limite pide un número.");
if (!fs.existsSync(path.join(CARPETA, "manifiesto.jsonl"))) morir(`No hay manifiesto en ${CARPETA}.`);

// Las variables que salen del crudo de Equifax: todas las del nivel 2 menos las de la persona, y la fecha (`anio_mes`), que sale del reloj.
const VARIABLES = VARIABLES_DEL_NIVEL_2.filter((v) => v === "anio_mes" || !VARIABLES_DE_LA_PERSONA.includes(v));
// Las 19 variables de cuotas, saldos y conteos que el extracto de AWS sacó de otra lista (sección 9, punto 1) y su paridad medida el
// 2026-10-22 con 5.001 respuestas desde `equifax_operaciones`.
const LAS_19 = [
  ["c_consumo", 48.7], ["c_tarjeta", 50.4], ["c_micro", 88.2], ["c_vivienda", 91.9], ["c_comercial", 98.3], ["c_educativo", 100],
  ["s_consumo", 78.6], ["s_tarjeta", 94.7], ["s_micro", 98.9], ["s_vivienda", 99.5],
  ["n_consumo", 65.1], ["n_tarjeta", 94.1], ["n_micro", 98.8], ["n_vivienda", 99.5],
  ["c_codeudor", 92.9], ["max_dias_t", 87.6], ["n_oper", 65.6], ["saldo", 84.4], ["max_mora", 88.8],
];
// Los tres totales sólo se comparan donde el extracto tiene dato (así los midió la prueba de paridad): la tabla de AWS los trae para 4.783 de 5.001.
const SOLO_CON_DATO_DEL_EXTRACTO = new Set(["n_oper", "saldo", "max_mora"]);
const TOLERANCIA = { sri_antig: 0.0005, sri_susp: 0.0005, anio_mes: 1e-6, g6: 0.01, g12: 0.01 }; // el resto, 0,02 (las sumas se guardan a centavos)
const CORTE_FECHA = "2026-07-01"; // comun.py: se entrena hasta junio y se mide de julio a octubre

const pct = (a, b) => (b === 0 ? "—" : `${((100 * a) / b).toFixed(1).replace(".", ",")}%`);
const redondeo = (a, b) => (b === 0 ? null : Math.round((1000 * a) / b) / 10);

// Las fechas de AWS vienen sin zona: son hora de Ecuador (UTC-5, sin horario de verano). Se dice acá y no se deja a la zona de la máquina:
// la misma fecha da otro día calendario según dónde corra el guion.
function fechaDeEcuador(texto) {
  const t = String(texto ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) return null;
  const d = new Date(t.replace(/(\.\d{3})\d*$/, "$1") + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? "" : "-05:00"));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// 0. La tabla de entrenamiento (sólo si hay cruce): se lee antes para que, al pasar por cada consulta que cruza, se mida también la alternativa
// ---------------------------------------------------------------------------
function cargarExtracto() {
  if (!fs.existsSync(TABLA)) morir(`No existe la tabla de entrenamiento ${TABLA}.`);
  if (!fs.existsSync(PYTHON)) morir(`No existe el Python del predictor ${PYTHON} (--python=).`);
  fs.mkdirSync(SALIDA, { recursive: true });
  const extractoRuta = path.join(SALIDA, "extracto-entrenamiento.jsonl"); // vuelco temporal de la tabla, fuera de git
  const salidaPython = execFileSync(PYTHON, ["-I", path.join(RAIZ, "scripts", "predictor-ingresos", "extracto_para_cruce.py"), extractoRuta], {
    encoding: "utf8", env: { ...process.env, PREDICTOR_DATOS: RAIZ_DATOS, PREDICTOR_RESULTADOS: path.dirname(TABLA) }, maxBuffer: 1 << 24,
  });
  const meta = JSON.parse(salidaPython.trim().split("\n").pop());
  // Los nombres son los de comun.py (NIVELES[2]): si cambian, este guion se detiene en vez de comparar variables distintas.
  const delModulo = [...VARIABLES_DEL_NIVEL_2].sort().join(",");
  if ([...meta.nivel2].sort().join(",") !== delModulo) morir(`Las variables del nivel 2 de comun.py no son las de variables-de-ingreso.ts:\n  comun.py: ${meta.nivel2.join(", ")}\n  módulo:   ${VARIABLES_DEL_NIVEL_2.join(", ")}`);
  const sinColumna = VARIABLES.filter((n) => n !== "anio_mes" && !meta.variables_de_equifax.includes(n));
  if (sinColumna.length > 0) morir(`El extracto no trae ${sinColumna.join(", ")}.`);
  const filas = new Map();
  for (const linea of fs.readFileSync(extractoRuta, "utf8").split("\n")) {
    if (!linea.trim()) continue;
    const f = JSON.parse(linea);
    filas.set(String(f.id_consulta_equifax), f);
  }
  fs.rmSync(extractoRuta); // la tabla trae el ingreso de personas: no se deja una copia en disco
  return { filas, meta };
}
const extracto = SIN_CRUCE ? null : cargarExtracto();

// La alternativa medida el 2026-10-22 y NO construida (sección 9, punto 1): las operaciones salen de las listas DetalleDeudaActualReportada* de
// `interconnectResponse`, de donde salió el extracto de AWS, no de `reporteCrediticio`. Se repite acá, a propósito, sólo como diagnóstico de las
// consultas que cruzan, para decir cuánto se parece cada fuente al extracto; ninguna variable de la matriz sale de aquí.
const LISTAS_DE_LA_IR = ["DetalleDeudaActualReportadaRFRSBS", "DetalleDeudaActualReportadaSICOMSBS", "DetalleDeudaActualReportadaSBSSBS_Educativo"];
const numeroOpcional = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const operacionesDeLaIr = (cuerpo) => LISTAS_DE_LA_IR.flatMap((k) => (Array.isArray(cuerpo.interconnectResponse?.[k]) ? cuerpo.interconnectResponse[k] : [])).map((f) => {
  const { rol, original } = rolDeEquifax(f.Tipo_Riesgo);
  return {
    rol, rol_original: original, tipo_credito: typeof f.Tipo_Credito === "string" ? f.Tipo_Credito : null,
    cuota_mensual_usd: numeroOpcional(f.Cuota_Mensual), saldo_deuda_usd: numeroOpcional(f.Saldo_Deuda), dias_morosidad: numeroOpcional(f.Dias_Venc),
  };
});

// ---------------------------------------------------------------------------
// 1. Leer los lotes y armar el vector de cada consulta
// ---------------------------------------------------------------------------
const lotes =fs.readFileSync(path.join(CARPETA, "manifiesto.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const cuenta = { lotes_en_manifiesto: lotes.length, lotes_sin_archivo: 0, filas_en_manifiesto: lotes.reduce((s, l) => s + (l.filas ?? 0), 0), filas_leidas: 0 };
const fallas = new Map(); // motivo -> cuántas
const ejemplosDeFalla = []; // { id, motivo }: sólo en fallas.jsonl, fuera de git
const avisosPorTexto = new Map();
const sumar = (mapa, clave, n = 1) => mapa.set(clave, (mapa.get(clave) ?? 0) + n);
const vistas = new Set();
const registros = []; // { id, fecha, estado, conReporte, nAvisos, v: {variable: valor} }

function fallar(id, motivo) {
  sumar(fallas, motivo);
  ejemplosDeFalla.push({ id, motivo });
}

function procesar(linea) {
  let fila;
  try { fila = JSON.parse(linea); } catch { fallar(null, "la línea no es JSON"); return; }
  const id = fila.id_consulta_equifax;
  if (id === undefined || id === null) { fallar(null, "la fila no trae id_consulta_equifax"); return; }
  if (vistas.has(String(id))) { fallar(id, "id de consulta repetida (se conserva la primera)"); return; }
  vistas.add(String(id));
  const fecha = fechaDeEcuador(fila.fecha_consulta ?? fila.fecha_consulta_equifax);
  if (fecha === null) { fallar(id, "fecha de consulta ausente o ilegible"); return; }
  let cuerpo = fila.response_json;
  if (typeof cuerpo === "string") { try { cuerpo = JSON.parse(cuerpo); } catch { fallar(id, "response_json es un texto que no es JSON"); return; } }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) { fallar(id, "sin response_json (la consulta no guardó la respuesta)"); return; }

  let derivado;
  try { derivado = derivarTablas(cuerpo); } catch (e) { fallar(id, `derivarTablas lanzó: ${String(e?.message ?? e).slice(0, 80)}`); return; }
  let vector;
  try {
    // El perfil va vacío: la persona no sale de Equifax. El reloj es la fecha de la consulta, para que la misma respuesta dé siempre lo mismo.
    vector = vectorDeNivel2({}, derivado.tablas, { ahora: fecha, consultadoEl: fecha });
  } catch (e) { fallar(id, `vectorDeNivel2 lanzó: ${String(e?.message ?? e).slice(0, 80)}`); return; }

  // El diagnóstico de la alternativa, sólo donde la consulta cruza con la tabla de entrenamiento.
  let alt = null;
  if (extracto?.filas.has(String(id))) {
    try {
      const v = vectorDeNivel2({}, { ...derivado.tablas, equifax_operaciones: operacionesDeLaIr(cuerpo) }, { ahora: fecha, consultadoEl: fecha }).variables;
      alt = Object.fromEntries(LAS_19.map(([n]) => [n, v[n] ?? null]));
    } catch { alt = null; }
  }

  for (const a of derivado.avisos) sumar(avisosPorTexto, `derivarTablas: ${a.replace(/\d+/g, "N")}`);
  for (const a of vector.avisos) if (!a.startsWith("Sin el historial del IESS")) sumar(avisosPorTexto, `variables-de-ingreso: ${a.replace(/\d+/g, "N")}`);
  registros.push({
    id: String(id),
    fecha: String(fila.fecha_consulta ?? fila.fecha_consulta_equifax).slice(0, 19),
    estado: fila.estado ?? null,
    conReporte: Boolean(cuerpo.reporteCrediticio && typeof cuerpo.reporteCrediticio === "object"),
    nAvisos: derivado.avisos.length,
    alt,
    v: Object.fromEntries(VARIABLES.map((n) => [n, vector.variables[n] ?? null])),
  });
}

const t0 = Date.now();
lectura: for (const lote of lotes) {
  const ruta = path.join(CARPETA, lote.archivo);
  if (!fs.existsSync(ruta)) { cuenta.lotes_sin_archivo++; continue; }
  const texto = zlib.gunzipSync(fs.readFileSync(ruta)).toString("utf8");
  for (const linea of texto.split("\n")) {
    if (!linea.trim()) continue;
    if (cuenta.filas_leidas >= LIMITE) break lectura;
    cuenta.filas_leidas++;
    procesar(linea);
  }
}
console.log(`Leídas ${cuenta.filas_leidas} consultas de ${cuenta.lotes_en_manifiesto - cuenta.lotes_sin_archivo} lotes en ${Math.round((Date.now() - t0) / 1000)} s (el manifiesto dice ${cuenta.filas_en_manifiesto}).`);

const procesadas = registros.length;
const sinReporte = registros.filter((r) => !r.conReporte).length;
const estadoNoUno = registros.filter((r) => r.estado !== 1).length;
const ids = registros.map((r) => Number(r.id));
const idMin = Math.min(...ids);
const idMax = Math.max(...ids);
console.log(`Procesadas: ${procesadas}. Fallaron: ${cuenta.filas_leidas - procesadas}. Sin reporteCrediticio entre las procesadas: ${sinReporte}. Con estado distinto de 1: ${estadoNoUno}.`);
for (const [motivo, n] of [...fallas.entries()].sort((a, b) => b[1] - a[1])) console.log(`  falla — ${motivo}: ${n}`);
if (avisosPorTexto.size > 0) {
  console.log("Avisos de la derivación (consultas con cada aviso):");
  for (const [texto, n] of [...avisosPorTexto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(6)}  ${texto.slice(0, 150)}`);
}

// ---------------------------------------------------------------------------
// 2. Escribir la matriz
// ---------------------------------------------------------------------------
fs.mkdirSync(SALIDA, { recursive: true });
const csv = (v) => {
  if (v === null || v === undefined) return "";
  const t = String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const CABECERA = ["id_consulta_equifax", "fecha_consulta", "estado_aws", "con_reporte", "n_avisos", ...VARIABLES];
fs.writeFileSync(
  path.join(SALIDA, "matriz-nivel2.csv"),
  [CABECERA.join(","), ...registros.map((r) => [r.id, r.fecha, r.estado, r.conReporte ? 1 : 0, r.nAvisos, ...VARIABLES.map((n) => r.v[n])].map(csv).join(","))].join("\n") + "\n",
  "utf8",
);
fs.writeFileSync(path.join(SALIDA, "fallas.jsonl"), ejemplosDeFalla.map((f) => JSON.stringify(f)).join("\n") + (ejemplosDeFalla.length ? "\n" : ""), "utf8");
console.log(`Matriz: ${path.join(SALIDA, "matriz-nivel2.csv")} (${procesadas} filas, ${CABECERA.length} columnas).`);

// Vacíos de cada variable (sobre las procesadas).
const vacios = (filas) => Object.fromEntries(VARIABLES.map((n) => [n, redondeo(filas.filter((r) => r.v[n] === null).length, filas.length)]));
const vaciosTodas = vacios(registros);

const resumen = {
  generado: new Date().toISOString().slice(0, 10),
  version_de_las_tablas: EQUIFAX_TABLAS_VERSION,
  version_de_las_variables: VARIABLES_DE_INGRESO_VERSION,
  commit_al_correr: (() => { try { return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: RAIZ, encoding: "utf8" }).trim(); } catch { return null; } })(),
  entrada: { ...cuenta, rango_de_ids: [idMin, idMax], reloj: "la fecha de la consulta, hora de Ecuador (UTC-5)" },
  procesadas,
  fallaron: cuenta.filas_leidas - procesadas,
  fallas: Object.fromEntries(fallas),
  procesadas_sin_reporteCrediticio: sinReporte,
  procesadas_con_estado_distinto_de_1: estadoNoUno,
  avisos_de_la_derivacion: Object.fromEntries(avisosPorTexto),
  variables: VARIABLES,
  vacio_por_variable_pct: vaciosTodas,
};

// ---------------------------------------------------------------------------
// 3. Cruce con la tabla de entrenamiento y paridad
// ---------------------------------------------------------------------------
function cruzar() {
  const { meta } = extracto;

  const grupoDeRespuesta = (m) => (m === "OK FACTURAR" ? "ok_facturar" : m === "OK FACTURAR CONDICIONADO" ? "condicionado" : "otra");
  const periodo = (t) => (String(t).slice(0, 10) < CORTE_FECHA ? "hasta_junio_2026" : "desde_julio_2026");
  const nuevoConteo = () => ({ total: 0, ok_facturar: 0, condicionado: 0, otra: 0, hasta_junio_2026: 0, desde_julio_2026: 0, ok_o_condicionado_hasta_junio_2026: 0, ok_o_condicionado_desde_julio_2026: 0 });
  const sumarEn = (c, f) => {
    c.total++;
    c[grupoDeRespuesta(f.med_resp)]++;
    c[periodo(f.t)]++;
    if (grupoDeRespuesta(f.med_resp) !== "otra") c[`ok_o_condicionado_${periodo(f.t)}`]++;
  };

  const porId = new Map(registros.map((r) => [r.id, r]));
  const poblacion = nuevoConteo(); // las que entrenan: con el bloque del SRI en el extracto
  const cruzan = nuevoConteo();
  const faltan = nuevoConteo();
  const sinBloqueCruzan = nuevoConteo();
  const idsQueFaltan = [];
  const faltanPorRango = { por_debajo_del_rango_bajado: 0, dentro_del_rango_sin_archivo: 0, por_encima_del_rango_bajado: 0 };
  const porMes = new Map(); // mes -> { entrenan, cruzan }
  let fechaIgual = 0;
  let fechaDistinta = 0;
  let bloqueConcuerda = 0;
  const cruzadas = []; // { r, f }
  for (const [id, f] of extracto.filas) {
    const r = porId.get(id);
    if (f.sri_bloque) {
      sumarEn(poblacion, f);
      const mes = String(f.t).slice(0, 7);
      const m = porMes.get(mes) ?? { entrenan: 0, cruzan: 0 };
      m.entrenan++;
      if (r) m.cruzan++;
      porMes.set(mes, m);
      if (!r) {
        sumarEn(faltan, f);
        const n = Number(id);
        idsQueFaltan.push(n);
        faltanPorRango[n < idMin ? "por_debajo_del_rango_bajado" : n > idMax ? "por_encima_del_rango_bajado" : "dentro_del_rango_sin_archivo"]++;
      }
    }
    if (r) {
      sumarEn(f.sri_bloque ? cruzan : sinBloqueCruzan, f);
      cruzadas.push({ r, f });
      if (r.fecha === String(f.t).slice(0, 19)) fechaIgual++; else fechaDistinta++;
      if ((r.v.sri_ruc !== null) === Boolean(f.sri_bloque)) bloqueConcuerda++;
    }
  }
  const sinFilaEnLaTabla = registros.length - cruzadas.length;

  // La paridad de cada variable de Equifax sobre las que cruzan.
  const anioMesDe = (r) => { const [a, m] = r.fecha.slice(0, 7).split("-").map(Number); return a + (m - 1) / 12; };
  const compara = (nombre, a, e) => {
    if (a === null && e === null) return "coincide";
    if (e === null) return "sobra";
    if (a === null) return "falta";
    if (typeof a === "string" || typeof e === "string") return String(a).toUpperCase() === String(e).toUpperCase() ? "coincide" : "distinto";
    return Math.abs(a - e) <= (TOLERANCIA[nombre] ?? 0.02) ? "coincide" : "distinto";
  };
  // `origen` es de dónde sale el valor que se compara: «v» es la matriz (lo que arma el módulo) y «alt» la alternativa medida, no construida.
  function paridad(filas, nombre, origen = "v") {
    const r = { n: 0, coincide: 0, falta_en_la_matriz: 0, sobra_en_la_matriz: 0, distinto: 0, sin_dato_en_el_extracto: 0, con_dato_en_el_extracto: 0, coincide_con_dato: 0 };
    for (const { r: reg, f } of filas) {
      const e = nombre === "anio_mes" ? anioMesDe(reg) : (f[nombre] ?? null);
      if (SOLO_CON_DATO_DEL_EXTRACTO.has(nombre) && e === null) { r.sin_dato_en_el_extracto++; continue; }
      r.n++;
      const c = compara(nombre, reg[origen]?.[nombre] ?? null, e);
      // «Nulo contra nulo» coincide y infla el porcentaje donde la mayoría no tiene el dato (c_educativo, c_comercial): aparte se mide
      // sólo donde el extracto tiene valor, que es donde el modelo aprendió algo.
      if (e !== null) { r.con_dato_en_el_extracto++; if (c === "coincide") r.coincide_con_dato++; }
      if (c === "coincide") r.coincide++;
      else if (c === "falta") r.falta_en_la_matriz++;
      else if (c === "sobra") r.sobra_en_la_matriz++;
      else r.distinto++;
    }
    return { ...r, coincide_pct: redondeo(r.coincide, r.n), coincide_con_dato_pct: redondeo(r.coincide_con_dato, r.con_dato_en_el_extracto) };
  }
  const queEntrenan = cruzadas.filter(({ f }) => f.sri_bloque);
  const paridadPorVariable = Object.fromEntries(VARIABLES.map((n) => [n, paridad(queEntrenan, n)]));
  const sinAlternativa = queEntrenan.filter(({ r }) => r.alt === null).length; // si la alternativa no se pudo armar, la comparación sería de nulos
  if (sinAlternativa > 0) console.warn(`AVISO: la alternativa de las listas de interconnectResponse no se pudo armar en ${sinAlternativa} consultas que cruzan.`);
  const paridadAlternativa = Object.fromEntries(LAS_19.map(([n]) => [n, paridad(queEntrenan.filter(({ r }) => r.alt !== null), n, "alt")]));
  const vaciosExtracto = Object.fromEntries(VARIABLES.map((n) => [n, n === "anio_mes" ? 0 : redondeo(queEntrenan.filter(({ f }) => (f[n] ?? null) === null).length, queEntrenan.length)]));
  const vaciosMatriz = vacios(queEntrenan.map(({ r }) => r));

  resumen.cruce = {
    tabla: { archivo: path.basename(TABLA), filas: meta.filas, sha256_12: meta.tabla_sha256.slice(0, 12) },
    entrenan_en_la_tabla_con_bloque_del_sri: poblacion,
    cruzan_con_la_matriz_y_entrenan: cruzan,
    faltan_del_respaldo: faltan,
    faltan_segun_el_rango_de_ids_bajado: faltanPorRango,
    faltan_rango_de_ids: idsQueFaltan.length ? [Math.min(...idsQueFaltan), Math.max(...idsQueFaltan)] : null,
    cruzan_sin_bloque_del_sri_en_la_tabla: sinBloqueCruzan,
    consultas_de_la_matriz_sin_fila_en_la_tabla: sinFilaEnLaTabla,
    cruzan_con_la_misma_fecha_de_consulta: fechaIgual,
    cruzan_con_otra_fecha_de_consulta: fechaDistinta,
    el_bloque_del_sri_de_la_matriz_concuerda_con_la_tabla: bloqueConcuerda,
    por_mes: Object.fromEntries([...porMes.entries()].sort()),
  };
  resumen.paridad_de_las_que_cruzan_y_entrenan = { n: queEntrenan.length, variables: paridadPorVariable };
  resumen.paridad_de_la_alternativa_de_las_listas_de_interconnectResponse_no_construida = { n: queEntrenan.length - sinAlternativa, variables: paridadAlternativa };
  resumen.vacio_por_variable_pct_de_las_que_cruzan_y_entrenan = { matriz: vaciosMatriz, extracto: vaciosExtracto };

  // ---- salida en pantalla
  const linea = (nombre, c) => `  ${nombre.padEnd(46)} ${String(c.total).padStart(6)}   OK FACTURAR ${String(c.ok_facturar).padStart(5)}   condicionado ${String(c.condicionado).padStart(5)}   otras ${String(c.otra).padStart(5)}   hasta junio ${String(c.hasta_junio_2026).padStart(5)}   desde julio ${String(c.desde_julio_2026).padStart(5)}`;
  console.log(`\nCruce con la tabla de entrenamiento (${meta.filas} personas; huella ${meta.tabla_sha256.slice(0, 12)}):`);
  console.log(linea("entrenan (tabla, con bloque del SRI)", poblacion));
  console.log(linea("cruzan con la matriz", cruzan));
  console.log(linea("faltan del respaldo", faltan));
  console.log(`  OK FACTURAR y condicionado, hasta junio / desde julio: entrenan ${poblacion.ok_o_condicionado_hasta_junio_2026} / ${poblacion.ok_o_condicionado_desde_julio_2026}, cruzan ${cruzan.ok_o_condicionado_hasta_junio_2026} / ${cruzan.ok_o_condicionado_desde_julio_2026}, faltan ${faltan.ok_o_condicionado_hasta_junio_2026} / ${faltan.ok_o_condicionado_desde_julio_2026}.`);
  if (idsQueFaltan.length) console.log(`  Las que faltan tienen ids de ${Math.min(...idsQueFaltan)} a ${Math.max(...idsQueFaltan)}.`);
  console.log(`  Los que faltan, según el rango de ids bajado (${idMin} a ${idMax}): por debajo ${faltanPorRango.por_debajo_del_rango_bajado}, dentro del rango y sin archivo ${faltanPorRango.dentro_del_rango_sin_archivo}, por encima ${faltanPorRango.por_encima_del_rango_bajado}.`);
  console.log(`  Cruzan pero la tabla los marca sin bloque del SRI: ${sinBloqueCruzan.total}. Consultas de la matriz sin fila en la tabla (no son la consulta más reciente de un independiente con ingreso no verificado): ${sinFilaEnLaTabla}.`);
  console.log(`  Misma fecha de consulta que la tabla: ${fechaIgual} de ${fechaIgual + fechaDistinta}. El bloque del SRI de la matriz concuerda con la tabla: ${bloqueConcuerda} de ${cruzadas.length}.`);
  console.log("  Por mes de la consulta (entrenan / cruzan):", [...porMes.entries()].sort().map(([m, c]) => `${m} ${c.entrenan}/${c.cruzan}`).join(", "));

  const fila = (nombre, p, referencia) => `  ${nombre.padEnd(14)} ${String(p.n).padStart(5)}  ${pct(p.coincide, p.n).padStart(7)}  falta ${String(p.falta_en_la_matriz).padStart(4)}  sobra ${String(p.sobra_en_la_matriz).padStart(4)}  distinto ${String(p.distinto).padStart(4)}  con dato en el extracto ${String(p.con_dato_en_el_extracto).padStart(5)}: ${pct(p.coincide_con_dato, p.con_dato_en_el_extracto).padStart(7)}${referencia === undefined ? "" : `   (2026-10-22 con 5.001: ${String(referencia).replace(".", ",")}%)`}`;
  console.log(`\nParidad de las 19 variables contra el extracto, sobre las ${queEntrenan.length} que cruzan y entrenan (falta = el extracto tiene dato y la matriz no; sobra = al revés):`);
  for (const [n, ref] of LAS_19) console.log(fila(n, paridadPorVariable[n], ref));
  console.log("\nLas demás variables de Equifax contra el extracto:");
  for (const n of VARIABLES) if (!LAS_19.some(([x]) => x === n)) console.log(fila(n, paridadPorVariable[n]));
  console.log("\nDiagnóstico, NO construido: las mismas 19 armadas desde las listas DetalleDeudaActualReportada* de interconnectResponse, contra el extracto:");
  for (const [n] of LAS_19) console.log(fila(n, paridadAlternativa[n]));
}

if (!SIN_CRUCE) cruzar();
else console.log("Sin cruce con la tabla de entrenamiento (--sin-cruce).");

console.log("\nVacío por variable en la matriz (todas las procesadas):", VARIABLES.map((n) => `${n} ${String(vaciosTodas[n]).replace(".", ",")}%`).join(", "));

fs.writeFileSync(path.join(SALIDA, "resumen.json"), JSON.stringify(resumen, null, 2) + "\n", "utf8");
console.log(`Resumen: ${path.join(SALIDA, "resumen.json")}`);
if (RESUMEN_GIT) {
  const destino = path.resolve(RAIZ, RESUMEN_GIT);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(resumen, null, 2) + "\n", "utf8");
  console.log(`Resumen agregado para git: ${destino}`);
}
