-- ============================================================
-- Reparar los 373 perfiles que una caída de la fuente dejó
-- clasificados como "informal o sin actividad".
--
-- El 2026-09-15, entre las 17:00 y las 18:00, la fuente falló. De 914
-- consultas de esa hora, 373 devolvieron error en los nueve bloques. El
-- sistema guardó el perfil igual y la clasificación de ingresos, al no
-- encontrar aportes ni RUC, cayó en su rama por defecto: informal.
--
-- El resultado es que el 74% de ese segmento (373 de 503) no describe a
-- nadie: describe una caída de red. Y 370 personas de la cartera --el
-- 14%-- no tienen ninguna otra consulta buena.
--
-- Esta migración hace tres cosas: deja registrado cuántos ejes contestó
-- cada consulta, reclasifica las que no contestaron ninguno, y saca de
-- las pantallas lo que no es información.
--
-- El código que impide que vuelva a pasar está en
-- _shared/calidad-de-la-consulta.ts.
-- ============================================================

-- ---------- 1. Cuántos ejes contestó cada consulta ----------
--
-- Estaba adentro del JSON (metaConsulta.ejesOk) y por eso nadie lo
-- miraba: averiguarlo obligaba a abrir el perfil entero de cada
-- persona. Plano, se puede filtrar.
alter table client_profiles add column if not exists ejes_ok integer;

update client_profiles
   set ejes_ok = jsonb_array_length(coalesce(standard_profile -> 'metaConsulta' -> 'ejesOk', '[]'::jsonb))
 where ejes_ok is null;

alter table client_profiles alter column ejes_ok set not null;
alter table client_profiles alter column ejes_ok set default 0;

comment on column client_profiles.ejes_ok is
  'Cuántos de los nueve ejes contestó la fuente. 0 = la consulta falló entera y el perfil no describe a nadie. Ver _shared/calidad-de-la-consulta.ts.';

create index if not exists client_profiles_ejes_ok_idx on client_profiles (ejes_ok);


-- ---------- 2. Reclasificar lo que no es informal ----------
--
-- Se tocan las dos copias: la columna plana y el JSON. Son la misma
-- verdad guardada dos veces (ver 043) y dejarlas distintas convertiría
-- una corrección en una inconsistencia nueva.
--
-- No se toca fuente_version: esos perfiles los produjo fuentes-v1 y
-- decir lo contrario sería falsear la trazabilidad. Lo que cambió es el
-- dato, corregido a mano, y el motivo lo dice.
update client_profiles
   set fuente_segmento = 'sin_datos',
       fuente_estado   = 'indeterminada',
       standard_profile = jsonb_set(
         jsonb_set(
           jsonb_set(standard_profile, '{fuentesIngreso,segmento}', '"sin_datos"'),
           '{fuentesIngreso,estadoSegmento}', '"indeterminada"'
         ),
         '{fuentesIngreso,motivoSegmento}',
         to_jsonb(
           'La fuente no respondió ninguno de los nueve ejes en esta consulta, así que no hay con qué clasificar el ingreso. ' ||
           'Quedó como "informal o sin actividad" por la rama por defecto de fuentes-v1; corregido el 2026-09-16 (migración 065). ' ||
           'Hay que volver a consultar a esta persona.'
         )
       )
 where ejes_ok = 0;


-- ---------- 3. Que las pantallas dejen de contarlos ----------
--
-- La vista de la bandeja gana dos columnas: cuántos ejes contestó la
-- consulta y si sirve. No se filtran acá -- la bandeja SÍ tiene que
-- mostrarlos, porque son justamente las personas a reconsultar. Lo que
-- no puede pasar es que un panorama los cuente como informales.
create or replace view bandeja_solicitudes with (security_invoker = on) as
with perfil as (
  select distinct on (cp.client_id)
    cp.client_id,
    cp.id                                                     as perfil_id,
    cp.created_at                                             as perfil_at,
    cp.origen                                                 as perfil_origen,
    cp.lote_id,
    cp.structure_version,
    cp.ejes_ok,
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
    -- `empleosActuales` (arreglo). Se lee el formato que cada perfil
    -- tenga: leer solo el arreglo mostraba "0 empleos" para 1.097
    -- personas que sí trabajan.
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
  select client_id, count(*) as consultas
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
  -- defecto y no un puntaje (ver 050).
  case when a.fallo_tipo is null then a.score end as score,
  case when a.fallo_tipo is null then a.recomendacion end as recomendacion,
  a.indicador_riesgo,
  a.indicador_historial,
  a.rules_version,
  a.fallo_tipo,
  a.veredicto_origen,
  greatest(
    coalesce(a.analisis_at, c.created_at),
    coalesce(p.perfil_at, c.created_at)
  ) as ultima_actividad,
  -- El estado ahora distingue la consulta que no se pudo hacer de la
  -- persona que todavía no se analizó. No son lo mismo: una espera a un
  -- analista, la otra espera a que alguien vuelva a preguntarle a la
  -- fuente.
  case
    when p.perfil_id is null      then 'sin_consulta'
    when coalesce(p.ejes_ok, 0) = 0 then 'consulta_fallida'
    when a.analisis_id is null    then 'sin_analisis'
    when a.fallo_tipo is not null then 'no_completado'
    else 'analizado'
  end as estado,
  coalesce(jsonb_array_length(p.control_bloqueo -> 'hallazgos'), 0) as hallazgos_control,
  coalesce(
    (select bool_or((h ->> 'bloqueante')::boolean)
       from jsonb_array_elements(coalesce(p.control_bloqueo -> 'hallazgos', '[]'::jsonb)) h),
    false
  ) as tiene_bloqueante,
  -- Las dos columnas nuevas van al final, y no donde tendrían sentido
  -- leerlas. `create or replace view` no sabe insertar una columna en
  -- el medio: renombra la que estaba en esa posición y falla. Ya pasó
  -- en la 044 con precio_faltante.
  coalesce(p.ejes_ok, 0) as ejes_ok,
  coalesce(p.ejes_ok, 0) > 0 as consulta_util
from clients c
left join perfil   p on p.client_id = c.id
left join analisis a on a.client_id = c.id
left join conteos  n on n.client_id = c.id;

comment on view bandeja_solicitudes is
  'Una fila por persona consultada, con su último Perfil del Cliente y su último Análisis con IA en columnas planas. estado = consulta_fallida cuando la fuente no contestó ningún eje. Alimenta la bandeja (/solicitudes).';


-- ---------- 4. Los conteos, con la misma búsqueda que la lista ----------
--
-- La lista decide entre cédula y nombre según si el texto son solo
-- dígitos; esta función buscaba por los dos a la vez. Hoy dan el mismo
-- resultado y por eso nadie lo notó, pero son dos definiciones de una
-- sola regla. Ahora es una.
--
-- Hay que borrarla antes: la función gana una columna de salida y
-- `create or replace` no puede cambiar el tipo de retorno.
drop function if exists bandeja_conteos(timestamptz, timestamptz, text, text, text, text, text);

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
  total             bigint,
  aprobar           bigint,
  observar          bigint,
  revisar           bigint,
  negar             bigint,
  sin_analisis      bigint,
  no_completado     bigint,
  consulta_fallida  bigint,
  con_bloqueo       bigint,
  piso_mediana      numeric
)
language sql
stable
as $$
  select
    count(*)                                                   as total,
    count(*) filter (where b.recomendacion = 'aprobar')        as aprobar,
    count(*) filter (where b.recomendacion = 'observar')       as observar,
    count(*) filter (where b.recomendacion = 'revisar')        as revisar,
    count(*) filter (where b.recomendacion = 'negar')          as negar,
    count(*) filter (where b.estado = 'sin_analisis')          as sin_analisis,
    count(*) filter (where b.estado = 'no_completado')         as no_completado,
    count(*) filter (where b.estado = 'consulta_fallida')      as consulta_fallida,
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
      or (p_busqueda ~ '^\d+$' and b.cedula like p_busqueda || '%')
      or (p_busqueda !~ '^\d+$' and b.nombre ilike '%' || p_busqueda || '%')
    );
$$;


-- ---------- 5. Cerrar las ingestas que quedaron a medias ----------
--
-- Trece filas en 'en_progreso' desde el 3 y hasta el 12 de septiembre,
-- sin completed_at y sin resultado. No estaban corriendo: se
-- interrumpieron y nadie las cerró. Dejarlas así hace que cualquier
-- métrica de "cuántas consultas se están procesando" mienta para
-- siempre.
update ingestion_runs
   set status = 'fallido',
       completed_at = now()
 where status = 'en_progreso'
   and created_at < now() - interval '1 hour';


-- ---------- 6. Una sola versión del marco activa ----------
--
-- marco-v19 y marco-v20 estaban las dos en is_active. La columna no la
-- lee ni una línea de código --la versión que rige es la constante
-- MARCO_VERSION del archivo del marco-- así que no rompía nada, pero
-- contradecía al sistema para cualquiera que la mirara para saber qué
-- está vigente.
--
-- Se deja la más nueva. Que la columna siga sin lector es otra
-- discusión; lo que no puede es mentir.
update scoring_rules_versions set is_active = false where is_active;
update scoring_rules_versions set is_active = true
 where version = (select version from scoring_rules_versions order by created_at desc limit 1);


-- ---------- 7. La versión de la clasificación de ingresos ----------
insert into fuentes_ingreso_versiones (version, descripcion) values
  ('fuentes-v2',
   'Agrega el segmento sin_datos: cuando el bloque que trae los aportes al IESS no contestó, no se puede afirmar que la persona no aporte. Antes esa rama decía "informal o sin actividad", que es un juicio sobre la persona y no sobre la consulta.')
on conflict (version) do nothing;


-- ---------- 8. Una fila de precios que nunca se usó ----------
--
-- Se cargaron las dos grafías del identificador de Haiku por
-- precaución, y la fuente usa siempre la larga. La corta quedó en cero
-- llamadas: un precio que no valúa nada es ruido en una tabla que se
-- mira para entender la factura.
delete from llm_precios p
 where p.modelo = 'claude-haiku-4-5'
   and not exists (select 1 from llm_llamadas l where l.modelo = p.modelo);
