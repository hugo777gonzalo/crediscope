// La prueba de paridad del predictor de ingresos (docs/especificacion-predictor-de-ingresos.md,
// sección 9, punto 1): las 5.001 respuestas crudas de Equifax de la base de AWS pasan por
// derivarTablas y por el módulo de variables, y lo que sale se compara con el extracto con el
// que se entrenó el modelo. Si no coincide, el modelo recibe en producción otra cosa que lo que
// aprendió y nadie lo ve: por eso se mide variable por variable, y lo que no coincide se dice.
//
// Datos (fuera de git, con identificaciones y montos de personas reales; no se copia nada de
// ahí al repositorio): research/ingresos-aws/ de la carpeta principal.
//   muestra_respuestas_equifax.jsonl        5.001 respuestas crudas
//   predictor_equifax_por_consulta.csv      las diez variables de crédito y el total de las operaciones
//   equifax_cuota_por_consulta.csv          la cuota financiera y su historial
//   equifax_deuda_por_tipo.csv              las operaciones por tabla, tipo de crédito y de riesgo
//   sri_por_consulta.csv                    el bloque del SRI
//
// Se imprimen SÓLO conteos y porcentajes: nunca una identificación ni un monto.
//
//   node scripts/probar-paridad-variables-de-ingreso.mjs
//   npx --yes deno@2.9.6 run --allow-read --allow-env --allow-run=git scripts/probar-paridad-variables-de-ingreso.mjs
//
// Sale con 1 si una paridad cae por debajo de lo medido el 2026-10-22 (UMBRALES): el cambio de una
// regla de equifax-tablas.ts o de variables-de-ingreso.ts, o un cambio en la respuesta de Equifax,
// vuelve a correr esta prueba (sección 7 de la especificación).
//
// AVISO: este archivo no pasa por lint ni build. Corre igual en Node y en Deno.

import fs from "node:fs";
import path from "node:path";
import { raizPrincipal } from "./_comun/entorno.mjs";
import { derivarTablas, rolDeEquifax } from "../supabase/functions/_shared/equifax-tablas.ts";
import { VARIABLES_DEL_NIVEL_2, vectorDeNivel2 } from "../supabase/functions/_shared/variables-de-ingreso.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DATOS = path.join(raizPrincipal(RAIZ), "research", "ingresos-aws");

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------
// CSV con comillas; devuelve objetos sólo con las columnas pedidas y sólo las filas que acepta el filtro.
function leerCsv(nombre, columnas, aceptar = () => true) {
  const t = fs.readFileSync(path.join(DATOS, nombre), "utf8").replace(/^﻿/, "");
  const filas = [];
  let i = 0;
  const n = t.length;
  const registro = () => {
    const campos = [];
    let c = "";
    while (i < n) {
      const ch = t[i];
      if (ch === '"') {
        i++;
        while (i < n) {
          if (t[i] === '"') { if (t[i + 1] === '"') { c += '"'; i += 2; continue; } i++; break; }
          c += t[i++];
        }
      } else if (ch === ",") { campos.push(c); c = ""; i++; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; i++; campos.push(c); return campos; }
      else { c += ch; i++; }
    }
    campos.push(c);
    return campos;
  };
  const cabecera = registro();
  const indice = Object.fromEntries(cabecera.map((h, k) => [h, k]));
  for (const c of columnas) if (!(c in indice)) throw new Error(`${nombre}: falta la columna ${c}`);
  while (i < n) {
    const r = registro();
    if (r.length === 1 && r[0] === "") continue;
    const o = {};
    for (const c of columnas) o[c] = r[indice[c]] === "" ? null : r[indice[c]];
    if (aceptar(o)) filas.push(o);
  }
  return filas;
}

const numero = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const suma = (a) => {
  const v = a.filter((x) => x !== null);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100 : null;
};
const maximo = (a) => {
  const v = a.filter((x) => x !== null);
  return v.length ? Math.max(...v) : null;
};
const igual = (a, b, tolerancia = 0.011) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= tolerancia);
const textoIgual = (a, b) => (a ?? null) === (b ?? null);

// ---------------------------------------------------------------------------
// Carga y derivación
// ---------------------------------------------------------------------------
let fallas = 0;
const pct = (a, b) => (b === 0 ? "—" : `${((100 * a) / b).toFixed(1).replace(".", ",")}%`);
const medidas = {};

function mide(grupo, nombre, comparaciones, umbral) {
  let ok = 0;
  let total = 0;
  for (const c of comparaciones) {
    if (c === undefined) continue; // sin dato de un lado: no se compara
    total++;
    if (c) ok++;
  }
  medidas[`${grupo} · ${nombre}`] = { ok, total };
  const cae = umbral !== undefined && total > 0 && ok / total < umbral;
  if (cae) fallas++;
  console.log(`  ${cae ? "FALLA" : "ok   "} ${nombre.padEnd(46)} ${String(ok).padStart(5)} de ${String(total).padStart(5)}  ${pct(ok, total).padStart(7)}${umbral !== undefined ? `  (umbral ${(umbral * 100).toFixed(1).replace(".", ",")}%)` : ""}`);
}

const lineas = fs.readFileSync(path.join(DATOS, "muestra_respuestas_equifax.jsonl"), "utf8").split("\n").filter(Boolean);
const muestra = new Map();
for (const l of lineas) {
  const j = JSON.parse(l);
  muestra.set(String(j.id_consulta_equifax), { crudo: j.response_json, fecha: j.fecha_consulta_equifax, derivado: derivarTablas(j.response_json) });
}
console.log(`Respuestas de la muestra: ${muestra.size}. Con avisos de derivación: ${[...muestra.values()].filter((m) => m.derivado.avisos.length > 0).length}.`);

const enMuestra = (o) => muestra.has(o.id_consulta_equifax);
const predictor = new Map(leerCsv("predictor_equifax_por_consulta.csv", [
  "id_consulta_equifax", "credito_mayor_aprobado_monto", "credito_mayor_aprobado_fecha", "credito_mayor_12m_monto", "credito_mayor_24m_monto", "deuda_total_adeudada", "n_instituciones_con_deuda",
  "n_creditos_aprobados", "valor_creditos_aprobados", "valor_saldos_vigentes", "deuda_actual_total", "deuda_hace_3_meses",
  "cuota_mensual_total_reportada", "saldo_total_reportado", "n_operaciones_reportadas", "max_dias_vencido",
], enMuestra).map((o) => [o.id_consulta_equifax, o]));
const cuotas = new Map(leerCsv("equifax_cuota_por_consulta.csv", [
  "id_consulta_equifax", "cuota_financiera", "cuota_estimada_mensual_pago", "cuota_hist_menos_12m", "cuota_hist_menos_6m", "cuota_hist_actual", "cuota_proyectada_mas_6m", "cuota_proyectada_mas_12m",
], enMuestra).map((o) => [o.id_consulta_equifax, o]));
const porTipo = new Map();
for (const o of leerCsv("equifax_deuda_por_tipo.csv", ["id_consulta_equifax", "tabla", "tipo_credito", "tipo_riesgo", "n_operaciones", "cuota_mensual", "saldo_deuda", "max_dias_vencido"], enMuestra)) {
  if (!porTipo.has(o.id_consulta_equifax)) porTipo.set(o.id_consulta_equifax, []);
  porTipo.get(o.id_consulta_equifax).push(o);
}
const sri = new Map(leerCsv("sri_por_consulta.csv", [
  "id_consulta_equifax", "tipo_bloque", "sri_tiene_ruc", "sri_estado_contribuyente", "sri_clase_contribuyente", "sri_obligado", "sri_fecha_inicio_actividades", "sri_fecha_suspension_definitiva", "sri_codigo_ciiu",
], enMuestra).map((o) => [o.id_consulta_equifax, o]));
console.log(`En el extracto: ${predictor.size} filas de las diez variables, ${cuotas.size} de la cuota, ${porTipo.size} consultas con operaciones por tipo, ${sri.size} del SRI.\n`);

// Un perfil mínimo: lo que mide esta prueba es el nivel de Equifax; la persona no entra.
const AHORA = new Date("2026-10-22T15:00:00Z");
const perfilVacio = {};
const vectorDe = (m, tablas = m.derivado.tablas) => vectorDeNivel2(perfilVacio, tablas, { ahora: AHORA, consultadoEl: m.fecha });
const ids = [...muestra.keys()];

// ---------------------------------------------------------------------------
// 1. Las diez variables de crédito (la tabla equifax_analisis_credito)
// ---------------------------------------------------------------------------
console.log("1. Las diez variables de AnalisisCreditoSectorFinanciero contra el extracto de AWS (la tabla, sin anular nada)");
const DIEZ = [
  ["mayor crédito aprobado (cred_mayor)", "mayor_credito_aprobado_monto_usd", "credito_mayor_aprobado_monto"],
  ["mayor crédito reciente (cred_12m)", "mayor_credito_reciente_monto_usd", "credito_mayor_12m_monto"],
  ["mayor crédito actual (cred_24m)", "mayor_credito_actual_monto_usd", "credito_mayor_24m_monto"],
  ["total adeudado (deuda_total)", "deuda_total_adeudada_usd", "deuda_total_adeudada"],
  ["instituciones con deuda (n_inst)", "instituciones_con_deuda_numero", "n_instituciones_con_deuda"],
  ["créditos aprobados (n_creditos)", "creditos_aprobados_numero", "n_creditos_aprobados"],
  ["valor de créditos aprobados (valor_creditos)", "creditos_aprobados_valor_usd", "valor_creditos_aprobados"],
  ["saldos vigentes (saldos_vig)", "saldos_vigentes_usd", "valor_saldos_vigentes"],
  ["deuda actual (deuda_actual)", "deuda_actual_usd", "deuda_actual_total"],
  ["deuda de hace 3 meses (deuda_3m)", "deuda_hace_3_meses_usd", "deuda_hace_3_meses"],
];
for (const [nombre, columna, extracto] of DIEZ) {
  // Se compara donde el extracto tiene dato: la igualdad exacta de 4.499 de 4.499 de 12.22.
  mide("crédito", nombre, ids.map((id) => {
    const e = numero(predictor.get(id)?.[extracto]);
    if (e === null) return undefined;
    return igual(derivadoDe(id)[columna] ?? null, e);
  }), 1);
}
function derivadoDe(id) {
  return muestra.get(id).derivado.tablas.equifax_analisis_credito[0] ?? {};
}
{
  const sinDato = ids.filter((id) => numero(predictor.get(id)?.credito_mayor_aprobado_monto) === null);
  const conBloqueVacio = sinDato.filter((id) => muestra.get(id).derivado.tablas.equifax_analisis_credito.length === 1).length;
  console.log(`  Sin dato en el extracto: ${sinDato.length}; en ${conBloqueVacio} de ellas la respuesta trae el bloque vacío y la tabla guarda una fila de nulos.`);
}
// La fecha de concesión del mayor crédito aprobado contra la del extracto. El extracto la trae dd/mm/yyyy: leída como
// mes/día (pandas) sale una «concesión posterior a la consulta» que no existe, y con try_cast de DuckDB sale nula
// (así quedaron las 116.673 del entrenamiento: la regla del crédito posterior nunca corrió).
const aIso = (v) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v ?? ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
mide("crédito", "fecha de concesión del mayor aprobado", ids.map((id) => {
  const e = aIso(predictor.get(id)?.credito_mayor_aprobado_fecha);
  if (e === null) return undefined;
  return textoIgual(e, derivadoDe(id).mayor_credito_aprobado_fecha_concesion ?? null);
}), 1);

// Las fechas posteriores a la consulta: cuántas hay en cada uno de los tres créditos mayores.
{
  const posteriores = { cred_mayor: 0, cred_12m: 0, cred_24m: 0 };
  let conFecha = 0;
  for (const id of ids) {
    const a = derivadoDe(id);
    if (!a.mayor_credito_aprobado_fecha_concesion) continue;
    conFecha++;
    const consulta = new Date(new Date(muestra.get(id).fecha).getTime() - 5 * 3600_000).toISOString().slice(0, 10);
    if (a.mayor_credito_aprobado_fecha_concesion > consulta) posteriores.cred_mayor++;
    if (a.mayor_credito_reciente_fecha_concesion && a.mayor_credito_reciente_fecha_concesion > consulta) posteriores.cred_12m++;
    if (a.mayor_credito_actual_fecha_concesion && a.mayor_credito_actual_fecha_concesion > consulta) posteriores.cred_24m++;
  }
  console.log(`  Concesión posterior a la consulta, de ${conFecha} respuestas con fecha: mayor aprobado ${posteriores.cred_mayor}, reciente ${posteriores.cred_12m}, actual ${posteriores.cred_24m}.`);
  const anulados = ids.filter((id) => derivadoDe(id).mayor_credito_aprobado_monto_usd !== undefined && derivadoDe(id).mayor_credito_aprobado_monto_usd !== null && vectorDe(muestra.get(id)).variables.cred_mayor === null).length;
  console.log(`  El módulo anula cred_mayor en ${anulados}.`);
}

// ---------------------------------------------------------------------------
// 2. La cuota y su historial
// ---------------------------------------------------------------------------
console.log("\n2. La cuota y el historial contra equifax_cuota_por_consulta.csv");
const indicador = (m, meses) => m.derivado.tablas.equifax_indicadores_por_periodo.find((i) => i.origen === "historico_cuota_estimada" && i.retroactivo_meses === meses)?.valor_numero ?? null;
mide("cuota", "cuota_estimada_mensual_usd = cuota estimada de AWS", ids.map((id) => igual(muestra.get(id).derivado.tablas.equifax_resumen[0].cuota_estimada_mensual_usd, numero(cuotas.get(id)?.cuota_estimada_mensual_pago))), 1);
const cuotaFinDeAws = (c) => (numero(c?.cuota_financiera) !== null ? numero(c.cuota_financiera) : (c?.cuota_financiera ?? "").trim() === "No tiene deuda" ? 0 : null);
mide("cuota", "cuota_fin (cuota financiera del impacto económico)", ids.map((id) => (cuotas.has(id) ? igual(vectorDe(muestra.get(id)).variables.cuota_fin, cuotaFinDeAws(cuotas.get(id))) : undefined)), 1);
for (const [variable, columna, meses] of [["h12", "cuota_hist_menos_12m", -12], ["h6", "cuota_hist_menos_6m", -6], ["hact", "cuota_hist_actual", 0]]) {
  mide("cuota", `${variable} (retroactivo ${meses} meses)`, ids.map((id) => (cuotas.has(id) ? igual(vectorDe(muestra.get(id)).variables[variable], numero(cuotas.get(id)[columna])) : undefined)), 1);
}
for (const [columna, meses] of [["cuota_proyectada_mas_6m", 6], ["cuota_proyectada_mas_12m", 12]]) {
  mide("cuota", `cuota proyectada a ${meses} meses (no es entrada)`, ids.map((id) => (cuotas.has(id) ? igual(indicador(muestra.get(id), meses), numero(cuotas.get(id)[columna])) : undefined)), 1);
}
const cociente = (n, d) => (n === null || d === null || d <= 0 ? null : Math.min(20, Math.max(0, n / d)));
for (const [variable, columna] of [["g6", "cuota_hist_menos_6m"], ["g12", "cuota_hist_menos_12m"]]) {
  mide("cuota", `${variable} (cociente actual / ${columna.endsWith("6m") ? "-6" : "-12"} meses)`, ids.map((id) => (cuotas.has(id)
    // Hasta el redondeo a centavos de las dos cuotas (la tabla guarda dos decimales): la diferencia máxima medida es de 0,003.
    ? igual(vectorDe(muestra.get(id)).variables[variable], cociente(numero(cuotas.get(id).cuota_hist_actual), numero(cuotas.get(id)[columna])), 0.01) : undefined)), 1);
}

// ---------------------------------------------------------------------------
// 3. Las operaciones: cuota, saldo y conteo por tipo
// ---------------------------------------------------------------------------
// El valor de entrenamiento: la misma receta de scripts/r2_4_preparar.py sobre equifax_deuda_por_tipo.csv. Sin las
// filas de totales por sistema (tipo «otro» y riesgo sin dato); una suma sin filas es un faltante.
function variablesDeAws(id) {
  const filas = (porTipo.get(id) ?? []).filter((o) => !((o.tipo_credito ?? "").toUpperCase() === "OTRO" && (o.tipo_riesgo ?? "").toUpperCase() === "SIN_DATO"));
  const del = (riesgo, tipo) => filas.filter((o) => (o.tipo_riesgo ?? "").toUpperCase() === riesgo && (o.tipo_credito ?? "").toUpperCase() === tipo);
  const v = {};
  for (const [sufijo, tipo] of [["consumo", "CONSUMO"], ["tarjeta", "TARJETA"], ["micro", "MICROCREDITO"], ["vivienda", "VIVIENDA"], ["comercial", "COMERCIAL"], ["educativo", "EDUCATIVO"]]) {
    const f = del("TITULAR", tipo);
    v[`c_${sufijo}`] = suma(f.map((o) => numero(o.cuota_mensual)));
    v[`s_${sufijo}`] = suma(f.map((o) => numero(o.saldo_deuda)));
    v[`n_${sufijo}`] = f.length ? f.reduce((s, o) => s + Number(o.n_operaciones), 0) : null;
  }
  v.c_codeudor = suma(filas.filter((o) => ["CODEUDOR", "GARANTE"].includes((o.tipo_riesgo ?? "").toUpperCase())).map((o) => numero(o.cuota_mensual)));
  v.max_dias_t = maximo(filas.filter((o) => (o.tipo_riesgo ?? "").toUpperCase() === "TITULAR").map((o) => numero(o.max_dias_vencido)));
  return v;
}
const POR_TIPO = ["c_consumo", "c_tarjeta", "c_micro", "c_vivienda", "c_comercial", "c_educativo", "s_consumo", "s_tarjeta", "s_micro", "s_vivienda", "n_consumo", "n_tarjeta", "n_micro", "n_vivienda", "c_codeudor", "max_dias_t"];
const TOTALES = [
  ["n_oper", (p) => numero(p.n_operaciones_reportadas)],
  ["saldo", (p) => numero(p.saldo_total_reportado)],
  ["max_mora", (p) => numero(p.max_dias_vencido)],
];

// Las dos fuentes posibles de las operaciones: equifax_operaciones (reporteCrediticio, lo que dice la
// especificación) y las listas DetalleDeudaActualReportada* de interconnectResponse, de donde salió el extracto.
const LISTAS_DE_LA_IR = ["DetalleDeudaActualReportadaRFRSBS", "DetalleDeudaActualReportadaSICOMSBS", "DetalleDeudaActualReportadaSBSSBS_Educativo"];
const operacionesDeLaIr = (crudo) => LISTAS_DE_LA_IR.flatMap((k) => (Array.isArray(crudo.interconnectResponse?.[k]) ? crudo.interconnectResponse[k] : [])).map((f) => {
  const { rol, original } = rolDeEquifax(f.Tipo_Riesgo);
  return {
    rol, rol_original: original, tipo_credito: typeof f.Tipo_Credito === "string" ? f.Tipo_Credito : null,
    cuota_mensual_usd: numero(f.Cuota_Mensual), saldo_deuda_usd: numero(f.Saldo_Deuda), dias_morosidad: numero(f.Dias_Venc),
  };
});

const aws = new Map(ids.map((id) => [id, variablesDeAws(id)]));
function paridadDeOperaciones(titulo, conTablas, umbral) {
  console.log(titulo);
  const vectores = new Map(ids.map((id) => {
    const m = muestra.get(id);
    return [id, vectorDe(m, conTablas(m)).variables];
  }));
  for (const variable of POR_TIPO) {
    mide("operaciones", variable, ids.map((id) => igual(vectores.get(id)[variable], aws.get(id)[variable], 0.02)), umbral?.[variable]);
  }
  for (const [variable, deAws] of TOTALES) {
    mide("operaciones", `${variable} (total de AWS)`, ids.map((id) => {
      const p = predictor.get(id);
      return p && deAws(p) !== null ? igual(vectores.get(id)[variable], deAws(p), 0.02) : undefined;
    }), umbral?.[variable]);
  }
}
const UMBRALES_DE_LA_3A = {
  c_consumo: 0.48, c_tarjeta: 0.50, c_micro: 0.88, c_vivienda: 0.91, c_comercial: 0.98, c_educativo: 1, s_consumo: 0.78, s_tarjeta: 0.94, s_micro: 0.98, s_vivienda: 0.99,
  n_consumo: 0.65, n_tarjeta: 0.94, n_micro: 0.98, n_vivienda: 0.99, c_codeudor: 0.92, max_dias_t: 0.87, n_oper: 0.65, saldo: 0.84, max_mora: 0.88,
};
// Umbrales: lo medido el 2026-10-22 con equifax_operaciones, redondeado hacia abajo. Las operaciones de
// reporteCrediticio NO reproducen el extracto (el extracto salió de interconnectResponse): los umbrales
// impiden que empeore, no dicen que esté bien.
console.log("\n3. Las operaciones contra equifax_deuda_por_tipo.csv y los totales del extracto");
paridadDeOperaciones("  3a. Desde equifax_operaciones (reporteCrediticio): lo que dice la sección 4.2", (m) => m.derivado.tablas, UMBRALES_DE_LA_3A);
console.log("");
paridadDeOperaciones(
  "  3b. Alternativa medida, NO construida: desde las listas DetalleDeudaActualReportada* de interconnectResponse",
  (m) => ({ ...m.derivado.tablas, equifax_operaciones: operacionesDeLaIr(m.crudo) }),
  undefined,
);

// ---------------------------------------------------------------------------
// 4. El SRI
// ---------------------------------------------------------------------------
console.log("\n4. El SRI de la respuesta contra sri_por_consulta.csv");
const conBloque = ids.filter((id) => sri.get(id)?.tipo_bloque === "array");
console.log(`  Respuestas con el bloque del SRI en el extracto: ${conBloque.length} de ${sri.size}.`);
mide("sri", "sri_ruc", conBloque.map((id) => (vectorDe(muestra.get(id)).variables.sri_ruc === (sri.get(id).sri_tiene_ruc === "true" ? 1 : 0))), 1);
mide("sri", "sri_estado", conBloque.map((id) => textoIgual(vectorDe(muestra.get(id)).variables.sri_estado, (sri.get(id).sri_estado_contribuyente ?? "").toUpperCase() || null)), 1);
mide("sri", "sri_clase", conBloque.map((id) => textoIgual(vectorDe(muestra.get(id)).variables.sri_clase, (sri.get(id).sri_clase_contribuyente ?? "").toUpperCase() || null)), 1);
mide("sri", "sri_obligado", conBloque.map((id) => {
  const e = { S: 1, N: 0 }[sri.get(id).sri_obligado] ?? null;
  return vectorDe(muestra.get(id)).variables.sri_obligado === e;
}), 1);
const ciiu = (c) => ((c ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || null);
mide("sri", "sri_ciiu_secc", conBloque.map((id) => textoIgual(vectorDe(muestra.get(id)).variables.sri_ciiu_secc, ciiu(sri.get(id).sri_codigo_ciiu)?.slice(0, 1) ?? null)), 1);
mide("sri", "sri_ciiu_div", conBloque.map((id) => textoIgual(vectorDe(muestra.get(id)).variables.sri_ciiu_div, ciiu(sri.get(id).sri_codigo_ciiu)?.slice(0, 3) ?? null)), 1);
mide("sri", "fecha de inicio de actividades", conBloque.map((id) => textoIgual(muestra.get(id).derivado.tablas.equifax_resumen[0].sri_fecha_inicio_actividades, (sri.get(id).sri_fecha_inicio_actividades ?? "").slice(0, 10) || null)), 1);
mide("sri", "fecha de suspensión definitiva", conBloque.map((id) => textoIgual(muestra.get(id).derivado.tablas.equifax_resumen[0].sri_fecha_suspension_definitiva, (sri.get(id).sri_fecha_suspension_definitiva ?? "").slice(0, 10) || null)), 1);
mide("sri", "sin bloque en el extracto = sin bloque en la tabla", ids.filter((id) => sri.has(id)).map((id) => (sri.get(id).tipo_bloque !== "array") === (muestra.get(id).derivado.tablas.equifax_resumen[0].sri_tiene_ruc === null)), 1);

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
const vectores = ids.map((id) => vectorDe(muestra.get(id)));
const sinDatoPorVariable = Object.fromEntries(VARIABLES_DEL_NIVEL_2.map((v) => [v, 0]));
for (const v of vectores) for (const k of v.sinDato) sinDatoPorVariable[k]++;
const LAS_DE_LA_PERSONA = ["genero", "estado_civil", "prov_trab", "cant_trab", "prov_dom", "cant_dom", "edad", "aporte", "meses_aporte", "n_empleos", "anio_mes"];
const sinDato = VARIABLES_DEL_NIVEL_2.filter((v) => !LAS_DE_LA_PERSONA.includes(v)).map((v) => `${v} ${pct(sinDatoPorVariable[v], vectores.length)}`);
console.log(`
Vectores del nivel 2 armados: ${vectores.length} (el perfil va vacío: las variables de la persona no se miden acá).`);
console.log(`Sin dato, por variable de Equifax: ${sinDato.join(", ")}.`);
console.log(fallas === 0 ? "\nTodo bien: ninguna paridad cayó por debajo de su umbral." : `\n${fallas} paridad(es) por debajo de su umbral.`);
process.exit(fallas === 0 ? 0 : 1);
