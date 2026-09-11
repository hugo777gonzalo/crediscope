-- marco-v9 (ver supabase/functions/_shared/marco-interpretativo.ts):
-- auditoría sobre 10 clientes nuevos (buró de crédito rico, IESS rico,
-- listas negras, homónimos), a pedido del usuario. 1 bug de bloqueo
-- duro corregido + 3 campos nuevos:
--   - BUG: homonimosOpr/tconsephomonimos ya NO cuentan como bloqueantes
--     en controles-bloqueo.ts (eran otra persona con el mismo nombre,
--     cédula distinta — nunca el cliente consultado). No requiere fila
--     de configuración nueva (no es un campo del StandardClientProfile,
--     es lógica del control de bloqueo).
--   - cumplimiento.tieneHomonimoEnListaControl (nuevo, informativo).
--   - cumplimiento.detallePep (nuevo — cargo/empresa/sueldo/fecha del
--     registro PEP más reciente).
--   - comportamientoBancario.saldoEnMoraBuroCredito (nuevo — saldoVigente
--     no incluye lo que está en mora, son campos separados en Novadata).
--   - comportamientoCooperativas.saldoEnMora (nuevo, mismo motivo).
--   - laboral.numeroEmpleadoresUltimos24Meses: redefinido (empleadores
--     ACTIVOS en los últimos 24 meses, no solo los que iniciaron en ese
--     período) — mismo campo, no requiere cambio de configuración.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v9', 'Homonimos ya no bloquean (bug), agrega detallePep, saldoEnMoraBuroCredito/saldoEnMora, redefine numeroEmpleadoresUltimos24Meses', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version = 'marco-v8';

-- ---------- standard_profile_field_config ----------

insert into standard_profile_field_config (grupo, campo) values
  ('cumplimiento', 'tieneHomonimoEnListaControl'),
  ('cumplimiento', 'detallePep'),
  ('comportamientoBancario', 'saldoEnMoraBuroCredito'),
  ('comportamientoCooperativas', 'saldoEnMora');
