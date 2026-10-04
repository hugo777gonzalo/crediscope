# Laboratorio de Inteligencia de Negocio — mapa de pantallas

La especificación del negocio (2026-10-03), módulo por módulo, contra lo que
existe. Estado al 2026-10-04: fase A construida, sin ver en el navegador. Complementa `docs/laboratorio-de-riesgo.md`, que tiene el modelo de
datos y la metodología. Estado al 2026-10-03.

**Estados**

| Estado | Qué quiere decir |
|---|---|
| Hecho | Existe y se probó contra la base (falta verlo con sesión de admin) |
| A medias | Existe una parte |
| Se puede ya | Los datos existen; falta construir la pantalla o el cálculo |
| Falta un dato | Hace falta información que hoy no entra al sistema |
| Falta decidir | Hace falta una decisión del negocio antes de construir |
| Fuera de SQL | Necesita estadística que la base no trae (ver la decisión 2) |

**Nombres en castellano** (regla del proyecto: sin anglicismos salvo score y
colateral). Quedan las siglas de uso técnico: AUC, KS, ROC, PSI, IV, WoE,
VIF, SHAP, PCA. Por ejemplo: *Vintage* → Cosechas · *Data Center* → Centro de
datos · *Portfolio Import* → Carga de cartera · *Threshold Analysis* →
Umbrales · *False Negative* → Aprobados que cayeron · *False Positive* →
Negados que habrían pagado · *Feature* → Variable · *Precision / Recall* →
Precisión / Sensibilidad.

**El módulo 2** no vino en lo pegado (va del 1 al 3). Si era Instituciones y
proyectos, ver la decisión 3.

---

## 1. Inicio

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Indicadores: créditos conciliados, cobertura, cohortes maduras a 12 y 24, análisis completados, propuestas pendientes | Se puede ya | Cargas, cortes, resultados y propuestas |
| Indicadores: instituciones activas, proyectos analíticos | Falta decidir | No existen como entidad (decisión 3) |
| Hallazgos críticos | Falta decidir | Hace falta definir qué es crítico: una propuesta con evidencia fuerte, una alerta de fuente, una caída del AUC |
| Evolución del default por mes de desembolso | Se puede ya | `fecha_desembolso` y el resultado del corte |
| Desempeño del motor por institución | Falta decidir | Decisión 3 |
| Mezcla aprobar / revisar / negar y volumen de análisis | Se puede ya | `analysis_results` |
| Actividad reciente: cargas, cálculos, propuestas, informes | A medias | Cargas, resultados y propuestas tienen fecha y autor; los informes exportados no se registran |
| Trabajos fallidos | Se puede ya | Cargas con errores, reconsultas sin procesar |
| Comentarios institucionales | Falta decidir | Hoy la institución no entra al Laboratorio (sección 10 del diseño) |
| Alertas: cohortes inmaduras, problemas de conciliación | Se puede ya | Conciliación de cada carga |
| Alertas: caída de cobertura de la fuente | Se puede ya | La disponibilidad por tema de cada consulta. Caso real del 2026-10-03: Novadata cambió el formato del estado de los establecimientos y nadie lo vio hasta comparar dos consultas |
| Alertas: cambios en la distribución de variables (PSI), deterioro de indicadores | A medias | PSI calculado en la base (`lab_estabilidad`), sin pantalla |

## 3. Datos y cartera

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Centro de datos: las 52 fuentes, cobertura por fuente, estado de actualización | Se puede ya | `estado_por_fuente` de cada perfil; corte del IESS y del buró |
| Diccionario de datos | A medias | Está en `docs/novadata-fields-catalog.md` y en el Excel del catálogo; falta llevarlo a la base |
| Carga de cartera: plantilla, validación fila por fila, conciliación | Hecho | `/laboratorio/cargas/nueva` y `/laboratorio/cargas/:id` |
| Elegir institución y proyecto al cargar | Falta decidir | Hoy la institución es texto (decisión 3) |
| Mapeo de columnas del archivo de la institución | Se puede ya | Hoy la plantilla es fija: hay que pasar los datos a sus columnas |
| Historial de cargas: archivo, fecha, responsable, recibidos, válidos, rechazados, estado | Hecho | `lab_cargas` |
| Informe de calidad: nulos, duplicados, fechas inconsistentes, marcas inválidas, sin conciliar | A medias | Se rechazan filas con motivo; faltan duplicados de cédula, conflictos entre cargas y cobertura de variables |
| Explorador de conciliación: personas con varias operaciones o consultas, sin correspondencia, revisión manual | A medias | El vínculo marca todo eso; falta la pantalla que lo recorre |
| Definición de default, horizontes de 12 y 24 meses, maduración, exclusiones | Hecho | `lab_definiciones_default` y el corte |
| Censura (seguimiento incompleto) | Se puede ya | Hoy una operación inmadura se excluye; la censura bien tratada va en Cosechas (curvas de supervivencia) |
| Explorador de cartera: por mes, producto, decisión, segmento, buenos y malos | Se puede ya | Operaciones y solicitudes del corte |
| Constructor de cohortes: filtrar, versión del motor, horizonte, fecha de corte, congelar, historial | Hecho | Es el corte (`/laboratorio/cortes/nuevo`) |

## 4. Prueba retrospectiva y desempeño

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Configurar, correr, guardar y comparar evaluaciones | A medias | Un corte se congela y se calcula; falta comparar dos corridas lado a lado |
| Resumen: AUC con intervalo, Gini, KS, tasa de default, operaciones, defaults, exclusiones | Hecho | Pestaña Desempeño |
| Resumen: exactitud, precisión, sensibilidad, especificidad, F1 | Hecho (fase A) | En la pestaña Matriz de confusión (100). Necesitan una predicción de sí o no: se toma "negar" como predicho malo (y otra vista con negar + revisar). Con ~10% de malos la exactitud engaña: va, pero después del AUC |
| Resumen: AUC de precisión-sensibilidad (PR-AUC) | Se puede ya | Sobre el puntaje |
| Resumen: Brier | Falta decidir | Necesita una probabilidad, y el motor da un puntaje de 1 a 999 (decisión 4) |
| Matriz de confusión | Hecho (fase A) | Pestaña propia (100). No es de 2 × 2: es resultado (pagó / cayó) × recomendación (aprobar / revisar / negar), más la columna de negados sin crédito, que no se puede observar con el archivo |
| Aprobados que cayeron, negados que habrían pagado, errores de tipo I y II, casos | A medias | Pestaña Casos filtra los dos errores; falta el detalle completo de cada caso (ver 6.7) |
| Umbrales: ROC, precisión-sensibilidad, sensibilidad y especificidad por umbral, tasa de aprobación y de default simuladas, volumen a revisión | Se puede ya | Sobre el puntaje. Ojo: el motor no decide por un umbral de puntaje; esto simula una política ("aprobar desde X"), no el motor |
| Desempeño por decisión: aprobar | Hecho | Por recomendación, con intervalo |
| Desempeño por decisión: revisar, lo que decidió la institución después | A medias | La plantilla ya lo pide (hoja "Solicitudes no desembolsadas", 101, `lab_decisiones_institucion`); falta usarlo al armar las solicitudes de una corrida real |
| Desempeño por decisión: negar | Hecho (fase A) | Pestañas Matriz de confusión y Con y sin crédito. Con el archivo, sólo los negados a los que la institución prestó igual. La evidencia externa es la reconsulta del buró (fase 6), siempre separada y con su advertencia; coincide con lo pedido: ninguna tasa para los negados sin evidencia externa |
| Cosechas: mensual, trimestral, acumulado a 12 y 24, comparación entre generaciones, curvas de supervivencia | Se puede ya | `fecha_desembolso` + `fecha_primer_default`. La fecha del primer impago ya es obligatoria si cayó (101) |
| Desempeño por segmento: producto, versión del motor, perfil crediticio, nivel de ingreso | Se puede ya | Con un mínimo de casos por segmento |
| Desempeño por provincia o ciudad | Falta un dato | El perfil trae la provincia de nacimiento, no la de residencia (está en el crudo, en direcciones) |
| Desempeño por canal | Se puede ya | La plantilla pide el canal (opcional, 101) |
| Discriminación: ROC, KS, distribución del puntaje por clase, comparación entre modelos | A medias | Los números existen; faltan las curvas. Comparar modelos necesita dos puntajes del mismo corte (fase 7, marco candidato) |
| Calibración: probabilidad contra default observado, curva, Brier, error de calibración, por decil | Falta decidir | Decisión 4. Lo que sí se puede ya: default observado por decil de puntaje (tiene que bajar) |
| Estabilidad: PSI del puntaje y de variables, evolución del AUC, KS y default, alertas | A medias | PSI en la base sin pantalla; la evolución necesita varios cortes |

## 5. Descubrimiento estadístico

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Resumen: variables analizadas, numéricas, categóricas, con faltantes, con IV relevante, redundantes, candidatas | Se puede ya | Catálogo de variables y resultado de Variables |
| Descriptivas numéricas: media, mediana, desvío, percentiles, asimetría, curtosis, coeficiente de variación, atípicos | Se puede ya | En la base o en el navegador sobre el corte congelado (unas 2.500 filas) |
| Descriptivas categóricas: frecuencias, cardinalidad, dominante, default por categoría | Se puede ya | Ídem |
| Distribuciones: histogramas, cajas, violín, densidad, por clase, por decisión, entre períodos | Se puede ya | Gráficos en el navegador |
| Datos faltantes: por variable, por default, por fuente, por período, matriz | Se puede ya | La disponibilidad por tema distingue "no consultado" de "no tiene": es justo lo que pide la pantalla (¿la ausencia anticipa o es un problema de captura?) |
| Correlaciones: Pearson, Spearman, Kendall, con el resultado, matriz, VIF | Fuera de SQL | Pearson está en la base; el resto conviene en el navegador. Para categóricas, asociación (V de Cramér) |
| Inferencia: normalidad, chi-cuadrado, Fisher, t, Mann-Whitney, ANOVA, Kruskal-Wallis, intervalos, tamaño de efecto, corrección por comparaciones múltiples | Fuera de SQL | La base no trae las distribuciones para los valores p. Se muestran n, efecto e intervalo, como pide la especificación |
| IV y WoE: ranking, tabla WoE, buenos y malos por tramo | Hecho | Pestaña Variables |
| IV y WoE: tramos manuales, tramos monótonos, estabilidad del IV, comparación entre cohortes | Se puede ya | Hoy los tramos son cuartiles fijos |
| Default por categoría, rango, decil, endeudamiento, antigüedad, acreedores, buró | Se puede ya | Los tramos de cada variable |
| Explorador de significancia: asociación, valor p, efecto, cobertura, estabilidad, relevancia | Se puede ya | Junta lo anterior; la estabilidad necesita dos cortes |
| Segmentos (K-means, silueta, perfiles, default por grupo) | Fuera de SQL | Describe, no predice (anexo del diseño) |
| PCA | Fuera de SQL | Herramienta de investigación, no etapa del modelo |

## 6. Descubrimiento profundo de variables

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Resumen: variables del crudo, estandarizadas, enviadas al modelo, no usadas, con faltantes, asociadas al default | Se puede ya | Crudo en Storage, catálogo, `perfil-del-modelo.ts` |
| Trazabilidad: crudo → estructura → entrada al modelo → marco → respuesta → decisión → resultado | A medias | Casos enlaza el perfil y el análisis; falta mostrar el crudo y `mensaje_al_modelo` (guardado desde la 090) en el mismo recorrido, y el origen de cada campo como dato (hoy está en `docs/estructura-estandarizada.md`) |
| Explorador del crudo: por fuente, diccionario, distribuciones, calidad, campos no usados, relación con el default | **Hecho el 2026-10-04** (adelantado a pedido del negocio) | `scripts/explorar-crudo.mjs` lo calcula y la pestaña "Explorador del crudo" del corte lo muestra (104, diseño 14.11): diccionario, calidad, condiciones contra el impago con corrección, si el modelo ya lo tenía y si la estructura lo lee. Falta ver los valores de una persona (sólo admin) y el ajuste de un valor numérico |
| Explorador de la estructura: campos derivados, agregados, descartados, diferencias entre versiones, cobertura por cohorte | A medias | Las versiones existen y se comparan con guiones (`viejo contra nuevo`); falta la pantalla |
| Auditoría de la entrada al modelo: incluidas, excluidas, versión del marco, modelo, comparación de entradas | Se puede ya | `analysis_results.mensaje_al_modelo` y `rules_version`, sin llamar al modelo |
| Variables de los que cayeron: aprobados que cayeron, revisados que cayeron, diferencias, ausentes, combinaciones, no lineales | A medias | Variables con las dos poblaciones y Motivos del impago ("¿se podía ver?" en cinco categorías, 103); combinaciones y no lineales, fuera de SQL |
| Investigación de aprobados que cayeron | A medias | Casos + motivos (fase 6): perfil, crudo, entrada al modelo, respuesta, puntaje, comparación con buenos parecidos, hipótesis |
| Investigación de negados que habrían pagado | A medias | Con el archivo, sólo los que la institución financió igual; el resto con la reconsulta |
| Importancia: bosque aleatorio, permutación, SHAP, por segmento | Fuera de SQL | Con un guion de Python que guarde el resultado (decisión 2) |
| Taller de variables: razones, conteos, indicadores, interacciones, con definición, fórmula, fuente, fecha de disponibilidad | Se puede ya | Extiende el catálogo: hoy una variable es una ruta del perfil; falta la variable derivada con su fórmula |
| Registro de candidatas: descubierta → en revisión → experimental → aceptada / rechazada | Se puede ya | Se engancha con las propuestas de tipo "dato nuevo" |

---

## Fases propuestas

| Fase | Qué | Por qué en ese orden |
|---|---|---|
| A | Terminar el ciclo simulado y ver sus resultados: cuadrantes, motivos, calificación; matriz de confusión y desempeño por decisión | **Hecha el 2026-10-03/04** (100-103 y pestañas) y subida el 2026-10-04; falta verla con sesión de admin |
| B | Reordenar el menú del Laboratorio en estos módulos, con lo que ya existe en su lugar | Da el esqueleto; no cambia cálculos |
| C | Prueba retrospectiva completa: curvas (ROC, KS, precisión-sensibilidad), cosechas y supervivencia, umbrales, segmentos, estabilidad con pantalla | Responde "¿el motor ordena bien y se sostiene?" |
| D | Descubrimiento estadístico: descriptivas, distribuciones, faltantes, correlaciones, inferencia, laboratorio de IV y WoE con tramos manuales, explorador de significancia | Responde "¿qué anticipa el impago?" |
| E | Descubrimiento profundo: explorador del crudo, auditoría de la entrada al modelo, investigación de los dos errores, taller y registro de variables | Responde "¿qué no vio el modelo?". El explorador del crudo ya está (2026-10-04) |
| F | Bosque aleatorio, SHAP, K-means, PCA | Después de la decisión 2 |
| — | Inicio con instituciones y proyectos; calibración | Después de las decisiones 3 y 4 |

## Decisiones del negocio

**Las cinco, aprobadas como se proponen el 2026-10-03.** Quedan escritas como
se propusieron.

1. **El orden de las fases.** Propuesto: A primero (el ciclo está corriendo),
   después B a E.
2. **Dónde corre la estadística que la base no trae.** Propuesto: lo
   interactivo (descriptivas, correlaciones, pruebas, distribuciones) en el
   navegador sobre el corte congelado, con una librería de estadística
   probada; lo pesado (bosque aleatorio, SHAP, K-means, PCA) con guiones de
   Python locales que guardan el resultado en la base, como hoy los guiones
   de Node. La alternativa es un servicio de Python propio: más
   infraestructura, conviene sólo si se vuelve rutina.
3. **Instituciones y proyectos.** Propuesto: crearlos como entidades del
   Laboratorio (sólo admin), sin esperar la fábrica de crédito. Sigue abierta
   la pregunta de fondo: una instalación para varias instituciones o una por
   institución.
4. **Calibración.** El motor da un puntaje, no una probabilidad. Propuesto:
   estimar la función puntaje → probabilidad en una cohorte y probar su
   calibración en la siguiente. La alternativa es que el modelo devuelva una
   probabilidad: versión nueva del marco, con costo de comparación.
5. **Datos nuevos en el archivo de la institución**: fecha del primer
   default obligatoria si cayó (para las cosechas), canal (opcional), y qué
   decidió en cada caso "revisar" (para medir la revisión).
