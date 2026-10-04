# Laboratorio de Inteligencia de Negocio › Riesgo de Crédito

Diseño del módulo que **reemplaza por completo a Retroalimentación**.
Versión 3 (2026-10-03): la 2 más el **ciclo simulado de un año** (sección
14), decidido por el negocio el mismo día.
Estado: **fases 0 a 5 implementadas el 2026-10-03** (migraciones 090 y 094
a 097, pantallas en `/laboratorio`). Retroalimentación ya no existe. **La
fase 6 (el ciclo simulado) está hecha y corrida** (098-104; resultados en
14.10 y, el explorador del crudo, 14.11). La 7 (marco candidato, con costo) espera autorización. Las
pantallas que pidió el negocio (`docs/laboratorio-pantallas.md`) están
construidas, fases A a F y módulos 1 a 3 (100 a 109, sección 15). Los
cálculos de cada pantalla se probaron en Node contra los cortes reales;
**falta verlas en el navegador con una sesión de admin**.

Todo lo de las fases 1 a 6 se construye y se prueba **sin gastar en el
modelo de lenguaje** (consultar Novadata no le cuesta al negocio por ahora).
Lo único que cuesta está aislado en la fase 7 y se corre sólo con
autorización del negocio.

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
| Negados | Se juzgan reconsultando el buró a 12 y 24 meses (fase 6). Novadata no le cobra al negocio por ahora. |
| Ciclo simulado | Se arma hoy el ciclo completo de la primera prueba retrospectiva, con el mismo código que la real (sección 14). |
| Quién recibe crédito en la simulación | Según la recomendación: aprobar mucho más que revisar, negar casi nunca; ~300 en total. |
| La foto "un año después" | La reconsulta real de toda la cartera, con doce meses de eventos sintéticos plantados encima. |
| Informe de una simulación | Se exporta, con la franja "SIMULACIÓN — no presentar" en cada hoja. |
| Decisión de la IFI | Sin IFI real, supuesto: todo crédito del archivo se desembolsó. Para el modelo: aprobar y revisar = aprobado; negar = negado. |
| "Observar" | Retirada en marco-v27. Un análisis viejo la tiene: se lee como revisar. |
| Sin datos reales | Se desarrolla con una **cartera sintética** (sección 8). |
| Lote de análisis reales | Postergado: no hay presupuesto, y no hace falta para desarrollar (sección 8). |
| Pruebas con el modelo | Cualquier prueba masiva, sólo con autorización del negocio. |
| Pantallas, estadística, instituciones, calibración, archivo | Las cinco decisiones del 2026-10-03, en `docs/laboratorio-pantallas.md`: fases A a F en orden; lo interactivo en el navegador y lo pesado con guiones de Python locales; instituciones y proyectos como entidades del Laboratorio; calibración con la función puntaje → probabilidad estimada en una cohorte y probada en la siguiente; el archivo pide fecha del primer impago si cayó, canal y la decisión de la institución en lo no desembolsado. |

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
| `cuota_mensual` | no | sin ella, "la cuota no cabía" queda como no medible (098) |
| `canal` | no | para el desempeño por segmento (101) |

La fecha del primer impago es obligatoria si la operación llegó a 90 días o
más, o está castigada o en demanda (101: la validación de la carga la exige
fila por fila y la base también). La hoja opcional "Solicitudes no
desembolsadas" va a `lab_decisiones_institucion` (cédula, fecha, negada /
desistió / en trámite).
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
| `/laboratorio/cortes/:id` | Pestañas **Desempeño · Matriz de confusión · Variables · Simulación · Casos**, cada número con su `n` y sus advertencias. Un corte con solicitudes suma **Con y sin crédito** y **Motivos del impago**; si es sintético, **Calificación de la simulación**. Variables elige la población: con el crédito de la institución o todas las solicitudes observadas. |
| `/laboratorio/propuestas` | Propuestas por estado; el detalle muestra la evidencia enlazada. |
| `/laboratorio/criterio` | El criterio vigente y su historial, con reversión (hoy `/retroalimentacion/versiones`). |

El **Informe de Desempeño del Modelo** se exporta desde un corte real con
sus propuestas presentadas. Desde un corte sintético se exporta igual, para
probar la salida, con la franja "SIMULACIÓN — no presentar" en cada hoja
(decisión del 2026-10-03).

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
| 6 | Ciclo simulado de un año: solicitudes y desembolsos, reconsulta, eventos, resultado de los no desembolsados, motivos del impago (sección 14) | 0 | **Hecha (098-104), resultados en 14.10; el explorador del crudo en 14.11.** Faltan las dos piezas de la corrida real (14.8). |
| 7 | Simulación de marco candidato | **sí, con autorización** | Lotes por `analizar-en-lote.mjs` sobre los perfiles congelados; ~USD 6-10 por marco sobre 300 análisis (estimado). |

Las fases 2 y 3 pueden ir en paralelo después de la 1.

## 13. Riesgos y preguntas abiertas

| Tema | Estado |
|---|---|
| ¿Una instalación para varias IFI o una por IFI? | Abierta. Define cómo se separan los datos. Decidido el 2026-10-03: instituciones y proyectos como entidades del Laboratorio, sólo admin, sin esperar esta respuesta (todavía no construidas). |
| Calibración | Decidida el 2026-10-03: el motor da puntaje, no probabilidad; se estima puntaje → probabilidad en una cohorte y se prueba en la siguiente. |
| ¿Qué es "retail grande"? | Abierta. Hace falta para la definición de default. |
| Base legal para reconsultar a un negado | Abierta. El costo no: Novadata no cobra por ahora. |
| ¿Cuánto tiempo se conserva el crudo? | Abierta (LOPDP). |
| La decisión de la IFI no se registra | Supuesto del negocio hasta que exista la solicitud (fábrica de crédito). |
| Cartera vigente de la IFI con perfiles posteriores al desembolso | Riesgo de fuga: el vínculo la marca `consulta_posterior` y la excluye. |
| Muestras chicas con datos reales | Las advertencias de la sección 7.5 no se pueden ocultar. |
| Uso de lo sintético fuera de lugar | Marca en la base, franja en pantalla, informe con franja "SIMULACIÓN". |

## 14. Ciclo simulado de un año (fase 6)

Decidido por el negocio el 2026-10-03. No se puede esperar un año para
tener la primera prueba retrospectiva real, así que el ciclo se arma y se
prueba hoy, entero, para que con la primera institución real sea correrlo
y no construirlo. **Es el mismo código que la corrida real**; sólo cambian
dos entradas: el archivo de la institución (hoy inventado) y la foto "un
año después" (hoy, reconsulta real más eventos plantados).

### 14.1 La línea de tiempo

| Momento | En la simulación | En la corrida real |
|---|---|---|
| t0, día del análisis ("hace un año") | La consulta guardada de cada persona de la cartera (crudo en Storage, septiembre de 2026) | La consulta del día de la solicitud |
| Desembolso | Entre t0 y la reconsulta, para que el vínculo nunca tome la reconsulta como perfil del análisis | El del archivo |
| t1, "un año después" | La reconsulta real del 2026-10-03 (2.567 personas, crudo en Storage y en `research/novadata-raw-2026-10-03/`) **con doce meses de eventos sintéticos encima**, fechados entre t0 y t0 + 12 meses | La reconsulta del día de la prueba |
| Fecha de corte del archivo | t0 + 12 meses (futura: sólo una carga sintética puede tenerla) | La del archivo |

Primero a 12 meses; la de 24 es la misma máquina con otro horizonte. Los
cambios reales de la semana entre t0 y la reconsulta quedan como ruido
real: son pocos, y el detector (14.5) tiene que tolerarlos.

### 14.2 Solicitudes y desembolsos

Las 2.567 personas son las **solicitudes del año**. Cada una lleva su
recomendación: la del modelo si se analizó; si no, una sintética (la regla
plantada con el ruido medido, como en la sección 8). La institución
simulada desembolsa según la recomendación, aprobar mucho más que revisar
y negar casi nunca (esos pocos son los "la institución prestó igual"),
hasta ~300 créditos. El resto son **solicitudes no desembolsadas**: no están
en el archivo, y su resultado sólo se conoce por la reconsulta.

En la corrida real, las solicitudes son los análisis del período (mientras
no exista la entidad institución, todos) y las no desembolsadas, las que
no aparecen en el archivo.

### 14.3 La verdad plantada

Para cada persona, y guardada aparte en una **bitácora** que el análisis
nunca lee (sólo sirve para calificar, 14.7):

1. **Riesgo de base**, de su perfil en t0, en tres capas: datos que el
   modelo lee (calificación, deuda en atraso, demandas de cobro,
   continuidad), **un dato del perfil que el modelo no recibe** y **un
   campo que sólo está en el crudo**. Las dos últimas son la pregunta del
   Laboratorio: qué no pudo ver el modelo.
2. **Eventos del año** (14.4), con probabilidades que dependen en parte de
   la fragilidad visible en t0: quien tiene empleo discontinuo pierde el
   trabajo más seguido. Así existe algo que encontrar en "¿se podía ver?".
3. **El impago**, de la suma del riesgo de base, los eventos y, si recibió
   crédito, el peso de la cuota sobre su ingreso. Cada malo lleva su motivo
   plantado.
4. **Lo que el buró esconde**: una parte de los que cayeron se pone al día
   antes de t1, para medir cuánto se le escapa a una foto.

### 14.4 Catálogo de eventos (lo que se modifica en el crudo de t1)

| Evento | Dónde, en el crudo | Qué es |
|---|---|---|
| Nuestro crédito | Operación nueva de la institución simulada en el buró, con la calificación que corresponde a los días de mora del archivo | Coherencia: el archivo y el buró dicen lo mismo |
| Crédito nuevo en otra institución | Operación nueva en bancos, Diners, cooperativas o retail | Causa interna posterior: otra institución lo sobreendeudó |
| Un crédito que ya tenía cae en mora | La misma operación, con peor calificación y saldo vencido (días de mora en cooperativas) | Consecuencia, o señal temprana si empezó antes que la nuestra |
| Demanda de cobro | Función Judicial, demandas en su contra | Consecuencia |
| Demanda civil que no es de cobro | Función Judicial, demandas en su contra | Causa externa |
| Pensión alimenticia nueva | SUPA | Causa externa |
| Proceso en Fiscalía como procesado | Denuncias, con su cédula | Causa externa |
| Pérdida del trabajo | Aportes del IESS que se cortan en un mes | Causa externa |
| Cierre del negocio | SRI: RUC suspendido, establecimientos cerrados | Causa externa |
| Trabajo nuevo o mejor ingreso | Aportes del IESS con un empleador nuevo | Protege |

El crudo de t1 sintético va a Storage bajo `simulacion/`; **nunca es un
`client_profiles`** ni toca la ficha de nadie. Se arma con el código real
(`buildStandardProfile`, fuentes de ingreso) como cualquier consulta.

### 14.5 Lo que hace el Laboratorio (igual en la simulación y en la real)

1. **Rearmar t0** desde su crudo guardado, con la versión vigente de la
   estructura y de las fuentes de ingreso. Gratis y sin fuga: es la
   información del día del análisis, en la versión de hoy. **Las variables
   salen de acá**, nunca de t1.
2. **Armar t1** con el mismo código.
3. **Detectar los eventos** comparando t0 con t1, con su fecha cuando la
   fuente la trae. Sin leer la bitácora.
4. **Resultado**: con crédito, el archivo; sin crédito, el buró de t1. Cayó
   si una operación nueva (de una entidad que ya reportaba) o una que ya
   tenía y en t0 no estaba en default cumple la definición de default. Sólo
   se puede observar a quien tuvo crédito con alguien: el resto queda fuera,
   ni bueno ni malo. Los hechos se guardan crudos (calificación, días,
   castigo, juicio) y la definición la aplica el corte.
5. **Motivo del impago**, de cada malo, con todos los que apliquen y
   ordenados por fecha:
   - *interno, visible en t0*: la cuota no cabía en el ingreso; el ingreso
     estaba por confirmar o sin determinar (capacidad no medible); deuda
     previa alta;
   - *interno, posterior*: otra institución le prestó antes de la caída;
   - *externo*: pérdida del trabajo, cierre del negocio, pensión
     alimenticia, demanda civil, Fiscalía, fechados antes de la caída;
   - *consecuencias, no causas*: mora en otros créditos, demandas de cobro,
     castigo. Si la mora en otro crédito empezó antes que la nuestra, el
     problema empezó afuera;
   - *sin causa visible*.
6. **¿Se podía ver en t0?** Anticipable (estaba en el perfil: es lo que
   el modelo tiene que corregir) · vulnerabilidad visible (el golpe no se
   podía prever, pero el perfil era frágil: es materia de política, no de
   puntaje) · no anticipable. La prueba: entre quienes sufrieron el mismo
   golpe, qué tenían en t0 los que cayeron y no los que siguieron pagando.
7. Desempeño con los **cuatro cuadrantes** (recomendación × desembolso),
   variables, **exploración del crudo** (campos que no llegan al perfil y
   separan buenos de malos, con la misma vara del IV), simulación de
   reglas, casos (ahora con t0, t1, eventos y motivo), propuestas e
   informe.

### 14.6 Lo que pide a la plantilla

Una columna opcional, `cuota_mensual`. Sin ella, "la cuota no cabía" queda
como **no medible**: no se estima con una tasa supuesta.

### 14.7 Cómo se califica la simulación

| Paso | Tiene que dar |
|---|---|
| Detector de eventos | Cuántos plantados encontró y cuántos inventó, por tipo |
| Resultado de los no desembolsados | Caídas inferidas contra plantadas, y cuántas escaparon por ponerse al día antes de t1 |
| Motivo del impago | Motivo atribuido contra plantado |
| Variables y crudo | El dato que el modelo no recibe y el campo que sólo está en el crudo, arriba |
| Sesgo | AUC sólo con desembolsados contra AUC con todos (posible sólo porque conocemos la verdad) |

**Lo que no prueba**: nada sobre el motor real ni sobre la frecuencia real
de los eventos; las proporciones son inventadas y quedan en la bitácora.

### 14.8 Dónde vive y cómo se corre

| Paso | Qué | Dónde |
|---|---|---|
| Tablas | Solicitudes, reconsultas, eventos, verdad | 098 |
| Cálculos | Solicitudes en el corte, cuadrantes, motivos, calificación, variables por población | 099 |
| Simular el año | `node scripts/simular-un-anio.mjs [--seco]` | sólo simulación |
| Procesar | `node scripts/procesar-reconsultas.mjs --carga=<id> [--seco]` | simulación y real |
| Detector | `_shared/eventos-entre-consultas.ts` | Deno y Node |
| Corte | `lab_congelar_corte` congela también las solicitudes | pantalla |

Para la corrida real faltan dos piezas: armar las solicitudes desde los
análisis del período, y reconsultar en Novadata enlazando cada consulta a su
solicitud (`origen = 'novadata'`).

### 14.9 Lo que enseñó armarlo (2026-10-03)

- **El buró cambia de corte entre dos consultas.** La de septiembre traía
  el de julio y la reconsulta, el de agosto: en una semana el detector vio
  104 "créditos nuevos" en 300 personas reales.
- **Una entidad que empieza a reportar parece un aluvión de créditos
  nuevos.** Una cooperativa apareció de golpe para muchas personas que en
  t0 no tenían nada con ella. El procesamiento mira la carga entera y marca
  esas entidades: en t0 no tenían a nadie, en t1 a cinco o más. Sus
  operaciones no cuentan como crédito sacado en el año.
- **Bancos y retail vienen agrupados por entidad.** Un crédito nuevo en un
  banco donde ya tenía otro no se distingue: se ve, si acaso, como un
  deterioro.
- **Una compra de cartera parece un crédito nuevo.** En ese mes un solo
  banco sumó 45 personas de 718 (de 423 a 468); no se sabe si fue una compra
  de cartera, una campaña o un cambio en cómo reporta. En un año crecer es
  normal, así que no se filtra: queda como limitación.
- **La simulación también se equivoca.** La primera corrida eligió al azar
  la entidad de cada crédito nuevo inventado, entre todas las que aparecen en
  el buró. Juntó varios en entidades que en t0 no tenía nadie (una, un banco
  en liquidación), y el procesamiento las tomó por entidades que empezaban a
  reportar y descontó 288 créditos plantados. Ahora la entidad sale con peso
  según cuántas personas la tenían en t0. La carga quedó anulada.
- **El IESS completa el último mes después.** 81 personas tenían en la
  reconsulta un empleador en agosto de 2026 que la consulta de septiembre no
  traía para ese mismo mes. El detector los leía como "trabajo nuevo"; ahora,
  si t1 muestra al empleador en el mes del corte de t0 o antes, ya trabajaba
  ahí.
- **"El modelo lo vio" vale también sin nuestro crédito.** Un negado que
  cayó con otra institución es el acierto del modelo; contarlo sólo con
  crédito dejaba 132 de 211 malos "sin causa visible" (102).
- **El SRI corrige su registro.** En esa semana aparecieron ceses de RUC con
  fecha de 2010 a 2024 que en septiembre no estaban. Un cese anterior a t0
  no es un cierre en el año y el detector no lo cuenta.
- **El buró es una foto.** Quien cayó y se puso al día antes de la
  reconsulta no se ve. La simulación lo planta a propósito para medirlo.
- **Novadata cambió un formato sin avisar.** El estado de los
  establecimientos llega a veces abreviado ("ABI"); el detector lo encontró
  como 19 negocios "cerrados" en una semana (estructura-v13, ver
  `docs/estructura-estandarizada.md`). Comparar dos consultas de la misma
  persona es también un control de calidad de la fuente.

### 14.10 La primera corrida (2026-10-03/04)

Carga `1196978e-f9e4-4458-859b-890773af95c7` ("Ciclo simulado de un año
(semilla 1)"), corte `4e18ca83-11ae-4e91-b9c5-8623931e9560` a 12 meses con
la definición del negocio. Todo calculado y guardado en `lab_resultados`.
La carga `5e362de7-…` fue el primer intento, anulado por el error del
simulador de 14.9; se borró el 2026-10-04 con la confirmación del negocio.

| Qué | Resultado |
|---|---|
| Solicitudes | 2.565 (2 sin crudo en t0 quedaron afuera); recomendación sintética aprobar 1.108 · revisar 886 · negar 501 · bloqueado 70 |
| Desembolsados | 296 (236 aprobar, 57 revisar, 3 negar); 20 malos |
| Observadas | 2.528 (tuvieron crédito con alguien); 211 malos |
| Desempeño con los desembolsados | AUC 0,63 (0,51 a 0,75), KS 0,26: con 20 malos es ruido |
| Matriz (desembolsados) | "negar" marca malo: sensibilidad 10%, exactitud 94%; "negar o revisar": sensibilidad 40%, precisión 13% |
| Tasa por cuadrante | con crédito: aprobar 5,1% · revisar 10,5%; sin crédito: aprobar 3,5% · revisar 6,1% · negar 17,5% · bloqueado 37% |
| Negados sin crédito | 498: 261 con crédito de otro; 86 cayeron (con otro o en lo que tenían); 199 pagaron con otro; 7 sin observar |
| ¿Se podía ver? (211 malos) | el modelo lo vio 169 · se podía ver y no lo vio 7 · golpe sobre perfil frágil 6 · sobre perfil sólido 12 · ningún evento lo explica 17 |
| El mismo golpe | perdieron el trabajo 131, cayó el 17% (8% en general); los que cayeron tenían 70 meses de continuidad contra 103 y 9% con deuda en atraso contra 1% |
| Variables, todas las observadas | peor calificación 1.ª, deuda en atraso 2.ª, demandas de cobro 4.ª, continuidad 9.ª; **meses con aporte en 24, que el modelo no recibe, 6.ª y marcada** |
| Variables, sólo desembolsados | arriba teléfonos, empleos registrados, días de mora en retail: ninguna plantada (ruido, como avisa la advertencia) |
| Detector contra lo plantado | créditos de otros 1.041/1.079 · pérdidas de trabajo 132/132 · cierres 154/154 · trabajos nuevos 197/197 · demandas 132/132 · Fiscalía 34/34 · pensiones 80/84 · mora en lo que tenía 118/159 (muchas, de gente que se puso al día); inventados 2 en total; cambios reales de la semana, aparte |
| Malos sin crédito | 178 de 311 se vieron; 47 escaparon por ponerse al día; 3 sin observar |
| Sesgo | AUC contra lo plantado 0,63 con los desembolsados y 0,70 con todos |
| Motivo principal plantado | el evento está detectado en 76 de 79 |
| Campo sólo del crudo | lo encontró el explorador del crudo (14.11): significativo, 3.º de 3 en "lo que el modelo no vio" |

**La conclusión para la corrida real:** con ~300 créditos la prueba sólo
con lo desembolsado no distingue nada; lo que le da poder es reconsultar a
todas las solicitudes del período.

### 14.11 El explorador del crudo (fase E, 2026-10-04)

La tercera capa plantada (un campo que sólo está en el crudo) no la puede
encontrar Variables, que mira el catálogo. `scripts/explorar-crudo.mjs
--corte=<id>` recorre el crudo del día del análisis de cada persona (nunca
la reconsulta) y guarda en `lab_resultados` (tipo `crudo`):

- **El diccionario**: 52 fuentes, 1.905 campos con su tipo, cobertura,
  vacíos y valores frecuentes. Un valor se muestra si el campo tiene pocos
  distintos y lo comparten 10 personas o más. Los que identifican a alguien
  (nombres, cédulas, direcciones, partes de una demanda) nunca.
- **Las condiciones**: cada campo da varias: lo tiene, cuántos, su valor,
  una fecha anterior al análisis, días hasta el análisis y cada categoría.
  Se miden contra el impago con valor de información y chi cuadrado, y se
  corrige por comparaciones múltiples (Benjamini-Hochberg): con 853
  condiciones distintas, al 5% saldrían ~43 por azar. Las que separan
  exactamente a las mismas personas se cuentan una vez.
- **El universo de cada campo** son las personas cuya fuente contestó
  (`estadoPorFuente`: ok u ok vacío). A quien no se midió no se lo cuenta
  como "no lo tiene".
- **¿El modelo ya lo tenía?** La misma comparación dentro de cada
  recomendación del modelo (Mantel-Haenszel). Si queda la mitad o más del
  efecto (logaritmo de la razón de momios) con p < 0,05, el modelo no lo
  tenía; si queda menos de la mitad, ya lo tenía. Se mide el efecto y no
  una segunda significancia: con otra corrección sobre las 853, la licencia
  plantada (razón 1,80 cruda y 1,68 ajustada, casi intacta) salía como "el
  modelo la tenía" sólo por falta de casos. Sólo para condiciones sí o no.
- **¿Lo lee la estructura?** El nombre del campo aparece en
  `supabase/functions/_shared/` (sin el marco ni el pedido al modelo). "Sí"
  es aproximado; "no" es seguro: nadie lo lee.

Resultado sobre el corte `4e18ca83-…` (2.528 personas, 211 malos):

| Qué | Resultado |
|---|---|
| Condiciones | 2.378 probadas, 853 distintas, 84 significativas |
| Arriba de todo | calificación E del buró, perfil interno "MALO", saldo en mora: lo que el modelo ya lee |
| El modelo ya lo tenía | lista negra (queda el 26% del efecto), "mal pagador" en bases internas (32%) |
| **Lo que el modelo no vio** (significativo, no lo tenía, la estructura no lo lee) | 3: fax del empleador en el IESS (protege: 5,1% contra 9,4%), operaciones "CDC" en cooperativas (11,9% contra 7,4%) y **la licencia vencida plantada** (243 personas, 13,2% contra 7,8%; queda el 86% del efecto) |

La calificación de la simulación (104) lo dice sola: el campo plantado,
significativo y 3.º de 3. Los otros dos son de la data real y nadie los
plantó: candidatos a mirar, no a usar (se validan en un corte posterior).

Falta: el ajuste para un valor numérico (hoy sólo sí/no). Los valores de
una persona y la trazabilidad crudo → estructura → modelo están desde la
sección 15 (la página del caso).

---

## 15. Las pantallas del negocio (fases B a F, 2026-10-04)

El mapa, pantalla por pantalla, está en `docs/laboratorio-pantallas.md`.
Acá, lo que cambió de método y lo que se midió.

### 15.1 Dónde corre cada cosa

- **En la base** (funciones `lab_*`), lo que se guarda y se cita en un
  informe: desempeño, matriz, variables (IV y WoE), motivos, calificación,
  estabilidad del puntaje, más la cobertura de la estructura, el centro de
  datos, el volumen de análisis y la calidad de una carga (107, 109).
- **En el navegador**, sobre el corte congelado, la estadística
  interactiva (decisión 2): `src/lib/estadistica.js` (las distribuciones
  de los valores p son de jStat) y `src/lib/analisis{Retrospectivo,
  Estadistico,Profundo}.js`, sin React, para poder probarlos en Node.
- **En guiones locales**, lo pesado: `scripts/explorar-crudo.mjs` y
  `scripts/analisis-pesado.mjs` (bosque aleatorio con SHAP, K-medias,
  PCA). La decisión decía Python; en la máquina del negocio no hay, y va
  con Node con el mismo patrón (guardan en `lab_resultados` y la pantalla
  sólo muestra).

### 15.2 Cómo se prueba

- `scripts/probar-estadistica.mjs`: valores publicados (Excel, Fisher,
  scipy, la t de Welch contra la densidad integrada), identidades entre
  pruebas, SHAP (base + suma = predicción, error 2·10⁻¹⁶), K-medias y PCA
  con respuesta conocida, y la base (AUC, KS e IV iguales).
- `scripts/probar-pantallas-laboratorio.mjs`: el cálculo de cada pestaña
  sobre los cortes reales, con las mismas filas que baja el navegador:
  conteos que suman, AUC igual a `lab_auc`, IV igual a
  `lab_calcular_variables`, los motivos de cada malo, la entrada al modelo
  de un análisis real, el mapeo de columnas con un archivo armado en
  memoria y el intérprete de fórmulas.

### 15.3 Lo que se corrigió en el camino

- **Los tramos de Variables partían los empates (106).** Con cuartiles por
  posición, las 1.384 personas con 24 meses de aporte quedaban en tres
  tramos "24"; con las 296 operaciones del ciclo daban 11,7%, 1,7% y 1,7%
  de malos y el IV subía a 0,459 sin señal. La regla nueva (un valor con
  un cuarto o más de la gente va en su tramo; el resto de los tramos se
  reparte en los segmentos entre esos valores) es la misma en la base y en
  el navegador: el IV coincide con diferencia 0,0000. Recalculado, "meses
  con aporte en 24" sigue 6.ª (IV 0,168), ahora por la gradación real (de
  1 a 19 meses, 17% de malos; 24 meses, 6%).
- **Una curva de cosechas sin la fecha del impago miente.** En las
  solicitudes, 191 de 211 malos no tienen fecha (el buró no la da); sin
  ellos y con todos los buenos, la caída acumulada daba 0,9% en vez de
  ~8%. Con más del 10% de los malos sin fecha la pestaña no dibuja.
- **"El modelo ya lo tenía"** se decide por el efecto que sobrevive dentro
  de cada recomendación, no por una segunda significancia (14.11).
- **"El riesgo da la vuelta"** pide que sean significativas la subida y la
  bajada; con "las tasas difieren", toda variable monótona con ruido
  salía marcada.

### 15.4 Lo que dicen los cortes (sintéticos)

| Qué | Resultado |
|---|---|
| Calibración (sintética, mitades por fecha) | probabilidad = 1 / (1 + e^-(3,676 − 0,00727 × puntaje)); Brier 0,0794 contra 0,0930 de la tasa promedio; ECE 1,8%; Hosmer-Lemeshow p 0,31 |
| Explorador de significancia (ciclo, solicitudes) | 22 variables significativas; la única candidata a dato nuevo es "meses con aporte en 24" (la plantada que el modelo no recibe) |
| Bosque aleatorio (ciclo, solicitudes) | AUC 0,698 en la mitad de prueba contra 0,669 del motor; "meses con aporte en 24" entre las 10 de más SHAP |
| Bosque aleatorio (sintética) | 0,715 contra 0,741 del motor (el puntaje sintético sale de la regla plantada) |
| K-medias (ciclo) | silueta 0,13: la cartera no se parte en grupos; aun así aparecen 26 personas con el buró muy malo (50% de malos) y los jubilados (4,5%) |
| Taller (ciclo) | "aportó en parte de los 24 meses" reconstruye la señal plantada (IV 0,105) |

### 15.5 Lo que falta

- Ver todo con sesión de admin.
- Los hallazgos críticos en el informe. El negocio decidió el 2026-10-04
  que crítico es todo resultado relevante y significativo de los análisis,
  y que va en el Informe de Desempeño del Modelo; falta juntarlo de todas
  las pestañas (docs/pendientes.md, 0a). "Comentarios institucionales"
  sigue sin decidir.
- El ajuste por la recomendación para un valor numérico en el explorador
  del crudo; el origen de cada campo de la estructura como dato; "no
  consultado" contra "no tiene" en Faltantes (el corte no congela la
  disponibilidad por tema); registrar los informes exportados y la
  revisión manual de la conciliación.
- La provincia de residencia (está en el crudo, no en el perfil) y la
  comparación entre modelos (fase 7, con costo).

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
