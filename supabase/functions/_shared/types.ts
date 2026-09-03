// Tipos compartidos por las Edge Functions de CrediScope.
//
// Confirmado contra producción (2026-09) vía 2 HAR capturados de la
// interfaz web de Novadata (uno de una persona "limpia", otro con
// historial real: demandas, mora bancaria, etc.): TODOS los recursos de
// datos comparten el mismo sobre de respuesta ->
// { estado: { codigo, mensaje }, <campoArray>: [...] }.
// `estado.codigo !== "OK"` (o un HTTP != 200) es la señal de "sin datos",
// ver isEstadoOk() en novadata-client.ts.
//
// Diseño: el score NO lo calcula una fórmula determinística. Un LLM
// (llm-scoring.ts) recibe el ClientContext (curado por eje, ver abajo) y
// el marco interpretativo (ver interpretive-framework.ts) y devuelve un
// score aproximado + pros/contras + razonamiento. Lo único
// determinístico son los "guardrails" (guardrails.ts): hechos binarios
// objetivos (persona fallecida, coincidencia en listas de
// control/OFAC/PEP/lista negra) que NO deben quedar a criterio
// aproximado del LLM — ver GuardrailResult.
//
// BIESS: descartado como bloque — no corresponde a ningún dato real de
// Novadata (confirmado por el usuario, no es un endpoint que exista).

export type BlockKey =
  | "general"
  | "sociodemografica"
  | "trabajo"
  | "iess"
  | "vehiculos"
  | "funcion_judicial"
  | "fiscalia"
  | "bancos"
  | "cooperativas";

export type BlockFetchStatus = "ok" | "faltante" | "error";

export interface BlockResult<T> {
  status: BlockFetchStatus;
  data: T | null;
  errorMessage?: string;
}

export type BlockStatusMap = Record<BlockKey, BlockFetchStatus>;

// ---------- pn_inf_basica (bloque "general") ----------
// Confirmado contra producción (2026-09).
export interface RawGeneral {
  estado: { codigo: string; mensaje: string };
  personaNatural: {
    identificacion: string;
    nombre: string;
    tipoIdentificacion?: { idTipoIdentificacion: number; descripcion: string };
    fechaNacimiento?: string; // "YYYY-MM-DD"
    fechaDefuncion?: string | null; // presente => persona fallecida, señal crítica (ver guardrails)
    informacionAdicional?: string | null; // ej. "CIUDADANO." o menciones de fallecimiento
    genero?: { idGenero: number; descripcion: string };
    [key: string]: unknown;
  };
  nacionalidades?: Array<{ pais?: { nombre: string; codigoIso3: string } }>;
  profesiones?: Array<{ profesion?: { descripcion: string } }>;
  estadoCivil?: { estadoCivil?: { descripcion: string } };
  personaNaturalConyuge?: { personaConyuge?: { identificacion: string | null; nombre: string } };
  nivelEducacion?: { nivelEducacion?: { descripcion: string; nivel: number } };
  [key: string]: unknown;
}

// ---------- Sobre genérico confirmado para el resto de recursos ----------

export interface NovadataEnvelope {
  estado: { codigo: string; mensaje: string | null };
  // El nombre del campo array/objeto varía por recurso (personaVehiculo,
  // afiliacionIess, demandas, direcciones, datosSuper...) — se accede
  // dinámicamente en normalize.ts.
  [campo: string]: unknown;
}

// Recurso individual: nombre corto -> resultado de esa llamada a Novadata.
export type RawMultiRecurso = Record<string, BlockResult<NovadataEnvelope>>;

export interface RawNovadataResponse {
  general: BlockResult<RawGeneral>;
  sociodemografica: BlockResult<RawMultiRecurso>;
  trabajo: BlockResult<RawMultiRecurso>;
  iess: BlockResult<RawMultiRecurso>;
  vehiculos: BlockResult<RawMultiRecurso>;
  funcion_judicial: BlockResult<RawMultiRecurso>;
  fiscalia: BlockResult<RawMultiRecurso>;
  bancos: BlockResult<RawMultiRecurso>;
  cooperativas: BlockResult<RawMultiRecurso>;
}

// ---------- Guardrails (determinísticos, no delegados al LLM) ----------

export type GuardrailCode = "fallecido" | "cedula_inconsistente" | "lista_control" | "lista_negra" | "pep_ofac_interno";

export interface GuardrailFinding {
  code: GuardrailCode;
  message: string;
}

export interface GuardrailResult {
  bloqueado: boolean; // true => score se fuerza a 1 sin importar el criterio del LLM
  hallazgos: GuardrailFinding[];
}

// ---------- Contexto curado por eje (lo que ve el LLM) ----------
// Cada eje trae su estado de disponibilidad + un resumen RECORTADO
// (nombres, fechas, montos, estados) — no el payload crudo completo de
// Novadata (que incluye árboles de canton/provincia/país innecesarios
// para el juicio crediticio). Ver buildClientContext() en normalize.ts.

export interface EjeContext {
  status: BlockFetchStatus;
  resumen: unknown;
}

export interface ClientContext {
  cedula: string;
  ejes: Record<BlockKey, EjeContext>;
}

// ---------- Resultado del scoring por LLM ----------

export interface LlmScoringResult {
  score: number; // 1-999, APROXIMADO — el LLM lo estima con el marco interpretativo, no es una fórmula
  positives: string[];
  negatives: string[];
  missingInfo: string[];
  reasoning: string; // explicación en lenguaje natural de cómo llegó al score
  // Metadata de la llamada al LLM, para auditar/depurar (ver
  // supabase/migrations/001_llm_metadata.sql). stopReason "max_tokens"
  // significa que la respuesta se cortó a medias — señal de que hay que
  // subir el presupuesto de tokens.
  llmModel: string;
  llmStopReason?: string;
  llmUsage?: Record<string, unknown>;
  llmRequestId?: string;
}

export interface AnalysisResult extends LlmScoringResult {
  clientId: string;
  ingestionRunId: string;
  blockStatus: BlockStatusMap;
  guardrail: GuardrailResult;
  frameworkVersion: string;
  createdAt: string;
}
