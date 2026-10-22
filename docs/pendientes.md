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

## Estado vigente (medido el 2026-10-20)

- **Base:** última migración aplicada, la **136** (2026-10-20); `ESQUEMA_MINIMO` está en 135.
  Se midió en `esquema_version`.
- **Funciones:** sello **`f09531e87adc`**, 10 de 10, desplegado el 2026-10-20 sobre el esquema
  136 (`despliegues`; el anterior fue `da643d391546`).
- **Versiones en producción:** marco-v30 con Claude Sonnet 5.5 (marco-v31, el buró de la
  institución, construido y apagado: su fila está en la 131); estructura-v14 (2.573 personas
  reales; las 240 sintéticas quedaron en v3), fuentes-v10, perfil-laboral-v3, simulador-v4,
  capacidad-v3. Las dos primeras salen de la base (`structure_version`, `fuente_version`); el
  resto, del código de `main`.
- **Datos:** 2.573 personas reales y 240 sintéticas; 207 análisis con marco-v28 y 8 con
  marco-v30; 88 consultas de Equifax, de las que **sólo 1 está vigente** (el ciclo va del 18/10
  al 17/11; las 87 anteriores caducaron). El modelo lleva **USD 9,63 de los 10** del
  presupuesto de octubre.
- **Control de seguridad:** 73 de 73 el 2026-10-19 (`auditar-seguridad.mjs`); desde un
  worktree no se puede repetir entero, y no se volvió a correr.

## 1. Lo que Claude puede hacer ya

1. **Laboratorio, paso 1: registrar el Universo.** Falta registrarlo como solicitudes reales
   (cartera propia, sin institución); el negocio dijo el 2026-10-13 que se retoma la semana del
   2026-10-19. Importa porque sin él no hay punto de partida para la reconsulta del 25/12.
   Lo hace Claude en una sesión (`docs/laboratorio-guia.md`, paso 1; sin pantallas nuevas hasta
   el paso 4). Se verifica con los conteos por origen y por análisis; antes hay que decidir el
   t0 de los 200 del lote del 07/10, que se analizaron sobre la consulta del 03/10.
2. **API para la institución, Fase 1.** Falta el núcleo: recepción, cola asincrónica,
   trabajador, topes y sandbox con simuladores (sin ambiente de prueba), apagado para terceros.
   Devuelve los datos completos de la persona según el contrato y la configuración de cada
   institución; lo que viene de una fuente depende de que el contrato con esa fuente permita
   entregarlo (Novadata: 3.3). Lo hace Claude (E27 ya no la frena; D5 a D15, 2.9). Se verifica
   con el lint estricto de Redocly sobre `api/openapi.yaml` y pruebas.
3. **La puerta de la API: lo que la especificación dice y el código no hace.** Falta: las
   validaciones del esquema (`additionalProperties: false`, máximos de ingresos y deudas,
   `parametros` fuera de 0 a 1 que hoy se ignoran), errores `application/problem+json`, OAuth e
   `Idempotency-Key`, `modalidad` con `basico` por omisión, `reemplazaA` que reutilice el perfil,
   las condiciones de Básico guardadas y el resultado con positivos, negativos y razonamiento.
   Importa: promete lo que hoy no se cumple. Lo hace Claude; una prueba por promesa.
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
6. **Cobertura de deuda de Novadata contra Equifax.** Con 4 personas se vio que Novadata no
   trae deuda que Equifax sí (`docs/propuesta-estructura-equifax.md`, sección 9): es un
   indicio, no una tasa. Falta comparar las consultas de Equifax con el perfil de Novadata más
   reciente de cada persona, por corte de la Super. Sin costo (lee la base; parte de
   `scripts/medir-solapamiento-equifax.mjs`). Importa: sostiene «un solo buró por institución».
7. **Base de una institución nueva desde cero.** Falta la línea base del esquema (E15),
   parametrizar `auditar-seguridad.mjs` por base y probar el 503 de `exigirEsquema()` con la
   primera base atrasada. Importa: hoy hay una sola base y es requisito del primer cliente
   externo (`docs/plan-segundo-cliente.md`). Lo hace Claude; se verifica armando una base vacía
   con el corredor y con el control en ok contra ella.
8. **Hoja de ruta de la auditoría externa (E6 a E26).** Las fases 2 y 3 de la sección 7 del
   informe (`auditoria/2026-10-09-auditoria-externa-integral.md`, fuera de git) no se
   revisaron una por una: **no se midió cuáles quedaron hechas**. Falta ese recuento y sacar
   de ahí lo que siga abierto. Lo hace Claude leyendo el informe contra el código y la base.
9. **Deuda técnica sin urgencia** (la hace Claude cuando toque el área):
   - retirar `humanizarTexto()` con una versión nueva de fuentes que guarde meses y dólares
     con el formato de la casa, y recalcular;
   - volver generadas por la base las cinco columnas `fuente_*` (regla 8 de CLAUDE.md);
   - estilos en línea a clases (1.776 en 124 archivos); Excel de un lote en el servidor
     pasadas las mil personas; `comparar-razonamiento.mjs` que lea el buró.

## 2. Espera una decisión del negocio

1. **La comparación de marco-v31 con y sin Equifax.** Falta autorizarla con una cifra:
   62 personas con v30 y con v31, unos USD 2,3 en lote (estimado, no medido). Importa para poder
   encender el buró en lo que lee el modelo (`docs/propuesta-marco-equifax.md`, secciones 6 a 8).
   **Las consultas de esas 62 caducaron el 18/10**: o se vuelve a pagar Equifax (USD 24,80, se
   autoriza aparte) o el lote acepta una fecha de análisis anterior al corte (un cambio chico).
   Y octubre lleva USD 9,63 de 10 (punto 2.2). Se verifica con la comparación y su lectura.
2. **El presupuesto del modelo.** `presupuesto_llm_mensual_usd` está en 10 y octubre lleva
   USD 9,63: pasó los avisos del 70 y el 85%. Confirmar el monto que quiere el negocio. El
   límite de la consola de Anthropic es otro y manda: en septiembre cortó el 28 con USD 6,00
   medidos por nosotros, antes de nuestro aviso. Nuestro presupuesto tiene que ser el de la
   consola o menor. Se verifica comparando los dos límites.
3. **Marco por cliente y adelgazar el marco.** Hecho y apagado (`marcoPorCliente` en
   `CONFIG_LLM`): omite las secciones que el perfil no trae y baja el marco de ~12.050 a
   ~9.100 tokens (~USD 0,006 por análisis). Falta autorizar la validación
   (`comparar-razonamiento.mjs --configs=hoy,porCliente`, 14 casos, ~USD 2): tiene que quedar
   dentro del ruido (±40 de score, 1 de 13 recomendaciones). Después, una versión nueva con
   el número libre y su fila, y guardar qué secciones se omitieron.
4. **El marco y el modelo, al final** (decisión del negocio). Que el modelo lea la solicitud,
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
    (borrador del 2026-10-21; nada construido). Decidido el 2026-10-21: el **patrimonio solo se
    solicita a petición de un analista** (no es una entrada inicial; el nivel 3 es una reestimación).
    El SRI de las respuestas de Equifax guardadas en AWS ya se extrajo (autorizado por el negocio) y
    sube el nivel 1 de R² 0,091 a 0,172: solo existe en las 105.070 respuestas JSON de 2026
    (`docs/investigacion-predictor-de-ingresos.md`, 12.24). Lo que falta decidir o conseguir está en
    la sección 10 de la especificación: qué se hace con los gastos declarados y con la entrada del
    crédito; cómo se pide el patrimonio al titular; cotejar el SRI de Novadata con el de Equifax en más
    de 87 personas (y si el texto de la actividad de los establecimientos de Novadata da un CIIU);
    casos con ingreso verificado de cada institución para calibrar; la base de 3,9 millones del
    proveedor; y los códigos de afiliación y categoría de la ENIGHUR, la ENEMDU y el censo (el INEC).
    El primer paso de construcción es extraer `AnalisisCreditoSectorFinanciero` en
    `equifax-tablas.ts` (sus campos son las variables más pesadas del nivel con buró y hoy no se
    derivan).

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

1. **Carpetas de trabajo** (`git worktree list`, 2026-10-20; no se borró nada):
   - `cool-jemison-2a674d`: su commit ya está en `main`, sin cambios, y E27 ya no la usa: se
     puede borrar. `xenodochial-albattani-950de3` ya no existe.
   - `quirky-bhaskara-71c218`, `simulador-credito` y `siint-docs-lote`: sin cambios, pero sus
     commits no son ancestros de `main` (squash): revisar antes de borrar.
   - `reglas-pantallas`: 8 archivos sin commitear, la usa otra sesión.
2. **Ramas locales:** hay 50, 16 con la rama remota ya borrada y sólo 6 son ancestros de
   `main`. Borrar las que se fusionaron con squash lo hace el negocio o una sesión con permiso.
3. **PR abiertos:** el #32 (documentación de E27 que dice que «quedan los atributos protegidos»)
   quedó contra la decisión del 2026-10-20: cerrarlo o actualizarlo. El #55 es de Dependabot
   (seis actualizaciones menores): revisar con los controles.
4. **Cartera sintética del Laboratorio** (carga «Cartera sintética (semilla 1)»): se queda, es
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
