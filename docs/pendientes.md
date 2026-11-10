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

- **`main` tiene estructura-v21 sin desplegar (2026-11-09, #153): no desplegar `main` hasta que marco-v36
  esté lista**, salvo que el negocio lo autorice sabiendo esto. Cualquier despliegue con `--funciones` desde
  `main` lleva v21, venga de la sesión que venga (el que más riesgo tiene es el del predictor, #145): con
  marco-v35, el modelo recibiría `comportamientoInterno.proveedorInfo1EstadoOperacion` y
  `riesgoJudicialCrediticio.demandasDeCobro` (año y quién demanda), que v35 no explica. v21 trae p6 (el BIESS
  sin contar dos veces ni los préstamos terminados), p3 (Comportamiento Interno de una sola operación, sin
  sumar nada), p5 y p10 (el colateral de vehículos al precio de mercado).
  - **Después del despliegue, el recálculo:** `node scripts/recalcular-grupos.mjs
    --grupos=comportamientoBancario,comportamientoInterno,riesgoJudicialCrediticio,patrimonio
    --carpeta=research/proveedor-info-1-raw-2026-10-03`, primero con `--seco`. El seco del 2026-11-09 sobre los
    perfiles en v20: los 3.766 se reproducen y cambian el colateral en 1.362, el saldo del BIESS en 767,
    `tieneCreditoIessBiess` en 192 y el saldo de Comportamiento Interno en 557.
  - **Al final, `node scripts/revisar-crudo.mjs`:** las regresiones de p3
    (`comportamiento-interno-de-otra-operacion`) y p10 (`colateral-de-vehiculos-sobre-el-precio-promedio`)
    tienen que dar 0.
- **Espacio de la base (2026-11-06): 409 MB de 500 MB del plan Free** (91 MB de margen; el 05/11 eran
  485 y el 06/11 llegaron a 534, por encima del plan, y bajaron a 478 tras el `vacuum full` de `consultas_equifax` y a 409 tras el
  de `cron.job_run_details`); se midió con `pg_database_size`. Lo que lo llenó, medido:
  `cron.job_run_details` con 82 MB (89.361 filas, 1,6 MB por día; la 149 lo dejó en 16 MB y lo limpia a diario; falta ver que la tarea
  corra sola), el TOAST de
  `lab_reconsultas` (80 MB) y de `client_profiles` (69 MB), y `storage.objects` (55 MB: sólo sus metadatos e
  índices; los 20.616 objetos de la subida del crudo de Equifax sumaron unos 35). Otras sesiones escriben (perfiles,
  laboratorio): **no cargar nada grande sin medir**. Con ese techo una reconsulta masiva de Proveedor_Info_1 la vuelve a llenar. Pasar
  a Pro es la salida de fondo. **Vaciar una columna no devuelve espacio**: el 06/11 la base subió 26 MB mientras se vaciaba
  el crudo de Equifax y recién bajó con `vacuum full consultas_equifax` (de 58,4 a 5,3 MB; hay que pedirlo con confirmación).
- **El crudo de las migradas de AWS está en Storage (2026-11-06; 148, PR 138):** las 3.542 consultas con
  `respuesta_cruda` en null y `crudo_ruta` puesta, en el depósito `crudo-equifax-migrado` (162,9 MB comprimido con las
  20.616 bajadas y su respaldo; Storage total, 255,5 MB de 1 GB). La lectura se probó en producción con una persona
  de fila vacía (c-6da51438): «Ordenar la consulta guardada» armó sus tablas. Las consultas pagadas por nosotros
  siguen con el crudo en la fila (2,3 MB). **Volver a correr `migrar-equifax-aws.mjs` mete el crudo en la fila otra vez**:
  después se repite `subir-equifax-migrado-a-storage.mjs` (subir, `--enlazar`, `--vaciar --confirmo`) y el `vacuum full`.
  Un JSON de AWS sin fila en la base se encuentra por cédula en el índice de Storage (p4, 2026-11-09), pero la supresión
  del titular todavía no lo lee: falta que `derechos-del-titular.mjs` borre esos crudos y saque a la persona del índice.
- **Consultas de Equifax migradas de AWS (2026-10-31):** 3.542 crudos (3.440 personas, del 18 al
  27/10, sin tablas derivadas) con `node scripts/migrar-equifax-aws.mjs`. Valen hasta el 17/11, pero
  **no se borran al vencer** (negocio, 2026-11-05: una consulta queda como la base de lo que se
  analizó; volver a consultar suma una nueva y no reemplaza la anterior). Equifax autorizó reutilizarlas (`docs/equifax.md`). Faltan las
  anteriores al 18/10 y los ~86.000 JSON por bajar: no entran en 500 MB. Unas 15.000 personas que
  creó la primera corrida quedaron en `clients` sin datos (`audit_log` impide borrarlas) y entran
  en los totales de personas reales: medirlo antes de dar un total.
- **Base:** última migración aplicada, la **149** (el corredor, 2026-11-06; la 149 es la limpieza diaria del registro de
  pg_cron; no hay 137: la del PR 82 pasó a 139), y `ESQUEMA_MINIMO` está en 148 (el crudo en
  Storage). La 146 son los
  permisos por defecto de las tablas nuevas de `public` (PR 127). `auditar-seguridad.mjs` dio 79 de 79
  después de desplegar, «todo cerrado». La 140 sacó de la agenda la clave que la 139 dejó en texto plano.
- **Funciones:** sello **`661445837c92`**, 13 de 13, desplegado el 2026-11-06 sobre el esquema 148
  (`despliegues`): la lectura del crudo de Equifax desde Storage (#138). Antes, `03dc54558780` (el freno del
  predictor, #135; `auditar-seguridad.mjs`, 79 de 79) y `6d30f65ed598`:
  estructura-v19 (#133), y con él `consultar-equifax` con la acción `ordenar` (#130).
  Antes, `cc88fd66866f` (marco-v35 y estructura-v18, #129) y `ece1d189789d` (las sesiones 1 a 4
  de `docs/propuesta-fuentes-obligatorias.md`), y antes `59f5ef0466c9` (marco-v32). El núcleo de la API está desplegado y
  apagado para terceros. `API_SANDBOX` está puesto y el sandbox se probó de punta a punta el
  2026-10-31: Básico, Pro y Plus con los siete casos, sin filas en las tablas de personas. Con
  `2f30bffab7fd`, por la pantalla: la consulta corrió con c-79e1ac23 y el análisis reutilizó el de
  c-38661efd. La llamada real al modelo se midió con `36dbe4af0dde` (c-38661efd, marco-v30, USD 0,07),
  y **todavía no hubo una consulta buena de Proveedor_Info_1 seguida de su análisis con el código nuevo**.
- **Proveedor_Info_1 (2026-10-31):** contesta HTTP 500 en 41 de 52 fuentes en las tres consultas de
  c-79e1ac23 del 30 y el 31. El 28/10 pasó en 494 de 1.215 perfiles y antes casi nunca (33 el 25/09).
  El negocio confirmó que es un problema general: **por ahora Proveedor_Info_1 no se puede usar**.
- **Base de prueba (2026-10-31):** 244 personas en `research/base-prueba-2026-11/`, con perfil de 19
  fuentes buenas o más y Equifax de AWS, sin consultar a nadie. Pro y Plus ya están calculados con un
  crédito de USD 5.000 a 36 meses: Plus cambia 111 veredictos, todos para peor (Pro ve las cuotas de
  casi nadie). No es una base típica: cuota mediana de USD 2.857 contra USD 605 de todo AWS. El lote
  corrió el 2026-10-31 (245 análisis con marco-v30, USD 3,95, 0 fallidos): 53 aprobar, 179 revisar y
  13 negar. De los 53 aprobados, 42 no alcanzan en Plus y sólo 5 cumplen: el modelo no lee las cuotas
  de Equifax (`marco-v31` apagado). `cruce-flujos.csv` en esa carpeta; el crédito es igual para todos.
- **Versiones en producción:** marco-v35 con Claude Sonnet 5.5 y el buró de la institución encendido,
  desplegada el 2026-11-05 y sin ningún análisis todavía (marco-v31 a v33 no llegaron a usarse, 0
  análisis; v34 es el texto sin buró). estructura-v19 (el último perfil de las 3.766 personas reales,
  recalculado el 2026-11-05); fuentes-v11 (2026-10-30); las 240 sintéticas quedaron en v3,
  perfil-laboral-v3, simulador-v4, capacidad-v3. La estructura y las fuentes salen de la base
  (`structure_version`, `fuente_version`); el resto, del código de `main`.
- **Personas (2026-10-28, `clients`):** 3.764 reales y 240 sintéticas. **1.191 reales son nuevas
  desde el 2026-10-21**, casi todas del lote de paridad del predictor del 2026-10-28 (1.176
  independientes de la base de AWS consultados a Proveedor_Info_1, base legal «Contrato NovaCredit: cartera
  con crédito vigente»; `docs/investigacion-predictor-de-ingresos.md`, 12.29). Entran en los totales
  de la cartera, la bandeja y Monitoreo como cualquier persona real, y 553 de sus perfiles quedaron
  con la respuesta incompleta de Proveedor_Info_1 (HTTP 502; punto 2.18). **Son cartera: no se marcan
  aparte** (negocio, 2026-10-29).
- **Análisis (2026-10-29, `analysis_results`):** 207 con marco-v28 (el último del 13/10) y 8 con
  marco-v30 (el último del 18/10), todos de personas reales; **ninguno nuevo desde el 18/10**. Los 73
  restantes son de versiones anteriores a la v28 (288 en total).
- **Equifax (2026-10-29):** 88 consultas, y **sólo 1 del ciclo vigente** (va del 18/10 al 17/11; las
  87 anteriores caducaron).
- **Modelo (2026-10-31, `gasto_del_mes`):** octubre lleva **USD 13,92 de los 10**, por el lote autorizado de la base de prueba, del presupuesto
  (3.037 llamadas, ninguna sin medir). Desde el 2026-10-20 las 940 llamadas son todas pruebas del
  vigía; no hubo análisis.
- **Control de seguridad:** 74 de 74 en orden el 2026-10-29 (`auditar-seguridad.mjs`, desde la
  carpeta principal), el primero después de la 138 y del despliegue del 2026-10-28. Sigue
  marcando como «INFO» que GitHub Pages no manda las cabeceras de seguridad (las trae la mudanza,
  punto 2.15).

- **Freno por consulta incompleta (2026-10-31, negocio):** el modelo no corre sin las 21 fuentes
  obligatorias (`FUENTES`, `calidad-de-la-consulta.ts`). Alcanza a 769 de los 3.765 últimos perfiles
  reales, que hay que reconsultar antes de analizarlos, y 12 personas quedan a revisión manual. La bandeja
  («Consulta incompleta», 145), los lotes de consulta, la API y el vigía ya lo aplican (sesiones 2 a 4 de
  `docs/propuesta-fuentes-obligatorias.md`, sección 12, desplegadas el 2026-11-04). Falta la 5, lo que
  lee el modelo, con la versión del marco del predictor. El análisis de c-79e1ac23 del 2026-10-31 se hizo antes del freno y
  sigue guardado: se reemplaza al reconsultarla. Los tres perfiles de ese día dieron error en 41
  fuentes; parece una caída de Proveedor_Info_1, sin confirmar. El 409 se probó en vivo con c-79e1ac23
  el 2026-10-31: quedó `client.analyze_frenado` y no se llamó al modelo.

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
    - **el sandbox está desplegado y apagado** (`supabase/CLAUDE.md`): falta poner
      `API_SANDBOX=activo` para usarlo. Requisito de OAuth: una credencial de sandbox acepta sólo las
      identificaciones de prueba;
   - D5: al vencer el plazo con el modelo caído, entregar `sin_veredicto` con el perfil y la
     capacidad en vez de `fallida` (hoy el paso del modelo se reintenta y, vencido el plazo,
     la evaluación termina `fallida`/`plazo_vencido`);
   - el perfil estandarizado opcional (`recibirPerfil`: hoy se valida y no se entrega);
   - pasar `evaluar-solicitud` (la pantalla) a los pasos compartidos (`pasos-de-evaluacion.ts`),
     que hoy sólo usa para la capacidad: "una sola puerta";
   - lo que dejó la revisión de Opus del 2026-10-21 sin arreglar: (a) dos evaluaciones
     simultáneas de la misma persona consultan Proveedor_Info_1 y el modelo dos veces (sólo el buró
     tiene el control de «en curso»); (b) si el trabajador puede vivir más de 180 s (plan pago:
     400 s), un paso largo se retoma con el original vivo: hace falta un token por toma
     comprobado al anotar; (c) `POR_INVOCACION = 4` pasos pesados en un proceso: medir CPU y
     memoria; (d) `referencia`, `operador_id` y `autorizacion_id` van a `audit_log.meta` (como
     en la pantalla desde la 135) y una institución puede poner ahí una cédula, que la supresión
     no borra; (e) el trabajador se despierta recién al terminar la ronda entera.
   Devuelve los datos completos de la persona según el contrato; lo que viene de una fuente
   depende de que el contrato con esa fuente permita entregarlo (Proveedor_Info_1: 3.3). Lo hace Claude
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
6. **Cobertura de deuda de Proveedor_Info_1 contra Equifax.** Medido el 2026-10-31 sobre 91 personas con
   las dos fuentes, con el crudo guardado: en bancos, con el mismo corte, 20 de 23 cuadran al dólar.
   Las 3 restantes tienen atrasos y difieren entre 1,5% y 2,7%, sin explicar. Unas 60 tienen cortes
   distintos y no se comparan sin reconsultar. Los 4 casos de la sección 9 de
   `docs/propuesta-estructura-equifax.md` quedaron explicados: aperturas posteriores al corte, BIESS
   (va en otra fuente de Proveedor_Info_1) y comercial. Las 63 filas de retail traen el corte de julio de 2025.
   Importa: sostiene «un solo buró por institución».
7. **Base de una institución nueva desde cero.** Falta la línea base del esquema (E15),
   parametrizar `auditar-seguridad.mjs` por base y probar el 503 de `exigirEsquema()` con la
   primera base atrasada. Importa: hoy hay una sola base y es requisito del primer cliente
   externo (`docs/plan-segundo-cliente.md`). Lo hace Claude; se verifica armando una base vacía
   con el corredor y con el control en ok contra ella. Desde el 2026-10-30 Supabase no da acceso a
   la Data API a las tablas nuevas de `public`: la 146 fija los privilegios por defecto para lo
   que se cree después, pero las tablas de la 001 a la 144 no los traen en una base armada desde
   cero. La línea base tiene que darles `authenticated` y `service_role` (no `anon`, 113) y
   respetar las restricciones puntuales, como las de la 141.
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
12. **Equifax: la ventana de 24 meses y los saldos del comercial (PR 106).** El código está hecho
    (2026-10-31): la ventana sale del corte
    del reporte (`_shared/equifax-ventana.ts`, `equifax-estructura-v2`), el detalle actual del
    comercial lee `saldo_deuda` como lo por vencer (`equifax-tablas-v3`) y la pantalla suma la fila
    «Suspensión definitiva» del RUC. Desplegado con `8a778f905f10`. Falta:
    - **Rehacer lo guardado con `node scripts/cargar-tablas-equifax.mjs`, `--seco` antes.** Dos
      condiciones: (a) **`migrar-equifax-aws` ya terminó** (2026-10-31: 3.542 crudos migrados, todos
      sin tablas). **Cuidado:** esas 3.542 cuentan como «sin tablas», y `cargar-tablas-equifax.mjs`
      sin filtro les derivaría ~300 filas a cada una (más de un millón de filas, cientos de MB) y
      volvería a llenar la base de 500 MB: usar `--consulta=<uuid>`, o excluirlas con un filtro
      nuevo, antes de correrlo; (b) el guion lista
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
13. **estructura-v16 (PR 105): historial de empleos, BIESS y corte del retail.** Desplegado con
   `8a778f905f10` y recalculado el 2026-10-31: 3.765 de 3.765 escritos y un seco posterior que da 0
   a escribir y 0 que el crudo no reproduzca. Queda:
   - **`recalcular-fuentes-ingreso.mjs` estaba frenado igual**: `recalcular-grupos.mjs` fallaba con
     `statement timeout` en la paginación de `client_profiles` (`count=exact` con `offset`). El PR lo
     arregla (paginación por `id`, hasta una página vacía) en los dos, y el segundo está probado sólo
     en seco. Siguen con `count=exact` y `offset`, sin arreglar, `validar-perfil-del-modelo.mjs`,
     `detectar-atipicos.mjs`, `explorar-crudo.mjs`, `procesar-reconsultas.mjs` y
     `simular-un-anio.mjs`: si fallan igual, el mismo arreglo.
   - **Efecto en la capacidad de pago:** `tieneCreditoIessBiess` pasa a verdadero en 308 de 918
     personas con créditos formales, y `capacidad-de-pago.ts` suma entonces «Préstamo del IESS o
     BIESS» a las deudas sin cuota en esas personas. Con el saldo nuevo podría mostrarse la
     cifra; no se tocó.

## 2. Espera una decisión del negocio

00. **Lo que dejó la primera revisión de datos (habilidad `revision-de-datos`, 2026-11-05).**
   - **estructura-v19: aplicada el 2026-11-05** (PR 133, funciones en `6d30f65ed598`, 3.766 perfiles
     recalculados). El perfil laboral cambió en 20 personas, y `cargo-vigente-sin-aporte-vigente` bajó de 17
     a 0. No volvió ninguna regresión, `validar-perfil-del-modelo.mjs` da 0 fallas y
     `auditar-seguridad.mjs`, 79 de 79.
   - **Los 85 análisis que dicen «sin atraso» con A2 o peor no se rehacen** (negocio, 2026-11-05). Son
     de marco-v30 o anterior y quedan en la bandeja como están. El detector
     `atraso-leido-como-sin-atraso` los sigue contando, por marco.
   - **El predictor sobre consultas incompletas: sí afecta** (medido el 2026-11-05 sin guardar,
     `estimar-ingresos-en-lote.mjs` y una simulación). `estimar-ingreso` no aplica el freno, y 624 de las
     2.061 estimaciones de la cartera serían de consultas incompletas:
     - En 532 faltan a la vez la identidad (`general`) y los aportes (`basesInternas`). Sin aportes no se
       sabe si la persona tiene un ingreso verificado, que es lo primero que decide el selector. Sin edad
       ni sexo, en 694 perfiles completos la estimación baja en mediana un 13%, cambia más de 20% en el
       19% y cambia el lado de USD 1.000 del mínimo al 90% en el 39%.
     - En 56 faltan sólo otras obligatorias (denuncias, listas). En 23 personas con una consulta completa
       anterior, la razón mediana del valor central es 0,97.
     - **Freno decidido por el negocio y construido el 2026-11-05.** No se estima si no contestó
       `general`, `basesInternas` o `contribuyente` (`FUENTES_DEL_PREDICTOR`, motivo
       `consulta_incompleta`), y las demás obligatorias no frenan. Medido sin guardar: los estimados
       bajan de 2.061 a 1.493, con 666 en `consulta_incompleta` y ninguno sin edad ni sexo. Desplegado
       el 2026-11-05 (`03dc54558780`), sin probar en vivo: la función exige la sesión de un analista. Se
       prueba con la primera estimación de una consulta incompleta, que debe contestar
       `consulta_incompleta` sin guardar fila. El detector `estimacion-sobre-consulta-incompleta` es de regresión.
   - **Dos RUC que el SRI da activos** (c-0be1e991, c-74997fb7, revisados por el negocio el 2026-11-05).
     El SRI coincide con Equifax: ACTIVO, con la misma fecha de cese y un reinicio en 2025 (18/07 y
     23/10). El crudo de Proveedor_Info_1 del 2026-10-03 no trae ese reinicio y suma una cancelación que
     el SRI ya no muestra, así que el perfil los da con el RUC inactivo. Entre quienes tienen Equifax son
     2 de 86 (detector `ruc-activo-difiere`). Sin acción por ahora: es el dato de la fuente.

0. **marco-v35 (PR 113 y 129).** Las correcciones de la revisión de casos del 2026-10-31 (v32), el
   RUC depurado neutro para todas las depuradas y el buró de la institución encendido (negocio,
   2026-11-04). Aplicado el 2026-11-05: la 147, las funciones en `cc88fd66866f` y los 3.766 perfiles
   reales recalculados a estructura-v18. Un seco posterior da 0 a escribir,
   `validar-perfil-del-modelo.mjs` da 0 fallas en las 14 reglas y 169 personas tienen
   `rucDepuradoPorElSri` (336 sin RUC que evaluar). Una consulta del buró sólo cuenta si está vigente
   hasta el 17 del mes. Queda:
   - **Los USD 4,4 de la base de prueba:** `analizar-en-lote enviar` corrió el 2026-10-31 a las 12:06,
     antes del PR 113, con autorización del negocio. Un envío nuevo lee el código de la copia desde
     donde corre, y `main` ya dice v35.
   - **Sin medir, porque hace falta el modelo:** si deja de escribir «sin atraso» con A2 y «nadie
     miró», y cuánto mueven el score estas correcciones (punto 2.1).
   - **Sin tocar, a revisar:** `eventos-entre-consultas.ts` no cuenta como deterioro pasar de A1 a
     A2; es del Laboratorio, no de lo que lee el modelo. Y la medición de A2 en el retail que trajo
     la revisión (7 de 8 filas, A1 en 0 de 116) no se pudo repetir: ni `retails` de Proveedor_Info_1 ni el
     crudo guardado de Equifax traen calificación; salió de otra lectura.
1. **La comparación de marco-v30, v34 y v35** (se escribió para v32 y v33, que pasaron a v34 y v35 con
   el RUC depurado). Falta autorizarla con una cifra: 62 personas con las tres versiones, unos USD 3,5
   en lote (estimado, no medido: USD 0,0178 por análisis de v30, medido con v28; v32 sumaba unos USD
   0,0001 con el marco en caché y v33, USD 0,0019). Sin el brazo de v30,
   USD 2,4. Importa para saber cuánto mueven las correcciones y el buró
   (`docs/propuesta-marco-equifax.md`, secciones 6 a 8).
   **Las consultas de esas 62 caducaron el 18/10**: o se vuelve a pagar Equifax (USD 24,80, se
   autoriza aparte) o el lote acepta una fecha de análisis anterior al corte (un cambio chico).
   Octubre lleva USD 9,97 de 10 (punto 2.2), así que va desde noviembre. Se verifica con la
   comparación y su lectura.
   **Espera a la versión del marco con el predictor de ingresos** (punto 2.4, negocio, 2026-10-29), y
   **no se prueba ningún marco nuevo hasta terminar todos los arreglos** (negocio, 2026-10-31): vale
   para lotes, comparaciones y recálculos con el modelo sobre marco-v31 o cualquier versión nueva.
2. **El presupuesto del modelo.** `presupuesto_llm_mensual_usd` queda en 10 (negocio, 2026-10-29);
   octubre lleva USD 13,92 y pasó los avisos del 70 y el 85%. Lo que sigue abierto: el límite de la
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
5. **Declaración de disponibilidad completa.** Falta `cobertura`
   (`docs/declaracion-de-disponibilidad.md`). `suficienteParaPuntaje` quedó resuelto con las
   fuentes obligatorias (`FUENTES`, negocio, 2026-10-31): un caso que no se puede evaluar no se
   guarda como análisis, salvo la negativa de un control.
6. **Observaciones sobre los análisis de marco-v28** (en pausa desde el 2026-10-09): la regla de
   capacidad, bloqueos que no son de cumplimiento (48 de 77), demandas viejas que pesan (56),
   calificaciones sin monto en atraso, saldo de Proveedor_Info_1 repetido con otro banco (68), y que el
   modelo manda demasiados casos a revisar (143 de 200 en el lote del 07/10). Todo medido en
   `docs/observaciones-del-negocio.md`; se decide con el cuadro completo.
7. **Validar los criterios dentro de cada grupo del marco** (qué campo pesa cuánto). El orden de
   los grupos ya lo definió el negocio. Lo destraba una sesión de revisión con el negocio.
8. **Laboratorio: pantallas, simulación y decisiones.** El negocio recorre las pantallas con una
   sesión de admin (lista en `docs/laboratorio-pantallas.md`, final; lo ve desde el 2026-10-04) y
   llena `research/laboratorio/simulacion-institucion-2026-10-v2.xlsx` para el paso 2. Decide:
   qué son los «comentarios institucionales» (hoy la institución no entra), si hay una
   instalación para varias instituciones o una por institución, cuánto se conserva el crudo de
   Proveedor_Info_1 (LOPDP) y cómo medir una propuesta ya aplicada (`docs/laboratorio-guia.md`).
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
    **Propuesta (p4, 2026-11-09)**: desde la p4 el análisis lee la última consulta, vigente o no
    (`ultimaConsultaDeEquifax()`). Que la capacidad de pago (pantalla, función y Plus) lea esa
    misma, y que la vigencia sólo decida si Plus vuelve a pagar: una sola regla para leer y otra
    para cobrar. Hoy la de la capacidad toma la última por cédula sin mirar la fecha del cálculo
    ni la identidad, y no ve las consultas de AWS sin fila. Pro seguiría sin Equifax salvo que el
    negocio decida que lea la guardada, que no cuesta. Decide el negocio.
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
16. **Cuentas y credenciales.** Cambiar la contraseña de Proveedor_Info_1 (el usuario estuvo en el
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
    tiene dos niveles (1: Proveedor_Info_1 con su SRI; 2: Proveedor_Info_1 y buró de Equifax). **Aclarado el 2026-10-28
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
    **Decidido el 2026-10-29 (12.30):** el nivel 1 es la edad, el sexo y el SRI de Proveedor_Info_1 (más la
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
    oro con diferencia 0), `variables-de-ingreso.ts` con el nivel nuevo y el sexo de Proveedor_Info_1, y la
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
       con el SRI de Equifax en AWS (2026), que es la única que mide el SRI de Proveedor_Info_1 contra el de
       Equifax; con el sí del negocio. Revisar además los 553 perfiles que el HTTP 502 dejó guardados con
       la respuesta incompleta (el guion los contó como hechos). La prueba en sombra se repite tal cual
       (`node scripts/sombra-predictor-ingresos.mjs` y `scripts/predictor-ingresos/medir_sombra.py`).
       Las 542 de 12.29 sí tienen RUC en Proveedor_Info_1 (512): lo que no tienen es el SRI de Equifax.
    5. ~~Reentrenar el nivel 2 desde las respuestas crudas~~ **No hace falta (12.35, 2026-11-06)**: con `variables-de-ingreso-v2` la
       función reproduce el extracto (100% en las 3.935 que cruzan, y en cada mes desde febrero en las 5.001), así que el nivel 2 se entrena
       con el extracto y se sirve igual. El estado civil, la zona y el IESS salieron del nivel 2 en `ingreso-v2` (lo que costaban, en 12.35).
    6. (Sólo si se quisieran volver a meter en el nivel 2: `ingreso-v2` ya no los usa, 12.35.) Completar el módulo de variables para el nivel 2: el mapeo del estado civil, la provincia y el cantón
       de AWS a Proveedor_Info_1 (el sexo ya está medido), la zona en el perfil y las filas mensuales del IESS
       (`trabajoHistoricosMecanizado`; sección 9 de la especificación).
    7. **Desplegados para el nivel 1 (2026-10-31):** `modelos_de_ingreso`, `estimaciones_de_ingreso`
       (migración 141), `estimar-ingreso` y `POST /estimaciones-de-ingreso`, con lo que el negocio decidió
       el 2026-10-30 (especificación, sección 1). `ingreso-v1` nivel 1 está vigente (huella
       `b6bc58139cac`, 200 casos de oro iguales). La función rechaza una identificación inválida (400) y
       sin sesión (401). **Falta una estimación de verdad**, con una persona autorizada por el negocio y
       con un perfil bueno. La referencia de pensión de los jubilados (sección 3.3) no está construida.
    8. La capacidad de pago y la tarjeta de pantalla (pasos 6 y 7). Antes de mostrar los tramos, revisar
       con el negocio la regla de `cdf` (`comun.py`): con un mínimo alto, el tramo de menos de un salario
       básico queda en 2,5% y los siguientes en 0,01%, porque por debajo del primer cuantil vale la mitad
       de su nivel.
    9. **Fase 0 de la revisión del predictor, medida el 2026-11-06** (12.32; `scripts/predictor-ingresos/linea_base.py`, agregados en
       `metricas/linea-base-2026-11.json`). Hacia adelante, contra una línea base sin variables, el nivel 1 baja la pérdida de cuantiles 11,0% y el 2,
       27,8%; tramo exacto o vecino 67,6% y 82,3% contra 59,2%; el mínimo del 90% aprueba por error 0,5% y 0,2% de las decisiones de capacidad y
       niega de más 23,1% y 24,0%. **Metas propuestas, a decidir**: agudeza 13% y 30%, tramo exacto o vecino 70% y 84%, decisión con error de
       1% o menos y negadas de más de 21% y 20% o menos. Para las fases que siguen: entrenar sin rechazados y calibrar con OK FACTURAR, la cola
       exponencial de `cdf` (con espaciado mínimo de 0,30 en logaritmo; resuelve sólo el extremo, no el centro) y el salto de la etiqueta de OK
       FACTURAR al pasar al tope de 10.000 del predictor de Equifax.
    10. **Fase 2, primer paso: la matriz del nivel 2 desde el crudo, medida el 2026-11-06** (`scripts/predictor-ingresos/matriz-desde-crudo.mjs`; agregados
        en `metricas/matriz-desde-crudo-2026-11.json`). Las 20.560 respuestas bajadas (ids 400316 a 420882) pasaron por `derivarTablas` y `vectorDeNivel2`
        sin una falla (734 sin `reporteCrediticio`, que quedan sin variables). **Cruzan con la tabla de entrenamiento 3.935 de las 21.260 que entrenan**
        (OK FACTURAR 591, condicionado 184), **todas de septiembre y octubre**: de las 12.604 que entrenan hasta junio no cruza ninguna. Faltan del
        respaldo 17.325 (OK FACTURAR y condicionado: 1.925 hasta junio y 838 desde julio; ids 314409 a 400306), que se bajan de la más nueva a la más
        vieja. Con lo bajado no se puede reentrenar el nivel 2: hay que seguir hasta la id 314409 (diciembre de 2025).
        **Paridad de las 19 variables (3.935)**: desde `equifax_operaciones` coinciden con el extracto entre 25,3% (`c_tarjeta`) y 100%, y donde el
        extracto tiene dato, `c_tarjeta` 0,0%, `c_consumo` 19,0%, `n_consumo` 33,5% y `n_oper` 39,4%. Para tarjeta la cantidad de operaciones (97,6%) y el
        saldo (99,5%) casi coinciden y la cuota es otra (la mediana del módulo, 1,9 veces la del extracto). **Desde las listas de `interconnectResponse`
        coinciden al 100% en 16 de las 19, 99,6% en `max_dias_t` y 98,7% en `max_mora`** (74,5% a 100% en las 5.001 de todo el año, sección 9 de la
        especificación): con las consultas recientes la regla que no se encontraba se cumple casi entera. Entrenar con lo que arma el módulo sigue siendo
        coherente (la misma implementación entrena y sirve), pero cambia el significado de esas 19 (**resuelto en 12.35: las listas, con la mora como texto; punto 13**); la decisión entre las dos fuentes se toma al conocer
        la paridad de las consultas anteriores a septiembre, que no se midió.
    11. **Pedido a Proveedor_Info_1 de la base del IESS y el historial de deudas, armado el 2026-11-05** (12.33; libro y correo en
        `research/ejemplos-pedido-ingresos/`, fuera de git). El negocio lo envía. Lleva la cédula directa, cuatro cortes del IESS (octubre y julio
        de 2026, diciembre y octubre de 2025) y 13 meses de deudas por operación, con un número de operación estable. Va primero una muestra de
        10.000 personas. Al recibirla:
        - revisar el formato y las respuestas a las cinco preguntas del correo (sobre todo si los bancos traen número de operación);
        - medir la cuota desde el saldo en bancos, contra las cooperativas y el BIESS, que la traen;
        - decidir si se construye el estimador de 4.11;
        - pedir la base completa.
    12. **Fase 4, destilación con propósito, medida el 2026-11-06** (12.34; `scripts/predictor-ingresos/destilacion.py`, agregados en
        `metricas/destilacion-2026-11.json`). Hacia adelante, con la regla de cada hipótesis fijada antes de medir:
        - **D3 sigue**, pero sólo la calibración: calibrar el mínimo con OK FACTURAR y condicionado lleva la cobertura ahí a 90,2% y 90,5% (hoy 95,7% y
          93,3%) con un mínimo mediano de 1.462 y 1.690 (hoy 1.158 y 1.521). Los pesos por calidad de la etiqueta no entran: ganan a lo sumo 1,6% de
          pérdida en OK y la pierden en el resto. Una de cada tres etiquetas de OK FACTURAR es la cifra de Equifax tal cual (54% sin documento).
        - **D2 se descarta**: el alumno del predictor de Equifax (R² 0,791 contra la cifra) no anticipa que el ingreso quede bajo el mínimo (AUC de 0,43 a
          0,54 en OK); la cifra misma sí (0,68 en el nivel 2), pero en las etiquetas editadas baja a 0,56: es el ancla. Las consultas que paga CrediScope
          traen la cifra (96 de 97, `equifax_resumen.ingreso_estimado_usd`).
        - **D1 se descarta**: con 16.375 consultas sin ingreso validado etiquetadas por la cifra, la pérdida empeora entre 0,1% y 4,6%.
        - **Para `ingreso-v2`**: entrenar como hoy y calibrar con OK FACTURAR y condicionado **en los dos niveles (decidido por el negocio el
          2026-11-06)**. En el nivel 1 el «alcanza» por error sube de 0,5% a 1,2% (0,9 a 1,5), arriba de la meta propuesta de 1%, y niega de más 20,6%
          en vez de 23,1%; en el nivel 2 queda en 0,4%. Con el mínimo calibrado, la cobertura baja a 80% en todas y a 60% en los rechazados, cuya
          etiqueta baja por la decisión. Se aplicó al exportar `ingreso-v2` (punto 13); `ingreso-v1` sigue sin calibrar.
        - **Arreglado de paso**: desde el renombre del proveedor (#111) `preparar.py` no reconocía lo recuperado del IESS y armaba una tabla mala
          (57.340 independientes en vez de 57.061); la tabla en uso, del 22/10, estaba bien. Con el arreglo vuelve a salir idéntica.

    13. **`ingreso-v2` armado el 2026-11-06, sin publicar ni activar** (12.35; `scripts/predictor-ingresos/ingreso_v2.py`, agregados en
        `metricas/ingreso-v2-2026-11.json` y `metricas/ingreso-v2-nivelN.json`; los archivos, en `C:\datos\ingresos\modelos\exportado\`).
        - **El nivel 2 se sirve igual que se entrena**: `variables-de-ingreso-v2` arma las 19 de las operaciones de las listas de
          `interconnectResponse` con la mora máxima comparada como texto, como AWS («65» > «259»). Las 44 variables de Equifax coinciden con el
          extracto en el 100% de las 3.935 que cruzan; en las 5.001 de todo el año, en cada mes desde febrero (diciembre y enero, no). En
          producción el crudo se lee con `vectorDeNivel2DeLaConsulta` (`leerCrudoDeLaConsulta()`).
        - El nivel 2 ya no lleva el estado civil, la zona ni el IESS: servidos vacíos le costaban 1,31% de pérdida. Se entrena desde febrero
          (regla fijada antes de medir: cuesta 0,30% de pérdida y deja el entrenamiento igual a lo que se sirve).
        - **Calibrado con OK FACTURAR y condicionado, adentro del archivo** (corrimiento −0,227 y −0,117). Hacia adelante: cobertura en OK
          90,2% y 91,5%, mínimo mediano 1.462 y 1.688, «alcanza» por error 1,20% y 0,26%, niega de más 20,6% y 23,1%. Agudeza 11,0% y 27,1%,
          tramo exacto o vecino 67,6% y 81,9%: **pasan los pisos de la fase 0, no las metas**. El nivel 1 tiene los mismos árboles que
          `ingreso-v1`: sólo cambia la calibración.
        - **Arreglado**: la estimación tapaba con el null de la fila la calibración que trae el archivo (`estimacion-de-ingreso.ts`).
        - **Para decidir (negocio)**:
          - el sexo: con él, 0,002 y 0,001 de R² y una brecha de cobertura de 1,9 y 2,7 puntos; sin él, 2,4 y 2,2. Lo exportado lo lleva;
            sin él es `ingreso_v2.py --sin-sexo` y volver a exportar;
          - activar el nivel 1 de `ingreso-v2` en lugar de `ingreso-v1`: `node scripts/publicar-modelo-de-ingreso.mjs --modelo=... --seco`, y
            compararlo antes con el vigente (especificación, 7);
          - entrenar el nivel 2 con diciembre y enero si se prefieren los 0,3 puntos de agudeza.
        - **Falta para servir el nivel 2**: el selector de `estimar-ingreso` que lo use con una consulta de Equifax vigente (hoy sólo sirve
          el nivel 1) y una prueba con una persona autorizada.

    14. **Tipos de persona y agrupaciones, medidos el 2026-11-10** (12.36; `scripts/predictor-ingresos/tipos_y_grupos.py`, agregados en
        `metricas/tipos-y-grupos-2026-11.json`). Es el paso 1 del orden de trabajo de 3.5 de la especificación, sobre `ingreso-v2`.
        - **Ninguna agrupación mejora el predictor.** Probadas: los tipos, k-medias, mezcla de gaussianas, Gower, un árbol sobre el error y
          las hojas del modelo. Como variable, lo mejor es el tipo en el nivel 1 (+0,34%, la regla pedía 1%); un modelo por grupo pierde
          siempre. La calibración por grupo no deja todos los grupos entre 88% y 92%: la única ya lo hace en el nivel 1, y calibrar por tipo
          empeora (no se repite de un período al otro). **`ingreso-v2` queda como está.**
        - **La confiabilidad por tipo, medida** (cobertura del mínimo en OK, nivel 1 / nivel 2): formal 89,1% / 98,3%; semiformal 91,0% /
          90,0%; poco formal 88,7% / 92,5%. En el RUC no activo y el sin RUC no se puede medir: 26 casos OK de 1.363. Los rentistas (84 en
          la prueba) van con el semiformal. El formal lo subestima el nivel 2 (niega de más 37%).
        - **El extra del dependiente no se puede estimar** (AUC 0,62 con RUC activo, R² 0,01). El modelo de independientes aplicado a ese
          extra cubre 16% a 23%: da un mínimo del doble. **La fila de 3.5 que lo estima con el nivel 1 o 2 hay que cambiarla**: sin monto,
          «con o sin indicios; se valida con documentos». La actualiza la sesión principal.
        - **Para el marco, medido**:
          - la probabilidad de superar cada monto está bien calibrada en el nivel 1; en el nivel 2, en 2.000 sobreestima 5 puntos (ECE
            0,052), y una isotónica por umbral la arregla (medida, no construida);
          - «lo declarado está por encima de lo probable» anticipa que el validado baje: AUC 0,76 a 0,79 con el nivel 2. Con el nivel 1 no
            suma al declarado solo;
          - el ancho del rango sirve de grado de confiabilidad en el nivel 1 (tramo exacto o vecino de 78,8% a 61,5%), no en el 2.
        - **Para decidir (negocio)**: qué de esto se le entrega al marco y con qué nombres. Y si se construye la isotónica del nivel 2
          antes de entregarle la probabilidad.

    **Decisiones abiertas del negocio** (la destilación quedó medida con tres propósitos y no mejora la asertividad, punto 12; las de `ingreso-v2`, en el punto 13):
    las variables de la persona del nivel 2 (en `ingreso-v2` salieron: no se pueden servir); los nombres de pantalla; la base de 3,8 millones (pedido listo, punto 11); y `p42` y
    `nnivins` de la ENEMDU (los códigos de la ENIGHUR se confirmaron). Falta también cotejar el SRI de
    Proveedor_Info_1 con el de Equifax en más de 87 personas.
19. **Lo que quedó de la QA con cinco usuarios (2026-11-05, habilidad `qa-crediscope`).** Lo demás
    se decidió y se desplegó ese día (PR 130, sello `2d898f9ea4e9`). Queda:
    - **El crudo de Equifax en Storage: hecho el 2026-11-06** (148, PR 138; el estado, arriba). El crudo de las migradas
      pasó de 50,4 MB en la fila a 41 KB; `consultas_equifax` bajó de 60,9 a 5,3 MB tras el `vacuum full`. Quedan las tablas
      derivadas: **ordenar las 3.533 migradas de una vez no entra** (unos 390 MB), y se arman sólo cuando alguien consulta a
      la persona mientras su consulta está vigente, o con «Ordenar la consulta guardada» (administración).
    - **El menú en el teléfono** sigue siendo una fila de íconos sin texto, y las pestañas miden 31 px.
    - `/solicitud/no-existe` y una solicitud que no existe dan dos mensajes distintos; a los emojis el
      Inicio los llama «pasaporte».
20. **La revisión del análisis: las 10 propuestas, aprobadas y sin aplicar** (habilidad
    `revision-del-analisis`, piloto del 2026-11-06). Un jefe de crédito (Opus, a ciegas) revisó 12 análisis
    de la base de prueba de AWS, y se midieron sin modelo los 247 del lote del 31/10. De 81 hallazgos, el 64%
    nace en los datos que le llegan al modelo, y marco-v35 no corrige el 70%. Las propuestas están en
    https://claude.ai/artifact/7EsSQjxfejmkW2zNCNhsuS, y el 2026-11-08 el negocio aprobó las 10 sin
    comentarios (colección `decisiones`). Cada una va en su sesión y su PR, por el circuito de siempre; las
    que tocan el marco van juntas en la versión del predictor (p7). **La p4 no tenía una opción
    recomendada**: falta que el negocio diga cuál, y con cuántos días si es leer la última consulta. Las
    cuatro altas:
    - **p1, bloqueos por la demanda penal de otra persona**: el control toma la demanda sin cotejar al
      demandado, y en 8 de 33 bloqueados por una demanda el demandado es otro. En c-14f9ee80 se confirmó a
      mano, y la institución le había aprobado un crédito. Es el riesgo aceptado 5.5 (demandas de un
      homónimo), pero acá la demanda ajena no sólo pesa: bloquea.
    - **p2, aprobaciones sin razonamiento**: 45 de las 53 aprobaciones del lote salieron sin razonamiento.
      Sin razonar el modelo aprueba el 39%; razonando, el 6%.
    - **p3, la cartera de la institución llega mal al modelo**, en 7 de 12 casos: una sola operación, a
      veces la cancelada, sin cuota y fuera de la deuda.
    - **p4, Equifax existe y no llega**: 214 de 247 análisis piden una cuota que Equifax ya tenía, y sólo
      28 de las 244 personas tienen la consulta en la base. **En curso (2026-11-09)**: el negocio decidió
      que el análisis lea la última consulta, vigente o no; construida con un índice por cédula en Storage
      (281 KB, nada en la base). Medido sin costo: base de prueba, de 0 a 244 de 244 con buró a la fecha de
      su análisis (mediana de 17 días, máximo 58); cartera real con perfil, de 6 a 399 de 3.766 si se
      analizara hoy (mediana de 26 días, máximo 67). Falta subir el índice (`--indice`, escribe en
      producción), desplegar y la comparación con el modelo, con el sí del negocio (USD 3,8 a 9,3).

    **Hecho el 2026-11-09**: `armar-carpetas.mjs` sirve para cualquier marco, `medir-lote.mjs` mide los
    homónimos y los días entre la solicitud y la consulta, y `resultado-de-pago.mjs` arma el resultado de
    pago (p8): en 197 de las 232 personas de la base de prueba con solicitud, el crédito figura en la
    cartera de la institución; 18 están en mora hoy y ninguna en impago. **Pregunta abierta para el negocio**:
    27 de las 33 solicitudes con «RECHAZAR» en `credito-real.json` tienen el crédito en la cartera, así que
    esa decisión no es la que decidió si se otorgaba: ¿es automática y la revierte un analista?

    Lo que queda de la habilidad, sin decisión del negocio:
    - crear la tarea programada local del barrido mensual, con el sí del negocio.

    **Pregunta abierta**: cómo valida la institución el «ingreso validado del titular». En 42 de 233
    casos es igual (±5%) al estimado de Equifax.

    Se cierra cuando cada propuesta aprobada tenga su PR y su medición posterior (habilidad, paso 7).

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
3. **Proveedor_Info_1, por escrito: capacidad y contrato.** Si una cuenta sostiene 60 perfiles por
   minuto (hoy se satura cerca de 20) y si el contrato permite entregar sus datos a la
   institución, que es lo que necesitan la API y el perfil opcional. Mientras no conteste, la
   API no entrega lo que viene de Proveedor_Info_1. Se verifica con la respuesta escrita archivada.
4. **Proveedor_Info_1: lo que falta saber.** ¿Expone el régimen RIMPE? ¿Funciona el recurso
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
   2 h: `consultar-lote.mjs` retoma. Proveedor_Info_1 no cobra. Se verifica con los conteos de la ronda.
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
5. **Demandas de un homónimo.** Proveedor_Info_1 asocia las demandas por nombre y no trae la cédula de
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
   agente (las etiquetas del veredicto de capacidad para un «marco-v32» de entonces, que no es el marco-v32
   de la revisión de casos) quedaron en
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

## Cambio de nombre del proveedor a Proveedor_Info_1 (contrato, 2026-10-31)

**Hecho el 2026-10-31.** Repositorio, memoria y pantallas; secretos `PROVEEDOR_INFO_1_*` (los anteriores borrados);
migraciones 142 y 143; 24.807 filas de historial reescritas; 6.364 objetos del depósito de crudo copiados y el
anterior borrado; funciones desplegadas (sello `aedc9aa014c3`) y la `explore` anterior borrada.
`revisar-textos.mjs` corta si el nombre anterior vuelve. Queda fuera: el **historial de git** (commits y PR
pasados lo nombran; reescribirlo exige forzar `main`, protegida).
