-- 112: se borran las funciones que la 111 dejó sin uso, después de publicar
-- el código que ya no las llama (regla 8): la web de 5f7c773 y analyze-client,
-- desplegados el 2026-10-07.
--
-- 1. La estadística de la base. Desde la 111 la base sólo cuenta
--    (lab_contar_*) y la estadística vive en src/lib/estadistica.js. Antes de
--    borrarlas se comparó en los tres cortes lo que daban contra lo que arma
--    el navegador: desempeño, variables (las dos poblaciones), matriz,
--    cuadrantes, motivos, calificación y estabilidad, todo igual. Lo que
--    guardaron queda en lab_resultados (origen 'base') y las pruebas lo usan
--    de referencia.
--
-- 2. El ajuste de criterio (decisión del negocio del 2026-10-06): metía texto
--    libre en lo que lee el modelo sin versión nueva del marco, así que su
--    efecto no se podía medir antes de ponerlo. No había ninguno: ninguna
--    propuesta y una sola versión del criterio, sin ajustes. criterio_versiones
--    y analysis_results.criterio_version_id quedan como historia (17 análisis
--    dicen con qué versión se hicieron): no se borra ninguna tabla ni columna.
--
-- Sin cascade: si algo más dependiera de una de estas funciones, la
-- migración tiene que fallar, no llevárselo puesto.

begin;

drop trigger lab_propuestas_version on lab_propuestas;
drop function trigger_version_criterio();
drop function revertir_criterio(uuid, uuid);
drop function desactivar_todos_los_ajustes(uuid);
drop function registrar_version_criterio(text, uuid);
drop function ajustes_vigentes_actuales();
drop function lab_poner_en_vigencia(uuid, boolean);
drop function analisis_por_version_del_criterio();

drop function lab_calcular_desempeno(uuid);
drop function lab_auc(uuid, text);
drop function lab_calcular_variables(uuid, text);
drop function lab_estabilidad(uuid, uuid);
drop function lab_calcular_matriz(uuid);
drop function lab_calcular_cuadrantes(uuid);
drop function lab_calcular_motivos(uuid);
drop function lab_wilson(bigint, bigint);
drop function lab_calificar_simulacion(uuid);

-- Una propuesta ya no puede ser un ajuste del criterio, y vigente_desde, que
-- era sólo de esos ajustes, queda siempre vacía.
alter table lab_propuestas drop constraint lab_propuestas_tipo_check;
alter table lab_propuestas add constraint lab_propuestas_tipo_check
  check (tipo in ('cambio_marco', 'regla_politica', 'dato_nuevo'));
alter table lab_propuestas drop constraint lab_propuestas_check1;
alter table lab_propuestas add constraint lab_propuestas_sin_vigencia
  check (vigente_desde is null);

commit;
