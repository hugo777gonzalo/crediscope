-- La clave del vigía y del trabajador de lotes pasa a Vault, rotada; y
-- dos cosas que la 113 dejó abiertas sin querer. Sale de la auditoría de
-- seguridad del 2026-10-09.
--
-- LLEVA MARCADORES (<<PROYECTO_URL>>, <<VIGIA_CLAVE>>): se rellenan
-- fuera del repositorio, en un archivo temporal que se borra después
-- (regla 3 de CLAUDE.md). La clave nueva va también a la secret
-- VIGIA_CLAVE de las funciones, en el mismo momento: entre los dos pasos
-- la agenda manda la clave nueva y las funciones esperan la vieja, y la
-- corrida de ese minuto recibe 401 (no se pierde nada: la siguiente
-- corrida retoma).
--
-- 1. Hasta ahora la clave estaba escrita en texto plano dentro de
--    cron.job (Vault tenía 0 secretos): quien leyera la agenda, o un
--    respaldo de la base, se la llevaba. Ahora la agenda la lee de
--    vault.decrypted_secrets en cada corrida, y rotarla es cambiarla en
--    Vault y en la secret, sin tocar la agenda.
--
-- 2. La 113 revocó a PUBLIC la ejecución de funciones con un privilegio
--    por defecto DEL ESQUEMA, y eso no alcanza: Postgres suma los
--    privilegios por defecto de un esquema a los globales, no los resta,
--    y el EXECUTE para PUBLIC viene del global. La prueba: la función que
--    la misma 113 creó (audit_log_inalterable) quedó ejecutable por el
--    rol anónimo. Se revoca de forma global.
--
-- 3. clients_insert dejaba a cualquier usuario con sesión dar de alta
--    cédulas en clients. La pantalla sólo lee esa tabla; las altas las
--    hacen las funciones con la clave de servicio, que no pasa por la RLS.

-- ---------------------------------------------------------------
-- 1. La clave en Vault y la agenda leyéndola de ahí
-- ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from vault.secrets where name = 'vigia_clave') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'vigia_clave'),
      '<<VIGIA_CLAVE>>'
    );
  else
    perform vault.create_secret('<<VIGIA_CLAVE>>', 'vigia_clave',
      'Clave del vigía y del trabajador de lotes: la manda la agenda (pg_cron) en x-vigia-clave (114).');
  end if;
end;
$$;

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
      'x-vigia-clave', (select decrypted_secret from vault.decrypted_secrets where name = 'vigia_clave')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

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
      'x-vigia-clave', (select decrypted_secret from vault.decrypted_secrets where name = 'vigia_clave')
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

-- ---------------------------------------------------------------
-- 2. Sin EXECUTE para PUBLIC, también en lo que se cree de acá en adelante
-- ---------------------------------------------------------------
alter default privileges for role postgres revoke execute on functions from public;
revoke execute on function audit_log_inalterable() from anon, public;

-- ---------------------------------------------------------------
-- 3. Las altas en clients, sólo por las funciones
-- ---------------------------------------------------------------
drop policy clients_insert on clients;
