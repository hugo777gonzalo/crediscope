-- Laboratorio, fase E de las pantallas (docs/laboratorio-pantallas.md):
-- lo que necesita el Descubrimiento profundo de la base.
--
-- 1. Los motivos de CADA malo. lab_calcular_motivos (103) los calculaba por
--    dentro y guardaba sólo el agregado; la investigación de un aprobado que
--    cayó necesita los suyos. La regla pasa a lab_motivos_de_cada_malo() y
--    el agregado la usa: una sola implementación de "¿se podía ver?".
--    Los eventos válidos (sin nuestro crédito, sin las entidades que
--    empezaron a reportar) también quedan en una sola función.
-- 2. La cobertura de cada campo de la estructura (standard_profile) en los
--    perfiles del día del análisis de un corte, por versión de la
--    estructura: qué trae la estructura, qué falta y qué cambió entre
--    versiones. No se guarda: el corte no cambia y se recalcula igual.

create or replace function lab_eventos_del_corte(p_corte uuid)
returns table (solicitud_id uuid, tipo text, clase text, fecha date, detalle jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select cs.solicitud_id, e.tipo, e.clase, e.fecha, e.detalle
    from lab_corte_solicitudes cs
    join lab_reconsultas rc on rc.solicitud_id = cs.solicitud_id
    join lab_eventos e on e.reconsulta_id = rc.id
   where cs.corte_id = p_corte and cs.incluida
     and e.tipo <> 'credito_institucion'
     -- Una entidad que empezó a reportar en el año no es un crédito nuevo (14.9).
     and not coalesce((e.detalle ->> 'entidad_recien_reportada')::boolean, false);
$$;

create or replace function lab_motivos_de_cada_malo(p_corte uuid)
returns table (solicitud_id uuid, desembolsada boolean, recomendacion text, puntaje integer, principal text, motivos text[], se_podia_ver text, empezo_afuera boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select cs.*, rc.fecha as fecha_t1,
           (cs.variables ->> 'ingreso_reportado_iess')::numeric as ingreso,
           cs.variables ->> 'estado_ingreso' as estado_ingreso
      from lab_corte_solicitudes cs
      join lab_reconsultas rc on rc.solicitud_id = cs.solicitud_id
     where cs.corte_id = p_corte and cs.incluida
  ), ev as (
    select e.*, b.malo, coalesce(b.fecha_default, b.fecha_t1) as limite
      from lab_eventos_del_corte(p_corte) e join base b using (solicitud_id)
  ), causas as (
    -- Visibles en t0. La cuota y la capacidad, sólo con nuestro crédito.
    select solicitud_id, 'cuota_no_cabia' as motivo, null::date as fecha, 1 as orden from base
     where malo and desembolsada and cuota_mensual is not null and ingreso > 0 and cuota_mensual / ingreso > 0.35
    union all
    select solicitud_id, 'capacidad_no_medible', null, 2 from base
     where malo and desembolsada and (estado_ingreso is distinct from 'confirmada' or coalesce(ingreso, 0) = 0)
    union all
    select solicitud_id, case when recomendacion in ('negar', 'bloqueado') then 'el_modelo_lo_vio' else 'el_modelo_advirtio' end, null, 3 from base
     where malo and recomendacion in ('negar', 'revisar', 'bloqueado')
    union all
    -- Posteriores: antes de la caída o sin fecha. A quien no recibió nuestro
    -- crédito, el crédito de otro es donde se lo observa, no una causa.
    select ev.solicitud_id, ev.tipo, ev.fecha, 4 from ev join base b using (solicitud_id)
     where ev.malo and ev.clase in ('causa_externa', 'causa_interna') and (ev.fecha is null or ev.fecha <= ev.limite)
       and not (ev.tipo = 'credito_otra_institucion' and not b.desembolsada)
  ), principal as (
    -- La primera causa posterior con fecha; si no hay, lo visible en t0; si
    -- no, una posterior sin fecha.
    select distinct on (solicitud_id) solicitud_id, motivo
      from causas
     order by solicitud_id, (orden = 4 and fecha is not null) desc, (orden < 4) desc, fecha nulls last, orden
  ), por_malo as (
    select b.solicitud_id, b.desembolsada, b.recomendacion, b.puntaje, b.variables,
           coalesce(p.motivo, 'sin_causa_visible') as principal,
           coalesce((select array_agg(distinct c.motivo order by c.motivo) from causas c where c.solicitud_id = b.solicitud_id), '{}') as motivos,
           exists (select 1 from ev where ev.solicitud_id = b.solicitud_id and ev.tipo = 'mora_credito_previo'
                    and ev.fecha is not null and b.fecha_default is not null and ev.fecha < b.fecha_default) as empezo_afuera
      from base b left join principal p using (solicitud_id)
     where b.malo
  )
  select solicitud_id, desembolsada, recomendacion, puntaje, principal, motivos,
         case
           when recomendacion in ('negar', 'revisar', 'bloqueado') then 'el_modelo_lo_vio'
           when motivos && array['cuota_no_cabia', 'capacidad_no_medible'] then 'anticipable_no_visto'
           when principal = 'sin_causa_visible' then 'sin_causa_visible'
           when variables ->> 'estado_ingreso' is distinct from 'confirmada'
             or coalesce((variables ->> 'continuidad_laboral_meses')::numeric, 0) < 12
             or coalesce((variables ->> 'deuda_en_atraso')::numeric, 0) > 0 then 'vulnerabilidad_visible'
           else 'no_anticipable' end,
         empezo_afuera
    from por_malo;
$$;

-- El agregado de la 103, ahora sobre las dos funciones de arriba.
create or replace function lab_calcular_motivos(p_corte uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_corte lab_cortes;
  v_res   jsonb;
begin
  select * into v_corte from lab_cortes where id = p_corte;
  if not found then raise exception 'No existe el corte'; end if;
  if not exists (select 1 from lab_corte_solicitudes where corte_id = p_corte) then raise exception 'El corte no tiene solicitudes'; end if;

  with base as (
    select cs.* from lab_corte_solicitudes cs
      join lab_reconsultas rc on rc.solicitud_id = cs.solicitud_id
     where cs.corte_id = p_corte and cs.incluida
  ), clasif as (
    select * from lab_motivos_de_cada_malo(p_corte)
  ), golpes as (
    select e.tipo, b.solicitud_id, b.malo, b.puntaje, b.variables
      from (select distinct solicitud_id, tipo from lab_eventos_del_corte(p_corte) where clase in ('causa_externa', 'causa_interna')) e
      join base b using (solicitud_id)
  ), por_evento as (
    select tipo, count(*) as con_evento, count(*) filter (where malo) as malos,
           round(avg(puntaje) filter (where malo)) as puntaje_malos, round(avg(puntaje) filter (where not malo)) as puntaje_buenos,
           round(avg((variables ->> 'continuidad_laboral_meses')::numeric) filter (where malo), 1) as continuidad_malos,
           round(avg((variables ->> 'continuidad_laboral_meses')::numeric) filter (where not malo), 1) as continuidad_buenos,
           round(avg((variables ->> 'meses_con_aporte_24')::numeric) filter (where malo), 1) as aporte24_malos,
           round(avg((variables ->> 'meses_con_aporte_24')::numeric) filter (where not malo), 1) as aporte24_buenos,
           round(avg(case when (variables ->> 'deuda_en_atraso')::numeric > 0 then 1.0 else 0 end) filter (where malo), 3) as con_atraso_malos,
           round(avg(case when (variables ->> 'deuda_en_atraso')::numeric > 0 then 1.0 else 0 end) filter (where not malo), 3) as con_atraso_buenos
      from golpes group by tipo
  )
  select jsonb_build_object(
    'es_sintetico', v_corte.es_sintetico,
    'n', (select count(*) from base),
    'n_malos', (select count(*) from clasif),
    'tasa_general', (select round(count(*) filter (where malo)::numeric / nullif(count(*), 0), 4) from base),
    'por_motivo_principal', (select jsonb_agg(jsonb_build_object('motivo', principal, 'malos', n, 'con_credito', con) order by n desc)
        from (select principal, count(*) as n, count(*) filter (where desembolsada) as con from clasif group by principal) x),
    'motivos_presentes', (select jsonb_agg(jsonb_build_object('motivo', motivo, 'malos', n) order by n desc)
        from (select unnest(motivos) as motivo, count(*) as n from clasif group by 1) x),
    'se_podia_ver', (select jsonb_object_agg(se_podia_ver, n) from (select se_podia_ver, count(*) as n from clasif group by 1) x),
    'empezo_afuera', (select count(*) from clasif where empezo_afuera),
    'por_evento', (select jsonb_agg(jsonb_build_object(
        'evento', tipo, 'con_evento', con_evento, 'malos', malos, 'tasa', round(malos::numeric / con_evento, 4), 'intervalo', lab_wilson(malos, con_evento),
        'malos_vs_buenos', jsonb_build_object(
          'puntaje', jsonb_build_array(puntaje_malos, puntaje_buenos),
          'continuidad_laboral_meses', jsonb_build_array(continuidad_malos, continuidad_buenos),
          'meses_con_aporte_24', jsonb_build_array(aporte24_malos, aporte24_buenos),
          'con_deuda_en_atraso', jsonb_build_array(con_atraso_malos, con_atraso_buenos)))
        order by con_evento desc) from por_evento),
    'advertencias', to_jsonb(array_remove(array[
        'Asociación no es causa: un evento antes de la caída es un candidato, no una prueba.',
        'El buró de bancos no fecha las operaciones: un crédito de otro sin fecha puede ser anterior o posterior a la caída.',
        case when (select count(*) from clasif) < 30 then 'Menos de 30 malos: los motivos son orientativos.' end,
        case when v_corte.es_sintetico then 'Corte sintético: los eventos y el impago son inventados.' end
      ], null))
  ) into v_res;

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'motivos',
          jsonb_build_object('version', 1, 'cuota_no_cabia', 'cuota mayor al 35% del ingreso reportado al IESS en t0',
                             'principal', 'primera causa posterior con fecha; si no, lo visible en t0; si no, una posterior sin fecha',
                             'vulnerabilidad_visible', 'golpe posterior con ingreso sin confirmar, continuidad menor a 12 meses o deuda en atraso en t0', 'version_clasificacion', 2),
          v_res, (v_res ->> 'n')::integer, (v_res ->> 'n_malos')::integer, auth.uid());
  return v_res;
end;
$$;

-- Cobertura de cada campo de la estructura en los perfiles del día del
-- análisis del corte (los de las solicitudes si las hay; si no, los de las
-- operaciones), en total y por versión de la estructura. Recorre cada
-- perfil una vez (jsonb_each): cruzar los 180 campos de la configuración con
-- 2.567 perfiles abría el perfil entero 460 mil veces y se cortaba por
-- tiempo. Además dice qué campos trae el perfil que la configuración no
-- tiene (no se pueden apagar desde Campos del análisis).
create or replace function lab_cobertura_de_la_estructura(p_corte uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with perfiles as (
    select p.id, p.structure_version, p.standard_profile
      from client_profiles p
     where p.id in (select s.client_profile_id from lab_corte_solicitudes cs join lab_solicitudes s on s.id = cs.solicitud_id where cs.corte_id = p_corte
                    union
                    select co.client_profile_id from lab_corte_operaciones co
                     where co.corte_id = p_corte and not exists (select 1 from lab_corte_solicitudes x where x.corte_id = p_corte))
  ), pares as (
    select p.structure_version, g.key as grupo, c.key as campo,
           (c.value is not null and jsonb_typeof(c.value) <> 'null'
            and not (jsonb_typeof(c.value) = 'array' and jsonb_array_length(c.value) = 0)
            and not (jsonb_typeof(c.value) = 'object' and c.value = '{}'::jsonb)) as con
      from perfiles p
      cross join lateral jsonb_each(p.standard_profile) g
      cross join lateral jsonb_each(case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) c
  ), por_version as (
    select grupo, campo, structure_version, count(*) filter (where con) as con_valor from pares group by 1, 2, 3
  ), totales as (
    select structure_version, count(*) as n from perfiles group by 1
  ), configurados as (
    select f.grupo, f.campo, f.enabled,
           coalesce(sum(pv.con_valor), 0) as con_valor,
           jsonb_object_agg(pv.structure_version, round(pv.con_valor::numeric / t.n, 4)) filter (where pv.structure_version is not null) as por_version
      from standard_profile_field_config f
      left join por_version pv on pv.grupo = f.grupo and pv.campo = f.campo
      left join totales t on t.structure_version = pv.structure_version
     group by f.grupo, f.campo, f.enabled
  ), sin_configurar as (
    select pv.grupo, pv.campo, sum(pv.con_valor) as con_valor
      from por_version pv
     where not exists (select 1 from standard_profile_field_config f where f.grupo = pv.grupo and f.campo = pv.campo)
     group by pv.grupo, pv.campo
  )
  select jsonb_build_object(
    'perfiles', (select count(*) from perfiles),
    'versiones', (select jsonb_object_agg(structure_version, n) from totales),
    'campos', (select jsonb_agg(jsonb_build_object(
        'grupo', grupo, 'campo', campo, 'habilitado', enabled, 'con_valor', con_valor, 'por_version', coalesce(por_version, '{}'::jsonb))
        order by grupo, campo) from configurados),
    'sin_configurar', coalesce((select jsonb_agg(jsonb_build_object('grupo', grupo, 'campo', campo, 'con_valor', con_valor) order by grupo, campo) from sin_configurar), '[]'::jsonb)
  );
$$;
