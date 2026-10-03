-- Retiro de Retroalimentación (2026-10-03), último paso de la sección 11 de
-- docs/laboratorio-de-riesgo.md. El Laboratorio la reemplazó.
--
-- En este orden, por la regla 8 de CLAUDE.md (nada desplegado las escribe):
--   1. el criterio vigente ya lee lab_propuestas (096, misma huella);
--   2. las pantallas y la descarga analítica ya no las leen;
--   3. analizar-feedback, proponer-ajustes y correr-backtest se dieron de
--      baja en Supabase;
--   4. ninguna función, vista ni disparador de la base las nombra
--      (verificado antes de aplicar).
-- Las cinco tablas tenían 0 filas: no se pierde nada. El historial de
-- llm_llamadas de esas funciones (16 llamadas) queda.

drop table if exists feedback_backtests;
drop table if exists feedback_propuestas;
drop table if exists feedback_informes;
drop table if exists feedback_creditos;
drop table if exists feedback_paquetes;
