-- ============================================================
-- La solicitud guarda los datos que pide la especificación de la API.
--
-- La especificación (api/openapi.yaml, PedidoDeEvaluacion) pide con cada
-- evaluación la autorización del titular, la referencia de la institución,
-- el operador, la prioridad y, si es un nuevo pedido de otra evaluación, a
-- cuál reemplaza. La solicitud (133) no los guardaba: el negocio respondió
-- el 2026-10-19 (docs/pendientes.md, sección 1) que se guardan, una columna
-- por dato.
--
-- Todo es opcional en la base: la pantalla del analista no los manda. Los
-- exige la puerta de la API de la Fase 1, que todavía no existe.
--
-- De la autorización se guardan los datos y la huella del documento, NUNCA el
-- documento (contrato de encargo, cláusula 2: la autorización la recoge y la
-- conserva la institución; acá queda lo necesario para el muestreo).
--
-- No cambia suprimir_titular() ni los derechos del titular: las columnas
-- nuevas están en la misma fila de `solicitudes`, que la supresión ya borra
-- por la identificación, y la portabilidad ya exporta entera.
-- ============================================================

alter table solicitudes
  add column autorizacion_id            text check (autorizacion_id is null or length(autorizacion_id) between 1 and 64),
  add column autorizacion_otorgada_el   timestamptz,
  add column autorizacion_vigente_hasta date,
  add column autorizacion_canal         text check (autorizacion_canal is null or autorizacion_canal in
                                          ('firma_electronica', 'documento_fisico_digitalizado', 'aceptacion_electronica')),
  add column autorizacion_finalidad     text check (autorizacion_finalidad is null or autorizacion_finalidad = 'evaluacion_de_credito'),
  -- «sha256:» y 64 hexadecimales: el documento nunca llega a la base.
  add column autorizacion_huella        text check (autorizacion_huella is null or autorizacion_huella ~ '^sha256:[0-9a-f]{64}$'),
  add column referencia                 text check (referencia is null or (length(referencia) between 1 and 64 and referencia ~ '^[A-Za-z0-9._/-]+$')),
  add column operador_id                text check (operador_id is null or length(operador_id) between 1 and 64),
  add column operador_agencia           text check (operador_agencia is null or length(operador_agencia) between 1 and 100),
  -- null = no informada (la pantalla del analista no la manda); la puerta de
  -- la API pone «interactiva» por omisión, como la especificación.
  add column prioridad                  text check (prioridad is null or prioridad in ('interactiva', 'diferida')),
  -- La evaluación que esta vuelve a pedir. Si esa se borra (supresión del
  -- titular), el vínculo se pierde pero esta queda.
  add column reemplaza_a                uuid references solicitudes(id) on delete set null,
  -- La autorización entra completa o no entra: una a medias no sirve para el muestreo.
  add constraint solicitudes_autorizacion_completa check (
    (autorizacion_id is null and autorizacion_otorgada_el is null and autorizacion_canal is null
       and autorizacion_finalidad is null and autorizacion_huella is null and autorizacion_vigente_hasta is null)
    or (autorizacion_id is not null and autorizacion_otorgada_el is not null and autorizacion_canal is not null
       and autorizacion_finalidad is not null and autorizacion_huella is not null)
  ),
  add constraint solicitudes_agencia_con_operador check (operador_agencia is null or operador_id is not null);

comment on column solicitudes.autorizacion_huella is
  'SHA-256 del documento o de la constancia de aceptación de la autorización del titular (135). El documento no se guarda.';
comment on column solicitudes.referencia is
  'La referencia propia de la institución (por ejemplo su número de solicitud), única en la base (135). Hay una base por institución (docs/plan-segundo-cliente.md); si una base sirviera a varias, la unicidad pasa a ser por institución.';
comment on column solicitudes.reemplaza_a is
  'La solicitud que ésta vuelve a pedir (135). Por ahora sólo se guarda; que reutilice su perfil sin volver a consultar las fuentes es de la puerta de la API (Fase 1).';

create unique index solicitudes_referencia_idx on solicitudes (referencia) where referencia is not null;
create index solicitudes_reemplaza_a_idx on solicitudes (reemplaza_a) where reemplaza_a is not null;
create index solicitudes_operador_idx on solicitudes (operador_id, creada_el desc) where operador_id is not null;
