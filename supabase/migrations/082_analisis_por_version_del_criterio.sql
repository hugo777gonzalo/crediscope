-- ============================================================
-- Cuántos análisis se hicieron con cada versión del criterio, contado
-- en la base.
--
-- El historial del criterio (VersionesCriterio.jsx) bajaba el
-- criterio_version_id de TODOS los analysis_results para contarlos en
-- el navegador. PostgREST corta en 1.000 filas sin avisar, así que
-- pasado ese número la columna "Análisis con esta versión" habría
-- contado de menos, y como la lectura no tenía orden, ni siquiera se
-- sabría cuáles faltaban. El 2026-09-24 eran 64 análisis, 6 de ellos
-- con versión: todavía no mordía.
--
-- Devuelve un solo objeto {versión: cantidad}, la forma que la pantalla
-- ya usaba. Una sola fila no la corta ningún max-rows.
--
-- Los análisis sin versión (anteriores a la 030) no cuentan para
-- ninguna, igual que antes.
-- ============================================================

create or replace function analisis_por_version_del_criterio()
returns jsonb
language sql
stable
-- Invoker, como metricas_gerenciales() (070): hereda las políticas de
-- analysis_results. Un security definer acá contaría lo que quien
-- pregunta no puede leer.
as $$
  select coalesce(jsonb_object_agg(criterio_version_id::text, n), '{}'::jsonb)
  from (
    select criterio_version_id, count(*) as n
    from analysis_results
    where criterio_version_id is not null
    group by criterio_version_id
  ) t;
$$;

comment on function analisis_por_version_del_criterio is
  'Cantidad de análisis producidos con cada versión del criterio, como {criterio_version_id: n}. Reemplaza el conteo en el navegador de getUsoPorVersion(), que bajaba una fila por análisis y se cortaba en 1.000.';
