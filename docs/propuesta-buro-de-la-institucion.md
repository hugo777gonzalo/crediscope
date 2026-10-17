# Propuesta: un tema, una fuente (el buró de la institución)

Propuesta del 2026-10-13. **No cambia nada todavía**: ni lo que se consulta, ni lo
que lee el modelo, ni las pantallas. Sale de dos cosas: lo que el negocio respondió
ese día al bloque A y a la F1 del cuestionario de decisiones
(`research/decisiones/`, fuera de git) y lo que se midió sin gasto sobre las 22
personas con consulta de Equifax. Sin cédulas ni montos: sólo conteos.

Contexto: `docs/propuesta-estructura-equifax.md` (las tablas y la estructura, 126),
`docs/propuesta-marco-equifax.md` (cómo entraría Equifax al modelo) y
`docs/equifax-pedido-de-diccionario.md`.

## 0. Lo que decidió el negocio (2026-10-13)

| N.º | Pregunta | Respuesta |
|---|---|---|
| A1 | Qué parte de Novadata se apaga cuando hay buró | **La deuda del sistema financiero** (saldos, calificación, atraso). Y **una sección de configuración para dejar de consultar** en Novadata las fuentes que ya trae Equifax, Aval u otro buró |
| A2 | Orden entre burós | **Un solo buró por IFI**: la institución nos da sus credenciales y nosotros traemos la información, la mandamos al modelo con el marco ajustado y respondemos. No hay orden entre Equifax y Aval: hay *el* buró de la institución |
| A3 | ¿Equifax entra al modelo? | Sí, después de A1 y del diccionario |
| A4 | Lugar en el orden de importancia | **Después de las listas de control estrictas** (lista negra). El negocio va a validar cuántos niveles hay: ver la sección 4 |
| A5 | Cuándo se consulta a Equifax | **A**: el análisis lee lo guardado; se consulta a mano, por persona |
| A6 | ¿El analista ve el Score de Equifax? | Sí, separado del Score de CrediScope, en **una pantalla propia como la de Aval**, con un reporte |
| A7 | El rótulo «Garantías:» del marco | Cambiarlo a **«Deuda como codeudor o garante»** |
| A8 | La comparación con y sin Equifax (unos USD 1) | El negocio sube el tope, **pero sólo con todo listo**: la estructura afinada y el marco nuevo |
| F1 | Aval en el Expediente | **No**: Aval y Equifax son dos pantallas aparte, parecidas pero no iguales; una IFI usa una u otra |

### Lo que decidió el negocio sobre esta propuesta (2026-10-16)

| Pregunta (sección 6) | Respuesta |
|---|---|
| Qué se apaga de Novadata | **Nada se deja de consultar**: Novadata se consulta entera, como hasta ahora. Lo que el buró repite sólo deja de ir al modelo (capa 2). La capa 3 (dejar de consultar) no se construye |
| A4, el lugar del buró en el marco | **En lugar de los niveles 3 y 4** (bancos y cooperativas) |
| El nombre del selector | **«Buró»** |
| Las casas comerciales | **Se suman**: «veamos cómo nos va sumando» |
| La calificación A1 a E | Se reemplaza por **días de mora** |
| El reporte | **PDF** |
| Las pantallas | Proceder con el diseño de la sección 5: moderno, preciso, informativo y fácil de leer, **con las explicaciones largas en ayudas emergentes** |

**El lado del modelo, construido el 2026-10-16 como `marco-v31`, apagado**
(`CONFIG_LLM.buroDeLaInstitucion`): la capa 2 en `_shared/` (el perfil del modelo
con `buroEquifax` en lugar de bancos y cooperativas, y una persona sin buró igual a
hoy byte a byte: 2.813 de 2.813) y su sección del marco en lugar de los grupos 3 y
4. Lo construido, lo medido y cómo encenderlo: `docs/propuesta-marco-equifax.md`.

**Construido el 2026-10-16** (las pantallas y la capa 1):

- **Capa 1, migración 129**: `proveedores.es_buro` (a lo sumo uno, sólo Aval o
  Equifax), `elegir_buro()` y el selector «Buró» arriba de las pestañas de Aval y
  de Equifax en Configuración › Fuentes que consultamos. Esta base nace con
  Equifax como buró. Elegirlo no prende ni apaga consultas.
- **La pestaña Equifax** (`/equifax/:cedula`), como la de Aval y aparte del
  Expediente (F1): cabecera con lo grave, cuatro indicadores (Score de Equifax,
  deuda como titular, en atraso hoy, cuota mensual), la deuda por sistema con lo
  de codeudor o garante aparte, la franja de 24 meses, las operaciones y el resto
  plegado. Las explicaciones van en `InfoTooltip`, que ahora también se abre con
  el dedo y con el teclado.
- **El reporte en PDF**: la misma pantalla impresa, con todo abierto y un
  encabezado (qué es, de cuándo, quién lo sacó). Queda en la auditoría
  (`exportacion.reporte_equifax`, 129).
- **El menú** dice «Buró» (antes «Aval») y lleva al buró de la institución
  (`/buro/:cedula`); la pestaña de cada persona dice su nombre (Equifax o Aval).
- **Sin botón para consultar a Equifax**: la pestaña sólo muestra lo guardado. Ver
  la pregunta abierta en `docs/pendientes.md`.

## 1. Lo medido: Equifax contra el buró de Novadata

Se comparó cada consulta de Equifax (las 22, todas de producción) con el último
perfil de Novadata de la misma persona. **Los 22 perfiles son de hasta 30 días
antes** que la consulta a Equifax: parte de cada diferencia puede ser tiempo y no
fuente. Del lado de Novadata, el buró de bancos contestó para las 22, el de Diners
para las 22 (20 con datos), el de cooperativas para las 22 (11 con datos) y el de
casas comerciales para las 22 (12 con datos).

Se repite con `node scripts/medir-solapamiento-equifax.mjs` (sólo lee, no cobra).

| Qué | Bancos y Diners | Cooperativas | Comercial (Equifax) contra casas comerciales (Novadata) |
|---|---|---|---|
| Quién tiene deuda propia | las dos en 22 | las dos en 11, ninguna en 11 | las dos en 12, **sólo Equifax en 9**, ninguna en 1 |
| Saldo igual (hasta 1%) | **15** | **8 de 11** | **0 de 12** |
| Cerca (hasta 10%) | 4 | 2 | 0 |
| Distinta (hasta 30%) | 1 | 1 | 0 |
| Muy distinta (más de 30%) | 2 | 0 | **12** |
| Cuando difieren, mayor en | Equifax 5, Novadata 2 | Equifax 3 | Equifax 5, Novadata 7 |
| Monto en atraso hoy | las dos 4, ninguna 18 | las dos 4, ninguna 18 | las dos 2, sólo Equifax 4, sólo Novadata 1 |
| Ese monto, si las dos lo tienen | cerca 2, distinta 2 | igual 3, distinta 1 | distinta 2 |
| Mora sin monto vencido (sólo Equifax lo ve) | 7 | 1 | — |
| Calificación o días de mora | **19 de 22 dicen lo mismo**; en 3 la calificación de Novadata es peor (B2 y C1 con 1 a 30 días) | **10 de 11** en el mismo tramo de días (1: 31 a 90 contra más de 90) | no comparable: son otras empresas |
| Número de operaciones | Equifax trae más en 19 (cuenta cada tarjeta), igual en 3 | igual 17, Equifax más 3, Novadata más 2 | Equifax más 16 |
| Demanda judicial / cartera castigada | sólo Equifax 1 / sólo Equifax 1 | ninguna | — |
| Cuota mensual | **Equifax la trae en 22**; Novadata no la trae | las dos en 11: igual 2, cerca 5, distinta 4 | Equifax en 21 |
| Deuda como codeudor o garante | ninguna 6, igual 3, cerca 4, **distinta 6, sólo Novadata 3** | **Equifax en 4**; Novadata no la mide | ninguna |
| El detalle de Equifax cuadra con su total | 22 de 22 | 21 de 22 | 16 de 22 |

**El sector comercial de Equifax y las casas comerciales de Novadata son otras
empresas.** Entre las 22 personas aparecen 33 empresas acreedoras: **5 en las dos**
(Kywi, Comohogar, Pycca, Gala Importaciones y NovaCredit), 10 sólo en Equifax
(telefonía: Conecel en 11 personas y CNT; De Prati en 4; Yanbal, Trecx...) y **18
sólo en Novadata** (distribuidoras, importadoras, alimentos, repuestos y autos). La
misma empresa en las dos fuentes, para la misma persona, se repite 7 veces.

**Préstamos del IESS/BIESS** (Novadata los trae en una fuente aparte; Equifax los
incluye en bancos cuando el acreedor es el BIESS): las dos en 4, sólo Novadata en 3,
sólo Equifax en 1, ninguna en 14.

**Aval no se puede medir**: no hay ninguna consulta de producción. Las 240 que hay
son del ambiente de prueba, que contesta por otra persona.

### Qué dice esto

1. **Bancos y cooperativas son el mismo tema en las dos fuentes**, y Equifax lo
   cubre con más: la cuota de los bancos (Novadata no la trae), 24 meses de
   historia, lo de codeudor o garante en cooperativas, y la mora que todavía no
   tiene monto vencido (7 personas). Se puede apagar la lectura de Novadata ahí.
2. **Se pierde la calificación de la Superintendencia (A1 a E).** Equifax no la
   trae en ninguna de sus 58 listas (su `tipo_riesgo` es el rol, no una
   calificación). Se reemplaza por los días de mora, que dicen lo mismo en 19 de 22.
   Hoy la calificación la usan tres lugares, y los tres tienen que pasar a días
   antes de apagar nada: el marco (`peorCalificacionRiesgo`), la bandeja y Monitoreo
   (`resumen_por_persona`, 124: la marca «D o E») y el Laboratorio (la definición de
   impago, 110: «bancos D o E»; la de «más de 90 días» ya es por días).
3. **El comercial no se apaga.** Apagar las casas comerciales de Novadata cuando hay
   Equifax perdería las 18 empresas que Equifax no trae; sumar las dos sin cuidado
   contaría dos veces las 7 repeticiones. Va la suma **sin repetir empresa**.
4. **Lo de codeudor o garante en bancos coincide poco** (6 distintas, 3 sólo en
   Novadata). Puede ser cómo marca cada una el rol: va al pedido de diccionario
   antes de confiar en una sola.
5. **Los préstamos del IESS/BIESS se quedan en Novadata.** El endeudamiento del
   perfil del modelo no los suma (sólo los cuenta), así que no hay doble conteo con
   los del BIESS que Equifax trae dentro de bancos.

## 2. La regla: un tema, una fuente

Con A2 no hay orden entre burós: cada institución tiene **un** buró (o ninguno), y
como cada institución tiene su propia base (`clientes/directorio.json`), el buró es
una propiedad de la base. La regla es por tema:

| Tema | Si la persona tiene una consulta vigente del buró de la institución | Si no la tiene |
|---|---|---|
| Deuda, atraso, demanda y castigo en bancos y Diners | El buró | Novadata (bancos y Diners) |
| Lo mismo en cooperativas | El buró | Novadata (cooperativas) |
| Calificación de riesgo (A1 a E) | No existe: **días de mora** del buró | Novadata |
| Cuota mensual | El buró (los tres sistemas) | Novadata (sólo cooperativas) |
| Deuda como codeudor o garante | El buró (los tres sistemas) | Novadata (sólo bancos) |
| Casas comerciales | El sector comercial del buró **más** las casas comerciales de Novadata de las empresas que el buró no trae | Novadata |
| Préstamos del IESS/BIESS | Novadata (fuente aparte; no se suman a la deuda) | Novadata |
| Historia de 24 meses, tarjetas, consultas recibidas, Score de Equifax | El buró | No existe |
| Registro de deudores, historial con Novadata, demandas, IESS, SRI, listas | Novadata (no cambia) | Novadata |

**«Consulta vigente»**: de producción, de la misma persona, hasta el 17 del mes
siguiente (`_shared/vigencia-mensual.ts`) y anterior a la fecha del análisis. Una del
ambiente de prueba no sirve para calificar a nadie.

Lo que el buró reemplaza **se sigue guardando** en el perfil de Novadata (es
evidencia de lo que contestó), pero nadie lo lee para decidir: ni el modelo, ni la
bandeja, ni el Laboratorio, ni la pantalla principal.

## 3. Dónde vive el interruptor: tres capas

1. **Cuál es el buró de la institución.** Uno por base. Ya existe `proveedores`
   (067, 077), con una fila por fuente de datos que se prende y se apaga desde
   Configuración. Se propone que **a lo sumo uno** de los burós (Aval, Equifax) esté
   prendido, con una restricción en la base y no sólo en la pantalla, y que ése sea
   el buró de la institución. Es una migración (toma su número al aplicarse).
2. **Qué se lee.** Una sola función en `_shared/` que, para una persona, dice de
   qué fuente sale cada tema (la tabla de la sección 2). La usan el perfil del modelo,
   la pantalla y los guiones del Laboratorio; `resumen_por_persona` es SQL y necesita
   su propia migración que lea `consultas_equifax.estructura`. **Esta capa es la que
   hace que la comparación con y sin Equifax no mida la deuda dos veces.**
3. **Qué se consulta en Novadata** (la sección de configuración de A1). También
   existe: `novadata_resource_config` (006), en Configuración › Fuentes que
   consultamos, apaga una fuente y deja de pedirse. Se propone una tarjeta arriba,
   «Lo que ya trae el buró de la institución», con las tres fuentes que el buró cubre
   (bancos, Diners y cooperativas), lo medido y el interruptor. Las casas comerciales
   no van en la tarjeta: el buró no las cubre.

**Un cuidado con la capa 3.** Con A5 = A, Equifax se consulta a mano y la mayoría de
las personas no lo va a tener. Si se deja de consultar el buró de Novadata, esas
personas quedan **sin ningún buró**: el perfil marca la fuente como no medida
(`fuentesNoMedidas`) y el modelo de hoy lo lee como un tema clave sin consultar y
acerca el score al centro. Consultar Novadata no le cuesta al negocio (2026-10-03).
Por eso se propone:

- la tarjeta deja apagar esas fuentes sólo si la institución consulta su buró a
  **todas** las personas (A5 = B o una política equivalente), y lo dice al lado
  del interruptor;
- mientras tanto, la regla «un tema, una fuente» se aplica en la capa 2: Novadata
  se sigue consultando y se lee sólo cuando no hay buró.

## 4. Lo que cambia en la propuesta del marco

`docs/propuesta-marco-equifax.md` se escribió antes de estas respuestas y trataba a
Equifax como **una segunda lectura** de la misma deuda («usá endeudamiento para
cuánto debe y buroEquifax para el comportamiento»). Con A1 eso cambia:

- **Equifax reemplaza** a los grupos de bancos y de cooperativas cuando la persona lo
  tiene: el perfil del modelo no lleva los campos de Novadata que el buró cubre (no
  van en `null`: no van), y `endeudamiento` se calcula desde el buró más las casas
  comerciales que el buró no trae.
- **La calificación se reemplaza por los días de mora**, con los criterios que el
  marco ya usa (la calificación de la Superintendencia es por días).
- El tema de disponibilidad «buró de crédito de bancos» cuenta como consultado
  cuando lo trae el buró, aunque la fuente de Novadata no se haya pedido.
- **El lugar (A4).** El marco vigente (marco-v28) tiene **15 niveles**: 1 listas
  (control, lista negra, SERCOP), 2 seguridad ciudadana, **3 bancos, 4 cooperativas**,
  5 demandas de cobro, 6 demandas civiles, 7 antecedentes penales, 8 ingresos,
  trabajo y tributario, 9 seguridad social, 10 patrimonio, 11 familia, 12 identidad,
  13 contacto, 14 tránsito y 15 historial con Novadata. Los niveles 1 y 2 son los dos
  controles de bloqueo. Opciones:
  - **a) (recomendada)** el buró **en lugar de 3 y 4**, justo después de los dos
    controles de bloqueo: es donde ya está la deuda y no cambia el orden del resto;
  - b) como nivel 2, antes de seguridad ciudadana.
- **A7**: «Deuda como codeudor o garante» en lugar de «Garantías:».
- Sigue siendo una versión nueva (el número libre cuando se haga: `marco-v30` lo
  tomó E27 el 2026-10-16), con su fila en
  `scoring_rules_versions`, y la comparación espera a A8: el negocio sube el tope
  cuando todo esté listo.

## 5. Las pantallas (propuesta de diseño, sin construir)

Con F1, Equifax tiene **su propia pestaña**, como Aval, y una institución ve sólo la de
su buró. Primera vista, de arriba abajo:

1. **Encabezado**: «Equifax · consultado el 12/10/2026 · vigente hasta el 17/10/2026».
   Sin consulta: un aviso que dice qué falta y que cada consulta se cobra. El botón
   «Consultar a Equifax» sólo para administración y sólo si no hay una vigente (A5).
2. **Score de Equifax**: el número, la banda y cómo cambió en 12 meses, con la línea
   «Es el score de Equifax, no el Score de CrediScope». Al lado, el score de
   sobreendeudamiento con su nivel.
3. **Cuánto debe como titular**: total y por sistema (Bancos, Cooperativas, Sector
   comercial), con por vencer, vencido, en demanda y castigado, y la cuota mensual.
   Debajo, aparte: **Deuda como codeudor o garante**. Si un sistema no cuadra con el
   total de Equifax, se dice en esa fila.
4. **Cómo pagó en los últimos 24 meses**: una franja de 24 meses («Ago 2026»...), cada
   uno con el peor atraso de ese mes (al día, 1 a 30, 31 a 90, más de 90 días), y
   «Meses con mora: 3 de 24 · Más de 90 días: 0 · Última mora: May 2026».
5. **Operaciones**: institución, sistema, tipo, saldo, vencido, días de mora y cuota;
   primero lo propio, después lo de codeudor o garante.
6. **Plegado, «Ver reporte completo»**: tarjetas, evolución a 6 y 12 meses, créditos
   refinanciados y reestructurados, entidades que la consultaron (sin NovaCredit),
   estado de cartera según Equifax, actividad económica (SRI) y las estimaciones de
   Equifax rotuladas «no se usan en el análisis».
7. **El reporte (A6)**: «Descargar reporte», la misma pantalla en una versión para
   imprimir o guardar en PDF.

En **Configuración › Fuentes que consultamos**: una pestaña Equifax (como la de Aval),
el selector del buró de la institución y, en la de Novadata, la tarjeta de la capa 3.

## 6. Lo que tiene que decidir el negocio

1. **A4**: el buró en lugar de los niveles 3 y 4 (recomendada) o como nivel 2.
2. **El nombre del selector** (un nombre nuevo se propone con opciones):
   «Buró de la institución» (recomendado: dice de quién es), «Buró contratado» o
   «Buró de crédito de la IFI».
3. **Las casas comerciales**: sumar el sector comercial del buró y las de Novadata sin
   repetir empresa (recomendado) o mostrarlas como dos grupos separados.
4. **La calificación**: aceptar los días de mora en su lugar; en el Laboratorio, la
   condición «bancos D o E» pasa a «más de 90 días» para quien tenga buró.
5. **El reporte**: PDF desde la pantalla (recomendado) o Excel.
6. **Dejar de consultar Novadata** (capa 3): sólo cuando la institución consulte su
   buró a todas las personas.

## 7. En qué orden se construiría

1. **Hecho (2026-10-16).** La capa 2 en `_shared/` con sus pruebas: el perfil del
   modelo de una persona **sin** buró sale idéntico, byte a byte, al de hoy.
2. **Hecho (2026-10-16).** El marco nuevo, `marco-v31`, con la sección de Equifax
   ajustada a la sección 4. No se activa: la comparación espera a A8.
3. **Hecho (2026-10-17).** `resumen_por_persona` a días de mora: la 132, aplicada
   (`docs/propuesta-dias-de-mora-con-buro.md`). La definición de impago del
   Laboratorio ya juzga por días: no necesitó migración. El resultado por el buró en
   el t1 espera a la primera carga real.
4. La capa 1 (un buró por base) y la tarjeta de la capa 3.
5. La pestaña de Equifax y su reporte, con la revisión de UX en el navegador.
