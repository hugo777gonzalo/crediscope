-- 138 · Las diez variables de crédito de Equifax para el predictor de ingresos
--
-- Paso 1 de docs/especificacion-predictor-de-ingresos.md (sección 6, pasos 1 y 3).
-- `interconnectResponse.AnalisisCreditoSectorFinanciero` trae los campos que
-- más pesan en el nivel con buró del predictor (el mayor crédito aprobado, 32%
-- de la ganancia; la deuda de hace 3 meses, 15%). Hasta acá `derivarTablas` no
-- los tomaba porque la deuda de ese bloque no cuadra con la de
-- `reporteCrediticio` (docs/equifax.md): para el predictor son una SEÑAL, no un
-- saldo, y viven en su tabla para que nadie los sume con las operaciones.
--
-- Una fila por consulta, como `equifax_resumen` (PK = la consulta). Lleva las
-- diez variables y las tres fechas de concesión: con ellas el predictor anula un
-- crédito posterior a la consulta, que puede ser el que se está pidiendo
-- (12.22 de docs/investigacion-predictor-de-ingresos.md). Nada más del bloque:
-- ni las entidades ni las moras.
--
-- Después de aplicarla: `node scripts/cargar-tablas-equifax.mjs --seco` y, si
-- el usuario lo decide, sin `--seco`: rehace desde el crudo las consultas que
-- quedaron con equifax-tablas-v1, sin volver a pagar.
--
-- Acceso: igual que las demás tablas equifax_* (126). Borrar la consulta (la
-- supresión de un titular, 115) borra la fila: on delete cascade.

create table equifax_analisis_credito (
  consulta_equifax_id                    uuid primary key references consultas_equifax(id) on delete cascade,
  mayor_credito_aprobado_monto_usd       numeric(16,2),
  mayor_credito_aprobado_fecha_concesion date,
  mayor_credito_reciente_monto_usd       numeric(16,2),
  mayor_credito_reciente_fecha_concesion date,
  mayor_credito_actual_monto_usd         numeric(16,2),
  mayor_credito_actual_fecha_concesion   date,
  deuda_total_adeudada_usd               numeric(16,2),
  instituciones_con_deuda_numero         integer,
  creditos_aprobados_numero              integer,
  creditos_aprobados_valor_usd           numeric(16,2),
  saldos_vigentes_usd                    numeric(16,2),
  deuda_actual_usd                       numeric(16,2),
  deuda_hace_3_meses_usd                 numeric(16,2)
);
comment on table equifax_analisis_credito is
  'AnalisisCreditoSectorFinanciero de interconnectResponse: una señal para el predictor de ingresos, NO un saldo (su deuda no cuadra con la de reporteCrediticio; nunca se suma con equifax_operaciones). Las ventanas «reciente» y «actual» no son de 12 y 24 meses: sus fechas de concesión tienen mediana de 12 y 38 meses antes de la consulta, y hay créditos con fecha posterior a ella.';
comment on column equifax_analisis_credito.mayor_credito_aprobado_monto_usd is 'MCAMontoOriginal. Con fecha de concesión posterior a la consulta no se usa como señal: puede ser el crédito que se pide.';
comment on column equifax_analisis_credito.mayor_credito_reciente_monto_usd is 'CMRMontoOriginal.';
comment on column equifax_analisis_credito.mayor_credito_actual_monto_usd is 'CMAMontoOriginal.';
comment on column equifax_analisis_credito.deuda_total_adeudada_usd is 'PCTotalAdeudado.';
comment on column equifax_analisis_credito.instituciones_con_deuda_numero is 'PCNumIfisActuales.';
comment on column equifax_analisis_credito.creditos_aprobados_numero is 'RECACreditosAprobados.';
comment on column equifax_analisis_credito.creditos_aprobados_valor_usd is 'RECAValCreditosAprobados.';
comment on column equifax_analisis_credito.saldos_vigentes_usd is 'RECAValSaldosVigentes.';
comment on column equifax_analisis_credito.deuda_actual_usd is 'TDeudaActual.';
comment on column equifax_analisis_credito.deuda_hace_3_meses_usd is 'TDeudaHace3Meses.';

alter table equifax_analisis_credito enable row level security;
revoke all on equifax_analisis_credito from anon, authenticated;
grant select on equifax_analisis_credito to authenticated;
create policy equifax_analisis_credito_lectura on equifax_analisis_credito for select
  using (exists (select 1 from profiles where id = auth.uid() and rol in ('analista', 'admin')));

-- ---------- rehacer las tablas de una consulta ----------
-- La de la 126 con la tabla nueva. El cuerpo se comparó con la definición viva
-- (pg_get_functiondef) antes de escribir esto: era idéntico al de la 126.
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
  delete from equifax_analisis_credito where consulta_equifax_id = p_consulta;

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

  insert into equifax_analisis_credito
    select * from jsonb_populate_recordset(null::equifax_analisis_credito,
      (select coalesce(jsonb_agg(f || jsonb_build_object('consulta_equifax_id', p_consulta)), '[]'::jsonb)
         from jsonb_array_elements(coalesce(p_tablas -> 'equifax_analisis_credito', '[]'::jsonb)) f));
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('equifax_analisis_credito', v_n);

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
