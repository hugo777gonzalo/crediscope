-- 120 · La franja de la bandeja, sin las personas sintéticas
--
-- La 118 marcó a las 240 personas sintéticas de Aval (clients.es_sintetico)
-- y las sacó de los totales que leen clients y client_profiles. La vista
-- bandeja_solicitudes las conserva con la marca: la pantalla las filtra al
-- listar y el expediente las abre por cédula. bandeja_conteos, la franja de
-- totales de la bandeja, lee esa vista y quedó afuera. El 2026-10-10 la
-- franja decía 2.812 personas con la lista en 2.572, y la mediana del
-- ingreso también las contaba. Lo vio la revisión de UX, no la 118: se
-- buscaron los lectores de las tablas y no los de la vista.
--
-- Es la definición viva (la de la 065, sin cambios desde entonces) con una
-- condición más. Mismos parámetros y misma salida, así que create or replace
-- conserva los permisos (authenticated y service_role; anon no, 113).
--
-- Los demás lectores de la cartera sin el filtro se revisaron ese día en la
-- base viva y no las cuentan: las lab_* leen cargas y cortes explícitos
-- (ninguna sintética en lab_solicitudes), suprimir_titular va por persona y
-- corte_iess_vigente() no recibe ningún perfil sintético.

create or replace function bandeja_conteos(
  p_desde         timestamptz default null,
  p_hasta         timestamptz default null,
  p_busqueda      text        default null,
  p_recomendacion text        default null,
  p_segmento      text        default null,
  p_estado        text        default null,
  p_origen        text        default null
)
returns table (
  total             bigint,
  aprobar           bigint,
  observar          bigint,
  revisar           bigint,
  negar             bigint,
  sin_analisis      bigint,
  no_completado     bigint,
  consulta_fallida  bigint,
  con_bloqueo       bigint,
  piso_mediana      numeric
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
      filter (where b.fuente_piso_ingreso is not null)         as piso_mediana
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

-- La 065 la borró y la volvió a crear, y el comentario de la 063 se perdió.
comment on function bandeja_conteos is
  'Los totales de la franja de la bandeja: los mismos filtros que la lista (getBandejaSolicitudes) y sin las personas sintéticas (118, 120).';

-- La franja tiene que sumar lo mismo que la lista. Si no, el corredor
-- revierte la migración entera: la aplica en una transacción.
do $$
declare
  v_franja bigint;
  v_lista  bigint;
begin
  select total into v_franja from bandeja_conteos();
  select count(*) into v_lista from bandeja_solicitudes where not es_sintetico;
  if v_franja <> v_lista then
    raise exception 'La franja cuenta % y la lista %: tienen que coincidir', v_franja, v_lista;
  end if;
end;
$$;
