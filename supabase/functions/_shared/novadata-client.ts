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
// Las 52 fuentes se consultan planas, sin agrupar. Hasta la migración
// 078 pasaban por nueve "bloques" de negocio (Información general,
// Sociodemográfica, Trabajo, Aportes IESS, Vehículos, Función Judicial,
// Fiscalía, Bancos, Cooperativas) que eran un accidente de la primera
// integración: los aportes al IESS llegaban adentro del bloque
// `bancos`, así que "falló bancos" no decía "no sé si esta persona
// aporta". Cuando una taxonomía necesita una nota al pie, la taxonomía
// está mal. La relación real fuente -> grupo del perfil es muchos a
// muchos y vive en la tabla `fuente_grupo` desde la 067.
//
// "general" (pn_inf_basica) es la única con forma rica ya tipada en
// types.ts; el resto comparte el sobre genérico NovadataEnvelope.
//
// BIESS se descartó (no corresponde a ningún dato real de Novadata,
// confirmado por el usuario).
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
// una sola vez y process.ts y controles-bloqueo.ts leen de ahí las
// partes que les corresponden — no hace falta pedirlo de nuevo.

import type { NovadataEnvelope, RespuestaNovadata, ResultadoFuente } from "./types.ts";

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

// Prueba de vida de la fuente de datos, para el vigía.
//
// Pide un token con las credenciales de servicio, sin consultar a
// ninguna persona: verifica red, credenciales y que el proveedor esté
// en pie, sin tocar datos de nadie ni dejar rastro en la auditoría de
// consultas. Salta el cache a propósito -- un token guardado en memoria
// diría que todo está bien aunque el proveedor esté caído.
export async function probarFuenteDeDatos(): Promise<{ ok: boolean; error?: string; duracionMs: number }> {
  const inicio = Date.now();
  try {
    const res = await fetch(`${NOVADATA_BASE_URL}/auth/realms/novacredit/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: NOVADATA_USERNAME,
        password: NOVADATA_PASSWORD,
        client_id: NOVADATA_CLIENT_ID,
        grant_type: "password",
      }),
    });
    const duracionMs = Date.now() - inicio;
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, duracionMs };
    }
    const data = await res.json();
    if (!data?.access_token) return { ok: false, error: "respuesta sin token de acceso", duracionMs };
    return { ok: true, duracionMs };
  } catch (err) {
    return { ok: false, error: String(err), duracionMs: Date.now() - inicio };
  }
}

function isEstadoOk(body: unknown): boolean {
  const estado = (body as { estado?: { codigo?: string } } | undefined)?.estado;
  return !estado || estado.codigo === "OK";
}

function mensajeDelEstado(body: unknown): string | undefined {
  const estado = (body as { estado?: { codigo?: string; mensaje?: string } } | undefined)?.estado;
  return estado?.codigo === "ERROR" ? estado.mensaje : undefined;
}

// La fuente responde HTTP 200 incluso cuando la persona no existe: lo
// dice adentro del cuerpo, en estado.mensaje. Hasta ahora eso se
// trataba igual que "esta persona no tiene datos en esta fuente", y el
// resultado era un Perfil del Cliente completo y en blanco: nada
// avisaba que esa cédula no corresponde a nadie.
//
// Se mira la fuente de identidad y no cualquiera: que alguien no tenga
// vehículos es normal; que no exista en el registro de personas no.
export function personaNoExiste(general: { status: string; errorMessage?: string }): string | null {
  const m = general?.errorMessage ?? "";
  return /no existe/i.test(m) ? m : null;
}

// path puede incluir sub-segmentos fijos antes de la cédula, ej.
// "pn_credito/hipotecario" -> GET .../pn_credito/hipotecario/{cedula}
async function fetchResource<T = NovadataEnvelope>(
  path: string,
  cedula: string,
  credentials?: NovadataCredentials
): Promise<ResultadoFuente<T>> {
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
      // El motivo viaja aunque el bloque quede como faltante: es lo que
      // permite distinguir después "sin datos" de "no existe".
      return { status: "faltante", data: null, errorMessage: mensajeDelEstado(body) };
    }
    return { status: "ok", data: body as T };
  } catch (err) {
    return { status: "error", data: null, errorMessage: String(err) };
  }
}

// Las 52 fuentes, confirmadas contra producción. La clave corta es la
// que usa process.ts para leer cada resultado y la misma que guarda
// novadata_resource_config.recurso, así que apagar una fuente desde la
// pantalla de configuración y leerla acá hablan del mismo nombre.
//
// El valor es la ruta real bajo NOVADATA_BASE_URL (sin la cédula
// final); puede incluir sub-segmentos fijos, ej. "pn_credito/hipotecario".
export const RUTAS_POR_FUENTE: Record<string, string> = {
  general: "data-services/novacredit/pn_inf_basica",
  direcciones: "data-services/novacredit/pn_direcciones",
  telefonos: "data-services/novacredit/pn_telefonos",
  correo: "data-services/novacredit/pn_direccion_correoe",
  padres: "data-services/novacredit/pn_padres",
  hijos: "data-services/novacredit/pn_hijos",
  titulos: "data-services/novacredit/pn_titulos",
  bienesInmueble: "data-services/novacredit/pn_bienes_inmueble",
  vacunados: "api/consultas/novacredit/vacunados/get_inf_byIden",
  empleados: "data-services/novacredit/pn_empleados",
  trabajoHistoricos: "data-services/novacredit/pn_trabajo_historicos",
  trabajoHistoricosMecanizado: "data-services/novacredit/pn_trabajo_historicos/mecanizado",
  cumplimientoPatronal: "data-services/novacredit/pn_cumplimiento_patronal",
  administraciones: "data-services/novacredit/pn_administraciones",
  contribuyente: "api/consultas/novacredit/contribuyente/get_contribuyente_inf",
  sriImpuestoRenta: "data-services/novacredit/pn_sri_impuestos_renta",
  establecimientoActEconomica: "api/consultas/novacredit/establecimiento_act_economica/get_establecimiento_inf",
  afiliacionIess: "data-services/novacredit/pn_afiliacion_iess",
  afiliacionIsspol: "data-services/novacredit/pn_afiliacion_isspol",
  afiliacionIssfacCertMedico: "data-services/novacredit/pn_afiliacion_issfac/cert_medico",
  afiliacionIssfacFuerzaArmada: "data-services/novacredit/pn_afiliacion_issfac/fuerza_armada",
  afiliacionSiisspol: "data-services/novacredit/pn_afiliacion_siisspol",
  afiliacionSalud: "data-services/novacredit/pn_afiliacion_salud",
  pensionista: "data-services/novacredit/pn_pensionista",
  jubilados: "data-services/novacredit/pn_jubilados",
  vehiculos: "data-services/novacredit/pn_vehiculos/general",
  licenciaConducir: "data-services/novacredit/pn_licencia_conducir",
  siniestros: "data-services/novacredit/pn_siniestros",
  polizas: "data-services/novacredit/pn_polizas",
  demandas: "data-services/novacredit/pn_demandas",
  demandasOfendido: "data-services/novacredit/pn_demandas_ofendido",
  impedimentoCargosPublicos: "data-services/novacredit/pn_impedimento_cargos_publicos",
  pensionAlimenticia: "data-services/novacredit/pn_supa",
  pensionAlimenticiaNovadata: "data-services/novacredit/pn_supa/novadata",
  denuncias: "data-services/novacredit/pn_denuncias",
  antecedentesPenales: "data-services/novacredit/pn_antecedentes_penales",
  sercop: "data-services/novacredit/pn_sercop",
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
  buroCreditoCoop: "api/consultas/novacredit/central_riesgo/get_inf_coop",
};

// Todas las fuentes se piden a la vez, como antes: los nueve bloques ya
// eran un Promise.all de Promise.all, así que la concurrencia real
// contra Novadata no cambia al aplanar -- siguen siendo 52 pedidos
// simultáneos. Lo que se va es la agregación intermedia, que tiraba el
// estado de cada fuente para dejar una sola palabra por bloque.
export async function consultarTodasLasFuentes(
  cedula: string,
  credentials?: NovadataCredentials,
  disabledResources: Set<string> = new Set()
): Promise<RespuestaNovadata> {
  const fuentes = Object.entries(RUTAS_POR_FUENTE);
  const resultados = await Promise.all(
    fuentes.map(([fuente, ruta]) =>
      disabledResources.has(fuente)
        ? Promise.resolve<ResultadoFuente<NovadataEnvelope>>({ status: "deshabilitado", data: null })
        : fetchResource<NovadataEnvelope>(ruta, cedula, credentials)
    )
  );

  const respuesta = {} as RespuestaNovadata;
  fuentes.forEach(([fuente], i) => {
    respuesta[fuente] = resultados[i];
  });
  return respuesta;
}
