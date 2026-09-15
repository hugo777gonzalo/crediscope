// Orquestador principal: ingesta Novadata -> Estructura Estandarizada ->
// controles de bloqueo duros -> scoring aproximado por LLM -> persiste
// en Supabase. Este mismo endpoint HTTP sirve tanto a la interfaz web
// (via supabase.functions.invoke, con el JWT del analista) como a
// sistemas externos que quieran consumir el análisis vía API (con su
// propio JWT/API key de servicio).
//
// Body esperado: { "cedula": "0102030405", "profileId"?: "uuid" }
//
// profileId (opcional, usado por "Análisis con IA" en la web): id de un
// client_profiles ya generado por structure-client. Si viene, se
// reutiliza ese standard_profile/control_bloqueo tal cual — SIN volver
// a consultar Novadata — para que el análisis explique exactamente lo
// que el analista vio en Perfil del Cliente (ventana de reutilización:
// 7 días, decisión de la UI, no de este endpoint). Si no viene (uso
// típico de sistemas externos vía API), se consulta Novadata en fresco
// y el perfil resultante SE GUARDA igual — el análisis siempre queda
// atado a la data estructurada que lo produjo (ver 032).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import type { BlockStatusMap, ResultadoControlBloqueo, StandardClientProfile } from "../_shared/types.ts";
import { fetchAllBlocks } from "../_shared/novadata-client.ts";
import { buildStandardProfile, PROCESS_VERSION } from "../_shared/process.ts";
import { evaluarControlesBloqueo } from "../_shared/controles-bloqueo.ts";
import { scoreWithLlm, MARCO_VERSION, CONFIG_LLM } from "../_shared/llm-scoring.ts";
import { loadCriterioVigente, loadDisabledFields, loadDisabledResources, redactDisabledFields } from "../_shared/runtime-config.ts";
import { registrarLlamadaLlm } from "../_shared/llm-log.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Cliente con privilegios de servicio: es el único que puede escribir en
// ingestion_runs / analysis_results / audit_log (ver RLS en schema.sql).
// La service role key vive solo en las secrets de esta función, nunca
// llega al navegador.
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let cedula: string | undefined;
  let profileId: string | undefined;
  // Marca las corridas de verificación del equipo técnico para que su
  // consumo quede identificado en vez de borrarse (ver llm_llamadas).
  let esPrueba = false;
  try {
    const body = await req.json();
    cedula = body?.cedula;
    profileId = body?.profileId;
    esPrueba = body?.esPrueba === true;
  } catch {
    // body inválido, se maneja abajo
  }
  if (!cedula || typeof cedula !== "string") {
    return new Response(JSON.stringify({ error: "Falta 'cedula' en el body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Identificar al actor (analista o sistema externo) a partir del JWT
  // reenviado en Authorization, solo para fines de auditoría.
  let actorId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    actorId = data.user?.id ?? null;
  }

  try {
    // 1. Cliente: obtener o crear
    let { data: client } = await serviceClient.from("clients").select("id").eq("cedula", cedula).maybeSingle();
    if (!client) {
      const { data: created, error: createError } = await serviceClient
        .from("clients")
        .insert({ cedula })
        .select("id")
        .single();
      if (createError) throw createError;
      client = created;
    }

    // 2. Corrida de ingesta
    const { data: run, error: runError } = await serviceClient
      .from("ingestion_runs")
      .insert({ client_id: client.id, status: "en_progreso", requested_by: actorId })
      .select("id")
      .single();
    if (runError) throw runError;

    // 3-5. Estructura Estandarizada + controles de bloqueo: reutilizados
    // de un client_profiles existente si viene profileId (ver nota de
    // cabecera), o calculados en fresco si no.
    let profile: StandardClientProfile;
    let blockStatus: BlockStatusMap;
    let controlBloqueo: ResultadoControlBloqueo;
    // null si se reutiliza un client_profiles existente (no hay ingesta
    // en esta corrida, ver duracion_ingesta_ms en la migración).
    let duracionIngestaMs: number | null;
    // Perfil al que queda atado este análisis. Siempre existe: si no se
    // reutiliza uno, se persiste el que se acaba de calcular (ver 032).
    let clientProfileId: string;

    if (profileId) {
      const { data: reused, error: reusedError } = await serviceClient
        .from("client_profiles")
        .select("standard_profile, control_bloqueo, block_status")
        .eq("id", profileId)
        .eq("client_id", client.id)
        .maybeSingle();
      if (reusedError) throw reusedError;
      if (!reused) throw new Error("No se encontró el perfil a reutilizar (profileId) para esta cédula");
      profile = reused.standard_profile;
      blockStatus = reused.block_status;
      controlBloqueo = reused.control_bloqueo;
      duracionIngestaMs = null;
      clientProfileId = profileId;
    } else {
      // Ingesta Novadata (9 bloques en paralelo, ver _shared/novadata-client.ts)
      // Recursos deshabilitados en novadata_resource_config se saltan
      // (ver _shared/runtime-config.ts) — fuentes públicas/externas que
      // pueden fallar o deshabilitarse.
      const disabledResources = await loadDisabledResources(serviceClient);
      const inicioIngesta = Date.now();
      const raw = await fetchAllBlocks(cedula, undefined, disabledResources);

      // Estructura Estandarizada (ver _shared/process.ts) — reemplaza al
      // ClientContext casi crudo de antes, mucho más liviana para el LLM.
      const built = buildStandardProfile(raw, cedula);
      profile = built.profile;
      blockStatus = built.blockStatus;

      // Controles de bloqueo determinísticos (fallecido, listas de
      // control/PEP/OFAC, cédula inconsistente) — NO se delegan al LLM,
      // ver _shared/controles-bloqueo.ts
      controlBloqueo = evaluarControlesBloqueo(raw, cedula);
      duracionIngestaMs = Date.now() - inicioIngesta;

      // Se persiste ANTES de llamar al LLM, a propósito: el crudo de
      // Novadata se descarta y esta es la única copia de la información
      // con la que se evaluó al cliente. Si el LLM falla, el perfil
      // igual queda guardado (auditable, reprocesable, y analizable
      // después contra el resultado real del crédito). Ver 032.
      const { data: guardado, error: perfilError } = await serviceClient
        .from("client_profiles")
        .insert({
          client_id: client.id,
          standard_profile: profile,
          // Copia consultable de la clasificación de fuentes de ingreso
          // (ver 043). El JSON sigue siendo la fuente de verdad.
          fuente_segmento: profile.fuentesIngreso?.segmento ?? null,
          fuente_estado: profile.fuentesIngreso?.estadoSegmento ?? null,
          fuente_version: profile.fuentesIngreso?.version ?? null,
          fuente_corte: profile.fuentesIngreso?.corteIessUsado ?? null,
          fuente_piso_ingreso: profile.fuentesIngreso?.pisoIngresoMensualReportado ?? null,
          duracion_fuentes_ms: built.duracionFuentesMs,
          control_bloqueo: controlBloqueo,
          block_status: blockStatus,
          structure_version: PROCESS_VERSION,
          requested_by: actorId,
          duracion_ms: duracionIngestaMs,
        })
        .select("id")
        .single();
      if (perfilError) throw perfilError;
      clientProfileId = guardado.id;
    }

    // 6. Scoring aproximado por LLM (ver _shared/llm-scoring.ts). Se
    // consulta igual aunque haya un control de bloqueo bloqueante, para
    // tener razonamiento/contexto — pero el score final se fuerza abajo.
    // Campos deshabilitados en standard_profile_field_config no se le
    // mandan al LLM (dato considerado poco confiable).
    const [disabledFields, criterio] = await Promise.all([
      loadDisabledFields(serviceClient),
      loadCriterioVigente(serviceClient),
    ]);
    const llmProfile = redactDisabledFields(profile, disabledFields);
    const inicioLlm = Date.now();
    const llmResult = await scoreWithLlm(llmProfile, controlBloqueo, criterio.ajustes);
    const duracionLlmMs = Date.now() - inicioLlm;
    const finalScore = controlBloqueo.bloqueado ? 1 : llmResult.score;
    // Mismo criterio que el score: un control de bloqueo bloqueante no
    // se delega al criterio del LLM (ver marco-interpretativo.ts v14).
    const finalRecomendacion = controlBloqueo.bloqueado ? "negar" : llmResult.recomendacion;

    // Registro de consumo del LLM. Se hace pase lo que pase con la
    // inserción del análisis: la llamada ya se pagó, y si el insert
    // falla es justamente cuando más importa que quede el rastro.
    // Un scoring puede ser 1 o 2 llamadas (cascada: modelo base y, si el
    // caso cae en la zona gris, escalamiento a Sonnet). Se registran por
    // separado: si se guardara solo la última, el costo de un caso
    // escalado quedaría a la mitad y la medición del ahorro sería falsa.
    const registrarConsumo = async (analysisResultId: string | null) => {
      for (const llamada of llmResult.llamadas) {
        await registrarLlamadaLlm(serviceClient, {
          funcion: "analyze-client",
          modelo: llamada.modelo,
          exito: llamada.exito,
          error: llamada.error ?? null,
          stopReason: llamada.stopReason ?? null,
          uso: llamada.uso as Record<string, number> | undefined,
          duracionMs: llamada.duracionMs,
          requestId: llamada.requestId ?? null,
          clientId: client.id,
          analysisResultId,
          contexto: {
            cedula,
            reutilizoPerfil: Boolean(profileId),
            escalamiento: Boolean(llamada.escalamiento),
            // Con qué versión del criterio corrió. Es lo que permite
            // ver en Costos que el gasto sube con cada marco nuevo y no
            // con el volumen.
            marco: MARCO_VERSION,
          },
          esPrueba,
          razonamiento: CONFIG_LLM.razonamiento,
          maxTokens: CONFIG_LLM.maxTokens,
          actor: actorId,
        });
      }
    };

    // 7. Persistir resultado
    const { data: analysis, error: analysisError } = await serviceClient
      .from("analysis_results")
      .insert({
        ingestion_run_id: run.id,
        client_id: client.id,
        crediscope_score: finalScore,
        recomendacion: finalRecomendacion,
        // Etiquetas de lectura rápida (marco-v15). Se guardan tal cual
        // las dio el modelo: un control de bloqueo fuerza el score y la
        // recomendación, pero no el diagnóstico -- si el historial de
        // pago era excelente, sigue siéndolo aunque el caso se niegue
        // por una lista de control.
        indicador_riesgo: llmResult.indicadorRiesgo,
        indicador_historial: llmResult.indicadorHistorial,
        // Las acciones se guardan tal cual las dio el modelo incluso si
        // hay control de bloqueo: aunque el caso se niegue, saber qué
        // habría que verificar sigue sirviendo (un homónimo en listas,
        // por ejemplo, se despeja verificando identidad).
        acciones_sugeridas: llmResult.accionesSugeridas,
        rules_version: MARCO_VERSION,
        // Qué criterio efectivo (marco base + ajustes vigentes) produjo
        // este análisis. Sin esto, un resultado raro no se puede
        // auditar después.
        criterio_version_id: criterio.versionId,
        // Con qué data estructurada exactamente se evaluó. Antes se
        // cruzaba por cercanía de fecha, que es ambiguo en cuanto hay
        // dos consultas del mismo cliente el mismo día (ver 032).
        client_profile_id: clientProfileId,
        block_status: blockStatus,
        positives: llmResult.positives,
        negatives: llmResult.negatives,
        missing_info: llmResult.missingInfo,
        inconsistencies: controlBloqueo.hallazgos.map((h) => h.message),
        narrative_summary: llmResult.reasoning,
        llm_model: llmResult.llmModel,
        llm_stop_reason: llmResult.llmStopReason,
        llm_usage: llmResult.llmUsage,
        llm_request_id: llmResult.llmRequestId,
        duracion_ingesta_ms: duracionIngestaMs,
        duracion_llm_ms: duracionLlmMs,
      })
      .select("*")
      .single();
    if (analysisError) {
      await registrarConsumo(null);
      throw analysisError;
    }
    await registrarConsumo(analysis.id);

    await serviceClient
      .from("ingestion_runs")
      .update({ status: "completado", block_status: blockStatus, completed_at: new Date().toISOString() })
      .eq("id", run.id);

    // 8. Auditoría
    await serviceClient.from("audit_log").insert({
      actor: actorId,
      action: "client.analyze",
      client_id: client.id,
      meta: {
        ingestion_run_id: run.id,
        crediscope_score: finalScore,
        recomendacion: finalRecomendacion,
        control_bloqueado: controlBloqueo.bloqueado,
      },
    });

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const mensaje =
      err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err);
    return new Response(JSON.stringify({ error: mensaje }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
