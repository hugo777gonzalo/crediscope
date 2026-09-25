// El trabajador de los lotes: toma cédulas pendientes y las consulta.
//
// POR QUÉ CORRE EN EL SERVIDOR Y NO EN EL NAVEGADOR
//
// Un lote de mil cédulas son horas. Si lo manejara la pantalla, cerrar
// la pestaña -- o que se apague la máquina, o que el navegador duerma la
// pestaña de fondo, que es lo que hacen todos -- dejaría el lote a
// medias sin que nadie se entere. Acá lo dispara el programador de
// tareas de la base cada minuto: se sube el archivo, se cierra todo, y
// el lote avanza igual.
//
// CADA CORRIDA HACE UN PEDAZO Y SE VA
//
// Una función tiene un tiempo máximo de vida. En vez de pelear contra
// eso, cada invocación trabaja mientras le quede presupuesto y termina
// prolijamente; la próxima sigue donde esta dejó. El estado vive en la
// base, no en memoria, así que no hay nada que perder entre una y otra.
//
// LA CONCURRENCIA ESTÁ MEDIDA, NO SUPUESTA
//
// Con 24 pedidos en paralelo la mediana de una consulta pasó de 41 a 86
// segundos, el 28% necesitó reintento y aparecieron errores de
// saturación. Con 8 el proceso va más rápido Y sin fallas. Más hilos
// deja de ser más rápido cuando los pedidos empiezan a hacer cola
// adentro de la función.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { consultarTodasLasFuentes, personaNoExiste } from "../_shared/novadata-client.ts";
import { buildStandardProfile, PROCESS_VERSION } from "../_shared/process.ts";
import { estadoPorFuente, cuantasFuentesContestaron, elPerfilSirve, laConsultaSirve, porQueNoSirve } from "../_shared/calidad-de-la-consulta.ts";
import { CORTE_IESS_CONOCIDO } from "../_shared/fuentes-ingreso.ts";
import { clasificarPerfilLaboral } from "../_shared/perfil-laboral.ts";
import { evaluarControlesBloqueo } from "../_shared/controles-bloqueo.ts";
import { loadDisabledResources, loadCorteIess } from "../_shared/runtime-config.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LOTE_CLAVE = Deno.env.get("VIGIA_CLAVE") ?? "";

const CONCURRENCIA = 8;
// Cuánto trabaja cada invocación antes de devolver el control. Deja
// margen contra el tiempo máximo de la función: lo último que tiene que
// pasar es que el corte llegue con consultas a medio guardar.
const PRESUPUESTO_MS = 100_000;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Item = { id: string; cedula: string; ingresado: string; intentos: number; lote_id: string };
type Lote = { id: string; creado_por: string | null };

// Cuántos días vale un perfil antes de volver a preguntarle a la
// fuente. Es un parámetro del negocio y vive en la base (ver 061): con
// qué frecuencia cambia la información no lo decide el código.
async function diasDeValidez(): Promise<number> {
  const { data } = await serviceClient
    .from("config_operativa")
    .select("valor")
    .eq("clave", "dias_validez_perfil")
    .maybeSingle();
  const n = Number(data?.valor ?? 7);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

// El perfil vigente de esta persona, si lo hay.
//
// Es la razón de ser del módulo: un lote no tiene que volver a
// consultar a quien ya fue consultado hace poco, venga esa consulta de
// otro lote o de un analista. La auditoría encontró que sí lo hacía.
async function perfilVigente(cedula: string, dias: number): Promise<{ id: string; client_id: string } | null> {
  const { data: cliente } = await serviceClient.from("clients").select("id").eq("cedula", cedula).maybeSingle();
  if (!cliente) return null;
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  // Se mira EL ÚLTIMO perfil, no el último que sirva.
  //
  // Parece lo mismo y no lo es. Filtrar por la calidad adentro de la
  // consulta hacía que una persona con un perfil bueno de hace cinco
  // días y uno vacío de ayer se diera por vigente con el viejo: el lote
  // no la consultaba, y todas las pantallas --que muestran el ÚLTIMO
  // perfil-- seguían mostrando el vacío. El caso se reparaba en los
  // papeles y se quedaba roto en la pantalla. Pasó con 3 personas de la
  // reconsulta del 2026-09-16.
  //
  // La pregunta correcta es "¿el perfil actual de esta persona sirve y
  // es reciente?", y el perfil actual es el último, sin condiciones.
  const { data } = await serviceClient
    .from("client_profiles")
    .select("id, client_id, fuentes_ok, ejes_ok, created_at")
    .eq("client_id", cliente.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  // Vacío: es una consulta pendiente, no un perfil vigente. Se leen las
  // dos épocas -- los 2.681 perfiles anteriores al 2026-09-17 sólo
  // tienen ejes_ok, y mirando sólo fuentes_ok el lote los reconsultaría
  // a todos. Ver elPerfilSirve().
  if (!elPerfilSirve(data)) return null;
  // Y tiene que caer dentro de la ventana de validez.
  if (data.created_at < desde) return null;

  return { id: data.id, client_id: data.client_id };
}

async function consultarItem(item: Item, lote: Lote, deshabilitados: Set<string>, dias: number, corteIess: string): Promise<void> {
  const inicio = Date.now();
  try {
    const vigente = await perfilVigente(item.cedula, dias);
    if (vigente) {
      // También se audita reutilizar. No se consultó a la fuente, pero
      // los datos de esa persona entran igual al resultado del lote y
      // salen en el archivo que alguien descarga. Para quien pregunte
      // después "¿quién vio mis datos?", reutilizar y consultar son lo
      // mismo; la diferencia es con el proveedor, no con la persona.
      await serviceClient.from("audit_log").insert({
        actor: lote.creado_por,
        action: "lote.reutiliza",
        client_id: vigente.client_id,
        meta: { lote_id: item.lote_id, client_profile_id: vigente.id, ingresado: item.ingresado, dias_validez: dias },
      });

      await serviceClient
        .from("lote_items")
        .update({
          estado: "reutilizado",
          client_profile_id: vigente.id,
          motivo: `Ya tenía un Perfil del Cliente de menos de ${dias} días. No se consultó la fuente.`,
          duracion_ms: Date.now() - inicio,
          intentos: item.intentos + 1,
          procesado_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      return;
    }

    const raw = await consultarTodasLasFuentes(item.cedula, undefined, deshabilitados);

    // Si la fuente no contestó ni una, esta cédula no se consultó: se
    // intentó. Se lanza para caer en el manejo de fallas de abajo, que
    // la devuelve a la cola en vez de marcarla como hecha.
    //
    // Antes esto terminaba en `estado: "ok"` con un perfil en blanco,
    // porque consultarTodasLasFuentes no lanza excepción por una fuente
    // caída y el perfil se guardaba igual. Así se produjeron los 373
    // perfiles vacíos del 2026-09-15, y el resumen del lote los contó
    // como correctos. Ver _shared/calidad-de-la-consulta.ts.
    const estadoDeCadaFuente = estadoPorFuente(raw);
    if (!laConsultaSirve(estadoDeCadaFuente)) throw new Error(`HTTP 503 ${porQueNoSirve(estadoDeCadaFuente)}`);

    const noExiste = personaNoExiste(raw.general);
    if (noExiste) {
      await serviceClient
        .from("lote_items")
        .update({
          estado: "error",
          motivo: `La fuente no encuentra a ninguna persona con esta cédula (${noExiste}).`,
          duracion_ms: Date.now() - inicio,
          intentos: item.intentos + 1,
          procesado_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      return;
    }

    let { data: client } = await serviceClient.from("clients").select("id").eq("cedula", item.cedula).maybeSingle();
    if (!client) {
      const { data: creado, error } = await serviceClient
        .from("clients")
        .insert({ cedula: item.cedula })
        .select("id")
        .single();
      if (error) throw error;
      client = creado;
    }

    const { profile, duracionFuentesMs } = buildStandardProfile(raw, item.cedula, corteIess);
    const controlBloqueo = evaluarControlesBloqueo(raw, item.cedula);

    const { data: guardado, error: errorPerfil } = await serviceClient
      .from("client_profiles")
      .insert({
        client_id: client.id,
        standard_profile: profile,
        fuente_segmento: profile.fuentesIngreso?.segmento ?? null,
        fuente_estado: profile.fuentesIngreso?.estadoSegmento ?? null,
        fuente_version: profile.fuentesIngreso?.version ?? null,
        fuente_corte: profile.fuentesIngreso?.corteIessUsado ?? null,
        fuente_piso_ingreso: profile.fuentesIngreso?.pisoIngresoMensualReportado ?? null,
        // Para contar en el panorama; no va dentro del perfil (ver migración 085).
        perfil_laboral: clasificarPerfilLaboral(profile as unknown as Record<string, unknown>)?.clave ?? null,
        duracion_fuentes_ms: duracionFuentesMs,
        control_bloqueo: controlBloqueo,

        // Qué contestó cada fuente. Se guarda plano (fuentes_ok) además
        // del detalle para poder excluir consultas vacías sin abrir el
        // JSON de cada perfil -- ver 065, 068 y 078. `ejes_ok` ya no se
        // escribe: contaba los nueve bloques, que exageraban.
        estado_por_fuente: estadoDeCadaFuente,
        fuentes_ok: cuantasFuentesContestaron(estadoDeCadaFuente),
        fuentes_totales: Object.keys(estadoDeCadaFuente).length,
        structure_version: PROCESS_VERSION,
        duracion_ms: Date.now() - inicio,
        // De dónde salió. El dato es el mismo que el de una consulta
        // individual y sirve igual para el flujo normal; esto solo dice
        // por qué puerta entró.
        origen: "lote",
        lote_id: item.lote_id,
        // Quién ordenó el lote. El camino individual lo guarda y este no
        // lo hacía: un perfil sin solicitante no se puede auditar.
        requested_by: lote.creado_por,
      })
      .select("id")
      .single();
    if (errorPerfil) throw errorPerfil;

    // La misma huella que deja una consulta individual. Consultar
    // Función Judicial, Fiscalía y deudas de miles de personas sin
    // registrar quién lo ordenó era el hallazgo más serio de la
    // auditoría: si mañana alguien pregunta por qué se consultó a una
    // persona, la respuesta tiene que existir.
    await serviceClient.from("audit_log").insert({
      actor: lote.creado_por,
      action: "lote.consulta",
      client_id: client.id,
      meta: { lote_id: item.lote_id, client_profile_id: guardado.id, ingresado: item.ingresado },
    });

    await serviceClient
      .from("lote_items")
      .update({
        estado: "ok",
        client_profile_id: guardado.id,
        duracion_ms: Date.now() - inicio,
        intentos: item.intentos + 1,
        procesado_at: new Date().toISOString(),
        motivo: null,
      })
      .eq("id", item.id);
  } catch (err) {
    // Una cédula que falla no puede tumbar el lote. Pero tampoco puede
    // darse por perdida al primer tropiezo: un corte de red o un mal
    // momento de la fuente no son un problema de esa persona, y
    // marcarlos como error definitivo obliga a rearmar el archivo y
    // volver a subirlo por algo que se resolvía solo.
    //
    // Vuelve a la cola hasta tres intentos; recién ahí se da por
    // fallida. Los intentos quedan contados, así que si una cédula
    // necesitó tres, eso también se ve.
    // Un error de PostgREST es un objeto plano, no un Error: String()
    // lo convierte en "[object Object]" y el motivo guardado no dice
    // nada. Pasó con esta misma migración -- el lote falló entero y el
    // motivo no alcanzaba ni para saber qué columna se quejaba.
    const mensaje =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? [(err as Record<string, unknown>).message, (err as Record<string, unknown>).details, (err as Record<string, unknown>).hint, (err as Record<string, unknown>).code]
              .filter(Boolean)
              .join(" | ") || JSON.stringify(err)
          : String(err);
    const pasajero = /fetch|network|timeout|socket|HTTP 5\d\d|429/i.test(mensaje);
    const intentos = item.intentos + 1;
    const reintentable = pasajero && intentos < 3;

    await serviceClient
      .from("lote_items")
      .update({
        estado: reintentable ? "pendiente" : "error",
        motivo: reintentable
          ? `Falla pasajera en el intento ${intentos}, vuelve a la cola: ${mensaje.slice(0, 250)}`
          : mensaje.slice(0, 400),
        duracion_ms: Date.now() - inicio,
        intentos,
        tomado_at: null,
        procesado_at: reintentable ? null : new Date().toISOString(),
      })
      .eq("id", item.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const clave = req.headers.get("x-vigia-clave") ?? "";
  if (!LOTE_CLAVE || clave !== LOTE_CLAVE) {
    return new Response(JSON.stringify({ error: "no autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const arranque = Date.now();

  // El lote más viejo que esté corriendo. De a uno por vez: dos lotes en
  // paralelo se pisarían en la misma función y ninguno avanzaría bien.
  const { data: lote } = await serviceClient
    .from("lotes")
    .select("id, creado_por")
    .eq("estado", "en_proceso")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!lote) {
    return new Response(JSON.stringify({ sinTrabajo: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Lo que quedó tomado por una corrida que se cortó vuelve a estar
  // disponible. Sin esto, un corte deja el lote trabado esperando algo
  // que ya no está corriendo.
  await serviceClient.rpc("liberar_items_abandonados", { minutos: 10 });

  const deshabilitados = await loadDisabledResources(serviceClient);
  const dias = await diasDeValidez();
  const corteIess = await loadCorteIess(serviceClient, CORTE_IESS_CONOCIDO);
  let procesados = 0;

  while (Date.now() - arranque < PRESUPUESTO_MS) {
    const { data: pendientes } = await serviceClient
      .from("lote_items")
      .select("id, cedula, ingresado, intentos, lote_id")
      .eq("lote_id", lote.id)
      .eq("estado", "pendiente")
      .limit(CONCURRENCIA);

    if (!pendientes || pendientes.length === 0) break;

    // Se marcan en curso antes de trabajarlas: si dos invocaciones se
    // superponen -- el programador dispara cada minuto y una corrida
    // dura hasta cien segundos, así que se superponen seguido -- no
    // pueden tomar las mismas cédulas.
    //
    // Y se trabaja SOLO sobre lo que la marca devolvió. Antes se
    // marcaban y después se procesaba la lista leída, sin mirar cuántas
    // se habían logrado marcar: si otra corrida había ganado, esta
    // consultaba igual a las mismas personas. Dos consultas pagadas,
    // dos perfiles idénticos, el doble de tiempo. La condición
    // `estado = pendiente` en la marca es lo que decide quién gana; el
    // que pierde tiene que enterarse, no seguir de largo.
    const ids = pendientes.map((p) => p.id);
    const { data: tomadas } = await serviceClient
      .from("lote_items")
      .update({ estado: "en_curso", tomado_at: new Date().toISOString() })
      .in("id", ids)
      .eq("estado", "pendiente")
      .select("id, cedula, ingresado, intentos, lote_id");

    // Nada que marcar: otra corrida se las llevó. Se cede el turno en
    // vez de volver a intentar, que sería girar en el vacío golpeando
    // la base hasta agotar el presupuesto.
    if (!tomadas || tomadas.length === 0) break;

    await Promise.all(tomadas.map((p) => consultarItem(p as Item, lote as Lote, deshabilitados, dias, corteIess)));
    procesados += tomadas.length;
  }

  // ¿Quedó algo? Si no, el lote terminó.
  const { count } = await serviceClient
    .from("lote_items")
    .select("id", { count: "exact", head: true })
    .eq("lote_id", lote.id)
    .in("estado", ["pendiente", "en_curso"]);

  const termino = (count ?? 0) === 0;
  if (termino) {
    await serviceClient
      .from("lotes")
      .update({ estado: "terminado", terminado_at: new Date().toISOString() })
      .eq("id", lote.id);
  }

  return new Response(
    JSON.stringify({ lote: lote.id, procesados, quedan: count ?? 0, termino }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
