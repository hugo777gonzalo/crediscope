-- Marca como fallidos los análisis que ya estaban guardados como si
-- fueran buenos.
--
-- Son 7 sobre 63. Cuatro de ellos son de la noche del 2026-09-10 y
-- cuentan una historia: HTTP 500, 500, 520, 500 seguidos. El proveedor
-- estuvo caído y nadie se enteró -- ni en el momento ni después, porque
-- el error se guardó en el campo del resumen y desde afuera esas filas
-- se veían igual que un análisis real con puntaje 500.
--
-- Es exactamente el incidente que hay que poder detectar y comunicar
-- para sostener un compromiso de tiempo de resolución. Quedan marcados
-- para que el historial de incidentes arranque con lo que de verdad
-- pasó.
update analysis_results
   set fallo = narrative_summary,
       narrative_summary = null,
       fallo_tipo = case
         when narrative_summary ilike '%usage limit%' or narrative_summary ilike '%credit balance%' then 'tope_de_gasto'
         when narrative_summary ilike '%http 401%' or narrative_summary ilike '%http 403%' then 'credencial'
         when narrative_summary ilike '%http 429%' or narrative_summary ilike '%overloaded%' then 'limite_velocidad'
         when narrative_summary ~* 'http 5[0-9][0-9]' then 'proveedor_caido'
         when narrative_summary ilike '%no se pudo interpretar%'
           or narrative_summary ilike '%respuesta inesperada%' then 'respuesta_ilegible'
         else 'desconocido'
       end
 where fallo is null
   and (
     narrative_summary like 'error del LLM%'
     or narrative_summary like 'respuesta inesperada%'
     or narrative_summary like 'no se pudo interpretar%'
   );

-- La reconstrucción del historial (045) dio por exitosa toda llamada
-- que tuviera tokens. No alcanza: una respuesta que llegó completa pero
-- ilegible gastó tokens y no produjo ningún análisis. Contarlas como
-- buenas baja el costo por consulta promediando casos que no
-- analizaron a nadie.
update llm_llamadas l
   set exito = false,
       error = coalesce(l.error, ar.fallo),
       fallo_tipo = ar.fallo_tipo
  from analysis_results ar
 where ar.id = l.analysis_result_id
   and ar.fallo is not null
   and l.exito = true;
