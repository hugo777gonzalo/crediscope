-- Laboratorio, fases 2 a 4: cortes congelados, catálogo de variables y los
-- cálculos (desempeño, variables, simulación de política). 2026-10-03.
-- Diseño: docs/laboratorio-de-riesgo.md, secciones 6.5 a 7.5.
--
-- Todo se calcula en la base, con funciones security invoker (sólo un admin
-- ve algo) y sin llamar al modelo de lenguaje. Un corte es una foto: copia
-- el puntaje, la recomendación, las versiones y los VALORES de las
-- variables al congelarse. Si mañana se recalcula un perfil o se corrige un
-- análisis, el corte sigue diciendo lo que dijo; por eso se copian, aunque
-- duplique datos.
--
-- De dónde sale el puntaje: del análisis vinculado (sin fallo); en una carga
-- sintética, SIEMPRE del sintético. El resultado de una carga sintética es
-- inventado por la regla plantada, y medir un puntaje real contra un
-- resultado inventado no mide nada.

create table lab_catalogo_variables (
  id                   text primary key,
  ruta                 text[] not null,          -- dentro de standard_profile
  nombre               text not null,            -- en palabras del negocio
  grupo                text not null,
  tipo                 text not null check (tipo in ('numero', 'booleano', 'categoria')),
  -- 'decision': puede pesar. 'protegida': el negocio decidió que no pese
  -- (edad, género); se mira para vigilar que el modelo no trate distinto a
  -- un grupo, nunca para proponer usarla.
  uso                  text not null default 'decision' check (uso in ('decision', 'protegida')),
  en_perfil_del_modelo boolean not null default true,
  activa               boolean not null default true
);

insert into lab_catalogo_variables (id, ruta, nombre, grupo, tipo, uso) values
  ('edad', '{identidad,edad}', 'Edad', 'Identidad', 'numero', 'protegida'),
  ('genero', '{identidad,genero}', 'Género', 'Identidad', 'categoria', 'protegida'),
  ('nivel_educacion', '{identidad,nivelEducacion}', 'Nivel de educación', 'Identidad', 'categoria', 'decision'),
  ('numero_hijos', '{familia,numeroHijos}', 'Número de hijos', 'Familia', 'numero', 'decision'),
  ('numero_direcciones', '{contacto,numeroDirecciones}', 'Direcciones registradas', 'Contacto', 'numero', 'decision'),
  ('numero_telefonos', '{contacto,numeroTelefonos}', 'Teléfonos registrados', 'Contacto', 'numero', 'decision'),
  ('operaciones_bancos', '{comportamientoBancario,numeroOperacionesBuroCredito}', 'Operaciones en bancos', 'Bancos', 'numero', 'decision'),
  ('peor_calificacion', '{comportamientoBancario,peorCalificacionRiesgo}', 'Peor calificación propia', 'Bancos', 'categoria', 'decision'),
  ('mejor_calificacion', '{comportamientoBancario,mejorCalificacionRiesgo}', 'Mejor calificación propia', 'Bancos', 'categoria', 'decision'),
  ('saldo_vigente_bancos', '{comportamientoBancario,saldoTotalVigente}', 'Saldo por vencer en bancos', 'Bancos', 'numero', 'decision'),
  ('saldo_en_mora_bancos', '{comportamientoBancario,saldoEnMoraBuroCredito}', 'Saldo en mora en bancos', 'Bancos', 'numero', 'decision'),
  ('deuda_en_atraso', '{comportamientoBancario,deudaEnAtraso}', 'Deuda propia en atraso', 'Bancos', 'numero', 'decision'),
  ('operacion_castigada', '{comportamientoBancario,tieneOperacionCastigada}', 'Tiene una operación castigada', 'Bancos', 'booleano', 'decision'),
  ('operacion_en_demanda', '{comportamientoBancario,tieneOperacionConDemanda}', 'Tiene una operación en demanda', 'Bancos', 'booleano', 'decision'),
  ('operaciones_como_garante', '{comportamientoBancario,numeroOperacionesComoGaranteOCodeudor}', 'Operaciones como garante o codeudor', 'Bancos', 'numero', 'decision'),
  ('registro_de_deudores', '{comportamientoBancario,figuraEnRegistroDeudores}', 'Figura en el registro de deudores', 'Bancos', 'booleano', 'decision'),
  ('prestamos_iess_biess', '{comportamientoBancario,numeroCreditosFormales}', 'Préstamos del IESS/BIESS', 'Bancos', 'numero', 'decision'),
  ('deudas_retail', '{comportamientoBancario,numeroDeudasRetail}', 'Deudas con casas comerciales', 'Retail', 'numero', 'decision'),
  ('total_retail', '{comportamientoBancario,totalDeudaRetail}', 'Total adeudado a casas comerciales', 'Retail', 'numero', 'decision'),
  ('dias_mora_retail', '{comportamientoBancario,diasMoraMaximaRetail}', 'Días de mora en casas comerciales', 'Retail', 'numero', 'decision'),
  ('operaciones_cooperativas', '{comportamientoCooperativas,numeroOperaciones}', 'Operaciones en cooperativas', 'Cooperativas', 'numero', 'decision'),
  ('dias_mora_cooperativas', '{comportamientoCooperativas,diasMoraMaxima}', 'Días de mora en cooperativas', 'Cooperativas', 'numero', 'decision'),
  ('saldo_en_mora_cooperativas', '{comportamientoCooperativas,saldoEnMora}', 'Saldo en mora en cooperativas', 'Cooperativas', 'numero', 'decision'),
  ('saldo_cooperativas', '{comportamientoCooperativas,saldoTotal}', 'Saldo en cooperativas', 'Cooperativas', 'numero', 'decision'),
  ('habito_de_pago_novadata', '{comportamientoInterno,novadataResultadoHabitoPago}', 'Hábito de pago con Novadata', 'Novadata', 'categoria', 'decision'),
  ('dias_mora_novadata', '{comportamientoInterno,novadataDiasMoraMaxima}', 'Días de mora con Novadata', 'Novadata', 'numero', 'decision'),
  ('demandas_de_cobro', '{riesgoJudicialCrediticio,numeroDemandasComoDemandado}', 'Demandas de cobro en su contra', 'Judicial', 'numero', 'decision'),
  ('demandas_civiles', '{riesgoJudicialCivil,numeroDemandasComoDemandado}', 'Otras demandas en su contra', 'Judicial', 'numero', 'decision'),
  ('demandas_como_ofendido', '{riesgoJudicialCivil,numeroDemandasComoOfendido}', 'Demandas que presentó', 'Judicial', 'numero', 'decision'),
  ('pension_alimenticia', '{riesgoJudicialCivil,tienePensionAlimenticia}', 'Tiene pensión alimenticia a su cargo', 'Judicial', 'booleano', 'decision'),
  ('pension_en_mora', '{riesgoJudicialCivil,pensionAlimenticiaEnMora}', 'Pensión alimenticia en mora', 'Judicial', 'booleano', 'decision'),
  ('antecedentes_penales', '{riesgoPenal,tieneAntecedentesPenales}', 'Tiene antecedentes penales', 'Penal', 'booleano', 'decision'),
  ('denuncias_como_sospechoso', '{riesgoPenal,numeroDenunciasComoSospechoso}', 'Denuncias como sospechoso', 'Penal', 'numero', 'decision'),
  ('impedimento_cargos_publicos', '{cumplimiento,impedimentoCargosPublicos}', 'Impedimento para cargos públicos', 'Cumplimiento', 'booleano', 'decision'),
  ('pep', '{cumplimiento,esPersonaExpuestaPoliticamente}', 'Persona expuesta políticamente', 'Cumplimiento', 'booleano', 'decision'),
  ('segmento_ingreso', '{fuentesIngreso,segmento}', 'Segmento de ingresos', 'Ingresos', 'categoria', 'decision'),
  ('estado_ingreso', '{fuentesIngreso,estadoSegmento}', 'Estado del ingreso', 'Ingresos', 'categoria', 'decision'),
  ('ingreso_reportado_iess', '{fuentesIngreso,pisoIngresoMensualReportado}', 'Ingreso reportado al IESS', 'Ingresos', 'numero', 'decision'),
  ('continuidad_laboral_meses', '{fuentesIngreso,detalle,continuidadLaboral,meses}', 'Continuidad laboral (meses)', 'Ingresos', 'numero', 'decision'),
  ('continuidad_laboral_vigente', '{fuentesIngreso,detalle,continuidadLaboral,vigente}', 'Trabaja hoy (continuidad vigente)', 'Ingresos', 'booleano', 'decision'),
  ('ruc_activo', '{laboral,tieneRucActivo}', 'RUC activo', 'Laboral', 'booleano', 'decision'),
  ('independiente', '{laboral,esIndependiente}', 'Es independiente', 'Laboral', 'booleano', 'decision'),
  ('antiguedad_empleo_meses', '{laboral,antiguedadEmpleoActualMeses}', 'Antigüedad en el empleo actual (meses)', 'Laboral', 'numero', 'decision'),
  ('empleo_mas_largo_meses', '{laboral,duracionEmpleoMasLargoMeses}', 'Empleo más largo (meses)', 'Laboral', 'numero', 'decision'),
  ('empleos_registrados', '{laboral,historialEmpleosRegistrados}', 'Empleos registrados en el IESS', 'Laboral', 'numero', 'decision'),
  ('salario_mas_alto', '{laboral,salarioMasAltoRegistrado}', 'Salario más alto registrado', 'Laboral', 'numero', 'decision'),
  ('empleados_a_cargo', '{laboral,numeroEmpleadosRegistrados}', 'Empleados a su cargo', 'Laboral', 'numero', 'decision'),
  ('obligaciones_patronales_en_mora', '{laboral,obligacionesPatronalesEnMora}', 'Obligaciones patronales en mora', 'Laboral', 'booleano', 'decision'),
  ('etapa_activa_meses', '{laboral,antiguedadUltimaEtapaActivaMeses}', 'Última etapa con RUC activo (meses)', 'Laboral', 'numero', 'decision'),
  ('impuesto_a_la_renta', '{tributario,generaImpuestoRenta}', 'Paga impuesto a la renta', 'Tributario', 'booleano', 'decision'),
  ('afiliado_unipersonal', '{tributario,esAfiliadoUnipersonal}', 'Afiliado unipersonal', 'Tributario', 'booleano', 'decision'),
  ('afiliado_iess_activo', '{seguridadSocial,afiliadoIessActivo}', 'Afiliado activo al IESS', 'Seguridad social', 'booleano', 'decision'),
  ('jubilado', '{seguridadSocial,esJubilado}', 'Jubilado', 'Seguridad social', 'booleano', 'decision'),
  ('vehiculos', '{patrimonio,numeroVehiculos}', 'Vehículos', 'Patrimonio', 'numero', 'decision'),
  ('valor_colateral_vehiculos', '{patrimonio,valorColateralVehiculos}', 'Valor de colateral de vehículos', 'Patrimonio', 'numero', 'decision'),
  ('inmuebles', '{patrimonio,numeroInmuebles}', 'Inmuebles', 'Patrimonio', 'numero', 'decision'),
  ('multas_transito', '{transitoVehicular,numeroMultas}', 'Multas de tránsito', 'Tránsito', 'numero', 'decision');

create table lab_cortes (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,
  carga_ids              uuid[] not null,
  definicion_default_id  uuid not null references lab_definiciones_default(id),
  ventana_meses          integer not null check (ventana_meses in (12, 24)),
  filtros                jsonb not null default '{}'::jsonb,
  es_sintetico           boolean not null,
  resumen                jsonb,
  creado_por             uuid references auth.users(id),
  congelado_en           timestamptz not null default now()
);

create table lab_corte_operaciones (
  corte_id              uuid not null references lab_cortes(id) on delete cascade,
  operacion_id          uuid not null references lab_operaciones(id) on delete cascade,
  carga_id              uuid not null,
  cedula                text not null,
  producto              text,
  monto                 numeric(14, 2),
  fecha_desembolso      date,
  incluida              boolean not null,
  motivo_exclusion      text,
  malo                  boolean,
  fuente_puntaje        text check (fuente_puntaje in ('analisis', 'sintetico')),
  puntaje               integer,
  recomendacion         text,
  marco_version         text,
  structure_version     text,
  veredicto_origen      text,
  primera_de_la_persona boolean,
  client_profile_id     uuid,
  analysis_result_id    uuid,
  variables             jsonb,
  primary key (corte_id, operacion_id)
);

create table lab_resultados (
  id           uuid primary key default gen_random_uuid(),
  corte_id     uuid not null references lab_cortes(id) on delete cascade,
  tipo         text not null check (tipo in ('desempeno', 'variables', 'simulacion_politica', 'simulacion_marco', 'estabilidad')),
  metodologia  jsonb not null,
  resultado    jsonb not null,
  n            integer,
  n_malos      integer,
  calculado_por uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index lab_resultados_corte_idx on lab_resultados (corte_id, tipo, created_at desc);

alter table lab_catalogo_variables enable row level security;
alter table lab_cortes enable row level security;
alter table lab_corte_operaciones enable row level security;
alter table lab_resultados enable row level security;

create policy lab_catalogo_admin on lab_catalogo_variables for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_cortes_admin on lab_cortes for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
-- Un corte congelado no se edita: sin update.
create policy lab_corte_operaciones_lectura on lab_corte_operaciones for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_corte_operaciones_alta on lab_corte_operaciones for insert
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_resultados_lectura on lab_resultados for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_resultados_alta on lab_resultados for insert
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- ------------------------------------------------------------- congelar
create or replace function lab_congelar_corte(
  p_nombre text, p_cargas uuid[], p_definicion uuid, p_ventana integer, p_filtros jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id      uuid;
  v_tipos   boolean[];
  v_def     lab_definiciones_default;
  v_orden   text[] := array['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D', 'E'];
  v_peores  text[];
begin
  if p_ventana not in (12, 24) then raise exception 'La ventana es de 12 o de 24 meses'; end if;
  if coalesce(array_length(p_cargas, 1), 0) = 0 then raise exception 'Falta elegir al menos una carga'; end if;
  if exists (select 1 from unnest(p_cargas) c where not exists (select 1 from lab_cargas k where k.id = c and k.estado = 'lista')) then
    raise exception 'Todas las cargas tienen que estar listas (vinculadas y sin errores)';
  end if;
  select array_agg(distinct es_sintetica) into v_tipos from lab_cargas where id = any(p_cargas);
  if array_length(v_tipos, 1) > 1 then raise exception 'No se mezclan cargas reales con sintéticas'; end if;
  select * into v_def from lab_definiciones_default where id = p_definicion;
  if not found then raise exception 'No existe esa definición de default'; end if;
  v_peores := v_orden[array_position(v_orden, coalesce(v_def.calificacion_peor_que, 'E')) + 1 :];

  insert into lab_cortes (nombre, carga_ids, definicion_default_id, ventana_meses, filtros, es_sintetico, creado_por)
  values (p_nombre, p_cargas, p_definicion, p_ventana, coalesce(p_filtros, '{}'::jsonb), v_tipos[1], auth.uid())
  returning id into v_id;

  insert into lab_corte_operaciones (
    corte_id, operacion_id, carga_id, cedula, producto, monto, fecha_desembolso, incluida, motivo_exclusion, malo,
    fuente_puntaje, puntaje, recomendacion, marco_version, structure_version, veredicto_origen,
    primera_de_la_persona, client_profile_id, analysis_result_id, variables
  )
  select v_id, o.id, o.carga_id, o.cedula, o.producto, o.monto, o.fecha_desembolso,
         m.motivo is null, m.motivo,
         case when m.motivo is null then (
           coalesce(x.dias >= v_def.dias_mora_minimo, false)
           or coalesce(x.calificacion = any(v_peores), false)
           -- El estado de la operación cuenta si el impago cayó dentro de la
           -- ventana (o no se sabe cuándo cayó).
           or (x.dentro and ((v_def.cuenta_castigo and o.estado_operacion = 'castigada')
                          or (v_def.cuenta_reestructuracion and o.estado_operacion = 'reestructurada')
                          or (v_def.cuenta_judicial and o.estado_operacion = 'judicial')))
         ) end,
         f.fuente,
         case f.fuente when 'analisis' then a.crediscope_score when 'sintetico' then (o.sintetico ->> 'puntaje')::integer end,
         case f.fuente
           when 'analisis' then case a.recomendacion when 'observar' then 'revisar' else a.recomendacion end
           when 'sintetico' then o.sintetico ->> 'recomendacion' end,
         case f.fuente when 'analisis' then a.rules_version end,
         p.structure_version,
         case f.fuente when 'analisis' then a.veredicto_origen end,
         o.primera_de_la_persona, o.client_profile_id, o.analysis_result_id,
         case when p.id is null then null else
           (select jsonb_object_agg(cv.id, p.standard_profile #> cv.ruta) from lab_catalogo_variables cv where cv.activa) end
    from lab_operaciones o
    join lab_cargas k on k.id = o.carga_id
    left join analysis_results a on a.id = o.analysis_result_id
    left join client_profiles p on p.id = o.client_profile_id
    cross join lateral (select
      case when p_ventana = 12 then o.dias_mora_max_12m else o.dias_mora_max_24m end as dias,
      case when p_ventana = 12 then o.peor_calificacion_12m else o.peor_calificacion_24m end as calificacion,
      (o.fecha_primer_default is null or o.fecha_primer_default <= o.fecha_desembolso + make_interval(months => p_ventana)) as dentro
    ) x
    cross join lateral (select
      case when k.es_sintetica and o.sintetico ? 'puntaje' then 'sintetico'
           when a.id is not null and a.fallo is null then 'analisis' end as fuente
    ) f
    cross join lateral (select case
      when o.vinculo = 'consulta_posterior' then 'consulta posterior al desembolso (fuga)'
      when o.vinculo = 'fuera_de_ventana' then 'consulta más vieja que la ventana'
      when o.vinculo = 'sin_consulta' then 'nunca se consultó'
      when o.fecha_desembolso + make_interval(months => p_ventana) > k.fecha_corte then 'inmadura'
      when (case when p_ventana = 12 then o.dias_mora_max_12m else o.dias_mora_max_24m end) is null
       and (case when p_ventana = 12 then o.peor_calificacion_12m else o.peor_calificacion_24m end) is null
       and o.estado_operacion not in ('castigada', 'reestructurada', 'judicial') then 'sin dato de mora en la ventana'
      when p_filtros ? 'productos' and not (o.producto = any(array(select jsonb_array_elements_text(p_filtros -> 'productos')))) then 'filtro: producto'
      when p_filtros ? 'desde' and o.fecha_desembolso < (p_filtros ->> 'desde')::date then 'filtro: fecha'
      when p_filtros ? 'hasta' and o.fecha_desembolso > (p_filtros ->> 'hasta')::date then 'filtro: fecha'
      when p_filtros ? 'marcos' and f.fuente = 'analisis'
       and not (a.rules_version = any(array(select jsonb_array_elements_text(p_filtros -> 'marcos')))) then 'filtro: versión del marco'
    end as motivo) m
   where o.carga_id = any(p_cargas);

  update lab_cortes set resumen = (
    select jsonb_build_object(
      'operaciones', count(*),
      'incluidas', count(*) filter (where incluida),
      'malos', count(*) filter (where incluida and malo),
      'con_puntaje', count(*) filter (where incluida and puntaje is not null),
      'excluidas', coalesce((select jsonb_object_agg(motivo_exclusion, n) from (
          select motivo_exclusion, count(*) as n from lab_corte_operaciones
           where corte_id = v_id and not incluida group by motivo_exclusion) e), '{}'::jsonb))
    from lab_corte_operaciones where corte_id = v_id)
  where id = v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------ desempeño
-- AUC por rangos (Mann-Whitney), empates a la mitad: la probabilidad de que
-- un bueno tenga mejor puntaje que un malo. Sin los bloqueados: su puntaje
-- lo fuerza la política a 1 y no dice nada del modelo.
create or replace function lab_auc(p_corte uuid, p_marco text default null)
returns table (auc numeric, buenos bigint, malos bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select malo, puntaje from lab_corte_operaciones
     where corte_id = p_corte and incluida and puntaje is not null
       and veredicto_origen is distinct from 'control_bloqueo'
       and (p_marco is null or marco_version = p_marco)
  ), r as (
    select malo, rank() over (order by puntaje) + (count(*) over (partition by puntaje) - 1) / 2.0 as rango from base
  ), t as (
    select count(*) filter (where not malo) as nb, count(*) filter (where malo) as nm,
           sum(rango) filter (where not malo) as suma_buenos from r
  )
  select case when nb = 0 or nm = 0 then null
              else round((suma_buenos - nb * (nb + 1) / 2.0) / (nb * nm::numeric), 4) end, nb, nm
    from t;
$$;

create or replace function lab_calcular_desempeno(p_corte uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_corte lab_cortes;
  v_auc   numeric;
  v_nb    bigint;
  v_nm    bigint;
  v_se    numeric;
  v_ks    numeric;
  v_res   jsonb;
begin
  select * into v_corte from lab_cortes where id = p_corte;
  if not found then raise exception 'No existe el corte'; end if;
  select auc, buenos, malos into v_auc, v_nb, v_nm from lab_auc(p_corte);

  -- Error estándar del AUC (Hanley y McNeil, 1982).
  if v_auc is not null then
    v_se := sqrt((v_auc * (1 - v_auc)
                + (v_nb - 1) * (v_auc / (2 - v_auc) - v_auc ^ 2)
                + (v_nm - 1) * (2 * v_auc ^ 2 / (1 + v_auc) - v_auc ^ 2)) / (v_nb * v_nm));
  end if;

  -- KS: la mayor distancia entre las distribuciones acumuladas de buenos y malos.
  with base as (
    select malo, puntaje from lab_corte_operaciones
     where corte_id = p_corte and incluida and puntaje is not null and veredicto_origen is distinct from 'control_bloqueo'
  ), por as (
    select puntaje, count(*) filter (where not malo) as b, count(*) filter (where malo) as m from base group by puntaje
  ), acum as (
    select sum(b) over (order by puntaje) / nullif(v_nb, 0)::numeric as fb,
           sum(m) over (order by puntaje) / nullif(v_nm, 0)::numeric as fm from por
  )
  select round(max(abs(fb - fm)), 4) into v_ks from acum;

  with base as (
    select * from lab_corte_operaciones where corte_id = p_corte and incluida and puntaje is not null
  ), por_rec as (
    select case when veredicto_origen = 'control_bloqueo' then 'bloqueado' else coalesce(recomendacion, 'sin recomendación') end as rec,
           count(*) as n, count(*) filter (where malo) as malos from base group by 1
  ), wilson as (
    select rec, n, malos, malos::numeric / n as p, 1.96 as z from por_rec
  ), tramos as (
    select least(floor(puntaje / 100.0) * 100, 900)::int as desde, count(*) as n, count(*) filter (where malo) as malos
      from base where veredicto_origen is distinct from 'control_bloqueo' group by 1
  ), versiones as (
    select marco_version, coalesce(marco_version, fuente_puntaje) as version, count(*) as n, count(*) filter (where malo) as malos
      from base group by 1, 2
  )
  select jsonb_build_object(
    'es_sintetico', v_corte.es_sintetico,
    'n', (select count(*) from base),
    'n_malos', (select count(*) filter (where malo) from base),
    'auc', v_auc,
    'auc_intervalo', case when v_se is null then null else jsonb_build_array(round(greatest(0, v_auc - 1.96 * v_se), 4), round(least(1, v_auc + 1.96 * v_se), 4)) end,
    'gini', case when v_auc is null then null else round(2 * v_auc - 1, 4) end,
    'ks', v_ks,
    'por_recomendacion', (select jsonb_agg(jsonb_build_object(
        'recomendacion', rec, 'n', n, 'malos', malos, 'tasa', round(p, 4),
        'intervalo', jsonb_build_array(
          round(greatest(0, ((p + z * z / (2 * n)) - z * sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n)), 4),
          round(least(1, ((p + z * z / (2 * n)) + z * sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n)), 4)))
        order by array_position(array['aprobar', 'revisar', 'negar', 'bloqueado', 'sin recomendación'], rec)) from wilson),
    'por_tramo', (select jsonb_agg(jsonb_build_object('desde', desde, 'hasta', case when desde = 900 then 999 else desde + 99 end,
        'n', n, 'malos', malos, 'tasa', round(malos::numeric / n, 4)) order by desde) from tramos),
    'por_version', (select jsonb_agg(jsonb_build_object('version', version, 'n', n, 'malos', malos,
        'tasa', round(malos::numeric / n, 4),
        'auc', case when marco_version is null then null else (select auc from lab_auc(p_corte, marco_version)) end)
        order by version) from versiones),
    'advertencias', to_jsonb(array_remove(array[
        case when (select count(*) filter (where malo) from base) < 30 then 'Menos de 30 malos: el AUC y las tasas por recomendación son orientativos.' end,
        case when v_corte.es_sintetico then 'Corte sintético: el resultado y el puntaje son inventados. No es desempeño del motor.' end
      ], null))
  ) into v_res;

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'desempeno',
          jsonb_build_object('version', 1, 'auc', 'rangos (Mann-Whitney), empates a la mitad, sin bloqueados', 'intervalo_auc', 'Hanley-McNeil 95%',
                             'intervalo_tasa', 'Wilson 95%', 'tramos', 'de a 100 puntos'),
          v_res, (v_res ->> 'n')::integer, (v_res ->> 'n_malos')::integer, auth.uid());
  return v_res;
end;
$$;

-- ------------------------------------------------------------ variables
-- Valor de información (IV) y peso de la evidencia (WoE) por variable, sobre
-- los valores congelados en el corte. Una persona cuenta una sola vez. Los
-- números con muchos ceros tienen un tramo propio para el cero (si no, los
-- cuantiles repetirían "0 a 0"); el resto, en cuartiles. Suavizado de 0,5
-- para que un tramo sin malos no dé infinito.
create or replace function lab_calcular_variables(p_corte uuid)
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
  select count(*) filter (where not malo), count(*) filter (where malo) into v_b, v_m
    from lab_corte_operaciones
   where corte_id = p_corte and incluida and primera_de_la_persona and variables is not null;
  if v_b = 0 or v_m = 0 then raise exception 'El corte no tiene buenos y malos con perfil'; end if;

  with base as (
    select co.malo, cv.id as var, cv.tipo, co.variables -> cv.id as v
      from lab_corte_operaciones co cross join lab_catalogo_variables cv
     where co.corte_id = p_corte and co.incluida and co.primera_de_la_persona and co.variables is not null and cv.activa
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
  ), conbin as (
    select *, case
        when txt is null then 'sin dato'
        when not en_cuartiles and (tipo <> 'numero' or distintos <= 6) then txt
        when not en_cuartiles then '0'
        else 'c' || ntile(4) over (partition by var, en_cuartiles order by num) end as bin
      from marcado
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
             'tramo', case when bin like 'c%' then case when desde = hasta then desde::text else desde::text || ' a ' || hasta::text end else bin end,
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
    'es_sintetico', v_corte.es_sintetico, 'personas', v_b + v_m, 'buenos', v_b, 'malos', v_m,
    'advertencias', to_jsonb(array_remove(array[
        case when v_m < 100 then 'Menos de 100 malos: el IV por variable es ruido; sirve para orientar, no para proponer.' end,
        case when v_corte.es_sintetico then 'Corte sintético: tiene que encontrar las variables de la regla plantada.' end
      ], null)),
    'variables', v_res);

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'variables',
          jsonb_build_object('version', 1, 'iv', 'WoE con suavizado 0,5; cuartiles; tramo propio para el cero si es 10% o más; una operación por persona',
                             'umbrales', jsonb_build_object('nada', 0.02, 'debil', 0.1, 'media', 0.3, 'sospecha_de_fuga', 0.5)),
          v_res, (v_b + v_m)::integer, v_m::integer, auth.uid());
  return v_res;
end;
$$;

-- --------------------------------------------------- simulación de política
-- Una regla como dato, contra el motor vigente sobre el mismo corte, sin
-- llamar al modelo:
--   {"nombre": "...", "condiciones": [{"variable": "deuda_en_atraso", "op": ">", "valor": 2000}], "entonces": "negar"}
-- Las condiciones se cumplen todas a la vez. Aprobado por el motor = aprobar
-- o revisar (decisión del negocio).
create or replace function lab_simular_politica(p_corte uuid, p_regla jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_corte lab_cortes;
  v_res   jsonb;
  v_mal   text;
begin
  select * into v_corte from lab_cortes where id = p_corte;
  if not found then raise exception 'No existe el corte'; end if;
  if coalesce(p_regla ->> 'entonces', '') <> 'negar' then raise exception 'Por ahora una regla sólo puede negar'; end if;
  if jsonb_array_length(coalesce(p_regla -> 'condiciones', '[]'::jsonb)) = 0 then raise exception 'La regla no tiene condiciones'; end if;
  select string_agg(c ->> 'variable', ', ') into v_mal
    from jsonb_array_elements(p_regla -> 'condiciones') c
   where not exists (select 1 from lab_catalogo_variables cv where cv.id = c ->> 'variable')
      or (c ->> 'op') not in ('>', '>=', '<', '<=', '=', '!=');
  if v_mal is not null then raise exception 'Condición inválida (variable u operador): %', v_mal; end if;

  with ops as (
    select * from lab_corte_operaciones
     where corte_id = p_corte and incluida and puntaje is not null and recomendacion in ('aprobar', 'revisar', 'negar')
  ), cond as (
    select c ->> 'variable' as var, c ->> 'op' as op, c -> 'valor' as val from jsonb_array_elements(p_regla -> 'condiciones') c
  ), eval as (
    select o.operacion_id, bool_and(
      case
        when jsonb_typeof(o.variables -> cond.var) = 'number' and jsonb_typeof(cond.val) = 'number' then
          case cond.op
            when '>' then (o.variables ->> cond.var)::numeric > (cond.val #>> '{}')::numeric
            when '>=' then (o.variables ->> cond.var)::numeric >= (cond.val #>> '{}')::numeric
            when '<' then (o.variables ->> cond.var)::numeric < (cond.val #>> '{}')::numeric
            when '<=' then (o.variables ->> cond.var)::numeric <= (cond.val #>> '{}')::numeric
            when '=' then (o.variables ->> cond.var)::numeric = (cond.val #>> '{}')::numeric
            when '!=' then (o.variables ->> cond.var)::numeric <> (cond.val #>> '{}')::numeric
          end
        when cond.op = '=' then (o.variables ->> cond.var) = (cond.val #>> '{}')
        when cond.op = '!=' then (o.variables ->> cond.var) is distinct from (cond.val #>> '{}')
        else false
      end) as cumple
      from ops o cross join cond group by o.operacion_id
  ), j as (
    select o.*, coalesce(e.cumple, false) as cumple, o.recomendacion in ('aprobar', 'revisar') as aprobado
      from ops o left join eval e using (operacion_id)
  )
  select jsonb_build_object(
    'es_sintetico', v_corte.es_sintetico,
    'regla', p_regla,
    'operaciones', count(*),
    'aprobados_antes', count(*) filter (where aprobado),
    'malos_aprobados_antes', count(*) filter (where aprobado and malo),
    'tasa_malos_aprobados_antes', round((count(*) filter (where aprobado and malo))::numeric / nullif(count(*) filter (where aprobado), 0), 4),
    'pasan_a_negar', count(*) filter (where aprobado and cumple),
    'malos_evitados', count(*) filter (where aprobado and cumple and malo),
    'buenos_perdidos', count(*) filter (where aprobado and cumple and not malo),
    'aprobados_despues', count(*) filter (where aprobado and not cumple),
    'malos_aprobados_despues', count(*) filter (where aprobado and not cumple and malo),
    'tasa_malos_aprobados_despues', round((count(*) filter (where aprobado and not cumple and malo))::numeric / nullif(count(*) filter (where aprobado and not cumple), 0), 4),
    'negados_que_ya_cumplian', count(*) filter (where not aprobado and cumple)
  ) into v_res from j;

  insert into lab_resultados (corte_id, tipo, metodologia, resultado, n, n_malos, calculado_por)
  values (p_corte, 'simulacion_politica', jsonb_build_object('version', 1, 'aprobado', 'aprobar o revisar'), v_res,
          (v_res ->> 'operaciones')::integer, (v_res ->> 'malos_aprobados_antes')::integer, auth.uid());
  return v_res;
end;
$$;

-- --------------------------------------------------------- estabilidad
-- PSI del puntaje entre dos cortes, en tramos de 100: si la población
-- cambió, el modelo puede estar midiendo otra cosa. Menos de 0,1 estable;
-- 0,1 a 0,25 cambio moderado; más de 0,25 cambio grande.
create or replace function lab_estabilidad(p_base uuid, p_nuevo uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_res jsonb;
begin
  with t as (
    select corte_id, least(floor(puntaje / 100.0) * 100, 900)::int as tramo, count(*) as n
      from lab_corte_operaciones
     where corte_id in (p_base, p_nuevo) and incluida and puntaje is not null
     group by 1, 2
  ), totales as (select corte_id, sum(n) as total from t group by 1),
  pares as (
    select g.tramo,
           (coalesce((select n from t where corte_id = p_base and tramo = g.tramo), 0) + 0.5) / ((select total from totales where corte_id = p_base) + 5.0) as pb,
           (coalesce((select n from t where corte_id = p_nuevo and tramo = g.tramo), 0) + 0.5) / ((select total from totales where corte_id = p_nuevo) + 5.0) as pn
      from generate_series(0, 900, 100) g(tramo)
  )
  select jsonb_build_object('psi', round(sum((pn - pb) * ln(pn / pb)), 4),
                            'tramos', jsonb_agg(jsonb_build_object('desde', tramo, 'base', round(pb, 4), 'nuevo', round(pn, 4)) order by tramo))
    into v_res from pares;
  insert into lab_resultados (corte_id, tipo, metodologia, resultado, calculado_por)
  values (p_nuevo, 'estabilidad', jsonb_build_object('version', 1, 'base', p_base, 'tramos', 'de a 100 puntos', 'suavizado', 0.5), v_res, auth.uid());
  return v_res;
end;
$$;
