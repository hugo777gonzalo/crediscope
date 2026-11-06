-- 149 · Limpieza diaria del registro de ejecuciones de pg_cron
--
-- POR QUÉ: el 2026-11-06, buscando qué llenaba la base del plan Free (534 MB de 500), la mayor
-- relación que crece sola era cron.job_run_details: 82 MB con 89.361 filas desde el 2026-09-15. Dos
-- tareas corren cada minuto (procesar-lote-crediscope y procesar-evaluaciones-crediscope) y suman unas
-- 2.900 filas por día, un 1,6 MB diario, sin que nadie las lea: pg_cron no las limpia solo. Cada fila
-- guarda un mensaje de 6 bytes; el peso es el volumen, no el contenido.
--
-- QUÉ HACE: borra lo de más de 7 días (alcanza para ver por qué falló una tarea de esta semana: la
-- verificación de una agenda se hace en cron.job_run_details, no en cron.job) y deja una tarea diaria
-- (05:30 UTC, 00:30 de Ecuador, después de las dos de resumenes-crediscope) que repite el borrado.
-- No toca datos de personas.
--
-- Borrar filas no devuelve espacio al sistema operativo: la tabla sigue pesando lo mismo hasta un
-- `vacuum full cron.job_run_details`, que no corre dentro de una transacción y se hace aparte, una vez,
-- después de aplicar esta migración.

delete from cron.job_run_details where end_time < now() - interval '7 days';

select cron.schedule(
  'limpiar-registro-de-cron',
  '30 5 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
