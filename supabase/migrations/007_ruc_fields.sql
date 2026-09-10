-- Fix de laboral.tieneRucActivo (ver process.ts) + 3 campos nuevos de
-- auditoría del registro RUC (fechaInicioActividadesRuc,
-- fechaCeseActividadesRuc, fechaReinicioActividadesRuc). Se registran
-- en standard_profile_field_config para que sean administrables desde
-- /admin/configuracion igual que el resto de campos del StandardClientProfile.

insert into standard_profile_field_config (grupo, campo) values
  ('laboral', 'fechaInicioActividadesRuc'),
  ('laboral', 'fechaCeseActividadesRuc'),
  ('laboral', 'fechaReinicioActividadesRuc');
