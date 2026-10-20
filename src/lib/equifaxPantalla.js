// Lo que la pestaña Equifax calcula para mostrar, sin React: se prueba en
// Node (scripts/probar-formatos.mjs, «Equifax»).
//
// Todo sale de lo guardado: la estructura (consultas_equifax.estructura, 126),
// las operaciones de hoy y la historia mensual (tablas equifax_*). La pantalla
// no recalcula ninguna cifra de la estructura; sólo arma la franja de 24 meses,
// que la estructura resume en contadores y el analista necesita ver mes a mes.

import { mesLegible } from "./ingresosCampos.js";

export const SISTEMAS = [
  ["bancos", "Bancos"],
  ["cooperativas", "Cooperativas"],
  ["comercial", "Sector comercial"],
];

const TIPOS_DE_CREDITO = {
  Comercial: "Comercial",
  Consumo: "Consumo",
  Microcredito: "Microcrédito",
  Tarjeta: "Tarjeta de crédito",
  Vivienda: "Vivienda",
};
export const tipoDeCredito = (t) => (t ? TIPOS_DE_CREDITO[t] ?? t : "—");

const ROLES = { titular: "Titular", codeudor: "Codeudor", garante: "Garante", otro: "Otro rol" };
export const rolLegible = (r) => ROLES[r] ?? "Otro rol";

// Los mismos cortes que usa el marco con la calificación de la
// Superintendencia y la estructura de Equifax (más de 90 días es grave).
export const NIVELES_DE_MORA = [
  { clave: "al_dia", texto: "Al día" },
  { clave: "hasta_30", texto: "1 a 30 días" },
  { clave: "hasta_90", texto: "31 a 90 días" },
  { clave: "mas_de_90", texto: "Más de 90 días" },
  { clave: "sin_deuda", texto: "Sin deuda como titular" },
];

export function nivelDeMora(dias) {
  if (dias === null || dias === undefined) return "sin_deuda";
  if (dias <= 0) return "al_dia";
  if (dias <= 30) return "hasta_30";
  if (dias <= 90) return "hasta_90";
  return "mas_de_90";
}

const mesDe = (fecha) => String(fecha ?? "").slice(0, 7);

function restarMeses(mes, n) {
  const [anio, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(anio, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

// Los 24 meses que terminan en el último corte de la historia: la misma
// ventana que `conductaDePago` de la estructura (el último mes se toma de
// todas las filas, no sólo de las del titular). Un mes sin operaciones como
// titular no es un mes al día: se dice aparte.
export function franjaDePagos(historia) {
  const filas = Array.isArray(historia) ? historia : [];
  const ultimo = filas.map((h) => mesDe(h.fecha_corte)).filter((m) => m !== "").sort().pop();
  if (!ultimo) return [];
  const porMes = new Map();
  for (const h of filas) {
    if (h.rol !== "titular") continue;
    const m = mesDe(h.fecha_corte);
    const previo = porMes.get(m) ?? { peorDias: 0, operaciones: 0, enMora: 0 };
    const dias = h.dias_morosidad ?? 0;
    porMes.set(m, {
      peorDias: Math.max(previo.peorDias, dias),
      operaciones: previo.operaciones + 1,
      enMora: previo.enMora + (dias > 0 ? 1 : 0),
    });
  }
  const meses = [];
  for (let i = 23; i >= 0; i--) {
    const mes = restarMeses(ultimo, i);
    const dato = porMes.get(mes) ?? null;
    meses.push({
      mes,
      texto: mesLegible(mes),
      peorDias: dato ? dato.peorDias : null,
      operaciones: dato ? dato.operaciones : 0,
      enMora: dato ? dato.enMora : 0,
      nivel: nivelDeMora(dato ? dato.peorDias : null),
    });
  }
  return meses;
}

// Lo que está en atraso de un bloque de deuda: vencido, lo que no devenga
// intereses, lo que está en demanda judicial y lo castigado. Son cuatro
// cosas distintas y la estructura las guarda separadas; sumadas son lo mismo
// que `deudaEnAtraso` del buró de Novadata (process.ts).
export function enAtraso(bloque) {
  if (!bloque) return null;
  return redondear(
    (bloque.saldoVencidoUsd ?? 0) +
      (bloque.saldoNoDevengaInteresesUsd ?? 0) +
      (bloque.saldoDemandaJudicialUsd ?? 0) +
      (bloque.saldoCarteraCastigadaUsd ?? 0),
  );
}

const redondear = (n) => Math.round(n * 100) / 100;

// Las tres filas de «Cuánto debe como titular», siempre las tres: un sistema
// sin deuda se muestra apagado, no se esconde (es Equifax diciendo que no hay).
export function filasDeDeuda(estructura) {
  const titular = estructura?.deudaActualTitular ?? {};
  return SISTEMAS.map(([clave, texto]) => {
    const b = titular[clave] ?? null;
    return {
      clave,
      texto,
      bloque: b,
      saldo: b?.saldoDeudaUsd ?? null,
      alDia: b?.saldoPorVencerUsd ?? null,
      atraso: enAtraso(b),
      cuota: b?.cuotaMensualUsd ?? null,
      maximoDias: b?.maximoDiasDeMora ?? null,
      operaciones: b?.numeroDeOperaciones ?? 0,
      instituciones: b?.institucionesDistintas ?? 0,
      demanda: (b?.saldoDemandaJudicialUsd ?? 0) > 0,
      castigada: (b?.saldoCarteraCastigadaUsd ?? 0) > 0,
      noCuadra: b?.conciliaConElResumen === "no",
    };
  });
}

// Lo propio primero y, dentro de cada rol, la deuda más grande arriba.
const ORDEN_DE_ROL = { titular: 0, codeudor: 1, garante: 2, otro: 3 };
export function operacionesOrdenadas(operaciones) {
  return [...(operaciones ?? [])].sort(
    (a, b) =>
      (ORDEN_DE_ROL[a.rol] ?? 9) - (ORDEN_DE_ROL[b.rol] ?? 9) ||
      (b.saldo_deuda_usd ?? 0) - (a.saldo_deuda_usd ?? 0) ||
      (a.orden ?? 0) - (b.orden ?? 0),
  );
}

export function atrasoDeOperacion(o) {
  return redondear(
    (o.vencido_usd ?? 0) + (o.no_devenga_intereses_usd ?? 0) + (o.demanda_judicial_usd ?? 0) + (o.cartera_castigada_usd ?? 0),
  );
}

// Lo grave sube a la cabecera: una inhabilitación, una demanda o un castigo
// no pueden quedar escondidos en una tabla (el mismo criterio que Aval).
export function alertasDeLaCabecera(estructura) {
  const alertas = [];
  const g = estructura?.estadoGeneral;
  if (g?.tieneInhabilitacionBancaria) alertas.push({ clase: "crediscope-tag-bad", texto: "Inhabilitación bancaria" });
  const total = estructura?.deudaActualTitular?.total;
  if ((total?.saldoCarteraCastigadaUsd ?? 0) > 0) alertas.push({ clase: "crediscope-tag-bad", texto: "Cartera castigada" });
  if ((total?.saldoDemandaJudicialUsd ?? 0) > 0) alertas.push({ clase: "crediscope-tag-bad", texto: "Deuda en demanda judicial" });
  if ((estructura?.conductaDePago?.mesesConMoraDeMasDe90Dias ?? 0) > 0) {
    alertas.push({ clase: "crediscope-tag-warn", texto: "Mora de más de 90 días en los últimos 24 meses" });
  }
  return alertas;
}

// El estado de cartera llega en mayúsculas y abreviado. Los siete que trajeron
// las 62 primeras consultas (2026-10-16): AL DIA, ESTA EN MORA 30 y 60, MORA 30
// y 90 AL DIA, DUDOSO RECAUDO y CART. CASTIGADA. «MORA 30 AL DIA» quiere decir,
// según la propia Equifax, al día hoy con vencidos de hasta 30 días: leído tal
// cual parece una contradicción.
export function estadoDeCarteraLegible(descripcion) {
  const t = String(descripcion ?? "").trim().toUpperCase();
  if (!t) return null;
  if (t === "AL DIA") return "Al día";
  if (t === "DUDOSO RECAUDO") return "Dudoso recaudo";
  if (/^CART\.? CASTIGADA$|^CARTERA CASTIGADA$/.test(t)) return "Cartera castigada";
  let m = /^ESTA EN MORA (\d+)$/.exec(t);
  if (m) return `En mora de hasta ${m[1]} días`;
  m = /^MORA (\d+) AL DIA$/.exec(t);
  if (m) return `Al día, con atrasos de hasta ${m[1]} días`;
  return t.charAt(0) + t.slice(1).toLowerCase();
}

// El nivel de sobreendeudamiento llega en minúsculas («alto», «medio»…).
export function nivelLegible(nivel) {
  if (!nivel) return null;
  const t = String(nivel).trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// Los textos del SRI que reenvía Equifax llegan en mayúsculas («ACTIVO»,
// «SUSPENDIDO», «OTROS»). Se escriben como oración; una sigla conocida queda
// en mayúsculas (RIMPE, RUC, SRI).
const SIGLAS = new Set(["RIMPE", "RUC", "SRI", "RISE"]);
export function textoDeEquifaxLegible(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  return t
    .split(/\s+/)
    .map((p, i) => (SIGLAS.has(p.toUpperCase()) ? p.toUpperCase() : i === 0 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase()))
    .join(" ");
}
