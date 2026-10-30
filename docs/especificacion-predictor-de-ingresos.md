# Especificación técnica del predictor de ingresos

Borrador del 2026-10-21, para decidir antes de construir. **Nada de esto está construido en el producto.** El análisis que lo sustenta, con todas las mediciones, está en
`docs/investigacion-predictor-de-ingresos.md` (las secciones 12.x); acá se cita el número de cada una. No lleva datos de personas: las extracciones y los guiones de entrenamiento
viven fuera de git (`research/ingresos-aws/` y `C:\datos\ingresos\`).

## 0. En una página

**Qué hace.** Para una persona cuyo ingreso no lo verifica un tercero (independientes, jubilados, personas sin actividad formal e ingreso adicional de dependientes), devuelve un
**ingreso mínimo certificado** (el monto que el ingreso real supera con 90% o 85% de seguridad), la **probabilidad de cada tramo** y un valor central. El ingreso que sí verifica un tercero
(el salario que reporta el IESS) se muestra aparte, tal cual, y no se estima.

**Lo que garantiza y lo que no.** La seguridad del mínimo se midió contra el ingreso calculado de personas que pidieron crédito **automotriz** (AWS: el 96%; solo 68 de 57.061 son de consumo): el real lo supera el 89% de las veces con el mínimo del 90%.
**No hay calibración por producto** (negocio, 2026-10-28): el crédito automotriz y el de consumo son el mismo, y lo comparable es el valor financiado (12.27).
**No garantiza el monto**: acertar el monto dentro de ±10% se logra en el 15% al 19% de los casos y la propia etiqueta no se repite mejor que el 60% al 66% (12.13 y 12.14). Por eso el ±10% se promete
solo donde el ingreso es verificable, y para lo estimado se promete un mínimo.

**Tres niveles según los datos que haya** (decisión del negocio del 2026-10-21): verificado (IESS), estimado con Novadata, y estimado con Novadata y buró.
**No se pide patrimonio, ni gastos, ni entrada** (decisión del 2026-10-22): el patrimonio es de otro análisis, a cargo de un analista, y el crédito de consumo no tiene entrada (4.3). Más dos referencias que no son una estimación de la persona:
la pensión por tipo de afiliación y la distribución nacional de su tipo.

**Qué hay que construir**: un evaluador del modelo en `_shared`, un módulo que arme las variables desde el perfil y Equifax, una función con su operación en la API, dos tablas, la integración con la capacidad de pago y una tarjeta en la pantalla.
**Lo que falta decidir o conseguir** está en la sección 10.

## 1. Decisiones del negocio que lo definen

| Fecha | Decisión |
|---|---|
| 2026-10-17 | Cada módulo tiene su propia puerta: una función y una operación propia en `api/openapi.yaml`. El marco y el modelo de lenguaje se tocan al final. |
| 2026-10-21 | El predictor estima **el ingreso no verificado**; el salario bruto del IESS es la verdad de un dependiente y no se afina; el descuento al empleado se aplica al final. |
| 2026-10-21 | Dos versiones por datos de entrada: Novadata; Novadata más buró (Equifax o Aval). La tercera, con datos internos, se retiró el 2026-10-22 (fila siguiente). Entrenar con salidas de Equifax no necesita contrato: son datos ya pagados. |
| 2026-10-21 | El negocio autorizó una cuarta extracción de AWS, solo de lectura: el bloque `informacion_sri` de las respuestas JSON de Equifax, sin RUC, nombre ni dirección (12.24). |
| 2026-10-21 | El patrimonio solo se pediría a petición de un analista, como una reestimación (nivel 3). **Reemplazada el 2026-10-22**: ya no se pide. |
| 2026-10-22 | **No se pide patrimonio, ni gastos, ni entrada.** El patrimonio es parte de otro análisis, a cargo de una persona (un analista); los gastos no se piden; la entrada no aplica porque el crédito de consumo no la tiene (es de los créditos hipotecario y automotriz). De Novadata ya se tiene el valor de todos los vehículos de la persona, que el modelo de score lee como colateral. Se retira el nivel 3. |
| 2026-10-22 | Las rentabilidades por giro, «SD» (sin documentos) y las demás marcas de cómo se armó el ingreso en AWS **no son insumos del modelo**: solo sirven para aclarar los datos con que se entrena el predictor (4.4). |
| 2026-10-22 | El ingreso verificado para entrenar y calibrar es el ingreso validado calculado de AWS (la pantalla «Flujo de efectivo» de la originación), incluido el recuperado de Novadata. |
| 2026-10-26 | **Solo se trabaja crédito de consumo general**: sin crédito automotriz y, por lo tanto, sin entrada. AWS es crédito automotriz (96%) (12.27). |
| 2026-10-28 | **No hay calibración por producto**: «no existe la calibración contra consumo o automotriz, los 2 créditos son lo mismo; lo que nos importa son los datos del predictor de Equifax, que es un predictor general». El valor financiado es el mismo: consumo 20.000; automotriz 20.000 más 5.000 de entrada, un auto de 25.000, con 20.000 financiados. Se retira la propuesta de rotular el mínimo «sin calibrar para consumo» (12.27). |
| 2026-10-28 | **Las variables de la persona del nivel 1** (edad, sexo, estado civil, provincia y cantón): «decidir después de medir contra Novadata». La recomendación de la sesión de entrenamiento queda como candidata, sin aplicar (secciones 8 y 9). |
| 2026-10-28 | **Destilación**: el negocio tiene 400.000 consultas a Equifax con predictor en cinco años y propone destilar un modelo propio. Medido (12.28): no mejora la predicción del ingreso validado; serviría para independizarse del predictor de Equifax. Queda abierto qué quiere lograr el negocio con ella. |
| 2026-10-29 | **El nivel 1 es la edad, el sexo y el SRI de Novadata** (más la fecha de la consulta), sin estado civil, zona ni IESS (12.30). **El «obligado a llevar contabilidad» se queda y va al perfil**: sin él el nivel 1 pierde 0,027 de R² y no certifica «al menos 2.000» a nadie. Completar el lote de paridad queda para después. La destilación se quiere para mejorar la asertividad (lo medido en 12.28 dice que no la mejora). La próxima versión del marco se hará con los resultados del predictor. |
| 2026-10-26 | Las rentabilidades por giro que dio el negocio eran aproximadas: son valores genéricos que no nacen de una metodología válida. No son entrada; la garantía aguanta que estén infladas hasta un 30% (12.27). |
| 2026-10-21 | El resultado es un tramo con probabilidad y un valor central con rango. Los tramos del tramo alto: 2.000 a 2.999, 3.000 a 4.999 y 5.000 o más. |
| 2026-10-21 | El predictor de Equifax es solo contraste, no entrada. La cuota financiera de Equifax es la pista principal. No se usan los límites de cuota por institución (se incumplen por excepción). |
| 2026-10-21 | AWS es el piloto y se reentrena con los 3,9 millones del proveedor cuando lleguen. Se entrena con todas las respuestas comerciales y se mide con OK FACTURAR (con condicionado), que cuenta como verdad: lo declarado lo valida el analista con documentos. |
| 2026-10-21 | ±10% del monto solo donde el ingreso es verificable; para lo estimado, **mínimo certificado más rango**, y el monto exacto se confirma con documentos. |
| 2026-10-21 | Se muestra siempre un valor mínimo, **no menor a la mitad del salario básico**: es improbable que quien gana menos pida un crédito. Aval no tiene consultas con ingreso calculado: la versión con buró es solo Equifax. |
| 2026-10-21 | La base de 3,9 millones no trae el monto de la pensión: los jubilados quedan como estimados. |
| 2026-10-21 | Los dos primeros tramos siguen al salario básico del año; los demás son dólares fijos. Se autorizó leer el catálogo CIIU de AWS y se abrirá un PR con la investigación y esta especificación, sin fusionar hasta que lo pida el negocio. |

## 2. Qué devuelve

### 2.1 La respuesta

Una respuesta por persona y por pedido, con la versión del modelo y de las variables. Los montos son mensuales, en dólares, y los nombres siguen los de `api/openapi.yaml` (castellano, sin anglicismos).
Los números del ejemplo son inventados.

```json
{
  "version": "ingreso-v1",
  "nivel": 2,
  "verificado": {
    "origen": "IESS",
    "salarioReportado": 1250.00,
    "aportePersonal": 118.13,
    "ingresoNeto": 1131.87,
    "mes": "2026-08"
  },
  "estimado": {
    "aplica": true,
    "rotulo": "Ingreso estimado, sin verificar",
    "minimoCertificado": { "seguridad": 0.90, "monto": 1180.00, "limiteDeMedioSbuAplicado": false },
    "minimoAlternativo": { "seguridad": 0.85, "monto": 1330.00 },
    "valorCentral": 2310.00,
    "tramos": [
      { "desde": 0, "hasta": 470, "probabilidad": 0.01 },
      { "desde": 470, "hasta": 940, "probabilidad": 0.04 },
      { "desde": 940, "hasta": 2000, "probabilidad": 0.38 },
      { "desde": 2000, "hasta": 3000, "probabilidad": 0.27 },
      { "desde": 3000, "hasta": 5000, "probabilidad": 0.20 },
      { "desde": 5000, "hasta": null, "probabilidad": 0.10 }
    ],
    "certificaAlMenos": [940]
  },
  "referencia": null,
  "calidad": { "variablesUsadas": 41, "variablesSinDato": 6, "avisos": ["Sin historial de tarjetas en el buró."] },
  "modelo": { "poblacion": "solicitantes de crédito (en AWS, el 96% automotriz)", "calibradoPara": null, "entrenadoEl": "2026-10-21" }
}
```

### 2.2 Reglas de lectura

1. **`verificado` y `estimado` son bloques separados** y nunca se suman en el servidor. Un dependiente trae `verificado` y `estimado.aplica: false`; un independiente sin IESS trae solo `estimado`.
   Un independiente que además tiene un salario del IESS trae los dos: el salario es verificado y el modelo estima solo lo no verificado.
2. **El mínimo mostrado es el mayor entre el mínimo del modelo y la mitad del salario básico del año** (`SBU_POR_ANIO` de `fuentes-ingreso.ts`). Con un modelo entrenado con solicitantes ese límite nunca se aplicó (12.19);
   el campo `limiteDeMedioSbuAplicado` dice cuándo sí.
3. **El mínimo no es el ingreso.** En mediana es entre un 45% y un 55% del ingreso calculado entre solicitantes (12.16, 12.17 y 12.19; en la población nacional, un tercio, 12.18); en pantalla y en la API se rotula como mínimo, nunca como ingreso de la persona. El valor central es la mediana del modelo.
4. **Los tramos**: decisión del negocio del 2026-10-21: los dos primeros siguen al salario básico del año (menos de 1 salario, de 1 a menos de 2 salarios) y los demás son fijos: 2 salarios básicos a 1.999, 2.000 a 2.999, 3.000 a 4.999 y 5.000 o más.
   Con el salario de 2026 (482) los cortes son 482 y 964; con el de 2025 eran 470 y 940. Los cortes se aplican al responder, no al entrenar: el modelo entrega cuantiles y la probabilidad de cada tramo sale de la distribución con los cortes del año. Las medidas de este documento usan 470 y 940.
5. **`certificaAlMenos`** lista los umbrales (940, 2.000, 3.000, 5.000) que el mínimo del 90% alcanza. Con buró (nivel 2), certificar «al menos 2.000» acierta el 95,5% de las veces entre quienes se certifica, y el 98,4% si solo se miran los OK FACTURAR (12.24).
6. **Una variable sin dato no corta la estimación**: baja la precisión y se dice en `calidad`. Una persona sin consulta de buró no usa el nivel 2.

### 2.3 El neto de lo verificado

El ingreso neto de un salario del IESS usa el aporte personal de `PARAMETROS_CAPACIDAD.aportePersonalIess` (9,45%), igual que `capacidad-de-pago.ts`. El ingreso calculado de AWS resta un 10% fijo en el 75,5% de los dependientes (12.12 y 12.13):
**es una diferencia conocida**, y por eso el predictor no se entrena con el neto de un dependiente.

## 3. Niveles y selector

### 3.1 Qué se mide en cada nivel

Independientes de AWS de 2026 que traen el bloque del SRI de Equifax (21.260), ingreso no verificado, validación cruzada por persona; entre paréntesis, solo OK FACTURAR y condicionado (3.538) (12.24 y 12.26; `scripts/predictor-ingresos/`, que reproduce estas tablas número a número con los guiones de la investigación).
**Solo con variables que CrediScope puede armar igual que en el entrenamiento**: el SRI de Novadata en el nivel 1 y el de Equifax en el 2, sin la actividad ni la antigüedad que trae AWS (declaradas, no coinciden con las del SRI, 4.1).
Sin el SRI y con todo AWS (57.061 independientes) eran 0,087 y 0,341 (12.23). La paridad de los datos de la persona (edad, sexo, estado civil, provincia y cantón) entre AWS y Novadata **se midió con 542 independientes de 2023 a 2025, sin el SRI de Equifax** (12.29, sección 8): la edad y el sexo coinciden en el 99,6%, y con eso **el nivel 1 es la edad, el sexo y el SRI de Novadata** (decisión del negocio del 2026-10-29; 12.30). Lo que pesa es el SRI, cuya paridad con el de Equifax sigue como en 12.24 (87 personas).

| Nivel | Entradas | R² | Tramo exacto | El real supera el mínimo del 90% | Mediana del mínimo del 90% | Certifica «al menos 2.000» (% del total, precisión) |
|---|---|---|---|---|---|---|
| 0 Verificado | Salario del IESS (Novadata) | — | — | — | — | — |
| 1 Novadata | Edad, sexo, la fecha de la consulta y, del RUC, si tiene, estado, antigüedad, suspensión y obligado a contabilidad | 0,157 (0,074) | 36,2% (33,8%) | 89,1% (95,6%) | 995 (1.157) | 3,0%, 94,5% (6,7%, 97,5%) |
| 2 Novadata y buró | Edad, sexo, estado civil, zona y IESS del extracto de AWS, el SRI, deuda, crédito y cuota de Equifax, y la clase y el CIIU del SRI | 0,355 (0,460) | 46,2% (53,2%) | 88,2% (94,0%) | 1.093 (1.516) | 17,0%, 95,5% (34,6%, 98,4%) |

**El nivel 1 distingue poco a una persona, aunque con el SRI ya algo** (R² de 0,157; sin el SRI, con las variables del nivel anterior, 0,091): su mínimo sigue siendo en la práctica el límite inferior de la población de solicitantes, unos USD 1.000, salvo para una minoría (el 3,0% certifica «al menos 2.000»).
Se muestra con la etiqueta «referencia de solicitantes», no como estimación de la persona, mientras el mínimo no pase de unos USD 1.000. **El salto sigue estando en el buró**: de 0,157 a 0,355.
Los datos internos (patrimonio, gastos, entrada) se midieron y no entran: sumaban entre 0,000 y 0,019 de R², según el bloque (4.3).

**Con intervalos y hacia adelante** (12.26 y 12.30; intervalo del 95% por remuestreo de personas). R² del nivel 1: 0,157 (0,143 a 0,172); del nivel 2: 0,355 (0,325 a 0,383). Entrenado hasta junio y probado de julio a octubre (8.656 casos), el real supera el mínimo del 90% el **89,1%** de las veces en el nivel 1 (88,5 a 89,8; el del 85%, 84,8%)
y el **87,4%** en el 2 (86,6 a 88,0; 87,5% con el SRI de Novadata sin la clase y el CIIU). Quienes no tienen RUC cubren menos: 87,4% y 83,1% (786 casos; intervalo ancho). Con el nivel anterior, sin el SRI el R² bajaba 0,095 y, servido sin él, era negativo: **el nivel 1 depende de que Novadata dé el mismo SRI que se usó para entrenar**.
**Las variables del nivel 1** (decisión del 2026-10-29; 12.26, 12.29 y 12.30): la edad, el sexo, la fecha de la consulta y el SRI de Novadata (8 variables). **Sin la provincia ni el cantón** (Novadata trae el domicilio en el 37% y coincide con AWS en el 86% y el 71%; no trae el lugar de trabajo), **sin el estado civil** (92,4%, y no sumaba sobre la edad y el sexo)
y **sin el IESS** (el aporte coincide en el 84%, los empleos en el 67% y los meses con aporte en ninguno de 99 casos, y el 55% de las personas sin aporte en AWS sí tienen IESS en Novadata: no es la misma población). Contra el nivel anterior (16 variables) pierde 0,015 de R² (0,011 a 0,020) y 0,012 hacia adelante, y cubre mejor: 89,1% contra 88,1% hacia adelante.
La fecha de la consulta sale del reloj del servidor y se queda (sección 7). **El «obligado a llevar contabilidad» no se puede sacar**: sin él el R² baja 0,027 (0,040 hacia adelante) y el modelo no certifica «al menos 2.000» a nadie; el perfil todavía no lo guarda y el negocio decidió sumarlo (sección 10).
**Prueba en sombra con las entradas de producción** (12.30): 532 independientes de AWS de 2023 a 2025, armados desde el perfil que guardó CrediScope con `variables-de-ingreso.ts` y evaluados con `predictor-ingresos.ts`, cubren **89,1%** con el mínimo del 90% (86,5 a 91,7) y 85,0% con el del 85%, lo mismo que hacia adelante en AWS. No mide la paridad del SRI de Novadata con el de Equifax.
La edad es la del día de la consulta, como `edad_a_la_consulta` de AWS: el predictor se sirve con una consulta vigente. Servidas con el perfil y el reloj de hoy contra un ingreso de uno a tres años antes, esas personas cubren dos puntos menos (87,2%).

### 3.2 Cuándo se usa cada uno

El selector corre en este orden y toma el primero que aplica. Los segmentos son los de `fuentes-ingreso.ts` (`Segmento`).

1. **Nivel 0, verificado**: los segmentos `publico`, `diplomatico`, `dependiente_privado` y `empleo_domestico` con ingreso del IESS. Se muestra el salario y su neto; el ingreso adicional no verificado **no se estima** (no se puede predecir:
   AUC de 0,72 para saber si lo tiene y R² de 0,11 para el monto, 12.14) y se dice «puede tener ingresos que no constan».
2. **Pensión por tipo de afiliación**: los segmentos `jubilado` y `jubilado_con_ingreso_adicional`. Se entrega la referencia de la sección 3.3, rotulada como referencia.
3. **Nivel 2**, si la institución tiene a Equifax como buró y la persona tiene una consulta vigente; **nivel 1**, en los demás casos: los segmentos `independiente`, `ingresos_mixtos`, `agricola`, `trabajo_hogar` e `informal_o_sin_actividad`.
   No hay nivel 3: el patrimonio no se pide (decisión del negocio del 2026-10-22).
4. **`sin_datos` y `no_clasificado`: no se estima.** Es la ausencia de la consulta, no un juicio sobre la persona.
5. **Referencia nacional**, solo si la institución lo pide para una población que no es de solicitantes (microcrédito o inclusión): distribución del ingreso de su tipo en el país (3.4).

Con Aval como buró de la institución se usa el nivel 1: no hay datos de Aval con ingreso calculado para entrenar (decisión del 2026-10-21).

### 3.3 Pensión por tipo de afiliación (ENIGHUR 2024-2025; 12.18)

Tabla por afiliación, sexo, edad y zona, con respaldo jerárquico cuando la celda tiene menos de 40 personas. R² de 0,438; el real supera el mínimo del 90% el 87,4% de las veces; mínimo en mediana de 220; certifica «al menos 200» al 52,2% con 96,2% de precisión.
Mediana de la pensión: aporta al IESS 470 (P10 215, P90 1.100), otro seguro 870, seguro campesino 119 (casi fija), sin afiliación 400.
**Los códigos de afiliación de la ENIGHUR se confirmaron el 2026-10-26 con el formulario oficial** (F1, p. 8: 1 IESS general, 2 IESS voluntario, 3 campesino, 4 ISSFA, 5 ISSPOL, 6 y 7 seguro privado, 8 IESS como trabajador no remunerado del hogar, 9 ninguno) y **el guion los agrupaba mal**: ponía el 8 (IESS) y el 6 y 7 (privados) en «otro seguro».
Con el mapeo oficial «otro seguro» queda como ISSFA o ISSPOL (407 personas de la muestra, mediana 900) y «certifica al menos 200» baja a 51,9%; los seguros privados tienen 14 jubilados en la muestra y no forman celda (12.27).
El archivo vigente es `resultados/ref_2_pensiones_celdas.csv` (mapeo anterior) y el corregido, `resultados/r5b_pensiones_celdas.csv`; en CrediScope sería una tabla de referencia versionada con el mapeo oficial.

### 3.4 Referencia nacional (ENIGHUR y ENEMDU; 12.18)

Para independientes sin información de crédito en el país el mínimo del 90% es en mediana USD 80 (un tercio del ingreso real) y el 75% gana menos de 470. El modelo distingue más que una tabla de celdas (R² de 0,375 contra 0,10 a 0,14), pero el mínimo certificable sigue siendo
bajo: sirve para decir qué es lo normal en su tipo y para decidir cuándo pedir documentos, no para estimar a la persona.
`resultados/ref_2_independientes_celdas.csv` (115 celdas) y el modelo E0 de `scripts/ref_1_enighur.py`.

## 4. Variables y de dónde salen en CrediScope

El modelo se entrenó con variables del extracto de AWS; en CrediScope hay que armarlas desde el perfil y desde Equifax. La paridad se comprobó donde se pudo (sección 9).

### 4.1 Nivel 1: Novadata

Desde el 2026-10-29 el nivel 1 lleva solo la edad, el sexo, la fecha de la consulta y el SRI de Novadata (12.30). El estado civil, la zona y el IESS quedan solo en el nivel 2, con el extracto de AWS con que se entrenó, hasta reentrenarlo (sección 9, punto 8).

| Variable del modelo | Qué es | Fuente en CrediScope |
|---|---|---|
| `edad`, `genero` | Datos de la persona | Perfil, grupo de identidad (Registro Civil vía Novadata). El sexo de Novadata tiene las mismas dos categorías que AWS (`sexoParaIngreso`; coinciden en 540 de 542, 12.29) |
| `estado_civil` (solo nivel 2) | Estado civil | Perfil, grupo de identidad; sin mapeo a las categorías de AWS |
| `prov_dom`, `cant_dom`, `prov_trab`, `cant_trab` (solo nivel 2) | Provincia y cantón de domicilio y de trabajo | Perfil, direcciones y empleo actual |
| `aporte`, `meses_aporte`, `n_empleos` (solo nivel 2) | Aporte al IESS del último mes, meses con aporte, número de empleos | Perfil, IESS y continuidad laboral (`ContinuidadLaboral`, `VinculoIess`) |
| `anio_mes` | Fecha de la consulta, en años con fracción | Reloj del servidor |
| `sri_ruc`, `sri_estado`, `sri_antig`, `sri_susp`, `sri_obligado` | Tiene RUC; estado del RUC (activo o suspendido); años desde el inicio de actividades; años desde la suspensión definitiva; obligado a llevar contabilidad | Perfil, RUC de Novadata (`datosContribuyente`: fechas de inicio, cese, reinicio y suspensión definitiva, y `obligado`; `estadoActividadEconomica`). El `obligado` está en el perfil desde estructura-v15 (`laboral.obligadoALlevarContabilidadRuc`; «SI» y «S» son sí, «NO» y «N» son no) |

**El SRI entra; la actividad y la antigüedad de AWS no.** En AWS salen del flujo de ingreso (declaradas o escritas por el analista), no del SRI: cotejadas con lo que trae Equifax del SRI, la **sección coincide en el 58%** de 1.368 casos y la **fecha de inicio es idéntica en el 19%** (12.23).
Se extrajo el SRI de las respuestas de Equifax guardadas en AWS (12.24) y **suma el doble de lo previsto**: con lo que Novadata da, el R² del nivel 1 pasa de 0,091 a 0,172 en 21.260 independientes de 2026, y se sostiene entrenando hasta junio y midiendo de julio a octubre (de 0,097 a 0,187).
Es más que la actividad y la antigüedad declaradas de AWS (0,146 sobre los mismos casos). El SRI **solo existe en las respuestas JSON de Equifax** (desde diciembre de 2025): el modelo con SRI se entrena con 2026 hasta que lleguen los 3,9 millones.

**Qué da Novadata del SRI y qué no.** `datosContribuyente` trae el RUC, la fecha de inicio, el cese, el reinicio, la suspensión definitiva y `obligado`; los establecimientos traen la actividad como texto (`act_economica`). **No trae el CIIU ni la clase del contribuyente** (RIMPE u otros),
que solo vienen de Equifax. Sumarlos al nivel 1 daría 0,020 más de R² y al nivel 2 apenas 0,003, así que el nivel 1 no los usa. Falta medir si el texto de la actividad de los establecimientos de Novadata se puede llevar a un CIIU (sección 10).

**Paridad medida en CrediScope**, en las 87 personas que tienen el SRI de Equifax y el perfil de Novadata: tiene RUC coincide en 87 de 87; la fecha de inicio es idéntica en 83 de 83; el estado activo coincide en 74 de 76 y el suspendido en 7 de 7.
El estado de Novadata se lleva a «activo» si es `activa_*` y a «suspendido» si es `inactiva_*` (Novadata lo resuelve por las fechas de cese y reinicio, `ruc.ts`; Equifax trae el estado). Es una muestra chica: se vuelve a medir con más personas (sección 9). El `obligado` de Novadata, que el perfil guarda desde estructura-v15 (`laboral.obligadoALlevarContabilidadRuc`), coincide en las 83 con RUC (medido el 2026-10-29).

**Sin RUC es un dato; sin respuesta no lo es.** `sri_ruc` vale 0 solo si la fuente contestó y la persona no tiene RUC. Si el contribuyente no contestó (`fuentesSinDatos`), todas las variables del SRI van nulas. En el entrenamiento se descartaron las 4.140 respuestas en que Equifax no traía el bloque.
El 87,3% de los independientes de AWS tiene RUC: quien no lo tiene es la minoría que igual pidió crédito. Para quien no tiene RUC ni aporte al IESS el modelo no está probado (sección 8).

**Variable posible, sin entrenar: el valor de los vehículos de la persona.** Novadata lo trae (el modelo de score lo lee como colateral) y podría decir algo del ingreso. No hay dato de entrenamiento: AWS no guarda la respuesta de Novadata, y lo que guarda de vehículos es el vehículo que se financia.
Probarla exige reconsultar a Novadata una muestra de personas de AWS: la de 12.29 dejó 542 con respuesta completa (de 2023 a 2025), pero esta variable no se probó.

### 4.2 Nivel 2: buró de Equifax

Las diez variables de `AnalisisCreditoSectorFinanciero` son **campos de la respuesta cruda** de Equifax, con igualdad exacta en 4.499 de 4.499 respuestas (12.22). **Hoy `derivarTablas` no las extrae**: toma de `interconnectResponse` solo dos cálculos de Equifax,
porque la deuda de ese bloque no cuadra con la de `reporteCrediticio` (`docs/equifax.md`). Para el modelo se usan como **señal**, no como saldo, y hay que extraerlas a una tabla nueva (`equifax_analisis_credito`) con una versión nueva de las tablas (`EQUIFAX_TABLAS_VERSION`) y reconstruir las consultas guardadas con `cargar-tablas-equifax.mjs`, sin volver a pagar.

| Variable del modelo | Campo de Equifax | Qué es |
|---|---|---|
| `cred_mayor` | `MCAMontoOriginal` | Monto original del mayor crédito aprobado (la fecha, `MCAFecConcesion`, tiene mediana de 25 meses antes de la consulta) |
| `cred_12m`, `cred_24m` | `CMRMontoOriginal`, `CMAMontoOriginal` | Mayor crédito «reciente» (mediana de 12 meses) y «actual» (mediana de 38 meses) |
| `deuda_total`, `n_inst` | `PCTotalAdeudado`, `PCNumIfisActuales` | Total adeudado y número de instituciones con deuda |
| `n_creditos`, `valor_creditos`, `saldos_vig` | `RECACreditosAprobados`, `RECAValCreditosAprobados`, `RECAValSaldosVigentes` | Créditos aprobados, su valor y los saldos vigentes |
| `deuda_actual`, `deuda_3m` | `TDeudaActual`, `TDeudaHace3Meses` | Deuda actual y de hace 3 meses |

Un crédito con fecha de concesión **posterior a la consulta** no se usa como señal (en el entrenamiento se anula): puede ser el crédito que se está pidiendo.

Las demás variables del nivel 2 salen de las tablas que ya existen (`docs/equifax.md`):

| Variable del modelo | Fuente en CrediScope |
|---|---|
| `cuota_fin` | `equifax_resumen.impacto_economico_cuota_financiera_usd` (igual a `cuota_estimada_mensual_usd` en las 5.001 respuestas medidas) |
| `h12`, `h6`, `hact`, `g6`, `g12` | `equifax_indicadores_por_periodo` (origen `historico_cuota_estimada`, retroactivo de −12, −6 y 0 meses) y sus cocientes; **el historial existe solo en el JSON** (desde diciembre de 2025) y falta en el 69% de las consultas del entrenamiento |
| `c_consumo`, `c_tarjeta`, `c_micro`, `c_vivienda`, `c_comercial`, `c_educativo`, `s_*`, `n_*` | `equifax_operaciones`, solo rol titular, sumando `cuota_mensual_usd` y `saldo_deuda_usd` por `tipo_credito` |
| `c_codeudor` | `equifax_operaciones` con rol codeudor o garante |
| `max_dias_t`, `max_mora` | máximo de `dias_morosidad` del titular y `factores_maximo_dias_vencido` |
| `saldo`, `n_oper` | Saldo total y número de operaciones del detalle |
| `sri_ruc`, `sri_estado`, `sri_antig`, `sri_susp`, `sri_obligado` | `equifax_resumen`: `sri_tiene_ruc`, `sri_estado_contribuyente`, `sri_fecha_inicio_actividades`, `sri_fecha_suspension_definitiva`, `sri_obligado_a_contabilidad`. **Ya se extraen hoy** (`equifax-tablas.ts`); en el nivel 2 se toman de acá, igual que en el entrenamiento, no del RUC de Novadata |
| `sri_clase`, `sri_ciiu_secc`, `sri_ciiu_div` | `equifax_resumen.sri_clase_contribuyente` y `sri_codigo_ciiu` (sección: la primera letra; división: la letra y los dos dígitos siguientes). Solo en el nivel 2: Novadata no los trae |

### 4.3 Datos internos: no entran (decisión del negocio del 2026-10-22)

El extracto de AWS trae, además, datos que la persona o el analista declaran en la solicitud. Se midieron (12.24) y **ninguno entra al modelo ni se pide**: el patrimonio es parte de otro análisis, a cargo de una persona (un analista), los gastos no se piden y la entrada no aplica,
porque el crédito de consumo no la tiene (es de los créditos hipotecario y automotriz). Lo medido, sobre el nivel 2 y en todo AWS:
- **Patrimonio propio** (vivienda, terreno, vehículo, muebles y enseres, inventario, maquinaria y otros; `activo_*` de `persona_patrimonio`): +0,005 de R².
- **La entrada del crédito** (`activo_entrada`), que AWS guarda como un rubro de patrimonio pero es una condición de la operación pedida (créditos automotriz e hipotecario): +0,010. No aplica al producto.
- **Los egresos declarados** (gasto familiar, arriendo, hipotecario, pensión alimenticia y otros): +0,003, solo en 2026 y sobre todo en lo declarado (parece consistencia entre dos declaraciones de la misma persona, no evidencia aparte).
  `egreso_gasto_financiero` tampoco cuenta: es la cuota de Equifax del titular (igual en el 94,5% de los casos).
- **Los pasivos del buró** (`pasivo_*`: SBS, SEPS, INFOCOM e hipotecario) y **la conducta con la propia institución** (`incumplimiento_*`): +0,000. Los primeros ya los trae el nivel 2.
- **No entra** `persona_ingreso_declarado`: es la propia etiqueta.

Lo que sí tiene CrediScope del patrimonio es el valor de todos los vehículos de la persona (Novadata), que el modelo de score lee como colateral; para el predictor es una variable posible y sin entrenar (4.1).

### 4.4 Lo que no es entrada

El predictor de Equifax (`IncomePredictor` y el ingreso del indicador de impacto económico), las salidas de la segmentación de Equifax (capacidad de pago, cuota del monto aprobado) y todo lo que el analista veía y fijaba después (decisión, respuesta comercial, perfil final).
La respuesta comercial y la marca de cómo se armó el ingreso solo se usan para medir.
Tampoco son entrada, por decisión del negocio del 2026-10-22, las rentabilidades por giro (las fija crédito, según el giro del negocio, sobre un flujo real de ingresos armado con estados de cuenta y declaraciones de IVA)
ni «SD» (sin documentos: el analista decide no pedir respaldo de ingresos, patrimonio ni estabilidad): solo sirven para aclarar los datos con que se entrena.

## 5. El modelo

**Algoritmo.** Regresión de cuantiles con árboles de gradiente (LightGBM), un modelo por cuantil: 0,05; 0,10; 0,15; 0,20; 0,30; 0,40; 0,50; 0,60; 0,70; 0,80; 0,90 y 0,95, de 170 árboles y 15 hojas, sobre el **logaritmo** del ingreso. Un modelo por nivel.
Las variables de texto (provincia, cantón, actividad, sexo, estado civil) entran como categorías. Los cuantiles se ordenan para que no se crucen.

**Objetivo.** Ingreso no verificado: el total calculado menos lo recuperado de Novadata (el salario del IESS). Independientes con ingreso no verificado mayor que cero.

**Población y etiqueta.** Solicitantes de crédito de AWS (el 96% automotriz; solo 68 de 57.061 son de consumo, y para el negocio son el mismo producto, 12.27; una solicitud por persona, la más reciente), todas las respuestas comerciales; medido con OK FACTURAR y condicionado. Se mantiene este entrenamiento (12.21: sin los «sin respuesta» casi no cambia).

**De los cuantiles a la respuesta.**
- Mínimo certificado: cuantil 0,10 (seguridad del 90%) y cuantil 0,15 (85%).
- Valor central: cuantil 0,50.
- Probabilidad de cada tramo: se interpola la función de distribución entre los cuantiles (`cdf`) y se resta; se ajustan los extremos para que sumen uno.
- Límite de medio salario básico: `max(mínimo, SBU del año / 2)`.

**Calibración por institución.** Por producto no se calibra: automotriz y consumo son lo mismo para el negocio (12.27). Pero una institución con otra clientela, como una de microcrédito o una cooperativa, tiene otros ingresos (12.19). Con al menos 500 casos de esa institución con ingreso verificado se desplaza el mínimo con el método de la calibración conforme de cuantiles
(Romano, Patterson y Candès, 2019): se calcula, para esos casos, `cuantil0,10 − ingreso real`, y al mínimo se le resta el cuantil `(1 − 0,10)(1 + 1/n)` de esas diferencias. Sin esos casos, el campo `calibradoPara` queda vacío y la respuesta lo dice.

**Calibración medida** (12.26, `scripts/predictor-ingresos/calibrar.py`; entrenado hasta junio, probado de julio a octubre). El método de arriba, con los casos de calibración en logaritmo (el desvío es `log(cuantil) − log(ingreso real)` y el mínimo se multiplica por `exp(−corrimiento)`; en dólares da casi lo mismo, 89,8% contra 89,9%, pero en logaritmo baja el mínimo en proporción y no puede dejarlo negativo).
Los casos de calibración son las **predicciones fuera de muestra** (validación cruzada de cinco particiones) de los mismos casos con que se entrena, y el modelo que se sirve es el entrenado con todos: no se aparta ningún caso. Resultado: el real supera el mínimo del 90% el **90,4%** de las veces en el nivel 1 (89,8 a 91,1; el nivel de la decisión del 2026-10-29, 12.30) y el **89,6%** en el 2 (88,9 a 90,2),
contra 89,1% y 87,4% sin calibrar; el del 85% pasa a 85,8% y 84,7%. **Cuesta mínimo**: la mediana del mínimo del 90% baja 3,9% en el nivel 1 (de 1.021 a 981) y 6,4% en el 2 (de 1.138 a 1.065), y «al menos 2.000» se certifica en el 18,3% del total en el nivel 2 en vez del 20,4%, con 95,8% de precisión en vez de 94,8%. Los corrimientos medidos son 0,040 y 0,066 (el nivel 1 anterior pedía 0,056).
Calibrando solo con los dos últimos meses (mayo y junio) la cobertura queda en 89,3% en el nivel 1 (sin corrimiento) y 88,9% en el 2: lo que no corrige del todo es la deriva en el tiempo. **Con pocos casos hay dispersión**: en el nivel 2, con 500 casos la cobertura va de 87,3% a 91,3% según cuáles toquen (entre el 5% y el 95% de los sorteos), con 1.000 de 87,7% a 90,3% y con 2.000 de 88,3% a 89,7% (en el nivel 1, de 87,8% a 91,7%, de 88,3% a 90,8% y de 88,6% a 90,0%); el mínimo de 500 casos por institución basta para el promedio, no para estrechar el margen.
El modelo exportado no está calibrado (`calibradoPara` queda vacío): el corrimiento se aplica cuando el negocio lo decida y se vuelve a medir con el modelo final. Un modelo calibrado se informa con la cobertura medida después de calibrar y su intervalo, no con la nominal.

**Reproducibilidad.** Semilla fija, versiones de las bibliotecas y la huella del archivo de entrenamiento quedan en la fila del modelo (sección 6.4). Los datos de entrenamiento no entran al repositorio.

## 6. Cómo se construye en CrediScope

El orden respeta la regla de que un módulo nuevo tiene su propia puerta y que el marco y el modelo de lenguaje se tocan al final.

1. **Variables** (`_shared/variables-de-ingreso.ts`): arma el vector de entrada de cada nivel desde el perfil y desde Equifax, con la regla del crédito posterior a la consulta. Una sola implementación; se prueba con respuestas inventadas (`equifax-respuesta-de-prueba.ts`).
2. **Evaluador** (`_shared/predictor-ingresos.ts`): lee el modelo exportado de LightGBM (`dump_model` en JSON), con divisiones numéricas, categóricas (conjunto de categorías) y valores faltantes con su dirección por defecto. Devuelve los doce cuantiles.
   **Prueba de oro**: 200 casos fijos con la salida del modelo en Python, que el evaluador reproduce con una diferencia menor que 0,001 en el logaritmo.
   **Tamaño medido**: cada nivel son 12 modelos y 2.040 árboles (28.560 divisiones); el `dump_model` pesa unos 13 MB sin comprimir y 2,2 MB comprimido. Las divisiones son de dos tipos: numéricas (`<=`) y por categoría (`==`, con la lista de categorías separada por `||`),
   y cada una con su regla para el valor faltante (hacia la izquierda o la derecha). Conviene exportar a un formato compacto propio en vez de cargar el JSON entero. Los cantones tienen unas 215 categorías (y la provincia 24); la actividad no entra por ahora (4.1).
3. **Extraer `AnalisisCreditoSectorFinanciero`** en `equifax-tablas.ts` (tabla nueva, versión nueva, migración); reconstruir con `cargar-tablas-equifax.mjs --seco` primero.
4. **Base**: `modelos_de_ingreso` (versión, nivel, estado, huella, fecha, población, métricas, ruta del archivo en Storage privado) y `estimaciones_de_ingreso` (persona, solicitud, nivel, versión, variables usadas sin identificadores, salidas, calibración, fecha). RLS por rol y privilegios por defecto sin rol anónimo.
   La tabla nueva con datos de la persona se suma a `suprimir_titular()`, a `scripts/derechos-del-titular.mjs` y a `scripts/auditar-seguridad.mjs`. Cada versión nueva del modelo necesita su fila. La migración toma el número libre al aplicarse, con el corredor.
5. **Puerta propia**: función `estimar-ingreso` (con `exigirRol()` antes de leer el cuerpo y el límite de la sesión) y la operación `POST /estimaciones-de-ingreso` en `api/openapi.yaml`, con ejemplos calculados con el propio código y sin nada con forma de JWT; se valida con `redocly lint`. El pedido no recibe patrimonio, gastos ni entrada: no son entradas del predictor (4.3).
6. **Capacidad de pago** (`capacidad-de-pago.ts`): un tipo de ingreso nuevo `estimado` junto a `sueldo`, `aporte_propio` y `declarado`. Se mide con el **mínimo certificado**, nunca con el valor central, y el resultado se rotula «ingreso estimado, sin verificar», como el Ingreso declarado.
7. **Pantalla**: una tarjeta de ingreso con tres líneas posibles (verificado, estimado, referencia), con las etiquetas propias de CrediScope y sin explicar conceptos de crédito (pantallas para personal capacitado). **Los nombres los decide el negocio**; propuesta, a decidir: «Ingreso verificado», «Ingreso mínimo estimado» y «Referencia de su tipo».
8. **Entrenamiento** (`scripts/predictor-ingresos/`, en Python, sin datos): reproduce las medidas de esta especificación y exporta el modelo. Hoy los guiones viven en `C:\datos\ingresos\scripts`.

Un paso por PR, de abajo hacia arriba: 1 y 3 (variables y tabla de Equifax), 2 (evaluador con su prueba de oro), 4 (base), 5 (puerta), 6 (capacidad) y 7 (pantalla).

## 7. Vigilancia y reentrenamiento

Lo que se mide cada mes, con los casos en que después aparece un ingreso verificado (un empleo en el IESS, documentos, una solicitud decidida con ingreso validado):

| Medida | Objetivo | Se revisa si |
|---|---|---|
| El real supera el mínimo del 90% | de 88% a 95% | baja de 85% o sube de 97% dos meses seguidos |
| Tramo exacto, y tramo o vecino | los de la sección 3.1 | caen más de 5 puntos |
| Cambio de la distribución de cada variable de entrada (índice de estabilidad de la población) | menor que 0,10 | mayor que 0,25 en una variable |
| Personas con variables sin dato | las del entrenamiento | sube más de 10 puntos |
| Cobertura por institución y por producto | igual que la general | difiere en más de 8 puntos |

**Disparadores de reentrenamiento**: cada trimestre; al llegar los 3,9 millones del proveedor; al cambiar el salario básico (cada año: la fecha entra como variable y los tramos de 470 y 940 se mueven); al cambiar una institución o un producto; o ante cualquiera de las alertas de arriba.
**Un modelo nuevo no pasa a vigente sin compararlo con el vigente sobre los mismos casos** y sin su fila. Cualquier cambio en la respuesta de Equifax (una versión nueva de `EQUIFAX_TABLAS_VERSION`) vuelve a correr la prueba de paridad de la sección 9. La fecha como variable hace que el modelo no
extrapole: más allá del último mes entrenado se comporta como en ese mes.

## 8. Límites que el producto debe decir

1. **Es una estimación sin verificar.** El mínimo certificado es en mediana la mitad del ingreso calculado; no es el ingreso.
2. **Está calibrado con solicitantes de AWS**, que en su 96% piden crédito automotriz (54.906 de 57.061 independientes; 68 son de consumo). Para el negocio el automotriz y el de consumo son lo mismo (12.27), así que no se rotula por producto; para una institución de microcrédito o cooperativa, sin calibrar, la cobertura no está medida.
3. **La etiqueta no es verdad absoluta**: el ingreso calculado se hizo después de ver el predictor de Equifax, se edita (en el 75% de los OK FACTURAR) y en los rechazos baja (razón de 0,46). El mismo cálculo repetido cae en el mismo tramo el 88% de las veces.
4. **Con Novadata solo la persona se distingue poco de la población** (R² de 0,157 con la edad, el sexo y su SRI; sin el SRI, con el nivel anterior, 0,091). Sin el «obligado a llevar contabilidad», que el perfil todavía no guarda, no certifica «al menos 2.000» a nadie (12.30).
5. **No estima el ingreso adicional de un dependiente** ni el de un jubilado más allá de la referencia por afiliación.
6. **Los ingresos bajos no se pueden certificar** con este modelo: AWS casi no los tiene. El 0,56% de los solicitantes ganan menos de medio salario básico.
7. Aval, sin consultas con ingreso calculado, usa el nivel 1.
8. **El SRI solo existe en las respuestas JSON de Equifax (desde diciembre de 2025)**: el modelo con SRI se entrena con 2026 (21.260 independientes) y no se probó con quien no tiene RUC ni aporte al IESS (el 87% de los independientes de AWS tiene RUC).
   Hacia adelante (entrenar hasta junio, medir de julio a octubre) el real supera el mínimo del 90% el 87,4% de las veces en el nivel 2 y el 89,1% en el 1 (93% y 96% en OK FACTURAR): entre 0,9 y 2,6 puntos por debajo del 90% nominal hasta que se calibre (sección 5, que mide cuánto lo corrige). Quien no tiene RUC cubre 87,4% y 83,1% (12.26 y 12.30).
9. **La paridad de los datos de la persona entre el extracto de AWS y Novadata se midió con 542 independientes de 2023 a 2025, sin el SRI de Equifax** (12.29): la edad y el sexo coinciden en el 99,6%, el estado civil en el 92,4%, el domicilio en el 86% (provincia) y el 71% (cantón), y Novadata lo trae solo en el 37%; no trae el lugar de trabajo. El aporte al IESS coincide en el 84%, los empleos en el 67% y los meses con aporte en ninguno de 99 casos. **La del SRI de Novadata contra el de Equifax sigue como en 12.24 (87 personas)** y la mitad con el SRI de Equifax (consultas de 2026) no se alcanzó (sección 10). Novadata sí da RUC para 512 de las 542 (12.30).
   Contra la respuesta cruda de Equifax (17.354 consultas, sin cruzar identificaciones): la edad coincide (fecha de nacimiento idéntica en el 88,8% y a un año en el 99,9%) y la zona no (provincia de domicilio 88,5%, cantón 75,2%; de trabajo, 80,0% y 70,0%); el sexo y el estado civil no se pudieron medir contra Equifax (solo trae 563 de 20.000 y ninguna está en el extracto), y AWS los tiene completos (12.27).
   Con la medida (12.29) el negocio decidió el 2026-10-29 el nivel 1 con la edad, el sexo y el SRI, sin estado civil, zona ni IESS; el modelo exportado ya es ese (12.30). La prueba en sombra con el perfil de CrediScope de 532 de esas personas cubre lo mismo que la prueba hacia adelante en AWS (89,1%).
10. **No está medido con el ingreso verificado de otra institución** (12.27). Por producto no hace falta medir: automotriz y consumo son lo mismo para el negocio.

## 9. Pruebas de aceptación

1. **Paridad de las variables de Equifax** (medida el 2026-10-22 con `scripts/probar-paridad-variables-de-ingreso.mjs`): las 5.001 respuestas crudas (`muestra_respuestas_equifax.jsonl`) pasan por `derivarTablas` y por `variables-de-ingreso.ts`, y lo que sale se compara con el extracto de AWS con el que se entrenó el modelo.
   Corre igual en Node y en Deno (salidas idénticas) y sale con 1 si una paridad baja de su umbral; se repite al cambiar una regla de `equifax-tablas.ts` o de `variables-de-ingreso.ts`, o la respuesta de Equifax (sección 7).
   - **Coincide**: las diez variables de `AnalisisCreditoSectorFinanciero` (4.499 de 4.499; en las otras 502 la respuesta trae el bloque vacío y la tabla guarda una fila de nulos) y la fecha de concesión del mayor crédito; la cuota estimada y `cuota_fin`, el historial (`h12`, `h6`, `hact` y las proyecciones a +6 y +12) y los cocientes `g6` y `g12`, 5.001 de 5.001 (los cocientes, hasta el redondeo a centavos de las cuotas: diferencia máxima de 0,003);
     el SRI de la respuesta (RUC, estado, clase, obligado, CIIU y las dos fechas), 5.001 de 5.001.
   - **No coincide: las cuotas, los saldos y los conteos de las operaciones.** El extracto de AWS no salió de `reporteCrediticio.detalle_deuda_actual_*` (de donde sale `equifax_operaciones`, como decía 4.2) sino de las listas `DetalleDeudaActualReportadaRFRSBS`, `...SICOMSBS` y `...SBSSBS_Educativo` de `interconnectResponse`. Medido por consulta (de 5.001; los totales, de las 4.783 que los tienen):

     | Variable | Desde `equifax_operaciones` | Desde las listas de `interconnectResponse` (medido, no construido) |
     |---|---|---|
     | `c_consumo`, `c_tarjeta` | 48,7%, 50,4% | 74,5%, 80,2% |
     | `c_micro`, `c_vivienda`, `c_comercial`, `c_educativo` | 88,2%, 91,9%, 98,3%, 100% | 94,2%, 97,3%, 99,6%, 100% |
     | `s_consumo`, `s_tarjeta`, `s_micro`, `s_vivienda` | 78,6%, 94,7%, 98,9%, 99,5% | 75,7%, 80,2%, 94,8%, 97,5% |
     | `n_consumo`, `n_tarjeta`, `n_micro`, `n_vivienda` | 65,1%, 94,1%, 98,8%, 99,5% | 78,0%, 80,2%, 95,1%, 97,5% |
     | `c_codeudor`, `max_dias_t` | 92,9%, 87,6% | 97,1%, 89,0% |
     | `n_oper`, `saldo`, `max_mora` | 65,6%, 84,4%, 88,8% | 85,9%, 93,5%, 91,4% |

     Tampoco las listas de `interconnectResponse` reproducen el extracto: en 610 consultas traen más filas que AWS (en 63, menos); en 503 la diferencia es de una sola fila y en 410 esa fila es de ceros del sector comercial (un titular, tipo consumo, saldo 0), pero descartar todas las filas de saldo 0 de ese sector baja los conteos iguales de 4.110 a 2.960 de 4.783: no se encontró la regla.
     **Hasta resolverlo, el nivel 2 recibe en estas 19 variables algo distinto de lo que aprendió el modelo.** `variables-de-ingreso.ts` las arma de `equifax_operaciones` (lo que dice 4.2) y lo declara en `pendientes`; decidir entre entrenar con las variables que arma este módulo sobre las respuestas JSON crudas (una sola implementación: lo recomendado) o extraer también las listas de `interconnectResponse`, que es otra tabla y vuelve a poner dos fuentes de la misma deuda.
   - **Correcciones a esta especificación**:
     `max_mora` es el máximo de `dias_morosidad` de todas las operaciones, no `factores_maximo_dias_vencido` (coincide en 4.086 de 4.602 contra 1.508);
     en 4.1, «no contestó» es `fuentesNoMedidas` (o no figurar), no `fuentesSinDatos`: esa lista es «contestó y no había nada» (`process.ts`), o sea sin RUC;
     `meses_aporte` y `n_empleos` del extracto cuentan todo el historial del IESS (hasta 93 meses y 18 empleos) y el perfil sólo guarda 24 meses de detalle, así que el módulo los arma de las filas mensuales de `trabajoHistoricosMecanizado` que le pase quien lo llame, con una definición sin confirmar contra AWS;
     el perfil no trae provincia ni cantón de domicilio y de trabajo ni el «obligado a llevar contabilidad» de Novadata, y las categorías de AWS (sexo, estado civil, provincia y cantón) no se cotejaron con las de Novadata: el mapeo es una interfaz (`MapeoDeCategorias`). Desde el 2026-10-29 `MAPEO_DE_NOVADATA` lleva el sexo, medido (las mismas dos categorías, 540 de 542; 12.29), y deja sin dato el estado civil, la provincia y el cantón, que solo usa el nivel 2.
   - **Corrección a 12.22**: la «concesión posterior a la consulta» no existe. Con las fechas leídas como vienen (dd/mm/yyyy) hay 0 de 4.499 en los tres créditos mayores; el −8,7 meses salía de leerlas como mes/día. Y en el entrenamiento la regla del crédito posterior nunca corrió: `try_cast` de DuckDB dio nulas las 116.673 fechas.
     `variables-de-ingreso.ts` la aplica a los tres créditos (hoy no cambia ningún valor), y sirve el modelo igual que se entrenó, que fue sin anular nada.
2. **Prueba de oro del evaluador**: 200 casos, diferencia menor que 0,001 en el logaritmo de cada cuantil.
3. **Cobertura**: sobre OK FACTURAR y condicionado, con la validación por fecha, el real supera el mínimo del 90% entre el 88% y el 95%. Hoy se entrena hasta junio de 2026 y se prueba de julio a octubre, porque el SRI solo existe desde diciembre de 2025:
   95,7% en el nivel 1 y 94,3% en el 2 (1.613 casos). Sobre todos los casos baja a 89,1% y 87,5% (12.24 y 12.30). Con las entradas de producción (la prueba en sombra, 82 casos de OK FACTURAR), 93,9% en el nivel 1.
4. **Sin regresión**: un modelo nuevo no baja el R² ni la cobertura del vigente en los mismos casos.
5. **Privacidad**: la respuesta y las tablas no llevan identificaciones; el control `auditar-seguridad.mjs` y `derechos-del-titular.mjs` cubren la tabla nueva.
6. **Lenguaje**: `scripts/revisar-textos.mjs` sin términos retirados (no se dice «piso» en ingresos).
7. **Paridad del SRI de Novadata con el de Equifax**: en las personas que tienen las dos fuentes, el RUC, la fecha de inicio y el estado que arma el módulo de variables desde Novadata coinciden con `equifax_resumen`. Hoy: tiene RUC, 87 de 87; fecha de inicio, 83 de 83; estado, 81 de 83; obligado a llevar contabilidad (estructura-v15), 83 de 83 (60 no y 23 sí; ninguna con la «S» abreviada de Novadata, que sigue sin cotejar).
   Se repite al crecer las consultas de Equifax en la base y no puede bajar de eso.
8. **Paridad de los datos de la persona**: edad, sexo, estado civil, provincia y cantón de domicilio y de trabajo, y aporte, meses con aporte y empleos del IESS, que arma el módulo desde Novadata, coinciden con los del extracto de AWS en las personas que están en las dos fuentes.
   Medida el 2026-10-28 con 542 independientes de 2023 a 2025 (12.29, sección 8): edad 99,6%, sexo 99,6%, estado civil 92,4%, provincia de domicilio 86%, cantón 71%, aporte 84%, empleos 67% y meses con aporte 0%; el lugar de trabajo no se puede armar. Con eso el negocio decidió el 2026-10-29 el nivel 1 con la edad, el sexo y el SRI, reentrenado sin las demás (12.30).
   El nivel 2 todavía las tiene (del extracto de AWS) y se decide al reentrenarlo desde las respuestas crudas de Equifax. Se repite con el lote completo (1.620 de las 2.162 sin respuesta buena).
9. **Prueba en sombra del nivel 1** (12.30; `node scripts/sombra-predictor-ingresos.mjs` y `scripts/predictor-ingresos/medir_sombra.py`): las personas de AWS reconsultadas en Novadata, con las variables armadas desde su perfil de CrediScope y evaluadas con `predictor-ingresos.ts`, contra su ingreso validado.
   Medida el 2026-10-29 con 532: el real supera el mínimo del 90% el 89,1% (86,5 a 91,7) y el del 85%, el 85,0%; hacia adelante en AWS, 89,1% y 84,8%. Se repite al completar el lote y con cada modelo nuevo del nivel 1, y no debería quedar más de dos puntos por debajo de la prueba hacia adelante.

## 10. Lo que falta decidir o conseguir

| Qué | De quién | Por qué importa |
|---|---|---|
| Sumar el «obligado a llevar contabilidad» al perfil (decidido el 2026-10-29): estructura nueva (estructura-v15), recalcular los perfiles guardados y una versión nueva del marco, porque el modelo de lenguaje lee `laboral` entero; y medir su paridad con el de Equifax | Claude, con el sí del negocio para recalcular y para el marco | Sin él el nivel 1 pierde 0,027 de R² y no certifica «al menos 2.000» a nadie (12.30); hoy lo tiene que pasar quien llama |
| Completar la reconsulta a Novadata (1.620 de las 2.162 sin respuesta buena: 986 sin consultar y 634 con error o sin datos), con menos hilos y primero la mitad con el SRI de Equifax (consultas de 2026); después, entrenar con los datos tal como los arma CrediScope. Queda para después (decisión del 2026-10-29) | Negocio: autoriza y decide el ritmo (la base legal del lote ya se declaró, 12.29) | Mide el SRI de Novadata contra el de Equifax con más personas (el nivel 1 depende de él) y permite probar el valor de los vehículos (4.1). A 20 hilos Novadata falló en la mitad de los perfiles de ese rango (12.29); AWS no guarda la respuesta de Novadata |
| Cotejar el SRI de Novadata con el de Equifax en más de 87 personas, incluido el `obligado`, y ver si el texto de la actividad de los establecimientos de Novadata (`act_economica`) se lleva a un CIIU | Claude, con la base de CrediScope (crecen con cada consulta de Equifax) | El nivel 1 depende de que Novadata dé el mismo SRI que se usó para entrenar; con la clase y el CIIU ganaría +0,020 de R² (4.1) |
| Casos con ingreso validado de otra institución | Cada institución | Calibración por institución (sección 5), no por producto: el negocio dijo el 2026-10-28 que automotriz y consumo son lo mismo (12.27). El ingreso verificado es el validado de AWS (2026-10-22) |
| La destilación del predictor de Equifax (400.000 consultas en cinco años): el negocio la quiere para mejorar la asertividad (2026-10-29); falta decidir si se hace igual | Negocio | Lo medido no la respalda: destilar no mejora la predicción del ingreso validado (0,342 contra 0,341 de R²); serviría para independizarse de ese predictor (12.28) |
| La base de 3,9 millones | Proveedor (en proceso, 2026-10-22) | Reentrenar con una población menos sesgada hacia quien pide crédito |
| Confirmar `p42` (categoría de ocupación) y `nnivins` (instrucción) de la ENEMDU | INEC (el formulario o los tabulados con códigos; no están en los archivos revisados) | Los de la ENIGHUR y `p05a` de la ENEMDU se confirmaron el 2026-10-26; la selección de independientes de la ENEMDU coincide con la ruta del cuestionario, así que la cifra no cambia (12.27) |
| Los nombres de pantalla (propuesta en 6.7) | Negocio | Los nombres los decide el negocio |
| La tabla de rentabilidades por giro de AWS (comercio y servicios generales 0,30; fabricación, agricultura, construcción, transporte y telecomunicaciones 0,40; servicios profesionales 0,70; arriendos 1,00): el negocio dice que son valores genéricos que no nacen de una metodología válida | Negocio | Escalan el ingreso calculado de cuentas e IVA, el 32% de lo que se mide: la garantía aguanta que estén infladas hasta un 30%; si lo estuvieran más, la cobertura baja (12.27) |
