// Del crudo de Equifax a tablas: el paso 2 de docs/propuesta-estructura-equifax.md
// (JSON → tablas → estructura → perfil del modelo).
//
// Una función PURA y determinista: la misma respuesta da siempre las mismas
// filas, en el mismo orden. Por eso las tablas se pueden borrar y rehacer
// desde el crudo sin volver a pagar (cada consulta a Equifax se cobra), y por
// eso lleva versión: cuando cambia una regla de acá se sube
// EQUIFAX_TABLAS_VERSION y se rehacen las consultas con una versión anterior
// (scripts/cargar-tablas-equifax.mjs).
//
// Lo que resuelve este paso, para que el siguiente sólo cuente y sume:
//   - el rol viene como TITULAR y como Titular: se normaliza;
//   - las fechas vienen de cuatro formas (31/08/2026, 2026-08-31 00:00:00.000,
//     2026 Ago, Oct 2026): salen ISO;
//   - una operación NO se puede seguir de un mes a otro: estas listas no traen
//     su número (es dato personal) y ninguna combinación de campos la
//     identifica (el 2026-10-12, 788 pares de filas de un mismo mes
//     compartían institución y apertura, y el cupo cambiaba entre meses en
//     191 grupos). Una «huella» inventada contaba como varias a una misma
//     operación: por eso la estructura cuenta por mes, no por operación;
//   - los datos personales NO pasan a las tablas (nombre, documento,
//     direcciones, coordenadas, teléfonos, nombres e identificaciones de
//     terceros, números de operación y de tarjeta): se quedan sólo en el
//     crudo. La prueba (equifax-tablas.test.ts) lo vigila con valores
//     centinela.
//
// Una fila inservible (sin institución, o una fila de totales como las que
// Aval mezclaba) se OMITE y queda dicho en `avisos`: nunca en silencio.
// Una lista que no vino no es una lista vacía: `cobertura` dice null para la
// primera y 0 para la segunda, y la estructura no los confunde.
//
// Nada de acá toca la base: persistir es equifax_reemplazar_tablas (126).
//
// AVISO: Node 24 ejecuta este archivo borrando los tipos (scripts/): sólo
// sintaxis que se pueda borrar (nada de enum, namespace ni propiedades de
// parámetro).

export const EQUIFAX_TABLAS_VERSION = "equifax-tablas-v1";

export type Sistema = "bancos" | "cooperativas" | "comercial";
export const SISTEMAS: readonly Sistema[] = ["bancos", "cooperativas", "comercial"];
export type Rol = "titular" | "codeudor" | "garante" | "otro";

// ---------------------------------------------------------------------------
// La especificación de las tablas: UNA sola lista de columnas, de la que salen
// los tipos de las filas y la comprobación contra la base
// (scripts/cargar-tablas-equifax.mjs compara estas columnas con las de
// information_schema). Las columnas son las de la migración 126, sin
// consulta_equifax_id, que la pone la función de la base.
// ---------------------------------------------------------------------------
type Tipo = "texto" | "numero" | "entero" | "fecha" | "booleano";
type ValorDe<T extends Tipo> = T extends "texto" | "fecha" ? string | null : T extends "booleano" ? boolean | null : number | null;
type FilaDe<E extends Record<string, Tipo>> = { -readonly [K in keyof E]: ValorDe<E[K]> };

const TRAMOS_VENCIDO = {
  vencido_0_a_1_mes_usd: "numero",
  vencido_1_a_2_meses_usd: "numero",
  vencido_2_a_3_meses_usd: "numero",
  vencido_3_a_6_meses_usd: "numero",
  vencido_6_a_9_meses_usd: "numero",
  vencido_9_a_12_meses_usd: "numero",
  vencido_12_a_24_meses_usd: "numero",
  vencido_24_a_36_meses_usd: "numero",
  vencido_mas_de_36_meses_usd: "numero",
} as const;

export const ESPECIFICACION_DE_TABLAS = {
  equifax_operaciones: {
    orden: "entero", sistema: "texto", institucion: "texto", fecha_corte: "fecha", rol: "texto", rol_original: "texto",
    tipo_credito: "texto", cupo_monto_original_usd: "numero", fecha_apertura: "fecha", fecha_vencimiento: "fecha",
    por_vencer_usd: "numero", no_devenga_intereses_usd: "numero", vencido_usd: "numero", demanda_judicial_usd: "numero",
    cartera_castigada_usd: "numero", saldo_deuda_usd: "numero", cuota_mensual_usd: "numero", dias_morosidad: "entero",
  },
  equifax_historia_mensual: {
    orden: "entero", sistema: "texto", institucion: "texto", fecha_corte: "fecha", rol: "texto", rol_original: "texto",
    tipo_credito: "texto", cupo_monto_original_usd: "numero", fecha_apertura: "fecha", fecha_vencimiento: "fecha",
    por_vencer_usd: "numero", no_devenga_intereses_usd: "numero", vencido_usd: "numero", demanda_judicial_usd: "numero",
    cartera_castigada_usd: "numero", saldo_deuda_usd: "numero", dias_morosidad: "entero",
  },
  equifax_deuda_por_sistema_y_mes: {
    orden: "entero", origen: "texto", sistema: "texto", fecha_corte: "fecha",
    por_vencer_usd: "numero", no_devenga_intereses_usd: "numero", vencido_usd: "numero", saldo_deuda_usd: "numero",
    demanda_judicial_usd: "numero", cartera_castigada_usd: "numero",
    ...TRAMOS_VENCIDO,
  },
  equifax_vencimientos: {
    orden: "entero", origen: "texto", sistema: "texto", institucion: "texto", fecha_corte: "fecha",
    por_vencer_usd: "numero", vencido_usd: "numero", no_devenga_intereses_usd: "numero", saldo_deuda_usd: "numero",
    demanda_judicial_usd: "numero", cartera_castigada_usd: "numero",
    por_vencer_0_a_1_mes_usd: "numero", por_vencer_1_a_3_meses_usd: "numero", por_vencer_3_a_6_meses_usd: "numero",
    por_vencer_6_a_12_meses_usd: "numero", por_vencer_mas_de_12_meses_usd: "numero",
    ...TRAMOS_VENCIDO,
  },
  equifax_tarjetas: {
    orden: "entero", estado: "texto", institucion: "texto", emisor: "texto", antiguedad_meses: "entero", cupo_usd: "numero",
    saldo_actual_usd: "numero", saldo_promedio_6_meses_usd: "numero", uso_segun_equifax_porcentaje: "numero",
    fecha_corte: "fecha", fecha_cancelacion: "fecha",
  },
  equifax_creditos: {
    orden: "entero", origen: "texto", institucion: "texto", estado_operacion: "texto", tipo_credito: "texto",
    valor_operacion_usd: "numero", titular_usd: "numero", codeudor_usd: "numero", garante_usd: "numero",
    fecha_concesion: "fecha", fecha_vencimiento: "fecha", fecha_corte: "fecha", fecha_cancelacion: "fecha",
  },
  equifax_consultas_recibidas: { orden: "entero", entidad: "texto", mes: "fecha", es_novacredit: "booleano" },
  equifax_scores: {
    orden: "entero", tipo: "texto", retroactivo_meses: "entero", score: "numero", score_minimo: "numero", score_maximo: "numero",
    total_acumulado_porcentaje: "numero", tasa_de_malos_acumulada_porcentaje: "numero", fecha_inicial: "fecha", fecha_final: "fecha",
    rango_texto: "texto", segmentacion: "texto", porcentaje: "numero", probabilidad_porcentaje: "numero",
  },
  equifax_indicadores_por_periodo: {
    orden: "entero", origen: "texto", indicador: "texto", retroactivo_meses: "entero", valor_numero: "numero", valor_texto: "texto", fecha: "fecha",
  },
  equifax_codeudor_garante: { orden: "entero", vigente: "booleano", tipo_deudor: "texto", institucion: "texto", deuda_total_usd: "numero" },
  equifax_resumen: {
    impagos_numero: "entero", impagos_monto_usd: "numero", demanda_judicial_numero: "entero", demanda_judicial_monto_usd: "numero",
    cartera_castigada_numero: "entero", cartera_castigada_monto_usd: "numero",
    morosidades_numero: "entero", morosidades_monto_usd: "numero", morosidades_total_operaciones: "entero", protestos_numero: "entero",
    cuota_estimada_mensual_usd: "numero", cuota_creditos_comerciales_numero: "entero", cuota_total_vencido_usd: "numero",
    cuota_total_demanda_usd: "numero", cuota_total_cartera_usd: "numero", cuota_creditos_iece_numero: "entero",
    cuota_operaciones_excluidas_numero: "entero",
    inhabilitaciones_numero: "entero", ultima_inhabilitacion_fecha: "fecha", ultima_inhabilitacion_accion: "texto",
    ultima_inhabilitacion_motivo: "texto", primer_credito_fecha: "fecha",
    factores_operaciones_historicas_numero: "entero", factores_operaciones_vigentes_numero: "entero",
    factores_operaciones_vencidas_numero: "entero", factores_saldo_por_vencer_usd: "numero", factores_saldo_vencido_usd: "numero",
    factores_saldo_demanda_judicial_usd: "numero", factores_saldo_cartera_castigada_usd: "numero",
    factores_maximo_saldo_vencido_usd: "numero", factores_meses_desde_el_primer_credito: "entero",
    factores_vencidos_actuales_numero: "entero", factores_maximo_dias_vencido: "entero", factores_saldo_deuda_nuevos_creditos_usd: "numero",
    sri_tiene_ruc: "booleano", sri_estado_contribuyente: "texto", sri_clase_contribuyente: "texto",
    sri_obligado_a_contabilidad: "booleano", sri_fecha_inicio_actividades: "fecha", sri_fecha_suspension_definitiva: "fecha",
    sri_codigo_ciiu: "texto",
    impacto_economico_indicador: "entero", impacto_economico_ingreso_usd: "numero", impacto_economico_cuota_financiera_usd: "numero",
    sujetos_al_dia_numero: "entero", consultas_recibidas_mes_inicial: "fecha", consultas_recibidas_mes_final: "fecha",
    estado_de_cartera_codigo: "entero", estado_de_cartera_descripcion: "texto", estado_de_cartera_interpretacion: "texto",
    ingreso_estimado_usd: "numero",
  },
} as const satisfies Record<string, Record<string, Tipo>>;

export type NombreDeTabla = keyof typeof ESPECIFICACION_DE_TABLAS;
export type FilaDeTabla<T extends NombreDeTabla> = FilaDe<(typeof ESPECIFICACION_DE_TABLAS)[T]>;

export type FilaOperacion = FilaDeTabla<"equifax_operaciones">;
export type FilaHistoria = FilaDeTabla<"equifax_historia_mensual">;
export type FilaDeudaPorSistema = FilaDeTabla<"equifax_deuda_por_sistema_y_mes">;
export type FilaVencimiento = FilaDeTabla<"equifax_vencimientos">;
export type FilaTarjeta = FilaDeTabla<"equifax_tarjetas">;
export type FilaCredito = FilaDeTabla<"equifax_creditos">;
export type FilaConsultaRecibida = FilaDeTabla<"equifax_consultas_recibidas">;
export type FilaScore = FilaDeTabla<"equifax_scores">;
export type FilaIndicador = FilaDeTabla<"equifax_indicadores_por_periodo">;
export type FilaCodeudorGarante = FilaDeTabla<"equifax_codeudor_garante">;
export type FilaResumen = FilaDeTabla<"equifax_resumen">;

export interface TablasEquifax {
  equifax_operaciones: FilaOperacion[];
  equifax_historia_mensual: FilaHistoria[];
  equifax_deuda_por_sistema_y_mes: FilaDeudaPorSistema[];
  equifax_vencimientos: FilaVencimiento[];
  equifax_tarjetas: FilaTarjeta[];
  equifax_creditos: FilaCredito[];
  equifax_consultas_recibidas: FilaConsultaRecibida[];
  equifax_scores: FilaScore[];
  equifax_indicadores_por_periodo: FilaIndicador[];
  equifax_codeudor_garante: FilaCodeudorGarante[];
  equifax_resumen: FilaResumen[]; // una sola fila (vacía de valores si la respuesta no trae nada)
}

export interface ResultadoDeTablas {
  version: string;
  tablas: TablasEquifax;
  // Filas de cada lista de Equifax que se leyó: null = la lista NO vino (no medido), 0 = vino vacía.
  cobertura: Record<string, number | null>;
  avisos: string[];
}

// Las columnas de cada tabla, sin consulta_equifax_id: lo que debe coincidir con la base.
export function columnasDeLaTabla(tabla: NombreDeTabla): string[] {
  return Object.keys(ESPECIFICACION_DE_TABLAS[tabla]);
}

// Una fila con TODAS las columnas (null donde no se dio valor). Una clave que
// no es columna es un error de tipeo: se corta en vez de perder el dato.
function nuevaFila<T extends NombreDeTabla>(tabla: T, valores: Partial<FilaDeTabla<T>>): FilaDeTabla<T> {
  const columnas = Object.keys(ESPECIFICACION_DE_TABLAS[tabla]);
  const fila: Record<string, unknown> = {};
  for (const c of columnas) fila[c] = null;
  for (const [k, v] of Object.entries(valores)) {
    if (!columnas.includes(k)) throw new Error(`${tabla}: "${k}" no es una columna.`);
    fila[k] = v === undefined ? null : v;
  }
  return fila as FilaDeTabla<T>;
}

// ---------------------------------------------------------------------------
// Lectores de valores sueltos
// ---------------------------------------------------------------------------
type Registro = Record<string, unknown>;

export function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function dinero(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.round(n * 100) / 100;
}

export function entero(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.round(n);
}

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
};

function fechaValida(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 2026-08-31 00:00:00.000, 2026-08-31 00:00:00.000000, 2026-08-31 y 31/08/2026.
export function fechaISO(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s);
  if (iso) return fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (dmy) return fechaValida(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

// "Oct 2026" y "2026 Ago": un mes sin día. Sale el primer día del mes.
export function mesISO(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const a = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(s);
  const b = /^(\d{4})\s+([a-z]{3})[a-z]*\.?$/.exec(s);
  const abreviatura = a ? a[1] : b ? b[2] : null;
  const anio = a ? Number(a[2]) : b ? Number(b[1]) : null;
  if (abreviatura === null || anio === null || !(abreviatura in MESES)) return null;
  return fechaValida(anio, MESES[abreviatura], 1);
}

// "Actual", "-6 Meses", "+12 Meses" → 0, -6, 12.
export function retroactivoEnMeses(v: unknown): number | null {
  const t = texto(v);
  if (t === null) return null;
  if (/^actual$/i.test(t)) return 0;
  const m = /^([+-]?\d+)\s*mes/i.exec(t);
  return m ? Number(m[1]) : null;
}

export function rolDeEquifax(v: unknown): { rol: Rol; original: string | null } {
  const original = texto(v);
  const limpio = (original ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  const rol: Rol = limpio === "TITULAR" ? "titular" : limpio === "CODEUDOR" ? "codeudor" : limpio === "GARANTE" ? "garante" : "otro";
  return { rol, original };
}

function normalizarNombre(v: string | null): string {
  return (v ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

// Una cuenta de NovaCredit no es una entidad que evalúa a la persona. Se
// escribe de dos maneras ("NOVACREDIT S. A." y "NOVACREDIT S.A."): se compara
// sin puntos ni espacios. UNINOVA no tiene nada que ver.
export function esNovaCredit(entidad: string | null): boolean {
  return normalizarNombre(entidad).replace(/ /g, "").startsWith("NOVACREDIT");
}

// ---------------------------------------------------------------------------
// La descomposición
// ---------------------------------------------------------------------------
const LISTAS_DE_DEUDA: Record<Sistema, { actual: string; historica: string }> = {
  bancos: { actual: "detalle_deuda_actual_sb", historica: "detalle_deuda_historica_sb" },
  cooperativas: { actual: "detalle_deuda_actual_seps", historica: "detalle_deuda_historica_seps" },
  comercial: { actual: "detalle_deuda_actual_sicom", historica: "detalle_deuda_historica_sicom" },
};

// valor_deuda_3_sistemas dice "Sistema Financiero Regulado SB", "Entidades
// Reguladas SEPS" y "Sector Comercial SICOM"; el resto de las listas, la
// sigla sola.
export function sistemaDeLaSigla(v: unknown): Sistema | null {
  const t = (texto(v) ?? "").toUpperCase();
  if (/\bSICOM\b/.test(t)) return "comercial";
  if (/\bSEPS\b/.test(t)) return "cooperativas";
  if (/\bSB\b/.test(t)) return "bancos";
  return null;
}

// Una fila de totales (como las de Aval) no es una operación.
function esFilaDeTotales(institucion: string | null, tipo: string | null): boolean {
  const i = (institucion ?? "").toUpperCase();
  return i === "TOTAL" || i === "-" || (tipo ?? "").toUpperCase() === "TOTAL";
}

function esRegistro(x: unknown): x is Registro {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

export function derivarTablas(cuerpo: unknown): ResultadoDeTablas {
  const avisos: string[] = [];
  const cobertura: Record<string, number | null> = {};
  const cuerpoRegistro: Registro = esRegistro(cuerpo) ? cuerpo : {};
  const rc: Registro = esRegistro(cuerpoRegistro.reporteCrediticio) ? cuerpoRegistro.reporteCrediticio : {};
  const ir: Registro = esRegistro(cuerpoRegistro.interconnectResponse) ? cuerpoRegistro.interconnectResponse : {};
  if (!esRegistro(cuerpoRegistro.reporteCrediticio)) avisos.push("La respuesta no trae reporteCrediticio: no hay tablas que derivar.");

  const lista = (nombre: string): Registro[] => {
    const v = rc[nombre];
    if (!Array.isArray(v)) {
      cobertura[nombre] = null;
      return [];
    }
    const filas = v.filter(esRegistro);
    cobertura[nombre] = filas.length;
    return filas;
  };
  const omitidas: Record<string, number> = {};
  const omitir = (donde: string) => { omitidas[donde] = (omitidas[donde] ?? 0) + 1; };

  // ----- operaciones y historia -----
  const operaciones: FilaOperacion[] = [];
  const historia: FilaHistoria[] = [];
  for (const sistema of SISTEMAS) {
    for (const f of lista(LISTAS_DE_DEUDA[sistema].actual)) {
      const institucion = texto(f.institucion);
      const tipo = texto(f.tipo_credito);
      if (institucion === null || esFilaDeTotales(institucion, tipo)) { omitir(LISTAS_DE_DEUDA[sistema].actual); continue; }
      const { rol, original } = rolDeEquifax(f.tipo_riesgo);
      const apertura = fechaISO(f.fecha_apertura);
      const vencimiento = fechaISO(f.fecha_vencimiento);
      const cupo = dinero(f.cupo_monto_original);
      operaciones.push(nuevaFila("equifax_operaciones", {
        orden: operaciones.length + 1, sistema, institucion, fecha_corte: fechaISO(f.fecha_corte), rol, rol_original: original,
        tipo_credito: tipo, cupo_monto_original_usd: cupo, fecha_apertura: apertura, fecha_vencimiento: vencimiento,
        por_vencer_usd: dinero(f.total_vencer), no_devenga_intereses_usd: dinero(f.ndi), vencido_usd: dinero(f.total_vencido),
        demanda_judicial_usd: dinero(f.dem_jud), cartera_castigada_usd: dinero(f.cart_cast), saldo_deuda_usd: dinero(f.saldo_deuda),
        cuota_mensual_usd: dinero(f.cuota_mensual), dias_morosidad: entero(f.dias_morosidad),
      }));
    }
    for (const f of lista(LISTAS_DE_DEUDA[sistema].historica)) {
      const institucion = texto(f.institucion);
      const tipo = texto(f.tipo_credito);
      const corte = fechaISO(f.fecha_corte);
      if (institucion === null || corte === null || esFilaDeTotales(institucion, tipo)) { omitir(LISTAS_DE_DEUDA[sistema].historica); continue; }
      const { rol, original } = rolDeEquifax(f.tipo_riesgo);
      const apertura = fechaISO(f.fecha_apertura);
      const vencimiento = fechaISO(f.fecha_vencimiento);
      const cupo = dinero(f.cupo_monto_original);
      historia.push(nuevaFila("equifax_historia_mensual", {
        orden: historia.length + 1, sistema, institucion, fecha_corte: corte, rol, rol_original: original,
        tipo_credito: tipo, cupo_monto_original_usd: cupo, fecha_apertura: apertura, fecha_vencimiento: vencimiento,
        por_vencer_usd: dinero(f.total_vencer), no_devenga_intereses_usd: dinero(f.ndi), vencido_usd: dinero(f.total_vencido),
        demanda_judicial_usd: dinero(f.dem_jud), cartera_castigada_usd: dinero(f.cart_cast), saldo_deuda_usd: dinero(f.saldo_deuda),
        dias_morosidad: entero(f.dias_morosidad),
      }));
    }
  }

  // ----- deuda por sistema y mes -----
  const porSistema: FilaDeudaPorSistema[] = [];
  const tramosDeHistorica = (f: Registro) => ({
    vencido_0_a_1_mes_usd: dinero(f.vencido_0_a_1), vencido_1_a_2_meses_usd: dinero(f.vencido_1_a_2),
    vencido_2_a_3_meses_usd: dinero(f.vencido_2_a_3), vencido_3_a_6_meses_usd: dinero(f.vencido_3_a_6),
    vencido_6_a_9_meses_usd: dinero(f.vencido_6_a_9), vencido_9_a_12_meses_usd: dinero(f.vencido_9_a_12),
    vencido_12_a_24_meses_usd: dinero(f.vencido_12_a_24), vencido_24_a_36_meses_usd: dinero(f.vencido_24),
    vencido_mas_de_36_meses_usd: dinero(f.vencido_36),
  });
  for (const f of lista("valor_deuda_3_sistemas")) {
    const sistema = sistemaDeLaSigla(f.institucion);
    if (sistema === null) { omitir("valor_deuda_3_sistemas"); continue; }
    porSistema.push(nuevaFila("equifax_deuda_por_sistema_y_mes", {
      orden: porSistema.length + 1, origen: "resumen_actual", sistema, fecha_corte: null,
      por_vencer_usd: dinero(f.por_vencer), no_devenga_intereses_usd: dinero(f.no_devenga_int), vencido_usd: dinero(f.vencido),
      saldo_deuda_usd: dinero(f.total), demanda_judicial_usd: dinero(f.demanda_judicial), cartera_castigada_usd: dinero(f.cartera_castigada),
    }));
  }
  for (const f of lista("deuda_historica")) {
    const sistema = sistemaDeLaSigla(f.opcion);
    const corte = fechaISO(f.fecha_corte);
    if (sistema === null || corte === null) { omitir("deuda_historica"); continue; }
    porSistema.push(nuevaFila("equifax_deuda_por_sistema_y_mes", {
      orden: porSistema.length + 1, origen: "deuda_historica", sistema, fecha_corte: corte,
      por_vencer_usd: dinero(f.por_vencer), no_devenga_intereses_usd: dinero(f.no_devenga_int), saldo_deuda_usd: dinero(f.saldo_deuda),
      demanda_judicial_usd: dinero(f.demanda_judicial), cartera_castigada_usd: dinero(f.cartera_castigada), ...tramosDeHistorica(f),
    }));
  }
  for (const f of lista("evolucion_deuda_sb_seps_sicom")) {
    const sistema = sistemaDeLaSigla(f.opcion);
    const corte = fechaISO(f.fecha_corte);
    if (sistema === null || corte === null) { omitir("evolucion_deuda_sb_seps_sicom"); continue; }
    porSistema.push(nuevaFila("equifax_deuda_por_sistema_y_mes", {
      orden: porSistema.length + 1, origen: "evolucion", sistema, fecha_corte: corte,
      saldo_deuda_usd: dinero(f.total), vencido_usd: dinero(f.vencidos),
    }));
  }

  // ----- vencimientos -----
  const vencimientos: FilaVencimiento[] = [];
  for (const f of lista("estructura_vencimiento")) {
    const sistema = sistemaDeLaSigla(f.opcion);
    vencimientos.push(nuevaFila("equifax_vencimientos", {
      orden: vencimientos.length + 1, origen: "estructura_vencimiento", sistema, institucion: texto(f.institucion), fecha_corte: fechaISO(f.fecha_corte),
      por_vencer_usd: dinero(f.por_vencer), vencido_usd: dinero(f.vencido), no_devenga_intereses_usd: dinero(f.no_devenga_int),
      saldo_deuda_usd: dinero(f.saldo_deuda), demanda_judicial_usd: dinero(f.demanda_judicial), cartera_castigada_usd: dinero(f.cartera_castigada),
    }));
  }
  for (const f of lista("detalle_estructura_vencimiento")) {
    const corte = fechaISO(f.fecha_corte);
    if (corte === null) { omitir("detalle_estructura_vencimiento"); continue; }
    vencimientos.push(nuevaFila("equifax_vencimientos", {
      orden: vencimientos.length + 1, origen: "detalle_estructura_vencimiento", fecha_corte: corte,
      vencido_usd: dinero(f.vencido), no_devenga_intereses_usd: dinero(f.no_devenga_int),
      demanda_judicial_usd: dinero(f.demanda_judicial), cartera_castigada_usd: dinero(f.cartera_castigada), ...tramosDeHistorica(f),
    }));
  }
  for (const f of lista("saldos_por_vencer")) {
    vencimientos.push(nuevaFila("equifax_vencimientos", {
      orden: vencimientos.length + 1, origen: "saldos_por_vencer", institucion: texto(f.institucion), fecha_corte: fechaISO(f.fecha_corte),
      por_vencer_usd: dinero(f.total_por_vencer), por_vencer_0_a_1_mes_usd: dinero(f.por_vencer_0_a_1),
      por_vencer_1_a_3_meses_usd: dinero(f.por_vencer_1_a_3), por_vencer_3_a_6_meses_usd: dinero(f.por_vencer_3_a_6),
      por_vencer_6_a_12_meses_usd: dinero(f.por_vencer_6_a_12), por_vencer_mas_de_12_meses_usd: dinero(f.por_vencer_12),
    }));
  }

  // ----- tarjetas (sin el número de la tarjeta) -----
  const tarjetas: FilaTarjeta[] = [];
  for (const f of lista("detalle_tarjetas")) {
    tarjetas.push(nuevaFila("equifax_tarjetas", {
      orden: tarjetas.length + 1, estado: "vigente", institucion: texto(f.institucion), emisor: texto(f.emisor),
      antiguedad_meses: entero(f.antiguedad), cupo_usd: dinero(f.cupo), saldo_actual_usd: dinero(f.saldo_actual),
      saldo_promedio_6_meses_usd: dinero(f.saldo_promedio_ultimos_6_meses), uso_segun_equifax_porcentaje: dinero(f.porcentaje_uso_tarjeta),
    }));
  }
  for (const f of lista("tarjetas_canceladas")) {
    tarjetas.push(nuevaFila("equifax_tarjetas", {
      orden: tarjetas.length + 1, estado: "cancelada", institucion: texto(f.institucion),
      fecha_corte: fechaISO(f.fecha_corte), fecha_cancelacion: fechaISO(f.fecha_cancelacion),
    }));
  }

  // ----- créditos (sin el número de operación) -----
  const creditos: FilaCredito[] = [];
  for (const f of lista("creditos_otorgados")) {
    creditos.push(nuevaFila("equifax_creditos", {
      orden: creditos.length + 1, origen: "creditos_otorgados", institucion: texto(f.institucion), estado_operacion: texto(f.estado_operacion),
      tipo_credito: texto(f.tipo_credito), valor_operacion_usd: dinero(f.valor_operacion), titular_usd: dinero(f.titular),
      codeudor_usd: dinero(f.codeudor), garante_usd: dinero(f.garante),
      fecha_concesion: fechaISO(f.fecha_concesion), fecha_vencimiento: fechaISO(f.fecha_vencimiento),
    }));
  }
  for (const f of lista("operaciones_canceladas")) {
    creditos.push(nuevaFila("equifax_creditos", {
      orden: creditos.length + 1, origen: "operaciones_canceladas", institucion: texto(f.institucion),
      fecha_corte: fechaISO(f.fecha_corte), fecha_cancelacion: fechaISO(f.fecha_cancelacion),
    }));
  }

  const resumen: Partial<FilaResumen> = {};

  // ----- consultas recibidas -----
  // La primera fila es el ENCABEZADO: trae los doce meses (mes1 es el más
  // reciente). Las demás, una por entidad, marcan con una X los meses en que
  // consultó.
  const consultas: FilaConsultaRecibida[] = [];
  const entidades = lista("entidades_consultados");
  const mesesDelEncabezado: Array<string | null> = [];
  const encabezado = entidades.find((f) => Array.from({ length: 12 }, (_, i) => mesISO(f[`mes${i + 1}`])).every((m) => m !== null));
  if (entidades.length > 0 && !encabezado) avisos.push("entidades_consultados: no se encontró la fila de encabezado con los doce meses; no se pudo ubicar ninguna consulta en el tiempo.");
  if (encabezado) for (let i = 1; i <= 12; i++) mesesDelEncabezado.push(mesISO(encabezado[`mes${i}`]));
  if (encabezado) {
    resumen.consultas_recibidas_mes_final = mesesDelEncabezado[0];
    resumen.consultas_recibidas_mes_inicial = mesesDelEncabezado[11];
    for (const f of entidades) {
      if (f === encabezado) continue;
      const entidad = texto(f.nombre_cliente);
      if (entidad === null) { omitir("entidades_consultados"); continue; }
      for (let i = 1; i <= 12; i++) {
        const marca = f[`mes${i}`];
        if (marca === null || marca === undefined || (typeof marca === "string" && marca.trim() === "")) continue;
        consultas.push(nuevaFila("equifax_consultas_recibidas", {
          orden: consultas.length + 1, entidad, mes: mesesDelEncabezado[i - 1], es_novacredit: esNovaCredit(entidad),
        }));
      }
    }
  }

  // ----- scores -----
  const scores: FilaScore[] = [];
  const scoreDe = (nombre: string, tipo: string) => {
    for (const f of lista(nombre)) {
      scores.push(nuevaFila("equifax_scores", {
        orden: scores.length + 1, tipo, retroactivo_meses: 0, score: numero(f.score), score_minimo: numero(f.score_min), score_maximo: numero(f.score_max),
        total_acumulado_porcentaje: numero(f.total_acum), tasa_de_malos_acumulada_porcentaje: numero(f.tasa_de_malos_acum),
        fecha_inicial: fechaISO(f.fecha_inicial), fecha_final: fechaISO(f.fecha_final), rango_texto: texto(f.rango_score),
        segmentacion: texto(f.segmentacion), porcentaje: numero(f.porcentaje), probabilidad_porcentaje: numero(f.probabilidad_sobre_endeudamiento),
      }));
    }
  };
  scoreDe("score", "score");
  scoreDe("score_inclusion", "inclusion");
  scoreDe("score_sobreendeudamiento", "sobreendeudamiento");
  for (const f of lista("historico_score")) {
    scores.push(nuevaFila("equifax_scores", { orden: scores.length + 1, tipo: "historico", retroactivo_meses: retroactivoEnMeses(f.retroactivo), score: numero(f.score) }));
  }

  // ----- indicadores por período -----
  const indicadores: FilaIndicador[] = [];
  const serie = (nombre: string, indicador: string, campo: string) => {
    for (const f of lista(nombre)) {
      indicadores.push(nuevaFila("equifax_indicadores_por_periodo", {
        orden: indicadores.length + 1, origen: nombre, indicador, retroactivo_meses: retroactivoEnMeses(f.retroactivo), valor_numero: dinero(f[campo]),
      }));
    }
  };
  serie("historico_acreedores", "acreedores", "acreedores");
  serie("historico_cuota_estimada", "cuota_mensual_usd", "cuota_mensual");
  serie("historico_endeudamiento_comercial", "saldo_total_usd", "saldo_total");
  serie("historico_endeudamiento_financiero", "saldo_total_usd", "saldo_total");
  serie("historico_vencidos_comercial", "saldo_vencido_usd", "saldo_vencido");
  serie("historico_vencidos_financiero", "saldo_vencido_usd", "saldo_vencido");
  for (const nombre of ["identificador_perfil_riesgo_directo", "identificador_perfil_riesgo_directo_6_meses"]) {
    for (const f of lista(nombre)) {
      const etiqueta = texto(f.indicador);
      if (etiqueta === null) { omitir(nombre); continue; }
      const valor = texto(f.valor);
      indicadores.push(nuevaFila("equifax_indicadores_por_periodo", {
        orden: indicadores.length + 1, origen: nombre,
        indicador: etiqueta.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
        valor_numero: valor !== null && /^-?\d+(\.\d+)?$/.test(valor) ? dinero(valor) : null, valor_texto: valor, fecha: fechaISO(f.fecha),
      }));
    }
  }

  // ----- codeudor y garante: operaciones de OTRAS personas (sin el nombre ni la identificación del
  // titular, que son de un tercero). Equifax las llama «garantías personales»; en Ecuador una
  // garantía es el colateral (un auto, una casa, un pagaré), así que acá no se usa esa palabra. -----
  const codeudorGarante: FilaCodeudorGarante[] = [];
  for (const [nombre, vigente] of [["garantias_personales_codeudores_operaciones_vigentes", true], ["garantias_personales_codeudores_operaciones_no_vigentes", false]] as const) {
    for (const f of lista(nombre)) {
      codeudorGarante.push(nuevaFila("equifax_codeudor_garante", {
        orden: codeudorGarante.length + 1, vigente, tipo_deudor: texto(f.tipo_deudor), institucion: texto(f.institucion), deuda_total_usd: dinero(f.deuda_total),
      }));
    }
  }

  // ----- el resumen: lo de una sola fila -----
  const impago = (tipo: string) => lista("resumen_informe").find((f) => texto(f.tipo) === tipo);
  const oi = impago("OpeImpagos");
  if (oi) { resumen.impagos_numero = entero(oi.num_total_ope_impagos); resumen.impagos_monto_usd = dinero(oi.monto_total_ope_impagos); }
  const dj = impago("DemandaJudicial");
  if (dj) { resumen.demanda_judicial_numero = entero(dj.num_total_ope_impagos); resumen.demanda_judicial_monto_usd = dinero(dj.monto_total_ope_impagos); }
  const cc = impago("CarteraCastigada");
  if (cc) { resumen.cartera_castigada_numero = entero(cc.num_total_ope_impagos); resumen.cartera_castigada_monto_usd = dinero(cc.monto_total_ope_impagos); }

  const pm = lista("protestos_morosidades")[0];
  if (pm) {
    resumen.morosidades_numero = entero(pm.morosidades);
    resumen.morosidades_monto_usd = dinero(pm.monto_total_morosidades);
    resumen.morosidades_total_operaciones = entero(pm.total_numero_operaciones);
    resumen.protestos_numero = entero(pm.protestos); // viene siempre vacío: null = no medido
  }

  const ce = lista("cuota_estimada_mensual")[0];
  if (ce) {
    resumen.cuota_estimada_mensual_usd = dinero(ce.pago);
    resumen.cuota_creditos_comerciales_numero = entero(ce.numero_creditos_comercial);
    resumen.cuota_total_vencido_usd = dinero(ce.total_vencido);
    resumen.cuota_total_demanda_usd = dinero(ce.total_demanda);
    resumen.cuota_total_cartera_usd = dinero(ce.total_cartera);
    resumen.cuota_creditos_iece_numero = entero(ce.numero_creditos_iece);
    resumen.cuota_operaciones_excluidas_numero = entero(ce.numero_operaciones_excluidas);
  }

  const inhabilitadas = lista("personas_inhabilitadas");
  if (cobertura["personas_inhabilitadas"] !== null) {
    resumen.inhabilitaciones_numero = inhabilitadas.length;
    const ultima = [...inhabilitadas].sort((a, b) => (fechaISO(a.fecha_inhabilitacion) ?? "").localeCompare(fechaISO(b.fecha_inhabilitacion) ?? "")).pop();
    if (ultima) {
      resumen.ultima_inhabilitacion_fecha = fechaISO(ultima.fecha_inhabilitacion);
      resumen.ultima_inhabilitacion_accion = texto(ultima.accion);
      resumen.ultima_inhabilitacion_motivo = texto(ultima.motivo);
    }
  }

  const historial = lista("mantiene_historial_crediticio")[0];
  if (historial) resumen.primer_credito_fecha = fechaISO(historial.primera_fecha);

  const fa = lista("factores_influyen_score")[0];
  if (fa) {
    resumen.factores_operaciones_historicas_numero = entero(fa.numero_operaciones_historicas);
    resumen.factores_operaciones_vigentes_numero = entero(fa.numero_operaciones_vigentes);
    resumen.factores_operaciones_vencidas_numero = entero(fa.numero_operaciones_vencidas);
    resumen.factores_saldo_por_vencer_usd = dinero(fa.saldo_por_vencer);
    resumen.factores_saldo_vencido_usd = dinero(fa.saldo_vencido);
    resumen.factores_saldo_demanda_judicial_usd = dinero(fa.saldo_demanada_judicial);
    resumen.factores_saldo_cartera_castigada_usd = dinero(fa.saldo_cartera_castigada);
    resumen.factores_maximo_saldo_vencido_usd = dinero(fa.maximo_saldos_vencidos);
    const meses = /^(\d+)\s*mes/i.exec(texto(fa.tiempo_trancurrido_primer_credito) ?? "");
    resumen.factores_meses_desde_el_primer_credito = meses ? Number(meses[1]) : null;
    resumen.factores_vencidos_actuales_numero = entero(fa.vencidos_actuales);
    resumen.factores_maximo_dias_vencido = entero(fa.maximo_dias_vencido);
    resumen.factores_saldo_deuda_nuevos_creditos_usd = dinero(fa.saldo_deuda_nuevos_creditos);
  }

  const sri = lista("informacion_sri");
  if (cobertura["informacion_sri"] !== null) {
    const f = sri[0];
    resumen.sri_tiene_ruc = f !== undefined && texto(f.ruc) !== null;
    if (f) {
      resumen.sri_estado_contribuyente = texto(f.estado_contribuyente);
      resumen.sri_clase_contribuyente = texto(f.clase_contribuyente);
      const obligado = (texto(f.obligado) ?? "").toUpperCase();
      resumen.sri_obligado_a_contabilidad = obligado === "S" ? true : obligado === "N" ? false : null;
      resumen.sri_fecha_inicio_actividades = fechaISO(f.fecha_inicio_actividades);
      resumen.sri_fecha_suspension_definitiva = fechaISO(f.fecha_suspension_definitiva);
      resumen.sri_codigo_ciiu = texto(f.codigo_ciiu);
    }
  }

  const impacto = lista("indicador_impacto_economico")[0];
  if (impacto) {
    resumen.impacto_economico_indicador = entero(impacto.indicador);
    resumen.impacto_economico_ingreso_usd = dinero(impacto.ingreso);
    resumen.impacto_economico_cuota_financiera_usd = dinero(impacto.cuota_financiera);
  }

  const sujetos = lista("sujeto_al_dia");
  if (cobertura["sujeto_al_dia"] !== null) resumen.sujetos_al_dia_numero = sujetos.length;

  // De interconnectResponse sólo dos cálculos de Equifax, rotulados como tales.
  const estado = ir.ESTADO_CARTERA;
  if (esRegistro(estado) && Object.keys(estado).length > 0) {
    resumen.estado_de_cartera_codigo = entero(estado.Codigo);
    resumen.estado_de_cartera_descripcion = texto(estado.Descripcion);
    resumen.estado_de_cartera_interpretacion = texto(estado.Interpretacion);
  }
  const segmentacion = ir.ResultadoSegmentacion;
  if (esRegistro(segmentacion)) resumen.ingreso_estimado_usd = dinero(segmentacion.IncomePredictor);

  // Una lista que Equifax no entrega y ninguna tabla usa tampoco se pierde: sigue en el crudo.
  // Un cambio de forma (una lista nueva) no rompe nada; lo que sí se avisa es lo omitido.
  for (const [donde, n] of Object.entries(omitidas)) avisos.push(`${donde}: ${n} fila(s) sin institución, sin fecha o de totales se omitieron.`);

  return {
    version: EQUIFAX_TABLAS_VERSION,
    tablas: {
      equifax_operaciones: operaciones,
      equifax_historia_mensual: historia,
      equifax_deuda_por_sistema_y_mes: porSistema,
      equifax_vencimientos: vencimientos,
      equifax_tarjetas: tarjetas,
      equifax_creditos: creditos,
      equifax_consultas_recibidas: consultas,
      equifax_scores: scores,
      equifax_indicadores_por_periodo: indicadores,
      equifax_codeudor_garante: codeudorGarante,
      equifax_resumen: [nuevaFila("equifax_resumen", resumen)],
    },
    cobertura,
    avisos,
  };
}
