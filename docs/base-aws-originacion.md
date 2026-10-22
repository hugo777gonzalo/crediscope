# La base de originación en AWS (NOVABI)

Mapa de lo que se encontró el 2026-10-20 al leer la base Postgres de producción de
originación (el sistema donde un requerimiento de crédito lleva sus personas, ingresos,
consultas a Equifax y respuestas). **Es una base de Novacredit distinta de las de
CrediScope**: no está en `clientes/directorio.json` y ninguna función ni migración la toca.
Se la leyó con consultas de solo lectura; no se escribió nada. Los conteos son de esa fecha:
volver a medir antes de apoyarse en uno.

No se anotan acá el servidor, las credenciales ni datos de personas. Las extracciones que
salieron de esta base traen identificación y montos reales y viven en `research/ingresos-aws/`
(fuera de git).

## 1. Cómo se entra

- Las credenciales van en `clientes/aws-ingresos.env` (`PGHOST`, `PGPORT`, `PGDATABASE`,
  `PGUSER`, `PGPASSWORD`, `PGSSLMODE`). Está ignorado por git (`clientes/*.env`). Nunca se
  imprime ni se pega en el chat.
- **No se confirmó que el usuario sea de solo lectura.** Por eso toda consulta abre
  `begin read only` y fija `statement_timeout`.
- El cliente de DBeaver de la Microsoft Store guarda su espacio de trabajo en
  `AppData\Local\Packages\DBeaverCorp...\LocalCache\Roaming\DBeaverData\workspace6`, no en
  `AppData\Roaming`. Ahí está `credentials-config.json` (cifrado con la llave fija de DBeaver).
- Los scripts de lectura están en `research/ingresos-aws/scripts/` (fuera de git; ver su
  `LEEME.md`). El esquema es `public`.
- Postgres devuelve `numeric` y `bigint` como texto y `integer` como número: un `Map` por id
  mezcla las dos formas (ver `docs/lecciones.md`, Guiones).

## 2. Cómo se relacionan las tablas

```
requerimiento (id_requerimiento, numero, fecha_creacion, id_agencia, id_historico_respuesta_comercial)
 ├─ persona_requerimiento (id_persona_requerimiento, id_persona, id_tipo_deudor, forma_parte_analisis)
 │    ├─ persona (identificacion)            tipo_deudor: 1 titular, 2 cónyuge, 3 garante, 4 codeudor, 5 y 6 cónyuge de garante y de codeudor
 │    ├─ flujo_efectivo                      un ingreso por fila (principal o secundaria)
 │    │    └─ ingreso_independiente          los movimientos de cada ingreso (cuenta principal, secundaria, declaración de IVA)
 │    ├─ trabajos_persona_requerimiento      historial mensual de salarios del IESS (unos 43,5 millones de filas)
 │    └─ persona_requerimiento_consulta ── consulta_equifax ── resultado_segmentacion (IncomePredictor, scores)
 ├─ historico_respuesta_comercial ── respuesta_comercial     respuesta y perfil_final vigentes
 └─ agencia ── concesionario, canton ── provincia
persona ── persona_natural (fecha_nacimiento, género), persona_direccion ── direccion ── lugar (cantón, provincia)
consulta_equifax ── analisis_credito_sector_financiero, detalle_deuda_actual_reportada_* (rfrsbs, sicomsbs, sbssbs_educativo)
```

## 3. Lo que hay que saber antes de usarla

1. **El ingreso de un requerimiento se suma por actividad.** En `flujo_efectivo`, `ingreso` es
   el ingreso de una actividad (`id_tipo_actividad_economica`: 1 principal, 2 secundaria). Para un
   dependiente o público es el ingreso del IESS recuperado de Novadata (observación «RECUPERADO
   NOVADATA»). El total de una persona es la suma de sus filas activas (`estado`) con monto mayor a
   cero. Los montos tienen 3 decimales y la pantalla del analista los redondea a 2. Se comprobó
   contra tres capturas de pantalla de un requerimiento: coinciden la actividad principal, la
   secundaria y el total. **Cómo se arma el de un independiente está en el punto 9.**
2. **La respuesta comercial vigente está en el histórico, no en `requerimiento`.**
   `requerimiento.id_respuesta_comercial` es un campo viejo: solo trae respuesta hasta diciembre
   de 2021 y esos requerimientos casi no tienen flujo de efectivo. Desde 2022 la respuesta y el
   `perfil_final` están en `historico_respuesta_comercial`, al que apunta
   `requerimiento.id_historico_respuesta_comercial` (es el último registro en 123.707 de
   123.708 casos). `respuesta_modelo` es la del modelo y casi nunca coincide con la comercial.
   El 65% de los requerimientos desde 2022 no tiene histórico: nunca tuvo respuesta.
3. **Criterio del negocio para tomar un dato como confiable:** OK FACTURAR y OK FACTURAR
   CONDICIONADO; APROBADO es opcional y menos confiable (puede que no se haya recogido todo el
   ingreso). Las variantes OK FACTURAR SD y SD CONDICIONADO están inactivas en el catálogo y sus
   titulares tienen ingreso con menos frecuencia (37% sin ingreso validado contra 6% en OK FACTURAR);
   **qué significa «SD» no está confirmado.**
4. **El `IncomePredictor` de Equifax es `resultado_segmentacion.income_predicator`.** Coincide con
   el campo `IncomePredictor` de la respuesta cruda (`consulta_equifax.response_json` desde 2025,
   `response` en XML antes) en 10.000 de 10.000 consultas muestreadas de 2021 a 2026.
   **`indicador_covid.income_predictor` es otro estimador** (escenarios 1 a 6): coincide solo en
   el 76% y suele ser menor (mediana 0,79). Mezclarlos fue la primera pista equivocada.
5. **La unidad del predictor es mensual en USD, pero su comportamiento cambió cinco veces en
   2026.** Mirar el máximo por año lo escondió (una primera versión de este documento decía «20.000
   en todos los años», lo cual era falso). Por fecha de consulta (valor guardado, que es idéntico al
   crudo desde 2025-10-01 en el 100% de las semanas):

   | Tramo | Qué se ve |
   |---|---|
   | Hasta 2026-01-13 | Valores continuos, tope 20.000 (el 2,2% de las consultas), mediana 1.362 |
   | 2026-01-14 y 15 | Solo ceros (902 consultas) |
   | 2026-01-16 a 2026-03-01 | Valores discretos (599 ×1.936, 437 ×1.054, ceros 362), mediana 951 |
   | 2026-03-02 a 2026-04-12 | Tope 10.000; repetidos 1.051, 2.051, 1.501, 701, 2.551; mediana 1.188 |
   | Desde 2026-04-14 | Vuelven valores sobre 10.000 (máximo 15.275, 1.413 consultas); repetidos 490 y 698; mediana 1.369 |

   Según el negocio, desde abril aplica una «corrección» al predictor (tabla de factores por tramos
   del «Ingreso V3»; por ejemplo 10.000 pasa a 15.276). **No se confirmó dónde queda guardado el
   número corregido:** como lo guardado coincide con el crudo, la corrección no está aplicada en
   `resultado_segmentacion` sobre el crudo. Contra el salario del IESS (115.212 consultas con aporte
   en los 3 meses previos, todos los tramos juntos): razón mediana 1,52 y correlación de logaritmos
   0,31. Sobreestima a quien gana menos de 470 (razón 3,37) y subestima a quien gana más de 5.000
   (0,58). **Esos números mezclan regímenes distintos del predictor.**
6. **Cobertura** (de 389.012 consultas con predictor, 278.504 personas, 2021-03 a 2026-10):
   96% se enlaza con un requerimiento; respuesta comercial 39%; `perfil_final` 34%; ingreso validado
   48%; IESS 34%; cantón de domicilio 53%; crédito mayor aprobado 86%.
7. **Geografía**: la agencia del requerimiento trae cantón y provincia (93% de las consultas); la
   persona tiene como máximo un domicilio y un trabajo (`persona_direccion`, tipos 1 y 2), con
   cantón en el 53% y el 81% de las consultas.
8. **Lotes masivos**: `persona_masivo.ingresos_verificados` casi no tiene datos (1.005 de 38.354);
   el ingreso verificado está en `reporte_calificacion_masivo` (13.408 de 13.440). El predictor del
   reporte coincide con el de Equifax en el 98%. Qué significa «verificado» ahí no está confirmado.
9. **Cómo se arma el ingreso «validado» de un independiente** (`ingreso_independiente`, 5 tipos de
   movimiento; medido sobre los flujos activos de independientes):
   - **El 83,5% es solo «INGRESO DECLARADO»** (tipo 4, 122.333 movimientos activos): lo que dijo la
     persona, sin documento. El 15,1% se apoya solo en movimientos bancarios, el 1,1% solo en
     declaración de IVA y el 0,3% mezcla. **«Validado» no significa verificado en la mayoría.**
   - **El monto declarado es redondo a mano:** el 79,7% de esos flujos es múltiplo exacto de 100 y
     el 37,9% de 1.000 (contra 6,3% y 1,4% en los de movimientos bancarios y 2,5% y 0,6% en los
     públicos). 54.437 flujos de independientes llevan la observación «INGRESADO POR INTEGRACIÓN CON
     CONCESIONARIOS».
   - **Un movimiento bancario o de IVA es una fracción de las ventas, no el depósito:** el monto es
     el promedio mensual de ventas o depósitos de `detalle_ingreso_independiente` (mediana de 3
     meses, de 1 a 12) **multiplicado por la rentabilidad de la macroactividad**
     (`macroactividad.rentabilidad`: comercio y servicios generales 0,30; fabricación, agricultura,
     construcción, transporte y telecomunicaciones 0,40; servicios profesionales 0,70; arriendos
     1,00). La razón mediana contra el promedio mensual de ventas es 0,30 en banco y IVA. La
     declaración de IVA semestral queda en 0,067.
   - **Hay ingresos que son el propio predictor.** Las observaciones «PREDICTOR», «PREDICTOR DE
     INGRESOS» y «AJUSTE PREDICTOR» están en unos 6.400 flujos activos. En los de independientes
     (3.766 «predictor» y 426 «ajuste») el ingreso es el predictor ±1 USD en el 41% y el 52%, y
     dentro de 5% en el 49% y el 54%. En los dependientes el analista lo bajó: razón mediana de
     0,50 y 0,35. **Estos flujos no sirven como verdad para entrenar un predictor de ingresos.**
10. **El ingreso validado de un dependiente con fuente IESS es el 90% del `promedio` de Novadata**
    (`trabajos_persona_requerimiento.promedio`): coincide con razón 0,900 en el 75,8% de los 50.472
    casos (72,9% de los dependientes y públicos con historial). **No** es el salario del último mes
    (coincide ±2% en el 1,8%), ni el promedio de 6 meses (2,4%) ni el de 12 (3,1%): cómo arma
    Novadata ese `promedio` no está confirmado. Por eso, contra el último mes del IESS, la razón mediana
    es 0,90. Solo el 66% de los dependientes tiene historial. El IESS llega con 1 a 2 meses de retraso
    (mediana 2): el mes del requerimiento existe en 20 de 52.475 casos, así que «el IESS del mismo
    mes» casi nunca se puede medir. Un mes del historial coincide con el ingreso en solo el 1,3%.
11. **El crédito de un requerimiento** está en `requerimiento.id_simulador` → `simulador` →
    `datos_operacion` (`valor_financiar`, `plazo_operacion`, `cuota_pagar`, `tasa_credito`,
    `entrada_real`) y `datos_concesionario_vehiculo` (`precio_vehiculo`, `anio_vehiculo`, tipo).
    **El `monto`, el `plazo` y la `capacidad_pago` de `resultado_segmentacion` no son los de la
    solicitud**: `monto` coincide con `valor_financiar` en 1 de 41.949 casos (es una simulación de
    referencia). No hay un campo de «facturado» ni de «desembolsado»: lo más cercano es
    `estado_requerimiento` (de los 44.582 OK FACTURAR y OK FACTURAR CONDICIONADO, FINALIZADO 35.597,
    CADUCADO 8.598, VIGENTE 375, NEGADO - ASESOR 12). Que FINALIZADO signifique facturado **no está
    confirmado**. Con ese universo, la cuota sobre el ingreso del hogar tiene mediana 0,16 y percentil
    90 de 0,34; sobre el del titular, 0,44 con ingreso hasta 1.000, 0,28 de 1.000 a 2.000 y 0,14 desde 2.000.

## 4. Lo que se extrajo (fuera de git, en `research/ingresos-aws/`)

| Archivo | Qué trae |
|---|---|
| `ingresos_por_persona_requerimiento.csv` | 82.417 filas, una por persona y requerimiento, con respuesta OK FACTURAR (con y sin condicionado y SD) o APROBADO: ingreso validado, actividad, geografía, `perfil_final`, fechas, predictor |
| `predictor_equifax_por_consulta.csv` | 389.012 filas, una por consulta a Equifax con predictor: lo anterior más IESS, crédito y deuda de Equifax, demografía y lotes masivos |
| `credito_por_requerimiento.csv` | 44.582 requerimientos OK FACTURAR (con y sin condicionado), un titular por requerimiento: monto, plazo, cuota, tasa, vehículo, concesionario, estado y el ingreso validado de titular y cónyuge |
| `iess_mismo_mes.csv` | 79.153 consultas de dependientes y públicos: ingreso validado contra el último mes, los promedios de 6 y 12 meses y el promedio de Novadata, y el mes del IESS que coincide |
| `muestra_respuestas_equifax.jsonl` | 5.001 respuestas crudas de Equifax (467 MB), 1.667 titulares por tramo: hasta 2026-01-13, del 16 de enero al 12 de abril y desde el 14 de abril |
| `LEEME-predictor-equifax.md` | Diccionario de columnas, cuidados y lo que no se pudo cerrar |
| `scripts/` | Los guiones de lectura que las generaron |

## 5. Sin confirmar

- Qué mide cada campo de `analisis_credito_sector_financiero` (mca, cmr, cma, reca): el significado
  sale del nombre de la columna.
- Si las tres tablas `detalle_deuda_actual_*` se solapan (la cuota que se suma puede duplicar
  operaciones) y el rol (titular, codeudor, garante) de cada operación.
- Qué es «SD», qué es «verificado» en los lotes y cómo se arma `trabajos_persona_requerimiento.promedio`.
- Dónde queda guardado el predictor «corregido» desde abril de 2026 (tabla de factores del «Ingreso V3»):
  lo guardado en `resultado_segmentacion` es idéntico al crudo de `consulta_equifax` en todas las semanas
  desde 2025-10-01. Y qué cambió en la salida de Equifax el 2026-01-14 y el 2026-03-02.
- Si el valor de «INGRESO DECLARADO» lo escribe la persona, el asesor o la integración con el concesionario
  (54.437 flujos dicen «INGRESADO POR INTEGRACIÓN CON CONCESIONARIOS»).
- **Si el contrato con Equifax permite entrenar un modelo propio con sus salidas.** No se revisó.
- Si el usuario de la base es de solo lectura.
