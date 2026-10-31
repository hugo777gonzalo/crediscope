-- ============================================================
-- 143: cierra el cambio de nombre a Proveedor_Info_1 (continúa la 142).
--
-- Quita la política del depósito anterior. El historial guardado (claves de
-- los perfiles, textos de los análisis, registros operativos) NO se
-- reescribe acá: cien MB en una sola sentencia pasan el tope de la conexión
-- (medido el 2026-10-31: 524 a los 2 minutos). Lo hace por lotes
-- `scripts/reescribir-historial-proveedor-info-1.mjs`, y el código nuevo lee
-- las claves nuevas, así que se corre entre migrar y desplegar.
-- ============================================================

-- El depósito viejo ya no lo lee nadie: su política se va ahora y el
-- depósito, con el guion de copia (storage no deja borrarlo con objetos).
do $$
begin
  execute format('drop policy if exists %I on storage.objects', 'crudo_' || 'nova' || 'data' || '_lectura_admin');
end $$;
