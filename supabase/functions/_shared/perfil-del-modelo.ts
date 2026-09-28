// El perfil del modelo: la ÚNICA fuente que lee el análisis con IA.
//
// POR QUÉ UNA SOLA PUERTA
//
// Hasta marco-v22 cada camino armaba su propio mensaje. El análisis
// ocultaba los campos que el admin deshabilitó y recortaba el detalle de
// ingresos; el backtest recortaba el detalle pero no ocultaba nada, así
// que "corría en las mismas condiciones que producción" sin hacerlo; el
// informe de retroalimentación tenía su propio extracto. Y la parte de
// ingresos llegaba con los nombres internos (pisoIngresoMensualReportado,
// reportada_por_tercero, autodeclarada_en_minimo, senalesDeEscala) que el
// negocio sacó de la pantalla y que el marco no le explicaba: nada impedía
// que el análisis dijera "piso de ingreso" o "evidencia autodeclarada".
//
// Ahora todo camino al modelo pasa por armarPerfilDelModelo(): el perfil
// estandarizado guardado, con `fuentesIngreso` reemplazado por la lectura
// que ve el analista en la pestaña Fuentes de ingreso -- los mismos
// nombres (nombres-ingresos.ts) y las mismas funciones (perfil laboral,
// indicios de ingreso mayor, tamaño del negocio) -- y los campos
// deshabilitados en standard_profile_field_config en null.
//
// Lo que se deja afuera a propósito: los aportes mes a mes, los empleos de
// 24 meses, los textos de actividad económica del SRI y el impuesto a la
// renta por año (decisión del negocio del 2026-09-25). Desde fuentes-v9 la
// renta llega sólo como indicio de ingreso mayor, ya interpretado (decisión
// del 2026-09-28). Tampoco van las marcas de auditoría (correccion,
// recalculo).
//
// Desde marco-v24 suma el bloque `endeudamiento` (la deuda propia en todo
// el sistema, lo que está en atraso, lo garantizado y la cuota conocida) y
// le da a los préstamos del IESS/BIESS su nombre (numeroPrestamosIessBiess).
//
// Desde marco-v25, `disponibilidad` reemplaza a `metaConsulta`: qué temas se
// consultaron, en palabras del negocio, sin nombres de fuentes (ver
// disponibilidadPorTema y docs/declaracion-de-disponibilidad.md).
//
// Desde marco-v26, las demandas civiles llegan contadas por categoría
// (demandas.ts) y los tipos de cobro, legibles: ni artículos del COIP ni
// tildes rotas.
//
// Un cambio en lo que arma este archivo cambia lo que lee el modelo: es
// una versión nueva del marco (MARCO_VERSION), con su fila en
// scoring_rules_versions.

import { clasificarPerfilLaboral } from "./perfil-laboral.ts";
import { dejoDeAparecerEnElIess, esIngresoMinimoSbu, indiciosDeIngresoMayor, tamanoDelNegocio } from "./fuentes-ingreso.ts";
import { ETIQUETA_ESTADO, ETIQUETA_SEGMENTO, quienDeclara } from "./nombres-ingresos.ts";
import { tipoDeDemandaLegible } from "./demandas.ts";

type AnyRecord = Record<string, unknown>;

// ---- Disponibilidad por tema (desde marco-v25) ----
//
// Hasta marco-v24 el modelo recibía metaConsulta: tres listas con los
// nombres técnicos de las 52 fuentes. En la comparación de razonamiento del
// 2026-09-28, 26 de 42 respuestas dijeron que no se habían consultado
// fuentes que sí respondieron ("no hay datos de inmuebles ni cooperativas,
// esas fuentes no respondieron"): tenían que deducir que "bienesInmueble"
// en "fuentesSinDatos" quiere decir "no tiene inmuebles", y sin razonar
// mucho no lo lograban. Con menos razonamiento, 12 de 14.
//
// Ahora recibe temas en palabras del negocio y DOS estados, no tres:
//   - consultado: lo que el perfil dice de ese tema es un hecho, también un
//     cero, un false o una lista vacía;
//   - no consultado: alguna de sus fuentes no respondió o está apagada;
//     no autoriza ninguna conclusión.
// El diseño original tenía tres (con datos / sin datos / no medido). Se
// dejó en dos porque "con datos" dice que la fuente respondió algo, no que
// la persona tenga registros: el certificado de antecedentes penales
// responde "NO" y figura con datos, igual que SERCOP con sus listas vacías.
// Decirle al modelo "antecedentes penales: con registros" sería un error
// peor que el que se corrige.
//
// Un tema cuenta como consultado sólo si respondieron TODAS sus fuentes.
// basesInternas trae dos cosas (los aportes al IESS y el historial de pago
// con Novadata) y está en los dos temas. "vacunados" no está en ninguno: no
// es parte del análisis de crédito.
const TEMAS_DE_CONSULTA: Array<[tema: string, fuentes: string[]]> = [
  ["buró de crédito de bancos", ["buroCreditoSuper"]],
  ["tarjetas Diners", ["buroCreditoDiners"]],
  ["cooperativas", ["buroCreditoCoop"]],
  ["casas comerciales", ["retails"]],
  ["préstamos del IESS/BIESS", ["creditoHipotecario", "creditoQuirografario"]],
  ["historial de pago con Novadata", ["basesInternas"]],
  ["registro de deudores", ["deudores"]],
  ["deudas con sentencia firme", ["deudasFirmes"]],
  ["demandas en su contra", ["demandas"]],
  ["demandas que presentó", ["demandasOfendido"]],
  ["pensiones alimenticias", ["pensionAlimenticia", "pensionAlimenticiaNovadata"]],
  ["denuncias en la Fiscalía", ["denuncias"]],
  ["antecedentes penales", ["antecedentesPenales"]],
  ["listas de control y sanciones", ["listasControl"]],
  ["lista negra", ["listaNegra"]],
  ["impedimento para cargos públicos", ["impedimentoCargosPublicos"]],
  ["SERCOP y Contraloría", ["sercop"]],
  ["aportes al IESS", ["basesInternas"]],
  ["empleos registrados en el IESS", ["trabajoHistoricos"]],
  ["historial mensual de aportes al IESS", ["trabajoHistoricosMecanizado"]],
  ["afiliación al IESS", ["afiliacionIess"]],
  ["empleados a su cargo", ["empleados", "cumplimientoPatronal"]],
  ["jubilación y pensión del IESS", ["jubilados", "pensionista"]],
  ["seguro social militar (ISSFAC)", ["afiliacionIssfacCertMedico", "afiliacionIssfacFuerzaArmada"]],
  ["seguro social policial (ISSPOL)", ["afiliacionIsspol", "afiliacionSiisspol"]],
  ["seguro de salud", ["afiliacionSalud"]],
  ["RUC y actividad económica", ["contribuyente", "establecimientoActEconomica"]],
  ["impuesto a la renta", ["sriImpuestoRenta"]],
  ["empresas que administra", ["administraciones"]],
  ["vehículos", ["vehiculos"]],
  ["inmuebles", ["bienesInmueble"]],
  ["inversiones", ["inversiones"]],
  ["seguros y siniestros", ["polizas", "siniestros"]],
  ["multas de tránsito", ["deudasAnt", "deudasAmt", "deudasEmov"]],
  ["licencia de conducir", ["licenciaConducir"]],
  ["identidad", ["general"]],
  ["familia", ["padres", "hijos"]],
  ["títulos académicos", ["titulos"]],
  ["datos de contacto", ["direcciones", "telefonos", "correo"]],
];

// null si el perfil no trae metaConsulta o no nombra ninguna fuente
// conocida (los anteriores a estructura-v3 nombraban nueve "ejes"): mejor
// no decir nada que declarar todo como no consultado.
export function disponibilidadPorTema(perfil: AnyRecord | null | undefined): AnyRecord | null {
  const meta = perfil?.metaConsulta as AnyRecord | undefined;
  if (!meta) return null;
  const lista = (clave: string) => new Set((Array.isArray(meta[clave]) ? meta[clave] : []) as string[]);
  const respondieron = new Set([...lista("fuentesConDatos"), ...lista("fuentesSinDatos")]);
  const conocidas = new Set(TEMAS_DE_CONSULTA.flatMap(([, fuentes]) => fuentes));
  if (![...respondieron].some((f) => conocidas.has(f))) return null;
  const temasConsultados: string[] = [];
  const temasNoConsultados: string[] = [];
  for (const [tema, fuentes] of TEMAS_DE_CONSULTA) {
    (fuentes.every((f) => respondieron.has(f)) ? temasConsultados : temasNoConsultados).push(tema);
  }
  return { temasConsultados, temasNoConsultados };
}

// Las fuentes sin monto que ya se dicen en otro lado del perfil del modelo:
// el RUC activo en perfilLaboral y la nómina en tamanoDelNegocio.
const SIN_MONTO_YA_DICHAS = new Set(["actividad económica propia", "actividad empresarial propia"]);

// La lectura de ingresos que recibe el modelo. null si el perfil es
// anterior al módulo de fuentes de ingreso.
export function ingresosDelPerfilDelModelo(perfil: AnyRecord | null | undefined): AnyRecord | null {
  const f = perfil?.fuentesIngreso as AnyRecord | undefined;
  if (!f) return null;
  const fuentes = (Array.isArray(f.fuentes) ? f.fuentes : []) as AnyRecord[];
  const monto = typeof f.pisoIngresoMensualReportado === "number" ? f.pisoIngresoMensualReportado : null;
  const pl = clasificarPerfilLaboral(perfil);
  const d = (f.detalle ?? null) as AnyRecord | null;
  const co = d ? (d.continuidadLaboral as AnyRecord | null | undefined) : undefined;
  const haceUnAnio = typeof d?.totalHace12Meses === "number" ? d.totalHace12Meses : null;

  return {
    segmento: ETIQUETA_SEGMENTO[String(f.segmento)] ?? f.segmento ?? null,
    estado: ETIQUETA_ESTADO[String(f.estadoSegmento)] ?? f.estadoSegmento ?? null,
    // Hasta fuentes-v8 el motivo de "Sin datos" nombraba la fuente y su
    // estado técnico ("(basesInternas) no respondió (estado: error)"). Los
    // perfiles que no se pueden recalcular -- las 240 cédulas de prueba de
    // Aval no tienen crudo -- lo siguen trayendo: se limpia acá.
    condicionesDeLaSegmentacion:
      typeof f.motivoSegmento === "string"
        ? f.motivoSegmento.replace(" (basesInternas)", "").replace(/ \(estado: [^)]*\)/, "")
        : null,
    informacionIess: f.corteIessUsado ?? null,
    // Un jubilado que dejó de aportar no está "sin información actual":
    // se jubiló (fuentes-v9, dejoDeAparecerEnElIess).
    sinInformacionActualEnElIess: dejoDeAparecerEnElIess(f),
    mesesSinAportar: dejoDeAparecerEnElIess(f) ? f.cortesDesdeLaDesvinculacion ?? null : null,
    ingresoReportadoIess: monto,
    esIngresoMinimoSbu: esIngresoMinimoSbu(monto, f.corteIessUsado as string | null),
    aportes: fuentes
      .filter((x) => x.evidencia !== "indirecta")
      .map((x) => ({
        tipo: x.tipo ?? null,
        declaradoPor: quienDeclara(x, perfil),
        empleador: x.empleador ?? null,
        montoMensual: x.montoMensualReportado ?? null,
      })),
    otrasFuentesSinMonto: fuentes
      .filter((x) => x.evidencia === "indirecta" && !SIN_MONTO_YA_DICHAS.has(String(x.tipo)))
      .map((x) => x.tipo),
    perfilLaboral: pl
      ? {
          tipo: pl.etiqueta,
          trabajaParaUnTercero: pl.dependencia,
          tieneActividadPropia: pl.actividadPropia,
          tieneEmpleados: pl.empleador,
          rucActivoDesde: pl.rucActivoDesde,
          aportaSinRucActivo: pl.aporteVoluntarioSinRuc,
          actividadPropiaEsLaPrincipal: pl.actividadPropiaPrincipal,
          registraJubilacion: pl.jubilacion,
        }
      : null,
    tamanoDelNegocio: tamanoDelNegocio(perfil),
    indiciosIngresoMayor: indiciosDeIngresoMayor(f).map((i) => i.detalle),
    // Sin `detalle` (perfiles anteriores a fuentes-v4) no se sabe: null, no
    // ceros.
    estabilidad: d
      ? {
          // undefined: el perfil es anterior a fuentes-v5 y no la calculó.
          // null: nunca trabajó con un empleador ni por cuenta propia con
          // RUC activo según el IESS.
          continuidadLaboral:
            co === undefined
              ? null
              : co === null
                ? { vigente: false, meses: 0 }
                : {
                    vigente: co.vigente,
                    meses: co.meses,
                    desde: co.desde,
                    hasta: co.hasta,
                    empleadores: co.empleadores,
                    mesesPorCuentaPropiaConRuc: co.mesesCuentaPropiaConRuc ?? null,
                  },
          mesesConAporteUltimos12: d.mesesConAporteUltimos12 ?? null,
          promedioReportado6Meses: d.promedioUltimos6 ?? null,
          variacionContraHaceUnAnioPct: monto && haceUnAnio ? Math.round(((monto - haceUnAnio) / haceUnAnio) * 100) : null,
        }
      : null,
    documentosDeConfirmacion: Array.isArray(f.paraConfirmar) ? f.paraConfirmar : [],
  };
}

const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Idempotente: un tipo que ya viene legible (estructura-v11) queda igual.
const tiposLegibles = (tipos: unknown[]): string[] =>
  [...new Set(tipos.map((t) => tipoDeDemandaLegible(t)).filter((t): t is string => Boolean(t)))];
const aCentavos = (n: number): number => Math.round(n * 100) / 100;

// La deuda de la persona sumada en todo el sistema (desde marco-v24).
// Hasta v23 el modelo recibía cada fuente por separado y presentó $258.798
// de bancos y Diners como "la cartera vigente" de 1715532469, sin los
// $84.778 de cooperativas. Lo garantizado va aparte: no es deuda propia.
// La cuota conocida es sólo la de cooperativas: los bancos no la informan.
// Se calcula DESPUÉS de ocultar los campos deshabilitados: un campo
// apagado no puede volver a entrar sumado acá.
export function endeudamientoDelPerfilDelModelo(perfil: AnyRecord): AnyRecord | null {
  const b = (perfil.comportamientoBancario ?? null) as AnyRecord | null;
  const c = (perfil.comportamientoCooperativas ?? null) as AnyRecord | null;
  if (!b && !c) return null;
  // Perfiles anteriores a estructura-v8 no traen deudaEnAtraso: lo único
  // que había era el saldo en mora.
  const atrasoBancos = typeof b?.deudaEnAtraso === "number" ? b.deudaEnAtraso : numero(b?.saldoEnMoraBuroCredito);
  const bancos = numero(b?.saldoTotalVigente) + atrasoBancos;
  const cooperativas = numero(c?.saldoTotal);
  const retail = numero(b?.totalDeudaRetail);
  return {
    deudaPropiaTotal: aCentavos(bancos + cooperativas + retail),
    deudaPropiaBancos: aCentavos(bancos),
    deudaPropiaCooperativas: aCentavos(cooperativas),
    deudaPropiaRetail: aCentavos(retail),
    deudaEnAtrasoTotal: aCentavos(atrasoBancos + numero(c?.saldoEnMora) + numero(b?.valorVencidoRetail)),
    deudaComoGaranteOCodeudor: typeof b?.deudaComoGaranteOCodeudor === "number" ? b.deudaComoGaranteOCodeudor : null,
    cuotaMensualConocida: typeof c?.cuotaMensualTotal === "number" ? c.cuotaMensualTotal : null,
    cuotaMensualConocidaIncluye: "sólo cooperativas: los bancos no informan la cuota",
  };
}

// El perfil del modelo entero. `camposDeshabilitados` son "grupo.campo"
// de standard_profile_field_config: se ponen en null, no se borran, para
// que el modelo sepa que el campo existe y no se le dio.
export function armarPerfilDelModelo(perfil: AnyRecord, camposDeshabilitados: Set<string> = new Set()): AnyRecord {
  const copia = JSON.parse(JSON.stringify(perfil ?? {})) as Record<string, unknown>;
  copia.fuentesIngreso = ingresosDelPerfilDelModelo(perfil);
  const ocultar = (destino: Record<string, unknown>) => {
    for (const clave of camposDeshabilitados) {
      const [grupo, campo] = clave.split(".");
      const g = destino[grupo] as AnyRecord | null | undefined;
      if (g && typeof g === "object" && campo in g) g[campo] = null;
    }
  };
  ocultar(copia);
  // Montos a centavos. Desde estructura-v8 se guardan redondeados, pero un
  // perfil anterior puede traer 50394.899999999994 (sumas en coma
  // flotante), y el modelo copia el número tal cual. En estos grupos todo
  // número con decimales es dinero.
  for (const grupo of ["comportamientoBancario", "comportamientoCooperativas", "riesgoJudicialCivil"]) {
    const g = copia[grupo] as AnyRecord | undefined;
    if (!g || typeof g !== "object") continue;
    for (const [campo, valor] of Object.entries(g)) {
      if (typeof valor === "number" && !Number.isInteger(valor)) g[campo] = aCentavos(valor);
    }
  }
  // numeroCreditosFormales son préstamos IESS/BIESS, no operaciones del
  // buró: con el nombre viejo el modelo sumó 6 préstamos del BIESS a 6
  // operaciones del buró ("6 operaciones formales", 1308725470). El
  // nombre guardado queda, como pisoIngresoMensualReportado.
  const bancario = copia.comportamientoBancario as AnyRecord | undefined;
  if (bancario && "numeroCreditosFormales" in bancario) {
    bancario.numeroPrestamosIessBiess = bancario.numeroCreditosFormales;
    delete bancario.numeroCreditosFormales;
  }
  copia.endeudamiento = endeudamientoDelPerfilDelModelo(copia);
  // Las demandas (desde marco-v26): de las civiles, cuántas hay de cada
  // categoría (demandas.ts) en lugar de 615 textos libres con artículos del
  // COIP, que el modelo repetía tal cual y contaba todos como "demandas
  // civiles" -- también las investigaciones archivadas y los trámites. Los
  // tipos de cobro siguen, legibles. Un perfil anterior a estructura-v11 no
  // trae categorías: se le limpian los tipos.
  const civil = copia.riesgoJudicialCivil as AnyRecord | null | undefined;
  if (civil && typeof civil === "object") {
    if (Array.isArray(civil.demandasPorCategoria)) {
      civil.demandasPorCategoria = Object.fromEntries(
        (civil.demandasPorCategoria as AnyRecord[]).map((g) => [String(g.categoria), g.cantidad]),
      );
      delete civil.tiposDemandasComoDemandado;
    } else if (Array.isArray(civil.tiposDemandasComoDemandado)) {
      civil.tiposDemandasComoDemandado = tiposLegibles(civil.tiposDemandasComoDemandado);
    }
  }
  const cobro = copia.riesgoJudicialCrediticio as AnyRecord | null | undefined;
  if (cobro && typeof cobro === "object" && Array.isArray(cobro.tiposDemandasComoDemandado)) {
    cobro.tiposDemandasComoDemandado = tiposLegibles(cobro.tiposDemandasComoDemandado);
  }
  // Los bloques nuevos también se pueden apagar campo por campo.
  ocultar(copia);
  // La disponibilidad va PRIMERO (el modelo tiene que leerla antes que los
  // datos) y reemplaza a metaConsulta, que nombraba fuentes.
  delete copia.metaConsulta;
  return { disponibilidad: disponibilidadPorTema(perfil), ...copia };
}

// El mensaje completo que recibe el modelo. Lo usan el análisis
// (llm-scoring.ts) y el backtest: el mismo armado en los dos.
export function mensajeParaElModelo(
  perfil: AnyRecord,
  hallazgosControlBloqueo: unknown[] | null | undefined,
  camposDeshabilitados: Set<string> = new Set(),
): { perfilDelModelo: AnyRecord; hallazgosControlBloqueo: unknown[] } {
  return {
    perfilDelModelo: armarPerfilDelModelo(perfil, camposDeshabilitados),
    // Ya resueltos de forma determinística: el modelo no los recalcula.
    hallazgosControlBloqueo: hallazgosControlBloqueo ?? [],
  };
}
