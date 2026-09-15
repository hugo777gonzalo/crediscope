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
import { fetchAllBlocks, personaNoExiste } from "../_shared/novadata-client.ts";
import { buildStandardProfile, PROCESS_VERSION } from "../_shared/process.ts";
import { evaluarControlesBloqueo } from "../_shared/controles-bloqueo.ts";
import { loadDisabledResources } from "../_shared/runtime-config.ts";

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

async function consultarItem(item: Item, deshabilitados: Set<string>): Promise<void> {
  const inicio = Date.now();
  try {
    const raw = await fetchAllBlocks(item.cedula, undefined, deshabilitados);

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

    const { profile, blockStatus, duracionFuentesMs } = buildStandardProfile(raw, item.cedula);
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
        duracion_fuentes_ms: duracionFuentesMs,
        control_bloqueo: controlBloqueo,
        block_status: blockStatus,
        structure_version: PROCESS_VERSION,
        duracion_ms: Date.now() - inicio,
        // De dónde salió. El dato es el mismo que el de una consulta
        // individual y sirve igual para el flujo normal; esto solo dice
        // por qué puerta entró.
        origen: "lote",
        lote_id: item.lote_id,
      })
      .select("id")
      .single();
    if (errorPerfil) throw errorPerfil;

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
    // Una cédula que falla no puede tumbar el lote. Queda anotada con
    // su motivo y el resto sigue.
    await serviceClient
      .from("lote_items")
      .update({
        estado: "error",
        motivo: String(err).slice(0, 400),
        duracion_ms: Date.now() - inicio,
        intentos: item.intentos + 1,
        procesado_at: new Date().toISOString(),
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
    .select("id")
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
    // puede durar más -- no pueden tomar las mismas cédulas.
    const ids = pendientes.map((p) => p.id);
    await serviceClient
      .from("lote_items")
      .update({ estado: "en_curso", tomado_at: new Date().toISOString() })
      .in("id", ids)
      .eq("estado", "pendiente");

    await Promise.all(pendientes.map((p) => consultarItem(p as Item, deshabilitados)));
    procesados += pendientes.length;
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
