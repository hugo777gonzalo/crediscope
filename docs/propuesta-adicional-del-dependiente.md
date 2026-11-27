# Propuesta: estimar el ingreso adicional del dependiente con sueldo verificado

Pedido del negocio del 2026-11-23, después de decidir A14 (`docs/ingreso-adicional-por-corroborar.md`, 6.1): estimar el adicional de los
dependientes que A14 dejó sin estimar. Hoy la decisión vigente es no estimarlo; esta propuesta es el estudio que podría cambiarla.
**Medido el 2026-11-24 (sección 7): no pasa, y la decisión de A14 queda como está.** Nada se conecta.

## 1. Qué ya se probó, y por qué esto es distinto

- **12.14 y 12.36** (`docs/investigacion-predictor-de-ingresos.md`) entrenaron un modelo propio del extra del dependiente, con el sueldo como
  entrada.
  - La etiqueta fue «todo lo no verificado»: el total validado menos el sueldo recuperado del IESS.
  - En 12.36, hacia adelante: AUC de 0,687 para «tiene extra» (0,624 con RUC activo) y R² del monto de 0,01.
  - Sumar el extra estimado empeoró el tramo del total. No pasó la regla (AUC de 0,75 y R² de 0,25).
- **A14** midió que tampoco sirven `ingreso-v2` (el modelo de independientes) ni la cifra de Equifax.
- **Lo que no se usó en ninguno: de qué está hecho el adicional.** En AWS cada ítem de ingreso del titular trae:
  - su fuente: IESS, cuentas, IVA, RUC, otros, arriendos, jubilación o giros;
  - sus montos por tipo: declarado, banco principal y secundario, IVA e IVA semestral;
  - la observación del analista, que marca el recuperado del IESS y el predictor;
  - `estado`, el check de la pantalla de AWS con que el analista elige qué ítems cuentan para el total.
- **Medido el 2026-11-23**: el total validado es el sueldo recuperado más los ítems con el check en el 99,99% de los dependientes y públicos.
  - El check es exactamente «lo que se usó».
  - Un ítem con el check no es un ítem validado: el analista autoriza a veces el predictor como ingreso sin haberlo comprobado (lo dijo el negocio).

**La hipótesis nueva**: el extra fracasó como etiqueta porque mezcla montos comprobados con declarados y con el predictor. Separando por
componente queda una etiqueta más chica pero más limpia, que tal vez sí se pueda aprender.

## 2. De qué está hecho el adicional (medido, sin modelo)

Dependientes y públicos con sueldo recuperado del IESS, una consulta por persona, de 2021 a 2026. «Material» es el adicional seleccionado que
supera los USD 100 y el 10% del sueldo. El origen es el componente de mayor monto.

| Origen del adicional material | Todos (39.017) | Mediana | Con el archivo del origen | Con RUC activo (3.874) |
|---|---|---|---|---|
| Declarado (RUC, otros, giros) | 5.881 | 600 | 3,4% | 1.051 |
| Cuentas o IVA (estados de cuenta, declaraciones) | 1.356 | 670 | 29,0% | 262 |
| IESS no recuperado (fuente IESS, sin la observación RECUPERADO) | 1.171 | 1.000 | 6,3% | 119 |
| Predictor | 477 | 900 | 5,9% | 84 |
| Arriendo | 152 | 600 | 0,7% | 3 |
| Jubilación | 69 | 1.400 | 8,7% | 4 |
| **Con adicional material** | **9.106 (23,3%)** | | | **1.523 (39,3%)** |

- **Dos de cada tres adicionales son declarados**, casi nunca con archivo. Lo que se puede tomar por comprobado (cuentas o IVA) es el 15%.
- **Con archivo hay 393 en cinco años** (los documentos se registran desde 2024: 42 en 2024, 167 en 2025 y 184 en 2026). Es la etiqueta más limpia
  que existe para el extra del dependiente, y es chica.
- **El «IESS no recuperado»** no es un segundo empleo visible: sólo el 22% tiene más de un empleo en el IESS, igual que el resto (24%). Es un
  ajuste hacia la cifra de Equifax (6.2): queda fuera de la etiqueta.
- **El 15,4% tiene ítems sin el check** (el 41% con RUC activo). **Corregido en la sesión 1 (6.3)**: casi todos son copias automáticas del sueldo
  recuperado, no ingresos que el analista vio y no aceptó; los rechazos de verdad son el 2,4% de las personas.

Guion: `scripts/predictor-ingresos/adicional_por_componente.py` (sesión 1; reproduce esta tabla salvo un empate, 6.1). Lo empezó `componentes.py`,
en las notas de la sesión de A14.

## 3. La propuesta

**Qué se entrega.** El total sigue siendo el sueldo (peldaño 1). El adicional se muestra aparte, como ingreso adicional por corroborar:
- la probabilidad de que la persona tenga un adicional comprobable;
- su mínimo, si el modelo pasa las reglas.
Nunca se suma al sueldo como validado. Si no pasa, queda la señal sin monto que ya decidió A14.

**La etiqueta, por calidad** (sólo los ítems con el check). Corregida en la sesión 1 y con las respuestas del negocio del 2026-11-24 (6.5 y 6.6). La
columna «En la prueba» es desde julio de 2026, y entre paréntesis, con RUC activo:

| Grado | Qué es | Cuántos | Con RUC activo | En la prueba | Uso |
|---|---|---|---|---|---|
| A | Cuentas o IVA, con el archivo del origen | 393 | 140 | 71 (59) | Medir (la prueba) |
| B | Cuentas o IVA sin archivo registrado | 964 | 122 | 72 (43) | Entrenar |
| Arriendo o jubilación | Ingresos extra que la persona puede percibir | 221 | 7 | 9 (0) | Entrenar como adicional, en una columna aparte: se mide con y sin ellos |
| C | Declarado con el check (RUC, otros, giros) | 5.881 | 1.051 | 979 (463) | Sólo como «dijo tener», nunca como monto |
| Fuera | IESS no recuperado | 1.170 | 119 | 280 (65) | Fuera: ajuste hacia la cifra de Equifax |
| Fuera | Predictor con el check | 477 | 84 | 132 (44) | Fuera: es una predicción |
| Negativo | Ningún ítem adicional con el check (29.239) o uno que no llega a material (672) | 29.911 | 2.351 | 4.084 (1.066) | «Sin adicional documentado», no «sin adicional» |
| Rechazado | Ítem sin el check que no copia a uno con el check | 8,9% de las personas desde el 2026-03-08 | | | Marca aparte, no grado; no existe antes de esa fecha (6.3) |

**Toda la etiqueta está anclada a la cifra de Equifax** (6.2): el total validado queda a ±1% de ella en el 7,0% de los A y B. La sesión 2 mide también
con A y B sin esos casos (`med_total_a_1pct_de_la_cifra`: 374 A y 888 B; en la prueba, 69 A y 60 B).

**El modelo, en dos partes**:
1. **Si tiene un adicional comprobable** (A o B contra el negativo).
2. **Cuánto**, como cuantiles del logaritmo del adicional, sólo con A y B.

Cada parte se mide con y sin arriendo o jubilación como adicional (`adicional_arriendo_o_jubilacion`), y con y sin los A y B cuyo total queda a ±1%
de la cifra de Equifax (6.6, respuestas 1 y 3).

Entradas:
- el sueldo y la carga de cuotas sobre el sueldo;
- el buró (deuda, crédito mayor anterior a la consulta, operaciones);
- edad, sexo y fecha;
- el SRI, en la variante que lo tiene.

Nunca entran la cifra de Equifax (decisión del negocio del 2026-11-23, reafirmada el 2026-11-24: no hay variante con ella) ni una variable que en producción llega vacía (`NO_SERVIBLES`). El sueldo de
AWS es lo recuperado, a veces ya neto del aporte (12.15). Medida la paridad con el peldaño 1 (6.4): queda a ±10% en el 79,4%, y es mejor que rearmarlo
con el IESS de AWS.

**Población y prueba.**
- Dos variantes:
  - todos los años sin SRI (39.017 personas);
  - 2026 con SRI (12.986; el bloque no existe antes).
- Siempre hacia adelante, como la fase 0 (12.32): entrenar con lo anterior a julio de 2026 y probar con lo posterior, con intervalos por remuestreo.
- La medida principal es en RUC activo y en la etiqueta A.

**Reglas fijadas antes de medir** (si una falla, se cierra la opción (b) de A14 hasta tener documentos anotados, D8):
- **Si tiene un adicional comprobable:** AUC de 0,75 o más con RUC activo. 12.36 dio 0,624 con la etiqueta vieja.
- **El mínimo del adicional:** cubre al 90% o más de los A de la prueba, y su mediana es al menos la mitad del adicional real.
  - Decide la cifra central (negocio, 2026-11-24): la prueba tiene 71 A.
  - Si pasa sólo por ella (el intervalo baja de 80%), queda «sigue», pero no se conecta hasta juntar más casos A (entran unos 15 a 17 por mes).
- **Lo que vería el analista:** de los adicionales que se mostrarían, el 70% o más tiene uno comprobable.
  La tasa base con RUC activo es 6,8% (262 de 3.874 con cuentas o IVA).

**Lo que no se hace:**
- No se baja nada más de AWS.
- No se consulta Equifax ni Proveedor_Info_1.
- No se usa el modelo de lenguaje.
- No se escribe en la base.

## 4. Las sesiones

Cada una arranca limpia desde `main`, lee este documento y el punto 18 de `docs/pendientes.md`, y termina con un PR de documentos o de
`scripts/predictor-ingresos/`. Los datos y las tablas por persona quedan fuera del repositorio, en `C:\datos\ingresos`.

1. **Datos y etiquetas** (sin modelo). **Hecha el 2026-11-23**: lo medido y las preguntas al negocio, en la sección 6.
   - armar la tabla por persona del adicional por componente: un guion nuevo en `scripts/predictor-ingresos/` que use `preparar.armar_consultas()`;
   - aclarar qué es el «IESS no recuperado» y qué son los ítems sin el check, con lo que dejó la sesión que extrajo AWS (`docs/base-aws-originacion.md`) o
     preguntándole al negocio;
   - medir la paridad del sueldo de AWS con el peldaño 1.
   - Sale con la tabla de grados de 3 confirmada o corregida, y con las preguntas al negocio.
2. **El modelo**, con las reglas de 3 tal cual. Sale con la decisión «sigue» o «se cierra», medida. **Hecha el 2026-11-24: se cierra** (sección 7).
3. **Conectarlo** (sólo si pasa): el adicional estimado en la escalera y en el ingreso adicional por corroborar, con las decisiones del negocio sobre
   cómo se muestra. **No se hace**: el modelo no pasó.

## 5. Lo que no resuelve

- La etiqueta A es chica (393 en cinco años) y es crédito automotriz. Un acierto ahí puede no repetirse en una institución.
- «Sin adicional documentado» no es «sin adicional»: el analista no busca cuando el sueldo ya alcanza. El modelo aprende cuándo se documenta
  un adicional, que se parece a cuándo hace falta.
- La etiqueta sigue anclada en lo que el analista veía, incluida la cifra de Equifax (12.15).

## 6. Sesión 1: datos y etiquetas (2026-11-23, sin modelo)

Guion: `scripts/predictor-ingresos/adicional_por_componente.py` (con `paridad-del-sueldo.mjs`). Arma la tabla por persona
(`C:\datos\ingresos\resultados\predictor-ingresos\adicional-por-componente.parquet`, fuera del repositorio y sin identificaciones) y deja los
agregados en `scripts/predictor-ingresos/metricas/adicional-por-componente-2026-11.json`. Sólo leyó las extracciones de AWS ya bajadas y los respaldos
del crudo de Proveedor_Info_1 de la cartera: no consultó AWS, Equifax ni Proveedor_Info_1, no usó el modelo de lenguaje y no escribió en la base.

### 6.1 La tabla de la sección 2, reproducida

- 39.017 personas, 9.106 con adicional material, 1.523 de 3.874 con RUC activo, 393 de cuentas o IVA con archivo, 5.881 declarados, 477 del predictor,
  152 de arriendo y 69 de jubilación: iguales.
- **Una diferencia**: una persona tiene el mismo monto en cuentas o IVA y en IESS no recuperado. `componentes.py` la contaba como IESS no recuperado por el orden
  alfabético de las columnas, y el guion nuevo la cuenta como cuentas o IVA. Quedan 1.357 y 1.170 en vez de 1.356 y 1.171.
- El total validado es el sueldo recuperado más los ítems con el check en el 99,99%.
- **El monto de A y B es el adicional entero**: el componente de cuentas o IVA pesa el 100% del adicional en el 98,5% de ellos. Sólo el 1,6% de los
  adicionales materiales mezcla más de un componente.

### 6.2 Qué es el «IESS no recuperado»

Es un ítem de fuente IESS cuya observación no es «RECUPERADO» del proveedor. Hasta el 2026-11-24 se llamó «IESS escrito a mano»: el nombre lo puso
`componentes.py` y no viene de AWS. Son 1.256 ítems con el check, de 1.241 personas (en 1.170 es el origen del adicional).

**Es un ajuste hacia la cifra de Equifax** (negocio, 2026-11-24):
- El negocio abrió en AWS los requerimientos 349207, 354014 y 346660.
- En los tres, el analista partió en dos el ingreso del IESS, y entre los dos suman más o menos la cifra de Equifax: «el analista trató de llegar al
  income_predictor».
- Medido con `anclaje_a_la_cifra()`: el total validado queda a ±1% de la cifra en el 20,4% de los que tienen este origen. Con el predictor es el 48,4%,
  con lo declarado el 9,6%, con cuentas o IVA el 7,0% y sin adicional material el 1,5%. A ±5%: 26,9%, 57,2%, 17,8%, 15,7% y 6,9%.
- La mediana del total sobre la cifra es 1,00 en los cuatro orígenes que más pesan (0,78 sin adicional). **Toda la etiqueta está anclada a la cifra
  (12.15), no sólo este grado.**
- **Decisión:** queda fuera de la etiqueta, como el predictor. La sesión 2 mide también con A y B sin los casos a ±1% de la cifra.

Lo que se había medido antes de la respuesta, y que es coherente con ella.

**Lo escribe una persona, con un documento:**
- De los 454 con historial (desde el 2026-03-08), el 99,6% lo creó un autor manual, y el 30,6% cambió de monto después.
- El 43,9% es múltiplo de USD 100.
- Observación vacía en 647, texto libre en 403 (cada uno con menos de 50 repeticiones: la extracción no lo trae), «integración con concesionarios»
  en 157, «pendiente justificar» en 31 y «comisiones» en 16.
- El 57,8% tiene algún archivo de ingresos; el más común es el mecanizado del IESS (53,2%). Los roles de pago, sólo el 6,8%.

**No es lo que el IESS de AWS ya muestra:**
- No es el otro empleador del último mes: coincide a ±10% con el sueldo de los demás empleadores en el 2,8% (471 con dos o más).
- No es más común con varios empleos: el 22,8% tiene más de uno en el IESS, contra el 24,0% del resto. Sólo el 5,6% no tiene historial del IESS.
- No es una copia del sueldo: queda a ±5% del recuperado en el 9,3% (la mediana de la razón es 1,00, pero dispersa). El sueldo más el IESS no
  recuperado es, en mediana, 1,64 veces todo el IESS del último mes.
- En la mitad, el analista lo pone como actividad principal y deja el recuperado como secundaria (608 principales; el recuperado es secundario
  en 615).
- Respuesta: 406 OK FACTURAR, 64 condicionados, 274 rechazados.

La hipótesis de la sesión 1 (un empleo nuevo que el proveedor todavía no trae) no se sostiene con lo que vio el negocio.

### 6.3 Qué son los ítems sin el check

Son 6.310 ítems sin el check (sin contar el recuperado).

**Sólo existen desde el 2026-03-08**, cuando empieza el historial del flujo:
- El 99,6% es de consultas desde esa fecha. Antes hay 25 en todo el extracto.
- Los que tienen historial (todos) empezaron con el check y se lo quitaron después.
- Antes de esa fecha el sistema los borraba o no los creaba: queda como no medible (6.6, respuesta 2).

**El 92,5% de los IESS no recuperados sin el check son copias automáticas del sueldo recuperado:**
- Son 5.701. El 92,5% tiene el mismo monto (a USD 1) que un ítem con el check de la misma persona; 5.265 copian al recuperado.
- Al 88,8% lo apagó un autor automático.
- El sistema crea un ítem por empleador y lo apaga cuando entra el recuperado. No es un ingreso que el analista vio y no aceptó.
- Eso es «la mitad de los flujos IESS secundarios sin el check»: de 8.023, el recuperado lleva el check en el 96,6% y el no recuperado en el 15,9%.

**Sin las copias, los rechazos de verdad son pocos:**
- Afectan al 2,4% de todas las personas y al 8,9% desde el 2026-03-08 (8,7% con RUC activo).
- Por clase: 525 declarados, 427 IESS no recuperados, 27 de cuentas o IVA, 15 del predictor y 3 arriendos.
- **El 15,4% de la sección 2 (41% con RUC activo) es un artefacto**: el RUC activo sólo existe en 2026, que es cuando hay copias.

### 6.4 La paridad del sueldo de AWS con el peldaño 1

**Cómo se midió.** De los 39.017, 786 tienen su crudo de Proveedor_Info_1 en un respaldo de la cartera (septiembre y octubre de 2026).
- `paridad-del-sueldo.mjs` corta los aportes al corte que producción habría tenido el día de la consulta de AWS: el último mes del IESS más frecuente
  en las consultas de ese mes.
- Arma el perfil con el código de producción (`buildStandardProfile`, `datosDeCapacidad`, `armarIngresoDelPerfil`), con el reloj en esa fecha.
- 744 de las 771 con monto son de 2026.

| Peldaño 1 de producción contra | Con monto | Mediana de la razón | ±2% | ±10% | AWS mayor en más de 10% | AWS menor en más de 10% |
|---|---|---|---|---|---|---|
| `ver_f` (lo que validó el analista) | 771 | 0,994 | 65,6% | 79,4% | 10,1% | 10,5% |
| El bruto del último mes del IESS de AWS menos el aporte | 771 | 1,000 | 53,4% | 56,9% | | |

- A 15 de las 786 producción no les da sueldo vigente al corte (peldaño 1 «no aplica»).
- Con un solo sueldo, el 80,1% queda a ±10%. Con dos o más (39), el 66,7%.
- **El sueldo de AWS sirve como entrada, con una diferencia de más de 10% en una de cada cinco personas.** Rearmarlo con el IESS de AWS es peor.
- Contra el IESS de AWS en las 30.885 que lo traen (todos los años, sin el código de producción), `ver_f` queda a ±10% del bruto del último mes menos
  el aporte en el 56,0%, y es menor en más de 10% en el 19,0%. Es lo que dice 12.15: AWS toma el 90% del promedio del proveedor, no el último mes.
- **Lo que no se midió**: la paridad antes de 2026 (27 casos) y en quien no está en la cartera.
- **Para la sesión 2:** entrenar con `ver_f` (decidido, 6.6) y medir cuánto cambia la probabilidad y el mínimo con el sueldo movido ±10% en la prueba.

### 6.5 La tabla de grados: qué cambió

La tabla de la sección 3 queda corregida así:
- **El IESS no recuperado (1.170) sale de la etiqueta**: es un ajuste hacia la cifra de Equifax (6.2).
- **Arriendo (152) y jubilación (69) tienen grado propio**, que no tenían. Son ingresos extra que la persona puede percibir (respuesta 3): cuentan como
  adicional para entrenar, en una columna aparte, y se mide con y sin ellos. El arriendo tiene contrato en el 0,7%. Con RUC activo son 7, y en la prueba
  9, ninguno con RUC: casi no mueven la medida principal.
- **El negativo se separa**: 29.239 sin ningún ítem adicional con el check y 672 con uno que no llega a material. Los dos son «sin adicional
  documentado».
- **El rechazado** es sólo lo que el analista apagó y no copia a otro ítem, y existe desde el 2026-03-08. No sirve como etiqueta de años anteriores.
- **B es «sin archivo registrado»**: los documentos se registran desde 2024. Los 246 de cuentas o IVA de 2023 pueden haber tenido el archivo.
- **La prueba es chica.** Desde julio de 2026 hay 71 A (59 con RUC activo) y 143 A o B (102 con RUC activo), contra 1.066 negativos con RUC activo.
  - Con 71, la cobertura del mínimo se mide con unos ±7 puntos: un 90% verdadero puede salir 83%.
  - La regla se aplica tal cual: decide la cifra central, y la sesión 2 informa el intervalo (respuesta 4).
- **Sin los casos a ±1% de la cifra de Equifax** quedan 374 A y 888 B; en la prueba, 69 A (58 con RUC activo) y 60 B (34).

### 6.6 Preguntas al negocio, respondidas el 2026-11-24

1. **El IESS no recuperado** (antes «IESS escrito a mano», 1.170 personas): es un ajuste hacia la cifra de Equifax. El negocio lo vio en los
   requerimientos 349207, 354014 y 346660: «son casos atípicos que se están ajustando al income_predictor». **Queda fuera de la etiqueta, como el
   predictor**, y la sesión 2 mide también con A y B sin los casos a ±1% de la cifra (6.2).
2. **Los ítems apagados**: las copias automáticas y los rechazos se explicaron, y el negocio respondió «ok entendido». Lo de antes del 2026-03-08
   queda como no medible.
3. **Arriendo y jubilación**: «No, son ingresos extras que podría percibir una persona». **Salen de C** y cuentan como adicional para entrenar, en una
   columna aparte, midiendo con y sin ellos.
4. **La prueba de 71 A**: decide la cifra central. Si la regla del mínimo pasa sólo por ella (el intervalo baja de 80%), queda «sigue», pero no se
   conecta hasta juntar más casos A (entran unos 15 a 17 por mes).
5. **El sueldo de entrada**: «sí, entrenar con ver_f». El negocio reafirmó, además, que la cifra de Equifax no es un insumo del predictor: «no quiero
   que el income_predictor sea un insumo de nuestro modelo de predictor de ingresos». No hay variante con ella.

## 7. Sesión 2: el modelo (2026-11-24). Decisión: se cierra

Guion: `scripts/predictor-ingresos/adicional_modelo.py` (50 s). Lee la tabla de la sesión 1 y cruza las entradas con `preparar.armar_consultas()` por
la id de consulta (las 39.017 cruzan). Agregados en `scripts/predictor-ingresos/metricas/adicional-modelo-2026-11.json`. No consultó AWS, Equifax ni
Proveedor_Info_1, no usó el modelo de lenguaje y no escribió en la base.

**Cómo se midió**, con las reglas de la sección 3 tal cual, escritas en el encabezado del guion antes de correrlo:
- Entradas: el sueldo (`ver_f`), la carga de cuotas sobre el sueldo, el buró (`BURO` y `CUOTA`), edad, sexo y fecha; en la variante con SRI, además el
  de Proveedor_Info_1 y el de Equifax. Ni la cifra de Equifax ni una de `NO_SERVIBLES`: el guion corta si una llega.
- Parte 1: un clasificador de A o B contra el negativo. Parte 2: los doce cuantiles del logaritmo del adicional con A y B; el mínimo es el cuantil 10.
- Entrena con lo anterior a julio de 2026 y prueba con lo posterior. Intervalos del 95% con 1.000 remuestreos.
- El umbral de «se muestra» (R3) se elige sin mirar la prueba: el puntaje más bajo con el que, fuera de muestra en el entrenamiento con RUC activo, lo
  mostrado llega al 70% comprobable con 10 personas o más.
- Los conteos de la prueba son los de la sesión 1: 71 A (59 con RUC activo); sin los anclados a la cifra, 69 A y 60 B.

### 7.1 Las tres reglas, en el escenario principal (A o B)

| Regla | Meta | Todos los años, sin SRI | 2026, con SRI |
|---|---|---|---|
| R1: AUC de A contra el negativo, con RUC activo | 0,75 | 0,631 (0,570 a 0,699) | 0,619 (0,560 a 0,683) |
| R2: el mínimo cubre a los A | 90% | 87,3% (78,9 a 94,4) | 84,5% (76,1 a 91,5) |
| R2: mediana del mínimo sobre el adicional real | 0,5 | 0,59 | 0,59 |
| R3: de lo mostrado con RUC activo, comprobable | 70% | ningún umbral llega: el máximo en el entrenamiento es 20,8% | ningún umbral: máximo 20,0% |
| **Pasa** | | **no** | **no** |

- **R1 falla por lejos**: el intervalo no toca 0,75 en ninguna de las dos. Con la etiqueta vieja, 12.36 dio 0,624: separar por componente no mejoró
  la separación.
- **R3 falla por más**: en la prueba con RUC activo, el 1%, 2%, 5%, 10% y 20% de puntaje más alto tiene entre 0% y 8,6% comprobable, contra una tasa
  base de 5,9% (6,8% en la sección 3, con todos los años). El modelo no encuentra a quién mostrarle un adicional.
- **R2 falla por poco en la cobertura** y pasa en la agudeza. Es lo único con señal (7.3).

### 7.2 Los otros escenarios y el sueldo movido

AUC de R1 (A contra el negativo, con RUC activo); ninguno pasa ninguna variante, y R3 no tiene umbral en ninguno:

| Escenario | Todos los años, sin SRI | 2026, con SRI | Cobertura del mínimo en A (sin SRI / con SRI) |
|---|---|---|---|
| Principal | 0,631 | 0,619 | 87,3% / 84,5% |
| Sin los anclados a la cifra (69 A, 60 B) | 0,643 | 0,683 (0,623 a 0,740) | 87,0% / 84,1% |
| Con arriendo o jubilación | 0,641 | 0,648 | 85,9% / 84,5% |
| Con arriendo o jubilación, sin los anclados | 0,628 | 0,636 | 84,1% / 85,5% |

- **Sacar los anclados a la cifra** es lo que más sube el AUC (a 0,683 con SRI), sin llegar: el intervalo queda debajo de 0,75.
- **Arriendo o jubilación** no mueve nada: en la prueba son 9, ninguno con RUC activo.
- **El sueldo movido ±10%** en la prueba casi no cambia nada: la probabilidad se mueve 0,4 a 0,9 puntos en la mediana (2,4 a 6,0 en el percentil 90),
  el mínimo queda igual (mediana de la razón 1,00), el AUC se mueve ±0,02 y la cobertura no cambia. La paridad de `ver_f` no es lo que falla.
- **Con SRI, «A contra el negativo» en todos da 0,801** (0,754 a 0,840), pero con RUC activo baja a 0,619: lo que separa es tener RUC activo
  (`sri_estado` es la segunda variable que más pesa), que es la señal sin monto que A14 ya decidió. Dentro de quienes tienen RUC activo no hay más.
- El AUC fuera de muestra del entrenamiento (0,695 con RUC activo, sin SRI) es parecido al de la prueba: lo bajo no es el corte en el tiempo, es la
  etiqueta.

### 7.3 El monto: la única parte con señal

Sabiendo que la persona tiene un adicional comprobable, el monto sí se aprende algo, a diferencia de 12.36 (R² de 0,01):
- R² del valor central, en logaritmo, en los A: 0,35 sin SRI y 0,29 con SRI. Sin variables, −0,07 y −0,01.
- La mediana del mínimo sobre el adicional real es 0,59 (sin variables, 0,48 y 0,43): el mínimo es más agudo que el que no usa variables.
- La cobertura queda en 84% a 87%, debajo del 90%. Sin variables cubre 83% a 89%, con un mínimo más bajo.
- Una calibración conforme podría llevar la cobertura al 90% (como en `ingreso-v2`), pero no cambia la decisión: sin R1 y R3 no hay a quién
  mostrarle el monto, porque el modelo no sabe quién tiene el adicional.

### 7.4 Decisión

**Se cierra** la opción (b) de A14, como fijó la sección 3, hasta tener documentos anotados (D8). Sigue la decisión de A14: el dependiente con sueldo
verificado no se estima, y con RUC activo recibe la señal sin monto «puede tener ingresos que no constan». La sesión 3 (conectarlo) no se hace.

Lo que dejaría abrirlo otra vez:
- **Más casos A**: entran unos 15 a 17 por mes. Con más A, R2 podría pasar, pero R1 y R3 no dependen del tamaño de la prueba: con 1.214 comprobables
  en el entrenamiento el AUC fuera de muestra ya es 0,695 con RUC activo.
- **Una etiqueta que no dependa de si el analista buscó**: «sin adicional documentado» no es «sin adicional» (sección 5). Mientras el negativo mezcle
  a quien no tiene adicional con quien no lo documentó porque el sueldo alcanzaba, el clasificador aprende cuándo se documenta.
- **Lo que no se midió**: una calibración del mínimo, porque no cambia la decisión, y la paridad del buró antes de febrero de 2026 en la variante de
  todos los años (12.35: en diciembre y enero las operaciones no coinciden con producción).
