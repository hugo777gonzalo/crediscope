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

// Cuánto se espera a cada fuente. Medido el 2026-10-09: en el uso normal
// desde la pantalla una consulta entera (las 52 a la vez) tardó como mucho
// 57 s; la cola larga aparece sólo en las reconsultas masivas, cuando
// Novadata se pone lenta (el 2026-09-15, 525 de 1.915 pasaron de 100 s).
// Sin tope, una fuente colgada arrastraba la consulta al corte de 150 s de
// Supabase y se perdía todo, incluido lo que sí había contestado. Con
// 120 s queda margen para el token, armar el perfil y guardarlo, y lo que
// hoy termina sigue terminando: sólo se corta lo que igual iba a morir.
export const PLAZO_POR_FUENTE_MS = 120_000;
const PLAZO_TOKEN_MS = 20_000;

// Cache en memoria SOLO para las credenciales de servicio (env vars) —
// usadas por analyze-client en cada corrida automática. Credenciales
// explícitas (ver explore-novadata, donde el usuario tipea las suyas en
// el explorador web) nunca se cachean, para no mezclar tokens entre
// personas distintas que usen el explorador.
let cachedToken: { value: string; expiresAt: number } | null = null;

// El pedido de token en curso, compartido. Hasta el 2026-10-09 cada una
// de las 52 fuentes pedía su propio token: con la instancia recién
// levantada o el token vencido eran 52 inicios de sesión simultáneos con
// usuario y contraseña, que el proveedor puede leer como un ataque y
// responder bloqueando la cuenta (auditoría externa, E5). Ahora la
// consulta pide uno solo, y las consultas que llegan mientras tanto
// esperan ese mismo pedido.
let tokenEnCurso: Promise<string> | null = null;

async function pedirToken(credentials?: NovadataCredentials): Promise<{ value: string; expiresAt: number }> {
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
    signal: AbortSignal.timeout(PLAZO_TOKEN_MS),
  });
  if (!res.ok) {
    throw new Error(`No se pudo autenticar con Novadata (HTTP ${res.status})`);
  }
  const data = await res.json();
  return { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

async function getAccessToken(credentials?: NovadataCredentials): Promise<string> {
  if (credentials) return (await pedirToken(credentials)).value;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5_000) {
    return cachedToken.value;
  }
  if (!tokenEnCurso) {
    tokenEnCurso = pedirToken()
      .then((token) => {
        cachedToken = token;
        return token.value;
      })
      .finally(() => {
        tokenEnCurso = null;
      });
  }
  return await tokenEnCurso;
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
      // Sin tope, un proveedor colgado dejaba al vigía esperando hasta el
      // corte de la plataforma, y la caída no se registraba.
      signal: AbortSignal.timeout(PLAZO_TOKEN_MS),
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
  token: string,
  plazoMs: number
): Promise<ResultadoFuente<T>> {
  const inicio = Date.now();
  // Cuánto tardó cada fuente, que hasta el 2026-10-09 no se medía: sólo
  // había el total de la consulta, y sin el detalle no se sabe qué fuente
  // arrastra a las demás.
  const medido = (r: ResultadoFuente<T>): ResultadoFuente<T> => ({ ...r, duracionMs: Date.now() - inicio });
  try {
    const res = await fetch(`${NOVADATA_BASE_URL}/${path}/${encodeURIComponent(cedula)}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Cubre también la lectura del cuerpo: una respuesta que empieza y se
      // queda a medias corta igual.
      signal: AbortSignal.timeout(plazoMs),
    });
    if (res.status === 404) {
      return medido({ status: "faltante", data: null });
    }
    if (res.status === 204) {
      return medido({ status: "faltante", data: null });
    }
    if (!res.ok) {
      return medido({ status: "error", data: null, errorMessage: `Novadata respondió HTTP ${res.status}` });
    }
    const body = await res.json();
    if (!isEstadoOk(body)) {
      // El motivo viaja aunque el bloque quede como faltante: es lo que
      // permite distinguir después "sin datos" de "no existe".
      return medido({ status: "faltante", data: null, errorMessage: mensajeDelEstado(body) });
    }
    return medido({ status: "ok", data: body as T });
  } catch (err) {
    // "error" y no "faltante": la fuente no contestó, no dijo que no hay
    // (calidad-de-la-consulta.ts). Se marca aparte para que quien llama
    // sepa que fue el plazo y no una falla del proveedor.
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return medido({
        status: "error",
        data: null,
        errorMessage: `no contestó en ${Math.round(plazoMs / 1000)} s`,
        tiempoAgotado: true,
      });
    }
    return medido({ status: "error", data: null, errorMessage: String(err) });
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
//
// No se limita la concurrencia de una consulta (la auditoría externa lo
// proponía): medido el 2026-10-09, una consulta suelta termina en menos de
// un minuto, y ponerlas en fila la haría más lenta. Lo que satura a
// Novadata son las reconsultas masivas, y eso se regula con la
// concurrencia del lote, no acá.
//
// plazoMs: cuánto se espera a cada fuente (PLAZO_POR_FUENTE_MS si no se
// dice). El trabajador de lotes pasa uno menor cuando le queda poco tiempo.
export async function consultarTodasLasFuentes(
  cedula: string,
  credentials?: NovadataCredentials,
  disabledResources: Set<string> = new Set(),
  plazoMs: number = PLAZO_POR_FUENTE_MS
): Promise<RespuestaNovadata> {
  const fuentes = Object.entries(RUTAS_POR_FUENTE);

  // Un token para toda la consulta. Si no se puede obtener, cada fuente
  // queda en error con ese motivo, igual que cuando lo pedía cada una: así
  // la consulta entera se reconoce como "no contestó" (503) y se reintenta.
  let token: string | null = null;
  let sinToken: string | null = null;
  if (!credentials && (!NOVADATA_USERNAME || !NOVADATA_PASSWORD)) {
    sinToken = "Novadata no configurado (faltan NOVADATA_USERNAME / NOVADATA_PASSWORD)";
  } else {
    try {
      token = await getAccessToken(credentials);
    } catch (err) {
      sinToken = err instanceof Error ? err.message : String(err);
    }
  }

  const resultados = await Promise.all(
    fuentes.map(([fuente, ruta]) =>
      disabledResources.has(fuente)
        ? Promise.resolve<ResultadoFuente<NovadataEnvelope>>({ status: "deshabilitado", data: null })
        : token === null
          ? Promise.resolve<ResultadoFuente<NovadataEnvelope>>({ status: "error", data: null, errorMessage: sinToken ?? "sin token" })
          : fetchResource<NovadataEnvelope>(ruta, cedula, token, plazoMs)
    )
  );

  const respuesta = {} as RespuestaNovadata;
  fuentes.forEach(([fuente], i) => {
    respuesta[fuente] = resultados[i];
  });
  return respuesta;
}

// Cuánto tardó cada fuente, en milisegundos, para guardar con el perfil
// (client_profiles.duracion_por_fuente_ms, 119). Las apagadas no aparecen.
export function duracionesPorFuente(raw: RespuestaNovadata): Record<string, number> {
  const salida: Record<string, number> = {};
  for (const [fuente, resultado] of Object.entries(raw)) {
    if (typeof resultado?.duracionMs === "number") salida[fuente] = resultado.duracionMs;
  }
  return salida;
}

// Las fuentes que se cortaron por el plazo y no por una falla del
// proveedor. El trabajador de lotes las usa para reintentar en vez de
// guardar un perfil incompleto por culpa de su propio reloj.
export function fuentesQueAgotaronElPlazo(raw: RespuestaNovadata): string[] {
  return Object.entries(raw)
    .filter(([, resultado]) => resultado?.tiempoAgotado === true)
    .map(([fuente]) => fuente);
}
