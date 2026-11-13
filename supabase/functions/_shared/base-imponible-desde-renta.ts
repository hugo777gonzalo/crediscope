// De un impuesto a la renta CAUSADO a la base imponible que lo produjo, con la
// tabla progresiva de personas naturales (régimen general) del año fiscal.
//
// Para qué: el SRI es la única fuente que da una cifra de ingreso sin que la
// persona la declare ante nosotros, y el impuesto causado es esa cifra
// escondida detrás de una tabla. Hoy `indicioPorImpuestoALaRenta`
// (fuentes-ingreso.ts) supone la TARIFA MÁXIMA para acotar lo que declara al
// IESS, y eso subestima el ingreso de casi todos: quien paga USD 400 de
// impuesto no está en el 37% sino en el 10-15%. Invertir la tabla da el
// ingreso mínimo que consta en el SRI, una cota para la escalera de evidencia.
// Esta función NO está conectada al perfil: eso lo define ese diseño.
//
// QUÉ DEVUELVE (y qué no)
//   - La BASE IMPONIBLE, no el ingreso bruto. Base imponible = ingresos
//     gravados - aportes al IESS - deducciones; el ingreso bruto es siempre
//     igual o mayor. Por eso sirve como cota inferior, nunca como estimación.
//   - Un impuesto de cero sólo dice que la base no pasó de la fracción
//     exenta: el resultado es un intervalo (0, fracción exenta). Para un
//     impuesto mayor que cero la tabla es estrictamente creciente y el
//     intervalo se cierra en un valor (desde = hasta).
//   - Los gastos personales (desde 2018 son una REBAJA del impuesto, no una
//     deducción de la base) hacen que el impuesto NETO sea menor que el que
//     produce la tabla. Si el campo que llega del SRI es el neto, la base
//     despejada queda por debajo de la real: otra razón para tratarla como
//     cota inferior. Qué casillero es `rentaCausadoRetenido` no se verificó
//     (ver el informe del PR).
//
// RÉGIMEN (RIMPE, desde 2022)
//   Esta tabla SOLO vale para el régimen general. En el RIMPE el «impuesto
//   causado» es otra cosa, y despejarlo con esta tabla daría un ingreso
//   absurdamente alto:
//   - Emprendedor (ingresos brutos de USD 20.000 a 300.000): su propia tabla
//     sobre el INGRESO BRUTO, con tasas marginales de 0% a 2% (USD 60 más 1%
//     del exceso sobre 20.000, etc.). El impuesto es una fracción minúscula
//     del ingreso. Fuente: https://www.sri.gob.ec/en/rimpe (consultada el
//     2026-11-12). No se implementa su tabla: la página del SRI no dice cómo
//     se trata el tramo por debajo de 20.000 y trae las bases por tramo
//     redondeadas, así que no hay una fuente que permita una inversión
//     exacta; y la tabla cambió entre ejercicios.
//   - Negocio popular (hasta USD 20.000): cuota fija, USD 60 en 2022 y 2023 y
//     desde 2024 de 0 a 60 por tramo de ingresos brutos. El impuesto no
//     depende del ingreso de manera invertible.
//   El perfil SÍ puede saber el régimen: Equifax trae `clase_contribuyente`
//   (equifax-estructura.ts: `claseDeContribuyente`, con el valor «RIMPE»). Lo
//   que no se sabe leyendo ese campo es si es emprendedor o negocio popular,
//   ni si la persona tiene además ingresos fuera del RIMPE (la relación de
//   dependencia queda excluida del régimen y sigue en la tabla general). Por
//   eso el parámetro `regimen` admite «rimpe» a secas. Si el que llama no lo
//   sabe (`undefined`), se supone general y el resultado lo dice
//   (`regimenVerificado: false`): un contribuyente RIMPE que se lee como
//   general produce una base inflada, no una subestimada.
//
// DINERO: todo en centavos enteros. Las bases por tramo están en dólares con
// dos decimales (949,40) y los porcentajes son enteros; con `number` en
// dólares se acumularían errores de coma flotante en la ida y vuelta.
//
// TABLAS: cada año lleva la resolución o la página oficial de donde salió.
// Una tabla anual puede ser reemplazada por una ley dentro del mismo ejercicio
// (2023, ver abajo): la que vale es la última vigente para ese ejercicio, y
// antes de dar por buena una resolución se mira si algo posterior la cambió.
// Un año que no se pudo confirmar en una fuente oficial NO está: la función
// contesta «sin_tabla». Las bases por tramo son las PUBLICADAS (redondeadas
// al dólar en 2019, 2020, 2021, 2023, 2024 y 2025), no las acumuladas: pueden
// diferir hasta un dólar de lo que da la suma de los tramos anteriores, y lo
// que liquida el SRI es la publicada. Por eso entre el impuesto del final de
// un tramo y la base del siguiente puede haber un hueco de centavos: un
// impuesto que cae ahí se lleva al límite del tramo.

/** Un tramo: [desde, hasta (null = en adelante), impuesto sobre la fracción básica, % sobre el exceso]. Dólares. */
type TramoEnDolares = readonly [number, number | null, number, number];

interface TablaAnual {
  /** De dónde salió: resolución del SRI o página oficial. */
  fuente: string;
  tramos: readonly TramoEnDolares[];
}

const TABLAS_EN_DOLARES: Record<number, TablaAnual> = {
  2019: {
    // Texto de la resolución en el Registro Oficial, Tercer Suplemento No. 396, 28-dic-2018.
    fuente: "Resolución NAC-DGERCGC18-00000439 (R.O. 3.er Supl. 396, 28-dic-2018)",
    tramos: [
      [0, 11310, 0, 0], [11310, 14410, 0, 5], [14410, 18010, 155, 10], [18010, 21630, 515, 12],
      [21630, 43250, 949, 15], [43250, 64860, 4193, 20], [64860, 86480, 8513, 25],
      [86480, 115290, 13920, 30], [115290, null, 22563, 35],
    ],
  },
  2020: {
    // Texto de la resolución en el Registro Oficial, Suplemento No. 108, 26-dic-2019.
    fuente: "Resolución NAC-DGERCGC19-00000063 (R.O. Supl. 108, 26-dic-2019)",
    tramos: [
      [0, 11315, 0, 0], [11315, 14416, 0, 5], [14416, 18018, 155, 10], [18018, 21639, 515, 12],
      [21639, 43268, 950, 15], [43268, 64887, 4194, 20], [64887, 86516, 8518, 25],
      [86516, 115338, 13925, 30], [115338, null, 22572, 35],
    ],
  },
  2021: {
    // Resolución firmada el 23-dic-2020, leída del texto (fielweb.com/App_Themes/InformacionInteres/NAC-DGERCGC20-00000077.pdf).
    fuente: "Resolución NAC-DGERCGC20-00000077 (23-dic-2020)",
    tramos: [
      [0, 11212, 0, 0], [11212, 14285, 0, 5], [14285, 17854, 154, 10], [17854, 21442, 511, 12],
      [21442, 42874, 941, 15], [42874, 64297, 4156, 20], [64297, 85729, 8440, 25],
      [85729, 114288, 13798, 30], [114288, null, 22366, 35],
    ],
  },
  2022: {
    // La única tabla de estos años con otros tramos superiores (cortes de USD 10.000 y 37% desde 100.000),
    // y la única de la que no hay resolución de actualización: viene de la reforma del artículo 36 de la
    // LRTI (se presume la Ley Orgánica para el Desarrollo Económico y Sostenibilidad Fiscal, de nov-2021,
    // NO verificado). Fuente verificada: la página oficial del SRI. Las bases traen centavos.
    fuente: "SRI, Declaración Impuesto a la Renta 2022 (https://www.sri.gob.ec/en/declaracion-impuesto-a-la-renta-2022)",
    tramos: [
      [0, 11310, 0, 0], [11310, 14410, 0, 5], [14410, 18010, 155, 10], [18010, 21630, 515, 12],
      [21630, 31630, 949.4, 15], [31630, 41630, 2449.4, 20], [41630, 51630, 4449.4, 25],
      [51630, 61630, 6949.4, 30], [61630, 100000, 9949.4, 35], [100000, null, 23378.9, 37],
    ],
  },
  2023: {
    // LECCIÓN: una tabla anual del SRI puede ser REEMPLAZADA POR UNA LEY dentro del mismo ejercicio, y la que
    // vale es la última vigente para ese ejercicio. La Resolución NAC-DGERCGC22-00000058 (27-dic-2022) fijó
    // para 2023 otra tabla (11.722 / 14.935 / 18.666 ... con 24.231 en el último tramo); el Decreto-Ley Orgánica
    // para el Fortalecimiento de la Economía Familiar (jun-2023) la cambió para el cálculo del ejercicio 2023
    // (según el boletín de Andersen citado por quien revisó; el texto del decreto no se leyó acá). La tabla de
    // abajo es la que publica el SRI para 2023, y la página no nombra la norma que la sostiene.
    fuente: "SRI, Declaración Impuesto a la Renta 2023 (https://www.sri.gob.ec/en/declaracion-impuesto-a-la-renta-2023); reemplazó a la de la NAC-DGERCGC22-00000058",
    tramos: [
      [0, 11722, 0, 0], [11722, 14930, 0, 5], [14930, 19385, 160, 10], [19385, 25638, 606, 12],
      [25638, 33738, 1356, 15], [33738, 44721, 2571, 20], [44721, 59537, 4768, 25],
      [59537, 79388, 8472, 30], [79388, 105580, 14427, 35], [105580, null, 23594, 37],
    ],
  },
  2024: {
    fuente: "Resolución NAC-DGERCGC23-00000036 (26-dic-2023)",
    tramos: [
      [0, 11902, 0, 0], [11902, 15159, 0, 5], [15159, 19682, 163, 10], [19682, 26031, 615, 12],
      [26031, 34255, 1377, 15], [34255, 45407, 2611, 20], [45407, 60450, 4841, 25],
      [60450, 80605, 8602, 30], [80605, 107199, 14648, 35], [107199, null, 23956, 37],
    ],
  },
  2025: {
    fuente: "Resolución NAC-DGERCGC24-00000041 (dic-2024)",
    tramos: [
      [0, 12081, 0, 0], [12081, 15387, 0, 5], [15387, 19978, 165, 10], [19978, 26422, 624, 12],
      [26422, 34770, 1398, 15], [34770, 46089, 2650, 20], [46089, 61359, 4914, 25],
      [61359, 81817, 8731, 30], [81817, 108810, 14869, 35], [108810, null, 24316, 37],
    ],
  },
};

interface Tramo {
  desde: number; // centavos
  hasta: number | null;
  impuestoBase: number;
  porcentaje: number;
}

const aCentavos = (dolares: number) => Math.round(dolares * 100);
const aDolares = (centavos: number) => centavos / 100;

const TABLAS: Record<number, { fuente: string; tramos: Tramo[] }> = Object.fromEntries(
  Object.entries(TABLAS_EN_DOLARES).map(([anio, t]) => [
    anio,
    {
      fuente: t.fuente,
      tramos: t.tramos.map(([d, h, i, p]) => ({
        desde: aCentavos(d),
        hasta: h === null ? null : aCentavos(h),
        impuestoBase: aCentavos(i),
        porcentaje: p,
      })),
    },
  ]),
);

export const ANIOS_CON_TABLA: number[] = Object.keys(TABLAS).map(Number).sort((a, b) => a - b);

/** El régimen del contribuyente, si el que llama lo sabe. */
export type RegimenDeRenta = "general" | "rimpe";

export type ResultadoBaseImponible =
  | {
    estado: "ok";
    anio: number;
    /** Base imponible anual, en dólares. Un impuesto de cero da desde = 0 y hasta = fracción exenta. */
    desde: number;
    hasta: number;
    /** Lo mismo dividido en 12. */
    mensualDesde: number;
    mensualHasta: number;
    /** El impuesto fue cero: sólo se sabe que la base no pasó de la fracción exenta. */
    soloUnTecho: boolean;
    /** Cayó en el último tramo, que no tiene tope. */
    tramoAbierto: boolean;
    /** `false` si el que llama no dijo el régimen y se supuso el general. */
    regimenVerificado: boolean;
    fuente: string;
  }
  | { estado: "sin_tabla"; anio: number }
  | { estado: "no_aplica"; motivo: "rimpe" }
  | { estado: "invalido"; motivo: "impuesto_no_numerico" | "impuesto_negativo" | "anio_invalido" };

function aCentavosEstricto(impuesto: unknown): number | null {
  if (typeof impuesto === "string" && impuesto.trim() === "") return null;
  if (typeof impuesto !== "number" && typeof impuesto !== "string") return null;
  const n = Number(impuesto);
  return Number.isFinite(n) ? aCentavos(n) : null;
}

/** Impuesto de la tabla para una base anual (dólares): el camino de ida, que las pruebas usan para cerrar el círculo. */
export function impuestoDeLaBase(baseEnDolares: number, anio: number): number | null {
  const tabla = TABLAS[anio];
  if (!tabla || !Number.isFinite(baseEnDolares) || baseEnDolares < 0) return null;
  const base = aCentavos(baseEnDolares);
  // El tramo es el último cuyo `desde` no pasa de la base: en el límite (11.310) el impuesto es el del tramo anterior, igual.
  const tramo = [...tabla.tramos].reverse().find((t) => base >= t.desde) ?? tabla.tramos[0];
  return aDolares(tramo.impuestoBase + Math.round(((base - tramo.desde) * tramo.porcentaje) / 100));
}

/**
 * Despeja la base imponible anual desde el impuesto causado del año fiscal.
 * `regimen` undefined = no se sabe: se supone general (ver el comentario de arriba).
 */
export function baseImponibleDesdeRenta(
  impuestoCausado: unknown,
  anioFiscal: unknown,
  regimen?: RegimenDeRenta,
): ResultadoBaseImponible {
  const anio = Number(anioFiscal);
  if (!Number.isInteger(anio)) return { estado: "invalido", motivo: "anio_invalido" };
  const impuesto = aCentavosEstricto(impuestoCausado);
  if (impuesto === null) return { estado: "invalido", motivo: "impuesto_no_numerico" };
  if (impuesto < 0) return { estado: "invalido", motivo: "impuesto_negativo" };
  // El régimen se mira antes que la tabla: un RIMPE no aplica en ningún año, tenga o no tabla.
  if (regimen === "rimpe") return { estado: "no_aplica", motivo: "rimpe" };
  const tabla = TABLAS[anio];
  if (!tabla) return { estado: "sin_tabla", anio };

  const comun = {
    estado: "ok" as const,
    anio,
    regimenVerificado: regimen === "general",
    fuente: tabla.fuente,
  };
  const armar = (desde: number, hasta: number, soloUnTecho: boolean, tramoAbierto: boolean): ResultadoBaseImponible => ({
    ...comun,
    desde: aDolares(desde),
    hasta: aDolares(hasta),
    mensualDesde: aDolares(Math.round(desde / 12)),
    mensualHasta: aDolares(Math.round(hasta / 12)),
    soloUnTecho,
    tramoAbierto,
  });

  // Impuesto cero: la base está en [0, fin del tramo exento].
  if (impuesto === 0) return armar(0, tabla.tramos[0].hasta as number, true, false);

  // El tramo es el último cuya base de impuesto no pasa del impuesto. Los tramos con impuestoBase 0 y 5%
  // (el segundo) quedan bien: su base es 0 y el impuesto positivo ya es del 5%.
  let indice = 0;
  for (let i = 0; i < tabla.tramos.length; i++) if (tabla.tramos[i].impuestoBase <= impuesto) indice = i;
  // Si hay dos con base 0 (exento y 5%), gana el segundo, que es el que genera impuesto.
  const t = tabla.tramos[indice];
  let base = t.desde + Math.round(((impuesto - t.impuestoBase) * 100) / t.porcentaje);
  // El hueco entre el final de un tramo y la base publicada del siguiente: se lleva al límite.
  if (t.hasta !== null && base > t.hasta) base = t.hasta;
  return armar(base, base, false, t.hasta === null);
}
