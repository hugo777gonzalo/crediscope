-- Desde el 2026-10-30 Supabase deja de dar acceso a la Data API a las tablas
-- nuevas de `public` (aviso del 2026-10-20): hasta entonces `authenticated` y
-- `service_role` lo heredaban de los privilegios por defecto de la plataforma,
-- y nuestras migraciones nunca los pidieron. Sin esto, la primera tabla creada
-- después de esa fecha contesta «permission denied» a la pantalla y a las
-- funciones, aunque su RLS esté bien.
--
-- Se fija acá, una vez, lo que antes daba la plataforma, en vez de repetir un
-- grant en cada migración. No toca las tablas existentes (conservan los suyos,
-- y algunas, como las de la 141, están restringidas a propósito): sólo lo que se
-- cree de acá en adelante. `anon` sigue sin nada (113). Una tabla que deba ser
-- más estricta revoca lo que sobra justo después de crearse, como hace la 141.
--
-- Limitación: una base armada desde cero con las migraciones 001 a 144 queda
-- sin grants en las tablas anteriores a esta; al armarla, hay que dárselos
-- (ver docs/pendientes.md).

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, service_role;
