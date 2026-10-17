# Mapa de pantallas

Cada ruta de `src/App.jsx`, agrupada como el menú (`src/lib/navegacion.js`, que es
la lista que manda). «Admin» = sólo administración: lo exige la ruta (`RequireAdmin`)
**y** la política de la base. Las pestañas internas del Laboratorio están en
`docs/laboratorio-pantallas.md`.

La columna **Se tiene que parecer a** es lo que más se rompe: dos pantallas que
cuentan lo mismo y dicen cosas distintas.

## Inicio y evaluación de una persona

| Ruta | Archivo | Quién | Qué hace | Se tiene que parecer a |
|---|---|---|---|---|
| `/` | `ClientSearch.jsx` | todos | «Buscar persona»: una cédula (valida el dígito verificador, acepta el RUC de persona natural) y **abre el Expediente**, también el de quien nunca se consultó. Es el «Inicio» | Expediente |
| `/perfil/:cedula` | `PerfilCliente.jsx` | todos | Perfil del Cliente: lo recopilado, por grupos plegables; botón Consultar/Reconsultar | Expediente › Perfil del Cliente (la misma información en una sola página) |
| `/analisis/:cedula` | `AnalisisIA.jsx` | todos | Análisis con IA: score, recomendación, puntos positivos/negativos; botones Analizar / Reconsultar y analizar | Expediente › Qué dijo el modelo |
| `/ingresos/:cedula` | `IngresosCliente.jsx` | todos | Fuentes de Ingreso de la persona: segmento, estabilidad, fuentes vigentes, indicios | Expediente › Con qué paga; Panorama (mismo vocabulario) |
| `/aval/:cedula` | `PerfilAval.jsx` | todos | Reporte de la fuente Aval (buró). **No está en el Expediente** | — |
| `/equifax/:cedula` | `PerfilEquifax.jsx`, `components/equifax/`, `lib/equifaxPantalla.js` | todos | Reporte de Equifax (buró): Score de Equifax, deuda por sistema, 24 meses de pagos, operaciones; el resto plegado; «Descargar reporte (PDF)» imprime la pantalla; «Consultar a Equifax» (sólo admin, sin consulta vigente, con confirmación porque se cobra; `ConsultarEquifax.jsx`). **No está en el Expediente** (F1). La pestaña aparece cuando el buró de la institución es Equifax | Aval |
| `/buro/:cedula` | `BuroDeLaPersona.jsx` | todos | «Buró» del menú: lleva a la pestaña del buró de la institución (129), o dice que no hay uno elegido | — |
| `/simulador` | `SimuladorCredito.jsx`, `_shared/simulador-credito.ts` | todos | Simulador de crédito: monto (con deslizador), plazo (12 a 60 de un toque), tasa (máximo 15%), cómo se paga y el seguro plegado; la cuota grande con su reparto (capital, interés, seguro), los totales y la tabla plegada. No necesita una persona | La capacidad de pago, cuando exista (la misma cuota) |
| `/capacidad/:cedula` | `CapacidadDePago.jsx`, `components/credito/`, `_shared/capacidad-de-pago.ts` | todos | Capacidad de pago: las mismas condiciones del simulador y el veredicto (Le alcanza / justo / No le alcanza / No se puede medir) con «de cada $100», el medidor y el tope; hasta cuánto le alcanza; el Ingreso declarado (opcional, sin verificar: reemplaza al IESS y muestra qué daría sólo el IESS); lo que recibe (IESS, menos el aporte personal) y lo que ya paga (Equifax o Novadata), con las deudas sin cuota aparte. No consulta fuentes | Simulador de crédito (la misma cuota); Fuentes de Ingreso (el mismo ingreso reportado) |

Las cuatro llevan la tira de pestañas `PestanasCliente.jsx` (la cédula es la del último
cliente visto: `ultimaCedula.js`). El menú las lleva a `/` si todavía no hay ninguno.

## Solicitudes

| Ruta | Archivo | Quién | Qué hace | Se tiene que parecer a |
|---|---|---|---|---|
| `/solicitudes` | `Solicitudes.jsx` | todos | **La bandeja**: una fila por persona consultada, filtros en la URL, franja de totales que filtra | Monitoreo (cantidades por recomendación), Panorama (segmentos) |
| `/solicitudes/:cedula` | `Expediente.jsx` | todos | **El expediente**: todo lo que se sabe de una persona, en una pantalla con ruta propia | Perfil, Análisis y Fuentes de Ingreso por separado (dicen lo mismo con otro marco) |
| `/historial` | (redirige a `/`) | todos | **Se retiró el 2026-10-12**: el Expediente ya trae la línea de tiempo y la búsqueda del Inicio lleva a él | — |
| `/historial/perfil/:id`, `/historial/analisis/:id` | `HistorialPerfilDetalle.jsx`, `HistorialAnalisisDetalle.jsx` | todos | Cómo quedó un perfil o un análisis ese día (sólo lectura). Se llega desde la línea de tiempo del Expediente | Perfil y Análisis |

## Fuentes de Ingreso (módulo sobre toda la cartera)

| Ruta | Archivo | Quién | Qué hace |
|---|---|---|---|
| `/fuentes` | `FuentesIngreso.jsx` | todos | Panorama: de qué vive la cartera, qué tan firme es cada clasificación, perfil laboral, indicios, quiénes necesitan respaldo |
| `/fuentes/clientes` | `FuentesClientes.jsx` | todos | «Personas por segmento»: la lista por segmento / estado / indicio (filtros en la URL; las barras del Panorama enlazan acá) |
| `/fuentes/reglas` | `FuentesReglas.jsx` | todos | **Documentación embebida** de la clasificación, escrita para Riesgos. Compara su versión con la del código y avisa si se desfasó (hoy `fuentes-v10`). Al cambiar una regla en `fuentes-ingreso.ts` hay que actualizarla acá |
| `/fuentes/parametros` | `FuentesParametros.jsx` | admin | Corte vigente del IESS, SBU y fracción básica; cuántas personas quedaron con un corte anterior |

## Monitoreo (antes Reportes; la ruta sigue siendo `/reportes`)

| Ruta | Archivo | Quién | Qué hace | Se tiene que parecer a |
|---|---|---|---|---|
| `/reportes` | `Reportes.jsx` | todos | «Monitoreo › Panorama»: tablero para jefatura (KPI, distribución del score, consultas por mes, recomendación, riesgo, actividad, tiempos, explorador por grupo) | Bandeja (recomendaciones), Panorama (cantidad de personas) |
| `/reportes/descargas` | `Descargas.jsx` | admin | Exportar planos (solicitudes por rango de fechas) | Registra `exportacion.solicitudes` |

## Consultas por lote (admin)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/lotes` | `Lotes.jsx` | Lista de lotes con su estado, errores y minutos |
| `/lotes/nuevo` | `LoteNuevo.jsx` | Cargar un archivo de cédulas (Excel/CSV) y arrancar la consulta. Declara la base legal |
| `/lotes/:id` | `LoteDetalle.jsx` | Avance en vivo (se actualiza solo cada diez segundos) y exportación |

## Costos (admin)

Siete pantallas sobre `llm_costos`. Regla del módulo: **una llamada sin medir vale
«desconocido», no cero**. Todos los números salen con `formatos.js`.

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/costos` | `Costos.jsx` | Panorama: gasto medido, llamadas, costo por análisis, en qué se gastó, qué tan confiable, día a día |
| `/costos/consultas` | `CostosConsultas.jsx` | Costo por consulta y simulador de tarifa |
| `/costos/corridas` | `CostosCorridas.jsx` | Corridas masivas (acciones que disparan muchas llamadas) |
| `/costos/llamadas` | `CostosLlamadas.jsx` | Detalle de cada llamada (con descarga CSV) |
| `/costos/incidentes` | `CostosIncidentes.jsx` | Estado ahora, incidentes, causas, quién responde |
| `/costos/equifax` | `CostosEquifax.jsx`, `lib/costoEquifax.js` | Lo que se le paga a Equifax: consultas pagadas por mes a USD 0,40 (tarifa del 17/10/2026, constante en `costoEquifax.js`) y, aparte, las que pudieron cobrarse |
| `/costos/avisos` | `CostosAvisos.jsx` | Canal de avisos, presupuesto mensual, avisos emitidos |
| `/costos/tarifas` | `CostosTarifas.jsx` | Tarifas por modelo y por millón de tokens |

## Laboratorio (admin)

`/laboratorio` (Inicio) · `/laboratorio/instituciones` · `/laboratorio/datos` (+ cargas y cortes:
`/laboratorio/cargas/nueva`, `/cargas/:id`, `/cortes/nuevo`, `/cortes/:id`) ·
`/laboratorio/desempeno` (Prueba retrospectiva) · `/laboratorio/estadistica` ·
`/laboratorio/profundo` · `/laboratorio/caso?corte=&id=` (un caso, se abre desde Descubrimiento
profundo) · `/laboratorio/propuestas`. Los tres módulos de análisis usan `ModuloDelCorte`
(el corte y la pestaña van en la URL). Todo lo sintético lleva `FranjaSintetica`.

Las direcciones viejas `/retroalimentacion/*` y `/laboratorio/criterio` redirigen.

## Configuración (admin)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/admin/fuentes/novadata`, `/aval`, `/equifax` | `ConfigFuentes.jsx`, `ConfigFuentesAval.jsx`, `ConfigFuentesEquifax.jsx` (con el selector «Buró», `SelectorDeBuro.jsx`) | Qué fuentes se consultan (apagar una deja de consultar el dato) |
| `/admin/campos/novadata`, `/aval` | `ConfigCampos.jsx`, `ConfigCamposAval.jsx` | Qué campos entran al Análisis con IA (apagar uno lo guarda pero lo saca del criterio) |
| `/admin/segmentos` | `ConfigSegmentos.jsx` | Qué segmentos ve el analista (ocultar sólo cambia lo que se ve) |
| `/explorar` | `NovadataExplorer.jsx` | Consulta en vivo a las 52 fuentes, con usuario y contraseña de la fuente. No guarda nada |

Los tres interruptores de Configuración son pantallas distintas **a propósito**: se
parecen y tienen consecuencias distintas. No fundirlas.

## Lo que tiene que decir lo mismo en todas partes

| Dato | Dónde sale | Comprobar que coincide |
|---|---|---|
| Personas en cartera | Bandeja («En la búsqueda» sin filtros) · Monitoreo («Personas en cartera») · Panorama («Personas clasificadas») · Personas por segmento (total) | Sin filtros, los cuatro son el mismo número. Si no, hay un filtro (sintéticos, sin clasificar) que una pantalla aplica y otra no |
| Recomendaciones | Franja de la Bandeja · Monitoreo › Recomendación | Mismos Aprobar / Revisar / Negar |
| Segmentos | Filtro de la Bandeja · Panorama · Personas por segmento · Sello del Expediente | Mismos nombres (`ETIQUETA_SEGMENTO`) |
| Perfil laboral | Sólo Panorama (Monitoreo lo enlaza) | No reinstalar una segunda tabla con otra clasificación |
| Una persona | Expediente · Perfil · Análisis · Fuentes de Ingreso | Score, recomendación, segmento e ingreso son los mismos |
| Gasto de modelo | Panorama de Costos · Detalle de llamadas · Corridas | El total medido coincide |
| Menú y barra superior | `navegacion.js` | Un solo origen |

## Dónde mirar cuando algo no coincide

1. ¿Un filtro que una pantalla aplica y otra no? (`es_sintetico`, fecha, estado.)
2. ¿Dos consultas distintas a la misma vista? Mirar `src/lib/api.js` y la función SQL.
3. ¿Un texto guardado en el perfil (por la clasificación) y mostrado sin `humanizarTexto`?
4. ¿Una pieza copiada en lugar de la compartida (`ui/`)?
