-- Dos correcciones a la reconstrucción del historial (045).
--
-- 1. Análisis fallidos contados dos veces.
--    Cuando un análisis falla, la llamada al modelo SÍ queda registrada
--    (con sus tokens en cero) pero no se crea la fila de análisis. La
--    reconstrucción buscaba justamente eso -- bitácora sin fila de
--    análisis -- y le agregaba una llamada "sin datos" que ya estaba
--    registrada. Resultado: un intento fallido figuraba como tres
--    llamadas en vez de dos.
--
--    Se borran las reconstruidas que tienen una llamada medida del
--    mismo proceso a menos de dos minutos. Dos minutos porque un
--    análisis con escalamiento son dos llamadas seguidas y la bitácora
--    se escribe al final.
delete from llm_llamadas l
 where l.origen_medicion = 'sin_datos'
   and l.funcion = 'analyze-client'
   and exists (
     select 1 from llm_llamadas m
      where m.origen_medicion <> 'sin_datos'
        and m.funcion = 'analyze-client'
        and m.created_at between l.created_at - interval '2 minutes'
                            and l.created_at + interval '2 minutes'
   );

-- 2. Las llamadas grabadas en vivo no decían con qué criterio corrieron.
--    El contexto lo empezó a guardar hoy; las anteriores lo tienen en la
--    fila del análisis. Sin esto, la vista de costo por consulta las
--    descarta y el promedio "con el criterio actual" sale de un solo
--    análisis viejo.
update llm_llamadas l
   set contexto = l.contexto || jsonb_build_object('marco', ar.rules_version)
  from analysis_results ar
 where ar.id = l.analysis_result_id
   and l.contexto ->> 'marco' is null
   and ar.rules_version is not null;
