-- Corrección de los precios con los que se valúa el consumo del LLM.
--
-- La tabla se sembró con una fila de referencia y quedaron dos errores
-- que hacían que el costo medido no sirviera para tarifar:
--
--   1. claude-sonnet-5 estaba cargado a 3/15 USD por millón, que es la
--      tarifa de Sonnet 4.6, no la de Sonnet 5 (2/10). Todo el histórico
--      quedaba sobrevaluado ~50%.
--   2. Haiku no existía en la tabla. Como el precio se resuelve con un
--      join por nombre de modelo, cada llamada a Haiku se valuaba en
--      CERO. Justo ahora que Haiku es el modelo base de la cascada, el
--      tablero iba a informar que la mayoría de las consultas son
--      gratis.
--
-- No se agrega una fila con vigencia nueva: no hubo un cambio de tarifa,
-- el precio estaba mal desde el principio. Se corrige en su lugar para
-- que el histórico quede valuado a lo que realmente costó.
update llm_precios
   set usd_entrada = 2.00,
       usd_salida = 10.00,
       -- Escribir el caché cuesta 1,25x la entrada; leerlo, 0,1x.
       usd_cache_escritura = 2.50,
       usd_cache_lectura = 0.20,
       fuente = 'lista Anthropic — PENDIENTE de confirmar contra la factura'
 where modelo = 'claude-sonnet-5';

-- Las dos escrituras del identificador de Haiku: el código manda el id
-- con fecha y la API puede responder con el corto. El join es por
-- igualdad exacta, así que si falta una, esas llamadas valen cero.
insert into llm_precios (modelo, vigente_desde, usd_entrada, usd_salida, usd_cache_escritura, usd_cache_lectura, fuente) values
  ('claude-haiku-4-5-20251001', '2026-09-01', 1.00, 5.00, 1.25, 0.10, 'lista Anthropic — PENDIENTE de confirmar contra la factura'),
  ('claude-haiku-4-5',          '2026-09-01', 1.00, 5.00, 1.25, 0.10, 'lista Anthropic — PENDIENTE de confirmar contra la factura')
on conflict (modelo, vigente_desde) do update
  set usd_entrada = excluded.usd_entrada,
      usd_salida = excluded.usd_salida,
      usd_cache_escritura = excluded.usd_cache_escritura,
      usd_cache_lectura = excluded.usd_cache_lectura,
      fuente = excluded.fuente;

-- El defecto de fondo no era el precio de Haiku: era que un modelo sin
-- precio se informaba como costo cero en vez de como dato faltante. Así
-- se subestima el propio costo sin que nada avise. Ahora la vista lo
-- dice.
create or replace view llm_costos as
select
  l.*,
  p.usd_entrada, p.usd_salida, p.usd_cache_escritura, p.usd_cache_lectura,
  round(
    (l.tokens_entrada * coalesce(p.usd_entrada, 0)
     + l.tokens_salida * coalesce(p.usd_salida, 0)
     + l.tokens_cache_escritura * coalesce(p.usd_cache_escritura, 0)
     + l.tokens_cache_lectura * coalesce(p.usd_cache_lectura, 0)
    ) / 1000000.0, 6) as costo_usd,
  -- Va al final a propósito: create or replace no deja insertar una
  -- columna en medio de una vista que ya existe.
  (p.modelo is null) as precio_faltante
from llm_llamadas l
left join lateral (
  select * from llm_precios pr
   where pr.modelo = l.modelo
     and pr.vigente_desde <= l.created_at::date
   order by pr.vigente_desde desc
   limit 1
) p on true;

comment on view llm_costos is
  'Cada llamada con su costo, valuada al precio vigente ese día. Si precio_faltante es true el costo NO es cero: es desconocido, falta cargar el modelo en llm_precios.';
