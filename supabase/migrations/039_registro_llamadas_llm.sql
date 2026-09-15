-- Registro de consumo del LLM: una fila por llamada, con su costo.
--
-- Por qué hacía falta, en concreto:
--   - Solo analyze-client guardaba uso de tokens, y dentro de la fila
--     del análisis. proponer-ajustes y correr-backtest no guardaban
--     NADA -- y una sola corrida de backtesting son 20 llamadas al
--     modelo. Iba a ser el mayor consumidor y era invisible.
--   - Lo que se guardaba eran tokens, no costo: nadie multiplicaba por
--     el precio.
--   - Las llamadas que fallan antes de persistir un resultado (error de
--     la API, respuesta cortada) no dejaban rastro, aunque se pagan
--     igual si el modelo alcanzó a generar tokens.
--   - Y al limpiar datos de prueba se borraban las filas de análisis,
--     que eran el único registro del consumo. De ahí es_prueba: se
--     marcan en vez de borrarse.
--
-- Sirve para las dos preguntas del modelo de negocio: cuánto cuesta una
-- consulta (tarifa por consulta) y cuánto consume un cliente al mes
-- (tarifa SaaS).

-- ---------- PRECIOS ----------
-- Con vigencia por fecha: cuando Anthropic cambie tarifas se agrega una
-- fila nueva y el histórico sigue valuado al precio que regía ese día.
-- Recalcular todo con el precio de hoy daría una cifra que nunca pasó.
create table llm_precios (
  id                    uuid primary key default gen_random_uuid(),
  modelo                text not null,
  vigente_desde         date not null,
  -- Precios en USD por MILLÓN de tokens (como los publica Anthropic).
  usd_entrada           numeric(10, 4) not null,
  usd_salida            numeric(10, 4) not null,
  usd_cache_escritura   numeric(10, 4) not null default 0,
  usd_cache_lectura     numeric(10, 4) not null default 0,
  fuente                text,
  created_at            timestamptz not null default now(),
  unique (modelo, vigente_desde)
);

comment on table llm_precios is
  'Tarifas por millón de tokens, con vigencia por fecha. Confirmar contra la factura real antes de usar estos números para tarifar.';

-- Valores de referencia para arrancar. NO son una factura: hay que
-- contrastarlos con el consumo real de la consola de Anthropic.
insert into llm_precios (modelo, vigente_desde, usd_entrada, usd_salida, usd_cache_escritura, usd_cache_lectura, fuente) values
  ('claude-sonnet-5', '2026-09-01', 3.00, 15.00, 3.75, 0.30, 'precio de lista de referencia — PENDIENTE de confirmar contra la factura');

-- ---------- LLAMADAS ----------
create table llm_llamadas (
  id                      uuid primary key default gen_random_uuid(),
  funcion                 text not null,   -- analyze-client, analizar-feedback, proponer-ajustes, correr-backtest
  modelo                  text not null,
  -- A qué se refería la llamada. client_id/analysis_result_id quedan en
  -- null si eso se borra: el costo ya ocurrió y no se borra con él.
  client_id               uuid references clients(id) on delete set null,
  analysis_result_id      uuid references analysis_results(id) on delete set null,
  contexto                jsonb not null default '{}'::jsonb,  -- cédula, paquete_id, informe_id...
  exito                   boolean not null,
  error                   text,
  stop_reason             text,
  tokens_entrada          integer not null default 0,
  tokens_salida           integer not null default 0,
  tokens_cache_escritura  integer not null default 0,
  tokens_cache_lectura    integer not null default 0,
  duracion_ms             integer,
  request_id              text,
  -- Las corridas de verificación del equipo técnico se marcan, no se
  -- borran: si no, el consumo medido no cierra con la factura.
  es_prueba               boolean not null default false,
  actor                   uuid,
  created_at              timestamptz not null default now()
);

create index llm_llamadas_created_at_idx on llm_llamadas (created_at desc);
create index llm_llamadas_funcion_idx on llm_llamadas (funcion, created_at desc);

-- ---------- COSTO ----------
-- El precio se resuelve por fecha: el vigente más reciente que no sea
-- posterior a la llamada.
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

comment on view llm_costos is
  'Cada llamada con su costo, valuada al precio vigente ese día. costo_usd es null-safe: si falta el precio del modelo, da 0 -- revisar llm_precios.';

alter table llm_llamadas enable row level security;
alter table llm_precios enable row level security;

-- Mismo criterio que el resto del proyecto: cualquier autenticado lee,
-- solo la service_role (Edge Functions) escribe.
create policy llm_llamadas_read on llm_llamadas for select using (auth.role() = 'authenticated');
create policy llm_precios_read on llm_precios for select using (auth.role() = 'authenticated');
