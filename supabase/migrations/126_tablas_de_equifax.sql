-- 126 · Las respuestas de Equifax descompuestas en tablas
--
-- Decisión del negocio del 2026-10-12 (docs/propuesta-estructura-equifax.md):
-- el camino es JSON → tablas → estructura estandarizada. El crudo
-- (consultas_equifax.respuesta_cruda, 122) sigue siendo la única verdad y no
-- se toca; de él se derivan, con funciones deterministas y versionadas
-- (_shared/equifax-tablas.ts), las tablas de esta migración, y de las tablas
-- sale la estructura (_shared/equifax-estructura.ts, columna `estructura`).
--
-- POR QUÉ TABLAS Y NO SÓLO JSON
--
-- - Cada número de la estructura se verifica con una suma sobre filas que se
--   pueden mirar. Sacado del JSON, sólo se puede confiar.
-- - La conciliación contra el resumen de Equifax se hace en SQL: el
--   2026-10-12 los detalles de bancos cuadraban 22 de 22 con su resumen, los
--   de cooperativas 21 de 22 y los comerciales 16 de 22.
-- - Un error nuestro al descomponer se arregla REHACIENDO las tablas desde el
--   crudo, sin volver a pagar (cada consulta a Equifax se cobra).
--
-- UNA FILA POR CADA COSA: operación, mes, tarjeta, entidad que consultó. Las
-- listas de Equifax parecidas comparten tabla y una columna `origen` dice de
-- cuál vienen (11 tablas para 58 listas). `equifax_resumen` agrupa los datos
-- de una sola fila por consulta: nacieron de nueve listas de una fila que la
-- propuesta no ubicaba.
--
-- QUÉ NO ESTÁ ACÁ
--
-- Los datos personales NO se descomponen: nombre, documento, direcciones,
-- coordenadas y teléfonos de la persona, nombres e identificaciones de
-- terceros, números de operación y de tarjeta se quedan sólo en el crudo.
-- Cuantos menos lugares, menos que suprimir. Tampoco están las listas
-- redundantes (distribucion_endeudamiento) ni lo que calculó el motor de
-- decisión de Equifax con nuestros parámetros de relleno, salvo el estado de
-- cartera y el ingreso estimado, que van rotulados como cálculos de Equifax.
--
-- PK (consulta_equifax_id, orden): `orden` es la posición de la fila en la
-- derivación, que es determinista. Así el reemplazo de una consulta es borrar
-- y volver a escribir, y la PK sirve también como índice para la
-- eliminación en cascada (borrar una consulta —la supresión de un titular,
-- 115— borra sus filas sin tocar suprimir_titular() tabla por tabla).
--
-- ACCESO: igual que consultas_equifax. Lee sólo quien tiene rol de analista
-- o admin; escribe sólo la clave de servicio (saltea la RLS: no hay política
-- de escritura). El rol anónimo no tiene nada.

-- ---------- lo que se agrega a la consulta ----------
alter table consultas_equifax
  add column tablas_version      text,
  add column tablas_hechas_el    timestamptz,
  add column estructura          jsonb,
  add column estructura_version  text,
  add column estructura_hecha_el timestamptz;

comment on column consultas_equifax.tablas_version is
  'Versión de la derivación que llenó las tablas equifax_* de esta consulta (equifax-tablas-vN). Null = todavía no se derivaron.';
comment on column consultas_equifax.estructura is
  'La estructura estandarizada, calculada DESDE las tablas equifax_* (equifax-estructura-vN). Sin datos personales.';

-- ---------- operaciones (la deuda de hoy, una fila por operación) ----------
create table equifax_operaciones (
  consulta_equifax_id      uuid    not null references consultas_equifax(id) on delete cascade,
  orden                    integer not null,
  sistema                  text    not null,
  institucion              text    not null,
  fecha_corte              date,
  rol                      text    not null,
  rol_original             text,
  tipo_credito             text,
  cupo_monto_original_usd  numeric(16,2),
  fecha_apertura           date,
  fecha_vencimiento        date,
  por_vencer_usd           numeric(16,2),
  no_devenga_intereses_usd numeric(16,2),
  vencido_usd              numeric(16,2),
  demanda_judicial_usd     numeric(16,2),
  cartera_castigada_usd    numeric(16,2),
  saldo_deuda_usd          numeric(16,2),
  cuota_mensual_usd        numeric(16,2),
  dias_morosidad           integer,
  primary key (consulta_equifax_id, orden),
  constraint equifax_operaciones_sistema_check check (sistema in ('bancos', 'cooperativas', 'comercial')),
  constraint equifax_operaciones_rol_check check (rol in ('titular', 'codeudor', 'garante', 'otro'))
);
comment on table equifax_operaciones is
  'La deuda actual por operación (detalle_deuda_actual_sb, _seps y _sicom de reporteCrediticio). El rol está normalizado: Equifax manda TITULAR y Titular. Nunca se suma con interconnectResponse: es la misma deuda en otra forma y no cuadra.';
comment on column equifax_operaciones.sistema is 'bancos (SB), cooperativas (SEPS) o comercial (SICOM).';

-- ---------- historia mensual (una fila por operación y mes) ----------
create table equifax_historia_mensual (
  consulta_equifax_id      uuid    not null references consultas_equifax(id) on delete cascade,
  orden                    integer not null,
  sistema                  text    not null,
  institucion              text    not null,
  fecha_corte              date    not null,
  rol                      text    not null,
  rol_original             text,
  tipo_credito             text,
  cupo_monto_original_usd  numeric(16,2),
  fecha_apertura           date,
  fecha_vencimiento        date,
  por_vencer_usd           numeric(16,2),
  no_devenga_intereses_usd numeric(16,2),
  vencido_usd              numeric(16,2),
  demanda_judicial_usd     numeric(16,2),
  cartera_castigada_usd    numeric(16,2),
  saldo_deuda_usd          numeric(16,2),
  dias_morosidad           integer,
  primary key (consulta_equifax_id, orden),
  constraint equifax_historia_mensual_sistema_check check (sistema in ('bancos', 'cooperativas', 'comercial')),
  constraint equifax_historia_mensual_rol_check check (rol in ('titular', 'codeudor', 'garante', 'otro'))
);
comment on table equifax_historia_mensual is
  'La historia de 24 meses por operación (detalle_deuda_historica_sb, _seps y _sicom). Es la tabla grande: del orden de 500 filas por consulta. Sin cuota mensual: la historia no la trae. NO hay forma confiable de seguir UNA operación de un mes a otro: estas listas no traen su número (es dato personal y sólo viene en otras), y institución más apertura no alcanza (788 pares de filas de un mismo mes comparten ambas) ni sumarle el cupo (cambia de un mes a otro en 191 grupos). Por eso nada se cuenta «por operación» a través de los meses: se cuenta por mes.';

-- ---------- deuda por sistema y mes ----------
create table equifax_deuda_por_sistema_y_mes (
  consulta_equifax_id           uuid    not null references consultas_equifax(id) on delete cascade,
  orden                         integer not null,
  origen                        text    not null,
  sistema                       text    not null,
  fecha_corte                   date,
  por_vencer_usd                numeric(16,2),
  no_devenga_intereses_usd      numeric(16,2),
  vencido_usd                   numeric(16,2),
  saldo_deuda_usd               numeric(16,2),
  demanda_judicial_usd          numeric(16,2),
  cartera_castigada_usd         numeric(16,2),
  vencido_0_a_1_mes_usd         numeric(16,2),
  vencido_1_a_2_meses_usd       numeric(16,2),
  vencido_2_a_3_meses_usd       numeric(16,2),
  vencido_3_a_6_meses_usd       numeric(16,2),
  vencido_6_a_9_meses_usd       numeric(16,2),
  vencido_9_a_12_meses_usd      numeric(16,2),
  vencido_12_a_24_meses_usd     numeric(16,2),
  vencido_24_a_36_meses_usd     numeric(16,2),
  vencido_mas_de_36_meses_usd   numeric(16,2),
  primary key (consulta_equifax_id, orden),
  constraint equifax_deuda_por_sistema_y_mes_origen_check check (origen in ('resumen_actual', 'deuda_historica', 'evolucion')),
  constraint equifax_deuda_por_sistema_y_mes_sistema_check check (sistema in ('bancos', 'cooperativas', 'comercial'))
);
comment on table equifax_deuda_por_sistema_y_mes is
  'Los totales de Equifax por sistema: el resumen de hoy (valor_deuda_3_sistemas, sin fecha), la deuda histórica con sus tramos de mora y la evolución mensual de total y vencidos. Es el total de REFERENCIA contra el que se concilia el detalle.';
comment on column equifax_deuda_por_sistema_y_mes.vencido_24_a_36_meses_usd is
  'Es el vencido_24 de Equifax. Se lee "de 24 a 36 meses" porque la composición de la deuda de Equifax trae nueve tramos y éste es el octavo; falta confirmarlo con el diccionario de datos.';
comment on column equifax_deuda_por_sistema_y_mes.vencido_mas_de_36_meses_usd is
  'Es el vencido_36 de Equifax (ver el comentario del tramo de 24 a 36 meses).';

-- ---------- vencimientos ----------
create table equifax_vencimientos (
  consulta_equifax_id           uuid    not null references consultas_equifax(id) on delete cascade,
  orden                         integer not null,
  origen                        text    not null,
  sistema                       text,
  institucion                   text,
  fecha_corte                   date,
  por_vencer_usd                numeric(16,2),
  vencido_usd                   numeric(16,2),
  no_devenga_intereses_usd      numeric(16,2),
  saldo_deuda_usd               numeric(16,2),
  demanda_judicial_usd          numeric(16,2),
  cartera_castigada_usd         numeric(16,2),
  por_vencer_0_a_1_mes_usd      numeric(16,2),
  por_vencer_1_a_3_meses_usd    numeric(16,2),
  por_vencer_3_a_6_meses_usd    numeric(16,2),
  por_vencer_6_a_12_meses_usd   numeric(16,2),
  por_vencer_mas_de_12_meses_usd numeric(16,2),
  vencido_0_a_1_mes_usd         numeric(16,2),
  vencido_1_a_2_meses_usd       numeric(16,2),
  vencido_2_a_3_meses_usd       numeric(16,2),
  vencido_3_a_6_meses_usd       numeric(16,2),
  vencido_6_a_9_meses_usd       numeric(16,2),
  vencido_9_a_12_meses_usd      numeric(16,2),
  vencido_12_a_24_meses_usd     numeric(16,2),
  vencido_24_a_36_meses_usd     numeric(16,2),
  vencido_mas_de_36_meses_usd   numeric(16,2),
  primary key (consulta_equifax_id, orden),
  constraint equifax_vencimientos_origen_check check (origen in ('estructura_vencimiento', 'detalle_estructura_vencimiento', 'saldos_por_vencer')),
  constraint equifax_vencimientos_sistema_check check (sistema is null or sistema in ('bancos', 'cooperativas', 'comercial'))
);
comment on table equifax_vencimientos is
  'Cómo vence la deuda según Equifax: por institución y sistema (estructura_vencimiento), la serie mensual de los tramos de mora (detalle_estructura_vencimiento, sin institución ni sistema) y lo por vencer por institución (saldos_por_vencer).';

-- ---------- tarjetas ----------
create table equifax_tarjetas (
  consulta_equifax_id         uuid    not null references consultas_equifax(id) on delete cascade,
  orden                       integer not null,
  estado                      text    not null,
  institucion                 text,
  emisor                      text,
  antiguedad_meses            integer,
  cupo_usd                    numeric(16,2),
  saldo_actual_usd            numeric(16,2),
  saldo_promedio_6_meses_usd  numeric(16,2),
  uso_segun_equifax_porcentaje numeric(14,2),
  fecha_corte                 date,
  fecha_cancelacion           date,
  primary key (consulta_equifax_id, orden),
  constraint equifax_tarjetas_estado_check check (estado in ('vigente', 'cancelada'))
);
comment on table equifax_tarjetas is
  'Tarjetas de crédito vigentes (detalle_tarjetas) y canceladas (tarjetas_canceladas). Sin el número de la tarjeta.';
comment on column equifax_tarjetas.antiguedad_meses is
  'Se asume en meses (va de 2 a 388 y la mayor nunca pasó los meses desde el primer crédito de la persona, en las 22 respuestas); falta confirmarlo con el diccionario.';
comment on column equifax_tarjetas.uso_segun_equifax_porcentaje is
  'El porcentaje_uso_tarjeta de Equifax. Es el saldo PROMEDIO de 6 meses sobre el cupo (coincide en 136 de 136 tarjetas), no el saldo actual, y pasa de 100 con cupos chicos. El uso del cupo de hoy se calcula con saldo_actual_usd.';

-- ---------- créditos ----------
create table equifax_creditos (
  consulta_equifax_id uuid    not null references consultas_equifax(id) on delete cascade,
  orden               integer not null,
  origen              text    not null,
  institucion         text,
  estado_operacion    text,
  tipo_credito        text,
  valor_operacion_usd numeric(16,2),
  titular_usd         numeric(16,2),
  codeudor_usd        numeric(16,2),
  garante_usd         numeric(16,2),
  fecha_concesion     date,
  fecha_vencimiento   date,
  fecha_corte         date,
  fecha_cancelacion   date,
  primary key (consulta_equifax_id, orden),
  constraint equifax_creditos_origen_check check (origen in ('creditos_otorgados', 'operaciones_canceladas'))
);
comment on table equifax_creditos is
  'Los créditos que le otorgaron (creditos_otorgados: original, novado, refinanciado, reestructurado) y las operaciones canceladas. Sin el número de operación.';
comment on column equifax_creditos.titular_usd is
  'Sin explicar: en 161 de 253 créditos vienen titular y codeudor a la vez con valor y no suman el valor de la operación. Pregunta a Equifax (docs/equifax-pedido-de-diccionario.md).';

-- ---------- consultas recibidas ----------
create table equifax_consultas_recibidas (
  consulta_equifax_id uuid    not null references consultas_equifax(id) on delete cascade,
  orden               integer not null,
  entidad             text    not null,
  mes                 date    not null,
  es_novacredit       boolean not null,
  primary key (consulta_equifax_id, orden)
);
comment on table equifax_consultas_recibidas is
  'Qué entidad consultó a la persona en qué mes (entidades_consultados, 12 meses). `mes` es el primer día del mes. NovaCredit va marcada: no cuenta como una entidad que evalúa a la persona.';

-- ---------- scores ----------
create table equifax_scores (
  consulta_equifax_id                  uuid    not null references consultas_equifax(id) on delete cascade,
  orden                                integer not null,
  tipo                                 text    not null,
  retroactivo_meses                    integer,
  score                                numeric(10,2),
  score_minimo                         numeric(10,2),
  score_maximo                         numeric(10,2),
  total_acumulado_porcentaje           numeric(10,2),
  tasa_de_malos_acumulada_porcentaje   numeric(10,2),
  fecha_inicial                        date,
  fecha_final                          date,
  rango_texto                          text,
  segmentacion                         text,
  porcentaje                           numeric(10,2),
  probabilidad_porcentaje              numeric(10,2),
  primary key (consulta_equifax_id, orden),
  constraint equifax_scores_tipo_check check (tipo in ('score', 'inclusion', 'sobreendeudamiento', 'historico'))
);
comment on table equifax_scores is
  'Los scores de Equifax: el vigente, el de inclusión, el de sobreendeudamiento y el histórico (actual, hace 6 y hace 12 meses). «Score» a secas es el de CrediScope: éstos son los de Equifax.';

-- ---------- indicadores por período ----------
create table equifax_indicadores_por_periodo (
  consulta_equifax_id uuid    not null references consultas_equifax(id) on delete cascade,
  orden               integer not null,
  origen              text    not null,
  indicador           text    not null,
  retroactivo_meses   integer,
  valor_numero        numeric(18,2),
  valor_texto         text,
  fecha               date,
  primary key (consulta_equifax_id, orden)
);
comment on table equifax_indicadores_por_periodo is
  'Series cortas de Equifax en forma larga: acreedores, cuota estimada, endeudamiento y vencidos (actual, hace 6 y hace 12 meses; la cuota también a +6 y +12) y el perfil de riesgo directo. `origen` es la lista de Equifax y distingue financiero de comercial.';

-- ---------- codeudor y garante: operaciones de otras personas ----------
-- El nombre NO dice «garantías»: en Ecuador una garantía es el colateral (un
-- auto, una casa, un pagaré). Lo que Equifax llama «garantías personales» es
-- esta persona respondiendo por la deuda de otra como codeudora o garante.
create table equifax_codeudor_garante (
  consulta_equifax_id uuid    not null references consultas_equifax(id) on delete cascade,
  orden               integer not null,
  vigente             boolean not null,
  tipo_deudor         text,
  institucion         text,
  deuda_total_usd     numeric(16,2),
  primary key (consulta_equifax_id, orden)
);
comment on table equifax_codeudor_garante is
  'Operaciones de OTRAS personas de las que ésta es codeudora o garante: la lista aparte que Equifax llama garantias_personales_codeudores_*, SIN el nombre ni la identificación del titular, que son datos de un tercero. Medido el 2026-10-12: coincide con las operaciones de rol codeudor del detalle actual en 22 de 22 personas (cantidad y monto): es la misma deuda y nunca se suman las dos.';

-- ---------- resumen: los datos de una sola fila ----------
create table equifax_resumen (
  consulta_equifax_id                  uuid primary key references consultas_equifax(id) on delete cascade,
  -- resumen_informe: según Equifax, con TODOS los roles (también codeudor y garante)
  impagos_numero                       integer,
  impagos_monto_usd                    numeric(16,2),
  demanda_judicial_numero              integer,
  demanda_judicial_monto_usd           numeric(16,2),
  cartera_castigada_numero             integer,
  cartera_castigada_monto_usd          numeric(16,2),
  -- protestos_morosidades. Los protestos vienen SIEMPRE vacíos: null es «no medido», no cero.
  morosidades_numero                   integer,
  morosidades_monto_usd                numeric(16,2),
  morosidades_total_operaciones        integer,
  protestos_numero                     integer,
  -- cuota_estimada_mensual
  cuota_estimada_mensual_usd           numeric(16,2),
  cuota_creditos_comerciales_numero    integer,
  cuota_total_vencido_usd              numeric(16,2),
  cuota_total_demanda_usd              numeric(16,2),
  cuota_total_cartera_usd              numeric(16,2),
  cuota_creditos_iece_numero           integer,
  cuota_operaciones_excluidas_numero   integer,
  -- personas_inhabilitadas
  inhabilitaciones_numero              integer,
  ultima_inhabilitacion_fecha          date,
  ultima_inhabilitacion_accion         text,
  ultima_inhabilitacion_motivo         text,
  -- mantiene_historial_crediticio
  primer_credito_fecha                 date,
  -- factores_influyen_score (cifras de Equifax; no se reproducen con las operaciones)
  factores_operaciones_historicas_numero integer,
  factores_operaciones_vigentes_numero integer,
  factores_operaciones_vencidas_numero integer,
  factores_saldo_por_vencer_usd        numeric(16,2),
  factores_saldo_vencido_usd           numeric(16,2),
  factores_saldo_demanda_judicial_usd  numeric(16,2),
  factores_saldo_cartera_castigada_usd numeric(16,2),
  factores_maximo_saldo_vencido_usd    numeric(16,2),
  factores_meses_desde_el_primer_credito integer,
  factores_vencidos_actuales_numero    integer,
  factores_maximo_dias_vencido         integer,
  factores_saldo_deuda_nuevos_creditos_usd numeric(16,2),
  -- informacion_sri, sin nombre, RUC, dirección ni nombre de fantasía
  sri_tiene_ruc                        boolean,
  sri_estado_contribuyente             text,
  sri_clase_contribuyente              text,
  sri_obligado_a_contabilidad          boolean,
  sri_fecha_inicio_actividades         date,
  sri_fecha_suspension_definitiva      date,
  sri_codigo_ciiu                      text,
  -- indicador_impacto_economico: estimaciones de Equifax
  impacto_economico_indicador          integer,
  impacto_economico_ingreso_usd        numeric(16,2),
  impacto_economico_cuota_financiera_usd numeric(16,2),
  -- sujeto_al_dia: sólo cuántos (la institución trae el teléfono de la persona)
  sujetos_al_dia_numero                integer,
  -- entidades_consultados: los doce meses del encabezado (mes1 es el más reciente). Sin ellos no se
  -- sabría cuántos meses sin consultas hubo: las tablas sólo tienen los meses que sí tuvieron.
  consultas_recibidas_mes_inicial      date,
  consultas_recibidas_mes_final        date,
  -- interconnectResponse: cálculos del motor de decisión de Equifax
  estado_de_cartera_codigo             integer,
  estado_de_cartera_descripcion        text,
  estado_de_cartera_interpretacion     text,
  ingreso_estimado_usd                 numeric(16,2)
);
comment on table equifax_resumen is
  'Los datos de una sola fila de la respuesta. Los de impagos, morosidades y cuota estimada cuentan TAMBIÉN las operaciones donde la persona es codeudora o garante (se midió: 22 de 22). Los de estado de cartera e ingreso estimado son cálculos de Equifax, no hechos del buró.';

-- ---------- acceso ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'equifax_operaciones', 'equifax_historia_mensual', 'equifax_deuda_por_sistema_y_mes',
    'equifax_vencimientos', 'equifax_tarjetas', 'equifax_creditos', 'equifax_consultas_recibidas',
    'equifax_scores', 'equifax_indicadores_por_periodo', 'equifax_codeudor_garante', 'equifax_resumen'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to authenticated', t);
    execute format(
      'create policy %I on %I for select using (exists (select 1 from profiles where id = auth.uid() and rol in (''analista'', ''admin'')))',
      t || '_lectura', t);
  end loop;
end;
$$;

-- ---------- rehacer las tablas de una consulta ----------
-- Todo en una sola llamada y una sola transacción: borrar lo derivado antes y
-- escribir lo nuevo. Si algo falla, queda lo anterior. El cuerpo de p_tablas
-- trae una lista de filas por tabla (las claves son las columnas); lo que no
-- trae una fila queda null. Sólo la clave de servicio la ejecuta.
create or replace function equifax_reemplazar_tablas(
  p_consulta            uuid,
  p_tablas              jsonb,
  p_estructura          jsonb,
  p_version_tablas      text,
  p_version_estructura  text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_conteos jsonb := '{}'::jsonb;
  v_n       integer;
begin
  if not exists (select 1 from consultas_equifax where id = p_consulta) then
    raise exception 'No existe la consulta de Equifax %.', p_consulta;
  end if;

  delete from equifax_operaciones where consulta_equifax_id = p_consulta;
  delete from equifax_historia_mensual where consulta_equifax_id = p_consulta;
  delete from equifax_deuda_por_sistema_y_mes where consulta_equifax_id = p_consulta;
  delete from equifax_vencimientos where consulta_equifax_id = p_consulta;
  delete from equifax_tarjetas where consulta_equifax_id = p_consulta;
  delete from equifax_creditos where consulta_equifax_id = p_consulta;
  delete from equifax_consultas_recibidas where consulta_equifax_id = p_consulta;
  delete from equifax_scores where consulta_equifax_id = p_consulta;
  delete from equifax_indicadores_por_periodo where consulta_equifax_id = p_consulta;
  delete from equifax_codeudor_garante where consulta_equifax_id = p_consulta;
  delete from equifax_resumen where consulta_equifax_id = p_consulta;

  insert into equifax_operaciones
    select * from jsonb_populate_recordset(null::equifax_operaciones,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_operaciones', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_operaciones', v_n);

  insert into equifax_historia_mensual
    select * from jsonb_populate_recordset(null::equifax_historia_mensual,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_historia_mensual', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_historia_mensual', v_n);

  insert into equifax_deuda_por_sistema_y_mes
    select * from jsonb_populate_recordset(null::equifax_deuda_por_sistema_y_mes,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_deuda_por_sistema_y_mes', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_deuda_por_sistema_y_mes', v_n);

  insert into equifax_vencimientos
    select * from jsonb_populate_recordset(null::equifax_vencimientos,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_vencimientos', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_vencimientos', v_n);

  insert into equifax_tarjetas
    select * from jsonb_populate_recordset(null::equifax_tarjetas,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_tarjetas', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_tarjetas', v_n);

  insert into equifax_creditos
    select * from jsonb_populate_recordset(null::equifax_creditos,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_creditos', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_creditos', v_n);

  insert into equifax_consultas_recibidas
    select * from jsonb_populate_recordset(null::equifax_consultas_recibidas,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_consultas_recibidas', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_consultas_recibidas', v_n);

  insert into equifax_scores
    select * from jsonb_populate_recordset(null::equifax_scores,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_scores', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_scores', v_n);

  insert into equifax_indicadores_por_periodo
    select * from jsonb_populate_recordset(null::equifax_indicadores_por_periodo,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_indicadores_por_periodo', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_indicadores_por_periodo', v_n);

  insert into equifax_codeudor_garante
    select * from jsonb_populate_recordset(null::equifax_codeudor_garante,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_codeudor_garante', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_codeudor_garante', v_n);

  insert into equifax_resumen
    select * from jsonb_populate_recordset(null::equifax_resumen,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_resumen', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_resumen', v_n);

  update consultas_equifax
     set tablas_version = p_version_tablas,
         tablas_hechas_el = now(),
         estructura = p_estructura,
         estructura_version = p_version_estructura,
         estructura_hecha_el = now()
   where id = p_consulta;

  return v_conteos;
end;
$$;

comment on function equifax_reemplazar_tablas(uuid, jsonb, jsonb, text, text) is
  'Rehace de una vez las tablas equifax_* y la estructura de una consulta desde lo que derivó _shared/equifax-tablas.ts. Atómica: o queda todo lo nuevo o todo lo anterior. Sólo la clave de servicio.';

revoke all on function equifax_reemplazar_tablas(uuid, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function equifax_reemplazar_tablas(uuid, jsonb, jsonb, text, text) to service_role;
