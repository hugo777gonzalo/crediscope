# Banco de casos de oro

Casos con el dictamen que daría un jefe de crédito y con lo que el análisis debe y no
debe decir. **Ninguna versión del marco, de lo que lee el modelo (perfil del modelo) o
del modelo se despliega sin pasarlo** (reestructuración del núcleo aprobada por el
negocio el 2026-11-11). La meta es tener de 50 a 100 casos; la versión inicial trae 25.

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `casos/<id>.json` | Un caso por archivo. El nombre es la referencia del caso. |
| `formato.mjs` | La definición del formato: campos, valores permitidos, tipos de afirmación, el catálogo de acciones y la red contra datos personales. La usan la prueba y el corredor. |
| `../probar-banco-de-casos.mjs` | La prueba del formato. Corre en el control `guiones` de cada PR, sin base, sin red y sin modelo. |

## Los casos de hoy (25)

| Fuente | Casos |
|---|---|
| El piloto de la revisión del análisis (2026-11-06) | 12 |
| Las observaciones del negocio O-1 a O-5 (`docs/observaciones-del-negocio.md`) | 5 |
| El sandbox de la API (`0000000001` a `0000000008`) | 8 |

## El formato

Un JSON por caso, con estos campos (en este orden):

| Campo | Qué lleva |
|---|---|
| `formato` | La versión del formato (hoy 1). |
| `id` | `c-xxxxxxxx` si es una persona real (los 8 primeros caracteres de `clients.id`), `sandbox-00xxxxxxxx` si es una identificación del sandbox. |
| `fuente` | `piloto_revision_del_analisis`, `observacion_del_negocio` o `sandbox_api`. |
| `de_donde_sale` | La carpeta, la observación o el archivo del que salió el caso. |
| `tema` | Lo que prueba, en una línea. |
| `perfil` | Real: `{ origen: "base", cual: "del_analisis_revisado", fecha_del_analisis, marco_del_analisis }` o `{ origen: "base", cual: "ultimo" }`. Sandbox: `{ origen: "sandbox", identificacion, modalidad }`. |
| `buro_equifax` | `necesario` (sin una consulta de Equifax a la fecha del perfil, el caso no aplica), `si_hay` (se usa si existe) o `no`. |
| `flujo_esperado` | Por dónde termina la evaluación: `analisis_del_modelo`, `negado_por_control`, `sin_veredicto`, `persona_no_encontrada`, `fuentes_no_disponibles` o `consulta_incompleta`. Sólo el primero llama al modelo. |
| `dictamen` | Lo que diría el jefe de crédito, de 2 a 4 líneas. |
| `recomendacion_hoy` | Lo que **se entrega** hoy: `aprobar`, `revisar` o `negar` (null sin veredicto). Es la entrega, no la respuesta cruda del modelo: con una consulta parcial, el modelo puede decir «aprobar» y la entrega dice «revisar». |
| `hoy_tambien_aceptable` | Opcional: otra recomendación de hoy que no es un error en un caso de borde. Nunca salta de aprobar a negar. El mismo perfil analizado dos veces cambia 1 de cada 13 recomendaciones (`supabase/CLAUDE.md`). |
| `salida_version_mayor` | `aprobacion_directa`, `aprobar`, `cambio_de_condiciones`, `condicionado`, `revisar` o `negar`. Tiene que ser compatible con la de hoy (`COMPATIBLES_CON_HOY`). |
| `afirmaciones.automaticas` | Lo que un guion comprueba solo (abajo). Cada una dice `porque`: qué error del modelo atrapa. |
| `afirmaciones.de_juicio` | `debe` y `no_debe`: afirmaciones redactadas para un verificador (una persona o un modelo revisor). No se automatizan todavía. |
| `ajustes_por_las_decisiones` | Opcional: qué cambió respecto del dictamen de origen por una decisión del 2026-11-11, con la clave de la decisión. |

### Las afirmaciones automáticas

Se comprueban contra la respuesta del modelo (`ESQUEMA_RESPUESTA` de
`supabase/functions/_shared/llm-scoring.ts`):

| Tipo | Parámetros | Pasa si |
|---|---|---|
| `score_entre` | `min`, `max` | El score está en el rango (los dos incluidos). Los rangos dejan el ruido de unos 40 puntos. |
| `indicador` | `indicador` (`riesgo` o `historial`), `valores` | El indicador es uno de los valores. |
| `texto_prohibido` | `patron`, `campos` | El patrón (expresión regular, sin distinguir mayúsculas) no aparece en ninguno de los campos. |
| `texto_requerido` | `patron`, `campos` | Aparece en al menos uno. |
| `accion` | `accion` | Alguna acción sugerida calza con el patrón de ese tipo en `TIPOS_DE_ACCION`. |
| `primera_frase` | `patron` | La primera oración de `reasoning` lo contiene. |

`campos` es una lista de `positives`, `negatives`, `reasoning`, `accionesSugeridas`,
`missingInfo` o `todo` (la respuesta entera).

### Lo que un caso real no lleva

El repositorio es público. Un caso real guarda su referencia y el corredor carga el
perfil de la base al correr: **ni el perfil, ni cifras, ni nombres**. Una cifra de la
persona se escribe como relación («la deuda supera el ingreso de un año», «la cuota se
come casi todo el ingreso»), nunca como monto. La prueba corta un caso real con un
número de 9 dígitos o más, un monto, una cifra con miles o decimales, un número de
cuatro cifras que no es un año o una palabra de 4 letras o más en mayúsculas que no
sea una sigla permitida (un nombre copiado de la fuente). Los patrones de las
afirmaciones no se revisan: pueden necesitar un año. La cédula de cada referencia
está en `research/casos-reales/registro-de-casos.md`, fuera de git: correr
`node scripts/registrar-casos-reales.mjs` desde la carpeta principal después de sumar
un caso real.

### Cómo se suma un caso

1. Un archivo `casos/<id>.json` con el formato de arriba.
2. `node scripts/probar-banco-de-casos.mjs`.
3. Si es real, `node scripts/registrar-casos-reales.mjs` (la referencia tiene que
   resolver a una sola persona).

## El corredor (todavía no existe)

Es otra tarea. Lo que tiene que hacer, para que un caso se pueda correr igual hoy y
dentro de seis meses:

**Entradas**
- Los casos (`leerCasos()` y `validarCaso()` de `formato.mjs`: no corre un caso que la
  prueba rechazaría).
- La versión a probar: el marco (`MARCO_VERSION`), lo que lee el modelo
  (`armarPerfilDelModelo()`) y el modelo (`CONFIG_LLM`), tomados del código de la rama,
  no copiados.
- El perfil de cada caso real, leído de la base en sólo lectura: el del análisis
  revisado (el de `fecha_del_analisis` y `marco_del_analisis` de esa persona) o el
  último. La consulta de Equifax, con `ultimaConsultaDeEquifax()` a la fecha del
  perfil. Si `buro_equifax` es `necesario` y no hay consulta, el caso es «no aplica».
- El perfil de cada caso del sandbox, de `proveedorInfo1Simulado()` con
  `buildStandardProfile()`, como hace `sandbox-pasos.ts`.
- Los controles (`evaluarControlesBloqueo()`), el freno de fuentes obligatorias
  (`decisionDeLaConsulta()`) y la regla de la entrega (`recomendacionDeLaEntrega()`):
  el flujo esperado se comprueba con el código real, antes del modelo.

**Salidas**
- Por caso: pasó, falló (con cada afirmación automática que no se cumplió y lo que
  dijo el modelo), no aplica (con el motivo) o error.
- La recomendación entregada contra `recomendacion_hoy` y `hoy_tambien_aceptable`, y
  la tabla de recomendación esperada contra obtenida.
- Las afirmaciones de juicio, junto a la respuesta del modelo, para el verificador.
- El costo de la corrida (`llm_llamadas` o la API de lotes).
- Un archivo en `research/banco-de-casos-de-oro/<fecha>/` (fuera de git: lleva lo que
  escribió el modelo sobre personas reales) y un resumen sin datos de personas por
  consola. Sale con 1 si un caso falla.

**Modo en seco** (`--seco`, el que corre por omisión)
- Valida los casos, carga cada perfil, corre los controles y el freno y arma el pedido
  al modelo con `armarPedidoScoring()`, **sin llamar al modelo**.
- Dice qué casos llegarían al modelo, cuáles no aplican y el costo estimado.
- Correr con el modelo es una prueba masiva: necesita la autorización del negocio con
  el costo (`CLAUDE.md`, «Cómo se trabaja»). Ningún análisis del corredor se guarda en
  `analysis_results` ni cuenta como una evaluación.
- El ruido del modelo (unos 40 puntos y 1 de cada 13 recomendaciones) obliga a
  correr cada caso más de una vez antes de dar una falla por cierta; cuántas, lo
  decide el diseño del corredor.
