-- marco-v25, estructura-v9 y fuentes-v9: lo que mostró la comparación de
-- razonamiento de marco-v24 (2026-09-28), con las decisiones del negocio.
--
-- 1. La fila de la versión. Se aplica ANTES de desplegar: sin ella el
--    primer análisis falla por clave foránea.
-- 2. El campo nuevo del perfil, para que un admin pueda apagarlo en
--    Configuración (lo que se apaga es lo que no lee el modelo).
--
-- El bloqueo por delitos de seguridad ciudadana (control_bloqueo) no es una
-- tabla que se migre: se recalcula desde el crudo con
-- scripts/recalcular-grupos.mjs --bloqueo.

insert into scoring_rules_versions (version, description) values
  ('marco-v25',
   'El perfil del modelo declara qué temas se consultaron, en palabras del negocio, en lugar de nombrar 52 fuentes. El impedimento para cargos públicos por deuda con el Estado es revisar y verificar la deuda, no negar; por jubilación o indemnización no es un riesgo. Jubilados que dejaron de aportar no pierden su ingreso; militares y policías tienen su ingreso aunque no aporten al IESS. Lee estructura-v9: las denuncias cuentan según el papel de la persona y el bloqueo ya no alcanza a víctimas ni denunciantes.')
on conflict (version) do nothing;

insert into standard_profile_field_config (grupo, campo) values
  ('seguridadSocial', 'servicioMilitarOPolicial')
on conflict (grupo, campo) do nothing;
