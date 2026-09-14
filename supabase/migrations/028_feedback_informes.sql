-- Informe "Esto encontramos" (etapa 3 del ciclo de calibración): lee un
-- paquete de retroalimentación ya cargado, lo cruza con lo que el
-- modelo había dicho de cada cliente, y produce un diagnóstico legible
-- para una jefatura de crédito.
--
-- División deliberada del trabajo:
--   - estadisticas: se calculan en código, NO las escribe el LLM. Los
--     números tienen que ser exactos y reproducibles (cuántos defaults,
--     el cruce recomendación x resultado); un modelo contando casos es
--     una fuente de error innecesaria.
--   - resultado: lo cualitativo, que es donde el LLM sí aporta —
--     sobre todo separar los incumplimientos que ERAN previsibles con
--     la información disponible de los que respondieron a factores
--     externos. Esa distinción es la que decide si hay que ajustar el
--     marco o si simplemente no todo se puede prever.
--
-- Un informe es una foto: queda atado al paquete y a la versión del
-- marco vigente cuando se generó. Se puede regenerar (queda otra fila),
-- nunca se pisa.

create table feedback_informes (
  id             uuid primary key default gen_random_uuid(),
  paquete_id     uuid not null references feedback_paquetes(id) on delete cascade,
  estadisticas   jsonb not null default '{}'::jsonb,
  resultado      jsonb not null default '{}'::jsonb,
  casos_enviados integer not null default 0,   -- cuántos casos vieron el LLM (puede ser < total en paquetes grandes)
  marco_version  text,                          -- marco vigente al generar el informe
  llm_model      text,
  llm_usage      jsonb,
  generado_por   uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index feedback_informes_paquete_idx on feedback_informes (paquete_id, created_at desc);

alter table feedback_informes enable row level security;

-- Lectura para cualquier autenticado; la escritura la hace la Edge
-- Function con service_role (igual que analysis_results), así que no
-- hay policy de insert desde la app.
create policy feedback_informes_read on feedback_informes for select
  using (auth.role() = 'authenticated');
create policy feedback_informes_delete on feedback_informes for delete
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
