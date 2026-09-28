-- marco-v26 y estructura-v11: las demandas por categoría y los indicios de
-- ingreso mayor en la pestaña Fuentes de ingreso (aprobado por el negocio
-- el 2026-09-28).
--
-- 1. La fila de la versión. Se aplica ANTES de desplegar: sin ella el
--    primer análisis falla por clave foránea.
-- 2. El campo nuevo del perfil, para que un admin pueda apagarlo.
-- 3. client_profiles.indicios_ingreso: qué indicios de ingreso mayor tiene
--    cada perfil. Los calcula indiciosDeIngresoMayor() (fuentes-ingreso.ts),
--    la misma función que usan la pantalla y el modelo, al guardar el
--    perfil -- como perfil_laboral (085). Existe para que el Panorama los
--    cuente en la base y la lista de clientes los filtre: el navegador no
--    puede recalcularlos sobre 2.807 perfiles (PostgREST corta en 1.000).
--    Se aplica ANTES de desplegar: las funciones nuevas la escriben.
-- 4. bandeja_solicitudes suma indicios_ingreso AL FINAL (una vista no admite
--    columnas nuevas en el medio). El resto es la definición vigente en la
--    base, tal cual.
-- 5. resumen_fuentes_ingreso(): cuenta los indicios, y "Sin información
--    actual en el IESS" deja de contar a los jubilados. Dejaron de aportar
--    porque se jubilaron; la pantalla y el modelo ya no los marcan desde
--    fuentes-v9 (dejoDeAparecerEnElIess) y el Panorama los seguía sumando.
--    Se usa el segmento: desde fuentes-v9 todo el que cobra una pensión es
--    "jubilado" o "jubilado con ingreso adicional". El resto es la
--    definición vigente, tal cual.

-- ---------- 1. La versión ----------
insert into scoring_rules_versions (version, description) values
  ('marco-v26',
   'Las demandas civiles llegan contadas por categoría (familia, laboral, tránsito, investigación penal cerrada sin cargos, trámite, delito contra el patrimonio, otro delito, propiedad, constitucional o administrativa, daños y perjuicios, otras) y no como 615 textos libres con artículos del COIP; las investigaciones cerradas y los trámites no penalizan. Los tipos de cobro llegan legibles. El marco dice cómo leer cada indicio de ingreso mayor. Lee estructura-v11.')
on conflict (version) do nothing;

-- ---------- 2. El campo nuevo ----------
insert into standard_profile_field_config (grupo, campo) values
  ('riesgoJudicialCivil', 'demandasPorCategoria')
on conflict (grupo, campo) do nothing;

-- ---------- 3. La columna de indicios ----------
alter table client_profiles add column if not exists indicios_ingreso text[];

comment on column client_profiles.indicios_ingreso is
  'Claves de los indicios de ingreso mayor del perfil (sueldos_a_terceros, obligado_a_contabilidad, impuesto_a_la_renta), calculadas con indiciosDeIngresoMayor() de fuentes-ingreso.ts al guardar el perfil. Arreglo vacío: sin indicios. null: no calculado.';

create index if not exists client_profiles_indicios_ingreso_idx on client_profiles using gin (indicios_ingreso);

-- ---------- 4. La bandeja ----------
create or replace view bandeja_solicitudes with (security_invoker = on) as
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
    p.indicios_ingreso
   FROM clients c
     LEFT JOIN perfil p ON p.client_id = c.id
     LEFT JOIN analisis a ON a.client_id = c.id
     LEFT JOIN conteos n ON n.client_id = c.id;

comment on view bandeja_solicitudes is
  'Una fila por persona consultada, con su último Perfil del Cliente y su último Análisis con IA en columnas planas. estado = consulta_fallida cuando la fuente no contestó ninguna fuente; se mide con fuentes_ok y se cae a ejes_ok sólo en los perfiles anteriores al 2026-09-17. indicios_ingreso (089): los indicios de ingreso mayor del último perfil. Alimenta la bandeja (/solicitudes) y la lista de clientes de Fuentes de ingreso.';

-- ---------- 5. El resumen del Panorama ----------
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
