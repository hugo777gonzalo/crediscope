// Exporta a un Excel lo que Equifax contestó de TODAS las personas consultadas,
// ya descompuesto en las tablas equifax_* (_shared/equifax-tablas.ts): una hoja
// por tabla, con una columna "persona" (c-xxxxxxxx) que dice de quién es cada fila,
// más "Léame", "Consultas" y "Estructura" (la estructura estandarizada, una fila
// por persona).
//
// Parte del crudo guardado en consultas_equifax (la consulta más reciente de cada
// persona) y aplica la MISMA función que llena las tablas de la base: lo que se ve
// acá es lo que hay en las tablas. SOLO LEE: no llama a Equifax, no cobra y no
// escribe en la base.
//
// El Excel tiene datos de buró de personas reales (sin nombre, cédula, dirección ni
// teléfono: las tablas no los llevan, y la persona va por su código). Se escribe en
// research/equifax/excel/, fuera de git, y por pantalla sólo se imprimen conteos.
//
// Uso:
//   node scripts/exportar-equifax-tablas.mjs [--salida=<ruta.xlsx>]
//
// AVISO: este archivo no pasa por lint ni build.

import path from "node:path";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { cargarEntorno, carpetaDeResearch, raizPrincipal } from "./_comun/entorno.mjs";
import { explicar } from "./_comun/casos.mjs";
import { derivarTablas, columnasDeLaTabla, ESPECIFICACION_DE_TABLAS } from "../supabase/functions/_shared/equifax-tablas.ts";
import { calcularEstructura } from "../supabase/functions/_shared/equifax-estructura.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const valor = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
cargarEntorno(RAIZ);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const hora = (iso) => new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Guayaquil" });

// Las listas de Equifax de las que sale cada tabla (para el Léame).
const DE_DONDE_SALE = {
  equifax_operaciones: "detalle_deuda_actual_sb, _seps y _sicom: la deuda de hoy, una fila por operación",
  equifax_historia_mensual: "detalle_deuda_historica_sb, _seps y _sicom: 24 meses por operación",
  equifax_deuda_por_sistema_y_mes: "valor_deuda_3_sistemas (resumen de hoy), deuda_historica y evolucion_deuda_sb_seps_sicom",
  equifax_vencimientos: "estructura_vencimiento, detalle_estructura_vencimiento y saldos_por_vencer",
  equifax_tarjetas: "detalle_tarjetas y tarjetas_canceladas (sin el número de la tarjeta)",
  equifax_creditos: "creditos_otorgados y operaciones_canceladas (sin el número de operación)",
  equifax_consultas_recibidas: "entidades_consultados: una fila por entidad y mes",
  equifax_scores: "score, score_inclusion, score_sobreendeudamiento e historico_score",
  equifax_indicadores_por_periodo: "los historico_* y identificador_perfil_riesgo_directo*, en forma larga",
  equifax_codeudor_garante: "garantias_personales_codeudores_*: operaciones de otras personas de las que es codeudora o garante (sin el nombre del titular)",
  equifax_analisis_credito: "interconnectResponse.AnalisisCreditoSectorFinanciero: las diez variables de crédito del predictor de ingresos y las tres fechas de concesión, una sola fila",
  equifax_resumen: "los datos de una sola fila: impagos, morosidades, cuota estimada, inhabilitaciones, factores del score, SRI, estado de cartera e ingreso estimado de Equifax",
};

const { data: filas, error } = await db
  .from("consultas_equifax")
  .select("id, client_id, created_at, ambiente, tablas_version, estructura_version")
  .order("created_at", { ascending: true });
if (error) {
  console.error(explicar(error));
  process.exit(1);
}
// La más reciente de cada persona.
const porPersona = new Map();
for (const f of filas) porPersona.set(f.client_id ?? f.id, f);
const consultas = [...porPersona.values()];

const hojas = Object.fromEntries(Object.keys(ESPECIFICACION_DE_TABLAS).map((t) => [t, []]));
const filasConsultas = [];
const filasEstructura = [];

const aplanar = (o, pref = "", salida = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const ruta = pref ? `${pref}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) aplanar(v, ruta, salida);
    else salida[ruta] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return salida;
};

for (const c of consultas) {
  const { data, error: errCrudo } = await db.from("consultas_equifax").select("identificacion, respuesta_cruda").eq("id", c.id).single();
  if (errCrudo) {
    console.error(explicar(errCrudo));
    process.exit(1);
  }
  const persona = c.client_id ? `c-${String(c.client_id).slice(0, 8)}` : `consulta-${c.id.slice(0, 8)}`;
  const r = derivarTablas(data.respuesta_cruda);
  const verificada = (() => {
    const doc = data.respuesta_cruda?.reporteCrediticio?.identificacion_consultada?.[0]?.numero_documento;
    return typeof doc === "string" && doc.trim() !== "" ? doc.trim() === data.identificacion : null;
  })();
  const e = calcularEstructura(r, { consultadoEl: c.created_at, ambiente: c.ambiente, identidadVerificada: verificada });
  let total = 0;
  for (const [tabla, tfilas] of Object.entries(r.tablas)) {
    for (const f of tfilas) hojas[tabla].push({ persona, ...f });
    total += tfilas.length;
  }
  filasConsultas.push({
    persona, "consultada el (Ecuador)": hora(c.created_at), ambiente: c.ambiente, "identidad verificada": verificada === null ? "no se pudo comprobar" : verificada ? "sí" : "NO",
    "versión de las tablas": r.version, "versión de la estructura": e.version, "filas en las tablas": total, "avisos al descomponer": r.avisos.length,
  });
  filasEstructura.push({ persona, ...aplanar(e) });
}

const libro = XLSX.utils.book_new();
const agregar = (nombre, filasHoja, columnas) => {
  const ws = XLSX.utils.json_to_sheet(filasHoja, columnas ? { header: columnas } : undefined);
  const cols = columnas ?? Object.keys(filasHoja[0] ?? {});
  ws["!cols"] = cols.map((c) => ({ wch: Math.min(40, Math.max(10, c.length + 2)) }));
  if (filasHoja.length) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filasHoja.length, c: cols.length - 1 } }) };
  XLSX.utils.book_append_sheet(libro, ws, nombre.slice(0, 31));
};

const leame = [
  ["Qué es", `Lo que Equifax contestó de ${consultas.length} personas (la consulta más reciente de cada una), descompuesto en tablas: una hoja por tabla. La columna «persona» es el código c-xxxxxxxx (los 8 primeros caracteres del identificador interno); no hay nombres, cédulas, direcciones ni teléfonos.`],
  ["De dónde sale", "Del JSON que contestó Equifax (consultas_equifax.respuesta_cruda), con la misma función que llena las tablas de la base (equifax-tablas-v2). Los montos son dólares; las fechas, AAAA-MM-DD."],
  ["Cuidado", "Datos de buró de personas reales: fuera de git (research/), sólo para uso interno. Los importes de «resumen_informe», impagos, morosidades y la cuota estimada de Equifax cuentan también las operaciones donde la persona es codeudora o garante; el rol de cada operación está en la columna «rol»."],
  ["Hojas", ""],
  ...["Consultas", ...Object.keys(ESPECIFICACION_DE_TABLAS), "Estructura"].map((h) => [
    h,
    h === "Consultas" ? "Una fila por persona: cuándo se consultó y con qué versiones"
      : h === "Estructura" ? "La estructura estandarizada (equifax-estructura-v1), una fila por persona, con los campos aplanados con puntos"
      : `${hojas[h].length} filas · de ${DE_DONDE_SALE[h]}`,
  ]),
];
agregar("Léame", leame.map(([a, b]) => ({ tema: a, detalle: b })), ["tema", "detalle"]);
libro.Sheets["Léame"]["!cols"] = [{ wch: 34 }, { wch: 120 }];
agregar("Consultas", filasConsultas);
for (const tabla of Object.keys(ESPECIFICACION_DE_TABLAS)) agregar(tabla, hojas[tabla], ["persona", ...columnasDeLaTabla(tabla)]);
// La estructura: la unión de todas las columnas, en el orden en que aparecen.
const colsEstructura = ["persona", ...new Set(filasEstructura.flatMap((f) => Object.keys(f).filter((k) => k !== "persona")))];
agregar("Estructura", filasEstructura, colsEstructura);

const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guayaquil" });
const salida = valor("salida") ? path.resolve(valor("salida")) : path.join(carpetaDeResearch(RAIZ, "equifax", "excel"), `equifax-tablas-${consultas.length}-personas-${hoy}.xlsx`);
fs.writeFileSync(salida, XLSX.write(libro, { type: "buffer", bookType: "xlsx" }));

console.log(`personas: ${consultas.length}`);
for (const t of Object.keys(ESPECIFICACION_DE_TABLAS)) console.log(`  ${t.padEnd(34)} ${String(hojas[t].length).padStart(6)} filas`);
console.log(`Excel: ${path.relative(raizPrincipal(RAIZ), salida)}`);
