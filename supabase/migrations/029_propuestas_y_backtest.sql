-- Etapas 4 y 5 del ciclo de calibración: propuestas de ajuste con
-- aprobación humana, y backtesting del marco candidato contra los
-- resultados reales ya conocidos.
--
-- Principio de diseño, pedido explícito del usuario: NINGÚN ajuste al
-- criterio del modelo entra en vigencia sin que una persona del área lo
-- apruebe. El sistema propone y demuestra; decide el humano, y queda
-- registrado quién y cuándo.

-- Dos clases de propuesta que NO hay que mezclar:
--   - criterio_modelo: cambia cómo el modelo pondera algo. Se puede
--     probar con backtesting y, si se aprueba, entra en vigencia sola.
--   - politica_credito: cambia el proceso de la entidad (qué
--     documentación pedir, qué verificar antes de desembolsar). El
--     sistema no puede aplicarla: es una recomendación para el área.
create table feedback_propuestas (
  id                uuid primary key default gen_random_uuid(),
  informe_id        uuid not null references feedback_informes(id) on delete cascade,
  paquete_id        uuid not null references feedback_paquetes(id) on delete cascade,
  tipo              text not null check (tipo in ('criterio_modelo', 'politica_credito')),
  titulo            text not null,
  justificacion     text not null,
  -- Texto en lenguaje natural que se agrega al criterio del modelo si
  -- se aprueba. Null en las de política de crédito, que no se aplican
  -- automáticamente.
  cambio_sugerido   text,
  evidencia         jsonb not null default '[]'::jsonb,   -- cédulas/casos que la respaldan
  impacto_esperado  text,
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente', 'aprobada', 'rechazada', 'cambios_solicitados')),
  comentario_revisor text,
  revisada_por      uuid references auth.users(id),
  revisada_en       timestamptz,
  -- Se marca cuando el ajuste pasa a regir de verdad sobre los análisis
  -- nuevos. Aprobar y poner en vigencia son dos pasos: se puede aprobar
  -- una propuesta y recién activarla después de verla en backtesting.
  vigente_desde     timestamptz,
  created_at        timestamptz not null default now()
);

create index feedback_propuestas_informe_idx on feedback_propuestas (informe_id);
create index feedback_propuestas_vigentes_idx on feedback_propuestas (vigente_desde) where vigente_desde is not null;

-- Backtesting: re-corre los casos del paquete con el marco candidato
-- (criterio actual + propuestas seleccionadas) sobre el PERFIL
-- CONGELADO de la fecha original. Nunca se reconsulta la fuente: el
-- perfil de hoy ya tendría la mora registrada y el modelo "acertaría"
-- siempre.
create table feedback_backtests (
  id                   uuid primary key default gen_random_uuid(),
  paquete_id           uuid not null references feedback_paquetes(id) on delete cascade,
  propuestas_aplicadas jsonb not null default '[]'::jsonb, -- ids + títulos de las propuestas incluidas
  resultados           jsonb not null default '[]'::jsonb, -- caso por caso: antes vs después vs resultado real
  comparativa          jsonb not null default '{}'::jsonb, -- agregados calculados en código
  casos_evaluados      integer not null default 0,
  marco_version        text,
  generado_por         uuid references auth.users(id),
  created_at           timestamptz not null default now()
);

create index feedback_backtests_paquete_idx on feedback_backtests (paquete_id, created_at desc);

alter table feedback_propuestas enable row level security;
alter table feedback_backtests enable row level security;

create policy feedback_propuestas_read on feedback_propuestas for select
  using (auth.role() = 'authenticated');
-- La revisión (aprobar/rechazar/pedir cambios) la hace el admin desde
-- la app; el alta la hace la Edge Function con service_role.
create policy feedback_propuestas_update on feedback_propuestas for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

create policy feedback_backtests_read on feedback_backtests for select
  using (auth.role() = 'authenticated');
create policy feedback_backtests_delete on feedback_backtests for delete
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
