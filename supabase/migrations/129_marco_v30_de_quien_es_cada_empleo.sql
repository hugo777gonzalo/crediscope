-- marco-v30: cada empleo y cada aporte dicen de quién son (2026-10-16).
--
-- Sólo la fila de la versión: sin ella el primer análisis con v30 falla por
-- la clave foránea de analysis_results.rules_version. ESQUEMA_MINIMO sube a
-- 129: primero se migra, después se despliega.
--
-- Tomó el 129 al aplicarse, antes que el PR #26 (un solo buró por
-- institución), que lo tenía en su rama sin aplicar: ése pasa al siguiente.

insert into scoring_rules_versions (version, description) values
  ('marco-v30',
   'Cada empleo actual y cada aporte llegan con esSuPropioPatrono y posibleNegocioFamiliar, calculados con el nombre del empleador antes de borrarlo (el nombre sigue sin llegar, E27). Con v29 sólo había las marcas de la persona entera y, con dos empleos, no se sabía cuál era el del pariente. Un Empleador público nunca es negocio familiar.')
on conflict (version) do nothing;
