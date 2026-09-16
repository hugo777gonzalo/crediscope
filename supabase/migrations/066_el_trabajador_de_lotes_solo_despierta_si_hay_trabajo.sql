-- El trabajador de lotes deja de despertarse al pedo.
--
-- ATENCIÓN AL APLICAR: igual que la 054 y la 060, este archivo lleva
-- marcadores y no valores. Reemplazar <<PROYECTO_URL>> y <<VIGIA_CLAVE>>
-- por los reales (están en .env.functions, excluido del repositorio) y
-- correr el resultado.
--
-- QUÉ CAMBIA
--
-- La agenda sigue siendo cada minuto: cuando alguien sube mil cédulas
-- quiere ver que arranca, no esperar un cuarto de hora. Lo que cambia es
-- que ahora la tarea PREGUNTA ANTES de llamar a la función.
--
-- La auditoría del 2026-09-16 encontró 333 invocaciones en las últimas
-- horas con los cuatro lotes terminados: la función se levantaba, no
-- encontraba nada y se iba. Bajar la frecuencia habría arreglado el
-- desperdicio y roto lo bueno --un lote grande tardaría cinco veces
-- más--, así que en vez de espaciar la pregunta se la hace donde es
-- barata: un `exists` sobre lote_items cuesta microsegundos y no
-- levanta nada.
--
-- Con la cola vacía, cero invocaciones. Con trabajo, la misma velocidad
-- de antes.

select cron.unschedule('procesar-lote-crediscope')
 where exists (select 1 from cron.job where jobname = 'procesar-lote-crediscope');

select cron.schedule(
  'procesar-lote-crediscope',
  '* * * * *',
  $$
  select net.http_post(
    url := '<<PROYECTO_URL>>/functions/v1/procesar-lote',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-vigia-clave', '<<VIGIA_CLAVE>>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  -- 'en_curso' también cuenta: un ítem tomado por una corrida que se
  -- cortó a la mitad tiene que poder volver a la cola, y para eso
  -- alguien tiene que estar mirando.
  where exists (
    select 1 from lote_items where estado in ('pendiente', 'en_curso')
  );
  $$
);
