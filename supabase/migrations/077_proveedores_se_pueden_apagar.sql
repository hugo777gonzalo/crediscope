-- El interruptor de un proveedor no guardaba nada.
--
-- La migración 067 creó `proveedores` con política de SELECT únicamente.
-- La 076 agregó la fila de Aval y la pantalla /admin/fuentes/aval que la
-- prende y apaga -- pero sin política de UPDATE, RLS rechaza la escritura
-- y PostgREST devuelve 0 filas SIN error: la pantalla mostraba "guardado"
-- y el valor seguía igual. Es exactamente la trampa anotada en CLAUDE.md
-- ("una actualización bloqueada por RLS devuelve 0 filas, no un error") y
-- se colo igual por no haber probado la pantalla con sesión real.
--
-- Mismo criterio que novadata_resource_config_update y
-- aval_field_config_update: cualquier autenticado puede togglear (la
-- pantalla ya está detrás de RequireAdmin). No se agrega insert/delete: el
-- catálogo de proveedores lo define una migración, no la app.

create policy proveedores_update on proveedores for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
