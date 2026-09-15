-- De dónde salió el veredicto de cada análisis.
--
-- CrediScope tiene dos motores y solo uno depende del proveedor de IA:
--
--   Determinístico  el Perfil del Cliente, las Fuentes de Ingreso y los
--                   controles de bloqueo. Es código nuestro sobre datos
--                   de la fuente. No falla porque falle un tercero.
--
--   Modelo          la lectura del caso: puntaje, recomendación y la
--                   explicación en lenguaje natural.
--
-- Cuando el modelo falla, hoy se pierde todo. Pero hay casos donde el
-- veredicto NO lo puso el modelo: si el cliente aparece en una lista de
-- control, el resultado es "negar" con puntaje 1 por una regla nuestra,
-- y eso sigue siendo verdad aunque el proveedor esté caído. Marcarlo
-- como "no se pudo analizar" sería esconder una respuesta correcta.
--
-- Esta columna dice cuál de los dos habló, para que la pantalla muestre
-- lo que de verdad hay y no lo que se supone que debería haber.

alter table analysis_results add column veredicto_origen text not null default 'modelo';

alter table analysis_results
  add constraint analysis_results_veredicto_origen_check
  check (veredicto_origen in ('modelo', 'control_bloqueo', 'sin_veredicto'));

comment on column analysis_results.veredicto_origen is
  'Quién decidió: modelo (el LLM), control_bloqueo (una regla determinística forzó negar; vale aunque el LLM haya fallado), sin_veredicto (el LLM falló y no hubo control que decidiera: NO hay dictamen).';

-- El histórico se deduce sin ambigüedad: el control de bloqueo fuerza
-- el puntaje a 1, y un análisis fallido sin control queda en el neutro
-- 500.
update analysis_results
   set veredicto_origen = case
     when fallo is null then 'modelo'
     when crediscope_score = 1 then 'control_bloqueo'
     else 'sin_veredicto'
   end;
