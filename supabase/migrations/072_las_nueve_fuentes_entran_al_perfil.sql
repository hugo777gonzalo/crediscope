-- ============================================================
-- Las nueve fuentes pasan de estar vinculadas a estar leídas.
--
-- La 067 dejó registrado a qué grupo pertenece cada una. Esto es el
-- paso siguiente: process.ts ahora usa el dato, y el perfil gana 19
-- campos. Por eso hay marco nuevo -- lo que el modelo ve cambió.
--
-- LOS CAMPOS SALIERON DEL DATO, NO DE LA INTUICIÓN
--
-- Se inspeccionaron las 12 fuentes contra 16 personas de la cartera.
-- Cuatro tienen estructura conocida y de ellas se leen campos
-- concretos; cinco vinieron vacías en las 16, así que de esas solo se
-- cuenta lo que hay. Contar es lo único afirmable sin inventar una
-- forma que nadie vio.
-- ============================================================

-- ---------- Los campos nuevos, disponibles para el análisis ----------
--
-- Cada campo del perfil se puede excluir del criterio sin sacarlo del
-- perfil (ver 016). Entran todos habilitados: son datos que hasta ayer
-- se pagaban y se tiraban.
insert into standard_profile_field_config (grupo, campo, enabled) values
  -- De pn_titulos. El nivel de educación venía solo de la ficha
  -- general; esto lo respalda con el título concreto -- o lo
  -- contradice, que informa igual.
  ('identidad', 'titulosRegistrados', true),
  ('identidad', 'tituloMasAlto', true),
  ('identidad', 'nivelMaximoSegunTitulos', true),
  ('identidad', 'institucionTituloMasAlto', true),

  -- De pn_trabajo_historicos. Es la más valiosa de las nueve: trae
  -- QUIÉN es el empleador, que el mecanizado del IESS no dice. Para un
  -- dependiente, el riesgo de dejar de cobrar es en buena medida el
  -- riesgo de quien le paga.
  ('laboral', 'cargoVigente', true),
  ('laboral', 'empleadorVigenteSituacionLegal', true),
  ('laboral', 'empleadorVigenteTipoCompania', true),
  ('laboral', 'empleadorVigenteAntiguedadAnios', true),
  ('laboral', 'salarioMasAltoRegistrado', true),
  ('laboral', 'historialEmpleosRegistrados', true),
  ('laboral', 'empleadoresJuridicos', true),

  -- De pn_afiliacion_salud y los regímenes especiales. La cobertura de
  -- salud es una corroboración INDEPENDIENTE del empleo formal: sale de
  -- otro recurso que el que ya se usa para el empleo.
  ('seguridadSocial', 'tieneCoberturaSalud', true),
  ('seguridadSocial', 'entidadesSaludConCobertura', true),
  ('seguridadSocial', 'tipoSeguroSalud', true),
  ('seguridadSocial', 'afiliadoSeguridadPolicial', true),
  ('seguridadSocial', 'afiliadoSeguridadMilitar', true),

  -- Solo conteos: estructura desconocida.
  ('transitoVehicular', 'numeroSiniestros', true),
  ('transitoVehicular', 'numeroPolizas', true),
  ('comportamientoBancario', 'figuraEnRegistroDeudores', true)
on conflict (grupo, campo) do nothing;


-- ---------- Las tres descartadas, sin perderlas de vista ----------
--
-- afiliacionIssfacFuerzaArmada y deudasFirmes dan 404 sistemático;
-- vacunados responde OK con el sobre vacío. Se descartan, pero
-- "descartar" no puede ser lo mismo que "olvidar": el proveedor puede
-- arreglar una ruta o empezar a poblar un padrón sin avisarle a nadie,
-- y sin esto nos enteraríamos por casualidad dentro de dos años.
--
-- Desde hoy estado_por_fuente distingue `ok` de `ok_vacio` (ver
-- calidad-de-la-consulta.ts), así que la pregunta se puede contestar
-- con lo que ya se guarda en cada perfil.
create or replace view fuentes_que_despertaron with (security_invoker = on) as
select
  f.recurso                                    as fuente,
  f.estado_del_recurso                         as estado_registrado,
  count(*) filter (where p.estado_por_fuente ->> f.recurso = 'ok')        as veces_con_contenido,
  count(*) filter (where p.estado_por_fuente ->> f.recurso = 'ok_vacio')  as veces_vacia,
  count(*) filter (where p.estado_por_fuente ->> f.recurso = 'faltante')  as veces_sin_dato,
  count(*) filter (where p.estado_por_fuente ->> f.recurso = 'error')     as veces_con_error,
  max(p.created_at) filter (where p.estado_por_fuente ->> f.recurso = 'ok') as ultima_vez_con_contenido
from novadata_resource_config f
join client_profiles p on p.estado_por_fuente ? f.recurso
where f.estado_del_recurso in ('no_responde', 'sin_contenido')
group by f.recurso, f.estado_del_recurso;

comment on view fuentes_que_despertaron is
  'Las fuentes descartadas por no traer nunca nada, con lo que pasó desde entonces. Si veces_con_contenido deja de ser 0, esa fuente empezó a traer datos y hay que volver a mirarla.';


-- ---------- Marco nuevo: el modelo ve 19 campos más ----------
-- weights no se pasa: quedó sin uso desde que el scoring lo hace un
-- modelo guiado por texto y no una fórmula de pesos (ver el esquema).
insert into scoring_rules_versions (version, description) values
  ('marco-v21',
   'Entran al perfil las nueve fuentes que se consultaban y nadie leía. Lo más relevante: quién es el empleador (situación legal, tipo de compañía, antigüedad) y el salario más alto registrado, que junto al piso del IESS acota el ingreso real; la cobertura de salud como corroboración independiente del empleo formal; y los títulos registrados, que respaldan o contradicen el nivel de educación declarado.')
on conflict (version) do nothing;
