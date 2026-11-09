# Bitácora de la revisión del análisis

Una línea por corrida: qué se revisó, qué se encontró, la página con sus propuestas y qué cambió
de la habilidad. Casos sólo como `c-xxxxxxxx`. La más nueva va arriba.

- **2026-11-06**, el piloto, a mano y antes de los guiones de medición
  (`research/revision-del-analisis/piloto-2026-11-06/`).
  - **Qué se revisó.** 12 análisis de la base de prueba de AWS, la que trae la decisión real de
    la institución: marco-v30 del lote del 31/10, y dos con v28 también. 3 agentes Opus, 4 casos
    cada uno, con la pauta de `dictamen.md`. Además, 247 análisis del lote medidos sin modelo.
  - **81 hallazgos**: 14 altos, 38 medios y 29 bajos.
    - **El 64% nace en los datos**: 26 en lo que se le manda al modelo, 18 en el perfil y 8 en la
      fuente. Los otros: 17 en el modelo, 6 en el marco y 6 en el proceso o un control.
    - **El 70% no lo corrige marco-v35**: 57 no, 16 a medias, 7 sí y 1 no aplica. Se juzgó
      leyendo el texto de v35 y lo que leería con el mismo perfil, sin correr el modelo.
    - El jefe de crédito coincidió con el modelo en 5 de 12 recomendaciones. De las 4
      aprobaciones del modelo habría negado 3, las mismas 3 que rechazó la institución.
  - **3 ciegos contaminados** (`c-3cec8b5f`, `c-40d771e1`, `c-e464c766`): `capacidad.json`, de la
    fase 1, traía el score del modelo y la decisión de la institución. `armar-carpetas.mjs` ya no
    los pone.
  - **Lo que resultó falso**, verificado contra el código:
    - la «regresión» de v35: a quien no tiene Equifax vigente le llega el texto sin esa sección,
      que sí explica A1 a E;
    - el «faltante» como falla: es el «no hay» de varias fuentes;
    - el medidor de homónimos daba por coincidente a una persona porque su primer nombre estaba
      en el abogado defensor. Se ajustó a un mismo demandado, y quedaron 8 de 33 bloqueados por
      la demanda de otra persona.
  - **Correcciones a la pauta**:
    - comparar la fecha de la solicitud con la del perfil;
    - contra qué texto del marco se juzga «corregido»;
    - qué quiere decir `faltante`;
    - en un caso negado por un control, cotejar la identidad en el registro del crudo que lo
      disparó y dictaminar también sin el control (`c-14f9ee80`);
    - una diferencia de score mayor que el ruido es hallazgo aunque la recomendación coincida
      (`c-5dfb1e00`, 170 puntos).
  - **10 propuestas** (p1 a p10) en https://claude.ai/artifact/7EsSQjxfejmkW2zNCNhsuS. Al
    2026-11-07, ninguna decidida.
  - **Pregunta abierta para el negocio**: cómo valida la institución el «ingreso validado del
    titular». En 42 de 233 es igual (±5%) al ingreso que estima Equifax.
  - Las mediciones del lote, hechas a mano en `guiones-del-piloto/`, pasaron a `medir-lote.mjs` y
    `elegir-casos.mjs`.
