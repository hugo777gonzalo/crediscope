-- El perfil nombra a TODOS los empleadores vigentes, no a uno solo.
--
-- laboral.empleoActual tomaba el registro más reciente del mecanizado
-- del IESS y lo daba por único. Pero quien tiene dos trabajos a la vez
-- tiene DOS registros con el mismo mes: el perfil nombraba uno y
-- escondía el otro.
--
-- Medido sobre la cartera completa: 834 de 2.564 personas, el 33%,
-- tienen más de una fuente vigente. Dejó de ser un caso de borde.
--
-- Es la misma clase de error que corrigió marco-v19 con el ingreso
-- promedio -- ahí se sumaban seis REGISTROS creyendo que eran seis
-- MESES -- y aparece por la misma razón: la fuente entrega una fila por
-- empleo y por mes, y tratarla como una fila por mes pierde la mitad de
-- la gente que tiene dos.
--
-- POR QUÉ ESCONDER AL SEGUNDO EMPLEADOR NO ERA UN DETALLE
--
-- Dos empleos son MÁS estabilidad que uno: perder uno no deja a la
-- persona sin ingreso. Y el segundo empleador es justo donde aparece el
-- empleo familiar, que este sistema busca a propósito -- las señales de
-- apellido compartido y de cliente que es su propio empleador solo
-- miraban al primero, así que un segundo empleo con un familiar pasaba
-- desapercibido. Ahora alcanza con que UNO de los empleadores vigentes
-- lo sea.
--
-- El campo cambia de forma (objeto -> lista), así que el marco se
-- actualiza en la misma versión: está medido que el modelo ignora lo
-- que el marco no le nombra, y dejar el texto hablando de un campo que
-- ya no existe sería peor que no cambiarlo.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v20',
   'laboral.empleoActual (objeto) pasa a laboral.empleosActuales (lista): el 33% de la cartera tiene mas de un empleo vigente y el perfil nombraba uno solo. Las senales de empleo familiar ahora miran a todos los empleadores.',
   '{}'::jsonb, true);

-- El campo cambia de nombre en la Estructura Estandarizada. La
-- configuración de campos habilitados lo referencia por nombre, así que
-- hay que renombrarlo ahí también o quedaría una fila huérfana
-- apuntando a un campo que ya no existe.
update standard_profile_field_config
   set campo = 'empleosActuales'
 where grupo = 'laboral' and campo = 'empleoActual';
