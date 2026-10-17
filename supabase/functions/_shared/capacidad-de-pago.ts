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
// - Una deuda sin cuota informada (las casas comerciales, los bancos sin
//   buró) no se cuenta como cero: se lista aparte y el resultado avisa que la
//   carga real es mayor. Un hueco que se rellena con cero hace que uno
//   subestime su propio problema.
// - El tope de la carga (cuotas sobre ingreso) es un parámetro de cada
//   institución, no una regla del sistema.

import { esIngresoMinimoSbu } from "./fuentes-ingreso.ts";

export const CAPACIDAD_VERSION = "capacidad-v1";

export interface ParametrosCapacidad {
  /** Fracción: 0.40 quiere decir que las cuotas no pasan del 40% del ingreso neto. */
  cargaMaxima: number;
  /** Puntos por debajo del tope desde los que el resultado es «justo». Fracción. */
  margenJusto: number;
  /** Aporte personal del afiliado en relación de dependencia (régimen general del IESS). */
  aportePersonalIess: number;
}

// La carga máxima de 40% es un supuesto de partida, a reemplazar por el de
// cada institución. El aporte personal de 9,45% es el del régimen general.
export const PARAMETROS_CAPACIDAD: ParametrosCapacidad = {
  cargaMaxima: 0.4,
  margenJusto: 0.05,
  aportePersonalIess: 0.0945,
};

export type TipoDeIngreso = "sueldo" | "aporte_propio";

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
}

export interface DeudaSinCuota {
  concepto: string;
  /** null cuando la fuente dice que existe pero no el saldo (préstamo del IESS o BIESS). */
  saldo: number | null;
  origen: string;
}

export interface EntradaDeCapacidad {
  ingresos: IngresoMensual[];
  obligaciones: ObligacionMensual[];
  deudasSinCuota: DeudaSinCuota[];
  /** La cuota del primer mes del crédito pedido (simularCredito). */
  cuotaNueva: number;
  parametros?: Partial<ParametrosCapacidad>;
}

export type Veredicto = "alcanza" | "justo" | "no_alcanza" | "sin_ingreso";

export interface Capacidad {
  version: string;
  veredicto: Veredicto;
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
  /** Cuota máxima menos la cuota pedida: negativo si no alcanza. */
  holgura: number;
  /** Lo que queda del ingreso neto después de todas las cuotas. */
  disponibleDespues: number;
  obligacionesIncompletas: boolean;
  ingresoSoloSbu: boolean;
  avisos: string[];
  parametros: ParametrosCapacidad;
}

const centavos = (n: number) => Math.round(n * 100);
const dolares = (c: number) => c / 100;

export function evaluarCapacidad(e: EntradaDeCapacidad): Capacidad {
  const parametros = { ...PARAMETROS_CAPACIDAD, ...(e.parametros ?? {}) };
  const ingresos = e.ingresos.filter((x) => Number.isFinite(x.montoMensual) && x.montoMensual > 0);

  // Todo en centavos, sumando partes ya redondeadas: lo que se muestra suma.
  const reportadoC = ingresos.reduce((a, x) => a + centavos(x.montoMensual), 0);
  const aporteC = ingresos.filter((x) => x.tipo === "sueldo").reduce((a, x) => a + centavos(x.montoMensual * parametros.aportePersonalIess), 0);
  const netoC = reportadoC - aporteC;
  const obligacionesC = e.obligaciones.reduce((a, x) => a + (Number.isFinite(x.montoMensual) && x.montoMensual > 0 ? centavos(x.montoMensual) : 0), 0);
  const cuotaC = centavos(Math.max(0, e.cuotaNueva));
  const topeC = Math.floor(netoC * parametros.cargaMaxima);
  const cuotaMaximaC = Math.max(0, topeC - obligacionesC);

  const obligacionesIncompletas = e.deudasSinCuota.length > 0;
  const ingresoSoloSbu = ingresos.length > 0 && ingresos.every((x) => x.esIngresoMinimoSbu === true);

  const cargaActual = netoC > 0 ? obligacionesC / netoC : null;
  const cargaConElCredito = netoC > 0 ? (obligacionesC + cuotaC) / netoC : null;

  let veredicto: Veredicto;
  if (netoC <= 0 || cargaConElCredito === null) veredicto = "sin_ingreso";
  else if (cargaConElCredito > parametros.cargaMaxima) veredicto = "no_alcanza";
  else if (cargaConElCredito > parametros.cargaMaxima - parametros.margenJusto) veredicto = "justo";
  else veredicto = "alcanza";

  const avisos: string[] = [];
  if (veredicto === "sin_ingreso") {
    avisos.push("No hay un ingreso reportado al IESS con el que medir la cuota.");
  }
  if (obligacionesIncompletas) {
    avisos.push("Hay deudas sin cuota informada: lo que paga por mes es más de lo que se cuenta acá.");
  }
  if (ingresoSoloSbu) {
    avisos.push("El ingreso es un aporte propio sobre el Salario Básico Unificado: no muestra lo que gana la persona.");
  }

  return {
    version: CAPACIDAD_VERSION,
    veredicto,
    ingresoReportado: dolares(reportadoC),
    aportePersonal: dolares(aporteC),
    ingresoNeto: dolares(netoC),
    obligacionesActuales: dolares(obligacionesC),
    cuotaNueva: dolares(cuotaC),
    cargaActual,
    cargaConElCredito,
    cargaMaxima: parametros.cargaMaxima,
    cuotaMaximaAdmisible: dolares(cuotaMaximaC),
    holgura: dolares(cuotaMaximaC - cuotaC),
    disponibleDespues: dolares(netoC - obligacionesC - cuotaC),
    obligacionesIncompletas,
    ingresoSoloSbu,
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

export interface DatosDeCapacidad {
  ingresos: IngresoMensual[];
  obligaciones: ObligacionMensual[];
  deudasSinCuota: DeudaSinCuota[];
  /** De dónde salen las cuotas: el buró de la institución o, sin él, Novadata. */
  fuenteDeLasCuotas: "equifax" | "novadata";
  /** El mes del IESS con el que se clasificó el ingreso (yyyy-mm). */
  corteIess: string | null;
}

// Arma la entrada de evaluarCapacidad() desde el perfil estandarizado y, si
// la hay, la estructura de Equifax. Con Equifax, las cuotas de bancos,
// cooperativas y sector comercial salen de ahí (la cuota de cada operación
// del titular); lo de codeudor o garante no se cuenta, porque no la paga él
// mientras el deudor pague. Las casas comerciales de Novadata son otras
// empresas (medido el 2026-10-13) y no informan la cuota.
export function datosDeCapacidad(perfil: AnyRecord | null, estructuraEquifax: AnyRecord | null): DatosDeCapacidad {
  const fuentesIngreso = comoObjeto(perfil?.fuentesIngreso);
  const corteIess = typeof fuentesIngreso?.corteIessUsado === "string" ? fuentesIngreso.corteIessUsado : null;
  const ingresos: IngresoMensual[] = [];
  for (const f of (Array.isArray(fuentesIngreso?.fuentes) ? fuentesIngreso.fuentes : []) as AnyRecord[]) {
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
  const bancario = comoObjeto(perfil?.comportamientoBancario);
  const cooperativas = comoObjeto(perfil?.comportamientoCooperativas);
  const titular = comoObjeto(estructuraEquifax?.deudaActualTitular);

  if (titular) {
    const SISTEMAS: Array<[string, string]> = [["bancos", "Bancos"], ["cooperativas", "Cooperativas"], ["comercial", "Sector comercial"]];
    for (const [clave, nombre] of SISTEMAS) {
      const s = comoObjeto(titular[clave]);
      const cuota = numero(s?.cuotaMensualUsd);
      if (cuota !== null && cuota > 0) obligaciones.push({ concepto: nombre, montoMensual: cuota, origen: "Equifax" });
    }
  } else {
    const cuotaCoop = numero(cooperativas?.cuotaMensualTotal);
    if (cuotaCoop !== null && cuotaCoop > 0) obligaciones.push({ concepto: "Cooperativas", montoMensual: cuotaCoop, origen: "Novadata" });
    // Sin buró, Novadata trae el saldo de los bancos pero no la cuota.
    const saldoBancos = (numero(bancario?.saldoTotalVigente) ?? 0) + (numero(bancario?.deudaEnAtraso) ?? numero(bancario?.saldoEnMoraBuroCredito) ?? 0);
    if (saldoBancos > 0) deudasSinCuota.push({ concepto: "Bancos", saldo: Math.round(saldoBancos * 100) / 100, origen: "Novadata" });
  }

  const retail = numero(bancario?.totalDeudaRetail);
  if (retail !== null && retail > 0) deudasSinCuota.push({ concepto: "Casas comerciales", saldo: retail, origen: "Novadata" });
  if (bancario?.tieneCreditoIessBiess === true) deudasSinCuota.push({ concepto: "Préstamo del IESS o BIESS", saldo: null, origen: "Novadata" });

  const pension = numero(comoObjeto(perfil?.riesgoJudicialCivil)?.valorMensualPensiones);
  if (pension !== null && pension > 0) obligaciones.push({ concepto: "Pensión alimenticia que paga", montoMensual: pension, origen: "Función Judicial" });

  return { ingresos, obligaciones, deudasSinCuota, fuenteDeLasCuotas: titular ? "equifax" : "novadata", corteIess };
}
