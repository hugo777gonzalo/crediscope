-- ============================================================
-- CrediScope — agrega metadata de la llamada al LLM a analysis_results
-- (modelo, motivo de parada, uso de tokens, id de la request en
-- Anthropic) — para poder auditar/depurar el scoring. Pegar en el
-- editor SQL de Supabase (proyecto ya tiene el esquema base de
-- schema.sql corriendo).
-- ============================================================

alter table analysis_results
  add column if not exists llm_model        text,
  add column if not exists llm_stop_reason  text,
  add column if not exists llm_usage        jsonb,
  add column if not exists llm_request_id   text;

comment on column analysis_results.llm_stop_reason is
  'end_turn = completó normal; max_tokens = se cortó a medias (subir max_tokens en llm-scoring.ts si pasa seguido)';
comment on column analysis_results.llm_usage is
  'Objeto usage completo de la respuesta de Anthropic: input_tokens, output_tokens, output_tokens_details.thinking_tokens, etc.';
