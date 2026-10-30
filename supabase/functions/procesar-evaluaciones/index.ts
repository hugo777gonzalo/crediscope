// El trabajador de las evaluaciones de la API: toma las que están listas y corre
// UN paso de cada una (perfil, buró, análisis, capacidad).
//
// Lo despierta la agenda de la base cada minuto (139), la puerta al recibir un
// pedido, y él mismo al terminar un paso que deja otro listo. Así una
// evaluación de Plus no espera el minuto de la agenda entre un paso y el
// siguiente; la agenda queda como red de seguridad si alguno se corta.
//
// Un paso por invocación, no la evaluación entera: Novadata y el modelo juntos
// pasan los 150 s que vive una función, y un paso que se corta a la mitad se
// retoma solo (el reclamo vence a los 3 minutos y el paso se da por caído).
// El estado vive en `solicitudes`, no en memoria: no hay nada que perder entre
// una invocación y otra.
//
// Quién corre: este trabajador, con la clave de la agenda (x-vigia-clave, la
// misma del vigía y del trabajador de lotes, comparada en tiempo constante).
// Llama a los pasos directamente (pasos-de-evaluacion.ts) y no a las funciones
// de la pantalla: así no hay una puerta nueva a la consulta que cobra al buró
// ni a la que gasta modelo. Las consultas quedan a nombre de quien creó la
// evaluación (`creada_por`), que es lo que pregunta un auditor.
//
// El tope de evaluaciones reclamadas a la vez está medido, no supuesto
// (reclamar_evaluaciones, 139): con 24 consultas en paralelo Novadata duplicó
// su mediana y el 28% necesitó reintento; con 8 va más rápido y sin fallas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasSinCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { clavesIguales } from "../_shared/autorizacion.ts";
import { despuesDeUnPaso, despuesDeUnPasoCortadoDemasiadasVeces, despuesDelPlazo, type FilaDeLaCola } from "../_shared/cola-de-evaluaciones.ts";
import { marcarPaso, MODALIDADES, siguientePaso, todosHechos, type RegistroDePaso } from "../_shared/modalidades.ts";
import { correrPaso } from "../_shared/pasos-de-evaluacion.ts";
import { despertarAlTrabajador } from "../_shared/despertar-trabajador.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VIGIA_CLAVE = Deno.env.get("VIGIA_CLAVE") ?? "";

// Cuántas evaluaciones se trabajan en cada invocación, y el tope en toda la cola.
const POR_INVOCACION = 4;
const TOPE_EN_VUELO = 8;
// Lo que dura el reclamo: lo mismo que se tarda en dar un paso por caído.
const RECLAMO_SEGUNDOS = 180;
// Si hay evaluaciones pero ninguna con un paso para dar todavía, se vuelve a mirar en esto.
const ESPERA_SIN_PASO_MS = 30_000;

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void } | undefined;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
type Suerte = "sigue" | "espera" | "terminada" | "perdida";

async function auditar(s: Fila, accion: string, meta: Record<string, unknown>) {
  await serviceClient.from("audit_log").insert({ actor: s.creada_por, action: accion, client_id: s.client_id ?? null, meta: { solicitud_id: s.id, origen: "api", ...meta } });
}

async function avanzar(reclamada: Fila): Promise<Suerte> {
  const ahora = new Date();

  // Se acabó el plazo sin terminar: se cierra en el paso que quedaba.
  const vencida = despuesDelPlazo(reclamada as FilaDeLaCola, ahora);
  if (vencida) {
    await serviceClient.from("solicitudes").update(vencida).eq("id", reclamada.id);
    await auditar(reclamada, "solicitud.plazo_vencido", { modalidad: reclamada.modalidad });
    return "terminada";
  }

  const pasos = reclamada.pasos as RegistroDePaso[];
  const paso = siguientePaso(pasos, ahora);
  if (!paso) {
    if (todosHechos(pasos)) {
      await serviceClient.from("solicitudes").update({ estado: "evaluada", evaluada_el: ahora.toISOString(), terminada_el: ahora.toISOString(), reclamada_hasta: null, actualizada_el: ahora.toISOString() }).eq("id", reclamada.id);
      return "terminada";
    }
    // Un paso en curso que todavía no se da por caído: se espera, no se pisa.
    await serviceClient.from("solicitudes").update({ reclamada_hasta: null, proximo_intento_el: new Date(ahora.getTime() + ESPERA_SIN_PASO_MS).toISOString(), actualizada_el: ahora.toISOString() }).eq("id", reclamada.id);
    return "espera";
  }

  // Un paso que se tomó todas las veces que se podía y siempre murió a mitad de
  // camino no se retoma: el del buró podría pagarse otra vez.
  const cortado = despuesDeUnPasoCortadoDemasiadasVeces(reclamada as FilaDeLaCola, paso, ahora);
  if (cortado) {
    await serviceClient.from("solicitudes").update(cortado).eq("id", reclamada.id);
    await auditar(reclamada, "solicitud.paso_fallido", { paso, codigo: "error_interno", definitivo: true, intento: reclamada.intentos });
    return "terminada";
  }

  // Tomar el paso: sólo si nadie cambió la fila desde que se reclamó. Se usan las
  // filas que devolvió la actualización (CLAUDE.md): un paso del buró se cobra.
  // El intento se cuenta acá, antes de correr: si el trabajador muere con el paso
  // a medias, queda contado.
  const { data: tomadas } = await serviceClient
    .from("solicitudes")
    .update({ pasos: marcarPaso(pasos, paso, "en_curso", undefined, ahora), intentos: reclamada.intentos + 1, actualizada_el: ahora.toISOString() })
    .eq("id", reclamada.id)
    .eq("actualizada_el", reclamada.actualizada_el)
    .select("*");
  const tomada = tomadas?.[0];
  if (!tomada) return "perdida";

  const resultado = await correrPaso(paso, tomada, { db: serviceClient, actorId: tomada.creada_por, puedeCobrarEquifax: true });
  const cambios = despuesDeUnPaso(tomada as FilaDeLaCola, paso, resultado, new Date());
  const { data: guardada } = await serviceClient.from("solicitudes").update(cambios).eq("id", tomada.id).select("*").maybeSingle();
  // Lo que hizo el paso quedó guardado por su módulo: sin la anotación, el paso
  // sigue en curso, se da por caído a los 3 minutos y se retoma reutilizando lo
  // guardado (el buró no se vuelve a pagar).
  if (!guardada) {
    console.error("procesar-evaluaciones: el paso terminó pero no se pudo anotar", paso);
    return "perdida";
  }

  if (resultado.ok) {
    if (guardada.estado === "evaluada") {
      await auditar(guardada, "solicitud.evaluada", { modalidad: guardada.modalidad, pasos: MODALIDADES[guardada.modalidad as keyof typeof MODALIDADES].pasos });
      return "terminada";
    }
    return "sigue";
  }
  // Qué pasó con el fallo: reprogramado para más tarde, o definitivo. Sin el
  // mensaje: el del paso es nuestro, pero el detalle va a la fila y no hace falta
  // repetirlo en la auditoría.
  const definitivo = guardada.estado === "fallida";
  await auditar(guardada, "solicitud.paso_fallido", { paso, codigo: resultado.fallo.codigo, definitivo, intento: tomada.intentos });
  return definitivo ? "terminada" : "espera";
}

async function ronda(): Promise<{ reclamadas: number; sigue: number }> {
  const { data: reclamadas, error } = await serviceClient.rpc("reclamar_evaluaciones", {
    p_max: POR_INVOCACION,
    p_tope_en_vuelo: TOPE_EN_VUELO,
    p_segundos: RECLAMO_SEGUNDOS,
  });
  if (error) {
    console.error("procesar-evaluaciones: no se pudo reclamar", error.code);
    return { reclamadas: 0, sigue: 0 };
  }
  const filas = (reclamadas ?? []) as Fila[];
  const suertes = await Promise.all(
    filas.map((f) =>
      avanzar(f).catch(async (err) => {
        // Algo nuestro, fuera de un paso: se suelta el reclamo para que otro lo intente.
        console.error("procesar-evaluaciones:", (err as Error)?.name);
        await serviceClient.from("solicitudes").update({ reclamada_hasta: null, actualizada_el: new Date().toISOString() }).eq("id", f.id);
        return "espera" as Suerte;
      })
    ),
  );
  const sigue = suertes.filter((x) => x === "sigue").length;
  // Hay otro paso listo ya: no esperar al minuto de la agenda.
  if (sigue > 0) await despertarAlTrabajador();
  return { reclamadas: filas.length, sigue };
}

Deno.serve(async (req) => {
  const cabeceras = { ...cabecerasSinCors(), "content-type": "application/json" };
  const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: cabeceras });
  // El corredor de despliegue confirma el sello preguntando con OPTIONS.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecerasSinCors() });
  if (req.method !== "POST") return responder({ error: "Sólo POST." }, 405);
  if (!VIGIA_CLAVE || !clavesIguales(req.headers.get("x-vigia-clave") ?? "", VIGIA_CLAVE)) return responder({ error: "no autorizado" }, 401);

  const sinEsquema = await exigirEsquema(serviceClient, cabeceras);
  if (sinEsquema) return sinEsquema;

  // Contesta enseguida y trabaja en segundo plano: quien despierta (la agenda, la
  // puerta, otra invocación) no tiene que esperar un paso de dos minutos.
  const trabajo = ronda().catch((err) => console.error("procesar-evaluaciones:", (err as Error)?.name));
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(trabajo);
    return responder({ aceptado: true }, 202);
  }
  return responder({ aceptado: true, ...(await trabajo) });
});
