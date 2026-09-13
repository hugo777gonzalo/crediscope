-- Control de acceso por rol (analista/admin) -- primera vez que el
-- proyecto distingue roles; hasta ahora cualquier autenticado tenía el
-- mismo acceso (ver comentario viejo en AdminConfig.jsx). A pedido del
-- usuario: analista ve Evaluación Crediticia (Buscar Cliente, Perfil
-- del Cliente, Análisis con IA) + Historial + Reportes; admin ve
-- además Explorador de Fuentes y Configuración.
--
-- Sin autogestión de perfil a propósito (decisión del usuario): el
-- admin (Hugo) asigna manualmente nombre_corto/entidad/rol al dar de
-- alta cada analista -- por eso no hay policy de insert/update desde
-- la app, mismo criterio que novadata_resource_config/
-- standard_profile_field_config (solo se escribe con la service_role
-- key). entidad es la entidad financiera del usuario (ej. "Banco X"),
-- se muestra en el header arriba del nombre corto -- nullable porque
-- no todos los usuarios pertenecen a una entidad externa (ej. el
-- equipo interno de CrediScope).

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre_corto  text not null,
  entidad       text,
  rol           text not null default 'analista' check (rol in ('analista', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table profiles enable row level security;

-- Cada usuario solo puede leer SU PROPIO perfil -- alcanza para que el
-- frontend sepa su rol/nombre/entidad; no hay pantalla de gestión de
-- usuarios todavía, así que nadie necesita leer perfiles ajenos.
create policy profiles_read_own on profiles for select
  using (auth.uid() = id);

insert into profiles (id, nombre_corto, entidad, rol) values
  ('16d2d6b6-817e-4982-9831-c9796d40a0de', 'Hugo Pichucho', null, 'admin'),
  ('f8076471-93c7-4f98-950e-6336566bf29f', 'QA Interno', null, 'analista');

-- Endurece las tablas de configuración operativa (antes "cualquier
-- autenticado" podía actualizar, ver comentario original en
-- 006_runtime_config.sql: "no hay un rol admin separado todavía en
-- este proyecto" -- ya lo hay). Ocultar el link de Configuración en el
-- menú no alcanza: sin esto, un analista podría llamar a la API REST
-- de Supabase directo y togglear estas tablas igual. El subquery contra
-- profiles funciona bajo RLS porque cada usuario solo necesita leer SU
-- PROPIA fila (permitido por profiles_read_own arriba), no hace falta
-- una función security definer.
drop policy novadata_resource_config_update on novadata_resource_config;
create policy novadata_resource_config_update on novadata_resource_config for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

drop policy standard_profile_field_config_update on standard_profile_field_config;
create policy standard_profile_field_config_update on standard_profile_field_config for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

drop policy standard_profile_segment_config_update on standard_profile_segment_config;
create policy standard_profile_segment_config_update on standard_profile_segment_config for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
