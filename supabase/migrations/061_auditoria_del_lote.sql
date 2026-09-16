-- Correcciones de la auditoría al módulo de consultas por lote.
--
-- 1. NO DEJABA RASTRO EN LA BITÁCORA DE AUDITORÍA
--
-- El camino individual registra cada consulta en audit_log: quién,
-- a quién, cuándo. El lote no registraba nada. Con miles de cédulas por
-- archivo, eso significa que la consulta masiva de datos de Función
-- Judicial, Fiscalía y deudas bancarias de miles de personas no dejaba
-- ninguna huella de quién la ordenó.
--
-- Es el hallazgo más serio de la auditoría, y no por una regla
-- abstracta: si mañana alguien pregunta por qué se consultó a una
-- persona determinada, la respuesta tiene que existir.
--
-- 2. LOS PERFILES NO DECÍAN QUIÉN LOS PIDIÓ
--
-- requested_by quedaba nulo en los tres perfiles generados. El camino
-- individual lo llena.
--
-- 3. SE RECONSULTABA A QUIEN YA TENÍA PERFIL RECIENTE
--
-- Justamente lo que este módulo venía a evitar. Se agrega el estado
-- "reutilizado": si la persona tiene un perfil dentro de la ventana de
-- validez, el lote lo aprovecha en vez de volver a preguntarle a la
-- fuente. Aparece en el Excel igual -- el dato está -- pero no cuesta
-- una consulta.
--
-- 4. EL AVANCE NO CONTABA LO QUE ESTABA EN VUELO
--
-- pendientes solo miraba estado 'pendiente'. Lo tomado por una corrida
-- desaparecía de los dos lados y la barra de avance se quedaba corta.

alter table lote_items drop constraint lote_items_estado_check;

alter table lote_items
  add constraint lote_items_estado_check
  check (estado in ('pendiente', 'en_curso', 'ok', 'reutilizado', 'error', 'descartado', 'duplicado'));

comment on column lote_items.estado is
  'pendiente = por consultar. en_curso = tomada por una corrida. ok = consultada y con perfil nuevo. reutilizado = ya tenía perfil dentro de la ventana de validez, no se consultó. descartado = no es consultable. duplicado = repetida dentro del archivo.';

-- La ventana de validez, editable sin desplegar. El usuario planteó dos
-- opciones -- siete días o el mes en curso -- y la respuesta correcta
-- depende de con qué frecuencia cambia la información de la fuente, que
-- es una decisión del negocio y no del código.
insert into config_operativa (clave, valor, descripcion) values
  ('dias_validez_perfil',
   '7'::jsonb,
   'Cuántos días vale un Perfil del Cliente antes de volver a consultar la fuente. Lo usan las consultas por lote para no repetir a quien ya fue consultado. Es el mismo criterio que aplica la pantalla de Análisis con IA.')
on conflict (clave) do nothing;

-- ---------- RESUMEN ----------
drop view if exists lotes_resumen;
create view lotes_resumen as
select
  l.*,
  -- Lo tomado por una corrida cuenta como pendiente: todavía no
  -- terminó. Antes desaparecía de los dos lados y el avance se quedaba
  -- corto sin motivo visible.
  count(i.id) filter (where i.estado in ('pendiente', 'en_curso')) as pendientes,
  count(i.id) filter (where i.estado = 'ok')                        as correctas,
  count(i.id) filter (where i.estado = 'reutilizado')               as reutilizadas,
  count(i.id) filter (where i.estado = 'error')                     as con_error,
  count(i.id) filter (where i.estado = 'descartado')                as descartadas,
  count(i.id) filter (where i.estado = 'duplicado')                 as duplicadas,
  count(i.id)                                                        as items,
  round(
    extract(epoch from (coalesce(l.terminado_at, now()) - l.iniciado_at)) / 60.0, 1
  ) as minutos
from lotes l
left join lote_items i on i.lote_id = l.id
group by l.id;

alter view lotes_resumen set (security_invoker = on);

comment on view lotes_resumen is
  'Un lote con sus recuentos. correctas = perfil nuevo; reutilizadas = ya tenían uno vigente y no se consultó la fuente. Las dos tienen el dato disponible.';
