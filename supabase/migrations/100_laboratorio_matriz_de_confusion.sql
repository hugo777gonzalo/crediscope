-- Laboratorio, fase A de las pantallas (docs/laboratorio-pantallas.md):
-- matriz de confusión y desempeño por decisión, sobre cualquier corte.
--
-- La matriz no es de 2 × 2: el motor no dice "malo / bueno", recomienda
-- aprobar, revisar o negar. Va resultado (pagó / cayó) × recomendación, y
-- las medidas de clasificación se calculan con dos lecturas de "el motor lo
-- marcó como malo": sólo negar, y negar o revisar. Con ~10% de malos la
-- exactitud engaña (marcar a todos como buenos da 90%): va, pero detrás del
-- AUC y con esa advertencia.

alter table lab_resultados drop constraint lab_resultados_tipo_check;
alter table lab_resultados add constraint lab_resultados_tipo_check check (tipo in (
  'desempeno', 'variables', 'simulacion_politica', 'simulacion_marco', 'estabilidad',
  'cuadrantes', 'motivos', 'crudo', 'calificacion_simulacion', 'matriz'));

create or replace function lab_calcular_matriz(p_corte uuid)
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

  with base as (
    -- El negado por bloqueo es una negación por política: cuenta como
    -- marcado malo, en su propia columna.
    select co.malo, co.puntaje, co.variables,
           case when co.veredicto_origen = 'control_bloqueo' then 'bloqueado' else co.recomendacion end as rec
      from lab_corte_operaciones co
     where co.corte_id = p_corte and co.incluida and co.recomendacion is not null and co.malo is not null
  ), celdas as (
    select rec, count(*) filter (where malo) as cayeron, count(*) filter (where not malo) as pagaron from base group by rec
  ), lecturas as (
    select * from (values
      ('negar', 'El motor marca malo a quien manda negar', array['negar', 'bloqueado']),
      ('negar_o_revisar', 'El motor marca malo a quien manda negar o revisar', array['negar', 'revisar', 'bloqueado'])
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
    'matriz', (select jsonb_agg(jsonb_build_object('recomendacion', rec, 'cayeron', cayeron, 'pagaron', pagaron)
        order by array_position(array['aprobar', 'revisar', 'negar', 'bloqueado'], rec)) from celdas),
    'medidas', (select jsonb_agg(jsonb_build_object(
        'lectura', clave, 'texto', texto, 'cayo_y_lo_marco', vp, 'pago_y_lo_marco', fp, 'cayo_y_no_lo_marco', fn, 'pago_y_no_lo_marco', vn,
        'exactitud', exactitud, 'precision', precision, 'sensibilidad', sensibilidad, 'especificidad', especificidad,
        'f1', case when precision + sensibilidad > 0 then round(2 * precision * sensibilidad / (precision + sensibilidad), 4) end,
        'tasa_aprobacion', tasa_aprobacion, 'tasa_default_aprobados', tasa_default_aprobados) order by clave) from medidas),
    'por_decision', (select jsonb_agg(jsonb_build_object(
        'recomendacion', rec, 'n', n, 'malos', malos, 'tasa', round(malos::numeric / n, 4), 'intervalo', lab_wilson(malos, n),
        'puntaje_mediano_malos', round(puntaje_malos::numeric), 'puntaje_mediano_buenos', round(puntaje_buenos::numeric),
        'ingreso_sin_confirmar', ingreso_sin_confirmar, 'malos_ingreso_sin_confirmar', malos_ingreso_sin_confirmar)
        order by array_position(array['aprobar', 'revisar', 'negar', 'bloqueado'], rec)) from por_decision),
    'negados_sin_credito', case when exists (select 1 from lab_corte_solicitudes where corte_id = p_corte)
        then (select to_jsonb(x) from negados_sin_credito x) end,
    'advertencias', to_jsonb(array_remove(array[
        'Con pocos malos, la exactitud engaña: decir que todos pagan acierta casi siempre. Mirar primero el AUC y la sensibilidad.',
        'La institución todavía no informa qué hizo con cada caso enviado a revisión: "revisar" se lee como aprobado.',
        case when (select count(*) from base where malo) < 30 then 'Menos de 30 malos: las medidas son orientativas.' end,
        case when v_corte.es_sintetico then 'Corte sintético: el resultado y el puntaje son inventados. No es desempeño del motor.' end
      ], null))
  ) into v_res;

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'matriz',
          jsonb_build_object('version', 1, 'lecturas', 'negar (y bloqueado) marca malo; negar o revisar marca malo'),
          v_res, (v_res ->> 'n')::integer, (v_res ->> 'n_malos')::integer, auth.uid());
  return v_res;
end;
$$;
