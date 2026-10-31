-- ============================================================
-- 142: el proveedor pasa a llamarse Proveedor_Info_1 en la base
-- (decisión del negocio del 2026-10-31, por el contrato).
--
-- Renombra la tabla de recursos, sus restricciones y políticas, la clave
-- del proveedor, el recurso de la ruta de pensión, el origen del
-- Laboratorio, los comentarios y el cuerpo de las funciones. Crea el
-- depósito crudo-proveedor-info-1; el viejo se queda hasta que
-- `scripts/mover-crudo-proveedor-info-1.mjs` copie los objetos y la 143
-- lo borre (el depósito no se renombra con SQL: los archivos viven en el
-- almacenamiento por su nombre).
--
-- El nombre anterior se arma partido ('nova' || 'data'): una migración
-- que renombra algo tiene que nombrarlo, y el término no puede volver al
-- repositorio. Idempotente: en una base armada de cero con las
-- migraciones ya editadas, no hay nada que renombrar y no hace nada.
--
-- Orden: migrar (142, 143), copiar el depósito, después desplegar las
-- funciones (ESQUEMA_MINIMO = 143). Entre medio la pantalla vieja lee la
-- tabla vieja y falla; hacerlo en una ventana corta.
-- ============================================================

do $$
declare
  v   text := 'nova' || 'data';
  vc  text := 'Nova' || 'data';
  tabla_vieja text := v || '_resource_config';
  r   record;
  def text;
begin
  -- 1. La tabla de recursos y lo que cuelga de ella.
  if to_regclass('public.' || tabla_vieja) is not null then
    execute format('alter table public.%I rename to proveedor_info_1_resource_config', tabla_vieja);
    execute format('alter table public.proveedor_info_1_resource_config rename constraint %I to proveedor_info_1_resource_config_pkey',
      tabla_vieja || '_pkey');
    if exists (select 1 from pg_constraint where conname = tabla_vieja || '_proveedor_fke') then
      execute format('alter table public.proveedor_info_1_resource_config rename constraint %I to proveedor_info_1_resource_config_proveedor_fke',
        tabla_vieja || '_proveedor_fke');
    end if;
    execute format('alter policy %I on public.proveedor_info_1_resource_config rename to proveedor_info_1_resource_config_read',
      tabla_vieja || '_read');
    execute format('alter policy %I on public.proveedor_info_1_resource_config rename to proveedor_info_1_resource_config_update',
      tabla_vieja || '_update');
  end if;

  -- 2. El proveedor: la clave es referencia de la tabla de recursos y no
  -- tiene ON UPDATE CASCADE, así que se copia la fila, se mueven los
  -- recursos y se borra la vieja.
  if exists (select 1 from proveedores where clave = v) then
    insert into proveedores (clave, nombre, activo, notas, created_at)
    select 'proveedor_info_1', 'Proveedor_Info_1', activo, notas, created_at
      from proveedores where clave = v
    on conflict (clave) do nothing;
    update proveedor_info_1_resource_config set proveedor = 'proveedor_info_1' where proveedor = v;
    delete from proveedores where clave = v;
  end if;

  -- 3. El recurso de la ruta de pensión: lo referencia fuente_grupo (FK
  -- sin cascada), por eso también se copia la fila.
  if exists (select 1 from proveedor_info_1_resource_config where recurso = 'pensionAlimenticia' || vc) then
    insert into proveedor_info_1_resource_config
    select (jsonb_populate_record(null::proveedor_info_1_resource_config,
             to_jsonb(c) || jsonb_build_object('recurso', 'pensionAlimenticiaProveedorInfo1'))).*
      from proveedor_info_1_resource_config c where recurso = 'pensionAlimenticia' || vc;
    update fuente_grupo set fuente = 'pensionAlimenticiaProveedorInfo1' where fuente = 'pensionAlimenticia' || vc;
    delete from proveedor_info_1_resource_config where recurso = 'pensionAlimenticia' || vc;
  end if;

  -- 4. El origen de una reconsulta del Laboratorio.
  if exists (select 1 from pg_constraint where conname = 'lab_reconsultas_origen_check'
             and pg_get_constraintdef(oid) like '%' || v || '%') then
    alter table lab_reconsultas drop constraint lab_reconsultas_origen_check;
    update lab_reconsultas set origen = 'proveedor_info_1' where origen = v;
    alter table lab_reconsultas add constraint lab_reconsultas_origen_check
      check (origen in ('proveedor_info_1', 'simulada'));
  end if;

  -- 5. Depósito nuevo y su política de lectura (la vieja se queda hasta
  -- copiar los objetos).
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  select 'crudo-proveedor-info-1', 'crudo-proveedor-info-1', public, file_size_limit, allowed_mime_types
    from storage.buckets where id = 'crudo-' || v
  on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'crudo_proveedor_info_1_lectura_admin') then
    create policy crudo_proveedor_info_1_lectura_admin on storage.objects for select
      using (
        bucket_id = 'crudo-proveedor-info-1'
        and exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
      );
  end if;

  -- 6. Comentarios de tablas y columnas (cuerpo y definición salen de la
  -- base viva, no de una migración vieja).
  for r in
    select c.oid as rel, d.objsubid, d.description
      from pg_description d join pg_class c on c.oid = d.objoid
     where d.classoid = 'pg_class'::regclass and c.relnamespace = 'public'::regnamespace
       and d.description ilike '%' || v || '%'
  loop
    if r.objsubid = 0 then
      execute format('comment on table %s is %L', r.rel::regclass,
        replace(replace(r.description, vc, 'Proveedor_Info_1'), v, 'proveedor_info_1'));
    else
      execute format('comment on column %s.%I is %L', r.rel::regclass,
        (select attname from pg_attribute where attrelid = r.rel and attnum = r.objsubid),
        replace(replace(r.description, vc, 'Proveedor_Info_1'), v, 'proveedor_info_1'));
    end if;
  end loop;

  -- 7. Funciones cuyo cuerpo lo menciona (comentarios): se recrean desde
  -- la definición viva.
  for r in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.prosrc ilike '%' || v || '%'
  loop
    def := pg_get_functiondef(r.oid);
    execute replace(replace(replace(def, vc, 'Proveedor_Info_1'), upper(v), 'PROVEEDOR_INFO_1'), v, 'proveedor_info_1');
  end loop;
end $$;

-- Las filas chicas de configuración que lo nombran (el historial grande
-- va en la 143).
create or replace function pg_temp.renombrar(t text) returns text language sql immutable as $f$
  select regexp_replace(
         regexp_replace(
         regexp_replace(
         regexp_replace(
         regexp_replace(
         regexp_replace(t,
           '-' || 'nova' || 'data', '-proveedor-info-1', 'g'),
           'nova' || 'data' || '-', 'proveedor-info-1-', 'g'),
           'nova' || 'data' || '(?=[A-Z0-9])', 'proveedorInfo1', 'g'),
           '([A-Za-z0-9])Nova' || 'data', '\1ProveedorInfo1', 'g'),
           'Nova' || 'data|NOVA' || 'DATA', 'Proveedor_Info_1', 'g'),
           'nova' || 'data', 'proveedor_info_1', 'g')
$f$;

update lab_catalogo_variables
   set id = pg_temp.renombrar(id), nombre = pg_temp.renombrar(nombre),
       grupo = pg_temp.renombrar(grupo), ruta = pg_temp.renombrar(ruta::text)::text[]
 where id ilike '%nova' || 'data%' or nombre ilike '%nova' || 'data%'
    or grupo ilike '%nova' || 'data%' or ruta::text ilike '%nova' || 'data%';

update standard_profile_field_config
   set campo = pg_temp.renombrar(campo)
 where campo ilike '%nova' || 'data%';

update scoring_rules_versions
   set description = pg_temp.renombrar(description)
 where description ilike '%nova' || 'data%';

update lab_cargas
   set regla_plantada = pg_temp.renombrar(regla_plantada::text)::jsonb
 where regla_plantada::text ilike '%nova' || 'data%';

update proveedores
   set notas = pg_temp.renombrar(notas), nombre = pg_temp.renombrar(nombre)
 where notas ilike '%nova' || 'data%' or nombre ilike '%nova' || 'data%';
