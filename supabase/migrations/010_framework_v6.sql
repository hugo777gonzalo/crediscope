-- framework-v6 (ver supabase/functions/_shared/interpretive-framework.ts):
-- nuevo campo patrimonio.valorColateralVehiculos (auditoría pedida por
-- el usuario sobre los distintos precios de vehículo que da Novadata,
-- para el tema de colaterales) — suma, por vehículo, el máximo entre
-- valorAvaluo/precioPromedio/precioMinimo/precioMaximo/precioComercial/
-- precioVentaPublico/precioVentaPromedio (NO precioVenta).

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('framework-v6', 'Nuevo campo valorColateralVehiculos: maximo de precio por vehiculo, mas cercano a mercado actual que valorAvaluo', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version in ('framework-v0', 'framework-v1', 'framework-v2', 'framework-v3', 'framework-v4', 'framework-v5');

insert into standard_profile_field_config (grupo, campo) values
  ('patrimonio', 'valorColateralVehiculos');
