-- marco-v12 (ver supabase/functions/_shared/marco-interpretativo.ts):
-- 5 campos nuevos de estabilidad laboral/actividad económica (grupo
-- laboral), validados con caso real (cédula 0502932429):
--   - estadoActividadEconomica, antiguedadUltimaEtapaActivaMeses,
--     mesesInactivoActividadEconomica: estado real de la actividad
--     económica (RUC) más allá de solo "activo/inactivo" -- 5 casos
--     documentados en process.ts.
--   - antiguedadEmpleoActualMeses, duracionEmpleoMasLargoMeses:
--     antigüedad del empleo actual (fuente tiess) y del empleo más
--     largo registrado históricamente.
--
-- De paso corrige un bug real en producción desde marco-v9:
-- tiess.fecIng/fecSal (DD/MM/YYYY) se parseaban como si fueran
-- MM/DD/YYYY, afectando numeroEmpleadoresUltimos24Meses. No requiere
-- cambio de configuración (mismo campo, ya registrado).

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v12', 'Agrega estadoActividadEconomica/antiguedadEmpleoActual/duracionEmpleoMasLargo; corrige bug de parseo de fechas DD/MM/YYYY en tiess (afectaba numeroEmpleadoresUltimos24Meses)', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version = 'marco-v11';

insert into standard_profile_field_config (grupo, campo) values
  ('laboral', 'estadoActividadEconomica'),
  ('laboral', 'antiguedadUltimaEtapaActivaMeses'),
  ('laboral', 'mesesInactivoActividadEconomica'),
  ('laboral', 'antiguedadEmpleoActualMeses'),
  ('laboral', 'duracionEmpleoMasLargoMeses');
