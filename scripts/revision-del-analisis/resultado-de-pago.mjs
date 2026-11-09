// El resultado de pago de la base de prueba (propuesta p8 de la revisión del análisis,
// aprobada el 2026-11-08): para cada persona de `research/base-prueba-2026-11/`, si el
// crédito que pidió a la institución ya figura en la cartera de la institución
// (`basesInternas.personasIncumplimientos` del crudo de Proveedor_Info_1) y, si figura,
// cómo se pagó: estado, cuotas pagadas y mora máxima.
//
// Por qué existe: la decisión de la institución es una referencia débil, porque entre la
// solicitud y la consulta que analizó el modelo pasan 120 días (mediana) y en 153 de 232
// más de 90. El pago real no depende de eso: el crédito se otorgó y se pagó o no. En el
// piloto del 2026-11-06, 3 de 12 casos ya lo tenían y uno estaba a 58 días de mora. Con él
// la revisión deja de juzgar al modelo sólo contra opiniones (la del jefe de crédito y la
// de la institución).
//
// Cómo se cotejan el crédito pedido y la operación de la cartera. Hace falta que coincidan
// las tres cosas, y se cuentan cuando coinciden:
//   1. el plazo en cuotas (exacto);
//   2. el importe: la cuota dentro del 3% de la que calculó la institución, o el saldo de
//      capital dentro del 1% del valor financiado cuando todavía no pagó cuotas (en el
//      piloto, c-14f9ee80 tiene el saldo exacto y una cuota diez veces mayor: la cuota de
//      la cartera no siempre es la del crédito, el saldo sí);
//   3. el tiempo: las cuotas ya vencidas son las de los meses entre la respuesta de la
//      institución y el corte de la cartera, con 3 meses de holgura. Es lo que separa el
//      crédito nuevo de uno anterior de la misma persona con el mismo plazo.
// Con las tres, la confianza es «alta» y el resultado cuenta. (En la base de prueba, 195 de los
// 197 cotejos «alta» tienen las cuotas vencidas a ±1 mes de lo esperado, y 144 la cuota a menos
// del 1%: la holgura de 3 meses y el 3% son límites, no lo habitual.) Con plazo e importe pero sin
// el tiempo, queda como «posible» y NO cuenta: una coincidencia de plazo y cuota no es
// prueba de que sea el mismo crédito.
//
// Se prueban dos créditos del mismo requerimiento: el del vehículo (valor financiado,
// plazo y cuota final) y el monto aprobado de consumo (con su plazo y su cuota).
//
// Lo que NO es: la persona puede tener un crédito que la institución no otorgó por esta
// solicitud pero sí con las mismas condiciones, o puede que una operación del mismo plazo
// y cuota sea de otro crédito. Por eso cada resultado lleva su criterio (qué coincidió) y la
// operación tal como la entrega la fuente.
//
// SÓLO LECTURA y sin costo. No escribe en la base, no abre ejecución operativa, no llama a
// Anthropic, Equifax ni Proveedor_Info_1: el crudo se lee del depósito propio (Storage) o
// del respaldo local de research/. Si una persona no tiene crudo, se usa el resumen de su
// perfil (`comportamientoInterno`), que trae una sola operación sin plazo ni cuotas y por
// eso no permite cotejar.
//
// Por consola sólo salen conteos y referencias c-xxxxxxxx. El archivo lleva datos
// completos (cédula no: sólo las ids de la persona y del perfil) y sale a
// research/revision-del-analisis/, fuera de git.
//
// El resultado va en la FASE 3 de la carpeta de cada caso (`armar-carpetas.mjs`), nunca en la
// 1: dice cómo terminó lo que el modelo no pudo ver.
//
// Uso:
//   node scripts/revision-del-analisis/resultado-de-pago.mjs [--base=base-prueba-2026-11]
//
// AVISO: este archivo no pasa por lint ni build. Si cambia `personasIncumplimientos` (los
// nombres de los campos de la cartera) o `credito-real.json`, ajustar acá o cotejará otra cosa.

import fs from "node:fs";
import path from "node:path";
import { PRINCIPAL, RAIZ, accesoASupabase, consultar, corto, lectorDeCrudos, listaDeUuid } from "./comun.mjs";
import { carpetaDeResearch } from "../_comun/entorno.mjs";

const arg = (nombre, porDefecto) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? porDefecto;
const BASE = path.join(PRINCIPAL, "research", arg("base", "base-prueba-2026-11"));
const SALIDA = path.join(carpetaDeResearch(RAIZ, "revision-del-analisis"), "resultado-de-pago-base-prueba.json");
for (const a of process.argv.slice(2)) {
  if (!/^--base=/.test(a)) { console.error(`Argumento desconocido: ${a}\nUso: node scripts/revision-del-analisis/resultado-de-pago.mjs [--base=base-prueba-2026-11]`); process.exit(1); }
}

// Los umbrales del cotejo, a la vista: son los que decidieron qué cuenta como el mismo crédito.
const TOLERANCIA_DE_LA_CUOTA = 0.03;
const TOLERANCIA_DEL_SALDO = 0.01;
const HOLGURA_EN_MESES = 3;
// La definición de impago del Laboratorio (110): más de 90 días.
const DIAS_DE_IMPAGO = 90;

// -------------------------------------------------------------------- utilidades
const num = (x) => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const cerca = (a, b, tolerancia) => a != null && b != null && b > 0 && Math.abs(a - b) / b <= tolerancia;
// Las fechas de AWS vienen sin zona: son hora de Ecuador (UTC-5), no la de la máquina.
const fechaDeAws = (t) => (t ? new Date(`${String(t).replace(" ", "T")}${/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? "" : "-05:00"}`) : null);
const aDia = (d) => (d ? new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10) : null);
// Meses completos entre dos días (AAAA-MM-DD).
function mesesEntre(desde, hasta) {
  const [ya, ma, da] = desde.split("-").map(Number), [yb, mb, db] = hasta.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma) - (db < da ? 1 : 0);
}

// Las operaciones de la cartera de la institución en el crudo. La fuente puede venir en una página
// o en varias.
function operacionesDelCrudo(raw) {
  const paginas = Array.isArray(raw?.basesInternas) ? raw.basesInternas : raw?.basesInternas ? [raw.basesInternas] : [];
  return paginas.flatMap((p) => (Array.isArray(p?.data?.personasIncumplimientos) ? p.data.personasIncumplimientos : []));
}

// La operación sin la identificación, tal como la entrega la fuente.
const sinIdentificacion = (op) => Object.fromEntries(Object.entries(op).filter(([k]) => k !== "identificacion"));

// El resumen de una operación con los números ya leídos.
function resumirOperacion(op) {
  return {
    operacion: op.operacion ?? null,
    estado: op.estadoOperacion ?? null,
    plazo_en_cuotas: num(op.plazoCuotas),
    cuotas_pagadas: num(op.cuotasCanceladas),
    cuotas_vencidas: num(op.cuotasVencidas),
    cuotas_activadas: num(op.cuotasActivadas),
    dias_de_mora_vigente: num(op.diasMoraVigentes),
    dias_de_mora_maxima: num(op.diasMoraMax),
    dias_maximos_de_mora_en_una_cuota: num(op.diasMaxMoraCuotas),
    saldo_de_capital: num(op.saldoCapital),
    cuota: num(op.cuotaNova),
    habito_de_pago: op.resultadoHabitoPago ?? null,
    perfil_interno: op.perfilInterno ?? null,
    corte: op.fechaCorte ?? null,
  };
}

// Cómo terminó (o va) la operación, con la definición de impago del Laboratorio.
function claseDeResultado(r) {
  if ((r.dias_de_mora_maxima ?? 0) > DIAS_DE_IMPAGO) return "impago";
  if ((r.dias_de_mora_vigente ?? 0) > 0) return "en_mora_hoy";
  if ((r.dias_de_mora_maxima ?? 0) > 0) return "atrasos_ya_pagados";
  return "sin_atrasos";
}

// Los créditos del requerimiento que se buscan en la cartera.
function creditosPedidos(c) {
  const lista = [];
  const plazo = num(c.plazo_meses);
  if (plazo > 0) lista.push({ tipo: "vehiculo", plazo, cuotas: [num(c.cuota_final), num(c.cuota_pagar)].filter((x) => x > 0), valor: num(c.valor_financiar) });
  if (num(c.monto_aprobado) > 0 && num(c.plazo_segmentacion) > 0) {
    lista.push({ tipo: "consumo", plazo: num(c.plazo_segmentacion), cuotas: [num(c.cuota_monto_aprobado)].filter((x) => x > 0), valor: num(c.monto_aprobado) });
  }
  return lista;
}

// Qué coincide entre una operación y un crédito pedido.
function cotejar(op, pedido, respuestaEl) {
  const corte = op.fechaCorte;
  const activadas = num(op.cuotasActivadas);
  const meses = corte && respuestaEl ? mesesEntre(respuestaEl, corte) : null;
  const plazo = num(op.plazoCuotas) === pedido.plazo;
  const cuota = pedido.cuotas.length ? pedido.cuotas.some((q) => cerca(num(op.cuotaNova), q, TOLERANCIA_DE_LA_CUOTA)) : null;
  // El saldo sólo prueba algo mientras no se pagó nada: después, el saldo baja.
  const saldo = (num(op.cuotasCanceladas) ?? 0) === 0 ? cerca(num(op.saldoCapital), pedido.valor, TOLERANCIA_DEL_SALDO) : null;
  // Una vigente tiene las cuotas de los meses que pasaron; una cancelada puede tener menos.
  const tiempo = meses === null || activadas === null ? null
    : op.estadoOperacion === "VIGENTE" ? Math.abs(activadas - meses) <= HOLGURA_EN_MESES : activadas <= meses + HOLGURA_EN_MESES;
  const importe = Boolean(cuota) || Boolean(saldo);
  return { credito: pedido.tipo, plazo, cuota, saldo, tiempo, meses_desde_la_respuesta: meses, confianza: plazo && importe && tiempo ? "alta" : plazo && importe ? "posible" : "ninguna" };
}

// De todas las operaciones, la que más se parece. Si dos son «alta» se queda con la de mejor
// importe y lo dice: la prueba de que son el mismo crédito es una, no dos.
function mejorCoincidencia(ops, pedidos, respuestaEl) {
  const candidatas = [];
  for (const op of ops) for (const pedido of pedidos) candidatas.push({ op, ...cotejar(op, pedido, respuestaEl) });
  const orden = { alta: 0, posible: 1, ninguna: 2 };
  const puntos = (c) => (c.cuota ? 1 : 0) + (c.saldo ? 1 : 0);
  candidatas.sort((a, b) => orden[a.confianza] - orden[b.confianza] || puntos(b) - puntos(a));
  const mejor = candidatas[0] ?? null;
  if (!mejor || mejor.confianza === "ninguna") return { mejor: null, ambigua: false };
  const iguales = candidatas.filter((c) => c.confianza === mejor.confianza);
  return { mejor, ambigua: new Set(iguales.map((c) => c.op.operacion)).size > 1 };
}

// ----------------------------------------------------------------------- entrada
const seleccion = JSON.parse(fs.readFileSync(path.join(BASE, "seleccion.json"), "utf8"));
const creditoReal = JSON.parse(fs.readFileSync(path.join(BASE, "credito-real.json"), "utf8"));

const filasDePerfil = consultar(`
  select id, created_at, crudo_ruta, standard_profile->'comportamientoInterno' as interno
  from client_profiles where id = any(${listaDeUuid(seleccion.map((s) => s.perfilId))});`);
const perfilDe = new Map(filasDePerfil.map((f) => [f.id, f]));

const crudoDelPerfil = lectorDeCrudos(accesoASupabase());

// ----------------------------------------------------------------------- por persona
async function resultadoDe(persona) {
  const caso = corto(persona.clientId);
  const perfil = perfilDe.get(persona.perfilId);
  const credito = creditoReal[persona.cedula] ?? null;
  const base = { caso, client_id: persona.clientId, perfil_id: persona.perfilId, segmento: persona.segmento ?? null };

  if (!perfil) return { ...base, fuente_de_la_cartera: null, figura_en_la_cartera: null, motivo: "El perfil de la selección no existe en la base." };

  // La cartera: el crudo si está; si no, el resumen del perfil, que no alcanza para cotejar.
  let operaciones = [], origen = null, observadaEl = null;
  try {
    const leido = await crudoDelPerfil(persona.perfilId, perfil.crudo_ruta);
    origen = leido.origen;
    if (leido.crudo) { operaciones = operacionesDelCrudo(leido.crudo.raw); observadaEl = leido.crudo.capturadoEl ?? null; }
  } catch (e) {
    origen = null;
  }
  const cartera = {
    operaciones: operaciones.length,
    vigentes: operaciones.filter((o) => o.estadoOperacion === "VIGENTE").length,
    en_mora_hoy: operaciones.filter((o) => (num(o.diasMoraVigentes) ?? 0) > 0).length,
    corte: operaciones.map((o) => o.fechaCorte).filter(Boolean).sort().at(-1) ?? null,
    crudo_capturado_el: observadaEl,
  };

  if (!origen) {
    return {
      ...base, fuente_de_la_cartera: perfil.interno ? "resumen del perfil (comportamientoInterno)" : "sin cartera",
      resumen_del_perfil: perfil.interno ?? null, figura_en_la_cartera: null,
      motivo: "No se encontró el crudo de este perfil: el resumen del perfil trae una sola operación, sin plazo ni cuotas, y con eso no se puede cotejar.",
    };
  }

  const pedido = credito && {
    fecha_de_la_solicitud: aDia(fechaDeAws(credito.fecha_ingreso_requerimiento)),
    fecha_de_la_respuesta: aDia(fechaDeAws(credito.fecha_respuesta)),
    decision: credito.decision_final ?? null,
    perfil_final: credito.perfil_final ?? null,
    estado_del_requerimiento: credito.estado_requerimiento ?? null,
    producto: credito.producto ?? null,
    plazo_en_meses: num(credito.plazo_meses),
    valor_a_financiar: num(credito.valor_financiar),
    cuota_final: num(credito.cuota_final),
    monto_aprobado: num(credito.monto_aprobado),
  };
  if (!credito) return { ...base, fuente_de_la_cartera: origen, cartera, figura_en_la_cartera: null, motivo: "La persona no tiene solicitud en credito-real.json: no hay qué cotejar." };
  if (!operaciones.length) return { ...base, fuente_de_la_cartera: origen, cartera, credito_pedido: pedido, figura_en_la_cartera: false, motivo: "La persona no tiene operaciones en la cartera de la institución." };

  const respuestaEl = pedido.fecha_de_la_respuesta ?? pedido.fecha_de_la_solicitud;
  const { mejor, ambigua } = mejorCoincidencia(operaciones, creditosPedidos(credito), respuestaEl);
  if (!mejor) {
    return { ...base, fuente_de_la_cartera: origen, cartera, credito_pedido: pedido, figura_en_la_cartera: false, motivo: "Ninguna operación de la cartera coincide en plazo e importe con el crédito pedido." };
  }
  const figura = mejor.confianza === "alta";
  const resumen = resumirOperacion(mejor.op);
  return {
    ...base, fuente_de_la_cartera: origen, cartera, credito_pedido: pedido,
    figura_en_la_cartera: figura,
    confianza_del_cotejo: mejor.confianza,
    ...(ambigua ? { ambigua: true } : {}),
    criterio: { credito_cotejado: mejor.credito, plazo: mejor.plazo, cuota: mejor.cuota, saldo: mejor.saldo, tiempo: mejor.tiempo, meses_desde_la_respuesta: mejor.meses_desde_la_respuesta },
    // Un «posible» no es un resultado: se deja la operación para quien quiera mirarla, sin clase.
    ...(figura ? { resultado: { ...resumen, clase: claseDeResultado(resumen) } } : { operacion_posible: resumen }),
    operacion_de_la_fuente: sinIdentificacion(mejor.op),
    otras_operaciones: operaciones.filter((o) => o.operacion !== mejor.op.operacion).map((o) => resumirOperacion(o)),
  };
}

// Una a la vez en grupos pequeños: son lecturas de Storage, no hace falta más.
const personas = {};
let hechas = 0;
for (let i = 0; i < seleccion.length; i += 6) {
  const lote = seleccion.slice(i, i + 6);
  const resultados = await Promise.all(lote.map(resultadoDe));
  for (const r of resultados) personas[r.client_id] = r;
  hechas += lote.length;
  if (hechas % 60 === 0 || hechas === seleccion.length) console.log(`  ${hechas} de ${seleccion.length}`);
}

// ----------------------------------------------------------------------- resumen
const lista = Object.values(personas);
const cuenta = (f) => lista.filter(f).length;
const conResultado = lista.filter((r) => r.figura_en_la_cartera === true);
const porClase = {};
for (const r of conResultado) porClase[r.resultado.clase] = (porClase[r.resultado.clase] ?? 0) + 1;
// Por decisión de la institución: de cuántas personas con esa decisión el crédito figura en la cartera. Si «RECHAZAR»
// figura, la decisión que trae credito-real.json no es la que decidió si se otorgaba.
const porDecision = {};
for (const r of lista.filter((x) => x.credito_pedido)) {
  const d = r.credito_pedido.decision ?? "sin decisión";
  porDecision[d] ??= { personas: 0, figuran: 0, en_mora_hoy: 0 };
  porDecision[d].personas++;
  if (r.figura_en_la_cartera) { porDecision[d].figuran++; if (r.resultado.clase === "en_mora_hoy") porDecision[d].en_mora_hoy++; }
}
const resumen = {
  personas: lista.length,
  con_crudo: cuenta((r) => r.cartera),
  sin_crudo: cuenta((r) => !r.cartera),
  con_solicitud_en_credito_real: cuenta((r) => r.credito_pedido),
  con_operaciones_en_la_cartera: cuenta((r) => r.cartera?.operaciones > 0),
  el_credito_figura_en_la_cartera: conResultado.length,
  posibles_sin_tiempo_coherente: cuenta((r) => r.confianza_del_cotejo === "posible"),
  ambiguas: cuenta((r) => r.ambigua),
  no_figura: cuenta((r) => r.figura_en_la_cartera === false),
  no_se_pudo_cotejar: cuenta((r) => r.figura_en_la_cartera === null),
  por_clase_de_resultado: porClase,
  el_credito_figura_segun_la_decision_de_la_institucion: porDecision,
};

fs.writeFileSync(SALIDA, JSON.stringify({
  formato: 1,
  generado_el: new Date().toISOString(),
  base: path.basename(BASE),
  criterio: { tolerancia_de_la_cuota: TOLERANCIA_DE_LA_CUOTA, tolerancia_del_saldo: TOLERANCIA_DEL_SALDO, holgura_en_meses: HOLGURA_EN_MESES, dias_de_impago: DIAS_DE_IMPAGO },
  resumen,
  personas,
}, null, 2), "utf8");

// ----------------------------------------------------------------------- consola
console.log(`Resultado de pago de ${resumen.personas} personas de ${path.basename(BASE)}:`);
console.log(`  crudo de la cartera: ${resumen.con_crudo} de ${resumen.personas} (${resumen.sin_crudo} sin crudo, no se puede cotejar)`);
console.log(`  con solicitud en credito-real.json: ${resumen.con_solicitud_en_credito_real} de ${resumen.personas}; con operaciones en la cartera: ${resumen.con_operaciones_en_la_cartera} de ${resumen.personas}`);
console.log(`  el crédito pedido figura en la cartera: ${resumen.el_credito_figura_en_la_cartera} de ${resumen.con_solicitud_en_credito_real}${resumen.ambiguas ? ` (${resumen.ambiguas} ambiguas)` : ""}; posibles sin tiempo coherente: ${resumen.posibles_sin_tiempo_coherente}`);
for (const [clase, n] of Object.entries(porClase)) console.log(`    ${clase.replace(/_/g, " ")}: ${n} de ${conResultado.length}`);
for (const [d, v] of Object.entries(porDecision)) console.log(`    decisión «${d}»: el crédito figura en ${v.figuran} de ${v.personas} (${v.en_mora_hoy} en mora hoy)`);
console.log(`  casos con el crédito en la cartera: ${conResultado.map((r) => r.caso).join(", ") || "ninguno"}`);
console.log(`Escrito: ${path.relative(PRINCIPAL, SALIDA).replace(/\\/g, "/")}`);
