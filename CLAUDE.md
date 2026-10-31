# CrediScope

Calificación crediticia para Ecuador. Una persona se consulta contra
Novadata, se arma un Perfil de la Persona estandarizado, se clasifica su
fuente de ingreso, y un modelo guiado por un marco interpretativo en
lenguaje natural produce un score de 1 a 999 y una recomendación. Sobre eso
están la solicitud de crédito (simulador, capacidad de pago y evaluación
Básico, Pro o Plus) y la API para las instituciones.

Frontend Vite + React 19 en JavaScript (sin TypeScript, sin Tailwind).
Backend: Supabase — Postgres con RLS, Auth y Edge Functions en Deno.

Este archivo existe para que una sesión nueva sea productiva sin
redescubrir lo que ya se aprendió. Lo lee cada sesión en cada vuelta, así
que tiene sólo lo que vale en todo el repositorio:

- **El detalle vive al lado de su código** y se carga solo al trabajar ahí:
  `supabase/CLAUDE.md` (funciones, `_shared/` y base), `src/CLAUDE.md`
  (pantalla) y `scripts/CLAUDE.md` (guiones). Equifax y el Laboratorio
  tienen su guía en `docs/` (ver «Dónde empezar»).
- **El estado vigente** (última migración aplicada, sello de las funciones,
  versiones) y lo abierto están en `docs/pendientes.md`. Un número que cambia
  con cada PR no va acá: este archivo llegó a 63 KB y a dar cuatro conteos
  distintos del mismo control.
- Si algo de acá resulta falso, corregirlo acá mismo. Lo nuevo que vale para
  un área va al archivo de esa área.

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

La IFI es **la institución**: «cliente» es quien tiene un crédito. Los
nombres de código que dicen cliente por institución (`clientes/`,
`migrar-clientes.mjs`) se quedan.

**Los nombres de pantalla los decide el negocio** y viven en
`.claude/skills/revision-ux/terminologia.md`, con el nombre anterior y el
porqué. Los de Fuentes de ingreso (2026-09-26: los anteriores no se
entendían sin haber estado en el diseño) salen de
`src/lib/fuentesIngresoConsolidado.js` (`quienDeclara()`, `ETIQUETA_ESTADO`,
`ETIQUETA_SENAL`, `DOCUMENTOS_DE_CONFIRMACION`): no inventar otros.
«Empleador externo» es sólo para organismos internacionales: el código 29
del IESS junta embajadas y organismos, y se separan por el nombre del
empleador (`ES_MISION_DIPLOMATICA`). «Cómo puede fallar» se sacó de todas
las pantallas y de la exportación.

**Los comentarios explican el porqué, no el qué.** Cuando una decisión
es contraintuitiva, el comentario dice qué pasó que la motivó — un caso
real, un número medido, un error que costó caro. Un comentario que
repite lo que el código ya dice es ruido.

**Lo que ve el analista pasa por la revisión de UX** (habilidad
`revision-ux`, en `.claude/skills/revision-ux/`; el porqué de cada regla,
`docs/revision-ux.md`):
- Números, moneda, porcentajes y duraciones sólo con `src/lib/formatos.js`
  ("2.812", "37,0 s", "$1.784") y las fechas con `fechas.js`. Nunca `${n}`
  ni `.toFixed()` en un texto: la misma cifra salía de cuatro maneras.
- Tres puntos ("Cargando..."), plurales con `plural()` (no "cliente(s)").
- Nombres comerciales en Title Case y el resto como oración. Un nombre que
  eligió el negocio no se cambia por gusto: se propone con opciones
  (`terminologia.md` de la habilidad).
- Piezas compartidas antes que copias: `src/components/ui/` (`Kpi`, `Barra`,
  `Cargando`, `Aviso`, `AvisoDeError`, `LimiteDeError`). Un error nunca se
  muestra con `error.message` crudo.
- Una versión (`marco-v28`), un código o un JSON no van en una tarjeta
  principal.
- **Las pantallas son para personal de crédito capacitado** (negocio,
  2026-10-20). El título nombra la pantalla, sin una frase que diga qué hace,
  y no se explican conceptos de crédito (cuota, tasa nominal, desgravamen,
  capacidad de pago). Lo propio de CrediScope, que un analista no puede saber
  (de dónde sale una cifra, que está sin verificar, que una consulta se cobra,
  una regla nuestra como el Ingreso Mínimo SBU), va en una etiqueta corta
  junto al dato o en una ayuda ⓘ. Se venía diseñando para alguien que no
  conoce de crédito: el Simulador decía «Cuánto pagaría por mes un crédito de
  consumo, con el seguro de desgravamen incluido», y unas 30 de 53 páginas
  llevaban una frase así bajo el título. Los estados vacíos, los errores y la
  confirmación de lo que se cobra siguen diciendo qué pasa y qué hacer.
  `revisar-textos.mjs` corta con un párrafo explicativo bajo un `<h2>`
  (`subtitulo-de-pagina`) y `--explicativos --archivo=` lista lo que explica
  algo en una pantalla, para revisarla (habilidad `revision-ux`).
- **La identificación y los datos de la persona van completos en pantalla**:
  no se tapan ni se propone taparlos (ver «Cómo se trabaja»).
- **Score**, no «puntaje»; **persona**, no «cliente» (cliente es quien tiene un
  crédito); **Monitoreo**, no Reportes. El negocio ordenó el producto alrededor
  de la persona (2026-10-12): el árbol, los estados y lo que quedó abierto están
  en `docs/modelo-de-la-persona.md`.
- Un nombre que cambia el negocio se cambia con
  `node scripts/renombrar-textos.mjs` (primero en seco: sólo toca textos de
  pantalla, nunca una variable ni una columna de datos) y con una regla nueva en
  el control, para que el nombre viejo no vuelva.
- `node scripts/revisar-textos.mjs` corta con los términos que el negocio
  retiró (piso, asalariado, default, backtest, LLM, puntaje...), y
  `node scripts/probar-formatos.mjs` prueba los formatos, la traducción de
  errores y la navegación: correrlos después de tocar `formatos.js`,
  `mensajesDeError.js`, `navegacion.js` o `destinoDeIngreso.js`.

## Reglas duras

Romper cualquiera de estas rompe algo real.

1. **Nunca `supabase db push`.** El historial de migraciones remoto está
   vacío a propósito. **Desde la 116, una migración se aplica con el
   corredor**: `node scripts/migrar-clientes.mjs --seco` y después
   `--aplicar`. Va a todas las bases de `clientes/directorio.json`, cada
   una en una transacción con su fila en `esquema_version`, y rellena los
   marcadores desde el archivo de secretos de cada base. Aplicarla a mano
   deja la base sin su versión y el control lo marca. Una migración nueva
   no abre su propia transacción. **El número se toma al aplicarla, no se
   reserva**: el corredor aplica sólo los números mayores que el último
   aplicado, y uno salteado no se aplica nunca. Antes de escribirla, mirar
   en qué número está cada base (el corredor sin banderas) y las ramas
   abiertas, y avisar a las otras sesiones. **Se aplica recién fusionada en
   `main`**: el 2026-10-12 una 122 aplicada desde una rama dejó sin correr
   otra 122 que ya estaba en `main`. Si una función empieza a
   depender de ella, subir `ESQUEMA_MINIMO` (`_shared/version-esquema.ts`): primero se
   migra, después se despliega (`--funciones`), o la función contesta
   503. Para consultas sueltas sigue
   `npx --yes supabase@latest db query --linked --file <archivo>`.
   **Las funciones se despliegan sólo con `--funciones`, desde una copia
   limpia de `origin/main`.** Se arma con `git worktree add --detach`,
   copiando `supabase/.temp` a esa copia. El corredor:
   - despliega de a una función;
   - sella el commit (encabezado `x-crediscope-version`);
   - confirma que cada función contesta con ese sello;
   - lo anota en `despliegues` (117).
   Con `functions deploy` a mano la función queda "sin-sello" y el control
   lo marca. Pasos en `docs/remediacion-auditoria-externa.md`, sección 5.
2. **El CLI no está en el PATH**: usar `npx --yes supabase@latest`.
   Desde un worktree, `--linked` falla con "Cannot find project ref":
   el enlace vive en `supabase/.temp`, que no está en git. Agregar
   `--workdir` apuntando a la carpeta principal del repositorio.
3. **Las migraciones que necesitan secretos llevan marcadores**
   (`<<PROYECTO_URL>>`, `<<VIGIA_CLAVE>>`) y se rellenan FUERA del
   repositorio, en un archivo temporal que se borra después. El corredor
   lo hace solo: `PROYECTO_URL` sale del directorio y el resto del archivo
   de `secretos` de cada base (`.env.functions` para la plantilla,
   `clientes/<clave>.env` para las demás, fuera de git).
4. **Los secretos viven en `.env.functions`** (excluido del repo) y en
   las secrets de Supabase. Se leen del archivo, nunca se imprimen ni se
   pegan en el chat.
5. **`create or replace view` no puede insertar una columna en el
   medio**: renombra la que estaba en esa posición y falla. Las columnas
   nuevas van al final, aunque quede feo.
   Además, `create or replace view` REEMPLAZA las opciones de la vista: sin
   `with (security_invoker = true)` vuelve a leer como su dueño y saltea la
   RLS (la 118 recrea tres vistas así). La definición vieja se toma de la
   base viva (`pg_get_viewdef` / `pg_get_functiondef`), no de la última
   migración que la tocó.
6. **Las funciones se despliegan sin `--no-verify-jwt`.** La
   configuración por función vive en `supabase/config.toml`; sólo el
   vigía y el trabajador de lotes van sin JWT (clave propia, comparada
   con `clavesIguales()`). **Toda función que atiende a la pantalla
   llama a `exigirRol()` antes de leer el cuerpo**: el portón de Supabase
   deja pasar la clave pública, que va en la página. Así estuvo abierta
   `structure-client` hasta el 2026-10-09: cualquiera en internet
   consultaba el buró de cualquier cédula.
   - **Los guiones entran a `structure-client` con `GUIONES_CLAVE`**
     (encabezado `x-guiones-clave`), y desde ahí la función exige
     `actorId` y `baseLegal`.
   - Hasta la noche de ese mismo día se reconocían por el rol
     `service_role` leído del token sin verificar la firma: con
     `verify_jwt` apagado, un token armado a mano lo abría (E4).
   - Nunca confiar en un dato del token que no se verificó acá.
7. **Windows + Git Bash.** Los heredocs mutilan el código con acentos y
   comillas: usar las herramientas de escritura y edición de archivos,
   no `cat <<EOF`. En PowerShell 5.1, `Get-Content` lee UTF-8 sin BOM como
   ANSI: volver a escribir eso rompe los acentos (`docs/lecciones.md`).
8. **Si una migración borra una columna que el código desplegado
   escribe, desplegar PRIMERO y borrar después.** La base y las
   funciones se actualizan por caminos separados, así que entre los dos
   pasos hay una ventana con todo roto: el trabajador de lotes corre
   cada minuto y una consulta desde la pantalla falla en el insert. El
   2026-09-23 la 078 se aplicó antes de desplegar y dejó esa ventana
   abierta. Al revés no hay ventana: código nuevo que ya no escribe la
   columna convive sin problema con la columna todavía presente.
9. **El rol anónimo no tiene permisos en `public`** (113), y los
   privilegios por defecto lo mantienen así para lo nuevo. Una tabla
   nueva lleva RLS y políticas por rol igual. `audit_log` no se modifica
   ni se borra (disparador): la pantalla registra con
   `registrar_evento()`. El registro público de cuentas está cerrado
   (2026-10-09): las da de alta el admin. La auditoría de ese día y su
   procedimiento están en `auditoria/` (fuera de git: describe fallas).
10. **`main` está protegida** (2026-10-09). Todo cambio entra por PR con
    los cuatro controles de `.github/workflows/controles.yml` en verde:
    `pantalla`, `funciones`, `guiones` y `secretos`. Esos nombres los exige
    la regla de la rama: si se cambia uno, se cambia también la regla.
    - Una sesión trabaja en una rama, abre el PR con `gh pr create` y lo
      fusiona con `gh pr merge --squash --delete-branch` cuando pasan los
      controles.
    - `gh pr merge` falla si `main` avanzó (los controles tienen que ser del
      último commit), y **borrar la rama remota antes de confirmar MERGED
      cierra el PR**: ver `docs/lecciones.md`.
    - Sin empujes forzados. La regla vale también para el admin.
    - Las acciones van fijadas por SHA, y Dependabot propone las
      actualizaciones como PR.
    - `pantalla` corre lint, build, `revisar-textos.mjs` y
      `probar-formatos.mjs`. Su build compila sin las variables de Supabase:
      sirve para ver que compila, no para medir lo que se publica (el
      principal sale en 273 KB contra 476 KB con el `.env`).
11. **Un guion que escribe en la base abre su registro** con
    `abrirEjecucion()` (`scripts/_comun/ejecucion.mjs`, tabla
    `ejecuciones_operativas`, 117).
    - Sin constancia no corre.
    - Con cambios sin commitear tampoco, salvo `--sin-commit`, que queda
      anotado.
    - La corrida se cierra sola al salir, "terminada" o "fallida".

## Dónde empezar

| Para | Leer |
|---|---|
| Retomar, o saber el estado vigente | `docs/pendientes.md`; borrar de ahí lo que se cierre |
| Funciones, `_shared/`, migraciones y base | `supabase/CLAUDE.md` (se carga solo) |
| Pantallas | `src/CLAUDE.md` (se carga solo) y la habilidad `revision-ux` |
| Guiones | `scripts/CLAUDE.md` (se carga solo) |
| Equifax | `docs/equifax.md` |
| La base de originación en AWS (requerimientos, ingresos, predictor) | `docs/base-aws-originacion.md` |
| El predictor de ingresos (el de quien no lo tiene verificado) | `docs/especificacion-predictor-de-ingresos.md` (qué se construye y en qué orden), `docs/investigacion-predictor-de-ingresos.md` (por qué) y su estado, en el punto 18 de `docs/pendientes.md` |
| El Laboratorio | `docs/laboratorio-guia.md`: el plan por pasos y, al final, cómo está construido |
| Ponerle nombre a una pantalla o a una tabla | `docs/modelo-de-la-persona.md`: la persona, su árbol y sus estados |
| La demo para una institución | `docs/plan-demo-ifi.md` |
| Cambios de estructura del producto | `docs/arquitectura-fabrica-de-credito.md` (en pausa) |
| Lo que el negocio observa en los análisis | `docs/observaciones-del-negocio.md` (en pausa); los casos atípicos, `scripts/detectar-atipicos.mjs` |
| La auditoría externa del 2026-10-09 | `docs/remediacion-auditoria-externa.md`; el informe (E1 a E27) en `auditoria/` y la ficha del modelo en `docs/cumplimiento/`, fuera de git; la tarjeta de puntaje, `docs/tarjeta-de-puntaje.md` |
| El caso, la fecha y los números de una lección | `docs/lecciones.md` |

## Lo que cruza todo el producto

- **API única para IFI** (propuesta del 2026-10-09; Fase 0 cerrada el 10/10).
  - **El «contrato» de la API es `api/openapi.yaml`** (su especificación
    técnica; con el negocio se dice «especificación de la API», porque
    «contrato» a secas es el comercial con la institución), en OpenAPI 3.1, y es la única
    fuente: de ahí salen la validación, las pruebas y el sandbox.
  - Se valida con
    `npx --yes @redocly/cli@latest lint api/openapi.yaml --extends=recommended-strict`.
  - Los ejemplos del contrato no llevan nada con forma de JWT: el control de
    secretos (gitleaks) los marcaría.
  - La propuesta (mediciones, flujo, reintentos, análisis de ataque, cifrado,
    normativa y decisiones) vive en `docs/cumplimiento/api/`, fuera de git
    porque describe debilidades.
  - **A la institución, con su contrato firmado, la API le devuelve los
    datos de la persona completos** (nombre, identificación, núcleo
    familiar, perfil) según lo que habilite su configuración (negocio,
    2026-10-20): la IFI es la responsable del tratamiento. Lo que viene de
    una fuente se entrega si el contrato con esa fuente lo permite; el de
    Novadata espera su respuesta por escrito.
  - E27 ya no frena la v1 (cerrado el 2026-10-20). Lo que falta está en
    `docs/pendientes.md`.
- **Una base por institución** (`docs/plan-segundo-cliente.md`, construido el
  2026-10-09): `clientes/directorio.json` dice qué bases existen (sólo
  referencia de proyecto y URL, nunca datos ni secretos),
  `scripts/migrar-clientes.mjs` las mantiene al día y
  `_shared/version-esquema.ts` hace que una función se niegue a atender
  una base atrasada. Falta armar desde cero la base de una institución nueva
  (ver `docs/pendientes.md`).
- **Seguridad y cumplimiento** (auditoría del 2026-10-09):
  `scripts/auditar-seguridad.mjs` es el control (correrlo
  después de tocar permisos, políticas, funciones, migraciones o la
  publicación; hoy mide sólo la base enlazada);
  `scripts/derechos-del-titular.mjs` atiende acceso, portabilidad y
  supresión de una persona (`suprimir_titular()`, 115: borra el contenido
  y conserva la constancia de las consultas). Una tabla nueva con datos de
  la persona se suma a los dos. Los documentos del SGSI, LOPDP e ISO 9001
  viven en `docs/cumplimiento/` (fuera de git mientras el repo sea
  público). La IFI es la responsable del tratamiento y CrediScope su
  encargado: la autorización de cada titular la garantiza la IFI por
  contrato, y un lote declara su base legal. Lo que se le muestra a una
  institución es `docs/cumplimiento/ficha-de-seguridad-para-clientes.html`
  (publicada como página privada), nunca el informe de `auditoria/`.
  Quien encuentre una falla la reporta en privado desde la pestaña Security
  del repositorio (reporte privado de GitHub, activado el 2026-10-12):
  `SECURITY.md` lo explica.

**Publicación**
- La aplicación se publica en GitHub Pages desde `.github/workflows/deploy.yml`
  en cada push a `main` (https://hugo777gonzalo.github.io/crediscope/).
  Si todo da 404, mirar el paso `deploy` del flujo: con el repositorio
  privado y sin plan pago, Pages se apaga (2026-10-03); al volverlo público
  hubo que habilitar Pages otra vez (Source: GitHub Actions).
- **Mudanza a Cloudflare Pages con repositorio privado** (decisión del
  negocio del 2026-10-09, por la auditoría): Cloudflare compila con
  `CF_PAGES=1`, que en `vite.config.js` pone la base en `/` y saca el
  404.html; las cabeceras de seguridad (CSP) viven en `public/_headers` y
  `npm run preview` las sirve igual para probarlas. Un servicio externo
  nuevo hay que sumarlo a la CSP o el navegador lo bloquea en silencio.
  Al cambiar de dominio, sumarlo a la secret `ORIGENES_PERMITIDOS` de las
  funciones (`_shared/cors.ts`) y a las URL de Auth de Supabase.
- **El repositorio es público desde el 2026-10-04** (decisión del negocio),
  hasta que termine la mudanza. El historial de commits tiene cédulas
  reales (el árbol se limpió el 2026-10-09); no se suman más (ver «Cómo se
  trabaja»).

## Lo que vale en todo el repositorio

Cada una salió de un error real; no revivirlas. Las de un área están en el
CLAUDE.md de su carpeta, y el caso, la fecha y los números de cada una, en
`docs/lecciones.md`. Una lección nueva va con su regla, en una o dos líneas,
al CLAUDE.md que le corresponde, y con su caso a `docs/lecciones.md`.

- PostgREST corta en 1.000 filas sin avisar: agregar en la base (función
  `security invoker`), listar con `traerTodas()`.
- Una actualización bloqueada por RLS devuelve 0 filas, no error:
  `.select()` y contar.
- Un error de PostgREST es un objeto plano: leer
  `message`/`details`/`hint`/`code`, no `String(err)`.
- Al reclamar trabajo concurrente, usar las filas que DEVOLVIÓ la
  actualización.
- Lo que no pasa por `lint` ni `build` se rompe en silencio: los scripts
  sueltos llevan su propio aviso adentro.
- Un reemplazo de texto en un archivo con comentarios se ancla a la línea.
  El 2026-10-09 el sello del despliegue reemplazó una palabra en un
  comentario y el despliegue "salió bien" sin sellar. Sólo lo vio la
  comprobación posterior.
- **Personas sintéticas** (118): `clients.es_sintetico` marca las 240 de
  Aval.
  - Los totales de la base las excluyen.
  - La bandeja las trae con la marca, y las listas de la pantalla filtran
    `es_sintetico = false`.
  - Un total nuevo sobre la cartera las filtra igual, también si lee
    `bandeja_solicitudes`: la vista las conserva. La franja de la bandeja
    (`bandeja_conteos`) las contó hasta la 120 (2.812 contra 2.572 de la
    lista), porque la 118 buscó a los lectores de las tablas y no a los de
    la vista.
- Ecuador es UTC-5 sin horario de verano: a las 20:00 de Ecuador la fecha
  UTC ya es la de mañana. Las fechas se formatean sólo con `src/lib/fechas.js`.
- Un archivo de secretos guardado desde el Bloc de notas queda como `.env.txt` y git no
  lo ignora (la regla es `clientes/*.env`): `git check-ignore -v <archivo>` antes de leerlo.
- Con squash, una rama fusionada nunca es ancestro de `main`. Antes de borrar una rama,
  comparar su punta con la cabeza de su PR (`refs/pull/N/head`).

## Cómo se trabaja

- **La clave de servicio nunca llega a `src/`.** El navegador usa sólo la
  clave anónima; lo que necesita más permisos va por una Edge Function.
- **Dentro de CrediScope los datos de la persona van completos** (negocio,
  2026-10-20): pantallas, PDF, Excel y auditoría, y también el chat con
  Claude y sus capturas, que son parte del desarrollo. Es un entorno
  controlado y autorizado por las dos partes. Las sesiones extendían a las
  pantallas la regla de lo que sale (la última vez, la cédula de
  «Solicitudes recientes»). Lo que se controla es lo que sale, según quién lo
  recibe:
  - al modelo, sólo el perfil del modelo, sin identificadores;
  - a la institución por la API, lo que habilite su contrato;
  - a una fuente, sólo lo que pide la consulta.
- **Lo que queda escrito fuera de la base no lleva datos de personas
  reales**: ni buró, ni cédulas, ni montos en logs, commits, `docs/`, el
  código, las pruebas ni los avisos (Telegram, webhooks). El repositorio es
  público. **Un caso real se cita como `c-xxxxxxxx`**: los 8 primeros caracteres de
  `clients.id` (`select cedula from clients where id::text like
  'xxxxxxxx%'`). El 2026-10-09 había 31 cédulas reales en 121 menciones,
  la mayoría en comentarios del código; el control mensual las busca.
  **Los casos no se pierden**: `research/casos-reales/registro-de-casos.md`
  (fuera de git) dice qué cédula es cada referencia, dónde se cita y con
  qué texto, con sus perfiles y análisis. Lo arma y valida
  `node scripts/registrar-casos-reales.mjs` (correrlo después de citar un
  caso nuevo; sale con 1 si una referencia no resuelve). Las notas a mano
  van en `research/casos-reales/notas.md`.
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
  - Si se tocaron las funciones, también `deno check` y `deno test`.
  - La integración continua los corre igual, y sin ellos en verde el PR no
    entra.
- **Una pantalla tocada se revisa con la habilidad `revision-ux`**: el
  control de textos, el verificador en el navegador de QA y una captura a
  1280 (y a 768 y 414 si tiene tablas). Lint y build no prueban una pantalla.
- Commits en castellano, explicando el porqué y qué se midió.
- **Una prueba en producción no consulta a personas.**
  - Va con una identificación inválida, que la función rechaza antes de la
    fuente, o con una persona concreta autorizada por el negocio.
  - Las 240 cédulas "sintéticas" de Aval no sirven: son datos de prueba de
    Aval, no números inexistentes. Una trajo nombre en Novadata el
    2026-10-09.

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
