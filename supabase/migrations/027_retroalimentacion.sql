-- Retroalimentación: resultado real de los créditos, cargado por el
-- área de Crédito/Riesgos con una plantilla Excel (etapa 2 del ciclo de
-- calibración acordado con el usuario).
--
-- Idea del proceso: CrediScope exporta la lista de clientes que analizó
-- con sus datos ya pre-llenados (cédula, fecha, score, recomendación);
-- el área de crédito solo completa lo que ya tiene en su core (si se
-- desembolsó, si cayó en default, monto, y observaciones si las sabe).
-- Cero trabajo analítico manual: el juicio de "¿acertó el modelo?" lo
-- hace después el LLM (etapa 3), no una persona comparando a mano.
--
-- Por qué NO hay un campo "¿el analista siguió la recomendación?": sale
-- del cruce. Si el crédito se desembolsó y nosotros habíamos
-- recomendado "negar", hubo override -- y ese subconjunto ("dijimos
-- negar, lo aprobaron igual, pagó perfecto") es la única ventana real a
-- los clientes que el modelo castiga de más.

create table feedback_paquetes (
  id              uuid primary key default gen_random_uuid(),
  etiqueta        text not null,              -- ej. "Cosecha 2026-Q1"
  periodo_desde   date,
  periodo_hasta   date,
  archivo_nombre  text,
  total_filas     integer not null default 0,
  total_default   integer not null default 0,
  total_vinculados integer not null default 0, -- filas que se pudieron ligar a un análisis previo
  notas           text,
  cargado_por     uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- Una fila por crédito reportado. cedula se guarda tal cual vino del
-- Excel (aunque el cliente no exista en la base todavía) para no perder
-- información en la carga; client_id/analysis_result_id se resuelven al
-- vincular y quedan null si no hubo match.
create table feedback_creditos (
  id                 uuid primary key default gen_random_uuid(),
  paquete_id         uuid not null references feedback_paquetes(id) on delete cascade,
  cedula             text not null,
  client_id          uuid references clients(id) on delete set null,
  -- Análisis y perfil vigentes al momento del desembolso. El perfil se
  -- guarda explícitamente porque analysis_results no referencia a
  -- client_profiles, y el backtesting (etapa 5) TIENE que re-correr
  -- sobre el perfil congelado de esa fecha -- nunca reconsultando la
  -- fuente, o el modelo "acertaría" siempre al ver la mora ya ocurrida.
  analysis_result_id uuid references analysis_results(id) on delete set null,
  client_profile_id  uuid references client_profiles(id) on delete set null,
  desembolsado       boolean not null,
  monto              numeric(14, 2),
  producto           text,
  plazo_meses        integer,
  fecha_desembolso   date,
  hubo_default       boolean,                 -- null si no se desembolsó
  fecha_default      date,
  tipo_default       text,                    -- opcional: cobranzas no siempre lo tiene mapeado
  dias_mora_max      integer,
  observaciones      text,                    -- el campo más valioso para el análisis cualitativo
  created_at         timestamptz not null default now()
);

create index feedback_creditos_paquete_idx on feedback_creditos (paquete_id);
create index feedback_creditos_cedula_idx on feedback_creditos (cedula);

alter table feedback_paquetes enable row level security;
alter table feedback_creditos enable row level security;

-- Lectura para cualquier autenticado (mismo criterio que el resto de
-- las tablas de resultado); escritura solo para admin -- cargar un
-- paquete de retroalimentación altera la base sobre la que después se
-- calibra el modelo, no es una acción de analista.
create policy feedback_paquetes_read on feedback_paquetes for select
  using (auth.role() = 'authenticated');
create policy feedback_paquetes_insert on feedback_paquetes for insert
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy feedback_paquetes_delete on feedback_paquetes for delete
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

create policy feedback_creditos_read on feedback_creditos for select
  using (auth.role() = 'authenticated');
create policy feedback_creditos_insert on feedback_creditos for insert
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy feedback_creditos_delete on feedback_creditos for delete
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
