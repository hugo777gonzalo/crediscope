-- Configuración de visibilidad de segmentos en la vista "Perfil del
-- Cliente" (nombre comercial de la Estructura Estandarizada) — capa
-- nueva y separada de standard_profile_field_config, que controla si
-- un campo se CALCULA (afecta datos/LLM). Esta controla si un SEGMENTO
-- completo se MUESTRA en la UI del analista, sin afectar el análisis
-- ni la ingesta. Surgió de la fase de diseño de "Perfil del Cliente":
-- el usuario pidió no mostrar campos en cero (ej. patrimonio de un
-- cliente sin vehículos) y sacar "Estado por bloque" de la vista.
--
-- modo:
--   'con_datos' -> se muestra solo si el segmento tiene al menos un
--     dato relevante.
--   'siempre'   -> se muestra aunque esté vacío (ej. Cumplimiento: "sin
--     coincidencias en listas de control" es información en sí misma).
--   'nunca'     -> nunca se muestra en la UI del analista (resuelve el
--     pedido de sacar "Estado por bloque" sin borrar el dato — sigue
--     en la BDD para auditoría).
--
-- El catálogo de segmentos es fijo (viene de ORDEN_GRUPOS en
-- classify.ts), por eso solo se permite UPDATE de modo/motivo, no
-- INSERT/DELETE desde la app — mismo criterio que
-- novadata_resource_config/standard_profile_field_config.

create table standard_profile_segment_config (
  grupo       text primary key,
  modo        text not null default 'con_datos' check (modo in ('con_datos', 'siempre', 'nunca')),
  motivo      text,
  updated_at  timestamptz not null default now()
);

alter table standard_profile_segment_config enable row level security;

create policy standard_profile_segment_config_read on standard_profile_segment_config for select
  using (auth.role() = 'authenticated');
create policy standard_profile_segment_config_update on standard_profile_segment_config for update
  using (auth.role() = 'authenticated');

-- ---------- Seed: 17 segmentos (16 grupos + metaConsulta) ----------

insert into standard_profile_segment_config (grupo, modo) values
  ('cumplimiento', 'siempre'),
  ('riesgoSeguridadCiudadana', 'siempre'),
  ('comportamientoBancario', 'siempre'),
  ('riesgoPenal', 'siempre'),
  ('laboral', 'siempre'),
  ('comportamientoCooperativas', 'con_datos'),
  ('riesgoJudicialCrediticio', 'con_datos'),
  ('riesgoJudicialCivil', 'con_datos'),
  ('patrimonio', 'con_datos'),
  ('transitoVehicular', 'con_datos'),
  ('comportamientoInterno', 'con_datos'),
  ('seguridadSocial', 'con_datos'),
  ('tributario', 'con_datos'),
  ('familia', 'con_datos'),
  ('contacto', 'con_datos'),
  ('identidad', 'con_datos'),
  ('metaConsulta', 'nunca');
