-- Retiro de la clasificación en 4 segmentos (paso 2 de 2 — correr solo
-- después de desplegar structure-client y analyze-client sin ella, ver
-- la nota larga en 032).
--
-- Nada la lee desde hace varias versiones: Perfil del Cliente muestra
-- los 16 grupos tal cual, el LLM recibe el StandardClientProfile
-- completo y decide él qué juega a favor y en contra, y los reportes y
-- el ciclo de calibración no la tocan.
--
-- No se pierde nada irrecuperable: era una función pura del perfil, así
-- que cualquier clasificación se puede volver a calcular desde
-- standard_profile, que sí se conserva entero. El código queda en el
-- historial de Git si alguna vez hace falta.

alter table client_profiles drop column classification;
alter table client_profiles drop column classification_version;
