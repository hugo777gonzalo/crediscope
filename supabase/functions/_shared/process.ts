// Construye el StandardClientProfile: sucesor de normalize.ts/ClientContext
// con campos YA calculados (conteos, sumas, booleanos) en vez de arrays
// crudos, para que el scoring por LLM reciba mucho menos texto por
// persona. Ver docs/estructura-estandarizada.md.
//
// Esta lógica se validó primero en Node (scripts/reprocess-sample.mjs)
// contra 25 clientes reales antes de portarla acá — cualquier cambio de
// reglas debe reflejarse en AMBOS archivos (se mantienen en sync a mano,
// no hay build step compartido entre Deno y Node en este proyecto).
//
// Conectada a analyze-client/llm-scoring desde marco-v1 — es la
// entrada real del LLM (ver marco-interpretativo.ts).

import type { BlockStatusMap, RawNovadataResponse, StandardClientProfile } from "./types.ts";
import { analizarFuentesIngreso } from "./fuentes-ingreso.ts";

type AnyRecord = Record<string, unknown>;

function parseFecha(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatFechaISO(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

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
// promedio (bug real: cédula 0501578256, cese 2021-09-30, hoy
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

// tiess (fecIng/fecSal) viene en DD/MM/YYYY — confirmado con un valor
// real inequívoco ("13/12/2024", día 13 no puede ser mes). parseFecha
// (arriba) asume ISO/YYYY-MM-DD y usa new Date() directo, que interpreta
// slashes como MM/DD/YYYY (americano): "03/02/2025" (3 de febrero)
// pasaba a leerse como 2 de marzo, y "13/12/2024" directamente daba
// Invalid Date. Mismo problema que ya se había detectado (y evitado a
// propósito) en establecimientoActEconomica — ver nota ahí. NO usar
// parseFecha/mesesDesde con estos 2 campos.
function parseFechaDDMMYYYY(v: unknown): Date | null {
  const m = typeof v === "string" ? v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function mesesDesdeDDMMYYYY(v: unknown): number | null {
  const d = parseFechaDDMMYYYY(v);
  return d ? mesesEntreFechas(d, new Date()) : null;
}

function dentroUltimos12Meses(fecha: unknown): boolean {
  const meses = mesesDesde(fecha);
  return meses !== null && meses >= 0 && meses <= 12;
}

function dentroUltimos3Meses(fecha: unknown): boolean {
  const meses = mesesDesde(fecha);
  return meses !== null && meses >= 0 && meses <= 3;
}

// contribuyente/get_contribuyente_inf: un registro cuenta como "tuvo RUC"
// solo si trae .ruc Y .fecha_inscripcion_ruc (Novadata a veces devuelve
// un registro "cascarón" con estado.codigo=OK pero todos los campos
// null cuando la persona nunca tuvo RUC — ver 1759544552).
// ACTIVO si no tiene fecha_cancelacion NI fecha_suspension_definitiva, o
// si fecha_reinicio_actividades es posterior a la más reciente de esas dos.
function ceseMasReciente(c: AnyRecord): Date | null {
  const cancelacion = parseFecha(c.fecha_cancelacion);
  const suspension = parseFecha(c.fecha_suspension_definitiva);
  return [cancelacion, suspension].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

// Tipo del cese más reciente — SRI distingue "cancelación" (puede ser
// un trámite ordinario, ej. cambio de régimen) de "suspensión
// definitiva" (case real: cédula 0501578256, fecha_cancelacion Y
// fecha_suspension_definitiva coinciden en 2021/09/30 con
// observ_solicitud_suspension="CESE DE ACTIVIDADES") — se prioriza la
// etiqueta "suspension_definitiva" cuando esa fecha coincide con el
// cese resuelto (incluye el caso de empate). Informativo para
// marco-interpretativo.ts, no cambia estadoActividadEconomica.
function tipoUltimoCese(c: AnyRecord): "cancelacion" | "suspension_definitiva" | null {
  const cese = ceseMasReciente(c);
  if (!cese) return null;
  const suspension = parseFecha(c.fecha_suspension_definitiva);
  return suspension && suspension.getTime() === cese.getTime() ? "suspension_definitiva" : "cancelacion";
}

function rucRegistroActivo(c: AnyRecord): boolean {
  if (!c.ruc || !c.fecha_inscripcion_ruc) return false;
  const cese = ceseMasReciente(c);
  if (!cese) return true;
  const reinicio = parseFecha(c.fecha_reinicio_actividades);
  return Boolean(reinicio && reinicio.getTime() > cese.getTime());
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function arr(multi: AnyRecord | null | undefined, recurso: string, campo: string): AnyRecord[] {
  const v = (multi?.[recurso] as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const items = v?.[campo];
  return Array.isArray(items) ? (items as AnyRecord[]) : [];
}

// Status del recurso puntual (BlockResult.status) — a diferencia de
// arr()/obj(), que solo miran si HAY registros, esto distingue "el
// recurso se consultó bien y no trajo nada" (status "ok", 0 registros
// reales) de "el recurso falló/no trajo datos" (status "faltante"/
// "error"/"deshabilitado") — necesario para no confundir "confirmado
// que NO aplica" con "no lo sabemos" (ver seguridadSocial más abajo).
function estadoRecurso(multi: AnyRecord | null | undefined, recurso: string): string | undefined {
  return (multi?.[recurso] as AnyRecord | undefined)?.status as string | undefined;
}

function obj(multi: AnyRecord | null | undefined, recurso: string, campo: string): AnyRecord | null {
  const v = (multi?.[recurso] as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const val = v?.[campo];
  return val && typeof val === "object" && !Array.isArray(val) ? (val as AnyRecord) : null;
}

// Unión deduplicada de las 3 listas de palabras clave del pedido de negocio.
const PALABRAS_CLAVE_PROBLEMA_CREDITICIO = [
  "COBRO DE PAGARÉ A LA ORDEN", "PAGARÉ", "PAGARE", "COBRO DE DINERO", "PAGO DE DINERO",
  "COBRO DE CHEQUE", "CHEQUE", "CHEQUE PRESENTADO AL COBRO FUERA DE PLAZO",
  "COBRO DE LETRA DE CAMBIO", "LETRA DE CAMBIO", "CONTRATO DE MUTUO", "PRÉSTAMO", "PRESTAMO",
  "OBLIGACIONES", "OBLIGACIÓN", "OBLIGACIONES MONETARIAS", "FACTURAS O DOCUMENTOS", "DOCUMENTOS",
  "COBRO DE FACTURAS", "CONCURSO DE ACREEDORES", "ACREEDOR", "EJECUCIÓN DE ACTA DE MEDIACIÓN",
  "EJECUCIÓN DE ACTA DE TRANSACCIÓN", "TRANSACCIÓN", "ACTA DE MEDIACIÓN", "TÍTULO EJECUTIVO",
  "EJECUCIÓN", "COBRO", "JUICIO EJECUTIVO", "PROCESO EJECUTIVO", "VÍA EJECUTIVA",
  "PROCEDIMIENTO EJECUTIVO", "MANDAMIENTO DE EJECUCIÓN", "LIQUIDACIÓN", "APREMIO",
  "INCUMPLIMIENTO", "MORA", "MOROSIDAD", "DEUDA", "OBLIGACIÓN VENCIDA", "OBLIGACIÓN EXIGIBLE",
  "COBRO JUDICIAL", "RECUPERACIÓN DE CARTERA", "CARTERA VENCIDA", "TÍTULO VALOR", "FACTURA",
  "FACTURA COMERCIAL", "FACTURA NEGOCIABLE", "MUTUO", "CONTRATO DE PRÉSTAMO",
  "RECONOCIMIENTO DE DEUDA", "CONVENIO DE PAGO", "DOCUMENTO PRIVADO", "DOCUMENTO RECONOCIDO",
  "GARANTÍA", "FIANZA", "AVAL", "HIPOTECA", "PRENDA",
].map((s) => s.toUpperCase());

function esDemandaProblemaCrediticio(delito: unknown): boolean {
  if (!delito) return false;
  const up = String(delito).toUpperCase();
  return PALABRAS_CLAVE_PROBLEMA_CREDITICIO.some((kw) => up.includes(kw));
}

// pn_supa/pn_supa/novadata (pensión alimenticia): el nombre completo
// viene en 2 órdenes de palabras distintos según la fuente
// (pn_inf_basica: "Apellido1 Apellido2 Nombre1 Nombre2"; pn_supa:
// "Nombre1 Nombre2 Apellido1 Apellido2") — se compara por conjunto de
// palabras, no por igualdad textual.
function mismoNombre(a: unknown, b: unknown): boolean {
  const normalizar = (s: unknown) =>
    String(s ?? "").toUpperCase().trim().split(/\s+/).filter(Boolean).sort().join(" ");
  const na = normalizar(a);
  const nb = normalizar(b);
  return na !== "" && na === nb;
}

// ¿El empleador lleva el apellido del cliente? Señal de empleo en
// negocio familiar, que no es mala por sí sola pero SÍ cambia cuánto
// vale el ingreso reportado como evidencia: un rol de pagos que firma
// un pariente se verifica distinto que uno de un tercero.
//
// Se calcula acá y no se deja al criterio del LLM a propósito. Es una
// comparación de texto, y el modelo dejó de hacerla: hasta marco-v8 la
// mencionaba solo, después no volvió a aparecer en ningún análisis (44
// análisis seguidos sin una sola mención). A medida que el marco se
// volvió más prescriptivo, el modelo dejó de mirar lo que el marco no
// le nombra.
//
// nombreCompleto de pn_inf_basica viene "Apellido1 Apellido2 Nombre1
// Nombre2", así que los apellidos son las 2 primeras palabras. Se
// exigen 4+ letras para no disparar con partículas ("DE", "DEL") y se
// busca palabra completa dentro del nombre del empleador.
//
// OJO: da falsos positivos con apellidos frecuentes en razones sociales
// ("COMERCIAL PEREZ CIA. LTDA."). Por eso es informativo y el marco lo
// trata como matiz sobre la verificabilidad del ingreso, nunca como
// penalización automática.
// Validando contra los 41 clientes reales cacheados aparecieron 2 casos
// que la primera versión marcaba mal:
//   - El cliente figura como su PROPIO empleador (nombre completo igual
//     al del patrono): eso es trabajo por cuenta propia, no un negocio
//     familiar. Se separa en su propio campo.
//   - Los nombres vienen con la Ñ corrompida en algunos registros de la
//     fuente ("PICHUCHO MU?OZ"), así que la comparación no puede exigir
//     igualdad exacta de todas las palabras.
function relacionConEmpleador(
  nombreEmpleador: unknown,
  nombreCliente: unknown
): { esElMismoCliente: boolean; comparteApellido: boolean } | null {
  const limpiar = (s: unknown) =>
    String(s ?? "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // tildes
      .replace(/[^A-Z\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  const empleador = limpiar(nombreEmpleador);
  const cliente = limpiar(nombreCliente);
  if (empleador.length === 0 || cliente.length < 3) return null;

  // "Apellido1 Apellido2 Nombre1 Nombre2" (formato de pn_inf_basica).
  const apellidos = cliente.slice(0, 2).filter((a) => a.length >= 4);
  const nombres = cliente.slice(2).filter((n) => n.length >= 4);
  if (apellidos.length === 0) return null;

  const comparteApellido = apellidos.some((apellido) => empleador.includes(apellido));
  // Es la misma persona si además aparecen TODOS sus nombres de pila:
  // un pariente comparte apellidos pero no se llama igual.
  const esElMismoCliente = comparteApellido && nombres.length > 0 && nombres.every((n) => empleador.includes(n));

  return { esElMismoCliente, comparteApellido: comparteApellido && !esElMismoCliente };
}

// pn_supa/novadata trae representanteLegal (representa a quien RECIBE
// la pensión) y obligadoPrincipal (quien DEBE pagarla) como 2 personas
// DISTINTAS. BUG real encontrado auditando el reporte del usuario
// (cédula 0501578256): el código anterior marcaba pensionAlimenticiaEnMora
// para CUALQUIER registro de pn_supa donde apareciera el cliente, sin
// mirar su rol — ahí representanteLegal="MONICA JANETH PICHUCHO PEREZ"
// (la cliente) y obligadoPrincipal="ENRIQUE XAVIER CORNEJO ALBAN" (otra
// persona), con totalDeuda=$2866.63: la deuda es de Cornejo Alban, no
// de la cliente, que en este caso es a quien LE DEBEN. Auditando los 40
// clientes de la muestra: 6 de 12 casos con pensionAlimenticiaEnMora=true
// eran en realidad este mismo error (cliente = representanteLegal, no
// obligado) — no es un caso aislado.
// pn_supa (sin /novadata) NO trae obligadoPrincipal, solo
// representanteLegal — si el cliente coincide con ese campo, por
// eliminación NO es el obligado (son los únicos 2 roles del registro);
// si no coincide con ninguno de los 2 campos conocidos, no se penaliza
// por datos faltantes (mismo criterio que numeroDenunciasComoSospechoso
// en riesgoPenal).
function esClienteObligadoSupa(p: AnyRecord, nombreCliente: string | null): boolean {
  if (p.obligadoPrincipal) return mismoNombre(p.obligadoPrincipal, nombreCliente);
  if (mismoNombre(p.representanteLegal, nombreCliente)) return false;
  return false;
}

// Delitos de seguridad ciudadana (lavado de activos, narcotráfico/
// tráfico de sustancias, trata de personas, tenencia/porte de armas,
// extorsión, delincuencia organizada, asociación ilícita, asesinato/
// homicidio intencional) — mismo tratamiento que las listas de
// sanciones: control de bloqueo duro (ver controles-bloqueo.ts), no un
// juicio del LLM, a pedido explícito del usuario (son "los principales
// problemas de seguridad del Ecuador" hoy). Se revisan demandas
// (funcion_judicial), denuncias y descripción de antecedentes penales
// (fiscalía). Expuesto también como grupo propio del profile — ver
// riesgoSeguridadCiudadana más abajo.
//
// *** SIN VALIDAR CONTRA CASOS REALES *** salvo lavado de activos,
// extorsión, tenencia de armas, delincuencia organizada, asociación
// ilícita y asesinato/homicidio — confirmados con casos reales
// (cédulas 0704385103, 1204212029, 1309022935, 0927016063). Narco-
// tráfico/tráfico de sustancias y trata de personas siguen siendo
// terminología del COIP por conocimiento general — ajustar si aparece
// un caso real que no se detecta.
const CATEGORIAS_DELITO_GRAVE_SEGURIDAD: Array<{ categoria: string; palabrasClave: string[]; excluir?: string[] }> = [
  { categoria: "Lavado de activos", palabrasClave: ["LAVADO"] },
  {
    categoria: "Narcotráfico / tráfico de sustancias",
    palabrasClave: ["TRÁFICO ILÍCITO", "TRAFICO ILICITO", "SUSTANCIAS ESTUPEFACIENTES", "SUSTANCIAS CATALOGADAS", "NARCOTRÁFICO", "NARCOTRAFICO", "MICROTRÁFICO", "MICROTRAFICO", "MICRO TRÁFICO", "MICRO TRAFICO"],
  },
  { categoria: "Trata de personas", palabrasClave: ["TRATA DE PERSONAS", "TRATA DE BLANCAS"] },
  { categoria: "Tenencia/porte de armas", palabrasClave: ["TENENCIA Y PORTE DE ARMAS", "TENENCIA DE ARMAS", "PORTE DE ARMAS", "TRÁFICO DE ARMAS", "TRAFICO DE ARMAS"] },
  { categoria: "Extorsión", palabrasClave: ["EXTORSIÓN", "EXTORSION"] },
  { categoria: "Delincuencia organizada", palabrasClave: ["DELINCUENCIA ORGANIZADA"] },
  { categoria: "Asociación ilícita", palabrasClave: ["ASOCIACIÓN ILÍCITA", "ASOCIACION ILICITA"] },
  // HOMICIDIO a secas también matchea "homicidio culposo"/"preterin-
  // tencional" (COIP Art. 145-147: negligente, ej. accidente de
  // tránsito con muerte) — severidad y perfil de riesgo muy distintos
  // a un homicidio intencional. Se excluyen explícitamente.
  {
    categoria: "Asesinato / homicidio intencional",
    palabrasClave: ["ASESINATO", "HOMICIDIO"],
    excluir: ["CULPOSO", "PRETERINTENCIONAL"],
  },
].map((c) => ({ categoria: c.categoria, palabrasClave: c.palabrasClave.map((k) => k.toUpperCase()), excluir: c.excluir?.map((k) => k.toUpperCase()) }));

function categoriasDelitoGraveSeguridad(texto: unknown): string[] {
  if (!texto) return [];
  const up = String(texto).toUpperCase();
  return CATEGORIAS_DELITO_GRAVE_SEGURIDAD.filter(
    (c) => c.palabrasClave.some((kw) => up.includes(kw)) && !(c.excluir ?? []).some((kw) => up.includes(kw))
  ).map((c) => c.categoria);
}

// Versión de esta capa de procesamiento — se guarda en
// client_profiles.structure_version para saber con qué lógica se armó
// cada perfil. Vive acá (y no en quien lo persiste) para que
// structure-client y analyze-client no puedan discrepar.
export const PROCESS_VERSION = "estructura-v2"; // ver docs/estructura-estandarizada.md

export function buildStandardProfile(raw: RawNovadataResponse, cedula: string): { profile: StandardClientProfile; blockStatus: BlockStatusMap; duracionFuentesMs: number } {
  const g = raw.general?.data as AnyRecord | undefined;
  const persona = g?.personaNatural as AnyRecord | undefined;
  const socio = raw.sociodemografica?.data as unknown as AnyRecord | null;
  const trabajo = raw.trabajo?.data as unknown as AnyRecord | null;
  const iess = raw.iess?.data as unknown as AnyRecord | null;
  const vehiculosData = raw.vehiculos?.data as unknown as AnyRecord | null;
  const judicial = raw.funcion_judicial?.data as unknown as AnyRecord | null;
  const fiscalia = raw.fiscalia?.data as unknown as AnyRecord | null;
  const bancos = raw.bancos?.data as unknown as AnyRecord | null;
  const cooperativas = raw.cooperativas?.data as unknown as AnyRecord | null;

  const basesInternas = obj(bancos, "basesInternas", "__never__") ?? ((bancos?.basesInternas as AnyRecord | undefined)?.data as AnyRecord | undefined) ?? null;
  const biWrap = { x: { data: basesInternas } } as unknown as AnyRecord;
  const personasIncump = (arr(biWrap, "x", "personasIncumplimientos")[0] as AnyRecord | undefined) ?? null;
  const tiess = arr(biWrap, "x", "tiess");
  const tcredQ = arr(biWrap, "x", "tcredQuirografarios");
  const tcredH = arr(biWrap, "x", "tcredHipotecarios");

  // ---- identidad ----
  const nacionalidad0 = (g?.nacionalidades as AnyRecord[] | undefined)?.[0]?.pais as AnyRecord | undefined;
  const conyuge = g?.personaNaturalConyuge as AnyRecord | undefined;
  const conyugePersona = conyuge?.personaConyuge as AnyRecord | undefined;
  const tieneConyugeActual = Boolean(conyugePersona?.nombre);
  // Se mide aparte de la duración total del perfil: duracion_ms está
  // dominada por la ingesta (~27s) y taparía cualquier degradación de
  // este módulo, que corre en milisegundos.
  const inicioFuentes = Date.now();
  const fuentesIngreso = analizarFuentesIngreso(raw, (persona?.nombre as string) ?? null);
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
  };

  // ---- contacto ----
  const direcciones = arr(socio, "direcciones", "direcciones");
  const telefonos = arr(socio, "telefonos", "telefonos");
  const correos = arr(socio, "correo", "correos");
  const contacto: StandardClientProfile["contacto"] = {
    numeroDirecciones: direcciones.length,
    numeroTelefonos: telefonos.length,
    numeroCorreos: correos.length,
    direccionActualizada12M: direcciones.some((d) => dentroUltimos12Meses((d.direccion as AnyRecord | undefined)?.fechaActualizacion)),
    telefonoActualizado12M: telefonos.some((t) => dentroUltimos12Meses((t.telefono as AnyRecord | undefined)?.fechaActualizacion)),
    correoActualizado12M: correos.some((c) => dentroUltimos12Meses(c.fechaActualizacion)),
  };

  // ---- familia ----
  const hijos = arr(socio, "hijos", "personasNatural");
  const padres = arr(socio, "padres", "personasNatural");
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
  const empleados = arr(trabajo, "empleados", "empleados");
  const empleadosIdsUnicos = new Set(empleados.map((e) => e.ci).filter(Boolean));
  const contribuyenteRegistros = arr(trabajo, "contribuyente", "datosContribuyente");
  // establecimientoActEconomica: SÍ trae detalle por establecimiento
  // (num_establecimiento, estado_establecimiento ABIERTO/CERRADO) — una
  // persona puede tener el RUC activo con un establecimiento abierto y
  // otro cerrado. Ojo: sus fechas (fech_inscripcion, fech_cierre, etc.)
  // vienen en formato DD/MM/YYYY — "08/03/2016" con `new Date(...)` se
  // interpreta como MM/DD (ambiguo), NO se usan acá por eso, solo el
  // conteo por estado_establecimiento.
  const establecimientos = arr(trabajo, "establecimientoActEconomica", "datosEstablecimientoActEco");
  const numeroEstablecimientosActivos = establecimientos.filter((e) => String(e.estado_establecimiento ?? "").toUpperCase() === "ABIERTO").length;
  const numeroEstablecimientosInactivos = establecimientos.length - numeroEstablecimientosActivos;
  // tieneEstablecimientoActivo: fuente correcta es contribuyente (RUC),
  // NO establecimientoActEconomica — ver rucRegistroActivo().
  const tieneEstablecimientoActivo = contribuyenteRegistros.some(rucRegistroActivo);
  // Registro RUC de referencia para las fechas expuestas: el activo si
  // hay uno, si no el primero disponible (persona natural normalmente
  // tiene un solo registro, pero Novadata devuelve un array).
  const rucReferencia = (contribuyenteRegistros.find(rucRegistroActivo) as AnyRecord | undefined) ?? (contribuyenteRegistros[0] as AnyRecord | undefined) ?? null;
  // Estado y antigüedad de la actividad económica: Novadata/SRI solo
  // guardan la fecha del cese MÁS RECIENTE y la del reinicio MÁS
  // RECIENTE, no un historial completo de ciclos — por eso "16 años
  // desde el inicio" puede ser engañoso si la persona reinició y volvió
  // a cesar (caso real: cédula 0502932429, inicio 2009, reinicio 2014,
  // cese 2018 — el reinicio es ANTERIOR al cese más reciente, o sea
  // hoy está INACTIVA hace ~8 años, no "activa hace 16"). 5 casos:
  //   1. Sin RUC -> "sin_ruc".
  //   2. Sin cese registrado -> activa desde el inicio.
  //   3. Cese sin reinicio nunca -> inactiva, nunca reactivada; la
  //      etapa activa (única) duró inicio..cese.
  //   4. Cese + reinicio POSTERIOR al cese -> activa (reactivada); solo
  //      podemos medir la antigüedad de la racha actual (reinicio..hoy)
  //      — no existe dato de cuánto duró la etapa activa anterior al
  //      cese, no se debe inventar.
  //   5. Cese + reinicio ANTERIOR o igual al cese (el caso real de
  //      arriba) -> inactiva tras una reactivación; la última etapa
  //      activa duró reinicio..cese.
  const inicioActividad = parseFecha(rucReferencia?.fecha_inicio_actividades);
  const ceseActividad = rucReferencia ? ceseMasReciente(rucReferencia) : null;
  const reinicioActividad = parseFecha(rucReferencia?.fecha_reinicio_actividades);
  const ahoraActividad = new Date();
  let estadoActividadEconomica: StandardClientProfile["laboral"]["estadoActividadEconomica"] = null;
  let antiguedadUltimaEtapaActivaMeses: number | null = null;
  let mesesInactivoActividadEconomica: number | null = null;
  if (!rucReferencia?.ruc) {
    estadoActividadEconomica = "sin_ruc";
  } else if (!ceseActividad) {
    estadoActividadEconomica = "activa_sin_interrupciones";
    antiguedadUltimaEtapaActivaMeses = inicioActividad ? mesesEntreFechas(inicioActividad, ahoraActividad) : null;
  } else if (reinicioActividad && reinicioActividad > ceseActividad) {
    estadoActividadEconomica = "activa_reactivada";
    antiguedadUltimaEtapaActivaMeses = mesesEntreFechas(reinicioActividad, ahoraActividad);
  } else {
    const inicioUltimaEtapa = reinicioActividad ?? inicioActividad;
    estadoActividadEconomica = reinicioActividad ? "inactiva_tras_reactivacion" : "inactiva_nunca_reactivada";
    antiguedadUltimaEtapaActivaMeses = inicioUltimaEtapa ? mesesEntreFechas(inicioUltimaEtapa, ceseActividad) : null;
    mesesInactivoActividadEconomica = mesesEntreFechas(ceseActividad, ahoraActividad);
  }
  const cumplimientoAfiliaciones = arr(trabajo, "cumplimientoPatronal", "afiliaciones");
  const obligacionesEnMora = cumplimientoAfiliaciones.some((a) => {
    const t = String(a.obligaciones ?? "").toUpperCase();
    if (!t) return false;
    return !(t.includes("NO REGISTRA") || t.startsWith("NO "));
  });
  // empleoActual: fuente correcta es trabajoHistoricosMecanizado (trae
  // baseDate "YYYY-MM", la fecha real de actualización del registro
  // mensual de IESS) — basesInternas.tiess NO tiene baseDate. Se
  // descarta si el registro más reciente disponible tiene más de 3
  // meses (frecuencia máxima de actualización de estos datos).
  const baseDateTs = (r: AnyRecord): number => parseFecha(r.baseDate ? `${r.baseDate}-01` : null)?.getTime() ?? 0;
  const mecanizado = arr(trabajo, "trabajoHistoricosMecanizado", "mecanizadoEmpleados");
  const mecanizadoOrdenado = [...mecanizado].sort((a, b) => baseDateTs(b) - baseDateTs(a));
  const ultimoMecanizado = (mecanizadoOrdenado[0] as AnyRecord | undefined) ?? null;
  const empleoActualConfiable = Boolean(ultimoMecanizado) && dentroUltimos3Meses(ultimoMecanizado?.baseDate ? `${ultimoMecanizado.baseDate}-01` : null);
  const relacionEmpleador = relacionConEmpleador(
    ((ultimoMecanizado?.personaPatrono as AnyRecord | undefined)?.nombreComercial as string) ??
      ((ultimoMecanizado?.personaPatrono as AnyRecord | undefined)?.nombre as string) ??
      null,
    (persona?.nombre as string) ?? null
  );
  // Antigüedad laboral: fuente es tiess (trae fecIng/fecSal), NO
  // trabajoHistoricosMecanizado (fuente de empleoActual arriba) — son
  // 2 recursos independientes que pueden diferir levemente en el
  // nombre del empleador (ej. "S. A." vs "S.A."), por diseño no se
  // cruzan entre sí. "Actual" = fecSal vacío, tomando el snapshot con
  // (anio,mes) más reciente. Solo se reporta la antigüedad si hay al
  // menos 3 snapshots mensuales confirmados para ese fecIng — un
  // empleo que recién aparece (1-2 meses) puede no ser estable
  // todavía, mejor no reportar un número que dé falsa confianza.
  //
  // "Último snapshot confirmado" por registro/grupo — tiess trae un
  // snapshot MENSUAL, no un rango; fecSal vacío solo dice "Novadata
  // nunca vio una salida registrada", NO "sigue activo hoy" (mismo
  // hueco de dato que afiliacionIess/estadoAfiliacionIess más abajo).
  // BUG real corregido acá (cédula 0501578256, validado contra el
  // mecanizado del IESS): el único empleo de esta persona tiene su
  // último snapshot en 2021-11 (~4 años atrás) con fecSal vacío --
  // numeroEmpleadoresUltimos24Meses/antiguedadEmpleoActualMeses/
  // duracionEmpleoMasLargoMeses usaban `ahoraActividad` (hoy) como fin
  // en ese caso, dando antigüedad "actual" de 6 años 5 meses para un
  // empleo que en realidad no hay evidencia de que continúe desde
  // hace años. Se usa el (anio,mes) del snapshot en vez de "hoy" como
  // referencia de "hasta cuándo hay evidencia real" en los 3 campos.
  const anioMesA0 = (t: AnyRecord): number | null => {
    const anio = num(t.anio);
    const mes = num(t.mes);
    return anio !== null && mes !== null ? anio * 12 + (mes - 1) : null;
  };
  const fechaDeAnioMesA0 = (anioMesA0Val: number): Date => new Date(Math.floor(anioMesA0Val / 12), anioMesA0Val % 12, 1);
  const mesesDesdeUltimaEvidenciaActiva = (t: AnyRecord): number | null => {
    const fecSal = String(t.fecSal ?? "").trim();
    if (fecSal) return mesesDesdeDDMMYYYY(fecSal);
    const a0 = anioMesA0(t);
    return a0 !== null ? mesesEntreFechas(fechaDeAnioMesA0(a0), ahoraActividad) : null;
  };
  const tiessActivos = tiess.filter((t) => !String(t.fecSal ?? "").trim());
  const tiessActivoMasReciente = [...tiessActivos].sort((a, b) => (anioMesA0(b) ?? -Infinity) - (anioMesA0(a) ?? -Infinity))[0] as
    | AnyRecord
    | undefined;
  const fecIngEmpleoActual = tiessActivoMasReciente ? parseFechaDDMMYYYY(tiessActivoMasReciente.fecIng) : null;
  const snapshotsEmpleoActual = tiessActivoMasReciente
    ? tiess.filter((t) => t.fecIng === tiessActivoMasReciente.fecIng && t.nomEmp === tiessActivoMasReciente.nomEmp).length
    : 0;
  // "Actual" además exige que el snapshot más reciente de ESE empleo
  // sea confiable (mismo umbral de 3 meses que empleoActualConfiable
  // arriba) — si el último dato que tenemos es de hace años, no se
  // puede afirmar que sigue siendo el empleo ACTUAL de la persona.
  const antiguedadEmpleoActualConfiable =
    tiessActivoMasReciente !== undefined && (mesesDesdeUltimaEvidenciaActiva(tiessActivoMasReciente) ?? Infinity) <= 3;
  const antiguedadEmpleoActualMeses =
    fecIngEmpleoActual && snapshotsEmpleoActual >= 3 && antiguedadEmpleoActualConfiable
      ? mesesEntreFechas(fecIngEmpleoActual, ahoraActividad)
      : null;
  // Empleo más largo registrado (histórico, incluye el actual si es el
  // más largo) — señal de estabilidad aparte de la antigüedad actual:
  // alguien con un empleo corto hoy pero años de tenencias largas es
  // más estable que alguien que salta de trabajo en trabajo.
  const empleosUnicos = new Map<string, { fecIng: unknown; fecSal: unknown; ultimoAnioMesA0: number | null }>();
  for (const t of tiess) {
    const clave = `${t.nomEmp}|${t.fecIng}|${t.fecSal}`;
    const a0 = anioMesA0(t);
    const existente = empleosUnicos.get(clave);
    if (!existente) {
      empleosUnicos.set(clave, { fecIng: t.fecIng, fecSal: t.fecSal, ultimoAnioMesA0: a0 });
    } else if (a0 !== null && (existente.ultimoAnioMesA0 === null || a0 > existente.ultimoAnioMesA0)) {
      existente.ultimoAnioMesA0 = a0;
    }
  }
  const duracionEmpleoMasLargoMeses = [...empleosUnicos.values()].reduce((maxMeses: number | null, e) => {
    const inicio = parseFechaDDMMYYYY(e.fecIng);
    if (!inicio) return maxMeses;
    const finStr = String(e.fecSal ?? "").trim();
    // Sin fecha de salida: el fin es el ÚLTIMO snapshot confirmado de
    // ese empleo, no "hoy" — ver nota arriba (si el empleo sigue
    // activo de verdad, ese último snapshot ES el mes actual o uno muy
    // reciente, así que no pierde precisión en ese caso).
    const fin = finStr ? parseFechaDDMMYYYY(finStr) : e.ultimoAnioMesA0 !== null ? fechaDeAnioMesA0(e.ultimoAnioMesA0) : null;
    if (!fin) return maxMeses;
    const duracion = mesesEntreFechas(inicio, fin);
    return maxMeses === null || duracion > maxMeses ? duracion : maxMeses;
  }, null);
  const laboral: StandardClientProfile["laboral"] = {
    empleoActual: empleoActualConfiable
      ? {
          empleador:
            ((ultimoMecanizado?.personaPatrono as AnyRecord | undefined)?.nombreComercial as string) ??
            ((ultimoMecanizado?.personaPatrono as AnyRecord | undefined)?.nombre as string) ??
            null,
          cargo: ((ultimoMecanizado?.cargo as AnyRecord | undefined)?.nombre as string) ?? null,
          salarioAprox: num((ultimoMecanizado?.personaIngreso as AnyRecord | undefined)?.valor),
        }
      : null,
    // Solo tiene sentido si HAY empleo actual confiable: si no, se
    // estaría describiendo a un empleador que ya no existe (la primera
    // versión lo marcaba igual y daba 4 falsos positivos sobre 41).
    empleadorConApellidoDelCliente: empleoActualConfiable ? (relacionEmpleador?.comparteApellido ?? null) : null,
    clienteEsSuPropioEmpleador: empleoActualConfiable ? (relacionEmpleador?.esElMismoCliente ?? null) : null,
    // Empleadores con evidencia de actividad en algún momento de los
    // últimos 24 meses — NO "empleadores que iniciaron en los últimos
    // 24 meses" (bug de semántica de una versión muy anterior: un
    // empleo estable de años daba 0, igual que un cliente sin empleo
    // hace 2 años). fecSal vacío YA NO se trata como "sigue activo
    // hoy" sin más (bug real corregido junto con antiguedadEmpleoActualMeses
    // arriba, mismo caso 0501578256) — se usa mesesDesdeUltimaEvidenciaActiva,
    // que para fecSal vacío mira el (anio,mes) real del snapshot.
    numeroEmpleadoresUltimos24Meses: new Set(
      tiess
        .filter((t) => {
          const m = mesesDesdeUltimaEvidenciaActiva(t);
          return m !== null && m <= 24;
        })
        .map((t) => t.nomEmp)
    ).size,
    // Se suma POR MES y recién después se promedian los meses. Antes se
    // tomaban los 6 registros más recientes y se promediaban sin más —
    // pero quien tiene 2 empleos simultáneos tiene 2 registros por mes,
    // así que esos 6 registros eran 3 meses y el promedio daba la MITAD
    // de su ingreso real. Bug confirmado sobre la muestra: 4 personas
    // afectadas, 2 de ellas con el ingreso reportado exactamente a la
    // mitad (cédulas 0105712012 y 0922854674).
    ingresoPromedioUltimos6Meses: (() => {
      const porMes = new Map<string, number>();
      for (const t of mecanizadoOrdenado) {
        const mes = String((t as AnyRecord).baseDate ?? "");
        const valor = num((t.personaIngreso as AnyRecord | undefined)?.valor);
        if (!mes || valor === null) continue;
        porMes.set(mes, (porMes.get(mes) ?? 0) + valor);
      }
      const ultimos6 = [...porMes.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 6)
        .map(([, total]) => total);
      return ultimos6.length ? Math.round((ultimos6.reduce((a, b) => a + b, 0) / ultimos6.length) * 100) / 100 : null;
    })(),
    esEmpleadorOAdministrador: empleados.length > 0 || arr(trabajo, "administraciones", "administraciones").length > 0,
    // tieneRucActivo antes leía .obligado ("obligado a llevar
    // contabilidad" — NO tiene relación con el estado del RUC, casi
    // siempre "NO" para personas naturales de régimen general, así que
    // este campo daba false casi siempre). Corregido para usar la misma
    // fuente/lógica que tieneEstablecimientoActivo (rucRegistroActivo) —
    // validado contra SRI real, cédulas 0502937691 (activo) y
    // 0502937675 (suspendido).
    tieneRucActivo: tieneEstablecimientoActivo,
    tieneEstablecimientoActivo,
    esIndependiente: tieneEstablecimientoActivo,
    numeroEmpleadosRegistrados: empleadosIdsUnicos.size,
    tipoEmpleador: (empleados[0]?.tipEmp as string) ?? null,
    obligacionesPatronalesEnMora: cumplimientoAfiliaciones.length > 0 ? obligacionesEnMora : null,
    fechaInicioActividadesRuc: formatFechaISO(parseFecha(rucReferencia?.fecha_inicio_actividades)),
    fechaCeseActividadesRuc: rucReferencia ? formatFechaISO(ceseMasReciente(rucReferencia)) : null,
    fechaReinicioActividadesRuc: formatFechaISO(parseFecha(rucReferencia?.fecha_reinicio_actividades)),
    numeroEstablecimientosActivos,
    numeroEstablecimientosInactivos,
    tieneEstablecimientosRegistrados: establecimientos.length > 0,
    estadoActividadEconomica,
    antiguedadUltimaEtapaActivaMeses,
    mesesInactivoActividadEconomica,
    tipoUltimoCeseRuc: rucReferencia ? tipoUltimoCese(rucReferencia) : null,
    antiguedadEmpleoActualMeses,
    duracionEmpleoMasLargoMeses,
  };

  // ---- tributario (SRI) ----
  const sriDataRaw = arr(trabajo, "sriImpuestoRenta", "data");
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
  // rucRegistroActivo) cuenta como "nunca tuvo RUC" => FALSE, no null.
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
  // BUG real (auditoría pedida por el usuario, cédulas 0502932429 y
  // 0501578256): pn_afiliacion_iess viene "faltante" (Novadata no pudo
  // traer datos de ESE recurso puntual) en 32 de los 40 clientes de la
  // muestra -- incluyendo personas con historial laboral extenso y real
  // en tiess/mecanizado. afiliadoIessActivo devolvía `false` en todos
  // esos casos, indistinguible de "se consultó bien y de verdad no está
  // afiliado" -- eso es lo que hacía que el LLM reportara una
  // "inconsistencia" (afiliación inactiva) contra un empleo real
  // confirmado por otras fuentes. Ahora es null cuando el recurso mismo
  // no trajo datos (estadoRecursoAfilIess !== "ok"), reservando
  // false/true para cuando SÍ se consultó y el estado real es conocido.
  const estadoRecursoAfilIess = estadoRecurso(iess, "afiliacionIess");
  const afilIess = (arr(iess, "afiliacionIess", "afiliacionIess")[0] as AnyRecord | undefined) ?? null;
  const seguridadSocial: StandardClientProfile["seguridadSocial"] = {
    afiliadoIessActivo:
      estadoRecursoAfilIess !== "ok" ? null : afilIess ? String(afilIess.estado ?? "").toUpperCase().startsWith("ACTIVO") : false,
    // esPensionista: hay que leer el campo .estado (booleano real) de
    // cada registro, no solo si el recurso trajo algún registro.
    esPensionista: arr(iess, "pensionista", "pensionista").some((p) => p.estado === true),
    esJubilado: arr(iess, "jubilados", "trabajos").length > 0,
    estadoAfiliacionIess: (afilIess?.estado as string) ?? null,
  };

  // ---- patrimonio ----
  const vehiculos = arr(vehiculosData, "vehiculos", "personaVehiculo");
  const sumVeh = (field: string) => vehiculos.reduce((s, v) => s + (num(v[field]) ?? 0), 0);
  // valorColateralVehiculos: para colaterales importa el valor más
  // aproximado a mercado ACTUAL, tomando por cada vehículo el máximo
  // entre sus distintas fuentes de precio (auditoría pedida por el
  // usuario — Novadata da varios precios por vehículo que no
  // coinciden: valorAvaluo usa depreciación lineal SRI y castiga fuerte
  // vehículos viejos, ej. $82 en una moto 2016). A propósito NO incluye
  // precioVenta: para vehículos viejos ese campo parece ser el precio
  // de lista cuando el vehículo era nuevo (ej. Nissan X-Trail 2010:
  // precioVenta=$29990 vs precioMaximo=$20500 de mercado actual),
  // incluirlo sobrestimaría el colateral. valorAvaluo SÍ se incluye en
  // el máximo (nunca es el más alto en la práctica, pero sirve de piso
  // para vehículos donde los campos de mercado vienen todos en 0).
  const CAMPOS_VALOR_VEHICULO = ["valorAvaluo", "precioPromedio", "precioMinimo", "precioMaximo", "precioComercial", "precioVentaPublico", "precioVentaPromedio"];
  const valorMaximoVehiculo = (v: AnyRecord): number => Math.max(0, ...CAMPOS_VALOR_VEHICULO.map((c) => num(v[c]) ?? 0));
  const patrimonio: StandardClientProfile["patrimonio"] = {
    numeroVehiculos: vehiculos.length,
    valorAvaluoVehiculos: sumVeh("valorAvaluo"),
    numeroInmuebles: arr(socio, "bienesInmueble", "bienesInmueble").length,
    numeroInversiones: arr(bancos, "inversiones", "inversiones").length,
    tieneVehiculos: vehiculos.length > 0,
    numeroAutos: vehiculos.filter((v) => v.tipoComercial === "autos").length,
    numeroVehiculosPesados: vehiculos.filter((v) => v.tipoComercial === "pesados").length,
    numeroMotos: vehiculos.filter((v) => v.tipoComercial === "motos").length,
    valorComercialTotalVehiculos: sumVeh("precioComercial"),
    valorVentaTotalVehiculos: sumVeh("precioVentaPublico"),
    valorPromedioTotalVehiculos: sumVeh("precioVentaPromedio"),
    valorColateralVehiculos: vehiculos.reduce((s, v) => s + valorMaximoVehiculo(v), 0),
  };

  // ---- comportamientoBancario ----
  // buró de crédito (antes "central de riesgos") — fuente Super/Diners.
  // peorCalificacionRiesgo/mejorCalificacionRiesgo: un cliente con 2+
  // operaciones puede tener calificaciones distintas (A1 mejor .. E
  // peor) — se exponen ambos extremos (ver nota en types.ts). El sort()
  // lexicográfico funciona porque el orden alfabético de las
  // calificaciones (A1,A2,A3,B1,B2,C1,C2,D,E) coincide con el orden de
  // severidad real.
  const buroCredito = [...arr(bancos, "buroCreditoSuper", "datosSuper"), ...arr(bancos, "buroCreditoDiners", "datosSuper")];
  const retails = arr(bancos, "retails", "retails");
  const creditosIess = [...tcredQ, ...tcredH];
  const calificacionesBuroCredito = buroCredito.map((r) => r.calificacion as string).filter(Boolean).sort();
  const comportamientoBancario: StandardClientProfile["comportamientoBancario"] = {
    numeroOperacionesBuroCredito: buroCredito.length,
    peorCalificacionRiesgo: calificacionesBuroCredito.at(-1) ?? null,
    mejorCalificacionRiesgo: calificacionesBuroCredito[0] ?? null,
    tieneOperacionConDemanda: buroCredito.some((r) => (num(r.judicial) ?? 0) > 0),
    tieneOperacionCastigada: buroCredito.some((r) => (num(r.castigo) ?? 0) > 0),
    saldoTotalVigente: buroCredito.reduce((s, r) => s + (num(r.saldoVigente) ?? 0), 0),
    // saldoVigente NO incluye lo que está en mora (son campos separados
    // en el recurso) — un cliente con una operación totalmente en
    // default podría mostrar saldoTotalVigente=0 sin esto. Se prioriza
    // saldomora (nombre coincide con el patrón monetario del resto del
    // recurso: saldoVigente, saldo0_1, etc.) sobre mora como respaldo.
    // Sin caso real en la muestra actual con valor >0 para confirmar la
    // forma exacta (calificaciones vistas: A1-B2, ninguna con mora).
    saldoEnMoraBuroCredito: buroCredito.reduce((s, r) => s + (num(r.saldomora) ?? num(r.mora) ?? 0), 0),
    numeroCreditosFormales: arr(bancos, "creditoHipotecario", "prestamos").length + arr(bancos, "creditoQuirografario", "prestamos").length,
    numeroDeudasRetail: retails.length,
    diasMoraMaximaRetail: retails.length ? Math.max(...retails.map((r) => num(r.diasMora) ?? 0)) : null,
    totalDeudaRetail: retails.reduce((s, r) => s + (num(r.totalDeuda) ?? 0), 0),
    tieneCreditoIessBiess: creditosIess.length > 0,
    diasMoraCreditoIessBiess: creditosIess.length ? Math.max(...creditosIess.map((c) => num(c.diasMoraAfi) ?? 0)) : null,
  };

  // ---- comportamientoCooperativas ----
  const coop = arr(cooperativas, "buroCreditoCoop", "datosSuper");
  // val_venc_1..11: buckets de antigüedad de lo vencido (a diferencia de
  // val_saldo_total, que es el saldo total sin distinguir cuánto está
  // realmente atrasado) — confirmado con caso real (cédula 0401592829,
  // 2 operaciones en cooperativas distintas con $928.39+$1353.12 en
  // buckets vencidos de un saldo total de $14,732.18).
  const CAMPOS_VENCIDO_COOP = Array.from({ length: 11 }, (_, i) => `val_venc_${i + 1}`);
  const comportamientoCooperativas: StandardClientProfile["comportamientoCooperativas"] = {
    numeroOperaciones: coop.length,
    diasMoraMaxima: coop.length ? Math.max(...coop.map((c) => num(c.num_dias_morosidad) ?? 0)) : null,
    saldoTotal: coop.reduce((s, c) => s + (num(c.val_saldo_total) ?? 0), 0),
    saldoEnMora: coop.reduce((s, c) => s + CAMPOS_VENCIDO_COOP.reduce((s2, campo) => s2 + (num(c[campo]) ?? 0), 0), 0),
    tieneOperacionConDemanda: coop.some((c) => (num(c.val_dem_judicial) ?? 0) > 0),
    tieneOperacionCastigada: coop.some((c) => (num(c.val_cart_castigada) ?? 0) > 0),
  };

  // ---- comportamientoInterno (grupo nuevo — scoring propio Novadata) ----
  const comportamientoInterno: StandardClientProfile["comportamientoInterno"] = {
    novadataResultadoHabitoPago: (personasIncump?.resultadoHabitoPago as string) ?? null,
    novadataPerfilInterno: (personasIncump?.perfilInterno as string) ?? null,
    novadataDiasMoraMaxima: num(personasIncump?.diasMoraMax),
    novadataDiasMoraVigente: num(personasIncump?.diasMoraVigentes),
    novadataSaldoCapitalVigente: num(personasIncump?.saldoCapital),
    esClienteInterno: Boolean(personasIncump?.identificacion),
  };

  // ---- transitoVehicular ----
  const licencia = (arr(vehiculosData, "licenciaConducir", "licencia")[0] as AnyRecord | undefined) ?? null;
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
  const fuentesTransito = [arr(bancos, "deudasAnt", "deudaAnts"), arr(bancos, "deudasAmt", "deudaAmt"), arr(bancos, "deudasEmov", "deudaEmov")];
  const numeroMultas = fuentesTransito.reduce(
    (total, registros) => total + registros.reduce((s, r) => s + (esResumenConInfracciones(r) ? (r.infraccion as unknown[]).length : 1), 0),
    0
  );
  const valorAdeudadoTransito = fuentesTransito.reduce(
    (total, registros) => total + registros.reduce((s, r) => s + (num(esResumenConInfracciones(r) ? r.valorAdeudado : r.total) ?? 0), 0),
    0
  );
  const transitoVehicular: StandardClientProfile["transitoVehicular"] = {
    tieneLicenciaVigente: Boolean(licencia),
    puntosLicencia: licencia ? num(licencia.puntos) : null,
    numeroMultas,
    valorAdeudadoTransito,
  };

  // ---- riesgoJudicialCrediticio / riesgoJudicialCivil ----
  // Separados a pedido del usuario: antes "riesgoJudicialCivil" mezclaba
  // demandas de cobro/pagarés/ejecuciones (señal de comportamiento de
  // pago, alto peso) con demandas civiles genéricas (laboral, familia,
  // tránsito, propiedad — contexto, bajo peso). demandaProblemaCrediticio
  // (booleano) se reemplaza por este split — ya no existe como campo.
  const demandas = arr(judicial, "demandas", "demandas");
  const demandasOfendido = arr(judicial, "demandasOfendido", "demandas");
  const pensionAliment = [...arr(judicial, "pensionAlimenticia", "supas"), ...arr(judicial, "pensionAlimenticiaNovadata", "supas")];
  // Solo cuenta como deuda/mora DEL CLIENTE la que le corresponde como
  // obligado — ver esClienteObligadoSupa arriba (bug real: cédula
  // 0501578256 aparecía en mora por una deuda de otra persona).
  const pensionAlimentComoObligado = pensionAliment.filter((p) => esClienteObligadoSupa(p, identidad.nombreCompleto));
  // tipoDemanda.descripcion es el ROL ("DEMANDADO", constante) — el tipo
  // de caso real vive en demanda.delito.
  const delitoDe = (d: AnyRecord): string | undefined => (d.demanda as AnyRecord | undefined)?.delito as string | undefined;
  const demandasCrediticias = demandas.filter((d) => esDemandaProblemaCrediticio(delitoDe(d)));
  const demandasCivilesResto = demandas.filter((d) => !esDemandaProblemaCrediticio(delitoDe(d)));
  const tiposUnicos = (ds: AnyRecord[]) => [...new Set(ds.map(delitoDe).filter((x): x is string => Boolean(x)))];
  const riesgoJudicialCrediticio: StandardClientProfile["riesgoJudicialCrediticio"] = {
    numeroDemandasComoDemandado: demandasCrediticias.length,
    tiposDemandasComoDemandado: tiposUnicos(demandasCrediticias),
  };
  const riesgoJudicialCivil: StandardClientProfile["riesgoJudicialCivil"] = {
    numeroDemandasComoDemandado: demandasCivilesResto.length,
    tiposDemandasComoDemandado: tiposUnicos(demandasCivilesResto),
    numeroDemandasComoOfendido: demandasOfendido.length,
    // Distingue "no tiene pensión alimenticia" de "tiene y está al
    // día": con solo pensionAlimenticiaEnMora=false los dos casos se
    // ven idénticos, y el modelo leyó el segundo donde había el
    // primero. Caso real reportado por el usuario sobre su propia
    // cédula (0502937675, sin un solo registro en pn_supa): el análisis
    // decía "no se conoce el monto de la pensión comprometida, solo que
    // está al día". Mismo tipo de error que numeroEmpleadoresUltimos24Meses
    // en v9 — un valor que significa dos cosas opuestas.
    tienePensionAlimenticia: pensionAlimentComoObligado.length > 0,
    pensionAlimenticiaEnMora: pensionAlimentComoObligado.some((p) => (num(p.totalDeuda) ?? 0) > 0),
    deudaPensionAlimenticia: pensionAlimentComoObligado.length
      ? Math.max(...pensionAlimentComoObligado.map((p) => num(p.totalDeuda) ?? 0))
      : null,
  };

  // ---- riesgoPenal ----
  const antecedentes = obj(fiscalia, "antecedentesPenales", "antecedentes");
  // denuncias[].detalleDenuncia lista a TODAS las partes (denunciante,
  // víctima, perjudicado, sospechoso) — hay que mirar el rol del propio
  // cliente en cada denuncia, igual que se hizo con
  // numeroDemandasComoDemandado/ComoOfendido en riesgoJudicialCivil. Ser
  // denunciante/víctima/perjudicado es SOLO CONTEXTO (no penaliza); ser
  // sospechoso sí. Si detalleDenuncia no trae la cédula del cliente (no
  // debería pasar, pero por si acaso), se trata como no-sospechoso por
  // default — no penalizar ante datos faltantes.
  const denuncias = arr(fiscalia, "denuncias", "denuncias");
  const esSospechosoEnDenuncia = (d: AnyRecord): boolean =>
    (Array.isArray(d.detalleDenuncia) ? (d.detalleDenuncia as AnyRecord[]) : []).some(
      (p) => p.cedula === cedula && String(p.estado ?? "").toUpperCase().includes("SOSPECHOSO")
    );
  const numeroDenunciasComoSospechoso = denuncias.filter(esSospechosoEnDenuncia).length;
  const riesgoPenal: StandardClientProfile["riesgoPenal"] = {
    tieneAntecedentesPenales: antecedentes ? antecedentes.descripcion !== "NO" : null,
    descripcionAntecedentes: antecedentes && antecedentes.descripcion !== "NO" ? (antecedentes.descripcion as string) : null,
    numeroDenunciasComoSospechoso,
    numeroDenunciasComoVictima: denuncias.length - numeroDenunciasComoSospechoso,
  };

  // ---- cumplimiento (control de bloqueo, informativo) ----
  // personaPublicasOpr/tpeps = PEP — se cuenta aparte de enListaControl,
  // ver controles-bloqueo.ts: no es señal de riesgo crediticio.
  // homonimosOpr/tconsephomonimos EXCLUIDOS a propósito: son otra persona
  // con el mismo nombre, cédula distinta — ver controles-bloqueo.ts,
  // código homonimo_en_lista_control (bug encontrado auditando cédulas
  // 1713210456/1714000419: la identificación del "homónimo" nunca
  // coincide con la del cliente consultado).
  const totalListasControl = ["ofacsOpr", "providenciasOpr"].reduce(
    (s, c) => s + arr(bancos, "listasControl", c).length,
    0
  );
  const totalHomonimos = arr(bancos, "listasControl", "homonimosOpr").length + arr(biWrap, "x", "tconsephomonimos").length;
  const totalPep = arr(bancos, "listasControl", "personaPublicasOpr").length + arr(biWrap, "x", "tpeps").length;
  const pepRegistros = [...arr(bancos, "listasControl", "personaPublicasOpr"), ...arr(biWrap, "x", "tpeps")];
  const pepMasReciente = [...pepRegistros].sort((a, b) => String(b.fecha ?? "").localeCompare(String(a.fecha ?? "")))[0] as AnyRecord | undefined;
  const detallePep = pepMasReciente
    ? {
        cargo: (pepMasReciente.cargo as string) ?? null,
        empresa: (pepMasReciente.empresa as string) ?? (pepMasReciente.empresaSector as string) ?? null,
        sueldo: num(pepMasReciente.sueldo),
        fecha: (pepMasReciente.fecha as string) ?? null,
      }
    : null;
  const sercopData = obj(fiscalia, "sercop", "data");
  // impedimentoCargosPublicos.data es un ARRAY (no un objeto como el
  // resto de recursos "singleton") — obj() lo rechazaba por tipo y
  // devolvía null siempre, así que este campo daba false/null sin
  // importar la realidad (bug encontrado auditando cédula 0502937691,
  // que SÍ tiene registraImpedimento=true real). Se agrega sobre todos
  // los elementos del array por si acaso viniera más de uno.
  const impedimentoRegistros = arr(judicial, "impedimentoCargosPublicos", "data");
  const impedimentoActivo = impedimentoRegistros.find((r) => r.registraImpedimento === true) ?? null;
  const cumplimiento: StandardClientProfile["cumplimiento"] = {
    enListaControl: totalListasControl > 0,
    tieneHomonimoEnListaControl: totalHomonimos > 0,
    enListaNegra: Boolean(((bancos?.listaNegra as AnyRecord | undefined)?.data as AnyRecord | undefined)?.listaNegra),
    impedimentoCargosPublicos: Boolean(impedimentoActivo),
    causalImpedimento: ((impedimentoActivo?.causales as AnyRecord[] | undefined)?.[0]?.causal as string) ?? null,
    registraSercopContraloria: Boolean(
      (((sercopData?.contraloria as AnyRecord | undefined)?.registros as unknown[] | undefined)?.length ?? 0) > 0 ||
        (((sercopData?.sercop as AnyRecord | undefined)?.registros as unknown[] | undefined)?.length ?? 0) > 0
    ),
    esPersonaExpuestaPoliticamente: totalPep > 0,
    detallePep,
  };

  // ---- riesgoSeguridadCiudadana (grupo propio, control de bloqueo duro) ----
  // Se revisan demandas (funcion_judicial), denuncias y la descripción
  // de antecedentes penales — ver controles-bloqueo.ts, donde esto
  // además fuerza el score a 1 (control de bloqueo duro, mismo trato
  // que listas de sanciones). Ver nota "SIN VALIDAR CONTRA CASOS
  // REALES" arriba.
  const categoriasSeguridad = new Set([
    ...demandas.flatMap((d) => categoriasDelitoGraveSeguridad(delitoDe(d))),
    ...denuncias.flatMap((d) => categoriasDelitoGraveSeguridad(d.delito)),
    ...categoriasDelitoGraveSeguridad(antecedentes?.descripcion),
  ]);
  const riesgoSeguridadCiudadana: StandardClientProfile["riesgoSeguridadCiudadana"] = {
    tieneDelitoSeguridadCiudadana: categoriasSeguridad.size > 0,
    categoriasDelitoSeguridadCiudadana: [...categoriasSeguridad],
  };

  const blockStatus: BlockStatusMap = {
    general: raw.general.status,
    sociodemografica: raw.sociodemografica.status,
    trabajo: raw.trabajo.status,
    iess: raw.iess.status,
    vehiculos: raw.vehiculos.status,
    funcion_judicial: raw.funcion_judicial.status,
    fiscalia: raw.fiscalia.status,
    bancos: raw.bancos.status,
    cooperativas: raw.cooperativas.status,
  };
  const entries = Object.entries(blockStatus) as [string, string][];
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
      ejesOk: entries.filter(([, v]) => v === "ok").map(([k]) => k),
      ejesFaltantes: entries.filter(([, v]) => v === "faltante").map(([k]) => k),
      ejesConError: entries.filter(([, v]) => v === "error").map(([k]) => k),
    },
  };

  return { profile, blockStatus, duracionFuentesMs };
}
