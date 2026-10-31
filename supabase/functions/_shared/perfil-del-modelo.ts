// El perfil del modelo: la ÚNICA fuente que lee el análisis con IA.
//
// POR QUÉ UNA SOLA PUERTA
//
// Hasta marco-v22 cada camino armaba su propio mensaje. El análisis
// ocultaba los campos que el admin deshabilitó y recortaba el detalle de
// ingresos; el backtest recortaba el detalle pero no ocultaba nada, así
// que "corría en las mismas condiciones que producción" sin hacerlo; el
// informe de retroalimentación tenía su propio extracto. Y la parte de
// ingresos llegaba con los nombres internos (pisoIngresoMensualReportado,
// reportada_por_tercero, autodeclarada_en_minimo, senalesDeEscala) que el
// negocio sacó de la pantalla y que el marco no le explicaba: nada impedía
// que el análisis dijera "piso de ingreso" o "evidencia autodeclarada".
//
// Ahora todo camino al modelo pasa por armarPerfilDelModelo(): el perfil
// estandarizado guardado, con `fuentesIngreso` reemplazado por la lectura
// que ve el analista en la pestaña Fuentes de ingreso -- los mismos
// nombres (nombres-ingresos.ts) y las mismas funciones (perfil laboral,
// indicios de ingreso mayor, tamaño del negocio) -- y los campos
// deshabilitados en standard_profile_field_config en null.
//
// Lo que se deja afuera a propósito: los aportes mes a mes, los empleos de
// 24 meses, los textos de actividad económica del SRI y el impuesto a la
// renta por año (decisión del negocio del 2026-09-25). Desde fuentes-v9 la
// renta llega sólo como indicio de ingreso mayor, ya interpretado (decisión
// del 2026-09-28). Tampoco van las marcas de auditoría (correccion,
// recalculo), ni lo que el perfil guarda para el predictor de ingresos
// (CAMPOS_DEL_PREDICTOR_QUE_NO_LLEGAN, desde estructura-v15).
//
// Desde marco-v24 suma el bloque `endeudamiento` (la deuda propia en todo
// el sistema, lo que está en atraso, lo garantizado y la cuota conocida) y
// le da a los préstamos del IESS/BIESS su nombre (numeroPrestamosIessBiess).
//
// Desde marco-v25, `disponibilidad` reemplaza a `metaConsulta`: qué temas se
// consultaron, en palabras del negocio, sin nombres de fuentes (ver
// disponibilidadPorTema y docs/declaracion-de-disponibilidad.md).
//
// Desde marco-v26, las demandas civiles llegan contadas por categoría
// (demandas.ts) y los tipos de cobro, legibles: ni artículos del COIP ni
// tildes rotas.
//
// Desde marco-v29 no llegan la cédula, el nombre ni el de ningún empleador
// (RUTAS_QUE_NO_LLEGAN, más abajo), y todo número llega entero
// (limpiarValores).
//
// Desde marco-v31 (apagado: CONFIG_LLM.buroDeLaInstitucion), cuando la
// persona tiene una consulta vigente del buró de la institución, llega
// `buroEquifax` EN LUGAR del buró de bancos y de cooperativas de Proveedor_Info_1
// (un tema, una fuente: ver "El buró de la institución", más abajo). Sin
// buró, el perfil sale idéntico al de marco-v30, byte a byte.
//
// Un cambio en lo que arma este archivo cambia lo que lee el modelo: es
// una versión nueva del marco (MARCO_VERSION), con su fila en
// scoring_rules_versions.

import { clasificarPerfilLaboral } from "./perfil-laboral.ts";
import { dejoDeAparecerEnElIess, esIngresoMinimoSbu, indiciosDeIngresoMayor, tamanoDelNegocio } from "./fuentes-ingreso.ts";
import { ETIQUETA_ESTADO, ETIQUETA_SEGMENTO, quienDeclara } from "./nombres-ingresos.ts";
import { relacionConEmpleador } from "./patrono.ts";
import { tipoDeDemandaLegible } from "./demandas.ts";
import { fechaEnEcuador } from "./equifax-estructura.ts";

type AnyRecord = Record<string, unknown>;

// ---- Lo que no llega al modelo (desde marco-v29) ----
//
// Hasta marco-v28 este archivo copiaba el perfil estandarizado y le sacaba
// grupos y campos puntuales, pero nunca la identidad directa: los 207
// análisis de v28 llevaron la cédula y el nombre completo, y 137 el nombre
// de cada empleador, por dos lados (los aportes y los empleos actuales).
// Lo encontró la auditoría externa del 2026-10-09 (E27), con siete
// documentos que afirmaban lo contrario. Calificar no necesita nada de eso.
// Y el nombre del empleador es texto de un tercero -- una puerta para
// meterle instrucciones al modelo --, que en el empleo doméstico es el
// nombre de otra persona: en 60 de los 207 la respuesta lo repetía.
//
// Rutas del mensaje; "[]" es cada elemento de una lista. Se BORRAN, no van
// en null: el modelo no tiene nada que hacer con saber que existen. La misma
// lista la verifica scripts/auditar-seguridad.mjs sobre el último mensaje
// guardado (analysis_results.mensaje_al_modelo).
export const IDENTIFICADORES_QUE_NO_LLEGAN = [
  "cedula",
  "identidad.nombreCompleto",
  // En su lugar, tipoEmpleador (tipoDeCadaEmpleo).
  "laboral.empleosActuales[].empleador",
  // La forma de los perfiles anteriores a marco-v20.
  "laboral.empleoActual.empleador",
  // El tipo ya va en tipo y declaradoPor ("empleo doméstico", "Empleador
  // público").
  "fuentesIngreso.aportes[].empleador",
  // La institución del cargo público: con el cargo, dice quién es.
  "cumplimiento.detallePep.empresa",
  // Quien estudió y trabaja en la misma universidad la tiene de empleador:
  // así llegaba el nombre en 13 de los 2.813 perfiles (2026-10-13). El marco
  // no la usa; el nivel del título sigue.
  "identidad.institucionTituloMasAlto",
];

// La última mano sobre todo lo que lee el modelo, venga del campo que venga:
// - Un número de 10 dígitos o más dentro de un texto se tapa: el cargo que
//   escribe el empleador trajo uno en 1 de los 2.813 perfiles (2026-10-13),
//   y una lista de campos no lo ve.
// - Todo número va entero (desde marco-v29, decisión del negocio del
//   2026-10-13). El modelo copia los números tal cual al resumen y a los
//   puntos a favor y en contra, y en crédito los centavos no cambian una
//   decisión. Hasta v28 se redondeaba a centavos en tres grupos y los
//   decimales seguían llegando por otros 33 campos, todos montos (ninguno
//   una proporción): la deuda propia total en 2.509 de 2.813 perfiles, el
//   avalúo de los vehículos con decimales de punto flotante.
const NUMERO_LARGO = /\d{10,}/g;
function limpiarValores(nodo: unknown): unknown {
  if (typeof nodo === "string") return nodo.replace(NUMERO_LARGO, "[número omitido]");
  if (typeof nodo === "number") return Number.isFinite(nodo) ? Math.round(nodo) : nodo;
  if (Array.isArray(nodo)) return nodo.map(limpiarValores);
  if (nodo && typeof nodo === "object") {
    return Object.fromEntries(Object.entries(nodo).map(([k, v]) => [k, limpiarValores(v)]));
  }
  return nodo;
}

// Los atributos protegidos: sexo, estado civil, origen, familia y edad. El
// marco prohíbe usarlos para el score desde v11, pero llegan. Si se sacan
// lo decide el negocio con legal (bloque B del cuestionario del 2026-10-13;
// sin contestar al cerrar marco-v29): true = llega. Pasar uno a false lo
// saca del mensaje y lo suma al control de seguridad. Cambia lo que lee el
// modelo, así que es una versión nueva del marco con su fila en
// scoring_rules_versions.
export const ATRIBUTOS_PROTEGIDOS: Record<string, boolean> = {
  "identidad.genero": true,
  "identidad.estadoCivil": true,
  "identidad.tieneConyuge": true,
  "identidad.edadConyuge": true,
  "identidad.añosCasado": true,
  "identidad.edad": true,
  "identidad.provinciaNacimiento": true,
  "identidad.cantonNacimiento": true,
  "identidad.paisOrigen": true,
  "identidad.paisOrigenIso3": true,
  "identidad.paisOrigenIso": true,
  "identidad.esExtranjero": true,
  "familia.numeroHijos": true,
  "familia.tieneHijos": true,
  "familia.tieneHijoMenorEdad": true,
  "familia.padresFallecidos": true,
};

// ---- Lo que el perfil guarda para el predictor de ingresos ----
//
// laboral.obligadoALlevarContabilidadRuc (estructura-v15) lo lee el nivel 1
// del predictor. El modelo ya recibe el obligado, interpretado, en
// fuentesIngreso: el indicio de ingreso mayor y
// tamanoDelNegocio.obligadoContabilidad, que el marco explica (escala, no
// ingreso). En laboral sería el mismo dato dos veces sin texto del marco que
// lo explique, y en 4 de 2.567 personas las dos lecturas se contradirían:
// Proveedor_Info_1 manda «S» y fuentes-ingreso.ts sólo reconoce «SI». Sin él el
// mensaje sigue siendo el de marco-v30 (decisión del negocio del 2026-10-29:
// la próxima versión del marco se arma con los resultados del predictor).
export const CAMPOS_DEL_PREDICTOR_QUE_NO_LLEGAN = ["laboral.obligadoALlevarContabilidadRuc"];

// ---- Lo que estructura-v16 sumó al perfil y el marco todavía no explica ----
//
// - comportamientoBancario.saldoPrestamosIessBiess: el saldo de los préstamos
//   del IESS/BIESS, que el marco no conoce (hoy sólo ve si hay y su mora).
// - comportamientoBancario.fechaCorteRetail: el corte de las deudas retail
//   (julio de 2025 en las 63 filas de las 91 personas con Equifax). El marco
//   las lee como actuales.
// Los valores corregidos de los campos que ya existían (el salario más alto, el
// cargo, los empleadores, tieneCreditoIessBiess, diasMoraCreditoIessBiess) sí
// llegan: son el mismo campo con el dato bien leído. Sin estos dos el mensaje
// sigue siendo el de marco-v30; la sesión del marco los abre (cada uno es una
// línea de esta lista) junto con el texto que los explique.
export const CAMPOS_NUEVOS_QUE_AUN_NO_LLEGAN = ["comportamientoBancario.saldoPrestamosIessBiess", "comportamientoBancario.fechaCorteRetail"];

export const RUTAS_QUE_NO_LLEGAN: string[] = [
  ...IDENTIFICADORES_QUE_NO_LLEGAN,
  ...Object.entries(ATRIBUTOS_PROTEGIDOS).filter(([, llega]) => !llega).map(([ruta]) => ruta),
  ...CAMPOS_DEL_PREDICTOR_QUE_NO_LLEGAN,
  ...CAMPOS_NUEVOS_QUE_AUN_NO_LLEGAN,
];

function quitarRuta(nodo: unknown, partes: string[]): void {
  if (!nodo || typeof nodo !== "object" || partes.length === 0) return;
  const [primera, ...resto] = partes;
  const esLista = primera.endsWith("[]");
  const clave = esLista ? primera.slice(0, -2) : primera;
  const o = nodo as AnyRecord;
  if (!(clave in o)) return;
  if (resto.length === 0) {
    delete o[clave];
    return;
  }
  for (const hijo of esLista ? (Array.isArray(o[clave]) ? (o[clave] as unknown[]) : []) : [o[clave]]) quitarRuta(hijo, resto);
}

const nombreNormalizado = (v: unknown): string => String(v ?? "").trim().toUpperCase();

// ¿El empleador de este empleo o aporte es la propia persona o puede ser un
// pariente? Lo mismo que process.ts calcula para la persona entera
// (relacionConEmpleador, patrono.ts), pero de a uno. null = no se sabe (sin
// nombre comparable).
// - Un Empleador público nunca es un negocio familiar: el apellido en
//   "GAD MUNICIPAL DE ..." es una coincidencia, y era un falso positivo que
//   el modelo descartaba mirando el nombre hasta v28.
// - Sin el RUC del patrono, que no queda en el perfil, la propia persona se
//   reconoce por el nombre o porque su aporte es como patrono de su propio
//   negocio.
function quienEsElEmpleador(perfil: AnyRecord, empleador: unknown, tipoEmpleador: string | null, tipoDeAporte: unknown) {
  const nombreCliente = (perfil.identidad as AnyRecord | undefined)?.nombreCompleto ?? null;
  const r = relacionConEmpleador(empleador, nombreCliente, null, (perfil.cedula as string | null | undefined) ?? null);
  const propio = tipoDeAporte === "aporte como patrono de su propio negocio" || r?.esElMismoCliente === true;
  return {
    esSuPropioPatrono: propio ? true : r ? false : null,
    posibleNegocioFamiliar: propio || tipoEmpleador === "Empleador público" ? false : (r?.comparteApellido ?? null),
  };
}

// El tipo de cada empleo actual, en lugar del nombre de su empleador: el
// mismo que lleva su aporte en fuentesIngreso (quienDeclara), así el modelo
// y la pestaña Fuentes de ingreso dicen lo mismo. El empleo y el aporte
// salen del mismo registro del IESS y se cruzan por el nombre ANTES de
// borrarlo: en los análisis de marco-v28, 150 de 152 empleos tenían su
// aporte. Los que no, llegan con tipoEmpleador null.
//
// Desde marco-v30, cada empleo dice además de quién es, calculado con el
// nombre antes de borrarlo (quienEsElEmpleador). v29 dejaba sólo las marcas
// de la persona (empleadorConApellidoDelCliente, clienteEsSuPropioEmpleador),
// y con dos empleos el modelo ya no sabía cuál era el del pariente: 9 de las
// 72 personas con la marca de familiar y 24 de las 409 que son su propio
// patrono tienen más de un empleo (2026-10-16).
function tipoDeCadaEmpleo(perfil: AnyRecord, laboral: AnyRecord): void {
  const fuentes = (Array.isArray((perfil.fuentesIngreso as AnyRecord | undefined)?.fuentes)
    ? (perfil.fuentesIngreso as AnyRecord).fuentes
    : []) as AnyRecord[];
  const fuentePorEmpleador = new Map<string, AnyRecord>();
  for (const f of fuentes) {
    if (f.evidencia === "indirecta" || !f.empleador) continue;
    const nombre = nombreNormalizado(f.empleador);
    if (!fuentePorEmpleador.has(nombre)) fuentePorEmpleador.set(nombre, f);
  }
  const conTipo = (e: unknown) => {
    if (!e || typeof e !== "object" || !("empleador" in e)) return e;
    const { empleador, ...resto } = e as AnyRecord;
    const fuente = fuentePorEmpleador.get(nombreNormalizado(empleador));
    const tipoEmpleador = fuente ? quienDeclara(fuente, perfil) : null;
    return { tipoEmpleador, ...quienEsElEmpleador(perfil, empleador, tipoEmpleador, fuente?.tipo), ...resto };
  };
  if (Array.isArray(laboral.empleosActuales)) laboral.empleosActuales = laboral.empleosActuales.map(conTipo);
  if (laboral.empleoActual && typeof laboral.empleoActual === "object") laboral.empleoActual = conTipo(laboral.empleoActual);
}

// ---- Disponibilidad por tema (desde marco-v25) ----
//
// Hasta marco-v24 el modelo recibía metaConsulta: tres listas con los
// nombres técnicos de las 52 fuentes. En la comparación de razonamiento del
// 2026-09-28, 26 de 42 respuestas dijeron que no se habían consultado
// fuentes que sí respondieron ("no hay datos de inmuebles ni cooperativas,
// esas fuentes no respondieron"): tenían que deducir que "bienesInmueble"
// en "fuentesSinDatos" quiere decir "no tiene inmuebles", y sin razonar
// mucho no lo lograban. Con menos razonamiento, 12 de 14.
//
// Ahora recibe temas en palabras del negocio y DOS estados, no tres:
//   - consultado: lo que el perfil dice de ese tema es un hecho, también un
//     cero, un false o una lista vacía;
//   - no consultado: alguna de sus fuentes no respondió o está apagada;
//     no autoriza ninguna conclusión.
// El diseño original tenía tres (con datos / sin datos / no medido). Se
// dejó en dos porque "con datos" dice que la fuente respondió algo, no que
// la persona tenga registros: el certificado de antecedentes penales
// responde "NO" y figura con datos, igual que SERCOP con sus listas vacías.
// Decirle al modelo "antecedentes penales: con registros" sería un error
// peor que el que se corrige.
//
// Un tema cuenta como consultado sólo si respondieron TODAS sus fuentes.
// basesInternas trae dos cosas (los aportes al IESS y el historial de pago
// con Proveedor_Info_1) y está en los dos temas. "vacunados" no está en ninguno: no
// es parte del análisis de crédito.
const TEMAS_DE_CONSULTA: Array<[tema: string, fuentes: string[]]> = [
  ["buró de crédito de bancos", ["buroCreditoSuper"]],
  ["tarjetas Diners", ["buroCreditoDiners"]],
  ["cooperativas", ["buroCreditoCoop"]],
  ["casas comerciales", ["retails"]],
  ["préstamos del IESS/BIESS", ["creditoHipotecario", "creditoQuirografario"]],
  ["historial de pago con Proveedor_Info_1", ["basesInternas"]],
  ["registro de deudores", ["deudores"]],
  ["deudas con sentencia firme", ["deudasFirmes"]],
  ["demandas en su contra", ["demandas"]],
  ["demandas que presentó", ["demandasOfendido"]],
  ["pensiones alimenticias", ["pensionAlimenticia", "pensionAlimenticiaProveedorInfo1"]],
  ["denuncias en la Fiscalía", ["denuncias"]],
  ["antecedentes penales", ["antecedentesPenales"]],
  ["listas de control y sanciones", ["listasControl"]],
  ["lista negra", ["listaNegra"]],
  ["impedimento para cargos públicos", ["impedimentoCargosPublicos"]],
  ["SERCOP y Contraloría", ["sercop"]],
  ["aportes al IESS", ["basesInternas"]],
  ["empleos registrados en el IESS", ["trabajoHistoricos"]],
  ["historial mensual de aportes al IESS", ["trabajoHistoricosMecanizado"]],
  ["afiliación al IESS", ["afiliacionIess"]],
  ["empleados a su cargo", ["empleados", "cumplimientoPatronal"]],
  ["jubilación y pensión del IESS", ["jubilados", "pensionista"]],
  ["seguro social militar (ISSFAC)", ["afiliacionIssfacCertMedico", "afiliacionIssfacFuerzaArmada"]],
  ["seguro social policial (ISSPOL)", ["afiliacionIsspol", "afiliacionSiisspol"]],
  ["seguro de salud", ["afiliacionSalud"]],
  ["RUC y actividad económica", ["contribuyente", "establecimientoActEconomica"]],
  ["impuesto a la renta", ["sriImpuestoRenta"]],
  ["empresas que administra", ["administraciones"]],
  ["vehículos", ["vehiculos"]],
  ["inmuebles", ["bienesInmueble"]],
  ["inversiones", ["inversiones"]],
  ["seguros y siniestros", ["polizas", "siniestros"]],
  ["multas de tránsito", ["deudasAnt", "deudasAmt", "deudasEmov"]],
  ["licencia de conducir", ["licenciaConducir"]],
  ["identidad", ["general"]],
  ["familia", ["padres", "hijos"]],
  ["títulos académicos", ["titulos"]],
  ["datos de contacto", ["direcciones", "telefonos", "correo"]],
];

// null si el perfil no trae metaConsulta o no nombra ninguna fuente
// conocida (los anteriores a estructura-v3 nombraban nueve "ejes"): mejor
// no decir nada que declarar todo como no consultado.
//
// consultadosPorElBuro: los temas que trajo el buró de la institución
// (marco-v31). Cuentan como consultados aunque la fuente de Proveedor_Info_1 no haya
// contestado: el modelo los lee del buró.
export function disponibilidadPorTema(perfil: AnyRecord | null | undefined, consultadosPorElBuro: readonly string[] = []): AnyRecord | null {
  const meta = perfil?.metaConsulta as AnyRecord | undefined;
  if (!meta) return null;
  const lista = (clave: string) => new Set((Array.isArray(meta[clave]) ? meta[clave] : []) as string[]);
  const respondieron = new Set([...lista("fuentesConDatos"), ...lista("fuentesSinDatos")]);
  const conocidas = new Set(TEMAS_DE_CONSULTA.flatMap(([, fuentes]) => fuentes));
  if (![...respondieron].some((f) => conocidas.has(f))) return null;
  const temasConsultados: string[] = [];
  const temasNoConsultados: string[] = [];
  for (const [tema, fuentes] of TEMAS_DE_CONSULTA) {
    (consultadosPorElBuro.includes(tema) || fuentes.every((f) => respondieron.has(f)) ? temasConsultados : temasNoConsultados).push(tema);
  }
  return { temasConsultados, temasNoConsultados };
}

// Las fuentes sin monto que ya se dicen en otro lado del perfil del modelo:
// el RUC activo en perfilLaboral y la nómina en tamanoDelNegocio.
const SIN_MONTO_YA_DICHAS = new Set(["actividad económica propia", "actividad empresarial propia"]);

// La lectura de ingresos que recibe el modelo. null si el perfil es
// anterior al módulo de fuentes de ingreso.
export function ingresosDelPerfilDelModelo(perfil: AnyRecord | null | undefined): AnyRecord | null {
  const f = perfil?.fuentesIngreso as AnyRecord | undefined;
  if (!f) return null;
  const fuentes = (Array.isArray(f.fuentes) ? f.fuentes : []) as AnyRecord[];
  const monto = typeof f.pisoIngresoMensualReportado === "number" ? f.pisoIngresoMensualReportado : null;
  const pl = clasificarPerfilLaboral(perfil);
  const d = (f.detalle ?? null) as AnyRecord | null;
  const co = d ? (d.continuidadLaboral as AnyRecord | null | undefined) : undefined;
  const haceUnAnio = typeof d?.totalHace12Meses === "number" ? d.totalHace12Meses : null;

  return {
    segmento: ETIQUETA_SEGMENTO[String(f.segmento)] ?? f.segmento ?? null,
    estado: ETIQUETA_ESTADO[String(f.estadoSegmento)] ?? f.estadoSegmento ?? null,
    // Hasta fuentes-v8 el motivo de "Sin datos" nombraba la fuente y su
    // estado técnico ("(basesInternas) no respondió (estado: error)"). Los
    // perfiles que no se pueden recalcular -- las 240 cédulas de prueba de
    // Aval no tienen crudo -- lo siguen trayendo: se limpia acá.
    condicionesDeLaSegmentacion:
      typeof f.motivoSegmento === "string"
        ? f.motivoSegmento.replace(" (basesInternas)", "").replace(/ \(estado: [^)]*\)/, "")
        : null,
    informacionIess: f.corteIessUsado ?? null,
    // Un jubilado que dejó de aportar no está "sin información actual":
    // se jubiló (fuentes-v9, dejoDeAparecerEnElIess).
    sinInformacionActualEnElIess: dejoDeAparecerEnElIess(f),
    mesesSinAportar: dejoDeAparecerEnElIess(f) ? f.cortesDesdeLaDesvinculacion ?? null : null,
    ingresoReportadoIess: monto,
    esIngresoMinimoSbu: esIngresoMinimoSbu(monto, f.corteIessUsado as string | null),
    aportes: fuentes
      .filter((x) => x.evidencia !== "indirecta")
      .map((x) => {
        const declaradoPor = quienDeclara(x, perfil);
        // Desde marco-v30: quién reporta el ingreso, el empleador de un
        // tercero, la propia persona o posiblemente un pariente.
        return {
          tipo: x.tipo ?? null,
          declaradoPor,
          ...quienEsElEmpleador(perfil ?? {}, x.empleador, declaradoPor, x.tipo),
          montoMensual: x.montoMensualReportado ?? null,
        };
      }),
    otrasFuentesSinMonto: fuentes
      .filter((x) => x.evidencia === "indirecta" && !SIN_MONTO_YA_DICHAS.has(String(x.tipo)))
      .map((x) => x.tipo),
    perfilLaboral: pl
      ? {
          tipo: pl.etiqueta,
          trabajaParaUnTercero: pl.dependencia,
          tieneActividadPropia: pl.actividadPropia,
          tieneEmpleados: pl.empleador,
          rucActivoDesde: pl.rucActivoDesde,
          aportaSinRucActivo: pl.aporteVoluntarioSinRuc,
          actividadPropiaEsLaPrincipal: pl.actividadPropiaPrincipal,
          registraJubilacion: pl.jubilacion,
        }
      : null,
    tamanoDelNegocio: tamanoDelNegocio(perfil),
    indiciosIngresoMayor: indiciosDeIngresoMayor(f).map((i) => i.detalle),
    // Sin `detalle` (perfiles anteriores a fuentes-v4) no se sabe: null, no
    // ceros.
    estabilidad: d
      ? {
          // undefined: el perfil es anterior a fuentes-v5 y no la calculó.
          // null: nunca trabajó con un empleador ni por cuenta propia con
          // RUC activo según el IESS.
          continuidadLaboral:
            co === undefined
              ? null
              : co === null
                ? { vigente: false, meses: 0 }
                : {
                    vigente: co.vigente,
                    meses: co.meses,
                    desde: co.desde,
                    hasta: co.hasta,
                    empleadores: co.empleadores,
                    mesesPorCuentaPropiaConRuc: co.mesesCuentaPropiaConRuc ?? null,
                  },
          mesesConAporteUltimos12: d.mesesConAporteUltimos12 ?? null,
          promedioReportado6Meses: d.promedioUltimos6 ?? null,
          variacionContraHaceUnAnioPct: monto && haceUnAnio ? Math.round(((monto - haceUnAnio) / haceUnAnio) * 100) : null,
        }
      : null,
    documentosDeConfirmacion: Array.isArray(f.paraConfirmar) ? f.paraConfirmar : [],
  };
}

const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Idempotente: un tipo que ya viene legible (estructura-v11) queda igual.
const tiposLegibles = (tipos: unknown[]): string[] =>
  [...new Set(tipos.map((t) => tipoDeDemandaLegible(t)).filter((t): t is string => Boolean(t)))];

// La deuda de la persona sumada en todo el sistema (desde marco-v24).
// Hasta v23 el modelo recibía cada fuente por separado y presentó $258.798
// de bancos y Diners como "la cartera vigente" de c-2a50c228, sin los
// $84.778 de cooperativas. Lo garantizado va aparte: no es deuda propia.
// La cuota conocida es sólo la de cooperativas: los bancos no la informan.
// Se calcula DESPUÉS de ocultar los campos deshabilitados: un campo
// apagado no puede volver a entrar sumado acá. En dólares enteros desde
// marco-v29, y el total es la suma de las partes YA redondeadas: redondear
// cada una por su lado podía dar un total que no cuadra por un dólar.
export function endeudamientoDelPerfilDelModelo(perfil: AnyRecord): AnyRecord | null {
  const b = (perfil.comportamientoBancario ?? null) as AnyRecord | null;
  const c = (perfil.comportamientoCooperativas ?? null) as AnyRecord | null;
  if (!b && !c) return null;
  // Perfiles anteriores a estructura-v8 no traen deudaEnAtraso: lo único
  // que había era el saldo en mora.
  const atrasoBancos = typeof b?.deudaEnAtraso === "number" ? b.deudaEnAtraso : numero(b?.saldoEnMoraBuroCredito);
  const bancos = Math.round(numero(b?.saldoTotalVigente) + atrasoBancos);
  const cooperativas = Math.round(numero(c?.saldoTotal));
  const retail = Math.round(numero(b?.totalDeudaRetail));
  return {
    deudaPropiaTotal: bancos + cooperativas + retail,
    deudaPropiaBancos: bancos,
    deudaPropiaCooperativas: cooperativas,
    deudaPropiaRetail: retail,
    // También por partes: con todo atrasado, redondear la suma daba un dólar
    // más de atraso que de deuda.
    deudaEnAtrasoTotal: Math.round(atrasoBancos) + Math.round(numero(c?.saldoEnMora)) + Math.round(numero(b?.valorVencidoRetail)),
    deudaComoGaranteOCodeudor: typeof b?.deudaComoGaranteOCodeudor === "number" ? b.deudaComoGaranteOCodeudor : null,
    cuotaMensualConocida: typeof c?.cuotaMensualTotal === "number" ? c.cuotaMensualTotal : null,
    cuotaMensualConocidaIncluye: "sólo cooperativas: los bancos no informan la cuota",
  };
}

// ---- El buró de la institución (marco-v31, apagado) ----
//
// Decisiones del negocio del 2026-10-13 y del 2026-10-16
// (docs/propuesta-buro-de-la-institucion.md, secciones 0 y 2): cada IFI
// trabaja con UN buró, y cuando la persona tiene una consulta vigente de ese
// buró, la deuda de bancos y cooperativas se lee de ahí y no de Proveedor_Info_1. Un
// tema, una fuente: con las dos, la comparación con y sin Equifax mediría la
// deuda dos veces (bancos coincide hasta 1% en 15 de 22 personas y
// cooperativas en 8 de 11: es la misma cartera). Proveedor_Info_1 se sigue
// consultando entera; lo que el buró repite sólo deja de llegar al modelo.
//
// Hoy el único buró con esta lectura es Equifax (buro-de-la-institucion.ts
// dice cuál es el de la base y busca la consulta vigente).

export interface BuroDeLaInstitucion {
  proveedor: "equifax";
  // consultas_equifax.estructura (equifax-estructura.ts).
  estructura: AnyRecord;
}

// Lo que el buró cubre: estos temas cuentan como consultados cuando llega.
export const TEMAS_QUE_CUBRE_EL_BURO = ["buró de crédito de bancos", "tarjetas Diners", "cooperativas"] as const;

// De comportamientoBancario quedan sólo estos campos cuando llega el buró:
// lo que el buró no cubre. Una lista de los que QUEDAN y no de los que se
// van: un campo de buró con otro nombre en un perfil viejo no puede colarse.
// - El registro de deudores es otra fuente (deudores).
// - Los préstamos del IESS/BIESS se quedan en Proveedor_Info_1 y no se suman:
//   Equifax trae los del BIESS dentro de bancos (las dos fuentes en 4 de 22).
// - Las casas comerciales de Proveedor_Info_1 y el sector comercial de Equifax son
//   otras empresas (5 de 33 en común): se suman (negocio, 2026-10-16:
//   «veamos cómo nos va sumando»).
export const QUEDAN_DE_PROVEEDOR_INFO_1_CON_BURO = [
  "figuraEnRegistroDeudores",
  "numeroPrestamosIessBiess",
  "tieneCreditoIessBiess",
  "diasMoraCreditoIessBiess",
  // Los dos de estructura-v16 son del IESS/BIESS y del retail, que se quedan:
  // todavía no llegan al modelo (CAMPOS_NUEVOS_QUE_AUN_NO_LLEGAN, más abajo).
  "saldoPrestamosIessBiess",
  "numeroDeudasRetail",
  "diasMoraMaximaRetail",
  "totalDeudaRetail",
  "valorVencidoRetail",
  "fechaCorteRetail",
] as const;

// Los que se van, para que una prueba obligue a decidir sobre un campo nuevo
// de comportamientoBancario (perfil-del-modelo-buro.test.ts). La calificación
// A1 a E se va con ellos: Equifax no la trae, y la reemplazan los días de mora.
export const CAMPOS_DEL_BURO_DE_PROVEEDOR_INFO_1 = [
  "numeroOperacionesBuroCredito",
  "peorCalificacionRiesgo",
  "mejorCalificacionRiesgo",
  "tieneOperacionConDemanda",
  "tieneOperacionCastigada",
  "saldoTotalVigente",
  "saldoEnMoraBuroCredito",
  "saldoNoDevengaIntereses",
  "deudaEnAtraso",
  "operacionesEnAtrasoSinMonto",
  "numeroOperacionesComoGaranteOCodeudor",
  "deudaComoGaranteOCodeudor",
  "peorCalificacionComoGaranteOCodeudor",
] as const;

const SISTEMAS_DEL_BURO = ["bancos", "cooperativas", "comercial"] as const;
const DEUDA_DEL_TITULAR = [
  "numeroDeOperaciones", "saldoDeudaUsd", "saldoPorVencerUsd", "saldoVencidoUsd", "saldoNoDevengaInteresesUsd",
  "saldoDemandaJudicialUsd", "saldoCarteraCastigadaUsd", "cuotaMensualUsd", "maximoDiasDeMora", "conciliaConElResumen",
];
const DEUDA_COMO_CODEUDOR_O_GARANTE = ["numeroDeOperaciones", "saldoDeudaUsd", "saldoVencidoUsd", "maximoDiasDeMora"];

const comoObjeto = (v: unknown): AnyRecord | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null);
// null se queda null: un grupo que Equifax no trajo no es un grupo en cero.
function elegir(origen: unknown, claves: readonly string[]): AnyRecord | null {
  const o = comoObjeto(origen);
  return o ? Object.fromEntries(claves.filter((k) => k in o).map((k) => [k, o[k]])) : null;
}
const porSistema = (grupo: unknown, claves: readonly string[]): AnyRecord => {
  const g = comoObjeto(grupo);
  return Object.fromEntries([...SISTEMAS_DEL_BURO, "total"].map((s) => [s, elegir(g?.[s], claves)]));
};

// El bloque buroEquifax: la estructura de la consulta, recortada a lo que le
// sirve al modelo (docs/propuesta-marco-equifax.md, sección 3). Se queda
// afuera:
// - lo que espera al diccionario de Equifax y el modelo leería como una
//   probabilidad: la tasa de malos, la probabilidad de sobreendeudamiento y
//   la banda del score;
// - las estimaciones de Equifax (el ingreso estimado): no se especula sobre
//   el ingreso;
// - lo que Equifax cuenta con TODOS los roles y se leería como propio: los
//   impagos y las morosidades del resumen (lección del 2026-10-13: el resumen
//   incluye al codeudor y al garante). La evolución sí va, con el rol en el
//   nombre;
// - el material de control (el resumen de Equifax, la lista aparte de
//   codeudores, las listas que no vinieron: un grupo que no vino llega null);
// - la actividad económica del SRI, que Proveedor_Info_1 trae con más detalle.
// La estructura no tiene datos personales por construcción
// (equifax-tablas.ts); scripts/medir-bloque-equifax.mjs lo vuelve a buscar
// sobre las consultas guardadas.
export function buroEquifaxDelPerfilDelModelo(estructura: AnyRecord): AnyRecord {
  const e = estructura ?? {};
  const general = comoObjeto(e.estadoGeneral);
  const cartera = comoObjeto(general?.estadoDeCartera);
  const inhabilitacion = comoObjeto(general?.ultimaInhabilitacion);
  const mora = comoObjeto(e.moraActual);
  const consultadoEl = comoObjeto(e.consulta)?.consultadoEl;
  return {
    fechaDelReporte: typeof consultadoEl === "string" ? fechaEnEcuador(consultadoEl) : null,
    scores: elegir(e.scores, [
      "scoreEquifax", "scoreEquifaxHace6Meses", "scoreEquifaxHace12Meses", "variacionDelScore12Meses",
      "scoreInclusionEquifax", "scoreSobreendeudamientoEquifax", "nivelDeSobreendeudamiento",
    ]),
    estadoGeneral: general
      ? {
          // Un cálculo del motor de Equifax, no un hecho del buró.
          estadoDeCartera: cartera ? { descripcion: cartera.descripcion ?? null, calculadoPor: "Equifax" } : null,
          antiguedadCrediticiaMeses: general.antiguedadCrediticiaMeses ?? null,
          tieneInhabilitacionBancaria: general.tieneInhabilitacionBancaria ?? null,
          ultimaInhabilitacion: inhabilitacion ? { fecha: inhabilitacion.fecha ?? null, accion: inhabilitacion.accion ?? null } : null,
        }
      : null,
    deudaActualTitular: porSistema(e.deudaActualTitular, DEUDA_DEL_TITULAR),
    deudaCodeudorGarante: porSistema(e.deudaCodeudorGarante, DEUDA_COMO_CODEUDOR_O_GARANTE),
    moraActual: mora
      ? {
          saldoVencidoUsd: mora.saldoVencidoUsd ?? null,
          porcentajeDeLaDeudaVencida: mora.porcentajeDeLaDeudaVencida ?? null,
          numeroDeOperacionesVencidas: mora.numeroDeOperacionesVencidas ?? null,
          maximoDiasDeMora: mora.maximoDiasDeMora ?? null,
          // Sólo los tramos con saldo: los nueve, casi siempre en cero, eran
          // un tercio del grupo.
          vencidoPorTramo: Object.fromEntries(
            Object.entries(mora).filter(([k, v]) => /^vencidoDe.*Usd$/.test(k) && typeof v === "number" && v > 0),
          ),
        }
      : null,
    conductaDePago: comoObjeto(e.conductaDePago),
    // Equifax la calcula con todos los roles: el nombre lo dice, para que no
    // se compare con la deuda propia.
    evolucionTodosLosRoles: comoObjeto(e.evolucion),
    tarjetas: elegir(e.tarjetas, [
      "numeroDeTarjetasVigentes", "cupoTotalUsd", "saldoTotalUsd", "usoActualPorcentaje", "usoPromedioPorcentaje",
      "numeroDeTarjetasConSaldoMayorAlCupo", "antiguedadDeLaMasAntiguaMeses",
    ]),
    // Sin los montos por tipo: qué es cada columna (titular, codeudor,
    // garante) espera al diccionario.
    creditosOtorgados: elegir(e.creditosOtorgados, [
      "numeroDeCreditosOtorgados", "numeroDeCreditosRefinanciados", "numeroDeCreditosReestructurados", "numeroDeCreditosNovados",
    ]),
    // Sin NovaCredit, que es la consulta de CrediScope.
    consultasRecibidas: elegir(e.consultasRecibidas, [
      "entidadesQueLaConsultaronEnLosUltimos12Meses", "consultasEnLosUltimos12Meses", "entidadesEnLosUltimos3Meses", "consultasEnLosUltimos3Meses",
    ]),
  };
}

// endeudamiento con el buró: bancos, cooperativas y sector comercial de
// Equifax (como titular, con lo que está en atraso) más las casas comerciales
// de Proveedor_Info_1. Las mismas reglas que sin buró: dólares enteros, el total es
// la suma de las partes ya redondeadas, y lo de codeudor o garante va aparte.
// Una parte que Equifax no trajo es null, y entonces el total también: no se
// sabe, no es cero.
export function endeudamientoConBuroEquifax(perfil: AnyRecord, buro: AnyRecord): AnyRecord {
  const b = (perfil.comportamientoBancario ?? null) as AnyRecord | null;
  const titular = comoObjeto(buro.deudaActualTitular);
  const delSistema = (s: string) => comoObjeto(titular?.[s]);
  const entero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  const enAtraso = (d: AnyRecord | null): number | null =>
    d ? Math.round(numero(d.saldoVencidoUsd) + numero(d.saldoNoDevengaInteresesUsd) + numero(d.saldoDemandaJudicialUsd) + numero(d.saldoCarteraCastigadaUsd)) : null;
  const sumar = (partes: Array<number | null>): number | null => (partes.some((p) => p === null) ? null : (partes as number[]).reduce((a, p) => a + p, 0));
  const bancos = entero(delSistema("bancos")?.saldoDeudaUsd);
  const cooperativas = entero(delSistema("cooperativas")?.saldoDeudaUsd);
  const comercial = entero(delSistema("comercial")?.saldoDeudaUsd);
  const retail = Math.round(numero(b?.totalDeudaRetail));
  return {
    deudaPropiaTotal: sumar([bancos, cooperativas, comercial, retail]),
    deudaPropiaBancos: bancos,
    deudaPropiaCooperativas: cooperativas,
    deudaPropiaSectorComercial: comercial,
    deudaPropiaRetail: retail,
    deudaEnAtrasoTotal: sumar([...SISTEMAS_DEL_BURO.map((s) => enAtraso(delSistema(s))), Math.round(numero(b?.valorVencidoRetail))]),
    deudaComoGaranteOCodeudor: entero(comoObjeto(comoObjeto(buro.deudaCodeudorGarante)?.total)?.saldoDeudaUsd),
    cuotaMensualConocida: entero(comoObjeto(titular?.total)?.cuotaMensualUsd),
    cuotaMensualConocidaIncluye: "bancos, cooperativas y sector comercial según Equifax; las casas comerciales no informan la cuota",
  };
}

// Con el buró, el perfil deja de llevar lo que el buró repite: los campos de
// buró de comportamientoBancario y comportamientoCooperativas entero. No van
// ni en null: el modelo no tiene nada que hacer con saber que existen, y un
// null le diría que es un dato que falta. buroEquifax va donde estaba el
// buró de bancos, para que el orden siga siendo el de importancia.
function conElBuro(copia: Record<string, unknown>, bloque: AnyRecord): Record<string, unknown> {
  const bancario = comoObjeto(copia.comportamientoBancario);
  const quedan = new Set<string>(QUEDAN_DE_PROVEEDOR_INFO_1_CON_BURO);
  // En el orden en que venían: lo que queda se lee igual que sin buró.
  const reducido = bancario ? Object.fromEntries(Object.entries(bancario).filter(([k]) => quedan.has(k))) : null;
  delete copia.comportamientoCooperativas;
  const salida: Record<string, unknown> = {};
  let puesto = false;
  for (const [clave, valor] of Object.entries(copia)) {
    if (!puesto && (clave === "comportamientoBancario" || clave === "riesgoJudicialCrediticio" || clave === "endeudamiento")) {
      salida.buroEquifax = bloque;
      puesto = true;
    }
    salida[clave] = clave === "comportamientoBancario" ? reducido : valor;
  }
  if (!puesto) salida.buroEquifax = bloque;
  return salida;
}

// El perfil del modelo entero. `camposDeshabilitados` son "grupo.campo"
// de standard_profile_field_config: se ponen en null, no se borran, para
// que el modelo sepa que el campo existe y no se le dio. `buro`: la consulta
// vigente del buró de la institución, o null; sólo la pasa
// armarPedidoScoring() con CONFIG_LLM.buroDeLaInstitucion encendido.
export function armarPerfilDelModelo(
  perfil: AnyRecord,
  camposDeshabilitados: Set<string> = new Set(),
  buro: BuroDeLaInstitucion | null = null,
): AnyRecord {
  const copia = JSON.parse(JSON.stringify(perfil ?? {})) as Record<string, unknown>;
  copia.fuentesIngreso = ingresosDelPerfilDelModelo(perfil);
  const ocultar = (destino: Record<string, unknown>) => {
    for (const clave of camposDeshabilitados) {
      const [grupo, campo] = clave.split(".");
      const g = destino[grupo] as AnyRecord | null | undefined;
      if (g && typeof g === "object" && campo in g) g[campo] = null;
    }
  };
  ocultar(copia);
  // Los montos salen enteros al final (limpiarValores): hasta v28 se
  // redondeaban acá a centavos en tres grupos, y un perfil anterior a
  // estructura-v8 traía 50394.899999999994 (sumas en coma flotante).
  // numeroCreditosFormales son préstamos IESS/BIESS, no operaciones del
  // buró: con el nombre viejo el modelo sumó 6 préstamos del BIESS a 6
  // operaciones del buró ("6 operaciones formales", c-3293f7eb). El
  // nombre guardado queda, como pisoIngresoMensualReportado.
  const bancario = copia.comportamientoBancario as AnyRecord | undefined;
  if (bancario && "numeroCreditosFormales" in bancario) {
    bancario.numeroPrestamosIessBiess = bancario.numeroCreditosFormales;
    delete bancario.numeroCreditosFormales;
  }
  const bloqueDelBuro = buro?.proveedor === "equifax" && buro.estructura ? buroEquifaxDelPerfilDelModelo(buro.estructura) : null;
  copia.endeudamiento = bloqueDelBuro ? endeudamientoConBuroEquifax(copia, bloqueDelBuro) : endeudamientoDelPerfilDelModelo(copia);
  // Las demandas (desde marco-v26): de las civiles, cuántas hay de cada
  // categoría (demandas.ts) en lugar de 615 textos libres con artículos del
  // COIP, que el modelo repetía tal cual y contaba todos como "demandas
  // civiles" -- también las investigaciones archivadas y los trámites. Los
  // tipos de cobro siguen, legibles. Un perfil anterior a estructura-v11 no
  // trae categorías: se le limpian los tipos.
  const civil = copia.riesgoJudicialCivil as AnyRecord | null | undefined;
  if (civil && typeof civil === "object") {
    if (Array.isArray(civil.demandasPorCategoria)) {
      civil.demandasPorCategoria = Object.fromEntries(
        (civil.demandasPorCategoria as AnyRecord[]).map((g) => [String(g.categoria), g.cantidad]),
      );
      delete civil.tiposDemandasComoDemandado;
    } else if (Array.isArray(civil.tiposDemandasComoDemandado)) {
      civil.tiposDemandasComoDemandado = tiposLegibles(civil.tiposDemandasComoDemandado);
    }
  }
  const cobro = copia.riesgoJudicialCrediticio as AnyRecord | null | undefined;
  if (cobro && typeof cobro === "object" && Array.isArray(cobro.tiposDemandasComoDemandado)) {
    cobro.tiposDemandasComoDemandado = tiposLegibles(cobro.tiposDemandasComoDemandado);
  }
  // Desde marco-v28: el grupo sólo llega si la persona es cliente interno.
  // Casi nadie lo es, y el marco gastaba un párrafo en decir que, vacío, se
  // ignore. Si la fuente no contestó, lo dice la disponibilidad.
  if ((copia.comportamientoInterno as AnyRecord | undefined)?.esClienteInterno === false) {
    delete copia.comportamientoInterno;
  }
  // Los bloques nuevos también se pueden apagar campo por campo.
  ocultar(copia);
  const laboral = copia.laboral as AnyRecord | null | undefined;
  if (laboral && typeof laboral === "object") tipoDeCadaEmpleo(perfil, laboral);
  for (const ruta of RUTAS_QUE_NO_LLEGAN) quitarRuta(copia, ruta.split("."));
  // La disponibilidad va PRIMERO (el modelo tiene que leerla antes que los
  // datos) y reemplaza a metaConsulta, que nombraba fuentes.
  delete copia.metaConsulta;
  if (bloqueDelBuro) {
    return limpiarValores({ disponibilidad: disponibilidadPorTema(perfil, TEMAS_QUE_CUBRE_EL_BURO), ...conElBuro(copia, bloqueDelBuro) }) as AnyRecord;
  }
  return limpiarValores({ disponibilidad: disponibilidadPorTema(perfil), ...copia }) as AnyRecord;
}

// El mensaje completo que recibe el modelo. Lo usan el análisis
// (llm-scoring.ts) y el backtest: el mismo armado en los dos.
export function mensajeParaElModelo(
  perfil: AnyRecord,
  hallazgosControlBloqueo: unknown[] | null | undefined,
  camposDeshabilitados: Set<string> = new Set(),
  buro: BuroDeLaInstitucion | null = null,
): { perfilDelModelo: AnyRecord; hallazgosControlBloqueo: unknown[] } {
  return {
    perfilDelModelo: armarPerfilDelModelo(perfil, camposDeshabilitados, buro),
    // Ya resueltos de forma determinística: el modelo no los recalcula.
    hallazgosControlBloqueo: limpiarValores(hallazgosControlBloqueo ?? []) as unknown[],
  };
}
