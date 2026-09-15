-- Reconstruye el historial de consumo del LLM y lo marca según de dónde
-- salió cada número.
--
-- El registro de llamadas (039) empezó a grabar el 2026-09-15. Todo lo
-- anterior quedaba fuera, y peor: parte de lo anterior YA NO SE PUEDE
-- MEDIR. El 2026-09-14 el audit_log registra 28 llamadas al modelo --
-- 12 análisis, 3 informes de retroalimentación, 1 corrida de propuestas
-- y 2 backtests de 5 y 7 casos -- y de todas ellas sobrevive UNA sola
-- fila con tokens. Las demás se borraron al limpiar datos de prueba.
--
-- La tentación es rellenar con ceros. Eso es justo el defecto que se
-- corrigió en 044: un costo desconocido informado como cero hace que uno
-- subestime su propio gasto sin que nada avise. Entonces cada llamada
-- reconstruida dice de dónde salió:
--
--   medida        el registro la grabó en vivo, con sus tokens
--   reconstruida  los tokens son reales, salen de analysis_results;
--                 solo se grabaron tarde
--   sin_datos     sabemos que la llamada ocurrió (está en el audit_log)
--                 pero sus tokens se perdieron. El costo NO es cero:
--                 es desconocido.

alter table llm_llamadas add column origen_medicion text not null default 'medida';

alter table llm_llamadas
  add constraint llm_llamadas_origen_medicion_check
  check (origen_medicion in ('medida', 'reconstruida', 'sin_datos'));

comment on column llm_llamadas.origen_medicion is
  'De dónde salen los tokens de esta fila. sin_datos significa costo desconocido, nunca cero.';

-- El razonamiento interno se factura como salida y es donde creció el
-- costo: de 651 tokens por análisis el 2026-09-03 a 2.948 el 2026-09-15,
-- mientras la respuesta útil se quedó en ~1.200. Sin separarlo del resto
-- de la salida no se ve de dónde viene el aumento.
alter table llm_llamadas add column tokens_razonamiento integer;

comment on column llm_llamadas.tokens_razonamiento is
  'Parte de tokens_salida que el modelo usó para razonar antes de responder. Va incluido en tokens_salida, no se suma aparte.';

-- ---------- 1. Análisis con tokens reales ----------
insert into llm_llamadas (
  funcion, modelo, client_id, analysis_result_id, contexto, exito,
  stop_reason, tokens_entrada, tokens_salida, tokens_cache_escritura,
  tokens_cache_lectura, tokens_razonamiento, duracion_ms, request_id,
  es_prueba, created_at, origen_medicion
)
select
  'analyze-client',
  ar.llm_model,
  ar.client_id,
  ar.id,
  jsonb_build_object('marco', ar.rules_version),
  true,
  ar.llm_stop_reason,
  coalesce((ar.llm_usage ->> 'input_tokens')::int, 0),
  coalesce((ar.llm_usage ->> 'output_tokens')::int, 0),
  coalesce((ar.llm_usage ->> 'cache_creation_input_tokens')::int, 0),
  coalesce((ar.llm_usage ->> 'cache_read_input_tokens')::int, 0),
  (ar.llm_usage -> 'output_tokens_details' ->> 'thinking_tokens')::int,
  ar.duracion_llm_ms,
  ar.llm_request_id,
  -- Hasta hoy nadie pagó por una consulta: todo el histórico es
  -- desarrollo y validación nuestra.
  true,
  ar.created_at,
  'reconstruida'
from analysis_results ar
where ar.llm_model is not null
  and ar.llm_usage is not null
  and (ar.llm_usage ->> 'output_tokens')::int > 0
  -- Las que el registro ya grabó en vivo no se duplican.
  and not exists (
    select 1 from llm_llamadas l
     where l.request_id is not null
       and l.request_id = ar.llm_request_id
  );

-- ---------- 2. Análisis cuyos tokens se perdieron ----------
-- Están en el audit_log pero su fila de análisis ya no existe.
insert into llm_llamadas (funcion, modelo, contexto, exito, created_at, origen_medicion, es_prueba)
select
  'analyze-client',
  'desconocido',
  jsonb_build_object(
    'ingestion_run_id', al.meta ->> 'ingestion_run_id',
    'nota', 'la fila de análisis se borró; los tokens no se pueden recuperar'
  ),
  true,
  al.created_at,
  'sin_datos',
  true
from audit_log al
where al.action = 'client.analyze'
  and al.meta ->> 'ingestion_run_id' is not null
  and not exists (
    select 1 from analysis_results ar
     where ar.ingestion_run_id = (al.meta ->> 'ingestion_run_id')::uuid
  );

-- ---------- 3. Retroalimentación: informes y propuestas ----------
-- Una llamada por corrida. El informe manda el paquete entero de casos
-- en un solo pedido (max_tokens 16.000); las propuestas, 8.000.
insert into llm_llamadas (funcion, modelo, contexto, exito, max_tokens, created_at, origen_medicion, es_prueba)
select
  case al.action when 'feedback.informe' then 'analizar-feedback' else 'proponer-ajustes' end,
  'desconocido',
  al.meta || jsonb_build_object('nota', 'corrida anterior al registro de consumo; los tokens no quedaron'),
  true,
  case al.action when 'feedback.informe' then 16000 else 8000 end,
  al.created_at,
  'sin_datos',
  true
from audit_log al
where al.action in ('feedback.informe', 'feedback.propuestas');

-- ---------- 4. Backtests: una llamada POR CASO ----------
-- Acá está el multiplicador que nadie veía: un clic en "correr
-- backtest" no es una llamada, son tantas como casos tenga el paquete.
-- meta.casos dice cuántas evaluó cada corrida.
insert into llm_llamadas (funcion, modelo, contexto, exito, max_tokens, created_at, origen_medicion, es_prueba)
select
  'correr-backtest',
  'desconocido',
  al.meta || jsonb_build_object('nota', 'corrida anterior al registro de consumo; los tokens no quedaron'),
  true,
  6000,
  al.created_at,
  'sin_datos',
  true
from audit_log al
cross join lateral generate_series(1, coalesce((al.meta ->> 'casos')::int, 1)) as caso
where al.action = 'feedback.backtest';

-- ---------- Vista ----------
-- costo_usd se anula cuando no hay con qué calcularlo. Una suma sobre la
-- columna ignora los nulos, así que el total siempre se lee junto a
-- cuántas llamadas quedaron sin medir.
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
  -- Para qué se gastó, sin que cada pantalla lo vuelva a deducir.
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

comment on view llm_costos is
  'Cada llamada al LLM con su costo. costo_usd null = no se puede calcular (ver origen_medicion). precio_faltante = falta cargar el modelo en llm_precios.';
