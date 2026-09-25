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
leen en pantalla.

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

## Lo que costó caro aprender

Cada una de estas salió de un error real. No revivirlas.

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
- **El crudo de Novadata no se guarda.** Se guarda el perfil
  estandarizado (`client_profiles.standard_profile`); la respuesta
  cruda existe sólo para 389 personas en `research/novadata-raw/`. Una
  regla nueva que necesite el crudo aplica a consultas nuevas: los
  perfiles guardados no se pueden reclasificar.
- **`fuentesIngreso.detalle` no va al modelo.** Desde fuentes-v4 trae el
  historial de aportes, la actividad económica y la renta por año, para
  el analista. Todo camino que le mande un perfil al LLM pasa por
  `sinDetalleDeIngresos()`; uno nuevo también tiene que hacerlo.
- **El corte del IESS lo deciden 20 clientes, no uno.** Novadata
  actualiza el IESS más o menos cada dos meses (al 2026-09-25 el corte
  es 2026-07; el de 2026-09 se espera en octubre). Algunos aportes llegan
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
- **Aval es dos órdenes de magnitud más rápido que Novadata.** Una
  consulta a Aval tarda 890 ms de mediana (p95 1,3 s) contra los 41 s de
  Novadata: es UNA llamada, no 52. Las 200 salieron en 1 minuto a 197 por
  minuto con concurrencia 6, sin un solo reintento. Las cuentas de
  capacidad que se hicieron pensando en Novadata no aplican acá.

## Cómo se trabaja

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
