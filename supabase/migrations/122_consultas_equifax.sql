-- Consultas al buró Equifax: una fuente NUEVA e INDEPENDIENTE, en producción
-- desde el 2026-10-12.
--
-- POR QUÉ UNA TABLA APARTE
--
-- Mismo criterio que la 074 (Aval): Equifax es OTRA fuente, con su propio
-- esquema de respuesta y su propia facturación. Mezclarla en client_profiles
-- obligaría a deformar una de las dos formas. Fuente distinta, tabla distinta,
-- y `client_id` como llave blanda para unirlas por persona.
--
-- POR QUÉ SE GUARDA EL CRUDO ENTERO
--
-- Cada consulta se COBRA y Equifax no pone tope (negocio, 2026-10-12). La
-- única forma de no pagar dos veces por lo mismo es reutilizar lo que ya se
-- pagó, y se reutiliza sólo si está guardado sin tocar: una consulta vale
-- hasta el 17 de cada mes (_shared/vigencia-mensual.ts). `respuesta_cruda` es
-- la verdad y no se modifica nunca (disparador abajo); lo que se derive de ahí
-- (perfil, estructura estandarizada) llega en migraciones propias cuando se
-- haya visto la respuesta real: diseñar el esquema antes de verla es
-- inventarlo.
--
-- QUÉ NO SE GUARDA EN ESTA TABLA
--
-- Las consultas que no contestaron nada utilizable. Quedan en audit_log
-- (`equifax.consulta.fallo`) con `puede_haber_cobrado`, que alimenta el tope
-- diario: un timeout pudo haberse cobrado aunque no haya devuelto nada.
--
-- ACCESO
--
-- Lee sólo quien tiene rol de analista o admin (no "cualquier autenticado",
-- que la auditoría del 2026-10-09 marcó en las tablas anteriores). Escribe
-- sólo la clave de servicio, que saltea la RLS: no hay política de insert.

create table consultas_equifax (
  id                    uuid primary key default gen_random_uuid(),

  -- Lo que se consultó. Hoy sólo cédula.
  identificacion        text not null,
  tipo_identificacion   text not null default 'C',

  -- Enlace BLANDO a la persona del registro común.
  client_id             uuid references clients(id) on delete set null,

  -- LA RESPUESTA DE EQUIFAX, SIN TOCAR. Es lo que se pagó.
  respuesta_cruda       jsonb not null,
  http_equifax          integer not null,
  -- Sólo las cabeceras que identifican la transacción (para reclamarle algo a
  -- Equifax); nunca las demás.
  cabeceras_respuesta   jsonb not null default '{}'::jsonb,

  -- Con qué parámetros de decisión se hizo (tipoProducto, monto, plazo...).
  -- Hoy son de relleno; si dejan de serlo, esta columna dice cuáles valían.
  parametros            jsonb not null default '{}'::jsonb,

  duracion_ms           integer,
  intentos              integer not null default 1,
  requested_by          uuid,
  origen                text not null default 'consulta',

  -- Bajo qué contrato o base legal se consultó a esta persona. Obligatoria:
  -- como en los lotes (113), sin base legal no se consulta.
  base_legal            text not null,

  -- Derivado del host al que se apunta, no declarado a mano; el default es
  -- 'prueba' a propósito (lección de la 079).
  ambiente              text not null default 'prueba',

  created_at            timestamptz not null default now(),

  constraint consultas_equifax_tipo_check check (tipo_identificacion in ('C')),
  constraint consultas_equifax_origen_check check (origen in ('consulta', 'lote')),
  constraint consultas_equifax_ambiente_check check (ambiente in ('prueba', 'produccion')),
  constraint consultas_equifax_base_legal_check check (length(trim(base_legal)) >= 10)
);

create index consultas_equifax_identificacion_idx on consultas_equifax (identificacion, created_at desc);
create index consultas_equifax_client_idx on consultas_equifax (client_id, created_at desc) where client_id is not null;
-- El tope diario cuenta las del día: sin este índice recorre toda la tabla.
create index consultas_equifax_created_idx on consultas_equifax (created_at);

comment on table consultas_equifax is
  'Consultas al buró Equifax (fuente independiente). Cada una se cobra: respuesta_cruda es lo que se pagó y se reutiliza hasta el 17 de cada mes. Sólo se guardan las que Equifax contestó con un JSON.';
comment on column consultas_equifax.respuesta_cruda is
  'La respuesta de Equifax tal como llegó. Inmutable (disparador).';
comment on column consultas_equifax.ambiente is
  'prueba o produccion, derivado del host de EQUIFAX_BASE_URL. Una fila de prueba no sirve para calificar a nadie.';

-- El crudo no se modifica: es la evidencia de lo que se pagó y de lo que
-- Equifax dijo de una persona un día concreto.
create function consultas_equifax_crudo_inmutable()
returns trigger
language plpgsql
as $$
begin
  if new.respuesta_cruda is distinct from old.respuesta_cruda then
    raise exception 'consultas_equifax.respuesta_cruda no se modifica: es lo que Equifax contestó.';
  end if;
  return new;
end;
$$;

create trigger consultas_equifax_crudo_inmutable
  before update on consultas_equifax
  for each row execute function consultas_equifax_crudo_inmutable();

-- ---------- ACCESO ----------
alter table consultas_equifax enable row level security;

create policy consultas_equifax_lectura on consultas_equifax for select
  using (exists (select 1 from profiles where id = auth.uid() and rol in ('analista', 'admin')));

-- Además de la política: el navegador sólo necesita leer.
revoke all on consultas_equifax from anon, authenticated;
grant select on consultas_equifax to authenticated;

-- ---------- PROVEEDOR ----------
-- Nace APAGADO: cada consulta se cobra y no hay tope del proveedor, así que
-- se enciende a propósito (Configuración de fuentes, o un update con
-- constancia), no por defecto.
insert into proveedores (clave, nombre, notas, activo) values
  ('equifax', 'Equifax',
   'Buró de crédito. Una consulta por persona, cada una se cobra; el tope diario lo pone EQUIFAX_TOPE_DIARIO. Nace apagado: se enciende a propósito.',
   false)
on conflict (clave) do nothing;

-- ---------- DERECHOS DEL TITULAR ----------
-- La supresión (115) también borra lo que Equifax dijo de la persona. La
-- definición sale de la base viva, no de la 115: es idéntica salvo la línea
-- de consultas_equifax.
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

  v_conteos := v_conteos || jsonb_build_object('crudos_a_borrar', coalesce(array_length(v_crudos, 1), 0));

  insert into audit_log (actor, action, client_id, meta)
  values (p_responsable, 'titular.supresion', v_cliente,
          jsonb_build_object('motivo', trim(p_motivo), 'conteos', v_conteos));

  return jsonb_build_object('client_id', v_cliente, 'crudos', to_jsonb(v_crudos), 'conteos', v_conteos);
end;
$function$;
