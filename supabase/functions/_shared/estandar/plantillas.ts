// Las tres plantillas del estándar (sección 5 de docs/estandar-de-la-institucion.md): la por
// defecto, completa, y las dos variantes de apetito como los CAMBIOS que hacen sobre ella.
// `plantillaCompleta()` (configurar-estandar.ts) las arma y las valida; una plantilla que no
// pasa el validador no se puede pedir.
//
// Qué vale en cada valor:
// - DECIDIDO por el negocio: las fracciones y topes de hoy (carga máxima 40%, 2026-10-17), C1, C2, C3,
//   C4, S1, S3, S5, R2 (los umbrales en dólares de la Base), R5, R6 y las 14 decisiones de R2, R3
//   y R4 del 2026-11-22.
// - PROPUESTA sin medir: lo demás, y todo lo de las dos variantes (ellas se miden con el seco de la
//   sección 7). «Los valores de la Base son los del negocio; las otras dos, propuesta sin medir».
// - Lo que ya vive en código (el producto de consumo, los tramos de la cuota estimada, las
//   fracciones de los peldaños, el aporte personal) se copia acá y la prueba de paridad
//   (estandar.test.ts) exige que sea igual: el estándar no cambia ningún resultado de hoy.

import { aplicarCambios, type Cambios } from "./cambios.ts";
import { FORMA_DEL_ESTANDAR, type EstandarDeLaInstitucion, type NombreDePlantilla } from "./estandar.ts";

export const PLANTILLA_BASE: EstandarDeLaInstitucion = {
  forma: FORMA_DEL_ESTANDAR,
  plantilla: "base",
  conBuroDeLaInstitucion: false,

  controles: {
    fijos: ["fallecido", "fraude_documental", "delito_de_seguridad_ciudadana", "lista_de_control_con_identificacion"],
    configurables: {
      ofac_sin_identificacion: "verificar_identidad",
      posible_homonimo_en_demanda_penal: "verificar_identidad",
      cedula_inconsistente: "verificar_identidad",
      // R5 (2026-11-18): la de retención bloquea; la de certificación (un pedido de información) llega a Revisar como máximo.
      providencia_de_retencion: "bloquea",
      providencia_de_certificacion: "limita_a_revisar",
      pep: "advertencia",
      homonimo_en_lista: "informa",
      lista_de_mal_pagador: "dato_de_comportamiento",
    },
    efectos: {
      bloquea: { salida: "negar", score: 1 },
      verificar_identidad: { salidaMaxima: "condicionado", requisito: "verificacion_de_identidad" },
      advertencia: { salidaMaxima: "aprobar", requisito: "debida_diligencia_reforzada" },
      limita_a_revisar: { salidaMaxima: "revisar" },
      informa: {},
      dato_de_comportamiento: {},
    },
    consultaParcial: { salidaMaxima: "revisar" },
  },

  riesgo: {
    bandasDelScore: {
      bajo: [750, 999],
      con_observaciones: [600, 749],
      deteriorado: [400, 599],
      mal_comportamiento: [1, 399],
    },
    scoreMaximoSinHistorial: 799,
    senales: {
      calificacionEnBancos: {
        con_observaciones: ["A2", "A3"],
        deteriorado: ["B1", "B2", "C1", "C2"],
        mal_comportamiento: ["D", "E"],
      },
      diasDeMoraIessBiess: { con_observaciones: [1, 30], deteriorado: [31, 90], malComportamientoDesde: 91 },
      retailAlCorte: { deterioradoDesdeDias: 31, malComportamientoDesdeDias: 91, valorVencidoMinimoUsd: 50 },
      operacionCastigadaOEnCobroJudicial: "mal_comportamiento",
      listaDeMalPagador: "mal_comportamiento",
      comoGaranteBajaUnNivel: true,
      pensionAlimenticiaEnMora: { toleranciaUsd: 300, porEncima: "revisar" },
      multasDeTransito: { conObservacionesDesdeSalariosBasicos: 1 },
      impedimentoParaCargosPublicos: "con_observaciones",
      rucSuspendidoNoDepurado: "con_observaciones",
    },
    moraVigente: {
      masDeDias: 30,
      atrasoCortoNivel: "con_observaciones",
      // R2 (negocio, 2026-11-18): los umbrales en dólares por sector que reporta.
      sectores: {
        sbs: { aceptarHastaUsd: 30, revisarHastaUsd: 150 },
        seps: { aceptarHastaUsd: 30, revisarHastaUsd: 200 },
        comercial: { aceptarHastaUsd: 100, revisarHastaUsd: 300 },
      },
      masDeNoventaDiasConMontoTolerable: "revisar",
      tramoRevisarConCapacidadQueAlcanza: "condicionado",
      comoGaranteBajaUnTramo: true,
      revisionDeLosUmbrales: { cadaAnioEn: "enero", proximaRevision: "2027-01-31" },
      montoQueSeCompara: "vencido_de_las_operaciones_con_mas_de_dias",
      bancosSinBuro: "por_la_letra",
      variosSectores: "manda_el_peor",
      retailDelProveedor: "historial",
    },
    historial: {
      decaimientoEnMeses: [6, 12, 24],
      superado: { deudaFormalAlDiaDesdeUsd: 500, mesesSinMoraConBuro: 6 },
      demandaDeCobroSuperadoBajaUnTramo: true,
      atrasoLargoDesdeDias: 90,
    },
  },

  malComportamiento: {
    demandaDeCobro: {
      ventanaAnios: 2,
      pesaMenosHastaAnios: 5,
      nivelMientrasPesaMenos: "deteriorado",
      cuentaSiDemanda: ["institucion_financiera", "empresa"],
      // La de una persona natural decae con los años igual que la de una entidad, con las mismas ventanas y un nivel menos (negocio,
      // 2026-11-25: «debería mantener niveles más suaves para una demanda de una persona»). Antes valía lo mismo hasta `pesaMenosHastaAnios`.
      deUnaPersonaNatural: "deteriorado",
      deUnaPersonaNaturalMientrasPesaMenos: "con_observaciones",
      reiteradas: { cantidad: 3, enAnios: 5 },
    },
    atenuantes: {
      hoyAlDia: { calificacionAdmitida: ["A1"], diasDeMoraAdmitidos: 0 },
      endeudamientoALaBaja: { bajaMinima: 0.1, enMeses: 12, sinBuro: "no_medido" },
      estabilidad: { mesesMinimos: 12 },
      ingresoAlAlza: { compara: "ultimos_6_meses_contra_los_6_anteriores", descontandoLaVariacionDelSbu: true },
      deudaVigenteAlDia: { desdeUsd: 500 },
      mesesAlDiaDesdeElUltimoAtraso: { mesesMinimos: 12, sinBuro: "no_medido" },
    },
    // Decisión 13 (2026-11-22): el orden de la propuesta, con el ejemplo del negocio (una deuda vigente sin atrasos en un banco pesa más que
    // estar al día en un crédito comercial menor) en los puestos 1 y 8.
    atenuantesEnOrden: [
      "deuda_al_dia_en_banco_o_biess", "deuda_al_dia_en_cooperativa", "doce_meses_al_dia_desde_el_ultimo_atraso", "atraso_pasado_chico",
      "estabilidad", "endeudamiento_a_la_baja", "ingreso_al_alza", "al_dia_con_una_casa_comercial",
    ],
    agravantesEnOrden: [
      "reincidencia", "atraso_pasado_de_mas_de_90_dias", "vencido_de_entonces_sobre_la_tolerancia_de_negar", "atraso_en_los_ultimos_6_meses",
      "garante_de_una_operacion_en_atraso", "mora_en_mas_de_un_sector", "pension_alimenticia_en_mora_dentro_de_la_tolerancia", "casa_comercial_en_mora_a_su_corte",
    ],
    // Decisión 14: no es un número mínimo sino de qué peso: sin esto, estar al día en una casa comercial sostendría subir.
    paraSubirHaceFaltaUnoDeLosPrimeros: 3,
    // Decisión 9 (cierra el punto 3 del estándar): aprobar a quien hoy no paga es difícil de sostener ante la institución.
    conMoraDeHoyLaIAPuedeSubirHasta: "revisar",
    minimoDeAtenuantes: 0,
    salidasQueLaIAPuedeRecomendar: ["negar", "revisar", "aprobar"],
    bandaDelScoreSiLaIASube: [250, 599],
  },

  ingreso: {
    aceptadoPorPeldano: {
      verificado_por_un_tercero: 1,
      verificado_con_documento: 1,
      cota_por_credito_otorgado: 1,
      minimo_certificado: 0,
      declarado_coherente: 0.7,
      declarado_sin_respaldo: 0,
    },
    declaradoCoherenteHastaVeces: 1.5,
    cargaParaLaCotaPorCuotas: 0.75,
  },

  capacidad: {
    cargaMaxima: 0.4,
    margenJusto: 0.05,
    aportePersonalIess: 0.0945,
    // C2 (por riesgo, abajo) reemplaza a la carga extendida: queda apagada, como la escalera de hoy (que sólo la usa si se la piden),
    // y no se borra para que se vea con qué valores se midió (4.1). Una institución que la quiera la enciende.
    cargaExtendida: { habilitada: false, hasta: 0.5, exigeRiesgo: "bajo", exigeHistorial: "probado", exigeEvidencia: "verificado" },
    cargaMaximaPorRiesgo: { baseDeLaCarga: "neto_disponible", porNivel: { bajo: 0.6, con_observaciones: 0.5, deteriorado: 0.4 } },
    cuotaEstimadaDeDeudaSinCuota: {
      tramosDeSaldo: [
        { hastaSaldoPorOperacion: 2000, factor: 0.065 },
        { hastaSaldoPorOperacion: 5000, factor: 0.065 },
        { hastaSaldoPorOperacion: 10000, factor: 0.062 },
        { hastaSaldoPorOperacion: 20000, factor: 0.047 },
        { hastaSaldoPorOperacion: 50000, factor: 0.029 },
        { hastaSaldoPorOperacion: null, factor: 0.025 },
      ],
      hipotecarioSinPlazo: 0.0107,
      // Negocio, 2026-11-23: la prueba de estrés de la Aprobación Directa usa el tramo más alto de C1 (6,5% del saldo) para lo que no es
      // hipotecario; el hipotecario sigue con su factor propio (`hipotecarioSinPlazo`, 1,07%).
      fraccionParaLaAprobacionDirecta: 0.065,
    },
    creditoDeReferencia: { monto: 5000, plazoMeses: 36 },
    historialProbado: { deudaAlDiaDesdeUsd: 5000, operacionesAlDiaDesde: 2 },
  },

  celdas: {
    "verificado/probado": { salidaMaxima: "aprobacion_directa", montoMaximoSinColateral: 15000 },
    "verificado/corto": { salidaMaxima: "aprobar", montoMaximoEnIngresos: 8, montoMaximoSinColateral: 10000 },
    "verificado/sin_historial": { salidaMaxima: "aprobar", montoMaximoEnIngresos: 6, plazoMaximoMeses: 24, montoMaximoSinColateral: 5000 },
    "inferido/probado": { salidaMaxima: "aprobar", cuotaMaxima: "la_mayor_cuota_pagada_al_dia", montoMaximoSinColateral: 10000 },
    "inferido/corto": { salidaMaxima: "aprobar", montoMaximoEnIngresos: 4, montoMaximoSinColateral: 5000 },
    "inferido/sin_historial": { salidaMaxima: "condicionado", montoMaximoEnIngresos: 3, plazoMaximoMeses: 24 },
    "sin_evidencia/probado": { salidaMaxima: "condicionado" },
    "sin_evidencia/corto": { salidaMaxima: "condicionado" },
    "sin_evidencia/sin_historial": { salidaMaxima: "condicionado", montoMaximo: 3000 },
  },
  // Propuesta: cada institución elige. Cambio de Condiciones equivale a aprobar en la v1 (S3).
  siSeSuperaElMontoSinColateral: "cambio_de_condiciones",

  matriz: {
    bajo: { alcanza: "aprobar", justo: "aprobar", extendida: "aprobar", alcanza_con_cambio: "cambio_de_condiciones", no_alcanza: "negar", sin_medir: "condicionado" },
    con_observaciones: { alcanza: "aprobar", justo: "revisar", extendida: "cambio_de_condiciones", alcanza_con_cambio: "cambio_de_condiciones", no_alcanza: "negar", sin_medir: "condicionado" },
    deteriorado: { alcanza: "condicionado", justo: "revisar", extendida: "revisar", alcanza_con_cambio: "revisar", no_alcanza: "negar", sin_medir: "revisar" },
    mal_comportamiento: { alcanza: "negar", justo: "negar", extendida: "negar", alcanza_con_cambio: "negar", no_alcanza: "negar", sin_medir: "negar" },
  },

  aprobacionDirecta: {
    habilitada: true,
    exigeControles: "limpio",
    exigeConsulta: "completa",
    diasMaximosDeLaConsulta: 30,
    exigeRiesgo: "bajo",
    aniosSinDemandaDeCobro: 5,
    exigeCapacidad: "alcanza",
    exigePeldano: "verificado_por_un_tercero",
    historialesAdmitidos: ["probado"],
    mesesMinimosDeEstabilidad: 12,
    montoMaximo: 5000,
    montoMaximoEnIngresos: 6,
    plazoMaximoMeses: 36,
    scoreMinimo: 750,
  },

  margenDeLaIA: {
    escalonesHaciaArriba: 1,
    escalonesHaciaAbajo: 1,
    puedeOtorgarLaAprobacionDirecta: false,
    puedeQuitarLaAprobacionDirecta: true,
    puedeSubirDesdeCambioDeCondiciones: false,
    exigeMotivoConUnHecho: true,
  },

  requisitos: {
    sustento_de_ingreso: { momento: "antes_de_aprobar", llevaIngresoNecesario: true },
    detalle_de_la_deuda_sin_cuota: { momento: "antes_de_aprobar" },
    certificado_de_estar_al_dia: { momento: "antes_de_aprobar" },
    certificado_del_juicio: { momento: "antes_de_aprobar" },
    certificado_de_pension_alimenticia: { momento: "antes_de_aprobar" },
    certificado_laboral_vigente: { momento: "antes_de_aprobar" },
    ruc_activo_y_declaraciones: { momento: "antes_de_aprobar" },
    aclaracion_entre_fuentes: { momento: "antes_de_aprobar" },
    verificacion_de_identidad: { momento: "antes_de_aprobar" },
    debida_diligencia_reforzada: { momento: "antes_de_aprobar" },
    constitucion_de_colateral: { momento: "antes_de_desembolsar" },
    actualizacion_de_datos: { momento: "antes_de_desembolsar" },
  },

  // El producto de consumo de hoy (`PRODUCTO_CONSUMO`, negocio 2026-10-17 y 19). C4: el garante y el colateral son de cada institución.
  productos: {
    consumo: {
      nombre: "Crédito de consumo",
      montoMinimo: 1000,
      montoMaximo: 120000,
      plazoMinimoMeses: 6,
      plazoMaximoMeses: 120,
      tasaNominalMinimaPorcentaje: 0,
      tasaNominalMaximaPorcentaje: 15.6,
      desgravamenAnualPorcentaje: 0.6,
      pideGarante: false,
      colateral: "lo_pide_segun_la_celda",
    },
  },
};

// La conservadora (sección 5, con la tabla de R2): el corte de mal comportamiento se adelanta, la IA no sube
// nada, la Aprobación Directa se apaga y lo que la Base resuelve con un requisito vuelve a Revisar.
const CAMBIOS_DE_LA_CONSERVADORA: Cambios = {
  plantilla: "conservadora",
  riesgo: {
    senales: {
      diasDeMoraIessBiess: { deteriorado: [31, 60], malComportamientoDesde: 61 },
      pensionAlimenticiaEnMora: { toleranciaUsd: 0, porEncima: "negar" },
    },
    moraVigente: {
      sectores: {
        sbs: { aceptarHastaUsd: 0, revisarHastaUsd: 100 },
        seps: { aceptarHastaUsd: 0, revisarHastaUsd: 150 },
        comercial: { aceptarHastaUsd: 50, revisarHastaUsd: 200 },
      },
      masDeNoventaDiasConMontoTolerable: "negar",
      tramoRevisarConCapacidadQueAlcanza: "revisar",
    },
    // Decisión 11: en la conservadora la tabla de decaimiento dura el doble.
    historial: { decaimientoEnMeses: [12, 24, 48] },
  },
  malComportamiento: {
    // La de una persona natural ya no es mal comportamiento hasta los 7 años (así pesaba más que la de una entidad de 3 a 7): hereda de la
    // Base deteriorado dentro de la ventana y con observaciones hasta los 7 (negocio, 2026-11-25).
    demandaDeCobro: { ventanaAnios: 3, pesaMenosHastaAnios: 7 },
    salidasQueLaIAPuedeRecomendar: ["negar", "revisar"],
  },
  ingreso: {
    aceptadoPorPeldano: { declarado_coherente: 0.5 },
    declaradoCoherenteHastaVeces: 1.25,
  },
  capacidad: {
    cargaMaxima: 0.35,
    cargaExtendida: { habilitada: false, hasta: 0.35 },
    cargaMaximaPorRiesgo: { porNivel: { bajo: 0.5, con_observaciones: 0.45, deteriorado: 0.35 } },
    historialProbado: { deudaAlDiaDesdeUsd: 8000 },
  },
  celdas: {
    "verificado/probado": { salidaMaxima: "aprobar", montoMaximoSinColateral: 10000 },
    "verificado/sin_historial": { montoMaximoEnIngresos: 4, plazoMaximoMeses: 18 },
    "sin_evidencia/sin_historial": { salidaMaxima: "revisar", montoMaximo: null },
  },
  matriz: { deteriorado: { alcanza: "revisar" } },
  aprobacionDirecta: { habilitada: false },
  margenDeLaIA: { escalonesHaciaArriba: 0 },
};

// La optimista: el mismo corte de mal comportamiento (no se relaja lo grave), pero el atraso leve pesa
// menos, la capacidad admite más carga y más ingreso declarado, y la Aprobación Directa se abre.
const CAMBIOS_DE_LA_OPTIMISTA: Cambios = {
  plantilla: "optimista",
  riesgo: {
    senales: {
      // B1 y B2 pasan a con observaciones; C1 y C2 quedan en deteriorado.
      calificacionEnBancos: { con_observaciones: ["A2", "A3", "B1", "B2"], deteriorado: ["C1", "C2"] },
    },
    moraVigente: {
      sectores: {
        sbs: { aceptarHastaUsd: 50, revisarHastaUsd: 250 },
        seps: { aceptarHastaUsd: 50, revisarHastaUsd: 300 },
        comercial: { aceptarHastaUsd: 150, revisarHastaUsd: 500 },
      },
    },
  },
  malComportamiento: {
    // Persona natural: con observaciones dentro de los 2 años y después sólo se menciona (hasta aquí pesaba igual hasta los 3).
    demandaDeCobro: { pesaMenosHastaAnios: 3, deUnaPersonaNatural: "con_observaciones", deUnaPersonaNaturalMientrasPesaMenos: "bajo" },
  },
  ingreso: {
    aceptadoPorPeldano: { declarado_coherente: 0.85 },
    declaradoCoherenteHastaVeces: 2,
  },
  capacidad: {
    cargaMaxima: 0.45,
    cargaExtendida: { hasta: 0.6 },
    cargaMaximaPorRiesgo: { porNivel: { bajo: 0.6, con_observaciones: 0.55, deteriorado: 0.45 } },
    historialProbado: { deudaAlDiaDesdeUsd: 3000 },
  },
  celdas: {
    "verificado/probado": { montoMaximoSinColateral: 20000 },
    "verificado/corto": { salidaMaxima: "aprobacion_directa" },
    "verificado/sin_historial": { montoMaximoEnIngresos: 8, plazoMaximoMeses: 36 },
    "sin_evidencia/sin_historial": { montoMaximo: 5000 },
  },
  matriz: { con_observaciones: { justo: "aprobar" } },
  aprobacionDirecta: { historialesAdmitidos: ["probado", "corto"], montoMaximo: 10000, plazoMaximoMeses: 48 },
};

export const CAMBIOS_DE_LAS_PLANTILLAS: Record<Exclude<NombreDePlantilla, "base">, Cambios> = {
  conservadora: CAMBIOS_DE_LA_CONSERVADORA,
  optimista: CAMBIOS_DE_LA_OPTIMISTA,
};

/** La plantilla completa, sin validar (la valida `plantillaCompleta()`). */
export function plantillaSinValidar(nombre: NombreDePlantilla): EstandarDeLaInstitucion {
  if (nombre === "base") return structuredClone(PLANTILLA_BASE);
  return aplicarCambios(PLANTILLA_BASE, CAMBIOS_DE_LAS_PLANTILLAS[nombre]) as EstandarDeLaInstitucion;
}
