-- El crudo de las consultas a Equifax migradas de AWS pasa a Storage (decisión del negocio,
-- 2026-11-05; medida TEMPORAL y sólo para esas).
--
-- POR QUÉ: la base llegó a 508 MB de los 500 del plan Free (2026-11-06) y 50 MB de
-- consultas_equifax son el crudo de las 3.542 migradas (14 KB cada una). En Storage, comprimido, pesa
-- unos 8 KB y hay 1 GB. Las consultas pagadas por nosotros siguen con su crudo en la fila.
--
-- QUÉ CAMBIA:
--   * depósito privado `crudo-equifax-migrado` (gzip): `aws/<id_consulta_equifax>.json.gz` es el
--     response_json tal cual; `aws/respaldo/lote-NNNNNN.jsonl.gz`, el resto de cada fila de AWS.
--     La ruta lleva el id de AWS, nunca una cédula.
--   * `crudo_ruta` (al final): dónde está el crudo cuando la fila ya no lo tiene. null = está en la fila.
--   * `respuesta_cruda` admite null, pero la fila no puede quedar sin crudo en ningún lado (check).
--   * el disparador sigue impidiendo modificar el crudo; sólo permite el único paso nuevo:
--     de «en la fila» a «en Storage», con crudo_ruta puesta (antes o en la misma actualización). Una
--     consulta nunca se borra ni se reemplaza (negocio, 2026-11-05).
--   * suprimir_titular() devuelve también las rutas de Equifax a borrar de Storage: sin eso, el
--     derecho de supresión dejaba el crudo de la persona en el depósito.
--
-- Esta migración NO vacía ninguna fila: eso se hace después de desplegar la lectura desde Storage
-- y de comprobar que cada objeto existe.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crudo-equifax-migrado', 'crudo-equifax-migrado', false, 10485760, array['application/gzip'])
on conflict (id) do nothing;

create policy crudo_equifax_migrado_lectura_admin on storage.objects for select
  using (
    bucket_id = 'crudo-equifax-migrado'
    and exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
  );

-- Al final de la tabla (regla 5: las columnas nuevas van al final).
alter table consultas_equifax add column crudo_ruta text;
alter table consultas_equifax alter column respuesta_cruda drop not null;
alter table consultas_equifax add constraint consultas_equifax_crudo_en_algun_lado
  check (respuesta_cruda is not null or crudo_ruta is not null);

comment on column consultas_equifax.crudo_ruta is
  'Ruta en el depósito crudo-equifax-migrado cuando el crudo de una consulta migrada de AWS salió de la fila (148). null = el crudo está en respuesta_cruda. Lo lee leerCrudoDeLaConsulta().';
comment on column consultas_equifax.respuesta_cruda is
  'La respuesta de Equifax tal como llegó. Inmutable (disparador). null sólo si crudo_ruta dice dónde está en Storage (148).';

create or replace function consultas_equifax_crudo_inmutable()
returns trigger
language plpgsql
as $$
begin
  if new.respuesta_cruda is distinct from old.respuesta_cruda then
    -- Único cambio permitido: el crudo pasa de la fila a Storage (la ruta ya puesta antes, o puesta
    -- en esta misma actualización).
    if not (old.respuesta_cruda is not null and new.respuesta_cruda is null
            and new.crudo_ruta is not null and (old.crudo_ruta is null or old.crudo_ruta = new.crudo_ruta)) then
      raise exception 'consultas_equifax.respuesta_cruda no se modifica: es lo que Equifax contestó.';
    end if;
  end if;
  if new.crudo_ruta is distinct from old.crudo_ruta and old.crudo_ruta is not null then
    raise exception 'consultas_equifax.crudo_ruta no se cambia una vez puesta.';
  end if;
  return new;
end;
$$;

-- Definición tomada de la base viva (regla 5); cambia sólo v_crudos_equifax.
create or replace function public.suprimir_titular(p_cedula text, p_motivo text, p_responsable uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_cliente uuid;
  v_crudos text[];
  v_crudos_equifax text[];
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

  select coalesce(array_agg(crudo_ruta) filter (where crudo_ruta is not null), '{}')
    into v_crudos_equifax from consultas_equifax where client_id = v_cliente or identificacion = p_cedula;

  delete from estimaciones_de_ingreso where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('estimaciones_de_ingreso', v_n);

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
  v_conteos := v_conteos || jsonb_build_object('crudos_de_equifax_a_borrar', coalesce(array_length(v_crudos_equifax, 1), 0));

  insert into audit_log (actor, action, client_id, meta)
  values (p_responsable, 'titular.supresion', v_cliente,
          jsonb_build_object('motivo', trim(p_motivo), 'conteos', v_conteos, 'sin_persona', v_cliente is null));

  return jsonb_build_object('client_id', v_cliente, 'crudos', to_jsonb(v_crudos), 'crudos_equifax', to_jsonb(v_crudos_equifax), 'conteos', v_conteos);
end;
$function$;
