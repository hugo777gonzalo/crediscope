-- 121 · El corte del IESS sin abrir el perfil entero, y el centro de datos
-- dentro del límite de la base
--
-- La pestaña Laboratorio › Datos y cartera › Centro de datos dejó de abrir
-- ("El servidor tardó demasiado en contestar"): el rol de la pantalla corta
-- a los 8 s. Medido el 2026-10-12, con 8.590 perfiles:
-- - lab_centro_de_datos(120) tardaba 4,1 s en la base. Desde la pantalla, la
--   de 60 días tardó 6,4 s y una vez se pasó del límite.
-- - 3,5 s de esos eran corte_iess_vigente(). Para cada perfil de los últimos
--   90 días lee standard_profile->'fuentesIngreso', y eso descomprime el
--   perfil entero. La misma función la llaman structure-client,
--   analyze-client y procesar-lote antes de cada consulta y cada análisis:
--   eran 3,5 s de los 150 que tiene una consulta (E5), y crecían con cada
--   perfil guardado.
-- - El resto era el resumen por semana. Postgres lo recalculaba sobre los
--   275.288 pares (perfil, fuente) una vez por fuente: 52 veces.
--
-- 1. Un índice parcial con lo que corte_iess_vigente() necesita. La
--    condición sobre el perfil queda en el índice y la consulta no abre
--    standard_profile. Ensayado sobre una copia: de 563 ms a 191 ms.
-- 2. por_semana se calcula una sola vez (materialized). Ensayado: de 2,5 s a
--    1,1 s para 120 días, sin contar el corte.
--
-- corte_iess_vigente() no cambia: el índice repite su condición tal cual, y
-- eso es lo que deja al planificador usarlo. Si cambia la condición de la
-- función, cambia también la del índice.
--
-- El índice se construye dentro de la transacción del corredor: bloquea las
-- escrituras en client_profiles los segundos que tarda en leer los perfiles.
-- create index concurrently no puede ir dentro de una transacción.

create index if not exists client_profiles_corte_iess
  on client_profiles (created_at, fuente_corte, client_id)
  where (standard_profile->'fuentesIngreso'->>'apareceEnUltimoCorte') = 'true';

-- La definición viva (la de la 118) con por_semana materializada: usada una
-- sola vez dentro de la subconsulta de cada fuente, Postgres la metía adentro
-- y la recalculaba para cada una.
create or replace function lab_centro_de_datos(p_dias integer default 120)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with perfiles as (
    select created_at, estado_por_fuente from client_profiles cp
     where created_at >= now() - make_interval(days => p_dias) and estado_por_fuente is not null
       and not exists (select 1 from clients c where c.id = cp.client_id and c.es_sintetico)
  ), pares as (
    select date_trunc('week', p.created_at at time zone 'America/Guayaquil')::date as semana, e.key as fuente, e.value #>> '{}' as estado, p.created_at
      from perfiles p cross join lateral jsonb_each(p.estado_por_fuente) e
  ), por_fuente as (
    select fuente, count(*) as consultas,
           count(*) filter (where estado = 'ok') as con_datos,
           count(*) filter (where estado = 'ok_vacio') as vacias,
           count(*) filter (where estado = 'error') as errores,
           count(*) filter (where estado not in ('ok', 'ok_vacio', 'error')) as otras,
           count(*) filter (where created_at >= now() - interval '7 days') as recientes,
           count(*) filter (where created_at >= now() - interval '7 days' and estado in ('ok', 'ok_vacio')) as recientes_contestaron,
           count(*) filter (where created_at < now() - interval '7 days' and created_at >= now() - interval '37 days') as antes,
           count(*) filter (where created_at < now() - interval '7 days' and created_at >= now() - interval '37 days' and estado in ('ok', 'ok_vacio')) as antes_contestaron,
           max(created_at) as ultima
      from pares group by fuente
  ), por_semana as materialized (
    select fuente, semana, count(*) as n, count(*) filter (where estado in ('ok', 'ok_vacio')) as contestaron, count(*) filter (where estado = 'ok') as con_datos
      from pares group by fuente, semana
  )
  select jsonb_build_object(
    'dias', p_dias,
    'perfiles', (select count(*) from perfiles),
    'corte_iess', corte_iess_vigente(),
    'fuentes', coalesce((select jsonb_agg(jsonb_build_object(
        'fuente', f.fuente, 'consultas', f.consultas, 'con_datos', f.con_datos, 'vacias', f.vacias, 'errores', f.errores, 'otras', f.otras, 'ultima', f.ultima,
        'contesto_ultima_semana', case when f.recientes > 0 then round(f.recientes_contestaron::numeric / f.recientes, 4) end,
        'contesto_mes_anterior', case when f.antes > 0 then round(f.antes_contestaron::numeric / f.antes, 4) end,
        'consultas_ultima_semana', f.recientes,
        'semanas', (select jsonb_agg(jsonb_build_object('semana', s.semana, 'n', s.n, 'contestaron', s.contestaron, 'con_datos', s.con_datos) order by s.semana) from por_semana s where s.fuente = f.fuente))
        order by f.fuente) from por_fuente f), '[]'::jsonb)
  );
$$;
