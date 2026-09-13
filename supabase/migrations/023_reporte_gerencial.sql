-- Reporte Gerencial de Gestión (pestaña "Reportes"): dashboard agregado
-- para mostrar a un Jefe/Coordinador/Sub-gerente -- volumen y
-- tendencia de consultas, distribución de score, riesgo/cumplimiento,
-- perfil laboral/patrimonial y filtro por eje, sobre TODOS los
-- clientes (no uno a la vez como Perfil del Cliente/Historial).
--
-- Necesita leer profiles de OTROS usuarios para la sección "Actividad
-- por analista" (quién generó cuántos análisis) -- profiles_read_own
-- (022) solo dejaba leer la fila propia. Se reemplaza por una policy
-- que permite leer a cualquier autenticado, mismo criterio de
-- confianza interna que el resto de las tablas de este proyecto
-- (novadata_resource_config, standard_profile_field_config, etc. ya
-- son legibles por cualquier autenticado). No expone nada más sensible
-- que nombre_corto/entidad/rol -- ya visibles en el header de cada
-- analista.
drop policy profiles_read_own on profiles;
create policy profiles_read_all on profiles for select
  using (auth.role() = 'authenticated');
