-- Laboratorio: lo que el archivo de la institución trae de nuevo (decisión 5
-- del negocio, 2026-10-03; docs/laboratorio-pantallas.md).
--
--  - La fecha del primer impago, obligatoria para la operación que cayó: sin
--    ella no hay cosechas (default acumulado por mes desde el desembolso) ni
--    curvas de supervivencia, y "cayó en el mes 3" y "cayó en el mes 11" se
--    leen igual.
--  - El canal de venta, opcional, para el desempeño por segmento.
--  - Lo que la institución decidió con cada solicitud que no desembolsó. El
--    archivo sólo traía lo desembolsado, así que un "revisar" negado por el
--    área de crédito y uno que desistió eran indistinguibles de un "revisar"
--    que nadie miró.

alter table lab_operaciones add column canal text;

-- Cayó: 90 días o más en alguna ventana, o castigada o en demanda. NOT VALID:
-- rige para lo que entra desde ahora; las cargas anteriores no se tocan (la
-- cartera sintética la cumple igual).
alter table lab_operaciones add constraint lab_operaciones_fecha_del_impago check (
  not ((coalesce(dias_mora_max_12m, 0) >= 90 or coalesce(dias_mora_max_24m, 0) >= 90 or estado_operacion in ('castigada', 'judicial'))
       and fecha_primer_default is null)
) not valid;

create table lab_decisiones_institucion (
  id               uuid primary key default gen_random_uuid(),
  carga_id         uuid not null references lab_cargas(id) on delete cascade,
  cedula           text not null check (cedula ~ '^[0-9]{10}$'),
  fecha_solicitud  date not null,
  decision         text not null check (decision in ('negada', 'desistio', 'en_tramite')),
  observaciones    text,
  unique (carga_id, cedula, fecha_solicitud)
);
create index lab_decisiones_institucion_carga_idx on lab_decisiones_institucion (carga_id);

alter table lab_decisiones_institucion enable row level security;
create policy lab_decisiones_institucion_admin on lab_decisiones_institucion for all
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));

-- Lo que decidió la institución, en la solicitud: lo pone el armado de las
-- solicitudes de una corrida real (desembolsada si está en el archivo; si
-- no, lo que diga lab_decisiones_institucion, o null si no lo informó).
alter table lab_solicitudes add column decision_institucion text
  check (decision_institucion in ('desembolsada', 'negada', 'desistio', 'en_tramite'));
