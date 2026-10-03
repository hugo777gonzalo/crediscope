# Laboratorio de Inteligencia de Negocio › Riesgo de Crédito

Diseño del módulo que **reemplaza por completo a Retroalimentación**.
Versión 2 (2026-10-03), con las decisiones del negocio del mismo día.
Estado: **fases 0 a 5 implementadas el 2026-10-03** (migraciones 090 y 094
a 097, pantallas en `/laboratorio`). Retroalimentación ya no existe. Las
consultas de cada pantalla se probaron contra la base; **falta verlas en
el navegador con una sesión de admin**. La fase 6 (con costo) espera
autorización.

Todo lo de las fases 1 a 5 se construye y se prueba **sin gastar en el
modelo de lenguaje**. Lo único que cuesta está aislado en la fase 6 y se
corre sólo con autorización del negocio.

---

## 1. Qué es y qué no es

**Es** el lugar donde nuestro equipo mide si el motor de riesgo acertó,
busca qué datos del cliente anticipaban el impago y arma una propuesta de
ajuste respaldada por números. Lo que recibe la institución financiera
(IFI) es el resultado: un **Informe de Desempeño del Modelo** y una
**Propuesta de Ajustes**.

**No es** una pantalla para la IFI, ni un tablero, ni algo que cambie el
motor solo. El Laboratorio produce propuestas; una persona las aprueba, y
lo aprobado entra al motor por los caminos que ya existen (una versión
nueva del marco o del criterio vigente).

**Nombre** (decidido por el negocio): Laboratorio de Inteligencia de
Negocio, con **Riesgo de Crédito** como primera área. En pantalla,
*backtesting* es **prueba retrospectiva**.

## 2. Decisiones del negocio

| Punto | Decisión |
|---|---|
| Crudo de Novadata | Se guarda (090, Storage `crudo-novadata`), como el de Aval. |
| Lo que leyó el modelo | Se guarda (090, `analysis_results.mensaje_al_modelo`). |
| Archivo de la IFI | El de la sección 6.3. |
| Ventana | 12 y 24 meses; 24 es la prueba más exigente (deja ver los impagos tardíos). |
| Definición de default | 90 días de mora o más, o una calificación peor que B2 (C1, C2, D, E). En bancos, cooperativas, mutualistas y retail grande; el retail pequeño no cuenta. Falta definir "retail grande". |
| Días de mora por operación | Cooperativas (Novadata), Aval y Equifax sí; bancos de Novadata no: ahí manda la calificación. |
| Negados | Se juzgan reconsultando el buró a 12 y 24 meses (fase 6, con costo de consulta). |
| Decisión de la IFI | Sin IFI real, supuesto: todo crédito del archivo se desembolsó. Para el modelo: aprobar y revisar = aprobado; negar = negado. |
| "Observar" | Retirada en marco-v27. Un análisis viejo la tiene: se lee como revisar. |
| Sin datos reales | Se desarrolla con una **cartera sintética** (sección 8). |
| Lote de análisis reales | Postergado: no hay presupuesto, y no hace falta para desarrollar (sección 8). |
| Pruebas con el modelo | Cualquier prueba masiva, sólo con autorización del negocio. |

## 3. Lo que hay hoy: diagnóstico de Retroalimentación

Revisado el 2026-10-03, contra el código y la base.

### 3.1 Qué es

Un ciclo de cinco etapas para una jefatura de crédito: descargar una
plantilla, cargar el resultado de los créditos (`feedback_paquetes`,
`feedback_creditos`), generar un informe con el modelo de lenguaje
(`analizar-feedback`, `feedback_informes`), pedirle propuestas al modelo
(`proponer-ajustes`, `feedback_propuestas`), aprobarlas y probarlas
re-analizando hasta 20 casos (`correr-backtest`, `feedback_backtests`).
Pantallas: Retroalimentación, Informe, Versiones del criterio y el
componente de propuestas.

**Nunca se usó con datos reales:** las cinco tablas `feedback_*` tienen 0
filas. Hubo 16 llamadas al modelo de prueba.

### 3.2 Lo que se conserva (las ideas eran buenas)

- Las estadísticas se calculan con código, no con el modelo.
- Se evalúa con el perfil **congelado** del día del análisis; nunca se
  reconsulta (el perfil de hoy ya muestra la mora y el modelo "acertaría").
- Una propuesta nunca entra sola: aprobar y poner en vigencia son dos pasos.
- La prueba retrospectiva mira impagos **y** buenos pagadores: si sólo
  mira a los que cayeron, endurecer siempre parece mejorar.
- El criterio vigente está versionado (`criterio_versiones`, con huella y
  reversión), y cada análisis dice con qué versión se hizo (15 lo hacen).
- Cada llamada al modelo queda registrada con su costo.

### 3.3 Errores de diseño

| # | Error | Consecuencia |
|---|---|---|
| 1 | El resultado del crédito es una marca (`hubo_default`) sin fechas de default ni días de mora por ventana. | No hay ventanas de 12/24 meses ni madurez: un crédito de 3 meses sin mora cuenta como "pagó". |
| 2 | No hay fecha de corte del archivo ni definición de default. | El mismo archivo no se puede reinterpretar con otra definición; nada es reproducible. |
| 3 | La matriz cuenta sólo "negamos y cayó / negamos y pagó / aprobamos y cayó". | Se ignoran revisar, el puntaje (sin AUC, KS ni tramos) y los análisis fallidos, que se leen como score 500. |
| 4 | El informe lo escribe el modelo de lenguaje, que además "separa los impagos previsibles de los que no". | Juicio retrospectivo ("sabiendo que cayó, era obvio"), no reproducible y con costo. |
| 5 | Las propuestas las redacta el modelo y entran al motor como **texto libre** sumado al marco ("ajustes aprobados"). | Se mezclan puntaje y política (lo que `docs/arquitectura-fabrica-de-credito.md` pide separar), y el efecto de un texto sobre el modelo no se puede medir antes de ponerlo. |
| 6 | La prueba retrospectiva re-analiza hasta 20 casos dentro de una función de Supabase. | 20 casos no distinguen nada con un ruido de ±40 puntos (medido el 2026-10-03), y dos tandas lentas pasan los 150 s de la función. |
| 7 | El vínculo crédito → análisis se calcula en el navegador con `.in()` sobre listas enteras. | Se rompe pasadas ~350 cédulas y se corta en 1.000 filas (ya medido). |
| 8 | Guardar un paquete son dos inserts sin transacción. | Un paquete puede quedar con totales y sin créditos. |
| 9 | Todas las tablas se leen con cualquier sesión autenticada. | Cualquier analista ve el resultado de pago de toda la cartera. |
| 10 | La pantalla está pensada para que la use la IFI. | Choca con el modelo de operación decidido: lo usa nuestro equipo. |
| 11 | No distingue datos sintéticos. | Ya pasó con las 240 cédulas sintéticas de Aval, que tuercen todo conteo. |

### 3.4 Acoplamientos que el reemplazo tiene que cuidar

- **El motor en producción lee el criterio desde `feedback_propuestas`**:
  `ajustes_vigentes_actuales()` arma los ajustes del criterio con las
  propuestas aprobadas y en vigencia, `registrar_version_criterio()` las
  versiona por disparador y `revertir_criterio()` las toca. Hoy no hay
  ningún ajuste vigente y existe una sola versión del criterio (sin
  ajustes), pero esas tres funciones tienen que pasar a la tabla nueva
  **antes** de borrar la vieja.
- `src/lib/exportAnalitico.js` (Reportes › Descargas) toma el resultado
  real del crédito de `feedback_creditos`.
- `correr-backtest` lee `feedback_creditos` y `feedback_propuestas`.
- Rutas `/retroalimentacion/*` y la entrada del menú.

## 4. Principios que no se negocian

1. **Ninguna conclusión sale de un perfil tomado después del desembolso.**
   Es fuga de información: el buró de hoy ya muestra la mora de ese
   crédito. El vínculo marca esos casos y quedan fuera de todo lo
   predictivo.
2. **Una operación inmadura no es buena.** Sin 12 (o 24) meses observados,
   queda fuera de esa ventana.
3. **Cada resultado dice su tamaño**: operaciones, malos, y una advertencia
   cuando la muestra no alcanza (sección 7.5).
4. **Lo calculado es reproducible**: un corte se congela, y el mismo corte
   da el mismo número dentro de un año.
5. **Lo sintético se ve sintético**: marca en la base, franja en cada
   pantalla, y nunca entra a un informe para una IFI.
6. **El modelo de lenguaje no calcula ni redacta conclusiones.** Sólo
   aparece en la fase 6, para simular un marco candidato, y con
   autorización.
7. **Puntaje y política van separados.** Una propuesta dice si cambia cómo
   el modelo mide el riesgo o qué hace la IFI con ese riesgo.
8. **Asociación no es causa**, y con cien variables alguna sale fuerte por
   azar: toda variable fuerte se valida en un corte posterior antes de
   proponerla.

## 5. El recorrido de un dato

```
 Consulta ──► crudo (Storage) ──► perfil estandarizado ──► perfil del modelo ──► respuesta
                                         │                          │               │
                                         └──────────── congelado en el análisis ────┘
                                                              │
 Archivo de la IFI ──► carga ──► vínculo ──► conciliación ──► corte (congelado)
                                                              │
                         ┌───────────────┬───────────────────┼───────────────────┐
                    desempeño       variables          simulación           casos
                    del modelo      (qué anticipa)     de política          (trazabilidad)
                         └───────────────┴─────────┬─────────┴───────────────────┘
                                                   ▼
                                            propuesta de ajuste ──► aprobación ──► motor
                                                   ▼
                                    Informe de Desempeño del Modelo (exportado)
```

## 6. Modelo de datos

Todas las tablas nuevas empiezan con `lab_`, son sólo de admin (sección
10) y se crean sin tocar las `feedback_*`, que se retiran al final
(sección 11).

### 6.1 `lab_definiciones_default` — versionada e inmutable

| Columna | Ejemplo / regla |
|---|---|
| `id`, `nombre` | "Negocio 2026-10: 90 días o peor que B2" |
| `dias_mora_minimo` | 90 |
| `calificacion_peor_que` | `B2` (cuenta C1, C2, D, E) |
| `cuenta_castigo`, `cuenta_reestructuracion`, `cuenta_demanda` | true |
| `sistemas` | `{bancos, cooperativas, mutualistas, retail_grande}` |
| `creada_por`, `created_at` | — |

Sin política de `update`: una definición nueva es una fila nueva. Así un
corte viejo sigue diciendo con qué definición se hizo.

### 6.2 `lab_cargas` — cada archivo

| Columna | Para qué |
|---|---|
| `id`, `etiqueta`, `institucion` | "Cooperativa X, desembolsos 2025-T1". `institucion` es texto hasta que exista la entidad (sección 13). |
| `origen` | `ifi`, `sintetica`, `reconsulta_buro` |
| `es_sintetica` | marca que viaja a todo lo que se calcule con ella |
| `regla_plantada` | jsonb, sólo en sintéticas (sección 8) |
| `archivo_ruta` | el archivo original, en un depósito privado de Storage |
| `fecha_corte` | hasta cuándo se observó el comportamiento |
| `estado` | `cargando` → `lista` (vinculada y conciliada) · o `con_errores` / `anulada` |
| `conciliacion` | jsonb con los conteos de la sección 6.4 |
| `cargada_por`, `created_at` | — |

**La carga es atómica por estado**, no por un insert gigante: se crea en
`cargando`, las operaciones se insertan en tandas de 500, y una función
la cierra (vincula y concilia) y la pasa a `lista`. Una carga que
quedó a medias se ve como `cargando` y nada la usa. Así se corrige el error
8 sin depender del tamaño de un pedido.

### 6.3 `lab_operaciones` — una fila por crédito

| Columna | Obligatoria | Nota |
|---|---|---|
| `carga_id`, `cedula`, `numero_operacion` | sí | único por (`carga_id`, `numero_operacion`) |
| `producto`, `monto`, `plazo_meses` | sí | segmentan |
| `fecha_desembolso` | sí | desde cuándo se mide |
| `estado_operacion` | sí | vigente, cancelada, castigada, reestructurada, vencida |
| `dias_mora_max_12m`, `dias_mora_max_24m` | sí | null = no observado (inmadura) |
| `fecha_primer_default` | no | tiempo hasta el impago |
| `observaciones` | no | lectura cualitativa de la IFI |
| `sintetico` | — | jsonb con puntaje y recomendación inventados, sólo en cargas sintéticas |
| `client_id`, `analysis_result_id`, `client_profile_id` | — | los pone el vínculo |
| `vinculo` | — | ver 6.4 |
| `dias_consulta_desembolso` | — | antigüedad de la consulta respecto del desembolso |

### 6.4 El vínculo y la conciliación

Lo hace una función SQL (`lab_vincular_carga`), en la base: sin listas en
la URL y sin el corte de 1.000 filas (errores 7). Para cada operación:

1. Cliente por cédula. Si no existe → `sin_consulta`.
2. El análisis más reciente **sin fallo** hecho hasta el fin del día del
   desembolso en hora de Ecuador, y no más de 90 días antes (parámetro).
   Su perfil es el que dice el análisis (`client_profile_id`) si el vínculo
   es confiable (`exacto` o `inferido_anterior`, ver 034/035).
3. Sin análisis, el perfil más reciente en la misma ventana →
   `solo_perfil` (sirve para variables, no para desempeño del modelo).
4. Si sólo hay consultas **posteriores** al desembolso →
   `consulta_posterior`: queda afuera de todo lo predictivo (principio 1).
5. Si hay varias operaciones de la misma persona en el corte, se marcan:
   para variables cuenta la primera de la cohorte (una persona no pesa
   doble).

La conciliación queda en la carga y en pantalla, nunca en silencio:

| Conteo | Qué dice |
|---|---|
| operaciones | total del archivo |
| `exacto` / `solo_perfil` | utilizables (para desempeño / para variables) |
| `sin_consulta` | nunca pasaron por CrediScope |
| `consulta_posterior` | consultadas después del desembolso: fuga |
| análisis fallidos | el más cercano falló (era un score 500 neutro) |
| bloqueados | negados por control de bloqueo: se cuentan aparte |
| inmaduras a 12 / a 24 meses | sin ventana completa |
| filas rechazadas | con el motivo de cada una |

### 6.5 `lab_cortes` y `lab_corte_operaciones` — la población congelada

`lab_cortes`: `nombre`, `carga_ids`, `definicion_default_id`,
`ventana_meses` (12 o 24), `filtros` (productos, fechas, versiones del
marco), `es_sintetico` (heredado de sus cargas: no se mezclan reales con
sintéticas), `congelado_en`, `creado_por`.

`lab_corte_operaciones` es la foto al congelar, una fila por operación:
`incluida`, `motivo_exclusion`, `malo` (aplicando la definición y la
ventana), `puntaje`, `recomendacion` (observar → revisar),
`marco_version`, `structure_version`, `veredicto_origen`. Se copian a
propósito: si mañana se recalcula un perfil o se corrige un análisis, el
corte sigue diciendo lo que dijo (principio 4).

De dónde sale el puntaje de cada operación: del análisis vinculado (sin
fallo); en una carga sintética, **siempre** de `lab_operaciones.sintetico`.
El resultado de una carga sintética lo inventa la regla plantada, y medir
un puntaje real contra un resultado inventado no mide nada (corregido al
implementarlo). Una operación sin puntaje queda fuera del desempeño, pero
sirve para variables.

### 6.6 `lab_resultados`

`corte_id`, `tipo` (`desempeno`, `variables`, `simulacion_politica`,
`simulacion_marco`), `metodologia` (versión del cálculo y parámetros),
`resultado` (jsonb), `n`, `n_malos`, `created_at`. Un resultado nunca se
pisa: recalcular agrega una fila.

### 6.7 `lab_propuestas` — reemplaza a `feedback_propuestas`

| Columna | Nota |
|---|---|
| `titulo`, `hallazgo` | qué se vio, en palabras del negocio |
| `tipo` | `ajuste_criterio` · `cambio_marco` · `regla_politica` · `dato_nuevo` |
| `evidencia` | jsonb: ids de resultados, números y tamaños de muestra |
| `cambio_propuesto` | el texto del ajuste, el cambio de marco o la regla |
| `impacto_estimado` | jsonb: malos evitados, buenos perdidos, aprobados que cambian |
| `limitaciones`, `validacion_posterior` | qué no prueba y cómo se va a medir después |
| `estado` | `borrador` → `revisada` → `presentada` → `aprobada` → `aplicada`; o `rechazada` / `retirada` |
| `vigente_desde` | sólo `ajuste_criterio`: entra al criterio vigente |
| `aplicada_en` | versión del marco o del criterio que la llevó |
| `es_sintetica` | una propuesta sobre datos sintéticos no se puede presentar |

Los cuatro tipos y por dónde entran al motor:

| Tipo | Ejemplo | Entra por |
|---|---|---|
| `ajuste_criterio` | "Una pensión en mora pesa como dos demandas de cobro." | `criterio_versiones` (dato, reversible), como hoy |
| `cambio_marco` | Reescribir cómo se lee la continuidad laboral. | Versión nueva del marco (código y `scoring_rules_versions`) |
| `regla_politica` | "Negar si la deuda vencida propia supera USD 2.000." | Hoy, recomendación a la IFI; mañana, la capa de política de la fábrica de crédito |
| `dato_nuevo` | Una variable que el modelo no recibe y anticipa el impago. | Versión nueva de la estructura y del perfil del modelo |

## 7. Cálculos

Todos en funciones SQL `security invoker` (respetan la seguridad de la
sección 10 y no chocan con el corte de 1.000 filas), como
`metricas_gerenciales()`. Ninguno llama al modelo.

### 7.1 Desempeño del modelo (`lab_desempeno`)

- **Recomendación × resultado**: aprobar / revisar / negar contra bueno /
  malo, con la tasa de malos de cada recomendación y su intervalo de
  confianza (Wilson). Los bloqueados van en su propia fila: su puntaje está
  forzado a 1 por política y no dice nada del modelo, así que tampoco
  entran al AUC ni a los tramos. Los errores se nombran por lo que cuestan:
  **aprobado que cayó** (capital perdido) y **negado que habría pagado**
  (negocio perdido, medible sólo con reconsultas).
- **Poder de orden del puntaje**: AUC (probabilidad de que un bueno tenga
  mejor puntaje que un malo, calculada por rangos), Gini (2·AUC − 1) y KS
  (la mayor separación entre las distribuciones de buenos y malos), con
  intervalo para el AUC (Hanley–McNeil).
- **Tasa de malos por tramo de puntaje** (de a 100 puntos): tiene que bajar
  cuando sube el puntaje. Si no baja, el puntaje no ordena, aunque el AUC
  diga otra cosa.
- **Por versión del marco**: nunca se mezclan versiones en un número;
  cada versión es una fila.
- **Estabilidad (PSI)** entre dos cortes: si la población cambió, el
  modelo puede estar midiendo otra cosa.
- **El ruido del modelo como piso**: una diferencia de puntaje menor que
  ~40 o un cambio de 1 en 13 recomendaciones no se atribuye a nada (medido
  el 2026-10-03).

### 7.2 Variables: qué anticipa el impago (`lab_variables`)

Sobre el perfil congelado de cada operación (no el de hoy):

- Un **catálogo de variables** (`lab_catalogo_variables`): ruta en el
  perfil estandarizado, nombre de negocio, tipo, y si el modelo la recibe
  (está en el perfil del modelo y no está deshabilitada).
- Por variable: cobertura (cuántos la tienen), tasa de malos por tramo
  (cuantiles con un mínimo de casos por tramo), **valor de información
  (IV)** y peso de la evidencia (WoE) con suavizado.
- Lectura del IV: menos de 0,02 nada · 0,02–0,1 débil · 0,1–0,3 media ·
  más de 0,3 fuerte · **más de 0,5, sospecha de fuga** (una variable no
  puede anticipar tan bien salvo que contenga el resultado).
- El cruce que justifica el Laboratorio: **variables fuertes que el modelo
  no recibe**, y variables que recibe pero que no aparecen en los negativos
  de los aprobados que cayeron.

### 7.3 Simulación de política (`lab_simular_politica`)

Una regla como dato (`{"si": [{"variable": "comportamientoBancario.deudaEnAtraso", "op": ">", "valor": 2000}], "entonces": "negar"}`)
aplicada al corte, contra el motor vigente: cuántos aprobados pasan a
negados, cuántos malos se habrían evitado, cuántos buenos se habrían
perdido, y la nueva tasa de malos de los aprobados. Gratis y reproducible:
no llama al modelo.

### 7.4 Casos y trazabilidad

Para cada operación del corte, el recorrido completo: crudo (Storage) →
perfil estandarizado → perfil del modelo (`mensaje_al_modelo`) → marco
(versión) → respuesta (positivos, negativos, recomendación) → resultado.
Con dos filtros que importan: **aprobados que cayeron** y **negados que
pagaron**. Es la lectura cualitativa que antes hacía el modelo de lenguaje,
ahora hecha por una persona con todo a la vista.

### 7.5 Tamaño de muestra

Cada resultado lleva `n` y `n_malos`, y la pantalla advierte: con menos de
30 malos, el AUC y las tasas por recomendación son orientativos; con menos
de 100, el IV por variable es ruido. Las advertencias no se pueden ocultar.

## 8. Cartera sintética

Sirve para desarrollar y **probar que los cálculos encuentran lo que
tienen que encontrar**. Se genera con un script (`scripts/generar-cartera-sintetica.mjs`),
reproducible por semilla, sobre los 2.567 perfiles reales (sin las 240
cédulas sintéticas de Aval):

1. A cada perfil se le inventa una operación: desembolso unos días después
   del perfil (para que sea anterior por construcción), monto, plazo y
   producto plausibles. La fecha de corte es ficticia, 25 meses después:
   sólo una carga sintética puede tener fecha de corte futura.
2. **El default sale de una regla plantada**, no al azar: una función
   logística de cuatro variables reales del perfil (calificación propia en
   el buró, deuda en atraso propia, continuidad laboral y demandas de cobro)
   más ruido, calibrada a ~10% de malos. Los días de mora a 12 y 24 meses
   salen coherentes con eso.
3. **Un puntaje sintético** para las operaciones sin análisis real: la misma
   regla, con ruido de ±40 puntos (el ruido medido del modelo), y la
   recomendación por umbrales. Va en `lab_operaciones.sintetico`, nunca en
   `analysis_results`.
4. La regla y la semilla quedan en `lab_cargas.regla_plantada`.

Con eso cada cálculo tiene una respuesta conocida: las cuatro variables
plantadas tienen que salir arriba en el IV; el AUC tiene que dar lo que da
la regla con ese ruido; una simulación que niega por la variable plantada
tiene que evitar malos. Si un cálculo no encuentra una señal que nosotros
pusimos, está mal.

**Lo que no prueba:** la cartera sintética no dice nada del motor real. El
AUC sintético mide cuánto se parece el puntaje inventado a la regla
inventada.

**Por qué no hace falta el lote de análisis reales para desarrollar:**
carga, vínculo, conciliación, cortes y variables no necesitan puntajes; el
desempeño se desarrolla con los puntajes sintéticos. El lote real
(`scripts/analizar-en-lote.mjs`, listo) sólo hace falta para validar con
datos verdaderos.

## 9. Pantallas

Todo bajo **Laboratorio** en el menú, sólo para admin; la entrada
"Retroalimentación" desaparece.

| Ruta | Qué muestra |
|---|---|
| `/laboratorio` | Cargas y cortes, con su estado. Franja visible en todo lo sintético. |
| `/laboratorio/cargas/nueva` | Descargar la plantilla, subir el archivo, ver los errores fila por fila antes de aceptar. |
| `/laboratorio/cargas/:id` | La conciliación de la sección 6.4, con descarga de las operaciones excluidas y su motivo. |
| `/laboratorio/cortes/nuevo` | Elegir cargas, definición de default, ventana y filtros; congelar. |
| `/laboratorio/cortes/:id` | Pestañas **Desempeño · Variables · Simulación · Casos**, cada número con su `n` y sus advertencias. |
| `/laboratorio/propuestas` | Propuestas por estado; el detalle muestra la evidencia enlazada. |
| `/laboratorio/criterio` | El criterio vigente y su historial, con reversión (hoy `/retroalimentacion/versiones`). |

El **Informe de Desempeño del Modelo** se exporta desde un corte real con
sus propuestas presentadas: no existe para cortes sintéticos.

Diseño de pantalla (memoria del proyecto: pantallas concretas): primero el
número que importa y su tamaño de muestra; el detalle, plegado; sin jerga;
sin conclusiones que el número no sostenga.

## 10. Seguridad

- Todas las tablas `lab_*`: lectura y escritura sólo de admin
  (`profiles.rol = 'admin'`), igual que hoy la escritura de
  `feedback_*`, pero también la lectura (corrige el error 9).
- Las funciones de cálculo son `security invoker`: un analista que las
  llame no ve nada.
- Los archivos de la IFI van a un depósito privado de Storage, sólo admin.
- `lab_definiciones_default` sin `update`: inmutable.
- Una IFI no entra al Laboratorio. Recibe un documento exportado hasta que
  exista la separación por institución (sección 13).

## 11. Retiro de Retroalimentación

En este orden, por la regla 8 de `CLAUDE.md` (desplegar antes de borrar):

1. **Migración**: tablas y funciones `lab_*`, sin tocar nada viejo.
2. **Migración**: `ajustes_vigentes_actuales()`, el disparador de
   `criterio_versiones` y `revertir_criterio()` pasan a leer y escribir
   `lab_propuestas`. Las dos tablas están vacías, así que el criterio
   vigente no cambia (se verifica: misma huella antes y después).
3. **Código y despliegue**: pantallas del Laboratorio; se van las de
   Retroalimentación y sus rutas; `exportAnalitico.js` toma el resultado
   real de `lab_operaciones`; `correr-backtest` se retira (su sucesor es la
   simulación de marco de la fase 6, por lotes y fuera de los 150 s).
4. **Se dan de baja** `analizar-feedback` y `proponer-ajustes` en Supabase,
   y se borran su código y `marco-retroalimentacion.ts`.
5. **Recién entonces**, migración que borra `feedback_*`. El historial de
   `llm_llamadas` de esas funciones queda.

## 12. Fases y criterios de aceptación

| Fase | Qué | Costo de modelo | Se da por hecha cuando |
|---|---|---|---|
| 0 | Crudo y mensaje al modelo guardados | — | **Hecha (090)** |
| 1 | Tablas `lab_*`, plantilla, carga, vínculo, conciliación, generador sintético | 0 | **Hecha (094).** Una carga sintética de 2.567 operaciones se vincula entera; una carga con errores se rechaza con el motivo de cada fila; nada se pierde pasadas las 1.000 filas. |
| 2 | Cortes y desempeño | 0 | **Hecha (095): AUC 0,7407 en la base = 0,7407 del script.** Un corte congelado da el mismo resultado al recalcularlo; el AUC y el KS en SQL coinciden con un cálculo independiente en el script; la tasa por tramo baja como la regla plantada. |
| 3 | Variables | 0 | **Hecha (095): plantadas 1ª, 2ª, 5ª y 8ª; no relacionadas bajo 0,1.** Las cuatro variables plantadas están entre las primeras por IV, y toda variable que las supere está correlacionada con alguna plantada (documentado); las no relacionadas quedan bajo 0,1; la bandera de fuga se prende con una variable que contiene el resultado. |
| 4 | Simulación de política y casos | 0 | **Hecha (095).** Una regla sobre la variable plantada evita malos y muestra los buenos que pierde; el recorrido de un caso se abre completo. |
| 5 | Propuestas, criterio y retiro de Retroalimentación | 0 | **Hecha (096, 097): misma huella del criterio; tablas `feedback_*` borradas.** Las tres funciones del criterio leen `lab_propuestas` con la misma huella; Retroalimentación ya no existe; Descargas sigue funcionando. |
| 6 | Simulación de marco candidato y reconsulta de negados | **sí, con autorización** | Lotes por `analizar-en-lote.mjs`; reconsultas con costo de Novadata. |

Las fases 2 y 3 pueden ir en paralelo después de la 1.

## 13. Riesgos y preguntas abiertas

| Tema | Estado |
|---|---|
| ¿Una instalación para varias IFI o una por IFI? | Abierta. Define cómo se separan los datos; mientras tanto, `institucion` es texto y sólo admin ve todo. |
| ¿Qué es "retail grande"? | Abierta. Hace falta para la definición de default. |
| Base legal y costo de reconsultar a un negado | Abierta (fase 6). |
| ¿Cuánto tiempo se conserva el crudo? | Abierta (LOPDP). |
| La decisión de la IFI no se registra | Supuesto del negocio hasta que exista la solicitud (fábrica de crédito). |
| Cartera vigente de la IFI con perfiles posteriores al desembolso | Riesgo de fuga: el vínculo la marca `consulta_posterior` y la excluye. |
| Muestras chicas con datos reales | Las advertencias de la sección 7.5 no se pueden ocultar. |
| Uso de lo sintético fuera de lugar | Marca en la base, franja en pantalla, informe bloqueado. |

---

## Anexo: correcciones metodológicas a la idea original

Lo que se discutió el 2026-10-03 y quedó incorporado arriba.

- **Una marca de default no alcanza**: hacen falta fechas y días de mora
  por ventana (6.3).
- **Ventana y definición son dos perillas** (6.1, 6.5).
- **A los negados no se los juzga con la cartera de la IFI**: sólo cae
  quien recibió el crédito. Reconsulta del buró (fase 6), excepciones de la
  IFI, y como último recurso inferencia estadística.
- **La recomendación no es la decisión de la IFI** (supuesto, sección 2).
- **AUC, Gini y KS van sobre el puntaje**; la recomendación se mide con su
  tasa de malos (7.1).
- **La cartera vigente sólo describe, no predice** (principio 1).
- **El modelo no responde siempre igual**: ±40 puntos de ruido (7.1).
- **"Sin modelo de lenguaje" vale para analizar, no para simular un marco**
  (fase 6).
- **Técnicas**: IV y WoE primero (explicables); regresión logística como
  retador; random forest para ordenar importancia; K-means describe, no
  predice. Correr regresión o random forest es para después, en un proceso
  aparte: no hace falta para las fases 1 a 5.
- **Dónde corre**: SQL para todo lo de las fases 1 a 5; no hay Python en el
  proyecto y las funciones de Supabase se cortan a los 150 s.
