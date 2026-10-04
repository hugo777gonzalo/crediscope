-- Laboratorio, fases C a F de las pantallas (docs/laboratorio-pantallas.md):
-- los resultados nuevos que se guardan.
--  - calibracion: la función puntaje → probabilidad estimada en una cohorte
--    y su prueba en otra (decisión 4). La guarda la pantalla.
--  - importancia, segmentos_kmedias, pca: los guiones locales de la fase F
--    (decisión 2: lo pesado fuera del navegador; los corre Node porque en la
--    máquina del negocio no hay Python).
-- Lo demás de las fases C y D se calcula en el navegador sobre el corte
-- congelado y no se guarda: el corte no cambia y se recalcula igual.

alter table lab_resultados drop constraint lab_resultados_tipo_check;
alter table lab_resultados add constraint lab_resultados_tipo_check check (tipo in (
  'desempeno', 'variables', 'simulacion_politica', 'simulacion_marco', 'estabilidad',
  'cuadrantes', 'motivos', 'crudo', 'calificacion_simulacion', 'matriz',
  'calibracion', 'importancia', 'segmentos_kmedias', 'pca'));
