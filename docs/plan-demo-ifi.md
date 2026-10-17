# Demo para una institución financiera: diagnóstico y estrategia

Etapa 1 del plan del negocio del 2026-10-15 («Pendientes y planificación
estratégica»): qué existe, qué falta, qué se midió y qué hay que decidir antes
de diseñar. Escrito el 2026-10-16. **Nada de esto está construido ni decidido**:
lo que dice «recomiendo» es una propuesta.

Fuera de alcance por decisión del negocio: cumplimiento, seguridad y normativa.
Se nombran sólo cuando bloquean un paso concreto.

## 0. En seis líneas

1. **El simulador de crédito no existe** (ni una línea). Es la pieza más
   independiente: no espera datos de nadie. Conviene empezar por ahí.
2. **La capacidad de pago no existe, y el marco la excluye a propósito**: dice
   que la resuelve «el análisis económico de la entidad, que simula la cuota».
   Tiene que ser un cálculo en código, no algo que decida el modelo.
3. **La solicitud no es una entidad** (`docs/modelo-de-la-persona.md`). Sin
   solicitud no hay flujo Pro ni Plus. La API ya la prevé, opcional y sin tasa.
4. **La línea IESS ya la tenemos en buena parte**: Novadata trae el ingreso
   reportado al IESS de 1.713 de 2.573 personas (67%). Sirve de verdad para los
   dependientes, no para los independientes, que son justo quienes necesitan
   el predictor.
5. **El predictor de Equifax no se parece al IESS** (medido hoy sobre 45
   personas: correlación 0,28) y no sabemos en qué unidad está. Antes de
   construir sobre la base de 20.000 hay que saber qué es ese número.
6. **El predictor choca con una regla vigente**: «no se especula sobre el
   ingreso». Mostrar un ingreso estimado es una decisión del negocio, no un
   detalle de diseño.

## 0.1 Lo que decidió el negocio el 2026-10-17

Respuestas a las preguntas de la sección 5. Donde cambian lo propuesto abajo,
manda esto.

| # | Decisión | Qué implica |
|---|---|---|
| P1 | La demo corre sobre **personas reales**; que el score se mueva entre análisis no importa. | Cada flujo Plus con una persona nueva paga una consulta a Equifax (se reutiliza hasta el 17 de cada mes). |
| P2 | El buró de la demo es **Equifax**: Aval sólo trae datos de muestra. | El flujo Plus se diseña con las cuotas por operación de Equifax. |
| P3 | La preaprobación la decide **el modelo** (su recomendación). | Para que la capacidad de pago pese en la recomendación de Pro y Plus, la solicitud, la cuota simulada y la capacidad tienen que llegar al perfil del modelo: es una **versión nueva del marco**, con su fila en `scoring_rules_versions`. La capacidad se sigue calculando en código; el modelo la lee, no la calcula. |
| P4 | La demo muestra **todo lo que se construya, en pantallas**. La API es el canal por el que la IFI lo va a consumir. | Las pantallas y la API llaman al mismo orquestador. El contrato suma los bloques nuevos; la Fase 1 de la API va después de las pantallas. |
| P5 | Se muestra **sólo el ingreso estimado por nuestro propio predictor**. | El estimado de Equifax no se muestra ni se usa como dato de la persona (reemplaza la recomendación de 3.1 de mostrar varias estimaciones). El confirmado del IESS sigue mostrándose aparte. |
| P6 | El plan del predictor lo lleva otra sesión. | `docs/investigacion-predictor-de-ingresos.md`, secciones 8 a 11 (las bases de 3,9 millones y de 120.000, el pedido de columnas y el censo). |
| P7 | Tasa **nominal anual máxima de 15%** para consumo; cada institución puede usar menos (14,5%, 12,9%). Desgravamen de **0,6%** por el momento, con la fórmula en un módulo con parámetros. | Construido el 2026-10-17 (`_shared/simulador-credito.ts`). **Supuesto a confirmar**: el 0,6% es anual y se cobra cada mes sobre el saldo (0,6% mensual sería 7,2% al año). La pantalla deja cambiar la periodicidad y la base. |

## 1. Qué existe hoy

| Pieza | Estado | Dónde | Comentario |
|---|---|---|---|
| Ingesta de Novadata (52 fuentes) | Existe | `structure-client`, `novadata-client.ts` | Guarda el crudo (Storage) y distingue «no contestó» de «no hay» (`metaConsulta`). |
| Ingesta de buró de la IFI (Equifax, Aval) | Existe | `consultar-equifax`, `consultar-aval` | Un buró por IFI (`proveedores.es_buro`). Equifax se cobra por consulta. |
| Consultas por lote | Existe | `procesar-lote`, `scripts/consultar-lote.mjs` | |
| Perfil estandarizado | Existe | `process.ts` → `buildStandardProfile` | ~145 campos en 17 grupos, versionado. |
| Perfil de Ingresos | Existe | `fuentes-ingreso.ts` (fuentes-v10) | Segmento, perfil laboral, ingreso reportado al IESS, Ingreso Mínimo SBU, indicios de ingreso mayor, tamaño del negocio. **No estima montos.** |
| Predictor de ingresos | **Falta** | — | Ver sección 3. |
| Análisis de riesgo (score 1-999) | Existe | `analyze-client`, `marco-interpretativo.ts` (v30), `controles-bloqueo.ts` | Modelo de lenguaje + controles fijos. Recomienda aprobar / revisar / negar. |
| Obligaciones mensuales | Parcial | `equifax-estructura.ts` (`cuotaMensualUsd` del titular); Novadata sólo en cooperativas | Con Equifax hay cuota por operación; con Novadata sola, casi nunca. |
| Simulador de crédito | **Falta** | — | Ninguna fórmula de cuota ni de desgravamen en el código. |
| Capacidad de pago | **Falta** | — | El marco la deja afuera (comentario en `marco-interpretativo.ts`, líneas 284-286). |
| Solicitud como entidad | **Falta** | — | Hoy se evalúa a la persona en abstracto. |
| Política separada del score | **Falta** | — | Hoy el marco valora el riesgo **y** recomienda (`arquitectura-fabrica-de-credito.md`). |
| Modalidades Básico / Pro / Plus | **Falta** | — | Hay un solo camino: consulta → perfil → análisis. |
| API para la IFI | Sólo el contrato | `api/openapi.yaml` (Fase 0) | La Fase 1 (recepción, cola, trabajador) no está construida. |
| Trazabilidad y versiones | Existe | versiones del marco, fuentes y estructura; `huellaDelPedido()`; `mensaje_al_modelo`; sello del despliegue | Es la base para trazar también los nuevos módulos. |

**¿Se puede organizar en módulos? (3.1 del plan)** Ya lo está, como bibliotecas
y no como servicios: `supabase/functions/_shared/` es código que comparten las
funciones y la pantalla, con la regla de una sola implementación. Los módulos
nuevos (simulador, capacidad, predictor, política, orquestación) encajan igual:
una función pura en `_shared`, probada en Deno, que usan la pantalla, las
funciones y después la API. No hace falta partir en servicios para la demo.

**¿Varias capas de ingesta? (3.2)** En lo esencial, sí: el crudo se guarda, se
estandariza y se declara qué contestó. Lo que falta es que cada modalidad
declare **qué entradas exige** y qué módulos corre, y que el resultado diga qué
módulo no corrió y por qué (ver sección 4).

## 2. Lo que se midió hoy (en la base)

Sobre las 2.573 personas reales (sin las sintéticas de Aval):

- **Ingreso reportado al IESS**: 1.713 personas (67%).
- **Segmento**: independiente 1.019; dependiente privado 947; público 276;
  jubilado 94 y jubilado con ingreso adicional 141; informal o sin actividad 52;
  otros 44.
- **Perfil laboral**: independiente 824; dependiente con actividad propia 673;
  dependiente 598; independiente con empleados 286; jubilado 94; sin actividad
  registrada 65; afiliado voluntario 33.
- **Con indicios de ingreso mayor**: 509.

Equifax (62 consultas, todas con `IncomePredictor`; 45 de ellas con ingreso
reportado al IESS):

| Medida | Valor |
|---|---|
| `IncomePredictor` / ingreso IESS, mediana (p25-p75) | 9,0 (4,5-14,3) |
| Correlación (en logaritmo) `IncomePredictor` vs IESS | 0,28 |
| Indicador de impacto económico: correlación con IESS | 0,09 |
| Correlación entre los dos ingresos de Equifax | 0,70 |
| Indicador de impacto económico: mediana | un número redondo (parece una banda) |

Cómo leerlo: el `IncomePredictor` es unas 9 veces el ingreso mensual del IESS.
Podría ser anual (12 veces un ingreso que el IESS subreporta), pero **no está
probado**: es la pregunta abierta del diccionario
(`equifax-pedido-de-diccionario.md`, sección 3.11). Con 45 personas el
intervalo es ancho, y la correlación baja puede deberse a que el IESS subreporta
y no a que Equifax se equivoque. Las dos cosas son posibles.

## 3. Hallazgos que cambian el plan

**3.1 La variable objetivo es el problema, no el algoritmo.** Ninguna de las
tres líneas trae «el ingreso real»:

| Línea | Qué sería la verdad | Sirve para | No sirve para |
|---|---|---|---|
| Equifax (20.000) | La estimación de un tercero | Aproximar a Equifax sin pagarle cada consulta | Saber si acertamos; sin saber la unidad, ni eso |
| IESS (ya en Novadata) | Lo aportado | Dependientes (el aporte ≈ el sueldo) | Independientes y voluntarios: aportan sobre el SBU, es un mínimo |
| Endeudamiento | Ninguna | Una cota inferior del ingreso (ver 3.3) | Un monto por sí solo |

Recomiendo diseñar el predictor como **varias estimaciones con su origen**, no
un solo número: ingreso confirmado (IESS, dependiente), cota inferior por
crédito otorgado, estimación de Equifax (rotulada), y una estimación propia
cuando se pueda validar. La pantalla muestra cuál manda y por qué.

**3.2 La base de 20.000 vale mucho más si trae cédula.** Con cédula se puede
consultar Novadata para esas personas (hoy no cuesta; son unas 17 h con la
concurrencia actual) y tener, para cada una, nuestras variables **y** la
estimación de Equifax **y** el IESS. Eso permite tres cosas a la vez: entrenar
un modelo con nuestras variables, medir el error de Equifax contra el IESS en
los dependientes, y entrenar el modelo propio en dependientes y medir cuánto se
degrada al aplicarlo a independientes. Sin cédula, sólo sirve lo que venga en la
base, y si son variables de Equifax, el predictor sólo correría para las IFI con
Equifax. **Bloqueo práctico**: consultar a 20.000 personas necesita una base
legal declarada (el guion no corre sin ella).

**3.3 El crédito otorgado es la señal de ingreso más fuerte que tenemos.** Un
banco que otorgó una cuota de USD X verificó, en su momento, un ingreso de al
menos X dividido por su relación cuota/ingreso máxima. Con Equifax hay cuota por
operación y fecha de apertura: la cuota más alta que alguien aprobó da una **cota
inferior verificada por un tercero**. Es explicable, no necesita entrenar nada y
cubre a independientes con crédito bancario. Falta: la relación cuota/ingreso
que usa cada tipo de entidad (supuesto configurable) y descontar lo de codeudor
y garante (ya se separa por rol).

**3.4 El simulador es una función pura y la más segura de construir.** Va en
`_shared/simulador-credito.ts`, con pruebas en Deno y la misma función para la
pantalla, la capacidad de pago y la API. Equifax ya calcula una cuota con tasa
y desgravamen cuando se le manda una solicitud real (`ResultadoSegmentacion`:
`Tasa`, `SeguroDesgravament`, `CapacidadPago`): sirve para contrastar, nunca
como fuente.

**3.5 Score, capacidad y política son tres capas.** El score dice cuánto
riesgo; la capacidad dice si la cuota entra en el ingreso; la política (reglas
configurables por IFI) dice qué se hace con las dos. La recomendación de hoy del
modelo queda como una entrada más, no como la decisión. Esto ya lo proponía
`arquitectura-fabrica-de-credito.md` y es lo que hace distintos a los tres
flujos de verdad.

**3.6 Lo que el negocio dejó abierto y ahora bloquea.** Del modelo de la
persona: **¿quién decide «Preaprobado»?** (el modelo o la institución). Sin esa
respuesta no se puede definir el resultado del flujo Básico.

## 4. Los tres flujos sobre lo que existe

Recomendación: una modalidad es una **configuración** que declara entradas
exigidas, módulos que corren y qué entrega; el orquestador es uno solo.

| | Básico | Pro | Plus |
|---|---|---|---|
| Entradas exigidas | Cédula | + solicitud (monto, plazo, producto, tasa) | + buró de la IFI |
| Novadata, perfil, Perfil de Ingresos | Sí | Sí | Sí |
| Score del modelo | Sí (marco vigente) | Sí | Sí (con buró: marco-v31, hoy apagado) |
| Simulador | — | Sí | Sí |
| Obligaciones mensuales | — | Las que haya (cooperativas) | Las del buró, por operación |
| Ingreso para la capacidad | — | Confirmado (IESS) o «no evaluable» | Confirmado, cota por crédito, estimación |
| Capacidad de pago | — | Sí | Sí |
| Política | Preaprobación por score | + regla de capacidad | + reglas de buró |
| Resultado | Preaprobación preliminar + Perfil de Ingresos | Preaprobación con capacidad | Recomendación ampliada (aprobar / revisar / rechazar) |

Cuando falta un dato, el módulo no corre y el resultado lo dice («Capacidad de
pago: no evaluable, sin ingreso confirmado»). Nunca se rellena con cero.

**La API**: el contrato ya tiene `POST /evaluaciones` con `solicitudDeCredito`
opcional. Le faltan `modalidad`, la tasa y las condiciones en la solicitud, y en
el resultado los bloques `simulacion`, `capacidadDePago` e `ingresos` (con el
origen de cada estimación). Como la Fase 1 no está construida, para la demo la
pantalla llama al mismo orquestador; la API lo usa después sin duplicar nada.

## 5. Preguntas que condicionan el diseño

Hay que contestarlas antes de diseñar los flujos. Las demás pueden esperar.

| # | Pregunta | Qué cambia |
|---|---|---|
| P1 | ¿La demo corre en vivo sobre personas reales o sobre un conjunto preparado? | Costo (Equifax se cobra) y repetibilidad (el mismo perfil mueve el score ~40 puntos). |
| P2 | ¿La IFI de la demo usa Equifax o Aval? | Qué trae el flujo Plus y si hay cuotas por operación. |
| P3 | ¿«Preaprobación» la decide una regla o el modelo? ¿Quién decide Preaprobado? | El resultado del flujo Básico y la política. |
| P4 | ¿La demo muestra la API (llamadas de la IFI) o sólo pantallas? | Si hay que construir la Fase 1 antes de la demo. |
| P5 | ¿Se acepta mostrar un ingreso estimado, rotulado y separado del confirmado? | La regla «no se especula sobre el ingreso». Sin esto, el predictor no se muestra. |
| P6 | ¿La base de 20.000 trae cédula, qué variables y en qué unidad está el predictor? ¿Hay ingresos verificados? | Cuál de las líneas del predictor es viable (3.2). |
| P7 | ¿Qué producto de consumo de referencia usamos (tasa, desgravamen, comisiones)? | Los parámetros por defecto del simulador. |

Pueden esperar: francés o alemán (el simulador acepta los dos), comisiones,
tabla de amortización exportable, la revisión contractual del uso de Equifax.

## 6. Información a conseguir

| Qué | Para qué decisión | Formato | Prioridad | Quién | Etapa |
|---|---|---|---|---|---|
| Estructura de la base de 20.000: columnas, si trae cédula, unidad del predictor | P6, línea Equifax | Lista de columnas + 20 filas con cédula enmascarada | Indispensable | Vos | Predictor |
| Definición del `IncomePredictor` y del indicador de impacto económico (mensual o anual, método, error) | Interpretar 3.2 y la sección 2 | Respuesta escrita de Equifax | Indispensable | Equifax (ya está en el pedido de diccionario) | Predictor |
| Tarifario de un producto de consumo real: tasa (nominal o efectiva), desgravamen (tasa y base), comisiones, redondeo | P7, simulador | Una hoja o una tabla de amortización de ejemplo | Indispensable | Vos (de una IFI) | Simulador |
| Relación cuota/ingreso máxima que usan bancos y cooperativas | Cota por crédito otorgado (3.3) y regla de capacidad | Un número por tipo de entidad | Indispensable | Vos | Capacidad |
| Base IESS del proveedor más allá de los consultados | Ampliar la muestra de dependientes | Campos disponibles y si es mensual o promedio | Conveniente (ya hay 1.713) | Novadata | Predictor |
| Respuestas de P1 a P5 | Diseño de los flujos | Respuesta en el chat | Indispensable | Vos | Flujos |
| Ejemplos de solicitudes reales de la IFI | Qué campos trae una solicitud | 3-5 formularios sin datos personales | Conveniente | Vos | Flujos |

Lo que **no** hace falta pedir: documentación de la API y de los módulos, ejemplos
del análisis de riesgo y del Perfil de Ingresos, y la estructura del
endeudamiento de Equifax y Novadata: ya están en el repositorio y en la base.

## 7. Orden propuesto

1. **Decisiones P1 a P7 y pedidos de información** (sección 6). En paralelo
   con el paso 2.
2. **Simulador**: función pura, pruebas con casos calculados a mano, pantalla.
   **Hecho el 2026-10-17**: `_shared/simulador-credito.ts` (francés y alemán,
   desgravamen sobre el saldo o el monto, anual o mensual, tasa máxima del
   producto), 11 pruebas en Deno y la pantalla Evaluación Crediticia › Simulador
   de crédito (`/simulador`). Falta: comisiones, si una institución las cobra,
   y la tasa máxima por institución guardada en la base.
3. **Solicitud como entidad y capacidad de pago** con ingreso confirmado y
   obligaciones conocidas. Lo que no se puede evaluar se dice.
4. **Política configurable y orquestador de modalidades**, con la pantalla de la
   evaluación (Básico / Pro / Plus).
5. **Predictor v0, explicable**: confirmado + cota por crédito otorgado +
   estimación de Equifax rotulada. Sin entrenar nada.
6. **Predictor v1, entrenado**, cuando llegue la base de 20.000 y se sepa qué es
   el predictor de Equifax (3.2). Se valida contra el IESS en dependientes.
7. **API**: el contrato con los bloques nuevos; la Fase 1 sólo si P4 lo pide.
8. **Escenarios y guion de la demo**, separando lo calculado de lo supuesto.

La investigación de soluciones existentes (2.5 del plan) puede correr ya, en
otra sesión, porque sólo lee: sirve para el paso 6, no para los anteriores.
