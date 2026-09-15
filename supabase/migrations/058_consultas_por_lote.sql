-- Consultas por lote: cargar muchas cédulas de una y consultarlas.
--
-- LA DECISIÓN DE FONDO: NO SE SEPARAN LOS DATOS
--
-- La tentación es guardar lo consultado por lote en su propio lugar,
-- para "no mezclarlo" con lo que pidió un analista. Sería un error, y
-- justamente el contrario del motivo por el que existe esto.
--
-- El perfil de una persona es el perfil de una persona: no cambia según
-- por qué puerta se pidió. Separarlos obligaría a consultar dos veces a
-- la misma persona -- una para el lote y otra cuando un analista la
-- busque -- y eso es exactamente la saturación de la fuente que se
-- quiere evitar. Un lote corrido hoy tiene que servirle al analista que
-- mañana busque a esa persona, sin volver a preguntar.
--
-- Lo que sí hace falta es saber DE DÓNDE salió cada perfil. Eso es una
-- columna, no un universo aparte: alcanza para filtrar, para auditar y
-- para no confundir un perfil que alguien miró con uno que se trajo en
-- masa y nadie abrió todavía.
--
-- La ventana de reutilización (7 días, ver AnalisisIA.jsx) ya funciona
-- para los dos: si el perfil es reciente, se reutiliza venga de donde
-- venga.

alter table client_profiles add column origen text not null default 'consulta';
alter table client_profiles add column lote_id uuid;

alter table client_profiles
  add constraint client_profiles_origen_check
  check (origen in ('consulta', 'lote'));

comment on column client_profiles.origen is
  'Por qué puerta entró: consulta (un analista lo pidió) o lote (carga masiva). El dato es el mismo; esto permite distinguir un perfil que alguien miró de uno que nadie abrió todavía.';

create index client_profiles_lote_idx on client_profiles (lote_id) where lote_id is not null;

-- ---------- LOTES ----------
create table lotes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  archivo       text,
  estado        text not null default 'preparado',
  -- Lo que traía el archivo, contado al cargarlo. Se guarda en vez de
  -- recalcularse: es lo que la persona vio y aprobó antes de arrancar,
  -- y tiene que poder reconstruirse después aunque el archivo ya no
  -- esté.
  total_lineas       integer not null default 0,
  total_validas      integer not null default 0,
  total_duplicadas   integer not null default 0,
  total_descartadas  integer not null default 0,
  creado_por    uuid,
  created_at    timestamptz not null default now(),
  iniciado_at   timestamptz,
  terminado_at  timestamptz,
  constraint lotes_estado_check
    check (estado in ('preparado', 'en_proceso', 'terminado', 'cancelado'))
);

create index lotes_recientes_idx on lotes (created_at desc);

comment on table lotes is
  'Una carga masiva de cédulas. estado preparado = cargado y validado, sin consultar todavía.';

-- ---------- ÍTEMS ----------
-- Una fila por cédula del archivo, incluidas las que no se van a
-- consultar. Las descartadas se guardan a propósito: el archivo de
-- errores que se descarga después sale de acá, y sin ellas habría que
-- pedirle a la persona que vuelva a subir el archivo para saber qué
-- estaba mal.
create table lote_items (
  id                 uuid primary key default gen_random_uuid(),
  lote_id            uuid not null references lotes(id) on delete cascade,
  -- Tal cual venía en el archivo, sin normalizar. Es lo que la persona
  -- reconoce cuando busca el error en su planilla.
  ingresado          text not null,
  fila_archivo       integer,
  cedula             text,
  tipo_identificacion text not null,
  estado             text not null default 'pendiente',
  motivo             text,
  client_profile_id  uuid references client_profiles(id) on delete set null,
  duracion_ms        integer,
  intentos           integer not null default 0,
  procesado_at       timestamptz,
  created_at         timestamptz not null default now(),
  constraint lote_items_estado_check
    check (estado in ('pendiente', 'ok', 'error', 'descartado', 'duplicado'))
);

create index lote_items_pendientes_idx on lote_items (lote_id, estado) where estado = 'pendiente';
create index lote_items_lote_idx on lote_items (lote_id);

comment on column lote_items.estado is
  'pendiente = por consultar. descartado = no es una cédula consultable (RUC de empresa, pasaporte, dígito verificador malo). duplicado = repetida dentro del mismo archivo.';

-- ---------- RESUMEN ----------
-- Lo que se ve en la lista de lotes. Se calcula en la base y no en cada
-- pantalla para que el número sea uno solo.
create view lotes_resumen as
select
  l.*,
  count(i.id) filter (where i.estado = 'pendiente')  as pendientes,
  count(i.id) filter (where i.estado = 'ok')          as correctas,
  count(i.id) filter (where i.estado = 'error')       as con_error,
  count(i.id) filter (where i.estado = 'descartado')  as descartadas,
  count(i.id) filter (where i.estado = 'duplicado')   as duplicadas,
  count(i.id)                                          as items,
  round(
    extract(epoch from (coalesce(l.terminado_at, now()) - l.iniciado_at)) / 60.0, 1
  ) as minutos
from lotes l
left join lote_items i on i.lote_id = l.id
group by l.id;

alter view lotes_resumen set (security_invoker = on);

-- ---------- ACCESO ----------
-- Cargar un archivo con miles de cédulas y consultarlas todas es otro
-- nivel de exposición que buscar un cliente a la vez. Mismo criterio
-- que Costos: administración.
alter table lotes enable row level security;
alter table lote_items enable row level security;

create policy lotes_admin on lotes for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

create policy lote_items_admin on lote_items for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
