-- Laboratorio, fase 2 de la revisión (docs/propuesta-revision-del-laboratorio.md,
-- 10.5 y 10.6; decisión del negocio del 2026-10-06).
--
-- 1. Lo que se calcula en el navegador se guarda. lab_resultados suma la
--    huella del cálculo (corte, tipo, población, parámetros y versión del
--    cálculo) y quién lo calculó (base, navegador o guion). La misma huella
--    no se guarda dos veces: el corte está congelado y el número es el mismo;
--    si cambia el cálculo, cambia la versión y se guarda al lado. Hasta acá un
--    informe podía citar números que no quedaban en ningún lado.
-- 2. Una sola implementación de cada cálculo. El AUC estaba cuatro veces
--    (lab_auc, la calificación de la simulación, el navegador y el explorador
--    del crudo), y el IV, el KS, el intervalo de Wilson, el error del AUC y el
--    PSI, dos o tres. La estadística vive sólo en src/lib/estadistica.js; la
--    base congela, vincula, cuenta y guarda. Las funciones de abajo son las de
--    la 099, la 104 y la 110 sin la estadística y sin guardar: devuelven
--    conteos, y src/lib/calculosDelCorte.js agrega los intervalos y el AUC y
--    guarda. Las viejas (lab_calcular_*, lab_auc, lab_wilson, lab_estabilidad,
--    lab_calificar_simulacion) se borran en la 112, después de publicar las
--    pantallas que ya no las llaman (regla 8 de CLAUDE.md).

alter table lab_resultados
  add column huella text,
  add column origen text not null default 'base' check (origen in ('base', 'navegador', 'guion'));

-- Las filas viejas no tienen huella (null): no chocan entre sí.
create unique index lab_resultados_huella_idx on lab_resultados (corte_id, huella);

alter table lab_resultados drop constraint lab_resultados_tipo_check;
alter table lab_resultados add constraint lab_resultados_tipo_check check (tipo in (
  'desempeno', 'variables', 'simulacion_politica', 'simulacion_marco', 'estabilidad',
  'cuadrantes', 'motivos', 'crudo', 'calificacion_simulacion', 'matriz',
  'calibracion', 'importancia', 'segmentos_kmedias', 'pca',
  -- Desde la 111, lo que calcula el navegador.
  'discriminacion', 'segmentos', 'cosechas', 'descriptivas', 'faltantes', 'correlaciones', 'significancia',
  'los_que_cayeron', 'decisiones_institucion', 'umbrales', 'tramos', 'taller', 'inferencia', 'distribucion',
  'estabilidad_variables', 'comparacion'));

-- ------------------------------------------------------------- matriz
-- lab_calcular_matriz de la 110 sin el intervalo de Wilson y sin guardar.
create or replace function lab_contar_matriz(p_corte uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_corte lab_cortes;
  v_res   jsonb;
begin
  select * into v_corte from lab_cortes where id = p_corte;
  if not found then raise exception 'No existe el corte'; end if;

  with base as (
    -- El negado por bloqueo es una negación por política: cuenta como
    -- marcado malo, en su propia columna.
    select co.malo, co.observacion, co.puntaje, co.variables,
           case when co.veredicto_origen = 'control_bloqueo' then 'bloqueado' else co.recomendacion end as rec
      from lab_corte_operaciones co
     where co.corte_id = p_corte and co.incluida and co.recomendacion is not null and co.malo is not null
  ), celdas as (
    select rec, count(*) filter (where malo) as cayeron, count(*) filter (where not malo) as pagaron,
           count(*) filter (where not malo and observacion) as en_observacion
      from base group by rec
  ), lecturas as (
    select * from (values
      ('negar', 'El motor dice impago cuando manda negar; aprobar y revisar son "no impago"', array['negar', 'bloqueado'])
    ) v(clave, texto, marcados)
  ), conteos as (
    select l.clave, l.texto,
           count(*) filter (where b.rec = any(l.marcados) and b.malo) as vp,
           count(*) filter (where b.rec = any(l.marcados) and not b.malo) as fp,
           count(*) filter (where not b.rec = any(l.marcados) and b.malo) as fn,
           count(*) filter (where not b.rec = any(l.marcados) and not b.malo) as vn
      from lecturas l cross join base b group by l.clave, l.texto
  ), medidas as (
    select clave, texto, vp, fp, fn, vn,
           round((vp + vn)::numeric / nullif(vp + fp + fn + vn, 0), 4) as exactitud,
           round(vp::numeric / nullif(vp + fp, 0), 4) as precision,
           round(vp::numeric / nullif(vp + fn, 0), 4) as sensibilidad,
           round(vn::numeric / nullif(vn + fp, 0), 4) as especificidad,
           round((fn + vn)::numeric / nullif(vp + fp + fn + vn, 0), 4) as tasa_aprobacion,
           round(fn::numeric / nullif(fn + vn, 0), 4) as tasa_default_aprobados
      from conteos
  ), por_decision as (
    select rec, count(*) as n, count(*) filter (where malo) as malos,
           count(*) filter (where not malo and observacion) as en_observacion,
           percentile_cont(0.5) within group (order by puntaje) filter (where malo) as puntaje_malos,
           percentile_cont(0.5) within group (order by puntaje) filter (where not malo) as puntaje_buenos,
           count(*) filter (where variables ->> 'estado_ingreso' is distinct from 'confirmada') as ingreso_sin_confirmar,
           count(*) filter (where malo and variables ->> 'estado_ingreso' is distinct from 'confirmada') as malos_ingreso_sin_confirmar
      from base group by rec
  ), negados_sin_credito as (
    select count(*) as n, count(*) filter (where incluida) as observados,
           count(*) filter (where incluida and malo) as cayeron_con_otro
      from lab_corte_solicitudes where corte_id = p_corte and not desembolsada and recomendacion = 'negar'
  )
  select jsonb_build_object(
    'es_sintetico', v_corte.es_sintetico,
    'n', (select count(*) from base),
    'n_malos', (select count(*) from base where malo),
    'n_observacion', (select count(*) from base where not malo and observacion),
    'matriz', (select jsonb_agg(jsonb_build_object('recomendacion', rec, 'cayeron', cayeron, 'pagaron', pagaron, 'en_observacion', en_observacion)
        order by array_position(array['aprobar', 'revisar', 'negar', 'bloqueado'], rec)) from celdas),
    'medidas', (select jsonb_agg(jsonb_build_object(
        'lectura', clave, 'texto', texto, 'cayo_y_lo_marco', vp, 'pago_y_lo_marco', fp, 'cayo_y_no_lo_marco', fn, 'pago_y_no_lo_marco', vn,
        'exactitud', exactitud, 'precision', precision, 'sensibilidad', sensibilidad, 'especificidad', especificidad,
        'f1', case when precision + sensibilidad > 0 then round(2 * precision * sensibilidad / (precision + sensibilidad), 4) end,
        'tasa_aprobacion', tasa_aprobacion, 'tasa_default_aprobados', tasa_default_aprobados) order by clave) from medidas),
    'por_decision', (select jsonb_agg(jsonb_build_object(
        'recomendacion', rec, 'n', n, 'malos', malos, 'tasa', round(malos::numeric / n, 4),
        'en_observacion', en_observacion,
        'puntaje_mediano_malos', round(puntaje_malos::numeric), 'puntaje_mediano_buenos', round(puntaje_buenos::numeric),
        'ingreso_sin_confirmar', ingreso_sin_confirmar, 'malos_ingreso_sin_confirmar', malos_ingreso_sin_confirmar)
        order by array_position(array['aprobar', 'revisar', 'negar', 'bloqueado'], rec)) from por_decision),
    'negados_sin_credito', case when exists (select 1 from lab_corte_solicitudes where corte_id = p_corte)
        then (select to_jsonb(x) from negados_sin_credito x) end,
    'advertencias', to_jsonb(array_remove(array[
        'Con pocos malos, la exactitud engaña: decir que todos pagan acierta casi siempre. Mirar primero el AUC y la sensibilidad.',
        'Revisar cuenta como "no impago" (decisión del negocio del 2026-10-06): un revisar que cayó es un error del modelo.',
        'La institución casi no desembolsa a los negados: la columna "impago" de lo desembolsado queda casi vacía. La otra mitad la dan los negados sin crédito, por el buró ("Con y sin crédito").',
        case when (select count(*) from base where malo) < 30 then 'Menos de 30 malos: las medidas son orientativas.' end,
        case when v_corte.es_sintetico then 'Corte sintético: el resultado y el puntaje son inventados. No es desempeño del motor.' end
      ], null))
  ) into v_res;
  return v_res;
end;
$$;

-- ---------------------------------------------------------- cuadrantes
-- lab_calcular_cuadrantes de la 099 sin el intervalo de Wilson y sin guardar.
create or replace function lab_contar_cuadrantes(p_corte uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_corte lab_cortes;
  v_res   jsonb;
begin
  select * into v_corte from lab_cortes where id = p_corte;
  if not found then raise exception 'No existe el corte'; end if;
  if not exists (select 1 from lab_corte_solicitudes where corte_id = p_corte) then
    raise exception 'El corte no tiene solicitudes: los cuadrantes necesitan una carga con solicitudes y reconsultas';
  end if;

  with base as (
    select *, coalesce(recomendacion, 'sin recomendación') as rec from lab_corte_solicitudes where corte_id = p_corte
  ), cuad as (
    select rec, desembolsada, count(*) as solicitudes,
           count(*) filter (where incluida) as observadas,
           count(*) filter (where incluida and malo) as malos,
           count(*) filter (where recibio_credito_de_otro) as con_credito_de_otro,
           count(*) filter (where incluida and malo and 'credito_nuevo' = any(donde)) as malos_en_credito_nuevo,
           count(*) filter (where incluida and malo and 'credito_previo' = any(donde)) as malos_en_credito_previo
      from base group by rec, desembolsada
  )
  select jsonb_build_object(
    'es_sintetico', v_corte.es_sintetico,
    'n', (select count(*) from base),
    'n_malos', (select count(*) from base where incluida and malo),
    'cuadrantes', (select jsonb_agg(jsonb_build_object(
        'recomendacion', rec, 'desembolsada', desembolsada, 'solicitudes', solicitudes, 'observadas', observadas, 'malos', malos,
        'tasa', case when observadas > 0 then round(malos::numeric / observadas, 4) end,
        'con_credito_de_otro', con_credito_de_otro, 'malos_en_credito_nuevo', malos_en_credito_nuevo, 'malos_en_credito_previo', malos_en_credito_previo)
        order by array_position(array['aprobar', 'revisar', 'negar', 'bloqueado', 'sin recomendación'], rec), desembolsada desc) from cuad),
    -- Aprobado por el motor = aprobar o revisar (decisión del negocio).
    'aprobados_que_cayeron', (select count(*) from base where desembolsada and incluida and malo and rec in ('aprobar', 'revisar')),
    'negados_desembolsados', (select count(*) from base where desembolsada and rec = 'negar'),
    'negados_desembolsados_que_cayeron', (select count(*) from base where desembolsada and incluida and malo and rec = 'negar'),
    'negados_sin_credito', (select count(*) from base where not desembolsada and rec = 'negar'),
    'negados_con_credito_de_otro', (select count(*) from base where not desembolsada and rec = 'negar' and recibio_credito_de_otro),
    'negados_que_cayeron_con_otro', (select count(*) from base where not desembolsada and rec = 'negar' and incluida and malo),
    'negados_que_pagaron_con_otro', (select count(*) from base where not desembolsada and rec = 'negar' and incluida and not malo and recibio_credito_de_otro),
    'negados_sin_observar', (select count(*) from base where not desembolsada and rec = 'negar' and not incluida),
    'advertencias', to_jsonb(array_remove(array[
        'Sin el crédito de la institución, la caída se ve en el buró: en un crédito de otro (que no es el nuestro: otro monto, otro plazo, otra evaluación) o en uno que ya tenía. Es evidencia, no el resultado que habría tenido nuestro crédito.',
        'Sólo se puede observar a quien tuvo crédito con alguien: el resto no cuenta ni como bueno ni como malo.',
        'El buró de bancos es una foto: quien cayó y se puso al día antes de la reconsulta no se ve.',
        case when (select count(*) from base where incluida and malo) < 30 then 'Menos de 30 malos: las tasas son orientativas.' end,
        case when v_corte.es_sintetico then 'Corte sintético: el resultado y el puntaje son inventados. No es desempeño del motor.' end
      ], null))
  ) into v_res;
  return v_res;
end;
$$;

-- ------------------------------------------------------------- motivos
-- lab_calcular_motivos de la 110 sin el intervalo de Wilson y sin guardar.
create or replace function lab_contar_motivos(p_corte uuid)
returns jsonb
language plpgsql
stable
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
        'evento', tipo, 'con_evento', con_evento, 'malos', malos, 'tasa', round(malos::numeric / con_evento, 4),
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
  return v_res;
end;
$$;

-- --------------------------------------------------- calificar la simulación
-- lab_calificar_simulacion de la 104 sin el AUC y sin guardar. Para el AUC
-- contra lo plantado devuelve los pares (puntaje, malo plantado): lo calcula
-- estadistica.js, como todos. Sigue siendo la única función que lee la verdad
-- plantada, y sólo en un corte sintético.
create or replace function lab_contar_calificacion(p_corte uuid)
returns jsonb
language plpgsql
stable
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
    -- Los pares para el AUC contra el impago PLANTADO: con los desembolsados
    -- (lo que vería una prueba real) y con todos (lo que sólo se puede saber
    -- en una simulación). Sin los bloqueados, como todo AUC.
    'puntajes_contra_lo_plantado', jsonb_build_object(
      'desembolsados', coalesce((select jsonb_agg(jsonb_build_array(puntaje, malo_plantado)) from sol
                                  where desembolsada and puntaje is not null and recomendacion is distinct from 'bloqueado'), '[]'::jsonb),
      'todos', coalesce((select jsonb_agg(jsonb_build_array(puntaje, malo_plantado)) from sol
                          where puntaje is not null and recomendacion is distinct from 'bloqueado'), '[]'::jsonb)),
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
    'n', (select count(*) from sol),
    'n_malos_plantados', (select count(*) from sol where malo_plantado),
    'advertencias', to_jsonb(array[
      'Califica al Laboratorio, no al motor: la verdad es la que plantamos.',
      'Los eventos reales de la semana entre la consulta de septiembre y la reconsulta se cuentan aparte: no son inventos del detector.'])
  ) into v_res;
  return v_res;
end;
$$;
