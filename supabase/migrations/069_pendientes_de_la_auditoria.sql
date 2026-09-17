-- ============================================================
-- Tres pendientes de la auditoría del 2026-09-16, resueltos con lo que
-- se midió y no con lo que se suponía.
-- ============================================================

-- ---------- 1. Las 12 fuentes que nadie leía, con su grupo ----------
--
-- Se consultaron por el explorador contra 12 personas de la cartera,
-- una por segmento, para ver QUÉ devuelven. No se adivinó.
--
-- El resultado obliga a una distinción que importa: "vino vacío" no es
-- lo mismo para todas. Que `siniestros` venga vacío en 12 de 12 es lo
-- esperable --esas personas no chocaron-- y ese vacío es información.
-- Que `vacunados` venga vacío es que no trae nada, nunca, para nadie.
--
-- CON DATO PARA LA POBLACIÓN GENERAL (4)
--   titulos             título, tipo, establecimiento educativo, fecha
--                       de registro. Respalda el nivelEducacion que hoy
--                       viene de general con el título concreto.
--   trabajoHistoricos   historial con el patrono identificado por RUC,
--                       fecha de ingreso y antigüedad. Distinto del
--                       mecanizado, que trae el salario.
--   afiliacionSalud     entidad, si registra cobertura y tipo de
--                       seguro. Ej: IESS, "seguro general tiempo
--                       completo".
--   afiliacionSiisspol  responde siempre, con las afiliaciones
--                       policiales o la frase "No tiene afiliaciones
--                       registradas". Confirma o descarta.
--
-- CON DATO SOLO PARA UNA MINORÍA, Y EL VACÍO TAMBIÉN INFORMA (6)
--   siniestros, polizas            del vehículo
--   deudores                       no figurar es un dato
--   afiliacionIsspol,
--   afiliacionIssfacCertMedico     policías y militares
--
-- ROTAS (2)
--   afiliacionIssfacFuerzaArmada   404 en 12 de 12
--   deudasFirmes                   404 en 12 de 12
--   Se marcan pero no se vinculan: primero hay que preguntarle al
--   proveedor si la ruta cambió o el recurso ya no existe.
--
-- SIN RELACIÓN CON CRÉDITO (1)
--   vacunados   responde OK y nunca trae contenido. Es un padrón de
--               vacunación: no dice nada de la capacidad de pago ni del
--               comportamiento de nadie. Candidata a apagar; la
--               decisión es del negocio y no de esta migración.
--
-- OJO: vincular NO es leer. Esto deja registrado a qué grupo pertenece
-- cada una; que process.ts efectivamente use el dato es trabajo aparte,
-- porque agrega campos al perfil y cambia lo que el modelo ve.
insert into fuente_grupo (fuente, grupo) values
  ('titulos', 'identidad'),
  ('trabajoHistoricos', 'laboral'),
  ('afiliacionSalud', 'seguridadSocial'),
  ('afiliacionSiisspol', 'seguridadSocial'),
  ('afiliacionIsspol', 'seguridadSocial'),
  ('afiliacionIssfacCertMedico', 'seguridadSocial'),
  ('siniestros', 'transitoVehicular'),
  ('polizas', 'transitoVehicular'),
  ('deudores', 'comportamientoBancario')
on conflict do nothing;

alter table novadata_resource_config add column if not exists estado_del_recurso text;
comment on column novadata_resource_config.estado_del_recurso is
  'Qué se sabe del recurso en sí: responde, no_responde (404 sistemático), sin_contenido (responde y nunca trae nada). Distinto de enabled, que es una decisión nuestra.';

update novadata_resource_config set estado_del_recurso = 'no_responde'
 where recurso in ('afiliacionIssfacFuerzaArmada', 'deudasFirmes');
update novadata_resource_config set estado_del_recurso = 'sin_contenido'
 where recurso = 'vacunados';
update novadata_resource_config set estado_del_recurso = 'responde'
 where estado_del_recurso is null;


-- ---------- 2. Un responsable para las consultas masivas ----------
--
-- 2.684 registros de auditoría con actor nulo: los corrió un guion
-- autenticado con la clave de servicio, y para una clave de servicio no
-- hay usuario. El agujero ya está tapado hacia adelante (el guion no
-- arranca sin responsable), pero la historia quedaba anónima.
--
-- Se les asigna una cuenta de servicio. NO es una persona y el nombre
-- lo dice: quien lea el expediente tiene que entender que detrás hubo
-- un proceso, no alguien sentado frente a la pantalla.
--
-- Y cada fila queda marcada como reconstruida. Reescribir un registro
-- de auditoría sin decir que se reescribió es peor que dejarlo vacío:
-- el vacío se nota, la atribución silenciosa no.
insert into profiles (id, nombre_corto, entidad, rol) values
  ('357cdfa6-5655-41a2-bc92-24e1c6df675f', 'Carga masiva (batch1)', 'Cuenta de servicio', 'analista')
on conflict (id) do update set nombre_corto = excluded.nombre_corto, entidad = excluded.entidad;

update audit_log
   set actor = '357cdfa6-5655-41a2-bc92-24e1c6df675f',
       meta = meta || jsonb_build_object(
         'actor_reconstruido', true,
         'actor_reconstruido_el', '2026-09-16',
         'actor_reconstruido_porque', 'La corrida original se autenticó con la clave de servicio y no registró usuario. Se atribuye a la cuenta de servicio batch1; no consta qué persona la ordenó.'
       )
 where actor is null;


-- ---------- 3. is_active, que no lee nadie ----------
--
-- marco-v19 y marco-v20 estaban las dos marcadas como activas y la 065
-- dejó una sola. Pero el problema de fondo no era cuál: es que la
-- columna NO PUEDE ser autoritativa.
--
-- El texto del marco vive en marco-interpretativo.ts, no en la base. La
-- versión que rige es la constante MARCO_VERSION de ese archivo, porque
-- es la única que viene acompañada del texto que la implementa. Si la
-- base dijera "v19 activa" mientras el código lleva v20, la base estaría
-- mintiendo -- y si el código le hiciera caso, intentaría honrar una
-- versión cuyo texto no tiene.
--
-- Una marca de "vigente" solo tiene sentido si las versiones son dato.
-- Acá son código. Se borra la columna; la tabla sigue siendo lo que de
-- verdad es: el registro histórico de versiones al que cada análisis se
-- ata por clave foránea.
alter table scoring_rules_versions drop column if exists is_active;

comment on table scoring_rules_versions is
  'Registro histórico de las versiones del marco interpretativo. Cada análisis se ata a la suya para poder auditar por qué obtuvo ese puntaje aunque el marco cambie después. NO dice cuál rige: el marco es código (marco-interpretativo.ts) y la versión vigente es su constante MARCO_VERSION.';
