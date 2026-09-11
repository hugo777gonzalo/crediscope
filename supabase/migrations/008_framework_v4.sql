-- framework-v4 (ver supabase/functions/_shared/interpretive-framework.ts):
-- corrige una imprecisión en el prompt del LLM: decía que
-- impedimentoCargosPublicos ya era un guardrail resuelto aparte (igual
-- que enListaControl/enListaNegra), pero nunca lo fue (no existe en
-- guardrails.ts). Ahora el texto es explícito: SÍ le toca al LLM
-- juzgarlo, y debe penalizar fuerte. Coincide con un fix de parseo en
-- process.ts (impedimentoCargosPublicos.data es un array, no objeto —
-- antes daba false/null siempre sin importar la realidad).

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('framework-v4', 'Corrige impedimentoCargosPublicos: no es guardrail, el LLM debe juzgarlo y penalizar fuerte', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version in ('framework-v0', 'framework-v1', 'framework-v2', 'framework-v3');
