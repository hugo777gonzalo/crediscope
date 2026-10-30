# Investigación: soluciones existentes para el predictor de ingresos

Etapa 2.5 del plan del negocio del 2026-10-15. Escrito el 2026-10-16, solo con
lectura: web y repositorio. **No se consultó la base ni `research/`** (datos
personales), así que ninguna cifra de CrediScope sale de acá salvo las que ya
estaban escritas en `docs/plan-demo-ifi.md`. **Nada de lo que dice «recomiendo»
está decidido ni construido.**

## 0. Lo esencial

1. **No existe una solución publicada que resuelva el problema completo.** Lo que
   se encontró resuelve piezas: censura (la verdad es una cota inferior), cambio
   de población, estimación por áreas pequeñas y cuota implícita. Los burós
   (Equifax, TransUnion, Serasa) venden estimadores de ingreso como **caja negra**:
   no publican variables, método ni error contra un ingreso verificado.
2. **Lo más cercano a lo nuestro es local y está en español**: tres trabajos de
   grado de la Escuela Politécnica Nacional (2023) hechos con el registro
   crediticio ecuatoriano y un ingreso reportado a una entidad financiera. Uno
   compara contra el predictor de ingresos de un buró (sin nombrarlo) y dice que
   «se concentra alrededor de USD 500» y subestima desde USD 2.000 (sección 4.1).
   Es la única descripción pública de ese comportamiento. **No es evidencia de
   que sea el predictor de Equifax**: la tesis no nombra al buró.
3. **El problema de la verdad imperfecta tiene herramientas maduras**: regresión
   de supervivencia con rangos (XGBoost `survival:aft`), Tobit con árboles o redes,
   bosques de supervivencia, e intervalos conformales para censura. Sirven para
   tratar el aporte al IESS de un independiente como lo que es: un mínimo, no un
   valor. Ninguna está probada en Ecuador ni con datos del IESS (secciones 4.8 y 4.9).
4. **La reponderación por cambio de población ayuda poco si no hay solapamiento**:
   entrenar con dependientes y aplicar a independientes es extrapolar. La
   literatura de «inferencia de rechazados» (el mismo problema en crédito) es
   escéptica: reduce el sesgo pero no lo elimina (secciones 4.13 y 4.15).
5. **El mejor complemento barato es una previa por encuesta**: la ENEMDU (INEC) es
   de acceso abierto (CC BY 4.0) y representativa a nivel provincial, **no
   cantonal** (sección 4.20). Sirve como contraste y como característica, no como
   valor para una persona.
6. **La señal más fuerte sigue siendo el crédito otorgado**, como cota inferior
   (`plan-demo-ifi.md` 3.3). La bibliografía respalda la idea y agrega dos
   avisos: el ingreso que declara quien pide un crédito se exagera, y la regla de
   cuota/ingreso hay que **conseguirla**, no deducirla (sección 4.10).
7. **Falta lo más importante**: ingreso verificado de personas reales (el de una
   IFI). Sin él, nadie —ni nosotros ni Equifax— puede decir cuánto se equivoca
   una estimación para un independiente. Ver sección 7.
8. **Actualización del 2026-10-17 (sección 8)**: el negocio informó que tiene los
   3,9 millones de afiliados al IESS con ingreso verificado y 120.000 personas con
   el estimador de Equifax (45% con ingreso real). Eso cambia el problema: la
   verdad deja de ser escasa y pasa a estar **en la población equivocada**. El
   diseño por tramos (hasta 2.000 con modelo; desde 2.000 con cuota y
   endeudamiento) está en la sección 8. Los puntos 1 a 7 se escribieron sin saber
   esto y siguen valiendo para lo que no cubre.

## 1. Cómo se hizo y cómo leer los estados

Se buscó por los cinco problemas del encargo y se abrió cada fuente que se pudo.
Cada ficha lleva un **estado de verificación**:

| Estado | Significa |
|---|---|
| **Leído** | Se abrió el documento o la página y se leyó lo que se cita. |
| **Resumen** | Solo se vio el resumen o la ficha que devolvió el buscador; el original no se abrió (descarga bloqueada, de pago o no probada). Las cifras son las del resumen. |
| **No confirmado** | Un dato que no se pudo verificar; se dice cuál. |

Las métricas que aparecen son las **publicadas por sus autores**, con su propia
definición; no son comparables entre sí. Donde la fuente no publica una métrica
está escrito «sin métrica publicada». **No se inventó ninguna.**

Búsquedas que no devolvieron nada útil (importa para no repetirlas): documentación
pública del `IncomePredictor` de Equifax en Ecuador; métodos de los estimadores de
ingreso de Datacrédito, Buró de Crédito, Círculo de Crédito, Equifax Perú/Chile o
Nosis; un artículo del BID que estime ingresos de informales con datos de crédito;
trabajos de J-PAL o del MIT Sloan que estimen el ingreso individual con datos de
burós; notas técnicas de Nubank, Mercado Pago, Konfío o Creditas sobre estimación
de ingreso. **«No se encontró» no prueba que no existan**: pueden ser internos.

## 2. Lo que tenemos (variables)

Leído de `plan-demo-ifi.md` (secciones 2 y 3), los tipos de `fuentes-ingreso.ts`,
`estructura-estandarizada.md` y `propuesta-estructura-equifax.md` (sección 5).

| Grupo | Variables disponibles | Observación para el predictor |
|---|---|---|
| **Verdad parcial** | Ingreso reportado al IESS (`montoMensualReportado` por fuente; promedio de 6 y 12 meses; aporte por mes de 24 meses). 1.713 de 2.573 personas (67%). | Aproxima el ingreso del dependiente. En independientes y afiliados voluntarios es un mínimo: casi siempre el **Ingreso Mínimo SBU** (`esIngresoMinimoSbu()`). |
| **Calidad de la evidencia** | `CalidadEvidencia`: reportada por un tercero / autodeclarada sobre el mínimo / autodeclarada en el mínimo / indirecta. | Ya distingue qué parte del IESS es verdad y qué parte es cota. Es la marca natural para la censura. |
| **Trabajo** | Segmento y estado, perfil laboral, empleos con ocupación, antigüedad y continuidad, tipo de empleador, RUC activo, actividades económicas, nómina que paga, empleados, establecimientos activos (SRI), obligado a contabilidad, impuesto a la renta por año (indicio, nunca monto). | Tipo y tamaño del negocio son lo que más separa a los independientes. |
| **Indicios de ingreso mayor** | `indiciosDeIngresoMayor()` (509 personas). | Reglas fijas; la regla del negocio prohíbe convertirlas en monto. |
| **Demografía** | Edad, género, estado civil, nivel de educación, profesiones, cantón y provincia **de nacimiento** (no de residencia). | La ENEMDU se tabula por estas variables. |
| **Geografía** | Novadata: en el perfil, solo el número de direcciones; en el **crudo**, parroquia, cantón y provincia de cada dirección (10 de 25 personas en la muestra del catálogo; ver 9.3). Equifax: provincia, cantón, direcciones y coordenadas, solo en el crudo. | **La residencia no está en el perfil**, pero sí en el crudo con cobertura parcial. Para una previa por cantón hay que armarla desde ahí (sección 9). |
| **Patrimonio** | Número de vehículos y avalúo, inmuebles, inversiones (Novadata). | Señal de nivel, sin fecha ni valor de mercado confiable. |
| **Endeudamiento Novadata** | Saldos, calificación A1 a E, operaciones, cuotas **solo en cooperativas**. | Sin cuota en bancos. |
| **Endeudamiento Equifax** | Por operación: saldo, **cuota mensual**, apertura, rol (titular, codeudor, garante); tarjetas (cupo, saldo, uso); créditos otorgados (monto original por tipo); conducta de pago de 24 meses; consultas recibidas; score de Equifax. | La cuota por operación es la entrada del ingreso implícito. Cubre solo a quien tiene buró en esa IFI. |
| **Estimaciones de terceros** | `ingresoEstimadoUsd`, `cuotaFinancieraEstimadaUsd` e indicador de impacto económico (Equifax). Unidad **sin confirmar**. | No entra al modelo; correlación 0,28 con el IESS en 45 personas. |
| **Base de 20.000** | Estimación de Equifax. Estructura, cédula y unidad **desconocidas** (P6). | Define si hay entrenamiento propio. |

**Restricción técnica de este repositorio**: las pruebas pesadas corren en Node
(`scripts/analisis-pesado.mjs`) porque **no hay Python**; en esta máquina el
comando `python` no existe (verificado el 2026-10-16). Las bibliotecas de abajo
son casi todas de Python o R. Hay dos caminos: entrenar fuera y llevar a las
funciones solo coeficientes o tablas, o implementar el modelo simple (un Tobit
lineal, un cuantil) en TypeScript sobre `src/lib/estadistica.js`.

## 3. Mapa de soluciones por problema

| Problema | Soluciones evaluadas | Utilidad para nosotros |
|---|---|---|
| **1. Estimar el ingreso** | 4.1 a 4.4 (EPN y UIS), 4.5 (estimadores de burós), 4.6 (datos alternativos), 4.7 (pruebas de medios) | Referencia de método y de evaluación; ninguna da un modelo reutilizable |
| **2. Verdad imperfecta** | 4.8 (censura), 4.9 (ruido y destilación) | **Alta**: es el centro del problema |
| **3. Crédito otorgado** | 4.10 a 4.12 | **Alta** para la cota; el resto es advertencia |
| **4. Cambio de población** | 4.13 a 4.15 | Media: diagnóstico y límites |
| **5. Áreas pequeñas** | 4.16 a 4.20 | Media: previa por ocupación y provincia |

## 4. Fichas

Formato: **qué es**, entrada, técnica, métricas publicadas, requisitos,
compatibilidad con nuestras variables, adaptaciones, limitaciones. «Estado» al
final de cada ficha.

### Problema 1: estimar el ingreso con variables laborales, demográficas y de endeudamiento

#### 4.1 Estimación de la capacidad de pago de tarjetahabientes con el registro crediticio (EPN, 2023)

- **Autoría**: Farhad Khossro Ghadiri Ayala; dirección de Diego Paúl Huaraca
  Sagñay y Menthor Oswaldo Urvina Mayorga. Trabajo de integración curricular,
  Escuela Politécnica Nacional (Quito), agosto de 2023.
- **Enlace**: <https://bibdigital.epn.edu.ec/bitstream/15000/25047/1/CD%2013839.pdf>
  (el servidor tiene un certificado que algunos clientes no validan).
- **Problema**: estimar el ingreso de personas bancarizadas a partir del registro
  de datos crediticios, para fijar cupos de tarjeta. La población es la de
  tarjetahabientes con cupo.
- **Entrada**: 950.821 personas a diciembre de 2021 con «ingreso real reportado a
  una entidad financiera»; 927.647 (97,56%) con historia de buró. 1.172 variables
  del registro. **Qué buró y qué entidad: no lo dice.** El ingreso «real» es el
  que reportó la persona a una entidad financiera, no un ingreso verificado
  (la tesis no lo discute).
- **Técnica**: regresión lineal múltiple, Random Forest, GBM y XGBoost. Población
  partida en tres grupos por cupo de tarjeta, un modelo por grupo. Selección de
  variables con Kolmogorov-Smirnov (numéricas) y valor de información
  (categóricas). **Remuestreo** de las colas del ingreso (muy bajos y muy altos).
  Reglas de depuración: se excluyen registros con cuota mayor al ingreso, cupo
  de tarjeta mayor a 5 veces el ingreso (solo ingresos menores a USD 1.000) y
  morosidad de 60 días o más.
- **Métricas publicadas** (tabla 3.16, modelo inicial sin remuestreo; la tesis
  no deja claro de cuál de los cuatro modelos es): MSE 139.351 en entrenamiento
  y 147.337 en prueba; error absoluto medio de 274 y 281; «cruce ±» (la
  estimación cae en el rango real) 70,3% y 69,5%; **sobreestimación 25,5%** y
  subestimación 4,2%. Con GBM en el grupo 2, el MSE por rango de ingreso real
  sube de 59.280 (USD 450 a 700) a 2.241.946 (USD 1.800 a 5.000): el error
  crece mucho en los ingresos altos. Eligen GBM; el resumen dice que el
  remuestreo mejoró las colas.
- **Dato que nos importa**: la tesis compara contra «el primer predictor de
  ingresos... modelado por el Buró» y dice que **subestima a quien gana más de
  USD 2.000 y concentra las estimaciones alrededor de USD 500**.
- **Requisitos técnicos**: R (`gbm`, `h2o`), registro crediticio de cientos de
  miles de personas con ingreso reportado.
- **Compatibilidad**: la entrada de la tesis es el buró; nosotros tenemos buró
  (Equifax) y más: IESS, SRI, laboral. **Sin ingreso reportado a una IFI no se
  puede reproducir.** Las 2.573 personas no alcanzan para un modelo tan
  segmentado.
- **Adaptaciones**: usar su **plantilla de evaluación** (matriz de coincidencias
  por rangos de ingreso, MSE por rango, porcentajes de sub y sobreestimación) para
  medir a Equifax y a nuestro modelo con el mismo criterio. Esa asimetría
  (sobreestimar cuesta más que subestimar) es la que importa a una IFI.
- **Limitaciones**: tesis de pregrado, sin revisión de pares; la verdad es un
  ingreso declarado; no publica el error por modelo con claridad; las tablas del
  PDF salen desordenadas al extraer el texto. No hay validación fuera de
  Ecuador.
- **Estado**: Leído (metadatos, resumen, metodología y tablas 3.16 y 3.48-3.49).

#### 4.2 Estimación de la capacidad de pago de personas con cuota estimada (EPN, 2023)

- **Autoría**: Jaime Raúl Toaquiza Cuyo; misma dirección y fecha que 4.1. Es el
  trabajo hermano: otra subpoblación del mismo registro.
- **Enlace**: <https://bibdigital.epn.edu.ec/bitstream/15000/25673/1/CD%2014323.pdf>
- **Problema**: estimar el ingreso de quien **tiene una cuota estimada** (suma de
  la amortización mensual de sus créditos) en el registro. Es el caso más parecido
  al nuestro con Equifax, que también trae una cuota por operación.
- **Entrada**: 950.821 registros y 1.172 variables, tres grupos por cuota
  estimada (hasta USD 107; de 107 a 435; más de 435), más una base de validación
  de 84.877 personas y 1.177 variables.
- **Técnica**: la misma de 4.1 (lineal, Random Forest, GBM, XGBoost; KS y valor
  de información; remuestreo). Elige GBM.
- **Métricas publicadas**: «poder predictivo sobre el 70% de acierto» en las tres
  subpoblaciones (el resumen no define «acierto»; probablemente es el cruce ± de
  4.1: **no confirmado**). En los grupos 1 y 2 las colas «no fueron las
  esperadas»; en el grupo 3 (cuotas altas) la predicción de ingresos muy altos
  fue buena. La tesis afirma que, **por regulación**, una persona no debe destinar
  más del 50% de su ingreso al pago de deudas, y excluye a quien tiene una cuota
  mayor que su ingreso. **Esa norma no se confirmó** (sección 7).
- **Compatibilidad / adaptaciones / limitaciones**: igual que 4.1. Dato útil: el
  90% de la población tiene una cuota estimada menor a USD 1.015 (tabla 3.5), y
  el rendimiento cae donde hay menos datos (cuota baja y cuota media).
- **Estado**: Leído (resumen y secciones 3.2.4 a 3.2.7).

#### 4.3 Ingreso, pobreza y desigualdad por cantón con aprendizaje profundo (EPN, 2023)

- **Autoría**: Jorge Ricardo Sosa Donoso, dirigido por Adriana Uquillas Andrade;
  marzo de 2023. **Enlace**:
  <https://bibdigital.epn.edu.ec:443/bitstream/15000/24399/1/CD%2013320.pdf>
- **Problema**: calcular el ingreso promedio per cápita por cantón en 2019, 2020
  y 2021, porque la ENEMDU «no posee representatividad» cantonal.
- **Técnica**: regresión por splines adaptativos multivariantes (MARS, paquete
  `earth` de R), con covariables a nivel de cantón (actividades económicas, por
  ejemplo financieras, comercio, producción). El título dice «aprendizaje
  profundo»; el cuerpo usa MARS. Qué fuente trae cada covariable: **no
  confirmado**.
- **Métricas publicadas**: R² de 0,85 (modelo de 2019, grado de interacción 3) y
  0,64 (2020, aditivo). Ecuador tiene del orden de 220 cantones (dato general,
  no de la tesis), así que las muestras son chicas; el tamaño exacto de cada una
  y la validación **no se confirmaron**. En 2020 la ENEMDU fue
  telefónica y la tesis dice que perdió confiabilidad.
- **Compatibilidad**: es un dato **por cantón**, no por persona. Sirve como previa
  geográfica si conseguimos el cantón de residencia (hoy no está en el perfil).
- **Limitaciones**: pocas observaciones, R² dentro de muestra, sin intervalos.
  Preferir 4.16 a 4.18, que tienen método y errores.
- **Estado**: Leído (resumen y sección 3.1).

#### 4.4 Estimador de ingresos para independientes de una entidad financiera (UIS, Colombia, 2020)

- **Autoría**: Eddison Andrés Jiménez Santana y Nestor Yamith Gómez Bermúdez,
  dirigidos por Carlos Alfonso Mantilla Duarte. Trabajo de grado de la
  Especialización en Estadística, Universidad Industrial de Santander.
- **Enlace**: <https://noesis.uis.edu.co/bitstreams/2de335de-0d89-4b09-8744-78b04586214a/download>
- **Problema**: estimar el ingreso de **independientes** de una cooperativa
  colombiana para fijar el monto del crédito.
- **Entrada**: variables sociodemográficas del formulario de solicitud. No usa
  buró.
- **Técnica**: análisis de correspondencia múltiple para agrupar y luego regresión
  lineal y regresión robusta en paralelo; elige la robusta por los valores
  atípicos.
- **Métricas publicadas**: la tesis dice que logró una predicción «no muy alejada
  de la desviación estándar» de los ingresos de la muestra. Nuestra lectura (no
  confirmada): un error del orden de la dispersión de los datos explica poco. La
  tabla 38 con el MSE no se leyó con detalle.
- **Compatibilidad**: baja. Es lo que haría una regresión con edad, educación y
  ocupación, y nos sirve de **línea base de comparación**: cualquier modelo propio
  debe superarla.
- **Estado**: Leído (resumen). Detalle de métricas: no confirmado.

#### 4.5 Estimadores de ingreso de burós y proveedores (caja negra)

| Producto | Qué dice el proveedor | Métricas publicadas | Estado |
|---|---|---|---|
| **Equifax Consumer IncomeView+** (EE. UU.) <https://www.equifax.com/business/blog/-/insight/article/three-reasons-why-an-updated-income-model-can-help-you-make-better-business-decisions/> | Estima el ingreso de «empleo de tiempo completo» sin comprobantes; usa atributos de crédito (puntuales y de tendencia) y datos alternativos; «gradient boosting machine learning y AI». Rango USD 16.000 a 440.000. | «11% más exacto» (sin decir contra qué); 30% menos consumidores que necesitan verificación; en la prueba de **una** institución, 19% de mejora al predecir dentro de un 20% de margen. No dice si es anual ni bruto. | Leído |
| **TransUnion CreditVision Income Estimator** <https://www.transunioncentralamerica.com/content/dam/transunion/latam/business/collateral/sheet/creditvision-income-estimator-asset-sheet.pdf> | Combina datos de crédito con variables de tendencia y aprendizaje automático; alternativa a la verificación manual; también ayuda a detectar ingresos declarados por encima de lo comprobable. La versión dominicana habla de ingresos netos. | Sin métrica publicada (la ficha no detalla variables ni pesos). | Resumen: la descarga directa dio 403; el contenido salió de la ficha que devolvió el buscador |
| **Serasa Experian Renda 4.0 / Renda+ / Renda 360** (Brasil) <https://www.serasaexperian.com.br/sala-de-imprensa/servicos-de-credito/serasa-experian-lanca-4-geracao-do-produto-renda-com-melhora-significativa-na-analise-de-credito/> | Estima la renta individual; Renda+ agrega capacidad de pago, origen de la renta y porcentaje comprometido; Renda 360 estima también la renta del hogar desde la red de relaciones (geolocalización y comportamiento digital, según el comunicado). | «45% más de asertividad» que la versión anterior; «hasta R$ 21 mil millones» de crédito adicional potencial. **No describe cómo valida contra renta observada.** | Leído (comunicado de marzo de 2025) |
| **Belvo Income Estimator** (México) <https://belvo.com/products/income-estimator/> | Historia de empleo formal de varios años obtenida del IMSS, estabilidad, trayectoria y último salario; pronóstico a 3, 6 o 12 meses; dice entrenarse con «más de 50 millones de perfiles». | «99% de precisión» (sin definir), «+14% de hit ratio». No hay conjunto de prueba ni definición. | Leído |
| **Equifax `IncomePredictor` (Ecuador)** | **No se encontró documentación pública.** Los resultados de Equifax Ecuador hablan de modelos analíticos y del Barómetro del Acceso al Crédito, no de un estimador de ingresos. | — | No confirmado |

- **Qué aprender**: todos son modelos de ingreso con datos de crédito y de empleo;
  ninguno publica su error. **Belvo es el análogo más cercano a nuestra línea
  IESS**: un historial de aportes de seguridad social (en México, del IMSS) como
  entrada. Sirve para fijar la expectativa: un historial formal predice el
  ingreso formal; no dice nada del informal.
- **Relación con el `IncomePredictor`**: es una pregunta abierta si la estimación
  que nos llega es la misma familia que IncomeView. **No hay prueba**; no se
  asume.
- **Requisitos técnicos**: ninguno de nuestro lado; son productos que se
  contratan y se consultan por API, con cobro por consulta y condiciones de uso
  que **no se revisaron**.
- **Limitaciones**: marketing; métricas sin definición; cobro por consulta.
- **Para nosotros**: son la **competencia** a igualar y la referencia de qué
  cifra dar a un cliente («hit ratio», «dentro de un 20%»), no un modelo.

#### 4.6 Datos alternativos que no tenemos (teléfono, satélite, transacciones)

| Trabajo | Autoría | Enlace | Qué mide | Métrica publicada | Para nosotros |
|---|---|---|---|---|---|
| Sundsøy y otros, «Deep Learning Applied to Mobile Phone Data for Individual Income Classification» (ICAITA 2016) | Pål Sundsøy, Johannes Bjelland, Bjørn-Atle Reme, Asif Iqbal, Eaman Jahani (Telenor Group Research y MIT Media Lab) | <https://www.atlantis-press.com/proceedings/icaita-16/25849475> | Clasifica el nivel socioeconómico con registros de llamadas y ubicación | 77% de AUC con solo trazas de ubicación; 72% con los modelos tradicionales | **No aplica**: exige datos de telefonía |
| Blumenstock, Cadamuro y On, «Predicting poverty and wealth from mobile phone metadata» (Science, 2015, DOI 10.1126/science.aac4420) | Univ. de Washington (2015) | <https://cdanfort.w3.uvm.edu/csc-reading-group/blumenstock-science-2015.pdf> | Riqueza de abonados en Ruanda, con unas 1.000 llamadas de encuesta (la cifra varía entre medios: 856, 850) | La correlación publicada no se confirmó (un medio dice «90%», sin precisar la métrica) | **No aplica** |
| Aiken, Bellue, Karlan, Udry y Blumenstock, «Machine learning and phone data can improve targeting of humanitarian aid» (Nature, 2022) | La página de J-PAL los lista como investigadores del proyecto | <https://www.povertyactionlab.org/project/using-mobile-phone-and-satellite-data-target-togos-emergency-cash-transfer-program> | Priorizar a los más pobres en Togo con datos de telefonía y satélite | Reduce 4 a 21% los errores de exclusión frente a la focalización geográfica; **los aumenta 9 a 35%** frente a un registro social completo (hipotético) | **No aplica**; su lección es de evaluación: se compara contra la alternativa que sí existe |
| Chi, Fang, Chatterjee y Blumenstock, «Microestimates of wealth for all low- and middle-income countries» (PNAS, 2022) | Berkeley | <https://pmc.ncbi.nlm.nih.gov/articles/PMC8784134> | Índice de riqueza relativa por celdas de 2,4 km, 135 países, con satélite, telefonía y datos de Facebook | Sin métrica citable aquí; la guía del Banco Mundial advierte que estos métodos no estiman su propio ruido ni se han validado con rigor estadístico | **Posible como previa geográfica** si tenemos coordenadas de residencia; licencia y cobertura de Ecuador **no confirmadas** |
| Khandani, Kim y Lo, «Consumer credit-risk models via machine-learning algorithms» (J. Banking & Finance, 2010) | MIT Sloan, Laboratory for Financial Engineering | <https://dspace.mit.edu/handle/1721.1/66301> | Pronostica morosidad con transacciones y buró de un banco | R² de 85% entre morosidad pronosticada y observada (agregada) | **No es ingreso**. Es el antecedente MIT más conocido de buró más transacciones; no lo usamos |

- **Estado**: Resumen en todos, salvo Aiken (Leído en la página de J-PAL) y la guía
  del Banco Mundial (Leída, ver 4.17).

#### 4.7 Pruebas de medios por indicadores (MIT / J-PAL)

- **Alatas, Banerjee, Hanna, Olken y Tobias, «Targeting the Poor: Evidence from a
  Field Experiment in Indonesia»** (American Economic Review 102(4), 2012).
  <https://www.nber.org/papers/w15980.pdf>. Compara pruebas de medios por
  indicadores (activos para predecir consumo), focalización comunitaria y una
  mezcla, en 640 aldeas (3ie dice 600). La prueba por indicadores identifica mejor
  a los pobres cerca de la línea. Autoría de Abhijit Banerjee (MIT) y coautores.
- **Qué aporta**: un diseño para **evaluar** una estimación de bienestar contra una
  alternativa real, y evidencia de que predecir consumo con indicadores baratos
  funciona mejor de lo que se espera. **No estima ingreso individual en dinero.**
- **Compatibilidad**: nuestro análogo son los indicadores de patrimonio y
  actividad. No agrega un modelo.
- **Estado**: Resumen. (Banerjee, Hanna, Olken y Sumarto 2020, J. Public Economics
  Plus, encontró que las preguntas del censo no distorsionan los activos
  reportados.)
- **Instrumentos de Ecuador**: la **Encuesta de Estratificación del Nivel
  Socioeconómico** del INEC
  (<https://www.ecuadorencifras.gob.ec/encuesta-de-estratificacion-del-nivel-socioeconomico/>)
  clasifica hogares en cinco grupos con seis dimensiones (vivienda 236 puntos,
  educación 171, características económicas 170, bienes 163, tecnología 161, hábitos
  de consumo 99). Cubre **9.744 viviendas urbanas de cinco ciudades** (Quito,
  Guayaquil, Cuenca, Machala y Ambato). El INEC advierte que **no es un indicador
  de pobreza ni de ingreso**. Año: no figura en la página (la presentación sugiere
  2011, **no confirmado**). Leído. No aplica.
- El **Índice de Probabilidad de Pobreza** tiene tablas para Ecuador 2015 y 2022
  (paquete `ppitables` de R). Mide probabilidad de pobreza de un hogar con diez
  preguntas, no ingreso. No aplica. Resumen.

### Problema 2: entrenar con una verdad imperfecta

#### 4.8 Verdad que es una cota inferior: censura

Se explica primero el problema porque la elección del método depende de él. Un
independiente aporta al IESS sobre una base elegida, con mínimo en el SBU.
**Corrección del 2026-10-17** (la versión anterior de este párrafo lo decía mal y
lo contradice `fuentes-ingreso.ts`): la información depende de dónde esté el aporte.
- **Sobre el SBU**: el aporte es evidencia de capacidad (la persona desembolsa esa
  base todos los meses). En estadística sería un dato **censurado por la
  derecha** («al menos x»), con una salvedad: quien aporta de más para mejorar su
  pensión puede **sobredeclarar**, y entonces la cota falla.
- **En el SBU** (±5%): **el aporte no dice nada del ingreso.** Es un mínimo legal;
  el ingreso puede ser menor o mayor. Ahí no hay cota: la fila no informa y se
  excluye del entrenamiento o entra como `[0, ∞)`.
- El dependiente tiene el problema contrario y más leve: el empleador puede
  subdeclarar.

**Prueba de humo (2026-10-17, datos sintéticos, no reales).** Con censura al azar
(el 40% son autoafiliados, aportan el máximo entre el SBU y una fracción del
ingreso), el error medio en logaritmo sobre los autoafiliados fue 0,391 si se toma
el aporte como ingreso, 0,365 si se entrena solo con dependientes y 0,363 con
`survival:aft` (cota sobre el SBU, SBU excluido). **O sea, la censura casi no
mejora a «entrenar solo con dependientes» cuando la censura es al azar.** Su ventaja
real aparecería si los autoafiliados difieren de los dependientes, y eso solo se
mide con datos reales. No se debe vender como solución del cambio de población.
(En una primera versión de la prueba el SBU se trató como cota inferior y el
modelo quedó sesgado hacia arriba en más de 0,6: ese es el error que esta
corrección evita.)

| Solución | Autoría y enlace | Qué hace | Requisitos | Compatibilidad / adaptación | Limitaciones |
|---|---|---|---|---|---|
| **XGBoost `survival:aft`** (modelo de tiempo de falla acelerado) | Barnwal, Cho y Hocking, «Survival regression with accelerated failure time model in XGBoost», arXiv 2006.04920 <https://arxiv.org/pdf/2006.04920>; tutorial <https://xgboost.readthedocs.io/en/latest/tutorials/aft_survival_analysis.html> | Cada fila lleva un intervalo `[inferior, superior]`: exacto `[a, a]`, censurado por la derecha `[a, ∞)`, por la izquierda `[0, b]`, por intervalo `[a, b]`. Maximiza la verosimilitud de un modelo log-lineal con ruido (normal, logística o de valor extremo). Se pasa con `label_lower_bound` y `label_upper_bound`. | Python o R con XGBoost. Un modelo entrenado se puede exportar, pero **no corre en Deno** sin un servicio aparte. | **Alta**. Dependiente confirmado: intervalo estrecho. Independiente en el Ingreso Mínimo SBU o autodeclarado: `[aporte, ∞)`. Usa nuestras variables tal cual. | El tutorial usa el ingreso como «tiempo»: es log-lineal, así que supone ruido multiplicativo. Un hilo de la comunidad dice que la validación cruzada no estaba soportada; **confirmar contra la versión actual**. |
| **Grabit**: árboles con refuerzo para modelos Tobit | Sigrist y Hirnschall, arXiv 1711.08695 <https://arxiv.org/abs/1711.08695> | Un Tobit con variable latente normal truncada, entrenado por refuerzo de gradiente. El artículo lo aplica a **incumplimiento** (clasificación) de pymes suizas. | Python (paquete del autor; **no confirmado el nombre**) | **Media**: la idea sirve, pero el artículo trata clasificación desequilibrada, no regresión del ingreso | Sin métrica citable para nuestro caso |
| **Pérdidas Tobit para redes** | Dănăilă y Buiu (2024): verosimilitud Tobit, MSE censurado y MAE censurado como funciones de pérdida | Entrena una red con datos censurados por gradiente | Python con una biblioteca de redes | **Baja**: con 2.573 personas una red no se justifica | Enlace del artículo: <https://link.springer.com/article/10.1007/s10044-024-01216-9> (Resumen; **autoría y título completo no confirmados**) |
| **Bosques de supervivencia y de cuantiles** (`grf`) | Athey, Tibshirani y Wager, «Generalized Random Forests», Annals of Statistics 2019; arXiv 1610.01271 <https://arxiv.org/abs/1610.01271>; paquete <https://cran.r-project.org/web/packages/grf/index.html> | Regresión de cuantiles y de supervivencia con resultados censurados por la derecha, con estimación «honesta» e intervalos de confianza | R | **Alta** para obtener un rango (P10-P50-P90) en vez de un número | Hace falta confirmar cómo trata la censura en la regresión de cuantiles (solo se verificó que el paquete la admite para efectos de tratamiento y supervivencia) |
| **Intervalos conformales para censura** | Candès, Lei y Ren, «Conformalized survival analysis», JRSS-B 2023; arXiv 2103.09763 <https://arxiv.org/abs/2103.09763> | Un envoltorio sobre cualquier modelo que da **cotas inferiores calibradas** condicionadas a las variables. Con censura exógena de tipo I, cobertura de muestra finita bajo datos i.i.d. | Python / R | **Alta en concepto**: una cota inferior calibrada es exactamente lo que necesitamos mostrar | El supuesto de censura independiente de las variables **no se cumple** acá: quien aporta el mínimo es quien más oculta. La versión doblemente robusta pide estimar bien el mecanismo de censura |

- **Cuidado central**: todas estas herramientas suponen que **la censura se explica
  con lo que observamos**. Quien elige aportar sobre el Ingreso Mínimo SBU lo hace
  por razones que no vemos (costo del aporte, costumbre). Si esa elección depende
  del ingreso verdadero más allá de las variables, los modelos sesgan hacia
  abajo y los intervalos pierden cobertura. Se puede **medir** parte de esto: en
  los dependientes la verdad está identificada, y se puede censurar artificialmente
  su aporte y ver cuánto del ingreso se recupera.
- **Clásicos sin enlace verificado**: Tobin (1958), regresión censurada;
  Heckman (1979), selección de muestra; Powell (1984), regresión de cuantiles
  censurada. Se citan como referencia, no se abrieron.
- **Estado**: Leído (resumen de Grabit en arXiv); Resumen (el resto, incluido el
  tutorial de XGBoost, que se vio por el buscador).

#### 4.9 Etiquetas con ruido, destilación y varias fuentes débiles

| Solución | Autoría y enlace | Qué hace | Compatibilidad | Limitaciones y riesgos |
|---|---|---|---|---|
| **Destilación del conocimiento** | Hinton, Vinyals y Dean (2015), arXiv 1503.02531 <https://arxiv.org/pdf/1503.02531> | Entrenar un modelo propio con las salidas de otro (el «maestro»). En el original, para comprimir un conjunto de redes. | **Es lo que sería imitar al `IncomePredictor`**: la base de 20.000 serían las salidas del maestro. | Hereda el sesgo del maestro: si subestima los ingresos altos (4.1) el alumno también. Sin cédula y sin ingreso verificado **no se puede saber** si acierta. |
| **Extracción de modelos** | Tramèr, Zhang, Juels, Reiter y Ristenpart (USENIX Security 2016), arXiv 1609.02943 <https://arxiv.org/abs/1609.02943> | Muestra que consultar una API permite reconstruir el modelo con alta fidelidad. | Es la técnica detrás del riesgo, no una solución. | **Riesgo contractual y legal**: entrenar un modelo propio con las salidas de Equifax puede estar prohibido por el contrato o por la propiedad intelectual. **No se revisó el contrato** (el plan lo marca como pendiente). |
| **Aprendizaje confiado (`cleanlab`)** | Northcutt, Jiang y Chuang, JAIR 2021, arXiv 1911.00068 <https://arxiv.org/pdf/1911.00068>; regresión desde la versión 2.5: <https://docs.cleanlab.ai/stable/tutorials/regression.html> | Detecta filas cuya etiqueta se aleja de lo que un modelo confiable predice (`CleanLearning` sobre cualquier regresor de scikit-learn). | **Media**: marcaría los casos atípicos del IESS (ej. un aporte altísimo por una nómina mal cargada) | Asume ruido simétrico y aleatorio; la censura **no** es ruido simétrico. Útil como depuración, no como modelo. El tutorial usa notas de estudiantes: no hay caso de ingresos. |
| **Supervisión débil (Snorkel)** | Ratner y otros (PVLDB 2017), arXiv 1711.10160 <https://alphaxiv.org/abs/1711.10160> | Combina fuentes ruidosas (funciones de etiquetado) con un modelo generativo que estima su exactitud y correlación, sin etiquetas verdaderas. | **Media en concepto**: IESS, cota por crédito y `IncomePredictor` serían tres fuentes de etiquetado. | Está pensado para clasificación; la versión para regresión no se confirmó. Estima exactitudes bajo el supuesto de errores condicionalmente independientes, que **no se cumple** (la cota por crédito y el `IncomePredictor` comparten el buró). |
| **Inferencia con predicciones («prediction-powered inference»)** | Angelopoulos, Bates, Fannjiang, Jordan y Zrnic (Berkeley), arXiv 2301.09633 <https://arxiv.org/pdf/2301.09633> | Con una muestra **pequeña con verdad** y muchas predicciones de un modelo, calcula intervalos de confianza válidos para un parámetro (media, regresión). Los intervalos son más cortos si el modelo acierta. | **Alta para medir**: la muestra con verdad serían los dependientes con IESS y las predicciones, las de Equifax. | No predice el ingreso de una persona: estima **parámetros poblacionales** (por ejemplo, el sesgo medio de Equifax). Una derivada (PPI++) descuenta las predicciones si la correlación es débil (el nuestro es 0,28). La publicación en *Science* **no se confirmó**, solo el borrador. |

- **Requisitos técnicos**: todas son bibliotecas de Python (`cleanlab`, Snorkel,
  PPI; el nombre del paquete de PPI no se confirmó) y piden una máquina con
  Python, que hoy no tenemos. La destilación es un entrenamiento común sobre las
  salidas del maestro.
- **Estado**: Resumen en todas (se vieron por el buscador, no se abrió el original).

### Problema 3: estimar el ingreso a partir del crédito otorgado y la cuota a partir del saldo

#### 4.10 Ingreso implícito en la cuota otorgada

- **Idea**: un banco que otorgó una cuota de X vio (o creyó ver) un ingreso de al
  menos X dividido por su relación cuota/ingreso máxima. No se encontró un
  **modelo publicado** que lo haga con un buró latinoamericano; es una regla de
  negocio, y lo más cercano es el uso que le dan 4.1 y 4.2 (excluir a quien tiene
  una cuota mayor que su ingreso).
- **Respaldo y advertencia**:
  - **Ambrose, Conklin y Yoshida**, «Credit Rationing, Income Exaggeration, and
    Adverse Selection in the Mortgage Market», *Journal of Finance* 71(6),
    2016, pp. 2637-2686 (<https://ideas.repec.org/a/bla/jfinan/v71y2016i6p2637-2686.html>).
    Muestra que, en créditos con poca documentación, quienes podían verificar su
    ingreso pero no lo hicieron lo exageraban más. Es la prueba de que **el
    ingreso declarado que sostiene una cuota puede estar inflado**: la cota
    inferior «verificada por un tercero» es en realidad «declarada ante un
    tercero» salvo que la IFI haya verificado. Estado: Resumen.
  - **TransUnion** dice que su estimador ayuda a detectar ingresos declarados por
    encima de lo comprobable (4.5), lo que coincide.
- **Relación cuota/ingreso por tipo de entidad**: **no se encontró** una fuente
  normativa ecuatoriana. La búsqueda en la normativa de la Superintendencia de
  Bancos no devolvió un porcentaje; el único que apareció es el 50% que cita la
  tesis 4.2, sin norma. **Es un dato que hay que pedir a la IFI** (como ya figura
  en `plan-demo-ifi.md`, sección 6).
- **Adaptaciones**: separar el rol (la cuota de codeudor y de garante no es del
  titular; ya se hace); descontar créditos refinanciados, reestructurados o
  novados (la cuota actual no es la que se aprobó); tomar la **cuota máxima
  aprobada** y su fecha de apertura, no la suma actual; expresar el resultado
  como un mínimo con su fecha («ingreso de al menos X, cuando se aprobó en
  2024»), porque el ingreso cambia.
- **Limitaciones**: cubre solo a quien tiene crédito formal; un ingreso de hogar
  (cónyuge) puede sostener la cuota; un crédito garantizado por un colateral
  puede aprobarse con menos exigencia de ingreso.

#### 4.11 Estimar la cuota a partir del saldo

| Solución | Enlace | Qué dice | Compatibilidad |
|---|---|---|---|
| **Regla del 5% del saldo (Fannie Mae, EE. UU.)** | <https://selling-guide.fanniemae.com/sel/b3-6-05/monthly-debt-obligations> | Si en una cuenta rotativa el reporte no trae pago mínimo y no hay documentación de un pago menor, el prestamista **debe usar el 5% del saldo** como obligación mensual. El sistema automatizado usa el mayor entre USD 10 y el 5% del saldo. | Sirve de **antecedente de práctica** (un porcentaje del saldo cuando falta la cuota). El 5% es de EE. UU. y de la tarjeta de ese mercado; no se traslada a Ecuador. Leído. |
| **Cuota de un crédito con amortización (fórmula)** | Fórmula estándar de anualidad; la tasa máxima por segmento la publica el Banco Central del Ecuador (las cifras de 2026 que devolvió la búsqueda no coinciden entre sí; consultar el boletín mensual del Banco Central en su sitio oficial; enlace no verificado) | Con saldo, plazo restante y tasa se despeja la cuota. | **Es lo que haría falta para Novadata**, que no trae cuota en bancos. Hace falta el plazo restante, que Novadata no trae; **no confirmado**. |
| **Cuota estimada en el registro** | Las tesis EPN 4.1 y 4.2 la usan como entrada, y **Equifax ya trae su propia cuota estimada** (`cuotaEstimadaActualUsd`, `cuotaFinancieraEstimadaUsd`). | La «cuota estimada» del registro es la suma de las amortizaciones. | Cómo la calcula Equifax: pregunta pendiente en `equifax-pedido-de-diccionario.md`. |

- **Para nosotros**: en el flujo con Equifax la cuota por operación existe; el
  estimador de cuota desde el saldo solo hace falta para Novadata sola, y ahí la
  precisión será baja sin el plazo. Recomendación: **no construirlo todavía**;
  hacerlo después de conocer el uso real (sección 6).

#### 4.12 Crédito que sostiene el ingreso de quien no tiene IESS: advertencia de selección

El conjunto de personas con crédito no es una muestra al azar de la población: ya
pasó la política de la IFI. Toda cota por crédito vale **solo para quien consiguió
el crédito**. Sin crédito no hay cota, y eso no dice que el ingreso sea bajo.
Mostrar ambos casos con rótulos distintos («sin crédito vigente: sin cota») evita
leer el vacío como cero. Es el mismo principio de `metaConsulta`.

### Problema 4: cambio de población

#### 4.13 Reponderación por cambio de covariables

- **Shimodaira** (2000), «Improving predictive inference under covariate shift by
  weighting the log-likelihood function», *Journal of Statistical Planning and
  Inference*. El resultado base: si la relación entre las variables y el ingreso
  no cambia pero la distribución de las variables sí, se corrige ponderando cada
  caso de entrenamiento por el cociente de densidades. **Enlace no verificado.**
- **Estimación directa del cociente** (Sugiyama y otros): KLIEP, uLSIF y la
  búsqueda relativa. Libro: *Density Ratio Estimation in Machine Learning*
  (Cambridge, 2012). Implementaciones: paquete de R `densratio`; en Python,
  `ADAPT` (de Mathelin y otros, arXiv 2107.03049 <https://ar5iv.labs.arxiv.org/html/2107.03049>,
  <https://pypi.org/project/adapt>), que incluye KMM, KLIEP y TrAdaBoost y
  funciona con modelos de scikit-learn. Estado: Resumen.
- **Compatibilidad**: la mecánica es sencilla (un clasificador dependiente contra
  independiente da el cociente). **El problema es de fondo**: la corrección vale
  si el ingreso dado las variables es el mismo en los dos grupos. Acá no lo es:
  un dependiente cobra un sueldo; un independiente, una utilidad. Y el
  independiente en el Ingreso Mínimo SBU **nunca** tiene un ingreso verdadero en la
  muestra de entrenamiento.
- **Lo que sí aporta**: un **diagnóstico**. Entrenar un clasificador
  dependiente-vs-independiente da el AUC de dominio y la zona de solapamiento. Si es
  muy alto (casi 1), no hay dependientes parecidos a un independiente típico y la
  reponderación ensancha la varianza sin corregir nada. Esto se puede medir sin
  etiquetas.
- **Limitaciones**: las ponderaciones extremas arruinan la estimación; hay variantes
  aplanadas por esa razón (Shimodaira ya lo notó). Sin solapamiento, es extrapolar.

#### 4.14 Intervalos que respetan el cambio de población

- **Tibshirani, Barber, Candès y Ramdas**, «Conformal prediction under covariate
  shift», NeurIPS 2019, arXiv 1904.06019 <https://arxiv.org/abs/1904.06019>.
  Intervalos de predicción sin supuestos de distribución cuando entrenamiento y
  prueba difieren en las variables, si se conoce o se estima la razón de
  verosimilitudes con variables no etiquetadas del grupo de destino.
- **Compatibilidad**: **alta en concepto**: los independientes sin etiqueta son el
  grupo de destino, que sí tenemos. Se combina con los cuantiles de 4.8.
- **Limitaciones**: la garantía depende del supuesto de la reponderación (que el
  ingreso dado las variables no cambia); si falla, el intervalo es optimista de
  manera invisible. Estado: Resumen.

#### 4.15 Inferencia de rechazados (el mismo problema en crédito)

- En crédito, el modelo se entrena con los aceptados y se aplica a todos. La
  literatura lo llama **inferencia de rechazados** y es la comparación más honesta
  que hay para entrenar con dependientes y aplicar a independientes.
- **Hand y Henley** (año y enlace no verificados): los métodos usados en la industria suelen no ser
  sólidos y descansan en supuestos débiles; la única forma robusta es aceptar una
  muestra de rechazados y observar su conducta. Revisiones y trabajos del Credit
  Research Centre de Edimburgo (Crook y Banasik): <https://cer.business-school.ed.ac.uk/wp-content/uploads/sites/55/2017/02/workingpaper03_2-1.pdf>.
  Un trabajo de 2024, «Fighting Sampling Bias: A Framework for Training and
  Evaluating Credit Scoring Models», arXiv 2407.13009 <https://arxiv.org/pdf/2407.13009>,
  encuentra que etiquetar a todos los rechazados como malos, o usar aumento y
  parcelado, elimina el sesgo de muestreo, pero **reducir la discrepancia no
  mejora necesariamente el desempeño**.
- **Lección**: lo único que cura la selección es **observar la verdad en el grupo
  de destino**. Para nosotros, eso significa conseguir ingreso verificado de
  independientes (sección 7). Estado: Resumen.
- **Cuidado de vocabulario**: en estas fuentes «malo» es incumplimiento; acá lo
  que cambia es el *ingreso*. La analogía vale para el sesgo, no para la
  etiqueta.

### Problema 5: áreas pequeñas e imputación con encuestas

#### 4.16 Estimación de bienestar con encuesta y censo (Elbers-Lanjouw-Lanjouw) y mapas de Ecuador

- **Elbers, Lanjouw y Lanjouw (2003)**, «Micro-level estimation of poverty and
  inequality», *Econometrica* 71(1), 355-364, DOI 10.1111/1468-0262.00399
  (<https://intouch.econometricsociety.org/publications/econometrica/2003/01/01/micro–level-estimation-poverty-and-inequality>).
  Se estima un modelo de consumo en la encuesta con variables que **también están
  en el censo** y se predice en el censo, con simulación para la incertidumbre.
  Los ejemplos del artículo son **ecuatorianos**; reporta precisión comparable a
  la de las estimaciones por encuesta para áreas de hasta 15.000 hogares.
- **Larrea, Landín, Larrea, Wrborich y Fraga (2008)**, «Mapas de pobreza, consumo
  por habitante y desigualdad social en el Ecuador: 1995-2006» (Rimisp,
  Documento de Trabajo 13) <https://rimisp.org/wp-content/files_mf/1366381843Doc_13.pdf>.
  Usa PovMap 2.0.2 con los censos de 1990 y 2001 y las encuestas de condiciones de
  vida de 1995 y 2006; escala parroquial (995 parroquias en el censo de 2001).
  Estado: Leído (portada y metodología general); ELL, Resumen.
- **Qué hay en 2022**: el Banco Mundial aprobó en 2022 un préstamo de USD 80
  millones al INEC (Primicias) que, según la nota, servirá para mapas de pobreza.
  **No se encontró** un mapa de pobreza o ingreso por parroquia con el censo 2022.
- **Compatibilidad**: el método exige el mismo conjunto de variables en la encuesta
  y en la base de destino. **Nuestra base de destino no es un censo**: son 2.573
  personas elegidas por la IFI o por el negocio, y la ENEMDU no trae todas las
  variables nuestras (empleador, cuota, aporte al IESS). Se puede usar como
  previa con **variables en común** (edad, sexo, educación, provincia,
  ocupación, formal o informal).
- **Limitaciones**: ELL estima distribuciones de áreas, no el ingreso de una
  persona; la incertidumbre individual es mucho mayor.

#### 4.17 Guía del Banco Mundial para la estimación en áreas pequeñas

- **Corral, Molina, Cojocaru y Segovia**, «Guidelines to Small Area Estimation for
  Poverty Mapping», Banco Mundial, 30 de junio de 2022, licencia CC BY 3.0 IGO.
  <https://openknowledge.worldbank.org/entities/publication/e22cbb4c-653d-508f-9a21-f42fa051bf02>
  (copia leída: <https://unstats.un.org/wiki/download/attachments/132284431/SAE_Guidelines.pdf?api=v2>).
- **Contenido**: modelos de área (Fay-Herriot, que no necesita microdatos del
  censo) y de unidad (ELL, mejor predictor empírico), con paquetes de Stata
  (`sae`, que reemplazó a PovMap, y `fhsae`) y de R (`emdi`, `sae`, `povmap`). Un
  árbol de decisión según la información disponible. Dice que los datos de
  encuesta y de censo deben ser comparables y que el promedio y la distribución
  de las covariables deben ser parecidos.
- **Sobre aprendizaje automático**: afirma que los métodos con datos geocodificados
  «carecen de una estimación precisa del ruido del método y, hasta la fecha, no se
  han sometido a una validación estadística rigurosa» (parafraseado), pero los
  considera prometedores.
- **Compatibilidad**: el modelo de **área** (Fay-Herriot) es el que sí puede
  funcionar sin microdatos del censo: se estiman promedios por provincia y
  ocupación en la ENEMDU y se modelan con variables agregadas. Sirve para obtener
  **la previa con su error**.
- **Estado**: Leído.

#### 4.18 `emdi` y los mejores predictores empíricos

- **Kreutzmann, Pannier, Rojas-Perilla, Schmid, Templ y Tzavidis (2019)**, «The R
  Package emdi for Estimating and Mapping Regionally Disaggregated Indicators»,
  *Journal of Statistical Software* 91(7)
  (<https://www.jstatsoft.org/article/view/v091i07>). Implementa el mejor
  predictor empírico (Molina y Rao 2010) para media, cuantiles, medidas de
  pobreza y Gini, con error cuadrático medio por bootstrap y transformaciones
  automáticas. Ejemplo: mediana de ingreso de distritos de Austria.
- **Compatibilidad**: es el paquete natural para estimar la **mediana y los
  cuantiles de ingreso por provincia y ocupación** con ENEMDU. Requiere R.
- **Estado**: Resumen.

#### 4.19 Imputación de encuesta a encuesta

- **Carletto, Dang y Jolliffe**, «Data gaps, data incomparability, and data
  imputation: a review of poverty measurement methods for data-scarce
  environments», World Bank Policy Research Working Paper 8282, diciembre de 2017
  (<https://econpapers.repec.org/paper/zbwglodps/179.htm>). Revisión de métodos
  cuando falta el consumo. Trabajos posteriores del Banco Mundial (Kilic y
  otros, 2024, Tanzania) hallan que la imputación entre encuestas con pocos
  predictores da estimaciones confiables. **No hubo acceso al texto completo**;
  sus métodos específicos no se confirmaron.
- **Compatibilidad**: es la forma más cercana a «usar la ENEMDU para imputar»:
  se ajusta un modelo en la encuesta con las variables comunes y se predice en
  la base de destino.
- **Limitaciones**: la imputación da la **media condicional**, que subestima la
  dispersión; para mostrar un rango hay que agregar el ruido (ELL) o usar
  cuantiles.

#### 4.20 La ENEMDU del INEC como fuente de la previa

- **Qué es**: Encuesta Nacional de Empleo, Desempleo y Subempleo. Bases anuales
  en SPSS y CSV bajo licencia **CC BY 4.0**, con guía de usuario, diccionario de
  variables, sintaxis y diseño muestral:
  <https://www.ecuadorencifras.gob.ec/enemdu-anual-2024/> (también 2022 y 2023).
- **Representatividad**: el INEC indica que los resultados anuales permiten
  desagregar **a nivel provincial**. La tesis 4.3 afirma que **no es
  representativa a nivel cantonal**, lo que es coherente. En 2020 el levantamiento
  fue telefónico y no hubo ENEMDU anual.
- **Variables de ingreso, ocupación (CIUO) y rama**: la página no las lista.
  Que existan **no se confirmó**; hay que abrir el diccionario.
- **Compatibilidad**: edad, sexo, educación y provincia coinciden con nuestro
  perfil; la ocupación exige una **tabla de equivalencias** entre el cargo y la
  actividad de Novadata y el CIUO de la encuesta. Esa tabla no existe hoy.
- **Limitaciones**: encuesta de hogares (el ingreso se declara a un encuestador,
  también con error); no distingue al afiliado voluntario; el SBU cambia cada año
  (hay que deflactar o separar por año).
- **Otras fuentes agregadas**: **SRI** (ingresos por actividad económica y
  cantón) e **IESS** (salario promedio por actividad): no se encontró un
  conjunto abierto y descargable; **no confirmado** (sección 7).
- **Estado**: Leído (página 2024), búsquedas para el resto.

## 5. Compatibilidad con nuestras variables

| Variable nuestra | La usan | Falta para usarla |
|---|---|---|
| Aporte al IESS y su calidad de evidencia | 4.8 (como intervalo), 4.9 (como fuente) | Nada: ya están `CalidadEvidencia` y `esIngresoMinimoSbu()` |
| Segmento, perfil laboral, tamaño del negocio | 4.1, 4.2, 4.4, 4.20 | Tabla de equivalencias con el CIUO |
| Edad, género, estado civil, educación | 4.4, 4.20 | Ninguna |
| Provincia de **nacimiento** | 4.16 a 4.20 (como aproximación) | La de **residencia**: está en el crudo de Equifax y no en el perfil |
| Cuota por operación (Equifax) | 4.1, 4.2, 4.10 | Relación cuota/ingreso (dato de la IFI) |
| Saldo sin cuota (Novadata en bancos) | 4.11 | Plazo restante y tasa |
| Patrimonio (vehículos, inmuebles) | 4.7 (como indicadores) | Valor de mercado confiable |
| `IncomePredictor` de Equifax | 4.9 (destilación, fuente débil, medición) | Unidad, cédula de la base, permiso contractual |
| Datos de telefonía, satélite, transacciones | 4.6 | **No los tenemos** |

## 6. Recomendación

### 6.1 Qué conviene probar, en este orden

1. **El tablero de varias estimaciones con su origen** (ya propuesto en
   `plan-demo-ifi.md` 3.1) con una cuarta línea que esta investigación sí
   respalda: una **previa de mercado** (mediana y cuantiles por provincia,
   ocupación y condición formal, de la ENEMDU). Es lo único que no depende de
   Equifax ni de verdad individual. Cada cifra con su rótulo y separada del
   ingreso confirmado, como pide la regla vigente.
2. **Medir antes de predecir**: con el IESS de los dependientes como verdad,
   medir el error de Equifax con la **plantilla de la tesis 4.1** (rangos de
   ingreso real, MSE por rango, porcentaje de sub y sobreestimación) y con
   intervalos válidos con **inferencia con predicciones** (4.9). Con 45 personas
   sale ancho; la base de 20.000 con cédula lo resuelve. Si la unidad es anual,
   dividir por 12 cambia el resultado: **primero la unidad**.
3. **Experimento de censura simulada** (propuesta propia, no es de la literatura):
   con los dependientes, donde la verdad está identificada, **censurar su aporte
   a propósito** imitando a los independientes (aporte = máximo entre el Ingreso
   Mínimo SBU y una fracción aleatoria del sueldo), y comparar cuánto del sueldo
   recupera cada método: regresión simple tratando el aporte como valor; XGBoost
   con rangos; bosque de cuantiles. Cuesta poco y dice si vale la pena ir más
   allá. El límite que no mide: que la censura real *no es al azar*.
4. **Modelo propio v1 con pérdida de censura** (4.8), entrenado con rangos:
   dependiente confirmado `[aporte, aporte × (1 + margen)]`, independiente
   `[aporte, ∞)`. Salida: un rango (P10-P50-P90), no un número, con la cota por
   crédito como límite inferior duro. Evaluar **solo** en dependientes (ahí hay
   verdad) y **decir** que para independientes no se midió.
5. **Intervalos con cobertura** (4.14 y 4.8): conformales ponderados por el
   cociente de densidades, y reportar la cobertura **por segmento**, no global.
6. **Cota por crédito otorgado** (4.10), apenas se tenga la relación cuota/ingreso
   de la IFI. Rotulada «de al menos, al aprobarse el crédito».

### 6.2 Qué no aplica o no conviene

| Qué | Por qué |
|---|---|
| Datos de telefonía, satélite o transacciones (Sundsøy, Blumenstock, Aiken) | No los tenemos. |
| Redes profundas y secuencias de vida | 2.573 personas; sin Python en el equipo; sin ganancia demostrada frente a árboles. |
| Estimación por parroquia con censo (ELL completo) | Nuestra base no es un censo; la ENEMDU no llega a cantón; no hay covariables armonizadas. El modelo de área sí aplica. |
| Estratificación del INEC y probabilidad de pobreza | Cinco ciudades en 2011 y no miden ingreso. |
| Destilar al `IncomePredictor` | Riesgo contractual; hereda su sesgo; sin cédula no se puede evaluar. **Solo con revisión del contrato y de su unidad.** Como característica auxiliar con peso bajo, sí se puede medir. |
| Reponderar para «corregir» el paso a independientes | Sin solapamiento extrapola; usarla como diagnóstico, no como corrección. |
| Regla del 5% del saldo (EE. UU.) | Es de otro mercado; el equivalente ecuatoriano hay que pedirlo. |
| Grabit, Snorkel, `cleanlab` como núcleo | Son para clasificación o para limpiar etiquetas simétricas; la censura no lo es. |

### 6.3 Riesgos que atraviesan todo

- **La censura no es al azar** (4.8): nadie en la literatura leída lo resuelve sin
  una muestra con verdad en el grupo de destino.
- **El ingreso declarado a una IFI no es un ingreso verificado** (4.10): las tesis
  4.1 y 4.2 lo toman como verdad.
- **La regla «no se especula sobre el ingreso»**: todo lo anterior produce
  estimaciones. Mostrar un rango rotulado (con su origen y su tipo: confirmado,
  cota, mercado, modelo) es compatible con la regla solo si el negocio lo decide
  (P5 del plan). La advertencia de la sección 4.12 aplica a la pantalla: «sin
  cota» no es «ingreso bajo».
- **Competir con cajas negras que no publican su error** exige publicar el
  nuestro, con su definición.

## 7. Qué información falta

| Qué | Para qué | Quién |
|---|---|---|
| Unidad, método y error del `IncomePredictor` y del indicador de impacto económico | Medir a Equifax (6.1, paso 2); decidir si la destilación tiene sentido | Equifax (ya está en el pedido de diccionario) |
| Estructura de la base de 20.000: cédula, columnas, fecha | Entrenar y medir con nuestras variables | Negocio |
| **Ingreso verificado de personas reales, sobre todo independientes** (nómina, declaración, contrato, estado de cuenta) | Es la única verdad para validar en el grupo de destino; resolvería 4.8, 4.13 y 4.15 | IFI de la demo |
| Relación cuota/ingreso por tipo de entidad (la norma, si existe) | Cota por crédito | IFI; norma de la Superintendencia de Bancos y la Junta (**no se encontró**) |
| Si el contrato con Equifax permite entrenar con sus resultados | Destilación y uso de la base | Negocio / legal |
| Dónde está la **residencia** de la persona en Novadata | Previa geográfica | Novadata |
| Diccionario de la ENEMDU: ingreso laboral, CIUO, rama, formal/informal, factores de expansión | Previa de mercado | INEC (descarga abierta) |
| Tablas del SRI y del IESS con ingresos por actividad y cantón | Previa de independientes | SRI, IESS (acceso **no confirmado**) |
| Cuánto error acepta la IFI y si pesa más sobreestimar que subestimar | Elegir la pérdida y el cuantil de la cota | IFI |
| Tarifario y plazo restante de los créditos de Novadata | Cuota desde el saldo | IFI, Novadata |

## 8. Actualización del 2026-10-17: con las dos bases del negocio

Lo que dijo el negocio (en el chat, sin documento): (a) una base con los **3,9
millones de afiliados al IESS con ingreso 100% verificado, salvo los de afiliación
propia**; (b) **120.000 personas con el estimador de Equifax**, y el ingreso real
calculado para el **45%** (unas 54.000); (c) el INEC indicaría que el **90% de las
personas gana menos de USD 2.000**, con el grueso entre el SBU (USD 482 en 2026,
`fuentes-ingreso.ts`) y 2.000; (d) por encima de 2.000 la población está muy
bancarizada y se infiere con la **cuota financiera y el endeudamiento histórico**,
usando el estimador de Equifax solo como **techo**; (e) el techo del estimador de
Equifax era **USD 20.000 hace seis meses y ahora es USD 10.000**. Se toma todo como
dicho por el negocio. **No se vio ninguna de las dos bases** y el estudio del INEC
de (c) **no se encontró** (la ENEMDU del primer trimestre de 2025 da, según El
Comercio, un ingreso que recibe la mayoría de unos USD 400; no es el mismo dato).

### 8.1 Qué cambia respecto de las secciones 4 a 7

| Dato nuevo | Efecto |
|---|---|
| 3,9 millones con ingreso verificado | Se acaba la escasez de verdad. Pasan al fondo la supervisión débil, las etiquetas con ruido y la destilación (4.9). El centro es **llevar lo aprendido a quien no está en la base** (4.13 a 4.15) y tratar el aporte censurado (4.8). |
| 120.000 con estimador y unas 54.000 con real | Es el **conjunto de calibración** de Equifax. Mide su sesgo por tramo y resuelve la unidad (mensual o anual) con datos, no con 45 personas. |
| Techo de 20.000 y luego 10.000 | El estimador está **censurado por la derecha** y además cambió de versión: son dos instrumentos distintos. Mezclar consultas de antes y después del cambio es una trampa. |
| Tramo alto por cuota | Es la cota inferior de 4.10, que ya estaba respaldada por la evidencia de 4.2: en esa tesis el grupo de cuotas altas fue el mejor predicho. |

### 8.2 Un límite de cobertura que importa

El negocio pide extrapolar a quienes **no** están en el IESS con ingreso verificado.
Según un resumen del buscador atribuido a Primicias (fuente exacta **no
confirmada**), de unos 3,2 millones de trabajadores independientes apenas el 9%
está afiliado, y según el informe de rendición de cuentas del Ministerio de
Trabajo (<https://www.trabajo.gob.ec/wp-content/uploads/2026/03/Informe-narrativo-Planta-Central-Rendicion-de-Cuentas-2025-signed.pdf>,
resumen) la informalidad fue 51,5% en 2025. **Si es así, la mayoría de los
independientes y de los informales no está en la base de 3,9 millones**, y los que
están (afiliados voluntarios) son una minoría que se afilió. La base sirve para
aprender cómo se estructura el ingreso del trabajo en relación de dependencia; para
el **nivel** de los independientes la única fuente representativa que se encontró
es la ENEMDU (4.20).

### 8.3 Diseño propuesto por tramos

1. **Tramo hasta USD 2.000 (la mayoría): modelo de cuantiles entrenado con los
   verificados**, sobre **log del ingreso**, con salida P10, P50 y P90.
   - **Variables**: solo las que existen también para quien no está en el IESS.
     Si el modelo usa el empleador, el sector del contrato o el historial de
     aportes, no se puede aplicar a un autoafiliado. Conviene que el modelo tenga
     una **versión sin aportes** para ese caso (edad, sexo, educación, ocupación,
     provincia, RUC, patrimonio, endeudamiento, consultas, scores). Depende de qué
     columnas tiene la base (sección 8.5).
   - **Pérdida**: cuantiles sobre dependientes como línea base. Opcional,
     `survival:aft` con rangos (4.8): el aporte del autoafiliado **sobre el SBU**
     entra como `[aporte, ∞)`; el aporte **en el SBU** se excluye porque no dice
     nada del ingreso. En la prueba sintética la mejora fue mínima (4.8): se adopta
     solo si con datos reales supera a «solo dependientes».
   - **Pesos**: reponderación por el cociente de densidades **solo en la zona de
     solapamiento** (4.13); fuera de ella, el modelo extrapola y se rotula así.
   - **Anclaje al nivel**: ajustar la distribución estimada por celda (provincia ×
     ocupación × formal o informal) a la de la ENEMDU, con una calibración de
     cuantiles; el modelo da el **orden dentro de la celda** y la encuesta da el
     **nivel**. Las referencias técnicas son la calibración de distribuciones para
     regresión (<https://arxiv.org/pdf/1905.06023>, resumen) y el mapeo de cuantiles.
     La dispersión de un independiente es mayor que la de un dependiente: sin este
     paso el modelo la subestima.
2. **Tramo desde USD 2.000: cota inferior por crédito + modelo.** Cota inferior =
   cuota máxima aprobada dividida por la relación cuota/ingreso de la IFI (4.10).
   Ejemplo **ilustrativo**, no un parámetro: con una relación de 0,40, una cuota de
   USD 800 implica al menos USD 2.000. El endeudamiento histórico entra como
   variable del modelo del tramo, no como reemplazo de la cota. Es la partición que
   usó la tesis 4.2 (grupos por cuota estimada), con mejor resultado en el grupo de
   cuotas altas.
3. **El estimador de Equifax como techo, con una advertencia.** Un techo de USD
   10.000 sirve como **tope de presentación**, pero no como valor: quien gana más
   queda marcado igual en 10.000. Mostrar «de USD 10.000 o más» en vez de una cifra;
   si hace falta un valor para la cola, un ajuste de Pareto a la cola (el tratamiento
   clásico de ingresos con tope, por ejemplo los de la encuesta de población de EE.
   UU.: <https://lehd.ces.census.gov/applications/creat/paper-profile/687>, resumen)
   o dejarla sin cifra. Qué hacer con los que Equifax puso en 20.000 antes del
   cambio: ver 8.5.
4. **Regla de salida**: el resultado es un **rango rotulado** («Ingreso estimado, no
   confirmado»), con su origen (modelo, cota por crédito, previa de mercado) y
   separado del confirmado. Cuando hay IESS de dependiente, manda el IESS. Esto sigue
   exigiendo la decisión del negocio sobre la regla «no se especula» (P5 del plan).

### 8.4 Cómo se valida una extrapolación sin verdad

Es la parte más difícil: **donde se extrapola, no hay verdad con qué medir**. Sin
una muestra, todo lo que sigue son pruebas indirectas.

1. **Transporte entre grupos dentro de los 3,9 millones.** Entrenar en un grupo y
   probar en otro cada vez más lejano (empresas grandes contra pequeñas, privados
   contra públicos, urbano contra rural). Se obtiene una curva «distancia entre
   poblaciones contra error». Si el error crece rápido, se sabe cuánto confiar en el
   salto a los autoafiliados.
2. **Censura simulada con millones de casos** (6.1, paso 3): censurar el aporte de
   dependientes imitando a los autoafiliados y medir cuánto se recupera.
3. **Contraste con la ENEMDU**: la distribución estimada para quienes no están en el
   IESS debe parecerse a la encuesta, por celda. Si no, el modelo o la calibración
   están mal.
4. **Una muestra pequeña de independientes con ingreso verificado** (de una IFI:
   declaración, estado de cuenta). Con 400 casos, la cobertura de un intervalo se
   mide con ±5 puntos (1,96 × √(0,25 / 400) ≈ 0,049). Es lo único que valida de
   verdad el salto.
5. **Métricas que importan a una IFI**: el error por tramo de ingreso, el
   porcentaje de **sobreestimación** (más costoso que subestimar, como dice la
   tesis 4.1) y la cobertura de los intervalos por segmento, no un error global.

### 8.5 Lo que hay que saber para empezar, y cuenta con las 54.000

**Primer entregable, sin entrenar nada**: con las 54.000 que tienen estimador y
real, calcular (a) el cociente estimador/real y su variación por tramo, lo que
resuelve la **unidad** (si es anual, el cociente sería cercano a 12; la mediana de
9 sobre 45 personas ya estaba en el plan), (b) el sesgo y la sobreestimación por
tramo, (c) qué fracción está pegada al techo, y (d) una curva de calibración
(regresión isotónica o mapeo de cuantiles). Con eso se sabe si el estimador sirve
como característica, como techo o no sirve.

Preguntas que cambian el diseño:

| # | Pregunta | Qué cambia |
|---|---|---|
| Q1 | ¿Qué columnas trae la base de 3,9 millones? ¿Tipo de afiliación, sector, tamaño del empleador, provincia, edad, sexo, fecha del aporte, más de un empleo? | Qué variables puede usar el modelo, y si hay una versión sin aportes. |
| Q2 | ¿«Ingreso verificado» es el sueldo base de aporte que declara el empleador, o hay otra comprobación? ¿Suma varios empleos? | Si la verdad de los dependientes tiene sesgo propio (subdeclaración) o es un mínimo también. |
| Q3 | Las 120.000: ¿traen cédula, fecha de la consulta, y el estimador de antes y de después del cambio de techo? ¿Cuántas cayeron en 20.000 y cuántas en 10.000? | Si se puede separar las dos versiones; sin la fecha no se puede. |
| Q4 | El 45% «real»: ¿son todos dependientes? El otro 55%, ¿qué son (autoafiliados, sin IESS)? | Son justamente la población a la que se extrapola: sus variables sirven para medir el cambio de población (4.13). |
| Q5 | ¿Qué estudio del INEC dice 90% por debajo de USD 2.000, y de qué año? | Fijar el tramo de corte. Hoy no se pudo comprobar. |
| Q6 | ¿La relación cuota/ingreso de la IFI (bancos y cooperativas)? | La cota del tramo alto. |
| Q7 | ¿Se puede conseguir una muestra de independientes con ingreso verificado? | La validación 8.4, punto 4. |

### 8.6 Requisitos y riesgos

- **Cómputo**: 3,9 millones de filas con decenas de variables es un trabajo de
  minutos con LightGBM o XGBoost, **pero en Python o R**; en esta máquina no hay
  Python y el análisis pesado del repositorio corre en Node. Decisión del negocio:
  instalar Python en una máquina de trabajo, o entrenar fuera del repositorio y
  llevar a las funciones solo tablas de cuantiles (una tabla por celda se evalúa en
  TypeScript sin dependencias).
- **Datos personales**: las dos bases tienen datos personales y **no van al
  repositorio** (es público). Declarar la base legal para tratarlas es un
  requisito de los guiones del repositorio; no se analiza acá.
- **Contrato con Equifax**: usar su estimador como característica, techo o etiqueta
  puede estar limitado (4.9). No se revisó.
- **Un ingreso de aporte no es el ingreso total**: el dependiente con actividad
  propia gana más de lo que aporta (673 personas de nuestra cartera tienen ese
  perfil, según `plan-demo-ifi.md`). Entrenar con el aporte aprende el sueldo, no
  el ingreso total.
- **Un modelo entrenado con sueldos aprende cómo se pagan los sueldos**, no cómo se
  generan las utilidades de un negocio: la brecha entre ambos es el riesgo
  principal de la extrapolación y no se puede cerrar sin una muestra del grupo de
  destino.

## 9. Variables a traer para entrenar (propuesta del 2026-10-17)

El negocio contestó (chat): puede traer cualquier variable del crudo de Novadata;
las 120.000 traen cédula y fecha; el 45% con ingreso real mezcla independientes,
dependientes con ingresos extras, dependientes, pensionistas y jubilados; y hay
relación cuota/ingreso disponible. La lista de abajo sale de
`docs/novadata-fields-catalog.md`, que **se armó con solo 25 personas**: la
cobertura real de cada campo en la población se desconoce y hay que medirla en la
muestra que se traiga.

### 9.1 Dos reglas antes de la lista

1. **Calcular las variables con el código que ya existe, no a mano.** Traer el
   crudo (pesa unos 8 KB comprimido por persona, según `CLAUDE.md`) y armar el
   perfil con `buildStandardProfile(raw, cedula, corte)` y `analizarFuentesIngreso`.
   Así el entrenamiento y la producción usan **la misma implementación**; si se
   calculan las variables por separado, el modelo aprende de números que en
   producción no existen (diferencia silenciosa entre entrenamiento y uso). El
   corte del perfil debe ser el mes del ingreso verificado.
2. **Quitar toda fuga del objetivo.** El ingreso verificado sale del mismo IESS que
   alimenta varios campos del crudo. Los campos que **contienen el salario** no
   pueden ser variables del modelo que se aplicará a quien no tiene IESS: son el
   objetivo con otro nombre.

### 9.2 Tres modelos, según lo que se conozca de la persona

| Modelo | Para quién | Variables que usa |
|---|---|---|
| **S0, sin IESS** | Quien no aparece en el IESS (la mayoría de los independientes y los informales, si el dato del 9% es correcto) | Solo los grupos A a E de 9.3 |
| **S1, con IESS sin salario** | Afiliado voluntario o por cuenta propia | S0 más ocupación, tipo de empleador, antigüedad, continuidad y meses con aporte |
| **S2, con IESS y salario como cota** | El mismo afiliado | S1 más el aporte como **cota inferior** (variable, no objetivo) |

El objetivo se entrena **solo con dependientes** (privados y públicos, sin actividad
propia), y las filas de dependientes con RUC activo van aparte como censuradas
`[aporte, ∞)` (4.8).

### 9.3 La lista

Prioridad: **P1** imprescindible, **P2** útil, **P3** opcional. «Ruta» es la del
catálogo. Lo que figura en el perfil estandarizado se obtiene de ahí.

**Objetivo y control (de la base del IESS)**

| Qué | Prioridad |
|---|---|
| Identificador de unión **seudonimizado** (no la cédula en claro) | P1 |
| Mes de corte; aporte mensual **por empleador** de los últimos 24 meses | P1 |
| Tipo de afiliación (dependiente, voluntario, jubilado, pensionista...) | P1 |
| Código del tipo de empleador (`tipEmp`), RUC del empleador, ocupación, fechas de ingreso y salida | P1 |

**A. Demografía (todos)**

| Ruta | Variable sugerida | P |
|---|---|---|
| `general.personaNatural.fechaNacimiento` | edad al corte | P1 |
| `general...nivelEducacion`, `titulos` | nivel de educación (ordinal), título | P1 |
| `general.profesiones[].profesion.descripcion` | profesión (agrupada) | P1 |
| `general...genero`, estado civil, `nacionalidades` | sexo, estado civil, extranjero | **Decidir antes** |
| `hijos`, `padres`, `personaNaturalConyuge` | número de hijos, hijo menor, tiene cónyuge | P2 |

Sexo, estado civil, origen y familia son atributos que el repositorio ya trata
como «protegidos» (`ATRIBUTOS_PROTEGIDOS` en `perfil-del-modelo.ts`, a la espera
de la decisión con legal). **Traerlos para medir sesgo es una cosa; usarlos para
estimar un ingreso que alimenta una decisión de crédito es otra.** Recomiendo
traerlos y excluirlos del modelo hasta que el negocio decida.

**B. Geografía**

| Ruta | Variable sugerida | P |
|---|---|---|
| `sociodemografica.direcciones[].direccion.lugar` (parroquia, cantón, provincia) | provincia, cantón y parroquia de residencia | P1 |
| `direcciones[].tipoDireccion`, número de direcciones | tipo y cantidad | P3 |
| `vehiculos...codigoCanton` | cantón de matrícula (respaldo de la residencia) | P2 |
| `general...lugarNacimiento` | provincia de nacimiento | P3 |

En la muestra del catálogo **la residencia viene en 10 de 25 personas**
(`direcciones[].direccion.lugar`): corrige lo que dije en la sección 2, donde
escribí que la residencia no estaba. Está en el crudo, con cobertura parcial.
La cobertura de verdad hay que medirla.

**C. Trabajo propio y actividad económica (SRI)**

| Ruta | Variable sugerida | P |
|---|---|---|
| `datosContribuyente` | tiene RUC, persona natural o sociedad, antigüedad del RUC, obligado a contabilidad, ceses y reinicios | P1 |
| `datosEstablecimientoActEco` | número de establecimientos abiertos, **actividad económica** (clave para la previa por ocupación), estado, antigüedad | P1 |
| `sriImpuestoRenta` | renta causada por año (indicio, no monto; regla vigente), formulario, años con declaración | P1 |
| `sriImpuestoRenta...impuestosISD` | ISD pagado (indica movimientos al exterior) | P3 |
| `empleados` | número de empleados que paga y su nómina (sin contar a la persona) | P1 |
| `administraciones`, `cumplimientoPatronal` | empresas que administra; cumplimiento patronal | P2 |

**D. Patrimonio**

| Ruta | Variable sugerida | P |
|---|---|---|
| `vehiculos.personaVehiculo` | número, año del modelo, avalúo, precio promedio, cilindraje, clase, código de servicio y de uso, año de compra | P1 |
| `licenciaConducir` | tipo (profesional indica chofer), puntos | P2 |
| `bienesInmueble`, `inversiones.capital` | inmuebles, capital invertido (vacíos en casi toda la muestra) | P2 |

**E. Endeudamiento (Novadata)**

| Ruta | Variable sugerida | P |
|---|---|---|
| `bancos.centralRiesgoSuper.datosSuper` | por entidad: tipo, riesgo (T/G/C), calificación, saldo vigente, no devenga, tramos, judicial, castigo | P1 |
| `cooperativas.centralRiesgoCoop` | saldo total, días de mora, número de operaciones, cuota mensual (solo cooperativas la traen) | P1 |
| `bancos.retails` | deuda comercial, vencido, días de mora | P2 |
| `basesInternas.tcredQuirografarios` | crédito quirografario del IESS: **monto, saldo, plazo, tasa, `cuotaEstimada`**, días de mora | P1 |
| `basesInternas.tcredHipotecarios` | ídem hipotecario | P1 |
| `basesInternas.personasIncumplimientos` | operaciones en Novacredit: `cuotaNova`, saldo, plazo en cuotas, historial | P2 |
| `bancos.centralRiesgoDiners` | central de Diners | P3 |
| `pensionAlimenticiaNovadata` | valor mensual de la pensión que paga (indica un ingreso mínimo) | P2 |
| `demandas`, `impedimentoCargosPublicos` | número y tipo de demandas de cobro | P2 |

**F. Seguridad social (sin salario)**

| Ruta | Variable sugerida | P |
|---|---|---|
| `iess.pensionista`, `iess.jubilados` | es pensionista, es jubilado | P1 |
| `iess.afiliacionIess`, ISSFA, ISSPOL | afiliado activo, militar o policía (solo el titular) | P1 |
| `basesInternas.tiess` (sin `salario`) | ocupación, `tipEmp`, fechas de ingreso y salida, meses con aporte | P1 (S1 y S2) |

**G. Disponibilidad de la consulta**

| Qué | P |
|---|---|
| `metaConsulta`: fuentes con datos, sin datos y no medidas | P2 |

**H. Equifax (solo para quien tenga buró en la IFI)**

| Qué | P |
|---|---|
| Cuota por operación, saldo, rol, apertura; tarjetas (cupo, saldo, uso); créditos otorgados; consultas recibidas; scores | P1 |
| El estimador y su indicador | **Característica auxiliar, no etiqueta** (4.9) |

**I. Derivadas del empleador, calculadas de los 3,9 millones** (solo para el
modelo de dependientes con empleador)

| Qué | P |
|---|---|
| Número de afiliados por RUC; mediana, P25 y P75 del salario y proporción en el SBU, **sin contar a la propia persona** | P1 |
| Capital suscrito, fecha de constitución, vende a crédito, proveedor del Estado, pertenece al mercado de valores (de `personaPatrono`) | P2 |

El promedio salarial del empleador **incluyendo a la propia persona** es una fuga
del objetivo: hay que excluirla de su propio cálculo.

### 9.4 Fuga del objetivo: campos que **no** entran a S0 ni S1

`basesInternas.tiess[].salario`; `trabajoHistoricos...personaIngreso.valor` y
`valorRango`; `trabajoHistoricosMecanizado...personaIngreso.valor`;
`empleoActual.salarioAprox` del perfil; `ingresoPromedioUltimos6Meses`;
`pisoIngresoMensualReportado` (nombre interno) y sus promedios; el total de
aportes de `detalle.aportesPorMes`; `indiciosDeIngresoMayor` si se construyen con el
aporte. Todos son el objetivo con otro nombre. Para S2 el aporte **sí** puede entrar,
pero como cota (4.8).

### 9.5 Qué no traer

Nombres, teléfonos, correos, calles, fax, nombres de padres, hijos y cónyuge,
identificación del cónyuge, número de operación, placa, motor, chasis y color de
los vehículos, vacunación, cualquier dato de un tercero. No aportan al ingreso y
son datos personales: coinciden con lo que el repositorio ya saca del perfil del
modelo (`IDENTIFICADORES_QUE_NO_LLEGAN`; no se comparó campo por campo).

### 9.6 Cuántas personas traer

La consulta a Novadata es por persona: `docs/plan-demo-ifi.md` estima unas 17 h
para 20.000. Con ese ritmo (cerca de 3 s por persona), **200.000 son unas 170 h
(siete días) y 3,9 millones son unas 3.300 h (cerca de 140 días)**. Si la base
puede traerse por otro camino, esto no aplica. Si no, no hace falta tanto: una
muestra **estratificada** de 100.000 a 200.000 basta para empezar, con
sobremuestreo de lo raro (ingresos desde USD 2.000, dependientes con actividad
propia, jubilados, públicos) y con sus **pesos** guardados. El tamaño se decide con
una curva de aprendizaje: entrenar con 25.000, 50.000, 100.000 y 200.000 y parar
cuando el error de prueba deje de bajar.

### 9.7 Dos cosas sobre las 120.000

- El 45% con «ingreso real» mezcla tipos. Para dependientes el real es verdad; para
  independientes es **el aporte, una cota inferior**; para pensionistas y jubilados
  es una pensión. **La calibración de Equifax (8.5) se hace por tipo**, y solo los
  dependientes miden su error.
- Las 120.000 tienen fecha de consulta: separar las anteriores y las posteriores al
  cambio de techo (USD 20.000 a USD 10.000) antes de mezclar.

### 9.8 Pedido definitivo de columnas (decidido el 2026-10-17; prevalece sobre 9.3)

El negocio aclaró que puede extraer cualquier columna del crudo de Novadata y pidió
que yo decida cuáles, según el diseño del análisis. Criterio: **una columna entra
si alimenta el objetivo, un modelo (S0, S1, S2), la tabla de empleadores, los
estratos y pesos del muestreo, o la comparación con la ENEMDU.** Si no, no se pide.
Lo dudoso se mide en un piloto antes de pedirlo en grande.

**Tanda 1: los 3,9 millones, una tabla liviana, una fila por persona y empleador
vigente al corte** (quien no aporta ese mes tiene una sola fila; sirve para
el objetivo, la tabla de empleadores, los estratos y la comparación entre quienes
están y no están en el IESS). Un mes de corte (el más reciente) más tres columnas ya
calculadas que resumen los otros meses, para no traer 24 meses de todos.

| # | Columna | Origen en el crudo | Para qué |
|---|---|---|---|
| 1 | Identificador seudonimizado (hash de la cédula, con la misma clave que usen las 120.000) | `tiess.ci` | Unir con las demás bases sin exponer la cédula |
| 2 | Mes de corte | `tiess.anio`, `tiess.mes` | Alinear el objetivo con las variables |
| 3 | RUC del empleador y código de sucursal | `tiess.rucEmp`, `tiess.codSuc` | Tabla de empleadores |
| 4 | Código del tipo de empleador | `tiess.tipEmp` | Segmento y objetivo (dependiente o cuenta propia) |
| 5 | Ocupación | `tiess.ocupacion` | Previa por ocupación y variable de S1 y S2 |
| 6 | Salario del mes de corte, **por empleador** | `tiess.salario` | El objetivo |
| 7 | Fecha de ingreso y de salida | `tiess.fecIng`, `tiess.fecSal` | Antigüedad y vigencia |
| 8 | Suma de salarios vigentes al corte y número de empleadores vigentes | calculada | Objetivo de quien tiene dos empleos |
| 9 | Meses con aporte en los últimos 12 y 24 | calculada sobre `tiess` | Continuidad (reemplaza traer 24 meses) |
| 10 | Salario total del mismo mes un año antes | calculada | Estabilidad del objetivo |
| 11 | Fecha de nacimiento | `general.personaNatural.fechaNacimiento` | Edad (estrato y variable) |
| 12 | Género | `general...genero.descripcion` | **Solo medir sesgo**; no entra al modelo (9.3) |
| 13 | Condición de pensionista y de jubilado | `iess.pensionista.estado`, `iess.jubilados` | Separar jubilados y pensionistas del resto |
| 14 | Provincia de residencia, **si ya viene en la base** | `direcciones[].direccion.lugar.provincia` | Estrato por provincia; si no viene, se arma en la muestra |

**Tanda 2: piloto de unas 3.000 personas, crudo completo de lo que sigue.** Sirve
para medir la cobertura real de cada campo y su importancia, y decidir qué se pide
en la tanda 3. Muestra estratificada igual que la tanda 3.

| Ruta | Qué es | Qué se decide con el piloto |
|---|---|---|
| `trabajoHistoricos...personaIngreso.valor` y `valorRango` | Ingreso y rango de ingreso del historial laboral | **Si es el mismo salario del IESS** (entonces es fuga del objetivo) **o un dato independiente** (entonces es la mejor variable que hay). Es la pregunta más importante del piloto. |
| `inversiones`, `bienesInmueble`, `titulos` | Capital invertido, inmuebles, títulos | Cobertura (1 de 25, 0 de 25 y 0 de 25 en el catálogo); si queda debajo de unos pocos por ciento, se descartan |
| `demandas` (solo las de cobro) | Juicios de cobro | Importancia para el ingreso (hoy es una señal de riesgo, no de ingreso) |
| `administraciones`, `cumplimientoPatronal` | Empresas que administra | Cobertura (0 de 25 en `administraciones`) |
| Residencia (`direcciones...lugar`) | Parroquia, cantón y provincia | Cobertura real (10 de 25 en el catálogo): decide si la previa por cantón es viable |

**Tanda 3: muestra estratificada de 100.000 a 200.000, crudo de estas rutas
(se piden completas porque `buildStandardProfile` las necesita; el salario se
excluye después, al modelar, como dice 9.4).**

| Ruta | Para qué |
|---|---|
| `general` (fecha de nacimiento, género, profesiones, nivel de educación, nacionalidades, fecha de defunción, cónyuge solo como presente o ausente) | Demografía; se excluye a los fallecidos |
| `sociodemografica.direcciones` | Residencia |
| `trabajo.trabajoHistoricosMecanizado` | Historial y empleo actual (el perfil lo necesita) |
| `iess.basesInternas.tiess` completo | Aportes de 24 meses; ocupación, tipo de empleador, antigüedad |
| `trabajo.datosContribuyente`, `datosEstablecimientoActEco` | RUC activo, actividad económica, establecimientos |
| `trabajo.sriImpuestoRenta` | Renta causada por año (indicio) |
| `trabajo.empleados` | Nómina que paga |
| `iess.pensionista`, `jubilados`, `afiliacionIess`, `afiliacionIsspol`, `afiliacionIssfacCertMedico`, `afiliacionIssfacFuerzaArmada` | Segmentos y militares o policías |
| `vehiculos.personaVehiculo`, `licenciaConducir` | Patrimonio y chofer profesional |
| `bancos.centralRiesgoSuper`, `retails`, `centralRiesgoDiners`; `cooperativas.centralRiesgoCoop` | Endeudamiento y cuota de cooperativas |
| `basesInternas.tcredQuirografarios`, `tcredHipotecarios`, `personasIncumplimientos` | Cuota estimada y operaciones de Novacredit |
| `pensionAlimenticiaNovadata` | Valor mensual de pensión pagada |
| Qué fuentes contestaron (`metaConsulta`) | Tratar «no contestó» como señal y no como cero |

**Nunca se piden** (no aportan al ingreso o son datos personales sin uso):
`telefonos`, `correo`, `padres`, `hijos`, `vacunados`, `siniestros`, `polizas`,
`denuncias`, `antecedentesPenales`, `sercop`, `listasControl`, `listaNegra`,
`deudasFirmes`, `deudores`, `deudasAnt`, `deudasAmt`, `deudasEmov`,
`afiliacionSalud`, `afiliacionSiisspol`; y dentro de las rutas pedidas, los
nombres, teléfonos, correos, calles, placas, motores, chasis, colores y
números de operación.

**Estratos de la muestra (tandas 2 y 3)**: tipo de empleador (columna 4) × tramo de
salario (hasta el SBU; hasta 700; hasta 1.000; hasta 2.000; hasta 5.000; más de
5.000) × grupo de edad × provincia (columna 14). Se guarda el **peso** de cada
persona (personas del estrato en los 3,9 millones divididas por las muestreadas)
para no alterar las distribuciones al entrenar y evaluar.

**Lo que falta de parte del negocio para cerrar el pedido**: la clave del
seudónimo (la misma en las 120.000), si la columna 14 viene en la base, y qué
ingreso de las 120.000 es el «real calculado» (si es el salario del IESS, el mismo
de la columna 6).

### 9.9 Ejemplo en Excel con 20 personas y lo que se midió (2026-10-17)

El archivo `research/ejemplos-pedido-ingresos/ejemplo-pedido-columnas-ingresos.xlsx`
(fuera de git; trae datos financieros reales de 20 personas con identificador
seudónimo) tiene el diccionario, una hoja por ruta con las 3 tandas, y las hojas
`HALLAZGOS`, `COLUMNAS_DESCARTADAS` y `NO_SE_PIDE`. Se armó con los crudos de la
reconsulta del 2026-10-03 (2.567 personas). Lo que midió sobre esas 2.567 personas
(solo conteos) cambia la lista de 9.8:

| Qué se midió | Resultado | Efecto |
|---|---|---|
| Personas con aporte al IESS en el mes de corte (2026-08) | 66,9% | Coincide con el 67% de `plan-demo-ifi.md`: el conjunto de dependientes verificables es de ese tamaño |
| El ingreso del mecanizado contra el salario del IESS | Coincide en 2.203 de 2.203 | Es el mismo dato: **no se pide dos veces** (`ingreso_valor` del mecanizado sale de la tanda 3) |
| El ingreso de `trabajoHistoricos` contra el salario del IESS | Coincide con el de algún empleador en 320 de 1.895 (17%); mediana de 0,43 sobre la suma de salarios del IESS; trae dato en 80% | **No es el mismo dato** en general (parece un ingreso por empleo, antiguo). Sigue en el piloto, con la fecha de cada empleo, para decidir si sirve o es ruido |
| Residencia (provincia, cantón, parroquia) | 45,7% de las personas (el catálogo de 25 decía 40%) | La previa por cantón cubre menos de la mitad: hace falta decidir qué hacer con el resto |
| Atributos del empleador (capital, constitución, proveedor del Estado...) | 0% en el mecanizado; capital 51% y constitución 52% en `trabajoHistoricos` | Se descartan del mecanizado; quedan en el piloto |
| Inmuebles, administraciones | 1,6% y 1,1% | Casi vacíos: solo piloto |
| Columnas sin ningún dato (13) | 0% | Salen del pedido (hoja `COLUMNAS_DESCARTADAS`) |

Dos avisos: los porcentajes son de **una cartera de 2.567 personas del negocio**,
no de los 3,9 millones; y el RUC de una persona natural lleva su cédula
adentro, por eso el archivo lo entrega como seudónimo (`PN-…`) y deja en claro
solo el de las sociedades.

## 10. Instalación de Python en esta máquina

**Hecho el 2026-10-17.** El negocio instaló Python 3.15.0 (administrador de
instalaciones de Python). Se creó el entorno `C:\datos\ingresos\entorno` (fuera del
repositorio) y se instalaron, desde paquetes ya compilados: numpy 2.5.4, pandas
3.0.6, pyarrow 26.0.0, duckdb 2.0.0.dev (versión de desarrollo, no estable),
scikit-learn 1.9.1, scipy 1.18.1, lightgbm 4.7.0, xgboost 3.4.1, statsmodels 0.15.0,
matplotlib 3.11.2 y openpyxl 3.1.5. Prueba de humo con datos sintéticos: `survival:aft`
de XGBoost, cuantiles de LightGBM y DuckDB sobre parquet funcionan. Los datos
(3,9 millones y 120.000) van en `C:\datos\ingresos\`, fuera de
`C:\Users\hugop\siint`. Python 3.15 es muy nuevo: si un paquete falla al instalarse,
se usa un Python 3.12 o 3.13 aparte.

## 11. El Censo 2022 como fuente (analizado el 2026-10-17)

Página: <https://www.censoecuador.gob.ec/data-censo-ecuador/>. Se leyó la página, los
diccionarios de variables de cantón, sector y manzana, el cuestionario censal y la
guía de usuario. **No se descargaron las bases** (los archivos comprimidos de CSV
pesan 595 MB, 597 MB y 692 MB según el encabezado del servidor; expandidos pesan
más, sin medir).

### 11.1 Qué es

El VIII Censo de Población y VII de Vivienda (2022): **microdatos anonimizados por
persona**, no tabulados. Población: 16.938.986 personas y 5.193.548 hogares, con 92
a 100 variables según el nivel. Hay tres niveles de desagregación geográfica: cantón
(con las variables de orientación sexual e identidad de género), **sector censal** y
manzana o localidad (con menos variables por confidencialidad). Formatos: CSV, SPSS y
REDATAM. También están el censo de 2010 y el de 2001 ajustados a la división
administrativa de 2022. La página no declara licencia.

### 11.2 Lo que la página sugiere y el censo no trae: ingresos y estratos

**El censo no pregunta por ingresos.** Ninguna variable de los tres diccionarios
se llama ingreso, sueldo, salario, remuneración, renta, estrato ni quintil (se
buscó en las tres bases). La palabra «ingreso» solo aparece en la pregunta que
define quién trabajó («trabajó al menos una hora para generar un ingreso»). **Tampoco
hay un estrato socioeconómico**; lo más cercano es la pobreza por necesidades
básicas insatisfechas (`NBI`) y el déficit habitacional (`DEF_HAB`), que miden
carencias de la vivienda y el hogar, no ingreso.

### 11.3 Lo que sí trae y sirve

| Variable | Qué es |
|---|---|
| `P27` | Ocupación (CIUO-08, 4 dígitos) |
| `P28` | Actividad económica del negocio o empresa (CIIU, 4 dígitos) |
| `P29` | Categoría de ocupación: empleado privado, empleado del Estado, jornalero, doméstico, patrono, **cuenta propia**, socio, familiar no remunerado |
| `P30` | **Aporta actualmente**: IESS general, voluntario, campesino, ISSFA, ISSPOL, o jubilado |
| `P17R`, `ESCOLA` | Nivel de instrucción y años de escolaridad |
| `CONDACT`, `GRUPO1`, `RAMA1` | Condición de actividad, grupo de ocupación y rama |
| `H1001` a `H1012` | Bienes del hogar: teléfono, televisión pagada, internet fijo, computadora, refrigeradora, lavadora, secadora, microondas, automóvil, moto |
| `H09`, `H01`, `DEF_HAB` | Tenencia y calidad de la vivienda |
| `P03`, `P02`, `P31`, `P08C`, `P09C` | Edad, sexo, estado conyugal, cantón de nacimiento y cantón donde vivía hace 5 años |
| `I01`, `I02`, `I03`, `I05`, `AUR` | Provincia, cantón, parroquia, sector y zona urbana o rural. **La parroquia y el sector solo están en la base de sector y de manzana, no en la de cantón** |

### 11.4 Para qué sirve en el predictor

1. **Marco de la población.** Cuántas personas hay por ocupación × categoría ×
   cantón: sirve para ponderar la muestra al total del país (el cambio de población
   de 4.13) y para ver cuánto pesa cada tipo de independiente. Con `P29` (cuenta
   propia) y `P30` (aporta al IESS) se puede **medir cuántos independientes
   aportan**, que es el dato que dije con reserva (el 9%, sin fuente confirmada).
   Es un cálculo directo sobre el censo; no se hizo.
2. **Estimación por áreas pequeñas.** En 4.16 escribí que no se encontró un mapa
   de ingreso con el censo 2022. El **censo existe y es público**, con la misma
   clasificación de ocupación y actividad que la ENEMDU (CIUO-08 y CIIU de la
   versión 4, según el INEC). Se puede ajustar el ingreso laboral en la ENEMDU con
   las variables que ambos comparten (ocupación, categoría, escolaridad, edad, sexo,
   aporte al IESS, bienes del hogar) y **predecir en el censo**: da una previa de
   ingreso por sector y parroquia × ocupación, con su error. Es el método de
   Elbers-Lanjouw-Lanjouw de 4.16 y la guía del Banco Mundial de 4.17. La variable de
   ingreso de la ENEMDU **no se confirmó** (hay que abrir su diccionario).
3. **Entorno de cada persona.** Si la cartera tiene la parroquia (45,7%), se agregan
   desde el censo indicadores de su sector o parroquia: porcentaje en pobreza por NBI,
   escolaridad promedio, porcentaje con automóvil o computadora, porcentaje de
   cuenta propia y de aporte al IESS. Es la forma de **construir el estrato** que
   el censo no trae, sin necesidad de un modelo. Sirve como variable del modelo
   para quien no tiene IESS.
4. **Cobertura de la previa geográfica**: con la parroquia en menos de la mitad de
   la cartera, el resto cae al cantón (la base de cantón no trae parroquia).

### 11.5 Límites

- **No hay ingreso**: lo que el censo da es un contexto, no un valor. La premisa de
  que el 90% de las personas gana menos de USD 2.000 **no sale del censo**; la fuente
  habría que buscarla en la ENEMDU (no se encontró el estudio del INEC citado).
- **Desfase**: es de 2022 y el SBU y los ingresos cambiaron desde entonces. Sirve
  para la estructura (quién es qué y dónde), no para el nivel actual.
- **Anonimización**: el sector y la manzana están anonimizados (algunos sectores se
  agruparon) y la manzana quita variables. La calidad de la codificación de la
  ocupación a 4 dígitos **no se evaluó**.
- **El sector es una persona promedio, no la persona**: usar un indicador de
  sector para una persona es una inferencia ecológica; puede sesgar.
- **Peso y herramientas**: 16,9 millones de filas. En esta máquina hay unos 20 GB
  libres y falta Python; se leería con DuckDB solo las columnas necesarias.

### 11.6 Qué hacer

Usar el censo como (a) marco y pesos, (b) indicadores de entorno por sector y (c)
base de la estimación por áreas pequeñas con la ENEMDU. **No como fuente de
ingreso.** Primer paso, cuando Python esté instalado: bajar la base de **sector**
en CSV (la de cantón no trae parroquia) y la ENEMDU anual 2024, y producir dos
tablas: «sector → indicadores de entorno» y «ocupación × categoría × cantón ×
aporta al IESS». Con la segunda se contesta cuántos independientes aportan.

## 12. Resultados con datos públicos: ENEMDU 2024 y Censo 2022 (calculados el 2026-10-17)

Se descargaron con autorización del negocio: la base de personas de la ENEMDU anual
2024 (datos abiertos, CSV, 14 MB; 341.394 personas) y la base de sector del censo
(595 MB comprimida; 16.938.986 personas y 5.193.548 hogares). Todo se calculó en
local con Python (`C:\datos\ingresos\scripts\`, resultados en
`C:\datos\ingresos\resultados\`, fuera del repositorio). Son datos públicos y sin
identificadores.

### 12.1 Cuánto gana la gente: ENEMDU 2024 (ingreso laboral `ingrl`, ponderado)

Universo: 8.175.813 personas con empleo; con ingreso laboral válido 7.139.346. Se
excluyeron 17.597 sin ingreso, 381 que no respondieron (código 999999) y 1.556 con
ingreso negativo; se mantuvieron los 2.518 con ingreso cero. SBU 2024: USD 460.

| Grupo | Población | P25 | Mediana | P75 | P90 | Gana menos del SBU | Gana USD 2.000 o más |
|---|---|---|---|---|---|---|---|
| **Todos los ocupados** | 7,14 M | 190 | **400** | 573 | 940 | 56,0% | **1,7%** |
| Cuenta propia | 2,90 M | 110 | 230 | 420 | 600 | 78,0% | 0,7% |
| Empleado privado | 2,30 M | 400 | 500 | 650 | 960 | 30,6% | 1,6% |
| Jornalero o peón | 0,97 M | 162 | 250 | 400 | 500 | 83,7% | 0,0% |
| Empleado de gobierno | 0,54 M | 785 | 980 | 1.320 | 1.800 | 0,7% | 7,8% |
| Patrono | 0,18 M | 500 | 700 | 1.200 | 2.100 | 22,8% | 13,0% |
| Empleado doméstico | 0,21 M | 230 | 335 | 510 | 560 | 64,7% | 0,0% |

Por afiliación (`p05a`): sin seguro 4,42 M (mediana 270); IESS general 2,03 M (mediana
640; el 8,8% gana menos del SBU); seguro campesino 0,36 M (mediana 200); **IESS
voluntario 0,21 M (mediana 480; P25 300; P75 730; P90 1.200; el 45,5% gana menos del
SBU; el 7,7% gana entre 0,95 y 1,05 SBU; el 17,1% gana más de dos SBU)**. Por
sector: informal 3,44 M (mediana 210), formal 3,38 M (mediana 550).

**Qué cambia respecto de lo que se había dicho:**
- **La premisa «el 90% gana menos de USD 2.000» se queda corta:** en la ENEMDU el
  **98,3%** de los ocupados gana menos de USD 2.000 y el P90 es USD 940. El 1,7% que gana
  USD 2.000 o más es el tramo que se pensó resolver con la cuota. Lo que no mide la
  encuesta es la cartera de una institución financiera: quien tiene crédito es más
  formal y gana más que el promedio, así que **el peso de ese tramo en la cartera de una
  IFI no se puede deducir de acá** (se medirá con las 120.000).
- **Una encuesta subestima los ingresos altos** (se conoce como problema general de
  las encuestas de hogares; no se midió acá). El ingreso laboral tampoco incluye
  capital, pensiones ni transferencias.
- **El afiliado voluntario típico gana alrededor del SBU, pero casi la mitad gana
  menos.** Confirma con datos la corrección de 4.8: **aportar en el SBU no dice que se
  gane el SBU**.

### 12.2 Cuántos independientes aportan al IESS

| Fuente | Cuenta propia | Aporta IESS (general o voluntario) | % |
|---|---|---|---|
| ENEMDU 2024 (ponderado, afiliado o cubierto) | 2,90 M | 0,27 M (voluntario 0,15 M; general 0,12 M) | **9,4%** |
| Censo 2022 (ocupados, «aporta actualmente») | 1,67 M | 0,28 M (voluntario 0,14 M; general 0,14 M) | 16,7% |

Las dos fuentes coinciden en el número absoluto (**unos 275.000 independientes
aportan**) y difieren en el denominador, porque el censo cuenta menos ocupados que la
ENEMDU (6,57 M contra 8,18 M). Así, el 9% que había citado con reserva (Primicias) queda
**respaldado por la ENEMDU**. En el censo, el 79,2% de los cuenta propia no aporta a
nada, y el 8,5% aporta al seguro general y el 1,5% al campesino. Por provincia, el
aporte de los cuenta propia va del 8,2% (Esmeraldas y Orellana) al 24,1% (Pichincha); Guayas
tiene el 14,0%.

**Consecuencia para el diseño:** la población a la que hay que extrapolar (cuenta propia sin IESS) es de
**1,3 a 2,4 millones de personas**, y las que sí están en la base del IESS con ingreso
propio son **unas 275.000**, una minoría que se afilió. Parecen muy pocas para
representar a todas.

### 12.3 El «estrato» que el censo permite construir

Con el censo se calculó, para cada uno de los **53.470 sectores censales**, qué porcentaje
de su población está en pobreza por NBI, su escolaridad promedio (25 años o más), el
porcentaje de ocupados que son cuenta propia o aportan al IESS/ISSFA/ISSPOL, y el
porcentaje de hogares con automóvil, computadora, internet fijo y vivienda propia
(`censo2022_entorno_por_sector.csv`). Los indicadores se mueven juntos: la correlación
entre escolaridad promedio y hogares con computadora es 0,88, y entre NBI y hogares con
computadora, −0,82. Hay **1.242 sectores con menos de 50 personas** y 117 sin ocupados: se
marcan para no usarlos. Falta unir la parroquia que trae Novadata con el código de
parroquia del censo (`I03`): las dos codificaciones **no se compararon**.

### 12.4 Variables de la ENEMDU que también están en nuestro lado

`ingrl` (ingreso laboral), `p63` (ingreso de patronos y cuenta propia), `p66` (ingreso
de dependientes), `p42` (categoría de ocupación), `p05a` (afiliación), `grupo1`
(ocupación CIUO-08 a un dígito), `rama1` (actividad CIIU 4 a un dígito), `prov`,
`area`, `p02` (sexo), `p03` (edad), `nnivins` (nivel de instrucción) y `secemp`
(formal, informal, doméstico). La variable `estrato` de la base **es un estrato
muestral, no un estrato socioeconómico** (la guía dice «identificación de estrato
muestral»): no se usa como tal. Los códigos de `p42` no vienen explicados en el
diccionario ni en la guía; se tomaron de los tamaños de población (cuenta propia
2,9 M, empleado privado 2,3 M, doméstico 0,2 M) y de la clasificación usual de la
encuesta: **confirmar con el cuestionario de la ENEMDU**.

### 12.5 Qué sigue con esto

1. **Previa de mercado**: ya está la tabla de ingreso por categoría, provincia y grupo
   de ocupación (CSV en `resultados/`); falta decidir las celdas finas (con pocas
   observaciones el percentil no es confiable: cada tabla trae `n_muestra`).
2. **Estimación por áreas pequeñas** con el censo como población y la ENEMDU como
   encuesta: las variables en común son edad, sexo, escolaridad, categoría de
   ocupación, ocupación, rama, afiliación y bienes del hogar. El censo ya está cargado en
   DuckDB (`censo.duckdb`).
3. **Referencia para el modelo de autoafiliados**: cuando haya modelo, el ingreso
   predicho para los afiliados voluntarios debería parecerse a la distribución de
   12.1 (P25 300, mediana 480, P75 730, P90 1.200 en la ENEMDU). Si no se parece, el
   modelo está mal calibrado en ese grupo.

### 12.6 Previa de ingreso por sector censal (calculada el 2026-10-18)

**Qué se hizo.** Modelo de cuantiles (LightGBM, 15 niveles de 2% a 99,5%) entrenado con
142.836 ocupados de la ENEMDU 2024 con ingreso mayor que cero, y aplicado a los 6.557.334
ocupados de 15 años o más del censo 2022. Cada persona del censo recibe una distribución
de ingreso; el sector (53.352 con ocupados) es el promedio de sus personas. Guion:
`scripts/sae_3_modelo.py`; salida: `resultados/sae_prior_por_sector.csv`.

**Variables.** Provincia, área, sexo, edad, escolaridad (5 niveles), grupo de ocupación
y rama. **No entra la categoría de ocupación**: no se pudieron confirmar los códigos de
`p42` (ENEMDU) ni de `P29` (censo), y sus distribuciones nacionales no calzan una a una
(por ejemplo, el código 6 es 36% de la ENEMDU y 25% del censo). Tampoco entra la
afiliación al IESS, por la misma razón (64% sin aporte en la ENEMDU, 45% en el censo).
Son dos variables que el modelo de autoafiliados sí necesita.

**Armonización de la escolaridad.** La ENEMDU trae 5 niveles y el censo, años. Se
cortaron los años para igualar proporciones: 0-2 años = ninguno, 3-12 = básica, 13-15 =
bachillerato, 16 o más = superior. Es una aproximación: en los cortes de 13 a 15 la
diferencia contra la ENEMDU es de 1 a 2 puntos. El grupo de ocupación 0 del censo se
tomó como el 10 de la ENEMDU; 11% de los ocupados del censo no trae grupo (99) y se
predicen con un modelo sin ese dato (12,9% de los ocupados usan un modelo con menos
variables).

**Validación (6 grupos de provincias; se entrena sin la provincia que se evalúa).**

| Medida | Resultado |
|---|---|
| R² del logaritmo (mediana) | 0,40 |
| Cobertura del cuantil 90% | 85,0% (debería ser 90) |
| Cobertura del cuantil 99% | 97,9% (debería ser 99) |
| % menor a USD 1.000: previsto / observado | 92,3% / 91,7% |
| % de USD 2.000 o menos: previsto / observado | 98,9% / 98,4% |
| % de USD 460 o menos: previsto / observado | 64,2% / 59,1% |
| Error medio absoluto por provincia (log) | 0,15 |
| Peor provincia | Galápagos, -0,82 (el modelo predice 56% de lo observado) |

**Lectura.**
- El modelo es mejor para ordenar sectores que para fijar niveles: el R² de 0,40 sale de
  variables demográficas y de ocupación, no del ingreso.
- Subestima la cola alta (cuantiles de 90% y 99% quedan cortos): las colas altas no se
  deben leer de este modelo. Eso confirma que el tramo de más de USD 2.000 va por la
  cuota y no por una previa.
- Una provincia que el modelo no vio (Galápagos) sale 56% por debajo. El modelo final sí
  la ve (está en la ENEMDU), pero el resultado dice que el efecto de un lugar se
  aprende de la encuesta y no se infiere de las demás provincias; con pocos casos
  en una provincia (Galápagos tiene 1.660 en la muestra) la previa es débil.
- **Aplicado al censo**, la previa da 52,8% con USD 460 o menos y 2,1% con USD 2.000 o
  más, contra 59,1% y 1,6% de la ENEMDU directa. El censo tiene más escolaridad y menos
  ocupados (6,56 millones contra 7,0 en la ENEMDU): el modelo es coherente con la
  diferencia de composición, pero no se pudo separar de un sesgo del propio modelo.
- Los sectores con menos de 30 ocupados son 3.719; su promedio es ruidoso y no debe
  usarse solo.
- **Sin intervalo todavía**: el valor por sector es un promedio de distribuciones
  individuales y no incluye el error de estimación del modelo (EBP o Fay-Herriot lo
  darían). No presentarlo como estimación con error conocido.

### 12.7 Con la categoría de ocupación (v2, 2026-10-18)

**Cómo se emparejaron los códigos.** El diccionario de la ENEMDU (abril 2023, depositado en
`research/`) trae solo nombres de variables, sin las etiquetas de los códigos. Se dedujeron
de los datos:
- **ENEMDU `p42`:** `p63` es ingreso de patronos y cuenta propia, y `p66` es ingreso de
  dependientes. Los códigos 1, 2, 4 y 10 tienen 100% `p66` (dependientes); 5 y 6 tienen
  99-100% `p63` (independientes); 7, 8 y 9 no tienen ninguno (no remunerados). Con la
  mediana y el aporte: 1 público (mediana 1.000), 2 privado (510), 4 jornalero (250),
  10 doméstico (326), 5 patrono (760), 6 cuenta propia (250).
- **Censo `P29`**, por el perfil de cada código: 2 = público (48% en administración
  pública, 24% en educación, 100% aporta, 17 años de escolaridad); 1 = privado; 3 =
  jornalero (58% agro, 1,5% aporta, 8 años); 5 = patrono; 6 = cuenta propia; 4 = doméstico
  (probable: 80% en ocupaciones elementales); 7, 8 y 9 no se pudieron identificar y quedan
  como «otro». **Es una deducción, no una etiqueta oficial**: confirmar con el diccionario
  del censo.

**Resultado (mismo método de 12.6, con la categoría).**

| Medida | Sin categoría | Con categoría |
|---|---|---|
| R² del logaritmo (mediana) | 0,40 | 0,48 |
| Error medio absoluto por provincia (log) | 0,150 | 0,140 |
| % de USD 460 o menos: previsto / observado | 64,2 / 59,1 | 63,5 / 59,1 |
| Censo: % de USD 2.000 o más | 2,06 | 1,91 (ENEMDU directa 1,58) |
| Censo: % de USD 460 o menos | 52,8 | 52,8 (ENEMDU directa 59,1) |

La categoría sube el R² ocho puntos y mejora el orden de los sectores; no corrige el
desfase contra la ENEMDU directa (52,8% contra 59,1% con USD 460 o menos), que queda sin
explicar. Galápagos sigue en -0,77 y la provincia 03 (Cañar) en -0,46 cuando no se
entrenan. La afiliación al IESS no se agregó: el censo declara más aporte que la
ENEMDU (cuenta propia: 16,7% contra 9,4%), y entraría como un sesgo hacia arriba.
Salida: `resultados/sae_v2_prior_por_sector.csv`; guion `scripts/sae_6_modelo_v2.py`.

### 12.8 Cruce de la residencia de Novadata con el censo (2026-10-18)

**Qué se probó.** Con las 2.567 personas del crudo del 2026-10-03: la residencia de la primera
dirección con lugar (`direcciones[].direccion.lugar`) se cruzó con el código del censo
(provincia + cantón + parroquia, `I01 I02 I03`). Guion `scripts/geo_2_cruce.py`; tabla del cruce en
`resultados/geo_cruce_novadata_dpa.csv`; previa por parroquia en
`resultados/sae_v2_prior_por_parroquia.csv`.

**Hallazgos.**
- **Los ids de Novadata son propios**, no los del INEC: cantón 75 es Guayaquil y parroquia 474
  es Tarqui. El único camino es el **nombre**. Se usó la lista de nombres de la División
  Político Administrativa 2012 (capa pública de ArcGIS, 1.040 parroquias, consultada solo por
  atributos); es de 2012, así que las parroquias creadas después no están.
- **El censo por sector no separa las parroquias urbanas**: todo Guayaquil urbano es la
  parroquia `50` (1,05 millones de ocupados) y todo Quito urbano también (0,85 millones). Una
  parroquia de Novadata como Tarqui, Iñaquito o Cotocollao solo se puede ubicar a nivel de
  cantón urbano.
- **Resultado del cruce** (1.173 personas con residencia, 45,7% de las 2.567):

| Nivel al que se llega | Personas | Porcentaje |
|---|---|---|
| Parroquia (rural y las pocas urbanas con código propio) | 264 | 22,5% |
| Cantón urbano (parroquia `50`) | 908 | 77,4% |
| Sin cruce (Yantzaza escrito con dos grafías) | 1 | 0,1% |

  El código resultante existe en el censo para el 99,9%.
- **Lo que esto significa**: para tres de cada cuatro personas con residencia, la previa es la
  de su ciudad entera. Esa previa casi no distingue: Quito urbano da una mediana prevista de
  524 y Guayaquil urbano 444, y la mediana de las 221 cabeceras va de 218 a 890. La parroquia
  rural sí cambia el resultado (mediana de las rurales 297 contra 404 de las cabeceras).
- **Casos particulares resueltos**: la DPA 2012 trae «RUMIÐAHUI»; «El Empalme» figura como
  «Empalme»; La Concordia pasó de Esmeraldas (0808) a Santo Domingo de los Tsáchilas (2302) y
  el censo 2022 usa el segundo.
- **Para refinar las ciudades hace falta otro dato**: el censo trae la zona (`I04`) y el sector
  (`I05`), pero Novadata solo trae el nombre del barrio o parroquia urbana. Con la dirección
  completa o las coordenadas (que Equifax sí trae en el crudo) se podría llegar al sector.
  Es una pregunta para el proveedor: si las coordenadas vienen en la base de 3,9 millones.

### 12.9 La ENIGHUR 2024-2025 (revisada el 2026-10-20)

**Qué es.** Encuesta de ingresos y gastos de los hogares del INEC, de diciembre de 2024 a
noviembre de 2025: 35.398 hogares y 117.758 personas, con el marco del censo 2022. Cubre el país,
las 24 provincias, los cantones Cuenca, Loja, Quito y Ambato, y las zonas urbanas de Guayaquil,
Machala, Esmeraldas, Santo Domingo y Manta. Las bases son públicas (licencia CC BY 4.0);
se bajaron el diccionario, la guía de uso, los tabulados y la base en CSV (259 MB comprimida;
resultados en 12.10). Presentación y página de publicación:
`ecuadorencifras.gob.ec/encuesta-nacional-de-ingresos-y-gastos-de-los-hogares-urbanos-y-rurales/`.

**Cifras de la presentación (por hogar, no por persona).** Ingreso mensual promedio de USD 1.135
(urbano 1.247, rural 793); 35,7% de los hogares con menos de un salario básico (USD 470),
33,2% con uno a dos y 31,1% con dos o más; 1,8 personas que reciben ingreso por hogar; 28,8% de los
hogares gasta más de lo que ingresa. **No se comparan con las cifras personales de 12.1**: un hogar
suma varios ingresos.

**Por qué importa más que la ENEMDU.** El diccionario (`ENIGHUR2025_PERSONAS_INGRESOS`, 347
variables) trae **por persona**:
- ingreso con detalle: remuneración mensual, horas extras, fondo de reserva, comisiones,
  décimos y utilidades; deducciones por aporte al seguro social e impuesto; ingreso neto;
- de patronos, socios y cuenta propia: ventas brutas, gastos del negocio (sueldos, insumos,
  impuestos, alquileres) e ingreso neto del negocio;
- **deuda**: pago de préstamos de bancos y cooperativas, pago de cuotas por compras a crédito y
  recibo de préstamos en los últimos 12 meses (`i1901003`, `i1901005`, `i1801002`);
- **tarjetas de crédito** bancaria y comercial, y cuántas (`PA52A`, `PA52B`);
- **afiliación** al seguro social, tipo de contrato, **RUC o RISE/RIMPE del negocio** (`PA26`),
  cuántas personas trabajan en la empresa, categoría, grupo de ocupación, rama, horas, sexo,
  edad, estado civil e instrucción.

Son casi las mismas variables que el modelo usaría con Novadata y el IESS, medidas junto con el
ingreso real y las deudas de la misma persona. Sirve para: (a) calibrar la relación entre cuota e
ingreso con datos públicos, mientras llega la proporción de los bancos; (b) validar la previa
de 12.6-12.8 con una medición más completa, sobre todo para independientes; (c) ver cuánto
ingreso tienen los independientes afiliados al IESS.

**Límites.** Pocos hogares para zonas pequeñas: solo sirve para provincias y las ciudades
nombradas. Período distinto del de la ENEMDU 2024 (salario básico de 470 y no de 460). No se
comprobó todavía el contenido de los datos: ni si las variables de deuda traen el monto o solo
el sí/no, ni los códigos de cada categoría. Las cifras de ingreso que declara una encuesta son
de la persona y no están verificadas, y los pagos de deuda son de los últimos 12 meses, no
la cuota de hoy.

### 12.10 Resultados con la base de personas de la ENIGHUR (calculados el 2026-10-20)

Base `ENIGHUR2025_PERSONAS_INGRESOS` (117.758 personas; 44.331 con ingreso laboral, 7,08 millones
expandidos), ponderada con `Fexp`. Guion `scripts/enighur_2_ingresos.py`. El ingreso laboral es el
neto de dependientes (`i1703099`) o el neto del negocio de independientes (`i1706099`), mensual.
Los códigos de afiliación (`P06_1`) y de ocupación (`PA23`) no se confirmaron con una etiqueta oficial:
se identificaron por tipo de ingreso y por parecido con la ENEMDU.

**Confirma lo medido con la ENEMDU.**

| Medida | ENEMDU 2024 | ENIGHUR 2024-2025 |
|---|---|---|
| Mediana del ingreso laboral | 400 | 426 |
| Ocupados con USD 2.000 o más | 1,7% | **1,7%** |
| Independientes: mediana | 230 (cuenta propia) | 263 |
| Voluntarios: mediana | 480 | 480 (código 2) |

La coincidencia de la cola alta (1,7%) con una encuesta más detallada indica que la ENEMDU no
subestima el tramo de más de USD 2.000 de forma importante.

**Independientes afiliados al seguro social (código 1 o 2 de `P06_1`).** Son unos 303.000
(la ENEMDU daba 275.000) y su ingreso real es muy disperso: mediana 446, **52% por debajo de
USD 470**, P90 de 1.656 y **7,8% con USD 2.000 o más**. Los independientes sin seguro: mediana 249,
5,9% con 940 o más y 1,0% con 2.000 o más. Es la distribución que el modelo de autoafiliados tiene
que reproducir (reemplaza la referencia de 12.5, punto 3).

**Deuda por tramo de ingreso laboral (personas con ingreso).**

| Tramo | Pagan préstamos | Pago medio de quienes pagan | Mediana del pago sobre el ingreso | Con tarjeta de crédito |
|---|---|---|---|---|
| Menos de 470 | 17,4% | USD 160 | 38% | 6,1% |
| 470 a 940 | 38,9% | USD 238 | 28% | 21,0% |
| 940 a 2.000 | 59,1% | USD 447 | 29% | 54,2% |
| 2.000 o más | 66,1% | USD 1.103 | 30% | 67,5% |

- Entre quienes pagan préstamos, la relación pago/ingreso tiene mediana de 31%, P75 de 55% y P90
  de 92%; en los tramos de 470 en adelante son 28-30%, P75 de 47-49% y P90 de 71-74%. **El 0,40
  que se usó como ejemplo en este documento cae entre la mediana y el P75 de lo que la gente
  paga**, pero no es el máximo que aprueban los bancos: el dato que se pidió al negocio.
- La relación es estable (28-30%) en los tramos de 470 en adelante y no crece con el ingreso. Eso
  apoya usar la cuota para acotar el ingreso hacia arriba, con un margen amplio: una misma cuota
  corresponde a ingresos muy distintos (P25 de 15% y P90 de 92%).
- **Duda sobre la unidad**: no se confirmó si el monto es mensual o un promedio de los últimos 12
  meses. Los montos de otras preguntas de la misma sección (préstamos recibidos) son múltiplos
  de un doceavo, lo que apunta a un monto mensual equivalente. También incluye cualquier prestamista,
  no solo bancos.

**Pendiente.** Confirmar la unidad del pago de préstamos y los códigos con el formulario
(`formularios.zip`, sin bajar); repetir el análisis por ocupación y provincia, y usar estas personas
como segunda validación del modelo de tres tramos.

### 12.11 La base de AWS con el predictor de Equifax (medido el 2026-10-20)

Otra sesión extrajo de la base de AWS 389.012 consultas con `IncomePredictor` de 278.504 personas
(2021-03-04 a 2026-10-20), en `research/ingresos-aws/` (fuera de git, con identificación en claro;
diccionario en `LEEME-predictor-equifax.md`). Lo que se reverificó aquí con `scripts/aws_*.py`:

**El techo del predictor sí cambió en 2026** (el LEEME de esa sesión dice que no se ve; midió el
máximo de todos los años juntos, y hasta febrero el 20.000 sigue apareciendo):
- Hasta la semana del 2026-02-23 hay valores exactos en 20.000 (1,3% a 2,7% de las consultas por semestre, de
  2021 a 2025).
- **Desde la semana del 2026-03-02 el máximo es 10.000** y ya no hay valores en 20.000 ni entre 10.001 y
  19.998 hasta el 2026-04-06.
- **Desde la semana del 2026-04-13 reaparecen valores sobre 10.000** (hasta 15.275, repetido), así que el
  nuevo comportamiento no es un tope en 10.000 sino otra regla, no confirmada.
- **Cuatro regímenes en 2026** (por `fecha_consulta_equifax`; medidos con `scripts/aws_7_regimenes.py`):

| Período | Cómo son los valores | Mediana |
|---|---|---|
| Hasta 2026-01-13 | Continuos (p. ej. 630,22); tope 20.000 | 1.378 |
| 2026-01-14 y 15 | Hueco, con muchos ceros | — |
| 2026-01-16 a 2026-03-01 | Discretos: 599 (1.936 veces), 437 (1.054), 0 (783); aún aparece el 20.000 | 926 |
| 2026-03-02 a 2026-04-12 | Tope 10.000; repetidos 1.051, 2.051, 1.501, 701, 2.551, 3.001, 4.001 | 1.188 |
| Desde 2026-04-14 | Sobre 10.000 (hasta 15.275); repetidos 490 y 698 | 1.369 |

- **Versiones del predictor, según el negocio** (aclaración del usuario del 2026-10-20; los cortes de fecha son
  los medidos arriba): V0, tope de 20.000; V1, el cambio de modelo de Equifax, con tope de 10.000 desde febrero o
  marzo; V2, una corrección de Equifax que daba valores muy específicos (los repetidos 1.051, 2.051, 1.501) y que el negocio
  considera mal hecha; **V3, la corrección del negocio, vigente desde abril**: se segmenta el valor del
  modelo de Equifax en 15 rangos y a cada rango se le aplica un factor que se multiplica por el valor original
  (la tabla del negocio muestra los topes de cada rango: 350 pasa a 396, 1.200 a 1.433, 2.300 a 2.879, 10.000 a
  15.276). **Se aplica a todo lo que se guarda y los datos recibidos ya lo traen**: la sesión de AWS comprobó que el valor
  guardado es idéntico al del crudo de la respuesta en todas las semanas desde octubre de 2025, así que lo que se
  ve posterior a abril es el valor corregido (el 15.275 es el 10.000 corregido) y el valor original de Equifax no
  está en la base. **La fórmula es una potencia, no un producto** (Excel del negocio: `=EXP(F*LN(E))`, es decir, nuevo = valor
  original elevado al factor del rango del valor original): 350 elevado a 1,021 da 396. Reproduce los 15 topes
  de la tabla sin error (`scripts/aws_10_invertir.py`), así que **se puede deshacer**: valor original = nuevo elevado a
  1/factor, probando cada rango. Es ambigua solo en los bordes de rango (la función salta: 350 da 396 y 351 da 392).
  **Al deshacerla se ve que la discretización de Equifax sigue dentro de V3**: los valores guardados más repetidos
  desde abril, 490 y 698, vuelven a ser 437 y 599, los mismos valores de enero y febrero (1.051 es 893, 2.051 es 1.678,
  1.501 es 1.238).
- **Qué parte de cada régimen está discretizada** (consultas cuyo valor original, ya sin la corrección, se repite 30 veces o
  más) y qué tanto informa (correlación de logaritmos con el salario del IESS del último mes, solo para ver si sigue
  midiendo algo):

| Régimen | Consultas | En valores repetidos | Correlación con el IESS |
|---|---|---|---|
| Hasta el 13 de enero | 30.560 | 11,1% | 0,29 |
| 16 de enero al 1 de marzo | 14.694 | 26,8% | 0,31 |
| 2 de marzo al 12 de abril | 13.006 | 56,6% | 0,31 |
| Desde el 13 de abril (sin la corrección) | 67.708 | 63,4% | 0,36 |

- **Decisión del negocio (2026-10-21)**: la fórmula de Equifax fue «poner el promedio de cada rango que ellos definieron», por
  lo que de esos valores no se puede inferir nada, y se descartan los datos de ese período por ser pocos. Los cortes de fecha
  de arriba están confirmados. **Observación**: los períodos del 16 de enero al 12 de abril suman 27.700 consultas,
  pero la discretización sigue en el 63% de lo posterior a abril (67.708 consultas) y no pierde correlación con el IESS.
  Falta decidir si también se descarta lo posterior a abril o se usa como un nivel por rangos; el modelo de ingresos
  no necesita el predictor como entrada (4.9), sirve de comparación y de tope.
  Un modelo que lo use hay que probarlo por versión.

**Unidad.** Es mensual en USD (mediana 1.343). Contra el salario del IESS (131.236 consultas con salario
del último mes, 102.075 personas) la correlación de los logaritmos es 0,31, igual a lo anotado en 9.7.

**Esta población no es la del país.** Son personas que pidieron crédito. Con ingreso real calculado de
CrediScope (146.212 personas):

| Tipo | Personas | Mediana | USD 2.000 o más | USD 5.000 o más |
|---|---|---|---|---|
| Independiente | 65.755 | 2.500 | 62,6% | 22,9% |
| Dependiente | 51.174 | 1.226 | 27,9% | 4,9% |
| Público | 12.383 | 1.486 | 29,6% | 1,5% |
| Todos | 146.212 | 1.737 | 44,7% | 13,3% |

Contra el 1,7% de la ENEMDU y la ENIGHUR para todo el país (12.1 y 12.10). **Para quien pide crédito, el
tramo de más de USD 2.000 no es el 10% de la hipótesis del negocio sino cerca de la mitad**, así que
el tramo que se iba a resolver por la cuota pesa más que el de hasta USD 2.000. La previa pública
del país (12.6 a 12.8) no sirve tal cual para esta población, y el modelo de los tramos necesita
datos de personas que piden crédito.

**Dudas que esto abre.**
- El «ingreso real calculado» de un independiente es la suma de movimientos de cuentas o de ventas
  declaradas: no es un ingreso neto. La ENIGHUR mide una mediana de 263 para los independientes del país y
  aquí es 2.500; la diferencia es de selección (quien pide crédito gana más) y también de qué se mide.
  Sin separar las dos, no se puede entrenar con ese número como si fuera la verdad.
- La cuota reportada sobre el ingreso validado tiene mediana de 0,59 (P75 de 1,13), imposible como relación de
  pago de una persona; viene de sumar todas las operaciones sin separar el rol de titular, codeudor o
  garante y sin comprobar que una operación no esté en dos tablas. Mientras no se limpie, no sirve
  para calibrar el cociente cuota/ingreso (usar el de 12.10 o el que dé el negocio).
- El contrato con Equifax y el uso de sus salidas para entrenar un modelo: sin revisar (ver 4.9).

**Revisión de la extracción (2026-10-20).**
- **Quién está en la base**: 117.259 consultas son automotrices y 466 de consumo; las 271.287 restantes no
  traen tipo (hasta 2024). 88.639 son del cónyuge y 1.547 de codeudor o garante: para entrenar se toman
  solo titulares y se parte por persona (209.166 personas tienen una sola consulta, 69.338 tienen dos o más).
  Pichincha y Guayas concentran la mayoría. Quien pide crédito en un concesionario no representa al país: entre los 57.061 independientes del entrenamiento, 54.906 son automotrices y 68 de consumo (12.27).
- **El ingreso de un independiente parece escrito a mano, no calculado**: el 49,2% es un múltiplo exacto
  de 100 y el 24,0% de 1.000, contra 2,3% y 0,5% en un empleado público (cuyo dato viene del IESS). Los valores
  más repetidos son 2.000, 3.000, 1.500, 2.500 y 1.200. Un cálculo sobre movimientos de cuenta no
  se amontona así. Hay que preguntar cómo lo arma el analista antes de usarlo como objetivo.
- **El aporte al IESS de un independiente casi no informa su ingreso**: de los independientes con aporte
  (28.040 consultas, 22.876 personas), el 39,7% aporta el salario básico (±5%), la mediana del aporte es 554
  contra 3.000 de ingreso calculado, y la correlación de los logaritmos es 0,21. Confirma la regla del
  Ingreso Mínimo SBU, con datos de personas que piden crédito. Solo el 33,0% de los independientes
  tiene historial de IESS (60,4% de los dependientes, 90,7% de los públicos).
- **En dependientes, el ingreso calculado y el salario del IESS difieren**: mediana de la razón
  de 1,11, y solo el 2% coincide al 2%. Son meses distintos (el calculado es el del requerimiento) o hay
  más de un empleador, pero así no se puede decir que sea el mismo dato.

### 12.12 Lo que respondió la sesión de AWS y lo que se verificó aquí (2026-10-20)

Archivos nuevos en `research/ingresos-aws/` (fuera de git): `credito_por_requerimiento.csv` (44.582
requerimientos con respuesta OK FACTURAR, con y sin condicionado), `iess_mismo_mes.csv` (79.153 consultas de
dependientes y públicos) y `muestra_respuestas_equifax.jsonl` (5.001 respuestas crudas de titulares, 1.667 por
régimen: hasta el 13 de enero, del 16 de enero al 12 de abril y desde el 14 de abril). Resumen y conteos de esa
sesión en su `docs/base-aws-originacion.md` (rama `claude/postgres-aws-data-review-66a14e`, PR sin fusionar).

**Informado por esa sesión y no verificado aquí: cómo se arma el ingreso de un independiente.**
- De 121.499 flujos de independientes, el 83,5% es solo «ingreso declarado» (tipo 4, redondeado a 100 en el
  79,7% y a 1.000 en el 37,9%); el 15,1% es solo movimientos bancarios, el 1,1% solo declaración de IVA y el 0,3% mezcla.
  54.437 flujos llevan la observación «INGRESADO POR INTEGRACIÓN CON CONCESIONARIOS»: lo declarado llega del concesionario.
- Un ingreso bancario o de IVA es el promedio mensual de ventas o depósitos (mediana de 3 meses) **multiplicado por una
  rentabilidad fija por macroactividad**: 0,30 en comercio y servicios generales, 0,40 en fabricación, agricultura,
  construcción y transporte, 0,70 en servicios profesionales y 1,00 en arriendos. No hay un campo que diga depósito o neto.
- Unos 6.400 flujos dicen «predictor» o «ajuste predictor»: en independientes el ingreso es el predictor más o menos
  USD 1 en el 41% y el 52% de ellos. Circular: no son verdad.
- **Conclusión**: la verdad más defendible para un independiente es el 16,5% basado en cuentas o IVA (unos 20.000
  flujos), y aun ahí es una estimación de utilidad con un margen fijo por actividad. El resto es lo que declara
  el concesionario o el predictor mismo.

**Verificado aquí: el ingreso de un dependiente trae un descuento del 10%.** El ingreso calculado de un dependiente con
fuente IESS es el 90,0% del «promedio de Novadata» en el 75,5% de 50.472 casos (mediana de la razón 0,900;
solo el 0,3% es igual). No es el salario del último mes ni un promedio de 6 o 12 meses. Para usarlo como
verdad del IESS hay que dividir por 0,9, o pedir el promedio de Novadata directamente (viene en `iess_mismo_mes.csv`).
La sesión de AWS también halló que el mes del requerimiento casi nunca existe en el historial (20 de 52.475): el
IESS llega con uno o dos meses de retraso.

**Verificado aquí: la cuota de la solicitud depende poco del ingreso** (41.917 solicitudes con cuota e ingreso del
titular; la cuota es la del simulador del requerimiento, `simulador.cuota_pagar`, y los canales son concesionarios, crédito directo y patios con convenio):

| Ingreso del titular | Solicitudes | Cuota mediana | Cuota sobre el ingreso (mediana) | Con la cuota como mínimo del ingreso (relación 0,40), el mínimo llega a USD 2.000 o más |
|---|---|---|---|---|
| Menos de 1.000 | 3.236 | 354 | 0,44 | 2,6% |
| 1.000 a 1.999 | 12.011 | 405 | 0,28 | 3,0% |
| 2.000 a 4.999 | 17.078 | 495 | 0,17 | 12,7% |
| 5.000 o más | 9.592 | 660 | 0,08 | 36,6% |

La correlación entre el logaritmo de la cuota y el del ingreso es de 0,46. En dependientes, que son el dato menos
dudoso, la cuota mediana es de 388 con menos de USD 2.000 y de 507 con USD 2.000 o más (razón de 0,31 y 0,15).
**Consecuencia para el diseño de los tres tramos**: con una relación de 0,40, el mínimo que sale de la cuota se queda
cerca del ingreso real (a menos de 20%) en el 85% de los de menos de 1.000, pero solo en el 7% de los de 2.000 a 4.999 y
en el 1% de los de 5.000 o más. **La cuota sirve para descartar ingresos bajos y no para identificar los altos.** La
razón probable: aquí la cuota sale del simulador de la solicitud (precio del bien y plazo) y no de la capacidad de pago de la persona (es una hipótesis, no se comprobó). Lo que serviría es la
cuota máxima que cada institución aprueba, que no está en esta base. Esto cambia la hipótesis de 8.1, que contaba
con la cuota para resolver el tramo de más de USD 2.000.

**Decisión del negocio sobre la cuota (2026-10-21).** Varias instituciones tienen un límite de cuota sobre el ingreso, pero
no siempre se cumple (se pasan por excepción), así que **no se usa** la relación cuota/ingreso por institución. La
cuota queda como una pista para acotar ingresos bajos, sin una relación fija.

**Pendiente.** Pasar las 5.001 respuestas crudas por `derivarTablas` para separar rol y duplicados en la cuota de
Equifax; decidir qué se hace con el predictor posterior al 13 de abril (ver 12.11).

### 12.13 Piloto con dependientes de AWS (2026-10-21)

**Decisiones del negocio que lo definen (2026-10-21).**
- **Qué estima**: el salario bruto del IESS (promedio de Novadata, que es verdad verificada para un dependiente); el
  descuento se aplica al final. El sistema hoy resta un 10% fijo (el 75,5% de los casos da exactamente 0,900), no el 9,38%
  de ley, y en una minoría de personas no hay descuento porque el empleador lo asume.
- **Tres versiones por datos de entrada**: 1) Novadata; 2) Novadata más buró (Equifax o Aval); 3) Novadata más datos internos
  más buró (pendiente; el mismo día el negocio decidió que el patrimonio solo se solicitaría a petición de un analista, 12.24; **el 2026-10-22 decidió que no se pide y la 3 se retiró, 12.25**).
  Entrenar con salidas de Equifax no necesita contrato: son datos ya obtenidos y pagados (decisión del negocio,
  que reemplaza la duda de 4.9 para este uso).
- **Cómo se entrega**: tramo con probabilidad y valor central con rango; los tramos son sobre el ingreso neto (menos de 470,
  470 a 939, 940 a 1.999, 2.000 o más).
- **Con qué datos**: AWS como piloto, reentrenar con los 3,9 millones cuando lleguen.

**Cómo se hizo** (`scripts/modelo_dep_1.py`). 31.223 titulares dependientes con salario de Novadata (una consulta por persona, la más
reciente; mediana bruta de 1.200). Modelo de cuantiles (13 niveles) y probabilidad de cada tramo. Entradas de la versión 1: edad,
género, estado civil, provincia y cantón de trabajo y de domicilio, meses con aporte, número de empleos y de empleadores, fecha. La versión 2
suma 12 variables del buró (crédito mayor aprobado, deuda total y de hace 3 meses, instituciones con deuda, créditos, saldos,
mora máxima y operaciones). Un crédito posterior a la consulta no se usa. No entra el predictor de Equifax. Validación cruzada por persona (5 grupos)
y otra por fecha (se entrena con lo anterior a 2026 y se prueba con lo posterior).

| Medida | Versión 1 (Novadata) | Versión 2 (Novadata más buró) | Referencia |
|---|---|---|---|
| R² del logaritmo | 0,22 | 0,40 | — |
| Error absoluto mediano | 37% | 31% | — |
| Acierta el tramo exacto | 45,5% | 52,7% | 36,7% si se dice siempre el más frecuente |
| Acierta el tramo o uno vecino | 91,6% | 94,6% | — |
| El valor real cae en el rango de 10% a 90% | 78,2% | 77,7% | debería ser 80% |
| Prueba por fecha (entrena antes de 2026): R² y tramo exacto | 0,11 y 43,4% | 0,32 y 50,7% | — |

El predictor de Equifax hasta el 13 de enero (continuo, sin corrección) acierta el tramo en el 47,6% de 18.680 consultas y su
correlación de logaritmos con el salario de Novadata es 0,55 (con el salario del último mes era 0,31).

**Lectura.**
- El buró es lo que más aporta: pasa de 0,22 a 0,40 en R² y de 45,5% a 52,7% en el tramo. Importancia en la versión 2: crédito mayor
  aprobado 32%, deuda de hace 3 meses 15%, edad 12%, valor de los créditos 6%.
- Con datos de Novadata solos el modelo ordena (acierta el tramo o uno vecino 9 de cada 10 veces) pero no distingue bien dentro del
  rango de 470 a 2.000. Tampoco es mucho mejor que decir siempre el tramo más frecuente (45,5% contra 36,7%).
- **El tramo de 2.000 o más se confunde con el de 940 a 1.999**: de 6.278 personas con 2.000 o más netos, 3.021 se reconocen y 2.848 se clasifican
  en 940 a 1.999. Los de menos de 470 casi no se reconocen (128 de 3.227) porque son pocos y se parecen a los de 470 a 939.
- **Cae con el tiempo**: probar con lo posterior a 2026 baja el R² (0,22 a 0,11 y 0,40 a 0,32). Hay deriva (sueldos, tipo de persona que pide crédito) y el modelo
  tiene que reentrenarse y vigilarse.
- **Quien no tiene crédito no tiene estas variables**: la población de AWS son personas con buró (86% con crédito mayor aprobado). La versión 2 no se
  puede evaluar en quien nunca pidió crédito, que es justo a quien más habría que estimar.
- **Todavía no se probó en independientes**, que es la pregunta de fondo. Falta saber cuáles de sus ingresos vienen de cuentas o IVA y cuáles son declarados.

**Lo que falta para mejorarlo.** Datos del empleador (identificador, sector, tamaño; hoy la extracción solo tiene cuántos empleadores), que son la
señal más fuerte para un dependiente; la marca de qué independientes tienen ingreso de cuentas o IVA; y una prueba con la población general
(los 3,9 millones).

### 12.14 Los segmentos sin ingreso del IESS (2026-10-21)

**Lo que dijo el negocio el 2026-10-21.**
- Meta: **85% a 90% de asertividad**. Falta definir qué cuenta como acierto.
- Los dependientes que no son su propio patrono ni afiliados voluntarios no se afinan: su ingreso del IESS ya está validado.
- Lo difícil: el ingreso adicional de dependientes con otra actividad; independientes; jubilados y pensionistas (arriendos,
  rendimientos financieros, remesas u otras actividades); personas sin actividad económica formal.
- Datos: Novadata; la cuota financiera de Equifax (total de la cuota mensual que paga la persona) como pista principal, sobre todo en
  independientes; el predictor de Equifax solo como contraste; el ingreso calculado a mano que sale de AWS como la verdad más válida.
- Los tramos altos (más de 2.000) se afinan aunque sean pocos.

**Quiénes son en AWS** (116.673 titulares con ingreso calculado, una consulta por persona, la más reciente; `scripts/nodep_1_descripcion.py`).

| Segmento | Personas | Mediana | 2.000 o más | Menos de 470 | Múltiplo exacto de 100 | Con otra actividad |
|---|---|---|---|---|---|---|
| Independiente | 57.484 | 2.500 | 63,0% | 1,3% | 50,0% | 30,3% |
| Dependiente (IESS) | 42.020 | 1.295 | 28,0% | 6,6% | 9,5% | 24,7% |
| Sin clasificar | 11.212 | 1.847 | 47,4% | 4,6% | 31,4% | 21,3% |
| Jubilado o pensionista | 3.032 | 1.641 | 39,0% | 2,0% | 57,9% | 24,0% |
| Dependiente (otra fuente) | 2.499 | 1.883 | 46,9% | 3,4% | 37,9% | 53,2% |
| Sin actividad formal | 426 | 1.256 | 30,8% | 17,4% | 35,2% | 21,1% |

(La tabla separa primero a los jubilados; el modelo de independientes usa a todos los de relación «independiente», 58.451, por eso la diferencia de cifras.)

**La respuesta comercial cambia lo que significa el número** (independientes). Múltiplo exacto de 100: OK FACTURAR 16,9%, OK FACTURAR
CONDICIONADO 42,7%, APROBADO 66,2%, APROBADO CONDICIONADO 66,6%, RECHAZADO 32,2%, sin respuesta 65,3%. Medianas: 3.890, 3.500, 3.000, 3.400, 1.564 y 2.200.
Lo confiable de OK FACTURAR parece ser un cálculo y el resto números escritos, y los rechazados ganan menos: **un modelo entrenado solo con lo
aprobado no ve a quien se rechaza** (sesgo de selección).

**La cuota financiera de Equifax** (5.001 respuestas crudas; `scripts/eqx_*.py`).
- `indicador_impacto_economico[].cuota_financiera` es igual a `cuota_estimada_mensual.pago` en las 5.001 y a la suma de las cuotas por operación
  (`detalle_deuda_actual_*`) en el 95,5%: la columna `cuota_mensual_total_reportada` de la extracción de AWS es esa cifra.
- Trae un histórico de tres puntos (actual, hace 6 meses y hace 12 meses) y un `indicador_impacto_economico[].ingreso` con su escenario: otro
  estimador de Equifax, distinto del `IncomePredictor` (coincide en el 15,5% de las respuestas).
- Casi toda es del titular (25.697 de 26.755 operaciones); quitar codeudor y garante casi no cambia la relación con el ingreso (correlación de
  logaritmos de 0,45 a 0,46 en independientes y de 0,46 a 0,48 en dependientes).
- **Como cifra absoluta no es una cuota real**: sobre el ingreso verificado de dependientes del IESS tiene mediana de 0,60 y pasa de 1 en más
  del 25%. Incluye una cuota estimada de las tarjetas (36% de la cuota total en la mediana).
- Informa igual en independientes que en dependientes (correlación de 0,45 a 0,47). **Separada por tipo de crédito informa más**: R² del logaritmo
  del ingreso de 0,21 (independientes) y 0,26 (dependientes) contra 0,16 y 0,17 con la cuota total; vivienda (0,47) y microcrédito (0,46) son las
  más informativas en independientes, consumo (0,37) y tarjeta (0,36) las menos.

**Independientes: qué tan cerca se llega** (58.451 personas; tramos de ingreso: menos de 470, 470 a 939, 940 a 1.999, 2.000 a 3.999 y 4.000 o más;
validación cruzada por persona; `scripts/nodep_2_modelo.py`). El «acierto» se mide de varias formas porque no está definido.

| Entradas | Tramo exacto | Tramo o vecino | Dentro de ±25% | Dentro de ±50% |
|---|---|---|---|---|
| Siempre el tramo más frecuente | 33,4% | — | — | — |
| A. Novadata | 41,5% | 85,0% | 28,8% | 54,8% |
| B. Novadata más buró | 52,0% | 91,9% | 36,2% | 65,5% |
| C. B más la cuota de Equifax | 53,5% | 92,3% | 37,9% | 67,0% |
| C solo con las solicitudes OK FACTURAR (9.883) | 64,1% | 95,6% | 43,2% | 74,2% |
| Prueba por fecha de C (entrena antes de 2026) | 47,8% | 90,9% | 34,4% | 65,9% |
| Contraste: predictor de Equifax (hasta el 13 de enero), tal cual | 45,9% | 83,8% | 33,9% | 59,4% |
| Contraste: predictor de Equifax calibrado | 48,9% | 93,6% | 32,8% | 60,9% |
| C sobre las mismas consultas del contraste | 54,0% | 92,4% | 37,8% | 67,3% |

- **La cuota es la variable más pesada del modelo (57% de la ganancia) pero suma poco** (de 52,0% a 53,5%): las demás variables del buró (saldos,
  deuda actual, operaciones) ya traen casi lo mismo. Lo que sí mejora es separarla por tipo de crédito (ver arriba), que esta corrida todavía no usa.
- El modelo supera al predictor de Equifax por unos 5 puntos en tramo exacto; en tramo o vecino están parejos.
- **Casi nunca predice los tramos bajos** (16 aciertos en 3.650 personas de 470 a 939): la población de AWS es de personas que piden crédito y
  casi no hay ingresos bajos (7,5% menos de 940). No sirve para reconocer al independiente típico del país (el 73% gana menos de 470 según la ENIGHUR).
- **Si solo responde cuando está seguro**: con una probabilidad de al menos 0,6 responde el 21,4% y acierta el tramo en 77,5%; con 0,7, el 13,1%
  y 85,9%; con 0,8, el 9,2% y 90,6%. Con solo OK FACTURAR: con 0,6 responde el 36,0% y acierta 87,2%; con 0,7, el 26,8% y 92,8%.

**El techo de la etiqueta** (la misma persona calculada dos veces; `scripts/nodep_4_estabilidad.py`). Entre dos solicitudes de un independiente con una mediana
de 10 días de diferencia el ingreso queda igual en el 47,0% de los casos, dentro de ±10% en 65,9% y dentro de ±25% en 77,0%; cae en el mismo tramo
el 87,9% de las veces (tramo o vecino 98,9%). En dependientes 90,3% y en públicos 94,2%. Con más de 180 días solo el 31,3% queda dentro de ±25%.
**Ningún modelo puede acertar contra esta etiqueta mucho más de lo que ella se repite a sí misma**: unos 88% en tramo exacto y 77% dentro de ±25%.
Con el 53,5% actual hay mucho margen que no es ruido: falta información.

**Cómo se llega hoy al 85% o 90%** (independientes, validación cruzada; `scripts/nodep_7_conjuntos2.py` y `nodep_8_umbrales.py`). Con los datos actuales el tramo exacto no
llega a esa meta para todos (53,5%). Hay tres formas de entregar un resultado que sí la alcance, cada una con su costo:

1. **Un rango de tramos vecinos de ancho variable.** El modelo entrega el rango más angosto cuya probabilidad suma un nivel; se calibra el nivel para que el tramo real
   caiga dentro del rango el 85% o el 90% de las veces (tramos: menos de 470, 470 a 939, 940 a 1.999, 2.000 a 3.999, 4.000 o más).

| Entradas | Cobertura buscada | Se pide al modelo | Cobertura real | Tramos promedio del rango | Un tramo | Dos tramos | Tres o más |
|---|---|---|---|---|---|---|---|
| A. Novadata | 85% | 0,75 | 88,6% | 2,69 | 1,8% | 27,7% | 70,5% |
| B. Novadata más buró | 85% | 0,75 | 85,2% | 2,14 | 9,5% | 67,4% | 23,1% |
| C. B más la cuota de Equifax | 85% | 0,75 | 85,0% | 2,09 | 11,0% | 68,8% | 20,2% |
| C. B más la cuota de Equifax | 90% | 0,85 | 92,6% | 2,61 | 7,0% | 26,3% | 66,7% |
| C, solo OK FACTURAR | 85% | 0,65 | 86,6% | 1,71 | 30,2% | 69,2% | 0,7% |
| C, solo OK FACTURAR | 90% | 0,75 | 90,4% | 1,89 | 23,5% | 63,7% | 12,8% |

   Es decir: con lo que hay, el rango típico abarca dos tramos (por ejemplo «de 940 a 3.999»), y tres o más cuando el modelo duda.

2. **Certificar un mínimo («gana al menos X»).** Es el dato que decide una cuota. Con el modelo C, la precisión es la proporción de los certificados que de verdad ganan eso:

| Mínimo | Precisión buscada | Umbral de probabilidad | Se certifica del total | Precisión real | Se capta de los que de verdad ganan eso |
|---|---|---|---|---|---|
| 940 | 90% | (la base ya es 92,5%) | 75,0% con 0,90 | 96,6% | 78,3% |
| 2.000 | 85% | 0,62 | 47,4% | 85,5% | 64,4% |
| 2.000 | 90% | 0,73 | 36,3% | 90,2% | 52,0% |
| 4.000 | 85% | 0,66 | 14,2% | 85,1% | 41,0% |
| 4.000 | 90% | 0,79 | 9,5% | 90,1% | 29,1% |

   En esta población el 62,9% gana 2.000 o más y el 29,5% gana 4.000 o más. **No se puede certificar el sentido contrario** (que alguien gana menos de 470 o menos de 940 o menos de 2.000):
   con una seguridad de 0,8 el modelo no certifica a nadie para menos de 470 ni de 940 y al 1% para menos de 2.000, porque en AWS casi no hay ingresos bajos.
3. **Responder solo cuando está seguro** (arriba): tramo exacto con 85% a 90% de acierto, pero solo para el 13% a 27% de las personas.

**Dependientes con ingreso adicional** (42.020 dependientes del IESS con ingreso calculado; `scripts/nodep_3_otros.py`).
- Tomar solo el ingreso principal (el del IESS) acierta el tramo del total en el 85,7% (tramo o vecino 99,5%). El adicional cambia el tramo en el 58% de
  quienes lo tienen (24,7% de los dependientes; mediana de 500, el 35% del total).
- **Saber quién lo tiene y cuánto es casi imposible con estos datos**: AUC de 0,72 para saber si tiene otra actividad y R² de 0,11 para el monto
  (error mediano de 47%). Sumarlo al total solo sube el acierto de 85,7% a 86,1%.
- **En AWS el adicional es mucho más común que en el país**: ENIGHUR, ocupación secundaria entre quienes trabajan: 4,5% de los dependientes y 6,3% de los
  independientes, contra 24,7% y 30,3% en AWS. Lo más probable es que sea lo que declara quien pide un crédito, no lo que hay.

**Ingresos adicionales en el país, de la ENIGHUR** (personas de 15 años o más, ponderado; montos mensuales equivalentes; `scripts/enighur_3_adicionales.py`).

| Tipo de persona | Población (miles) | Pensión de seguridad social | Arriendos | Remesas del exterior | Ayuda de personas del país | Rendimientos financieros | Otra ocupación | Alguno de estos |
|---|---|---|---|---|---|---|---|---|
| Dependiente | 4.949 | 0,8% (307) | 1,3% (150) | 1,4% (63) | 7,2% (80) | 2,9% (1) | 1,1% (64) | 6,9% |
| Independiente | 2.122 | 3,9% (370) | 2,9% (200) | 2,7% (83) | 14,1% (79) | 2,6% (1) | 1,7% (83) | 12,5% |
| Sin ingreso laboral ni pensión | 5.814 | — | 1,1% (200) | 1,8% (104) | 10,6% (80) | 0,9% (0) | 8,0% (88) | 11,1% |
| Sin ingreso laboral, con pensión | 801 | 100% (450) | 8,0% (233) | 2,7% (100) | 11,2% (83) | 4,5% (7) | 2,7% (78) | 100% |

(Entre paréntesis, la mediana en dólares entre quienes lo reciben.) **Los ingresos adicionales son poco frecuentes y pequeños**: la mediana de un arriendo
es 200 y la de una remesa 100; en un independiente que tiene alguno, el adicional equivale en mediana al 53% de su ingreso laboral y en un dependiente al 12%.
Sin datos de propiedades o del exterior no hay forma de saber quién los tiene.

**Jubilados y pensionistas** (3.032 en AWS; `scripts/nodep_3_otros.py`). R² de 0,21; tramo exacto 54,9% contra 47,7% si siempre se dice el más frecuente; tramo o vecino
96,0%; dentro de ±25% 47,7%. En el país la prestación de seguridad social tiene mediana de 430, el 53% está por debajo de 470 y solo el 2,4% llega a 2.000 (ENIGHUR);
en AWS la mediana es 1.641 y el 39% llega a 2.000: **los jubilados de AWS no representan a los del país**, y el 57,9% de sus montos son múltiplos exactos de 100
(escritos a mano).

**Criterio de acierto elegido por el negocio (2026-10-21): error del monto de ±10%, en el 85% al 90% de los casos.** Medido (`scripts/nodep_9_error10.py`, `nodep_10_dep10.py`):

| Caso | Dentro de ±10% del monto |
|---|---|
| Independientes, modelo C, todas las respuestas | 15,8% (±25%: 37,9%) |
| Independientes, modelo C, solo OK FACTURAR | 18,6% (±25%: 43,2%) |
| El 2% de independientes donde el modelo está más seguro | 23,8% |
| La misma persona calculada dos veces (menos de 60 días), independiente | 65,9% |
| La misma persona calculada dos veces, las dos OK FACTURAR | 59,6% |
| Dependientes del IESS, total estimado solo con el ingreso del IESS | 77,3% (el 8,0% entre quienes declaran otra actividad) |

**No es alcanzable para un ingreso estimado de un independiente con los datos que existen**: el modelo queda en 16% a 19% y, aunque fuera perfecto, la etiqueta misma solo se repite dentro de ±10% el 60% al 66%
de las veces. El 85% al 90% sí se puede cumplir donde el ingreso es verificable (dependientes del IESS, y jubilados si Novadata trae el monto de la pensión) o con otra definición del acierto (mínimo certificado o rango, más arriba).
Otras decisiones del mismo día: entrenar con todas las respuestas y medir el acierto solo con OK FACTURAR; partir el tramo alto en 2.000 a 2.999, 3.000 a 4.999 y 5.000 o más; no consultar Novadata para una muestra de AWS
hasta saber qué datos guarda AWS.

**Decisión del negocio sobre el criterio (2026-10-21): ±10% solo donde el ingreso es verificable; para los estimados, un mínimo certificado y un rango.** El monto exacto de un estimado se
confirma con documentos. Medido para independientes con los tramos nuevos (menos de 470, 470 a 939, 940 a 1.999, 2.000 a 2.999, 3.000 a 4.999 y 5.000 o más), modelo C entrenado con todas las
respuestas y medido con todas y con OK FACTURAR (`scripts/nodep_11_minimo.py` y `nodep_12_rango_usd.py`):

- **Mínimo certificado**: el monto que el ingreso real supera con una seguridad dada (cuantil bajo del modelo).

| Seguridad | El real lo supera (todas / OK FACTURAR) | Mínimo sobre el ingreso real (mediana, todas) | Mediana del mínimo (todas / OK FACTURAR) |
|---|---|---|---|
| 95% | 94,3% / 97,9% | 0,43 | 1.000 / 1.282 |
| 90% | 89,3% / 95,0% | 0,53 | 1.196 / 1.591 |
| 85% | 84,3% / 91,3% | 0,60 | 1.346 / 1.838 |

  Cumple la seguridad pedida, pero **es conservador**: el mínimo del 90% es en mediana la mitad del ingreso calculado y solo en el 30% de las personas llega al 70% del real.
- **«Gana al menos X» con el mínimo del 90%** (a cuántos se certifica, qué precisión tiene y cuántos de los que de verdad ganan eso se captan): al menos 940, 74,9% de todos con 96,6% de precisión
  y 78,3% captados; al menos 2.000, 19,8% con 95,9% y 30,2%; al menos 3.000, 9,7% con 94,8% y 21,7%; al menos 5.000, 2,7% con 94,1% y 11,7%. Solo con OK FACTURAR: 2.000, 37,9% con 99,1% y 46,2%;
  3.000, 21,5% con 98,2% y 33,8%; 5.000, 6,6% con 97,5% y 16,8%. Con la seguridad del 85% se certifica a más: 2.000, 24,9% de todos y 45,0% de OK FACTURAR.
- **Tramo exacto con 6 tramos**: 46,4% (todas) y 54,2% (OK FACTURAR), contra 29,5% y 38,0% si siempre se dice el más frecuente; tramo o vecino 81,0% y 85,9%.
- **Rango en dólares**: entre el cuantil 5 y el 95 cubre al real el 88,6% (90,2% en OK FACTURAR), pero es muy ancho: el techo es en mediana 6,4 veces el mínimo (de 1.000 a 6.179). Entre el 10 y el 90, 78,6% y de 1.196 a 4.723.
  **Un rango de dos lados con esa cobertura no sirve para decidir**: lo útil para una cuota es el mínimo.

**Qué falta para ganar resolución** (pedido a la sesión de AWS el 2026-10-21).
- Definiciones de la extracción: catálogos de respuesta comercial (OK FACTURAR, condicionado, SD, aprobado, rechazado, pendiente), de perfil final y de actividad; el orden
  de los eventos (si el ingreso se calcula antes o después de consultar a Equifax y si se edita después), el historial de ediciones, el motivo de rechazo y de condición, y
  el significado de «forma parte del análisis».
- La composición del ingreso de cada independiente (declarado, cuentas, IVA), con las actividades secundarias y la observación categorizada.
- La cuota financiera de Equifax por tipo de crédito y por rol, con su histórico de 6 y 12 meses, y el otro estimador de Equifax con su escenario.
- Si la base de AWS guarda otros datos de Novadata o del SRI (RUC y actividad, impuesto a la renta, establecimientos, vehículos, inmuebles, nómina, pensión con monto).
- Cómo se arma el monto de jubilados y pensionistas.
- Para la parte baja de ingresos, que AWS casi no tiene, hacen falta los 3,9 millones del proveedor y los datos públicos (ENEMDU, ENIGHUR).

### 12.15 Segunda ronda de AWS: definiciones y lo que implican (2026-10-21)

Respuesta de la sesión de AWS (detalle en su `docs/base-aws-originacion.md`, puntos 12 a 19) y lo que se verificó aquí con los archivos nuevos de `research/ingresos-aws/`
(`ingresos_por_actividad.csv`, `equifax_cuota_por_consulta.csv`, `equifax_deuda_por_tipo.csv`, `datos_por_persona_requerimiento.csv`).

**Límite previo.** El flujo de efectivo solo tiene fecha de creación y auditoría desde el 2026-03-08 (62.528 de 329.791 flujos); el ingreso de independientes no tiene fechas ni
auditoría; la tabla de macroactividad no dice quién fijó la rentabilidad ni si cambió. Todo lo de tiempos y ediciones vale solo para requerimientos desde esa fecha.

**Catálogos.**
- Respuesta comercial: 2 APROBADO, 3 APROBADO CONDICIONADO, 4 OK FACTURAR, 5 OK FACTURAR CONDICIONADO, 6 OK FACTURAR SD, 7 SD CONDICIONADO, 8 PENDIENTE y 9 RECHAZADO (activas todas menos 6 y 7).
  **Se supuso que la familia APROBADO era el flujo de consumo y la familia OK FACTURAR el automotriz; es falso**: el cruce con `tipo_producto` (2026-10-26, 12.27) muestra que todas las familias son automotrices, así que la diferencia entre respuestas no es de producto.
- Perfil final (AAA PLUS, AAA, AA PLUS, AA, A, B, C, E) con ingreso mínimo de 1.200 (AA y AAA), 1.500 (A y B) y 1.700 (C y E).
- Tipos de ingreso de un independiente: IVA, banco principal, banco secundaria, ingreso declarado e IVA semestral. Tipos de actividad: principal y secundaria. Documentos: básicos, de ingresos y de patrimonio.

**El orden de los eventos (requerimientos desde el 2026-03-08).** La consulta a Equifax ocurre al crear el requerimiento (mediana de 0 días). El flujo de ingreso se crea después de esa consulta en el 98% al 100% de los casos
(mediana de 0 a 50 minutos; el 10% más lento, de 1 a 6 días) y se edita después en el 99%. **El ingreso se calcula después de ver el predictor de Equifax y se edita después**: la comparación del predictor
contra el ingreso calculado favorece al predictor, y cualquier dato que el analista veía (predictor, cuota, capacidad) puede ser un ancla de la etiqueta.

**Ediciones.** El 64% al 78% de los flujos tiene más de una versión. El monto cambia entre la primera y la última versión en el 24,8% de OK FACTURAR, 32,1% de OK FACTURAR CONDICIONADO, 27,8% de APROBADO y de APROBADO
CONDICIONADO y 33,7% de RECHAZADO; la razón última sobre primera es en mediana 1,00, 1,00, 0,93, 1,20 y 0,47: **en los rechazados el ingreso se baja**, es decir, su valor final es consecuencia de la decisión. El 4,5% de los OK FACTURAR
y el 3,3% de los condicionados terminaron con observación de predictor.

**Independientes por respuesta** (porcentaje de flujos activos; medianas por flujo, por eso no coinciden con las de personas):

| Respuesta | Solo declarado | Solo bancario | Múltiplo de 100 | Con detalle mensual | Con archivo de ingresos | Marcado predictor |
|---|---|---|---|---|---|---|
| OK FACTURAR | 49,3% | 46,3% | 24,6% | 50,8% | 52,7% | 15,9% |
| OK FACTURAR CONDICIONADO | 69,4% | 28,4% | 56,6% | 30,7% | 35,9% | 9,1% |
| APROBADO | 91,7% | 7,5% | 85,9% | 8,6% | 19,0% | 1,2% |
| APROBADO CONDICIONADO | 91,8% | 7,6% | 85,9% | 8,4% | 33,6% | 1,9% |
| RECHAZADO | 68,4% | 29,4% | 42,3% | 31,8% | 38,6% | 1,4% |
| Sin respuesta | 98,1% | 1,7% | 89,9% | 1,9% | 1,9% | 0,2% |

Las dos variantes SD tienen 113 independientes cada una: no sirven. La mediana de meses con movimientos es 3 en todas. Documento de ingresos adjunto: 78% en OK FACTURAR, 72% en condicionados, 50% en APROBADO.

**Motivos.** De 42.860 rechazos, el 7,5% no tiene motivo; sin capacidad de pago 31.450, fuera de política 23.606, sin estabilidad 7.327, irregular récord de pagos 4.923, zona 4.060 y no se justifican ingresos 1.620; el 75,1% tiene algún
motivo de ingreso, capacidad o informal. **Los condicionados no guardan motivo y sus condiciones incumplidas nunca son de ingreso** (tasa, entrada, garantía, monto, seguro): por ingreso solo hay rechazo, no condición.
El indicador de que una persona forma parte del análisis es verdadero en todos los titulares y en el 97,7% de los cónyuges; no se pudo confirmar si el ingreso del cónyuge se suma al del titular en alguna decisión.

**La cuota de Equifax.** En las 100.536 consultas con respuesta en JSON, `cuota_estimada_mensual.pago` es igual a `cuota_financiera` y al punto «actual» del historial. **El historial tiene cinco puntos** (hace 12 meses, hace 6, actual, +6 y +12; los dos últimos
parecen proyecciones por su etiqueta, no está documentado) **y solo existe en JSON**; en las 288.969 respuestas en XML no hay historial y la cuota financiera es numérica en el 83,2% (32.994 dicen «No tiene deuda» y 15.644 «-»). En el detalle de deuda por
tipo, las filas «OTRO sin dato» son totales por sistema y duplican si se suman.

**Otros datos que guarda AWS.** No guarda la respuesta cruda de Novadata (275 filas), ni datos del SRI (RUC, establecimientos, impuesto a la renta), ni inmuebles, nómina, jubilación o pensión como tablas. Sí guarda por persona del requerimiento el patrimonio declarado
(vivienda en el 26%, vehículo en el 15%, muebles en el 78%; pasivos del buró en el 98%), los egresos (gasto familiar 79%, gasto financiero 99,9%, arriendo 10%), el ingreso declarado y recuperado de Novadata, y la conducta interna con Novacredit.
**El monto de un jubilado es declarado, no recuperado de Novadata** (solo el 2,3% de 7.269 flujos); su mediana es 1.250 y más de la mitad son múltiplos de 100.

**Verificado aquí** (`scripts/r2_*.py`).
- El ingreso es la suma de los montos por tipo en el 99,9% de los 138.655 flujos con algún monto, y para banco e IVA el ingreso sobre las ventas es la rentabilidad de la macroactividad en el 81,9% de 24.707 flujos
  (0,30 comercio y servicios generales; 0,40 fabricación, agricultura, construcción y transporte; 0,70 servicios profesionales; 1,00 arriendos).
- **Corrección a la otra sesión**: las observaciones «RECUPERADO NOVADATA MENOS IESS» y parecidas no son ingresos adicionales de dependientes: 1.178 de 1.496 son flujos de actividad principal (y 318 de secundaria). Son el salario recuperado de Novadata al que el
  analista le restó el aporte al IESS, es decir un salario neto. No se pueden contrastar con el IESS de la consulta: ninguna de esas personas trae promedio de Novadata ni salario del último mes.
- **Origen del ingreso de los 57.487 independientes**: solo declarado 82,3%, solo cuentas o IVA 13,8%, mixto 3,9%; con marca de predictor 1,6%; con marca de integración de concesionario 42,2%. **El subconjunto «cuentas o IVA sin predictor» tiene 7.903 personas**
  (3.191 OK FACTURAR o condicionado y 3.498 RECHAZADO); su mediana es 2.441 contra 2.500 del declarado.
- El ingreso declarado de la actividad principal de independientes (65.222 flujos entre 500 y 4.000) se amontona en 1.000, 1.200, 1.500, 2.000, 2.500 y 3.000 (de 4.157 a 7.573 flujos, contra 600 a 1.000 en los valores vecinos), pero no en 1.700 (647): es redondeo
  de números escritos, sin evidencia clara de que se ajusten a los mínimos por perfil.
- Entre los datos internos, `persona_ingreso_declarado` es la propia etiqueta (su razón con el ingreso es exactamente 1,000 en el 45% de los casos) y se excluye; los demás (patrimonio, egresos, mora interna) no se calculan a partir del ingreso.
- Antigüedad de la actividad de los independientes (años desde la fecha de inicio): mediana de 4,9; correlación de logaritmos con el ingreso de 0,26.

### 12.16 Independientes con los datos de la segunda ronda (2026-10-21)

Independientes de AWS (57.340 personas, una solicitud por persona), validación cruzada por persona, entrenado con todas las respuestas (`scripts/r2_4_preparar.py` y `r2_5_modelo.py`).
Tramos: menos de 470, 470 a 939, 940 a 1.999, 2.000 a 2.999, 3.000 a 4.999 y 5.000 o más. «Mínimo 90%» es el monto que el ingreso real debería superar el 90% de las veces; «certifica 2.000» es a cuántos
se les puede asegurar que ganan al menos 2.000 con ese mínimo.

| Entradas | Medido con | R² | Tramo exacto | ±10% | ±25% | El real supera el mínimo 90% | Mínimo sobre real (mediana) | Certifica 2.000 (% del total, precisión, capta) |
|---|---|---|---|---|---|---|---|---|
| M0 Novadata, buró y cuota total (lo anterior) | todas | 0,343 | 46,4% | 15,5% | 37,7% | 89,2% | 0,53 | 19,6%, 95,9%, 29,9% |
| M1 más cuota por tipo e historial | todas | 0,352 | 46,9% | 15,7% | 38,0% | 89,2% | 0,54 | 21,0%, 96,1%, 32,1% |
| M2 más actividad y antigüedad | todas | 0,364 | 47,4% | 15,8% | 38,6% | 89,1% | 0,55 | 21,7%, 96,1%, 33,1% |
| M3 más datos internos | todas | 0,382 | 48,2% | 16,6% | 40,1% | 88,9% | 0,56 | 22,6%, 96,4%, 34,6% |
| M0 | OK FACTURAR (9.692) | 0,447 | 54,0% | 17,7% | 43,0% | 95,2% | 0,47 | 37,6%, 99,1%, 45,9% |
| M3 | OK FACTURAR | 0,481 | 56,3% | 19,3% | 45,1% | 93,7% | 0,53 | 45,0%, 99,0%, 54,9% |
| M0 | solo cuentas o IVA sin predictor (7.842) | 0,323 | 38,9% | 11,0% | 26,8% | 76,5% | 0,55 | 22,3%, 90,9%, 35,6% |
| M3 | solo cuentas o IVA sin predictor | 0,379 | 39,9% | 11,6% | 28,2% | 76,8% | 0,58 | 26,5%, 92,0%, 42,8% |

- **Los datos nuevos suben poco el acierto**: de 46,4% a 48,2% en tramo exacto y de 15,5% a 16,6% dentro de ±10%. Lo que más se nota es el mínimo certificado para 2.000 o más: de 19,6% a 22,6% de todos, y de 37,6% a 45,0% en OK FACTURAR.
  La cuota por tipo y su historial aportan lo menos (R² de 0,343 a 0,352); la antigüedad y la actividad, y los datos internos, un poco más. La cuota de Equifax ya estaba en las demás variables del buró.
- **`egreso_gasto_financiero` no es un dato interno independiente**: es igual a la cuota de Equifax del propio titular (sin codeudor ni garante) en el 94,5% de los casos y su correlación con la cuota es 0,95. Es la variable más pesada de M3 (34% de la ganancia)
  junto con la cuota de Equifax (16,9%); entre las dos son la señal de la cuota. Sigue: actividad CIIU (7,5%), entrada del crédito declarada (5,2%) y crédito mayor aprobado (4,0%).
- **El ingreso calculado depende del resultado de la solicitud.** Real sobre lo previsto por el modelo (mediana): RECHAZADO 0,75, sin respuesta 1,02, OK FACTURAR CONDICIONADO 1,03, OK FACTURAR 1,06, PENDIENTE 1,13, APROBADO 1,18 y APROBADO CONDICIONADO 1,22.
  Por eso el mínimo del 90% cubre al 76,4% de los rechazados, al 93,5% de los OK FACTURAR y al 97,6% de los aprobados (que no son de consumo: son automotrices, 12.27). Se puede leer de dos modos que aquí no se pueden separar: se rechaza a quien gana poco, o al rechazar se baja el ingreso (la sesión de AWS midió que en los
  rechazos se baja, con razón última sobre primera de 0,47). Con el mismo origen del ingreso las diferencias persisten: en OK FACTURAR, «solo cuentas o IVA» 1,28 y «solo declarado» 0,95.
- **Con qué respuestas entrenar** (siempre medido sobre OK FACTURAR y condicionado, 9.692 personas, con M3):

| Entrenado con | R² | Tramo exacto | El real supera el mínimo 90% en OK FACTURAR | Mínimo sobre real | Certifica 2.000 en OK FACTURAR | Cobertura en RECHAZADO |
|---|---|---|---|---|---|---|
| Todas las respuestas | 0,481 | 56,3% | 93,7% | 0,53 | 45,0% (99,0%) | 76,4% |
| Todas menos RECHAZADO | 0,514 | 57,1% | 87,6% | 0,64 | 56,1% (97,7%) | 47,7% |
| Solo OK FACTURAR y condicionado | 0,521 | 58,1% | 87,2% | 0,65 | 55,4% (98,1%) | 45,5% |
| Solo cuentas o IVA sin predictor | 0,407 | 49,7% | 96,9% | 0,38 | 33,8% (99,3%) | 89,3% |

  Quitar a los rechazados de la muestra hace más apretado el mínimo para los aprobados, pero **el mínimo deja de ser seguro para quien se rechaza** (cobertura de 76% a 46%). Como el modelo se aplicará antes de decidir, a todos los solicitantes, se entrena con todas las respuestas
  y se mide con OK FACTURAR (decisión del negocio del 2026-10-21): da una cobertura del 89% en conjunto, aunque la de cada respuesta es distinta.
- **El predictor de Equifax como contraste** (independientes, hasta el 13 de enero): correlación de logaritmos de 0,93 con el ingreso cuando el flujo está marcado como predictor (n = 466, circular), 0,59 mixto, 0,50 solo declarado y 0,49 solo cuentas o IVA: sin las marcas no se ve un ancla fuerte.

**Qué falta para mejorar.** Una etiqueta que no dependa de la decisión: el historial de cada flujo (primera y última versión, quién la editó y cuándo) y si la persona tiene documento de ingresos adjunto. Sin eso el techo de lo que se puede medir queda en los números de arriba.

### 12.17 Qué es el ingreso adicional en AWS, y el objetivo pasa a ser solo lo no verificado (2026-10-21)

**Las actividades secundarias** (35.019 flujos de 32.318 titulares; `scripts/r2_8_secundarias.py`):

| Persona | Con actividad secundaria | Mediana del adicional | Sobre el ingreso principal (mediana) | Recuperado de Novadata | Declarado | Cuentas o IVA | Actividad más común |
|---|---|---|---|---|---|---|---|
| Dependiente | 25,5% de 37.707 | 500 | 0,52 | 50,1% | 42,3% | 7,6% | comercio 29,0% (arriendos 1,4%) |
| Independiente | 30,3% de 57.487 | 509 | 0,30 | 84,7% | 15,1% | 0,2% | comercio 14,9% |
| Público | 28,5% de 9.375 | 600 | 0,53 | 40,2% | 55,2% | 4,6% | comercio 33,6% |

(«Recuperado de Novadata u otro» es el flujo sin monto por tipo: el salario recuperado del IESS.) **La mayor parte del ingreso adicional de un independiente es un salario del IESS ya verificado** (una persona que además trabaja como dependiente), y la mitad del de un
dependiente también. Lo que de verdad hay que estimar es el resto: comercio declarado y actividad propia. Los arriendos son el 1,4% o menos del adicional.

**Se separa lo verificado de lo no verificado.** El ingreso recuperado de Novadata (observación «RECUPERADO NOVADATA…») se trata como verificado y el resto como no verificado (`unver` en `resultados/r2_personas.parquet`):
- Independientes: el 24,7% tiene algún ingreso recuperado de Novadata y pesa en mediana el 22% de su total; solo el 0,5% no tiene nada por estimar. La mediana baja de 2.500 (total) a 2.300 (no verificado).
- Dependientes: el 79,4% tiene ingreso recuperado y el 59,7% solo tiene eso (nada por estimar). Públicos: 96,9% y 72,0%.

**Independientes, objetivo «ingreso no verificado»** (57.061 personas; mismos tramos y validación; `scripts/r2_9_unver.py`):

| Entradas | Medido con | R² | Tramo exacto | ±10% | ±25% | El real supera el mínimo 90% | Mínimo sobre real | Certifica 2.000 |
|---|---|---|---|---|---|---|---|---|
| M0 (lo anterior) | todas | 0,331 | 45,0% | 14,7% | 35,8% | 89,2% | 0,50 | 15,5% (95,8%) |
| M3 (cuota por tipo, actividad, datos internos) | todas | 0,370 | 46,6% | 15,6% | 37,8% | 89,1% | 0,53 | 18,2% (96,1%) |
| M3 | OK FACTURAR (9.631) | 0,463 | 53,8% | 18,1% | 42,5% | 93,6% | 0,49 | 38,5% (98,7%) |
| M3 más el ingreso verificado como entrada | OK FACTURAR | 0,473 | 54,7% | 18,1% | 42,8% | 93,8% | 0,51 | 38,9% (98,8%) |
| M3 sin el aporte al IESS | todas | 0,369 | 46,4% | 15,6% | 37,7% | 89,0% | 0,53 | 18,1% (96,1%) |

Con el total como objetivo M3 daba 0,382, 48,2% y 22,6% de «certifica 2.000»: separar lo verificado baja un poco las medidas porque el total incluía una parte ya conocida. **Quitar el aporte al IESS de las entradas no cambia nada** (0,369 contra 0,370): no había filtración
por ahí. **Resultado para el producto**: lo verificado (salario del IESS) se muestra aparte con ±10% por construcción, y lo no verificado se entrega con el mínimo certificado.

### 12.18 Referencia nacional para ingresos bajos y personas sin buró (ENIGHUR, 2026-10-21)

Decisiones del negocio del mismo día: lo declarado en OK FACTURAR lo valida el analista con documentos, así que **todo OK FACTURAR cuenta como verdad**; la base de 3,9 millones **no trae el monto de la pensión de los jubilados**, que quedan como estimados;
lo siguiente es una referencia nacional para ingresos bajos y para personas sin buró, con la ENIGHUR y la ENEMDU.

**Independientes en el país** (`scripts/ref_1_enighur.py` y `ref_2_tablas.py`). 13.958 personas de la ENIGHUR con ingreso neto del negocio mayor que cero (2,26 millones de personas; ponderado): mediana 252; el 10% gana menos de 48, el 25% menos de 115, el 75% menos de 480 y el 90% menos de 855.
Modelo con variables que Novadata también tiene (edad, sexo, estado civil, instrucción, provincia, zona, afiliación, RUC o RISE, tamaño del negocio, ocupación y actividad de 4 dígitos), validación cruzada agrupada por hogar:

| Entradas | R² | Tramo exacto | ±10% | ±25% | El real supera el mínimo 90% | Mínimo sobre real | Mediana del mínimo | Certifica al menos 200 (% de la población, precisión, capta) |
|---|---|---|---|---|---|---|---|---|
| E0 Novadata | 0,375 | 75,7% | 10,1% | 25,9% | 87,7% | 0,32 | 80 | 13,0%, 93,7%, 20,3% |
| E1 más tarjeta y cuenta | 0,384 | 75,4% | 10,4% | 26,4% | 87,8% | 0,33 | 81 | 13,8%, 93,2%, 21,5% |
| E2 más pago de préstamos (la cuota) | 0,400 | 76,1% | 11,0% | 27,2% | 87,9% | 0,34 | 82 | 15,4%, 94,0%, 24,1% |

- **El tramo exacto casi no supera el punto de partida**: el 73,5% de los independientes del país gana menos de 470, así que decir siempre «menos de 470» acierta 73,5%.
- **Sin más información solo se puede certificar un ingreso muy bajo**: el mínimo del 90% es en mediana USD 80 (un tercio del ingreso real); se puede certificar «al menos 200» para el 13% (2,4% para «al menos 300») y a nadie para «al menos 470». **Para un independiente
  sin historial de crédito, ningún dato de Novadata alcanza para certificar un ingreso del orden del salario básico: hay que pedir documentos.**
- **La ENEMDU 2024 lo confirma con más gente** (61.286 patronos y cuenta propia, 3,0 millones en el país; edad, sexo, instrucción, provincia, zona, afiliación, categoría y ocupación y rama de 1 dígito; `scripts/ref_3_enemdu.py`): R² de 0,409; ±10% 11,7%; ±25% 29,0%;
  el real supera el mínimo del 90% el 88,9% de las veces; mínimo en mediana 82 (0,38 del real). Certifica «al menos 100» al 44,4% de la población (precisión 96,9%), «al menos 200» al 17,6% (95,6%), «al menos 300» al 6,7% y «al menos 470» al 1,2% (89,9%). El 75,4% gana menos de 470.
- **La cuota también informa poco en la población general**: R² de 0,375 a 0,400 al sumar el pago de préstamos (7,4% de la importancia); coincide con lo medido en AWS.
- **Una tabla de celdas rinde mucho menos que el modelo** (R² de 0,10 a 0,14 contra 0,375; mínimo del 90% de USD 47 a 50): las ocupaciones y actividades de 4 dígitos y sus interacciones llevan la señal. Se dejó la tabla igual para quien necesite una referencia legible
  (`resultados/ref_2_independientes_celdas.csv`, 115 celdas con al menos 60 personas): por ejemplo, con afiliación al IESS y RUC o RISE (2.039 personas de la muestra, 340 mil en el país) la mediana es 410 (el percentil 30 es 207), el 90% gana menos de 1.599 y el 54% menos de 470; sin afiliación y con RUC
  (10.829; 1,74 millones) la mediana es 242 (el percentil 30, 138) y el 78% gana menos de 470; con seguro campesino (378; 56 mil) la mediana es 143 (el percentil 30, 76) y el 91% gana menos de 470.
  **Corregido el 2026-10-26**: este texto daba el percentil 30 como si fuera la mediana (207, 138 y 76); lo encontró la revisión de los códigos del INEC y se verificó contra la tabla (12.27).

**Jubilados y pensionistas en el país** (prestación de seguridad social; 5.505 personas, 922 mil en el país). Aquí una tabla sí sirve: por afiliación, sexo, edad y zona tiene R² de 0,438, acierta el tramo exacto el 54,3%, el real supera el mínimo del 90% el 87,4% de las veces, el mínimo es en mediana 220 (0,56 del real)
y se puede certificar «al menos 200» al 52,2% con 96,2% de precisión (`resultados/ref_2_pensiones_celdas.csv`).

| Afiliación (con el mapeo anterior; los códigos oficiales, abajo) | Muestra | En el país (miles) | P10 | P30 | Mediana | P70 | P90 | Menos de 470 | Además trabaja |
|---|---|---|---|---|---|---|---|---|---|
| Aporta al IESS (general o voluntario) | 3.737 | 678 | 215 | 325 | 470 | 689 | 1.100 | 48,2% | 12,7% |
| Otro seguro (era «probable ISSFA o ISSPOL»; ver la nota) | 421 | 66 | 480 | 750 | 870 | 1.170 | 1.520 | 9,7% | 25,5% |
| Seguro campesino | 1.118 | 133 | 100 | 106 | 119 | 120 | 120 | 99,6% | 9,5% |
| Ninguno | 229 | 44 | 120 | 270 | 400 | 600 | 2.000 | 52,5% | 11,9% |
| Todos | 5.505 | 922 | 120 | 270 | 430 | 667 | 1.150 | 53,1% | 13,1% |

**Nota del 2026-10-26: los códigos de afiliación se confirmaron y el guion los agrupaba mal** (12.27). Con el formulario oficial de la ENIGHUR (F1, p. 8), el 8 es «IESS como trabajador no remunerado del hogar» (iba a «otro seguro») y el 6 y el 7 son seguros privados (también iban a «otro seguro»).
Corregido, «otro seguro» es ISSFA o ISSPOL: 407 personas de la muestra, 63 mil en el país, mediana 900 y 7,5% con menos de 470; «certifica al menos 200» baja de 52,2% a 51,9%; lo demás no cambia. Los seguros privados tienen 14 jubilados en la muestra y no forman celda. La tabla corregida está en `resultados/r5b_pensiones_celdas.csv`.

La pensión del seguro campesino es casi fija (alrededor de 120) y la de otros seguros es el doble que la del IESS: **conocer el tipo de afiliación que ya trae Novadata permite estimar la pensión con una precisión útil**, mucho mejor que para un independiente.
En AWS, en cambio, el monto de un jubilado es declarado (mediana de 1.250 a 1.641): es una población que pide crédito, no la del país.

### 12.19 Mínimo de medio salario básico y población de solicitantes (2026-10-21)

**Decisiones del negocio.** Cuando lo único certificable es muy bajo, **se muestra igual un valor mínimo, pero no menor a la mitad del salario básico**: es improbable que quien gana menos esté buscando un crédito de cualquier tipo. Es un supuesto sobre quien solicita, no sobre la población.
**No hay consultas de Aval con ingreso calculado, solo de Equifax**: la versión con buró se entrena solo con Equifax; con Aval se usa la versión de Novadata.

**Se midió el supuesto con los solicitantes de AWS** (independientes, ingreso no verificado; `scripts/r2_10_piso.py`, el nombre del guion es anterior a este cambio de término). Ganan menos que la mitad del salario básico del año (de 200 a 241) el 0,56% de todos, el 0,22% de OK FACTURAR y el 1,73% de los rechazados; menos que el salario básico entero, el 1,37% y el 0,44%.
El supuesto se cumple en los datos. **El límite de medio salario básico nunca llega a aplicarse** con un modelo entrenado con solicitantes: ningún mínimo del modelo queda por debajo de la mitad del salario básico.

| Entradas (modelo entrenado con solicitantes) | Medido con | Mínimo | El real lo supera | Mediana del mínimo | Mínimo sobre real | Certifica 2.000 (% del total, precisión) |
|---|---|---|---|---|---|---|
| V1 Novadata (edad, sexo, zona, aporte IESS, actividad y antigüedad) | todas | 90% | 89,3% | 1.013 | 0,45 | 2,4%, 93,1% |
| V1 | todas | 85% | 84,3% | 1.150 | 0,51 | 5,5%, 90,6% |
| V1 | OK FACTURAR | 90% | 94,9% | 1.150 | 0,33 | 6,7%, 93,4% |
| V2 Novadata más buró y cuota | todas | 90% | 89,1% | 1.113 | 0,53 | 18,2%, 96,1% |
| V2 | todas | 85% | 84,1% | 1.251 | 0,61 | 22,9%, 94,7% |
| V2 | OK FACTURAR | 90% | 93,6% | 1.599 | 0,49 | 38,5%, 98,7% |
| V2 | OK FACTURAR | 85% | 89,7% | 1.832 | 0,57 | 45,1%, 98,0% |

**Lo que implica.** Para quien solicita, aun sin buró (V1) el mínimo certificado es de unos USD 1.000 (contra 80 en la población nacional, 12.18): la diferencia es el hecho de estar pidiendo un crédito. El resultado depende de **qué producto y qué institución**: AWS es financiamiento de vehículos (el 96% es crédito automotriz y solo 68 de 57.061 son de consumo, 12.27; para el negocio es lo mismo que consumo, porque el valor financiado es el mismo)
(mediana de 2.300 entre independientes); la mezcla de una institución de microcrédito o una cooperativa tendría ingresos más bajos, y el mínimo de un modelo entrenado con AWS no valdría tal cual. **El modelo de solicitantes hay que calibrarlo con la población de cada institución o producto**, y la referencia nacional
queda para donde no se pueda suponer que la persona solicita crédito.

### 12.20 Lo que falta y lo que sigue sin confirmar (2026-10-21)

**La tercera ronda de AWS** (historial de cada flujo, documentos de ingresos por persona y secuencias de estados de la respuesta comercial) **no la hizo la sesión que leía la base**, que se cerró el 2026-10-21; **la hizo esta sesión el mismo día con la autorización expresa del negocio**,
solo con esas tres consultas, en transacción de solo lectura (`research/ingresos-aws/scripts/extraer_ronda3.mjs`; usa `clientes/aws-ingresos.env`, fuera de git). Sus resultados están en 12.21. Cualquier consulta nueva a esa base la autoriza el negocio. El documento de la otra sesión, `docs/base-aws-originacion.md` (puntos 1 a 19), ya está en `main`.

**Resuelto.**
- Contrato con Equifax para entrenar con sus salidas: no hace falta, son datos ya pagados (decisión del negocio del 2026-10-21).
- Dónde queda el predictor corregido desde abril: los datos recibidos ya traen la corrección (el valor guardado es idéntico al crudo en todas las semanas desde octubre de 2025).
- Las observaciones «RECUPERADO NOVADATA MENOS IESS»: son un salario neto, no un ingreso adicional (12.15).
- Lo declarado en OK FACTURAR: lo valida el analista con documentos (decisión del negocio del 2026-10-21).
- El SRI de las respuestas de Equifax guardadas en AWS: se extrajo con la autorización del negocio («Autorizo AWS», 2026-10-21) y solo existe en las respuestas JSON de 2026 (12.24).
- El patrimonio: no se pide, ni a petición (decisión del negocio del 2026-10-22, que reemplaza la del 2026-10-21 de pedirlo a petición de un analista; 12.25). Tampoco se piden gastos, y la entrada no aplica al crédito de consumo.

**Sin confirmar.** Se dicen como inferencias y no se usan como dato.
1. **Resuelto el 2026-10-22 (12.25):** «SD» es «sin documentos»: el analista decide no pedirle al cliente respaldo de ingresos, patrimonio ni estabilidad (113 independientes en cada una de OK FACTURAR SD y SD CONDICIONADO: ya estaban fuera de la verdad con que se mide).
2. **Resuelto el 2026-10-26 (12.27):** la marca de «consumo» de la respuesta comercial no separa el producto. El cruce con `tipo_producto` muestra que todas las familias de respuesta son automotrices (54.906 de 57.061 independientes; 68 de consumo).
3. **Resuelto el 2026-10-26 (12.27):** FINALIZADO quiere decir que el requerimiento terminó todo el proceso con una respuesta final; no significa que se facturó.
4. **Resuelto el 2026-10-22 (12.25) y aclarado el 2026-10-26 (12.27):** las rentabilidades las fija crédito sobre un flujo real de ingresos de la actividad (estados de cuenta y declaraciones de IVA) y dependen del giro del negocio. No son entrada del modelo: aclaran la etiqueta. Los valores que dio el negocio (comercio 40%, construcción 30%) eran aproximados, y el negocio dice que son valores genéricos que no nacen de una metodología válida.
5. Cómo se arma el total de ingresos de la vista de reportes. La pantalla de flujo de efectivo suma los ingresos del titular y del cónyuge (visto en una captura, 12.25); falta confirmar que la vista de reportes use el mismo total.
6. Cómo arma Novadata el promedio del IESS: el ingreso de un dependiente con fuente IESS es el 90,0% de ese promedio en el 75,5% de los casos (un descuento fijo del 10%, no el 9,38% de ley).
7. Que los dos últimos puntos del historial de cuota de Equifax (+6 y +12 meses) sean proyecciones: se dedujo de la etiqueta.
8. Los códigos de afiliación, de categoría de ocupación y de nivel de instrucción de la ENIGHUR, la ENEMDU y el censo: se deducieron de los datos y no de una etiqueta oficial.
9. Quién editó cada versión de un flujo: la auditoría solo existe desde el 2026-03-08 y, para el 46% al 53% de las versiones, el usuario no coincide con ningún analista registrado, así que el rol solo se puede leer en parte (12.21: se distingue por comportamiento, automático o manual).
10. Si el `obligado` que trae Novadata coincide con el de Equifax, y si el texto de la actividad de los establecimientos de Novadata (`act_economica`) se puede llevar a un CIIU (12.24). Lo demás del SRI de Novadata se cotejó con Equifax en 87 personas.
11. Qué significan «alerta de ingreso» y «alerta de antigüedad» de la pantalla de flujo de efectivo de la originación (12.25), y si AWS las guarda. El negocio cree (2026-10-26) que son alertas por falta de continuidad; no está confirmado.
12. Si los datos de la persona que usa el entrenamiento (edad, sexo, estado civil, provincia y cantón; aporte, meses con aporte y empleos del IESS) son los mismos que arma CrediScope desde Novadata: no se midió (especificación, sección 10).

### 12.21 Tercera ronda: historial por flujo, documentos y secuencias (2026-10-21)

Tres extracciones de solo lectura, autorizadas por el negocio el 2026-10-21: `flujos_historial.csv` (96.909 flujos con auditoría, desde el 2026-03-09), `documentos_por_persona.csv` (92.472 personas) y `secuencias_respuesta.csv` (agregado), en `research/ingresos-aws/` (fuera de git).
Guiones: `scripts/extraer_ronda3.mjs` (lectura), `scripts/r3_*.py` (análisis). No se exportaron nombres de usuario: cada versión se clasifica por el **rol** del usuario en la tabla de analistas y por su **comportamiento**.

**Quién escribe y quién corrige.**
- Diez usuarios, con el 43% de las versiones, hacen casi todas sus ediciones (80% o más) a menos de 2 minutos de crear el requerimiento: son **automáticos** (integración o cálculo del sistema; cuatro de ellos con el rol «NEGADO/APELADO»). Otros 54 usuarios las hacen después: **manuales**. No hay casos intermedios.
- El rol de la tabla de analistas no coincide con el usuario en el 46% de las primeras versiones y en el 53% de las últimas («sin coincidencia»), por eso el comportamiento es la clasificación útil.
- La primera versión de un flujo es automática en el 53% y la última es manual en el 54%.

**Independientes (actividad principal de titulares, flujos activos con auditoría), según la respuesta final.**

| Respuesta | Flujos | Primera versión automática | Tocado por un autor manual | Monto sin cambio | Baja | Sube | Razón mediana si cambia | Con cuentas o IVA |
|---|---|---|---|---|---|---|---|---|
| Sin respuesta | 10.277 | 95% | 5% | 97% | 1% | 2% | 1,07 | 1% |
| RECHAZADO | 4.854 | 15% | 97% | 24% | 55% | 21% | 0,46 | 32% |
| APROBADO CONDICIONADO | 3.551 | 19% | 98% | 49% | 18% | 32% | 1,20 | 6% |
| OK FACTURAR | 3.455 | 14% | 99% | 25% | 37% | 38% | 0,98 | 39% |
| OK FACTURAR CONDICIONADO | 1.115 | 19% | 97% | 30% | 33% | 37% | 0,94 | 24% |
| PENDIENTE | 849 | 19% | 95% | 46% | 23% | 31% | 1,00 | 21% |
| APROBADO | 679 | 18% | 97% | 45% | 26% | 29% | 0,91 | 19% |

- **En un OK FACTURAR el monto lo trabaja una persona**: el 99% de los flujos lo tocó un autor manual, el monto cambia en el 75% y lo hace casi parejo hacia arriba y hacia abajo (razón mediana de 0,98). Coincide con lo dicho por el negocio (el analista contrasta y valida), y es distinto de los «sin respuesta»,
  que son montos del concesionario que nadie tocó (97% sin cambio, 5% tocado por una persona). En los rechazados el monto baja (55%, razón de 0,46 cuando cambia).
- Entre los OK FACTURAR o condicionados, la primera versión suele ser manual: 3.688 de 4.570 flujos; la primera automática y la última manual son 625; los que quedaron en una sola versión, 188.

**Las secuencias de la respuesta comercial.** Casi todos los requerimientos tienen una sola respuesta: OK FACTURAR 18.481 de 35.046 (53%), RECHAZADO 57.016 de 63.390 (90%). Pasos que se repiten: PENDIENTE a OK FACTURAR (1.050), OK FACTURAR CONDICIONADO a OK FACTURAR (702; mediana de 27,7 horas),
APROBADO CONDICIONADO a OK FACTURAR CONDICIONADO (233) y APROBADO CONDICIONADO a RECHAZADO (571; 22 horas): **una aprobación condicionada puede terminar rechazada**.

**Los documentos de ingresos** (57.487 independientes; documento cargado = tiene al menos un archivo que no fue eliminado).

| Respuesta | Con registro de documentos | Algún documento de ingresos | Movimientos bancarios | Declaraciones de IVA | RUC o RIMPE | Impuesto a la renta | Certificado bancario |
|---|---|---|---|---|---|---|---|
| Sin respuesta | 4% | 1% | 0% | 0% | 0% | 0% | 0% |
| RECHAZADO | 69% | 37% | 23% | 5% | 8% | 3% | 2% |
| OK FACTURAR | 80% | 54% | 33% | 8% | 13% | 3% | 13% |
| OK FACTURAR CONDICIONADO | 73% | 34% | 12% | 4% | 6% | 2% | 2% |
| APROBADO CONDICIONADO | 78% | 32% | 6% | 2% | 6% | 2% | 1% |
| APROBADO | 47% | 15% | 4% | 1% | 4% | 1% | 0% |

Entre los OK FACTURAR y condicionados: **solo declarado** (4.662): 42% tiene algún documento de ingresos cargado y 9% movimientos bancarios; **solo cuentas o IVA** (3.191): 55% y 51%. **El «el analista lo contrasta con documentos» se ve cargado en el sistema solo en el 42% de lo declarado** (los documentos pueden estar fuera de la base).

**Comprobaciones con el modelo M3 (objetivo: ingreso no verificado; OK FACTURAR y condicionado).**
- «Solo declarado» con documento de ingresos contra sin documento: R² de 0,513 y 0,518; tramo exacto 59,2% y 57,5%; real sobre previsto 0,96 y 0,99. **El documento cargado no cambia qué tan predecible es el monto ni su nivel**: no hay una etiqueta más limpia por ahí, y se mantiene la decisión de tratar todo OK FACTURAR como verdad.
- Los «solo cuentas o IVA» son menos predecibles que los declarados (R² de 0,31 a 0,34 contra 0,51; real sobre previsto de 1,22 a 1,38: el modelo los subestima).
- Entrenar sin los «sin respuesta» (38% de la muestra, montos del concesionario sin revisar) casi no cambia lo medido en OK FACTURAR: R² de 0,463 a 0,468; tramo exacto de 53,8% a 54,6%; el real supera el mínimo del 90% el 93,2% contra 93,6%; certifica 2.000 al 39,5% contra 38,5%. Se mantiene entrenar con todas las respuestas.

**Qué queda del límite de la etiqueta.** Confirmado que en los casos decididos hay un cálculo humano y que el monto depende del resultado (en rechazos baja). No se pudo separar lo que corrige un analista de lo que escribe un concesionario más allá de automático y manual, y el rol de los usuarios manuales no se conoce en casi la mitad de las versiones.

### 12.22 Las variables del buró y los tres niveles con el mismo objetivo (2026-10-21)

**Las columnas de «crédito» del extracto de AWS son campos de la respuesta cruda de Equifax.** Se cotejaron las 5.001 respuestas de `muestra_respuestas_equifax.jsonl` con las columnas del extracto (`scripts/r3_5_paridad_buro.py`): igualdad exacta (±0,011) en 4.499 de 4.499 respuestas con dato, en las diez:
`credito_mayor_aprobado_monto` = `MCAMontoOriginal`; `credito_mayor_12m_monto` = `CMRMontoOriginal`; `credito_mayor_24m_monto` = `CMAMontoOriginal`; `deuda_total_adeudada` = `PCTotalAdeudado`; `n_instituciones_con_deuda` = `PCNumIfisActuales`;
`n_creditos_aprobados` = `RECACreditosAprobados`; `valor_creditos_aprobados` = `RECAValCreditosAprobados`; `valor_saldos_vigentes` = `RECAValSaldosVigentes`; `deuda_actual_total` = `TDeudaActual`; `deuda_hace_3_meses` = `TDeudaHace3Meses`.
Todos de `interconnectResponse` → `AnalisisCreditoSectorFinanciero`. Esto cierra la duda de la otra sesión sobre qué miden «mca, cmr, cma y reca».

**Qué ventana de tiempo cubre cada crédito mayor** (meses entre la fecha de concesión y la consulta): el mayor crédito aprobado (`MCA`) tiene mediana de 24,9 (P10 4,1; P90 81; máximo 360,8); el «reciente» (`CMR`) mediana de 11,7 (P90 44,5) y el «actual» (`CMA`) mediana de 37,9 (P90 96,0).
**No son ventanas estrictas de 12 y 24 meses**, aunque la columna del extracto se llame `12m` y `24m`. El mínimo de los tres es −8,7 meses: **hay créditos con fecha de concesión posterior a la consulta**, y por eso en el entrenamiento se anula el crédito mayor cuando su fecha es posterior (puede ser el crédito que se pide). El 90% de los casos cumple `CMR ≤ MCA` y `CMA ≤ MCA`.

**CrediScope no extrae hoy estos campos**: `derivarTablas` toma de `interconnectResponse` solo dos cálculos de Equifax, porque la deuda de ese bloque no cuadra con la de `reporteCrediticio`. Las variables más pesadas del nivel 2 (el mayor crédito aprobado, 32% de la ganancia, y la deuda de hace 3 meses, 15%) salen de ese bloque:
se usan como señal, no como saldo, y hay que extraerlas a una tabla nueva (`docs/especificacion-predictor-de-ingresos.md`, 4.2).

**Los tres niveles con el mismo objetivo, con la actividad y la antigüedad que trae AWS** (referencia: **no se pueden reproducir en CrediScope**, ver 12.23; ingreso no verificado de 57.061 independientes; entre paréntesis, solo OK FACTURAR y condicionado, 9.631; `scripts/r3_6_niveles.py`):

| Nivel | R² | Tramo exacto | ±10% | ±25% | El real supera el mínimo 90% | Mínimo sobre real | Mediana del mínimo 90% | Certifica 940 | Certifica 2.000 | Certifica 3.000 | Certifica 5.000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 Novadata | 0,135 (0,018) | 36,4% (36,1%) | 10,9% (10,0%) | 27,8% (26,2%) | 89,3% (94,9%) | 0,45 (0,33) | 1.013 (1.150) | 64,6% (75,3%) | 2,4% (6,7%) | 0,1% (0,3%) | 0,0% |
| 2 Novadata y buró | 0,351 (0,438) | 45,8% (52,4%) | 15,1% (17,4%) | 36,5% (41,1%) | 89,1% (94,5%) | 0,52 (0,47) | 1.104 (1.515) | 67,6% (84,0%) | 17,3% (35,7%) | 8,0% (18,6%) | 2,1% (4,9%) |
| 3 Con datos internos | 0,370 (0,463) | 46,6% (53,8%) | 15,6% (18,1%) | 37,8% (42,5%) | 89,1% (93,6%) | 0,53 (0,49) | 1.113 (1.599) | 67,5% (85,0%) | 18,2% (38,5%) | 8,8% (21,5%) | 2,3% (6,1%) |

La precisión de lo certificado es de 93% a 99% en todos los casos con certificación. **El nivel 1 casi no distingue a una persona de otra**: en OK FACTURAR su R² es de 0,018, y su mínimo es en la práctica el límite inferior de la población de solicitantes (unos 1.000).
**El salto está en el buró** (de 0,135 a 0,351 en R²), y los datos internos suman poco (de 0,351 a 0,370).

### 12.23 El catálogo CIIU, la actividad de AWS y los niveles que sí se pueden servir (2026-10-21)

**Catálogo CIIU de AWS** (leído con autorización del negocio, solo esa tabla; `research/ingresos-aws/ciiu_catalogo.csv`): 6.172 códigos en 7 niveles (21 secciones de una letra, 88 divisiones, 238 grupos, 419 clases y códigos más finos del SRI, hasta 11 caracteres).
Los 57.029 independientes con actividad (99,9%) tienen un id con código en el catálogo; el 95% apunta al nivel más fino (códigos como `N8230.00.01`). Son 1.714 actividades distintas, 22 secciones y 86 divisiones.

**La actividad casi no aporta y agruparla no pierde nada** (Nivel 2, `scripts/r3_8_ciiu.py`, todas / OK FACTURAR): R² de 0,351 / 0,438 con las 1.714 categorías; 0,352 / 0,438 con la división; 0,352 / 0,439 con la sección (una letra); 0,347 / 0,446 sin actividad (solo la antigüedad).
En el Nivel 1 (`scripts/r3_9_ciiu_nivel1.py`) pesa un poco más: R² de 0,070 solo con datos de la persona; 0,087 con el aporte al IESS; 0,116 con la antigüedad de la actividad; 0,129 con la sección; 0,135 con las 1.714 categorías. En OK FACTURAR el Nivel 1 queda alrededor de cero en todas las variantes.

**La actividad y la fecha de inicio de AWS no son las del SRI** (`scripts/r3_10_paridad_sri.py`, 1.368 casos con las dos fuentes): la sección CIIU coincide en el 58,0%, la división en el 57,5% y la clase a 5 caracteres en el 57,3%; la fecha de inicio es idéntica en el 19,4%, dentro de 31 días en el 32,7% y dentro de un año en el 45,5%.
En AWS salen del flujo de ingreso (declaradas o escritas por el analista); la de Equifax es el registro del SRI (`informacion_sri`: RUC, estado, clase, obligado a llevar contabilidad, fecha de inicio y código CIIU; el 76% de las respuestas tiene RUC). **Servir con el SRI un modelo entrenado con lo declarado metería ruido.**

**Los tres niveles solo con variables que CrediScope puede armar igual** (sin actividad ni antigüedad de AWS; `scripts/r3_11_niveles_servibles.py`; entre paréntesis, solo OK FACTURAR y condicionado):

| Nivel | R² | Tramo exacto | ±10% | ±25% | El real supera el mínimo 90% | Mínimo sobre real | Mediana del mínimo 90% | Certifica 940 | Certifica 2.000 | Certifica 3.000 | Certifica 5.000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 Novadata | 0,087 (−0,071) | 34,7% (32,1%) | 11,0% (10,2%) | 26,9% (25,3%) | 89,5% (95,9%) | 0,43 (0,31) | 991 (1.042) | 64,9% (78,5%) | 1,6% (4,3%) | 0,0% (0,1%) | 0,0% |
| 2 Novadata y buró | 0,341 (0,445) | 45,5% (52,3%) | 14,8% (17,5%) | 36,3% (41,6%) | 89,1% (94,9%) | 0,51 (0,46) | 1.088 (1.457) | 65,4% (84,7%) | 16,9% (34,0%) | 7,9% (17,6%) | 2,3% (5,0%) |
| 3 Con datos internos | 0,359 (0,472) | 46,3% (54,5%) | 15,5% (18,2%) | 37,2% (42,8%) | 89,1% (93,8%) | 0,53 (0,50) | 1.098 (1.586) | 66,0% (85,1%) | 17,9% (37,8%) | 8,9% (21,4%) | 2,6% (6,8%) |

La precisión de lo certificado (a 940: 93% a 99%; a 2.000: 95% a 99%; a 3.000: 95% a 100%) se mantiene. **Estas son las cifras sin el SRI**; las que valen para el producto, con el SRI que sí se puede servir, están en 12.24. Sin el SRI el nivel 1 no distingue a una persona (R² de 0,087 y negativo en OK FACTURAR) y solo da el límite
inferior de la población de solicitantes; el buró es el que aporta (R² de 0,341).

**La actividad y la antigüedad del SRI** se extrajeron después, con la autorización del negocio (12.24). Contra lo que se esperaba aquí (unos 0,04 de R² en el nivel 1), el SRI suma el doble, y solo existe en las respuestas JSON de Equifax (desde diciembre de 2025): las XML, que son las de 2021 a 2025, no lo traen.

**Decisiones del negocio del 2026-10-21**: los dos primeros tramos siguen al salario básico del año (1 y 2 salarios) y los demás son dólares fijos (2.000, 3.000 y 5.000); se abre un PR con la investigación y la especificación, sin fusionar hasta que lo pida el negocio.

### 12.24 El SRI de las respuestas de Equifax y lo que suma cada dato interno (2026-10-21)

**Cuarta extracción de AWS, autorizada por el negocio el 2026-10-21 («Autorizo AWS»).** Solo lectura (`begin read only`) y una sola consulta, con una prueba de 200 filas antes (`research/ingresos-aws/scripts/extraer_sri.mjs`; usa `clientes/aws-ingresos.env`, fuera de git).
Lee el bloque `informacion_sri` de `consulta_equifax.response_json` y **solo** los campos que CrediScope ya deriva en `equifax_resumen` (`equifax-tablas.ts`): si tiene RUC, estado, clase, obligado a contabilidad, fecha de inicio, fecha de suspensión definitiva y código CIIU.
**No se exportó el RUC, el nombre, la dirección ni el nombre comercial.** Salida: `sri_por_consulta.csv` (105.070 filas en 167 s; fuera de git). Cualquier consulta nueva a esa base la autoriza el negocio.

**El SRI solo existe en las respuestas JSON.** La tabla de consultas tiene 415.836 filas: 309.346 con la respuesta solo en XML (2021 a 2025), 105.070 con JSON (284 de 2025 y 104.786 de 2026) y 1.420 sin respuesta. En una muestra de 2.060 respuestas XML repartidas en los cinco años (238, 228, 339, 484 y 771, de 2021 a 2025; una de cada 150) no hay ninguna con CIIU, contribuyente, actividad ni fecha de inicio
(y el `IncomePredictor` sí está en 1.967 de ellas, como control de que la búsqueda lee el texto). Esto corrige 12.23, que daba por hecho que el SRI estaba también en las XML. De las 105.070 JSON, 100.930 traen el bloque (en las primeras no está: es dato ausente, no «sin RUC») y 76.340 tienen RUC.
Consecuencia: **todo lo medido con el SRI es de 2026**: 36.773 de las 116.673 personas de la tabla, 21.260 de los 57.061 independientes con ingreso no verificado (el 87,3% con RUC) y 3.538 de ellos en OK FACTURAR y condicionado.

**La forma del dato.** Una lista de uno o ningún elemento por respuesta (78.198 con uno, 22.732 vacías): estado ACTIVO 54.389, SUSPENDIDO 23.791 y PASIVO 18; clase OTROS 52.683, RIMPE 25.471, ESPECIAL 42 y RISE 2; obligado a llevar contabilidad, 2.495 sí contra 75.703 no; código CIIU de siete caracteres (una letra y seis dígitos).
En la muestra de 5.001 respuestas, las 3.785 que traen RUC lo traen de la persona consultada (los diez primeros dígitos son su cédula).

**Qué trae Novadata del mismo SRI.** El catálogo de campos de Novadata (`docs/novadata-fields-catalog.md`) muestra que `datosContribuyente` trae el RUC, la fecha de inicio, el cese, el reinicio, la suspensión definitiva y `obligado`, y que los establecimientos traen la actividad como texto (`act_economica`);
**no trae el CIIU ni la clase del contribuyente**. Cotejo en la base de CrediScope, en las 87 personas que tienen una consulta de Equifax y un perfil de Novadata (solo conteos):

| Dato | Coincide |
|---|---|
| Tiene RUC (en las dos fuentes o en ninguna) | 87 de 87 (83 con RUC y 4 sin RUC) |
| Fecha de inicio de actividades idéntica | 83 de 83 |
| Estado: «ACTIVO» de Equifax y «activa» de Novadata | 74 de 76 |
| Estado: «SUSPENDIDO» de Equifax e «inactiva» de Novadata | 7 de 7 |

Las dos diferencias son personas que Equifax da por activas y Novadata por inactivas (una nunca reactivada y otra tras una reactivación): Novadata resuelve el estado por las fechas de cese y de reinicio (`ruc.ts`) y Equifax trae `estado_contribuyente`. Es una muestra chica, y el `obligado` de Novadata no se comparó.

**Cuánto suma el SRI.** Independientes de 2026 con el bloque (21.260); entre paréntesis, solo OK FACTURAR y condicionado (3.538); validación cruzada por persona (`scripts r4_5, r4_7 y r4_10`).
«SRI de Novadata» es lo que Novadata puede dar (RUC, estado, antigüedad, suspensión y obligado); «clase y CIIU» solo lo trae Equifax.

| Nivel y entradas | R² | Tramo exacto | El real supera el mínimo 90% | Mediana del mínimo 90% | Certifica 2.000 (% del total y precisión) |
|---|---|---|---|---|---|
| 1 Novadata, sin SRI | 0,091 (−0,044) | 35,1% (31,2%) | 89,0% (96,2%) | 978 (1.031) | 1,5% y 94,6% (3,5% y 96,8%) |
| 1 con el SRI de Novadata | 0,172 (0,098) | 36,9% (34,6%) | 88,9% (94,9%) | 1.001 (1.173) | 4,1% y 93,9% (9,4% y 97,0%) |
| 1 con el SRI, la clase y el CIIU | 0,192 (0,134) | 37,4% (35,6%) | 88,8% (94,6%) | 1.012 (1.216) | 4,2% y 93,8% (9,8% y 95,7%) |
| 2 Novadata y buró, sin SRI | 0,339 (0,443) | 45,6% (52,4%) | 88,4% (94,8%) | 1.070 (1.429) | 16,2% y 95,4% (32,2% y 98,5%) |
| 2 con el SRI de Novadata | 0,352 (0,458) | 46,1% (52,8%) | 88,4% (94,2%) | 1.082 (1.487) | 16,9% y 95,6% (34,4% y 98,3%) |
| 2 con el SRI, la clase y el CIIU | 0,355 (0,460) | 46,2% (53,2%) | 88,2% (94,0%) | 1.093 (1.516) | 17,0% y 95,5% (34,6% y 98,4%) |

- **En el nivel 1 el SRI suma el doble de lo previsto en 12.23** (que esperaba unos 0,04): +0,082 de R² con lo que da Novadata (intervalo del 95%: 0,072 a 0,091; en OK FACTURAR, +0,143) y +0,101 con la clase y el CIIU. Supera a la actividad y la antigüedad declaradas de AWS (0,146 sobre los mismos casos):
  el SRI completo, con la clase y el CIIU, queda 0,044 por encima (0,034 a 0,054) y, en OK FACTURAR, 0,092 por encima. La clase y el CIIU suman al nivel 1 +0,020 (0,016 a 0,024).
- **En el nivel 2 suma poco**: +0,013 (0,010 a 0,016) con el SRI de Novadata, y la clase y el CIIU solo +0,003 (0,001 a 0,004; en OK FACTURAR, no se distingue de cero). Por eso el nivel 1 no necesita el CIIU de Novadata.
- **Lo que cambia es cuánto se puede certificar, no la seguridad del mínimo**: en el nivel 1 «al menos 2.000» pasa de certificarse al 1,5% al 4,1% de los casos (del 3,5% al 9,4% en OK FACTURAR), con la misma precisión (94%).
- **Qué dice el SRI del ingreso** (mediana del ingreso no verificado): con RUC 2.500 contra 1.400 sin RUC; RUC activo 2.500 contra 1.600 suspendido; clase OTROS 2.500 y RIMPE 2.100. En el nivel 2 pesan, en porcentaje de la ganancia: la división del CIIU 3,9%, el estado 2,7%, la antigüedad 2,3%, la sección 2,2%, obligado 1,0% y la suspensión 0,7%.

**Se sostiene hacia adelante.** Entrenando con diciembre a junio (12.604 independientes) y midiendo de julio a octubre (8.656; 1.613 en OK FACTURAR y condicionado), el R² del nivel 1 pasa de 0,097 a 0,187 con el SRI de Novadata (+0,091; 0,072 a 0,107) y el del nivel 2 de 0,355 a 0,370 (+0,014; 0,010 a 0,018).
**El real supera el mínimo del 90% el 88,1% de las veces en el nivel 1 y el 87,5% en el 2** (94,9% y 94,3% en OK FACTURAR): hacia adelante cubre dos y dos puntos y medio menos que el 90% nominal, el desvío que corrige la calibración conforme de la especificación (sección 5).

**La cobertura es pareja entre los grupos que separa el SRI** (el real supera el mínimo del 90%; nivel 1 y nivel 2; `scripts r4_11`):

| Grupo | Casos | Nivel 1 | Nivel 2 |
|---|---|---|---|
| Con RUC / sin RUC | 18.565 / 2.695 | 88,9% / 88,6% | 88,3% / 87,7% |
| RUC activo / suspendido | 17.175 / 1.735 | 89,1% / 87,5% | 88,6% / 86,0% |
| Antigüedad de menos de 2 años / 10 años o más | 1.642 / 9.469 | 88,7% / 89,2% | 87,0% / 88,6% |
| Clase RIMPE / OTROS | 7.525 / 11.380 | 87,0% / 90,3% | 87,9% / 88,6% |
| OK FACTURAR y condicionado | 3.538 | 94,9% | 94,0% |
| RECHAZADO | 4.755 | 71,5% | 70,7% |

Entre los grupos del SRI la cobertura va de 86,0% a 90,6%; **lo que la separa es el tipo de respuesta**: en los rechazados el analista baja el ingreso (razón de 0,46, 12.21) y el mínimo del modelo, hecho con la mayoría que no se rechaza, queda por encima del ingreso calculado en el 29% de ellos. No es un problema del SRI.

**Datos internos: qué suma cada bloque al nivel 2.** Todo AWS (57.061 independientes, sin SRI); entre las dos últimas columnas, el R² y la diferencia en OK FACTURAR y condicionado (9.631); intervalos del 95% por remuestreo de filas (`scripts r4_6, r4_9, r4_12 y r4_13`).

| Se suma al nivel 2 | R² | Diferencia (intervalo) | En OK FACTURAR: R² y diferencia |
|---|---|---|---|
| Nada: el nivel 2 | 0,341 | — | 0,445 |
| Patrimonio propio (vivienda, terreno, vehículo, muebles, inventario, maquinaria y otros) | 0,346 | +0,005 (0,004 a 0,006) | 0,456; +0,011 (0,008 a 0,014) |
| Solo la entrada del crédito | 0,351 | +0,010 (0,008 a 0,012) | 0,460; +0,014 (0,009 a 0,020) |
| Patrimonio propio y entrada (los «activos declarados» de 12.22) | 0,354 | +0,014 (0,012 a 0,015) | 0,466; +0,020 (0,014 a 0,027) |
| Egresos declarados (gasto familiar, arriendo, hipotecario, pensión alimenticia y otros) | 0,344 | +0,003 (0,002 a 0,004) | 0,454; +0,008 (0,006 a 0,011) |
| Pasivos del buró | 0,341 | 0,000 (−0,001 a 0,001) | 0,448; +0,002 (0,000 a 0,005) |
| Conducta con la propia institución | 0,340 | 0,000 (−0,001 a 0,000) | 0,446; +0,001 (0,000 a 0,003) |
| Todo lo interno (el nivel 3 de 12.22 y 12.23) | 0,359 | +0,019 (0,016 a 0,021) | 0,472; +0,027 (0,021 a 0,033) |

- **La entrada no es patrimonio.** AWS la guarda como un rubro más de `persona_patrimonio` («Entrada»), pero es la entrada del crédito que se pide, una condición de la operación (en 12.16 ya aparecía como «entrada del crédito declarada», con el 5,2% de la ganancia). La declara el 98,3% de los independientes
  y en el modelo de activos pesa el 5,5% de la ganancia, más que todos los demás rubros juntos. **La entrada sola suma +0,010 y el patrimonio propio solo +0,005; juntos, +0,014** (comparten información, por eso no se suman).
- **El patrimonio propio suma poco, pero es evidencia aparte y se sostiene.** No es la misma persona declarando ingreso y bienes: donde la etiqueta es de cuentas o IVA (evidencia independiente de lo declarado) suma más que donde es declarada, +0,011 contra +0,004 en todos los casos
  y, en OK FACTURAR, +0,024 (0,019 a 0,030) contra +0,005 (0,001 a 0,008). Por año de la consulta: 2023 +0,006, 2024 +0,005, 2025 +0,003 y 2026 +0,007. Solo el 41% declara vivienda, terreno o vehículo (vivienda 27%, vehículo 20%, terreno 3%); el resto declara muebles y enseres, inventario u otros.
- **Los egresos declarados suman poco y solo en 2026**: por año de la consulta, 2023 −0,000, 2024 +0,001, 2025 0,000 y 2026 +0,008; y por tipo de etiqueta el aporte está en OK FACTURAR declarado (+0,012; 0,009 a 0,015), no en OK FACTURAR con cuentas o IVA (+0,002; −0,002 a 0,007).
  Es lo que se vería si quien declara el ingreso declara también los gastos y los dos son consistentes entre sí, que no es evidencia aparte (no se pudo probar). Con estas cifras no justifican pedirlos; la decisión es del negocio.
- **Los pasivos del buró y la conducta con la propia institución no suman**: los pasivos de AWS son los del buró (SBS, SEPS, INFOCOM), que el nivel 2 ya trae; la conducta interna es de la propia institución y CrediScope no la tiene.
- **Con el SRI** (21.260 de 2026), el patrimonio propio sube el nivel 2 de 0,355 a 0,360 (+0,006; 0,004 a 0,008; en OK FACTURAR, de 0,460 a 0,467) y «al menos 2.000» se certifica en el 17,4% de los casos en vez del 17,0% (en OK FACTURAR, 36,8% en vez de 34,6%, con precisión de 98%).
  Con la entrada también, 0,367 (+0,012).

**Decisión del negocio (2026-10-21), reemplazada al día siguiente (12.25): el patrimonio solo se solicitaría a petición de un analista, no como entrada inicial.** Lo que costaba no tenerlo desde el inicio era poco: +0,006 de R² (+0,008 en OK FACTURAR).
El 2026-10-22 el negocio decidió que ni siquiera se pide, que los gastos no se piden y que la entrada no aplica (el crédito de consumo no la tiene; la entrada suma +0,010 por sí sola, pero es una condición de la operación pedida y no un dato de la persona). La especificación ya no tiene nivel 3.

**Qué cambia en la especificación.** El nivel 1 pasa de R² de 0,087 a 0,172 con el SRI de Novadata y el nivel 2, de 0,341 a 0,355. El nivel 3 (patrimonio propio, 0,360) se retiró el 2026-10-22 (12.25). Las cifras son del subconjunto con SRI (2026): no son comparables una a una con las de 12.23 (todo AWS), pero la dirección y los intervalos son claros.

**Lo que sigue sin medirse.**
1. El SRI de Novadata contra el de Equifax en más de 87 personas, el `obligado` de Novadata y si el texto de la actividad de los establecimientos de Novadata (`act_economica`) se puede llevar a un CIIU (con la clase y el CIIU el nivel 1 ganaría 0,020 más de R²).
2. El SRI de 2021 a 2025: las respuestas XML no lo traen, así que el modelo con SRI se entrena solo con 2026 hasta que lleguen los 3,9 millones.
3. El comportamiento de quien no tiene RUC ni aporte al IESS: el 87,3% de los independientes de AWS tiene RUC y los que no, son la minoría que igual pidió crédito.
4. El valor de los vehículos de la persona (Novadata) como variable del predictor: no hay dato de entrenamiento, porque AWS no guarda la respuesta de Novadata (12.25).

### 12.25 Decisiones y aclaraciones del negocio (2026-10-22)

El negocio respondió punto por punto a los pendientes de 12.24 y compartió cuatro capturas de la pantalla «Flujo de efectivo» de la originación, de un caso real. **No se copian acá los datos de esa persona.**

**Decisiones.**
1. **No se piden gastos.**
2. **La entrada no aplica**: el crédito de consumo no tiene entrada; es de los créditos hipotecario y automotriz. (En AWS, que es casi todo crédito automotriz, sí existe: de ahí su peso en 12.24.)
3. **No se pide patrimonio**: es parte de otro análisis, a cargo de una persona (un analista). Reemplaza la decisión del 2026-10-21 de pedirlo a petición. **Se retira el nivel 3**: el predictor queda en dos niveles (Novadata; Novadata y buró), más lo verificado y las dos referencias.
   De Novadata ya se tiene el valor de todos los vehículos de la persona, que el modelo de score lee como colateral.
4. **El ingreso verificado es el ingreso validado calculado de AWS** (el que muestra la pantalla de flujo de efectivo), incluido el recuperado de Novadata. Con él se entrena y se mide; para calibrar a otro producto u otra institución haría falta su propia muestra validada (especificación, sección 10).
5. **La base de 3,9 millones** sigue en proceso por el proveedor.
6. **Los códigos del INEC** (afiliación, categoría de ocupación e instrucción): el negocio no sabe dónde conseguirlos. Se buscan en los diccionarios de las propias bases.
7. **El respaldo de las consultas crudas de Equifax y su regla de permiso** quedan para la sesión de la API.

**Cómo se arma el ingreso en AWS** (para entender la etiqueta; no son entradas del modelo):
- **Rentabilidades**: las fija crédito. Sobre un flujo real de ingresos de la actividad (estados de cuenta y declaraciones de IVA) se aplica la rentabilidad que corresponde al giro del negocio. Resuelve el punto 4 de 12.20.
  **Por confirmar:** el negocio dio como ejemplo comercio 40% y construcción 30%, y la tabla de AWS tiene comercio y servicios generales 0,30 y construcción 0,40 (12.15). Se tomó el del negocio como un ejemplo y no como el valor vigente. Si en verdad cambió la tabla o están al revés, el ingreso calculado de cuentas e IVA queda mal escalado en esos giros.
- **«SD»** es «sin documentos»: el analista decide no pedirle al cliente respaldo de ingresos, patrimonio ni estabilidad. Resuelve el punto 1 de 12.20. Esos casos no tienen un ingreso contrastado con documentos y ya estaban fuera de la verdad con que se mide.
- El negocio pidió que **nada de esto se use ni se piense como insumo recurrente del modelo**: es una fuente para aclarar los datos con que se entrena el predictor (la especificación lo anota en 4.4).

**Lo que muestran las capturas** (sin copiar datos de la persona):
- La pantalla separa **ingresos** y **egresos**. En ingresos, por persona (titular y cónyuge) y por actividad (principal y secundaria): tipo de actividad, **alerta de ingreso**, **alerta de antigüedad** e **ingreso validado calculado**. En egresos: gasto familiar y gasto financiero del titular y del cónyuge.
- **El total de ingresos suma al titular y al cónyuge** (comprobado: es la suma de las cuatro actividades visibles). **El valor neto disponible es el total de ingresos menos el total de egresos** (comprobado con las cifras). **La cobertura del dividendo es el total de ingresos dividido por la suma del total de egresos y la cuota estimada mensual** (comprobado con las cifras; es un solo caso).
- **El ingreso de un independiente** se arma con tipo de ingreso, actividad (el texto del CIIU), macroactividad, fecha de inicio, fuente (RUC) y movimientos, entre ellos «INGRESO DECLARADO»: es la etiqueta «solo declarado» de 12.16 y 12.21.
- **El ingreso de un dependiente recuperado de Novadata** lleva fuente IESS, fecha de inicio, identificación y nombre del patrono y la observación «RECUPERADO NOVADATA» (12.15). En el caso visto, **el patrono del cónyuge es el propio titular**: el sueldo del cónyuge sale de la nómina del negocio del titular.
  Inferencia, no medida: si el negocio del titular ya descuenta ese sueldo, sumar los dos ingresos contaría el mismo dinero dos veces.
- Qué significan «alerta de ingreso» y «alerta de antigüedad» no se sabe: queda en «sin confirmar» (12.20, punto 11).

### 12.26 El entrenamiento reproducible, la calibración, la robustez del nivel 1 y la exportación (2026-10-22)

**Qué se hizo.** El entrenamiento y la medición de los niveles 1 y 2 salieron de los guiones sueltos de `C:\datos\ingresos\scripts` (que se llamaban entre sí con `exec`) a `scripts/predictor-ingresos/` (`LEEME.md`):
`preparar.py` arma la tabla por persona, `entrenar.py` entrena los doce cuantiles de cada nivel y `medir.py` reproduce las tablas de la especificación (3.1) y de 12.24, con intervalos del 95% por remuestreo de personas (1.000 veces)
y la cobertura por grupo y por tipo de respuesta. Sin datos ni identificaciones en el repositorio: las entradas siguen en `research/ingresos-aws/` y las tablas y los modelos se escriben en `C:\datos\ingresos\resultados\predictor-ingresos\` y `C:\datos\ingresos\modelos\`.
No hubo ninguna consulta a AWS: los guiones leen las extracciones que ya estaban en disco.

**Los números coinciden con los guiones viejos.** `medir.py` cotea cada número contra los resultados de `r4_7` (validación cruzada, seis variantes), `r4_8` (por fecha) y `r4_11` (cobertura por grupo): **264 números comparados, 0 distintos**
(tolerancia: una décima de punto en los porcentajes, 0,0015 en el R² y 1 dólar en las medianas). La tabla por persona que arma `preparar.py` es idéntica, columna por columna y en el mismo orden de filas, a la de `r4_personas_sri.parquet`
(57.061 independientes, las mismas 21.260 con el bloque del SRI). Dos corridas seguidas dan cuantiles idénticos (diferencia máxima 0), y el modelo que guarda `entrenar.py` predice igual que el entrenado dentro de `medir.py` (0,00).
Dos cosas que se hicieron distinto sin cambiar un número: las semillas de LightGBM, que los guiones viejos no fijaban, se fijan explícitas en los valores que LightGBM usa por omisión (`bagging_seed` 3, `feature_fraction_seed` 2 y `data_random_seed` 1), y en la prueba por fecha
las categorías (provincia, cantón, estado del RUC...) salen del entrenamiento (de antes de julio) y no de toda la tabla: una categoría que el modelo no vio llega como dato faltante, como lo hará el evaluador. Con eso los números por fecha coinciden igual.

**Qué entra y qué no.** La tabla trae solo las variables de los niveles 1 y 2 (especificación, 4.1 y 4.2), el objetivo (`unver`, el ingreso no verificado de los independientes entre 0 y 60.000) y unas columnas `med_*` que solo sirven para medir (la respuesta comercial y la etiqueta «solo cuentas o IVA»).
`comun.verificar_entradas()` corta si una variable `activo_*`, `egreso_*`, `pasivo_*`, `incumplimiento_*`, el predictor de Equifax o la respuesta comercial llega a una matriz de entrenamiento, y `preparar.py` ni siquiera lee la tabla de datos internos.
Embudo: 146.693 consultas de titulares con solicitud e ingreso validado, 116.673 personas (la consulta más reciente de cada una), 57.061 independientes con ingreso no verificado, **21.260 con el bloque del SRI** (los que entrenan), 18.565 con RUC y 3.538 en OK FACTURAR y condicionado.

**Las tablas de la especificación, con intervalos** (validación cruzada por persona; intervalo del 95% entre paréntesis; entre corchetes, solo OK FACTURAR y condicionado, 3.538):

| Nivel | R² | Tramo exacto | El real supera el mínimo del 90% | Mediana del mínimo del 90% | Certifica «al menos 2.000» (% del total y precisión) |
|---|---|---|---|---|---|
| 1 Novadata, sin SRI | 0,091 (0,080 a 0,102) [−0,044] | 35,1% [31,2%] | 89,0% (88,6 a 89,4) [96,2%] | 978 [1.031] | 1,5% y 94,6% [3,5% y 96,8%] |
| 1 con el SRI de Novadata (el de la especificación) | 0,172 (0,157 a 0,188) [0,098 (0,067 a 0,129)] | 36,9% [34,6%] | 88,9% (88,5 a 89,3) [94,9% (94,2 a 95,6)] | 1.001 [1.173] | 4,1% y 93,9% [9,4% y 97,0%] |
| 1 con el SRI, la clase y el CIIU | 0,192 (0,176 a 0,209) [0,134] | 37,4% [35,6%] | 88,8% (88,4 a 89,3) [94,6%] | 1.012 [1.216] | 4,2% y 93,8% [9,8% y 95,7%] |
| 2 Novadata y buró, sin SRI | 0,339 (0,310 a 0,368) [0,443] | 45,6% [52,4%] | 88,4% (88,0 a 88,9) [94,8%] | 1.070 [1.429] | 16,2% y 95,4% [32,2% y 98,5%] |
| 2 con el SRI de Novadata | 0,352 (0,322 a 0,381) [0,458] | 46,1% [52,8%] | 88,4% (88,0 a 88,9) [94,2%] | 1.082 [1.487] | 16,9% y 95,6% [34,4% y 98,3%] |
| 2 con el SRI, la clase y el CIIU (el de la especificación) | 0,355 (0,325 a 0,383) [0,460 (0,399 a 0,526)] | 46,2% [53,2%] | 88,2% (87,7 a 88,7) [94,0% (93,2 a 94,7)] | 1.093 [1.516] | 17,0% y 95,5% [34,6% y 98,4%] |

Diferencias de R² con intervalo (1.000 remuestreos): el SRI de Novadata suma +0,082 (0,072 a 0,091) al nivel 1 y la clase y el CIIU +0,020 (0,016 a 0,024) más; al nivel 2 suma +0,013 (0,010 a 0,016) y la clase y el CIIU +0,002 (0,000 a 0,004);
el buró suma +0,182 (0,163 a 0,200) del nivel 1 al 2.

**Hacia adelante** (entrenado hasta junio con 12.604 personas, probado de julio a octubre con 8.656; entre corchetes, OK FACTURAR y condicionado, 1.613):

| Nivel | R² | El real supera el mínimo del 90% | Mediana del mínimo del 90% | Certifica «al menos 2.000» |
|---|---|---|---|---|
| 1 con el SRI de Novadata | 0,187 (0,162 a 0,215) [0,125] | 88,1% (87,4 a 88,8) [94,9% (93,7 a 95,9)] | 1.029 [1.152] | 4,5% y 93,8% [8,7% y 95,7%] |
| 2 con el SRI de Novadata | 0,370 (0,318 a 0,422) [0,545] | 87,5% (86,8 a 88,2) [94,3% (93,1 a 95,4)] | 1.130 [1.499] | 20,1% y 94,8% [34,2% y 97,8%] |
| 2 con el SRI, la clase y el CIIU (el de la especificación) | 0,372 (0,319 a 0,425) [0,546] | 87,4% (86,6 a 88,0) [93,3% (92,1 a 94,5)] | 1.138 [1.521] | 20,4% y 94,8% [35,4% y 97,7%] |

La especificación (3.1 y la sección 8, punto 8) dice 87,5% para el nivel 2 hacia adelante: es el nivel 2 con el SRI de Novadata; con la clase y el CIIU, que es el que se exporta, es 87,4%. La diferencia no es de método. **La cobertura queda entre 87,4% y 88,1%, a un punto o dos y medio del 90% nominal**, y el intervalo no llega a 89%: es un desvío real, y la calibración conforme de la especificación (sección 5) es la que debería corregirlo.

**La cobertura por grupo, validación cruzada y por fecha** (el real supera el mínimo del 90%, nivel 1 / nivel 2; intervalos del 95% de 500 remuestreos de personas en la salida de `medir.py`). Los números por grupo de 12.24 se reproducen; lo que agrega la prueba por fecha:

| Grupo | Validación cruzada (casos) | Por fecha (casos) |
|---|---|---|
| Con RUC | 88,9% / 88,3% (18.565) | 88,4% / 87,8% (7.870) |
| **Sin RUC** | 88,6% / 87,7% (2.695) | **85,1% / 83,1%** (786; 82,2 a 87,5 y 79,9 a 85,5) |
| RUC activo / suspendido | 89,1% / 88,6% y 87,5% / 86,0% | 88,6% / 87,9% y 86,7% / 86,7% |
| Antigüedad de menos de 2 años | 88,7% / 87,0% (1.642) | 87,6% / 86,1% (676) |
| Antigüedad de 10 años o más | 89,2% / 88,6% (9.469) | 88,8% / 88,0% (4.073) |
| Clase RIMPE / OTROS | 87,0% / 87,9% y 90,3% / 88,6% | 86,5% / 87,9% y 89,7% / 87,8% |
| OK FACTURAR y condicionado | 94,9% / 94,0% (3.538) | 94,9% / 93,3% (1.613) |
| Sin respuesta | 92,9% / 91,7% (8.804) | 91,7% / 89,8% (3.225) |
| Rechazado | 71,5% / 70,7% (4.755) | 71,1% / 71,7% (2.016) |

- **Los que menos cubren hacia adelante son quienes no tienen RUC** (85,1% en el nivel 1 y 83,1% en el 2, 786 casos), y por tipo de respuesta, los rechazados (71%). Hacia adelante, los sin RUC bajan tres puntos y medio contra la validación cruzada (88,6% y 87,7%): es parte de lo que 12.24 dejaba sin medir (el comportamiento de quien no tiene RUC) y ahora tiene un número, con un intervalo ancho (de 82 a 88% en el nivel 1).
  Los demás grupos del SRI quedan entre 86,1% y 89,7% (los obligados a llevar contabilidad, 339 casos, cubren más: 91,7% y 94,4%), salvo la etiqueta «solo cuentas o IVA, sin marca de predictor» (79,8% y 75,6%), que es una etiqueta distinta (el analista no la tocó) y no un grupo de personas.
- Los rechazados no son un problema del SRI: en ellos el analista baja el ingreso (razón de 0,46, 12.21), y el mínimo, hecho con la mayoría que no se rechaza, queda por encima del ingreso calculado en el 29% de los casos.

**Calibración conforme de cuantiles** (`scripts/predictor-ingresos/calibrar.py`; Romano, Patterson y Candès, 2019; especificación, sección 5). Entrenado hasta junio, probado de julio a octubre (8.656 casos; 1.613 en OK FACTURAR y condicionado). El desvío de cada caso de calibración es «cuantil menos ingreso real»,
y al mínimo se le resta el cuantil (1 − α)(1 + 1/n) de esos desvíos. Se midió en dólares (la regla escrita en la especificación) y en logaritmo (el mismo desvío en la escala del modelo: mueve el mínimo en proporción), con cuatro maneras de juntar los casos de calibración,
porque la intercambiabilidad entre calibración y prueba es lo que se juega:

| Cómo se calibra | Nivel 1: el real supera el mínimo del 90% | Nivel 2 | Cambio de la mediana del mínimo (nivel 1 / nivel 2) |
|---|---|---|---|
| Sin calibrar, todo el entrenamiento (los números de 12.24) | 88,1% (87,4 a 88,8) | 87,4% (86,7 a 88,0) | — |
| **Cruzada**: el modelo con todo lo anterior a julio y la corrección con sus 12.604 predicciones fuera de muestra (validación cruzada de cinco particiones), en logaritmo | **89,9% (89,3 a 90,6)** | **89,6% (88,9 a 90,2)** | −5,5% / −6,4% |
| Cruzada, en dólares | 89,8% (89,2 a 90,4) | 89,4% (88,7 a 90,0) | −5,1% / −5,8% |
| Aleatoria: se aparta el 20% de lo anterior a julio (2.575 casos) y el modelo entrena con el 80%, en logaritmo | 90,1% (89,5 a 90,8) | 89,9% (89,3 a 90,5) | −8,5% / −8,6% |
| Reciente: se aparta mayo y junio (4.275 casos) y el modelo entrena con lo anterior (8.329), en logaritmo | 88,9% (88,2 a 89,5) | 88,9% (88,2 a 89,5) | −2,8% / −6,6% |

- **La calibración lleva la cobertura hacia el 90%**: con la cruzada, a 89,9% en el nivel 1 y 89,6% en el 2, dentro del 90% más o menos un punto (los intervalos del 95% incluyen el 90%). El mínimo del 85% pasa de 83,4% y 82,0% a 84,7% en los dos niveles.
  **Cuesta mínimo**: la mediana del mínimo del 90% baja entre 5,5% y 6,4% (de 1.029 a 973 en el nivel 1 y de 1.138 a 1.065 en el 2), y «al menos 2.000» se certifica en menos casos en el nivel 2 (del 20,4% al 18,3% del total) con más precisión (de 94,8% a 95,8%); en el nivel 1 pasa de 4,5% a 3,5%.
  En OK FACTURAR el mínimo ya cubría de sobra y sube a 95,8% y 94,9%.
- **Dólares o logaritmo dan casi lo mismo en cobertura** (89,8% contra 89,9%). Se prefiere el logaritmo: baja el mínimo en proporción (un mínimo de 400 y uno de 4.000 no deberían bajar los mismos dólares) y no puede dejar un mínimo negativo.
- **Lo que no corrige del todo es la deriva en el tiempo**: calibrando con mayo y junio (lo más reciente) la cobertura queda en 88,9% (88,2 a 89,5), apenas fuera del punto. Los desvíos de los meses de calibración no son los de julio a octubre: el corrimiento que pide cada protocolo va de 0,028 a 0,090 en logaritmo.
  La garantía del método vale si los casos de calibración y los nuevos son intercambiables; con un modelo que se vuelve a calibrar cada trimestre (especificación, sección 7) la deriva de un trimestre es lo que queda.
- **Cuántos casos hacen falta** (calibración reciente, en logaritmo, 200 sorteos de casos): con 500 casos la cobertura media es 89,2% (nivel 1) y 89,1% (nivel 2), pero según cuáles 500 toquen va de 87,0% a 91,1% y de 87,3% a 91,3% (entre el 5% y el 95% de los sorteos); con 1.000, de 87,4% a 90,5% y de 87,7% a 90,3%;
  con 2.000, de 88,0% a 89,9% y de 88,3% a 89,7%. **El mínimo de 500 casos por institución de la especificación basta para el promedio y deja un margen de unos dos puntos a cada lado**: se pide más cuando se quiera estrechar.
  Recomendación: calibrar con la cruzada y en logaritmo, **y reportar la cobertura medida después de calibrar con un intervalo**, no la nominal.

**Robustez del nivel 1 sin zona y sin las variables de la persona** (`scripts/predictor-ingresos/robustez.py`). La edad, el sexo, el estado civil, la provincia y el cantón salen en CrediScope de Novadata y en AWS de la solicitud; su paridad no se midió (hacerlo exige cruzar identificaciones entre bases y no se hizo).
Lo que sí se puede medir sin cruzar nada es cuánto pesan y qué pasa si llegan distintas o no llegan. Nivel 1, validación cruzada y por fecha (diferencia de R² con el modelo completo, intervalo del 95%):

| Variables del modelo | R² (cruzada / por fecha) | Diferencia con el completo (cruzada) | Cobertura del 90% (cruzada / por fecha) | Mediana del mínimo (cruzada / por fecha) |
|---|---|---|---|---|
| Completo, con zona (16 variables) | 0,172 / 0,187 | — | 88,9% / 88,1% | 1.001 / 1.029 |
| Sin la zona de trabajo | 0,172 / 0,187 | 0,000 (−0,002 a 0,002) | 89,0% / 88,3% | 995 / 1.025 |
| Sin la zona de domicilio | 0,170 / 0,184 | −0,002 (−0,004 a 0,000) | 88,9% / 88,1% | 997 / 1.031 |
| **Sin provincia ni cantón** (12) | 0,167 / 0,183 | −0,005 (−0,009 a −0,002) | 89,0% / 88,5% | 986 / 1.014 |
| Sin zona ni estado civil, con edad y sexo (11) | 0,167 / 0,181 | −0,005 (−0,009 a −0,001) | 89,1% / 88,7% | 983 / 1.014 |
| Sin zona, estado civil ni sexo, solo la edad (10) | 0,166 / 0,181 | −0,006 (−0,010 a −0,003) | 88,9% / 88,7% | 985 / 1.024 |
| Sin zona ni datos de la persona, solo IESS y SRI (9) | 0,162 / 0,176 | −0,011 (−0,015 a −0,007) | 89,2% / 88,8% | 975 / 1.003 |
| Sin zona ni SRI, persona e IESS (7) | 0,078 / 0,085 | −0,095 (−0,104 a −0,083) | 89,1% / 88,8% | 976 / 990 |

En el nivel 2 quitar la provincia y el cantón cuesta 0,003 de R² (0,001 a 0,005; por fecha 0,002, que no se distingue de cero) y quitar la zona y los datos de la persona, 0,004; la cobertura no se mueve (88,2% y 88,3%; 87,4% y 87,6% por fecha).

- **La zona pesa poco: 0,005 de R² en el nivel 1 y por fecha ni siquiera se distingue de cero** (−0,004; −0,010 a 0,001). Todas las variables de la persona juntas, 0,011. Sin ellas la cobertura del mínimo del 90% no baja (sube un poco, a 89,2% y 88,8%) y el mínimo mediano baja 2,6%.
  **Lo que importa del nivel 1 es el SRI: sin él el R² cae 0,095.**
- **Servido con la variable alterada** (el modelo completo, entrenado hasta junio, probado de julio a octubre): cambiar la zona de todos por la de otra persona deja el R² del nivel 1 en 0,169 contra 0,187 y la cobertura en 88,0% contra 88,1%; si el 30% llega distinta, 0,181 y 88,2%. Con el sexo o el estado civil cambiados por los de otra persona, no pasa nada (0,186 y 0,185).
  La edad cambiada en todos baja el R² a 0,171. **Lo que sí lastima es que no llegue**: sin zona el nivel 1 cubre 86,5% (el modelo nunca vio un cantón faltante); sin edad, el R² cae a 0,143 y el mínimo mediano baja a 788 (el modelo se vuelve conservador); y sin el SRI de Novadata el R² es negativo (−0,230).
  En el nivel 2, ninguna variable de la persona ni la zona mueve la cobertura más de medio punto (87,1% a 87,5%, contra 87,4%), salvo que no llegue la edad (88,6%, con el mínimo mediano en 1.088 en vez de 1.138); sin el SRI de Novadata el R² baja de 0,372 a 0,317.
- **Recomendación para el nivel 1**: que entren la **edad y el sexo** (en Novadata vienen del Registro Civil), el aporte al IESS y el SRI. **Que no entren la provincia ni el cantón** (cuesta 0,005 de R² y por fecha no se distingue de cero; su paridad entre AWS y Novadata no se midió y el modelo cubre peor si llega vacía)
  **ni el estado civil** (no suma sobre la edad y el sexo: 0,167 con y sin él; cambia con el tiempo y cada fuente lo actualiza a su ritmo). Es un modelo de 11 variables con R² de 0,167 (0,181 por fecha), cobertura de 89,1% y 88,7% y mediana del mínimo de 983 (1.014 por fecha) contra 1.001 (1.029).
  Para el nivel 2, lo mismo por coherencia: la zona suma 0,003. **Antes de usar la edad, hay que fijar que se calcula como en AWS** (`edad_a_la_consulta`, años cumplidos a la fecha de la consulta) con la fecha de nacimiento de Novadata. **No se aplicó**: el modelo que se exportó es el de la especificación (con zona y estado civil); cambiarlo es una decisión del negocio y se hace en `comun.py`
  (`NIVELES`), volviendo a correr `entrenar.py`, `medir.py` y `exportar.py`.

**Exportación** (`scripts/predictor-ingresos/exportar.py`, formato en `FORMATO.md`). Cada nivel se exporta a un archivo propio (`crediscope-arboles-1`: siete arreglos paralelos por división, las hojas y los conjuntos de categorías, en JSON comprimido con gzip) que pesa **0,60 MB el nivel 1 y 0,64 MB el nivel 2** (1,9 MB sin comprimir),
contra los 13 MB (2,2 MB comprimidos) que la especificación midió para el `dump_model` de LightGBM; 28.560 divisiones y 30.600 hojas por nivel. Los archivos quedan fuera de git (`C:\datos\ingresos\modelos\exportado\`), con su huella SHA-256 (el mismo modelo da los mismos bytes). Un evaluador de referencia en Python puro (`evaluador_referencia.py`, sin LightGBM)
reproduce las predicciones de LightGBM con una diferencia máxima de 3e-14 en el logaritmo sobre 4.020 entradas inventadas por nivel, con datos faltantes, categorías que el modelo no vio, valores enormes y negativos, y valores justo en el umbral de una división (la igualdad va a la izquierda); si no coincidieran, `exportar.py` no escribe nada.
Verificado en esas entradas: un dato faltante en una división categórica va a la derecha, y en el modelo solo hay faltantes tipo «ninguno» y «NaN» (ningún nodo con «cero»). **Los casos de oro** (`scripts/predictor-ingresos/casos-de-oro/nivel1.json` y `nivel2.json`, 200 por nivel, 20 de borde y 180 al azar) llevan entradas inventadas y los doce cuantiles en logaritmo;
el evaluador de `_shared/` (paso 2 de la construcción) los tiene que reproducir con una diferencia menor que 0,001, y el de referencia da 2e-14.

**Lo que no se pudo medir.**
1. **La paridad de la edad, el sexo, el estado civil, la provincia y el cantón entre AWS y Novadata**: exige cruzar identificaciones entre las dos bases y no se hizo. Lo medido arriba acota el riesgo (la zona y los datos de la persona pesan poco y, cambiados, casi no mueven la cobertura), no lo elimina; la recomendación de sacar la zona y el estado civil lo evita.
2. **La calibración por institución**: se midió con AWS en conjunto. No hay casos con ingreso verificado de cada institución, y con menos de 1.000 casos el resultado depende de cuáles toquen (arriba).
3. **Si la deriva de julio a octubre sigue**: el desvío de 1,9 y 2,6 puntos se midió en cuatro meses; la calibración con lo más reciente lo deja en 1,1 puntos y el método supone intercambiabilidad.
4. **El modelo que se exporta no está calibrado** (`calibradoPara` queda vacío): se entrenó con todo 2026 y no queda un conjunto aparte; el corrimiento de la cruzada (0,056 en el nivel 1 y 0,066 en el 2, medido hasta junio) se aplica cuando el negocio lo decida y se vuelva a medir con el modelo final.
5. **Los que no tienen RUC ni aporte al IESS** (los 786 sin RUC de la prueba por fecha cubren 85,1% y 83,1%): el grupo es chico y su intervalo ancho; sigue sin probarse el caso sin RUC y sin IESS a la vez.
6. **El SRI de Novadata contra el de Equifax**: la paridad sigue en 87 personas (especificación, 4.1); el `obligado` de Novadata no se comparó.
7. **La especificación**: el PR 84 (decisiones del 2026-10-22) sigue abierto, así que la especificación no se tocó. Lo que cambia en 3.1 y 5 (la calibración medida, la cobertura hacia adelante de 87,4% en el nivel 2 con clase y CIIU, y la recomendación de variables) queda acá hasta que el 84 esté en `main`.

### 12.27 AWS es automotriz y para el negocio es lo mismo que consumo, y otras aclaraciones (2026-10-26 y 2026-10-28)

**Casi todo AWS es crédito automotriz, y el negocio dice que es lo mismo que consumo.** El 2026-10-26 el negocio aclaró que solo se trabaja crédito de consumo general (sin automotriz y, por lo tanto, sin entrada). El cruce del tipo de producto del extracto con la tabla de entrenamiento (`scripts r5_2`) dice:
- De los **57.061 independientes** con ingreso no verificado: **54.906 son crédito automotriz (96,2%)**, 68 de consumo prioritario (0,1%) y 2.087 sin tipo (3,7%). Los **9.631 casos de OK FACTURAR y condicionado** con que se mide: 9.362 automotrices y 269 sin tipo; **ninguno de consumo**. En el subconjunto con SRI (21.260): 19.117 automotrices, 56 de consumo y 2.087 sin tipo.
- Los productos de AWS (NOVAVIP, NOVAPLUS, NOVAFERIA, NOVA PREMIUM y similares) son los de un originador de crédito automotriz.
- **Corrige dos supuestos anteriores**: «AWS mezcla vehículos y consumo» (12.19, 12.20 y la especificación) y «la familia APROBADO es el flujo de consumo y la OK FACTURAR el automotriz» (12.15). Entre los automotrices están todas las respuestas: APROBADO 2.912, APROBADO CONDICIONADO 6.595, OK FACTURAR 6.766, OK FACTURAR CONDICIONADO 2.596 y RECHAZADO 13.111.
  Donde 12.16 y 12.17 dicen «aprobados de consumo» hay que leer «aprobados».

**Qué significa para el predictor: nada que calibrar por producto (decisión del negocio, 2026-10-28).** El 2026-10-26 esta sesión escribió que el mínimo certificado «no está medido en consumo» y propuso rotularlo «sin calibrar para consumo» hasta tener casos de consumo validados. El negocio lo corrigió el 2026-10-28:

> «De AWS hay más créditos automotriz; es lo mismo que consumo salvo que el valor financiado disminuye en el crédito automotriz porque hay una entrada de por medio. Crédito Consumo = 20.000; Crédito Consumo (Automotriz) = 20.000 + 5.000 (entrada) = valor auto de 25.000, pero el valor financiado es el mismo, 20.000.»
>
> «No existe la calibración contra consumo o automotriz, los 2 créditos son lo mismo; lo que nos importa son los datos del predictor de Equifax, que es un predictor general.»

**Esa propuesta se retira.** Se conserva el dato (54.906 de 57.061 independientes son automotrices y 68 de consumo; los 9.631 de OK FACTURAR y condicionado no incluyen consumo), con la nota de que lo comparable entre los dos productos es el **valor financiado**, no el valor del bien. La cobertura de alrededor del 89% que se midió con AWS vale entonces para el producto, y no se pide una muestra de consumo.
Lo que sigue valiendo es la **calibración por institución** de la sección 5 de la especificación: otra institución, con otra clientela (una de microcrédito, una cooperativa), tiene otros ingresos, y eso no depende del producto.

**Las rentabilidades.** El negocio aclaró que los valores que dio (comercio 40%, construcción 30%) eran aproximados y que no los tiene exactos: son valores genéricos que no nacen de una metodología válida. **No se usan como entrada.** Solo importan porque escalan la etiqueta: en los flujos de «cuentas o IVA» (3.103 de los 9.631 OK FACTURAR y condicionado, el 32,2%)
el ingreso calculado es el promedio de ventas o depósitos por la rentabilidad del giro. **Sensibilidad medida** (`scripts r5_5`; nivel 2 sin SRI, validación cruzada): si el ingreso real de esos flujos fuera k veces el calculado, el mínimo del 90% cubre, en ese grupo y en todos los OK FACTURAR,

| k (real sobre calculado) | Cobertura en «cuentas o IVA» | Cobertura en todos los OK FACTURAR | Certifica «al menos 2.000»: precisión en «cuentas o IVA» |
|---|---|---|---|
| 0,5 | 72,2% | 87,0% | 91,6% |
| 0,6 | 82,3% | 90,3% | 96,1% |
| 0,7 | 89,1% | 92,5% | 98,1% |
| 0,8 | 92,7% | 93,6% | 98,8% |
| 0,9 | 95,3% | 94,5% | 99,4% |
| 1,0 (como está) | 96,5% | 94,9% | 99,5% |
| 1,25 | 98,2% | 95,4% | 99,6% |

**La garantía aguanta que esas rentabilidades estén infladas hasta un 30%** (k de 0,7); si el ingreso real fuera la mitad de lo calculado, la cobertura baja al 72% en ese grupo y al 87% en el total. Es una sensibilidad: no se conoce el error verdadero. Y si las rentabilidades estuvieran bajas, el mínimo cubre más.

**Otras respuestas.**
- **FINALIZADO** quiere decir que el requerimiento terminó todo el proceso con una respuesta final; no significa que se facturó. Resuelve el punto 3 de 12.20.
- **«Alerta de ingreso» y «alerta de antigüedad»**: el negocio cree que son alertas por falta de continuidad (no lo confirma). La pantalla es la de «Flujo de efectivo» de la pestaña «Análisis Económico» del sistema de originación, no la de «Fuentes de ingreso» de CrediScope.

**La paridad de los datos de la persona, contra Equifax** (`scripts r5_3`). El respaldo local de las consultas crudas de Equifax ya tiene 20.000 respuestas JSON (`research/ingresos-aws/crudo-equifax/`; de las 105.070 que hay). Traen datos demográficos, y se cruzaron con el extracto de AWS por número de consulta, **sin cruzar identificaciones** (17.354 consultas):
- **Fecha de nacimiento** (Equifax la trae como texto, «12 de Mayo de 1985»): con las dos 15.365; **idéntica 88,8%**, a 31 días 99,8% y a un año 99,9%. **La edad coincide.**
- **Provincia y cantón** (Equifax trae hasta cinco direcciones juntas, separadas por «|»): domicilio de AWS contra la primera de Equifax, provincia 88,5% y cantón 75,2% (en alguna de las cinco, 90,7% y 79,3%); trabajo, provincia 80,0% y cantón 70,0% (82,0% y 73,6%). **La zona no coincide**: AWS toma un domicilio declarado y Equifax uno del buró.
- **Sexo y estado civil**: Equifax solo los trae en 563 de 20.000 respuestas (en `VariablesOfertaTotal`) y ninguna de ellas está en el extracto de AWS (0 de 513 revisadas): no se pudo medir. AWS sí los tiene completos (sexo 100%, estado civil 99,9% de los 57.061 independientes).
- Esto respalda la recomendación de la sesión de entrenamiento: **nivel 1 con edad, sexo, IESS y SRI, sin zona ni estado civil**, que cuesta 0,005 de R². **El negocio respondió el 2026-10-28 «decidir después de medir contra Novadata»**: queda como candidata, sin aplicar, hasta medir la paridad contra Novadata (lo que se sirve), que sigue sin medirse.

**Qué encontraron las sesiones de construcción** (PR 85, 86 y 87, fusionados el 2026-10-28):
- **PR 85 (variables y tabla de Equifax)**: las diez variables de crédito, la cuota y su historial y el SRI coinciden con el extracto (4.499 de 4.499 y 5.001 de 5.001), pero **19 variables del nivel 2** (cuotas, saldos y conteos por tipo de operación) no: el extracto salió de las listas `DetalleDeudaActualReportada*` de `interconnectResponse` y CrediScope las arma de `reporteCrediticio`, y coinciden entre el 49% y el 100% según la variable.
  El nivel 2 recibiría algo distinto de lo que aprendió el modelo. **Recomendación escrita: entrenar con las variables que arma `variables-de-ingreso.ts` sobre las respuestas JSON crudas**, que es lo que permite el respaldo local. También corrige 12.22: la «concesión posterior a la consulta» no existe (era una fecha leída mes/día).
- **PR 86 y 87 (entrenamiento)**: el pipeline reproduce 264 números de los guiones anteriores sin diferencias; con calibración conforme el mínimo del 90% cubre 89,9% y 89,6% (niveles 1 y 2) hacia adelante; el nivel 1 sin zona pierde 0,005 de R²; el modelo exportado pesa 0,6 MB y su evaluador de referencia coincide con LightGBM a 3e-14. El modelo del nivel 2 que exporta usa esas 19 variables (las cuotas, saldos y conteos por tipo): no sirve para publicar hasta reentrenar con las del módulo.

**Códigos del INEC** (informe de la sesión de códigos, `C:\datos\ingresos\resultados\r5_codigos_inec.md`, fuera de git):
- **ENIGHUR `P06_1` (afiliación)**, formulario oficial F1, p. 8: 1 IESS general, 2 IESS voluntario, 3 campesino, 4 ISSFA, 5 ISSPOL, 6 seguro privado con hospitalización, 7 seguro privado sin hospitalización, 8 IESS como trabajador no remunerado del hogar, 9 ninguno. **El guion agrupaba mal** el 8 (IESS) y el 6 y 7 (privados) en «otro seguro»;
  con el mapeo oficial las cifras cambian poco (nota en 12.18): en los independientes, «otro seguro» se separa en ISSFA o ISSPOL (mediana 300) y seguro privado (555).
- **ENIGHUR `PA23` (categoría de ocupación) y `P19_1` (instrucción)**: confirmados (F1, p. 21; sintaxis oficial de los tabulados). Sin efecto en las cifras: el guion no los nombra.
- **ENEMDU `p05a` (afiliación)**: confirmado con la guía de uso (tabla 2). **La numeración de la ENIGHUR no es la de la ENEMDU**: en una el «ninguno» es el 9 y el 8 es IESS; en la otra el «ninguno» es el 10 y el 8 es seguro municipal.
- **ENEMDU `p42` (categoría de ocupación) y `nnivins` (instrucción)**: **sin confirmar**; el INEC no publica la tabla de códigos en los archivos revisados (haría falta el formulario o los tabulados con códigos). La selección de independientes de `ref_3` (5 y 6) coincide con la ruta del cuestionario, así que la cifra no cambia; hay que corregir la etiqueta «patronos» de su texto.
- **Una corrección propia**: 12.18 daba como «mediana» tres cifras que eran el percentil 30 (207, 138 y 76); las medianas son 410, 242 y 143. Corregido en 12.18.

### 12.28 La destilación del predictor de Equifax: qué mejora y qué no (2026-10-28)

**Lo que dijo el negocio.** «Tenemos 400.000 consultas a Equifax con predictor en un periodo de 5 años, que nos debería servir para destilar nuestro modelo propio de predictor.» La idea es entrenar un modelo propio que reproduzca el predictor de Equifax. Se midió en `C:\datos\ingresos\scripts\r5_7_destilacion_viabilidad.py` (salida en `C:\datos\ingresos\resultados\r5_7_destilacion.log`, fuera de git).

**Qué se midió.**
1. **El predictor de Equifax explica poco el ingreso validado.** En los 56.776 independientes la correlación de los logaritmos es 0,50 (0,59 en OK FACTURAR y condicionado) y el R² con una recalibración lineal es 0,25 (−0,04 tal cual, sin recalibrar). En OK FACTURAR la mediana de predictor sobre ingreso validado es 1,00: el analista anclaba el ingreso en el predictor, así que esa cercanía es en parte suya.
2. **Un modelo propio lo reproduce bien.** Con las variables del nivel 2, el R² contra el predictor es 0,79 (validación cruzada, 116.223 personas); dentro de ±10% queda el 43% y dentro de ±25% el 73%. Es parecido en cada régimen (0,78 a 0,80). Entrenado antes de abril y medido desde abril baja a 0,67.
3. **Pero imitarlo no ayuda a predecir el ingreso validado.** R² contra el ingreso validado:

| Entrada | Todos los independientes | OK FACTURAR y condicionado |
|---|---|---|
| Nivel 2 solo | 0,341 | 0,445 |
| Nivel 2 con el modelo que imita al predictor | 0,342 | 0,447 |
| Nivel 2 con el predictor de Equifax mismo | 0,349 | 0,469 (contaminado: el analista lo vio) |

**Conclusión.** Destilar no mejora la predicción del ingreso validado: lo que le suma el predictor de Equifax a las variables del buró es casi nada (0,008 de R² en todos), y el modelo que lo imita suma 0,001. **Serviría para independizarse del predictor de Equifax** (dejar de depender de su respuesta, su precio o su versión), no para estimar mejor el ingreso.

**Pregunta abierta al negocio:** qué quiere lograr con la destilación. Si es independizarse de Equifax, el modelo propio con las variables del buró ya lo logra con el ingreso validado y no hace falta imitar al predictor; si es reproducir su cifra, es posible con un R² de 0,79 y un error dentro de ±25% en el 73% de los casos.

### 12.29 Los datos de la persona: AWS contra lo que arma CrediScope desde Novadata (2026-10-28)

Cierra el punto 12 de 12.20 y el pendiente de 12.26 (la paridad de la edad, el sexo, el estado civil, la zona y el IESS «no se midió»). El negocio autorizó la consulta (2026-10-28, base legal «Contrato NovaCredit: cartera con crédito vigente»). **Todo lo que sigue son tasas y conteos; los datos de las personas quedan en `research/medida-persona/` (fuera de git).**

**Cómo se midió.** Muestra de 2.162 independientes de la tabla de AWS (sin las 448 cédulas de Aval), estratificada por año de consulta, con y sin RUC y respuesta comercial. Se consultó a Novadata con `consultar-lote.mjs` (20 en paralelo) y las variables se armaron con `variables-de-ingreso.ts` sin tocarlo, contra el crudo guardado, persona por persona. **El lote se cortó a pedido del negocio con 1.176 de 2.162 consultadas, y sólo 542 contestaron bien**: 553 recibieron HTTP 502 de Novadata (la saturación que el guion ya avisaba), 22 no contestaron en 120 s y 59 vinieron sin datos del Registro Civil. El guion los contó como «con perfil» y quedaron guardados sus perfiles con la respuesta incompleta; **hay que reconsultarlos con menos hilos** (en ese rango, a unos 11 perfiles por minuto con 20 hilos, la mitad falló). Las 542 son de 2023, 2024 y 2025 y **ninguna trae el SRI de Equifax en AWS** (el bloque existe desde diciembre de 2025): la mitad con ese bloque (consultas de 2026) no se alcanzó, así que lo que sigue **no mide la paridad del SRI de Novadata contra el de Equifax**. Corregido en 12.30: acá decía «ninguna tiene RUC», y Novadata da RUC para 512 de las 542 (la muestra se estratificó por tener el bloque del SRI en AWS, no por tener RUC).

**Dos cosas que cambian cómo se compara**: Novadata responde con la fecha de hoy y AWS con la de la consulta. La edad se calculó del nacimiento a la fecha de la consulta, y el IESS se recortó a los meses anteriores a ella.

| Variable | Coincide | Detalle |
|---|---|---|
| Edad (a la fecha de la consulta) | 540 de 542 (99,6%) | Los 2 restantes difieren en 1 año. Con la edad **de hoy**, que es la que guarda el perfil, sólo coincide 2 de 542 (30% a ±1): el perfil trae la edad al día de la consulta, no a la de AWS, y por eso un perfil viejo **no sirve para comparar** contra el entrenamiento con `identidad.edad`. En producción la consulta es de hoy y no hay diferencia |
| Sexo | 540 de 542 (99,6%) | Las mismas dos categorías; 2 cruzadas |
| Estado civil | 501 de 542 (92,4%) | Los 41 que no coinciden son corrimientos reales (soltero que Novadata ve casado: 17; casado que ve divorciado: 8; soltero que ve divorciado: 5; el resto, menos de 5 cada uno). «Unión libre» de Novadata es «unión de hecho» de AWS (2 de 3 coinciden): el mapeo es por nombre |
| Provincia de domicilio | 151 de 175 (86,3%) | **Novadata trae el lugar de domicilio sólo en 199 de 542 (36,7%)**; AWS lo trae en 461 |
| Cantón de domicilio | 124 de 175 (70,9%) | Igual que Equifax contra Equifax en 12.26 (88% y 75%): la zona de Novadata y la de AWS no son la misma dirección |
| Provincia y cantón de trabajo | **no se puede armar** | Novadata no trae el lugar de trabajo: sólo el de nacimiento (del titular, los padres, los hijos y los patronos, que no es el trabajo) y la provincia de la oficina de control del patrono. AWS trae `prov_trab` en 540 de 542 |
| Aporte del último mes (con la historia recortada a la consulta) | 83 de 99 (83,8%) | Sólo cuentan las 99 personas con aporte en AWS y en Novadata (±1 dólar). Los 16 que difieren se separan por más de un dólar. Sin recortar la historia coincide 39 de 99 (39,4%): el recorte es obligatorio |
| Número de empleos | 66 de 99 (66,7%) | AWS menos Novadata: 0 en 66, 1 en 10, 2 en 2, los 21 restantes difieren en más o en el otro sentido. Con el detalle de los 24 meses anteriores a la consulta, 64 de 99 |
| Meses con aporte | **0 de 99** | Novadata trae, hasta la consulta, entre 45 meses menos y 20 más que AWS (mediana 30 menos, y en 77% menos o igual): no es la misma cuenta. Con la tabla interna `tiess` coinciden 5 de 99 |

**El IESS tiene un problema de otra clase: quién trae dato.** De las 442 personas sin aporte en AWS (Equifax no lo trajo), **Novadata sí trae IESS anterior a la consulta en 244 (55%)**. De las 100 con aporte en AWS, a una sola le falta en Novadata. El modelo aprendió que «sin aporte» significa lo que AWS llama sin aporte, y el nivel 1 le entregaría el aporte de esas 244 personas, que nunca vio con ese valor. No es una diferencia de formato sino de población: el aporte y los meses de Novadata **no son el mismo dato** que el de AWS.

**Recomendación para el nivel 1** (lo que entra de la persona):

| Variable | Decisión | Por qué |
|---|---|---|
| Edad | **Entra** | 99,6%, y una vez calculada a la fecha de la consulta, sin desvío |
| Sexo | **Entra** | 99,6% |
| Estado civil | **No entra** | 92,4% con corrimientos hacia casado y divorciado; la robustez de 12.26 mostró que pesa poco |
| Provincia y cantón de domicilio | **No entran** | Novadata los trae en 37% y coinciden 86% y 71%; el modelo cubre peor con ellos vacíos (12.26) |
| Provincia y cantón de trabajo | **No entran** | Novadata no los trae |
| Aporte, meses con aporte y empleos | **No entran con el dato de Novadata tal como está** | Coinciden 84%, 0% y 67%, y la población con dato no es la misma (55% de los «sin aporte» de AWS tienen IESS en Novadata). Entran sólo si se reentrena con el IESS de Novadata |
| SRI de Novadata | **Sin medir contra Equifax** | La muestra no trae el SRI de Equifax (es de 2023 a 2025); la paridad sigue como en 12.24. Novadata sí da RUC para 512 de 542 (12.30) |

La candidata de la sesión de entrenamiento (edad, sexo, IESS y SRI, sin zona ni estado civil) **se confirma salvo el IESS**: el aporte, los meses y los empleos no pueden entrar con el dato de Novadata sin reentrenar.

**Lo que queda abierto:**
1. Completar el lote (1.620 sin respuesta buena: 986 sin consultar y 634 con error o sin datos) con menos hilos, en especial la mitad con RUC de 2026.
2. Decidir el IESS: reentrenar el nivel 1 con el IESS de Novadata de personas consultadas en CrediScope (ahí la población es la de producción), o dejarlo fuera.
3. Si el negocio quiere la zona, el domicilio de Novadata cubre 37%: se necesitaría otra fuente.
4. Revisar los perfiles con la respuesta incompleta que dejó el 502 (553 personas) cuando se reconsulten.
5. El módulo de variables no cambió: tal como está, `meses_aporte` usa todos los meses de Novadata y debería recortarse a la consulta si se compara contra el entrenamiento.

### 12.30 El nivel 1 con la edad, el sexo y el SRI, y la prueba en sombra con el perfil de CrediScope (2026-10-29)

**La decisión.** El negocio decidió el 2026-10-29 que el nivel 1 es la edad, el sexo y el SRI de Novadata (`sri_ruc`, `sri_estado`, `sri_obligado`, `sri_antig` y `sri_susp`), sin estado civil, zona ni IESS: la recomendación de 12.26 y 12.29.
**La fecha de la consulta (`anio_mes`) se queda**: no sale de una fuente sino del reloj del servidor, así que no tiene problema de paridad, y es lo que hace que el modelo no extrapole más allá del último mes entrenado (especificación, sección 7). Medido abajo: en la validación cruzada no suma (sin ella el R² es 0,001 mayor) y hacia adelante suma 0,003 de R² (0,001 a 0,006) y 0,007 en OK FACTURAR.
Se cambió `NIVELES[1]` en `scripts/predictor-ingresos/comun.py` y se corrieron `entrenar.py --nivel=1`, `medir.py`, `exportar.py --nivel=1` y `calibrar.py`. El nivel 2 no se tocó: `medir.py` vuelve a cotejar 264 números de 12.24 sin diferencias y el modelo guardado de cada nivel predice igual que el entrenado dentro de `medir.py` (diferencia 0).
Sin datos de personas en el repositorio: las tablas por persona quedaron en `C:\datos\ingresos\resultados\predictor-ingresos\` y `research\medida-persona\`, y los modelos anteriores del nivel 1, en `C:\datos\ingresos\modelos\anterior-nivel1-2026-10-22\`.

**El nivel 1 nuevo contra el anterior** (21.260 independientes de 2026; hacia adelante, entrenado hasta junio con 12.604 y probado de julio a octubre con 8.656; intervalo del 95% entre paréntesis; entre corchetes, OK FACTURAR y condicionado, 3.538 y 1.613):

| Variables del nivel 1 | R² (cruzada) | R² hacia adelante | El real supera el mínimo del 90%, hacia adelante | Del 85%, hacia adelante | Mediana del mínimo del 90%, hacia adelante | Certifica «al menos 2.000», hacia adelante (% y precisión) |
|---|---|---|---|---|---|---|
| Anterior: estado civil, zona e IESS de AWS (16) | 0,172 (0,157 a 0,188) [0,098] | 0,187 (0,162 a 0,215) [0,125] | 88,1% (87,4 a 88,8) [94,9%] | 83,4% (82,6 a 84,1) [91,9%] | 1.029 [1.152] | 4,5% y 93,8% [8,7% y 95,7%] |
| **Edad, sexo, fecha y SRI de Novadata (8; el vigente)** | **0,157 (0,143 a 0,172) [0,074]** | **0,175 (0,149 a 0,202) [0,106]** | **89,1% (88,5 a 89,8) [95,7%]** | **84,8% (84,0 a 85,5) [93,0%]** | 1.021 [1.158] | 3,5% y 95,1% [7,1% y 96,5%] |
| Sin el obligado a llevar contabilidad (7) | 0,130 (0,118 a 0,142) [0,016] | 0,136 (0,117 a 0,156) [0,010] | 89,0% (88,4 a 89,7) [96,2%] | 84,4% (83,6 a 85,2) [93,0%] | 1.034 [1.163] | 0,0% [0,0%] |
| Sin la fecha de la consulta (7) | 0,158 (0,144 a 0,173) [0,078] | 0,172 (0,146 a 0,199) [0,099] | 89,2% (88,6 a 89,9) [95,8%] | 84,5% (83,7 a 85,3) [92,3%] | 1.022 [1.142] | 3,5% y 95,4% [6,9% y 96,4%] |

En la validación cruzada la cobertura del nivel nuevo es 89,1% y 84,2% (95,6% y 92,2% en OK FACTURAR), contra 88,9% y 83,9% del anterior; el tramo exacto, 36,2% contra 36,9%, y el valor central a ±10%, 11,7% contra 11,8%.

- **Pierde poco R² y cubre mejor.** Contra el anterior, el R² baja 0,015 en la validación cruzada (0,011 a 0,020) y 0,012 hacia adelante (0,005 a 0,019); en OK FACTURAR, 0,024 (0,011 a 0,038) y 0,018 (−0,003 a 0,038, no se distingue de cero). Es la suma de lo que 12.26 midió por partes: la zona y los datos de la persona pesaban 0,011, y el resto es el IESS.
  Hacia adelante el mínimo del 90% cubre **89,1%** contra 88,1% y el del 85%, 84,8% contra 83,4%; en OK FACTURAR, 95,7% y 93,0% contra 94,9% y 91,9%. **Quien no tiene RUC sube de 85,1% a 87,4%** (786 casos; 84,7 a 89,5), el grupo que peor cubría en 12.26. La mediana del mínimo casi no cambia (1.021 contra 1.029) y «al menos 2.000» se certifica en menos casos (3,5% contra 4,5%) con más precisión (95,1% contra 93,8%).
- **`sri_obligado` no se puede sacar.** Sin él el R² baja 0,027 en la cruzada (0,022 a 0,033) y 0,040 hacia adelante (0,030 a 0,050), en OK FACTURAR queda en 0,016 y 0,010, y el modelo no certifica «al menos 2.000» a nadie: la cobertura no cambia, lo que se pierde es distinguir a las personas. Los obligados son el 3,5% de los independientes y ganan mucho más que el resto (en la prueba en sombra de abajo, mediana de 9.000 contra 2.384).
  El perfil de CrediScope no lo guarda (punto 18.5 de `docs/pendientes.md`); en el crudo de Novadata está en `datosContribuyente.obligado` como «SI», «NO» o «N» (en las 542 de abajo: 20, 466 y 26; vacío en las 30 sin RUC). Se le planteó al negocio leerlo del crudo, sumarlo al perfil o entrenar sin él, y **decidió sumarlo al perfil**: pide una estructura nueva (estructura-v15), recalcular los perfiles guardados y una versión nueva del marco, porque el modelo de lenguaje lee `laboral` entero.
  Queda como trabajo aparte; mientras tanto `variables-de-ingreso.ts` lo recibe de quien llama (`obligadoAContabilidad`) y, si no llega, lo deja sin dato y pendiente. Su paridad con el obligado de Equifax sigue sin medirse.
- **Calibración conforme del nivel nuevo** (`calibrar.py`, la cruzada en logaritmo, hacia adelante): de 89,1% a **90,4%** (89,8 a 91,1) y el del 85%, de 84,8% a 85,8%, con un corrimiento de 0,040 (el anterior pedía 0,056) que baja la mediana del mínimo 3,9% (de 1.021 a 981; antes 5,5%). Calibrando con mayo y junio el corrimiento es 0 y la cobertura queda en 89,3%. El nivel 2 queda como en 12.26.
- **Exportación**: `ingreso-v1-nivel1.json.gz` pesa 0,53 MB (antes 0,60; 28.560 divisiones y 30.600 hojas, como antes). El evaluador de referencia coincide con LightGBM a 2e-14 en 4.020 entradas inventadas, los 200 casos de oro se regeneraron, y la prueba de oro de `_shared/predictor-ingresos.ts` con el modelo real da diferencia 0 en los 200 casos de cada nivel. La versión sigue siendo `ingreso-v1`: nada está desplegado.
- **El módulo de variables** (`variables-de-ingreso.ts`): `VARIABLES_DEL_NIVEL_1` pasa a las 8 del modelo, en su orden, y el nivel 1 ya no arma el estado civil, la zona ni el IESS (el 2 sí). El sexo pasa por un mapeo medido (`sexoParaIngreso`): Novadata usa las mismas dos categorías que AWS y coinciden en 540 de 542 (12.29); otra categoría queda sin dato.
  Sin ese mapeo el sexo llegaba siempre vacío, cosa que el modelo no vio nunca (AWS lo trae completo). `MAPEO_PENDIENTE` pasa a ser `MAPEO_DE_NOVADATA`: el estado civil, la provincia y el cantón siguen sin mapeo, y solo los usa el nivel 2.

**La prueba en sombra** (`scripts/sombra-predictor-ingresos.mjs` arma y evalúa; `scripts/predictor-ingresos/medir_sombra.py` mide). Para las 542 personas de 12.29 con respuesta buena de Novadata, las variables se armaron con `variables-de-ingreso.ts` desde el perfil que guardó CrediScope (leído de `client_profiles`; ninguna consulta a una fuente ni al modelo de lenguaje) y se evaluaron con `predictor-ingresos.ts` y el modelo exportado: lo que serviría la función.
Se comparan con su ingreso validado de AWS. Quedan **532**, con el ingreso no verificado entre 0 y 60.000 como el entrenamiento (9 tienen 0 y una pasa de 60.000). Consultas de AWS de 2023 a 2025: ninguna está en el entrenamiento, que es de 2026.
**Estas personas sí tienen RUC** (corrige 12.29): ninguna trae el SRI de Equifax en AWS, pero Novadata da RUC para 502 de las 532, así que la prueba ejercita el SRI de Novadata; lo que no puede medir es su paridad con el de Equifax. Tres maneras de servirlas, porque Novadata contestó el 2026-10-28 y el ingreso es de la fecha de la consulta de AWS:

| Manera (532 personas; entre corchetes, las 82 de OK FACTURAR y condicionado) | R² | El real supera el mínimo del 90% | Del 85% | Tramo exacto | Valor central a ±10% | Mediana del mínimo del 90% | Certifica «al menos 2.000» |
|---|---|---|---|---|---|---|---|
| A la fecha de la consulta de AWS (edad y reloj), con el obligado del crudo | 0,187 (0,088 a 0,268) | **89,1% (86,5 a 91,7)** [93,9%] | **85,0% (82,1 a 88,0)** [92,7%] | 37,6% (33,5 a 41,2) | 11,5% | 1.056 | 3,0%: 16 personas, 14 aciertos |
| Igual, sin el obligado (lo que da el perfil de hoy) | 0,167 (0,110 a 0,219) | 89,1% (86,5 a 91,7) [93,9%] | 85,0% (82,0 a 87,8) [92,7%] | 37,2% (33,3 a 41,0) | 9,8% | 1.056 | ninguna |
| El perfil guardado tal cual, con el reloj del 2026-10-28 | 0,145 (0,091 a 0,194) | 87,2% (84,2 a 89,8) [92,7%] | 82,3% (79,3 a 85,3) [90,2%] | 36,5% (32,3 a 40,2) | 10,9% | 1.095 | ninguna |
| Referencia: el mismo modelo hacia adelante en AWS (8.656) | 0,175 | 89,1% [95,7%] | 84,8% [93,0%] | 36,4% | 11,0% | 1.021 | 3,5%, precisión 95,1% |

- **Con las entradas de producción el mínimo cubre lo mismo que con el extracto de AWS**: 89,1% contra 89,1% hacia adelante, y el del 85%, 85,0% contra 84,8%. El R² (0,187, con un intervalo ancho), el tramo exacto (37,6%) y el valor central quedan donde estaban: el error mediano del valor central es de 0,47 en logaritmo (un factor de 1,6) y su mediana sobre el real, 1,03.
  Por respuesta: OK FACTURAR y condicionado 93,9% (82), rechazados 68,0% (125; en AWS hacia adelante, 73,0%) y las demás respuestas 96,0% (325). Los tramos: el más probable es «940 a 1.999» o «5.000 o más», como en AWS; de los 109 que ganan 5.000 o más, 75 caen en su tramo.
- **El obligado decide la certificación**: sin él la cobertura es la misma y nadie se certifica «al menos 2.000»; con él se certifican 16 y 14 lo superan. En los 19 obligados de la muestra la mediana del mínimo del 90% pasa de 1.264 a 2.986 (su ingreso mediano es 9.000).
- **«Hoy» cubre dos puntos menos** (87,2%) porque el perfil guarda la edad del día de la consulta a Novadata, y el reloj pone la fecha y la antigüedad del RUC de hoy, contra un ingreso de uno a tres años antes. En producción la consulta y la estimación son del mismo día; la fila mide lo que pasa con un perfil viejo, y dice que el predictor debe servirse con una consulta vigente.
- **Lo que esta prueba no mide.** (1) La paridad del SRI de Novadata con el de Equifax: no hay SRI de Equifax de 2023 a 2025. (2) Novadata contesta con el RUC de hoy: 3 personas lo abrieron después de su consulta y 29 lo suspendieron después, estados que el modelo ve y que no tenían; sin ellas (470 con el RUC que ya existía y no cambió), 88,9% (86,2 a 91,7).
  (3) El ingreso es de 2023 a 2025 y el modelo, de 2026: por año cubre 86,3% (2023, 182 personas), 98,4% (2024, 124) y 86,3% (2025, 226). (4) La muestra se estratificó por año y respuesta, así que «todas» no tiene la mezcla de la población. (5) Las 30 sin RUC cubren 90,0% (76,7 a 100): son muy pocas para decir algo.
- **Las entradas, contra el entrenamiento**: edad mediana 37 y 37; masculino 56,4% y 59,4%; con RUC 94,4% y 87,3%; RUC activo 85,3% y 80,8%; con años de suspendido 26,1% y 27,0%; antigüedad mediana del RUC 8,8 y 10,0 años; obligado 3,6% y 3,5%; ingreso validado mediano 2.384 y 2.169.

**Lo que queda abierto.**
1. El obligado en el perfil (estructura-v15, recálculo de los perfiles guardados y versión nueva del marco) y su paridad con el de Equifax. Hecho en 12.31 salvo el recálculo, y sin versión nueva del marco.
2. Completar el lote de paridad (decisión del 2026-10-29: queda para después): la mitad con el SRI de Equifax en AWS (2026) es la única que mide el SRI de Novadata contra el de Equifax, y con ella la prueba en sombra se repite tal cual (`node scripts/sombra-predictor-ingresos.mjs` y `medir_sombra.py`).
3. El nivel 2 sigue con el estado civil, la zona y el IESS del extracto de AWS: se decide al reentrenarlo desde las respuestas crudas de Equifax (punto 18.4 de `docs/pendientes.md`). En 12.26 sacarlos le costaba 0,004 de R².

### 12.31 El obligado a llevar contabilidad en el perfil (estructura-v15, 2026-10-29)

**Qué se hizo.** El perfil guarda `laboral.obligadoALlevarContabilidadRuc`, del mismo RUC de referencia que las fechas, y `variables-de-ingreso.ts` lo lee de ahí para `sri_obligado`; la opción `obligadoAContabilidad` queda para las pruebas y la sombra. La lectura es una sola, `obligadoALlevarContabilidad()` de `ruc.ts`: «SI» y «S» son sí, «NO» y «N» son no, y sin RUC o con otro valor no hay dato (no es «no»).
En el crudo del 2026-10-03 (2.567 personas) vienen «NO» 2.063, «SI» 128, «N» 106 y **«S» 4**, una abreviatura que 12.30 no había visto en las 542; en el lote de paridad entero (1.176 crudos) hay 15. Que la «S» es «sí» lo decidió el negocio el 2026-10-29, como el «ABI» de los establecimientos (estructura-v13). «Tiene RUC» es lo mismo que para el estado de la actividad: 5 registros traen el RUC, el inicio y «N» sin fecha de inscripción, y como el nivel 1 les pone `sri_ruc = 1`, el obligado viene también.

**Paridad con Equifax** (punto 7 de la sección 9 de la especificación), en las 87 personas de la base con una consulta de producción de Equifax con el bloque del SRI y un perfil de Novadata, con el crudo de su último perfil (13 días de mediana entre una consulta y la otra):

| Equifax \ Novadata | Obligado | No obligado | Sin RUC |
|---|---|---|---|
| Obligado | 23 | 0 | 0 |
| No obligado | 0 | 60 (56 «NO» y 4 «N») | 0 |
| Sin RUC | 0 | 0 | 4 |

Coincide en las 83 con RUC. Ninguna trae «S»: esa lectura sigue sin cotejar contra Equifax.

**El modelo de lenguaje no lo lee** (decisión del negocio del 2026-10-29). Ya le llegaba el obligado, interpretado, en `fuentesIngreso` (el indicio de ingreso mayor y `tamanoDelNegocio.obligadoContabilidad`, con el marco diciendo que es escala y no ingreso), y en `laboral` sería el mismo dato dos veces. `perfil-del-modelo.ts` lo saca (`CAMPOS_DEL_PREDICTOR_QUE_NO_LLEGAN`, dentro de `RUTAS_QUE_NO_LLEGAN`, que miden `auditar-seguridad.mjs` y `validar-perfil-del-modelo.mjs`).
Con el código viejo y el nuevo, el mensaje al modelo de las 2.567 personas del crudo del 2026-10-03 es idéntico byte a byte: **no hay versión nueva del marco**, al revés de lo que preveía 12.30. Lo que sí difiere: `fuentes-ingreso.ts` reconoce sólo «SI», así que en las 4 con «S» el modelo y la pantalla no ven el indicio (queda en `docs/pendientes.md`).

**Efecto en el perfil**: código viejo contra nuevo, perfil entero, en las 2.567: cambia sólo el campo nuevo (2.169 no, 132 sí, 266 sin dato), nada más.

**La prueba en sombra, repetida**: los perfiles guardados siguen en estructura-v14 hasta recalcularlos, así que «a la consulta» todavía no trae el obligado (0 de 542 perfiles con el campo). «Con el obligado» ya lo toma de `process.ts` (antes el guion tenía su propia copia) y da lo mismo que en 12.30: R² 0,187, el real supera el mínimo del 90% el 89,1% (86,5 a 91,7) y se certifica «al menos 2.000» a 16, con 14 aciertos.
Al recalcular, «a la consulta» tiene que dar lo mismo que «con el obligado»: el guion cuenta los perfiles con el campo y cuántos difieren del crudo.

**Lo que queda.** Desplegar y después recalcular los perfiles guardados (`recalcular-grupos.mjs --grupos=laboral`), en ese orden: un perfil en v15 leído por el código desplegado de hoy le pasaría el campo al modelo con el rótulo marco-v30. Y repetir la sombra.

## 13. Registro de verificación

Censo 2022 (2026-10-17): página de datos, diccionarios de cantón, sector y manzana,
cuestionario censal y guía de usuario, todos leídos; los pesos de los archivos
salen de los encabezados del servidor, las bases no se descargaron.

Nuevos en la actualización: ENEMDU diciembre 2025 y primer trimestre de 2025
(resumen del buscador; no se abrió el informe), informe de rendición de cuentas
del Ministerio de Trabajo (resumen), «Distribution Calibration for Regression»
(arXiv 1905.06023, resumen), trabajo del Censo de EE. UU. sobre ingresos con tope
(resumen). El SBU 2026 de USD 482 sale de `fuentes-ingreso.ts` (leído). El
estudio del INEC citado por el negocio (90% bajo USD 2.000): **no encontrado**.

| Enlace | Estado |
|---|---|
| EPN 4.1 `…/25047/1/CD 13839.pdf` | Abrió (descarga directa; el sitio falla la validación del certificado en algunos clientes). Leído |
| EPN 4.2 `…/25673/1/CD 14323.pdf` | Abrió. Leído |
| EPN 4.3 `…/24399/1/CD 13320.pdf` | Abrió. Leído |
| UIS `noesis.uis.edu.co/…/download` | Abrió. Resumen leído |
| Equifax IncomeView+ (blog) | Abrió. Leído |
| TransUnion CreditVision (dos fichas) | 403 en la descarga automática; contenido por la ficha del buscador. Resumen |
| Serasa Renda 4.0 | Abrió. Leído |
| Belvo Income Estimator | Abrió. Leído |
| Artículo de IncomeView (DOI 10.3233/MAS-180442) | 403: **no verificado** |
| Tutorial de XGBoost AFT / arXiv 2006.04920 | Tutorial por buscador. Resumen |
| Grabit arXiv 1711.08695 | Abrió el resumen. Leído |
| Candès, Lei y Ren arXiv 2103.09763 | Buscador. Resumen |
| `grf`, ADAPT, `cleanlab`, Snorkel, PPI, Hinton, Tramèr | Buscador. Resumen |
| Fannie Mae B3-6-05 | Abrió. Leído |
| Ambrose y otros (JF 2016) | Buscador. Resumen |
| Guía del Banco Mundial (SAE) | Descarga y lectura (unstats). Leído |
| Rimisp, mapas de pobreza | Abrió. Leído |
| ELL (Econometrica 2003) | Buscador. Resumen |
| `emdi` (JSS) | Buscador. Resumen |
| ENEMDU anual 2024 | Abrió. Leído |
| Estratificación INEC | Abrió. Leído |
| J-PAL (Togo) | Abrió. Leído |
| Chi y otros (PNAS, RWI) | Buscador; la página de Meta no entregó licencia ni cobertura: no confirmadas |
| Shimodaira (2000), Tobin, Heckman, Powell | Citados de memoria, **sin enlace verificado** |
