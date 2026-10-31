// Prueba las tablas y la estructura de Equifax contra las respuestas REALES
// guardadas en disco (research/equifax/crudo/), sin volver a consultar y sin
// tocar la base. Es la prueba que pide docs/propuesta-estructura-equifax.md:
// las funciones deterministas y versionadas, probadas con las 22 respuestas
// reales. Las pruebas de Deno (_shared/equifax-tablas.test.ts y
// equifax-estructura.test.ts) usan una respuesta inventada porque el
// repositorio es público; ésta usa las verdaderas.
//
// Qué mide, cada punto contra el JSON y no contra el mismo código:
//   1. determinismo: derivar dos veces da lo mismo;
//   2. cada tabla tiene tantas filas como las listas de Equifax de las que sale;
//   3. el detalle de todos los roles reproduce el resumen de Equifax: la misma
//      cuenta que scripts/conciliar-equifax.mjs hace sobre el JSON
//      (bancos 22 de 22, cooperativas 21 de 22 y comercial 16 de 22 el
//      2026-10-12);
//   4. titular + codeudor/garante = todos los roles, por sistema;
//   5. los tramos de mora suman el vencido del titular;
//   6. los CODEUDOR de la lista aparte de codeudor y garante coinciden con las
//      operaciones de rol codeudor del detalle; los garantes sólo se cuentan
//      (en Ecuador «garantía» es el colateral: acá no se usa esa palabra);
//   7. NINGÚN dato personal de la persona (nombre, documento, RUC, dirección,
//      teléfono, coordenadas, nombre e identificación de terceros, números de
//      operación y de tarjeta) aparece en las tablas ni en la estructura.
//
// Imprime SÓLO conteos y "ok"/"FALLA": nunca un monto, una cédula ni un nombre.
// Sale con 1 si algo falla.
//
//   node scripts/probar-equifax-tablas.mjs
//
// AVISO: este archivo no pasa por lint ni build. Si cambia la forma de la
// respuesta de Equifax, ajustar acá o la prueba mide otra cosa sin avisar.

import fs from "node:fs";
import path from "node:path";
import { carpetaDeResearch } from "./_comun/entorno.mjs";
import { centinelas } from "./_comun/equifax-personales.mjs";
import { derivarTablas, ESPECIFICACION_DE_TABLAS, fechaISO } from "../supabase/functions/_shared/equifax-tablas.ts";
import { calcularEstructura } from "../supabase/functions/_shared/equifax-estructura.ts";
import { mesesHastaElCorte } from "../supabase/functions/_shared/equifax-ventana.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const dir = carpetaDeResearch(RAIZ, "equifax", "crudo");

// La consulta más reciente de cada persona que contestó.
const ultimas = new Map();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (c.cuerpo) ultimas.set(c.etiqueta, { cuerpo: c.cuerpo, capturadoEl: c.capturadoEl });
}
const personas = [...ultimas.entries()];
if (personas.length === 0) {
  console.error("No hay respuestas guardadas en research/equifax/crudo/.");
  process.exit(1);
}

let fallas = 0;
function verifica(titulo, cumplen, de = personas.length) {
  const ok = cumplen === de;
  if (!ok) fallas++;
  console.log(`${ok ? "ok   " : "FALLA"} ${titulo.padEnd(100)} ${cumplen} de ${de}`);
}

const L = (rc, nombre) => (Array.isArray(rc?.[nombre]) ? rc[nombre].length : 0);
const S = (filas, campo) => (filas ?? []).reduce((a, f) => a + (Number(f?.[campo]) || 0), 0);
const igual = (a, b) => Math.abs(a - b) < 0.015;
const rolEs = (f, rol) => String(f.tipo_riesgo).toUpperCase() === rol;

console.log(`Personas: ${personas.length}\n`);

const salidas = personas.map(([etiqueta, p]) => {
  const r = derivarTablas(p.cuerpo);
  const e = calcularEstructura(r, { consultadoEl: p.capturadoEl ?? new Date().toISOString(), ambiente: "produccion", identidadVerificada: true });
  return { etiqueta, cuerpo: p.cuerpo, r, e };
});

console.log("1. Determinismo y avisos");
verifica("derivar dos veces da exactamente lo mismo", salidas.filter((s) => JSON.stringify(derivarTablas(s.cuerpo)) === JSON.stringify(s.r)).length);
verifica("la estructura se puede escribir como JSON sin perder nada (sin NaN ni undefined)", salidas.filter((s) => !/NaN|undefined|Infinity/.test(JSON.stringify(s.e)) && JSON.stringify(JSON.parse(JSON.stringify(s.e))) === JSON.stringify(s.e)).length);
verifica("la derivación no omitió ninguna fila (sin avisos)", salidas.filter((s) => s.r.avisos.length === 0).length);
verifica("toda fila lleva exactamente las columnas de su tabla", salidas.filter((s) => Object.entries(s.r.tablas).every(([t, filas]) => filas.every((f) => Object.keys(f).sort().join() === Object.keys(ESPECIFICACION_DE_TABLAS[t]).sort().join()))).length);
verifica("ninguna lista de las que se usan quedó sin leer (cobertura sin null)", salidas.filter((s) => Object.values(s.r.cobertura).every((n) => n !== null)).length);

console.log("\n2. Cada tabla tiene las filas de las listas de las que sale");
const lista = (s, ...n) => n.reduce((a, x) => a + L(s.cuerpo.reporteCrediticio, x), 0);
const igualA = (tabla, ...listas) => verifica(`${tabla} = ${listas.join(" + ")}`, salidas.filter((s) => s.r.tablas[tabla].length === lista(s, ...listas)).length);
igualA("equifax_operaciones", "detalle_deuda_actual_sb", "detalle_deuda_actual_seps", "detalle_deuda_actual_sicom");
igualA("equifax_historia_mensual", "detalle_deuda_historica_sb", "detalle_deuda_historica_seps", "detalle_deuda_historica_sicom");
igualA("equifax_deuda_por_sistema_y_mes", "valor_deuda_3_sistemas", "deuda_historica", "evolucion_deuda_sb_seps_sicom");
igualA("equifax_vencimientos", "estructura_vencimiento", "detalle_estructura_vencimiento", "saldos_por_vencer");
igualA("equifax_tarjetas", "detalle_tarjetas", "tarjetas_canceladas");
igualA("equifax_creditos", "creditos_otorgados", "operaciones_canceladas");
igualA("equifax_scores", "score", "score_inclusion", "score_sobreendeudamiento", "historico_score");
igualA("equifax_indicadores_por_periodo", "historico_acreedores", "historico_cuota_estimada", "historico_endeudamiento_comercial", "historico_endeudamiento_financiero", "historico_vencidos_comercial", "historico_vencidos_financiero", "identificador_perfil_riesgo_directo", "identificador_perfil_riesgo_directo_6_meses");
igualA("equifax_codeudor_garante", "garantias_personales_codeudores_operaciones_vigentes", "garantias_personales_codeudores_operaciones_no_vigentes");
verifica("equifax_consultas_recibidas = una fila por cada X de las entidades (sin la fila de encabezado)", salidas.filter((s) => {
  const filas = s.cuerpo.reporteCrediticio.entidades_consultados ?? [];
  const marcas = filas.slice(1).reduce((a, f) => a + Array.from({ length: 12 }, (_, i) => f[`mes${i + 1}`]).filter((m) => m !== null && m !== "").length, 0);
  return s.r.tablas.equifax_consultas_recibidas.length === marcas;
}).length);
verifica("equifax_resumen = una sola fila", salidas.filter((s) => s.r.tablas.equifax_resumen.length === 1).length);

console.log("\n3. El detalle de TODOS los roles contra el resumen de Equifax (valor_deuda_3_sistemas)");
const sistemas = [["bancos", "SB", "detalle_deuda_actual_sb"], ["cooperativas", "SEPS", "detalle_deuda_actual_seps"], ["comercial", "SICOM", "detalle_deuda_actual_sicom"]];
const esperado = { bancos: 22, cooperativas: 21, comercial: 16 }; // medido sobre el JSON el 2026-10-12 (scripts/conciliar-equifax.mjs), con comercial leído como bancos: 22 de 22 al leerlo como abajo
// En el detalle ACTUAL del sector comercial `saldo_deuda` es lo por vencer, no el total (2026-10-31): el
// total es por vencer + vencido + no devenga intereses. Se lee del JSON a mano, sin pasar por el código.
const totalDelJson = (sistema, filas) =>
  sistema === "comercial" ? S(filas, "saldo_deuda") + S(filas, "total_vencido") + S(filas, "ndi") : S(filas, "saldo_deuda");
const saldoDelJson = (sistema, filas) => totalDelJson(sistema, filas ?? []);
for (const [sistema, sigla, nombre] of sistemas) {
  const sobreElJson = salidas.filter((s) => {
    const r = s.cuerpo.reporteCrediticio.valor_deuda_3_sistemas?.find((x) => x.institucion?.includes(sigla));
    return r && igual(totalDelJson(sistema, s.cuerpo.reporteCrediticio[nombre]), r.total);
  }).length;
  const enLaEstructura = salidas.filter((s) => s.e.deudaActualTitular[sistema]?.conciliaConElResumen === "si").length;
  verifica(`${sistema}: la estructura concilia en tantas personas como el JSON`, enLaEstructura, sobreElJson);
  console.log(`      (${sistema}: el JSON concilia ${sobreElJson} de ${personas.length}; esperado el 2026-10-12: ${esperado[sistema]})`);
  if (personas.length === 22 && sistema !== "comercial" && sobreElJson !== esperado[sistema]) { fallas++; console.log(`FALLA ${sistema}: se esperaban ${esperado[sistema]}`); }
}

console.log("\n4. Titular + codeudor/garante = todos los roles, y cada cifra contra el JSON");
for (const [sistema, , nombre] of sistemas) {
  verifica(`${sistema}: saldo del titular = Σ del JSON de las filas TITULAR`, salidas.filter((s) => igual(s.e.deudaActualTitular[sistema].saldoDeudaUsd, saldoDelJson(sistema, (s.cuerpo.reporteCrediticio[nombre] ?? []).filter((f) => rolEs(f, "TITULAR"))))).length);
  verifica(`${sistema}: titular + codeudor/garante = todos los roles`, salidas.filter((s) => igual(s.e.deudaActualTitular[sistema].saldoDeudaUsd + s.e.deudaCodeudorGarante[sistema].saldoDeudaUsd, s.e.deudaActualTitular[sistema].saldoTodosLosRolesUsd)).length);
  verifica(`${sistema}: nº de operaciones del titular = filas TITULAR del JSON`, salidas.filter((s) => s.e.deudaActualTitular[sistema].numeroDeOperaciones === (s.cuerpo.reporteCrediticio[nombre] ?? []).filter((f) => rolEs(f, "TITULAR")).length).length);
}
verifica("la cuota mensual del titular = Σ cuota_mensual de las filas TITULAR del JSON", salidas.filter((s) => igual(s.e.deudaActualTitular.total.cuotaMensualUsd, sistemas.reduce((a, [, , n]) => a + S((s.cuerpo.reporteCrediticio[n] ?? []).filter((f) => rolEs(f, "TITULAR")), "cuota_mensual"), 0))).length);

console.log("\n5. Mora");
verifica("los tramos de mora suman el vencido del titular", salidas.filter((s) => igual(Object.entries(s.e.moraActual).filter(([k]) => k.startsWith("vencidoDe")).reduce((a, [, v]) => a + v, 0), s.e.moraActual.saldoVencidoUsd)).length);
verifica("el vencido del titular = Σ total_vencido de las filas TITULAR del JSON", salidas.filter((s) => igual(s.e.moraActual.saldoVencidoUsd, sistemas.reduce((a, [, , n]) => a + S((s.cuerpo.reporteCrediticio[n] ?? []).filter((f) => rolEs(f, "TITULAR")), "total_vencido"), 0))).length);
// La ventana llega al corte del reporte, que fija la evolución de 24 meses (equifax-ventana.ts), no el
// último mes con filas. Se lee del JSON a mano: la última fecha de la evolución y sus 24 meses.
const evolucionDelJson = (s) => s.cuerpo.reporteCrediticio.evolucion_deuda_sb_seps_sicom ?? [];
const conEvolucion = salidas.filter((s) => evolucionDelJson(s).length > 0);
verifica("la conducta de pago mira 24 meses: los de la evolución del reporte", conEvolucion.filter((s) => s.e.conductaDePago?.mesesObservados === 24).length, conEvolucion.length);
verifica("la ventana termina en el último mes de la evolución, hayan o no operaciones ese mes", conEvolucion.filter((s) => {
  const ultimo = evolucionDelJson(s).map((f) => String(fechaISO(f.fecha_corte)).slice(0, 7)).sort().pop();
  const ventana = mesesHastaElCorte(ultimo);
  return s.e.conductaDePago !== null && ventana.length === 24 && s.r.tablas.equifax_historia_mensual.every((h) => h.fecha_corte.slice(0, 7) <= ultimo);
}).length, conEvolucion.length);
verifica("meses con mora de más de 90 días <= meses con mora <= meses observados; meses con deuda vencida <= meses con mora", salidas.filter((s) => {
  const c = s.e.conductaDePago;
  return c.mesesConMoraDeMasDe90Dias <= c.mesesConMoraEnLosUltimos24 && c.mesesConMoraEnLosUltimos24 <= c.mesesObservados && c.mesesConDeudaVencida <= c.mesesConMoraEnLosUltimos24;
}).length);
verifica("el pico de operaciones en mora en un mes es de verdad el pico (contado a mano sobre las filas del titular)", salidas.filter((s) => {
  const porMes = new Map();
  for (const h of s.r.tablas.equifax_historia_mensual) if (h.rol === "titular" && (h.dias_morosidad ?? 0) > 0) porMes.set(h.fecha_corte.slice(0, 7), (porMes.get(h.fecha_corte.slice(0, 7)) ?? 0) + 1);
  return s.e.conductaDePago.maximoDeOperacionesEnMoraEnUnMes === Math.max(0, ...porMes.values());
}).length);

console.log("\n6. Tarjetas, codeudor y garante, y otros");
// La lista aparte trae tipo CODEUDOR y tipo GARANTE. Comparada entera contra el rol codeudor
// coincidía en 60 de 62 (2026-10-16): las dos que no son las únicas con GARANTE en la lista.
// Separada por tipo, CODEUDOR = rol codeudor en 62 de 62; los garantes de la lista y los del
// detalle casi nunca son los mismos (pregunta a Equifax: docs/equifax-pedido-de-diccionario.md),
// así que se cuentan sin cortar la prueba.
const deLaLista = (s, tipo) => s.r.tablas.equifax_codeudor_garante.filter((g) => g.vigente && String(g.tipo_deudor).toUpperCase() === tipo);
const delDetalle = (s, rol) => s.r.tablas.equifax_operaciones.filter((o) => o.rol === rol);
const mismaDeuda = (lista, detalle) => lista.length === detalle.length && igual(S(lista, "deuda_total_usd"), S(detalle, "saldo_deuda_usd"));
verifica("la lista aparte, tipo CODEUDOR = operaciones de rol codeudor del detalle actual (cantidad y monto)", salidas.filter((s) => mismaDeuda(deLaLista(s, "CODEUDOR"), delDetalle(s, "codeudor"))).length);
const conGarante = salidas.filter((s) => deLaLista(s, "GARANTE").length > 0 || delDetalle(s, "garante").length > 0);
console.log(`      (garante: ${conGarante.length} personas con alguno en la lista o en el detalle; coinciden en ${conGarante.filter((s) => mismaDeuda(deLaLista(s, "GARANTE"), delDetalle(s, "garante"))).length}. No corta: espera la respuesta de Equifax)`);
const conPoliticaDeUso = salidas.filter((s) => s.cuerpo.interconnectResponse.ResultadoPoliticas?.some((x) => /USO CUPO/.test(x.Politica)) && s.e.tarjetas?.usoActualPorcentaje !== null);
verifica(
  "el uso del cupo de hoy coincide con la política de uso de Equifax (sólo donde la política existe)",
  conPoliticaDeUso.filter((s) => Math.abs(Number(s.cuerpo.interconnectResponse.ResultadoPoliticas.find((x) => /USO CUPO/.test(x.Politica)).Valor) - s.e.tarjetas.usoActualPorcentaje) < 0.15).length,
  conPoliticaDeUso.length,
);
verifica("el score de Equifax = el score del JSON", salidas.filter((s) => s.e.scores.scoreEquifax === s.cuerpo.reporteCrediticio.score?.[0]?.score).length);
verifica("el score de hace 12 meses = el del histórico del JSON", salidas.filter((s) => s.e.scores.scoreEquifaxHace12Meses === s.cuerpo.reporteCrediticio.historico_score?.find((x) => x.retroactivo === "-12 Meses")?.score).length);
verifica("los protestos quedan como no medidos (null), no como cero", salidas.filter((s) => s.e.estadoGeneral.numeroDeProtestos === null && s.e.calidad.protestosMedidos === false).length);
verifica("el estado de cartera de Equifax viene rotulado como cálculo de Equifax", salidas.filter((s) => s.e.estadoGeneral.estadoDeCartera?.origen === "calculo_de_equifax").length);
verifica("las consultas recibidas cubren 12 meses sin contar a NovaCredit", salidas.filter((s) => s.e.consultasRecibidas?.consultasPorMes.length === 12 && s.e.consultasRecibidas.consultasDeNovaCreditEnLosUltimos12Meses >= 0).length);

console.log("\n7. Datos personales: ninguno llega a las tablas ni a la estructura");
let totalCentinelas = 0;
verifica("ningún dato personal de la persona aparece en las tablas ni en la estructura", salidas.filter((s) => {
  const texto = JSON.stringify(s.r.tablas) + JSON.stringify(s.e);
  const c = centinelas(s.cuerpo);
  totalCentinelas += c.length;
  return c.every((x) => !texto.includes(x));
}).length);
console.log(`      (se buscaron ${totalCentinelas} valores personales distintos en total)`);

console.log("\nFilas por tabla (todas las personas):");
for (const tabla of Object.keys(ESPECIFICACION_DE_TABLAS)) {
  const n = salidas.map((s) => s.r.tablas[tabla].length);
  console.log(`  ${tabla.padEnd(36)} total ${String(n.reduce((a, b) => a + b, 0)).padStart(6)} | por consulta: mín ${Math.min(...n)}, máx ${Math.max(...n)}`);
}
const bytes = salidas.map((s) => JSON.stringify({ t: s.r.tablas, e: s.e }).length);
console.log(`Tamaño de lo que viaja a la base por consulta: mín ${Math.round(Math.min(...bytes) / 1024)} KB, máx ${Math.round(Math.max(...bytes) / 1024)} KB.`);

console.log(fallas === 0 ? "\nTodo bien." : `\n${fallas} comprobación(es) fallaron.`);
process.exit(fallas === 0 ? 0 : 1);
