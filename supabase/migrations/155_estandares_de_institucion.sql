-- ============================================================
-- El estándar de la institución como dato (F14; docs/estandar-de-la-institucion.md, 1.1).
--
-- Una fila por versión en la base de cada institución (hay una base por institución): la
-- versión (`estandar-v1`...), la plantilla de origen, el contenido (el JSON que valida
-- `_shared/estandar/validar-estandar.ts`), su huella, desde cuándo vale, quién lo pidió y quién
-- lo aplicó. Una sola versión vigente; las anteriores no se modifican ni se borran: cada análisis
-- guardará la versión y la huella con que se calculó, y la huella sólo sirve si el contenido no
-- puede cambiar después.
--
-- LA VIGENTE NO ES UNA MARCA QUE SE ACTUALICE. Una marca `vigente` obligaría a modificar la fila
-- anterior al activar una nueva, y las versiones no se tocan. La vigente es la de mayor
-- `vigente_desde` que ya empezó (día de Ecuador, UTC-5 sin horario de verano), y `vigente_desde`
-- es único: dos versiones el mismo día serían dos estándares vigentes.
--
-- NO LA LEE NADA TODAVÍA. Ninguna función depende de esta tabla: no sube ESQUEMA_MINIMO. Se aplica
-- con el corredor recién fusionada en `main` (regla 1 de CLAUDE.md); el número se toma al aplicarla.
-- No lleva datos de personas (parámetros de política): no entra en `suprimir_titular()`.
-- No lleva marcadores ni abre su propia transacción: el corredor la envuelve.
-- ============================================================

create table estandares_de_institucion (
  id            uuid primary key default gen_random_uuid(),
  version       text not null unique check (version ~ '^estandar-v[0-9]+$'),
  plantilla     text not null check (plantilla in ('por_defecto', 'conservadora', 'expansiva')),
  -- El estándar completo, ya con la plantilla mezclada (nunca «la plantilla más los cambios»: si
  -- una plantilla cambia después, el mismo caso con el mismo estándar tiene que dar la misma salida).
  contenido     jsonb not null
                  check (jsonb_typeof(contenido) = 'object'
                         and contenido->>'forma' = 'estandar-forma-v1'
                         and contenido->>'plantilla' = plantilla),
  -- sha256 del JSON canónico (claves ordenadas): lo calcula `huellaDelEstandar()`.
  huella        text not null check (huella ~ '^[0-9a-f]{64}$'),
  vigente_desde date not null unique,
  -- En la primera versión lo cambia CrediScope a pedido escrito de la institución (O1, 2026-11-18):
  -- quién lo pidió (el contacto de la institución, por su nombre en el pedido) y quién lo aplicó.
  pedido_por    text not null check (length(btrim(pedido_por)) > 0),
  aplicado_por  uuid not null references profiles(id),
  creado_en     timestamptz not null default now()
);

comment on table estandares_de_institucion is
  'El estándar de la institución por versión (155; docs/estandar-de-la-institucion.md, 1.1). Se inserta, nunca se modifica ni se borra. La vigente es estandar_vigente(). Sin datos de personas.';

-- ---------- LAS VERSIONES NO SE TOCAN ----------
-- Igual que audit_log (113): un disparador, porque la RLS no frena a la clave de servicio.
create function estandares_de_institucion_inalterable()
 returns trigger
 language plpgsql
as $function$
begin
  raise exception 'Una versión del estándar no se modifica ni se borra: se agrega una versión nueva (155).';
end;
$function$;

create trigger estandares_sin_cambios
  before update or delete on estandares_de_institucion
  for each row execute function estandares_de_institucion_inalterable();

create trigger estandares_sin_vaciar
  before truncate on estandares_de_institucion
  for each statement execute function estandares_de_institucion_inalterable();

-- ---------- LA VIGENTE ----------
create function estandar_vigente()
 returns setof estandares_de_institucion
 language sql
 stable
 set search_path to 'public'
as $function$
  select * from estandares_de_institucion
  where vigente_desde <= (now() at time zone 'America/Guayaquil')::date
  order by vigente_desde desc
  limit 1;
$function$;

-- ---------- ACCESO ----------
-- Igual que modelos_de_ingreso (141): la pantalla lee con la sesión; escribe sólo CrediScope con la
-- clave de servicio (un guion), y sólo insertando.
alter table estandares_de_institucion enable row level security;

create policy estandares_de_institucion_lectura on estandares_de_institucion for select
  using (exists (select 1 from profiles where id = auth.uid() and rol in ('analista', 'admin')));

revoke all on estandares_de_institucion from anon, authenticated, service_role;
grant select on estandares_de_institucion to authenticated;
grant select, insert on estandares_de_institucion to service_role;

revoke execute on function estandar_vigente() from public, anon;
grant execute on function estandar_vigente() to authenticated, service_role;
