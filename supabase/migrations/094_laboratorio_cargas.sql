-- Laboratorio de Inteligencia de Negocio, fase 1: cargas, operaciones,
-- vínculo y conciliación (2026-10-03). Diseño: docs/laboratorio-de-riesgo.md.
--
-- Reemplaza a feedback_paquetes / feedback_creditos, que no se tocan acá
-- (se retiran al final, sección 11 del diseño). Todo es sólo de admin: el
-- resultado de pago de la cartera no lo ve un analista (en Retroalimentación
-- lo leía cualquier sesión).
--
-- 1. lab_definiciones_default: versionada e inmutable (sin update). La
--    primera es la del negocio del 2026-10-03: 90 días de mora o una
--    calificación peor que B2, en bancos, cooperativas, mutualistas y retail
--    grande, que es una deuda con una casa comercial de más de USD 2.000.
-- 2. lab_cargas y lab_operaciones: el archivo de la IFI (o una cartera
--    sintética) con fechas y días de mora por ventana, no una marca de
--    default: sin fechas no hay ventanas ni madurez.
-- 3. lab_cerrar_carga(): vincula cada operación con el análisis y el perfil
--    ANTERIORES al desembolso y deja la conciliación. Corre en la base: el
--    vínculo de Retroalimentación se hacía en el navegador y se rompía
--    pasadas ~350 cédulas y a las 1.000 filas.
-- 4. El depósito privado lab-archivos, para el archivo original.

create table lab_definiciones_default (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,
  dias_mora_minimo       integer not null check (dias_mora_minimo > 0),
  -- Cuenta como malo una calificación PEOR que esta (B2: C1, C2, D, E).
  calificacion_peor_que  text check (calificacion_peor_que in ('A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D')),
  cuenta_castigo         boolean not null default true,
  cuenta_reestructuracion boolean not null default true,
  cuenta_judicial        boolean not null default true,
  sistemas               text[] not null default '{bancos,cooperativas,mutualistas,retail_grande}',
  retail_monto_minimo    numeric(14, 2) not null default 2000,
  creada_por             uuid references auth.users(id),
  created_at             timestamptz not null default now()
);

insert into lab_definiciones_default (nombre, dias_mora_minimo, calificacion_peor_que, retail_monto_minimo)
values ('Negocio 2026-10-03: 90 días de mora o peor que B2', 90, 'B2', 2000);

create table lab_cargas (
  id              uuid primary key default gen_random_uuid(),
  etiqueta        text not null,
  -- Texto hasta que exista la entidad institución (una instalación por IFI
  -- o varias juntas: pregunta abierta del diseño).
  institucion     text,
  origen          text not null check (origen in ('ifi', 'sintetica', 'reconsulta_buro')),
  es_sintetica    boolean not null default false,
  regla_plantada  jsonb,
  archivo_nombre  text,
  archivo_ruta    text,
  fecha_corte     date not null,
  estado          text not null default 'cargando' check (estado in ('cargando', 'lista', 'con_errores', 'anulada')),
  conciliacion    jsonb,
  errores         jsonb,
  cargada_por     uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  cerrada_en      timestamptz,
  check ((origen = 'sintetica') = es_sintetica)
);

create table lab_operaciones (
  id                       uuid primary key default gen_random_uuid(),
  carga_id                 uuid not null references lab_cargas(id) on delete cascade,
  cedula                   text not null check (cedula ~ '^[0-9]{10}$'),
  numero_operacion         text not null,
  producto                 text not null,
  monto                    numeric(14, 2) not null check (monto > 0),
  plazo_meses              integer not null check (plazo_meses > 0),
  fecha_desembolso         date not null,
  estado_operacion         text not null check (estado_operacion in ('vigente', 'cancelada', 'castigada', 'reestructurada', 'vencida', 'judicial')),
  -- null = no observado: la operación no cumplió esa ventana.
  dias_mora_max_12m        integer check (dias_mora_max_12m >= 0),
  dias_mora_max_24m        integer check (dias_mora_max_24m >= 0),
  -- Para cargas que traen calificación (una reconsulta del buró).
  peor_calificacion_12m    text,
  peor_calificacion_24m    text,
  fecha_primer_default     date,
  observaciones            text,
  -- Sólo en cargas sintéticas: puntaje y recomendación inventados. Nunca va
  -- a analysis_results.
  sintetico                jsonb,
  -- Lo pone lab_cerrar_carga().
  client_id                uuid references clients(id) on delete set null,
  analysis_result_id       uuid references analysis_results(id) on delete set null,
  client_profile_id        uuid references client_profiles(id) on delete set null,
  vinculo                  text check (vinculo in ('exacto', 'perfil_inferido', 'solo_perfil', 'consulta_posterior', 'fuera_de_ventana', 'sin_consulta')),
  analisis_fallido         boolean not null default false,
  dias_consulta_desembolso integer,
  primera_de_la_persona    boolean,
  unique (carga_id, numero_operacion)
);

create index lab_operaciones_carga_idx on lab_operaciones (carga_id);
create index lab_operaciones_cedula_idx on lab_operaciones (cedula);

comment on column lab_operaciones.vinculo is
  'exacto: análisis anterior al desembolso con su perfil confiable. perfil_inferido: análisis anterior, perfil reconstruido (el más reciente anterior al análisis). solo_perfil: perfil anterior sin análisis (sirve para variables, no para desempeño). consulta_posterior: sólo consultas después del desembolso, fuga de información. fuera_de_ventana: consultas anteriores pero más viejas que la ventana. sin_consulta: nunca pasó por CrediScope.';

alter table lab_definiciones_default enable row level security;
alter table lab_cargas enable row level security;
alter table lab_operaciones enable row level security;

create policy lab_definiciones_lectura on lab_definiciones_default for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_definiciones_alta on lab_definiciones_default for insert
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
-- Sin update ni delete: una definición nueva es una fila nueva.

create policy lab_cargas_admin on lab_cargas for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_operaciones_admin on lab_operaciones for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- Vincula y concilia una carga. security invoker: la llama un admin desde
-- la pantalla (o el script con la clave de servicio) y respeta la RLS.
create or replace function lab_cerrar_carga(p_carga uuid, p_ventana_dias integer default 90)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_carga   lab_cargas;
  v_errores jsonb;
  v_conc    jsonb;
begin
  select * into v_carga from lab_cargas where id = p_carga for update;
  if not found then raise exception 'No existe la carga %', p_carga; end if;
  if v_carga.estado = 'anulada' then raise exception 'La carga está anulada'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('operacion', numero_operacion, 'motivo', motivo) order by numero_operacion), '[]'::jsonb)
    into v_errores
  from (
    select numero_operacion, 'el desembolso es posterior a la fecha de corte del archivo' as motivo
      from lab_operaciones where carga_id = p_carga and fecha_desembolso > v_carga.fecha_corte
    union all
    select numero_operacion, 'tiene días de mora a 12 meses pero no cumplió 12 meses al corte'
      from lab_operaciones where carga_id = p_carga and dias_mora_max_12m is not null
       and fecha_desembolso + interval '12 months' > v_carga.fecha_corte
    union all
    select numero_operacion, 'tiene días de mora a 24 meses pero no cumplió 24 meses al corte'
      from lab_operaciones where carga_id = p_carga and dias_mora_max_24m is not null
       and fecha_desembolso + interval '24 months' > v_carga.fecha_corte
    union all
    -- Sólo una cartera sintética puede tener fecha de corte futura.
    select '(toda la carga)', 'la fecha de corte es futura y la carga no es sintética'
     where not v_carga.es_sintetica and v_carga.fecha_corte > fecha_ec(now())
  ) e;

  -- El vínculo. El límite es el fin del día del desembolso EN ECUADOR: correrlo
  -- cinco horas puede elegir un perfil que el analista no vio.
  with base as (
    select o.id, o.fecha_desembolso, c.id as client_id,
           ((o.fecha_desembolso + 1)::timestamp at time zone 'America/Guayaquil') as limite,
           ((o.fecha_desembolso - p_ventana_dias)::timestamp at time zone 'America/Guayaquil') as inicio
      from lab_operaciones o
      left join clients c on c.cedula = o.cedula
     where o.carga_id = p_carga
  ), elegido as (
    select b.*, a.id as analisis_id, a.client_profile_id as perfil_del_analisis,
           a.client_profile_vinculo, a.created_at as analisis_en,
           pv.id as perfil_ventana, pv.created_at as perfil_ventana_en,
           (select p.id from client_profiles p
             where p.client_id = b.client_id and a.id is not null and p.created_at <= a.created_at
             order by p.created_at desc limit 1) as perfil_antes_del_analisis,
           exists (select 1 from analysis_results f
                    where f.client_id = b.client_id and f.fallo is not null
                      and f.created_at < b.limite and f.created_at >= b.inicio) as hubo_fallido,
           exists (select 1 from client_profiles p
                    where p.client_id = b.client_id and p.created_at < b.inicio) as hay_anterior_viejo,
           exists (select 1 from client_profiles p
                    where p.client_id = b.client_id and p.created_at >= b.limite) as hay_posterior
      from base b
      left join lateral (
        select * from analysis_results a
         where a.client_id = b.client_id and a.fallo is null
           and a.created_at < b.limite and a.created_at >= b.inicio
         order by a.created_at desc limit 1
      ) a on true
      left join lateral (
        select p.id, p.created_at from client_profiles p
         where p.client_id = b.client_id and p.created_at < b.limite and p.created_at >= b.inicio
         order by p.created_at desc limit 1
      ) pv on true
  )
  update lab_operaciones o set
    client_id = e.client_id,
    analysis_result_id = e.analisis_id,
    client_profile_id = case
      when e.analisis_id is not null and e.client_profile_vinculo in ('exacto', 'inferido_anterior') then e.perfil_del_analisis
      when e.analisis_id is not null then e.perfil_antes_del_analisis
      else e.perfil_ventana end,
    vinculo = case
      when e.client_id is null then 'sin_consulta'
      when e.analisis_id is not null and e.client_profile_vinculo in ('exacto', 'inferido_anterior') then 'exacto'
      when e.analisis_id is not null then 'perfil_inferido'
      when e.perfil_ventana is not null then 'solo_perfil'
      when e.hay_anterior_viejo then 'fuera_de_ventana'
      when e.hay_posterior then 'consulta_posterior'
      else 'sin_consulta' end,
    analisis_fallido = (e.hubo_fallido and e.analisis_id is null),
    dias_consulta_desembolso = case
      when coalesce(e.analisis_en, e.perfil_ventana_en) is null then null
      else e.fecha_desembolso - fecha_ec(coalesce(e.analisis_en, e.perfil_ventana_en)) end
  from elegido e
  where o.id = e.id;

  -- Una persona con varias operaciones no pesa doble en las variables.
  update lab_operaciones o set primera_de_la_persona = (x.n = 1)
    from (select id, row_number() over (partition by cedula order by fecha_desembolso, numero_operacion) as n
            from lab_operaciones where carga_id = p_carga) x
   where o.id = x.id;

  select jsonb_build_object(
    'operaciones', count(*),
    'personas', count(distinct cedula),
    'exacto', count(*) filter (where vinculo = 'exacto'),
    'perfil_inferido', count(*) filter (where vinculo = 'perfil_inferido'),
    'solo_perfil', count(*) filter (where vinculo = 'solo_perfil'),
    'consulta_posterior', count(*) filter (where vinculo = 'consulta_posterior'),
    'fuera_de_ventana', count(*) filter (where vinculo = 'fuera_de_ventana'),
    'sin_consulta', count(*) filter (where vinculo = 'sin_consulta'),
    'analisis_fallido', count(*) filter (where analisis_fallido),
    'bloqueados', count(*) filter (where exists (
        select 1 from analysis_results a where a.id = o.analysis_result_id and a.veredicto_origen = 'control_bloqueo')),
    'inmaduras_12m', count(*) filter (where fecha_desembolso + interval '12 months' > v_carga.fecha_corte),
    'inmaduras_24m', count(*) filter (where fecha_desembolso + interval '24 months' > v_carga.fecha_corte),
    'ventana_dias', p_ventana_dias
  ) into v_conc
  from lab_operaciones o where carga_id = p_carga;

  update lab_cargas set
    conciliacion = v_conc,
    errores = v_errores,
    estado = case when jsonb_array_length(v_errores) > 0 then 'con_errores' else 'lista' end,
    cerrada_en = now()
  where id = p_carga;

  return v_conc || jsonb_build_object('errores', jsonb_array_length(v_errores));
end;
$$;

-- El archivo original de la IFI: sólo admin lo sube y lo baja.
insert into storage.buckets (id, name, public, file_size_limit)
values ('lab-archivos', 'lab-archivos', false, 20971520)
on conflict (id) do nothing;

create policy lab_archivos_lectura on storage.objects for select
  using (bucket_id = 'lab-archivos' and exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_archivos_alta on storage.objects for insert
  with check (bucket_id = 'lab-archivos' and exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
