-- Agenda del trabajador de lotes: cada minuto.
--
-- ATENCIÓN AL APLICAR: igual que la agenda del vigía, este archivo
-- lleva marcadores y no valores. Reemplazar <<PROYECTO_URL>> y
-- <<VIGIA_CLAVE>> por los reales (están en .env.functions, excluido del
-- repositorio) y correr el resultado.
--
-- POR QUÉ CADA MINUTO Y NO CADA QUINCE
--
-- El vigía solo mira; este trabaja. Cuando alguien sube un archivo de
-- mil cédulas quiere ver que arranca, no esperar un cuarto de hora a
-- que empiece. Y si no hay nada que hacer, la corrida sale en
-- milisegundos: preguntar seguido no cuesta nada.
--
-- Cada invocación trabaja hasta agotar su presupuesto y devuelve el
-- control; la siguiente sigue donde quedó. Si una corrida todavía está
-- adentro cuando dispara la próxima, no se pisan: las cédulas se marcan
-- tomadas antes de trabajarlas.

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
  );
  $$
);
