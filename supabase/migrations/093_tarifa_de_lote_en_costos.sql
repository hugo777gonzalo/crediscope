-- La tarifa de la API de lotes de Anthropic en el costo (2026-10-03).
--
-- El lote del Laboratorio corre por la API de lotes (Message Batches), que
-- cobra la mitad. llm_costos valuaba todo a precio de lista: un lote de
-- USD 10 habría figurado como 20 y, con el presupuesto mensual en 10, los
-- avisos del 70, 85 y 100% habrían saltado por un gasto que no existió.
--
-- 1. llm_llamadas.tarifa: 'estandar' (todo lo anterior y lo que sale de las
--    funciones) o 'lote'. La escribe registrarLlamadaLlm() sólo cuando es
--    'lote', así que no hace falta redesplegar nada.
-- 2. llm_costos: la misma vista, con el costo a la mitad cuando la tarifa
--    es 'lote' y la tarifa como columna NUEVA AL FINAL. La vista se armó con
--    l.*, que se expande al crearla: acá se escriben las 23 columnas de
--    llm_llamadas una por una, en su orden, para que la tarifa no se meta
--    en el medio (regla 5 de CLAUDE.md). Depende de ella gasto_del_mes,
--    que no cambia.

alter table llm_llamadas
  add column tarifa text not null default 'estandar' check (tarifa in ('estandar', 'lote'));

create or replace view llm_costos with (security_invoker = on) as
select
  l.id, l.funcion, l.modelo, l.client_id, l.analysis_result_id, l.contexto,
  l.exito, l.error, l.stop_reason, l.tokens_entrada, l.tokens_salida,
  l.tokens_cache_escritura, l.tokens_cache_lectura, l.duracion_ms,
  l.request_id, l.es_prueba, l.actor, l.created_at, l.razonamiento,
  l.max_tokens, l.origen_medicion, l.tokens_razonamiento, l.fallo_tipo,
  p.usd_entrada, p.usd_salida, p.usd_cache_escritura, p.usd_cache_lectura,
  (p.modelo is null and l.origen_medicion <> 'sin_datos') as precio_faltante,
  case when l.origen_medicion = 'sin_datos' then null else
    round(
      (l.tokens_entrada * coalesce(p.usd_entrada, 0)
       + l.tokens_salida * coalesce(p.usd_salida, 0)
       + l.tokens_cache_escritura * coalesce(p.usd_cache_escritura, 0)
       + l.tokens_cache_lectura * coalesce(p.usd_cache_lectura, 0)
      ) / 1000000.0
      * case when l.tarifa = 'lote' then 0.5 else 1 end, 6)
  end as costo_usd,
  case
    when l.funcion = 'analyze-client' and l.es_prueba then 'prueba'
    when l.funcion = 'analyze-client' then 'consulta'
    else 'calibracion'
  end as naturaleza,
  fecha_ec(l.created_at) as dia_ec,
  l.tarifa
from llm_llamadas l
left join lateral (
  select * from llm_precios pr
   where pr.modelo = l.modelo
     and pr.vigente_desde <= fecha_ec(l.created_at)
   order by pr.vigente_desde desc
   limit 1
) p on true;
