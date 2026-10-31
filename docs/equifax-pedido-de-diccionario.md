# Equifax: lo que necesitamos que defina el diccionario de datos

Para quien consiga el diccionario de datos de Equifax (2026-10-13). Es la lista
completa de lo que CrediScope necesita que **Equifax defina o confirme** antes de
construir encima: las tablas y la estructura de Equifax ya están hechas
(`docs/propuesta-estructura-equifax.md`, migración 126), pero cada cálculo se
apoya en un significado que **hoy es una hipótesis medida, no una definición**.

El diccionario de Aval decía una cosa en dos campos y los datos otra, y se supo
con 240 respuestas. Acá pasa lo mismo en chico: con 22 respuestas ya hay campos
cuyo nombre promete algo que los datos no cumplen. Mejor preguntar ahora.

**Cómo leerlo.** Cada fila dice qué campo es, **lo que entendemos hoy** (y con
qué evidencia: «22/22» es que se cumple en las 22 respuestas), y **qué
necesitamos** que Equifax conteste. La columna «Para qué» dice qué cálculo
nuestro depende de la respuesta. Las prioridades:

- **Alta**: cambia una cifra que va al modelo o a la decisión; hay que
  resolverla antes de usarla.
- **Media**: afina una cifra o evita un error cuando haya más casos.
- **Baja**: curiosidad útil; se puede esperar.

En Ecuador **«garantía» es el colateral** (un auto, una casa, un pagaré). Lo que
Equifax llama «garantías personales» es una persona respondiendo por la deuda de
otra, y en CrediScope se llama **codeudor o garante**. En este documento, cuando
Equifax escribe `garantias_personales_…`, es el nombre de su lista.

## 1. Preguntas generales

| # | Pregunta | Para qué | Prior. |
|---|---|---|---|
| G1 | ¿Hay un diccionario de datos vigente de `reporteCrediticio` y de `interconnectResponse`? ¿De qué versión y fecha? ¿Avisan cuando cambia la forma de la respuesta? | Detectar cambios sin enterarnos por un error. | Alta |
| G2 | ¿Cada cuánto se actualiza el reporte y cuándo corta cada mes? Hoy damos una consulta por válida hasta el 17 de cada mes. | La vigencia de lo que se paga. | Alta |
| G3 | En el sector comercial una misma respuesta trae operaciones con cortes de 31/08, 30/09 y 06/10. ¿Qué corte es el vigente y cuáles son rezagos? | Las deudas comerciales no cuadran con su resumen en 6 de 22 personas. | Alta |
| G4 | El resumen por sistema (`valor_deuda_3_sistemas`) ¿cuenta TODAS las operaciones, también aquellas donde la persona es codeudora o garante? | Lo medimos: la suma de todos los roles lo reproduce en bancos 22/22; la del titular solo, no. Necesitamos que lo confirmen. | Alta |
| G5 | Lo mismo para `resumen_informe` (impagos, demanda judicial, cartera castigada), `protestos_morosidades.morosidades` y `cuota_estimada_mensual.pago`: ¿incluyen codeudor y garante? | Medido: sí, 22/22 en impagos y 20/22 en la cuota. Cambia lo que le atribuimos a la persona. | Alta |
| G6 | Las operaciones de las listas de deuda no traen número. ¿Hay algún identificador que permita seguir **la misma operación** de un mes al siguiente? | Hoy no se puede: institución más apertura no alcanza (788 pares de filas de un mismo mes comparten ambas) ni sumarle el cupo, que cambia entre meses. Nada se cuenta «por operación» a través de los meses. | Alta |
| G7 | ¿`dias_morosidad` mayor que cero con `total_vencido` en cero es posible? ¿Qué significa? | Pasa en 670 de 11.264 filas de historia. Lo contrario (vencido sin días) no pasa nunca. Usamos los días como «hubo mora». | Alta |
| G8 | ¿Qué es `SFNR` y por qué `DetalleDeudaActualReportadaRFRSBS` (cooperativas) lo trae? | Aparece sólo en `interconnectResponse`. | Media |
| G9 | ¿Qué filas trae de más `DetalleDeudaActualReportadaSBSSBS_Educativo` que `detalle_deuda_actual_sb`? | Coinciden en 9 de 22; en las otras trae más. No las sumamos nunca, pero hay que saber qué son. | Media |
| G10 | ¿Cómo se calcula `Composicion_deuda_actual` (riesgo directo e indirecto)? | No coincide con ninguna suma nuestra (0/22). No la usamos como deuda. | Media |
| G11 | ¿Qué parámetros de la decisión (`monto`, `plazo`, `tipoProducto`) mueven los resultados de `interconnectResponse` y cuáles dependen sólo de la persona? | Mandamos valores de relleno. Si la segmentación del titular no depende de ellos, se podría usar. | Media |

## 2. Código por código: listas cerradas que necesitamos completas

Lo observado en las 22 respuestas. Pedimos **la lista completa y su definición**:
un valor que todavía no vimos llegaría y no sabríamos tratarlo.

| Campo | Valores observados | Necesitamos | Prior. |
|---|---|---|---|
| `tipo_riesgo` | `TITULAR`, `Titular`, `CODEUDOR`, `GARANTE` | Lista completa. ¿Hay otros (avalista, deudor solidario)? ¿Por qué viene `TITULAR` y `Titular`? | Alta |
| `tipo_credito` (deuda actual) | Microcredito, Tarjeta, Consumo, Vivienda, Comercial | Lista completa y qué incluye cada uno. | Media |
| `tipo_credito` (historia) | además: Consumo prioritario, Microcrédito de acumulación ampliada, Productivo pymes, Productivo empresarial | ¿Por qué la historia usa otras etiquetas que la deuda actual para la misma operación («Consumo» / «Consumo prioritario»)? ¿Equivalencias? | Media |
| `estado_operacion` (`creditos_otorgados`) | ORIGINAL, NOVADA, REFINANCIADA, REESTRUCTURADA, NO DISPONIBLE | Definición de cada una. «NOVADA» ¿es renovación? | Media |
| `ESTADO_CARTERA` (código y descripción) | 1 AL DIA · 15 MORA 90 AL DIA · 17 ESTA EN MORA 30 · 18 ESTA EN MORA 60 · 45 CART. CASTIGADA · 47 DUDOSO RECAUDO | Tabla completa de códigos, y si es el **peor estado entre todas las operaciones** o de un grupo. «MORA 90 AL DIA» ¿es «al día con vencidos de hasta 90 días»? | Alta |
| `indicador_impacto_economico.indicador` | 1, 3, 6 | Qué significa cada valor, su escala completa y para qué sirve. | Media |
| `score_sobreendeudamiento.segmentacion` y `rango_score` | ALTO, MEDIO; «1.0 a 333.0», «334.0 a 447.0», «448.0 a 523.0», «524.0 a 581.0», «683.0 a 727.0» | Lista completa de segmentos y sus rangos. ¿Qué es BAJO? (no apareció). | Media |
| `personas_inhabilitadas.accion` | CANCELAR CUENTAS, CANCELACIÓN BANCARIA | Lista completa. | Media |
| `personas_inhabilitadas.motivo` | I1 «Personas que pese a haber cumplido el tiempo de sanción por cierre…», I3 «…multas por cheques protestados…» | Los códigos I1 a In completos y su gravedad. ¿Puede haber varios a la vez? | Media |
| `informacion_sri.clase_contribuyente` | OTROS, RIMPE | Lista completa (RISE, régimen general, etc.). | Media |
| `informacion_sri.estado_contribuyente` | ACTIVO, SUSPENDIDO | Lista completa (cese temporal, cancelado, etc.) y qué fecha acompaña a cada uno. | Media |
| `informacion_sri.obligado` | S, N | ¿Obligado a qué? ¿Llevar contabilidad? | Baja |
| `detalle_tarjetas.emisor` | DINERS, VISA, AMERICAN EXPRESS, MASTERCARD, DISCOVER, ALIA, UNION PAY | Lista completa. | Baja |
| `ResultadoSegmentacion.DecisionFinal` | ANALISTA, APROBAR A, APROBAR AA, RECHAZAR | Lista completa y qué decide cada una. | Media |
| `ResultadoSegmentacion.SegmentacionTitular` y `ResultadoPoliticas.Resultado` | ANALISTA, A, AA, AAA, RECHAZAR | Orden y significado de A, AA, AAA. | Media |
| `ResultadoSegmentacion.ModeloUtilizado` | BANCARIZADO DIRTY, BANCARIZADO CLEAN | Cuándo se elige cada modelo; qué hace «sucio» a un perfil. | Media |
| `ResultadoSegmentacion.ResultadoEvaluacion` | 1, 2, 3 | Significado. | Baja |

## 3. Por lista: lo que entendemos y lo que necesitamos

### 3.1 Deuda actual por operación

`detalle_deuda_actual_sb`, `_seps` y `_sicom` (bancos, cooperativas y sector
comercial). Tabla nuestra: `equifax_operaciones`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| `fecha_corte` | Fecha del reporte de esa operación (`dd/mm/aaaa`). En bancos es una sola; en el comercial hay hasta tres distintas. | Qué representa y por qué varía entre operaciones del comercial (G3). | Cuáles son rezagos. | Alta |
| `cupo_monto_original` | Monto original del crédito, o el cupo en tarjetas. En la historia cambia de un mes a otro en operaciones que parecen la misma. | Qué es en cada tipo de crédito y por qué cambia. | Seguir una operación (G6). | Media |
| `fecha_apertura`, `fecha_vencimiento` | Apertura y vencimiento contractual. `fecha_vencimiento` viene vacía en 3 filas del comercial. | Qué significa un vencimiento vacío. En tarjetas, ¿qué es el vencimiento? | Plazo. | Baja |
| `total_vencer` | Saldo por vencer. | Confirmar. | Deuda sana. | Media |
| `ndi` | Saldo que no devenga intereses. | Confirmar y diferenciarlo de «vencido». | Mora. | Alta |
| `total_vencido` | Saldo vencido. | Confirmar. | Mora. | Alta |
| `dem_jud`, `cart_cast` | Saldos en demanda judicial y en cartera castigada. | Confirmar y diferenciarlos de «vencido». | Mora. | Alta |
| `saldo_deuda` | Debería ser la suma de los cinco anteriores. Cuadra en 458 de 476 filas. | ¿Cuál es la regla? ¿Por qué no cuadra en las otras 18? | Calidad. | Media |
| `total_vencer` y `saldo_deuda` **en el sector comercial** (`_sicom`) | No significan lo mismo que en bancos y cooperativas. Medido el 2026-10-31 sobre las 2.197 consultas guardadas, sumando todos los roles de cada persona: la suma de `saldo_deuda` es el `por_vencer` del resumen (`valor_deuda_3_sistemas`) en las 2.197, y `saldo_deuda` + `total_vencido` + `ndi` es su `total` en las 2.197; leyendo `saldo_deuda` como el total sólo cuadra en 1.922. En 460 de las 517 operaciones con vencido, `total_vencer` trae el total (por vencer + vencido); en las otras 57 trae sólo el vencido. En las de demanda judicial o cartera castigada trae ese monto y `saldo_deuda` es 0. En bancos y cooperativas, `total_vencer` es lo por vencer y `saldo_deuda` es el total. | ¿Es intencional que en el comercial `saldo_deuda` sea lo por vencer? ¿Qué es `total_vencer` en cada caso (el total, el vencido o el castigado), y por qué cambia de una fila a otra? Hoy leemos el comercial como «por vencer = `saldo_deuda`, total = `saldo_deuda` + vencido + `ndi`» y no usamos `total_vencer`. | Que el saldo y lo por vencer del comercial cuadren con su resumen. | Alta |
| `cuota_mensual` | Cuota del mes. Es cero en 9 de las 136 tarjetas. | Cómo se calcula en tarjetas y en crédito rotativo. | Capacidad de pago. | Media |
| `dias_morosidad` | Días de atraso de la operación. Va de 0 a 1.554. | Desde cuándo se cuentan; qué pasa con un día de mora sin monto vencido (G7). | Mora. | Alta |

### 3.2 Historia mensual por operación

`detalle_deuda_historica_sb`, `_seps` y `_sicom`. Siempre 24 meses por persona.
Tabla nuestra: `equifax_historia_mensual`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| `total_vencer` y `saldo_deuda` en el comercial | En la historia mensual del comercial **no** vimos el cambio de la deuda actual: `saldo_deuda` es el total (por vencer + vencido + `ndi`) en la mayoría de los meses, como en bancos. Pero en cerca de una cuarta parte de los meses con vencido o `ndi`, la suma del detalle no coincide con la `deuda_historica` del comercial por ninguna de las dos lecturas, y en unos 280 coincide con la suma de `total_vencer`. Por eso no tocamos la historia. | ¿La historia del comercial usa el mismo significado que la deuda actual del comercial o el de bancos? ¿Por qué hay meses que no cuadran con `deuda_historica`? | Conducta de pago. | Media |
| (todos) | Es la misma forma que la deuda actual, sin `cuota_mensual`. Su último mes coincide con la deuda actual en 20 de 22 en bancos. | ¿Por qué en 2 de 22 no coincide? ¿La historia es de 24 meses siempre? ¿Corta en el mismo mes que la deuda actual? | Conducta de pago. | Media |
| `tipo_credito` | Distinto de la deuda actual (ver sección 2). | Equivalencias. | Agrupar. | Media |

### 3.3 Totales por sistema, deuda histórica y evolución

`valor_deuda_3_sistemas`, `deuda_historica`, `evolucion_deuda_sb_seps_sicom`.
Tabla nuestra: `equifax_deuda_por_sistema_y_mes`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| `valor_deuda_3_sistemas.*` | El resumen de hoy por sistema; incluye todos los roles (G4). | Cómo se construye, de qué corte, y por qué el comercial no coincide con su detalle (G3). | Es el total de referencia contra el que conciliamos. | Alta |
| `deuda_historica.vencido_0_a_1` … `vencido_12_a_24` | Tramos del vencido por meses. | Cómo se asigna una operación a un tramo (¿por días de mora?). Nosotros usamos 30, 60, 90, 180, 270, 360 y 720 días y reproducimos los tramos de Equifax en 20 de 22 en bancos. | Mora por tramos del titular. | Alta |
| `deuda_historica.vencido_24` y `vencido_36` | «De 24 a 36 meses» y «más de 36 meses». Siempre cero el primero. | Confirmar. | Idem. | Media |
| `evolucion_deuda_sb_seps_sicom.total` y `vencidos` | Total y vencidos por mes y sistema (24 meses). | Por qué en el comercial el último mes no coincide con el resumen (4 de 22). | Evolución. | Media |
| `evolucion_deuda_sb_seps_sicom.fecha_corte` | Trae siempre los 24 meses del reporte, contiguos, también cuando la persona ya no tiene deuda (con `total` 0 al final); su último mes es el corte del reporte (en 2.108 de 2.130 consultas, el mes anterior al de la consulta; en las otras 22, dos meses antes). Falta en las personas sin historial. El detalle histórico, en cambio, sólo trae los meses con operaciones. Con eso fijamos la ventana de 24 meses de la conducta de pago; la lista no se suma a la deuda. | Confirmar que el último mes de esta lista es el corte del reporte y que es contiguo siempre. Qué pasa cuando no viene (¿no hay historial o no se calculó?). ¿Por qué hay consultas con un corte dos meses atrás? | Hasta dónde llega el reporte. | Alta |

### 3.4 Vencimientos

`estructura_vencimiento`, `detalle_estructura_vencimiento`, `saldos_por_vencer`.
Tabla nuestra: `equifax_vencimientos`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| `estructura_vencimiento.*` | Por institución y sistema. La suma del vencido coincide con el resumen en 22/22 en los tres sistemas; la del saldo, no siempre. | Qué corte usa y por qué el saldo no siempre cuadra. | Conciliación. | Media |
| `detalle_estructura_vencimiento.*` | Una fila por mes (22) con los tramos del vencido, sin institución ni sistema. El último mes cuadra con el resumen en 15 de 22. | De qué sistemas y roles es; por qué la suma de sus tramos no es el vencido en 4 de 22. | Serie de mora. | Media |
| `saldos_por_vencer.por_vencer_*` | Tramos de lo por vencer (0 a 1, 1 a 3, 3 a 6, 6 a 12, más de 12 meses). | Confirmar los límites de cada tramo. | Perfil de amortización. | Baja |

### 3.5 Scores

`score`, `score_inclusion`, `score_sobreendeudamiento`, `historico_score`.
Tabla nuestra: `equifax_scores`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| `score.score` | El score de Equifax (V4). Va de 45 a 976 en las 22 personas. Es igual a `ScoreV4` de `interconnectResponse` (22/22). | Rango posible, qué predice (¿incumplimiento a cuántos meses?), versión del modelo y cuándo cambia. | Es la variable más importante de la fuente. | Alta |
| `score_min`, `score_max` | Los límites de la **banda** en la que cae la persona (varían: de 1 a 973 y de 414 a 999), no el rango posible. | Confirmar y dar las bandas completas. | Interpretar el score. | Alta |
| `tasa_de_malos_acum`, `total_acum` | Porcentaje de malos acumulado en esa banda, y porcentaje de la población acumulado. | Qué población, qué definición de «malo» y qué horizonte. | Convertir el score en probabilidad. | Alta |
| `fecha_inicial`, `fecha_final` | 2023-09-30 a 2026-08-31 en todas. | ¿Ventana de observación del modelo? | Vigencia. | Media |
| `score_inclusion.score` | Score para personas con poca historia. Va de 691 a 892. | Rango posible y a quién aplica. | Poca historia. | Media |
| `score_sobreendeudamiento.score`, `porcentaje`, `probabilidad_sobre_endeudamiento` | Score de 16 a 720; `porcentaje` de 10 a 60; probabilidad de 3,5 a 17,9. | Qué es cada uno, su escala, y si la probabilidad es un porcentaje (suponemos que sí). | Riesgo de sobreendeudamiento. | Alta |
| `historico_score` (Actual, −6 y −12 meses) | El score en esas fechas; igual al vigente en «Actual» (22/22). | Si los de −6 y −12 meses se recalculan con el modelo de hoy o son los que se publicaron entonces. Las columnas `g_min`, `g_max`, `y_min`, `y_max`, `r_min`, `r_max` ¿son las bandas verde, amarilla y roja? | Tendencia del score. | Media |

### 3.6 Tarjetas

`detalle_tarjetas`, `tarjetas_canceladas`, `mensaje_califica_detalle_tarjetas`.
Tabla nuestra: `equifax_tarjetas`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| `antiguedad` | Meses desde la apertura (va de 2 a 388; la mayor nunca pasó los meses desde el primer crédito). | Confirmar la unidad. | Antigüedad de la tarjeta. | Media |
| `cupo`, `saldo_actual` | Cupo y saldo de hoy. 19 de 136 tarjetas deben más que su cupo. | Confirmar; ¿el saldo incluye intereses y cargos? | Uso del cupo. | Media |
| `saldo_promedio_ultimos_6_meses` | Promedio de los últimos 6 meses. | Confirmar. | Uso promedio. | Media |
| `porcentaje_uso_tarjeta` | Es **saldo promedio de 6 meses sobre el cupo × 100** (136/136), no el saldo de hoy; pasa de 100 con cupos chicos (llega a 7.192). | Confirmar la fórmula y por qué se llama «uso» y no «uso promedio». | Uso del cupo. | Alta |
| Política `PORCENTAJE USO CUPO TARJETA DE CRÉDITO` | Saldo actual total sobre cupo total × 100 (13/13). | Confirmar. | Idem. | Media |
| `tarjetas_canceladas.*` | Tarjeta cancelada, con fecha de cierre. | Ventana de cuánto tiempo atrás las lista. | Antigüedad de relación. | Baja |

### 3.7 Créditos otorgados y cancelados

`creditos_otorgados`, `operaciones_canceladas`. Tabla nuestra: `equifax_creditos`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| `creditos_otorgados` (la lista) | Créditos concedidos a la persona. Entre 2 y 30 por persona. | ¿Qué ventana de años cubre? ¿Incluye operaciones donde es codeudora o garante? ¿Incluye tarjetas? | Cuántos créditos tuvo. | Alta |
| `valor_operacion` | Monto de la operación. | Confirmar. | Monto histórico. | Media |
| `titular`, `codeudor`, `garante` | Tres montos por fila. En 161 de 253 créditos vienen titular y codeudor a la vez con valor, y no suman el valor de la operación. `garante` es cero en 250 de 253. | ¿Qué son? | Distinguir lo propio de lo que respalda. | Alta |
| `operaciones_canceladas.*` | Operaciones ya canceladas, con fecha. | Ventana, y diferencia entre `fecha_corte` y `fecha_cancelacion`. | Historial. | Baja |

### 3.8 Codeudor y garante

`garantias_personales_codeudores_operaciones_vigentes` y `…_no_vigentes`. Tabla
nuestra: `equifax_codeudor_garante`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| (la lista) | Operaciones de **otras personas** de las que ésta es codeudora o garante. Las de tipo `CODEUDOR` coinciden con las operaciones de rol `CODEUDOR` del detalle actual en 62 de 62 (cantidad y monto; 2026-10-17). | ¿Es siempre la misma deuda? ¿Cuándo difieren? | Nunca se suma la deuda dos veces. | Alta |
| `…_no_vigentes` | Vacía en las 22 personas. | Qué debería traer. | Historial como codeudor. | Baja |
| `tipo_deudor` | `CODEUDOR` en 34 de 62 personas y `GARANTE` en 2 (2026-10-17). **Los garantes de la lista y las operaciones de rol `GARANTE` del detalle no coinciden**: de las 6 personas que tienen alguno en un lado o en el otro, en ninguna son iguales la cantidad y el monto. En una, la lista trae 3 garantes y el detalle ninguno (las tres instituciones figuran en el detalle con otro rol); en cuatro, el detalle trae una operación de garante y la lista ninguna; en la otra, la lista trae 1 y el detalle 2 (una coincide en institución y monto). | ¿Por qué un garante figura en una lista y no en la otra? ¿Cuál de las dos dice lo que la persona respalda como garante? | La «Deuda como codeudor o garante» sale del detalle: un garante que sólo está en la lista no se cuenta. | Alta |

### 3.9 Consultas recibidas

`entidades_consultados`. Tabla nuestra: `equifax_consultas_recibidas`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| La lista | Primera fila = encabezado con los 12 meses (`mes1` es el actual). Las demás, una por entidad, con «X» en los meses en que consultó. | ¿Cuenta toda consulta o sólo las que el sistema registra? ¿El mes actual es parcial? ¿Por qué la ventana es de 12 meses? | Cuántos buscan crédito (señal de necesidad). | Alta |
| `nombre_cliente` | Nombre de la entidad, escrito de varias maneras («BANCO DE GUAYAQUIL S.A.», «BANCO GUAYAQUIL S.A.», «BANCO GUAYAQUIL PROACTIVO»); 73 nombres distintos en 22 personas. | ¿Hay un código o RUC estable de la entidad? | Contar entidades distintas. | Media |
| `NOVACREDIT S. A.` y `NOVACREDIT S.A.` | Parecen ser las consultas que hicimos nosotros. | Confirmar que NovaCredit es la consultora que nos intermedia (y por tanto no es una entidad que evalúa a la persona). | No contarlas como señal. | Alta |

### 3.10 Indicadores, perfil de riesgo y factores del score

`historico_acreedores`, `historico_cuota_estimada`, `historico_endeudamiento_*`,
`historico_vencidos_*`, `identificador_perfil_riesgo_directo` (y `_6_meses`),
`factores_influyen_score`, `cuota_estimada_mensual`, `resumen_informe`,
`protestos_morosidades`. Tablas nuestras: `equifax_indicadores_por_periodo` y
`equifax_resumen`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| `historico_endeudamiento_financiero` / `_comercial`, «Actual» | Igual al resumen de bancos más cooperativas, y al del comercial (22/22 los dos). Hace 6 y 12 meses, ¿también con todos los roles? | Confirmar; si son los saldos de entonces o se recalculan. | Variación de la deuda en 12 meses. | Alta |
| `historico_vencidos_financiero` «Actual» | Igual al vencido de bancos más cooperativas en 17 de 22. | ¿Por qué 5 no coinciden? | Evolución de la mora. | Media |
| `historico_acreedores.acreedores` | Número de acreedores. No coincide con las instituciones distintas de la deuda actual (2/22). | Cómo se cuenta un acreedor (¿incluye cerradas, tarjetas, el comercial?). | Número de acreedores (una política de Equifax usa este valor). | Alta |
| `historico_cuota_estimada` | Cuota estimada mensual; trae «Actual», −6, −12, **+6 y +12 meses**. «Actual» = `cuota_estimada_mensual.pago` (22/22), que a su vez es la suma de las cuotas de todas las operaciones (20/22). | ¿Los +6 y +12 son una proyección? ¿Con qué método? | Capacidad de pago futura. | Media |
| `cuota_estimada_mensual` | `numero_creditos_comercial`, `total_vencido`, `total_demanda`, `total_cartera`, `numero_creditos_iece`, `numero_operaciones_excluidas`. | Qué es cada uno; qué es IECE y por qué se excluyen operaciones. | Entender la cuota. | Media |
| `identificador_perfil_riesgo_directo` | Tres indicadores: «Mayor plazo vencido» (texto como «De 1 a 2 meses», «Demanda Judicial», «Cartera Castigada»), «Mayor valor vencido» y «Endeudamiento promedio» (importes), cada uno con su fecha; y una versión de 6 meses. | Definición de cada uno, ventana y qué fecha acompaña. | Perfil de riesgo. | Media |
| `factores_influyen_score` | `numero_operaciones_historicas`, `_vigentes`, `_vencidas`, `saldo_por_vencer`, `saldo_vencido`, `maximo_saldos_vencidos`, `tiempo_trancurrido_primer_credito` («172 meses»), `vencidos_actuales`, `maximo_dias_vencido`, `saldo_deuda_nuevos_creditos`. | Definición de cada uno. **No coinciden con nuestras cuentas** (operaciones vigentes = las del detalle actual en 2/22; máximo de días de mora en 5/22; tiempo desde el primer crédito, ±1 mes, en 7/22). ¿Qué se está contando? | Qué le pesa al score. | Media |
| `resumen_informe` | Tres filas: `OpeImpagos`, `DemandaJudicial`, `CarteraCastigada`, con número y monto. Cuadra con las operaciones con vencido (22/22) **de todos los roles**. | Definición de cada tipo y por qué cuenta codeudor y garante. | Impagos de la persona. | Alta |
| `protestos_morosidades` | `morosidades` coincide con las operaciones con vencido en 16 de 22; `total_numero_operaciones` no es el número de operaciones (0/22). **`protestos` viene siempre vacío.** | Qué cuenta cada campo; si `protestos` está vacío porque no hay o porque no se mide. | No confundir «ninguno» con «no medido». | Alta |
| `mantiene_historial_crediticio.primera_fecha` | Fecha del primer crédito. | ¿Desde cuándo y de qué fuentes? | Antigüedad crediticia. | Media |
| `sujeto_al_dia` | Entidades con las que la persona está al día (aparecen empresas de telefonía, con el teléfono dentro del nombre). | Qué es «sujeto al día» y por qué la institución trae un teléfono. | Sólo lo contamos. | Baja |
| `vinculaciones_instituciones_financieras` | Vacía en las 22. | Qué debería traer. | Cobertura. | Baja |

### 3.11 Información del SRI y estimaciones

`informacion_sri`, `indicador_impacto_economico` y, de `interconnectResponse`,
`ResultadoSegmentacion.IncomePredictor`. Tabla nuestra: `equifax_resumen`.

| Campo | Lo que entendemos hoy | Necesitamos | Para qué | Prior. |
|---|---|---|---|---|
| `informacion_sri.*` | RUC de la persona (todas lo tienen) con estado y clase. 4 de 22 suspendidos, con fecha de suspensión definitiva. | Fuente y fecha de actualización; qué trae para quien no tiene RUC. | Actividad económica. | Media |
| `indicador_impacto_economico.ingreso` y `.cuota_financiera` | Estimaciones de ingreso y de cuota. | Cómo se calculan, con qué datos y qué error esperar. | **No se especula sobre el ingreso**: se guarda y se rotula «estimación de Equifax». | Alta |
| `IncomePredictor` | Estimación de ingreso del motor de decisión. | Lo mismo; ¿es mensual? ¿Es el mismo número que el de arriba? | Idem. | Alta |

## 4. Lo de `interconnectResponse` que hoy NO usamos

Se guarda en el crudo y no pasa a las tablas, salvo el estado de cartera y el
ingreso estimado. Sólo hay que preguntarlo si el negocio decide usarlo:

- `Operaciones_Vigentes_SCE`, `HabitoPago`: conteos de operaciones y de
  entidades por tipo de cuenta (al día, vencidas, castigadas, cerradas).
  ¿Qué es SCE?
- `AnalisisCreditoSectorFinanciero` y `AnalisisMontosSectorComercial`: 37 y 29
  campos con siglas (`MCA`, `CMR`, `CMA`, `MMR`, `MMA`, `MMV`, `PC`, `RECA`, `T`):
  mayor y menor crédito, mayor mora, porcentaje de la deuda, créditos aprobados
  y cancelados, variación de la deuda en 3 meses. **Si se usan, necesitamos el
  significado de cada sigla.**
- `PorcentajeCreditoPorAcreedorSFR`, `…SICOM`, `…MIES`: porcentaje de la deuda
  por acreedor.
- `ResultadoPoliticas`: las cinco políticas (score y sobreendeudamiento, número
  de acreedores, deuda directa, uso del cupo de tarjetas, cartera castigada y
  demanda judicial) con su valor y su resultado. Los umbrales de cada una.
- `ResultadoSegmentacion`: `GastoHogar`, `CapacidadPago`, `Tasa`,
  `SeguroDesgravament`, `MensajeSugerencia` (con nuestros parámetros de relleno
  salen en cero o genéricos).
- `OfertaSugerida`, `ResultadoSegmentacionConyuge`,
  `IdentificacionConsultadaConyuge`, `AnálisisCréditosAprobadosReguladoMIES`:
  vacíos (no mandamos datos del cónyuge). ¿MIES es el Ministerio de Inclusión
  Económica y Social?

## 5. Cómo nos conviene la respuesta

- Un documento (PDF, Excel o página) con **cada campo de las dos secciones
  grandes**, su tipo, su unidad y su definición. Si viene en Excel, mejor: lo
  cargamos al repositorio sin transcribirlo.
- Las **listas cerradas** de la sección 2, completas.
- Para los campos de las secciones 3.1, 3.5 y 3.10 marcados «Alta», una
  respuesta explícita («sí, incluye codeudor»), no sólo la definición general.
- Una fecha y un contacto para las dudas que surjan al usarlo.

## 6. Qué haremos con la respuesta

- Donde Equifax confirme lo que entendemos, se quita la salvedad del comentario
  de la columna (`antiguedad_meses`, `vencido_24_a_36_meses_usd`, `valor_operacion`)
  y de este documento.
- Donde lo contradiga, se sube la versión de las tablas
  (`equifax-tablas-vN`) y de la estructura (`equifax-estructura-vN`) y se
  **rehacen las consultas ya guardadas desde su crudo, sin volver a pagar**
  (`node scripts/cargar-tablas-equifax.mjs`).
- Los nombres de los campos de la estructura que dependan de una definición
  (por ejemplo `usoPromedioPorcentaje`, `bandaDelScoreEquifaxDesde`) se
  revisan con el negocio antes de cambiarlos.
- Se quita de `docs/pendientes.md` el punto del diccionario.
