-- ============================================================
-- Perfil laboral: dependiente, independiente o las dos cosas.
--
-- El segmento responde de qué fuente depende el ingreso que se puede
-- MEDIR, y sólo la dependencia trae monto. Medido el 2026-09-25 sobre el
-- último perfil de 2.585 clientes con datos: 675 (26%) trabajan en
-- relación de dependencia y ADEMÁS tienen actividad propia con RUC activo
-- -- más de la mitad de los dependientes --, y el segmento los mostraba
-- sólo como "dependiente privado" o "sector público". El perfil laboral
-- mira las dos preguntas por separado (¿trabaja para un tercero? ¿tiene
-- actividad propia?) y acompaña al segmento, no lo reemplaza.
--
-- Lo calcula clasificarPerfilLaboral() en _shared/perfil-laboral.ts, desde
-- el perfil estandarizado guardado. Esta columna es sólo para contar en
-- el panorama: la escriben las Edge Functions al guardar un perfil nuevo,
-- y scripts/calcular-perfil-laboral.mjs la completa en los existentes con
-- la misma función. NO está dentro de standard_profile a propósito: el
-- modelo no la lee (decisión del negocio: primero en pantalla).
--
-- En el negocio se dice "dependiente", no "asalariado".
-- ============================================================

alter table client_profiles add column if not exists perfil_laboral text;

comment on column client_profiles.perfil_laboral is
  'Perfil laboral (perfil-laboral.ts): dependiente, dependiente_con_actividad_propia, independiente, independiente_con_empleados, afiliado_voluntario, jubilado, sin_actividad_registrada, sin_datos. Se calcula desde standard_profile; no lo lee el modelo. Ver migración 085.';

-- El panorama suma el perfil laboral (misma función que la 083, con dos
-- claves nuevas: perfilesLaborales y dependientesConActividadPorSegmento).
-- El panorama usa la misma función: hasta acá repetía la regla vieja.
create or replace function resumen_fuentes_ingreso()
returns jsonb
language sql
stable
as $$
with ultimo as (
  select distinct on (p.client_id)
    p.id, p.client_id, p.created_at, p.fuente_segmento, p.fuente_estado, p.fuente_piso_ingreso, p.fuente_corte, p.perfil_laboral,
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
  -- Perfil laboral (migración 085): cuántos son dependientes, independientes,
  -- las dos cosas a la vez, etc. Los perfiles sin la columna calculada
  -- cuentan aparte, para que el hueco se vea.
  'perfilesLaborales', coalesce((
    select jsonb_agg(jsonb_build_object('clave', coalesce(perfil_laboral, 'sin_calcular'), 'n', n, 'pct', round(100 * n / nullif((select n from total), 0))) order by n desc)
    from (select perfil_laboral, count(*) as n from clasificado group by 1) x
  ), '[]'),
  -- El cruce que motivó el perfil: de qué segmento son los que, además de
  -- trabajar para un tercero, tienen actividad propia.
  'dependientesConActividadPorSegmento', coalesce((
    select jsonb_agg(jsonb_build_object('clave', fuente_segmento, 'n', n) order by n desc)
    from (select fuente_segmento, count(*) as n from clasificado where perfil_laboral = 'dependiente_con_actividad_propia' group by 1) x
  ), '[]'),
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
