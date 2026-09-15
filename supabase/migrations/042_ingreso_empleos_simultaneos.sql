-- Corrige el ingreso promedio de quienes tienen 2 empleos simultáneos.
--
-- ingresoPromedioUltimos6Meses tomaba los 6 REGISTROS más recientes del
-- mecanizado del IESS y los promediaba. Pero quien tiene dos empleos a
-- la vez tiene dos registros por mes: esos "6 registros" eran 3 meses, y
-- el promedio devolvía la MITAD de su ingreso real.
--
-- Medido sobre 389 clientes reales, 8 quedaron mal calculados y 3 de
-- forma grave:
--   0105712012   $825   -> $1.650   (+100%)
--   0922854674   $1.425 -> $2.850   (+100%)
--   0301955464   $646   -> $1.176   (+82%)
--
-- Ahora se suma POR MES y recién después se promedian los meses.
--
-- No agrega campos: es el mismo campo con el cálculo corregido, así que
-- no hace falta tocar standard_profile_field_config. Los análisis ya
-- guardados conservan el valor viejo -- se corrigen al reanalizar.
--
-- Nota de trazabilidad: este error estuvo oculto porque una primera
-- verificación se hizo contra la clave equivocada del recurso
-- (trabajoHistoricosMecanizado en vez de mecanizadoEmpleados) y recorrió
-- arreglos vacíos, dando "0 casos" por ausencia de datos y no por
-- ausencia de bug.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v19',
   'Corrige ingresoPromedioUltimos6Meses: suma por mes antes de promediar (empleos simultáneos daban la mitad del ingreso real)',
   '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version <> 'marco-v19';
