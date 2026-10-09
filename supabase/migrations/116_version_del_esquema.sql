-- Cada base sabe en qué versión de esquema está. Es la pieza 2 de
-- docs/plan-segundo-cliente.md: con una base por cliente, el modo de falla
-- no es la fuga sino la deriva (la base del cliente 7 se queda en la 71 y
-- nadie se entera hasta que algo rompe).
--
-- - esquema_version: una fila por migración aplicada. La escribe el
--   corredor (scripts/migrar-clientes.mjs) en la misma transacción que la
--   migración, así que no puede quedar una sin la otra.
-- - version_del_esquema(): la que leen las funciones al arrancar
--   (_shared/version-esquema.ts). Si la base está por debajo de lo que el
--   código necesita, la función contesta 503 en vez de fallar a la mitad
--   de una consulta con un error de columna.
--
-- Las 001 a 115 se aplicaron a mano en esta base (la plantilla) antes de
-- que existiera el corredor: quedan en una sola fila de línea base. Desde
-- la 116, toda migración se aplica con el corredor, nunca a mano.

create table esquema_version (
  version      integer primary key,
  archivo      text not null,
  aplicada_en  timestamptz not null default now(),
  aplicada_por text not null
);

alter table esquema_version enable row level security;

create policy esquema_version_lectura on esquema_version for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

insert into esquema_version (version, archivo, aplicada_por)
values (115, '001 a 115: aplicadas a mano antes del corredor', 'a mano');

create or replace function version_del_esquema()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select max(version) from esquema_version;
$$;

revoke execute on function version_del_esquema() from public, anon, authenticated;
grant execute on function version_del_esquema() to service_role;
