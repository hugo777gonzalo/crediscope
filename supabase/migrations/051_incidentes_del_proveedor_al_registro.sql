-- Completa el registro con las llamadas que fallaron SIN generar
-- tokens.
--
-- La reconstrucción del historial (045) solo trajo llamadas con tokens
-- de salida, porque buscaba costo. Pero una caída del proveedor no
-- genera tokens y sigue siendo el incidente más importante de todos:
-- las cuatro llamadas de la madrugada del 2026-09-11 (HTTP 500, 500,
-- 520, 500) no estaban en el registro, así que el historial de
-- incidentes arrancaba sin la única caída real que tuvimos.
--
-- Entran con costo cero, que acá sí es el número correcto: el proveedor
-- no llegó a procesar nada.
insert into llm_llamadas (
  funcion, modelo, client_id, analysis_result_id, contexto, exito,
  error, fallo_tipo, tokens_entrada, tokens_salida, duracion_ms,
  es_prueba, created_at, origen_medicion
)
select
  'analyze-client',
  coalesce(ar.llm_model, 'desconocido'),
  ar.client_id,
  ar.id,
  jsonb_build_object('marco', ar.rules_version),
  false,
  ar.fallo,
  ar.fallo_tipo,
  0,
  0,
  ar.duracion_llm_ms,
  true,
  ar.created_at,
  'reconstruida'
from analysis_results ar
where ar.fallo is not null
  and not exists (
    select 1 from llm_llamadas l where l.analysis_result_id = ar.id
  );
