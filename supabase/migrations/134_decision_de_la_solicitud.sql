-- ============================================================
-- La decisión de la institución sobre una solicitud, y lo que hace falta
-- para calcular el estado de la persona.
--
-- Decisiones del negocio del 2026-10-18 (docs/modelo-de-la-persona.md, 5):
--   - la decisión (Aprobado / Rechazado / Desistió) la marca el analista en
--     la solicitud, con su motivo. No la calcula el modelo ni una regla;
--   - quien fue rechazado o desistió queda «No aprobado», un estado propio;
--   - el estado de la persona se calcula desde los hechos, no se escribe a
--     mano (_shared/estado-de-la-persona.ts). Por eso acá no hay columna de
--     estado de la persona: sólo los hechos que lo deciden.
--
-- Vale la última decisión y todas quedan en `decisiones`, como promete el
-- contrato para la IFI (POST /evaluaciones/{id}/decision: «se puede informar
-- más de una vez; vale la última y todas quedan registradas»). Van en la misma
-- fila y no en una tabla aparte: así la supresión del titular, los derechos
-- del titular y el control de seguridad ya las cubren (133).
--
-- La escribe sólo decidir_solicitud(), desde la función evaluar-solicitud con
-- la clave de servicio: agrega al historial y cambia la vigente en una sola
-- sentencia, para que dos analistas a la vez no pisen una decisión.
-- ============================================================

alter table solicitudes
  add column decision          text check (decision is null or decision in ('aprobado', 'rechazado', 'desistido')),
  add column decision_motivo   text,
  add column decidida_por      uuid references profiles(id),
  add column decidida_el       timestamptz,
  -- Cada elemento: { decision, motivo, decididaPor, decididaEl }.
  add column decisiones        jsonb not null default '[]'::jsonb,
  -- Cuándo terminó la evaluación: desde ahí la persona puede estar Preaprobada.
  -- actualizada_el no sirve, porque la mueve cualquier cambio de la fila.
  add column evaluada_el       timestamptz;

update solicitudes set evaluada_el = actualizada_el where estado = 'evaluada' and evaluada_el is null;

comment on column solicitudes.decision is
  'Lo que decidió la institución (134): la marca el analista. No es la recomendación del modelo (aprobar / revisar / negar).';
comment on column solicitudes.decisiones is
  'Todas las decisiones informadas, la vigente al final (134).';

create index solicitudes_decidida_idx on solicitudes (decidida_el desc) where decidida_el is not null;

create or replace function public.decidir_solicitud(p_id uuid, p_decision text, p_motivo text, p_actor uuid)
 returns setof solicitudes
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_ahora timestamptz := now();
begin
  if p_decision not in ('aprobado', 'rechazado', 'desistido') then
    raise exception 'La decisión es aprobado, rechazado o desistido.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Falta el motivo de la decisión.';
  end if;
  return query
    update solicitudes
       set decision = p_decision,
           decision_motivo = trim(p_motivo),
           decidida_por = p_actor,
           decidida_el = v_ahora,
           decisiones = decisiones || jsonb_build_array(jsonb_build_object(
             'decision', p_decision, 'motivo', trim(p_motivo), 'decididaPor', p_actor, 'decididaEl', v_ahora))
     where id = p_id
       -- Aprobar o rechazar, sólo con la evaluación terminada; desistir, en cualquier momento.
       and (p_decision = 'desistido' or estado = 'evaluada')
    returning *;
end;
$function$;

revoke all on function public.decidir_solicitud(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.decidir_solicitud(uuid, text, text, uuid) to service_role;
