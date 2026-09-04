-- ============================================================
-- CrediScope — tabla para el flujo SIN LLM:
-- Ingesta -> Estructura Estandarizada -> Clasificación (4 segmentos) -> Web
--
-- Separada de analysis_results (que es específica del scoring por LLM:
-- crediscope_score, llm_model, etc. no aplican acá). Guarda el
-- StandardClientProfile completo + su clasificación en 4 segmentos, para
-- mostrar en la web sin pasar por el LLM. Pegar en el editor SQL de
-- Supabase (proyecto ya tiene schema.sql + 001_llm_metadata.sql corriendo).
-- ============================================================

create table client_profiles (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references clients(id) on delete cascade,
  standard_profile        jsonb not null,   -- StandardClientProfile completo (ver types.ts)
  classification          jsonb not null,   -- { positivos, negativos, complementarios, sinInformacion }
  block_status            jsonb not null default '{}'::jsonb,
  structure_version       text not null,    -- versión de process.ts que lo generó
  classification_version  text not null,    -- versión de classify.ts que lo generó
  requested_by            uuid,             -- auth.users.id de quien lo disparó
  created_at              timestamptz not null default now()
);

create index client_profiles_client_id_created_at_idx
  on client_profiles (client_id, created_at desc);

alter table client_profiles enable row level security;

-- Mismo patrón que analysis_results: cualquier autenticado lee, solo la
-- Edge Function (service_role) escribe.
create policy client_profiles_read on client_profiles for select
  using (auth.role() = 'authenticated');
