-- ============================================================
-- El Reporte Gerencial deja de bajarse la cartera entera.
--
-- Hasta hoy cada carga de Inteligencia de Negocios traía TODOS los
-- client_profiles y analysis_results al navegador, con el
-- standard_profile completo adentro, y agregaba en JavaScript. El
-- propio archivo avisaba: "correcto y simple mientras la cartera sea de
-- cientos; si crece mucho, esto debería moverse a una vista". Son 3.054
-- perfiles de ~10 KB: unos 30 MB por carga, y creciendo.
--
-- Acá se mueven las dos cosas que lo obligaban:
--
--   metricas_gerenciales()   los números del tablero
--   agregar_por_campo()      el explorador por eje, que era la razón
--                            real de traer el perfil entero: el analista
--                            elige cualquier campo y se agrega ahí mismo
--
-- DE PASO SE CORRIGE UN CONTEO MAL
--
-- "Dependientes (empleo actual)" contaba `laboral.empleoActual`, que
-- marco-v20 renombró a `empleosActuales`. Desde ese cambio el tablero
-- venía contando de menos, sin avisar. Acá se leen las dos formas,
-- igual que en la vista de la bandeja.
-- ============================================================

create or replace function metricas_gerenciales()
returns jsonb
language sql
stable
-- Invoker, como todo lo demás: hereda las políticas de las tablas. Un
-- security definer acá sería una puerta lateral para contar lo que uno
-- no puede leer.
as $$
with perfil as (
  select distinct on (client_id) *
  from client_profiles
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
             where coalesce((standard_profile -> 'comportamientoBancario' ->> 'saldoEnMoraBuroCredito')::numeric, 0) > 0
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
        (select count(*) from client_profiles cp
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
      from client_profiles cp
      left join profiles pr on pr.id = cp.requested_by
      group by 1
    ) t
  ),

  'tiempos', jsonb_build_object(
    'ingesta', (
      select jsonb_build_object('n', count(*), 'promedioMs', round(avg(v)), 'minMs', min(v), 'maxMs', max(v))
      from (
        select duracion_ms as v from client_profiles where duracion_ms >= 0
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

comment on function metricas_gerenciales is
  'Los números del Reporte Gerencial, calculados en la base sobre el último perfil y el último análisis de cada cliente. Reemplaza a calcularMetricas() en el navegador, que traía la cartera entera.';


-- ---------- El explorador por eje ----------
--
-- Era la razón real por la que el tablero bajaba el standard_profile
-- completo: el analista elige cualquiera de los 124 campos y quiere el
-- agregado. Ahora se agrega donde está el dato.
--
-- El campo llega como ruta con puntos ("laboral.antiguedadEmpleoActualMeses")
-- y el tipo decide qué se calcula, igual que antes: porcentaje para los
-- booleanos, promedio para los números, distribución para el resto.
create or replace function agregar_por_campo(p_campo text, p_tipo text)
returns jsonb
language plpgsql
stable
as $$
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
    from client_profiles order by client_id, created_at desc
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
    with perfil as (select distinct on (client_id) standard_profile from client_profiles order by client_id, created_at desc)
    select jsonb_build_object(
      'tipo', 'porcentaje', 'conDato', con_dato,
      'pct', case when total = 0 then 0 else round(100.0 * count(*) filter (where (standard_profile #> ruta)::text = 'true') / total) end
    ) into resultado from perfil;
    return resultado;
  end if;

  if p_tipo in ('numero', 'moneda', 'meses') then
    with perfil as (select distinct on (client_id) standard_profile from client_profiles order by client_id, created_at desc)
    select jsonb_build_object('tipo', 'promedio', 'conDato', con_dato,
      'promedio', avg((standard_profile #> ruta)::text::numeric))
    into resultado
    from perfil
    where jsonb_typeof(standard_profile #> ruta) = 'number';
    return resultado;
  end if;

  -- Texto, lista o estado: los seis valores más frecuentes. Las listas
  -- se abren y cada elemento cuenta por separado, igual que antes.
  with perfil as (select distinct on (client_id) standard_profile from client_profiles order by client_id, created_at desc),
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
$$;

comment on function agregar_por_campo is
  'Agrega un campo cualquiera del Perfil del Cliente sobre el último perfil de cada cliente. Reemplaza a agregarCampo() en el navegador, que obligaba a bajar los 124 campos de las 2.565 personas para mirar uno.';
