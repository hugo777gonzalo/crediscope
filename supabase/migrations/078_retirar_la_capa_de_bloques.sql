-- ============================================================
-- Paso 4 de la reorganización: se retira la capa de los 9 bloques.
--
-- La 067 dejó escrito que este era el paso 4 y por qué: los bloques
-- (general, trabajo, iess, bancos...) eran un accidente de la primera
-- integración, la relación real entre fuentes y grupos del perfil es
-- muchos a muchos, y vive en `fuente_grupo` desde entonces.
--
-- CUÁNTO EXAGERABAN, MEDIDO
--
-- La 068 guardó el detalle por fuente en paralelo para poder medirlo
-- antes de mover las lecturas. Sobre los perfiles que alcanzó a medir:
-- los cinco reportan ejes_ok = 9 --nueve de nueve, cobertura perfecta--
-- y fuentes_ok entre 14 y 25 sobre 52. O sea que "contestó todo" quería
-- decir, en el mejor caso, la mitad. La causa es `aggregateStatus`: un
-- bloque figuraba "ok" con UNA de sus fuentes respondiendo, y `bancos`
-- tenía catorce.
--
-- EL AGUJERO QUE ESTO TAPA
--
-- `sePuedeAfirmarQueNoAporta` preguntaba por el bloque `bancos` entero
-- para decidir si se puede afirmar que alguien no aporta al IESS. Los
-- aportes llegan en UNA de esas catorce fuentes (basesInternas), así
-- que el bloque podía decir "ok" porque contestó retails o listaNegra
-- mientras basesInternas había fallado: se afirmaba "no aporta"
-- exactamente en el caso en que no se sabía. Es la misma familia del
-- incidente del 2026-09-15, en chico y sin que nadie lo viera.
--
-- EJES_OK NO SE BORRA, Y ESA ES LA DECISIÓN DE FONDO
--
-- De 3.059 perfiles, 3.054 no tienen fuentes_ok: son anteriores al
-- 2026-09-17 y su única prueba de calidad es ejes_ok. 2.681 de ellos
-- son perfiles BUENOS. No se puede rellenar hacia atrás --el detalle
-- por fuente se perdió al agregarlo, la 068 ya lo dejó dicho-- y
-- estimarlo repartiendo el estado del bloque entre sus fuentes
-- inventaría precisión que nunca existió.
--
-- Así que la columna se jubila en vez de borrarse: deja de escribirse,
-- y quien pregunte "¿este perfil sirve?" mira fuentes_ok y cae a
-- ejes_ok cuando es null (elPerfilSirve, en calidad-de-la-consulta.ts).
-- Borrarla haría que el trabajador de lotes viera 2.681 consultas
-- fallidas donde hay perfiles buenos y las reconsultara a todas.
--
-- Es la misma trampa que empleoActual/empleosActuales: dos formas del
-- mismo dato conviviendo, y leer una sola no da error -- da un conteo
-- silencioso de menos.
-- ============================================================

-- ---------- 1. block_status se va ----------
--
-- Nada lo lee: las pantallas nunca lo consultaron y las tres funciones
-- que lo escribían ahora guardan estado_por_fuente, que es el mismo
-- dato sin agregar. Las vistas dependen de ejes_ok, no de esto, así que
-- no hace falta recrearlas para poder soltarlo.
alter table client_profiles   drop column if exists block_status;
alter table ingestion_runs    drop column if exists block_status;
alter table analysis_results  drop column if exists block_status;


-- ---------- 2. ejes_ok queda como registro histórico ----------
--
-- Pierde el default Y el not null, en ese orden y las dos cosas.
--
-- El default 0 era justamente lo que hacía que los perfiles de
-- analyze-client --que nunca escribió esta columna-- nacieran marcados
-- como consulta fallida. Pero sacar sólo el default deja la columna
-- not null sin con qué llenarla, y entonces NINGUNA fila nueva entra:
-- el primer lote de prueba después de esta migración falló entero por
-- eso. Una fila nueva no tiene ejes_ok porque ya no se miden ejes, y
-- null es exactamente lo que eso significa.
--
-- Las filas viejas conservan su valor: es el dato que tienen.
alter table client_profiles alter column ejes_ok drop default;
alter table client_profiles alter column ejes_ok drop not null;

comment on column client_profiles.ejes_ok is
  'HISTÓRICO, no se escribe más desde estructura-v3. Cuántos de los nueve bloques contestó la fuente, en los perfiles anteriores al 2026-09-17. Exagera: un bloque figuraba "ok" con una sola de sus catorce fuentes, y los perfiles medidos con las dos reglas dan 9 de 9 contra 14-25 de 52. Para saber si un perfil sirve usar fuentes_ok, cayendo acá sólo cuando es null (ver elPerfilSirve en _shared/calidad-de-la-consulta.ts).';

comment on column client_profiles.fuentes_ok is
  'Cuántas de las 52 fuentes contestaron. Es la medida vigente. null en los perfiles anteriores al 2026-09-17, donde sólo se guardó el agregado por bloque y no hay de dónde reconstruirlo.';


-- ---------- 3. La bandeja deja de creerle a los bloques ----------
--
-- `estado` y `consulta_util` decidían con ejes_ok. Ahora preguntan por
-- fuentes_ok y sólo caen a ejes_ok cuando la consulta es de la época en
-- que era lo único que había. Mismo criterio que elPerfilSirve, escrito
-- dos veces porque una vive en SQL y la otra en TypeScript -- si cambia
-- una, cambiar la otra.
--
-- fuentes_ok se agrega AL FINAL aunque quede lejos de ejes_ok, que es
-- donde tendría sentido leerla: `create or replace view` no sabe
-- insertar una columna en el medio, renombra la que estaba en esa
-- posición y falla. Ya pasó en la 044 y en la 065.
create or replace view bandeja_solicitudes with (security_invoker = on) as
with perfil as (
  select distinct on (cp.client_id)
    cp.client_id,
    cp.id                                                     as perfil_id,
    cp.created_at                                             as perfil_at,
    cp.origen                                                 as perfil_origen,
    cp.lote_id,
    cp.structure_version,
    cp.ejes_ok,
    cp.fuentes_ok,
    cp.fuente_segmento,
    cp.fuente_piso_ingreso,
    cp.fuente_estado,
    cp.fuente_corte,
    cp.control_bloqueo,
    cp.standard_profile -> 'identidad' ->> 'nombreCompleto'   as nombre,
    (cp.standard_profile -> 'identidad' ->> 'edad')::int      as edad,
    cp.standard_profile -> 'identidad' ->> 'provinciaNacimiento' as provincia,
    -- Los perfiles guardados antes de marco-v20 traen un solo empleo en
    -- `empleoActual` (objeto); los nuevos traen todos en
    -- `empleosActuales` (arreglo). Se lee el formato que cada perfil
    -- tenga: leer solo el arreglo mostraba "0 empleos" para 1.097
    -- personas que sí trabajan.
    case
      when jsonb_typeof(cp.standard_profile -> 'laboral' -> 'empleosActuales') = 'array'
        then jsonb_array_length(cp.standard_profile -> 'laboral' -> 'empleosActuales')
      when jsonb_typeof(cp.standard_profile -> 'laboral' -> 'empleoActual') = 'object'
        then 1
      else 0
    end as empleos_vigentes
  from client_profiles cp
  order by cp.client_id, cp.created_at desc
),
analisis as (
  select distinct on (ar.client_id)
    ar.client_id,
    ar.id                as analisis_id,
    ar.created_at        as analisis_at,
    ar.crediscope_score  as score,
    ar.recomendacion,
    ar.indicador_riesgo,
    ar.indicador_historial,
    ar.rules_version,
    ar.fallo_tipo,
    ar.veredicto_origen
  from analysis_results ar
  order by ar.client_id, ar.created_at desc
),
conteos as (
  select client_id, count(*) as consultas
  from client_profiles
  group by client_id
)
select
  c.id                 as client_id,
  c.cedula,
  c.created_at         as ingreso_at,
  p.nombre,
  p.edad,
  p.provincia,
  p.perfil_id,
  p.perfil_at,
  p.perfil_origen,
  p.lote_id,
  p.structure_version,
  p.fuente_segmento,
  p.fuente_piso_ingreso,
  p.fuente_estado,
  p.fuente_corte,
  p.empleos_vigentes,
  coalesce(n.consultas, 0) as consultas,
  a.analisis_id,
  a.analisis_at,
  -- Un análisis que falló guarda 500, que es el valor neutro por
  -- defecto y no un puntaje (ver 050).
  case when a.fallo_tipo is null then a.score end as score,
  case when a.fallo_tipo is null then a.recomendacion end as recomendacion,
  a.indicador_riesgo,
  a.indicador_historial,
  a.rules_version,
  a.fallo_tipo,
  a.veredicto_origen,
  greatest(
    coalesce(a.analisis_at, c.created_at),
    coalesce(p.perfil_at, c.created_at)
  ) as ultima_actividad,
  -- El estado distingue la consulta que no se pudo hacer de la persona
  -- que todavía no se analizó. No son lo mismo: una espera a un
  -- analista, la otra espera a que alguien vuelva a preguntarle a la
  -- fuente.
  case
    when p.perfil_id is null                          then 'sin_consulta'
    when coalesce(p.fuentes_ok, p.ejes_ok, 0) = 0     then 'consulta_fallida'
    when a.analisis_id is null                        then 'sin_analisis'
    when a.fallo_tipo is not null                     then 'no_completado'
    else 'analizado'
  end as estado,
  coalesce(jsonb_array_length(p.control_bloqueo -> 'hallazgos'), 0) as hallazgos_control,
  coalesce(
    (select bool_or((h ->> 'bloqueante')::boolean)
       from jsonb_array_elements(coalesce(p.control_bloqueo -> 'hallazgos', '[]'::jsonb)) h),
    false
  ) as tiene_bloqueante,
  coalesce(p.ejes_ok, 0) as ejes_ok,
  coalesce(p.fuentes_ok, p.ejes_ok, 0) > 0 as consulta_util,
  p.fuentes_ok
from clients c
left join perfil   p on p.client_id = c.id
left join analisis a on a.client_id = c.id
left join conteos  n on n.client_id = c.id;

comment on view bandeja_solicitudes is
  'Una fila por persona consultada, con su último Perfil del Cliente y su último Análisis con IA en columnas planas. estado = consulta_fallida cuando la fuente no contestó ninguna fuente; se mide con fuentes_ok y se cae a ejes_ok sólo en los perfiles anteriores al 2026-09-17. Alimenta la bandeja (/solicitudes).';


-- ---------- 4. La vista de comparación dice qué era cada cosa ----------
--
-- Sigue existiendo porque las dos mediciones van a convivir mientras
-- queden perfiles viejos en la cartera, y porque es el único lugar
-- donde se ve de cuánto era la exageración.
comment on view calidad_de_las_consultas is
  'Compara la medición vieja (ejes_ok, sobre 9 bloques, histórica) con la vigente (fuentes_ok, sobre 52 fuentes). Los perfiles anteriores al 2026-09-17 sólo tienen la vieja. Medido al retirar los bloques: 9 de 9 ejes equivalía a entre 14 y 25 de 52 fuentes.';


-- ---------- 5. El marco nuevo ----------
--
-- Sin esta fila, el primer análisis que corra falla por clave foránea
-- contra scoring_rules_versions.
--
-- marco-v22: lo que el modelo recibe sobre su propia cobertura pasa de
-- nueve ejes a 52 fuentes. No es cosmético -- el modelo venía leyendo
-- "9 de 9 consultados" cuando la mitad de las fuentes no habían
-- contestado, así que creía saber bastante más de lo que sabía. Además
-- se le explicita la distinción entre "la fuente dijo que no hay"
-- (hecho usable) y "la fuente no contestó" (hueco del que no se
-- concluye nada), que es la regla de docs/declaracion-de-disponibilidad.md
-- aplicada al nivel de fuente.
-- weights no se pasa: quedó sin uso desde que el scoring lo hace un
-- modelo guiado por texto y no una fórmula de pesos (ver el esquema).
-- is_active tampoco existe: se retiró en la 069.
insert into scoring_rules_versions (version, description) values
  ('marco-v22',
   'La cobertura se le declara al modelo por fuente (52) en vez de por eje (9): los ejes exageraban y el modelo creía saber más de lo que sabía -- 9 de 9 ejes equivalía a 14-25 de 52 fuentes. Se agrega además la distinción explícita entre "la fuente dijo que no hay" (hecho usable) y "la fuente no contestó" (hueco del que no se concluye nada).')
on conflict (version) do nothing;
