// Capacidad de pago: si la cuota de un crédito nuevo entra en el ingreso de
// la persona, sumada a lo que ya paga por mes.
//
// Es un cálculo, no una opinión del modelo (docs/plan-demo-ifi.md, 3.5): el
// marco interpretativo dejó afuera la capacidad a propósito y, cuando la lea,
// la va a leer de acá. Función pura: la usan la pantalla, la función
// `capacidad-de-pago` y la API, con los mismos números.
//
// POR QUÉ ASÍ
//
// - El ingreso que entra es el reportado al IESS, nunca uno supuesto («no se
//   especula sobre el ingreso»). Al sueldo de un dependiente se le descuenta
//   el aporte personal al IESS, que la persona no cobra: una institución mide
//   la carga contra el sueldo líquido del rol de pagos. Al aporte propio no:
//   la base la elige el afiliado y no es un sueldo.
// - Una deuda sin cuota informada no se cuenta como cero: se lista aparte y,
//   si tiene saldo, entra con una cuota estimada (FACTOR_CUOTA_ESTIMADA, C1);
//   las casas comerciales de Proveedor_Info_1, que no se pudieron medir, y las
//   que no traen saldo quedan sin contar y el resultado avisa que la carga
//   real es mayor. Un hueco que se rellena con cero hace que uno
//   subestime su propio problema.
// - El tope de la carga (cuotas sobre ingreso) es un parámetro de cada
//   institución, no una regla del sistema.
// - El «Ingreso declarado» (nombre del negocio, 2026-10-17) es lo que la
//   persona que pide el crédito dice que recibe por mes. Cuando lo hay,
//   reemplaza al del IESS en el cálculo (es el total: sumarlo al IESS contaría
//   dos veces el sueldo) y no se le descuenta nada: es lo que dice recibir. No
//   es una estimación: es una declaración, y se rotula como no verificada. Hizo
//   falta porque, con sólo el IESS, 55 de las 62 personas con Equifax ya
//   pagaban más que su ingreso neto (medido el 2026-10-17).

import { esIngresoMinimoSbu } from "./fuentes-ingreso.ts";

// v2 (2026-10-17): el Ingreso declarado. v3 (2026-10-18): el veredicto se
// decide en centavos enteros y las entradas inválidas se dicen o se rechazan.
// v4 (2026-10-21): `cumple`, el sí o no que pide la API para el flujo Plus; el
// cálculo y el veredicto no cambian. v5 (2026-11-18): una deuda con saldo y sin
// cuota informada cuenta con una cuota estimada (decisión C1): el veredicto
// cambia para quien tiene una, y la versión lo dice.
export const CAPACIDAD_VERSION = "capacidad-v5";

export interface ParametrosCapacidad {
  /** Fracción: 0.40 quiere decir que las cuotas no pasan del 40% del ingreso neto. */
  cargaMaxima: number;
  /** Puntos por debajo del tope desde los que el resultado es «justo». Fracción. */
  margenJusto: number;
  /** Aporte personal del afiliado en relación de dependencia (régimen general del IESS). */
  aportePersonalIess: number;
}

// La carga máxima de 40% la confirmó el negocio el 2026-10-17; cada
// institución puede poner la suya. El aporte personal de 9,45% es el del
// régimen general.
export const PARAMETROS_CAPACIDAD: ParametrosCapacidad = {
  cargaMaxima: 0.4,
  margenJusto: 0.05,
  aportePersonalIess: 0.0945,
};

export type TipoDeIngreso = "sueldo" | "aporte_propio" | "declarado";

export interface IngresoMensual {
  concepto: string;
  /** Lo reportado, antes del aporte personal. */
  montoMensual: number;
  tipo: TipoDeIngreso;
  origen: string;
  /** Aporte propio sobre el Salario Básico Unificado: no muestra el ingreso real. */
  esIngresoMinimoSbu?: boolean;
}

export interface ObligacionMensual {
  concepto: string;
  montoMensual: number;
  origen: string;
  /** La cuota no la informa la fuente: la estimamos (ver `metodoDeEstimacion`). */
  estimada?: boolean;
  /** Cómo se estimó: la anualidad con el plazo que queda, o el factor único sobre el saldo (C1). */
  metodoDeEstimacion?: "anualidad" | "factor_saldo";
}

export interface DeudaSinCuota {
  concepto: string;
  /** null cuando la fuente dice que existe pero no el saldo. */
  saldo: number | null;
  origen: string;
  /**
   * La cuota que se estimó para esta deuda con FACTOR_CUOTA_ESTIMADA. Ya entra
   * en `obligaciones` como cuota estimada: acá es sólo para mostrarla, y no se
   * suma otra vez.
   */
  cuotaEstimada?: number;
}

export interface EntradaDeCapacidad {
  ingresos: IngresoMensual[];
  obligaciones: ObligacionMensual[];
  deudasSinCuota: DeudaSinCuota[];
  /** La cuota del primer mes del crédito pedido (simularCredito). */
  cuotaNueva: number;
  /** Fuentes de cuotas que no contestaron: no se sabe si hay deuda ahí. */
  fuentesSinConsultar?: string[];
  parametros?: Partial<ParametrosCapacidad>;
}

export type Veredicto = "alcanza" | "justo" | "no_alcanza" | "sin_ingreso";

export interface Capacidad {
  version: string;
  veredicto: Veredicto;
  /**
   * Si la cuota entra en el ingreso: sí con `alcanza` y `justo` (la cuota está
   * dentro del tope, aunque cerca), no con `no_alcanza`, y null con
   * `sin_ingreso` porque no hay con qué medir y eso no es un rechazo (negocio,
   * 2026-10-21). Es un derivado del veredicto: no agrega criterio, y un `sí`
   * con `obligacionesIncompletas` sigue siendo un sí sobre lo que se pudo contar.
   */
  cumple: boolean | null;
  ingresoReportado: number;
  aportePersonal: number;
  ingresoNeto: number;
  obligacionesActuales: number;
  cuotaNueva: number;
  /** Fracciones del ingreso neto. null sin ingreso. */
  cargaActual: number | null;
  cargaConElCredito: number | null;
  cargaMaxima: number;
  /** Lo que queda para una cuota nueva sin pasar el tope. Nunca negativo. */
  cuotaMaximaAdmisible: number;
  /**
   * Cuota máxima menos la cuota pedida: negativo si no alcanza (también cuando
   * las cuotas actuales ya pasan el tope: incluye ese exceso).
   */
  holgura: number;
  /** Lo que queda del ingreso neto después de todas las cuotas. */
  disponibleDespues: number;
  obligacionesIncompletas: boolean;
  ingresoSoloSbu: boolean;
  /** El ingreso con que se midió es el que declara la persona, sin verificar. */
  ingresoDeclarado: boolean;
  avisos: string[];
  parametros: ParametrosCapacidad;
}

const centavos = (n: number) => Math.round(n * 100);
const dolares = (c: number) => c / 100;
const lista = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

// Un parámetro explícito que no es una fracción entre 0 y 1 es un error de quien
// llama, no algo que adivinar: con undefined o NaN el veredicto salía «alcanza»
// para cualquier cuota, y una carga de 40 (en vez de 0,40) aprobaba todo.
function parametrosValidos(dados: Partial<ParametrosCapacidad> | undefined): ParametrosCapacidad {
  const salida = { ...PARAMETROS_CAPACIDAD };
  for (const clave of ["cargaMaxima", "margenJusto", "aportePersonalIess"] as const) {
    const v = dados?.[clave];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new RangeError(`El parámetro ${clave} es una fracción entre 0 y 1.`);
    }
    salida[clave] = v;
  }
  return salida;
}

export function evaluarCapacidad(e: EntradaDeCapacidad): Capacidad {
  const parametros = parametrosValidos(e.parametros);
  // Una cuota que no es número no se puede tratar como cero: «alcanza» para una
  // cuota desconocida sería el peor resultado posible.
  if (typeof e.cuotaNueva !== "number" || !Number.isFinite(e.cuotaNueva)) {
    throw new RangeError("La cuota nueva tiene que ser un número.");
  }
  const ingresos = lista(e.ingresos).filter((x) => x && Number.isFinite(x.montoMensual) && x.montoMensual > 0);

  // Todo en centavos, sumando partes ya redondeadas: lo que se muestra suma.
  const reportadoC = ingresos.reduce((a, x) => a + centavos(x.montoMensual), 0);
  const aporteC = ingresos.filter((x) => x.tipo === "sueldo").reduce((a, x) => a + centavos(x.montoMensual * parametros.aportePersonalIess), 0);
  const netoC = reportadoC - aporteC;
  // Una cuota sin un monto válido no se cuenta como cero sin decirlo: es un
  // hueco, igual que una deuda sin cuota.
  let obligacionesSinMonto = 0;
  const obligacionesC = lista(e.obligaciones).reduce((a, x) => {
    const monto = x?.montoMensual;
    if (typeof monto !== "number" || !Number.isFinite(monto) || monto < 0) {
      obligacionesSinMonto++;
      return a;
    }
    return a + centavos(monto);
  }, 0);
  const cuotaC = centavos(Math.max(0, e.cuotaNueva));
  // Los topes se comparan en centavos enteros: comparar las fracciones dejaba un
  // veredicto «justo» con una holgura de -0,01 (451 de 400.000 casos aleatorios
  // con 0,35 de carga): 0,40 − 0,05 no da 0,35 exacto en coma flotante.
  const topeDe = (fraccion: number) => Math.floor((netoC * Math.round(fraccion * 1e9)) / 1e9 + 1e-6);
  const topeC = topeDe(parametros.cargaMaxima);
  const justoDesdeC = topeDe(parametros.cargaMaxima - parametros.margenJusto);
  const cuotaMaximaC = Math.max(0, topeC - obligacionesC);

  const fuentesSinConsultar = lista(e.fuentesSinConsultar);
  const deudasSinCuota = lista(e.deudasSinCuota);
  const obligacionesIncompletas = deudasSinCuota.length > 0 || obligacionesSinMonto > 0 || fuentesSinConsultar.length > 0;
  const ingresoSoloSbu = ingresos.length > 0 && ingresos.every((x) => x.esIngresoMinimoSbu === true);
  const ingresoDeclarado = ingresos.some((x) => x.tipo === "declarado");

  const cargaActual = netoC > 0 ? obligacionesC / netoC : null;
  const cargaConElCredito = netoC > 0 ? (obligacionesC + cuotaC) / netoC : null;

  let veredicto: Veredicto;
  if (netoC <= 0) veredicto = "sin_ingreso";
  else if (obligacionesC + cuotaC > topeC) veredicto = "no_alcanza";
  else if (obligacionesC + cuotaC > justoDesdeC) veredicto = "justo";
  else veredicto = "alcanza";

  const avisos: string[] = [];
  if (veredicto === "sin_ingreso") {
    avisos.push("No hay un ingreso reportado al IESS ni declarado con el que medir la cuota.");
  }
  // Una deuda con cuota estimada ya está contada en las obligaciones: no es un hueco.
  if (deudasSinCuota.some((x) => !(typeof x?.cuotaEstimada === "number" && x.cuotaEstimada > 0))) {
    avisos.push("Hay deudas sin cuota informada: lo que paga por mes es más de lo que se cuenta acá.");
  }
  const estimadas = lista(e.obligaciones).filter((x) => x?.estimada === true);
  if (estimadas.some((x) => x.metodoDeEstimacion !== "factor_saldo")) {
    avisos.push("Hay cuotas estimadas desde el saldo y el plazo que queda, no informadas por la fuente: la cuota real puede ser distinta.");
  }
  if (estimadas.some((x) => x.metodoDeEstimacion === "factor_saldo")) {
    avisos.push("Hay deudas sin cuota informada con cuotas estimadas en 6,3% del saldo por mes: la cuota real puede ser distinta.");
  }
  if (obligacionesSinMonto > 0) {
    avisos.push("Hay cuotas sin un monto válido: no se contaron, y lo que paga por mes es más de lo que se cuenta acá.");
  }
  if (fuentesSinConsultar.length > 0) {
    avisos.push(`No se pudo consultar: ${fuentesSinConsultar.join(", ")}. Si tiene cuotas ahí, no están en este cálculo.`);
  }
  if (ingresoDeclarado) {
    avisos.push("El ingreso es el que declara la persona: no está verificado.");
  }
  if (ingresoSoloSbu) {
    avisos.push("El ingreso es un aporte propio sobre el Salario Básico Unificado: no muestra lo que gana la persona.");
  }

  return {
    version: CAPACIDAD_VERSION,
    veredicto,
    cumple: veredicto === "sin_ingreso" ? null : veredicto !== "no_alcanza",
    ingresoReportado: dolares(reportadoC),
    aportePersonal: dolares(aporteC),
    ingresoNeto: dolares(netoC),
    obligacionesActuales: dolares(obligacionesC),
    cuotaNueva: dolares(cuotaC),
    cargaActual,
    cargaConElCredito,
    cargaMaxima: parametros.cargaMaxima,
    cuotaMaximaAdmisible: dolares(cuotaMaximaC),
    holgura: dolares(topeC - obligacionesC - cuotaC),
    disponibleDespues: dolares(netoC - obligacionesC - cuotaC),
    obligacionesIncompletas,
    ingresoSoloSbu,
    ingresoDeclarado,
    avisos,
    parametros,
  };
}

// ---------------------------------------------------------------------------
// De dónde salen el ingreso y las cuotas de una persona
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;
const comoObjeto = (v: unknown): AnyRecord | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Los nombres de pantalla de Fuentes de ingreso que eligió el negocio
// (CLAUDE.md): quién declara el sueldo.
const QUIEN_DECLARA: Record<string, string> = {
  privado: "Empleador privado",
  publico: "Empleador público",
  diplomatico: "Empleador diplomático",
};

// De qué fuente de Proveedor_Info_1 sale cada tema que pesa en lo que la persona paga
// por mes. Los nombres de las fuentes son los de `metaConsulta`.
// Los préstamos del IESS o BIESS los cubre el buró de Equifax, que los trae
// dentro de bancos, y no el de Proveedor_Info_1 (0 de 1.025 personas con préstamo
// del BIESS tienen una fila suya en `buroCreditoSuper`; medido el 2026-11-17).
const FUENTES_DE_CUOTAS: Array<[fuente: string, nombre: string, conBuro: "lo_cubre_el_buro" | "no_lo_cubre"]> = [
  ["buroCreditoSuper", "buró de bancos", "lo_cubre_el_buro"],
  ["buroCreditoCoop", "cooperativas", "lo_cubre_el_buro"],
  ["buroCreditoDiners", "tarjetas Diners", "lo_cubre_el_buro"],
  ["retails", "casas comerciales", "no_lo_cubre"],
  ["creditoHipotecario", "préstamos del IESS o BIESS", "lo_cubre_el_buro"],
  ["creditoQuirografario", "préstamos del IESS o BIESS", "lo_cubre_el_buro"],
  ["pensionAlimenticia", "pensiones alimenticias", "no_lo_cubre"],
  ["pensionAlimenticiaProveedorInfo1", "pensiones alimenticias", "no_lo_cubre"],
];

// Tasa nominal anual del BIESS por tipo de préstamo, para estimar la cuota de
// lo que Proveedor_Info_1 no trae (F12, 2026-11-17). POR CONFIRMAR con el BIESS:
// - quirografario: 6,5% «desde», con reajuste semestral (Vistazo, 2026-06-04,
//   https://www.vistazo.com/actualidad/nacional/2026-06-04-creditos-quirografarios-biess-ecuador-tasas-interes-ED11034527).
//   Los préstamos tomados antes pueden tener una tasa mayor: la cuota sale baja.
// - hipotecario: 2,99% del Credicasa, a 25 a 30 años (Primicias y LEXIS, 2026);
//   Vivienda Premier y Miti-Miti van hasta 4,99%.
// Ningún dato de la fuente dice la tasa de cada préstamo, y la cuota que Equifax
// informa del BIESS se reproduce con una anualidad (98% dentro de ±15%).
export const TASA_ANUAL_BIESS = { quirografario: 0.065, hipotecario: 0.0299 } as const;
export const TASA_BIESS_POR_CONFIRMAR = true;

// Una deuda con saldo y sin cuota informada se estima con el 6,3% del saldo por
// mes: decisión del negocio C1 (2026-11-18), sobre la medición F12 del
// 2026-11-17. En 590 personas con bancos de Proveedor_Info_1 y Equifax, la
// cuota de bancos de Equifax sobre el saldo dio una mediana de 6,28%; con ese
// factor único el error mediano por persona fue de USD 896 contra USD 1.540 de
// contar cero (el 100% del error). Un factor por tramo de saldo bajaba a USD 710,
// pero el negocio eligió el único. Sesgo: la muestra son quienes llegaron a
// evaluación, con más tarjeta y más deuda que el resto. La referencia misma es
// una estimación de Equifax, no la cuota pactada.
export const FACTOR_CUOTA_ESTIMADA = 0.063;

/** null sin saldo: sin saldo no hay con qué estimar, y la deuda queda como hueco. */
export function cuotaPorFactorDeSaldo(saldo: number | null | undefined): number | null {
  if (typeof saldo !== "number" || !Number.isFinite(saldo) || saldo <= 0) return null;
  return Math.round(saldo * FACTOR_CUOTA_ESTIMADA * 100) / 100;
}

// Cuota de una anualidad: saldo, tasa nominal anual y meses que quedan (mínimo 1).
export function cuotaPorAnualidad(saldo: number, tasaAnual: number, meses: number): number {
  const n = Math.max(1, Math.round(meses));
  const i = tasaAnual / 12;
  const cuota = i === 0 ? saldo / n : (saldo * i) / (1 - Math.pow(1 + i, -n));
  return Math.round(cuota * 100) / 100;
}

// Meses que quedan entre `hoy` y la fecha de fin (yyyy-mm-dd), al mes más cercano
// (mínimo 1); null si no hay fecha o ya pasó.
function mesesHasta(fechaFin: unknown, hoy: Date): number | null {
  const m = typeof fechaFin === "string" ? fechaFin.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  if (!m) return null;
  const dias = (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - hoy.getTime()) / 86_400_000;
  return dias > 0 ? Math.max(1, Math.round(dias / 30.4375)) : null;
}

export interface DatosDeCapacidad {
  ingresos: IngresoMensual[];
  obligaciones: ObligacionMensual[];
  deudasSinCuota: DeudaSinCuota[];
  /** De dónde salen las cuotas: el buró de la institución o, sin él, Proveedor_Info_1. */
  fuenteDeLasCuotas: "equifax" | "proveedor_info_1";
  /** El mes del IESS con el que se clasificó el ingreso (yyyy-mm). */
  corteIess: string | null;
  /** Lo que no contestó (error o apagada) y alimenta las cuotas: «no hay» no es «no se pudo ver». */
  fuentesSinConsultar?: string[];
}

// Equifax puede contestar «completed» sin reporte de crédito: 585 de 20.560
// respuestas de AWS, todas de otro tipo de consulta, y ninguna de las 97 de
// CrediScope (2026-10-30). Queda una estructura sin ningún sistema medido, y
// leerla como Equifax daba «alcanza», sin deudas y sin un aviso.
export function elBuroTraeDetalle(estructuraEquifax: AnyRecord | null): boolean {
  const titular = comoObjeto(estructuraEquifax?.deudaActualTitular);
  return ["bancos", "cooperativas", "comercial"].some((sistema) => comoObjeto(titular?.[sistema]) !== null);
}

// Arma la entrada de evaluarCapacidad() desde el perfil estandarizado y, si
// la hay, la estructura de Equifax. Con Equifax, las cuotas de bancos,
// cooperativas y sector comercial salen de ahí (la cuota de cada operación
// del titular); lo de codeudor o garante no se cuenta, porque no la paga él
// mientras el deudor pague. Las casas comerciales de Proveedor_Info_1 son otras
// empresas (medido el 2026-10-13) y no informan la cuota.
export function datosDeCapacidad(perfil: AnyRecord | null, estructuraEquifax: AnyRecord | null, hoy: Date = new Date()): DatosDeCapacidad {
  const fuentesIngreso = comoObjeto(perfil?.fuentesIngreso);
  const corteIess = typeof fuentesIngreso?.corteIessUsado === "string" ? fuentesIngreso.corteIessUsado : null;
  const ingresos: IngresoMensual[] = [];
  for (const crudo of (Array.isArray(fuentesIngreso?.fuentes) ? fuentesIngreso.fuentes : []) as unknown[]) {
    const f = comoObjeto(crudo);
    if (!f) continue;
    const monto = numero(f.montoMensualReportado);
    if (f.vigenteAlCorte === false || monto === null || monto <= 0) continue;
    if (f.evidencia === "reportada_por_tercero") {
      const quien = QUIEN_DECLARA[String(f.naturaleza)] ?? "Otros empleadores";
      ingresos.push({ concepto: `Sueldo reportado al IESS · ${quien}`, montoMensual: monto, tipo: "sueldo", origen: "IESS" });
    } else if (f.evidencia === "autodeclarada_sobre_minimo" || f.evidencia === "autodeclarada_en_minimo") {
      ingresos.push({
        concepto: "Aporte propio al IESS",
        montoMensual: monto,
        tipo: "aporte_propio",
        origen: "IESS",
        esIngresoMinimoSbu: f.evidencia === "autodeclarada_en_minimo" || esIngresoMinimoSbu(monto, corteIess),
      });
    }
  }

  const obligaciones: ObligacionMensual[] = [];
  const deudasSinCuota: DeudaSinCuota[] = [];
  // La deuda sigue en la lista de las que no informan cuota, con la que se le
  // estimó, y la misma cuota entra en las obligaciones con el rótulo de estimada
  // (el mecanismo del BIESS por anualidad): la lista sólo la muestra.
  const sinCuota = (concepto: string, saldo: number | null, origen: string, rotulo = concepto) => {
    const cuotaEstimada = cuotaPorFactorDeSaldo(saldo);
    if (cuotaEstimada === null) {
      deudasSinCuota.push({ concepto, saldo, origen });
      return;
    }
    deudasSinCuota.push({ concepto, saldo, origen, cuotaEstimada });
    obligaciones.push({ concepto: `${rotulo} (cuota estimada)`, montoMensual: cuotaEstimada, origen, estimada: true, metodoDeEstimacion: "factor_saldo" });
  };
  const bancario = comoObjeto(perfil?.comportamientoBancario);
  const cooperativas = comoObjeto(perfil?.comportamientoCooperativas);
  const titular = elBuroTraeDetalle(estructuraEquifax) ? comoObjeto(estructuraEquifax?.deudaActualTitular) : null;

  if (titular) {
    const SISTEMAS: Array<[string, string]> = [["bancos", "Bancos"], ["cooperativas", "Cooperativas"], ["comercial", "Sector comercial"]];
    for (const [clave, nombre] of SISTEMAS) {
      const s = comoObjeto(titular[clave]);
      const cuota = numero(s?.cuotaMensualUsd);
      if (cuota !== null && cuota > 0) obligaciones.push({ concepto: nombre, montoMensual: cuota, origen: "Equifax" });
      // Con saldo y sin cuota, es una deuda sin cuota informada, no una cuota de
      // cero: la estructura suma 0 cuando Equifax no trae la cuota de la operación.
      else if ((numero(s?.saldoDeudaUsd) ?? 0) > 0) sinCuota(nombre, numero(s?.saldoDeudaUsd), "Equifax");
    }
  } else {
    const cuotaCoop = numero(cooperativas?.cuotaMensualTotal);
    if (cuotaCoop !== null && cuotaCoop > 0) obligaciones.push({ concepto: "Cooperativas", montoMensual: cuotaCoop, origen: "Proveedor_Info_1" });
    // Sin buró, Proveedor_Info_1 trae el saldo de los bancos pero no la cuota.
    const saldoBancos = (numero(bancario?.saldoTotalVigente) ?? 0) + (numero(bancario?.deudaEnAtraso) ?? numero(bancario?.saldoEnMoraBuroCredito) ?? 0);
    if (saldoBancos > 0) sinCuota("Bancos", Math.round(saldoBancos * 100) / 100, "Proveedor_Info_1");
  }

  // Una fuente que no contestó (error o apagada) no es una fuente sin deuda: el
  // perfil trae ceros en sus campos y la capacidad los tomaba por un «no debe».
  // Con el buró de la institución, bancos y cooperativas salen de él.
  const noMedidas = new Set(((comoObjeto(perfil?.metaConsulta)?.fuentesNoMedidas ?? []) as unknown[]).filter((x) => typeof x === "string"));
  const fuentesSinConsultar: string[] = [];
  for (const [fuente, nombre, conBuro] of FUENTES_DE_CUOTAS) {
    if (noMedidas.has(fuente) && !(titular && conBuro === "lo_cubre_el_buro")) {
      if (!fuentesSinConsultar.includes(nombre)) fuentesSinConsultar.push(nombre);
    }
  }

  const retail = numero(bancario?.totalDeudaRetail);
  if (retail !== null && retail > 0) deudasSinCuota.push({ concepto: "Casas comerciales", saldo: retail, origen: "Proveedor_Info_1" });
  // Con Equifax el BIESS ya está dentro de la cuota de bancos: agregarlo daría un
  // aviso falso (o, estimado, contaría la deuda dos veces). Sin buró nadie lo
  // cuenta: c-96d58626 se aprobó con 715 sin ver la cuota del BIESS.
  if (!titular && bancario?.tieneCreditoIessBiess === true) {
    const operaciones = (Array.isArray(bancario.operacionesIessBiess) ? bancario.operacionesIessBiess : [])
      .map(comoObjeto)
      .filter((o): o is AnyRecord => o !== null && (numero(o.saldo) ?? 0) > 0);
    // Cada operación con tipo y fecha de fin tiene cuota estimada; el resto se
    // suma a la línea sin cuota, con su saldo. Un perfil anterior a estructura-v22
    // no trae las operaciones: la línea sale con el saldo total, sin cuota.
    let cuotaEstimada = 0;
    let saldoSinCuota = 0;
    let conCuota = 0;
    for (const o of operaciones) {
      const saldo = numero(o.saldo) as number;
      const tasa = o.tipo === "quirografario" || o.tipo === "hipotecario" ? TASA_ANUAL_BIESS[o.tipo] : null;
      const meses = mesesHasta(o.fechaFin, hoy);
      if (tasa === null || meses === null) saldoSinCuota += saldo;
      else {
        cuotaEstimada += cuotaPorAnualidad(saldo, tasa, meses);
        conCuota++;
      }
    }
    if (operaciones.length === 0) {
      sinCuota("Préstamo del IESS o BIESS", numero(bancario.saldoPrestamosIessBiess), "Proveedor_Info_1");
    } else {
      if (conCuota > 0) {
        obligaciones.push({ concepto: "Préstamo del IESS o BIESS (cuota estimada)", montoMensual: Math.round(cuotaEstimada * 100) / 100, origen: "Proveedor_Info_1", estimada: true, metodoDeEstimacion: "anualidad" });
      }
      // Sin tipo o sin fecha de fin no hay anualidad: el factor único.
      if (saldoSinCuota > 0) sinCuota("Préstamo del IESS o BIESS", Math.round(saldoSinCuota * 100) / 100, "Proveedor_Info_1", "Préstamo del IESS o BIESS sin fecha de fin");
    }
  }

  const pension = numero(comoObjeto(perfil?.riesgoJudicialCivil)?.valorMensualPensiones);
  if (pension !== null && pension > 0) obligaciones.push({ concepto: "Pensión alimenticia que paga", montoMensual: pension, origen: "Función Judicial" });

  return { ingresos, obligaciones, deudasSinCuota, fuenteDeLasCuotas: titular ? "equifax" : "proveedor_info_1", corteIess, fuentesSinConsultar };
}

// El Ingreso declarado reemplaza al del IESS (ver el encabezado). Sin un
// monto válido, los datos quedan como estaban.
export function conIngresoDeclarado(datos: DatosDeCapacidad, montoMensual: number | null | undefined): DatosDeCapacidad {
  if (typeof montoMensual !== "number" || !Number.isFinite(montoMensual)) return datos;
  // Menos de medio centavo se redondea a cero: reemplazaría el ingreso del IESS
  // por un ingreso nulo.
  const monto = Math.round(montoMensual * 100) / 100;
  if (monto <= 0) return datos;
  return {
    ...datos,
    ingresos: [{ concepto: "Ingreso declarado", montoMensual: monto, tipo: "declarado", origen: "La persona" }],
  };
}
