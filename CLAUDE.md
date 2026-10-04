# CrediScope

Calificación crediticia para Ecuador. Una persona se consulta contra
Novadata, se arma un Perfil del Cliente estandarizado, se clasifica su
fuente de ingreso, y un modelo guiado por un marco interpretativo en
lenguaje natural produce un puntaje de 1 a 999 y una recomendación.

Frontend Vite + React 19 en JavaScript (sin TypeScript, sin Tailwind).
Backend: Supabase — Postgres con RLS, Auth y Edge Functions en Deno.

Este archivo existe para que una sesión nueva sea productiva sin
redescubrir lo que ya se aprendió. Si algo de acá resulta falso,
corregirlo acá mismo.

## Cómo se escribe

**Todo en castellano**: nombres de variables, comentarios, mensajes de
error, textos de pantalla, nombres de archivos de migración y mensajes
de commit. Sin anglicismos salvo `score` y `colateral`, que el negocio
usa así. Adaptado a Ecuador: cédula, IESS, SRI, RUC, voseo.

**En ingresos no se dice "piso"**: en Ecuador no se usa. Se dice
"ingreso reportado al IESS" y, cuando el monto es el Salario Básico
Unificado del año o está a ±5%, **"Ingreso Mínimo SBU"**. Mucha gente
gana el SBU (sube entre 8 y 25 dólares por año), y los afiliados
voluntarios y unipersonales -- que aportan aunque no tengan un trabajo
fijo -- casi siempre aportan sobre él. La regla vive en
`esIngresoMinimoSbu()` de `fuentes-ingreso.ts` y las pantallas la
importan. Los nombres internos que dicen piso
(`pisoIngresoMensualReportado`, `fuente_piso_ingreso`) quedaron: no se
leen en pantalla. Y quien trabaja para un tercero es **"dependiente"**,
no "asalariado".

**Nombres de pantalla de Fuentes de ingreso**, decididos por el negocio el
2026-09-26 porque los anteriores no se entendían sin haber estado en el
diseño. Viven en `src/lib/fuentesIngresoConsolidado.js` (`quienDeclara()`,
`ETIQUETA_ESTADO`, `ETIQUETA_SENAL`, `DOCUMENTOS_DE_CONFIRMACION`):

| Antes | Ahora |
|---|---|
| Segmento | Segmento (se queda) |
| Confirmada / Provisional / Indeterminada | Confirmado por un tercero / Por confirmar / Sin determinar |
| Reportada por un tercero | Empleador privado · Empleador público · Empleador diplomático (embajada, consulado) · Empleador externo (SOLO organismos internacionales) · Otros empleadores (doméstico, agrícola, código no reconocido) |
| Autodeclarada | Empresa propia (patrono de su negocio o RUC activo) · Afiliación voluntaria (sin negocio registrado) |
| Indirecta | Sin monto: consta que existe (RUC, nómina, jubilación, pensión) |
| Señales de escala | Tamaño del negocio: Empleados, Nómina, Establecimientos Activos (SRI), Contabilidad |
| Nómina que paga | Nómina (sin contar a la propia persona) |
| Establecimientos registrados | Establecimientos Activos (SRI): sólo abiertos, 0 si el RUC no está activo |
| Otras fuentes · sin monto | Negocio propio (SRI) |
| Corte del IESS usado | Información IESS (meses con mayúscula: "Ago 2026") |
| Fuera del último corte | Sin información actual en el IESS |
| Por qué este segmento | Condiciones de la Segmentación |
| Qué pedir para confirmar | Documentos de Confirmación de Ingresos |
| Es su propio empleador | Es su propio patrono |
| Cómo puede fallar | (se sacó de todas las pantallas y de la exportación) |

El código 29 del IESS junta embajadas y organismos internacionales: se
separan por el nombre del empleador (`ES_MISION_DIPLOMATICA`).

**Los comentarios explican el porqué, no el qué.** Cuando una decisión
es contraintuitiva, el comentario dice qué pasó que la motivó — un caso
real, un número medido, un error que costó caro. Un comentario que
repite lo que el código ya dice es ruido.

## Reglas duras

Romper cualquiera de estas rompe algo real.

1. **Nunca `supabase db push`.** Siempre
   `npx --yes supabase@latest db query --linked --file <archivo>`. El
   historial de migraciones remoto está vacío a propósito.
2. **El CLI no está en el PATH**: usar `npx --yes supabase@latest`.
   Desde un worktree, `--linked` falla con "Cannot find project ref":
   el enlace vive en `supabase/.temp`, que no está en git. Agregar
   `--workdir` apuntando a la carpeta principal del repositorio.
3. **Las migraciones que necesitan secretos llevan marcadores**
   (`<<PROYECTO_URL>>`, `<<VIGIA_CLAVE>>`) y se rellenan FUERA del
   repositorio, en un archivo temporal que se borra después.
4. **Los secretos viven en `.env.functions`** (excluido del repo) y en
   las secrets de Supabase. Se leen del archivo, nunca se imprimen ni se
   pegan en el chat.
5. **`create or replace view` no puede insertar una columna en el
   medio**: renombra la que estaba en esa posición y falla. Las columnas
   nuevas van al final, aunque quede feo.
6. **Las funciones se despliegan sin `--no-verify-jwt`.** La
   configuración por función vive en `supabase/config.toml`; solo el
   vigía, el trabajador de lotes y el explorador van sin JWT, y cada uno
   con su motivo escrito ahí.
7. **Windows + Git Bash.** Los heredocs mutilan el código con acentos y
   comillas: usar las herramientas de escritura y edición de archivos,
   no `cat <<EOF`.
8. **Si una migración borra una columna que el código desplegado
   escribe, desplegar PRIMERO y borrar después.** La base y las
   funciones se actualizan por caminos separados, así que entre los dos
   pasos hay una ventana con todo roto: el trabajador de lotes corre
   cada minuto y una consulta desde la pantalla falla en el insert. El
   2026-09-23 la 078 se aplicó antes de desplegar y dejó esa ventana
   abierta. Al revés no hay ventana: código nuevo que ya no escribe la
   columna convive sin problema con la columna todavía presente.

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
- `marco-por-cliente.ts` → `componerMarco()` — el marco sin las secciones
  de temas que el perfil no trae (v29). Corta el marco vigente por marcas,
  sin copiarlo; está APAGADO (`CONFIG_LLM.marcoPorCliente`) hasta validarlo.
- `fila-del-analisis.ts` → `filaDelAnalisis()` — la fila de
  `analysis_results`, la única para `analyze-client` y el lote.
- `src/lib/laboratorio.js` y las funciones SQL `lab_*` — el Laboratorio
  de Inteligencia de Negocio, que reemplazó a Retroalimentación
  (`docs/laboratorio-de-riesgo.md`). El criterio vigente del motor
  (`ajustes_vigentes_actuales()`) sale de `lab_propuestas`. La cartera
  sintética la arma `scripts/generar-cartera-sintetica.mjs` (señal
  plantada: un cálculo nuevo se valida contra ella). Cada métrica vive en
  una función SQL `lab_*` (094-104).
  - El **explorador del crudo** (14.11 del diseño) es un guion, no una
    función: `scripts/explorar-crudo.mjs --corte=<id>` (`--seco` primero,
    `--buscar=` para el puesto de un campo). Guarda en `lab_resultados`
    (tipo `crudo`) y la pestaña del corte sólo lo muestra.
  - El **ciclo de un año** (sección 14 del diseño, 098-104): solicitudes,
    reconsultas y eventos; la verdad plantada vive aparte
    (`lab_simulacion_verdad`) y sólo la lee `lab_calificar_simulacion()`.
    Simular: `scripts/simular-un-anio.mjs` (`--seco` primero). Procesar
    (simulación y real): `scripts/procesar-reconsultas.mjs --carga=<id>`.
    El detector de eventos es `_shared/eventos-entre-consultas.ts`.
  - Las **pantallas pedidas por el negocio** (inicio, datos y cartera,
    prueba retrospectiva, descubrimiento estadístico y de variables) están
    mapeadas contra lo existente en `docs/laboratorio-pantallas.md`, con
    las fases A-F y las cinco decisiones del 2026-10-03.
- `columnas-del-perfil.ts` → `columnasDelPerfil()` — las columnas de
  `client_profiles` que copian algo del perfil (ver abajo).
- `src/lib/fechas.js` — el único lugar donde se formatean fechas.
  Ecuador es UTC-5 sin horario de verano; a las 20:00 de Ecuador la
  fecha UTC ya es la de mañana.
- `src/lib/paginar.js` → `traerTodas()` — la forma de leer más de 1.000
  filas desde el navegador. PostgREST corta ahí sin avisar: Costos sumó
  1.000 de 1.006 llamadas hasta el 2026-09-24. Pagina hasta el conteo de
  la primera página, no hasta una página corta, y pide un orden total
  (desempate por id) en el que lo insertado durante la lectura caiga al
  final.
- `docs/arquitectura-fabrica-de-credito.md` — el norte estratégico, en
  pausa. Leerlo antes de proponer cambios de estructura del producto.
- `docs/pendientes.md` — lo que quedó abierto, por urgencia, con números
  y cómo verificarlo. **Empezar por ahí al retomar**, y borrar de ahí lo
  que se cierre.

## Lo que costó caro aprender

Cada una salió de un error real; no revivirlas. **El caso, la fecha y
los números de cada una están en `docs/lecciones.md`**: leer la entrada
antes de tocar esa área.

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

**Base, PostgREST y procesos**
- PostgREST corta en 1.000 filas sin avisar: agregar en la base (función
  `security invoker`), listar con `traerTodas()`.
- Una actualización bloqueada por RLS devuelve 0 filas, no error:
  `.select()` y contar.
- Un error de PostgREST es un objeto plano: leer
  `message`/`details`/`hint`/`code`, no `String(err)`.
- Al reclamar trabajo concurrente, usar las filas que DEVOLVIÓ la
  actualización.
- Reencolar ítems de un lote `terminado` no lo reabre.
- pg_net está en el esquema `net`. Una tarea programada se verifica en
  `cron.job_run_details`, no en `cron.job`.
- Lo que no pasa por `lint` ni `build` se rompe en silencio: los scripts
  sueltos llevan su propio aviso adentro.

**Crudo y recálculo**
- El crudo de Novadata se guarda desde la 090 en el depósito privado
  `crudo-novadata` de Storage (gzip, ~8 KB), con la ruta en
  `client_profiles.crudo_ruta` (null = no se guardó). Lo escribe sólo
  `_shared/crudo-novadata.ts`, desde las tres puertas que guardan perfiles.
  A Storage con supabase-js se suben bytes, no un `Blob`: con un `Blob`
  ignora `contentType` y el depósito lo rechaza (así no se guardó ningún
  crudo hasta el 2026-10-04).
  Lo que leyó el modelo queda en `analysis_results.mensaje_al_modelo`.
- Respaldo local en `research/` (fuera del repo, datos personales):
  `novadata-raw/` = muestra fija de 389, no se pisa;
  `novadata-raw-2026-09-25/` = cartera completa (ya subida a Storage) en
  forma plana `{ cedula, capturadoEl, perfilId, raw }`;
  `novadata-raw-2026-10-03/` = la reconsulta entera de ese día, el respaldo
  vigente (los recálculos, con `--carpeta=`). La del 25/09 es el t0 del
  ciclo simulado del Laboratorio: no se pisa. Sumar:
  `node scripts/consultar-lote.mjs <archivo> <uuid-responsable> 20 --crudo=research/<carpeta>`.
- Reproducir un perfil: `buildStandardProfile(raw, cedula, corte)` con el
  corte VIGENTE de ese día, no `fuente_corte`.
- `scripts/recalcular-fuentes-ingreso.mjs`: sólo el último perfil, sólo
  si el crudo es de ese perfil (`perfilId`), reloj en la fecha de captura
  y claves ordenadas al comparar.
- `scripts/recalcular-grupos.mjs --grupos=a,b`. Si cambian estructura y
  fuentes de ingreso a la vez: primero `recalcular-grupos.mjs ...
  --ignorar=fuentesIngreso` (con `--bloqueo` si cambió el bloqueo),
  después `recalcular-fuentes-ingreso.mjs`.
- Las columnas copiadas del perfil se escriben sólo con
  `columnasDelPerfil()`. Si cambia la regla de una columna sin cambiar el
  perfil: `scripts/calcular-columnas-del-perfil.mjs` (`--seco` primero).
- `reprocess-sample.mjs` quedó atrás: para validar un cambio, comparar
  `process.ts` viejo contra nuevo sobre `research/novadata-raw/` con el
  perfil entero.

**IESS, ingresos y fuentes de ingreso**
- El corte del IESS es `corte_iess_vigente()` (083): el mes más reciente
  con ≥20 clientes en 90 días. Quien trae un mes posterior usa el suyo.
- Empleo actual e ingresos leen el mismo registro: el empleo cae a los
  aportes cuando el mecanizado no trae nada.
- Meses que Novadata no publicó para nadie (2018-02, 2019-09..11,
  2020-01..03, 05, 06, 08, 11) no cortan la continuidad. La antigüedad
  sale de `fecIng`, no del primer aporte (`continuidadLaboral`).
- Aportar por cuenta propia cuenta como trabajo sólo en meses con RUC
  activo; el RISE siempre.
- "Es su propio patrono": sólo `_shared/patrono.ts` (RUC = cédula +
  001/002/003; el nombre sólo sin RUC). El dueño en su propia nómina no
  lo hace empleador.
- "RUC activo": sólo `_shared/ruc.ts` (cuenta el cese temporal, exige un
  establecimiento abierto). Novadata manda el estado "ABIERTO" o "ABI":
  `establecimientoAbierto()` es la única comparación (estructura-v13).
- Segmento ≠ perfil laboral (`_shared/perfil-laboral.ts`, columna
  `client_profiles.perfil_laboral`, fuera de `standard_profile`).
- No se especula sobre el ingreso: un ingreso mayor sólo con
  `indiciosDeIngresoMayor()`. Nunca se muestra "cómo puede fallar".
- ISSFAC/ISSPOL listan familiares: militar o policía es sólo el titular
  (`_shared/fuerzas-armadas-policia.ts`).
- Parámetros anuales en `fuentes-ingreso.ts`: `SBU_POR_ANIO` y
  `FRACCION_BASICA_RENTA`. Un año sin renta no da indicio; al agregarlo,
  correr `calcular-columnas-del-perfil.mjs`.
- Los nombres de pantalla de Fuentes de ingreso los decidió el negocio
  (tabla arriba). No inventar otros.

**Buró, Aval y Función Judicial**
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

**Laboratorio**
- Las variables salen siempre del perfil del día del análisis (t0,
  rearmado desde su crudo), nunca de la reconsulta: el buró de hoy ya trae
  la mora y cualquier variable "acierta".
- Dos consultas de la misma persona difieren aunque no le haya pasado nada:
  el buró cambia de corte, hay entidades que empiezan a reportar, el IESS
  completa el último mes después y el SRI corrige ceses viejos. Comparar dos
  fotos va por `eventos-entre-consultas.ts`, que lo separa.
- Con ~300 créditos hay ~20 malos: la prueba sólo con lo desembolsado es
  ruido (AUC 0,63 con intervalo 0,51-0,75 en la simulación). Lo que da
  poder es reconsultar a todas las solicitudes (211 malos).
- Una simulación puede fabricar su propio problema: antes de culpar al
  cálculo, mirar si lo plantado es realista.
- Reconsultar la cartera entera tarda ~2 h 10 min (concurrencia 20) y una
  tarea en segundo plano se corta a las 2 h: `consultar-lote.mjs` retoma.
- "¿El modelo ya lo tenía?" se decide por cuánto efecto sobrevive dentro de
  cada recomendación, no por una segunda prueba de significancia: esa
  segunda prueba, sin casos suficientes, borraba la señal plantada.

**Publicación**
- La aplicación se publica en GitHub Pages desde `.github/workflows/deploy.yml`.
  Si todo da 404, mirar el paso `deploy` del flujo: con el repositorio
  privado y sin plan pago, Pages se apaga (2026-10-03). El repositorio tiene
  cédulas reales en `docs/` y en el historial: volverlo público las expone.

## Cómo se trabaja

- **La clave de servicio nunca llega a `src/`.** El navegador usa sólo la
  clave anónima; lo que necesita más permisos va por una Edge Function.
- **Buró, cédulas y montos no se imprimen** en logs, commits, chat ni
  capturas: se cuentan o se enmascaran.
- **Pedir confirmación antes de borrar datos, columnas o tablas, o de
  forzar un push**, aunque parezca obvio (ver regla 8).
- **Pruebas masivas con el modelo, sólo con autorización explícita** del
  negocio y con el costo estimado (comparaciones, lotes, recálculos con
  LLM): elegir opciones de un diseño no es autorizar el gasto. Una llamada
  suelta para comprobar un despliegue está aceptada. Consultar Novadata no
  le cuesta al negocio por ahora (2026-10-03): reconsultar es sólo tiempo.
- **Al terminar, decir** qué cambió, qué se decidió y por qué, qué se
  verificó (y qué no) y qué quedó pendiente.
- **Verificar contra la base, no suponer.** Un número afirmado sin
  consultarlo es una suposición con formato de hecho.
- **Los huecos se dicen, no se disimulan.** Un dato que no se pudo medir
  se marca como no medido; rellenarlo con cero hace que uno subestime su
  propio problema.
- `npm run lint` y `npm run build` antes de commitear.
- Commits en castellano, explicando el porqué y qué se midió.

## Para no quemar el límite de uso

El contexto de una sesión se reenvía entero en cada vuelta: a 700k
tokens, cada mensaje cuesta diez veces lo que costaba al empezar.

- **Una sesión por frente de trabajo.** Auditar no necesita saber cómo
  se diseñó una pantalla.
- **No sondear.** Para esperar que algo termine, una espera en segundo
  plano — no diez consultas seguidas.
- **Agrupar las consultas de verificación** en una sola con `union all`
  en vez de hacer quince.
- **No releer archivos** que ya se mostraron en la conversación.
