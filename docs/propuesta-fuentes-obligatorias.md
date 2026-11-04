# Propuesta: fuentes obligatorias y secundarias

Propuesta del 2026-10-31 para que decida el negocio. **No cambia nada del producto.** Se midió
sin consultar a nadie y sin gastar modelo: `client_profiles.estado_por_fuente` de 6.519 perfiles
reales y los crudos de `research/`. Sólo conteos; un caso se cita como `c-xxxxxxxx`. Parte de `main`
en `5456b55`.

**Mientras se medía entró el PR 104**, y ya está en producción (sello `5456b5583ca8`): el modelo no
corre sin 5 fuentes (`FUENTES_QUE_DECIDEN`, decisión del negocio del 2026-10-31). Por eso esta
propuesta no dice «poner un freno»: mide ese freno y dice qué le falta.

## 0. En corto

1. **El freno de hoy alcanza para una caída como la actual.** Frena 671 de los 704 perfiles que
   frenaría la lista completa desde el 28/10, y `c-79e1ac23` ya no llegaría al modelo.
2. **Lo que le falta son los bloqueos y parte de la deuda.** No mira lista negra, listas de control,
   demandas ni denuncias. Si contestaran sólo sus 5 fuentes, se perderían 68 de los 73 bloqueos y el
   modelo correría igual.
3. **Recomiendo pasar de 5 a 21 obligatorias, más un segundo nivel de 8.** Con las 21 completas,
   aunque caigan todas las demás, no cambia ningún bloqueo, ingreso, segmento ni cuota en las 2.566
   personas medidas. El costo es chico: en un día sano 67 de 2.567 consultas (2,6%) piden reconsultar,
   casi todas por fallas reales de denuncias. En la falla, de 55,1% a 57,8%.
4. **«No hay registros» no se puede leer del estado `faltante`.** Ahí caen también errores de la
   propia fuente: el 03/10, un día sin ningún error marcado, 62 personas figuraban sin denuncias por
   una falla, y 15 de ellas tenían denuncias ocho días antes. El modelo lo leyó como un hecho.
5. **Proveedor_Info_1 no falla por fuente.** Son dos servicios: uno no falló nunca en 6.519 perfiles, y el
   otro cae en bloque, por mitades exactas. **Equifax cubre justo lo que no se cae**: Plus no rescata
   ninguna consulta (0 de 6.519).
6. **Hay una falla que ninguna lista ve**: una fuente que deja de traer contenido sin dar error.
   `licenciaConducir` pasó de 84% a 1% en personas comparables. Necesita un control aparte.
7. **Ampliar la lista no toca el mensaje al modelo**: sin versión nueva del marco. Contarle al modelo
   las fallas escondidas sí la pide, y conviene llevarlo en la versión del predictor.
8. **No se pudo medir cuánto mueve el score una consulta incompleta**: hay un solo análisis sobre un
   perfil roto, sin par bueno. Medirlo cuesta unos USD 5 con el modelo (sección 11).

## 1. Decisiones para el negocio

| # | Qué hay que decidir | Opciones | Recomiendo | Por qué |
|---|---|---|---|---|
| 1 | Qué fuentes son obligatorias | a) las 5 de hoy; b) 10: esas más los temas críticos de la API; c) 15; d) 21 | **d** | Es la única que no pierde nada si cae el resto, y cuesta casi lo mismo que 10 (sección 4) |
| 2 | Cuándo una obligatoria «contestó» | a) `faltante` cuenta como contestó; b) no cuenta, salvo renta y antecedentes | **b** | El freno ya lo lee así. Renta y antecedentes fallan siempre en las mismas personas: frenarlas sería para siempre (sección 6) |
| 3 | Un segundo nivel para 8 secundarias de peso | a) no; b) se analiza, y la entrega es `parcial`: nunca «aprobar» | **b** | Es la regla D6 que ya existe. Hoy `TEMAS_CRITICOS` y `FUENTES_QUE_DECIDEN` son dos listas que se contradicen |
| 4 | Persona cuya falla no se va (6 de 2.567, 0,2%) | a) sin score y revisión manual; b) un administrador autoriza con motivo | **a** por ahora | Son casos de lista negra e identidad: mejor un humano que un score sin esos datos. Se revisa con la respuesta de Proveedor_Info_1 |
| 5 | Un bloqueo encontrado en una consulta incompleta | a) frena igual; b) niega por control, sin modelo | **b** | Un hallazgo en una lista es un hecho, aunque falte otra fuente |
| 6 | Reintentos | a) dejarlos como están; b) ampliar la evaluación diferida | **b** | Hoy se rinde a los 18 minutos con un plazo de 24 horas (sección 8) |
| 7 | Lotes de consulta | a) una incompleta cuenta como hecha; b) vuelve a la cola | **b** | Así se contaron como buenas 553 consultas del 28/10 |
| 8 | Código de la API | a) `fuentes_no_disponibles` con los temas que faltan; b) un código nuevo | **a** | Lo que hace la institución es lo mismo: reintentar más tarde |
| 9 | Análisis ya hechos | a) dejarlos; b) marcarlos y no borrarlos; c) reanalizarlos ya | **b** | 1 sobre una consulta rota y 11 con un «no hay» falso. Se reconsultan cuando vuelva Proveedor_Info_1 |
| 10 | Lista por institución | a) una sola; b) cada una la suya; c) una sola, y cada una puede sumar, nunca quitar | **c**, sin construir hasta que alguien lo pida | Hoy hay una sola base (sección 9) |
| 11 | Decirle al modelo que esas fuentes fallaron | a) ahora; b) con la versión del marco del predictor | **b** | Cambia el mensaje de casi todas las personas y pide versión nueva (sección 10) |
| 12 | Control de contenido por fuente | a) no; b) sólo aviso; c) aviso y freno | **b** | La medida sale de un día y una población: primero ver si alarma en falso |
| 13 | Nombre en pantalla | a) «Consulta incompleta»; b) «Datos incompletos»; c) «Falta información» | **a** | Es lo que ya dice el mensaje del freno. En la bandeja hoy esas personas figuran «Sin analizar» |
| 14 | Prueba con el modelo | a) no; b) 120 pedidos, USD 2,1; c) 280 pedidos, USD 5,0 | **c** en noviembre | Octubre lleva USD 9,97 de 10 (sección 11) |

## 2. Qué frena hoy, camino por camino

Con el PR 104 casi todos los caminos pasan por el mismo punto: `analizarPersona()` lanza
`ConsultaIncompleta`. **Cambiar la lista es tocar una tabla en `calidad-de-la-consulta.ts`.**

| Camino | Qué pasa hoy | Qué falta |
|---|---|---|
| Pantalla, «Análisis con IA» | La función contesta 409 y la pantalla sólo ofrece «Reconsultar y analizar» | La lista |
| Solicitud (`evaluar-solicitud`) | Corta en el paso del perfil, antes del buró que se cobra, y no reutiliza un perfil incompleto | La lista |
| API (`procesar-evaluaciones`) | Igual, con `fuentes_no_disponibles`, y reintenta | Los reintentos de la diferida (sección 8) |
| Consulta en lote (`procesar-lote`, `consultar-lote.mjs`) | No llama al modelo, pero una incompleta queda `ok` | Decisión 7 |
| Análisis en lote (`analizar-en-lote.mjs`) | `preparar` no elige incompletos | La lista |
| `comparar-razonamiento.mjs` | Sin freno, a propósito: compara configuraciones y no es un análisis | Nada |
| Vigía | Le manda «ok» al modelo, sin datos de personas | Nada |

**Un hueco del freno:** `esPrueba` lo saltea, y viene en el cuerpo de `analyze-client`. El vigía no lo
usa y la pantalla no lo manda, pero cualquier sesión de analista puede mandarlo y dejar guardado un
score sobre un perfil incompleto. Propongo que sólo lo acepte un guion con su clave.

**Hoy conviven dos listas que no coinciden.** `FUENTES_QUE_DECIDEN` frena y `TEMAS_CRITICOS` sólo
impide «aprobar» en la API. Si falla la lista de sanciones, el modelo corre: la API entrega «revisar» y
la pantalla, lo que haya dicho el modelo. Y las dos leen `faltante` distinto: la primera lo toma como
falla y la segunda como respuesta.

## 3. Lo medido que cambia la decisión

### 3.1 Proveedor_Info_1 son dos servicios, y uno cae por mitades

| Servicio | Fuentes activas | Qué pasó |
|---|---|---|
| `api/consultas` | 5: RUC, establecimientos, bancos, cooperativas y Diners | **0 errores y 0 faltantes en 6.519 perfiles** |
| `data-services` | 44: todas las demás | Entre 46,6% y 49,6% de error en cada una desde el 28/10, contra menos de 1% antes |

Dentro de `data-services` ninguna fuente es más confiable que otra, porque caen juntas:

| Qué pasó con los 44 pedidos | 25/09 | 03/10 | 28/10 |
|---|---:|---:|---:|
| Sana | 2.226 | 2.567 | 496 |
| Todos con error | 24 | 0 | 475 |
| Mitad con error | 0 | 0 | 41 |
| Mitad con error y la otra mitad con un «no hay» falso | 1 | 0 | 135 |
| Todos con un «no hay» falso | 94 | 0 | 0 |
| Mitad con un «no hay» falso | 39 | 0 | 0 |
| Otras formas | 183 | 0 | 29 |
| **Total** | **2.567** | **2.567** | **1.176** |

Las dos mitades son exactamente los pedidos pares e impares de la lista, en los 44 pedidos. Lo que
mejor lo explica es que Proveedor_Info_1 reparte los pedidos por turnos entre dos servidores y uno cae. **Es
una deducción: falta que Proveedor_Info_1 la confirme.** De ahí salen dos reglas:

- **Una lista larga no frena más en una caída.** Lo que la detecta es tener fuentes de las dos mitades.
  Las 5 de hoy las tienen, y por eso aguantan.
- **Lo que distingue a una lista es lo que pasa cuando falla una sola fuente.**

`c-79e1ac23` tiene otra forma: HTTP 500 en 41 de 44, igual en sus tres consultas, con SERCOP, renta e
impedimentos contestando. Es la única evidencia posterior al 28/10: 3 perfiles de una persona. Que sea
general lo confirmó el negocio; la base no alcanza para medirlo.

### 3.2 «No hay registros» y «no contestó»

`faltante` junta tres cosas muy distintas, y hoy todo llega al modelo como «tema consultado»:

| Qué es en realidad | Cómo se reconoce | Cuánto |
|---|---|---|
| **No hay registros, de verdad** | Fuentes que siempre contestan así | El 03/10: `impedimentoCargosPublicos` 80,9%, renta 54,5%, SERCOP 48,1%, vehículos 29,7% |
| **Caída disfrazada** | Fuentes que el 03/10 no dan `faltante` nunca, y en una caída sí | 209 perfiles con identidad en `faltante`: 149 el 25/09 y 59 el 28/10 |
| **La fuente falló y lo dice en un mensaje** | `estado.codigo` de error en un HTTP 200 | El 03/10, con cero errores marcados: afiliación al IESS 94,7%, multas ANT 26,2%, inversiones 11,5%, renta 9,9%, antecedentes 7,4%, títulos 4,7%, SERCOP 4,5%, denuncias 2,4% |

Los mensajes son como «Error en respuesta de la fuente 500 INTERNAL_SERVER_ERROR» o «ERROR EN LA
EXTRACCION DE DATOS». `estado_por_fuente` guarda `faltante` sin el mensaje: sólo el crudo lo conserva.

Comparando persona por persona el 25/09 con el 03/10 aparecen dos comportamientos:

| Fuente con mensaje de falla el 03/10 | Personas | También falló el 25/09 | El 25/09 contestó bien |
|---|---:|---:|---:|
| Denuncias | 62 | 2 | **55** |
| Multas ANT | 673 | 231 | 388 |
| Afiliación al IESS | 2.431 | 2.290 | 0 |
| Renta | 254 | 251 | 0 |
| Inversiones | 296 | 270 | 10 |
| Antecedentes | 190 | 181 | 0 |
| Títulos | 121 | 105 | 0 |

- **Denuncias falla por momentos, y reconsultar lo arregla.** De las 38 reconsultas dentro de las 24
  horas, 36 salieron bien. Mientras tanto, «no tiene denuncias» puede ser falso: de esas 62 personas, 15
  tenían denuncias el 25/09 y 40 contestaron vacío.
- **Afiliación, renta, antecedentes y títulos fallan siempre en las mismas personas.** Reconsultar no
  lo arregla, y una de esas fuentes no puede frenar sin dejar a esa persona afuera para siempre.

### 3.3 La falla que ninguna lista ve

Una fuente puede seguir contestando y dejar de traer contenido. Comparación entre independientes sin
ningún error, para sostener la población: 1.019 del 03/10 contra 349 del 28/10.

| Fuente | Con contenido el 03/10 | El 28/10 |
|---|---:|---:|
| `inversiones` | 23,1% | 0,0% |
| `licenciaConducir` | 84,0% | 1,1% |
| `impedimentoCargosPublicos` | 19,3% | 1,4% |
| `cumplimientoPatronal` | 28,7% | 3,7% |
| `deudasEmov` | 97,4% | 22,1% |
| `sriImpuestoRenta` | 42,0% | 11,7% |
| `titulos` | 39,0% | 11,2% |
| `denuncias` | 30,2% | 11,2% |
| *Para comparar:* `demandas` | 49,2% | 49,9% |
| *Para comparar:* `vehiculos` | 71,9% | 72,8% |
| *Para comparar:* `antecedentesPenales` | 94,8% | 95,7% |

Una sola consulta no puede ver esto: cada una se ve normal. Hace falta comparar la tasa de contenido
de cada fuente contra su historia (decisión 12). Con un umbral de la mitad, el 28/10 habría avisado por
estas 8 de las 24 fuentes comparadas, y por ninguna de las de control. Entre ellas están `denuncias` y la
renta, obligatorias en esta propuesta: **que una obligatoria deje de traer contenido sin dar error no lo
ve ningún freno.**

`basesInternas` también bajó, de 99,9% a 72,8%, y **no se pudo explicar**: las 116 respuestas vacías
coinciden con el mecanizado vacío, así que pueden ser personas sin historia, pero 36 de ellas sí
traen algo en `trabajoHistoricos`.

### 3.4 `fuentes_ok` no mide la completitud

La mediana de 19 fuentes buenas de 52 parece una falla y no lo es: el 03/10, sin un solo error, la
mediana fue 21 (de 6 a 32), porque casi todas las fuentes no tienen nada que decir de cada persona.
`elPerfilSirve()` deja pasar 1.070 de los 1.076 perfiles que la lista propuesta frena. **Sirve para
saber si hay algo que guardar, no para saber si se puede calificar.**

## 4. Las listas candidatas

**Criterio.** Una fuente es obligatoria si, al faltar, puede pasar alguna de estas cosas: esconder un
bloqueo, cambiar el segmento o el ingreso, o esconder una deuda que el modelo y la capacidad tomarían
por cero. Cuántas veces cambia el mensaje no sirve de criterio: quitar `afiliacionSalud` cambia el
mensaje del 100% de las personas y no mueve nada.

**Prueba de que la lista alcanza.** Sobre 2.566 crudos buenos del 03/10, con el código de hoy y sin
modelo: quedan contestando sólo las fuentes de la lista y caen todas las demás.

| Contestan sólo… | Segmento cambia | Estado del segmento | Ingreso | Bloqueos perdidos, de 73 | Veredicto de capacidad | Cuota perdida | Deuda sin cuota perdida |
|---|---:|---:|---:|---:|---:|---:|---:|
| Las 5 de hoy | 797 | 821 | 0 | **68** | 94 | 707 | 438 |
| 10: más los temas críticos | 797 | 821 | 0 | 0 | 19 | 127 | 438 |
| 15: más RUC, jubilación, Diners, casas comerciales y pensiones | 59 | 70 | 0 | 0 | 0 | 0 | 0 |
| **21: la propuesta** | **0** | **0** | **0** | **0** | **0** | **0** | **0** |

Los 94 veredictos de capacidad que cambian con las 5 de hoy **mejoran todos**: sin cooperativas ni
pensiones la persona parece deber menos. Esa prueba es el peor caso, no lo que pasa en una caída real.

**Lo que cuesta.** Cada lista sobre los perfiles guardados, leyendo como lo hace el freno:

| Lista | Día sano (03/10) | Todo antes del 28/10 | Desde el 28/10 |
|---|---:|---:|---:|
| Las 5 de hoy | 1 (0,0%) | 225 (4,2%) | 671 (55,1%) |
| 10 | 67 (2,6%) | 345 (6,5%) | 683 (56,1%) |
| 15 | 67 (2,6%) | 359 (6,8%) | 701 (57,6%) |
| **21: la propuesta** | **67 (2,6%)** | **372 (7,0%)** | **704 (57,8%)** |
| Todas las que se consultan (49) | 196 (7,6%) | 725 (13,7%) | 749 (61,5%) |

- **De 5 a 10 está casi todo el costo**, y es por denuncias: 62 de esos 66 perfiles. De 10 a 21 no se
  agrega ni uno en un día sano, 27 antes del 28/10 y 21 desde entonces.
- **Exigir todas no sirve**: dejaría afuera para siempre a las personas con fallas que no se van.
- **Quedan frenados los últimos perfiles de 769 de 3.765 personas** (670 con el freno de hoy), y 700 de
  ellos son del 28/10 en adelante, casi todos del lote de paridad.

## 5. Cada fuente, con su número

Los números salen de quitar sólo esa fuente en 2.566 personas. Las columnas por fuente de las 52 están
en el anexo.

### Obligatorias (21)

| Fuente | Por qué | Hoy |
|---|---|---|
| **Identidad y bloqueos** | | |
| `general` | Sin identidad no se sabe quién es ni si falleció. 127 personas pierden la pensión que pagan y 19 mejoran su capacidad sin razón | Frena |
| `listaNegra` | **38 de 73 bloqueos** dependen de ella | Nueva |
| `demandas` | 17 bloqueos, y 489 personas pierden sus demandas de cobro | Nueva |
| `listasControl` | 9 bloqueos y 66 hallazgos (persona expuesta, homónimos) | Nueva |
| `denuncias` | 3 bloqueos y 676 personas cambian en riesgo penal. Es la que más «no hay» falso da | Nueva |
| `antecedentesPenales` | Entra al control de delitos. 0 bloqueos medidos: 1 de 2.188 personas tiene antecedentes. Frena sólo con error (sección 6) | Nueva |
| **Ingreso y segmento** | | |
| `basesInternas` | **1.328 cambian de segmento**, 1.722 pierden el ingreso y la capacidad queda sin ingreso | Frena |
| `contribuyente` | 389 cambian de segmento. Nunca falló | Nueva |
| `jubilados` | 206 cambian de segmento | Nueva |
| `afiliacionIssfacCertMedico` | 36 cambian de segmento: militares | Nueva |
| `afiliacionSiisspol` | 11 cambian de segmento: policías | Nueva |
| `sriImpuestoRenta` | 11 cambian de segmento. Entra al nivel 1 del predictor. Frena sólo con error (sección 6) | Nueva |
| `establecimientoActEconomica` | 2 cambian de segmento y 1.791 pierden el tamaño del negocio. Nunca falló | Nueva |
| `empleados` | 26 cambian el estado del segmento y 353 dejan de figurar con empleados | Nueva |
| **Deuda** | | |
| `buroCreditoSuper` | 94,6% lee algo de acá. 1.144 pierden su deuda bancaria en la capacidad. Nunca falló | Frena |
| `creditoQuirografario` | 25,8% lee algo de acá | Frena |
| `creditoHipotecario` | 11,3% lee algo de acá. Es el caso de `c-79e1ac23` | Frena |
| `buroCreditoCoop` | **Es la única deuda de Proveedor_Info_1 que informa la cuota**: 612 pierden una cuota y 74 mejoran su capacidad sin razón. Nunca falló | Nueva |
| `buroCreditoDiners` | 51,9% lee algo de acá. 61 pierden una deuda, **y la capacidad no avisa**: falta en `FUENTES_DE_CUOTAS` | Nueva |
| `retails` | 14,9% lee algo de acá y 383 pierden una deuda sin cuota | Nueva |
| `pensionAlimenticiaProveedorInfo1` | 127 pierden una cuota y 19 mejoran su capacidad sin razón | Nueva |

Son 8 fuentes en una mitad, 8 en la otra y 5 en el servicio que no cae: cualquier mitad caída frena.

### Secundarias de peso (8): se analiza, pero la entrega es `parcial`

| Fuente | Qué se pierde |
|---|---|
| `trabajoHistoricosMecanizado` | 85,9%: el promedio de 6 meses. El empleo cae a los aportes, como explica el PR 104: en 418 personas cambian los empleos actuales, pero ni el segmento ni el ingreso |
| `trabajoHistoricos` | 80,2%: historial, cargo y salario más alto |
| `vehiculos` | 70,3%: patrimonio |
| `demandasOfendido` | 52,1%: procesos que presentó la persona |
| `inversiones` | 20,8%: patrimonio |
| `cumplimientoPatronal` | 18,6%: su situación como empleador |
| `impedimentoCargosPublicos` | 5,1%: va en el primer grupo del marco, pero no es un bloqueo |
| `bienesInmueble` | 1,6%: patrimonio |

Quedarían `parcial` 0 de 2.500 perfiles en un día sano, 31 de 4.929 (0,6%) antes del 28/10 y 9 de 514
(1,8%) desde entonces.

### Secundarias (20): se dicen en `temasNoConsultados` y nada más

Contacto, familia, títulos, tránsito y seguros: `direcciones`, `telefonos`, `correo`, `padres`, `hijos`,
`titulos`, `licenciaConducir`, `deudasAnt`, `deudasAmt`, `deudasEmov`, `polizas`, `siniestros`.
Seguridad social que no mueve el segmento: `afiliacionIess`, `afiliacionIsspol`, `afiliacionSalud`,
`pensionista`. Otras: `administraciones`, `sercop`, `deudores`, `pensionAlimenticia`.

Cuatro no cambian nada de lo que lee el modelo: `sercop`, `deudores`, `afiliacionIsspol` y
`pensionAlimenticia`. **`afiliacionIess` no puede ser obligatoria**: falla en 94,7% de las personas en un
día sano. Quedan apagadas `vacunados`, `deudasFirmes` y `afiliacionIssfacFuerzaArmada`.

La columna `la_lee_alguien` de `proveedor_info_1_resource_config` no sirve para decidir esto: marca «no se lee»
en fuentes que cambian lo que lee el modelo, como `trabajoHistoricos`, `titulos` y `afiliacionSiisspol`.

## 6. Qué cuenta como «contestó»

| Estado | Obligatoria | Secundaria de peso | Secundaria |
|---|---|---|---|
| `ok`, con contenido | Contestó | Contestó | Contestó |
| `ok_vacio`: la fuente dijo que no hay | **Contestó, y es un hecho** | Contestó | Contestó |
| `faltante` | **No contestó**, salvo renta y antecedentes | Contestó | Contestó |
| `error` | **Frena** | `parcial` | Se dice |
| `deshabilitado` | No frena (PR 104). Propongo que Configuración avise antes de apagarla | Se dice | Se dice |

**Quien no tiene historial pasa el freno.** Una persona sin deudas, sin demandas y sin nada en ninguna
fuente tiene todo en `ok_vacio`. Eso es información y no se penaliza: es la diferencia entre no tener
registros y no haber podido mirar.

**Renta y antecedentes son la excepción, y es incómoda.** En esas dos, `faltante` no frena porque es
su forma normal de decir que no hay, y porque sus fallas son persistentes: 9,9% y 7,4% de las personas
quedarían afuera para siempre. El costo es que esas 254 personas con «ERROR EN LA EXTRACCION DE DATOS»
se siguen leyendo como «no declara renta». Se corrige con la decisión 11, no con el freno.

## 7. Básico, Pro y Plus

**La lista es la misma en las tres modalidades**, porque el modelo lee el mismo mensaje en todas. Básico
no calcula la capacidad, pero su recomendación es la que da el Preaprobado.

| | Básico | Pro | Plus |
|---|---|---|---|
| Pasos | Perfil, análisis | Perfil, análisis, capacidad | Perfil, **buró**, análisis, capacidad |
| Dónde corta | Después del perfil | Después del perfil | Después del perfil, antes de pagar los USD 0,40 |
| Las 21 obligatorias | Se exigen | Se exigen | Se exigen |

**¿Equifax puede cubrir lo que Proveedor_Info_1 no trajo?** Hoy no, por tres razones medidas:

1. **El modelo no lee Equifax.** `marco-v31` está apagado (`CONFIG_LLM.buroDeLaInstitucion`). Equifax
   entra sólo en la capacidad. Si bancos fallara, el modelo no vería esa deuda aunque Equifax la tenga.
2. **Lo que cubriría no se cae.** Bancos, cooperativas y Diners están en el servicio que dio 0 fallas: 0
   de 6.519 perfiles se habrían salvado.
3. **Lo que se cae, Equifax no lo trae**: IESS, listas, demandas y denuncias. Su sector comercial tampoco
   reemplaza a las casas comerciales de Proveedor_Info_1: son otras empresas (5 de 33 en común).

Propongo que, al encender `marco-v31`, esas tres fuentes dejen de ser obligatorias sólo para quien
tiene una consulta vigente **con detalle**. Los préstamos del BIESS no: Equifax los trae dentro de
bancos, y sólo se vieron en las dos fuentes en 4 de 22 personas.

Dos ajustes de paso:

- `disponibilidadDeLaEvaluacion()` da por consultados los temas de Equifax aunque el modelo no los haya
  leído. Hoy no tiene efecto, pero la API podría decir `completa` sin serlo.
- La respuesta de Equifax sin reporte (PR 102) se detecta en la capacidad, **después del modelo**.
  Conviene mirarlo al terminar el paso del buró, para no gastar el análisis.

## 8. Después de frenar

**Reintentos.** Consultar Proveedor_Info_1 no se cobra, así que reconsultar es sólo tiempo. De los perfiles que
la lista frena, 287 personas pasaron a completas al reconsultar y 15 no. Dentro de la hora 12 de 14, y
entre 1 y 24 horas 38 de 41. Esa historia es de caídas anteriores: **no dice cuánto va a durar la actual**.

| Quién | Hoy | Propuesta |
|---|---|---|
| Analista | Reconsulta con un botón | Sigue igual |
| API, interactiva (15 min) | 4 intentos en 7,5 min | Sigue igual: es lo que puede esperar la ventanilla |
| API, diferida (24 h) | 5 intentos y **se rinde a los 17,5 min** | Esperas crecientes hasta el plazo, sólo para `fuentes_no_disponibles` |
| Lote de consultas | Queda `ok` | Vuelve a la cola, hasta 3 veces, y después queda «incompleta» |

Cada intento guarda un perfil, porque cada consulta a la persona deja constancia. Ese costo se acepta.
Un reintento por fuente, sin repetir las 52, podría resolver las mitades, pero **no se midió** y le suma
carga a un proveedor saturado: queda para cuando Proveedor_Info_1 vuelva.

**Qué ve el analista.** Ya ve el motivo con los temas que faltan. Falta la bandeja: hoy una persona con
consulta incompleta figura «Sin analizar», y `consulta_fallida` sólo aparece con cero fuentes. Son 769
personas el primer día. Va en `refrescar_resumen_por_persona()`, con migración.

**Qué contesta la API.** `fallida` con `fuentes_no_disponibles`. Propongo sumar `temasNoConsultados` a
`Fallo`. No devuelve score ni capacidad. `completitud: parcial` sigue existiendo, pero pasa a significar
«faltó una secundaria de peso». Hay que corregir ese texto en `api/openapi.yaml` y sumar un caso al
sandbox. **Conviene hacerlo antes del primer cliente**: después cambiar la especificación cuesta más.

**Mientras dure la caída no hay evaluaciones.** Es lo que se pidió. Ninguna modalidad llega al modelo y la
institución recibe «reintentar más tarde». No propongo un modo degradado sólo con Equifax: no tendría
listas ni IESS.

**Análisis ya hechos.** No se borra ninguno:

| Análisis | Cuántos | Qué hacer |
|---|---:|---|
| Sobre una consulta rota (`c-79e1ac23`, 560, revisar) | 1 | Marcarlo y reanalizar al reconsultar (USD 0,06) |
| Con «no hay» falso en denuncias o lista negra (9 de ellos de marco-v28, 3 en «aprobar») | 11 | Marcarlos, reconsultar y reanalizar sólo si cambió el dato (hasta USD 0,69) |
| Con perfil anterior al 17/09, sin detalle por fuente | 59 | No se puede saber. No se tocan |
| Sin perfil | 4 | No se puede saber. No se tocan |
| Con todas las obligatorias | 219 | Nada |

Esos 9 de marco-v28 entran al Universo del Laboratorio: conviene marcarlos antes de fijar su t0.

## 9. Por institución

Hoy hay una sola base y una sola lista. Propongo:

- **Una lista en el código, con versión** (`fuentes-obligatorias-v1`), igual para todas.
- **Identidad y bloqueos no se negocian**: cumplimiento no depende de la política comercial de nadie.
- **Una institución puede sumar, nunca quitar.** Si pide quitar, por ejemplo porque tiene sus propios
  datos de nómina, eso es una decisión del negocio, caso por caso.
- **No se construye hasta que alguien lo pida.** Cuando haga falta, va en `config_operativa` de cada
  base, que ya es una por institución.
- **Una base con otro buró** (Aval) se mide aparte: esta medición no lo cubre.

## 10. El marco

| Cambio | ¿Toca el mensaje? | ¿Versión nueva del marco? |
|---|---|---|
| Ampliar la lista a 21 y sumar el segundo nivel | No: quien pasa lee exactamente lo mismo | **No** |
| Bloqueo sin modelo, API, bandeja, lotes | No | **No** |
| Contarle al modelo las fallas con mensaje | **Sí**: `disponibilidad` cambia en casi todas las personas, porque afiliación al IESS falla en 94,7% | **Sí**, con su fila en `scoring_rules_versions` |
| Sacar «acercá el score al centro» | **Sí** | **Sí**, junto con lo anterior |

La frase «si varios temas clave están sin consultar, acercá el score al centro» es la que produjo el
560 de `c-79e1ac23`. Con estas 21 ya no se alcanza, porque esos temas son todos obligatorios. Es texto
muerto, pero inofensivo: se saca cuando haya versión nueva.

Para contarle esas fallas al modelo hace falta un estado nuevo en `estadoPorFuente()`, y migrar las
vistas que cuentan estados (118 y 125). **Conviene ir con la versión del marco del predictor**, que ya
tiene decidido su contenido (`docs/pendientes.md`, 2.4).

## 11. Qué haría falta medir con el modelo

**Sin autorización no se corre nada.** Lo que falta saber es cuánto mueve el score una consulta
incompleta: la historia no alcanza (sección 13).

**El diseño.** 40 personas de los crudos del 03/10, por segmento, en 5 versiones de su perfil, sin
consultar a nadie y sin guardar análisis:

| Versión | Pedidos | Qué contesta |
|---|---:|---|
| Completa | 2 | La base y su ruido |
| Sólo las 21 contestan | 2 | **¿Las secundarias quedan dentro del ruido?** Si no, la lista es corta |
| Cae una mitad | 1 | Cuánto engaña una caída a medias |
| Cae la otra mitad | 1 | Lo mismo |
| Caída con «no hay» falso | 1 | El peor caso: el modelo cree que se consultó |

**El criterio.** Las secundarias alcanzan si la diferencia queda dentro del ruido conocido: ~40 puntos y
1 de cada 13 recomendaciones. Si no, hay que subir fuentes a obligatorias.

| Tamaño | Pedidos | Con el costo medido del lote (USD 0,0179) | Tope sin caché (USD 0,0312) |
|---|---:|---:|---:|
| Mínima: 20 personas, con una sola mitad | 120 | USD 2,1 | USD 3,8 |
| **Completa: 40 personas** | **280** | **USD 5,0** | **USD 8,8** |

El costo es el medido en 205 llamadas de lote de octubre. **Octubre lleva USD 9,97 de 10**, así que va en
noviembre, y compite con la comparación de marco-v31 (USD 2,3) y con adelgazar el marco (USD 2).

## 12. Orden de construcción

Cada paso se puede fusionar solo:

1. Una sola tabla en `calidad-de-la-consulta.ts`, con el nivel y la forma de «no hay» de cada fuente, y
   `TEMAS_CRITICOS` deja de existir aparte. Se mide con estos mismos conteos.
2. Cerrar `esPrueba` y sumar Diners a `FUENTES_DE_CUOTAS`.
3. El bloqueo sin modelo y el corte de Equifax sin reporte antes del análisis.
4. Los lotes y los reintentos de la diferida.
5. La API: `Fallo`, `parcial` y el sandbox, antes del primer cliente.
6. La bandeja y la marca en los análisis ya hechos, con migración.
7. El control de contenido por fuente en el vigía.
8. Con la versión del marco del predictor: el estado nuevo y lo que lee el modelo.

Cuando se decida, lo abierto pasa a `docs/pendientes.md` y cierra su punto 2.5: `suficienteParaPuntaje`
es esto. La respuesta a su pregunta es que un caso no evaluable no se guarda como análisis.

### Plan por sesiones (2026-10-31)

**Decidido:** el negocio aceptó las recomendaciones de la sección 1 el 2026-10-31: 1d, 2b, 3b, 4a, 5b, 6b,
7b, 8a, 9b, 10c (sin construir), 11b, 12b y 13a. **La 14 no: queda en a.** No se prueba con el modelo
hasta terminar los arreglos, así que el efecto en el score (sección 11) sigue sin medir. `esPrueba` ya quedó cerrado (PR 109), y
del paso 2 sólo falta Diners.

El renombre del proveedor ya entró (PR 111). La sesión del marco (PR 113) sigue abierta y comparte con la sesión 1 sólo `analisis-de-la-persona.ts`: la que entre segunda actualiza contra `main`.

| Sesión | Pasos | Decisiones | Toca | Cuándo |
|---|---|---|---|---|
| 1. Freno: la lista de 21 | 1, 2 y 3 | 1 a 5 | `calidad-de-la-consulta.ts`, `evaluacion-de-la-api.ts` (`TEMAS_CRITICOS`), `capacidad-de-pago.ts`, `analisis-de-la-persona.ts`, `pasos-de-evaluacion.ts`, `evaluar-solicitud`, `AnalisisIA.jsx` | Primera y sola: las demás leen su tabla |
| 2. Reintentos, lotes y API | 4 y 5 | 3, 6, 7 y 8 | `cola-de-evaluaciones.ts`, `trabajador-de-evaluaciones.ts`, `procesar-lote`, `api/openapi.yaml`, `sandbox-*` | Después de la 1 |
| 3. Bandeja y análisis marcados | 6 | 9 y 13 | Migración nueva, `refrescar_resumen_por_persona()`, la bandeja, `terminologia.md` | Después de la 1 |
| 4. Control de contenido | 7 | 12 | `vigia/index.ts` | Cuando se quiera: no depende de la 1 |
| 5. Lo que lee el modelo | 8 | 11 | El marco y `perfil-del-modelo.ts` | Con la versión del marco del predictor |

**Para gastar poco:**

- Cada sesión lee esta propuesta y el CLAUDE.md de su área. Las mediciones ya están: no se repiten.
- La sesión 1 usa el mejor modelo, porque cambia la regla que decide quién llega al modelo. Lo que está
  bien especificado (2, 3 y 4) puede ir con uno más barato.
- Las sesiones 2, 3 y 4 no comparten archivos y pueden correr juntas.
- Se despliega una vez por tanda, no por PR.
- Fusionar y desplegar piden la autorización del negocio, nombrando el PR.
- Lo que reconsulta a una persona (decisión 9) espera a que vuelva Proveedor_Info_1.

## 13. Qué quedó medido y qué no

**Medido:**

- Estado por fuente de 6.519 perfiles reales: 5.301 antes del 28/10 y 1.218 desde entonces.
- Mensajes y formas de fallar en 6.310 crudos del 25/09, el 03/10 y el 28/10.
- Quitar cada fuente, y cada lista, en 2.566 personas, con `buildStandardProfile` y `armarPerfilDelModelo`.
- 231 de 294 análisis contra el estado de su perfil.

**No medido, o medido a medias:**

- **Cuánto mueve el score una consulta incompleta.** Un solo análisis sobre un perfil roto, sin par
  bueno. El único par de la misma persona usa marcos distintos y uno no dio veredicto: no sirve.
- **Si la lista alcanza para el modelo.** Se probó que no cambian bloqueos, ingreso, segmento ni cuotas,
  pero el mensaje sí cambia en todas las personas: el historial, el patrimonio y la familia pueden mover
  el score. Por eso hace falta la sección 11.
- **La causa de las mitades.** Es una deducción.
- **Cuánto dura la caída actual, y si es general.** Desde el 28/10 hay 3 perfiles, de una persona.
- **La falla silenciosa** sale de un día, y las personas del lote son de otra población que la cartera,
  aunque se compare entre independientes.
- **`basesInternas` vacía** el 28/10: sin explicar.
- **Qué significa «Consulta sin valor»** en antecedentes.
- **Plus con datos.** No se simuló con Equifax. `consultas_equifax` se estaba cargando mientras se medía
  (de 4.772 a 6.772 filas, consultas ya pagadas que se reutilizan), así que no se usó. Las razones de la
  sección 7 salen del código y del estado por fuente.
- **La capacidad** se probó con una cuota fija de USD 605, la mediana de AWS, y sin Equifax.
- **Aval** no está cubierto.
- **3.054 perfiles** anteriores al 17/09 no tienen detalle por fuente.
- **El PR 105** cambia lo que se lee de `creditoHipotecario`, `creditoQuirografario` y `trabajoHistoricos`.
  Al fusionarlo hay que repetir la prueba: su peso debería subir.

**Hay que pedirle por escrito a Proveedor_Info_1:**

1. ¿Sus pedidos se reparten entre dos servidores? ¿Qué pasó el 28/10?
2. ¿Qué significan «Consulta sin valor» y «ERROR EN LA EXTRACCION DE DATOS»? ¿Por qué se repiten en
   las mismas personas?
3. ¿Por qué la afiliación al IESS contesta «INFORMACION INCONSISTENTE» para casi todos?
4. ¿Desde cuándo `licenciaConducir`, `inversiones` e `impedimentoCargosPublicos` dejaron de traer
   contenido?
5. ¿Por qué `listaNegra` da 404 siempre en las mismas 5 personas?

Los guiones y sus resultados quedaron en `research/medicion-fuentes-obligatorias/`, fuera de git.

## Anexo: las 52 fuentes

**Nivel:** O obligatoria, S+ secundaria de peso, S secundaria. **Pedido:** par o impar en la lista de
`data-services`, `api` para `api/consultas`. Las cuatro columnas del 03/10 son el día sano, sobre 2.567
perfiles. **Error** es el del 28/10 en adelante. Las últimas columnas salen de quitar esa fuente en 2.566
personas: **Lee** es el porcentaje en que cambia lo que lee el modelo sin contar `disponibilidad`;
**Bloqueos**, cuántos de 73 se pierden; **Capacidad**, cuántos veredictos cambian; **Sin cuota**, cuántas
personas cambian sus deudas sin cuota.

| Fuente | Nivel | Pedido | Con contenido | Vacía | `faltante` sin mensaje | `faltante` con mensaje | Error | Lee | Segmento | Bloqueos | Capacidad | Sin cuota |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `basesInternas` | O | impar | 99,9% | 0,1% | 0,0% | 0,0% | 46,9% | 100% | 1.328 | 0 | 1.722 | 751 |
| `general` | O | par | 100,0% | 0,0% | 0,0% | 0,0% | 48,9% | 100% | 0 | 0 | 19 | 0 |
| `buroCreditoSuper` | O | api | 94,5% | 5,5% | 0,0% | 0,0% | 0% | 94,6% | 0 | 0 | 0 | 1.144 |
| `antecedentesPenales` | O | impar | 92,4% | 0,0% | 0,2% | 7,4% | 46,9% | 92,4% | 0 | 0 | 0 | 0 |
| `contribuyente` | O | api | 99,5% | 0,5% | 0,0% | 0,0% | 0% | 89,7% | 389 | 0 | 0 | 0 |
| `establecimientoActEconomica` | O | api | 89,6% | 10,4% | 0,0% | 0,0% | 0% | 89,7% | 2 | 0 | 0 | 0 |
| `empleados` | O | par | 21,2% | 78,8% | 0,0% | 0,0% | 49% | 70% | 0 | 0 | 0 | 0 |
| `buroCreditoDiners` | O | api | 51,9% | 48,1% | 0,0% | 0,0% | 0% | 51,9% | 0 | 0 | 0 | 61 |
| `demandas` | O | impar | 45,6% | 54,4% | 0,0% | 0,0% | 47% | 45,6% | 0 | 17 | 0 | 0 |
| `sriImpuestoRenta` | O | impar | 35,6% | 0,0% | 54,5% | 9,9% | 46,6% | 35,6% | 11 | 0 | 0 | 0 |
| `denuncias` | O | par | 27,7% | 69,8% | 0,0% | 2,4% | 49,2% | 26,3% | 0 | 3 | 0 | 0 |
| `creditoQuirografario` | O | par | 25,8% | 74,2% | 0,0% | 0,0% | 49,1% | 25,8% | 0 | 0 | 0 | 0 |
| `buroCreditoCoop` | O | api | 25,1% | 74,9% | 0,0% | 0,0% | 0% | 25,1% | 0 | 0 | 74 | 0 |
| `retails` | O | par | 14,9% | 85,1% | 0,0% | 0,0% | 49,1% | 14,9% | 0 | 0 | 0 | 383 |
| `creditoHipotecario` | O | impar | 11,3% | 88,7% | 0,0% | 0,0% | 46,9% | 11,3% | 0 | 0 | 0 | 0 |
| `jubilados` | O | par | 8,1% | 91,9% | 0,0% | 0,0% | 49% | 8,1% | 206 | 0 | 0 | 0 |
| `pensionAlimenticiaProveedorInfo1` | O | impar | 15,3% | 84,7% | 0,0% | 0,0% | 47,2% | 8,1% | 0 | 0 | 19 | 0 |
| `listasControl` | O | impar | 4,1% | 95,9% | 0,0% | 0,0% | 47,1% | 3,1% | 0 | 9 | 0 | 0 |
| `listaNegra` | O | par | 1,6% | 98,2% | 0,2% | 0,0% | 49,1% | 1,6% | 0 | 38 | 0 | 0 |
| `afiliacionIssfacCertMedico` | O | par | 1,9% | 98,1% | 0,0% | 0,0% | 49,1% | 1,5% | 36 | 0 | 0 | 0 |
| `afiliacionSiisspol` | O | impar | 89,7% | 10,3% | 0,0% | 0,0% | 47% | 0,4% | 11 | 0 | 0 | 0 |
| `trabajoHistoricosMecanizado` | S+ | par | 85,8% | 14,1% | 0,0% | 0,0% | 49% | 85,9% | 0 | 0 | 0 | 0 |
| `trabajoHistoricos` | S+ | impar | 80,2% | 19,8% | 0,0% | 0,0% | 46,9% | 80,2% | 0 | 0 | 0 | 0 |
| `vehiculos` | S+ | impar | 70,3% | 0,0% | 29,7% | 0,0% | 47,1% | 70,3% | 0 | 0 | 0 | 0 |
| `demandasOfendido` | S+ | par | 52,0% | 48,0% | 0,0% | 0,0% | 49,2% | 52,1% | 0 | 0 | 0 | 0 |
| `inversiones` | S+ | impar | 20,8% | 66,5% | 1,1% | 11,5% | 46,9% | 20,8% | 0 | 0 | 0 | 0 |
| `cumplimientoPatronal` | S+ | impar | 18,5% | 81,5% | 0,0% | 0,0% | 46,9% | 18,6% | 0 | 0 | 0 | 0 |
| `impedimentoCargosPublicos` | S+ | impar | 19,1% | 0,0% | 80,9% | 0,0% | 46,6% | 5,1% | 0 | 0 | 0 | 0 |
| `bienesInmueble` | S+ | impar | 1,6% | 98,2% | 0,0% | 0,2% | 47,5% | 1,6% | 0 | 0 | 0 | 0 |
| `afiliacionSalud` | S | par | 1,2% | 98,8% | 0,0% | 0,0% | 49,1% | 100% | 0 | 0 | 0 | 0 |
| `direcciones` | S | impar | 99,8% | 0,2% | 0,0% | 0,0% | 46,6% | 99,8% | 0 | 0 | 0 | 0 |
| `correo` | S | impar | 98,9% | 1,1% | 0,0% | 0,0% | 46,6% | 98,9% | 0 | 0 | 0 | 0 |
| `telefonos` | S | par | 96,8% | 3,2% | 0,0% | 0,0% | 48,9% | 96,8% | 0 | 0 | 0 | 0 |
| `licenciaConducir` | S | par | 87,7% | 12,3% | 0,0% | 0,0% | 49% | 87,7% | 0 | 0 | 0 | 0 |
| `hijos` | S | impar | 70,3% | 29,7% | 0,0% | 0,0% | 46,6% | 70,3% | 0 | 0 | 0 | 0 |
| `titulos` | S | par | 46,6% | 48,7% | 0,0% | 4,7% | 49% | 46,6% | 0 | 0 | 0 | 0 |
| `padres` | S | par | 86,3% | 13,7% | 0,0% | 0,0% | 48,9% | 19,6% | 0 | 0 | 0 | 0 |
| `deudasAnt` | S | impar | 12,1% | 61,7% | 0,0% | 26,2% | 47,1% | 12,1% | 0 | 0 | 0 | 0 |
| `afiliacionIess` | S | par | 5,3% | 0,0% | 0,0% | 94,7% | 49,2% | 5,3% | 0 | 0 | 0 | 0 |
| `deudasEmov` | S | impar | 98,2% | 1,6% | 0,0% | 0,1% | 47% | 1,5% | 0 | 0 | 0 | 0 |
| `administraciones` | S | par | 1,1% | 98,8% | 0,1% | 0,0% | 49,1% | 0,9% | 0 | 0 | 0 | 0 |
| `polizas` | S | par | 0,3% | 99,7% | 0,0% | 0,0% | 49% | 0,3% | 0 | 0 | 0 | 0 |
| `deudasAmt` | S | par | 0,2% | 99,8% | 0,0% | 0,0% | 49,2% | 0,2% | 0 | 0 | 0 | 0 |
| `afiliacionIsspol` | S | impar | 0,1% | 99,9% | 0,0% | 0,0% | 46,8% | 0% | 0 | 0 | 0 | 0 |
| `deudores` | S | par | 0,0% | 100,0% | 0,0% | 0,0% | 49,1% | 0% | 0 | 0 | 0 | 0 |
| `pensionAlimenticia` | S | par | 15,3% | 84,7% | 0,0% | 0,0% | 49,3% | 0% | 0 | 0 | 0 | 0 |
| `pensionista` | S | impar | 1,4% | 98,6% | 0,0% | 0,0% | 46,8% | 0% | 0 | 0 | 0 | 0 |
| `sercop` | S | par | 47,3% | 0,0% | 48,1% | 4,5% | 49,6% | 0% | 0 | 0 | 0 | 0 |
| `siniestros` | S | impar | 0,0% | 100,0% | 0,0% | 0,0% | 46,8% | 0% | 0 | 0 | 0 | 0 |
| `afiliacionIssfacFuerzaArmada` | S | apagada | 0,0% | 0,0% | 0,0% | 100,0% | 0% | — | — | — | — | — |
| `deudasFirmes` | S | apagada | 0,0% | 0,0% | 0,0% | 100,0% | 0% | — | — | — | — | — |
| `vacunados` | S | api | 0,0% | 100,0% | 0,0% | 0,0% | 0% | — | — | — | — | — |
