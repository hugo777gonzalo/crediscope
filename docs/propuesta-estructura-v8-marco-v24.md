# Propuesta: estructura-v8 y marco-v24 — lo que mostraron los primeros análisis con v23

Estado: **implementado y desplegado el 2026-09-27** (migración 087, seis
funciones, 2.567 perfiles recalculados). Resultado en la sección 7.

## 1. De dónde sale

El negocio corrió marco-v23 sobre c-2a50c228, c-3293f7eb y c-64955685. La
tercera salió bien (la respondió Sonnet). Las otras dos las respondió
Haiku, el modelo base de la cascada, y trajeron:

- un punto en inglés;
- el bloqueo explicado con nombres de campos ("enListaNegra=true con
  bloqueante=true", "fuerza un score de 1");
- positivos que el marco ya prohíbe ("sin antecedentes penales", "sin
  deudas de tránsito");
- contradicciones en la deuda.

Revisado contra el crudo de Novadata, **la mayoría de los errores de
contenido son de nuestra estructura** (process.ts): el modelo leyó bien lo
que le mandamos, y lo que le mandamos estaba incompleto. Todo medido sobre
el crudo de los 2.567 clientes reales.

## 2. Errores de la estructura (estructura-v8)

### 2.1 Buró de bancos y Diners

**"No devenga intereses" no se lee.** El registro trae el saldo por
vencer (`saldoVigente`), el vencido (`saldomora` / `mora` y tramos por
antigüedad), la cartera que no devenga intereses (`noDevengaInteres`), la
demanda judicial y el castigo. El perfil sólo suma por vencer y mora.
- 71 operaciones en atraso tienen su monto en "no devenga": **56 personas
  con $626.743 figuran con $0 en mora**.
- Caso: Produbanco E en c-3293f7eb, $28.252 que no devengan. El modelo
  vio "E con $0 en mora" y lo marcó como contradicción, con razón.

**Error de código:** `saldomora ?? mora` no cae a `mora` cuando
`saldomora` vale 0, porque 0 no es null. Hay 2 operaciones así.

**Garante y codeudor sumados como deuda propia.** La columna `riesgo`
distingue titular (T, 8.637 filas), garante (G, 171) y codeudor (C, 317).
El perfil suma todo.
- 319 personas figuran como garante o codeudor, por $73,8 millones.
- **En 125 personas la peor calificación viene de una operación que
  garantizan**; en 18 de ellas es D o E. El modelo concluye que no
  pagaron cuando quien no pagó es otra persona.

**Calificación "AL".** 62 operaciones (45 como titular) traen una
calificación fuera de la escala. El orden alfabético la ubica entre A3 y
B1. Las 62 están al día: todo su saldo es por vencer ($1,49 millones) y
tienen cero en cualquier columna de atraso.

**Sin días de mora ni cuota.** El registro de bancos no trae días de mora
por operación ni cuota mensual. La calificación es el único indicador de
días de atraso (la Superintendencia la define por días de atraso).

**Propuesta:**
- `comportamientoBancario` cuenta sólo lo **propio** (titular) en los
  campos que ya existen: número de operaciones, peor y mejor calificación,
  saldo vigente, saldo en mora, demanda y castigo.
- Se agrega:
  - `saldoNoDevengaIntereses` (propio);
  - `deudaEnAtraso` (propio: vencido + no devenga + demanda + castigo);
  - `numeroOperacionesComoGaranteOCodeudor`, `deudaComoGaranteOCodeudor`
    y `peorCalificacionComoGaranteOCodeudor`.

  Es lo mismo que ya se decidió para Aval en la migración 080: como
  titular y como codeudor o garante, por separado.
- `saldoEnMoraBuroCredito` toma `saldomora` y, si viene en 0, `mora`.
- "AL" cuenta como sin atraso: no puede ser la peor calificación, pero
  queda con su nombre si es la única.
- Una operación en atraso sin ningún monto (hay 2 en la cartera, ambas E)
  se informa como "calificación E sin monto informado".

### 2.2 Retail (casas comerciales)

Es otra fuente, no el buró, y el perfil no separa lo vencido
(`valorVencido`) del total. **85 personas tienen deuda retail vencida.**
En c-3293f7eb los $763,84 están vencidos hace 960 días, y el modelo los
llamó "vigentes".

**Propuesta:** se agrega `valorVencidoRetail`, y el marco explica que el
retail es una fuente aparte del buró.

### 2.3 Cooperativas

- `diasMoraMaxima` es el atraso **a la fecha del corte**, no uno
  histórico. El modelo lo leyó como histórico ("actualmente sin mora") en
  c-2a50c228, que tiene 10 días de atraso vigente en una operación de
  $69.437.
- **693 de 747 operaciones informan la cuota mensual** (`val_cuota_credito`)
  y el perfil no la lee. En c-2a50c228 son $2.294 al mes, contra un
  ingreso declarado de $1.000.

**Propuesta:** se agrega `cuotaMensualTotal`, y el marco dice que los días
son al corte.

### 2.4 Demandas crediticias

La clasificación busca palabras clave como subcadenas, sin respetar
palabras completas:

| Tipo de demanda | Casos | Palabra que la hace entrar |
|---|---|---|
| "Divorcio por mutuo consentimiento" | 17 | MUTUO |
| "Daño moral" | 11 | MORA |
| "Ejecución por silencio administrativo" | 7 | EJECUCIÓN |
| Pensión y alimentos (incluido el caso de c-3293f7eb) | 2 | ACTA DE MEDIACIÓN, OBLIGACIÓN |

Son unos 37 de 941.

**Propuesta:** palabras completas, más exclusiones explícitas (divorcio,
daño moral, alimentos y pensión, silencio administrativo). Por decisión
del negocio siguen siendo crediticias "Incumplimiento de contrato" y
"Cobro de honorarios".

### 2.5 Pensión alimenticia

La fuente repite cada proceso (c-2a50c228 tiene 3 procesos en 12
registros). El perfil:
- toma la deuda **mayor, no la suma**: 13 personas con la deuda
  subestimada;
- no dice cuántas pensiones tiene la persona ni cuánto paga por mes.

Además, 85 personas tienen pensiones al día con pago mensual de $0: ya no
son un gasto.

**Propuesta:**
- Se deduplica por número de proceso.
- Se agregan `numeroPensionesAlimenticias`, `numeroPensionesVigentes` (con
  pago mensual), `valorMensualPensiones` (suma de las vigentes) y
  `numeroPensionesEnMora`.
- `deudaPensionAlimenticia` pasa a ser la suma.

### 2.6 Préstamos IESS/BIESS

`numeroCreditosFormales` cuenta los préstamos quirografarios e
hipotecarios del IESS/BIESS. En c-3293f7eb son 6, como las 6 operaciones
del buró, y el modelo las mezcló ("6 operaciones formales").

**Propuesta:** en el perfil del modelo se llama `numeroPrestamosIessBiess`.
El nombre guardado queda, como `pisoIngresoMensualReportado`.

### 2.7 Deuda total

No hay una deuda total del sistema. El modelo presentó $258.798 (bancos y
Diners) como "la cartera vigente" de c-2a50c228, sin los $84.778 de
cooperativas.

**Propuesta:** el perfil del modelo agrega un bloque `endeudamiento`:
- deuda propia total (bancos + Diners + cooperativas + retail);
- deuda en atraso total;
- deuda como garante o codeudor;
- cuota mensual conocida (sólo cooperativas: los bancos no la informan, y
  el marco lo dice).

## 3. Cambios en el marco (marco-v24)

1. **Escribir siempre en español.** Hoy no lo exige en ningún lado; sólo
   la plantilla del razonamiento dice "en español".
2. **El bloqueo en lenguaje de política de crédito.** Por ejemplo: "No
   califica para crédito: figura en la lista negra interna, que la
   política de crédito excluye". Prohibido mencionar el score forzado, el
   "control de bloqueo", "determinístico", "bloqueante" o nombres de
   campos. Se reescribe también el propio texto del marco que hoy lo
   explica así.
3. **Ausencias triviales.** A la lista de las que nunca se informan se
   suman la licencia de conducir vigente y los puntos de la licencia.
4. **Orden por peso.** Positivos y negativos de mayor a menor, siguiendo
   el orden de los grupos. Tránsito, contacto y familia van al final.
5. **Deuda.** Juzgar con el bloque `endeudamiento`:
   - lo propio pesa en comportamiento;
   - lo garantizado es un riesgo contingente, no un mal comportamiento
     propio;
   - "no devenga intereses" es deuda en atraso;
   - la calificación resume días de atraso;
   - la cuota conocida de cooperativas se compara con el ingreso
     reportado, diciendo que la de bancos no se conoce.
6. **Pensiones.** Las que tienen pago mensual son un gasto fijo (con su
   monto); las al día con $0 son historial y no se cuentan como gasto.
7. **Cooperativas.** Los días de mora son al corte, no históricos.

## 4. Modelo

Decisión del negocio: **Sonnet para todos los análisis**. Se retira la
cascada con Haiku; la franja de 500–760 deja de aplicar. La cascada se
había validado sólo por coincidencia de scores (36 casos), no por calidad
del texto, y el texto final de los casos claros lo escribía Haiku.

Costo: ~$0,04 por análisis en vez de ~$0,02. El marco sigue cacheado.

## 5. Decisiones del negocio (2026-09-27)

- Garante y codeudor por separado, como en Aval.
- "Incumplimiento de contrato" y "Cobro de honorarios" son crediticias.
- Pensiones: sólo las que tienen pago mensual cuentan como gasto.
- Sonnet para todo.
- "AL": se pidió ver sus días de mora. La fuente no los trae, pero las 62
  no tienen ningún monto en atraso: se leen como sin atraso.

## 6. Cómo se aplicaría

1. estructura-v8 en process.ts (2.1 a 2.5), con las etiquetas nuevas en la
   pantalla del Perfil del Cliente.
2. Perfil del modelo: el bloque `endeudamiento` y el nombre
   `numeroPrestamosIessBiess`.
3. marco-v24 y Sonnet como modelo único.
4. Migración:
   - la fila `marco-v24`;
   - los campos nuevos en la configuración de campos.
5. Recalcular los 2.567 perfiles desde el crudo local, sin consultar
   Novadata. Hay que generalizar `recalcular-fuentes-ingreso.mjs` para
   que reemplace los grupos que cambian.
6. Validación sin el modelo, sobre la cartera:
   - las 56 personas con "no devenga" ahora muestran deuda en atraso;
   - las 125 peores calificaciones prestadas desaparecen;
   - 0 falsos positivos conocidos en demandas;
   - las pensiones se suman bien.
7. Desplegar. Después, el negocio corre los 14 casos elegidos con Sonnet.

## 7. Resultado (2026-09-27)

**Comparación v7 contra v8 sobre el crudo de los 2.567 clientes:** fuera
de los cuatro grupos corregidos no cambió nada.

- **Mora que no se veía:** 40 personas que figuraban con $0 en mora ahora
  muestran su deuda en atraso.
- **Peor calificación prestada:** 16 personas dejan de cargar una E que
  era de otra persona.
- **Pensiones:** 13 corrigen su deuda (suma en lugar del máximo).
- **Demandas que dejan de ser crediticias:**
  - las previstas: divorcios, daño moral, alimentos y pensión, silencio
    administrativo;
  - además "abuso de confianza", que es un delito penal y entraba sólo
    porque CONFIANZA contiene FIANZA.
- **Demandas que pasan a crediticias:** 4 cobros de tarjeta de crédito,
  que antes no entraban porque "LIQUIDACION" venía sin tilde.
- **Un tropiezo que se corrigió antes de escribir:** las palabras
  completas dejaban afuera plurales que sí son crediticios ("FACTURAS",
  "CHEQUES", "CONTRATOS PRENDARIOS"). Se agregaron explícitos, no con una
  S opcional, que volvía a traer "PRENDAS DE VESTIR".

**Implementado:**
- estructura-v8 en process.ts.
- El bloque `endeudamiento` y `numeroPrestamosIessBiess` en el perfil del
  modelo, que además redondea a centavos los montos de perfiles viejos.
- marco-v24.
- Sonnet como único modelo.
- Migración 087: la fila `marco-v24`, 20 campos nuevos en la
  configuración, y la métrica gerencial de mora leyendo `deudaEnAtraso`.
- Etiquetas en la pantalla del Perfil del Cliente.

**Recalculado:** `scripts/recalcular-grupos.mjs` reemplazó los cuatro
grupos en los 2.567 perfiles reales. Todos reprodujeron el guardado fuera
de esos grupos.

**Validación sin el modelo** (`validar-perfil-del-modelo.mjs`, ahora con
8 reglas), sobre los 2.807 perfiles: **0 fallas**. El mensaje al modelo
pasó de 6.884 a 7.478 caracteres de mediana.

**En la base:**
- 72 personas con deuda en atraso en el buró (48 por no devenga);
- 319 garantes o codeudores, ahora aparte;
- 52 con peor calificación propia D o E;
- 75 con retail vencido;
- 501 con cuota de cooperativas;
- 114 con pensiones vigentes.

La métrica gerencial de mora cuenta 88 personas. Tres personas cuya única
calificación es "AL" la muestran con su nombre.

**Casos de la revisión:**
- c-3293f7eb muestra $28.252,63 en atraso (la E de Produbanco), el
  retail de $763,84 vencido, 6 préstamos IESS/BIESS con su nombre, 0
  demandas crediticias (el incidente de pensión pasó a civil) y 2
  pensiones vigentes por $717,16 al mes.
- c-2a50c228 muestra $343.577 de deuda propia total y $2.294 de cuota
  conocida.
