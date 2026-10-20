// El recorrido completo de una consulta a Equifax, compartido por la función
// desplegada (consultar-equifax) y por el guion local (consultar-equifax-local):
//
//   proveedor activo -> reutilizar -> tope diario -> consultar -> guardar el
//   crudo -> descomponerlo en tablas -> enlazar a la persona -> auditar
//
// Una sola implementación: con Aval, el guion local tuvo su propia copia de
// este recorrido y fue como aparecieron diferencias entre lo que validaba una
// y otra. Acá cada decisión (reutilizar, topar, guardar) vive una vez.
//
// CADA CONSULTA SE COBRA Y EQUIFAX NO PONE TOPE (negocio, 2026-10-12). Por eso
// la protección contra un error nuestro (un bucle, un reintento, un lote mal
// armado) es nuestra: el tope diario. Si no se puede medir el consumo, no se
// consulta.
//
// REUTILIZACIÓN: lo que Equifax contestó se guarda entero y una consulta
// vigente (hasta el 17 de cada mes, ver vigencia-mensual.ts) se reutiliza en
// vez de volver a pagar. La reutilización es por persona, no por parámetros de
// la decisión: los parámetros son de relleno y el buró de la persona es el
// mismo.

import {
  ambienteEquifax,
  consultarEquifax,
  documentoDeLaRespuesta,
  laConsultaEquifaxSirve,
  type RespuestaEquifax,
} from "./equifax-client.ts";
import { calcularEstructura, EQUIFAX_ESTRUCTURA_VERSION } from "./equifax-estructura.ts";
import { derivarTablas } from "./equifax-tablas.ts";
import { estaVigenteHastaElCorte, finDeLaVigencia } from "./vigencia-mensual.ts";

export const TOPE_DIARIO_POR_DEFECTO = 30;

export function topeDiario(): number {
  const n = Number(Deno.env.get("EQUIFAX_TOPE_DIARIO") ?? TOPE_DIARIO_POR_DEFECTO);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : TOPE_DIARIO_POR_DEFECTO;
}

// 00:00 de Ecuador (UTC-5, sin horario de verano) del día de `ahora`, en UTC.
export function inicioDelDiaEcuador(ahora: Date = new Date()): Date {
  const local = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 5, 0, 0, 0));
}

// deno-lint-ignore no-explicit-any
type Base = any;

export interface Transporte {
  tipo: "funcion" | "local";
  motivo?: string;
  guion?: string;
}

export interface OpcionesDeProceso {
  db: Base;
  cedula: string;          // ya validada por quien llama
  actorId: string;         // quién se hace cargo: sale de la sesión o del guion, nunca del cuerpo de un pedido
  baseLegal: string;
  origen: "consulta" | "lote";
  forzar?: boolean;        // salta la reutilización (vuelve a cobrar)
  simular?: boolean;       // recorre todo MENOS la llamada a Equifax
  transporte: Transporte;
  // Se llama con lo que contestó Equifax ANTES de interpretarlo o guardarlo:
  // una respuesta cobrada no se puede perder por un error nuestro después.
  alRecibir?: (r: RespuestaEquifax) => void | Promise<void>;
  consultar?: typeof consultarEquifax; // para pruebas
  ahora?: Date;
}

// Lo que pasó al descomponer el crudo en tablas (126). `ok: false` NO es una consulta fallida: el
// crudo ya está guardado y las tablas se rehacen sin volver a pagar.
export interface TablasGuardadas {
  ok: boolean;
  conteos?: Record<string, number>;
  avisos: string[];
  codigo?: string;
  mensaje?: string;
}

export type ResultadoDeProceso =
  | { resultado: "reutilizada"; fila: Base; vigenteHasta: string }
  | { resultado: "consultada"; fila: Base; vigenteHasta: string; respuesta: RespuestaEquifax; tablas: TablasGuardadas }
  | { resultado: "simulada"; reutilizaria: boolean; consultasHoy: number; tope: number; fechaDeLaVigente?: string }
  | {
    resultado: "rechazada";
    motivo: "proveedor_apagado" | "tope_diario" | "consumo_no_medible" | "equifax_no_responde" | "fallo" | "otra_persona" | "no_se_pudo_guardar";
    http: number;
    error: string;
    respuesta?: RespuestaEquifax;
  };

// El freno (negocio, 2026-10-19): tras 3 fallos seguidos de Equifax, las consultas
// siguientes no salen hasta que pasen 10 minutos desde el último. Cada intento
// que llega a Equifax puede cobrarse (un timeout seguro) y hace esperar a quien
// consulta hasta 60 s: con Equifax caído, cada analista lo volvía a golpear.
//
// «Seguidos» son los 3 últimos resultados (consulta que sirvió o fallo), sin
// importar la persona. Un fallo cuenta sólo si dice que Equifax no está
// respondiendo (no llegó, 5xx, credenciales rechazadas o respuesta
// incomprensible): un pedido mal armado o una identificación que Equifax no
// acepta es de esa persona, no de Equifax. Pasados los 10 minutos deja salir UNA
// consulta de prueba: si falla, los últimos 3 siguen siendo fallos y se cierra
// de nuevo; si sirve, se reinicia la cuenta.
export const FRENO_FALLOS_SEGUIDOS = 3;
export const FRENO_ESPERA_MS = 10 * 60 * 1000;
const FAMILIAS_DE_CAIDA = new Set(["transitorio", "sin_respuesta", "desconocido", "configuracion"]);

export async function frenoDeEquifax(db: Base, ahora: Date = new Date()): Promise<{ abierto: boolean; ultimoFallo?: string }> {
  const { data, error } = await db.from("audit_log").select("action, created_at, meta")
    .in("action", ["equifax.consulta", "equifax.consulta.fallo"])
    .order("created_at", { ascending: false }).limit(FRENO_FALLOS_SEGUIDOS);
  // Si no se puede leer, no se frena: el que protege la plata es el tope diario, y un freno que
  // se cierra solo por no poder leer dejaría a todos sin Equifax por un fallo ajeno a Equifax.
  if (error) {
    console.error("equifax: no se pudo leer el freno:", error.code ?? error.message);
    return { abierto: false };
  }
  const ultimos: Base[] = Array.isArray(data) ? data : [];
  if (ultimos.length < FRENO_FALLOS_SEGUIDOS) return { abierto: false };
  const todosCaidas = ultimos.every((f) => f.action === "equifax.consulta.fallo" && FAMILIAS_DE_CAIDA.has(String(f.meta?.familia)));
  const hace = ahora.getTime() - Date.parse(ultimos[0].created_at);
  return todosCaidas && hace < FRENO_ESPERA_MS ? { abierto: true, ultimoFallo: ultimos[0].created_at } : { abierto: false };
}

export async function consultasDeHoy(db: Base, ahora: Date = new Date()): Promise<number> {
  const desde = inicioDelDiaEcuador(ahora).toISOString();
  const [guardadas, dudosas] = await Promise.all([
    db.from("consultas_equifax").select("id", { count: "exact", head: true }).gte("created_at", desde),
    // Una consulta que falló pero pudo haberse cobrado (timeout, respuesta
    // rara) cuenta: es plata que salió o pudo salir.
    db.from("audit_log").select("id", { count: "exact", head: true })
      .eq("action", "equifax.consulta.fallo").gte("created_at", desde)
      .filter("meta->>puede_haber_cobrado", "eq", "true"),
  ]);
  if (guardadas.error || dudosas.error) {
    throw new Error("no se pudo contar el consumo del día: " + (guardadas.error?.message ?? dudosas.error?.message));
  }
  return (guardadas.count ?? 0) + (dudosas.count ?? 0);
}

// ¿De quién es la respuesta? true = el documento que trae es el pedido; null = la respuesta no trae
// documento y no se pudo comprobar. (Una respuesta de OTRA persona no llega a guardarse.)
export function identidadDeLaConsulta(cuerpo: unknown, cedula: string): boolean | null {
  const documento = documentoDeLaRespuesta(cuerpo as Record<string, unknown> | undefined);
  return documento === null ? null : documento === cedula;
}

// Descompone el crudo YA GUARDADO de una consulta en las tablas equifax_* y calcula su estructura
// (docs/propuesta-estructura-equifax.md), todo en una llamada atómica a la base
// (equifax_reemplazar_tablas, 126). La misma función sirve para una consulta recién pagada y para
// rehacer las de antes desde su crudo (scripts/cargar-tablas-equifax.mjs): una sola implementación.
// Nunca lanza: devuelve ok:false y dice por qué.
export async function guardarTablasDeLaConsulta(
  db: Base,
  consulta: { id: string; identificacion: string; created_at: string; ambiente: string; respuesta_cruda: unknown },
): Promise<TablasGuardadas> {
  let avisos: string[] = [];
  try {
    const derivadas = derivarTablas(consulta.respuesta_cruda);
    avisos = derivadas.avisos;
    const estructura = calcularEstructura(derivadas, {
      consultadoEl: consulta.created_at,
      ambiente: consulta.ambiente,
      identidadVerificada: identidadDeLaConsulta(consulta.respuesta_cruda, consulta.identificacion),
    });
    const { data, error } = await db.rpc("equifax_reemplazar_tablas", {
      p_consulta: consulta.id,
      p_tablas: derivadas.tablas,
      p_estructura: estructura,
      p_version_tablas: derivadas.version,
      p_version_estructura: EQUIFAX_ESTRUCTURA_VERSION,
    });
    if (error) return { ok: false, avisos, codigo: error.code, mensaje: String(error.message ?? "").split("\n")[0].slice(0, 160) };
    return { ok: true, conteos: data ?? {}, avisos };
  } catch (err) {
    // Sin el mensaje completo: un error al interpretar un valor puede repetirlo.
    return { ok: false, avisos, codigo: (err as Error)?.name, mensaje: String((err as Error)?.message ?? "").split("\n")[0].slice(0, 160) };
  }
}

// La persona va a audit_log por client_id, nunca por su número en meta: audit_log lo lee todo usuario
// con sesión y no se puede corregir después (113). Hasta el 2026-10-13 cada consulta dejaba ahí la
// cédula. Un fallo no crea a la persona; si todavía no existe, la constancia queda sin enlace.
async function personaConocida(db: Base, cedula: string): Promise<string | null> {
  const { data } = await db.from("clients").select("id").eq("cedula", cedula).maybeSingle();
  return data?.id ?? null;
}

async function consultaVigente(db: Base, cedula: string, ahora: Date) {
  const { data, error } = await db.from("consultas_equifax").select("*")
    .eq("identificacion", cedula).eq("tipo_identificacion", "C")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("no se pudo buscar una consulta vigente: " + error.message);
  return data && estaVigenteHastaElCorte(data.created_at, ahora) ? data : null;
}

export async function procesarConsultaEquifax(o: OpcionesDeProceso): Promise<ResultadoDeProceso> {
  const ahora = o.ahora ?? new Date();
  const consultar = o.consultar ?? consultarEquifax;

  // 1. ¿Equifax está prendido? Se mira ANTES de reutilizar: reutilizar mientras
  //    el proveedor está apagado por decisión operativa seguiría sirviendo una
  //    fuente que la institución decidió no usar (mismo criterio que Aval).
  const { data: proveedor, error: errProveedor } = await o.db.from("proveedores").select("activo, notas").eq("clave", "equifax").maybeSingle();
  if (errProveedor) {
    return { resultado: "rechazada", motivo: "proveedor_apagado", http: 503, error: "No se pudo verificar si Equifax está activo. No se consultó." };
  }
  if (!proveedor || !proveedor.activo) {
    return {
      resultado: "rechazada", motivo: "proveedor_apagado", http: 503,
      error: `Equifax está desactivado como proveedor.${proveedor?.notas ? ` ${proveedor.notas}` : ""}`,
    };
  }

  // 2. Reutilizar una consulta vigente.
  let previa: Base = null;
  try {
    if (!o.forzar) previa = await consultaVigente(o.db, o.cedula, ahora);
  } catch (err) {
    return { resultado: "rechazada", motivo: "no_se_pudo_guardar", http: 500, error: (err as Error).message };
  }
  if (previa && !o.simular) {
    return { resultado: "reutilizada", fila: previa, vigenteHasta: finDeLaVigencia(ahora).toISOString() };
  }

  // 3. Tope diario. Si no se puede medir, no se consulta: sin el número no hay tope.
  let hoy: number;
  try {
    hoy = await consultasDeHoy(o.db, ahora);
  } catch (err) {
    return { resultado: "rechazada", motivo: "consumo_no_medible", http: 503, error: `${(err as Error).message}. No se consultó.` };
  }
  const tope = topeDiario();

  if (o.simular) {
    return { resultado: "simulada", reutilizaria: previa !== null, consultasHoy: hoy, tope, fechaDeLaVigente: previa?.created_at };
  }
  if (hoy >= tope) {
    return {
      resultado: "rechazada", motivo: "tope_diario", http: 429,
      error: `Se llegó al tope diario de consultas a Equifax (${tope}); cada consulta se cobra. Subirlo requiere cambiar EQUIFAX_TOPE_DIARIO a propósito.`,
    };
  }

  // 3b. El freno: con Equifax caído no se vuelve a llamar. No se consultó ni se cobró.
  const freno = await frenoDeEquifax(o.db, ahora);
  if (freno.abierto) {
    return {
      resultado: "rechazada", motivo: "equifax_no_responde", http: 503,
      error: `Equifax no está respondiendo (${FRENO_FALLOS_SEGUIDOS} fallos seguidos). No se consultó ni se cobró. Se vuelve a intentar pasados ${FRENO_ESPERA_MS / 60000} minutos del último fallo.`,
    };
  }

  // 4. Consultar.
  const respuesta = await consultar(o.cedula);
  await o.alRecibir?.(respuesta);

  if (!laConsultaEquifaxSirve(respuesta)) {
    const { error } = await o.db.from("audit_log").insert({
      actor: o.actorId,
      action: "equifax.consulta.fallo",
      client_id: await personaConocida(o.db, o.cedula),
      meta: {
        familia: respuesta.familia,
        http_equifax: respuesta.httpEquifax ?? null,
        intentos: respuesta.intentos,
        duracion_ms: respuesta.duracionMs,
        puede_haber_cobrado: respuesta.puedeHaberCobrado,
        mensaje: respuesta.mensaje ?? null,
        detalle_tecnico: respuesta.detalleTecnico ?? null,
        cabeceras: respuesta.cabeceras ?? null,
        base_legal: o.baseLegal,
        transporte: o.transporte,
      },
    });
    if (error) console.error("equifax: no se pudo auditar el fallo:", error.code ?? error.message);
    return { resultado: "rechazada", motivo: "fallo", http: respuesta.httpStatus, error: respuesta.mensaje ?? "Equifax no contestó.", respuesta };
  }

  // 4b. ¿Contestó por la persona pedida? Con Aval, el ambiente de prueba
  //     contestó por otra persona en el 37% y el filtro de calidad no lo
  //     veía. Una respuesta por otra persona no se guarda ni se reutiliza,
  //     pero se cobró: queda constancia (sin el documento ajeno, que es
  //     dato de un tercero) y cuenta para el tope. Si la respuesta no trae
  //     el documento no se puede verificar y se guarda diciéndolo.
  const documento = documentoDeLaRespuesta(respuesta.cuerpo);
  if (documento !== null && documento !== o.cedula) {
    const { error } = await o.db.from("audit_log").insert({
      actor: o.actorId,
      action: "equifax.consulta.fallo",
      client_id: await personaConocida(o.db, o.cedula),
      meta: {
        familia: "otra_persona",
        http_equifax: respuesta.httpEquifax ?? null,
        intentos: respuesta.intentos,
        duracion_ms: respuesta.duracionMs,
        puede_haber_cobrado: true,
        mensaje: "Equifax contestó por una identificación distinta de la pedida. No se guardó.",
        cabeceras: respuesta.cabeceras ?? null,
        base_legal: o.baseLegal,
        transporte: o.transporte,
      },
    });
    if (error) console.error("equifax: no se pudo auditar la respuesta de otra persona:", error.code ?? error.message);
    return {
      resultado: "rechazada", motivo: "otra_persona", http: 502, respuesta,
      error: "Equifax contestó por una identificación distinta de la pedida (la consulta se cobró). No se guardó.",
    };
  }
  const identidadVerificada = documento !== null;

  // 5. Enlace blando a la persona del registro común (mismo patrón que Aval).
  let clientId: string | null = null;
  const { data: existente } = await o.db.from("clients").select("id").eq("cedula", o.cedula).maybeSingle();
  if (existente) {
    clientId = existente.id;
  } else {
    const { data: creado, error: errCrear } = await o.db.from("clients").insert({ cedula: o.cedula }).select("id").single();
    if (errCrear) {
      return { resultado: "rechazada", motivo: "no_se_pudo_guardar", http: 500, error: `Equifax contestó pero no se pudo crear a la persona: ${errCrear.message}`, respuesta };
    }
    clientId = creado.id;
  }

  // 6. Guardar el crudo. Es lo que se cobró: si falla se intenta una vez más
  //    antes de rendirse, y el que llamó ya tiene la respuesta en `alRecibir`.
  const fila = {
    identificacion: o.cedula,
    tipo_identificacion: "C",
    client_id: clientId,
    respuesta_cruda: respuesta.cuerpo,
    http_equifax: respuesta.httpEquifax ?? 200,
    cabeceras_respuesta: respuesta.cabeceras ?? {},
    parametros: respuesta.parametros ?? {},
    duracion_ms: respuesta.duracionMs,
    intentos: respuesta.intentos,
    requested_by: o.actorId,
    origen: o.origen,
    base_legal: o.baseLegal,
    ambiente: ambienteEquifax(),
  };
  let guardado: Base = null;
  let errGuardar: Base = null;
  for (let i = 0; i < 2 && !guardado; i++) {
    const r = await o.db.from("consultas_equifax").insert(fila).select("*").single();
    guardado = r.data;
    errGuardar = r.error;
  }
  if (!guardado) {
    return {
      resultado: "rechazada", motivo: "no_se_pudo_guardar", http: 500, respuesta,
      error: `Equifax contestó (y la consulta se cobró) pero no se pudo guardar: ${errGuardar?.message ?? "sin detalle"}.`,
    };
  }

  // 6b. Las tablas y la estructura, derivadas del crudo que ya quedó guardado. Si algo falla la
  //     consulta (que se cobró) NO se pierde ni se da por fallida: el crudo está a salvo y las tablas
  //     se rehacen sin volver a pagar. Queda constancia para que no pase inadvertido.
  const tablas = await guardarTablasDeLaConsulta(o.db, guardado);
  if (!tablas.ok) {
    console.error("equifax: no se pudieron derivar las tablas:", tablas.codigo ?? "sin código");
    const { error: errTablas } = await o.db.from("audit_log").insert({
      actor: o.actorId,
      action: "equifax.tablas.fallo",
      client_id: clientId,
      meta: { consulta_equifax_id: guardado.id, codigo: tablas.codigo ?? null, mensaje: tablas.mensaje ?? null, avisos: tablas.avisos },
    });
    if (errTablas) console.error("equifax: no se pudo auditar el fallo de las tablas:", errTablas.code ?? errTablas.message);
  }

  // 7. Auditoría.
  const { error: errAuditoria } = await o.db.from("audit_log").insert({
    actor: o.actorId,
    action: "equifax.consulta",
    client_id: clientId,
    meta: {
      consulta_equifax_id: guardado.id,
      ambiente: fila.ambiente,
      intentos: respuesta.intentos,
      duracion_ms: respuesta.duracionMs,
      base_legal: o.baseLegal,
      origen: o.origen,
      transporte: o.transporte,
      // false = la respuesta no trajo el documento y no se pudo comprobar de quién era.
      identidad_verificada: identidadVerificada,
    },
  });
  if (errAuditoria) console.error("equifax: no se pudo auditar la consulta:", errAuditoria.code ?? errAuditoria.message);

  return { resultado: "consultada", fila: guardado, vigenteHasta: finDeLaVigencia(ahora).toISOString(), respuesta, tablas };
}
