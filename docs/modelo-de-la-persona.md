# Modelo de la persona

Decisión del negocio del 2026-10-12, al cerrar la revisión de UX
(`docs/revision-ux.md`, sección 3). Define de qué habla cada pantalla y cómo se
llama cada cosa. **Lo que está escrito como decidido lo escribió el negocio;
lo que dice «propuesta» es de quien redactó este documento y está para
confirmar.**

## 1. Qué se decidió

**La persona es la entidad. «Cliente» no es la entidad: es un estado de la
persona** (la que tiene un crédito).

```
Persona
│
├── Solicitudes
├── Direcciones
├── Empleos
├── Referencias
├── Documentos
├── Scores
└── Créditos
```

El camino de una persona, en el diagrama del negocio:

```
Persona → Solicitud → Evaluación → Aprobado / Rechazado → Cliente
                                                          (si se desembolsa / se genera el crédito)
```

Los estados de la persona:

| Estado | Qué quiere decir |
|---|---|
| **Prospecto** | Una persona que todavía no pidió nada. |
| **En proceso** | Pidió un crédito y se está evaluando. Se llamó «Solicitante» hasta el 2026-10-18, cuando el negocio eligió este nombre (sección 5). |
| **Preaprobado** | Pasó la evaluación y falta confirmarlo. La preaprobación la da el modelo (decisión del 2026-10-17). |
| **Aprobado** | La institución aprobó la solicitud. |
| **No aprobado** | Fue rechazado o desistió. Estado propio, decidido el 2026-10-18. |
| **Cliente activo** | Tiene un crédito desembolsado. |
| **Cliente cerrado** | Tuvo créditos y ya no debe nada. |

**Construidos el 2026-10-18** (134): el estado se calcula desde las solicitudes
con `estadoDeLaPersona()` (`supabase/functions/_shared/estado-de-la-persona.ts`)
y se muestra en la solicitud. Cliente activo y Cliente cerrado todavía no se
calculan: necesitan los créditos, que no existen como entidad.

Cómo se escriben en pantalla: «Prospecto», «Cliente activo» (oración, no
mayúsculas). Dos cosas que el negocio también resolvió ese día:

- **«Score»** en lugar de «Puntaje» y de «score» suelto: un solo nombre, en
  pantalla, en lo que se exporta y en los documentos. Los nombres de columna de
  la plantilla que llenan las instituciones (`puntaje`, `fuente_puntaje`) no se
  tocan: son un contrato de datos.
- **«Persona» y no «cliente»** para quien se consulta o se evalúa. «Cliente» sólo
  para quien está en Cliente activo o Cliente cerrado.

## 2. Qué existe hoy y qué falta

| Del árbol | Hoy | Falta |
|---|---|---|
| **Persona** | `clients` (la cédula; `es_sintetico` marca las 240 de prueba de Aval). 2.572 reales. El estado de la persona se calcula desde sus solicitudes (134); falta mostrarlo en la bandeja, en el Expediente y en Monitoreo. |
| **Solicitudes** | **Es una entidad desde el 2026-10-17** (tabla `solicitudes`, 133, función `evaluar-solicitud`): modalidad (Básico, Pro, Plus), monto, plazo, tasa, Ingreso declarado, los pasos de su evaluación y lo que produjo cada módulo. La bandeja (`bandeja_solicitudes`) sigue armando una fila por persona con su último perfil y análisis, y el Laboratorio tiene `lab_solicitudes` (las de una institución dentro de un corte, sólo para analizar): son otra cosa. | El producto elegido y el monto aprobado. La decisión de la institución ya está (134): `decision`, su motivo, quién y cuándo, y el historial en `decisiones`. |
| **Direcciones** | No hay un registro. El perfil sólo cuenta cuántas trajo la fuente y si alguna se actualizó en los últimos 12 meses. | Una tabla de direcciones de la persona, con su origen. |
| **Empleos** | Dentro del perfil de cada consulta (`standard_profile.laboral` y las fuentes de ingreso). El Expediente los muestra en «Con qué paga». | Un historial propio por empleo, que no dependa de la última consulta. |
| **Referencias** | No existe. | Todo. |
| **Documentos** | No existe un repositorio. `DOCUMENTOS_DE_CONFIRMACION` sólo dice qué pedir. | Dónde se guardan, quién los ve y cuánto duran: es dato personal (LOPDP). |
| **Scores** | `analysis_results` (score de 1 a 999, recomendación, versión del marco, lo que leyó el modelo) y `consultas_aval` (el score de Aval, que es otro). | Nada: ya es un historial por persona. |
| **Créditos** | El Laboratorio los carga desde los archivos de la institución (`lab_operaciones`), sólo para medir el motor. | El crédito como entidad de la persona en producción. |

## 3. Qué cambia en el producto

**Hecho el 2026-10-12** (la parte de nombres):
- «Buscar persona» en el Inicio, y la búsqueda abre el Expediente. Si la
  persona nunca se consultó, el Expediente lo dice y ofrece consultarla.
- «Personas por segmento», «Personas clasificadas», «Personas en cartera»: donde
  «cliente» quería decir cualquier persona consultada.
- Score en lugar de Puntaje en 55 textos (el Laboratorio, la Bandeja, el
  Expediente, Monitoreo y el informe que se exporta); los 16 que ya decían
  «score» (Aval, la exportación analítica) quedaron como estaban.
- «Perfil del Cliente» **no se tocó**: es nombre de producto (menú, exportaciones y
  unos 25 textos). El 2026-10-18 el negocio decidió que pasa a «Perfil de la
  Persona» (sección 5); sigue sin aplicarse.

**Propuesta**, para cuando el estado de la persona exista:
1. **El estado se calcula, no se escribe a mano.** Sale de los hechos: hay una
   solicitud abierta, la institución decidió, hay un crédito desembolsado, ya
   no queda saldo. Se guarda su historial (cuándo cambió y por qué) para la
   auditoría.
2. **El Expediente se ordena como el árbol**: resumen, solicitudes, empleos e
   ingresos, scores, créditos, documentos. Hoy va por «Lo que decide este caso /
   Con qué paga / Todo lo recopilado / Qué dijo el modelo / Qué pasó con este
   caso».
3. **La bandeja gana el estado de la persona** como filtro y columna. Hoy su
   «Estado» es otra cosa: el del análisis (Analizado, Sin analizar, No se
   completó, La consulta falló). Hay que llamarlos distinto.
4. **Monitoreo muestra el embudo**: cuántas personas hay en cada estado y cuántas
   pasan de uno al siguiente. Es la pantalla que hoy no existe y que la jefatura
   necesita.
5. **El Laboratorio usa los mismos nombres**: «Con crédito» son las personas que
   llegaron a Cliente activo o Cliente cerrado; «Sin crédito», las que se
   quedaron antes.
6. **La API para las instituciones** (`api/openapi.yaml`) usa estos nombres para
   sus recursos y estados: persona, solicitud, score, crédito. **Alineado el
   2026-10-12 en lo que la v1 ya tiene:**
   - la decisión de la institución es `aprobado` / `rechazado` (antes decía
     `negado`, la palabra del modelo), más `aprobado_con_condiciones` y
     `desistido`;
   - el score y la recomendación (`aprobar`, `revisar`, `negar`) van aparte;
   - el `estado` del contrato es el de la evaluación, y lo dice. El de la
     persona y el crédito no están en la v1: esperan que se construyan los
     estados. Si se exponen, el de la persona va como `estadoDeLaPersona` y
     tiene que evitar el código `en_proceso`, que ya es un estado de la
     evaluación (el segundo estado de la persona se llama «En proceso»);
   - la solicitud ya está en el contrato (`solicitudDeCredito`, `modalidad`) y
     su evaluación trae `capacidadDePago` aparte de la recomendación del
     modelo (2026-10-17 y 18).

## 4. Lo que hay que respetar al escribir una pantalla

- Decir de quién se habla: una **persona**, una **solicitud**, un **score**, un
  **crédito**. Un conteo dice qué cuenta: «2.572 personas», no «2.572 clientes».
- «Cliente» sólo con crédito. Si una pantalla habla de todas las personas
  consultadas, es «persona», aunque diga «cliente» desde hace tiempo.
- El **estado de la persona** y el **estado del análisis** son dos cosas. No se
  los llama los dos «Estado» en la misma pantalla.
- **La recomendación del modelo** (Aprobar / Revisar / Negar) **no es la decisión
  de la solicitud** (Aprobado / Rechazado): la primera aconseja y la segunda la
  toma la institución. Una pantalla no los mezcla.

El control de textos (`scripts/revisar-textos.mjs`) corta con «puntaje» y avisa
de cada «cliente» que no sea «Cliente activo» o «Cliente
cerrado».

## 5. Lo que se decidió y lo que queda abierto

### Decidido el 2026-10-18

Cuatro de los puntos que estaban abiertos los cerró el negocio. **Aplicados el
mismo día** (134): el estado de la persona se calcula y se ve en la solicitud,
la decisión la marca el analista en `/solicitud/:id`, y «Perfil de la Persona»
se renombró con `scripts/renombrar-textos.mjs` (24 textos), con una regla en el
control que corta con el nombre viejo.

1. **El segundo estado se llama «En proceso».** Reemplaza a «Solicitante». Se
   había propuesto «En evaluación» (recomendada), «En trámite», «Postulante» y
   «Aspirante»; el negocio eligió otro nombre. Ojo: `en_proceso` ya es un estado
   de la evaluación en `api/openapi.yaml` (`Estado`). Si el de la persona se
   expone, va como `estadoDeLaPersona` y los dos no pueden tener el mismo código.
2. **Quien fue rechazado o desistió tiene un estado propio, «No aprobado».** Es
   la respuesta a «¿y el que no pasa?». Corresponde a las decisiones `rechazado`
   y `desistido` del contrato.
3. **La decisión de la institución (Aprobado / Rechazado) la marca el analista
   en la solicitud.** No la calcula el modelo ni una regla. Se guarda en la
   solicitud (134), con motivo obligatorio; también «Desistió», que se puede
   marcar antes de que termine la evaluación y la detiene.
4. **«Perfil del Cliente» pasa a «Perfil de la Persona»** (el menú, las
   exportaciones —la hoja del Excel de lotes se llama así— y unos 25 textos). Se
   hace junto con los estados.

### Contestado antes

5. **¿Quién decide Preaprobado?** El modelo: lo decidió el negocio el
   2026-10-17 (P3 de `docs/plan-demo-ifi.md`, sección 0.1). El estado se sigue
   calculando de los hechos (sección 3, propuesta 1).

### Sigue abierto

6. **Cómo se calcula el paso de «En proceso» a «Preaprobado» cuando el modelo
   recomienda «Revisar»** (la zona gris del modelo): ¿sigue En proceso hasta
   que alguien decide? Y si una persona «No aprobada» vuelve a pedir un crédito,
   ¿vuelve a «En proceso»? El negocio no lo dijo. **Se construyó así hasta que
   diga otra cosa**: con Revisar o Negar la persona sigue En proceso hasta que el
   analista decide (el modelo aconseja, no rechaza), y manda la última solicitud,
   así que quien vuelve a pedir pasa a En proceso. Cambiarlo es tocar
   `estado-de-la-persona.ts` y su prueba.
7. **¿«Negación» o «Rechazo»?** La tarjeta grande del Expediente dice «Negación»
   (el dictamen del modelo); el diagrama de la solicitud dice «Rechazado». Se dejó
   «Negación» y se separó el modelo de la decisión (sección 4), pero el negocio
   puede preferir un solo verbo para los dos.
8. **«Explorador de la fuente de datos».** Se interpretó «fuentes», en la respuesta
   del negocio, como aceptar la recomendación (el nombre largo). Si quería dejar
   «Explorador de Fuentes», es un cambio de una línea en `navegacion.js` y en la
   regla del control.
