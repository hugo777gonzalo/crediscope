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
// cálculo y el veredicto no cambian.
export const CAPACIDAD_VERSION = "capacidad-v4";

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
  if (deudasSinCuota.length > 0) {
    avisos.push("Hay deudas sin cuota informada: lo que paga por mes es más de lo que se cuenta acá.");
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

// De qué fuente de Novadata sale cada tema que pesa en lo que la persona paga
// por mes. Los nombres de las fuentes son los de `metaConsulta`.
const FUENTES_DE_CUOTAS: Array<[fuente: string, nombre: string, conBuro: "lo_cubre_el_buro" | "no_lo_cubre"]> = [
  ["buroCreditoSuper", "buró de bancos", "lo_cubre_el_buro"],
  ["buroCreditoCoop", "cooperativas", "lo_cubre_el_buro"],
  ["retails", "casas comerciales", "no_lo_cubre"],
  ["creditoHipotecario", "préstamos del IESS o BIESS", "no_lo_cubre"],
  ["creditoQuirografario", "préstamos del IESS o BIESS", "no_lo_cubre"],
  ["pensionAlimenticia", "pensiones alimenticias", "no_lo_cubre"],
  ["pensionAlimenticiaNovadata", "pensiones alimenticias", "no_lo_cubre"],
];

export interface DatosDeCapacidad {
  ingresos: IngresoMensual[];
  obligaciones: ObligacionMensual[];
  deudasSinCuota: DeudaSinCuota[];
  /** De dónde salen las cuotas: el buró de la institución o, sin él, Novadata. */
  fuenteDeLasCuotas: "equifax" | "novadata";
  /** El mes del IESS con el que se clasificó el ingreso (yyyy-mm). */
  corteIess: string | null;
  /** Lo que no contestó (error o apagada) y alimenta las cuotas: «no hay» no es «no se pudo ver». */
  fuentesSinConsultar?: string[];
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
  const bancario = comoObjeto(perfil?.comportamientoBancario);
  const cooperativas = comoObjeto(perfil?.comportamientoCooperativas);
  const titular = comoObjeto(estructuraEquifax?.deudaActualTitular);

  if (titular) {
    const SISTEMAS: Array<[string, string]> = [["bancos", "Bancos"], ["cooperativas", "Cooperativas"], ["comercial", "Sector comercial"]];
    for (const [clave, nombre] of SISTEMAS) {
      const s = comoObjeto(titular[clave]);
      const cuota = numero(s?.cuotaMensualUsd);
      if (cuota !== null && cuota > 0) obligaciones.push({ concepto: nombre, montoMensual: cuota, origen: "Equifax" });
      // Con saldo y sin cuota, es una deuda sin cuota informada, no una cuota de
      // cero: la estructura suma 0 cuando Equifax no trae la cuota de la operación.
      else if ((numero(s?.saldoDeudaUsd) ?? 0) > 0) deudasSinCuota.push({ concepto: nombre, saldo: numero(s?.saldoDeudaUsd), origen: "Equifax" });
    }
  } else {
    const cuotaCoop = numero(cooperativas?.cuotaMensualTotal);
    if (cuotaCoop !== null && cuotaCoop > 0) obligaciones.push({ concepto: "Cooperativas", montoMensual: cuotaCoop, origen: "Novadata" });
    // Sin buró, Novadata trae el saldo de los bancos pero no la cuota.
    const saldoBancos = (numero(bancario?.saldoTotalVigente) ?? 0) + (numero(bancario?.deudaEnAtraso) ?? numero(bancario?.saldoEnMoraBuroCredito) ?? 0);
    if (saldoBancos > 0) deudasSinCuota.push({ concepto: "Bancos", saldo: Math.round(saldoBancos * 100) / 100, origen: "Novadata" });
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
  if (retail !== null && retail > 0) deudasSinCuota.push({ concepto: "Casas comerciales", saldo: retail, origen: "Novadata" });
  if (bancario?.tieneCreditoIessBiess === true) deudasSinCuota.push({ concepto: "Préstamo del IESS o BIESS", saldo: null, origen: "Novadata" });

  const pension = numero(comoObjeto(perfil?.riesgoJudicialCivil)?.valorMensualPensiones);
  if (pension !== null && pension > 0) obligaciones.push({ concepto: "Pensión alimenticia que paga", montoMensual: pension, origen: "Función Judicial" });

  return { ingresos, obligaciones, deudasSinCuota, fuenteDeLasCuotas: titular ? "equifax" : "novadata", corteIess, fuentesSinConsultar };
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
