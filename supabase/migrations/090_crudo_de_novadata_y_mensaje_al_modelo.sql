-- El crudo de Novadata y lo que leyó el modelo, guardados (2026-10-03).
--
-- Los dos son insumo del Laboratorio de Inteligencia de Negocio
-- (docs/laboratorio-de-riesgo.md): para saber por qué el modelo aprobó a
-- alguien que después cayó hay que poder seguir el dato desde la fuente
-- hasta la respuesta. Lo que no se guarda hoy no se puede analizar cuando
-- los créditos maduren.
--
-- Se aplica ANTES de desplegar analyze-client, structure-client y
-- procesar-lote: las funciones nuevas escriben estas columnas.
--
-- 1. analysis_results.mensaje_al_modelo: el perfil del modelo y los
--    hallazgos del control de bloqueo, tal cual salieron en el pedido.
--    Reconstruirlo exige el código de esa versión (estructura v12 y marco
--    v26 a hoy, y cambian seguido). El marco no se repite acá: lo fijan
--    rules_version y criterio_version_id.
-- 2. client_profiles.crudo_ruta: dónde quedó el crudo de esa consulta en
--    Storage. Null = no se guardó (perfiles anteriores a esta migración, o
--    una subida que falló): el hueco se cuenta, no se supone.
-- 3. El depósito privado crudo-novadata. Va a Storage y no a una columna:
--    ~150 KB por persona sin comprimir (~11 KB con gzip), contra ~4 KB del
--    perfil o del crudo de Aval. Medido el 2026-10-03: la base pesa 96 MB y
--    las 6.018 consultas guardadas habrían sumado del orden de cien más.
--    Lo escriben las funciones con la clave de servicio; leerlo, sólo un
--    admin -- es la respuesta entera de Fiscalía, Función Judicial y buró.

alter table analysis_results add column mensaje_al_modelo jsonb;

alter table client_profiles add column crudo_ruta text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crudo-novadata', 'crudo-novadata', false, 5242880, array['application/gzip'])
on conflict (id) do nothing;

create policy crudo_novadata_lectura_admin on storage.objects for select
  using (
    bucket_id = 'crudo-novadata'
    and exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
  );
