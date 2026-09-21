-- La estructura estandarizada de Aval, al lado del crudo y del perfil.
--
-- consultas_aval ya guarda respuesta_cruda (el sobre de Aval sin tocar, la
-- fuente de verdad) y perfil (la normalización aval-perfil.ts). La ESTRUCTURA
-- estandarizada (aval-estructura.ts) es la capa que consume el análisis: los
-- ~86 campos de valor agrupados + la lista de deudas por entidad. Va en su
-- propia columna, versionada, para poder reprocesarla si cambia el builder
-- sin perder el crudo.

alter table consultas_aval add column estructura jsonb;
alter table consultas_aval add column estructura_version text;

comment on column consultas_aval.estructura is
  'Estructura estandarizada de Aval (aval-estructura.ts): campos de valor agrupados + deudasPorEntidad. Derivada de respuesta_cruda; el crudo sigue siendo la fuente de verdad.';
