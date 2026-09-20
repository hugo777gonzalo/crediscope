-- ============================================================
-- Dos agujeros del módulo de lotes que encontró la auditoría del
-- módulo y quedaron abiertos.
-- ============================================================

-- ---------- 1. Crear un lote es una sola cosa o no es nada ----------
--
-- `crearLote` insertaba el lote y después los ítems de a 500 desde el
-- navegador. Si una tanda fallaba --se corta la red, se cierra la
-- pestaña, el servidor rechaza una-- quedaba un lote en `preparado` con
-- la mitad de sus cédulas y con los totales del archivo completo
-- guardados encima. Nadie lo limpia y nada avisa: la pantalla muestra
-- "4.800 válidas" sobre 2.300 ítems reales, y el Excel del final sale
-- incompleto sin que se note.
--
-- Acá entra todo junto o no entra nada.
create or replace function crear_lote(
  p_nombre           text,
  p_archivo          text,
  p_total_lineas     integer,
  p_total_validas    integer,
  p_total_duplicadas integer,
  p_total_descartadas integer,
  p_items            jsonb
)
returns uuid
language plpgsql
-- Invoker: escribe con los permisos de quien llama, así que la política
-- de la tabla sigue siendo la que decide. Lo único que agrega esta
-- función es la transacción.
as $$
declare
  v_lote uuid;
  v_insertados integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El lote no trae cédulas';
  end if;

  insert into lotes (nombre, archivo, estado, total_lineas, total_validas,
                     total_duplicadas, total_descartadas, creado_por)
  values (p_nombre, p_archivo, 'preparado', p_total_lineas, p_total_validas,
          p_total_duplicadas, p_total_descartadas, auth.uid())
  returning id into v_lote;

  insert into lote_items (lote_id, ingresado, fila_archivo, cedula, tipo_identificacion, estado, motivo)
  select
    v_lote,
    i ->> 'ingresado',
    (i ->> 'fila')::integer,
    i ->> 'cedula',
    i ->> 'tipo',
    i ->> 'estado',
    nullif(i ->> 'motivo', '')
  from jsonb_array_elements(p_items) i;

  get diagnostics v_insertados = row_count;

  -- El número que el archivo dijo traer contra el que de verdad entró.
  -- Si no coinciden, algo se perdió en el camino y es mejor que no
  -- exista el lote que que exista a medias.
  if v_insertados <> jsonb_array_length(p_items) then
    raise exception 'Se esperaban % cédulas y entraron %', jsonb_array_length(p_items), v_insertados;
  end if;

  return v_lote;
end;
$$;

comment on function crear_lote is
  'Crea un lote con todas sus cédulas en una sola transacción. Reemplaza la inserción por tandas desde el navegador, que podía dejar un lote a medias con los totales del archivo completo encima.';


-- ---------- 2. Cancelar libera lo que quedó en el aire ----------
--
-- `cancelarLote` marcaba el lote y nada más. Los ítems en `en_curso`
-- --los que una corrida tenía tomados en ese momento-- quedaban así
-- para siempre, y los `pendiente` seguían figurando como trabajo por
-- hacer de un lote que nadie va a procesar. El resumen del lote
-- reportaba pendientes eternos.
--
-- Se usa `descartado`, que ya existe en el catálogo de estados. NO se
-- inventa un estado nuevo: eso ya pasó una vez con `oculto` en la
-- configuración de segmentos, donde el valor que la base acepta era
-- `nunca`, y el error salió en la cara del usuario.
create or replace function cancelar_lote(p_lote uuid)
returns integer
language plpgsql
as $$
declare
  v_liberados integer;
begin
  update lotes set estado = 'cancelado', terminado_at = now()
   where id = p_lote and estado in ('preparado', 'en_proceso');

  if not found then
    raise exception 'El lote ya no estaba en curso';
  end if;

  update lote_items
     set estado = 'descartado',
         motivo = 'El lote se canceló antes de llegar a esta cédula.',
         tomado_at = null,
         procesado_at = now()
   where lote_id = p_lote
     and estado in ('pendiente', 'en_curso');

  get diagnostics v_liberados = row_count;
  return v_liberados;
end;
$$;

comment on function cancelar_lote is
  'Cancela un lote y descarta lo que quedó pendiente o tomado. Sin esto, los ítems en_curso quedaban trabados y el resumen reportaba pendientes de un lote que nadie iba a procesar.';


-- ---------- Lo que ya quedó trabado ----------
--
-- Ningún lote cancelado hasta hoy, así que esto no toca nada. Se deja
-- corrido igual: si alguno se cancela entre que esto se aplica y el
-- frontend se despliega, queda limpio.
update lote_items i
   set estado = 'descartado',
       motivo = 'El lote se canceló antes de llegar a esta cédula.',
       tomado_at = null,
       procesado_at = coalesce(procesado_at, now())
  from lotes l
 where l.id = i.lote_id
   and l.estado = 'cancelado'
   and i.estado in ('pendiente', 'en_curso');
