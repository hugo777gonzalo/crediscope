-- Laboratorio, fase 6: los cálculos del ciclo de un año
-- (docs/laboratorio-de-riesgo.md, secciones 14.5 a 14.7).
--
-- Un corte de una carga con solicitudes congela, además de las operaciones
-- del archivo, a TODAS las solicitudes del período: las desembolsadas, con
-- el resultado del archivo, y las que no, con el resultado de la
-- reconsulta. Sobre esa población salen los cuatro cuadrantes, los motivos
-- del impago y, en una simulación, la calificación contra la verdad
-- plantada. Nada de esto llama al modelo de lenguaje.

create table lab_corte_solicitudes (
  corte_id                uuid not null references lab_cortes(id) on delete cascade,
  solicitud_id            uuid not null references lab_solicitudes(id) on delete cascade,
  carga_id                uuid not null,
  cedula                  text not null,
  desembolsada            boolean not null,
  recomendacion           text,
  puntaje                 integer,
  fuente_puntaje          text,
  incluida                boolean not null,
  motivo_exclusion        text,
  malo                    boolean,
  -- archivo: lo dice la institución. buro: lo dice la reconsulta.
  origen_resultado        text not null check (origen_resultado in ('archivo', 'buro')),
  -- Dónde se vio la caída: el crédito de la institución, uno nuevo de otra
  -- institución, o uno que ya tenía.
  donde                   text[],
  recibio_credito_de_otro boolean,
  fecha_default           date,
  cuota_mensual           numeric(14, 2),
  variables               jsonb,
  primary key (corte_id, solicitud_id)
);

alter table lab_corte_solicitudes enable row level security;
-- Congelado: sin update, como lab_corte_operaciones.
create policy lab_corte_solicitudes_lectura on lab_corte_solicitudes for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_corte_solicitudes_alta on lab_corte_solicitudes for insert
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- Si una operación del buró cumple la definición de default. La misma
-- definición que se aplica al archivo, sobre los hechos que guardó la
-- reconsulta (eventos-entre-consultas.ts): días de mora (cooperativas,
-- retail), calificación (bancos), castigo y juicio. El retail cuenta sólo si
-- es "grande" por el saldo (falta que el negocio lo defina: sección 2).
create or replace function lab_operacion_en_default(p_op jsonb, p_def lab_definiciones_default, p_sufijo text default '')
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_op ->> 'canal'
           when 'bancos' then 'bancos' = any(p_def.sistemas)
           when 'cooperativas' then 'cooperativas' = any(p_def.sistemas)
           when 'retail' then 'retail_grande' = any(p_def.sistemas) and coalesce((p_op ->> 'saldo')::numeric, 0) >= p_def.retail_monto_minimo
           else true end
     and (coalesce((p_op ->> ('dias' || p_sufijo))::numeric, 0) >= p_def.dias_mora_minimo
          or coalesce(p_op ->> ('calificacion' || p_sufijo) = any(
               (array['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D', 'E'])[array_position(array['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D', 'E'], coalesce(p_def.calificacion_peor_que, 'E')) + 1 :]), false)
          or (p_def.cuenta_castigo and coalesce((p_op ->> ('castigo' || p_sufijo))::boolean, false))
          or (p_def.cuenta_judicial and coalesce((p_op ->> ('judicial' || p_sufijo))::boolean, false)));
$$;

-- Congela las solicitudes de un corte. La llama lab_congelar_corte cuando sus
-- cargas tienen solicitudes.
create or replace function lab_congelar_solicitudes(p_corte uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_corte lab_cortes;
  v_def   lab_definiciones_default;
  v_res   jsonb;
begin
  select * into v_corte from lab_cortes where id = p_corte;
  if not found then raise exception 'No existe el corte'; end if;
  if exists (select 1 from lab_corte_solicitudes where corte_id = p_corte) then raise exception 'El corte ya tiene sus solicitudes congeladas'; end if;
  select * into v_def from lab_definiciones_default where id = v_corte.definicion_default_id;

  insert into lab_corte_solicitudes (
    corte_id, solicitud_id, carga_id, cedula, desembolsada, recomendacion, puntaje, fuente_puntaje, incluida, motivo_exclusion,
    malo, origen_resultado, donde, recibio_credito_de_otro, fecha_default, cuota_mensual, variables
  )
  select p_corte, s.id, s.carga_id, s.cedula, s.desembolsada, s.recomendacion, s.puntaje, s.fuente_puntaje,
         m.motivo is null, m.motivo,
         case when m.motivo is not null then null when s.desembolsada then co.malo else coalesce(b.malo, false) end,
         case when s.desembolsada then 'archivo' else 'buro' end,
         case when m.motivo is not null then null
              when s.desembolsada then case when co.malo then array['credito_institucion'] end
              else b.donde end,
         (rc.resultado ->> 'recibio_credito_de_otro')::boolean,
         case when s.desembolsada and co.malo then o.fecha_primer_default end,
         o.cuota_mensual,
         case when coalesce(rc.perfil_t0, p.standard_profile) is null then null else
           (select jsonb_object_agg(cv.id, coalesce(rc.perfil_t0, p.standard_profile) #> cv.ruta) from lab_catalogo_variables cv where cv.activa) end
    from lab_solicitudes s
    left join lab_reconsultas rc on rc.solicitud_id = s.id
    left join lab_operaciones o on o.id = s.operacion_id
    left join lab_corte_operaciones co on co.corte_id = p_corte and co.operacion_id = s.operacion_id
    left join client_profiles p on p.id = s.client_profile_id
    -- Cae en una operación nueva (de una entidad que ya reportaba) o en una
    -- que tenía y en t0 no estaba en default.
    cross join lateral (
      select bool_or(true) as malo, array_agg(distinct x.donde order by x.donde) as donde
        from (
          select 'credito_nuevo' as donde from jsonb_array_elements(coalesce(rc.resultado -> 'buro' -> 'creditosNuevos', '[]')) op
           where not coalesce((op ->> 'entidadRecienReportada')::boolean, false) and lab_operacion_en_default(op, v_def)
          union all
          select 'credito_previo' from jsonb_array_elements(coalesce(rc.resultado -> 'buro' -> 'deterioros', '[]')) op
           where lab_operacion_en_default(op, v_def) and not lab_operacion_en_default(op, v_def, 'T0')
        ) x
    ) b
    cross join lateral (select case
      when rc.id is null then 'sin reconsulta'
      when rc.procesada_en is null then 'reconsulta sin procesar'
      when s.desembolsada and co.operacion_id is null then 'la operación no está en el corte'
      when s.desembolsada and not co.incluida then 'operación excluida: ' || co.motivo_exclusion
      -- Sin crédito con nadie no hay nada que observar: ni pagó ni cayó.
      when not s.desembolsada and not coalesce((rc.resultado ->> 'recibio_credito_de_otro')::boolean, false)
           and jsonb_array_length(coalesce(rc.resultado -> 'entidades_t0', '[]')) = 0 then 'sin crédito con nadie: no se puede observar'
    end as motivo) m
   where s.carga_id = any(v_corte.carga_ids);

  select jsonb_build_object(
    'solicitudes', count(*),
    'desembolsadas', count(*) filter (where desembolsada),
    'incluidas', count(*) filter (where incluida),
    'malos', count(*) filter (where incluida and malo),
    'excluidas', coalesce((select jsonb_object_agg(motivo_exclusion, n) from (
        select motivo_exclusion, count(*) as n from lab_corte_solicitudes
         where corte_id = p_corte and not incluida group by motivo_exclusion) e), '{}'::jsonb))
    into v_res
    from lab_corte_solicitudes where corte_id = p_corte;
  update lab_cortes set resumen = coalesce(resumen, '{}'::jsonb) || jsonb_build_object('solicitudes', v_res) where id = p_corte;
  return v_res;
end;
$$;

-- lab_congelar_corte de la 095, con dos cambios:
--  - las variables salen del perfil de t0 rearmado por la reconsulta cuando
--    existe (la versión vigente del código sobre el crudo del día del
--    análisis), y del perfil guardado si no;
--  - si las cargas tienen solicitudes, las congela también.
create or replace function lab_congelar_corte(
  p_nombre text, p_cargas uuid[], p_definicion uuid, p_ventana integer, p_filtros jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id      uuid;
  v_tipos   boolean[];
  v_def     lab_definiciones_default;
  v_orden   text[] := array['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D', 'E'];
  v_peores  text[];
begin
  if p_ventana not in (12, 24) then raise exception 'La ventana es de 12 o de 24 meses'; end if;
  if coalesce(array_length(p_cargas, 1), 0) = 0 then raise exception 'Falta elegir al menos una carga'; end if;
  if exists (select 1 from unnest(p_cargas) c where not exists (select 1 from lab_cargas k where k.id = c and k.estado = 'lista')) then
    raise exception 'Todas las cargas tienen que estar listas (vinculadas y sin errores)';
  end if;
  select array_agg(distinct es_sintetica) into v_tipos from lab_cargas where id = any(p_cargas);
  if array_length(v_tipos, 1) > 1 then raise exception 'No se mezclan cargas reales con sintéticas'; end if;
  select * into v_def from lab_definiciones_default where id = p_definicion;
  if not found then raise exception 'No existe esa definición de default'; end if;
  v_peores := v_orden[array_position(v_orden, coalesce(v_def.calificacion_peor_que, 'E')) + 1 :];

  insert into lab_cortes (nombre, carga_ids, definicion_default_id, ventana_meses, filtros, es_sintetico, creado_por)
  values (p_nombre, p_cargas, p_definicion, p_ventana, coalesce(p_filtros, '{}'::jsonb), v_tipos[1], auth.uid())
  returning id into v_id;

  insert into lab_corte_operaciones (
    corte_id, operacion_id, carga_id, cedula, producto, monto, fecha_desembolso, incluida, motivo_exclusion, malo,
    fuente_puntaje, puntaje, recomendacion, marco_version, structure_version, veredicto_origen,
    primera_de_la_persona, client_profile_id, analysis_result_id, variables
  )
  select v_id, o.id, o.carga_id, o.cedula, o.producto, o.monto, o.fecha_desembolso,
         m.motivo is null, m.motivo,
         case when m.motivo is null then (
           coalesce(x.dias >= v_def.dias_mora_minimo, false)
           or coalesce(x.calificacion = any(v_peores), false)
           -- El estado de la operación cuenta si el impago cayó dentro de la
           -- ventana (o no se sabe cuándo cayó).
           or (x.dentro and ((v_def.cuenta_castigo and o.estado_operacion = 'castigada')
                          or (v_def.cuenta_reestructuracion and o.estado_operacion = 'reestructurada')
                          or (v_def.cuenta_judicial and o.estado_operacion = 'judicial')))
         ) end,
         f.fuente,
         case f.fuente when 'analisis' then a.crediscope_score when 'sintetico' then (o.sintetico ->> 'puntaje')::integer end,
         case f.fuente
           when 'analisis' then case a.recomendacion when 'observar' then 'revisar' else a.recomendacion end
           when 'sintetico' then o.sintetico ->> 'recomendacion' end,
         case f.fuente when 'analisis' then a.rules_version end,
         coalesce(rc.structure_version, p.structure_version),
         case f.fuente when 'analisis' then a.veredicto_origen end,
         o.primera_de_la_persona, o.client_profile_id, o.analysis_result_id,
         case when coalesce(rc.perfil_t0, p.standard_profile) is null then null else
           (select jsonb_object_agg(cv.id, coalesce(rc.perfil_t0, p.standard_profile) #> cv.ruta) from lab_catalogo_variables cv where cv.activa) end
    from lab_operaciones o
    join lab_cargas k on k.id = o.carga_id
    left join analysis_results a on a.id = o.analysis_result_id
    left join client_profiles p on p.id = o.client_profile_id
    left join lab_solicitudes s on s.operacion_id = o.id
    left join lab_reconsultas rc on rc.solicitud_id = s.id and rc.procesada_en is not null
    cross join lateral (select
      case when p_ventana = 12 then o.dias_mora_max_12m else o.dias_mora_max_24m end as dias,
      case when p_ventana = 12 then o.peor_calificacion_12m else o.peor_calificacion_24m end as calificacion,
      (o.fecha_primer_default is null or o.fecha_primer_default <= o.fecha_desembolso + make_interval(months => p_ventana)) as dentro
    ) x
    cross join lateral (select
      case when k.es_sintetica and o.sintetico ? 'puntaje' then 'sintetico'
           when a.id is not null and a.fallo is null then 'analisis' end as fuente
    ) f
    cross join lateral (select case
      when o.vinculo = 'consulta_posterior' then 'consulta posterior al desembolso (fuga)'
      when o.vinculo = 'fuera_de_ventana' then 'consulta más vieja que la ventana'
      when o.vinculo = 'sin_consulta' then 'nunca se consultó'
      when o.fecha_desembolso + make_interval(months => p_ventana) > k.fecha_corte then 'inmadura'
      when (case when p_ventana = 12 then o.dias_mora_max_12m else o.dias_mora_max_24m end) is null
       and (case when p_ventana = 12 then o.peor_calificacion_12m else o.peor_calificacion_24m end) is null
       and o.estado_operacion not in ('castigada', 'reestructurada', 'judicial') then 'sin dato de mora en la ventana'
      when p_filtros ? 'productos' and not (o.producto = any(array(select jsonb_array_elements_text(p_filtros -> 'productos')))) then 'filtro: producto'
      when p_filtros ? 'desde' and o.fecha_desembolso < (p_filtros ->> 'desde')::date then 'filtro: fecha'
      when p_filtros ? 'hasta' and o.fecha_desembolso > (p_filtros ->> 'hasta')::date then 'filtro: fecha'
      when p_filtros ? 'marcos' and f.fuente = 'analisis'
       and not (a.rules_version = any(array(select jsonb_array_elements_text(p_filtros -> 'marcos')))) then 'filtro: versión del marco'
    end as motivo) m
   where o.carga_id = any(p_cargas);

  update lab_cortes set resumen = (
    select jsonb_build_object(
      'operaciones', count(*),
      'incluidas', count(*) filter (where incluida),
      'malos', count(*) filter (where incluida and malo),
      'con_puntaje', count(*) filter (where incluida and puntaje is not null),
      'excluidas', coalesce((select jsonb_object_agg(motivo_exclusion, n) from (
          select motivo_exclusion, count(*) as n from lab_corte_operaciones
           where corte_id = v_id and not incluida group by motivo_exclusion) e), '{}'::jsonb))
    from lab_corte_operaciones where corte_id = v_id)
  where id = v_id;

  if exists (select 1 from lab_solicitudes where carga_id = any(p_cargas)) then
    perform lab_congelar_solicitudes(v_id);
  end if;
  return v_id;
end;
$$;

-- Intervalo de Wilson al 95% para una tasa.
create or replace function lab_wilson(p_malos bigint, p_n bigint)
returns jsonb
language sql
immutable
as $$
  select case when p_n = 0 then null else jsonb_build_array(
    round(greatest(0, ((p + z * z / (2 * p_n)) - z * sqrt(p * (1 - p) / p_n + z * z / (4.0 * p_n * p_n))) / (1 + z * z / p_n)), 4),
    round(least(1, ((p + z * z / (2 * p_n)) + z * sqrt(p * (1 - p) / p_n + z * z / (4.0 * p_n * p_n))) / (1 + z * z / p_n)), 4)) end
    from (select p_malos::numeric / nullif(p_n, 0) as p, 1.96 as z) x;
$$;

-- ------------------------------------------------------------ cuadrantes
-- Recomendación × desembolso. Con crédito, el resultado lo dice el archivo;
-- sin crédito, la reconsulta, y sólo se puede observar a quien tuvo crédito
-- con alguien. Los nombres de los errores dicen lo que cuestan: el aprobado
-- que cayó es capital perdido; el negado que pagó con otro, negocio perdido.
create or replace function lab_calcular_cuadrantes(p_corte uuid)
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
        'tasa', case when observadas > 0 then round(malos::numeric / observadas, 4) end, 'intervalo', lab_wilson(malos, observadas),
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

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'cuadrantes',
          jsonb_build_object('version', 1, 'aprobado', 'aprobar o revisar', 'intervalo_tasa', 'Wilson 95%',
                             'resultado_sin_credito', 'reconsulta: operación nueva de una entidad que ya reportaba, o una que tenía y en t0 no estaba en default, que cumple la definición'),
          v_res, (v_res ->> 'n')::integer, (v_res ->> 'n_malos')::integer, auth.uid());
  return v_res;
end;
$$;

-- -------------------------------------------------------------- motivos
-- Por qué cayó cada malo, con los eventos detectados entre t0 y t1 y lo que
-- se veía en t0. Nunca lee la verdad plantada.
--   - visible en t0: la cuota no cabía en el ingreso (más del 35%); el
--     ingreso estaba por confirmar o sin determinar; el modelo dijo negar o
--     revisar y la institución prestó igual;
--   - interno posterior: otra institución le prestó (el buró de bancos no
--     dice cuándo: queda "sin fecha");
--   - externo: pérdida del trabajo, cierre del negocio, pensión alimenticia,
--     demanda civil, proceso en Fiscalía, antes de la caída o sin fecha;
--   - consecuencias, no causas: mora en lo que ya tenía, demandas de cobro.
--     Si la mora de afuera empezó antes que la nuestra, el problema empezó
--     afuera.
-- ¿Se podía ver?: con algo visible en t0, anticipable. Si la causa fue un
-- golpe posterior, "vulnerabilidad visible" cuando el propio puntaje ya lo
-- ubicaba en la mitad más riesgosa de las solicitudes, y "no anticipable" si
-- no. La tabla por evento compara, entre quienes recibieron el mismo golpe,
-- qué tenían en t0 los que cayeron y los que siguieron pagando.
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
    -- Visibles en t0 (sólo tienen sentido con nuestro crédito).
    select solicitud_id, 'cuota_no_cabia' as motivo, null::date as fecha, 1 as orden from base
     where malo and desembolsada and cuota_mensual is not null and ingreso > 0 and cuota_mensual / ingreso > 0.35
    union all
    select solicitud_id, 'capacidad_no_medible', null, 2 from base
     where malo and desembolsada and (estado_ingreso is distinct from 'confirmada' or coalesce(ingreso, 0) = 0)
    union all
    select solicitud_id, case recomendacion when 'negar' then 'el_modelo_lo_vio' else 'el_modelo_advirtio' end, null, 3 from base
     where malo and desembolsada and recomendacion in ('negar', 'revisar')
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

-- ------------------------------------------------- calificar la simulación
-- Sólo en un corte sintético con verdad plantada: ¿encontró el Laboratorio lo
-- que pusimos? Es la única función que lee lab_simulacion_verdad.
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
    'advertencias', to_jsonb(array[
      'Califica al Laboratorio, no al motor: la verdad es la que plantamos.',
      'Los eventos reales de la semana entre la consulta de septiembre y la reconsulta se cuentan aparte: no son inventos del detector.'])
  ) into v_res;

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'calificacion_simulacion', jsonb_build_object('version', 1),
          v_res, (select count(*) from lab_corte_solicitudes where corte_id = p_corte),
          (select count(*) from lab_simulacion_verdad v join lab_corte_solicitudes cs on cs.solicitud_id = v.solicitud_id where cs.corte_id = p_corte and v.malo),
          auth.uid());
  return v_res;
end;
$$;

-- ------------------------------------------------------------ variables
-- lab_calcular_variables de la 095, con la población como parámetro. Con
-- sólo los desembolsados una prueba de 300 créditos tiene unos 36 malos, y
-- con menos de 100 el IV es ruido: 'solicitudes' mira además a quienes no
-- recibieron el crédito y se pudieron observar en la reconsulta. Mezcla dos
-- fuentes del resultado (el archivo y el buró), y lo dice la advertencia.
-- Se borra la versión de un solo parámetro: con las dos, una llamada con
-- sólo el corte no sabría a cuál ir.
drop function lab_calcular_variables(uuid);
create or replace function lab_calcular_variables(p_corte uuid, p_poblacion text default 'operaciones')
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_corte lab_cortes;
  v_b     bigint;
  v_m     bigint;
  v_res   jsonb;
begin
  select * into v_corte from lab_cortes where id = p_corte;
  if not found then raise exception 'No existe el corte'; end if;
  if p_poblacion not in ('operaciones', 'solicitudes') then raise exception 'La población es operaciones o solicitudes'; end if;
  select count(*) filter (where not malo), count(*) filter (where malo) into v_b, v_m
    from (select malo from lab_corte_operaciones
           where p_poblacion = 'operaciones' and corte_id = p_corte and incluida and primera_de_la_persona and variables is not null
          union all
          select malo from lab_corte_solicitudes
           where p_poblacion = 'solicitudes' and corte_id = p_corte and incluida and malo is not null and variables is not null) f;
  if v_b = 0 or v_m = 0 then raise exception 'El corte no tiene buenos y malos con perfil en esa población'; end if;

  with filas as (
    select malo, variables from lab_corte_operaciones
     where p_poblacion = 'operaciones' and corte_id = p_corte and incluida and primera_de_la_persona and variables is not null
    union all
    select malo, variables from lab_corte_solicitudes
     where p_poblacion = 'solicitudes' and corte_id = p_corte and incluida and malo is not null and variables is not null
  ), base as (
    select co.malo, cv.id as var, cv.tipo, co.variables -> cv.id as v
      from filas co cross join lab_catalogo_variables cv
     where cv.activa
  ), tipado as (
    select malo, var, tipo,
           case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end as num,
           case when v is null or jsonb_typeof(v) = 'null' then null else v #>> '{}' end as txt
      from base
  ), estad as (
    select var, count(distinct txt) as distintos,
           avg(case when num = 0 then 1.0 else 0 end) filter (where num is not null) as ceros
      from tipado group by var
  ), marcado as (
    select t.*, (t.tipo = 'numero' and e.distintos > 6 and t.num is not null
                 and not (t.num = 0 and coalesce(e.ceros, 0) >= 0.1)) as en_cuartiles,
           e.distintos, e.ceros
      from tipado t join estad e using (var)
  ), conbin as (
    select *, case
        when txt is null then 'sin dato'
        when not en_cuartiles and (tipo <> 'numero' or distintos <= 6) then txt
        when not en_cuartiles then '0'
        else 'c' || ntile(4) over (partition by var, en_cuartiles order by num) end as bin
      from marcado
  ), tramos as (
    select var, bin, count(*) as n, count(*) filter (where malo) as malos, min(num) as desde, max(num) as hasta
      from conbin group by var, bin
  ), k as (
    select var, count(*) as k from tramos group by var
  ), woe as (
    select t.*, ((t.n - t.malos) + 0.5) / (v_b + 0.5 * k.k) as pb, (t.malos + 0.5) / (v_m + 0.5 * k.k) as pm
      from tramos t join k using (var)
  ), porvar as (
    select var,
           sum((pb - pm) * ln(pb / pm)) as iv,
           sum(n) filter (where bin <> 'sin dato') as con_dato,
           sum(n) as total,
           jsonb_agg(jsonb_build_object(
             'tramo', case when bin like 'c%' then case when desde = hasta then desde::text else desde::text || ' a ' || hasta::text end else bin end,
             'n', n, 'malos', malos, 'tasa', round(malos::numeric / n, 4), 'woe', round(ln(pb / pm), 4))
             order by (bin = 'sin dato'), desde nulls first, bin) as tramos
      from woe group by var
  )
  select jsonb_agg(jsonb_build_object(
      'variable', cv.id, 'nombre', cv.nombre, 'grupo', cv.grupo, 'uso', cv.uso,
      'llega_al_modelo', cv.en_perfil_del_modelo and not exists (
          select 1 from standard_profile_field_config f where f.enabled = false and f.grupo = cv.ruta[1] and f.campo = cv.ruta[2]),
      'cobertura', round(p.con_dato::numeric / nullif(p.total, 0), 4),
      'iv', round(p.iv, 4),
      'fuerza', case when p.iv < 0.02 then 'nada' when p.iv < 0.1 then 'débil' when p.iv < 0.3 then 'media' else 'fuerte' end,
      'sospecha_de_fuga', p.iv > 0.5,
      'tramos', p.tramos)
      order by p.iv desc nulls last)
    into v_res
    from porvar p join lab_catalogo_variables cv on cv.id = p.var;

  v_res := jsonb_build_object(
    'es_sintetico', v_corte.es_sintetico, 'poblacion', p_poblacion, 'personas', v_b + v_m, 'buenos', v_b, 'malos', v_m,
    'advertencias', to_jsonb(array_remove(array[
        case when v_m < 100 then 'Menos de 100 malos: el IV por variable es ruido; sirve para orientar, no para proponer.' end,
        case when p_poblacion = 'solicitudes' then 'Incluye a quienes no recibieron el crédito: su resultado sale del buró (un crédito de otro o uno que ya tenían), no del archivo.' end,
        case when v_corte.es_sintetico then 'Corte sintético: tiene que encontrar las variables de la regla plantada.' end
      ], null)),
    'variables', v_res);

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'variables',
          jsonb_build_object('version', 2, 'poblacion', p_poblacion,
                             'iv', 'WoE con suavizado 0,5; cuartiles; tramo propio para el cero si es 10% o más; una persona una vez',
                             'umbrales', jsonb_build_object('nada', 0.02, 'debil', 0.1, 'media', 0.3, 'sospecha_de_fuga', 0.5)),
          v_res, (v_b + v_m)::integer, v_m::integer, auth.uid());
  return v_res;
end;
$$;

-- --------------------------------------------------- simulación de política
-- Una regla como dato, contra el motor vigente sobre el mismo corte, sin
