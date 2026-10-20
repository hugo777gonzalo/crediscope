---
name: revision-ux
description: Revisión de UX de las pantallas de CrediScope (calificación crediticia en Ecuador) cada vez que se crea o cambia una pantalla, un texto, un nombre del menú o una tabla. Busca términos que el negocio retiró, números y fechas mal escritos, estados vacíos/cargando/error, redundancias, accesibilidad, responsive y números que no coinciden entre secciones; corrige lo seguro y propone lo demás. Usala al terminar un cambio visible, antes de commitear, o cuando pidan "revisar las pantallas", "revisar los textos" o "ajustar la UX".
---

# Revisión de UX de CrediScope

Las pantallas las leen analistas de crédito que no participaron en el desarrollo.
Una pantalla está bien cuando alguien que nunca vio el diseño entiende qué dice,
puede confiar en la cifra y sabe qué hacer después. Esta habilidad es el
procedimiento para comprobarlo y corregirlo **cada vez que se toca la interfaz**.

Nació de la revisión completa del 2026-10-10 (`docs/revision-ux.md`: qué se
encontró, qué se corrigió y qué quedó para decidir). Todo lo que acá figura como
regla salió de un defecto real de esa revisión.

## Cuándo se usa

- Se creó o cambió una pantalla, un texto, un nombre del menú, una tabla o un formato.
- Se agregó un campo, un estado o una versión (marco, estructura, fuentes) que se ve en pantalla.
- Alguien pide revisar, pulir, unificar o "mejorar" la interfaz.

No reemplaza `npm run lint` ni `npm run build`: **no prueban una pantalla**
(ver `feedback-verificar-de-verdad`). Se corren igual, y además esto.

## El flujo (6 pasos)

1. **Alcance.** `git diff --stat -- src` dice qué pantallas cambiaron. Para cada
   una, leé su entrada en `mapa-de-pantallas.md` (quién la ve, de dónde sale su
   texto, con qué otras se tiene que parecer).
2. **Control de textos, sin navegador** (siempre, tarda 2 s):
   ```bash
   node scripts/revisar-textos.mjs                 # todo src/
   node scripts/revisar-textos.mjs --archivo=src/pages/X.jsx
   node scripts/revisar-textos.mjs --glosario      # las reglas y su porqué
   node scripts/probar-formatos.mjs                # formatos, errores y navegación (62 casos)
   ```
   Corta con los **errores** (palabras que el negocio retiró) y lista los **avisos**
   (casi siempre mal, con excepciones). Una excepción justificada se marca en el
   código: `// revisar-textos: permitir <regla> -- por qué`. Los dos guiones corren
   también en cada PR (control `pantalla`): un error de textos o de formatos lo frena.
3. **Recorrido en el navegador con la sesión de QA** (`recorrido-qa.md`).
   Cargá el verificador y corrélo en cada pantalla tocada:
   ```js
   // javascript_tool, una vez por carga de página
   const r = await fetch('/.claude/skills/revision-ux/verificar-pantalla.js'); (0, eval)(await r.text());
   JSON.stringify(await __revisionUx.recorrer(["/costos", "/solicitudes"]))   // o __revisionUx.verificar() en la actual
   ```
   Mira lo que el control estático no puede: números sin separador de miles
   ("2812"), decimales con punto, meses en ISO ("2026-08"), códigos internos en
   pantalla, pantalla en blanco, campos sin etiqueta, contraste, texto chico,
   desborde horizontal.
4. **Mirar la pantalla** (no sólo el texto): `resize_window` a 1280x800 y capturá; repetí a
   768 y 414 si la pantalla es nueva o tiene tablas. Criterios en `criterios.md`.
   **Leela de arriba abajo tachando cada cifra que ya apareció**: un indicador y el total de
   la tabla de abajo, lo plegado y lo de arriba, «este mes» y «desde el inicio» con un solo
   mes. La revisión de Equifax del 2026-10-18 encontró la deuda cinco veces en una pantalla
   que había pasado el verificador sin hallazgos; desde ese día el verificador marca
   `cifra-repetida` (tres lugares o más), pero dos repeticiones las ve sólo quien lee.
   Si un dato no está en la base (un segundo mes, un fallo), probalo interceptando la
   respuesta en la página (`recorrido-qa.md`).
5. **Corregir.** Lo que es regla (término retirado, formato, pieza compartida) se
   corrige sin preguntar. **Un nombre nuevo o distinto del que el negocio eligió
   se propone con 2-3 opciones**: ver `terminologia.md`.
6. **Cerrar.** `npm run lint`, `npm run build`, el control de textos en cero errores y
   una captura o lectura del DOM de cada pantalla tocada. Decir **qué se vio y qué no**
   (no decir "verificado" por haber compilado). Los hallazgos que quedan abiertos van
   a `docs/pendientes.md`.

## Reglas que no se negocian

- **Todo en castellano de Ecuador**, con voseo («ingresá», «podés»). Sólo `score` y
  `colateral` son del negocio. Nada de `piso`, `asalariado`, `default`, `backtest`,
  `LLM`, `ingesta`, `dashboard`. Glosario completo y porqué: `terminologia.md`.
- **Números, fechas y moneda sólo con `src/lib/formatos.js` y `src/lib/fechas.js`.**
  Nunca `${n}` ni `.toFixed()` en un texto: "2.812", "37,0 s", "$1.784", "15/09/2026 17:26".
- **Piezas compartidas antes que copias**: `src/components/ui/` (`Kpi`, `Barra`,
  `Cargando`, `Aviso`, `AvisoDeError`, `LimiteDeError`). Había ocho `Kpi`, treinta y
  nueve cajas de error y una veintena de cuadros de aviso escritos a mano. Un error se
  muestra con `AvisoDeError`, jamás con `error.message` crudo.
- **Los nombres del menú y de la barra salen de `src/lib/navegacion.js`.** Un nombre
  se cambia en un solo lugar.
- **La persona es la entidad; «cliente» sólo con un crédito.** Score, no «puntaje». Los
  estados de la persona y lo que cuelga de ella tienen nombres fijos: `terminologia.md`
  y `docs/modelo-de-la-persona.md`.
- **Tres estados siempre**: cargando (`Cargando`), vacío (qué falta y qué hacer) y
  error (`AvisoDeError`, con "Reintentar" si se arregla esperando).
- **Los huecos se dicen**: un dato que no se midió es "No medido", nunca `0` ni vacío.
- **Cada cifra, una vez por pantalla.** Indicadores arriba = sin fila de total abajo; un
  desglose de un solo elemento no lleva total; lo plegado no repite lo de arriba; un vacío
  se dice en una celda, no en cinco ceros. Casos y porqué: `criterios.md`, sección 4.
- **Lo que manda un proveedor se adapta al leerlo**, no se guarda reescrito: mayúsculas como
  oración con las siglas a salvo, pares «a / b» en una tabla, y una ayuda cuando su escala
  no se conoce (`criterios.md`, 4 bis).
- **Sin datos de personas reales en pantallas capturadas, commits, chat ni documentos.**
  El verificador enmascara los números de 7 dígitos o más; un caso real se cita `c-xxxxxxxx`.
- **No escribir contraseñas.** Si la sesión de QA caducó, se le pide a la persona que
  ingrese en el panel de vista previa.

## Cuando el negocio cambia un nombre

1. Anotar la decisión en `terminologia.md` (qué era, qué es, quién y cuándo).
2. `node scripts/renombrar-textos.mjs --de="..." --a="..."` **en seco**: cambia sólo los textos
   de pantalla (nunca una variable ni una columna) y lista cada cambio. Leerlo línea por línea;
   si el cambio es de género o número («el cliente» → «la persona»), se edita a mano.
3. `--aplicar` y, si es una columna de datos que se llama igual (la plantilla que llenan las
   instituciones), una marca `// revisar-textos: permitir <regla> -- por qué`.
4. Una regla nueva en `scripts/revisar-textos.mjs` para que el nombre viejo no vuelva, y una
   prueba en `scripts/probar-formatos.mjs` si cambia `navegacion.js`.
5. Mirarlo en pantalla (menú, barra superior, título de la pestaña) y comprobar que ninguna
   ruta guardada se rompe: el nombre cambia, la dirección se queda.

## Qué hacer cuando se descubre algo nuevo

Si un defecto se puede detectar con una regla, **se agrega la regla**:
- sobre texto fijo → `scripts/revisar-textos.mjs` (arreglo `REGLAS`);
- sobre lo que se dibuja con datos → `verificar-pantalla.js` (`REGLAS_TEXTO`, `TERMINOS_PROHIBIDOS`);
- una decisión de nombres del negocio → `terminologia.md` y `CLAUDE.md`.

Una revisión que depende de que alguien se acuerde se vuelve a romper.

## Archivos de esta habilidad

| Archivo | Para qué |
|---|---|
| `terminologia.md` | Glosario del negocio: antes/ahora, quién lo decidió y por qué |
| `mapa-de-pantallas.md` | Cada ruta: qué hace, quién la ve, de dónde sale su texto |
| `criterios.md` | Qué mirar en una pantalla de crédito, y los patrones/antipatrones hallados |
| `recorrido-qa.md` | Cómo correr la sesión de QA sin tropezar (puerto, sesión, tamaño de ventana) |
| `verificar-pantalla.js` | Verificador que corre dentro de la página |
| `../../../scripts/revisar-textos.mjs` | Control de textos (analiza el JSX, no hace grep) |
| `../../../scripts/renombrar-textos.mjs` | Renombra una palabra sólo en los textos de pantalla (en seco por defecto) |
| `../../../docs/modelo-de-la-persona.md` | La persona, sus estados y lo que cuelga de ella: el vocabulario del producto |
| `../../../scripts/probar-formatos.mjs` | Pruebas de `formatos.js`, `mensajesDeError.js`, `navegacion.js` y `destinoDeIngreso.js` |
| `../../../scripts/lib/textos-de-pantalla.mjs` | Extractor de todo lo que un analista lee |
