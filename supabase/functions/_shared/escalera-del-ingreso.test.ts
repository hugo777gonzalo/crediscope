// La escalera del ingreso y su capacidad por peldaño (F10). Perfiles inventados: el repositorio es público.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals } from "jsr:@std/assert@1";
import { datosDeCapacidad, evaluarCapacidad, evaluarEscalera, type EntradaDeEscalera } from "./capacidad-de-pago.ts";
import { armarIngresoDelPerfil, ESCALERA_VERSION, type IngresoDelPerfil, type TipoDePersona, tipoDePersona } from "./escalera-del-ingreso.ts";
import { simularCredito } from "./simulador-credito.ts";

type Perfil = Record<string, any>; // deno-lint-ignore-line no-explicit-any

const CONDICIONES = { monto: 3500, plazoMeses: 36, tasaNominalAnualPorcentaje: 15 };

// Un perfil sin deudas, sin mora y sin ingreso, al que cada caso le pone lo suyo.
function perfilLimpio(segmento: string, fuentes: Array<Record<string, unknown>>, laboral: Record<string, unknown> = {}): Perfil {
  return {
    laboral: { tieneRucActivo: false, obligadoALlevarContabilidadRuc: false, ...laboral },
    comportamientoBancario: {
      saldoTotalVigente: 0, saldoEnMoraBuroCredito: 0, saldoNoDevengaIntereses: 0, deudaEnAtraso: 0, operacionesEnAtrasoSinMonto: 0, tieneOperacionCastigada: false,
      tieneOperacionConDemanda: false, totalDeudaRetail: 0, diasMoraMaximaRetail: 0, valorVencidoRetail: 0, tieneCreditoIessBiess: false, diasMoraCreditoIessBiess: 0,
    },
    comportamientoCooperativas: { numeroOperaciones: 0, diasMoraMaxima: 0, saldoEnMora: 0, tieneOperacionConDemanda: false, tieneOperacionCastigada: false, cuotaMensualTotal: 0 },
    riesgoJudicialCivil: {},
    fuentesIngreso: { segmento, corteIessUsado: "2026-08", fuentes },
    metaConsulta: { fuentesNoMedidas: [] },
  };
}
const sueldo = (monto: number) => ({ evidencia: "reportada_por_tercero", naturaleza: "privado", montoMensualReportado: monto, vigenteAlCorte: true });
const aportePropio = (monto: number) => ({ evidencia: "autodeclarada_sobre_minimo", naturaleza: "cuenta_propia", montoMensualReportado: monto, vigenteAlCorte: true });
const conCoop = (p: Perfil, cuota: number) => {
  p.comportamientoCooperativas = { ...p.comportamientoCooperativas, numeroOperaciones: 1, cuotaMensualTotal: cuota };
  return p;
};
// Una estructura de Equifax mínima: cuotas por sistema y sin mora.
const buro = (bancos: number, coop: number, clase = "RIMPE") => ({
  deudaActualTitular: { bancos: { cuotaMensualUsd: bancos, saldoDeudaUsd: bancos * 20 }, cooperativas: { cuotaMensualUsd: coop, saldoDeudaUsd: coop * 20 }, comercial: null },
  moraActual: { saldoVencidoUsd: 0 },
  actividadEconomica: { claseDeContribuyente: clase },
});

function evaluar(perfil: Perfil, estructura: Record<string, unknown> | null = null, declarado: number | null = null, extra: Partial<EntradaDeEscalera> = {}) {
  const datos = datosDeCapacidad(perfil, estructura);
  const ingreso = armarIngresoDelPerfil(perfil, datos, { ingresoDeclarado: declarado, estructuraEquifax: estructura });
  return { datos, ingreso, resultado: evaluarEscalera({ datos, ingreso, condiciones: CONDICIONES, ...extra }) };
}

// Lo que tiene que cumplir cualquier persona (tabla del paso 1 del diseño).
function invariantes(ingreso: IngresoDelPerfil, r: ReturnType<typeof evaluarEscalera>) {
  assertEquals(ingreso.version, ESCALERA_VERSION);
  assertEquals(ingreso.peldanos.map((p) => p.numero), [1, 2, 3, 4, 5, 6]);
  // El 6 nunca sostiene ni entra a la capacidad.
  assert(!r.ingreso.escalera.some((c) => (c.numero as number) === 6));
  assert(r.ingreso.sostieneElCalculo === null || r.ingreso.sostieneElCalculo.numero !== (6 as number));
  // El 5 no sostiene con un 1 o un 2 con monto.
  const hayVerificado = ingreso.peldanos[0].estado === "con_monto" || ingreso.peldanos[1].estado === "con_monto";
  if (hayVerificado) assert(r.ingreso.sostieneElCalculo === null || r.ingreso.sostieneElCalculo.numero !== 5);
  // La cota por cuotas nunca crea espacio: lo que crea espacio del 3 sale sólo del aporte propio (o la renta).
  const p3 = ingreso.peldanos[2];
  assert(!p3.componentes.some((c) => c.clave === "cuotas_al_dia" && c.creaEspacio));
  if (!p3.componentes.some((c) => c.clave === "aporte_propio" || c.clave === "impuesto_a_la_renta")) assertEquals(p3.montoQueCreaEspacio, null);
  // Nunca suma entre peldaños: el ingreso aceptado de cada fila sale de UN peldaño.
  for (const c of r.ingreso.escalera.filter((x) => !x.hipotetico)) {
    const p = ingreso.peldanos[c.numero - 1];
    assert(c.ingresoAceptado === null || c.ingresoAceptado <= (p.ingresoNeto ?? 0) + 0.005);
  }
  // La capacidad máxima es informativa: no cambia el veredicto ni sostiene.
  if (r.ingreso.capacidadMaxima) assertEquals(r.ingreso.capacidadMaxima.informativa, true);
  assertEquals(r.cumple, r.veredicto === "sin_medir" ? null : r.veredicto !== "no_alcanza");
}

Deno.test("paridad con la capacidad de hoy: un dependiente sin declarado da el mismo neto, tope y veredicto", () => {
  const perfil = conCoop(perfilLimpio("dependiente_privado", [sueldo(1000)]), 150);
  const { datos, ingreso, resultado } = evaluar(perfil);
  const hoy = evaluarCapacidad({ ...datos, cuotaNueva: resultado.cuotaNueva });
  const p1 = ingreso.peldanos[0];
  assertEquals(p1.ingresoNeto, hoy.ingresoNeto);
  assertEquals(p1.aportePersonal, hoy.aportePersonal);
  const fila = resultado.ingreso.escalera[0];
  assertEquals(fila.peldano, "verificado_por_un_tercero");
  assertEquals(fila.cuotaMaximaAdmisible, hoy.cuotaMaximaAdmisible);
  assertEquals(fila.cargaConElCredito, hoy.cargaConElCredito);
  assertEquals(resultado.veredicto, hoy.veredicto);
  assertEquals(resultado.cumple, hoy.cumple);
  assertEquals(resultado.ingreso.sostieneElCalculo?.numero, 1);
  assertEquals(resultado.ingreso.explicacion, "Alcanza con el sueldo reportado al IESS (USD 906 netos).");
  invariantes(ingreso, resultado);
});

Deno.test("el declarado ya no reemplaza al sueldo: manda lo verificado y la diferencia se anota (D4)", () => {
  const perfil = perfilLimpio("dependiente_privado", [sueldo(1000)]);
  const { ingreso, resultado } = evaluar(perfil, null, 5000);
  assertEquals(resultado.ingreso.sostieneElCalculo?.numero, 1);
  assert(ingreso.diferencias.some((d) => d.clave === "declarado_supera_lo_verificado"));
  assert(ingreso.diferencias.some((d) => d.clave === "declarado_incoherente"));
  // El 5 se lista pero no sostiene, y hay una mejora con el rol de pagos.
  assertEquals(resultado.ingreso.escalera.find((c) => c.numero === 5)?.veredicto, "no_sostiene");
  assertEquals(resultado.ingreso.mejora?.evidencia, "rol_de_pagos");
  assert(resultado.ingreso.escalera.some((c) => c.hipotetico && c.numero === 2));
  invariantes(ingreso, resultado);
});

Deno.test("el aporte propio ya no se suma al sueldo (D3): el 1 y el 3 se miden por separado", () => {
  const perfil = perfilLimpio("ingresos_mixtos", [sueldo(600), aportePropio(700)]);
  const { datos, ingreso, resultado } = evaluar(perfil);
  const hoy = evaluarCapacidad({ ...datos, cuotaNueva: resultado.cuotaNueva });
  // Hoy se suman: 600 − 56,70 + 700.
  assertEquals(hoy.ingresoNeto, 1243.3);
  assertEquals(ingreso.peldanos[0].ingresoNeto, 543.3);
  assertEquals(ingreso.peldanos[2].montoQueCreaEspacio, 700);
  const filas = resultado.ingreso.escalera.filter((c) => !c.hipotetico);
  assert(filas.every((c) => (c.ingresoAceptado ?? 0) < 1243.3));
  invariantes(ingreso, resultado);
});

Deno.test("la cota por cuotas prueba pero no crea espacio; con aporte propio el 3 lleva el máximo, no la suma", () => {
  const sola = conCoop(perfilLimpio("independiente", []), 180);
  const a = evaluar(sola);
  const p3 = a.ingreso.peldanos[2];
  assertEquals(p3.estado, "con_monto");
  assertEquals(p3.montoMensual, 240);
  assertEquals(p3.montoQueCreaEspacio, null);
  assertEquals(a.resultado.ingreso.escalera.find((c) => c.numero === 3)?.veredicto, "no_sostiene");
  assertEquals(a.resultado.veredicto, "sin_medir");
  invariantes(a.ingreso, a.resultado);

  const con = conCoop(perfilLimpio("independiente", [aportePropio(700)], { tieneRucActivo: true }), 180);
  const b = evaluar(con);
  assertEquals(b.ingreso.peldanos[2].montoMensual, 700);
  assertEquals(b.ingreso.peldanos[2].montoQueCreaEspacio, 700);
  invariantes(b.ingreso, b.resultado);
});

Deno.test("con mora en lo que se ve, la cota por cuotas no se arma; con un hueco tampoco", () => {
  const conMora = conCoop(perfilLimpio("independiente", []), 180);
  conMora.comportamientoCooperativas.diasMoraMaxima = 12;
  const a = evaluar(conMora);
  assertEquals(a.ingreso.peldanos[2].estado, "sin_monto");
  assert((a.ingreso.peldanos[2].motivo ?? "").includes("con_mora"));

  const hueco = conCoop(perfilLimpio("independiente", []), 180);
  hueco.comportamientoBancario.camposSinDato = { deudaEnAtraso: 0 };
  const b = evaluar(hueco);
  assertEquals(b.ingreso.peldanos[2].estado, "sin_monto");
  assert((b.ingreso.peldanos[2].motivo ?? "").includes("sin_medir"));
});

Deno.test("la cuota del BIESS entra a la cota calculada y se rotula", () => {
  const p = perfilLimpio("independiente", []);
  p.comportamientoBancario.tieneCreditoIessBiess = true;
  p.comportamientoBancario.operacionesIessBiess = [{ tipo: "quirografario", saldo: 9000, fechaFin: "2028-11-17" }];
  const d = datosDeCapacidad(p, null, new Date("2026-11-17T12:00:00Z"));
  const ingreso = armarIngresoDelPerfil(p, d);
  const comp = ingreso.peldanos[2].componentes.find((c) => c.clave === "cuotas_al_dia");
  assert(comp);
  assert(comp.avisos.includes("cuota_biess_calculada"));
  assert(comp.montoMensual > 0);
});

Deno.test("sin la fuente de los aportes todo es no_medido, no un «no hay»", () => {
  const p = perfilLimpio("sin_datos", []);
  p.fuentesIngreso.camposSinDato = { fuentes: [], segmento: "independiente" };
  const { ingreso, resultado } = evaluar(p);
  assertEquals(ingreso.peldanos[0].estado, "no_medido");
  assertEquals(ingreso.peldanos[2].estado, "no_medido");
  assertEquals(ingreso.tipoDePersona, "sin_clasificar");
  assertEquals(resultado.veredicto, "sin_medir");
  assert(resultado.ingreso.explicacion.startsWith("Sin ingreso con qué medir."));
  invariantes(ingreso, resultado);
});

// Un caso inventado por tipo de persona, sin y con buró.
const CASOS: Array<{ tipo: TipoDePersona; tipoConBuro?: TipoDePersona; perfil: () => Perfil; declarado?: number }> = [
  { tipo: "dependiente", perfil: () => conCoop(perfilLimpio("dependiente_privado", [sueldo(900)]), 90), declarado: 1000 },
  { tipo: "dependiente_con_ingreso_extra", perfil: () => perfilLimpio("dependiente_privado", [sueldo(900)], { tieneRucActivo: true }), declarado: 1800 },
  { tipo: "independiente_formal", perfil: () => perfilLimpio("independiente", [aportePersonalDeCaso()], { tieneRucActivo: true, obligadoALlevarContabilidadRuc: true }), declarado: 1200 },
  { tipo: "independiente_ruc_activo_no_obligado", tipoConBuro: "independiente_poco_formal", perfil: () => conCoop(perfilLimpio("independiente", [aportePropio(700)], { tieneRucActivo: true }), 180), declarado: 900 },
  { tipo: "pensionista", perfil: () => perfilLimpio("jubilado", []) },
  { tipo: "informal", perfil: () => conCoop(perfilLimpio("informal_o_sin_actividad", []), 60) },
  { tipo: "sin_clasificar", perfil: () => perfilLimpio("no_clasificado", []) },
];
function aportePersonalDeCaso() { return aportePropio(1500); }

for (const caso of CASOS) {
  Deno.test(`un caso por tipo de persona, sin y con buró: ${caso.tipo}`, () => {
    const sin = evaluar(caso.perfil(), null, caso.declarado ?? null);
    assertEquals(sin.ingreso.tipoDePersona, caso.tipo);
    assertEquals(sin.ingreso.conBuro, false);
    invariantes(sin.ingreso, sin.resultado);

    const estructura = buro(300, 80);
    const con = evaluar(caso.perfil(), estructura, caso.declarado ?? null);
    assertEquals(con.ingreso.conBuro, true);
    assertEquals(con.ingreso.tipoDePersona, caso.tipoConBuro ?? caso.tipo);
    invariantes(con.ingreso, con.resultado);
    // Con buró las obligaciones conocidas no bajan.
    assert(con.resultado.obligacionesActuales >= sin.resultado.obligacionesActuales - 0.001 || caso.tipo === "dependiente");
  });
}

Deno.test("el tipo semiformal se separa del poco formal sólo con la clase de contribuyente del buró", () => {
  const p = perfilLimpio("independiente", [], { tieneRucActivo: true });
  assertEquals(tipoDePersona(p, true, buro(0, 0, "REGIMEN GENERAL")), "independiente_semiformal");
  assertEquals(tipoDePersona(p, true, buro(0, 0, "RIMPE")), "independiente_poco_formal");
  assertEquals(tipoDePersona(p, false, null), "independiente_ruc_activo_no_obligado");
});

Deno.test("con buró aparecen las cuotas de bancos: sube lo que prueba la cota y baja la capacidad", () => {
  const perfil = conCoop(perfilLimpio("independiente", [aportePropio(700)], { tieneRucActivo: true }), 180);
  const sin = evaluar(perfil);
  const con = evaluar(perfil, buro(350, 180));
  // Sin buró sólo se ven las cooperativas: 180 / 0,75. Con buró, (350 + 180) / 0,75 = 706,67.
  assertEquals(sin.ingreso.peldanos[2].componentes.find((c) => c.clave === "cuotas_al_dia")?.montoMensual, 240);
  assertEquals(con.ingreso.peldanos[2].componentes.find((c) => c.clave === "cuotas_al_dia")?.montoMensual, 706.67);
  assert(con.ingreso.diferencias.some((d) => d.clave === "cota_supera_lo_verificado"));
  assertEquals(con.resultado.obligacionesActuales, 530);
  // Mismo aporte propio, más obligaciones: el tope baja.
  const topeSin = sin.resultado.ingreso.escalera.find((c) => c.numero === 3)!.cuotaMaximaAdmisible!;
  const topeCon = con.resultado.ingreso.escalera.find((c) => c.numero === 3)!.cuotaMaximaAdmisible!;
  assert(topeCon < topeSin);
  assertEquals(con.resultado.ingreso.ingresoNecesario, Math.ceil(((530 + con.resultado.cuotaNueva) / 0.4) * 100 - 1e-6) / 100);
});

Deno.test("el declarado coherente se toma al 70% y el que pasa de 1,5 veces la evidencia queda sin respaldo", () => {
  const perfil = perfilLimpio("independiente", [aportePropio(700)], { tieneRucActivo: true });
  const ok = evaluar(perfil, null, 1000);
  assertEquals(ok.ingreso.peldanos[4].coherencia, "coherente");
  assertEquals(ok.resultado.ingreso.escalera.find((c) => c.numero === 5)?.ingresoAceptado, 700);
  const sinRespaldo = evaluar(perfil, null, 1100);
  assertEquals(sinRespaldo.ingreso.peldanos[4].coherencia, "sin_respaldo");
  assertEquals(sinRespaldo.resultado.ingreso.escalera.find((c) => c.numero === 5)?.veredicto, "no_sostiene");
  // Un declarado menor que la cota se anota como prudente, no como incoherente.
  const menor = evaluar(conCoop(perfilLimpio("independiente", [aportePropio(700)], { tieneRucActivo: true }), 900), null, 800);
  assert(menor.ingreso.diferencias.some((d) => d.clave === "declarado_menor_que_la_cota"));
});

Deno.test("sin declarado ni evidencia, ningún peldaño sostiene y se dice el ingreso necesario", () => {
  const { resultado } = evaluar(perfilLimpio("informal_o_sin_actividad", []));
  assertEquals(resultado.veredicto, "sin_medir");
  assertEquals(resultado.ingreso.sostieneElCalculo, null);
  assert(resultado.ingreso.ingresoNecesario !== null && resultado.ingreso.ingresoNecesario > 0);
  assertEquals(resultado.ingreso.capacidadMaxima, null);
});

Deno.test("oferta: monto máximo, cuota tope y plazo mínimo; la sensibilidad baja el tope", () => {
  const perfil = perfilLimpio("dependiente_privado", [sueldo(900)]);
  const { resultado } = evaluar(perfil);
  const o = resultado.ingreso.oferta!;
  assertEquals(o.peldano, "verificado_por_un_tercero");
  // 900 − 85,05 = 814,95; 40% = 325,98.
  assertEquals(o.cuotaTope, 325.98);
  assertEquals(o.plazoMinimoMeses, 6 <= 12 ? o.plazoMinimoMeses : null);
  assert(o.plazoMinimoMeses !== null && o.plazoMinimoMeses >= 6 && o.plazoMinimoMeses <= 36);
  // Al plazo mínimo la cuota cabe, y un mes menos no (salvo el piso del producto).
  const cuotaA = (plazo: number) => (simularCredito({ ...CONDICIONES, plazoMeses: plazo }) as { ok: true; simulacion: { cuotaPrimerMes: number } }).simulacion.cuotaPrimerMes;
  assert(Math.round(cuotaA(o.plazoMinimoMeses!) * 100) <= Math.round(o.cuotaTope * 100));
  if (o.plazoMinimoMeses! > 6) assert(Math.round(cuotaA(o.plazoMinimoMeses! - 1) * 100) > Math.round(o.cuotaTope * 100));
  assertEquals(resultado.ingreso.sensibilidad.map((s) => s.menosIngreso), [0.1, 0.2]);
  const [s10, s20] = resultado.ingreso.sensibilidad;
  assert(s10.cuotaMaximaAdmisible < o.cuotaTope && s20.cuotaMaximaAdmisible < s10.cuotaMaximaAdmisible);
  assert((s20.montoMaximoAlPlazo ?? 0) < (s10.montoMaximoAlPlazo ?? 0));
});

Deno.test("la capacidad máxima usa el mayor ingreso entre los peldaños con monto, es informativa y no cambia el veredicto", () => {
  // Sueldo de 700 (neto 633,85) y declarado de 1.000 (sin respaldo: 1.000 pasa de 1,5 × 700 = 1.050? no: coherente).
  const perfil = perfilLimpio("dependiente_privado", [sueldo(700)]);
  const sin = evaluar(perfil);
  const con = evaluar(perfil, null, 1000);
  assertEquals(con.resultado.veredicto, sin.resultado.veredicto);
  assertEquals(con.resultado.ingreso.sostieneElCalculo?.numero, sin.resultado.ingreso.sostieneElCalculo?.numero);
  const cm = con.resultado.ingreso.capacidadMaxima!;
  assertEquals(cm.peldano, "declarado");
  assertEquals(cm.ingreso, 1000);
  assertEquals(cm.informativa, true);
  assert((cm.montoMaximoAlPlazo ?? 0) > (con.resultado.ingreso.oferta!.montoMaximoAlPlazo ?? 0));
  assert((cm.mejoraDelMontoMaximo ?? 0) > 0);
  // Sin declarado, la capacidad máxima es la del sueldo neto.
  assertEquals(sin.resultado.ingreso.capacidadMaxima?.ingreso, 633.85);
});

Deno.test("una cota por cuotas mayor que el aporte propio es el mayor ingreso aunque no cree espacio", () => {
  const { resultado } = evaluar(conCoop(perfilLimpio("independiente", [aportePropio(500)], { tieneRucActivo: true }), 450));
  assertEquals(resultado.ingreso.capacidadMaxima?.componente, "cuotas_al_dia");
  assertEquals(resultado.ingreso.capacidadMaxima?.ingreso, 600);
});

Deno.test("la carga extendida sólo aplica con evidencia verificada y si la institución la habilita", () => {
  const verificado = perfilLimpio("dependiente_privado", [sueldo(700)]);
  conCoop(verificado, 150);
  // Tope 40% de 633,85 = 253,54; cuota nueva ~ 124 + 150 = 274 → no alcanza; con 50% (316,92) entra.
  assertEquals(evaluar(verificado).resultado.veredicto, "no_alcanza");
  const ext = evaluar(verificado, null, null, { cargaExtendida: { habilitada: true, hasta: 0.5 } });
  assertEquals(ext.resultado.veredicto, "extendida");
  assertEquals(ext.resultado.ingreso.sostieneElCalculo?.veredicto, "extendida");
  // Con el aporte propio (peldaño 3) nunca es extendida.
  const propio = conCoop(perfilLimpio("independiente", [aportePropio(700)], { tieneRucActivo: true }), 200);
  assertEquals(evaluar(propio, null, null, { cargaExtendida: { habilitada: true, hasta: 0.5 } }).resultado.veredicto, "no_alcanza");
});

Deno.test("una pensión sin monto dice qué falta; un pensionista con sueldo sostiene con el sueldo", () => {
  const { ingreso, resultado } = evaluar(perfilLimpio("jubilado", []));
  assertEquals(ingreso.peldanos[0].estado, "sin_monto");
  assertEquals(ingreso.peldanos[0].motivo, "pension_sin_monto");
  assertEquals(resultado.ingreso.explicacion, "Cobra una pensión del IESS; la fuente no da el monto. Con el comprobante de pensión se calcula.");
  const conSueldo = evaluar(perfilLimpio("jubilado_con_ingreso_adicional", [sueldo(900)]));
  assertEquals(conSueldo.resultado.ingreso.sostieneElCalculo?.numero, 1);
});

Deno.test("las condiciones inválidas se rechazan, no se miden", () => {
  const perfil = perfilLimpio("dependiente_privado", [sueldo(900)]);
  const datos = datosDeCapacidad(perfil, null);
  const ingreso = armarIngresoDelPerfil(perfil, datos);
  let fallo = false;
  try {
    evaluarEscalera({ datos, ingreso, condiciones: { monto: 3500, plazoMeses: 3 } });
  } catch (e) {
    fallo = e instanceof RangeError;
  }
  assert(fallo);
});
