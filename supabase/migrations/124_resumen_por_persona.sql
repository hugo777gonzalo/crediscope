-- 124 · Una fila por persona, al día con cada consulta y cada análisis
--
-- Decisión del negocio del 2026-10-12 («según la pantalla»): la cartera
-- puede crecer mucho, y la bandeja, Monitoreo y Fuentes de ingreso
-- recorrían todos los perfiles en cada vista para quedarse con el último de
-- cada persona. Medido ese día con el rol de la pantalla (8.590 perfiles de
-- 2.812 personas): la primera página de la bandeja, 0,57 s después de la
-- 123 (de 3 a 5 s antes); Monitoreo, 1,3 s; Fuentes de ingreso, 1,4 s. Todo
-- crecía con cada consulta guardada.
--
-- resumen_por_persona guarda, de cada persona, lo que esas pantallas leen de
-- su último perfil y de su último análisis:
-- - refrescar_resumen_por_persona() es la ÚNICA regla de qué se muestra.
--   Antes vivía repetida en la vista de la bandeja y en cada función del
--   tablero.
-- - Disparadores por sentencia en client_profiles, analysis_results y
--   clients recalculan sólo a las personas tocadas.
-- - Cada noche (pg_cron, 00:10 de Ecuador) se reconstruye entera, por si un
--   disparador falló.
--
-- Un disparador que falla al insertar o al actualizar NO frena la consulta
-- ni el análisis: queda un aviso y la reconstrucción de la noche lo repara.
-- Al borrar sí frena: borrar es la supresión de un titular (115), y su
-- nombre no puede quedar en el resumen.
--
-- La vista bandeja_solicitudes, metricas_gerenciales(),
-- resumen_fuentes_ingreso() y agregar_por_campo() pasan a leer la tabla con
-- la misma salida. Se comprobó antes, en una transacción revertida: las
-- filas de la bandeja y los JSON de los tableros, idénticos.

create table resumen_por_persona (
  client_id            uuid primary key references clients(id) on delete cascade,
  cedula               text not null,
  ingreso_at           timestamptz not null,
  es_sintetico         boolean not null default false,
  nombre               text,
  edad                 integer,
  provincia            text,
  perfil_id            uuid,
  perfil_at            timestamptz,
  perfil_origen        text,
  lote_id              uuid,
  structure_version    text,
  fuente_segmento      text,
  fuente_piso_ingreso  numeric(14,2),
  fuente_estado        text,
  fuente_corte         text,
  empleos_vigentes     integer,
  consultas            bigint not null default 0,
  analisis_id          uuid,
  analisis_at          timestamptz,
  -- Como en la bandeja: sin score ni recomendación si el análisis falló.
  score                integer,
  recomendacion        text,
  indicador_riesgo     text,
  indicador_historial  text,
  rules_version        text,
  fallo_tipo           text,
  veredicto_origen     text,
  ultima_actividad     timestamptz not null,
  estado               text not null,
  hallazgos_control    integer not null default 0,
  tiene_bloqueante     boolean not null default false,
  ejes_ok              integer not null default 0,
  consulta_util        boolean not null default false,
  fuentes_ok           integer,
  indicios_ingreso     text[],
  -- Del mismo último perfil, para Fuentes de ingreso y Monitoreo.
  perfil_laboral       text,
  fuentes_ingreso      jsonb,
  tiene_demanda_cobro  boolean,
  calificacion_baja    boolean,
  tiene_mora           boolean,
  bloqueo_activo       boolean,
  es_independiente     boolean,
  empleo_vigente       boolean,
  es_jubilado          boolean,
  es_pensionista       boolean,
  respaldo_patrimonial boolean,
  valor_colateral      numeric,
  -- El último análisis que terminó: Monitoreo cuenta sólo esos.
  analisis_ok_id       uuid,
  score_ok             integer,
  recomendacion_ok     text,
  actualizado_en       timestamptz not null default now()
);

comment on table resumen_por_persona is
  'Una fila por persona con lo que leen la bandeja y los tableros de su último perfil y su último análisis. La escribe sólo refrescar_resumen_por_persona() (124).';

-- La primera página de la bandeja: las personas reales por última actividad.
create index resumen_por_persona_actividad on resumen_por_persona (es_sintetico, ultima_actividad desc);
-- La búsqueda por cédula de la bandeja es por prefijo.
create index resumen_por_persona_cedula on resumen_por_persona (cedula text_pattern_ops);

alter table resumen_por_persona enable row level security;
create policy resumen_por_persona_read on resumen_por_persona
  for select using (auth.role() = 'authenticated');
revoke all on resumen_por_persona from public, anon, authenticated;
grant select on resumen_por_persona to authenticated;
grant all on resumen_por_persona to service_role;


-- La regla: qué se muestra de cada persona. Es la lógica de la vista de la
-- bandeja de la 123 (último perfil, último análisis, cuántas consultas) más
-- las marcas que contaban metricas_gerenciales() y resumen_fuentes_ingreso(),
-- con las mismas expresiones.
create or replace function refrescar_resumen_por_persona(p_clientes uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    actualizado_en
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
    p.sp -> 'comportamientoBancario' ->> 'peorCalificacionRiesgo' in ('D', 'E'),
    coalesce((p.sp -> 'comportamientoBancario' ->> 'deudaEnAtraso')::numeric,
             (p.sp -> 'comportamientoBancario' ->> 'saldoEnMoraBuroCredito')::numeric, 0) > 0
      or coalesce((p.sp -> 'comportamientoCooperativas' ->> 'saldoEnMora')::numeric, 0) > 0,
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
    now()
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
    actualizado_en = excluded.actualizado_en;
end;
$$;

-- Todas las personas, de a 500. Si un grupo falla, se rehace de a una para
-- que una persona con un dato raro no deje sin resumen a las demás.
create or replace function reconstruir_resumen_por_persona()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo uuid[];
  v_id uuid;
  v_hechas integer := 0;
  v_fallas integer := 0;
begin
  delete from resumen_por_persona r where not exists (select 1 from clients c where c.id = r.client_id);
  for v_grupo in
    select array_agg(id) from (select id, (row_number() over (order by id) - 1) / 500 as grupo from clients) x group by grupo
  loop
    begin
      perform refrescar_resumen_por_persona(v_grupo);
      v_hechas := v_hechas + cardinality(v_grupo);
    exception when others then
      foreach v_id in array v_grupo loop
        begin
          perform refrescar_resumen_por_persona(array[v_id]);
          v_hechas := v_hechas + 1;
        exception when others then
          v_fallas := v_fallas + 1;
          raise warning 'resumen_por_persona: no se pudo rehacer %: %', v_id, sqlerrm;
        end;
      end loop;
    end;
  end loop;
  return jsonb_build_object('personas', v_hechas, 'fallas', v_fallas);
end;
$$;

revoke execute on function refrescar_resumen_por_persona(uuid[]) from public, anon, authenticated;
revoke execute on function reconstruir_resumen_por_persona() from public, anon, authenticated;
grant execute on function refrescar_resumen_por_persona(uuid[]) to service_role;
grant execute on function reconstruir_resumen_por_persona() to service_role;


create or replace function resumen_por_persona_al_cambiar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clientes uuid[];
begin
  if tg_table_name = 'clients' then
    select array_agg(id) into v_clientes from nuevas;
  elsif tg_op = 'INSERT' then
    select array_agg(distinct client_id) into v_clientes from nuevas;
  elsif tg_op = 'UPDATE' then
    select array_agg(distinct client_id) into v_clientes
      from (select client_id from nuevas union select client_id from viejas) x;
  else
    select array_agg(distinct client_id) into v_clientes from viejas;
  end if;
  if v_clientes is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- Borrar es la supresión de un titular (115): si el resumen no se
    -- pudiera rehacer, quedaría su nombre. Acá un error frena el borrado.
    perform refrescar_resumen_por_persona(v_clientes);
  else
    begin
      perform refrescar_resumen_por_persona(v_clientes);
    exception when others then
      raise warning 'resumen_por_persona: % en % (% personas): %', tg_op, tg_table_name, cardinality(v_clientes), sqlerrm;
    end;
  end if;
  return null;
end;
$$;

create trigger resumen_tras_insertar_perfil after insert on client_profiles
  referencing new table as nuevas for each statement execute function resumen_por_persona_al_cambiar();
create trigger resumen_tras_actualizar_perfil after update on client_profiles
  referencing old table as viejas new table as nuevas for each statement execute function resumen_por_persona_al_cambiar();
create trigger resumen_tras_borrar_perfil after delete on client_profiles
  referencing old table as viejas for each statement execute function resumen_por_persona_al_cambiar();

create trigger resumen_tras_insertar_analisis after insert on analysis_results
  referencing new table as nuevas for each statement execute function resumen_por_persona_al_cambiar();
create trigger resumen_tras_actualizar_analisis after update on analysis_results
  referencing old table as viejas new table as nuevas for each statement execute function resumen_por_persona_al_cambiar();
create trigger resumen_tras_borrar_analisis after delete on analysis_results
  referencing old table as viejas for each statement execute function resumen_por_persona_al_cambiar();

-- Borrar una persona borra su fila por la clave foránea.
create trigger resumen_tras_insertar_persona after insert on clients
  referencing new table as nuevas for each statement execute function resumen_por_persona_al_cambiar();
create trigger resumen_tras_actualizar_persona after update on clients
  referencing old table as viejas new table as nuevas for each statement execute function resumen_por_persona_al_cambiar();


-- Llenarla y comprobarla antes de que nada la lea.
do $$
declare
  v jsonb;
begin
  v := reconstruir_resumen_por_persona();
  if (v ->> 'fallas')::int > 0 then
    raise exception 'El resumen no se pudo armar para % personas', v ->> 'fallas';
  end if;
  if (select count(*) from resumen_por_persona) <> (select count(*) from clients) then
    raise exception 'El resumen no tiene una fila por persona';
  end if;
end;
$$;

-- Cada noche, a las 00:10 de Ecuador (05:10 UTC): repara lo que un
-- disparador no pudo.
select cron.schedule('resumenes-crediscope', '10 5 * * *', $$select reconstruir_resumen_por_persona()$$);


-- ---------- La bandeja ----------
-- Las mismas columnas, en el mismo orden, sin calcular nada.
create or replace view bandeja_solicitudes
with (security_invoker = true)
as
select client_id, cedula, ingreso_at, nombre, edad, provincia, perfil_id,
       perfil_at, perfil_origen, lote_id, structure_version, fuente_segmento,
       fuente_piso_ingreso, fuente_estado, fuente_corte, empleos_vigentes,
       consultas, analisis_id, analisis_at, score, recomendacion,
       indicador_riesgo, indicador_historial, rules_version, fallo_tipo,
       veredicto_origen, ultima_actividad, estado, hallazgos_control,
       tiene_bloqueante, ejes_ok, consulta_util, fuentes_ok, indicios_ingreso,
       es_sintetico
  from resumen_por_persona;


-- ---------- Monitoreo ----------
create or replace function metricas_gerenciales()
returns jsonb
language sql
stable
as $$
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
      select 2, jsonb_build_object('etiqueta', 'Calificación baja en buró (D/E)',
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
$$;


-- ---------- Fuentes de ingreso ----------
-- La definición viva con el último perfil tomado del resumen.
create or replace function resumen_fuentes_ingreso()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with ultimo as (
  -- El último perfil de cada persona, sin las sintéticas (118), del resumen (124).
  select r.perfil_id as id, r.client_id, r.perfil_at as created_at, r.fuente_segmento, r.fuente_estado,
         r.fuente_piso_ingreso, r.fuente_corte, r.perfil_laboral, r.indicios_ingreso,
         r.fuentes_ingreso as f, r.cedula
  from resumen_por_persona r
  where r.perfil_id is not null and not r.es_sintetico
),
clasificado as (
  select u.* from ultimo u
  where u.fuente_segmento is not null
),
total as (select count(*)::numeric as n from clasificado),
nomina as (
  select c.id, (s->>'valor')::numeric as valor
  from clasificado c, jsonb_array_elements(coalesce(c.f->'senalesDeEscala', '[]')) s
  where s->>'senal' = 'nómina que paga'
),
respaldo as (
  select c.id, c.cedula, c.created_at, c.fuente_segmento, c.fuente_estado, c.f->>'motivoSegmento' as motivo, c.f->'paraConfirmar' as pedir
  from clasificado c
  where c.fuente_estado <> 'confirmada' and jsonb_array_length(coalesce(c.f->'paraConfirmar', '[]')) > 0
)
select jsonb_build_object(
  'total', (select n from total),
  'sinClasificar', (select count(*) from ultimo where fuente_segmento is null),
  'segmentos', coalesce((
    select jsonb_agg(jsonb_build_object('clave', fuente_segmento, 'n', n, 'pct', round(100 * n / nullif((select n from total), 0))) order by n desc)
    from (select fuente_segmento, count(*) as n from clasificado group by 1) x
  ), '[]'),
  'estados', coalesce((
    select jsonb_agg(jsonb_build_object('clave', fuente_estado, 'n', n, 'pct', round(100 * n / nullif((select n from total), 0))) order by n desc)
    from (select fuente_estado, count(*) as n from clasificado group by 1) x
  ), '[]'),
  'evidencias', coalesce((
    select jsonb_agg(jsonb_build_object('clave', clave, 'n', n) order by n desc)
    from (
      select e->>'evidencia' as clave, count(*) as n
      from clasificado c, jsonb_array_elements(coalesce(c.f->'fuentes', '[]')) e
      group by 1
    ) x
  ), '[]'),
  'conPiso', (select count(*) from clasificado where fuente_piso_ingreso > 0),
  'pisoPromedio', (select round(avg(fuente_piso_ingreso)) from clasificado where fuente_piso_ingreso > 0),
  'pisoTotal', (select round(coalesce(sum(fuente_piso_ingreso), 0)) from clasificado where fuente_piso_ingreso > 0),
  -- Sin los jubilados (089): dejaron de aportar porque se jubilaron.
  'desvinculados', (
    select count(*) from clasificado
    where f->>'apareceEnUltimoCorte' = 'false'
      and fuente_segmento not in ('jubilado', 'jubilado_con_ingreso_adicional')
  ),
  'corteDesactualizado', (select count(*) from clasificado where f->>'corteDesactualizado' = 'true'),
  'cortes', coalesce((
    select jsonb_agg(jsonb_build_array(fuente_corte, n) order by n desc)
    from (select fuente_corte, count(*) as n from clasificado where fuente_corte is not null group by 1) x
  ), '[]'),
  'corteVigente', corte_iess_vigente(),
  -- Perfil laboral (migración 085): cuántos son dependientes, independientes,
  -- las dos cosas a la vez, etc. Los perfiles sin la columna calculada
  -- cuentan aparte, para que el hueco se vea.
  'perfilesLaborales', coalesce((
    select jsonb_agg(jsonb_build_object('clave', coalesce(perfil_laboral, 'sin_calcular'), 'n', n, 'pct', round(100 * n / nullif((select n from total), 0))) order by n desc)
    from (select perfil_laboral, count(*) as n from clasificado group by 1) x
  ), '[]'),
  -- El cruce que motivó el perfil: de qué segmento son los que, además de
  -- trabajar para un tercero, tienen actividad propia.
  'dependientesConActividadPorSegmento', coalesce((
    select jsonb_agg(jsonb_build_object('clave', fuente_segmento, 'n', n) order by n desc)
    from (select fuente_segmento, count(*) as n from clasificado where perfil_laboral = 'dependiente_con_actividad_propia' group by 1) x
  ), '[]'),
  'nominaTotal', (select round(coalesce(sum(valor), 0)) from nomina where valor > 0),
  'conNomina', (select count(*) from nomina where valor > 0),
  'obligadosContabilidad', (
    select count(*) from clasificado c
    where exists (select 1 from jsonb_array_elements(coalesce(c.f->'senalesDeEscala', '[]')) s where s->>'senal' = 'obligado a llevar contabilidad')
  ),
  -- Indicios de ingreso mayor (089). Los perfiles sin la columna calculada
  -- cuentan aparte, igual que el perfil laboral.
  'indicios', jsonb_build_object(
    'conAlguno', (select count(*) from clasificado where coalesce(cardinality(indicios_ingreso), 0) > 0),
    'sinCalcular', (select count(*) from clasificado where indicios_ingreso is null),
    'soloRenta', (select count(*) from clasificado where indicios_ingreso = array['impuesto_a_la_renta']),
    'porClave', coalesce((
      select jsonb_agg(jsonb_build_object('clave', clave, 'n', n, 'pct', round(100 * n / nullif((select n from total), 0))) order by n desc)
      from (select unnest(indicios_ingreso) as clave, count(*) as n from clasificado group by 1) x
    ), '[]')
  ),
  'requierenRespaldoTotal', (select count(*) from respaldo),
  'requierenRespaldo', coalesce((
    select jsonb_agg(jsonb_build_object(
      'perfilId', id, 'cedula', cedula, 'segmento', fuente_segmento, 'estado', fuente_estado, 'motivo', motivo, 'pedir', pedir
    ) order by created_at desc)
    from (select * from respaldo order by created_at desc limit 50) x
  ), '[]')
);
$function$
;


-- ---------- Agregados por campo (Monitoreo) ----------
-- La definición viva: el último perfil de cada persona sale del resumen y
-- sólo de ése se lee standard_profile.
create or replace function agregar_por_campo(p_campo text, p_tipo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  ruta text[];
  total bigint;
  con_dato bigint;
  resultado jsonb;
begin
  -- La ruta se parte acá y se usa con #> , que toma un arreglo de
  -- claves: así el campo no se concatena nunca dentro del SQL.
  ruta := string_to_array(p_campo, '.');
  if array_length(ruta, 1) is null or array_length(ruta, 1) > 4 then
    return jsonb_build_object('tipo', 'vacio', 'conDato', 0);
  end if;

  with perfil as (
    select cp.standard_profile from resumen_por_persona r join client_profiles cp on cp.id = r.perfil_id where not r.es_sintetico
  ),
  valores as (
    select standard_profile #> ruta as v from perfil
  )
  select
    (select count(*) from valores),
    (select count(*) from valores where v is not null and jsonb_typeof(v) <> 'null' and v::text <> '""')
  into total, con_dato;

  if con_dato = 0 then
    return jsonb_build_object('tipo', 'vacio', 'conDato', 0);
  end if;

  if p_tipo = 'booleano_si_true' then
    with perfil as (select cp.standard_profile from resumen_por_persona r join client_profiles cp on cp.id = r.perfil_id where not r.es_sintetico)
    select jsonb_build_object(
      'tipo', 'porcentaje', 'conDato', con_dato,
      'pct', case when total = 0 then 0 else round(100.0 * count(*) filter (where (standard_profile #> ruta)::text = 'true') / total) end
    ) into resultado from perfil;
    return resultado;
  end if;

  if p_tipo in ('numero', 'moneda', 'meses') then
    with perfil as (select cp.standard_profile from resumen_por_persona r join client_profiles cp on cp.id = r.perfil_id where not r.es_sintetico)
    select jsonb_build_object('tipo', 'promedio', 'conDato', con_dato,
      'promedio', avg((standard_profile #> ruta)::text::numeric))
    into resultado
    from perfil
    where jsonb_typeof(standard_profile #> ruta) = 'number';
    return resultado;
  end if;

  -- Texto, lista o estado: los seis valores más frecuentes. Las listas
  -- se abren y cada elemento cuenta por separado, igual que antes.
  with perfil as (select cp.standard_profile from resumen_por_persona r join client_profiles cp on cp.id = r.perfil_id where not r.es_sintetico),
  crudos as (
    select standard_profile #> ruta as v
    from perfil
    where standard_profile #> ruta is not null and jsonb_typeof(standard_profile #> ruta) <> 'null'
  ),
  -- Dos ramas unidas y no un CASE: Postgres no acepta una función que
  -- devuelve varias filas adentro de un CASE.
  sueltos as (
    select jsonb_array_elements_text(v) as v from crudos where jsonb_typeof(v) = 'array'
    union all
    select v #>> '{}' from crudos where jsonb_typeof(v) <> 'array'
  )
  select jsonb_build_object('tipo', 'distribucion', 'conDato', con_dato,
    'top', coalesce(jsonb_agg(jsonb_build_array(v, n) order by n desc), '[]'::jsonb))
  into resultado
  from (select v, count(*) as n from sueltos where v is not null and v <> '' group by v order by count(*) desc limit 6) t;

  return resultado;
end;
$function$
;
