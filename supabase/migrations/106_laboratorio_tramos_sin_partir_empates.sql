-- Laboratorio: los tramos de Variables ya no parten los empates (2026-10-04).
--
-- lab_calcular_variables cortaba los cuartiles por posición (ntile): con
-- muchos empates, el mismo valor quedaba repartido en varios tramos según el
-- orden en que salían las filas. En el ciclo simulado, las 1.384 personas
-- con 24 meses de aporte quedaban en tres tramos "24"; con las 296
-- operaciones, esos tramos daban 11,7%, 1,7% y 1,7% de malos y el IV de la
-- variable subía a 0,459 sin ninguna señal (era el orden de las filas).
--
-- La regla nueva, la misma de cortesPorCuantiles() en src/lib/estadistica.js
-- (el IV del navegador y el de la base tienen que ser el mismo número):
--  1. Un valor con un cuarto o más de las personas es una "masa" y va en su
--     propio tramo.
--  2. Los valores entre masas forman segmentos; los tramos que quedan (4
--     menos las masas, al menos uno por segmento) se reparten entre los
--     segmentos según cuánta gente tiene cada uno.
--  3. Dentro de un segmento, un valor va al tramo
--     piso(personas antes de él en el segmento × tramos / personas del segmento).
-- Un valor nunca queda en dos tramos. El resto es igual a la 099 (el cero en
-- su tramo si es el 10% o más; 6 valores o menos, una categoría por valor).

create or replace function lab_calcular_variables(p_corte uuid, p_poblacion text default 'operaciones')
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_corte lab_cortes;
  v_b     bigint;
  v_m     bigint;
  v_res   jsonb;
begin
  select * into v_corte from lab_cortes where id = p_corte;
  if not found then raise exception 'No existe el corte'; end if;
  if p_poblacion not in ('operaciones', 'solicitudes') then raise exception 'La población es operaciones o solicitudes'; end if;
  select count(*) filter (where not malo), count(*) filter (where malo) into v_b, v_m
    from (select malo from lab_corte_operaciones
           where p_poblacion = 'operaciones' and corte_id = p_corte and incluida and primera_de_la_persona and variables is not null
          union all
          select malo from lab_corte_solicitudes
           where p_poblacion = 'solicitudes' and corte_id = p_corte and incluida and malo is not null and variables is not null) f;
  if v_b = 0 or v_m = 0 then raise exception 'El corte no tiene buenos y malos con perfil en esa población'; end if;

  with filas as (
    select malo, variables from lab_corte_operaciones
     where p_poblacion = 'operaciones' and corte_id = p_corte and incluida and primera_de_la_persona and variables is not null
    union all
    select malo, variables from lab_corte_solicitudes
     where p_poblacion = 'solicitudes' and corte_id = p_corte and incluida and malo is not null and variables is not null
  ), base as (
    select co.malo, cv.id as var, cv.tipo, co.variables -> cv.id as v
      from filas co cross join lab_catalogo_variables cv
     where cv.activa
  ), tipado as (
    select malo, var, tipo,
           case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end as num,
           case when v is null or jsonb_typeof(v) = 'null' then null else v #>> '{}' end as txt
      from base
  ), estad as (
    select var, count(distinct txt) as distintos,
           avg(case when num = 0 then 1.0 else 0 end) filter (where num is not null) as ceros
      from tipado group by var
  ), marcado as (
    select t.*, (t.tipo = 'numero' and e.distintos > 6 and t.num is not null
                 and not (t.num = 0 and coalesce(e.ceros, 0) >= 0.1)) as en_cuartiles,
           e.distintos, e.ceros
      from tipado t join estad e using (var)
  ), valores as (
    -- Los valores distintos de lo que va en cuartiles y cuántas personas tiene cada uno.
    select var, num, count(*) as c from marcado where en_cuartiles group by var, num
  ), masas as (
    select v.*, v.c >= sum(v.c) over (partition by v.var) / 4.0 as masa from valores v
  ), islas as (
    -- Los valores entre dos masas comparten el número de isla.
    select m.*, sum(case when m.masa then 1 else 0 end) over (partition by m.var order by m.num) as isla from masas m
  ), segmentos as (
    select var, isla, sum(c) as s_n from islas where not masa group by var, isla
  ), reparto as (
    select s.var, s.isla, s.s_n,
           greatest(1, round(greatest(count(*) over (partition by s.var),
                                      4 - (select count(*) from islas i2 where i2.var = s.var and i2.masa))
                             * s.s_n / sum(s.s_n) over (partition by s.var)))::int as b
      from segmentos s
  ), asignado as (
    select i.var, i.num,
           case when i.masa then 'm' || i.num::text
                else 's' || i.isla || '_' || least(r.b - 1, floor((sum(i.c) over (partition by i.var, i.isla, i.masa order by i.num) - i.c) * r.b / r.s_n::numeric))::int
           end as tramo
      from islas i left join reparto r on r.var = i.var and r.isla = i.isla and not i.masa
  ), conbin as (
    select m.*, case
        when m.txt is null then 'sin dato'
        when not m.en_cuartiles and (m.tipo <> 'numero' or m.distintos <= 6) then m.txt
        when not m.en_cuartiles then '0'
        else a.tramo end as bin
      from marcado m left join asignado a on a.var = m.var and a.num = m.num and m.en_cuartiles
  ), tramos as (
    select var, bin, count(*) as n, count(*) filter (where malo) as malos, min(num) as desde, max(num) as hasta
      from conbin group by var, bin
  ), k as (
    select var, count(*) as k from tramos group by var
  ), woe as (
    select t.*, ((t.n - t.malos) + 0.5) / (v_b + 0.5 * k.k) as pb, (t.malos + 0.5) / (v_m + 0.5 * k.k) as pm
      from tramos t join k using (var)
  ), porvar as (
    select var,
           sum((pb - pm) * ln(pb / pm)) as iv,
           sum(n) filter (where bin <> 'sin dato') as con_dato,
           sum(n) as total,
           jsonb_agg(jsonb_build_object(
             'tramo', case when bin like 's%' or bin like 'm%' then case when desde = hasta then desde::text else desde::text || ' a ' || hasta::text end else bin end,
             'n', n, 'malos', malos, 'tasa', round(malos::numeric / n, 4), 'woe', round(ln(pb / pm), 4))
             order by (bin = 'sin dato'), desde nulls first, bin) as tramos
      from woe group by var
  )
  select jsonb_agg(jsonb_build_object(
      'variable', cv.id, 'nombre', cv.nombre, 'grupo', cv.grupo, 'uso', cv.uso,
      'llega_al_modelo', cv.en_perfil_del_modelo and not exists (
          select 1 from standard_profile_field_config f where f.enabled = false and f.grupo = cv.ruta[1] and f.campo = cv.ruta[2]),
      'cobertura', round(p.con_dato::numeric / nullif(p.total, 0), 4),
      'iv', round(p.iv, 4),
      'fuerza', case when p.iv < 0.02 then 'nada' when p.iv < 0.1 then 'débil' when p.iv < 0.3 then 'media' else 'fuerte' end,
      'sospecha_de_fuga', p.iv > 0.5,
      'tramos', p.tramos)
      order by p.iv desc nulls last)
    into v_res
    from porvar p join lab_catalogo_variables cv on cv.id = p.var;

  v_res := jsonb_build_object(
    'es_sintetico', v_corte.es_sintetico, 'poblacion', p_poblacion, 'personas', v_b + v_m, 'buenos', v_b, 'malos', v_m,
    'advertencias', to_jsonb(array_remove(array[
        case when v_m < 100 then 'Menos de 100 malos: el IV por variable es ruido; sirve para orientar, no para proponer.' end,
        case when p_poblacion = 'solicitudes' then 'Incluye a quienes no recibieron el crédito: su resultado sale del buró (un crédito de otro o uno que ya tenían), no del archivo.' end,
        case when v_corte.es_sintetico then 'Corte sintético: tiene que encontrar las variables de la regla plantada.' end
      ], null)),
    'variables', v_res);

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'variables',
          jsonb_build_object('version', 3, 'poblacion', p_poblacion,
                             'iv', 'WoE con suavizado 0,5; cuartiles sobre valores distintos (un empate nunca se parte; un valor con un cuarto o más de las personas va en su propio tramo); tramo propio para el cero si es 10% o más; una persona una vez',
                             'umbrales', jsonb_build_object('nada', 0.02, 'debil', 0.1, 'media', 0.3, 'sospecha_de_fuga', 0.5)),
          v_res, (v_b + v_m)::integer, v_m::integer, auth.uid());
  return v_res;
end;
$$;
