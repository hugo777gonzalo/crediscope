-- Laboratorio, fase 5: propuestas de ajuste, y el criterio vigente del motor
-- pasa a leerlas (2026-10-03). Diseño: docs/laboratorio-de-riesgo.md, 6.7 y 11.
--
-- El criterio que usa el motor en producción (marco + ajustes vigentes) se
-- armaba desde feedback_propuestas: ajustes_vigentes_actuales(), el
-- disparador que versiona criterio_versiones y revertir_criterio(). Las tres
-- pasan a lab_propuestas ANTES de retirar la tabla vieja. Las dos estaban
-- vacías y no había ningún ajuste vigente: la huella del criterio no cambia
-- (se verifica después de aplicar).
--
-- Dos arreglos de seguridad de paso, encontrados al portarlas:
--   - revertir_criterio() y desactivar_todos_los_ajustes() son security
--     definer y no miraban el rol: cualquier sesión, también un analista,
--     podía cambiar el criterio del motor. Ahora exigen admin (o la clave de
--     servicio).
--   - el autor lo mandaba el navegador (p_actor) y se podía falsear: ahora
--     es auth.uid(); p_actor queda por compatibilidad y sólo cuenta sin
--     sesión (la clave de servicio).

create table lab_propuestas (
  id                    uuid primary key default gen_random_uuid(),
  titulo                text not null,
  hallazgo              text not null,
  tipo                  text not null check (tipo in ('ajuste_criterio', 'cambio_marco', 'regla_politica', 'dato_nuevo')),
  corte_id              uuid references lab_cortes(id) on delete set null,
  evidencia             jsonb not null default '[]'::jsonb,   -- resultados enlazados, números y tamaños de muestra
  cambio_propuesto      text,
  impacto_estimado      jsonb,
  limitaciones          text,
  validacion_posterior  text,
  estado                text not null default 'borrador'
                          check (estado in ('borrador', 'revisada', 'presentada', 'aprobada', 'aplicada', 'rechazada', 'retirada')),
  es_sintetica          boolean not null default false,
  comentario_revisor    text,
  revisada_por          uuid references auth.users(id),
  revisada_en           timestamptz,
  -- Sólo ajuste_criterio: desde cuándo entra al criterio vigente.
  vigente_desde         timestamptz,
  -- La versión del marco o del criterio que la llevó al motor.
  aplicada_en           text,
  creada_por            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  -- Una propuesta sobre datos sintéticos no se presenta ni se aplica.
  check (not es_sintetica or estado in ('borrador', 'revisada', 'rechazada', 'retirada')),
  check (vigente_desde is null or (tipo = 'ajuste_criterio' and estado = 'aplicada' and cambio_propuesto is not null))
);

alter table lab_propuestas enable row level security;
create policy lab_propuestas_admin on lab_propuestas for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- Mismas claves que antes (propuestaId, titulo, texto): loadCriterioVigente()
-- lee "texto", y las versiones guardadas siguen siendo legibles.
create or replace function ajustes_vigentes_actuales()
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('propuestaId', id, 'titulo', titulo, 'texto', cambio_propuesto) order by vigente_desde),
    '[]'::jsonb
  )
  from lab_propuestas
  where tipo = 'ajuste_criterio' and vigente_desde is not null and cambio_propuesto is not null;
$$;

drop trigger if exists feedback_propuestas_version on feedback_propuestas;
create trigger lab_propuestas_version
  after insert or delete or update of vigente_desde, cambio_propuesto, estado on lab_propuestas
  for each row execute function trigger_version_criterio();

create or replace function revertir_criterio(p_version_id uuid, p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_objetivo record;
  v_ids      uuid[];
  v_nueva    uuid;
  v_motivo   text;
  v_actor    uuid := coalesce(auth.uid(), p_actor);
begin
  if auth.role() <> 'service_role' and not exists (select 1 from profiles where id = auth.uid() and rol = 'admin') then
    raise exception 'Sólo un admin puede cambiar el criterio del motor';
  end if;
  select * into v_objetivo from criterio_versiones where id = p_version_id;
  if not found then
    raise exception 'No existe esa versión del criterio';
  end if;

  select coalesce(array_agg((a->>'propuestaId')::uuid), '{}') into v_ids
  from jsonb_array_elements(v_objetivo.ajustes) a;

  update lab_propuestas set vigente_desde = null, estado = 'aprobada'
   where vigente_desde is not null and not (id = any(v_ids));
  update lab_propuestas set vigente_desde = coalesce(vigente_desde, now()), estado = 'aplicada'
   where id = any(v_ids) and tipo = 'ajuste_criterio' and estado in ('aprobada', 'aplicada') and cambio_propuesto is not null;

  v_motivo := 'Reversión a la versión ' || v_objetivo.numero;
  v_nueva := registrar_version_criterio(v_motivo, v_actor);

  if v_nueva is null then
    update criterio_versiones
       set motivo = v_motivo, creada_por = coalesce(v_actor, creada_por)
     where numero = (select max(numero) from criterio_versiones)
    returning id into v_nueva;
  end if;

  return v_nueva;
end;
$$;

create or replace function desactivar_todos_los_ajustes(p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nueva  uuid;
  v_motivo text := 'Se desactivaron todos los ajustes (vuelta al criterio base)';
  v_actor  uuid := coalesce(auth.uid(), p_actor);
begin
  if auth.role() <> 'service_role' and not exists (select 1 from profiles where id = auth.uid() and rol = 'admin') then
    raise exception 'Sólo un admin puede cambiar el criterio del motor';
  end if;
  update lab_propuestas set vigente_desde = null, estado = 'aprobada' where vigente_desde is not null;
  v_nueva := registrar_version_criterio(v_motivo, v_actor);
  if v_nueva is null then
    update criterio_versiones
       set motivo = v_motivo, creada_por = coalesce(v_actor, creada_por)
     where numero = (select max(numero) from criterio_versiones)
    returning id into v_nueva;
  end if;
  return v_nueva;
end;
$$;

-- Poner o quitar un ajuste del criterio vigente, en un solo paso y sólo
-- admin. La versión del criterio la registra el disparador.
create or replace function lab_poner_en_vigencia(p_propuesta uuid, p_vigente boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v lab_propuestas;
begin
  select * into v from lab_propuestas where id = p_propuesta;
  if not found then raise exception 'No existe la propuesta (o no tenés permiso)'; end if;
  if v.tipo <> 'ajuste_criterio' then raise exception 'Sólo un ajuste de criterio entra al criterio vigente; los demás tipos se aplican con una versión nueva del marco, de la estructura o de la política'; end if;
  if v.es_sintetica then raise exception 'Una propuesta sobre datos sintéticos no se aplica'; end if;
  if p_vigente then
    if v.estado not in ('aprobada', 'aplicada') then raise exception 'Primero tiene que estar aprobada'; end if;
    update lab_propuestas set vigente_desde = coalesce(vigente_desde, now()), estado = 'aplicada' where id = p_propuesta;
  else
    update lab_propuestas set vigente_desde = null, estado = 'aprobada' where id = p_propuesta;
  end if;
end;
$$;
