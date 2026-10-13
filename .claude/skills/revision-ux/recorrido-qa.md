# Recorrido de QA con la sesión de vista previa

Cómo revisar pantallas reales sin tropezar. Todo lo que está acá costó tiempo en la
revisión del 2026-10-10.

## La sesión

- Hay una cuenta interna de QA con rol admin (ver la memoria `project-crediscope-cuenta-qa`).
  La sesión vive en el navegador del panel de vista previa, **en el origen
  `http://localhost:5184`** (el puerto de `.claude/launch.json`, `crediscope-dev`).
- **Nunca se escribe una contraseña** (ni la que dé la persona en el chat): el ingreso
  manda a Supabase Auth, un servicio remoto. Si el panel muestra el formulario de
  ingreso, decirlo y pedir que la persona ingrese ahí. Después las direcciones
  directas funcionan (desde el 2026-10-10 recargar o abrir un enlace conserva la
  ruta; antes `navigate` llevaba siempre a «/»).
- La sesión caduca sola a los 60 minutos de inactividad.
- Si otra sesión de chat ya levantó el servidor en 5184, `preview_start` se niega y en
  otro puerto la app pide ingreso.

```
preview_start { name: "crediscope-dev" }      → abre http://localhost:5184
```

## El tamaño de la ventana

El panel es angosto (~500 px) y no muestra el menú lateral. Para ver lo que ve un
analista:

```
resize_window { width: 1280, height: 800 }     (después: preset "desktop")
```

- El tamaño **se pierde** cuando cambia el ancho del panel y a veces tras recargar:
  volver a aplicarlo antes de cada captura.
- Si la captura sale ampliada y recortada (se ve sólo la esquina de arriba a la
  izquierda), volver a llamar a `resize_window`.
- Las capturas llegan a 800 px de ancho: sirven para ver la composición, no para leer
  letra chica. Para leer, `get_page_text` o el DOM (`javascript_tool`).
- Para tablet y teléfono: 768x1024 y 414x896. Dejar el panel en `desktop` al terminar.

## El verificador

```js
// javascript_tool — una vez por carga completa de la página (navigate / reload)
const r = await fetch('/.claude/skills/revision-ux/verificar-pantalla.js'); (0, eval)(await r.text());
await __revisionUx.esperarCarga();
JSON.stringify(__revisionUx.verificar())              // la pantalla actual
JSON.stringify(await __revisionUx.recorrer(["/costos", "/reportes"]))   // navega sin recargar
```

- `recorrer()` cambia de ruta con `history.pushState` (sin recargar). **Algunas rutas redirigen
  poniendo parámetros** (`/laboratorio/desempeno` → `?corte=...`) y la herramienta corta el
  guion («the page navigated»): para esas, `navigate` + `wait` + `verificar()`.
- Devuelve `hallazgos` con el tipo y una muestra enmascarada. Los números de 7 dígitos o más se
  tapan (`#######`): ni cédulas ni RUC salen de la página.
- No ve lo que no se dibuja: un estado vacío o de error hay que provocarlo (id inexistente, red
  apagada).

### Lo que el verificador marca y no es un defecto

Revisar la causa antes de "corregir" estos:

| Hallazgo | Dónde | Por qué no es un defecto |
|---|---|---|
| `version-interna` («marco-v28», «estructura-v13») | Costos › Costo por consulta y Detalle de llamadas; la línea de tiempo del Expediente; Reglas de clasificación | Son tablas de costo por versión, la historia de cada análisis y la pantalla que documenta la versión: ahí la versión es el dato. No va en una tarjeta principal |
| `termino-prohibido` («Informe de retroalimentación (retirado)») | Costos › Panorama | El historial retirado está marcado «(retirado)» a propósito |
| `fecha-iso`, `identificador`, `termino-prohibido` («error del LLM», «request_id») | Costos › Avisos | Es el «Detalle técnico» plegado de cada aviso: el texto original del proveedor, que sólo se ve al abrirlo. El verificador lee también lo plegado |
| `texto-chico` (11 px) | Bandeja, Expediente | 11 px es el tamaño menor de la escala; son las etiquetas de columna |

Lo que sí es un defecto aunque el verificador no lo vea: un número interpolado sin
`formatos.js` (`{n} llamadas`: sin miles ni singular) y un mes en ISO fuera de un detalle
plegado (se lo marca como `mes-iso`).

## Para entrar a un expediente sin escribir una cédula

La cédula no se escribe en una dirección ni en un mensaje. Se abre desde la bandeja:

```js
const a = [...document.querySelectorAll('a[href^="/solicitudes/"]')][3]; a.click();   // el 4.º «Abrir»
```

## Trampas conocidas

| Síntoma | Causa | Qué hacer |
|---|---|---|
| `Link is not defined` (o cualquier import «que sí está») en una pantalla recién editada | Vite sirvió una transformación vieja: el observador de archivos perdió un cambio cuando se editó el mismo archivo varias veces seguidas | `touch src/ruta/Archivo.jsx` y recargar. `npm run build` compila bien |
| La bandeja o «Clientes por segmento» muestran `column ... does not exist` | El código del navegador pide una columna de una migración que todavía no se aplicó a la base | No es de la pantalla. Aplicar la migración (corredor) **antes** de desplegar el frontend (regla 8 de CLAUDE.md) |
| «El servidor tardó demasiado en contestar» en el inicio del Laboratorio | `statement timeout` de una consulta pesada de la base | No es de la interfaz; el aviso ya trae «Reintentar» |
| Pantalla en blanco al abrir una ruta de administración con un enlace directo | (Corregido: el perfil se pide una vez y la guardia espera con «Cargando») | Si reaparece, mirar `useProfile.js` |
| `javascript_tool` se pasa de 45 s con `recorrer()` de muchas rutas y, **aunque falle, el guion sigue corriendo en la página**: pasa por las rutas que quedaban y contamina el resultado del siguiente | Más de 7 rutas por llamada es demasiado, y las que redirigen con parámetros (`/laboratorio/estadistica`) cortan el guion. Esperar a que termine antes de lanzar otro, y para esas rutas `navigate` y una sonda aparte |
| El panel está oculto y las capturas dan «Screenshot timed out» | Una ventana minimizada no dibuja | Reintentar tras una espera corta; si sigue, medir con `javascript_tool` (`getBoundingClientRect`, `getComputedStyle`) |
| Abrir un expediente imprime la cédula en el encabezado de la respuesta del panel (la dirección) | La ruta del expediente lleva la cédula | No copiarla a ningún documento, mensaje ni commit; volver a otra ruta apenas termine la revisión |
| El primer `Cargando...` dura segundos | Modo desarrollo: Vite sirve cientos de módulos sin empaquetar | Medir el tiempo real con `npm run build && npm run preview` (puerto 5185) |
| `get_page_text` devuelve sólo el menú | Una guardia devolvía `null` mientras cargaba el perfil | Esperar y repetir; si dura, es un bug |

## Qué dejar dicho al terminar

- Qué rutas se recorrieron y a qué ancho.
- Qué hallazgos se corrigieron, cuáles se propusieron y cuáles son de la base o de otra sesión.
- **Qué no se pudo ver** (por ejemplo una ruta que dio `statement timeout`, o una captura que no
  alcanzó a leerse).
