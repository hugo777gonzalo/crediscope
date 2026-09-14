-- Completa el vínculo análisis -> perfil para TODO el histórico, a
-- pedido del usuario: el perfil más cercano en fecha.
--
-- La 032 solo rellenó los casos sin ambigüedad (30 de 59) y dejó el
-- resto en null. Acá se completa el resto, pero quedando registrado
-- cómo se resolvió cada vínculo: los deducidos por fecha se marcan en
-- client_profile_inferido. Sin esa marca, un vínculo deducido se ve
-- exactamente igual de confiable que uno registrado por el sistema al
-- momento de correr el análisis, y cualquier análisis posterior que se
-- apoye en el perfil (correlación contra el incumplimiento, auditoría
-- de por qué salió tal score) lo trataría como un hecho.
--
-- Criterio de "más cercano": se prefiere el perfil ANTERIOR al análisis
-- -- es el único que el análisis pudo haber usado realmente -- y entre
-- esos, el más próximo. Solo si el cliente no tiene ningún perfil
-- anterior se toma el posterior más próximo (mejor aproximación
-- disponible: la información de la persona no cambia de un día para
-- otro, salvo justo en lo que se esté mirando).

alter table analysis_results
  add column client_profile_inferido boolean not null default false;

comment on column analysis_results.client_profile_inferido is
  'true = el vínculo con client_profiles se dedujo por cercanía de fecha (histórico previo a la 032). false = lo registró analyze-client al correr el análisis.';

-- Lo que rellenó la 032 también fue deducido por fecha.
update analysis_results
   set client_profile_inferido = true
 where client_profile_id is not null;

update analysis_results a
   set client_profile_id = elegido.perfil_id,
       client_profile_inferido = true
  from (
    select distinct on (a2.id)
           a2.id as analisis_id,
           p.id  as perfil_id
      from analysis_results a2
      join client_profiles p on p.client_id = a2.client_id
     where a2.client_profile_id is null
     order by a2.id,
              (p.created_at <= a2.created_at) desc,
              abs(extract(epoch from (a2.created_at - p.created_at)))
  ) elegido
 where elegido.analisis_id = a.id;

-- Quedan en null solo los análisis de clientes que no tienen ningún
-- perfil guardado (se analizaron antes de que analyze-client lo
-- persistiera). Ahí no hay nada que deducir: esa información se perdió.
