-- Agenda del vigía: que corra solo, cada quince minutos.
--
-- ATENCIÓN AL APLICAR: este archivo lleva marcadores, no valores. La
-- clave del vigía es un secreto y no se versiona. Para aplicarlo,
-- reemplazar <<PROYECTO_URL>> y <<VIGIA_CLAVE>> por los valores reales
-- (están en .env.functions, que .gitignore excluye) y correr el
-- resultado. Nunca pegar la clave acá y guardar.
--
-- POR QUÉ QUINCE MINUTOS
--
-- Es el tiempo máximo que puede estar caído el servicio sin que quede
-- registro. Más seguido no mejora mucho -- un corte de menos de quince
-- minutos rara vez amerita despertar a alguien -- y más espaciado deja
-- huecos donde una caída entera pasa sin verse. El costo no es el
-- factor: cada chequeo son centésimas de centavo.
--
-- POR QUÉ DESDE LA BASE Y NO DESDE UN SERVICIO DE AFUERA
--
-- Un vigía que vive en la misma infraestructura que vigila tiene un
-- punto ciego: si se cae todo, tampoco avisa. A cambio no suma un
-- proveedor más ni otra credencial que administrar. Es el canje
-- correcto por ahora; el día que haya un acuerdo de nivel de servicio
-- firmado, conviene un segundo vigía afuera que solo mire si el de
-- adentro sigue latiendo.

create extension if not exists pg_cron with schema pg_catalog;
-- pg_net publica sus funciones en el esquema `net`, sin importar con
-- qué esquema se instale la extensión. Llamarlas como
-- `extensions.http_post` compila, se agenda y falla en cada ejecución
-- con "function does not exist" -- el agendamiento aparece activo y no
-- hace nada. Verificar contra cron.job_run_details, no contra cron.job.
create extension if not exists pg_net;

-- Si ya estaba agendado, se reemplaza: correr esto dos veces no deja
-- dos vigías compitiendo.
select cron.unschedule('vigia-crediscope')
 where exists (select 1 from cron.job where jobname = 'vigia-crediscope');

select cron.schedule(
  'vigia-crediscope',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := '<<PROYECTO_URL>>/functions/v1/vigia',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-vigia-clave', '<<VIGIA_CLAVE>>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
