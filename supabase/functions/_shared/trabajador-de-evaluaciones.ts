// El cuerpo del trabajador de las evaluaciones de la API: toma las que están
// listas y corre UN paso de cada una. `procesar-evaluaciones` es la envoltura
// (quién llama, el esquema, contestar enseguida); acá vive lo que hay que poder
// probar de punta a punta sin levantar un servidor.
//
// Un paso por invocación, no la evaluación entera: Novadata y el modelo juntos
// pasan los 150 s que vive una función, y un paso que se corta a la mitad se
// retoma solo (el reclamo vence a los 3 minutos y el paso se da por caído).
// El estado vive en `solicitudes`, no en memoria: no hay nada que perder entre
// una invocación y otra.
//
// Llama a los pasos directamente (pasos-de-evaluacion.ts) y no a las funciones
// de la pantalla: así no hay una puerta nueva a la consulta que cobra al buró
// ni a la que gasta modelo. Las consultas quedan a nombre de quien creó la
// evaluación (`creada_por`), que es lo que pregunta un auditor.
//
// El tope de evaluaciones reclamadas a la vez está medido, no supuesto
// (reclamar_evaluaciones, 139): con 24 consultas en paralelo Novadata duplicó
// su mediana y el 28% necesitó reintento; con 8 va más rápido y sin fallas.

import { despuesDeUnPaso, despuesDeUnPasoCortadoDemasiadasVeces, despuesDelPlazo, type FilaDeLaCola } from "./cola-de-evaluaciones.ts";
import { marcarPaso, MODALIDADES, siguientePaso, todosHechos, type RegistroDePaso } from "./modalidades.ts";
import { correrPaso } from "./pasos-de-evaluacion.ts";

// Cuántas evaluaciones se trabajan en cada invocación, y el tope en toda la cola.
const POR_INVOCACION = 4;
const TOPE_EN_VUELO = 8;
// Lo que dura el reclamo: lo mismo que se tarda en dar un paso por caído.
const RECLAMO_SEGUNDOS = 180;
// Si hay evaluaciones pero ninguna con un paso para dar todavía, se vuelve a mirar en esto.
const ESPERA_SIN_PASO_MS = 30_000;

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
type Suerte = "sigue" | "espera" | "terminada" | "perdida";

export interface DependenciasDelTrabajador {
  // Cliente de servicio de supabase-js.
  // deno-lint-ignore no-explicit-any
  db: any;
  despertar: () => Promise<unknown>;
  ahora?: () => Date;
}

export async function rondaDeEvaluaciones({ db, despertar, ahora: reloj = () => new Date() }: DependenciasDelTrabajador): Promise<{ reclamadas: number; sigue: number }> {
  async function auditar(s: Fila, accion: string, meta: Record<string, unknown>) {
    await db.from("audit_log").insert({ actor: s.creada_por, action: accion, client_id: s.client_id ?? null, meta: { solicitud_id: s.id, origen: "api", ...meta } });
  }

  async function avanzar(reclamada: Fila): Promise<Suerte> {
    const ahora = reloj();

    // Se acabó el plazo sin terminar: se cierra en el paso que quedaba.
    const vencida = despuesDelPlazo(reclamada as FilaDeLaCola, ahora);
    if (vencida) {
      await db.from("solicitudes").update(vencida).eq("id", reclamada.id);
      await auditar(reclamada, "solicitud.plazo_vencido", { modalidad: reclamada.modalidad });
      return "terminada";
    }

    const pasos = reclamada.pasos as RegistroDePaso[];
    const paso = siguientePaso(pasos, ahora);
    if (!paso) {
      if (todosHechos(pasos)) {
        await db.from("solicitudes").update({ estado: "evaluada", evaluada_el: ahora.toISOString(), terminada_el: ahora.toISOString(), reclamada_hasta: null, actualizada_el: ahora.toISOString() }).eq("id", reclamada.id);
        return "terminada";
      }
      // Un paso en curso que todavía no se da por caído: se espera, no se pisa.
      await db.from("solicitudes").update({ reclamada_hasta: null, proximo_intento_el: new Date(ahora.getTime() + ESPERA_SIN_PASO_MS).toISOString(), actualizada_el: ahora.toISOString() }).eq("id", reclamada.id);
      return "espera";
    }

    // Un paso que se tomó todas las veces que se podía y siempre murió a mitad de
    // camino no se retoma: el del buró podría pagarse otra vez.
    const cortado = despuesDeUnPasoCortadoDemasiadasVeces(reclamada as FilaDeLaCola, paso, ahora);
    if (cortado) {
      await db.from("solicitudes").update(cortado).eq("id", reclamada.id);
      await auditar(reclamada, "solicitud.paso_fallido", { paso, codigo: "error_interno", definitivo: true, intento: reclamada.intentos });
      return "terminada";
    }

    // Tomar el paso: sólo si nadie cambió la fila desde que se reclamó. Se usan las
    // filas que devolvió la actualización (CLAUDE.md): un paso del buró se cobra.
    // El intento se cuenta acá, antes de correr: si el trabajador muere con el paso
    // a medias, queda contado.
    const { data: tomadas } = await db
      .from("solicitudes")
      .update({ pasos: marcarPaso(pasos, paso, "en_curso", undefined, ahora), intentos: reclamada.intentos + 1, actualizada_el: ahora.toISOString() })
      .eq("id", reclamada.id)
      .eq("actualizada_el", reclamada.actualizada_el)
      .select("*");
    const tomada = tomadas?.[0];
    if (!tomada) return "perdida";

    const resultado = await correrPaso(paso, tomada, { db, actorId: tomada.creada_por, puedeCobrarEquifax: true, ahora });
    const cambios = despuesDeUnPaso(tomada as FilaDeLaCola, paso, resultado, reloj());
    const { data: guardada } = await db.from("solicitudes").update(cambios).eq("id", tomada.id).select("*").maybeSingle();
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

  const { data: reclamadas, error } = await db.rpc("reclamar_evaluaciones", {
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
        await db.from("solicitudes").update({ reclamada_hasta: null, actualizada_el: reloj().toISOString() }).eq("id", f.id);
        return "espera" as Suerte;
      })
    ),
  );
  const sigue = suertes.filter((x) => x === "sigue").length;
  // Hay otro paso listo ya: no esperar al minuto de la agenda.
  if (sigue > 0) await despertar();
  return { reclamadas: filas.length, sigue };
}
