// Informe "Esto encontramos" (etapa 3 del ciclo de calibración): toma
// un paquete de retroalimentación ya cargado, lo cruza con lo que el
// modelo dijo en su momento de cada cliente, y produce un diagnóstico
// legible para una jefatura de Crédito/Riesgos.
//
// Body esperado: { "paqueteId": "uuid" }
//
// Reparto del trabajo, a propósito:
//   - Las ESTADÍSTICAS se calculan acá, en código. Son números que
//     tienen que ser exactos y reproducibles (cuántos incumplimientos,
//     el cruce recomendación x resultado). Pedirle a un modelo que
//     cuente casos es agregar una fuente de error sin necesidad.
//   - El LLM recibe los casos y los números ya resueltos, y aporta lo
//     cualitativo: sobre todo separar los incumplimientos que ERAN
//     previsibles con la información de ese día de los que respondieron
//     a factores externos. Ver marco-retroalimentacion.ts.
//
// Importante: al LLM se le manda lo que el modelo DIJO en su momento
// (score, recomendación, positivos, negativos, información faltante) y
// un extracto acotado del perfil congelado de esa fecha. Nunca se
// reconsulta la fuente: el perfil de hoy ya tendría la mora registrada
// y el modelo "acertaría" siempre.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { MARCO_RETROALIMENTACION, MARCO_RETROALIMENTACION_VERSION } from "../_shared/marco-retroalimentacion.ts";
import { MARCO_VERSION } from "../_shared/marco-interpretativo.ts";
import { metaDeLaConsulta } from "../_shared/calidad-de-la-consulta.ts";
import { registrarLlamadaLlm } from "../_shared/llm-log.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_WORKSPACE_ID = Deno.env.get("ANTHROPIC_WORKSPACE_ID") ?? "";
const MODEL = "claude-sonnet-5";

// Techo de casos que se le mandan al LLM en una corrida. Los
// incumplimientos entran siempre (son la señal informativa); el resto
// completa hasta el techo. Paquetes más grandes no rompen: el informe
// dice cuántos casos se analizaron.
const MAX_CASOS = 80;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type AnyRecord = Record<string, unknown>;

// Extracto acotado del perfil congelado: los campos que de verdad
// pesan para explicar un incumplimiento. Mandar el StandardClientProfile
// completo (~150 campos) por cada caso haría explotar el contexto sin
// aportar nada.
function extractoPerfil(perfil: AnyRecord | null): AnyRecord | null {
  if (!perfil) return null;
  const g = (grupo: string, campo: string) => ((perfil[grupo] as AnyRecord | undefined)?.[campo] ?? null);
  return {
    edad: g("identidad", "edad"),
    nivelEducacion: g("identidad", "nivelEducacion"),
    // Las dos formas: antes de marco-v20 era `empleoActual` (objeto),
    // después `empleosActuales` (arreglo). Leyendo sólo la vieja, a todo
    // perfil nuevo se le decía al modelo que no tenía empleo.
    tieneEmpleoActual:
      Boolean(g("laboral", "empleoActual")) ||
      (Array.isArray(g("laboral", "empleosActuales")) && (g("laboral", "empleosActuales") as unknown[]).length > 0),
    ingresoPromedio6m: g("laboral", "ingresoPromedioUltimos6Meses"),
    antiguedadEmpleoMeses: g("laboral", "antiguedadEmpleoActualMeses"),
    esIndependiente: g("laboral", "esIndependiente"),
    estadoActividadEconomica: g("laboral", "estadoActividadEconomica"),
    operacionesBuroCredito: g("comportamientoBancario", "numeroOperacionesBuroCredito"),
    peorCalificacion: g("comportamientoBancario", "peorCalificacionRiesgo"),
    saldoVigenteBuro: g("comportamientoBancario", "saldoTotalVigente"),
    saldoEnMoraBuro: g("comportamientoBancario", "saldoEnMoraBuroCredito"),
    operacionesCooperativas: g("comportamientoCooperativas", "numeroOperaciones"),
    saldoEnMoraCooperativas: g("comportamientoCooperativas", "saldoEnMora"),
    demandasCrediticias: g("riesgoJudicialCrediticio", "numeroDemandasComoDemandado"),
    demandasCiviles: g("riesgoJudicialCivil", "numeroDemandasComoDemandado"),
    pensionAlimenticiaEnMora: g("riesgoJudicialCivil", "pensionAlimenticiaEnMora"),
    tieneAntecedentesPenales: g("riesgoPenal", "tieneAntecedentesPenales"),
    tieneVehiculos: g("patrimonio", "tieneVehiculos"),
    numeroInmuebles: g("patrimonio", "numeroInmuebles"),
    valorColateralVehiculos: g("patrimonio", "valorColateralVehiculos"),
    // Lo que NO se pudo medir, que es lo que vuelve dudoso un análisis.
    // Las fuentes que contestaron "no hay nada" no van acá: son un dato
    // y no un hueco.
    //
    // Se leen las dos épocas -- antes de estructura-v3 esto nombraba
    // bloques y se llamaba ejesConError. Leer sólo la forma nueva
    // devolvería una lista vacía para los 3.059 perfiles anteriores,
    // sin avisar.
    fuentesNoMedidas: metaDeLaConsulta(perfil.metaConsulta as Record<string, unknown> | undefined).noMedidas,
  };
}

function calcularEstadisticas(creditos: AnyRecord[]) {
  const desembolsados = creditos.filter((c) => c.desembolsado);
  const incumplidos = desembolsados.filter((c) => c.hubo_default === true);
  const pagaron = desembolsados.filter((c) => c.hubo_default === false);

  const porTipo: Record<string, number> = {};
  for (const c of incumplidos) {
    const tipo = (c.tipo_default as string) || "sin clasificar";
    porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
  }

  // El cruce que reemplaza al campo "¿el analista siguió la
  // recomendación?": si el crédito se desembolsó y habíamos recomendado
  // negar, hubo override. Y si además pagó bien, es evidencia de que el
  // modelo castiga de más.
  const cruce: Record<string, number> = {};
  for (const c of desembolsados) {
    const rec = (c.recomendacion as string) || "sin recomendación";
    const desenlace = c.hubo_default === true ? "incumplio" : "pago";
    const clave = `${rec}_${desenlace}`;
    cruce[clave] = (cruce[clave] ?? 0) + 1;
  }

  const conRecomendacion = desembolsados.filter((c) => c.recomendacion);
  const negamosYCayo = conRecomendacion.filter((c) => c.recomendacion === "negar" && c.hubo_default === true).length;
  const negamosYPago = conRecomendacion.filter((c) => c.recomendacion === "negar" && c.hubo_default === false).length;
  const aprobamosYCayo = conRecomendacion.filter((c) => c.recomendacion === "aprobar" && c.hubo_default === true).length;

  return {
    totalCreditos: creditos.length,
    desembolsados: desembolsados.length,
    noDesembolsados: creditos.length - desembolsados.length,
    incumplimientos: incumplidos.length,
    pagaronBien: pagaron.length,
    tasaIncumplimiento: desembolsados.length ? Math.round((incumplidos.length / desembolsados.length) * 1000) / 10 : null,
    sinVincularAnalisis: creditos.filter((c) => !c.analysis_result_id).length,
    conObservaciones: creditos.filter((c) => c.observaciones).length,
    porTipoIncumplimiento: porTipo,
    cruceRecomendacionResultado: cruce,
    // Los 3 números que más le importan a una jefatura de crédito.
    overridesQueFallaron: negamosYCayo,
    overridesQueSalieronBien: negamosYPago,
    aprobadosQueIncumplieron: aprobamosYCayo,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let paqueteId: string | undefined;
  try {
    paqueteId = (await req.json())?.paqueteId;
  } catch {
    // body inválido, se maneja abajo
  }
  if (!paqueteId || typeof paqueteId !== "string") {
    return new Response(JSON.stringify({ error: "Falta 'paqueteId' en el body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Falta ANTHROPIC_API_KEY en las secrets de la función" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

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
    const { data: paquete, error: errPaquete } = await serviceClient
      .from("feedback_paquetes")
      .select("*")
      .eq("id", paqueteId)
      .maybeSingle();
    if (errPaquete) throw errPaquete;
    if (!paquete) throw new Error("No se encontró el paquete de retroalimentación");

    const { data: creditosRaw, error: errCreditos } = await serviceClient
      .from("feedback_creditos")
      .select("*, analysis_results(crediscope_score, recomendacion, positives, negatives, missing_info, narrative_summary, rules_version, created_at), client_profiles(standard_profile)")
      .eq("paquete_id", paqueteId);
    if (errCreditos) throw errCreditos;

    const creditos = (creditosRaw ?? []).map((c: AnyRecord) => {
      const analisis = c.analysis_results as AnyRecord | null;
      return { ...c, recomendacion: analisis?.recomendacion ?? null };
    });
    if (creditos.length === 0) throw new Error("El paquete no tiene créditos cargados");

    const estadisticas = calcularEstadisticas(creditos);

    // Los incumplimientos entran siempre; el resto completa el cupo.
    const incumplidos = creditos.filter((c) => c.hubo_default === true);
    const resto = creditos.filter((c) => c.hubo_default !== true);
    const seleccionados = [...incumplidos, ...resto].slice(0, MAX_CASOS);

    const casos = seleccionados.map((c: AnyRecord) => {
      const analisis = c.analysis_results as AnyRecord | null;
      const perfil = (c.client_profiles as AnyRecord | null)?.standard_profile as AnyRecord | null;
      return {
        cedula: c.cedula,
        loQueDijoElModelo: analisis
          ? {
              score: analisis.crediscope_score,
              // La recomendación de acción existe desde marco-v14. En
              // análisis anteriores el campo viene vacío, y hay que
              // decirlo explícitamente: si no, el informe concluye que
              // "el motor de recomendación no se activó", que es un
              // hallazgo falso sobre el que una jefatura podría actuar.
              recomendacion:
                analisis.recomendacion ??
                "no disponible: este análisis es anterior a la versión que incorporó las recomendaciones de acción",
              puntosPositivos: analisis.positives,
              puntosNegativos: analisis.negatives,
              informacionFaltante: analisis.missing_info,
              fechaAnalisis: analisis.created_at,
              versionMarco: analisis.rules_version,
            }
          : "sin análisis previo vinculado",
        datosDisponiblesEseDia: extractoPerfil(perfil),
        loQuePaso: {
          seDesembolso: c.desembolsado,
          monto: c.monto,
          producto: c.producto,
          plazoMeses: c.plazo_meses,
          fechaDesembolso: c.fecha_desembolso,
          huboIncumplimiento: c.hubo_default,
          fechaIncumplimiento: c.fecha_default,
          tipoIncumplimiento: c.tipo_default,
          diasMoraMaxima: c.dias_mora_max,
          observacionesDeCobranza: c.observaciones,
        },
      };
    });

    const userPayload = {
      paquete: { etiqueta: paquete.etiqueta, periodoDesde: paquete.periodo_desde, periodoHasta: paquete.periodo_hasta },
      estadisticasYaCalculadas: estadisticas,
      casosAnalizados: casos.length,
      casosTotalesEnElPaquete: creditos.length,
      casos,
    };

    const inicioLlm = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        ...(ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": ANTHROPIC_WORKSPACE_ID } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        // El modelo razona antes de responder y ese "thinking" sale del
        // mismo presupuesto que el JSON de salida. Un informe con
        // clasificación caso por caso es largo: con 8000 la respuesta
        // llegaba cortada a la mitad de un array.
        max_tokens: 16000,
        system: MARCO_RETROALIMENTACION,
        messages: [{ role: "user", content: JSON.stringify(userPayload) }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      await registrarLlamadaLlm(serviceClient, {
        razonamiento: "activo" as const,
        maxTokens: 16000,
        funcion: "analizar-feedback",
        modelo: MODEL,
        exito: false,
        error: `HTTP ${res.status}: ${errText.slice(0, 300)}`,
        duracionMs: Date.now() - inicioLlm,
        contexto: { paquete_id: paqueteId },
      });
      throw new Error(`Error del LLM (HTTP ${res.status}): ${errText.slice(0, 400)}`);
    }

    const data = await res.json();
    // Se registra apenas responde, antes de intentar interpretar el
    // JSON: una respuesta cortada por presupuesto se pagó igual, y es
    // justo el caso que interesa ver en el consumo.
    await registrarLlamadaLlm(serviceClient, {
      razonamiento: "activo" as const,
      maxTokens: 16000,
      funcion: "analizar-feedback",
      modelo: (data?.model as string) ?? MODEL,
      exito: data?.stop_reason !== "max_tokens",
      error: data?.stop_reason === "max_tokens" ? "respuesta cortada por límite de tokens" : null,
      stopReason: data?.stop_reason,
      uso: data?.usage,
      duracionMs: Date.now() - inicioLlm,
      requestId: data?.id,
      contexto: { paquete_id: paqueteId },
    });
    const bloqueTexto = (data?.content as Array<{ type: string; text?: string }> | undefined)?.find((b) => b.type === "text");
    if (!bloqueTexto?.text) {
      throw new Error(`Respuesta inesperada del LLM (stop_reason: ${data?.stop_reason})`);
    }
    const limpio = bloqueTexto.text.trim().replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/, "").trim();
    let resultado: AnyRecord;
    try {
      resultado = JSON.parse(limpio);
    } catch (err) {
      // Distinguir "se cortó por presupuesto" de "devolvió algo raro":
      // son problemas distintos y el mensaje tiene que decir cuál es.
      if (data?.stop_reason === "max_tokens") {
        throw new Error(
          `La respuesta se cortó por límite de tokens (${casos.length} casos analizados). Probá con un paquete más chico o subí max_tokens.`
        );
      }
      throw new Error(`No se pudo interpretar la respuesta del LLM como JSON (stop_reason: ${data?.stop_reason}): ${String(err)}`);
    }

    const { data: informe, error: errInforme } = await serviceClient
      .from("feedback_informes")
      .insert({
        paquete_id: paqueteId,
        estadisticas,
        resultado,
        casos_enviados: casos.length,
        marco_version: `${MARCO_VERSION} / ${MARCO_RETROALIMENTACION_VERSION}`,
        llm_model: (data?.model as string) ?? MODEL,
        llm_usage: data?.usage ?? null,
        generado_por: actorId,
      })
      .select("*")
      .single();
    if (errInforme) throw errInforme;

    await serviceClient.from("audit_log").insert({
      actor: actorId,
      action: "feedback.informe",
      meta: { paquete_id: paqueteId, informe_id: informe.id, casos: casos.length },
    });

    return new Response(JSON.stringify(informe), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err);
    return new Response(JSON.stringify({ error: mensaje }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
