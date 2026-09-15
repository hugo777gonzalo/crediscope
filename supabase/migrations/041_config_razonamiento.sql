-- Registra con qué configuración de razonamiento se hizo cada llamada.
--
-- Sin esto, el consumo no se puede explicar: el razonamiento interno del
-- modelo es ~70% de los tokens de salida, y la salida es más de la mitad
-- del costo. Medido sobre un mismo cliente, 3 corridas de cada una:
--   con razonamiento:  3.965 tokens de salida promedio, 50s
--   sin razonamiento:  1.105 tokens de salida promedio, 14s
--
-- Si mañana cambiamos esa configuración y no queda registrada, una
-- semana va a costar el triple que la otra sin explicación visible en
-- los datos -- que es exactamente el problema que este registro vino a
-- resolver.

alter table llm_llamadas add column razonamiento text;
alter table llm_llamadas add column max_tokens integer;

alter table llm_llamadas
  add constraint llm_llamadas_razonamiento_check
  check (razonamiento is null or razonamiento in ('activo', 'desactivado', 'adaptativo'));

comment on column llm_llamadas.razonamiento is
  'Configuración de razonamiento interno del modelo en esa llamada. activo = por defecto del modelo (no se envía nada); desactivado = thinking.type=disabled; adaptativo = thinking.type=adaptive con output_config.effort. null = llamadas anteriores a este registro.';

-- La vista de costos hereda las columnas nuevas (select l.*).
drop view if exists llm_costos;
create view llm_costos as
select
  l.*,
  p.usd_entrada, p.usd_salida, p.usd_cache_escritura, p.usd_cache_lectura,
  round(
    (l.tokens_entrada * coalesce(p.usd_entrada, 0)
     + l.tokens_salida * coalesce(p.usd_salida, 0)
     + l.tokens_cache_escritura * coalesce(p.usd_cache_escritura, 0)
     + l.tokens_cache_lectura * coalesce(p.usd_cache_lectura, 0)
    ) / 1000000.0, 6) as costo_usd
from llm_llamadas l
left join lateral (
  select * from llm_precios pr
   where pr.modelo = l.modelo
     and pr.vigente_desde <= l.created_at::date
   order by pr.vigente_desde desc
   limit 1
) p on true;
