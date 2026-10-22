// El vector de entrada del predictor de ingresos: las variables que el modelo
// aprendió (docs/especificacion-predictor-de-ingresos.md, secciones 4.1 y 4.2),
// armadas desde el perfil de la persona y desde las tablas de Equifax.
//
// UNA sola implementación (paso 1 de la sección 6): el evaluador, la función y
// la prueba de paridad la llaman; ninguna arma las variables por su cuenta. Las
// variables se entrenaron con el extracto de AWS y acá se arman con lo que
// CrediScope tiene; cada diferencia entre las dos cosas es un error del modelo
// que nadie ve, así que lo que NO coincide queda dicho en `pendientes` y en la
// sección 9 de la especificación, no escondido.
//
// Reglas que costaron un caso:
//   - Sin RUC es un dato (sri_ruc = 0); sin respuesta de la fuente no lo es:
//     todas las variables del SRI van nulas. En el entrenamiento se descartaron
//     las respuestas en que Equifax no traía el bloque. De Novadata, el
//     contribuyente contestó si está en `fuentesConDatos` o en `fuentesSinDatos`
//     (en esta última, «contestó y no había nada»: process.ts); la especificación
//     decía «no contestó (`fuentesSinDatos`)», al revés. No contestó es
//     `fuentesNoMedidas` o no figurar.
//   - Un crédito con fecha de concesión posterior a la consulta puede ser el que
//     se está pidiendo: se anula. El entrenamiento anuló SÓLO el mayor crédito
//     aprobado (`cred_mayor`; el extracto de AWS traía únicamente su fecha), y el
//     modelo se sirve igual que se entrenó: CREDITOS_POSTERIORES_QUE_SE_ANULAN.
//   - Un grupo sin filas es nulo, no cero: en el entrenamiento la suma de nada
//     era un faltante, y el modelo lo trata como tal.
//
// Una variable que no se pudo armar queda en `sinDato`; una que se armó con una
// definición sin confirmar o sin paridad medida queda en `pendientes`.
//
// AVISO: Node 24 ejecuta este archivo borrando los tipos (scripts/): sólo
// sintaxis que se pueda borrar (nada de enum, namespace ni propiedades de
// parámetro).

import { fechaEnEcuador } from "./equifax-estructura.ts";
import type { FilaOperacion, TablasEquifax } from "./equifax-tablas.ts";

export const VARIABLES_DE_INGRESO_VERSION = "variables-de-ingreso-v1";

export type ValorDeVariable = number | string | null;

// ---------------------------------------------------------------------------
// Las variables de cada nivel, en el orden en que se entrenó el modelo
// ---------------------------------------------------------------------------
export const VARIABLES_DE_LA_PERSONA = [
  "edad", "genero", "estado_civil", "prov_trab", "cant_trab", "prov_dom", "cant_dom",
  "aporte", "meses_aporte", "n_empleos", "anio_mes",
] as const;
export const VARIABLES_DEL_SRI = ["sri_ruc", "sri_estado", "sri_obligado", "sri_antig", "sri_susp"] as const;
export const VARIABLES_DEL_SRI_DE_EQUIFAX = ["sri_clase", "sri_ciiu_secc", "sri_ciiu_div"] as const;
export const VARIABLES_DEL_BURO = [
  "cred_mayor", "cred_12m", "cred_24m", "deuda_total", "n_inst", "n_creditos", "valor_creditos", "saldos_vig",
  "deuda_actual", "deuda_3m", "max_mora", "saldo", "n_oper",
] as const;
export const VARIABLES_DE_LA_CUOTA = [
  "cuota_fin", "h12", "h6", "hact", "g6", "g12",
  "c_consumo", "c_tarjeta", "c_micro", "c_vivienda", "c_comercial", "c_educativo",
  "s_consumo", "s_tarjeta", "s_micro", "s_vivienda",
  "n_consumo", "n_tarjeta", "n_micro", "n_vivienda",
  "c_codeudor", "max_dias_t",
] as const;

export const VARIABLES_DEL_NIVEL_1 = [...VARIABLES_DE_LA_PERSONA, ...VARIABLES_DEL_SRI] as const;
export const VARIABLES_DEL_NIVEL_2 = [
  ...VARIABLES_DE_LA_PERSONA, ...VARIABLES_DEL_BURO, ...VARIABLES_DE_LA_CUOTA, ...VARIABLES_DEL_SRI, ...VARIABLES_DEL_SRI_DE_EQUIFAX,
] as const;

// Entran al modelo como categorías (texto); el resto, como números.
export const VARIABLES_CATEGORICAS = [
  "genero", "estado_civil", "prov_trab", "cant_trab", "prov_dom", "cant_dom",
  "sri_estado", "sri_clase", "sri_ciiu_secc", "sri_ciiu_div",
] as const;

// De los tres créditos mayores del buró, los que se anulan si su fecha de concesión es posterior a la
// consulta. El entrenamiento sólo anuló el mayor aprobado: ver el encabezado.
export type CreditoDelBuro = "cred_mayor" | "cred_12m" | "cred_24m";
export const CREDITOS_POSTERIORES_QUE_SE_ANULAN: readonly CreditoDelBuro[] = ["cred_mayor"];

// ---------------------------------------------------------------------------
// Lo que entra y lo que sale
// ---------------------------------------------------------------------------
export interface VectorDeIngreso {
  version: string;
  nivel: 1 | 2;
  // Todas las variables del nivel, en el orden del modelo; null = sin dato.
  variables: Record<string, ValorDeVariable>;
  sinDato: string[];
  // Lo que se armó con una definición sin confirmar o sin paridad medida, o que no se pudo armar
  // todavía: no es una ausencia de dato, es una decisión abierta (sección 9 de la especificación).
  pendientes: string[];
  avisos: string[];
}

// Lo que este módulo lee del perfil estandarizado (process.ts). Todo es opcional: un perfil
// viejo o parcial no rompe, deja la variable sin dato.
export interface PerfilParaIngreso {
  identidad?: { edad?: number | null; genero?: string | null; estadoCivil?: string | null } | null;
  laboral?: {
    estadoActividadEconomica?: string | null;
    fechaInicioActividadesRuc?: string | null;
    fechaCeseActividadesRuc?: string | null;
    tipoUltimoCeseRuc?: string | null;
  } | null;
  metaConsulta?: { fuentesConDatos?: string[]; fuentesSinDatos?: string[]; fuentesNoMedidas?: string[] } | null;
}

// Una fila del historial mensual del IESS (trabajoHistoricosMecanizado: `baseDate`, `nomEmp` y
// `personaIngreso.valor`). El perfil estandarizado sólo guarda 24 meses de detalle y el modelo se
// entrenó con el historial entero (meses con aporte hasta 93), así que estas filas las arma quien llama.
export interface FilaDeHistorialIess {
  mes: string; // AAAA-MM
  empleador: string | null;
  valor: number | null;
}

// Provincia y cantón de domicilio y de trabajo. El perfil estandarizado no los trae (sólo cuenta direcciones).
export interface Ubicaciones {
  provinciaDomicilio: string | null;
  cantonDomicilio: string | null;
  provinciaTrabajo: string | null;
  cantonTrabajo: string | null;
}

// Las categorías del entrenamiento (sexo, estado civil, provincia y cantón) son las del extracto de AWS y su
// paridad con las de Novadata no se midió: este mapeo es la interfaz, y MAPEO_PENDIENTE no inventa
// equivalencias (devuelve null). Cuando se mida, se pasa un mapeo con `pendiente: false`.
export interface MapeoDeCategorias {
  pendiente: boolean;
  genero(valor: string | null): string | null;
  estadoCivil(valor: string | null): string | null;
  provincia(valor: string | null): string | null;
  canton(valor: string | null): string | null;
}
export const MAPEO_PENDIENTE: MapeoDeCategorias = {
  pendiente: true,
  genero: () => null,
  estadoCivil: () => null,
  provincia: () => null,
  canton: () => null,
};

export interface OpcionesDelVector {
  // El reloj del servidor: de ahí salen anio_mes y las antigüedades.
  ahora: Date | string;
  historialIess?: FilaDeHistorialIess[] | null;
  ubicaciones?: Ubicaciones | null;
  mapeo?: MapeoDeCategorias;
}

export interface OpcionesDelNivel1 extends OpcionesDelVector {
  // El perfil no trae el «obligado a llevar contabilidad» del RUC (sí está en datosContribuyente de Novadata).
  obligadoAContabilidad?: boolean | null;
}

export interface OpcionesDelNivel2 extends OpcionesDelVector {
  // Cuándo se hizo la consulta a Equifax: la fecha contra la que se compara la concesión de un crédito.
  consultadoEl: Date | string;
}

export type TablasParaIngreso = Pick<TablasEquifax, "equifax_operaciones" | "equifax_indicadores_por_periodo" | "equifax_resumen" | "equifax_analisis_credito">;

// ---------------------------------------------------------------------------
// Lectores
// ---------------------------------------------------------------------------
const DIAS_POR_ANIO = 365.25;

function aFecha(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

// Años con fracción entre una fecha (AAAA-MM-DD) y hoy en Ecuador, sin bajar de cero: como en el entrenamiento,
// un inicio de actividades posterior a la consulta es 0 y no un negativo.
function aniosDesde(fecha: string | null, ahora: Date): number | null {
  if (fecha === null) return null;
  const desde = Date.parse(`${fecha}T00:00:00Z`);
  const hasta = Date.parse(`${fechaEnEcuador(ahora.toISOString())}T00:00:00Z`);
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return null;
  return Math.max(0, Math.floor((hasta - desde) / 86_400_000) / DIAS_POR_ANIO);
}

function anioMes(ahora: Date): number | null {
  if (Number.isNaN(ahora.getTime())) return null;
  const [a, m] = fechaEnEcuador(ahora.toISOString()).split("-").map(Number);
  return a + (m - 1) / 12;
}

const suma = (valores: Array<number | null>): number | null => {
  const v = valores.filter((x): x is number => x !== null);
  return v.length === 0 ? null : Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;
};
const maximo = (valores: Array<number | null>): number | null => {
  const v = valores.filter((x): x is number => x !== null);
  return v.length === 0 ? null : Math.max(...v);
};
const mayusculas = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim().toUpperCase();
  return t === "" ? null : t;
};

function nuevoVector(nivel: 1 | 2, nombres: readonly string[]): VectorDeIngreso {
  return { version: VARIABLES_DE_INGRESO_VERSION, nivel, variables: Object.fromEntries(nombres.map((n) => [n, null])), sinDato: [], pendientes: [], avisos: [] };
}

// Cierra el vector: lo que quedó nulo se lista, y el orden de las claves es el del modelo.
function cerrar(v: VectorDeIngreso): VectorDeIngreso {
  v.sinDato = Object.entries(v.variables).filter(([, x]) => x === null).map(([k]) => k);
  return v;
}

// ---------------------------------------------------------------------------
// La persona: identidad, ubicación e IESS (comunes a los dos niveles)
// ---------------------------------------------------------------------------
export function variablesDelIess(filas: FilaDeHistorialIess[] | null | undefined): { aporte: number | null; meses_aporte: number | null; n_empleos: number | null } {
  const validas = (filas ?? []).filter((f) => /^\d{4}-\d{2}$/.test(f.mes));
  if (validas.length === 0) return { aporte: null, meses_aporte: null, n_empleos: null };
  const meses = new Set(validas.map((f) => f.mes));
  const ultimo = [...meses].sort().pop()!;
  const empleadores = new Set(validas.map((f) => mayusculas(f.empleador)).filter((e): e is string => e !== null));
  return {
    // El total de todos los empleadores del último mes con aporte, no del mes de la consulta: así salía en AWS.
    aporte: suma(validas.filter((f) => f.mes === ultimo).map((f) => f.valor)),
    meses_aporte: meses.size,
    n_empleos: empleadores.size,
  };
}

function cargarLaPersona(v: VectorDeIngreso, perfil: PerfilParaIngreso, o: OpcionesDelVector, ahora: Date): void {
  const mapeo = o.mapeo ?? MAPEO_PENDIENTE;
  const x = v.variables;
  const edad = perfil.identidad?.edad;
  x.edad = typeof edad === "number" && Number.isFinite(edad) ? edad : null;
  x.genero = mapeo.genero(perfil.identidad?.genero ?? null);
  x.estado_civil = mapeo.estadoCivil(perfil.identidad?.estadoCivil ?? null);
  const u = o.ubicaciones ?? null;
  x.prov_dom = mapeo.provincia(u?.provinciaDomicilio ?? null);
  x.cant_dom = mapeo.canton(u?.cantonDomicilio ?? null);
  x.prov_trab = mapeo.provincia(u?.provinciaTrabajo ?? null);
  x.cant_trab = mapeo.canton(u?.cantonTrabajo ?? null);
  if (mapeo.pendiente) v.pendientes.push("categorias: sexo, estado civil, provincia y cantón son categorías del extracto de AWS y su paridad con las de Novadata no se midió; salen sin dato hasta tener el mapeo.");
  if (u === null) v.pendientes.push("ubicaciones: el perfil estandarizado no trae provincia ni cantón de domicilio y de trabajo (sólo cuenta direcciones); falta derivarlos de las direcciones y el empleo de Novadata.");
  const iess = variablesDelIess(o.historialIess);
  x.aporte = iess.aporte;
  x.meses_aporte = iess.meses_aporte;
  x.n_empleos = iess.n_empleos;
  v.pendientes.push("iess: aporte, meses_aporte y n_empleos se arman del historial mensual (último mes, meses distintos, empleadores distintos); su definición en AWS (trabajos_persona_requerimiento) no está confirmada.");
  if (o.historialIess === undefined || o.historialIess === null) v.avisos.push("Sin el historial del IESS: aporte, meses con aporte y número de empleos quedan sin dato.");
  x.anio_mes = anioMes(ahora);
}

// ---------------------------------------------------------------------------
// El SRI: de Novadata (nivel 1) y de Equifax (nivel 2)
// ---------------------------------------------------------------------------
// ¿Contestó el contribuyente de Novadata? `fuentesSinDatos` es «contestó y no había nada» (process.ts): una persona
// sin RUC. `fuentesNoMedidas` (error o apagada) o no figurar es no haber contestado.
function contribuyenteContesto(perfil: PerfilParaIngreso): boolean {
  const m = perfil.metaConsulta;
  return Boolean(m && ((m.fuentesConDatos ?? []).includes("contribuyente") || (m.fuentesSinDatos ?? []).includes("contribuyente")));
}

function cargarElSriDeNovadata(v: VectorDeIngreso, perfil: PerfilParaIngreso, o: OpcionesDelNivel1, ahora: Date): void {
  const x = v.variables;
  const estado = perfil.laboral?.estadoActividadEconomica ?? null;
  if (!contribuyenteContesto(perfil) || estado === null) {
    v.avisos.push("El contribuyente de Novadata no contestó: las variables del SRI quedan sin dato (no es lo mismo que no tener RUC).");
    return;
  }
  if (estado === "sin_ruc") { x.sri_ruc = 0; return; }
  x.sri_ruc = 1;
  // Novadata resuelve el estado por las fechas de cese y reinicio (ruc.ts); Equifax trae el estado del SRI.
  x.sri_estado = estado.startsWith("activa") ? "ACTIVO" : estado.startsWith("inactiva") ? "SUSPENDIDO" : null;
  x.sri_antig = aniosDesde(perfil.laboral?.fechaInicioActividadesRuc ?? null, ahora);
  // El perfil guarda el cese más reciente (cancelación o suspensión) y su tipo: sólo la suspensión definitiva es sri_susp.
  x.sri_susp = perfil.laboral?.tipoUltimoCeseRuc === "suspension_definitiva" ? aniosDesde(perfil.laboral?.fechaCeseActividadesRuc ?? null, ahora) : null;
  const obligado = o.obligadoAContabilidad;
  x.sri_obligado = obligado === true ? 1 : obligado === false ? 0 : null;
  if (obligado === undefined || obligado === null) v.pendientes.push("sri_obligado: el perfil no trae el «obligado a llevar contabilidad» de Novadata y no se comparó con el de Equifax.");
  v.pendientes.push("sri_susp: se toma del cese más reciente del perfil cuando es una suspensión definitiva; si hubo una cancelación posterior no se distingue de la fecha de suspensión de Equifax.");
}

function cargarElSriDeEquifax(v: VectorDeIngreso, tablas: TablasParaIngreso, ahora: Date): void {
  const x = v.variables;
  const r = tablas.equifax_resumen[0];
  // El bloque del SRI existe desde diciembre de 2025 y sólo en el JSON: sin él (tiene_ruc nulo) no hay dato, ni siquiera «sin RUC».
  if (!r || r.sri_tiene_ruc === null) {
    v.avisos.push("La respuesta de Equifax no trae el bloque del SRI: sus variables quedan sin dato.");
    return;
  }
  x.sri_ruc = r.sri_tiene_ruc ? 1 : 0;
  x.sri_estado = mayusculas(r.sri_estado_contribuyente);
  x.sri_clase = mayusculas(r.sri_clase_contribuyente);
  x.sri_obligado = r.sri_obligado_a_contabilidad === true ? 1 : r.sri_obligado_a_contabilidad === false ? 0 : null;
  x.sri_antig = aniosDesde(r.sri_fecha_inicio_actividades, ahora);
  x.sri_susp = aniosDesde(r.sri_fecha_suspension_definitiva, ahora);
  // El CIIU del SRI es una letra y seis dígitos: la sección es la letra, la división la letra y los dos dígitos siguientes.
  const ciiu = (r.sri_codigo_ciiu ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  x.sri_ciiu_secc = ciiu === "" ? null : ciiu.slice(0, 1);
  x.sri_ciiu_div = ciiu === "" ? null : ciiu.slice(0, 3);
}

// ---------------------------------------------------------------------------
// El buró de Equifax (nivel 2)
// ---------------------------------------------------------------------------
// El tipo de crédito de una operación, como lo agrupó el entrenamiento.
export function tipoDeCreditoParaIngreso(tipo: string | null): "TARJETA" | "CONSUMO" | "MICROCREDITO" | "VIVIENDA" | "COMERCIAL" | "EDUCATIVO" | "OTRO" {
  const t = (tipo ?? "").trim().toUpperCase();
  if (t.startsWith("TARJETA")) return "TARJETA";
  if (t.startsWith("CONSUMO")) return "CONSUMO";
  if (t.startsWith("MICRO")) return "MICROCREDITO";
  if (t.startsWith("VIVIENDA")) return "VIVIENDA";
  if (t.startsWith("COMERCIAL")) return "COMERCIAL";
  if (t.startsWith("EDUCATIVO")) return "EDUCATIVO";
  return "OTRO";
}

function cargarElBuro(v: VectorDeIngreso, tablas: TablasParaIngreso, consultadoEl: Date): void {
  const x = v.variables;
  const a = tablas.equifax_analisis_credito[0];
  if (!a) {
    v.avisos.push("La respuesta de Equifax no trae el análisis de crédito (AnalisisCreditoSectorFinanciero): las diez variables de crédito quedan sin dato.");
  } else {
    const consulta = Number.isNaN(consultadoEl.getTime()) ? null : fechaEnEcuador(consultadoEl.toISOString());
    const posterior = (fecha: string | null) => consulta !== null && fecha !== null && fecha > consulta;
    const credito = (nombre: CreditoDelBuro, monto: number | null, fecha: string | null): number | null =>
      CREDITOS_POSTERIORES_QUE_SE_ANULAN.includes(nombre) && posterior(fecha) ? null : monto;
    x.cred_mayor = credito("cred_mayor", a.mayor_credito_aprobado_monto_usd, a.mayor_credito_aprobado_fecha_concesion);
    x.cred_12m = credito("cred_12m", a.mayor_credito_reciente_monto_usd, a.mayor_credito_reciente_fecha_concesion);
    x.cred_24m = credito("cred_24m", a.mayor_credito_actual_monto_usd, a.mayor_credito_actual_fecha_concesion);
    x.deuda_total = a.deuda_total_adeudada_usd;
    x.n_inst = a.instituciones_con_deuda_numero;
    x.n_creditos = a.creditos_aprobados_numero;
    x.valor_creditos = a.creditos_aprobados_valor_usd;
    x.saldos_vig = a.saldos_vigentes_usd;
    x.deuda_actual = a.deuda_actual_usd;
    x.deuda_3m = a.deuda_hace_3_meses_usd;
  }

  // La cuota y su historial (retroactivo de -12, -6 y 0 meses).
  const r = tablas.equifax_resumen[0];
  x.cuota_fin = r?.impacto_economico_cuota_financiera_usd ?? null;
  const cuotaEn = (meses: number): number | null =>
    tablas.equifax_indicadores_por_periodo.find((i) => i.origen === "historico_cuota_estimada" && i.retroactivo_meses === meses)?.valor_numero ?? null;
  const h12 = cuotaEn(-12);
  const h6 = cuotaEn(-6);
  const hact = cuotaEn(0);
  x.h12 = h12;
  x.h6 = h6;
  x.hact = hact;
  // El cociente sólo con un denominador positivo, y acotado a 0..20 como en el entrenamiento.
  const cociente = (n: number | null, d: number | null): number | null => (n === null || d === null || d <= 0 ? null : Math.min(20, Math.max(0, n / d)));
  x.g6 = cociente(hact, h6);
  x.g12 = cociente(hact, h12);

  // Las operaciones. Las filas de «otro» riesgo y tipo «otro» son totales por sistema en el extracto de AWS y se excluyen.
  const ops: FilaOperacion[] = tablas.equifax_operaciones.filter((f) => !(f.rol === "otro" && tipoDeCreditoParaIngreso(f.tipo_credito) === "OTRO"));
  const titular = ops.filter((f) => f.rol === "titular");
  const delTipo = (tipo: ReturnType<typeof tipoDeCreditoParaIngreso>) => titular.filter((f) => tipoDeCreditoParaIngreso(f.tipo_credito) === tipo);
  const n = (filas: FilaOperacion[]): number | null => (filas.length === 0 ? null : filas.length);
  const cuota = (filas: FilaOperacion[]) => suma(filas.map((f) => f.cuota_mensual_usd));
  const saldoDe = (filas: FilaOperacion[]) => suma(filas.map((f) => f.saldo_deuda_usd));
  x.c_consumo = cuota(delTipo("CONSUMO"));
  x.c_tarjeta = cuota(delTipo("TARJETA"));
  x.c_micro = cuota(delTipo("MICROCREDITO"));
  x.c_vivienda = cuota(delTipo("VIVIENDA"));
  x.c_comercial = cuota(delTipo("COMERCIAL"));
  x.c_educativo = cuota(delTipo("EDUCATIVO"));
  x.s_consumo = saldoDe(delTipo("CONSUMO"));
  x.s_tarjeta = saldoDe(delTipo("TARJETA"));
  x.s_micro = saldoDe(delTipo("MICROCREDITO"));
  x.s_vivienda = saldoDe(delTipo("VIVIENDA"));
  x.n_consumo = n(delTipo("CONSUMO"));
  x.n_tarjeta = n(delTipo("TARJETA"));
  x.n_micro = n(delTipo("MICROCREDITO"));
  x.n_vivienda = n(delTipo("VIVIENDA"));
  x.c_codeudor = cuota(ops.filter((f) => f.rol === "codeudor" || f.rol === "garante"));
  x.max_dias_t = maximo(titular.map((f) => f.dias_morosidad));
  // Todas las filas y todos los roles: así los sumaba el extracto de AWS, también las de totales.
  x.saldo = saldoDe(tablas.equifax_operaciones);
  x.n_oper = n(tablas.equifax_operaciones);
  x.max_mora = maximo(tablas.equifax_operaciones.map((f) => f.dias_morosidad));
  v.pendientes.push("operaciones: las cuotas, saldos y conteos por tipo se arman de equifax_operaciones (reporteCrediticio), como dice la sección 4.2; el extracto de AWS salió de las listas DetalleDeudaActualReportada* de interconnectResponse y la paridad medida es parcial (sección 9, punto 1).");
}

// ---------------------------------------------------------------------------
// Las dos puertas
// ---------------------------------------------------------------------------
export function vectorDeNivel1(perfil: PerfilParaIngreso, o: OpcionesDelNivel1): VectorDeIngreso {
  const ahora = aFecha(o.ahora);
  const v = nuevoVector(1, VARIABLES_DEL_NIVEL_1);
  cargarLaPersona(v, perfil, o, ahora);
  cargarElSriDeNovadata(v, perfil, o, ahora);
  return cerrar(v);
}

export function vectorDeNivel2(perfil: PerfilParaIngreso, tablas: TablasParaIngreso, o: OpcionesDelNivel2): VectorDeIngreso {
  const ahora = aFecha(o.ahora);
  const v = nuevoVector(2, VARIABLES_DEL_NIVEL_2);
  cargarLaPersona(v, perfil, o, ahora);
  // En el nivel 2 el SRI sale de Equifax, igual que en el entrenamiento; no del RUC de Novadata.
  cargarElSriDeEquifax(v, tablas, ahora);
  cargarElBuro(v, tablas, aFecha(o.consultadoEl));
  return cerrar(v);
}
