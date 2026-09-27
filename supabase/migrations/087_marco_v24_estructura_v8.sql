-- marco-v24 y estructura-v8: lo que mostraron los primeros análisis con
-- marco-v23 (docs/propuesta-estructura-v8-marco-v24.md).
--
-- 1. La fila de la versión. Se aplica ANTES de desplegar: sin ella el
--    primer análisis falla por clave foránea.
-- 2. Los campos nuevos del perfil, para que un admin pueda apagarlos en
--    Configuración (lo que se apaga es lo que no lee el modelo).
-- 3. La métrica gerencial "Mora bancaria o en cooperativas" contaba sólo
--    saldoEnMoraBuroCredito, y no veía la cartera que no devenga intereses:
--    56 personas con $626.743 en atraso figuraban sin mora. Desde
--    estructura-v8 lee deudaEnAtraso (vencido + no devenga + demanda +
--    castigo) y cae a saldoEnMoraBuroCredito en perfiles anteriores. El
--    resto de la función es la definición vigente, tal cual.

insert into scoring_rules_versions (version, description) values
  ('marco-v24',
   'Sonnet como único modelo. El perfil del modelo suma el bloque endeudamiento (deuda propia en todo el sistema, en atraso, garantizada y cuota conocida) y llama numeroPrestamosIessBiess a los préstamos del IESS/BIESS. Lee estructura-v8: buró propio separado de lo garantizado, cartera que no devenga intereses, retail vencido, cuota de cooperativas y pensiones por proceso. Exige español, dice el bloqueo en términos de política de crédito, suma la licencia a las ausencias triviales y ordena positivos y negativos por peso.')
on conflict (version) do nothing;

insert into standard_profile_field_config (grupo, campo) values
  ('comportamientoBancario', 'saldoNoDevengaIntereses'),
  ('comportamientoBancario', 'deudaEnAtraso'),
  ('comportamientoBancario', 'operacionesEnAtrasoSinMonto'),
  ('comportamientoBancario', 'numeroOperacionesComoGaranteOCodeudor'),
  ('comportamientoBancario', 'deudaComoGaranteOCodeudor'),
  ('comportamientoBancario', 'peorCalificacionComoGaranteOCodeudor'),
  ('comportamientoBancario', 'valorVencidoRetail'),
  ('comportamientoBancario', 'numeroPrestamosIessBiess'),
  ('comportamientoCooperativas', 'cuotaMensualTotal'),
  ('riesgoJudicialCivil', 'numeroPensionesAlimenticias'),
  ('riesgoJudicialCivil', 'numeroPensionesVigentes'),
  ('riesgoJudicialCivil', 'valorMensualPensiones'),
  ('riesgoJudicialCivil', 'numeroPensionesEnMora'),
  ('endeudamiento', 'deudaPropiaTotal'),
  ('endeudamiento', 'deudaPropiaBancos'),
  ('endeudamiento', 'deudaPropiaCooperativas'),
  ('endeudamiento', 'deudaPropiaRetail'),
  ('endeudamiento', 'deudaEnAtrasoTotal'),
  ('endeudamiento', 'deudaComoGaranteOCodeudor'),
  ('endeudamiento', 'cuotaMensualConocida')
on conflict (grupo, campo) do nothing;

CREATE OR REPLACE FUNCTION public.metricas_gerenciales()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;
