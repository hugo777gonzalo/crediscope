-- El consumo y su costo pasan a ser visibles solo para administración.
--
-- Hasta acá cualquier analista autenticado podía leer llm_llamadas. No
-- es un dato operativo: es el margen del negocio. Con esta tabla se
-- responde cuánto cuesta atender a un cliente y, por lo tanto, a cuánto
-- hay que vender el servicio. Mismo criterio que ya rige para
-- Retroalimentación y los parámetros del criterio (022, 027).

drop policy if exists llm_llamadas_read on llm_llamadas;
drop policy if exists llm_precios_read on llm_precios;

create policy llm_llamadas_read_admin on llm_llamadas for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

create policy llm_precios_read_admin on llm_precios for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- Sin esto la restricción de arriba no serviría de nada: una vista de
-- Postgres corre con los permisos de su dueño, así que leer llm_costos
-- esquivaría la política de la tabla que tiene debajo. Con
-- security_invoker la vista se evalúa con el permiso de quien consulta.
alter view llm_costos set (security_invoker = on);
