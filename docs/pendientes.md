# Pendientes

Lo que quedó abierto al 2026-10-04 (cierre de la sesión de las pantallas). Las versiones vigentes son
marco-v28 con Claude Sonnet 5.5 (desde el 2026-10-03), estructura-v13,
fuentes-v10 y perfil-laboral-v3. Cada punto dice qué falta, por qué importa
y cómo se verifica.

Los números son de la base o del crudo local, medidos ese día. Antes de
actuar sobre uno, volver a medirlo: este archivo envejece.

Al cerrar un punto, se borra de acá y queda en el commit que lo cerró.

**Regla del negocio (2026-10-03):** toda prueba masiva con el modelo
(comparaciones, lotes) se corre sólo con su autorización explícita, con el
costo estimado. Una llamada suelta para comprobar un despliegue está
aceptada.

## 1. Para retomar primero

0. **Ver las pantallas del Laboratorio con sesión de admin: lo está
   haciendo el negocio** (2026-10-04) y va a comentar el resultado. Todas las
   pantallas que pidió el negocio están construidas (fases A a F y módulos
   1 a 3, migraciones 100 a 109; mapa en `docs/laboratorio-pantallas.md`),
   y **ninguna se vio en el navegador**: Claude no puede iniciar sesión (no
   escribe contraseñas). Los cálculos de cada pestaña se probaron en Node
   contra los cortes reales (`node scripts/probar-pantallas-laboratorio.mjs`
   y `node scripts/probar-estadistica.mjs`: todo cuadra) y todos los
   módulos cargan en el navegador sin errores. Recorrido, con el usuario
   logueado en `localhost:5184`:
   - Laboratorio › Inicio (hallazgos críticos, default por mes, análisis por
     mes, trabajos a medias, actividad).
   - Instituciones y proyectos: registrar una institución de prueba y un
     proyecto; asignarle una carga.
   - Datos y cartera: Cargas, Cortes, Centro de datos (abrir una fuente),
     Calidad de la carga, Conciliación, Explorador de cartera, Diccionario.
     Cargar un archivo chico con títulos que no son los de la plantilla
     (tiene que aparecer el mapeo) y anular esa carga después.
   - Prueba retrospectiva, con los dos cortes y las dos poblaciones: Resumen
     (calcular), Discriminación, Matriz, Umbrales (mover los dos
     deslizadores), Con y sin crédito, Lo que decidió la institución,
     Cosechas (con solicitudes tiene que decir que no hay fechas),
     Segmentos, Calibración (guardar una), Estabilidad (calcular el PSI),
     Comparar cortes, Simulación de política, Casos, Calificación.
   - Descubrimiento estadístico: Resumen, Descriptivas, Distribuciones
     (variables numéricas, sí/no y categóricas), Faltantes, Correlaciones
     (tocar una celda), Inferencia, IV y WoE (calcular), Laboratorio de
     tramos (cuantiles, monótonos, cortes a mano), Explorador de
     significancia (registrar la candidata), K-medias, PCA.
   - Descubrimiento profundo: Resumen, Explorador del crudo (registrar un
     hallazgo), Estructura, Entrada al modelo (comparar dos análisis), Los
     que cayeron, Investigación de casos → abrir un caso (ver el crudo),
     Motivos, Importancia, Taller (registrar la derivada), Registro de
     candidatas (pasar una a aceptada y crear su propuesta: tiene que salir
     en borrador por ser sintética).
   - Propuestas (Criterio vigente se retiró el 2026-10-07: la dirección
     vieja lleva a Propuestas).
   - **Que lo calculado se guarde** (111): después de recorrer las pestañas
     de un corte, `select origen, tipo, count(*) from lab_resultados group by 1, 2`
     tiene que traer filas con origen `navegador` (al 2026-10-07 había sólo
     las 40 de origen `base`), y volver a abrir la misma pestaña no tiene que
     sumar otra fila (misma huella).
   - **Verificar el crudo de una consulta nueva.** Hasta el 2026-10-04
     ninguna consulta guardaba su crudo en Storage (el depósito rechazaba el
     archivo: lecciones.md). Arreglado y desplegado ese día, y los 2.567 de
     la reconsulta del 03/10 se subieron desde `research/`: 0 perfiles sin
     crudo desde la 090. Falta ver una consulta nueva de punta a punta:
     después de consultar a alguien desde la pantalla,
     `select count(*) filter (where crudo_ruta is null), count(*) from client_profiles where created_at > '2026-10-04 03:40+00'`
     tiene que dar 0 sin crudo.

0a. **La evidencia sobre los que el modelo dio por buenos y cayeron, al
   informe** (decisión del negocio del 2026-10-06, que reemplaza a la de
   "hallazgos críticos" del 04/10). Los hallazgos son los resultados de los
   análisis estadísticos, descriptivos, inferenciales y exploratorios que
   ayuden a identificar a quienes el modelo dijo "no impago" (aprobar o
   revisar) y cayeron; sin registro de textos por crédito. Salen de los
   resultados guardados (fase 2 del plan de 0b) y van al Informe de
   Desempeño del Modelo (`src/lib/informeLaboratorio.js`). La lista de
   análisis está en `docs/propuesta-revision-del-laboratorio.md`, 10.3.

0b. **Laboratorio: el plan del 2026-10-06**
   (`docs/propuesta-revision-del-laboratorio.md`, secciones 10 a 12). Cuatro
   fases sin modelo de lenguaje ni pantallas nuevas: 1 lógica (disponibilidad
   de las fuentes en el detector, definición de impago nueva, "revisar" = no
   impago en todos lados), 2 orden (guardar resultados, una sola
   implementación de la estadística, retirar el ajuste de criterio), 3
   seguimiento (reporte mensual de la institución, reconsultas a los 3, 6, 9
   y 12 meses, cortes a esos horizontes) y 4 análisis (cosechas mes a mes,
   evidencia al informe, candidatas por horizonte). **La fecha que manda es
   la primera ronda de reconsulta de la cartera, a fines de diciembre de
   2026**: la fase 1 y las reconsultas tienen que estar antes.
   - **Fase 1 hecha el 2026-10-06** (110, `docs/propuesta-revision-del-laboratorio.md`
     sección 13): detector con disponibilidad de las fuentes
     (`scripts/probar-detector.mjs`), impago parametrizable (más de 90 días,
     bancos D o E, retail con deuda de más de USD 500, observación desde 15
     días; tabla de calificación versionada en Datos y cartera ›
     Configuración), "revisar" = no impago en la Matriz, los motivos y la
     investigación, el resultado del buró para todos en la población de
     solicitudes, y el ciclo simulado otra vez (carga `746e5271…`). **Las
     pantallas tocadas no se vieron con sesión de admin**: Configuración,
     Matriz (columna de observación), Investigación de casos (lista de
     observación), Los que cayeron (aprobar o revisar) y Nuevo corte.
   - **Fase 2 hecha el 2026-10-07** (111 y 112, sección 14 de la revisión):
     la estadística vive sólo en `src/lib/estadistica.js` (la base cuenta;
     las funciones que calculaban se borraron después de comparar en los
     tres cortes: todo igual), todo lo calculado se guarda con su huella y
     el ajuste de criterio se retiró (`analyze-client` desplegado sin él; el
     pedido al modelo quedó igual byte a byte). **Lo que se guarda desde las
     pantallas no se vio con sesión de admin** (ver 0).
   - La carga del primer ciclo (`1196978e…`) está anulada (confirmado por el
     negocio); la vigente es la del segundo (`746e5271…`).
   - Lo siguiente: fase 3 (operación única por institución y reporte
     mensual, reconsultas por aniversario a los 3, 6, 9 y 12 meses, cortes a
     esos horizontes, solicitudes por institución), antes de la reconsulta
     de fines de diciembre.
   - Decisión del negocio pendiente: qué son los "comentarios
     institucionales" (hoy la institución no entra al Laboratorio).
   - Mejoras chicas que el plan no toca: el ajuste por la recomendación
     para un valor numérico en el explorador del crudo; el origen de cada
     campo de la estructura como dato; "no consultado" contra "no tiene" en
     Faltantes (congelar la disponibilidad por tema con el corte); registrar
     los informes exportados y la revisión manual de la conciliación.
   - Falta un dato: la provincia de residencia (en el crudo, en
     direcciones); la comparación entre modelos necesita un marco candidato
     (fase 7, con costo).
   - Lo pesado (bosque, SHAP, K-medias, PCA) se recalcula con
     `node scripts/analisis-pesado.mjs --corte=<id>` cuando cambia un corte;
     el explorador del crudo, con `node scripts/explorar-crudo.mjs`.
   - Resultados de la corrida del ciclo: `docs/laboratorio-de-riesgo.md`,
     14.10, 14.11 y 15.4 (carga `1196978e-…`, corte `4e18ca83-…`).
   - 2 personas quedaron afuera del ciclo porque su perfil de t0 no tiene
     crudo guardado (consultadas desde la pantalla antes de la 090).

1. **Marco y modelo: dónde quedó** (2026-10-03).
   - **En producción: marco-v28 con Sonnet 5.5**, con el respaldo
     automático de Anthropic ante rechazos (`fallbacks: "default"`; sólo
     cubre "cyber" y "frontier_llm", un "general_harms" vuelve como fallo
     con su categoría). Verificado con una llamada real del código
     desplegado (1715532469: completa, USD 0,10).
   - **Comparación que lo decidió** (56 llamadas, USD 5,32; Excel en
     `research/comparacion-marco-v28-2026-10-03/`):

     | Corrida | USD | Seg. | Razonamiento | Misma recomendación que "hoy" |
     |---|---|---|---|---|
     | Hoy (v27, Sonnet 5) | 0,101 | 55 | 4.475 | — (1 cortada) |
     | Hoy otra vez (ruido) | 0,105 | 60 | 4.864 | 12 de 13, score ±39 |
     | v28, Sonnet 5 | 0,107 | 66 | 5.679 | 12 de 13, ±50 (1 cortada) |
     | v28, Sonnet 5.5 | 0,067 | 22 | 1.358 | 12 de 13, ±42 |

     **El ruido es el piso:** el mismo perfil dos veces mueve el score ~40
     y cambia 1 de 13 recomendaciones. 0502937675 (ingreso "Por
     confirmar") pasó de aprobar a revisar con v28: el negocio confirmó
     que es lo correcto.
   - **Marco por cliente (v29), hecho y apagado**: ver la sección 3.
     Encenderlo necesita la comparación `--configs=hoy,porCliente` (~USD 2,
     con autorización).
   - **Lote de análisis reales: postergado** (no hay presupuesto, y el
     Laboratorio no lo necesita para desarrollar). Listo:
     `node scripts/analizar-en-lote.mjs enviar --carpeta=research/lote-analisis-2026-10-03 --responsable=<uuid>`
     y después `recoger` (200 clientes, 280 pedidos, ~USD 4-6 por la API
     de lotes con caché). Antes: subir el límite de la consola de
     Anthropic (cortó cerca de USD 6 en septiembre) y
     `config_operativa.presupuesto_llm_mensual_usd` (USD 10; en octubre
     van ~5,4).

2. **Respaldo local del crudo.** La cartera entera se reconsultó el
   2026-10-03 (2.567, 0 fallas) y el respaldo vigente es
   `research/novadata-raw-2026-10-03/`: los recálculos van con
   `--carpeta=research/novadata-raw-2026-10-03`. Una consulta desde la
   pantalla deja el respaldo local atrás; su crudo queda en Storage desde
   el arreglo del 2026-10-04 (antes no quedaba en ningún lado: punto 0).

3. **Panorama de Fuentes de ingreso: "Calidad de la evidencia" y
   "Clientes que necesitan respaldo".** El análisis y la propuesta están en
   `docs/propuesta-panorama-respaldo-y-evidencia.md` (2026-09-29).
   - Falta que el negocio conteste las 8 preguntas de su sección 3; no se
     implementa antes.
   - Hay dos arreglos de la regla que no dependen del diseño:
     - sacar a las 18 sintéticas de la lista;
     - los 13 sin confirmar que no tienen ningún documento sugerido.
   - "Declaraciones de IVA de los últimos 6 meses" no existe para los
     negocios populares del RIMPE y es semestral para los emprendedores
     (SRI). Se lo pide hoy a 956 personas.

## 2. Riesgos técnicos conocidos

- **El repositorio es público desde el 2026-10-04** (decisión del negocio,
  para que GitHub Pages vuelva a publicar la aplicación sin plan pago).
  `docs/` y el historial de commits tienen cédulas reales de la cartera
  (en `docs/estructura-estandarizada.md`, `docs/lecciones.md`,
  `docs/pendientes.md` y dos propuestas, ~33 menciones) y quedan a la
  vista. Desde ahora no se escriben cédulas, montos ni datos de personas
  en el repositorio (documentos, commits, código ni pruebas). Si el negocio
  quiere, se pueden reemplazar en `docs/` por referencias enmascaradas; el
  historial sólo se limpia reescribiéndolo (force push, con su
  confirmación).

- **La cartera tiene 240 personas que no existen.** Son las cédulas
  sintéticas de prueba de Aval: 2.807 clientes = 2.567 reales + 240.
  - Tuercen todo total sobre la cartera (porcentajes, segmentos,
    "sin datos").
  - Decisión pendiente: marcarlas o borrarlas.
  - La lista está en `research/aval-pool-240.txt` y `pruebas/aval/`. Son
    exactamente las 240 cuyo último perfil está en estructura-v3
    (medido el 2026-09-29): se separan sin la lista.
- **Demandas que pueden ser de un homónimo.** Novadata asocia las
  demandas por nombre, y hay dos grupos sin resolver:
  - 31 de 4.602 (0,7%) no tienen el nombre de la persona entre los
    demandados;
  - 331 tienen ese campo vacío.

  Las denuncias ya se filtran por cédula (`_shared/denuncias.ts`); las
  demandas no traen cédula de las partes.

## 3. Propuestas sin decidir

- **La antigüedad de las demandas no llega al perfil** (mejora posterior,
  decidido por el negocio el 2026-09-29: no es urgente). El grupo de
  cobro dice cuántas y de qué tipo, no de cuándo. Las 8 personas que
  estructura-v12 pasó a "con demandas de cobro" lo son por demandas de
  1997 a 2010, y el modelo las lee igual que una de este año. La fecha
  está en el crudo (`demanda.fecha`).
- **Tipos que quedaron en "Otras" y parecen deuda, sin decidir:**
  expensas fijadas por la asamblea de copropietarios (2), pago de rubros
  (2) y pago de remuneraciones atrasadas (1, ¿laboral?). Se cambian en
  `_shared/demandas.ts`.
- **Adelgazar el marco: hecho en parte.** v28 lo bajó de 39.195 a 33.380
  caracteres sólo con forma; el siguiente paso es el marco por cliente
  (abajo). Con Sonnet 5.5 el razonamiento bajó a ~1.400 tokens y el marco
  (~12.000) es ~36% del costo de cada análisis. Recortar redacción de las
  secciones que van siempre (cómo escribir, recomendación, acciones:
  ~3.300 tokens) cambia lo que el modelo lee en todos los casos: necesita
  comparación y autorización.
- **Marco por cliente (v29), hecho y apagado** (2026-10-03,
  `_shared/marco-por-cliente.ts`). Omite las secciones de temas que el
  perfil del modelo no trae (PEP, pensión, demandas civiles, garantías,
  jubilados, etc.); con todo aplicable da el marco vigente byte a byte.
  Sobre los 2.567 perfiles reales el marco promedio baja de ~12.050 a
  ~9.100 tokens (25%, ~USD 0,006 por análisis). Se enciende con
  `marcoPorCliente` en `CONFIG_LLM`. Antes de encenderlo:
  - **validar** con `node scripts/comparar-razonamiento.mjs --configs=hoy,porCliente`
    (14 casos, ~USD 2, **sólo con autorización**): tiene que quedar dentro
    del ruido (±40 de score, 1 de 13 recomendaciones);
  - fila de marco-v29 en `scoring_rules_versions` y `MARCO_VERSION`;
  - guardar qué secciones se omitieron en cada análisis (columna nueva);
  - falta la segunda mitad: no mandar los grupos vacíos del perfil del
    modelo cuando el tema se consultó (~3-4% más), con una línea en el
    marco que diga que un tema consultado sin grupo es "no tiene nada".
- **Declaración de disponibilidad completa.** Los dos estados por tema
  ya existen (marco-v25). Falta `cobertura` y `suficienteParaPuntaje`,
  que significa no emitir un puntaje cuando la consulta no alcanza el
  mínimo evaluable. El diseño está en `docs/declaracion-de-disponibilidad.md`.
  Medido el 2026-10-03 sobre 2.567 perfiles reales: bancos y cooperativas
  se consultaron siempre; con un mínimo de seis temas (identidad, buró de
  bancos, cooperativas, aportes al IESS, demandas en su contra, listas de
  control) quedan 40 (1,6%) por debajo. Propuesto: aplicarlo en el código
  antes de llamar al modelo (no cambia lo que lee: sin versión nueva del
  marco). Esperan respuesta del negocio: ¿esos seis temas?, y ¿un caso no
  evaluable sólo se avisa, o se guarda como análisis sin puntaje (exige
  puntaje nulo en la base y en las pantallas)?
- **El indicio por impuesto a la renta es conservador.** Supone la
  tarifa máxima (37%) sobre lo que excede la fracción básica, así que
  sólo ve los casos claros. Con la tabla progresiva completa del SRI
  vería más.
- **Las cinco columnas `fuente_*` de `client_profiles` podrían ser
  columnas generadas por la base**
  (`generated always as (standard_profile->…) stored`). Así no podrían
  desalinearse, que es lo que pasó hasta d81591b. Primero las funciones
  tienen que dejar de escribirlas: regla 8 de CLAUDE.md.

## 4. Parámetros que vencen

- **2027:** agregar el año a `SBU_POR_ANIO` y a `FRACCION_BASICA_RENTA`
  en `fuentes-ingreso.ts` cuando se publiquen. Un año que falta en la
  tabla de renta no da indicio. Después correr
  `node scripts/calcular-columnas-del-perfil.mjs` (primero con
  `--seco`).
- **Presupuesto mensual del modelo:**
  - `config_operativa.presupuesto_llm_mensual_usd` está en 10;
  - los avisos saltan al 70, 85 y 100%;
  - un análisis cuesta ~USD 0,067 con Sonnet 5.5 (~0,10 con Sonnet 5); una
    configuración de la comparación de 14 casos, ~USD 1; un análisis por la
    API de lotes, la mitad.

  Confirmar que el monto es el que el negocio quiere. **El límite de la
  consola de Anthropic es otro, y en septiembre saltó primero:** cortó el
  2026-09-28 con USD 6,00 medidos por nosotros (y 31 llamadas sin medir),
  antes de nuestro aviso del 70%. Nuestro presupuesto tiene que ser el de
  la consola, o menor: si no, el primer aviso es la caída.

## 5. Decisiones de fondo e insumos de terceros

- **Validar con el negocio los criterios dentro de cada grupo del
  marco** (qué campo pesa cuánto). El orden de los grupos sí lo definió
  el usuario.
- **Preguntas abiertas del Laboratorio** (`docs/laboratorio-de-riesgo.md`,
  sección 13): ¿una instalación para varias IFI o una por IFI? (define cómo
  se separan los datos; decidido mientras tanto: instituciones y proyectos
  como entidades del Laboratorio, construidas en la 109); ¿cuánto tiempo se
  conserva el crudo de Novadata (LOPDP)? La base legal para reconsultar se
  resolvió el 2026-10-06: la autorización que el cliente firma al presentar
  la solicitud.
- **Medir una propuesta después de aplicada** (pedido del negocio del
  2026-10-06, para profundizar). Hoy nada vuelve a medir un cambio aplicado.
  Caminos a evaluar:
  - volver a puntuar con la versión nueva a una cohorte que ya tiene
    resultado y compararla con la vieja sobre las mismas personas (lo más
    limpio; cuesta modelo de lenguaje);
  - comparar las cosechas tempranas de las cohortes de antes y de después
    del cambio (barato, pero se mezcla con lo que cambie en la institución o
    en la economía);
  - fijar, al aprobar la propuesta, qué número tiene que moverse y cuándo se
    mira.
- **La fábrica de crédito está en pausa** por decisión del negocio. Ver
  `docs/arquitectura-fabrica-de-credito.md`.
- **Descarga masiva:** Reportes › Descargas la ve cualquier analista.
  Bajar la cartera entera es otro nivel de exposición que consultar de a
  uno.
- **Lotes grandes:** el Excel de un lote se arma en el navegador. Con
  ~5.000 personas son ~50 MB; conviene armarlo en el servidor al pasar
  de mil.
- **A la espera de terceros:**
  - Equifax: faltan credenciales de API. Se descartó automatizar el
    portal.
  - SMTP propio (Resend), para volver al código de 6 dígitos al crear
    cuenta.
  - Aval: el WAF rechaza la IP de Supabase. Hoy se consulta desde la IP
    ecuatoriana con `scripts/consultar-aval-local.mjs`.
  - Novadata:
    - ¿expone el régimen RIMPE?
    - ¿funciona el recurso `pensionista`? Devolvía `estado=false` en las
      389 de la muestra.
  - SRI: confirmar los umbrales de "obligado a llevar contabilidad",
    que hoy es un indicio de ingreso mayor.

## 6. Limpieza

- `scripts/reprocess-sample.mjs` quedó atrás de `process.ts`: lee la
  forma vieja de `empleoActual`. Hay que ponerlo al día o borrarlo; hoy
  se valida con `process.ts` directo bajo Node.
- Ramas locales ya contenidas en `main` o superadas:
  `aval-corredor-local-y-ambiente`, `claude/xenodochial-albattani-950de3`,
  `claude/fervent-swirles-6ceaac` (marco-v27, integrada) y
  `claude/cool-jemison-2a674d` (el parche 720f31b de Retroalimentación, que
  ya no existe; su 082 está en `main`). Se pueden borrar.
- La cartera sintética del Laboratorio (carga "Cartera sintética (semilla
  1)") se queda: es la que prueba los cálculos. Si se regenera, anular la
  anterior desde la pantalla.
- En la base quedan 5 lotes de prueba terminados: 3 del 2026-09-15
  ("Prueba de…") y 2 del 2026-09-23 ("prueba 078…"). Se pueden borrar
  los lotes. Antes, mirar si los perfiles que dejaron son de personas de
  la cartera.
