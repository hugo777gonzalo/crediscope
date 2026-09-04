// Reprocesa la muestra cacheada en research/novadata-raw/*.json y genera
// el StandardClientProfile de cada persona, sin volver a consultar
// Novadata. Guarda el resultado en research/standard-profiles/<cedula>.json
// y también arma un CSV/base para el Excel de validación.
//
// Esta es la versión Node de referencia de la lógica de
// supabase/functions/_shared/process.ts (Deno) — se mantienen
// sincronizadas a mano; cualquier cambio de reglas debe reflejarse en
// ambas.
//
// Uso: node scripts/reprocess-sample.mjs

import fs from "node:fs";
import path from "node:path";

const RAW_DIR = path.resolve("research/novadata-raw");
const OUT_DIR = path.resolve("research/standard-profiles");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------- Helpers de fecha ----------

function parseFecha(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    // epoch ms (a veces con formato timestamp de 13 dígitos)
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function edadDesde(fecha) {
  const d = parseFecha(fecha);
  if (!d) return null;
  const ahora = new Date();
  let edad = ahora.getFullYear() - d.getFullYear();
  const cumple = new Date(ahora.getFullYear(), d.getMonth(), d.getDate());
  if (ahora < cumple) edad--;
  return edad;
}

function mesesDesde(fecha) {
  const d = parseFecha(fecha);
  if (!d) return null;
  const ahora = new Date();
  return (ahora.getFullYear() - d.getFullYear()) * 12 + (ahora.getMonth() - d.getMonth());
}

function dentroUltimos12Meses(fecha) {
  const meses = mesesDesde(fecha);
  return meses !== null && meses >= 0 && meses <= 12;
}

function dentroUltimos3Meses(fecha) {
  const meses = mesesDesde(fecha);
  return meses !== null && meses >= 0 && meses <= 3;
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// contribuyente/get_contribuyente_inf: un registro cuenta como "tuvo RUC"
// solo si trae .ruc Y .fecha_inscripcion_ruc (Novadata a veces devuelve
// un registro "cascarón" con estado.codigo=OK pero todos los campos
// null cuando la persona nunca tuvo RUC — ver 1759544552).
// ACTIVO si no tiene fecha_cancelacion NI fecha_suspension_definitiva, o
// si fecha_reinicio_actividades es posterior a la más reciente de esas dos.
function rucRegistroActivo(c) {
  if (!c.ruc || !c.fecha_inscripcion_ruc) return false;
  const cancelacion = parseFecha(c.fecha_cancelacion);
  const suspension = parseFecha(c.fecha_suspension_definitiva);
  if (!cancelacion && !suspension) return true;
  const ceseMasReciente = [cancelacion, suspension].filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0];
  const reinicio = parseFecha(c.fecha_reinicio_actividades);
  return Boolean(reinicio && reinicio.getTime() > ceseMasReciente.getTime());
}

// ---------- Helpers de acceso a datos ----------

function arr(multi, recurso, campo) {
  const v = multi?.[recurso]?.data?.[campo];
  return Array.isArray(v) ? v : [];
}
function obj(multi, recurso, campo) {
  const v = multi?.[recurso]?.data?.[campo];
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

// Palabras clave (unión de las 3 listas del pedido, deduplicadas) para
// detectar demandas de naturaleza crediticia/de cobro.
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

function esDemandaProblemaCrediticio(delito) {
  if (!delito) return false;
  const up = String(delito).toUpperCase();
  return KEYWORDS_PROBLEMA_CREDITICIO.some((kw) => up.includes(kw));
}

// ---------- Construcción del perfil estandarizado ----------

function buildStandardProfile(raw, cedula) {
  const g = raw.general?.data;
  const persona = g?.personaNatural;
  const socio = raw.sociodemografica?.data;
  const trabajo = raw.trabajo?.data;
  const iess = raw.iess?.data;
  const vehiculosData = raw.vehiculos?.data;
  const judicial = raw.funcion_judicial?.data;
  const fiscalia = raw.fiscalia?.data;
  const bancos = raw.bancos?.data;
  const cooperativas = raw.cooperativas?.data;

  const basesInternas = bancos?.basesInternas?.data;
  const personasIncump = arr({ x: { data: basesInternas } }, "x", "personasIncumplimientos")[0] ?? null;
  const tiess = arr({ x: { data: basesInternas } }, "x", "tiess");
  const tcredQ = arr({ x: { data: basesInternas } }, "x", "tcredQuirografarios");
  const tcredH = arr({ x: { data: basesInternas } }, "x", "tcredHipotecarios");

  // ---- identidad ----
  const nacionalidad0 = g?.nacionalidades?.[0]?.pais;
  const conyuge = g?.personaNaturalConyuge;
  const identidad = {
    nombreCompleto: persona?.nombre ?? null,
    edad: edadDesde(persona?.fechaNacimiento),
    genero: persona?.genero?.descripcion ?? null,
    estadoCivil: g?.estadoCivil?.estadoCivil?.descripcion ?? null,
    nivelEducacion: g?.nivelEducacion?.nivelEducacion?.descripcion ?? null,
    profesiones: (g?.profesiones ?? []).map((p) => p.profesion?.descripcion).filter(Boolean),
    fallecido: Boolean(persona?.fechaDefuncion) || String(persona?.informacionAdicional ?? "").toUpperCase().includes("FALLEC"),
    tieneConyuge: Boolean(conyuge?.personaConyuge?.nombre),
    // --- nuevos campos (Nuevos_Campos.xlsx) ---
    cantonNacimiento: persona?.lugarNacimiento?.parroquia?.canton?.nombre ?? null,
    provinciaNacimiento: persona?.lugarNacimiento?.parroquia?.canton?.provincia?.nombre ?? null,
    paisOrigen: nacionalidad0?.nombre ?? null,
    paisOrigenIso3: nacionalidad0?.codigoIso3 ?? null,
    paisOrigenIso: nacionalidad0?.codigoIso ?? null,
    esExtranjero: nacionalidad0 ? nacionalidad0.nombre !== "Ecuador" : null,
    // Solo tiene sentido si hay cónyuge ACTUAL — fechaMatrimonio puede
    // quedar en el registro aunque la persona ya esté divorciada.
    añosCasado: conyuge?.personaConyuge?.nombre && conyuge?.fechaMatrimonio ? mesesDesde(conyuge.fechaMatrimonio) !== null ? Math.floor(mesesDesde(conyuge.fechaMatrimonio) / 12) : null : null,
    edadConyuge: conyuge?.personaConyuge?.nombre ? edadDesde(conyuge?.personaConyuge?.fechaNacimiento) : null,
  };

  // ---- contacto ----
  // Nota: numeroX/conteos son 0 (no null) cuando el eje SÍ se consultó
  // pero no hay registros — null se reserva para "no se pudo saber"
  // (ver metaConsulta.ejesFaltantes/ejesConError).
  const direcciones = arr(socio, "direcciones", "direcciones");
  const telefonos = arr(socio, "telefonos", "telefonos");
  const correos = arr(socio, "correo", "correos");
  const contacto = {
    numeroDirecciones: direcciones.length,
    numeroTelefonos: telefonos.length,
    numeroCorreos: correos.length,
    // --- nuevos ---
    direccionActualizada12M: direcciones.some((d) => dentroUltimos12Meses(d?.direccion?.fechaActualizacion)),
    telefonoActualizado12M: telefonos.some((t) => dentroUltimos12Meses(t?.telefono?.fechaActualizacion)),
    correoActualizado12M: correos.some((c) => dentroUltimos12Meses(c?.fechaActualizacion)),
  };

  // ---- familia ----
  const hijos = arr(socio, "hijos", "personasNatural");
  const padres = arr(socio, "padres", "personasNatural");
  const hijosIdsUnicos = new Set(hijos.map((h) => h.identificacion).filter(Boolean));
  const familia = {
    numeroHijos: hijos.length,
    tieneHijoMenorEdad: hijos.some((h) => {
      const e = edadDesde(h.fechaNacimiento);
      return e !== null && e < 18;
    }),
    padresFallecidos: padres.filter((p) => Boolean(p.fechaDefuncion) || String(p.informacionAdicional ?? "").toUpperCase().includes("FALLEC")).length,
    // --- nuevo ---
    tieneHijos: hijosIdsUnicos.size > 0,
  };

  // ---- laboral ----
  const empleados = arr(trabajo, "empleados", "empleados");
  const empleadosIdsUnicos = new Set(empleados.map((e) => e.ci).filter(Boolean));
  const contribuyenteRegistros = arr(trabajo, "contribuyente", "datosContribuyente");
  // tieneEstablecimientoActivo: fuente correcta es contribuyente (RUC),
  // NO establecimientoActEconomica — ver rucRegistroActivo().
  const tieneEstablecimientoActivo = contribuyenteRegistros.some(rucRegistroActivo);
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
  const mecanizado = arr(trabajo, "trabajoHistoricosMecanizado", "mecanizadoEmpleados");
  const mecanizadoOrdenado = [...mecanizado].sort(
    (a, b) => (parseFecha(b.baseDate ? `${b.baseDate}-01` : null)?.getTime() ?? 0) - (parseFecha(a.baseDate ? `${a.baseDate}-01` : null)?.getTime() ?? 0)
  );
  const ultimoMecanizado = mecanizadoOrdenado[0] ?? null;
  const empleoActualConfiable = ultimoMecanizado && dentroUltimos3Meses(ultimoMecanizado.baseDate ? `${ultimoMecanizado.baseDate}-01` : null);
  const laboral = {
    empleoActual: empleoActualConfiable
      ? {
          empleador: ultimoMecanizado.personaPatrono?.nombreComercial ?? ultimoMecanizado.personaPatrono?.nombre ?? null,
          cargo: ultimoMecanizado.cargo?.nombre ?? null,
          salarioAprox: num(ultimoMecanizado.personaIngreso?.valor),
        }
      : null,
    // Nota: la muestra actual tiene historial laboral (tiess) desactualizado
    // frente a la fecha "de hoy" del entorno — esta ventana de 24 meses
    // puede dar 0 para casi todos hasta que se refresque la muestra.
    numeroEmpleadoresUltimos24Meses: new Set(tiess.filter((t) => { const m = mesesDesde(t.fecIng); return m !== null && m <= 24; }).map((t) => t.nomEmp)).size,
    ingresoPromedioUltimos6Meses: (() => {
      const ultimos6 = mecanizadoOrdenado.slice(0, 6).map((t) => num(t.personaIngreso?.valor)).filter((n) => n !== null);
      return ultimos6.length ? Math.round((ultimos6.reduce((a, b) => a + b, 0) / ultimos6.length) * 100) / 100 : null;
    })(),
    esEmpleadorOAdministrador: empleados.length > 0 || arr(trabajo, "administraciones", "administraciones").length > 0,
    tieneRucActivo: contribuyenteRegistros.some((c) => String(c.obligado ?? "").toUpperCase() !== "NO"),
    tieneEstablecimientoActivo,
    // --- nuevos ---
    esIndependiente: tieneEstablecimientoActivo,
    numeroEmpleadosRegistrados: empleadosIdsUnicos.size,
    tipoEmpleador: empleados[0]?.tipEmp ?? null,
    obligacionesPatronalesEnMora: cumplimientoAfiliaciones.length > 0 ? obligacionesEnMora : null,
  };

  // ---- tributario (SRI) ----
  const sriData = obj(trabajo, "sriImpuestoRenta", "data") ?? arr(trabajo, "sriImpuestoRenta", "data")[0] ?? null;
  const impuestosISD = sriData?.impuestosISD ?? [];
  const impuestosRenta = sriData?.impuestosRenta ?? [];
  const maxISD = impuestosISD.reduce((max, x) => (num(x.valor) !== null && num(x.valor) > (max ?? -Infinity) ? num(x.valor) : max), null);
  const fechaISD = impuestosISD.reduce((max, x) => (x.periodoFiscal && (max === null || x.periodoFiscal > max) ? x.periodoFiscal : max), null);
  const maxRenta = impuestosRenta.reduce((max, x) => (num(x.rentaCausadoRetenido) !== null && num(x.rentaCausadoRetenido) > (max ?? -Infinity) ? num(x.rentaCausadoRetenido) : max), null);
  const fechaRenta = impuestosRenta.reduce((max, x) => (x.periodoFiscal && (max === null || x.periodoFiscal > max) ? x.periodoFiscal : max), null);
  // esAfiliadoUnipersonal: misma fuente que tieneEstablecimientoActivo
  // (contribuyente) — un registro "cascarón" sin .ruc (ver
  // rucRegistroActivo) cuenta como "nunca tuvo RUC" => FALSE, no null.
  const rucConDatos = contribuyenteRegistros.filter((c) => c.ruc);
  const tributario = {
    pagaISD: impuestosISD.length > 0,
    montoMaximoISD: maxISD,
    fechaMasRecienteISD: fechaISD,
    generaImpuestoRenta: impuestosRenta.length > 0,
    montoMaximoImpuestoRenta: maxRenta,
    fechaMasRecienteImpuestoRenta: fechaRenta,
    esAfiliadoUnipersonal: rucConDatos.some((c) => String(c.ruc).slice(0, 10) === String(cedula)),
  };

  // ---- seguridadSocial ----
  const afilIess = arr(iess, "afiliacionIess", "afiliacionIess")[0] ?? null;
  const seguridadSocial = {
    afiliadoIessActivo: afilIess ? String(afilIess.estado ?? "").toUpperCase().startsWith("ACTIVO") : false,
    // esPensionista: hay que leer el campo .estado (booleano real) de
    // cada registro, no solo si el recurso trajo algún registro — Novadata
    // devuelve registros con estado:false para gente que NO es pensionista.
    esPensionista: arr(iess, "pensionista", "pensionista").some((p) => p.estado === true),
    esJubilado: arr(iess, "jubilados", "trabajos").length > 0,
    // --- nuevo ---
    estadoAfiliacionIess: afilIess?.estado ?? null,
  };

  // ---- patrimonio ----
  const vehiculos = arr(vehiculosData, "vehiculos", "personaVehiculo");
  const sum = (field) => vehiculos.reduce((s, v) => s + (num(v[field]) ?? 0), 0);
  const patrimonio = {
    numeroVehiculos: vehiculos.length,
    valorAvaluoVehiculos: sum("valorAvaluo"),
    numeroInmuebles: arr(socio, "bienesInmueble", "bienesInmueble").length,
    numeroInversiones: arr(bancos, "inversiones", "inversiones").length,
    // --- nuevos ---
    tieneVehiculos: vehiculos.length > 0,
    numeroAutos: vehiculos.filter((v) => v.tipoComercial === "autos").length,
    numeroVehiculosPesados: vehiculos.filter((v) => v.tipoComercial === "pesados").length,
    numeroMotos: vehiculos.filter((v) => v.tipoComercial === "motos").length,
    valorComercialTotalVehiculos: sum("precioComercial"),
    valorVentaTotalVehiculos: sum("precioVentaPublico"),
    valorPromedioTotalVehiculos: sum("precioVentaPromedio"),
  };

  // ---- comportamientoBancario (ex "formal": bancos/BIESS/Diners) ----
  const centralRiesgo = [...arr(bancos, "centralRiesgoSuper", "datosSuper"), ...arr(bancos, "centralRiesgoDiners", "datosSuper")];
  const retails = arr(bancos, "retails", "retails");
  const comportamientoBancario = {
    numeroOperacionesCentralRiesgo: centralRiesgo.length,
    peorCalificacionRiesgo: centralRiesgo.map((r) => r.calificacion).filter(Boolean).sort().pop() ?? null,
    tieneOperacionJudicializada: centralRiesgo.some((r) => num(r.judicial) > 0),
    tieneOperacionCastigada: centralRiesgo.some((r) => num(r.castigo) > 0),
    saldoTotalVigente: centralRiesgo.reduce((s, r) => s + (num(r.saldoVigente) ?? 0), 0),
    numeroCreditosFormales: arr(bancos, "creditoHipotecario", "prestamos").length + arr(bancos, "creditoQuirografario", "prestamos").length,
    numeroDeudasRetail: retails.length,
    diasMoraMaximaRetail: retails.length ? Math.max(...retails.map((r) => num(r.diasMora) ?? 0)) : null,
    totalDeudaRetail: retails.reduce((s, r) => s + (num(r.totalDeuda) ?? 0), 0),
    tieneCreditoIessBiess: tcredQ.length > 0 || tcredH.length > 0,
    diasMoraCreditoIessBiess: [...tcredQ, ...tcredH].length ? Math.max(...[...tcredQ, ...tcredH].map((c) => num(c.diasMoraAfi) ?? 0)) : null,
  };

  // ---- comportamientoCooperativas ----
  const coop = arr(cooperativas, "centralRiesgoCoop", "datosSuper");
  const comportamientoCooperativas = {
    numeroOperaciones: coop.length,
    diasMoraMaxima: coop.length ? Math.max(...coop.map((c) => num(c.num_dias_morosidad) ?? 0)) : null,
    saldoTotal: coop.reduce((s, c) => s + (num(c.val_saldo_total) ?? 0), 0),
    tieneOperacionJudicializada: coop.some((c) => num(c.val_dem_judicial) > 0),
    tieneOperacionCastigada: coop.some((c) => num(c.val_cart_castigada) > 0),
  };

  // ---- comportamientoInterno (NUEVO grupo — scoring propio Novadata) ----
  const comportamientoInterno = {
    novadataResultadoHabitoPago: personasIncump?.resultadoHabitoPago ?? null,
    novadataPerfilInterno: personasIncump?.perfilInterno ?? null,
    novadataDiasMoraMaxima: num(personasIncump?.diasMoraMax),
    novadataDiasMoraVigente: num(personasIncump?.diasMoraVigentes),
    novadataSaldoCapitalVigente: num(personasIncump?.saldoCapital),
    esClienteInterno: Boolean(personasIncump?.identificacion),
  };

  // ---- transitoVehicular ----
  const licencia = arr(vehiculosData, "licenciaConducir", "licencia")[0] ?? null;
  const multas = [...arr(bancos, "deudasAnt", "deudaAnts"), ...arr(bancos, "deudasAmt", "deudaAmt"), ...arr(bancos, "deudasEmov", "deudaEmov")];
  const transitoVehicular = {
    tieneLicenciaVigente: Boolean(licencia),
    puntosLicencia: licencia ? num(licencia.puntos) : null,
    numeroMultas: multas.length,
    valorAdeudadoTransito: multas.reduce((s, m) => s + (num(m.valorAdeudado) ?? 0), 0),
  };

  // ---- riesgoJudicialCivil ----
  const demandas = arr(judicial, "demandas", "demandas");
  const demandasOfendido = arr(judicial, "demandasOfendido", "demandas");
  const pensionAliment = [...arr(judicial, "pensionAlimenticia", "supas"), ...arr(judicial, "pensionAlimenticiaNovadata", "supas")];
  const riesgoJudicialCivil = {
    numeroDemandasComoDemandado: demandas.length,
    // ojo: tipoDemanda.descripcion es el ROL ("DEMANDADO"/"OFENDIDO",
    // siempre el mismo valor según el recurso) — el tipo de caso real
    // vive en demanda.delito (ej. "COBRO DE PAGARÉ A LA ORDEN").
    tiposDemandasComoDemandado: [...new Set(demandas.map((d) => d.demanda?.delito).filter(Boolean))],
    numeroDemandasComoOfendido: demandasOfendido.length,
    pensionAlimenticiaEnMora: pensionAliment.some((p) => (num(p.totalDeuda) ?? 0) > 0),
    deudaPensionAlimenticia: pensionAliment.length ? Math.max(...pensionAliment.map((p) => num(p.totalDeuda) ?? 0)) : null,
    // --- nuevo ---
    demandaProblemaCrediticio: demandas.some((d) => esDemandaProblemaCrediticio(d.demanda?.delito)),
  };

  // ---- riesgoPenal ----
  const antecedentes = obj(fiscalia, "antecedentesPenales", "antecedentes");
  const riesgoPenal = {
    tieneAntecedentesPenales: antecedentes ? antecedentes.descripcion !== "NO" : null,
    descripcionAntecedentes: antecedentes && antecedentes.descripcion !== "NO" ? antecedentes.descripcion : null,
    numeroDenunciasFiscalia: arr(fiscalia, "denuncias", "denuncias").length,
  };

  // ---- compliance (guardrail, informativo) ----
  const totalListasControl = ["ofacsOpr", "homonimosOpr", "providenciasOpr", "personaPublicasOpr"].reduce((s, c) => s + arr(bancos, "listasControl", c).length, 0);
  const sercopData = obj(fiscalia, "sercop", "data");
  const impedimento = obj(judicial, "impedimentoCargosPublicos", "data");
  const compliance = {
    enListaControl: totalListasControl > 0,
    enListaNegra: Boolean(bancos?.listaNegra?.data?.listaNegra),
    impedimentoCargosPublicos: Boolean(impedimento?.registraImpedimento),
    causalImpedimento: impedimento?.causales?.[0]?.causal ?? null,
    registraSercopContraloria: Boolean((sercopData?.contraloria?.registros?.length ?? 0) > 0 || (sercopData?.sercop?.registros?.length ?? 0) > 0),
  };

  const blockStatus = {
    general: raw.general?.status,
    sociodemografica: raw.sociodemografica?.status,
    trabajo: raw.trabajo?.status,
    iess: raw.iess?.status,
    vehiculos: raw.vehiculos?.status,
    funcion_judicial: raw.funcion_judicial?.status,
    fiscalia: raw.fiscalia?.status,
    bancos: raw.bancos?.status,
    cooperativas: raw.cooperativas?.status,
  };
  const ejesOk = Object.entries(blockStatus).filter(([, v]) => v === "ok").map(([k]) => k);
  const ejesFaltantes = Object.entries(blockStatus).filter(([, v]) => v === "faltante").map(([k]) => k);
  const ejesConError = Object.entries(blockStatus).filter(([, v]) => v === "error").map(([k]) => k);

  return {
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
    metaConsulta: { ejesOk, ejesFaltantes, ejesConError },
  };
}

// ---------- Main ----------

const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));
console.log(`Reprocesando ${files.length} personas...`);

const profiles = [];
for (const f of files) {
  const cedula = f.replace(".json", "");
  const doc = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"));
  const profile = buildStandardProfile(doc.raw, cedula);
  fs.writeFileSync(path.join(OUT_DIR, `${cedula}.json`), JSON.stringify(profile, null, 2));
  profiles.push(profile);
}

fs.writeFileSync(path.join(OUT_DIR, "_all.json"), JSON.stringify(profiles, null, 2));
console.log(`Listo. ${profiles.length} perfiles en ${OUT_DIR}`);

export { buildStandardProfile };
