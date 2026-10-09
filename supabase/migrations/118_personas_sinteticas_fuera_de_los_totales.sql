-- Las 240 personas sintéticas de Aval, marcadas y fuera de los totales
-- (decisión del negocio del 2026-10-09, auditoría externa E3; antes M10 de
-- la auditoría de seguridad).
--
-- Son las cédulas de prueba del ambiente de Aval: Novadata no las conoce y
-- no existen. Desde el 2026-09-29 se sabía que torcían todo total sobre la
-- cartera (2.812 clientes = 2.572 reales + 240), pero quedaba decidir si se
-- marcaban o se borraban. Se marcan: es reversible y no se pierde nada.
-- Se reconocen sin la lista: son exactamente las que tienen su último
-- perfil en estructura-v3 (medido el 2026-10-09: 240, todas con consulta de
-- Aval, ninguna con análisis ni en el Laboratorio).
--
-- Qué cambia:
-- - los totales del tablero, los agregados por campo, el Panorama de
--   Fuentes de ingreso, el centro de datos del Laboratorio y las dos vistas
--   de estadística de las consultas dejan de contarlas;
-- - la bandeja las sigue trayendo con la marca al final (el expediente lee
--   su cabecera de ahí), y las listas de la pantalla las filtran.
--
-- OJO al recrear una vista: `create or replace view` REEMPLAZA sus opciones.
-- Sin `with (security_invoker = true)` la vista vuelve a leer con los
-- permisos de su dueño y saltea la RLS de quien consulta. Por eso las tres
-- de abajo lo llevan explícito (el control de seguridad lo mide:
-- "Las vistas son security_invoker").

alter table clients add column es_sintetico boolean not null default false;

comment on column clients.es_sintetico is
  'Persona inventada para probar un proveedor (las 240 del ambiente de prueba de Aval). No cuenta en los totales de la cartera (118).';

do $$
declare
  n integer;
begin
  update clients c set es_sintetico = true
  where c.id in (
    select u.client_id from (
      select distinct on (client_id) client_id, structure_version
      from client_profiles
      order by client_id, created_at desc
    ) u
    where u.structure_version = 'estructura-v3'
  );
  get diagnostics n = row_count;
  -- La plantilla tiene 240; una base de cliente nueva, ninguna. Otro número
  -- quiere decir que la regla ya no separa lo que se cree que separa.
  if n not in (0, 240) then
    raise exception 'Se esperaban 240 personas sintéticas (o ninguna en una base nueva) y se encontraron %', n;
  end if;
end $$;

-- metricas_gerenciales(): los totales del tablero.
CREATE OR REPLACE FUNCTION public.metricas_gerenciales()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with cartera as (
  -- Sin las personas sintéticas (118).
  select cp.* from client_profiles cp
  where not exists (select 1 from clients c where c.id = cp.client_id and c.es_sintetico)
),
perfil as (
  select distinct on (client_id) *
  from cartera
  order by client_id, created_at desc
),
analisis as (
  select distinct on (client_id) *
  from analysis_results
  where fallo_tipo is null
  order by client_id, created_at desc
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
      from (select count(*) as n from perfil
             where (standard_profile -> 'riesgoJudicialCrediticio' ->> 'numeroDemandasComoDemandado')::int > 0) t
      union all
      select 2, jsonb_build_object('etiqueta', 'Calificación baja en buró (D/E)',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil
             where standard_profile -> 'comportamientoBancario' ->> 'peorCalificacionRiesgo' in ('D','E')) t
      union all
      select 3, jsonb_build_object('etiqueta', 'Mora bancaria o en cooperativas',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil
             where coalesce((standard_profile -> 'comportamientoBancario' ->> 'deudaEnAtraso')::numeric,
                            (standard_profile -> 'comportamientoBancario' ->> 'saldoEnMoraBuroCredito')::numeric, 0) > 0
                or coalesce((standard_profile -> 'comportamientoCooperativas' ->> 'saldoEnMora')::numeric, 0) > 0) t
      union all
      select 4, jsonb_build_object('etiqueta', 'Control de bloqueo activo',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil where (control_bloqueo ->> 'bloqueado')::boolean) t
    ) s
  ),

  'laboral', (
    select jsonb_agg(x order by orden) from (
      select 1 as orden, jsonb_build_object('etiqueta', 'Independientes',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end) as x
      from (select count(*) as n from perfil where (standard_profile -> 'laboral' ->> 'esIndependiente')::boolean) t
      union all
      -- Las dos formas del dato. Los perfiles anteriores a marco-v20
      -- traen un objeto `empleoActual`; los nuevos, el arreglo
      -- `empleosActuales`. Leer solo el objeto --lo que hacía el
      -- tablero-- contaba de menos desde ese cambio.
      select 2, jsonb_build_object('etiqueta', 'Dependientes (empleo vigente)',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil
             where jsonb_typeof(standard_profile -> 'laboral' -> 'empleoActual') = 'object'
                or jsonb_array_length(coalesce(standard_profile -> 'laboral' -> 'empleosActuales', '[]'::jsonb)) > 0) t
      union all
      select 3, jsonb_build_object('etiqueta', 'Jubilados',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil where (standard_profile -> 'seguridadSocial' ->> 'esJubilado')::boolean) t
      union all
      select 4, jsonb_build_object('etiqueta', 'Pensionistas',
        'valor', n, 'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end)
      from (select count(*) as n from perfil where (standard_profile -> 'seguridadSocial' ->> 'esPensionista')::boolean) t
    ) s
  ),

  'patrimonio', (
    select jsonb_build_object(
      'conRespaldoPatrimonial', n,
      'pct', case when b.total_clientes = 0 then 0 else round(100.0 * n / b.total_clientes) end,
      'valorColateralTotal', (select coalesce(sum((standard_profile -> 'patrimonio' ->> 'valorColateralVehiculos')::numeric), 0) from perfil)
    )
    from (select count(*) as n from perfil
           where (standard_profile -> 'patrimonio' ->> 'tieneVehiculos')::boolean
              or coalesce((standard_profile -> 'patrimonio' ->> 'numeroInmuebles')::int, 0) > 0) t
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

-- agregar_por_campo(): los agregados por campo del tablero.
CREATE OR REPLACE FUNCTION public.agregar_por_campo(p_campo text, p_tipo text)
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
    select distinct on (client_id) standard_profile
    from client_profiles cp where not exists (select 1 from clients c where c.id = cp.client_id and c.es_sintetico) order by client_id, created_at desc
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
    with perfil as (select distinct on (client_id) standard_profile from client_profiles cp where not exists (select 1 from clients c where c.id = cp.client_id and c.es_sintetico) order by client_id, created_at desc)
    select jsonb_build_object(
      'tipo', 'porcentaje', 'conDato', con_dato,
      'pct', case when total = 0 then 0 else round(100.0 * count(*) filter (where (standard_profile #> ruta)::text = 'true') / total) end
    ) into resultado from perfil;
    return resultado;
  end if;

  if p_tipo in ('numero', 'moneda', 'meses') then
    with perfil as (select distinct on (client_id) standard_profile from client_profiles cp where not exists (select 1 from clients c where c.id = cp.client_id and c.es_sintetico) order by client_id, created_at desc)
    select jsonb_build_object('tipo', 'promedio', 'conDato', con_dato,
      'promedio', avg((standard_profile #> ruta)::text::numeric))
    into resultado
    from perfil
    where jsonb_typeof(standard_profile #> ruta) = 'number';
    return resultado;
  end if;

  -- Texto, lista o estado: los seis valores más frecuentes. Las listas
  -- se abren y cada elemento cuenta por separado, igual que antes.
  with perfil as (select distinct on (client_id) standard_profile from client_profiles cp where not exists (select 1 from clients c where c.id = cp.client_id and c.es_sintetico) order by client_id, created_at desc),
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
$function$;

-- resumen_fuentes_ingreso(): el Panorama de Fuentes de ingreso, incluida la
-- lista de quienes necesitan respaldo (ahí estaban las 18 sintéticas).
CREATE OR REPLACE FUNCTION public.resumen_fuentes_ingreso()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with ultimo as (
  select distinct on (p.client_id)
    p.id, p.client_id, p.created_at, p.fuente_segmento, p.fuente_estado, p.fuente_piso_ingreso, p.fuente_corte, p.perfil_laboral,
    p.indicios_ingreso,
    p.standard_profile->'fuentesIngreso' as f
  from client_profiles p
  -- Sin las personas sintéticas (118).
  where not exists (select 1 from clients c where c.id = p.client_id and c.es_sintetico)
  order by p.client_id, p.created_at desc
),
clasificado as (
  select u.*, c.cedula from ultimo u left join clients c on c.id = u.client_id
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
$function$;

-- lab_centro_de_datos(): la disponibilidad de las fuentes en el Laboratorio.
CREATE OR REPLACE FUNCTION public.lab_centro_de_datos(p_dias integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with perfiles as (
    select created_at, estado_por_fuente from client_profiles cp
     where created_at >= now() - make_interval(days => p_dias) and estado_por_fuente is not null
       and not exists (select 1 from clients c where c.id = cp.client_id and c.es_sintetico)
  ), pares as (
    select date_trunc('week', p.created_at at time zone 'America/Guayaquil')::date as semana, e.key as fuente, e.value #>> '{}' as estado, p.created_at
      from perfiles p cross join lateral jsonb_each(p.estado_por_fuente) e
  ), por_fuente as (
    select fuente, count(*) as consultas,
           count(*) filter (where estado = 'ok') as con_datos,
           count(*) filter (where estado = 'ok_vacio') as vacias,
           count(*) filter (where estado = 'error') as errores,
           count(*) filter (where estado not in ('ok', 'ok_vacio', 'error')) as otras,
           count(*) filter (where created_at >= now() - interval '7 days') as recientes,
           count(*) filter (where created_at >= now() - interval '7 days' and estado in ('ok', 'ok_vacio')) as recientes_contestaron,
           count(*) filter (where created_at < now() - interval '7 days' and created_at >= now() - interval '37 days') as antes,
           count(*) filter (where created_at < now() - interval '7 days' and created_at >= now() - interval '37 days' and estado in ('ok', 'ok_vacio')) as antes_contestaron,
           max(created_at) as ultima
      from pares group by fuente
  ), por_semana as (
    select fuente, semana, count(*) as n, count(*) filter (where estado in ('ok', 'ok_vacio')) as contestaron, count(*) filter (where estado = 'ok') as con_datos
      from pares group by fuente, semana
  )
  select jsonb_build_object(
    'dias', p_dias,
    'perfiles', (select count(*) from perfiles),
    'corte_iess', corte_iess_vigente(),
    'fuentes', coalesce((select jsonb_agg(jsonb_build_object(
        'fuente', f.fuente, 'consultas', f.consultas, 'con_datos', f.con_datos, 'vacias', f.vacias, 'errores', f.errores, 'otras', f.otras, 'ultima', f.ultima,
        'contesto_ultima_semana', case when f.recientes > 0 then round(f.recientes_contestaron::numeric / f.recientes, 4) end,
        'contesto_mes_anterior', case when f.antes > 0 then round(f.antes_contestaron::numeric / f.antes, 4) end,
        'consultas_ultima_semana', f.recientes,
        'semanas', (select jsonb_agg(jsonb_build_object('semana', s.semana, 'n', s.n, 'contestaron', s.contestaron, 'con_datos', s.con_datos) order by s.semana) from por_semana s where s.fuente = f.fuente))
        order by f.fuente) from por_fuente f), '[]'::jsonb)
  );
$function$;

-- bandeja_solicitudes: NO se filtra, porque el expediente lee su cabecera de
-- acá y una persona sintética tiene que poder abrirse por su cédula. Se suma
-- la marca al final (regla 5 de CLAUDE.md) y las listas de la pantalla la
-- filtran (src/lib/api.js).
create or replace view public.bandeja_solicitudes with (security_invoker = true) as
 WITH perfil AS (
         SELECT DISTINCT ON (cp.client_id) cp.client_id,
            cp.id AS perfil_id,
            cp.created_at AS perfil_at,
            cp.origen AS perfil_origen,
            cp.lote_id,
            cp.structure_version,
            cp.ejes_ok,
            cp.fuentes_ok,
            cp.fuente_segmento,
            cp.fuente_piso_ingreso,
            cp.fuente_estado,
            cp.fuente_corte,
            cp.control_bloqueo,
            cp.indicios_ingreso,
            (cp.standard_profile -> 'identidad'::text) ->> 'nombreCompleto'::text AS nombre,
            ((cp.standard_profile -> 'identidad'::text) ->> 'edad'::text)::integer AS edad,
            (cp.standard_profile -> 'identidad'::text) ->> 'provinciaNacimiento'::text AS provincia,
                CASE
                    WHEN jsonb_typeof((cp.standard_profile -> 'laboral'::text) -> 'empleosActuales'::text) = 'array'::text THEN jsonb_array_length((cp.standard_profile -> 'laboral'::text) -> 'empleosActuales'::text)
                    WHEN jsonb_typeof((cp.standard_profile -> 'laboral'::text) -> 'empleoActual'::text) = 'object'::text THEN 1
                    ELSE 0
                END AS empleos_vigentes
           FROM client_profiles cp
          ORDER BY cp.client_id, cp.created_at DESC
        ), analisis AS (
         SELECT DISTINCT ON (ar.client_id) ar.client_id,
            ar.id AS analisis_id,
            ar.created_at AS analisis_at,
            ar.crediscope_score AS score,
            ar.recomendacion,
            ar.indicador_riesgo,
            ar.indicador_historial,
            ar.rules_version,
            ar.fallo_tipo,
            ar.veredicto_origen
           FROM analysis_results ar
          ORDER BY ar.client_id, ar.created_at DESC
        ), conteos AS (
         SELECT client_profiles.client_id,
            count(*) AS consultas
           FROM client_profiles
          GROUP BY client_profiles.client_id
        )
 SELECT c.id AS client_id,
    c.cedula,
    c.created_at AS ingreso_at,
    p.nombre,
    p.edad,
    p.provincia,
    p.perfil_id,
    p.perfil_at,
    p.perfil_origen,
    p.lote_id,
    p.structure_version,
    p.fuente_segmento,
    p.fuente_piso_ingreso,
    p.fuente_estado,
    p.fuente_corte,
    p.empleos_vigentes,
    COALESCE(n.consultas, 0::bigint) AS consultas,
    a.analisis_id,
    a.analisis_at,
        CASE
            WHEN a.fallo_tipo IS NULL THEN a.score
            ELSE NULL::integer
        END AS score,
        CASE
            WHEN a.fallo_tipo IS NULL THEN a.recomendacion
            ELSE NULL::text
        END AS recomendacion,
    a.indicador_riesgo,
    a.indicador_historial,
    a.rules_version,
    a.fallo_tipo,
    a.veredicto_origen,
    GREATEST(COALESCE(a.analisis_at, c.created_at), COALESCE(p.perfil_at, c.created_at)) AS ultima_actividad,
        CASE
            WHEN p.perfil_id IS NULL THEN 'sin_consulta'::text
            WHEN COALESCE(p.fuentes_ok, p.ejes_ok, 0) = 0 THEN 'consulta_fallida'::text
            WHEN a.analisis_id IS NULL THEN 'sin_analisis'::text
            WHEN a.fallo_tipo IS NOT NULL THEN 'no_completado'::text
            ELSE 'analizado'::text
        END AS estado,
    COALESCE(jsonb_array_length(p.control_bloqueo -> 'hallazgos'::text), 0) AS hallazgos_control,
    COALESCE(( SELECT bool_or((h.value ->> 'bloqueante'::text)::boolean) AS bool_or
           FROM jsonb_array_elements(COALESCE(p.control_bloqueo -> 'hallazgos'::text, '[]'::jsonb)) h(value)), false) AS tiene_bloqueante,
    COALESCE(p.ejes_ok, 0) AS ejes_ok,
    COALESCE(p.fuentes_ok, p.ejes_ok, 0) > 0 AS consulta_util,
    p.fuentes_ok,
    p.indicios_ingreso,
    c.es_sintetico
   FROM clients c
     LEFT JOIN perfil p ON p.client_id = c.id
     LEFT JOIN analisis a ON a.client_id = c.id
     LEFT JOIN conteos n ON n.client_id = c.id;

-- calidad_de_las_consultas: estadística de las consultas, sin sintéticas.
create or replace view public.calidad_de_las_consultas with (security_invoker = true) as
 SELECT p.id AS perfil_id,
    c.cedula,
    p.created_at,
    p.origen,
    p.ejes_ok,
    p.fuentes_ok,
    p.fuentes_totales,
        CASE
            WHEN p.fuentes_totales IS NULL OR p.fuentes_totales = 0 THEN NULL::numeric
            ELSE round(100.0 * p.fuentes_ok::numeric / p.fuentes_totales::numeric, 1)
        END AS pct_fuentes,
    ( SELECT count(*) AS count
           FROM jsonb_each_text(COALESCE(p.estado_por_fuente, '{}'::jsonb)) f(k, v)
          WHERE f.v = 'error'::text) AS fuentes_con_error,
    ( SELECT count(*) AS count
           FROM jsonb_each_text(COALESCE(p.estado_por_fuente, '{}'::jsonb)) f(k, v)
          WHERE f.v = 'faltante'::text) AS fuentes_sin_dato,
    ( SELECT count(*) AS count
           FROM jsonb_each_text(COALESCE(p.estado_por_fuente, '{}'::jsonb)) f(k, v)
          WHERE f.v = 'deshabilitado'::text) AS fuentes_apagadas
   FROM client_profiles p
     JOIN clients c ON c.id = p.client_id
  WHERE NOT c.es_sintetico;

-- fuentes_que_despertaron: estadística por fuente, sin sintéticas.
create or replace view public.fuentes_que_despertaron with (security_invoker = true) as
 SELECT f.recurso AS fuente,
    f.estado_del_recurso AS estado_registrado,
    count(*) FILTER (WHERE (p.estado_por_fuente ->> f.recurso) = 'ok'::text) AS veces_con_contenido,
    count(*) FILTER (WHERE (p.estado_por_fuente ->> f.recurso) = 'ok_vacio'::text) AS veces_vacia,
    count(*) FILTER (WHERE (p.estado_por_fuente ->> f.recurso) = 'faltante'::text) AS veces_sin_dato,
    count(*) FILTER (WHERE (p.estado_por_fuente ->> f.recurso) = 'error'::text) AS veces_con_error,
    max(p.created_at) FILTER (WHERE (p.estado_por_fuente ->> f.recurso) = 'ok'::text) AS ultima_vez_con_contenido
   FROM novadata_resource_config f
     JOIN client_profiles p ON p.estado_por_fuente ? f.recurso
  WHERE f.estado_del_recurso = ANY (ARRAY['no_responde'::text, 'sin_contenido'::text])
    AND NOT (EXISTS ( SELECT 1 FROM clients c WHERE c.id = p.client_id AND c.es_sintetico))
  GROUP BY f.recurso, f.estado_del_recurso;
