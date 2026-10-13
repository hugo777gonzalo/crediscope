-- 123 · La bandeja sin abrir todos los perfiles
--
-- Se fusionó como 122 y pasó a 123 sin aplicarse: la 122 de la base es
-- 122_consultas_equifax.sql, que otra sesión aplicó desde su rama el mismo
-- día. El corredor dio la base por al día y esta no corrió.
--
-- La primera página de la bandeja (50 personas, ordenadas por la última
-- actividad) tardaba 5,3 s con el rol de la pantalla (medido el
-- 2026-10-12, 8.590 perfiles de 2.812 personas), y la franja de totales,
-- 8,6 s con la base fría: por encima del corte de 8 s.
--
-- La vista elegía el último perfil de cada persona con un DISTINCT ON sobre
-- TODOS los perfiles, y calculaba antes de elegir el nombre, la edad, la
-- provincia y los empleos, que salen de adentro de standard_profile. Eso
-- descomprimía los 8.590 perfiles enteros para quedarse con 2.812 (lo mismo
-- que corte_iess_vigente(), arreglado en la 121).
--
-- Ahora el último perfil se elige sólo con (client_id, created_at), que
-- tienen índice, sin tocar standard_profile, y el JSON se lee únicamente de ése. La salida es la
-- misma, columna por columna. Ensayado: la primera página pasó de 5,3 s a
-- 0,18 s, con las mismas 50 filas.
--
-- Es la definición viva (pg_get_viewdef) con ese cambio. create or replace
-- view reemplaza las opciones de la vista: security_invoker va explícito
-- (CLAUDE.md, "Base, PostgREST y procesos").
--
-- Es un arreglo de transición: la bandeja pasa a una tabla de una fila por
-- persona, al día con cada consulta (decisión del negocio del 2026-10-12).

create or replace view bandeja_solicitudes
with (security_invoker = true)
as
WITH ultimo AS (
         SELECT DISTINCT ON (client_profiles.client_id) client_profiles.id
           FROM client_profiles
          ORDER BY client_profiles.client_id, client_profiles.created_at DESC
        ), perfil AS (
         SELECT DISTINCT ON (cp.client_id) cp.client_id,
            cp.id AS perfil_id,
            cp.created_at AS perfil_at,
            cp.origen AS perfil_origen,
            cp.lote_id,
            cp.structure_version,
            cp.ejes_ok,
            cp.fuentes_ok,
            cp.fuente_segmento,
            cp.fuente_piso_ingreso,
            cp.fuente_estado,
            cp.fuente_corte,
            cp.control_bloqueo,
            cp.indicios_ingreso,
            ((cp.standard_profile -> 'identidad'::text) ->> 'nombreCompleto'::text) AS nombre,
            (((cp.standard_profile -> 'identidad'::text) ->> 'edad'::text))::integer AS edad,
            ((cp.standard_profile -> 'identidad'::text) ->> 'provinciaNacimiento'::text) AS provincia,
                CASE
                    WHEN (jsonb_typeof(((cp.standard_profile -> 'laboral'::text) -> 'empleosActuales'::text)) = 'array'::text) THEN jsonb_array_length(((cp.standard_profile -> 'laboral'::text) -> 'empleosActuales'::text))
                    WHEN (jsonb_typeof(((cp.standard_profile -> 'laboral'::text) -> 'empleoActual'::text)) = 'object'::text) THEN 1
                    ELSE 0
                END AS empleos_vigentes
           FROM client_profiles cp
             JOIN ultimo u ON u.id = cp.id
          ORDER BY cp.client_id
        
        ), analisis AS (
         SELECT DISTINCT ON (ar.client_id) ar.client_id,
            ar.id AS analisis_id,
            ar.created_at AS analisis_at,
            ar.crediscope_score AS score,
            ar.recomendacion,
            ar.indicador_riesgo,
            ar.indicador_historial,
            ar.rules_version,
            ar.fallo_tipo,
            ar.veredicto_origen
           FROM analysis_results ar
          ORDER BY ar.client_id, ar.created_at DESC
        ), conteos AS (
         SELECT client_profiles.client_id,
            count(*) AS consultas
           FROM client_profiles
          GROUP BY client_profiles.client_id
        )
 SELECT c.id AS client_id,
    c.cedula,
    c.created_at AS ingreso_at,
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
    COALESCE(n.consultas, (0)::bigint) AS consultas,
    a.analisis_id,
    a.analisis_at,
        CASE
            WHEN (a.fallo_tipo IS NULL) THEN a.score
            ELSE NULL::integer
        END AS score,
        CASE
            WHEN (a.fallo_tipo IS NULL) THEN a.recomendacion
            ELSE NULL::text
        END AS recomendacion,
    a.indicador_riesgo,
    a.indicador_historial,
    a.rules_version,
    a.fallo_tipo,
    a.veredicto_origen,
    GREATEST(COALESCE(a.analisis_at, c.created_at), COALESCE(p.perfil_at, c.created_at)) AS ultima_actividad,
        CASE
            WHEN (p.perfil_id IS NULL) THEN 'sin_consulta'::text
            WHEN (COALESCE(p.fuentes_ok, p.ejes_ok, 0) = 0) THEN 'consulta_fallida'::text
            WHEN (a.analisis_id IS NULL) THEN 'sin_analisis'::text
            WHEN (a.fallo_tipo IS NOT NULL) THEN 'no_completado'::text
            ELSE 'analizado'::text
        END AS estado,
    COALESCE(jsonb_array_length((p.control_bloqueo -> 'hallazgos'::text)), 0) AS hallazgos_control,
    COALESCE(( SELECT bool_or(((h.value ->> 'bloqueante'::text))::boolean) AS bool_or
           FROM jsonb_array_elements(COALESCE((p.control_bloqueo -> 'hallazgos'::text), '[]'::jsonb)) h(value)), false) AS tiene_bloqueante,
    COALESCE(p.ejes_ok, 0) AS ejes_ok,
    (COALESCE(p.fuentes_ok, p.ejes_ok, 0) > 0) AS consulta_util,
    p.fuentes_ok,
    p.indicios_ingreso,
    c.es_sintetico
   FROM (((clients c
     LEFT JOIN perfil p ON ((p.client_id = c.id)))
     LEFT JOIN analisis a ON ((a.client_id = c.id)))
     LEFT JOIN conteos n ON ((n.client_id = c.id)));

-- Una fila por persona y la opción de seguridad en su lugar. Si no, el
-- corredor revierte la migración entera.
do $$
begin
  if (select count(*) from bandeja_solicitudes) <> (select count(*) from clients) then
    raise exception 'La bandeja no tiene una fila por persona';
  end if;
  if not (select coalesce(reloptions, '{}') @> array['security_invoker=true'] from pg_class where oid = 'bandeja_solicitudes'::regclass) then
    raise exception 'La bandeja perdió security_invoker';
  end if;
end;
$$;
