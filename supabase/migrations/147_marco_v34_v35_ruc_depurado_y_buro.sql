-- marco-v34 y marco-v35: el RUC depurado neutro para todas las depuradas, y el
-- buró de la institución encendido (decisiones del negocio del 2026-11-04).
--
-- Sólo las filas de las versiones: sin ellas, el primer análisis falla por la
-- clave foránea de analysis_results.rules_version. Por eso ESQUEMA_MINIMO sube
-- a este número: primero se migra, después se despliega.
--
-- Entra marco-v35: CONFIG_LLM.buroDeLaInstitucion queda encendido. marco-v34
-- es el texto sin buró, el que lee un lote en una base cuyo buró no es Equifax.
-- Las filas de marco-v32 y v33 se quedan, sin ningún análisis.
--
-- El número se toma al aplicarla (regla 1 de CLAUDE.md): si al fusionarla 147
-- ya está tomado, se renombra con el siguiente libre.

insert into scoring_rules_versions (version, description) values
  ('marco-v34',
   'marco-v32 con el RUC depurado neutro para toda baja por depuración del SRI (estructura-v18, rucDepuradoPorElSri: 169 personas), no sólo con la actividad en relación de dependencia (17): la baja la decidió el SRI, no la persona, y 77 de las 169 traen «SIN ACTIVIDAD ECONOMICA».'),
  ('marco-v35',
   'marco-v33 con el mismo cambio de marco-v34: el buró de la institución en lugar del de bancos y de cooperativas de Proveedor_Info_1 cuando la persona tiene una consulta vigente de Equifax, y el RUC depurado neutro para todas las depuradas. Encendida el 2026-11-04 (CONFIG_LLM.buroDeLaInstitucion). Sin buró, el texto y el perfil son los de marco-v34.')
on conflict (version) do nothing;
