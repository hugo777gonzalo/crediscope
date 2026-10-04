-- Laboratorio, fase E (docs/laboratorio-pantallas.md): el registro de
-- variables candidatas y el taller de variables.
--
-- Una candidata es un dato que el Laboratorio encontró y que todavía no
-- entra al motor: un campo del crudo que la estructura no lee (explorador
-- del crudo), una variable del perfil que el modelo no recibe (explorador de
-- significancia) o una variable derivada con su fórmula (taller). Pasa por
-- descubierta → en revisión → experimental → aceptada o rechazada; nunca se
-- borra (rechazada queda, con su motivo, para no volver a probarla igual).
-- Cuando se acepta, se engancha con una propuesta de tipo "dato nuevo".
--
-- disponible_desde: desde cuándo existe el dato. Una variable que no se
-- tenía el día de la decisión no puede explicar esa decisión: es la fuga de
-- información con otro nombre.

create table lab_variables_candidatas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  definicion        text not null,
  origen            text not null check (origen in ('crudo', 'taller', 'catalogo')),
  formula           text,
  ruta_crudo        text,
  derivacion        text,
  variable_catalogo text references lab_catalogo_variables(id),
  fuente            text,
  disponible_desde  date,
  estado            text not null default 'descubierta'
                      check (estado in ('descubierta', 'en_revision', 'experimental', 'aceptada', 'rechazada')),
  evidencia         jsonb not null default '{}'::jsonb,
  corte_id          uuid references lab_cortes(id) on delete set null,
  propuesta_id      uuid references lab_propuestas(id) on delete set null,
  notas             text,
  historial         jsonb not null default '[]'::jsonb,
  creada_por        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  actualizada_en    timestamptz not null default now(),
  check (origen <> 'taller' or formula is not null),
  check (origen <> 'crudo' or ruta_crudo is not null),
  check (origen <> 'catalogo' or variable_catalogo is not null)
);

-- Cada cambio de estado queda en el historial, con quién y cuándo.
create or replace function lab_candidata_historial()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.actualizada_en := now();
  if new.estado is distinct from old.estado then
    new.historial := old.historial || jsonb_build_object('de', old.estado, 'a', new.estado, 'cuando', now(), 'quien', auth.uid());
  end if;
  return new;
end;
$$;

create trigger lab_candidata_historial
  before update on lab_variables_candidatas
  for each row execute function lab_candidata_historial();

alter table lab_variables_candidatas enable row level security;
create policy lab_candidatas_lectura on lab_variables_candidatas for select
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_candidatas_alta on lab_variables_candidatas for insert
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
create policy lab_candidatas_cambio on lab_variables_candidatas for update
  using (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and rol = 'admin'));
-- Sin política de borrado: una candidata se rechaza, no se borra.
