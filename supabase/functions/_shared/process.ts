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
// Conectada a analyze-client/llm-scoring desde framework-v1 — es la
// entrada real del LLM (ver interpretive-framework.ts).

import type { BlockStatusMap, RawNovadataResponse, StandardClientProfile } from "./types.ts";

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

function mesesDesde(fecha: unknown): number | null {
  const d = parseFecha(fecha);
  if (!d) return null;
  const ahora = new Date();
  return (ahora.getFullYear() - d.getFullYear()) * 12 + (ahora.getMonth() - d.getMonth());
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

function obj(multi: AnyRecord | null | undefined, recurso: string, campo: string): AnyRecord | null {
  const v = (multi?.[recurso] as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const val = v?.[campo];
  return val && typeof val === "object" && !Array.isArray(val) ? (val as AnyRecord) : null;
}

// Unión deduplicada de las 3 listas de palabras clave del pedido de negocio.
const KEYWORDS_PROBLEMA_CREDITICIO = [
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
  return KEYWORDS_PROBLEMA_CREDITICIO.some((kw) => up.includes(kw));
}

export function buildStandardProfile(raw: RawNovadataResponse, cedula: string): { profile: StandardClientProfile; blockStatus: BlockStatusMap } {
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
    // Nota: si la muestra de referencia tiene historial laboral
    // desactualizado frente a "hoy", esta ventana puede dar 0 seguido.
    numeroEmpleadoresUltimos24Meses: new Set(
      tiess.filter((t) => { const m = mesesDesde(t.fecIng); return m !== null && m <= 24; }).map((t) => t.nomEmp)
    ).size,
    ingresoPromedioUltimos6Meses: (() => {
      const ultimos6 = mecanizadoOrdenado
        .slice(0, 6)
        .map((t) => num((t.personaIngreso as AnyRecord | undefined)?.valor))
        .filter((n): n is number => n !== null);
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
  const afilIess = (arr(iess, "afiliacionIess", "afiliacionIess")[0] as AnyRecord | undefined) ?? null;
  const seguridadSocial: StandardClientProfile["seguridadSocial"] = {
    afiliadoIessActivo: afilIess ? String(afilIess.estado ?? "").toUpperCase().startsWith("ACTIVO") : false,
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
  const centralRiesgo = [...arr(bancos, "centralRiesgoSuper", "datosSuper"), ...arr(bancos, "centralRiesgoDiners", "datosSuper")];
  const retails = arr(bancos, "retails", "retails");
  const creditosIess = [...tcredQ, ...tcredH];
  const comportamientoBancario: StandardClientProfile["comportamientoBancario"] = {
    numeroOperacionesCentralRiesgo: centralRiesgo.length,
    peorCalificacionRiesgo: (centralRiesgo.map((r) => r.calificacion as string).filter(Boolean).sort().pop()) ?? null,
    tieneOperacionJudicializada: centralRiesgo.some((r) => (num(r.judicial) ?? 0) > 0),
    tieneOperacionCastigada: centralRiesgo.some((r) => (num(r.castigo) ?? 0) > 0),
    saldoTotalVigente: centralRiesgo.reduce((s, r) => s + (num(r.saldoVigente) ?? 0), 0),
    numeroCreditosFormales: arr(bancos, "creditoHipotecario", "prestamos").length + arr(bancos, "creditoQuirografario", "prestamos").length,
    numeroDeudasRetail: retails.length,
    diasMoraMaximaRetail: retails.length ? Math.max(...retails.map((r) => num(r.diasMora) ?? 0)) : null,
    totalDeudaRetail: retails.reduce((s, r) => s + (num(r.totalDeuda) ?? 0), 0),
    tieneCreditoIessBiess: creditosIess.length > 0,
    diasMoraCreditoIessBiess: creditosIess.length ? Math.max(...creditosIess.map((c) => num(c.diasMoraAfi) ?? 0)) : null,
  };

  // ---- comportamientoCooperativas ----
  const coop = arr(cooperativas, "centralRiesgoCoop", "datosSuper");
  const comportamientoCooperativas: StandardClientProfile["comportamientoCooperativas"] = {
    numeroOperaciones: coop.length,
    diasMoraMaxima: coop.length ? Math.max(...coop.map((c) => num(c.num_dias_morosidad) ?? 0)) : null,
    saldoTotal: coop.reduce((s, c) => s + (num(c.val_saldo_total) ?? 0), 0),
    tieneOperacionJudicializada: coop.some((c) => (num(c.val_dem_judicial) ?? 0) > 0),
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

  // ---- riesgoJudicialCivil ----
  const demandas = arr(judicial, "demandas", "demandas");
  const demandasOfendido = arr(judicial, "demandasOfendido", "demandas");
  const pensionAliment = [...arr(judicial, "pensionAlimenticia", "supas"), ...arr(judicial, "pensionAlimenticiaNovadata", "supas")];
  const riesgoJudicialCivil: StandardClientProfile["riesgoJudicialCivil"] = {
    numeroDemandasComoDemandado: demandas.length,
    // tipoDemanda.descripcion es el ROL ("DEMANDADO", constante) — el
    // tipo de caso real vive en demanda.delito.
    tiposDemandasComoDemandado: [...new Set(demandas.map((d) => (d.demanda as AnyRecord | undefined)?.delito as string | undefined).filter((x): x is string => Boolean(x)))],
    numeroDemandasComoOfendido: demandasOfendido.length,
    pensionAlimenticiaEnMora: pensionAliment.some((p) => (num(p.totalDeuda) ?? 0) > 0),
    deudaPensionAlimenticia: pensionAliment.length ? Math.max(...pensionAliment.map((p) => num(p.totalDeuda) ?? 0)) : null,
    demandaProblemaCrediticio: demandas.some((d) => esDemandaProblemaCrediticio((d.demanda as AnyRecord | undefined)?.delito)),
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

  // ---- compliance (guardrail, informativo) ----
  // personaPublicasOpr/tpeps = PEP — se cuenta aparte de enListaControl,
  // ver guardrails.ts: no es señal de riesgo crediticio.
  const totalListasControl = ["ofacsOpr", "homonimosOpr", "providenciasOpr"].reduce(
    (s, c) => s + arr(bancos, "listasControl", c).length,
    0
  );
  const totalPep = arr(bancos, "listasControl", "personaPublicasOpr").length + arr(biWrap, "x", "tpeps").length;
  const sercopData = obj(fiscalia, "sercop", "data");
  // impedimentoCargosPublicos.data es un ARRAY (no un objeto como el
  // resto de recursos "singleton") — obj() lo rechazaba por tipo y
  // devolvía null siempre, así que este campo daba false/null sin
  // importar la realidad (bug encontrado auditando cédula 0502937691,
  // que SÍ tiene registraImpedimento=true real). Se agrega sobre todos
  // los elementos del array por si acaso viniera más de uno.
  const impedimentoRegistros = arr(judicial, "impedimentoCargosPublicos", "data");
  const impedimentoActivo = impedimentoRegistros.find((r) => r.registraImpedimento === true) ?? null;
  const compliance: StandardClientProfile["compliance"] = {
    enListaControl: totalListasControl > 0,
    enListaNegra: Boolean(((bancos?.listaNegra as AnyRecord | undefined)?.data as AnyRecord | undefined)?.listaNegra),
    impedimentoCargosPublicos: Boolean(impedimentoActivo),
    causalImpedimento: ((impedimentoActivo?.causales as AnyRecord[] | undefined)?.[0]?.causal as string) ?? null,
    registraSercopContraloria: Boolean(
      (((sercopData?.contraloria as AnyRecord | undefined)?.registros as unknown[] | undefined)?.length ?? 0) > 0 ||
        (((sercopData?.sercop as AnyRecord | undefined)?.registros as unknown[] | undefined)?.length ?? 0) > 0
    ),
    esPersonaExpuestaPoliticamente: totalPep > 0,
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
    riesgoJudicialCivil,
    riesgoPenal,
    compliance,
    metaConsulta: {
      ejesOk: entries.filter(([, v]) => v === "ok").map(([k]) => k),
      ejesFaltantes: entries.filter(([, v]) => v === "faltante").map(([k]) => k),
      ejesConError: entries.filter(([, v]) => v === "error").map(([k]) => k),
    },
  };

  return { profile, blockStatus };
}
