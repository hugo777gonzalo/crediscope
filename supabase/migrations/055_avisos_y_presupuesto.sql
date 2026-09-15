-- Avisos: que alguien se entere, y que se entere una sola vez.
--
-- El vigía ya detecta y registra. Lo que falta es el momento en que un
-- incidente PASA de no existir a existir, y que ese momento salga del
-- sistema hacia un teléfono. Un tablero que hay que abrir no sirve a
-- las cuatro de la mañana.
--
-- DOS REGLAS QUE DEFINEN EL DISEÑO
--
-- 1. Un aviso por incidente, no por falla. Con reintentos, una caída de
--    diez minutos genera decenas de errores. Decenas de mensajes
--    garantizan que se dejen de leer, que es peor que no avisar: el
--    canal queda desacreditado justo antes de la caída que sí importa.
--    La restricción única sobre (tipo, referencia) es lo que lo
--    sostiene -- no una comparación en el código, que se olvida.
--
-- 2. Un aviso que no se pudo mandar queda registrado igual. Si no hay
--    canal configurado, la fila dice "sin_canal". Un sistema de alertas
--    que calla cuando no puede hablar es indistinguible de uno donde no
--    pasó nada, y esa confusión es exactamente la que vinimos a
--    resolver.

create table alertas (
  id           uuid primary key default gen_random_uuid(),
  -- Qué pasó. incidente_abierto / incidente_cerrado / presupuesto.
  tipo         text not null,
  -- Sobre qué. El id del incidente, o "2026-09:70" para el aviso del
  -- 70% del presupuesto de septiembre. Junto al tipo forma la llave que
  -- impide repetir.
  referencia   text not null,
  canal        text,
  estado       text not null,
  titulo       text not null,
  cuerpo       text,
  detalle      text,
  created_at   timestamptz not null default now(),
  unique (tipo, referencia),
  constraint alertas_estado_check
    check (estado in ('enviada', 'sin_canal', 'fallida'))
);

create index alertas_recientes_idx on alertas (created_at desc);

comment on table alertas is
  'Un aviso por hecho, garantizado por la clave única (tipo, referencia). estado sin_canal = había algo que avisar y no había por dónde.';

-- ---------- CONFIGURACIÓN OPERATIVA ----------
-- Valores que cambian con la operación y no con el criterio. Van en
-- base y no en código a propósito: son los primeros candidatos de la
-- pantalla de administración que pide el temario de puesta en marcha.
create table config_operativa (
  clave          text primary key,
  valor          jsonb not null,
  descripcion    text not null,
  actualizado_at timestamptz not null default now(),
  actualizado_por uuid
);

insert into config_operativa (clave, valor, descripcion) values
  ('presupuesto_llm_mensual_usd',
   '0'::jsonb,
   'Cuánto se está dispuesto a gastar por mes en el modelo. En cero significa SIN DEFINIR: no se avisa nada. Es el punto 4.6 del temario de puesta en marcha.'),
  ('avisos_presupuesto_pct',
   '[70, 85, 100]'::jsonb,
   'En qué porcentajes del presupuesto avisar. El tope de consumo es el único incidente que se puede anticipar: avisando antes deja de ser una caída y pasa a ser una tarea.');

comment on table config_operativa is
  'Parámetros de operación editables sin desplegar. Ver docs/puesta-en-marcha-ifi.md.';

-- ---------- ACCESO ----------
alter table alertas enable row level security;
alter table config_operativa enable row level security;

create policy alertas_read_admin on alertas for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

create policy config_operativa_read_admin on config_operativa for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- La única tabla de toda la aplicación que un administrador escribe
-- directo desde el navegador. Se justifica porque no hay nada que
-- derivar ni validar contra otra fuente: es un número que alguien
-- decide. La clave no se puede inventar -- solo se actualizan las que
-- ya existen.
create policy config_operativa_write_admin on config_operativa for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- ---------- GASTO DEL MES ----------
-- Lo acumulado en el mes corriente, con las llamadas que no se pueden
-- valuar contadas aparte. Un total que se lee solo, sin ese número al
-- lado, invita a creer que es completo cuando no lo es.
create view gasto_del_mes as
select
  to_char(date_trunc('month', now()), 'YYYY-MM') as mes,
  coalesce(sum(costo_usd), 0)::numeric(12, 6) as gastado_usd,
  count(*) filter (where costo_usd is null) as llamadas_sin_medir,
  count(*) as llamadas
from llm_costos
where created_at >= date_trunc('month', now());

alter view gasto_del_mes set (security_invoker = on);

comment on view gasto_del_mes is
  'Consumo registrado del mes corriente. NO es la factura del proveedor: no incluye lo que no se pudo medir ni impuestos o descuentos.';
