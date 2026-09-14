-- marco-v15: indicadores de lectura rápida para la tarjeta del cliente
-- en "Análisis con IA" (rediseño de la pantalla pedido por el usuario).
--
-- Dos etiquetas, no prosa:
--   indicador_riesgo    — nivel de riesgo general, coherente con el score.
--   indicador_historial — calidad del comportamiento de pago demostrado,
--                         juzgado SOLO con los grupos de comportamiento
--                         (bancario, cooperativas, interno y judicial
--                         crediticio), indicación explícita del usuario.
--
-- El tercer indicador del diseño, CAPACIDAD DE PAGO, queda pendiente a
-- propósito: no hay todavía una fuente de ingresos confiable con qué
-- calcularla. Ponerlo igual sería inventar un criterio.
--
-- Nullable sin valor por defecto: los análisis anteriores a esta
-- versión no tienen indicadores y la pantalla los omite en vez de
-- mostrar una etiqueta que nadie calculó.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v15',
   'Agrega indicadores de lectura rápida (riesgo, historial de pago) y reparte explícitamente qué va en cada sección para que el resumen no repita lo que ya dicen el score y los indicadores',
   '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version <> 'marco-v15';

alter table analysis_results add column indicador_riesgo text;
alter table analysis_results add column indicador_historial text;

alter table analysis_results
  add constraint analysis_results_indicador_riesgo_check
  check (indicador_riesgo is null or indicador_riesgo in ('muy bajo', 'bajo', 'moderado', 'alto', 'muy alto'));

alter table analysis_results
  add constraint analysis_results_indicador_historial_check
  check (indicador_historial is null or indicador_historial in ('excelente', 'bueno', 'regular', 'malo', 'sin historial'));
