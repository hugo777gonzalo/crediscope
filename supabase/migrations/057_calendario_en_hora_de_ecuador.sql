-- El calendario del sistema pasa a ser el de Ecuador continental.
--
-- LO QUE NO CAMBIA
--
-- Los instantes guardados. Cada created_at es un timestamptz, o sea un
-- momento absoluto: no está "en UTC" ni "en Ecuador", simplemente
-- ocurrió. No hay ningún dato que corregir y nada que migrar.
--
-- LO QUE SÍ CAMBIA
--
-- Cuándo empieza y termina un día, un mes. Eso no es absoluto: depende
-- de dónde se opere. El sistema los venía sacando en UTC, que adelanta
-- cinco horas, y eso corría todo lo que pasara entre las 19:00 y la
-- medianoche al día siguiente. Una consulta de las 20:00 del lunes
-- contaba como del martes.
--
-- Con decenas de consultas apenas se notaba. Con miles, y con el
-- horario de oficina de Ecuador terminando justo alrededor de las
-- 19:00, deja de ser un detalle: el cierre del día y el corte del mes
-- son exactamente las horas donde se acumula el trabajo.

-- Una sola definición de "qué día fue esto acá". Marcada stable y no
-- immutable a propósito: la conversión depende de la base de husos
-- horarios, que se actualiza con el sistema. Declararla immutable
-- permitiría indexarla y dejaría índices mintiendo si esa base cambia.
create or replace function fecha_ec(t timestamptz)
returns date
language sql
stable
as $$
  select (t at time zone 'America/Guayaquil')::date;
$$;

comment on function fecha_ec(timestamptz) is
  'El día calendario en Ecuador continental de un instante dado. Usar SIEMPRE esto en vez de ::date, que resuelve en la zona de la sesión (UTC).';

-- ---------- COSTOS ----------
-- La tarifa vigente se resuelve por fecha. Con ::date, una llamada de
-- las 20:00 del último día de vigencia de un precio se valuaba con el
-- precio del día siguiente.
-- gasto_del_mes se apoya en llm_costos, así que cae con ella y se
-- vuelve a crear más abajo. El orden importa: primero el costo de cada
-- llamada, después lo acumulado del mes.
drop view if exists gasto_del_mes;
drop view if exists llm_costos;
create view llm_costos as
select
  l.*,
  p.usd_entrada, p.usd_salida, p.usd_cache_escritura, p.usd_cache_lectura,
  (p.modelo is null and l.origen_medicion <> 'sin_datos') as precio_faltante,
  case when l.origen_medicion = 'sin_datos' then null else
    round(
      (l.tokens_entrada * coalesce(p.usd_entrada, 0)
       + l.tokens_salida * coalesce(p.usd_salida, 0)
       + l.tokens_cache_escritura * coalesce(p.usd_cache_escritura, 0)
       + l.tokens_cache_lectura * coalesce(p.usd_cache_lectura, 0)
      ) / 1000000.0, 6)
  end as costo_usd,
  case
    when l.funcion = 'analyze-client' and l.es_prueba then 'prueba'
    when l.funcion = 'analyze-client' then 'consulta'
    else 'calibracion'
  end as naturaleza,
  -- El día al que pertenece la llamada, ya resuelto. Que cada pantalla
  -- lo deduzca por su cuenta es cómo aparecieron cortes distintos en
  -- lugares distintos.
  fecha_ec(l.created_at) as dia_ec
from llm_llamadas l
left join lateral (
  select * from llm_precios pr
   where pr.modelo = l.modelo
     and pr.vigente_desde <= fecha_ec(l.created_at)
   order by pr.vigente_desde desc
   limit 1
) p on true;

alter view llm_costos set (security_invoker = on);

comment on view llm_costos is
  'Cada llamada al LLM con su costo. costo_usd null = no se puede calcular (ver origen_medicion). dia_ec es el día en Ecuador, que es con el que hay que agrupar.';

-- ---------- PRESUPUESTO ----------
-- El mes también empieza cuando empieza acá. Con el corte en UTC, el
-- gasto de las últimas cinco horas del último día del mes caía en el
-- mes siguiente: justo el momento en que un aviso de presupuesto
-- todavía sirve para algo.
drop view if exists gasto_del_mes;
create view gasto_del_mes as
select
  to_char(now() at time zone 'America/Guayaquil', 'YYYY-MM') as mes,
  coalesce(sum(costo_usd), 0)::numeric(12, 6) as gastado_usd,
  count(*) filter (where costo_usd is null) as llamadas_sin_medir,
  count(*) as llamadas
from llm_costos
where created_at >= (
  date_trunc('month', now() at time zone 'America/Guayaquil') at time zone 'America/Guayaquil'
);

alter view gasto_del_mes set (security_invoker = on);

comment on view gasto_del_mes is
  'Consumo registrado del mes corriente en Ecuador. NO es la factura del proveedor: no incluye lo que no se pudo medir ni impuestos o descuentos.';
