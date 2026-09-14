-- marco-v16: la recomendación pasa de ser una etiqueta a decir qué
-- hacer con el caso.
--
-- El problema que lo motivó: la tarjeta de Recomendación mostraba el
-- dictamen ("Aprobación", "Observación") y debajo una frase FIJA por
-- etiqueta, la misma para todos los clientes. Tenía forma de análisis
-- sin serlo, y en una pantalla que un jefe lee de arriba abajo eso es
-- peor que dejar el espacio vacío.
--
-- Ahora el modelo devuelve 2-4 pasos concretos de este cliente: qué
-- validar, qué pedirle, qué destrabaría la decisión. Queda una pregunta
-- por campo: narrative_summary el porqué, acciones_sugeridas el qué
-- hago, missing_info lo que no se pudo confirmar (antes lo accionable
-- vivía a medias ahí adentro, mezclado con el diagnóstico).
--
-- Lo que el modelo NO puede proponer, por indicación explícita del
-- usuario: montos, plazos, cuotas, tasas o garantías. Esa es la parte
-- económica de la entidad, que simula la cuota y la contrasta contra la
-- capacidad de pago del cliente -- otro módulo, no este. Es la misma
-- frontera entre criterio del modelo y política de crédito que ya rige
-- en el ciclo de retroalimentación.
--
-- Default '[]' y no null: un análisis anterior a esta versión no tiene
-- acciones, y la pantalla lo dice en vez de rellenar con la frase
-- genérica de antes.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v16',
   'La recomendación incorpora acciones sugeridas (2-4 pasos concretos de qué validar o pedir al cliente), sin condiciones comerciales',
   '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version <> 'marco-v16';

alter table analysis_results add column acciones_sugeridas jsonb not null default '[]'::jsonb;
