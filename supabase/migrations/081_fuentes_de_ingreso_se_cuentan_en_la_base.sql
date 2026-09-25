-- ============================================================
-- Fuentes de ingreso: el panorama deja de contar un tercio de la
-- cartera, y se corrige un motivo que afirmaba un aporte inexistente.
--
-- 1. EL PANORAMA CONTABA 1.000 PERFILES DE 3.303
--
-- getResumenFuentesIngreso pedía `limit(5000)`, pero PostgREST corta en
-- 1.000 filas y no avisa (medido el 2026-09-24: content-range 0-999/3303).
-- El panorama, Parámetros y el filtro de Clientes por segmento contaban
-- sobre ~840 clientes de 2.807: decía 290 dependientes privados donde hay
-- 950, y los 3 "jubilado con ingreso adicional" no aparecían. Mismo
-- remedio que la 070: se cuenta en la base y al navegador llega el
-- resultado.
--
-- 2. EL MOTIVO FALSO DE 466 PERFILES
--
-- Hasta fuentes-v3, alguien SIN ningún aporte al IESS pero con RUC activo
-- o nómina caía en la rama "vínculo vigente sin monto", con el motivo
-- "Vínculo vigente al corte..., pero la fuente no trae el monto del
-- aporte". El segmento (independiente) estaba bien; la explicación
-- afirmaba un aporte que no existe. 466 perfiles, 455 de ellos el último
-- de su cliente.
--
-- Decisión del negocio (2026-09-24): corregir el texto guardado. No es un
-- cambio de regla -- el segmento no se toca --, es una frase que era
-- falsa. El texto nuevo es el que escribe fuentes-v4 (motivoSinAportes en
-- fuentes-ingreso.ts) y el anterior queda en fuentesIngreso.correccion.
-- Se deduce de lo que el perfil ya guarda: la fuente "actividad económica
-- propia" es el RUC activo, "actividad empresarial propia" es la nómina, y
-- el monto de la nómina está en senalesDeEscala.
-- ============================================================

with objetivo as (
  select
    p.id,
    p.standard_profile->'fuentesIngreso'->>'motivoSegmento' as anterior,
    exists (
      select 1 from jsonb_array_elements(p.standard_profile->'fuentesIngreso'->'fuentes') x
      where x->>'tipo' = 'actividad económica propia'
    ) as ruc,
    exists (
      select 1 from jsonb_array_elements(p.standard_profile->'fuentesIngreso'->'fuentes') x
      where x->>'tipo' = 'actividad empresarial propia'
    ) as paga_nomina,
    (
      select s->>'valor' from jsonb_array_elements(p.standard_profile->'fuentesIngreso'->'senalesDeEscala') s
      where s->>'senal' = 'nómina que paga' limit 1
    ) as nomina
  from client_profiles p
  where p.standard_profile->'fuentesIngreso'->>'motivoSegmento' like 'Vínculo vigente al corte%'
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p.standard_profile->'fuentesIngreso'->'fuentes', '[]')) x
      where x->>'evidencia' <> 'indirecta'
    )
),
texto as (
  select id, anterior,
    case
      when ruc and paga_nomina then 'Sin aportes vigentes, pero con RUC activo ante el SRI. Además paga una nómina de $' || nomina || ' mensuales.'
      when ruc then 'Sin aportes vigentes, pero con RUC activo ante el SRI.'
      when paga_nomina then 'Sin aportes vigentes ni RUC activo, pero paga una nómina de $' || nomina || ' mensuales.'
    end as nuevo
  from objetivo
)
update client_profiles p
set standard_profile = jsonb_set(
  jsonb_set(p.standard_profile, '{fuentesIngreso,motivoSegmento}', to_jsonb(t.nuevo)),
  '{fuentesIngreso,correccion}',
  jsonb_build_object(
    'migracion', '081',
    'fecha', '2026-09-24',
    'motivoAnterior', t.anterior,
    'porque', 'El motivo afirmaba un aporte vigente al IESS que no existe. El segmento no cambió.'
  )
)
from texto t
where p.id = t.id and t.nuevo is not null;

-- ------------------------------------------------------------
-- El resumen de la cartera, sobre el último perfil de cada cliente.
-- Devuelve la misma forma que `consolidar()` en
-- src/lib/fuentesIngresoConsolidado.js, para que las pantallas no cambien
-- de lectura.
-- ------------------------------------------------------------
create or replace function resumen_fuentes_ingreso()
returns jsonb
language sql
stable
-- Invoker, como metricas_gerenciales(): hereda las políticas de
-- client_profiles.
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
  -- Perfiles anteriores al módulo: sin clasificación.
  'sinClasificar', (select count(*) from ultimo where fuente_segmento is null),
  'segmentos', coalesce((
    select jsonb_agg(jsonb_build_object('clave', fuente_segmento, 'n', n, 'pct', round(100 * n / nullif((select n from total), 0))) order by n desc)
    from (select fuente_segmento, count(*) as n from clasificado group by 1) x
  ), '[]'),
  'estados', coalesce((
    select jsonb_agg(jsonb_build_object('clave', fuente_estado, 'n', n, 'pct', round(100 * n / nullif((select n from total), 0))) order by n desc)
    from (select fuente_estado, count(*) as n from clasificado group by 1) x
  ), '[]'),
  -- Cuenta fuentes, no personas: alguien con dos empleos aporta dos.
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
  -- El corte con que se clasifican las consultas nuevas: el mismo cálculo
  -- que loadCorteIess (runtime-config.ts) -- el mes más alto visto en los
  -- perfiles de los últimos 90 días, nunca posterior al mes en curso (en
  -- UTC, como allá). Si se cambia allá, se cambia acá. Lo que no replica
  -- es el piso CORTE_IESS_CONOCIDO del código: con datos de 2026-08 no
  -- hace diferencia, y si no hay perfiles recientes devuelve null en vez
  -- de inventar un corte.
  'corteVigente', (
    select max(fuente_corte) from client_profiles
    where created_at >= now() - interval '90 days'
      and fuente_corte ~ '^\d{4}-\d{2}$'
      and fuente_corte <= to_char(now() at time zone 'UTC', 'YYYY-MM')
  ),
  'nominaTotal', (select round(coalesce(sum(valor), 0)) from nomina where valor > 0),
  'conNomina', (select count(*) from nomina where valor > 0),
  'obligadosContabilidad', (
    select count(*) from clasificado c
    where exists (select 1 from jsonb_array_elements(coalesce(c.f->'senalesDeEscala', '[]')) s where s->>'senal' = 'obligado a llevar contabilidad')
  ),
  'requierenRespaldoTotal', (select count(*) from respaldo),
  -- Los 50 más recientes. La pantalla dice cuántos son en total y enlaza
  -- al listado: una lista que corta sin decirlo es la falla que esta
  -- migración viene a arreglar.
  'requierenRespaldo', coalesce((
    select jsonb_agg(jsonb_build_object(
      'perfilId', id, 'cedula', cedula, 'segmento', fuente_segmento, 'estado', fuente_estado, 'motivo', motivo, 'pedir', pedir
    ) order by created_at desc)
    from (select * from respaldo order by created_at desc limit 50) x
  ), '[]')
);
$$;

grant execute on function resumen_fuentes_ingreso() to authenticated;
