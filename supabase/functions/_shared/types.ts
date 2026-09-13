// Tipos compartidos por las Edge Functions de CrediScope.
//
// Confirmado contra producción (2026-09) vía 2 HAR capturados de la
// interfaz web de Novadata (uno de una persona "limpia", otro con
// historial real: demandas, mora bancaria, etc.): TODOS los recursos de
// datos comparten el mismo sobre de respuesta ->
// { estado: { codigo, mensaje }, <campoArray>: [...] }.
// `estado.codigo !== "OK"` (o un HTTP != 200) es la señal de "sin datos",
// ver isEstadoOk() en novadata-client.ts.
//
// Diseño: el score NO lo calcula una fórmula determinística. Un LLM
// (llm-scoring.ts) recibe el ClientContext (curado por eje, ver abajo) y
// el marco interpretativo (ver marco-interpretativo.ts) y devuelve un
// score aproximado + pros/contras + razonamiento. Lo único
// determinístico son los "controles de bloqueo" (controles-bloqueo.ts):
// hechos binarios objetivos (persona fallecida, coincidencia en listas
// de control/OFAC/PEP/lista negra) que NO deben quedar a criterio
// aproximado del LLM — ver ResultadoControlBloqueo.
//
// BIESS: descartado como bloque — no corresponde a ningún dato real de
// Novadata (confirmado por el usuario, no es un endpoint que exista).

export type BlockKey =
  | "general"
  | "sociodemografica"
  | "trabajo"
  | "iess"
  | "vehiculos"
  | "funcion_judicial"
  | "fiscalia"
  | "bancos"
  | "cooperativas";

// "deshabilitado" = el recurso/bloque no se consultó porque un admin lo
// desactivó en novadata_resource_config (ver runtime-config.ts) — a
// propósito distinto de "faltante" (Novadata no tenía datos) o "error"
// (falló la consulta), para no confundir una decisión operativa con una
// falla real de la fuente.
export type BlockFetchStatus = "ok" | "faltante" | "error" | "deshabilitado";

export interface BlockResult<T> {
  status: BlockFetchStatus;
  data: T | null;
  errorMessage?: string;
}

export type BlockStatusMap = Record<BlockKey, BlockFetchStatus>;

// ---------- pn_inf_basica (bloque "general") ----------
// Confirmado contra producción (2026-09).
export interface RawGeneral {
  estado: { codigo: string; mensaje: string };
  personaNatural: {
    identificacion: string;
    nombre: string;
    tipoIdentificacion?: { idTipoIdentificacion: number; descripcion: string };
    fechaNacimiento?: string; // "YYYY-MM-DD"
    fechaDefuncion?: string | null; // presente => persona fallecida, señal crítica (ver controles-bloqueo.ts)
    informacionAdicional?: string | null; // ej. "CIUDADANO." o menciones de fallecimiento
    genero?: { idGenero: number; descripcion: string };
    [key: string]: unknown;
  };
  nacionalidades?: Array<{ pais?: { nombre: string; codigoIso3: string } }>;
  profesiones?: Array<{ profesion?: { descripcion: string } }>;
  estadoCivil?: { estadoCivil?: { descripcion: string } };
  personaNaturalConyuge?: { personaConyuge?: { identificacion: string | null; nombre: string } };
  nivelEducacion?: { nivelEducacion?: { descripcion: string; nivel: number } };
  [key: string]: unknown;
}

// ---------- Sobre genérico confirmado para el resto de recursos ----------

export interface NovadataEnvelope {
  estado: { codigo: string; mensaje: string | null };
  // El nombre del campo array/objeto varía por recurso (personaVehiculo,
  // afiliacionIess, demandas, direcciones, datosSuper...) — se accede
  // dinámicamente en normalize.ts.
  [campo: string]: unknown;
}

// Recurso individual: nombre corto -> resultado de esa llamada a Novadata.
export type RawMultiRecurso = Record<string, BlockResult<NovadataEnvelope>>;

export interface RawNovadataResponse {
  general: BlockResult<RawGeneral>;
  sociodemografica: BlockResult<RawMultiRecurso>;
  trabajo: BlockResult<RawMultiRecurso>;
  iess: BlockResult<RawMultiRecurso>;
  vehiculos: BlockResult<RawMultiRecurso>;
  funcion_judicial: BlockResult<RawMultiRecurso>;
  fiscalia: BlockResult<RawMultiRecurso>;
  bancos: BlockResult<RawMultiRecurso>;
  cooperativas: BlockResult<RawMultiRecurso>;
}

// ---------- Controles de bloqueo (determinísticos, no delegados al LLM) ----------

export type CodigoControlBloqueo =
  | "fallecido"
  | "cedula_inconsistente"
  | "lista_control"
  | "lista_negra"
  | "listas_control_interno"
  | "pep"
  | "homonimo_en_lista_control"
  | "delito_seguridad_ciudadana";

export interface HallazgoControlBloqueo {
  code: CodigoControlBloqueo;
  message: string;
  // true => este hallazgo por sí solo fuerza bloqueado=true. false => es
  // informativo (ej. PEP, cédula inconsistente): se muestra en el
  // análisis pero NO fuerza el score a 1 ni se debe tratar como negativo.
  bloqueante: boolean;
}

export interface ResultadoControlBloqueo {
  bloqueado: boolean; // true => score se fuerza a 1 sin importar el criterio del LLM
  hallazgos: HallazgoControlBloqueo[];
}

// ---------- Contexto curado por eje (lo que ve el LLM) ----------
// Cada eje trae su estado de disponibilidad + un resumen RECORTADO
// (nombres, fechas, montos, estados) — no el payload crudo completo de
// Novadata (que incluye árboles de canton/provincia/país innecesarios
// para el juicio crediticio). Ver buildClientContext() en normalize.ts.

export interface EjeContext {
  status: BlockFetchStatus;
  resumen: unknown;
}

export interface ClientContext {
  cedula: string;
  ejes: Record<BlockKey, EjeContext>;
}

// ---------- Estructura estandarizada (procesada/calculada) ----------
// Sucesora de ClientContext — reemplaza arrays crudos por campos YA
// calculados (conteos, sumas, booleanos, "el más reciente") para que el
// LLM reciba mucho menos texto por persona. Ver docs/estructura-estandarizada.md
// y process.ts (que la construye) — validada con 25 clientes reales antes
// de conectarla al scoring (ver scripts/reprocess-sample.mjs, la versión
// Node usada para esa validación; debe mantenerse en sync con process.ts).
//
// Convención de null vs 0: los conteos/sumas son 0 (no null) cuando el
// eje SÍ se consultó pero no hay registros — null se reserva para "no se
// pudo calcular" (ej. MAX de un array vacío, o el eje vino faltante/error
// — ver metaConsulta).
//
// Grupos según Cambios_Reagrupacion (usuario, v1): "comportamientoInterno"
// es un grupo nuevo que separa el scoring propio de Novadata
// (personasIncumplimientos) de comportamientoBancario, por su peso.

export interface StandardClientProfile {
  cedula: string;
  consultadoEn: string; // ISO timestamp

  identidad: {
    nombreCompleto: string | null;
    edad: number | null;
    genero: string | null;
    estadoCivil: string | null;
    nivelEducacion: string | null;
    profesiones: string[];
    fallecido: boolean;
    tieneConyuge: boolean;
    cantonNacimiento: string | null;
    provinciaNacimiento: string | null;
    paisOrigen: string | null;
    paisOrigenIso3: string | null;
    paisOrigenIso: number | null;
    esExtranjero: boolean | null;
    añosCasado: number | null; // null si no hay cónyuge ACTUAL (evita usar fechaMatrimonio de un matrimonio ya disuelto)
    edadConyuge: number | null;
  };

  contacto: {
    numeroDirecciones: number;
    numeroTelefonos: number;
    numeroCorreos: number;
    direccionActualizada12M: boolean;
    telefonoActualizado12M: boolean;
    correoActualizado12M: boolean;
  };

  familia: {
    numeroHijos: number;
    tieneHijoMenorEdad: boolean;
    padresFallecidos: number;
    tieneHijos: boolean;
  };

  laboral: {
    empleoActual: { empleador: string | null; cargo: string | null; salarioAprox: number | null } | null;
    // Empleadores con evidencia de actividad en algún momento de los
    // últimos 24 meses (fecSal, o si viene vacío, el último snapshot
    // (anio,mes) confirmado — NO se asume "activo hoy" solo porque
    // Novadata nunca registró una salida, ver antiguedadEmpleoActualMeses).
    numeroEmpleadoresUltimos24Meses: number;
    ingresoPromedioUltimos6Meses: number | null;
    esEmpleadorOAdministrador: boolean;
    tieneRucActivo: boolean;
    tieneEstablecimientoActivo: boolean;
    esIndependiente: boolean;
    numeroEmpleadosRegistrados: number;
    tipoEmpleador: string | null;
    obligacionesPatronalesEnMora: boolean | null; // null si no aplica (no es empleador)
    // Fechas crudas del registro RUC (contribuyente) — del registro
    // activo si existe, si no del primero disponible. Para auditar
    // tieneRucActivo/tieneEstablecimientoActivo contra el SRI sin tener
    // que ir a la data cruda de Novadata cada vez.
    fechaInicioActividadesRuc: string | null; // YYYY-MM-DD
    fechaCeseActividadesRuc: string | null; // más reciente entre cancelación y suspensión definitiva
    fechaReinicioActividadesRuc: string | null;
    // El estado del RUC (tieneRucActivo, a nivel de contribuyente) es
    // DISTINTO del estado de cada establecimiento — una persona puede
    // tener el RUC activo con un establecimiento abierto y otro
    // cerrado. Fuente: establecimientoActEconomica (por eso son campos
    // aparte, no reemplazan a tieneEstablecimientoActivo que sigue
    // siendo a nivel de RUC — ver process.ts).
    numeroEstablecimientosActivos: number;
    numeroEstablecimientosInactivos: number;
    tieneEstablecimientosRegistrados: boolean;
    // Estado y antigüedad de la actividad económica — Novadata/SRI solo
    // guardan la fecha del cese y del reinicio MÁS RECIENTES, no un
    // historial completo de ciclos, así que "años desde el inicio" solo
    // alcanza cuando nunca hubo cese. Ver los 5 casos documentados en
    // process.ts (caso real confirmado: cédula 0502932429 — reinicio
    // 2014 anterior al cese 2018, o sea inactiva hace ~8 años pese a
    // que el inicio fue en 2009).
    estadoActividadEconomica:
      | "sin_ruc"
      | "activa_sin_interrupciones"
      | "activa_reactivada"
      | "inactiva_nunca_reactivada"
      | "inactiva_tras_reactivacion"
      | null;
    antiguedadUltimaEtapaActivaMeses: number | null; // de la racha activa actual (si activa) o de la última antes de cesar (si inactiva)
    mesesInactivoActividadEconomica: number | null; // null si está activa
    // Tipo del cese más reciente del RUC (null si nunca hubo cese) —
    // SRI distingue "cancelación" (puede ser un trámite ordinario) de
    // "suspensión definitiva" (case real: cédula 0501578256, fecha de
    // suspensión definitiva = fecha de cancelación, con
    // observ_solicitud_suspension="CESE DE ACTIVIDADES"). Informativo,
    // no cambia estadoActividadEconomica ni el score por sí solo.
    tipoUltimoCeseRuc: "cancelacion" | "suspension_definitiva" | null;
    // Antigüedad laboral — fuente tiess (fecIng/fecSal), independiente
    // de empleoActual (fuente trabajoHistoricosMecanizado, puede diferir
    // levemente en el nombre del empleador). Solo se reporta si hay al
    // menos 3 snapshots mensuales confirmados para ese empleo Y el
    // último snapshot es reciente (≤3 meses) — fecSal vacío en tiess
    // NO significa "sigue activo hoy", solo "Novadata nunca registró
    // una salida" (caso real: cédula 0501578256, único empleo con
    // último snapshot en 2021-11 y fecSal vacío — sin este chequeo daba
    // "6 años 5 meses de antigüedad actual" para un empleo sin
    // evidencia real desde hace ~4 años).
    antiguedadEmpleoActualMeses: number | null;
    // Empleo más largo registrado históricamente (incluye el actual si
    // es el más largo) — señal de estabilidad aparte de la antigüedad
    // actual: alguien con un empleo corto hoy pero años de tenencias
    // largas es más estable que alguien que salta de trabajo en trabajo.
    // Cuando fecSal viene vacío, la duración se cuenta hasta el ÚLTIMO
    // snapshot confirmado de ese empleo, no hasta hoy (mismo caso real
    // de arriba — evita inflar la duración de un empleo abandonado que
    // nunca se cerró formalmente en el dato).
    duracionEmpleoMasLargoMeses: number | null;
  };

  tributario: {
    pagaISD: boolean;
    montoMaximoISD: number | null;
    fechaMasRecienteISD: number | null; // periodoFiscal (año)
    generaImpuestoRenta: boolean;
    montoMaximoImpuestoRenta: number | null;
    fechaMasRecienteImpuestoRenta: number | null;
    esAfiliadoUnipersonal: boolean; // false si nunca tuvo RUC (no "no se sabe")
  };

  seguridadSocial: {
    // null si el recurso pn_afiliacion_iess no trajo datos (Novadata no
    // pudo consultarlo para esta persona) — DISTINTO de false (se
    // consultó bien y el estado real es "no afiliado"/inactivo). Hueco
    // de dato frecuente: 32 de 40 clientes de la muestra de auditoría
    // traen este recurso "faltante" pese a tener empleo real confirmado
    // por otras fuentes (tiess/mecanizado) — ver process.ts.
    afiliadoIessActivo: boolean | null;
    esPensionista: boolean;
    esJubilado: boolean;
    estadoAfiliacionIess: string | null;
  };

  patrimonio: {
    numeroVehiculos: number;
    valorAvaluoVehiculos: number;
    numeroInmuebles: number;
    numeroInversiones: number;
    tieneVehiculos: boolean;
    numeroAutos: number;
    numeroVehiculosPesados: number;
    numeroMotos: number;
    valorComercialTotalVehiculos: number;
    valorVentaTotalVehiculos: number;
    valorPromedioTotalVehiculos: number;
    // Suma, por vehículo, del máximo entre valorAvaluo/precioPromedio/
    // precioMinimo/precioMaximo/precioComercial/precioVentaPublico/
    // precioVentaPromedio (NO incluye precioVenta — ver process.ts). El
    // valor a usar para colaterales: más cercano a mercado actual que
    // valorAvaluo (depreciación lineal castiga fuerte vehículos viejos).
    valorColateralVehiculos: number;
  };

  // "Comportamiento Bancos BIESS Diners" (Cambios_Reagrupacion, grupo 8)
  // numeroOperacionesBuroCredito/calificacionRiesgo: fuente es el buró
  // de crédito (antes "central de riesgos"). Un cliente con 2+
  // operaciones puede tener calificaciones distintas — se exponen ambos
  // extremos: peorCalificacionRiesgo (la señal de riesgo más relevante,
  // pesa fuerte aunque las demás operaciones estén bien) y
  // mejorCalificacionRiesgo (contexto: no es lo mismo "peor=E, única
  // operación" que "peor=E, mejor=A1, 5 operaciones").
  comportamientoBancario: {
    numeroOperacionesBuroCredito: number;
    peorCalificacionRiesgo: string | null;
    mejorCalificacionRiesgo: string | null;
    tieneOperacionConDemanda: boolean;
    tieneOperacionCastigada: boolean;
    saldoTotalVigente: number;
    // Monto total en mora (campos mora/saldomora por operación) — antes
    // no se extraía, dejando a saldoTotalVigente como único indicador de
    // deuda aunque no refleja atrasos. Sin caso real en la muestra
    // actual con valor >0 (calificaciones vistas: A1-B2, ninguna con
    // mora) — se extrae de forma proactiva para cerrar el hueco del
    // schema, a confirmar la forma exacta cuando aparezca un caso real.
    saldoEnMoraBuroCredito: number;
    numeroCreditosFormales: number;
    numeroDeudasRetail: number;
    diasMoraMaximaRetail: number | null;
    totalDeudaRetail: number;
    tieneCreditoIessBiess: boolean;
    diasMoraCreditoIessBiess: number | null;
  };

  // "Comportamiento Cooperativas" (grupo 9)
  comportamientoCooperativas: {
    numeroOperaciones: number;
    diasMoraMaxima: number | null;
    saldoTotal: number;
    // Ver nota de saldoEnMoraBuroCredito en comportamientoBancario —
    // mismo hueco, misma decisión.
    saldoEnMora: number;
    tieneOperacionConDemanda: boolean;
    tieneOperacionCastigada: boolean;
  };

  // "Comportamiento Interno" (grupo 14, NUEVO) — el scoring propio de
  // Novadata (basesInternas.personasIncumplimientos), separado del resto
  // de comportamientoBancario por su peso.
  comportamientoInterno: {
    novadataResultadoHabitoPago: string | null;
    novadataPerfilInterno: string | null;
    novadataDiasMoraMaxima: number | null;
    novadataDiasMoraVigente: number | null;
    novadataSaldoCapitalVigente: number | null;
    esClienteInterno: boolean;
  };

  transitoVehicular: {
    tieneLicenciaVigente: boolean;
    puntosLicencia: number | null;
    numeroMultas: number;
    valorAdeudadoTransito: number;
  };

  // Demandas de cobro/pagarés/letras de cambio/ejecuciones — señal
  // fuerte de comportamiento de pago (separado de riesgoJudicialCivil a
  // pedido del usuario; antes era el booleano demandaProblemaCrediticio
  // dentro de ese grupo). Ver PALABRAS_CLAVE_PROBLEMA_CREDITICIO en process.ts.
  riesgoJudicialCrediticio: {
    numeroDemandasComoDemandado: number;
    tiposDemandasComoDemandado: string[];
  };

  // Demandas civiles NO crediticias (laboral, familia, tránsito,
  // propiedad, etc.) — contexto, no comportamiento de pago directo.
  riesgoJudicialCivil: {
    numeroDemandasComoDemandado: number;
    tiposDemandasComoDemandado: string[]; // demanda.delito, NO tipoDemanda.descripcion (ver nota en process.ts)
    numeroDemandasComoOfendido: number;
    // Solo cuenta la deuda/mora del registro pn_supa donde el CLIENTE es
    // el obligado a pagar (ver esClienteObligadoSupa en process.ts) — un
    // registro donde el cliente es representanteLegal significa que a
    // él/ella LE DEBEN, no al revés. BUG real corregido: 6 de 12
    // clientes de la muestra de auditoría con pensionAlimenticiaEnMora=true
    // eran en realidad este error de rol (caso confirmado: cédula
    // 0501578256).
    pensionAlimenticiaEnMora: boolean;
    deudaPensionAlimenticia: number | null;
  };

  riesgoPenal: {
    tieneAntecedentesPenales: boolean | null;
    descripcionAntecedentes: string | null;
    // Reemplaza a numeroDenunciasFiscalia (contaba todas las denuncias
    // por igual, sin mirar el rol del cliente) — mismo criterio que
    // numeroDemandasComoDemandado/ComoOfendido en riesgoJudicialCivil.
    numeroDenunciasComoSospechoso: number; // penaliza
    numeroDenunciasComoVictima: number; // denunciante/víctima/perjudicado — SOLO CONTEXTO, no penaliza
  };

  cumplimiento: {
    enListaControl: boolean;
    // Homónimo: Novadata encontró a alguien más con el MISMO NOMBRE pero
    // CÉDULA DISTINTA en una lista de control — no es el cliente. Dato
    // informativo, nunca descalifica (ver controles-bloqueo.ts, código
    // homonimo_en_lista_control: a propósito no bloqueante). Confirmado
    // con casos reales que la identificación del homónimo nunca coincide
    // con la del cliente consultado.
    tieneHomonimoEnListaControl: boolean;
    enListaNegra: boolean;
    impedimentoCargosPublicos: boolean;
    causalImpedimento: string | null;
    registraSercopContraloria: boolean;
    // Persona Expuesta Políticamente (cargo público relevante, actual o
    // pasado) — dato de cumplimiento/PLA-FT, NO es señal de riesgo
    // crediticio ni descalifica al cliente. Ver controles-bloqueo.ts: a
    // propósito no fuerza bloqueado=true.
    esPersonaExpuestaPoliticamente: boolean;
    // Detalle del registro PEP más reciente — confirmado con datos
    // reales (cargo/empresa/sueldo/fecha vienen poblados en Novadata),
    // antes se descartaba a un booleano sin contexto pese a que el
    // prompt del LLM ya asumía que existía este detalle.
    detallePep: {
      cargo: string | null;
      empresa: string | null;
      sueldo: number | null;
      fecha: string | null;
    } | null;
  };

  // "Riesgo de Seguridad Ciudadana" — grupo propio, mismo nivel que
  // Riesgo Judicial Crediticio/Civil, a pedido explícito del usuario
  // (antes vivía como 2 campos sueltos dentro de cumplimiento). Cubre
  // lavado de activos, narcotráfico/tráfico de sustancias, trata de
  // personas, tenencia/porte de armas, extorsión, delincuencia
  // organizada, asociación ilícita y asesinato/homicidio intencional —
  // control de bloqueo duro, fuerza el score a 1 igual que las listas
  // de sanciones (ver controles-bloqueo.ts). Confirmado con casos
  // reales (extorsión, tenencia de armas, delincuencia organizada,
  // asociación ilícita, asesinato, lavado de activos) — narcotráfico y
  // trata de personas siguen sin caso real, palabras clave por
  // conocimiento general del COIP (ver nota en process.ts).
  riesgoSeguridadCiudadana: {
    tieneDelitoSeguridadCiudadana: boolean;
    categoriasDelitoSeguridadCiudadana: string[]; // ej. ["Extorsión", "Delincuencia organizada"]
  };

  metaConsulta: {
    ejesOk: string[];
    ejesFaltantes: string[];
    ejesConError: string[];
  };
}

// ---------- Resultado del scoring por LLM ----------

export interface LlmScoringResult {
  score: number; // 1-999, APROXIMADO — el LLM lo estima con el marco interpretativo, no es una fórmula
  positives: string[];
  negatives: string[];
  missingInfo: string[];
  reasoning: string; // explicación en lenguaje natural de cómo llegó al score
  // Metadata de la llamada al LLM, para auditar/depurar (ver
  // supabase/migrations/001_llm_metadata.sql). stopReason "max_tokens"
  // significa que la respuesta se cortó a medias — señal de que hay que
  // subir el presupuesto de tokens.
  llmModel: string;
  llmStopReason?: string;
  llmUsage?: Record<string, unknown>;
  llmRequestId?: string;
}
