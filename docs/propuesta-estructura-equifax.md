# Propuesta: estructura estandarizada de Equifax

Borrador del 2026-10-12, hecho sobre las **22 respuestas reales** (2 de
prueba y 20 de un lote autorizado) guardadas en `consultas_equifax`. Nada de
lo que sigue a la tabla `consultas_equifax` (122) está construido: es para
decidir. No lleva valores ni personas, sólo nombres de campos y conteos.

**Decisiones del negocio del 2026-10-12:**

1. El camino es **JSON → tablas → estructura estandarizada**: el crudo se
   descompone en tablas y la estructura (contadores, sumas, booleanos, listas)
   se calcula **desde las tablas**, no desde el JSON. (Sección 1.)
2. La fuente de la deuda es `reporteCrediticio`. (Sección 3.)
3. Qué parámetros de la decisión mueven `interconnectResponse` **no es
   importante por ahora**: no se gasta una consulta en averiguarlo. (Sección 6.)

Lo que se midió se repite con `node scripts/inventariar-equifax.mjs` (inventario
de campos, listas y datos personales) y con `node scripts/conciliar-equifax.mjs`
(las conciliaciones de la sección 3). Los dos sólo leen archivos de
`research/equifax/crudo/` y no vuelven a consultar a Equifax.

## 1. Del JSON a la estructura: cuatro pasos

```text
 Equifax ──▶ 1. CRUDO ──▶ 2. TABLAS ──▶ 3. ESTRUCTURA ──▶ 4. PERFIL DEL MODELO
            (jsonb,        (una fila por   (contadores, sumas,   (sin datos
             inmutable)     operación,      booleanos, listas:    personales)
                            mes, tarjeta…)  se calculan DESDE
                                            las tablas)
```

| Paso | Qué es | Para qué sirve | Dónde vive |
|---|---|---|---|
| **1. Crudo** | La respuesta de Equifax, sin tocar | Evidencia de lo que se pagó y de lo que Equifax dijo un día concreto. La única fuente de verdad. | `consultas_equifax.respuesta_cruda` (122, hecha, inmutable) |
| **2. Tablas** | El JSON descompuesto: una fila por operación, por mes, por tarjeta, por entidad que consultó… con tipos reales, fechas ISO y el rol (titular, codeudor, garante) ya normalizado | Poder preguntar en SQL, sumar sin abrir un JSON, y que cada número tenga filas detrás | Tablas `equifax_*` (a construir) |
| **3. Estructura estandarizada** | Los campos de la sección 5, **calculados con las filas de las tablas** | Leer, calificar, comparar fuentes, el Laboratorio | `consultas_equifax.estructura` (jsonb, versionada) |
| **4. Perfil del modelo** | El subconjunto de la estructura que lee el modelo | Lo único que ve el modelo (`perfil-del-modelo.ts`) | Se arma al vuelo, nunca se guarda aparte |

**Por qué la estructura sale de las tablas y no del JSON.**

- **Trazabilidad.** «`saldoVencidoBancosTitularUsd` = 1.234» se verifica con una
  suma sobre filas que se pueden mirar. Si sale del JSON, sólo se puede confiar.
- **Una sola descomposición.** El paso 2 es donde se resuelve lo difícil (roles
  en mayúsculas y minúsculas, cuatro formatos de fecha, filas duplicadas entre
  bloques). El paso 3 queda como contar y sumar.
- **La conciliación se hace en las tablas** (sección 3): se puede comparar la
  suma de las operaciones con el resumen de Equifax antes de calcular nada.

**Por qué se conserva el crudo.** (a) Equifax puede cambiar la forma sin avisar
(Novadata lo hizo, estructura-v13); (b) un error nuestro al descomponer se
arregla **rehaciendo las tablas desde el crudo, sin volver a pagar** (la
lección de `recalcular-fuentes-ingreso.mjs`); (c) el crudo es lo que se muestra
ante un reclamo.

**Reglas que lo hacen seguro.**

- Las tablas y la estructura se derivan por funciones deterministas y
  versionadas (`equifax-tablas-vN`, `equifax-estructura-vN`), con pruebas contra
  las 22 respuestas reales (sin volver a consultar). Se pueden borrar y rehacer.
- Cada tabla lleva `consulta_equifax_id` con `on delete cascade`: **borrar una
  consulta (la supresión del titular) borra sus filas**, sin tocar
  `suprimir_titular()` tabla por tabla.
- Los datos personales **no se descomponen en tablas**: nombre, documento,
  direcciones, coordenadas, teléfonos y los nombres e identificaciones de
  terceros se quedan sólo en el crudo (sección 6). Cuantos menos lugares, menos
  que suprimir.
- Cada tabla nueva: RLS con lectura sólo de analista y admin, sin permisos para
  el rol anónimo, y sumada a `auditar-seguridad.mjs`.

### 1.1 Las tablas propuestas

Se agrupan las 58 listas en pocas tablas con una columna que dice de cuál
vienen, en vez de una tabla por lista.

| Tabla | De qué listas de Equifax | Filas por consulta (medido) |
|---|---|---|
| `equifax_operaciones` | `detalle_deuda_actual_sb`, `_seps`, `_sicom` | ~22 en promedio |
| `equifax_historia_mensual` | `detalle_deuda_historica_sb`, `_seps`, `_sicom` | 183 a 963 (promedio 512) |
| `equifax_deuda_por_sistema_y_mes` | `deuda_historica`, `evolucion_deuda_sb_seps_sicom`, `valor_deuda_3_sistemas` | ~140 |
| `equifax_vencimientos` | `estructura_vencimiento`, `detalle_estructura_vencimiento`, `saldos_por_vencer` | ~40 |
| `equifax_tarjetas` | `detalle_tarjetas`, `tarjetas_canceladas` | ~6 |
| `equifax_creditos` | `creditos_otorgados`, `operaciones_canceladas` | ~19 |
| `equifax_consultas_recibidas` | `entidades_consultados` (una fila por entidad y mes) | ~10 entidades × 12 meses |
| `equifax_scores` | `score`, `score_inclusion`, `score_sobreendeudamiento`, `historico_score`, `factores_influyen_score` | ~10 |
| `equifax_indicadores_por_periodo` | los `historico_*` (acreedores, cuota, endeudamiento, vencidos) y `identificador_perfil_riesgo_directo*` | ~35 |
| `equifax_garantias_dadas` | `garantias_personales_codeudores_*`, **sin nombre ni identificación del titular** | ~4 |

Con unas 2.600 personas una pasada completa son del orden de 1,8 millones de
filas, de ellas ~1,3 millones de historia mensual: cabe en la base. Las tablas
se construyen **después de aprobar los nombres** de la sección 4 y 5, y las
primeras 22 consultas se cargan desde el crudo, sin costo.

## 2. Qué trae la respuesta

Dos bloques grandes, de naturaleza distinta:

- **`reporteCrediticio`** (46 listas): el reporte del buró. Es lo que importa.
- **`interconnectResponse`** (22 nodos): lo que calculó el **motor de decisión**
  de Equifax con los parámetros que mandamos.

Datos medidos con las 22 respuestas: 609 campos y 58 listas; 496 campos están
siempre y 113 a veces; 17 listas vienen vacías en alguna persona. Pesa de 120 a
463 KB (promedio 275). Tarda de 5 a 17 s.

### 2.1 Sistemas de reporte

Equifax separa el reporte en tres sistemas, que acá se nombran como el negocio
(no con las siglas):

| En Equifax | En la estructura | Qué es |
|---|---|---|
| SB | `bancos` | Bancos y financieras (Superintendencia de Bancos) |
| SEPS | `cooperativas` | Cooperativas y mutualistas (Superintendencia de Economía Popular y Solidaria) |
| SICOM | `comercial` | Sector comercial (en las respuestas aparecen, por ejemplo, empresas de telefonía; el alcance exacto es una pregunta para Equifax) |

(Hay un cuarto, `SFNR`, que aparece en `DetalleDeudaActualReportadaRFRSBS` con
cooperativas dentro: ver preguntas a Equifax.)

## 3. Lo que no cuadra, y qué se hace

Equifax entrega la misma deuda más de una vez. Se comparó entre las 22 personas
cuántas veces coinciden (a un centavo):

| Comparación | Cuadran |
|---|---|
| Detalle de bancos = su resumen por sistema | **22 de 22** |
| Detalle de cooperativas = su resumen | 21 de 22 |
| Detalle comercial (`reporteCrediticio`) = su resumen | **16 de 22** |
| Detalle comercial (`interconnectResponse`) = ese mismo resumen | **20 de 22** |
| Deuda de bancos en `reporteCrediticio` = la de `interconnectResponse` | **9 de 22** |
| Deuda de cooperativas en `reporteCrediticio` = la de `interconnectResponse` | 9 de 22 |
| `Composicion_deuda_actual.RiesgoDirecto` = suma de lo que es titular | **0 de 22** |
| Score «actual» del histórico = score vigente | 22 de 22 |

**Lectura.**

1. En bancos, el detalle de `reporteCrediticio` es consistente con su propio
   resumen: **es la fuente de la deuda**. El bloque de `interconnectResponse`
   trae siempre igual o más filas (22 de 22), y qué más trae no está explicado.
2. En el sector comercial el resumen coincide más con `interconnectResponse`
   (20) que con el detalle (16): el detalle trae cortes de fechas distintas
   (agosto, septiembre y octubre) y el resumen no parece usarlos todos.
3. El «riesgo directo e indirecto» de Equifax es una cifra suya que no se pudo
   reproducir con ninguna suma. **No se usa como deuda.**
4. **Nunca se suman dos bloques.** Es el mismo error de la «fila fantasma» de
   Aval, que duplicaba montos en el 100% de los casos con datos.

**Decisión (aprobada el 2026-10-12):** la estructura toma las operaciones de
`reporteCrediticio`, usa `valor_deuda_3_sistemas` como el total de referencia y
guarda una **marca de conciliación** por sistema (`conciliaConElResumen`:
sí / no / sin resumen). Una persona que no concilia queda marcada, no corregida
a escondidas. `interconnectResponse` aporta sólo los cálculos de Equifax que se
elijan, rotulados como tales.

## 4. Nomenclatura

Reglas, para que un nombre no se pueda malinterpretar:

- **Español, sin siglas de Equifax.** Los sistemas se llaman `bancos`,
  `cooperativas` y `comercial`.
- **El rol va en el nombre.** `…Titular` es lo que la persona debe como titular;
  `…CodeudorGarante` es lo que podría tener que pagar por otro. Nunca se
  mezclan (15 de 22 personas tienen operaciones donde no son titulares, y en
  Aval esa mezcla inflaba la deuda). El rol se normaliza: Equifax manda
  `TITULAR` y `Titular`.
- **La unidad va en el nombre cuando no es obvia:** `…Usd`, `…Dias`, `…Meses`,
  `…Porcentaje` (0 a 100).
- **Fechas siempre ISO** (`AAAA-MM-DD`). Equifax manda cuatro formas:
  `31/08/2026`, `2026 Ago`, `2026-08-31 00:00:00.000` y `Oct 2026`.
- **«Vencido», «no devenga intereses», «demanda judicial» y «cartera
  castigada» son cuatro cosas distintas** y tienen cuatro campos. Es el mismo
  criterio que Novadata (el atraso puede estar en `noDevengaInteres`).
- **«Score» a secas es el de CrediScope.** Los de Equifax son `scoreEquifax`,
  `scoreInclusionEquifax` y `scoreSobreendeudamientoEquifax`; en pantalla,
  «Score de Equifax».
- **Un dato que no se midió no es cero.** `protestos` viene siempre vacío
  (0% con valor) y se guarda como no medido, no como «0 protestos».
- **Sin versión, código ni JSON en una tarjeta principal** (regla de la revisión
  de UX).

## 5. Grupos y campos propuestos (`equifax-estructura-v1`)

Cada campo se calcula **desde las tablas** de la sección 1.1; la columna «De
dónde sale» dice de qué lista de Equifax viene. La columna «Modelo» dice si el
campo va al perfil del modelo (sección 6).

| Grupo | Campos principales (nombre propuesto) | De dónde sale | Modelo |
|---|---|---|---|
| **Consulta** | `consultadoEl`, `ambiente`, `identidadVerificada`, `version` | tabla y auditoría | no |
| **Scores** | `scoreEquifax`, `scoreEquifaxMinimo`/`Maximo`, `tasaDeMalosAcumuladaPorcentaje`, `scoreEquifaxHace6Meses`, `scoreEquifaxHace12Meses`, `variacionDelScore12Meses`, `scoreInclusionEquifax`, `scoreSobreendeudamientoEquifax`, `probabilidadDeSobreendeudamientoPorcentaje`, `nivelDeSobreendeudamiento` | `score`, `score_inclusion`, `score_sobreendeudamiento`, `historico_score` | sí |
| **Estado general** | `estadoDeCartera` (al día, mora 30, mora 60, mora 90, dudoso recaudo, cartera castigada), `fechaDelPrimerCredito`, `antiguedadCrediticiaMeses`, `tieneInhabilitacionBancaria`, `numeroDeMorosidades` | `ESTADO_CARTERA`, `mantiene_historial_crediticio`, `personas_inhabilitadas`, `protestos_morosidades` | sí |
| **Deuda actual del titular** | por sistema y total: `numeroDeOperaciones`, `saldoDeudaUsd`, `saldoPorVencerUsd`, `saldoVencidoUsd`, `saldoNoDevengaInteresesUsd`, `saldoDemandaJudicialUsd`, `saldoCarteraCastigadaUsd`, `cuotaMensualUsd`, `maximoDiasDeMora`, `conciliaConElResumen` | `detalle_deuda_actual_*`, `valor_deuda_3_sistemas` | sí |
| **Deuda como codeudor o garante** | los mismos, separados | `detalle_deuda_actual_*` con rol no titular | sí |
| **Mora actual** | `vencidoDe0a1MesUsd` … `vencidoDeMasDe36MesesUsd`, `porcentajeDeLaDeudaVencida`, `numeroDeOperacionesVencidas` | `estructura_vencimiento`, `detalle_estructura_vencimiento` | sí |
| **Conducta de pago (24 meses)** | `mesesConMoraEnLosUltimos24`, `maximoDiasDeMoraEnLosUltimos24`, `fechaDeLaUltimaMora`, `mesesConDeudaVencida`, `numeroDeOperacionesQueTuvieronMoraDeMasDe90Dias` | `detalle_deuda_historica_*`, `evolucion_deuda_sb_seps_sicom` | sí |
| **Evolución** | `deudaHace6MesesUsd`, `deudaHace12MesesUsd`, `variacionDeLaDeuda12MesesPorcentaje`, `acreedoresActuales`, `acreedoresHace6Meses`, `acreedoresHace12Meses`, `cuotaEstimadaActualUsd`, `cuotaEstimadaHace12MesesUsd` | `historico_*`, `evolucion_*` | sí |
| **Tarjetas de crédito** | `numeroDeTarjetasVigentes`, `cupoTotalUsd`, `saldoTotalUsd`, `usoPromedioPorcentaje`, `usoMaximoPorcentaje`, `saldoPromedio6MesesUsd`, `antiguedadDeLaMasAntiguaMeses`, `numeroDeTarjetasCanceladas` | `detalle_tarjetas`, `tarjetas_canceladas` | sí |
| **Créditos otorgados** | `numeroDeCreditosOtorgados`, `numeroDeCreditosRefinanciados`, `numeroDeCreditosReestructurados`, `numeroDeCreditosNovados`, `numeroDeCreditosCancelados`, `montoOriginalTotalUsd` y por tipo (consumo, vivienda, microcrédito, comercial) | `creditos_otorgados`, `operaciones_canceladas` | sí |
| **Consultas recibidas** | `entidadesQueLaConsultaronEnLosUltimos12Meses`, `consultasPorMes` (12), `entidadesEnLosUltimos3Meses`, **sin contar a NovaCredit** | `entidades_consultados` | sí |
| **Garantías dadas** | `numeroDeOperacionesComoCodeudor`, `deudaTotalComoCodeudorUsd` | `garantias_personales_codeudores_*` | sí (sin nombres ni identificaciones de terceros) |
| **Actividad económica (SRI)** | `tieneRuc`, `estadoDelRuc`, `claseDeContribuyente`, `obligadoALlevarContabilidad` | `informacion_sri` | no (Novadata ya lo trae) |
| **Estimaciones de Equifax** | `ingresoEstimadoUsd`, `cuotaFinancieraEstimadaUsd`, `indicadorDeImpactoEconomico` | `indicador_impacto_economico`, `IncomePredictor` | **no** (ver 6) |

## 6. Qué no llega al modelo

**Datos personales** (el modelo no los necesita; E27): nombre y documento de la
persona y de terceros (`nombre_titular` e `identificacion_titular` de las
garantías son de **otra persona**); fecha de nacimiento, provincia, cantón,
direcciones, coordenadas y teléfonos de `informacion_demografica`; dirección,
nombre y nombre de fantasía del RUC; `numero_operacion` y `numero_tarjeta`;
los identificadores de transacción. Son **22 campos** (los detecta el inventario
por nombre y por contenido: un valor con 6 o más dígitos seguidos, como el
teléfono que viene dentro de `sujeto_al_dia.institucion`).

**Decisión de Equifax con nuestros parámetros de relleno** (monto, plazo y
producto no son una solicitud real): `ResultadoSegmentacion` (decisión final,
monto y cuota aprobados, tasa, seguro), `ResultadoPoliticas`, `OfertaSugerida`
y `ModeloUtilizado`. Se guardan en el crudo y **no** entran a la estructura del
modelo. La segmentación del titular (A, AA, analista, rechazar) y el modelo
«bancarizado limpio o sucio» podrían no depender de los parámetros; **no se
sabe**, y el negocio decidió (2026-10-12) que no es importante por ahora y que
no se gasta una consulta en averiguarlo. Queda como pregunta a Equifax.

**Ingreso estimado por Equifax:** `IncomePredictor` e `ingreso` del indicador de
impacto económico son una estimación de un tercero. La regla del negocio es que
**no se especula sobre el ingreso**; se guarda y se rotula «estimación de
Equifax», pero no entra al modelo hasta decidirlo.

## 7. Preguntas a Equifax (para pedir el diccionario de datos)

El diccionario de Aval mentía en dos campos y se supo con 240 respuestas;
mejor preguntar antes de construir sobre una suposición.

1. ¿Hay un diccionario de datos de `reporteCrediticio` e
   `interconnectResponse`?
2. ¿Qué es `SFNR` y por qué cooperativas aparecen en `…RFRSBS`?
3. ¿Qué filas trae de más `DetalleDeudaActualReportadaSBSSBS_Educativo` que
   `detalle_deuda_actual_sb`? (9 de 22 coinciden; en las otras trae más.)
4. ¿Cómo se calcula `Composicion_deuda_actual` (riesgo directo e indirecto)?
5. El detalle comercial trae cortes de agosto, septiembre y octubre:
   ¿cuál usa el resumen `valor_deuda_3_sistemas`?
6. ¿`tipo_riesgo` = `GARANTE` y `CODEUDOR` están bien separados de lo que
   aparece en `garantias_personales_codeudores_operaciones_vigentes`? ¿Son las
   mismas operaciones o las de otras personas?
7. ¿Qué significan los valores 1, 3 y 6 de `indicador_impacto_economico`?
8. ¿Qué resultados de `interconnectResponse` dependen de `monto`, `plazo` y
   `tipoProducto`, y cuáles sólo de la persona?
9. ¿Cada cuánto se actualiza el reporte y cuándo corta el mes? (Rige la
   vigencia «hasta el 17»: ¿coincide con el corte de Equifax?)

## 8. Lo que falta

**Decidido (2026-10-12):** el camino JSON → tablas → estructura (sección 1);
`reporteCrediticio` como fuente de la deuda (sección 3); no gastar consultas en
averiguar qué depende de los parámetros por ahora.

**Falta decidir:**

1. **Los nombres.** ¿Se aprueban los de la sección 5?, en particular
   `conciliaConElResumen` y el rótulo «Score de Equifax».
2. **Las tablas.** ¿Se aprueba la agrupación de la sección 1.1?

**Después, en este orden:**

1. Migración con las tablas, y las funciones `equifax-tablas` y
   `equifax-estructura` con pruebas contra las 22 respuestas reales.
2. Cargar las 22 consultas desde el crudo (sin costo) y comprobar con SQL que
   la estructura cuadra con el resumen de Equifax.
3. El ajuste al marco interpretativo: una sección nueva de comportamiento
   crediticio del sistema financiero ecuatoriano, con datos actuales e
   históricos. Se propone aparte, cuando la estructura esté lista, como pidió el
   negocio.
4. Preguntarle a Equifax lo de la sección 7 (el diccionario de datos).
