-- Constancia de lo que se corre contra la base por fuera de la pantalla
-- (auditoría externa del 2026-10-09, hallazgos E2 y E3).
--
-- Hasta acá, 19 de los 26 guiones usaban la clave de servicio --que saltea
-- toda la RLS-- contra la única base, que es producción, y sólo 4 dejaban
-- constancia en audit_log. Un recálculo con un error cambiaba perfiles
-- reales sin que quedara quién lo corrió, cuándo, con qué parámetros ni
-- cuántas filas tocó. Y las funciones se desplegaban desde una máquina sin
-- que nada dijera qué cambio de git quedó en cada una.
--
-- - ejecuciones_operativas: una fila por corrida de un guion que escribe
--   (scripts/_comun/ejecucion.mjs). Se abre al empezar y se cierra al
--   terminar; una que queda "en_curso" es una corrida que se cortó, y el
--   control de seguridad la señala.
-- - despliegues: una fila por despliegue de funciones del corredor
--   (scripts/migrar-clientes.mjs --funciones), con el cambio de git.
--
-- Las escriben los guiones con la clave de servicio y el corredor con la
-- sesión del CLI: no hay política de escritura para nadie más. Las lee el
-- admin.

create table ejecuciones_operativas (
  id             uuid primary key default gen_random_uuid(),
  guion          text not null,
  modo           text not null check (modo in ('aplicar', 'seco')),
  -- Los argumentos tal cual, salvo números de 10 dígitos, que el módulo
  -- enmascara antes de guardar: una cédula no va en un registro operativo.
  argumentos     jsonb not null default '[]'::jsonb,
  estado         text not null default 'en_curso' check (estado in ('en_curso', 'terminada', 'fallida')),
  filas          integer check (filas is null or filas >= 0),
  detalle        jsonb not null default '{}'::jsonb,
  error          text,
  commit_git     text not null,
  -- false = se corrió con cambios sin guardar en git (--sin-commit): el
  -- código que corrió no es exactamente el de commit_git.
  arbol_limpio   boolean not null,
  usuario_equipo text not null,
  iniciada_en    timestamptz not null default now(),
  terminada_en   timestamptz,
  check ((estado = 'en_curso') = (terminada_en is null))
);

alter table ejecuciones_operativas enable row level security;

create policy ejecuciones_operativas_lectura on ejecuciones_operativas for select
  using (exists (select 1 from profiles where id = (select auth.uid()) and rol = 'admin'));

create index ejecuciones_operativas_iniciada_idx on ejecuciones_operativas (iniciada_en desc);

comment on table ejecuciones_operativas is
  'Una fila por corrida de un guion que escribe en la base (scripts/_comun/ejecucion.mjs). Sin datos personales.';

create table despliegues (
  id             uuid primary key default gen_random_uuid(),
  -- La clave de la base en clientes/directorio.json.
  base           text not null,
  commit_git     text not null,
  funciones      text[] not null,
  -- La versión de esquema de la base en el momento del despliegue.
  esquema        integer not null,
  usuario_equipo text not null,
  desplegado_en  timestamptz not null default now()
);

alter table despliegues enable row level security;

create policy despliegues_lectura on despliegues for select
  using (exists (select 1 from profiles where id = (select auth.uid()) and rol = 'admin'));

create index despliegues_desplegado_idx on despliegues (desplegado_en desc);

comment on table despliegues is
  'Una fila por despliegue de las Edge Functions con el corredor: qué cambio de git quedó en cada base.';
