# La cadena, capa por capa

Un dato de una persona pasa por estas capas, de arriba hacia abajo. Para encontrar la
causa de un error se baja desde lo que vio el negocio hasta la primera capa donde el dato
ya está mal. Por cada capa: dónde vive el dato, cómo se mira y qué errores ya salieron de
ahí (con sus detectores).

## 1. La fuente

**Proveedor_Info_1.** Lo que contestó cada fuente está en
`client_profiles.estado_por_fuente` (`ok`, `ok_vacio`, `faltante`, `error`,
`deshabilitado`), y el crudo, en el depósito (`crudo_ruta`) y en el respaldo de
`research/proveedor-info-1-raw-2026-10-03/`. Se lee sólo con `leerCrudo()`
(`scripts/_comun/crudo-del-ultimo-perfil.mjs`), porque traduce una clave que el
respaldo conserva con el nombre anterior. `scripts/explorar-crudo.mjs` lo recorre.

**Equifax.** La respuesta pagada está en `consultas_equifax.respuesta_cruda`, sin tocar.
Las tablas que salen de ella son `equifax_*` (126: operaciones, historia mensual, resumen,
scores...). La estructura está en `consultas_equifax.estructura`. Sólo unas cien consultas
tienen tablas. Las 3.542 migradas de AWS no las tienen, y `cargar-tablas-equifax.mjs` sin
filtro las derivaría todas y llenaría la base (techo del plan Free).

Lo que ya salió de esta capa:
- **Una caída de la fuente analizada como si nada.** En c-79e1ac23 (2026-10-31), 41 de 52
  fuentes dieron error y el análisis salió igual, sin un hipotecario del BIESS. Hoy lo
  frena `calidad-de-la-consulta.ts`. Detectores: `analisis-con-obligatoria-sin-respuesta`
  y `consulta-incompleta-sin-reconsultar`.
- **Un corte viejo.** El retail de Proveedor_Info_1 viene con corte 31/07/2025 en 490 de
  490 personas (c-82cc2afc). Detector: `retail-con-corte-viejo`.
- **Lo que la fuente no trae.** Proveedor_Info_1 no trae los días de mora de los bancos,
  la historia mensual ni el sector comercial; Equifax sí (c-3b26308e).

## 2. La estructura estandarizada

Vive en `client_profiles.standard_profile` y `structure_version`, y la arma
`process.ts` (`PROCESS_VERSION`). Para reproducir un perfil:
`buildStandardProfile(raw, cedula, corte)`, con el corte vigente de ese día.
`recalcular-grupos.mjs --seco` dice si lo guardado se reproduce desde el crudo.

Lo que ya salió de esta capa:
- **Una fecha centinela leída como dato.** Una pasantía de 2019 con salida `1900-01-01`
  quedaba como cargo vigente (c-5ee429cc). Detector: `cargo-vigente-sin-aporte-vigente`.
- **Dos reglas de vigencia para el mismo dato.** El mecanizado aceptaba un empleo de
  hasta tres meses y los ingresos exigían el corte: 17 personas que dejaron de aportar
  seguían con cargo vigente (c-d4625b8b, corregido en v19). El mismo detector.
- **Una marca que contradice a su conteo.** 9 préstamos del BIESS con
  `tieneCreditoIessBiess=false` (c-82cc2afc, corregido en v16). Detector:
  `prestamos-biess-sin-marcar`.
- **Una regla demasiado estrecha.** El RUC depurado se volvía neutro sólo si la actividad
  era de relación de dependencia: 17 personas. Con la regla nueva, «DEPURACION» del SRI,
  son 169 (v18, 2026-11-05).
- **Perfiles atrasados después de un cambio.** Detector: `perfil-con-estructura-atrasada`.

## 3. El perfil de ingresos

Vive en `standard_profile.fuentesIngreso`: `fuentes[]` con `montoMensualReportado` y
`vigenteAlCorte`, y `pisoIngresoMensualReportado` (la suma de las vigentes, que en
pantalla es el «ingreso reportado al IESS»). También están las columnas `fuente_*` de
`client_profiles`. La regla del Ingreso Mínimo SBU es `esIngresoMinimoSbu()`.

Lo que ya salió de esta capa:
- **Un máximo que no es el máximo.** El «salario más alto» salía de un empleo de 2018 y
  quedaba muy por debajo del ingreso de hoy (c-82cc2afc, corregido en v17). Detector:
  `salario-mas-alto-bajo-un-empleo-vigente`.
- **Una suma sin sumandos.** Detector: `ingreso-reportado-sin-fuente-vigente`.
- Sin corregir: la antigüedad en el empleo cuenta hasta el día 1 del último mes: c-82cc2afc sale
  con 1 mes teniendo 3 aportes.

## 4. El predictor de ingresos

Las estimaciones están en `estimaciones_de_ingreso` (`valor_central`, `minimo_90`,
`variables`, `sin_dato`) y los modelos, en `modelos_de_ingreso`. La prueba en sombra es
`sombra-predictor-ingresos.mjs` y la paridad de variables,
`probar-paridad-variables-de-ingreso.mjs`. Al 2026-11-05 no hay ninguna estimación: el
detector `estimacion-lejos-del-reportado` queda «no medido» hasta la primera.

## 5. Lo que lee el modelo

Lo que leyó cada análisis está en `analysis_results.mensaje_al_modelo`, y
`validar-perfil-del-modelo.mjs` lo valida sin llamar al modelo. Si el perfil está bien y
el modelo leyó otra cosa, el error está en `perfil-del-modelo.ts`.

## 6. La respuesta del modelo

Está en `analysis_results`: `narrative_summary`, `positives`, `negatives`,
`missing_info`, `crediscope_score`, `rules_version`. `detectar-atipicos.mjs` la cruza con
lo que leyó y con el crudo.

Lo que ya salió de esta capa:
- **Una calificación mal leída.** «A1/A2 sin atraso», cuando A2 ya son días de mora
  (c-82cc2afc). marco-v32 lo definió, pero los análisis anteriores siguen en la bandeja.
  Detector: `atraso-leido-como-sin-atraso`.
- **Una frase que no se entiende.** «Nadie miró», en lugar de decir que no se pudo obtener
  la información (c-79e1ac23). Detector: `frase-retirada-en-el-analisis`.

## 7. La pantalla

Si el dato está bien en la base y mal en la pantalla, el error es de la pantalla: la
pantalla de Equifax omitía la suspensión del RUC que las dos fuentes traían
(c-79e1ac23). Se pasa a `revision-ux` y se verifica en el navegador.

## Diferencias legítimas entre Proveedor_Info_1 y Equifax

Antes de llamar error a una diferencia entre las dos fuentes, descartar estas. Todas se
midieron el 2026-10-31.

| Diferencia | Caso | Qué la explica |
|---|---|---|
| Una deuda está en una y no en la otra | c-b980f5b2, c-79f1a4ae | La operación es posterior al corte de la otra fuente |
| Un «banco» de Equifax no está en el buró de Proveedor_Info_1 | c-23474215 | Es el BIESS, que Proveedor_Info_1 trae en otra fuente (quirografario o hipotecario) |
| Una tarjeta nueva en una sola | c-23474215 | Se abrió después del corte de la otra |
| Menos filas en Proveedor_Info_1 (12 contra 15) | c-3b26308e | Proveedor_Info_1 agrupa por entidad, tipo y calificación |
| Falta una deuda de codeudor | c-3b26308e | Equifax separa los roles (titular, codeudor, garante) |
| Comercial castigado sólo en Equifax | c-acdc2297 | El retail de Proveedor_Info_1 no trae castigos viejos |
| Mismo banco, mismo corte, saldo distinto | 3 de 23 | Sin explicar: entre 1,5% y 2,7%, todos con atraso |
| Cortes distintos | unas 60 personas | Cada fuente actualiza en su mes: comparar sólo con el mismo corte |
| RUC activo en Equifax e inactivo en el perfil | c-0be1e991, c-74997fb7 | No es legítima: el SRI de Proveedor_Info_1 venía atrasado. No traía el reinicio de 2025 y sumaba una cancelación que el SRI ya no muestra. Lo confirmó el negocio en el SRI el 2026-11-05. Ante una duda del RUC, el SRI decide |

Si la diferencia no está en la tabla y se repite, es un hallazgo: un detector nuevo en la
capa 5 (`cruce`) y una fila nueva acá cuando se explique.
