-- Que TODO análisis conserve la data estructurada que lo produjo, y que
-- se sepa exactamente cuál fue.
--
-- El problema, encontrado revisando qué queda guardado para poder
-- analizar después contra el incumplimiento real: analyze-client solo
-- persistía el perfil cuando reutilizaba uno ya generado por
-- structure-client (el camino de la web). Llamado en fresco -- el
-- camino de API, o un análisis directo -- calculaba los 124 campos en
-- memoria, se los mandaba al LLM y los descartaba junto con el crudo de
-- Novadata. Ese análisis quedaba con score pero sin la información que
-- lo explica: no se puede auditar, ni reprocesar, ni correlacionar
-- contra el default.
--
-- Y aun cuando el perfil existía, no había forma exacta de saber cuál:
-- analysis_results no lo referenciaba, se cruzaba por cercanía de
-- fecha. Con dos consultas del mismo cliente el mismo día, ese cruce ya
-- es ambiguo -- justo el tipo de error que no se nota hasta que los
-- números salen raros.

alter table analysis_results
  add column client_profile_id uuid references client_profiles(id) on delete set null;

create index analysis_results_client_profile_id_idx
  on analysis_results (client_profile_id);

-- Relleno de lo ya existente, SOLO donde no hay ambigüedad: un único
-- perfil del mismo cliente dentro de las 2 horas previas al análisis.
-- Si hay varios candidatos se deja en null a propósito -- un vínculo
-- inventado es peor que ninguno, porque se ve igual de confiable que
-- los que sí lo son.
with candidatos as (
  select a.id as analisis_id,
         p.id as perfil_id,
         count(*) over (partition by a.id) as cuantos
    from analysis_results a
    join client_profiles p
      on p.client_id = a.client_id
     and p.created_at <= a.created_at
     and p.created_at > a.created_at - interval '2 hours'
)
update analysis_results a
   set client_profile_id = c.perfil_id
  from candidatos c
 where c.analisis_id = a.id
   and c.cuantos = 1
   and a.client_profile_id is null;

-- ---------------------------------------------------------------
-- Retiro de la clasificación en 4 segmentos (paso 1 de 2).
--
-- classify.ts (positivo/negativo/complementario/sin información) fue
-- una definición anterior del diseño: hoy Perfil del Cliente muestra
-- los 16 grupos tal cual y quién juega a favor o en contra lo decide el
-- LLM. La clasificación se seguía calculando y guardando sin que nadie
-- la leyera. Para análisis posterior además estorba: solo cubre los
-- campos con una regla escrita a mano, y colapsa un número (47 días de
-- mora) en una etiqueta, que es justo la variación que un análisis de
-- correlación necesita.
--
-- Acá solo se deja de exigir, para poder desplegar el código que ya no
-- la escribe sin romper ninguna inserción. Las columnas se eliminan en
-- la 033, después del despliegue.
alter table client_profiles alter column classification drop not null;
alter table client_profiles alter column classification_version drop not null;
