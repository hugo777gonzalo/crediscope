-- marco-v10 (ver supabase/functions/_shared/marco-interpretativo.ts):
-- nuevo grupo riesgoSeguridadCiudadana, mismo nivel que Riesgo Judicial
-- Crediticio/Civil (justo después de cumplimiento), a pedido del
-- usuario. Antes vivía como 2 campos sueltos dentro de cumplimiento
-- (tieneDelitoGraveSeguridad/categoriasDelitoGraveSeguridad, ahora
-- tieneDelitoSeguridadCiudadana/categoriasDelitoSeguridadCiudadana).
-- Validado con 4 cédulas reales: confirmó extorsión/tenencia de armas/
-- lavado de activos funcionando, y encontró un hueco real
-- ("Delincuencia organizada", COIP Art. 369, 4 apariciones reales) --
-- se agregan 3 categorías nuevas: Delincuencia organizada, Asociación
-- ilícita y Asesinato/homicidio intencional (excluye explícitamente
-- homicidio culposo/preterintencional).

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v10', 'Nuevo grupo riesgoSeguridadCiudadana (antes 2 campos en cumplimiento); agrega categorias Delincuencia organizada, Asociacion ilicita, Asesinato/homicidio intencional', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version = 'marco-v9';

-- ---------- standard_profile_field_config ----------

update standard_profile_field_config set grupo = 'riesgoSeguridadCiudadana', campo = 'tieneDelitoSeguridadCiudadana'
  where grupo = 'cumplimiento' and campo = 'tieneDelitoGraveSeguridad';

update standard_profile_field_config set grupo = 'riesgoSeguridadCiudadana', campo = 'categoriasDelitoSeguridadCiudadana'
  where grupo = 'cumplimiento' and campo = 'categoriasDelitoGraveSeguridad';
