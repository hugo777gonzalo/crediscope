# Lecciones

El detalle de "Lo que costó caro aprender" de `CLAUDE.md`: qué pasó, cuándo
y con qué números. `CLAUDE.md` tiene la regla en una o dos líneas; acá
está el porqué. Una lección nueva va en los dos lugares.

- **La regla del tercer dígito de la cédula es falsa.** "De 0 a 5 es
  persona natural" se repite en todos lados y no resiste los datos: hay
  30 cédulas en la cartera con tercer dígito 6 y son personas reales.
  Solo se valida el dígito verificador.
- **Una consulta que no contestó ningún eje no se guarda.** Guardarla
  produce una ficha en blanco indistinguible de la de alguien sin
  historial. El 2026-09-15 eso convirtió una caída de red de una hora en
  un juicio sobre 373 personas, que quedaron clasificadas como
  "informal o sin actividad" — la rama por defecto de la clasificación.
- **"La fuente dice que no hay" y "la fuente no contestó" son cosas
  distintas.** El catálogo tiene que poder decir las dos.
- **Dos formas del mismo dato conviven.** Los perfiles anteriores a
  marco-v20 traen `laboral.empleoActual` (objeto); los nuevos,
  `empleosActuales` (arreglo). Leer solo una forma cuenta de menos y no
  avisa.
- **Los 9 bloques se retiraron en la 078; quedan 52 fuentes planas.** El
  bloque exageraba: figuraba "ok" si contestaba UNA de sus catorce
  fuentes, y medido con las dos reglas "9 de 9 ejes" era 14 a 25 de 52.
  `ejes_ok` ya no se escribe pero **no se borró**: es la única prueba de
  calidad de 2.681 perfiles buenos y no se puede reconstruir. Para
  preguntar si un perfil sirve, `elPerfilSirve()` — mira `fuentes_ok` y
  cae a `ejes_ok` sólo cuando es null.
- **`metaConsulta` tiene tres estados, y la del medio es la que importa.**
  `fuentesConDatos` / `fuentesSinDatos` / `fuentesNoMedidas`. "La fuente
  dijo que no hay" ES evidencia; "la fuente no contestó" es un hueco.
  Mezclarlas es lo que costó los 373 perfiles del 2026-09-15. Ver
  `docs/declaracion-de-disponibilidad.md`.
- **pg_net publica en el esquema `net`, no `extensions`.** Y una tarea
  programada se verifica contra `cron.job_run_details`, nunca contra
  `cron.job`: `cron.job` dice que está activa aunque lleve horas
  fallando.
- **PostgREST corta en 1.000 filas y no avisa.** Un `.limit(5000)`
  devuelve 1.000 sin error. El panorama de Fuentes de ingreso contó así
  ~840 clientes de 2.807 hasta la 081 (decía 290 dependientes privados
  donde había 950). Lo que agrega sobre la cartera se cuenta en la base
  (una función `security invoker`, como `metricas_gerenciales()` o
  `resumen_fuentes_ingreso()`); lo que lista, se pagina con
  `traerTodas()` (ver arriba).
- **El crudo de Novadata no se guarda en la base, pero hay respaldo
  local.** En la base va el perfil estandarizado. El crudo está en
  `research/` (fuera del repo, datos personales):
  `novadata-raw/` = 389 personas en la forma vieja de 9 bloques, la
  muestra fija para comparar reglas (no se pisa);
  `novadata-raw-2026-09-25/` = la cartera real completa (2.567 al
  2026-09-26, incluidas las 389 de la muestra reconsultadas), en la forma
  plana de 52 fuentes, `{ cedula, capturadoEl, perfilId, raw }`. Con el
  crudo del último perfil de cada cliente, una regla nueva se aplica a
  toda la cartera con `scripts/recalcular-fuentes-ingreso.mjs`, sin
  reconsultar. Para sumar: `node scripts/consultar-lote.mjs <archivo>
  <uuid-responsable> 20 --crudo=research/<carpeta>` (la función
  devuelve el crudo sólo a la clave de servicio). Reproducir un perfil
  desde el crudo: `buildStandardProfile(raw, cedula, corte)` con el
  corte VIGENTE de ese día, no con `fuente_corte`.

  **Desde el 2026-10-03 (090) el crudo SÍ se guarda**, en Storage y no en
  la base: pesa ~150 KB por persona contra ~4 KB del perfil y del crudo de
  Aval, y la base entera pesaba 96 MB. Comprimido queda en ~8 KB; los
  2.567 del respaldo local se subieron con
  `scripts/subir-crudo-guardado.mjs` (20 MB). Lo decidió el negocio para
  el Laboratorio de Inteligencia de Negocio (`docs/laboratorio-de-riesgo.md`),
  que necesita seguir un dato desde la fuente hasta la respuesta del
  modelo. Por lo mismo se guarda `analysis_results.mensaje_al_modelo`.

  **Pero hasta el 2026-10-04 ninguna consulta lo guardó.** Con un `Blob`,
  supabase-js arma un formulario, ignora `contentType` y el archivo llega
  como `application/octet-stream`; el depósito sólo acepta
  `application/gzip` y lo rechazaba. La función no corta la consulta si el
  crudo falla (a propósito), así que el error quedó en los registros: 0 de
  los 2.567 perfiles de la reconsulta del 03/10 tenían crudo, y nadie lo vio
  porque los 2.567 de septiembre sí estaban (los había subido el guion, con
  bytes). Se encontró al ir a borrar duplicados. Se sube como bytes
  (`Uint8Array`) y los del 03/10 se subieron desde `research/`. **Una
  función que no lanza a propósito se verifica mirando el efecto en la base
  después de desplegar**, no la respuesta.
- **El modelo lee SOLO el perfil del modelo** (`_shared/perfil-del-modelo.ts`,
  desde marco-v23). Todos los caminos al LLM (hoy: análisis, lote y
  comparación de razonamiento; hasta el 2026-10-03 también el backtest y el
  informe de retroalimentación) pasan por `armarPerfilDelModelo()` /
  `mensajeParaElModelo()`: ingresos con los nombres de la pantalla, perfil
  laboral, indicios, estabilidad y tamaño del negocio; campos
  deshabilitados en null; sin aportes mes a mes, sin textos del SRI, sin
  renta por año; y desde marco-v25, qué temas se consultaron
  (`disponibilidad`) en lugar de los nombres de las 52 fuentes. Un camino
  nuevo tiene que usar esa misma puerta, y cualquier
  cambio en lo que arma es una versión nueva del marco (con su fila en
  `scoring_rules_versions`).
- **`fuentesIngreso.detalle` no va entero al modelo.** Desde fuentes-v4 trae el
  historial de aportes, la actividad económica y la renta por año, para
  el analista. Al modelo llega sólo un resumen (continuidad, meses con
  aporte, promedio, variación), armado por el perfil del modelo; la
  renta nunca.
- **El corte del IESS lo deciden 20 clientes, no uno.** Novadata
  actualiza el IESS más o menos cada dos meses y no avisa: el
  2026-09-25 se esperaba que siguiera en 2026-07 y durante la
  reconsulta de la cartera publicó 2026-08 (403 clientes con aporte de
  agosto, 6 con su último aporte en julio). Algunos aportes llegan
  antes: el 2026-09-23 dos de agosto movieron el corte a 2026-08 para
  todos, y cualquier asalariado con su último aporte en julio habría
  quedado "fuera del corte" -- la familia de error del 2026-09-15. Desde
  la 083 el corte es `corte_iess_vigente()`: el mes más reciente con al
  menos 20 clientes distintos consultados en 90 días. Quien trae un mes
  posterior se clasifica con el suyo.
- **Empleo actual e ingresos leen el mismo registro del IESS.** Hasta
  estructura-v4, `laboral.empleosActuales` salía sólo del mecanizado
  (contra hoy) y la clasificación de los aportes (contra el corte): 374
  perfiles tenían aporte vigente y "sin empleo actual". Ahora el empleo
  cae a los aportes cuando el mecanizado no trae nada, y los guardados
  se corrigieron con `scripts/corregir-empleo-actual.mjs`.
- **El historial del IESS tiene meses que Novadata no publicó para
  nadie**: 2018-02, 2019-09 a 2019-11, 2020-01 a 2020-03, 2020-05,
  2020-06, 2020-08 y 2020-11 (0 de 315 historias los traen). No son
  meses sin trabajo: contarlos cortaba la continuidad de casi todos en
  2019-2020. Y el historial mensual empieza en 2018-2019; para saber
  desde cuándo trabaja alguien, la fuente es la fecha de ingreso que
  declara el IESS (`fecIng`), no el primer mes con aporte. Las dos cosas
  las usa `continuidadLaboral` (fuentes-v5).
- **Aportar por cuenta propia no prueba trabajo; aportar con RUC activo,
  sí.** Un afiliado voluntario o unipersonal puede estar pagando sólo
  para no perder la seguridad social. Para la continuidad laboral
  (fuentes-v6) el aporte propio cuenta en los meses con RUC activo,
  reconstruidos del SRI (inicio, cese más reciente, reinicio más
  reciente, los mismos casos que `estadoActividadEconomica`); el RISE
  cuenta siempre por ser un régimen del SRI. En la muestra, 28 de 137
  personas aportan por su cuenta sin RUC activo en ninguno de esos meses.
- **"Es su propio patrono" es una sola regla: `_shared/patrono.ts`.** El
  RUC del patrono de cada aporte (`tiess.rucEmp`, `rucEmpresa` del
  mecanizado) es la cédula + 001/002/003; el nombre sólo si no hay RUC.
  Desde marco-v17 el negocio lo tenía decidido (propio patrono = cuenta
  propia, nunca empleo), pero la clasificación leía el código de tipo de
  empleador, que para el patrono persona natural es el SECTOR de su
  negocio: 40 personas figuraban dependientes de sí mismas (fuentes-v8). Y
  el dueño se afilia en su propia nómina: contarlo hacía "empleador" a 166
  personas que sólo se pagan a sí mismas. Una regla nueva sobre aportes o
  nómina tiene que pasar por ahí.
- **No se especula sobre el ingreso.** "El ingreso real puede ser mayor"
  se decía de todos y es falso para quien gana el SBU. Un ingreso mayor se
  afirma sólo con un indicio que lo sostenga (`indiciosDeIngresoMayor()`
  en `fuentes-ingreso.ts`: paga una nómina mayor que lo que declara,
  obligado a llevar contabilidad, o, desde fuentes-v9, un impuesto a la
  renta de los dos últimos años que lo declarado al IESS no alcanza a
  generar). Tampoco se muestra "cómo puede fallar"
  un segmento: son generalidades, no hechos de la persona.
- **Los nombres de Fuentes de ingreso los decidió el negocio** (ver
  "Nombres de pantalla" arriba). No inventar otros.
- **Recalcular desde el crudo: `scripts/recalcular-fuentes-ingreso.mjs`.**
  Sólo el último perfil y sólo si el crudo es de ese perfil (perfilId).
  Arma con el reloj en la fecha de captura (process.ts mide contra hoy) y
  compara con las claves ordenadas (jsonb las reordena): sin esas dos
  cosas, 1.429 perfiles idénticos parecían distintos.
- **"RUC activo" es una sola regla: `_shared/ruc.ts`.** Había dos
  (process.ts miraba el reinicio, fuentes-ingreso.ts no) y 77 personas
  con el RUC reactivado quedaron "informal o sin actividad" mientras el
  perfil las veía activas. Cuenta el cese temporal (solicitud de
  suspensión) y exige un establecimiento abierto. Cualquier lectura
  nueva del RUC tiene que importar esa, no escribir otra.
- **Segmento y perfil laboral responden cosas distintas.** El segmento:
  de qué fuente MEDIBLE depende el ingreso (sólo la dependencia trae
  monto). El perfil laboral (`_shared/perfil-laboral.ts`): ¿trabaja para
  un tercero? ¿tiene actividad propia? El 26% de la cartera es las dos
  cosas. Se calcula desde el perfil guardado, vive en la columna
  `client_profiles.perfil_laboral` (085) y NO está dentro de
  `standard_profile`: al modelo le llega calculado igual que en la
  pantalla, dentro del perfil del modelo (desde marco-v23).
- **`reprocess-sample.mjs` quedó atrás de `process.ts`** (sigue en la
  forma vieja de `empleoActual`). `process.ts` corre directo bajo Node:
  para validar un cambio del perfil, comparar la versión vieja contra la
  nueva de `process.ts` sobre `research/novadata-raw/` con el perfil
  entero, no contra el espejo.
- **Una actualización bloqueada por RLS devuelve 0 filas, no un error.**
  Hay que pedir `.select()` y contar.
- **Al reclamar trabajo en un proceso concurrente, trabajar sobre las
  filas que la actualización DEVOLVIÓ**, no sobre las que se leyeron.
- **Lo que no pasa por `lint` ni `build` se rompe en silencio.**
  `scripts/reprocess-sample.mjs` quedó leyendo una forma de crudo que ya
  no existía y habría dado 389 perfiles vacíos sin lanzar una sola
  excepción — un perfil vacío sale con todo en null y parece una persona
  sin historial. Los scripts sueltos necesitan su propio aviso adentro
  (ese ahora avisa si un perfil sale sin nombre).
- **Un error de PostgREST no es un `Error`: es un objeto plano.**
  `String(err)` lo aplasta a `"[object Object]"` y el motivo guardado no
  sirve para nada. Hay que leer `message`/`details`/`hint`/`code`.
- **Reencolar ítems de un lote `terminado` no lo reabre**: el trabajador
  solo mira los `en_proceso`.
- **El ambiente de prueba de Aval contesta por otra persona.** Medido el
  2026-09-23 con 200 consultas a `api-test`: 73 (37%) volvieron con el
  nombre de alguien que no era la cédula pedida, y 143 con el archivo
  financiero entero en cero. Son A200 legítimos con sus 34 segmentos, así
  que `laConsultaAvalSirve` no los puede distinguir de una consulta buena
  — el filtro mira si Aval contestó, no si contestó de quién. Por eso
  existe `consultas_aval.ambiente` (079): se deriva del host de
  `AVAL_BASE_URL`, no se declara a mano, y defaultea a `prueba` porque un
  olvido que degrada el dato se nota y uno que lo asciende se descubre
  cuando ya se aprobó un crédito. **Una fila con `ambiente = 'prueba'` no
  sirve para calificar a nadie.**
- **Aval mezcla filas de totales con los datos, y cada segmento las marca
  distinto.** `operacionesVigentes*` traen una fila con identidad `"-"` o
  fecha `"TOTAL"`; `deudaVigenteTotal` trae una con
  `sistemaCrediticio: "TOTAL"`. Sumar el segmento entero duplica: eso
  tuvo los cuatro totales de deuda de la estructura al doble en 129 de
  129 personas hasta aval-estructura-v4 (2026-09-24). Antes de sumar un
  segmento de Aval nuevo, buscarle la fila de totales.
- **El buró de Novadata mezcla roles y esconde el atraso** (estructura-v8,
  2026-09-27).
  - **Roles:** la columna `riesgo` dice si la persona es titular (T),
    garante (G) o codeudora (C). Sumado todo como propio, 319 personas
    cargaban $73,8 M ajenos, y en 125 la peor calificación era de otra
    persona. Lo propio y lo garantizado van separados, como en Aval
    (080).
  - **Atraso:** una operación en atraso puede tener su monto en
    `noDevengaInteres`, que no se leía: 56 personas con $626.743
    figuraban con $0 en mora.
  - **Tramos:** `saldo0_1..mas_36` NO son montos confiables (en filas en
    mora suman exactamente 1,00).
  - **"AL":** es una calificación al día.
  - **Días de mora y cuota:** el buró de bancos no trae días por
    operación ni cuota; la calificación es el indicador de días, y la
    cuota conocida es sólo la de cooperativas.
- **Las palabras clave se buscan como palabras completas, no subcadenas.**
  "Daño moral" entraba como crediticia porque MORAL contiene MORA, y
  "abuso de confianza" porque CONFIANZA contiene FIANZA. Al pasar a
  palabras completas hay que agregar los plurales a mano ("FACTURAS",
  "CHEQUES"): una S opcional vuelve a traer "PRENDAS DE VESTIR".
- **Sonnet 5.5 desde marco-v28, y el ruido del modelo medido** (2026-10-03).
  En los 14 casos de validación, la configuración de producción corrida dos
  veces dio la misma recomendación 12 de 13 y movió el score 39 puntos en
  promedio: ese es el piso para decir que un cambio cambió algo. Sonnet 5.5
  con marco-v28 quedó dentro del ruido (12 de 13, ±42), a USD 0,067 contra
  0,101 y 22 s contra 55, razonando ~1.400 tokens contra ~4.500. Sonnet 5 se
  cortó en 1715532469 dos de cuatro veces, gastando los 10.000 tokens en
  razonar. El único cambio que no fue ruido: 0502937675 (ingreso "Por
  confirmar") pasó de aprobar a revisar con v28 en los dos modelos, y el
  negocio confirmó que revisar es lo correcto. Excel en
  `research/comparacion-marco-v28-2026-10-03/`.
- **El análisis lo escribe Sonnet, sin cascada** (marco-v24). La cascada
  con Haiku se validó por coincidencia de scores, no por el texto, y en
  los casos claros el texto lo escribía Haiku: en inglés, con nombres de
  campos y con los positivos que el marco prohíbe.
- **Lo que encarece el análisis es el razonamiento del modelo**, no el
  marco ni la respuesta. Medido el 2026-09-27:
  - la respuesta visible se mantuvo entre 950 y 1.700 tokens desde
    framework-v0;
  - el razonamiento pasó de ~900 tokens a 5.000 de promedio, y a 9.300
    en un caso, y se factura como salida.
  - **`max_tokens` es también un techo de tiempo.** Supabase corta la
    función a los 150 s y Sonnet escribe ~85-90 tokens por segundo: con
    6.000 el análisis de 1715532469 salió sin texto, y con 10.000 se
    cortó el JSON a los 110 s.
  - **La caché del marco no se leyó nunca**: 12 escrituras y 0 lecturas.
    Dura 5 minutos y entre dos análisis pasan 26 de mediana, así que se
    retiró.
  - Para comparar configuraciones: `scripts/comparar-razonamiento.mjs`,
    que arma un Excel.
- **Para recalcular grupos enteros desde el crudo:**
  `scripts/recalcular-grupos.mjs --grupos=a,b`. Tiene las mismas
  protecciones que el de fuentes de ingreso. Si cambian a la vez la
  estructura y fuentes de ingreso, cada script ve al otro como "el crudo no
  reproduce el perfil": primero `recalcular-grupos.mjs ... --ignorar=fuentesIngreso`
  (con `--bloqueo` si cambió el control de bloqueo) y después
  `recalcular-fuentes-ingreso.mjs`.
- **En una denuncia, el papel de la persona es lo que decide**
  (`_shared/denuncias.ts`, estructura-v9). La Fiscalía lista a todas las
  partes con su cédula. Hasta v8 el bloqueo por delitos de seguridad
  ciudadana no miraba el papel: 42 de 59 bloqueados eran quienes habían
  denunciado o sufrido una extorsión, testigos, un policía, un abogado.
  Y una denuncia sin la cédula de la persona no es suya: Novadata asocia
  por nombre, y en una el homónimo era el fallecido. Toda lectura nueva de
  denuncias usa esa regla.
- **ISSFAC e ISSPOL listan también a los familiares** ("Esposa de Militar
  en Servicio Activo"). Militar o policía es sólo el titular
  (`_shared/fuerzas-armadas-policia.ts`). No aportan al IESS: sin leerlos,
  un militar retirado con pensión quedaba "Informal o sin actividad".
- **"La fuente trajo datos" no es "la persona tiene registros".** El
  certificado de antecedentes penales responde "NO" y figura con datos,
  igual que SERCOP vacío. Por eso la disponibilidad que lee el modelo
  (marco-v25) dice sólo consultado / no consultado, por tema.
- **Parámetros que cambian cada año:** el SBU (`SBU_POR_ANIO`) y la
  fracción básica exenta del impuesto a la renta (`FRACCION_BASICA_RENTA`),
  los dos en `fuentes-ingreso.ts`. Un año que falta en la tabla de renta
  no da indicio; hay que agregarlo cuando el SRI la publique, y después
  correr `scripts/calcular-columnas-del-perfil.mjs`.
- **Las columnas copiadas del perfil se escriben en un solo lugar:**
  `columnasDelPerfil()` (`_shared/columnas-del-perfil.ts`) arma
  `fuente_segmento`, `fuente_estado`, `fuente_version`, `fuente_corte`,
  `fuente_piso_ingreso`, `perfil_laboral` e `indicios_ingreso`, que existen
  para que la base cuente y filtre (Panorama, Bandeja, lista de clientes).
  Todo lo que escribe `standard_profile` las escribe con esa función. Hasta
  el 2026-09-28 `recalcular-fuentes-ingreso.mjs` reescribía el perfil sin
  tocarlas, y el Panorama contó a 65 personas en el segmento anterior (12
  militares y policías retirados como "informal o sin actividad") mientras
  la ficha mostraba el nuevo. Si cambia la regla de una columna sin cambiar
  el perfil (un indicio, la tabla de renta, el perfil laboral), correr
  `scripts/calcular-columnas-del-perfil.mjs` (con `--seco` primero).
- **Las demandas se leen por categoría** (`_shared/demandas.ts`,
  estructura-v11). El texto de la Función Judicial es libre: 615 variantes
  en 4.602 demandas, con artículos del COIP, tildes rotas ("TR��NSITO") y a
  veces espacios dobles. Toda comparación normaliza las tres cosas antes
  de buscar palabras. Una investigación archivada o un trámite no es una
  demanda: tienen su categoría y no penalizan. Desde estructura-v12 también
  decide quién demanda, pero sólo cuando el tipo no dice el tema ("OTROS",
  "ESPECIAL"): si es un banco, una cooperativa de ahorro y crédito, una
  financiera o una emisora de tarjetas, es cobro. Quien demanda es
  `demanda.ofendido` (texto libre, con los abogados adentro).
- **La lista de delitos de seguridad ciudadana es una sola**
  (`_shared/delitos-seguridad.ts`). Hasta estructura-v10 estaba copiada en
  el perfil y en el bloqueo; agregar una palabra en una sola habría dejado
  al perfil diciendo una cosa y al bloqueo otra.
- **Aval es dos órdenes de magnitud más rápido que Novadata.** Una
  consulta a Aval tarda 890 ms de mediana (p95 1,3 s) contra los 41 s de
  Novadata: es UNA llamada, no 52. Las 200 salieron en 1 minuto a 197 por
  minuto con concurrencia 6, sin un solo reintento. Las cuentas de
  capacidad que se hicieron pensando en Novadata no aplican acá.
- **Novadata cambia formatos sin avisar** (2026-10-03, estructura-v13). En
  la reconsulta de la cartera el estado de algunos establecimientos del SRI
  llegó abreviado ("ABI", "CER") y mezclado con el de siempre. La regla
  buscaba "ABIERTO" exacto: 67 de 2.567 personas tenían mal el perfil, con
  la regla vieja el RUC activo daba 1.715 en vez de 1.774, y 9 tenían mal el
  segmento. Nadie lo
  vio en las pantallas: lo encontró el detector de eventos del Laboratorio
  como "19 negocios cerrados en una semana". Comparar dos consultas de la
  misma persona es un control de calidad de la fuente; una comparación de
  texto con un valor de Novadata va en una sola función
  (`establecimientoAbierto()` en `ruc.ts`).
- **Dos consultas de la misma persona difieren aunque no le haya pasado
  nada** (2026-09-25 contra 2026-10-03, 707 personas reales). El buró pasó
  del corte de julio al de agosto (104 "créditos nuevos" en 300 personas);
  cuatro cooperativas aparecieron de golpe para personas que antes no
  tenían nada con ellas (empezaron a reportar); un banco sumó 45 personas en
  un mes; el SRI agregó ceses de RUC con fecha de 2010 a 2024; y el IESS
  completó agosto después de la primera consulta (81 empleadores que
  "aparecían"). Todo lo que compare dos fotos tiene que separar esto de lo
  que pasó de verdad: `_shared/eventos-entre-consultas.ts` lo hace, y el
  procesamiento marca las entidades que empiezan a reportar mirando la carga
  entera.
- **Reconsultar la cartera entera tarda más que una tarea en segundo
  plano** (2026-10-03). 2.567 personas con concurrencia 20 son ~2 h 10 min
  (~19 por minuto) y el tope de una tarea en segundo plano es 2 h: se cortó
  con 2.353 hechas. `consultar-lote.mjs` retoma donde quedó; las que estaban
  en vuelo al corte se consultan dos veces (20 perfiles de más, sin daño).
- **Una simulación puede fabricar su propio problema** (2026-10-03). La
  primera corrida del ciclo simulado eligió al azar la entidad de cada
  crédito inventado: juntó créditos en entidades que nadie tenía (una, un
  banco en liquidación) y el procesamiento, con razón, las descontó como
  entidades que empezaban a reportar (288 créditos plantados perdidos).
  Antes de culpar al cálculo, mirar si lo plantado es realista; la carga
  quedó anulada, no borrada.
- **Que la segunda prueba no salga significativa no quiere decir que el
  efecto desaparezca** (2026-10-04). El explorador del crudo pregunta si el
  modelo ya tenía un campo comparando dentro de cada recomendación. Con una
  segunda corrección por comparaciones múltiples sobre 853 condiciones, la
  licencia vencida plantada (razón de momios 1,80 cruda y 1,68 dentro de
  cada recomendación: casi intacta) salía como "el modelo la tenía", y lo
  mismo todo menos la calificación E. Lo que decide es cuánto del efecto
  sobrevive (la mitad o más: el modelo no lo tenía), no si una segunda prueba
  alcanza con los casos que hay.
- **GitHub Pages se apaga si el repositorio pasa a privado sin plan pago**
  (2026-10-04). Desde el 2026-10-03 el despliegue fallaba con "Ensure GitHub
  Pages has been enabled" y la aplicación daba 404 en todas las páginas; el
  código y el build estaban bien. Ante un 404 general, mirar primero el paso
  `deploy` del flujo (`gh run view <id> --log-failed`) y la visibilidad del
  repositorio.
