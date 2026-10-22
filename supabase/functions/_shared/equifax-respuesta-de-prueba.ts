// Una respuesta de Equifax INVENTADA, con la misma forma que las reales (los
// nombres de listas y de campos son los de reporteCrediticio e
// interconnectResponse) pero con valores falsos. El repositorio es público: las
// pruebas no pueden usar la respuesta de nadie.
//
// No es un archivo de pruebas: lo importan equifax-tablas.test.ts,
// equifax-estructura.test.ts y equifax-persistencia.test.ts. Las pruebas con las
// respuestas reales viven en scripts/probar-equifax-tablas.mjs, que lee
// research/ (fuera de git).
//
// Las cuentas están hechas para que cada prueba pueda afirmar un número exacto:
//
//   bancos      titular: 4.000 (con 300 vencidos a 45 días) + codeudor 500  = 4.500
//               → el resumen dice 4.500: CONCILIA
//   cooperativas sin operaciones, el resumen dice 0: CONCILIA
//   comercial   titular 200 + garante 100 = 300, el resumen dice 999: NO CONCILIA
//   tarjetas    2 vigentes: cupo 3.000, saldo de hoy 1.700 (56,67%), promedio 6 meses 1.400
//   consultas   NovaCredit (2 meses) + 2 entidades en 3 meses

export const CEDULA_DE_PRUEBA = "0102030405";

// Valores personales que NUNCA pueden aparecer en las tablas ni en la estructura.
export const PERSONALES_DE_PRUEBA = [
  "PERSONA DE PRUEBA UNO",
  "0102030405001",
  "CALLE INVENTADA 123",
  "NEGOCIO INVENTADO",
  "AVENIDA FALSA 742",
  "-78.123456",
  "022345678",
  "0987654321",
  "TERCERA PERSONA DE PRUEBA",
  "0912345678",
  "9876543210123",
  "0000123456789",
  "4111111111111111",
  "0991234567",
  "PROVINCIA INVENTADA",
  "CANTON INVENTADO",
  "TRANSACCION-INVENTADA-1",
];

type Registro = Record<string, unknown>;

const bandas = { fecha_inicial: "2023-09-30", fecha_final: "2026-08-31" };

function operacion(c: Registro): Registro {
  return {
    institucion: "BANCO DE PRUEBA UNO", fecha_corte: "31/08/2026", tipo_riesgo: "TITULAR", tipo_credito: "Consumo",
    cupo_monto_original: 5000, fecha_apertura: "15/01/2024", fecha_vencimiento: "15/01/2027",
    total_vencer: 0, ndi: 0, total_vencido: 0, dem_jud: 0, cart_cast: 0, saldo_deuda: 0, cuota_mensual: 0, dias_morosidad: 0,
    ...c,
  };
}

function historica(c: Registro): Registro {
  const { cuota_mensual: _cuota, ...resto } = operacion(c);
  return { ...resto, fecha_corte: c.fecha_corte ?? "2026-08-31 00:00:00.000", fecha_apertura: "2024-01-15 00:00:00.000", fecha_vencimiento: "2027-01-15 00:00:00.000" };
}

export function respuestaDePrueba(cambios: { reporteCrediticio?: Registro; interconnectResponse?: Registro } = {}): Registro {
  const reporteCrediticio: Registro = {
    identificacion_consultada: [{ nombre: "PERSONA DE PRUEBA UNO", tipo_documento: "C", numero_documento: CEDULA_DE_PRUEBA }],
    informacion_sri: [{
      nombre: "PERSONA DE PRUEBA UNO", actividad: "VENTA AL POR MENOR", ruc: "0102030405001", direccion: "CALLE INVENTADA 123 Y NINGUNA",
      estado_contribuyente: "ACTIVO", clase_contribuyente: "RIMPE", codigo_ciiu: "G4711", fecha_inicio_actividades: "2015-03-02 00:00:00.000",
      fecha_suspension_definitiva: null, numero_establecimiento: 1, obligado: "N", nombre_fantasia_comercial: "NEGOCIO INVENTADO",
    }],
    informacion_demografica: [{
      fecha_nacimiento: "5 Mar 1985", educacion: "Sin Información.", provincia: "PROVINCIA INVENTADA", canton: "CANTON INVENTADO",
      direcciones: "AVENIDA FALSA 742 Y SUR", coordenada_x: "-78.123456", coordenada_y: "-0.123456",
      numero_telefonico_convencional: "022345678", numero_telefonico_celular: "0987654321",
    }],
    resumen_informe: [
      { tipo: "OpeImpagos", num_total_ope_impagos: 1, monto_total_ope_impagos: 300 },
      { tipo: "DemandaJudicial", num_total_ope_impagos: 0, monto_total_ope_impagos: 0 },
      { tipo: "CarteraCastigada", num_total_ope_impagos: 0, monto_total_ope_impagos: 0 },
    ],
    score: [{ score: 640, total_acum: 55, tasa_de_malos_acum: 12.5, score_min: 500, score_max: 700, ...bandas }],
    score_inclusion: [{ score: 800, total_acum: 60, tasa_de_malos_acum: 3, score_min: 700, score_max: 900, ...bandas }],
    score_sobreendeudamiento: [{ rango_score: "334.0 a 447.0", score: 400, segmentacion: "ALTO", porcentaje: 40, probabilidad_sobre_endeudamiento: 9.5, ...bandas }],
    indicador_impacto_economico: [{ indicador: "3", ingreso: 1000, cuota_financiera: 250 }],
    historico_score: [
      { retroactivo: "Actual", score: 640, g_min: 700, g_max: 999, y_min: 500, y_max: 699, r_min: 1, r_max: 499 },
      { retroactivo: "-6 Meses", score: 600, g_min: 700, g_max: 999, y_min: 500, y_max: 699, r_min: 1, r_max: 499 },
      { retroactivo: "-12 Meses", score: 580, g_min: 700, g_max: 999, y_min: 500, y_max: 699, r_min: 1, r_max: 499 },
    ],
    historico_acreedores: [{ retroactivo: "Actual", acreedores: 5 }, { retroactivo: "-6 Meses", acreedores: 4 }, { retroactivo: "-12 Meses", acreedores: 3 }],
    historico_cuota_estimada: [
      { orden: 1, retroactivo: "-12 Meses", cuota_mensual: 180 }, { orden: 2, retroactivo: "-6 Meses", cuota_mensual: 190 },
      { orden: 3, retroactivo: "Actual", cuota_mensual: 200 }, { orden: 4, retroactivo: "+6 Meses", cuota_mensual: 210 },
      { orden: 5, retroactivo: "+12 Meses", cuota_mensual: 220 },
    ],
    historico_endeudamiento_comercial: [{ retroactivo: "Actual", saldo_total: 1000 }, { retroactivo: "-6 Meses", saldo_total: 900 }, { retroactivo: "-12 Meses", saldo_total: 500 }],
    historico_endeudamiento_financiero: [{ retroactivo: "Actual", saldo_total: 4500 }, { retroactivo: "-6 Meses", saldo_total: 4100 }, { retroactivo: "-12 Meses", saldo_total: 3500 }],
    historico_vencidos_comercial: [{ retroactivo: "Actual", saldo_vencido: 0 }, { retroactivo: "-6 Meses", saldo_vencido: 0 }, { retroactivo: "-12 Meses", saldo_vencido: 0 }],
    historico_vencidos_financiero: [{ retroactivo: "Actual", saldo_vencido: 300 }, { retroactivo: "-6 Meses", saldo_vencido: 100 }, { retroactivo: "-12 Meses", saldo_vencido: 0 }],
    valor_deuda_3_sistemas: [
      { institucion: "Sistema Financiero Regulado SB", por_vencer: 4200, no_devenga_int: 0, vencido: 300, total: 4500, demanda_judicial: 0, cartera_castigada: 0 },
      { institucion: "Entidades Reguladas SEPS", por_vencer: 0, no_devenga_int: 0, vencido: 0, total: 0, demanda_judicial: 0, cartera_castigada: 0 },
      { institucion: "Sector Comercial SICOM", por_vencer: 999, no_devenga_int: 0, vencido: 0, total: 999, demanda_judicial: 0, cartera_castigada: 0 },
    ],
    protestos_morosidades: [{ morosidades: 1, protestos: null, monto_total_morosidades: 300, total_numero_operaciones: 4 }],
    evolucion_deuda_sb_seps_sicom: [
      { fecha_corte: "2026-08-31 00:00:00.000", total: 4500, vencidos: 300, opcion: "SB" },
      { fecha_corte: "2026-07-31 00:00:00.000000", total: 4400, vencidos: 200, opcion: "SB" },
      { fecha_corte: "2026-08-31 00:00:00.000", total: 999, vencidos: 0, opcion: "SICOM" },
    ],
    detalle_deuda_actual_sb: [
      operacion({ total_vencer: 3700, total_vencido: 300, saldo_deuda: 4000, cuota_mensual: 200, dias_morosidad: 45 }),
      // Equifax manda el rol como TITULAR y como Titular
      operacion({ institucion: "BANCO DE PRUEBA DOS", tipo_riesgo: "Titular", tipo_credito: "Microcredito", cupo_monto_original: 800 }),
      operacion({ institucion: "BANCO DE PRUEBA TRES", tipo_riesgo: "CODEUDOR", tipo_credito: "Comercial", cupo_monto_original: 9000, total_vencer: 500, saldo_deuda: 500, cuota_mensual: 50 }),
    ],
    detalle_deuda_actual_seps: [],
    detalle_deuda_actual_sicom: [
      operacion({ institucion: "COMERCIO DE PRUEBA", fecha_corte: "06/10/2026", cupo_monto_original: 300, total_vencer: 200, saldo_deuda: 200, cuota_mensual: 20 }),
      operacion({ institucion: "COMERCIO DE PRUEBA DOS", fecha_corte: "30/09/2026", tipo_riesgo: "GARANTE", cupo_monto_original: 150, fecha_vencimiento: null, total_vencer: 100, saldo_deuda: 100 }),
    ],
    detalle_tarjetas: [
      { institucion: "BANCO DE PRUEBA UNO", emisor: "VISA", antiguedad: 60, cupo: 2000, saldo_actual: 500, saldo_promedio_ultimos_6_meses: 800, porcentaje_uso_tarjeta: 40 },
      { institucion: "BANCO DE PRUEBA DOS", emisor: "MASTERCARD", antiguedad: 24, cupo: 1000, saldo_actual: 1200, saldo_promedio_ultimos_6_meses: 600, porcentaje_uso_tarjeta: 60 },
    ],
    tarjetas_canceladas: [{ fecha_corte: "2023-10-31 00:00:00.000", institucion: "BANCO DE PRUEBA UNO", numero_tarjeta: "4111111111111111", fecha_cancelacion: "2024-08-30 00:00:00.000" }],
    distribucion_endeudamiento: [],
    deuda_historica: [
      {
        fecha_corte: "2026-08-31 00:00:00.000", por_vencer: 4200, no_devenga_int: 0, vencido_0_a_1: 0, vencido_1_a_2: 300, vencido_2_a_3: 0, vencido_3_a_6: 0,
        vencido_6_a_9: 0, vencido_9_a_12: 0, vencido_12_a_24: 0, vencido_24: 0, vencido_36: 0, demanda_judicial: 0, cartera_castigada: 0, saldo_deuda: 4500, opcion: "SB",
      },
    ],
    estructura_vencimiento: [
      { fecha_corte: "2026-08-31 00:00:00.000", institucion: "BANCO DE PRUEBA UNO", por_vencer: 3700, vencido: 300, no_devenga_int: 0, saldo_deuda: 4000, demanda_judicial: 0, cartera_castigada: 0, acuerdo_concordatorio: null, opcion: "SB" },
    ],
    creditos_otorgados: [
      { institucion: "BANCO DE PRUEBA UNO", estado_operacion: "ORIGINAL", tipo_credito: "Consumo", valor_operacion: 5000, titular: 5000, codeudor: 0, garante: 0, fecha_concesion: "2024-01-15 00:00:00.000", fecha_vencimiento: "2027-01-15 00:00:00.000" },
      { institucion: "BANCO DE PRUEBA DOS", estado_operacion: "NOVADA", tipo_credito: "Vivienda", valor_operacion: 80000, titular: 80000, codeudor: 0, garante: 0, fecha_concesion: "2022-06-01 00:00:00.000", fecha_vencimiento: "2037-06-01 00:00:00.000" },
      { institucion: "BANCO DE PRUEBA TRES", estado_operacion: "REFINANCIADA", tipo_credito: "Comercial", valor_operacion: 3000, titular: 0, codeudor: 3000, garante: 0, fecha_concesion: "2025-02-10 00:00:00.000", fecha_vencimiento: "2028-02-10 00:00:00.000" },
    ],
    saldos_por_vencer: [
      { fecha_corte: "2026-08-31 00:00:00.000", institucion: "BANCO DE PRUEBA UNO", total_por_vencer: 3700, por_vencer_0_a_1: 100, por_vencer_1_a_3: 300, por_vencer_3_a_6: 600, por_vencer_6_a_12: 1200, por_vencer_12: 1500 },
    ],
    detalle_estructura_vencimiento: [
      { fecha_corte: "2026-08-31 00:00:00", vencido_0_a_1: 0, vencido_1_a_2: 300, vencido_2_a_3: 0, vencido_3_a_6: 0, vencido_6_a_9: 0, vencido_9_a_12: 0, vencido_12_a_24: 0, vencido_24: 0, vencido_36: 0, vencido: 300, no_devenga_int: 0, demanda_judicial: 0, cartera_castigada: 0 },
    ],
    cuota_estimada_mensual: [{ pago: 270, numero_creditos_comercial: 2, total_vencido: 300, total_demanda: 0, total_cartera: 0, numero_creditos_iece: 0, numero_operaciones_excluidas: 0 }],
    personas_inhabilitadas: [],
    sujeto_al_dia: [{ institucion: "TELEFONIA DE PRUEBA - CELULAR: 0991234567", fecha_corte: "2026-08-31 00:00:00.000", mensaje: "CLIENTE AL DIA EN SUS PAGOS" }],
    mantiene_historial_crediticio: [{ titulo: "Mantiene historial Crediticio desde: ", primera_fecha: "2012-05-01 00:00:00.000" }],
    identificador_perfil_riesgo_directo: [
      { indicador: "Mayor plazo vencido", valor: "De 1 a 2 meses", fecha: "2026-08-31 00:00:00.000" },
      { indicador: "Mayor valor vencido", valor: "300.5", fecha: "2026-08-31 00:00:00.000" },
      { indicador: "Endeudamiento promedio", valor: "5200.75", fecha: "" },
    ],
    identificador_perfil_riesgo_directo_6_meses: [
      { indicador: "Mayor plazo vencido", valor: "", fecha: "" },
      { indicador: "Mayor valor vencido", valor: "", fecha: "" },
      { indicador: "Endeudamiento promedio", valor: "4900", fecha: "2026-07-31 00:00:00.000" },
    ],
    garantias_personales_codeudores_operaciones_vigentes: [
      { tipo_deudor: "CODEUDOR", nombre_titular: "TERCERA PERSONA DE PRUEBA", identificacion_titular: "0912345678", numero_operacion: "9876543210123", institucion: "BANCO DE PRUEBA TRES", deuda_total: 500 },
    ],
    garantias_personales_codeudores_operaciones_no_vigentes: [],
    vinculaciones_instituciones_financieras: [],
    operaciones_canceladas: [
      { fecha_corte: "2026-04-30 00:00:00.000", institucion: "BANCO DE PRUEBA UNO", numero_operacion: "0000123456789", fecha_cancelacion: "2026-03-20 00:00:00.000" },
    ],
    mensaje_califica_detalle_tarjetas: [{ mensaje: "El cliente tiene 2 tarjeta(s) activa(s), y su cupo máximo en TCs es de $ 2,000.00" }],
    factores_influyen_score: [{
      numero_operaciones_historicas: 40, numero_operaciones_vigentes: 4, numero_operaciones_vencidas: 1, saldo_por_vencer: 4400, saldo_vencido: 300,
      saldo_demanada_judicial: 0, saldo_cartera_castigada: 0, maximo_saldos_vencidos: 300, tiempo_trancurrido_primer_credito: "172 meses",
      vencidos_actuales: 1, maximo_dias_vencido: 45, saldo_deuda_nuevos_creditos: 1000,
    }],
    entidades_consultados: [
      { nombre_cliente: "Entidad que Consultó", mes1: "Oct 2026", mes2: "Sep 2026", mes3: "Ago 2026", mes4: "Jul 2026", mes5: "Jun 2026", mes6: "May 2026", mes7: "Abr 2026", mes8: "Mar 2026", mes9: "Feb 2026", mes10: "Ene 2026", mes11: "Dic 2025", mes12: "Nov 2025" },
      { nombre_cliente: "NOVACREDIT S. A.", mes1: "X", mes2: "X", mes3: null, mes4: null, mes5: null, mes6: null, mes7: null, mes8: null, mes9: null, mes10: null, mes11: null, mes12: null },
      { nombre_cliente: "BANCO DE PRUEBA UNO S.A.", mes1: null, mes2: "X", mes3: null, mes4: null, mes5: null, mes6: null, mes7: null, mes8: null, mes9: null, mes10: null, mes11: null, mes12: null },
      { nombre_cliente: "FINANCIERA DE PRUEBA", mes1: null, mes2: null, mes3: null, mes4: null, mes5: "X", mes6: null, mes7: null, mes8: null, mes9: null, mes10: null, mes11: null, mes12: "X" },
    ],
    detalle_deuda_historica_sb: [
      historica({ fecha_corte: "2026-06-30 00:00:00.000", total_vencer: 3900, saldo_deuda: 3900 }),
      historica({ fecha_corte: "2026-07-31 00:00:00.000", total_vencer: 3850, total_vencido: 100, saldo_deuda: 3950, dias_morosidad: 20 }),
      historica({ fecha_corte: "2026-08-31 00:00:00.000", total_vencer: 3700, total_vencido: 300, saldo_deuda: 4000, dias_morosidad: 45 }),
      historica({ fecha_corte: "2026-08-31 00:00:00.000", institucion: "BANCO DE PRUEBA TRES", tipo_riesgo: "CODEUDOR", tipo_credito: "Comercial", cupo_monto_original: 9000, total_vencer: 500, saldo_deuda: 500, dias_morosidad: 200 }),
    ],
    detalle_deuda_historica_seps: [],
    detalle_deuda_historica_sicom: [
      historica({ fecha_corte: "2026-08-31 00:00:00.000", institucion: "COMERCIO DE PRUEBA", cupo_monto_original: 300, total_vencer: 200, saldo_deuda: 200 }),
    ],
    ...cambios.reporteCrediticio,
  };

  const interconnectResponse: Registro = {
    personalInformation: { monto: 5000, numeroDocumento: CEDULA_DE_PRUEBA, plazo: 12, restaGastoFinanciero: 0, tipoDocumento: "C", tipoProducto: "1" },
    ResultadoSegmentacion: { DecisionFinal: "ANALISTA", SegmentacionTitular: "ANALISTA", IncomePredictor: 1500.5, ScoreV4: "640", ModeloUtilizado: "BANCARIZADO DIRTY" },
    ESTADO_CARTERA: { Codigo: 17, Descripcion: "ESTA EN MORA 30", Interpretacion: "Tarjeta u operación en mora con un vencido de hasta 30 días." },
    // Los campos que usa el predictor de ingresos (valores inventados; las fechas vienen dd/mm/yyyy y la de CMA es posterior a una consulta del 2026-08-31).
    AnalisisCreditoSectorFinanciero: {
      MCAMontoOriginal: 12000, MCAFecConcesion: "15/03/2024", CMRMontoOriginal: 5000.456, CMRFecConcesion: "10/02/2026", CMAMontoOriginal: 8000, CMAFecConcesion: "05/09/2026",
      PCTotalAdeudado: 6500.5, PCNumIfisActuales: 3, RECACreditosAprobados: 7, RECAValCreditosAprobados: 43000, RECAValSaldosVigentes: 6400.25,
      TDeudaActual: 6500.5, TDeudaHace3Meses: 7100, CMAAEntidad: "BANCO DE PRUEBA UNO", CMAADeudaTotal: 999999, MMRMontoMora: 55,
    },
    // Lo que NO debe sumarse con reporteCrediticio: la misma deuda en otra forma.
    DetalleDeudaActualReportadaSBSSBS_Educativo: [{ Sistema: "SFR", Institucion: "BANCO DE PRUEBA UNO", Saldo_Deuda: 777777, Tipo_Riesgo: "TITULAR" }],
    ...cambios.interconnectResponse,
  };

  return { transactionId: "TRANSACCION-INVENTADA-1", status: "OK", interconnectResponse, reporteCrediticio, originalTransactionId: "TRANSACCION-INVENTADA-1" };
}
