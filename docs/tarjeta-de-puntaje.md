# Tarjeta de puntaje: el score de referencia reproducible

Diseño del paso estructural de E1 de la auditoría externa del 2026-10-09:
separar **el puntaje** de **la política** y usar el modelo de lenguaje como
analista, no como el que fija el número.

Decisión del negocio (2026-10-09): se arma cuando haya impagos reales.
Mientras tanto, un pedido idéntico al modelo reutiliza el análisis (119).
Retoma una idea ya escrita en `docs/arquitectura-fabrica-de-credito.md`
("separar puntaje de política"), que sigue en pausa como conjunto.

## 1. Por qué

- **El score de hoy lo escribe un modelo de lenguaje.** El mismo perfil
  analizado dos veces mueve el número unos 40 puntos y cambia 1 de cada 13
  recomendaciones. Para una IFI regulada eso trae tres problemas:
  - igualdad de trato entre dos solicitudes iguales;
  - explicación al titular, porque la LOPDP regula las decisiones basadas en
    valoraciones automatizadas;
  - validación del modelo, porque un evaluador pide que la misma entrada dé
    la misma salida.
- **Una tarjeta de puntaje da el mismo número siempre.** Cada punto se
  explica con una variable y un tramo, y se valida con métodos que cualquier
  área de riesgo conoce.

## 2. Qué es

- **El puntaje** se arma así:
  - para cada variable del perfil de t0 (el del día de la solicitud), se
    elige el tramo en que cae la persona;
  - cada tramo suma puntos, que salen de una regresión logística sobre el WoE
    de los tramos;
  - el total se lleva a una escala de 1 a 999, para que conviva con lo que
    la pantalla ya muestra.
- **La política** es aparte y versionada: los cortes que llevan a aprobar,
  revisar o negar, y las reglas duras. Los controles de bloqueo de hoy siguen
  igual y siguen prevaleciendo.
- **El modelo de lenguaje** queda como analista:
  - redacta el análisis y señala lo atípico;
  - puede pedir "revisar" con sus motivos;
  - no fija el número;
  - su recomendación se puede seguir midiendo en el Laboratorio como una
    variable más.

## 3. Lo que tiene que existir antes

1. **Impagos reales.** La primera ronda de reconsultas de la cartera empieza
   el 25/12/2026 (`docs/laboratorio-guia.md`). Sin desempeño observado no hay
   nada que ajustar ni validar.
2. **Volumen.**
   - Con unos 300 créditos desembolsados hay unos 20 malos: eso es ruido (en
     la simulación, AUC 0,63, con intervalo de 0,51 a 0,75).
   - Hay que usar el resultado del buró sobre **todas** las solicitudes
     (`malo_buro`). En la simulación eso dio 211 malos. También reduce el
     sesgo de mirar sólo a los aprobados.
3. **La definición de impago vigente** (110): más de 90 días, bancos D o E, o
   retail con más de USD 500 en atraso. Se fija la versión que se usa, para
   que la tarjeta sea reproducible.
4. **Variables del perfil de t0**, rearmado desde su crudo, nunca de la
   reconsulta. El buró de hoy ya trae la mora, y cualquier variable
   "acierta" (lección del Laboratorio).
5. **La estadística validada contra una biblioteca de referencia** (E17).
   La tarjeta se ajusta con lo que hoy está escrito a mano en JavaScript.
6. **Lo que lee el modelo, corregido (E27).** Los atributos protegidos que se
   decidan sacar tampoco entran a la tarjeta.

## 4. Pasos

1. **Candidatas.** Variables con IV por encima de 0,02 y estables entre
   cortes (PSI). El Laboratorio ya las lista y registra
   (`lab_variables_candidatas`).
2. **Tramos.** Monótonos, sin partir empates (106). Un tramo con muy pocos
   casos se junta con el vecino.
3. **Ajuste.**
   - Una regresión logística sobre el WoE de los tramos.
   - Coeficientes con el signo esperado. Si alguno sale al revés, se revisa
     la variable: no se fuerza.
4. **Escala.**
   - Puntos con PDO (puntos para duplicar las chances) y un punto base.
   - Se lleva a 1-999 y se deja escrita la fórmula.
5. **Validación fuera de muestra.**
   - AUC y KS con intervalo, calibración por tramos de puntaje y PSI entre
     cortes.
   - Comparación contra el score del modelo de lenguaje: si este último no
     agrega discriminación, sale del número.
6. **Política.**
   - Cortes de aprobar, revisar y negar, acordados con la IFI según su
     apetito de riesgo.
   - Versionados como la definición de impago.
7. **Gobierno.**
   - Ficha (`docs/cumplimiento/ficha-del-modelo.md`).
   - Acta de aprobación.
   - Validación por alguien que no la construyó.
   - Pruebas de equidad: por género, edad y provincia, comparando
     recomendaciones y desempeño por grupo.
8. **Convivencia.**
   - Durante un período, la pantalla muestra los dos scores y se mide cuánto
     discrepan.
   - Se reemplaza cuando el negocio lo decida con esos números.

## 5. Lo que no cambia

- El perfil estandarizado y sus 52 fuentes.
- Los controles de bloqueo.
- El Laboratorio, que es donde se ajusta y se mide.
- La reutilización por huella para el análisis escrito del modelo.

## 6. Decisiones del negocio pendientes

- La escala: ¿1-999 como hoy, u otra?
- Los cortes de la política, por IFI.
- Si el score del modelo de lenguaje se sigue mostrando, y cómo se llama para
  que no se confunda con el de referencia.
- Cuándo se reemplaza y con qué evidencia.

## 7. Riesgos

- **Pocos malos en la primera ronda.** Si no alcanzan, esperar a la segunda
  antes que ajustar con ruido.
- **Cambio de ciclo económico entre la ronda que ajusta y la que valida.**
  Por eso el PSI y la validación por cohortes.
- **Sesgo de selección.** Los rechazados no tienen desempeño de crédito,
  pero sí buró después. Reconsultar a todas las solicitudes lo atenúa.
