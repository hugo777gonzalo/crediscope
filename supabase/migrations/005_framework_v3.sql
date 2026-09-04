-- framework-v3 (ver supabase/functions/_shared/interpretive-framework.ts):
-- orden de importancia de los 14 grupos del StandardClientProfile
-- definido explícitamente por el usuario:
-- compliance, comportamientoBancario, comportamientoCooperativas,
-- riesgoJudicialCivil, riesgoPenal, laboral=tributario, seguridadSocial,
-- patrimonio, familia, identidad, contacto, transitoVehicular,
-- comportamientoInterno (último, condicional — se ignora si no hay
-- dato; verificado contra la muestra real que SÍ está presente en el
-- 76% de los casos, pero se mantiene al final por decisión del negocio).

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('framework-v3', 'Orden de importancia de los 14 grupos definido por el negocio (compliance primero, comportamientoInterno último/condicional)', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version in ('framework-v0', 'framework-v1', 'framework-v2');
