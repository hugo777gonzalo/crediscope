-- Laboratorio, fase 6: el ciclo de un año (docs/laboratorio-de-riesgo.md,
-- sección 14).
--
-- Hasta la 097 el Laboratorio sólo veía a quien recibió el crédito: una fila
-- por operación del archivo de la institución. La pregunta del negocio es
-- también la otra mitad -- a quien el modelo mandó negar y no recibió el
-- crédito, ¿le prestó otro y cayó? -- y por qué cayó cada uno. Para eso hacen
-- falta las solicitudes del período (desembolsadas o no), la foto de cada
-- persona "un año después" y los eventos entre las dos fotos.
--
-- Las mismas tablas sirven para la simulación y para la corrida real: en la
-- simulación, la reconsulta es un crudo sintético (la reconsulta real de la
-- cartera con eventos plantados encima) y existe una bitácora con la verdad
-- plantada, que el análisis nunca lee.

-- La institución conoce la cuota; estimarla con una tasa supuesta sería
-- inventar el dato con el que se mide la capacidad de pago. Sin ella, "la
-- cuota no cabía" queda como no medible.
alter table lab_operaciones add column cuota_mensual numeric(14, 2) check (cuota_mensual > 0);

-- Las solicitudes del período. En la corrida real son los análisis del
-- período (mientras no exista la entidad institución, todos); las no
-- desembolsadas son las que no aparecen en el archivo.
create table lab_solicitudes (
  id                 uuid primary key default gen_random_uuid(),
  carga_id           uuid not null references lab_cargas(id) on delete cascade,
  cedula             text not null check (cedula ~ '^[0-9]{10}$'),
  client_id          uuid references clients(id) on delete set null,
  -- t0: el perfil del día del análisis.
  client_profile_id  uuid references client_profiles(id) on delete set null,
  analysis_result_id uuid references analysis_results(id) on delete set null,
  fecha_solicitud    date not null,
  recomendacion      text check (recomendacion in ('aprobar', 'revisar', 'negar', 'bloqueado')),
  puntaje            integer check (puntaje between 1 and 999),
  fuente_puntaje     text check (fuente_puntaje in ('analisis', 'sintetico')),
  desembolsada       boolean not null,
  operacion_id       uuid references lab_operaciones(id) on delete set null,
  unique (carga_id, cedula),
  check (desembolsada = (operacion_id is not null))
);
create index lab_solicitudes_carga_idx on lab_solicitudes (carga_id);

-- La foto "un año después" de cada solicitud.
create table lab_reconsultas (
  id                 uuid primary key default gen_random_uuid(),
  solicitud_id       uuid not null unique references lab_solicitudes(id) on delete cascade,
  carga_id           uuid not null references lab_cargas(id) on delete cascade,
  origen             text not null check (origen in ('novadata', 'simulada')),
  fecha              date not null,
  corte_iess         text check (corte_iess ~ '^[0-9]{4}-[0-9]{2}$'),
  -- novadata: depósito crudo-novadata (la reconsulta real es un perfil más,
  -- client_profile_id). simulada: depósito lab-archivos, bajo simulacion/;
  -- nunca es un client_profiles ni toca la ficha de nadie.
  crudo_ruta         text not null,
  client_profile_id  uuid references client_profiles(id) on delete set null,
  -- Lo arma el procesamiento, con el código y la versión vigentes. Las
  -- variables salen de perfil_t0; perfil_t1 sólo dice qué pasó.
  perfil_t0          jsonb,
  perfil_t1          jsonb,
  structure_version  text,
  fuentes_version    text,
  resultado          jsonb,
  procesada_en       timestamptz
);
create index lab_reconsultas_carga_idx on lab_reconsultas (carga_id);

-- Los eventos que el procesamiento DETECTA comparando t0 con t1.
create table lab_eventos (
  id            uuid primary key default gen_random_uuid(),
  reconsulta_id uuid not null references lab_reconsultas(id) on delete cascade,
  carga_id      uuid not null references lab_cargas(id) on delete cascade,
  tipo          text not null check (tipo in (
    'credito_institucion', 'credito_otra_institucion', 'mora_credito_previo', 'demanda_cobro', 'demanda_civil',
    'pension_alimenticia', 'proceso_fiscalia', 'perdida_trabajo', 'cierre_negocio', 'trabajo_nuevo')),
  clase         text not null check (clase in ('coherencia', 'causa_interna', 'causa_externa', 'consecuencia', 'protege')),
  -- null cuando la fuente no trae la fecha (el buró de bancos es una foto).
  fecha         date,
  detalle       jsonb not null default '{}'::jsonb
);
create index lab_eventos_reconsulta_idx on lab_eventos (reconsulta_id);
create index lab_eventos_carga_idx on lab_eventos (carga_id, tipo);

-- La verdad plantada. Sólo existe en cargas sintéticas y sólo sirve para
-- calificar la simulación (sección 14.7): ningún cálculo la lee.
create table lab_simulacion_verdad (
  solicitud_id     uuid primary key references lab_solicitudes(id) on delete cascade,
  carga_id         uuid not null references lab_cargas(id) on delete cascade,
  probabilidad     numeric(6, 4) not null,
  eventos          jsonb not null default '[]'::jsonb,
  malo             boolean not null,
  fecha_default    date,
  motivos          jsonb not null default '[]'::jsonb,
  anticipable      text check (anticipable in ('anticipable', 'vulnerabilidad_visible', 'no_anticipable')),
  se_puso_al_dia   boolean not null default false
);
create index lab_simulacion_verdad_carga_idx on lab_simulacion_verdad (carga_id);

alter table lab_solicitudes enable row level security;
alter table lab_reconsultas enable row level security;
alter table lab_eventos enable row level security;
alter table lab_simulacion_verdad enable row level security;

create policy lab_solicitudes_admin on lab_solicitudes for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_reconsultas_admin on lab_reconsultas for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_eventos_admin on lab_eventos for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_simulacion_verdad_admin on lab_simulacion_verdad for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- Al modelo le llegan los meses con aporte de los últimos 12, no de los
-- últimos 24 (perfil-del-modelo.ts). Es el dato del perfil que el modelo no
-- recibe y sobre el que se planta la segunda capa de la señal (14.3).
insert into lab_catalogo_variables (id, ruta, nombre, grupo, tipo, uso, en_perfil_del_modelo) values
  ('meses_con_aporte_24', '{fuentesIngreso,detalle,mesesConAporteUltimos24}', 'Meses con aporte en los últimos 24', 'Ingresos', 'numero', 'decision', false),
  ('meses_con_aporte_12', '{fuentesIngreso,detalle,mesesConAporteUltimos12}', 'Meses con aporte en los últimos 12', 'Ingresos', 'numero', 'decision', true);

-- Cómo aparece la institución del archivo en el buró, para reconocer su
-- propio crédito en la reconsulta: {"cooperativa_ruc": "..."} o
-- {"banco_codigo": "..."}. Sin esto, su crédito se contaría como "de otra
-- institución".
alter table lab_cargas add column institucion_en_buro jsonb;

-- La reconsulta real sobre la que se escribió la simulación ya trae cambios
-- reales: el buró pasó del corte de julio al de agosto de 2026 entre las dos
-- consultas, y en una semana aparecieron operaciones y deterioros de verdad
-- (medido: 104 "créditos nuevos" en 300 personas, en buena parte de una
-- cooperativa que empezó a reportar). Para calificar al detector hay que
-- separarlos de lo plantado; se guardan acá, del lado de la verdad.
alter table lab_simulacion_verdad add column eventos_reconsulta_real jsonb;

alter table lab_resultados drop constraint lab_resultados_tipo_check;
alter table lab_resultados add constraint lab_resultados_tipo_check check (tipo in (
  'desempeno', 'variables', 'simulacion_politica', 'simulacion_marco', 'estabilidad',
  'cuadrantes', 'motivos', 'crudo', 'calificacion_simulacion'));
