-- Fix de laboral.tieneRucActivo (ver process.ts) + campos nuevos de
-- auditoría del registro RUC y de establecimientos (estado_establecimiento
-- es DISTINTO del estado del RUC — ver types.ts). Se registran en
-- standard_profile_field_config para que sean administrables desde
-- /admin/configuracion igual que el resto de campos del StandardClientProfile.

insert into standard_profile_field_config (grupo, campo) values
  ('laboral', 'fechaInicioActividadesRuc'),
  ('laboral', 'fechaCeseActividadesRuc'),
  ('laboral', 'fechaReinicioActividadesRuc'),
  ('laboral', 'numeroEstablecimientosActivos'),
  ('laboral', 'numeroEstablecimientosInactivos'),
  ('laboral', 'tieneEstablecimientosRegistrados');
