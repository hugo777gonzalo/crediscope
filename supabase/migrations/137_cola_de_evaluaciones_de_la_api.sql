-- ============================================================
-- La cola de las evaluaciones que llegan por la API (Fase 1, núcleo).
--
-- ATENCIÓN AL APLICAR: este archivo lleva marcadores (<<PROYECTO_URL>>,
-- <<VIGIA_CLAVE>>) en la tarea programada del final. El corredor
-- (`node scripts/migrar-clientes.mjs`) los rellena desde el archivo de
-- secretos de cada base. El número 137 es el libre al escribirla (2026-10-21):
-- se toma al aplicarla, y si otra migración entró antes se renumera junto con
-- ESQUEMA_MINIMO (regla dura 1 de CLAUDE.md).
--
-- QUÉ ES
--
-- Una evaluación de la API es una fila de `solicitudes`: los mismos pasos, los
-- mismos módulos y la misma tabla que usa la pantalla del analista
-- (docs/cumplimiento/api/propuesta-api-ifi.md, 5.6: la cola es la tabla, con el
-- mismo reclamo del lote). Se diferencia por `origen = 'api'`. Lo que se suma es
-- lo que la pantalla no necesita porque ahí el analista vuelve a llamar hasta
-- que termina; en la API quien hace avanzar es un trabajador y la institución
-- sólo pregunta:
--
--   - la clave de idempotencia y la huella del pedido, para que repetir un
--     pedido (un corte de red) no consulte ni cobre dos veces;
--   - el plazo (15 minutos si es interactiva, 24 horas si es diferida);
--   - el reclamo: quién la está trabajando y hasta cuándo, para que dos
--     trabajadores no corran el mismo paso (un paso del buró se cobra);
--   - el próximo intento y los intentos del paso en curso, para reintentar con
--     espera creciente en vez de devolverle la falla a la institución;
--   - el código del fallo final y cuándo terminó.
--
-- Todo es opcional para la pantalla: sus filas son 'pantalla' y no usan nada de
-- esto. No cambia suprimir_titular(): las columnas nuevas están en la misma
-- fila, que la supresión ya borra por la identificación.
-- ============================================================

alter table solicitudes
  add column origen              text not null default 'pantalla' check (origen in ('pantalla', 'api')),
  -- Una base por institución: la clave es única en la base, no por institución.
  add column clave_idempotencia  text check (clave_idempotencia is null or length(clave_idempotencia) between 8 and 255),
  -- SHA-256 del pedido canónico. La misma clave con otro cuerpo es un error de
  -- la institución (409), no un reintento.
  add column huella_del_pedido   text check (huella_del_pedido is null or huella_del_pedido ~ '^sha256:[0-9a-f]{64}$'),
  add column plazo_hasta         timestamptz,
  add column reclamada_hasta     timestamptz,
  add column proximo_intento_el  timestamptz,
  add column intentos            integer not null default 0 check (intentos >= 0),
  add column fallo_codigo        text check (fallo_codigo is null or fallo_codigo in (
                                   'plazo_vencido', 'fuentes_no_disponibles', 'buro_requiere_consulta_previa',
                                   'tope_diario_agotado', 'buro_no_disponible', 'identificacion_no_encontrada', 'error_interno')),
  add column terminada_el        timestamptz,
  -- Lo que la especificación llama `destino` y `garantia` del crédito pedido.
  -- Texto libre de la institución: se guarda con el resto de la solicitud y lo
  -- borra la supresión del titular junto con la fila.
  add column destino             text check (destino is null or length(destino) <= 200),
  add column garantia            text check (garantia is null or length(garantia) <= 200);

comment on column solicitudes.origen is
  'pantalla = la evalúa un analista paso a paso (evaluar-solicitud); api = la hace avanzar el trabajador procesar-evaluaciones (137).';
comment on column solicitudes.reclamada_hasta is
  'El trabajador la tiene reclamada hasta esta hora. Si se corta a la mitad, el reclamo vence solo y otro la retoma; el paso que dejó en curso se da por caído a los 3 minutos (modalidades.ts).';
comment on column solicitudes.proximo_intento_el is
  'Un paso que falló por algo pasajero no se vuelve a tomar antes de esta hora (cola-de-evaluaciones.ts).';

create unique index solicitudes_clave_idempotencia_idx on solicitudes (clave_idempotencia) where clave_idempotencia is not null;
-- Lo que mira el trabajador cada minuto: las evaluaciones de la API que siguen en curso.
create index solicitudes_cola_idx on solicitudes (proximo_intento_el nulls first, creada_el) where origen = 'api' and estado = 'en_evaluacion';

-- ---------- La referencia se repite en un reemplazo ----------
-- La 135 hizo única la referencia de la institución. Pero pedir de nuevo el
-- análisis de una evaluación (`reemplazaA`) es volver a mandar la MISMA
-- referencia: la especificación dice que tras un reanálisis hay varias
-- evaluaciones con esa referencia. Con el índice de antes, el 409 que dice «usá
-- reemplazaA» volvía a chocar al usarlo. La referencia sigue siendo única entre
-- las evaluaciones que no reemplazan a otra.
drop index if exists solicitudes_referencia_idx;
create unique index solicitudes_referencia_idx on solicitudes (referencia) where referencia is not null and reemplaza_a is null;

-- ---------- Equifax: la consulta puede venir de la API ----------
-- La modalidad Plus consulta el buró de la institución si la persona no tiene
-- una consulta vigente (negocio, 2026-10-21), y esa consulta se cobra. Queda
-- marcada con su origen para poder contarla aparte.
alter table consultas_equifax drop constraint consultas_equifax_origen_check;
alter table consultas_equifax add constraint consultas_equifax_origen_check check (origen in ('consulta', 'lote', 'api'));

-- ---------- El reclamo ----------
-- Toma hasta p_max evaluaciones listas y las deja reclamadas por p_segundos.
-- Devuelve las filas que devolvió la actualización (CLAUDE.md): con dos
-- trabajadores a la vez, cada uno recibe sólo las suyas.
--
-- p_tope_en_vuelo: cuántas puede haber reclamadas a la vez en toda la cola. La
-- capacidad de Novadata está medida (docs/propuesta-api-ifi.md, 2.2): con 24
-- consultas en paralelo la mediana se duplicó y el 28% necesitó reintento; con
-- 8 va más rápido y sin fallas. El candado asesor hace que dos reclamos no lean
-- el mismo conteo y se pasen del tope.
--
-- Primero las interactivas (la persona espera en la ventanilla) y, entre iguales,
-- la más antigua.
create or replace function public.reclamar_evaluaciones(p_max integer default 4, p_tope_en_vuelo integer default 8, p_segundos integer default 180)
 returns setof public.solicitudes
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_en_vuelo integer;
  v_cupo integer;
begin
  perform pg_advisory_xact_lock(hashtext('reclamar_evaluaciones'));

  select count(*) into v_en_vuelo
    from solicitudes
   where origen = 'api' and estado = 'en_evaluacion' and reclamada_hasta > now();
  v_cupo := least(p_max, p_tope_en_vuelo - v_en_vuelo);
  if v_cupo <= 0 then
    return;
  end if;

  return query
  with elegidas as (
    select id
      from solicitudes
     where origen = 'api'
       and estado = 'en_evaluacion'
       and (reclamada_hasta is null or reclamada_hasta <= now())
       and (proximo_intento_el is null or proximo_intento_el <= now())
       -- Quien desistió no sigue: los pasos que faltan pueden consultar fuentes o cobrarse.
       and decision is distinct from 'desistido'
     order by (coalesce(prioridad, 'interactiva') = 'diferida'), creada_el
       for update skip locked
     limit v_cupo
  )
  update solicitudes s
     set reclamada_hasta = now() + make_interval(secs => p_segundos),
         actualizada_el = now()
    from elegidas e
   where s.id = e.id
  returning s.*;
end;
$function$;

revoke all on function public.reclamar_evaluaciones(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reclamar_evaluaciones(integer, integer, integer) to service_role;

-- ---------- La agenda ----------
-- Cada minuto, y sólo si hay algo que reclamar (como la 066: preguntar es barato
-- y levantar la función no). El arranque inmediato lo hace la puerta al recibir
-- el pedido y el propio trabajador al terminar un paso; la agenda es la red de
-- seguridad si alguno se corta.
select cron.unschedule('procesar-evaluaciones-crediscope')
 where exists (select 1 from cron.job where jobname = 'procesar-evaluaciones-crediscope');

select cron.schedule(
  'procesar-evaluaciones-crediscope',
  '* * * * *',
  $$
  select net.http_post(
    url := '<<PROYECTO_URL>>/functions/v1/procesar-evaluaciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-vigia-clave', '<<VIGIA_CLAVE>>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
  where exists (
    select 1 from solicitudes
     where origen = 'api'
       and estado = 'en_evaluacion'
       and (reclamada_hasta is null or reclamada_hasta <= now())
       and (proximo_intento_el is null or proximo_intento_el <= now())
       and decision is distinct from 'desistido'
  );
  $$
);
