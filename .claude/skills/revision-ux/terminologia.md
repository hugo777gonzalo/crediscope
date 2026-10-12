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
| Plurales | `plural(n, "cliente")` de `formatos.js`. Nunca `cliente(s)`. | El «(s)» es no decidir; salía «1 análisis corridos». |
| Mayúsculas | **Nombres comerciales** en Title Case (lista abajo). Todo lo demás, como una oración: sólo la primera palabra. | El negocio capitaliza sus nombres («Información IESS»). El resto no es un nombre. |
| Tildes | Interrogativos con tilde: «Ver **cómo** quedó ese día». | Faltaba y se leía como un error de descuido en la pantalla central. |
| Textos técnicos | Nunca en la tarjeta principal: versiones (`marco-v28`), códigos (`expediente.vista`), identificadores (`canal_aviso`), JSON del proveedor. Van en `title`, en «Detalle técnico» plegado, o no van. | Pedido del negocio sobre la pestaña Fuentes de ingreso (2026-09-26): «los datos de versión no van en la tarjeta principal». |
| Desarrollo en pantalla | Una pantalla no cuenta qué falta construir («eso llega con la solicitud como entidad», «decisión pendiente, porque toca permisos»). Dice **qué** no hay y **qué** hacer. | El analista lee un hecho sobre su caso, no el plan del equipo. Eso va a `docs/pendientes.md`. |

### Nombres comerciales (Title Case, tal cual)

Evaluación Crediticia · Perfil del Cliente · Análisis con IA · Fuentes de Ingreso ·
Inteligencia de Negocios · Información IESS · Documentos de Confirmación de
Ingresos · Condiciones de la Segmentación · Ingreso Mínimo SBU · Establecimientos
Activos (SRI) · Consultas por lote.

El resto de pantallas, pestañas y botones, en oración: «Clientes por segmento»,
«Historial por cédula», «Costo por consulta», «Reglas de clasificación».

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

Se conservan, con el aviso «(retirado)», los nombres de procesos que tienen historial
en Costos (`analizar-feedback`, `proponer-ajustes`, `correr-backtest`).

## 3. Un concepto, un nombre

| Concepto | Nombre | Se evita | Nota |
|---|---|---|---|
| El número de 1 a 999 | **Puntaje** en pantalla; `score` aceptado | mezclar «Score» y «Puntaje» en la misma pantalla | Reportes decía «Score promedio» junto a «Puntaje» en la bandeja. Elegir uno por pantalla; el negocio dice ambos. |
| Lo que el modelo aconseja | **Aprobar / Revisar / Negar** (pastilla, sello, filtro). **Observar** se retiró en marco-v27 y sólo queda en análisis viejos | «Rechazar» para el modelo | El dictamen en la tarjeta grande va en sustantivo (Aprobación / Revisión / Negación) **a propósito**: es el dictamen, no una orden (`RecomendacionCard.jsx`). |
| La persona evaluada | **cliente** en el trabajo diario (Buscar cliente, Perfil del Cliente); **persona** cuando se cuenta o se estudia una población (Laboratorio, tablas) | «Titular», «sujeto» (sólo en derechos del titular) | Hoy mezcla: 99 «persona» y 71 «cliente». No mezclar en una misma frase. Decisión pendiente (ver `docs/revision-ux.md`). |
| Qué se consulta | **fuente de datos** (Novadata, Aval) | «proveedor» a secas, «servicio» | «Fuentes de ingreso» ≠ «fuentes de datos»: son dos cosas. Sólo la segunda es una fuente que se consulta. |
| Un conjunto de cédulas consultadas de una vez | **lote** (Consultas por lote) | «corrida» para esto | «Corrida» es una acción que dispara muchas llamadas al modelo (Costos). |
| Los resultados de crédito que sube la institución | **carga** (Laboratorio) | «lote» | Un lote consulta; una carga trae resultados. |
| Congelado de una cartera para analizarla | **corte** (Laboratorio) | | No confundir con el «corte del IESS»: son dos cosas. |
| Dato que la fuente no dio | **No medido** / «—» con su motivo | `0`, vacío, «N/D» | CLAUDE.md: los huecos se dicen. |

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

## 5. Nombres que quedan por decidir (propuestas)

No se aplicaron: son del negocio. Las opciones están en `docs/revision-ux.md`.
