-- Consultas al buró Aval: una fuente NUEVA e INDEPENDIENTE.
--
-- POR QUÉ UNA TABLA APARTE (y por qué no contradice la 058)
--
-- La 058 decidió NO separar los perfiles por puerta de entrada: el perfil
-- de una persona es el mismo venga de una consulta o de un lote, porque es
-- LA MISMA FUENTE (Novadata) mirada de dos maneras. Acá es distinto: Aval
-- es OTRA fuente, con su propio esquema de respuesta (un sobre con 34
-- segmentos que no se parece en nada a los 9 bloques de Novadata) y su
-- propia facturación. Mezclarla en client_profiles obligaría a deformar su
-- forma o a llenar de nulls la de Novadata. Fuente distinta, tabla distinta.
--
-- QUÉ SE GUARDA
--
-- `respuesta_cruda` es la información de origen EN EL ESQUEMA DE AVAL, sin
-- tocar: el sobre completo (responseCode, message, transactionNumber, time
-- y result{...}). Es la fuente de verdad. `perfil` es la normalización
-- nuestra (aval-perfil.ts) derivada de ahí, versionada, para consumir sin
-- re-parsear. Las columnas planas son copia consultable (mismo idiom que
-- client_profiles): filtrar y cruzar sin abrir el JSON.
--
-- QUÉ NO SE GUARDA
--
-- Solo entran consultas usables (responseCode A200) — el gate
-- laConsultaAvalSirve lo decide antes de escribir. Un A500 o un fetch
-- caído no dejan fila: guardarlos sería el mismo perfil-en-blanco que
-- costó caro el 2026-09-15 (ver calidad-de-la-consulta.ts). Aval SIEMPRE
-- devuelve estructura en un A200 (incluso un archivo sin operaciones trae
-- score 0 y sus segmentos vacíos), así que "A200 con poco adentro" es un
-- dato legítimo, no una falla.

create table consultas_aval (
  id                    uuid primary key default gen_random_uuid(),

  -- Identidad propia de la consulta (fuente independiente): lo que se le
  -- mandó a Aval. tipo C=cédula, R=RUC, E=extranjero, P=pasaporte,
  -- F=refugiado. Hoy solo se usa C.
  identificacion        text not null,
  tipo_identificacion   text not null default 'C',

  -- Enlace BLANDO a la persona del registro común, cuando la identificación
  -- ya existe como cliente. Nullable a propósito: Aval es independiente y
  -- acepta identificaciones que `clients` no maneja (RUC, pasaporte). No se
  -- crea el cliente desde acá; si no está, queda en null.
  client_id             uuid references clients(id) on delete set null,

  -- LA INFORMACIÓN DE ORIGEN, EN EL ESQUEMA DE AVAL, SIN TOCAR.
  respuesta_cruda       jsonb not null,

  -- Perfil normalizado (aval-perfil.ts), derivado de respuesta_cruda.
  perfil                jsonb not null,
  perfil_version        text not null,

  -- Copia consultable. response_code es el que Aval devolvió (A200 = ok).
  response_code         text not null,
  transaction_number    text,
  score                 integer,          -- scoreFinanciero[0].score (0..999)
  total_deuda           numeric(14,2),    -- suma de resumenSaldosTipoDeuda
  num_tarjetas_vigentes integer,
  consultas_12m         integer,          -- cuántos consultaron a la persona en 12 meses
  tasa_malos            numeric,          -- probabilidad de caer en vencido (0..1)
  nombre_sujeto         text,

  duracion_ms           integer,
  requested_by          uuid,             -- auth.users.id de quien la disparó
  origen                text not null default 'consulta',
  created_at            timestamptz not null default now(),

  constraint consultas_aval_tipo_check
    check (tipo_identificacion in ('C', 'R', 'E', 'P', 'F')),
  constraint consultas_aval_origen_check
    check (origen in ('consulta', 'lote'))
);

create index consultas_aval_identificacion_idx
  on consultas_aval (identificacion, created_at desc);

create index consultas_aval_client_idx
  on consultas_aval (client_id, created_at desc) where client_id is not null;

comment on table consultas_aval is
  'Consultas al buró Aval (fuente independiente de Novadata). respuesta_cruda = sobre original de Aval sin tocar; perfil = normalización aval-perfil.ts. Solo se guardan consultas A200.';
comment on column consultas_aval.respuesta_cruda is
  'El sobre completo tal como lo devolvió Aval (responseCode, message, transactionNumber, time, result). Fuente de verdad.';

-- ---------- ACCESO ----------
-- Mismo criterio que client_profiles: cualquier autenticado lee, solo la
-- Edge Function (service_role) escribe. Al no declarar policy de insert,
-- únicamente service_role puede escribir (saltea RLS).
alter table consultas_aval enable row level security;

create policy consultas_aval_read on consultas_aval for select
  using (auth.role() = 'authenticated');
