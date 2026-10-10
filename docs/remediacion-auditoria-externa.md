# Remediación de la auditoría externa (E1 a E5)

Registro de lo que se hizo, se decidió y se verificó para corregir los cinco
hallazgos altos de la auditoría externa integral del 2026-10-09, y de cómo
seguir. El informe completo, con los 26 hallazgos, es confidencial y vive
fuera de git: `auditoria/2026-10-09-auditoria-externa-integral.md`. Acá sólo
va lo que ya está cerrado o no expone nada.

**Estado al 2026-10-09 (noche):**

| Hallazgo | Estado | Qué falta |
|---|---|---|
| E1 · Score no reproducible | 🟡 Primer paso hecho | Tarjeta de puntaje cuando haya impagos reales; validación independiente y pruebas de equidad |
| E2 · Cambios sin control | ✅ Cerrado | Decidir GitHub Pro antes de pasar el repositorio a privado |
| E3 · Un solo ambiente, guiones sin rastro | 🟡 Rastro y sintéticas hechos | Crear el proyecto de prueba (decisión del negocio: todavía no) |
| E4 · Token sin verificar en `structure-client` | ✅ Cerrado | — |
| E5 · Consultas al límite de los 150 s | 🟡 Plazo y token hechos | Disyuntor por fuente; la cola asincrónica la construye la sesión de la API para IFI (migración 120 reservada) |
| E27 · Lo que lee el modelo (nuevo) | ❌ Abierto | Versión nueva del marco en otra sesión; parte, con legal. Detalle en `auditoria/` (fuera de git) |

---

## 1. Decisiones del negocio (2026-10-09)

1. **Proteger `main`**: sí. Todo cambio entra por PR con los controles en
   verde, sin aprobación de otra persona y sin empujes forzados.
2. **Ambiente de prueba**: todavía no. Se deja todo listo para cuando exista.
3. **Score oficial**: reutilizar ya el análisis cuando el pedido al modelo es
   idéntico. La tarjeta de puntaje se arma cuando haya impagos reales, que
   llegan con la primera ronda de reconsultas (desde el 25/12/2026).
4. **Las 240 personas sintéticas de Aval**: marcarlas y sacarlas de los
   totales, sin borrarlas.
5. **El perfil que dejó la prueba de E5** (ver la sección 4): borrar el perfil
   y su crudo. La anotación de la bitácora queda.

---

## 2. Qué se hizo, hallazgo por hallazgo

### E1 · El score que se entrega no es reproducible

- **El problema.** Medido por el negocio el 2026-10-03: el mismo perfil
  analizado dos veces mueve el score unos 40 puntos y cambia 1 de cada 13
  recomendaciones.
- **Lo hecho.**
  - `analyze-client` calcula la **huella del pedido** entero
    (`huellaDelPedido()` en `_shared/llm-scoring.ts`): perfil del modelo,
    hallazgos, marco, modelo, razonamiento y esquema.
  - Deja afuera `cache_control` y `max_tokens`, que no cambian lo que el
    modelo lee, para que el lote y la pantalla den la misma huella.
  - Si **esa misma persona** ya tiene un análisis terminado con esa huella,
    copia su resultado sin llamar al modelo y anota de cuál lo copió
    (`analysis_results.reutiliza_analisis_id`, migración 119).
  - Una llamada de prueba (`esPrueba`) siempre va al modelo.
  - El lote (`analizar-en-lote.mjs`) guarda la huella y no manda a quien ya
    tiene un análisis con el mismo pedido, salvo cuando se mide el ruido.
- **Cuándo se reutiliza.**
  - Sólo dentro de la misma persona, para no enlazar el registro de una con
    el de otra.
  - Los análisis anteriores al 2026-10-09 no tienen huella y no se
    reutilizan.
  - Si el perfil cambió aunque sea en un dato que lee el modelo, la huella es
    otra y se vuelve a preguntar.
- **Verificado.**
  - Pruebas en Deno:
    - misma huella para el mismo pedido;
    - otra huella con otro perfil, hallazgo, modelo, razonamiento o marco;
    - la misma huella para el lote y la pantalla;
    - el análisis reutilizado decide igual que el original, con y sin
      bloqueo.
  - Desplegado.
- **No verificado.** Un análisis real reutilizado de punta a punta:
  `analyze-client` exige una sesión de usuario, y Claude no inicia sesión.
- **Cómo verificarlo.** Analizar dos veces a la misma persona desde la
  pantalla, sin volver a consultar. La segunda fila de `analysis_results`
  tiene que tener `reutiliza_analisis_id` lleno y `duracion_llm_ms` nulo, sin
  fila nueva en `llm_llamadas`.
- **Gobierno.**
  - La ficha del modelo está en `docs/cumplimiento/ficha-del-modelo.md`,
    fuera de git mientras el repositorio sea público, porque declara brechas
    abiertas.
  - El diseño de la tarjeta de puntaje está en `docs/tarjeta-de-puntaje.md`.

### E2 · Un cambio llegaba a producción sin revisión ni controles

- **Integración continua.** `.github/workflows/controles.yml` corre en cada
  PR y push a `main`, con cuatro trabajos:
  - `pantalla`: lint y compilación;
  - `funciones`: `deno check` y `deno test`;
  - `guiones`: sintaxis de los guiones y detector de eventos;
  - `secretos`: gitleaks.
- **Acciones fijadas por SHA** en los dos flujos.
- **Dependabot** (`.github/dependabot.yml`) para npm y las acciones. El primer
  día abrió dos PRs, #1 y #2: los revisa y fusiona el negocio.
- **Primer chequeo de tipos de las funciones**: 0 errores en 11.019 líneas.
- **20 pruebas en Deno** en `supabase/functions/_shared/*.test.ts`.
- **Despliegue sellado.**
  - `migrar-clientes.mjs --funciones` sólo despliega un commit sin cambios
    pendientes que ya esté en `origin/main`.
  - Escribe el commit en `_shared/version-despliegue.ts` sólo mientras dura
    el despliegue.
  - Despliega de a una función y no da una por hecha hasta que contesta con
    el sello en el encabezado `x-crediscope-version`.
  - Anota cada despliegue en la tabla `despliegues` (117).
- **Protección de `main`.** PR obligatorio, los cuatro controles en verde y
  actualizados con `main`, sin empujes forzados, sin borrar la rama, y
  aplicada también al administrador.
- **Alertas y arreglos de seguridad de Dependabot** encendidos.
- **Verificado.**
  - Los cuatro controles dieron verde en GitHub sobre `f045b3d`.
  - Las seis funciones contestan `f045b3dc304a`.
  - El control de seguridad los compara: "Versión desplegada de las
    funciones: OK".
- **Atención.** Al pasar el repositorio a privado en el plan gratuito de
  GitHub se pierden la protección de ramas y el escaneo de secretos.
  - Para conservar la protección hace falta GitHub Pro: confirmarlo antes
    del cambio.
  - El trabajo `secretos` (gitleaks) sigue funcionando igual.

### E3 · Un solo ambiente y guiones que modificaban producción sin rastro

- **Rastro de los guiones.**
  - `scripts/_comun/ejecucion.mjs` → `abrirEjecucion()`. Lo usan los 13
    guiones que escriben en la base.
  - Cada corrida abre una fila en `ejecuciones_operativas` (117) con: guion,
    argumentos (los números de 10 dígitos enmascarados), commit, si el árbol
    estaba limpio y usuario del equipo.
  - La fila se cierra sola al salir, "terminada" o "fallida".
  - Con cambios sin commitear el guion no corre, salvo con `--sin-commit`,
    que queda anotado.
  - Si no se puede registrar la corrida, el guion no toca la base.
  - Los tres recálculos y `consultar-lote` cuentan las filas que tocan.
  - Verificado en producción con el borrado de la sección 4: se cerró sola
    como "terminada", con 1 fila.
- **Personas sintéticas** (118).
  - `clients.es_sintetico`: 240 marcadas, 2.572 reales.
  - Salen de los totales del tablero, de los agregados, del Panorama de
    Fuentes de ingreso, del centro de datos del Laboratorio y de dos vistas
    de estadística.
  - La bandeja las trae con la marca y las listas de la pantalla las filtran.
    El expediente las sigue abriendo por cédula.
  - Verificado:
    - `metricas_gerenciales().totalClientes` pasó de 2.812 a 2.572;
    - `resumen_fuentes_ingreso().total` da 2.572;
    - la bandeja sigue trayendo 2.812, de las cuales 240 están marcadas.
- **Ambiente de prueba**: pendiente por decisión del negocio. Hace falta, en
  este orden:
  1. **Una línea base del esquema** (E15, sin hacer): el corredor no arma una
     base desde cero. `supabase db dump` necesita Docker, que la máquina no
     tiene, así que hay que armarla desde el catálogo o hacerla en la
     integración continua.
  2. **El proyecto nuevo**, que lo crea el negocio en su cuenta.
  3. Sumarlo a `clientes/directorio.json` y migrarlo con el corredor.
  4. Cargar la cartera sintética con `generar-cartera-sintetica.mjs`
     apuntando a esa base.

### E4 · El camino de servicio de `structure-client` confiaba en un token sin verificar

- **El problema.** Hasta el 2026-10-09 los guiones se reconocían por el rol
  "service_role" leído del token sin verificar la firma. Con `verify_jwt`
  apagado, un token armado a mano saltaba `exigirRol()`.
- **Lo hecho.**
  - Ahora entran con `GUIONES_CLAVE`, una clave propia que va en el
    encabezado `x-guiones-clave` y se compara con `clavesIguales()`.
  - Vive en `.env.functions` y en las secrets de las funciones.
    `consultar-lote.mjs` la manda.
- **Verificado** (control de seguridad, 50 controles en OK):
  - un token fabricado que dice `service_role` → 401;
  - una clave de guiones equivocada → 401;
  - la clave de servicio sola → 401;
  - la clave de guiones correcta sin responsable → 400 (el guion entra y se
    le exige el responsable);
  - `verify_jwt` desplegado coincide con `config.toml` en las seis funciones.

### E5 · Consultas al límite del corte de 150 s

- **Lo que mostró la medición** (duración de la ingesta por día, últimos 30
  días):
  - En los días de uso normal el p95 estuvo entre 11 y 57 s, y el máximo fue
    57 s.
  - La cola cerca del corte aparece sólo en las reconsultas masivas: el
    15/09, 525 de 1.915 consultas pasaron de 100 s.
  - La pantalla analiza siempre con un perfil ya guardado (`profileId`), así
    que nunca junta la fuente y el modelo en un mismo pedido.
- **Lo hecho.**
  - **Plazo por fuente** de 120 s: la fuente que no contesta queda "no
    contestó" en vez de arrastrar la consulta al corte.
  - **Un solo token por consulta**, compartido entre consultas simultáneas.
    Antes eran 52 inicios de sesión al mismo tiempo con el token vencido.
  - **Plazo también para el token y para la prueba de vida del vigía.**
  - **Duración por fuente** en `client_profiles.duracion_por_fuente_ms`
    (119).
  - **Trabajador de lotes:** no empieza una ronda a la que le queden menos de
    60 s y devuelve a la cola lo que cortó su propio reloj.
- **Lo que no se hizo, y por qué.**
  - **No se limitó la concurrencia de una consulta**, aunque la auditoría lo
    proponía: medido, una consulta sola es rápida, y en fila sería más lenta.
  - **No se pasó el análisis a asincrónico:** en el uso normal no hace falta.
    Además, la cola asincrónica la construye la sesión de la API única para
    IFI (decisión del negocio del 2026-10-09, coordinada entre las dos
    sesiones). Esa sesión tiene reservada la **migración 120**.
  - **El plazo puede bajar más adelante.** La sesión de la API propuso fijarlo
    en p99 × 1,5 con un tope de 60 s. Se dejó en 120 s mientras la consulta
    corra dentro de un pedido de 150 s, porque un tope de 60 s cortaría
    fuentes justo bajo carga. Se ajusta con las duraciones por fuente de la
    próxima reconsulta masiva.
- **Verificado.**
  - Pruebas en Deno:
    - un solo token por consulta;
    - dos consultas simultáneas comparten el token;
    - una fuente colgada se corta y las demás contestan;
    - las fuentes apagadas no se piden;
    - sin token, todas quedan en error sin pedir ninguna.
  - En producción, una consulta completa tardó 55 s y guardó la duración de
    49 fuentes. La más lenta tardó 43,5 s; las 3 restantes estaban apagadas.

---

## 3. Inventario de cambios

**Migraciones** (aplicadas con el corredor el 2026-10-09; base en la 119):

| Migración | Qué hace |
|---|---|
| 117 | `ejecuciones_operativas` y `despliegues`, con RLS y lectura para admin |
| 118 | `clients.es_sintetico`; cuatro funciones y tres vistas sin sintéticas. Las vistas se recrean con `security_invoker` explícito, y las definiciones salen de la base viva, no de las migraciones viejas |
| 119 | `analysis_results.huella_pedido` y `reutiliza_analisis_id`; `client_profiles.duracion_por_fuente_ms` |

**Commits** en `main`, en orden:

| Commit | Qué trae |
|---|---|
| `13fc2c7` | Migraciones |
| `bb9753f` | Funciones |
| `256d854` | Guiones y corredor |
| `69ee882` | Integración continua |
| `06de535` | Listas de la pantalla |
| `52a4e41` | Despliegue de a una función |
| `f045b3d` | Sello anclado a la constante |

Después vienen la documentación y el arreglo de la fecha del control.

**Funciones desplegadas:** las seis, con el sello `f045b3dc304a`.

---

## 4. Lo que salió mal en el camino (y quedó corregido)

### El primer despliegue sellado salió sin sello

- El corredor reemplazaba la primera aparición de `"sin-sello"` en
  `version-despliegue.ts`, y esa aparición está en un comentario.
- El despliegue "terminó bien", pero las seis funciones contestaban
  "sin-sello". Lo vio la comprobación posterior, que se agregó justo por eso.
- `52a4e41` lo atribuyó por error al despliegue de todas juntas.
  `f045b3d` lo corrige: el reemplazo quedó anclado a la línea de la
  constante.

### La prueba de E5 consultó a una persona real

- Para probar el plazo por fuente en producción se consultó, por el camino de
  los guiones, una de las 240 cédulas "sintéticas" de Aval. Se esperaba "no
  existe": la memoria del proyecto decía que Novadata no las conoce.
- Contestó con nombre y 4 fuentes con contenido: **la cédula es de una
  persona real**.
- Se guardaron un perfil y su crudo. La bitácora anotó la consulta a nombre
  de QA Interno, con una base legal de prueba que describía otra cosa.
- **Decisión del negocio:** borrar el perfil y el crudo. Se hizo con
  constancia:
  - ejecución `cc13bd5a` en `ejecuciones_operativas`;
  - evento `perfil.borrado` en `audit_log`.
  La anotación de la consulta queda, porque es inalterable y es lo que pasó.
- **Lección.**
  - "Sintética" quiere decir que **los datos que trajo Aval** son de prueba,
    no que el número no exista.
  - Ninguna de esas 240 cédulas se usa para probar contra Novadata.
  - Una prueba en producción se hace con una identificación inválida (que la
    función rechaza antes de la fuente) o con la autorización del negocio
    para una persona concreta.

---

### Una fortaleza del informe era falsa (E27)

- El informe daba por buena la minimización de lo que lee el modelo, tomada
  de la auditoría de seguridad sin volver a medirla.
- Al escribir la ficha del modelo se midió en la base
  (`analysis_results.mensaje_al_modelo`): no se cumple.
- Quedó como hallazgo nuevo, E27, alto. El detalle y las opciones están en el
  informe, fuera de git, y en `docs/cumplimiento/ficha-del-modelo.md`.
- **Decisión del negocio:**
  - se corrige con una versión nueva del marco, en otra sesión;
  - una parte se decide con legal;
  - lo que se les muestra a los clientes se actualiza recién cuando el
    cambio esté desplegado.
- Los documentos internos de cumplimiento ya dicen el estado real.
- **Lección:** una afirmación de un documento anterior es una suposición
  hasta que se mide.

## 5. Cómo se trabaja desde ahora

- **Cambios.**
  - Rama, PR a `main`, los cuatro controles en verde y fusión.
  - Los nombres de los trabajos (`pantalla`, `funciones`, `guiones`,
    `secretos`) son los que exige la protección. Si se cambian, hay que
    cambiar también la regla de la rama.
- **Pruebas de las funciones, en local:**

  ```bash
  npx --yes deno@2.9.6 check --no-lock supabase/functions/*/index.ts
  ```

  ```bash
  npx --yes deno@2.9.6 test --no-lock --allow-env --allow-read=supabase/functions supabase/functions/
  ```

- **Migrar:** igual que antes, con `node scripts/migrar-clientes.mjs --seco` y
  después `--aplicar`.
- **Desplegar funciones**, sólo después de fusionar en `main`, desde una copia
  limpia de `origin/main`:
  - La copia de trabajo de todos los días suele tener cambios, y el corredor
    se niega a desplegar con cambios pendientes.
  - Copiar `supabase/.temp`, porque ahí vive el enlace al proyecto.

  ```bash
  git worktree add --detach ../despliegue origin/main
  ```

  ```bash
  cp -r supabase/.temp ../despliegue/supabase/
  ```

  ```bash
  cd ../despliegue && node scripts/migrar-clientes.mjs --funciones
  ```

  ```bash
  git worktree remove ../despliegue
  ```

- **Un guion nuevo que escribe en la base:**

  ```js
  await abrirEjecucion({ url, clave, guion, seco });
  ```

- **Controlar:** `node scripts/auditar-seguridad.mjs`. Al 2026-10-09: 50
  controles en OK.

## 6. Lo que sigue

1. **E27, urgente:** la versión nueva del marco que corrige lo que lee el
   modelo (otra sesión). Antes de empezarla, leer E27 en el informe de la
   auditoría.
   - Sumar un control a `auditar-seguridad.mjs` que falle si la clave vuelve
     a aparecer.
   - Recién con el cambio desplegado, actualizar la ficha de seguridad para
     clientes.
2. **Verificar con sesión real:** el análisis reutilizado (E1) y las listas
   sin sintéticas (bandeja, Fuentes de ingreso).
3. **E1, cuando haya impagos reales** (desde la reconsulta del 25/12/2026):
   la tarjeta de puntaje según `docs/tarjeta-de-puntaje.md`, la validación
   independiente y las pruebas de equidad (ficha del modelo, sección 7).
4. **E3:** la línea base del esquema (E15) y, cuando el negocio lo decida, el
   proyecto de prueba.
5. **E5:**
   - un disyuntor por fuente alimentado por el vigía;
   - mirar `duracion_por_fuente_ms` después de la próxima reconsulta masiva,
     para saber qué fuente arrastra a las demás.
6. **Los hallazgos medios y bajos (E6 a E26):** hoja de ruta en la sección 7
   del informe de la auditoría.
