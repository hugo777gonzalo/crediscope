// El estándar de la institución como dato (F14; docs/estandar-de-la-institucion.md, secciones 1 y 5).
//
// Sólo formas y listas cerradas: ninguna regla de cálculo vive acá. El estándar son parámetros,
// listas cerradas y tablas, nunca texto libre que lea el modelo (1.1): lo que el modelo lee es el
// resultado, no el estándar entero. Una institución nueva se configura con una plantilla y sus
// cambios (`configurar-estandar.ts`), sin tocar código; `validar-estandar.ts` se niega a cargar un
// valor fuera de rango o una plantilla incompleta.
//
// NO ESTÁ CONECTADO. Ni el análisis, ni el perfil del modelo, ni la pantalla lo leen: lo lee la
// escalera del ingreso (`lectura-de-la-escalera.ts`) y E10. Se conecta con la versión mayor del marco.
//
// Las fracciones van como fracción (0,40 es 40%) y los montos en dólares. Las claves van sin tildes
// (son nombres de código) y los valores son códigos de listas cerradas.

// forma-v1 (F14, 2026-11-22). Una clave nueva o una lista cerrada que cambia sube la forma: el
// contenido guardado de una versión anterior se sigue leyendo con la forma con que se guardó.
export const FORMA_DEL_ESTANDAR = "estandar-forma-v1";

export const PLANTILLAS = ["por_defecto", "conservadora", "expansiva"] as const;
export type NombreDePlantilla = (typeof PLANTILLAS)[number];

export const NIVELES_DE_RIESGO = ["bajo", "con_observaciones", "deteriorado", "mal_comportamiento"] as const;
export type NivelDeRiesgo = (typeof NIVELES_DE_RIESGO)[number];

// Las seis salidas (sección 0). La clave `condicionado` es interna: el nombre de pantalla es «Aprobado con Requisitos» (S5).
export const SALIDAS = ["aprobacion_directa", "aprobar", "cambio_de_condiciones", "condicionado", "revisar", "negar"] as const;
export type Salida = (typeof SALIDAS)[number];

export const VEREDICTOS_DE_CAPACIDAD = ["alcanza", "justo", "extendida", "alcanza_con_cambio", "no_alcanza", "sin_medir"] as const;
export type VeredictoDeCapacidad = (typeof VEREDICTOS_DE_CAPACIDAD)[number];

// Los seis peldaños de la escalera del ingreso, con los nombres de `escalera-del-ingreso.ts`.
export const PELDANOS_ACEPTADOS = [
  "verificado_por_un_tercero",
  "verificado_con_documento",
  "cota_por_credito_otorgado",
  "minimo_certificado",
  "declarado_coherente",
  "declarado_sin_respaldo",
] as const;
export type PeldanoAceptado = (typeof PELDANOS_ACEPTADOS)[number];

export const EVIDENCIAS_DE_LA_CELDA = ["verificado", "inferido", "sin_evidencia"] as const;
export const HISTORIALES_DE_LA_CELDA = ["probado", "corto", "sin_historial"] as const;
export type EvidenciaDeLaCelda = (typeof EVIDENCIAS_DE_LA_CELDA)[number];
export type HistorialDeLaCelda = (typeof HISTORIALES_DE_LA_CELDA)[number];
export type ClaveDeCelda = `${EvidenciaDeLaCelda}/${HistorialDeLaCelda}`;

export const CLAVES_DE_CELDA: ClaveDeCelda[] = EVIDENCIAS_DE_LA_CELDA.flatMap((e) => HISTORIALES_DE_LA_CELDA.map((h) => `${e}/${h}` as ClaveDeCelda));

// Los controles. Los fijos bloquean siempre y no se mueven (1.2); los configurables tienen un efecto que la institución elige.
export const CONTROLES_FIJOS = ["fallecido", "fraude_documental", "delito_de_seguridad_ciudadana", "lista_de_control_con_identificacion"] as const;
export const CONTROLES_CONFIGURABLES = [
  "ofac_sin_identificacion",
  "posible_homonimo_en_demanda_penal",
  "cedula_inconsistente",
  "providencia_de_retencion",
  "providencia_de_certificacion",
  "pep",
  "homonimo_en_lista",
  "lista_de_mal_pagador",
] as const;
export type ControlConfigurable = (typeof CONTROLES_CONFIGURABLES)[number];
export const EFECTOS_DE_UN_CONTROL = ["bloquea", "verificar_identidad", "advertencia", "limita_a_revisar", "informa", "dato_de_comportamiento"] as const;
export type EfectoDeUnControl = (typeof EFECTOS_DE_UN_CONTROL)[number];

// El catálogo de requisitos (4.1, 6): los códigos que usa la matriz por defecto no se quitan.
export const REQUISITOS_FIJOS = [
  "sustento_de_ingreso",
  "detalle_de_la_deuda_sin_cuota",
  "certificado_de_estar_al_dia",
  "certificado_del_juicio",
  "certificado_de_pension_alimenticia",
  "certificado_laboral_vigente",
  "ruc_activo_y_declaraciones",
  "aclaracion_entre_fuentes",
  "verificacion_de_identidad",
  "debida_diligencia_reforzada",
  "constitucion_de_colateral",
  "actualizacion_de_datos",
] as const;
export const MOMENTOS_DE_UN_REQUISITO = ["antes_de_aprobar", "antes_de_desembolsar"] as const;

export const CALIFICACIONES_DE_BANCOS = ["A1", "A2", "A3", "B1", "B2", "C1", "C2", "D", "E"] as const;

// ---------------------------------------------------------------- las subsecciones

export interface ControlesDelEstandar {
  fijos: string[];
  configurables: Record<ControlConfigurable, EfectoDeUnControl>;
  efectos: Record<EfectoDeUnControl, { salida?: Salida; score?: number; salidaMaxima?: Salida; requisito?: string }>;
  consultaParcial: { salidaMaxima: Salida };
}

export interface MoraDeUnSector {
  /** Hasta cuántos dólares vencidos el tramo es «Aceptar». */
  aceptarHastaUsd: number;
  /** Hasta cuántos dólares vencidos el tramo es «Revisar»; por encima, «Negar». */
  revisarHastaUsd: number;
}

// R2 y R3 (2026-11-18 y 22): lo vencido de las operaciones con más de 30 días, por sector, sin sumar entre sectores.
export interface MoraVigente {
  /** Más de cuántos días de mora cuenta una operación (R2). */
  masDeDias: number;
  /** El atraso de 1 a `masDeDias` días: con observaciones (2.2), no es tramo de R2. */
  atrasoCortoNivel: NivelDeRiesgo;
  sectores: { sbs: MoraDeUnSector; seps: MoraDeUnSector; comercial: MoraDeUnSector };
  /** Más de 90 días con un monto dentro de lo tolerable: nunca queda en Aceptar (decisión 5). */
  masDeNoventaDiasConMontoTolerable: "revisar" | "negar";
  /** Lo que se hace con el tramo Revisar si la capacidad alcanza (decisión 3). */
  tramoRevisarConCapacidadQueAlcanza: Salida;
  /** El garante de una operación en mora baja un tramo (R2). */
  comoGaranteBajaUnTramo: boolean;
  /** Los umbrales en dólares se revisan cada enero (decisión 8): el SBU sube solo y los dólares no. */
  revisionDeLosUmbrales: { cadaAnioEn: "enero"; proximaRevision: string };
}

export interface RiesgoDelEstandar {
  bandasDelScore: Record<NivelDeRiesgo, [number, number]>;
  scoreMaximoSinHistorial: number;
  senales: {
    /** Cada letra en el nivel que aporta (sin buró manda la letra, decisión 2). */
    calificacionEnBancos: Record<Exclude<NivelDeRiesgo, "bajo">, string[]>;
    /** IESS y BIESS en el sector SBS, por días mientras el perfil no traiga lo vencido (decisión 7). */
    diasDeMoraIessBiess: { con_observaciones: [number, number]; deteriorado: [number, number]; malComportamientoDesde: number };
    retailAlCorte: { deterioradoDesdeDias: number; malComportamientoDesdeDias: number; valorVencidoMinimoUsd: number };
    operacionCastigadaOEnCobroJudicial: NivelDeRiesgo;
    listaDeMalPagador: NivelDeRiesgo;
    comoGaranteBajaUnNivel: boolean;
    /** R6 (2026-11-18): hasta la tolerancia, agravante menor; por encima, Revisar. Ni deteriorado ni mal comportamiento directo. */
    pensionAlimenticiaEnMora: { toleranciaUsd: number; porEncima: Salida };
    multasDeTransito: { conObservacionesDesdeSalariosBasicos: number };
    impedimentoParaCargosPublicos: NivelDeRiesgo;
    rucSuspendidoNoDepurado: NivelDeRiesgo;
  };
  moraVigente: MoraVigente;
}

export interface MalComportamientoDelEstandar {
  demandaDeCobro: {
    ventanaAnios: number;
    pesaMenosHastaAnios: number;
    nivelMientrasPesaMenos: NivelDeRiesgo;
    cuentaSiDemanda: string[];
    deUnaPersonaNatural: NivelDeRiesgo;
    reiteradas: { cantidad: number; enAnios: number };
  };
  atenuantes: {
    hoyAlDia: { calificacionAdmitida: string[]; diasDeMoraAdmitidos: number };
    endeudamientoALaBaja: { bajaMinima: number; enMeses: number; sinBuro: "no_medido" };
    estabilidad: { mesesMinimos: number };
    ingresoAlAlza: { alzaMinima: number; compara: "ultimos_6_meses_contra_los_6_anteriores" };
  };
  /** Decidido: no hay número mínimo de atenuantes. No es un parámetro que una plantilla cambie. */
  minimoDeAtenuantes: 0;
  salidasQueLaIAPuedeRecomendar: Salida[];
  bandaDelScoreSiLaIASube: [number, number];
}

export interface IngresoDelEstandar {
  aceptadoPorPeldano: Record<PeldanoAceptado, number>;
  declaradoCoherenteHastaVeces: number;
  /** c de la cota por cuotas (I5, provisional en 0,75). */
  cargaParaLaCotaPorCuotas: number;
}

export interface TramoDeFactor {
  /** null: sin tope (el último tramo). */
  hastaSaldoPorOperacion: number | null;
  factor: number;
}

export interface CapacidadDelEstandar {
  /** La carga máxima de siempre (negocio, 2026-10-17): el piso de la carga por riesgo. La que lee la escalera de hoy. */
  cargaMaxima: number;
  margenJusto: number;
  /** Fijo en CrediScope: el aporte personal del régimen general del IESS. */
  aportePersonalIess: number;
  /** La previa de la recomendación (4.1): sólo con evidencia verificada. La que lee la escalera de hoy. */
  cargaExtendida: { habilitada: boolean; hasta: number; exigeRiesgo: NivelDeRiesgo; exigeHistorial: HistorialDeLaCelda; exigeEvidencia: EvidenciaDeLaCelda };
  /**
   * C2 (negocio, 2026-11-18): la carga máxima va del 40 al 60% según el riesgo (más riesgo, menos capacidad), sobre el
   * neto disponible. «mal_comportamiento» no tiene carga: la base es Negar. Los porcentajes por nivel son PROPUESTA sin
   * medir (el negocio pidió validarlos). NO la lee nada todavía: la escalera mide con `cargaMaxima` y `cargaExtendida`.
   */
  cargaMaximaPorRiesgo: { baseDeLaCarga: "neto_disponible"; porNivel: Record<Exclude<NivelDeRiesgo, "mal_comportamiento">, number> };
  /** C1 (2026-11-18): la cuota de una deuda sin cuota se estima por tramo de saldo; el hipotecario sin plazo, con un factor propio. */
  cuotaEstimadaDeDeudaSinCuota: { tramosDeSaldo: TramoDeFactor[]; hipotecarioSinPlazo: number; fraccionParaLaAprobacionDirecta: number };
  creditoDeReferencia: { monto: number; plazoMeses: number };
  /** Historial probado (3.2): deuda vigente al día desde este monto, o dos o más operaciones vigentes al día. */
  historialProbado: { deudaAlDiaDesdeUsd: number; operacionesAlDiaDesde: number };
}

export interface CeldaDelEstandar {
  salidaMaxima: Salida;
  montoMaximoEnIngresos?: number;
  plazoMaximoMeses?: number;
  montoMaximo?: number;
  /** Hasta cuánto se presta sin colateral. Sin la clave, la celda no pone ese límite (el producto ya trae el colateral). */
  montoMaximoSinColateral?: number;
  /** Con historial probado e inferido: la cuota nueva no pasa de la mayor cuota que ya paga al día (reemplazo de cuota). */
  cuotaMaxima?: "la_mayor_cuota_pagada_al_dia";
}

export interface AprobacionDirectaDelEstandar {
  /** C3 (2026-11-18): sin buró está permitida y la activa cada institución según su apetito al riesgo. */
  habilitada: boolean;
  exigeControles: "limpio";
  exigeConsulta: "completa";
  diasMaximosDeLaConsulta: number;
  exigeRiesgo: NivelDeRiesgo;
  aniosSinDemandaDeCobro: number;
  exigeCapacidad: VeredictoDeCapacidad;
  exigePeldano: PeldanoAceptado;
  /** Los historiales con los que se otorga; la expansiva la abre también en el corto. */
  historialesAdmitidos: HistorialDeLaCelda[];
  mesesMinimosDeEstabilidad: number;
  montoMaximo: number;
  montoMaximoEnIngresos: number;
  plazoMaximoMeses: number;
  scoreMinimo: number;
}

export interface MargenDeLaIA {
  escalonesHaciaArriba: number;
  escalonesHaciaAbajo: number;
  /** Fijo: la Aprobación Directa sólo la otorga el código (S1). */
  puedeOtorgarLaAprobacionDirecta: false;
  puedeQuitarLaAprobacionDirecta: boolean;
  puedeSubirDesdeCambioDeCondiciones: boolean;
  exigeMotivoConUnHecho: true;
}

export interface RequisitoDelCatalogo {
  momento: (typeof MOMENTOS_DE_UN_REQUISITO)[number];
  llevaIngresoNecesario?: boolean;
}

// C4 (2026-11-18): el garante y el colateral son requisitos de cada institución, no del estándar de CrediScope.
export interface ProductoDelCatalogo {
  nombre: string;
  montoMinimo: number;
  montoMaximo: number;
  plazoMinimoMeses: number;
  plazoMaximoMeses: number;
  tasaNominalMinimaPorcentaje: number;
  tasaNominalMaximaPorcentaje: number;
  desgravamenAnualPorcentaje: number;
  pideGarante: boolean;
  /** `lo_pide_segun_la_celda`: el límite sin colateral es el de cada celda (`montoMaximoSinColateral`); `no_lo_pide` lo apaga. */
  colateral: "no_lo_pide" | "lo_pide_siempre" | "lo_pide_segun_la_celda";
}

export interface EstandarDeLaInstitucion {
  forma: typeof FORMA_DEL_ESTANDAR;
  plantilla: NombreDePlantilla;
  /** Sin buró de la institución se diseña primero; con él cambian las señales, no la forma (2.5). */
  conBuroDeLaInstitucion: boolean;
  controles: ControlesDelEstandar;
  riesgo: RiesgoDelEstandar;
  malComportamiento: MalComportamientoDelEstandar;
  ingreso: IngresoDelEstandar;
  capacidad: CapacidadDelEstandar;
  celdas: Record<ClaveDeCelda, CeldaDelEstandar>;
  /** Lo que se hace con un monto por encima del límite sin colateral de la celda (3.3). Lo elige cada institución. */
  siSeSuperaElMontoSinColateral: "cambio_de_condiciones" | "condicionado";
  matriz: Record<NivelDeRiesgo, Record<VeredictoDeCapacidad, Salida>>;
  aprobacionDirecta: AprobacionDirectaDelEstandar;
  margenDeLaIA: MargenDeLaIA;
  requisitos: Record<string, RequisitoDelCatalogo>;
  /** El catálogo de productos: una institución tiene al menos uno. */
  productos: Record<string, ProductoDelCatalogo>;
}

// Lo que se guarda por versión (1.1): una fila por versión, la vigente es una sola y las anteriores no se tocan.
export interface FilaDelEstandar {
  version: string;
  plantilla: NombreDePlantilla;
  contenido: EstandarDeLaInstitucion;
  huella: string;
  vigenteDesde: string;
  pedidoPor: string;
  aplicadoPor: string;
}
