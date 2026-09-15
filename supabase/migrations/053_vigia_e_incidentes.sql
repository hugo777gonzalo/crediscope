-- Estado del servicio e historial de incidentes.
--
-- Hasta acá los incidentes se deducían: se miraban las llamadas
-- fallidas y se agrupaban por causa y cercanía en el tiempo. Sirve para
-- leer el pasado, pero tiene dos agujeros que importan justo cuando
-- importa:
--
--   1. Sin tráfico no hay dato. "Cero fallas" y "el servicio está
--      caído" se ven idénticos. La madrugada del 2026-09-11 el
--      proveedor estuvo caído seis minutos y solo lo supimos porque
--      alguien casualmente estaba consultando.
--
--   2. Deducir el incidente cada vez que se abre una pantalla no sirve
--      para avisar. Para mandar un aviso hace falta un momento en que
--      el incidente PASA de no existir a existir, y eso solo lo puede
--      ver algo que mire seguido.
--
-- De ahí el vigía: una consulta mínima cada tanto que ejercita el
-- circuito real -- credenciales, conectividad, tope de consumo -- y
-- deja constancia aunque nadie esté usando el sistema.

-- ---------- ESTADO ACTUAL ----------
-- Una fila por componente. Es lo que responde "¿está funcionando
-- ahora?" sin recorrer el historial.
create table servicio_estado (
  componente        text primary key,
  estado            text not null default 'desconocido',
  -- Desde cuándo está así. Es lo que permite decir "operativo desde
  -- hace 3 días" o "caído hace 12 minutos".
  desde             timestamptz not null default now(),
  ultimo_chequeo    timestamptz,
  ultimo_fallo_tipo text,
  ultimo_error      text,
  -- Cuánto tardó el componente en responder. Un servicio que responde
  -- pero tarda cinco veces más de lo normal está degradándose antes de
  -- caerse.
  duracion_ms       integer,
  incidente_id      uuid,
  constraint servicio_estado_estado_check
    check (estado in ('operativo', 'caido', 'desconocido'))
);

comment on table servicio_estado is
  'Estado actual de cada componente según el último chequeo del vigía. Una fila por componente, se sobrescribe.';

insert into servicio_estado (componente) values ('llm'), ('fuente_datos');

-- ---------- INCIDENTES ----------
-- Un incidente es una racha, no una falla. Cuatro errores del proveedor
-- en seis minutos son UN corte de seis minutos: esa es la cifra que se
-- compromete en un acuerdo de nivel de servicio.
create table incidentes (
  id                uuid primary key default gen_random_uuid(),
  componente        text not null,
  causa             text not null,
  inicio            timestamptz not null default now(),
  -- null = todavía abierto. El cierre lo pone el vigía cuando el
  -- componente vuelve a responder.
  fin               timestamptz,
  chequeos_fallidos integer not null default 1,
  detalle           text,
  -- De quién depende resolverlo. Separa lo que cuenta contra nuestro
  -- compromiso de lo que se informa como indisponibilidad de un
  -- tercero (ver _shared/fallos-llm.ts).
  responsable       text,
  -- Cuándo se avisó. Null con el incidente abierto significa que nadie
  -- se enteró todavía: es la fila que el sistema de alertas va a mirar.
  notificado_at     timestamptz,
  created_at        timestamptz not null default now()
);

create index incidentes_abiertos_idx on incidentes (componente, inicio desc) where fin is null;
create index incidentes_inicio_idx on incidentes (inicio desc);

comment on table incidentes is
  'Cortes de servicio agrupados por componente y causa. fin null = abierto. notificado_at null en un incidente abierto = nadie fue avisado.';

-- Duración en minutos, que es como se lee y como se compromete.
create view incidentes_con_duracion as
select
  i.*,
  round(extract(epoch from (coalesce(i.fin, now()) - i.inicio)) / 60.0, 1) as minutos,
  (i.fin is null) as abierto
from incidentes i;

-- ---------- ACCESO ----------
-- Mismo criterio que Costos: es información de operación del servicio,
-- no un dato del negocio crediticio.
alter table servicio_estado enable row level security;
alter table incidentes enable row level security;

create policy servicio_estado_read_admin on servicio_estado for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

create policy incidentes_read_admin on incidentes for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

alter view incidentes_con_duracion set (security_invoker = on);

-- El vigía es una función más y necesita aparecer en el registro de
-- consumo como cualquier otra.
comment on column llm_llamadas.funcion is
  'Qué proceso pidió la llamada: analyze-client, analizar-feedback, proponer-ajustes, correr-backtest, vigia.';
