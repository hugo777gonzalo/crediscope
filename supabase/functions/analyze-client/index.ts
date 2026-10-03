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
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import type { ResultadoControlBloqueo, StandardClientProfile } from "../_shared/types.ts";
import { consultarTodasLasFuentes } from "../_shared/novadata-client.ts";
import { buildStandardProfile, PROCESS_VERSION } from "../_shared/process.ts";
import { CORTE_IESS_CONOCIDO } from "../_shared/fuentes-ingreso.ts";
import { columnasDelPerfil } from "../_shared/columnas-del-perfil.ts";
import { guardarCrudoNovadata } from "../_shared/crudo-novadata.ts";
import { evaluarControlesBloqueo } from "../_shared/controles-bloqueo.ts";
import { estadoPorFuente, cuantasFuentesContestaron } from "../_shared/calidad-de-la-consulta.ts";
import { scoreWithLlm, MARCO_VERSION, CONFIG_LLM } from "../_shared/llm-scoring.ts";
import { filaDelAnalisis } from "../_shared/fila-del-analisis.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { loadCriterioVigente, loadDisabledFields, loadDisabledResources, loadCorteIess } from "../_shared/runtime-config.ts";
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

  // Mismo criterio que structure-client: un RUC de persona natural se
  // convierte en su cédula, y lo que no es una persona natural se
  // rechaza antes de gastar una consulta a la fuente y una llamada al
  // modelo. Acá importa el doble, porque este endpoint también cuesta
  // dinero.
  const ident = clasificarIdentificacion(cedula);
  if (!ident.consultable) {
    return new Response(JSON.stringify({ error: ident.mensaje, tipoIdentificacion: ident.tipo, ingresado: ident.ingresado }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  cedula = ident.cedula as string;

  // Identificar al actor y EXIGIR rol antes de seguir. Antes esto era
  // "solo para fines de auditoría" y la función continuaba aunque el
  // JWT no resolviera a ningún usuario. Analizar dispara consultas
  // pagas a los burós sobre una cédula concreta: no puede quedar
  // disponible para cualquiera que traiga una sesión válida.
  const actor = await identificarActor(
    req.headers.get("Authorization"),
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    serviceClient,
    createClient,
  );
  const rechazo = exigirRol(actor, ["analista", "admin"], corsHeaders);
  if (rechazo) return rechazo;
  const actorId: string | null = actor!.id;

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
    let controlBloqueo: ResultadoControlBloqueo;
    // null si se reutiliza un client_profiles existente (no hay ingesta
    // en esta corrida, ver duracion_ingesta_ms en la migración).
    let duracionIngestaMs: number | null;
    // Qué contestó cada fuente. Sólo existe cuando hubo ingesta: al
    // reutilizar un perfil, la calidad de esa consulta ya está guardada
    // en su propia fila.
    let estadoDeCadaFuente: Record<string, string> = {};
    // Perfil al que queda atado este análisis. Siempre existe: si no se
    // reutiliza uno, se persiste el que se acaba de calcular (ver 032).
    let clientProfileId: string;

    if (profileId) {
      const { data: reused, error: reusedError } = await serviceClient
        .from("client_profiles")
        .select("standard_profile, control_bloqueo")
        .eq("id", profileId)
        .eq("client_id", client.id)
        .maybeSingle();
      if (reusedError) throw reusedError;
      if (!reused) throw new Error("No se encontró el perfil a reutilizar (profileId) para esta cédula");
      profile = reused.standard_profile;
      controlBloqueo = reused.control_bloqueo;
      duracionIngestaMs = null;
      clientProfileId = profileId;
    } else {
      // Ingesta Novadata (las 52 fuentes en paralelo, ver
      // _shared/novadata-client.ts). Las fuentes deshabilitadas en
      // novadata_resource_config se saltan (ver _shared/runtime-config.ts)
      // — fuentes públicas/externas que pueden fallar o deshabilitarse.
      const disabledResources = await loadDisabledResources(serviceClient);
      const inicioIngesta = Date.now();
      const raw = await consultarTodasLasFuentes(cedula, undefined, disabledResources);

      // Estructura Estandarizada (ver _shared/process.ts): campos ya
      // calculados, mucho más liviana para el LLM que el crudo.
      const corteIess = await loadCorteIess(serviceClient, CORTE_IESS_CONOCIDO);
      const built = buildStandardProfile(raw, cedula, corteIess);
      profile = built.profile;
      estadoDeCadaFuente = estadoPorFuente(raw);

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
          // Segmento, perfil laboral e indicios, copiados para que la base
          // cuente y filtre. El JSON sigue siendo la fuente de verdad.
          ...columnasDelPerfil(profile),
          duracion_fuentes_ms: built.duracionFuentesMs,
          control_bloqueo: controlBloqueo,
          // Sin esto el perfil quedaba con ejes_ok = 0 --el valor por
          // defecto-- y la bandeja lo mostraba como "consulta fallida"
          // aunque la consulta hubiera salido bien. Las otras dos
          // puertas (structure-client y el lote) sí lo guardaban.
          estado_por_fuente: estadoDeCadaFuente,
          fuentes_ok: cuantasFuentesContestaron(estadoDeCadaFuente),
          fuentes_totales: Object.keys(estadoDeCadaFuente).length,
          structure_version: PROCESS_VERSION,
          requested_by: actorId,
          duracion_ms: duracionIngestaMs,
        })
        .select("id")
        .single();
      if (perfilError) throw perfilError;
      clientProfileId = guardado.id;
      await guardarCrudoNovadata(serviceClient, client.id, guardado.id, cedula, raw);
    }

    // 6. Scoring aproximado por LLM (ver _shared/llm-scoring.ts). Se
    // consulta igual aunque haya un control de bloqueo bloqueante, para
    // tener razonamiento/contexto — pero el score final se fuerza abajo.
    // Campos deshabilitados en standard_profile_field_config no se le
    // mandan al LLM (dato considerado poco confiable). Los oculta el
    // perfil del modelo (perfil-del-modelo.ts), la única puerta al LLM.
    const [disabledFields, criterio] = await Promise.all([
      loadDisabledFields(serviceClient),
      loadCriterioVigente(serviceClient),
    ]);
    const inicioLlm = Date.now();
    const llmResult = await scoreWithLlm(profile as unknown as Record<string, unknown>, controlBloqueo, criterio.ajustes, disabledFields);
    const duracionLlmMs = Date.now() - inicioLlm;
    const fila = filaDelAnalisis({
      runId: run.id,
      clientId: client.id,
      clientProfileId,
      marcoVersion: MARCO_VERSION,
      criterioVersionId: criterio.versionId,
      llmResult,
      controlBloqueo,
      duracionIngestaMs,
      duracionLlmMs,
    });
    const finalScore = fila.crediscope_score;
    const finalRecomendacion = fila.recomendacion;

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
            intento: llamada.intento ?? 1,
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
      .insert(fila)
      .select("*")
      .single();
    if (analysisError) {
      await registrarConsumo(null);
      throw analysisError;
    }
    await registrarConsumo(analysis.id);

    await serviceClient
      .from("ingestion_runs")
      .update({ status: "completado", completed_at: new Date().toISOString() })
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
