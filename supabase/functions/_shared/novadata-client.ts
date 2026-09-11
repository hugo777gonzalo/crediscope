// Cliente de la web interna Novadata (novascoring). Confirmado contra
// producción (2026-09), incluyendo un HAR capturado de la interfaz web
// real (55 llamadas distintas para una sola cédula):
//
//   1. Login: POST {BASE}/auth/realms/novacredit/protocol/openid-connect/token
//      (form-urlencoded: username, password, client_id=login-data-services,
//      grant_type=password) -> { access_token, expires_in: 900, ... }.
//      El token dura 15 min — de sobra para una corrida de análisis, así
//      que no vale la pena manejar refresh_token: se pide uno nuevo por
//      invocación (con cache en memoria del proceso mientras viva).
//
//   2. Datos: GET {BASE}/data-services/novacredit/<recurso>/<cedula>
//      (algunos bajo {BASE}/api/consultas/novacredit/<recurso>/<cedula>)
//      con `Authorization: Bearer <token>`. TODOS los recursos comparten
//      el mismo sobre: { estado: { codigo, mensaje }, <campoArray>: [...] }.
//      "Sin datos" se señala con estado.codigo !== "OK" en un HTTP 200,
//      no necesariamente con un 404 — hay que leer el body igual.
//
// Los 9 bloques del negocio (Información general, Sociodemográfica,
// Trabajo, Aportes IESS, Vehículos, Función Judicial, Fiscalía, Bancos,
// Cooperativas) son agrupaciones de MUCHOS recursos individuales de
// Novadata — ver RECURSOS_POR_BLOQUE abajo. "general" es el único bloque
// de un solo recurso (pn_inf_basica) con forma rica ya tipada en
// types.ts; el resto se resuelve genéricamente con RawMultiRecurso.
//
// BIESS se descartó como bloque (no corresponde a ningún dato real de
// Novadata, confirmado por el usuario).
//
// pn_vehiculos SÍ se consulta directo por cédula
// (`pn_vehiculos/general/{cedula}`) — la primera prueba asumió
// incorrectamente que hacía falta la placa; un HAR real lo corrigió.
//
// pn_supa (+ pn_supa/novadata) es PENSIÓN ALIMENTICIA (child support),
// no tránsito vehicular — se movió de "vehiculos" a "funcion_judicial".
//
// nova_bases_internas es un recurso "bundle": trae `tiess` (histórico
// laboral con SALARIO real, más completo que pn_trabajo_historicos) y
// `tcredQuirografarios`/`tcredHipotecarios` (créditos afiliados
// IESS/BIESS) además de listas de control adicionales (tpeps, tofac,
// tofac2, tconsepvinculados, tconsephomonimos, tprovidencias). Se pide
// una sola vez dentro del grupo "bancos" pero normalize.ts y
// controles-bloqueo.ts leen las partes que les corresponden de ahí — no hace
// falta pedirlo de nuevo por eje.

import type { BlockFetchStatus, BlockResult, NovadataEnvelope, RawGeneral, RawMultiRecurso, RawNovadataResponse } from "./types.ts";

const NOVADATA_BASE_URL = Deno.env.get("NOVADATA_BASE_URL") ?? "https://novadata.novascoring.com";
const NOVADATA_USERNAME = Deno.env.get("NOVADATA_USERNAME") ?? "";
const NOVADATA_PASSWORD = Deno.env.get("NOVADATA_PASSWORD") ?? "";
const NOVADATA_CLIENT_ID = "login-data-services";

export interface NovadataCredentials {
  username: string;
  password: string;
}

// Cache en memoria SOLO para las credenciales de servicio (env vars) —
// usadas por analyze-client en cada corrida automática. Credenciales
// explícitas (ver explore-novadata, donde el usuario tipea las suyas en
// el explorador web) nunca se cachean, para no mezclar tokens entre
// personas distintas que usen el explorador.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(credentials?: NovadataCredentials): Promise<string> {
  const useCache = !credentials;
  if (useCache && cachedToken && cachedToken.expiresAt > Date.now() + 5_000) {
    return cachedToken.value;
  }
  const username = credentials?.username || NOVADATA_USERNAME;
  const password = credentials?.password || NOVADATA_PASSWORD;
  const res = await fetch(`${NOVADATA_BASE_URL}/auth/realms/novacredit/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username,
      password,
      client_id: NOVADATA_CLIENT_ID,
      grant_type: "password",
    }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo autenticar con Novadata (HTTP ${res.status})`);
  }
  const data = await res.json();
  const token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  if (useCache) cachedToken = token;
  return token.value;
}

function isEstadoOk(body: unknown): boolean {
  const estado = (body as { estado?: { codigo?: string } } | undefined)?.estado;
  return !estado || estado.codigo === "OK";
}

// path puede incluir sub-segmentos fijos antes de la cédula, ej.
// "pn_credito/hipotecario" -> GET .../pn_credito/hipotecario/{cedula}
async function fetchResource<T = NovadataEnvelope>(
  path: string,
  cedula: string,
  credentials?: NovadataCredentials
): Promise<BlockResult<T>> {
  if (!credentials && (!NOVADATA_USERNAME || !NOVADATA_PASSWORD)) {
    return { status: "error", data: null, errorMessage: "Novadata no configurado (faltan NOVADATA_USERNAME / NOVADATA_PASSWORD)" };
  }
  try {
    const token = await getAccessToken(credentials);
    const res = await fetch(`${NOVADATA_BASE_URL}/${path}/${encodeURIComponent(cedula)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      return { status: "faltante", data: null };
    }
    if (res.status === 204) {
      return { status: "faltante", data: null };
    }
    if (!res.ok) {
      return { status: "error", data: null, errorMessage: `Novadata respondió HTTP ${res.status}` };
    }
    const body = await res.json();
    if (!isEstadoOk(body)) {
      return { status: "faltante", data: null };
    }
    return { status: "ok", data: body as T };
  } catch (err) {
    return { status: "error", data: null, errorMessage: String(err) };
  }
}

// Recursos confirmados contra producción por bloque de negocio. La clave
// corta es la que usa normalize.ts para leer cada resultado; el valor es
// la ruta real bajo NOVADATA_BASE_URL (sin la cédula final).
const RECURSOS_POR_BLOQUE: Record<string, Record<string, string>> = {
  sociodemografica: {
    direcciones: "data-services/novacredit/pn_direcciones",
    telefonos: "data-services/novacredit/pn_telefonos",
    correo: "data-services/novacredit/pn_direccion_correoe",
    padres: "data-services/novacredit/pn_padres",
    hijos: "data-services/novacredit/pn_hijos",
    titulos: "data-services/novacredit/pn_titulos",
    bienesInmueble: "data-services/novacredit/pn_bienes_inmueble",
    vacunados: "api/consultas/novacredit/vacunados/get_inf_byIden",
  },
  trabajo: {
    empleados: "data-services/novacredit/pn_empleados",
    trabajoHistoricos: "data-services/novacredit/pn_trabajo_historicos",
    trabajoHistoricosMecanizado: "data-services/novacredit/pn_trabajo_historicos/mecanizado",
    cumplimientoPatronal: "data-services/novacredit/pn_cumplimiento_patronal",
    administraciones: "data-services/novacredit/pn_administraciones",
    contribuyente: "api/consultas/novacredit/contribuyente/get_contribuyente_inf",
    sriImpuestoRenta: "data-services/novacredit/pn_sri_impuestos_renta",
    establecimientoActEconomica: "api/consultas/novacredit/establecimiento_act_economica/get_establecimiento_inf",
  },
  iess: {
    afiliacionIess: "data-services/novacredit/pn_afiliacion_iess",
    afiliacionIsspol: "data-services/novacredit/pn_afiliacion_isspol",
    afiliacionIssfacCertMedico: "data-services/novacredit/pn_afiliacion_issfac/cert_medico",
    afiliacionIssfacFuerzaArmada: "data-services/novacredit/pn_afiliacion_issfac/fuerza_armada",
    afiliacionSiisspol: "data-services/novacredit/pn_afiliacion_siisspol",
    afiliacionSalud: "data-services/novacredit/pn_afiliacion_salud",
    pensionista: "data-services/novacredit/pn_pensionista",
    jubilados: "data-services/novacredit/pn_jubilados",
  },
  vehiculos: {
    vehiculos: "data-services/novacredit/pn_vehiculos/general",
    licenciaConducir: "data-services/novacredit/pn_licencia_conducir",
    siniestros: "data-services/novacredit/pn_siniestros",
    polizas: "data-services/novacredit/pn_polizas",
  },
  funcion_judicial: {
    demandas: "data-services/novacredit/pn_demandas",
    demandasOfendido: "data-services/novacredit/pn_demandas_ofendido",
    impedimentoCargosPublicos: "data-services/novacredit/pn_impedimento_cargos_publicos",
    pensionAlimenticia: "data-services/novacredit/pn_supa",
    pensionAlimenticiaNovadata: "data-services/novacredit/pn_supa/novadata",
  },
  fiscalia: {
    denuncias: "data-services/novacredit/pn_denuncias",
    antecedentesPenales: "data-services/novacredit/pn_antecedentes_penales",
    sercop: "data-services/novacredit/pn_sercop",
  },
  bancos: {
    creditoHipotecario: "data-services/novacredit/pn_credito/hipotecario",
    creditoQuirografario: "data-services/novacredit/pn_credito/quirografario",
    deudasAnt: "data-services/novacredit/pn_deudas_ant",
    deudasAmt: "data-services/novacredit/pn_deudas_amt",
    deudasEmov: "data-services/novacredit/pn_deudas_emov",
    deudasFirmes: "data-services/novacredit/pn_deudas_firmes",
    deudores: "data-services/novacredit/pn_deudores",
    buroCreditoDiners: "api/consultas/novacredit/central_riesgo/get_inf_diners",
    buroCreditoSuper: "api/consultas/novacredit/central_riesgo/get_inf_super",
    listasControl: "data-services/novacredit/pn_listas_control",
    listaNegra: "data-services/novacredit/pn_lista_negra",
    inversiones: "data-services/novacredit/pn_inversiones",
    retails: "data-services/novacredit/pn_retails",
    basesInternas: "data-services/novacredit/nova_bases_internas",
  },
  cooperativas: {
    buroCreditoCoop: "api/consultas/novacredit/central_riesgo/get_inf_coop",
  },
};

function aggregateStatus(results: BlockResult<unknown>[]): BlockFetchStatus {
  if (results.length === 0) return "faltante";
  if (results.some((r) => r.status === "ok")) return "ok";
  if (results.every((r) => r.status === "deshabilitado")) return "deshabilitado";
  if (results.every((r) => r.status === "faltante" || r.status === "deshabilitado")) return "faltante";
  return "error";
}

async function fetchGroup(
  recursos: Record<string, string>,
  cedula: string,
  disabledResources: Set<string>,
  credentials?: NovadataCredentials
): Promise<BlockResult<RawMultiRecurso>> {
  const entries = Object.entries(recursos);
  if (entries.length === 0) {
    return { status: "faltante", data: null, errorMessage: "Sin recursos confirmados para este bloque todavía" };
  }
  const results = await Promise.all(
    entries.map(([key, path]) =>
      disabledResources.has(key)
        ? Promise.resolve<BlockResult<NovadataEnvelope>>({ status: "deshabilitado", data: null })
        : fetchResource(path, cedula, credentials)
    )
  );
  const data: RawMultiRecurso = {};
  entries.forEach(([key], i) => {
    data[key] = results[i];
  });
  return { status: aggregateStatus(results), data };
}

export async function fetchAllBlocks(
  cedula: string,
  credentials?: NovadataCredentials,
  disabledResources: Set<string> = new Set()
): Promise<RawNovadataResponse> {
  const [general, sociodemografica, trabajo, iess, vehiculos, funcionJudicial, fiscalia, bancos, cooperativas] = await Promise.all([
    disabledResources.has("general")
      ? Promise.resolve<BlockResult<RawGeneral>>({ status: "deshabilitado", data: null })
      : fetchResource<RawGeneral>("data-services/novacredit/pn_inf_basica", cedula, credentials),
    fetchGroup(RECURSOS_POR_BLOQUE.sociodemografica, cedula, disabledResources, credentials),
    fetchGroup(RECURSOS_POR_BLOQUE.trabajo, cedula, disabledResources, credentials),
    fetchGroup(RECURSOS_POR_BLOQUE.iess, cedula, disabledResources, credentials),
    fetchGroup(RECURSOS_POR_BLOQUE.vehiculos, cedula, disabledResources, credentials),
    fetchGroup(RECURSOS_POR_BLOQUE.funcion_judicial, cedula, disabledResources, credentials),
    fetchGroup(RECURSOS_POR_BLOQUE.fiscalia, cedula, disabledResources, credentials),
    fetchGroup(RECURSOS_POR_BLOQUE.bancos, cedula, disabledResources, credentials),
    fetchGroup(RECURSOS_POR_BLOQUE.cooperativas, cedula, disabledResources, credentials),
  ]);

  return {
    general,
    sociodemografica,
    trabajo,
    iess,
    vehiculos,
    funcion_judicial: funcionJudicial,
    fiscalia,
    bancos,
    cooperativas,
  };
}
