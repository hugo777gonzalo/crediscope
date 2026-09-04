-- analysis_results.rules_version tiene una foreign key hacia
-- scoring_rules_versions(version) — hay que registrar cada nueva versión
-- del marco interpretativo ahí antes de poder insertar análisis con ella,
-- si no el insert falla con "violates foreign key constraint
-- analysis_results_rules_version_fkey".
--
-- framework-v1 (ver supabase/functions/_shared/interpretive-framework.ts):
-- el LLM ahora recibe el StandardClientProfile (ya calculado/procesado)
-- en vez del ClientContext casi crudo — esto resolvió cortes de
-- respuesta a medias por max_tokens en clientes con mucho historial.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('framework-v1', 'LLM recibe StandardClientProfile procesado en vez de ClientContext casi crudo — reduce tokens de entrada', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version = 'framework-v0';
