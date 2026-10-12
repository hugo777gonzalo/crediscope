# Mapa de pantallas

Cada ruta de `src/App.jsx`, agrupada como el menú (`src/lib/navegacion.js`, que es
la lista que manda). «Admin» = sólo administración: lo exige la ruta (`RequireAdmin`)
**y** la política de la base. Las pestañas internas del Laboratorio están en
`docs/laboratorio-pantallas.md`.

La columna **Se tiene que parecer a** es lo que más se rompe: dos pantallas que
cuentan lo mismo y dicen cosas distintas.

## Inicio y evaluación de un cliente

| Ruta | Archivo | Quién | Qué hace | Se tiene que parecer a |
|---|---|---|---|---|
| `/` | `ClientSearch.jsx` | todos | Buscar una cédula (valida el dígito verificador, acepta el RUC de persona natural). Es el «Inicio» | Historial (el otro buscador por cédula) |
| `/perfil/:cedula` | `PerfilCliente.jsx` | todos | Perfil del Cliente: lo recopilado, por grupos plegables; botón Consultar/Reconsultar | Expediente › Perfil del Cliente (la misma información en una sola página) |
| `/analisis/:cedula` | `AnalisisIA.jsx` | todos | Análisis con IA: puntaje, recomendación, puntos positivos/negativos; botones Analizar / Reconsultar y analizar | Expediente › Qué dijo el modelo |
| `/ingresos/:cedula` | `IngresosCliente.jsx` | todos | Fuentes de Ingreso de la persona: segmento, estabilidad, fuentes vigentes, indicios | Expediente › Con qué paga; Panorama (mismo vocabulario) |
| `/aval/:cedula` | `PerfilAval.jsx` | todos | Reporte de la fuente Aval (buró). **No está en el Expediente** | — |

Las cuatro llevan la tira de pestañas `PestanasCliente.jsx` (la cédula es la del último
cliente visto: `ultimaCedula.js`). El menú las lleva a `/` si todavía no hay ninguno.

## Solicitudes

| Ruta | Archivo | Quién | Qué hace | Se tiene que parecer a |
|---|---|---|---|---|
| `/solicitudes` | `Solicitudes.jsx` | todos | **La bandeja**: una fila por persona consultada, filtros en la URL, franja de totales que filtra | Reportes (cantidades por recomendación), Panorama (segmentos), Historial |
| `/solicitudes/:cedula` | `Expediente.jsx` | todos | **El expediente**: todo lo que se sabe de una persona, en una pantalla con ruta propia | Perfil, Análisis y Fuentes de Ingreso por separado (dicen lo mismo con otro marco) |
| `/historial` | `Historial.jsx` | todos | Buscar por cédula y ver todas las consultas y análisis. **Redundante con Expediente › Línea de tiempo** (propuesta de retiro) | Expediente |
| `/historial/perfil/:id`, `/historial/analisis/:id` | `HistorialPerfilDetalle.jsx`, `HistorialAnalisisDetalle.jsx` | todos | Cómo quedó un perfil o un análisis ese día (sólo lectura). Se llega desde la línea de tiempo del Expediente | Perfil y Análisis |

## Fuentes de Ingreso (módulo sobre toda la cartera)

| Ruta | Archivo | Quién | Qué hace |
|---|---|---|---|
| `/fuentes` | `FuentesIngreso.jsx` | todos | Panorama: de qué vive la cartera, qué tan firme es cada clasificación, perfil laboral, indicios, quiénes necesitan respaldo |
| `/fuentes/clientes` | `FuentesClientes.jsx` | todos | Lista de clientes por segmento / estado / indicio (filtros en la URL; las barras del Panorama enlazan acá) |
| `/fuentes/reglas` | `FuentesReglas.jsx` | todos | **Documentación embebida** de la clasificación, escrita para Riesgos. Compara su versión con la del código y avisa si se desfasó (hoy `fuentes-v10`). Al cambiar una regla en `fuentes-ingreso.ts` hay que actualizarla acá |
| `/fuentes/parametros` | `FuentesParametros.jsx` | admin | Corte vigente del IESS, SBU y fracción básica; cuántos clientes quedaron con un corte anterior |

## Reportes

| Ruta | Archivo | Quién | Qué hace | Se tiene que parecer a |
|---|---|---|---|---|
| `/reportes` | `Reportes.jsx` | todos | Inteligencia de Negocios: tablero para jefatura (KPI, distribución del puntaje, consultas por mes, recomendación, riesgo, actividad, tiempos, explorador por grupo) | Bandeja (recomendaciones), Panorama (cantidad de clientes) |
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
| `/admin/fuentes/novadata`, `/aval` | `ConfigFuentes.jsx`, `ConfigFuentesAval.jsx` | Qué fuentes se consultan (apagar una deja de consultar el dato) |
| `/admin/campos/novadata`, `/aval` | `ConfigCampos.jsx`, `ConfigCamposAval.jsx` | Qué campos entran al Análisis con IA (apagar uno lo guarda pero lo saca del criterio) |
| `/admin/segmentos` | `ConfigSegmentos.jsx` | Qué segmentos ve el analista (ocultar sólo cambia lo que se ve) |
| `/explorar` | `NovadataExplorer.jsx` | Consulta en vivo a las 52 fuentes, con usuario y contraseña de la fuente. No guarda nada |

Los tres interruptores de Configuración son pantallas distintas **a propósito**: se
parecen y tienen consecuencias distintas. No fundirlas.

## Lo que tiene que decir lo mismo en todas partes

| Dato | Dónde sale | Comprobar que coincide |
|---|---|---|
| Personas en cartera | Bandeja («En la búsqueda» sin filtros) · Reportes («Clientes en cartera») · Panorama («Clientes clasificados») · Clientes por segmento (total) | Sin filtros, los cuatro son el mismo número. Si no, hay un filtro (sintéticos, sin clasificar) que una pantalla aplica y otra no |
| Recomendaciones | Franja de la Bandeja · Reportes › Recomendación | Mismos Aprobar / Revisar / Negar |
| Segmentos | Filtro de la Bandeja · Panorama · Clientes por segmento · Sello del Expediente | Mismos nombres (`ETIQUETA_SEGMENTO`) |
| Perfil laboral | Sólo Panorama (Reportes lo enlaza) | No reinstalar una segunda tabla con otra clasificación |
| Una persona | Expediente · Perfil · Análisis · Fuentes de Ingreso | Puntaje, recomendación, segmento e ingreso son los mismos |
| Gasto de modelo | Panorama de Costos · Detalle de llamadas · Corridas | El total medido coincide |
| Menú y barra superior | `navegacion.js` | Un solo origen |

## Dónde mirar cuando algo no coincide

1. ¿Un filtro que una pantalla aplica y otra no? (`es_sintetico`, fecha, estado.)
2. ¿Dos consultas distintas a la misma vista? Mirar `src/lib/api.js` y la función SQL.
3. ¿Un texto guardado en el perfil (por la clasificación) y mostrado sin `humanizarTexto`?
4. ¿Una pieza copiada en lugar de la compartida (`ui/`)?
