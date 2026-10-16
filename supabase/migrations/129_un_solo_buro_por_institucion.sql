-- ============================================================
-- Un solo buró por institución, y el reporte de Equifax en la auditoría.
--
-- Decisión del negocio del 2026-10-13 (cuestionario, A2 y F1): cada IFI
-- trabaja con UN buró -- Equifax o Aval, no los dos ni en orden --, y cada
-- uno tiene su propia pestaña. Hasta acá `proveedores.activo` decía sólo
-- si una fuente de datos se puede consultar, y en esta base estaban las
-- tres prendidas (Novadata, Aval y Equifax): no había forma de saber cuál
-- era el buró de la institución. `es_buro` lo dice, y como cada
-- institución tiene su propia base (clientes/directorio.json), es una
-- propiedad de la base. El selector se llama «Buró» (negocio, 2026-10-16).
--
-- `activo` no cambia de significado: elegir el buró no prende ni apaga
-- ninguna consulta.
--
-- El reporte en PDF de la pestaña Equifax (negocio, 2026-10-16) es una
-- exportación de datos de una persona: queda en `audit_log` como las demás
-- (exportacion.reporte_equifax). registrar_evento() se recrea desde su
-- definición viva (pg_get_functiondef), con la acción nueva al final.
-- ============================================================

alter table proveedores
  add column es_buro boolean not null default false;

comment on column proveedores.es_buro is
  'El buró de la institución (A2 del cuestionario, 2026-10-13: uno solo por IFI). A lo sumo una fila en true, y sólo Aval o Equifax. No prende ni apaga consultas: eso es `activo`.';

alter table proveedores
  add constraint proveedores_es_buro_solo_un_buro
  check (not es_buro or clave in ('aval', 'equifax'));

-- Un índice único parcial: dos filas en true no pueden convivir. Por eso el
-- cambio de buró pasa por elegir_buro(), que primero apaga y después prende
-- en dos sentencias (un único UPDATE que intercambia los valores choca con el
-- índice a mitad de camino).
create unique index proveedores_un_solo_buro on proveedores (es_buro) where es_buro;

-- Esta base trabaja con Equifax desde el 2026-10-12 (62 consultas al
-- 2026-10-16); Aval sólo tiene consultas del ambiente de prueba.
update proveedores set es_buro = true where clave = 'equifax';

-- Elige el buró de la institución, o ninguno (p_clave null). security
-- invoker: la política proveedores_update (sólo admin) decide quién puede;
-- si no actualizó ninguna fila, es que no tenía permiso, y se dice (una
-- actualización bloqueada por RLS devuelve 0 filas, no un error).
create or replace function elegir_buro(p_clave text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_filas integer;
begin
  if p_clave is not null and p_clave not in ('aval', 'equifax') then
    raise exception 'Sólo Aval o Equifax pueden ser el buró: %', p_clave;
  end if;

  update proveedores set es_buro = false where es_buro;

  if p_clave is null then
    return null;
  end if;

  update proveedores set es_buro = true where clave = p_clave;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'No se pudo elegir el buró: sólo la administración puede cambiarlo';
  end if;
  return p_clave;
end;
$$;

revoke all on function elegir_buro(text) from public, anon;
grant execute on function elegir_buro(text) to authenticated;

CREATE OR REPLACE FUNCTION public.registrar_evento(p_accion text, p_client_id uuid DEFAULT NULL::uuid, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión no se registra nada';
  end if;
  if p_accion not in ('expediente.vista', 'exportacion.solicitudes', 'exportacion.lote',
                      'exportacion.informe_laboratorio', 'exportacion.conciliacion',
                      'exportacion.reporte_equifax') then
    raise exception 'Acción no registrable: %', p_accion;
  end if;
  insert into audit_log (actor, action, client_id, meta)
  values (auth.uid(), p_accion, p_client_id, coalesce(p_meta, '{}'::jsonb));
end;
$function$;
