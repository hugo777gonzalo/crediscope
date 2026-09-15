-- Hace consultable, medible y auditable la clasificación de fuentes de
-- ingreso. Hasta ahora vivía solo dentro del JSON del perfil.
--
-- 1. RENDIMIENTO. La pantalla de Fuentes de Ingreso descargaba el
--    standard_profile COMPLETO de cada cliente para leerle un campo:
--    ~10 KB por persona. Con 36 clientes son 360 KB y funciona; con
--    3.000 son 30 MB en cada carga de la página. Se denormaliza lo que
--    la pantalla necesita.
--
-- 2. AUDITORÍA. Con la versión de reglas adentro del jsonb no se puede
--    responder "cuántos perfiles se clasificaron con fuentes-v1" sin
--    recorrer todos los JSON. Y esa es exactamente la pregunta que hay
--    que poder contestar cuando una regla cambie.
--
-- 3. TIEMPOS. structure-client mide su duración total, dominada por la
--    ingesta (~27s). El módulo corre en milisegundos, pero sin medirlo
--    no hay forma de notar si una regla nueva lo vuelve costoso.
--
-- 4. BACKTESTING. Para cruzar segmento contra incumplimiento real hace
--    falta que el segmento sea una columna: el join contra
--    feedback_creditos sobre un campo jsonb no escala.

alter table client_profiles add column fuente_segmento text;
alter table client_profiles add column fuente_estado text;
alter table client_profiles add column fuente_version text;
alter table client_profiles add column fuente_piso_ingreso numeric(14, 2);
alter table client_profiles add column fuente_corte text;
alter table client_profiles add column duracion_fuentes_ms integer;

comment on column client_profiles.fuente_segmento is
  'Copia consultable de standard_profile->fuentesIngreso->segmento. El JSON sigue siendo la fuente de verdad; esta columna existe para no bajar el perfil entero al agrupar.';
comment on column client_profiles.duracion_fuentes_ms is
  'Cuánto tardó la clasificación de fuentes de ingreso, aparte de la ingesta (duracion_ms mide el total y lo domina la consulta a la fuente).';

create index client_profiles_fuente_segmento_idx on client_profiles (fuente_segmento, fuente_estado);
create index client_profiles_fuente_version_idx on client_profiles (fuente_version);

-- Relleno de lo ya clasificado: el dato está en el JSON, solo se copia.
update client_profiles
   set fuente_segmento = standard_profile->'fuentesIngreso'->>'segmento',
       fuente_estado = standard_profile->'fuentesIngreso'->>'estadoSegmento',
       fuente_version = standard_profile->'fuentesIngreso'->>'version',
       fuente_corte = standard_profile->'fuentesIngreso'->>'corteIessUsado',
       fuente_piso_ingreso = nullif(standard_profile->'fuentesIngreso'->>'pisoIngresoMensualReportado', '')::numeric
 where standard_profile->'fuentesIngreso'->>'segmento' is not null;

-- ---------- VERSIONES DE LAS REGLAS ----------
-- Mismo criterio que scoring_rules_versions para el marco: cada versión
-- queda registrada con qué cambió y desde cuándo rige, así un perfil
-- viejo se puede leer con las reglas que existían ese día.
create table fuentes_ingreso_versiones (
  version        text primary key,
  descripcion    text not null,
  vigente_desde  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

insert into fuentes_ingreso_versiones (version, descripcion) values
  ('fuentes-v1',
   'Primera versión: segmento por naturaleza de la fuente principal (dos tercios), estado confirmada/provisional/indeterminada, pisos de ingreso en vez de cifras, vigencia contra el corte del IESS, regla de nómina mayor al aporte propio, y segmento no_clasificado para códigos fuera del catálogo');

alter table fuentes_ingreso_versiones enable row level security;
create policy fuentes_ingreso_versiones_read on fuentes_ingreso_versiones
  for select using (auth.role() = 'authenticated');
