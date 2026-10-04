# Laboratorio de Inteligencia de Negocio — mapa de pantallas

La especificación del negocio (2026-10-03), módulo por módulo, contra lo que
existe. Complementa `docs/laboratorio-de-riesgo.md`, que tiene el modelo de
datos y la metodología.

**Estado al 2026-10-04:** las fases A a F y los módulos 1 a 3 están
construidos (migraciones 100 a 109). **Ninguna pantalla se vio con sesión de
admin**: los cálculos de cada pestaña se probaron en Node contra los cortes
reales (`scripts/probar-pantallas-laboratorio.mjs`) y la estadística contra
valores publicados y la base (`scripts/probar-estadistica.mjs`).

**Estados**

| Estado | Qué quiere decir |
|---|---|
| Hecho | Existe y sus cálculos se probaron contra la base (falta verlo con sesión de admin) |
| A medias | Existe una parte |
| Falta un dato | Hace falta información que hoy no entra al sistema |
| Falta decidir | Hace falta una decisión del negocio antes de construir |

**Nombres en castellano** (regla del proyecto: sin anglicismos salvo score y
colateral). Quedan las siglas de uso técnico: AUC, KS, ROC, PSI, IV, WoE,
VIF, SHAP, PCA. Por ejemplo: *Vintage* → Cosechas · *Data Center* → Centro de
datos · *Portfolio Import* → Carga de cartera · *Threshold Analysis* →
Umbrales · *False Negative* → Aprobados que cayeron · *False Positive* →
Negados que habrían pagado · *Feature* → Variable · *Precision / Recall* →
Precisión / Sensibilidad.

**Dónde está cada módulo:** Laboratorio en el menú lateral, con Inicio,
Instituciones y proyectos, Datos y cartera, Prueba retrospectiva,
Descubrimiento estadístico, Descubrimiento profundo, Propuestas y Criterio
vigente. Los tres de análisis (4, 5 y 6) trabajan sobre un corte congelado
(`ModuloDelCorte`: el corte y la pestaña van en la dirección, el último
corte se recuerda) y, si el corte tiene solicitudes, eligen la población
(lo desembolsado o todas las solicitudes observadas).

---

## 1. Inicio (`/laboratorio`)

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Indicadores: créditos conciliados, cortes a 12 y 24, análisis, propuestas pendientes, candidatas, instituciones y proyectos | Hecho | Cargas, cortes, propuestas, candidatas, instituciones, `lab_volumen_de_analisis` |
| Hallazgos críticos | Hecho, **definición propuesta** | Fuente que dejó de contestar, dato que anticipa y el modelo no tiene (crudo, bosque), AUC menor a 0,65, PSI mayor a 0,25. Falta que el negocio confirme la definición |
| Evolución del default por mes | Hecho | El corte más reciente, por mes de desembolso |
| Desempeño del motor por institución | Hecho | El último desempeño de los cortes de las cargas de cada institución |
| Mezcla aprobar / revisar / negar y volumen de análisis | Hecho | `lab_volumen_de_analisis` (contado en la base) |
| Actividad reciente | A medias | Cargas, cortes, cálculos, propuestas y candidatas; los informes exportados no se registran |
| Trabajos a medias | Hecho | Cargas incompletas o con errores, reconsultas sin procesar, análisis fallidos |
| Comentarios institucionales | Falta decidir | Hoy la institución no entra al Laboratorio (sección 10 del diseño) |
| Alertas: cohortes, conciliación, cobertura de la fuente, PSI | Hecho | Fuga en la conciliación, Centro de datos, estabilidad guardada |

## 2. Instituciones y proyectos (`/laboratorio/instituciones`)

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Instituciones: alta, edición, inactivar | Hecho | `lab_instituciones` (109). Nada se borra |
| Proyectos por institución | Hecho | `lab_proyectos` (109) |
| Cargas sin institución | Hecho | Las cargas viejas tienen la institución como texto; se listan para asignarlas |
| Una instalación para varias instituciones o una por institución | Falta decidir | Pregunta de fondo abierta (sección 13 del diseño) |

## 3. Datos y cartera (`/laboratorio/datos`)

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Centro de datos: las 52 fuentes, si contestan, por semana, corte del IESS | Hecho | `lab_centro_de_datos` (109), sobre `estado_por_fuente` de cada perfil |
| Diccionario de datos | Hecho | Crudo (del último explorador del crudo), estructura (cobertura en el último corte) y catálogo, con buscador |
| Carga de cartera: plantilla, validación fila por fila, conciliación | Hecho | `/laboratorio/cargas/nueva` y `/laboratorio/cargas/:id` |
| Elegir institución y proyecto al cargar | Hecho | 109 |
| Mapeo de columnas del archivo de la institución | Hecho | Si faltan columnas, sugiere el mapeo por sinónimos y se confirma a mano |
| Historial de cargas | Hecho | Pestaña Cargas |
| Informe de calidad: duplicados, cruces con otras cargas, fechas, marcas | Hecho | `lab_calidad_de_la_carga` (109) |
| Explorador de conciliación | A medias | Operaciones por vínculo y personas con varias; falta guardar una revisión manual |
| Definición de default, horizontes, maduración, exclusiones | Hecho | `lab_definiciones_default` y el corte |
| Censura (seguimiento incompleto) | Hecho | Kaplan-Meier en Cosechas |
| Explorador de cartera | Hecho | Por mes, producto, canal, recomendación, segmento, calificación y decisión |
| Constructor de cohortes | Hecho | El corte (`/laboratorio/cortes/nuevo`) y su ficha |

## 4. Prueba retrospectiva y desempeño (`/laboratorio/desempeno`)

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Resumen: AUC con intervalo, Gini, KS, tasa, exclusiones | Hecho | Pestaña Resumen (`lab_calcular_desempeno`) |
| Exactitud, precisión, sensibilidad, especificidad, F1 | Hecho | Matriz de confusión (100) |
| Precisión media (PR-AUC) | Hecho | Discriminación |
| Brier | Hecho | Calibración (decisión 4) |
| Matriz de confusión | Hecho | Resultado × recomendación, más los negados sin crédito |
| Aprobados que cayeron, negados que habrían pagado | Hecho | Casos, e Investigación de casos en el módulo 6 |
| Umbrales | Hecho | "Aprobar desde A, revisar desde B" contra lo que hizo el motor; simula una regla, no al motor |
| Desempeño por decisión: aprobar, revisar, negar | Hecho | Matriz, Con y sin crédito, Lo que decidió la institución (101) |
| Cosechas y supervivencia | Hecho | Kaplan-Meier por mes o trimestre, acumulado a 6, 12 y 24, log-rank. Sin fecha del impago de más del 10% de los malos no dibuja (las solicitudes: el buró no la da) |
| Segmentos: producto, versión, perfil crediticio, ingreso, canal | Hecho | Con "pocos casos" marcado; las protegidas, para vigilar |
| Desempeño por provincia o ciudad | Falta un dato | El perfil trae la provincia de nacimiento, no la de residencia (está en el crudo, en direcciones) |
| Discriminación: ROC, KS, distribución por clase, deciles | Hecho | Discriminación |
| Comparación entre modelos | Falta un dato | Necesita dos puntajes del mismo corte (fase 7, marco candidato, con costo). Comparar cortes sí está |
| Calibración | Hecho | Logística puntaje → probabilidad en una cohorte, probada en otra; Brier, ECE, Hosmer-Lemeshow; se guarda |
| Estabilidad: PSI del puntaje y de variables, evolución | Hecho | `lab_estabilidad` y el PSI de cada variable; la evolución necesita varios cortes |
| Configurar, guardar y comparar evaluaciones | Hecho | Cada cálculo se guarda; Comparar cortes los pone lado a lado |

## 5. Descubrimiento estadístico (`/laboratorio/estadistica`)

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Resumen: variables, tipos, faltantes, IV relevante, redundantes, candidatas | Hecho | Resumen |
| Descriptivas numéricas y categóricas | Hecho | Asimetría y curtosis de Excel (G1, G2), atípicos de Tukey |
| Distribuciones | Hecho | Histograma con la tasa por tramo, cajas por clase, por recomendación y por mitad |
| Datos faltantes | A medias | Por variable (¿la ausencia anticipa?), conjuntos y por mes; falta "no consultado" contra "no tiene", que está en el perfil y el corte no congela |
| Correlaciones y VIF | Hecho | Pearson, Spearman, Kendall del par, con el resultado, V de Cramér |
| Inferencia | Hecho | Welch, Mann-Whitney, normalidad, ANOVA, Kruskal-Wallis, chi², Fisher; efecto e intervalo; corrección BH |
| IV y WoE | Hecho | `lab_calcular_variables`, con tramos que no parten empates (106) |
| Tramos manuales, monótonos, estabilidad del IV | Hecho | Laboratorio de tramos |
| Explorador de significancia | Hecho | Asociación, q, efecto, cobertura, estabilidad entre mitades, relevancia; registra candidatas |
| Segmentos (K-medias, silueta) | Hecho | `scripts/analisis-pesado.mjs` |
| PCA | Hecho | `scripts/analisis-pesado.mjs` |

## 6. Descubrimiento profundo de variables (`/laboratorio/profundo`)

| Pantalla | Estado | De dónde sale / qué falta |
|---|---|---|
| Resumen: crudo → estructura → modelo | Hecho | Resumen |
| Trazabilidad | Hecho | `/laboratorio/caso`: resultado y motivo, decisión, análisis, entrada al modelo, estructura, crudo a pedido (sólo admin), parecidos |
| Explorador del crudo | Hecho | `scripts/explorar-crudo.mjs` (104); falta el ajuste para un valor numérico |
| Explorador de la estructura | A medias | Cobertura por campo y versión, apagados, fuera de la configuración (107); falta el origen de cada campo como dato |
| Auditoría de la entrada al modelo | Hecho | Rearmada con `armarPerfilDelModelo` y comparada con `mensaje_al_modelo` (desde la 090) |
| Variables de los que cayeron | Hecho | Diferencias, faltantes, combinaciones y no lineales |
| Investigación de aprobados que cayeron | Hecho | Con su motivo (107) y sus parecidos que pagaron |
| Investigación de negados que habrían pagado | Hecho | Sólo con evidencia: la institución les prestó igual o pagaron un crédito de otra |
| Importancia: bosque, permutación, SHAP, por segmento | Hecho | `scripts/analisis-pesado.mjs` (TreeSHAP exacto) |
| Taller de variables | Hecho | Fórmulas interpretadas, con el mismo IV que el catálogo |
| Registro de candidatas | Hecho | 108: descubierta → en revisión → experimental → aceptada o rechazada; la aceptada pasa a propuesta de dato nuevo |

---

## Fases

| Fase | Qué | Estado |
|---|---|---|
| A | Terminar el ciclo simulado y ver sus resultados | Hecha (100-103) |
| B | El menú del Laboratorio en los módulos del negocio | Hecha (2026-10-04) |
| C | Prueba retrospectiva completa | Hecha (105) |
| D | Descubrimiento estadístico | Hecha (106) |
| E | Descubrimiento profundo | Hecha (104, 107, 108) |
| F | Bosque aleatorio, SHAP, K-medias, PCA | Hecha, con Node: en la máquina del negocio no hay Python |
| — | Inicio, instituciones y proyectos, calibración, datos y cartera | Hecho (105, 109) |

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
   **Cómo quedó (2026-10-04):** la librería es jStat (las distribuciones de
   los valores p); las fórmulas, en `src/lib/estadistica.js`. Lo pesado va
   con guiones de Node (`scripts/analisis-pesado.mjs`) porque en la máquina
   del negocio no hay Python; el patrón es el mismo.
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
