-- Laboratorio, fase E (docs/laboratorio-pantallas.md): el explorador del
-- crudo. Lo calcula scripts/explorar-crudo.mjs (recorre el crudo de cada
-- persona: desde el navegador es pesado) y lo guarda en lab_resultados con
-- tipo 'crudo', que ya admitía la 100.
--
-- 1. La regla plantada de la simulación dice el campo sólo del crudo en
--    palabras ("licenciaConducir.licencia.validezHasta anterior al día del
--    análisis"). Se le agrega la ruta como la escribe el explorador, para que
--    la calificación la busque sin adivinar. El explorador no lee la regla.
-- 2. lab_calificar_simulacion suma la tercera capa: ¿en qué puesto quedó el
--    campo plantado, y si está entre lo significativo que el modelo no tenía
--    y la estructura no lee? El resto es igual a la 099.

update lab_cargas
   set regla_plantada = jsonb_set(regla_plantada, '{capas,dato_solo_crudo}',
         (regla_plantada -> 'capas' -> 'dato_solo_crudo')
         || jsonb_build_object('ruta', 'licenciaConducir.data.licencia[].validezHasta',
                               'derivaciones', jsonb_build_array('fecha_anterior', 'alguna_fecha_anterior')))
 where es_sintetica
   and regla_plantada -> 'capas' -> 'dato_solo_crudo' is not null
   and not (regla_plantada -> 'capas' -> 'dato_solo_crudo' ? 'ruta');

create or replace function lab_calificar_simulacion(p_corte uuid)
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
  if not v_corte.es_sintetico then raise exception 'Sólo un corte sintético tiene una verdad contra la que calificarse'; end if;
  if not exists (select 1 from lab_simulacion_verdad v where v.carga_id = any(v_corte.carga_ids)) then raise exception 'La carga no tiene verdad plantada'; end if;

  with sol as (
    select cs.*, v.malo as malo_plantado, v.eventos as plantados, v.eventos_reconsulta_real as reales, v.motivos as motivos_plantados,
           v.se_puso_al_dia, rc.id as reconsulta_id
      from lab_corte_solicitudes cs
      join lab_simulacion_verdad v on v.solicitud_id = cs.solicitud_id
      join lab_reconsultas rc on rc.solicitud_id = cs.solicitud_id
     where cs.corte_id = p_corte
  ), plantado as (
    select distinct s.solicitud_id, e ->> 'tipo' as tipo from sol s, jsonb_array_elements(s.plantados) e
  ), real_semana as (
    select distinct s.solicitud_id, e ->> 'tipo' as tipo from sol s, jsonb_array_elements(coalesce(s.reales, '[]')) e
  ), detectado as (
    select distinct s.solicitud_id, e.tipo from sol s join lab_eventos e on e.reconsulta_id = s.reconsulta_id
     where e.tipo <> 'credito_institucion'
  ), tipos as (
    select tipo from plantado union select tipo from detectado
  ), eventos as (
    select t.tipo,
           (select count(*) from plantado p where p.tipo = t.tipo) as plantados,
           (select count(*) from detectado d where d.tipo = t.tipo) as detectados,
           (select count(*) from plantado p join detectado d using (solicitud_id, tipo) where p.tipo = t.tipo) as encontrados,
           (select count(*) from detectado d where d.tipo = t.tipo
             and not exists (select 1 from plantado p where p.solicitud_id = d.solicitud_id and p.tipo = d.tipo)
             and exists (select 1 from real_semana r where r.solicitud_id = d.solicitud_id and r.tipo = d.tipo)) as reales_de_la_semana,
           (select count(*) from detectado d where d.tipo = t.tipo
             and not exists (select 1 from plantado p where p.solicitud_id = d.solicitud_id and p.tipo = d.tipo)
             and not exists (select 1 from real_semana r where r.solicitud_id = d.solicitud_id and r.tipo = d.tipo)) as inventados
      from tipos t
  ), sin_credito as (
    select * from sol where not desembolsada
  ), auc as (
    -- AUC del puntaje contra el impago PLANTADO: sólo con los desembolsados
    -- (lo que vería una prueba retrospectiva real) y con todos (lo que no se
    -- puede ver nunca fuera de una simulación). La diferencia es el sesgo de
    -- mirar sólo a quien recibió el crédito.
    select grupo,
           count(*) filter (where not malo_plantado) as nb, count(*) filter (where malo_plantado) as nm,
           sum(rango) filter (where not malo_plantado) as suma_buenos
      from (select 'desembolsados' as grupo, malo_plantado, rank() over (order by puntaje) + (count(*) over (partition by puntaje) - 1) / 2.0 as rango
              from sol where desembolsada and puntaje is not null and recomendacion is distinct from 'bloqueado'
            union all
            select 'todos', malo_plantado, rank() over (order by puntaje) + (count(*) over (partition by puntaje) - 1) / 2.0
              from sol where puntaje is not null and recomendacion is distinct from 'bloqueado') r
     group by grupo
  ), motivos as (
    -- ¿El motivo principal plantado aparece entre los eventos detectados? Sólo
    -- los que son eventos (los de t0 no se detectan: se ven en las variables).
    select s.solicitud_id, s.motivos_plantados -> 0 ->> 'motivo' as principal,
           exists (select 1 from detectado d where d.solicitud_id = s.solicitud_id and d.tipo = s.motivos_plantados -> 0 ->> 'motivo') as detectado
      from sol s
     where s.malo_plantado and s.incluida and s.malo
       and s.motivos_plantados -> 0 ->> 'motivo' in ('perdida_trabajo', 'cierre_negocio', 'pension_alimenticia', 'demanda_civil', 'proceso_fiscalia', 'credito_otra_institucion')
  ), variables as (
    select resultado from lab_resultados where corte_id = p_corte and tipo = 'variables'
     order by (metodologia ->> 'poblacion' = 'solicitudes') desc nulls last, created_at desc limit 1
  ), crudo as (
    select resultado from lab_resultados where corte_id = p_corte and tipo = 'crudo' order by created_at desc limit 1
  ), regla_crudo as (
    select c.regla_plantada -> 'capas' -> 'dato_solo_crudo' as r
      from lab_cargas c
     where c.id = any(v_corte.carga_ids) and c.regla_plantada -> 'capas' -> 'dato_solo_crudo' ? 'ruta'
     limit 1
  ), hallazgos as (
    select h, o from crudo, jsonb_array_elements(crudo.resultado -> 'hallazgos') with ordinality as t(h, o)
  ), no_vistos as (
    -- Lo que la pantalla del explorador pone primero: significativo, el
    -- modelo no lo tenía y la estructura no lo lee.
    select h, row_number() over (order by o) as puesto from hallazgos
     where (h ->> 'significativa')::boolean and h ->> 'el_modelo' = 'no_lo_tenia' and not (h ->> 'nombrado')::boolean
  ), crudo_plantado as (
    select hl.h, hl.o, (select nv.puesto from no_vistos nv where nv.h = hl.h) as puesto_no_visto
      from hallazgos hl, regla_crudo rc
     where hl.h ->> 'ruta' = rc.r ->> 'ruta'
       and hl.h ->> 'derivacion' in (select jsonb_array_elements_text(rc.r -> 'derivaciones'))
     order by (select nv.puesto from no_vistos nv where nv.h = hl.h) nulls last, hl.o
     limit 1
  )
  select jsonb_build_object(
    'eventos', (select jsonb_agg(to_jsonb(e) order by e.plantados desc) from eventos e),
    'coherencia_del_credito_de_la_institucion', jsonb_build_object(
      'desembolsados', (select count(*) from sol where desembolsada),
      'visto_en_el_buro', (select count(*) from sol s where desembolsada and exists (select 1 from lab_eventos e where e.reconsulta_id = s.reconsulta_id and e.tipo = 'credito_institucion'))),
    'resultado_sin_credito', jsonb_build_object(
      'solicitudes', (select count(*) from sin_credito),
      'malos_plantados', (select count(*) from sin_credito where malo_plantado),
      'observados', (select count(*) from sin_credito where incluida),
      'malo_plantado_y_visto', (select count(*) from sin_credito where incluida and malo and malo_plantado),
      'malo_plantado_no_visto_observado', (select count(*) from sin_credito where incluida and not malo and malo_plantado),
      'malo_plantado_sin_observar', (select count(*) from sin_credito where not incluida and malo_plantado),
      'se_puso_al_dia_y_escapo', (select count(*) from sin_credito where malo_plantado and se_puso_al_dia and not coalesce(malo, false)),
      'visto_malo_sin_plantar', (select count(*) from sin_credito where incluida and malo and not malo_plantado)),
    'motivo_principal_plantado_detectado', jsonb_build_object(
      'malos_con_motivo_de_evento', (select count(*) from motivos), 'detectado', (select count(*) from motivos where detectado),
      'por_motivo', (select jsonb_object_agg(principal, jsonb_build_array(d, n)) from (select principal, count(*) filter (where detectado) as d, count(*) as n from motivos group by 1) x)),
    'auc_contra_lo_plantado', (select jsonb_object_agg(grupo, jsonb_build_object('auc', case when nb = 0 or nm = 0 then null else round((suma_buenos - nb * (nb + 1) / 2.0) / (nb * nm::numeric), 4) end, 'buenos', nb, 'malos', nm)) from auc),
    'variables', (select jsonb_build_object(
        'calculadas', true,
        'puestos', (select jsonb_object_agg(v ->> 'variable', jsonb_build_object('puesto', o, 'iv', v -> 'iv', 'llega_al_modelo', v -> 'llega_al_modelo'))
                      from jsonb_array_elements(resultado -> 'variables') with ordinality as t(v, o)
                     where v ->> 'variable' in ('meses_con_aporte_24', 'peor_calificacion', 'deuda_en_atraso', 'demandas_de_cobro', 'continuidad_laboral_meses')))
        from variables),
    'dato_solo_crudo', case
      when not exists (select 1 from crudo) then jsonb_build_object('calculado', false)
      else jsonb_build_object(
        'calculado', true,
        'campo', (select r ->> 'campo' from regla_crudo),
        'ruta', (select r ->> 'ruta' from regla_crudo),
        'hallazgos', (select count(*) from hallazgos),
        'no_vistos', (select count(*) from no_vistos),
        'encontrado', coalesce((select (h ->> 'significativa')::boolean from crudo_plantado), false),
        'puesto', (select o from crudo_plantado),
        'puesto_entre_no_vistos', (select puesto_no_visto from crudo_plantado),
        'derivacion', (select h ->> 'derivacion' from crudo_plantado),
        'con', (select h -> 'con' from crudo_plantado),
        'tasa_con', (select h -> 'tasa_con' from crudo_plantado),
        'tasa_sin', (select h -> 'tasa_sin' from crudo_plantado),
        'iv', (select h -> 'iv' from crudo_plantado),
        'el_modelo', (select h ->> 'el_modelo' from crudo_plantado),
        'parte_no_explicada', (select h -> 'parte_no_explicada' from crudo_plantado),
        'nombrado', (select h -> 'nombrado' from crudo_plantado))
      end,
    'advertencias', to_jsonb(array[
      'Califica al Laboratorio, no al motor: la verdad es la que plantamos.',
      'Los eventos reales de la semana entre la consulta de septiembre y la reconsulta se cuentan aparte: no son inventos del detector.'])
  ) into v_res;

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'calificacion_simulacion', jsonb_build_object('version', 2),
          v_res, (select count(*) from lab_corte_solicitudes where corte_id = p_corte),
          (select count(*) from lab_simulacion_verdad v join lab_corte_solicitudes cs on cs.solicitud_id = v.solicitud_id where cs.corte_id = p_corte and v.malo),
          auth.uid());
  return v_res;
end;
$$;
