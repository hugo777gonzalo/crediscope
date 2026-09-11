-- framework-v7 (ver supabase/functions/_shared/interpretive-framework.ts):
-- separa riesgoJudicialCivil en 2 grupos, a pedido del usuario:
--   - riesgoJudicialCrediticio: demandas de cobro/pagarés/ejecuciones
--     (reemplaza al booleano demandaProblemaCrediticio).
--   - riesgoJudicialCivil: el resto (laboral, familia, tránsito, etc).
-- También agrega compliance.tieneDelitoGraveSeguridad/
-- categoriasDelitoGraveSeguridad — guardrail duro nuevo (lavado de
-- activos, narcotráfico, trata de personas, armas, extorsión).

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('framework-v7', 'Separa riesgoJudicialCivil en riesgoJudicialCrediticio/riesgoJudicialCivil; agrega guardrail de delitos graves de seguridad', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version in ('framework-v0', 'framework-v1', 'framework-v2', 'framework-v3', 'framework-v4', 'framework-v5', 'framework-v6');

insert into standard_profile_field_config (grupo, campo) values
  ('riesgoJudicialCrediticio', 'numeroDemandasComoDemandado'),
  ('riesgoJudicialCrediticio', 'tiposDemandasComoDemandado'),
  ('compliance', 'tieneDelitoGraveSeguridad'),
  ('compliance', 'categoriasDelitoGraveSeguridad');

-- limpia la fila huérfana del campo eliminado (reemplazado por el
-- grupo riesgoJudicialCrediticio completo).
delete from standard_profile_field_config where grupo = 'riesgoJudicialCivil' and campo = 'demandaProblemaCrediticio';
