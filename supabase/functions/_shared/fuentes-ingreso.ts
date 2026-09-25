// Fuentes de ingreso: de qué vive el cliente y qué tan evidenciado está.
//
// Módulo aparte de process.ts a propósito: sus reglas se van a afinar
// cada vez que aparezca un caso raro, y no conviene que cada ajuste
// obligue a revalidar los 125 campos del perfil. Tiene su propia versión.
//
// PRINCIPIO RECTOR — LO QUE PRODUCE ES INGRESO REPORTADO, NO INGRESO.
// Ninguna fuente pública dice cuánto gana alguien en Ecuador:
//   - El empleador subdeclara el sueldo para pagar menos aportes (gana
//     900, lo reportan con 500). Pasa y no lo vamos a detectar.
//   - Quien se autoafilia (afiliado voluntario o unipersonal, aunque no
//     tenga un trabajo fijo) elige su base de aporte, y casi siempre elige
//     el Salario Básico Unificado (SBU), que sube entre 8 y 25 dólares por
//     año.
//   - Con 3,8 millones de empleos formales sobre 9 millones de PEA, la
//     mayoría de la actividad económica no deja rastro declarado.
// Por eso nunca se escribe "ingreso: $500" sino "reportado al IESS:
// $500", y cuando el monto es el SBU se dice "Ingreso Mínimo SBU"
// (esIngresoMinimoSbu). El negocio pidió el 2026-09-25 no hablar de
// "piso": en Ecuador no se usa. Los nombres internos que lo llevan
// (pisoIngresoMensualReportado, fuente_piso_ingreso) quedan como están:
// renombrarlos obligaba a reescribir miles de perfiles sin cambiar nada
// de lo que se lee. Estimar el ingreso real es un modelo aparte, con
// decenas de miles de casos -- no se resuelve con reglas acá.
//
// SEGUNDA REGLA — LA VIGENCIA SE MIDE CONTRA EL CORTE, NO CONTRA HOY.
// El mecanizado del IESS se actualiza cada 2-3 meses. Medido sobre 389
// clientes reales: 243 (76%) terminan en el mismo mes, que es la fecha
// de corte, no la fecha en que dejaron de trabajar. Si la vigencia se
// midiera contra hoy, un retraso de la fuente marcaría a 243 personas
// como desempleadas de golpe.
// El reverso también informa: quien NO aparece en el último corte pero
// sí en el anterior se desvinculó hace poco, y eso es una señal de
// riesgo que hoy se estaba perdiendo.

import type { RespuestaNovadata } from "./types.ts";
import { sePuedeAfirmarQueNoAporta } from "./calidad-de-la-consulta.ts";

// v3: la guarda de "no sé si aporta" pasa a mirar basesInternas, la
// fuente que realmente trae los aportes, en vez del bloque `bancos`
// entero. El bloque figuraba "ok" porque contestaba cualquiera de sus
// otras trece fuentes, así que se afirmaba "no aporta" con los aportes
// sin consultar. La clasificación no cambió; cambió cuándo se permite
// emitirla.
//
// v4 (2026-09-24), de una auditoría contra el último perfil de los 2.807
// clientes de la cartera:
//  - La rama "vínculo vigente sin monto" se disparaba con CUALQUIER fuente
//    con naturaleza, incluidas las que agrega este mismo módulo por RUC
//    activo o por nómina. 455 personas sin un solo aporte al IESS tenían
//    como motivo "Vínculo vigente al corte..., pero la fuente no trae el
//    monto del aporte". El segmento salía bien (independiente); la
//    explicación afirmaba un aporte que no existe. Ahora esa rama exige
//    aportes vigentes, y RUC, renta y nómina van por la de independiente.
//  - Jubilado con actividad propia (RUC activo o nómina) quedaba como
//    "jubilado" confirmado: 97 personas. Pasa a "jubilado con ingreso
//    adicional", provisional -- la jubilación es cierta, la actividad no
//    tiene monto.
//  - "Ingresos mixtos" era siempre confirmada, aunque una de las partes
//    fuera un aporte que la persona eligió (18 casos). Ahora sigue la misma
//    regla que una sola naturaleza: cuenta propia, agrícola o un código
//    desconocido la vuelven provisional.
//  - Códigos 17 (organización campesina), 24 (sindicatos y cooperativas de
//    transporte) y 30 (autónomos sin relación de dependencia) caían en "no
//    clasificado" (8 personas). Decisión del negocio: 17 es agrícola, 24 y
//    30 son cuenta propia.
//  - `detalle`: historial de aportes de 24 meses, actividad económica del
//    RUC e impuesto a la renta por año. Salen del crudo, así que sólo
//    existen en consultas nuevas. NO van al modelo (ver
//    `sinDetalleDeIngresos`): son para que el analista lea, y meterlos en
//    el análisis con IA es otra decisión, con su versión de marco.
//
// v5 (2026-09-25): `detalle.continuidadLaboral` -- desde cuándo trabaja con
// un empleador sin interrupciones de más de 2 meses, aunque haya cambiado de
// empleo. Mide la estabilidad laboral total, que la antigüedad en el empleo
// actual no ve: en 82 de 237 asalariados vigentes de la muestra la
// continuidad supera a esa antigüedad en más de un año. Definida con el
// negocio: tolerancia 2 meses, los aportes voluntarios y unipersonales no
// cuentan, los meses que el proveedor no publicó no son huecos, y es sólo
// para la pantalla (no va al modelo, como el resto del detalle). No cambia
// ninguna clasificación.
//
// v6 (2026-09-25): el aporte propio (unipersonal, voluntario, artesanal,
// RISE) cuenta para la continuidad en los meses en que la persona tenía un
// RUC activo: hay una actividad independiente detrás. Sin RUC activo sigue
// sin contar -- puede ser aportar para no perder la seguridad social.
// Decisión del negocio sobre el caso 0704804749: un empleo público de 4
// meses precedido por 24 de aporte unipersonal.
export const FUENTES_INGRESO_VERSION = "fuentes-v6";

// Último corte conocido del mecanizado del IESS. PARÁMETRO OPERATIVO:
// hay que actualizarlo cuando la fuente publique un corte nuevo (cada
// 2-3 meses). No se puede deducir del dato de una sola persona -- la
// fuente no declara su fecha de corte, y fechaActualizacion es la fecha
// de la consulta, no del corte.
// El módulo se autodetecta desactualizado: si un cliente trae un mes
// posterior a este valor, lo marca en corteDesactualizado.
export const CORTE_IESS_CONOCIDO = "2026-07";

// Salario básico unificado por año. Derivado de los propios datos (la
// moda del salario de los autoafiliados reproduce la serie oficial) y
// contrastado con la serie publicada. Sirve para distinguir a quien
// aporta sobre el mínimo legal de quien eligió aportar más.
const SBU_POR_ANIO: Record<number, number> = {
  2019: 394, 2020: 400, 2021: 400, 2022: 425, 2023: 450, 2024: 460, 2025: 470, 2026: 482,
};
const SBU_POR_DEFECTO = 482;

export function sbuDelAnio(anio: number): number {
  return SBU_POR_ANIO[anio] ?? SBU_POR_DEFECTO;
}

// "Ingreso Mínimo SBU": el monto es el Salario Básico Unificado del año o
// está muy cerca (±5%, la misma holgura con que la clasificación separa
// al que aporta en el mínimo del que aporta por encima). Un monto bastante
// menor -- medio tiempo, un mes incompleto -- no es el SBU y no se rotula
// así. `mes` es "yyyy-mm": el SBU que cuenta es el del año de ese aporte.
export function esIngresoMinimoSbu(monto: number | null | undefined, mes: string | null | undefined): boolean {
  if (typeof monto !== "number" || !(monto > 0)) return false;
  const anio = Number(String(mes ?? "").slice(0, 4));
  const sbu = sbuDelAnio(Number.isInteger(anio) ? anio : NaN);
  return monto >= sbu * 0.95 && monto <= sbu * 1.05;
}

// Naturaleza del vínculo según el código de tipo de empleador del IESS.
// Se lee SIEMPRE el número: las etiquetas vienen sucias, truncadas a
// distinto largo y con la codificación rota ("ENTIDADES P+BLICAS").
const NATURALEZA_POR_CODIGO: Record<string, Naturaleza> = {
  "9": "publico", "10": "publico", "12": "publico", "14": "publico", "16": "publico",
  "29": "diplomatico",
  "1": "privado", "2": "privado", "6": "privado", "13": "privado", "26": "privado", "27": "privado", "28": "privado",
  "25": "domestico",
  "3": "cuenta_propia", "8": "cuenta_propia", "24": "cuenta_propia", "30": "cuenta_propia", "31": "cuenta_propia", "32": "cuenta_propia", "34": "cuenta_propia",
  "4": "agricola", "7": "agricola", "17": "agricola",
  "35": "hogar",
};

export type Naturaleza =
  | "publico" | "diplomatico" | "privado" | "domestico"
  | "cuenta_propia" | "agricola" | "hogar" | "otro";

export type CalidadEvidencia =
  // Un tercero declara y paga sobre esa base. Sigue siendo lo reportado: el
  // empleador puede estar subdeclarando.
  | "reportada_por_tercero"
  // La persona eligió su base de aporte. Por encima del mínimo legal
  // evidencia capacidad (desembolsa aportes sobre esa base todos los
  // meses); en el mínimo legal no dice nada del ingreso.
  | "autodeclarada_sobre_minimo"
  | "autodeclarada_en_minimo"
  // Hay actividad comprobable pero ninguna cifra asociada.
  | "indirecta";

export type Segmento =
  | "publico" | "diplomatico" | "dependiente_privado" | "empleo_domestico"
  | "independiente" | "agricola" | "trabajo_hogar"
  | "jubilado" | "jubilado_con_ingreso_adicional"
  | "ingresos_mixtos" | "informal_o_sin_actividad"
  // La fuente que trae los aportes no contestó. No es un juicio sobre
  // la persona: es la ausencia de la consulta. Existe como segmento
  // propio porque la alternativa era decir "informal", que sí es un
  // juicio -- y se dijo sobre 373 personas por una caída de una hora.
  // Ver _shared/calidad-de-la-consulta.ts.
  | "sin_datos"
  // Aporta bajo un código de empleador que no está en el mapa, o que
  // llegó sin el prefijo numérico. Existe como segmento propio para que
  // el caso SE VEA: mandarlo a "dependiente privado" —lo que hacía
  // antes— lo escondía entre 137 clientes correctos, y encima con
  // estado confirmada.
  | "no_clasificado";

export type EstadoSegmento = "confirmada" | "provisional" | "indeterminada";

export interface FuenteIngreso {
  tipo: string;
  naturaleza: Naturaleza | null;
  montoMensualReportado: number | null;
  evidencia: CalidadEvidencia;
  empleador: string | null;
  vigenteAlCorte: boolean;
  // Traza legible: de dónde salió y por qué se clasificó así. Sin esto,
  // discutir una clasificación con el área es discutir contra una caja
  // negra.
  detalle: string;
}

export interface SenalEscala {
  senal: string;
  valor: number | null;
  detalle: string;
}

// Un empleador (o afiliación propia) visto en los últimos 24 meses.
export interface VinculoIess {
  empleador: string | null;
  naturaleza: Naturaleza;
  ocupacion: string | null;
  desde: string | null; // fecha de ingreso que declara el IESS, yyyy-mm-dd
  hasta: string | null; // fecha de salida; null = el IESS no registró salida
  ultimoMes: string; // último mes con aporte, yyyy-mm
  mesesConAporte: number; // de los 24 hasta el corte
  ultimoSalario: number | null;
  vigenteAlCorte: boolean;
}

// Continuidad laboral: desde cuándo trabaja con un empleador sin
// interrupciones de más de 2 meses, aunque haya cambiado de empleo.
export interface ContinuidadLaboral {
  meses: number; // largo del tramo, en meses calendario (incluye los huecos tolerados)
  desde: string; // yyyy-mm
  hasta: string; // yyyy-mm, último mes con trabajo con empleador
  vigente: boolean; // hasta === corte: hoy sigue trabajando
  empleadores: number; // distintos dentro del tramo
  mesesSinAporte: number; // huecos tolerados dentro del tramo (sin contar los del proveedor)
  // Meses del tramo sostenidos sólo por aporte propio con RUC activo (sin
  // un empleador al mismo tiempo). Desde fuentes-v6.
  mesesCuentaPropiaConRuc?: number;
  toleranciaMeses: number;
}

export interface DetalleIngresos {
  // Una entrada por mes con aporte, en orden, dentro de los 24 meses que
  // terminan en el corte. Un mes sin aporte NO aparece: el hueco es el dato.
  aportesPorMes: { mes: string; total: number; empleadores: number }[];
  vinculos: VinculoIess[];
  mesesConAporteUltimos12: number;
  mesesConAporteUltimos24: number;
  promedioUltimos6: number | null;
  promedioUltimos12: number | null;
  // Total del mismo mes un año antes del corte: contra el reportado hoy dice
  // si el sueldo reportado creció o cayó. Null si ese mes no tuvo aporte.
  totalHace12Meses: number | null;
  // Desde fuentes-v5. Null: nunca aportó con un empleador.
  continuidadLaboral?: ContinuidadLaboral | null;
  actividadesEconomicas: { nombreComercial: string | null; actividad: string | null; abierto: boolean; inicio: string | null }[];
  impuestoRentaPorAnio: { anio: number; formulario: string | null; causado: number | null; enRelacionDeDependencia: number | null }[];
}

export interface AnalisisFuentesIngreso {
  version: string;
  corteIessUsado: string;
  corteDesactualizado: boolean;
  segmento: Segmento;
  estadoSegmento: EstadoSegmento;
  motivoSegmento: string;
  apareceEnUltimoCorte: boolean | null;
  cortesDesdeLaDesvinculacion: number | null;
  fuentes: FuenteIngreso[];
  // Suma de los montos reportados de las fuentes vigentes. Es lo REPORTADO
  // del ingreso, nunca el ingreso.
  pisoIngresoMensualReportado: number | null;
  senalesDeEscala: SenalEscala[];
  paraConfirmar: string[];
  // Desde fuentes-v4. No va al modelo: ver sinDetalleDeIngresos.
  detalle?: DetalleIngresos;
}

type AnyRecord = Record<string, unknown>;

// El detalle es para que lo lea el analista. Decisión del negocio del
// 2026-09-24: no entra al análisis con IA hasta que haya una versión del
// marco que lo contemple. Todo camino que le mande un perfil guardado al
// modelo pasa por acá, así que un perfil viejo y uno nuevo le llegan con
// la misma forma.
export function sinDetalleDeIngresos<T extends Record<string, unknown>>(perfil: T): T {
  const f = perfil?.fuentesIngreso as Record<string, unknown> | undefined;
  if (!f || !("detalle" in f)) return perfil;
  const resto = { ...f };
  delete resto.detalle;
  return { ...perfil, fuentesIngreso: resto };
}

// Valida el rango a propósito: un mes 99 en los datos construía
// "2026-99", que por comparación de texto queda por encima del corte y
// disparaba la falsa alarma de "el corte quedó desactualizado".
function mesClave(anio: unknown, mes: unknown): string | null {
  const a = Number(anio);
  const m = Number(mes);
  if (!Number.isInteger(a) || a < 1950 || a > 2100) return null;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  return `${a}-${String(m).padStart(2, "0")}`;
}

// Un monto solo cuenta si es positivo. La fuente devuelve ceros y algún
// negativo suelto, y un negativo arrastra el ingreso reportado hacia abajo
// sin que nadie lo note.
function montoValido(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function diferenciaEnMeses(desde: string, hasta: string): number {
  return (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + (Number(hasta.slice(5)) - Number(desde.slice(5)));
}

function codigoTipoEmpleador(tipEmp: unknown): string | null {
  return (String(tipEmp ?? "").match(/^\s*(\d+)\s*-/) ?? [])[1] ?? null;
}

function mismoNombre(a: unknown, b: unknown): boolean {
  const norm = (s: unknown) => String(s ?? "").toUpperCase().trim().split(/\s+/).filter(Boolean).sort().join(" ");
  const na = norm(a);
  return na !== "" && na === norm(b);
}

// El IESS y el SRI mandan fechas "dd/mm/yyyy". Se reescriben a ISO sin
// pasar por Date: son fechas de calendario, no instantes, y un Date las
// corre un día en Ecuador (ver src/lib/fechas.js).
function fechaIso(v: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function textoONull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function mesMenos(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + (Number(mes.slice(5)) - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100;

// Motivo de "independiente" cuando no hay aportes vigentes. Exportado
// porque la corrección de los 455 motivos guardados (migración 081) usa
// esta misma función: el texto corregido tiene que ser idéntico al que
// escribe una consulta nueva.
export function motivoSinAportes(rucActivo: boolean, declaraRenta: boolean, nomina: number | null): string {
  const base = rucActivo
    ? "Sin aportes vigentes, pero con RUC activo ante el SRI."
    : nomina !== null
      ? `Sin aportes vigentes ni RUC activo, pero paga una nómina de $${nomina} mensuales.`
      : declaraRenta
        ? "Sin aportes vigentes ni RUC activo; registra declaraciones al SRI."
        : "Sin aportes vigentes.";
  return rucActivo && nomina !== null ? `${base} Además paga una nómina de $${nomina} mensuales.` : base;
}

function promedio(valores: number[]): number | null {
  return valores.length ? redondear2(valores.reduce((a, b) => a + b, 0) / valores.length) : null;
}

// Meses que el proveedor no tiene para NADIE: en las 315 historias con
// aportes de research/novadata-raw, cero personas los traen, mientras los
// meses vecinos los traen cientos (medido el 2026-09-25). No son meses sin
// trabajo de la persona, son meses que Novadata no publicó. Contarlos como
// desempleo cortaba la continuidad de casi todos en 2019-2020. Son
// históricos y no deberían cambiar; si aparece uno nuevo, se mide igual:
// un mes que nadie tiene y que sus vecinos sí.
const MESES_SIN_DATO_DEL_PROVEEDOR = new Set([
  "2018-02", "2019-09", "2019-10", "2019-11", "2020-01", "2020-02", "2020-03", "2020-05", "2020-06", "2020-08", "2020-11",
]);

// Qué cuenta como trabajo para la continuidad (decisiones del negocio,
// 2026-09-25): el trabajo con un empleador siempre; el aporte propio
// (unipersonal, voluntario, artesanal, RISE) sólo en los meses en que la
// persona tenía un RUC activo -- ahí hay una actividad como independiente
// detrás. Sin RUC activo, aportar por cuenta propia puede ser sólo no
// perder los beneficios de la seguridad social, y no prueba trabajo. No
// cuentan el trabajo no remunerado del hogar ni un código de empleador
// que no conocemos.
//
// Medido en las historias locales: de 4.652 meses de aporte propio, 3.773
// (81%) caen dentro de un período con RUC activo; 28 de 137 personas
// aportan por su cuenta sin RUC activo en ninguno de esos meses.
const NATURALEZAS_CON_EMPLEADOR = new Set<Naturaleza>(["publico", "diplomatico", "privado", "domestico", "agricola"]);

// "yyyy/mm/dd" (así manda el SRI las fechas del RUC) o "dd/mm/yyyy" -> "yyyy-mm".
function mesDeFecha(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const iso = /^(\d{4})[-/](\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  return dmy ? `${dmy[3]}-${dmy[2]}` : null;
}

// Los períodos con RUC activo. El SRI sólo guarda el inicio de
// actividades, el cese MÁS RECIENTE (cancelación o suspensión definitiva)
// y el reinicio MÁS RECIENTE, no el historial completo -- los mismos tres
// datos y los mismos casos que estadoActividadEconomica en process.ts:
//   sin cese                 -> activo desde el inicio
//   cese y reinicio después  -> activo inicio..cese y desde el reinicio
//   cese (y reinicio antes)  -> activo reinicio..cese, o inicio..cese
// En el último caso, lo anterior al reinicio no se sabe cuándo cesó y no
// se cuenta: no se inventa una actividad.
function periodosConRucActivo(consultadas: AnyRecord): [string, string][] {
  const registros = ((((consultadas.contribuyente as AnyRecord)?.data as AnyRecord)?.datosContribuyente as AnyRecord[]) ?? [])
    .filter((c) => c.ruc && c.fecha_inscripcion_ruc);
  const periodos: [string, string][] = [];
  for (const c of registros) {
    const inicio = mesDeFecha(c.fecha_inicio_actividades);
    if (!inicio) continue;
    const cese = [mesDeFecha(c.fecha_cancelacion), mesDeFecha(c.fecha_suspension_definitiva)].filter((m): m is string => Boolean(m)).sort().at(-1) ?? null;
    const reinicio = mesDeFecha(c.fecha_reinicio_actividades);
    if (!cese) periodos.push([inicio, "9999-12"]);
    else if (reinicio && reinicio > cese) {
      periodos.push([inicio, cese]);
      periodos.push([reinicio, "9999-12"]);
    } else periodos.push([reinicio ?? inicio, cese]);
  }
  return periodos;
}

// Hasta 2 meses sin aporte entre un empleo y el siguiente no cortan la
// continuidad (decisión del negocio). Medido sobre 442 cambios de empleo en
// las historias locales: 43% sin ningún mes vacío, 23% con 1 y 7% con 2; con
// 3 o más empieza a parecerse a un período sin trabajo.
const TOLERANCIA_CONTINUIDAD_MESES = 2;

// Se arma por EMPLEOS y no por meses sueltos. El historial mensual del
// proveedor empieza en 2018-2019, pero el IESS declara la fecha de ingreso
// de cada empleo: medida sólo con los meses, la continuidad de alguien que
// entró en 2004 salía más corta que la antigüedad de su empleo actual (68
// casos de 190 en la primera versión). Cada empleo va desde su fecha de
// ingreso -- o su primer aporte, si es anterior -- hasta su último aporte,
// y los huecos DENTRO de un mismo empleo no cortan: el IESS lo da por
// continuo.
function construirContinuidad(aportes: AnyRecord[], corte: string, consultadas: AnyRecord): ContinuidadLaboral | null {
  const conRuc = periodosConRucActivo(consultadas);
  const empleos = new Map<string, { empleador: string; inicio: string; fin: string; cuentaPropia: boolean }>();
  for (const a of aportes) {
    const mes = mesClave(a.anio, a.mes);
    if (!mes || mes > corte) continue;
    const naturaleza = (NATURALEZA_POR_CODIGO[codigoTipoEmpleador(a.tipEmp) ?? ""] ?? "otro") as Naturaleza;
    // El aporte propio cuenta sólo en un mes con RUC activo, y su empleo
    // no puede empezar antes que ese período del RUC. El RISE (código 34)
    // es un régimen del propio SRI: aportar como RISE ya prueba una
    // actividad registrada, aunque la fecha del RUC sea posterior -- caso
    // visto: RISE desde 2018 con un RUC que figura desde 2022, el año en
    // que el RIMPE reemplazó al RISE.
    const esRise = codigoTipoEmpleador(a.tipEmp) === "34";
    const periodo =
      naturaleza === "cuenta_propia"
        ? (conRuc.find(([d, h]) => d <= mes && mes <= h) ?? (esRise ? (["1950-01", "9999-12"] as [string, string]) : null))
        : null;
    if (!NATURALEZAS_CON_EMPLEADOR.has(naturaleza) && !periodo) continue;
    const pisoInicio = periodo ? periodo[0] : "1950-01";
    const empleador = String(a.rucEmp ?? a.nomEmp ?? "");
    const clave = `${empleador}|${a.fecIng ?? ""}|${pisoInicio}`;
    const ingreso = fechaIso(a.fecIng)?.slice(0, 7) ?? null;
    const e = empleos.get(clave) ?? { empleador, inicio: mes, fin: mes, cuentaPropia: Boolean(periodo) };
    if (mes < e.inicio) e.inicio = mes;
    if (mes > e.fin) e.fin = mes;
    // La fecha de ingreso sólo adelanta el inicio si es posible: no antes
    // de 1950 ni, para el aporte propio, antes de que abriera el RUC.
    if (ingreso && ingreso < e.inicio) {
      const desdeIngreso = ingreso > pisoInicio ? ingreso : pisoInicio;
      if (desdeIngreso < e.inicio) e.inicio = desdeIngreso;
    }
    empleos.set(clave, e);
  }
  if (empleos.size === 0) return null;

  // Meses sin aporte entre el fin de un empleo y el inicio del siguiente,
  // sin contar los que el proveedor no publicó.
  const huecoEntre = (fin: string, inicio: string): number => {
    let n = 0;
    for (let m = mesMenos(inicio, 1); m > fin; m = mesMenos(m, 1)) if (!MESES_SIN_DATO_DEL_PROVEEDOR.has(m)) n++;
    return n;
  };

  // Desde el empleo que termina último, se van sumando hacia atrás los
  // empleos que terminan a 2 meses o menos del inicio del tramo (o que se
  // solapan con él), hasta que no entra ninguno más.
  const lista = [...empleos.values()];
  const hasta = lista.reduce((m, e) => (e.fin > m ? e.fin : m), lista[0].fin);
  let desde = lista.filter((e) => e.fin === hasta).reduce((m, e) => (e.inicio < m ? e.inicio : m), hasta);
  const enTramo = new Set(lista.filter((e) => e.fin === hasta));
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const e of lista) {
      if (enTramo.has(e) || e.fin >= hasta) continue;
      const hueco = e.fin >= desde ? 0 : huecoEntre(e.fin, desde);
      if (hueco > TOLERANCIA_CONTINUIDAD_MESES) continue;
      enTramo.add(e);
      if (e.inicio < desde) desde = e.inicio;
      cambio = true;
    }
  }
  // Los huecos se cuentan al final, sobre el tramo armado: sumados al
  // agregar cada empleo, un hueco que después tapaba otro empleo se contaba
  // igual.
  let mesesSinAporte = 0;
  let mesesCuentaPropiaConRuc = 0;
  for (let m = desde; m <= hasta; m = mesMenos(m, -1)) {
    const cubren = [...enTramo].filter((e) => e.inicio <= m && m <= e.fin);
    if (cubren.length > 0 && cubren.every((e) => e.cuentaPropia)) mesesCuentaPropiaConRuc++;
    if (MESES_SIN_DATO_DEL_PROVEEDOR.has(m)) continue;
    if (cubren.length === 0) mesesSinAporte++;
  }
  return {
    meses: diferenciaEnMeses(desde, hasta) + 1,
    desde,
    hasta,
    vigente: hasta === corte,
    empleadores: new Set([...enTramo].map((e) => e.empleador)).size,
    mesesSinAporte,
    mesesCuentaPropiaConRuc,
    toleranciaMeses: TOLERANCIA_CONTINUIDAD_MESES,
  };
}

// Lo que el analista necesita para leer la historia y que la clasificación
// sola no dice: si aporta todos los meses o con huecos, si el sueldo
// reportado sube o baja, de qué vive quien tiene RUC y cuánto impuesto a la
// renta causó cada año. Los montos siguen siendo lo reportado, igual que arriba.
function construirDetalle(aportes: AnyRecord[], corte: string, consultadas: AnyRecord): DetalleIngresos {
  const desde = mesMenos(corte, 23);
  const enVentana = aportes
    .map((a) => ({ a, mes: mesClave(a.anio, a.mes) }))
    .filter((x): x is { a: AnyRecord; mes: string } => x.mes !== null && x.mes >= desde && x.mes <= corte);

  const porMes = new Map<string, { total: number; empleadores: Set<string> }>();
  for (const { a, mes } of enVentana) {
    const fila = porMes.get(mes) ?? { total: 0, empleadores: new Set<string>() };
    fila.total += montoValido(a.salario) ?? 0;
    fila.empleadores.add(String(a.rucEmp ?? a.nomEmp ?? ""));
    porMes.set(mes, fila);
  }
  const aportesPorMes = [...porMes.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([mes, f]) => ({ mes, total: redondear2(f.total), empleadores: f.empleadores.size }));

  // Un vínculo = un empleador con una fecha de ingreso. El mismo empleador
  // con dos ingresos distintos son dos vínculos: salió y volvió.
  const vinculosPorClave = new Map<string, { filas: { a: AnyRecord; mes: string }[] }>();
  for (const x of enVentana) {
    const clave = `${x.a.rucEmp ?? x.a.nomEmp ?? ""}|${x.a.fecIng ?? ""}`;
    const v = vinculosPorClave.get(clave) ?? { filas: [] };
    v.filas.push(x);
    vinculosPorClave.set(clave, v);
  }
  const vinculos: VinculoIess[] = [...vinculosPorClave.values()]
    .map(({ filas }) => {
      filas.sort((p, q) => q.mes.localeCompare(p.mes));
      const ultima = filas[0].a;
      const codigo = codigoTipoEmpleador(ultima.tipEmp);
      return {
        empleador: textoONull(ultima.nomEmp),
        naturaleza: (codigo && NATURALEZA_POR_CODIGO[codigo]) ?? "otro",
        ocupacion: textoONull(ultima.ocupacion),
        desde: fechaIso(ultima.fecIng),
        hasta: fechaIso(ultima.fecSal),
        ultimoMes: filas[0].mes,
        mesesConAporte: new Set(filas.map((f) => f.mes)).size,
        ultimoSalario: montoValido(ultima.salario),
        vigenteAlCorte: filas[0].mes === corte,
      };
    })
    .sort((p, q) => q.ultimoMes.localeCompare(p.ultimoMes) || (q.ultimoSalario ?? 0) - (p.ultimoSalario ?? 0));

  const desde12 = mesMenos(corte, 11);
  const ultimos = (n: number) => aportesPorMes.filter((m) => m.mes >= mesMenos(corte, n - 1)).map((m) => m.total);
  const hace12 = porMes.get(mesMenos(corte, 12));

  const establecimientos = ((consultadas.establecimientoActEconomica as AnyRecord)?.data ?? {}) as AnyRecord;
  const vistas = new Set<string>();
  const actividadesEconomicas: DetalleIngresos["actividadesEconomicas"] = [];
  for (const lista of Object.values(establecimientos)) {
    if (!Array.isArray(lista)) continue;
    for (const e of lista as AnyRecord[]) {
      const actividad = textoONull(e.act_economica);
      const nombreComercial = textoONull(e.nombre_comercial);
      const clave = `${actividad}|${nombreComercial}`;
      if (vistas.has(clave) || (!actividad && !nombreComercial)) continue;
      vistas.add(clave);
      actividadesEconomicas.push({
        nombreComercial,
        actividad,
        abierto: String(e.estado_establecimiento ?? "").toUpperCase() === "ABIERTO",
        inicio: fechaIso(e.fech_inicio_actividades),
      });
    }
  }
  actividadesEconomicas.sort((p, q) => Number(q.abierto) - Number(p.abierto));

  const renta = ((((consultadas.sriImpuestoRenta as AnyRecord)?.data as AnyRecord)?.data as AnyRecord[]) ?? [])
    .flatMap((x) => (Array.isArray(x.impuestosRenta) ? (x.impuestosRenta as AnyRecord[]) : []));
  const numeroONull = (v: unknown): number | null => {
    const n = Number(v);
    return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
  };
  const impuestoRentaPorAnio = renta
    .map((r) => ({
      anio: Number(r.periodoFiscal),
      formulario: textoONull(String(r.formulario ?? "")),
      causado: numeroONull(r.rentaCausadoRetenido),
      enRelacionDeDependencia: numeroONull(r.rentaCausadoRetenidoRelacionDependencia),
    }))
    .filter((r) => Number.isInteger(r.anio))
    .sort((p, q) => q.anio - p.anio);

  return {
    aportesPorMes,
    vinculos,
    mesesConAporteUltimos12: aportesPorMes.filter((m) => m.mes >= desde12).length,
    mesesConAporteUltimos24: aportesPorMes.length,
    promedioUltimos6: promedio(ultimos(6)),
    promedioUltimos12: promedio(ultimos(12)),
    totalHace12Meses: hace12 && hace12.total > 0 ? redondear2(hace12.total) : null,
    continuidadLaboral: construirContinuidad(aportes, corte, consultadas),
    actividadesEconomicas,
    impuestoRentaPorAnio,
  };
}

const ETIQUETA_NATURALEZA: Record<Naturaleza, string> = {
  publico: "empleo en el sector público",
  diplomatico: "empleo en misión diplomática u organismo internacional",
  privado: "empleo en relación de dependencia",
  domestico: "empleo doméstico",
  cuenta_propia: "trabajo por cuenta propia",
  agricola: "trabajo agrícola",
  hogar: "trabajo no remunerado del hogar",
  otro: "aporte de tipo no clasificado",
};

const SEGMENTO_POR_NATURALEZA: Record<Naturaleza, Segmento> = {
  publico: "publico",
  diplomatico: "diplomatico",
  privado: "dependiente_privado",
  domestico: "empleo_domestico",
  cuenta_propia: "independiente",
  agricola: "agricola",
  hogar: "trabajo_hogar",
  otro: "no_clasificado",
};

export function analizarFuentesIngreso(
  raw: RespuestaNovadata,
  nombreCliente: string | null,
  corteConocido: string = CORTE_IESS_CONOCIDO
): AnalisisFuentesIngreso {
  // Las 52 fuentes consultadas, planas. Se llaman "consultadas" y no
  // "fuentes" porque en este archivo una fuente es de dónde sale la
  // plata de alguien, no un endpoint de Novadata.
  const consultadas = raw as unknown as AnyRecord;

  const basesInternas = (((consultadas.basesInternas as AnyRecord)?.data as AnyRecord)?.data ??
    ((consultadas.basesInternas as AnyRecord)?.data as AnyRecord) ?? {}) as AnyRecord;
  const aportes = (Array.isArray(basesInternas.tiess) ? basesInternas.tiess : []) as AnyRecord[];

  // ---- Corte y vigencia ----
  let ultimoMesCliente: string | null = null;
  for (const a of aportes) {
    const k = mesClave(a.anio, a.mes);
    if (k && (!ultimoMesCliente || k > ultimoMesCliente)) ultimoMesCliente = k;
  }
  // Si el cliente trae un mes posterior al corte configurado, el corte
  // avanzó y el parámetro quedó viejo: se usa el del cliente y se avisa.
  const corteDesactualizado = Boolean(ultimoMesCliente && ultimoMesCliente > corteConocido);
  const corte = corteDesactualizado && ultimoMesCliente ? ultimoMesCliente : corteConocido;

  const apareceEnUltimoCorte = ultimoMesCliente === null ? null : ultimoMesCliente === corte;
  const cortesDesdeLaDesvinculacion =
    ultimoMesCliente && ultimoMesCliente < corte ? diferenciaEnMeses(ultimoMesCliente, corte) : null;

  const aportesVigentes = ultimoMesCliente === corte
    ? aportes.filter((a) => mesClave(a.anio, a.mes) === corte)
    : [];

  // ---- Fuentes ----
  const fuentes: FuenteIngreso[] = [];
  const anioCorte = Number(corte.slice(0, 4));
  const sbu = SBU_POR_ANIO[anioCorte] ?? SBU_POR_DEFECTO;

  for (const a of aportesVigentes) {
    const codigo = codigoTipoEmpleador(a.tipEmp);
    const naturaleza: Naturaleza = (codigo && NATURALEZA_POR_CODIGO[codigo]) ?? "otro";
    const monto = montoValido(a.salario);
    const esAutoafiliado = naturaleza === "cuenta_propia";
    const evidencia: CalidadEvidencia = esAutoafiliado
      ? monto !== null && monto > sbu * 1.05
        ? "autodeclarada_sobre_minimo"
        : "autodeclarada_en_minimo"
      : "reportada_por_tercero";
    fuentes.push({
      tipo: ETIQUETA_NATURALEZA[naturaleza],
      naturaleza,
      montoMensualReportado: monto,
      evidencia,
      empleador: (a.nomEmp as string) ?? null,
      vigenteAlCorte: true,
      detalle: esAutoafiliado
        ? `Aporte propio sobre una base de $${monto ?? "?"} (SBU del año: $${sbu}). La base la elige el afiliado.`
        : `Reportado por ${(a.nomEmp as string) ?? "el empleador"} en el corte ${corte}. Es lo que declara el empleador: el sueldo real puede ser mayor.`,
    });
  }

  // Jubilación
  const jubilados = ((consultadas.jubilados as AnyRecord)?.data as AnyRecord)?.trabajos;
  const esJubilado = Array.isArray(jubilados) && jubilados.length > 0;
  if (esJubilado) {
    fuentes.push({
      tipo: "jubilación",
      naturaleza: null,
      montoMensualReportado: null,
      evidencia: "indirecta",
      empleador: null,
      vigenteAlCorte: true,
      detalle: "Registra jubilación en el IESS. La fuente no expone el monto de la pensión.",
    });
  }

  // Pensión alimenticia que PERCIBE (como representante legal). No es la
  // que paga -- esa es un egreso y vive en riesgoJudicialCivil.
  const supas = [
    ...((((consultadas.pensionAlimenticia as AnyRecord)?.data as AnyRecord)?.supas as AnyRecord[]) ?? []),
    ...((((consultadas.pensionAlimenticiaNovadata as AnyRecord)?.data as AnyRecord)?.supas as AnyRecord[]) ?? []),
  ];
  if (supas.some((s) => mismoNombre(s.representanteLegal, nombreCliente))) {
    fuentes.push({
      tipo: "pensión alimenticia percibida",
      naturaleza: null,
      montoMensualReportado: null,
      evidencia: "indirecta",
      empleador: null,
      vigenteAlCorte: true,
      detalle: "Figura como representante legal en un registro de pensión alimenticia: percibe la pensión, no la paga.",
    });
  }

  // ---- Señales de escala (tamaño de la actividad, no ingreso) ----
  const senalesDeEscala: SenalEscala[] = [];
  const empleados = ((((consultadas.empleados as AnyRecord)?.data as AnyRecord)?.empleados as AnyRecord[]) ?? []);
  if (empleados.length) {
    let mesNomina = "";
    for (const e of empleados) {
      const k = mesClave(e.anio, e.mes);
      if (k && k > mesNomina) mesNomina = k;
    }
    const delMes = empleados.filter((e) => mesClave(e.anio, e.mes) === mesNomina);
    const nomina = delMes.reduce((acc, e) => acc + (montoValido(e.salario) ?? 0), 0);
    senalesDeEscala.push({
      senal: "nómina que paga",
      valor: Math.round(nomina),
      detalle: `Paga ${delMes.length} empleado(s) por $${Math.round(nomina)} mensuales (corte ${mesNomina}). Su actividad genera al menos eso.`,
    });
  }

  const contribuyentes = ((((consultadas.contribuyente as AnyRecord)?.data as AnyRecord)?.datosContribuyente as AnyRecord[]) ?? [])
    .filter((c) => c.ruc && c.fecha_inscripcion_ruc);
  const rucActivo = contribuyentes.some((c) => !c.fecha_cancelacion && !c.fecha_suspension_definitiva);
  if (contribuyentes.some((c) => String(c.obligado).toUpperCase() === "SI")) {
    senalesDeEscala.push({
      senal: "obligado a llevar contabilidad",
      valor: null,
      detalle: "El SRI lo obliga a llevar contabilidad, lo que implica haber superado los umbrales de ingresos, costos o capital de ese régimen.",
    });
  }

  const establecimientos = (consultadas.establecimientoActEconomica as AnyRecord)?.data as AnyRecord | undefined;
  const numEstablecimientos = establecimientos
    ? Object.values(establecimientos).filter(Array.isArray).reduce((acc, v) => acc + (v as unknown[]).length, 0)
    : 0;
  if (numEstablecimientos > 0) {
    senalesDeEscala.push({
      senal: "establecimientos registrados",
      valor: numEstablecimientos,
      detalle: `Tiene ${numEstablecimientos} establecimiento(s) registrado(s) ante el SRI.`,
    });
  }

  const declaraRenta = ((((consultadas.sriImpuestoRenta as AnyRecord)?.data as AnyRecord)?.data as AnyRecord[]) ?? [])
    .some((x) => Array.isArray(x.impuestosRenta) && (x.impuestosRenta as unknown[]).length > 0);

  // Actividad económica propia sin monto asociado: no es una cifra pero
  // sí una fuente, y omitirla dejaría al cliente como "sin ingresos".
  if (rucActivo && !fuentes.some((f) => f.naturaleza === "cuenta_propia")) {
    fuentes.push({
      tipo: "actividad económica propia",
      naturaleza: "cuenta_propia",
      montoMensualReportado: null,
      evidencia: "indirecta",
      empleador: null,
      vigenteAlCorte: true,
      detalle: "RUC activo ante el SRI. Hay actividad, pero ninguna fuente pública expone cuánto genera.",
    });
  }

  // Quien paga una nómina mayor que su propio ingreso reportado es
  // dueño de la actividad, no un empleado más. Caso real: alguien con
  // 154 empleados y $77.670 de nómina figuraba afiliado con $523,70 --
  // clasificarlo por ese aporte lo dejaba como "dependiente privado",
  // que describe mal de dónde vive.
  const nomina = senalesDeEscala.find((s) => s.senal === "nómina que paga")?.valor ?? null;
  const ingresoPropioReportado = fuentes.reduce((acc, f) => acc + (f.montoMensualReportado ?? 0), 0);
  const nominaSuperaSuIngreso = nomina !== null && nomina > ingresoPropioReportado;
  if (nominaSuperaSuIngreso) {
    fuentes.push({
      tipo: "actividad empresarial propia",
      naturaleza: "cuenta_propia",
      montoMensualReportado: null,
      evidencia: "indirecta",
      empleador: null,
      vigenteAlCorte: true,
      detalle: `Paga una nómina de $${nomina} mensuales, muy por encima de su propio aporte reportado ($${Math.round(ingresoPropioReportado)}). El retiro que obtiene de esa actividad no está en ninguna fuente pública.`,
    });
  }

  // ---- Segmento ----
  const porNaturaleza = new Map<Naturaleza, number>();
  for (const f of fuentes) {
    if (!f.naturaleza || f.montoMensualReportado === null) continue;
    porNaturaleza.set(f.naturaleza, (porNaturaleza.get(f.naturaleza) ?? 0) + f.montoMensualReportado);
  }
  const totalReportado = [...porNaturaleza.values()].reduce((a, b) => a + b, 0);
  const ordenadas = [...porNaturaleza.entries()].sort((a, b) => b[1] - a[1]);

  let segmento: Segmento;
  let estadoSegmento: EstadoSegmento;
  let motivoSegmento: string;

  // Una actividad propia que este módulo dedujo (RUC activo o nómina), sin
  // monto. No es un aporte: por eso se distingue de las fuentes del IESS.
  const tieneActividadPropia = fuentes.some((f) => f.naturaleza === "cuenta_propia" && f.evidencia === "indirecta");
  // Las naturalezas donde el monto lo elige la persona, o no sabemos qué
  // es. Valen igual para una sola fuente que para una mezcla.
  const esProvisional = (n: Naturaleza) => n === "cuenta_propia" || n === "agricola" || n === "otro";

  if (esJubilado && ordenadas.length === 0 && !tieneActividadPropia) {
    segmento = "jubilado";
    estadoSegmento = "confirmada";
    motivoSegmento = "Registra jubilación en el IESS y no tiene aportes vigentes.";
  } else if (esJubilado) {
    segmento = "jubilado_con_ingreso_adicional";
    estadoSegmento = "provisional";
    motivoSegmento =
      ordenadas.length > 0
        ? "Registra jubilación y además aportes vigentes al corte."
        : rucActivo
          ? "Registra jubilación y además RUC activo ante el SRI: tiene una actividad propia cuyo ingreso no se conoce."
          : `Registra jubilación y además paga una nómina de $${nomina} mensuales: tiene una actividad propia cuyo ingreso no se conoce.`;
  } else if (ordenadas.length > 1 && totalReportado > 0 && ordenadas[0][1] / totalReportado < 2 / 3) {
    // Dos naturalezas y ninguna domina: clasificar por la mayor sería
    // decidir por diferencias de pocos dólares, y además sería falso --
    // quien tiene ingresos de origen distinto está más diversificado.
    segmento = "ingresos_mixtos";
    const algunaProvisional = ordenadas.some(([n]) => esProvisional(n));
    estadoSegmento = algunaProvisional ? "provisional" : "confirmada";
    motivoSegmento = `Ingresos de naturaleza distinta sin que ninguna supere dos tercios del total ($${Math.round(totalReportado)} en el corte ${corte}).${
      algunaProvisional ? " Una parte no la reporta un tercero (aporte propio o de tipo desconocido), así que no está confirmada." : ""
    }`;
  } else if (ordenadas.length > 0) {
    const [naturaleza, monto] = ordenadas[0];
    segmento = SEGMENTO_POR_NATURALEZA[naturaleza];
    // "otro" nunca se da por confirmado: es un código que no conocemos,
    // así que el caso tiene que llegar a una persona.
    estadoSegmento = esProvisional(naturaleza) ? "provisional" : "confirmada";
    // `||` y no `??`: 17 perfiles llegaron con el tipo de empleador en
    // texto vacío y el motivo decía "no reconoce ()".
    motivoSegmento =
      naturaleza === "otro"
        ? `Aporta bajo un tipo de empleador que el módulo no reconoce (${String(
            aportesVigentes.find((a) => !NATURALEZA_POR_CODIGO[codigoTipoEmpleador(a.tipEmp) ?? ""])?.tipEmp || "sin etiqueta"
          ).slice(0, 60)}). Requiere revisión manual.`
        : `${Math.round((monto / totalReportado) * 100)}% del ingreso reportado en el corte ${corte} viene de ${ETIQUETA_NATURALEZA[naturaleza]}.`;
    // El aporte dice de dónde cotiza, no de dónde vive: si paga una
    // nómina mayor que su propio aporte, el ingreso principal está en
    // su actividad y no en ese vínculo.
    if (nominaSuperaSuIngreso) {
      estadoSegmento = "provisional";
      motivoSegmento += ` Aun así paga una nómina de $${nomina} mensuales, muy superior a ese aporte: su ingreso principal probablemente venga de su actividad y no de ese vínculo.`;
    }
  } else if (aportesVigentes.length > 0) {
    // Hay aporte vigente pero sin monto (llegó en cero o sin el campo).
    // Sólo los APORTES: hasta v3 esta rama miraba cualquier fuente con
    // naturaleza, así que el RUC activo o la nómina -- que no son aportes
    // -- terminaban acá con un motivo que afirmaba un vínculo con el IESS
    // inexistente (455 perfiles).
    const conNaturaleza = fuentes.filter((f) => f.evidencia !== "indirecta" && f.naturaleza);
    const frecuencia = new Map<Naturaleza, number>();
    for (const f of conNaturaleza) frecuencia.set(f.naturaleza!, (frecuencia.get(f.naturaleza!) ?? 0) + 1);
    const principal = [...frecuencia.entries()].sort((a, b) => b[1] - a[1])[0][0];
    segmento = SEGMENTO_POR_NATURALEZA[principal];
    estadoSegmento = "provisional";
    motivoSegmento = `Vínculo vigente al corte ${corte} (${ETIQUETA_NATURALEZA[principal]}), pero la fuente no trae el monto del aporte.`;
  } else if (rucActivo || declaraRenta || nominaSuperaSuIngreso) {
    segmento = "independiente";
    estadoSegmento = "provisional";
    motivoSegmento = motivoSinAportes(rucActivo, declaraRenta, nominaSuperaSuIngreso ? nomina : null);
  } else if (!sePuedeAfirmarQueNoAporta(raw)) {
    // No encontramos aportes, pero tampoco preguntamos bien: el bloque
    // que los trae no contestó. "No aporta" y "no sé si aporta" son
    // cosas distintas y hasta hoy salían por la misma puerta.
    //
    // El 2026-09-15 una caída de una hora mandó 373 personas a
    // "informal o sin actividad" por esta rama. El 74% de ese segmento
    // era, en realidad, una falla de red descrita como si fuera la vida
    // de alguien. Ver _shared/calidad-de-la-consulta.ts.
    segmento = "sin_datos";
    estadoSegmento = "indeterminada";
    motivoSegmento = `La fuente que trae los aportes al IESS (basesInternas) no respondió (estado: ${raw.basesInternas?.status ?? "desconocido"}). No se puede afirmar que esta persona no aporte: no se pudo consultar.`;
  } else {
    segmento = "informal_o_sin_actividad";
    estadoSegmento = "indeterminada";
    motivoSegmento =
      cortesDesdeLaDesvinculacion !== null
        ? `Sin aportes desde ${ultimoMesCliente} (${cortesDesdeLaDesvinculacion} mes(es) antes del corte ${corte}), sin RUC activo ni jubilación.`
        : "No registra aportes al IESS, RUC activo ni jubilación. Con datos públicos no se distingue trabajo informal de ausencia de actividad.";
  }

  // ---- Qué pedir para confirmar ----
  const paraConfirmar: string[] = [];
  if (fuentes.some((f) => f.evidencia === "autodeclarada_en_minimo" || f.evidencia === "autodeclarada_sobre_minimo")) {
    paraConfirmar.push("Movimientos bancarios de los últimos 6 meses, para contrastar los depósitos contra la base de aporte que la persona eligió.");
  }
  if (fuentes.some((f) => f.evidencia === "indirecta" && f.naturaleza === "cuenta_propia")) {
    paraConfirmar.push("Declaraciones de IVA de los últimos 6 meses o facturación emitida, para dimensionar la actividad registrada en el SRI.");
  }
  if (segmento === "informal_o_sin_actividad") {
    paraConfirmar.push("Preguntar directamente de qué vive: con datos públicos no se distingue el trabajo informal de la ausencia de ingresos.");
  }
  if (apareceEnUltimoCorte === false) {
    paraConfirmar.push(`Certificado de afiliación actualizado del IESS: no aparece en el corte ${corte} y el último registro es de ${ultimoMesCliente}.`);
  }
  if (esJubilado) {
    paraConfirmar.push("Comprobante de pensión: la fuente confirma la jubilación pero no expone el monto.");
  }

  const pisoIngresoMensualReportado = totalReportado > 0 ? Math.round(totalReportado * 100) / 100 : null;
  const detalle = construirDetalle(aportes, corte, consultadas);

  return {
    version: FUENTES_INGRESO_VERSION,
    corteIessUsado: corte,
    corteDesactualizado,
    segmento,
    estadoSegmento,
    motivoSegmento,
    apareceEnUltimoCorte,
    cortesDesdeLaDesvinculacion,
    fuentes,
    pisoIngresoMensualReportado,
    senalesDeEscala,
    paraConfirmar,
    detalle,
  };
}
