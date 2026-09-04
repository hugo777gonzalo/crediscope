-- ============================================================
-- CrediScope — capas de parametrización operativa:
--
-- A. novadata_resource_config: activar/desactivar recursos individuales
--    de ingesta (las fuentes son sistemas públicos/externos que pueden
--    fallar, deshabilitarse o tener controles de acceso cambiantes).
-- B. standard_profile_field_config: activar/desactivar campos de la
--    Estructura Estandarizada (algunos pueden reportar datos
--    inconsistentes mientras se investiga la causa raíz).
--
-- Un recurso/campo deshabilitado NO se borra del catálogo — se marca
-- enabled=false y se ignora en tiempo de consulta (ver
-- _shared/runtime-config.ts). El catálogo es fijo (viene del código:
-- novadata-client.ts y types.ts), por eso solo se permite UPDATE de
-- enabled/motivo, no INSERT/DELETE desde la app.
-- ============================================================

create table novadata_resource_config (
  recurso     text primary key,
  bloque      text not null,
  enabled     boolean not null default true,
  motivo      text,
  updated_at  timestamptz not null default now()
);

create table standard_profile_field_config (
  grupo       text not null,
  campo       text not null,
  enabled     boolean not null default true,
  motivo      text,
  updated_at  timestamptz not null default now(),
  primary key (grupo, campo)
);

alter table novadata_resource_config enable row level security;
alter table standard_profile_field_config enable row level security;

-- Cualquier autenticado (analista interno) puede ver y togglear estas
-- configuraciones — no hay un rol "admin" separado todavía en este
-- proyecto (mismo criterio que el resto de la app: equipo interno
-- confiable). Sin policy de insert/delete a propósito: el catálogo de
-- filas lo define el código/las migraciones, la app solo actualiza
-- enabled/motivo de filas existentes.
create policy novadata_resource_config_read on novadata_resource_config for select
  using (auth.role() = 'authenticated');
create policy novadata_resource_config_update on novadata_resource_config for update
  using (auth.role() = 'authenticated');

create policy standard_profile_field_config_read on standard_profile_field_config for select
  using (auth.role() = 'authenticated');
create policy standard_profile_field_config_update on standard_profile_field_config for update
  using (auth.role() = 'authenticated');

-- ---------- Seed: recursos de ingesta (52, ver novadata-client.ts) ----------

insert into novadata_resource_config (recurso, bloque) values
  ('general', 'general'),
  ('direcciones', 'sociodemografica'),
  ('telefonos', 'sociodemografica'),
  ('correo', 'sociodemografica'),
  ('padres', 'sociodemografica'),
  ('hijos', 'sociodemografica'),
  ('titulos', 'sociodemografica'),
  ('bienesInmueble', 'sociodemografica'),
  ('vacunados', 'sociodemografica'),
  ('empleados', 'trabajo'),
  ('trabajoHistoricos', 'trabajo'),
  ('trabajoHistoricosMecanizado', 'trabajo'),
  ('cumplimientoPatronal', 'trabajo'),
  ('administraciones', 'trabajo'),
  ('contribuyente', 'trabajo'),
  ('sriImpuestoRenta', 'trabajo'),
  ('establecimientoActEconomica', 'trabajo'),
  ('afiliacionIess', 'iess'),
  ('afiliacionIsspol', 'iess'),
  ('afiliacionIssfacCertMedico', 'iess'),
  ('afiliacionIssfacFuerzaArmada', 'iess'),
  ('afiliacionSiisspol', 'iess'),
  ('afiliacionSalud', 'iess'),
  ('pensionista', 'iess'),
  ('jubilados', 'iess'),
  ('vehiculos', 'vehiculos'),
  ('licenciaConducir', 'vehiculos'),
  ('siniestros', 'vehiculos'),
  ('polizas', 'vehiculos'),
  ('demandas', 'funcion_judicial'),
  ('demandasOfendido', 'funcion_judicial'),
  ('impedimentoCargosPublicos', 'funcion_judicial'),
  ('pensionAlimenticia', 'funcion_judicial'),
  ('pensionAlimenticiaNovadata', 'funcion_judicial'),
  ('denuncias', 'fiscalia'),
  ('antecedentesPenales', 'fiscalia'),
  ('sercop', 'fiscalia'),
  ('creditoHipotecario', 'bancos'),
  ('creditoQuirografario', 'bancos'),
  ('deudasAnt', 'bancos'),
  ('deudasAmt', 'bancos'),
  ('deudasEmov', 'bancos'),
  ('deudasFirmes', 'bancos'),
  ('deudores', 'bancos'),
  ('centralRiesgoDiners', 'bancos'),
  ('centralRiesgoSuper', 'bancos'),
  ('listasControl', 'bancos'),
  ('listaNegra', 'bancos'),
  ('inversiones', 'bancos'),
  ('retails', 'bancos'),
  ('basesInternas', 'bancos'),
  ('centralRiesgoCoop', 'cooperativas');

-- ---------- Seed: campos de la Estructura Estandarizada (99, ver types.ts) ----------

insert into standard_profile_field_config (grupo, campo) values
  ('identidad', 'nombreCompleto'),
  ('identidad', 'edad'),
  ('identidad', 'genero'),
  ('identidad', 'estadoCivil'),
  ('identidad', 'nivelEducacion'),
  ('identidad', 'profesiones'),
  ('identidad', 'fallecido'),
  ('identidad', 'tieneConyuge'),
  ('identidad', 'cantonNacimiento'),
  ('identidad', 'provinciaNacimiento'),
  ('identidad', 'paisOrigen'),
  ('identidad', 'paisOrigenIso3'),
  ('identidad', 'paisOrigenIso'),
  ('identidad', 'esExtranjero'),
  ('identidad', 'añosCasado'),
  ('identidad', 'edadConyuge'),
  ('contacto', 'numeroDirecciones'),
  ('contacto', 'numeroTelefonos'),
  ('contacto', 'numeroCorreos'),
  ('contacto', 'direccionActualizada12M'),
  ('contacto', 'telefonoActualizado12M'),
  ('contacto', 'correoActualizado12M'),
  ('familia', 'numeroHijos'),
  ('familia', 'tieneHijoMenorEdad'),
  ('familia', 'padresFallecidos'),
  ('familia', 'tieneHijos'),
  ('laboral', 'empleoActual'),
  ('laboral', 'numeroEmpleadoresUltimos24Meses'),
  ('laboral', 'ingresoPromedioUltimos6Meses'),
  ('laboral', 'esEmpleadorOAdministrador'),
  ('laboral', 'tieneRucActivo'),
  ('laboral', 'tieneEstablecimientoActivo'),
  ('laboral', 'esIndependiente'),
  ('laboral', 'numeroEmpleadosRegistrados'),
  ('laboral', 'tipoEmpleador'),
  ('laboral', 'obligacionesPatronalesEnMora'),
  ('tributario', 'pagaISD'),
  ('tributario', 'montoMaximoISD'),
  ('tributario', 'fechaMasRecienteISD'),
  ('tributario', 'generaImpuestoRenta'),
  ('tributario', 'montoMaximoImpuestoRenta'),
  ('tributario', 'fechaMasRecienteImpuestoRenta'),
  ('tributario', 'esAfiliadoUnipersonal'),
  ('seguridadSocial', 'afiliadoIessActivo'),
  ('seguridadSocial', 'esPensionista'),
  ('seguridadSocial', 'esJubilado'),
  ('seguridadSocial', 'estadoAfiliacionIess'),
  ('patrimonio', 'numeroVehiculos'),
  ('patrimonio', 'valorAvaluoVehiculos'),
  ('patrimonio', 'numeroInmuebles'),
  ('patrimonio', 'numeroInversiones'),
  ('patrimonio', 'tieneVehiculos'),
  ('patrimonio', 'numeroAutos'),
  ('patrimonio', 'numeroVehiculosPesados'),
  ('patrimonio', 'numeroMotos'),
  ('patrimonio', 'valorComercialTotalVehiculos'),
  ('patrimonio', 'valorVentaTotalVehiculos'),
  ('patrimonio', 'valorPromedioTotalVehiculos'),
  ('comportamientoBancario', 'numeroOperacionesCentralRiesgo'),
  ('comportamientoBancario', 'peorCalificacionRiesgo'),
  ('comportamientoBancario', 'tieneOperacionJudicializada'),
  ('comportamientoBancario', 'tieneOperacionCastigada'),
  ('comportamientoBancario', 'saldoTotalVigente'),
  ('comportamientoBancario', 'numeroCreditosFormales'),
  ('comportamientoBancario', 'numeroDeudasRetail'),
  ('comportamientoBancario', 'diasMoraMaximaRetail'),
  ('comportamientoBancario', 'totalDeudaRetail'),
  ('comportamientoBancario', 'tieneCreditoIessBiess'),
  ('comportamientoBancario', 'diasMoraCreditoIessBiess'),
  ('comportamientoCooperativas', 'numeroOperaciones'),
  ('comportamientoCooperativas', 'diasMoraMaxima'),
  ('comportamientoCooperativas', 'saldoTotal'),
  ('comportamientoCooperativas', 'tieneOperacionJudicializada'),
  ('comportamientoCooperativas', 'tieneOperacionCastigada'),
  ('comportamientoInterno', 'novadataResultadoHabitoPago'),
  ('comportamientoInterno', 'novadataPerfilInterno'),
  ('comportamientoInterno', 'novadataDiasMoraMaxima'),
  ('comportamientoInterno', 'novadataDiasMoraVigente'),
  ('comportamientoInterno', 'novadataSaldoCapitalVigente'),
  ('comportamientoInterno', 'esClienteInterno'),
  ('transitoVehicular', 'tieneLicenciaVigente'),
  ('transitoVehicular', 'puntosLicencia'),
  ('transitoVehicular', 'numeroMultas'),
  ('transitoVehicular', 'valorAdeudadoTransito'),
  ('riesgoJudicialCivil', 'numeroDemandasComoDemandado'),
  ('riesgoJudicialCivil', 'tiposDemandasComoDemandado'),
  ('riesgoJudicialCivil', 'numeroDemandasComoOfendido'),
  ('riesgoJudicialCivil', 'pensionAlimenticiaEnMora'),
  ('riesgoJudicialCivil', 'deudaPensionAlimenticia'),
  ('riesgoJudicialCivil', 'demandaProblemaCrediticio'),
  ('riesgoPenal', 'tieneAntecedentesPenales'),
  ('riesgoPenal', 'descripcionAntecedentes'),
  ('riesgoPenal', 'numeroDenunciasFiscalia'),
  ('compliance', 'enListaControl'),
  ('compliance', 'enListaNegra'),
  ('compliance', 'impedimentoCargosPublicos'),
  ('compliance', 'causalImpedimento'),
  ('compliance', 'registraSercopContraloria'),
  ('compliance', 'esPersonaExpuestaPoliticamente');
