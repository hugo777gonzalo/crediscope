-- ============================================================
-- El predictor de ingresos en el producto: el modelo y cada estimación.
--
-- Pasos 4 y 5 de docs/especificacion-predictor-de-ingresos.md, sección 6, para
-- el nivel 1 (decidido por el negocio el 2026-10-30). El nivel 2 espera a que
-- termine el respaldo crudo de Equifax y usará estas mismas tablas.
--
-- DÓNDE VIVE EL MODELO. Un archivo por modelo en el depósito privado
-- `modelos-de-ingreso` de cada base, y una fila en `modelos_de_ingreso` con su
-- huella. En git no puede ir: el repositorio es público y el modelo sale de
-- datos de personas reales. La función lee la fila en cada pedido y baja el
-- archivo sólo si la huella cambió, así que cambiar de modelo o encender una
-- calibración no pide desplegar. Lo publica scripts/publicar-modelo-de-ingreso.mjs.
--
-- LA CALIBRACIÓN va en la fila del modelo: hay una base por institución, y por
-- eso esa fila ya es la de la institución (punto 18.2 de docs/pendientes.md).
--
-- QUÉ SE GUARDA de cada estimación: la persona por su `client_id` (sin cédula ni
-- nombre), las variables con que se evaluó y los doce cuantiles. Con los
-- cuantiles se mide la cobertura contra el ingreso que aparezca después
-- (sección 7) y se rehacen los tramos cuando cambie el salario básico, sin
-- volver a evaluar. Una fila por cada vez que se evaluó el modelo: a un
-- dependiente no se le evalúa y no deja fila, sólo su constancia en audit_log.
--
-- Una evaluación no le cuesta nada al negocio y es la constancia de lo que se
-- le contestó a quién: por eso no se reutiliza la fila de una estimación igual.
-- ============================================================

create table modelos_de_ingreso (
  id              uuid primary key default gen_random_uuid(),
  version         text not null,
  nivel           smallint not null check (nivel in (1, 2)),
  estado          text not null default 'candidato'
                    check (estado in ('candidato', 'vigente', 'retirado')),
  -- El sha256 del archivo .json.gz: la función se niega a servir otro.
  huella_sha256   text not null unique check (huella_sha256 ~ '^[0-9a-f]{64}$'),
  entrenado_el    date not null,
  -- Con quién se entrenó: lo que la respuesta dice de sí misma.
  poblacion       text not null,
  -- Lo medido (R², cobertura, prueba en sombra), agregado y sin personas.
  metricas        jsonb not null,
  -- El bloque `origen` del archivo: huella de los datos de entrenamiento,
  -- fechas, parámetros y versiones de las bibliotecas (especificación, 5).
  origen          jsonb not null,
  ruta_archivo    text not null,
  -- { para, casos, corrimientoLog90, corrimientoLog85 }. Vacía = sin calibrar,
  -- y la respuesta lo dice (calibradoPara: null).
  calibracion     jsonb check (calibracion is null or jsonb_typeof(calibracion) = 'object'),
  publicado_el    timestamptz not null default now(),
  vigente_desde   timestamptz,
  retirado_el     timestamptz,
  -- Dos archivos con la misma versión serían dos modelos con un solo nombre: las
  -- estimaciones guardadas no dirían cuál las calculó.
  unique (version, nivel)
);

comment on table modelos_de_ingreso is
  'Los modelos del predictor de ingresos (141). Una fila por modelo, un solo vigente por nivel. La escribe scripts/publicar-modelo-de-ingreso.mjs; el archivo está en el depósito modelos-de-ingreso.';

create unique index modelos_de_ingreso_un_vigente_por_nivel on modelos_de_ingreso (nivel) where estado = 'vigente';

create table estimaciones_de_ingreso (
  -- Lo arma la función: el id va también dentro de `respuesta`.
  id                 uuid primary key,
  creada_el          timestamptz not null default now(),
  creada_por         uuid not null references profiles(id),
  client_id          uuid not null references clients(id) on delete cascade,
  client_profile_id  uuid references client_profiles(id) on delete set null,
  solicitud_id       uuid references solicitudes(id) on delete set null,
  modelo_id          uuid not null references modelos_de_ingreso(id),
  nivel              smallint not null check (nivel in (1, 2)),
  version_variables  text not null,
  -- El reloj de la estimación: la fecha de la consulta, no la de hoy (ver
  -- _shared/estimacion-de-ingreso.ts).
  consultada_el      timestamptz not null,
  -- Las variables tal como entraron al modelo: la edad, el sexo, la fecha y el
  -- SRI, sin identificadores. `sin_dato`, las que llegaron vacías.
  variables          jsonb not null,
  sin_dato           text[] not null default '{}',
  cuantiles_log      double precision[] not null check (cardinality(cuantiles_log) = 12),
  minimo_90          numeric(14, 2) not null,
  minimo_85          numeric(14, 2) not null,
  valor_central      numeric(14, 2) not null,
  -- La calibración con que se calculó: la del modelo puede cambiar después.
  calibracion        jsonb,
  -- Lo que se contestó, entero.
  respuesta          jsonb not null
);

comment on table estimaciones_de_ingreso is
  'Cada evaluación del predictor de ingresos (141). La escribe sólo la función estimar-ingreso (clave de servicio); la pantalla lee. Sin cédula ni nombre: la persona va por client_id.';

create index estimaciones_de_ingreso_cliente_idx on estimaciones_de_ingreso (client_id, creada_el desc);
create index estimaciones_de_ingreso_solicitud_idx on estimaciones_de_ingreso (solicitud_id) where solicitud_id is not null;
create index estimaciones_de_ingreso_modelo_idx on estimaciones_de_ingreso (modelo_id, creada_el desc);

-- ---------- ACCESO ----------
-- Igual que solicitudes (133): la pantalla lee con la sesión; escriben sólo la
-- función y el guion, con la clave de servicio.
alter table modelos_de_ingreso enable row level security;
alter table estimaciones_de_ingreso enable row level security;

create policy modelos_de_ingreso_lectura on modelos_de_ingreso for select
  using (exists (select 1 from profiles where id = auth.uid() and rol in ('analista', 'admin')));
create policy estimaciones_de_ingreso_lectura on estimaciones_de_ingreso for select
  using (exists (select 1 from profiles where id = auth.uid() and rol in ('analista', 'admin')));

revoke all on modelos_de_ingreso from anon, authenticated;
revoke all on estimaciones_de_ingreso from anon, authenticated;
grant select on modelos_de_ingreso to authenticated;
grant select on estimaciones_de_ingreso to authenticated;

-- ---------- EL DEPÓSITO ----------
-- Sin ninguna política: el archivo no es para el navegador, y la clave de
-- servicio la saltea. 5 MB holgados: un modelo pesa 0,5 MB comprimido.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('modelos-de-ingreso', 'modelos-de-ingreso', false, 5242880, array['application/gzip'])
on conflict (id) do nothing;

-- ---------- CAMBIAR DE MODELO ----------
-- Una función y no dos actualizaciones del guion: entre las dos no habría
-- ningún modelo vigente y una estimación fallaría. Sirve también para volver a
-- uno retirado. Un modelo nuevo no pasa a vigente sin compararlo con el vigente
-- sobre los mismos casos (especificación, 7).
create function activar_modelo_de_ingreso(p_modelo uuid)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_nivel smallint;
begin
  select nivel into v_nivel from modelos_de_ingreso where id = p_modelo and estado <> 'vigente';
  if v_nivel is null then
    raise exception 'El modelo no existe o ya está vigente.';
  end if;
  update modelos_de_ingreso set estado = 'retirado', retirado_el = now() where nivel = v_nivel and estado = 'vigente';
  update modelos_de_ingreso set estado = 'vigente', vigente_desde = now(), retirado_el = null where id = p_modelo;
end;
$function$;

revoke execute on function activar_modelo_de_ingreso(uuid) from public, anon, authenticated;
grant execute on function activar_modelo_de_ingreso(uuid) to service_role;

-- ---------- LA SUPRESIÓN DEL TITULAR ----------
-- Desde la definición viva (pg_get_functiondef, 2026-10-30, igual a la de la
-- 136), con las estimaciones sumadas al principio.
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

  insert into audit_log (actor, action, client_id, meta)
  values (p_responsable, 'titular.supresion', v_cliente,
          jsonb_build_object('motivo', trim(p_motivo), 'conteos', v_conteos, 'sin_persona', v_cliente is null));

  return jsonb_build_object('client_id', v_cliente, 'crudos', to_jsonb(v_crudos), 'conteos', v_conteos);
end;
$function$;
