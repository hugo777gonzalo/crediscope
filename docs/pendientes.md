# Pendientes

Sólo lo abierto. Lo hecho se borra y queda en su PR; lo medido que todavía sirve
vive en el documento de su área (`docs/lecciones.md`, `docs/laboratorio-guia.md`,
`docs/propuesta-estructura-equifax.md`, `docs/plan-demo-ifi.md`...). Cada punto dice
qué falta, por qué importa, quién lo destraba y cómo se verifica. Los números son
de la fecha que dice el estado vigente: antes de actuar sobre uno, volver a medirlo.

**Regla del negocio (2026-10-03):** toda prueba masiva con el modelo (comparaciones,
lotes) se corre sólo con su autorización explícita y el costo estimado. Una llamada
suelta para comprobar un despliegue está aceptada. **Cada consulta a Equifax se
cobra** (USD 0,40): no se corre ninguna sin autorización.

## Estado vigente (cada línea dice cuándo se midió)

- **Base:** última migración aplicada, la **140** (2026-10-30; no hay 137: la del PR 82 pasó a 139),
  y `ESQUEMA_MINIMO` está en 139. Se midió con el corredor, y `auditar-seguridad.mjs` dio 76 de 76
  después de aplicarla. **La 140** saca de la agenda la
  clave que la 139 dejó en texto plano.
- **Funciones:** sello **`36dbe4af0dde`**, 12 de 12, desplegado el 2026-10-30 a las 21:45 sobre el
  esquema 139. `despliegues` anota 11 de 12 porque cada corrida falló en una función distinta al
  subirla; el sello de las 12 se midió con OPTIONS y con `auditar-seguridad.mjs`. El anterior fue
  `dabb60be9f3c`. El núcleo de la API está desplegado y apagado para terceros, y la consulta y el
  análisis de la pantalla, que el PR 82 reescribió por dentro, **todavía no corrieron con este
  código contra una persona**.
- **Versiones en producción:** marco-v30 con Claude Sonnet 5.5 (marco-v31, el buró de la
  institución, construido y apagado: su fila está en la 131); estructura-v15 y fuentes-v11 (el último
  perfil de las 3.764 personas reales, recalculado el 2026-10-30; las 240 sintéticas quedaron en v3),
  perfil-laboral-v3, simulador-v4, capacidad-v3. La estructura y las fuentes salen de la base
  (`structure_version`, `fuente_version`); el resto, del código de `main`.
- **Personas (2026-10-28, `clients`):** 3.764 reales y 240 sintéticas. **1.191 reales son nuevas
  desde el 2026-10-21**, casi todas del lote de paridad del predictor del 2026-10-28 (1.176
  independientes de la base de AWS consultados a Novadata, base legal «Contrato NovaCredit: cartera
  con crédito vigente»; `docs/investigacion-predictor-de-ingresos.md`, 12.29). Entran en los totales
  de la cartera, la bandeja y Monitoreo como cualquier persona real, y 553 de sus perfiles quedaron
  con la respuesta incompleta de Novadata (HTTP 502; punto 2.18). **Son cartera: no se marcan
  aparte** (negocio, 2026-10-29).
- **Análisis (2026-10-29, `analysis_results`):** 207 con marco-v28 (el último del 13/10) y 8 con
  marco-v30 (el último del 18/10), todos de personas reales; **ninguno nuevo desde el 18/10**. Los 73
  restantes son de versiones anteriores a la v28 (288 en total).
- **Equifax (2026-10-29):** 88 consultas, y **sólo 1 del ciclo vigente** (va del 18/10 al 17/11; las
  87 anteriores caducaron).
- **Modelo (2026-10-29, `gasto_del_mes`):** octubre lleva **USD 9,66 de los 10** del presupuesto
  (3.037 llamadas, ninguna sin medir). Desde el 2026-10-20 las 940 llamadas son todas pruebas del
  vigía; no hubo análisis.
- **Control de seguridad:** 74 de 74 en orden el 2026-10-29 (`auditar-seguridad.mjs`, desde la
  carpeta principal), el primero después de la 138 y del despliegue del 2026-10-28. Sigue
  marcando como «INFO» que GitHub Pages no manda las cabeceras de seguridad (las trae la mudanza,
  punto 2.15).

- **Freno por consulta incompleta (2026-10-31, negocio):** el modelo no corre sin las fuentes que
  deciden (`FUENTES_QUE_DECIDEN`). Alcanza a 670 de los 3.765 últimos perfiles reales, que hay que
  reconsultar antes de analizarlos. El análisis de c-79e1ac23 del 2026-10-31 se hizo antes del freno y
  sigue guardado: se reemplaza al reconsultarla. Los tres perfiles de ese día dieron error en 41
  fuentes; parece una caída de Novadata, sin confirmar.

## 1. Lo que Claude puede hacer ya

1. **Laboratorio, paso 1: registrar el Universo.** Falta registrarlo como solicitudes reales
   (cartera propia, sin institución); el negocio dijo el 2026-10-13 que se retomaba la semana del
   2026-10-19, y esa semana pasó sin que entrara nada del Laboratorio a `main`. **Queda sin fecha**
   (negocio, 2026-10-29). Importa porque sin él no hay punto de partida para la reconsulta del 25/12.
   Lo hace Claude en una sesión (`docs/laboratorio-guia.md`, paso 1; sin pantallas nuevas hasta
   el paso 4). Se verifica con los conteos por origen y por análisis; antes hay que decidir el
   t0 de los 200 del lote del 07/10, que se analizaron sobre la consulta del 03/10.
2. **API para la institución, Fase 1: lo que falta después del núcleo.** El núcleo del flujo
   Plus está construido (2026-10-21, PR de la rama `claude/api-plus-nucleo`, sin desplegar):
   la cola en `solicitudes` (139), el trabajador `procesar-evaluaciones` y la puerta `api-v1`
   con `POST` y `GET /evaluaciones`, idempotencia, `Prefer: wait`, errores RFC 9457, resultado
   con positivos, negativos y razonamiento, y `cumple` en la capacidad. **No está desplegado:**
   la 139 se aplica recién fusionada y antes de `--funciones` (sube `ESQUEMA_MINIMO`), y el
   número se toma al aplicarla. Falta:
   - **OAuth con `private_key_jwt`** y la tabla de clientes de API con sus alcances: hoy la
     puerta exige la sesión de un administrador (apagada para terceros);
   - topes por minuto y por día con los encabezados `RateLimit`, y el 503 `capacidad-agotada`
     por espera estimada (hoy sólo el tope de evaluaciones en curso);
   - avisos firmados (`evaluacion.terminada`), `POST /evaluaciones/{id}/decision` y
      `/cancelacion`, y las puertas sueltas `/simulaciones`, `/capacidades-de-pago` y
      `/estimaciones-de-ingreso` (esta última traduce `evaluacion`, `ev_...`, a `solicitudId`);
    - **el sandbox está construido y sin desplegar** (`supabase/CLAUDE.md`): falta desplegar y poner
      `API_SANDBOX=activo` para usarlo. Requisito de OAuth: una credencial de sandbox acepta sólo las
      identificaciones de prueba;
   - D5: al vencer el plazo con el modelo caído, entregar `sin_veredicto` con el perfil y la
     capacidad en vez de `fallida` (hoy el paso del modelo se reintenta y, vencido el plazo,
     la evaluación termina `fallida`/`plazo_vencido`);
   - el perfil estandarizado opcional (`recibirPerfil`: hoy se valida y no se entrega);
   - pasar `evaluar-solicitud` (la pantalla) a los pasos compartidos (`pasos-de-evaluacion.ts`),
     que hoy sólo usa para la capacidad: "una sola puerta";
   - lo que dejó la revisión de Opus del 2026-10-21 sin arreglar: (a) dos evaluaciones
     simultáneas de la misma persona consultan Novadata y el modelo dos veces (sólo el buró
     tiene el control de «en curso»); (b) si el trabajador puede vivir más de 180 s (plan pago:
     400 s), un paso largo se retoma con el original vivo: hace falta un token por toma
     comprobado al anotar; (c) `POR_INVOCACION = 4` pasos pesados en un proceso: medir CPU y
     memoria; (d) `referencia`, `operador_id` y `autorizacion_id` van a `audit_log.meta` (como
     en la pantalla desde la 135) y una institución puede poner ahí una cédula, que la supresión
     no borra; (e) el trabajador se despierta recién al terminar la ronda entera.
   Devuelve los datos completos de la persona según el contrato; lo que viene de una fuente
   depende de que el contrato con esa fuente permita entregarlo (Novadata: 3.3). Lo hace Claude
   (D6 a D15, 2.9). Se verifica con el lint estricto de Redocly y con `deno test`; de punta a
   punta, sólo con el sandbox (una prueba en producción no consulta a personas).
3. **La puerta de la API: lo que la especificación dice y el código no hace.** Quedan las
   validaciones de `POST /capacidades-de-pago` (máximos de ingresos y deudas, `parametros`
   fuera de 0 a 1 que hoy se ignoran), que no se pasaron a `api-v1` porque esa operación suelta
   todavía no está en la puerta. La validación de `POST /evaluaciones` sí cumple
   `additionalProperties: false`. Lo hace Claude; una prueba por promesa.
4. **Antigüedad: `duracionEmpleoMasLargoMeses` sin la regla.** Cuenta el aporte propio desde
   la fecha de ingreso, no con `reglaDeTrabajo()` como la antigüedad desde estructura-v14, así
   que el empleo más largo puede ser el mismo empleo actual con más meses. Lo hace Claude:
   estructura-v15 y `recalcular-grupos.mjs --grupos=laboral` (`--seco` primero). Se verifica
   con 0 personas con el empleo más largo mayor que la continuidad.
5. **Probador de Equifax.** `probar-equifax-tablas.mjs` supone un expediente denso (24 meses
   de historia, score, estado de cartera, consultas de 12 meses) y falla con las personas poco
   bancarizadas del lote del 17/10; además agrupa por la etiqueta `persona-N`
   (`consultar-equifax-local.mjs`) y el lote nuevo pisó a `persona-1` a `persona-25` del
   anterior, así que ya no prueba todas. Hay que ajustarlo y etiquetar los lotes por fecha.
   Lo hace Claude; se verifica corriéndolo sobre todo `research/equifax/crudo/` con todo en ok.
6. **Cobertura de deuda de Novadata contra Equifax.** Medido el 2026-10-31 sobre 91 personas con
   las dos fuentes, con el crudo guardado: en bancos, con el mismo corte, 20 de 23 cuadran al dólar.
   Las 3 restantes tienen atrasos y difieren entre 1,5% y 2,7%, sin explicar. Unas 60 tienen cortes
   distintos y no se comparan sin reconsultar. Los 4 casos de la sección 9 de
   `docs/propuesta-estructura-equifax.md` quedaron explicados: aperturas posteriores al corte, BIESS
   (va en otra fuente de Novadata) y comercial. Las 63 filas de retail traen el corte de julio de 2025.
   Importa: sostiene «un solo buró por institución».
7. **Base de una institución nueva desde cero.** Falta la línea base del esquema (E15),
   parametrizar `auditar-seguridad.mjs` por base y probar el 503 de `exigirEsquema()` con la
   primera base atrasada. Importa: hoy hay una sola base y es requisito del primer cliente
   externo (`docs/plan-segundo-cliente.md`). Lo hace Claude; se verifica armando una base vacía
   con el corredor y con el control en ok contra ella.
8. **Hoja de ruta de la auditoría externa (E6 a E26).** Las fases 2 y 3 de la sección 7 del
   informe (`auditoria/2026-10-09-auditoria-externa-integral.md`, fuera de git) no se
   revisaron una por una: **no se midió cuáles quedaron hechas**. Falta ese recuento y sacar
   de ahí lo que siga abierto. Lo hace Claude leyendo el informe contra el código y la base.
9. **Respaldo local de las consultas crudas de Equifax de la base de AWS** (pedido del
   negocio el 2026-10-22; el negocio ya avisó a quien administra la base). **En curso:** el
   2026-10-26 se bajaron y verificaron **20.000 JSON** (40 lotes de 500, 147 MB comprimidos,
   cada lote contra su huella). El guion es `extraer_crudo_equifax.mjs`, en
   `research/ingresos-aws/scripts/` (fuera de git). Medido: `consulta_equifax` tiene unas
   418.000 filas y 6,1 GB en total; solo ~15% trae `response_json` (unas 62.000), así que
   faltan ~42.000 JSON, dos o tres tandas más. Cada lote tardó 3 a 6 s, sin errores.
   Mañana: `node extraer_crudo_equifax.mjs --extraer --formato=json --max=20000` (retoma solo
   desde el último id) y `--verificar`. Después los XML: la columna se llama `response` (tipo
   `xml`), así que va `--formato=xml --col-xml=response`; ese modo **no se probó** y las
   respuestas XML pesan distinto. La salida va a `research/ingresos-aws/crudo-equifax/`
   (manifiesto, estado por formato, un `.jsonl.gz` por lote). Falta revisar si el contrato con
   Equifax permite conservar y reutilizar sus respuestas (punto abierto de
   `docs/base-aws-originacion.md`).
10. **El marco y el JSON del modelo, en paralelo a la API** (decisión del 2026-10-21: el
    modelo sigue leyendo solo el perfil en la primera entrega de la API). Se lanzó un
    agente con Opus en su propio worktree (`.claude/worktrees/agent-a2c7577caaf0cb832`, rama
    `worktree-agent-a2c7577caaf0cb832`) que cortó por el límite de uso sin avanzar (un solo
    archivo tocado, `nombres-ingresos.ts`, sin commitear). Se retoma con el mismo brief:
    diseño del JSON de envío (solicitud, cuota, capacidad con `cumple`, Equifax), afinar el
    texto del marco con `docs/observaciones-del-negocio.md`, versión nueva apagada, sin llamar
    al modelo ni a Equifax sin autorización con la cifra.
11. **Deuda técnica sin urgencia** (la hace Claude cuando toque el área):
   - retirar `humanizarTexto()` con una versión nueva de fuentes que guarde meses y dólares
     con el formato de la casa, y recalcular;
   - volver generadas por la base las cinco columnas `fuente_*` (regla 8 de CLAUDE.md);
   - estilos en línea a clases (1.776 en 124 archivos); Excel de un lote en el servidor
     pasadas las mil personas; `comparar-razonamiento.mjs` que lea el buró.
12. **Equifax: la ventana de 24 meses y los saldos del comercial (PR 106, abierto con los cuatro
    controles en verde, sin fusionar).** El código está hecho (2026-10-31): la ventana sale del corte
    del reporte (`_shared/equifax-ventana.ts`, `equifax-estructura-v2`), el detalle actual del
    comercial lee `saldo_deuda` como lo por vencer (`equifax-tablas-v3`) y la pantalla suma la fila
    «Suspensión definitiva» del RUC. Falta, en este orden:
    - **Fusionar el 106**, y recién después **desplegar con `--funciones`** desde una copia limpia
      de `origin/main` (no hay migración).
    - **Rehacer lo guardado con `node scripts/cargar-tablas-equifax.mjs`, `--seco` antes.** Dos
      condiciones: (a) **espera a que termine `migrar-equifax-aws`** (corrida `e80f630c`, en curso
      desde el 2026-10-31 con el commit `f4c1029`): sigue cargando filas con `tablas-v2` y
      `estructura-v1`, y las que entren después de reprocesar quedarían viejas; (b) el guion lista
      las consultas sin paginar (`scripts/cargar-tablas-equifax.mjs:92`) y PostgREST corta en
      1.000: dice «consultas guardadas: 1000» cuando hay más de 2.200, así que hay que paginarlo
      (`traerTodas()`) antes o rehace sólo las más viejas.
    - **La pantalla sale al fusionar**, así que hasta el reproceso la franja (nueva) y los
      contadores de la estructura (vieja) pueden no coincidir, y el comercial seguirá mostrando
      «no cuadra» con los saldos viejos.
    - **La historia mensual del comercial queda sin conciliar**: ahí `saldo_deuda` se comporta como
      en bancos y unos 2.000 meses no cuadran con `deuda_historica` por ninguna lectura. Va como
      pregunta a Equifax (`docs/equifax-pedido-de-diccionario.md`, 3.1 a 3.3), igual que el
      significado de `total_vencer` en el comercial y si el último mes de la evolución es siempre
      el corte (en 13 consultas con detalle no viene).
    - **`probar-equifax-tablas.mjs` conserva 3 fallas que ya estaban** (score, estado de cartera y
      consultas recibidas, 61, 61 y 60 de 62): no son de este cambio y siguen abiertas. La
      paridad con AWS no bajó en ninguna variable (`s_consumo` y `saldo` subieron). Subir sus
      umbrales queda a criterio del negocio.

## 2. Espera una decisión del negocio

1. **La comparación de marco-v31 con y sin Equifax.** Falta autorizarla con una cifra:
   62 personas con v30 y con v31, unos USD 2,3 en lote (estimado, no medido). Importa para poder
   encender el buró en lo que lee el modelo (`docs/propuesta-marco-equifax.md`, secciones 6 a 8).
   **Las consultas de esas 62 caducaron el 18/10**: o se vuelve a pagar Equifax (USD 24,80, se
   autoriza aparte) o el lote acepta una fecha de análisis anterior al corte (un cambio chico).
   Y octubre lleva USD 9,66 de 10 (punto 2.2). Se verifica con la comparación y su lectura.
   **Espera a la versión del marco con el predictor de ingresos** (punto 2.4, negocio, 2026-10-29).
2. **El presupuesto del modelo.** `presupuesto_llm_mensual_usd` queda en 10 (negocio, 2026-10-29);
   octubre lleva USD 9,66 y pasó los avisos del 70 y el 85%. Lo que sigue abierto: el límite de la
   consola de Anthropic es otro y manda (en septiembre cortó el 28 con USD 6,00 medidos por nosotros,
   antes de nuestro aviso), y nuestro presupuesto tiene que ser el de la consola o menor. Lo compara
   el negocio, porque Claude no ve la consola.
3. **Marco por cliente y adelgazar el marco.** Hecho y apagado (`marcoPorCliente` en
   `CONFIG_LLM`): omite las secciones que el perfil no trae y baja el marco de ~12.050 a
   ~9.100 tokens (~USD 0,006 por análisis). Falta autorizar la validación
   (`comparar-razonamiento.mjs --configs=hoy,porCliente`, 14 casos, ~USD 2): tiene que quedar
   dentro del ruido (±40 de score, 1 de 13 recomendaciones). Después, una versión nueva con
   el número libre y su fila, y guardar qué secciones se omitieron.
4. **El marco y el modelo, al final** (decisión del negocio). **La próxima versión del marco se
   hace con los resultados del predictor de ingresos** (negocio, 2026-10-29): el ingreso estimado y
   su rango (punto 2.18). Que el modelo lea la solicitud,
   la cuota y la capacidad (P3 del plan de la demo) es una versión nueva del marco. Se suman a
   esa versión: el texto de `antiguedadEmpleoActualMeses` null (desde v14 también significa
   «su afiliación vigente no es trabajo»: 37 de 2.567 perfiles) y, si el negocio lo pide,
   sacar los atributos de la persona (hoy llegan como contexto sin peso en el score, grupo 12).
5. **Declaración de disponibilidad completa.** Faltan `cobertura` y `suficienteParaPuntaje`
   (no emitir score cuando la consulta no alcanza el mínimo evaluable;
   `docs/declaracion-de-disponibilidad.md`). Con un mínimo de seis temas quedaban 40 de 2.567
   (1,6%) por debajo, medido el 2026-10-03. Preguntas: ¿esos seis temas?, y ¿un caso no
   evaluable sólo se avisa o se guarda como análisis sin score (exige score nulo en la base y
   en las pantallas)?
6. **Observaciones sobre los análisis de marco-v28** (en pausa desde el 2026-10-09): la regla de
   capacidad, bloqueos que no son de cumplimiento (48 de 77), demandas viejas que pesan (56),
   calificaciones sin monto en atraso, saldo de Novadata repetido con otro banco (68), y que el
   modelo manda demasiados casos a revisar (143 de 200 en el lote del 07/10). Todo medido en
   `docs/observaciones-del-negocio.md`; se decide con el cuadro completo.
7. **Validar los criterios dentro de cada grupo del marco** (qué campo pesa cuánto). El orden de
   los grupos ya lo definió el negocio. Lo destraba una sesión de revisión con el negocio.
8. **Laboratorio: pantallas, simulación y decisiones.** El negocio recorre las pantallas con una
   sesión de admin (lista en `docs/laboratorio-pantallas.md`, final; lo ve desde el 2026-10-04) y
   llena `research/laboratorio/simulacion-institucion-2026-10-v2.xlsx` para el paso 2. Decide:
   qué son los «comentarios institucionales» (hoy la institución no entra), si hay una
   instalación para varias instituciones o una por institución, cuánto se conserva el crudo de
   Novadata (LOPDP) y cómo medir una propuesta ya aplicada (`docs/laboratorio-guia.md`).
9. **La API: niveles de acceso, quién paga Equifax y D5 a D15.** Propuesta del negocio del
   2026-10-19: dueño, administrador de la institución, usuario A (consulta y evalúa) y usuario B
   (sólo ve); la cuenta de Equifax es del dueño y la institución la autoriza con su tope. Falta
   decidirla y construirla (rol `lector`, `exigirRol()` en cada función, prueba en
   `auditar-seguridad.mjs`). «Descargas» ya es sólo de admin. Decidir también D5 a D15
   (`docs/cumplimiento/api/`) y si `datos`, `procedencia` y `aprobado_con_condiciones` quedan.
   **Decidido el 2026-10-21:** en Plus por la API, si la persona no tiene una consulta de Equifax
   vigente, la API la consulta y se cobra (USD 0,40), con el tope diario que ya existe
   (`EQUIFAX_TOPE_DIARIO`, hoy 30 en toda la base). Falta decidir **quién paga** cada institución
   y su tope propio, y qué pasa cuando el tope diario se agota a mitad de un día de campaña (hoy
   la evaluación termina `fallida`/`tope_diario_agotado`, sin reintentar hasta mañana).
10. **Estados de la persona en la bandeja, el Expediente y Monitoreo.** Se hace cuando se
    rehagan esos procesos (negocio, 2026-10-19). Para la bandeja conviene calcularlo en la base
    (`resumen_por_persona`): hoy la regla vive sólo en `estado-de-la-persona.ts` y las dos copias
    tendrían que cambiar juntas. Cliente activo y Cliente cerrado esperan a los créditos.
    Abiertas en `docs/modelo-de-la-persona.md`, sección 5: si el dictamen del modelo y la
    decisión de la institución usan el mismo verbo, y confirmar «Explorador de la fuente de datos».
11. **Qué consulta de Equifax entra en la capacidad de pago.** La pantalla y la función usan la
    última de la persona aunque haya vencido; Plus, sólo la vigente; Pro, ninguna. El enlace
    «Ver el detalle de la capacidad de pago» de la solicitud puede dar otra cuota que la
    solicitud. Se verifica comparando las dos cuotas para una misma persona.
12. **Diseño y producto de la revisión de UX** (`docs/revision-ux.md`, sección 3): Inicio como
    pantalla de trabajo, un solo camino a una persona (falta Aval), unir «Empleos vigentes» y
    «Fuentes detectadas», menos accesos por fila en la bandeja, esqueletos en vez de
    «Cargando...» y la auditoría con nombres (permisos). La leyenda «Ya paga» de Capacidad de
    pago sin la cifra la valida el negocio. Y el Panorama de Fuentes de ingreso: 8 preguntas en
    `docs/propuesta-panorama-respaldo-y-evidencia.md` y 13 personas sin documento sugerido.
13. **Ver en pantalla con la sesión del negocio.** Claude no escribe contraseñas: el negocio
    ingresa en el panel (`npm run dev -- --port 5184`). Falta ver con datos la bandeja,
    Monitoreo, Configuración, Costos › Detalle de llamadas, las pantallas de la persona, un lote
    con base legal, la vista de un analista (la cuenta de QA es admin) y el PDF de Equifax
    desde el diálogo del navegador (`docs/revision-ux.md`, secciones 1 y 7). Y la prueba de E1:
    reanalizar a una persona sobre el mismo perfil; la fila nueva trae `reutiliza_analisis_id`.
14. **Reglas de clasificación que el negocio puede afinar.** Tipos de demanda que quedaron en
    «Otras» y parecen deuda (expensas de copropietarios 2, pago de rubros 2, remuneraciones
    atrasadas 1: `_shared/demandas.ts`). La antigüedad de las demandas no llega al perfil (diferida
    por el negocio el 2026-09-29; las 8 personas «con demandas de cobro» de estructura-v12 lo son
    por demandas de 1997 a 2010). El indicio por renta supone la tarifa máxima (37%): con la tabla
    progresiva completa del SRI vería más.
15. **Mudanza a Cloudflare Pages y repositorio privado** (decisión del negocio). El negocio crea
    el proyecto (`npm run build`, salida `dist`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
    `NODE_VERSION=24`), pasa la URL y la pone en Supabase › Authentication; antes decide GitHub
    Pro (sin él, un repositorio privado pierde la protección de ramas). Después Claude suma el
    dominio a `ORIGENES_PERMITIDOS`, corre el control con `--sitio=<url>` y, con confirmación,
    vuelve privado el repositorio y retira `deploy.yml`. Cierra el riesgo 5.2.
16. **Cuentas y credenciales.** Cambiar la contraseña de Novadata (el usuario estuvo en el
    repositorio público; **no se verificó si ya se cambió**) y cargarla con
    `npx --yes supabase@latest secrets set --env-file <temporal>`. Decidir el doble factor (si
    se exige, la cuenta de QA deja de servirle a Claude) y los plazos de retención
    (`docs/cumplimiento/lopdp.md`). Confirmar que la fila `client.structure` del 2026-09-04 de
    `audit_log`, con un actor que no es de ningún usuario, era una cuenta de prueba borrada.
17. **Extracciones de la base de AWS: compartirlas y usarlas.** Hay nueve archivos con identificación
    y montos reales en `research/ingresos-aws/` (`docs/base-aws-originacion.md`, sección 4). Antes de
    sacarlos de este equipo hay que decidir si se seudonimizan (la investigación del predictor
    propone un hash de la cédula con una clave única). Y falta decidir con el negocio qué
    requerimiento se toma cuando una persona tiene varios (el último, el más antiguo o todos) y si
    las variantes SD entran al entrenamiento. El predictor ya se midió contra el IESS y contra el
    ingreso validado calculado; lo que sigue (comparar con el ingreso verificado de una institución)
    espera el dato de la institución.
18. **Predictor de ingresos: construirlo según la especificación.** `docs/especificacion-predictor-de-ingresos.md`
    (la investigación está en `docs/investigacion-predictor-de-ingresos.md`; en `main` están los pasos 1, 2, 4 y
    5 del nivel 1 y el entrenamiento, y el predictor no está desplegado: lo que falta para eso, en el punto 7 de abajo). **Decidido el 2026-10-22:** no se piden patrimonio, gastos ni entrada, y el predictor
    tiene dos niveles (1: Novadata con su SRI; 2: Novadata y buró de Equifax). **Aclarado el 2026-10-28
    (12.27): no hay calibración por producto.** AWS es crédito automotriz en su 96% (54.906 de 57.061
    independientes; 68 de consumo), pero el negocio dijo que automotriz y consumo son lo mismo: el
    valor financiado es el mismo (consumo 20.000; automotriz 20.000 más 5.000 de entrada, un auto de
    25.000, con 20.000 financiados), y lo que importa es el predictor general de Equifax. Se conserva el
    dato, no la propuesta de «sin calibrar para consumo». **Destilación (12.28):** hay 400.000
    consultas a Equifax con predictor en cinco años; medido, destilar no mejora la predicción del
    ingreso validado (R² 0,341 el nivel 2 solo; 0,349 con el predictor de Equifax mismo) y serviría para
    independizarse de ese predictor. El negocio dijo el 2026-10-29 que la quiere para mejorar la
    asertividad, que es justo lo que lo medido no respalda (sumar el alumno al nivel 2 lleva el R² de
    0,341 a 0,342): falta decidir si se hace igual.
    **Decidido el 2026-10-29 (12.30):** el nivel 1 es la edad, el sexo y el SRI de Novadata (más la
    fecha de la consulta), sin estado civil, zona ni IESS; el «obligado a llevar contabilidad» se queda y
    va al perfil; completar el lote de paridad queda para después; la próxima versión del marco se hará
    con los resultados del predictor.

    **Hecho** (fusionados al 2026-10-28): PR 85 (la tabla `equifax_analisis_credito`, migración 138, y
    `_shared/variables-de-ingreso.ts`, con la paridad medida), PR 86 (el entrenamiento reproducible en
    `scripts/predictor-ingresos/`), PR 87 (calibración, robustez del nivel 1, exportación compacta y
    casos de oro) y PR 89 (el evaluador `_shared/predictor-ingresos.ts`, paso 2: lee el formato
    `crediscope-arboles-1` sin dependencias, para Deno y el navegador; la prueba de oro dio diferencia 0
    en el logaritmo en los 200 casos de cada nivel contra el modelo real, en local con
    `PREDICTOR_INGRESOS_MODELOS`, y en la integración continua corre con un modelo chico inventado).
    **Fusionado el 2026-10-29 (PR 96):** el nivel 1 reentrenado con 8 variables
    (R² de 0,157 contra 0,172 del anterior; hacia adelante el mínimo del 90% cubre 89,1% contra 88,1%, y
    calibrado, 90,4%), exportado a `C:\datos\ingresos\modelos\exportado\` con sus casos de oro (prueba de
    oro con diferencia 0), `variables-de-ingreso.ts` con el nivel nuevo y el sexo de Novadata, y la
    prueba en sombra con el perfil de CrediScope de 532 personas de AWS: 89,1% (86,5 a 91,7), lo mismo
    que hacia adelante en AWS.

    **Lo que sigue, en este orden:**
    1. Mantener el orden de las migraciones: las tablas de Equifax ya están en `equifax-tablas-v2` (88
       consultas rehechas el 2026-10-28, 0 con error, `equifax_analisis_credito` con sus filas).
       La del PR 82 pasó de 137 a 139 el 2026-10-30 (una 137 no se habría aplicado nunca).
    2. La calibración conforme de cada institución va en `modelos_de_ingreso.calibracion` de su base
       (`Calibracion`, en logaritmo, con 500 casos o más) y hoy está vacía (decisión del 2026-10-30). Se
       enciende con esa fila, sin desplegar, cuando una institución traiga sus casos.
    3. **Lo que quedó del obligado y del RUC activo** (estructura-v15 y fuentes-v11, PR 97, desplegado y
       recalculado el 2026-10-30; 12.31). El perfil guarda el obligado, el nivel 1 lo lee de ahí y la prueba
       en sombra «a la consulta» ya da lo mismo que «con el obligado» (R² 0,187; 89,1%).
       - `fuentes-ingreso.ts` reconoce sólo «SI» para el indicio de ingreso mayor y el tamaño del negocio, y
         no ve la «S» (4 de 2.567 en el crudo del 03/10): pasarlo a `obligadoALlevarContabilidad()` de
         `ruc.ts` cambia lo que lee el modelo. Va con la próxima versión del marco (decisión del negocio).
       - La «S» no está cotejada contra Equifax (ninguna de las 87 la trae).
       - El recálculo pasó 60 personas del lote de «sin datos» a «independiente» por el RUC activo, 56 de
         ellas de las respuestas que el HTTP 502 dejó incompletas: se revisan con ellas (punto 4).
    4. Completar el lote de paridad (queda para después, decisión del 2026-10-29): 1.620 de 2.162 sin
       respuesta buena (986 sin consultar y 634 con error o sin datos), con menos hilos y primero la mitad
       con el SRI de Equifax en AWS (2026), que es la única que mide el SRI de Novadata contra el de
       Equifax; con el sí del negocio. Revisar además los 553 perfiles que el HTTP 502 dejó guardados con
       la respuesta incompleta (el guion los contó como hechos). La prueba en sombra se repite tal cual
       (`node scripts/sombra-predictor-ingresos.mjs` y `scripts/predictor-ingresos/medir_sombra.py`).
       Las 542 de 12.29 sí tienen RUC en Novadata (512): lo que no tienen es el SRI de Equifax.
    5. Reentrenar el nivel 2 desde las respuestas crudas de Equifax con `variables-de-ingreso.ts` (las 19
       variables que no coinciden con el extracto) cuando termine el respaldo (20.300 de unas 105.070
       respuestas JSON al 2026-10-28; se baja de la más nueva a la más vieja); recalibrar y volver a
       exportar. Todavía lleva el estado civil, la zona y el IESS del extracto de AWS: decidir si se sacan
       como en el nivel 1 (en 12.26 costaban 0,004 de R²).
    6. Completar el módulo de variables para el nivel 2: el mapeo del estado civil, la provincia y el cantón
       de AWS a Novadata (el sexo ya está medido), la zona en el perfil y las filas mensuales del IESS
       (`trabajoHistoricosMecanizado`; sección 9 de la especificación).
    7. **Construidos para el nivel 1 y sin aplicar:** `modelos_de_ingreso`, `estimaciones_de_ingreso`
       (migración 141), `estimar-ingreso` y `POST /estimaciones-de-ingreso`, con lo que el negocio decidió
       el 2026-10-30 (especificación, sección 1). Falta, en este orden:
       - aplicar la 141 con el corredor (`--seco` y `--aplicar`);
       - publicar el modelo: `node scripts/publicar-modelo-de-ingreso.mjs --modelo=<archivo> --vigente`,
         primero con `--seco` (sin la 141 aplicada, el guion valida el archivo y frena en la tabla);
       - desplegar con `--funciones` desde una copia limpia de `origin/main` (`ESQUEMA_MINIMO` sube a 141:
         sin la migración, todas las funciones contestan 503);
       - correr `auditar-seguridad.mjs` y probar la función con una identificación inválida; una
         estimación de verdad, sólo con una persona autorizada por el negocio.
       La migración se probó en un Postgres en memoria, no contra la base. La función no se llamó
       nunca. La referencia de pensión de los jubilados (sección 3.3) no está construida.
    8. La capacidad de pago y la tarjeta de pantalla (pasos 6 y 7). Antes de mostrar los tramos, revisar
       con el negocio la regla de `cdf` (`comun.py`): con un mínimo alto, el tramo de menos de un salario
       básico queda en 2,5% y los siguientes en 0,01%, porque por debajo del primer cuantil vale la mitad
       de su nivel.

    **Decisiones abiertas del negocio:** si la destilación se hace igual, aunque no mejora la asertividad;
    las variables de la persona del nivel 2; los nombres de pantalla; la base de 3,9 millones (en proceso por el proveedor); y `p42` y
    `nnivins` de la ENEMDU (los códigos de la ENIGHUR se confirmaron). Falta también cotejar el SRI de
    Novadata con el de Equifax en más de 87 personas.

## 3. Espera a terceros

1. **Equifax: el diccionario de datos.** Lo consigue el negocio; lo que hay que pedir, con la
   evidencia y la prioridad, está en `docs/equifax-pedido-de-diccionario.md` (3.8, la prioridad
   alta: los garantes de la lista no coinciden con el detalle). Importa: hay campos con nombres
   que prometen más de lo que el dato cumple. Lo que conteste se carga sin pagar de nuevo: se
   sube la versión de tablas o de estructura y se corre `cargar-tablas-equifax.mjs` (`--seco`
   primero). Con él, `coincideConLasOperacionesDeRolCodeudor` se separa por tipo.
2. **Equifax: aprobación y fichas de cumplimiento.** Equifax está en proceso de aprobación
   (negocio, 2026-10-13). Cuando termine, sumarlo como encargado y destinatario en
   `docs/cumplimiento/` (fuera de git). Lo destraba Equifax; lo hace Claude.
3. **Novadata, por escrito: capacidad y contrato.** Si una cuenta sostiene 60 perfiles por
   minuto (hoy se satura cerca de 20) y si el contrato permite entregar sus datos a la
   institución, que es lo que necesitan la API y el perfil opcional. Mientras no conteste, la
   API no entrega lo que viene de Novadata. Se verifica con la respuesta escrita archivada.
4. **Novadata: lo que falta saber.** ¿Expone el régimen RIMPE? ¿Funciona el recurso
   `pensionista` (devolvía `estado=false` en las 389 de la muestra)? Además, el corte de
   septiembre de la Super: cuando lo publique, reconsultar a `c-b980f5b2` y `c-79f1a4ae` (su
   deuda es de septiembre); `c-23474215` tiene una diferencia de cobertura sin explicar.
5. **Legal.** Revisar el texto de autorización del titular y el anexo de seguridad. Los plazos
   del contrato modelo no coinciden con la norma SPDP-SPD-2025-0030-R: el encargado suprime en 3
   días desde el aviso y devuelve o suprime en 5 días al terminar el contrato, y el contrato
   dice 5 días hábiles y 30 días. Borradores en `docs/cumplimiento/api/` (fuera de git).
6. **Antes de la primera institución externa:** acuerdos de tratamiento (DPA) de Supabase y Anthropic,
   prueba de restauración, cifrado de disco de la máquina con `research/`, validación legal y
   prueba de intrusión independiente. Lo destraban los terceros y el negocio.
7. **Una institución con buró: el resultado en el t1 del Laboratorio.** La definición de impago
   ya juzga por días, pero falta traer el resultado de Equifax en el t1, con una consulta paga
   por solicitud y contando por mes desde la historia de 24 meses
   (`docs/propuesta-dias-de-mora-con-buro.md`, sección 3). Se construye con la primera carga
   real de una institución con buró; hoy no hay ninguna.
8. **Aval: el WAF rechaza la IP de Supabase.** Hoy se consulta desde la IP ecuatoriana con
   `scripts/consultar-aval-local.mjs`. Lo destraba Aval (o la institución que lo use).
9. **SMTP propio (Resend)**, para volver al código de 6 dígitos al crear una cuenta.
10. **SRI:** confirmar los umbrales de «obligado a llevar contabilidad», que hoy son un
    indicio de ingreso mayor. «Declaraciones de IVA de los últimos 6 meses» no existe para los
    negocios populares del RIMPE y es semestral para los emprendedores: hoy se pide a 956 personas
    (cifra del 2026-09-29, sin remedir).
11. **Base de originación en AWS: definiciones.** Quien administra esa base tiene que confirmar:
    si las tres tablas de deuda se solapan, qué es «SD» en la respuesta comercial y «verificado» en
    los lotes masivos, si el usuario de la base es de solo lectura (hoy toda consulta lo fuerza con
    `begin read only`), qué cambió en Equifax en enero y marzo, qué significan «consumo» en el
    catálogo de respuestas y FINALIZADO en el estado del requerimiento, cómo se arma el
    `total_ingresos` de la vista de BI (si suma al cónyuge) y **quién fijó la rentabilidad por
    macroactividad** (no tiene autor ni fecha, y define el ingreso calculado de cuentas e IVA). Lista
    completa en `docs/base-aws-originacion.md`, sección 5. **Resuelto el 2026-10-21**
    (`docs/investigacion-predictor-de-ingresos.md`, 12.20 a 12.24): los campos de
    `analisis_credito_sector_financiero` son campos de la respuesta de Equifax; entrenar con las
    salidas de Equifax no necesita contrato (decisión del negocio); el predictor «corregido» ya viene
    en los datos guardados.

## 4. Con fecha

1. **2026-12-25: la primera reconsulta de la cartera** (ronda de 3 meses). Antes tienen que
   estar los pasos 1 a 3 de `docs/laboratorio-guia.md` (punto 1.1). Reconsultar la cartera
   entera tarda unas 2 h 10 min (concurrencia 20) y una tarea en segundo plano se corta a las
   2 h: `consultar-lote.mjs` retoma. Novadata no cobra. Se verifica con los conteos de la ronda.
2. **Después de esa reconsulta:** mirar `client_profiles.duracion_por_fuente_ms` para ajustar
   `PLAZO_POR_FUENTE_MS` y construir el disyuntor por fuente que alimenta el vigía (E5).
3. **Desde el 2026-12-25, con impagos reales:** la tarjeta de puntaje (E1,
   `docs/tarjeta-de-puntaje.md`), la validación independiente y las pruebas de equidad (ficha
   del modelo, sección 7).
4. **Después del paso 4 de la guía del Laboratorio:** llevar al Informe de Desempeño del Modelo
   (`informeLaboratorio.js`) la evidencia sobre quienes el modelo dio por buenos (aprobar o
   revisar) y cayeron (decisión del negocio del 2026-10-06; análisis en
   `docs/propuesta-revision-del-laboratorio.md`, 10.3). Sin datos reales no hay evidencia que juntar.
5. **2027, cuando se publiquen:** el Salario Básico Unificado y la fracción básica de renta del
   año nuevo en `SBU_POR_ANIO` y `FRACCION_BASICA_RENTA` (`fuentes-ingreso.ts`). Un año que falta
   en la tabla de renta no da indicio. Después `node scripts/calcular-columnas-del-perfil.mjs`
   (`--seco` primero). Se verifica con el control de textos y una persona de cada año.

## 5. Riesgos aceptados

La fecha es en la que se vuelve a mirar cada uno (propuesta; el negocio la cambia).

1. **Las credenciales de Equifax siguen sin rotar.** Se pegaron en un chat; el negocio dijo
   otra vez el 2026-10-13 que no es posible por ahora y que sigue en observación. Se rotan al
   terminar el desarrollo. Revisar el 2026-11-20.
2. **El repositorio es público con cédulas reales en el historial** (31 cédulas, 121 menciones,
   sacadas del árbol el 2026-10-09; los commits las conservan). Se cierra volviendo privado
   (punto 2.15); limpiar el historial exige un empuje forzado con confirmación y `git filter-repo`,
   que necesita Python y no está. Revisar el 2026-11-20.
3. **Sin doble factor de autenticación** («de momento ninguno», punto 2.16). Revisar el
   2026-12-15 o al abrir la primera institución externa, lo que ocurra primero.
4. **Un solo ambiente (E3):** el negocio decidió esperar al ambiente de prueba. Las pruebas de
   la API van con simuladores. Revisar al abrir la primera institución externa.
5. **Demandas de un homónimo.** Novadata asocia las demandas por nombre y no trae la cédula de
   las partes: 31 de 4.602 (0,7%) no tienen el nombre de la persona entre los demandados y 331
   tienen ese campo vacío (cifras de septiembre, sin remedir). Las denuncias sí se filtran por
   cédula. Revisar el 2026-12-25, con la reconsulta.
6. **Dos consultas a Equifax a la vez por la misma persona** (el botón de administración y una
   solicitud Plus): sin candado por decisión del negocio del 2026-10-19; el costo es una
   consulta de USD 0,40 de más. Revisar si el uso de la API sube. Fecha: 2027-01-15.

## 6. Limpieza

1. **Ordenado el 2026-10-28** (con el sí del negocio): se fusionaron el PR 91 (paridad, 12.29) y el
   55 (Dependabot), y el 32 se cerró sin fusionar porque contradecía la decisión del 2026-10-20 sobre
   E27 (su rama `claude/heuristic-noether-e0671c` se conserva). Se borraron 32 ramas remotas y 58
   locales de PR ya fusionados, y 6 carpetas de trabajo. Antes de borrar cada rama se comprobó que su
   punta estuviera dentro de la cabeza de su PR: los PR se fusionan con squash, así que «no es
   ancestro de `main`» no dice si hay trabajo perdido. Así apareció un commit del 2026-10-21 que no
   había entrado: entró con el PR que trae esta nota. Las 20 líneas sin commitear de la carpeta de un
   agente (las etiquetas del veredicto de capacidad para un marco-v32 que no existe) quedaron en
   `research/parches/`, fuera de git.
2. **Quedan** las carpetas `cranky-goodall-f18441` (PR 82) y `suspicious-gagarin-e12f62` (la sesión
   de la paridad), con sus ramas. `claude/postgres-aws-data-review-66a14e` y
   `claude/cranky-goodall-f18441` son de PR fusionados (79 y 66), pero las nombra la sesión de la
   API: se borran cuando se archive.
3. **Cartera sintética del Laboratorio** (carga «Cartera sintética (semilla 1)»): se queda, es
   la que prueba los cálculos. Si se regenera, anular la anterior desde la pantalla.

## Para ubicar

- **Marco por cliente y adelgazar el marco (2.3):** no tienen un documento de área; el diseño
  vive en el encabezado de `_shared/marco-por-cliente.ts`. Si el negocio lo retoma, conviene
  una propuesta propia (`docs/propuesta-marco-por-cliente.md`) y dejar acá sólo la decisión.
- **Referencias que quedaron apuntando a números de este archivo:** `docs/revision-ux.md`
  (línea 5: «sección 1» ahora es 2.12), `docs/laboratorio-de-riesgo.md` (924: «pendientes, 0a»),
  `docs/remediacion-auditoria-externa.md` (sección 6, puntos 1 y 2: E27 está cerrado),
  `docs/plan-demo-ifi.md` (226 y 329) y `docs/propuesta-revision-del-laboratorio.md` (varias).
  Ninguna se tocó; las ajusta quien edite cada documento.
