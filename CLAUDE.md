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
