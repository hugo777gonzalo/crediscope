// Grupo 4 de la capa de hechos, parte 2: la actividad con RUC (docs/capa-de-hechos.md,
// 4.4 y 4.4.1). Fuentes: `contribuyente` (los registros del RUC) y
// `establecimientoActEconomica` (los establecimientos de cada RUC).
//
// ETAPA A. process.ts sigue armando estos campos de `laboral`; el estado de la actividad
// (los cinco casos de su nota) está copiado acá hasta la etapa B. «RUC activo» y «abierto»
// son de ruc.ts, la única implementación: se importan, no se copian. `obligado` se lee
// como ruc.ts («SI», «S», «NO», «N»); el indicio de ingreso mayor de fuentes-ingreso.ts
// compara sólo «SI» y eso es de `ingresos.ts` (riesgo 3).
//
// Lo que queda dicho por primera vez: cuál es el RUC de referencia cuando hay más de uno
// (`ruc.referencia.numero`, con los demás en `descartados`) y la diferencia entre lo que
// dicen las fechas del RUC y sus establecimientos (`dif.ruc.estado`).
//
// El RUC, sus fechas y sus establecimientos los informa el SRI (`confirmado_por_tercero`);
// si el RUC está activo y el estado de la actividad salen de una regla nuestra (`calculado`).

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { type AnyRecord, type Fila, filasDe, parseFecha, refDeFila, refDeRespuesta, respuestaDe, textoDe } from "../lectura-del-crudo.ts";
import { ahoraDe, mesesEntreFechas } from "../reloj.ts";
import type { Calidad, CodigoDelCatalogo, Contexto, Descarte, DiferenciaEsperada, Hecho, MotivoDeNoDisponible, RefDeRegistro } from "../tipos.ts";
import { diaDeFecha, establecimientoAbierto, fechasDelRuc, obligadoALlevarContabilidad, rucActivo, rucDepuradoPorElSri } from "../../ruc.ts";

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
  codigo("ruc.activo", "si_no", "Tiene un RUC activo ante el SRI: sin cese vigente y con un establecimiento abierto si el SRI informa establecimientos", en("tieneRucActivo", false)),
  codigo("ruc.establecimiento.activo", "si_no", "Tiene un establecimiento activo (el mismo criterio del RUC activo)", en("tieneEstablecimientoActivo", false)),
  codigo("lab.es_independiente", "si_no", "Es independiente: tiene un RUC activo", en("esIndependiente", false)),
  codigo("ruc.referencia.numero", "texto", "Número del RUC de referencia: el primero activo y, si ninguno, el primero de la lista", null, { esIdentificador: true }),
  codigo("ruc.fecha.inicio_actividades", "fecha", "Inicio de actividades del RUC de referencia", en("fechaInicioActividadesRuc", null)),
  codigo("ruc.fecha.cese", "fecha", "Cese más reciente del RUC de referencia, incluido el temporal", en("fechaCeseActividadesRuc", null)),
  codigo("ruc.fecha.reinicio", "fecha", "Reinicio de actividades más reciente del RUC de referencia", en("fechaReinicioActividadesRuc", null)),
  codigo("ruc.establecimientos.activos", "cantidad", "Establecimientos abiertos; 0 si el RUC no está activo", en("numeroEstablecimientosActivos", 0), { recuento: "conteo" }),
  codigo("ruc.establecimientos.inactivos", "cantidad", "Establecimientos que no cuentan como activos", en("numeroEstablecimientosInactivos", 0), { recuento: "conteo" }),
  codigo("ruc.establecimientos.registrados", "si_no", "El SRI informa algún establecimiento", en("tieneEstablecimientosRegistrados", false)),
  codigo("ruc.actividad.estado", "texto", "Estado de la actividad económica: sin RUC, activa, reactivada o inactiva", en("estadoActividadEconomica", null)),
  codigo("ruc.actividad.antiguedad_ultima_etapa_meses", "meses", "Antigüedad de la racha activa actual o de la última antes de cesar", en("antiguedadUltimaEtapaActivaMeses", null)),
  codigo("ruc.actividad.meses_inactivo", "meses", "Meses desde el cese, si la actividad está inactiva", en("mesesInactivoActividadEconomica", null)),
  codigo("ruc.cese.tipo", "texto", "Tipo del cese más reciente: cancelación, suspensión definitiva o temporal", en("tipoUltimoCeseRuc", null)),
  codigo("ruc.depurado_por_el_sri", "si_no", "El SRI dio de baja el RUC de oficio, en una depuración", en("rucDepuradoPorElSri", null)),
  codigo("ruc.obligado_contabilidad", "si_no", "Obligado a llevar contabilidad según el registro del RUC", en("obligadoALlevarContabilidadRuc", null), { llegaAlModelo: false }),
  codigo("dif.ruc.estado", "texto", "Lo que dicen las fechas del RUC contra lo que dicen sus establecimientos", null),
];

// Las que unen, eligen o descartan registros: cada una con un crudo inventado en que
// aplica y uno en que no (scripts/crudos-sinteticos/, campo `reglas`).
export const REGLAS_QUE_MEZCLAN: string[] = [
  "ruc.referencia@1", // elige un registro de RUC entre varios y descarta los demás
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

const CONTRIBUYENTE: [string, string] = ["contribuyente", "datosContribuyente"];
const ESTABLECIMIENTOS: [string, string] = ["establecimientoActEconomica", "datosEstablecimientoActEco"];

export interface EstablecimientoDelRuc {
  ruc: string | null;
  numero: string | null;
  nombreComercial: string | null;
  actividad: string | null;
  estado: string | null;
  abierto: boolean; // según ruc.ts (reabrió después del cierre, o el estado lo dice)
  cuentaComoActivo: boolean; // abierto y con el RUC activo: lo que cuenta el perfil
  inicio: string | null;
  cierre: string | null;
  reinicio: string | null;
}

const formatFechaISO = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

// El cese vigente lo decide ruc.ts; acá se parsea la fecha ORIGINAL de ese campo, igual que
// las demás del SRI (ceseMasReciente de process.ts).
function ceseMasReciente(c: AnyRecord): Date | null {
  const cese = fechasDelRuc(c).cese;
  if (!cese) return null;
  const original = [c.fecha_cancelacion, c.fecha_suspension_definitiva, c.fecha_solicitud_suspension].find((v) => diaDeFecha(v) === cese);
  return parseFecha(original);
}

// tipoUltimoCese de process.ts: «suspension_definitiva» gana el empate con la cancelación.
function tipoUltimoCese(c: AnyRecord): "cancelacion" | "suspension_definitiva" | "suspension_temporal" | null {
  const cese = ceseMasReciente(c);
  if (!cese) return null;
  const suspension = parseFecha(c.fecha_suspension_definitiva);
  if (suspension && suspension.getTime() === cese.getTime()) return "suspension_definitiva";
  const cancelacion = parseFecha(c.fecha_cancelacion);
  return cancelacion && cancelacion.getTime() === cese.getTime() ? "cancelacion" : "suspension_temporal";
}

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const ahora = ahoraDe(contexto);
  const h = ayudanteDelGrupo(emisor, CATALOGO);
  const listas: Array<[string, string]> = [CONTRIBUYENTE, ESTABLECIMIENTOS];
  const fuentes = listas.map(([f]) => f);

  const contribuyentes = filasDe(crudo, ...CONTRIBUYENTE);
  const establecimientos = filasDe(crudo, ...ESTABLECIMIENTOS);
  const registrosDeEstablecimientos = establecimientos.map((f) => f.r);
  const activoHoy = (f: Fila) => rucActivo(f.r, registrosDeEstablecimientos);
  const tieneEstablecimientoActivo = contribuyentes.some(activoHoy);
  const abiertos = establecimientos.filter((f) => establecimientoAbierto(f.r));
  const numeroActivos = tieneEstablecimientoActivo ? abiertos.length : 0;
  const numeroInactivos = establecimientos.length - numeroActivos;
  const noCuentan = tieneEstablecimientoActivo ? establecimientos.filter((f) => !abiertos.includes(f)) : establecimientos;
  // El RUC de referencia para las fechas: el activo si hay uno, si no el primero.
  const referencia = contribuyentes.find(activoHoy) ?? contribuyentes[0] ?? null;
  const ref = referencia?.r ?? null;

  // ---- Las entidades: un establecimiento por RUC y número ----
  const claveDe = new Map<Fila, ReturnType<Emisor["clave"]>>();
  establecimientos.forEach((f) => {
    const numero = textoDe(f.r.num_establecimiento);
    const ruc = textoDe(f.r.ruc);
    const identidad = ruc && numero ? `est#${ruc}|${numero}` : `${f.fuente}.${f.lista}#${f.indice}`;
    const clave = emisor.clave("est", identidad);
    claveDe.set(f, clave);
    const abierto = establecimientoAbierto(f.r);
    const atributos: EstablecimientoDelRuc = {
      ruc,
      numero,
      nombreComercial: textoDe(f.r.nombre_comercial),
      actividad: textoDe(f.r.act_economica),
      estado: textoDe(f.r.estado_establecimiento),
      abierto,
      cuentaComoActivo: abierto && tieneEstablecimientoActivo,
      inicio: diaDeFecha(f.r.fech_inicio_actividades),
      cierre: diaDeFecha(f.r.fech_cierre),
      reinicio: diaDeFecha(f.r.fech_reinicio_actividades),
    };
    emisor.entidad({
      clave,
      tipo: "establecimiento",
      atributos,
      vistas: [{ registro: refDeFila(consulta, f), fechaDelDato: null, atributos }],
      union: null,
      atribucion: { deLaPersona: "si", metodo: "la_fuente_busca_por_identificacion" },
    });
  });
  const clavesDe = (filas: Fila[]) => filas.map((f) => claveDe.get(f)!);

  // ---- La respuesta de las dos fuentes ----
  const caidas = fuentes.filter((f) => respuestaDe(crudo, f) !== "contesto");
  const motivoDeCaida: MotivoDeNoDisponible = fuentes.some((f) => respuestaDe(crudo, f) === "fuente_sin_respuesta") ? "fuente_sin_respuesta" : "fuente_deshabilitada";
  const respuestas = (): RefDeRegistro[] => listas.map(([f, l]) => refDeRespuesta(crudo, consulta, f, l));
  function emitirHecho(
    cod: string,
    regla: string,
    valor: Hecho["valor"],
    registros: RefDeRegistro[],
    opciones: { calidad?: Calidad; descartados?: Descarte[]; entidades?: string[] } = {},
  ) {
    if (caidas.length) return void h.sinValor(cod, regla, fuentes, motivoDeCaida, valor);
    if (valor === null) return void h.sinValor(cod, regla, fuentes, "no_aplica");
    const hecho: Omit<Hecho, "clase" | "fechaDeLaConsulta"> = {
      codigo: cod, regla, unidad: CATALOGO.find((c) => c.codigo === cod)!.unidad, valor, calidad: opciones.calidad ?? "confirmado_por_tercero",
      fuentes, fechaDelDato: null, registros: registros.length ? registros : respuestas(),
    };
    if (opciones.descartados?.length) hecho.descartados = opciones.descartados;
    if (opciones.entidades?.length) hecho.entidades = opciones.entidades;
    emisor.hecho(hecho);
  }
  const deLaReferencia = (campo?: string): RefDeRegistro[] => (referencia ? [refDeFila(consulta, referencia, campo)] : []);
  // Los demás registros de RUC, que la regla miró y no tomó.
  const noEsLaReferencia: Descarte[] = contribuyentes.filter((f) => f !== referencia).map((f) => ({ registro: refDeFila(consulta, f), motivo: "no_es_el_ruc_de_referencia" }));

  // ---- ¿Está activo? ----
  const activos = contribuyentes.filter(activoHoy);
  const citaDelEstado = (activos.length ? activos : contribuyentes).map((f) => refDeFila(consulta, f));
  const estadoDelRuc = { calidad: "calculado" as const, entidades: clavesDe(abiertos) };
  emitirHecho("ruc.activo", "ruc.referencia@1", tieneEstablecimientoActivo, citaDelEstado, estadoDelRuc);
  emitirHecho("ruc.establecimiento.activo", "ruc.referencia@1", tieneEstablecimientoActivo, citaDelEstado, estadoDelRuc);
  emitirHecho("lab.es_independiente", "ruc.referencia@1", tieneEstablecimientoActivo, citaDelEstado, estadoDelRuc);

  // ---- El RUC de referencia y sus fechas ----
  emitirHecho("ruc.referencia.numero", "ruc.referencia@1", textoDe(ref?.ruc), deLaReferencia("ruc"), { descartados: noEsLaReferencia });
  const inicio = formatFechaISO(parseFecha(ref?.fecha_inicio_actividades));
  const cese = ref ? formatFechaISO(ceseMasReciente(ref)) : null;
  const reinicio = formatFechaISO(parseFecha(ref?.fecha_reinicio_actividades));
  emitirHecho("ruc.fecha.inicio_actividades", "ruc.referencia@1", inicio, deLaReferencia("fecha_inicio_actividades"), { descartados: noEsLaReferencia });
  emitirHecho("ruc.fecha.cese", "ruc.referencia@1", cese, deLaReferencia(), { descartados: noEsLaReferencia });
  emitirHecho("ruc.fecha.reinicio", "ruc.referencia@1", reinicio, deLaReferencia("fecha_reinicio_actividades"), { descartados: noEsLaReferencia });

  // ---- Establecimientos: los abiertos, y 0 si el RUC no está activo ----
  emitirHecho("ruc.establecimientos.activos", "ruc.referencia@1", numeroActivos, tieneEstablecimientoActivo ? abiertos.map((f) => refDeFila(consulta, f)) : [],
    { calidad: "calculado", entidades: tieneEstablecimientoActivo ? clavesDe(abiertos) : [] });
  emitirHecho("ruc.establecimientos.inactivos", "ruc.referencia@1", numeroInactivos, noCuentan.map((f) => refDeFila(consulta, f)),
    { calidad: "calculado", entidades: clavesDe(noCuentan) });
  emitirHecho("ruc.establecimientos.registrados", "ruc.referencia@1", establecimientos.length > 0, establecimientos[0] ? [refDeFila(consulta, establecimientos[0])] : []);

  // ---- El estado de la actividad: el SRI sólo guarda el cese y el reinicio MÁS recientes ----
  const inicioActividad = parseFecha(ref?.fecha_inicio_actividades);
  const ceseActividad = ref ? ceseMasReciente(ref) : null;
  const reinicioActividad = parseFecha(ref?.fecha_reinicio_actividades);
  let estadoActividad: string;
  let antiguedadUltimaEtapa: number | null = null;
  let mesesInactivo: number | null = null;
  if (!ref?.ruc) {
    estadoActividad = "sin_ruc";
  } else if (!ceseActividad) {
    estadoActividad = "activa_sin_interrupciones";
    antiguedadUltimaEtapa = inicioActividad ? mesesEntreFechas(inicioActividad, ahora) : null;
  } else if (reinicioActividad && reinicioActividad > ceseActividad) {
    estadoActividad = "activa_reactivada";
    antiguedadUltimaEtapa = mesesEntreFechas(reinicioActividad, ahora);
  } else {
    const inicioUltimaEtapa = reinicioActividad ?? inicioActividad;
    estadoActividad = reinicioActividad ? "inactiva_tras_reactivacion" : "inactiva_nunca_reactivada";
    antiguedadUltimaEtapa = inicioUltimaEtapa ? mesesEntreFechas(inicioUltimaEtapa, ceseActividad) : null;
    mesesInactivo = mesesEntreFechas(ceseActividad, ahora);
  }
  const deLaActividad = { calidad: "calculado" as const, descartados: noEsLaReferencia };
  emitirHecho("ruc.actividad.estado", "ruc.referencia@1", estadoActividad, deLaReferencia(), deLaActividad);
  emitirHecho("ruc.actividad.antiguedad_ultima_etapa_meses", "ruc.referencia@1", antiguedadUltimaEtapa, deLaReferencia(), deLaActividad);
  emitirHecho("ruc.actividad.meses_inactivo", "ruc.referencia@1", mesesInactivo, deLaReferencia(), deLaActividad);
  emitirHecho("ruc.cese.tipo", "ruc.referencia@1", ref ? tipoUltimoCese(ref) : null, deLaReferencia(), { descartados: noEsLaReferencia });
  emitirHecho("ruc.depurado_por_el_sri", "ruc.referencia@1", rucDepuradoPorElSri(ref), deLaReferencia("observ_solicitud_suspension"), { descartados: noEsLaReferencia });
  emitirHecho("ruc.obligado_contabilidad", "ruc.referencia@1", obligadoALlevarContabilidad(ref), deLaReferencia("obligado"), { descartados: noEsLaReferencia });

  // ---- Lo que dicen las fechas contra lo que dicen los establecimientos ----
  if (!caidas.length && referencia && ref?.ruc) {
    const porFechas = fechasDelRuc(ref).activoPorFechas;
    const caso = porFechas && establecimientos.length === 0 ? "sin_establecimientos_informados"
      : porFechas && abiertos.length === 0 ? "ruc_vigente_con_todos_los_establecimientos_cerrados"
      : !porFechas && abiertos.length > 0 ? "establecimiento_abierto_con_el_ruc_cesado"
      : null;
    if (caso) {
      const lo = establecimientos[0];
      emisor.diferencia({
        codigo: "dif.ruc.estado",
        regla: "ruc.estado@1",
        sobre: "ruc.activo",
        manda: { fuente: CONTRIBUYENTE[0], valor: porFechas ? "activo_por_fechas" : "cesado_por_fechas", registro: refDeFila(consulta, referencia) },
        cede: [{ fuente: ESTABLECIMIENTOS[0], valor: caso, registro: lo ? refDeFila(consulta, lo) : refDeRespuesta(crudo, consulta, ...ESTABLECIMIENTOS) }],
        magnitud: { absoluta: null, relativa: null },
        // Con los establecimientos todos cerrados, el RUC vigente es un cese de hecho y la
        // regla ya lo da por inactivo: es lo único que merece una mirada.
        lectura: caso === "ruc_vigente_con_todos_los_establecimientos_cerrados" ? "revisar" : "esperada",
      });
    }
  }
}
