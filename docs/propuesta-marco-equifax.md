# Propuesta: el buró de Equifax en el marco interpretativo

Propuesta del 2026-10-13 (el negocio dijo «procede» sobre el punto 3 de los
pendientes de Equifax). **Es una propuesta: no cambia nada de lo que lee el
modelo hoy.** Una sección nueva del marco y un bloque nuevo del perfil del modelo
son una versión nueva del marco (`MARCO_VERSION`, con su fila en
`scoring_rules_versions`), y esa versión no se activa sin validarla con el
negocio y sin autorización explícita del gasto del modelo.

**Cambió con las respuestas del negocio del 2026-10-13** (bloque A del
cuestionario): Equifax ya no es «una segunda lectura» de la deuda sino que
**reemplaza** a los grupos de bancos y cooperativas de Novadata cuando la persona
lo tiene; la calificación A1 a E (que Equifax no trae) se reemplaza por días de
mora; las casas comerciales de Novadata se quedan, sin repetir empresa; y el
rótulo es «Deuda como codeudor o garante». Lo medido y la regla:
`docs/propuesta-buro-de-la-institucion.md`, secciones 1, 2 y 4. Las secciones 2 y
4 de este documento se reescriben con eso antes de construir `marco-v30`.

Lo que sí está hecho y verificado es lo que esta propuesta necesita: la
estructura estandarizada de Equifax, calculada desde las tablas
(`docs/propuesta-estructura-equifax.md`, migración 126), con 24 meses de historia
por persona. Sin datos personales.

## 1. Qué agrega Equifax que el modelo hoy no tiene

| Hoy (Novadata) | Con Equifax |
|---|---|
| Buró de bancos y Diners, cooperativas y retail como fuentes separadas, **a la fecha de la consulta** | Los tres sistemas (bancos, cooperativas y sector comercial) en una fuente, **con 24 meses de historia mensual por operación** |
| La peor calificación de riesgo (A1 a E) como señal de mora | Días de mora de cada operación, mes a mes: cuántos meses con mora, cuántos de más de 90 días, cuándo fue la última |
| Una foto | **Tendencia**: la deuda, los acreedores y la cuota hace 6 y 12 meses; el score hace 6 y 12 meses |
| Sin lectura de tarjetas | Cupo, saldo y uso de cada tarjeta |
| Sin señal de búsqueda de crédito | Cuántas entidades distintas consultaron a la persona en 12 meses (sin contar a NovaCredit, que es la consulta de CrediScope) |
| Sin score de un tercero | El score de Equifax, el de inclusión y el de sobreendeudamiento |
| `deudaComoGaranteOCodeudor` del buró de bancos | Lo mismo en los tres sistemas, separado de lo propio |

## 2. Cómo entra al modelo

**Un bloque nuevo del perfil del modelo, `buroEquifax`**, armado desde
`consultas_equifax.estructura` de la consulta vigente de la persona. Una función
nueva en `perfil-del-modelo.ts` (`buroEquifaxDelPerfilDelModelo()`), que recibe la
estructura y deja pasar sólo los campos de la tabla de la sección 3. Lo que lee el
modelo se mide en `analysis_results.mensaje_al_modelo`, no en el código.

- **Sin datos personales.** La estructura no los trae por construcción (sus
  pruebas buscan 702 valores personales de las 22 respuestas y no encuentran
  ninguno). **No corrige E27**: el resto del perfil sigue llevando datos que el
  modelo no necesita, y ningún documento debe afirmar la minimización hasta que se
  corrija.
- **Disponibilidad.** `disponibilidadPorTema()` suma el tema «buró de Equifax»:
  consultado si hay una consulta de producción de esa persona vigente a la fecha del
  análisis; no consultado en cualquier otro caso. Una consulta de ambiente de
  `prueba` no sirve para calificar a nadie (la lección de Aval).
- **Una persona sin Equifax es la regla, no una falla.** Cada consulta se cobra y
  hoy sólo hay 22. El marco tiene que decir que no tener Equifax no cuenta como un
  tema clave sin consultar: no acerca el score al centro ni va a `missingInfo`.
- **Quién consulta a Equifax.** Esta propuesta **no consulta a nadie**: el análisis
  lee lo que ya esté guardado. Que el análisis dispare una consulta (con su costo
  y su base legal) es otra decisión del negocio (sección 6).

## 3. Qué campos van al modelo y cuáles no

| Grupo de la estructura | ¿Va? | Observación |
|---|---|---|
| `consulta.consultadoEl` | Sí | Como «fecha del reporte de Equifax». No van `ambiente`, `version` ni `identidadVerificada`. |
| `scores` | **Sí, con límites** | `scoreEquifax`, `scoreEquifaxHace6Meses`, `scoreEquifaxHace12Meses`, `variacionDelScore12Meses`, `scoreInclusionEquifax`, `scoreSobreendeudamientoEquifax`, `nivelDeSobreendeudamiento`. **No van** `tasaDeMalosAcumuladaPorcentaje`, `probabilidadDeSobreendeudamientoPorcentaje` ni la banda: su definición está pendiente del diccionario (`docs/equifax-pedido-de-diccionario.md`, sección 3.5) y el modelo las leería como una probabilidad. |
| `estadoGeneral` | Sí | `estadoDeCartera` (rotulado «según Equifax»), `antiguedadCrediticiaMeses`, `tieneInhabilitacionBancaria` con su acción, `numeroDeMorosidades`. **No van** los impagos «de todos los roles» ni los protestos (no medidos). |
| `deudaActualTitular` | Sí | Por sistema y total, con `conciliaConElResumen`. Sin `saldoTodosLosRolesUsd` ni el resumen de Equifax: son material de control, no del análisis. |
| `deudaCodeudorGarante` | Sí | Total y por sistema; sin la lista aparte (es la misma deuda). |
| `moraActual` | Sí | Tramos por días del titular, `porcentajeDeLaDeudaVencida`, `numeroDeOperacionesVencidas`. |
| `conductaDePago` | **Sí: es lo más valioso** | Los meses con mora, los de más de 90 días, el máximo de días, la fecha de la última mora y el pico de operaciones en mora en un mes. |
| `evolucion` | Sí | Deuda, acreedores y cuota hace 6 y 12 meses, y la variación. Dicho: «de todos los roles» (así los calcula Equifax). |
| `tarjetas` | Sí | Uso actual, uso promedio de 6 meses, cuántas con saldo mayor que el cupo. |
| `creditosOtorgados` | Parcial | Cuántos refinanciados, reestructurados y novados. **No van** los montos por tipo (el significado de las columnas titular, codeudor y garante está pendiente). |
| `consultasRecibidas` | Sí | Entidades y consultas en 3 y 12 meses, sin NovaCredit. |
| `actividadEconomica` | No | Novadata ya lo trae, y con mejor detalle. |
| `estimacionesDeEquifax` | **No** | El ingreso estimado es de un tercero y la regla del negocio es que no se especula sobre el ingreso. Se guarda y se rotula; no se le da al modelo hasta que el negocio lo decida. |
| `calidad` | Sólo `conciliaConElResumen` y `listasQueNoVinieron` | Para que el modelo pueda decir «el detalle comercial de Equifax no cuadra con su propio total». |

## 4. La sección del marco (borrador)

Va con el mismo tono, la misma voz y las mismas reglas que el resto del marco:
voseo, sin nombres técnicos en la respuesta, sin cifras de prueba. Los criterios
**dentro** del grupo (qué pesa cuánto) son, como los demás del marco, una propuesta
razonable a validar con el negocio. La posición en el orden de importancia también
es del negocio: se propone justo después de las cooperativas y del endeudamiento,
como grupo 5 (los siguientes se renumeran; el marco sólo cita por número al grupo 1).

```text
5. buroEquifax: el buró de Equifax, otra fuente de comportamiento de pago sobre
   la misma persona. Cubre los tres sistemas (bancos, cooperativas y sector
   comercial) y trae 24 meses de historia mensual, que Novadata no trae. Sólo
   llega si la persona se consultó en Equifax (disponibilidad.temasConsultados dice
   "buró de Equifax"): si no llega, no es un hueco ni un dato faltante, y no lo
   menciones. Todo es "según Equifax" y a la fecha de su reporte
   (consultadoEl): decilo así.
   - Es una segunda lectura de la misma deuda, no una deuda más. Nunca sumes la
     deuda de Equifax a la de endeudamiento: es la misma cartera vista por dos
     fuentes. Para decir cuánto debe, usá endeudamiento; usá buroEquifax para el
     comportamiento (historia de mora, tendencia, tarjetas) y para contrastar. Si
     las dos fuentes difieren de forma relevante en una deuda o en una mora, es
     una contradicción entre fuentes: mencionala y no elijas una por tu cuenta.
   - Lo propio y lo ajeno van separados, como en comportamientoBancario.
     deudaActualTitular es lo que debe como titular; deudaCodeudorGarante es deuda
     de otra persona que ésta respalda como codeudora o garante: un riesgo
     contingente, nunca "no pagó". No la sumes a lo propio.
   - conciliaConElResumen = "no" en un sistema quiere decir que el detalle de
     Equifax no cuadra con el total que la propia Equifax publica para ese
     sistema. Pasa más en el sector comercial, que trae operaciones con cortes de
     distintos meses. Si la deuda de ese sistema importa para la decisión, decilo en
     missingInfo y no afirmes una cifra exacta de ese sistema.
   - conductaDePago es lo más informativo de esta fuente. Mirá cuántos de los
     últimos 24 meses tuvo mora y cuán grave fue:
     · mora ocasional y corta (unos pocos meses, menos de 30 días) es leve;
     · mesesConMoraDeMasDe90Dias mayor que 0 es grave aunque hoy esté al día:
       fue un incumplimiento real, y pesa más cuanto más reciente
       (fechaDeLaUltimaMora);
     · una mora grave de hace casi dos años con los últimos 12 meses limpios es
       historia, no situación actual;
     · maximoDeOperacionesEnMoraEnUnMes alto (varias operaciones atrasadas a la
       vez) es más preocupante que una sola.
     No se puede seguir una operación de un mes al otro: no hables de "la misma
     operación", hablá de meses.
   - moraActual: lo vencido hoy como titular, repartido por tramos de atraso.
     porcentajeDeLaDeudaVencida dice cuánto de su deuda propia está vencido.
     Un vencido chico en el primer tramo con el resto al día es leve; vencido en
     los tramos de más de 90 días o en demanda o castigo pesa como en
     comportamientoBancario.
   - estadoDeCartera es un cálculo de Equifax, no un hecho del buró: citalo como
     "Equifax lo clasifica como …", y si contradice lo que ves en los otros
     grupos, mencionalo. (Cómo lo calcula Equifax está en el pedido de
     diccionario: hasta que lo conteste, no digas que es "el peor estado".)
   - El score de Equifax (scoreEquifax) es la opinión de un tercero con su propio
     modelo: contexto fuerte pero no decide, y no es el score de este análisis.
     Todavía no sabemos traducirlo a una probabilidad: no lo traduzcas ("640 es
     un X% de riesgo") ni lo restes del tuyo. Lo que sí sirve es la tendencia:
     una caída fuerte en los últimos 12 meses (variacionDelScore12Meses) es una
     señal de deterioro. scoreSobreendeudamientoEquifax y nivelDeSobreendeudamiento
     son su lectura de la carga de deuda: "alto" es una alerta de capacidad, no un
     hecho de pago.
   - tarjetas: usoActualPorcentaje es el saldo de hoy sobre el cupo. Un uso
     sostenido por encima del 90%, o tarjetas con saldo mayor que el cupo, es
     tensión de liquidez; un uso bajo con tarjetas antiguas es neutro. Si el uso
     de las tarjetas de hoy y el promedio de 6 meses difieren mucho, nombrá la
     tendencia ("subió de X a Y"), no sólo uno.
   - evolucion: lo que cambió en un año. Mucha más deuda y más acreedores en 12
     meses con un ingreso que no creció es una tensión de capacidad, que se dice
     como tensión y no como mal comportamiento. Estas series son de todos los roles
     (así las calcula Equifax): no las compares con la deuda propia de
     endeudamiento.
   - creditosOtorgados: reestructurados y refinanciados son una señal de
     dificultad previa (negativo moderado); los novados son renovaciones y no
     dicen nada por sí solos.
   - consultasRecibidas: cuántas entidades distintas la consultaron. Muchas en
     pocos meses es búsqueda activa de crédito: una señal leve de necesidad, no de
     mal pago. Una misma entidad puede venir escrita de varias maneras: no digas
     "N entidades distintas" como un hecho exacto sino "al menos N consultas".
   - tieneInhabilitacionBancaria = true es grave (cierre de cuentas): nombrá
     la acción y la fecha.
   - No se informan: lo que Equifax no mide o no trae. No escribas "sin protestos"
     (no se mide) ni "no tiene inhabilitación bancaria" (es lo normal).
```

Los cambios que acompañan a la sección en el resto del marco:

- **`indicadorHistorial`** se juzga hoy sólo con `comportamientoBancario`,
  `comportamientoCooperativas`, `comportamientoInterno` y
  `riesgoJudicialCrediticio`: pasa a incluir `buroEquifax` (la conducta de pago).
- **«QUÉ SE PUDO CONSULTAR»** dice hoy que si varios temas clave están sin consultar
  a la vez hay que acercar el score al centro: se aclara que **«buró de Equifax»
  no es un tema clave**, porque casi nadie lo tiene.
- **«QUÉ VA EN CADA CAMPO»**: los positivos y negativos de Equifax van con
  «según Equifax» y se ordenan con el comportamiento de pago.
- **El rótulo «Garantías»** del grupo 3 (`comportamientoBancario`): el marco-v28
  llama «Garantías:» al bullet de `numeroOperacionesComoGaranteOCodeudor`. En
  Ecuador garantía es el colateral (auto, casa, pagaré) y lo que el bullet describe
  es una persona respondiendo por la deuda de otra. Se propone llamarlo «Lo que
  respalda como garante o codeudor». Es una nueva razón para una versión nueva del
  marco: cambia el texto que lee el modelo.

## 5. Lo que se midió con las 22 personas que ya tienen Equifax

Las 22 personas consultadas en Equifax tienen también su perfil de Novadata: **el de
Novadata es de 8 a 30 días anterior a la consulta a Equifax en las 22**, así que parte
de cada diferencia puede ser tiempo y no fuente. Se comparó en la base (conteos, sin
montos ni personas):

| Qué | Resultado en las 22 |
|---|---|
| Deuda propia en bancos (titular) | igual (hasta 1%) en **15**, cerca (hasta 10%) en 4, distinta (hasta 30%) en 1, muy distinta (más de 30%) en 2 |
| Deuda en cooperativas (titular) | igual en **19**, cerca en 2, distinta en 1 |
| Número de operaciones en bancos (titular) | el mismo en 3; **Equifax trae más en 19; Novadata no trae más en ninguna** |
| Cartera castigada | ninguna de las dos en 21; **sólo Equifax en 1**; sólo Novadata en 0 |
| Operación con demanda | ninguna de las dos en 20; **sólo Equifax en 2**; sólo Novadata en 0 |
| Peor calificación de Novadata contra el máximo de días de mora de Equifax en bancos | **Dicen lo mismo en 19 de 22**: A1 con 0 días en 10, A2 con 1 a 30 en 4, A3 con 0 en 1, B1 con 31 a 90 en 1, C1 con 31 a 90 en 1 y E con más de 90 en 2. **En 3 la calificación de Novadata es peor** que lo que sugieren los días de Equifax (B2 y C1 con sólo 1 a 30 días): puede ser otra operación o otro momento |

**Qué dice esto para el marco:**

- **La deuda coincide, y la cuenta de operaciones no.** Se puede contrastar la deuda
  entre fuentes (19 de 22 dentro del 10% en bancos), pero no hay que comparar «cuántas
  operaciones tiene»: Equifax cuenta más. Se midió por qué: Equifax cuenta cada tarjeta
  como una operación, y el número de Novadata cae **entre «sin tarjetas» y «con todas
  las tarjetas» de Equifax en 19 de 22 personas** (sólo en 1 coincide con «sin
  tarjetas»): Novadata cuenta algunas tarjetas y no todas. La sección no habla de
  número de operaciones entre fuentes.
- **Equifax marca lo grave en dónde está, y Novadata no lo marca en su buró.** En 2 de
  las 22 personas Equifax dice cartera castigada (1: en un banco) o demanda judicial
  (2: una en un banco y otra en el sector comercial) y los indicadores de buró de
  Novadata (`tieneOperacionCastigada`, `tieneOperacionConDemanda`) no lo dicen. Se
  miraron las dos: **Novadata ya mostraba el atraso en bancos y una demanda de cobro
  en su contra** (`riesgoJudicialCrediticio`), así que la señal llegaba al modelo por
  otro grupo, pero sin decir en qué sistema está ni que la deuda ya es cartera
  castigada. Por eso la sección dice que una contradicción se menciona y no se
  resuelve sola, y que la cartera castigada y la demanda «según Equifax» pesan como
  las de `comportamientoBancario`.
- **La mora cuenta casi lo mismo en las dos fuentes** (19 de 22; la calificación de la
  Superintendencia es por días de atraso): la conducta de pago de Equifax se puede leer
  con los mismos criterios, y lo nuevo de Equifax es la **historia de 24 meses**.

El **tamaño** del bloque, medido sobre las 22 (`scripts/medir-bloque-equifax.mjs`, sin
gasto): **unos 3.400 caracteres, alrededor de 1.050 tokens** (una estimación con 3,2
caracteres por token). La sección del marco: unos 5.000 caracteres, alrededor de
1.550 tokens.

## 6. Lo que tiene que decidir el negocio

1. **Si Equifax entra al modelo.** Esta propuesta sólo la deja lista.
2. **La posición en el orden de importancia** (¿grupo 5, junto a los otros buró?)
   y el peso relativo frente a Novadata.
3. **Cuándo se consulta a Equifax para un análisis**, y quién autoriza el gasto:
   - **A (recomendada para empezar):** el análisis lee lo que ya esté guardado. Se
     consulta a Equifax a mano (el guion local o la función, con base legal y tope
     diario), por persona y con autorización.
   - **B:** el análisis consulta solo, bajo una regla (por ejemplo, un monto o una
     banda de score). Cada consulta se cobra y no hay tope del proveedor: hace falta
     la regla, su presupuesto y su base legal antes de construirla.
4. **Si el score de Equifax se muestra al analista** (rótulo «Score de Equifax»). Es
   otra decisión: las pantallas esperan a que todo el proceso detrás de Equifax
   esté listo (decisión del negocio, 2026-10-13).
5. **Qué hacer con las dudas del diccionario.** Los campos de la sección 3 que no
   van esperan al diccionario de Equifax.
6. **El rótulo «Garantías»** (sección 4).

## 7. Cómo se validaría y cuánto cuesta

**No se corre ningún análisis con el modelo hasta que el negocio autorice el gasto
con una cifra** («¿corro X por USD Y?»; elegir las opciones del diseño no es
autorizar el gasto).

1. **Sin gasto.** Armar el bloque `buroEquifax` para las 22 personas desde la base
   y leerlo: tamaño en tokens, que no haya datos personales, que cada afirmación de
   la sección 4 tenga el campo que la sostiene. Es lo que se hace antes de pedir
   nada.
2. **Con autorización.** Analizar a las 22 personas dos veces, con el marco vigente
   y con la versión nueva, y leer las 44 respuestas contra los perfiles que
   recibieron. El ruido medido del modelo es de ±40 puntos de score y una
   recomendación de cada 13: una diferencia menor que eso **no se atribuye** a
   Equifax (hay que leer el razonamiento, no mirar el score).
3. **Costo estimado (no medido):** cada análisis en lote costó USD 0,0178 (200
   análisis, USD 3,55: 3.900 tokens de entrada propios, 14.600 del marco leídos de
   la caché y 2.400 de salida). La sección suma unos 1.600 tokens al marco (en lote,
   a caché: el 11% de lo que ya se lee de la caché) y el bloque unos 1.050 al perfil
   (el 27% de la entrada propia). Con ese aumento, cada análisis saldría entre
   USD 0,019 y USD 0,022 (los precios salen de `llm_costos`: USD 2 por millón de
   tokens de entrada, USD 10 de salida y USD 0,20 de lectura de caché, a mitad de
   precio en lote): **las 44 respuestas, alrededor de USD 1 en lote** (unos USD 0,5
   si sólo se corre la versión nueva y se reutilizan los análisis de marco-v28 que
   ya existan para esas 22).
   **Ojo con el presupuesto:** al 2026-10-13 octubre lleva **USD 9,28 de 10**
   (1.453 llamadas). La comparación pasaría del presupuesto del mes: o se corre en
   noviembre, o el negocio sube el tope del proveedor de IA antes
   (`docs/puesta-en-marcha-ifi.md`, 1.3), que es lo que manda, no esta cuenta.
4. **Una persona sin Equifax tiene que dar lo mismo que hoy.** El
   `perfilDelModelo` armado para una persona sin Equifax tiene que ser idéntico,
   byte a byte, al de la versión vigente: el bloque no aparece, ni siquiera como
   `null`. (El pedido entero no puede ser idéntico, porque el marco cambia: se
   compara el perfil, que es lo que se calcula en `armarPerfilDelModelo()`.)

## 8. Qué cambia en el código si se aprueba

- `perfil-del-modelo.ts`: `buroEquifaxDelPerfilDelModelo()`, el tema nuevo en
  `TEMAS_DE_CONSULTA` (con su regla de disponibilidad, que no sale de
  `metaConsulta`) y el parámetro nuevo de `armarPerfilDelModelo()`.
- `analyze-client` y `scripts/analizar-en-lote.mjs`: leer la consulta vigente de
  Equifax de la persona (`ambiente = 'produccion'`, la más reciente anterior a la
  fecha del análisis) y pasarla. Un camino nuevo al modelo también pasa por
  `armarPerfilDelModelo()` (CLAUDE.md).
- `marco-interpretativo.ts`: la sección, los tres ajustes de la sección 4 y
  `MARCO_VERSION` con el número libre al activarla: la v29 la tomó E27 el
  2026-10-13 (sin cédula, nombre ni empleadores), y el marco por cliente
  también espera el suyo.
- `marco-por-cliente.ts`: la sección nueva se corta cuando no hay `buroEquifax`
  (como las de PEP y pensión), con su marca y su prueba.
- Una migración con la fila de esa versión en `scoring_rules_versions` y el
  `ESQUEMA_MINIMO` de las funciones: primero se migra, después se desplegan.
- Pruebas: una respuesta de Equifax inventada ya existe
  (`equifax-respuesta-de-prueba.ts`); el bloque se prueba con ella, y el pedido sin
  Equifax se prueba contra el de hoy.
- El Laboratorio: las variables salen del perfil del día del análisis (t0). La
  estructura de Equifax es de la fecha de la consulta, así que sirve para t0 si la
  consulta es anterior al análisis y no a la inversa. Una reconsulta no puede
  usarse para explicar una decisión anterior.
