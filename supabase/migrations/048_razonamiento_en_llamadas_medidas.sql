-- Completa el razonamiento de las llamadas que se grabaron en vivo
-- antes de que el registro supiera guardarlo.
--
-- Sin esto quedan mezcladas dos cosas en la misma columna: filas donde
-- "respuesta = salida - razonamiento" y filas donde el razonamiento es
-- nulo y toda la salida parece respuesta. La comparación entre versiones
-- del criterio -- que es justo para lo que existe esa columna -- daba un
-- salto que no ocurrió.
update llm_llamadas l
   set tokens_razonamiento = (ar.llm_usage -> 'output_tokens_details' ->> 'thinking_tokens')::int
  from analysis_results ar
 where ar.id = l.analysis_result_id
   and l.tokens_razonamiento is null
   and l.origen_medicion <> 'sin_datos'
   and (ar.llm_usage -> 'output_tokens_details' ->> 'thinking_tokens') is not null;
