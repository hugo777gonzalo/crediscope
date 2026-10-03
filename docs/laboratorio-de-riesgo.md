# Laboratorio de Inteligencia de Negocio › Riesgo de Crédito

Reemplaza al módulo de Retroalimentación. Diseño del 2026-10-03, con las
decisiones del negocio del mismo día (ver "Decisiones"). Estado: **la fase
0 está hecha** (migración 090); el resto, sin implementar.

## Qué es

El lugar donde nuestra empresa mide si el motor de riesgo acertó, busca qué
datos del cliente anticipaban el impago y arma una propuesta de ajuste
respaldada por números. Lo opera nuestro equipo, no la institución
financiera (IFI). La IFI recibe el resultado: un **Informe de Desempeño del
Modelo** y una **Propuesta de Ajustes**.

**Nombre** (decidido por el negocio): **Laboratorio de Inteligencia de
Negocio**, y adentro, **Riesgo de Crédito** como su primera área. Deja
lugar a otras áreas sin cambiar el nombre. Sin nombres en inglés: en
pantalla, *backtesting* es **prueba retrospectiva**.

## Decisiones del negocio (2026-10-03)

| Punto | Decisión |
|---|---|
| Crudo de Novadata | **Se guarda**, como ya se guarda el de Aval. Hecho en la 090, en Storage (ver punto 1). |
| Lo que leyó el modelo | **Se guarda.** Hecho en la 090. |
| Archivo de la IFI | El de la tabla del punto 3. |
| Ventana de 24 meses | Es la prueba **más exigente**: deja ver los impagos tardíos, así que la tasa de default observada es mayor. |
| Negados | Se reconsultan en el buró a 12 y 24 meses. Novadata y Aval son la única fuente externa, y alcanzan para proponer default por días de mora y por **calificación de riesgo por operación** (A1, A2 … E). |
| Decisión de la IFI | No hay IFI real todavía. Supuesto: **todo crédito que la IFI devuelve en el archivo se desembolsó**, sea cual sea la recomendación. Para el modelo: aprobar y revisar = aprobado por el modelo; negar = negado. |
| "Observar" | Se elimina: toda la zona gris pasa a revisar. **Pendiente aparte** (`docs/pendientes.md`), no entra en este trabajo. |
| Sin datos reales | No se espera un año: se construye el proceso ahora sobre una **cartera sintética** (ver "Cómo se desarrolla sin IFI") y se prueba con datos reales cuando existan. |
| Más análisis | Se corre un lote de análisis para tener puntajes y medir el ruido del modelo (ver "Lote de análisis"). |

**Regla que no se negocia:** el Laboratorio nunca cambia el motor por su
cuenta. Lo que produce es una propuesta; si se aprueba, se convierte en una
versión nueva del marco con su fila en `scoring_rules_versions`, como hoy.

## Lo que se midió antes de escribir esto (2026-10-03)

| Dato | Valor |
|---|---|
| Clientes consultados | 2.807 |
| Perfiles estandarizados guardados | 6.018 (desde 2026-09-04) |
| Análisis del modelo sin fallo | **62, de 33 clientes** (desde 2026-09-03) |
| Recomendación de esos 62 | 48 sin recomendación (versiones viejas del marco), 6 revisar, 5 negar, 2 aprobar, 1 "observar" |
| Créditos cargados en Retroalimentación | 0 |

Dos consecuencias que ordenan todo lo demás:

1. **El puntaje del modelo existe para 33 personas.** Validar el motor (¿el
   puntaje separa a los que pagan de los que no?) recién va a ser posible
   cuando haya cientos de análisis con su crédito desembolsado y madurado.
2. **El perfil estandarizado existe para 2.807.** Buscar qué variables
   anticipan el impago no necesita el puntaje: necesita perfiles y
   resultados. Ese es el activo grande, y conviene separarlo del anterior.

## Lo que está bien en la idea

- Separar el análisis (código, estadística reproducible) del modelo de
  lenguaje. Una matriz de confusión o un AUC no se le piden a un LLM: se
  calculan, y dan lo mismo cada vez.
- Seguir la información por toda la cadena, del crudo a la respuesta, para
  encontrar dónde se perdió la señal.
- Mirar a 12 y 24 meses.
- Que lo opere nuestro equipo y la IFI reciba conclusiones, no datos crudos.
- Terminar en una propuesta, no en un tablero.

## Lo que hay que corregir

### 1. El crudo de las fuentes no se guardaba en la base — resuelto (090)

Hasta el 2026-10-03 en la base iba sólo el **perfil estandarizado**; el
crudo de Novadata existía como respaldo local en `research/`. Desde la 090
cada consulta (pantalla, análisis y lote) lo guarda comprimido en el
depósito privado `crudo-novadata` de Storage, y `client_profiles.crudo_ruta`
dice dónde (`_shared/crudo-novadata.ts`). Pesa ~150 KB por persona contra
~4 KB del de Aval: en una columna habría duplicado la base (96 MB) con una
sola carga de cartera; con gzip queda en ~8 KB (2.567 crudos = 20 MB). Sólo lo lee un admin. Los
2.567 crudos del respaldo local se subieron con
`scripts/subir-crudo-guardado.mjs`. Falta definir cuánto tiempo se
conserva (LOPDP).

### 2. Lo que leyó el modelo no se guardaba — resuelto (090)

`analysis_results` guardaba el puntaje, la recomendación, positivos,
negativos y el texto, pero no el **perfil del modelo** de ese momento:
reconstruirlo exigía el código de esa versión. Desde la 090,
`analysis_results.mensaje_al_modelo` guarda lo que salió en el pedido, tal
cual. Es lo que permite decir "el modelo vio X y aun así aprobó". Los 62
análisis anteriores no lo tienen.

### 3. Una marca de default no alcanza: hacen falta fechas

Para saber si alguien cayó *dentro de los 12 meses* hay que saber cuándo
recibió el crédito y cuándo cayó. El archivo mínimo de la IFI:

| Columna | Obligatoria | Para qué |
|---|---|---|
| Cédula | sí | vincular con la consulta |
| Número de operación | sí | una persona puede tener varios créditos |
| Fecha de desembolso | sí | define desde cuándo se mide |
| Monto, plazo, producto | sí | segmentar; un default en 2.000 no es uno en 20.000 |
| Fecha de corte del archivo | sí | hasta dónde se observó |
| Máximos días de mora a 12 y a 24 meses | sí | aplicar la definición de default |
| Fecha del primer default | si la tienen | tiempo hasta el impago |
| Estado (vigente, cancelado, castigado, reestructurado) | sí | un reestructurado por deterioro cuenta como malo |
| Observaciones de la IFI | no | lectura cualitativa |

Con días de mora en vez de una marca, la definición de default la
decidimos nosotros y se puede cambiar sin pedir otro archivo.

### 4. Ventana y definición de default se configuran por separado

La ventana de 24 meses es la prueba más exigente (decisión del negocio):
captura los impagos tardíos, y en créditos largos la tasa de default sube
con el tiempo. La **definición** de default (por ejemplo, 90 días de mora,
castigo o reestructuración por deterioro, a acordar con la IFI y según su
norma) es otra perilla. Cada análisis guarda con qué definición y qué
ventana se hizo.

Y una operación que todavía no cumplió 12 meses **no es buena**: es
inmadura y se excluye. Contarla como "no default" infla el acierto.

### 5. A los negados no se los puede juzgar con la cartera de la IFI

Sólo cae quien recibió un crédito. Un cliente que el modelo negó y la IFI
no financió nunca tendrá marca de default, así que la matriz de confusión
de la idea queda con una fila vacía: no se puede saber cuántos "buenos" se
negaron. Tres salidas, de más a menos fuerte:

1. **Reconsultar a los negados a los 12 y 24 meses** con nuestras propias
   fuentes (buró de Novadata y Aval): si cayeron en otra institución, el
   modelo acertó. Es una ventaja que pocos tienen, y la que eligió el
   negocio. Requiere confirmar la base legal de la reconsulta y tiene un
   costo por consulta. Un límite a tener en cuenta: el buró de bancos de
   Novadata **no trae días de mora por operación**; la calificación (A1 …
   E) es el indicador de días, y lo propio va separado de lo garantizado
   (estructura-v8, `riesgo` T/G/C). La definición de default "desde el
   buró" se arma con la calificación propia; qué agrega Aval por operación
   hay que confirmarlo.
2. **Los que la IFI aprobó contra la recomendación** (excepciones): son el
   único dato directo sobre los negados.
3. Técnicas estadísticas de inferencia de rechazados: débiles con poco
   volumen; sólo como último recurso.

### 6. La recomendación del modelo no es la decisión de la IFI

Hay tres cosas distintas: lo que recomendó el modelo, lo que decidió la IFI
y lo que se desembolsó (con qué monto y plazo). Hoy sólo se guarda la
primera. Es el mismo hueco que señala `docs/arquitectura-fabrica-de-credito.md`
(falta la solicitud y el registro de la decisión).

Mientras no haya una IFI real, el supuesto del negocio: lo que llega en el
archivo de la IFI **se desembolsó**. Las operaciones con recomendación
"negar" son entonces las excepciones del punto anterior, y valen oro: es lo
único que se observa directamente sobre los negados. Cuando exista la
solicitud con su decisión, el supuesto se reemplaza por el dato.

### 7. Hay cuatro recomendaciones, no tres, y hay un puntaje

En la base aparece "observar" además de aprobar, revisar y negar (el
negocio decidió eliminarlo; queda como pendiente aparte). Para el
Laboratorio, aprobar y revisar cuentan como "aprobado por el modelo" y
negar como "negado", pero la tabla mantiene revisar aparte: es lo que dice
si la zona gris tiene más impagos que la de aprobados. Y, más importante,
el modelo da un **puntaje de 1 a 999**. Las medidas que
proponés (AUC, Gini, KS) se calculan sobre el puntaje, no sobre la
recomendación; la recomendación se evalúa con una tabla de recomendación
× resultado y la tasa de default de cada una. Conviene nombrar los errores
por lo que cuestan y no como "tipo 1 / tipo 2", que cada área usa al revés:

- **Aprobado que cayó**: pérdida de capital.
- **Negado que habría pagado**: negocio perdido (sólo medible con el punto 5).
- **A revisión que cayó / que pagó**: mide si la revisión manual agrega
  valor.

### 8. La cartera actual no sirve para predecir, sólo para describir

Las 2.807 personas consultadas en septiembre son, en su mayoría, la cartera
**ya vigente** de la IFI. Su perfil se tomó *después* de que recibieron el
crédito: el buró de hoy ya muestra la mora de ese mismo crédito. Si se
cruza ese perfil con la marca de default, la variable "mora en el buró"
predice perfecto porque **es** el default. Eso es fuga de información
(*leakage*), y es el error más fácil de cometer con estos datos.

Regla: para estudiar qué predice el impago sólo vale un perfil tomado
**antes** del desembolso. Con la cartera vigente se puede describir
(¿cómo se ven hoy los que están en mora?), no predecir. Algunas variables
sí se pueden reconstruir a la fecha del desembolso (aportes al IESS mes a
mes, fechas del RUC); el buró no.

### 9. El modelo de lenguaje no da siempre la misma respuesta

El mismo perfil analizado dos veces puede dar puntajes distintos. Antes de
atribuir una diferencia a un cambio del marco hay que medir ese ruido:
analizar una muestra de perfiles varias veces con el mismo marco. Una mejora
de 15 puntos no significa nada si el ruido es de 30.

### 10. "Sin LLM" vale para el análisis, no para la simulación

Las métricas, el exploratorio y la propuesta se calculan con código. Pero
para saber qué habría pasado con un marco nuevo hay que volver a correr el
motor, y el motor **es** el modelo de lenguaje: esa simulación necesita la
API y tiene costo (es lo que hace hoy `correr-backtest`). Lo que sí se
simula sin modelo, y gratis, es una **regla de política** ("negar si la
deuda vencida propia supera X"): se aplica en SQL sobre los perfiles
guardados.

### 11. Las técnicas, en su lugar

- **Information Value / WoE por variable**: lo más útil para el área de
  riesgos; dice qué variables separan buenos de malos y es explicable.
- **Regresión logística**: el modelo de referencia de la industria y el que
  un regulador entiende; sirve como "retador" del motor.
- **Random forest**: bueno para ordenar la importancia de las variables y
  como techo de lo que los datos permiten; difícil de explicar como modelo
  de decisión.
- **K-means**: segmenta, no predice. Útil para describir la cartera, débil
  como base de una propuesta.
- Ninguna asociación prueba causa. Y con cientos de variables, alguna va a
  salir significativa por azar: hay que corregir por comparaciones
  múltiples y validar en una cohorte posterior.
- **Volumen mínimo**: con menos de unos 100 defaults por cohorte, IV,
  random forest y AUC por segmento son ruido. Cada resultado muestra su
  tamaño de muestra.

### 12. Dónde corre el cálculo

No hay Python en el proyecto y las funciones de Supabase se cortan a los
150 s. Con el volumen previsto (miles de operaciones, no millones):

- Matriz, tasas, AUC, KS, Gini, IV, PSI: **funciones SQL** (`security
  invoker`, como `metricas_gerenciales()`), que además respetan RLS y no
  chocan con el corte de 1.000 filas de PostgREST.
- Exploración interactiva: en el navegador, sobre un corte ya armado.
- Regresión logística y random forest: más adelante, en un proceso aparte
  (script local o un trabajador), con resultados guardados en la base. No
  hace falta para las primeras fases.

### 13. Hoy no existe la separación por institución

No hay entidad "institución" y las tablas de Retroalimentación se leen con
cualquier sesión autenticada (`auth.role() = 'authenticated'`). Mientras el
Laboratorio sea sólo para nuestro equipo, alcanza con restringirlo a admin.
Antes de que un usuario de una IFI vea un informe dentro de la aplicación
hay que resolver cómo se separan las instituciones (una base por IFI, o
una columna de institución con RLS en todas las tablas). Hasta entonces, el
informe a la IFI sale como documento exportado.

## El proceso

```
Consulta → perfil estandarizado → perfil del modelo → respuesta (puntaje, recomendación)
                                                     ↓
                     decisión de la IFI → desembolso → comportamiento a 12 / 24 meses
                                                     ↓
                    carga y vínculo → corte → desempeño → descubrimiento → simulación → propuesta
```

**0. Guardar lo que falta (desde ya).** El perfil del modelo de cada
análisis; la decisión de la IFI y las condiciones del crédito. Decidir si se
guarda el crudo.

**1. Carga y vínculo.** La IFI entrega el archivo de la tabla del punto 3.
Cada operación se vincula al análisis y al perfil **anteriores** al
desembolso (el más reciente, con un máximo de antigüedad a acordar). La
carga termina en una conciliación visible: cuántas operaciones se
vincularon, cuántas no tenían consulta, cuántas consultas no tienen
crédito, cuántas son inmaduras. Una operación sin vincular no se descarta
en silencio.

**2. Corte.** Se define la población (cohorte de desembolsos, producto,
ventana, definición de default) y se congela: el corte guarda qué
operaciones entraron y con qué parámetros, para que el mismo análisis dé el
mismo resultado dentro de seis meses.

**3. Desempeño del modelo.** Sobre el corte:
- tabla recomendación × resultado y tasa de default por recomendación;
- AUC, Gini y KS del puntaje;
- tasa de default por tramo de puntaje (debería bajar a medida que sube el
  puntaje; si no baja, el puntaje no ordena);
- estabilidad del puntaje entre cohortes (PSI): si la población cambió,
  el modelo puede estar midiendo otra cosa;
- todo por versión del marco: comparar marcos distintos dentro de un
  mismo corte mezcla manzanas con peras.

**4. Descubrimiento.** Por cada variable del perfil estandarizado: cobertura
(¿cuántos la tienen?), tasa de default por tramo, IV. Después, el cruce que
justifica todo el Laboratorio:
- variables con IV alto que el modelo **no vio** (no están en el perfil del
  modelo o están deshabilitadas);
- variables que vio pero no citó en los negativos de quienes cayeron;
- aprobados que cayeron contra aprobados que pagaron: ¿qué los distinguía?

**5. Simulación.** Dos tipos, siempre contra el motor vigente sobre el mismo
corte:
- **regla de política**, sin modelo de lenguaje: cuántos aprobados pasarían
  a negados, cuántos defaults se habrían evitado, cuántos buenos se habrían
  perdido;
- **marco candidato**, con modelo de lenguaje y costo: sobre una muestra,
  midiendo primero el ruido (punto 9).

**6. Propuesta.** Un documento con: hallazgo, evidencia (números y tamaño de
muestra), cambio propuesto, separado en **puntaje** o **política** (el
hallazgo estructural de la fábrica de crédito), impacto estimado,
limitaciones y cómo se validaría después de aplicarlo. Estados: borrador,
revisada, presentada a la IFI, aprobada, aplicada como versión del marco.

**7. Informe a la IFI.** Exportado (PDF o Excel) mientras no exista la
separación por institución.

## Cómo se desarrolla sin IFI: la cartera sintética

No hay una IFI real ni créditos madurados, y el negocio decidió no esperar.
El proceso se construye y se prueba con una **cartera sintética con señal
plantada**:

1. Se toman clientes reales con perfil guardado (y con análisis, cuando lo
   haya).
2. A cada uno se le inventa una operación: desembolso repartido en el
   pasado para que esté madura a 12 y 24 meses, monto, plazo y producto
   plausibles.
3. El default **no se sortea al azar**: se calcula con una regla conocida
   sobre tres o cuatro variables del perfil (por ejemplo, calificación
   propia en el buró, deuda vencida propia, continuidad laboral, demandas de
   cobro), más ruido, calibrada a una tasa de default realista. Los días de
   mora a 12 y 24 meses salen coherentes con eso.
4. La regla plantada queda guardada con la carga.

Así se prueba el Laboratorio y no sólo las pantallas: el descubrimiento
tiene que encontrar las variables plantadas arriba de todo y no "descubrir"
otras con fuerza. Si falla con una señal que conocemos, va a fallar con la
real.

Dos reglas, porque ya pasó con las 240 personas sintéticas de Aval que
todavía están en la cartera:

- **Toda carga sintética lleva la marca `es_sintetica`** y ninguna pantalla
  ni informe para una IFI la muestra sin esa marca a la vista.
- **Un resultado sobre la cartera sintética no es desempeño del modelo.** El
  AUC que salga mide cuánto se parece el puntaje a la regla que inventamos,
  no si predice impagos.

## Lote de análisis

Hay 62 análisis. Para construir y probar la parte de desempeño hacen falta
cientos de puntajes, y para el punto 9, repeticiones del mismo perfil. El
lote reutiliza perfiles ya guardados (`analyze-client` con `profileId`): no
reconsulta Novadata, sólo paga el modelo.

| Qué | Cantidad | Costo estimado |
|---|---|---|
| Un análisis por cliente, muestra por segmento | 300 | ~USD 13–15 |
| Ruido: los mismos perfiles, cinco veces | 20 × 5 = 100 | ~USD 4–5 |
| Total | 400 | **~USD 17–20**, ~40 min con 4 a la vez |

El costo es el medido: USD 0,042 de promedio y 0,093 de máximo por
análisis exitoso en los últimos 30 días (66 análisis). marco-v26 es más
largo que las versiones medidas, así que puede salir algo más caro. Antes de
correrlo:

- **Subir el límite de la consola de Anthropic.** En septiembre cortó con
  USD 6 y el presupuesto propio está en 10: este lote los supera.
- **Va a ser la primera corrida de marco-v25 y v26**, que nunca corrieron
  (ver `docs/pendientes.md`, punto 1): revisar los primeros resultados
  antes de dejar correr el resto.
- Los análisis son reales: quedan en el expediente de cada cliente como su
  último análisis.

## Datos

Se reemplazan las tablas `feedback_*` (vacías) en lugar de parchearlas. Lo
mínimo:

| Tabla | Qué guarda |
|---|---|
| `analysis_results.mensaje_al_modelo` (090, hecho) | lo que leyó el modelo, tal cual |
| `client_profiles.crudo_ruta` + depósito `crudo-novadata` (090, hecho) | el crudo de Novadata de cada consulta |
| decisión de la IFI | por ahora el supuesto de "Decisiones"; después, la entidad solicitud de la fábrica de crédito |
| `cartera_cargas` | cada archivo de la IFI: quién, cuándo, fecha de corte, conciliación, `es_sintetica` y la regla plantada si lo es |
| `cartera_operaciones` | una fila por operación, con sus fechas y días de mora, y el análisis y perfil vinculados |
| `definiciones_de_default` | versionadas: días de mora, estados que cuentan como malos |
| `cortes` | población congelada y parámetros |
| `resultados` | métricas por corte, con metodología y tamaño de muestra |
| `propuestas_de_ajuste` | hallazgos, evidencia, estado, versión del marco resultante |

Se retiran `analizar-feedback` y `proponer-ajustes` (hacen con el modelo de
lenguaje lo que debe hacer el código). `correr-backtest` se conserva como
la simulación de marcos candidatos.

## Fases

| Fase | Qué | Estado | Se prueba con |
|---|---|---|---|
| 0 | Guardar el crudo de Novadata y lo que leyó el modelo | **hecha (090)** | — |
| 1 | Tablas, carga del archivo, vínculo, conciliación y generador de cartera sintética | siguiente | cartera sintética |
| 2 | Desempeño del modelo | después de la 1 y del lote de análisis | cartera sintética + lote |
| 3 | Descubrimiento sobre el perfil | con la 1 | cartera sintética: tiene que encontrar la señal plantada |
| 4 | Simulación de reglas de política | con la 3 | cartera sintética |
| 5 | Propuestas e informe | con la 2 o la 3 | — |

Con datos reales, la fase 2 no da resultados antes de que maduren los
primeros créditos (12 meses desde el desembolso); la 3 puede adelantarse si
una IFI entrega cartera histórica con datos tomados antes del desembolso.

## Preguntas abiertas

Resueltas el 2026-10-03: guardar el crudo (sí), el archivo de la IFI (el
propuesto), reconsultar a los negados (sí, por el buró).

1. ¿Cuánto tiempo se conserva el crudo de Novadata?
2. ¿Cuál es la definición de default por defecto (días de mora,
   calificación, castigo, reestructuración)? Con la cartera sintética se
   puede dejar configurable y decidir después.
3. ¿Con qué base legal se reconsulta a un negado, y quién paga la consulta?
4. ¿Una instalación para varias IFI o una por IFI? Define cómo se separan
   los datos (punto 13).
5. Cuando haya una IFI: ¿tiene cartera histórica con datos tomados *antes*
   del desembolso?
