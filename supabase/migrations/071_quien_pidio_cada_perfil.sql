-- La atribución de las consultas masivas, completa.
--
-- La 069 le puso responsable a los 2.684 registros de auditoría que no
-- tenían ninguno. Faltaba la otra mitad: `client_profiles.requested_by`,
-- que es de donde sale la columna "actividad por analista" del Reporte
-- Gerencial. Quedaba diciendo "Sin asignar: 2.643" al lado de un
-- expediente que ya nombraba a batch1 -- dos pantallas contando la
-- misma cosa de forma distinta, que es exactamente lo que la auditoría
-- vino a sacar.
--
-- No hay dónde marcar la fila como reconstruida: client_profiles no
-- tiene un campo de notas y agregarle uno para esto sería peor que el
-- problema. La señal la lleva el nombre de la cuenta, que el frontend
-- muestra como "Carga masiva (batch1) · Cuenta de servicio": nadie va a
-- leer eso y pensar que hubo alguien sentado frente a la pantalla.
--
-- Solo se tocan los perfiles anteriores a esta migración. De acá en
-- adelante el guion manda su responsable y el trabajador de lotes graba
-- el del lote, así que un requested_by nulo nuevo sería un defecto y
-- tiene que poder verse como tal.
update client_profiles
   set requested_by = '357cdfa6-5655-41a2-bc92-24e1c6df675f'
 where requested_by is null
   and created_at < now();

comment on column client_profiles.requested_by is
  'Quién pidió esta consulta. Los perfiles anteriores al 2026-09-16 que se corrieron por guion no lo registraban y se atribuyeron a la cuenta de servicio batch1 (migración 071). Desde entonces, un valor nulo es un defecto.';
