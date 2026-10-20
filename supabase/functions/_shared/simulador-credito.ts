// Simulador de crédito de consumo: la cuota mensual con el seguro de
// desgravamen incluido y su tabla de amortización.
//
// Lo usan la pantalla del simulador y, después, la capacidad de pago y la API
// (docs/plan-demo-ifi.md, 3.4): una sola implementación, nunca una copia. Es
// una función pura, sin red ni base, para que se pruebe en Deno y corra igual
// en el navegador.
//
// POR QUÉ ASÍ
//
// - Se calcula en centavos enteros. Con decimales de coma flotante, 36 cuotas
//   redondeadas por separado no suman el monto: el saldo terminaba en
//   -0,000000001 o en 0,01 y la tabla no cerraba.
// - Cada componente se redondea al centavo en su mes, como lo cobra una
//   institución, y la última cuota absorbe la diferencia: el capital pagado
//   suma exactamente el monto.
// - El seguro se calcula sobre el saldo al empezar el mes (lo usual en
//   consumo): con cuota fija, la cuota total baja un poco cada mes. Por eso se
//   informa la del primer mes, que es la más alta y la que mide la capacidad
//   de pago.
// - La cuota (y en el alemán el capital) se vuelve a calcular cada mes sobre
//   el saldo y los meses que quedan. Con una cuota fija redondeada UNA vez, el
//   error de medio centavo se compone todos los meses: medido el 2026-10-18,
//   a 480 meses la última cuota salía hasta USD 153 distinta de la primera, y
//   a 240 o más el crédito terminaba de pagarse antes de tiempo y quedaban
//   filas vacías (con el seguro sobre el monto, cobrando sobre un saldo de
//   cero). El primer mes es idéntico a la fórmula; los demás se corrigen en
//   un centavo cuando hace falta, y la última cuota sigue ajustando.
// - Los parámetros del producto (tasa máxima y mínima, desgravamen) son datos,
//   no código: el negocio fijó el 2026-10-17 un desgravamen de 0,6% "por el
//   momento" y el 2026-10-19 la tasa de consumo: de 0% (financiamiento sin
//   interés) a una Tasa máxima de 15,6%, que cada institución puede bajar.
//   Sin tasa en el pedido se evalúa con la máxima; con una tasa, quien pide
//   está pidiendo una menor. Nunca negativa. Cambiarlos no toca la fórmula.

export const SIMULADOR_VERSION = "simulador-v4";

export type SistemaAmortizacion = "frances" | "aleman";
export type PeriodicidadTasa = "anual" | "mensual";
export type BaseDesgravamen = "saldo" | "monto";

export interface ParametrosDesgravamen {
  /** En porcentaje: 0.6 quiere decir 0,6%. */
  tasaPorcentaje: number;
  /** Si la tasa es anual se divide para 12; si es mensual se usa tal cual. */
  periodicidad: PeriodicidadTasa;
  /** Sobre qué se cobra cada mes: el saldo al empezar el mes o el monto original. */
  base: BaseDesgravamen;
}

export interface LimitesDelCredito {
  /** En dólares. */
  montoMinimo: number;
  montoMaximo: number;
  plazoMinimoMeses: number;
  plazoMaximoMeses: number;
}

export interface ParametrosProducto {
  /** Tasa máxima: la tasa nominal anual más alta del producto, en porcentaje. */
  tasaNominalMaximaPorcentaje: number;
  /** Tasa mínima, en porcentaje: 0 es financiamiento sin interés. */
  tasaNominalMinimaPorcentaje: number;
  /** Lo que se puede pedir: fuera de estos rangos no hay producto. */
  limites: LimitesDelCredito;
  sistema: SistemaAmortizacion;
  desgravamen: ParametrosDesgravamen;
}

// Decisión del negocio del 2026-10-17: el 0,6% es anual (confirmado ese día;
// mensual sería 7,2% al año, más que cualquier seguro de desgravamen de
// consumo). Que se cobre sobre el saldo es lo usual en consumo; cada
// institución puede cobrarlo sobre el monto.
//
// Límites del negocio (2026-10-19): de USD 1.000 a USD 120.000 y de 6 a 120
// meses. Antes el simulador aceptaba de USD 0,01 a 1.000 millones y de 1 a 480
// meses, y con montos y plazos así no hay producto: a USD 1,00 y 480 meses casi
// todos los meses pagaban capital cero.
export const PRODUCTO_CONSUMO: ParametrosProducto = {
  tasaNominalMaximaPorcentaje: 15.6,
  tasaNominalMinimaPorcentaje: 0,
  limites: { montoMinimo: 1000, montoMaximo: 120000, plazoMinimoMeses: 6, plazoMaximoMeses: 120 },
  sistema: "frances",
  desgravamen: { tasaPorcentaje: 0.6, periodicidad: "anual", base: "saldo" },
};

// Un tope técnico, no una política: con montos que no caben en un entero
// exacto (2^53 centavos) el cálculo en centavos deja de ser exacto, y sin tope
// montoMaximoParaCuota() no tiene dónde terminar. Ningún crédito de consumo
// se le acerca.
export const MONTO_MAXIMO = 1_000_000_000;

// Lo que el motor sabe calcular, sin la política del producto: lo usan las
// pruebas del cálculo (1 mes, 480 meses, un centavo) y nadie más. El plazo
// máximo es el de SolicitudDeCredito en el contrato de la API.
export const LIMITES_TECNICOS: LimitesDelCredito = { montoMinimo: 0.01, montoMaximo: MONTO_MAXIMO, plazoMinimoMeses: 1, plazoMaximoMeses: 480 };

// 120000 → "120.000", para los mensajes.
const conMiles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export interface PedidoDeSimulacion {
  monto: number;
  plazoMeses: number;
  /** Sin tasa (o vacía) se evalúa con la Tasa máxima del producto. */
  tasaNominalAnualPorcentaje?: number | null;
  sistema?: SistemaAmortizacion;
  desgravamen?: ParametrosDesgravamen;
  tasaNominalMaximaPorcentaje?: number;
}

// Las condiciones del crédito tal como llegan de afuera (la pantalla, la IFI
// por la API): sólo los campos del pedido, nunca `tasaNominalMaximaPorcentaje`.
// Ese campo existe para que la función pura pueda probarse con otro tope, pero
// la Tasa máxima sale de PRODUCTO_CONSUMO (o de la configuración de la
// institución cuando exista): si se deja pasar del cuerpo, quien lo manda la
// sube a lo que quiera (revisión integral del 2026-10-18). Toda función que
// atiende pedidos externos arma las condiciones con esta.
export function condicionesDelPedidoExterno(v: unknown): PedidoDeSimulacion {
  const c = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return {
    monto: c.monto,
    plazoMeses: c.plazoMeses,
    tasaNominalAnualPorcentaje: c.tasaNominalAnualPorcentaje,
    sistema: c.sistema,
    desgravamen: c.desgravamen,
  } as PedidoDeSimulacion;
}

export interface FilaDeAmortizacion {
  mes: number;
  saldoInicial: number;
  capital: number;
  interes: number;
  seguro: number;
  cuota: number;
  saldoFinal: number;
}

export interface Simulacion {
  version: string;
  monto: number;
  plazoMeses: number;
  tasaNominalAnualPorcentaje: number;
  sistema: SistemaAmortizacion;
  desgravamen: ParametrosDesgravamen;
  /** Fracción: 0.0125 es 1,25% al mes. */
  tasaMensual: number;
  /** Fracción: la tasa efectiva anual equivalente a la nominal, sin el seguro. */
  tasaEfectivaAnual: number;
  /** La cuota total del primer mes: la más alta, y la que mide la capacidad de pago. */
  cuotaPrimerMes: number;
  cuotaUltimoMes: number;
  /** Capital e interés del primer mes, sin el seguro. */
  capitalEInteresPrimerMes: number;
  seguroPrimerMes: number;
  totalInteres: number;
  totalSeguro: number;
  totalPagado: number;
  tabla: FilaDeAmortizacion[];
}

// Cada error de las condiciones lleva un código que no cambia, el campo y el
// mensaje: la pantalla muestra el mensaje y quien llama por la API decide con
// el código (la lista y su significado están en api/openapi.yaml,
// ErrorDeCondiciones).
export type CodigoDeErrorDeCondiciones =
  | "faltan-condiciones"
  | "monto-invalido"
  | "monto-con-mas-de-dos-decimales"
  | "monto-fuera-de-limites"
  | "plazo-fuera-de-limites"
  | "tasa-invalida"
  | "tasa-menor-que-la-minima"
  | "tasa-mayor-que-la-maxima"
  | "tasa-del-producto-invalida"
  | "desgravamen-invalido"
  | "sistema-invalido";

export interface ErrorDeCondiciones {
  codigo: CodigoDeErrorDeCondiciones;
  /** El campo del pedido, como puntero JSON (RFC 6901): "/tasaNominalAnualPorcentaje". */
  campo: string;
  motivo: string;
}

export const SIGNIFICADO_DE_LOS_ERRORES: Record<CodigoDeErrorDeCondiciones, string> = {
  "faltan-condiciones": "No llegaron las condiciones del crédito.",
  "monto-invalido": "El monto no es un número mayor que cero.",
  "monto-con-mas-de-dos-decimales": "El monto tiene más de dos decimales (centavos).",
  "monto-fuera-de-limites": "El monto está fuera del mínimo y el máximo del producto.",
  "plazo-fuera-de-limites": "El plazo no es un número entero de meses dentro del mínimo y el máximo del producto.",
  "tasa-invalida": "La tasa no es un número.",
  "tasa-menor-que-la-minima": "La tasa es menor que la Tasa mínima del producto (0%): nunca negativa.",
  "tasa-mayor-que-la-maxima": "La tasa es mayor que la Tasa máxima del producto.",
  "tasa-del-producto-invalida": "La Tasa máxima o la Tasa mínima configuradas no son válidas (error de configuración, no del pedido).",
  "desgravamen-invalido": "El seguro de desgravamen no trae tasa (no negativa), periodicidad (anual o mensual) y base (saldo o monto).",
  "sistema-invalido": "El sistema de amortización no es «frances» ni «aleman».",
};

export type ResultadoDeSimulacion =
  | { ok: true; simulacion: Simulacion }
  | { ok: false; errores: string[]; detalles: ErrorDeCondiciones[] };

const esNumeroFinito = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// 15.6 → "15,6", para los mensajes.
const conComa = (n: number) => String(n).replace(".", ",");

// Sin tasa, o vacía, es la Tasa máxima del producto (negocio, 2026-10-19).
const sinTasa = (t: unknown) => t === undefined || t === null || t === "";
export function tasaDelPedido(p: PedidoDeSimulacion): number {
  const maxima = p.tasaNominalMaximaPorcentaje ?? PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje;
  return sinTasa(p.tasaNominalAnualPorcentaje) ? maxima : (p.tasaNominalAnualPorcentaje as number);
}

// Los mensajes se muestran tal cual en la pantalla y viajan en la API.
export function validarPedido(p: PedidoDeSimulacion, limites: LimitesDelCredito = PRODUCTO_CONSUMO.limites): string[] {
  return erroresDelPedido(p, limites).map((e) => e.motivo);
}

export function erroresDelPedido(p: PedidoDeSimulacion, limites: LimitesDelCredito = PRODUCTO_CONSUMO.limites): ErrorDeCondiciones[] {
  if (!p || typeof p !== "object") return [{ codigo: "faltan-condiciones", campo: "", motivo: "Faltan las condiciones del crédito: monto y plazo." }];
  const errores: ErrorDeCondiciones[] = [];
  const agregar = (codigo: CodigoDeErrorDeCondiciones, campo: string, motivo: string) => errores.push({ codigo, campo, motivo });
  const maxima = p.tasaNominalMaximaPorcentaje ?? PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje;
  const minima = PRODUCTO_CONSUMO.tasaNominalMinimaPorcentaje;
  if (!esNumeroFinito(p.monto) || p.monto <= 0) agregar("monto-invalido", "/monto", "El monto tiene que ser mayor que cero.");
  else {
    // La tolerancia crece con el monto: a partir de unos 100 millones, el
    // producto monto × 100 de un monto con dos decimales ya no cae en un entero
    // exacto (la separación entre dos números es mayor que 1e-6), y el 8% de
    // los montos válidos se rechazaba como «con más de dos decimales».
    const enCentavos = p.monto * 100;
    if (Math.abs(enCentavos - Math.round(enCentavos)) > Math.max(1e-6, enCentavos * 1e-13)) {
      agregar("monto-con-mas-de-dos-decimales", "/monto", "El monto va en dólares con hasta dos decimales.");
    } else if (p.monto < limites.montoMinimo || p.monto > limites.montoMaximo) {
      agregar("monto-fuera-de-limites", "/monto", `El monto va de ${conMiles(limites.montoMinimo)} a ${conMiles(limites.montoMaximo)} dólares.`);
    }
  }
  if (!Number.isInteger(p.plazoMeses) || p.plazoMeses < limites.plazoMinimoMeses || p.plazoMeses > limites.plazoMaximoMeses) {
    agregar("plazo-fuera-de-limites", "/plazoMeses", `El plazo va en meses enteros, de ${limites.plazoMinimoMeses} a ${limites.plazoMaximoMeses}.`);
  }
  if (!esNumeroFinito(maxima) || !esNumeroFinito(minima) || minima < 0 || maxima < minima) {
    agregar("tasa-del-producto-invalida", "/tasaNominalAnualPorcentaje", "La Tasa máxima o la Tasa mínima del producto no son válidas.");
  } else if (!sinTasa(p.tasaNominalAnualPorcentaje)) {
    const t = p.tasaNominalAnualPorcentaje;
    if (!esNumeroFinito(t)) agregar("tasa-invalida", "/tasaNominalAnualPorcentaje", "La tasa tiene que ser un número.");
    else if (t < minima) {
      agregar("tasa-menor-que-la-minima", "/tasaNominalAnualPorcentaje", `La tasa no puede ser menor que la Tasa mínima del producto (${conComa(minima)}%).`);
    } else if (t > maxima) {
      agregar("tasa-mayor-que-la-maxima", "/tasaNominalAnualPorcentaje", `La tasa no puede ser mayor que la Tasa máxima del producto (${conComa(maxima)}%).`);
    }
  }
  const s = p.desgravamen;
  if (s !== undefined && s !== null) {
    if (typeof s !== "object") agregar("desgravamen-invalido", "/desgravamen", "El seguro de desgravamen lleva tasa, periodicidad y base.");
    else {
      if (!esNumeroFinito(s.tasaPorcentaje) || s.tasaPorcentaje < 0) agregar("desgravamen-invalido", "/desgravamen/tasaPorcentaje", "La tasa del seguro de desgravamen no puede ser negativa.");
      if (s.periodicidad !== "anual" && s.periodicidad !== "mensual") agregar("desgravamen-invalido", "/desgravamen/periodicidad", "La tasa del seguro es anual o mensual.");
      if (s.base !== "saldo" && s.base !== "monto") agregar("desgravamen-invalido", "/desgravamen/base", "El seguro se calcula sobre el saldo o sobre el monto.");
    }
  }
  if (p.sistema !== undefined && p.sistema !== null && p.sistema !== "frances" && p.sistema !== "aleman") {
    agregar("sistema-invalido", "/sistema", "El sistema de amortización es francés o alemán.");
  }
  return errores;
}

export function simularCredito(p: PedidoDeSimulacion, limites: LimitesDelCredito = PRODUCTO_CONSUMO.limites): ResultadoDeSimulacion {
  const detalles = erroresDelPedido(p, limites);
  if (detalles.length > 0) return { ok: false, errores: detalles.map((e) => e.motivo), detalles };
  const tasa = tasaDelPedido(p);

  const sistema = p.sistema ?? PRODUCTO_CONSUMO.sistema;
  const desgravamen = p.desgravamen ?? PRODUCTO_CONSUMO.desgravamen;
  const n = p.plazoMeses;
  const i = tasa / 100 / 12;
  const tasaSeguroMensual = desgravamen.tasaPorcentaje / 100 / (desgravamen.periodicidad === "anual" ? 12 : 1);

  const montoC = Math.round(p.monto * 100);

  const tabla: FilaDeAmortizacion[] = [];
  let saldoC = montoC;
  let interesTotalC = 0;
  let seguroTotalC = 0;
  let pagadoC = 0;
  for (let mes = 1; mes <= n; mes++) {
    const restantes = n - mes + 1;
    const interesC = Math.round(saldoC * i);
    // El capital de este mes. Francés: la cuota de capital e interés que deja el
    // saldo en cero en los meses que quedan, menos el interés. Alemán, o sin
    // interés: el saldo entre los meses que quedan, hacia abajo para no pagar de
    // más (hacia arriba, un crédito de USD 1.001 a 480 meses terminaba en el
    // mes 479 y dejaba una fila vacía).
    let capitalC = sistema === "frances" && i > 0
      ? Math.round((saldoC * i) / (1 - Math.pow(1 + i, -restantes))) - interesC
      : Math.floor(saldoC / restantes);
    if (restantes === 1 || capitalC > saldoC) capitalC = saldoC;
    // Con el seguro sobre el monto, un saldo en cero ya no paga seguro.
    const seguroC = saldoC > 0 ? Math.round((desgravamen.base === "saldo" ? saldoC : montoC) * tasaSeguroMensual) : 0;
    const cuotaC = capitalC + interesC + seguroC;
    tabla.push({
      mes,
      saldoInicial: saldoC / 100,
      capital: capitalC / 100,
      interes: interesC / 100,
      seguro: seguroC / 100,
      cuota: cuotaC / 100,
      saldoFinal: (saldoC - capitalC) / 100,
    });
    saldoC -= capitalC;
    interesTotalC += interesC;
    seguroTotalC += seguroC;
    pagadoC += cuotaC;
  }

  const primera = tabla[0];
  const ultima = tabla[tabla.length - 1];
  return {
    ok: true,
    simulacion: {
      version: SIMULADOR_VERSION,
      monto: montoC / 100,
      plazoMeses: n,
      tasaNominalAnualPorcentaje: tasa,
      sistema,
      desgravamen,
      tasaMensual: i,
      tasaEfectivaAnual: Math.pow(1 + i, 12) - 1,
      cuotaPrimerMes: primera.cuota,
      cuotaUltimoMes: ultima.cuota,
      capitalEInteresPrimerMes: (Math.round(primera.capital * 100) + Math.round(primera.interes * 100)) / 100,
      seguroPrimerMes: primera.seguro,
      totalInteres: interesTotalC / 100,
      totalSeguro: seguroTotalC / 100,
      totalPagado: pagadoC / 100,
      tabla,
    },
  };
}

// El monto más alto cuya cuota del primer mes no pasa de `cuotaMaxima`, con
// las mismas condiciones. Responde «hasta cuánto le alcanza» en la capacidad
// de pago. Se busca con el mismo simulador, no con la fórmula invertida: con
// el seguro y el redondeo de cada mes, invertir la fórmula daba un monto cuya
// cuota real pasaba el tope por un centavo.
//
// Se compara en centavos enteros: la cuota máxima que sale de un cálculo
// (ingreso × 40% − cuotas) trae ruido de coma flotante, y comparar en dólares
// dejaba fuera o dentro un monto por 1e-13. Si ni el monto máximo del
// producto pasa el tope, devuelve ese monto: es el techo del producto, no el de
// la persona. Una cuota máxima infinita quiere decir «sin tope»; NaN o negativa, cero.
//
// Nunca devuelve algo que el producto no puede dar: si lo que alcanza es menos
// que el monto mínimo, devuelve cero (no alcanza para un crédito), y el techo es
// el monto máximo de los límites.
export function montoMaximoParaCuota(
  cuotaMaxima: number,
  condiciones: Omit<PedidoDeSimulacion, "monto">,
  limites: LimitesDelCredito = PRODUCTO_CONSUMO.limites,
): number | null {
  if (typeof cuotaMaxima !== "number" || Number.isNaN(cuotaMaxima) || cuotaMaxima <= 0) return 0;
  const topeC = Math.floor(cuotaMaxima * 100 + 1e-6);
  // La búsqueda mira montos por debajo del mínimo; los límites sólo cuentan al final.
  const paraBuscar = { ...limites, montoMinimo: 0.01 };
  const cuotaDeC = (montoC: number): number | null => {
    const r = simularCredito({ ...condiciones, monto: montoC / 100 }, paraBuscar);
    return r.ok ? Math.round(r.simulacion.cuotaPrimerMes * 100) : null;
  };
  // Las condiciones no son válidas (el plazo, la tasa, el seguro...).
  if (validarPedido({ ...condiciones, monto: limites.montoMinimo }, limites).length > 0) return null;
  const techoC = Math.round(limites.montoMaximo * 100);
  if ((cuotaDeC(techoC) as number) <= topeC) return limites.montoMaximo;
  // La cuota no baja al subir el monto: búsqueda binaria en centavos entre un
  // monto que cabe (0) y uno que no (el techo).
  let bajo = 0;
  let alto = techoC;
  while (alto - bajo > 1) {
    const medio = Math.floor((bajo + alto) / 2);
    if ((cuotaDeC(medio) as number) <= topeC) bajo = medio;
    else alto = medio;
  }
  const maximo = bajo / 100;
  return maximo < limites.montoMinimo ? 0 : maximo;
}
