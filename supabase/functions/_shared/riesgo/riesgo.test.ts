// El veredicto de riesgo (E10): una prueba por cada una de las 14 decisiones del negocio sobre R2, R3 y R4 (2026-11-22) y los
// casos de la forma. Personas inventadas: el repositorio es público.
//
// deno test --allow-env --allow-read=supabase/functions,supabase/migrations supabase/functions/

import { assert, assertEquals } from "jsr:@std/assert@1";
import { configurarEstandar, plantillaCompleta } from "../estandar/configurar-estandar.ts";
import type { EstandarDeLaInstitucion } from "../estandar/estandar.ts";
import { umbralesPorRevisar } from "../estandar/validar-estandar.ts";
import type { Entidad, HechosDeLaPersona } from "../hechos/tipos.ts";
import { evaluarAgravantes, evaluarAtenuantes, puedeSubirLaIA, techoDeLaIA } from "./atenuantes.ts";
import { type EntradaDeRiesgo, entradaDeRiesgoDesdeHechos, type OperacionDeRiesgo } from "./entrada.ts";
import { demandaDeCobro, estaSuperado, eventosHistoricos, filaDelDecaimiento, historialDeLaPersona } from "./historial.ts";
import { moraVigente, salidaPorLaMora } from "./mora-vigente.ts";
import { calcularVeredictoDeRiesgo } from "./veredicto-de-riesgo.ts";

const CONSULTA = "2026-11-22T15:00:00Z";
const DEFECTO = plantillaCompleta("por_defecto");
const CONSERVADORA = plantillaCompleta("conservadora");

let n = 0;
function op(p: Partial<OperacionDeRiesgo> & Pick<OperacionDeRiesgo, "sistema">): OperacionDeRiesgo {
  const sector = p.sistema === "cooperativas" ? "seps" : p.sistema === "comercial" ? "comercial" : "sbs";
  return {
    clave: `op-${String(++n).padStart(6, "0")}`, sector, rol: "titular", calificacion: null, diasDeMora: null, saldoVencido: null, saldoNoDevenga: null,
    saldoEnDemanda: null, saldoCastigado: null, saldoVigente: null, cuotaMensual: null, fechaDelDato: "2026-11-22", ...p,
  };
}
// Un banco al día con una deuda formal (para «superado» y los atenuantes).
const bancoAlDia = (saldo = 3000) => op({ sistema: "bancos", calificacion: "A1", saldoVigente: saldo, saldoVencido: 0, saldoNoDevenga: 0 });
const coop = (dias: number, vencido: number | null, extra: Partial<OperacionDeRiesgo> = {}) => op({ sistema: "cooperativas", diasDeMora: dias, saldoVencido: vencido, ...extra });

function entrada(operaciones: OperacionDeRiesgo[], extra: Partial<EntradaDeRiesgo> = {}): EntradaDeRiesgo {
  return {
    fechaDeLaConsulta: CONSULTA, conBuro: false, operaciones, fuentesSinRespuesta: [], demandasDeCobro: [], listaDeMalPagador: false,
    pensionAlimenticia: { enMora: false, deudaUsd: null }, impedimentoParaCargosPublicos: false, rucSuspendidoNoDepurado: false,
    multasDeTransitoEnSalariosBasicos: 0, saldoTotalCooperativas: null, estabilidadMeses: 24,
    ingresoReportado: { promedioUltimos6: null, promedioUltimos12: null, ingresoMensual: null }, anioDelCorteDelIess: 2026,
    historialMensual: null, bajaDelEndeudamiento12Meses: null, deudaDeLaConsultaAnterior: null, ...extra,
  };
}
function estandarCon(cambios: Record<string, unknown>): EstandarDeLaInstitucion {
  const r = configurarEstandar({ plantilla: "por_defecto", cambios });
  assert(r.ok, r.ok ? "" : r.errores.join("\n"));
  return (r as { ok: true; estandar: EstandarDeLaInstitucion }).estandar;
}

// ---------------------------------------------------------------- decisión 1

Deno.test("decisión 1: se compara lo vencido de las operaciones con más de 30 días, no el saldo en atraso", () => {
  // Una cooperativa a 45 días con USD 100 vencidos, una a 10 días con USD 5.000 (no cuenta: es atraso corto) y un saldo que no devenga de USD 500.
  const e = entrada([coop(45, 100, { saldoNoDevenga: 500 }), coop(10, 5000)]);
  const m = moraVigente(e, DEFECTO);
  assertEquals(m.sectores.seps.montoUsd, 100);
  assertEquals(m.sectores.seps.tramo, "revisar"); // 30 < 100 <= 200
  // La alternativa del estándar, todo el saldo en atraso (vencido, no devenga, demanda y castigo): 600, Negar.
  const alt = estandarCon({ riesgo: { moraVigente: { montoQueSeCompara: "saldo_en_atraso" } } });
  const m2 = moraVigente(e, alt);
  assertEquals(m2.sectores.seps.montoUsd, 600);
  assertEquals(m2.sectores.seps.tramo, "negar");
});

// ---------------------------------------------------------------- decisión 2

Deno.test("decisión 2: bancos sin buró manda la letra; con buró, los dólares", () => {
  const letra = (l: string, extra: Partial<OperacionDeRiesgo> = {}) => moraVigente(entrada([op({ sistema: "bancos", calificacion: l, saldoNoDevenga: 90000, ...extra })]), DEFECTO).sectores.sbs;
  // A2 y A3 Aceptar, B1 a C2 Revisar, D y E Negar: el saldo que no devenga (USD 90.000) no cuenta sin los días.
  assertEquals(["A2", "A3"].map((l) => letra(l).tramo), ["aceptar", "aceptar"]);
  assertEquals(["B1", "B2", "C1", "C2"].map((l) => letra(l).tramo), ["revisar", "revisar", "revisar", "revisar"]);
  assertEquals(["D", "E"].map((l) => letra(l).tramo), ["negar", "negar"]);
  assertEquals(letra("A1").tramo, "no_cuenta");
  assertEquals(letra("B2").peorLetra, "B2");
  // Con buró hay días y vencido por operación: los dólares. USD 20 vencidos a 40 días es Aceptar aunque la letra sea B2.
  const conBuro = moraVigente(entrada([op({ sistema: "bancos", calificacion: "B2", diasDeMora: 40, saldoVencido: 20 })], { conBuro: true }), DEFECTO).sectores.sbs;
  assertEquals(conBuro.tramo, "aceptar");
  assertEquals(conBuro.montoUsd, 20);
  // La alternativa «por los dólares» con una operación sin días ni vencido: no se puede medir, y se dice.
  const porDolares = estandarCon({ riesgo: { moraVigente: { bancosSinBuro: "por_los_dolares" } } });
  const r = moraVigente(entrada([op({ sistema: "bancos", calificacion: "C1" })], { conBuro: true }), porDolares);
  assertEquals(r.sectores.sbs.tramo, "no_cuenta");
  assert(r.sectores.sbs.sinMedir.includes("banco_sin_dias_ni_vencido"));
  // La expansiva acepta las B1 y B2.
  assertEquals(moraVigente(entrada([op({ sistema: "bancos", calificacion: "B1" })]), plantillaCompleta("expansiva")).sectores.sbs.tramo, "aceptar");
});

// ---------------------------------------------------------------- decisión 3

Deno.test("decisión 3: el tramo Revisar es Aprobado con Requisitos con el certificado de estar al día si la capacidad alcanza; si no, Revisar", () => {
  const alcanza = salidaPorLaMora("revisar", true, DEFECTO);
  assertEquals(alcanza, { nivel: "deteriorado", salidaMaxima: "condicionado", requisito: "certificado_de_estar_al_dia", esMoraDeHoy: false });
  assertEquals(salidaPorLaMora("revisar", false, DEFECTO).salidaMaxima, "revisar");
  assertEquals(salidaPorLaMora("revisar", null, DEFECTO).requisito, null);
  // La conservadora lo deja en Revisar siempre.
  assertEquals(salidaPorLaMora("revisar", true, CONSERVADORA).salidaMaxima, "revisar");
  // Los otros tramos de R3: Aceptar llega a Aprobar (sin Aprobación Directa); Negar es mal comportamiento vigente.
  assertEquals(salidaPorLaMora("aceptar", true, DEFECTO), { nivel: "con_observaciones", salidaMaxima: "aprobar", requisito: null, esMoraDeHoy: false });
  assertEquals(salidaPorLaMora("negar", true, DEFECTO).nivel, "mal_comportamiento");
  assertEquals(salidaPorLaMora("negar", true, DEFECTO).esMoraDeHoy, true);
  assertEquals(salidaPorLaMora("no_cuenta", true, DEFECTO).salidaMaxima, null);
});

// ---------------------------------------------------------------- decisión 4

Deno.test("decisión 4: manda el peor sector, sin sumar; la mora en varios sectores es un agravante", () => {
  // USD 25 vencidos en SBS y USD 25 en SEPS, los dos con más de 30 días: cada uno es Aceptar (hasta USD 30). Sumados (50) serían Revisar.
  const ops = [op({ sistema: "bancos", calificacion: "A2", diasDeMora: 40, saldoVencido: 25 }), coop(40, 25)];
  const m = moraVigente(entrada(ops, { conBuro: true }), DEFECTO);
  assertEquals(m.tramo, "aceptar");
  assertEquals(m.sectoresConMora, ["sbs", "seps"]);
  const v = calcularVeredictoDeRiesgo(entrada(ops, { conBuro: true }), DEFECTO);
  assertEquals(v.nivel, "con_observaciones");
  // Es un agravante cuando hay mal comportamiento: mora en más de un sector.
  const conMal = [...ops, op({ sistema: "bancos", calificacion: "E" })];
  const ag = evaluarAgravantes(entrada(conMal, { conBuro: true }), DEFECTO, { mora: moraVigente(entrada(conMal, { conBuro: true }), DEFECTO), historial: historialDeLaPersona(entrada(conMal, { conBuro: true }), DEFECTO, moraVigente(entrada(conMal, { conBuro: true }), DEFECTO)) });
  assertEquals(ag.find((x) => x.id === "mora_en_mas_de_un_sector")?.estado, "se_cumple");
  // La alternativa, sumar los montos contra el umbral más bajo (aceptar hasta 30): 50, Revisar.
  const suma = estandarCon({ riesgo: { moraVigente: { variosSectores: "suma_los_montos" } } });
  assertEquals(moraVigente(entrada(ops, { conBuro: true }), suma).tramo, "revisar");
  // Un sector con mora y los otros sin ella no es un agravante.
  const uno = moraVigente(entrada([coop(40, 25)]), DEFECTO);
  assertEquals(uno.sectoresConMora, ["seps"]);
});

// ---------------------------------------------------------------- decisión 5

Deno.test("decisión 5: más de 90 días, o D o E, con un monto chico, tramo mínimo Revisar (la conservadora, Negar)", () => {
  // Más de 90 días con USD 20 vencidos (hasta 30, Aceptar): sube a Revisar.
  const largo = moraVigente(entrada([coop(120, 20)]), DEFECTO).sectores.seps;
  assertEquals(largo.tramo, "revisar");
  assert(largo.subioPorElAtrasoLargo);
  // Con 90 días justos no es «más de 90»: queda Aceptar.
  assertEquals(moraVigente(entrada([coop(90, 20)]), DEFECTO).sectores.seps.tramo, "aceptar");
  // D o E con los dólares (con buró) y un monto chico: Revisar.
  assertEquals(moraVigente(entrada([op({ sistema: "bancos", calificacion: "D", diasDeMora: 40, saldoVencido: 10 })], { conBuro: true }), DEFECTO).sectores.sbs.tramo, "revisar");
  // La conservadora (que sólo tolera USD 0 en SEPS): más de 90 días sin monto vencido, Negar.
  assertEquals(moraVigente(entrada([coop(120, 0)]), CONSERVADORA).sectores.seps.tramo, "negar");
  // Un monto que ya no es chico no necesita la regla: Negar por los dólares.
  assertEquals(moraVigente(entrada([coop(120, 900)]), DEFECTO).sectores.seps.tramo, "negar");
});

// ---------------------------------------------------------------- decisión 6

Deno.test("decisión 6: el retail del proveedor, con su corte de julio de 2025, es historial y no mora de hoy", () => {
  const retail = op({ sistema: "comercial", diasDeMora: 120, saldoVencido: 400, fechaDelDato: "2025-07-15" });
  const e = entrada([retail, bancoAlDia()]);
  // No es mora de hoy: el sector comercial no cuenta.
  assertEquals(moraVigente(e, DEFECTO).sectores.comercial.tramo, "no_cuenta");
  assertEquals(moraVigente(e, DEFECTO).tramo, "no_cuenta");
  // Es un evento histórico de hace 16 meses; con más de 90 días empieza una fila más arriba. Superado (al día y con una deuda formal), Aceptar.
  const ev = eventosHistoricos(e, DEFECTO);
  assertEquals(ev.length, 1);
  assertEquals(ev[0].mesesDesde, 16);
  const h = historialDeLaPersona(e, DEFECTO, moraVigente(e, DEFECTO));
  assertEquals(h.superado.superado, true);
  assertEquals([h.fila, h.efecto, h.tramo], [1, "aceptar", "aceptar"]);
  // No superado (sin una deuda formal al día): Revisar.
  const sin = entrada([retail]);
  const h2 = historialDeLaPersona(sin, DEFECTO, moraVigente(sin, DEFECTO));
  assertEquals([h2.superado.superado, h2.efecto, h2.tramo], [false, "revisar", "revisar"]);
  // Menos de USD 50 vencidos no es atraso (2.2).
  assertEquals(eventosHistoricos(entrada([op({ sistema: "comercial", diasDeMora: 120, saldoVencido: 30, fechaDelDato: "2025-07-15" })]), DEFECTO).length, 0);
  // La alternativa «mora de hoy» usa los umbrales de comercial: USD 400 vencidos, más de 300, Negar.
  const hoy = estandarCon({ riesgo: { moraVigente: { retailDelProveedor: "mora_de_hoy" } } });
  assertEquals(moraVigente(e, hoy).sectores.comercial.tramo, "negar");
});

// ---------------------------------------------------------------- decisión 7

Deno.test("decisión 7: el IESS y el BIESS van en el sector SBS, por días", () => {
  const biess = (dias: number) => moraVigente(entrada([op({ sistema: "iess_biess", diasDeMora: dias, saldoVencido: null })]), DEFECTO);
  assertEquals(biess(20).sectores.sbs.tramo, "no_cuenta");
  assert(biess(20).sectores.sbs.atrasoCorto); // 1 a 30 días: atraso corto, con observaciones
  assertEquals(biess(60).sectores.sbs.tramo, "revisar");
  assertEquals(biess(60).mandaElSector, "sbs");
  assertEquals(biess(95).sectores.sbs.tramo, "negar");
  assertEquals(biess(0).sectores.sbs.tramo, "no_cuenta");
  // El atraso corto aporta «con observaciones» al nivel.
  assertEquals(calcularVeredictoDeRiesgo(entrada([op({ sistema: "iess_biess", diasDeMora: 20 })]), DEFECTO).nivel, "con_observaciones");
  // La conservadora corta el mal comportamiento a los 61 días.
  assertEquals(moraVigente(entrada([op({ sistema: "iess_biess", diasDeMora: 70 })]), CONSERVADORA).sectores.sbs.tramo, "negar");
});

// ---------------------------------------------------------------- decisión 8

Deno.test("decisión 8: umbrales en dólares, revisados cada enero", () => {
  const seps = (vencido: number) => moraVigente(entrada([coop(45, vencido)]), DEFECTO).sectores.seps.tramo;
  // SEPS: hasta 30 aceptar, hasta 200 revisar, más de 200 negar. Los bordes.
  assertEquals([seps(30), seps(31), seps(200), seps(201)], ["aceptar", "revisar", "revisar", "negar"]);
  const sbs = (vencido: number) => moraVigente(entrada([op({ sistema: "bancos", diasDeMora: 45, saldoVencido: vencido })], { conBuro: true }), DEFECTO).sectores.sbs.tramo;
  assertEquals([sbs(30), sbs(150), sbs(151)], ["aceptar", "revisar", "negar"]);
  const comercial = estandarCon({ riesgo: { moraVigente: { retailDelProveedor: "mora_de_hoy" } } });
  const com = (vencido: number) => moraVigente(entrada([op({ sistema: "comercial", diasDeMora: 45, saldoVencido: vencido })]), comercial).sectores.comercial.tramo;
  assertEquals([com(100), com(300), com(301)], ["aceptar", "revisar", "negar"]);
  // Son dólares (no fracciones del SBU) y se revisan en enero: pasada la fecha, piden revisión.
  assertEquals(DEFECTO.riesgo.moraVigente.revisionDeLosUmbrales.cadaAnioEn, "enero");
  assertEquals(umbralesPorRevisar(DEFECTO, "2027-01-15"), false);
  assertEquals(umbralesPorRevisar(DEFECTO, "2027-02-01"), true);
  // La conservadora y la expansiva cambian los dólares.
  assertEquals(moraVigente(entrada([coop(45, 20)]), CONSERVADORA).sectores.seps.tramo, "revisar");
  assertEquals(moraVigente(entrada([coop(45, 40)]), plantillaCompleta("expansiva")).sectores.seps.tramo, "aceptar");
});

// ---------------------------------------------------------------- decisión 9

Deno.test("decisión 9: con mora de hoy (tramo Negar) la IA sube como mucho hasta Revisar, nunca a Aprobar", () => {
  assertEquals(techoDeLaIA(DEFECTO, true), "revisar");
  // Con un mal comportamiento histórico y la persona hoy al día, la IA puede llegar a Aprobar.
  assertEquals(techoDeLaIA(DEFECTO, false), "aprobar");
  // La conservadora no sube nada.
  assertEquals(techoDeLaIA(CONSERVADORA, true), null);
  assertEquals(techoDeLaIA(CONSERVADORA, false), null);
  // La alternativa (b), la recomendación previa: hasta Aprobar aun con mora de hoy.
  const previa = estandarCon({ malComportamiento: { conMoraDeHoyLaIAPuedeSubirHasta: "aprobar" } });
  assertEquals(techoDeLaIA(previa, true), "aprobar");
  // En el veredicto: una cooperativa a 200 días con USD 5.000 vencidos es mora de hoy, con un banco al día y estabilidad como atenuantes.
  const v = calcularVeredictoDeRiesgo(entrada([coop(200, 5000), bancoAlDia()]), DEFECTO);
  assertEquals(v.nivel, "mal_comportamiento");
  assert(v.malComportamientoVigente);
  assertEquals(v.ia?.permiso.puede, true);
  assertEquals(v.ia?.techo, "revisar");
});

// ---------------------------------------------------------------- decisión 10

Deno.test("decisión 10: superado es hoy al día y una deuda formal al día de USD 500 o más; con buró, 6 meses sin mora", () => {
  const sup = (e: EntradaDeRiesgo, estandar = DEFECTO) => {
    const mora = moraVigente(e, estandar);
    return estaSuperado(e, estandar, mora, eventosHistoricos(e, estandar));
  };
  assertEquals(sup(entrada([bancoAlDia(500)])).superado, true);
  // Una deuda de USD 499 no alcanza.
  assertEquals(sup(entrada([bancoAlDia(499)])).superado, false);
  assertEquals(sup(entrada([bancoAlDia(499)])).deudaFormalAlDia, false);
  // Hoy en atraso, no.
  assertEquals(sup(entrada([bancoAlDia(5000), coop(45, 100)])).superado, false);
  // Una cooperativa al día cuenta como deuda formal si su saldo llega a USD 500.
  assertEquals(sup(entrada([coop(0, 0)], { saldoTotalCooperativas: 800 })).superado, true);
  assertEquals(sup(entrada([coop(0, 0)], { saldoTotalCooperativas: 300 })).superado, false);
  // Una fuente de crédito que no contestó: no se puede decir.
  assertEquals(sup(entrada([], { fuentesSinRespuesta: ["bancos"] })).superado, null);
  // Con buró, además, 6 meses seguidos sin mora de más de 30 días desde el evento.
  const evento = (mes: string) => ({ mes, sector: "sbs" as const, diasDeMoraMaxima: 45, vencido: 100 });
  const hace3 = entrada([bancoAlDia()], { conBuro: true, historialMensual: [evento("2026-08")] });
  const hace8 = entrada([bancoAlDia()], { conBuro: true, historialMensual: [evento("2026-03")] });
  assertEquals(sup(hace3).superado, false);
  assertEquals(sup(hace8).superado, true);
  assertEquals(sup(hace8).mesesSinMora, 8);
});

// ---------------------------------------------------------------- decisión 11

Deno.test("decisión 11: el decaimiento es de 6, 12 y 24 meses; en la conservadora, 12, 24 y 48", () => {
  const filas = (e: EstandarDeLaInstitucion) => [0, 6, 7, 12, 13, 24, 25, 60].map((m) => filaDelDecaimiento(m, false, e));
  assertEquals(filas(DEFECTO), [0, 0, 1, 1, 2, 2, 3, 3]);
  assertEquals(filas(CONSERVADORA), [0, 0, 0, 0, 1, 1, 2, 3]);
  // La tabla: superado, de 0 a 6 meses Revisar, de 7 a 12 Aceptar, de 13 a 24 antecedente y más de 24 no se menciona.
  const hist = (mes: string, superado: boolean, e = DEFECTO) => {
    const base = entrada(superado ? [bancoAlDia()] : [], { conBuro: true, historialMensual: [{ mes, sector: "seps", diasDeMoraMaxima: 45, vencido: 150 }] });
    return historialDeLaPersona(base, e, moraVigente(base, e));
  };
  // Hace 3 meses (agosto) con el buró: no superado, el tramo de R2 con lo vencido de entonces (USD 150 en SEPS: Revisar).
  assertEquals(hist("2026-08", false).efecto, "tramo_de_r2");
  assertEquals(hist("2026-08", false).tramo, "revisar");
  // Hace 10 meses: no superado, Revisar; hace 20 meses: no superado, Aceptar; hace más de 24: antecedente.
  assertEquals(hist("2026-01", false).efecto, "revisar");
  assertEquals(hist("2025-03", false).efecto, "aceptar");
  assertEquals(hist("2024-03", false).efecto, "antecedente");
  // Superado, hace 10 meses ya sólo es Aceptar; con más de 24 meses no se menciona.
  assertEquals(hist("2026-01", true).efecto, "aceptar");
  assertEquals(hist("2025-03", true).efecto, "antecedente");
  assertEquals(hist("2024-03", true).efecto, "no_se_menciona");
  assertEquals(hist("2024-03", true).seMenciona, false);
  // Con la conservadora, la misma historia de hace 10 meses está todavía en la primera fila.
  assertEquals(hist("2026-01", false, CONSERVADORA).efecto, "tramo_de_r2");
  // Un atraso de más de 90 días empieza una fila más arriba.
  assertEquals(filaDelDecaimiento(10, true, DEFECTO), 0);
  assertEquals(filaDelDecaimiento(16, true, DEFECTO), 1);
});

// ---------------------------------------------------------------- decisión 12

Deno.test("decisión 12: la demanda de cobro, superado, baja un tramo de R1, salvo reincidencia", () => {
  const dem = (anios: Array<{ anio: number; quienDemanda?: "institucion_financiera" | "empresa" | "persona" }>, superado: boolean | null) =>
    demandaDeCobro(entrada([], { demandasDeCobro: anios.map((d) => ({ anio: d.anio, quienDemanda: d.quienDemanda ?? "institucion_financiera" })) }), DEFECTO, superado);
  // R1: hasta 2 años, mal comportamiento; de 2 a 5, deteriorado; más de 5, antecedente.
  assertEquals(dem([{ anio: 2025 }], false).nivel, "mal_comportamiento");
  assertEquals(dem([{ anio: 2023 }], false).nivel, "deteriorado");
  assertEquals(dem([{ anio: 2018 }], false).nivel, null);
  assert(dem([{ anio: 2018 }], false).seMenciona);
  // Superado baja un tramo: mal comportamiento pasa a deteriorado; deteriorado, a un antecedente.
  const reciente = dem([{ anio: 2025 }], true);
  assertEquals([reciente.nivel, reciente.nivelAntesDeSuperado, reciente.bajoPorSuperado], ["deteriorado", "mal_comportamiento", true]);
  const mediana = dem([{ anio: 2023 }], true);
  assertEquals([mediana.nivel, mediana.seMenciona], [null, true]);
  // Salvo reincidencia: tres o más en 5 años no bajan.
  const reincidente = dem([{ anio: 2025 }, { anio: 2024 }, { anio: 2022 }], true);
  assertEquals([reincidente.nivel, reincidente.reincidente, reincidente.bajoPorSuperado], ["mal_comportamiento", true, false]);
  // Sin superar (o sin poder decirlo) no baja.
  assertEquals(dem([{ anio: 2025 }], null).nivel, "mal_comportamiento");
  // Una puesta por una persona natural cuenta como deteriorado aunque sea reciente.
  assertEquals(dem([{ anio: 2026, quienDemanda: "persona" }], false).nivel, "deteriorado");
  // Una fuente de demandas que no contestó no es «no hay demandas».
  const caida = demandaDeCobro(entrada([], { demandasDeCobro: null }), DEFECTO, null);
  assertEquals(caida.sinMedir, ["fuente_de_demandas_sin_respuesta"]);
  // La opción (b), las demandas no decaen por el comportamiento.
  const sinBaja = estandarCon({ riesgo: { historial: { demandaDeCobroSuperadoBajaUnTramo: false } } });
  assertEquals(demandaDeCobro(entrada([], { demandasDeCobro: [{ anio: 2025, quienDemanda: "empresa" }] }), sinBaja, true).nivel, "mal_comportamiento");
});

// ---------------------------------------------------------------- decisión 13

Deno.test("decisión 13: los atenuantes y agravantes van en el orden decidido, con el ejemplo del negocio en los puestos 1 y 8", () => {
  const e = entrada([bancoAlDia(), op({ sistema: "comercial", diasDeMora: 0 })], { estabilidadMeses: 30 });
  const mora = moraVigente(e, DEFECTO);
  const contexto = { mora, historial: historialDeLaPersona(e, DEFECTO, mora) };
  const at = evaluarAtenuantes(e, DEFECTO, contexto);
  assertEquals(at.map((x) => x.id), [
    "deuda_al_dia_en_banco_o_biess", "deuda_al_dia_en_cooperativa", "doce_meses_al_dia_desde_el_ultimo_atraso", "atraso_pasado_chico",
    "estabilidad", "endeudamiento_a_la_baja", "ingreso_al_alza", "al_dia_con_una_casa_comercial",
  ]);
  assertEquals(at.map((x) => x.puesto), [1, 2, 3, 4, 5, 6, 7, 8]);
  // El ejemplo del negocio: una deuda vigente sin atrasos en un banco (puesto 1) pesa más que estar al día en un crédito comercial menor (puesto 8).
  assertEquals(at[0].estado, "se_cumple");
  assertEquals(at[7].estado, "se_cumple");
  const ag = evaluarAgravantes(e, DEFECTO, contexto);
  assertEquals(ag.map((x) => x.id), [
    "reincidencia", "atraso_pasado_de_mas_de_90_dias", "vencido_de_entonces_sobre_la_tolerancia_de_negar", "atraso_en_los_ultimos_6_meses",
    "garante_de_una_operacion_en_atraso", "mora_en_mas_de_un_sector", "pension_alimenticia_en_mora_dentro_de_la_tolerancia", "casa_comercial_en_mora_a_su_corte",
  ]);
  // El orden es un dato del estándar, no un texto: otra institución puede ponerlo distinto.
  const otro = estandarCon({ malComportamiento: { atenuantesEnOrden: ["al_dia_con_una_casa_comercial", "deuda_al_dia_en_banco_o_biess", "deuda_al_dia_en_cooperativa", "doce_meses_al_dia_desde_el_ultimo_atraso", "atraso_pasado_chico", "estabilidad", "endeudamiento_a_la_baja", "ingreso_al_alza"] } });
  assertEquals(evaluarAtenuantes(e, otro, contexto).slice(0, 2).map((x) => x.id), ["al_dia_con_una_casa_comercial", "deuda_al_dia_en_banco_o_biess"]);
  // Un atenuante no medido no es falso: sin buró, el endeudamiento a la baja y los meses al día llegan «no medido».
  assertEquals(at.find((x) => x.id === "endeudamiento_a_la_baja")?.estado, "no_medido");
  assertEquals(at.find((x) => x.id === "doce_meses_al_dia_desde_el_ultimo_atraso")?.estado, "no_medido");
  // Sin banco al día, el primero no se cumple; con la fuente caída, no se mide.
  const sinBanco = entrada([], { fuentesSinRespuesta: ["bancos"] });
  assertEquals(evaluarAtenuantes(sinBanco, DEFECTO, { mora: moraVigente(sinBanco, DEFECTO), historial: historialDeLaPersona(sinBanco, DEFECTO, moraVigente(sinBanco, DEFECTO)) })[0].estado, "no_medido");
  // El ingreso al alza se mide contra la variación del SBU: 6 meses a 1.200 contra 6 a 1.000 (20%) supera el alza del SBU del año.
  const alza = entrada([], { ingresoReportado: { promedioUltimos6: 1200, promedioUltimos12: 1100, ingresoMensual: 1200 } });
  const m2 = moraVigente(alza, DEFECTO);
  assertEquals(evaluarAtenuantes(alza, DEFECTO, { mora: m2, historial: historialDeLaPersona(alza, DEFECTO, m2) }).find((x) => x.id === "ingreso_al_alza")?.estado, "se_cumple");
});

// ---------------------------------------------------------------- decisión 14

Deno.test("decisión 14: para que la IA suba hace falta un atenuante de los tres primeros", () => {
  const estado = (ids: string[]) => {
    const e = entrada([]);
    const mora = moraVigente(e, DEFECTO);
    const base = evaluarAtenuantes(e, DEFECTO, { mora, historial: historialDeLaPersona(e, DEFECTO, mora) });
    return base.map((x) => ({ ...x, estado: ids.includes(x.id) ? ("se_cumple" as const) : ("no_se_cumple" as const) }));
  };
  // Sólo estar al día con una casa comercial (el puesto 8): no alcanza.
  const soloComercial = puedeSubirLaIA(estado(["al_dia_con_una_casa_comercial"]), DEFECTO);
  assertEquals([soloComercial.puede, soloComercial.porque], [false, "ningun_atenuante_de_los_primeros"]);
  assertEquals(soloComercial.atenuantesQueNoAlcanzan, ["al_dia_con_una_casa_comercial"]);
  // Estabilidad (el 5) y casa comercial (el 8) juntas tampoco.
  assertEquals(puedeSubirLaIA(estado(["estabilidad", "al_dia_con_una_casa_comercial"]), DEFECTO).puede, false);
  // Un banco al día (el 1), una cooperativa (el 2) o los 12 meses al día (el 3) sí.
  for (const id of ["deuda_al_dia_en_banco_o_biess", "deuda_al_dia_en_cooperativa", "doce_meses_al_dia_desde_el_ultimo_atraso"]) {
    const p = puedeSubirLaIA(estado([id]), DEFECTO);
    assertEquals([p.puede, p.atenuantesQueSostienen], [true, [id]]);
  }
  // El atraso pasado chico (el 4) ya no es de los primeros tres.
  assertEquals(puedeSubirLaIA(estado(["atraso_pasado_chico"]), DEFECTO).puede, false);
  // Un atenuante no medido no cuenta.
  const noMedido = estado(["deuda_al_dia_en_banco_o_biess"]).map((x) => ({ ...x, estado: "no_medido" as const }));
  assertEquals(puedeSubirLaIA(noMedido, DEFECTO).puede, false);
  // La opción (b), lo decidido antes: cualquiera alcanza, sin mínimo.
  const cualquiera = estandarCon({ malComportamiento: { paraSubirHaceFaltaUnoDeLosPrimeros: 0 } });
  assertEquals(puedeSubirLaIA(estado(["al_dia_con_una_casa_comercial"]), cualquiera).puede, true);
  assertEquals(puedeSubirLaIA(estado([]), cualquiera).puede, false);
  // La conservadora no deja subir aunque haya atenuantes.
  assertEquals(puedeSubirLaIA(estado(["deuda_al_dia_en_banco_o_biess"]), CONSERVADORA).puede, false);
});

// ---------------------------------------------------------------- el veredicto entero

Deno.test("el nivel es el de la peor señal, con su banda de score", () => {
  const nivel = (ops: OperacionDeRiesgo[], extra: Partial<EntradaDeRiesgo> = {}, e = DEFECTO) => calcularVeredictoDeRiesgo(entrada(ops, extra), e);
  // Al día: bajo, banda 750 a 999.
  const bajo = nivel([bancoAlDia()]);
  assertEquals([bajo.nivel, bajo.banda, bajo.motivos.length], ["bajo", [750, 999], 0]);
  assertEquals(bajo.atenuantes, null); // los atenuantes se calculan sólo con mal comportamiento
  // Sin historial de crédito: bajo, pero el score no pasa de 799.
  const sinHistorial = nivel([]);
  assertEquals([sinHistorial.nivel, sinHistorial.scoreMaximo, sinHistorial.sinHistorialDeCredito], ["bajo", 799, true]);
  // Con una fuente caída no es «sin historial».
  assertEquals(nivel([], { fuentesSinRespuesta: ["bancos"] }).sinHistorialDeCredito, false);
  // Con observaciones: A2 en bancos, 600 a 749.
  assertEquals(nivel([op({ sistema: "bancos", calificacion: "A2" })]).banda, [600, 749]);
  // Deteriorado: B2 en bancos, 400 a 599; un garante de la misma operación baja un nivel.
  assertEquals(nivel([op({ sistema: "bancos", calificacion: "B2" })]).nivel, "deteriorado");
  const garante = nivel([op({ sistema: "bancos", calificacion: "B2", rol: "garante" })]);
  assertEquals(garante.nivel, "con_observaciones");
  assertEquals(nivel([op({ sistema: "bancos", calificacion: "E", rol: "garante" })]).nivel, "deteriorado");
  // Mal comportamiento: D, 1 a 399.
  const mal = nivel([op({ sistema: "bancos", calificacion: "D" })]);
  assertEquals([mal.nivel, mal.banda], ["mal_comportamiento", [1, 399]]);
  assert(mal.atenuantes !== null && mal.agravantes !== null);
  // Una operación castigada o la lista de mal pagador: mal comportamiento vigente.
  assertEquals(nivel([bancoAlDia(), op({ sistema: "cooperativas", diasDeMora: 0, saldoCastigado: 400 })]).malComportamientoVigente, true);
  assertEquals(nivel([bancoAlDia()], { listaDeMalPagador: true }).nivel, "mal_comportamiento");
  // El impedimento para cargos públicos y el RUC suspendido no alcanzan para negar: con observaciones.
  assertEquals(nivel([bancoAlDia()], { impedimentoParaCargosPublicos: true }).nivel, "con_observaciones");
  assertEquals(nivel([bancoAlDia()], { rucSuspendidoNoDepurado: true }).nivel, "con_observaciones");
  // La pensión alimenticia: hasta USD 300 es un agravante menor; por encima, Revisar (deteriorado). Ni deteriorado ni mal comportamiento directo hasta ahí.
  assertEquals(nivel([bancoAlDia()], { pensionAlimenticia: { enMora: true, deudaUsd: 300 } }).nivel, "bajo");
  assertEquals(nivel([bancoAlDia()], { pensionAlimenticia: { enMora: true, deudaUsd: 301 } }).nivel, "deteriorado");
  // Lo que no se pudo medir se dice, no se cuenta como cero.
  assert(nivel([bancoAlDia()], { multasDeTransitoEnSalariosBasicos: null }).sinMedir.includes("multas_de_transito"));
  assert(nivel([bancoAlDia()], { listaDeMalPagador: null }).sinMedir.includes("lista_de_mal_pagador"));
});

Deno.test("la pensión alimenticia hasta la tolerancia es un agravante de un mal comportamiento", () => {
  const e = entrada([op({ sistema: "bancos", calificacion: "E" })], { pensionAlimenticia: { enMora: true, deudaUsd: 250 } });
  const v = calcularVeredictoDeRiesgo(e, DEFECTO);
  assertEquals(v.agravantes?.find((x) => x.id === "pension_alimenticia_en_mora_dentro_de_la_tolerancia")?.estado, "se_cumple");
});

Deno.test("las señales: recencia, tendencia, razones y estabilidad, con «no se puede medir» donde falta lo que hace falta", () => {
  const e = entrada([bancoAlDia(4000), coop(0, 0, { cuotaMensual: 100 })], {
    saldoTotalCooperativas: 1000, ingresoReportado: { promedioUltimos6: 1000, promedioUltimos12: 1000, ingresoMensual: 1000 }, demandasDeCobro: [{ anio: 2024, quienDemanda: "empresa" }], estabilidadMeses: 18,
  });
  const v = calcularVeredictoDeRiesgo(e, DEFECTO);
  const por = Object.fromEntries(v.senales.map((x) => [x.codigo, x]));
  assertEquals(por["sen.recencia.atraso"].estado, "no_se_cumple"); // sin atraso conocido
  assertEquals([por["sen.recencia.demanda_de_cobro"].valor, por["sen.recencia.demanda_de_cobro"].estado], [2, "se_cumple"]);
  assertEquals(por["sen.tendencia.endeudamiento"].estado, "no_se_puede_medir"); // sin consulta anterior
  assertEquals([por["sen.razon.atraso_sobre_deuda"].valor, por["sen.razon.atraso_sobre_deuda"].estado], [0, "no_se_cumple"]);
  assertEquals(por["sen.razon.cuota_sobre_ingreso"].valor, 0.1);
  assertEquals(por["sen.estabilidad.meses"].valor, 18);
  // Con una consulta anterior de USD 10.000 y una deuda de hoy de USD 5.000, la deuda bajó a la mitad.
  const t = calcularVeredictoDeRiesgo({ ...e, deudaDeLaConsultaAnterior: 10000 }, DEFECTO).senales.find((x) => x.codigo === "sen.tendencia.endeudamiento");
  assertEquals(t?.valor, -0.5);
  // Hoy en atraso: la recencia es 0 meses; con el retail de hace 16 meses, 16.
  const atraso = calcularVeredictoDeRiesgo(entrada([coop(45, 100)]), DEFECTO).senales.find((x) => x.codigo === "sen.recencia.atraso");
  assertEquals(atraso?.valor, 0);
  const retail = calcularVeredictoDeRiesgo(entrada([bancoAlDia(), op({ sistema: "comercial", diasDeMora: 120, saldoVencido: 400, fechaDelDato: "2025-07-15" })]), DEFECTO).senales.find((x) => x.codigo === "sen.recencia.atraso");
  assertEquals(retail?.valor, 16);
  // La razón de atraso sobre deuda con una fuente caída no se puede medir.
  assertEquals(calcularVeredictoDeRiesgo(entrada([], { fuentesSinRespuesta: ["cooperativas"] }), DEFECTO).senales.find((x) => x.codigo === "sen.razon.atraso_sobre_deuda")?.estado, "no_se_puede_medir");
});

// ---------------------------------------------------------------- el adaptador desde los hechos

Deno.test("el adaptador arma la entrada desde la capa de hechos: sectores, garante, demandas y fuentes caídas", () => {
  const ent = (clave: string, atributos: Record<string, unknown>, fecha: string | null): Entidad => ({
    clave: clave as Entidad["clave"], tipo: "operacion",
    atributos: { sistema: "bancos", acreedor: null, rol: "titular", estado: null, fechaDeConcesion: null, montoOriginal: null, saldoPorVencer: null, saldoVencido: null, saldoNoDevenga: null, saldoEnDemanda: null, saldoCastigado: null, diasDeMora: null, calificacion: null, cuotaMensual: null, ...atributos },
    vistas: [{ registro: { consulta: "c", fuente: "f" }, fechaDelDato: fecha, atributos: {} }], union: null, atribucion: { deLaPersona: "si", metodo: "la_fuente_busca_por_identificacion" },
  });
  const hecho = (codigo: string, valor: unknown, extra: Record<string, unknown> = {}) => ({
    clase: "hecho" as const, codigo, regla: "x@1", fechaDeLaConsulta: CONSULTA, valor: valor as never, unidad: "texto" as const, calidad: valor === null ? ("no_disponible" as const) : ("confirmado_por_tercero" as const),
    fuentes: [], fechaDelDato: null, registros: [], ...(valor === null ? { motivo: "fuente_sin_respuesta" as const } : {}), ...extra,
  });
  const h: HechosDeLaPersona = {
    version: "hechos-v4",
    contexto: { cedula: "0000000000", consulta: "c", fechaDeLaConsulta: CONSULTA, corteIess: "2026-08", persona: { nombre: null, fechaDeNacimiento: null } },
    hechos: [
      hecho("jud.cobro.detalle", [{ anio: 2024, quienDemanda: "empresa" }]),
      hecho("jud.pension.con_mora", true), hecho("jud.pension.deuda", 120), hecho("cum.lista_negra.existe", false), hecho("cum.impedimento.existe", true),
      hecho("coop.saldo.total", 900), hecho("ing.continuidad", { meses: 20 }), hecho("ing.corte.usado", "2026-08"),
      hecho("ban.operaciones.cantidad", null),
    ],
    entidades: [
      ent("op-aaaaaa", { sistema: "bancos", calificacion: "B2", rol: "garante" }, "2026-11-20"),
      ent("op-bbbbbb", { sistema: "iess_biess", diasMora: 5, diasDeMora: 5 }, "2026-11-20"),
      ent("op-cccccc", { sistema: "cooperativas", diasDeMora: 40, saldoVencido: 70 }, "2026-11-20"),
      ent("op-dddddd", { sistema: "comercial", diasDeMora: 100, saldoVencido: 200 }, "2025-07-15"),
      ent("op-eeeeee", { sistema: "institucion", diasDeMora: 60 }, "2026-11-20"),
    ],
    diferencias: [], senales: [],
  };
  const e = entradaDeRiesgoDesdeHechos(h);
  assertEquals(e.operaciones.map((o) => [o.clave, o.sector]), [["op-aaaaaa", "sbs"], ["op-bbbbbb", "sbs"], ["op-cccccc", "seps"], ["op-dddddd", "comercial"]]); // la de la institución no cuenta dos veces
  assertEquals(e.operaciones[0].rol, "garante");
  assertEquals(e.operaciones[3].fechaDelDato, "2025-07-15");
  assertEquals(e.demandasDeCobro, [{ anio: 2024, quienDemanda: "empresa" }]);
  assertEquals(e.pensionAlimenticia, { enMora: true, deudaUsd: 120 });
  assertEquals(e.impedimentoParaCargosPublicos, true);
  assertEquals(e.saldoTotalCooperativas, 900);
  assertEquals(e.estabilidadMeses, 20);
  assertEquals(e.anioDelCorteDelIess, 2026);
  assertEquals(e.fuentesSinRespuesta, ["bancos"]); // la fuente no contestó: no es «sin deuda»
  assertEquals(e.conBuro, false);
  assertEquals(e.historialMensual, null);
});
