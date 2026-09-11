-- ============================================================
-- CrediScope — Esquema de base de datos (Supabase / Postgres)
-- Guarda SOLO los resultados del análisis (score, resúmenes, estado por
-- bloque). Los datos crudos de Novadata NO se persisten aquí — se
-- consultan en vivo desde la Edge Function `analyze-client` y se
-- descartan tras normalizarlos y calcular el resultado.
--
-- Pegar en el editor SQL de Supabase. Requiere la extensión pgcrypto.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- CLIENTES ----------

create table clients (
  id          uuid primary key default gen_random_uuid(),
  cedula      text not null unique,
  created_at  timestamptz not null default now()
);

-- ---------- CORRIDAS DE INGESTA ----------
-- Una fila por cada vez que se dispara un análisis. block_status guarda,
-- por cada uno de los 9 bloques de Novadata, si la consulta fue 'ok',
-- 'faltante' (Novadata respondió pero sin datos) o 'error' (falla técnica).
-- Esa distinción es la que permite luego interpretar "información
-- faltante" como señal de negocio y no como fallo del sistema.

create type ingestion_status_t as enum ('en_progreso', 'completado', 'fallido');

create table ingestion_runs (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  status         ingestion_status_t not null default 'en_progreso',
  block_status   jsonb not null default '{}'::jsonb,
  requested_by   uuid, -- auth.users.id de quien disparó el análisis (o null si fue automático/API)
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- ---------- VERSIONES DEL MARCO INTERPRETATIVO ----------
-- El score lo calcula un LLM guiado por un marco interpretativo en
-- lenguaje natural (ver supabase/functions/_shared/marco-interpretativo.ts),
-- no una fórmula de pesos numéricos — `weights` queda sin uso real,
-- se mantiene por compatibilidad de esquema. Cada análisis queda ligado
-- a la versión del marco que lo produjo, para poder auditar/reproducir
-- por qué un cliente obtuvo tal score aunque el marco cambie después.

create table scoring_rules_versions (
  id            uuid primary key default gen_random_uuid(),
  version       text not null unique, -- p.ej. 'framework-v0', 'framework-v1'
  description   text,
  weights       jsonb not null default '{}'::jsonb, -- sin uso con scoring por LLM, ver nota arriba
  is_active     boolean not null default false,
  created_at    timestamptz not null default now()
);

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('framework-v0', 'Marco interpretativo draft para scoring por LLM — validar con el negocio', '{}'::jsonb, true);

-- ---------- RESULTADOS DEL ANÁLISIS ----------

create table analysis_results (
  id                  uuid primary key default gen_random_uuid(),
  ingestion_run_id    uuid not null references ingestion_runs(id) on delete cascade,
  client_id           uuid not null references clients(id) on delete cascade,
  crediscope_score    int not null check (crediscope_score >= 1 and crediscope_score <= 999),
  rules_version       text not null references scoring_rules_versions(version),
  block_status        jsonb not null default '{}'::jsonb, -- copia denormalizada para lectura rápida en el reporte
  positives           jsonb not null default '[]'::jsonb,
  negatives           jsonb not null default '[]'::jsonb,
  missing_info        jsonb not null default '[]'::jsonb,
  inconsistencies     jsonb not null default '[]'::jsonb,
  narrative_summary   text,
  created_at          timestamptz not null default now()
);

create index analysis_results_client_id_created_at_idx
  on analysis_results (client_id, created_at desc);

-- ---------- AUDITORÍA ----------
-- Quién consultó/generó un análisis para qué cliente y cuándo. Dado que
-- los bloques incluyen Fiscalía, Función Judicial y Bancos, este registro
-- es clave para cumplimiento (LOPDP) y para poder responder "¿quién vio
-- la información de este cliente?".

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor         uuid, -- auth.users.id, null si fue una llamada de API externa
  action        text not null, -- 'client.analyze', 'client.view', ...
  client_id     uuid references clients(id) on delete set null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Herramienta interna: cualquier usuario autenticado (analista) puede
-- LEER todo. Las escrituras en ingestion_runs / analysis_results /
-- audit_log solo las hace la Edge Function, que usa la service_role key
-- (esa key bypassa RLS por diseño de Supabase) — nunca el cliente
-- directo. Así el score y el log de auditoría no se pueden falsificar
-- desde el navegador.
-- ============================================================

alter table clients                  enable row level security;
alter table ingestion_runs           enable row level security;
alter table scoring_rules_versions   enable row level security;
alter table analysis_results         enable row level security;
alter table audit_log                enable row level security;

create policy clients_read on clients for select
  using (auth.role() = 'authenticated');

create policy ingestion_runs_read on ingestion_runs for select
  using (auth.role() = 'authenticated');

create policy scoring_rules_versions_read on scoring_rules_versions for select
  using (auth.role() = 'authenticated');

create policy analysis_results_read on analysis_results for select
  using (auth.role() = 'authenticated');

create policy audit_log_read on audit_log for select
  using (auth.role() = 'authenticated');

-- Nota: clients también necesita poder crearse desde la búsqueda del
-- frontend (alta por cédula si no existe). Se permite insert a
-- autenticados; el resto de tablas queda sin policy de insert/update
-- para el cliente (RLS deniega por defecto), solo escribibles por la
-- Edge Function con service_role.
create policy clients_insert on clients for insert
  with check (auth.role() = 'authenticated');
