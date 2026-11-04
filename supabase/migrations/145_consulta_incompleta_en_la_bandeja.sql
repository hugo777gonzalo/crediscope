-- 145 · «Consulta incompleta» y «Revisión manual» en la bandeja, y los análisis
--       hechos sobre una consulta incompleta, marcados
--
-- Sesión 3 de docs/propuesta-fuentes-obligatorias.md (paso 6; decisiones 9 y 13
-- del negocio, 2026-10-31).
--
-- 1. Una persona cuya última consulta no trajo una de las 21 fuentes obligatorias
--    figuraba «Sin analizar», que es trabajo pendiente de un analista. No lo es:
--    el modelo no corre hasta reconsultarla (PR 117). Pasa a `consulta_incompleta`,
--    y a `revision_manual` cuando la falla no se va (decisión 4: sin score, a una
--    persona). 'consulta_fallida' sigue siendo cero fuentes.
-- 2. Un análisis hecho sobre una consulta que hoy se juzgaría incompleta (1 sobre
--    una consulta rota y 11 con un «no hay» falso, sección 8 de la propuesta) se
--    marca en `analisis_sobre_consulta_incompleta`. No se borra ni se reanaliza, y
--    no se escribe en `analysis_results`: la marca se calcula del perfil con que se
--    hizo el análisis (`client_profile_id`), que no cambia. Los de antes del
--    2026-09-17 no tienen detalle por fuente y no se pueden juzgar: no se marcan.
-- 3. `analisis_parcial`: faltó una obligatoria o una secundaria de peso con error.
--    La entrega «aprobar» no pasa de «revisar» (completitudDeLaConsulta). El
--    análisis guardado no se toca; lo que se muestra, sí. Hasta acá la bandeja, el
--    Expediente y el Historial mostraban la recomendación guardada sin la regla.
--
-- Las listas de abajo son la copia en SQL de `FUENTES` en
-- `_shared/calidad-de-la-consulta.ts`: si cambia una, cambia la otra. Una prueba
-- de Deno lee esta migración y las compara.
--
-- Escribe poco (la base está en 477 de 500 MB): tres columnas booleanas y el
-- refresco de las personas con perfil (no las 15.000 sin consulta).

create or replace function fuentes_obligatorias_sin_respuesta(p_estado jsonb)
returns text[]
language sql
immutable
as $$
  -- Sin detalle por fuente no hay nada que juzgar (perfiles anteriores al 2026-09-17).
  select case
    when p_estado is null or p_estado = '{}'::jsonb then '{}'::text[]
    else coalesce((
      select array_agg(f order by f)
        from unnest(array[
          'general', 'listaNegra', 'demandas', 'listasControl', 'denuncias', 'antecedentesPenales',
          'basesInternas', 'contribuyente', 'jubilados', 'afiliacionIssfacCertMedico', 'afiliacionSiisspol',
          'sriImpuestoRenta', 'establecimientoActEconomica', 'empleados',
          'buroCreditoSuper', 'creditoQuirografario', 'creditoHipotecario', 'buroCreditoCoop',
          'buroCreditoDiners', 'retails', 'pensionAlimenticiaProveedorInfo1'
        ]) f
       where not (
         coalesce(p_estado ->> f, '') in ('ok', 'ok_vacio', 'deshabilitado')
         -- Renta y antecedentes fallan siempre en las mismas personas: su «no hay» es faltante.
         or (p_estado ->> f = 'faltante' and f in ('antecedentesPenales', 'sriImpuestoRenta'))
       )
    ), '{}'::text[])
  end;
$$;

create or replace function fuentes_de_peso_con_error(p_estado jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce((
    select array_agg(f order by f)
      from unnest(array[
        'trabajoHistoricosMecanizado', 'trabajoHistoricos', 'vehiculos', 'demandasOfendido',
        'inversiones', 'cumplimientoPatronal', 'impedimentoCargosPublicos', 'bienesInmueble'
      ]) f
     where p_estado ->> f = 'error'
  ), '{}'::text[]);
$$;

-- Las obligatorias cuya falla no se va: siguen en `faltante` y ya estaban así un
-- día antes sin haber contestado en el medio (`obligatoriasQueNoSeVan`). Las diez
-- últimas consultas, de la más nueva a la más vieja, como `requiereRevisionManual`.
create or replace function fuentes_que_no_se_van(p_client uuid)
returns text[]
language plpgsql
stable
as $$
declare
  v_ultima_en timestamptz;
  v_ultima    jsonb;
  v_anteriores timestamptz[];
  v_estados    jsonb[];
  v_fuente text;
  v_e      text;
  i        integer;
  v_salen  text[] := '{}';
begin
  select created_at, estado_por_fuente into v_ultima_en, v_ultima
    from client_profiles where client_id = p_client order by created_at desc limit 1;
  if not found then
    return v_salen;
  end if;
  select array_agg(created_at order by created_at desc), array_agg(estado_por_fuente order by created_at desc)
    into v_anteriores, v_estados
    from (select created_at, estado_por_fuente from client_profiles
           where client_id = p_client order by created_at desc offset 1 limit 9) t;
  foreach v_fuente in array fuentes_obligatorias_sin_respuesta(v_ultima) loop
    if v_ultima ->> v_fuente is distinct from 'faltante' then
      continue;
    end if;
    for i in 1 .. coalesce(cardinality(v_anteriores), 0) loop
      v_e := v_estados[i] ->> v_fuente;
      if v_e in ('ok', 'ok_vacio') then
        exit;
      end if;
      if v_e = 'faltante' and v_ultima_en - v_anteriores[i] >= interval '1 day' then
        v_salen := v_salen || v_fuente;
        exit;
      end if;
    end loop;
  end loop;
  return v_salen;
end;
$$;

revoke all on function fuentes_que_no_se_van(uuid) from public, anon;


-- ---------- resumen_por_persona ----------
alter table resumen_por_persona
  add column analisis_parcial boolean not null default false,
  add column analisis_sobre_consulta_incompleta boolean not null default false;

comment on column resumen_por_persona.analisis_parcial is
  'El último análisis se hizo con una consulta a la que le faltaba una obligatoria o tenía una secundaria de peso con error (145): "aprobar" se entrega como "revisar".';
comment on column resumen_por_persona.analisis_sobre_consulta_incompleta is
  'El último análisis se hizo con una consulta a la que le faltaba una obligatoria (145, decisión 9 de la propuesta de fuentes obligatorias): hay que reconsultar y, si cambió el dato, reanalizar. No se borra.';

-- La de la 132 tomada de la base viva, con el estado nuevo y las dos marcas.
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
    analisis_sobre_consulta_incompleta
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
    coalesce(ap.marca, false)
  from clients c
  left join lateral (
    -- `|| '{}'` deja el perfil descomprimido en memoria una sola vez: cada
    -- `->` sobre la columna lo descomprimiría de nuevo.
    select cp.id, cp.created_at, cp.origen, cp.lote_id, cp.structure_version,
           cp.ejes_ok, cp.fuentes_ok, cp.fuente_segmento, cp.fuente_piso_ingreso,
           cp.fuente_estado, cp.fuente_corte, cp.control_bloqueo, cp.estado_por_fuente,
           cp.indicios_ingreso, cp.perfil_laboral,
           cp.standard_profile || '{}'::jsonb as sp
      from client_profiles cp
     where cp.client_id = c.id
     order by cp.created_at desc
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

-- ---------- La bandeja ----------
-- Las columnas nuevas van al final (regla 5) y la vista conserva su opción:
-- sin security_invoker volvería a leer como su dueño y saltearía la RLS.
create or replace view bandeja_solicitudes
with (security_invoker = true)
as
select client_id, cedula, ingreso_at, nombre, edad, provincia, perfil_id,
       perfil_at, perfil_origen, lote_id, structure_version, fuente_segmento,
       fuente_piso_ingreso, fuente_estado, fuente_corte, empleos_vigentes,
       consultas, analisis_id, analisis_at, score, recomendacion,
       indicador_riesgo, indicador_historial, rules_version, fallo_tipo,
       veredicto_origen, ultima_actividad, estado, hallazgos_control,
       tiene_bloqueante, ejes_ok, consulta_util, fuentes_ok, indicios_ingreso,
       es_sintetico,
       analisis_parcial, analisis_sobre_consulta_incompleta
  from resumen_por_persona;

-- La franja suma los dos estados nuevos. Cambia la forma de la salida: hay que
-- borrarla y crearla, y volver a dar el permiso (la pantalla, con su sesión).
drop function bandeja_conteos(timestamptz, timestamptz, text, text, text, text, text);

create function bandeja_conteos(
  p_desde         timestamptz default null,
  p_hasta         timestamptz default null,
  p_busqueda      text        default null,
  p_recomendacion text        default null,
  p_segmento      text        default null,
  p_estado        text        default null,
  p_origen        text        default null
)
returns table (
  total               bigint,
  aprobar             bigint,
  observar            bigint,
  revisar             bigint,
  negar               bigint,
  sin_analisis        bigint,
  no_completado       bigint,
  consulta_fallida    bigint,
  con_bloqueo         bigint,
  piso_mediana        numeric,
  consulta_incompleta bigint,
  revision_manual     bigint
)
language sql
stable
as $$
  select
    count(*)                                                   as total,
    count(*) filter (where b.recomendacion = 'aprobar')        as aprobar,
    count(*) filter (where b.recomendacion = 'observar')       as observar,
    count(*) filter (where b.recomendacion = 'revisar')        as revisar,
    count(*) filter (where b.recomendacion = 'negar')          as negar,
    count(*) filter (where b.estado = 'sin_analisis')          as sin_analisis,
    count(*) filter (where b.estado = 'no_completado')         as no_completado,
    count(*) filter (where b.estado = 'consulta_fallida')      as consulta_fallida,
    count(*) filter (where b.tiene_bloqueante)                 as con_bloqueo,
    percentile_cont(0.5) within group (order by b.fuente_piso_ingreso)
      filter (where b.fuente_piso_ingreso is not null)         as piso_mediana,
    count(*) filter (where b.estado = 'consulta_incompleta')   as consulta_incompleta,
    count(*) filter (where b.estado = 'revision_manual')       as revision_manual
  from bandeja_solicitudes b
  where not b.es_sintetico
    and (p_desde is null or b.ultima_actividad >= p_desde)
    and (p_hasta is null or b.ultima_actividad <= p_hasta)
    and (p_recomendacion is null or b.recomendacion = p_recomendacion)
    and (p_segmento is null or b.fuente_segmento = p_segmento)
    and (p_estado is null or b.estado = p_estado)
    and (p_origen is null or b.perfil_origen = p_origen)
    and (
      p_busqueda is null
      or (p_busqueda ~ '^\d+$' and b.cedula like p_busqueda || '%')
      or (p_busqueda !~ '^\d+$' and b.nombre ilike '%' || p_busqueda || '%')
    );
$$;

revoke all on function bandeja_conteos(timestamptz, timestamptz, text, text, text, text, text) from public, anon;
grant execute on function bandeja_conteos(timestamptz, timestamptz, text, text, text, text, text) to authenticated, service_role;

comment on function bandeja_conteos is
  'Los totales de la franja de la bandeja: los mismos filtros que la lista (getBandejaSolicitudes) y sin las personas sintéticas (118, 120). Con consulta incompleta y revisión manual (145).';


-- ---------- Al día ----------
-- Sólo las personas con perfil: las otras (sin consulta) no cambian.
select refrescar_resumen_por_persona(coalesce(array_agg(client_id), '{}'::uuid[]))
  from resumen_por_persona
 where perfil_id is not null;

-- La franja tiene que sumar lo mismo que la lista, y los dos estados nuevos
-- tienen que salir de personas sin análisis. Si no, el corredor revierte todo.
do $$
declare
  v_franja bigint;
  v_lista  bigint;
  v_mal    bigint;
begin
  select total into v_franja from bandeja_conteos();
  select count(*) into v_lista from bandeja_solicitudes where not es_sintetico;
  if v_franja <> v_lista then
    raise exception 'La franja cuenta % y la lista %: tienen que coincidir', v_franja, v_lista;
  end if;
  select count(*) into v_mal from resumen_por_persona
   where estado in ('consulta_incompleta', 'revision_manual') and analisis_id is not null;
  if v_mal > 0 then
    raise exception '% personas con análisis figuran con consulta incompleta', v_mal;
  end if;
  if not (select coalesce(reloptions, '{}') @> array['security_invoker=true'] from pg_class where oid = 'bandeja_solicitudes'::regclass) then
    raise exception 'bandeja_solicitudes perdió security_invoker';
  end if;
end;
$$;
