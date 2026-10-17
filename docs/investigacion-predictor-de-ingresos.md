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
independiente aporta al IESS sobre una base elegida, con mínimo en el SBU: lo que
vemos es **un valor por debajo o igual del ingreso**, no el ingreso. En
estadística eso es un dato **censurado por la derecha** (el valor real es
«al menos x»). El dependiente tiene el problema contrario y más leve: el
empleador puede subdeclarar. El tratamiento correcto no es descartar a los
independientes ni tomar el aporte como valor, sino entrenar con **rangos**.

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
   - **Pérdida**: cuantiles, o `survival:aft` con rangos (4.8) para tratar el aporte
     de los autoafiliados como `[aporte, ∞)` en vez de descartarlos o tomarlos como
     valor.
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

Ver la respuesta del chat del 2026-10-17. Resumen: Python 3.12 o 3.13 con
`winget`, un entorno virtual **fuera** del repositorio, y `pandas`, `pyarrow`,
`duckdb`, `numpy`, `scikit-learn`, `lightgbm`, `xgboost`, `statsmodels` y
`matplotlib`. Los datos (3,9 millones y 120.000) quedan en una carpeta fuera de
`C:\Users\hugop\siint`.

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

## 12. Registro de verificación

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
