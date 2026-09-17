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
- **`ejes_ok` cuenta bloques (9), `fuentes_ok` cuenta fuentes (52).** El
  primero exagera: un bloque figura "ok" si contestó UNA de sus catorce
  fuentes.
- **pg_net publica en el esquema `net`, no `extensions`.** Y una tarea
  programada se verifica contra `cron.job_run_details`, nunca contra
  `cron.job`: `cron.job` dice que está activa aunque lleve horas
  fallando.
- **Una actualización bloqueada por RLS devuelve 0 filas, no un error.**
  Hay que pedir `.select()` y contar.
- **Al reclamar trabajo en un proceso concurrente, trabajar sobre las
  filas que la actualización DEVOLVIÓ**, no sobre las que se leyeron.
- **Reencolar ítems de un lote `terminado` no lo reabre**: el trabajador
  solo mira los `en_proceso`.

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
