-- Derechos del titular (LOPDP): acceso, portabilidad y supresión. Sale de
-- la auditoría del 2026-10-09, que no encontró ningún procedimiento para
-- atender a una persona que pida ver o borrar lo que se guarda de ella.
--
-- La supresión la ordena la IFI (responsable del tratamiento; CrediScope
-- es su encargado) y la corre el guion scripts/derechos-del-titular.mjs
-- con la clave de servicio. Esta función hace la parte de la base en una
-- sola transacción y devuelve las rutas del crudo, que se borran después
-- por la API de Storage (la base no puede borrar objetos de Storage).
--
-- Qué se borra y qué se conserva, y por qué:
--
-- - Se BORRA el contenido: perfiles (con el perfil estandarizado y las
--   columnas copiadas), análisis (con lo que leyó el modelo), consultas a
--   Aval con su respuesta cruda, corridas de ingesta, y el vínculo de las
--   llamadas al modelo.
-- - En el Laboratorio y en los lotes la cédula se reemplaza por una marca
--   y se cortan los vínculos (las claves foráneas ya los ponen en null):
--   la fila queda sin nada que la ate a la persona y la estadística del
--   corte no cambia de tamaño.
-- - Se CONSERVA la constancia de que se la consultó: la fila de clients
--   (la cédula) y audit_log (quién, cuándo, bajo qué base legal). Es lo
--   que la IFI tiene que poder demostrar ante el titular o la autoridad,
--   y audit_log no se puede modificar (113). La supresión misma queda
--   registrada ahí.
create or replace function suprimir_titular(p_cedula text, p_motivo text, p_responsable uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
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

  select id into v_cliente from clients where cedula = p_cedula;
  if v_cliente is null then
    raise exception 'No hay ningún registro de esa cédula.';
  end if;

  select coalesce(array_agg(crudo_ruta) filter (where crudo_ruta is not null), '{}')
    into v_crudos from client_profiles where client_id = v_cliente;

  delete from analysis_results where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('analisis', v_n);

  delete from client_profiles where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('perfiles', v_n);

  delete from consultas_aval where client_id = v_cliente or identificacion = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('consultas_aval', v_n);

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

  v_conteos := v_conteos || jsonb_build_object('crudos_a_borrar', coalesce(array_length(v_crudos, 1), 0));

  insert into audit_log (actor, action, client_id, meta)
  values (p_responsable, 'titular.supresion', v_cliente,
          jsonb_build_object('motivo', trim(p_motivo), 'conteos', v_conteos));

  return jsonb_build_object('client_id', v_cliente, 'crudos', to_jsonb(v_crudos), 'conteos', v_conteos);
end;
$$;

-- Sólo la clave de servicio: borra datos de una persona y no puede quedar
-- al alcance de una sesión de la pantalla.
revoke execute on function suprimir_titular(text, text, uuid) from public, anon, authenticated;
grant execute on function suprimir_titular(text, text, uuid) to service_role;
