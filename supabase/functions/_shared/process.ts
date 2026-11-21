// Construye el StandardClientProfile: campos YA calculados (conteos,
// sumas, booleanos) en vez de arrays crudos, para que el scoring por
// LLM reciba mucho menos texto por persona.
// Ver docs/estructura-estandarizada.md.
//
// Esta lógica se validó primero en Node, con una copia a mano
// (scripts/reprocess-sample.mjs), contra 25 personas reales. La copia se
// quedó atrás y se borró el 2026-10-13: hoy un cambio se valida corriendo
// este mismo archivo bajo Node, el viejo contra el nuevo.
//
// Conectada a analyze-client/llm-scoring desde marco-v1 — es la
// entrada real del LLM (ver marco-interpretativo.ts).

import type { RespuestaProveedorInfo1, StandardClientProfile } from "./types.ts";
import { analizarFuentesIngreso } from "./fuentes-ingreso.ts";
import { estadoPorFuente } from "./calidad-de-la-consulta.ts";
import { relacionConEmpleador } from "./patrono.ts";
// Vive en patrono.ts desde marco-v30 (la usa también el perfil del modelo);
// se reexporta para scripts/corregir-empleo-actual.mjs.
export { relacionConEmpleador };
import { servicioMilitarOPolicial } from "./fuerzas-armadas-policia.ts";

// Los ayudantes de lectura del crudo viven en la capa de hechos desde la tarea
// E4: el perfil y los hechos leen el mismo registro con el mismo código.
import { arr, estadoRecurso, num, obj, parseFecha, redondear, textoDe } from "./hechos/lectura-del-crudo.ts";
import { derivarHechos } from "./hechos/indice.ts";
import { perfilDesdeHechos } from "./hechos/perfil-desde-hechos.ts";
import { CLAVE_SIN_DATO } from "./campos-sin-dato.ts";

type AnyRecord = Record<string, unknown>;

function edadDesde(fecha: unknown): number | null {
  const d = parseFecha(fecha);
  if (!d) return null;
  const ahora = new Date();
  let edad = ahora.getFullYear() - d.getFullYear();
  const cumple = new Date(ahora.getFullYear(), d.getMonth(), d.getDate());
  if (ahora < cumple) edad--;
  return edad;
}

// Meses ENTEROS transcurridos entre 2 fechas ya parseadas (no strings) —
// usado para antigüedad de actividad económica/empleo, donde el punto
// de referencia no siempre es "hoy" (ej. cuánto duró una etapa que ya
// terminó). Resta 1 si el día del mes de d2 todavía no alcanza al de
// d1 (mismo criterio que edadDesde) — sin este ajuste, año*12+mes solo
// compara año/mes e ignora el día, redondeando SIEMPRE hacia arriba en
// promedio (bug real: cédula c-18fa16ee, cese 2021-09-30, hoy
// 2026-09-12 -> daba 60 meses/"5 años" exactos en vez de 59/"4 años 11
// meses" -- confirmado contra una herramienta externa que mostraba "4
// años" para la misma fecha).
function mesesEntreFechas(d1: Date, d2: Date): number {
  let meses = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (d2.getDate() < d1.getDate()) meses--;
  return meses;
}

function mesesDesde(fecha: unknown): number | null {
  const d = parseFecha(fecha);
  if (!d) return null;
  return mesesEntreFechas(d, new Date());
}

function dentroUltimos12Meses(fecha: unknown): boolean {
  const meses = mesesDesde(fecha);
  return meses !== null && meses >= 0 && meses <= 12;
}

// seguridadSocial.servicioMilitarOPolicial: en palabras, porque lo lee el
// modelo tal cual.
const DESCRIPCION_SERVICIO: Record<string, string> = {
  "ISSFAC:activo": "militar en servicio activo",
  "ISSFAC:pasivo": "militar en servicio pasivo (retirado)",
  "ISSFAC:montepio": "beneficiario de montepío militar",
  "ISSPOL:activo": "policía en servicio activo",
  "ISSPOL:pasivo": "policía en servicio pasivo (retirado)",
  "ISSPOL:montepio": "beneficiario de montepío policial",
};

// La regla de cobro vive en demandas.ts desde estructura-v11, junto con
// las categorías de las demás demandas.

// Los delitos de seguridad ciudadana (control de bloqueo duro) viven en
// delitos-seguridad.ts, la misma lista que usa controles-bloqueo.ts. Hasta
// estructura-v10 había una copia acá y otra allá.

// Versión de esta capa de procesamiento — se guarda en
// client_profiles.structure_version para saber con qué lógica se armó
// cada perfil. Vive acá (y no en quien lo persiste) para que
// structure-client y analyze-client no puedan discrepar.

// ---------- Las nueve fuentes que se consultaban y nadie leía ----------
//
// La auditoría del 2026-09-16 encontró que 12 de las 52 fuentes se
// pedían en cada corrida y ningún código usaba la respuesta. Se
// inspeccionaron contra 16 personas de la cartera para ver qué traen de
// verdad, y de ahí salieron estos campos. Tres quedaron afuera: dos que
// dan 404 sistemático y una sin relación con crédito.
//
// El corte entre las que traen dato y las que no cambia qué se puede
// extraer: de titulos, trabajoHistoricos, afiliacionSalud y
// afiliacionSiisspol se conoce la estructura y se leen campos; de
// siniestros, polizas, deudores, afiliacionIsspol y
// afiliacionIssfacCertMedico vinieron vacías en las 16, así que solo se
// cuenta lo que hay. Contar es lo único afirmable sin inventar una
// estructura que nadie vio.

// El historial de empleos, el salario más alto y el resto de lo laboral salen de la capa de hechos desde
// estructura-v30 (hechos/grupos/empleo.ts y actividad-con-ruc.ts), con la historia de cada regla.

// La operación del comportamiento interno (una fila por OPERACIÓN de la persona
// con la institución, p3 de la revisión del análisis, 2026-11-09) se elige desde
// estructura-v29 en hechos/grupos/historial-con-la-institucion.ts (elegirOperacion).

// v3: metaConsulta pasa de contar nueve bloques a nombrar las 52
// fuentes. Los campos del perfil no cambian; lo que cambia es qué tan
// fino se declara lo que se pudo medir (ver la migración 078).
// estructura-v4 (2026-09-25): empleosActuales cae a los aportes vigentes
// al corte cuando el mecanizado no trae nada, y antiguedadEmpleoActualMeses
// se mide hasta el último aporte y no hasta hoy.
// estructura-v5 (2026-09-25): con dos empleos vigentes a la vez, la
// antigüedad es la del más largo.
// estructura-v6 (2026-09-25): "RUC activo" sale de ruc.ts, compartido con
// fuentes-ingreso.ts; cuenta también el cese temporal (solicitud de
// suspensión) y exige un establecimiento abierto. tipoUltimoCeseRuc puede
// ser "suspension_temporal".
// estructura-v7 (2026-09-26): clienteEsSuPropioEmpleador sale del RUC del
// patrono (patrono.ts), y numeroEmpleadosRegistrados y
// esEmpleadorOAdministrador no cuentan a la propia persona, que se afilia en
// su propia nómina: 166 personas figuraban con empleados sin tener ninguno.
// numeroEstablecimientosActivos es 0 si el RUC no está activo (ruc.ts).
// estructura-v8 (2026-09-27), de la revisión de los primeros análisis con
// marco-v23: el buró separa lo propio de lo garantizado y lee la cartera
// que no devenga intereses; retail informa lo vencido; cooperativas, la
// cuota; las demandas crediticias se buscan por palabra completa; las
// pensiones se cuentan por proceso y la deuda es la suma. Detalle en cada
// grupo y en docs/propuesta-estructura-v8-marco-v24.md.
// estructura-v9 (2026-09-28), de la comparación de razonamiento de v24:
// las denuncias cuentan según el papel de la persona (denuncias.ts), y una
// denuncia sin su cédula no es suya; la seguridad social militar y policial
// cuenta sólo a los titulares y dice su situación
// (fuerzas-armadas-policia.ts); "EJECUTIVO" es juicio de cobro.
// estructura-v10 (2026-09-28): también son cobro "DINERO", la insolvencia y
// la reserva de dominio; la confesión judicial no (decisión del negocio).
// estructura-v11 (2026-09-28): las demandas civiles por categoría
// (riesgoJudicialCivil.demandasPorCategoria) y los tipos legibles, sin
// artículos ni tildes rotas (demandas.ts, aprobado por el negocio). Y
// "ESTUPEFACIENTES" a secas es narcotráfico para el bloqueo por seguridad
// ciudadana (decisión del negocio), con la lista de delitos unificada en
// delitos-seguridad.ts.
// estructura-v12 (2026-09-29, decisión del negocio viendo los casos): son
// cobro el embargo, la aprehensión del bien y los vales de tarjeta, y la
// demanda de un banco, cooperativa, financiera o emisora de tarjetas cuyo
// tipo no dice el tema ("OTROS", "ESPECIAL"); la lesión enorme es de
// propiedad y la aprehensión de un auto sin matrícula, de tránsito
// (demandas.ts).
// estructura-v13 (2026-10-03): Proveedor_Info_1 manda el estado de algunos
// establecimientos abreviado ("ABI", "CER"); quien tenía el suyo en "ABI"
// quedaba sin RUC activo. Una sola comparación, en ruc.ts.
// estructura-v14 (2026-10-20, decisión del negocio): la antigüedad en el
// empleo actual cuenta como empleo sólo lo que la continuidad cuenta como
// trabajo (reglaDeTrabajo, fuentes-ingreso.ts): el aporte propio desde que
// abrió el RUC, y nada del aporte voluntario sin RUC, del hogar o de un
// código desconocido. Cambia en 35 de 1.644 personas.
// estructura-v15 (2026-10-29, decisión del negocio): laboral suma
// obligadoALlevarContabilidadRuc, del mismo RUC de referencia que las fechas
// (ruc.ts). Lo pide el nivel 1 del predictor de ingresos: sin él pierde 0,027
// de R² y no certifica «al menos 2.000» a nadie (investigación, 12.30).
// estructura-v16 (2026-10-31, de la revisión de casos reales del negocio): los
// campos del historial de empleos leen las tres fuentes del IESS y no sólo
// trabajoHistoricos (salario más alto, empleadores registrados), el cargo es el
// del empleo actual y los datos del empleador vigente sólo salen si es el
// empleador de un empleo actual (por RUC); los préstamos del IESS/BIESS se leen
// también de creditoQuirografario/creditoHipotecario, con su saldo
// (saldoPrestamosIessBiess), y el retail guarda el corte de sus deudas
// (fechaCorteRetail). Medido en la nota de cada helper y en el PR.
// estructura-v17 (2026-10-31, decisión del negocio): laboral suma
// rucDepuradoEnRelacionDeDependencia (ruc.ts), porque el motivo de la baja del
// RUC no estaba en el perfil y sin él el marco no puede dejarla neutra. Y A2 y
// A3 cuentan como calificaciones en atraso en operacionesEnAtrasoSinMonto.
// estructura-v18 (2026-11-04, decisión del negocio): el campo pasa a
// rucDepuradoPorElSri, cierto para toda baja por depuración (169 personas, no
// 17): la actividad del establecimiento ya no cuenta.
// estructura-v19 (2026-11-05, pedido del negocio): el empleo actual del
// mecanizado exige que su mes no sea anterior al corte del IESS de las
// fuentes de ingreso, la misma vigencia que ya tenían los aportes.
// estructura-v20 (2026-11-09, p1 de la revisión del análisis, aprobada por el
// negocio el 2026-11-08): una demanda por un delito de seguridad ciudadana es
// de la persona sólo si el demandado es ella (riesgoSeguridadCiudadana; las
// demás, aviso en el bloqueo).
// estructura-v21 (2026-11-09, p6, p3 y p5 de la revisión del análisis,
// aprobadas por el negocio el 2026-11-08): un préstamo del IESS/BIESS en las
// dos fuentes se une por monto con la concesión a 31 días, con el saldo de la
// fuente de préstamos, y no se cuentan los terminados de la base interna
// (comportamientoBancario); el comportamiento interno reporta una sola
// operación de la institución, elegida, sin sumar nada (comportamientoInterno); y
// cada demanda de cobro dice su año y quién demanda (riesgoJudicialCrediticio).
// Y el colateral de vehículos es el precio promedio de mercado, con el avalúo
// sólo sin precio de mercado (patrimonio, p10, negocio, 2026-11-09).
// estructura-v22 (2026-11-17, F12): comportamientoBancario.operacionesIessBiess,
// cada préstamo del IESS/BIESS con su tipo, saldo y fecha de fin, para la cuota
// estimada de la capacidad de pago. No llega al modelo.
// estructura-v23 (E12, R5 del negocio, 2026-11-18): una providencia de
// certificación (un pedido de información) ya no cuenta como `enListaControl`:
// queda en `tieneProvidenciaDeCertificacion` y no bloquea (providencias.ts).
// La v22 es la del PR 173 (capacidad de pago).
// estructura-v24 (D2 del negocio, 2026-11-18, confirmada el 2026-11-19): una
// demanda de cobro o civil en la que el demandado es otra persona deja de
// contar, como en v20 con las penales, y también la de apellidos en otro orden
// (demandas.ts, atribuirDemandas). Lo que no se puede atribuir (sin demandado,
// sin nombre) sigue contando y se avisa: numeroDemandasDeOtroDemandado y
// numeroDemandasSinCotejo en riesgoJudicialCrediticio y riesgoJudicialCivil.
// estructura-v25 (E4, etapa B del grupo 1 de la capa de hechos): bancos y
// Diners, el retail, el registro de deudores, el BIESS y las cooperativas salen
// de hechos/grupos/, la única implementación. Con una fuente que no contestó,
// el campo es null y el grupo lo lista en camposSinDato con lo que trajeron las
// demás (campos-sin-dato.ts): hasta la v24 se escribía ese parcial, o 0, como
// si fuera el total. El modelo lee lo de antes hasta la versión mayor del marco.
// estructura-v26 (D6 del negocio, 2026-11-18; E8 de la capa de hechos): una
// operación que viene en la lista de Super y en la de Diners (misma entidad,
// rol, calificación y corte, y la deuda a un dólar) se cuenta una vez
// (ban.union@1, hechos/grupos/comportamiento-bancario.ts). Medido el
// 2026-11-20 sobre las 3.766 personas: hoy no le pasa a nadie, porque Diners
// trae sólo a BP Diners y Super no la trae; ningún perfil cambia.
// estructura-v27 (E6, etapa B del grupo 3 de la capa de hechos): riesgoJudicialCrediticio,
// riesgoJudicialCivil y riesgoSeguridadCiudadana salen de hechos/grupos/riesgo-judicial.ts,
// y el control de bloqueo toma de los mismos hechos su hallazgo de seguridad ciudadana
// (hechos/controles.ts). Con una fuente que no contestó el campo es null y el grupo lo lista
// en camposSinDato con el parcial (lo que escribía la v26 como si fuera el total). El modelo y
// la capacidad de pago leen lo de antes hasta la versión mayor del marco.
// estructura-v28 (E7, etapa B de los grupos penal y de cumplimiento de la capa de hechos): riesgoPenal
// y cumplimiento salen de hechos/grupos/penal.ts y cumplimiento.ts, y el control de bloqueo toma de los
// mismos hechos TODOS sus hallazgos (fallecido, listas, homónimos, PEP; hechos/controles.ts): ya no
// relee el crudo. Con una fuente que no contestó el campo es null y el grupo lo lista en
// camposSinDato con el parcial (lo que escribía la v27 como si fuera el total, y que la tarjeta
// «Riesgo Penal / Fiscalía» leía como «sin antecedentes ni denuncias»). El modelo y la capacidad de
// pago leen lo de antes hasta la versión mayor del marco. El bloqueo no cambia.
// estructura-v29 (E7, etapa B del grupo 2 de la capa de hechos): comportamientoInterno sale de
// hechos/grupos/historial-con-la-institucion.ts (la regla de la operación elegida vive ahí, una sola
// implementación). Se sigue reportando UNA operación (D5): los hechos de cantidad y de operaciones
// vigentes no llegan al perfil. Con la base interna sin respuesta el campo es null y el grupo lo lista en
// camposSinDato (hasta la v28 se escribía «no es cliente» y todo en null, como si la fuente hubiera dicho
// que no hay operaciones). El modelo y la capacidad de pago leen lo de antes hasta la versión mayor del marco.
// estructura-v30 (E7, etapa B del grupo 4 de la capa de hechos, parte laboral): `laboral` sale de
// hechos/grupos/empleo.ts y actividad-con-ruc.ts (las reglas del empleo actual, la antigüedad, el historial,
// el RUC de referencia y el estado de la actividad viven ahí, una sola implementación) y process.ts perdió
// sus copias. Con una fuente que no contestó el campo es null y el grupo lo lista en camposSinDato con el
// parcial (lo que escribía la v28). El modelo, la capacidad de pago, el predictor de ingresos y las columnas
// del perfil leen lo de antes. `fuentesIngreso` sigue de analizarFuentesIngreso() hasta su propio PR.
export const PROCESS_VERSION = "estructura-v30"; // ver docs/estructura-estandarizada.md

// corteIess: el corte vigente del registro del IESS. Llega de afuera
// porque se deduce de los datos ya consultados (ver loadCorteIess) en
// vez de estar fijo en el código: el proveedor no avisa cuándo publica
// uno nuevo, pero el primer cliente que llega con datos más frescos lo
// delata. Si no se pasa, se usa el último conocido.
export function buildStandardProfile(raw: RespuestaProveedorInfo1, cedula: string, corteIess?: string): { profile: StandardClientProfile; duracionFuentesMs: number } {
  const g = raw.general?.data as AnyRecord | undefined;
  const persona = g?.personaNatural as AnyRecord | undefined;
  // Una sola tabla de fuentes, sin la capa de bloques que había en el
  // medio: `obj`/`arr` ya recibían el nombre de la fuente, así que lo
  // único que se va es el paso de averiguar en qué bloque vivía.
  const fuentes = raw as unknown as AnyRecord;

  const basesInternas = obj(fuentes, "basesInternas", "__never__") ?? ((fuentes?.basesInternas as AnyRecord | undefined)?.data as AnyRecord | undefined) ?? null;
  const biWrap = { x: { data: basesInternas } } as unknown as AnyRecord;
  // ---- los hechos ----
  // Un solo armado de la capa de hechos para todos los grupos que salen de ella (docs/capa-de-hechos.md,
  // 3.3). Va antes de `identidad` porque `laboral`, que se arma enseguida, ya sale de ahí.
  // El reloj de los hechos es la hora del armado, como el de la unión del
  // BIESS hasta la v24: un préstamo «terminado» se decide el día que se arma.
  const hechos = derivarHechos(raw, {
    cedula,
    consulta: "perfil",
    fechaDeLaConsulta: new Date().toISOString(),
    corteIess: corteIess ?? "",
    persona: { nombre: textoDe(persona?.nombre), fechaDeNacimiento: null },
  });
  const conSinDato = <T extends object>(grupo: T, desde: AnyRecord): T =>
    (desde[CLAVE_SIN_DATO] ? { ...grupo, [CLAVE_SIN_DATO]: desde[CLAVE_SIN_DATO] } : grupo);

  // ---- identidad ----
  const nacionalidad0 = (g?.nacionalidades as AnyRecord[] | undefined)?.[0]?.pais as AnyRecord | undefined;
  const conyuge = g?.personaNaturalConyuge as AnyRecord | undefined;
  const conyugePersona = conyuge?.personaConyuge as AnyRecord | undefined;
  const tieneConyugeActual = Boolean(conyugePersona?.nombre);
  // Se mide aparte de la duración total del perfil: duracion_ms está
  // dominada por la ingesta (~27s) y taparía cualquier degradación de
  // este módulo, que corre en milisegundos.
  const inicioFuentes = Date.now();
  const fuentesIngreso = analizarFuentesIngreso(raw, (persona?.nombre as string) ?? null, corteIess, cedula);
  const duracionFuentesMs = Date.now() - inicioFuentes;

  const identidad: StandardClientProfile["identidad"] = {
    nombreCompleto: (persona?.nombre as string) ?? null,
    edad: edadDesde(persona?.fechaNacimiento),
    genero: ((persona?.genero as AnyRecord | undefined)?.descripcion as string) ?? null,
    estadoCivil: (((g?.estadoCivil as AnyRecord | undefined)?.estadoCivil as AnyRecord | undefined)?.descripcion as string) ?? null,
    nivelEducacion: (((g?.nivelEducacion as AnyRecord | undefined)?.nivelEducacion as AnyRecord | undefined)?.descripcion as string) ?? null,
    profesiones: ((g?.profesiones as AnyRecord[] | undefined) ?? [])
      .map((p) => (p.profesion as AnyRecord | undefined)?.descripcion as string | undefined)
      .filter((x): x is string => Boolean(x)),
    fallecido: Boolean(persona?.fechaDefuncion) || String(persona?.informacionAdicional ?? "").toUpperCase().includes("FALLEC"),
    tieneConyuge: tieneConyugeActual,
    cantonNacimiento: (((persona?.lugarNacimiento as AnyRecord | undefined)?.parroquia as AnyRecord | undefined)?.canton as AnyRecord | undefined)?.nombre as string ?? null,
    provinciaNacimiento: ((((persona?.lugarNacimiento as AnyRecord | undefined)?.parroquia as AnyRecord | undefined)?.canton as AnyRecord | undefined)?.provincia as AnyRecord | undefined)?.nombre as string ?? null,
    paisOrigen: (nacionalidad0?.nombre as string) ?? null,
    paisOrigenIso3: (nacionalidad0?.codigoIso3 as string) ?? null,
    paisOrigenIso: (nacionalidad0?.codigoIso as number) ?? null,
    esExtranjero: nacionalidad0 ? nacionalidad0.nombre !== "Ecuador" : null,
    // Solo si hay cónyuge ACTUAL — fechaMatrimonio puede quedar en el
    // registro aunque la persona ya esté divorciada.
    añosCasado: tieneConyugeActual && conyuge?.fechaMatrimonio ? (() => {
      const m = mesesDesde(conyuge.fechaMatrimonio);
      return m !== null ? Math.floor(m / 12) : null;
    })() : null,
    edadConyuge: tieneConyugeActual ? edadDesde(conyugePersona?.fechaNacimiento) : null,
    ...(() => {
      // El título de mayor nivel manda. `nivelEducacion.nivel` es un
      // número ordenable que trae la propia fuente, así que no hace
      // falta interpretar el texto ("TERCER_NIVEL" contra "CUARTO").
      const titulos = arr(fuentes, "titulos", "titulos");
      const conNivel = titulos
        .map((t) => {
          const titulo = (t.titulo as AnyRecord | undefined) ?? {};
          const nivel = (titulo.nivelEducacion as AnyRecord | undefined) ?? {};
          return {
            descripcion: textoDe(titulo.descripcion),
            nivelTexto: textoDe(nivel.descripcion),
            nivel: Number(nivel.nivel ?? -1),
            institucion: textoDe(((t.establecimientoEducativo as AnyRecord | undefined) ?? {}).descripcion),
          };
        })
        .sort((a, b) => b.nivel - a.nivel);
      const alto = conNivel[0] ?? null;
      return {
        titulosRegistrados: titulos.length,
        tituloMasAlto: alto?.descripcion ?? null,
        nivelMaximoSegunTitulos: alto?.nivelTexto ?? null,
        institucionTituloMasAlto: alto?.institucion ?? null,
      };
    })(),
  };

  // ---- contacto ----
  const direcciones = arr(fuentes, "direcciones", "direcciones");
  const telefonos = arr(fuentes, "telefonos", "telefonos");
  const correos = arr(fuentes, "correo", "correos");
  const contacto: StandardClientProfile["contacto"] = {
    numeroDirecciones: direcciones.length,
    numeroTelefonos: telefonos.length,
    numeroCorreos: correos.length,
    direccionActualizada12M: direcciones.some((d) => dentroUltimos12Meses((d.direccion as AnyRecord | undefined)?.fechaActualizacion)),
    telefonoActualizado12M: telefonos.some((t) => dentroUltimos12Meses((t.telefono as AnyRecord | undefined)?.fechaActualizacion)),
    correoActualizado12M: correos.some((c) => dentroUltimos12Meses(c.fechaActualizacion)),
  };

  // ---- familia ----
  const hijos = arr(fuentes, "hijos", "personasNatural");
  const padres = arr(fuentes, "padres", "personasNatural");
  const hijosIdsUnicos = new Set(hijos.map((h) => h.identificacion).filter(Boolean));
  const familia: StandardClientProfile["familia"] = {
    numeroHijos: hijos.length,
    tieneHijoMenorEdad: hijos.some((h) => {
      const e = edadDesde(h.fechaNacimiento);
      return e !== null && e < 18;
    }),
    padresFallecidos: padres.filter((p) => Boolean(p.fechaDefuncion) || String(p.informacionAdicional ?? "").toUpperCase().includes("FALLEC")).length,
    tieneHijos: hijosIdsUnicos.size > 0,
  };

  // ---- laboral ----
  // Desde estructura-v30 sale de la capa de hechos (etapa B del grupo 4, empleo y actividad con
  // RUC; docs/capa-de-hechos.md, 4.4): las reglas del empleo actual, la antigüedad, el historial,
  // el RUC de referencia y el estado de la actividad viven en hechos/grupos/empleo.ts y
  // actividad-con-ruc.ts, con el registro del crudo que sostiene cada valor. Acá sólo se copian
  // al perfil, en el orden de siempre (el modelo lee el JSON en orden). Con una fuente que no
  // contestó el campo es null y el grupo lo lista en camposSinDato.
  //
  // El reloj es el mismo de siempre: hasta la v29 las edades y las antigüedades de este grupo se
  // medían con la hora de este módulo, y los hechos usan la fecha de la consulta
  // (`fechaDeLaConsulta`), que es esa misma hora. Los guiones de recálculo fijan la hora del perfil
  // en su captura y los dos relojes se mueven juntos.
  const lb = perfilDesdeHechos(hechos, "laboral") as AnyRecord;
  const laboral = conSinDato({
    // Lista, no un solo empleo. Sale del mecanizado si trae un registro de los últimos 3 meses,
    // y si no de los aportes vigentes al corte (estructura-v4). Vacía = ninguna de las dos
    // fuentes del IESS ve un empleo vigente.
    empleosActuales: lb.empleosActuales,
    empleadorConApellidoDelCliente: lb.empleadorConApellidoDelCliente,
    clienteEsSuPropioEmpleador: lb.clienteEsSuPropioEmpleador,
    numeroEmpleadoresUltimos24Meses: lb.numeroEmpleadoresUltimos24Meses,
    ingresoPromedioUltimos6Meses: lb.ingresoPromedioUltimos6Meses,
    esEmpleadorOAdministrador: lb.esEmpleadorOAdministrador,
    tieneRucActivo: lb.tieneRucActivo,
    tieneEstablecimientoActivo: lb.tieneEstablecimientoActivo,
    esIndependiente: lb.esIndependiente,
    numeroEmpleadosRegistrados: lb.numeroEmpleadosRegistrados,
    tipoEmpleador: lb.tipoEmpleador,
    obligacionesPatronalesEnMora: lb.obligacionesPatronalesEnMora,
    historialEmpleosRegistrados: lb.historialEmpleosRegistrados,
    salarioMasAltoRegistrado: lb.salarioMasAltoRegistrado,
    cargoVigente: lb.cargoVigente,
    empleadorVigenteSituacionLegal: lb.empleadorVigenteSituacionLegal,
    empleadorVigenteTipoCompania: lb.empleadorVigenteTipoCompania,
    empleadorVigenteAntiguedadAnios: lb.empleadorVigenteAntiguedadAnios,
    empleadoresJuridicos: lb.empleadoresJuridicos,
    fechaInicioActividadesRuc: lb.fechaInicioActividadesRuc,
    fechaCeseActividadesRuc: lb.fechaCeseActividadesRuc,
    fechaReinicioActividadesRuc: lb.fechaReinicioActividadesRuc,
    numeroEstablecimientosActivos: lb.numeroEstablecimientosActivos,
    numeroEstablecimientosInactivos: lb.numeroEstablecimientosInactivos,
    tieneEstablecimientosRegistrados: lb.tieneEstablecimientosRegistrados,
    estadoActividadEconomica: lb.estadoActividadEconomica,
    antiguedadUltimaEtapaActivaMeses: lb.antiguedadUltimaEtapaActivaMeses,
    mesesInactivoActividadEconomica: lb.mesesInactivoActividadEconomica,
    tipoUltimoCeseRuc: lb.tipoUltimoCeseRuc,
    rucDepuradoPorElSri: lb.rucDepuradoPorElSri,
    obligadoALlevarContabilidadRuc: lb.obligadoALlevarContabilidadRuc,
    antiguedadEmpleoActualMeses: lb.antiguedadEmpleoActualMeses,
    duracionEmpleoMasLargoMeses: lb.duracionEmpleoMasLargoMeses,
  } as StandardClientProfile["laboral"], lb);

  // ---- tributario (SRI) ----
  const contribuyenteRegistros = arr(fuentes, "contribuyente", "datosContribuyente");
  const sriDataRaw = arr(fuentes, "sriImpuestoRenta", "data");
  const sriData = (sriDataRaw[0] as AnyRecord | undefined) ?? null;
  const impuestosISD = (sriData?.impuestosISD as AnyRecord[] | undefined) ?? [];
  const impuestosRenta = (sriData?.impuestosRenta as AnyRecord[] | undefined) ?? [];
  const maxISD = impuestosISD.reduce((max: number | null, x) => {
    const v = num(x.valor);
    return v !== null && v > (max ?? -Infinity) ? v : max;
  }, null);
  const fechaISD = impuestosISD.reduce((max: number | null, x) => {
    const pf = x.periodoFiscal as number | undefined;
    return pf && (max === null || pf > max) ? pf : max;
  }, null);
  const maxRenta = impuestosRenta.reduce((max: number | null, x) => {
    const v = num(x.rentaCausadoRetenido);
    return v !== null && v > (max ?? -Infinity) ? v : max;
  }, null);
  const fechaRenta = impuestosRenta.reduce((max: number | null, x) => {
    const pf = x.periodoFiscal as number | undefined;
    return pf && (max === null || pf > max) ? pf : max;
  }, null);
  // esAfiliadoUnipersonal: misma fuente que tieneEstablecimientoActivo
  // (contribuyente) — un registro "cascarón" sin .ruc (ver
  // esRegistroDeRuc en ruc.ts) cuenta como "nunca tuvo RUC" => FALSE, no null.
  const rucConDatos = contribuyenteRegistros.filter((c) => c.ruc);
  const tributario: StandardClientProfile["tributario"] = {
    pagaISD: impuestosISD.length > 0,
    montoMaximoISD: maxISD,
    fechaMasRecienteISD: fechaISD,
    generaImpuestoRenta: impuestosRenta.length > 0,
    montoMaximoImpuestoRenta: maxRenta,
    fechaMasRecienteImpuestoRenta: fechaRenta,
    esAfiliadoUnipersonal: rucConDatos.some((c) => String(c.ruc).slice(0, 10) === String(cedula)),
  };

  // ---- seguridadSocial ----
  // BUG real (auditoría pedida por el usuario, cédulas c-ba4c16f0 y
  // c-18fa16ee): pn_afiliacion_iess viene "faltante" (Proveedor_Info_1 no pudo
  // traer datos de ESE recurso puntual) en 32 de los 40 clientes de la
  // muestra -- incluyendo personas con historial laboral extenso y real
  // en tiess/mecanizado. afiliadoIessActivo devolvía `false` en todos
  // esos casos, indistinguible de "se consultó bien y de verdad no está
  // afiliado" -- eso es lo que hacía que el LLM reportara una
  // "inconsistencia" (afiliación inactiva) contra un empleo real
  // confirmado por otras fuentes. Ahora es null cuando el recurso mismo
  // no trajo datos (estadoRecursoAfilIess !== "ok"), reservando
  // false/true para cuando SÍ se consultó y el estado real es conocido.
  const estadoRecursoAfilIess = estadoRecurso(fuentes, "afiliacionIess");
  const afilIess = (arr(fuentes, "afiliacionIess", "afiliacionIess")[0] as AnyRecord | undefined) ?? null;
  const seguridadSocial: StandardClientProfile["seguridadSocial"] = {
    afiliadoIessActivo:
      estadoRecursoAfilIess !== "ok" ? null : afilIess ? String(afilIess.estado ?? "").toUpperCase().startsWith("ACTIVO") : false,
    // esPensionista: hay que leer el campo .estado (booleano real) de
    // cada registro, no solo si el recurso trajo algún registro.
    esPensionista: arr(fuentes, "pensionista", "pensionista").some((p) => p.estado === true),
    esJubilado: arr(fuentes, "jubilados", "trabajos").length > 0,
    estadoAfiliacionIess: (afilIess?.estado as string) ?? null,
    ...(() => {
      // pn_afiliacion_salud responde por las tres entidades a la vez y
      // dice cuál registra cobertura. Es una corroboración INDEPENDIENTE
      // del empleo formal: "seguro general tiempo completo" no lo tiene
      // alguien sin relación de dependencia vigente, y no viene del
      // mismo recurso que ya se usa para el empleo.
      const salud = arr(fuentes, "afiliacionSalud", "afiliacionSalud");
      const conCobertura = salud.filter((a) => a.registraCobertura === true);
      const estadoSalud = estadoRecurso(fuentes, "afiliacionSalud");
      return {
        // null y no false cuando el recurso no contestó: mismo criterio
        // que afiliadoIessActivo, por la misma razón.
        tieneCoberturaSalud: estadoSalud !== "ok" ? null : conCobertura.length > 0,
        entidadesSaludConCobertura: conCobertura.map((a) => textoDe(a.entidad)).filter((x): x is string => Boolean(x)),
        tipoSeguroSalud: textoDe(conCobertura[0]?.tipoSeguro),
        // Sólo el titular: militar o policía en servicio activo o pasivo.
        // Hasta estructura-v8 contaba cualquier registro, y las fuentes
        // listan también a los familiares cubiertos ("Esposa de Militar en
        // Servicio Activo"): ver fuerzas-armadas-policia.ts.
        ...(() => {
          const servicio = servicioMilitarOPolicial(fuentes, cedula);
          const titular = servicio !== null && servicio.situacion !== "montepio";
          return {
            afiliadoSeguridadPolicial: titular && servicio?.institucion === "ISSPOL",
            afiliadoSeguridadMilitar: titular && servicio?.institucion === "ISSFAC",
            servicioMilitarOPolicial: servicio ? DESCRIPCION_SERVICIO[`${servicio.institucion}:${servicio.situacion}`] ?? null : null,
          };
        })(),
      };
    })(),
  };

  // ---- patrimonio ----
  const vehiculos = arr(fuentes, "vehiculos", "personaVehiculo");
  const sumVeh = (field: string) => vehiculos.reduce((s, v) => s + (num(v[field]) ?? 0), 0);
  // valorColateralVehiculos: lo que se espera obtener al vender cada
  // vehículo. Desde estructura-v21 (p10 de la revisión del análisis, negocio,
  // 2026-11-09) es el precio promedio de mercado, y el avalúo del SRI sólo
  // cuando la fuente no trae ningún precio de mercado.
  //
  // Hasta v20 era el MÁXIMO de siete precios, para que el avalúo, que
  // castiga a los vehículos viejos ($82 en una moto 2016), quedara de piso.
  // Se suponía que el avalúo nunca es el más alto, y en los vehículos nuevos
  // lo es: un camión 2023 con avalúo de 39.594 y precio de mercado de 17.484
  // (c-0ec2827c). Medido el 2026-11-09: el colateral pasaba en más de 25% al
  // precio promedio en 550 de 2.198 personas (USD 23,0 M contra 14,4 M); el
  // más alto era el precio máximo del rango en 349 vehículos y el avalúo en 301.
  // precioVenta sigue afuera: en los vehículos viejos es el precio de lista
  // de cuando eran nuevos (Nissan X-Trail 2010: 29.990 contra 20.500).
  const PRECIOS_DE_MERCADO = ["precioPromedio", "precioComercial", "precioVentaPromedio", "precioVentaPublico"];
  const valorDeColateral = (v: AnyRecord): number => {
    const mercado = PRECIOS_DE_MERCADO.map((c) => num(v[c]) ?? 0).find((p) => p > 0);
    return mercado ?? Math.max(0, num(v.valorAvaluo) ?? 0);
  };
  const patrimonio: StandardClientProfile["patrimonio"] = {
    numeroVehiculos: vehiculos.length,
    valorAvaluoVehiculos: sumVeh("valorAvaluo"),
    numeroInmuebles: arr(fuentes, "bienesInmueble", "bienesInmueble").length,
    numeroInversiones: arr(fuentes, "inversiones", "inversiones").length,
    tieneVehiculos: vehiculos.length > 0,
    numeroAutos: vehiculos.filter((v) => v.tipoComercial === "autos").length,
    numeroVehiculosPesados: vehiculos.filter((v) => v.tipoComercial === "pesados").length,
    numeroMotos: vehiculos.filter((v) => v.tipoComercial === "motos").length,
    valorComercialTotalVehiculos: sumVeh("precioComercial"),
    valorVentaTotalVehiculos: sumVeh("precioVentaPublico"),
    valorPromedioTotalVehiculos: sumVeh("precioVentaPromedio"),
    valorColateralVehiculos: redondear(vehiculos.reduce((s, v) => s + valorDeColateral(v), 0)),
  };

  // ---- comportamientoBancario y comportamientoCooperativas ----
  // Desde estructura-v25 salen de la capa de hechos (etapa B del grupo 1,
  // docs/capa-de-hechos.md, 3.3): las reglas de bancos y Diners, el retail, el
  // registro de deudores, la unión del BIESS y las cooperativas viven en
  // hechos/grupos/, con el registro del crudo que sostiene cada valor. Acá sólo
  // se copian al perfil, en el orden de siempre (el modelo lee el JSON en
  // orden). Con una fuente que no contestó, el campo es null y el grupo lo
  // lista en camposSinDato (campos-sin-dato.ts).
  //
  const b = perfilDesdeHechos(hechos, "comportamientoBancario") as AnyRecord;
  const c = perfilDesdeHechos(hechos, "comportamientoCooperativas") as AnyRecord;
  const comportamientoBancario = conSinDato({
    figuraEnRegistroDeudores: b.figuraEnRegistroDeudores,
    numeroOperacionesBuroCredito: b.numeroOperacionesBuroCredito,
    peorCalificacionRiesgo: b.peorCalificacionRiesgo,
    mejorCalificacionRiesgo: b.mejorCalificacionRiesgo,
    tieneOperacionConDemanda: b.tieneOperacionConDemanda,
    tieneOperacionCastigada: b.tieneOperacionCastigada,
    saldoTotalVigente: b.saldoTotalVigente,
    saldoEnMoraBuroCredito: b.saldoEnMoraBuroCredito,
    saldoNoDevengaIntereses: b.saldoNoDevengaIntereses,
    deudaEnAtraso: b.deudaEnAtraso,
    operacionesEnAtrasoSinMonto: b.operacionesEnAtrasoSinMonto,
    numeroOperacionesComoGaranteOCodeudor: b.numeroOperacionesComoGaranteOCodeudor,
    deudaComoGaranteOCodeudor: b.deudaComoGaranteOCodeudor,
    peorCalificacionComoGaranteOCodeudor: b.peorCalificacionComoGaranteOCodeudor,
    numeroCreditosFormales: b.numeroCreditosFormales,
    numeroDeudasRetail: b.numeroDeudasRetail,
    diasMoraMaximaRetail: b.diasMoraMaximaRetail,
    totalDeudaRetail: b.totalDeudaRetail,
    valorVencidoRetail: b.valorVencidoRetail,
    fechaCorteRetail: b.fechaCorteRetail,
    tieneCreditoIessBiess: b.tieneCreditoIessBiess,
    diasMoraCreditoIessBiess: b.diasMoraCreditoIessBiess,
    saldoPrestamosIessBiess: b.saldoPrestamosIessBiess,
    // Desde estructura-v22: una fila por operación, para estimar la cuota en la
    // capacidad de pago. No llega al modelo (RUTAS_QUE_NO_LLEGAN).
    operacionesIessBiess: b.operacionesIessBiess,
  } as StandardClientProfile["comportamientoBancario"], b);
  const comportamientoCooperativas = conSinDato({
    numeroOperaciones: c.numeroOperaciones,
    diasMoraMaxima: c.diasMoraMaxima,
    saldoTotal: c.saldoTotal,
    saldoEnMora: c.saldoEnMora,
    tieneOperacionConDemanda: c.tieneOperacionConDemanda,
    tieneOperacionCastigada: c.tieneOperacionCastigada,
    cuotaMensualTotal: c.cuotaMensualTotal,
  } as StandardClientProfile["comportamientoCooperativas"], c);

  // ---- comportamientoInterno (grupo nuevo — scoring propio Proveedor_Info_1) ----
  // Desde estructura-v29 sale de la capa de hechos (etapa B del grupo 2,
  // hechos/grupos/historial-con-la-institucion.ts): la regla que elige la
  // operación vive allá, con la procedencia de cada valor y las operaciones
  // descartadas. Lo que la institución sabe del hábito de pago de la persona, de
  // UNA de sus operaciones: la vigente de mayor saldo, o la cancelada de mayor
  // cuota por plazo. Es información, no deuda: ningún saldo de acá se suma ni
  // entra en un cálculo (negocio, 2026-11-09), y las demás operaciones y sus
  // cantidades no llegan al perfil (D5, 2026-11-18). Acá sólo se copian, en el
  // orden de siempre (el modelo lee el JSON en orden). Con la base interna sin
  // respuesta el campo es null y el grupo lo lista en camposSinDato.
  const ci = perfilDesdeHechos(hechos, "comportamientoInterno") as AnyRecord;
  const comportamientoInterno = conSinDato({
    proveedorInfo1ResultadoHabitoPago: ci.proveedorInfo1ResultadoHabitoPago,
    proveedorInfo1PerfilInterno: ci.proveedorInfo1PerfilInterno,
    proveedorInfo1DiasMoraMaxima: ci.proveedorInfo1DiasMoraMaxima,
    proveedorInfo1DiasMoraVigente: ci.proveedorInfo1DiasMoraVigente,
    proveedorInfo1SaldoCapitalVigente: ci.proveedorInfo1SaldoCapitalVigente,
    esClienteInterno: ci.esClienteInterno,
    // Desde estructura-v21: si la operación está vigente o cancelada. Sin él,
    // el saldo 0 de una cancelada se lee como una vigente pagada.
    proveedorInfo1EstadoOperacion: ci.proveedorInfo1EstadoOperacion,
  } as StandardClientProfile["comportamientoInterno"], ci);

  // ---- transitoVehicular ----
  const licencia = (arr(fuentes, "licenciaConducir", "licencia")[0] as AnyRecord | undefined) ?? null;
  // deudasAnt/Amt/Emov son 3 fuentes de "deudas de tránsito" pero NO
  // comparten forma. deudasAnt (única confirmada con datos reales, 4/25
  // en la muestra de validación) es un array PLANO — cada elemento ES
  // una multa, con el monto en .total (NO .valorAdeudado, ese campo no
  // existe en estos registros). deudasEmov trae un array con 1 elemento
  // RESUMEN por persona (infraccion: [] en el 100% de la muestra) — las
  // multas reales estarían anidadas en .infraccion[], nunca se vio
  // poblado. Contar ese resumen como si fuera 1 multa real es el bug
  // reportado por el usuario ("todos los clientes tienen una multa" —
  // era el resumen vacío de EMOV). El monto ya viene pre-agregado en
  // .valorAdeudado del resumen. deudasAmt nunca se ha visto poblado
  // (0/25) — se trata con la misma detección automática por prudencia;
  // a validar con un caso real cuando aparezca.
  const esResumenConInfracciones = (r: AnyRecord): boolean => Array.isArray(r.infraccion);
  const fuentesTransito = [arr(fuentes, "deudasAnt", "deudaAnts"), arr(fuentes, "deudasAmt", "deudaAmt"), arr(fuentes, "deudasEmov", "deudaEmov")];
  const numeroMultas = fuentesTransito.reduce(
    (total, registros) => total + registros.reduce((s, r) => s + (esResumenConInfracciones(r) ? (r.infraccion as unknown[]).length : 1), 0),
    0
  );
  const valorAdeudadoTransito = fuentesTransito.reduce(
    (total, registros) => total + registros.reduce((s, r) => s + (num(esResumenConInfracciones(r) ? r.valorAdeudado : r.total) ?? 0), 0),
    0
  );
  const transitoVehicular: StandardClientProfile["transitoVehicular"] = {
    // Solo el conteo: los dos recursos vinieron vacíos en las 16
    // personas con las que se inspeccionó la forma, así que no se
    // conoce la estructura de un registro. Ver fuentes_que_despertaron.
    numeroSiniestros: arr(fuentes, "siniestros", "siniestros").length,
    numeroPolizas: arr(fuentes, "polizas", "polizas").length,
    tieneLicenciaVigente: Boolean(licencia),
    puntosLicencia: licencia ? num(licencia.puntos) : null,
    numeroMultas,
    valorAdeudadoTransito,
  };

  // ---- riesgoJudicialCrediticio / riesgoJudicialCivil ----
  // Desde estructura-v27 salen de la capa de hechos (etapa B del grupo 3,
  // docs/capa-de-hechos.md, 3.3), como el grupo 1: la atribución de cada demanda
  // por su demandado (v24, D2), la regla de cobro, las categorías y la unión de las
  // dos fuentes de pensiones viven en hechos/grupos/riesgo-judicial.ts. Acá sólo se
  // copian al perfil, en el orden de siempre (el modelo lee el JSON en orden). Con
  // una fuente que no contestó el campo es null y el grupo lo lista en camposSinDato.
  //
  // Separados a pedido del usuario: antes "riesgoJudicialCivil" mezclaba
  // demandas de cobro/pagarés/ejecuciones (señal de comportamiento de
  // pago, alto peso) con demandas civiles genéricas (laboral, familia,
  // tránsito, propiedad — contexto, bajo peso).
  const jc = perfilDesdeHechos(hechos, "riesgoJudicialCrediticio") as AnyRecord;
  const jv = perfilDesdeHechos(hechos, "riesgoJudicialCivil") as AnyRecord;
  const riesgoJudicialCrediticio = conSinDato({
    numeroDemandasComoDemandado: jc.numeroDemandasComoDemandado,
    tiposDemandasComoDemandado: jc.tiposDemandasComoDemandado,
    demandasDeCobro: jc.demandasDeCobro,
    numeroDemandasDeOtroDemandado: jc.numeroDemandasDeOtroDemandado,
    numeroDemandasSinCotejo: jc.numeroDemandasSinCotejo,
  } as StandardClientProfile["riesgoJudicialCrediticio"], jc);
  const riesgoJudicialCivil = conSinDato({
    numeroDemandasComoDemandado: jv.numeroDemandasComoDemandado,
    tiposDemandasComoDemandado: jv.tiposDemandasComoDemandado,
    demandasPorCategoria: jv.demandasPorCategoria,
    numeroDemandasDeOtroDemandado: jv.numeroDemandasDeOtroDemandado,
    numeroDemandasSinCotejo: jv.numeroDemandasSinCotejo,
    numeroDemandasComoOfendido: jv.numeroDemandasComoOfendido,
    tienePensionAlimenticia: jv.tienePensionAlimenticia,
    pensionAlimenticiaEnMora: jv.pensionAlimenticiaEnMora,
    deudaPensionAlimenticia: jv.deudaPensionAlimenticia,
    numeroPensionesAlimenticias: jv.numeroPensionesAlimenticias,
    numeroPensionesVigentes: jv.numeroPensionesVigentes,
    valorMensualPensiones: jv.valorMensualPensiones,
    numeroPensionesEnMora: jv.numeroPensionesEnMora,
  } as StandardClientProfile["riesgoJudicialCivil"], jv);

  // ---- riesgoPenal ----
  // Desde estructura-v28 sale de la capa de hechos (etapa B del grupo penal, docs/capa-de-hechos.md,
  // 3.3). El papel de la persona en cada denuncia sale de denuncias.ts, la misma regla que usa el
  // control de bloqueo: ser denunciante, víctima o testigo es SOLO CONTEXTO (no penaliza); ser
  // sospechosa o procesada sí. Una denuncia sin su cédula entre las partes no es suya y no cuenta
  // (decisión del negocio, 2026-09-28): hasta estructura-v8 contaba como "víctima" -- 232 de 1.780
  // denuncias. El nombre de numeroDenunciasComoVictima quedó de cuando sólo se distinguía sospechoso
  // de víctima: cuenta toda denuncia en la que figura con otro papel.
  // Con la fuente de denuncias caída (o la de antecedentes con un error) el campo es null y el grupo
  // lo lista en camposSinDato: hasta la v27 el perfil escribía 0 denuncias, y la tarjeta decía «sin
  // antecedentes ni denuncias» de alguien a quien no se pudo mirar.
  const pn = perfilDesdeHechos(hechos, "riesgoPenal") as AnyRecord;
  const riesgoPenal = conSinDato({
    tieneAntecedentesPenales: pn.tieneAntecedentesPenales,
    descripcionAntecedentes: pn.descripcionAntecedentes,
    numeroDenunciasComoSospechoso: pn.numeroDenunciasComoSospechoso,
    numeroDenunciasComoVictima: pn.numeroDenunciasComoVictima,
  } as StandardClientProfile["riesgoPenal"], pn);

  // ---- cumplimiento (control de bloqueo, informativo) ----
  // Desde estructura-v28 sale de la capa de hechos (hechos/grupos/cumplimiento.ts), los mismos
  // hechos de los que el control de bloqueo arma todos sus hallazgos (hechos/controles.ts).
  // personaPublicasOpr/tpeps = PEP: se cuenta aparte de enListaControl, no es señal de riesgo
  // crediticio, y las dos fuentes se suman sin unir.
  // homonimosOpr/tconsephomonimos EXCLUIDOS a propósito de enListaControl: son otra persona con el
  // mismo nombre, cédula distinta, código homonimo_en_lista_control (bug encontrado auditando
  // cédulas c-10a696c9/c-7c7071e4: la identificación del "homónimo" nunca coincide con la del
  // cliente consultado).
  // impedimentoCargosPublicos.data trae una lista: sobre todos sus elementos (bug encontrado auditando
  // la cédula c-f059ebe9, que SÍ tiene registraImpedimento=true real; obj() lo rechazaba por tipo).
  const cp = perfilDesdeHechos(hechos, "cumplimiento") as AnyRecord;
  const cumplimiento = conSinDato({
    enListaControl: cp.enListaControl,
    tieneProvidenciaDeCertificacion: cp.tieneProvidenciaDeCertificacion,
    tieneHomonimoEnListaControl: cp.tieneHomonimoEnListaControl,
    enListaNegra: cp.enListaNegra,
    impedimentoCargosPublicos: cp.impedimentoCargosPublicos,
    causalImpedimento: cp.causalImpedimento,
    registraSercopContraloria: cp.registraSercopContraloria,
    esPersonaExpuestaPoliticamente: cp.esPersonaExpuestaPoliticamente,
    detallePep: cp.detallePep,
  } as StandardClientProfile["cumplimiento"], cp);

  // ---- riesgoSeguridadCiudadana (grupo propio, control de bloqueo duro) ----
  // Desde estructura-v27 sale de la capa de hechos, con los mismos hechos de los que
  // el control de bloqueo arma su hallazgo (hechos/controles.ts): hasta la v26 eran
  // dos lecturas del mismo crudo que coincidían por disciplina. Las denuncias cuentan
  // sólo si la persona es la acusada (denuncias.ts); las demandas, sólo si el demandado
  // es ella (v20); los antecedentes, por su descripción. Con una de las tres fuentes
  // caída el campo es null y camposSinDato lleva lo que dicen las otras.
  const sc = perfilDesdeHechos(hechos, "riesgoSeguridadCiudadana") as AnyRecord;
  const riesgoSeguridadCiudadana = conSinDato({
    tieneDelitoSeguridadCiudadana: sc.tieneDelitoSeguridadCiudadana,
    categoriasDelitoSeguridadCiudadana: sc.categoriasDelitoSeguridadCiudadana,
  } as StandardClientProfile["riesgoSeguridadCiudadana"], sc);

  // El detalle fuente por fuente, en los tres estados de
  // docs/declaracion-de-disponibilidad.md. La distinción que importa no
  // es "ok o no ok" sino si HUBO MEDICIÓN:
  //
  //   conDatos   la fuente contestó y hay información.
  //   sinDatos   la fuente contestó y no hay nada. ES evidencia --
  //              "no registra demandas" es un hecho sobre la persona.
  //   noMedidas  nadie pudo mirar (error) o nadie la cubre
  //              (deshabilitada). NO es evidencia de ausencia.
  //
  // `faltante` va con `ok_vacio` y no con los errores: las dos quieren
  // decir que la fuente contestó y no había nada, sólo que una lo dice
  // con un 404 y la otra con un sobre vacío. Meterlas entre los huecos
  // fabricaría incertidumbre donde hay un dato.
  const estado = Object.entries(estadoPorFuente(raw));
  const profile: StandardClientProfile = {
    cedula,
    consultadoEn: new Date().toISOString(),
    identidad,
    contacto,
    familia,
    laboral,
    tributario,
    seguridadSocial,
    patrimonio,
    comportamientoBancario,
    comportamientoCooperativas,
    comportamientoInterno,
    transitoVehicular,
    riesgoJudicialCrediticio,
    riesgoJudicialCivil,
    riesgoPenal,
    cumplimiento,
    riesgoSeguridadCiudadana,
    fuentesIngreso,

    metaConsulta: {
      fuentesConDatos: estado.filter(([, v]) => v === "ok").map(([k]) => k),
      fuentesSinDatos: estado.filter(([, v]) => v === "ok_vacio" || v === "faltante").map(([k]) => k),
      fuentesNoMedidas: estado.filter(([, v]) => v === "error" || v === "deshabilitado").map(([k]) => k),
    },
  };

  return { profile, duracionFuentesMs };
}
