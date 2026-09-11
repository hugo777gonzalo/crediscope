-- marco-v8 (ver supabase/functions/_shared/marco-interpretativo.ts):
-- ajuste de terminología en todo el proyecto, a pedido del usuario (usar
-- español ecuatoriano estándar de la industria financiera/legal, salvo
-- que no exista término en español):
--   - "compliance" -> "cumplimiento" (grupo del StandardClientProfile).
--   - "central de riesgos" -> "buró de crédito"
--     (numeroOperacionesCentralRiesgo -> numeroOperacionesBuroCredito;
--     recursos de ingesta centralRiesgoSuper/Diners/Coop -> buroCreditoSuper/Diners/Coop).
--   - "tieneOperacionJudicializada" -> "tieneOperacionConDemanda".
--   - peorCalificacionRiesgo ahora tiene su contraparte mejorCalificacionRiesgo.
--   - "guardrail"/"AML" solo cambiaron en código/comentarios/prompt del
--     LLM, no en el StandardClientProfile — no requieren fila de
--     configuración nueva.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v8', 'Ajuste de terminologia: compliance->cumplimiento, central de riesgos->buro de credito, tieneOperacionJudicializada->tieneOperacionConDemanda, agrega mejorCalificacionRiesgo', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version in
  ('framework-v0', 'framework-v1', 'framework-v2', 'framework-v3', 'framework-v4', 'framework-v5', 'framework-v6', 'framework-v7');

-- ---------- standard_profile_field_config ----------

update standard_profile_field_config set grupo = 'cumplimiento' where grupo = 'compliance';

update standard_profile_field_config set campo = 'tieneOperacionConDemanda'
  where grupo in ('comportamientoBancario', 'comportamientoCooperativas') and campo = 'tieneOperacionJudicializada';

update standard_profile_field_config set campo = 'numeroOperacionesBuroCredito'
  where grupo = 'comportamientoBancario' and campo = 'numeroOperacionesCentralRiesgo';

insert into standard_profile_field_config (grupo, campo) values
  ('comportamientoBancario', 'mejorCalificacionRiesgo');

-- ---------- novadata_resource_config ----------

update novadata_resource_config set recurso = 'buroCreditoSuper' where recurso = 'centralRiesgoSuper';
update novadata_resource_config set recurso = 'buroCreditoDiners' where recurso = 'centralRiesgoDiners';
update novadata_resource_config set recurso = 'buroCreditoCoop' where recurso = 'centralRiesgoCoop';
