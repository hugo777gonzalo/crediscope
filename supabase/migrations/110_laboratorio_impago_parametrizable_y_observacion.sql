-- Laboratorio: el impago parametrizable, la lista de observación y "revisar"
-- = no impago. Decisiones del negocio del 2026-10-06, validadas en
-- docs/propuesta-revision-del-laboratorio.md (secciones 10 a 12).
--
-- 1. La tabla de calificación (categoría → días de mora) pasa a ser un
--    parámetro versionado del Laboratorio. La versión 1 es la de la
--    Superintendencia de Bancos para consumo, vigente en 2019 (informe
--    "Comportamiento del crédito de consumo", septiembre de 2019, tabla 5).
--    Si la Junta la cambia, se carga una versión nueva desde Datos y cartera
--    › Configuración; las definiciones viejas siguen diciendo con cuál se
--    hicieron.
-- 2. La definición de impago dice "más de N días" (Basilea es más de 90; el
--    código contaba "90 o más"), qué categorías de los bancos cuentan (las
--    que empiezan después de N días en la tabla: D y E para más de 90; con
--    "peor que B2" contaba desde los 46 días), retail con deuda de MÁS de un
--    monto (contaba "o más") y el umbral de la lista de observación. Las
--    categorías se derivan de la tabla al crear la definición y quedan
--    escritas en ella: un corte viejo sigue diciendo lo que dijo aunque la
--    tabla cambie. La definición del 2026-10-03 se completa con sus valores
--    equivalentes (más de 89 = 90 o más; C1 a E; más de 1.999,99): su
--    resultado no cambia.
--    Novadata no dice el tipo de crédito de las operaciones de bancos (el
--    campo `tipo` vale "C" en las 8.980 de la reconsulta del 2026-10-03): la
--    equivalencia de consumo es la única que se puede aplicar. Ni el monto de
--    un crédito de retail: "retail grande" se mide sobre la deuda total con
--    la casa comercial.
-- 3. La lista de observación: quien llegó a 15 días de atraso o más dentro
--    del primer año, aunque después se haya puesto al día (el negocio: "es
--    grave aunque no caiga en impago"). En cooperativas y retail Novadata da
--    los días; en bancos, la categoría: 15 días cae dentro de A3 (9 a 15), así
--    que cuenta desde B1 (16 a 30), la primera que no incluye atrasos de
--    menos de 15 días. El buró es una foto: quien se atrasó y se puso al día
--    entre dos reconsultas no se ve; el archivo de la institución sí lo
--    trae (el máximo de días del primer año).
-- 4. Dos resultados por solicitud. `malo` es el de la decisión 2 del
--    negocio: el archivo para lo desembolsado, el buró para el resto (lo usan
--    los cuadrantes, los motivos y la calificación, que separan los dos
--    grupos). `malo_buro` es el del buró para todos, desembolsados incluidos:
--    lo usa todo cálculo que junta las dos poblaciones. Mezclarlos hacía que
--    "recibió nuestro crédito" pareciera anticipar el resultado por cómo se
--    medía, no por riesgo (revisión, 1.2).
-- 5. Una fuente que no contestó en t0 o en t1 no da eventos ni resultado
--    (eventos-entre-consultas.ts, misma fecha). Si el buró de bancos o el de
--    cooperativas no contestó, la persona queda sin observar. En el primer
--    ciclo, 44 de los 239 "créditos nuevos en retail" eran deudas viejas de
--    las 147 personas cuyo retail no había contestado en t0.
-- 6. "Revisar" = no impago (decisión 3): un revisar que cayó es un error del
--    modelo, no "el modelo lo vio", y la Matriz tiene una sola lectura.

-- ------------------------------------------------ tabla de calificación
create table lab_tablas_calificacion (
  version     integer not null check (version > 0),
  sistema     text not null check (sistema in ('bancos', 'cooperativas')),
  categoria   text not null check (categoria in ('A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D', 'E')),
  dias_desde  integer not null check (dias_desde >= 0),
  -- null: sin tope (la última categoría).
  dias_hasta  integer check (dias_hasta is null or dias_hasta >= dias_desde),
  fuente      text not null,
  creada_por  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  primary key (version, sistema, categoria)
);

alter table lab_tablas_calificacion enable row level security;
create policy lab_tablas_calificacion_lectura on lab_tablas_calificacion for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_tablas_calificacion_alta on lab_tablas_calificacion for insert
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
-- Sin update ni delete: una tabla nueva es una versión nueva.

insert into lab_tablas_calificacion (version, sistema, categoria, dias_desde, dias_hasta, fuente)
select 1, s.sistema, c.categoria, c.desde, c.hasta,
       'Superintendencia de Bancos, "Comportamiento del crédito de consumo del sistema financiero nacional" (septiembre de 2019), tabla 5: calificación de la cartera de consumo por días de morosidad'
  from (values ('bancos'), ('cooperativas')) s(sistema)
  cross join lateral (
    select * from (values
      ('A1', 0, 0, 0, 5), ('A2', 1, 8, 6, 20), ('A3', 9, 15, 21, 35), ('B1', 16, 30, 36, 50), ('B2', 31, 45, 51, 65),
      ('C1', 46, 70, 66, 80), ('C2', 71, 90, 81, 95), ('D', 91, 120, 96, 125), ('E', 121, null, 126, null)
    ) v(categoria, b_desde, b_hasta, c_desde, c_hasta)
  ) t
  cross join lateral (select t.categoria,
                             case s.sistema when 'bancos' then t.b_desde else t.c_desde end as desde,
                             case s.sistema when 'bancos' then t.b_hasta else t.c_hasta end as hasta) c;

-- Las categorías cuyo rango entero está en N días o más.
create or replace function lab_categorias_desde(p_version integer, p_sistema text, p_dias integer)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(categoria order by dias_desde), '{}')
    from lab_tablas_calificacion
   where version = p_version and sistema = p_sistema and dias_desde >= p_dias;
$$;

-- Guarda una tabla nueva como la versión siguiente. Pide las nueve
-- categorías de cada sistema, en orden, sin huecos ni cruces: la primera
-- desde 0 días y la última sin tope.
create or replace function lab_guardar_tabla_calificacion(p_filas jsonb, p_fuente text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_version      integer;
  v_escala       text[] := array['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D', 'E'];
  v_sistema      text;
  v_desde        integer;
  v_hasta        integer;
  v_hasta_previa integer;
  v_i            integer;
begin
  if coalesce(trim(p_fuente), '') = '' then raise exception 'Falta decir de dónde sale la tabla (la norma o el documento)'; end if;
  foreach v_sistema in array array['bancos', 'cooperativas'] loop
    v_hasta_previa := null;
    for v_i in 1 .. array_length(v_escala, 1) loop
      v_desde := null;
      v_hasta := null;
      select (f ->> 'dias_desde')::integer, nullif(f ->> 'dias_hasta', '')::integer into v_desde, v_hasta
        from jsonb_array_elements(p_filas) f
       where f ->> 'sistema' = v_sistema and f ->> 'categoria' = v_escala[v_i];
      if v_desde is null then raise exception 'Falta la categoría % de %', v_escala[v_i], v_sistema; end if;
      if v_i = 1 and v_desde <> 0 then raise exception 'En %, A1 tiene que empezar en 0 días', v_sistema; end if;
      if v_i < array_length(v_escala, 1) and v_hasta is null then raise exception 'En %, sólo la última categoría va sin tope', v_sistema; end if;
      if v_i = array_length(v_escala, 1) and v_hasta is not null then raise exception 'En %, E va sin tope', v_sistema; end if;
      if v_hasta is not null and v_hasta < v_desde then raise exception 'En %, % termina antes de empezar', v_sistema, v_escala[v_i]; end if;
      if v_hasta_previa is not null and v_desde <> v_hasta_previa + 1 then
        raise exception 'En %, % tiene que empezar el día siguiente al último de % (%)', v_sistema, v_escala[v_i], v_escala[v_i - 1], v_hasta_previa + 1;
      end if;
      v_hasta_previa := v_hasta;
    end loop;
  end loop;
  if (select count(*) from jsonb_array_elements(p_filas)) <> 2 * array_length(v_escala, 1) then
    raise exception 'La tabla lleva nueve categorías por sistema, ni más ni menos';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from lab_tablas_calificacion;
  insert into lab_tablas_calificacion (version, sistema, categoria, dias_desde, dias_hasta, fuente, creada_por)
  select v_version, f ->> 'sistema', f ->> 'categoria', (f ->> 'dias_desde')::integer, nullif(f ->> 'dias_hasta', '')::integer, trim(p_fuente), auth.uid()
    from jsonb_array_elements(p_filas) f;
  return v_version;
end;
$$;

-- ------------------------------------------------ definición de impago
-- dias_mora_minimo, calificacion_peor_que y retail_monto_minimo quedan de la
-- 094 y ya no se leen: las reemplazan las columnas de abajo.
alter table lab_definiciones_default
  add column dias_mora_mas_de           integer check (dias_mora_mas_de >= 0),
  add column calificaciones_impago      text[],
  add column retail_deuda_mas_de        numeric(14, 2) check (retail_deuda_mas_de >= 0),
  add column dias_observacion           integer check (dias_observacion > 0),
  add column calificaciones_observacion text[],
  add column tabla_calificacion_version integer;

update lab_definiciones_default set
  dias_mora_mas_de = dias_mora_minimo - 1,
  calificaciones_impago = (array['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D', 'E'])[
    array_position(array['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D', 'E'], coalesce(calificacion_peor_que, 'E')) + 1 :],
  retail_deuda_mas_de = retail_monto_minimo - 0.01
 where dias_mora_mas_de is null;

alter table lab_definiciones_default
  alter column dias_mora_mas_de set not null,
  alter column calificaciones_impago set not null,
  alter column retail_deuda_mas_de set not null;

comment on column lab_definiciones_default.dias_mora_mas_de is 'Impago: MÁS de estos días de mora (Basilea: más de 90).';
comment on column lab_definiciones_default.calificaciones_impago is 'Categorías de los bancos que cuentan como impago: las que empiezan después de dias_mora_mas_de en la tabla de calificación.';
comment on column lab_definiciones_default.retail_deuda_mas_de is 'Retail grande: deuda total con la casa comercial de MÁS de este monto (Novadata no trae el monto del crédito).';
comment on column lab_definiciones_default.dias_observacion is 'Lista de observación: este número de días de mora o más dentro del primer año, aunque después se haya puesto al día. null: la definición no la tiene.';

-- Crea una definición con los parámetros del negocio. Las categorías de los
-- bancos salen de la tabla de calificación elegida (la última si no se dice).
create or replace function lab_crear_definicion(
  p_nombre text, p_dias_mas_de integer, p_retail_mas_de numeric, p_dias_observacion integer,
  p_tabla_version integer default null,
  p_cuenta_castigo boolean default true, p_cuenta_reestructuracion boolean default true, p_cuenta_judicial boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tabla integer;
  v_id    uuid;
begin
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Falta el nombre de la definición'; end if;
  if p_dias_mas_de is null or p_dias_mas_de < 0 then raise exception 'Los días del impago van de 0 en adelante'; end if;
  if p_retail_mas_de is null or p_retail_mas_de < 0 then raise exception 'El monto de retail va de 0 en adelante'; end if;
  if p_dias_observacion is not null and (p_dias_observacion < 1 or p_dias_observacion > p_dias_mas_de) then
    raise exception 'La observación va de 1 día hasta los días del impago';
  end if;
  v_tabla := coalesce(p_tabla_version, (select max(version) from lab_tablas_calificacion));
  if v_tabla is null or not exists (select 1 from lab_tablas_calificacion where version = v_tabla) then
    raise exception 'No existe esa versión de la tabla de calificación';
  end if;

  insert into lab_definiciones_default (
    nombre, dias_mora_minimo, calificacion_peor_que, cuenta_castigo, cuenta_reestructuracion, cuenta_judicial, retail_monto_minimo,
    dias_mora_mas_de, calificaciones_impago, retail_deuda_mas_de, dias_observacion, calificaciones_observacion, tabla_calificacion_version, creada_por
  ) values (
    trim(p_nombre), p_dias_mas_de + 1, null, p_cuenta_castigo, p_cuenta_reestructuracion, p_cuenta_judicial, p_retail_mas_de,
    p_dias_mas_de, lab_categorias_desde(v_tabla, 'bancos', p_dias_mas_de + 1), p_retail_mas_de,
    p_dias_observacion, case when p_dias_observacion is null then null else lab_categorias_desde(v_tabla, 'bancos', p_dias_observacion) end,
    v_tabla, auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

select lab_crear_definicion(
  'Negocio 2026-10-06: más de 90 días (Basilea), bancos D o E, retail con deuda de más de USD 500; observación desde 15 días',
  90, 500, 15, 1, true, true, true);

-- --------------------------------------- una operación del buró y la definición
-- El canal cuenta: bancos, cooperativas, y retail sólo con deuda de MÁS del
-- monto (retail grande).
create or replace function lab_operacion_cuenta(p_op jsonb, p_def lab_definiciones_default)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_op ->> 'canal'
           when 'bancos' then 'bancos' = any(p_def.sistemas)
           when 'cooperativas' then 'cooperativas' = any(p_def.sistemas)
           when 'retail' then 'retail_grande' = any(p_def.sistemas) and coalesce((p_op ->> 'saldo')::numeric, 0) > p_def.retail_deuda_mas_de
           else true end;
$$;

-- p_sufijo 'T0': el estado de la misma operación en la consulta del análisis.
create or replace function lab_operacion_en_default(p_op jsonb, p_def lab_definiciones_default, p_sufijo text default '')
returns boolean
language sql
immutable
set search_path = public
as $$
  select lab_operacion_cuenta(p_op, p_def)
     and (coalesce((p_op ->> ('dias' || p_sufijo))::numeric, 0) > p_def.dias_mora_mas_de
          or coalesce(p_op ->> ('calificacion' || p_sufijo) = any(p_def.calificaciones_impago), false)
          or (p_def.cuenta_castigo and coalesce((p_op ->> ('castigo' || p_sufijo))::boolean, false))
          or (p_def.cuenta_judicial and coalesce((p_op ->> ('judicial' || p_sufijo))::boolean, false)));
$$;

create or replace function lab_operacion_en_observacion(p_op jsonb, p_def lab_definiciones_default, p_sufijo text default '')
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_def.dias_observacion is not null and lab_operacion_cuenta(p_op, p_def)
     and (coalesce((p_op ->> ('dias' || p_sufijo))::numeric, 0) >= p_def.dias_observacion
          or coalesce(p_op ->> ('calificacion' || p_sufijo) = any(p_def.calificaciones_observacion), false)
          or lab_operacion_en_default(p_op, p_def, p_sufijo));
$$;

-- Cayó en el año: la operación está en impago y en t0 no lo estaba (una
-- nueva no tiene estado en t0). No cuenta si su fuente no contestó en t0
-- (no se sabe si es nueva) ni si es de una entidad que empezó a reportar en
-- el año (14.9 del diseño).
create or replace function lab_cayo_en_el_anio(p_op jsonb, p_def lab_definiciones_default)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce((p_op ->> 'medidaEnT0')::boolean, true)
     and not coalesce((p_op ->> 'entidadRecienReportada')::boolean, false)
     and lab_operacion_en_default(p_op, p_def)
     and not lab_operacion_en_default(p_op, p_def, 'T0');
$$;

create or replace function lab_observacion_en_el_anio(p_op jsonb, p_def lab_definiciones_default)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce((p_op ->> 'medidaEnT0')::boolean, true)
     and not coalesce((p_op ->> 'entidadRecienReportada')::boolean, false)
     and lab_operacion_en_observacion(p_op, p_def)
     and not lab_operacion_en_observacion(p_op, p_def, 'T0');
$$;

-- ------------------------------------------------------- columnas nuevas
alter table lab_corte_operaciones add column observacion boolean;

alter table lab_corte_solicitudes
  add column observacion        boolean,
  -- El resultado del buró para todos (4. arriba). null en los cortes
  -- anteriores a la 110: ahí vale `malo`.
  add column observable_buro    boolean,
  add column motivo_buro        text,
  add column malo_buro          boolean,
  add column observacion_buro   boolean,
  add column fuentes_no_medidas text[];

-- Las fuentes que la simulación tiró en t1 (para probar el detector con
-- fuentes caídas, como en septiembre: ~9% del IESS, demandas y retail).
alter table lab_simulacion_verdad add column fuentes_caidas text[];

-- ------------------------------------------------------ congelar operaciones
-- lab_congelar_corte de la 099 con la definición nueva y la observación.
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

  insert into lab_cortes (nombre, carga_ids, definicion_default_id, ventana_meses, filtros, es_sintetico, creado_por)
  values (p_nombre, p_cargas, p_definicion, p_ventana, coalesce(p_filtros, '{}'::jsonb), v_tipos[1], auth.uid())
  returning id into v_id;

  insert into lab_corte_operaciones (
    corte_id, operacion_id, carga_id, cedula, producto, monto, fecha_desembolso, incluida, motivo_exclusion, malo,
    fuente_puntaje, puntaje, recomendacion, marco_version, structure_version, veredicto_origen,
    primera_de_la_persona, client_profile_id, analysis_result_id, variables, observacion
  )
  select v_id, o.id, o.carga_id, o.cedula, o.producto, o.monto, o.fecha_desembolso,
         m.motivo is null, m.motivo,
         case when m.motivo is null then imp.impago end,
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
           (select jsonb_object_agg(cv.id, coalesce(rc.perfil_t0, p.standard_profile) #> cv.ruta) from lab_catalogo_variables cv where cv.activa) end,
         -- Observación: el primer año, aunque la ventana del corte sea de 24.
         case when m.motivo is null and v_def.dias_observacion is not null then
           imp.impago
           or coalesce(o.dias_mora_max_12m >= v_def.dias_observacion, false)
           or coalesce(o.peor_calificacion_12m = any(v_def.calificaciones_observacion), false) end
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
    cross join lateral (select (
      coalesce(x.dias > v_def.dias_mora_mas_de, false)
      or coalesce(x.calificacion = any(v_def.calificaciones_impago), false)
      -- El estado de la operación cuenta si el impago cayó dentro de la
      -- ventana (o no se sabe cuándo cayó).
      or (x.dentro and ((v_def.cuenta_castigo and o.estado_operacion = 'castigada')
                     or (v_def.cuenta_reestructuracion and o.estado_operacion = 'reestructurada')
                     or (v_def.cuenta_judicial and o.estado_operacion = 'judicial')))
    ) as impago) imp
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
      'en_observacion', count(*) filter (where incluida and observacion and not malo),
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

-- ------------------------------------------------------ congelar solicitudes
-- La de la 099 con la definición nueva, la disponibilidad de las fuentes, la
-- observación y el resultado del buró para todos.
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
    malo, origen_resultado, donde, recibio_credito_de_otro, fecha_default, cuota_mensual, variables,
    observacion, observable_buro, motivo_buro, malo_buro, observacion_buro, fuentes_no_medidas
  )
  select p_corte, s.id, s.carga_id, s.cedula, s.desembolsada, s.recomendacion, s.puntaje, s.fuente_puntaje,
         m.motivo is null, m.motivo,
         case when m.motivo is not null then null when s.desembolsada then co.malo else b.malo_otros end,
         case when s.desembolsada then 'archivo' else 'buro' end,
         case when m.motivo is not null then null
              when s.desembolsada then case when co.malo then array['credito_institucion'] end
              else b.donde end,
         (rc.resultado ->> 'recibio_credito_de_otro')::boolean,
         case when s.desembolsada and co.malo then o.fecha_primer_default end,
         o.cuota_mensual,
         case when coalesce(rc.perfil_t0, p.standard_profile) is null then null else
           (select jsonb_object_agg(cv.id, coalesce(rc.perfil_t0, p.standard_profile) #> cv.ruta) from lab_catalogo_variables cv where cv.activa) end,
         case when m.motivo is not null or v_def.dias_observacion is null then null
              when s.desembolsada then co.observacion
              else b.malo_otros or b.observacion_otros end,
         mb.motivo is null,
         mb.motivo,
         -- El crédito de la institución, si el buró no lo trae, se lee del
         -- archivo: sin eso, un desembolsado que sólo cayó con nosotros
         -- pasaría por bueno.
         case when mb.motivo is null then
           b.malo_otros or (s.desembolsada and coalesce(b.malo_institucion, co.malo, false)) end,
         case when mb.motivo is null and v_def.dias_observacion is not null then
           b.malo_otros or b.observacion_otros
           or (s.desembolsada and coalesce(b.malo_institucion or b.observacion_institucion, co.observacion, co.malo, false)) end,
         nm.no_medidas
    from lab_solicitudes s
    left join lab_reconsultas rc on rc.solicitud_id = s.id
    left join lab_operaciones o on o.id = s.operacion_id
    left join lab_corte_operaciones co on co.corte_id = p_corte and co.operacion_id = s.operacion_id
    left join client_profiles p on p.id = s.client_profile_id
    cross join lateral (select
      case when rc.resultado -> 'disponibilidad' is null then null
           else array(select jsonb_array_elements_text(rc.resultado -> 'disponibilidad' -> 'noContestaron')) end as no_medidas,
      -- Las reconsultas procesadas antes de la 110 no dicen qué fuentes
      -- contestaron: se toman como medidas, igual que entonces.
      coalesce((rc.resultado -> 'disponibilidad' ->> 'buroMedido')::boolean, true) as buro_medido
    ) nm
    cross join lateral (
      select
        coalesce(bool_or(lab_cayo_en_el_anio(op, v_def)) filter (where not coalesce((op ->> 'deLaInstitucion')::boolean, false)), false) as malo_otros,
        coalesce(bool_or(lab_observacion_en_el_anio(op, v_def)) filter (where not coalesce((op ->> 'deLaInstitucion')::boolean, false)), false) as observacion_otros,
        bool_or(lab_cayo_en_el_anio(op, v_def)) filter (where coalesce((op ->> 'deLaInstitucion')::boolean, false)) as malo_institucion,
        bool_or(lab_observacion_en_el_anio(op, v_def)) filter (where coalesce((op ->> 'deLaInstitucion')::boolean, false)) as observacion_institucion,
        nullif(array_remove(array[
          case when bool_or(lab_cayo_en_el_anio(op, v_def)) filter (where coalesce((op ->> 'nueva')::boolean, false) and not coalesce((op ->> 'deLaInstitucion')::boolean, false)) then 'credito_nuevo' end,
          case when bool_or(lab_cayo_en_el_anio(op, v_def)) filter (where not coalesce((op ->> 'nueva')::boolean, false)) then 'credito_previo' end
        ], null), '{}') as donde
      from jsonb_array_elements(
        -- Antes de la 110 el procesamiento guardaba sólo los créditos nuevos y
        -- los deterioros; desde la 110, cada operación con su estado en t0.
        case when rc.resultado -> 'buro' ? 'operaciones' then rc.resultado -> 'buro' -> 'operaciones'
             else coalesce((select jsonb_agg(c || jsonb_build_object('nueva', true)) from jsonb_array_elements(rc.resultado -> 'buro' -> 'creditosNuevos') c), '[]'::jsonb)
               || coalesce((select jsonb_agg(d || jsonb_build_object('nueva', false)) from jsonb_array_elements(rc.resultado -> 'buro' -> 'deterioros') d), '[]'::jsonb)
        end) op
    ) b
    cross join lateral (select case
      when rc.id is null then 'sin reconsulta'
      when rc.procesada_en is null then 'reconsulta sin procesar'
      when s.desembolsada and co.operacion_id is null then 'la operación no está en el corte'
      when s.desembolsada and not co.incluida then 'operación excluida: ' || co.motivo_exclusion
      when not s.desembolsada and not nm.buro_medido then 'el buró no contestó en t0 o en t1'
      -- Sin crédito con nadie no hay nada que observar: ni pagó ni cayó.
      when not s.desembolsada and not coalesce((rc.resultado ->> 'recibio_credito_de_otro')::boolean, false)
           and jsonb_array_length(coalesce(rc.resultado -> 'entidades_t0', '[]')) = 0 then 'sin crédito con nadie: no se puede observar'
    end as motivo) m
    cross join lateral (select case
      when rc.id is null then 'sin reconsulta'
      when rc.procesada_en is null then 'reconsulta sin procesar'
      when not nm.buro_medido then 'el buró no contestó en t0 o en t1'
      when s.desembolsada and b.malo_institucion is null and co.malo is null then 'el crédito de la institución no se ve: ni en el buró ni en el corte'
      when not s.desembolsada and not coalesce((rc.resultado ->> 'recibio_credito_de_otro')::boolean, false)
           and jsonb_array_length(coalesce(rc.resultado -> 'entidades_t0', '[]')) = 0 then 'sin crédito con nadie: no se puede observar'
    end as motivo) mb
   where s.carga_id = any(v_corte.carga_ids);

  select jsonb_build_object(
    'solicitudes', count(*),
    'desembolsadas', count(*) filter (where desembolsada),
    'incluidas', count(*) filter (where incluida),
    'malos', count(*) filter (where incluida and malo),
    'en_observacion', count(*) filter (where incluida and observacion and not malo),
    'observables_buro', count(*) filter (where observable_buro),
    'malos_buro', count(*) filter (where observable_buro and malo_buro),
    'buro_sin_contestar', count(*) filter (where motivo_buro = 'el buró no contestó en t0 o en t1'),
    'excluidas', coalesce((select jsonb_object_agg(motivo_exclusion, n) from (
        select motivo_exclusion, count(*) as n from lab_corte_solicitudes
         where corte_id = p_corte and not incluida group by motivo_exclusion) e), '{}'::jsonb))
    into v_res
    from lab_corte_solicitudes where corte_id = p_corte;
  update lab_cortes set resumen = coalesce(resumen, '{}'::jsonb) || jsonb_build_object('solicitudes', v_res) where id = p_corte;
  return v_res;
end;
$$;

-- ------------------------------------------------------------ variables
-- La de la 106 con una sola diferencia: la población de solicitudes se mide
-- con el buró para todos (malo_buro). En un corte anterior a la 110 vale
-- `malo`, como entonces.
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
          select case when observable_buro is null then malo else malo_buro end from lab_corte_solicitudes
           where p_poblacion = 'solicitudes' and corte_id = p_corte and variables is not null
             and case when observable_buro is null then incluida and malo is not null else observable_buro and malo_buro is not null end) f;
  if v_b = 0 or v_m = 0 then raise exception 'El corte no tiene buenos y malos con perfil en esa población'; end if;

  with filas as (
    select malo, variables from lab_corte_operaciones
     where p_poblacion = 'operaciones' and corte_id = p_corte and incluida and primera_de_la_persona and variables is not null
    union all
    select case when observable_buro is null then malo else malo_buro end, variables from lab_corte_solicitudes
     where p_poblacion = 'solicitudes' and corte_id = p_corte and variables is not null
       and case when observable_buro is null then incluida and malo is not null else observable_buro and malo_buro is not null end
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
  ), valores as (
    -- Los valores distintos de lo que va en cuartiles y cuántas personas tiene cada uno.
    select var, num, count(*) as c from marcado where en_cuartiles group by var, num
  ), masas as (
    select v.*, v.c >= sum(v.c) over (partition by v.var) / 4.0 as masa from valores v
  ), islas as (
    -- Los valores entre dos masas comparten el número de isla.
    select m.*, sum(case when m.masa then 1 else 0 end) over (partition by m.var order by m.num) as isla from masas m
  ), segmentos as (
    select var, isla, sum(c) as s_n from islas where not masa group by var, isla
  ), reparto as (
    select s.var, s.isla, s.s_n,
           greatest(1, round(greatest(count(*) over (partition by s.var),
                                      4 - (select count(*) from islas i2 where i2.var = s.var and i2.masa))
                             * s.s_n / sum(s.s_n) over (partition by s.var)))::int as b
      from segmentos s
  ), asignado as (
    select i.var, i.num,
           case when i.masa then 'm' || i.num::text
                else 's' || i.isla || '_' || least(r.b - 1, floor((sum(i.c) over (partition by i.var, i.isla, i.masa order by i.num) - i.c) * r.b / r.s_n::numeric))::int
           end as tramo
      from islas i left join reparto r on r.var = i.var and r.isla = i.isla and not i.masa
  ), conbin as (
    select m.*, case
        when m.txt is null then 'sin dato'
        when not m.en_cuartiles and (m.tipo <> 'numero' or m.distintos <= 6) then m.txt
        when not m.en_cuartiles then '0'
        else a.tramo end as bin
      from marcado m left join asignado a on a.var = m.var and a.num = m.num and m.en_cuartiles
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
             'tramo', case when bin like 's%' or bin like 'm%' then case when desde = hasta then desde::text else desde::text || ' a ' || hasta::text end else bin end,
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
        case when p_poblacion = 'solicitudes' then 'Todas las solicitudes, con el resultado del buró para todos (también para los que recibieron nuestro crédito): un crédito nuevo o uno que ya tenían que cayó en el año.' end,
        case when v_corte.es_sintetico then 'Corte sintético: tiene que encontrar las variables de la regla plantada.' end
      ], null)),
    'variables', v_res);

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'variables',
          jsonb_build_object('version', 4, 'poblacion', p_poblacion,
                             'resultado', case when p_poblacion = 'solicitudes' then 'el del buró para todos (malo_buro)' else 'el del archivo de la institución' end,
                             'iv', 'WoE con suavizado 0,5; cuartiles sobre valores distintos (un empate nunca se parte; un valor con un cuarto o más de las personas va en su propio tramo); tramo propio para el cero si es 10% o más; una persona una vez',
                             'umbrales', jsonb_build_object('nada', 0.02, 'debil', 0.1, 'media', 0.3, 'sospecha_de_fuga', 0.5)),
          v_res, (v_b + v_m)::integer, v_m::integer, auth.uid());
  return v_res;
end;
$$;

-- ------------------------------------------------------------ matriz
-- La de la 100 con una sola lectura, la del negocio (decisión 3): negar (y
-- el bloqueo) = impago; aprobar y revisar = no impago. Más los que quedaron
-- en observación sin llegar al impago, por recomendación.
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
        'recomendacion', rec, 'n', n, 'malos', malos, 'tasa', round(malos::numeric / n, 4), 'intervalo', lab_wilson(malos, n),
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

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'matriz',
          jsonb_build_object('version', 2, 'lecturas', 'una: negar y bloqueado = impago; aprobar y revisar = no impago (decisión del negocio del 2026-10-06)'),
          v_res, (v_res ->> 'n')::integer, (v_res ->> 'n_malos')::integer, auth.uid());
  return v_res;
end;
$$;

-- ------------------------------------------------------------- motivos
-- Los de la 107 con "revisar" = no impago: "el modelo lo vio" es sólo negar
-- (o el bloqueo). Un revisar que cayó ya no es un acierto ni una advertencia.
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
    select solicitud_id, 'el_modelo_lo_vio', null, 3 from base
     where malo and recomendacion in ('negar', 'bloqueado')
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
           when recomendacion in ('negar', 'bloqueado') then 'el_modelo_lo_vio'
           when motivos && array['cuota_no_cabia', 'capacidad_no_medible'] then 'anticipable_no_visto'
           when principal = 'sin_causa_visible' then 'sin_causa_visible'
           when variables ->> 'estado_ingreso' is distinct from 'confirmada'
             or coalesce((variables ->> 'continuidad_laboral_meses')::numeric, 0) < 12
             or coalesce((variables ->> 'deuda_en_atraso')::numeric, 0) > 0 then 'vulnerabilidad_visible'
           else 'no_anticipable' end,
         empezo_afuera
    from por_malo;
$$;

-- El agregado de la 107; cambia sólo la versión de la clasificación.
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
                             'el_modelo_lo_vio', 'dijo negar (o el bloqueo); revisar = no impago',
                             'vulnerabilidad_visible', 'golpe posterior con ingreso sin confirmar, continuidad menor a 12 meses o deuda en atraso en t0', 'version_clasificacion', 3),
          v_res, (v_res ->> 'n')::integer, (v_res ->> 'n_malos')::integer, auth.uid());
  return v_res;
end;
$$;
