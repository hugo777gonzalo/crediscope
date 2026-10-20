# Pendientes

Lo que quedó abierto al 2026-10-04 (cierre de la sesión de las pantallas),
con los bloques de la auditoría externa y de seguridad puestos al día el
2026-10-09 (sección 2, primeros puntos) y el de la revisión de UX el
2026-10-12 (sección 1, primer punto). La última migración aplicada es la
**135** (los datos de la API en la solicitud, 2026-10-19; la 131 es la fila de
marco-v31). Las funciones desplegadas llevan el sello `2dacfcfbddd9` (10 de 10);
desde la 116 se aplican con el corredor, y el número se toma al aplicarla,
no se reserva (regla 1 de CLAUDE.md). Las versiones vigentes son las de E27
(ver la sección 2, punto 1) con Claude Sonnet 5.5, estructura-v13,
fuentes-v10 y perfil-laboral-v3; marco-v31 (el buró de la institución) está
construido y apagado. Cada punto dice qué falta, por qué importa y cómo se
verifica.

Los números son de la base o del crudo local, medidos ese día. Antes de
actuar sobre uno, volver a medirlo: este archivo envejece.

Al cerrar un punto, se borra de acá y queda en el commit que lo cerró.

**Regla del negocio (2026-10-03):** toda prueba masiva con el modelo
(comparaciones, lotes) se corre sólo con su autorización explícita, con el
costo estimado. Una llamada suelta para comprobar un despliegue está
aceptada.

## 1. Para retomar primero

- **Revisión de UX de las pantallas de crédito (2026-10-18): corregido lo seguro,
  queda por ver en pantalla y por decidir.**
  - Se vio con la sesión de QA a 1280 y a 414 px (2026-10-18) y **a 768 px el
    2026-10-20**: el simulador con la Tasa mínima y máxima (vacía, 16 y −1), la
    solicitud que no existe, la solicitud evaluada con los pasos plegados, la
    confirmación de Plus (admin; se canceló sin crear nada), la lista de recientes
    con error (simulado: traduce el error de la base) y las flechas del grupo de
    modalidades. Sin hallazgos del verificador salvo texto de 11 px en la bandeja.
  - **El resumen fijo de la cuota** (pantallas chicas) quedaba pegado encima de la
    tarjeta grande, con la misma cuota dos veces y el reparto tapado, a 768 y 414
    px. Desde el 2026-10-20 se oculta mientras se ve alguna parte del resultado;
    visto a 414 en el simulador. **Falta verlo en Capacidad de pago** con la sesión
    (la sesión de QA se cerró a mitad de la revisión).
  - Por decidir con el negocio: la lista de «Solicitudes recientes» muestra la
    cédula completa de cada persona (es la bandeja del analista, pero conviene
    confirmarlo); y ya trae el veredicto y la recomendación de cada una, que no
    se dibujan.
- **Demo para una IFI (al 2026-10-19). Empezar por `docs/plan-demo-ifi.md`**
  (sección 0.1: decisiones del negocio; sección 7: el orden). Base en la **135**,
  funciones con el sello `2dacfcfbddd9` (10 de 10, desplegadas el 2026-10-19 con el freno de Equifax,
  los límites del producto y los 3 intentos a Equifax). El control de seguridad
  71 de 71 es del 2026-10-18; el 2026-10-19 sólo se comprobó la versión desplegada
  (desde un worktree, el resto de sus puntos falla por el enlace a la base). Hecho y en producción: simulador (#39), capacidad de pago
  con el Ingreso declarado (#42, #45), solicitud y orquestador Básico / Pro /
  Plus (#46, 133), la revisión integral (#48 a #51) y los estados de la persona
  con la decisión de la institución (#52, 134). Las tres modalidades se probaron
  de punta a punta el 2026-10-18 con una persona real (Plus pagó una consulta de
  Equifax, autorizada). Queda, por orden:
  1. **Los estados de la persona, hechos el 2026-10-18** (#52, 134;
     `docs/modelo-de-la-persona.md`): el analista marca Aprobado, Rechazado o
     Desistió en `/solicitud/:id`, con motivo (vale la última; todas en
     `decisiones`); el estado se calcula con `estadoDeLaPersona()` y se ve en la
     solicitud; «Perfil de la Persona» renombrado. Probado en pantalla a 500 y
     1280 px con una solicitud de prueba (quedó **Aprobado** con el motivo
     «Prueba de la pantalla de decisión»: la solicitud Básico más reciente de la
     persona de las pruebas del 18/10). **Falta**:
     - mostrar el estado en la bandeja (filtro y columna, con otro nombre que el
       «Estado» del análisis), en el Expediente y el embudo en Monitoreo. **Se hace
       cuando se rehagan esos procesos y pantallas** (negocio, 2026-10-19), no
       antes. Para la
       bandeja conviene calcularlo en la base (`resumen_por_persona`): hoy la
       regla vive sólo en `estado-de-la-persona.ts`, y si se copia a SQL las dos
       tienen que cambiar juntas;
     - Cliente activo y Cliente cerrado, que necesitan los créditos;
     - que el negocio confirme lo que se resolvió sin su palabra: con Revisar o
       Negar la persona sigue En proceso hasta que decide el analista, y manda la
       última solicitud;
     - la API: la decisión por `POST /evaluaciones/{id}/decision` admite además
       `aprobado_con_condiciones`, monto y plazo aprobados; la pantalla, no.
  2. **La revisión integral, hecha el 2026-10-18** en cuatro sesiones (#48
     pantallas, #49 contrato y documentos, #50 funciones y seguridad, #51
     cálculos: simulador-v2 y capacidad-v3) y desplegada. Queda lo que el
     contrato dice y el código no hace (se corrige tocando código):
     - **Contestado por el negocio el 2026-10-19** (numeración del informe de la
       revisión). Una palabra antes: «contrato», en esta lista, es la
       especificación técnica de la API (`api/openapi.yaml`), no el contrato
       comercial con la institución; en el comercial la IFI declara que tiene la
       autorización de cada persona.
       1, 2, 4 y 7: **cerrados el 2026-10-19** (#59; migración 135 aplicada y
       funciones desplegadas con el corredor, 10 de 10; control de seguridad 73
       de 73). Quedó dicho en CLAUDE.md (módulo de la solicitud). Lo que sigue
       abierto de ellos: `modalidad` es obligatoria en la función interna (el
       contrato pone `basico` por omisión: lo resuelve la puerta de la API);
       `reemplazaA` sólo se guarda, y que reutilice el perfil es de la puerta; y
       en Básico las condiciones de `solicitudDeCredito`, que el contrato manda
       guardar, todavía no se guardan.
       3. **Estados y etapas**: se hace cuando los flujos estén afinados
          (capacidad de pago, predictor de ingresos). No se toca antes.
       5. **Quién paga Equifax por la API y los niveles de acceso**: el negocio
          propone cuatro niveles (dueño, administrador de la institución, usuario
          A que consulta y evalúa, usuario B que sólo ve). Ver «Niveles de
          acceso» en la sección 3.
       6. **Sin firma**: el negocio no quiere firmar los resultados. Se sacaron
          del contrato el campo `firma` y la operación de claves públicas
          (`/.well-known/jwks.json`). Queda la firma de los avisos
          (`webhook-signature`, que protege a la institución de un aviso falso)
          y la de la ficha de acceso (OAuth); no son lo mismo.
       8. **Validaciones que el contrato declara y la función no hace**
          (`additionalProperties: false`, máximos de 20 ingresos, 50 obligaciones
          y 50 deudas sin cuota, `ingresoDeclarado` de más de mil millones,
          `parametros` fuera de 0 a 1 que se ignoran en vez de dar 400, los
          `ingresos` que se ignoran si viene `identificacion`, y `cedula` además
          de `identificacion`): se hacen en la puerta de la API, no en la función
          interna.
       9. **Errores, autenticación e `Idempotency-Key`** (las funciones contestan
          `{ error, errores: [texto] }` con la sesión de un analista; el contrato
          pide `application/problem+json`, OAuth y la clave de idempotencia): es
          la Fase 1 de la API. El contrato ya lista el 503 de `POST
          /capacidades-de-pago`.
       10. **Decimales**: los importes van con dos decimales (lo que cobra una
           institución) y las tasas y fracciones con toda la precisión del cálculo
           (más de 8 decimales), sin redondear. Ya es así; el contrato lo dice.
       11. **`datos` y `procedencia`** de la respuesta de la capacidad: se
           explicó al negocio (`datos` = qué ingresos y cuotas se contaron;
           `procedencia` = de dónde y de qué fecha). Falta que decida si se
           quedan en la API.
     - **Las otras diferencias de la revisión** (el resultado de la evaluación
       guarda un resumen del análisis y el contrato pide positivos, negativos,
       razonamiento y controles de bloqueo, que están en `analysis_results`) se
       resuelven al construir la puerta de la API.
     - **Funciones y base (2026-10-18), corregido y desplegado** (516dc33): `evaluar-solicitud` ya no copia en
       la solicitud el mensaje de la función llamada (podía traer el de Novadata,
       Equifax, el modelo o la base: `falloDeUnPaso()`); un paso que pudo dejar
       algo en vuelo (el buró, sobre todo) no se reintenta hasta 3 minutos
       después; dos solicitudes de la misma persona no consultan Equifax a la
       vez; Plus ya no calcula con Novadata cuando la consulta de Equifax no tiene
       estructura; y un fallo queda en `audit_log` (`solicitud.paso_fallido`).
       `capacidad-de-pago` lee la misma consulta de Equifax que la pantalla y
       rechaza una cuota que no es número.
     - **La supresión de una solicitud sin persona (136, pedida por el negocio el
       2026-10-19).** Si el primer paso no llega a crear a la persona en `clients`
       (la fuente no la encuentra o no contesta), la solicitud queda sólo con la
       identificación, y `suprimir_titular()` exigía la fila en `clients`: no la
       alcanzaba (igual con una consulta de buró suelta o lo cargado al
       Laboratorio). La 136 la recrea desde su definición viva: sin persona borra lo
       que hay por la identificación, y sólo si no hay nada contesta «No hay ningún
       registro». `derechos-del-titular.mjs` lista, exporta y suprime también sin
       persona. Hoy no hay ninguna fila así (medido el 2026-10-18).
     - **Para decidir: qué consulta de Equifax entra en la capacidad.** La
       pantalla y `capacidad-de-pago` usan la última de la persona aunque haya
       vencido; Plus, sólo la vigente (la misma regla que el modelo); Pro, ninguna
       (plan, sección 4). El enlace «Ver el detalle de la capacidad de pago» de la
       solicitud abre la pantalla, que puede dar otra cuota que la solicitud.
     - **Sin candado para dos consultas a Equifax a la vez** (decisión del negocio,
       2026-10-19): que dos usuarios consulten a la misma persona al mismo tiempo
       por caminos distintos (el botón de administración y una solicitud Plus) es
       muy poco probable, y con unos 40 s de diferencia la segunda ya encuentra la
       consulta vigente y la reutiliza. No se construye. Entre dos solicitudes Plus
       ya se controla (`pasoEnCurso()`).
     - **Tasa máxima y Tasa mínima (negocio, 2026-10-19; simulador-v4).** Consumo
       va de una Tasa mínima de 0% (financiamiento sin interés) a una Tasa máxima
       de **15,6%** (era 15%). Sin tasa en el pedido se evalúa, y se guarda en la
       solicitud, la máxima; con una tasa, se pide una menor; nunca negativa ni
       mayor que la máxima. Se dice «Tasa máxima» y «Tasa mínima», no «tope». Cada
       error de las condiciones trae un código fijo con su significado
       (`erroresDelPedido()`; `detalles` en el 400 de `simular-credito` y
       `capacidad-de-pago`; `ErrorDeCondiciones` en `api/openapi.yaml`, con la
       tabla).
     - **Límites del producto de consumo (2026-10-19, PR #56, desplegado con f4d80e0):**
       monto de USD 1.000 a 120.000 y plazo de 6 a 120 meses (`PRODUCTO_CONSUMO.limites`,
       simulador-v3). Una
       solicitud guardada fuera de esos rangos falla en el paso de capacidad (no se
       midió si hay alguna).
     - **Intentos a Equifax: 3 en total desde el 2026-10-19** (decisión del negocio;
       `EQUIFAX_MAX_INTENTOS`, por defecto 3 en el código; antes eran 2), con 1,5 s de
       espera creciente y sólo para lo que no llegó a procesarse (429, 502, 503, 504;
       un 401 con token nuevo). Un timeout no se reintenta solo, y un paso de la
       solicitud que pudo dejar algo en vuelo no se reintenta hasta 3 minutos después.
       **El freno** (construido y desplegado el 2026-10-19, 2dacfcf): tras 3 fallos seguidos
       de Equifax (no llegó, 5xx, credenciales rechazadas o respuesta incomprensible; no
       cuentan los de una persona), `consultar-equifax` contesta 503 con el motivo
       `equifax_no_responde` sin llamar ni cobrar, hasta 10 minutos después del último
       fallo; pasado ese tiempo sale UNA consulta de prueba (si falla se cierra de nuevo,
       si sirve se reinicia). Vive en `frenoDeEquifax()` de `equifax-persistencia.ts`,
       así que lo comparten la función y el guion local; lo reutilizado y la
       simulación no lo tocan. En la solicitud, el paso del buró queda fallido con el
       código `buro_no_disponible` y sin espera. Si la auditoría no se puede leer, no
       frena (el tope diario es el que protege la plata).
     - **Cuota de 200 de Equifax: aclarado, era un error de interpretación del
       negocio (2026-10-19).** El pedido no tiene campo de cuota (`tipoProducto` 1,
       `monto` 5.000, `plazo` 12, `restaGastoFinanciero` 0) y no hay nada que cambiar.
  3. **El predictor de ingresos**: lo lleva otra sesión
     (`docs/investigacion-predictor-de-ingresos.md`); en proceso, alrededor de una
     semana más (negocio, 2026-10-19).
  4. **El marco y el modelo, al final** (decisión del negocio): que lea la
     solicitud, la cuota y la capacidad es una versión nueva del marco.
  - Hallazgo que pesa en la demo: con sólo el IESS, 55 de las 62 personas con
    Equifax ya pagan más que su ingreso neto (la cuota de Equifax sí es
    mensual). Por eso existe el Ingreso declarado.
  - Las pruebas con sesión van en el puerto 5184 (origen permitido por CORS).

- **Equifax (al 2026-10-17): en producción, con 87 consultas hechas y sus tablas y
  su estructura cargadas y verificadas, la pestaña con su PDF y, desde el
  2026-10-17, el botón para consultar desde la pantalla. Cada consulta se cobra y
  su proveedor no pone tope: nada que consulte se corre sin autorización explícita
  del negocio, y el botón pide confirmar cada una.**
  - **Lote del 2026-10-16** (40 personas, autorizado por el negocio): personas
    reales sin consulta previa y con la historia crediticia más larga en su último
    perfil de Novadata, con 11 o 12 operaciones cada una. 17 tienen cooperativas,
    17 retail y 24 son codeudoras o garantes. La lista está en
    `research/equifax/lotes/lote-2026-10-16.txt`, y los casos con lo que trae cada
    uno, en `lote-2026-10-16-casos.tsv` (fuera de git).
    - Se pagaron 40 de 40. Todas son HTTP 200, de ambiente producción, de la
      persona pedida, con su `client_id`, y la auditoría no lleva la cédula.
      Ningún fallo.
    - Para cubrir las 40 en un día, el tope se subió sólo para esa corrida
      (`EQUIFAX_TOPE_DIARIO=40` en el entorno del guion, no en las secrets).
    - **El crudo queda doble:** el archivo en `research/equifax/crudo/` (62),
      escrito antes de interpretarlo, y `consultas_equifax.respuesta_cruda` (62,
      inmutable). Las tablas se rehacen desde ahí sin volver a pagar
      (`cargar-tablas-equifax.mjs`).
    - **Valen hasta el 17/10**: la vigencia es por ciclo, del 18 al 17 de cada
      mes, sin importar el día de la consulta. Desde el 18 a las 00:00 de Ecuador,
      volver a consultar a cualquiera de las 62 se cobra.
    - **`probar-equifax-tablas.mjs` sobre las 62: todo da ok** (2026-10-17). La
      lista de «garantías personales» coincidía con las operaciones de rol
      codeudor en 60 de 62 personas: las 2 que no son las únicas cuya lista trae
      tipo `GARANTE`. Separada por tipo, **`CODEUDOR` = rol codeudor en 62 de
      62**, y la prueba compara así. **Los garantes no coinciden**: de 6 personas
      con alguno en la lista o en el detalle, en ninguna son iguales cantidad y
      monto (una tiene 3 garantes en la lista que el detalle no trae con ese
      rol). La «Deuda como codeudor o garante» sale del detalle, así que un
      garante que sólo está en la lista no se cuenta: la pregunta quedó en
      `docs/equifax-pedido-de-diccionario.md` (3.8, prioridad alta). **El campo
      `coincideConLasOperacionesDeRolCodeudor` de la estructura todavía compara
      la lista entera**: se separa por tipo con la próxima versión de la
      estructura (la del diccionario), no vale una versión sola. Ni el modelo
      ni las pantallas lo leen. El resumen concilia en bancos 62 de 62,
      cooperativas 60 de 62 y comercial 49 de 62.
    - En total, `equifax_operaciones` tiene 1.154 filas.
  - **Lote del 2026-10-17: 25 personas poco bancarizadas** (pedido por el negocio;
    **87 consultas en total**). Personas reales sin consulta previa, elegidas por lo
    poco que traía su último perfil de Novadata: 5 sin operaciones, 9 con 1 o 2, 4
    con mora y 7 con 3 a 9. Lista y casos en `research/equifax/lotes/lote-2026-10-17.txt`
    y `-casos.tsv`; bitácora en `corrida-2026-10-17.log` (fuera de git). Se pagaron
    25 de 25, todas HTTP 200 y con sus tablas hechas; el tope del día quedó en 25 de
    30. **Valen hasta el 17/10 a las 23:59** (mismo ciclo que las 62 anteriores).
    - **Un expediente delgado no es uno vacío.** De las 5 sin operaciones en
      Novadata, 4 traen deuda en Equifax. La quinta (`c-8b595446`) sí vino vacía:
      6 KB, sin score ni historia. `c-e6db9ee9` y `c-c105874a` traen 14 y 22 meses
      de historia, y `c-0be1e991` no trae consultas recibidas y tiene 3 operaciones
      cuyo saldo no cuadra (`operacionesConSaldoQueNoCuadra`).
    - **Por qué Novadata no veía esa deuda (reconsulta gratis del mismo día, 4
      personas, crudo en `research/novadata-raw-2026-10-17/`):** el resultado no
      cambió, así que reconsultar no la hace aparecer.
      - En dos de las tres con deuda bancaria (`c-b980f5b2`, `c-79f1a4ae`), el
        crédito se abrió el 16 y el 18 de septiembre, y el único corte de Super que
        se vio en Novadata es el del **2026-08-31**. Es lo esperado: la deuda es
        posterior al corte. Se confirma cuando Novadata publique el de septiembre
        (Equifax ya trae el del 30/09).
      - En la tercera (`c-23474215`) no cabe esa explicación: la operación de banco
        se abrió el 9 de enero y su corte en Equifax es el 31/08, y Novadata contesta
        «OK» con la lista vacía. Es una diferencia real de cobertura, sin explicar.
      - `c-79f1a4ae` sólo trae en Novadata una fila de riesgo `G` (garante) de otra
        deuda, no su crédito de titular.
      - `c-acdc2297`: Equifax trae una operación comercial con 2.149 días de mora y
        Novadata nada. Es el comercial de Equifax, que no es el retail de Novadata
        (otras empresas).
      - Con 4 personas es un indicio, no una tasa. Medirla de verdad pide comparar
        las 87 contra su perfil de Novadata más reciente, por corte.
    - Las comprobaciones de `probar-equifax-tablas.mjs` que suponen un expediente
      denso (24 meses de historia, score, estado de cartera, consultas de 12 meses)
      fallan con estas personas: son una suposición de la prueba, no un error de
      las tablas. **Falta ajustarlas**. Además el probador agrupa por la etiqueta
      `persona-N` y el lote nuevo pisó a `persona-1` a `persona-25` del anterior: ya
      no prueba las 87. Etiquetar los lotes por fecha.
  - Qué hay: la función `consultar-equifax` desplegada y **sólo para admin**
    desde el sello `835ccc58c4c1` (2026-10-17, con el corredor; el control de
    seguridad dio 67 de 67 en OK después). El último despliegue (`6d5c4296e1e3`,
    10 funciones, esquema 133) lo incluye. La tabla
    `consultas_equifax` (122) con 87 filas (2 pedidas una por una y 85 de tres
    lotes, todas de producción y de la persona pedida), el
    guion local que simula por defecto, la exportación a Excel, el inventario y la
    conciliación de las respuestas (ver "Dónde está cada cosa" de CLAUDE.md). El
    tope diario es `EQUIFAX_TOPE_DIARIO` (30); los lotes del 12/10 y del 16/10
    usaron 22 y 40 (este último, con el tope subido sólo para esa corrida).
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
    la sesión de admin del negocio en el panel local): Equifax deja pasar a las
    funciones para pedir el token. **Desde la pantalla (2026-10-17), sin costo:**
    una cédula inválida se rechaza antes de llamar a Equifax, y una persona con
    consulta vigente recibe la guardada (`reutilizada`, la misma consulta, 0
    consultas nuevas en el día). **Una consulta paga desde las funciones todavía
    no se hizo nunca**: la primera la autoriza el negocio (ver el punto 5).
  - **El negocio contestó el bloque A y la F1 del cuestionario (2026-10-13)** y
    cambió el rumbo: **un solo buró por IFI** (no hay orden entre Equifax y Aval),
    la deuda del sistema financiero de Novadata se apaga cuando hay buró, con una
    sección de configuración para dejar de consultarla, y **Equifax y Aval son dos
    pantallas aparte** (no van al Expediente). Lo medido sin gasto y la propuesta
    («un tema, una fuente», el interruptor en tres capas, el diseño de la pestaña
    Equifax): `docs/propuesta-buro-de-la-institucion.md`; se repite con
    `node scripts/medir-solapamiento-equifax.mjs`. Lo que más pesa: bancos y
    cooperativas son el mismo tema (saldo igual hasta 1% en 15 de 22 y 8 de 11), **el
    comercial de Equifax y las casas comerciales de Novadata son otras empresas** (5
    de 33 en común: no se apaga) y **Equifax no trae la calificación A1 a E** (se
    reemplaza por días de mora; la usan el marco, `resumen_por_persona` y la
    definición de impago del Laboratorio). **El negocio contestó su sección 6 el
    2026-10-16**: Novadata **se sigue consultando entera** y lo que repite el buró
    sólo deja de ir al modelo (no se apaga ninguna fuente); el buró va **en lugar
    de los niveles 3 y 4** del marco (bancos y cooperativas); el selector se llama
    **«Buró»**; las casas comerciales se suman («veamos cómo nos va sumando»); la
    calificación se reemplaza por días de mora; el reporte es en **PDF**.
  - Qué falta, por orden:
    1. **El diccionario de datos de Equifax.** Lo consigue el negocio (dijo el
       2026-10-13 que lo puede dar); lo que hay que pedir, con la evidencia y la
       prioridad de cada punto, está en `docs/equifax-pedido-de-diccionario.md`. Lo
       que conteste se carga sin volver a pagar: se sube la versión y se rehacen
       las consultas.
    2. **Un tema, una fuente en lo que lee el modelo (capa 2) y su marco:
       construidos el 2026-10-16 como `marco-v31`, APAGADO**
       (`CONFIG_LLM.buroDeLaInstitucion = false`: desplegar no cambia nada de lo
       que lee el modelo; todo sigue en v30). Lo construido, lo medido y cómo
       encenderlo: `docs/propuesta-marco-equifax.md`, secciones 2 a 8. En corto:
       con una consulta vigente de Equifax (producción, la más reciente anterior al
       análisis, hasta el 17 del mes; `_shared/buro-de-la-institucion.ts`), el
       perfil del modelo lleva `buroEquifax` en lugar del buró de bancos y de
       cooperativas de Novadata (que no llegan ni en `null`), `endeudamiento` suma
       el buró y las casas comerciales de Novadata, bancos/Diners/cooperativas
       cuentan como consultados, y el marco lleva la sección del buró en lugar de
       los grupos 3 y 4. **Sin buró, el perfil y el pedido entero son los de v30:
       2.813 de 2.813 personas, byte a byte** (y una prueba de Deno con un perfil
       inventado). Medido sin gasto sobre las 62: el bloque pesa **unos 2.000
       tokens** (no 1.050: la estimación con 3,2 caracteres por token estaba mal,
       se calibró con el contador de tokens de la API sobre datos inventados), la
       sección del marco 1.602, y **ningún dato personal** de 1.588 buscados.
       Entró a `main` en el PR #31 (`4d40d27`), y **la 131 (la fila de
       `marco-v31`) se aplicó ese día con el corredor**: la plantilla está en la
       131, sin ningún análisis con v31 (el interruptor sigue apagado). Falta:
       - **La comparación con y sin Equifax** (autoriza el negocio con una cifra):
         62 personas con v30 y con v31, **unos USD 2,3 en lote**, estimado, no
         medido. Octubre lleva USD 9,28 de 10. **Las 62 consultas caducan el 18/10
         a las 00:00 de Ecuador**: después, v31 no encuentra ninguna vigente. O se
         vuelve a pagar Equifax (lo autoriza el negocio aparte) o se le suma al lote
         una fecha de análisis anterior al corte (un cambio chico): lo decide el
         negocio.
       - **Encenderlo** cuando el negocio lo decida: `ESQUEMA_MINIMO` en 131,
         `buroDeLaInstitucion: true`, desplegar con
         `--funciones` y una llamada suelta de comprobación.
       - **La capa 2 en SQL: la 132, aplicada el 2026-10-17 con el corredor**
         (PR #34; el negocio aprobó lo recomendado en la sección 4 de
         `docs/propuesta-dias-de-mora-con-buro.md`). Con una consulta vigente del
         buró, las marcas de Monitoreo salen de Equifax: «D o E» es más de 90 días
         en bancos y «Mora», el monto en atraso; la marca se llama ahora «Más de
         90 días de mora en bancos (D o E)». No toca funciones: no hubo que subir
         `ESQUEMA_MINIMO` ni desplegar. **Medido después de aplicarla**
         (`node scripts/medir-dias-de-mora-con-buro.mjs`): 62 personas con las
         marcas del buró y «Monitoreo distinto de Equifax en las vigentes» en 0
         en las dos marcas; Monitoreo da 50 en «D o E» (igual que antes) y 102 en
         «Mora» (103 antes: una persona en la que Equifax, días después que
         Novadata, ve días de mora de 30 o menos, sin monto). El control de
         seguridad da 68 de 69. La que falla es la comparación con la carpeta
         principal, que tenía su `main` en la 130: la base está en la 132. **Las
         62 consultas caducan el 18/10 a las 00:00**: la reconstrucción de las
         00:10 las devuelve a Novadata. Falta:
         - **El resultado del Laboratorio por el buró** (decisión 5a): la
           definición de impago no cambia (ya juzga por días a la operación que
           trae días). Lo que falta es traer el resultado de Equifax en el t1, con
           una consulta paga por solicitud y contando por mes desde la historia
           de 24 meses (la propuesta, sección 3). Se construye con la primera
           carga real de una institución con buró; hoy no hay ninguna.
       - `comparar-razonamiento.mjs` no lee el buró: se niega a correr con el
         interruptor encendido hasta que se le sume.
    3. **El ajuste al marco interpretativo: hecho, en el mismo `marco-v31`** (el
       negocio dijo «procede» el 2026-10-13). La sección quedó en
       `marco-interpretativo.ts` (`GRUPOS_DEL_BURO_EQUIFAX`, `marcoConElBuro()`),
       con «Deuda como codeudor o garante» en lugar de «Garantías:» y la
       calificación leída en días de mora. Lo que espera: la comparación (punto 2)
       y las dudas del diccionario (punto 1).
    4. **Rotar las credenciales de Equifax:** se pegaron en un chat. El negocio
       dijo otra vez el 2026-10-13 que no es posible por ahora y que sigue en
       observación; el riesgo sigue mientras no se roten.
    5. **Pantallas: construidas el 2026-10-16** (la pestaña Equifax, el reporte
       en PDF, el selector «Buró» y la migración 129, PR #28; el detalle, en
       `docs/propuesta-buro-de-la-institucion.md`, sección 0). **La 129 se
       aplicó ese día con el corredor** (la plantilla, en la 129) y se comprobó
       en pantalla: el selector marca Equifax, «Buró» lleva a la pestaña de
       Equifax y Aval ya no aparece entre las pestañas. El control de seguridad
       da 66 de 67 (la que falla es de E27: el último análisis guardado es de
       marco-v28). Falta:
       - **Repaso del 2026-10-17 a 375, 768 y 1280** (sesión de QA, datos
         tapados en las capturas). Salieron y se corrigieron tres defectos:
         **el reporte completo se caía** al abrirlo o al descargar el PDF (una
         variable suelta del renombre por gitleaks; publicado desde el #28), **las
         ayudas no se veían debajo de 860 px** (la tarjeta las recortaba; ahora
         `InfoTooltip` las dibuja en el body, y se leen las 24 de la pestaña) y el
         Análisis con IA decía «Ver Aval» fijo (ahora lleva al buró de la base).
         Además, los cuatro indicadores van de a 4, 2 o 1 por fila (quedaban
         3 + 1), y la tabla de deuda entra en su tarjeta a 768. El verificador de
         UX da 0 hallazgos a 375 y a 768 con el reporte abierto.
       - **El PDF:** el botón abre las 11 secciones y las 43 operaciones, llama a
         imprimir una vez y deja la descarga en la auditoría (comprobado en
         `audit_log`: 2 descargas de la cuenta de QA, con la persona y la
         consulta). Con las reglas de impresión aplicadas al ancho útil de una
         A4 (186 mm), nada se recorta, el menú y los botones no salen y son unas
         5 hojas. **Falta imprimir una vez desde el diálogo del navegador**: el
         panel de pruebas no lo abre (la impresión se reemplazó por una marca).
       - **El botón para consultar a Equifax: construido el 2026-10-17** (el
         negocio lo pidió ese día; `ConsultarEquifax.jsx`). Como en el diseño
         aprobado el 16/10, es **sólo para administración** y aparece sólo sin
         consulta vigente: «Consultar a Equifax» cuando no hay ninguna y «Volver
         a consultar a Equifax» en la cabecera cuando venció. Un analista ve
         «pedila a administración», y la función también exige admin desde el
         17/10 (antes aceptaba a un analista, que podía saltar el botón llamándola
         directamente; el negocio: «haz lo mejor»). Nunca consulta de
         un clic: un cuadro dice que se cobra, hasta cuándo valdrá, si es el
         último día del ciclo y cuántas van hoy, y pide «Sí, consultar». La
         función pone el resto: sesión de analista o admin, tope diario, base
         legal (la del contrato con la institución, como en los lotes) y
         auditoría. No ofrece volver a pagar una vigente (`forzar`, sólo admin).
         Probado sin costo: el cuadro, el error de una cédula inválida y la
         reutilización (ver arriba). **Falta la primera consulta paga desde el
         botón**, con una persona que el negocio autorice: es también la
         primera consulta paga desde las Edge Functions.
       - **Costos › Equifax** (2026-10-17): consultas pagadas por mes a USD 0,40
         (tarifa que dio el negocio ese día; constante en `src/lib/costoEquifax.js`,
         sin historia: si cambia, valúa también lo de antes) y, aparte, las que
         pudieron cobrarse (fallos con el pedido ya enviado). El 17/10: 62
         consultas, USD 24,80; el 18/10: 87, USD 34,80, todas de octubre.
       - **Visto en pantalla el 18/10 a 768** (sesión de QA, datos tapados): el
         botón en la cabecera de una consulta vencida, su cuadro (sin confirmar)
         y Costos › Equifax; el verificador de UX, sin hallazgos después de
         oscurecer el texto de la etiqueta ámbar (daba 4,42:1).
       - **Revisión de UX del 2026-10-18** (habilidad `revision-ux`, a 1280, 768,
         414 y 360, sesión de QA): se sacó lo repetido y se mejoró la lectura.
         - Pestaña Equifax: la tabla de deuda ya no lleva fila de total (repetía
           los indicadores: la misma deuda salía cinco veces), un sistema sin
           deuda es una celda «Sin deuda», «Mora más larga hoy», la consulta
           vencida dice cuándo venció, las operaciones se separan en «Como
           titular» y «Lo que respalda de otras personas» y el sistema se muestra
           sólo si hay más de uno. El reporte completo ya no repite el score ni el
           nivel de sobreendeudamiento, «Cómo cambió en un año» es una tabla de
           tres momentos, la «cuota financiera estimada» se sacó (es la cuota
           estimada de hoy en 88 de 88 consultas), el RUC sale como oración y el
           indicador de impacto económico dice que su escala no se conoce.
         - Costos › Equifax: «Hoy» en lugar de «Desde el inicio» (que pasó a ser
           el total de la tabla), la tabla mes a mes con dos meses o más y las
           columnas de lo que pudo cobrarse sólo si hubo alguno. Probado con datos
           inventados en el navegador (un mes anterior y un fallo): la base tiene
           un solo mes.
         - Configuración › Equifax y Aval: el motivo con etiqueta (el verificador
           lo marcaba) y un error traducido en vez de `error.message`.
         - Expediente › Auditoría: la descarga del PDF salía como
           «exportacion.reporte_equifax»; se nombraron las ocho acciones que
           faltaban y una desconocida dice «Otra acción».
         - Capacidad de pago: con una sola deuda ya no lleva «Total por mes».
         - Bajo 860 px la tira de pestañas muestra la activa (la del buró quedaba
           fuera de la vista).
         - El verificador marca desde ese día `cifra-repetida`.
         **Lo que dijo el negocio el 2026-10-19:** (a) en Capacidad de pago la
         cuota que ya paga sale en la frase del veredicto y en la leyenda del
         medidor; propuesta: la leyenda dice «Ya paga» sin la cifra. **Lo valida
         el negocio más adelante**: no se toca hasta entonces. (b) **Fuentes de
         Ingreso de una persona: hecho el 2026-10-19** (habilidad `revision-ux`,
         a 1280, 768 y 414, con una persona con el SBU, una con ingresos mixtos
         y una independiente; el verificador sin hallazgos con el detalle
         cerrado y abierto, salvo la versión de las reglas en «Cómo se
         clasificó», que es su lugar). Medido en la base: en 1.607 de las
         1.713 personas con monto hay una sola fuente, y la fila de los aportes
         repetía el monto, quién lo declara y el SBU del encabezado; en 1.093
         el promedio de 6 meses era ese mismo ingreso. Ahora la fila dice de
         qué empleo sale, el promedio dice «Igual al actual», el empleo más
         largo «El actual» cuando lo es, Clasificación ya no repite el
         empleador con su monto, el año del RUC ni los empleados de la tarjeta
         de al lado, y el detalle no repite los locales del SRI, el RUC activo,
         los establecimientos ni el mes del IESS, y dice «Igual que en los
         aportes» cuando el mecanizado coincide. Se corrigieron «Sí, 0
         empleos» (militar o policía en servicio), un desborde de 6 px a 1280
         (el globo del último mes del gráfico) y el botón del detalle en un
         teléfono. **Se dejó a propósito** la tarjeta del indicio de ingreso
         mayor, que repite la nómina, los empleados y lo declarado: son los
         datos que lo sostienen, lado a lado (negocio, 2026-09-28). **No se
         vio**: una persona sin consulta, un perfil anterior a fuentes-v4 ni
         la vista de un analista. (c) Los nombres de las
         instituciones de Equifax **se quedan como vienen** (decidido; anotado en
         la terminología de la habilidad). (d) No se vio el estado sin consulta
         ni la vista de un analista (la cuenta de QA es admin): no cambiaron.
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
  2. **El modelo de la persona** (`docs/modelo-de-la-persona.md`). La solicitud
     ya es una entidad (133, 2026-10-17). El estado de la persona, las
     direcciones, las referencias, los documentos y los créditos de la persona no
     existen todavía como datos: hoy sólo hay nombres. El negocio decidió el
     2026-10-18 cuatro de los puntos abiertos (el segundo estado es «En
     proceso», «No aprobado» para quien fue rechazado o desistió, la decisión
     de la institución la marca el analista en la solicitud, «Perfil de la
     Persona»); ver el primer punto de este bloque. Lo que sigue esperando al
     negocio (opciones y recomendación en la sección 5 de ese documento):
     - si el dictamen del modelo («Negación») y la decisión de la solicitud
       («Rechazado») usan el mismo verbo;
     - confirmar que «fuentes» era aceptar «Explorador de la fuente de datos».
     El orden de construcción propuesto es: el estado de la persona calculado
     de sus hechos (con su historial), el filtro y la columna en la bandeja, y
     el embudo en Monitoreo. Se cruza con la API para las instituciones
     (`api/openapi.yaml`) y con `docs/arquitectura-fabrica-de-credito.md`.
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
   - **Marco por cliente, hecho y apagado**: ver la sección 3.
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
  1. **E27, urgente: lo que lee el modelo.** marco-v29 **desplegada el
     2026-10-16** (PR #25, 128, funciones 684b243): sin cédula, sin nombre,
     sin empleadores (cada empleo con su tipo), sin la institución de una PEP
     ni la del título, los números de 10+ dígitos tapados y todo número
     entero. **marco-v30** (130, mismo día, pedido del negocio): cada empleo y
     cada aporte llevan esSuPropioPatrono y posibleNegocioFamiliar, calculados
     con el nombre antes de borrarlo (con v29, en 9 de 72 personas con la
     marca de familiar no se sabía cuál de sus empleos era). Validadas sin el
     modelo sobre los 2.813 perfiles (`validar-perfil-del-modelo.mjs`: 0
     fallas). Falta, por orden:
     - `auditar-seguridad.mjs` («El último mensaje al modelo...») en OK, que
       pide un análisis con v29 o v30;
     - **los atributos protegidos**: bloque B del cuestionario
       (`research/decisiones/`), sin contestar. Se sacan pasando cada uno a
       `false` en `ATRIBUTOS_PROTEGIDOS` (`perfil-del-modelo.ts`): versión
       nueva del marco y su fila;
     - con el control en OK: corregir los siete documentos
       (`docs/cumplimiento/` y el informe de la auditoría de seguridad) y
       **la ficha de seguridad para clientes, que no se comparte hasta
       entonces**. Decir qué atributos siguen llegando.
     - La comparación grande de 14 casos contra v28
       (`research/cedulas_validacion_marco_v29.txt`, `--hoy-de-la-base`) queda
       disponible pero no se corrió: el negocio prefirió 5 análisis reales con
       v30 en lote, que se ven en la app como uno de la pantalla.
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
      retome empieza acá;
    - el contrato con las puertas de cada módulo (`POST /simulaciones`, `POST
      /capacidades-de-pago`) y la `modalidad` de la evaluación (2026-10-17),
      revisado contra el código el 2026-10-18. Las diferencias que sólo se
      resuelven tocando código están en el primer punto de la sección 1.
  - Queda, por orden:
  1. **Lo que quedó de los arreglos chicos** (cerrados el 2026-10-16, #24; la
     127 se aplicó y las funciones se desplegaron ese día; `llm_llamadas` quedó
     sin ninguna cédula):
     - las 485 filas viejas de `audit_log` con la cédula se quedan, porque
       `audit_log` no se corrige (113). Sigue abierto que esa tabla la lee todo
       usuario con sesión (pregunta G8 del cuestionario de decisiones);
     - falta ver en pantalla, con sesión de admin, Costos › Detalle de llamadas,
       que ahora lee la cédula de `clients`.
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

- **Niveles de acceso (propuesta del negocio del 2026-10-19, con la evaluación
  de la sesión; sin decidir ni construir).** Hoy hay dos roles en
  `profiles.rol`: `analista` y `admin`, y «admin» ve de todo, incluidos Costos
  (lo que CrediScope paga a Equifax y al modelo), el Laboratorio y las
  fuentes que se consultan. El negocio propone cuatro niveles. La sesión los
  encuentra adecuados, con estos ajustes:
  - **Dueño** (el negocio, como operador de CrediScope): todo, y es el único que
    ve Costos, el Laboratorio, el selector de buró, las tarifas y las bases de
    todas las instituciones. Conviene que NO sea un rol que un administrador de
    la institución pueda dar: el dueño se da de alta por fuera de la pantalla de
    usuarios, y es el titular de la cuenta de Equifax (USD 0,40 por consulta,
    tarifa del 17/10).
  - **Administrador** (personal de la institución): la configuración que le toca
    a la institución, que hoy no existe como pantalla: sus usuarios, la carga
    máxima de la capacidad de pago, la tasa máxima y el desgravamen de sus
    productos, y su tope diario de consultas a Equifax. No ve Costos ni el
    Laboratorio.
  - **Usuario A** (analista): consulta, evalúa, ve la bandeja y marca la decisión
    de la solicitud. Puede pedir una consulta que se cobra (Equifax) dentro del
    tope diario de su institución; hoy eso es sólo de administración
    (2026-10-17), y es la pregunta de quién paga Equifax: la respuesta propuesta
    es que la cuenta es del dueño, la institución la autoriza con su tope y el
    pedido lleva la autorización de la persona.
  - **Usuario B** (lector): ve la bandeja, las solicitudes y los resultados ya
    hechos; no consulta, no evalúa y no guarda nada. Hace falta un rol nuevo
    (`lector`) y revisar cada política de RLS y cada función que hoy acepta
    `analista`.
  - Para construirlo: una migración que amplía `profiles.rol` (`dueno`,
    `admin`, `analista`, `lector`), `exigirRol()` en cada función, `RequireAdmin`
    y el menú, y una prueba en `auditar-seguridad.mjs` de que cada rol no puede
    lo que no le toca. El dueño y el administrador de la institución se separan
    recién cuando haya una segunda institución usando la plantilla (hoy hay una
    sola base).

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
- **Marco por cliente, hecho y apagado** (2026-10-03; iba a ser la v29, que
  tomó E27: lleva el número libre al encenderse;
  `_shared/marco-por-cliente.ts`). Omite las secciones de temas que el
  perfil del modelo no trae (PEP, pensión, demandas civiles, garantías,
  jubilados, etc.); con todo aplicable da el marco vigente byte a byte.
  Sobre los 2.567 perfiles reales el marco promedio baja de ~12.050 a
  ~9.100 tokens (25%, ~USD 0,006 por análisis). Se enciende con
  `marcoPorCliente` en `CONFIG_LLM`. Antes de encenderlo:
  - **validar** con `node scripts/comparar-razonamiento.mjs --configs=hoy,porCliente`
    (14 casos, ~USD 2, **sólo con autorización**): tiene que quedar dentro
    del ruido (±40 de score, 1 de 13 recomendaciones);
  - una versión nueva del marco (el número libre) con su fila en
    `scoring_rules_versions` y `MARCO_VERSION`;
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

- Las cinco ramas locales superadas se borraron el 2026-10-16 (4159844,
  dc5077b, 80dc918, c7ce76f y 720f31b, por si hace falta recuperar una). Las
  carpetas `.claude/worktrees/cool-jemison-2a674d` y
  `xenodochial-albattani-950de3` NO se borran: las reusan las sesiones de E27
  (`fix/e27-marco-v29`) y de Equifax (`claude/reverent-volhard-f00d53`).
- La cartera sintética del Laboratorio (carga "Cartera sintética (semilla
  1)") se queda: es la que prueba los cálculos. Si se regenera, anular la
  anterior desde la pantalla.
- En la base quedan 5 lotes de prueba terminados: 3 del 2026-09-15
  ("Prueba de…") y 2 del 2026-09-23 ("prueba 078…"). **Revisado el
  2026-10-13:** tienen 26 ítems en total, y los 11 perfiles que dejaron son
  de personas reales que ya tienen un perfil más nuevo. Borrar un lote borra
  sus ítems (`on delete cascade`), pero no los perfiles: los ítems sólo los
  apuntan. El negocio dijo que sí el 2026-10-16, pero el control de
  permisos de la sesión frenó el borrado. Lo corre el negocio, o una sesión
  con permiso, con un `delete from lotes` filtrado por los 5 ids
  (7e04c608, 73d87af4, 940607a1, 2886c0c2 y 19e7fa81, estado `terminado`).
