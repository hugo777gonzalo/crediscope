-- marco-v29: el modelo deja de recibir la cédula, el nombre de la persona y
-- el de sus empleadores (auditoría externa del 2026-10-09, E27; decisión del
-- negocio del 2026-10-13).
--
-- Sólo la fila de la versión: sin ella el primer análisis con v29 falla por
-- la clave foránea de analysis_results.rules_version. Por eso
-- ESQUEMA_MINIMO sube a 128: primero se migra, después se despliega.
--
-- Va después de la 127 (PR #24, la cédula fuera de llm_llamadas). Si esa
-- todavía no se aplicó cuando se fusione ésta, se renumera: el corredor no
-- vuelve atrás a aplicar un número salteado.

insert into scoring_rules_versions (version, description) values
  ('marco-v29',
   'El perfil del modelo deja de llevar la cédula, el nombre completo, el nombre de cada empleador (cada empleo actual llega con su tipo: Empleador privado, público, etc.) y la institución de una PEP. El marco deja de pedir que se nombren los empleadores. Todo número llega entero (los centavos no cambian una decisión y el modelo los copiaba al resumen). Los atributos protegidos (sexo, estado civil, origen, familia, edad) siguen llegando hasta la decisión del negocio con legal.')
on conflict (version) do nothing;
