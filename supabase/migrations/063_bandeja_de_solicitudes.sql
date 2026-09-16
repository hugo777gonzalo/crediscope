-- ============================================================
-- La bandeja: una fila por persona con lo último que se sabe de ella.
--
-- Hasta ahora, para listar la cartera había que traerse TODOS los
-- perfiles al navegador y quedarse con el último de cada cliente
-- (ultimoPorCliente en reporteGerencial.js). Con 67 clientes pasaba
-- desapercibido; con 2.681 y varias consultas por persona son miles de
-- filas con el perfil completo adentro -- megabytes de JSON viajando
-- para mostrar una tabla de veinte renglones.
--
-- Acá el "quedarse con el último" lo hace la base, que para eso tiene
-- el índice (client_id, created_at desc), y devuelve columnas planas.
--
-- No inventa la solicitud: mientras no exista esa entidad, cada fila es
-- una PERSONA consultada, no un pedido de crédito. Por eso no hay monto,
-- plazo, producto, agencia ni asesor -- ver
-- docs/arquitectura-fabrica-de-credito.md. La vista está armada para
-- que el día que la solicitud exista se agreguen columnas y la pantalla
-- no cambie de forma.
-- ============================================================

-- security_invoker: la vista se lee con los permisos de quien pregunta,
-- no con los del dueño. Sin esto, RLS de las tablas de abajo quedaría
-- sin efecto y cualquiera vería todo a través de la vista.
create or replace view bandeja_solicitudes with (security_invoker = on) as
with perfil as (
  select distinct on (cp.client_id)
    cp.client_id,
    cp.id                                                     as perfil_id,
    cp.created_at                                             as perfil_at,
    cp.origen                                                 as perfil_origen,
    cp.lote_id,
    cp.structure_version,
    cp.fuente_segmento,
    cp.fuente_piso_ingreso,
    cp.fuente_estado,
    cp.fuente_corte,
    cp.control_bloqueo,
    cp.standard_profile -> 'identidad' ->> 'nombreCompleto'   as nombre,
    (cp.standard_profile -> 'identidad' ->> 'edad')::int      as edad,
    cp.standard_profile -> 'identidad' ->> 'provinciaNacimiento' as provincia,
    -- Los perfiles guardados antes de marco-v20 traen un solo empleo en
    -- `empleoActual` (objeto); los nuevos traen todos en
    -- `empleosActuales` (arreglo). Hoy la cartera es 2.678 del formato
    -- viejo contra 3 del nuevo: leer solo el arreglo mostraría "0
    -- empleos" para gente que sí trabaja, que es peor que no mostrar la
    -- columna. Se lee el formato que cada perfil tenga.
    case
      when jsonb_typeof(cp.standard_profile -> 'laboral' -> 'empleosActuales') = 'array'
        then jsonb_array_length(cp.standard_profile -> 'laboral' -> 'empleosActuales')
      when jsonb_typeof(cp.standard_profile -> 'laboral' -> 'empleoActual') = 'object'
        then 1
      else 0
    end as empleos_vigentes
  from client_profiles cp
  order by cp.client_id, cp.created_at desc
),
analisis as (
  select distinct on (ar.client_id)
    ar.client_id,
    ar.id                as analisis_id,
    ar.created_at        as analisis_at,
    ar.crediscope_score  as score,
    ar.recomendacion,
    ar.indicador_riesgo,
    ar.indicador_historial,
    ar.rules_version,
    ar.fallo_tipo,
    ar.veredicto_origen
  from analysis_results ar
  order by ar.client_id, ar.created_at desc
),
conteos as (
  select client_id, count(*) filter (where true) as consultas
  from client_profiles
  group by client_id
)
select
  c.id                 as client_id,
  c.cedula,
  c.created_at         as ingreso_at,
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
  coalesce(n.consultas, 0) as consultas,
  a.analisis_id,
  a.analisis_at,
  -- Un análisis que falló guarda 500, que es el valor neutro por
  -- defecto y no un puntaje. Devolverlo acá lo haría pasar por
  -- resultado en la tabla, que es justo lo que se corrigió en el
  -- Historial (ver 050).
  case when a.fallo_tipo is null then a.score end as score,
  case when a.fallo_tipo is null then a.recomendacion end as recomendacion,
  a.indicador_riesgo,
  a.indicador_historial,
  a.rules_version,
  a.fallo_tipo,
  a.veredicto_origen,
  -- Cuándo se tocó este caso por última vez. Es la fecha por la que
  -- ordena y filtra la bandeja: a un analista le importa qué se movió
  -- hoy, no cuándo entró la persona al sistema hace ocho meses.
  greatest(
    coalesce(a.analisis_at, c.created_at),
    coalesce(p.perfil_at, c.created_at)
  ) as ultima_actividad,
  case
    when p.perfil_id is null   then 'sin_consulta'
    when a.analisis_id is null then 'sin_analisis'
    when a.fallo_tipo is not null then 'no_completado'
    else 'analizado'
  end as estado,
  coalesce(jsonb_array_length(p.control_bloqueo -> 'hallazgos'), 0) as hallazgos_control,
  coalesce(
    (select bool_or((h ->> 'bloqueante')::boolean)
       from jsonb_array_elements(coalesce(p.control_bloqueo -> 'hallazgos', '[]'::jsonb)) h),
    false
  ) as tiene_bloqueante
from clients c
left join perfil   p on p.client_id = c.id
left join analisis a on a.client_id = c.id
left join conteos  n on n.client_id = c.id;

comment on view bandeja_solicitudes is
  'Una fila por persona consultada, con su último Perfil del Cliente y su último Análisis con IA en columnas planas. Alimenta la bandeja (/solicitudes).';

-- Búsqueda por nombre. Sin esto, filtrar "CHAVEZ" obliga a recorrer los
-- 2.681 perfiles extrayendo el nombre del JSON en cada uno.
create index if not exists client_profiles_nombre_idx
  on client_profiles using gin (
    to_tsvector('simple', coalesce(standard_profile -> 'identidad' ->> 'nombreCompleto', ''))
  );

-- La cédula se busca por prefijo ("0502..."), que el índice de igualdad
-- del unique no sirve. text_pattern_ops sí.
create index if not exists clients_cedula_prefijo_idx
  on clients (cedula text_pattern_ops);


-- ------------------------------------------------------------
-- Los totales de la bandeja, con los mismos filtros que la lista.
--
-- La tabla viene paginada: contar en el navegador daría el total de la
-- página, no el de la búsqueda. Y cuatro consultas de conteo (una por
-- recomendación) son cuatro viajes para una franja de encabezado.
-- ------------------------------------------------------------
create or replace function bandeja_conteos(
  p_desde         timestamptz default null,
  p_hasta         timestamptz default null,
  p_busqueda      text        default null,
  p_recomendacion text        default null,
  p_segmento      text        default null,
  p_estado        text        default null,
  p_origen        text        default null
)
returns table (
  total          bigint,
  aprobar        bigint,
  observar       bigint,
  revisar        bigint,
  negar          bigint,
  sin_analisis   bigint,
  no_completado  bigint,
  con_bloqueo    bigint,
  piso_mediana   numeric
)
language sql
stable
-- Invoker (el default) a propósito: hereda las políticas de las tablas
-- igual que la vista. Un security definer acá sería una puerta lateral
-- para contar lo que uno no puede leer.
as $$
  select
    count(*)                                                   as total,
    count(*) filter (where b.recomendacion = 'aprobar')        as aprobar,
    count(*) filter (where b.recomendacion = 'observar')       as observar,
    count(*) filter (where b.recomendacion = 'revisar')        as revisar,
    count(*) filter (where b.recomendacion = 'negar')          as negar,
    count(*) filter (where b.estado = 'sin_analisis')          as sin_analisis,
    count(*) filter (where b.estado = 'no_completado')         as no_completado,
    count(*) filter (where b.tiene_bloqueante)                 as con_bloqueo,
    percentile_cont(0.5) within group (order by b.fuente_piso_ingreso)
      filter (where b.fuente_piso_ingreso is not null)         as piso_mediana
  from bandeja_solicitudes b
  where (p_desde is null or b.ultima_actividad >= p_desde)
    and (p_hasta is null or b.ultima_actividad <= p_hasta)
    and (p_recomendacion is null or b.recomendacion = p_recomendacion)
    and (p_segmento is null or b.fuente_segmento = p_segmento)
    and (p_estado is null or b.estado = p_estado)
    and (p_origen is null or b.perfil_origen = p_origen)
    and (
      p_busqueda is null
      or b.cedula like p_busqueda || '%'
      or b.nombre ilike '%' || p_busqueda || '%'
    );
$$;

comment on function bandeja_conteos is
  'Totales de la bandeja para un conjunto de filtros. Mismos parámetros que la lista paginada.';
