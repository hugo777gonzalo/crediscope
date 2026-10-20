# Propuesta: estructura estandarizada de Equifax

Propuesta del 2026-10-12, hecha sobre las **22 respuestas reales** (2 de
prueba y 20 de un lote autorizado) guardadas en `consultas_equifax`.
**El negocio la aprobó ese mismo día («ok») y se construyó el 2026-10-13**:
migración 126, `_shared/equifax-tablas.ts` y `_shared/equifax-estructura.ts`.
Donde lo construido se apartó de lo propuesto porque los datos lo pidieron, la
sección lo dice con **«Construido»**. No lleva valores ni personas, sólo
nombres de campos y conteos.

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
| **2. Tablas** | El JSON descompuesto: una fila por operación, por mes, por tarjeta, por entidad que consultó… con tipos reales, fechas ISO y el rol (titular, codeudor, garante) ya normalizado | Poder preguntar en SQL, sumar sin abrir un JSON, y que cada número tenga filas detrás | Tablas `equifax_*` (126) |
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

### 1.1 Las tablas

Se agrupan las 58 listas en pocas tablas con una columna que dice de cuál
vienen, en vez de una tabla por lista. **Construido:** son 11, las 10 aprobadas
más `equifax_resumen`, y una se renombró.

| Tabla | De qué listas de Equifax | Filas por consulta (medido en las 22) |
|---|---|---|
| `equifax_operaciones` | `detalle_deuda_actual_sb`, `_seps`, `_sicom` | 9 a 43 |
| `equifax_historia_mensual` | `detalle_deuda_historica_sb`, `_seps`, `_sicom` | 183 a 963 (promedio 512) |
| `equifax_deuda_por_sistema_y_mes` | `valor_deuda_3_sistemas` (el resumen de hoy), `deuda_historica`, `evolucion_deuda_sb_seps_sicom` | 95 a 171 |
| `equifax_vencimientos` | `estructura_vencimiento`, `detalle_estructura_vencimiento`, `saldos_por_vencer` | 33 a 51 |
| `equifax_tarjetas` | `detalle_tarjetas`, `tarjetas_canceladas` | 1 a 11 |
| `equifax_creditos` | `creditos_otorgados`, `operaciones_canceladas` | 3 a 67 |
| `equifax_consultas_recibidas` | `entidades_consultados` (una fila por entidad y mes, sin la fila de encabezado) | 2 a 32 |
| `equifax_scores` | `score`, `score_inclusion`, `score_sobreendeudamiento`, `historico_score` | 6 |
| `equifax_indicadores_por_periodo` | los `historico_*` (acreedores, cuota, endeudamiento, vencidos) y `identificador_perfil_riesgo_directo*`, en forma larga | 26 |
| `equifax_codeudor_garante` | `garantias_personales_codeudores_*`, **sin nombre ni identificación del titular** | 0 a 20 |
| `equifax_resumen` (**nueva**) | los datos de una sola fila: `resumen_informe`, `protestos_morosidades`, `cuota_estimada_mensual`, `personas_inhabilitadas`, `mantiene_historial_crediticio`, `factores_influyen_score`, `informacion_sri` (sin nombre, RUC ni dirección), `indicador_impacto_economico`, `sujeto_al_dia` (sólo cuántos), los doce meses del encabezado de las consultas recibidas y, de `interconnectResponse`, el estado de cartera y el ingreso estimado | 1 |

**Construido, y por qué:**

- **`equifax_resumen` no estaba en la propuesta.** Nueve listas de una sola fila
  no tenían dónde ir y la regla es que la estructura sale de las tablas.
- **`equifax_garantias_dadas` pasó a `equifax_codeudor_garante`** (pedido del
  negocio, 2026-10-13): en Ecuador una garantía es el colateral (un auto, una
  casa, un pagaré). Lo que Equifax llama «garantías personales» es una persona
  respondiendo por la deuda de otra.
- **`factores_influyen_score` se fue a `equifax_resumen`**, no a `equifax_scores`:
  son doce cifras sueltas, no un score.
- **La historia no lleva «huella» de la operación.** Se pensó para contar
  «operaciones que tuvieron mora»: las listas no traen el número de operación y
  ninguna combinación de campos la identifica de un mes al siguiente (788 pares
  de filas de un mismo mes comparten institución y apertura; el cupo cambia
  entre meses en 191 grupos). La estructura cuenta **por mes**, no por operación.
- **Las 22 primeras consultas** se cargaron desde el crudo, sin costo
  (`scripts/cargar-tablas-equifax.mjs`, el 2026-10-13: 17.293 filas en 11 tablas,
  0 errores). **Verificado en SQL contra el crudo:** las 11 tablas tienen las filas de
  las listas de Equifax en las 22 consultas; el detalle de todos los roles concilia
  con el resumen en bancos 22 de 22, cooperativas 21 de 22 y comercial 16 de 22
  (igual que sobre el JSON y que `conciliaConElResumen`); y el saldo del titular de las
  tablas es el de la estructura en las 22.

Con unas 2.600 personas una pasada completa son del orden de 1,8 millones de
filas, de ellas ~1,3 millones de historia mensual: cabe en la base. Cada
consulta viaja a la base en una sola llamada de 190 a 550 KB
(`equifax_reemplazar_tablas`, atómica: o queda todo lo nuevo o todo lo anterior).

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

### 3.1 Lo que se midió al construir (2026-10-13)

Para escribir cada cálculo se midió antes cómo se relacionan las listas entre
sí en las 22 respuestas (`scripts/probar-equifax-tablas.mjs` repite lo esencial).
Lo que cambió respecto de lo propuesto:

| Hallazgo | Medido | Qué se hizo |
|---|---|---|
| El resumen por sistema cuenta **todos los roles**: la suma del detalle de todos los roles lo reproduce, la del titular solo no | bancos 22/22 | `conciliaConElResumen` compara contra el saldo de todos los roles; el titular va aparte |
| Los impagos, las morosidades y la cuota estimada de Equifax también incluyen codeudor y garante | impagos 22/22; cuota 20/22 | se guardan rotulados «todos los roles»; lo del titular sale de las operaciones |
| La lista de «garantías personales» es la **misma deuda** que las operaciones de rol codeudor | 22/22, cantidad y monto | nunca se suman; queda como comprobación dentro de `deudaCodeudorGarante` |
| `historico_endeudamiento_*` «Actual» es el resumen por sistema | 22/22 | la evolución de la deuda es de todos los roles y lo dice |
| Los tramos de mora salen de los **días de mora** (hasta 30, 60, 90, 180, 270, 360, 720 y 1.080 días) | bancos 20/22; la suma de los tramos es el vencido 22/22 | la mora del titular se reparte por días: Equifax no separa por rol |
| `porcentaje_uso_tarjeta` es el saldo **promedio de 6 meses** sobre el cupo, no el de hoy, y pasa de 100 | 136/136 | `usoPromedioPorcentaje` es ese; `usoActualPorcentaje` (saldo de hoy sobre cupo) coincide con la política de uso de Equifax en 13/13 |
| `score_min` y `score_max` son los límites de la **banda** en la que cae la persona, no el rango posible del score | varían entre personas (1 a 973; 414 a 999) | se llaman `bandaDelScoreEquifaxDesde` y `…Hasta` |
| Una operación no se puede seguir de un mes al siguiente | ver 1.1 | nada se cuenta «por operación» a través de los meses |
| `dias_morosidad` mayor que cero sin vencido existe; lo contrario no | 670 filas de 11.264; 0 | «hubo mora» = días de mora; «deuda vencida» = monto vencido: son dos campos |
| La historia trae **24 meses** exactos | 22/22 | la ventana de conducta de pago es de 24 meses desde el último corte |
| La primera fila de `entidades_consultados` es un **encabezado** con los doce meses | 22/22 | de ahí salen los meses; sin él se avisa y no se inventan |
| `NOVACREDIT S. A.` y `NOVACREDIT S.A.` consultan en 19 y 7 personas | — | se marcan y no cuentan como entidades que evalúan a la persona |
| `protestos` viene siempre vacío | 22/22 | `null` (no medido), nunca cero |

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

## 5. Grupos y campos (`equifax-estructura-v1`)

Cada campo se calcula **desde las tablas** de la sección 1.1; la columna «De
dónde sale» dice de qué lista de Equifax viene. La columna «Modelo» dice si el
campo va al perfil del modelo (sección 6). **Construido:** los nombres de abajo
son los de `consultas_equifax.estructura`; los que cambiaron respecto de la
propuesta están en negrita y se explican en las secciones 1.1 y 3.1.

| Grupo | Campos principales (nombre propuesto) | De dónde sale | Modelo |
|---|---|---|---|
| **Consulta** | `consultadoEl`, `ambiente`, `identidadVerificada`, `version` | tabla y auditoría | no |
| **Scores** | `scoreEquifax`, **`bandaDelScoreEquifaxDesde`/`Hasta`**, `tasaDeMalosAcumuladaPorcentaje`, `scoreEquifaxHace6Meses`, `scoreEquifaxHace12Meses`, `variacionDelScore12Meses`, `scoreInclusionEquifax`, `scoreSobreendeudamientoEquifax`, `probabilidadDeSobreendeudamientoPorcentaje`, `nivelDeSobreendeudamiento` | `score`, `score_inclusion`, `score_sobreendeudamiento`, `historico_score` | sí |
| **Estado general** | `estadoDeCartera` (al día, mora 30, mora 60, mora 90, dudoso recaudo, cartera castigada), `fechaDelPrimerCredito`, `antiguedadCrediticiaMeses`, `tieneInhabilitacionBancaria`, `numeroDeMorosidades` | `ESTADO_CARTERA`, `mantiene_historial_crediticio`, `personas_inhabilitadas`, `protestos_morosidades` | sí |
| **Deuda actual del titular** | por sistema y total: `numeroDeOperaciones`, `institucionesDistintas`, `saldoDeudaUsd`, `saldoPorVencerUsd`, `saldoVencidoUsd`, `saldoNoDevengaInteresesUsd`, `saldoDemandaJudicialUsd`, `saldoCarteraCastigadaUsd`, `cuotaMensualUsd`, `maximoDiasDeMora`, y la conciliación: `saldoTodosLosRolesUsd`, `resumenDeEquifaxUsd`, `diferenciaConElResumenUsd`, `conciliaConElResumen` (`si` / `no` / `sin_resumen` / `sin_detalle`) | `detalle_deuda_actual_*`, `valor_deuda_3_sistemas` | sí |
| **Deuda como codeudor o garante** | los mismos bloques (sin la conciliación), separados del titular, y **`listaAparteDeEquifax`**: la lista de «garantías personales» de Equifax (`numeroDeOperacionesVigentes`, `deudaTotalUsd`, `numeroDeOperacionesNoVigentes`, `coincideConLasOperacionesDeRolCodeudor`), que es la misma deuda y sirve para comprobar | `detalle_deuda_actual_*` con rol no titular; `garantias_personales_codeudores_*` | sí |
| **Mora actual** | los nueve tramos del vencido del titular (`vencidoDe0a1MesUsd` … `vencidoDeMasDe36MesesUsd`) **repartidos por días de mora**, `saldoVencidoUsd`, `porcentajeDeLaDeudaVencida`, `numeroDeOperacionesVencidas`, `maximoDiasDeMora`, y el vencido que dice el resumen de Equifax (todos los roles) | `detalle_deuda_actual_*` (los tramos de Equifax, `deuda_historica`, sirvieron para validar la regla de los días) | sí |
| **Conducta de pago (24 meses)** | `mesesObservados`, `mesesConMoraEnLosUltimos24`, **`mesesConMoraDeMasDe90Dias`**, `mesesConDeudaVencida`, `maximoDiasDeMoraEnLosUltimos24`, `fechaDeLaUltimaMora`, **`maximoDeOperacionesEnMoraEnUnMes`**, **`maximoDeOperacionesConMoraDeMasDe90DiasEnUnMes`**. Por mes y sólo del titular: una operación no se sigue de un mes a otro | `detalle_deuda_historica_*` | sí |
| **Evolución** | `deudaHace6MesesUsd`, `deudaHace12MesesUsd`, `variacionDeLaDeuda12MesesPorcentaje`, `acreedoresActuales`, `acreedoresHace6Meses`, `acreedoresHace12Meses`, `cuotaEstimadaActualUsd`, `cuotaEstimadaHace12MesesUsd` | `historico_*`, `evolucion_*` | sí |
| **Tarjetas de crédito** | `numeroDeTarjetasVigentes`, `cupoTotalUsd`, `saldoTotalUsd`, **`usoActualPorcentaje`** (saldo de hoy sobre cupo: lo que mide la política de Equifax), `usoPromedioPorcentaje` (saldo promedio de 6 meses sobre cupo: el «uso» de Equifax), `usoMaximoPorcentaje` (la tarjeta más cargada), `saldoPromedio6MesesUsd`, `antiguedadDeLaMasAntiguaMeses`, `numeroDeTarjetasConSaldoMayorAlCupo`, `numeroDeTarjetasCanceladas` | `detalle_tarjetas`, `tarjetas_canceladas` | sí |
| **Créditos otorgados** | `numeroDeCreditosOtorgados`, `numeroDeCreditosRefinanciados`, `numeroDeCreditosReestructurados`, `numeroDeCreditosNovados`, `numeroDeCreditosCancelados`, `montoOriginalTotalUsd` y por tipo (consumo, vivienda, microcrédito, comercial) | `creditos_otorgados`, `operaciones_canceladas` | sí |
| **Consultas recibidas** | `entidadesQueLaConsultaronEnLosUltimos12Meses`, `consultasEnLosUltimos12Meses`, `consultasPorMes` (12), `entidadesEnLosUltimos3Meses`, `consultasEnLosUltimos3Meses`, `consultasDeNovaCreditEnLosUltimos12Meses`; **sin contar a NovaCredit**. Una entidad se escribe de varias maneras: el número de entidades sobrecuenta y el de consultas no | `entidades_consultados` | sí |
| ~~**Garantías dadas**~~ | **Ya no existe como grupo** (pedido del negocio, 2026-10-13: «garantía» es el colateral). Pasó a `deudaCodeudorGarante.listaAparteDeEquifax` | `garantias_personales_codeudores_*` | sí (sin nombres ni identificaciones de terceros) |
| **Actividad económica (SRI)** | `tieneRuc`, `estadoDelRuc`, `claseDeContribuyente`, `obligadoALlevarContabilidad` | `informacion_sri` | no (Novadata ya lo trae) |
| **Estimaciones de Equifax** | `ingresoEstimadoUsd`, `cuotaFinancieraEstimadaUsd`, `indicadorDeImpactoEconomico` (y el ingreso del indicador, y la cuota estimada de todos los roles) | `indicador_impacto_economico`, `IncomePredictor` | **no** (ver 6) |
| **Calidad de la respuesta** (nuevo) | `avisos` de la descomposición, `listasQueNoVinieron`, `operacionesConSaldoQueNoCuadra` (por vencer + vencido + no devenga + demanda + castigada contra el saldo: 18 de 476 operaciones), `operacionesConRolDesconocido`, `cortesDelDetalleActual` por sistema, `protestosMedidos` | todas | no |

## 6. Qué no llega al modelo

**Datos personales** (el modelo no los necesita; E27): nombre y documento de la
persona y de terceros (`nombre_titular` e `identificacion_titular` de la
lista de codeudor y garante son de **otra persona**); fecha de nacimiento, provincia, cantón,
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

## 7. Preguntas a Equifax (el diccionario de datos)

El diccionario de Aval mentía en dos campos y se supo con 240 respuestas; con 22
respuestas de Equifax ya hay campos cuyo nombre promete algo que los datos no
cumplen (`score_min` y `score_max` son una banda, `porcentaje_uso_tarjeta` es el
saldo promedio de 6 meses, el resumen por sistema cuenta también al codeudor).
Mejor preguntar antes de construir encima.

**Construido (2026-10-13):** las nueve preguntas de la propuesta crecieron a una
lista completa, con la evidencia de cada una y su prioridad, en
`docs/equifax-pedido-de-diccionario.md`. Es el documento que el negocio lleva a
Equifax (o contrasta con el diccionario que ya tenga). Lo que conteste se carga
sin volver a pagar: se sube la versión de las tablas o de la estructura y se
rehacen las consultas guardadas desde su crudo.

## 8. Lo que falta

**Decidido (2026-10-12):** el camino JSON → tablas → estructura (sección 1);
`reporteCrediticio` como fuente de la deuda (sección 3); no gastar consultas en
averiguar qué depende de los parámetros por ahora; los nombres de la sección 5 y
la agrupación de la 1.1 («ok»).

**Hecho (2026-10-13):** la migración 126, las funciones deterministas
`equifax-tablas-v1` y `equifax-estructura-v1` con sus pruebas (con una respuesta
inventada en el repositorio y con las 22 reales en `scripts/probar-equifax-tablas.mjs`),
la derivación al guardar cada consulta nueva, y el guion que rehace las ya
guardadas (`scripts/cargar-tablas-equifax.mjs`).

**Falta:**

1. El diccionario de datos de Equifax (sección 7). Lo consigue el negocio.
2. El ajuste al marco interpretativo: una sección nueva de comportamiento
   crediticio del sistema financiero ecuatoriano, con datos actuales e
   históricos. Se propone aparte, en `docs/propuesta-marco-equifax.md`, y no se
   activa sin validarlo (versión nueva del marco, su fila en
   `scoring_rules_versions` y autorización del gasto del modelo).
3. El perfil del modelo (paso 4): qué subconjunto de la estructura lee el modelo.
   Depende de 2 y de E27.
4. Las pantallas: cuando todo el proceso detrás de Equifax esté listo
   (decisión del negocio, 2026-10-13). Rótulo «Score de Equifax» y el vocabulario
   de `docs/modelo-de-la-persona.md`.
5. Las fichas de cumplimiento (`docs/cumplimiento/`): cuando termine el proceso de
   aprobación de Equifax (el negocio, 2026-10-13: «Equifax está en proceso de
   aprobación»).

## 9. Los lotes de consultas y lo que enseñaron (2026-10-12 a 17)

Se movió acá desde `docs/pendientes.md` (2026-10-20), porque es conocimiento y
no una tarea. Las 88 consultas de la base al 2026-10-20 son: 22 del 12/10 (2 de
prueba y 20 de un lote autorizado), 40 del 16/10, 25 del 17/10 y 1 pedida por una
solicitud Plus el 18/10. Todas de producción y de la persona pedida.

**Vigencia.** Una consulta vale del 18 de un mes al 17 del siguiente, sin
importar el día en que se hizo. Las 87 de antes del 18/10 caducaron ese día
(medido el 2026-10-20: 87 anteriores al 18/10 y 1 del ciclo vigente); volver a
consultar a cualquiera de ellas se cobra.

**Lote del 16/10** (40 personas, autorizado por el negocio): reales, sin consulta
previa y con la historia crediticia más larga de su último perfil de Novadata, con
11 o 12 operaciones. 17 tienen cooperativas, 17 retail y 24 son codeudoras o
garantes. Se pagaron 40 de 40, todas HTTP 200, de la persona pedida y con su
`client_id`; la auditoría no lleva la cédula. El tope se subió sólo para esa
corrida (`EQUIFAX_TOPE_DIARIO=40` en el entorno del guion, no en las secrets). El
crudo quedó doble: el archivo en `research/equifax/crudo/` (escrito antes de
interpretarlo) y `consultas_equifax.respuesta_cruda`. Lista y casos en
`research/equifax/lotes/lote-2026-10-16*` (fuera de git).

**Lote del 17/10** (25 personas poco bancarizadas, pedido por el negocio): reales,
sin consulta previa, elegidas por lo poco que traía su último perfil de Novadata
(5 sin operaciones, 9 con 1 o 2, 4 con mora y 7 con 3 a 9). Se pagaron 25 de 25, el
tope del día quedó en 25 de 30. Bitácora en `corrida-2026-10-17.log` (fuera de git).

- **Un expediente delgado no es uno vacío.** De las 5 sin operaciones en Novadata,
  4 traen deuda en Equifax. La quinta (`c-8b595446`) sí vino vacía: 6 KB, sin score
  ni historia. `c-e6db9ee9` y `c-c105874a` traen 14 y 22 meses de historia, y
  `c-0be1e991` no trae consultas recibidas y tiene 3 operaciones cuyo saldo no
  cuadra (`operacionesConSaldoQueNoCuadra`).
- **Por qué Novadata no veía esa deuda** (reconsulta gratis del mismo día de 4
  personas; crudo en `research/novadata-raw-2026-10-17/`): el resultado no cambió,
  así que reconsultar no la hace aparecer.
  - En dos de las tres con deuda bancaria (`c-b980f5b2`, `c-79f1a4ae`) el crédito
    se abrió el 16 y el 18 de septiembre, y el único corte de Super que se vio en
    Novadata es el del **2026-08-31**: la deuda es posterior al corte. Se confirma
    cuando Novadata publique el de septiembre (Equifax ya trae el del 30/09).
  - En la tercera (`c-23474215`) esa explicación no cabe: la operación de banco se
    abrió el 9 de enero, su corte en Equifax es el 31/08 y Novadata contesta «OK»
    con la lista vacía. Es una diferencia real de cobertura, sin explicar.
  - `c-79f1a4ae` sólo trae en Novadata una fila de riesgo `G` (garante) de otra
    deuda, no su crédito de titular.
  - `c-acdc2297`: Equifax trae una operación comercial con 2.149 días de mora y
    Novadata nada. Es el comercial de Equifax, que no es el retail de Novadata
    (otras empresas).
  - Con 4 personas es un indicio, no una tasa. Medirla de verdad pide comparar las
    87 contra su perfil de Novadata más reciente, por corte.

**`probar-equifax-tablas.mjs` sobre las 62 del 16/10: todo ok** (2026-10-17). La
lista de «garantías personales» coincidía con las operaciones de rol codeudor en
60 de 62; las 2 que no son las únicas cuya lista trae tipo `GARANTE`. Separada por
tipo, `CODEUDOR` = rol codeudor en 62 de 62. Los garantes no coinciden: de 6
personas con alguno en la lista o en el detalle, en ninguna son iguales cantidad y
monto (una tiene 3 garantes en la lista que el detalle no trae con ese rol). La
«Deuda como codeudor o garante» sale del detalle, así que un garante que sólo está
en la lista no se cuenta (pregunta 3.8 de `docs/equifax-pedido-de-diccionario.md`).
El campo `coincideConLasOperacionesDeRolCodeudor` de la estructura todavía compara
la lista entera: se separa por tipo con la próxima versión de la estructura, no
vale una versión sola. Ni el modelo ni las pantallas lo leen. El resumen concilia
en bancos 62 de 62, cooperativas 60 de 62 y comercial 49 de 62. `equifax_operaciones`
tenía 1.154 filas con las 62.

**Costo.** USD 0,40 por consulta (tarifa del negocio, 2026-10-17). Acumulado: 62
consultas al 17/10 (USD 24,80) y 87 al 18/10 (USD 34,80), todas de octubre.
