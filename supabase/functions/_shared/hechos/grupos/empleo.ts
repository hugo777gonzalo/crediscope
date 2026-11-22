// Grupo 4 de la capa de hechos, parte 1: el empleo (docs/capa-de-hechos.md, 4.4 y 4.4.1).
// Tres fuentes del IESS que hablan de los mismos empleos (`basesInternas.tiess`, el
// mecanizado y el historial), la nómina que paga la persona y el cumplimiento patronal.
//
// ETAPA A. process.ts sigue armando `laboral` como hoy; lo que hay de reglas dentro de
// `buildStandardProfile` (el empleo actual, la antigüedad, el historial de empleadores)
// está copiado acá hasta la etapa B, y `comparar-hechos.mjs` compara campo por campo
// contra el perfil. Las reglas que ya son funciones exportadas (`reglaDeTrabajo`,
// `relacionConEmpleador`, `esElPropioAfiliado`) se importan, no se copian.
//
// El «hoy» de cada regla es la fecha de la consulta (`ahoraDe`): process.ts usaba la hora
// del armado en seis lugares.
//
// Lo que queda dicho por primera vez: de qué fuente salió el empleo actual
// (`lab.empleo_actual.fuente`), qué registros sostienen el salario más alto, y la calidad
// de cada cosa: el aporte de un empleador es `confirmado_por_tercero`; el de quien es su
// propio patrono o aporta por cuenta propia es `declarado`.
//
// Los campos del RUC de `laboral` (fechas, establecimientos, estado de la actividad) los
// emite `actividad-con-ruc.ts`.

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { type AnyRecord, type Fila, filasDe, num, parseFecha, refDeFila, refDeRespuesta, respuestaDe, textoDe } from "../lectura-del-crudo.ts";
import { CODIGOS_DE_AFILIACION_PROPIA, codigoDeTipoDeEmpleador, mesClave } from "../lectura-del-iess.ts";
import { ahoraDe, aniosDesdeMs, mesesEntreFechas, parseFechaDDMMYYYY } from "../reloj.ts";
import type { Calidad, CodigoDelCatalogo, Contexto, Descarte, Diferencia, DiferenciaEsperada, ElementoDeLista, Entidad, Hecho, MotivoDeNoDisponible, RefDeRegistro } from "../tipos.ts";
import { CORTE_IESS_CONOCIDO, reglaDeTrabajo } from "../../fuentes-ingreso.ts";
import { aporteDeSuPropioPatrono, esElPropioAfiliado, esSuPropioPatrono, relacionConEmpleador } from "../../patrono.ts";
import type { RespuestaProveedorInfo1 } from "../../types.ts";

const P = "laboral.";

type Perfil = { campo: string; enSinValor: CodigoDelCatalogo["enElPerfilSinValor"] } | null;
function codigo(
  codigo: string,
  unidad: CodigoDelCatalogo["unidad"],
  descripcion: string,
  perfil: Perfil,
  opciones: { llegaAlModelo?: boolean; esIdentificador?: boolean; recuento?: CodigoDelCatalogo["recuento"] } = {},
): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo, unidad, descripcion, llegaAlModelo: perfil !== null && (opciones.llegaAlModelo ?? true), esIdentificador: opciones.esIdentificador ?? false };
  if (perfil) {
    c.campoDelPerfil = P + perfil.campo;
    c.enElPerfilSinValor = perfil.enSinValor;
  }
  if (opciones.recuento) c.recuento = opciones.recuento;
  return c;
}
const en = (campo: string, enSinValor: CodigoDelCatalogo["enElPerfilSinValor"]): Perfil => ({ campo, enSinValor });

export const CATALOGO: CodigoDelCatalogo[] = [
  // El empleo actual y quién es el empleador
  codigo("lab.empleos_actuales", "lista", "Empleos vigentes al último corte del IESS: empleador, cargo y salario aproximado", en("empleosActuales", null), { esIdentificador: true }),
  codigo("lab.empleo_actual.fuente", "texto", "De qué fuente salió el empleo actual: el mecanizado, los aportes del corte o ninguna", null),
  codigo("lab.empleador_con_apellido_del_cliente", "si_no", "Algún empleador actual lleva un apellido de la persona", en("empleadorConApellidoDelCliente", null)),
  codigo("lab.cliente_es_su_propio_empleador", "si_no", "El patrono de algún empleo actual es la propia persona", en("clienteEsSuPropioEmpleador", null)),
  // P53 y P54 (lecturas-v3): las mismas dos marcas, pero de cada empleo, sin el nombre del empleador.
  codigo("lab.empleos_actuales.relacion", "lista", "De quién es cada empleo vigente, en el orden de lab.empleos_actuales: si el patrono es la propia persona o lleva uno de sus apellidos", null),
  codigo("lab.cargo.vigente", "texto", "Cargo del empleo actual de mayor salario", en("cargoVigente", null)),
  // El historial
  codigo("lab.empleadores.ultimos_24_meses", "cantidad", "Empleadores con evidencia de actividad en los últimos 24 meses", en("numeroEmpleadoresUltimos24Meses", 0), { recuento: "conteo" }),
  codigo("lab.ingreso.promedio_6_meses", "usd", "Ingreso promedio de los últimos 6 meses con registro en el mecanizado", en("ingresoPromedioUltimos6Meses", null)),
  codigo("lab.empleadores.historial", "cantidad", "Empleadores distintos entre el historial, el mecanizado y los aportes", en("historialEmpleosRegistrados", 0), { recuento: "conteo" }),
  codigo("lab.salario.mas_alto", "usd", "El salario más alto registrado entre el historial, el mecanizado y los aportes", en("salarioMasAltoRegistrado", null)),
  codigo("lab.antiguedad.empleo_actual_meses", "meses", "Antigüedad en el empleo actual, hasta el último aporte", en("antiguedadEmpleoActualMeses", null)),
  codigo("lab.duracion.empleo_mas_largo_meses", "meses", "Duración del empleo más largo registrado", en("duracionEmpleoMasLargoMeses", null)),
  // El empleador vigente, del historial, sólo si es el de un empleo actual
  codigo("lab.empleador_vigente.situacion_legal", "texto", "Situación legal del empleador vigente", en("empleadorVigenteSituacionLegal", null)),
  codigo("lab.empleador_vigente.tipo_compania", "texto", "Tipo de compañía del empleador vigente", en("empleadorVigenteTipoCompania", null)),
  codigo("lab.empleador_vigente.antiguedad_anios", "anios", "Años desde que se constituyó el empleador vigente", en("empleadorVigenteAntiguedadAnios", null)),
  codigo("lab.empleadores.juridicos", "cantidad", "Empleadores vigentes que son empresa", en("empleadoresJuridicos", null), { recuento: "conteo" }),
  // La persona como empleadora
  codigo("lab.es_empleador_o_administrador", "si_no", "Paga una nómina o es administradora de una compañía", en("esEmpleadorOAdministrador", false)),
  codigo("lab.empleados.cantidad", "cantidad", "Empleados distintos en la nómina que paga, sin contar a la propia persona", en("numeroEmpleadosRegistrados", 0), { recuento: "conteo" }),
  codigo("lab.tipo_empleador", "texto", "Sector con que está registrada como empleadora", en("tipoEmpleador", null)),
  codigo("lab.obligaciones_patronales_en_mora", "si_no", "Alguna afiliación patronal tiene obligaciones en mora", en("obligacionesPatronalesEnMora", null)),
  // Lo nuevo que sólo mide
  codigo("dif.lab.salario_del_mes", "usd", "Salario del mismo empleo y mes según el mecanizado y según los aportes", null),
];

// Las que unen, eligen o descartan registros: cada una con un crudo inventado en que
// aplica y uno en que no (scripts/crudos-sinteticos/, campo `reglas`).
export const REGLAS_QUE_MEZCLAN: string[] = [
  "emp.actual@1", // el empleo actual sale del mecanizado o, sin él, de los aportes del corte
  "emp.union@1", // una entidad por empleador y fecha de ingreso, con una vista por fuente
  "emp.historial@1", // empleadores distintos entre tres fuentes: manda el RUC, sin RUC el nombre
  "emp.salario_mas_alto@1", // el máximo entre tres fuentes, citando qué registros lo sostienen
  "emp.vigente@1", // el historial sirve sólo si su RUC es el de un empleo actual
  "emp.antiguedad@1", // sólo los aportes, sin cruzar con el mecanizado: a propósito
];

export const DIFERENCIAS_ESPERADAS: DiferenciaEsperada[] = [
  {
    campo: "laboral.*",
    detector: "dato-laboral-de-fuente-sin-respuesta-escrito-como-total",
    aprobadaEl: "pendiente: la aprueba el negocio con el PR de estructura-v30",
    motivo: "una fuente que no contestó deja el campo sin dato en vez del parcial, 0 o «sin RUC»",
    cuando: "sin_dato",
  },
];

const MECANIZADO: [string, string] = ["trabajoHistoricosMecanizado", "mecanizadoEmpleados"];
const TIESS: [string, string] = ["basesInternas", "tiess"];
const HISTORIAL: [string, string] = ["trabajoHistoricos", "trabajosHistoricos"];
const NOMINA: [string, string] = ["empleados", "empleados"];
const ADMINISTRACIONES: [string, string] = ["administraciones", "administraciones"];
const PATRONAL: [string, string] = ["cumplimientoPatronal", "afiliaciones"];

const F_MECANIZADO = MECANIZADO[0];
const F_TIESS = TIESS[0];

// ---- Lo que el perfil calcula dentro de buildStandardProfile, copiado (etapa A) ----

// El RUC como se compara: sólo dígitos, y la cédula de un patrono persona natural es su
// RUC sin el 001. Cualquier otra longitud no es un RUC.
export function rucComparable(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 10) return `${d}001`;
  return d.length === 13 ? d : null;
}

// Siglas de la forma societaria que cada fuente escribe a su manera.
const SIGLAS_SOCIETARIAS = new Set(["S", "A", "SA", "CIA", "LTDA", "CA", "C", "L"]);

export function nombreComparable(v: unknown): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/Ã‘/g, "N")
    .replace(/[?�]/g, "N")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p !== "" && !SIGLAS_SOCIETARIAS.has(p))
    .join(" ");
}

// empleadoresDistintos() de process.ts, pero devolviendo a quiénes junta cada empleador:
// el RUC manda; un registro sin RUC se une al empleador de igual nombre que sí lo trae, y
// si no hay ninguno cuenta por su nombre. El tamaño del mapa es el valor del perfil.
export function agruparEmpleadores<T extends { ruc: string | null; nombre: string | null }>(registros: T[]): Map<string, T[]> {
  const rucPorNombre = new Map<string, string>();
  for (const r of registros) {
    const nombre = nombreComparable(r.nombre);
    if (r.ruc && nombre && !rucPorNombre.has(nombre)) rucPorNombre.set(nombre, r.ruc);
  }
  const grupos = new Map<string, T[]>();
  for (const r of registros) {
    const nombre = nombreComparable(r.nombre);
    const ruc = r.ruc ?? (nombre ? rucPorNombre.get(nombre) ?? null : null);
    const clave = ruc ? `r:${ruc}` : nombre ? `n:${nombre}` : null;
    if (!clave) continue;
    const g = grupos.get(clave);
    if (g) g.push(r);
    else grupos.set(clave, [r]);
  }
  return grupos;
}

// La primera de cada clave, en el orden en que vienen (un Map con las repetidas se quedaría con la última).
function primeraDeCada<T>(xs: T[], clave: (x: T) => unknown): T[] {
  const vistas = new Set<unknown>();
  return xs.filter((x) => {
    const k = clave(x);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

// El corte que usa analizarFuentesIngreso(): el pasado, o el último mes del propio
// cliente si es posterior. Lee los aportes como ese archivo (`basesInternas.data.data`
// si existe): son dos lectores del mismo crudo y la paridad los reproduce a los dos.
export function corteIessUsado(crudo: AnyRecord, corteConocido: string): string {
  const bi = ((((crudo.basesInternas as AnyRecord | undefined)?.data as AnyRecord | undefined)?.data ??
    (crudo.basesInternas as AnyRecord | undefined)?.data ?? {}) as AnyRecord);
  const aportes = (Array.isArray(bi.tiess) ? bi.tiess : []) as AnyRecord[];
  let ultimo: string | null = null;
  for (const a of aportes) {
    const k = mesClave(a.anio, a.mes);
    if (k && (!ultimo || k > ultimo)) ultimo = k;
  }
  return ultimo && ultimo > corteConocido ? ultimo : corteConocido;
}

const baseDateTs = (r: AnyRecord): number => parseFecha(r.baseDate ? `${r.baseDate}-01` : null)?.getTime() ?? 0;

const anioMesA0 = (t: AnyRecord): number | null => {
  const anio = num(t.anio);
  const mes = num(t.mes);
  return anio !== null && mes !== null ? anio * 12 + (mes - 1) : null;
};
const fechaDeAnioMesA0 = (a0: number): Date => new Date(Math.floor(a0 / 12), a0 % 12, 1);

// «dd/mm/aaaa» del IESS a «aaaa-mm-dd», sin pasar por Date (un Date la corre un día).
function isoDeDDMMYYYY(v: unknown): string | null {
  const m = typeof v === "string" ? v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
const ANTES_DE_1950 = Date.UTC(1950, 0, 1);
// Una fecha en milisegundos del historial o del mecanizado; 0 o negativa es «sin fecha».
function isoDeMs(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < ANTES_DE_1950) return null;
  return new Date(n).toISOString().slice(0, 10);
}

// ---- Las filas con lo que la regla necesita de cada una ----

interface RegistroDelHistorial {
  fila: Fila;
  ingreso: number;
  salario: number | null;
  esJuridica: boolean;
  situacion: string | null;
  tipoCompania: string | null;
  fechaConstitucion: unknown;
  ruc: string | null;
  nombre: string | null;
}

interface EmpleoActual {
  fila: Fila;
  empleador: string | null;
  cargo: string | null;
  salarioAprox: number | null;
  ruc: unknown;
}

export interface EmpleoDeLaPersona {
  empleador: string | null;
  ruc: string | null;
  fechaDeIngreso: string | null;
  fechaDeSalida: string | null;
  cargo: string | null;
  ultimoMes: string | null;
  ultimoSalario: number | null;
  esSuPropioPatrono: boolean;
  calidad: Extract<Calidad, "confirmado_por_tercero" | "declarado">;
  fuentes: string[];
}

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const cedula = contexto.cedula;
  const ahora = ahoraDe(contexto);
  const h = ayudanteDelGrupo(emisor, CATALOGO);
  // Como process.ts (identidad.nombreCompleto): el cotejo de apellidos y del propio patrono.
  const nombre = (((crudo.general as AnyRecord | undefined)?.data as AnyRecord | undefined)?.personaNatural as AnyRecord | undefined)?.nombre as string | null ?? null;

  const estado = new Map<string, "contesto" | MotivoDeNoDisponible>();
  const contesto = (fuente: string) => {
    if (!estado.has(fuente)) estado.set(fuente, respuestaDe(crudo, fuente));
    return estado.get(fuente)!;
  };
  const respuestas = (...listas: Array<[string, string]>) => listas.map(([f, l]) => refDeRespuesta(crudo, consulta, f, l));

  // Un hecho con valor si contestaron todas las fuentes que lee; si no, sin valor y con el
  // parcial (lo que dicen las filas que sí llegaron: lo que el perfil escribe hoy). Con la
  // respuesta completa y nada que decir, `no_aplica`.
  function emitirHecho(
    cod: string,
    regla: string,
    listas: Array<[string, string]>,
    valor: Hecho["valor"],
    registros: RefDeRegistro[],
    opciones: { calidad?: Calidad; descartados?: Descarte[]; entidades?: string[]; fechaDelDato?: string | null; sinValor?: MotivoDeNoDisponible } = {},
  ) {
    const fuentes = listas.map(([f]) => f);
    const caidas = fuentes.filter((f) => contesto(f) !== "contesto");
    if (caidas.length) {
      h.sinValor(cod, regla, fuentes, caidas.some((f) => contesto(f) === "fuente_sin_respuesta") ? "fuente_sin_respuesta" : "fuente_deshabilitada", valor);
      return;
    }
    if (valor === null) return void h.sinValor(cod, regla, fuentes, opciones.sinValor ?? "no_aplica");
    const hecho: Omit<Hecho, "clase" | "fechaDeLaConsulta"> = {
      codigo: cod, regla, unidad: CATALOGO.find((c) => c.codigo === cod)!.unidad, valor, calidad: opciones.calidad ?? "confirmado_por_tercero",
      fuentes, fechaDelDato: opciones.fechaDelDato ?? null, registros: registros.length ? registros : respuestas(...listas),
    };
    if (opciones.descartados?.length) hecho.descartados = opciones.descartados;
    if (opciones.entidades?.length) hecho.entidades = opciones.entidades;
    emisor.hecho(hecho);
  }

  // ---- Las filas ----
  const tiess = filasDe(crudo, ...TIESS);
  const nominaCompleta = filasDe(crudo, ...NOMINA);
  const propiosEnLaNomina = nominaCompleta.filter((f) => esElPropioAfiliado(f.r, cedula, nombre));
  const nomina = nominaCompleta.filter((f) => !propiosEnLaNomina.includes(f));
  const administraciones = filasDe(crudo, ...ADMINISTRACIONES);
  const afiliaciones = filasDe(crudo, ...PATRONAL);
  const mecanizado = filasDe(crudo, ...MECANIZADO);
  const mecanizadoOrdenado = [...mecanizado].sort((a, b) => baseDateTs(b.r) - baseDateTs(a.r));
  const historialFilas = filasDe(crudo, ...HISTORIAL);

  const corte = corteIessUsado(crudo, contexto.corteIess || CORTE_IESS_CONOCIDO);

  // ¿Quién paga este registro? Un empleador es un tercero; la persona como su propio
  // patrono, o aportando por cuenta propia, se declara a sí misma.
  const patronoDe = (r: AnyRecord) => ((r.personaPatrono as AnyRecord | undefined) ?? {});
  const esPropio = (f: Fila): boolean => {
    const r = f.r;
    if (f.fuente === F_TIESS || f.fuente === NOMINA[0]) return aporteDeSuPropioPatrono(r, cedula, nombre) || CODIGOS_DE_AFILIACION_PROPIA.has(codigoDeTipoDeEmpleador(r.tipEmp) ?? "");
    if (f.fuente === F_MECANIZADO) {
      const p = patronoDe(r);
      return esSuPropioPatrono({ ruc: r.rucEmpresa ?? p.identificacion, nombrePatrono: r.nombreEmpresa ?? p.nombre ?? p.nombreComercial }, cedula, nombre)
        || CODIGOS_DE_AFILIACION_PROPIA.has(codigoDeTipoDeEmpleador(r.tipoEmpresa) ?? "");
    }
    const p = patronoDe((r.personaTrabajo as AnyRecord | undefined) ?? {});
    return esSuPropioPatrono({ ruc: p.identificacion, nombrePatrono: p.nombre ?? p.nombreComercial }, cedula, nombre);
  };
  const calidadDe = (filas: Fila[]): Calidad => (filas.some(esPropio) ? "declarado" : "confirmado_por_tercero");

  // ---- El historial (pn_trabajo_historicos), como lo lee process.ts ----
  const historial: RegistroDelHistorial[] = historialFilas.map((f) => {
    const t = (f.r.personaTrabajo as AnyRecord | undefined) ?? {};
    const patrono = (t.personaPatrono as AnyRecord | undefined) ?? {};
    return {
      fila: f,
      ingreso: Number(t.fechaIngreso ?? 0),
      salario: num((t.personaIngreso as AnyRecord | undefined)?.valor),
      esJuridica: String(patrono.tipoPersona ?? "").toUpperCase() === "JURIDICA",
      situacion: textoDe((patrono.situacionLegal as AnyRecord | undefined)?.nombre),
      tipoCompania: textoDe((patrono.tipoCompania as AnyRecord | undefined)?.nombre),
      fechaConstitucion: patrono.fechaConstitucion,
      ruc: rucComparable(patrono.identificacion),
      nombre: textoDe(patrono.nombre) ?? textoDe(patrono.nombreComercial),
    };
  });
  const delMecanizado = mecanizado.map((f) => {
    const patrono = patronoDe(f.r);
    return {
      fila: f,
      ruc: rucComparable(f.r.rucEmpresa ?? patrono.identificacion),
      nombre: textoDe(f.r.nombreEmpresa) ?? textoDe(patrono.nombre) ?? textoDe(patrono.nombreComercial),
      salario: num((f.r.personaIngreso as AnyRecord | undefined)?.valor),
    };
  });
  const delosAportes = tiess.map((f) => ({ fila: f, ruc: rucComparable(f.r.rucEmp), nombre: textoDe(f.r.nomEmp), salario: num(f.r.salario) }));

  // ---- Las entidades: un empleo por empleador y fecha de ingreso, con una vista por fuente ----
  const todos = [
    ...historial.map((r) => ({ fila: r.fila, ruc: r.ruc, nombre: r.nombre })),
    ...delMecanizado.map((r) => ({ fila: r.fila, ruc: r.ruc, nombre: r.nombre })),
    ...delosAportes.map((r) => ({ fila: r.fila, ruc: r.ruc, nombre: r.nombre })),
  ];
  const empleadores = agruparEmpleadores(todos);
  const empleadorDe = new Map<Fila, { clave: string; porRuc: boolean }>();
  for (const [clave, miembros] of empleadores) for (const m of miembros) empleadorDe.set(m.fila, { clave, porRuc: clave.startsWith("r:") });
  const ingresoDe = (f: Fila): string | null =>
    f.fuente === F_TIESS ? isoDeDDMMYYYY(f.r.fecIng)
    : f.fuente === F_MECANIZADO ? isoDeMs(f.r.fechaIngreso)
    : isoDeMs((f.r.personaTrabajo as AnyRecord | undefined)?.fechaIngreso);

  const clavesDeLaEntidad = new Map<string, Entidad["clave"]>();
  const entidadDeFila = new Map<Fila, Entidad["clave"]>();
  const filasPorEmpleo = new Map<string, Fila[]>();
  for (const m of todos) {
    const e = empleadorDe.get(m.fila);
    if (!e) continue;
    const identidad = `${e.clave}|${ingresoDe(m.fila) ?? ""}`;
    const g = filasPorEmpleo.get(identidad);
    if (g) g.push(m.fila);
    else filasPorEmpleo.set(identidad, [m.fila]);
  }
  // Para cada fuente, la fila más reciente de cada empleo: es lo que ve esa fuente.
  const mesDe = (f: Fila): string | null =>
    f.fuente === F_TIESS ? mesClave(f.r.anio, f.r.mes)
    : f.fuente === F_MECANIZADO ? (typeof f.r.baseDate === "string" ? f.r.baseDate : null)
    : null;
  const ultimaDe = (filas: Fila[]): Fila => filas.reduce((a, b) => ((mesDe(b) ?? "") > (mesDe(a) ?? "") ? b : a), filas[0]);
  const vistasPorEmpleo = new Map<string, { tiess?: Fila; mecanizado?: Fila; historial?: Fila }>();
  for (const [identidad, filas] of filasPorEmpleo) {
    const clave = emisor.clave("emp", identidad);
    clavesDeLaEntidad.set(identidad, clave);
    for (const f of filas) entidadDeFila.set(f, clave);
    const deTiess = filas.filter((f) => f.fuente === F_TIESS);
    const deMecanizado = filas.filter((f) => f.fuente === F_MECANIZADO);
    const delHistorial = filas.filter((f) => f.fuente === HISTORIAL[0]);
    vistasPorEmpleo.set(identidad, {
      tiess: deTiess.length ? ultimaDe(deTiess) : undefined,
      mecanizado: deMecanizado.length ? ultimaDe(deMecanizado) : undefined,
      historial: delHistorial[0],
    });
  }
  const salarioDeVista = (f: Fila): number | null =>
    f.fuente === F_TIESS ? num(f.r.salario)
    : f.fuente === F_MECANIZADO ? num((f.r.personaIngreso as AnyRecord | undefined)?.valor)
    : num(((f.r.personaTrabajo as AnyRecord | undefined)?.personaIngreso as AnyRecord | undefined)?.valor);
  const atributosDe = (f: Fila): Partial<EmpleoDeLaPersona> => {
    const r = f.r;
    if (f.fuente === F_TIESS) {
      return { empleador: textoDe(r.nomEmp), ruc: rucComparable(r.rucEmp), fechaDeIngreso: isoDeDDMMYYYY(r.fecIng), fechaDeSalida: isoDeDDMMYYYY(r.fecSal), cargo: textoDe(r.ocupacion), ultimoMes: mesClave(r.anio, r.mes), ultimoSalario: salarioDeVista(f) };
    }
    if (f.fuente === F_MECANIZADO) {
      const p = patronoDe(r);
      return { empleador: textoDe(r.nombreEmpresa) ?? textoDe(p.nombre), ruc: rucComparable(r.rucEmpresa ?? p.identificacion), fechaDeIngreso: isoDeMs(r.fechaIngreso), cargo: textoDe((r.cargo as AnyRecord | undefined)?.nombre), ultimoMes: typeof r.baseDate === "string" ? r.baseDate : null, ultimoSalario: salarioDeVista(f) };
    }
    const t = (r.personaTrabajo as AnyRecord | undefined) ?? {};
    const p = (t.personaPatrono as AnyRecord | undefined) ?? {};
    return { empleador: textoDe(p.nombre) ?? textoDe(p.nombreComercial), ruc: rucComparable(p.identificacion), fechaDeIngreso: isoDeMs(t.fechaIngreso), cargo: textoDe((t.cargo as AnyRecord | undefined)?.nombre), ultimoSalario: salarioDeVista(f) };
  };
  for (const [identidad, filas] of filasPorEmpleo) {
    const clave = clavesDeLaEntidad.get(identidad)!;
    const v = vistasPorEmpleo.get(identidad)!;
    const vistas = ([v.tiess, v.mecanizado, v.historial].filter(Boolean) as Fila[]).map((f) => ({
      registro: refDeFila(consulta, f),
      fechaDelDato: mesDe(f) ? `${mesDe(f)}-01` : null,
      atributos: atributosDe(f) as Partial<EmpleoDeLaPersona>,
    }));
    const principal = (v.tiess ?? v.mecanizado ?? v.historial)!;
    const base = atributosDe(principal);
    const conRuc = filas.some((f) => empleadorDe.get(f)?.porRuc);
    const atributos: EmpleoDeLaPersona = {
      empleador: base.empleador ?? null,
      ruc: base.ruc ?? vistas.map((x) => x.atributos.ruc).find(Boolean) ?? null,
      fechaDeIngreso: base.fechaDeIngreso ?? null,
      fechaDeSalida: base.fechaDeSalida ?? null,
      cargo: base.cargo ?? vistas.map((x) => x.atributos.cargo).find(Boolean) ?? null,
      ultimoMes: base.ultimoMes ?? vistas.map((x) => x.atributos.ultimoMes).find(Boolean) ?? null,
      ultimoSalario: base.ultimoSalario ?? null,
      esSuPropioPatrono: filas.some(esPropio),
      calidad: calidadDe(filas) === "declarado" ? "declarado" : "confirmado_por_tercero",
      fuentes: [...new Set(filas.map((f) => f.fuente))],
    };
    emisor.entidad({
      clave,
      tipo: "empleo",
      atributos,
      vistas,
      union: vistas.length > 1 ? { regla: "emp.union@1", criterio: conRuc ? "ruc" : "nombre" } : null,
      atribucion: { deLaPersona: "si", metodo: "la_fuente_busca_por_identificacion" },
    });
  }
  const clavesDe = (filas: Fila[]) => [...new Set(filas.map((f) => entidadDeFila.get(f)).filter((c): c is Entidad["clave"] => c !== undefined))];

  // ---- El empleo actual: el mecanizado si es reciente, y si no los aportes del corte ----
  const ultimoMecanizado = mecanizadoOrdenado[0] ?? null;
  const mesesDesde = (fecha: unknown): number | null => {
    const d = parseFecha(fecha);
    return d ? mesesEntreFechas(d, ahora) : null;
  };
  const dentroUltimos3Meses = (fecha: unknown): boolean => {
    const m = mesesDesde(fecha);
    return m !== null && m >= 0 && m <= 3;
  };
  const empleoActualConfiable =
    ultimoMecanizado !== null &&
    dentroUltimos3Meses(ultimoMecanizado.r.baseDate ? `${ultimoMecanizado.r.baseDate}-01` : null) &&
    String(ultimoMecanizado.r.baseDate ?? "") >= corte;
  const corteDelMecanizado = ultimoMecanizado?.r.baseDate ?? null;
  const registrosDelCorte = empleoActualConfiable ? mecanizadoOrdenado.filter((f) => f.r.baseDate === corteDelMecanizado) : [];
  const aportesDelCorte = registrosDelCorte.length === 0
    ? tiess.filter((f) => {
      const anio = num(f.r.anio);
      const mes = num(f.r.mes);
      return anio !== null && mes !== null && `${anio}-${String(mes).padStart(2, "0")}` === corte;
    })
    : [];
  const nombreEmpleador = (r: AnyRecord): string | null =>
    ((r.personaPatrono as AnyRecord | undefined)?.nombreComercial as string) ?? ((r.personaPatrono as AnyRecord | undefined)?.nombre as string) ?? null;
  const actuales: EmpleoActual[] = registrosDelCorte.length > 0
    ? registrosDelCorte.map((f) => ({
      fila: f,
      empleador: nombreEmpleador(f.r),
      cargo: ((f.r.cargo as AnyRecord | undefined)?.nombre as string) ?? null,
      salarioAprox: num((f.r.personaIngreso as AnyRecord | undefined)?.valor),
      ruc: f.r.rucEmpresa ?? (f.r.personaPatrono as AnyRecord | undefined)?.identificacion ?? null,
    }))
    : aportesDelCorte.map((f) => {
      const salario = num(f.r.salario);
      return { fila: f, empleador: textoDe(f.r.nomEmp), cargo: textoDe(f.r.ocupacion), salarioAprox: salario !== null && salario > 0 ? salario : null, ruc: f.r.rucEmp ?? null };
    });
  const filasActuales = actuales.map((e) => e.fila);
  const hayEmpleoActual = actuales.length > 0;
  const deLaFuenteActual: Array<[string, string]> = [MECANIZADO, TIESS];
  const fuenteDelEmpleoActual = registrosDelCorte.length > 0 ? "mecanizado" : aportesDelCorte.length > 0 ? "aportes" : "ninguna";
  // Lo que se descartó para elegir: el mecanizado que no sirve (viejo o anterior al corte)
  // cuando los aportes del corte tomaron su lugar.
  const descartadosDelMecanizado: Descarte[] = fuenteDelEmpleoActual === "aportes" && ultimoMecanizado
    ? [{ registro: refDeFila(consulta, ultimoMecanizado, "baseDate"), motivo: !dentroUltimos3Meses(ultimoMecanizado.r.baseDate ? `${ultimoMecanizado.r.baseDate}-01` : null) ? "mecanizado_de_mas_de_3_meses" : "mecanizado_anterior_al_corte_del_iess" }]
    : [];

  emitirHecho("lab.empleos_actuales", "emp.actual@1", deLaFuenteActual,
    actuales.map((e) => ({ empleador: e.empleador, cargo: e.cargo, salarioAprox: e.salarioAprox })) as ElementoDeLista[],
    filasActuales.map((f) => refDeFila(consulta, f)),
    { calidad: filasActuales.length ? calidadDe(filasActuales) : "confirmado_por_tercero", descartados: descartadosDelMecanizado, entidades: clavesDe(filasActuales) });
  emitirHecho("lab.empleo_actual.fuente", "emp.actual@1", deLaFuenteActual, fuenteDelEmpleoActual,
    filasActuales.map((f) => refDeFila(consulta, f)), { calidad: "calculado", descartados: descartadosDelMecanizado });

  // Las señales de vínculo familiar miran a TODOS los empleadores vigentes.
  const relaciones = actuales.map((e) => relacionConEmpleador(e.empleador, nombre, e.ruc, cedula));
  const algunoEs = (clave: "comparteApellido" | "esElMismoCliente"): boolean | null =>
    relaciones.some((x) => x?.[clave] === true) ? true : relaciones.some((x) => x?.[clave] === false) ? false : null;
  const sinRelacion: MotivoDeNoDisponible = hayEmpleoActual ? "no_se_puede_atribuir" : "no_aplica";
  const porRelacion = (cod: string, clave: "comparteApellido" | "esElMismoCliente") =>
    emitirHecho(cod, "emp.actual@1", deLaFuenteActual, hayEmpleoActual ? algunoEs(clave) : null, filasActuales.map((f) => refDeFila(consulta, f)), { calidad: "calculado", entidades: clavesDe(filasActuales), sinValor: sinRelacion });
  porRelacion("lab.empleador_con_apellido_del_cliente", "comparteApellido");
  porRelacion("lab.cliente_es_su_propio_empleador", "esElMismoCliente");
  // Las mismas marcas de cada empleo, en su orden, para las lecturas de P53 y P54: con dos
  // empleos, la marca de la persona no dice cuál es el del pariente ni cuál es su negocio. Se
  // calculan acá, con el RUC, porque el nombre de la persona no es un hecho: es la misma regla
  // de las dos marcas de arriba, de a un empleo. null es que no se pudo saber (sin nombres que
  // comparar y sin un RUC que diga que es la propia persona).
  emitirHecho("lab.empleos_actuales.relacion", "emp.actual@1", deLaFuenteActual,
    relaciones.map((x) => ({ esElMismoCliente: x?.esElMismoCliente ?? null, comparteApellido: x?.comparteApellido ?? null })),
    filasActuales.map((f) => refDeFila(consulta, f)), { calidad: "calculado", entidades: clavesDe(filasActuales) });

  // El cargo es el del empleo actual de mayor salario, entre los que tienen cargo.
  const conCargo = [...actuales].filter((e) => textoDe(e.cargo) !== null).sort((a, b) => (b.salarioAprox ?? -1) - (a.salarioAprox ?? -1));
  emitirHecho("lab.cargo.vigente", "emp.actual@1", deLaFuenteActual, textoDe(conCargo[0]?.cargo ?? null),
    conCargo[0] ? [refDeFila(consulta, conCargo[0].fila)] : [], { calidad: conCargo[0] ? calidadDe([conCargo[0].fila]) : undefined, entidades: conCargo[0] ? clavesDe([conCargo[0].fila]) : [] });

  // ---- Antigüedad y duración, de los aportes (a propósito sin cruzar con el mecanizado) ----
  const mesesDesdeUltimaEvidenciaActiva = (t: AnyRecord): number | null => {
    const fecSal = String(t.fecSal ?? "").trim();
    if (fecSal) {
      const d = parseFechaDDMMYYYY(fecSal);
      return d ? mesesEntreFechas(d, ahora) : null;
    }
    const a0 = anioMesA0(t);
    return a0 !== null ? mesesEntreFechas(fechaDeAnioMesA0(a0), ahora) : null;
  };
  const empleosSinSalida = new Map<string, { fecIng: unknown; ultimo: number; snapshots: number; ultimaFila: Fila }>();
  for (const f of tiess) {
    if (String(f.r.fecSal ?? "").trim()) continue;
    const a0 = anioMesA0(f.r);
    if (a0 === null) continue;
    const clave = `${f.r.nomEmp}|${f.r.fecIng}`;
    const e = empleosSinSalida.get(clave);
    if (!e) empleosSinSalida.set(clave, { fecIng: f.r.fecIng, ultimo: a0, snapshots: 1, ultimaFila: f });
    else {
      e.snapshots++;
      if (a0 > e.ultimo) {
        e.ultimo = a0;
        e.ultimaFila = f;
      }
    }
  }
  const esTrabajo = reglaDeTrabajo(crudo as unknown as RespuestaProveedorInfo1, cedula, nombre);
  const empleosDeTrabajo = [...empleosSinSalida.values()].map((e) => ({ ...e, trabajo: esTrabajo(e.ultimaFila.r) })).filter((e) => e.trabajo !== null);
  const ultimoMesConEmpleo = Math.max(-Infinity, ...empleosDeTrabajo.map((e) => e.ultimo));
  const antiguedadesVigentes = empleosDeTrabajo
    .filter((e) => e.ultimo === ultimoMesConEmpleo && e.snapshots >= 3 && (mesesDesdeUltimaEvidenciaActiva(e.ultimaFila.r) ?? Infinity) <= 3)
    .map((e) => {
      const ingreso = parseFechaDDMMYYYY(e.fecIng);
      if (!ingreso) return null;
      const [anioPiso, mesPiso] = (e.trabajo?.pisoInicio ?? "1950-01").split("-").map(Number);
      const piso = new Date(anioPiso, mesPiso - 1, 1);
      return { meses: mesesEntreFechas(ingreso < piso ? piso : ingreso, fechaDeAnioMesA0(e.ultimo)), fila: e.ultimaFila };
    })
    .filter((m): m is { meses: number; fila: Fila } => m !== null);
  const ganadora = antiguedadesVigentes.reduce<{ meses: number; fila: Fila } | null>((mejor, e) => (mejor === null || e.meses > mejor.meses ? e : mejor), null);
  emitirHecho("lab.antiguedad.empleo_actual_meses", "emp.antiguedad@1", [TIESS], ganadora ? ganadora.meses : null,
    ganadora ? [refDeFila(consulta, ganadora.fila, "fecIng")] : [], { calidad: "calculado", entidades: ganadora ? clavesDe([ganadora.fila]) : [] });

  const empleosUnicos = new Map<string, { fecIng: unknown; fecSal: unknown; ultimoAnioMesA0: number | null; fila: Fila }>();
  for (const f of tiess) {
    const clave = `${f.r.nomEmp}|${f.r.fecIng}|${f.r.fecSal}`;
    const a0 = anioMesA0(f.r);
    const existente = empleosUnicos.get(clave);
    if (!existente) empleosUnicos.set(clave, { fecIng: f.r.fecIng, fecSal: f.r.fecSal, ultimoAnioMesA0: a0, fila: f });
    else if (a0 !== null && (existente.ultimoAnioMesA0 === null || a0 > existente.ultimoAnioMesA0)) {
      existente.ultimoAnioMesA0 = a0;
      existente.fila = f;
    }
  }
  let masLargo: { meses: number; fila: Fila } | null = null;
  for (const e of empleosUnicos.values()) {
    const inicio = parseFechaDDMMYYYY(e.fecIng);
    if (!inicio) continue;
    const finStr = String(e.fecSal ?? "").trim();
    const fin = finStr ? parseFechaDDMMYYYY(finStr) : e.ultimoAnioMesA0 !== null ? fechaDeAnioMesA0(e.ultimoAnioMesA0) : null;
    if (!fin) continue;
    const duracion = mesesEntreFechas(inicio, fin);
    if (masLargo === null || duracion > masLargo.meses) masLargo = { meses: duracion, fila: e.fila };
  }
  emitirHecho("lab.duracion.empleo_mas_largo_meses", "emp.antiguedad@1", [TIESS], masLargo ? masLargo.meses : null,
    masLargo ? [refDeFila(consulta, masLargo.fila, "fecIng")] : [], { calidad: "calculado", entidades: masLargo ? clavesDe([masLargo.fila]) : [] });

  // Empleadores con evidencia de actividad en los últimos 24 meses: uno por nombre.
  const porNombre = new Map<unknown, Fila>();
  for (const f of tiess) {
    const m = mesesDesdeUltimaEvidenciaActiva(f.r);
    if (m !== null && m <= 24 && !porNombre.has(f.r.nomEmp)) porNombre.set(f.r.nomEmp, f);
  }
  const de24 = [...porNombre.values()];
  emitirHecho("lab.empleadores.ultimos_24_meses", "emp.antiguedad@1", [TIESS], porNombre.size, de24.map((f) => refDeFila(consulta, f)),
    { calidad: de24.length ? calidadDe(de24) : undefined, entidades: clavesDe(de24) });

  // Se suma por mes y recién después se promedian los meses (dos empleos a la vez son dos registros por mes).
  const porMes = new Map<string, { total: number; filas: Fila[] }>();
  for (const f of mecanizadoOrdenado) {
    const mes = String(f.r.baseDate ?? "");
    const valor = num((f.r.personaIngreso as AnyRecord | undefined)?.valor);
    if (!mes || valor === null) continue;
    const m = porMes.get(mes) ?? { total: 0, filas: [] };
    m.total += valor;
    m.filas.push(f);
    porMes.set(mes, m);
  }
  const ultimos6 = [...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  const filasDelPromedio = ultimos6.flatMap(([, m]) => m.filas);
  const promedio6 = ultimos6.length ? Math.round((ultimos6.map(([, m]) => m.total).reduce((a, b) => a + b, 0) / ultimos6.length) * 100) / 100 : null;
  emitirHecho("lab.ingreso.promedio_6_meses", "emp.actual@1", [MECANIZADO], promedio6, filasDelPromedio.map((f) => refDeFila(consulta, f, "personaIngreso")),
    { calidad: filasDelPromedio.length ? calidadDe(filasDelPromedio) : undefined, entidades: clavesDe(filasDelPromedio), fechaDelDato: ultimos6.length ? `${ultimos6[0][0]}-01` : null });

  // ---- El historial de empleadores y el salario más alto, de tres fuentes ----
  const registrosDeEmpleadores = [...historial, ...delMecanizado, ...delosAportes];
  const empleadoresDelHistorial = agruparEmpleadores(registrosDeEmpleadores);
  const unPorEmpleador = [...empleadoresDelHistorial.values()].map((g) => g[0].fila);
  emitirHecho("lab.empleadores.historial", "emp.historial@1", [HISTORIAL, MECANIZADO, TIESS], empleadoresDelHistorial.size, unPorEmpleador.map((f) => refDeFila(consulta, f)),
    { calidad: unPorEmpleador.length ? calidadDe(unPorEmpleador) : undefined, entidades: clavesDe(unPorEmpleador) });

  const salarios = registrosDeEmpleadores.filter((r): r is typeof r & { salario: number } => typeof r.salario === "number" && r.salario > 0);
  const maximo = salarios.length ? Math.max(...salarios.map((r) => r.salario)) : null;
  const camposDelSalario: Record<string, string> = { [HISTORIAL[0]]: "personaTrabajo", [F_MECANIZADO]: "personaIngreso", [F_TIESS]: "salario" };
  const sostienen: Fila[] = [];
  const quedanAfuera: Descarte[] = [];
  for (const fuente of [HISTORIAL[0], F_MECANIZADO, F_TIESS]) {
    const delaFuente = salarios.filter((r) => r.fila.fuente === fuente);
    const primera = delaFuente.find((r) => r.salario === maximo);
    if (primera) sostienen.push(primera.fila);
    else if (delaFuente.length) {
      const mejor = delaFuente.reduce((a, b) => (b.salario > a.salario ? b : a));
      quedanAfuera.push({ registro: refDeFila(consulta, mejor.fila, camposDelSalario[fuente]), motivo: "el_maximo_de_esta_fuente_es_menor" });
    }
  }
  emitirHecho("lab.salario.mas_alto", "emp.salario_mas_alto@1", [HISTORIAL, MECANIZADO, TIESS], maximo,
    sostienen.map((f) => refDeFila(consulta, f, camposDelSalario[f.fuente])),
    { calidad: sostienen.length ? calidadDe(sostienen) : undefined, descartados: quedanAfuera, entidades: clavesDe(sostienen) });

  // ---- El empleador vigente: el del historial sólo si su RUC es el de un empleo actual ----
  const rucsActuales = new Set(actuales.map((e) => rucComparable(e.ruc)).filter((r): r is string => r !== null));
  const delEmpleoActual = historial.filter((r) => r.ruc !== null && rucsActuales.has(r.ruc));
  const vigente = [...delEmpleoActual].sort((a, b) => b.ingreso - a.ingreso)[0] ?? null;
  const noEsDeUnEmpleoActual: Descarte[] = historial.filter((r) => !delEmpleoActual.includes(r)).map((r) => ({ registro: refDeFila(consulta, r.fila), motivo: "su_ruc_no_es_el_de_un_empleo_actual" }));
  const listasDelVigente: Array<[string, string]> = [HISTORIAL, MECANIZADO, TIESS];
  const delVigente = (cod: string, valor: string | number | null) =>
    emitirHecho(cod, "emp.vigente@1", listasDelVigente, valor, vigente ? [refDeFila(consulta, vigente.fila, "personaTrabajo")] : [],
      { calidad: vigente ? calidadDe([vigente.fila]) : undefined, descartados: noEsDeUnEmpleoActual, entidades: vigente ? clavesDe([vigente.fila]) : [] });
  delVigente("lab.empleador_vigente.situacion_legal", vigente?.situacion ?? null);
  delVigente("lab.empleador_vigente.tipo_compania", vigente?.tipoCompania ?? null);
  emitirHecho("lab.empleador_vigente.antiguedad_anios", "emp.vigente@1", listasDelVigente, vigente ? aniosDesdeMs(vigente.fechaConstitucion, ahora) : null,
    vigente ? [refDeFila(consulta, vigente.fila, "personaTrabajo")] : [], { calidad: "calculado", descartados: noEsDeUnEmpleoActual, entidades: vigente ? clavesDe([vigente.fila]) : [] });
  const juridicas = delEmpleoActual.filter((r) => r.esJuridica);
  const unaPorRuc = primeraDeCada(juridicas, (r) => r.ruc);
  emitirHecho("lab.empleadores.juridicos", "emp.vigente@1", listasDelVigente, delEmpleoActual.length > 0 ? unaPorRuc.length : null,
    unaPorRuc.map((r) => refDeFila(consulta, r.fila, "personaTrabajo")),
    { calidad: unaPorRuc.length ? calidadDe(unaPorRuc.map((r) => r.fila)) : undefined, descartados: noEsDeUnEmpleoActual, entidades: clavesDe(unaPorRuc.map((r) => r.fila)) });

  // ---- La persona como empleadora ----
  const primerasPorCedula = primeraDeCada(nomina.filter((f) => Boolean(f.r.ci)), (f) => f.r.ci);
  const propia: Descarte[] = propiosEnLaNomina.map((f) => ({ registro: refDeFila(consulta, f), motivo: "es_la_propia_persona" }));
  const hayNomina = nomina.length > 0;
  emitirHecho("lab.es_empleador_o_administrador", "emp.actual@1", [NOMINA, ADMINISTRACIONES], hayNomina || administraciones.length > 0,
    hayNomina ? [refDeFila(consulta, nomina[0])] : administraciones.length ? [refDeFila(consulta, administraciones[0])] : [],
    { calidad: hayNomina ? "declarado" : "confirmado_por_tercero", descartados: propia });
  emitirHecho("lab.empleados.cantidad", "emp.actual@1", [NOMINA], primerasPorCedula.length, primerasPorCedula.map((f) => refDeFila(consulta, f)),
    { calidad: "declarado", descartados: propia });
  // El `tipEmp` de la PRIMERA fila de la nómina, aunque sea la propia persona.
  emitirHecho("lab.tipo_empleador", "emp.actual@1", [NOMINA], (nominaCompleta[0]?.r.tipEmp as string) ?? null,
    nominaCompleta[0] ? [refDeFila(consulta, nominaCompleta[0], "tipEmp")] : [], { calidad: "declarado" });
  const enMora = afiliaciones.filter((f) => {
    const t = String(f.r.obligaciones ?? "").toUpperCase();
    return t !== "" && !(t.includes("NO REGISTRA") || t.startsWith("NO "));
  });
  emitirHecho("lab.obligaciones_patronales_en_mora", "emp.actual@1", [PATRONAL], afiliaciones.length > 0 ? enMora.length > 0 : null,
    (enMora.length ? enMora : afiliaciones).map((f) => refDeFila(consulta, f, "obligaciones")));

  // ---- La diferencia entre dos fuentes del IESS sobre el mismo empleo y mes ----
  // Manda la fuente de la que salió el empleo actual; con ninguna, los aportes.
  const manda = fuenteDelEmpleoActual === "mecanizado" ? F_MECANIZADO : F_TIESS;
  for (const [identidad, v] of vistasPorEmpleo) {
    const filas = filasPorEmpleo.get(identidad)!;
    const clave = clavesDeLaEntidad.get(identidad)!;
    const deTiess = filas.filter((f) => f.fuente === F_TIESS && mesDe(f));
    const deMec = filas.filter((f) => f.fuente === F_MECANIZADO && mesDe(f));
    if (!v.tiess || !v.mecanizado) continue;
    const mesesComunes = [...new Set(deTiess.map((f) => mesDe(f)!))].filter((m) => deMec.some((f) => mesDe(f) === m)).sort();
    const mes = mesesComunes.at(-1);
    if (!mes) continue;
    const a = deTiess.find((f) => mesDe(f) === mes)!;
    const b = deMec.find((f) => mesDe(f) === mes)!;
    const va = salarioDeVista(a);
    const vb = salarioDeVista(b);
    if (va === null || vb === null || Math.abs(va - vb) < 0.005) continue;
    const [m, c] = manda === F_TIESS ? [a, b] : [b, a];
    const vm = salarioDeVista(m)!;
    const vc = salarioDeVista(c)!;
    const absoluta = Math.round(Math.abs(vm - vc) * 100) / 100;
    const dif: Omit<Diferencia, "clase" | "fechaDeLaConsulta"> = {
      codigo: "dif.lab.salario_del_mes", regla: "emp.salario_del_mes@1", sobre: `${clave}.salario`,
      manda: { fuente: m.fuente, valor: vm, registro: refDeFila(consulta, m) },
      cede: [{ fuente: c.fuente, valor: vc, registro: refDeFila(consulta, c) }],
      magnitud: { absoluta, relativa: vm !== 0 ? Math.round((absoluta / Math.abs(vm)) * 10000) / 10000 : null },
      lectura: absoluta >= 1 ? "revisar" : "esperada",
    };
    emisor.diferencia(dif);
  }
}
