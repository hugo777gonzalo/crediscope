# Propuesta: marco-v23 — las fuentes de ingreso en el análisis con IA

Estado: **implementado y desplegado el 2026-09-26** (migración 086, seis
funciones). Validado sin llamar al modelo (sección 7). La prueba con el
modelo queda para correr con las 14 cédulas elegidas.

El negocio pidió llamarlo **perfil del modelo** (`perfilDelModelo`): la
única fuente consolidada que el modelo consulta. Donde este documento dice
"vista", es eso.

## 1. Diagnóstico (medido el 2026-09-26)

**El marco no sabe leer la clasificación de ingresos.** marco-v22 recorre
15 grupos del perfil y `fuentesIngreso` no es uno de ellos. El modelo
recibe la clasificación entera (~1.000 caracteres de mediana: segmento,
estado, motivo, fuentes, monto, señales, pedidos) sin una sola instrucción
sobre cómo leerla. Llega con los nombres internos —`pisoIngresoMensualReportado`,
`reportada_por_tercero`, `autodeclarada_en_minimo`, `indirecta`,
`senalesDeEscala`— que el negocio retiró de la pantalla y que el marco
prohíbe repetir, pero no traduce. Nada le impide escribir "piso de
ingreso", "evidencia autodeclarada" o "el ingreso real puede ser mayor".

**Lo que el analista ve en pantalla y el modelo no** (hoy se recorta con
`sinDetalleDeIngresos()`, o ni siquiera está en el perfil):

| Dato | En pantalla | Al modelo |
|---|---|---|
| Perfil laboral (dependiente / independiente / con empleados / afiliación voluntaria) | sí | no: vive en una columna aparte |
| Indicios de ingreso mayor | sí | no: se calculan en la pantalla |
| Continuidad laboral | sí | no: va en `detalle` |
| Meses con aporte, promedio, variación anual | sí | no: va en `detalle` |
| Tamaño del negocio con cantidad de empleados | sí | a medias: la nómina sí, la cantidad no |
| Quién declara (Empleador privado, Empresa propia…) | sí | no: llega el código interno |

**Lo que el modelo recibe y no debería:** `fuentesIngreso.correccion` (el
texto anterior a la migración 081, un dato de auditoría) y dos montos de
ingreso sin decirle cuál manda: `laboral.ingresoPromedioUltimos6Meses` (del
mecanizado) y `pisoIngresoMensualReportado` (lo reportado en el corte).

**Instrucciones del marco que quedaron desalineadas con fuentes-v8:**
- "empleosActuales es la mejor fuente de estabilidad/capacidad": el
  propio patrono aparece ahí como un empleo (0502937691 figura empleado
  de sí mismo, con cargo "ADMINISTRADOR"). `clienteEsSuPropioEmpleador`
  lo corrige a medias. Hay 31 personas en ese caso en la cartera.
- No hay regla contra suponer un ingreso mayor sin fundamento, ni contra
  las generalidades de segmento ("riesgo de despido", "crisis del
  sector") que el negocio sacó de la pantalla.

**Tres caminos al modelo, tres armados distintos:**

| Camino | Campos que el admin deshabilitó | Ajustes vigentes | Ingresos |
|---|---|---|---|
| `analyze-client` (el análisis) | se ocultan | se suman | `sinDetalleDeIngresos` |
| `correr-backtest` (calibración) | **no se ocultan** | **sólo los candidatos** | `sinDetalleDeIngresos` |
| `analizar-feedback` (informe) | no aplica | no aplica | extracto propio de 20 campos, **sin nada de ingresos v8** |

Hoy no se nota: no hay campos deshabilitados y el criterio vigente no
tiene ajustes. Pero el backtest dice "corre en las mismas condiciones que
producción" y no es cierto.

**Lo que condiciona la validación:** marco-v22 nunca corrió (0 análisis;
el último, del 23/09, es v21) y no hay resultados reales de créditos
(`feedback_creditos` = 0). No se puede validar contra incumplimientos: se
valida el comportamiento del texto (sección 4).

## 2. Qué recibe el modelo: una sola vista

Una función nueva, `_shared/vista-modelo.ts` → `perfilParaElModelo(perfil,
camposDeshabilitados)`, reemplaza a `sinDetalleDeIngresos` y a
`redactDisabledFields` como **única puerta** al modelo. Los tres caminos la
usan. Arma `fuentesIngreso` con los nombres del negocio (los de la tabla
de CLAUDE.md), desde el perfil guardado:

```json
"fuentesIngreso": {
  "segmento": "Independiente",
  "estado": "Por confirmar",
  "condicionesDeLaSegmentacion": "100% del ingreso reportado en el corte 2026-08 viene de trabajo por cuenta propia. Se afilia como patrono de su propio negocio…",
  "informacionIess": "2026-08",
  "sinInformacionActualEnElIess": false,
  "mesesSinAportar": null,
  "ingresoReportadoIess": 482,
  "esIngresoMinimoSbu": true,
  "aportes": [
    { "tipo": "aporte como patrono de su propio negocio", "declaradoPor": "Empresa propia", "empleador": "(nombre)", "montoMensual": 482 }
  ],
  "otrasFuentesSinMonto": [],
  "perfilLaboral": {
    "tipo": "Independiente con empleados",
    "trabajaParaUnTercero": false,
    "tieneActividadPropia": true,
    "rucActivoDesde": "2016-03-08",
    "aportaSinRucActivo": false,
    "actividadPropiaEsLaPrincipal": false
  },
  "tamanoDelNegocio": { "empleados": 2, "nomina": 964, "establecimientosActivos": 1, "obligadoContabilidad": false },
  "indiciosIngresoMayor": [
    "Paga una nómina de $964 al mes a 2 empleados; para sí declara $482 al IESS. Sus ingresos alcanzan, al menos, para esa nómina."
  ],
  "estabilidad": {
    "continuidadLaboralMeses": 36, "continuidadVigente": true, "empleadoresEnLaContinuidad": 1,
    "mesesConAporteUltimos12": 12, "promedioReportado6Meses": 482, "variacionContraHaceUnAnio": 0
  },
  "documentosDeConfirmacion": [
    "Movimientos bancarios de los últimos 6 meses…",
    "Declaraciones de IVA de los últimos 6 meses o facturación emitida…"
  ]
}
```

- **Queda afuera, a propósito:** los aportes mes a mes (1.100 caracteres),
  los empleos de 24 meses, los textos de actividad económica y el impuesto
  a la renta (decisión del 2026-09-25: no deducir nada de la renta).
  Tampoco van `correccion` ni `recalculo`.
- **Costo estimado** con lo medido sobre 300 perfiles reales: hoy el
  mensaje pesa ~6.700 caracteres de mediana y la parte de ingresos ~1.000.
  Continuidad y regularidad suman ~350, y perfil laboral, tamaño e indicios
  unos 600 más. Los textos por fuente que se dejan de mandar restan ~100.
  Queda en ~7.600 (+~250 tokens). El marco sigue cacheado.
- **Un solo vocabulario.** `quienDeclara()`, `ETIQUETA_SEGMENTO` y
  `ETIQUETA_ESTADO` pasan de `src/lib/` a `_shared/`: la pantalla y el
  modelo leen los nombres del mismo archivo (regla de CLAUDE.md: una sola
  implementación).
- **El admin puede apagarlos.** Los campos de la vista entran a
  `standard_profile_field_config` como grupo `fuentesIngreso`, igual que el
  resto.
- **Los tres caminos iguales.** El backtest pasa a ocultar los campos
  deshabilitados y a sumar los ajustes vigentes antes que los candidatos.
  El extracto del informe de retroalimentación toma segmento, estado,
  ingreso reportado, perfil laboral e indicios de la misma vista.
- **Perfiles viejos.** Si se reutiliza un perfil anterior a v8 (por
  `profileId`), la vista funciona igual: el perfil laboral v2 reconoce al
  propio patrono por el nombre, y los indicios por nómina sólo salen desde
  v8. Hoy los 2.567 clientes reales tienen su último perfil en v8.
- **Regla nueva para CLAUDE.md:** cualquier cambio en la vista es una
  versión nueva del marco, porque cambia lo que el modelo lee.

## 3. Qué cambia en el texto del marco (borrador)

El grupo 8 pasa a ser **"8. fuentes de ingreso, laboral y tributario (MISMO
peso)"**. Se mantiene el orden de importancia que definió el negocio.
Borrador del texto nuevo:

> **fuentesIngreso — de qué vive la persona y quién declara el monto.**
> Todo monto es lo REPORTADO al IESS, no lo que gana. Llamalo "ingreso
> reportado al IESS", y "Ingreso Mínimo SBU" cuando esIngresoMinimoSbu es
> true. Nunca escribas "piso".
>
> - **No supongas un ingreso mayor.** Aportar sobre el SBU es lo que hacen
>   quienes ganan el básico y muchos afiliados por cuenta propia. Sólo podés
>   decir que la capacidad probablemente supera lo reportado si
>   indiciosIngresoMayor trae algo, y citando ese indicio. Sin indicios, lo
>   reportado es la mejor evidencia de capacidad que hay.
> - **estado:** "Confirmado por un tercero" = un empleador declara y paga
>   sobre ese monto (verificable). "Por confirmar" = el monto lo eligió la
>   propia persona o no existe: la capacidad no está evidenciada, NO es una
>   señal negativa de comportamiento. "Sin determinar" = no hay evidencia
>   de ingreso.
> - **segmento "Sin datos: la fuente no respondió"** no dice nada de la
>   persona: va a missingInfo y nunca penaliza. **"Informal o sin
>   actividad"** no distingue trabajo informal de falta de ingresos:
>   trátalo como incertidumbre, no como ausencia de ingreso.
> - **declaradoPor** en cada aporte: Empleador privado / público /
>   diplomático / externo (organismo internacional) / otros = un tercero lo
>   reporta. "Empresa propia" = se afilia como patrono de su propio negocio
>   o aporta por su cuenta con RUC activo: la base la elige ella.
>   "Afiliación voluntaria" = aporta por su cuenta sin negocio registrado:
>   puede ser sólo para no perder la seguridad social, y no prueba trabajo.
> - **Propio patrono.** Si un aporte es "Empresa propia" y la persona
>   figura en empleosActuales como empleada de sí misma
>   (clienteEsSuPropioEmpleador), es UN negocio propio, no un empleo con un
>   tercero: no lo cuentes como estabilidad laboral de dependiente ni como
>   "más de un empleo".
> - **perfilLaboral** separa dos preguntas: ¿trabaja para un tercero?
>   ¿tiene actividad propia? "Dependiente con actividad propia" tiene un
>   ingreso medible (el empleo) y un negocio sin monto: el negocio no suma
>   al ingreso reportado, pero diversifica. Si actividadPropiaEsLaPrincipal
>   es true, paga más en nómina que lo que le reportan: su ingreso
>   principal probablemente es el negocio.
> - **tamanoDelNegocio** (empleados, nómina, establecimientos activos,
>   obligado a llevar contabilidad) dice la escala de la actividad, no el
>   ingreso. La nómina es un piso de lo que la actividad genera: eso ya
>   está dicho en indiciosIngresoMayor cuando corresponde.
> - **estabilidad.** continuidadLaboralMeses mide cuánto lleva trabajando
>   sin cortes de más de 2 meses, aunque haya cambiado de empleo: es mejor
>   señal que antiguedadEmpleoActualMeses para quien cambió de trabajo sin
>   parar. mesesConAporteUltimos12 menor que 12 son huecos reales.
>   variacionContraHaceUnAnio negativa es una caída de lo reportado.
> - **sinInformacionActualEnElIess** true: aportaba y dejó de aparecer hace
>   mesesSinAportar meses. Es una pérdida reciente de ingreso formal: pesa
>   en capacidad, no en comportamiento de pago.
> - **Qué monto usar.** ingresoReportadoIess es lo del mes de información
>   del IESS, sumando todas las fuentes vigentes. ingresoPromedioUltimos6Meses
>   (laboral) es el promedio del mecanizado. Si difieren, nombrá el
>   reportado y usá el promedio para hablar de tendencia.
> - **documentosDeConfirmacion** son los documentos que el sistema ya le
>   pide al analista. Si el caso depende del ingreso, tus
>   accionesSugeridas tienen que ser coherentes con esa lista: podés
>   precisarlos para este cliente, no contradecirlos ni pedir otros que la
>   reemplacen.

En **CÓMO ESCRIBIR** se agregan dos reglas:

> - Usá los nombres que usa la pantalla: Segmento, Ingreso Mínimo SBU,
>   Empresa propia, Afiliación voluntaria, Nómina, Establecimientos Activos
>   (SRI), Tamaño del negocio, Documentos de Confirmación de Ingresos.
>   Prohibido: "piso", "autodeclarada", "evidencia indirecta", "señales de
>   escala", "reportada por un tercero", "segmento provisional".
> - No escribas generalidades de un segmento como si fueran de la persona:
>   "riesgo de despido", "quiebra del empleador", "crisis del sector",
>   "depende de decisiones políticas". Sólo si el perfil trae un hecho que
>   las sostenga (el empleador está en liquidación, dejó de aparecer en el
>   IESS…).

## 4. Validación antes de desplegar

Sin resultados reales, se valida que el texto haga lo que el marco dice.

1. **Muestra fija de 30 perfiles reales**, elegida por criterio y guardada
   en `research/` (no en el repo):

   | Grupo | Cantidad |
   |---|---|
   | Propio patrono | 8 |
   | Dependiente con actividad propia | 5 |
   | SBU con indicios | 5 |
   | SBU sin indicios | 4 |
   | Sin información actual en el IESS | 3 |
   | Informal o sin actividad | 2 |
   | Jubilado con ingreso adicional | 2 |
   | Sin datos | 1 |
2. **v22 contra v23 sobre la misma muestra**, con un guion local
   (`scripts/comparar-marcos.mjs`) que use la misma vista y el mismo modelo
   que producción: 60 llamadas. El costo se registra en `llm_llamadas`.
3. **Controles automáticos sobre las 30 salidas de v23.** Tienen que dar 0:
   - textos con "piso", "autodeclarada", "indirecta" o "señales de escala";
   - afirmaciones de ingreso mayor ("puede ganar más", "ingreso real
     mayor") en casos sin indicios;
   - generalidades de segmento ("riesgo de despido", "crisis del sector")
     sin un hecho detrás;
   - propios patronos descritos como empleados de un tercero.

   Y además:
   - en los casos "Por confirmar", accionesSugeridas coherentes con
     documentosDeConfirmacion;
   - las diferencias de score se informan caso por caso, sin esperar una
     dirección.
4. **Revisión del negocio** de 10 casos elegidos entre los que más
   cambiaron.

Esta corrida es también la primera prueba de v22 (los tres estados de
metaConsulta), que nunca corrió.

## 5. Orden de implementación

1. `_shared/nombres-ingresos.ts`: los nombres pasan de `src/lib/`; la
   pantalla importa de ahí.
2. `_shared/vista-modelo.ts`, probada sobre el crudo de la cartera: la
   vista sale igual para un perfil rearmado y para el guardado.
3. marco-v23: texto y `MARCO_VERSION`.
4. Validación (sección 4) con el código local, sin desplegar.
5. Migración 086:
   - la fila `marco-v23` en `scoring_rules_versions` (sin ella, el insert
     del análisis rompe la clave foránea);
   - los campos `fuentesIngreso.*` en `standard_profile_field_config`.

   Se aplica ANTES de desplegar.
6. Desplegar analyze-client, correr-backtest y analizar-feedback. Un
   análisis en vivo de un caso de la muestra, leyendo la salida.
7. CLAUDE.md, la página de reglas y la memoria. Commit.

## 6. Decisiones

Tomadas por el negocio el 2026-09-26:

1. El modelo recibe **perfil laboral, indicios de ingreso mayor,
   estabilidad y tamaño del negocio**: lo que el analista ya ve en
   pantalla.
2. El impuesto a la renta sigue afuera (decisión del 25/09).
3. **"Empresa propia" en el SBU sin indicios es neutro:** por confirmar.
   El modelo pide los documentos de confirmación y no baja el score por
   eso. No verificable no es mal comportamiento.
4. Los 10 casos de la validación los revisa **el usuario**, lado a lado
   (v22 contra v23), antes de desplegar.

Queda como en la propuesta, sin objeción: los ingresos van dentro del
grupo 8, con el mismo peso que laboral y tributario, sin cambiar el orden
de los grupos.

Cambio posterior del negocio: **no se corre el modelo ni la comparación
v22 contra v23 antes de desplegar.** La validación previa es sin el modelo
(sección 7). Después se corren con v23 perfiles con bastante información
para ver las mejoras.

## 7. Implementación y validación (2026-09-26)

**Qué quedó:**
- `_shared/perfil-del-modelo.ts`: `armarPerfilDelModelo()`,
  `mensajeParaElModelo()` e `ingresosDelPerfilDelModelo()`. Reemplazan a
  `sinDetalleDeIngresos()` y a `redactDisabledFields()`, que se borraron
  para que no quede otra puerta.
- `_shared/nombres-ingresos.ts`: los nombres del negocio. La pantalla los
  reexporta desde `src/lib/fuentesIngresoConsolidado.js`.
- `tamanoDelNegocio()` en `fuentes-ingreso.ts`, que usan la pantalla y el
  perfil del modelo.
- Los tres caminos por la misma puerta:
  - analyze-client;
  - correr-backtest: ahora oculta los campos deshabilitados y suma los
    ajustes vigentes antes que los candidatos;
  - analizar-feedback: el extracto trae los ingresos.
- marco-v23: grupo 8 y dos reglas de escritura. El marco pasó de ~25.800
  a ~31.800 caracteres (~8.100 a ~10.000 tokens, cacheado).
- Migración 086: la fila `marco-v23` y 15 campos `fuentesIngreso.*` en
  la configuración de campos.
- Desplegadas analyze-client, correr-backtest, analizar-feedback,
  proponer-ajustes, structure-client y procesar-lote. Las seis arrancan
  (preflight 200).

**Validación sin el modelo** (`scripts/validar-perfil-del-modelo.mjs`),
sobre el último perfil de los 2.807 clientes: **0 fallas** en las 6
reglas.
- Se arma sin errores.
- Trae exactamente los campos de la vista y ningún campo interno.
- Sin "piso" ni nombres retirados.
- El perfil laboral coincide con la columna guardada.
- Los 31 propios patronos llegan como "Empresa propia" y no figuran
  trabajando para un tercero.
- Los campos deshabilitados llegan en null.

Además, 315 perfiles traen indicios, 2.567 estabilidad y 1.816 tamaño del
negocio. El mensaje al modelo pasó de 6.534 a 6.838 caracteres de
mediana: crece menos de lo estimado porque ya no viajan los textos
internos de cada fuente.

**Para la prueba con el modelo:** 14 cédulas en
`research/cedulas_validacion_marco_v23.txt` (fuera del repositorio):
- 10 perfiles con mucha información y con historial crediticio, uno por
  tipo de caso:
  - propio patrono;
  - público con negocio propio;
  - dependiente privado con monto alto;
  - SBU con nómina grande;
  - afiliación voluntaria;
  - sin información actual en el IESS;
  - jubilado con ingreso adicional;
  - ingresos mixtos;
  - obligado a contabilidad;
  - informal con historial.
- Las 3 cédulas Pichucho Muñoz que el negocio puede validar de primera
  mano.
- 0500836663.

Qué mirar en cada salida (los controles de la sección 4):
- que no diga "piso";
- que no suponga ingreso mayor sin indicio;
- que no escriba generalidades de segmento;
- que no trate al propio patrono como empleado;
- que las acciones sugeridas sean coherentes con los Documentos de
  Confirmación de Ingresos.
