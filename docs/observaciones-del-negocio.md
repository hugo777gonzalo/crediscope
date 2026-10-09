# Observaciones del negocio sobre los análisis

Registro vivo de lo que el negocio encuentra al revisar los análisis del
modelo. **Estado: en pausa desde el 2026-10-09** (decisión del negocio: se
cierra por el momento el frente de ajustar el modelo). Nada de esto está
decidido: se junta todo, se mide, y recién con el cuadro completo se decide
qué se ajusta (marco, perfil, controles o pantallas).

**Para retomar:** volver a correr `node scripts/detectar-atipicos.mjs` (los
números de abajo envejecen con cada análisis nuevo), pedirle al negocio lo
que encontró en el Excel de detectores y seguir con "Pendiente de esta
revisión", al final. Ningún cambio de marco, perfil ni bloqueos se hizo por
esta revisión.

Cada observación dice qué vio el negocio, qué se midió en la base, la causa
probable y las opciones, sin elegir. Los casos se nombran por el **id del
análisis** (`analysis_results.id`), nunca por la cédula: el repositorio es
público. Los números son del 2026-10-07; antes de actuar, volver a medirlos.

## Base de la medición

Último análisis de cada persona con marco-v28 (Sonnet 5.5): **205 personas**.

| Recomendación | Personas | Score (mín.–mediana–máx.) |
|---|---|---|
| Aprobar | 49 (24%) | 745–815–905 |
| Revisar | 146 (71%) | 290–640–800 |
| Negar (modelo) | 1 | 120 |
| Negar (control de bloqueo) | 9 | 1 |

Los números que vio el negocio (291 personas: 50 aprobar, 151 revisar, 1
observar, 12 negar, 77 bloqueos) salen de las tarjetas de **Solicitudes ›
Bandeja**, y sumarlas cuenta gente dos veces:

- Las tarjetas de recomendación muestran el último análisis de cada persona
  **con cualquier marco** (214 personas: 205 con v28 y 9 con marcos viejos;
  de ahí sale el "observar", que es de marco-v14).
- "Con bloqueo" cuenta los **perfiles** bloqueados, tengan análisis o no:
  77, de los cuales 67 nunca se analizaron y 10 ya están dentro de "Negar".

La tasa del modelo es la de la tabla de arriba, no 50 de 291. Que la tarjeta
"Con bloqueo" se superponga con las demás sin decirlo es en sí una
observación de la pantalla.

---

## O-1. El modelo aprueba poco y manda casi todo a revisar

**Lo que vio el negocio:** la tasa de aprobación es muy baja y la de revisar
muy alta: el modelo no se arriesga.

**Lo medido (las 196 con veredicto del modelo):**

- **52 "revisar" tienen indicador de riesgo "bajo"**, y 39 de ellas además
  historial "excelente". El propio modelo dice que el riesgo es bajo y el
  pago excelente, y aun así no aprueba.
- Los scores se pisan: "revisar" llega a 800 y "aprobar" empieza en 745.
- **El ingreso decide la recomendación**, más que el comportamiento de pago:

  | Estado del ingreso | Aprobar | Revisar |
  |---|---|---|
  | Confirmado por un tercero | 45 | 48 |
  | Por confirmar | 4 | 95 |
  | Sin determinar | 0 | 3 (+1 negar) |

  | Perfil laboral | Aprobar | Revisar |
  |---|---|---|
  | Dependiente | 24 | 19 |
  | Dependiente con actividad propia | 23 | 37 |
  | Independiente | 1 | 54 |
  | Independiente con empleados | 0 | 23 |
  | Afiliado voluntario | 0 | 4 |
  | Jubilado | 1 | 5 |

  Un independiente se aprueba 1 de cada 55 veces. En Ecuador la mitad o más
  de la gente trabaja por su cuenta.

**Causa probable (en el marco, sección RECOMENDACIÓN):** "aprobar" exige que
"la capacidad y el comportamiento de pago están suficientemente evidenciados",
pero la misma sección le prohíbe al modelo analizar capacidad ("lo resuelve el
análisis económico de la entidad"). Para quien no tiene un ingreso confirmado
por un tercero, la capacidad nunca queda evidenciada, así que nunca puede
aprobar: la regla lo manda a revisar por diseño, no por riesgo.

**Opciones (sin decidir):**

1. Separar en la regla de "aprobar" el comportamiento de la capacidad: con
   buen comportamiento y sin señales negativas, aprobar y dejar la capacidad
   como validación del análisis económico (una acción sugerida, no un motivo
   para revisar). Es versión nueva del marco.
2. Darle al modelo evidencia indirecta de capacidad que ya tenemos: créditos
   vigentes pagados al día (una entidad ya evaluó su capacidad y le prestó),
   cuotas que viene pagando, patrimonio, escala del negocio (ver O-5).
3. Que la recomendación salga del score con umbrales (p. ej. aprobar desde
   X), y el modelo sólo pueda bajarla con un motivo nombrado. Pide definir
   los umbrales con el Laboratorio.
4. Medir antes de cambiar: re-analizar con la regla nueva sólo las 146
   "revisar" (con autorización; a la tarifa del lote de 200, que costó
   USD 3,55, serían unos USD 2,60) y ver cuántas pasan a aprobar y con qué
   perfil.

**"Observar":** ya se retiró en marco-v27 (2026-10-03). El único "observar"
que aparece es un análisis viejo con marco-v14; con v28 el modelo no puede
devolverlo (el esquema JSON no lo admite).

---

## O-2. Los bloqueos: cuáles niegan y cuáles deberían ser una advertencia

**Lo que vio el negocio:** revisar los motivos de bloqueo para separar los
que justifican negar de los que son una advertencia (homónimos, PEP), que
podrían ir a revisar o incluso aprobar si el resto lo respalda.

**Lo medido (77 perfiles bloqueados del Universo):**

| Motivo bloqueante | Personas | Qué es en realidad |
|---|---|---|
| Lista negra interna de Novadata | 40 | La lista de malos pagadores de la financiera de Novadata (Novacredit), no una lista de cumplimiento. 39 dicen "Mal Pagador / Reportado por Legal" en etapa prejudicial, judicial o extrajudicial (3 de ellos con pagos o abonos registrados); 1 es fraude documental (IVA alterados). La cédula coincide en los 40. 39 son de 2026. |
| Delito de seguridad (denuncias como acusado) | 24 | Narcotráfico 8, extorsión 3, armas 3, lavado 2-3, asociación ilícita, delincuencia organizada, trata. |
| Listas de control (OFAC / providencias) | 14 | **Los 40 registros OFAC (10 personas) no traen cédula**: la coincidencia es sólo por nombre, igual que un homónimo. Las providencias (5) son certificaciones o retenciones pedidas por Fiscalía en investigaciones (lavado, estafa, peculado). |
| Listas internas de control | 5 | OFAC/CONSEP/providencias de las bases internas. |
| Fallecido | 4 | Posible suplantación. |

71 de los 77 tienen un solo motivo bloqueante.

**Homónimos y PEP ya no bloquean** (decisión anterior, en
`controles-bloqueo.ts`): hay 49 personas con homónimo y 39 PEP que no están
bloqueadas; el modelo los recibe como dato.

**Lo que no se guarda:** con un bloqueo, la recomendación y el score del
modelo se pisan (negar, 1) y lo que el modelo habría dicho se pierde. No se
puede saber, sin volver a correrlo, qué habría recomendado en esos 77.

**Opciones (sin decidir):**

1. **OFAC sin cédula → advertencia**, como el homónimo: revisar con
   verificación de identidad, no negar.
2. **Lista negra de Novacredit → dato de comportamiento**, no bloqueo: es
   una mora grave con una entidad (el modelo ya negaría ante cobro judicial
   vigente) y deja ver si está pagando. El fraude documental sí bloquea.
   Requiere distinguir el tipo por el texto de observaciones.
3. Guardar siempre lo que dijo el modelo aunque haya bloqueo (dos columnas
   más), para medir cuánto cambia cada regla de bloqueo.
4. Providencias: separar "certificación" (pedido de información) de
   "retención"; confirmar si el implicado es la persona.

---

## O-3. Demandas viejas que pesan como si fueran de hoy

**Lo que vio el negocio:** hay demandas y procesos muy antiguos que inciden
en el resultado. Un caso (análisis `84d225ec-0b64-432b-9e11-013c1f2293f3`,
marco anterior a v28): una demanda por cheque fuera de plazo de 2016 que el
modelo pidió validar. Como no sabemos si el juicio terminó ni cómo, ¿cómo
hacer que no pese tanto, como el buró, que mira los últimos 2 o 3 años?

**Lo medido (las 200 de las 205 con crudo local, demandas como demandado):**

| Antigüedad | De cobro | Otras |
|---|---|---|
| Menos de 2 años | 14 | 23 |
| 2 a 3 años | 5 | 17 |
| 3 a 5 años | 13 | 23 |
| 5 a 10 años | 35 | 80 |
| Más de 10 años | 40 | 171 |

- **70% de las demandas de cobro y 80% de las otras tienen más de 5 años.**
- De las 74 personas en "revisar" con demandas, en **44 la más reciente
  tiene más de 5 años**, y el modelo la nombra en 29 de ellas.
- Entre aprobar y revisar, con demandas se aprueba 10 de 84 (12%); sin demandas, 37 de 106 (35%).

**Causa:** ya estaba anotada en `pendientes.md` (sección 3, diferida por el
negocio el 2026-09-29): el perfil dice cuántas demandas y de qué tipo, pero
no de cuándo. La fecha está en el crudo (`demanda.fecha`), completa en todas
las medidas.

**Opciones (sin decidir):**

1. Llevar la fecha al perfil: por categoría, cuántas en los últimos 3 años y
   la fecha de la más reciente (estructura nueva + marco nuevo).
2. Regla en el marco: una demanda de más de N años, sin otra señal, se
   menciona como antecedente y no mueve la recomendación (como el buró).
3. Que las de más de N años no lleguen al modelo. Más simple, pero esconde
   un patrón (muchas demandas viejas seguidas de nuevas).

---

## O-4. Una calificación B2 leída como "sin atraso grave"

**Caso:** análisis `4f41141c-f27e-49c2-badd-afa1cc5583a4`. Bancos con
calificaciones B2 y A2; el modelo puso como **positivo** "calificación en
bancos sin atraso grave… sin saldo vencido". La recomendación final fue negar
(score 120) por siete demandas de cobro recientes (2025-2026) y un atraso en
cooperativas, así que el veredicto no cambia; lo que está mal es la lectura
del buró.

**Lo medido:** en el crudo, la operación B2 tiene todo el saldo por vencer y
cero en cada columna de atraso (vencido, no devenga, judicial, castigo). El
perfil le dijo al modelo `peorCalificacionRiesgo: B2` junto con
`deudaEnAtraso: 0`, y no le dijo que eso es contradictorio:
`operacionesEnAtrasoSinMonto` sólo cuenta operaciones con deuda total en
cero, y esta tiene saldo por vencer. El modelo resolvió la contradicción a
favor del saldo.

En toda la cartera (2.475 personas con buró): **53 operaciones calificadas
B1 a E sin ningún monto en atraso** (B1 15, B2 13, C1 16, C2 4, E 5), además
de 255 A2 y 118 A3 (que son atrasos de pocos días y es normal que no traigan
vencido).

**Causa probable:** de nuestro lado, que el perfil no marque "calificada en
atraso sin monto vencido" cuando hay saldo por vencer. Del lado del dato, no
sabemos si en esas filas la calificación refleja un atraso vigente cuyo
dividendo no aparece separado, o un atraso reciente ya regularizado.

**Opciones (sin decidir):**

1. Contar en `operacionesEnAtrasoSinMonto` (o un campo nuevo) toda operación
   B1-E sin monto en atraso, tenga o no saldo por vencer.
2. Darle al marco la escala en días (A1 al día … E más de N días) para que
   la calificación pese por sí sola aunque el monto no venga.
3. Preguntarle a Novadata qué significa una B2 con todo por vencer.

---

## O-5. Independiente con crédito previo: la capacidad ya la evaluó otro

**Caso:** análisis `8b28ca58-403f-41a7-9af4-a0f895a861fd`, "revisar" (480).
Banco A1, cooperativa al día, Excelente Pagador en Novadata. Pesan: una
demanda de cobro de pagaré de 2024, deuda alta frente a un ingreso al IESS
que es el Ingreso Mínimo SBU y que está Por confirmar (afiliación
voluntaria).

**Lo que vio el negocio:** pesa demasiado el ingreso que no se puede
determinar. La persona ya tiene créditos importantes que paga al día, con
una cuota mensual considerable: alguien ya evaluó y comprobó su capacidad.

**Lo medido:** es el patrón de O-1 (independientes y afiliados voluntarios
casi nunca se aprueban). Dos cosas del caso para verificar en nuestros datos:

- El modelo dice que el empleo actual como vendedora (8 meses) no concuerda
  con la afiliación voluntaria ni con la continuidad laboral no vigente. Hay
  que ver si es una inconsistencia real o una lectura nuestra del IESS.
- El modelo sospecha que el crédito interno de Novadata y la operación del
  banco son la misma deuda contada dos veces. Si pasa seguido, infla la
  deuda total de mucha gente.

**Opción:** la 2 de O-1 (crédito vigente pagado al día como evidencia de
capacidad).

---

## Cómo encontrar casos atípicos sin revisarlos uno por uno

`scripts/detectar-atipicos.mjs` (2026-10-07). Cruza lo que escribió el
modelo, lo que leyó (`mensaje_al_modelo`) y el crudo del día del análisis
(desde Storage), sin llamar al modelo. Deja un Excel en `research/` (fuera del
repositorio: lleva cédulas) con una hoja por detector, una de casos ordenada
por cuántos detectores se encienden y una que explica cómo leerlo.

Decisiones del negocio para la primera versión: Excel local, población v28
más los bloqueados sin análisis (éstos sólo para los detectores de bloqueos),
demanda vieja desde **2 años**, y los detectores de texto incluidos pero
marcados "a confirmar".

Primera corrida (205 análisis v28 + 68 bloqueados sin él; crudo de 269, 4 sin
crudo y contados como "no medido"):

| Familia | Detector | Tipo | Casos |
|---|---|---|---|
| A. Coherencia | Revisar sin riesgo | exacto | 52 |
| A. Coherencia | Score fuera de su recomendación | exacto | 36 |
| B. Texto contra dato | Positivo que contradice el dato | a confirmar | 8 |
| B. Texto contra dato | Monto que no está en el perfil | a confirmar | 0 |
| C. Reglas que faltan | Demanda de más de 2 años que pesa | exacto | 56 |
| C. Reglas que faltan | Revisar sólo por el ingreso | exacto | 63 |
| C. Reglas que faltan | Capacidad ya probada (deuda al día ≥ USD 5.000) | exacto | 74 |
| D. Bloqueos dudosos | OFAC sin cédula | exacto | 10 |
| D. Bloqueos dudosos | Lista negra por mal pagador | exacto | 39 |
| D. Bloqueos dudosos | Providencia que es sólo certificación | a confirmar | 4 |
| D. Bloqueos dudosos | **Bloqueo sólo por motivos dudosos** | exacto | **48 de 77** |
| E. Datos raros | Calificación B1-E sin monto en atraso | exacto | 5 |
| E. Datos raros | Saldo con Novadata igual a otra deuda | a confirmar | 69 |
| E. Datos raros | Empleo actual y aporte sin RUC | a confirmar | 4 |

222 de las 273 personas encienden al menos uno; 59 encienden tres o más (la
hoja Casos las pone primero).

Lo que la corrida agregó a lo que ya se sabía:

- **El modelo no inventa montos.** Todo monto que escribe está en lo que leyó
  o es un redondeo declarado ("ronda los", "supera los"). La primera versión
  marcaba "$116 mil" como $116 y montos de renta que vienen dentro de un texto
  del perfil; corregido.
- **El saldo con Novadata coincide con otra deuda en 69 personas, y en 68 es
  una operación del Banco Internacional.** Todo indica que el crédito de Novacredit se reporta en el
  buró como de ese banco: es la misma deuda vista dos veces. La deuda total
  del perfil no la suma dos veces (no incluye el saldo interno), pero el
  modelo puede leerlas como dos créditos (lo sospechó en el caso de O-5).
- **48 de los 77 bloqueos se sostienen sólo en motivos dudosos** (mal pagador
  de Novacredit, OFAC sin cédula, providencias de certificación): ver O-2.
- El caso de O-4 no es único: hay 8 positivos que dicen "sin atraso" con una
  calificación B1-E o mora en la misma fuente. Dos de ellos sólo dicen "la
  mejor es A1", que es cierto: por eso son "a confirmar".

Para correrlo de nuevo (después de un lote, o con otro umbral):
`node scripts/detectar-atipicos.mjs [--anios=2] [--capacidad=5000]`.
Cada observación nueva del negocio que se repite se vuelve un detector.

Un segundo paso, con costo y sólo con autorización: pedirle a un modelo que
audite cada análisis contra su perfil y quedarse con lo que marca. Con el
monto inventado en 0, hoy no parece necesario.

## Pendiente de esta revisión

- Seguir sumando observaciones del negocio aquí; el negocio revisa el Excel
  de detectores empezando por la hoja Casos.
- Ajustar los detectores "a confirmar" con lo que salga de esa revisión.
- Con todo levantado, decidir qué cambia y en qué orden: varias opciones
  tocan el marco (versión nueva con su fila en `scoring_rules_versions`) y
  otras el perfil (estructura nueva y recálculo).
