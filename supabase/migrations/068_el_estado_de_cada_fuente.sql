-- ============================================================
-- Paso 2 de la reorganización: guardar el estado de cada fuente,
-- en paralelo a block_status.
--
-- POR QUÉ NO ALCANZA CON LOS NUEVE BLOQUES
--
-- `aggregateStatus` marca un bloque como "ok" si contestó AL MENOS UNA
-- de sus fuentes. El bloque `bancos` tiene catorce. O sea que
-- block_status puede decir "ok" con trece fuentes caídas, y el
-- ejes_ok = 9 que hoy se guarda puede querer decir "9 de 52 fuentes
-- contestaron".
--
-- La defensa que se puso el 2026-09-16 --no guardar un perfil con cero
-- ejes-- atajó el caso extremo, la caída total. Una caída parcial donde
-- solo responde pn_inf_basica pasa igual, y el perfil sale casi vacío
-- con ejes_ok = 1.
--
-- El detalle ya venía en la respuesta cruda: fetchGroup guarda el
-- estado de cada fuente y después lo agrega, tirando lo que no cabe en
-- una palabra. Esto lo conserva.
--
-- ADITIVA, COMO LA 067
--
-- block_status y ejes_ok siguen escribiéndose igual y siguen siendo lo
-- que se lee. Esto se guarda al lado para poder medir, y recién cuando
-- haya datos suficientes se mueven las lecturas (paso 3).
--
-- NO SE RELLENA HACIA ATRÁS
--
-- Los 2.681 perfiles viejos no tienen el detalle por fuente y no hay de
-- dónde sacarlo: se agregó al guardar. Quedan en null, que es lo que
-- son. Rellenarlos con una estimación repartiendo el estado del bloque
-- entre sus fuentes inventaría precisión que nunca existió -- el mismo
-- criterio que la 045 con los costos que no se podían medir.
-- ============================================================

alter table client_profiles add column if not exists estado_por_fuente jsonb;
alter table client_profiles add column if not exists fuentes_ok integer;
alter table client_profiles add column if not exists fuentes_totales integer;

comment on column client_profiles.estado_por_fuente is
  'Estado de cada una de las ~52 fuentes en esta consulta: ok, faltante, error o deshabilitado. null en los perfiles anteriores al 2026-09-16, donde solo se guardó el agregado por bloque.';
comment on column client_profiles.fuentes_ok is
  'Cuántas fuentes contestaron. Más preciso que ejes_ok, que cuenta bloques y da 9 aunque hayan contestado 9 de 52.';
comment on column client_profiles.fuentes_totales is
  'Cuántas fuentes se intentaron, incluidas las deshabilitadas.';

create index if not exists client_profiles_fuentes_ok_idx on client_profiles (fuentes_ok);


-- ---------- Qué tan buena fue cada consulta ----------
--
-- Mientras convivan las dos formas de medir, esta vista las muestra
-- juntas: es la única manera de saber si los nueve bloques estaban
-- exagerando, y cuánto.
create or replace view calidad_de_las_consultas with (security_invoker = on) as
select
  p.id                as perfil_id,
  c.cedula,
  p.created_at,
  p.origen,
  p.ejes_ok,
  p.fuentes_ok,
  p.fuentes_totales,
  case
    when p.fuentes_totales is null or p.fuentes_totales = 0 then null
    else round(100.0 * p.fuentes_ok / p.fuentes_totales, 1)
  end                 as pct_fuentes,
  -- Lo que los bloques estaban escondiendo: cuántas fuentes fallaron
  -- adentro de un bloque que igual figuraba en verde.
  (select count(*) from jsonb_each_text(coalesce(p.estado_por_fuente, '{}'::jsonb)) f(k, v) where v = 'error')      as fuentes_con_error,
  (select count(*) from jsonb_each_text(coalesce(p.estado_por_fuente, '{}'::jsonb)) f(k, v) where v = 'faltante')   as fuentes_sin_dato,
  (select count(*) from jsonb_each_text(coalesce(p.estado_por_fuente, '{}'::jsonb)) f(k, v) where v = 'deshabilitado') as fuentes_apagadas
from client_profiles p
join clients c on c.id = p.client_id;

comment on view calidad_de_las_consultas is
  'Compara la medición vieja (ejes_ok, sobre 9 bloques) con la nueva (fuentes_ok, sobre ~52 fuentes). Sirve para decidir cuándo mover las lecturas al detalle por fuente.';
