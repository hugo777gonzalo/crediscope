// Registro de cada llamada al LLM (ver 039_registro_llamadas_llm.sql).
//
// Regla de oro: esto NUNCA puede romper el flujo principal. Un fallo al
// registrar el consumo no puede costar un análisis -- si la inserción
// falla, se avisa por consola y se sigue. El registro es contabilidad,
// no parte del resultado.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface UsoLlm {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface LlamadaLlm {
  funcion: string;
  modelo: string;
  exito: boolean;
  error?: string | null;
  stopReason?: string | null;
  uso?: UsoLlm | null;
  duracionMs?: number | null;
  requestId?: string | null;
  clientId?: string | null;
  analysisResultId?: string | null;
  contexto?: Record<string, unknown>;
  esPrueba?: boolean;
  actor?: string | null;
  // Con qué configuración corrió: define el grueso del costo (el
  // razonamiento interno es ~70% de los tokens de salida).
  razonamiento?: "activo" | "desactivado" | "adaptativo";
  maxTokens?: number;
}

export async function registrarLlamadaLlm(client: SupabaseClient, llamada: LlamadaLlm): Promise<void> {
  try {
    const uso = llamada.uso ?? {};
    const { error } = await client.from("llm_llamadas").insert({
      funcion: llamada.funcion,
      modelo: llamada.modelo,
      client_id: llamada.clientId ?? null,
      analysis_result_id: llamada.analysisResultId ?? null,
      contexto: llamada.contexto ?? {},
      exito: llamada.exito,
      // Se recorta: un error largo de la API no aporta más que su
      // encabezado, y esta tabla se lee en tablero.
      error: llamada.error ? String(llamada.error).slice(0, 500) : null,
      stop_reason: llamada.stopReason ?? null,
      tokens_entrada: uso.input_tokens ?? 0,
      tokens_salida: uso.output_tokens ?? 0,
      tokens_cache_escritura: uso.cache_creation_input_tokens ?? 0,
      tokens_cache_lectura: uso.cache_read_input_tokens ?? 0,
      duracion_ms: llamada.duracionMs ?? null,
      request_id: llamada.requestId ?? null,
      es_prueba: llamada.esPrueba ?? false,
      razonamiento: llamada.razonamiento ?? null,
      max_tokens: llamada.maxTokens ?? null,
      actor: llamada.actor ?? null,
    });
    if (error) console.error("No se pudo registrar la llamada al LLM:", error.message);
  } catch (err) {
    console.error("No se pudo registrar la llamada al LLM:", String(err));
  }
}
