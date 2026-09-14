-- Afina lo de la 034: no alcanza con saber que un vínculo fue deducido,
-- hay que saber en qué dirección.
--
-- Al completar el histórico, 9 análisis quedaron atados a un perfil
-- POSTERIOR a ellos, porque ese cliente no tenía ninguno anterior. Ese
-- caso no es equivalente a los demás: un perfil posterior puede
-- contener información que no existía cuando se evaluó al cliente
-- (típicamente, la mora que apareció después). Usarlo como si fuera la
-- foto del día del análisis es justo el error que invalida una prueba
-- retrospectiva -- el modelo "acierta" porque está viendo el futuro.
--
-- Con un valor por caso, cualquier análisis puede excluir los dudosos
-- sin tener que redescubrir esto.

alter table analysis_results add column client_profile_vinculo text;

update analysis_results a
   set client_profile_vinculo = case
     when a.client_profile_id is null then 'sin_perfil'
     when not a.client_profile_inferido then 'exacto'
     when (select p.created_at from client_profiles p where p.id = a.client_profile_id) > a.created_at
       then 'inferido_posterior'
     else 'inferido_anterior'
   end;

alter table analysis_results alter column client_profile_vinculo set default 'exacto';
alter table analysis_results alter column client_profile_vinculo set not null;

alter table analysis_results
  add constraint analysis_results_client_profile_vinculo_check
  check (client_profile_vinculo in ('exacto', 'inferido_anterior', 'inferido_posterior', 'sin_perfil'));

comment on column analysis_results.client_profile_vinculo is
  'Cómo se resolvió el vínculo con client_profiles. exacto = lo registró analyze-client al correr el análisis. inferido_anterior = deducido por fecha, el perfil es anterior al análisis (uso razonable). inferido_posterior = deducido por fecha pero el perfil es POSTERIOR: puede contener información que no existía al evaluar, no usar para pruebas retrospectivas. sin_perfil = ese análisis no tiene perfil guardado.';

alter table analysis_results drop column client_profile_inferido;
