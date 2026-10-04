-- Laboratorio: "el modelo lo vio" cuenta para todos los malos, no sólo para
-- los que recibieron el crédito de la institución.
--
-- En la 099 se exigía el desembolso, y el primer ciclo simulado (2026-10-03)
-- dejó 132 de 211 malos "sin causa visible": entre ellos, negados que cayeron
-- con otra institución. A ésos el modelo los vio; es justo el acierto que la
-- prueba tiene que mostrar. La cuota y la capacidad de pago siguen siendo
-- sólo de nuestro crédito. El negado por bloqueo cuenta como visto.

create or replace function lab_calcular_motivos(p_corte uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_corte   lab_cortes;
  v_mediana numeric;
  v_res     jsonb;
begin
  select * into v_corte from lab_cortes where id = p_corte;
  if not found then raise exception 'No existe el corte'; end if;
  if not exists (select 1 from lab_corte_solicitudes where corte_id = p_corte) then raise exception 'El corte no tiene solicitudes'; end if;
  select percentile_cont(0.5) within group (order by puntaje) into v_mediana
    from lab_corte_solicitudes where corte_id = p_corte and puntaje is not null and recomendacion is distinct from 'bloqueado';

  with base as (
    select cs.*, rc.id as reconsulta_id, rc.fecha as fecha_t1,
           (cs.variables ->> 'ingreso_reportado_iess')::numeric as ingreso,
           cs.variables ->> 'estado_ingreso' as estado_ingreso
      from lab_corte_solicitudes cs
      join lab_reconsultas rc on rc.solicitud_id = cs.solicitud_id
     where cs.corte_id = p_corte and cs.incluida
  ), ev as (
    select b.solicitud_id, e.tipo, e.clase, e.fecha, e.detalle, b.malo, coalesce(b.fecha_default, b.fecha_t1) as limite
      from base b join lab_eventos e on e.reconsulta_id = b.reconsulta_id
     where e.tipo <> 'credito_institucion'
       and not coalesce((e.detalle ->> 'entidad_recien_reportada')::boolean, false)
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
    select b.solicitud_id, b.desembolsada, b.puntaje,
           coalesce(p.motivo, 'sin_causa_visible') as principal,
           coalesce((select array_agg(distinct c.motivo order by c.motivo) from causas c where c.solicitud_id = b.solicitud_id), '{}') as motivos,
           exists (select 1 from ev where ev.solicitud_id = b.solicitud_id and ev.tipo = 'mora_credito_previo'
                    and ev.fecha is not null and b.fecha_default is not null and ev.fecha < b.fecha_default) as empezo_afuera
      from base b left join principal p using (solicitud_id)
     where b.malo
  ), clasif as (
    select *, case
      when motivos && array['cuota_no_cabia', 'capacidad_no_medible', 'el_modelo_lo_vio', 'el_modelo_advirtio'] then 'anticipable'
      when principal = 'sin_causa_visible' then 'sin_causa_visible'
      when puntaje is not null and puntaje < v_mediana then 'vulnerabilidad_visible'
      else 'no_anticipable' end as se_podia_ver
      from por_malo
  ), golpes as (
    select tipo, b.solicitud_id, b.malo, b.puntaje, b.variables
      from (select distinct solicitud_id, tipo from ev where clase in ('causa_externa', 'causa_interna')) e
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
    'mediana_puntaje', v_mediana,
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
                             'vulnerabilidad_visible', 'golpe posterior y puntaje bajo la mediana de las solicitudes'),
          v_res, (v_res ->> 'n')::integer, (v_res ->> 'n_malos')::integer, auth.uid());
  return v_res;
end;
$$;
