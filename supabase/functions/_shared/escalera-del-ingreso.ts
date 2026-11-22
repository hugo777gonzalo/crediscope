// La escalera de evidencia del ingreso (docs/escalera-del-ingreso.md, F10 de la ola 3):
// qué ingreso prueba cada fuente de la persona y con qué regla, del peldaño más fuerte al
// más débil. Función pura y sin efectos: lee el perfil estandarizado como lo hace
// `datosDeCapacidad()` (paso 0 del diseño) y NO está conectada a nada: la capacidad de hoy,
// el simulador, la solicitud y el perfil del modelo siguen como estaban.
//
// POR QUÉ ASÍ
//
// - Los peldaños NO se suman. Cada uno es otra lectura del mismo ingreso total, no una parte:
//   dentro de un peldaño, dos montos de la misma naturaleza (dos empleadores que reportan al
//   IESS) sí se suman; entre peldaños, nunca. La capacidad la mide `evaluarEscalera()`
//   (capacidad-de-pago.ts) con cada uno por separado.
// - La cota por cuotas (3a) es un MÍNIMO demostrado y no crea espacio: con ingreso = cuotas / 0,75
//   la carga actual ya es 75% y ninguna cuota nueva entra con una carga máxima de 40%. Sirve para
//   probar que el ingreso es mayor que el del IESS, para contrastar lo declarado y, más adelante,
//   para el reemplazo de cuota del estándar.
// - El aporte propio sobre el Ingreso Mínimo SBU vale por el SBU del año, no por lo que dice el
//   aporte, y ya no se suma al sueldo (decisión D3 del negocio, 2026-11-18): lo elige la persona,
//   no es un tercero. Para quien tiene sueldo y además aporta aparte, la capacidad baja contra la
//   de hoy; `scripts/medir-escalera.mjs` cuenta a cuántos.
// - El Ingreso declarado deja de reemplazar al sueldo del IESS (D4): es el peldaño 5 y sólo
//   sostiene si no hay un peldaño 1 ni 2 con monto.
// - Sin la fuente de los aportes no hay peldaño vacío: hay `no_medido` («no hay» no es «no se
//   pudo ver», la misma regla del perfil incompleto).
// - Todo lo que sigue sin medir va como PROPUESTA en `PARAMETROS_DE_LA_ESCALERA`: los umbrales
//   salen de aprobados que ya pasaron un filtro de ingreso (docs/escalera-del-ingreso.md, arriba).
//
// Los nombres de pantalla los decide el negocio: acá no hay textos para el analista, sólo claves
// y las frases de la sección 3.2 (propuesta) que arma `evaluarEscalera()`.

import { camposSinDato, conLosValoresDeAntes } from "./campos-sin-dato.ts";
import { type DatosDeCapacidad, PARAMETROS_CAPACIDAD, textoUsd } from "./capacidad-de-pago.ts";
import { baseImponibleDesdeRenta } from "./base-imponible-desde-renta.ts";
import { MINIMO_PARA_ROTULAR_COMO_ESTIMADO, type RespuestaDeEstimacion } from "./estimacion-de-ingreso.ts";
import { esIngresoMinimoSbu, IMPUESTO_MINIMO_PARA_INDICIO, sbuDelAnio } from "./fuentes-ingreso.ts";

// v1 (F10, 2026-11-22): peldaños 1, 3a, 3c y 5; el 2, el 4 y el 6 quedan sin medir hasta F11 y los
// pasos 6 y 8 del diseño.
export const ESCALERA_VERSION = "escalera-v1";

// ---------------------------------------------------------------- parámetros (propuesta)

export interface ParametrosDeLaEscalera {
  /** c de la cota por cuotas: ingreso >= cuotas al día / c. Medido 0,61 cubre 88,6% y 0,75 cubre 94,5% (D5, abierta, provisional). */
  cargaParaLaCotaPorCuotas: number;
  /** El declarado es coherente si no pasa de tantas veces el mayor monto de los peldaños 1 a 4. */
  declaradoCoherenteHastaVeces: number;
  /** 3b: el impuesto a la renta causado tiene que pasar de esto (USD) para dar una cota; debajo está la cuota fija del negocio popular. Propuesta sin medir (D9). */
  impuestoMinimoParaLaCota: number;
  /** 3b: años fiscales hacia atrás desde el año del corte del IESS (D9). */
  aniosFiscalesDeAntiguedad: number;
  /**
   * 3b con un contribuyente RIMPE (sólo con buró, que trae la clase). `true` (propuesta): se despeja con la tabla general y la base
   * queda POR DEBAJO del ingreso, así que sigue siendo cota (el impuesto del emprendedor es 1% a 2% del bruto, menor que el de la
   * tabla general para el mismo ingreso; la cuota fija del negocio popular, USD 60 o menos, no pasa el umbral). `false`: el RIMPE no da cota,
   * como dice `baseImponibleDesdeRenta()`.
   */
  rentaDelRimpeEsCota: boolean;
}

export const PARAMETROS_DE_LA_ESCALERA: ParametrosDeLaEscalera = {
  cargaParaLaCotaPorCuotas: 0.75,
  declaradoCoherenteHastaVeces: 1.5,
  impuestoMinimoParaLaCota: IMPUESTO_MINIMO_PARA_INDICIO,
  aniosFiscalesDeAntiguedad: 2,
  rentaDelRimpeEsCota: true,
};

// ---------------------------------------------------------------- tipos (sección 2 del diseño)

export type Peldano =
  | "verificado_por_un_tercero" // 1
  | "verificado_con_documento" // 2
  | "cota_por_credito_otorgado" // 3
  | "minimo_certificado" // 4
  | "declarado" // 5
  | "referencia_del_tipo_de_persona"; // 6

export type EstadoDelPeldano =
  | "con_monto"
  | "sin_monto" // la fuente confirma la fuente de ingreso pero no el monto (pensión), o no hay nada que contar
  | "no_aplica" // no corresponde a este tipo de persona
  | "no_medido"; // la fuente no contestó o no está construida: no es «no hay»

export type TipoDePersona =
  | "dependiente"
  | "dependiente_con_ingreso_extra"
  | "independiente_formal"
  | "independiente_semiformal"
  | "independiente_poco_formal"
  | "independiente_ruc_activo_no_obligado" // sin buró no se separa semiformal de poco formal
  | "rentista"
  | "pensionista"
  | "informal"
  | "sin_clasificar";

export type ClaveDeComponente =
  | "sueldo_iess"
  | "documento"
  | "cuotas_al_dia"
  | "impuesto_a_la_renta"
  | "aporte_propio"
  | "cupo_de_tarjetas"
  | "predictor"
  | "declarado"
  | "referencia";

export interface ComponenteDelPeldano {
  clave: ClaveDeComponente;
  montoMensual: number;
  /** Cómo se llegó al monto: «sueldo_neto_del_aporte_personal», «cuotas_al_dia/0.75», «sbu_del_anio»... */
  regla: string;
  creaEspacio: boolean;
  /** Corte del IESS, año fiscal o fecha del documento. */
  aFecha: string | null;
  /** Códigos de la capa de hechos que lo sostienen (todavía vacío: el adaptador lee el perfil). */
  hechos: string[];
  avisos: string[];
}

export interface PeldanoDelIngreso {
  numero: 1 | 2 | 3 | 4 | 5 | 6;
  peldano: Peldano;
  estado: EstadoDelPeldano;
  /** Con estado distinto de con_monto: por qué. Con monto en el 3, los avisos de lo que no se armó (la cota por cuotas con mora o sin medir). */
  motivo: string | null;
  /** 3 y 4: un mínimo, no el ingreso. */
  esCota: boolean;
  /** Lo que dice la evidencia (bruto; en el 3, el máximo de las cotas). */
  montoMensual: number | null;
  /** En el 3, el máximo de las cotas que crean espacio; en el resto, el monto. */
  montoQueCreaEspacio: number | null;
  /** Sólo en el 1. */
  aportePersonal: number;
  /** montoQueCreaEspacio menos el aporte personal. */
  ingresoNeto: number | null;
  /** Sólo en el 5: si lo declarado se puede comparar con la evidencia más fuerte (0,7 con el estándar) o queda sin respaldo. */
  coherencia?: "coherente" | "sin_respaldo";
  componentes: ComponenteDelPeldano[];
}

export interface DiferenciaDelIngreso {
  clave:
    | "declarado_supera_lo_verificado"
    | "declarado_incoherente" // pasa de 1,5 veces el mayor de 1 a 4
    | "declarado_menor_que_la_cota"
    | "cota_supera_lo_verificado"; // la cota prueba más que el IESS o el aporte propio
  detalle: string;
  montos: Record<string, number>;
}

/** En el perfil: la evidencia de la persona, sin solicitud ni estándar. */
export interface IngresoDelPerfil {
  version: typeof ESCALERA_VERSION;
  tipoDePersona: TipoDePersona;
  conBuro: boolean;
  /** Siempre los seis, en orden. */
  peldanos: PeldanoDelIngreso[];
  /** Para el reemplazo de cuota del estándar. Queda null: el perfil no guarda la cuota de cada operación. */
  mayorCuotaAlDia: number | null;
  diferencias: DiferenciaDelIngreso[];
}

export type VeredictoDelPeldano = "alcanza" | "justo" | "extendida" | "no_alcanza" | "no_sostiene";

export interface CapacidadDelPeldano {
  numero: 1 | 2 | 3 | 4 | 5;
  peldano: Peldano;
  fraccionAceptada: number;
  /** ingresoNeto × fracción, en dólares. null: el peldaño no tiene con qué crear espacio. */
  ingresoAceptado: number | null;
  veredicto: VeredictoDelPeldano;
  cargaConElCredito: number | null;
  cuotaMaximaAdmisible: number | null;
  montoMaximoAlPlazo: number | null;
  /** El 2 calculado con lo declarado (o el mínimo certificado) como si se documentara. */
  hipotetico: boolean;
}

export interface OfertaDeLaEscalera {
  /** El peldaño con que se calcula: el que sostiene o, si ninguno alcanza, el más fuerte con monto. */
  peldano: Peldano;
  ingresoAceptado: number;
  /** La cuota más alta que entra, en dólares. */
  cuotaTope: number;
  /** El monto más alto que cabe en la cuota tope al plazo pedido. */
  montoMaximoAlPlazo: number | null;
  /** El plazo más corto, dentro de los límites del producto, con que el monto PEDIDO cabe en la cuota tope. null: ni al plazo máximo. */
  plazoMinimoMeses: number | null;
}

export interface SensibilidadDelIngreso {
  /** 0,10 y 0,20: cuánto menos ingreso. */
  menosIngreso: number;
  ingresoAceptado: number;
  veredicto: VeredictoDelPeldano;
  cargaConElCredito: number | null;
  cuotaMaximaAdmisible: number;
  montoMaximoAlPlazo: number | null;
}

/** Escenario informativo (negocio, 2026-11-22): nunca sostiene el cálculo ni cambia el veredicto. */
export interface CapacidadMaximaInformativa {
  informativa: true;
  /** El peldaño con el mayor ingreso (el 3 cuenta por lo que prueba, aunque no cree espacio). */
  peldano: Peldano;
  componente: ClaveDeComponente;
  /** El mayor ingreso entre los peldaños con monto, al 100%, sin fracción del estándar. */
  ingreso: number;
  veredicto: "alcanza" | "justo" | "no_alcanza";
  cargaConElCredito: number | null;
  cuotaMaximaAdmisible: number;
  montoMaximoAlPlazo: number | null;
  /** Cuánto sube el monto máximo contra el del peldaño que sostiene (o el de la oferta). null sin con qué comparar. */
  mejoraDelMontoMaximo: number | null;
  avisos: string[];
}

export interface IngresoDeLaRespuesta {
  version: typeof ESCALERA_VERSION;
  tipoDePersona: TipoDePersona;
  conBuro: boolean;
  sostieneElCalculo: {
    numero: 1 | 2 | 3 | 4 | 5;
    peldano: Peldano;
    ingresoAceptado: number;
    veredicto: "alcanza" | "justo" | "extendida";
  } | null;
  /** Los peldaños con monto, en orden, y al final el 2 hipotético si hay mejora. */
  escalera: CapacidadDelPeldano[];
  /** (cuotas actuales + cuota nueva) / carga máxima. */
  ingresoNecesario: number | null;
  mejora: {
    peldano: Peldano;
    evidencia: string;
    montoMaximoAlPlazo: number | null;
  } | null;
  explicacion: string;
  referencia: { tipoDePersona: TipoDePersona; valorCentral: number; rotulo: string } | null;
  diferencias: DiferenciaDelIngreso[];
  oferta: OfertaDeLaEscalera | null;
  sensibilidad: SensibilidadDelIngreso[];
  capacidadMaxima: CapacidadMaximaInformativa | null;
}

// ---------------------------------------------------------------- lectura del perfil

type AnyRecord = Record<string, unknown>;
const comoObjeto = (v: unknown): AnyRecord | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const centavos = (n: number) => Math.round(n * 100);
const dolares = (c: number) => c / 100;

export interface OpcionesDelIngreso {
  /** El Ingreso declarado de la solicitud, sin verificar. null o sin decir: la persona no declaró nada. */
  ingresoDeclarado?: number | null;
  /**
   * La respuesta de `armarEstimacion()` de la persona (F11): de ahí sale el peldaño 4 (el mínimo certificado) o, si no pasa de USD 1.000,
   * el 6. Sin decirla, el 4 queda `no_medido` («predictor sin conectar»).
   */
  estimacion?: RespuestaDeEstimacion | null;
  /** La estructura de Equifax vigente: con ella se separan semiformal y poco formal. */
  estructuraEquifax?: AnyRecord | null;
  parametros?: Partial<ParametrosDeLaEscalera>;
  /** El aporte personal al IESS; por omisión el de la capacidad de pago. */
  aportePersonalIess?: number;
}

const SEGMENTOS_DE_SUELDO = new Set(["publico", "diplomatico", "dependiente_privado", "empleo_domestico"]);
const SEGMENTOS_DE_PENSION = new Set(["jubilado", "jubilado_con_ingreso_adicional"]);

/** El tipo de persona con lo que trae Proveedor_Info_1 (y, con buró, la clase de contribuyente). Propuesta: ver la sección 4 del diseño. */
export function tipoDePersona(perfilGuardado: AnyRecord | null, conBuro: boolean, estructuraEquifax: AnyRecord | null = null): TipoDePersona {
  const p = conLosValoresDeAntes(perfilGuardado);
  const fuentes = comoObjeto(p?.fuentesIngreso);
  const segmento = typeof fuentes?.segmento === "string" ? fuentes.segmento : null;
  const laboral = comoObjeto(p?.laboral);
  const rucActivo = laboral?.tieneRucActivo === true;
  const obligado = laboral?.obligadoALlevarContabilidadRuc === true;
  const hayAportePropio = (Array.isArray(fuentes?.fuentes) ? (fuentes!.fuentes as unknown[]) : []).some((x) => {
    const f = comoObjeto(x);
    return f !== null && f.vigenteAlCorte !== false && (f.evidencia === "autodeclarada_sobre_minimo" || f.evidencia === "autodeclarada_en_minimo");
  });
  const nomina = (Array.isArray(fuentes?.senalesDeEscala) ? (fuentes!.senalesDeEscala as unknown[]) : [])
    .map(comoObjeto)
    .find((s) => s?.senal === "nómina que paga")?.valor;

  // Con los aportes sin respuesta (estructura-v31) el valor de antes es el segmento de las otras fuentes: no es un juicio sobre la persona.
  if (camposSinDato(perfilGuardado?.fuentesIngreso).includes("segmento")) return "sin_clasificar";
  if (segmento === null || segmento === "sin_datos" || segmento === "no_clasificado") return "sin_clasificar";
  if (SEGMENTOS_DE_SUELDO.has(segmento)) {
    return rucActivo || hayAportePropio || (numero(nomina) ?? 0) > 0 ? "dependiente_con_ingreso_extra" : "dependiente";
  }
  if (segmento === "ingresos_mixtos") return "dependiente_con_ingreso_extra";
  if (SEGMENTOS_DE_PENSION.has(segmento)) return "pensionista";
  // Independiente, agrícola, trabajo del hogar o informal: con RUC activo se mira la escala; sin RUC, informal.
  if (!rucActivo) return "informal";
  if (obligado) return "independiente_formal";
  if (conBuro) {
    const clase = comoObjeto(estructuraEquifax?.actividadEconomica)?.claseDeContribuyente;
    if (typeof clase === "string" && clase.trim() !== "") return clase.trim().toUpperCase() === "RIMPE" ? "independiente_poco_formal" : "independiente_semiformal";
  }
  return "independiente_ruc_activo_no_obligado";
}

// Mora vigente en lo que se ve. `null`: una fuente de las que cuentan no contestó y no se sabe.
// La cota por cuotas no se arma con mora (la población medida era sin mora), ni con un hueco.
// Con el buró de la institución, bancos, cooperativas y BIESS salen de él; el retail sigue siendo de Proveedor_Info_1.
function moraVigente(perfilGuardado: AnyRecord | null, conBuro: boolean, estructuraEquifax: AnyRecord | null): { hay: boolean | null; motivos: string[] } {
  const crudo = comoObjeto(perfilGuardado);
  const p = conLosValoresDeAntes(perfilGuardado);
  const motivos: string[] = [];
  const mayorQueCero = (g: AnyRecord | null, campos: string[], etiqueta: string) => {
    for (const c of campos) if ((numero(g?.[c]) ?? 0) > 0) { motivos.push(`${etiqueta}.${c}`); return; }
  };
  const verdadero = (g: AnyRecord | null, campos: string[], etiqueta: string) => {
    for (const c of campos) if (g?.[c] === true) { motivos.push(`${etiqueta}.${c}`); return; }
  };
  const bancario = comoObjeto(p?.comportamientoBancario);
  const coop = comoObjeto(p?.comportamientoCooperativas);
  mayorQueCero(bancario, ["deudaEnAtraso", "operacionesEnAtrasoSinMonto", "saldoEnMoraBuroCredito", "saldoNoDevengaIntereses", "diasMoraCreditoIessBiess"], "bancos");
  verdadero(bancario, ["tieneOperacionCastigada", "tieneOperacionConDemanda"], "bancos");
  mayorQueCero(bancario, ["diasMoraMaximaRetail", "valorVencidoRetail"], "retail");
  mayorQueCero(coop, ["diasMoraMaxima", "saldoEnMora"], "cooperativas");
  verdadero(coop, ["tieneOperacionCastigada", "tieneOperacionConDemanda"], "cooperativas");
  if (conBuro && (numero(comoObjeto(estructuraEquifax?.moraActual)?.saldoVencidoUsd) ?? 0) > 0) motivos.push("equifax.saldoVencidoUsd");
  if (motivos.length > 0) return { hay: true, motivos };

  // Sin mora donde se ve; ¿se vio todo? Un campo sin dato (fuente caída) es un hueco, salvo que el buró lo cubra.
  const sinDato = new Set([
    ...camposSinDato(crudo?.comportamientoBancario).map((c) => `bancario.${c}`),
    ...camposSinDato(crudo?.comportamientoCooperativas).map((c) => `coop.${c}`),
  ]);
  const deRetail = ["diasMoraMaximaRetail", "valorVencidoRetail"].map((c) => `bancario.${c}`);
  const quedaSinVer = [...sinDato].some((c) => !conBuro || deRetail.includes(c));
  return quedaSinVer ? { hay: null, motivos: [...sinDato].filter((c) => !conBuro || deRetail.includes(c)) } : { hay: false, motivos: [] };
}

// ---------------------------------------------------------------- los peldaños

function peldanoVacio(numeroDelPeldano: PeldanoDelIngreso["numero"], peldano: Peldano, estado: EstadoDelPeldano, motivo: string | null, esCota = false): PeldanoDelIngreso {
  return { numero: numeroDelPeldano, peldano, estado, motivo, esCota, montoMensual: null, montoQueCreaEspacio: null, aportePersonal: 0, ingresoNeto: null, componentes: [] };
}

/**
 * La evidencia de ingreso de la persona en los seis peldaños. `datos` es `datosDeCapacidad(perfil, estructuraEquifax)`:
 * de ahí salen los sueldos, el aporte propio y las cuotas, para que la escalera y la capacidad de hoy lean lo mismo.
 */
export function armarIngresoDelPerfil(perfilGuardado: AnyRecord | null, datos: DatosDeCapacidad, opciones: OpcionesDelIngreso = {}): IngresoDelPerfil {
  const parametros = { ...PARAMETROS_DE_LA_ESCALERA, ...opciones.parametros };
  const aportePct = opciones.aportePersonalIess ?? PARAMETROS_CAPACIDAD.aportePersonalIess;
  const conBuro = datos.fuenteDeLasCuotas === "equifax";
  const p = conLosValoresDeAntes(perfilGuardado);
  const crudoFuentes = comoObjeto(perfilGuardado?.fuentesIngreso);
  const fuentes = comoObjeto(p?.fuentesIngreso);
  const segmento = typeof fuentes?.segmento === "string" ? fuentes.segmento : null;
  // Los aportes no contestaron (estructura-v31): lo que hoy lee la capacidad es el parcial, y la escalera no lo toma por un «no hay».
  const aportesSinRespuesta = segmento === "sin_datos" || camposSinDato(crudoFuentes).some((c) => c === "fuentes" || c === "segmento");
  const corteDesactualizado = fuentes?.corteDesactualizado === true;
  const tipo = tipoDePersona(perfilGuardado, conBuro, opciones.estructuraEquifax ?? null);
  const hecho = (...a: string[]) => a;

  // ---- 1. Verificado por un tercero: el sueldo reportado al IESS, neto del aporte personal ----
  let p1: PeldanoDelIngreso;
  const sueldos = datos.ingresos.filter((x) => x.tipo === "sueldo");
  if (aportesSinRespuesta) {
    p1 = peldanoVacio(1, "verificado_por_un_tercero", "no_medido", "aportes_sin_respuesta");
  } else if (sueldos.length > 0) {
    // En centavos y sumando partes ya redondeadas, como evaluarCapacidad(): lo que se muestra suma.
    const brutoC = sueldos.reduce((a, x) => a + centavos(x.montoMensual), 0);
    const aporteC = sueldos.reduce((a, x) => a + centavos(x.montoMensual * aportePct), 0);
    p1 = {
      ...peldanoVacio(1, "verificado_por_un_tercero", "con_monto", null),
      montoMensual: dolares(brutoC),
      montoQueCreaEspacio: dolares(brutoC),
      aportePersonal: dolares(aporteC),
      ingresoNeto: dolares(brutoC - aporteC),
      componentes: [{
        clave: "sueldo_iess",
        montoMensual: dolares(brutoC),
        regla: "sueldo_reportado_menos_aporte_personal",
        creaEspacio: true,
        aFecha: datos.corteIess,
        hechos: hecho("ing.reportado.por_tercero"),
        avisos: corteDesactualizado ? ["corte_del_iess_desactualizado"] : [],
      }],
    };
  } else if (SEGMENTOS_DE_PENSION.has(segmento ?? "")) {
    // La fuente confirma la jubilación pero no expone el monto (decisión D7: el comprobante de pensión es el documento del peldaño 2).
    p1 = peldanoVacio(1, "verificado_por_un_tercero", "sin_monto", "pension_sin_monto");
  } else if (segmento !== null && SEGMENTOS_DE_SUELDO.has(segmento)) {
    p1 = peldanoVacio(1, "verificado_por_un_tercero", "sin_monto", "sin_sueldo_vigente");
  } else {
    p1 = peldanoVacio(1, "verificado_por_un_tercero", "no_aplica", "sin_sueldo_vigente");
  }

  // ---- 2. Verificado con documento: todavía no hay dónde anotarlo (paso 8 del diseño, decisión D8) ----
  const p2 = peldanoVacio(2, "verificado_con_documento", "no_medido", "documento_sin_construir");

  // ---- 3. Cota por crédito otorgado: el máximo de las cotas, que no se suman ----
  const componentes3: ComponenteDelPeldano[] = [];
  const avisos3: string[] = [];
  // 3a. Cuotas al día de lo que se ve, sin mora en nada.
  {
    const mora = moraVigente(perfilGuardado, conBuro, opciones.estructuraEquifax ?? null);
    // Sólo lo que la fuente informó o el BIESS por anualidad: una cuota estimada con un porcentaje del saldo no prueba que se pague, y la pensión alimenticia no es un crédito.
    const cuotas = datos.obligaciones.filter((o) => o.origen !== "Función Judicial" && (o.estimada !== true || o.metodoDeEstimacion === "anualidad"));
    const cuotasC = cuotas.reduce((a, o) => a + centavos(o.montoMensual), 0);
    if (mora.hay === true) avisos3.push("con_mora_no_se_arma_la_cota_por_cuotas");
    else if (mora.hay === null) avisos3.push("mora_sin_medir_no_se_arma_la_cota_por_cuotas");
    else if (cuotasC > 0) {
      const avisos: string[] = [];
      if (cuotas.some((o) => o.estimada === true)) avisos.push("cuota_biess_calculada");
      // Sin buró la cuota de bancos y casas comerciales no consta: la cota es más baja y para menos personas.
      if (datos.deudasSinCuota.length > 0 || (datos.fuentesSinConsultar ?? []).length > 0) avisos.push("cuotas_incompletas");
      componentes3.push({
        clave: "cuotas_al_dia",
        montoMensual: dolares(Math.round(cuotasC / parametros.cargaParaLaCotaPorCuotas)),
        regla: `cuotas_al_dia/${parametros.cargaParaLaCotaPorCuotas}`,
        creaEspacio: false,
        aFecha: null,
        hechos: hecho("coop.cuota.mensual"),
        avisos,
      });
    }
  }
  // 3c. Aporte propio al IESS: la base la elige la persona; en el Ingreso Mínimo SBU vale por el SBU del año.
  if (!aportesSinRespuesta) {
    const propios = datos.ingresos.filter((x) => x.tipo === "aporte_propio");
    if (propios.length > 0) {
      const anio = Number(String(datos.corteIess ?? "").slice(0, 4));
      const valorC = propios.reduce((a, x) => a + centavos(x.esIngresoMinimoSbu === true || esIngresoMinimoSbu(x.montoMensual, datos.corteIess) ? sbuDelAnio(Number.isInteger(anio) ? anio : NaN) : x.montoMensual), 0);
      const todosSbu = propios.every((x) => x.esIngresoMinimoSbu === true);
      componentes3.push({
        clave: "aporte_propio",
        montoMensual: dolares(valorC),
        regla: todosSbu ? "sbu_del_anio" : "base_de_aporte",
        creaEspacio: true,
        aFecha: datos.corteIess,
        hechos: hecho("ing.reportado.autodeclarado"),
        avisos: [...(todosSbu ? ["ingreso_minimo_sbu"] : []), ...(corteDesactualizado ? ["corte_del_iess_desactualizado"] : [])],
      });
    }
  }
  // 3b. Impuesto a la renta causado: la base imponible que lo produjo, dividida en 12. Es una cota del ingreso total y crea espacio.
  if (!aportesSinRespuesta) {
    const detalle = comoObjeto(fuentes?.detalle);
    const filas = (Array.isArray(detalle?.impuestoRentaPorAnio) ? detalle!.impuestoRentaPorAnio : []) as AnyRecord[];
    const anioCorte = Number(String(datos.corteIess ?? "").slice(0, 4));
    // Un año puede traer varios formularios (la declaración propia, el 107 del empleador): se toma el mayor, no la suma, porque pueden repetir la misma renta.
    const porAnio = new Map<number, number>();
    for (const r of filas) {
      const anio = Number(r.anio);
      const valor = Math.max(numero(r.causado) ?? 0, numero(r.enRelacionDeDependencia) ?? 0);
      if (Number.isInteger(anio) && valor > (porAnio.get(anio) ?? 0)) porAnio.set(anio, valor);
    }
    const [anio, impuesto] = Number.isFinite(anioCorte)
      ? ([...porAnio.entries()].filter(([a, v]) => v > parametros.impuestoMinimoParaLaCota && a >= anioCorte - parametros.aniosFiscalesDeAntiguedad).sort((x, y) => y[0] - x[0])[0] ?? [])
      : [];
    if (anio !== undefined && impuesto !== undefined) {
      const clase = conBuro ? comoObjeto(opciones.estructuraEquifax?.actividadEconomica)?.claseDeContribuyente : null;
      const esRimpe = typeof clase === "string" && clase.trim().toUpperCase() === "RIMPE";
      const regimen = conBuro && !esRimpe ? "general" : esRimpe && !parametros.rentaDelRimpeEsCota ? "rimpe" : undefined;
      const b = baseImponibleDesdeRenta(impuesto, anio, regimen);
      if (b.estado === "ok" && b.mensualDesde > 0) {
        const avisos: string[] = [];
        if (!b.regimenVerificado) avisos.push(esRimpe ? "regimen_rimpe_base_por_debajo_del_ingreso" : "regimen_sin_verificar");
        if (b.tramoAbierto) avisos.push("tramo_abierto");
        componentes3.push({
          clave: "impuesto_a_la_renta",
          montoMensual: b.mensualDesde,
          regla: "base_imponible_del_impuesto/12",
          creaEspacio: true,
          aFecha: String(anio),
          hechos: hecho("ing.impuesto_renta.por_anio"),
          avisos,
        });
      } else if (b.estado === "no_aplica") avisos3.push("renta_del_rimpe_no_es_cota");
    }
  }
  let p3: PeldanoDelIngreso;
  if (componentes3.length > 0) {
    const maximo = Math.max(...componentes3.map((c) => centavos(c.montoMensual)));
    const creanEspacio = componentes3.filter((c) => c.creaEspacio).map((c) => centavos(c.montoMensual));
    p3 = {
      ...peldanoVacio(3, "cota_por_credito_otorgado", "con_monto", avisos3.length > 0 ? avisos3.join(",") : null, true),
      montoMensual: dolares(maximo),
      montoQueCreaEspacio: creanEspacio.length > 0 ? dolares(Math.max(...creanEspacio)) : null,
      ingresoNeto: creanEspacio.length > 0 ? dolares(Math.max(...creanEspacio)) : null,
      componentes: componentes3,
    };
  } else {
    p3 = peldanoVacio(3, "cota_por_credito_otorgado", aportesSinRespuesta ? "no_medido" : "sin_monto", aportesSinRespuesta ? "aportes_sin_respuesta" : (avisos3[0] ?? "sin_cuotas_ni_aporte_propio"), true);
  }

  // ---- 4. Mínimo certificado: el predictor (F11) ----
  const { p4, p6 } = peldanosDelPredictor(opciones.estimacion);

  // ---- 5. Declarado: coherente si no pasa de 1,5 veces el mayor monto de los peldaños 1 a 4 ----
  const declarado = numero(opciones.ingresoDeclarado);
  const montosDeLaEvidencia = [p1, p2, p3, p4].filter((x) => x.estado === "con_monto" && (x.montoMensual ?? 0) > 0).map((x) => centavos(x.montoMensual as number));
  const mayorDeLaEvidenciaC = montosDeLaEvidencia.length > 0 ? Math.max(...montosDeLaEvidencia) : null;
  let p5: PeldanoDelIngreso;
  if (declarado !== null && declarado > 0) {
    const declaradoC = centavos(declarado);
    const coherente = mayorDeLaEvidenciaC !== null && declaradoC <= Math.round(mayorDeLaEvidenciaC * parametros.declaradoCoherenteHastaVeces);
    p5 = {
      ...peldanoVacio(5, "declarado", "con_monto", null),
      montoMensual: dolares(declaradoC),
      montoQueCreaEspacio: dolares(declaradoC),
      // Lo que dice recibir: no se le descuenta nada.
      ingresoNeto: dolares(declaradoC),
      coherencia: coherente ? "coherente" : "sin_respaldo",
      componentes: [{
        clave: "declarado",
        montoMensual: dolares(declaradoC),
        regla: coherente ? `declarado_hasta_${parametros.declaradoCoherenteHastaVeces}_veces_la_evidencia` : mayorDeLaEvidenciaC === null ? "declarado_sin_con_que_compararlo" : "declarado_por_encima_de_lo_coherente",
        creaEspacio: true,
        aFecha: null,
        hechos: [],
        avisos: ["sin_verificar"],
      }],
    };
  } else {
    p5 = peldanoVacio(5, "declarado", "sin_monto", "no_declarado");
  }

  // ---- diferencias ----
  const diferencias: DiferenciaDelIngreso[] = [];
  const usd = textoUsd;
  // Las cotas que prueban más ingreso que lo verificado: las cuotas al día y la renta (el aporte propio es lo verificado del 3, no una cota contra ella).
  const cotas = componentes3.filter((c) => c.clave === "cuotas_al_dia" || c.clave === "impuesto_a_la_renta");
  const mayorCota = cotas.reduce<ComponenteDelPeldano | null>((a, c) => (a === null || c.montoMensual > a.montoMensual ? c : a), null);
  const cotaPorCuotas = mayorCota?.montoMensual ?? null;
  const queProbaba = mayorCota?.clave === "impuesto_a_la_renta" ? "El impuesto a la renta prueba una base de al menos" : "Las cuotas al día prueban un ingreso de al menos";
  const aportePropio = componentes3.find((c) => c.clave === "aporte_propio")?.montoMensual ?? null;
  const verificadoNeto = p1.estado === "con_monto" ? (p1.ingresoNeto as number) : null;
  const masFuerteQueLaCota = Math.max(verificadoNeto ?? 0, aportePropio ?? 0);
  if (cotaPorCuotas !== null && cotaPorCuotas > masFuerteQueLaCota && masFuerteQueLaCota > 0) {
    diferencias.push({
      clave: "cota_supera_lo_verificado",
      detalle: `${queProbaba} ${usd(cotaPorCuotas)}, más que lo verificado (${usd(masFuerteQueLaCota)}).`,
      montos: { [mayorCota?.clave === "impuesto_a_la_renta" ? "baseDeLaRenta" : "cotaPorCuotas"]: cotaPorCuotas, [verificadoNeto !== null && verificadoNeto >= (aportePropio ?? 0) ? "sueldoNeto" : "aportePropio"]: masFuerteQueLaCota },
    });
  }
  if (p5.estado === "con_monto") {
    const d = p5.montoMensual as number;
    // El declarado contra lo verificado (1 y 2): un declarado mayor se anota, no reemplaza.
    const verificadoBruto = [p1, p2].filter((x) => x.estado === "con_monto").map((x) => x.montoMensual as number);
    if (verificadoBruto.length > 0 && d > Math.max(...verificadoBruto)) {
      diferencias.push({
        clave: "declarado_supera_lo_verificado",
        detalle: `Declara ${usd(d)}, más que lo verificado (${usd(Math.max(...verificadoBruto))}). Manda lo verificado; con un documento que pruebe lo declarado se calcula con él.`,
        montos: { declarado: d, verificado: Math.max(...verificadoBruto) },
      });
    }
    if (p5.coherencia === "sin_respaldo" && mayorDeLaEvidenciaC !== null) {
      diferencias.push({
        clave: "declarado_incoherente",
        detalle: `Declara ${usd(d)}, más de ${parametros.declaradoCoherenteHastaVeces} veces lo que prueba la evidencia (${usd(dolares(mayorDeLaEvidenciaC))}).`,
        montos: { declarado: d, mayorEvidencia: dolares(mayorDeLaEvidenciaC) },
      });
    }
    const cota = p3.estado === "con_monto" ? (p3.montoMensual as number) : null;
    if (cota !== null && d < cota) {
      diferencias.push({
        clave: "declarado_menor_que_la_cota",
        detalle: `Declara ${usd(d)}, menos de lo que prueba lo que ya paga (${usd(cota)}): es prudente o declara sólo una parte.`,
        montos: { declarado: d, cota },
      });
    }
  }

  return {
    version: ESCALERA_VERSION,
    tipoDePersona: tipo,
    conBuro,
    peldanos: [p1, p2, p3, p4, p5, p6],
    mayorCuotaAlDia: null,
    diferencias,
  };
}

// ---------------------------------------------------------------- el predictor (F11): peldaños 4 y 6

const ESTADO_SIN_ESTIMACION: Record<string, EstadoDelPeldano> = {
  ingreso_verificado: "no_aplica", // un dependiente con sueldo: lo verificado manda y no se estima
  jubilado: "no_aplica", // sin la tabla de pensiones no se estima
  dependiente_sin_monto: "no_aplica",
  sin_datos: "no_medido", // la fuente no contestó: no es un juicio sobre la persona
  consulta_incompleta: "no_medido",
};

/**
 * El mínimo certificado como peldaño 4 y, si no distingue a la persona de los solicitantes (USD 1.000 o menos,
 * `MINIMO_PARA_ROTULAR_COMO_ESTIMADO`), como referencia en el 6, que nunca entra a la capacidad ni a la coherencia.
 * `undefined` es «el predictor no se pidió» (F10); `null`, «no hay estimación guardada».
 */
function peldanosDelPredictor(estimacion: RespuestaDeEstimacion | null | undefined): { p4: PeldanoDelIngreso; p6: PeldanoDelIngreso } {
  const p6Vacio = peldanoVacio(6, "referencia_del_tipo_de_persona", "no_medido", "tabla_de_referencia_sin_construir");
  if (estimacion === undefined) return { p4: peldanoVacio(4, "minimo_certificado", "no_medido", "predictor_sin_conectar", true), p6: p6Vacio };
  if (estimacion === null) return { p4: peldanoVacio(4, "minimo_certificado", "no_medido", "sin_estimacion", true), p6: p6Vacio };
  if (!estimacion.estimado.aplica) {
    const motivo = estimacion.estimado.motivo;
    return { p4: peldanoVacio(4, "minimo_certificado", ESTADO_SIN_ESTIMACION[motivo] ?? "no_medido", motivo, true), p6: p6Vacio };
  }
  const monto = estimacion.estimado.minimoCertificado.monto;
  const aFecha = estimacion.consultadoEl.slice(0, 10);
  if (monto > MINIMO_PARA_ROTULAR_COMO_ESTIMADO) {
    return {
      p4: {
        ...peldanoVacio(4, "minimo_certificado", "con_monto", null, true),
        montoMensual: monto,
        montoQueCreaEspacio: monto,
        ingresoNeto: monto,
        componentes: [{
          clave: "predictor",
          montoMensual: monto,
          regla: "minimo_certificado_al_90",
          creaEspacio: true, // si lo acepta el estándar: sin buró 0%, no sostiene (D6)
          aFecha,
          hechos: [],
          avisos: ["estimado", "sin_verificar"],
        }],
      },
      p6: p6Vacio,
    };
  }
  // No pasa de USD 1.000: no distingue a la persona de los solicitantes. Baja al 6 como referencia.
  return {
    p4: peldanoVacio(4, "minimo_certificado", "sin_monto", "minimo_no_pasa_de_1000", true),
    p6: {
      ...peldanoVacio(6, "referencia_del_tipo_de_persona", "con_monto", null),
      montoMensual: monto,
      componentes: [{ clave: "referencia", montoMensual: monto, regla: "minimo_del_predictor_no_pasa_de_1000", creaEspacio: false, aFecha, hechos: [], avisos: ["referencia_de_solicitantes"] }],
    },
  };
}
