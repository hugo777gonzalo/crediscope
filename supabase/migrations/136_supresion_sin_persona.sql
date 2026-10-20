-- ============================================================
-- La supresión del titular alcanza lo guardado sin la persona en clients.
--
-- Una solicitud (133) se crea con la identificación sola: el primer paso
-- consulta a la persona y recién ahí la crea en `clients`. Si la fuente no
-- la encuentra o no contesta, la solicitud queda con la identificación y sin
-- persona, igual que la constancia de una consulta a un buró que falló
-- (equifax-persistencia.ts: un fallo no crea a la persona). Hasta acá
-- suprimir_titular() exigía la fila en `clients` y contestaba «No hay ningún
-- registro de esa cédula» con esas filas guardadas: un pedido de supresión
-- quedaba sin cumplir. Revisión de las funciones del 2026-10-18; el negocio
-- pidió arreglarlo el 2026-10-19. Ese día no había ninguna fila así.
--
-- Desde la definición viva (pg_get_functiondef, 2026-10-19, igual a la de la
-- 133), con tres cambios:
--   - sin persona no se corta al principio: se borra lo que hay por la
--     identificación (solicitudes, consultas de Aval y Equifax, lotes y
--     Laboratorio, que ya buscaban también por la cédula);
--   - si no había nada en ningún lado, sí: «No hay ningún registro»;
--   - la constancia en audit_log dice `sin_persona` (va sin client_id y sin
--     la cédula: audit_log lo lee todo usuario con sesión).
-- ============================================================

create or replace function public.suprimir_titular(p_cedula text, p_motivo text, p_responsable uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_cliente uuid;
  v_crudos text[];
  v_conteos jsonb := '{}'::jsonb;
  v_n integer;
  v_marca text := 'SUPRIMIDA';
begin
  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Falta el motivo de la supresión (quién la pidió y por qué, al menos 10 caracteres).';
  end if;
  if not exists (select 1 from profiles where id = p_responsable) then
    raise exception 'El responsable tiene que ser un usuario existente.';
  end if;

  -- Sin fila en clients puede haber igual lo guardado por la identificación
  -- (136): se borra eso y, si no hay nada, recién ahí no hay registro.
  select id into v_cliente from clients where cedula = p_cedula;

  select coalesce(array_agg(crudo_ruta) filter (where crudo_ruta is not null), '{}')
    into v_crudos from client_profiles where client_id = v_cliente;

  delete from solicitudes where client_id = v_cliente or identificacion = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('solicitudes', v_n);

  delete from analysis_results where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('analisis', v_n);

  delete from client_profiles where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('perfiles', v_n);

  delete from consultas_aval where client_id = v_cliente or identificacion = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('consultas_aval', v_n);

  delete from consultas_equifax where client_id = v_cliente or identificacion = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('consultas_equifax', v_n);

  delete from ingestion_runs where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('corridas_de_ingesta', v_n);

  update llm_llamadas set client_id = null where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('llamadas_al_modelo_desvinculadas', v_n);

  update lote_items set cedula = v_marca where cedula = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('items_de_lote', v_n);

  update lab_solicitudes set cedula = v_marca, client_id = null where cedula = p_cedula or client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_solicitudes', v_n);

  update lab_operaciones set cedula = v_marca, client_id = null where cedula = p_cedula or client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_operaciones', v_n);

  update lab_corte_solicitudes set cedula = v_marca where cedula = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_corte_solicitudes', v_n);

  update lab_corte_operaciones set cedula = v_marca, client_profile_id = null, analysis_result_id = null where cedula = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_corte_operaciones', v_n);

  update lab_decisiones_institucion set cedula = v_marca where cedula = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_decisiones_institucion', v_n);

  if v_cliente is null and not exists (select 1 from jsonb_each_text(v_conteos) where value::integer > 0) then
    raise exception 'No hay ningún registro de esa cédula.';
  end if;

  v_conteos := v_conteos || jsonb_build_object('crudos_a_borrar', coalesce(array_length(v_crudos, 1), 0));

  insert into audit_log (actor, action, client_id, meta)
  values (p_responsable, 'titular.supresion', v_cliente,
          jsonb_build_object('motivo', trim(p_motivo), 'conteos', v_conteos, 'sin_persona', v_cliente is null));

  return jsonb_build_object('client_id', v_cliente, 'crudos', to_jsonb(v_crudos), 'conteos', v_conteos);
end;
$function$;
