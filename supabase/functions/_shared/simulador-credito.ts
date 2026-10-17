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
// - Los parámetros del producto (tasa máxima y desgravamen) son datos, no
//   código: el negocio fijó el 2026-10-17 una tasa nominal máxima de 15% para
//   consumo, que cada institución puede bajar, y un desgravamen de 0,6% "por
//   el momento". Cambiarlos no toca la fórmula.

export const SIMULADOR_VERSION = "simulador-v1";

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

export interface ParametrosProducto {
  /** Tope de la tasa nominal anual, en porcentaje. */
  tasaNominalMaximaPorcentaje: number;
  sistema: SistemaAmortizacion;
  desgravamen: ParametrosDesgravamen;
}

// Decisión del negocio del 2026-10-17: el 0,6% es anual (confirmado ese día;
// mensual sería 7,2% al año, más que cualquier seguro de desgravamen de
// consumo). Que se cobre sobre el saldo es lo usual en consumo; cada
// institución puede cobrarlo sobre el monto.
export const PRODUCTO_CONSUMO: ParametrosProducto = {
  tasaNominalMaximaPorcentaje: 15,
  sistema: "frances",
  desgravamen: { tasaPorcentaje: 0.6, periodicidad: "anual", base: "saldo" },
};

// El mismo rango que acepta el contrato de la API (SolicitudDeCredito).
export const PLAZO_MAXIMO_MESES = 480;

export interface PedidoDeSimulacion {
  monto: number;
  plazoMeses: number;
  tasaNominalAnualPorcentaje: number;
  sistema?: SistemaAmortizacion;
  desgravamen?: ParametrosDesgravamen;
  tasaNominalMaximaPorcentaje?: number;
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

export type ResultadoDeSimulacion = { ok: true; simulacion: Simulacion } | { ok: false; errores: string[] };

const esNumeroFinito = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// Los mensajes se muestran tal cual en la pantalla y viajan en la API.
export function validarPedido(p: PedidoDeSimulacion): string[] {
  const errores: string[] = [];
  const maxima = p.tasaNominalMaximaPorcentaje ?? PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje;
  if (!esNumeroFinito(p.monto) || p.monto <= 0) errores.push("El monto tiene que ser mayor que cero.");
  else if (Math.abs(p.monto * 100 - Math.round(p.monto * 100)) > 1e-6) {
    errores.push("El monto va en dólares con hasta dos decimales.");
  }
  if (!Number.isInteger(p.plazoMeses) || p.plazoMeses < 1 || p.plazoMeses > PLAZO_MAXIMO_MESES) {
    errores.push(`El plazo va en meses enteros, de 1 a ${PLAZO_MAXIMO_MESES}.`);
  }
  if (!esNumeroFinito(maxima) || maxima <= 0) errores.push("La tasa máxima del producto no es válida.");
  if (!esNumeroFinito(p.tasaNominalAnualPorcentaje) || p.tasaNominalAnualPorcentaje < 0) {
    errores.push("La tasa no puede ser negativa.");
  } else if (esNumeroFinito(maxima) && p.tasaNominalAnualPorcentaje > maxima) {
    errores.push("La tasa supera la máxima del producto.");
  }
  const s = p.desgravamen;
  if (s) {
    if (!esNumeroFinito(s.tasaPorcentaje) || s.tasaPorcentaje < 0) errores.push("La tasa del seguro de desgravamen no puede ser negativa.");
    if (s.periodicidad !== "anual" && s.periodicidad !== "mensual") errores.push("La tasa del seguro es anual o mensual.");
    if (s.base !== "saldo" && s.base !== "monto") errores.push("El seguro se calcula sobre el saldo o sobre el monto.");
  }
  if (p.sistema !== undefined && p.sistema !== "frances" && p.sistema !== "aleman") {
    errores.push("El sistema de amortización es francés o alemán.");
  }
  return errores;
}

export function simularCredito(p: PedidoDeSimulacion): ResultadoDeSimulacion {
  const errores = validarPedido(p);
  if (errores.length > 0) return { ok: false, errores };

  const sistema = p.sistema ?? PRODUCTO_CONSUMO.sistema;
  const desgravamen = p.desgravamen ?? PRODUCTO_CONSUMO.desgravamen;
  const n = p.plazoMeses;
  const i = p.tasaNominalAnualPorcentaje / 100 / 12;
  const tasaSeguroMensual = desgravamen.tasaPorcentaje / 100 / (desgravamen.periodicidad === "anual" ? 12 : 1);

  const montoC = Math.round(p.monto * 100);
  // Cuota fija de capital e interés (francés) o capital fijo (alemán), en centavos.
  const cuotaFijaC = i === 0 ? Math.round(montoC / n) : Math.round((montoC * i) / (1 - Math.pow(1 + i, -n)));
  const capitalFijoC = Math.round(montoC / n);

  const tabla: FilaDeAmortizacion[] = [];
  let saldoC = montoC;
  let interesTotalC = 0;
  let seguroTotalC = 0;
  let pagadoC = 0;
  for (let mes = 1; mes <= n; mes++) {
    const interesC = Math.round(saldoC * i);
    let capitalC = sistema === "frances" ? cuotaFijaC - interesC : capitalFijoC;
    if (mes === n || capitalC > saldoC) capitalC = saldoC;
    const seguroC = Math.round((desgravamen.base === "saldo" ? saldoC : montoC) * tasaSeguroMensual);
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
      tasaNominalAnualPorcentaje: p.tasaNominalAnualPorcentaje,
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
export function montoMaximoParaCuota(
  cuotaMaxima: number,
  condiciones: Omit<PedidoDeSimulacion, "monto">,
): number | null {
  if (!esNumeroFinito(cuotaMaxima) || cuotaMaxima <= 0) return 0;
  const cuotaDe = (montoC: number): number | null => {
    const r = simularCredito({ ...condiciones, monto: montoC / 100 });
    return r.ok ? r.simulacion.cuotaPrimerMes : null;
  };
  if (cuotaDe(100) === null) return null; // las condiciones no son válidas
  // La cuota crece con el monto: búsqueda binaria en centavos.
  let bajo = 0;
  let alto = 100;
  while ((cuotaDe(alto) as number) <= cuotaMaxima && alto < 1e11) alto *= 2;
  while (alto - bajo > 1) {
    const medio = Math.floor((bajo + alto) / 2);
    if ((cuotaDe(medio) as number) <= cuotaMaxima) bajo = medio;
    else alto = medio;
  }
  return bajo / 100;
}
