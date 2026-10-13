// El recorrido completo de una consulta a Equifax, compartido por la función
// desplegada (consultar-equifax) y por el guion local (consultar-equifax-local):
//
//   proveedor activo -> reutilizar -> tope diario -> consultar -> guardar el
//   crudo -> enlazar a la persona -> auditar
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
  laConsultaEquifaxSirve,
  type RespuestaEquifax,
} from "./equifax-client.ts";
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

export type ResultadoDeProceso =
  | { resultado: "reutilizada"; fila: Base; vigenteHasta: string }
  | { resultado: "consultada"; fila: Base; vigenteHasta: string; respuesta: RespuestaEquifax }
  | { resultado: "simulada"; reutilizaria: boolean; consultasHoy: number; tope: number; fechaDeLaVigente?: string }
  | {
    resultado: "rechazada";
    motivo: "proveedor_apagado" | "tope_diario" | "consumo_no_medible" | "fallo" | "no_se_pudo_guardar";
    http: number;
    error: string;
    respuesta?: RespuestaEquifax;
  };

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

  // 4. Consultar.
  const respuesta = await consultar(o.cedula);
  await o.alRecibir?.(respuesta);

  if (!laConsultaEquifaxSirve(respuesta)) {
    const { error } = await o.db.from("audit_log").insert({
      actor: o.actorId,
      action: "equifax.consulta.fallo",
      meta: {
        identificacion: o.cedula,
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

  // 7. Auditoría.
  const { error: errAuditoria } = await o.db.from("audit_log").insert({
    actor: o.actorId,
    action: "equifax.consulta",
    client_id: clientId,
    meta: {
      consulta_equifax_id: guardado.id,
      identificacion: o.cedula,
      ambiente: fila.ambiente,
      intentos: respuesta.intentos,
      duracion_ms: respuesta.duracionMs,
      base_legal: o.baseLegal,
      origen: o.origen,
      transporte: o.transporte,
    },
  });
  if (errAuditoria) console.error("equifax: no se pudo auditar la consulta:", errAuditoria.code ?? errAuditoria.message);

  return { resultado: "consultada", fila: guardado, vigenteHasta: finDeLaVigencia(ahora).toISOString(), respuesta };
}
