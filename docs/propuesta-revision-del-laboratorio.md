# Revisión del Laboratorio de Inteligencia de Negocio

Revisión del 2026-10-04, pedida por el negocio: fallas de construcción,
proceso, estructura, lógica de negocio, datos y comprensión, **sin la parte
visual**, que se ajusta al final. Y propuestas para que el Laboratorio sea la
fuente de mejoras del modelo actual y de los que vengan.

Se revisaron el diseño (`docs/laboratorio-de-riesgo.md`), el mapa de
pantallas, las migraciones 094 a 109, los guiones del ciclo
(`simular-un-anio.mjs`, `procesar-reconsultas.mjs`, `explorar-crudo.mjs`,
`analisis-pesado.mjs`), el detector `_shared/eventos-entre-consultas.ts` y
los cálculos de `src/lib/analisis*.js`. Los números de la sección "medido"
salen de consultas de sólo lectura a la base hechas ese día (sección 9).

**Actualización del 2026-10-06:** el negocio contestó las preguntas de la
sección 8 y decidió sobre las fallas de estructura. Las decisiones, su
validación contra el código, la base y la norma, y el plan que sale de ellas
están en las secciones 10 a 12. Lo de las secciones 0 a 9 que contradiga a
la 10 queda reemplazado por ella.

---

## 0. En una página

**El diagnóstico de fondo.** El Laboratorio está construido alrededor de dos
cosas que todavía no existen: el archivo de una institución y los puntajes
reales del modelo. En la base hay **62 análisis sin fallo, de 33 clientes, en
19 versiones del marco; sólo 14 tienen recomendación, ninguno es de
marco-v27 o v28 y ninguno guardó lo que leyó el modelo**
(`mensaje_al_modelo`). Hoy el Laboratorio mide un modelo sintético contra un
impago sintético. La maquinaria es amplia y está probada contra sí misma; lo
que le falta es dato real. Y el camino al dato real no depende de una
institución: la cartera de 2.567 personas, con el crudo del 2026-09-25 ya
guardado, reconsultada cada tanto, es la primera cohorte real (5.1).

**Las fallas que más importan**

| # | Falla | Gravedad | Sección |
|---|---|---|---|
| 1 | El detector de eventos no mira si la fuente contestó. Una fuente caída en t0 o en t1 inventa créditos nuevos, pérdidas de trabajo y cierres de negocio. Medido: 44 de los 239 "créditos nuevos en retail" del ciclo son de las 147 personas cuyo retail no contestó en t0. Y la calificación de la simulación lo esconde como "cambios reales de la semana". | Alta | 1.1 |
| 2 | En la población "todas las solicitudes" conviven dos definiciones de malo: "cayó en nuestro crédito" (archivo) y "cayó en cualquier crédito" (buró). Un desembolsado que pagó lo nuestro y cayó con otro cuenta como bueno; un no desembolsado igual, como malo. | Alta | 1.2 |
| 3 | En la corrida real, el resultado por buró no controla la ventana: con solicitudes repartidas en el año y una sola reconsulta, unas personas tienen 12 meses para caer y otras 24. | Alta (corrida real) | 1.3 |
| 4 | "Peor que B2" no equivale a 90 días: en consumo y microcrédito C1 empieza cerca de los 46 días (a confirmar con la norma). El mismo cliente es malo antes en un banco que en una cooperativa. | Media-alta | 1.4 |
| 5 | Lecturas que el número no sostiene: "el modelo lo vio en 169 de 211" (también "lo vio" en el 55% de los que pagaron), y dos de los tres hallazgos de "lo que el modelo no vio" no pueden ser reales: el impago es sintético. | Media-alta | 1.5, 1.6, 4 |

**Las propuestas que más valor dan**

1. **Una cohorte propia con reconsultas periódicas** (5.1): la primera prueba
   retrospectiva real sin esperar a una institución, con la fecha del impago
   que el buró no da.
2. **Un banco de prueba del modelo** (5.2): toda versión del marco se mide
   contra perfiles congelados antes de ir a producción.
3. **Un modelo retador estadístico permanente** (5.3): la vara para saber
   cuánto agrega el modelo de lenguaje.
4. **Un registro de hallazgos con confirmación** (5.5): lo exploratorio y lo
   confirmado separados, en la base y en el informe.
5. **Leer el texto del modelo** (5.7): para cada aprobado que cayó, ¿lo dijo
   y no lo pesó, o no lo dijo? Es lo único que un modelo de lenguaje da y un
   puntaje no.

---

## 1. Fallas de lógica de negocio y de datos

### 1.1 El detector de eventos no mira si la fuente contestó

`eventosEntreConsultas()` compara el crudo de t0 con el de t1 sin leer el
estado de cada fuente. Lo que la propia regla del proyecto dice ("la fuente
dice que no hay" ≠ "la fuente no contestó") no se cumple acá:

| Fuente caída | Dónde | Qué inventa |
|---|---|---|
| Retail o cooperativas en t0 | `operacionesPropias` | Toda deuda que ya tenía aparece como **crédito nuevo** en t1; si está en mora, como **impago nuevo**. |
| Buró en t1 | `operacionesPropias` | Sin deterioros ni créditos nuevos: la persona queda **observada y buena**. |
| IESS en t1 | `aportesPorMes` + `corteIessUsado` | Sin aportes, el corte cae al configurado: **pérdida del trabajo** para todo el que aportaba en t0, fechada el mes siguiente. Como es la primera causa con fecha, pasa a ser el **motivo principal** del impago. |
| SRI en t1 | regla de cierre | `if (enElAnio.length \|\| !ceses.length)`: sin datos del SRI no hay ceses y se agrega un **cierre de negocio**. |

**Medido sobre el ciclo simulado** (corte `4e18ca83-…`):

- En t0, 147 de las 2.565 solicitudes tenían el retail en error o faltante.
  De ellas salieron 44 de los 239 créditos nuevos en retail: 30 por cada 100
  personas, contra 8 por cada 100 en las que contestó. El exceso (~30
  créditos) es el artefacto.
- 136 tenían el IESS en error o faltante en t0. Ahí la regla de la 14.9 (un
  empleador que t1 trae en meses de t0 ya trabajaba ahí) protege bastante: el
  daño grande es con el IESS caído en t1.
- En las consultas de septiembre (2.961 perfiles), el IESS dio error en 270,
  demandas en 279 y retail en 281: **~9%**. En la reconsulta del 2026-10-03,
  ninguna de esas fuentes falló, y por eso el ciclo no lo sufrió en t1. En
  una reconsulta real con la tasa de septiembre, a cada persona que aportaba
  y cuyo IESS falle (~9% de las consultas) se le inventaría una pérdida de
  trabajo.

**Por qué la calificación no lo vio.** `procesar-reconsultas.mjs` corre el
detector entre t0 y la reconsulta real sin lo plantado, y lo que encuentra va
del lado de la verdad como "cambios reales de la semana". Un artefacto de
disponibilidad aparece en las dos comparaciones (es el mismo t0), así que se
cuenta como real y no como inventado. Por eso el detector sale con "2
inventados en total".

### 1.2 Dos definiciones de "malo" en la misma población

`lab_congelar_solicitudes` toma el resultado del **archivo** para el
desembolsado (¿cayó en nuestro crédito?) y del **buró** para el resto (¿cayó
en algún crédito nuevo o en uno que tenía?). La pestaña Variables y el
bosque con la población "solicitudes" mezclan las dos:

- un desembolsado que pagó nuestro crédito y cayó con otro banco es **bueno**;
- un no desembolsado en la misma situación es **malo**.

La variable "recibió nuestro crédito" queda correlacionada con el resultado
por construcción, no por riesgo. Las advertencias lo mencionan, pero el
cálculo no lo corrige. El buró de t1 ya existe también para los desembolsados
(la reconsulta es de todos): se puede aplicar la misma regla a todos.

### 1.3 La ventana no se controla para el resultado del buró

El corte tiene `ventana_meses` y el archivo la respeta (días de mora por
ventana, madurez). El resultado por buró no: es "está en impago en la foto
de t1". En el ciclo simulado no se nota porque todos los desembolsos caen en
la misma semana de septiembre y t1 está exactamente a 12 meses. En la
corrida real, con solicitudes de enero a diciembre y una reconsulta, la de
enero tiene casi 24 meses para caer y la de diciembre 12. Las cohortes viejas
parecen más riesgosas sin serlo. Tampoco se guarda cuántos meses se observó a
cada persona.

### 1.4 "Peor que B2" no es lo mismo que 90 días

La definición del negocio es "90 días de mora o una calificación peor que
B2". En la norma de calificación de cartera (a confirmar con el texto
vigente de la Junta), para **consumo y microcrédito** C1 empieza alrededor de
los 46 días y D en los 91; para **productivo**, C1 está cerca de los 91; para
**vivienda**, mucho más tarde. Consecuencias:

- en bancos (donde manda la calificación) un consumo es malo desde ~46 días;
  en cooperativas (donde mandan los días), desde 90;
- una persona con crédito en bancos parece más riesgosa que una igual en
  cooperativas, y las variables del buró de bancos ganan IV por la regla, no
  por el riesgo.

El buró de bancos trae el tipo de crédito por fila (`tipo`): la equivalencia
se puede hacer por tipo. Además, `lab_operaciones_fecha_del_impago` (101)
exige la fecha con 90 días fijos, aunque la definición sea un parámetro.

### 1.5 "Revisar" es acierto en un lado y aprobado en el otro

La decisión del negocio es "aprobar y revisar = aprobado". La Matriz y los
cuadrantes la cumplen: un "revisar" que cayó es un aprobado que cayó. Pero
`lab_motivos_de_cada_malo` cuenta ese mismo caso como "el modelo lo vio". El
mismo crédito es capital perdido en una pestaña y acierto en otra.

**Medido** (corte del ciclo, 2.528 observados):

| | Cayeron (211) | Pagaron (2.317) |
|---|---|---|
| Revisar, negar o bloqueado ("lo vio") | 169 (80%) | 1.267 (55%) |
| Sólo negar o bloqueado | 113 (54%) | 449 (19%) |

"Lo vio en 169 de 211" se lee como un acierto alto, pero el modelo manda a
revisar o negar a más de la mitad de la gente. La segunda fila es la que
dice algo.

### 1.6 "¿El modelo ya lo tenía?" deja pasar sustitutos

El explorador del crudo decide si el modelo ya tenía una condición
comparándola dentro de cada recomendación (Mantel-Haenszel con tres
estratos). Tres estratos son gruesos: dentro de "aprobar" el puntaje sigue
variando, y una condición correlacionada con algo que el modelo sí vio
sobrevive.

En el ciclo simulado, el impago se generó **sólo** con lo plantado
(calificación, atraso, demandas, continuidad, meses con aporte, licencia,
eventos cuyas probabilidades dependen de continuidad, RUC, hijos y número de
operaciones, y la cuota). Ningún campo de la data real puede anticipar ese
impago por sí mismo. Entonces "fax del empleador en el IESS" y "operaciones
CDC en cooperativas", los dos hallazgos "de la data real que nadie plantó"
(14.11), son **sustitutos de lo plantado** (empleo formal y continuidad; más
operaciones y más créditos de otros) o azar. La sección 14.11 los presenta
como "candidatos a mirar". En esta corrida, dos de tres hallazgos de "lo que
el modelo no vio" son falsos para el uso que se les quiere dar.

El explorador de significancia del catálogo tiene el problema al revés: su
"candidata" pide IV, q y estabilidad, pero **no** mide si la variable agrega
algo una vez conocido el puntaje.

### 1.7 Las variables del corte no son lo que vio el modelo

- `recalcular-grupos.mjs` y `recalcular-fuentes-ingreso.mjs` reescriben
  `standard_profile` en el mismo perfil, y `analysis_results` no guarda la
  versión de la estructura. Un corte de una carga real copia el perfil de
  hoy, no el que leyó el análisis.
- El ciclo rearma t0 con el código vigente (decisión de la 14.5). Es lo
  correcto para descubrir variables para el próximo modelo; no lo es para
  juzgar al modelo que decidió.

Son dos preguntas con dos fotos distintas, y hoy hay una sola. Desde la 090
existe `mensaje_al_modelo` para la primera, pero ningún análisis la tiene
todavía (medido: 0 de 62).

### 1.8 "Llega al modelo" es una marca escrita a mano

`lab_catalogo_variables.en_perfil_del_modelo` se mantiene a mano (58 de 59
activas dicen "sí"). La pregunta central del Laboratorio, "qué no vio el
modelo", depende de esa marca, y el perfil del modelo transforma mucho
(suma la deuda de todo el sistema, resume `fuentesIngreso.detalle`, oculta
campos apagados). Además, la consulta a `standard_profile_field_config` mira
`ruta[1]` y `ruta[2]`, que para rutas anidadas
(`fuentesIngreso.detalle.continuidadLaboral.meses`) compara contra `detalle`.

### 1.9 Los motivos del impago son reglas fijas, no medidas

"La cuota no cabía" es más de 35% del ingreso reportado al IESS;
"capacidad no medible" es todo ingreso que no está "Confirmado por un
tercero"; "vulnerabilidad visible" es continuidad menor a 12 meses, atraso o
ingreso sin confirmar. Son umbrales razonables, pero nadie los midió contra
datos:

- "capacidad no medible" alcanza a buena parte de los independientes:
  marca como "se podía ver" a mucha gente que pagó igual;
- el 35% sale del mismo supuesto que la simulación usa para plantar, así que
  la simulación no puede decir si el umbral es bueno;
- el ingreso del IESS es el mínimo para muchos (Ingreso Mínimo SBU): la
  relación cuota / ingreso sobrestima la carga de quien gana más de lo que
  aporta.

### 1.10 Menores

- **"Retail grande"** se aproxima con el saldo en t1 (≥ USD 2.000), que baja
  a medida que la persona paga o se castiga. Sigue sin definición del
  negocio.
- **"Entidad que empieza a reportar"**: cinco personas o más en t1 y ninguna
  en t0. Con una institución chica (200 solicitudes) no se dispara; con una
  grande puede marcar crecimiento real.
- **Bancos agrupados por entidad**: un crédito nuevo en un banco donde ya
  tenía otro no se ve (está dicho en 14.9; queda como límite del resultado
  por buró).
- **`primera_de_la_persona`** se calcula por carga: en un corte con dos
  cargas la misma persona puede contar dos veces.

---

## 2. Fallas de estructura

### 2.1 El Laboratorio no tiene qué medir del modelo real

Los cálculos de desempeño están listos; los puntajes reales no. El lote de
análisis está postergado por presupuesto, y la simulación usa una
distribución supuesta (45% aprobar, 35% revisar, 20% negar). Lo poco real
que hay apunta a otra cosa: de 14 análisis con recomendación, 6 son revisar
y 1 observar. Si el modelo real manda a revisar a la mayoría, la decisión de
la institución sobre "revisar" pasa a ser lo que define quién recibe crédito,
y el valor de la recomendación de tres niveles es bajo: lo que importa es el
puntaje.

### 2.2 La corrida real depende de piezas que no existen

Para correr el ciclo con una institución faltan: saber qué análisis son de
esa institución (`analysis_results` no tiene institución ni proyecto), armar
las solicitudes del período y la reconsulta enlazada a cada una. Las dos
primeras dependen de la entidad "solicitud" de la fábrica de crédito, que
está en pausa. Mientras tanto, "todas las solicitudes del período" son
todos los análisis de todas las instituciones juntas.

### 2.3 Lo que se calcula en el navegador no se guarda

Desde la 105, "lo demás de las fases C y D se calcula en el navegador sobre
el corte congelado y no se guarda". Se puede recalcular igual, pero:

- un informe a una institución cita números que no quedan en ningún lado con
  su versión del cálculo;
- el pendiente 0a (hallazgos críticos) tiene que volver a correr todas las
  pestañas al exportar;
- si mañana cambia una función de `estadistica.js`, el mismo corte da otro
  número y nada lo registra.

### 2.4 Cálculos duplicados

La regla del proyecto es "una sola implementación, nunca una copia". El IV
está en SQL (`lab_calcular_variables`) y en `estadistica.js`; el AUC, en
`lab_auc`, en `lab_calificar_simulacion` (otra vez escrito) y en el
navegador. Se prueban iguales en `probar-*`, lo que evita la diferencia de
hoy pero no la de mañana. Y dos copias que coinciden prueban que coinciden,
no que estén bien: las dos usan la misma población mezclada (1.2).

### 2.5 El ajuste de criterio es una puerta trasera al marco

Una propuesta `ajuste_criterio` aprobada entra al prompt como texto libre
(`ajustes_vigentes_actuales()`), sin versión nueva del marco, sin
comparación y sin medir su efecto. Era el error 5 de Retroalimentación
(sección 3.3 del diseño) y sigue abierto con otro nombre. Choca con la regla
"cambiar lo que lee el modelo es versión nueva del marco".

### 2.6 Ni las candidatas ni las propuestas cierran el ciclo

- **Candidatas**: el estado se cambia con un desplegable libre. "Aceptada"
  no exige haber confirmado la señal en otro corte (el principio 8 del
  diseño queda escrito, no aplicado). El taller de variables permite probar
  fórmulas hasta que una dé significativa, sin corrección por cuántas se
  probaron.
- **Propuestas**: `validacion_posterior` es texto. Después de aplicar un
  cambio no hay medición programada que diga si mejoró.

### 2.7 Mucha superficie para ningún dato real

16 migraciones, unas cuarenta pestañas y siete guiones, en dos días, con cero
datos reales y ninguna pantalla vista con sesión de admin. Cada pestaña es
algo que mantener cuando cambie la estructura del perfil, el catálogo o la
definición de malo, y la mayoría todavía no respondió una pregunta real.

---

## 3. Fallas del proceso de construcción

1. **Primero todas las pantallas, después el dato.** La lista del negocio se
   construyó completa antes de que circulara un solo dato real. El orden que
   protege es el inverso: el circuito mínimo con datos reales, y las
   pantallas a medida que hay algo que mostrar.
2. **"Hecho" quiere decir "el cálculo coincide consigo mismo".** Las pruebas
   comparan la base con el navegador y con valores publicados. Eso prueba la
   aritmética. No prueba la lógica de negocio (1.1 a 1.6 pasan todas las
   pruebas).
3. **Una sola semilla.** Las aceptaciones de las fases 3 y 6 ("plantadas 1.ª,
   2.ª, 5.ª y 8.ª", "detectado 76 de 79") son una sola realización. No se
   sabe con qué frecuencia se encuentran esas señales ni cuántos falsos
   hallazgos da el método.
4. **Efectos plantados grandes y umbrales compartidos.** Los coeficientes
   (2,0 a los huecos de aporte, 1,8 a perder el trabajo) son fuertes; nadie
   sabe si el Laboratorio encuentra un efecto realista con 300 créditos. Y
   donde la simulación y el cálculo usan el mismo umbral (cuota > 35%,
   ingreso no confirmado), coincidir es automático.
5. **Sin control negativo.** Nunca se corrió una simulación sin señal oculta
   para contar cuánto "encuentra" el método solo.
6. **Documentación que envejece en el lugar.** El diseño tiene 875 líneas que
   mezclan decisión, historia, estado y resultados. Hay afirmaciones viejas:
   la sección 13 del diseño y el punto 5 de `pendientes.md` dicen que
   instituciones y proyectos están "todavía sin construir" (existen desde la
   109), y la tabla 6.3 está cortada por un párrafo. Una sesión nueva lee
   como vigente lo que ya no lo es.

---

## 4. Fallas de comprensión (lo que se concluye y el número no dice)

| Se dijo | Lo que el número dice |
|---|---|
| "El modelo lo vio: 169 de 211" | También "lo vio" en el 55% de los que pagaron. Sólo con negar: 54% de los malos contra 19% de los buenos (1.5). |
| "Fax del empleador" y "CDC en cooperativas": de la data real, candidatos a mirar | Con un impago sintético no hay señal real posible: son sustitutos de lo plantado o azar (1.6). |
| "Bosque 0,698 contra motor 0,669" | El motor es sintético y el impago también; dice que el bosque reconstruye la regla plantada, nada del modelo real. |
| "Calibración: probabilidad = 1 / (1 + e^-(3,676 − 0,00727 × puntaje))" | Es la calibración del puntaje sintético. No sirve para ningún puntaje real y conviene que no circule fuera del Laboratorio. |
| "Detector: 2 inventados en total" | Los artefactos de disponibilidad se contaron como "reales de la semana" (1.1). |
| "Hallazgo crítico = todo resultado relevante y significativo, y va al informe" | Con el catálogo, el crudo (853 condiciones), las combinaciones y el taller, algo siempre sale significativo. Sin separar exploratorio de confirmado, el primer informe a una institución puede llevar falsos hallazgos (5.5). |

---

## 5. Propuestas

### 5.1 Cambio de rumbo: una cohorte propia, reconsultada cada tanto

Hoy el Laboratorio espera un archivo de una institución. Ya hay algo mejor
para empezar:

- **La cohorte cero**: las 2.567 personas de la cartera, con t0 = la
  consulta del 2026-09-25 (crudo guardado, no se pisa).
- **Reconsultarlas cada tres meses** (Novadata no cobra por ahora; la cartera
  entera tarda ~2 h 10 min y `consultar-lote.mjs` retoma). Cada ronda queda
  como su crudo en Storage y como una fila de reconsulta, igual que hoy.
- **Resultado**: malo en el sistema con la misma regla para todos (1.2), con
  **fecha aproximada al trimestre** (lo que hoy falta para 191 de 211 malos
  del ciclo y lo que impide las cosechas), y la **cura** a la vista: quien
  cayó y se puso al día entre dos rondas ya no se escapa (hoy se escaparon 47
  en la simulación).
- **A los 12 meses (septiembre de 2027)**: la primera prueba retrospectiva
  real, sin institución. Cuántos malos habrá no se sabe (la simulación
  supuso ~8% de los observados, ~200).
- **Los puntajes pueden esperar.** El perfil de t0 está congelado en el
  crudo: puntuarlo dentro de un año no tiene fuga (el modelo no sabe nada del
  futuro de la persona). El gasto se hace cuando haya resultado que medir, y
  con el marco que esté vigente entonces. Referencia de costo, con los
  números de `pendientes.md`: la cartera entera por lote, del orden de USD 50
  a 90; una muestra de 300, ~USD 10. **Sólo con autorización.**
- **Antes de empezar**: la base legal para reconsultar a quien no tiene una
  solicitud abierta (LOPDP) ya es una pregunta abierta del diseño; esta
  propuesta la vuelve urgente.

Si el negocio lo aprueba, conviene sumar a la cohorte, por ronda, a todas las
personas consultadas desde la pantalla en el período: la cohorte crece sola.

### 5.2 Un banco de prueba del modelo

El Laboratorio tiene que ser el paso obligado de cada versión del marco, no
un lugar para mirar después:

- **Qué es**: un conjunto fijo y versionado de perfiles de t0 (rearmados del
  crudo) con sus resultados a medida que maduran.
- **Qué mide de cada versión nueva**, sobre los mismos perfiles que la
  vigente (comparación pareada, que con pocos casos distingue más que dos
  muestras sueltas): cuánto cambia el score (diferencia pareada), cuántas
  recomendaciones cambian (McNemar), el AUC donde haya resultado maduro, y
  el ruido (una parte de los perfiles analizada dos veces).
- **Reemplaza** a los 14 casos de `comparar-razonamiento.mjs` como requisito
  para pasar un marco a producción, y es lo que la fase 7 ("simulación de
  marco candidato") ya pedía.
- **Usa la ruta de siempre**: `armarPedidoScoring()` y la API de lotes, con
  `llm_llamadas.tarifa = lote`. Cada corrida, con su costo estimado y
  autorización.

### 5.3 Un modelo retador estadístico permanente

Un puntaje clásico (WoE y regresión logística sobre el catálogo), entrenado
en una parte de la cohorte y medido en otra posterior, guardado con sus
coeficientes y su versión:

- es la **vara**: si el modelo de lenguaje no le gana a un puntaje de diez
  variables, eso es lo primero que hay que saber;
- muestra **dónde** el modelo de lenguaje gana o pierde (por segmento, por
  tramo de puntaje);
- abre una pregunta de negocio con números: ¿el puntaje lo da el modelo
  estadístico y el de lenguaje explica y marca excepciones?

El bosque de la fase F sirve para ordenar importancia; el retador tiene que
ser explicable y estable, por eso logística.

### 5.4 Arreglos de lógica, en orden

| Prioridad | Arreglo | Cómo se verifica |
|---|---|---|
| 1 | **Disponibilidad en el detector.** Leer el estado de cada fuente en t0 y t1 (`estadoPorFuente` del crudo o el `estado_por_fuente` del perfil). Si una fuente no contestó en cualquiera de las dos, sus eventos quedan "no medidos" (ni evento ni ausencia). Sin buró en t1, la persona queda "sin observar". Contarlo en la conciliación. | Rehacer el procesamiento del ciclo: los ~30 créditos de retail de más tienen que desaparecer; la calificación tiene que separar "no medido" de "real de la semana". Una prueba con un crudo de t1 sin IESS no puede dar pérdidas de trabajo. |
| 2 | **Dos resultados**: `malo_sistema` (buró, la misma regla para todos, desembolsados incluidos) y `malo_institucion` (archivo). Variables, explorador, bosque y retador, con el primero; el desempeño frente a la institución, con el segundo. | En el ciclo, la proporción de malos tiene que dejar de depender de "desembolsada" por construcción. |
| 3 | **Ventana por persona**: guardar los meses observados de cada solicitud y excluir (o censurar) a quien no completó la ventana del corte. Con la cohorte de 5.1 sale solo: cada persona se mira en la ronda que le corresponde. | Un corte a 12 meses no puede tener a nadie con más de 15 meses de observación ni con menos de 12. |
| 4 | **"El modelo lo vio" en tres**: negó (acierto), mandó a revisar (advertencia; decidió la institución), aprobó. Al lado, siempre, la proporción de los que pagaron con la misma marca. | Los números de 1.5 en la pestaña de motivos. |
| 5 | **"¿Ya lo tenía?" ajustado por el puntaje**, no por la recomendación: regresión logística malo ~ puntaje + condición, o la comparación dentro de deciles de puntaje. Una sola función para el catálogo, el crudo y el taller. | En el ciclo, el fax del empleador y CDC tienen que perder la marca, y la licencia plantada tiene que conservarla. |
| 6 | **"Llega al modelo" por prueba automática**: para cada variable del catálogo, cambiar el valor en un perfil real, rearmar el perfil del modelo (`armarPerfilDelModelo`) y ver si cambia. Correrlo en `probar-pantallas-laboratorio.mjs` y guardar el resultado en el catálogo. | La marca de las 59 variables coincide con la prueba; las que no, se corrigen o se explican. |
| 7 | **Dos fotos en el corte**: lo que leyó el modelo (`mensaje_al_modelo`, para juzgarlo) y t0 rearmado hoy (para descubrir). Y guardar la versión de la estructura en `analysis_results`. | Un corte con análisis posteriores a la 090 muestra las dos y su diferencia. |
| 8 | **Definición de malo por tipo de crédito**: la equivalencia calificación → días por tipo (con la norma a la vista), o "peor que C2" para consumo; y "retail grande" definido por el negocio. | Con la definición nueva, la tasa de malos de bancos y de cooperativas a igual atraso tiene que coincidir. |
| 9 | **Los umbrales de los motivos, medidos**: tasa de malos por tramo de cuota / ingreso en vez del 35% fijo; "capacidad no medible" sólo si además el ingreso no alcanza para la cuota. | La pestaña muestra el tramo donde la tasa sube, con su intervalo. |

### 5.5 Hallazgos: registrarlos, no juntarlos al exportar

> **Descartada por el negocio el 2026-10-06** (10.3): los hallazgos son los
> resultados de los análisis estadísticos, guardados (10.5), sobre los que el
> modelo dio por buenos y cayeron.

En lugar de la función que junta lo significativo de cada pestaña al
exportar (pendiente 0a):

- **Una tabla `lab_hallazgos`**: corte, análisis, prueba, efecto, n, n de
  malos, q, versión del método, y un estado: **exploratorio → confirmado en
  otro corte → descartado**. Cada pantalla que encuentra algo lo registra (o
  lo registra quien lo mira); el Inicio y el informe leen de ahí.
- **Confirmar en otro lado**: un hallazgo pasa a "confirmado" sólo si se
  repite en un corte independiente (otro período, u otra mitad separada
  desde el principio y usada una sola vez).
- **El informe en dos partes**: confirmados, y exploratorios "a confirmar".
  La decisión del negocio del 2026-10-04 se mantiene (todo lo relevante y
  significativo va), pero con su estado a la vista. **Esto es para que lo
  decida el negocio**: cambia lo que lee la institución.
- **Las candidatas y las propuestas, con requisito**: "aceptada" exige un
  hallazgo confirmado; una propuesta de dato nuevo exige además la fecha
  desde la que existe el dato.
- **En un corte sintético**, todo hallazgo que no sea lo plantado se marca
  como "sustituto o azar": es la medida de cuántos falsos hallazgos da el
  método.

### 5.6 Cerrar el ciclo de las propuestas

- Cada propuesta aplicada nace con su medida de éxito, el corte donde se va
  a medir y la fecha. El banco de prueba (5.2) la mide al aplicarse; la
  cohorte (5.1), cuando madura.
- El ajuste de criterio pasa por el mismo banco de prueba antes de entrar en
  vigencia, o se retira como tipo y todo va por versión nueva del marco.
  Recomendado: retirarlo; hoy no hay ninguno vigente (una sola versión del
  criterio, sin ajustes).

### 5.7 Usar lo que sólo un modelo de lenguaje da: su texto

El modelo escribe positivos, negativos y acciones. Ningún puntaje
estadístico da eso, y el Laboratorio no lo usa:

- **Para cada aprobado que cayó**, cruzar sin modelo (por reglas y palabras
  completas, como `demandas.ts`) los negativos que escribió contra el motivo
  que se detectó: **"lo dijo y no lo pesó"** (pide cambiar cómo pesa ese tema
  en el marco) contra **"no lo dijo"** (pide revisar si el dato le llegó y
  cómo se presenta).
- **Con el ruido**: el mismo perfil analizado dos veces; qué factores
  aparecen y desaparecen entre las dos. Los inestables son los que el marco
  no deja claros.
- Es el material más directo para la próxima versión del marco, y sale
  gratis de lo que ya se guarda.

### 5.8 El proceso de construcción

1. **Congelar pantallas nuevas** hasta que circule la cohorte real. Primero:
   el recorrido con sesión de admin (pendiente 0) y los arreglos 1 a 3 de
   5.4.
2. **Un criterio de "hecho" que pruebe la lógica**: varias semillas (20, por
   ejemplo), efectos chicos y realistas, distintos tamaños (300 y 1.000
   créditos), y un **control negativo** sin señal oculta. Se informa con qué
   frecuencia se encuentra cada señal y cuántos falsos hallazgos aparecen.
3. **Una sola implementación por cálculo**: lo que se guarda y se cita, en la
   base; el navegador lo llama o importa el mismo módulo. Lo que hoy está dos
   veces (IV, AUC) se deja en un solo lugar.
4. **La simulación con lo real que haya**: la distribución de recomendaciones
   del modelo real en cuanto exista (2.1), y las tasas de falla de cada
   fuente de septiembre (~9%) en t1, para que el detector se pruebe con
   fuentes caídas.
5. **Documentación en dos**: "cómo funciona hoy" (corta, vigente, se corrige
   en el lugar) y el historial (fechado, no se toca). Corregir lo viejo de
   2.7 y 3.6.

---

## 6. Orden sugerido

| Cuándo | Qué | Costo |
|---|---|---|
| Ahora | Arreglos 1 (disponibilidad), 2 (dos resultados), 4 ("lo vio" en tres), 5 (ajuste por puntaje) y 6 (alcance al modelo); rehacer el procesamiento y el corte del ciclo; `lab_hallazgos` | Sin modelo |
| Ahora, con decisión del negocio | Base legal y frecuencia de la cohorte (5.1); definición de malo por tipo y "retail grande" (5.4.8); informe en dos partes (5.5); retirar el ajuste de criterio (5.6) | Sin modelo |
| Primera ronda | Reconsulta trimestral de la cohorte (fines de diciembre de 2026, tres meses después de t0) | Sin costo de Novadata, por ahora |
| Con autorización de gasto | Banco de prueba y puntajes de la cohorte (5.2): una muestra para conocer la distribución real de recomendaciones; el resto cuando madure el resultado | USD 3-4 por cada 100 análisis por lote |
| Con la primera institución | Institución en el análisis, solicitudes del período, reconsulta enlazada (2.2) | — |

---

## 7. Lo que está bien y conviene conservar

- Los principios de la sección 4 del diseño (sin fuga, inmadura no es buena,
  tamaño de muestra siempre, sintético marcado, el modelo de lenguaje no
  concluye). Las fallas de arriba son lugares donde no se cumplieron, no
  principios equivocados.
- El corte congelado y los resultados que nunca se pisan.
- Comparar dos fotos de la misma persona en vez de pedirle a la institución
  todo: la reconsulta es la mejor idea del diseño, y la 5.1 sólo la vuelve
  periódica.
- La simulación como prueba de la maquinaria, con la verdad aparte y leída
  por una sola función.
- Lo que la 14.9 aprendió del buró, del IESS y del SRI: es conocimiento de
  las fuentes que no está escrito en ningún otro lado.

---

## 8. Preguntas para el negocio

Contestadas el 2026-10-06: sección 10.

1. ¿Se arma la cohorte propia con reconsultas trimestrales? ¿Con qué base
   legal (LOPDP)?
2. ¿La definición de malo usa la equivalencia por tipo de crédito, o "peor
   que C2" para consumo? ¿Qué es "retail grande"?
3. ¿El informe a la institución separa hallazgos confirmados de
   exploratorios?
4. ¿Se retira el ajuste de criterio como tipo de propuesta?
5. ¿Se congelan las pantallas nuevas hasta tener la cohorte real?
6. ¿Se autoriza una muestra chica (~100 análisis, USD 3-4) para conocer la
   distribución real de recomendaciones de marco-v28?

---

## 9. Cómo se midió y qué no se verificó

Consultas de sólo lectura a la base el 2026-10-04:

- `analysis_results` sin fallo: por recomendación y origen, por versión del
  marco, con y sin `mensaje_al_modelo`, clientes distintos.
- `client_profiles.estado_por_fuente` de siete fuentes (buró de bancos,
  cooperativas, retail, IESS, SRI, demandas, denuncias), en las consultas del
  2026-09-20 al 03/10 y en la reconsulta del 03/10.
- Sobre la carga `1196978e-…` y el corte `4e18ca83-…`: el estado de las
  fuentes en t0 de cada solicitud, los eventos de trabajo, cierre y créditos
  de retail según ese estado, y los observados por recomendación y resultado.

**No se verificó**: ninguna pantalla (fuera del alcance); la equivalencia
calificación → días contra el texto vigente de la norma (se validó el
2026-10-06: 10.2); el efecto de los arreglos (no se cambió código); los
cálculos del navegador uno por uno (se leyeron los de calibración,
segmentos, significancia y candidatas).

---

## 10. Decisiones del negocio del 2026-10-06 y su validación

Cada decisión con lo que se revisó para validarla (código, base, crudo
local, norma) y lo que cambia. Los conteos del crudo son de la reconsulta
del 2026-10-03 (`research/novadata-raw-2026-10-03/`, 2.567 personas): son la
situación a esa fecha, no impagos nuevos.

### 10.1 Cohortes reconsultadas (pregunta 1)

**Decidido:** se reconsultan en Novadata las solicitudes cada tres meses,
para medir el resultado y actualizar la situación del cliente. La base legal
es la autorización que el cliente firma al presentar la solicitud de
crédito: cubre fuentes internas y externas desde ese momento.

**Validación**

- Se puede hacer con lo que hay: `consultar-lote.mjs` con `--crudo=` (retoma
  si se corta; ~2 h 10 min la cartera entera; Novadata no cobra por ahora).
- La base no lo admite todavía: una solicitud tiene una sola reconsulta
  (`lab_reconsultas.solicitud_id` es único, 098) y un corte sólo puede ser a
  12 o 24 meses (095). Hacen falta rondas (3, 6, 9, 12 y 24) y cortes a esos
  horizontes.
- **Propuesta: reconsulta por aniversario.** Cada mes se reconsulta a las
  solicitudes que cumplen 3, 6, 9 o 12 meses. Para la cartera actual (t0 =
  2026-09-25) es lo mismo que un trimestre: fines de diciembre de 2026,
  marzo, junio y septiembre de 2027. Con solicitudes que entran todos los
  meses, mide a cada una a los 3, 6, 9 y 12 meses justos (lo que pide 10.7)
  y reparte la carga.
- **Requisito antes de la primera ronda:** el arreglo de disponibilidad del
  detector (1.1). Con la tasa de fallas del IESS de septiembre (~9%), una
  ronda sin el arreglo inventaría pérdidas de trabajo.
- La autorización cubre a quien presentó una solicitud: si entre las 2.567
  hay personas consultadas por otro motivo (pruebas, muestras), quedan fuera
  de la cohorte.
- Cada ronda deja un perfil nuevo por persona y la ficha muestra la situación
  actualizada, que es lo buscado. El t0 de cada solicitud no se mueve: es el
  perfil que quedó guardado en la solicitud.

### 10.2 Definición de impago (pregunta 2)

**Decidido:**

- Con crédito de la institución y sus días de mora: Basilea, más de 90 días.
- Sin crédito de la institución: el buró, con más de 90 días, o la
  calificación equivalente a más de 90 días en consumo (bancos y
  cooperativas). Retail grande: créditos de más de USD 2.000, **cambiado a
  más de USD 500** al confirmar (12).

**La norma.** Tabla 5 del informe de la Superintendencia de Bancos
"Comportamiento del crédito de consumo del sistema financiero nacional"
(septiembre de 2019), días de morosidad por categoría en consumo:

| Categoría | Bancos privados y públicos | Cooperativas y mutualistas |
|---|---|---|
| A1 | 0 | 0 a 5 |
| A2 | 1 a 8 | 6 a 20 |
| A3 | 9 a 15 | 21 a 35 |
| B1 | 16 a 30 | 36 a 50 |
| B2 | 31 a 45 | 51 a 65 |
| C1 | 46 a 70 | 66 a 80 |
| C2 | 71 a 90 | 81 a 95 |
| D | 91 a 120 | 96 a 125 |
| E | más de 120 | más de 125 |

Es la norma vigente en 2019. Falta confirmar que la Junta no la cambió
después (hay resoluciones de 2024 y 2025 sobre calificación de cartera).

**Validación**

- En bancos, "más de 90 días en consumo" es **D o E**. "Peor que B2", lo que
  usa hoy el código, empieza a los 46 días. Son dos reglas distintas y hay
  que quedarse con una: la decisión se lee como **D o E**.
- Novadata no dice de qué tipo es una operación de bancos: el campo `tipo`
  vale "C" en las 8.980 operaciones propias de la reconsulta. No se pueden
  usar las tablas de productivo o vivienda; la de consumo es la única
  aplicable, y se aplica a todas.
- En cooperativas Novadata trae los días (`num_dias_morosidad`): vale "más
  de 90" directo, sin pasar por su calificación (que tiene otra tabla).
- En retail Novadata no trae el monto del crédito. Una fila de retail tiene
  la casa comercial, la deuda total, lo vencido, los días de mora, lo
  castigado y lo judicial. "Crédito de más de USD 2.000" se aplica como
  **deuda total con esa casa comercial de más de USD 2.000**.
- El código cuenta hoy "90 o más" (Basilea es "más de 90") y "2.000 o más"
  en retail (la definición original decía "más de"). Las dos se corrigen con
  una definición nueva: una definición no se edita, se agrega otra.
- Lo que cambia, en la reconsulta del 03/10:
  - 78 personas tienen una operación propia en bancos en C1 o peor; 28 de
    ellas sólo en C1 o C2: con "peor que B2" estarían en impago y con "más de
    90 días" no;
  - en cooperativas, 15 personas pasan de 90 días; 8 están entre 46 y 90;
  - en retail, 38 pasan de 90 días; 22 de ellas sólo con deudas de USD 2.000
    o menos, que no cuentan (con el umbral confirmado de USD 500, 14).
- Basilea también cuenta como impago lo que es improbable que se pague
  aunque no llegue a 90 días: castigo, reestructuración por dificultad y
  demanda judicial. El código ya los cuenta y se mantienen (12.3).
- Si la institución no trae los días de un crédito, su propia operación se
  lee en el buró con la regla de los no desembolsados. Para eso hay que
  registrar cómo aparece la institución en el buró (`institucion_en_buro`).
- El simulador planta C1, C2, D o E al azar para un malo de bancos: con la
  regla nueva la mitad dejaría de ser malo. Se ajusta (D o E para el
  impago; C1 y C2 como mora temprana) y el ciclo se vuelve a correr.
- Los dos resultados no se mezclan en un mismo cálculo (1.2): cada análisis
  dice de cuál sale. Para las variables con todas las solicitudes se usa el
  del buró para todos, porque también se reconsulta a los desembolsados.

### 10.3 El reporte mensual y la prueba del modelo (pregunta 3)

**Decidido:** la institución carga un reporte cada mes que confirma qué
solicitudes recibieron crédito. Un análisis específico prueba el resultado
del modelo: aprobar y revisar = no impago; negar = impago. Los hallazgos son
los análisis estadísticos, descriptivos, inferenciales y exploratorios que
aporten evidencia para identificar a quienes el modelo dio por buenos (no
impago) y cayeron. No se usa un registro de textos por crédito.

**Validación**

- La base trata hoy un archivo como una foto completa (días máximos por
  ventana y fecha del primer impago escritos por la institución), y una
  operación es única dentro de su carga. Con un reporte por mes, el mismo
  crédito estaría en doce cargas y un corte con varias lo contaría doce
  veces. Hace falta:
  - la operación única por institución (institución + número), con lo que
    no cambia: cédula, producto, monto, plazo, fecha de desembolso, cuota y
    canal;
  - una fila por operación y mes con lo que sí cambia: días de mora al
    cierre, saldo y estado;
  - lo demás lo calculamos nosotros: los días máximos por ventana, la fecha
    del impago (el día en que pasó de 90, que sale del cierre en que se vio
    y sus días) y si se curó. La planilla de la institución queda más simple:
    el estado de cada crédito al cierre del mes;
  - un crédito que deja de aparecer sin estar cancelado ni castigado queda
    "sin reporte" (no medido), no bueno.
- Para saber qué solicitudes son de cada institución no hace falta esperar
  a la fábrica de crédito: cada análisis guarda quién lo pidió
  (`ingestion_runs.requested_by`) y cada usuario tiene su entidad
  (`profiles.entidad`, texto libre). Falta atar el usuario a la institución
  del Laboratorio (`profiles.institucion_id`).
- Con lo desembolsado, la prueba mide sobre todo cuántos de los que el
  modelo dio por buenos cayeron. Los negados casi no reciben crédito (en el
  ciclo, 3 de 296), así que la columna "el modelo dijo impago" queda casi
  vacía; esa mitad la dan los negados sin crédito, por el buró (10.2).
- La Matriz muestra hoy dos lecturas ("negar" y "negar o revisar"): queda
  una, la decidida. Y hay tres lugares que tratan "revisar" distinto y se
  alinean:
  - los motivos cuentan un revisar que cayó como "el modelo lo vio";
  - la lista de aprobados que cayeron (`casosDeError`) sólo toma aprobar;
  - "Los que cayeron" (`losQueCayeron`) mira sólo aprobar si no se elige
    otra cosa.
  Con la decisión, un revisar que cayó es un error del modelo en los tres.
- La evidencia sobre los que el modelo dio por buenos y cayeron sale de los
  análisis guardados (10.5) y va al Informe de Desempeño del Modelo:
  - la tasa de impago de aprobar y de revisar, con su intervalo;
  - en qué se diferencian, dentro de aprobar y revisar, los que cayeron de
    los que pagaron: variables, faltantes, combinaciones y relaciones que no
    van en una sola dirección, con la corrección por comparaciones múltiples;
  - qué datos anticipan el impago dentro de "no impago" una vez conocido el
    puntaje: lo que el modelo no vio (5.4, arreglo 5);
  - los segmentos donde falla más;
  - las cosechas por recomendación (10.8);
  - los eventos que precedieron cada caída.

### 10.4 Retirar el ajuste de criterio (pregunta 4)

**Decidido:** se retira.

**Validación**

- No hay ningún ajuste en vigencia (una sola versión del criterio, ninguna
  propuesta). Con la lista vacía, `armarPedidoScoring()` no agrega el bloque
  de ajustes, así que el pedido al modelo queda igual y no hace falta versión
  nueva del marco. Se verifica comparando el pedido antes y después.
- Otro motivo para retirarlo: `mensaje_al_modelo` guarda el perfil que leyó
  el modelo, no las instrucciones. Un ajuste en vigencia no habría quedado en
  lo guardado.
- El orden sigue la regla 8: primero el código (el análisis deja de leer el
  criterio; Propuestas deja de ofrecer el tipo; "Criterio vigente" sale del
  menú) y su despliegue; después la base (el disparador y las funciones del
  criterio). `criterio_versiones` queda como historia: los análisis viejos
  la referencian.

### 10.5 Guardar lo que se calcula en el navegador

**Decidido:** se guarda.

- Cada resultado va a `lab_resultados` con la versión del cálculo y una
  huella: corte, tipo, población, parámetros y versión. Una huella que ya
  está no se guarda otra vez: el corte está congelado y el número es el
  mismo. Si cambia el cálculo, cambia la versión y se guarda al lado.
- Lo que mira el corte entero (discriminación, segmentos, estabilidad,
  descriptivas, faltantes, inferencia, significancia, los que cayeron,
  cosechas) se guarda solo al calcularse. Lo que se mueve a mano (umbrales,
  tramos, taller, una variable o un par) se guarda con un botón.

### 10.6 Una sola implementación de cada cálculo

**Decidido:** se corrige.

- No son sólo el IV y el AUC. También el KS, el intervalo de Wilson, el PSI
  y el error del AUC están en SQL y en el navegador, y el AUC una tercera vez
  dentro de la calificación de la simulación.
- La regla: la estadística vive sólo en `src/lib/estadistica.js`, que usan el
  navegador y los guiones. La base congela, vincula, cuenta y guarda.
- Las funciones SQL que calculan estadística (`lab_auc`, `lab_wilson`,
  `lab_calcular_desempeno`, `lab_calcular_variables`, `lab_estabilidad`) se
  retiran después de publicar las pantallas que ya no las llaman. Las que
  cuentan (matriz, cuadrantes, motivos, calificación) devuelven conteos y el
  navegador agrega los intervalos.
- Las pruebas que hoy comparan la base con el navegador pasan a comparar
  contra valores conocidos y contra los resultados guardados.

### 10.7 Variables candidatas a 3, 6, 9 y 12 meses

**Decidido:** una variable se prueba en varios cortes (t3, t6, t9 y t12) y
se decide al año de maduración, si se repite.

**Validación**

- Se había propuesto medir en t3 sólo la mora temprana, porque los 91 días
  llegan como pronto en el cuarto mes. **Corregido por el negocio al
  confirmar (12):** puede pasar en t3, aunque sea raro (31 + 31 + 30 = 92
  días sin pagar desde la primera cuota). En t3 se mide todo: impago, mora
  temprana y la lista de observación.
- Los cuatro cortes son las mismas personas: una asociación por azar en t3
  tiende a seguir en t12. La repetición prueba que la señal es estable, no
  que sea real. Se acepta en t12 si la dirección es la misma en los cuatro
  cortes y es significativa en t12, con la corrección por comparaciones
  múltiples. Cuando la cohorte siguiente llegue a su t12, se confirma ahí;
  eso no frena la decisión.
- El registro de candidatas guarda la evidencia de cada horizonte, y
  "aceptada" sólo se puede marcar con la de t12.

### 10.8 Cosechas mes a mes con el reporte de la institución

**Pedido:** un análisis de cosechas que muestre resultados desde el mes 1
(mes 1 → mes 2 → mes 3 → mes 4...) con lo que cargue la institución.

**Validación**

- Necesita el reporte mensual (10.3): con una sola foto no hay mes a mes.
- Con "más de 90 días", los primeros meses dan casi siempre cero. Para ver
  algo desde el mes 1, cada cosecha muestra varias líneas: alguna vez con 1
  día de atraso o más, con 15 o más (la lista de observación), con 30 o más,
  con 60 o más y con más de 90 (el impago).
- Cada cosecha (mes de desembolso) muestra sólo los meses que ya vivió, por
  número de créditos y por monto, con un aviso si tiene menos de 30
  créditos.
- Separada por recomendación (aprobar y revisar) y por tramo de puntaje, es
  la primera lectura del modelo, a los 3 o 6 meses y antes del año: si las
  cosechas de revisar no suben más rápido que las de aprobar, el modelo no
  está ordenando.
- Reemplaza el cálculo de la pestaña Cosechas que ya existe (hoy sale de la
  fecha del primer impago): no es una pantalla nueva.

### 10.9 Lo demás que quedó decidido

- Sin muestra con el modelo de lenguaje hasta que la estructura y el marco
  estén depurados (pregunta 6). Hasta entonces el Laboratorio sigue
  midiendo un modelo sintético, y el banco de prueba (5.2) espera.
- Pantallas nuevas congeladas hasta tener datos reales (pregunta 5).
- Para profundizar: cómo medir una propuesta después de aplicada
  (`docs/pendientes.md`).

---

## 11. Plan

> Hechas las fases 1 y 2 (secciones 13 y 14); desde el 2026-10-07 el plan
> vivo es `docs/laboratorio-guia.md`.

Fecha que manda: la primera ronda de reconsulta de la cartera, a fines de
diciembre de 2026. La fase 1 y las reconsultas de la fase 3 tienen que estar
antes.

| Fase | Qué | Decisión |
|---|---|---|
| 1. Lógica | Disponibilidad de las fuentes en el detector (1.1); definición nueva y el simulador con D o E; "revisar" = no impago en todos lados; el resultado del buró para todos cuando se juntan poblaciones. Rehacer el procesamiento y el corte del ciclo. | 10.1, 10.2, 10.3 |
| 2. Orden | Guardar los resultados con su huella; una sola implementación de la estadística; retirar el ajuste de criterio. | 10.4, 10.5, 10.6 |
| 3. Seguimiento | Operación única por institución y reporte mensual; reconsultas por aniversario; cortes a 3, 6, 9, 12 y 24 meses; solicitudes por institución. | 10.1, 10.3 |
| 4. Análisis | Cosechas mes a mes; la evidencia sobre los que el modelo dio por buenos y cayeron, al informe; candidatas por horizonte. | 10.3, 10.7, 10.8 |

Ninguna fase usa el modelo de lenguaje ni agrega pantallas nuevas.

## 12. Confirmado por el negocio el 2026-10-06

1. Bancos: **D o E** (equivalente a más de 90 días en consumo). Sí.
2. Retail: la deuda total con la casa comercial (Novadata no trae el monto
   del crédito), **de más de USD 500**.
3. Castigo, reestructuración y demanda judicial cuentan como impago aunque
   no lleguen a 90 días (Basilea). Sí.
4. **En t3 también se mide el impago**: es raro pero puede pasar (tres
   meses seguidos sin pagar: 31 + 31 + 30 = 92 días). Y una **lista de
   observación**: quien llegó a 15 días de atraso dentro del primer año es
   grave aunque no caiga en impago, y queda en la lista aunque se haya puesto
   al día.
5. Reconsulta por aniversario de cada solicitud (3, 6, 9 y 12 meses). Sí.
6. **La tabla de calificación está bien por ahora, pero tiene que ser un
   parámetro** de la configuración del Laboratorio, no código.

Hecho en la fase 1 (110, sección 13).

---

## 13. Fase 1, hecha el 2026-10-06

### 13.1 Qué cambió

- **El detector** (`_shared/eventos-entre-consultas.ts`) mira el estado de
  cada fuente con la regla de `calidad-de-la-consulta.ts`. Una fuente cuenta
  sólo si contestó en t0 y en t1: si no, sus eventos quedan "no medidos". Si
  bancos o cooperativas no contestaron, la persona queda sin observar en el
  buró. Devuelve además cada operación de t1 con su estado en t0, para que el
  corte aplique la definición (antes el detector filtraba los deterioros con
  una regla propia). `scripts/probar-detector.mjs` lo prueba con fuentes
  caídas: 20 controles; el detector anterior inventaba el crédito nuevo, la
  pérdida del trabajo y el cierre del negocio en los tres casos.
- **El impago es un parámetro** (110): la tabla de calificación versionada
  (`lab_tablas_calificacion`, versión 1 = la de la Superintendencia para
  consumo) y la definición con sus columnas nuevas (más de N días, categorías
  de bancos, retail con deuda de más de X, observación desde N días). La
  vigente: más de 90 días, bancos D o E, retail con deuda de más de USD 500,
  observación desde 15 días, castigo, reestructuración y demanda judicial. Se
  administran en Datos y cartera › Configuración. La definición del
  2026-10-03 da lo mismo que antes.
- **La lista de observación**: en el archivo, el máximo de días del primer
  año (15 o más, aunque se haya puesto al día); en el buró, una operación que
  llegó a 15 días o más en el año (en bancos, B1 o peor). Está en la Matriz
  (por recomendación), en Investigación de casos (tercera lista) y en el
  resumen del corte.
- **"Revisar" = no impago** en la Matriz (una sola lectura), los motivos ("el
  modelo lo vio" es sólo negar), la lista de aprobados que cayeron y "Los que
  cayeron" (por defecto, aprobar o revisar).
- **Dos resultados por solicitud**: `malo` (por grupo) y `malo_buro` (el buró
  para todos). La población de solicitudes en el navegador y el IV de la
  base usan el del buró para todos.
- **El simulador** planta el impago en bancos como D o E según los días (la
  tabla), más de 90 días en todo lo demás, y tira fuentes en t1 con las tasas
  de septiembre para probar el detector.
- **El explorador del crudo** usa también el buró para todos en la población
  de solicitudes.

### 13.2 Qué se midió (ciclo simulado otra vez: carga `746e5271-…`, corte `0c708daa-…`)

Detalle en `docs/laboratorio-de-riesgo.md`, 14.12.

- **El detector ya no inventa.** Con fuentes caídas en t0 (las reales de
  septiembre) y en t1 (plantadas), 0 eventos inventados en todos los tipos,
  y lo plantado se encuentra igual que antes (créditos de otros 998 de
  1.033; trabajo, cierres, pensiones, demandas y Fiscalía, todos). Los 44
  créditos nuevos en retail inventados del primer ciclo bajaron a 0.
- **La señal plantada se sigue encontrando** con la definición nueva y el
  buró para todos: la variable que el modelo no recibe sale 5.ª y candidata;
  el campo que sólo está en el crudo, significativo y "el modelo no lo
  tenía".
- **La prueba con lo desembolsado** (307 créditos, 33 impagos): aprobar 8,0%
  y revisar 21,8% de impago; 46 en la lista de observación. La sensibilidad
  de "negar" es 3% porque casi no se desembolsa a los negados: la otra mitad
  la dan los negados sin crédito (13,4% de impago por el buró contra 3,0% de
  aprobar).
- **Lo que la fase 1 no arregló y se vio:** cinco de los seis hallazgos de
  "lo que el modelo no vio" en el crudo son sustitutos de lo plantado (pasan
  el ajuste por recomendación). Es el arreglo 5 de 5.4 (ajustar por el
  puntaje), que queda para después.
- **Con Basilea y una sola foto**, de 265 impagos plantados sin crédito se
  ven 141: 32 se curaron antes de t1, 28 todavía no pasaban de 90 días y 57
  no dejan marca. Las reconsultas a los 3, 6, 9 y 12 meses son las que lo
  achican.

**No se verificó:** ninguna pantalla con sesión de admin (Configuración,
Matriz, Investigación de casos, Los que cayeron, Nuevo corte). Los cálculos
de todas las pestañas pasan `scripts/probar-pantallas-laboratorio.mjs` en los
tres cortes y la estadística, `scripts/probar-estadistica.mjs`.

---

## 14. Fase 2, hecha el 2026-10-07

### 14.1 Qué cambió

- **Una sola implementación de la estadística** (10.6). Vive sólo en
  `src/lib/estadistica.js`, que usan el navegador y los guiones. La base
  congela, vincula y cuenta: la 111 suma `lab_contar_matriz`,
  `lab_contar_cuadrantes`, `lab_contar_motivos` y `lab_contar_calificacion`,
  que devuelven conteos. `src/lib/resultadosDelCorte.js` arma con la
  estadística lo que antes calculaba la base (desempeño, variables,
  estabilidad del puntaje, los intervalos de Wilson y el AUC de la
  calificación) con la misma forma, así que las pestañas no cambiaron.
  `scripts/explorar-crudo.mjs` dejó sus copias (Wilson, IV, chi cuadrado,
  AUC, Benjamini-Hochberg) y usa también `estadistica.js`. La 112 borró las
  nueve funciones que calculaban (`lab_auc`, `lab_wilson`,
  `lab_calcular_desempeno`, `lab_calcular_variables`, `lab_estabilidad`,
  `lab_calcular_matriz`, `lab_calcular_cuadrantes`, `lab_calcular_motivos`,
  `lab_calificar_simulacion`).
- **Todo lo calculado se guarda** (10.5). `lab_resultados` suma la huella
  (SHA-256 del corte, el tipo, la población, los parámetros y la versión
  del cálculo, `VERSION_DEL_CALCULO`) y el origen (`base`, `navegador` o
  `guion`); una huella que ya está no se guarda otra vez. Guardan solas al
  calcularse Discriminación, Segmentos, Cosechas, Descriptivas, Faltantes,
  Correlaciones, Significancia, Los que cayeron, Lo que decidió la
  institución e Inferencia (todas las variables); con un botón, Umbrales,
  Tramos, Distribuciones, Comparar cortes, Taller, Inferencia de una
  variable, Estabilidad (el PSI del puntaje y el de las variables) y
  Calibración. Lo guardado no lleva filas de personas ni cédulas: se resume
  antes (`RESUMEN`).
- **El ajuste de criterio se retiró** (10.4). `analyze-client` ya no lo
  lee (desplegada el 2026-10-07), ni el lote ni la comparación de
  razonamiento; Propuestas no ofrece el tipo y "Criterio vigente" salió del
  menú (la dirección vieja lleva a Propuestas). La 112 borró el disparador y
  las siete funciones del criterio, y una propuesta ya no puede ser de ese
  tipo. `criterio_versiones` (una versión, sin ajustes) y
  `analysis_results.criterio_version_id` (17 análisis) quedan como
  historia.

### 14.2 Qué se midió

- **Lo nuevo da lo mismo que la base**, en los tres cortes y antes de
  borrar nada: desempeño (n, malos, AUC con su intervalo, Gini, KS, tasa
  por recomendación con Wilson, por tramo y por versión), variables en las
  dos poblaciones (IV, cobertura y "llega al modelo"; la mayor diferencia de
  IV, menor a 0,001), matriz, cuadrantes y motivos (el mismo JSON),
  calificación de la simulación (AUC contra lo plantado y el resto igual) y
  el PSI del puntaje entre los dos primeros cortes (0,3094 en los dos).
- **El explorador del crudo** da la misma salida con la estadística común.
- **El pedido al modelo quedó igual byte a byte** sin el bloque de ajustes:
  50 de 50 pedidos armados con perfiles reales, comparados con la versión
  anterior. Por eso no hizo falta versión nueva del marco. No se llamó al
  modelo.
- **Después de la 112** no queda ninguna de las 16 funciones borradas.
  `scripts/probar-estadistica.mjs` da "Todo coincide" contra lo que guardó
  la base (AUC 0,7407, KS 0,3755 y el IV de 59 variables, con una
  diferencia máxima de 0,00005) y `scripts/probar-pantallas-laboratorio.mjs`,
  "Todo cuadra" en los tres cortes, con dos controles nuevos: lo guardado no
  lleva cédulas (y el control encuentra una si no se resume) y la misma
  huella sale igual dos veces. `analyze-client` arranca: a un pedido sin
  cédula contesta con su propio error, sin llegar al modelo.
- La comparación llamó a las funciones viejas, que guardaban lo que
  calculaban: las 18 filas que dejó en `lab_resultados` se borraron (sólo
  esas: sin usuario, de origen `base`, creadas durante la prueba). Las 40
  de origen `base` que quedan son las de antes y son la referencia de las
  pruebas.

**No se verificó:** que las pantallas guarden de verdad con sesión de admin
(al cerrar, `lab_resultados` tiene sólo las 40 filas de origen `base`), ni
un análisis real con el `analyze-client` nuevo (ninguno desde el
despliegue; la columna `criterio_version_id` acepta el vacío y no tiene
valor por defecto, así que el guardado no debería fallar).

**Después (2026-10-07):** el negocio corrió un análisis real con el
`analyze-client` nuevo: marco-v28, sin versión del criterio, la llamada al
modelo bien. Lo que guardan las pantallas sigue sin verse con sesión.

---

## 15. Fase 3: el seguimiento real (propuesta del 2026-10-07)

> **Reemplazada por `docs/laboratorio-guia.md` el mismo día.** El negocio
> contestó 15.7 alineando los conceptos: el Universo (toda solicitud), el
> Universo analizado, los con crédito (reporte mensual de la institución) y
> los sin crédito (Novadata cada 3 meses); todo es cartera propia mientras
> dure el desarrollo; una solicitud nueva de una persona es otra solicitud
> (no se juntan cada 90 días, como proponía el punto 3); no se analiza la
> cartera entera, sino unos 300 casos con caché más adelante; y no se arman
> más pantallas hasta organizarse. Al contar de nuevo, el Universo analizado
> son 14 solicitudes con análisis válido (no 33) y 3 con el marco vigente. Lo
> que sigue queda como registro de la propuesta.

### 15.1 Dónde estamos

- Todo el ciclo corre hoy sobre datos sintéticos: las tres cargas son
  sintéticas y las solicitudes y reconsultas sólo las crea el simulador.
  Faltan las dos piezas que anotaba el diseño (14.8): armar las solicitudes
  reales y reconsultar en Novadata atando cada consulta a su solicitud.
- La cartera de septiembre: 2.565 personas con su consulta del 25 al 29 de
  septiembre (casi todas el 25 y el 26), que es su t0. **Sólo 33 tienen un
  análisis del modelo.**
- Su primera ronda, a los 3 meses, cae desde el 25 de diciembre de 2026.

### 15.2 La cohorte: las solicitudes reales

- Una cohorte es un grupo de solicitudes de un período ("Cartera 2026-09",
  "Cooperativa X, solicitudes de enero de 2027"). Se guarda como una carga
  de tipo cohorte: así le sirven sin cambios las solicitudes, reconsultas,
  eventos y cortes que ya existen, y un corte puede juntar varias.
- Se arma con lo que ya guarda CrediScope: las consultas y los análisis
  que hicieron los usuarios de la institución en el período (para eso cada
  usuario queda atado a su institución). Una solicitud por persona. Su t0
  es el perfil del último análisis del período o, si no se analizó, el de
  la consulta. La recomendación y el puntaje salen del análisis; sin
  análisis quedan vacíos, y la solicitud sirve para medir impago y
  variables, no para probar el modelo.
- La cartera de septiembre se arma una vez, con las 2.565 personas del t0
  del ciclo simulado.
- Una persona consultada por otro motivo (prueba, garante, muestra) se
  saca de la cohorte con su motivo: la autorización cubre sólo a quien
  presentó una solicitud (10.1).

### 15.3 Reconsultas por aniversario

- Cada solicitud se reconsulta a los 3, 6, 9 y 12 meses de su fecha (y a
  los 24). La reconsulta queda atada a su solicitud y a su ronda; las del
  ciclo simulado pasan a ser la ronda de 12.
- Cada mes, nuestro equipo corre
  `scripts/reconsultar-aniversarios.mjs --mes=AAAA-MM`:
  1. con `--seco`, cuántas solicitudes cumplen cada ronda ese mes, y la
     lista para consultar;
  2. la consulta, con `consultar-lote.mjs` como hasta ahora (la cartera
     entera tarda ~2 h 10 min);
  3. con `--registrar`, ata cada consulta nueva a su solicitud y su ronda y
     corre el detector.
- Para la cartera: 3 meses desde el 25/12/2026, 6 en marzo, 9 en junio y
  12 en septiembre de 2027.
- Cada ronda deja un perfil nuevo por persona: la ficha muestra la
  situación al día, que es lo buscado (10.1).

### 15.4 Cortes a 3, 6, 9, 12 y 24 meses

- Nuevo corte ofrece los cinco horizontes y toma la reconsulta de esa
  ronda. Una solicitud sin la reconsulta de ese horizonte queda fuera como
  "no medida" y se cuenta en el resumen.
- A los 3 meses se mide impago y lista de observación (12.4).
- Un archivo "foto" de la institución trae días a 12 y 24 meses: a 3, 6 y 9
  sólo hay datos del crédito con el reporte mensual.

### 15.5 El reporte mensual de la institución

- El crédito es único por institución y número de operación, con lo que no
  cambia: cédula, producto, monto, plazo, fecha de desembolso, cuota y
  canal. Cada reporte suma una fila por crédito y cierre de mes: días de
  mora al cierre, saldo y estado.
- Lo demás lo calculamos: el máximo de días a 3, 6, 9, 12 y 24 meses, la
  fecha del impago (el día en que pasó de 90 días, que sale del cierre y sus
  días), si se curó, y "sin reporte" para un crédito que deja de aparecer
  sin estar cancelado ni castigado (no medido, no bueno).
- La planilla mensual: la hoja de créditos al cierre del mes (las columnas
  de hoy, sin los máximos por ventana ni la fecha del impago, más "Fecha de
  cierre", "Días de mora al cierre" y "Saldo al cierre") y la hoja de
  solicitudes no desembolsadas que ya existe.
- Va después de 15.2 a 15.4: todavía no hay institución, diciembre no lo
  necesita y se prueba con el simulador, que pasa a generar reportes
  mensuales.

### 15.6 Qué cambia en pantalla (ninguna pantalla nueva)

| Pantalla | Cambio |
|---|---|
| Instituciones y proyectos | La lista de usuarios de cada institución, para atarlos. |
| Datos y cartera › Cargas | Las cohortes aparecen como "Cohorte de solicitudes", con su período y cuántas solicitudes tienen reconsulta en cada ronda; un botón "Armar cohorte" (institución y período). |
| Datos y cartera › Cortes › Nuevo corte | Horizonte de 3, 6, 9, 12 o 24 meses (hoy 12 o 24). |
| Nueva carga (con 15.5) | Elegir "Reporte mensual" o "Foto completa". |

### 15.7 Para decidir

1. El orden: cohorte, reconsultas y cortes por horizonte primero (lo que
   necesita diciembre); el reporte mensual después.
2. La cartera de septiembre como cohorte: ¿son todas solicitudes de crédito,
   cubiertas por la autorización? ¿De qué institución, o "cartera propia"
   sin institución?
3. Una solicitud por persona e institución cada 90 días: si se la vuelve a
   consultar o analizar dentro de esos 90 días, es la misma solicitud y
   cuenta el último análisis.
4. Para probar el modelo con la cartera hay que analizar el t0 de las 2.532
   personas sin análisis: unos USD 83 por la API de lotes (USD 0,0655 por
   análisis, medido desde marco-v28, a mitad de precio). El análisis lee
   sólo el perfil de septiembre, así que no hay fuga aunque se haga después.
   Sin eso, diciembre mide impago y variables, no el modelo.
5. Los cambios de pantalla de 15.6, con esos nombres.
