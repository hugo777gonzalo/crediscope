// El análisis de una persona, sin pasar por HTTP: ingesta Novadata (o el
// perfil que ya se guardó) -> controles de bloqueo duros -> scoring por el
// modelo (o el análisis idéntico que ya se hizo) -> persiste en Supabase.
//
// Antes vivía entero en el handler de `analyze-client`. Se sacó acá para que
// el trabajador de la API (`procesar-evaluaciones`) lo llame directo, sin dar
// la vuelta por HTTP a su propia base. `analyze-client` quedó como la
// envoltura: CORS, quién llama, el cuerpo y la validación de la
// identificación.
//
// Lanza ante cualquier error; quien llama lo convierte en su 500.
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

import type { ResultadoControlBloqueo, StandardClientProfile } from "./types.ts";
import { consultarTodasLasFuentes, duracionesPorFuente } from "./novadata-client.ts";
import { buildStandardProfile, PROCESS_VERSION } from "./process.ts";
import { CORTE_IESS_CONOCIDO } from "./fuentes-ingreso.ts";
import { columnasDelPerfil } from "./columnas-del-perfil.ts";
import { guardarCrudoNovadata } from "./crudo-novadata.ts";
import { evaluarControlesBloqueo } from "./controles-bloqueo.ts";
import { cuantasFuentesContestaron, estadoPorFuente } from "./calidad-de-la-consulta.ts";
import { armarPedidoScoring, CONFIG_LLM, huellaDelPedido, puntuarPedido, versionDelMarco } from "./llm-scoring.ts";
import { buroVigenteDeLaPersona } from "./buro-de-la-institucion.ts";
import { COLUMNAS_PARA_REUTILIZAR, filaDelAnalisis, resultadoReutilizado } from "./fila-del-analisis.ts";
import { loadCorteIess, loadDisabledFields, loadDisabledResources } from "./runtime-config.ts";
import { registrarLlamadaLlm } from "./llm-log.ts";

export interface OpcionesDeAnalisis {
  // Cliente con privilegios de servicio: es el único que puede escribir en
  // ingestion_runs / analysis_results / audit_log (ver RLS en schema.sql).
  // La service role key vive solo en las secrets de la función, nunca
  // llega al navegador.
  // deno-lint-ignore no-explicit-any
  db: any;
  // Ya normalizada por clasificarIdentificacion.
  cedula: string;
  // Si viene, se reutiliza ese perfil sin consultar Novadata.
  profileId?: string;
  actorId: string | null;
  // Marca las corridas de verificación del equipo técnico para que su
  // consumo quede identificado en vez de borrarse (ver llm_llamadas).
  esPrueba?: boolean;
  // Se mezcla en el `contexto` de llm_llamadas y en audit_log.meta
  // ("client.analyze"). Las claves propias del análisis mandan sobre estas.
  contextoExtra?: Record<string, unknown>;
}

// Devuelve la fila de analysis_results (select *).
// deno-lint-ignore no-explicit-any
export async function analizarPersona(o: OpcionesDeAnalisis): Promise<Record<string, any>> {
  const { db, cedula, profileId, actorId } = o;
  const esPrueba = o.esPrueba === true;

  // 1. Cliente: obtener o crear
  let { data: client } = await db.from("clients").select("id").eq("cedula", cedula).maybeSingle();
  if (!client) {
    const { data: created, error: createError } = await db
      .from("clients")
      .insert({ cedula })
      .select("id")
      .single();
    if (createError) throw createError;
    client = created;
  }

  // 2. Corrida de ingesta
  const { data: run, error: runError } = await db
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
    const { data: reused, error: reusedError } = await db
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
    const disabledResources = await loadDisabledResources(db);
    const inicioIngesta = Date.now();
    const raw = await consultarTodasLasFuentes(cedula, undefined, disabledResources);

    // Estructura Estandarizada (ver _shared/process.ts): campos ya
    // calculados, mucho más liviana para el LLM que el crudo.
    const corteIess = await loadCorteIess(db, CORTE_IESS_CONOCIDO);
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
    const { data: guardado, error: perfilError } = await db
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
        duracion_por_fuente_ms: duracionesPorFuente(raw),
      })
      .select("id")
      .single();
    if (perfilError) throw perfilError;
    clientProfileId = guardado.id;
    await guardarCrudoNovadata(db, client.id, guardado.id, cedula, raw);
  }

  // 6. Scoring aproximado por LLM (ver _shared/llm-scoring.ts). Se
  // consulta igual aunque haya un control de bloqueo bloqueante, para
  // tener razonamiento/contexto — pero el score final se fuerza abajo.
  // Campos deshabilitados en standard_profile_field_config no se le
  // mandan al LLM (dato considerado poco confiable). Los oculta el
  // perfil del modelo (perfil-del-modelo.ts), la única puerta al LLM.
  // Desde el 2026-10-06 no hay "ajustes del criterio": todo cambio a lo que
  // lee el modelo es una versión nueva del marco (decisión del negocio).
  const disabledFields = await loadDisabledFields(db);
  // El buró de la institución (marco-v31): con el interruptor apagado no se
  // lee nada y el pedido es el de v30. Encendido, la deuda de bancos y
  // cooperativas sale de la consulta vigente del buró, si la persona la
  // tiene; nunca se consulta a Equifax desde acá (cada consulta se cobra).
  const buro = CONFIG_LLM.buroDeLaInstitucion ? await buroVigenteDeLaPersona(db, client.id) : null;
  const marcoVersion = versionDelMarco(CONFIG_LLM);
  const pedido = armarPedidoScoring(profile as unknown as Record<string, unknown>, controlBloqueo, disabledFields, CONFIG_LLM, buro);

  // ¿Ya se le hizo a esta persona exactamente este pedido? Entonces el
  // resultado es el de entonces (auditoría externa, E1): el mismo perfil
  // analizado dos veces movía el score ~40 puntos y cambiaba 1 de cada 13
  // recomendaciones. Sólo para la misma persona y sólo de un análisis que
  // terminó bien; uno fallido se vuelve a pedir. Una llamada de prueba
  // (esPrueba) siempre va al modelo: existe para ejercitar la llamada.
  const huella = await huellaDelPedido(pedido);
  const { data: previo } = esPrueba
    ? { data: null }
    : await db
      .from("analysis_results")
      .select(COLUMNAS_PARA_REUTILIZAR)
      .eq("client_id", client.id)
      .eq("huella_pedido", huella)
      .is("fallo", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
  // Defensa: con la misma huella el bloqueo tiene que coincidir. Si no
  // coincide, algo cambió fuera del pedido y no se reutiliza.
  const reutilizable = previo && (previo.veredicto_origen === "control_bloqueo") === controlBloqueo.bloqueado;

  const inicioLlm = Date.now();
  const llmResult = reutilizable ? resultadoReutilizado(previo) : await puntuarPedido(pedido);
  const duracionLlmMs = reutilizable ? null : Date.now() - inicioLlm;
  const reutilizaAnalisisId = reutilizable ? (previo.reutiliza_analisis_id ?? previo.id) : null;
  const fila = filaDelAnalisis({
    runId: run.id,
    clientId: client.id,
    clientProfileId,
    marcoVersion,
    llmResult,
    controlBloqueo,
    duracionIngestaMs,
    duracionLlmMs,
    reutilizaAnalisisId,
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
      await registrarLlamadaLlm(db, {
        // El nombre no cambia aunque ahora también lo llame el trabajador de
        // la API: la vista llm_costos clasifica como «consulta» o «prueba»
        // sólo lo que dice 'analyze-client' (093); cualquier otro nombre cae
        // en «calibración».
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
        // Sin la cédula: la persona ya queda en client_id, y una copia en
        // contexto sobrevivía a la supresión del titular (que sólo vacía
        // client_id).
        contexto: {
          ...o.contextoExtra,
          reutilizoPerfil: Boolean(profileId),
          escalamiento: Boolean(llamada.escalamiento),
          intento: llamada.intento ?? 1,
          // Con qué versión del criterio corrió. Es lo que permite
          // ver en Costos que el gasto sube con cada marco nuevo y no
          // con el volumen.
          marco: marcoVersion,
          // Qué consulta del buró leyó (marco-v31). El id, nunca la cédula.
          ...(buro ? { consultaBuro: buro.consultaId } : {}),
        },
        esPrueba,
        razonamiento: CONFIG_LLM.razonamiento,
        maxTokens: CONFIG_LLM.maxTokens,
        actor: actorId,
      });
    }
  };

  // 7. Persistir resultado
  const { data: analysis, error: analysisError } = await db
    .from("analysis_results")
    .insert(fila)
    .select("*")
    .single();
  if (analysisError) {
    await registrarConsumo(null);
    throw analysisError;
  }
  await registrarConsumo(analysis.id);

  await db
    .from("ingestion_runs")
    .update({ status: "completado", completed_at: new Date().toISOString() })
    .eq("id", run.id);

  // 8. Auditoría
  await db.from("audit_log").insert({
    actor: actorId,
    action: "client.analyze",
    client_id: client.id,
    meta: {
      ...o.contextoExtra,
      ingestion_run_id: run.id,
      crediscope_score: finalScore,
      recomendacion: finalRecomendacion,
      control_bloqueado: controlBloqueo.bloqueado,
      ...(reutilizaAnalisisId ? { reutiliza_analisis_id: reutilizaAnalisisId } : {}),
      ...(buro ? { consulta_equifax_id: buro.consultaId } : {}),
    },
  });

  return analysis;
}
