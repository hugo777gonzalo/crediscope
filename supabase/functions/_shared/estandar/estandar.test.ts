// El estándar de la institución como dato (F14): las tres plantillas, el validador, la configuración de una
// institución nueva sin tocar código y la paridad de la escalera con las constantes de hoy. Perfiles
// inventados: el repositorio es público.
//
// deno test --allow-env --allow-read=supabase/functions,supabase/migrations supabase/functions/

import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { datosDeCapacidad, evaluarEscalera, FRACCIONES_ACEPTADAS, PARAMETROS_CAPACIDAD, TRAMOS_FACTOR_CUOTA, FACTOR_CUOTA_HIPOTECARIO } from "../capacidad-de-pago.ts";
import { armarIngresoDelPerfil, PARAMETROS_DE_LA_ESCALERA } from "../escalera-del-ingreso.ts";
import { PRODUCTO_CONSUMO } from "../simulador-credito.ts";
import { aplicarCambios } from "./cambios.ts";
import { armarFilaDelEstandar, configurarEstandar, huellaDelEstandar, jsonCanonico, plantillaCompleta } from "./configurar-estandar.ts";
import { CLAVES_DE_CELDA, PLANTILLAS } from "./estandar.ts";
import { cargaMaximaSegunElRiesgo, lecturaDeLaEscalera } from "./lectura-de-la-escalera.ts";
import { PLANTILLA_POR_DEFECTO, plantillaSinValidar } from "./plantillas.ts";
import { cargarEstandar, esEstandarValidado, EstandarInvalido, exigirEstandarValido, umbralesPorRevisar, validarEstandar } from "./validar-estandar.ts";

// deno-lint-ignore no-explicit-any
type Perfil = Record<string, any>;

// ---------------------------------------------------------------- las plantillas

Deno.test("las tres plantillas pasan el validador y salen congeladas y registradas", () => {
  for (const nombre of PLANTILLAS) {
    const e = plantillaCompleta(nombre);
    assertEquals(e.plantilla, nombre);
    assert(esEstandarValidado(e), `${nombre}: tiene que quedar registrada como validada`);
    assert(Object.isFrozen(e) && Object.isFrozen(e.capacidad) && Object.isFrozen(e.celdas["verificado/probado"]), `${nombre}: congelada`);
    assertEquals(Object.keys(e.celdas).sort(), [...CLAVES_DE_CELDA].sort());
    // Los diez campos de la sección 1.2 y el catálogo de productos (C4).
    assert(Object.keys(e.productos).length >= 1);
  }
});

Deno.test("la plantilla por defecto trae los valores decididos por el negocio", () => {
  const e = plantillaCompleta("por_defecto");
  // R2 (2026-11-18): los umbrales en dólares por sector.
  assertEquals(e.riesgo.moraVigente.sectores, { sbs: { aceptarHastaUsd: 30, revisarHastaUsd: 150 }, seps: { aceptarHastaUsd: 30, revisarHastaUsd: 200 }, comercial: { aceptarHastaUsd: 100, revisarHastaUsd: 300 } });
  // Decisión 8 (2026-11-22): dólares, revisados cada enero.
  assertEquals(e.riesgo.moraVigente.revisionDeLosUmbrales.cadaAnioEn, "enero");
  assertEquals(e.riesgo.moraVigente.revisionDeLosUmbrales.proximaRevision.slice(5, 7), "01");
  // Decisión 5: más de 90 días con monto chico, tramo mínimo Revisar. Decisión 3: el tramo Revisar con capacidad que alcanza es Aprobado con Requisitos.
  assertEquals(e.riesgo.moraVigente.masDeNoventaDiasConMontoTolerable, "revisar");
  assertEquals(e.riesgo.moraVigente.tramoRevisarConCapacidadQueAlcanza, "condicionado");
  // R6: tolerancia de USD 300 en la pensión alimenticia.
  assertEquals(e.riesgo.senales.pensionAlimenticiaEnMora, { toleranciaUsd: 300, porEncima: "revisar" });
  // R5: la providencia de retención bloquea, la de certificación llega a Revisar como máximo.
  assertEquals(e.controles.configurables.providencia_de_retencion, "bloquea");
  assertEquals(e.controles.efectos[e.controles.configurables.providencia_de_certificacion], { salidaMaxima: "revisar" });
  // C2: la carga va del 40 al 60% según el riesgo, sobre el neto disponible.
  assertEquals(e.capacidad.cargaMaximaPorRiesgo, { baseDeLaCarga: "neto_disponible", porNivel: { bajo: 0.6, con_observaciones: 0.5, deteriorado: 0.4 } });
  assertEquals(cargaMaximaSegunElRiesgo(e, "bajo"), 0.6);
  assertEquals(cargaMaximaSegunElRiesgo(e, "mal_comportamiento"), null);
  // C3: la Aprobación Directa sin buró está permitida (y se activa por institución).
  assertEquals(e.aprobacionDirecta.habilitada, true);
  // S1: la IA no otorga la Aprobación Directa y se mueve un escalón.
  assertEquals(e.margenDeLaIA.puedeOtorgarLaAprobacionDirecta, false);
  assertEquals([e.margenDeLaIA.escalonesHaciaArriba, e.margenDeLaIA.escalonesHaciaAbajo], [1, 1]);
  // C4: el garante y el colateral los pide cada institución, no el estándar.
  assertEquals(e.productos.consumo.pideGarante, false);
});

Deno.test("la conservadora y la expansiva cambian lo que dice la sección 5, y nada más", () => {
  const d = plantillaCompleta("por_defecto");
  const c = plantillaCompleta("conservadora");
  const x = plantillaCompleta("expansiva");
  // Conservadora: más estricta, la IA no sube, la Aprobación Directa apagada.
  assertEquals(c.capacidad.cargaMaxima, 0.35);
  assertEquals(c.capacidad.cargaExtendida.habilitada, false);
  assertEquals(c.malComportamiento.demandaDeCobro.ventanaAnios, 3);
  assertEquals(c.malComportamiento.demandaDeCobro.pesaMenosHastaAnios, 7);
  assertEquals(c.malComportamiento.salidasQueLaIAPuedeRecomendar, ["negar", "revisar"]);
  assertEquals(c.margenDeLaIA.escalonesHaciaArriba, 0);
  assertEquals(c.aprobacionDirecta.habilitada, false);
  assertEquals(c.celdas["verificado/probado"].salidaMaxima, "aprobar");
  assertEquals(c.matriz.deteriorado.alcanza, "revisar");
  assertEquals(c.celdas["sin_evidencia/sin_historial"], { salidaMaxima: "revisar" });
  assertEquals(c.riesgo.moraVigente.sectores.sbs, { aceptarHastaUsd: 0, revisarHastaUsd: 100 });
  assertEquals(c.riesgo.moraVigente.masDeNoventaDiasConMontoTolerable, "negar");
  assertEquals(c.capacidad.historialProbado.deudaAlDiaDesdeUsd, 8000);
  assertEquals(c.ingreso.aceptadoPorPeldano.declarado_coherente, 0.5);
  // Expansiva: más carga, más declarado, la Aprobación Directa más abierta; el mal comportamiento grave no se relaja.
  assertEquals(x.capacidad.cargaMaxima, 0.45);
  assertEquals(x.capacidad.cargaExtendida.hasta, 0.6);
  assertEquals(x.ingreso.aceptadoPorPeldano.declarado_coherente, 0.85);
  assertEquals(x.aprobacionDirecta.montoMaximo, 10000);
  assertEquals(x.aprobacionDirecta.plazoMaximoMeses, 48);
  assertEquals(x.celdas["verificado/corto"].salidaMaxima, "aprobacion_directa");
  assertEquals(x.matriz.con_observaciones.justo, "aprobar");
  assertEquals(x.riesgo.senales.calificacionEnBancos.mal_comportamiento, d.riesgo.senales.calificacionEnBancos.mal_comportamiento);
  assertEquals(x.riesgo.senales.calificacionEnBancos.con_observaciones, ["A2", "A3", "B1", "B2"]);
  // Las bandas del score no cambian entre variantes: el score tiene que querer decir lo mismo en todas las instituciones.
  assertEquals(c.riesgo.bandasDelScore, d.riesgo.bandasDelScore);
  assertEquals(x.riesgo.bandasDelScore, d.riesgo.bandasDelScore);
  // Una variante no inventa claves: tiene la misma forma que la por defecto.
  assertEquals(Object.keys(c).sort(), Object.keys(d).sort());
  assertEquals(Object.keys(x.capacidad).sort(), Object.keys(d.capacidad).sort());
});

// ---------------------------------------------------------------- paridad con lo que el código tiene hoy

Deno.test("la plantilla por defecto copia las constantes de hoy: ningún valor cambia", () => {
  const e = plantillaCompleta("por_defecto");
  const l = lecturaDeLaEscalera(e);
  assertEquals(l.parametros, PARAMETROS_CAPACIDAD);
  assertEquals(l.fracciones, FRACCIONES_ACEPTADAS);
  assertEquals(l.parametrosDeLaEscalera, { cargaParaLaCotaPorCuotas: PARAMETROS_DE_LA_ESCALERA.cargaParaLaCotaPorCuotas, declaradoCoherenteHastaVeces: PARAMETROS_DE_LA_ESCALERA.declaradoCoherenteHastaVeces });
  // La carga extendida: apagada, como la escalera de hoy sin que se la pidan.
  assertEquals(l.cargaExtendida.habilitada, false);
  // El producto de consumo del simulador.
  const p = e.productos.consumo;
  assertEquals(
    { monto: [p.montoMinimo, p.montoMaximo], plazo: [p.plazoMinimoMeses, p.plazoMaximoMeses], tasa: [p.tasaNominalMinimaPorcentaje, p.tasaNominalMaximaPorcentaje], desgravamen: p.desgravamenAnualPorcentaje },
    {
      monto: [PRODUCTO_CONSUMO.limites.montoMinimo, PRODUCTO_CONSUMO.limites.montoMaximo],
      plazo: [PRODUCTO_CONSUMO.limites.plazoMinimoMeses, PRODUCTO_CONSUMO.limites.plazoMaximoMeses],
      tasa: [PRODUCTO_CONSUMO.tasaNominalMinimaPorcentaje, PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje],
      desgravamen: PRODUCTO_CONSUMO.desgravamen.tasaPorcentaje,
    },
  );
  // La cuota estimada de una deuda sin cuota (C1).
  assertEquals(
    e.capacidad.cuotaEstimadaDeDeudaSinCuota.tramosDeSaldo.map((t) => ({ hasta: t.hastaSaldoPorOperacion ?? Infinity, factor: t.factor })),
    TRAMOS_FACTOR_CUOTA.map((t) => ({ hasta: t.hastaSaldoPorOperacion, factor: t.factor })),
  );
  assertEquals(e.capacidad.cuotaEstimadaDeDeudaSinCuota.hipotecarioSinPlazo, FACTOR_CUOTA_HIPOTECARIO);
});

function perfilLimpio(fuentes: Array<Record<string, unknown>>, cuotaCoop: number): Perfil {
  return {
    laboral: { tieneRucActivo: false, obligadoALlevarContabilidadRuc: false },
    comportamientoBancario: {
      saldoTotalVigente: 0, saldoEnMoraBuroCredito: 0, saldoNoDevengaIntereses: 0, deudaEnAtraso: 0, operacionesEnAtrasoSinMonto: 0, tieneOperacionCastigada: false,
      tieneOperacionConDemanda: false, totalDeudaRetail: 0, diasMoraMaximaRetail: 0, valorVencidoRetail: 0, tieneCreditoIessBiess: false, diasMoraCreditoIessBiess: 0,
    },
    comportamientoCooperativas: { numeroOperaciones: cuotaCoop > 0 ? 1 : 0, diasMoraMaxima: 0, saldoEnMora: 0, tieneOperacionConDemanda: false, tieneOperacionCastigada: false, cuotaMensualTotal: cuotaCoop },
    riesgoJudicialCivil: {},
    fuentesIngreso: { segmento: "dependiente_privado", corteIessUsado: "2026-08", fuentes },
    metaConsulta: { fuentesNoMedidas: [] },
  };
}
const sueldo = (monto: number) => ({ evidencia: "reportada_por_tercero", naturaleza: "privado", montoMensualReportado: monto, vigenteAlCorte: true });
const aportePropio = (monto: number) => ({ evidencia: "autodeclarada_sobre_minimo", naturaleza: "cuenta_propia", montoMensualReportado: monto, vigenteAlCorte: true });

// Una grilla de personas y créditos: con y sin el estándar por defecto, la escalera tiene que dar lo mismo, campo por campo.
Deno.test("paridad: evaluarEscalera() con la plantilla por defecto da lo mismo que sin estándar, en toda la grilla", () => {
  const e = plantillaCompleta("por_defecto");
  let casos = 0;
  const veredictos = new Set<string>();
  for (const fuentes of [[sueldo(400)], [sueldo(800)], [sueldo(1200)], [sueldo(2500)], [aportePropio(482)], [sueldo(900), aportePropio(600)], []]) {
    for (const cuota of [0, 100, 250, 500]) {
      for (const declarado of [null, 900, 5000]) {
        for (const condiciones of [{ monto: 1500, plazoMeses: 24 }, { monto: 3500, plazoMeses: 36 }, { monto: 12000, plazoMeses: 60 }]) {
          const perfil = perfilLimpio(fuentes, cuota);
          const datos = datosDeCapacidad(perfil, null);
          const ingreso = armarIngresoDelPerfil(perfil, datos, { ingresoDeclarado: declarado });
          const sin = evaluarEscalera({ datos, ingreso, condiciones });
          const con = evaluarEscalera({ datos, ingreso, condiciones, estandar: e });
          assertEquals(con, sin);
          // También con la carga extendida pedida a mano: el estándar no la pisa.
          const sinExt = evaluarEscalera({ datos, ingreso, condiciones, cargaExtendida: { habilitada: true, hasta: 0.5 } });
          const conExt = evaluarEscalera({ datos, ingreso, condiciones, cargaExtendida: { habilitada: true, hasta: 0.5 }, estandar: e });
          assertEquals(conExt, sinExt);
          veredictos.add(sin.veredicto);
          casos++;
        }
      }
    }
  }
  assertEquals(casos, 252);
  // La grilla no es trivial: pasa por todos los veredictos de la escalera.
  for (const v of ["alcanza", "justo", "no_alcanza", "sin_medir"]) assert(veredictos.has(v), `la grilla no llegó a ${v}: ${[...veredictos].join(",")}`);
});

Deno.test("una plantilla distinta sí cambia la escalera: con 45% de carga máxima alcanza lo que con 40% no", () => {
  const perfil = perfilLimpio([sueldo(1000)], 150);
  const datos = datosDeCapacidad(perfil, null);
  const ingreso = armarIngresoDelPerfil(perfil, datos, {});
  // Neto 905,50. Con la cuota de 150 y una nueva de unos 120, la carga queda cerca de 30%: se sube el crédito hasta pasar el 40%.
  const condiciones = { monto: 5000, plazoMeses: 24 };
  const defecto = evaluarEscalera({ datos, ingreso, condiciones, estandar: plantillaCompleta("por_defecto") });
  const conservadora = evaluarEscalera({ datos, ingreso, condiciones, estandar: plantillaCompleta("conservadora") });
  const expansiva = evaluarEscalera({ datos, ingreso, condiciones, estandar: plantillaCompleta("expansiva") });
  const cargas = [defecto, conservadora, expansiva].map((r) => r.ingreso.escalera.find((c) => c.numero === 1)?.cargaConElCredito);
  assertEquals(cargas[0], cargas[1]);
  assertEquals(cargas[1], cargas[2]);
  const carga = cargas[0] as number;
  assert(carga > 0.4 && carga < 0.45, `la carga de la prueba (${carga}) tiene que estar entre 40% y 45%`);
  assertEquals(defecto.veredicto, "no_alcanza");
  assertEquals(conservadora.veredicto, "no_alcanza");
  assertEquals(expansiva.veredicto, "justo");
});

Deno.test("la escalera se niega a calcular con un estándar que no pasó por el validador", () => {
  const perfil = perfilLimpio([sueldo(1000)], 0);
  const datos = datosDeCapacidad(perfil, null);
  const ingreso = armarIngresoDelPerfil(perfil, datos, {});
  const armadoAMano = structuredClone(PLANTILLA_POR_DEFECTO);
  assertThrows(() => evaluarEscalera({ datos, ingreso, condiciones: { monto: 3000, plazoMeses: 24 }, estandar: armadoAMano }), EstandarInvalido, "no pasó por validarEstandar");
  assertThrows(() => exigirEstandarValido(armadoAMano), EstandarInvalido);
  assertThrows(() => lecturaDeLaEscalera(armadoAMano), EstandarInvalido);
});

// ---------------------------------------------------------------- una institución nueva, sin tocar código

Deno.test("una institución nueva se configura con una plantilla y datos: los cambios se ven y lo demás queda", () => {
  const r = configurarEstandar({
    plantilla: "por_defecto",
    cambios: {
      capacidad: { cargaMaxima: 0.38, cargaMaximaPorRiesgo: { porNivel: { bajo: 0.55, con_observaciones: 0.45, deteriorado: 0.38 } } },
      riesgo: { moraVigente: { sectores: { sbs: { aceptarHastaUsd: 40, revisarHastaUsd: 180 } } } },
      aprobacionDirecta: { habilitada: false },
      celdas: { "verificado/probado": { salidaMaxima: "aprobar" } },
      productos: {
        automotriz: {
          nombre: "Crédito automotriz", montoMinimo: 5000, montoMaximo: 80000, plazoMinimoMeses: 12, plazoMaximoMeses: 72,
          tasaNominalMinimaPorcentaje: 9, tasaNominalMaximaPorcentaje: 15.6, desgravamenAnualPorcentaje: 0.6, pideGarante: false, colateral: "lo_pide_siempre",
        },
      },
    },
  });
  assert(r.ok, r.ok ? "" : r.errores.join("\n"));
  if (!r.ok) return;
  assertEquals(r.estandar.capacidad.cargaMaxima, 0.38);
  assertEquals(r.estandar.riesgo.moraVigente.sectores.sbs, { aceptarHastaUsd: 40, revisarHastaUsd: 180 });
  // Lo que no se tocó es lo de la plantilla.
  assertEquals(r.estandar.riesgo.moraVigente.sectores.seps, PLANTILLA_POR_DEFECTO.riesgo.moraVigente.sectores.seps);
  assertEquals(Object.keys(r.estandar.productos).sort(), ["automotriz", "consumo"]);
  assertEquals(r.estandar.productos.automotriz.colateral, "lo_pide_siempre");
  // Y la escalera lo lee.
  assertEquals(lecturaDeLaEscalera(r.estandar).parametros.cargaMaxima, 0.38);
});

Deno.test("la fecha de revisión de enero: pasada la fecha, los umbrales piden revisión", () => {
  const e = plantillaCompleta("por_defecto");
  assertEquals(umbralesPorRevisar(e, "2026-12-31"), false);
  assertEquals(umbralesPorRevisar(e, e.riesgo.moraVigente.revisionDeLosUmbrales.proximaRevision), false);
  assertEquals(umbralesPorRevisar(e, "2027-02-01"), true);
});

Deno.test("la huella es la misma para el mismo contenido en otro orden, y cambia con cualquier valor", async () => {
  const e = plantillaCompleta("por_defecto");
  const h = await huellaDelEstandar(e);
  assert(/^[0-9a-f]{64}$/.test(h));
  const al_reves = JSON.parse(JSON.stringify(e, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)));
  assertEquals(jsonCanonico(al_reves), jsonCanonico(e));
  assertEquals(await huellaDelEstandar(cargarEstandar(al_reves)), h);
  const r = configurarEstandar({ plantilla: "por_defecto", cambios: { capacidad: { margenJusto: 0.04 } } });
  assert(r.ok);
  if (r.ok) assertNotEquals(await huellaDelEstandar(r.estandar), h);
  assertNotEquals(await huellaDelEstandar(plantillaCompleta("conservadora")), h);
});

Deno.test("la fila de una versión lleva la huella y se niega a armarse con un estándar inválido", async () => {
  const fila = await armarFilaDelEstandar(plantillaSinValidar("expansiva"), { version: "estandar-v1", vigenteDesde: "2026-12-01", pedidoPor: "u-1", aplicadoPor: "u-2" });
  assertEquals(fila.plantilla, "expansiva");
  assertEquals(fila.huella, await huellaDelEstandar(plantillaCompleta("expansiva")));
  await assertRejects(() => armarFilaDelEstandar({ ...plantillaSinValidar("expansiva"), matriz: undefined }, { version: "estandar-v2", vigenteDesde: "2026-12-01", pedidoPor: "a", aplicadoPor: "b" }), Error, "no se puede cargar");
  await assertRejects(() => armarFilaDelEstandar(plantillaSinValidar("expansiva"), { version: "v2", vigenteDesde: "2026-12-01", pedidoPor: "a", aplicadoPor: "b" }), Error, "estandar-vN");
  await assertRejects(() => armarFilaDelEstandar(plantillaSinValidar("expansiva"), { version: "estandar-v2", vigenteDesde: "1/12/2026", pedidoPor: "a", aplicadoPor: "b" }), Error, "aaaa-mm-dd");
});

// ---------------------------------------------------------------- lo que no se puede cargar

// Un cambio a la plantilla por defecto que tiene que ser rechazado, con el fragmento del mensaje que lo explica.
function rechaza(cambios: Record<string, unknown>, fragmento: string) {
  const r = configurarEstandar({ plantilla: "por_defecto", cambios });
  assert(!r.ok, `se cargó un estándar que no se puede cargar: ${JSON.stringify(cambios)}`);
  if (!r.ok) assert(r.errores.some((e) => e.includes(fragmento)), `ningún error dice «${fragmento}»:\n${r.errores.join("\n")}`);
}

Deno.test("una fracción escrita como porcentaje no se carga, y el mensaje dice cuál quiso decir", () => {
  rechaza({ capacidad: { cargaMaxima: 40 } }, "capacidad.cargaMaxima: es una fracción (0,40 quiere decir 40%) y se escribió 40: ¿quiso decir 0,4?");
  rechaza({ ingreso: { aceptadoPorPeldano: { declarado_coherente: 70 } } }, "¿quiso decir 0,7?");
});

Deno.test("un valor fuera de rango no se carga", () => {
  rechaza({ capacidad: { cargaMaxima: 0.95 } }, "capacidad.cargaMaxima: fuera de rango");
  rechaza({ capacidad: { cargaMaxima: 0.1 } }, "capacidad.cargaMaxima: fuera de rango");
  rechaza({ capacidad: { margenJusto: 0.5 } }, "capacidad.margenJusto");
  rechaza({ ingreso: { declaradoCoherenteHastaVeces: 10 } }, "ingreso.declaradoCoherenteHastaVeces: fuera de rango");
  rechaza({ margenDeLaIA: { escalonesHaciaArriba: 3 } }, "margenDeLaIA.escalonesHaciaArriba: fuera de rango");
  rechaza({ aprobacionDirecta: { scoreMinimo: 100 } }, "aprobacionDirecta.scoreMinimo: fuera de rango");
  rechaza({ riesgo: { scoreMaximoSinHistorial: 300 } }, "riesgo.scoreMaximoSinHistorial");
});

Deno.test("los umbrales en dólares: enteros, no negativos y con aceptar por debajo de revisar", () => {
  rechaza({ riesgo: { moraVigente: { sectores: { sbs: { aceptarHastaUsd: 200 } } } } }, "aceptar hasta USD 200 supera a revisar hasta USD 150");
  rechaza({ riesgo: { moraVigente: { sectores: { seps: { aceptarHastaUsd: -5 } } } } }, "sectores.seps.aceptarHastaUsd");
  rechaza({ riesgo: { moraVigente: { sectores: { comercial: { revisarHastaUsd: 300.5 } } } } }, "número entero");
  rechaza({ riesgo: { moraVigente: { sectores: { sbs: { aceptarHastaUsd: "treinta" } } } } }, "se escribió «treinta»");
  rechaza({ riesgo: { moraVigente: { sectores: { bancos: { aceptarHastaUsd: 1, revisarHastaUsd: 2 } } } } }, "no se conoce la clave bancos");
  rechaza({ riesgo: { moraVigente: { sectores: { sbs: { aceptarHastaUsd: 30, revisarHastaUsd: 150, negarDesdeUsd: 151 } } } } }, "no se conoce la clave negarDesdeUsd");
});

Deno.test("la revisión de los umbrales es en enero", () => {
  rechaza({ riesgo: { moraVigente: { revisionDeLosUmbrales: { proximaRevision: "2027-03-15" } } } }, "es en enero");
  rechaza({ riesgo: { moraVigente: { revisionDeLosUmbrales: { proximaRevision: "2027-02-31" } } } }, "no es una fecha que exista");
  rechaza({ riesgo: { moraVigente: { revisionDeLosUmbrales: { proximaRevision: "enero" } } } }, "una fecha aaaa-mm-dd");
  rechaza({ riesgo: { moraVigente: { revisionDeLosUmbrales: { cadaAnioEn: "junio" } } } }, "se revisan cada enero");
});

Deno.test("una plantilla incompleta no se carga y dice qué falta", () => {
  for (const clave of Object.keys(PLANTILLA_POR_DEFECTO).filter((k) => !["forma", "plantilla", "conBuroDeLaInstitucion", "siSeSuperaElMontoSinColateral"].includes(k))) {
    const incompleta: Record<string, unknown> = structuredClone(PLANTILLA_POR_DEFECTO) as unknown as Record<string, unknown>;
    delete incompleta[clave];
    const r = validarEstandar(incompleta);
    assert(!r.ok, `se cargó sin ${clave}`);
    if (!r.ok) assert(r.errores.some((e) => e.includes(`faltan la clave ${clave}`)), `sin ${clave}: ${r.errores.join(" | ")}`);
  }
  // Dentro de una subsección: una celda, una fila de la matriz, un requisito fijo, un tramo de mora.
  rechaza({ celdas: { "verificado/probado": null } }, "faltan la clave verificado/probado");
  rechaza({ matriz: { bajo: null } }, "faltan la clave bajo");
  rechaza({ requisitos: { sustento_de_ingreso: null } }, "faltan los requisitos que usa la matriz por defecto: sustento_de_ingreso");
  rechaza({ riesgo: { moraVigente: { sectores: { comercial: null } } } }, "faltan la clave comercial");
  rechaza({ productos: { consumo: null } }, "el catálogo tiene que tener entre 1 y 20 productos");
  // No es un objeto, ni un JSON.
  assert(!validarEstandar(null).ok);
  assert(!validarEstandar("estandar").ok);
  assert(!validarEstandar([]).ok);
});

Deno.test("una clave que no se conoce no se carga: un error de tipeo no pasa en silencio", () => {
  rechaza({ capacidad: { cargaMaximaa: 0.4 } }, "no se conoce la clave cargaMaximaa");
  rechaza({ ingresos: { aceptadoPorPeldano: {} } }, "no se conoce la clave ingresos");
  rechaza({ riesgo: { moraVigente: { sectores: { sbs: { aceptarHastaUsd: 30 } } } }, plantilla: "intermedia" }, "plantilla: tiene que ser uno de por_defecto, conservadora, expansiva");
  const r = configurarEstandar({ plantilla: "inventada" as never });
  assert(!r.ok);
  if (!r.ok) assert(r.errores[0].includes("no se conoce"));
});

Deno.test("lo fijo en CrediScope no se mueve", () => {
  rechaza({ capacidad: { aportePersonalIess: 0.1 } }, "fijo en CrediScope");
  rechaza({ margenDeLaIA: { puedeOtorgarLaAprobacionDirecta: true } }, "la IA nunca otorga la Aprobación Directa");
  rechaza({ malComportamiento: { minimoDeAtenuantes: 2 } }, "no hay número mínimo de atenuantes");
  rechaza({ malComportamiento: { atenuantes: { endeudamientoALaBaja: { sinBuro: "no_cuenta" } } } }, "no_medido");
  rechaza({ controles: { fijos: ["fallecido"] } }, "bloquean siempre");
  rechaza({ controles: { configurables: { lista_de_mal_pagador: "bloquea" } } }, "es una señal de riesgo");
  rechaza({ controles: { efectos: { bloquea: { score: 300 } } } }, "un bloqueo lleva score 1");
  rechaza({ controles: { efectos: { advertencia: { salidaMaxima: "aprobacion_directa" } } } }, "un control nunca otorga la Aprobación Directa");
  rechaza({ matriz: { mal_comportamiento: { alcanza: "aprobar" } } }, "la fila de mal comportamiento es Negar");
  rechaza({ matriz: { deteriorado: { alcanza: "aprobar" } } }, "una fila de riesgo deteriorado admite");
  rechaza({ matriz: { bajo: { alcanza: "aprobacion_directa" } } }, "matriz.bajo.alcanza");
  rechaza({ malComportamiento: { atenuantes: { hoyAlDia: { calificacionAdmitida: ["A1", "A2"] } } } }, "A1 es la única calificación sin atraso");
  rechaza({ ingreso: { aceptadoPorPeldano: { verificado_por_un_tercero: 0.9 } } }, "se acepta entero");
  rechaza({ ingreso: { aceptadoPorPeldano: { minimo_certificado: 0.5 } } }, "no sostiene la capacidad");
});

Deno.test("la coherencia entre secciones: bandas, letras, carga por riesgo, celdas y matriz", () => {
  rechaza({ riesgo: { bandasDelScore: { con_observaciones: [650, 749] } } }, "no pueden dejar huecos");
  rechaza({ riesgo: { bandasDelScore: { bajo: [900, 999], con_observaciones: [600, 899] } } }, "una banda de menos de 150 puntos");
  rechaza({ riesgo: { senales: { calificacionEnBancos: { deteriorado: ["B1", "B2", "C1"] } } } }, "faltan C2");
  rechaza({ riesgo: { senales: { calificacionEnBancos: { con_observaciones: ["A2", "A3", "D"] } } } }, "una letra no puede estar en dos niveles");
  rechaza({ riesgo: { senales: { calificacionEnBancos: { con_observaciones: ["A1", "A2", "A3"] } } } }, "no se conoce «A1»");
  rechaza({ riesgo: { senales: { diasDeMoraIessBiess: { deteriorado: [40, 90] } } } }, "tiene que empezar donde termina el tramo anterior");
  rechaza({ capacidad: { cargaMaximaPorRiesgo: { porNivel: { bajo: 0.45, con_observaciones: 0.5 } } } }, "más riesgo, menos carga");
  rechaza({ capacidad: { cargaMaximaPorRiesgo: { porNivel: { deteriorado: 0.3 } } } }, "capacidad.cargaMaximaPorRiesgo.porNivel.deteriorado: fuera de rango");
  rechaza({ capacidad: { cargaExtendida: { habilitada: true, hasta: 0.4 } } }, "tiene que superar a la máxima");
  rechaza({ capacidad: { cuotaEstimadaDeDeudaSinCuota: { tramosDeSaldo: [{ hastaSaldoPorOperacion: 5000, factor: 0.06 }, { hastaSaldoPorOperacion: 2000, factor: 0.05 }, { hastaSaldoPorOperacion: null, factor: 0.03 }] } } }, "los tramos van de menor a mayor");
  rechaza({ capacidad: { cuotaEstimadaDeDeudaSinCuota: { tramosDeSaldo: [{ hastaSaldoPorOperacion: 5000, factor: 0.06 }] } } }, "el último tramo no tiene tope");
  rechaza({ capacidad: { creditoDeReferencia: { monto: 500000, plazoMeses: 36 } } }, "no entra en ningún producto del catálogo");
  rechaza({ celdas: { "sin_evidencia/probado": { salidaMaxima: "aprobar" } } }, "sin evidencia del ingreso no se aprueba");
  rechaza({ celdas: { "inferido/probado": { salidaMaxima: "aprobacion_directa" } } }, "sólo una celda con ingreso verificado");
  rechaza({ aprobacionDirecta: { habilitada: false } }, "está apagada para esta institución");
  rechaza({ celdas: { "verificado/probado": { salidaMaxima: "aprobar" } } }, "la celda tiene que poder llegar a ella");
  rechaza({ aprobacionDirecta: { montoMaximo: 500000 } }, "no puede superar el monto máximo del catálogo");
  rechaza({ matriz: { deteriorado: { justo: "condicionado" } } }, "revisar");
  rechaza({ matriz: { con_observaciones: { no_alcanza: "revisar" }, deteriorado: { no_alcanza: "revisar" } }, siSeSuperaElMontoSinColateral: "aprobar" }, "siSeSuperaElMontoSinColateral");
  rechaza({ margenDeLaIA: { escalonesHaciaArriba: 0 } }, "con cero escalones hacia arriba");
  rechaza({ malComportamiento: { demandaDeCobro: { pesaMenosHastaAnios: 2 } } }, "tiene que ser mayor que la ventana");
  rechaza({ malComportamiento: { bandaDelScoreSiLaIASube: [250, 700] } }, "no pasa de la banda de deteriorado");
});

Deno.test("más riesgo no puede dar una salida mejor para la misma capacidad", () => {
  rechaza({ matriz: { deteriorado: { justo: "condicionado", extendida: "condicionado" }, con_observaciones: { justo: "revisar" } } }, "no puede salir condicionado, mejor que lo que sale con menos riesgo");
});

Deno.test("el catálogo de productos: monto, plazo, tasa y lo que pide cada institución (C4)", () => {
  const producto = { nombre: "Microcrédito", montoMinimo: 500, montoMaximo: 20000, plazoMinimoMeses: 3, plazoMaximoMeses: 48, tasaNominalMinimaPorcentaje: 10, tasaNominalMaximaPorcentaje: 20, desgravamenAnualPorcentaje: 0.5, pideGarante: true, colateral: "no_lo_pide" };
  const r = configurarEstandar({ plantilla: "por_defecto", cambios: { productos: { microcredito: producto } } });
  assert(r.ok, r.ok ? "" : r.errores.join("\n"));
  if (r.ok) assertEquals(r.estandar.productos.microcredito.pideGarante, true);
  rechaza({ productos: { micro: { ...producto, montoMaximo: 100 } } }, "el monto máximo (USD 100) no puede ser menor que el mínimo (USD 500)");
  rechaza({ productos: { micro: { ...producto, plazoMaximoMeses: 1 } } }, "el plazo máximo (1 meses) no puede ser menor");
  rechaza({ productos: { micro: { ...producto, tasaNominalMaximaPorcentaje: 5 } } }, "la Tasa máxima");
  rechaza({ productos: { micro: { ...producto, colateral: "tal_vez" } } }, "productos.micro.colateral: tiene que ser uno de");
  rechaza({ productos: { micro: { ...producto, pideGarante: "sí" } } }, "productos.micro.pideGarante: tiene que ser verdadero o falso");
  rechaza({ productos: { micro: { ...producto, descuento: 1 } } }, "no se conoce la clave descuento");
  rechaza({ productos: { "Micro Crédito": producto } }, "un código en minúsculas");
});

Deno.test("los errores vienen todos juntos y cargarEstandar() los lanza", () => {
  const roto = aplicarCambios(PLANTILLA_POR_DEFECTO, { capacidad: { cargaMaxima: 40, margenJusto: -1 }, riesgo: { moraVigente: { sectores: { sbs: { aceptarHastaUsd: 500 } } } } });
  const r = validarEstandar(roto);
  assert(!r.ok);
  if (!r.ok) assert(r.errores.length >= 3, r.errores.join("\n"));
  const e = assertThrows(() => cargarEstandar(roto), EstandarInvalido);
  assert(e.message.includes("3 errores") || e.message.includes("4 errores"));
  assert(e.errores.length >= 3);
});

Deno.test("el estándar que pasa es una copia: cambiar el original no lo toca", () => {
  const original = structuredClone(PLANTILLA_POR_DEFECTO);
  const e = cargarEstandar(original);
  original.capacidad.cargaMaxima = 0.5;
  assertEquals(e.capacidad.cargaMaxima, 0.4);
  assertThrows(() => {
    (e.capacidad as { cargaMaxima: number }).cargaMaxima = 0.9;
  }, TypeError);
});

// ---------------------------------------------------------------- la migración (escrita, no aplicada)

Deno.test("la migración 155 crea la tabla de estándares: una vigente, sin modificar versiones, con RLS y sin acceso anónimo", () => {
  const carpeta = new URL("../../../migrations/", import.meta.url);
  const archivo = [...Deno.readDirSync(carpeta)].map((f) => f.name).find((n) => n.startsWith("155_"));
  assert(archivo, "falta la migración 155");
  const sql = Deno.readTextFileSync(new URL(archivo, carpeta)).toLowerCase();
  assert(sql.includes("create table estandares_de_institucion"));
  for (const columna of ["version", "plantilla", "contenido", "huella", "vigente_desde", "pedido_por", "aplicado_por"]) assert(sql.includes(columna), `falta la columna ${columna}`);
  assert(sql.includes("enable row level security"), "falta la RLS");
  assert(/vigente_desde\s+date not null unique/.test(sql) && sql.includes("function estandar_vigente"), "una sola versión vigente: vigente_desde único y estandar_vigente()");
  assert(sql.includes("before update or delete") || sql.includes("before delete or update"), "las versiones no se modifican ni se borran");
  assert(/revoke all on estandares_de_institucion from anon/.test(sql), "el rol anónimo no tiene permisos");
  assert(!/^\s*(begin|commit)\s*;/m.test(sql.replace(/--.*$/gm, "")),"una migración nueva no abre su propia transacción");
  // Una migración con marcadores sin valor no se aplica: ésta no los necesita.
  assert(!sql.includes("<<"), "no lleva marcadores");
});

// ---------------------------------------------------------------- lo que sumaron las 14 decisiones de R2 a R4 (E10)

Deno.test("las decisiones de R2 a R4 en el estándar: el decaimiento, el orden y la regla de subir se validan", () => {
  const e = plantillaCompleta("por_defecto");
  assertEquals(e.riesgo.historial.decaimientoEnMeses, [6, 12, 24]);
  assertEquals(plantillaCompleta("conservadora").riesgo.historial.decaimientoEnMeses, [12, 24, 48]);
  assertEquals(e.riesgo.historial.superado, { deudaFormalAlDiaDesdeUsd: 500, mesesSinMoraConBuro: 6 });
  assertEquals(e.malComportamiento.paraSubirHaceFaltaUnoDeLosPrimeros, 3);
  assertEquals(e.malComportamiento.conMoraDeHoyLaIAPuedeSubirHasta, "revisar");
  assertEquals(e.malComportamiento.atenuantesEnOrden[0], "deuda_al_dia_en_banco_o_biess");
  assertEquals(e.malComportamiento.atenuantesEnOrden[7], "al_dia_con_una_casa_comercial");
  rechaza({ riesgo: { historial: { decaimientoEnMeses: [12, 6, 24] } } }, "los cortes tienen que crecer");
  rechaza({ riesgo: { historial: { decaimientoEnMeses: [6, 12] } } }, "tres cortes en meses");
  rechaza({ riesgo: { historial: { superado: { deudaFormalAlDiaDesdeUsd: 499.5 } } } }, "número entero");
  rechaza({ malComportamiento: { atenuantesEnOrden: ["estabilidad", "estabilidad"] } }, "está repetido estabilidad");
  rechaza({ malComportamiento: { atenuantesEnOrden: ["estabilidad"] } }, "faltan deuda_al_dia_en_banco_o_biess");
  rechaza({ malComportamiento: { agravantesEnOrden: ["reincidencia", "inventado"] } }, "no se conoce «inventado»");
  rechaza({ malComportamiento: { paraSubirHaceFaltaUnoDeLosPrimeros: 9 } }, "fuera de rango");
  rechaza({ malComportamiento: { conMoraDeHoyLaIAPuedeSubirHasta: "negar" } }, "tiene que ser uno de revisar, aprobar");
  rechaza({ riesgo: { moraVigente: { montoQueSeCompara: "todo" } } }, "montoQueSeCompara");
  rechaza({ riesgo: { moraVigente: { variosSectores: "promedio" } } }, "variosSectores");
});
