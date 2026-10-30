# Demo para una institución financiera: diagnóstico y estrategia

Etapa 1 del plan del negocio del 2026-10-15 («Pendientes y planificación
estratégica»): qué existe, qué falta, qué se midió y qué hay que decidir antes
de diseñar. Escrito el 2026-10-16 y puesto al día el 2026-10-18. Las secciones 0
a 6 son el diagnóstico del 16 con la nota de lo que se construyó después; la 7
es el orden y dice, paso por paso, qué está hecho. Lo que dice «recomiendo» es
una propuesta, salvo donde la sección 0.1 diga que el negocio la decidió.

Fuera de alcance por decisión del negocio: cumplimiento, seguridad y normativa.
Se nombran sólo cuando bloquean un paso concreto.

## 0. En seis líneas

Escritas el 2026-10-16. Las tres primeras se construyeron el 17 (marcadas);
las otras tres siguen vigentes y son del predictor, que lleva otra sesión.

1. **El simulador de crédito no existía.** Era la pieza más independiente.
   *Hecho el 2026-10-17* (`_shared/simulador-credito.ts`, función
   `simular-credito`, pantalla `/simulador`).
2. **La capacidad de pago no existía, y el marco la excluye a propósito**: dice
   que la resuelve «el análisis económico de la entidad, que simula la cuota».
   Tiene que ser un cálculo en código, no algo que decida el modelo. *Hecho el
   2026-10-17* (`_shared/capacidad-de-pago.ts`, función `capacidad-de-pago`,
   pantalla `/capacidad/:cedula`). El marco sigue sin leerla (decisión del
   negocio: el marco y el modelo se tocan al final).
3. **La solicitud no era una entidad** (`docs/modelo-de-la-persona.md`). Sin
   solicitud no hay flujo Pro ni Plus. *Hecho el 2026-10-17* (tabla
   `solicitudes`, 133; función `evaluar-solicitud`; Básico, Pro y Plus).
4. **La línea IESS ya la tenemos en buena parte**: Novadata trae el ingreso
   reportado al IESS de 1.713 de 2.573 personas (67%). Sirve de verdad para los
   dependientes, no para los independientes, que son justo quienes necesitan
   el predictor.
5. **El predictor de Equifax no se parece al IESS** (medido hoy sobre 45
   personas: correlación 0,28) y no sabemos en qué unidad está. Antes de
   construir sobre la base de 20.000 hay que saber qué es ese número.
6. **El predictor choca con una regla vigente**: «no se especula sobre el
   ingreso». Mostrar un ingreso estimado es una decisión del negocio, no un
   detalle de diseño. *Resuelto en parte (P5)*: se muestra sólo el ingreso
   estimado por nuestro propio predictor, no el de Equifax.

## 0.1 Lo que decidió el negocio el 2026-10-17 y 18

Respuestas a las preguntas de la sección 5 (P1 a P7) y, después de la tabla, lo
que decidió mientras se construía. Donde cambian lo propuesto abajo, manda esto.

| # | Decisión | Qué implica |
|---|---|---|
| P1 | La demo corre sobre **personas reales**; que el score se mueva entre análisis no importa. | Cada flujo Plus con una persona nueva paga una consulta a Equifax (se reutiliza hasta el 17 de cada mes). |
| P2 | El buró de la demo es **Equifax**: Aval sólo trae datos de muestra. | El flujo Plus se diseña con las cuotas por operación de Equifax. |
| P3 | La preaprobación la decide **el modelo** (su recomendación). | Para que la capacidad de pago pese en la recomendación de Pro y Plus, la solicitud, la cuota simulada y la capacidad tienen que llegar al perfil del modelo: es una **versión nueva del marco**, con su fila en `scoring_rules_versions`. La capacidad se sigue calculando en código; el modelo la lee, no la calcula. |
| P4 | La demo muestra **todo lo que se construya, en pantallas**. La API es el canal por el que la IFI lo va a consumir. | Las pantallas y la API llaman al mismo orquestador. El contrato suma los bloques nuevos; la Fase 1 de la API va después de las pantallas. |
| P5 | Se muestra **sólo el ingreso estimado por nuestro propio predictor**. | El estimado de Equifax no se muestra ni se usa como dato de la persona (reemplaza la recomendación de 3.1 de mostrar varias estimaciones). El confirmado del IESS sigue mostrándose aparte. |
| P6 | El plan del predictor lo lleva otra sesión. | `docs/investigacion-predictor-de-ingresos.md`, secciones 8 a 11 (las bases de 3,9 millones y de 120.000, el pedido de columnas y el censo). |
| P7 | Tasa **nominal anual máxima de 15,6%** para consumo (era 15% hasta el 2026-10-19) y **mínima de 0%** (financiamiento sin interés); cada institución puede usar menos (14,5%, 12,9%). Sin tasa en el pedido se evalúa con la máxima; nunca negativa. Desgravamen de **0,6%** por el momento, con la fórmula en un módulo con parámetros. | Construido el 2026-10-17 (`_shared/simulador-credito.ts`). El 0,6% es **anual** (confirmado el 2026-10-17) y se cobra cada mes sobre el saldo. La pantalla deja cambiar la periodicidad y la base. |
| P8 | **Límites del producto de consumo (2026-10-19):** monto de USD 1.000 a 120.000 y plazo de 6 a 120 meses. | `PRODUCTO_CONSUMO.limites` en `simulador-credito.ts` (simulador-v3). La pantalla, `simular-credito`, `capacidad-de-pago` y la solicitud Pro y Plus los exigen; `montoMaximoParaCuota()` devuelve 0 si lo que alcanza es menos que el mínimo. Las pruebas del motor usan `LIMITES_TECNICOS` (1 a 480 meses, desde un centavo). Una solicitud guardada fuera de estos rangos falla en el paso de capacidad. |

Lo que decidió mientras se construía (el detalle de cada una está en la sección
7, en el paso que la usa):

| Cuándo | Decisión | Qué implica |
|---|---|---|
| 2026-10-17 | **Cada módulo con su propia puerta.** | Una función y una operación del contrato por módulo (`simular-credito` y `POST /simulaciones`; `capacidad-de-pago` y `POST /capacidades-de-pago`), además de lo que corre la evaluación entera. |
| 2026-10-17 | **Carga máxima de 40%** del ingreso neto. | Parámetro de cada institución (`PARAMETROS_CAPACIDAD`); «justo» desde 5 puntos antes. |
| 2026-10-17 | **Ingreso declarado**: lo que la persona dice recibir por mes. | Reemplaza al ingreso del IESS en la capacidad, sin descontarle nada, y se rotula «sin verificar». No es una estimación: no choca con «no se especula sobre el ingreso». |
| 2026-10-17 | **El orquestador vive en el servidor y avanza por pasos.** | `evaluar-solicitud` corre un paso por llamada; la pantalla (y después la API) vuelve a llamar hasta que no queda ninguno. |
| 2026-10-17 | **La recomendación del modelo y la capacidad de pago se muestran por separado.** | Ninguna regla las combina; la política configurable queda para después, si el negocio la quiere. |
| 2026-10-17 | **Plus consulta Equifax si no hay una consulta vigente, y eso es sólo de administración** (se cobra). | A un analista el paso del buró le falla con el motivo. Para la API queda por decidir quién autoriza ese gasto (ver `docs/pendientes.md`). |
| 2026-10-18 | **El segundo estado de la persona se llama «En proceso».** | Reemplaza a «Solicitante». Choca con el `en_proceso` del estado de la evaluación en el contrato (ver `docs/modelo-de-la-persona.md`, sección 5). |
| 2026-10-18 | **Quien fue rechazado o desistió tiene un estado propio: «No aprobado».** | Cierra la pregunta «¿y el que no pasa?» de `docs/modelo-de-la-persona.md`. |
| 2026-10-18 | **La decisión de la institución (Aprobado / Rechazado) la marca el analista en la solicitud.** | La marca una persona, no el modelo ni una regla. La preaprobación sigue siendo del modelo (P3). **Construido el 2026-10-18** (134): Aprobado, Rechazado o Desistió, con motivo. |
| 2026-10-18 | **«Perfil del Cliente» pasa a «Perfil de la Persona».** | **Renombrado el 2026-10-18** (#52, 24 textos); el control de textos corta con el nombre viejo. |

## 1. Qué existe hoy

El diagnóstico del 2026-10-16, con lo que cambió hasta el 18.

| Pieza | Estado | Dónde | Comentario |
|---|---|---|---|
| Ingesta de Novadata (52 fuentes) | Existe | `structure-client`, `novadata-client.ts` | Guarda el crudo (Storage) y distingue «no contestó» de «no hay» (`metaConsulta`). |
| Ingesta de buró de la IFI (Equifax, Aval) | Existe | `consultar-equifax`, `consultar-aval` | Un buró por IFI (`proveedores.es_buro`). Equifax se cobra por consulta. |
| Consultas por lote | Existe | `procesar-lote`, `scripts/consultar-lote.mjs` | |
| Perfil estandarizado | Existe | `process.ts` → `buildStandardProfile` | ~145 campos en 17 grupos, versionado. |
| Perfil de Ingresos | Existe | `fuentes-ingreso.ts` (fuentes-v11) | Segmento, perfil laboral, ingreso reportado al IESS, Ingreso Mínimo SBU, indicios de ingreso mayor, tamaño del negocio. **No estima montos.** |
| Predictor de ingresos | **Falta** | — | Ver sección 3. |
| Análisis de riesgo (score 1-999) | Existe | `analyze-client`, `marco-interpretativo.ts` (v30), `controles-bloqueo.ts` | Modelo de lenguaje + controles fijos. Recomienda aprobar / revisar / negar. |
| Obligaciones mensuales | Existe (2026-10-17) | `capacidad-de-pago.ts` → `datosDeCapacidad()`; `equifax-estructura.ts` (`cuotaMensualUsd` del titular); Novadata sólo en cooperativas | Con Equifax hay cuota por operación; con Novadata sola, casi nunca: lo que no trae cuota se lista aparte (`deudasSinCuota`), nunca como cero. |
| Simulador de crédito | Existe (2026-10-17) | `simulador-credito.ts`, función `simular-credito`, pantalla `/simulador` | Francés y alemán, desgravamen sobre el saldo o el monto. Falta: comisiones. |
| Capacidad de pago | Existe (2026-10-17) | `capacidad-de-pago.ts`, función `capacidad-de-pago`, pantalla `/capacidad/:cedula` | Es un cálculo, no una opinión del modelo: el marco la deja afuera a propósito (comentario en `marco-interpretativo.ts`, hacia la línea 285). Con Ingreso declarado opcional. |
| Solicitud como entidad | Existe (2026-10-17) | tabla `solicitudes` (133), función `evaluar-solicitud`, pantallas `/solicitud/nueva` y `/solicitud/:id` | Falta lo que decide la institución (Aprobado / Rechazado) y el estado de la persona. |
| Política separada del score | **Falta** | — | Hoy el marco valora el riesgo **y** recomienda (`arquitectura-fabrica-de-credito.md`). |
| Modalidades Básico / Pro / Plus | Existe (2026-10-17) | `modalidades.ts`, `evaluar-solicitud` | Son configuración sobre un solo orquestador. Probadas de punta a punta el 2026-10-18. |
| API para la IFI | Sólo el contrato | `api/openapi.yaml` (Fase 0; revisado contra el código el 2026-10-18) | Trae `modalidad`, `capacidadDePago`, `POST /simulaciones` y `POST /capacidades-de-pago`. La Fase 1 (recepción, cola, OAuth) no está construida: hoy las funciones piden la sesión de un analista. |
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

**3.4 El simulador es una función pura y la más segura de construir.** (Hecho
el 2026-10-17.) Va en
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

**3.6 Lo que el negocio dejó abierto y bloqueaba.** Del modelo de la persona:
**¿quién decide «Preaprobado»?** (el modelo o la institución). *Contestado el
2026-10-17 (P3)*: lo decide el modelo. La decisión de la institución (Aprobado /
Rechazado) la marca el analista en la solicitud (2026-10-18).

## 4. Los tres flujos sobre lo que existe

Recomendación (adoptada el 2026-10-17): una modalidad es una **configuración**
que declara entradas exigidas, módulos que corren y qué entrega; el orquestador
es uno solo. La tabla es la propuesta del 16; lo construido difiere en las filas
de política y resultado: no hay una regla que combine el modelo y la capacidad,
y cada uno se entrega por separado (sección 0.1).

| | Básico | Pro | Plus |
|---|---|---|---|
| Entradas exigidas | Cédula | + solicitud (monto, plazo, producto, tasa) | + buró de la IFI |
| Novadata, perfil, Perfil de Ingresos | Sí | Sí | Sí |
| Score del modelo | Sí (marco vigente) | Sí | Sí (con buró: marco-v31, hoy apagado) |
| Simulador | — | Sí | Sí |
| Obligaciones mensuales | — | Las que haya (cooperativas) | Las del buró, por operación |
| Ingreso para la capacidad | — | Confirmado (IESS), Ingreso declarado o «no evaluable» | Lo mismo (la cota por crédito y la estimación esperan al predictor) |
| Capacidad de pago | — | Sí | Sí |
| Política | Preaprobación por score | + regla de capacidad | + reglas de buró |
| Resultado | Preaprobación preliminar + Perfil de Ingresos | Preaprobación con capacidad | Recomendación ampliada (aprobar / revisar / rechazar) |

Cuando falta un dato, el módulo no corre y el resultado lo dice («Capacidad de
pago: no evaluable, sin ingreso confirmado»). Nunca se rellena con cero.

**La API**: el contrato tenía `POST /evaluaciones` con `solicitudDeCredito`
opcional. Ya trae `modalidad`, la tasa y las condiciones en la solicitud, y en el
resultado `capacidadDePago` (con la simulación adentro); además, `POST
/simulaciones` y `POST /capacidades-de-pago` como puertas propias. Falta el
bloque `ingresos` con el origen de cada estimación, que espera al predictor.
Como la Fase 1 no está construida, para la demo la pantalla llama al mismo
orquestador (`evaluar-solicitud`); la API lo usa después sin duplicar nada. Lo
que el contrato dice y el código todavía no hace está en el informe de la
revisión del 2026-10-18 (resumido en `docs/pendientes.md`, sección 1).

## 5. Preguntas que condicionan el diseño

Había que contestarlas antes de diseñar los flujos. **Las siete se contestaron
el 2026-10-17** (P1 a P7, sección 0.1); se dejan acá con la pregunta original.
Las demás pueden esperar.

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
   **La capacidad de pago, hecha el 2026-10-17** (la solicitud como entidad, el
   paso 4):
   - `_shared/capacidad-de-pago.ts`: `datosDeCapacidad()` saca del perfil el
     ingreso reportado al IESS (al sueldo se le descuenta el aporte personal de
     9,45%) y las cuotas (con Equifax, las del titular por sistema; sin él, las
     de cooperativas); la pensión alimenticia que paga es una cuota más; las
     deudas sin cuota (casas comerciales, bancos sin buró, préstamo del IESS) se
     listan aparte, nunca como cero. `evaluarCapacidad()` da el veredicto
     (alcanza, justo, no alcanza, sin ingreso) y la cuota máxima;
     `montoMaximoParaCuota()` (en el simulador) dice hasta cuánto le alcanza.
   - **Cada módulo con su propia puerta** (pedido del negocio del 2026-10-17):
     las funciones `simular-credito` y `capacidad-de-pago` se llaman solas, sin
     pasar por la evaluación; en el contrato de la API son `POST /simulaciones` y
     `POST /capacidades-de-pago`. La capacidad acepta una cédula (lee lo que ya
     se sabe de la persona, sin consultar fuentes) o los datos de la institución.
   - Pantalla Evaluación Crediticia › Capacidad de pago (`/capacidad/:cedula`),
     también como pestaña de la persona.
   - La carga máxima es 40% del ingreso neto (`PARAMETROS_CAPACIDAD`,
     **confirmada por el negocio el 2026-10-17**); el resultado es «justo»
     desde 5 puntos antes. Cada institución puede poner la suya.
   - **Ingreso declarado** (nombre del negocio, 2026-10-17): lo que la persona
     que pide el crédito dice que recibe por mes. Es opcional; si se completa,
     reemplaza al del IESS en el cálculo, sin descontarle nada, y se rotula
     «sin verificar»; la pantalla y la función (`ingresoDeclarado`, con
     `capacidadSoloIess` en la respuesta) muestran además lo que daría sólo el
     IESS. Hizo falta porque, con sólo el IESS, **55 de las 62 personas con
     Equifax ya pagaban más que su ingreso neto** (la cuota de Equifax sí es
     mensual: mediana de la cuota sobre el saldo, 4%).
   - Falta: que la carga máxima de cada institución viva en la base, y la
     cuota de las casas comerciales (hoy se lista sin cuota).
4. **Política configurable y orquestador de modalidades**, con la pantalla de la
   evaluación (Básico / Pro / Plus).
   **La solicitud y el orquestador, hechos el 2026-10-17 (133)**, con tres
   decisiones del negocio de ese día:
   - **El orquestador vive en el servidor y avanza por pasos**: la función
     `evaluar-solicitud` crea la solicitud (tabla `solicitudes`) y cada llamada
     a `avanzar` corre un paso, porque Novadata y el modelo juntos pasan los
     150 s de una función. Los pasos llaman a las funciones de cada módulo con
     la sesión de quien pidió (`structure-client`, `consultar-equifax`,
     `analyze-client`) y la capacidad se calcula ahí mismo. El perfil se
     reutiliza si tiene menos de 7 días; Equifax, si está vigente.
   - **La recomendación del modelo y la capacidad se muestran por separado**:
     no hay una regla que las combine (la política queda para después).
   - **Plus consulta Equifax si no hay una consulta vigente**, y eso es sólo de
     administración (se cobra): a un analista el paso le falla con el motivo.
   - Las modalidades son configuración (`_shared/modalidades.ts`): Básico =
     perfil y modelo; Pro = más la capacidad; Plus = más el buró. En el contrato,
     `modalidad` de `POST /evaluaciones` y `capacidadDePago` en su resultado.
   - Pantallas: Solicitudes › Nueva solicitud (`/solicitud/nueva`) y la
     solicitud con su avance (`/solicitud/:id`).
   - **La decisión de la institución y los estados de la persona, hechos el
     2026-10-18** (#52, 134): el analista marca Aprobado, Rechazado o Desistió
     en la solicitud, con motivo, y el estado de la persona se calcula desde sus
     solicitudes (`_shared/estado-de-la-persona.ts`). Falta mostrarlo en la
     bandeja, el Expediente y Monitoreo (`docs/pendientes.md`), y la política
     configurable que combine modelo y capacidad, si el negocio la quiere.
   - Probadas de punta a punta el 2026-10-18 con una persona real; Plus pagó una
     consulta de Equifax, autorizada.
5. **Predictor v0, explicable**: confirmado + cota por crédito otorgado +
   estimación de Equifax rotulada. Sin entrenar nada.
6. **Predictor v1, entrenado**, cuando llegue la base de 20.000 y se sepa qué es
   el predictor de Equifax (3.2). Se valida contra el IESS en dependientes.
7. **API**: el contrato con los bloques nuevos; la Fase 1 sólo si P4 lo pide.
   **El contrato, hecho y revisado contra el código el 2026-10-18**
   (`modalidad`, `capacidadDePago`, `POST /simulaciones`, `POST
   /capacidades-de-pago`). La Fase 1 sigue sin construirse (P4: va después de
   las pantallas).
8. **Escenarios y guion de la demo**, separando lo calculado de lo supuesto.

La investigación de soluciones existentes (2.5 del plan) puede correr ya, en
otra sesión, porque sólo lee: sirve para el paso 6, no para los anteriores.

## 8. Lo hecho y decidido al 2026-10-20

Se movió acá desde `docs/pendientes.md` (2026-10-20). Lo que sigue abierto está en
esa lista; lo decidido con el negocio, en la sección 0.1.

- **Hecho y en producción:** simulador (#39), capacidad de pago con el Ingreso declarado
  (#42, #45), solicitud y orquestador Básico / Pro / Plus (#46, 133), la revisión integral
  (#48 a #51), los estados de la persona con la decisión de la institución (#52, 134), los
  datos de la API en la solicitud (#59, 135) y la supresión de una solicitud sin persona
  (136). Las tres modalidades se probaron de punta a punta el 2026-10-18 con una persona
  real; Plus pagó una consulta de Equifax, autorizada por el negocio.
- **Estados de la persona (2026-10-18):** el analista marca Aprobado, Rechazado o Desistió
  en `/solicitud/:id`, con motivo (vale la última; todas quedan en `decisiones`); el estado
  se calcula con `estadoDeLaPersona()`. Con Revisar o Negar la persona sigue En proceso hasta
  que decide el analista, y manda la última solicitud: lo resolvió Claude sin palabra del
  negocio. La API admite además `aprobado_con_condiciones`, monto y plazo aprobados
  (`POST /evaluaciones/{id}/decision`); la pantalla, no.
- **Revisión integral (2026-10-18) y respuestas del negocio (2026-10-19)**, con la
  numeración del informe de esa revisión: 1, 2, 4 y 7 cerrados (#59; migración 135 y
  funciones desplegadas con el corredor, 10 de 10; el control de seguridad dio 73 de 73).
  3 (estados y etapas) se hace cuando los flujos estén afinados. 6: **sin firma**; se sacaron
  del contrato el campo `firma` y `/.well-known/jwks.json`; quedan la firma de los avisos
  (`webhook-signature`, que protege a la institución de un aviso falso) y la de la ficha de
  acceso (OAuth), que no son lo mismo. 10: los importes van con dos decimales y las tasas y
  fracciones con toda la precisión del cálculo (más de 8 decimales), sin redondear.
- **Funciones y base (2026-10-18, 516dc33):** `evaluar-solicitud` ya no copia en la
  solicitud el mensaje de la función llamada (podía traer el de Novadata, Equifax, el modelo
  o la base: `falloDeUnPaso()`); un paso que pudo dejar algo en vuelo (el buró, sobre todo)
  no se reintenta hasta 3 minutos después; dos solicitudes de la misma persona no consultan
  Equifax a la vez (`pasoEnCurso()`); Plus ya no calcula con Novadata cuando la consulta de
  Equifax no tiene estructura; un fallo queda en `audit_log` (`solicitud.paso_fallido`).
  `capacidad-de-pago` lee la misma consulta de Equifax que la pantalla y rechaza una cuota
  que no es número.
- **136 (supresión sin persona, pedida por el negocio el 2026-10-19):** si el primer paso
  no llega a crear a la persona en `clients`, la solicitud queda sólo con la identificación y
  `suprimir_titular()` exigía la fila en `clients`. La 136 la recrea desde su definición viva:
  sin persona borra lo que hay por la identificación, y sólo si no hay nada contesta «No hay
  ningún registro». `derechos-del-titular.mjs` lista, exporta y suprime también sin persona.
  Medido el 2026-10-18: ninguna fila así.
- **Sin candado para dos consultas a Equifax a la vez** (decisión del negocio, 2026-10-19):
  que dos usuarios consulten a la misma persona al mismo tiempo por caminos distintos (el
  botón de administración y una solicitud Plus) es muy poco probable, y con unos 40 s de
  diferencia la segunda ya encuentra la consulta vigente y la reutiliza. No se construye.
- **Tasa máxima y Tasa mínima (2026-10-19, simulador-v4):** de 0% (financiamiento sin
  interés) a 15,6% (era 15%). Sin tasa se evalúa y se guarda la máxima; con una tasa, se pide
  una menor; nunca negativa ni mayor que la máxima. Cada error de las condiciones trae un
  código fijo (`erroresDelPedido()`; `detalles` en el 400 de `simular-credito` y
  `capacidad-de-pago`; `ErrorDeCondiciones` en `api/openapi.yaml`, con la tabla).
- **Intentos a Equifax: 3 en total desde el 2026-10-19** (decisión del negocio;
  `EQUIFAX_MAX_INTENTOS`), con 1,5 s de espera creciente y sólo para lo que no llegó a
  procesarse (429, 502, 503, 504; un 401 con token nuevo). **El freno** (2dacfcf): tras 3
  fallos seguidos de Equifax (no llegó, 5xx, credenciales rechazadas o respuesta
  incomprensible; no cuentan los de una persona), `consultar-equifax` contesta 503 con el
  motivo `equifax_no_responde` sin llamar ni cobrar, hasta 10 minutos después del último
  fallo; pasado ese tiempo sale UNA consulta de prueba (si falla se cierra de nuevo, si sirve
  se reinicia). Vive en `frenoDeEquifax()` de `equifax-persistencia.ts`: lo comparten la
  función y el guion local. Si la auditoría no se puede leer, no frena (el tope diario es el
  que protege la plata). En la solicitud, el paso del buró queda fallido con el código
  `buro_no_disponible` y sin espera.
- **Cuota de 200 de Equifax: era un error de interpretación del negocio (2026-10-19).** El
  pedido no tiene campo de cuota (`tipoProducto` 1, `monto` 5.000, `plazo` 12,
  `restaGastoFinanciero` 0).
- **Hallazgo que pesa en la demo:** con sólo el IESS, 55 de las 62 personas con Equifax ya
  pagan más que su ingreso neto (la cuota de Equifax sí es mensual). Por eso existe el
  Ingreso declarado.
- Las pruebas con sesión van en el puerto 5184 (origen permitido por CORS).
