-- Monitoreo/auditoría de tiempos (a pedido del usuario) -- duración en
-- milisegundos de cada etapa del pipeline, para poder calcular
-- promedio/mínimo/máximo en el Reporte Gerencial de Gestión.
--
-- No se reutiliza ingestion_runs.created_at/completed_at para esto: esa
-- tabla mezcla 2 escenarios distintos en analyze-client (consulta
-- completa a la fuente + IA, vs. reutilizar un client_profiles ya
-- calculado y correr solo la IA) bajo el mismo par de timestamps, sin
-- forma de distinguir cuál pasó. Guardar la duración directo en la fila
-- que describe (client_profiles = cuánto tardó ESA ingesta,
-- analysis_results = cuánto tardó ESE análisis, separando ingesta de
-- LLM) es más simple y sin ambigüedad.

alter table client_profiles add column duracion_ms integer;
comment on column client_profiles.duracion_ms is 'Milisegundos que tardó la ingesta a la fuente + construcción de la Estructura Estandarizada.';

alter table analysis_results add column duracion_ingesta_ms integer;
comment on column analysis_results.duracion_ingesta_ms is 'Milisegundos de ingesta a la fuente en ESTE análisis -- null si se reutilizó un client_profiles existente (profileId).';

alter table analysis_results add column duracion_llm_ms integer;
comment on column analysis_results.duracion_llm_ms is 'Milisegundos de la llamada al LLM (scoreWithLlm) -- se registra siempre, se reutilice o no el perfil.';
