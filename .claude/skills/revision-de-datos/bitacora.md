# Bitácora de la revisión de datos

Una línea por corrida que cambió algo de la habilidad: qué se corrió, qué se encontró y
qué se cambió. Casos sólo como `c-xxxxxxxx`. La más nueva va arriba.

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
