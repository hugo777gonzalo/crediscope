// Orquestador principal: ingesta Novadata -> Estructura Estandarizada ->
// guardrails duros -> scoring aproximado por LLM -> persiste en Supabase.
// Este mismo endpoint HTTP sirve tanto a la interfaz web (via
// supabase.functions.invoke, con el JWT del analista) como a sistemas
// externos que quieran consumir el análisis vía API (con su propio
// JWT/API key de servicio).
//
// Body esperado: { "cedula": "0102030405" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchAllBlocks } from "../_shared/novadata-client.ts";
import { buildStandardProfile } from "../_shared/process.ts";
import { runGuardrails } from "../_shared/guardrails.ts";
import { scoreWithLlm, FRAMEWORK_VERSION } from "../_shared/llm-scoring.ts";

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
  try {
    const body = await req.json();
    cedula = body?.cedula;
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

    // 3. Ingesta Novadata (9 bloques en paralelo, ver _shared/novadata-client.ts)
    const raw = await fetchAllBlocks(cedula);

    // 4. Estructura Estandarizada (ver _shared/process.ts) — reemplaza al
    // ClientContext casi crudo de antes, mucho más liviana para el LLM.
    const { profile, blockStatus } = buildStandardProfile(raw, cedula);

    // 5. Guardrails determinísticos (fallecido, listas de control/PEP/OFAC,
    // cédula inconsistente) — NO se delegan al LLM, ver _shared/guardrails.ts
    const guardrail = runGuardrails(raw, cedula);

    // 6. Scoring aproximado por LLM (ver _shared/llm-scoring.ts). Se
    // consulta igual aunque haya guardrail bloqueante, para tener
    // razonamiento/contexto — pero el score final se fuerza abajo.
    const llmResult = await scoreWithLlm(profile, guardrail);
    const finalScore = guardrail.bloqueado ? 1 : llmResult.score;

    // 7. Persistir resultado
    const { data: analysis, error: analysisError } = await serviceClient
      .from("analysis_results")
      .insert({
        ingestion_run_id: run.id,
        client_id: client.id,
        crediscope_score: finalScore,
        rules_version: FRAMEWORK_VERSION,
        block_status: blockStatus,
        positives: llmResult.positives,
        negatives: llmResult.negatives,
        missing_info: llmResult.missingInfo,
        inconsistencies: guardrail.hallazgos.map((h) => h.message),
        narrative_summary: llmResult.reasoning,
        llm_model: llmResult.llmModel,
        llm_stop_reason: llmResult.llmStopReason,
        llm_usage: llmResult.llmUsage,
        llm_request_id: llmResult.llmRequestId,
      })
      .select("*")
      .single();
    if (analysisError) throw analysisError;

    await serviceClient
      .from("ingestion_runs")
      .update({ status: "completado", block_status: blockStatus, completed_at: new Date().toISOString() })
      .eq("id", run.id);

    // 8. Auditoría
    await serviceClient.from("audit_log").insert({
      actor: actorId,
      action: "client.analyze",
      client_id: client.id,
      meta: { ingestion_run_id: run.id, crediscope_score: finalScore, guardrail_bloqueado: guardrail.bloqueado },
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
