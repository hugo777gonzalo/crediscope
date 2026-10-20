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
   independiente ya viene sumado desde sus movimientos marcados (`ingreso_independiente.estado`):
   la declaración de IVA no suma si está desmarcada. Para un dependiente o público es el ingreso
   del IESS recuperado de Novadata (observación «RECUPERADO NOVADATA»). El total de una persona
   es la suma de sus filas activas (`estado`) con monto mayor a cero. Los montos tienen 3 decimales
   y la pantalla del analista los redondea a 2. Se comprobó contra tres capturas de pantalla de un
   requerimiento: coinciden la actividad principal, la secundaria y el total.
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
5. **La unidad del predictor es mensual en USD.** Mediana 1.343; el máximo es 20.000 en todos los
   años (1,7% en el tope), así que no se ve el cambio de techo a 10.000 que menciona
   `docs/investigacion-predictor-de-ingresos.md`. Contra el salario del IESS (115.212 consultas con
   aporte en los 3 meses previos): razón mediana 1,52 y correlación de logaritmos 0,31. Sobreestima
   a quien gana menos de 470 (razón 3,37) y subestima a quien gana más de 5.000 (0,58).
6. **Cobertura** (de 389.012 consultas con predictor, 278.504 personas, 2021-03 a 2026-10):
   96% se enlaza con un requerimiento; respuesta comercial 39%; `perfil_final` 34%; ingreso validado
   48%; IESS 34%; cantón de domicilio 53%; crédito mayor aprobado 86%.
7. **Geografía**: la agencia del requerimiento trae cantón y provincia (93% de las consultas); la
   persona tiene como máximo un domicilio y un trabajo (`persona_direccion`, tipos 1 y 2), con
   cantón en el 53% y el 81% de las consultas.
8. **Lotes masivos**: `persona_masivo.ingresos_verificados` casi no tiene datos (1.005 de 38.354);
   el ingreso verificado está en `reporte_calificacion_masivo` (13.408 de 13.440). El predictor del
   reporte coincide con el de Equifax en el 98%. Qué significa «verificado» ahí no está confirmado.

## 4. Lo que se extrajo (fuera de git, en `research/ingresos-aws/`)

| Archivo | Qué trae |
|---|---|
| `ingresos_por_persona_requerimiento.csv` | 82.417 filas, una por persona y requerimiento, con respuesta OK FACTURAR (con y sin condicionado y SD) o APROBADO: ingreso validado, actividad, geografía, `perfil_final`, fechas, predictor |
| `predictor_equifax_por_consulta.csv` | 389.012 filas, una por consulta a Equifax con predictor: lo anterior más IESS, crédito y deuda de Equifax, demografía y lotes masivos |
| `LEEME-predictor-equifax.md` | Diccionario de columnas, cuidados y lo que no se pudo cerrar |
| `scripts/` | Los guiones de lectura que las generaron |

## 5. Sin confirmar

- Qué mide cada campo de `analisis_credito_sector_financiero` (mca, cmr, cma, reca): el significado
  sale del nombre de la columna.
- Si las tres tablas `detalle_deuda_actual_*` se solapan (la cuota que se suma puede duplicar
  operaciones) y el rol (titular, codeudor, garante) de cada operación.
- Qué es «SD», qué es «verificado» en los lotes y cómo se arma `trabajos_persona_requerimiento.promedio`.
- **Si el contrato con Equifax permite entrenar un modelo propio con sus salidas.** No se revisó.
- Si el usuario de la base es de solo lectura.
