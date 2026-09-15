-- Un análisis que falló deja de hacerse pasar por un análisis.
--
-- Cuando la llamada al modelo fallaba, igual se guardaba una fila de
-- análisis con score 500, recomendación "revisar" y -- lo peor -- el
-- texto crudo del error de la API en narrative_summary. En pantalla eso
-- se veía como el Resumen del cliente: un párrafo con "HTTP 400 Bad
-- Request, request-id=..." donde tenía que ir el criterio sobre una
-- persona. Un analista apurado podía leer "500 / Revisar" como un
-- veredicto del sistema cuando el sistema no había opinado nada.
--
-- La fila se sigue guardando: hubo una ingesta real, se pagó la
-- consulta a la fuente y queda el rastro. Pero ahora dice que falló.

alter table analysis_results add column fallo text;
alter table analysis_results add column fallo_tipo text;

comment on column analysis_results.fallo is
  'Detalle técnico del error cuando el análisis no se pudo completar. Si no es null, el score y la recomendación NO son un juicio: son el valor por defecto.';
comment on column analysis_results.fallo_tipo is
  'Causa clasificada (ver _shared/fallos-llm.ts): tope_de_gasto, credencial, limite_velocidad, proveedor_caido, respuesta_cortada, respuesta_ilegible, sin_conexion, desconocido.';

-- La misma causa en el registro de consumo. Sin esto no se puede
-- responder cuánto duró cada incidente ni cuál fue el más frecuente,
-- que es lo que sostiene un compromiso de tiempo de resolución.
alter table llm_llamadas add column fallo_tipo text;

comment on column llm_llamadas.fallo_tipo is
  'Causa clasificada de la falla. Null cuando la llamada fue exitosa.';

create index llm_llamadas_fallo_idx on llm_llamadas (fallo_tipo, created_at desc)
  where fallo_tipo is not null;

-- Las que ya están registradas se clasifican con el mismo criterio que
-- aplica el código, para no arrancar el historial de incidentes vacío.
update llm_llamadas
   set fallo_tipo = case
     when error ilike '%usage limit%' or error ilike '%credit balance%' then 'tope_de_gasto'
     when error ilike '%http 401%' or error ilike '%http 403%' or error ilike '%api key%' then 'credencial'
     when error ilike '%http 429%' or error ilike '%rate limit%' or error ilike '%overloaded%' then 'limite_velocidad'
     when error ~* 'http 5[0-9][0-9]' then 'proveedor_caido'
     when error ilike '%no se pudo interpretar%' or error ilike '%sin bloque de texto%' then 'respuesta_ilegible'
     when error ilike '%fetch failed%' or error ilike '%timeout%' then 'sin_conexion'
     else 'desconocido'
   end
 where exito = false and error is not null;

-- La vista hereda las columnas nuevas.
drop view if exists llm_costos;
create view llm_costos as
select
  l.*,
  p.usd_entrada, p.usd_salida, p.usd_cache_escritura, p.usd_cache_lectura,
  (p.modelo is null and l.origen_medicion <> 'sin_datos') as precio_faltante,
  case when l.origen_medicion = 'sin_datos' then null else
    round(
      (l.tokens_entrada * coalesce(p.usd_entrada, 0)
       + l.tokens_salida * coalesce(p.usd_salida, 0)
       + l.tokens_cache_escritura * coalesce(p.usd_cache_escritura, 0)
       + l.tokens_cache_lectura * coalesce(p.usd_cache_lectura, 0)
      ) / 1000000.0, 6)
  end as costo_usd,
  case
    when l.funcion = 'analyze-client' and l.es_prueba then 'prueba'
    when l.funcion = 'analyze-client' then 'consulta'
    else 'calibracion'
  end as naturaleza
from llm_llamadas l
left join lateral (
  select * from llm_precios pr
   where pr.modelo = l.modelo
     and pr.vigente_desde <= l.created_at::date
   order by pr.vigente_desde desc
   limit 1
) p on true;

alter view llm_costos set (security_invoker = on);

comment on view llm_costos is
  'Cada llamada al LLM con su costo. costo_usd null = no se puede calcular (ver origen_medicion). precio_faltante = falta cargar el modelo en llm_precios.';
