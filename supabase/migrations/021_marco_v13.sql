-- marco-v13 (ver supabase/functions/_shared/marco-interpretativo.ts):
-- ronda de auditoría sobre pruebas reales del usuario (cédulas
-- 0502932429 y 0501578256). Resumen (detalle completo en el
-- changelog de marco-interpretativo.ts):
--   - BUG grave corregido: pensionAlimenticiaEnMora/deudaPensionAlimenticia
--     no distinguían representanteLegal (a quien LE DEBEN) de
--     obligadoPrincipal (quien DEBE) en pn_supa -- 6 de 12 clientes de
--     la muestra estaban mal marcados. No requiere cambio de config
--     (mismos campos, el dato que calculan ahora es el correcto).
--   - seguridadSocial.afiliadoIessActivo ahora puede ser null (antes
--     siempre false cuando Novadata no traía el recurso de afiliación
--     IESS -- pasa en 32 de 40 clientes de la muestra).
--   - laboral.antiguedadEmpleoActualMeses/numeroEmpleadoresUltimos24Meses/
--     duracionEmpleoMasLargoMeses: ya no asumen "sigue activo hoy" solo
--     porque tiess no trae fecha de salida.
--   - Corrige el redondeo de mesesEntreFechas (ignoraba el día del mes).
--   - Nuevo campo laboral.tipoUltimoCeseRuc ("cancelacion" |
--     "suspension_definitiva") -- sí requiere alta en
--     standard_profile_field_config, ver abajo.
--   - Instrucción nueva de redacción para el LLM (lenguaje natural, sin
--     nombres de campos ni "null" literal) -- no requiere cambio de config.
--
-- Además, a pedido del usuario: el segmento "Riesgo Judicial
-- Crediticio" pasa a mostrarse siempre en Perfil del Cliente (antes
-- solo con datos) -- es información relevante en sí misma que el
-- cliente no tenga demandas de esa naturaleza.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v13', 'Corrige bug de rol en pensión alimenticia (representanteLegal vs. obligadoPrincipal), afiliadoIessActivo=null cuando el recurso no trae datos, antigüedad laboral que asumía "activo hoy" sin evidencia reciente, redondeo de meses, y agrega laboral.tipoUltimoCeseRuc', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version = 'marco-v12';

insert into standard_profile_field_config (grupo, campo) values
  ('laboral', 'tipoUltimoCeseRuc');

update standard_profile_segment_config set modo = 'siempre', updated_at = now()
  where grupo = 'riesgoJudicialCrediticio';
