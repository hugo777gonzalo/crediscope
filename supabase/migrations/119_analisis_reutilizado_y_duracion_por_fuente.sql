-- Un pedido idéntico al modelo devuelve el mismo análisis, y cada consulta
-- guarda cuánto tardó cada fuente (auditoría externa del 2026-10-09, E1 y
-- E5).
--
-- E1. El mismo perfil analizado dos veces movía el score ~40 puntos y
-- cambiaba 1 de cada 13 recomendaciones (medido el 2026-10-03): dos analistas
-- podían recibir "aprobar" y "revisar" para la misma persona el mismo día.
-- analyze-client calcula la huella del pedido entero (huellaDelPedido en
-- _shared/llm-scoring.ts: perfil del modelo, hallazgos, marco, modelo,
-- razonamiento, tope y esquema) y, si esa persona ya tiene un análisis
-- terminado con la misma huella, copia su resultado en vez de volver a
-- preguntar. La huella existe desde acá: los análisis anteriores no la
-- tienen y no se reutilizan. Al suprimir a un titular (115) sus análisis se
-- borran enteros, huella incluida.
--
-- E5. Hasta acá sólo se medía la consulta entera (duracion_ms); con 52
-- fuentes a la vez, no se sabía cuál arrastraba a las demás. Las forma
-- {fuente: milisegundos}; las fuentes apagadas no aparecen.

alter table analysis_results
  add column huella_pedido text,
  add column reutiliza_analisis_id uuid references analysis_results(id) on delete set null;

comment on column analysis_results.huella_pedido is
  'SHA-256 del pedido entero al modelo (huellaDelPedido, 119). El mismo pedido para la misma persona reutiliza el análisis.';
comment on column analysis_results.reutiliza_analisis_id is
  'Si el resultado se copió de un análisis anterior con la misma huella: cuál (siempre el original). Sin llamada al modelo.';

-- La búsqueda de analyze-client: misma persona, misma huella.
create index analysis_results_huella_idx on analysis_results (client_id, huella_pedido)
  where huella_pedido is not null;
create index analysis_results_reutiliza_idx on analysis_results (reutiliza_analisis_id)
  where reutiliza_analisis_id is not null;

alter table client_profiles add column duracion_por_fuente_ms jsonb;

comment on column client_profiles.duracion_por_fuente_ms is
  'Cuánto tardó cada fuente de Novadata, {fuente: ms} (119). null en los perfiles anteriores y en los reutilizados.';
