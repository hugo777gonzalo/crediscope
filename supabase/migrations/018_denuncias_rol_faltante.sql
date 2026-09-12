-- Completa lo que las migraciones 008 (framework-v4) y 009
-- (framework-v5) debieron insertar y nunca llegaron a aplicarse
-- completas en su momento — notado auditando la sección B de
-- Configuración operativa (ver también 017_limpieza_campo_huerfano.sql,
-- la otra mitad de esta misma limpieza).
--
-- 1. numeroDenunciasComoSospechoso/numeroDenunciasComoVictima nunca
--    tuvieron fila en standard_profile_field_config, aunque el
--    StandardClientProfile los calcula desde hace varias rondas.
-- 2. framework-v4 y framework-v5 nunca quedaron registradas en
--    scoring_rules_versions (se confirma comparando contra el
--    historial completo: framework-v0/v1/v2/v3/v6/v7, marco-v8/v9/v10/v11
--    sí están, v4 y v5 faltan) — solo afecta el registro histórico/
--    auditoría, MARCO_VERSION en código nunca dependió de esta tabla
--    para decidir comportamiento en tiempo de ejecución.

insert into standard_profile_field_config (grupo, campo) values
  ('riesgoPenal', 'numeroDenunciasComoSospechoso'),
  ('riesgoPenal', 'numeroDenunciasComoVictima')
on conflict (grupo, campo) do nothing;

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('framework-v4', 'Corrige impedimentoCargosPublicos: no es guardrail, el LLM debe juzgarlo y penalizar fuerte', '{}'::jsonb, false),
  ('framework-v5', 'Separa numeroDenunciasFiscalia por rol del cliente (sospechoso penaliza, victima/denunciante es solo contexto)', '{}'::jsonb, false)
on conflict (version) do nothing;
