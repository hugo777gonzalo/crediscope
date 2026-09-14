-- Versionado del criterio efectivo, trazabilidad y reversión.
--
-- El problema que resuelve: hasta ahora un análisis guardaba
-- rules_version (el marco del código, ej. marco-v14) pero NO qué
-- ajustes aprobados estaban vigentes cuando se hizo. Si un análisis
-- salía raro, no había forma de reconstruir con qué criterio exacto se
-- produjo. Y quitar un ajuste de vigencia borraba el rastro: el campo
-- vigente_desde se ponía en null y se perdía el período.
--
-- Solución: cada vez que cambia el CONJUNTO de ajustes vigentes se
-- congela una versión numerada del criterio, con el texto completo de
-- los ajustes (snapshot inmutable, no referencias: si después se edita
-- o borra una propuesta, la versión histórica sigue diciendo qué se
-- aplicó realmente). Cada análisis queda atado a esa versión.
--
-- Revertir es entonces volver a una versión anterior, no deshacer a
-- mano: se reponen los ajustes de esa versión y se crea una versión
-- nueva -- la historia nunca se reescribe.

create sequence criterio_version_numero_seq;

create table criterio_versiones (
  id          uuid primary key default gen_random_uuid(),
  numero      integer not null default nextval('criterio_version_numero_seq'),
  -- Snapshot del texto de cada ajuste vigente. Deliberadamente NO son
  -- claves foráneas: el valor de una versión histórica es decir qué
  -- criterio rigió, aunque la propuesta original se haya modificado o
  -- eliminado después.
  ajustes     jsonb not null default '[]'::jsonb,
  -- md5 del contenido efectivo: permite no crear versiones nuevas
  -- cuando un cambio administrativo (aprobar algo que no se pone en
  -- vigencia) no altera el criterio real.
  huella      text not null,
  motivo      text,
  creada_por  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index criterio_versiones_numero_idx on criterio_versiones (numero desc);

-- Con qué criterio se produjo cada análisis. Junto con rules_version
-- (marco base del código) da la foto completa y reproducible.
alter table analysis_results add column criterio_version_id uuid references criterio_versiones(id);
comment on column analysis_results.criterio_version_id is 'Versión del criterio efectivo (marco base + ajustes vigentes) con la que se produjo este análisis. Null en análisis anteriores a esta migración.';

-- Arma el snapshot de lo que está vigente ahora mismo.
create function ajustes_vigentes_actuales()
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('propuestaId', id, 'titulo', titulo, 'texto', cambio_sugerido) order by vigente_desde),
    '[]'::jsonb
  )
  from feedback_propuestas
  where estado = 'aprobada' and tipo = 'criterio_modelo' and vigente_desde is not null and cambio_sugerido is not null;
$$;

-- Congela una versión nueva solo si el criterio EFECTIVO cambió.
create function registrar_version_criterio(p_motivo text default null, p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ajustes jsonb;
  v_huella text;
  v_ultima text;
  v_id uuid;
begin
  v_ajustes := ajustes_vigentes_actuales();
  v_huella := md5(v_ajustes::text);
  select huella into v_ultima from criterio_versiones order by numero desc limit 1;
  if v_ultima is not distinct from v_huella then
    return null; -- nada cambió en el criterio efectivo
  end if;
  insert into criterio_versiones (ajustes, huella, motivo, creada_por)
  values (v_ajustes, v_huella, p_motivo, p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

-- Cualquier cambio de vigencia genera versión, venga de la app o de SQL
-- directo. Así el historial no depende de que se use una ruta concreta.
create function trigger_version_criterio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform registrar_version_criterio(
    case
      when tg_op = 'DELETE' then 'Se eliminó una propuesta vigente'
      when new.vigente_desde is not null then 'Se puso en vigencia: ' || new.titulo
      else 'Se quitó de vigencia: ' || new.titulo
    end,
    auth.uid()
  );
  return null;
end;
$$;

create trigger feedback_propuestas_version
  after insert or delete or update of vigente_desde, cambio_sugerido, estado on feedback_propuestas
  for each row execute function trigger_version_criterio();

-- Revertir a una versión anterior: repone exactamente los ajustes que
-- regían entonces y deja constancia. No se borra nada -- queda una
-- versión nueva con ese contenido, así el historial se lee hacia
-- adelante y nunca se reescribe.
create function revertir_criterio(p_version_id uuid, p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_objetivo record;
  v_ids uuid[];
begin
  select * into v_objetivo from criterio_versiones where id = p_version_id;
  if not found then
    raise exception 'No existe esa versión del criterio';
  end if;

  select coalesce(array_agg((a->>'propuestaId')::uuid), '{}') into v_ids
  from jsonb_array_elements(v_objetivo.ajustes) a;

  -- El trigger se dispara con estos updates, pero como compara la
  -- huella del resultado final, termina registrando una sola versión.
  update feedback_propuestas set vigente_desde = null
   where vigente_desde is not null and not (id = any(v_ids));
  update feedback_propuestas set vigente_desde = coalesce(vigente_desde, now())
   where id = any(v_ids) and estado = 'aprobada';

  return registrar_version_criterio(
    'Reversión a la versión ' || v_objetivo.numero,
    p_actor
  );
end;
$$;

-- Desactiva TODOS los ajustes y vuelve al marco base puro. Es la
-- reversión más segura ante un problema que todavía no se sabe de
-- dónde viene: deja el sistema en el criterio original versionado en
-- código, sin tener que identificar cuál de los ajustes falló.
create function desactivar_todos_los_ajustes(p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  update feedback_propuestas set vigente_desde = null where vigente_desde is not null;
  return registrar_version_criterio('Se desactivaron todos los ajustes (vuelta al criterio base)', p_actor);
end;
$$;

alter table criterio_versiones enable row level security;

create policy criterio_versiones_read on criterio_versiones for select
  using (auth.role() = 'authenticated');

-- Versión inicial: el criterio base, sin ajustes. Deja el historial
-- arrancando desde un punto conocido en vez de vacío.
insert into criterio_versiones (ajustes, huella, motivo)
values ('[]'::jsonb, md5('[]'), 'Criterio base, sin ajustes');
