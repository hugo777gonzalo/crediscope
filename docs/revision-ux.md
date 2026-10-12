# Revisión de UX — 2026-10-10

Revisión completa de la interfaz con la mirada de una aplicación bancaria de
crédito: cada pantalla del menú recorrida con la sesión de QA, todos los textos
leídos con un analizador de JSX, y las cifras de una sección contrastadas con las
de otra. Lo ejecutable se corrigió; lo que es del negocio se propone abajo con
opciones. Para repetirla cuando cambie una pantalla: la habilidad
`.claude/skills/revision-ux/` (`SKILL.md`).

## 1. Cómo se hizo y qué NO se vio

- **Recorrido en el navegador** con la sesión de QA (admin): bandeja, expediente,
  Fuentes de Ingreso (4), Reportes (2), Consultas por lote (2 de 3), Costos (7),
  Laboratorio (inicio y prueba retrospectiva), Configuración (5), Explorador, y las
  cuatro pantallas del cliente. A 1280 px; Bandeja a 768 y 414; desborde horizontal a
  414 px en 10 rutas.
- **Control de textos con el analizador de Vite** (no un grep: el primer grep devolvió
  569 coincidencias y casi ninguna era un texto de pantalla). 4.189 textos en 136
  archivos. `node scripts/revisar-textos.mjs`.
- **Verificador dentro de la página** (`verificar-pantalla.js`): formatos, códigos
  internos, estados en blanco, campos sin etiqueta, contraste, desborde.
- **No se vio** (dicho en vez de supuesto): las pestañas internas del Laboratorio salvo
  Resumen de la prueba retrospectiva; el Laboratorio › Inicio dio `statement timeout`
  de la base y no cargó; el detalle de un lote no se abrió y Cargar un lote sólo se leyó
  como texto; las cuatro pantallas del cliente se revisaron por texto y con capturas
  parciales; y **las últimas correcciones de esta sesión (el componente `Aviso`, Costos con
  los avisos nuevos, el menú acordeón y la fila de opciones para pantallas angostas) se
  verificaron con lint, build, las 62 pruebas de `probar-formatos.mjs` y lectura del código,
  pero la sesión de QA caducó antes de repasarlas en pantalla**: queda por repasar a 1280,
  768 y 414 px apenas se ingrese de nuevo.

## 2. Lo que estaba roto y se corrigió

### Funcional

| # | Defecto | Efecto | Corrección |
|---|---|---|---|
| 1 | Abrir un enlace directo o recargar mandaba **siempre a «/»** | El expediente, que tiene ruta propia «para compartirse y sobrevivir a una recarga», no sobrevivía a nada | `App.jsx` espera la sesión y devuelve a la persona a donde iba (`destinoDeIngreso.js`), también tras caducar |
| 2 | Cada pantalla de administración pedía el perfil de nuevo y **quedaba en blanco** de 4 a 10 s | Parecía rota | Perfil compartido (`useProfile.js`): se pide una vez; la guardia muestra «Cargando...» |
| 3 | El **menú podía aparecer sin las secciones de administración** y sumarlas a los segundos | Salto de diseño | `App.jsx` espera el perfil antes de dibujar el menú |
| 4 | Todo el **Laboratorio** decía «CrediScope» en la barra superior; quedaba una entrada «Retroalimentación» | Sin ubicación | Menú y barra salen de una sola lista (`navegacion.js`): «Laboratorio › Prueba retrospectiva» |
| 5 | **«Inicio» y «Evaluación Crediticia»** quedaban resaltados a la vez en «/»; «Inicio» y «Buscar Cliente» eran la misma dirección | Menú ambiguo | Una sola sección activa; se sacó el duplicado |
| 6 | `/laboratorio/caso` sin parámetros pedía a la base el corte «null» y mostraba *invalid input syntax for type uuid* | Error crudo | Explica cómo llegar a un caso |
| 7 | Una excepción al dibujar una pestaña dejaba **toda la página en blanco**, menú incluido | Sin salida | `LimiteDeError`: cae sólo esa pantalla, con «Recargar» e «Ir al inicio» |
| 8 | Una dirección inexistente dibujaba el menú y un cuadro vacío | Sin explicación | «No encontramos esa página» |
| 9 | La clase `crediscope-eje-valor` se usaba sin regla CSS | Sin estilo | Definida |
| 10 | Todo viajaba en **un solo archivo de 1,7 MB (496 KB comprimido)** | Ingreso lento en una sucursal | Cada pantalla se pide al abrirla: el principal queda en **476 KB (139 KB comprimido)**; la lectura de Excel (485 KB) sólo se baja cuando se usa. Se mide con el `.env` de la aplicación: sin las variables de Supabase el compilador deja afuera el cliente y el principal sale en 273 KB, que no es lo que se publica. Si se publica una versión mientras alguien tiene la aplicación abierta, la pantalla que pide ya no existe: `LimiteDeError` lo dice («Hay una versión nueva») y recarga |
| 11 | **Bajo 860 px el CSS escondía los submenús** y los botones de grupo abrían algo que nunca se veía | En una tablet no había cómo llegar a la Bandeja, a Costos ni al Laboratorio | Una segunda fila con las opciones de la sección abierta; los íconos llevan nombre accesible |
| 12 | «Cerrar sesión» recordaba la última pantalla | Quien ingresara después en la misma computadora caía en el último expediente de la persona anterior | Salir a propósito no recuerda el destino; sí se recuerda al caducar la sesión o al abrir un enlace sin haber ingresado |
| 13 | La barra decía «Detalle del lote» en la pantalla de cargar un archivo | Título equivocado (lo detectó la prueba de navegación nueva) | `/lotes/nuevo` ya no cae en el patrón del detalle |

### Cifras que no cerraban

| Dónde | Qué pasaba | Ahora |
|---|---|---|
| Bandeja, franja de totales | «En la búsqueda» 2.812 contra 2.789 de la suma de las tarjetas: faltaban 23 personas (3 con análisis «No se completó» y 20 con análisis antiguos sin recomendación) | Dos tarjetas más que aparecen sólo si hay casos: **suma exacta** |
| Costos, «En qué se gastó» | La barra medía el % de *llamadas* (96%) y no de dinero (79%), bajo un título que habla de gasto | La barra es el % del costo |
| Reportes, «Actividad por analista» | «100% (5.937)» y «45% (2.642)»: porcentajes contra el mayor, que suman más de 100 | Sólo la cantidad |
| Reportes, «Consultas este mes» | «-57% vs. mes anterior» el día 9: medio mes contra uno entero | «En lo que va del mes: 55% menos que todo el mes anterior» |
| Reportes › Perfil laboral | Otra clasificación (independientes, dependientes, jubilados, pensionistas) con cifras distintas a las del Panorama **bajo el mismo nombre** | Una sola, en Fuentes de Ingreso; Reportes la enlaza |
| Panorama | «0% (12)» para 12 de 2.812 | «<1%» |

### Textos y términos

| Antes | Ahora | Dónde |
|---|---|---|
| «asalariado» | dependiente | Reglas de clasificación (2) |
| «poner piso a la tarifa» | fijar el mínimo de la tarifa | Costo por consulta |
| «provisionales e indeterminados», «confirmada», «indeterminado» | Por confirmar / Sin determinar / Confirmado por un tercero | Panorama y Reglas (10 textos con los estados viejos) |
| «Fuente de ingreso» (sello y columna que muestran el segmento) | **Segmento** | Bandeja, Expediente, ficha «Lo que sí hay» |
| «Fuentes de ingreso» / «Fuentes de Ingreso» | «Fuentes de Ingreso» | menú, pestañas, títulos |
| «Default por mes», «definición de default» | Impago por mes, definición de impago | Laboratorio |
| «Ingesta», «(LLM)», «error del LLM» | consulta a la fuente, «Análisis con IA», «error del modelo» | Reportes, Explorador, Avisos |
| «Backtest», «Informe de retroalimentación» | Prueba retrospectiva; historial marcado «(retirado)» | Costos |
| «Calibración del criterio» (agrupa vigía, lotes y comparaciones) | Laboratorio y vigía del servicio | Costos |
| Procesos crudos en una tabla (`vigia`, `analisis-en-lote`...) | nombres legibles | Costos › Panorama |
| «1 análisis corridos», «cliente(s)», «llamada(s)», «hallazgo(s)», «día(s)» | `plural()`: «1 análisis hecho», «2.572 clientes» | 14 sitios |
| «Ver **como** quedó ese día» | Ver **cómo** quedó ese día | Expediente |
| «Trajeron datos 18 fuentes, 34 contestaron que no hay nada» | «De las fuentes consultadas: 19 trajeron datos, 33 dijeron que no hay registros de esta persona» | Expediente |
| `expediente.vista` (código) en la tabla de auditoría | «Abrió el expediente» (+ 4 exportaciones) | Expediente |
| «el corte 2026-08», «$1084», «$491.22» en textos guardados | «la información IESS de Ago 2026», «$1.084», «$491,22» | `humanizarTexto()` en 8 pantallas |
| «Estuvo sin funcionar 9049 minutos» | «6 d 6 h» | Avisos |
| «Pasá el **mouse**…» | cursor | Tarifas |
| `marco-v28`, `estructura-v13` en la tarjeta «Nivel de riesgo» | en un `title`; la tarjeta dice «Según el Análisis con IA» | Expediente |
| «El corte del IESS que usó…» | «La información IESS que usó…» | Expediente |
| Capacidad: «Sin fuente… todavía no hay una fuente de ingresos confiable» | «Sin calcular: faltan el monto y el plazo del crédito solicitado» | Indicadores del análisis (el Expediente ya decía la razón de hoy; las dos pantallas decían cosas distintas sobre el mismo faltante) |
| «Consultar desde la app desplegada todavía no funciona… Queda pendiente resolver la salida (proxy o servidor en Ecuador)» | «…Aval sólo acepta conexiones desde Ecuador y nuestro servidor está fuera del país» | Aval (se sacó el plan de trabajo) |
| «Descarga una fila por solicitud… el score, la acción recomendada» · «Fecha inicio / Fecha fin» | «Un archivo con una fila por solicitud… el puntaje, la recomendación» · «Desde / Hasta» | Descargas |
| «solo» y «sólo» (40 contra 13) | «sólo» (adverbio) en todas | 13 textos; el adjetivo («un solo incidente») sin tilde |

**Texto del equipo de desarrollo en pantallas de analistas** (se reescribió en
lenguaje de caso): «eso llega con la solicitud como entidad», «la solicitud como entidad
no existe todavía», «decisión pendiente, porque toca permisos», y toda una tarjeta de
Fallas e incidentes («Qué falta para enterarse a tiempo») que se contradecía a sí misma
(«Listo: se avisa…» y más abajo «Nada de esto está construido todavía»).

### Formatos

- Una sola fuente: `src/lib/formatos.js`. «2.812» (también 4 cifras; el Panorama y Reportes
  decían «2812»), «37,0 s» (decía «37.0 s»), «4,3¢» (decía «4.3¢»), «$12,14», «<1%».
  Había ocho `Intl.NumberFormat` copiados y números interpolados sin formato.
- Las fechas de Costos, en `dd/mm/aaaa` como el resto (estaban en ISO).

### Estados de una pantalla

- **Cargando** unificado (`ui/Cargando`, con `role="status"`): 67 usos.
- **Error** unificado (`ui/AvisoDeError`): traduce el error técnico, lo guarda en «Detalle
  técnico» y ofrece «Reintentar» si se arregla esperando. Se vio funcionando con un
  `statement timeout` real del Laboratorio. Se mostraban sin traducir, entre otros:
  *column bandeja_solicitudes.es_sintetico does not exist*, un JSON entero de la API del
  modelo con su identificador de pedido, *canceling statement due to statement timeout*.
- **Cuadros de aviso** unificados (`ui/Aviso`: peligro, advertencia, información, éxito,
  sintético): había una veintena hechos a mano.

### Pantallas desactualizadas

| Pantalla | Estaba | Ahora |
|---|---|---|
| Reglas de clasificación | Documentaba `fuentes-v9` y se avisaba a sí misma («Alguna regla cambió y todavía no está escrita acá») | `fuentes-v10`: el estado abreviado del establecimiento («ABI») cuenta como abierto; estados y meses con los nombres vigentes |
| Corridas masivas | Advertía de «correr un backtest» y del «informe de retroalimentación» | Análisis en lote por la API de lotes, con la regla de autorización del negocio |
| Fallas e incidentes | Bitácora de lo que faltaba construir | Cómo se vigila el servicio, en presente |
| Reportes | «Explorador por eje» (los 9 ejes se retiraron en la 078) | «Explorador por grupo del Perfil del Cliente» |
| `docs/laboratorio-pantallas.md` | «Ninguna pantalla se vio con sesión de admin» y «Criterio vigente» en el menú | Puesta al día |

### Redundancias

| Dónde | Se repetía | Ahora |
|---|---|---|
| Expediente, cabecera | Botones «Perfil del Cliente» y «Análisis con IA» = dos secciones del menú de al lado | Son acciones: «Actualizar el perfil» y «Correr el análisis» / «Volver a analizar» |
| Expediente, primera pantalla | Segmento en el sello, en «Evidencia del ingreso» y en «Con qué paga» | Una vez arriba; la tarjeta dice la información IESS del mes |
| Laboratorio | Dos carteles «sintético» uno debajo del otro | Uno |
| Código | `Kpi` ×8, `Barra` ×4, caja de error ×39 | `ui/Kpi`, `ui/Barra`, `ui/AvisoDeError` |
| Menú | «Inicio» = «Buscar Cliente» | Una entrada |
| Barra superior y título de página | La barra decía a veces la sección, a veces la página | «Sección › Página» |

### Visual y responsive

- **Escala tipográfica**: de 18 tamaños a 10 (se eliminaron los de medio píxel: 160 sustituciones);
  el menor es 11 px. Los textos del gráfico de consultas por mes se achicaban a 6 px.
- **Franja de totales de la bandeja**: con una tarjeta más se partía en dos filas con un bloque
  lila vacío; ahora las tarjetas se reparten el ancho.
- **Menú acordeón**: una sección abierta a la vez (con Solicitudes y Costos abiertos, el
  menú empujaba el resto fuera de la pantalla). Las opciones que necesitan un cliente avisan
  «Primero buscá un cliente en Inicio» cuando todavía no hay uno.
- **A 414 px** el Panorama, Costos y el Laboratorio se salían de la pantalla; ahora la
  tabla se desliza dentro de su tarjeta y el selector de corte se acota.
- Foco visible (`:focus-visible`) en todo lo que se toca; sobre el menú oscuro, blanco.

### Accesibilidad

- Un `<h1>` por pantalla (no había ninguno: cada título es un `<h2>`).
- Etiqueta en los buscadores de cédula, el selector de Reportes y el buscador de la bandeja.
- `aria-label` en los íconos de acceso de la bandeja y en el botón de buscar; `aria-hidden` en los decorativos; `aria-current` en el menú.
- Título de cada pestaña del navegador (el expediente se abre en varias a propósito y todas
  decían «CrediScope — Análisis crediticio»).

## 3. Para decidir (el negocio)

No se aplicaron: son nombres y decisiones de producto. Cada una trae mi recomendación.

### Nombres

| Hoy | Opciones | Recomendación |
|---|---|---|
| Menú «Consultas por lote › **Lotes corridos**» | «Lotes consultados» · «Historial de lotes» · dejar | «Lotes consultados»: «corridos» es jerga de ejecución; el título de la pantalla ya dice «Consultas por lote» |
| «**Explorador de Fuentes**» (Configuración) | «Explorador de la fuente de datos» · «Consulta directa a Novadata» | La primera: «fuentes» ya significa de dónde viene el ingreso en otro módulo |
| «**Inteligencia de Negocios**» (Reportes, plural) y «Laboratorio de Inteligencia de Negocio» (CLAUDE.md, singular) | (a) Reportes sigue y el módulo se llama «Laboratorio de Riesgo» · (b) unificar en plural · (c) Reportes pasa a «Tablero de gerencia» | (a): no se parecen entre sí |
| «**Historial por cédula**» | Retirarlo (el Expediente trae la misma línea de tiempo) · renombrar «Consultas de una cédula» | Retirarlo y que «Buscar cliente» abra el Expediente |
| «Negación» (dictamen en la tarjeta grande) | «Negación» · «Negativa» · «Rechazo» | Dejar: el negocio escribió «Negar» y la decisión de usar el sustantivo está documentada |
| «**cliente**» y «**persona**» (99 contra 71) | (a) «cliente» en el trabajo diario y «persona» en poblaciones · (b) todo «cliente» · (c) todo «persona» | (a), ya documentada en `terminologia.md` |
| «**Puntaje**» y «**score**» | (a) «Puntaje» en pantalla, «score» en la conversación · (b) «Score» siempre | (a) |

### Diseño y producto

1. **Inicio como pantalla de trabajo.** Hoy «Inicio» es una caja de búsqueda y el resto de la
   pantalla queda vacío. Propuesta: la caja de búsqueda y debajo «Lo que me espera»
   (la bandeja filtrada a *Sin analizar*, *No se completó*, *La consulta falló*) y un acceso
   a los últimos expedientes abiertos. Necesita la solicitud como entidad para ser completa; la
   mitad se puede hacer ya.
2. **Un solo camino a un cliente.** El Expediente ya reúne resumen, ingresos, perfil, análisis,
   línea de tiempo y auditoría. Falta **Aval**. Propuesta: sumar Aval al Expediente y dejar el
   grupo «Evaluación Crediticia» sólo con la búsqueda; Perfil / Análisis / Fuentes de Ingreso por
   separado pasan a ser acciones. Mientras tanto, los cuatro enlaces del grupo sin cliente
   previo llevan a la búsqueda.
3. **Empleos vigentes y Fuentes detectadas** (Expediente › Con qué paga) listan el mismo empleador
   con el mismo monto en dos tablas. Vienen de dos registros distintos (el laboral y el IESS) y
   pueden diferir. Propuesta: una tabla con una columna «Registro laboral» y otra «Reportado al IESS».
4. **Bandeja: tres íconos de acceso por fila + «Abrir»** repiten las pestañas del Expediente.
   Propuesta: sólo «Abrir» y, con un clic más, el menú de accesos.
5. **Laboratorio › Inicio** pide ocho cosas pesadas en una sola llamada: si una se pasa del
   tiempo, la pantalla no muestra nada. Cargar por bloques (`Promise.allSettled`) y mostrar
   en cada tarjeta lo suyo.
6. **Auditoría con nombres.** Los demás usuarios salen como «Otro usuario» porque cada quien sólo
   lee su propia ficha. Nombrarlos exige exponer una vista con los nombres: decisión de permisos.
7. **Skeletons** en lugar de «Cargando...» en las tres pantallas más lentas (Bandeja,
   Expediente, Panorama: de 5 a 10 s en desarrollo).
8. **El orden de los nombres** que trae la fuente es inconsistente (a unas personas les llega
   «Apellidos Nombres» y a otras «Nombre Apellido») y se muestra tal cual.
9. **Estilos en línea**: quedan 1.761 en 110 archivos. Lo nuevo usa clases; migrar el resto de
   a poco cuando se toque cada pantalla.

## 4. Hallazgos que no son de la interfaz

- **Desfase entre el código y la base (otra sesión).** Mientras la migración 118 (personas
  sintéticas fuera de los totales) no estaba aplicada, la bandeja y «Clientes por segmento» mostraban
  *column bandeja_solicitudes.es_sintetico does not exist*: el navegador pedía una columna que la
  base no tenía. Regla 8 de CLAUDE.md (migrar, después desplegar). La 118 ya estaba aplicada,
  pero **no filtraba `bandeja_conteos`** (lo confirmó la sesión de la auditoría midiendo la
  base el 2026-10-10): esa función lee la vista `bandeja_solicitudes`, que trae a las 240
  sintéticas, y la franja de la bandeja decía 2.812 contra 2.572 de la lista y de Reportes (la
  mediana del ingreso de la franja también las contaba). **Resuelto el mismo día** con la
  migración 120 (PR #4, `2a68911`), que agrega `not b.es_sintetico` y compara la franja con
  la lista (se revierte si no coinciden): medido en la base, la franja da 2.572 y coinciden
  revisar (151), aprobar (50), sin analizar (2.335) y con bloqueo (73). No hizo falta código
  nuevo en la pantalla. Falta sólo verlo en el navegador cuando se ingrese de nuevo.
- **`statement timeout`** al abrir Laboratorio › Inicio: una función `lab_*` supera el límite.
  El aviso ya trae «Reintentar»; la causa está en la base.
- **Vite sirvió un módulo viejo** tras varias ediciones seguidas del mismo archivo
  (`Link is not defined` con el import presente). `touch` del archivo lo arregla; el build compila
  bien. Anotado en `recorrido-qa.md`.
- **Tiempos de carga en desarrollo** de 5 a 10 s en la bandeja, el expediente y el Panorama.
  Se midió el servidor de desarrollo, que sirve cientos de módulos sin empaquetar: la medida real
  se toma con `npm run build && npm run preview`.

## 5. Para repetirla

```bash
node scripts/revisar-textos.mjs                 # 2 s, sin navegador
node scripts/revisar-textos.mjs --glosario      # las reglas
node scripts/probar-formatos.mjs                # 62 casos de formatos, errores y navegación
```

Los dos pasos ya están sumados al control `pantalla` de `.github/workflows/controles.yml`
(corren con `npm ci`, sin red ni base) para que un texto con una palabra retirada no entre
por un PR, y `scripts/lib/` entra al `node --check` del control `guiones`. Quedan **sin
commitear**, como todo lo demás: toman efecto cuando se fusione el PR. Se acordó con la sesión
de la auditoría externa que van en este PR (si los sumara ella antes, `pantalla` fallaría en
todos los demás porque los guiones todavía no están en `main`). No se cambió `name: pantalla`:
es el nombre que exige la regla de la rama.

Y en el navegador de QA, el verificador (ver `.claude/skills/revision-ux/recorrido-qa.md`).
Cuando se descubra un defecto nuevo que una regla pueda detectar, se agrega la regla.

## 6. Qué se tocó

Archivos nuevos: `src/lib/{formatos,mensajesDeError,navegacion,destinoDeIngreso}.js`,
`src/components/ui/{Kpi,Barra,Cargando,Aviso,AvisoDeError,LimiteDeError}.jsx`,
`src/pages/NoEncontrada.jsx`, `scripts/revisar-textos.mjs`, `scripts/probar-formatos.mjs`, `scripts/lib/textos-de-pantalla.mjs`,
`.claude/skills/revision-ux/` (6 archivos), este documento.

Reescritos: `App.jsx`, `MenuLateral.jsx`, `useProfile.js`. Con cambios de texto, formato o
piezas compartidas: unos 90 archivos (la mayoría, una línea: la sustitución de
`Cargando...` y de la caja de error). `src/index.css` pasó a finales de línea LF como el resto del código.
