-- marco-v28 y el precio de Claude Sonnet 5.5 (2026-10-03).
--
-- 1. La fila de la versión. Se aplica ANTES de desplegar: sin ella el
--    primer análisis falla por clave foránea. v28 es sólo forma (decisión
--    del negocio, antes del lote del Laboratorio): voseo parejo, menos
--    mayúsculas, la regla de las ausencias en un solo lugar, la respuesta
--    garantizada por un esquema JSON, y comportamientoInterno sólo cuando
--    la persona es cliente interno. 33.380 caracteres contra 39.195 de v27.
-- 2. El precio de claude-sonnet-5-5, para comparar modelos con
--    scripts/comparar-razonamiento.mjs y para que llm_costos lo valúe si se
--    adopta. Precio de lista (2026-10-03): el mismo que claude-sonnet-5.

insert into scoring_rules_versions (version, description) values
  ('marco-v28',
   'Sólo forma, sin cambiar criterios: voseo parejo, menos mayúsculas, la regla de las ausencias que no se informan en un solo lugar, y la respuesta garantizada por un esquema JSON (antes la pedía el texto). El perfil del modelo deja de mandar comportamientoInterno cuando la persona no es cliente interno.')
on conflict (version) do nothing;

insert into llm_precios (modelo, vigente_desde, usd_entrada, usd_salida, usd_cache_escritura, usd_cache_lectura, fuente) values
  ('claude-sonnet-5-5', '2026-10-01', 2.00, 10.00, 2.50, 0.20, 'precio de lista al 2026-10-03, igual que claude-sonnet-5');
