-- ============================================================
-- "Piso" deja de aparecer en los textos que guarda cada perfil.
--
-- El negocio pidió el 2026-09-25 no hablar de "piso": en Ecuador no se usa.
-- Se dice lo reportado al IESS y, cuando es el salario básico, "Ingreso
-- Mínimo SBU" (Salario Básico Unificado). Las pantallas ya lo dicen así;
-- faltaba la frase que fuentes-ingreso.ts escribía dentro de cada fuente de
-- un dependiente, que se lee en la pestaña Fuentes de ingreso y en el
-- listado por segmento:
--
--   antes:  "Es un piso: el empleador puede declarar menos que el sueldo real."
--   ahora:  "Es lo que declara el empleador: el sueldo real puede ser mayor."
--
-- Medido antes de aplicar: 1.323 perfiles la tienen. Es la frase exacta que
-- escribe fuentes-v4 desde el mismo día, así que un perfil viejo y uno nuevo
-- dicen lo mismo. De paso, "(salario básico del año: $X)" en el aporte
-- propio pasa a "(SBU del año: $X)", como ya lo escribe el código.
--
-- Sólo cambia texto. Ningún número, segmento ni estado se toca. Los nombres
-- internos (pisoIngresoMensualReportado, fuente_piso_ingreso) quedan: no se
-- leen en pantalla, y renombrarlos no cambiaba nada de lo que se ve.
-- ============================================================

update client_profiles
set standard_profile = replace(
  replace(
    standard_profile::text,
    'Es un piso: el empleador puede declarar menos que el sueldo real.',
    'Es lo que declara el empleador: el sueldo real puede ser mayor.'
  ),
  '(salario básico del año: $',
  '(SBU del año: $'
)::jsonb
where standard_profile::text like '%Es un piso: el empleador puede declarar menos que el sueldo real.%'
   or standard_profile::text like '%(salario básico del año: $%';
