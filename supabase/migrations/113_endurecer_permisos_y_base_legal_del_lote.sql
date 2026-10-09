-- Endurecimiento que salió de la auditoría de seguridad del 2026-10-09
-- (informe fuera del repositorio, en auditoria/). Cuatro cambios:
--
-- 1. El rol anónimo pierde todo permiso sobre el esquema public.
--    Medido ese día: `anon` tenía SELECT/INSERT/UPDATE/DELETE en las 42
--    tablas y EXECUTE en ~37 funciones (crear_lote, cancelar_lote,
--    lab_congelar_corte...). No se filtraba nada porque la RLS lo frenaba
--    (la prueba desde afuera leyó 0 filas y las RPC devolvieron ceros),
--    pero eso dejaba toda la protección en una sola capa: una tabla nueva
--    creada sin RLS habría quedado escribible por cualquiera con la clave
--    pública, que va en el JavaScript de la página. Nada de la aplicación
--    lee el esquema public antes de iniciar sesión.
--
-- 2. Configuración de proveedores y de campos de Aval: sólo admin. Las
--    pantallas ya eran de admin, pero la política dejaba escribir a
--    cualquier usuario con sesión.
--
--    Se deja como está, a propósito, `profiles_read_all`: el reporte
--    gerencial muestra la actividad por analista con el nombre de cada
--    uno (023), y con el registro público cerrado (2026-10-09) quien
--    tiene sesión es personal propio. Riesgo aceptado: nombre corto,
--    entidad y rol de los compañeros.
--
-- 3. audit_log no se puede modificar ni borrar. Es la prueba de quién
--    consultó a quién; si se puede editar, no prueba nada (ISO 27001
--    A.8.15). Un arreglo de datos viejos (como el de la 069) tiene que
--    desactivar el disparador a mano, a la vista, como dueño de la tabla.
--    Y la pantalla registra lo que antes no quedaba: quién abrió un
--    expediente y quién exportó datos (registrar_evento).
--
-- 4. Un lote declara su base legal (decisión del negocio del
--    2026-10-09): la IFI garantiza por contrato la autorización de cada
--    titular, y el lote dice bajo qué contrato se consulta. Los 9 lotes
--    anteriores quedan sin ella: se crearon antes de la regla.

-- ---------------------------------------------------------------
-- 1. Sin permisos para el rol anónimo
-- ---------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;

-- Revocar a PUBLIC también se lo saca a quien lo heredaba de ahí: se
-- devuelve explícito a quienes sí lo usan (la pantalla y los guiones).
grant execute on all functions in schema public to authenticated, service_role;

-- Y lo mismo para lo que se cree de acá en adelante.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. Configuración: sólo admin
-- ---------------------------------------------------------------
drop policy proveedores_update on proveedores;
create policy proveedores_update on proveedores for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

drop policy aval_field_config_update on aval_field_config;
create policy aval_field_config_update on aval_field_config for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- ---------------------------------------------------------------
-- 3. Registro de auditoría inalterable, y lo que la pantalla registra
-- ---------------------------------------------------------------
create or replace function audit_log_inalterable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log no se modifica ni se borra: es la prueba de quién consultó a quién (113).';
end;
$$;

create trigger audit_log_sin_cambios
  before update or delete on audit_log
  for each row execute function audit_log_inalterable();

create trigger audit_log_sin_vaciar
  before truncate on audit_log
  for each statement execute function audit_log_inalterable();

-- La pantalla no puede escribir audit_log directo (no tiene política de
-- inserción, y no debe: podría firmar a nombre de otro). Esta función
-- escribe con el usuario de la sesión y sólo las acciones de la lista.
create or replace function registrar_evento(p_accion text, p_client_id uuid default null, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión no se registra nada';
  end if;
  if p_accion not in ('expediente.vista', 'exportacion.solicitudes', 'exportacion.lote',
                      'exportacion.informe_laboratorio', 'exportacion.conciliacion') then
    raise exception 'Acción no registrable: %', p_accion;
  end if;
  insert into audit_log (actor, action, client_id, meta)
  values (auth.uid(), p_accion, p_client_id, coalesce(p_meta, '{}'::jsonb));
end;
$$;

revoke execute on function registrar_evento(text, uuid, jsonb) from anon, public;
grant execute on function registrar_evento(text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------
-- 4. Base legal del lote
-- ---------------------------------------------------------------
alter table lotes add column base_legal text;

comment on column lotes.base_legal is
  'Bajo qué contrato o base legal se consulta a las personas del lote (113). Obligatoria desde el 2026-10-09; los lotes anteriores quedan en null.';

drop function crear_lote(text, text, integer, integer, integer, integer, jsonb);

-- p_base_legal va al final y con default null sólo para que la pantalla
-- vieja reciba un mensaje claro en vez de "la función no existe"
-- mientras se despliega la nueva: sin base legal, no se crea el lote.
create function crear_lote(
  p_nombre           text,
  p_archivo          text,
  p_total_lineas     integer,
  p_total_validas    integer,
  p_total_duplicadas integer,
  p_total_descartadas integer,
  p_items            jsonb,
  p_base_legal       text default null
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
  if length(trim(coalesce(p_base_legal, ''))) < 10 then
    raise exception 'Falta la base legal del lote: bajo qué contrato o base legal se consulta a estas personas.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El lote no trae cédulas';
  end if;

  insert into lotes (nombre, archivo, estado, total_lineas, total_validas,
                     total_duplicadas, total_descartadas, creado_por, base_legal)
  values (p_nombre, p_archivo, 'preparado', p_total_lineas, p_total_validas,
          p_total_duplicadas, p_total_descartadas, auth.uid(), trim(p_base_legal))
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

revoke execute on function crear_lote(text, text, integer, integer, integer, integer, jsonb, text) from anon, public;
grant execute on function crear_lote(text, text, integer, integer, integer, integer, jsonb, text) to authenticated, service_role;
