-- marco-v14: recomendación de acción (aprobar/revisar/observar/negar)
-- además del score, a pedido del usuario -- el score es un
-- acompañamiento al analista, y un número de 1-999 por sí solo no le
-- dice qué hacer con el caso.
--
-- "revisar" y "observar" son distintos a propósito: revisar = está la
-- información y el caso es limítrofe; observar = falta información y
-- con ella la decisión podría cambiar en cualquier dirección (ahí
-- missing_info dice qué habría que pedirle al cliente).
--
-- Es además la pieza base del ciclo de retroalimentación que viene
-- después: comparar "recomendamos negar y cayó en default" contra el
-- resultado real es mucho más accionable para un área de crédito que
-- comparar un score de 1-999 contra un sí/no.
--
-- Si un control de bloqueo es bloqueante, analyze-client fuerza
-- "negar" igual que fuerza el score a 1 -- no se delega al LLM.

alter table analysis_results add column recomendacion text
  check (recomendacion in ('aprobar', 'revisar', 'observar', 'negar'));
comment on column analysis_results.recomendacion is 'Acción sugerida al analista. null en análisis anteriores a marco-v14.';

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v14', 'Agrega recomendación de acción (aprobar/revisar/observar/negar) además del score', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version = 'marco-v13';
