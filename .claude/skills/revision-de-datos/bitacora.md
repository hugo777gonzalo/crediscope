# Bitácora de la revisión de datos

Una línea por corrida que cambió algo de la habilidad: qué se corrió, qué se encontró y
qué se cambió. Casos sólo como `c-xxxxxxxx`. La más nueva va arriba.

- **2026-11-05**, tercera corrida, después de aplicar estructura-v19 en producción.
  - `cargo-vigente-sin-aporte-vigente` dio 0 de 1.914, con 17 resueltos.
  - `perfil-con-estructura-atrasada` dio 0 de 3.766.
  - No volvió ninguna regresión: el arreglo se probó con el mismo detector que lo encontró.

- **2026-11-05**, segunda corrida. El negocio pidió solucionar `cargo-vigente-sin-aporte-vigente`.
  - 17 de los 23 dejaron de aportar un corte antes y el mecanizado los daba con empleo actual. Se corrigió en estructura-v19: cambian 20 perfiles.
  - Los otros 6 tenían `basesInternas` en error. El detector ahora sólo cuenta las consultas en que contestaron los aportes, y pasó a regresión.
  - `recalcular-grupos.mjs --seco` ahora dice qué campos cambian, no sólo cuántos perfiles se escriben.
  - El predictor (pedido del negocio, «corramos al menos el predictor»): `estimar-ingresos-en-lote.mjs` lo corre sin guardar.
    - Sobre 3.766 personas reales, el selector estima a 2.061.
    - 624 de esas estimaciones salen de consultas incompletas, 552 de ellas sin edad ni sexo porque `general` falló. La función `estimar-ingreso` no aplica el freno. Hallazgo abierto: lo decide el negocio.
    - Contra el ingreso que estima Equifax (52 personas con los dos), la razón mediana es 0,74.
    - El detector `estimacion-lejos-del-reportado` estaba mal planteado: el predictor sólo estima a quien no tiene ingreso verificado. Se reemplazó por `estimacion-sobre-consulta-incompleta` y `estimacion-lejos-de-equifax`.

- **2026-11-05**, primera versión, con 16 detectores salidos de la revisión de casos del
  2026-10-31 al 2026-11-05.
  - Corrida completa sobre 3.766 personas reales, en estructura-v18:
    - 0 regresiones;
    - 770 consultas incompletas;
    - el retail con corte viejo en 490 de 490;
    - 23 cargos vigentes sin aporte vigente, a confirmar;
    - 7 de 92 con mora comercial que sólo ve Equifax;
    - 2 de 86 con la suspensión del RUC distinta;
    - 85 de 441 análisis que dicen «sin atraso» con A2 o peor, todos de marcos anteriores al v32.
  - Afinado:
    - `salario-mas-alto` comparaba contra la suma de los empleos: daba 60, ahora 0, y pasó a regresión;
    - `consulta-incompleta` copiaba 5 fuentes del freno en vez de las 21 de hoy: daba 671, ahora 770, e importa la regla del código.
