# Terminología de CrediScope

Qué se dice en pantalla, qué ya no se dice y por qué. La fuente de las decisiones
es el negocio (CLAUDE.md, «Cómo se escribe»); acá está lo que hay que tener a mano
al revisar una pantalla. Las reglas que se pueden comprobar con una máquina viven
en `scripts/revisar-textos.mjs` (`--glosario` las lista).

**Regla de oro**: un nombre que eligió el negocio no se cambia por gusto. Un nombre
que no existe todavía, o dos nombres para lo mismo, se resuelven proponiendo 2-3
opciones a la persona dueña del producto, no eligiendo.

## 1. Cómo se escribe

| Tema | Regla | Por qué |
|---|---|---|
| Idioma | Castellano de Ecuador (cédula, IESS, SRI, RUC). Sólo `score` y `colateral` en inglés. | Pedido del negocio, muchas veces: se hizo una ronda entera de renombres (marco-v8). |
| Persona a la que se le habla | Voseo: «ingresá», «podés», «pedísela». Ni «tú» ni «usted». | Está en CLAUDE.md. Hoy sólo hay 5 textos con imperativo: el resto va en tercera persona, lo que ya es neutro. |
| Puntos suspensivos | Tres puntos: `Cargando...` | 67 textos ya lo hacen. El carácter `…` mezcla. |
| Plurales | `plural(n, "persona")` de `formatos.js`. Nunca `persona(s)`. | El «(s)» es no decidir; salía «1 análisis corridos». |
| Mayúsculas | **Nombres comerciales** en Title Case (lista abajo). Todo lo demás, como una oración: sólo la primera palabra. | El negocio capitaliza sus nombres («Información IESS»). El resto no es un nombre. |
| Tildes | Interrogativos con tilde: «Ver **cómo** quedó ese día». | Faltaba y se leía como un error de descuido en la pantalla central. |
| Textos técnicos | Nunca en la tarjeta principal: versiones (`marco-v28`), códigos (`expediente.vista`), identificadores (`canal_aviso`), JSON del proveedor. Van en `title`, en «Detalle técnico» plegado, o no van. | Pedido del negocio sobre la pestaña Fuentes de ingreso (2026-09-26): «los datos de versión no van en la tarjeta principal». |
| Desarrollo en pantalla | Una pantalla no cuenta qué falta construir («eso llega con la solicitud como entidad», «decisión pendiente, porque toca permisos»). Dice **qué** no hay y **qué** hacer. | El analista lee un hecho sobre su caso, no el plan del equipo. Eso va a `docs/pendientes.md`. |

### Nombres comerciales (Title Case, tal cual)

Evaluación Crediticia · Perfil de la Persona · Análisis con IA · Fuentes de Ingreso ·
Monitoreo · Información IESS · Documentos de Confirmación de Ingresos · Condiciones de
la Segmentación · Ingreso Mínimo SBU · Establecimientos Activos (SRI) · Consultas por
lote · Score.

El resto de pantallas, pestañas y botones, en oración: «Personas por segmento»,
«Lotes consultados», «Costo por consulta», «Reglas de clasificación».

## 2. Lo que se retiró (antes → ahora)

| Antes | Ahora | Quién y cuándo |
|---|---|---|
| piso / piso de ingreso | **ingreso reportado al IESS**; y **Ingreso Mínimo SBU** si el monto es el SBU del año o está a ±5% (`esIngresoMinimoSbu()`) | Negocio, 2026-09-25: «en Ecuador no se usa el término piso». Tampoco para una tarifa («poner piso a la tarifa» → «fijar el mínimo»). |
| asalariado | **dependiente** (relación de dependencia) | Negocio, 2026-09-25 |
| Confirmada / Provisional / Indeterminada | **Confirmado por un tercero / Por confirmar / Sin determinar** | Negocio, 2026-09-26. Quedaban «provisionales e indeterminados» en el Panorama y en las Reglas. |
| Reportada por un tercero | Empleador privado · público · diplomático · externo (SÓLO organismos internacionales) · Otros empleadores (doméstico, agrícola, código no reconocido) | Negocio, 2026-09-26 |
| Autodeclarada | Empresa propia (patrono o RUC activo) · Afiliación voluntaria (sin negocio registrado) | Idem |
| Indirecta | Sin monto: consta que existe | Idem |
| Señales de escala | **Tamaño del negocio**: Empleados, Nómina, Establecimientos Activos (SRI), Contabilidad | Idem |
| Nómina que paga | Nómina (sin contar a la propia persona) | Idem |
| Establecimientos registrados | Establecimientos Activos (SRI): sólo abiertos; 0 si el RUC no está activo | Idem |
| Otras fuentes · sin monto | Negocio propio (SRI) | Idem |
| Corte del IESS usado | **Información IESS**, con el mes en palabras: «Ago 2026» (no `2026-08`) | Idem. El corte *del sistema* (parámetro) se sigue llamando «corte vigente». |
| Fuera del último corte | Sin información actual en el IESS | Idem |
| Por qué este segmento | Condiciones de la Segmentación | Idem |
| Qué pedir para confirmar | Documentos de Confirmación de Ingresos | Idem |
| Es su propio empleador | Es su propio patrono | Idem |
| Cómo puede fallar | (se sacó) | Idem: era una generalidad |
| «Fuente de ingreso» como columna o sello que muestra *Independiente / Dependiente privado…* | **Segmento** | 2026-10-10. El negocio había dejado «Segmento» (rechazó «De qué vive»); Solicitudes y Expediente lo llamaban de otro modo en la misma pantalla. |
| Retroalimentación | **Laboratorio** (y «Prueba retrospectiva») | El Laboratorio la reemplazó el 2026-10-03. Quedó en Costos (`consumoLlm.js`) y en un título de la barra. |
| backtest / backtesting | **Prueba retrospectiva** | Anglicismo; así se llama en el Laboratorio. |
| default | **impago** (definición de impago, impago por mes) | Anglicismo; el impago es un parámetro (110). |
| Calibración del criterio (en Costos) | Laboratorio y vigía del servicio | La clave `calibracion` de la vista agrupa TODO lo que no es un análisis de cliente; el rótulo decía otra cosa. |
| LLM | «el modelo», «Análisis con IA» | Sigla de proveedor. |
| Ingesta | consulta a la fuente de datos | Anglicismo. |
| mouse | cursor / puntero | Anglicismo. |
| Puntaje (y «score» suelto) | **Score**, en pantalla, en lo que se exporta y en los documentos. La columna `puntaje` de la plantilla que llenan las instituciones se queda: es un contrato de datos | Negocio, 2026-10-12: «unifiquemos todo a Score». 55 textos |
| Lotes corridos | **Lotes consultados** | Negocio, 2026-10-12 |
| Reportes · Inteligencia de Negocios | **Monitoreo › Panorama** (la ruta sigue siendo `/reportes`) | Negocio, 2026-10-12: «Reportes pasa a Monitoreo». Sacó el choque con «Laboratorio de Inteligencia de Negocio». «Panorama» lo puso quien lo hizo, como Costos y Fuentes de Ingreso |
| Historial por cédula | Se retiró: **la búsqueda abre el Expediente** | Negocio, 2026-10-12. Lo guardado de cada consulta se abre desde la línea de tiempo del Expediente (`/historial` redirige al Inicio) |
| Aval (en el menú) | **Buró**: lleva al buró de la institución, Equifax o Aval (uno solo por IFI) | Negocio, 2026-10-16: el selector de Configuración se llama «Buró»; el menú usa el mismo nombre. La pestaña de la persona dice el nombre del buró (Equifax o Aval) |
| «Garantías» (personas que respaldan la deuda de otra) | **Deuda como codeudor o garante** | Negocio, 2026-10-13: en Ecuador «garantía» es el colateral (auto, casa, pagaré) |
| Explorador de Fuentes | **Explorador de la fuente de datos** | Negocio, 2026-10-12 (respondió «fuentes»: se leyó como aceptar la recomendación; confirmar) |
| «Cliente» para cualquier persona consultada | **Persona**; «cliente» sólo con un crédito (Cliente activo, Cliente cerrado) | Negocio, 2026-10-12, con el árbol de la persona: `docs/modelo-de-la-persona.md`. Clientes por segmento → **Personas por segmento** |

Se conservan, con el aviso «(retirado)», los nombres de procesos que tienen historial
en Costos (`analizar-feedback`, `proponer-ajustes`, `correr-backtest`).

### Decididos el 2026-10-18 y aplicados ese día (#52)

El control corta con «Perfil del Cliente» en un texto de pantalla; en un comentario del
código no molesta.

| Hoy | Decidido | Quién y cuándo |
|---|---|---|
| Solicitante (segundo estado de la persona; sólo está en los documentos) | **En proceso** | Negocio, 2026-10-18. Se habían propuesto En evaluación, En trámite, Postulante y Aspirante. `en_proceso` ya es un estado de la *evaluación* en la API: no se usa el mismo código para los dos |
| (no existía: el que fue rechazado o desistió no tenía estado) | **No aprobado** | Negocio, 2026-10-18 |
| Perfil del Cliente | **Perfil de la Persona** (menú, exportaciones, la hoja del Excel de lotes y unos 25 textos) | Negocio, 2026-10-18. Renombrado ese día (24 textos); el control corta con el nombre viejo |
| (la decisión Aprobado / Rechazado no se puede marcar) | La marca **el analista en la solicitud**: Aprobado, Rechazado o Desistió, con motivo | Negocio, 2026-10-18; construido ese día (134) |
| Operaciones propias en buró de crédito | **Líneas de deuda propias en buró de crédito** | Negocio, 2026-10-31. Proveedor_Info_1 agrupa por entidad, tipo y calificación: cuenta filas, no operaciones. El control corta con el nombre viejo |
| Empleos registrados en total · Empleos en el historial | **Empleadores registrados en el IESS** | Negocio, 2026-10-31. Desde estructura-v16 cuenta empleadores distintos. El control corta con los nombres viejos |
| Corte del retail · Saldo de préstamos IESS/BIESS (provisorios) | Se quedan así | Negocio, 2026-10-31 |
| Sueldo más alto registrado | **Salario más alto registrado** | Negocio, 2026-10-31. El mismo dato se llamaba distinto en Fuentes de Ingreso y en el Perfil de la Persona. El control corta con el nombre viejo |

## 3. Un concepto, un nombre

| Concepto | Nombre | Se evita | Nota |
|---|---|---|---|
| Lo que dice cómo se llama a la API | **especificación de la API** (`api/openapi.yaml`); en el código y los documentos técnicos, «el contrato de la API» | «contrato» a secas en una pantalla o con el negocio | El **contrato** a secas es el comercial entre CrediScope y la institución (la IFI declara que tiene la autorización de cada persona). La especificación técnica no es ese contrato: el negocio los confundió el 2026-10-19 al leer un informe. |
| El número de 1 a 999 | **Score** («Score promedio»; en una frase, «el score») | «Puntaje» | Decidido el 2026-10-12. El score de **Aval** es otro: «Score de Aval» o, dentro de su pantalla, «el score». El de **Equifax**, «Score de Equifax» siempre, también dentro de su pantalla, y sin el medidor del Score de CrediScope (negocio, 2026-10-13: nunca se mezclan). |
| Lo que el modelo aconseja | **Aprobar / Revisar / Negar** (pastilla, sello, filtro). **Observar** se retiró en marco-v27 y sólo queda en análisis viejos | «Rechazar» para el modelo | El dictamen en la tarjeta grande va en sustantivo (Aprobación / Revisión / Negación) **a propósito**: es el dictamen, no una orden (`RecomendacionCard.jsx`). El negocio lo dejó así el 2026-10-12. |
| Lo que decide la institución con una solicitud | **Aprobado / Rechazado** | confundirlo con la recomendación del modelo | El modelo aconseja; la institución decide, y lo marca el analista en la solicitud (negocio, 2026-10-18; todavía no se puede marcar). Son dos columnas, no una (`docs/modelo-de-la-persona.md`, sección 4). La Solicitud muestra por separado lo que dice el modelo y lo que dicen los números (capacidad de pago): no se combinan en una sola cara (negocio, 2026-10-17). |
| La persona evaluada | **persona**. **Cliente** sólo es quien tiene un crédito (estados Cliente activo y Cliente cerrado). «Perfil del Cliente» sigue siendo el nombre de producto en pantalla hasta que se aplique «Perfil de la Persona» (decidido el 2026-10-18) | «Titular», «sujeto» (sólo en derechos del titular); «cliente» para quien no tiene crédito | Decidido el 2026-10-12 con el árbol de la persona (`docs/modelo-de-la-persona.md`). El control avisa de cada «cliente» suelto. |
| Los estados de la persona | **Prospecto · En proceso · Preaprobado · Aprobado · No aprobado · Cliente activo · Cliente cerrado** (decididos; el nombre de pantalla se aplica con los estados) | llamar «Estado» a los dos estados en una pantalla; «Solicitante» | El **estado de la persona** no es el **estado del análisis** (Analizado, Sin analizar, No se completó, La consulta falló) ni el **estado de la evaluación** de la API (`en_proceso`, `completada`...). Hoy sólo existe el del análisis. |
| Lo que cuelga de la persona | **Solicitudes · Direcciones · Empleos · Referencias · Documentos · Scores · Créditos** | «historial» para una de ellas | Los nombres del árbol del negocio; una pantalla nueva usa éstos. |
| Qué se consulta | **fuente de datos** (Proveedor_Info_1, Aval) | «proveedor» a secas, «servicio» | «Fuentes de ingreso» ≠ «fuentes de datos»: son dos cosas. Sólo la segunda es una fuente que se consulta. |
| Un conjunto de cédulas consultadas de una vez | **lote** (Consultas por lote) | «corrida» para esto | «Corrida» es una acción que dispara muchas llamadas al modelo (Costos). |
| Los resultados de crédito que sube la institución | **carga** (Laboratorio) | «lote» | Un lote consulta; una carga trae resultados. |
| Congelado de una cartera para analizarla | **corte** (Laboratorio) | | No confundir con el «corte del IESS»: son dos cosas. |
| Dato que la fuente no dio | **No medido** / «—» con su motivo | `0`, vacío, «N/D» | CLAUDE.md: los huecos se dicen. |
| Lo que la persona que pide el crédito dice que recibe por mes | **Ingreso declarado** (con «sin verificar» a la vista) | «ingreso según documento», «ingreso estimado», «ingreso real» | Negocio, 2026-10-17 (capacidad de pago). Es una declaración, no una estimación: no choca con «no se especula sobre el ingreso». Cuando lo hay, la capacidad se mide con él y el reportado al IESS queda como referencia. |
| En la pestaña Equifax, lo propio y lo ajeno | **Como titular** / **Lo que respalda de otras personas** (filas que separan la tabla de operaciones); «como codeudor», «como garante» en cada fila ajena | mezclar las dos en una sola cuenta («28 operaciones» al lado de «15») | 2026-10-18, revisión de UX: se nombró con las palabras que ya usaba la pestaña, sin decisión nueva del negocio. «Mora más larga **hoy**» (en la tabla) no es «Atraso más largo» (24 meses, en «Cómo pagó»). |
| El nombre de una institución que manda Equifax | **Como lo manda Equifax**, en mayúsculas y abreviado («BCO DE GUAYAQUIL», «COOP. JARDIN AZUAYO») | pasarlo a oración o a un nombre comercial | Negocio, 2026-10-19: se quedan así. Es lo que el analista ve en el reporte de Equifax, y entre los 92 nombres hay siglas y marcas (BIESS, PYCCA, CNT EP) que una conversión rompería. |
| Si la cuota entra en el ingreso | **Capacidad de pago**: «Le alcanza / Le alcanza, pero justo / No le alcanza / No se puede medir» | «capacidad de endeudamiento», «DTI» | 2026-10-17. El tope es la **carga máxima** (40% del ingreso neto, confirmado por el negocio ese día; cada institución pone la suya). |

## 4. Formatos

| Qué | Cómo | Ejemplo |
|---|---|---|
| Entero | `entero()` | 2.812 (también los de 4 cifras) |
| Decimal | `decimal(n, dec)` | 37,0 |
| Dólares | `moneda(n, dec)` | $1.784 · $12,14 |
| Porcentaje | `porcentaje()` / `porcentajeDe(parte, total)` | 37% · <1% (nunca «0%» si hay casos) |
| Duración corta | `segundos(ms)` | 37,0 s · 900 ms |
| Duración larga | `duracionLarga(min)` | 6 d 6 h |
| Centavos | `centavos(usd)` | 4,3¢ |
| Fecha | `formatearFecha()` | 15/09/2026 |
| Fecha y hora | `formatearFechaHora()` (24 h, Ecuador) | 15/09/2026 17:26 |
| Mes | `mesAnio()` | Ago 2026 |
| Texto guardado en un perfil | `humanizarTexto()` | arregla «el corte 2026-08» y «$1084» al mostrarlo |

`humanizarTexto` existe porque `fuentes-ingreso.ts` guardó esos textos con formato
de JavaScript dentro de miles de perfiles. Cuando se arme bien en origen (próxima
versión de fuentes) se retira.

## 5. Nombres que quedan por decidir

**Decididos el 2026-10-18 y aplicados (ver la tabla de la sección 2):**
el segundo estado de la persona es **En proceso**; quien fue rechazado o desistió está en
**No aprobado**; la decisión de la institución la marca el analista en la solicitud; y
«Perfil del Cliente» pasa a **Perfil de la Persona**. El detalle, en
`docs/modelo-de-la-persona.md`, sección 5. Quién decide Preaprobado ya estaba contestado
(el modelo, 2026-10-17).

**Siguen por decidir** (son del negocio; las opciones están en el mismo documento y en
`docs/revision-ux.md`):

- si el dictamen del modelo («Negación») y la decisión de la solicitud («Rechazado») dicen lo mismo;
- cómo pasa la persona de En proceso a Preaprobado cuando el modelo dice «Revisar», y si
  quien está en No aprobado vuelve a En proceso al pedir otro crédito;
- «Explorador de la fuente de datos»: confirmar que «fuentes» era aceptar la recomendación.
