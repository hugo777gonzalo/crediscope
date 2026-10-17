// La estructura estandarizada de Equifax: el paso 3 de
// docs/propuesta-estructura-equifax.md. Se calcula DESDE LAS TABLAS
// (equifax-tablas.ts), no desde el JSON: cada cifra se puede verificar con una
// suma sobre filas que se pueden mirar, y el trabajo difícil (roles, fechas,
// duplicados entre listas) ya quedó resuelto en la descomposición.
//
// Función pura y determinista, versionada (EQUIFAX_ESTRUCTURA_VERSION): al
// cambiar una regla se sube la versión y se rehacen las consultas con una
// anterior sin volver a pagar (scripts/cargar-tablas-equifax.mjs).
//
// REGLAS QUE SALIERON DE MEDIR LAS 22 RESPUESTAS (2026-10-12; se repiten con
// scripts/conciliar-equifax.mjs y scripts/probar-equifax-tablas.mjs):
//
// - El rol va en el nombre del grupo. `deudaActualTitular` es lo que la
//   persona debe como titular; `deudaCodeudorGarante`, lo que podría tener que
//   pagar por otro. Nunca se mezclan: 15 de 22 personas tienen operaciones
//   donde no son titulares, y en Aval esa mezcla inflaba la deuda.
// - El resumen de Equifax (valor_deuda_3_sistemas) cuenta TODOS los roles: la
//   suma del detalle de todos los roles lo reproduce (bancos 22 de 22), la del
//   titular solo no. Por eso `conciliaConElResumen` compara contra el saldo de
//   todos los roles, y los grupos de Equifax que salen de ahí
//   (impagos, evolución, cuota estimada) lo dicen.
// - Nunca se suman dos bloques de la respuesta: interconnectResponse trae la
//   misma deuda en otra forma y no cuadra. De ahí sólo entran el estado de
//   cartera y el ingreso estimado, rotulados como cálculos de Equifax.
// - Los tramos de mora se reparten por días de mora (hasta 30, 60, 90, 180,
//   270, 360, 720 y 1.080): reproducen los tramos que publica Equifax en 20 de
//   22 personas en bancos, y son del titular, que los de Equifax no distinguen.
// - Tarjetas: el `porcentaje_uso_tarjeta` de Equifax es el saldo PROMEDIO de
//   6 meses sobre el cupo (136 de 136), no el de hoy. El uso del cupo de hoy
//   (saldo actual sobre cupo) coincide con la política de uso de Equifax en
//   13 de 13.
// - Una cifra que no se midió no es cero: `protestos` viene siempre vacío y
//   sale null, y una lista que no vino sale null, no 0.
//
// Sin datos personales: no los hay en las tablas, y acá tampoco.

import {
  type FilaConsultaRecibida,
  type FilaCredito,
  type FilaDeudaPorSistema,
  type FilaCodeudorGarante,
  type FilaHistoria,
  type FilaIndicador,
  type FilaOperacion,
  type FilaScore,
  type FilaTarjeta,
  type ResultadoDeTablas,
  type Sistema,
  SISTEMAS,
} from "./equifax-tablas.ts";

export const EQUIFAX_ESTRUCTURA_VERSION = "equifax-estructura-v1";

export interface ContextoDeLaEstructura {
  consultadoEl: string; // ISO: consultas_equifax.created_at
  ambiente: string; // prueba | produccion
  identidadVerificada: boolean | null; // null: la respuesta no trajo el documento y no se pudo comprobar
}

export type Conciliacion = "si" | "no" | "sin_resumen" | "sin_detalle";

const CENTAVO = 0.015;
const redondear = (n: number): number => Math.round(n * 100) / 100;
const suma = <T>(filas: T[], valor: (x: T) => number | null): number => redondear(filas.reduce((a, x) => a + (valor(x) ?? 0), 0));
const maximo = (valores: Array<number | null>): number | null => {
  const v = valores.filter((x): x is number => x !== null);
  return v.length === 0 ? null : Math.max(...v);
};
const porcentaje = (parte: number, total: number): number | null => (total > 0 ? redondear((parte / total) * 100) : null);
const distintos = <T>(valores: T[]): number => new Set(valores).size;
const mesDe = (fecha: string): string => fecha.slice(0, 7);

// 00:00 de Ecuador es UTC-5 sin horario de verano: la fecha de la consulta es la de Ecuador.
// La usa también el perfil del modelo (la fecha del reporte de Equifax).
export function fechaEnEcuador(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso.slice(0, 10);
  return new Date(t.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

function mesesEntre(desde: string, hasta: string): number | null {
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  if ([a1, m1, d1, a2, m2, d2].some((x) => !Number.isFinite(x))) return null;
  const meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return meses < 0 ? null : meses;
}

// Los tramos del vencido según los días de mora. Se midió contra los tramos de
// Equifax (deuda_historica, último mes): 20 de 22 en bancos.
export const TRAMOS_DE_MORA = [
  { campo: "vencidoDe0a1MesUsd", hasta: 30 },
  { campo: "vencidoDe1a2MesesUsd", hasta: 60 },
  { campo: "vencidoDe2a3MesesUsd", hasta: 90 },
  { campo: "vencidoDe3a6MesesUsd", hasta: 180 },
  { campo: "vencidoDe6a9MesesUsd", hasta: 270 },
  { campo: "vencidoDe9a12MesesUsd", hasta: 360 },
  { campo: "vencidoDe12a24MesesUsd", hasta: 720 },
  { campo: "vencidoDe24a36MesesUsd", hasta: 1080 },
  { campo: "vencidoDeMasDe36MesesUsd", hasta: Infinity },
] as const;

function tramoDeMora(dias: number | null): (typeof TRAMOS_DE_MORA)[number]["campo"] {
  const d = dias ?? 0;
  return (TRAMOS_DE_MORA.find((t) => d <= t.hasta) ?? TRAMOS_DE_MORA[TRAMOS_DE_MORA.length - 1]).campo;
}

// ---------------------------------------------------------------------------
// Bloques reutilizados
// ---------------------------------------------------------------------------
function bloqueDeDeuda(ops: FilaOperacion[]) {
  return {
    numeroDeOperaciones: ops.length,
    institucionesDistintas: distintos(ops.map((o) => o.institucion)),
    saldoDeudaUsd: suma(ops, (o) => o.saldo_deuda_usd),
    saldoPorVencerUsd: suma(ops, (o) => o.por_vencer_usd),
    saldoVencidoUsd: suma(ops, (o) => o.vencido_usd),
    saldoNoDevengaInteresesUsd: suma(ops, (o) => o.no_devenga_intereses_usd),
    saldoDemandaJudicialUsd: suma(ops, (o) => o.demanda_judicial_usd),
    saldoCarteraCastigadaUsd: suma(ops, (o) => o.cartera_castigada_usd),
    cuotaMensualUsd: suma(ops, (o) => o.cuota_mensual_usd),
    maximoDiasDeMora: ops.length === 0 ? null : maximo(ops.map((o) => o.dias_morosidad)) ?? 0,
  };
}

function conciliar(todas: FilaOperacion[], resumen: FilaDeudaPorSistema | undefined, detalleMedido: boolean) {
  const saldoTodosLosRolesUsd = suma(todas, (o) => o.saldo_deuda_usd);
  if (!detalleMedido) return { saldoTodosLosRolesUsd: null, resumenDeEquifaxUsd: resumen?.saldo_deuda_usd ?? null, diferenciaConElResumenUsd: null, conciliaConElResumen: "sin_detalle" as Conciliacion };
  if (!resumen || resumen.saldo_deuda_usd === null) return { saldoTodosLosRolesUsd, resumenDeEquifaxUsd: null, diferenciaConElResumenUsd: null, conciliaConElResumen: "sin_resumen" as Conciliacion };
  const diferencia = redondear(saldoTodosLosRolesUsd - resumen.saldo_deuda_usd);
  return {
    saldoTodosLosRolesUsd,
    resumenDeEquifaxUsd: resumen.saldo_deuda_usd,
    diferenciaConElResumenUsd: diferencia,
    conciliaConElResumen: (Math.abs(diferencia) < CENTAVO ? "si" : "no") as Conciliacion,
  };
}

function conciliacionDelTotal(porSistema: Conciliacion[]): Conciliacion {
  if (porSistema.some((c) => c === "no")) return "no";
  if (porSistema.every((c) => c === "si")) return "si";
  if (porSistema.some((c) => c === "sin_detalle")) return "sin_detalle";
  return "sin_resumen";
}

const indicadorDe = (indicadores: FilaIndicador[], origen: string, meses: number): number | null =>
  indicadores.find((i) => i.origen === origen && i.retroactivo_meses === meses)?.valor_numero ?? null;

const tipoDeCredito = (t: string | null): "consumo" | "vivienda" | "microcredito" | "comercial" | "otros" => {
  const s = (t ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (s.startsWith("consumo")) return "consumo";
  if (s.startsWith("vivienda")) return "vivienda";
  if (s.startsWith("microcredito")) return "microcredito";
  if (s.startsWith("comercial")) return "comercial";
  return "otros";
};

// ---------------------------------------------------------------------------
// La estructura
// ---------------------------------------------------------------------------
export function calcularEstructura(r: ResultadoDeTablas, ctx: ContextoDeLaEstructura) {
  const t = r.tablas;
  const cob = r.cobertura;
  const medida = (...listas: string[]): boolean => listas.some((l) => (cob[l] ?? null) !== null);
  const operaciones = t.equifax_operaciones;
  const resumen = t.equifax_resumen[0];
  const fechaDeLaConsulta = fechaEnEcuador(ctx.consultadoEl);

  const titulares = operaciones.filter((o) => o.rol === "titular");
  const codeudoresYGarantes = operaciones.filter((o) => o.rol === "codeudor" || o.rol === "garante");
  const resumenDe = (s: Sistema): FilaDeudaPorSistema | undefined =>
    t.equifax_deuda_por_sistema_y_mes.find((f) => f.origen === "resumen_actual" && f.sistema === s);
  const detalleMedido = (s: Sistema): boolean => medida(s === "bancos" ? "detalle_deuda_actual_sb" : s === "cooperativas" ? "detalle_deuda_actual_seps" : "detalle_deuda_actual_sicom");

  // --- deuda actual del titular y como codeudor o garante, por sistema ---
  const porSistemaTitular = {} as Record<Sistema, ReturnType<typeof bloqueDeDeuda> & ReturnType<typeof conciliar> | null>;
  const porSistemaOtros = {} as Record<Sistema, ReturnType<typeof bloqueDeDeuda> | null>;
  for (const s of SISTEMAS) {
    const delSistema = operaciones.filter((o) => o.sistema === s);
    porSistemaTitular[s] = detalleMedido(s)
      ? { ...bloqueDeDeuda(delSistema.filter((o) => o.rol === "titular")), ...conciliar(delSistema, resumenDe(s), true) }
      : null;
    porSistemaOtros[s] = detalleMedido(s) ? bloqueDeDeuda(delSistema.filter((o) => o.rol === "codeudor" || o.rol === "garante")) : null;
  }
  const conciliaciones = SISTEMAS.map((s) => (porSistemaTitular[s] ? porSistemaTitular[s]!.conciliaConElResumen : ("sin_detalle" as Conciliacion)));
  const resumenesMedidos = SISTEMAS.map((s) => resumenDe(s)).filter((x): x is FilaDeudaPorSistema => x !== undefined);

  // --- mora actual del titular, por tramos de días ---
  const tramos = Object.fromEntries(TRAMOS_DE_MORA.map((x) => [x.campo, 0])) as Record<(typeof TRAMOS_DE_MORA)[number]["campo"], number>;
  for (const o of titulares) {
    if ((o.vencido_usd ?? 0) > 0) tramos[tramoDeMora(o.dias_morosidad)] = redondear(tramos[tramoDeMora(o.dias_morosidad)] + (o.vencido_usd ?? 0));
  }
  const saldoTitular = suma(titulares, (o) => o.saldo_deuda_usd);
  const vencidoTitular = suma(titulares, (o) => o.vencido_usd);

  // --- conducta de pago del titular, 24 meses ---
  // Se cuenta POR MES, nunca «por operación»: una operación no se puede seguir de un mes a otro
  // (las listas no traen su número y ninguna combinación de campos la identifica: ver
  // equifax-tablas.ts). Por eso no hay «operaciones que tuvieron mora» sino el pico de operaciones
  // en mora en un mismo mes.
  const historia = t.equifax_historia_mensual;
  const historiaMedida = medida("detalle_deuda_historica_sb", "detalle_deuda_historica_seps", "detalle_deuda_historica_sicom");
  let conductaDePago: {
    mesesObservados: number; mesesConMoraEnLosUltimos24: number; mesesConMoraDeMasDe90Dias: number; mesesConDeudaVencida: number;
    maximoDiasDeMoraEnLosUltimos24: number | null; fechaDeLaUltimaMora: string | null;
    maximoDeOperacionesEnMoraEnUnMes: number; maximoDeOperacionesConMoraDeMasDe90DiasEnUnMes: number;
  } | null = null;
  if (historiaMedida) {
    const ultimoMes = historia.map((h: FilaHistoria) => mesDe(h.fecha_corte ?? "")).filter((m) => m !== "").sort().pop() ?? null;
    const [anio, mes] = (ultimoMes ?? "0000-00").split("-").map(Number);
    const primerMesDeLaVentana = ultimoMes === null ? null : new Date(Date.UTC(anio, mes - 1 - 23, 1)).toISOString().slice(0, 7);
    const enLaVentana = (h: FilaHistoria) => primerMesDeLaVentana !== null && mesDe(h.fecha_corte ?? "") >= primerMesDeLaVentana;
    const delTitular = historia.filter((h) => h.rol === "titular" && enLaVentana(h));
    const conMora = delTitular.filter((h) => (h.dias_morosidad ?? 0) > 0);
    const conMoraDeMasDe90 = delTitular.filter((h) => (h.dias_morosidad ?? 0) > 90);
    const conVencido = delTitular.filter((h) => (h.vencido_usd ?? 0) > 0);
    const picoPorMes = (filas: FilaHistoria[]): number => {
      const porMes = new Map<string, number>();
      for (const h of filas) porMes.set(mesDe(h.fecha_corte ?? ""), (porMes.get(mesDe(h.fecha_corte ?? "")) ?? 0) + 1);
      return Math.max(0, ...porMes.values());
    };
    conductaDePago = {
      mesesObservados: distintos(historia.filter(enLaVentana).map((h) => mesDe(h.fecha_corte ?? ""))),
      mesesConMoraEnLosUltimos24: distintos(conMora.map((h) => mesDe(h.fecha_corte ?? ""))),
      mesesConMoraDeMasDe90Dias: distintos(conMoraDeMasDe90.map((h) => mesDe(h.fecha_corte ?? ""))),
      mesesConDeudaVencida: distintos(conVencido.map((h) => mesDe(h.fecha_corte ?? ""))),
      maximoDiasDeMoraEnLosUltimos24: maximo(delTitular.map((h) => h.dias_morosidad)),
      fechaDeLaUltimaMora: conMora.map((h) => h.fecha_corte ?? "").sort().pop() ?? null,
      maximoDeOperacionesEnMoraEnUnMes: picoPorMes(conMora),
      maximoDeOperacionesConMoraDeMasDe90DiasEnUnMes: picoPorMes(conMoraDeMasDe90),
    };
  }

  // --- scores ---
  const scoreDe = (tipo: string, meses = 0): FilaScore | undefined => t.equifax_scores.find((s) => s.tipo === tipo && s.retroactivo_meses === meses);
  const vigente = scoreDe("score");
  const historico = (meses: number) => scoreDe("historico", meses)?.score ?? null;
  const sobre = scoreDe("sobreendeudamiento");
  const hace12 = historico(-12);

  // --- evolución ---
  const ind = t.equifax_indicadores_por_periodo;
  const deudaEn = (meses: number): number | null => {
    const fin = indicadorDe(ind, "historico_endeudamiento_financiero", meses);
    const com = indicadorDe(ind, "historico_endeudamiento_comercial", meses);
    return fin === null || com === null ? null : redondear(fin + com);
  };
  const deudaActual = deudaEn(0);
  const deudaHace12 = deudaEn(-12);

  // --- tarjetas ---
  const vigentes = t.equifax_tarjetas.filter((x: FilaTarjeta) => x.estado === "vigente");
  const canceladas = t.equifax_tarjetas.filter((x: FilaTarjeta) => x.estado === "cancelada");
  const cupoTotal = suma(vigentes, (x) => x.cupo_usd);
  const usoPorTarjeta = vigentes.filter((x) => (x.cupo_usd ?? 0) > 0).map((x) => ((x.saldo_actual_usd ?? 0) / (x.cupo_usd ?? 1)) * 100);

  // --- créditos ---
  const otorgados = t.equifax_creditos.filter((c: FilaCredito) => c.origen === "creditos_otorgados");
  const porTipo = (tipo: ReturnType<typeof tipoDeCredito>) => suma(otorgados.filter((c) => tipoDeCredito(c.tipo_credito) === tipo), (c) => c.valor_operacion_usd);
  const conEstado = (estado: string) => otorgados.filter((c) => (c.estado_operacion ?? "").toUpperCase() === estado).length;

  // --- consultas recibidas ---
  const recibidas = t.equifax_consultas_recibidas;
  const sinNova = recibidas.filter((c: FilaConsultaRecibida) => !c.es_novacredit);
  const mesFinal = resumen.consultas_recibidas_mes_final;
  const mesInicial = resumen.consultas_recibidas_mes_inicial;
  const mesesDeLaVentana: string[] = [];
  if (mesFinal !== null && mesInicial !== null) {
    const [af, mf] = mesFinal.split("-").map(Number);
    for (let i = 0; i < 12; i++) {
      const m = new Date(Date.UTC(af, mf - 1 - i, 1)).toISOString().slice(0, 7);
      if (m < mesDe(mesInicial)) break;
      mesesDeLaVentana.push(m);
    }
  }
  const ultimos3 = mesesDeLaVentana.slice(0, 3);

  // --- la lista aparte de Equifax de operaciones de otras personas de las que es codeudora o garante ---
  // (Equifax la llama «garantías personales»; en Ecuador garantía es el colateral: auto, casa, pagaré.)
  const codeudorVigentes = t.equifax_codeudor_garante.filter((g: FilaCodeudorGarante) => g.vigente);
  const comoCodeudor = operaciones.filter((o) => o.rol === "codeudor");
  const listaAparteMedida = medida("garantias_personales_codeudores_operaciones_vigentes");

  // --- calidad de la propia respuesta ---
  const cortesDelDetalle = Object.fromEntries(SISTEMAS.map((s) => [s, [...new Set(operaciones.filter((o) => o.sistema === s).map((o) => o.fecha_corte ?? "sin fecha"))].sort()]));

  return {
    version: EQUIFAX_ESTRUCTURA_VERSION,
    tablasVersion: r.version,

    consulta: {
      consultadoEl: ctx.consultadoEl,
      ambiente: ctx.ambiente,
      identidadVerificada: ctx.identidadVerificada,
      version: EQUIFAX_ESTRUCTURA_VERSION,
    },

    scores: {
      scoreEquifax: vigente?.score ?? null,
      // El score_min y el score_max de Equifax son los límites de la BANDA en la que cae esta persona
      // (varían de una persona a otra: de 1 a 973 y de 414 a 999), no el rango posible del score.
      bandaDelScoreEquifaxDesde: vigente?.score_minimo ?? null,
      bandaDelScoreEquifaxHasta: vigente?.score_maximo ?? null,
      tasaDeMalosAcumuladaPorcentaje: vigente?.tasa_de_malos_acumulada_porcentaje ?? null,
      scoreEquifaxHace6Meses: historico(-6),
      scoreEquifaxHace12Meses: hace12,
      variacionDelScore12Meses: vigente?.score != null && hace12 !== null ? redondear(vigente.score - hace12) : null,
      scoreInclusionEquifax: scoreDe("inclusion")?.score ?? null,
      scoreSobreendeudamientoEquifax: sobre?.score ?? null,
      probabilidadDeSobreendeudamientoPorcentaje: sobre?.probabilidad_porcentaje ?? null,
      nivelDeSobreendeudamiento: sobre?.segmentacion?.toLowerCase() ?? null,
    },

    estadoGeneral: {
      // Un cálculo del motor de decisión de Equifax, no un hecho del buró.
      estadoDeCartera: resumen.estado_de_cartera_codigo === null && resumen.estado_de_cartera_descripcion === null
        ? null
        : {
          codigo: resumen.estado_de_cartera_codigo,
          descripcion: resumen.estado_de_cartera_descripcion,
          interpretacion: resumen.estado_de_cartera_interpretacion,
          origen: "calculo_de_equifax" as const,
        },
      fechaDelPrimerCredito: resumen.primer_credito_fecha,
      antiguedadCrediticiaMeses: resumen.primer_credito_fecha === null ? null : mesesEntre(resumen.primer_credito_fecha, fechaDeLaConsulta),
      tieneInhabilitacionBancaria: resumen.inhabilitaciones_numero === null ? null : resumen.inhabilitaciones_numero > 0,
      ultimaInhabilitacion: resumen.ultima_inhabilitacion_fecha === null
        ? null
        : { fecha: resumen.ultima_inhabilitacion_fecha, accion: resumen.ultima_inhabilitacion_accion, motivo: resumen.ultima_inhabilitacion_motivo },
      numeroDeMorosidades: resumen.morosidades_numero,
      // Viene siempre vacío en Equifax: no medido, no «0 protestos».
      numeroDeProtestos: resumen.protestos_numero,
      // Las cifras de impagos que publica Equifax cuentan también las operaciones donde la persona
      // es codeudora o garante (22 de 22): no son lo que debe como titular.
      impagosSegunEquifaxTodosLosRoles: {
        operacionesImpagas: { numero: resumen.impagos_numero, montoUsd: resumen.impagos_monto_usd },
        demandaJudicial: { numero: resumen.demanda_judicial_numero, montoUsd: resumen.demanda_judicial_monto_usd },
        carteraCastigada: { numero: resumen.cartera_castigada_numero, montoUsd: resumen.cartera_castigada_monto_usd },
      },
    },

    deudaActualTitular: {
      bancos: porSistemaTitular.bancos,
      cooperativas: porSistemaTitular.cooperativas,
      comercial: porSistemaTitular.comercial,
      total: {
        ...bloqueDeDeuda(titulares),
        saldoTodosLosRolesUsd: suma(operaciones, (o) => o.saldo_deuda_usd),
        resumenDeEquifaxUsd: resumenesMedidos.length === 0 ? null : suma(resumenesMedidos, (x) => x.saldo_deuda_usd),
        conciliaConElResumen: conciliacionDelTotal(conciliaciones),
      },
    },

    deudaCodeudorGarante: {
      bancos: porSistemaOtros.bancos,
      cooperativas: porSistemaOtros.cooperativas,
      comercial: porSistemaOtros.comercial,
      total: bloqueDeDeuda(codeudoresYGarantes),
      // Equifax la entrega también como una lista aparte. Medido en 22 de 22: es la MISMA deuda que
      // las operaciones de rol codeudor del detalle: sirve para comprobar, nunca para sumar.
      listaAparteDeEquifax: listaAparteMedida
        ? {
          numeroDeOperacionesVigentes: codeudorVigentes.length,
          deudaTotalUsd: suma(codeudorVigentes, (g) => g.deuda_total_usd),
          numeroDeOperacionesNoVigentes: t.equifax_codeudor_garante.length - codeudorVigentes.length,
          coincideConLasOperacionesDeRolCodeudor: medida("detalle_deuda_actual_sb", "detalle_deuda_actual_seps", "detalle_deuda_actual_sicom")
            ? codeudorVigentes.length === comoCodeudor.length && Math.abs(suma(codeudorVigentes, (g) => g.deuda_total_usd) - suma(comoCodeudor, (o) => o.saldo_deuda_usd)) < CENTAVO
            : null,
        }
        : null,
    },

    moraActual: {
      ...tramos,
      saldoVencidoUsd: vencidoTitular,
      porcentajeDeLaDeudaVencida: porcentaje(vencidoTitular, saldoTitular),
      numeroDeOperacionesVencidas: titulares.filter((o) => (o.vencido_usd ?? 0) > 0).length,
      maximoDiasDeMora: titulares.length === 0 ? null : maximo(titulares.map((o) => o.dias_morosidad)) ?? 0,
      vencidoSegunElResumenDeEquifaxTodosLosRolesUsd: resumenesMedidos.length === 0 ? null : suma(resumenesMedidos, (x) => x.vencido_usd),
    },

    conductaDePago,

    evolucion: {
      // Equifax calcula estas series con TODOS los roles (el «actual» es igual al resumen).
      deudaActualUsd: deudaActual,
      deudaHace6MesesUsd: deudaEn(-6),
      deudaHace12MesesUsd: deudaHace12,
      variacionDeLaDeuda12MesesPorcentaje: deudaActual !== null && deudaHace12 !== null && deudaHace12 > 0 ? redondear(((deudaActual - deudaHace12) / deudaHace12) * 100) : null,
      acreedoresActuales: indicadorDe(ind, "historico_acreedores", 0),
      acreedoresHace6Meses: indicadorDe(ind, "historico_acreedores", -6),
      acreedoresHace12Meses: indicadorDe(ind, "historico_acreedores", -12),
      cuotaEstimadaActualUsd: indicadorDe(ind, "historico_cuota_estimada", 0),
      cuotaEstimadaHace12MesesUsd: indicadorDe(ind, "historico_cuota_estimada", -12),
    },

    tarjetas: medida("detalle_tarjetas")
      ? {
        numeroDeTarjetasVigentes: vigentes.length,
        cupoTotalUsd: cupoTotal,
        saldoTotalUsd: suma(vigentes, (x) => x.saldo_actual_usd),
        usoActualPorcentaje: porcentaje(suma(vigentes, (x) => x.saldo_actual_usd), cupoTotal),
        // El «uso» de Equifax es el saldo promedio de 6 meses sobre el cupo.
        usoPromedioPorcentaje: porcentaje(suma(vigentes, (x) => x.saldo_promedio_6_meses_usd), cupoTotal),
        usoMaximoPorcentaje: usoPorTarjeta.length === 0 ? null : redondear(Math.max(...usoPorTarjeta)),
        saldoPromedio6MesesUsd: suma(vigentes, (x) => x.saldo_promedio_6_meses_usd),
        antiguedadDeLaMasAntiguaMeses: maximo(vigentes.map((x) => x.antiguedad_meses)),
        numeroDeTarjetasConSaldoMayorAlCupo: vigentes.filter((x) => (x.saldo_actual_usd ?? 0) > (x.cupo_usd ?? 0)).length,
        numeroDeTarjetasCanceladas: canceladas.length,
      }
      : null,

    creditosOtorgados: medida("creditos_otorgados")
      ? {
        numeroDeCreditosOtorgados: otorgados.length,
        numeroDeCreditosOriginales: conEstado("ORIGINAL"),
        numeroDeCreditosRefinanciados: conEstado("REFINANCIADA"),
        numeroDeCreditosReestructurados: conEstado("REESTRUCTURADA"),
        numeroDeCreditosNovados: conEstado("NOVADA"),
        numeroDeCreditosCancelados: medida("operaciones_canceladas") ? t.equifax_creditos.filter((c) => c.origen === "operaciones_canceladas").length : null,
        montoOriginalTotalUsd: suma(otorgados, (c) => c.valor_operacion_usd),
        montoOriginalConsumoUsd: porTipo("consumo"),
        montoOriginalViviendaUsd: porTipo("vivienda"),
        montoOriginalMicrocreditoUsd: porTipo("microcredito"),
        montoOriginalComercialUsd: porTipo("comercial"),
        fechaDeLaUltimaConcesion: otorgados.map((c) => c.fecha_concesion ?? "").filter((f) => f !== "").sort().pop() ?? null,
      }
      : null,

    consultasRecibidas: medida("entidades_consultados") && mesesDeLaVentana.length > 0
      ? {
        // Una entidad puede escribirse de varias maneras («BANCO DE GUAYAQUL», «BANCO GUAYAQUIL»): el
        // número de entidades por nombre sobrecuenta; el de consultas (entidad y mes) no.
        entidadesQueLaConsultaronEnLosUltimos12Meses: distintos(sinNova.map((c) => c.entidad)),
        consultasEnLosUltimos12Meses: sinNova.length,
        entidadesEnLosUltimos3Meses: distintos(sinNova.filter((c) => ultimos3.includes(mesDe(c.mes ?? ""))).map((c) => c.entidad)),
        consultasEnLosUltimos3Meses: sinNova.filter((c) => ultimos3.includes(mesDe(c.mes ?? ""))).length,
        consultasPorMes: mesesDeLaVentana.map((m) => ({ mes: m, consultas: sinNova.filter((c) => mesDe(c.mes ?? "") === m).length })),
        consultasDeNovaCreditEnLosUltimos12Meses: recibidas.length - sinNova.length,
      }
      : null,

    actividadEconomica: resumen.sri_tiene_ruc === null
      ? null
      : {
        tieneRuc: resumen.sri_tiene_ruc,
        estadoDelRuc: resumen.sri_estado_contribuyente,
        claseDeContribuyente: resumen.sri_clase_contribuyente,
        obligadoALlevarContabilidad: resumen.sri_obligado_a_contabilidad,
        fechaDeInicioDeActividades: resumen.sri_fecha_inicio_actividades,
        fechaDeSuspensionDefinitiva: resumen.sri_fecha_suspension_definitiva,
      },

    // Estimaciones de un tercero: se guardan y se rotulan; no entran al modelo hasta decidirlo. No se
    // especula sobre el ingreso.
    estimacionesDeEquifax: {
      ingresoEstimadoUsd: resumen.ingreso_estimado_usd,
      ingresoDelIndicadorDeImpactoEconomicoUsd: resumen.impacto_economico_ingreso_usd,
      cuotaFinancieraEstimadaUsd: resumen.impacto_economico_cuota_financiera_usd,
      indicadorDeImpactoEconomico: resumen.impacto_economico_indicador,
      cuotaEstimadaMensualTodosLosRolesUsd: resumen.cuota_estimada_mensual_usd,
    },

    calidad: {
      avisos: r.avisos,
      listasQueNoVinieron: Object.entries(cob).filter(([, n]) => n === null).map(([nombre]) => nombre).sort(),
      operacionesConSaldoQueNoCuadra: operaciones.filter((o) =>
        o.saldo_deuda_usd !== null &&
        Math.abs((o.por_vencer_usd ?? 0) + (o.vencido_usd ?? 0) + (o.no_devenga_intereses_usd ?? 0) + (o.demanda_judicial_usd ?? 0) + (o.cartera_castigada_usd ?? 0) - o.saldo_deuda_usd) > CENTAVO
      ).length,
      operacionesConRolDesconocido: operaciones.filter((o) => o.rol === "otro").length,
      cortesDelDetalleActual: cortesDelDetalle,
      protestosMedidos: resumen.protestos_numero !== null,
    },
  };
}

export type EstructuraEquifax = ReturnType<typeof calcularEstructura>;
