-- Configuración operativa para Aval, análoga a la de Novadata -- pero NO
-- calcada 1 a 1, porque Aval tiene otra forma.
--
-- POR QUÉ NO HAY UN "novadata_resource_config" PARA AVAL
--
-- ConfigFuentes ("Fuentes que consultamos") tiene sentido para Novadata
-- porque son 52 endpoints INDEPENDIENTES: se puede apagar "vehiculos" sin
-- tocar "trabajo". Aval es UNA sola llamada HTTP que devuelve sus 34
-- segmentos de un tirón -- no hay nada que apagar a ese nivel; se consulta
-- a Aval para esta persona, o no se consulta.
--
-- Ese "se consulta o no" YA tiene dónde vivir: la tabla `proveedores`
-- (migración 067), creada justo para esto -- su propio comentario decía
-- "el día que entre [un proveedor nuevo] no va a caber en los 9 bloques...
-- esta tabla es donde va a caber". Se agrega la fila de Aval y
-- consultar-aval la respeta antes de gastar una consulta.
--
-- Lo que SÍ tiene un análogo real es ConfigCampos (standard_profile_field_config):
-- qué campos de la ESTRUCTURA ESTANDARIZADA (la capa B, no la A) se usan
-- de cara al análisis. Eso es `aval_field_config` acá abajo.

insert into proveedores (clave, nombre, notas) values
  ('aval', 'Aval Buró', 'Buró de crédito de Ecuador. Una sola consulta HTTP por persona (no 52 endpoints como Novadata) -- el on/off acá es todo o nada, no por segmento.')
on conflict (clave) do nothing;

-- ---------- Campos de la estructura estandarizada de Aval ----------
-- Mismo esquema que standard_profile_field_config (migración 006): apagar
-- un campo no lo borra, se sigue calculando y guardando, solo viaja en
-- blanco hacia el análisis -- ver ConfigCampos.jsx.
--
-- Identidad (identificacion/tipoIdentificacion/nombre), clientesPeorScore,
-- responseCode y transactionNumber NO están acá: son CAMPOS_NO_PARA_LLM en
-- aval-estructura.ts, una exclusión de diseño (no debe influir el análisis,
-- o es metadato de control) y no una decisión operativa que competa
-- togglear -- de ahí que esta tabla tenga 84 filas, no las 90 de ESPEC.
create table aval_field_config (
  grupo       text not null,
  campo       text not null,
  enabled     boolean not null default true,
  motivo      text,
  updated_at  timestamptz not null default now(),
  primary key (grupo, campo)
);

alter table aval_field_config enable row level security;

create policy aval_field_config_read on aval_field_config for select
  using (auth.role() = 'authenticated');
create policy aval_field_config_update on aval_field_config for update
  using (auth.role() = 'authenticated');

comment on table aval_field_config is
  'Qué campos de la estructura estandarizada de Aval (aval-estructura.ts) se usan de cara al análisis. Catálogo generado desde ESPEC, no escrito a mano -- ver scratchpad de la sesión que lo creó. Sin policy de insert/delete: el catálogo lo define el código, no la app.';

-- Sembrado generado desde ESPEC (aval-estructura.ts), no a mano -- mismo
-- criterio que la migración 067 con RECURSOS_POR_BLOQUE.
insert into aval_field_config (grupo, campo) values
  ('Score', 'score'),
  ('Score', 'tipoScore'),
  ('Score', 'tasaMalos'),
  ('Factores del score', 'fac_nOperacionesActuales'),
  ('Factores del score', 'fac_nOperacionesHistoricas'),
  ('Factores del score', 'fac_mesesSinVencidos'),
  ('Factores del score', 'fac_nOpConVencidos'),
  ('Factores del score', 'fac_nOpVencidos6m'),
  ('Factores del score', 'fac_nOpVencidos12m'),
  ('Factores del score', 'fac_nOpVencidos24m'),
  ('Factores del score', 'fac_nOpAperturadas3m'),
  ('Factores del score', 'fac_valorDemandaJudicialHist'),
  ('Factores del score', 'fac_valorCarteraCastigadaHist'),
  ('Deuda actual', 'totalDeuda'),
  ('Deuda actual', 'deudaBancos'),
  ('Deuda actual', 'deudaCooperativas'),
  ('Deuda actual', 'deudaTarjetas'),
  ('Deuda actual', 'deudaComercial'),
  ('Deuda actual', 'deudaServicios'),
  ('Deuda actual', 'deudaCobranza'),
  ('Deuda actual', 'valorPorVencerTotal'),
  ('Deuda actual', 'valorVencidoTotal'),
  ('Deuda actual', 'carteraCastigadaTotal'),
  ('Deuda actual', 'valorDemandaJudicialTotal'),
  ('Carga financiera', 'cuotaMensualEstimada'),
  ('Carga financiera', 'cuotaBancos'),
  ('Carga financiera', 'cuotaCooperativas'),
  ('Carga financiera', 'cuotaEmpresas'),
  ('Carga financiera', 'cuotaCobranza'),
  ('Operaciones', 'nOpBancos'),
  ('Operaciones', 'nOpCooperativas'),
  ('Operaciones', 'nTarjetasActivas'),
  ('Operaciones', 'nOpComercial'),
  ('Operaciones', 'nOpServicios'),
  ('Operaciones', 'nOpCobranza'),
  ('Operaciones', 'numTarjetasVigentes'),
  ('Operaciones', 'nOpHistoricas'),
  ('Operaciones', 'nDeudasVigentes'),
  ('Operaciones', 'maxDiasMoraVigente'),
  ('Comportamiento de pago', 'saldoPromedio36M'),
  ('Comportamiento de pago', 'saldoPromedioTarjetas36M'),
  ('Comportamiento de pago', 'maxMontoDeuda36M'),
  ('Comportamiento de pago', 'maySaldoVencidoDirecta36M'),
  ('Comportamiento de pago', 'peorEdadVencidoDirecta36M'),
  ('Comportamiento de pago', 'fechaUltimoVencido'),
  ('Tendencia de deuda', 'mesesConHistoriaDeuda'),
  ('Tendencia de deuda', 'deudaPromedioHistorica'),
  ('Tendencia de deuda', 'endeudamientoPromedioPrevio'),
  ('Tendencia de deuda', 'endeudamientoReciente3m'),
  ('Tendencia de deuda', 'variacionEndeudamientoReciente'),
  ('Tendencia de deuda', 'deudaHace12m'),
  ('Tendencia de deuda', 'deudaHace24m'),
  ('Tendencia de deuda', 'maxDeudaHistorica'),
  ('Tendencia de deuda', 'mesesConVencido'),
  ('Tendencia de deuda', 'maxVencidoHistorico'),
  ('Acreedores', 'nAcreedores'),
  ('Acreedores', 'acreedorPrincipal'),
  ('Acreedores', 'participacionAcreedorPrincipal'),
  ('Tarjetas de crédito', 'cupoTotalTarjetas'),
  ('Tarjetas de crédito', 'consumoTotalTarjetas'),
  ('Tarjetas de crédito', 'saldoTotalTarjetas'),
  ('Deuda contingente (codeudor/garante)', 'nOperacionesComoCodeudorGarante'),
  ('Deuda contingente (codeudor/garante)', 'deudaComoCodeudorGaranteTotal'),
  ('Deuda contingente (codeudor/garante)', 'cuotaComoCodeudorGaranteTotal'),
  ('Deuda contingente (codeudor/garante)', 'maxDiasMoraComoCodeudorGarante'),
  ('Garantías otorgadas a terceros', 'nOpComoGaranteCodeudor'),
  ('Relaciones', 'nEmpresasRelacionadas'),
  ('Relaciones', 'esRUC'),
  ('Cuentas corrientes', 'inhabilitadoCtaCte'),
  ('Cuentas corrientes', 'ctaCte_tiempoInhabilitado'),
  ('Cuentas corrientes', 'ctaCte_fechaInhabilitado'),
  ('Cuentas corrientes', 'ctaCte_fechaCumplimientoSancion'),
  ('Cuentas corrientes', 'ctaCte_accion'),
  ('Cuentas corrientes', 'ctaCte_motivo'),
  ('Contacto', 'telefono'),
  ('Contacto', 'ciudad'),
  ('Contacto', 'sectorContacto'),
  ('Contacto', 'direccion'),
  ('Contacto', 'numeracion'),
  ('Consultas al buró', 'consultas12m'),
  ('Consultas al buró', 'entidadesDistintas12m'),
  ('Consultas al buró', 'ultimaConsulta'),
  ('Meta', 'tieneHistorialCrediticio'),
  ('Meta', 'nSegmentosConDatos')
on conflict do nothing;
