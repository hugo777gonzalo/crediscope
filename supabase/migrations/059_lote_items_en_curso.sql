-- Un estado más: "en_curso".
--
-- El programador de tareas dispara el trabajador cada minuto, pero una
-- corrida puede durar más de un minuto. Sin una marca de "esta cédula
-- ya la tomó alguien", dos invocaciones que se superponen agarran las
-- mismas y las consultan dos veces: se paga dos veces la misma consulta
-- y quedan dos perfiles idénticos de la misma persona.
--
-- Marcarlas ANTES de trabajarlas cierra esa ventana. La marca es la
-- transición misma: solo pasa a en_curso lo que todavía estaba
-- pendiente, así que si dos corridas compiten, una de las dos no
-- encuentra nada y sigue de largo.
alter table lote_items drop constraint lote_items_estado_check;

alter table lote_items
  add constraint lote_items_estado_check
  check (estado in ('pendiente', 'en_curso', 'ok', 'error', 'descartado', 'duplicado'));

comment on column lote_items.estado is
  'pendiente = por consultar. en_curso = tomada por una corrida del trabajador. descartado = no es una cédula consultable (RUC de empresa, pasaporte, dígito verificador malo). duplicado = repetida dentro del mismo archivo.';

-- Cuándo la tomó una corrida. Hace falta para saber cuáles quedaron
-- abandonadas: created_at dice cuándo se cargó el archivo, que no tiene
-- nada que ver.
alter table lote_items add column tomado_at timestamptz;

-- Una cédula que quedó en_curso porque la corrida se cortó a la mitad
-- vuelve a estar disponible. Sin esto, un corte deja el lote trabado
-- para siempre esperando algo que ya no está corriendo.
create or replace function liberar_items_abandonados(minutos integer default 10)
returns integer
language sql
as $$
  with liberados as (
    update lote_items
       set estado = 'pendiente', tomado_at = null
     where estado = 'en_curso'
       and (tomado_at is null or tomado_at < now() - (minutos || ' minutes')::interval)
    returning id
  )
  select count(*)::integer from liberados;
$$;

comment on function liberar_items_abandonados(integer) is
  'Devuelve a pendiente lo que quedó tomado por una corrida que se cortó. La llama el trabajador al arrancar.';
