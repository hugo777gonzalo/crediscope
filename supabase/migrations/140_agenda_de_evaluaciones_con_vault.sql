-- La agenda de las evaluaciones de la API lee la clave de Vault, como las otras.
--
-- LLEVA UN MARCADOR (<<PROYECTO_URL>>): lo rellena el corredor.
--
-- La 139 escribió la clave del vigía en texto plano dentro de cron.job, justo lo
-- que la 114 había sacado de las otras dos agendas. Lo marcó
-- auditar-seguridad.mjs («La clave de la agenda vive en Vault») el 2026-10-30,
-- minutos después de aplicarla: las pruebas en PGlite de la 139 no cubrían la
-- agenda.
--
-- pg_cron además copia el texto de la tarea en cron.job_run_details en cada
-- corrida, así que cambiar la agenda no alcanza: la clave quedaría en el
-- historial. Se borran sólo las filas de esta agenda. Las del historial con
-- `x-vigia-clave` de antes de la 114 (unas 36.600) llevan la clave vieja, ya
-- rotada, y se quedan.
--
-- La clave no se rota: quien puede leer cron.job es `postgres`, que también puede
-- leer vault.decrypted_secrets. Sólo cambiaría algo si se filtrara un respaldo.

select cron.unschedule('procesar-evaluaciones-crediscope')
 where exists (select 1 from cron.job where jobname = 'procesar-evaluaciones-crediscope');

select cron.schedule(
  'procesar-evaluaciones-crediscope',
  '* * * * *',
  $$
  select net.http_post(
    url := '<<PROYECTO_URL>>/functions/v1/procesar-evaluaciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-vigia-clave', (select decrypted_secret from vault.decrypted_secrets where name = 'vigia_clave')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
  where exists (
    select 1 from solicitudes
     where origen = 'api'
       and estado = 'en_evaluacion'
       and (reclamada_hasta is null or reclamada_hasta <= now())
       and (proximo_intento_el is null or proximo_intento_el <= now())
       and decision is distinct from 'desistido'
  );
  $$
);

delete from cron.job_run_details
 where command ilike '%/functions/v1/procesar-evaluaciones%'
   and command ilike '%x-vigia-clave%'
   and command not ilike '%vault.decrypted_secrets%';
