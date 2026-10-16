# Pendientes

Lo que quedó abierto al 2026-10-04 (cierre de la sesión de las pantallas),
con los bloques de la auditoría externa y de seguridad puestos al día el
2026-10-09 (sección 2, primeros puntos) y el de la revisión de UX el
2026-10-12 (sección 1, primer punto). La última migración aplicada es la
**126** (al 2026-10-13; la 127 espera su PR y el despliegue de las funciones);
desde la 116 se aplican con el corredor, y el número se toma al aplicarla,
no se reserva (regla 1 de CLAUDE.md). Las versiones vigentes son
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

- **Equifax (2026-10-13): en producción, con 22 consultas hechas y sus tablas y su
  estructura cargadas y verificadas. Cada consulta se cobra y su proveedor no
  pone tope: nada que consulte se corre sin autorización explícita del negocio.**
  - Qué hay: el conector desplegado (7 de 7 funciones, sello `7360d78b3096`), la
    tabla `consultas_equifax` (122) con 22 filas (2 de prueba y 20 de un lote:
    todas HTTP 200 y de la persona pedida), el guion local que simula por
    defecto, la exportación a Excel, el inventario y la conciliación de las
    respuestas (ver "Dónde está cada cosa" de CLAUDE.md). El consumo del
    2026-10-12 fue de 22 de 30; el tope diario es `EQUIFAX_TOPE_DIARIO`.
  - **Tablas y estructura (126, aplicada el 2026-10-13, aprobadas por el negocio:
    «ok»):** 11 tablas `equifax_*` con 17.293 filas de las 22 consultas,
    `equifax-tablas-v1` y `equifax-estructura-v1`, la derivación al guardar cada
    consulta nueva y `scripts/cargar-tablas-equifax.mjs`, que rehace las ya
    guardadas desde su crudo sin volver a pagar. El diseño y lo que se midió:
    `docs/propuesta-estructura-equifax.md`.
  - **Verificado en SQL contra el crudo:** las 11 tablas cuadran con las listas de
    Equifax en las 22 consultas; el detalle de todos los roles concilia con el
    resumen de Equifax en bancos 22 de 22, cooperativas 21 de 22 y comercial 16 de
    22 (igual que sobre el JSON y que la marca de la estructura); la deuda del
    titular de las tablas es la de la estructura en las 22. El control de seguridad
    (`auditar-seguridad.mjs`) da 68 puntos en OK, con las tablas nuevas.
  - **`probar_conexion` desde las Edge Functions: ok** (2026-10-13, 544 ms, con
    la sesión de admin del negocio en el panel local). Equifax deja pasar a las
    funciones para pedir el token; la consulta misma desde las funciones no se
    probó porque cobra. Hoy se sigue consultando desde la máquina con IP de
    Ecuador.
  - Las 22 consultas valen hasta el 17 de octubre: el 18 a las 00:00 de
    Ecuador caducan y volver a consultar a esas personas se cobra. Las tablas ya
    están cargadas; no hace falta volver a pagar para tener la estructura.
  - Qué falta, por orden:
    1. **El diccionario de datos de Equifax.** Lo consigue el negocio (dijo el
       2026-10-13 que lo puede dar); lo que hay que pedir, con la evidencia y la
       prioridad de cada punto, está en `docs/equifax-pedido-de-diccionario.md`. Lo
       que conteste se carga sin volver a pagar: se sube la versión y se rehacen
       las consultas.
    2. **Afinar la información de Equifax antes de cualquier muestra con y sin
       Equifax** (decisión del negocio del 2026-10-13, más tarde ese día): hay
       que decidir qué de Novadata repite lo que trae Equifax (o Aval), que
       tendrían la información más completa, y poder apagar esa parte de
       Novadata. Sin eso, la comparación mide la deuda dos veces. Se trabaja
       la semana del 2026-10-13, con las pantallas (punto 5).
    3. **El ajuste al marco interpretativo.** El negocio dijo «procede» el
       2026-10-13: la propuesta está escrita (`docs/propuesta-marco-equifax.md`:
       el bloque del perfil del modelo, el borrador de la sección, lo medido con
       las 22 y lo que decide el negocio). **No cambia nada de lo que lee el
       modelo**: activarla es una versión nueva (`marco-v30`; la v29 es el marco
       por cliente, apagado), con su fila en `scoring_rules_versions` y la
       autorización explícita del gasto (unos USD 1 en lote para comparar las 22;
       **octubre lleva USD 9,28 de 10**: se corre en noviembre o el negocio sube
       antes el tope del proveedor de IA).
    4. **Rotar las credenciales de Equifax:** se pegaron en un chat. El negocio
       dijo otra vez el 2026-10-13 que no es posible por ahora y que sigue en
       observación; el riesgo sigue mientras no se roten.
    5. **Pantallas:** el negocio decidió hacerlas la semana del 2026-10-13,
       junto con afinar la información (punto 2). Al hacerlas, rótulo «Score de
       Equifax» y el vocabulario de `docs/modelo-de-la-persona.md`.
    6. **Fichas de cumplimiento** (`docs/cumplimiento/`, fuera de git): sumar a
       Equifax como encargado y destinatario de datos de las personas. Se
       hace cuando termine el proceso de aprobación de Equifax (el negocio,
       2026-10-13: «Equifax está en proceso de aprobación»; no es una
       decisión de Claude ni de este repositorio).

- **Revisión de UX (2026-10-10 al 12). Para retomar ese frente, empezar acá.**
  El informe es `docs/revision-ux.md`; el vocabulario del producto,
  `docs/modelo-de-la-persona.md`; para repetir la revisión cuando cambie una
  pantalla, la habilidad `revision-ux` (`.claude/skills/revision-ux/SKILL.md`).
  Entró a `main` en tres PR: la revisión, el repaso en pantalla y las decisiones
  de nombres del 2026-10-12.
  - **Hecho:**
    - trece defectos funcionales (el enlace directo que caía en "/", las
      pantallas de administración en blanco, los submenús escondidos bajo
      860 px...), seis cifras que no cerraban y unos 90 archivos con textos,
      formatos y estados unificados (`formatos.js`, `mensajesDeError.js`,
      `navegacion.js`, `src/components/ui/`);
    - dos pasos nuevos en el control `pantalla` de cada PR:
      `scripts/revisar-textos.mjs` y `scripts/probar-formatos.mjs` (62 casos
      más los de navegación);
    - el 2026-10-12, con la sesión de admin que el negocio abrió en el panel
      de vista previa, se repasó en pantalla lo que faltaba: la franja de la
      bandeja da 2.572 y sus tarjetas suman 2.572; el menú abre una sección a
      la vez; a 768 y 414 px no hay desborde; Costos, Fuentes de Ingreso,
      Monitoreo, Lotes y los módulos del Laboratorio abren sin error, salvo la
      pestaña Centro de datos, que se arregló con la 121 y se vio abrir (52 fuentes);
      lo que apareció se corrigió;
    - **el mismo día el negocio decidió los nombres** y se aplicaron: «Lotes
      consultados», «Monitoreo» (antes Reportes; la página interna, «Panorama»),
      «Explorador de la fuente de datos», «Personas por segmento», **Score** en
      lugar de Puntaje (55 textos), el historial por cédula retirado y la
      búsqueda del Inicio que abre el Expediente. Dio además el modelo de la
      persona: el árbol y los estados. El control corta con los nombres viejos
      y avisa de cada «cliente» suelto (0 avisos hoy).
  - Queda, por orden:
  1. **Las tareas de la noche de las tablas de resumen** (124 y 125) corrieron por
     primera vez el 2026-10-13 y **salieron bien** (verificado ese día en la base):
     `resumenes-crediscope` (00:10 de Ecuador) y `resumenes-crediscope-dias` (00:20)
     figuran `succeeded` en `cron.job_run_details` (no en `cron.job`). El resumen por
     persona tiene las 2.812 personas, todas reescritas a las 05:10 UTC, sin ninguna
     sin fila ni huérfana; la tabla por día no tiene filas entre el 08 y el 12 porque
     no hubo consultas a Novadata esos días (perfiles: 5 el 07 y ninguno después).
     **Falta sólo ver en pantalla, con sesión,** la bandeja, Monitoreo, Fuentes de
     ingreso y el centro de datos: la salida se comparó idéntica en la base, pero no
     se recorrió. (El `"fallas": 0` de la reconstrucción no queda en el historial de
     pg_cron, que sólo dice «1 row»: se midió con el conteo de personas.)
  2. **El modelo de la persona** (`docs/modelo-de-la-persona.md`). El estado de
     la persona, la solicitud como entidad, las direcciones, las referencias,
     los documentos y los créditos de la persona no existen todavía como datos:
     hoy sólo hay nombres. Lo que espera al negocio (opciones y recomendación
     en la sección 5 de ese documento):
     - el nombre del segundo estado: «Solicitante» no convence;
     - qué estado tiene quien fue rechazado o desistió, y quién decide
       «Preaprobado»;
     - si «Perfil del Cliente» pasa a «Perfil de la Persona»;
     - si el dictamen del modelo («Negación») y la decisión de la solicitud
       («Rechazado») usan el mismo verbo;
     - confirmar que «fuentes» era aceptar «Explorador de la fuente de datos».
     Con eso respondido, el orden de construcción propuesto es: la solicitud
     como entidad, el estado de la persona calculado de sus hechos (con su
     historial), el filtro y la columna en la bandeja, y el embudo en Monitoreo.
     Se cruza con la API para las instituciones (`api/openapi.yaml`) y con
     `docs/arquitectura-fabrica-de-credito.md`.
  3. **Lo que todavía no se vio en pantalla:**
     - Configuración (Fuentes que consultamos, Campos del análisis, Qué ve el
       analista): la tanda en que iban se cortó por tiempo;
     - las pestañas internas de cada módulo del Laboratorio (las pantallas
       abren, no se recorrió cada pestaña) y Cargar archivo con un archivo
       (sólo se vio el formulario);
     - las cuatro pantallas de la persona (Perfil, Análisis, Fuentes de
       Ingreso, Aval) con datos;
     - una captura: el panel oculto hace fallar las capturas, y lo de 768 y
       414 px se midió en el DOM. Seguir
       `.claude/skills/revision-ux/recorrido-qa.md`: Claude no escribe
       contraseñas, el negocio ingresa con su cuenta en el panel
       (`npm run dev -- --port 5184`; en el panel, `crediscope-dev`).
     Lo que se vea bien se borra de la sección 1 de `docs/revision-ux.md`.
  4. **Decisiones de diseño y producto** (sección 3 de este archivo): nada se
     construyó sin su decisión.
  5. **Sin esperar decisión:** correr la habilidad al tocar una pantalla y
     migrar los estilos en línea a clases a medida que se toque cada una.

0. **Ver las pantallas del Laboratorio con sesión de admin: lo está
   haciendo el negocio** (2026-10-04) y va a comentar el resultado. Todas las
   pantallas que pidió el negocio están construidas (fases A a F y módulos
   1 a 3, migraciones 100 a 109; mapa en `docs/laboratorio-pantallas.md`).
   Claude no inicia sesión (no escribe contraseñas): las ve con la sesión
   que el negocio abra en el navegador integrado, como el 2026-10-07 (Resumen,
   Discriminación y Segmentos del ciclo simulado). Los cálculos de cada pestaña se probaron en Node
   contra los cortes reales (`node scripts/probar-pantallas-laboratorio.mjs`
   y `node scripts/probar-estadistica.mjs`: todo cuadra) y todos los
   módulos cargan en el navegador sin errores. Recorrido, con el usuario
   logueado en `localhost:5184`:
   - Laboratorio › Inicio (hallazgos críticos, impago por mes, análisis por
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
   - **Lo calculado se guarda: verificado el 2026-10-07** con la sesión del
     negocio. Discriminación y Segmentos guardaron solos (origen
     `navegador`, con el usuario y sin cédulas: los números de 10 dígitos
     del resultado son todos decimales), y volver a abrir Discriminación
     después de recargar no sumó otra fila. **Falta:** `n_malos` queda
     vacío cuando el resultado no trae un número de malos arriba
     (`tamanoDe()` en `resultadosDelCorte.js`; en Discriminación `malos` es la
     distribución): pasarlo explícito desde cada pestaña que guarda sola.

0a. **La evidencia sobre los que el modelo dio por buenos y cayeron, al
   informe** (decisión del negocio del 2026-10-06, que reemplaza a la de
   "hallazgos críticos" del 04/10). Los hallazgos son los resultados de los
   análisis estadísticos, descriptivos, inferenciales y exploratorios que
   ayuden a identificar a quienes el modelo dijo "no impago" (aprobar o
   revisar) y cayeron; sin registro de textos por crédito. Salen de los
   resultados guardados (fase 2 del plan de 0b) y van al Informe de
   Desempeño del Modelo (`src/lib/informeLaboratorio.js`). La lista de
   análisis está en `docs/propuesta-revision-del-laboratorio.md`, 10.3. Va
   después del paso 4 de `docs/laboratorio-guia.md`: sin datos reales no
   hay evidencia que juntar.

0b. **Laboratorio: seguir `docs/laboratorio-guia.md`** (desde el
   2026-10-07; paso actual: 1, registrar el Universo; se retoma la semana del
   2026-10-19, decisión del negocio del 2026-10-13). La guía reemplaza al
   plan de la revisión (sección 11) y a la propuesta de la fase 3 (sección
   15): los grupos (Universo, Universo analizado, Con crédito, Sin crédito),
   cómo se sigue cada uno, el plan por pasos y las reglas. **Sin pantallas
   nuevas hasta terminar el paso 4.** El negocio va a simular los reportes de
   la institución con `research/laboratorio/simulacion-institucion-2026-10-v2.xlsx`.
   **La fecha que manda es la primera ronda de reconsulta de la cartera,
   desde el 25 de diciembre de 2026.** Lo hecho antes de la guía:
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
     pedido al modelo quedó igual byte a byte). Lo que se guarda desde las
     pantallas, verificado con sesión (ver 0).
   - La carga del primer ciclo (`1196978e…`) está anulada (confirmado por el
     negocio); la vigente es la del segundo (`746e5271…`).
   - **El Universo analizado**: eran 14 solicitudes con análisis válido (no
     33) y 3 con el marco vigente; con el lote del 2026-10-07 son 205
     personas con marco-v28.
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
     desplegado (c-2a50c228: completa, USD 0,10).
   - **Comparación que lo decidió** (56 llamadas, USD 5,32; Excel en
     `research/comparacion-marco-v28-2026-10-03/`):

     | Corrida | USD | Seg. | Razonamiento | Misma recomendación que "hoy" |
     |---|---|---|---|---|
     | Hoy (v27, Sonnet 5) | 0,101 | 55 | 4.475 | — (1 cortada) |
     | Hoy otra vez (ruido) | 0,105 | 60 | 4.864 | 12 de 13, score ±39 |
     | v28, Sonnet 5 | 0,107 | 66 | 5.679 | 12 de 13, ±50 (1 cortada) |
     | v28, Sonnet 5.5 | 0,067 | 22 | 1.358 | 12 de 13, ±42 |

     **El ruido es el piso:** el mismo perfil dos veces mueve el score ~40
     y cambia 1 de 13 recomendaciones. c-64955685 (ingreso "Por
     confirmar") pasó de aprobar a revisar con v28: el negocio confirmó
     que es lo correcto.
   - **Marco por cliente (v29), hecho y apagado**: ver la sección 3.
     Encenderlo necesita la comparación `--configs=hoy,porCliente` (~USD 2,
     con autorización).
   - **Lote de análisis reales: hecho el 2026-10-07** con los 200 candidatos
     (`research/lote-analisis-2026-10-07/`): USD 3,55 con caché, 200 de 200
     guardados en marco-v28; revisar 143, aprobar 47, negar 10 (siete de cada
     diez a revisar: mirarlo al calibrar). Detalle en
     `docs/laboratorio-guia.md`. Lo que sigue es histórico (cómo se preparó):
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

- **Auditoría externa integral (2026-10-09). Para retomar, empezar acá.**
  - Informe con 27 hallazgos en `auditoria/2026-10-09-auditoria-externa-integral.md`
    (fuera de git). Remediación de los altos E1 a E5 en
    `docs/remediacion-auditoria-externa.md`.
  - Hecho ese día:
    - `main` protegida, con controles en cada PR y Dependabot;
    - despliegue sellado y confirmado;
    - clave de guiones (E4);
    - análisis reutilizado por huella (E1);
    - plazo por fuente y un token por consulta (E5);
    - constancia de los guiones;
    - las 240 sintéticas fuera de los totales;
    - migraciones 117 a 119, y la 120 el 2026-10-10 (la franja de la
      bandeja sin sintéticas).
  - `auditar-seguridad.mjs`: 68 controles en OK al 2026-10-13.
  - Queda, por orden:
  1. **E27, urgente: lo que lee el modelo.** Se corrige con una versión nueva
     del marco, en otra sesión (decisión del negocio). El 2026-10-13 el
     negocio pidió corregirlo; qué atributos personales salen se decide en el
     cuestionario de decisiones de ese día (con legal).
     - Detalle y opciones en el informe.
     - Los atributos personales se deciden con legal.
     - **La ficha de seguridad para clientes no se comparte** hasta
       desplegar el cambio y corregirla.
  2. **Probar con sesión real:** analizar dos veces a la misma persona. La
     segunda fila de `analysis_results` tiene que traer
     `reutiliza_analisis_id` y `duracion_llm_ms` nulo.
     - **Intento del 2026-10-13 (c-a1b2684a): no reutilizó, y no podía.** Su
       análisis anterior era del lote del 07/10, anterior a la 119 y sin huella;
       el de ese día salió de una consulta nueva a Novadata, con otra fecha de
       consulta (`perfilDelModelo.consultadoEn`) y un tema que esta vez no
       contestó («deudas con sentencia firme»).
     - **La reutilización vale sólo dentro de una misma consulta.** La fecha de
       consulta va en lo que lee el modelo, así que una consulta nueva siempre
       da otra huella, aunque los datos sean iguales.
     - **Falta la prueba de verdad:** volver a analizar a esa persona sobre el
       perfil del 13/10, sin consultar de nuevo, y mirar la fila nueva. Revisar también que
     la bandeja y Fuentes de ingreso no muestren a las sintéticas, y que la
     franja de la bandeja sume lo mismo que la lista (en la base coincide
     desde la 120).
  3. **Antes de pasar el repositorio a privado:** decidir GitHub Pro. En el
     plan gratuito, un repositorio privado pierde la protección de ramas. El
     escaneo de secretos lo cubre gitleaks en los controles.
  4. **El PR #19 de Dependabot** (3 actualizaciones menores de npm): los
     controles pasan (2026-10-13), falta fusionarlo. Los #1 y #2 entraron el
     2026-10-12.
  5. **E3, ambiente de prueba:** el negocio decidió esperar. Antes hace falta
     la línea base del esquema (E15).
  6. **E5:**
     - disyuntor por fuente;
     - después de la próxima reconsulta masiva, mirar
       `duracion_por_fuente_ms` y ajustar `PLAZO_POR_FUENTE_MS`;
     - la cola asincrónica la hace la sesión de la API para IFI; su
       migración toma el número libre al aplicarse.
  7. **E1, con impagos reales** (desde el 25/12/2026): la tarjeta de
     puntaje, según `docs/tarjeta-de-puntaje.md`.
  8. **Los medios y bajos (E6 a E26):** hoja de ruta en la sección 7 del
     informe.

- **API única para IFI (2026-10-09 y 10). Para retomar ese frente, empezar
  acá.** La propuesta completa está en `docs/cumplimiento/api/propuesta-api-ifi.md`
  (fuera de git), y el contrato, en `api/openapi.yaml`.
  - **Decidido** (D1 a D4, 2026-10-09):
    - se devuelve siempre el análisis; el perfil es opcional y se habilita en
      la configuración de cada IFI; el crudo, nunca;
    - la IFI se autentica con OAuth y `private_key_jwt`, desde IP
      permitidas;
    - la cola asincrónica (E5.3) es de este frente;
    - el pico es de 10 a 60 evaluaciones por minuto por IFI.
  - **Hecho (Fase 0):**
    - el contrato v1, que pasa el control estricto de Redocly;
    - borradores del texto de autorización del titular y del anexo de
      seguridad, en `docs/cumplimiento/api/` (ya en la carpeta principal);
    - el contrato con los nombres del modelo de la persona (#12,
      2026-10-12). Ese día se cerró la sesión de este frente: quien lo
      retome empieza acá.
  - Queda, por orden:
  1. **Arreglos chicos, hechos el 2026-10-13 en la rama
     `fix/sin-cedula-en-registros`; falta fusionar, desplegar con el corredor y
     aplicar la 127, en ese orden:**
     - `analyze-client`, el lote y la comparación de razonamiento dejan de
       escribir la cédula en `llm_llamadas.contexto`. La 127 la borra de las
       325 filas viejas, que tienen todas `client_id`, y Costos › Detalle de
       llamadas la lee de `clients`.
     - `consultar-aval`, el guion local de Aval y Equifax dejan de escribirla
       en `audit_log.meta`: la persona va por `client_id`. Las 485 filas viejas
       (448 de consultas a Aval, 15 de fallos de Aval y 22 de Equifax) se
       quedan, porque `audit_log` no se corrige (113). Sigue abierto que esa
       tabla la lee todo usuario con sesión.
     - El vigía prueba el modelo de producción, tomado de `llm-scoring.ts`.
  2. **Legal:**
     - revisar el texto de autorización y el anexo de seguridad;
     - los plazos del contrato modelo no coinciden con la norma
       SPDP-SPD-2025-0030-R: el encargado suprime en 3 días desde el aviso y
       devuelve o suprime en 5 días al terminar el contrato, y el contrato
       dice 5 días hábiles y 30 días.
  3. **Novadata, por escrito:** si una cuenta sostiene 60 perfiles por
     minuto (hoy se satura cerca de 20) y si el contrato permite entregar
     sus datos a la IFI, que es lo que necesita el perfil opcional.
  4. **Decisiones D5 a D15** (sección 14 de la propuesta). Mientras no se
     decidan, valen las recomendaciones.
  5. **Fase 1** (núcleo: recepción, cola, trabajador, topes, sandbox):
     - se construye y se prueba con simuladores, porque no hay ambiente de
       prueba (E3), y se despliega apagada para terceros;
     - su migración toma el número libre recién al aplicarse;
     - la v1 se publica sólo después de E27.

- **Seguridad, cumplimiento y cliente nuevo (2026-10-09).** Hecho ese día: auditoría con correcciones (113-116),
  corredor de migraciones y versión del esquema (base por cliente), las
  cédulas reales fuera del árbol del repositorio, y la ficha para clientes
  publicada como página privada (https://claude.ai/artifact/VPGD2bGsN6UVk5ofAr7XdV;
  fuente en `docs/cumplimiento/ficha-de-seguridad-para-clientes.html`).
  `node scripts/auditar-seguridad.mjs`: 41 controles en OK ese día y 50
  desde la auditoría externa. Estado de cada
  hallazgo en `auditoria/2026-10-09-auditoria-seguridad-y-cumplimiento.md`
  (sección 0) y documentos del SGSI, LOPDP e ISO 9001 en
  `docs/cumplimiento/` (las dos carpetas fuera de git). Queda, por orden:
  1. **Mudanza a Cloudflare Pages + repositorio privado** (decisión del
     negocio). Lo hace el negocio: crear el proyecto en Cloudflare
     (`npm run build`, salida `dist`, variables `VITE_SUPABASE_URL`,
     `VITE_SUPABASE_ANON_KEY`, `NODE_VERSION=24`) y pasar la URL; poner esa
     URL en Supabase › Authentication › URL Configuration. Después Claude:
     sumar el dominio a la secret `ORIGENES_PERMITIDOS` (con los de
     `localhost` y, mientras exista, el de github.io), correr el control
     con `--sitio=<url nueva>` (las cabeceras tienen que dar OK), y con
     confirmación volver el repo privado (`gh repo edit --visibility
     private`), retirar `.github/workflows/deploy.yml`, sacar
     `docs/cumplimiento/` de `.gitignore` y commitearlo, y actualizar
     `sitio` en `clientes/directorio.json`.
  2. **Probar con sesión real** (Claude no inicia sesión; sin probar al
     2026-10-09): una consulta, abrir un expediente, crear un lote (campo
     de base legal) y el Explorador de Fuentes (admin). Después,
     `select action, count(*) from audit_log where created_at > now() -
     interval '1 day' group by 1` tiene que mostrar `expediente.vista`.
  3. **Cambiar la contraseña de Novadata** (el usuario estuvo en el
     repositorio público) y cargarla con
     `npx --yes supabase@latest secrets set --env-file <temporal>`.
  4. **Antes del primer cliente externo**: armar su base desde cero (falta
     una línea base del esquema; ver `docs/plan-segundo-cliente.md`, "Lo
     construido"), parametrizar el control de seguridad por base, DPA de
     Supabase y Anthropic, prueba de restauración, cifrado de disco de la
     máquina con `research/`, validación legal, prueba de intrusión
     independiente.
  5. **Decisiones del negocio**: doble factor (MFA, "de momento ninguno";
     si se exige, la cuenta de QA deja de servirle a Claude) y plazos de
     retención (propuestos en `docs/cumplimiento/lopdp.md`).
  6. Una consulta del 2026-09-04 quedó anotada a un id que no es de ningún
     usuario: confirmar que era una cuenta de prueba borrada.
  7. El camino del 503 de `exigirEsquema()` no se probó (haría falta una
     base atrasada): probarlo con la primera base de prueba.

- **El repositorio es público desde el 2026-10-04** (decisión del negocio,
  para que GitHub Pages vuelva a publicar la aplicación sin plan pago;
  el 2026-10-09 se decidió volverlo privado con Cloudflare Pages). El
  2026-10-09 se sacaron del árbol las 31 cédulas reales (121 menciones,
  docs y comentarios del código): se citan como `c-xxxxxxxx` y el control
  mensual las busca. **El historial de commits las sigue teniendo**: se
  cierra volviendo el repositorio privado; limpiarlo del todo exige
  reescribirlo (force push, con confirmación, y `git filter-repo` necesita
  Python, que no está).

- **Las 240 personas sintéticas de Aval: marcadas y fuera de los totales**
  (118, decisión del negocio del 2026-10-09).
  - `clients.es_sintetico`: 240 marcadas, 2.572 reales.
  - Los totales de la base las excluyen; la bandeja las trae con la marca y
    las listas de la pantalla las filtran. La franja de la bandeja
    (`bandeja_conteos`) las excluye desde la 120.
  - **Ojo: "sintética" quiere decir que los datos que trajo Aval son de
    prueba, no que el número no exista.** El 2026-10-09 una de esas cédulas
    trajo nombre y datos en Novadata. Nunca usarlas para probar contra
    Novadata.
  - Una de ellas ya tiene un perfil en estructura-v13 por esa prueba. El
    perfil se borró, pero ya no se separan por "último perfil en
    estructura-v3": vale la marca.
- **Demandas que pueden ser de un homónimo.** Novadata asocia las
  demandas por nombre, y hay dos grupos sin resolver:
  - 31 de 4.602 (0,7%) no tienen el nombre de la persona entre los
    demandados;
  - 331 tienen ese campo vacío.

  Las denuncias ya se filtran por cédula (`_shared/denuncias.ts`); las
  demandas no traen cédula de las partes.

## 3. Propuestas sin decidir

- **Observaciones del negocio sobre los análisis de marco-v28** (levantadas
  el 2026-10-07, **en pausa desde el 2026-10-09** por decisión del negocio):
  aprobación baja por la regla de capacidad (1 de 55 independientes),
  bloqueos que no son de cumplimiento (48 de 77 sólo por lista negra de
  Novacredit, OFAC sin cédula o providencias de certificación), demandas
  viejas que pesan (56), calificaciones B1-E sin monto en atraso, saldo de
  Novadata que es la misma deuda que el Banco Internacional (68). Todo
  medido y con opciones en `docs/observaciones-del-negocio.md`; los casos
  los lista `scripts/detectar-atipicos.mjs`. Se decide cuando esté completo.
  El 2026-10-13 el negocio volvió a marcar que el modelo manda demasiados
  casos a revisar (en el lote del 07/10 fueron 143 de 200, y las dos personas
  analizadas ese día también salieron a revisar). Está en el cuestionario de
  decisiones de ese día.

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

- **Revisión de UX: diseño y producto sin decidir**
  (`docs/revision-ux.md`, sección 3, con las opciones y la recomendación; los
  nombres se decidieron el 2026-10-12 y las preguntas que quedaron están en
  `docs/modelo-de-la-persona.md`, sección 5):
  - Diseño: Inicio como pantalla de trabajo, un solo camino a una persona
    (falta **Aval** en el expediente), unir "Empleos vigentes" y "Fuentes
    detectadas", menos accesos por fila en la bandeja.
  - **Retirar `humanizarTexto()`** (`src/lib/formatos.js`) cuando
    `fuentes-ingreso.ts` guarde los meses y los dólares con el formato de la
    casa: es una versión nueva de fuentes con recálculo de los perfiles, y
    mientras tanto la pantalla los arregla al mostrarlos.
  - La auditoría del expediente nombra a los demás usuarios como "Otro
    usuario": nombrarlos exige exponer una vista con los nombres (permisos).
  - "Cargando..." por esqueletos en las tres pantallas más lentas (Bandeja,
    Expediente, Panorama: de 5 a 10 s en desarrollo; la medida real se toma
    con `npm run build && npm run preview`).
  - El orden de los nombres que trae la fuente es inconsistente ("Apellidos
    Nombres" para unas personas y "Nombre Apellido" para otras) y se muestra
    tal cual.
  - Quedan 1.761 estilos en línea en 110 archivos: lo nuevo usa clases.

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

- Ramas locales ya contenidas en `main` o superadas:
  `aval-corredor-local-y-ambiente` (4159844), `claude/xenodochial-albattani-950de3`
  (dc5077b), `claude/fervent-swirles-6ceaac` (80dc918, marco-v27, integrada),
  `claude/modest-moser-a6250b` (c7ce76f, el contrato de la API, entró como
  #5) y `claude/cool-jemison-2a674d` (720f31b, el parche de Retroalimentación,
  que ya no existe; su 082 está en `main`). Se pueden borrar, y también las
  carpetas de trabajo `.claude/worktrees/cool-jemison-2a674d` y
  `xenodochial-albattani-950de3`. **Revisado el 2026-10-13:** lo que tienen
  fuera de git (`docs/cumplimiento/`, `.env`) es igual a lo de la carpeta
  principal. El único archivo distinto es el README de `docs/cumplimiento/api/`,
  igual byte a byte con otro nombre. El borrado espera el permiso del negocio:
  el control de permisos de la sesión lo frenó.
- La cartera sintética del Laboratorio (carga "Cartera sintética (semilla
  1)") se queda: es la que prueba los cálculos. Si se regenera, anular la
  anterior desde la pantalla.
- En la base quedan 5 lotes de prueba terminados: 3 del 2026-09-15
  ("Prueba de…") y 2 del 2026-09-23 ("prueba 078…"). **Revisado el
  2026-10-13:** tienen 26 ítems en total, y los 11 perfiles que dejaron son
  de personas reales que ya tienen un perfil más nuevo. Borrar un lote borra
  sus ítems (`on delete cascade`), pero no los perfiles: los ítems sólo los
  apuntan. Falta el sí explícito del negocio para borrarlos.
