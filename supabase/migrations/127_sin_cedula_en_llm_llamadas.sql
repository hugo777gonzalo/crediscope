-- 127 · La cédula fuera del registro de llamadas al modelo
--
-- analyze-client, el lote y la comparación de razonamiento copiaban la cédula
-- en llm_llamadas.contexto, además de client_id. Esa copia sobrevivía a la
-- supresión del titular: suprimir_titular() (115) sólo vacía client_id.
-- Medido el 2026-10-13: 325 filas con la cédula (200 del lote, 98 de la
-- comparación, 26 de analyze-client, 1 de una verificación de despliegue),
-- todas con client_id: borrar la copia no pierde a quién corresponde la
-- llamada. Costos › Detalle de llamadas lee la cédula de clients desde ese día.
--
-- Se aplica DESPUÉS de desplegar las funciones que ya no la escriben (el orden
-- de la regla 8 de CLAUDE.md: si se aplica antes, cada análisis vuelve a dejarla
-- hasta el despliegue).
--
-- audit_log tiene la misma copia en meta.identificacion (485 filas de Aval y
-- Equifax), pero no se puede corregir (113): las funciones dejan de escribirla
-- con este mismo cambio y lo viejo queda como está.

update llm_llamadas
set contexto = contexto - 'cedula'
where contexto ? 'cedula';
