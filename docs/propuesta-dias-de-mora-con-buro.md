# Propuesta: los días de mora del buró en Monitoreo y en el Laboratorio

Propuesta del 2026-10-16. **El negocio aprobó lo recomendado ese mismo día** (1a, 2a,
3a, 4a y 5a de la sección 4), y quedó construida como la migración 132, sin aplicar
(sección 6). Es el paso 3 de
`docs/propuesta-buro-de-la-institucion.md` (sección 7): las dos lecturas en SQL que
todavía usan la calificación A1 a E de Novadata pasan a días de mora para la persona
con una consulta vigente del buró de la institución. Equifax no trae esa calificación
(sección 1 de esa propuesta). El negocio aceptó los días de mora en su lugar el
2026-10-16 (decisión 4).

Se midió sin gasto sobre las 62 personas con consulta de Equifax: todas de producción
y vigentes hasta el 17/10. Sólo conteos, sin cédulas ni montos. Se repite antes y
después de la migración con `node scripts/medir-dias-de-mora-con-buro.mjs`, que sólo
lee.

## 0. En corto

| Lectura | Hoy | Con buró (propuesta) | Medido en las 62 |
|---|---|---|---|
| Marca «Calificación baja en buró (D/E)» de Monitoreo | peor calificación propia de bancos y Diners D o E (Novadata) | **más de 90 días de mora en bancos como titular** (Equifax) | **2 y 2, las mismas personas**: 0 diferencias |
| Marca «Mora bancaria o en cooperativas» de Monitoreo | monto en atraso en bancos o cooperativas (Novadata) | el mismo monto, leído del buró | 7 y 6: **1 diferencia** (Novadata vio monto; Equifax, días después, días de mora sin monto) |
| Definición de impago del Laboratorio | «más de 90 días» o «bancos D o E» | **ya está escrita por días**: no cambia | 0 solicitudes reales (no hay ninguna carga real) |

Dos hallazgos cambian lo que se esperaba:

1. **La bandeja no muestra ninguna de las dos marcas.** Las lee sólo Monitoreo
   (`metricas_gerenciales()`, la tarjeta de riesgo). La vista `bandeja_solicitudes`
   no tiene esas columnas y ninguna pantalla las lee de otro lado.
2. **La definición de impago (110) ya juzga por días** a toda operación que trae días.
   «Bancos D o E» sólo se aplica a una operación que trae calificación, como las de
   Novadata. Se probó contra la definición vigente con operaciones inventadas: bancos
   con 91 días y sin calificación da impago; con 90 días, no. Lo que falta en el
   Laboratorio no es SQL: es que la reconsulta traiga las operaciones del buró, y eso
   necesita una consulta paga a Equifax por solicitud (sección 3).

## 1. Lo medido

Los 62 perfiles de Novadata son de 8 a 14 días antes que la consulta a Equifax: parte
de cada diferencia puede ser tiempo y no fuente.

### La marca «D o E»

| Qué | Personas |
|---|---|
| Novadata: peor calificación propia D o E | 2 |
| Equifax: más de 90 días de mora en bancos como titular | 2 |
| Las dos (las mismas personas) | 2 |
| Sólo una de las dos | 0 |
| Equifax: más de 90 días en cooperativas | 3 (2 de ellas sin D o E) |
| Novadata: más de 90 días en cooperativas | 2 |

- **El umbral sale de la norma, no de la medición.** En la tabla de la
  Superintendencia para consumo (la versión 1 de `lab_tablas_calificacion`, 110), D
  empieza a los 91 días en bancos. «D o E» es «más de 90 días». Lo medido sólo
  confirma que Equifax y Novadata no se contradicen en ese corte. Con 2 personas
  marcadas, es poca evidencia: alcanza para no ver una contradicción, no para medir
  una tasa.
- **Diners va dentro de bancos en Equifax**: 103 operaciones de 50 personas, todas en
  el sistema bancos. Es lo mismo que hace Novadata, que arma la calificación con el
  buró de la Superintendencia más el de Diners.
- **Debajo de 90 días las dos fuentes difieren más.** La categoría exacta (los días
  de Equifax puestos en la tabla) coincide en 35 de 62. El tramo de la institución
  (al día, 1 a 30, 31 a 90, más de 90) coincide en 39. En 20, Novadata está en un
  tramo peor; en 3, en uno mejor. Casi todo cae entre «al día» y «1 a 30». Por eso
  conviene un umbral que coincida con una línea de la norma: la marca no se mueve.
- **Sumar cooperativas sería otra marca.** «D o E» nunca miró cooperativas: Novadata
  no trae su calificación. Si la marca pasara a «más de 90 días en bancos o
  cooperativas», tendría que cambiar para todos, con buró o sin él. Con Novadata se
  sumarían 8 personas de la cartera; con Equifax, entre las 62, 2. Queda como opción
  (sección 4).

### La marca «Mora»

| Qué | Personas |
|---|---|
| Novadata: monto en atraso en bancos o cooperativas | 7 |
| Equifax: monto en atraso en bancos o cooperativas (vencido, no devenga, demanda o castigo) | 6 |
| Las dos | 6 |
| Sólo Novadata | 1 |
| Sólo Equifax | 0 |
| Equifax: días de mora sin monto en atraso | 16, **todas de 30 días o menos** |

- **En Equifax, el monto en atraso aparece a partir de los 31 días.** Las 16 personas
  con días de mora y sin monto están todas entre 1 y 30 días. En bancos, quien tiene
  monto está en 31 a 90 (2) o en más de 90 (2). Esto coincide con la norma: en
  consumo, la cuota pasa a vencida después de 30 días.
- **La diferencia es una persona.** Novadata le vio monto en atraso en bancos, y entre
  8 y 14 días después Equifax le ve días de mora, pero de 30 o menos y sin monto. Lo más
  probable es que haya pagado una parte en esos días; no se puede comprobar sin
  volver a consultar.
- Si con buró la marca se leyera por días de mora (cualquier atraso), marcaría a 22
  de las 62: sería otra marca, que dice otra cosa que con Novadata.

### La cartera, hoy

- 2.573 personas reales con perfil. Monitoreo muestra 50 con «D o E» y 103 con
  «Mora».
- **Con la propuesta, Monitoreo no cambia en «D o E» y baja en 1 en «Mora»**, mientras
  las 62 consultas estén vigentes. **El 18/10 a las 00:00 caducan todas**: desde ahí
  las 62 vuelven a leerse de Novadata hasta que haya consultas nuevas. La migración
  deja la regla bien puesta para lo que venga; hoy casi no se nota.
- Buscar la consulta vigente de cada persona cuesta 44 ms para las 2.813 (con el
  índice `consultas_equifax_client_idx`). Sólo se abre la estructura de quien tiene
  una consulta vigente.

## 2. La propuesta para Monitoreo (`resumen_por_persona`, 124)

La persona tiene una consulta vigente del buró de la institución cuando cumple **la
misma regla que el perfil del modelo** (`_shared/buro-de-la-institucion.ts`, marco-v31):

- el buró de la base es Equifax (`proveedores.es_buro`, 129). Con Aval como buró
  todavía no hay lectura: igual que en el modelo, la persona sigue con Novadata;
- de producción, con respuesta 200 y estructura calculada, y no por otra persona;
- la más reciente hasta ahora, hecha desde el 18 a las 00:00 de Ecuador del ciclo en
  curso (vale hasta el 17: `_shared/vigencia-mensual.ts`).

Con esa consulta, `refrescar_resumen_por_persona()` (la única regla de qué se muestra)
lee:

| Columna | Con consulta vigente | Sin ella (como hoy) |
|---|---|---|
| `calificacion_baja` | `deudaActualTitular.bancos.maximoDiasDeMora` mayor que 90 | `peorCalificacionRiesgo` D o E |
| `tiene_mora` | monto en atraso en bancos o cooperativas como titular (vencido, no devenga, demanda o castigo) mayor que 0 | `deudaEnAtraso` de bancos o `saldoEnMora` de cooperativas mayor que 0 |
| `consulta_buro_id` (nueva, al final) | la consulta de la que salieron las dos marcas | null |

Si Equifax no trajo el grupo de bancos (una lista que no vino), la marca queda null
(no medida), no en falso. Pasó en 0 de 62.

**Lo que hace falta para que no quede vieja**:

- **Un disparador en `consultas_equifax`** (al insertar, al actualizar y al borrar).
  Una consulta nueva cambia las marcas de esa persona, y lo mismo rehacer su
  estructura (`equifax_reemplazar_tablas()`). Borrarla es la supresión de un titular
  (115).
- **Un disparador en `proveedores`** cuando cambia `es_buro`: rehace a las personas
  que tienen alguna consulta de producción.
- **La vigencia caduca sin que nada cambie en la base.** La reconstrucción de cada
  noche ya corre a las 00:10 de Ecuador (pg_cron `resumenes-crediscope`). El 18, diez
  minutos después del corte, las consultas caducadas vuelven a Novadata. Durante esos
  diez minutos Monitoreo muestra la marca de una consulta que acaba de vencer: se
  acepta en vez de agregar otra tarea programada.

**El nombre en Monitoreo.** Con buró, la marca deja de ser una calificación. El texto
viene de `metricas_gerenciales()`, así que cambiarlo no toca ninguna pantalla. Las
opciones están en la sección 4.

**Lo que no cambia:**

- El Explorador de Monitoreo (`agregar_por_campo()`) muestra campo por campo el perfil
  de Novadata: la peor calificación sigue siendo lo que dijo Novadata. Es evidencia,
  no una decisión.
- El Expediente sigue mostrando la deuda de Novadata; la del buró está en su pestaña.

## 3. La propuesta para el Laboratorio

**La definición (110) no cambia.** Ya trae las dos condiciones, y cada operación cae
en la que corresponde a lo que trae:

- `dias_mora_mas_de` (90) juzga toda operación que trae días: cooperativas, retail
  y, cuando vengan del buró, bancos;
- `calificaciones_impago` (D, E) juzga sólo la operación que trae calificación: hoy,
  los bancos de Novadata;
- lo mismo con la lista de observación: 15 días o más, o B1 a E.

Se comprobó contra la definición vigente (`lab_operacion_en_default`,
`lab_operacion_en_observacion` y `lab_cayo_en_el_anio`) con operaciones inventadas:

| Operación | Impago | Observación |
|---|---|---|
| Bancos, 91 días, sin calificación | sí | sí |
| Bancos, 90 días, sin calificación | no | sí |
| Bancos, D, sin días | sí | sí |
| Bancos, 15 días / 14 días | no / no | sí / no |

La decisión 4 («bancos D o E» pasa a «más de 90 días» para quien tenga buró) ya se
cumple con la definición tal como está. Falta que la operación del buró llegue con
sus días, y eso pasa antes, en el procesamiento de la reconsulta.

**Lo que falta, y por qué se propone no construirlo todavía:**

- **Hoy no hay ningún caso.** El Laboratorio no tiene ninguna carga real: 0
  operaciones y 0 solicitudes reales, y los 3 cortes son sintéticos. Las 124
  solicitudes sintéticas de personas que tienen Equifax son del ciclo simulado: su
  t1 es inventado con la forma de Novadata. No se les puede mezclar una consulta real
  de Equifax de octubre de 2026.
- **El resultado sale del t1, y el t1 con buró se paga.** La reconsulta de un año
  después es de Novadata, que no le cuesta al negocio. Para que el resultado de una
  solicitud salga de Equifax, hace falta una consulta de Equifax en el t1 por cada
  solicitud: N solicitudes por el precio de la consulta. Lo autoriza el negocio con
  la cifra, cuando haya una carga real.
- **Con Equifax se cuenta por mes, no por operación.** El procesamiento de hoy
  (`eventos-entre-consultas.ts`) sigue cada operación de t0 a t1 para decir si «cayó
  en el año». Una operación de Equifax no se puede seguir así: las listas no traen su
  número (lección del 2026-10-13). En cambio, la consulta del t1 trae 24 meses de
  historia por mes (`equifax_historia_mensual`). «Cayó en el año» sería: algún mes
  entre t0 y t1 con más de 90 días en bancos o cooperativas como titular, y el mes de
  t0 con 90 o menos. Alcanza con **una sola consulta paga por solicitud** (la de t1):
  la historia ya cubre el mes de t0.
- **Un tema, una fuente también en el resultado.** Para esa solicitud, bancos y
  cooperativas salen de Equifax y no se suman los de la reconsulta de Novadata. Retail
  sigue en Novadata: el comercial de Equifax son otras empresas.

Se propone dejarlo diseñado acá, anotado en `docs/pendientes.md` y construirlo con
la primera carga real de una institución con buró, en `scripts/procesar-reconsultas.mjs`
y `_shared/eventos-entre-consultas.ts`, sin migración. Construirlo hoy sería código
probado contra ningún caso. La otra salida es que el simulador plante historias de
Equifax (sección 4, decisión 5).

**Una pregunta que queda abierta**: las variables del Laboratorio salen del perfil de
Novadata del t0 (`lab_catalogo_variables`). Para quien el modelo leyó el buró
(marco-v31 encendido), medir la fuerza de la calificación de Novadata mide algo que el
modelo no vio. Se decide cuando se encienda v31 y haya cortes reales.

## 4. Lo que tiene que decidir el negocio

1. **El umbral de la marca con buró:**
   - **a) (recomendada)** más de 90 días en bancos como titular, Diners incluido. Es el
     equivalente exacto de D o E según la norma, y en las 62 no se mueve nadie;
   - b) más de 90 días en bancos **o cooperativas**. Es otra marca: tendría que
     cambiar también sin buró (con Novadata sumaría 8 personas de la cartera; con
     Equifax, 2 de las 62).
2. **La marca de mora con buró:**
   - **a) (recomendada)** el monto en atraso, igual que con Novadata (6 de 7 iguales;
     la diferencia es de tiempo);
   - b) cualquier día de mora: 22 de 62. Dice otra cosa que con Novadata.
3. **El nombre en Monitoreo** (hoy «Calificación baja en buró (D/E)»):
   - **a) (recomendado)** «Más de 90 días de mora en bancos (D o E)»: dice el umbral y
     sirve para las dos fuentes;
   - b) «Calificación D o E, o más de 90 días de mora»;
   - c) dejarlo como está. Para quien tiene Equifax diría «calificación» sin serlo.
4. **Desde cuándo:**
   - **a) (recomendado)** con la migración, siguiendo `proveedores.es_buro`, sin
     esperar a encender marco-v31. Monitoreo describe a la persona, no la califica: lo
     que tiene que esperar a la comparación (A8) es el modelo. En las 62, la única
     diferencia es una persona en «Mora»;
   - b) junto con encender marco-v31, con una bandera en la base que lean las dos.
5. **El Laboratorio:**
   - **a) (recomendado)** no construir el resultado por Equifax hasta la primera carga
     real con buró. La definición no cambia;
   - b) construirlo ya y validarlo con historias de Equifax plantadas por el simulador.

## 5. Cómo se construye

Una migración, con el número libre al aplicarla (hoy la base está en la 131). Se
aplica con el corredor recién fusionada en `main` (regla 1). No cambia ninguna función
desplegada: no hace falta subir `ESQUEMA_MINIMO` ni desplegar.

1. `corte_vigente_mensual(timestamptz)`: el 18 a las 00:00 de Ecuador del ciclo en
   curso. Es la regla de `vigencia-mensual.ts`, y SQL no puede importar TypeScript:
   es la única copia posible. Para que no se desfase en silencio, la migración
   comprueba con un bloque que da lo mismo en las fechas de `vigencia-mensual.test.ts`,
   y cada archivo nombra al otro.
2. `buro_vigente_de_la_persona(client_id, ahora)`: la de `buro-de-la-institucion.ts`
   en SQL (producción, 200, con estructura, identidad no rechazada, la más reciente,
   dentro del ciclo), sólo si el buró de la base es Equifax.
3. `resumen_por_persona.consulta_buro_id` (al final, con la referencia a
   `consultas_equifax` en `on delete set null`).
4. `refrescar_resumen_por_persona()`, tomada de la base viva (`pg_get_functiondef`):
   cambian sólo las dos expresiones y se suma la columna.
5. Los dos disparadores (sección 2) y `metricas_gerenciales()`, también de la base
   viva, con el nombre que elija el negocio.
6. Comprobación dentro de la misma transacción:
   - una foto del resumen antes;
   - la reconstrucción;
   - fuera de las personas con consulta vigente, ninguna fila distinta;
   - entre ellas, las dos marcas iguales a la regla del buró.

   La duración de la reconstrucción se mide antes y después en una transacción
   revertida, como en la 124.
7. Después: `node scripts/medir-dias-de-mora-con-buro.mjs`. «Monitoreo distinto de
   Equifax en las vigentes» tiene que dar 0 en las dos marcas.
8. CLAUDE.md (la entrada de `resumen_por_persona`) y `docs/pendientes.md`.

## 6. Lo construido y lo probado (2026-10-16)

`supabase/migrations/132_con_buro_las_marcas_de_monitoreo_en_dias_de_mora.sql`, sin
aplicar. Las dos funciones reemplazadas se armaron desde su texto vivo con reemplazos
que tenían que coincidir una sola vez; la viva de `refrescar_resumen_por_persona()`
era la de la 124. Lo que difiere de la sección 5:

- la marca con buró sale sólo para quien tiene un perfil de Novadata, como sin buró:
  son marcas de lo que se sabe de la persona;
- un sistema que Equifax no trajo no cuenta en «Mora», y si no trajo ninguno de los
  dos, la marca queda sin medir (null). Pasó en 0 de 62;
- la foto de antes sale de una reconstrucción con la regla vieja dentro de la misma
  migración: así la comparación final no tropieza con una fila que un disparador
  haya dejado vieja.

Probada entera contra la base enlazada, en una transacción que termina en error y se
revierte. Antes se comprobó con una sonda que no queda nada escrito, y al final que la
base sigue en la 131, sin la columna, las funciones ni los disparadores.

| Prueba | Resultado |
|---|---|
| Comprobaciones de la propia migración (vigencia, una fila por persona, nada distinto fuera de las vigentes, la marca igual a los días) | pasan |
| Personas con las marcas del buró | 62 |
| De ellas, «D o E» / «Mora» | 2 / 6 |
| Monitoreo: «Más de 90 días de mora en bancos (D o E)» / «Mora bancaria o en cooperativas» | 50 / 102 (antes 50 / 103) |
| Una estructura rehecha con 200 días en bancos | el disparador la marca «D o E» |
| Sin buró (`elegir_buro(null)`) | 0 con las marcas del buró; «Mora» vuelve a 103 |
| Equifax otra vez | 62 |
| Vigentes el 17/10 a las 23:59:59 / el 18/10 a las 00:00 | 62 / 0 |
| El rol anónimo ejecuta alguna función nueva | no |
| Reconstrucción, en la misma vuelta de una transacción | antes 1,25 a 1,47 s (una de 2,8); después 1,13 a 1,56 s |

La primera reconstrucción del día, con la caché fría, tardó 5,9 s con la regla de
antes; no se repitió con la nueva. La diferencia entre las vueltas calientes está dentro
del ruido.
