-- 151 · El resumen de la persona no retrocede a un perfil peor
--
-- Decisión del negocio del 2026-11-18 (D3 «ya»; decisión 3a de
-- docs/capa-de-hechos.md).
--
-- `refrescar_resumen_por_persona()` tomaba SIEMPRE el último perfil, aunque le
-- faltaran más fuentes obligatorias que a uno anterior. Una reconsulta que
-- salía peor dejaba a la persona en `consulta_incompleta` con un perfil
-- completo guardado unos días antes. Medido el 2026-11-17 sobre la cartera sin
-- sintéticas: 2 personas con un anterior MÁS completo dentro de los 7 días
-- previos al último (las dos pasaban a `consulta_incompleta`); 56 en cualquier
-- fecha, que no cambian.
--
-- Regla nueva: el perfil del resumen es el último, salvo que uno anterior,
-- dentro de los 7 días previos al último, tenga MENOS obligatorias faltantes
-- (misma cuenta que la bandeja: `fuentes_obligatorias_sin_respuesta`); en ese
-- caso se toma el de menos faltantes (el más reciente si empatan) y se enciende
-- `consulta_posterior_incompleta`. Un perfil sin detalle por fuente (anteriores
-- al 2026-09-17) cuenta 0 faltantes sólo porque no se puede juzgar: no sirve de
-- anterior mejor.
--
-- Lo único que cambia es el perfil elegido (el lateral `p`) y la columna nueva,
-- AL FINAL (regla 5); es una tabla, no una vista. El resto del cuerpo es la
-- definición viva (pg_get_functiondef, 2026-11-18), no la de la 145. Se
-- conservan security definer, search_path y los permisos (los de la 124 no
-- cambian con `create or replace`).
--
-- Qué NO cambia: «Reconsultar» y un análisis nuevo trabajan sobre
-- `client_profiles` (el último, o el `profileId` que manda la pantalla de
-- Análisis con IA desde sus propios perfiles), no sobre `perfil_id` del
-- resumen. El análisis (`a`) sigue siendo el último de la persona, aunque se
-- haya hecho sobre un perfil más nuevo que el del resumen: la marca avisa.
--
-- Ninguna función ni pantalla lee la columna nueva todavía: no hace falta
-- subir ESQUEMA_MINIMO. Después de aplicarla, refrescar sólo a las personas
-- afectadas (la base está en 477 de 500 MB), con la consulta de verificación
-- de docs/pendientes.md o `refrescar_resumen_por_persona(array[...])`.

alter table resumen_por_persona
  add column consulta_posterior_incompleta boolean not null default false;

comment on column resumen_por_persona.consulta_posterior_incompleta is
  'La persona tiene una consulta posterior (dentro de 7 días) con más fuentes obligatorias faltantes; el resumen muestra la anterior, más completa (151).';

CREATE OR REPLACE FUNCTION public.refrescar_resumen_por_persona(p_clientes uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from resumen_por_persona r
   where r.client_id = any(p_clientes)
     and not exists (select 1 from clients c where c.id = r.client_id);

  insert into resumen_por_persona as r (
    client_id, cedula, ingreso_at, es_sintetico, nombre, edad, provincia,
    perfil_id, perfil_at, perfil_origen, lote_id, structure_version,
    fuente_segmento, fuente_piso_ingreso, fuente_estado, fuente_corte,
    empleos_vigentes, consultas, analisis_id, analisis_at, score,
    recomendacion, indicador_riesgo, indicador_historial, rules_version,
    fallo_tipo, veredicto_origen, ultima_actividad, estado,
    hallazgos_control, tiene_bloqueante, ejes_ok, consulta_util, fuentes_ok,
    indicios_ingreso, perfil_laboral, fuentes_ingreso, tiene_demanda_cobro,
    calificacion_baja, tiene_mora, bloqueo_activo, es_independiente,
    empleo_vigente, es_jubilado, es_pensionista, respaldo_patrimonial,
    valor_colateral, analisis_ok_id, score_ok, recomendacion_ok,
    actualizado_en, consulta_buro_id, analisis_parcial,
    analisis_sobre_consulta_incompleta, consulta_posterior_incompleta
  )
  select
    c.id, c.cedula, c.created_at, c.es_sintetico,
    p.sp -> 'identidad' ->> 'nombreCompleto',
    (p.sp -> 'identidad' ->> 'edad')::integer,
    p.sp -> 'identidad' ->> 'provinciaNacimiento',
    p.id, p.created_at, p.origen, p.lote_id, p.structure_version,
    p.fuente_segmento, p.fuente_piso_ingreso, p.fuente_estado, p.fuente_corte,
    case
      when jsonb_typeof(p.sp -> 'laboral' -> 'empleosActuales') = 'array'
        then jsonb_array_length(p.sp -> 'laboral' -> 'empleosActuales')
      when jsonb_typeof(p.sp -> 'laboral' -> 'empleoActual') = 'object' then 1
      else 0
    end,
    coalesce(n.consultas, 0),
    a.id, a.created_at,
    case when a.fallo_tipo is null then a.crediscope_score end,
    -- La entrega: «aprobar» sobre una consulta parcial no pasa de «revisar».
    -- El análisis guardado no se toca (completitudDeLaConsulta).
    case when a.fallo_tipo is null then
      case when a.recomendacion = 'aprobar' and coalesce(ap.marca or ap.peso, false) then 'revisar' else a.recomendacion end
    end,
    a.indicador_riesgo, a.indicador_historial, a.rules_version, a.fallo_tipo, a.veredicto_origen,
    greatest(coalesce(a.created_at, c.created_at), coalesce(p.created_at, c.created_at)),
    case
      when p.id is null then 'sin_consulta'
      when coalesce(p.fuentes_ok, p.ejes_ok, 0) = 0 then 'consulta_fallida'
      when a.id is null and q.inc and rm.no_se_va then 'revision_manual'
      when a.id is null and q.inc then 'consulta_incompleta'
      when a.id is null then 'sin_analisis'
      when a.fallo_tipo is not null then 'no_completado'
      else 'analizado'
    end,
    coalesce(jsonb_array_length(p.control_bloqueo -> 'hallazgos'), 0),
    coalesce((select bool_or((h.value ->> 'bloqueante')::boolean)
                from jsonb_array_elements(coalesce(p.control_bloqueo -> 'hallazgos', '[]'::jsonb)) h(value)), false),
    coalesce(p.ejes_ok, 0),
    coalesce(p.fuentes_ok, p.ejes_ok, 0) > 0,
    p.fuentes_ok,
    p.indicios_ingreso,
    p.perfil_laboral,
    p.sp -> 'fuentesIngreso',
    (p.sp -> 'riesgoJudicialCrediticio' ->> 'numeroDemandasComoDemandado')::int > 0,
    -- Con una consulta vigente del buró (132): más de 90 días de mora en
    -- bancos como titular, que es D o E en la tabla de la Superintendencia
    -- para consumo (D empieza a los 91 días). Diners va dentro de bancos en
    -- Equifax, como en Proveedor_Info_1. Un grupo que Equifax no trajo queda sin medir
    -- (null), no en falso.
    case when b.id is not null then
      case when jsonb_typeof(b.estructura #> '{deudaActualTitular,bancos}') = 'object'
        then coalesce((b.estructura #>> '{deudaActualTitular,bancos,maximoDiasDeMora}')::numeric, 0) > 90 end
    else p.sp -> 'comportamientoBancario' ->> 'peorCalificacionRiesgo' in ('D', 'E') end,
    -- Con buró, el mismo monto en atraso que con Proveedor_Info_1 (vencido, no
    -- devenga, demanda o castigo), en bancos o cooperativas como titular. No
    -- los días: Equifax marca días de mora sin monto hasta los 30 días (16 de
    -- las 62 personas con consulta el 2026-10-16), y la marca diría otra cosa
    -- que con Proveedor_Info_1.
    case when b.id is not null then
      (select bool_or(coalesce((b.estructura #>> array['deudaActualTitular', sistema, campo])::numeric, 0) > 0)
         from unnest(array['bancos', 'cooperativas']) sistema,
              unnest(array['saldoVencidoUsd', 'saldoNoDevengaInteresesUsd', 'saldoDemandaJudicialUsd', 'saldoCarteraCastigadaUsd']) campo
        where jsonb_typeof(b.estructura #> array['deudaActualTitular', sistema]) = 'object')
    else coalesce((p.sp -> 'comportamientoBancario' ->> 'deudaEnAtraso')::numeric,
                  (p.sp -> 'comportamientoBancario' ->> 'saldoEnMoraBuroCredito')::numeric, 0) > 0
           or coalesce((p.sp -> 'comportamientoCooperativas' ->> 'saldoEnMora')::numeric, 0) > 0 end,
    (p.control_bloqueo ->> 'bloqueado')::boolean,
    (p.sp -> 'laboral' ->> 'esIndependiente')::boolean,
    -- Las dos formas del dato: `empleoActual` (antes de marco-v20) y
    -- `empleosActuales`.
    jsonb_typeof(p.sp -> 'laboral' -> 'empleoActual') = 'object'
      or jsonb_array_length(coalesce(p.sp -> 'laboral' -> 'empleosActuales', '[]'::jsonb)) > 0,
    (p.sp -> 'seguridadSocial' ->> 'esJubilado')::boolean,
    (p.sp -> 'seguridadSocial' ->> 'esPensionista')::boolean,
    (p.sp -> 'patrimonio' ->> 'tieneVehiculos')::boolean
      or coalesce((p.sp -> 'patrimonio' ->> 'numeroInmuebles')::int, 0) > 0,
    (p.sp -> 'patrimonio' ->> 'valorColateralVehiculos')::numeric,
    k.id, k.crediscope_score,
    case when k.recomendacion = 'aprobar' and coalesce(kp.marca or kp.peso, false) then 'revisar' else k.recomendacion end,
    now(),
    b.id,
    coalesce(ap.marca or ap.peso, false),
    coalesce(ap.marca, false),
    coalesce(p.es_anterior, false)
  from clients c
  -- El último perfil y cuántas obligatorias le faltan.
  left join lateral (
    select cp.id, cp.created_at,
           cardinality(fuentes_obligatorias_sin_respuesta(cp.estado_por_fuente)) as faltan
      from client_profiles cp
     where cp.client_id = c.id
     order by cp.created_at desc
     limit 1
  ) u on true
  left join lateral (
    -- El perfil del resumen: el último, o un anterior de los 7 días previos
    -- con menos obligatorias faltantes (151). Sólo cuentan los que tienen
    -- detalle por fuente y alguna fuente en el estado: sin eso `faltan` sería 0
    -- por no poder juzgarlo. `|| '{}'` deja el perfil descomprimido en memoria una sola vez: cada
    -- `->` sobre la columna lo descomprimiría de nuevo.
    select cp.id, cp.created_at, cp.origen, cp.lote_id, cp.structure_version,
           cp.ejes_ok, cp.fuentes_ok, cp.fuente_segmento, cp.fuente_piso_ingreso,
           cp.fuente_estado, cp.fuente_corte, cp.control_bloqueo, cp.estado_por_fuente,
           cp.indicios_ingreso, cp.perfil_laboral,
           cp.standard_profile || '{}'::jsonb as sp,
           cp.id <> u.id as es_anterior
      from client_profiles cp
     where cp.client_id = c.id
       and (cp.id = u.id
            or (cp.created_at < u.created_at
                and cp.created_at >= u.created_at - interval '7 days'
                and cp.estado_por_fuente is not null
                and cp.estado_por_fuente <> '{}'::jsonb
                and coalesce(cp.fuentes_ok, cp.ejes_ok, 0) > 0
                and cardinality(fuentes_obligatorias_sin_respuesta(cp.estado_por_fuente)) < u.faltan))
     order by (cp.id = u.id),
              cardinality(fuentes_obligatorias_sin_respuesta(cp.estado_por_fuente)),
              cp.created_at desc
     limit 1
  ) p on true
  left join lateral (
    select count(*) as consultas from client_profiles cp where cp.client_id = c.id
  ) n on true
  left join lateral (
    select ar.id, ar.created_at, ar.crediscope_score, ar.recomendacion,
           ar.indicador_riesgo, ar.indicador_historial, ar.rules_version,
           ar.fallo_tipo, ar.veredicto_origen, ar.client_profile_id
      from analysis_results ar
     where ar.client_id = c.id
     order by ar.created_at desc
     limit 1
  ) a on true
  left join lateral (
    select ar.id, ar.crediscope_score, ar.recomendacion, ar.client_profile_id
      from analysis_results ar
     where ar.client_id = c.id and ar.fallo_tipo is null
     order by ar.created_at desc
     limit 1
  ) k on true
  -- La consulta del perfil actual quedó incompleta: tiene alguna fuente en el
  -- estado pero le falta una obligatoria. Sin el detalle por fuente (perfiles
  -- anteriores al 2026-09-17) no hay nada que juzgar y no cuenta.
  left join lateral (
    select p.id is not null
           and coalesce(p.fuentes_ok, p.ejes_ok, 0) > 0
           and cardinality(fuentes_obligatorias_sin_respuesta(p.estado_por_fuente)) > 0 as inc
  ) q on true
  -- Sólo se mira la historia de quien está incompleta y sin análisis.
  left join lateral (
    select coalesce(q.inc and a.id is null and cardinality(fuentes_que_no_se_van(c.id)) > 0, false) as no_se_va
  ) rm on true
  -- El perfil con el que se hizo cada análisis (el último y el último que terminó).
  left join lateral (
    select cardinality(fuentes_obligatorias_sin_respuesta(cp.estado_por_fuente)) > 0 as marca,
           cardinality(fuentes_de_peso_con_error(cp.estado_por_fuente)) > 0 as peso
      from client_profiles cp where cp.id = a.client_profile_id
  ) ap on true
  left join lateral (
    select cardinality(fuentes_obligatorias_sin_respuesta(cp.estado_por_fuente)) > 0 as marca,
           cardinality(fuentes_de_peso_con_error(cp.estado_por_fuente)) > 0 as peso
      from client_profiles cp where cp.id = k.client_profile_id
  ) kp on true
  -- La consulta vigente del buró de la institución, sólo para quien tiene un
  -- perfil: las marcas son de lo que se sabe de la persona, como sin buró.
  left join lateral (
    select v.id, v.estructura from buro_vigente_de_la_persona(c.id) v where p.id is not null
  ) b on true
  where c.id = any(p_clientes)
  on conflict (client_id) do update set
    cedula = excluded.cedula,
    ingreso_at = excluded.ingreso_at,
    es_sintetico = excluded.es_sintetico,
    nombre = excluded.nombre,
    edad = excluded.edad,
    provincia = excluded.provincia,
    perfil_id = excluded.perfil_id,
    perfil_at = excluded.perfil_at,
    perfil_origen = excluded.perfil_origen,
    lote_id = excluded.lote_id,
    structure_version = excluded.structure_version,
    fuente_segmento = excluded.fuente_segmento,
    fuente_piso_ingreso = excluded.fuente_piso_ingreso,
    fuente_estado = excluded.fuente_estado,
    fuente_corte = excluded.fuente_corte,
    empleos_vigentes = excluded.empleos_vigentes,
    consultas = excluded.consultas,
    analisis_id = excluded.analisis_id,
    analisis_at = excluded.analisis_at,
    score = excluded.score,
    recomendacion = excluded.recomendacion,
    indicador_riesgo = excluded.indicador_riesgo,
    indicador_historial = excluded.indicador_historial,
    rules_version = excluded.rules_version,
    fallo_tipo = excluded.fallo_tipo,
    veredicto_origen = excluded.veredicto_origen,
    ultima_actividad = excluded.ultima_actividad,
    estado = excluded.estado,
    hallazgos_control = excluded.hallazgos_control,
    tiene_bloqueante = excluded.tiene_bloqueante,
    ejes_ok = excluded.ejes_ok,
    consulta_util = excluded.consulta_util,
    fuentes_ok = excluded.fuentes_ok,
    indicios_ingreso = excluded.indicios_ingreso,
    perfil_laboral = excluded.perfil_laboral,
    fuentes_ingreso = excluded.fuentes_ingreso,
    tiene_demanda_cobro = excluded.tiene_demanda_cobro,
    calificacion_baja = excluded.calificacion_baja,
    tiene_mora = excluded.tiene_mora,
    bloqueo_activo = excluded.bloqueo_activo,
    es_independiente = excluded.es_independiente,
    empleo_vigente = excluded.empleo_vigente,
    es_jubilado = excluded.es_jubilado,
    es_pensionista = excluded.es_pensionista,
    respaldo_patrimonial = excluded.respaldo_patrimonial,
    valor_colateral = excluded.valor_colateral,
    analisis_ok_id = excluded.analisis_ok_id,
    score_ok = excluded.score_ok,
    recomendacion_ok = excluded.recomendacion_ok,
    actualizado_en = excluded.actualizado_en,
    consulta_buro_id = excluded.consulta_buro_id,
    analisis_parcial = excluded.analisis_parcial,
    analisis_sobre_consulta_incompleta = excluded.analisis_sobre_consulta_incompleta;
end;
$function$;
