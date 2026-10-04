-- Laboratorio, módulos 1 a 3 del negocio (docs/laboratorio-pantallas.md):
--
-- 1. Instituciones y proyectos como entidades del Laboratorio (decisión 3
--    del 2026-10-03), sólo de admin, sin esperar la fábrica de crédito. La
--    carga apunta a su institución y a su proyecto; el texto
--    lab_cargas.institucion queda (las cargas viejas lo tienen) y se sigue
--    escribiendo con el nombre. Una institución o un proyecto no se borran:
--    se inactivan o se cierran (sin política de borrado).
--    Sigue abierta la pregunta de fondo: una instalación para varias
--    instituciones o una por institución.
-- 2. El centro de datos: qué contestó cada fuente de Novadata, por semana,
--    y si la proporción que contesta cayó en la última semana. El caso real
--    del 2026-10-03 (el estado "ABI" de los establecimientos) no se vio
--    hasta comparar dos consultas.
-- 3. El volumen de análisis por mes y recomendación, contado en la base
--    (PostgREST corta en 1.000 filas).
-- 4. La calidad de una carga: duplicados, cruces con otras cargas, fechas
--    inconsistentes, marcas faltantes y el vínculo con lo analizado.

create table lab_instituciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  ruc         text check (ruc is null or ruc ~ '^[0-9]{13}$'),
  tipo        text not null default 'cooperativa' check (tipo in ('cooperativa', 'banco', 'mutualista', 'financiera', 'casa_comercial', 'otra')),
  segmento    text,
  estado      text not null default 'activa' check (estado in ('activa', 'inactiva')),
  contacto    text,
  notas       text,
  creada_por  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table lab_proyectos (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references lab_instituciones(id) on delete restrict,
  nombre          text not null,
  objetivo        text,
  estado          text not null default 'en_curso' check (estado in ('en_curso', 'pausado', 'cerrado')),
  fecha_inicio    date,
  fecha_fin       date,
  notas           text,
  creado_por      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (institucion_id, nombre),
  check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio)
);

alter table lab_cargas add column institucion_id uuid references lab_instituciones(id) on delete set null;
alter table lab_cargas add column proyecto_id uuid references lab_proyectos(id) on delete set null;

alter table lab_instituciones enable row level security;
alter table lab_proyectos enable row level security;
create policy lab_instituciones_lectura on lab_instituciones for select using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_instituciones_alta on lab_instituciones for insert with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_instituciones_cambio on lab_instituciones for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin')) with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_proyectos_lectura on lab_proyectos for select using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_proyectos_alta on lab_proyectos for insert with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_proyectos_cambio on lab_proyectos for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin')) with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- --------------------------------------------------------- centro de datos
create or replace function lab_centro_de_datos(p_dias integer default 120)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with perfiles as (
    select created_at, estado_por_fuente from client_profiles
     where created_at >= now() - make_interval(days => p_dias) and estado_por_fuente is not null
  ), pares as (
    select date_trunc('week', p.created_at at time zone 'America/Guayaquil')::date as semana, e.key as fuente, e.value #>> '{}' as estado, p.created_at
      from perfiles p cross join lateral jsonb_each(p.estado_por_fuente) e
  ), por_fuente as (
    select fuente, count(*) as consultas,
           count(*) filter (where estado = 'ok') as con_datos,
           count(*) filter (where estado = 'ok_vacio') as vacias,
           count(*) filter (where estado = 'error') as errores,
           count(*) filter (where estado not in ('ok', 'ok_vacio', 'error')) as otras,
           count(*) filter (where created_at >= now() - interval '7 days') as recientes,
           count(*) filter (where created_at >= now() - interval '7 days' and estado in ('ok', 'ok_vacio')) as recientes_contestaron,
           count(*) filter (where created_at < now() - interval '7 days' and created_at >= now() - interval '37 days') as antes,
           count(*) filter (where created_at < now() - interval '7 days' and created_at >= now() - interval '37 days' and estado in ('ok', 'ok_vacio')) as antes_contestaron,
           max(created_at) as ultima
      from pares group by fuente
  ), por_semana as (
    select fuente, semana, count(*) as n, count(*) filter (where estado in ('ok', 'ok_vacio')) as contestaron, count(*) filter (where estado = 'ok') as con_datos
      from pares group by fuente, semana
  )
  select jsonb_build_object(
    'dias', p_dias,
    'perfiles', (select count(*) from perfiles),
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

-- ------------------------------------------------------ volumen de análisis
create or replace function lab_volumen_de_analisis()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'recomendacion', recomendacion, 'n', n, 'fallidos', fallidos) order by mes, recomendacion), '[]'::jsonb)
    from (select to_char(created_at at time zone 'America/Guayaquil', 'YYYY-MM') as mes, coalesce(recomendacion, 'sin recomendación') as recomendacion,
                 count(*) as n, count(*) filter (where fallo is not null) as fallidos
            from analysis_results group by 1, 2) x;
$$;

-- ------------------------------------------------------- calidad de la carga
create or replace function lab_calidad_de_la_carga(p_carga uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ops as (
    select * from lab_operaciones where carga_id = p_carga
  ), otras as (
    select o.cedula, o.fecha_desembolso, o.monto
      from lab_operaciones o join lab_cargas c on c.id = o.carga_id
     where o.carga_id <> p_carga and c.estado <> 'anulada'
  )
  select jsonb_build_object(
    'operaciones', (select count(*) from ops),
    'personas', (select count(distinct cedula) from ops),
    'personas_con_varias', (select count(*) from (select cedula from ops group by cedula having count(*) > 1) x),
    -- La misma operación (persona, fecha y monto) ya cargada en otra carga viva.
    'repetidas_en_otras_cargas', (select count(*) from ops o where exists (select 1 from otras x where x.cedula = o.cedula and x.fecha_desembolso = o.fecha_desembolso and x.monto = o.monto)),
    'personas_en_otras_cargas', (select count(distinct o.cedula) from ops o where exists (select 1 from otras x where x.cedula = o.cedula)),
    'impago_antes_del_desembolso', (select count(*) from ops where fecha_primer_default < fecha_desembolso),
    'cayo_sin_fecha', (select count(*) from ops where fecha_primer_default is null
                         and (coalesce(dias_mora_max_12m, 0) >= 90 or coalesce(dias_mora_max_24m, 0) >= 90 or estado_operacion in ('castigada', 'judicial'))),
    'mora_24_menor_que_12', (select count(*) from ops where dias_mora_max_24m < dias_mora_max_12m),
    'sin_mora_registrada', (select count(*) from ops where dias_mora_max_12m is null and dias_mora_max_24m is null),
    'sin_cuota', (select count(*) from ops where cuota_mensual is null),
    'sin_canal', (select count(*) from ops where canal is null),
    'analisis_fallidos', (select count(*) from ops where analisis_fallido),
    'por_vinculo', (select coalesce(jsonb_object_agg(coalesce(vinculo, 'sin vincular'), n), '{}'::jsonb) from (select vinculo, count(*) as n from ops group by vinculo) x),
    'por_estado', (select coalesce(jsonb_object_agg(estado_operacion, n), '{}'::jsonb) from (select estado_operacion, count(*) as n from ops group by estado_operacion) x),
    'por_producto', (select coalesce(jsonb_object_agg(producto, n), '{}'::jsonb) from (select producto, count(*) as n from ops group by producto) x),
    'desembolsos', (select jsonb_build_object('desde', min(fecha_desembolso), 'hasta', max(fecha_desembolso)) from ops)
  );
$$;
