-- marco-v11 (ver supabase/functions/_shared/marco-interpretativo.ts):
-- refina 3 criterios cualitativos del prompt, sin cambios al
-- StandardClientProfile (no requiere tocar standard_profile_field_config):
--   - patrimonio: un vehículo/inmueble se explica también como
--     colateral potencial, no solo señal de solvencia.
--   - riesgoJudicialCivil: deudaPensionAlimenticia > 0 sin mora ahora
--     se trata como gasto fijo que resta capacidad de pago (antes solo
--     se explicaba pensionAlimenticiaEnMora).
--   - identidad: nivelEducacion (tercer/cuarto nivel) pasa a ser un
--     atenuante leve de contexto de capacidad; edad/estadoCivil/género
--     siguen explícitamente sin peso en el score (decisión explícita
--     del usuario, riesgo de discriminación indirecta).

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v11', 'Refina criterios cualitativos: patrimonio como colateral, pension alimenticia al dia resta capacidad, nivelEducacion como atenuante leve', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version = 'marco-v10';
