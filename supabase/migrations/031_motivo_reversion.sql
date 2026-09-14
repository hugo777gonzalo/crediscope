-- Corrige la trazabilidad de las reversiones.
--
-- Problema detectado probando: al revertir, el trigger de vigencia se
-- adelantaba y registraba la versión con el motivo genérico ("Se quitó
-- de vigencia: X"). Cuando revertir_criterio intentaba registrar la
-- suya, la huella ya coincidía y no se creaba nada, así que el
-- historial perdía justo lo que importa: que hubo una reversión
-- deliberada y a qué versión se volvió. No es lo mismo auditar "se
-- quitó un ajuste suelto" que "se revirtió el criterio a la versión 3".

create or replace function revertir_criterio(p_version_id uuid, p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_objetivo record;
  v_ids uuid[];
  v_nueva uuid;
  v_motivo text;
begin
  select * into v_objetivo from criterio_versiones where id = p_version_id;
  if not found then
    raise exception 'No existe esa versión del criterio';
  end if;

  select coalesce(array_agg((a->>'propuestaId')::uuid), '{}') into v_ids
  from jsonb_array_elements(v_objetivo.ajustes) a;

  update feedback_propuestas set vigente_desde = null
   where vigente_desde is not null and not (id = any(v_ids));
  update feedback_propuestas set vigente_desde = coalesce(vigente_desde, now())
   where id = any(v_ids) and estado = 'aprobada';

  v_motivo := 'Reversión a la versión ' || v_objetivo.numero;
  v_nueva := registrar_version_criterio(v_motivo, p_actor);

  -- Si el trigger ya había registrado esta misma combinación, se le
  -- corrige el motivo y el autor en vez de dejar el genérico.
  if v_nueva is null then
    update criterio_versiones
       set motivo = v_motivo, creada_por = coalesce(p_actor, creada_por)
     where numero = (select max(numero) from criterio_versiones)
    returning id into v_nueva;
  end if;

  return v_nueva;
end;
$$;

create or replace function desactivar_todos_los_ajustes(p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nueva uuid;
  v_motivo text := 'Se desactivaron todos los ajustes (vuelta al criterio base)';
begin
  update feedback_propuestas set vigente_desde = null where vigente_desde is not null;
  v_nueva := registrar_version_criterio(v_motivo, p_actor);
  if v_nueva is null then
    update criterio_versiones
       set motivo = v_motivo, creada_por = coalesce(p_actor, creada_por)
     where numero = (select max(numero) from criterio_versiones)
    returning id into v_nueva;
  end if;
  return v_nueva;
end;
$$;
