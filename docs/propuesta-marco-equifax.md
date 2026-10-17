# Propuesta: el buró de Equifax en el marco interpretativo

Propuesta del 2026-10-13 (el negocio dijo «procede» sobre el punto 3 de los
pendientes de Equifax), **construida el 2026-10-16 como `marco-v31`, apagada.**
Nada de lo que lee el modelo cambió: la versión nueva vive detrás de
`CONFIG_LLM.buroDeLaInstitucion` (`llm-scoring.ts`), en `false`, y se enciende
cuando el negocio lo decida con la comparación con y sin Equifax, que se autoriza
con una cifra (sección 7). Hasta entonces todo análisis sigue siendo `marco-v30`.

**Cambió con las respuestas del negocio del 2026-10-13 y del 2026-10-16**
(`docs/propuesta-buro-de-la-institucion.md`, secciones 0, 2 y 4): Equifax ya no es
«una segunda lectura» de la deuda sino que **reemplaza** al buró de bancos y de
cooperativas de Novadata cuando la persona lo tiene (un tema, una fuente); va **en
lugar de los grupos 3 y 4** del marco; la calificación A1 a E (que Equifax no trae)
se lee en **días de mora**; las casas comerciales de Novadata **se suman** al sector
comercial de Equifax («veamos cómo nos va sumando»); el rótulo «Garantías:» pasa a
**«Deuda como codeudor o garante»**; y Novadata se sigue consultando entera. Las
secciones 2 a 8 de abajo dicen lo construido; donde el borrador del 2026-10-13 decía
otra cosa, se aclara.

Lo que esta propuesta necesitaba ya estaba hecho y verificado: la estructura
estandarizada de Equifax, calculada desde las tablas
(`docs/propuesta-estructura-equifax.md`, migración 126), con 24 meses de historia por
persona y sin datos personales.

## 1. Qué agrega Equifax que el modelo hoy no tiene

| Hoy (Novadata) | Con Equifax |
|---|---|
| Buró de bancos y Diners, cooperativas y retail como fuentes separadas, **a la fecha de la consulta** | Los tres sistemas (bancos, cooperativas y sector comercial) en una fuente, **con 24 meses de historia mensual por operación** |
| La peor calificación de riesgo (A1 a E) como señal de mora | Días de mora de cada operación, mes a mes: cuántos meses con mora, cuántos de más de 90 días, cuándo fue la última |
| Una foto | **Tendencia**: la deuda, los acreedores y la cuota hace 6 y 12 meses; el score hace 6 y 12 meses |
| Sin lectura de tarjetas | Cupo, saldo y uso de las tarjetas |
| Sin señal de búsqueda de crédito | Cuántas entidades distintas consultaron a la persona en 12 meses (sin contar a NovaCredit, que es la consulta de CrediScope) |
| Sin score de un tercero | El score de Equifax, el de inclusión y el de sobreendeudamiento |
| La cuota sólo de cooperativas | La cuota de los tres sistemas |
| `deudaComoGaranteOCodeudor` sólo del buró de bancos | Lo mismo en los tres sistemas, separado de lo propio |

## 2. Cómo entra al modelo (construido)

**Cuál es el buró y qué consulta se lee** (`_shared/buro-de-la-institucion.ts`): el
buró de la base es `proveedores.es_buro` (129); si es Equifax, se lee la consulta de
la persona que sea de **producción**, con HTTP 200 y estructura, **la más reciente
anterior a la fecha del análisis** y **vigente hasta el 17 del mes**
(`vigencia-mensual.ts`, la misma regla que decide si se vuelve a pagar). Una del
ambiente de prueba no sirve para calificar a nadie (la lección de Aval). Si no se
puede saber cuál es el buró, el análisis falla en vez de seguir con Novadata sin
avisar. Aval como buró todavía no tiene esta lectura.

**Quién lo pide**: `analyze-client` y `scripts/analizar-en-lote.mjs`, sólo con el
interruptor encendido, y lo pasan a `armarPedidoScoring()`, que lo pasa a
`armarPerfilDelModelo()`. **Nadie consulta a Equifax**: se lee lo guardado (A5 = A).
La consulta que se leyó queda en el registro de consumo (`consultaBuro`) y en la
auditoría (`consulta_equifax_id`), y lo que leyó el modelo en
`analysis_results.mensaje_al_modelo`.

**Qué cambia en el perfil del modelo cuando llega el buró**
(`_shared/perfil-del-modelo.ts`):

- **Llega `buroEquifax`** (`buroEquifaxDelPerfilDelModelo()`, sección 3), donde
  estaba el buró de bancos: el orden sigue siendo el de importancia.
- **No llegan, ni en `null`**, `comportamientoCooperativas` ni los campos de buró de
  `comportamientoBancario` (operaciones, calificaciones, saldos, atraso, demanda,
  castigo, codeudor o garante). Se quedan sólo los que el buró no cubre: el registro
  de deudores, los préstamos del IESS/BIESS (sin sumarlos a la deuda: Equifax trae los
  del BIESS dentro de bancos) y las casas comerciales. La lista es de los que
  **quedan** (`QUEDAN_DE_NOVADATA_CON_BURO`): un campo de buró con otro nombre en un
  perfil viejo no puede colarse. Una prueba obliga a decidir sobre cualquier campo
  nuevo de `comportamientoBancario`.
- **`endeudamiento` se calcula desde el buró más las casas comerciales de Novadata**
  (`endeudamientoConBuroEquifax()`): bancos, cooperativas y sector comercial de
  Equifax como titular (con lo que está en atraso) más el retail de Novadata, la deuda
  en atraso igual, lo de codeudor o garante de los tres sistemas aparte, y la cuota de
  Equifax en los tres sistemas. Una parte que Equifax no trajo deja el total en
  `null`, no en un número menor.
- **La disponibilidad**: «buró de crédito de bancos», «tarjetas Diners» y
  «cooperativas» cuentan como consultados, aunque Novadata no haya contestado por
  ellos.
- **Una persona sin buró da el perfil de `marco-v30` byte a byte.** Lo prueban
  `perfil-del-modelo-buro.test.ts` (contra `perfil-del-modelo-sin-buro.esperado.json`,
  generado con el código de v30 antes del cambio) y, sobre datos reales, la
  comparación del 2026-10-16: el último perfil de cada una de las **2.813 personas**
  dio el perfil y el pedido entero idénticos a los de hoy, y con el interruptor
  apagado un buró que llega se ignora (2.813 de 2.813).
- **Sin datos personales**: la estructura no los trae por construcción, y la medición
  los vuelve a buscar (sección 5). **No corrige E27**: el resto del perfil sigue
  llevando datos que el modelo no necesita.

## 3. Qué campos van al modelo y cuáles no (construido)

| Grupo de la estructura | ¿Va? | En el bloque |
|---|---|---|
| `consulta.consultadoEl` | Sí | `fechaDelReporte`, la fecha de Ecuador. No van `ambiente`, `version` ni `identidadVerificada`. |
| `scores` | **Sí, con límites** | `scoreEquifax`, hace 6 y 12 meses, `variacionDelScore12Meses`, `scoreInclusionEquifax`, `scoreSobreendeudamientoEquifax`, `nivelDeSobreendeudamiento`. **No van** la tasa de malos, la probabilidad de sobreendeudamiento ni la banda: esperan al diccionario (`docs/equifax-pedido-de-diccionario.md`, 3.5) y el modelo las leería como una probabilidad. |
| `estadoGeneral` | Sí, recortado | `estadoDeCartera` (sólo la descripción, con `calculadoPor: "Equifax"`), `antiguedadCrediticiaMeses`, `tieneInhabilitacionBancaria` y `ultimaInhabilitacion` (fecha y acción). **No van** `numeroDeMorosidades` (el borrador lo llevaba: Equifax lo cuenta con todos los roles, y se leería como propio), los impagos de todos los roles ni los protestos (no medidos). |
| `deudaActualTitular` | Sí | Por sistema y total: operaciones, saldo, por vencer, vencido, no devenga, demanda, castigo, cuota, días de mora y `conciliaConElResumen`. Sin el saldo de todos los roles ni el resumen de Equifax: son material de control. |
| `deudaCodeudorGarante` | Sí | Por sistema y total: operaciones, saldo, vencido y días de mora. Sin la lista aparte (es la misma deuda). |
| `moraActual` | Sí | Vencido, porcentaje de la deuda vencida, operaciones vencidas, días de mora y `vencidoPorTramo` **sólo con los tramos que tienen saldo** (los nueve, casi siempre en cero, eran un tercio del grupo). Sin el vencido del resumen (todos los roles). |
| `conductaDePago` | **Sí: es lo más valioso** | Entero. |
| `evolucion` | Sí | Entero, como **`evolucionTodosLosRoles`**: el nombre dice que no se compara con la deuda propia. |
| `tarjetas` | Sí | Vigentes, cupo, saldo, uso de hoy, uso promedio de 6 meses, con saldo mayor que el cupo y la más antigua. |
| `creditosOtorgados` | Parcial | Otorgados, refinanciados, reestructurados y novados. **No van** los montos por tipo. |
| `consultasRecibidas` | Sí | Entidades y consultas en 3 y 12 meses, sin NovaCredit y sin el detalle por mes. |
| `actividadEconomica` | No | Novadata ya lo trae, con más detalle. |
| `estimacionesDeEquifax` | **No** | El ingreso estimado es de un tercero y no se especula sobre el ingreso. |
| `calidad` | **No** (el borrador llevaba las listas que no vinieron) | Los nombres de las listas son técnicos. Un grupo que Equifax no trajo llega en `null`, y el marco dice que eso no es un cero. En las 62 consultas no faltó ninguna lista. |

## 4. La sección del marco (construida)

El texto vive en `_shared/marco-interpretativo.ts`: `GRUPOS_DEL_BURO_EQUIFAX` y los
cortes de `marcoConElBuro()`, armados sobre el texto de `marco-v30` con marcas
ancladas (si alguien edita el marco y una marca deja de estar, el armado lanza un
error y las pruebas lo dicen). No se copia acá: dos copias del marco es como aparecen
las diferencias. Son **dos textos de una misma versión**, como el marco por cliente:

- **Con `buroEquifax`**: el grupo 3 pasa a ser el buró de Equifax (la fuente más
  directa de comportamiento de pago, todo «según Equifax» y a la fecha del reporte) y
  el grupo 4 lo que queda de Novadata en `comportamientoBancario` (registro de
  deudores, préstamos del IESS/BIESS, casas comerciales) más `endeudamiento` con la
  suma nueva. Los grupos siguen siendo 15 y en el mismo orden (el marco cita por
  número). Cambia también, en el resto: la intro («la información de Novadata y de
  Equifax»), el peso de las demandas de cobro («como un incumplimiento en el buró»),
  el de la persona cliente interna («como buroEquifax»), una línea en «QUÉ SE PUDO
  CONSULTAR» (bancos, Diners y cooperativas consultados porque los trajo Equifax) y
  `indicadorHistorial`, que se juzga con `buroEquifax`, las casas comerciales y los
  préstamos del IESS/BIESS, `comportamientoInterno` y `riesgoJudicialCrediticio`.
- **Sin buró**: el texto de `marco-v30` con un solo cambio, el rótulo (A7).

Lo que dice la sección del buró, contra el borrador del 2026-10-13:

- **Ya no es una segunda lectura.** El borrador decía «usá endeudamiento para cuánto
  debe y buroEquifax para el comportamiento, y no sumes las dos»: con un tema, una
  fuente, no hay dos deudas que sumar ni que contrastar.
- **La calificación en días.** Equifax no da la calificación de la Superintendencia;
  el atraso se lee en días de mora con los tramos que ya usa la institución: al día,
  1 a 30 (leve), 31 a 90 (relevante), más de 90 (incumplimiento grave: la definición
  de impago del Laboratorio, 110). Son los de la franja de la pestaña Equifax. No se
  escribe una calificación que Equifax no da.
- **«Deuda como codeudor o garante»** (A7) en lugar de «Garantías:»: en Ecuador
  garantía es el colateral.
- Se mantienen del borrador: la conciliación con el resumen (si no cuadra, a
  `missingInfo`, sin cifra exacta), la conducta de pago por mes (no se sigue una
  operación de un mes al otro), el estado de cartera como cálculo de Equifax, el score
  de Equifax como opinión de un tercero que no se traduce a probabilidad (sirve la
  tendencia), las tarjetas, la evolución de todos los roles, los créditos
  reestructurados, las consultas recibidas («al menos N») y la inhabilitación.
- Es nuevo: un grupo en `null` es información que Equifax no trajo, no un cero.

## 5. Lo medido

**Con las 22 personas del 2026-10-13** (el perfil de Novadata de 8 a 30 días anterior
a la consulta a Equifax; conteos, sin montos ni personas):

| Qué | Resultado en las 22 |
|---|---|
| Deuda propia en bancos (titular) | igual (hasta 1%) en **15**, cerca (hasta 10%) en 4, distinta (hasta 30%) en 1, muy distinta (más de 30%) en 2 |
| Deuda en cooperativas (titular) | igual en **19**, cerca en 2, distinta en 1 |
| Número de operaciones en bancos (titular) | el mismo en 3; **Equifax trae más en 19** (cuenta cada tarjeta como una operación) |
| Cartera castigada | ninguna de las dos en 21; **sólo Equifax en 1** |
| Operación con demanda | ninguna de las dos en 20; **sólo Equifax en 2** |
| Peor calificación de Novadata contra el máximo de días de mora de Equifax en bancos | **Dicen lo mismo en 19 de 22**; en 3 la calificación de Novadata es peor que lo que sugieren los días de Equifax |

**Con las 62 consultas del 2026-10-16**, armando el bloque y el perfil del modelo con
las mismas funciones que el análisis (`node scripts/medir-bloque-equifax.mjs`, sin
gasto; las 62 personas tienen perfil de Novadata y su consulta vigente hasta el 17/10):

| Qué | Resultado |
|---|---|
| Tamaño del bloque `buroEquifax` | **3.267 caracteres en promedio** (de 3.205 a 3.450): **unos 2.000 tokens** (máximo unos 2.120) |
| Perfil del modelo con buró contra sin buró | 10.461 contra 7.764 caracteres en promedio: **+2.697, unos 1.650 tokens** (sale el buró de Novadata, entra el bloque) |
| Sección del marco | **+3.798 caracteres, 1.602 tokens** (medido exacto: el texto del marco no es dato de nadie); sin buró, +56 caracteres (+21 tokens) |
| Datos personales | se buscaron **1.588 valores personales** de las respuestas crudas (nombre, documento, RUC, dirección, teléfonos, operaciones, terceros): **0 personas** con alguno en el bloque, **0** en el perfil entero |
| Números | ningún número de 10 dígitos o más en el bloque; ningún número con decimales en el perfil |
| Lo que el buró reemplaza | **0 perfiles** con un campo de buró de Novadata en `comportamientoBancario`; **0** con `comportamientoCooperativas` |
| Disponibilidad | en las 62, Novadata ya había contestado bancos, Diners y cooperativas: no cambia ningún tema |
| Deuda propia total con buró contra sin buró | igual (hasta 1%) en **21**, cerca (hasta 10%) en **25**, distinta (hasta 30%) en **12**, muy distinta en **4** (las 4, mayor con buró) |
| El detalle no concilia con el resumen de Equifax | comercial en 13, cooperativas en 2, bancos en 0 |
| Estado de cartera según Equifax | al día 44, en mora con días 7, mora con días al día 6, dudoso recaudo 3, cartera castigada 2 |

**Los tokens, calibrados.** Hasta el 2026-10-16 se estimaban con 3,2 caracteres por
token, y el bloque salía en 1.050 tokens: **pesa el doble**. Se midió con el contador
de tokens de la API (gratis, no corre el modelo) **sólo sobre el perfil inventado de
las pruebas y el texto del marco**, sin mandar nada de una persona real: el marco
rinde 2,37 caracteres por token y lo que el buró agrega al perfil, 1,63 (casi todo
números y nombres de campo largos). El guion usa esas cifras.

**Qué dice esto para el marco:**

- **La deuda coincide, y la cuenta de operaciones no.** Equifax cuenta cada tarjeta
  como una operación; con una sola fuente ya no hay que contrastarlas, pero el marco
  avisa que `numeroDeOperaciones` cuenta tarjetas.
- **Equifax marca lo grave donde está.** En 2 de las 22 personas Equifax dice cartera
  castigada o demanda judicial y los indicadores de buró de Novadata no lo decían
  (Novadata lo mostraba por otro lado: el atraso en bancos y una demanda de cobro).
  Con el buró, esa marca llega en el sistema donde está.
- **La mora cuenta casi lo mismo en las dos fuentes** (19 de 22): los días de mora se
  leen con los mismos criterios que la calificación, y lo nuevo de Equifax es la
  historia de 24 meses.
- **La deuda total cambia poco en la mayoría** (46 de 62 dentro del 10%), y en 16 la
  diferencia es mayor: el sector comercial de Equifax (telefonía, De Prati...) que
  Novadata no trae, el tiempo entre las dos consultas, y alguna casa comercial que
  figura en las dos fuentes y ahora se suma dos veces (la decisión del negocio fue
  sumar y ver).

## 6. Lo que decidió el negocio y lo que falta decidir

Decidido (2026-10-13 y 2026-10-16): Equifax entra al modelo **en lugar de** bancos y
cooperativas (A1, A3), **en lugar de los grupos 3 y 4** (A4), se consulta a mano y el
análisis lee lo guardado (A5 = A), el Score de Equifax se ve en su pestaña (A6), el
rótulo es «Deuda como codeudor o garante» (A7), las casas comerciales se suman, la
calificación se reemplaza por días de mora, y la comparación espera a que todo esté
listo (A8).

Falta decidir:

1. **Encender `marco-v31`.** Después de la comparación (sección 7).
2. **La comparación misma**, con su cifra.
3. **Las dudas del diccionario**: los campos que no van esperan la respuesta de
   Equifax (`docs/equifax-pedido-de-diccionario.md`).

## 7. Cómo se validaría y cuánto cuesta

**No se corre ningún análisis con el modelo hasta que el negocio autorice el gasto
con una cifra** («¿corro X por USD Y?»; elegir las opciones del diseño no es
autorizar el gasto).

1. **Sin gasto (hecho, sección 5).** El bloque de las 62 personas: tamaño, sin datos
   personales, sin nada del buró de Novadata, y la persona sin buró igual a hoy.
2. **Con autorización.** Analizar a las 62 personas con `marco-v30` y con `marco-v31`
   (ninguna tiene todavía un análisis con v29 o v30: 54 no tienen ninguno) y leer las
   respuestas contra los perfiles que recibieron. El ruido medido del modelo es de ±40
   puntos de score y una recomendación de cada 13: una diferencia menor que eso **no se
   atribuye** a Equifax (hay que leer el razonamiento, no mirar el score). Se corre con
   `scripts/analizar-en-lote.mjs`, una vez con el interruptor apagado y otra con
   `CONFIG_LLM.buroDeLaInstitucion` encendido en la copia local (el lote corre desde la
   máquina: encenderlo ahí no despliega nada), con la migración 131 aplicada.
3. **Costo estimado (no medido):** cada análisis en lote costó USD 0,0178 (200 análisis
   de marco-v28, USD 3,55). Con buró, el perfil suma unos 1.650 tokens de entrada propia
   y el marco 1.602 que en lote se leen de la caché (con los precios de `llm_costos`:
   USD 2 por millón de entrada, USD 0,20 de lectura de caché, a mitad de precio en
   lote): **unos USD 0,0019 más por análisis, alrededor de USD 0,020** (la salida puede
   cambiar y no está medida). **Las 124 respuestas (62 con cada versión): alrededor de
   USD 2,3 en lote.**
   **Ojo con el presupuesto:** al 2026-10-13 octubre llevaba **USD 9,28 de 10**. O se
   corre en noviembre, o el negocio sube antes el tope del proveedor de IA
   (`docs/puesta-en-marcha-ifi.md`, 1.3), que es lo que manda, no esta cuenta. Y las 62
   consultas **caducan el 18/10**: si la comparación se corre después, `marco-v31` no
   encuentra ninguna consulta vigente y todas salen sin buró. Hay dos caminos, y los
   decide el negocio: volver a pagar Equifax por esas personas (se autoriza aparte), o
   que el lote acepte una fecha de análisis anterior al corte para leer las consultas
   guardadas (`consultaVigenteDeEquifax()` ya recibe la fecha; falta el argumento en el
   lote, un cambio chico).

## 8. Qué cambió en el código (2026-10-16)

- `_shared/perfil-del-modelo.ts`: `buroEquifaxDelPerfilDelModelo()`,
  `endeudamientoConBuroEquifax()`, `QUEDAN_DE_NOVADATA_CON_BURO`,
  `CAMPOS_DEL_BURO_DE_NOVADATA`, `TEMAS_QUE_CUBRE_EL_BURO` y el parámetro `buro` de
  `armarPerfilDelModelo()` y `mensajeParaElModelo()`.
- `_shared/buro-de-la-institucion.ts`: `buroDeLaBase()`, `consultaVigenteDeEquifax()` y
  `buroVigenteDeLaPersona()`.
- `_shared/marco-interpretativo.ts`: `MARCO_VERSION_CON_BURO = "marco-v31"` y
  `marcoConElBuro()`.
- `_shared/llm-scoring.ts`: `CONFIG_LLM.buroDeLaInstitucion` (apagado),
  `versionDelMarco()` y el parámetro `buro` de `armarPedidoScoring()`. El buró y el
  marco por cliente todavía no se combinan (lanza un error).
- `analyze-client` y `scripts/analizar-en-lote.mjs`: leen la consulta vigente con el
  interruptor encendido y guardan la versión que corresponde.
  `scripts/comparar-razonamiento.mjs` se niega a correr con el interruptor encendido
  (todavía no lee el buró).
- Migración **131** (`131_marco_v31_buro_de_la_institucion.sql`): la fila de `marco-v31`
  en `scoring_rules_versions`. Toma el número libre al aplicarse.
- Pruebas: `perfil-del-modelo-buro.test.ts` (con el perfil inventado de
  `perfil-de-prueba.ts` y la respuesta inventada de Equifax) y
  `buro-de-la-institucion.test.ts`. La medición: `scripts/medir-bloque-equifax.mjs`.

**Para encenderlo** (cuando el negocio lo decida): aplicar la 131 con el corredor una
vez fusionada en `main`, subir `ESQUEMA_MINIMO` a 131, poner
`buroDeLaInstitucion: true`, desplegar con `--funciones` y hacer una llamada suelta de
comprobación sobre una persona con consulta vigente (está aceptada).

**Lo que queda fuera de esta versión** (la capa 2 en SQL,
`docs/propuesta-buro-de-la-institucion.md`, sección 7, paso 3): `resumen_por_persona`
(la marca «D o E» de la bandeja y Monitoreo) y la definición de impago del Laboratorio
(«bancos D o E») siguen leyendo la calificación de Novadata; pasan a días de mora para
quien tenga buró con sus propias migraciones. El Laboratorio, además: la estructura de
Equifax es de la fecha de la consulta, así que sirve para t0 sólo si la consulta es
anterior al análisis.
