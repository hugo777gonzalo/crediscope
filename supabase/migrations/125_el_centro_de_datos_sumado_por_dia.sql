-- 125 · El centro de datos sumado por día
--
-- Segunda parte de la decisión del negocio del 2026-10-12 («según la
-- pantalla»; la primera es la 124). lab_centro_de_datos() abría el estado de
-- cada fuente (52) de cada perfil de la ventana en cada vista: 1,3 s con
-- 8.590 perfiles después de la 121, y crecía con cada consulta.
--
-- consultas_por_dia_y_fuente guarda, por día de Ecuador y por fuente, cuántas
-- consultas hubo y cómo contestó la fuente; consultas_por_dia, cuántos perfiles.
-- - Los días cerrados los resume refrescar_consultas_por_dia() cada noche
--   (pg_cron, 00:20 de Ecuador), rehaciendo los últimos 40 días: cubre la
--   semana y el mes que compara la pantalla.
-- - Lo que todavía no se resumió (normalmente, sólo hoy) se cuenta al
--   momento. Si una noche la tarea no corre, la pantalla cuenta esos días en
--   vivo: tarda más, pero no miente.
-- - Se descartó resumir en la primera consulta del día: esa persona esperaría
--   el cálculo entero, y lo de hoy no aparecería hasta mañana.
--
-- Cambia una definición: la "última semana" y el "mes anterior" eran 7 y
-- 30 días corridos hasta este instante; ahora son días de Ecuador (hoy y los
-- 6 anteriores; del 7.º al 36.º hacia atrás). Se comprobó antes de aplicar,
-- contra la función vieja con esas mismas ventanas: la misma salida.
--
-- Si se marca o desmarca una persona sintética, o se corrige algo de hace
-- más de 40 días: select refrescar_consultas_por_dia(null), que rehace todo.

create table consultas_por_dia (
  dia      date primary key,
  perfiles integer not null
);

create table consultas_por_dia_y_fuente (
  dia       date not null,
  fuente    text not null,
  consultas integer not null,
  con_datos integer not null,
  vacias    integer not null,
  errores   integer not null,
  otras     integer not null,
  ultima    timestamptz not null,
  primary key (dia, fuente)
);

comment on table consultas_por_dia_y_fuente is
  'Por día de Ecuador y por fuente: consultas y cómo contestó la fuente, sin las personas sintéticas. La escribe sólo refrescar_consultas_por_dia() (125).';

alter table consultas_por_dia enable row level security;
alter table consultas_por_dia_y_fuente enable row level security;
create policy consultas_por_dia_read on consultas_por_dia
  for select using (auth.role() = 'authenticated');
create policy consultas_por_dia_y_fuente_read on consultas_por_dia_y_fuente
  for select using (auth.role() = 'authenticated');
revoke all on consultas_por_dia, consultas_por_dia_y_fuente from public, anon, authenticated;
grant select on consultas_por_dia, consultas_por_dia_y_fuente to authenticated;
grant all on consultas_por_dia, consultas_por_dia_y_fuente to service_role;

-- Para encontrar lo de hoy sin recorrer todos los perfiles.
create index if not exists client_profiles_creado on client_profiles (created_at);


-- Rehace los días cerrados desde p_desde (null: desde el primer perfil). Deja
-- una fila por día aunque no haya consultas: el último día resumido es desde
-- donde la pantalla cuenta por su cuenta.
create or replace function refrescar_consultas_por_dia(p_desde date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hasta date := (now() at time zone 'America/Guayaquil')::date - 1;
  v_desde date := p_desde;
  v_pares integer;
begin
  if v_desde is null then
    select coalesce(min((created_at at time zone 'America/Guayaquil')::date), v_hasta)
      into v_desde from client_profiles;
  end if;

  delete from consultas_por_dia_y_fuente where dia >= v_desde;
  delete from consultas_por_dia where dia >= v_desde;

  insert into consultas_por_dia (dia, perfiles)
  select d::date, coalesce(n.perfiles, 0)
    from generate_series(v_desde, v_hasta, interval '1 day') d
    left join (
      select (p.created_at at time zone 'America/Guayaquil')::date as dia, count(*) as perfiles
        from client_profiles p
       where p.created_at >= v_desde::timestamp at time zone 'America/Guayaquil'
         and p.created_at < (v_hasta + 1)::timestamp at time zone 'America/Guayaquil'
         and p.estado_por_fuente is not null
         and not exists (select 1 from clients c where c.id = p.client_id and c.es_sintetico)
       group by 1
    ) n on n.dia = d::date;

  insert into consultas_por_dia_y_fuente (dia, fuente, consultas, con_datos, vacias, errores, otras, ultima)
  select (p.created_at at time zone 'America/Guayaquil')::date, e.key, count(*),
         count(*) filter (where e.value #>> '{}' = 'ok'),
         count(*) filter (where e.value #>> '{}' = 'ok_vacio'),
         count(*) filter (where e.value #>> '{}' = 'error'),
         count(*) filter (where e.value #>> '{}' not in ('ok', 'ok_vacio', 'error')),
         max(p.created_at)
    from client_profiles p
    cross join lateral jsonb_each(p.estado_por_fuente) e
   where p.created_at >= v_desde::timestamp at time zone 'America/Guayaquil'
     and p.created_at < (v_hasta + 1)::timestamp at time zone 'America/Guayaquil'
     and p.estado_por_fuente is not null
     and not exists (select 1 from clients c where c.id = p.client_id and c.es_sintetico)
   group by 1, 2;
  get diagnostics v_pares = row_count;

  return jsonb_build_object('desde', v_desde, 'hasta', v_hasta, 'filas', v_pares);
end;
$$;

revoke execute on function refrescar_consultas_por_dia(date) from public, anon, authenticated;
grant execute on function refrescar_consultas_por_dia(date) to service_role;

-- Llenarla con toda la historia y comprobarla.
do $$
begin
  perform refrescar_consultas_por_dia(null);
  if (select coalesce(sum(perfiles), 0) from consultas_por_dia) <> (
    select count(*) from client_profiles p
     where p.created_at < ((now() at time zone 'America/Guayaquil')::date)::timestamp at time zone 'America/Guayaquil'
       and p.estado_por_fuente is not null
       and not exists (select 1 from clients c where c.id = p.client_id and c.es_sintetico)
  ) then
    raise exception 'El resumen por día no cuenta los mismos perfiles que la tabla';
  end if;
end;
$$;

-- Cada noche, a las 00:20 de Ecuador (05:20 UTC), los últimos 40 días.
select cron.schedule('resumenes-crediscope-dias', '20 5 * * *',
  $$select refrescar_consultas_por_dia(((now() at time zone 'America/Guayaquil')::date - 40))$$);


create or replace function lab_centro_de_datos(p_dias integer default 120)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with ventana as (
    select (now() at time zone 'America/Guayaquil')::date as hoy,
           (now() at time zone 'America/Guayaquil')::date - p_dias + 1 as desde,
           coalesce((select max(dia) from consultas_por_dia), date '1900-01-01') as resumido
  ),
  -- Lo que la tarea de la noche todavía no resumió (normalmente, sólo hoy).
  vivos as (
    select (p.created_at at time zone 'America/Guayaquil')::date as dia, p.estado_por_fuente, p.created_at
      from client_profiles p, ventana v
     where p.created_at >= (greatest(v.resumido + 1, v.desde))::timestamp at time zone 'America/Guayaquil'
       and p.estado_por_fuente is not null
       and not exists (select 1 from clients c where c.id = p.client_id and c.es_sintetico)
  ),
  pares as (
    select d.dia, d.fuente, d.consultas, d.con_datos, d.vacias, d.errores, d.otras, d.ultima
      from consultas_por_dia_y_fuente d, ventana v
     where d.dia >= v.desde and d.dia <= v.resumido
    union all
    select p.dia, e.key, count(*),
           count(*) filter (where e.value #>> '{}' = 'ok'),
           count(*) filter (where e.value #>> '{}' = 'ok_vacio'),
           count(*) filter (where e.value #>> '{}' = 'error'),
           count(*) filter (where e.value #>> '{}' not in ('ok', 'ok_vacio', 'error')),
           max(p.created_at)
      from vivos p cross join lateral jsonb_each(p.estado_por_fuente) e
     group by 1, 2
  ),
  por_fuente as (
    select fuente, sum(consultas) as consultas, sum(con_datos) as con_datos, sum(vacias) as vacias,
           sum(errores) as errores, sum(otras) as otras,
           coalesce(sum(consultas) filter (where dia >= v.hoy - 6), 0) as recientes,
           coalesce(sum(con_datos + vacias) filter (where dia >= v.hoy - 6), 0) as recientes_contestaron,
           coalesce(sum(consultas) filter (where dia < v.hoy - 6 and dia >= v.hoy - 36), 0) as antes,
           coalesce(sum(con_datos + vacias) filter (where dia < v.hoy - 6 and dia >= v.hoy - 36), 0) as antes_contestaron,
           max(ultima) as ultima
      from pares, ventana v
     group by fuente
  ), por_semana as materialized (
    select fuente, date_trunc('week', dia::timestamp)::date as semana, sum(consultas) as n,
           sum(con_datos + vacias) as contestaron, sum(con_datos) as con_datos
      from pares group by 1, 2
  )
  select jsonb_build_object(
    'dias', p_dias,
    'perfiles', (select coalesce(sum(c.perfiles), 0) from consultas_por_dia c, ventana v where c.dia >= v.desde and c.dia <= v.resumido)
                + (select count(*) from vivos),
    'corte_iess', corte_iess_vigente(),
    'fuentes', coalesce((select jsonb_agg(jsonb_build_object(
        'fuente', f.fuente, 'consultas', f.consultas, 'con_datos', f.con_datos, 'vacias', f.vacias, 'errores', f.errores, 'otras', f.otras, 'ultima', f.ultima,
        'contesto_ultima_semana', case when f.recientes > 0 then round(f.recientes_contestaron::numeric / f.recientes, 4) end,
        'contesto_mes_anterior', case when f.antes > 0 then round(f.antes_contestaron::numeric / f.antes, 4) end,
        'consultas_ultima_semana', f.recientes,
        'semanas', (select jsonb_agg(jsonb_build_object('semana', s.semana, 'n', s.n, 'contestaron', s.contestaron, 'con_datos', s.con_datos) order by s.semana) from por_semana s where s.fuente = f.fuente))
        order by f.fuente) from por_fuente f), '[]'::jsonb)
  );
$$;
