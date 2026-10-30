# Funciones, `_shared/` y base

Se carga al trabajar en `supabase/`. Las reglas de migraciones y de
despliegue están en el CLAUDE.md de la raíz (reglas duras 1, 3, 5, 6, 8 y
9). Acá está dónde vive cada regla del negocio y lo que costó caro aprender
en cada tema; el caso, la fecha y los números de cada lección, en
`docs/lecciones.md` (leer la entrada antes de tocar esa área). Equifax tiene
su guía: `docs/equifax.md`.

## Dónde está cada cosa

- `supabase/functions/_shared/` — código compartido entre Deno y el
  navegador. `identificacion.ts` (qué se escribió en el buscador) y
  `calidad-de-la-consulta.ts` (¿sirve lo que contestó la fuente?) los
  importan los dos mundos. **Una sola implementación, nunca una copia**:
  las copias es como aparecen las diferencias silenciosas.
- `process.ts` → `buildStandardProfile` arma el perfil estandarizado
  (~145 campos en 17 grupos).
- `fuentes-ingreso.ts` — clasifica de qué vive la persona. Tiene su
  propia versión (`FUENTES_INGRESO_VERSION`).
- `marco-interpretativo.ts` — el prompt del modelo. `MARCO_VERSION` al
  final. **Cada versión nueva necesita su fila en
  `scoring_rules_versions` o falla la clave foránea.**
- `perfil-del-modelo.ts` — lo ÚNICO que lee el modelo (ver abajo).
  `nombres-ingresos.ts` — los nombres de ingresos que comparten la
  pantalla y el modelo.
- `llm-scoring.ts` → `armarPedidoScoring()` arma el pedido al modelo y
  `CONFIG_LLM` decide el razonamiento y el tope de salida. Lo usan el
  análisis, el lote (`scripts/analizar-en-lote.mjs`) y
  `scripts/comparar-razonamiento.mjs`: un camino nuevo al modelo también.
  Modelo: `claude-sonnet-5-5` desde marco-v28.
  - `huellaDelPedido()` (119): con la misma huella, un análisis terminado
    de esa misma persona se reutiliza en vez de volver a preguntar (E1).
  - La huella no cuenta `cache_control` ni `max_tokens`.
  - `puntuarPedido()` llama al modelo con un pedido ya armado.
- `marco-por-cliente.ts` → `componerMarco()` — el marco sin las secciones
  de temas que el perfil no trae (toma el número de versión libre al
  encenderse; la v29 fue E27). Corta el marco vigente por marcas,
  sin copiarlo; está APAGADO (`CONFIG_LLM.marcoPorCliente`) hasta validarlo.
- `fila-del-analisis.ts` → `filaDelAnalisis()` — la fila de
  `analysis_results`, la única para `analyze-client` y el lote.
- `simulador-credito.ts` → `simularCredito()` — la cuota de un crédito de
  consumo con el desgravamen, en centavos enteros, y su tabla. La usan la
  pantalla `/simulador`, la función `simular-credito`, la capacidad de pago y
  `evaluar-solicitud`, y la usará la API: no se copia la fórmula. Los parámetros del producto (`PRODUCTO_CONSUMO`: Tasa
  mínima de 0% y Tasa máxima de 15,6%, desgravamen de 0,6% anual, monto de USD
  1.000 a 120.000 y plazo de 6 a 120 meses) son del negocio (2026-10-17; las tasas,
  el monto y el plazo, del 2026-10-19). Sin tasa se evalúa con la máxima; se dice
  «Tasa máxima» y «Tasa mínima», no «tope». Cada error de las condiciones lleva un
  código (`erroresDelPedido()`, `ErrorDeCondiciones` en el contrato). El plan de
  la demo, con lo que falta, en `docs/plan-demo-ifi.md`.
  `montoMaximoParaCuota()` busca el monto con el mismo simulador, no con la
  fórmula invertida (con el seguro y el redondeo, invertirla pasaba el tope).
- `capacidad-de-pago.ts` → `datosDeCapacidad()` y `evaluarCapacidad()` — si la
  cuota entra en el ingreso neto reportado al IESS, sumada a lo que ya paga.
  Una deuda sin cuota se lista aparte, nunca como cero. La usan la pantalla
  `/capacidad/:cedula`, la función `capacidad-de-pago` y `evaluar-solicitud`.
  El **Ingreso declarado** (lo que dice recibir quien pide el crédito) reemplaza
  al del IESS en el cálculo y se rotula «sin verificar» (`conIngresoDeclarado()`).
- `modalidades.ts` y la función `evaluar-solicitud` (133) — la solicitud de
  crédito (tabla `solicitudes`) y su evaluación en Básico, Pro o Plus. Corre UN
  paso por llamada (Novadata y el modelo juntos pasan los 150 s) y llama a las
  funciones de cada módulo con la sesión de quien pidió; toma el paso con la
  fila que devolvió la actualización (un paso de Equifax se cobra, y la
  consulta que falta sólo la hace un admin). El modelo y la capacidad van por
  separado (negocio, 2026-10-17). En el contrato son `modalidad` y
  `resultado.capacidadDePago` de `POST /evaluaciones`; lo que el contrato dice y
  esta función todavía no hace está en `docs/pendientes.md`, sección 1. Una tabla nueva con
  datos de la persona: `suprimir_titular()` la borra y está en
  `derechos-del-titular.mjs` y `auditar-seguridad.mjs`.
  El cuerpo de `crear` usa los nombres de `PedidoDeEvaluacion` de la
  especificación: las condiciones y el Ingreso declarado van juntos en
  `solicitudDeCredito`; `autorizacion`, `referencia`, `operador`, `prioridad` y
  `reemplazaA` son opcionales y se guardan (135, `datos-de-la-solicitud.ts`; de la
  autorización, la huella y nunca el documento). Un paso fallido guarda su
  `Fallo.codigo` (`falloDeUnPaso()`). Las condiciones que llegan de afuera pasan
  por `condicionesDelPedidoExterno()`: el tope de la tasa es del producto, nunca
  del cuerpo.
  La decisión de la institución (Aprobado / Rechazado / Desistió) la marca el
  analista en la solicitud, con motivo (acción `decidir`, `decidir_solicitud()`,
  134): vale la última y todas quedan en `decisiones`.
- `estado-de-la-persona.ts` → `estadoDeLaPersona()` — el estado de la persona
  (Prospecto, En proceso, Preaprobado, Aprobado, No aprobado) calculado desde sus
  solicitudes, nunca guardado a mano. Manda la última solicitud; Preaprobado es
  sólo con la evaluación terminada y el modelo en Aprobar. El código de «En
  proceso» es `con_solicitud`: `en_proceso` ya es un estado de la evaluación en
  el contrato. Cliente activo y Cliente cerrado esperan a que existan los créditos.
- **La API para instituciones (núcleo, 2026-10-21; todavía sin desplegar).** Una evaluación
  de la API es una fila de `solicitudes` con `origen = 'api'` (139): los mismos pasos y
  módulos que usa la pantalla, y la `modalidad` decide cuáles corren (un flujo nuevo es una
  entrada más en `MODALIDADES`, no un camino aparte). Quien la hace avanzar es el trabajador,
  no la pantalla:
  - `api-v1` (función) valida, guarda y contesta enseguida (202, o 200 con `Prefer: wait=N`);
    `GET /evaluaciones/{id}` lee el estado y el resultado. Hoy exige la sesión de un
    administrador (apagada para terceros hasta tener OAuth y el ambiente de prueba).
  - `procesar-evaluaciones` (función, sin JWT, clave `x-vigia-clave`) reclama con
    `reclamar_evaluaciones()` (`for update skip locked`, tope de 8 en vuelo) y corre UN paso
    por invocación; se despierta desde la agenda cada minuto, desde la puerta y desde sí mismo.
  - Los pasos viven en `pasos-de-evaluacion.ts` y llaman a los módulos directamente
    (`consulta-de-perfil.ts`, `analisis-de-la-persona.ts`, `equifax-persistencia.ts`), no a
    las funciones por HTTP: así el trabajador es la única pieza con el poder de cobrar a
    Equifax y de gastar modelo, sin una puerta más en esas funciones. `structure-client` y
    `analyze-client` son envolturas de esos módulos; `evaluar-solicitud` (pantalla) sólo
    comparte `pasoCapacidad` por ahora.
  - `cola-de-evaluaciones.ts` decide, con funciones puras, qué se anota después de cada paso:
    un fallo pasajero se reintenta con espera (30 s, 2, 5, 10, 20 min; tope de intentos por paso: perfil 5, buró 3, análisis 5, capacidad 3, contados al TOMAR el paso) y
    uno definitivo (`identificacion_no_encontrada`, `tope_diario_agotado`) cierra la
    evaluación. Para la API `fallida` es final: el trabajador nunca la deja ahí si queda algo
    que reintentar; si el próximo intento caería fuera del plazo (15 min interactiva, 24 h
    diferida) se cierra ya con `plazo_vencido`. El id público es `ev_` + el uuid en base32.
  - `pedido-de-evaluacion-api.ts` valida el pedido (campos de más = error; persona,
    autorización, referencia y operador obligatorios; `modalidad` sin decir es `basico`);
    `evaluacion-de-la-api.ts` arma la `Evaluacion`. Con `completitud: parcial` (falta un
    tema crítico) la recomendación nunca es «aprobar» (D6): la regla es de la entrega, el
    análisis guardado no se toca. El mensaje que leyó el modelo no sale.
  - En Plus, sin consulta de Equifax vigente, la API consulta y se cobra (negocio,
    2026-10-21), con el tope diario de siempre. Pruebas de punta a punta: sólo con el
    sandbox; nunca con personas reales en producción.
  - Los errores son `application/problem+json` (`problema.ts`); `cuerpo-invalido` lleva el
    puntero JSON de cada campo. Las funciones que no atiende un navegador usan
    `cabecerasSinCors()`, que sí lleva el sello del despliegue (el corredor lo confirma con
    OPTIONS).
- `variables-de-ingreso.ts` — el vector de entrada del predictor de ingresos (niveles 1 y 2)
  desde el perfil y las tablas de Equifax (`equifax_analisis_credito`, desde la 138). Una sola
  implementación: lo que no coincide con el extracto de AWS con el que se entrenará el modelo
  queda en `pendientes` y en `docs/especificacion-predictor-de-ingresos.md`, sección 9, punto 1;
  se mide con `node scripts/probar-paridad-variables-de-ingreso.mjs` (necesita `research/`).
  Sin RUC es un dato; sin respuesta de la fuente no lo es.
- `predictor-ingresos.ts` — el evaluador del predictor de ingresos: lee el modelo exportado
  (`crediscope-arboles-1`, `scripts/predictor-ingresos/FORMATO.md`), evalúa los doce cuantiles en
  logaritmo y arma la respuesta (`estimarIngreso()`). El Python `evaluador_referencia.py` es la
  definición: ante una duda manda él. La prueba de oro usa el modelo real (fuera de git) sólo si
  existe `PREDICTOR_INGRESOS_MODELOS`; en la integración continua corre un modelo chico inventado.
  Un modelo nuevo no cambia el formato. En Windows la prueba con el modelo real se corre desde
  PowerShell: Git Bash cambia las rutas de `--allow-read`.
- **Cada módulo tiene su propia puerta** (negocio, 2026-10-17): un módulo nuevo
  es una función propia que se llama sola (`simular-credito`,
  `capacidad-de-pago`) y una operación propia en `api/openapi.yaml`, además de
  lo que use la evaluación entera (`POST /simulaciones` y `POST
  /capacidades-de-pago`, con sus ejemplos calculados con el código). El marco y
  el modelo se tocan al final, cuando lo demás esté pulido.
- `columnas-del-perfil.ts` → `columnasDelPerfil()` — las columnas de
  `client_profiles` que copian algo del perfil (cómo se recalculan, en
  `scripts/CLAUDE.md`).

## Pruebas

- **Pruebas de las funciones**: `supabase/functions/_shared/*.test.ts`. Se
  corren con:
  - `npx --yes deno@2.9.6 test --no-lock --allow-env --allow-read=supabase/functions supabase/functions/`
  - `npx --yes deno@2.9.6 check --no-lock supabase/functions/*/index.ts`

  Las corre también la integración continua. Una regla nueva en `_shared`
  lleva su prueba.
- Una prueba con la hora fija (`AHORA`) no mezcla filas con la hora real. La
  base simulada de Equifax compartía una lista entre dos bases: la prueba del
  freno pasó hasta las 14:50 UTC del 2026-10-20 y desde ahí falló en todo PR
  (#73). `baseFalsa()` copia lo que recibe.

## Lo que costó caro aprender

**Consultas y disponibilidad**
- Cédula: sólo se valida el dígito verificador. La regla del tercer
  dígito es falsa (hay personas reales con 6).
- Una consulta que no contestó ninguna fuente no se guarda: sale una
  ficha en blanco igual a la de alguien sin historial.
- "La fuente dice que no hay" ≠ "la fuente no contestó".
  `metaConsulta`: `fuentesConDatos` / `fuentesSinDatos` /
  `fuentesNoMedidas`. Ver `docs/declaracion-de-disponibilidad.md`.
- "La fuente trajo datos" ≠ "la persona tiene registros" (antecedentes
  "NO", SERCOP vacío). Al modelo le llega sólo consultado / no
  consultado, por tema.
- Los 9 bloques se retiraron (078); quedan 52 fuentes planas. `ejes_ok`
  ya no se escribe pero NO se borra. ¿Sirve el perfil? `elPerfilSirve()`.
- Dos formas conviven: `laboral.empleoActual` (objeto, antes de
  marco-v20) y `empleosActuales` (arreglo). Leer las dos.

- **Cada fuente de Novadata espera como mucho 120 s**
  (`PLAZO_POR_FUENTE_MS`), y la consulta pide un solo token, compartido.
  Antes eran 52 inicios de sesión simultáneos con el token vencido (E5).
  - Medido el 2026-10-09: en el uso normal una consulta tarda menos de un
    minuto, y la cola cerca del corte de 150 s es de las reconsultas
    masivas.
  - La duración de cada fuente se guarda en
    `client_profiles.duracion_por_fuente_ms` (119): el plazo se ajusta con
    esos números, no a ojo.
  - La cola asincrónica es de la sesión de la API para IFI; su migración
    toma el número libre al aplicarse (regla 1).

**Base y procesos**
- **Una cola con un paso que se cobra cuenta el intento al tomarlo**, no al fallar, y un
  fallo cobrado y no guardado no se reintenta (`noReintentar`). Dos evaluaciones de la
  misma persona no se ceden a la vez: cede la que empezó después. Una evaluación de la
  API la hace avanzar sólo su trabajador (`evaluar-solicitud` la rechaza con 409).
- Reencolar ítems de un lote `terminado` no lo reabre.
- pg_net está en el esquema `net`. Una tarea programada se verifica en
  `cron.job_run_details`, no en `cron.job`.
- Una CTE usada una sola vez dentro de una subconsulta correlacionada se
  recalcula por cada fila de afuera: `as materialized`. El centro de datos
  del Laboratorio la recalculaba 52 veces, una por fuente (121).
- Leer un campo de `standard_profile` descomprime el perfil entero. En una
  consulta sobre muchos perfiles, se eligen primero las filas sin tocarlo y
  el JSON se lee sólo de las elegidas, o la condición va a un índice
  parcial. Así tardaban 3,5 s el corte del IESS (121) y 5,3 s la primera
  página de la bandeja (123).
- **La bandeja, Monitoreo y Fuentes de ingreso leen `resumen_por_persona`**
  (124): una fila por persona con lo que muestran de su último perfil y su
  último análisis.
  - La escribe sólo `refrescar_resumen_por_persona()`: una regla nueva de
    esas pantallas va ahí, no en la vista ni en la función del tablero.
  - La llaman disparadores por sentencia en `client_profiles`,
    `analysis_results`, `clients` y `consultas_equifax`, y `proveedores` al
    cambiar el buró (132). Al insertar o actualizar, un fallo no frena la
    consulta (queda un aviso); al borrar sí, porque borrar es la supresión de
    un titular.
  - Cada noche la reconstruye `reconstruir_resumen_por_persona()` (pg_cron
    `resumenes-crediscope`, 00:10 de Ecuador), por si un disparador falló.
    También devuelve a Novadata a quien se le venció la consulta del buró el
    18 a las 00:00: la vigencia vence sin que nada cambie en la base.
  - **Con una consulta vigente del buró de la institución (132), las marcas
    de Monitoreo salen del buró**: `calificacion_baja` es más de 90 días en
    bancos (D empieza a los 91) y `tiene_mora`, el monto en atraso de bancos y
    cooperativas; `consulta_buro_id` dice de qué consulta salieron. La regla
    de la consulta vigente es `buro_vigente_de_la_persona()`, la copia en SQL
    de `_shared/buro-de-la-institucion.ts`; si cambia una, cambia la otra.
    `docs/propuesta-dias-de-mora-con-buro.md`; se mide con
    `node scripts/medir-dias-de-mora-con-buro.mjs`.
  - Medido el 2026-10-12: la primera página de la bandeja, de 570 ms a 6 ms;
    Monitoreo, de 1,3 s a 126 ms; Fuentes de ingreso, de 1,4 s a 179 ms.
- **El centro de datos suma `consultas_por_dia_y_fuente`** (125), por día de
  Ecuador y por fuente.
  - Los días cerrados los rehace `refrescar_consultas_por_dia()` cada noche
    (pg_cron `resumenes-crediscope-dias`, 00:20 de Ecuador, los últimos 40
    días); lo que todavía no se resumió, normalmente hoy, se cuenta al
    momento.
  - La "última semana" y el "mes anterior" son días de Ecuador, no horas
    corridas.
  - Al marcar o desmarcar una persona sintética, o al corregir algo de hace
    más de 40 días: `select refrescar_consultas_por_dia(null)`.
  - Medido: de 1,3 s a 28 ms para 120 días.
- **Se descartó resumir en la primera consulta del día** (decisión del
  2026-10-12): esa persona espera el cálculo entero, con una cartera grande
  vuelve el corte de 8 s, y lo que entra en el día no aparece hasta mañana.

**Crudo de Novadata**
- El crudo de Novadata se guarda desde la 090 en el depósito privado
  `crudo-novadata` de Storage (gzip, ~8 KB), con la ruta en
  `client_profiles.crudo_ruta` (null = no se guardó). Lo escribe sólo
  `_shared/crudo-novadata.ts`, desde las tres puertas que guardan perfiles.
  A Storage con supabase-js se suben bytes, no un `Blob`: con un `Blob`
  ignora `contentType` y el depósito lo rechaza (así no se guardó ningún
  crudo hasta el 2026-10-04).
  Lo que leyó el modelo queda en `analysis_results.mensaje_al_modelo`.

**IESS, ingresos y fuentes de ingreso**
- El corte del IESS es `corte_iess_vigente()` (083): el mes más reciente
  con ≥20 clientes en 90 días. Quien trae un mes posterior usa el suyo.
  Su condición sobre el perfil se repite en el índice parcial
  `client_profiles_corte_iess` (121): sin él abría el perfil entero de cada
  consulta de 90 días, 3,5 s antes de cada consulta. Si cambia la
  condición, cambia el índice.
- Empleo actual e ingresos leen el mismo registro: el empleo cae a los
  aportes cuando el mecanizado no trae nada.
- Meses que Novadata no publicó para nadie (2018-02, 2019-09..11,
  2020-01..03, 05, 06, 08, 11) no cortan la continuidad. La antigüedad
  sale de `fecIng`, no del primer aporte (`continuidadLaboral`).
- Aportar por cuenta propia cuenta como trabajo sólo en meses con RUC
  activo; el RISE siempre. La regla es `reglaDeTrabajo()`
  (`fuentes-ingreso.ts`) y la usan la continuidad y, desde estructura-v14,
  la antigüedad en el empleo actual: antes contaba cualquier afiliación y
  salía más larga que la continuidad en 35 personas.
- "Es su propio patrono": sólo `_shared/patrono.ts` (RUC = cédula +
  001/002/003; el nombre sólo sin RUC). El dueño en su propia nómina no
  lo hace empleador.
- "RUC activo": sólo `_shared/ruc.ts` (cuenta el cese temporal, exige un
  establecimiento abierto). Novadata manda el estado "ABIERTO" o "ABI":
  `establecimientoAbierto()` es la única comparación (estructura-v13).
  Inactivo sólo con una fecha que lo respalde (negocio, 2026-10-29,
  estructura-v15): sin fecha de inscripción es un RUC; un establecimiento que
  reabrió después de su último cierre está abierto aunque el estado diga
  cerrado, y uno sin estado, salvo una fecha de cierre. Un «ABIERTO» sin la
  fecha de reapertura sigue abierto, y un «CERRADO» sin fechas, cerrado.
- Segmento ≠ perfil laboral (`_shared/perfil-laboral.ts`, columna
  `client_profiles.perfil_laboral`, fuera de `standard_profile`).
- No se especula sobre el ingreso: un ingreso mayor sólo con
  `indiciosDeIngresoMayor()`. Nunca se muestra "cómo puede fallar".
- ISSFAC/ISSPOL listan familiares: militar o policía es sólo el titular
  (`_shared/fuerzas-armadas-policia.ts`).
- Parámetros anuales en `fuentes-ingreso.ts`: `SBU_POR_ANIO` y
  `FRACCION_BASICA_RENTA`. Un año sin renta no da indicio; al agregarlo,
  correr `calcular-columnas-del-perfil.mjs`.
- **Predictor de ingresos** (`docs/especificacion-predictor-de-ingresos.md`):
  una variable de entrenamiento sale de la misma función que la sirve, o se
  mide su paridad antes de usarla. La actividad y la antigüedad declaradas de
  AWS coincidían con el SRI en el 58% y el 19%; no se usaron
  (`docs/lecciones.md`).

**Buró, Aval y Función Judicial** (Equifax, en `docs/equifax.md`)
- Buró de Novadata: `riesgo` T/G/C separa lo propio de lo garantizado;
  el atraso puede estar en `noDevengaInteres`; los tramos
  `saldo0_1..mas_36` no son montos; "AL" es al día; no trae días de mora
  ni cuota (la cuota sólo en cooperativas).
- Aval mezcla filas de totales (`"-"`, `"TOTAL"`,
  `sistemaCrediticio: "TOTAL"`): buscarlas antes de sumar un segmento.
- El ambiente de prueba de Aval contesta por otra persona:
  `consultas_aval.ambiente = 'prueba'` (derivado del host, default
  `prueba`) no sirve para calificar a nadie.
- Aval tarda ~0,9 s por consulta contra ~41 s de Novadata: las cuentas de
  capacidad de Novadata no aplican.
- Aval: las consultas de NOVACREDIT en su lista son nuestro propio tráfico;
  `consultas12m` y `entidadesDistintas12m` se cuentan sin esa entidad.
- Denuncias: decide el papel de la persona y sólo cuenta con su cédula
  (`_shared/denuncias.ts`). Delitos de seguridad: lista única en
  `_shared/delitos-seguridad.ts`.
- Demandas por categoría (`_shared/demandas.ts`): normalizar tildes
  rotas, espacios y artículos; archivo o trámite no penaliza; si el tipo
  no dice el tema, decide quién demanda (institución financiera = cobro).
- Palabras clave como palabras completas (MORAL contiene MORA); los
  plurales se agregan a mano, sin S opcional.

**El modelo**
- El modelo lee SOLO el perfil del modelo (`armarPerfilDelModelo()` /
  `mensajeParaElModelo()`). Todo camino nuevo pasa por ahí; cambiar lo
  que arma es versión nueva del marco con su fila en
  `scoring_rules_versions`. De `fuentesIngreso.detalle` va sólo un
  resumen; la renta nunca.
- **El perfil del modelo no lleva identificadores y sí los atributos de la
  persona** (E27, cerrado el 2026-10-20; el detalle está en `auditoria/` y en
  `docs/cumplimiento/ficha-del-modelo.md`, fuera de git).
  - marco-v29 saca la cédula, el nombre y los empleadores (cada empleo llega
    con su tipo). Las listas viven en `perfil-del-modelo.ts`:
    `IDENTIFICADORES_QUE_NO_LLEGAN` (fijos) y `ATRIBUTOS_PROTEGIDOS` (sexo,
    estado civil, origen, familia, edad: `true` = llega). **El negocio decidió
    el 2026-10-20 que llegan** (bloque B): son parte del análisis cualitativo
    y no tienen conflicto legal. El marco los lee como contexto y dice que no
    pesan en el score (grupo 12, desde v11); cambiar eso, o pasar uno a
    `false`, es versión nueva del marco.
  - Desde marco-v30 cada empleo y cada aporte dicen de quién son
    (`esSuPropioPatrono`, `posibleNegocioFamiliar`), calculados con el nombre
    antes de borrarlo con `relacionConEmpleador()` (`patrono.ts`, la misma
    que usa `process.ts`). El modelo no infiere parentescos de nombres: dejó
    de hacerlo solo en v8, por eso se calcula en el código desde v17.
  - Lo que el perfil guarda sólo para el predictor de ingresos no llega
    (`CAMPOS_DEL_PREDICTOR_QUE_NO_LLEGAN`, dentro de `RUTAS_QUE_NO_LLEGAN`).
    El obligado a llevar contabilidad (estructura-v15) ya le llega
    interpretado en `fuentesIngreso`, y así el mensaje siguió siendo el de
    marco-v30 (decisión del negocio del 2026-10-29).
  - Un número de 10 dígitos o más en cualquier texto se tapa: el filtro por
    nombre de campo no ve una cédula escrita en el cargo. Y todo número
    llega entero (v29, decisión del negocio): el modelo copia los números
    tal cual y en crédito los centavos no deciden nada.
  - Los documentos afirman sólo lo medido: sin cédula, nombre ni
    empleadores, y con los atributos de la persona. Antes de v29 siete
    documentos afirmaban una minimización que no existía.
  - Una afirmación sobre lo que lee el modelo se mide en
    `analysis_results.mensaje_al_modelo`, no en el código: lo mide
    `auditar-seguridad.mjs` (el último mensaje) y, sin llamar al modelo,
    `scripts/validar-perfil-del-modelo.mjs` (regla 13, todos los perfiles).
- Escribe Sonnet 5.5 desde marco-v28 (sin cascada con Haiku desde v24).
  El mismo perfil analizado dos veces mueve el score ~40 puntos y cambia 1
  de cada 13 recomendaciones: una diferencia menor que eso no se atribuye
  a un cambio. La respuesta la garantiza un esquema JSON.
- Para analizar muchos clientes: `scripts/analizar-en-lote.mjs` (API de
  lotes, mitad de precio, marco cacheado, `llm_llamadas.tarifa = lote`).
- Lo caro es el razonamiento, no el marco. `max_tokens` es también techo
  de tiempo: Supabase corta a 150 s y Sonnet escribe ~85-90 tokens/s.
  Sin caché del marco (nunca se leyó). Comparar configuraciones:
  `scripts/comparar-razonamiento.mjs`.
