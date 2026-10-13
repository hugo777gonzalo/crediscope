# Criterios de UX para una pantalla de crédito

Qué mirar en cada pantalla, en este orden. Cada criterio trae el caso real de
CrediScope que lo motivó (2026-10-10, salvo que diga otra fecha), porque un
criterio sin caso se discute y uno con caso se aplica.

## 1. ¿Se entiende en cinco segundos?

- **La primera vista alcanza para entender el caso.** Lo largo va plegado
  (`SeccionDesplegable`, `<details>`), numerado cuando es una lista. Tarjetas e
  indicadores antes que párrafos. Los datos relacionados, juntos («locales abiertos»
  al lado de «RUC activo»). *Pedido del negocio, 2026-09-26.*
- **Un título que dice dónde estás** y no se repite al lado. Barra superior:
  «Sección › Página» (`navegacion.js`); la pantalla pone su propio `<h2>`. *La barra decía
  a veces la sección y a veces la página; en el Laboratorio decía «CrediScope».*
- **Una sola cosa llamada de una manera.** Si una pantalla dice «Fuente de ingreso» en el
  sello y «Segmento» en la tarjeta de abajo, el analista cree que son dos datos. Ver
  `terminologia.md`.
- **Nada de generalidades ni especulación**: una afirmación sobre una persona necesita un dato
  que la sostenga («Cómo puede fallar» se sacó de todas las pantallas).
- **Nada del plan del equipo.** «Eso llega con la solicitud como entidad» no le sirve a
  nadie que esté mirando un caso. Se dice qué falta y qué hacer.

## 2. ¿Se puede confiar en la cifra?

- **Las tarjetas suman.** La franja de la bandeja decía 2.812 y sus ocho tarjetas daban 2.789:
  faltaban los 23 análisis «no se completó». Una franja que no cierra le quita
  credibilidad a todo lo que está al lado. (`Solicitudes.jsx`: «Sin recomendación» se calcula
  para que cierre.)
- **La barra mide lo que el título dice.** «En qué se gastó» dibujaba el porcentaje de
  *llamadas*, no de dinero: 96% contra 79% real. «Actividad por analista» mostraba «100% (5.937)»
  y «45% (2.642)»: porcentajes contra el mayor, que suman más de 100.
- **Una comparación honesta.** «-57% vs. mes anterior» el día 9 comparaba medio mes con un mes
  entero. Decir «en lo que va del mes».
- **El mismo número en todas las pantallas** o la razón de la diferencia a la vista
  (ver «Lo que tiene que decir lo mismo» en `mapa-de-pantallas.md`).
- **Un porcentaje distinto de cero nunca dice «0%»**: `porcentajeDe` devuelve «<1%».
- **Formatos de la casa**: «2.812», «37,0 s», «$1.784», «15/09/2026 17:26», «Ago 2026». Nunca
  `2812`, `37.0 s`, `$1,784`, `2026-08`. *Cuatro formas de escribir lo mismo en cuatro pantallas.*
- **El hueco se dice.** «No medido» / «—» con su motivo; jamás `0`.

## 3. Los tres estados de toda pantalla

| Estado | Cómo | Qué evitar |
|---|---|---|
| Cargando | `<Cargando />` (gira, `role="status"`). Si ya había datos, se conservan y se avisa «actualizando...» | Pantalla en blanco (las guardias de ruta devolvían `null` de 4 a 10 s); un `<p>Cargando...</p>` distinto en cada archivo |
| Vacío | Qué falta y qué hacer: «Todavía no hay personas clasificadas. Se irán clasificando a medida que se consulten.» | «Sin datos» a secas, tabla vacía con encabezados |
| Error | `<AvisoDeError error={err} />`: lo que pasó en castellano + «Detalle técnico» plegado + «Reintentar» si se arregla esperando | `error.message` crudo («column bandeja_solicitudes.es_sintetico does not exist», `invalid input syntax for type uuid: "null"`, un JSON entero del proveedor) |

Una pantalla que falla al dibujarse no tira abajo la aplicación: `LimiteDeError` (en `App.jsx`)
la contiene. Una dirección que no existe muestra «No encontramos esa página».

## 4. Redundancia

- **Dos caminos al mismo contenido** se justifican sólo si uno es una acción y el otro una
  lectura. Los botones de la cabecera del Expediente se llamaban «Perfil del Cliente» y
  «Análisis con IA», igual que las secciones de al lado; ahora son «Actualizar el perfil» y
  «Correr el análisis»/«Volver a analizar».
- **La misma cifra no se repite en la primera pantalla.** El Expediente mostraba el segmento tres
  veces y el ingreso cuatro. Cada dato, una vez arriba; el detalle, abajo.
- **El mismo aviso una vez.** El Laboratorio ponía el cartel «sintético» y, debajo, otro igual
  dentro de la pestaña.
- **Una pieza, un lugar.** `Kpi` estaba escrita ocho veces, `Barra` cuatro, el aviso de error
  treinta y nueve. Antes de escribir un componente, buscá en `src/components/ui/` y en
  `components/laboratorio/Comunes.jsx`.
- **Una clasificación, una pantalla.** Reportes tenía su propio «Perfil laboral» (independientes,
  dependientes, jubilados, pensionistas) con cifras distintas a las del Panorama bajo el mismo
  nombre. Se dejó una sola, en Fuentes de Ingreso.

## 5. Accesibilidad (lo que el verificador mide)

- Todo campo tiene etiqueta (`<label htmlFor>` o `aria-label`); un placeholder no es una etiqueta.
  Si la etiqueta no debe verse: `className="crediscope-solo-lectores"`.
- Todo botón o enlace con sólo un ícono lleva `aria-label` (y `title` para el que ve).
- Los íconos decorativos, `aria-hidden="true"`.
- Hay un `<h1>` por pantalla (lo pone `App.jsx` en la barra, sólo para lectores de pantalla) y los
  títulos no saltan de nivel.
- Contraste: texto normal 4,5:1, grande 3:1. `--text-muted` sobre blanco cumple; el dorado
  (`--gold`) no es para texto.
- Foco visible en todo lo que se puede tocar (`:focus-visible` global).
- Tamaño de letra: nada por debajo de 11 px; las etiquetas en mayúsculas llevan 11 px como piso.
  Los textos de un gráfico SVG se dimensionan para el tamaño al que se dibuja (un `fontSize` de 10
  en un dibujo de 560 que se achica a 330 queda en 6 px).
- No transmitir un estado sólo con color: la pastilla dice «Revisar», no sólo se pone amarilla.

## 6. Responsive

Se revisa a **1280**, **768** y **414**. La barra lateral pasa a barra superior de íconos bajo 860 px.

- La página nunca desborda horizontalmente: una tabla ancha se desliza **dentro de su tarjeta**
  (`.crediscope-card { overflow-x: auto }` bajo 860 px), un desplegable con un nombre largo se
  acota (`maxWidth: min(560px, calc(100vw - 80px))`).
- El verificador devuelve `desborde` cuando `scrollWidth > clientWidth`. Si aparece, buscá el
  elemento que se sale (`getBoundingClientRect().right`).

## 7. Tipografía y espacio

- Escala entera: 11 · 12 · 13 · 14 · 15 · 16 · 20 · 22 (y 30/48 para cifras grandes). **Sin medios
  píxeles.** *Había 18 tamaños; los de «.5» sobraban.*
- Color sólo con las variables (`--good`, `--warn`, `--bad`, `--brand`, `--text-muted`). Los
  hexadecimales sueltos son una excepción que se explica.
- **Estilos en línea:** son 1.800 y no se toca el resto de golpe, pero lo nuevo usa clases. Ya
  existen `.crediscope-cifra` (números en tablas), `.crediscope-solo-lectores`, `.crediscope-muted`,
  `.crediscope-kpi-*`, `.crediscope-barrapct-*`, `.crediscope-aviso-error*`. Si un estilo en línea
  se repite más de tres veces, es una clase.

## 8. Versiones, datos personales y registro

- Una versión (`marco-v28`, `estructura-v13`) puede ir en un `title`, en una línea secundaria o en
  «Detalle técnico»; no en una tarjeta principal ni en un sello.
- Ningún dato de una persona real va a un commit, documento, captura compartida ni al chat: se cita
  `c-xxxxxxxx` (8 primeros caracteres de `clients.id`). Las cédulas de una tabla sin nombre igual
  identifican.
- Toda exportación y cada apertura de expediente quedan en `audit_log`: una pantalla nueva que saca
  datos de la persona llama a `registrarEvento()`.

## 9. ¿Dice de quién habla?

El negocio ordenó el producto alrededor de la persona (`docs/modelo-de-la-persona.md`).
Una pantalla nueva o cambiada se revisa contra eso:

- Dice **de qué entidad** habla: una persona, una solicitud, un score, un crédito, una
  dirección, un empleo, una referencia o un documento. Un conteo dice qué cuenta:
  «2.572 personas», no «2.572 clientes».
- **«Cliente» sólo con un crédito** (Cliente activo, Cliente cerrado). El resto es «persona».
- Si muestra un **estado**, es el de la persona o el del análisis, y lo dice. No hay una
  columna «Estado» sin apellido.
- Los estados de la persona se escriben exactos: Prospecto, Solicitante (por renombrar),
  Preaprobado, Aprobado, Cliente activo, Cliente cerrado.
- **Score**, no «puntaje». Y no se mezcla el score de CrediScope con el de Aval en la
  misma etiqueta.
- La **recomendación del modelo** (Aprobar / Revisar / Negar) y la **decisión de la
  institución** (Aprobado / Rechazado) son dos cosas y no comparten columna.

## 10. Antes de dar la pantalla por buena

- [ ] `node scripts/revisar-textos.mjs` en cero errores y cero avisos (o la excepción marcada).
- [ ] Una pantalla que pide varias cosas pesadas no depende de la más lenta: lo liviano decide si
      se dibuja y lo pesado llega después (Laboratorio › Inicio, 2026-10-12).
- [ ] El verificador, sin hallazgos que no sean explicables (los `version-interna` de una tabla de
      costos son legítimos).
- [ ] Capturada a 1280, y a 768/414 si tiene tablas.
- [ ] Estado vacío, de carga y de error vistos (apagar la red del navegador o forzar un id inexistente).
- [ ] Los números que repite otra pantalla, comparados con ella.
- [ ] `npm run lint` y `npm run build`.
- [ ] Dicho en el informe **qué se vio y qué no**.
