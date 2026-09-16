-- ============================================================
-- Paso 1 de la reorganización: el mapa fuente -> grupo, como dato.
--
-- HOY HAY TRES CAPAS Y LA DEL MEDIO SOBRA
--
--   51 recursos  ->  9 bloques  ->  17 grupos del perfil  ->  124 campos
--
-- Los 9 bloques (general, trabajo, iess, bancos...) son un accidente de
-- cómo se escribió la primera integración. No solo son redundantes:
-- desinforman. Los aportes al IESS llegan adentro del bloque `bancos`,
-- así que "falló el bloque bancos" no dice "no sé si esta persona
-- aporta" -- y esa rareza hubo que dejarla escrita como comentario en
-- calidad-de-la-consulta.ts. Cuando una taxonomía necesita una nota al
-- pie, la taxonomía está mal.
--
-- LA RAZÓN DE FONDO: ES MUCHOS A MUCHOS, NO UN ÁRBOL
--
-- Una fuente alimenta VARIOS grupos y un grupo se llena con VARIAS
-- fuentes. Los bloques fuerzan esa relación a ser un árbol, y por eso
-- no cierra. Medido sobre el código de hoy: de 52 fuentes,
-- 16 alimentan más de un grupo.
--
-- ESTA MIGRACIÓN NO ROMPE NADA
--
-- Es aditiva. `bloque` sigue existiendo y `block_status` se sigue
-- guardando igual; lo que se agrega es el mapa que hasta ahora vivía
-- implícito adentro de process.ts. Retirar la capa vieja es el paso 4.
--
-- EL MAPA NO SE ESCRIBIÓ A MANO
--
-- Se extrajo leyendo process.ts, fuentes-ingreso.ts y
-- controles-bloqueo.ts: qué recurso toca cada sección. Transcribirlo de
-- memoria es cómo aparecen las diferencias silenciosas. Dos vínculos sí
-- van a mano y están anotados: `general` (se lee como raw.general, sin
-- pasar por el ayudante) y `basesInternas` (un recurso bolsa que el
-- código desarma y después nunca vuelve a nombrar -- es la fuente más
-- importante que tenemos y ningún patrón la encontraba).
-- ============================================================

-- ---------- El proveedor, que hasta ahora estaba implícito ----------
--
-- Todo el sistema asume Novadata en el nombre de las tablas, de los
-- recursos y de las funciones. Equifax está a la espera de credenciales
-- y el día que entre no va a caber en los 9 bloques, que tienen forma
-- de Novadata. Esta tabla es donde va a caber.
create table if not exists proveedores (
  clave       text primary key,
  nombre      text not null,
  activo      boolean not null default true,
  notas       text,
  created_at  timestamptz not null default now()
);

insert into proveedores (clave, nombre, notas) values
  ('novadata', 'Novadata', 'Proveedor único hasta hoy. Se accede con credenciales de servicio; las de un usuario solo se usan en el Explorador de Fuentes.')
on conflict (clave) do nothing;

alter table proveedores enable row level security;
create policy proveedores_lectura on proveedores for select using (auth.role() = 'authenticated');


-- ---------- Cada fuente: de quién es y dónde vive ----------
--
-- Se agregan columnas a la tabla que ya existe en vez de crear una
-- nueva: la pantalla de configuración escribe `enabled` acá y partirla
-- en dos habría obligado a tocarla en el mismo paso.
alter table novadata_resource_config add column if not exists proveedor text references proveedores(clave);
alter table novadata_resource_config add column if not exists ruta text;
-- Si ningún código lee lo que devuelve, se consulta y se tira. Queda
-- marcado para poder decidirlo con el dato a la vista.
alter table novadata_resource_config add column if not exists la_lee_alguien boolean;

comment on column novadata_resource_config.bloque is
  'Agrupación heredada de la primera integración. En retirada: la relación real entre fuentes y grupos del perfil es muchos a muchos y vive en fuente_grupo. Ver migración 067.';
comment on column novadata_resource_config.la_lee_alguien is
  'false = se consulta en cada corrida y ningún código usa la respuesta.';

-- Catálogo real, sacado de RECURSOS_POR_BLOQUE en novadata-client.ts.
-- Las 52 filas ya existen: esto les pone proveedor, ruta y si alguien
-- lee lo que devuelven. No se toca `enabled` ni `motivo`, que son
-- decisiones de operación y no de esta migración.
update novadata_resource_config f
   set proveedor = 'novadata',
       ruta = d.ruta,
       la_lee_alguien = d.la_lee_alguien
  from (values
  ('administraciones', 'data-services/novacredit/pn_administraciones', true),
  ('afiliacionIess', 'data-services/novacredit/pn_afiliacion_iess', true),
  ('afiliacionIssfacCertMedico', 'data-services/novacredit/pn_afiliacion_issfac/cert_medico', false),
  ('afiliacionIssfacFuerzaArmada', 'data-services/novacredit/pn_afiliacion_issfac/fuerza_armada', false),
  ('afiliacionIsspol', 'data-services/novacredit/pn_afiliacion_isspol', false),
  ('afiliacionSalud', 'data-services/novacredit/pn_afiliacion_salud', false),
  ('afiliacionSiisspol', 'data-services/novacredit/pn_afiliacion_siisspol', false),
  ('antecedentesPenales', 'data-services/novacredit/pn_antecedentes_penales', true),
  ('basesInternas', 'data-services/novacredit/nova_bases_internas', true),
  ('bienesInmueble', 'data-services/novacredit/pn_bienes_inmueble', true),
  ('buroCreditoCoop', 'api/consultas/novacredit/central_riesgo/get_inf_coop', true),
  ('buroCreditoDiners', 'api/consultas/novacredit/central_riesgo/get_inf_diners', true),
  ('buroCreditoSuper', 'api/consultas/novacredit/central_riesgo/get_inf_super', true),
  ('contribuyente', 'api/consultas/novacredit/contribuyente/get_contribuyente_inf', true),
  ('correo', 'data-services/novacredit/pn_direccion_correoe', true),
  ('creditoHipotecario', 'data-services/novacredit/pn_credito/hipotecario', true),
  ('creditoQuirografario', 'data-services/novacredit/pn_credito/quirografario', true),
  ('cumplimientoPatronal', 'data-services/novacredit/pn_cumplimiento_patronal', true),
  ('demandas', 'data-services/novacredit/pn_demandas', true),
  ('demandasOfendido', 'data-services/novacredit/pn_demandas_ofendido', true),
  ('denuncias', 'data-services/novacredit/pn_denuncias', true),
  ('deudasAmt', 'data-services/novacredit/pn_deudas_amt', true),
  ('deudasAnt', 'data-services/novacredit/pn_deudas_ant', true),
  ('deudasEmov', 'data-services/novacredit/pn_deudas_emov', true),
  ('deudasFirmes', 'data-services/novacredit/pn_deudas_firmes', false),
  ('deudores', 'data-services/novacredit/pn_deudores', false),
  ('direcciones', 'data-services/novacredit/pn_direcciones', true),
  ('empleados', 'data-services/novacredit/pn_empleados', true),
  ('establecimientoActEconomica', 'api/consultas/novacredit/establecimiento_act_economica/get_establecimiento_inf', true),
  ('general', 'data-services/novacredit/pn_inf_basica', true),
  ('hijos', 'data-services/novacredit/pn_hijos', true),
  ('impedimentoCargosPublicos', 'data-services/novacredit/pn_impedimento_cargos_publicos', true),
  ('inversiones', 'data-services/novacredit/pn_inversiones', true),
  ('jubilados', 'data-services/novacredit/pn_jubilados', true),
  ('licenciaConducir', 'data-services/novacredit/pn_licencia_conducir', true),
  ('listaNegra', 'data-services/novacredit/pn_lista_negra', true),
  ('listasControl', 'data-services/novacredit/pn_listas_control', true),
  ('padres', 'data-services/novacredit/pn_padres', true),
  ('pensionAlimenticia', 'data-services/novacredit/pn_supa', true),
  ('pensionAlimenticiaNovadata', 'data-services/novacredit/pn_supa/novadata', true),
  ('pensionista', 'data-services/novacredit/pn_pensionista', true),
  ('polizas', 'data-services/novacredit/pn_polizas', false),
  ('retails', 'data-services/novacredit/pn_retails', true),
  ('sercop', 'data-services/novacredit/pn_sercop', true),
  ('siniestros', 'data-services/novacredit/pn_siniestros', false),
  ('sriImpuestoRenta', 'data-services/novacredit/pn_sri_impuestos_renta', true),
  ('telefonos', 'data-services/novacredit/pn_telefonos', true),
  ('titulos', 'data-services/novacredit/pn_titulos', false),
  ('trabajoHistoricos', 'data-services/novacredit/pn_trabajo_historicos', false),
  ('trabajoHistoricosMecanizado', 'data-services/novacredit/pn_trabajo_historicos/mecanizado', true),
  ('vacunados', 'api/consultas/novacredit/vacunados/get_inf_byIden', false),
  ('vehiculos', 'data-services/novacredit/pn_vehiculos/general', true)
       ) as d(recurso, ruta, la_lee_alguien)
 where f.recurso = d.recurso;


-- ---------- El mapa: qué fuente alimenta qué grupo ----------
create table if not exists fuente_grupo (
  fuente      text not null references novadata_resource_config(recurso) on delete cascade,
  grupo       text not null,
  created_at  timestamptz not null default now(),
  primary key (fuente, grupo)
);

comment on table fuente_grupo is
  'Qué fuente de consulta alimenta qué grupo del Perfil del Cliente. Muchos a muchos: una fuente sirve a varios grupos y un grupo se llena con varias fuentes. Extraído del código en la migración 067; mantenerlo al día cuando process.ts cambie.';

alter table fuente_grupo enable row level security;
create policy fuente_grupo_lectura on fuente_grupo for select using (auth.role() = 'authenticated');

insert into fuente_grupo (fuente, grupo) values
  ('administraciones', 'laboral'),
  ('afiliacionIess', 'seguridadSocial'),
  ('antecedentesPenales', 'cumplimiento'),
  ('antecedentesPenales', 'riesgoPenal'),
  ('antecedentesPenales', 'riesgoSeguridadCiudadana'),
  ('basesInternas', 'comportamientoBancario'),
  ('basesInternas', 'comportamientoInterno'),
  ('basesInternas', 'cumplimiento'),
  ('basesInternas', 'fuentesIngreso'),
  ('basesInternas', 'laboral'),
  ('basesInternas', 'riesgoSeguridadCiudadana'),
  ('basesInternas', 'seguridadSocial'),
  ('bienesInmueble', 'patrimonio'),
  ('buroCreditoCoop', 'comportamientoCooperativas'),
  ('buroCreditoDiners', 'comportamientoBancario'),
  ('buroCreditoSuper', 'comportamientoBancario'),
  ('contribuyente', 'fuentesIngreso'),
  ('contribuyente', 'laboral'),
  ('correo', 'contacto'),
  ('creditoHipotecario', 'comportamientoBancario'),
  ('creditoQuirografario', 'comportamientoBancario'),
  ('cumplimientoPatronal', 'laboral'),
  ('demandas', 'cumplimiento'),
  ('demandas', 'riesgoJudicialCivil'),
  ('demandas', 'riesgoJudicialCrediticio'),
  ('demandas', 'riesgoSeguridadCiudadana'),
  ('demandasOfendido', 'riesgoJudicialCivil'),
  ('demandasOfendido', 'riesgoJudicialCrediticio'),
  ('denuncias', 'cumplimiento'),
  ('denuncias', 'riesgoPenal'),
  ('denuncias', 'riesgoSeguridadCiudadana'),
  ('deudasAmt', 'transitoVehicular'),
  ('deudasAnt', 'transitoVehicular'),
  ('deudasEmov', 'transitoVehicular'),
  ('direcciones', 'contacto'),
  ('empleados', 'fuentesIngreso'),
  ('empleados', 'laboral'),
  ('establecimientoActEconomica', 'fuentesIngreso'),
  ('establecimientoActEconomica', 'laboral'),
  ('general', 'contacto'),
  ('general', 'cumplimiento'),
  ('general', 'familia'),
  ('general', 'identidad'),
  ('general', 'laboral'),
  ('general', 'riesgoSeguridadCiudadana'),
  ('hijos', 'familia'),
  ('impedimentoCargosPublicos', 'cumplimiento'),
  ('inversiones', 'patrimonio'),
  ('jubilados', 'fuentesIngreso'),
  ('jubilados', 'seguridadSocial'),
  ('licenciaConducir', 'transitoVehicular'),
  ('listaNegra', 'cumplimiento'),
  ('listaNegra', 'riesgoSeguridadCiudadana'),
  ('listasControl', 'cumplimiento'),
  ('listasControl', 'riesgoSeguridadCiudadana'),
  ('padres', 'familia'),
  ('pensionAlimenticia', 'fuentesIngreso'),
  ('pensionAlimenticia', 'riesgoJudicialCivil'),
  ('pensionAlimenticia', 'riesgoJudicialCrediticio'),
  ('pensionAlimenticiaNovadata', 'fuentesIngreso'),
  ('pensionAlimenticiaNovadata', 'riesgoJudicialCivil'),
  ('pensionAlimenticiaNovadata', 'riesgoJudicialCrediticio'),
  ('pensionista', 'seguridadSocial'),
  ('retails', 'comportamientoBancario'),
  ('sercop', 'cumplimiento'),
  ('sriImpuestoRenta', 'fuentesIngreso'),
  ('sriImpuestoRenta', 'tributario'),
  ('telefonos', 'contacto'),
  ('trabajoHistoricosMecanizado', 'laboral'),
  ('vehiculos', 'patrimonio'),
  ('vehiculos', 'riesgoSeguridadCiudadana')
on conflict do nothing;


-- ---------- La vista con la forma nueva ----------
--
-- Para que las pantallas se vayan mudando de a una, sin un día de
-- cambio total.
create or replace view fuentes_de_consulta with (security_invoker = on) as
select
  f.recurso                                   as fuente,
  f.proveedor,
  f.ruta,
  f.enabled                                   as habilitada,
  f.motivo,
  f.la_lee_alguien,
  f.bloque                                    as bloque_heredado,
  coalesce(
    (select array_agg(g.grupo order by g.grupo) from fuente_grupo g where g.fuente = f.recurso),
    '{}'::text[]
  )                                           as alimenta_grupos,
  (select count(*) from fuente_grupo g where g.fuente = f.recurso) as cuantos_grupos
from novadata_resource_config f;

comment on view fuentes_de_consulta is
  'Las fuentes de consulta con su proveedor y los grupos del perfil que alimentan. Reemplaza la lectura por bloque.';
