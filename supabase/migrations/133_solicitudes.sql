-- ============================================================
-- La solicitud de crédito como entidad, y la evaluación por modalidades.
--
-- Hasta acá CrediScope evaluaba personas en abstracto: no había monto,
-- plazo ni producto (docs/arquitectura-fabrica-de-credito.md, «falta la
-- entidad solicitud»; docs/modelo-de-la-persona.md, el árbol de la
-- persona). Paso 3 y 4 del plan de la demo (docs/plan-demo-ifi.md),
-- decididos por el negocio el 2026-10-17:
--
--   - una solicitud se evalúa en una modalidad: Básico (perfil y modelo),
--     Pro (más la cuota y la capacidad de pago) o Plus (más el buró de la
--     institución);
--   - la evaluación la arma el servidor por pasos (la función
--     `evaluar-solicitud`), porque consultar Novadata y el modelo juntos
--     pasa los 150 s que una función puede correr seguidos. Cada paso queda
--     anotado en `pasos`, con su referencia;
--   - la recomendación del modelo y la capacidad de pago se guardan y se
--     muestran por separado: no se combinan en una decisión.
--
-- Lo que decide la institución (Aprobado / Rechazado) todavía no está: el
-- negocio no cerró los estados de la persona (modelo-de-la-persona.md, 5).
--
-- La identificación va en la fila porque la persona puede no existir todavía
-- en `clients`: el primer paso la consulta y la crea. Por eso la supresión
-- del titular borra por las dos columnas (suprimir_titular() se recrea desde
-- su definición viva, con la solicitud sumada al principio).
-- ============================================================

create table solicitudes (
  id                   uuid primary key default gen_random_uuid(),
  identificacion       text not null,
  client_id            uuid references clients(id) on delete set null,
  creada_el            timestamptz not null default now(),
  creada_por           uuid not null references profiles(id),
  actualizada_el       timestamptz not null default now(),
  modalidad            text not null check (modalidad in ('basico', 'pro', 'plus')),
  -- Las condiciones del crédito (Pro y Plus). En Básico van vacías.
  producto             text not null default 'consumo',
  monto                numeric(14, 2) check (monto is null or monto > 0),
  plazo_meses          integer check (plazo_meses is null or plazo_meses between 1 and 480),
  tasa_nominal_anual   numeric(6, 3) check (tasa_nominal_anual is null or tasa_nominal_anual >= 0),
  sistema              text check (sistema is null or sistema in ('frances', 'aleman')),
  desgravamen          jsonb,
  -- Lo que la persona dice que recibe por mes («Ingreso declarado», sin verificar).
  ingreso_declarado    numeric(14, 2) check (ingreso_declarado is null or ingreso_declarado >= 0),
  estado               text not null default 'en_evaluacion'
                         check (estado in ('en_evaluacion', 'evaluada', 'fallida')),
  -- Un elemento por paso: { paso, estado (pendiente | hecho | fallido), el, detalle }.
  pasos                jsonb not null default '[]'::jsonb,
  client_profile_id    uuid references client_profiles(id) on delete set null,
  consulta_equifax_id  uuid references consultas_equifax(id) on delete set null,
  analysis_result_id   uuid references analysis_results(id) on delete set null,
  -- Lo que produjo cada módulo, con sus versiones: el score y la
  -- recomendación del modelo, la simulación y la capacidad de pago. Por
  -- separado, sin combinarlos (decisión del 2026-10-17).
  resultado            jsonb,
  constraint solicitudes_condiciones_completas check (
    modalidad = 'basico'
    or (monto is not null and plazo_meses is not null and tasa_nominal_anual is not null)
  )
);

comment on table solicitudes is
  'Una solicitud de crédito y su evaluación por pasos (133). La escribe sólo la función evaluar-solicitud (clave de servicio); la pantalla lee.';
comment on column solicitudes.identificacion is
  'La cédula de quien pide. Va acá porque la persona puede no estar todavía en clients: el primer paso la consulta y la crea.';

create index solicitudes_client_idx on solicitudes (client_id, creada_el desc) where client_id is not null;
create index solicitudes_identificacion_idx on solicitudes (identificacion, creada_el desc);
create index solicitudes_creada_idx on solicitudes (creada_el desc);

-- ---------- ACCESO ----------
-- Igual que consultas_equifax (122): la pantalla lee con la sesión, escribe
-- sólo la función con la clave de servicio.
alter table solicitudes enable row level security;

create policy solicitudes_lectura on solicitudes for select
  using (exists (select 1 from profiles where id = auth.uid() and rol in ('analista', 'admin')));

revoke all on solicitudes from anon, authenticated;
grant select on solicitudes to authenticated;

-- ---------- SUPRESIÓN DEL TITULAR ----------
-- Desde la definición viva (pg_get_functiondef, 2026-10-17), con la
-- solicitud borrada antes que lo que referencia.
create or replace function public.suprimir_titular(p_cedula text, p_motivo text, p_responsable uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_cliente uuid;
  v_crudos text[];
  v_conteos jsonb := '{}'::jsonb;
  v_n integer;
  v_marca text := 'SUPRIMIDA';
begin
  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Falta el motivo de la supresión (quién la pidió y por qué, al menos 10 caracteres).';
  end if;
  if not exists (select 1 from profiles where id = p_responsable) then
    raise exception 'El responsable tiene que ser un usuario existente.';
  end if;

  select id into v_cliente from clients where cedula = p_cedula;
  if v_cliente is null then
    raise exception 'No hay ningún registro de esa cédula.';
  end if;

  select coalesce(array_agg(crudo_ruta) filter (where crudo_ruta is not null), '{}')
    into v_crudos from client_profiles where client_id = v_cliente;

  delete from solicitudes where client_id = v_cliente or identificacion = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('solicitudes', v_n);

  delete from analysis_results where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('analisis', v_n);

  delete from client_profiles where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('perfiles', v_n);

  delete from consultas_aval where client_id = v_cliente or identificacion = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('consultas_aval', v_n);

  delete from consultas_equifax where client_id = v_cliente or identificacion = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('consultas_equifax', v_n);

  delete from ingestion_runs where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('corridas_de_ingesta', v_n);

  update llm_llamadas set client_id = null where client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('llamadas_al_modelo_desvinculadas', v_n);

  update lote_items set cedula = v_marca where cedula = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('items_de_lote', v_n);

  update lab_solicitudes set cedula = v_marca, client_id = null where cedula = p_cedula or client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_solicitudes', v_n);

  update lab_operaciones set cedula = v_marca, client_id = null where cedula = p_cedula or client_id = v_cliente;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_operaciones', v_n);

  update lab_corte_solicitudes set cedula = v_marca where cedula = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_corte_solicitudes', v_n);

  update lab_corte_operaciones set cedula = v_marca, client_profile_id = null, analysis_result_id = null where cedula = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_corte_operaciones', v_n);

  update lab_decisiones_institucion set cedula = v_marca where cedula = p_cedula;
  get diagnostics v_n = row_count; v_conteos := v_conteos || jsonb_build_object('lab_decisiones_institucion', v_n);

  v_conteos := v_conteos || jsonb_build_object('crudos_a_borrar', coalesce(array_length(v_crudos, 1), 0));

  insert into audit_log (actor, action, client_id, meta)
  values (p_responsable, 'titular.supresion', v_cliente,
          jsonb_build_object('motivo', trim(p_motivo), 'conteos', v_conteos));

  return jsonb_build_object('client_id', v_cliente, 'crudos', to_jsonb(v_crudos), 'conteos', v_conteos);
end;
$function$;
