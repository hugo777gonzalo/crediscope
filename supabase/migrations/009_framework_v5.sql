-- framework-v5 (ver supabase/functions/_shared/interpretive-framework.ts):
-- numeroDenunciasFiscalia (contaba todas las denuncias por igual, sin
-- mirar el rol del cliente) se reemplaza por
-- numeroDenunciasComoSospechoso/numeroDenunciasComoVictima — mismo
-- criterio que numeroDemandasComoDemandado/ComoOfendido en
-- riesgoJudicialCivil.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('framework-v5', 'Separa numeroDenunciasFiscalia por rol del cliente (sospechoso penaliza, victima/denunciante es solo contexto)', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version in ('framework-v0', 'framework-v1', 'framework-v2', 'framework-v3', 'framework-v4');

insert into standard_profile_field_config (grupo, campo) values
  ('riesgoPenal', 'numeroDenunciasComoSospechoso'),
  ('riesgoPenal', 'numeroDenunciasComoVictima');

-- limpia la fila huérfana del campo renombrado (ya no existe en el
-- StandardClientProfile, no debería seguir apareciendo en /admin/configuracion).
delete from standard_profile_field_config where grupo = 'riesgoPenal' and campo = 'numeroDenunciasFiscalia';

