// Paso 1 de cada corrida de la revisión del análisis: mide, sin modelo, un lote de
// análisis de producción y deja el resultado en un JSON que lee el paso 2
// (`elegir-casos.mjs`). Porta las mediciones sueltas del piloto del 2026-11-06
// (lenguaje, razonamiento, cuotas) para que el jefe de crédito no gaste el modelo
// en lo que se cuenta con un guion.
//
// Mide, sobre los análisis de `analysis_results` de un marco y un período, sin las
// personas sintéticas (`clients.es_sintetico`):
//   - recomendación contra score: las bandas de cada recomendación y dónde se pisan;
//   - razonamiento: análisis con 0 tokens de razonamiento y qué recomendó el modelo
//     según razonó o no;
//   - lenguaje: aperturas, frases idénticas, similitud entre narrativas, términos
//     retirados por el negocio y fórmulas que se repiten;
//   - aprobaciones que dicen no conocer la cuota o la capacidad (detector de
//     texto: «a confirmar», no es un dictamen);
//   - pedidos de cuota cuando la persona tiene una consulta de Equifax en
//     `consultas_equifax`;
//   - cuántos tienen estimación del predictor en `research/estimaciones-en-lote/`
//     (el último archivo).
//
// Por qué cada medición existe (piloto, 12 casos): de 247 análisis marco-v30, 120
// salieron sin razonamiento y sin razonar el modelo aprobó el 39% (45 de 116)
// contra el 6% razonando (8 de 127); 142 llamaban «cliente» a la persona y 179
// abrían con «el comportamiento de». Ninguna de esas tres cosas la ve quien
// revisa un caso por vez.
//
// SÓLO LECTURA. No escribe en la base (plan Free, casi llena), no abre ejecución
// operativa y no llama a Anthropic, Equifax ni Proveedor_Info_1.
//
// Por consola sólo salen conteos «x de N» y referencias c-xxxxxxxx (los 8 primeros
// caracteres de clients.id): nunca una cédula, un nombre ni un monto. El JSON no
// lleva cédulas ni textos del análisis; lleva los identificadores internos que
// necesita el paso 2. Sale a research/, fuera de git.
//
// Uso:
//   node scripts/revision-del-analisis/medir-lote.mjs [--marco=marco-vNN] [--desde=AAAA-MM-DD] [--hasta=AAAA-MM-DD] [--utc] [--cartera]
//
//   `--cartera` suma la medida de los homónimos sobre el último perfil de cada persona real
//   bloqueada por un delito de seguridad (lee 30 o 40 crudos del depósito propio); sin ella,
//   los homónimos se miden sólo en los análisis del lote.
//
//   Sin --marco: el del análisis más reciente. Sin fechas: todo el marco. Las fechas son
//   días de Ecuador (UTC-5, inclusivos). `--utc` las cuenta como días UTC: así contó el
//   piloto (`created_at::date`) y por eso su lote de marco-v30 tenía 247 análisis y
//   no 246: uno se corrió a las 21:29 del 30 de octubre en Ecuador.
//
// AVISO: este archivo no pasa por lint ni build. Si cambia `analysis_results`
// (llm_usage, veredicto_origen) o la forma de `consultas_equifax.estructura`,
// ajustar acá o mide otra cosa sin avisar.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { carpetaDeResearch } from "../_comun/entorno.mjs";
import { PRINCIPAL, RAIZ, accesoASupabase, consultar, lectorDeCrudos } from "./comun.mjs";

// ------------------------------------------------------------------ argumentos
const CONOCIDOS = new Set(["marco", "desde", "hasta", "utc", "cartera"]);
for (const a of process.argv.slice(2)) {
  const nombre = /^--([a-z]+)(=|$)/.exec(a)?.[1];
  if (!nombre || !CONOCIDOS.has(nombre)) {
    console.error(`Argumento desconocido: ${a}\nUso: node scripts/revision-del-analisis/medir-lote.mjs [--marco=marco-vNN] [--desde=AAAA-MM-DD] [--hasta=AAAA-MM-DD] [--utc] [--cartera]`);
    process.exit(1);
  }
}
const arg = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const UTC = process.argv.includes("--utc");
const CARTERA = process.argv.includes("--cartera");
const ZONA = UTC ? "UTC" : "America/Guayaquil";
// Todo lo que va al SQL se valida antes: no se arma una consulta con texto libre.
const validar = (valor, patron, que) => {
  if (valor !== undefined && !patron.test(valor)) {
    console.error(`${que} inválido: «${valor}»`);
    process.exit(1);
  }
  return valor;
};
let MARCO = validar(arg("marco"), /^marco-v\d+$/, "--marco");
const DESDE = validar(arg("desde"), /^\d{4}-\d{2}-\d{2}$/, "--desde");
const HASTA = validar(arg("hasta"), /^\d{4}-\d{2}-\d{2}$/, "--hasta");

// ------------------------------------------------------------------- la base
if (!MARCO) {
  const [fila] = consultar(`select a.rules_version as marco from analysis_results a join clients c on c.id = a.client_id
    where not c.es_sintetico order by a.created_at desc limit 1`);
  if (!fila) { console.error("No hay ningún análisis de una persona real."); process.exit(1); }
  MARCO = fila.marco;
}

// Un solo SQL trae el lote con lo que se cruza en la base (segmento, bloqueos del
// perfil y la consulta de Equifax más útil de la persona): los textos se miden acá.
// De Equifax se toma la consulta con `estructura` más reciente y, si ninguna la
// tiene, la más reciente: las migradas de AWS entraron sin tablas (docs/equifax.md)
// y de esas no se puede decir qué cuota traen.
const filtroFecha = (operador, valor) => (valor ? `and (a.created_at at time zone '${ZONA}')::date ${operador} '${valor}'::date` : "");
const SQL_LOTE = `
with lote as (
  select a.id, a.client_id, a.client_profile_id, a.created_at, c.cedula, a.crediscope_score as s, a.recomendacion as rec,
         a.veredicto_origen as origen, (a.fallo is not null) as con_fallo,
         coalesce((a.llm_usage->'output_tokens_details'->>'thinking_tokens')::int, 0) as razonamiento,
         a.narrative_summary as n, a.positives as p, a.negatives as ng, a.missing_info as m, a.acciones_sugeridas as ac
  from analysis_results a join clients c on c.id = a.client_id
  where not c.es_sintetico and a.rules_version = '${MARCO}'
    ${filtroFecha(">=", DESDE)} ${filtroFecha("<=", HASTA)}
),
eq as (
  select distinct on (l.client_id) l.client_id,
         e.created_at as eq_consultada,
         (e.estructura is not null) as eq_con_estructura,
         case when jsonb_typeof(e.estructura #> '{deudaActualTitular,total,cuotaMensualUsd}') = 'number'
              then (e.estructura #>> '{deudaActualTitular,total,cuotaMensualUsd}')::numeric end as eq_cuota
  from (select distinct client_id from lote) l
  join clients c on c.id = l.client_id
  join consultas_equifax e on e.client_id = l.client_id or (e.client_id is null and e.identificacion = c.cedula)
  order by l.client_id, (e.estructura is not null) desc, e.created_at desc
)
select json_agg(x order by x.created_at) as r from (
  select l.*, cp.fuente_segmento as segmento, cp.created_at as perfil_creado_el,
         case when cp.control_bloqueo->'hallazgos' @> '[{"code":"delito_seguridad_ciudadana"}]'::jsonb then cp.crudo_ruta end as crudo_ruta_de_la_demanda,
         coalesce((select json_agg(h->>'code')
                   from jsonb_array_elements(case when jsonb_typeof(cp.control_bloqueo->'hallazgos') = 'array'
                                                  then cp.control_bloqueo->'hallazgos' else '[]'::jsonb end) h
                   where coalesce((h->>'bloqueante')::boolean, false)), '[]'::json) as bloqueos,
         eq.eq_consultada, eq.eq_con_estructura, eq.eq_cuota
  from lote l
  left join client_profiles cp on cp.id = l.client_profile_id
  left join eq on eq.client_id = l.client_id
) x;`;

const filas = consultar(SQL_LOTE)[0]?.r ?? [];
if (!filas.length) {
  console.error(`No hay análisis de ${MARCO}${DESDE || HASTA ? ` entre ${DESDE ?? "el principio"} y ${HASTA ?? "hoy"} (${ZONA})` : ""}.`);
  process.exit(1);
}

// ------------------------------------------------------------------ utilidades
const N = filas.length;
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
const coma = (x) => String(x).replace(".", ",");
const corto = (id) => `c-${String(id).slice(0, 8)}`;
const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const lista = (v) => (Array.isArray(v) ? v : []);
// Números fuera: «una deuda de $8.374» y «una deuda de $2.034» son la misma frase.
const norm = (t) => (t ?? "").toLowerCase().replace(/\$?\d[\d.,]*/g, "#").replace(/\s+/g, " ").trim();
const frases = (t) => (t ?? "").split(/(?<=[.;:])\s+/).map(norm).filter((f) => f.length > 25);
const textoCompleto = (a) => [a.n, ...lista(a.p), ...lista(a.ng), ...lista(a.m), ...lista(a.ac)].join(" \n ");
// Lo que el análisis dice que falta o pide hacer: sin la narrativa ni los positivos.
// Con estos tres campos el detector de cuota da 47 de 53 aprobaciones, que es lo que
// midió el piloto; sumando la narrativa da 48.
const textoDeLoQueFalta = (a) => [...lista(a.m), ...lista(a.ac), ...lista(a.ng)].join(" | ");

// Detectores de texto. Son aproximados y por eso quedan marcados «a confirmar»: un
// falso positivo manda al jefe de crédito a mirar un caso de más; uno negativo lo
// deja sin ver un caso, así que se afinan mirando casos, no contando.
const PIDE_CUOTA =
  /(cuota[^.|]{0,80}(no se conoce|no se informa|no informan|desconoce|sin cuota|no se sabe))|((no se conoce|no se informa|no informan|desconoce|no se sabe)[^.|]{0,60}cuota)|(confirmar[^.|]{0,60}cuotas?)|(solicitar[^.|]{0,80}cuotas?)/i;
const SIN_CAPACIDAD =
  /capacidad[^.|]{0,80}(no (se )?(conoce|evidenci|verific|demostr|determin|pued|acredit|document|calcul|informa)|desconoc|sin (evidenci|verific|document))|(no (se )?(conoce|evidenci|verific|demostr|determin|acredit|document|calcul|informa)[^.|]{0,60}capacidad)|no (es|resulta) (medible|posible medir)|no se puede (medir|calcular|evaluar|determinar)[^.|]{0,60}(capacidad|carga|cuota|compromet)/i;

// ---------------------------------------------------------------- por análisis
const delModelo = (a) => a.origen !== "control_bloqueo";
const estimaciones = leerPredictor();
for (const a of filas) {
  a.caso = corto(a.client_id);
  a.razono = a.razonamiento > 0;
  a.sinCuota = PIDE_CUOTA.test(textoDeLoQueFalta(a));
  a.sinCapacidad = SIN_CAPACIDAD.test(textoDeLoQueFalta(a));
  a.lineaDelPredictor = estimaciones?.porPersona.get(a.client_id) ?? null;
}

// ------------------------------------------------------ 1. recomendación y score
const claveDeBanda = (a) => `${a.rec}${a.origen && a.origen !== "modelo" ? `(${a.origen})` : ""}`;
const porBanda = new Map();
for (const a of filas) {
  const clave = claveDeBanda(a);
  if (!porBanda.has(clave)) porBanda.set(clave, []);
  porBanda.get(clave).push(a.s);
}
const bandas = [...porBanda].map(([clave, ss]) => ({ recomendacion: clave, n: ss.length, min: Math.min(...ss), mediana: mediana(ss), max: Math.max(...ss) }));
// Dos recomendaciones contiguas se pisan si la peor de la mejor queda por debajo de la
// mejor de la peor. Las que decidió el control de bloqueo no cuentan: no son del modelo.
const ORDEN_REC = ["negar", "revisar", "aprobar"];
const scoresDe = (rec) => filas.filter((a) => delModelo(a) && a.rec === rec).map((a) => a.s);
const solapes = [];
for (let i = 0; i + 1 < ORDEN_REC.length; i++) {
  const [inferior, superior] = [ORDEN_REC[i], ORDEN_REC[i + 1]];
  const bajos = scoresDe(inferior), altos = scoresDe(superior);
  if (!bajos.length || !altos.length) continue;
  const desde = Math.min(...altos), hasta = Math.max(...bajos);
  const seTocan = desde <= hasta;
  solapes.push({
    inferior, superior, se_pisan: seTocan,
    zona: seTocan ? { desde, hasta } : null,
    [`${inferior}_en_la_zona`]: seTocan ? bajos.filter((s) => s >= desde).length : 0,
    [`${superior}_en_la_zona`]: seTocan ? altos.filter((s) => s <= hasta).length : 0,
  });
}

// ----------------------------------------------------------------- 2. razonamiento
const delModeloLista = filas.filter(delModelo);
const sinRazonarTodos = filas.filter((a) => !a.razono);
const sinRazonarModelo = delModeloLista.filter((a) => !a.razono);
const razonandoModelo = delModeloLista.filter((a) => a.razono);
const aprobaron = (xs) => xs.filter((a) => a.rec === "aprobar").length;
const tablaRazono = [];
for (const razono of [false, true]) {
  for (const rec of ORDEN_REC.filter((r) => delModeloLista.some((a) => a.rec === r))) {
    const g = delModeloLista.filter((a) => a.razono === razono && a.rec === rec);
    if (g.length) tablaRazono.push({ razono, recomendacion: rec, n: g.length, score_promedio: Math.round(g.reduce((s, a) => s + a.s, 0) / g.length) });
  }
}
const razonamiento = {
  analisis: N,
  sin_razonamiento: sinRazonarTodos.length,
  del_control_de_bloqueo: filas.length - delModeloLista.length,
  mediana_de_tokens_de_razonamiento: mediana(filas.map((a) => a.razonamiento)),
  // Los de control_bloqueo no llaman al modelo (0 tokens): fuera, o el 39% se infla.
  del_modelo: {
    analisis: delModeloLista.length,
    sin_razonamiento: sinRazonarModelo.length,
    sin_razonar_y_aprobo: aprobaron(sinRazonarModelo),
    razonando: razonandoModelo.length,
    razonando_y_aprobo: aprobaron(razonandoModelo),
    pct_aprobo_sin_razonar: pct(aprobaron(sinRazonarModelo), sinRazonarModelo.length),
    pct_aprobo_razonando: pct(aprobaron(razonandoModelo), razonandoModelo.length),
  },
  recomendacion_segun_razono: tablaRazono,
};

// -------------------------------------------------------------------- 3. lenguaje
const aperturasDe = (palabras) => {
  const cuenta = new Map();
  for (const a of filas) {
    const k = norm(a.n).split(" ").slice(0, palabras).join(" ");
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  return [...cuenta].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([apertura, n]) => ({ apertura, n }));
};
const cuentaDeFrases = new Map();
for (const a of filas) for (const f of new Set(frases(textoCompleto(a)))) cuentaDeFrases.set(f, (cuentaDeFrases.get(f) ?? 0) + 1);
const frasesRepetidas = [...cuentaDeFrases].filter(([, n]) => n >= 5).sort((x, y) => y[1] - x[1]);
// Similitud entre narrativas: Jaccard de trigramas de palabras, todos contra todos.
const trigramas = filas.map((a) => {
  const w = norm(a.n).split(" "), s = new Set();
  for (let i = 0; i + 2 < w.length; i++) s.add(w.slice(i, i + 3).join(" "));
  return s;
});
let sumaSim = 0, pares = 0, similares = 0;
for (let i = 0; i < trigramas.length; i++) {
  for (let j = i + 1; j < trigramas.length; j++) {
    let comunes = 0;
    for (const t of trigramas[i]) if (trigramas[j].has(t)) comunes++;
    const jaccard = comunes / (trigramas[i].size + trigramas[j].size - comunes || 1);
    sumaSim += jaccard; pares++;
    if (jaccard >= 0.3) similares++;
  }
}
// Los cinco primeros son los que el negocio retiró del vocabulario (CLAUDE.md, «Cómo se
// escribe»); si el modelo los dice, el marco no los prohíbe o no le llega la prohibición.
const TERMINOS_RETIRADOS = {
  cliente: /\bclientes?\b/i,
  piso: /\bpiso\b/i,
  asalariado: /asalariad/i,
  puntaje: /puntaje/i,
  default: /\bdefault\b/i,
};
// Fórmulas que el piloto encontró repetidas o engañosas: «A1 a A2» sin atraso mezcla dos
// calificaciones; «N veces el ingreso» presenta como medida lo que es una cuenta suelta.
const FORMULAS = {
  sin_atraso: /sin atraso/i,
  a2_junto_a_sin_atraso: /A1\s*(a|y|-|\/)\s*A2[^.]{0,40}sin (atraso|mora)/i,
  n_veces_el_ingreso: /\d+(,\d+)? veces (el|su) ingreso/i,
  zona_gris: /zona gris/i,
  historial_limpio: /historial limpio/i,
  nadie_miro: /nadie mir/i,
  no_se_pudo_o_no_se_obtuvo: /no se (pudo|obtuvo)/i,
};
const contar = (re) => filas.filter((a) => re.test(textoCompleto(a))).length;
const itemsDe = (campo) => {
  const s = filas.map((a) => lista(a[campo]).length).sort((x, y) => x - y);
  return { min: s[0], mediana: mediana(s), max: s.at(-1) };
};
const largos = filas.map((a) => (a.n ?? "").length);
const [apertura3] = aperturasDe(3);
const lenguaje = {
  aperturas_de_3_palabras: aperturasDe(3),
  aperturas_de_5_palabras: aperturasDe(5),
  apertura_mas_comun: apertura3 ? { ...apertura3, pct: pct(apertura3.n, N) } : null,
  frases_identicas_en_5_o_mas_analisis: {
    cantidad: frasesRepetidas.length,
    // Con los números normalizados a «#»; sin nombres porque se repiten en 5 o más personas.
    las_mas_repetidas: frasesRepetidas.slice(0, 10).map(([frase, n]) => ({ n, frase: frase.slice(0, 200) })),
  },
  similitud_media_de_trigramas: pares ? Math.round((1000 * sumaSim) / pares) / 1000 : null,
  pares_con_similitud_desde_0_30: { n: similares, de: pares },
  terminos_retirados: Object.fromEntries(Object.entries(TERMINOS_RETIRADOS).map(([k, re]) => [k, contar(re)])),
  formulas: Object.fromEntries(Object.entries(FORMULAS).map(([k, re]) => [k, contar(re)])),
  // Negativos que se descalifican a sí mismos: un riesgo que dice no pesar no es un riesgo.
  negativos_que_dicen_no_pesar: filas.filter((a) => lista(a.ng).some((x) => /contexto d[eé]bil|no (pesa|resta)|sin peso|no es (una )?señal/i.test(x))).length,
  largo_de_la_narrativa: { mediana: mediana(largos), max: Math.max(...largos) },
  items_por_analisis: { positivos: itemsDe("p"), negativos: itemsDe("ng"), faltante: itemsDe("m"), acciones: itemsDe("ac") },
};

// ------------------------------------------- 4. aprobaciones sin cuota ni capacidad
const aprobaciones = filas.filter((a) => a.rec === "aprobar");
const aprobacionesSin = {
  estado: "a confirmar: detector de texto sobre lo que falta, las acciones y los negativos; no es un dictamen",
  aprobaciones: aprobaciones.length,
  dicen_no_conocer_la_cuota: aprobaciones.filter((a) => a.sinCuota).length,
  dicen_no_conocer_la_capacidad: aprobaciones.filter((a) => a.sinCapacidad).length,
  cualquiera_de_las_dos: aprobaciones.filter((a) => a.sinCuota || a.sinCapacidad).length,
};

// ---------------------------------------------------- 5. cuotas y Equifax en la base
// Marco-v30 no leía Equifax (lo lee desde marco-v35): lo que se mide es cuántos análisis
// pedían una cuota que la base sí tiene, o sea lo que habría resuelto la consulta.
const conConsulta = filas.filter((a) => a.eq_consultada);
const conEstructura = conConsulta.filter((a) => a.eq_con_estructura);
const conCuota = conEstructura.filter((a) => a.eq_cuota != null && Number(a.eq_cuota) > 0);
const fechasEq = conConsulta.map((a) => String(a.eq_consultada).slice(0, 10)).sort();
const cuotas = {
  nota: "marco-v30 no leía Equifax; se mide cuántos análisis pedían la cuota que la consulta de la base sí trae",
  analisis_que_piden_o_dicen_no_conocer_la_cuota: { n: filas.filter((a) => a.sinCuota).length, de: N },
  con_consulta_de_equifax: { n: conConsulta.length, de: N },
  consulta_anterior_al_analisis: conConsulta.filter((a) => new Date(a.eq_consultada) <= new Date(a.created_at)).length,
  fechas_de_las_consultas: fechasEq.length ? { desde: fechasEq[0], hasta: fechasEq.at(-1) } : null,
  con_estructura_derivada: conEstructura.length,
  // Las migradas de AWS no traen tablas: sin ellas no se sabe si Equifax trae la cuota.
  sin_estructura_no_medido: conConsulta.length - conEstructura.length,
  equifax_trae_cuota_mayor_a_cero: conCuota.length,
  de_las_que_tienen_consulta_piden_la_cuota: conConsulta.filter((a) => a.sinCuota).length,
  piden_la_cuota_y_equifax_la_tenia: conCuota.filter((a) => a.sinCuota).length,
};

// ---------------------------------------------------------------- 6. el predictor
const predictor = estimaciones
  ? {
      archivo: estimaciones.archivo,
      personas_del_archivo: estimaciones.porPersona.size,
      analisis_con_linea: { n: filas.filter((a) => a.lineaDelPredictor).length, de: N },
      con_valor_central: { n: filas.filter((a) => a.lineaDelPredictor?.valorCentral != null).length, de: N },
      linea_sin_valor_central: filas.filter((a) => a.lineaDelPredictor && a.lineaDelPredictor.valorCentral == null).length,
      sin_linea: filas.filter((a) => !a.lineaDelPredictor).length,
      // El predictor se corre sobre el último perfil de la persona; si el análisis es de
      // un perfil anterior, el predictor vio otros datos que el modelo.
      sobre_otro_perfil_que_el_analisis: filas.filter((a) => a.lineaDelPredictor && a.lineaDelPredictor.perfil_id !== a.client_profile_id).length,
    }
  : { archivo: null, aviso: "No hay archivos en research/estimaciones-en-lote/: el predictor no se midió." };

function leerPredictor() {
  const carpeta = path.join(PRINCIPAL, "research", "estimaciones-en-lote");
  if (!fs.existsSync(carpeta)) return null;
  const archivo = fs.readdirSync(carpeta).filter((f) => f.endsWith(".jsonl")).sort().at(-1);
  if (!archivo) return null;
  const porPersona = new Map();
  for (const linea of fs.readFileSync(path.join(carpeta, archivo), "utf8").split(/\r?\n/).filter(Boolean)) {
    const o = JSON.parse(linea);
    const previa = porPersona.get(o.client_id);
    if (!previa || String(o.consultado) >= String(previa.consultado)) porPersona.set(o.client_id, o);
  }
  return { archivo, porPersona };
}

// ------------------------------------- 7. los bloqueos por la demanda de otra persona
// Por qué: el control de bloqueo por un delito de seguridad (`delito_seguridad_ciudadana`) tomaba
// la demanda sin cotejar quién era el demandado, y en el piloto 8 de 33 personas bloqueadas por
// una demanda tenían como demandado a otra (c-14f9ee80: la institución le había aprobado un
// crédito). Es la propuesta p1; esta medición dice cuántos del lote están así, y `--cartera` repite
// la medida del piloto sobre el último perfil de cada persona real bloqueada por ese delito.
//
// Cómo se cotejan: el nombre en Ecuador es APELLIDO1 APELLIDO2 NOMBRE1 [NOMBRE2], y una persona
// figura como demandada si en UN mismo demandado (el texto se corta por «;», «,», « Y » y « DEF »)
// están sus dos apellidos juntos y su primer nombre. La primera versión daba por coincidente a
// una persona porque su primer nombre estaba en el abogado defensor: por eso es un mismo demandado.
// Sólo lee el crudo del depósito propio; no consulta a Proveedor_Info_1.
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const palabrasDelNombre = (t) => sinTildes(t).replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
const demandadosDe = (t) => sinTildes(t).split(/[;,]| Y | DEF /).map((x) => x.replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim());
const paginasDe = (fuente) => (Array.isArray(fuente) ? fuente : fuente ? [fuente] : []);

function homonimiaDelCrudo(crudo, categoriasDelitoGraveSeguridad) {
  const raw = crudo.raw ?? crudo;
  const nombre = palabrasDelNombre(raw.general?.data?.nombre ?? JSON.stringify(raw.general ?? "").match(/"nombre":"([^"]+)"/)?.[1]);
  const demandas = paginasDe(raw.demandas)
    .flatMap((p) => (Array.isArray(p?.data?.demandas) ? p.data.demandas : []))
    .filter((d) => categoriasDelitoGraveSeguridad(d.demanda?.delito).length);
  const porDenuncia = paginasDe(raw.denuncias).some((p) => lista(p?.data?.denuncias).some((d) => categoriasDelitoGraveSeguridad(d.delito).length));
  const porAntecedente = categoriasDelitoGraveSeguridad(raw.antecedentesPenales?.data?.antecedentes?.descripcion).length > 0;
  const apellidos = nombre.slice(0, 2).join(" "), primerNombre = nombre[2];
  const coincide = demandas.some((d) => demandadosDe(d.demanda?.demandado).some((g) => nombre.length >= 3 && g.includes(apellidos) && g.split(" ").includes(primerNombre)));
  return { porDemanda: demandas.length > 0, coincide, tambienPorOtraVia: porDenuncia || porAntecedente };
}

let lectorDeCrudo = null;
let delitos = null;
// perfiles: [{ id, caso, perfil_id, crudo_ruta }]. Devuelve el resumen y las `id` cuyo demandado no coincide.
async function medirHomonimos(perfiles) {
  const resumen = { perfiles_bloqueados_por_delito_de_seguridad: perfiles.length, sin_crudo: 0, por_una_demanda: 0, el_demandado_es_la_persona: 0, el_demandado_no_coincide: 0, tambien_por_denuncia_o_antecedente: 0, casos_sin_coincidencia: [] };
  const sinCoincidencia = new Set();
  if (!perfiles.length) return { resumen, sinCoincidencia };
  lectorDeCrudo ??= lectorDeCrudos(accesoASupabase());
  if (!delitos) {
    globalThis.Deno ??= { env: { get: (k) => process.env[k] } };
    delitos = (await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/delitos-seguridad.ts")).href)).categoriasDelitoGraveSeguridad;
  }
  for (const p of perfiles) {
    const { crudo } = p.crudo_ruta ? await lectorDeCrudo(p.perfil_id, p.crudo_ruta) : { crudo: null };
    if (!crudo) { resumen.sin_crudo++; continue; }
    const h = homonimiaDelCrudo(crudo, delitos);
    if (h.tambienPorOtraVia) resumen.tambien_por_denuncia_o_antecedente++;
    if (!h.porDemanda) continue;
    resumen.por_una_demanda++;
    if (h.coincide) resumen.el_demandado_es_la_persona++;
    else { resumen.el_demandado_no_coincide++; resumen.casos_sin_coincidencia.push(p.caso); sinCoincidencia.add(p.id); }
  }
  return { resumen, sinCoincidencia };
}

const candidatosDelLote = filas.filter((a) => a.crudo_ruta_de_la_demanda);
const { resumen: homonimosDelLote, sinCoincidencia: demandaAjena } = await medirHomonimos(
  candidatosDelLote.map((a) => ({ id: a.id, caso: a.caso, perfil_id: a.client_profile_id, crudo_ruta: a.crudo_ruta_de_la_demanda })));
for (const a of filas) a.demandaDeOtraPersona = demandaAjena.has(a.id);

let homonimosDeLaCartera = null;
if (CARTERA) {
  // El último perfil de cada persona real, como en el piloto: un bloqueo viejo ya corregido no cuenta.
  const bloqueadas = consultar(`
    with u as (select distinct on (p.client_id) p.id, p.client_id, p.crudo_ruta, p.control_bloqueo as cb
               from client_profiles p join clients c on c.id = p.client_id and not c.es_sintetico
               order by p.client_id, p.created_at desc)
    select id, client_id, crudo_ruta from u where cb->'hallazgos' @> '[{"code":"delito_seguridad_ciudadana"}]'::jsonb;`);
  homonimosDeLaCartera = (await medirHomonimos(bloqueadas.map((f) => ({ id: f.client_id, caso: corto(f.client_id), perfil_id: f.id, crudo_ruta: f.crudo_ruta })))).resumen;
}

// --------------------- 8. los días entre la solicitud y la consulta (sólo la base de prueba)
// Por qué: la decisión de la institución es una referencia débil porque decidió meses antes de la
// consulta que analizó el modelo: en el piloto, 120 días de mediana y más de 90 en 153 de 232. La
// solicitud sólo la trae la base de prueba de AWS; para el resto de la cartera no se mide. Las
// fechas de AWS vienen sin zona: son hora de Ecuador (UTC-5).
const RUTA_CREDITO_REAL = path.join(PRINCIPAL, "research", "base-prueba-2026-11", "credito-real.json");
const creditoReal = fs.existsSync(RUTA_CREDITO_REAL) ? JSON.parse(fs.readFileSync(RUTA_CREDITO_REAL, "utf8")) : null;
const diaEc = (instante) => new Date(new Date(instante).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);
let diasDeLaSolicitud = { estado: "no medido: falta research/base-prueba-2026-11/credito-real.json" };
if (creditoReal) {
  const dias = [];
  for (const a of filas) {
    const solicitud = creditoReal[a.cedula]?.fecha_ingreso_requerimiento;
    if (solicitud && a.perfil_creado_el) dias.push(diasEntre(String(solicitud).slice(0, 10), diaEc(a.perfil_creado_el)));
  }
  diasDeLaSolicitud = {
    base: "base-prueba-2026-11 (credito-real.json)",
    analisis_con_solicitud: { n: dias.length, de: N },
    mediana_en_dias: dias.length ? mediana(dias) : null,
    con_mas_de_90_dias: dias.filter((d) => d > 90).length,
    con_solicitud_posterior_a_la_consulta: dias.filter((d) => d < 0).length,
  };
}

// ------------------------- 9. el resultado de pago contra la recomendación (la vara más fuerte)
// El resultado de pago lo arma `resultado-de-pago.mjs` para la base de prueba: si el crédito pedido
// figura en la cartera de la institución y cómo se pagó. Acá se cruza con lo que recomendó el modelo.
// Es una referencia con límites: la mayoría de los créditos son de personas que el modelo mandó a
// revisar, y pocos aprobaron o negaron, así que una tasa de mora de 2 de 41 no es todavía una
// conclusión sobre el modelo.
const RUTA_DEL_PAGO = path.join(PRINCIPAL, "research", "revision-del-analisis", "resultado-de-pago-base-prueba.json");
const pagos = fs.existsSync(RUTA_DEL_PAGO) ? JSON.parse(fs.readFileSync(RUTA_DEL_PAGO, "utf8")).personas : null;
let pagoContraLaRecomendacion = { estado: "no medido: falta resultado-de-pago-base-prueba.json (resultado-de-pago.mjs)" };
if (pagos) {
  const porBandaDePago = {};
  let conResultado = 0;
  for (const a of filas) {
    const p = pagos[a.client_id];
    if (!p?.figura_en_la_cartera) continue;
    conResultado++;
    const celda = (porBandaDePago[claveDeBanda(a)] ??= { analisis: 0, sin_atrasos: 0, atrasos_ya_pagados: 0, en_mora_hoy: 0, impago: 0 });
    celda.analisis++;
    celda[p.resultado.clase]++;
  }
  pagoContraLaRecomendacion = {
    analisis_con_el_credito_en_la_cartera: { n: conResultado, de: N },
    por_recomendacion: porBandaDePago,
  };
}

// ------------------------------------------------------------------ los casos
// Las marcas que lee `elegir-casos.mjs`. Una marca no es un dictamen: dice dónde
// conviene que mire el jefe de crédito.
const casos = filas.map((a) => {
  const marcas = [];
  if (a.rec === "aprobar" && delModelo(a) && !a.razono) marcas.push("aprobo_sin_razonar");
  if (a.rec === "aprobar" && (a.sinCuota || a.sinCapacidad)) marcas.push("aprobacion_sin_capacidad");
  if (!delModelo(a)) marcas.push("bloqueo_por_control");
  if (a.demandaDeOtraPersona) marcas.push("bloqueo_por_demanda_de_otra_persona");
  if (a.sinCuota && a.eq_cuota != null && Number(a.eq_cuota) > 0) marcas.push("pide_la_cuota_y_equifax_la_tenia");
  return {
    analisis_id: a.id, client_id: a.client_id, perfil_id: a.client_profile_id, caso: a.caso,
    fecha: a.created_at, score: a.s, recomendacion: a.rec, origen: a.origen, con_fallo: a.con_fallo,
    razonamiento_tokens: a.razonamiento, segmento: a.segmento ?? null,
    bloqueos: lista(a.bloqueos), marcas,
    tiene_consulta_de_equifax: Boolean(a.eq_consultada), tiene_predictor: a.lineaDelPredictor?.valorCentral != null,
  };
});
const marcas = {};
for (const c of casos) for (const m of c.marcas) marcas[m] = (marcas[m] ?? 0) + 1;

// ------------------------------------------------------------------- el archivo
const ahoraEc = new Date(Date.now() - 5 * 3600 * 1000).toISOString(); // Ecuador es UTC-5 todo el año
const sello = `${ahoraEc.slice(0, 10)}-${ahoraEc.slice(11, 19).replace(/:/g, "")}`;
const medicion = {
  formato: 1,
  generado_el: new Date().toISOString(),
  marco: MARCO,
  periodo: { desde: DESDE ?? null, hasta: HASTA ?? null, zona: ZONA },
  analisis: N,
  personas: new Set(filas.map((a) => a.client_id)).size,
  con_fallo: filas.filter((a) => a.con_fallo).length,
  recomendacion_contra_score: { bandas, solapes },
  razonamiento,
  lenguaje,
  aprobaciones_sin_cuota_ni_capacidad: aprobacionesSin,
  homonimos_en_demandas: { del_lote: homonimosDelLote, de_la_cartera: homonimosDeLaCartera ?? "no medido (--cartera)" },
  dias_entre_la_solicitud_y_la_consulta: diasDeLaSolicitud,
  resultado_de_pago_contra_la_recomendacion: pagoContraLaRecomendacion,
  cuotas_y_equifax: cuotas,
  predictor,
  marcas,
  casos,
};
const salida = path.join(carpetaDeResearch(RAIZ, "revision-del-analisis", "mediciones"), `${sello}.json`);
fs.writeFileSync(salida, JSON.stringify(medicion, null, 2), "utf8");

// ------------------------------------------------------------------- consola
const rd = razonamiento.del_modelo;
console.log(`Medición de ${MARCO}${DESDE || HASTA ? `, ${DESDE ?? "…"} a ${HASTA ?? "…"} (${ZONA})` : ""}: ${N} análisis de ${medicion.personas} personas reales.`);
console.log("Recomendación contra score:");
for (const b of bandas) console.log(`  ${b.recomendacion}: ${b.n} de ${N}, score ${b.min} a ${b.max} (mediana ${coma(b.mediana)})`);
for (const s of solapes) {
  console.log(s.se_pisan
    ? `  se pisan ${s.inferior} y ${s.superior} entre ${s.zona.desde} y ${s.zona.hasta}: ${s[`${s.inferior}_en_la_zona`]} de ${s.inferior} y ${s[`${s.superior}_en_la_zona`]} de ${s.superior}`
    : `  ${s.inferior} y ${s.superior} no se pisan`);
}
console.log("Razonamiento:");
console.log(`  ${razonamiento.sin_razonamiento} de ${N} sin razonamiento (${razonamiento.del_control_de_bloqueo} son del control de bloqueo, que no llama al modelo)`);
console.log(`  sin razonar el modelo aprobó ${rd.sin_razonar_y_aprobo} de ${rd.sin_razonamiento} (${coma(rd.pct_aprobo_sin_razonar)}%); razonando, ${rd.razonando_y_aprobo} de ${rd.razonando} (${coma(rd.pct_aprobo_razonando)}%)`);
console.log("Lenguaje:");
if (apertura3) console.log(`  apertura «${apertura3.apertura}» en ${apertura3.n} de ${N} (${coma(pct(apertura3.n, N))}%)`);
console.log(`  frases idénticas (números aparte) en 5 o más análisis: ${frasesRepetidas.length}; similitud media de trigramas ${coma(lenguaje.similitud_media_de_trigramas)}; ${similares} de ${pares} pares desde 0,30`);
for (const [k, n] of Object.entries(lenguaje.terminos_retirados)) if (n) console.log(`  «${k}» (término retirado) en ${n} de ${N}`);
for (const [k, n] of Object.entries(lenguaje.formulas)) if (n) console.log(`  fórmula ${k.replace(/_/g, " ")}: ${n} de ${N}`);
console.log(`Aprobaciones (${aprobaciones.length}) que dicen no conocer la cuota o la capacidad (a confirmar): ${aprobacionesSin.cualquiera_de_las_dos} de ${aprobaciones.length} (cuota ${aprobacionesSin.dicen_no_conocer_la_cuota}, capacidad ${aprobacionesSin.dicen_no_conocer_la_capacidad})`);
console.log(`Cuotas y Equifax: ${cuotas.con_consulta_de_equifax.n} de ${N} con consulta en la base; ${conEstructura.length} con estructura (${cuotas.sin_estructura_no_medido} sin ella, no medido); Equifax trae cuota en ${conCuota.length}; piden la cuota y la tenía: ${cuotas.piden_la_cuota_y_equifax_la_tenia}`);
console.log(predictor.archivo
  ? `Predictor (${predictor.archivo}): ${predictor.con_valor_central.n} de ${N} con valor central; ${predictor.linea_sin_valor_central} con línea sin valor; ${predictor.sin_linea} sin línea; ${predictor.sobre_otro_perfil_que_el_analisis} sobre otro perfil`
  : `Predictor: ${predictor.aviso}`);
const hl = homonimosDelLote;
console.log(`Bloqueos por un delito de seguridad (${hl.perfiles_bloqueados_por_delito_de_seguridad} en el lote): por una demanda ${hl.por_una_demanda}; el demandado es la persona en ${hl.el_demandado_es_la_persona} y no coincide en ${hl.el_demandado_no_coincide}${hl.casos_sin_coincidencia.length ? ` (${hl.casos_sin_coincidencia.join(", ")})` : ""}`);
if (homonimosDeLaCartera) console.log(`  en la cartera: ${homonimosDeLaCartera.por_una_demanda} bloqueadas por una demanda, el demandado no coincide en ${homonimosDeLaCartera.el_demandado_no_coincide}`);
if (diasDeLaSolicitud.mediana_en_dias != null) console.log(`Días entre la solicitud y la consulta: mediana ${diasDeLaSolicitud.mediana_en_dias}; más de 90 en ${diasDeLaSolicitud.con_mas_de_90_dias} de ${diasDeLaSolicitud.analisis_con_solicitud.n} con solicitud`);
else console.log(`Días entre la solicitud y la consulta: ${diasDeLaSolicitud.estado}`);
if (pagoContraLaRecomendacion.por_recomendacion) {
  console.log(`Resultado de pago (${pagoContraLaRecomendacion.analisis_con_el_credito_en_la_cartera.n} de ${N} con el crédito en la cartera):`);
  for (const [banda, c] of Object.entries(pagoContraLaRecomendacion.por_recomendacion)) console.log(`  ${banda}: ${c.analisis}; sin atrasos ${c.sin_atrasos}, atrasos ya pagados ${c.atrasos_ya_pagados}, en mora hoy ${c.en_mora_hoy}, impago ${c.impago}`);
} else console.log(`Resultado de pago: ${pagoContraLaRecomendacion.estado}`);
console.log("Marcas para elegir casos:");
for (const [m, n] of Object.entries(marcas)) console.log(`  ${m}: ${n} de ${N}${m === "bloqueo_por_control" ? ` (${casos.filter((c) => c.marcas.includes(m)).map((c) => c.caso).join(", ")})` : ""}`);
console.log(`Escrito: ${path.relative(PRINCIPAL, salida)}`);
console.log(`Siguiente paso: node scripts/revision-del-analisis/elegir-casos.mjs --medicion=${path.relative(PRINCIPAL, salida).replace(/\\/g, "/")}`);
