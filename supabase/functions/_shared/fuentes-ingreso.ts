// Fuentes de ingreso: de qué vive el cliente y qué tan evidenciado está.
//
// Módulo aparte de process.ts a propósito: sus reglas se van a afinar
// cada vez que aparezca un caso raro, y no conviene que cada ajuste
// obligue a revalidar los 125 campos del perfil. Tiene su propia versión.
//
// PRINCIPIO RECTOR — TODO LO QUE PRODUCE SON PISOS, NO CIFRAS.
// Ninguna fuente pública dice cuánto gana alguien en Ecuador:
//   - El empleador subdeclara el sueldo para pagar menos aportes (gana
//     900, lo reportan con 500). Pasa y no lo vamos a detectar.
//   - Quien se autoafilia elige su base de aporte.
//   - Con 3,8 millones de empleos formales sobre 9 millones de PEA, la
//     mayoría de la actividad económica no deja rastro declarado.
// Por eso nunca se escribe "ingreso: $500" sino "reportado al IESS: al
// menos $500". Un analista lee cosas distintas en cada frase, y la
// segunda es la verdadera. Estimar el ingreso real es un modelo aparte,
// con decenas de miles de casos -- no se resuelve con reglas acá.
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

import type { RawNovadataResponse } from "./types.ts";

export const FUENTES_INGRESO_VERSION = "fuentes-v1";

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

// Naturaleza del vínculo según el código de tipo de empleador del IESS.
// Se lee SIEMPRE el número: las etiquetas vienen sucias, truncadas a
// distinto largo y con la codificación rota ("ENTIDADES P+BLICAS").
const NATURALEZA_POR_CODIGO: Record<string, Naturaleza> = {
  "9": "publico", "10": "publico", "12": "publico", "14": "publico", "16": "publico",
  "29": "diplomatico",
  "1": "privado", "2": "privado", "6": "privado", "13": "privado", "26": "privado", "27": "privado", "28": "privado",
  "25": "domestico",
  "3": "cuenta_propia", "8": "cuenta_propia", "31": "cuenta_propia", "32": "cuenta_propia", "34": "cuenta_propia",
  "4": "agricola", "7": "agricola",
  "35": "hogar",
};

export type Naturaleza =
  | "publico" | "diplomatico" | "privado" | "domestico"
  | "cuenta_propia" | "agricola" | "hogar" | "otro";

export type CalidadEvidencia =
  // Un tercero declara y paga sobre esa base. Sigue siendo un piso: el
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
  // Suma de los montos reportados de las fuentes vigentes. Es un PISO
  // del ingreso, nunca el ingreso.
  pisoIngresoMensualReportado: number | null;
  senalesDeEscala: SenalEscala[];
  paraConfirmar: string[];
}

type AnyRecord = Record<string, unknown>;

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
// negativo suelto, y un negativo arrastra el piso de ingreso hacia abajo
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
  raw: RawNovadataResponse,
  nombreCliente: string | null,
  corteConocido: string = CORTE_IESS_CONOCIDO
): AnalisisFuentesIngreso {
  const bancos = (raw.bancos?.data ?? {}) as AnyRecord;
  const trabajo = (raw.trabajo?.data ?? {}) as AnyRecord;
  const iess = (raw.iess?.data ?? {}) as AnyRecord;
  const judicial = (raw.funcion_judicial?.data ?? {}) as AnyRecord;

  const basesInternas = (((bancos.basesInternas as AnyRecord)?.data as AnyRecord)?.data ??
    ((bancos.basesInternas as AnyRecord)?.data as AnyRecord) ?? {}) as AnyRecord;
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
        ? `Aporte propio sobre una base de $${monto ?? "?"} (salario básico del año: $${sbu}). La base la elige el afiliado.`
        : `Reportado por ${(a.nomEmp as string) ?? "el empleador"} en el corte ${corte}. Es un piso: el empleador puede declarar menos que el sueldo real.`,
    });
  }

  // Jubilación
  const jubilados = ((iess.jubilados as AnyRecord)?.data as AnyRecord)?.trabajos;
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
    ...((((judicial.pensionAlimenticia as AnyRecord)?.data as AnyRecord)?.supas as AnyRecord[]) ?? []),
    ...((((judicial.pensionAlimenticiaNovadata as AnyRecord)?.data as AnyRecord)?.supas as AnyRecord[]) ?? []),
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
  const empleados = ((((trabajo.empleados as AnyRecord)?.data as AnyRecord)?.empleados as AnyRecord[]) ?? []);
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

  const contribuyentes = ((((trabajo.contribuyente as AnyRecord)?.data as AnyRecord)?.datosContribuyente as AnyRecord[]) ?? [])
    .filter((c) => c.ruc && c.fecha_inscripcion_ruc);
  const rucActivo = contribuyentes.some((c) => !c.fecha_cancelacion && !c.fecha_suspension_definitiva);
  if (contribuyentes.some((c) => String(c.obligado).toUpperCase() === "SI")) {
    senalesDeEscala.push({
      senal: "obligado a llevar contabilidad",
      valor: null,
      detalle: "El SRI lo obliga a llevar contabilidad, lo que implica haber superado los umbrales de ingresos, costos o capital de ese régimen.",
    });
  }

  const establecimientos = (trabajo.establecimientoActEconomica as AnyRecord)?.data as AnyRecord | undefined;
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

  const declaraRenta = ((((trabajo.sriImpuestoRenta as AnyRecord)?.data as AnyRecord)?.data as AnyRecord[]) ?? [])
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

  if (esJubilado && ordenadas.length === 0) {
    segmento = "jubilado";
    estadoSegmento = "confirmada";
    motivoSegmento = "Registra jubilación en el IESS y no tiene aportes vigentes.";
  } else if (esJubilado && ordenadas.length > 0) {
    segmento = "jubilado_con_ingreso_adicional";
    estadoSegmento = "provisional";
    motivoSegmento = "Registra jubilación y además aportes vigentes al corte.";
  } else if (ordenadas.length > 1 && totalReportado > 0 && ordenadas[0][1] / totalReportado < 2 / 3) {
    // Dos naturalezas y ninguna domina: clasificar por la mayor sería
    // decidir por diferencias de pocos dólares, y además sería falso --
    // quien tiene ingresos de origen distinto está más diversificado.
    segmento = "ingresos_mixtos";
    estadoSegmento = "confirmada";
    motivoSegmento = `Ingresos de naturaleza distinta sin que ninguna supere dos tercios del total ($${Math.round(totalReportado)} en el corte ${corte}).`;
  } else if (ordenadas.length > 0) {
    const [naturaleza, monto] = ordenadas[0];
    segmento = SEGMENTO_POR_NATURALEZA[naturaleza];
    // "otro" nunca se da por confirmado: es un código que no conocemos,
    // así que el caso tiene que llegar a una persona.
    estadoSegmento =
      naturaleza === "cuenta_propia" || naturaleza === "agricola" || naturaleza === "otro" ? "provisional" : "confirmada";
    motivoSegmento =
      naturaleza === "otro"
        ? `Aporta bajo un tipo de empleador que el módulo no reconoce (${String(
            aportesVigentes.find((a) => !NATURALEZA_POR_CODIGO[codigoTipoEmpleador(a.tipEmp) ?? ""])?.tipEmp ?? "sin etiqueta"
          ).slice(0, 60)}). Requiere revisión manual.`
        : `${Math.round((monto / totalReportado) * 100)}% del ingreso reportado en el corte ${corte} viene de ${ETIQUETA_NATURALEZA[naturaleza]}.`;
    // El aporte dice de dónde cotiza, no de dónde vive: si paga una
    // nómina mayor que su propio aporte, el ingreso principal está en
    // su actividad y no en ese vínculo.
    if (nominaSuperaSuIngreso) {
      estadoSegmento = "provisional";
      motivoSegmento += ` Aun así paga una nómina de $${nomina} mensuales, muy superior a ese aporte: su ingreso principal probablemente venga de su actividad y no de ese vínculo.`;
    }
  } else if (fuentes.some((f) => f.vigenteAlCorte && f.naturaleza)) {
    // Hay vínculo vigente pero sin monto (el aporte llegó en cero o sin
    // el campo). Antes esto caía en la rama de "sin aportes vigentes" y
    // el motivo contradecía a las fuentes listadas abajo.
    const conNaturaleza = fuentes.filter((f) => f.vigenteAlCorte && f.naturaleza);
    const frecuencia = new Map<Naturaleza, number>();
    for (const f of conNaturaleza) frecuencia.set(f.naturaleza!, (frecuencia.get(f.naturaleza!) ?? 0) + 1);
    const principal = [...frecuencia.entries()].sort((a, b) => b[1] - a[1])[0][0];
    segmento = SEGMENTO_POR_NATURALEZA[principal];
    estadoSegmento = "provisional";
    motivoSegmento = `Vínculo vigente al corte ${corte} (${ETIQUETA_NATURALEZA[principal]}), pero la fuente no trae el monto del aporte.`;
  } else if (rucActivo || declaraRenta) {
    segmento = "independiente";
    estadoSegmento = "provisional";
    motivoSegmento = rucActivo
      ? "Sin aportes vigentes, pero con RUC activo ante el SRI."
      : "Sin aportes vigentes ni RUC activo; registra declaraciones al SRI.";
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
  };
}
