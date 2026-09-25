-- ============================================================
-- El corte del IESS deja de moverse por dos clientes.
--
-- QUÉ PASABA
--
-- loadCorteIess (runtime-config.ts) tomaba como corte vigente el mes MÁS
-- ALTO visto en los perfiles de los últimos 90 días. El 2026-09-23 dos
-- dependientes llegaron con un aporte de agosto, y el corte pasó a 2026-08
-- para todas las consultas siguientes. Pero el corte que tiene Novadata es
-- 2026-07 (confirmado por el negocio el 2026-09-25): Novadata actualiza el
-- IESS más o menos cada dos meses, y el próximo corte (2026-09) recién se
-- espera en octubre.
--
-- Con el corte en 2026-08, un asalariado cuyo último aporte es julio --o
-- sea, cualquiera-- queda "fuera del último corte": pierde su aporte
-- vigente y la clasificación puede mandarlo a "informal o sin actividad".
-- Es la misma familia de error que el 2026-09-15 convirtió una caída en un
-- juicio sobre 373 personas. Medido al corregirlo: 248 perfiles se
-- clasificaron con 2026-08, casi todos sin aportes (222 son las cédulas
-- sintéticas del pool de Aval), y NINGUNO quedó marcado fuera del corte por
-- un mes. Se llegó antes del daño, no después.
--
-- LA REGLA NUEVA
--
-- Un mes es el corte vigente cuando al menos 20 clientes distintos
-- consultados en los últimos 90 días APARECEN en él (tienen un aporte en
-- ese mes). Cuando Novadata publica un corte nuevo, todos los asalariados
-- saltan de mes a la vez, así que el umbral se cruza en las primeras
-- consultas. Dos aportes adelantados no alcanzan. Mientras el mes nuevo no
-- junta 20, quien trae un aporte más reciente se clasifica igual con el
-- suyo (fuentes-ingreso.ts ya lo hace: si el cliente trae un mes posterior
-- al corte, usa el del cliente).
--
-- Vive en la base, en una sola función, porque la usan tres lados: las Edge
-- Functions para clasificar (loadCorteIess), la pestaña del cliente para
-- decir si su clasificación está al día, y el panorama de Parámetros.
-- ============================================================

create or replace function corte_iess_vigente()
returns text
language sql
stable
-- Invoker: hereda las políticas de client_profiles. Las Edge Functions la
-- llaman con la clave de servicio y el navegador como authenticated.
as $$
  select max(mes)
  from (
    select p.fuente_corte as mes
    from client_profiles p
    where p.created_at >= now() - interval '90 days'
      and p.fuente_corte ~ '^\d{4}-\d{2}$'
      -- Un mes futuro no puede ser un corte: sería un dato corrupto.
      and p.fuente_corte <= to_char(now() at time zone 'UTC', 'YYYY-MM')
      and p.standard_profile->'fuentesIngreso'->>'apareceEnUltimoCorte' = 'true'
    group by p.fuente_corte
    having count(distinct p.client_id) >= 20
  ) respaldados;
$$;

grant execute on function corte_iess_vigente() to authenticated, service_role;

comment on function corte_iess_vigente() is
  'Corte vigente del IESS: el mes más reciente en el que aparecen al menos 20 clientes distintos consultados en los últimos 90 días. Null si ninguno junta 20; quien la llama cae a su valor por defecto (CORTE_IESS_CONOCIDO). Ver migración 083.';

-- El panorama usa la misma función: hasta acá repetía la regla vieja.
create or replace function resumen_fuentes_ingreso()
returns jsonb
language sql
stable
as $$
with ultimo as (
  select distinct on (p.client_id)
    p.id, p.client_id, p.created_at, p.fuente_segmento, p.fuente_estado, p.fuente_piso_ingreso, p.fuente_corte,
    p.standard_profile->'fuentesIngreso' as f
  from client_profiles p
  order by p.client_id, p.created_at desc
),
clasificado as (
  select u.*, c.cedula from ultimo u left join clients c on c.id = u.client_id
  where u.fuente_segmento is not null
),
total as (select count(*)::numeric as n from clasificado),
nomina as (
  select c.id, (s->>'valor')::numeric as valor
  from clasificado c, jsonb_array_elements(coalesce(c.f->'senalesDeEscala', '[]')) s
  where s->>'senal' = 'nómina que paga'
),
respaldo as (
  select c.id, c.cedula, c.created_at, c.fuente_segmento, c.fuente_estado, c.f->>'motivoSegmento' as motivo, c.f->'paraConfirmar' as pedir
  from clasificado c
  where c.fuente_estado <> 'confirmada' and jsonb_array_length(coalesce(c.f->'paraConfirmar', '[]')) > 0
)
select jsonb_build_object(
  'total', (select n from total),
  'sinClasificar', (select count(*) from ultimo where fuente_segmento is null),
  'segmentos', coalesce((
    select jsonb_agg(jsonb_build_object('clave', fuente_segmento, 'n', n, 'pct', round(100 * n / nullif((select n from total), 0))) order by n desc)
    from (select fuente_segmento, count(*) as n from clasificado group by 1) x
  ), '[]'),
  'estados', coalesce((
    select jsonb_agg(jsonb_build_object('clave', fuente_estado, 'n', n, 'pct', round(100 * n / nullif((select n from total), 0))) order by n desc)
    from (select fuente_estado, count(*) as n from clasificado group by 1) x
  ), '[]'),
  'evidencias', coalesce((
    select jsonb_agg(jsonb_build_object('clave', clave, 'n', n) order by n desc)
    from (
      select e->>'evidencia' as clave, count(*) as n
      from clasificado c, jsonb_array_elements(coalesce(c.f->'fuentes', '[]')) e
      group by 1
    ) x
  ), '[]'),
  'conPiso', (select count(*) from clasificado where fuente_piso_ingreso > 0),
  'pisoPromedio', (select round(avg(fuente_piso_ingreso)) from clasificado where fuente_piso_ingreso > 0),
  'pisoTotal', (select round(coalesce(sum(fuente_piso_ingreso), 0)) from clasificado where fuente_piso_ingreso > 0),
  'desvinculados', (select count(*) from clasificado where f->>'apareceEnUltimoCorte' = 'false'),
  'corteDesactualizado', (select count(*) from clasificado where f->>'corteDesactualizado' = 'true'),
  'cortes', coalesce((
    select jsonb_agg(jsonb_build_array(fuente_corte, n) order by n desc)
    from (select fuente_corte, count(*) as n from clasificado where fuente_corte is not null group by 1) x
  ), '[]'),
  'corteVigente', corte_iess_vigente(),
  'nominaTotal', (select round(coalesce(sum(valor), 0)) from nomina where valor > 0),
  'conNomina', (select count(*) from nomina where valor > 0),
  'obligadosContabilidad', (
    select count(*) from clasificado c
    where exists (select 1 from jsonb_array_elements(coalesce(c.f->'senalesDeEscala', '[]')) s where s->>'senal' = 'obligado a llevar contabilidad')
  ),
  'requierenRespaldoTotal', (select count(*) from respaldo),
  'requierenRespaldo', coalesce((
    select jsonb_agg(jsonb_build_object(
      'perfilId', id, 'cedula', cedula, 'segmento', fuente_segmento, 'estado', fuente_estado, 'motivo', motivo, 'pedir', pedir
    ) order by created_at desc)
    from (select * from respaldo order by created_at desc limit 50) x
  ), '[]')
);
$$;
