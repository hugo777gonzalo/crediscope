-- 132 · Con buró, las marcas de Monitoreo salen de sus días de mora
--
-- Equifax no trae la calificación de la Superintendencia (A1 a E): el negocio
-- aceptó los días de mora en su lugar (2026-10-16) y aprobó lo recomendado en
-- docs/propuesta-dias-de-mora-con-buro.md, sección 4. Para la persona con una
-- consulta vigente del buró de la institución, las dos marcas que Monitoreo
-- lee de resumen_por_persona (124) salen del buró y no de Novadata: un tema,
-- una fuente.
-- - calificacion_baja: más de 90 días de mora en bancos como titular. Es el
--   equivalente exacto de D o E: en la tabla de la Superintendencia para
--   consumo (110), D empieza a los 91 días.
-- - tiene_mora: el mismo monto en atraso que con Novadata, en bancos o
--   cooperativas como titular.
-- - consulta_buro_id: la consulta de la que salieron. null: Novadata.
--
-- Medido sin gasto sobre las 62 personas con consulta, con perfiles de
-- Novadata de 8 a 14 días antes. D o E: 2 y 2, las mismas personas. Mora: 7 y
-- 6; la diferencia es una persona en la que Equifax ve días de mora de 30 o
-- menos, todavía sin monto vencido. Se repite con
-- scripts/medir-dias-de-mora-con-buro.mjs.
--
-- La definición de impago del Laboratorio no cambia: ya juzga por días a la
-- operación que trae días (la propuesta, sección 3).
--
-- La vigencia caduca sin que cambie nada en la base: el 18 a las 00:00 de
-- Ecuador. La reconstrucción de cada noche (00:10, pg_cron
-- resumenes-crediscope, 124) devuelve esas personas a Novadata diez minutos
-- después.
--
-- Al aplicarla, la bandeja y Monitoreo esperan unos segundos: el cambio de
-- la tabla bloquea la lectura hasta que termina la reconstrucción del final.


-- ---------- La vigencia de un buró que cobra por consulta ----------
-- La regla de _shared/vigencia-mensual.ts (corteVigente): una consulta vale
-- hasta el 17 y el 18 a las 00:00 de Ecuador caduca todo. SQL no puede
-- importar el TypeScript, así que ésta es la única copia posible: el bloque de
-- abajo comprueba que da lo mismo en las fechas de vigencia-mensual.test.ts.
-- Si cambia una, cambia la otra.
create or replace function corte_vigente_mensual(p_ahora timestamptz default now())
returns timestamptz
language sql
stable
as $$
  -- Diecisiete días antes cae en el mes del ciclo: el 18 de ese mes es el corte.
  select (date_trunc('month', (p_ahora at time zone 'America/Guayaquil') - interval '17 days') + interval '17 days')
         at time zone 'America/Guayaquil';
$$;

do $$
begin
  if corte_vigente_mensual('2026-10-20T15:00:00Z') <> '2026-10-18T05:00:00Z'::timestamptz
     or corte_vigente_mensual('2026-10-05T15:00:00Z') <> '2026-09-18T05:00:00Z'::timestamptz
     or corte_vigente_mensual('2026-01-10T12:00:00Z') <> '2025-12-18T05:00:00Z'::timestamptz
     -- Una consulta del 20 vale hasta el 17 del mes siguiente, y el 18 a las 00:00 caduca.
     or not ('2026-10-20T15:00:00Z'::timestamptz >= corte_vigente_mensual('2026-11-17T23:59:59-05:00'))
     or '2026-10-20T15:00:00Z'::timestamptz >= corte_vigente_mensual('2026-11-18T00:00:00-05:00')
     -- Una del 16 caduca el 18 aunque sea de dos días antes.
     or not ('2026-10-16T12:00:00-05:00'::timestamptz >= corte_vigente_mensual('2026-10-17T23:59:59-05:00'))
     or '2026-10-16T12:00:00-05:00'::timestamptz >= corte_vigente_mensual('2026-10-18T00:00:00-05:00')
     -- A las 20:00 de Ecuador del 17 la fecha UTC ya es la del 18, y sigue vigente.
     or not ('2026-10-10T12:00:00Z'::timestamptz >= corte_vigente_mensual('2026-10-18T01:00:00Z'))
  then
    raise exception 'corte_vigente_mensual() no da lo mismo que _shared/vigencia-mensual.ts';
  end if;
end;
$$;

-- La consulta vigente del buró de la institución de una persona: la regla de
-- buroVigenteDeLaPersona() (_shared/buro-de-la-institucion.ts), la misma que
-- usa el perfil del modelo en marco-v31:
-- - el buró de la base es Equifax (proveedores.es_buro, 129). Con Aval
--   todavía no hay lectura, igual que en el modelo;
-- - de producción, contestada y con su estructura calculada (126);
-- - la más reciente hasta p_ahora, y nada si ésa ya no está vigente o vino
--   por otra persona (no se busca una anterior: el TypeScript tampoco).
-- Devuelve sólo lo que se lee: devolver la fila entera arrastraría la
-- respuesta cruda. Sin `set search_path` para que se pueda incrustar en la
-- consulta que la llama; por eso los nombres llevan el esquema.
create or replace function buro_vigente_de_la_persona(p_client_id uuid, p_ahora timestamptz default now())
returns table (id uuid, created_at timestamptz, estructura jsonb)
language sql
stable
as $$
  select u.id, u.created_at, u.estructura
    from (
      select ce.id, ce.created_at, ce.estructura
        from public.consultas_equifax ce
       where ce.client_id = p_client_id
         and ce.ambiente = 'produccion'
         and ce.http_equifax = 200
         and ce.estructura is not null
         and ce.created_at <= p_ahora
         and exists (select 1 from public.proveedores pr where pr.clave = 'equifax' and pr.es_buro)
       order by ce.created_at desc, ce.id desc
       limit 1
    ) u
   where u.created_at >= public.corte_vigente_mensual(p_ahora)
     and coalesce(u.estructura #>> '{consulta,identidadVerificada}', '') <> 'false';
$$;

revoke all on function corte_vigente_mensual(timestamptz) from public, anon, authenticated;
revoke all on function buro_vigente_de_la_persona(uuid, timestamptz) from public, anon, authenticated;
grant execute on function corte_vigente_mensual(timestamptz) to service_role;
grant execute on function buro_vigente_de_la_persona(uuid, timestamptz) to service_role;


-- ---------- Cómo estaba ----------
-- Se rehace con la regla de antes, para comparar al final sólo lo que cambia
-- esta migración (y no una fila que un disparador haya dejado vieja).
do $$
declare
  v jsonb;
begin
  v := reconstruir_resumen_por_persona();
  if (v ->> 'fallas')::int > 0 then
    raise exception 'El resumen no se pudo rehacer con la regla de antes para % personas', v ->> 'fallas';
  end if;
end;
$$;

create temp table _resumen_antes on commit drop as
  select client_id, calificacion_baja, tiene_mora from resumen_por_persona;


-- ---------- resumen_por_persona ----------
alter table resumen_por_persona
  add column consulta_buro_id uuid references consultas_equifax(id) on delete set null;

comment on column resumen_por_persona.consulta_buro_id is
  'La consulta vigente del buró de la institución de la que salen calificacion_baja y tiene_mora (132). null: salen del último perfil de Novadata.';

-- La de la 124 tomada de la base viva, con las dos marcas leídas del buró
-- cuando hay una consulta vigente y la columna nueva.
CREATE OR REPLACE FUNCTION public.refrescar_resumen_por_persona(p_clientes uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from resumen_por_persona r
   where r.client_id = any(p_clientes)
     and not exists (select 1 from clients c where c.id = r.client_id);

  insert into resumen_por_persona as r (
    client_id, cedula, ingreso_at, es_sintetico, nombre, edad, provincia,
    perfil_id, perfil_at, perfil_origen, lote_id, structure_version,
    fuente_segmento, fuente_piso_ingreso, fuente_estado, fuente_corte,
    empleos_vigentes, consultas, analisis_id, analisis_at, score,
    recomendacion, indicador_riesgo, indicador_historial, rules_version,
    fallo_tipo, veredicto_origen, ultima_actividad, estado,
    hallazgos_control, tiene_bloqueante, ejes_ok, consulta_util, fuentes_ok,
    indicios_ingreso, perfil_laboral, fuentes_ingreso, tiene_demanda_cobro,
    calificacion_baja, tiene_mora, bloqueo_activo, es_independiente,
    empleo_vigente, es_jubilado, es_pensionista, respaldo_patrimonial,
    valor_colateral, analisis_ok_id, score_ok, recomendacion_ok,
    actualizado_en, consulta_buro_id
  )
  select
    c.id, c.cedula, c.created_at, c.es_sintetico,
    p.sp -> 'identidad' ->> 'nombreCompleto',
    (p.sp -> 'identidad' ->> 'edad')::integer,
    p.sp -> 'identidad' ->> 'provinciaNacimiento',
    p.id, p.created_at, p.origen, p.lote_id, p.structure_version,
    p.fuente_segmento, p.fuente_piso_ingreso, p.fuente_estado, p.fuente_corte,
    case
      when jsonb_typeof(p.sp -> 'laboral' -> 'empleosActuales') = 'array'
        then jsonb_array_length(p.sp -> 'laboral' -> 'empleosActuales')
      when jsonb_typeof(p.sp -> 'laboral' -> 'empleoActual') = 'object' then 1
      else 0
    end,
    coalesce(n.consultas, 0),
    a.id, a.created_at,
    case when a.fallo_tipo is null then a.crediscope_score end,
    case when a.fallo_tipo is null then a.recomendacion end,
    a.indicador_riesgo, a.indicador_historial, a.rules_version, a.fallo_tipo, a.veredicto_origen,
    greatest(coalesce(a.created_at, c.created_at), coalesce(p.created_at, c.created_at)),
    case
      when p.id is null then 'sin_consulta'
      when coalesce(p.fuentes_ok, p.ejes_ok, 0) = 0 then 'consulta_fallida'
      when a.id is null then 'sin_analisis'
      when a.fallo_tipo is not null then 'no_completado'
      else 'analizado'
    end,
    coalesce(jsonb_array_length(p.control_bloqueo -> 'hallazgos'), 0),
    coalesce((select bool_or((h.value ->> 'bloqueante')::boolean)
                from jsonb_array_elements(coalesce(p.control_bloqueo -> 'hallazgos', '[]'::jsonb)) h(value)), false),
    coalesce(p.ejes_ok, 0),
    coalesce(p.fuentes_ok, p.ejes_ok, 0) > 0,
    p.fuentes_ok,
    p.indicios_ingreso,
    p.perfil_laboral,
    p.sp -> 'fuentesIngreso',
    (p.sp -> 'riesgoJudicialCrediticio' ->> 'numeroDemandasComoDemandado')::int > 0,
    -- Con una consulta vigente del buró (132): más de 90 días de mora en
    -- bancos como titular, que es D o E en la tabla de la Superintendencia
    -- para consumo (D empieza a los 91 días). Diners va dentro de bancos en
    -- Equifax, como en Novadata. Un grupo que Equifax no trajo queda sin medir
    -- (null), no en falso.
    case when b.id is not null then
      case when jsonb_typeof(b.estructura #> '{deudaActualTitular,bancos}') = 'object'
        then coalesce((b.estructura #>> '{deudaActualTitular,bancos,maximoDiasDeMora}')::numeric, 0) > 90 end
    else p.sp -> 'comportamientoBancario' ->> 'peorCalificacionRiesgo' in ('D', 'E') end,
    -- Con buró, el mismo monto en atraso que con Novadata (vencido, no
    -- devenga, demanda o castigo), en bancos o cooperativas como titular. No
    -- los días: Equifax marca días de mora sin monto hasta los 30 días (16 de
    -- las 62 personas con consulta el 2026-10-16), y la marca diría otra cosa
    -- que con Novadata.
    case when b.id is not null then
      (select bool_or(coalesce((b.estructura #>> array['deudaActualTitular', sistema, campo])::numeric, 0) > 0)
         from unnest(array['bancos', 'cooperativas']) sistema,
              unnest(array['saldoVencidoUsd', 'saldoNoDevengaInteresesUsd', 'saldoDemandaJudicialUsd', 'saldoCarteraCastigadaUsd']) campo
        where jsonb_typeof(b.estructura #> array['deudaActualTitular', sistema]) = 'object')
    else coalesce((p.sp -> 'comportamientoBancario' ->> 'deudaEnAtraso')::numeric,
                  (p.sp -> 'comportamientoBancario' ->> 'saldoEnMoraBuroCredito')::numeric, 0) > 0
           or coalesce((p.sp -> 'comportamientoCooperativas' ->> 'saldoEnMora')::numeric, 0) > 0 end,
    (p.control_bloqueo ->> 'bloqueado')::boolean,
    (p.sp -> 'laboral' ->> 'esIndependiente')::boolean,
    -- Las dos formas del dato: `empleoActual` (antes de marco-v20) y
    -- `empleosActuales`.
    jsonb_typeof(p.sp -> 'laboral' -> 'empleoActual') = 'object'
      or jsonb_array_length(coalesce(p.sp -> 'laboral' -> 'empleosActuales', '[]'::jsonb)) > 0,
    (p.sp -> 'seguridadSocial' ->> 'esJubilado')::boolean,
    (p.sp -> 'seguridadSocial' ->> 'esPensionista')::boolean,
    (p.sp -> 'patrimonio' ->> 'tieneVehiculos')::boolean
      or coalesce((p.sp -> 'patrimonio' ->> 'numeroInmuebles')::int, 0) > 0,
    (p.sp -> 'patrimonio' ->> 'valorColateralVehiculos')::numeric,
    k.id, k.crediscope_score, k.recomendacion,
    now(),
    b.id
  from clients c
  left join lateral (
    -- `|| '{}'` deja el perfil descomprimido en memoria una sola vez: cada
    -- `->` sobre la columna lo descomprimiría de nuevo.
    select cp.id, cp.created_at, cp.origen, cp.lote_id, cp.structure_version,
           cp.ejes_ok, cp.fuentes_ok, cp.fuente_segmento, cp.fuente_piso_ingreso,
           cp.fuente_estado, cp.fuente_corte, cp.control_bloqueo,
           cp.indicios_ingreso, cp.perfil_laboral,
           cp.standard_profile || '{}'::jsonb as sp
      from client_profiles cp
     where cp.client_id = c.id
     order by cp.created_at desc
     limit 1
  ) p on true
  left join lateral (
    select count(*) as consultas from client_profiles cp where cp.client_id = c.id
  ) n on true
  left join lateral (
    select ar.id, ar.created_at, ar.crediscope_score, ar.recomendacion,
           ar.indicador_riesgo, ar.indicador_historial, ar.rules_version,
           ar.fallo_tipo, ar.veredicto_origen
      from analysis_results ar
     where ar.client_id = c.id
     order by ar.created_at desc
     limit 1
  ) a on true
  left join lateral (
    select ar.id, ar.crediscope_score, ar.recomendacion
      from analysis_results ar
     where ar.client_id = c.id and ar.fallo_tipo is null
     order by ar.created_at desc
     limit 1
  ) k on true
  -- La consulta vigente del buró de la institución, sólo para quien tiene un
  -- perfil: las marcas son de lo que se sabe de la persona, como sin buró.
  left join lateral (
    select v.id, v.estructura from buro_vigente_de_la_persona(c.id) v where p.id is not null
  ) b on true
  where c.id = any(p_clientes)
  on conflict (client_id) do update set
    cedula = excluded.cedula,
    ingreso_at = excluded.ingreso_at,
    es_sintetico = excluded.es_sintetico,
    nombre = excluded.nombre,
    edad = excluded.edad,
    provincia = excluded.provincia,
    perfil_id = excluded.perfil_id,
    perfil_at = excluded.perfil_at,
    perfil_origen = excluded.perfil_origen,
    lote_id = excluded.lote_id,
    structure_version = excluded.structure_version,
    fuente_segmento = excluded.fuente_segmento,
    fuente_piso_ingreso = excluded.fuente_piso_ingreso,
    fuente_estado = excluded.fuente_estado,
    fuente_corte = excluded.fuente_corte,
    empleos_vigentes = excluded.empleos_vigentes,
    consultas = excluded.consultas,
    analisis_id = excluded.analisis_id,
    analisis_at = excluded.analisis_at,
    score = excluded.score,
    recomendacion = excluded.recomendacion,
    indicador_riesgo = excluded.indicador_riesgo,
    indicador_historial = excluded.indicador_historial,
    rules_version = excluded.rules_version,
    fallo_tipo = excluded.fallo_tipo,
    veredicto_origen = excluded.veredicto_origen,
    ultima_actividad = excluded.ultima_actividad,
    estado = excluded.estado,
    hallazgos_control = excluded.hallazgos_control,
    tiene_bloqueante = excluded.tiene_bloqueante,
    ejes_ok = excluded.ejes_ok,
    consulta_util = excluded.consulta_util,
    fuentes_ok = excluded.fuentes_ok,
    indicios_ingreso = excluded.indicios_ingreso,
    perfil_laboral = excluded.perfil_laboral,
    fuentes_ingreso = excluded.fuentes_ingreso,
    tiene_demanda_cobro = excluded.tiene_demanda_cobro,
    calificacion_baja = excluded.calificacion_baja,
    tiene_mora = excluded.tiene_mora,
    bloqueo_activo = excluded.bloqueo_activo,
    es_independiente = excluded.es_independiente,
    empleo_vigente = excluded.empleo_vigente,
    es_jubilado = excluded.es_jubilado,
    es_pensionista = excluded.es_pensionista,
    respaldo_patrimonial = excluded.respaldo_patrimonial,
    valor_colateral = excluded.valor_colateral,
    analisis_ok_id = excluded.analisis_ok_id,
    score_ok = excluded.score_ok,
    recomendacion_ok = excluded.recomendacion_ok,
    actualizado_en = excluded.actualizado_en,
    consulta_buro_id = excluded.consulta_buro_id;
end;
$function$;


-- ---------- Que no quede vieja ----------
-- Una consulta nueva, una estructura rehecha (equifax_reemplazar_tablas()) o
-- una consulta borrada (la supresión de un titular, 115) cambian las marcas de
-- esa persona. La misma función de los otros disparadores de la 124: al
-- insertar o actualizar, un fallo no frena (una consulta paga no se pierde
-- por el resumen); al borrar, sí.
create trigger resumen_tras_insertar_consulta_equifax after insert on consultas_equifax
  referencing new table as nuevas for each statement execute function resumen_por_persona_al_cambiar();
create trigger resumen_tras_actualizar_consulta_equifax after update on consultas_equifax
  referencing old table as viejas new table as nuevas for each statement execute function resumen_por_persona_al_cambiar();
create trigger resumen_tras_borrar_consulta_equifax after delete on consultas_equifax
  referencing old table as viejas for each statement execute function resumen_por_persona_al_cambiar();

-- Elegir otro buró (o ninguno) cambia de fuente a todas las personas con una
-- consulta de Equifax. elegir_buro() hace dos actualizaciones (apaga y prende):
-- se rehacen dos veces, unas decenas de personas.
create or replace function resumen_por_persona_al_cambiar_el_buro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clientes uuid[];
begin
  if not exists (select 1 from nuevas n join viejas v using (clave) where n.es_buro is distinct from v.es_buro) then
    return null;
  end if;
  select array_agg(distinct ce.client_id) into v_clientes
    from consultas_equifax ce
   where ce.client_id is not null and ce.ambiente = 'produccion';
  if v_clientes is null then
    return null;
  end if;
  begin
    perform refrescar_resumen_por_persona(v_clientes);
  exception when others then
    raise warning 'resumen_por_persona: al cambiar el buró (% personas): %', cardinality(v_clientes), sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function resumen_por_persona_al_cambiar_el_buro() from public, anon, authenticated;

create trigger resumen_tras_cambiar_el_buro after update on proveedores
  referencing old table as viejas new table as nuevas for each statement execute function resumen_por_persona_al_cambiar_el_buro();


-- ---------- Monitoreo ----------
-- La de la 124 tomada de la base viva. Cambia sólo el nombre de la marca: con
-- buró ya no es una calificación (decisión 3 de la propuesta).
CREATE OR REPLACE FUNCTION public.metricas_gerenciales()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with perfil as (
  -- El último perfil de cada persona, sin las sintéticas (118), del resumen (124).
  select * from resumen_por_persona where perfil_id is not null and not es_sintetico
),
analisis as (
  -- El último análisis que terminó, de cada persona.
  select score_ok as crediscope_score, recomendacion_ok as recomendacion
  from resumen_por_persona where analisis_ok_id is not null
),
cartera as (
  -- Las consultas, no las personas: la actividad mide el volumen de trabajo.
  -- Sin las sintéticas (118). Sólo columnas chicas: nada de standard_profile.
  select cp.created_at, cp.requested_by, cp.duracion_ms from client_profiles cp
  where not exists (select 1 from clients c where c.id = cp.client_id and c.es_sintetico)
),
base as (
  select
    (select count(*) from perfil)   as total_clientes,
    (select count(*) from analisis) as total_analizados
)
select jsonb_build_object(
  'totalClientes', b.total_clientes,
  'totalAnalizados', b.total_analizados,
  'scorePromedio', (select round(avg(crediscope_score)) from analisis),

  'distribucionScore', jsonb_build_object(
    'bueno', (select count(*) from analisis where crediscope_score >= 700),
    'medio', (select count(*) from analisis where crediscope_score >= 400 and crediscope_score < 700),
    'malo',  (select count(*) from analisis where crediscope_score < 400)
  ),

  -- Los análisis anteriores a marco-v14 no tienen recomendación: van
  -- aparte para no inflar ninguna categoría con datos que no existen.
  'distribucionRecomendacion', jsonb_build_object(
    'aprobar',  (select count(*) from analisis where recomendacion = 'aprobar'),
    'revisar',  (select count(*) from analisis where recomendacion = 'revisar'),
    'observar', (select count(*) from analisis where recomendacion = 'observar'),
    'negar',    (select count(*) from analisis where recomendacion = 'negar'),
    'sinDato',  (select count(*) from analisis where recomendacion is null)
  ),

  'riesgo', (
    select jsonb_agg(x order by orden) from (
      select 1 as orden, jsonb_build_object('etiqueta', 'Con demanda de cobro/crediticia',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end) as x
      from (select count(*) as n from perfil where tiene_demanda_cobro) t
      union all
      select 2, jsonb_build_object('etiqueta', 'Más de 90 días de mora en bancos (D o E)',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil where calificacion_baja) t
      union all
      select 3, jsonb_build_object('etiqueta', 'Mora bancaria o en cooperativas',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil where tiene_mora) t
      union all
      select 4, jsonb_build_object('etiqueta', 'Control de bloqueo activo',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil where bloqueo_activo) t
    ) s
  ),

  'laboral', (
    select jsonb_agg(x order by orden) from (
      select 1 as orden, jsonb_build_object('etiqueta', 'Independientes',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end) as x
      from (select count(*) as n from perfil where es_independiente) t
      union all
      select 2, jsonb_build_object('etiqueta', 'Dependientes (empleo vigente)',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil where empleo_vigente) t
      union all
      select 3, jsonb_build_object('etiqueta', 'Jubilados',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil where es_jubilado) t
      union all
      select 4, jsonb_build_object('etiqueta', 'Pensionistas',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil where es_pensionista) t
    ) s
  ),

  'patrimonio', (
    select jsonb_build_object(
      'conRespaldoPatrimonial', n,
      'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end,
      'valorColateralTotal', (select coalesce(sum(valor_colateral), 0) from perfil)
    )
    from (select count(*) as n from perfil where respaldo_patrimonial) t
  ),

  -- Actividad: sobre TODAS las consultas, no deduplicadas. Deduplicar
  -- acá escondería el volumen real de trabajo, que es justo lo que esta
  -- sección mide.
  'consultasPorMes', (
    select coalesce(jsonb_agg(jsonb_build_object('clave', clave, 'etiqueta', etiqueta, 'total', total) order by clave), '[]'::jsonb)
    from (
      select
        to_char(m, 'YYYY-MM')                                          as clave,
        -- El nombre del mes a mano y no con to_char: el idioma del
        -- servidor es inglés y salían "apr 26", "aug 26" en un tablero
        -- que está entero en castellano.
        (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from m)]
          || ' ' || to_char(m, 'YY')                                   as etiqueta,
        (select count(*) from cartera cp
          where date_trunc('month', cp.created_at at time zone 'America/Guayaquil') = m) as total
      from generate_series(
        date_trunc('month', (now() at time zone 'America/Guayaquil') - interval '5 months'),
        date_trunc('month', (now() at time zone 'America/Guayaquil')),
        interval '1 month'
      ) m
    ) t
  ),

  'actividadPorAnalista', (
    select coalesce(jsonb_agg(jsonb_build_array(nombre, n) order by n desc), '[]'::jsonb)
    from (
      select coalesce(pr.nombre_corto, 'Sin asignar') as nombre, count(*) as n
      from cartera cp
      left join profiles pr on pr.id = cp.requested_by
      group by 1
    ) t
  ),

  'tiempos', jsonb_build_object(
    'ingesta', (
      select jsonb_build_object('n', count(*), 'promedioMs', round(avg(v)), 'minMs', min(v), 'maxMs', max(v))
      from (
        select duracion_ms as v from cartera where duracion_ms >= 0
        union all
        select duracion_ingesta_ms from analysis_results where duracion_ingesta_ms >= 0
      ) t
    ),
    'llm', (
      select jsonb_build_object('n', count(*), 'promedioMs', round(avg(duracion_llm_ms)), 'minMs', min(duracion_llm_ms), 'maxMs', max(duracion_llm_ms))
      from analysis_results where duracion_llm_ms >= 0
    )
  )
)
from base b;
$function$;


-- ---------- Comprobación ----------
-- Con la regla nueva: una fila por persona, ninguna diferencia fuera de
-- quien tiene una consulta vigente, y entre ellas las marcas son las del buró.
do $$
declare
  v jsonb;
  v_fuera integer;
  v_con_buro integer;
  v_esperadas integer;
  v_mal integer;
begin
  v := reconstruir_resumen_por_persona();
  if (v ->> 'fallas')::int > 0 then
    raise exception 'El resumen no se pudo armar para % personas', v ->> 'fallas';
  end if;
  if (select count(*) from resumen_por_persona) <> (select count(*) from clients) then
    raise exception 'El resumen no tiene una fila por persona';
  end if;

  select count(*) into v_fuera
    from resumen_por_persona r join _resumen_antes a using (client_id)
   where r.consulta_buro_id is null
     and (r.calificacion_baja is distinct from a.calificacion_baja or r.tiene_mora is distinct from a.tiene_mora);
  if v_fuera > 0 then
    raise exception 'Cambiaron las marcas de % personas sin consulta vigente del buró', v_fuera;
  end if;

  select count(*) into v_con_buro from resumen_por_persona where consulta_buro_id is not null;
  select count(*) into v_esperadas
    from resumen_por_persona r
   where r.perfil_id is not null and exists (select 1 from buro_vigente_de_la_persona(r.client_id));
  if v_con_buro <> v_esperadas then
    raise exception 'Hay % personas con consulta vigente del buró y el resumen marca %', v_esperadas, v_con_buro;
  end if;

  select count(*) into v_mal
    from resumen_por_persona r join consultas_equifax ce on ce.id = r.consulta_buro_id
   where r.calificacion_baja is distinct from (
           case when jsonb_typeof(ce.estructura #> '{deudaActualTitular,bancos}') = 'object'
             then coalesce((ce.estructura #>> '{deudaActualTitular,bancos,maximoDiasDeMora}')::numeric, 0) > 90 end);
  if v_mal > 0 then
    raise exception 'En % personas con buró la marca D o E no es la de los días de mora', v_mal;
  end if;

  raise notice 'resumen_por_persona: % personas con las marcas del buró', v_con_buro;
end;
$$;
